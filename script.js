"use strict";

/* ====== STATUS BAR CLOCK ====== */
(function updateClock(){
  const el = document.getElementById('status-time');
  if(el) el.textContent = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  setTimeout(updateClock, 1000);
})();

function updateStatusCwd(cwd){
  const el = document.getElementById('status-cwd');
  const tb = document.querySelector('.title-bar-title');
  let dp = cwd;
  if(dp.startsWith('/home/user')) dp = '~' + dp.slice(10);
  if(!dp) dp = '~';
  if(el) el.textContent = dp;
  if(tb) tb.innerHTML = `user@weblinux <span>${dp}</span> <span>— bash</span>`;
}

/* ====== ANSI PARSER ====== */
const Ansi=(()=>{
  const FG={30:'#6e7681',31:'#ff5c57',32:'#5af78e',33:'#f3f99d',34:'#57c7ff',35:'#c792ea',36:'#9aedfe',37:'#f0f6fc',
    90:'#5a6270',91:'#ff8a85',92:'#7bebb2',93:'#e3c97a',94:'#7bc4ff',95:'#d2a8ff',96:'#79e3f5',97:'#f0f6fc'};
  function toHtml(str){
    if(!str)return'';let o='',fg='',bold=false,rev=false,i=0;
    while(i<str.length){
      if(str[i]==='\x1b'&&str[i+1]==='['){
        let j=i+2,code='';
        while(j<str.length&&!(/[A-Za-z]/).test(str[j])){code+=str[j];j++}
        if(str[j]==='m'){
          const codes=code.split(';').map(Number);
          for(const c of codes){
            if(c===0){if(fg||bold||rev)o+='</span>';fg='';bold=false;rev=false}
            else if(c===1){if(fg||bold||rev)o+='</span>';bold=true;o+=sp(fg,bold,rev)}
            else if(c===7){if(fg||bold||rev)o+='</span>';rev=true;o+=sp(fg,bold,rev)}
            else if((c>=30&&c<=37)||(c>=90&&c<=97)){if(fg||bold||rev)o+='</span>';fg=FG[c]||'';o+=sp(fg,bold,rev)}
          }
        }
        i=j+1;continue;
      }
      if(str[i]==='<')o+='&lt;';else if(str[i]==='>')o+='&gt;';else if(str[i]==='&')o+='&amp;';else o+=str[i];
      i++;
    }
    if(fg||bold||rev)o+='</span>';return o;
  }
  function sp(fg,bold,rev){
    let s='<span style="';
    if(rev)s+='background:var(--text-primary);color:var(--bg-terminal);';else if(fg)s+='color:'+fg+';';
    if(bold)s+='font-weight:700;';
    return s+'">';
  }
  return{toHtml};
})();

/* ====== VFS ====== */
const VFS=(()=>{
  const now=()=>new Date().toISOString();
  function mkN(name,type,o={}){return{name,type,content:o.content||'',children:type==='directory'?{}:null,permissions:o.permissions||(type==='directory'?'drwxr-xr-x':'-rw-r--r--'),owner:o.owner||'user',group:o.group||'user',createdAt:o.createdAt||now(),modifiedAt:o.modifiedAt||now(),size:o.content?o.content.length:(type==='directory'?4096:0)}}
  const root=mkN('/','directory',{owner:'root',group:'root'});
  function _mkdirp(p){const pts=p.split('/').filter(Boolean);let c=root;for(const x of pts){if(!c.children[x])c.children[x]=mkN(x,'directory');c=c.children[x]}return c}
  function _mkfile(p,ct,o={}){const pts=p.split('/').filter(Boolean);const fn=pts.pop();let c=root;for(const x of pts){if(!c.children[x])c.children[x]=mkN(x,'directory');c=c.children[x]}c.children[fn]=mkN(fn,'file',{content:ct,...o});c.children[fn].size=ct.length;return c.children[fn]}
  function resolve(ps,cwd){
    if(!ps)return cwd.split('/').filter(Boolean);
    let n=ps;if(n.startsWith('~'))n='/home/user'+n.slice(1);
    let pts;if(n.startsWith('/'))pts=n.split('/').filter(Boolean);else pts=[...cwd.split('/').filter(Boolean),...n.split('/').filter(Boolean)];
    const r=[];for(const p of pts){if(p==='.')continue;else if(p==='..'){if(r.length)r.pop()}else r.push(p)}return r;
  }
  function absStr(ps,cwd){return'/'+resolve(ps,cwd).join('/')}
  function getN(ps,cwd){const pts=resolve(ps,cwd);let c=root;for(const p of pts){if(!c||c.type!=='directory'||!c.children[p])return null;c=c.children[p]}return c}
  function getPN(ps,cwd){const pts=resolve(ps,cwd);if(!pts.length)return{parent:null,name:'/'};const name=pts.pop();let c=root;for(const p of pts){if(!c||c.type!=='directory'||!c.children[p])return{parent:null,name};c=c.children[p]}return{parent:c,name}}
  function read(ps,cwd){const n=getN(ps,cwd);if(!n||n.type!=='file')return null;return n.content}
  function write(ps,cwd,ct){const{parent:p,name}=getPN(ps,cwd);if(!p)return false;if(p.children[name]&&p.children[name].type==='directory')return false;if(p.children[name]){p.children[name].content=ct;p.children[name].size=ct.length;p.children[name].modifiedAt=now()}else{p.children[name]=mkN(name,'file',{content:ct});p.children[name].size=ct.length}return true}
  function append(ps,cwd,ct){const{parent:p,name}=getPN(ps,cwd);if(!p)return false;if(p.children[name]){if(p.children[name].type==='directory')return false;p.children[name].content+=ct;p.children[name].size=p.children[name].content.length;p.children[name].modifiedAt=now()}else{p.children[name]=mkN(name,'file',{content:ct});p.children[name].size=ct.length}return true}
  function mkdir(ps,cwd){const{parent:p,name}=getPN(ps,cwd);if(!p)return'mkdir: cannot create directory: No such file or directory';if(p.children[name])return`mkdir: cannot create directory '${name}': File exists`;p.children[name]=mkN(name,'directory');return null}
  function rm(ps,cwd,rec=false){const{parent:p,name}=getPN(ps,cwd);if(!p||!p.children[name])return`rm: cannot remove '${ps}': No such file or directory`;if(p.children[name].type==='directory'&&!rec)return`rm: cannot remove '${ps}': Is a directory`;delete p.children[name];return null}
  function cp(src,dst,cwd){
    const sn=getN(src,cwd);if(!sn)return`cp: cannot stat '${src}': No such file or directory`;
    const dn=getN(dst,cwd);const{parent:dp,name:dname}=getPN(dst,cwd);
    function dc(n,nn){const c=mkN(nn||n.name,n.type,{content:n.content,permissions:n.permissions,owner:n.owner,group:n.group});if(n.type==='directory'&&n.children)for(const[k,v]of Object.entries(n.children))c.children[k]=dc(v);c.size=n.size;return c}
    if(dn&&dn.type==='directory')dn.children[sn.name]=dc(sn);else if(dp)dp.children[dname]=dc(sn,dname);else return`cp: target '${dst}': No such file or directory`;return null}
  function mv(src,dst,cwd){
    const{parent:sp,name:sn}=getPN(src,cwd);if(!sp||!sp.children[sn])return`mv: cannot stat '${src}': No such file or directory`;
    const srcN=sp.children[sn];const dn=getN(dst,cwd);const{parent:dp,name:dname}=getPN(dst,cwd);
    if(dn&&dn.type==='directory')dn.children[sn]=srcN;else if(dp){dp.children[dname]=srcN;dp.children[dname].name=dname}else return`mv: target '${dst}': No such file or directory`;
    delete sp.children[sn];return null}
  function findN(sp,cwd,pred){
    const sn=getN(sp,cwd);if(!sn||sn.type!=='directory')return[];const res=[];const pfx=absStr(sp,cwd);
    function walk(n,p){if(pred(n,p))res.push(p);if(n.type==='directory'&&n.children)for(const[k,v]of Object.entries(n.children))walk(v,p==='/'?'/'+k:p+'/'+k)}
    walk(sn,pfx==='/'?'/':pfx);return res}
  function completions(partial,cwd){
    if(!partial){const n=getN('.',cwd);if(!n||n.type!=='directory')return[];return Object.entries(n.children).map(([k,v])=>k+(v.type==='directory'?'/':''))}
    const ls=partial.lastIndexOf('/');let dp,fp;
    if(ls===-1){dp='.';fp=partial}else{dp=partial.substring(0,ls)||'/';fp=partial.substring(ls+1)}
    const dn=getN(dp,cwd);if(!dn||dn.type!=='directory')return[];
    const m=[];for(const[k,v]of Object.entries(dn.children)){if(k.startsWith(fp)){const pfx=ls===-1?'':(dp==='/'?'/':dp+'/');m.push(pfx+k+(v.type==='directory'?'/':''))}}return m}
  return{root,resolve,absStr,getN,getPN,read,write,append,mkdir,rm,cp,mv,findN,completions,_mkdirp,_mkfile,mkN,now};
})();

/* ====== PROCESS MANAGER ====== */
const PM=(()=>{let np=1;const P=[];
  function init(){P.length=0;np=1;add('init','root','S');add('bash','user','R');add('systemd','root','S');add('sshd','root','S');add('cron','root','S');add('dbus-daemon','root','S');add('rsyslogd','root','S')}
  function add(n,u,st){const pid=np++;P.push({pid,name:n,user:u||'user',status:st||'S',cpu:(Math.random()*2).toFixed(1),mem:(Math.random()*3).toFixed(1),vsz:Math.floor(Math.random()*100000+10000),rss:Math.floor(Math.random()*20000+1000),start:'00:'+String(Math.floor(Math.random()*60)).padStart(2,'0')});return pid}
  function kill(pid,sig=15){const i=P.findIndex(p=>p.pid===pid);if(i===-1)return`kill: (${pid}) - No such process`;if(P[i].name==='init'||P[i].name==='bash')return`kill: (${pid}) - Operation not permitted`;if(sig===9)P.splice(i,1);else P[i].status='T';return null}
  function list(){return[...P]}
  init();return{add,kill,list};
})();

/* ====== USER SYSTEM ====== */
const US=(()=>{const db={root:{uid:0,gid:0,home:'/root',shell:'/bin/bash'},user:{uid:1000,gid:1000,home:'/home/user',shell:'/bin/bash'},daemon:{uid:1,gid:1,home:'/usr/sbin',shell:'/usr/sbin/nologin'},nobody:{uid:65534,gid:65534,home:'/nonexistent',shell:'/usr/sbin/nologin'}};
  function addU(n){if(db[n])return`useradd: user '${n}' already exists`;db[n]={uid:1000+Object.keys(db).length,gid:1000+Object.keys(db).length,home:'/home/'+n,shell:'/bin/bash'};VFS._mkdirp('/home/'+n);return null}
  function delU(n){if(!db[n])return`userdel: user '${n}' does not exist`;if(n==='root'||n==='user')return`userdel: cannot remove essential user`;delete db[n];return null}
  function passwd(n){if(!db[n])return`passwd: user '${n}' does not exist`;return`passwd: password updated successfully for ${n}`}
  function getPF(){return Object.entries(db).map(([n,u])=>`${n}:x:${u.uid}:${u.gid}:${n}:${u.home}:${u.shell}`).join('\n')}
  function cur(){return'user'}function exists(n){return!!db[n]}
  return{addU,delU,passwd,getPF,cur,exists};
})();

/* ====== PACKAGE MANAGER ====== */
const Pkg=(()=>{const inst=new Set(['bash','coreutils','grep','sed','awk','tar','gzip','openssh-client','net-tools','apt']);const avail=['vim','nano','git','curl','wget','htop','tree','tmux','python3','nodejs','gcc','make','docker','nginx','mysql-server','postgresql','redis-server','ruby','php','golang','rust','neovim','zsh','fish','jq','ripgrep','cmake','clang'];
  function update(){return'Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease\nHit:2 http://archive.ubuntu.com/ubuntu jammy-updates InRelease\nReading package lists... Done\nBuilding dependency tree... Done\nAll packages are up to date.'}
  function install(p){if(inst.has(p))return`${p} is already the newest version.`;if(!avail.includes(p))return`E: Unable to locate package ${p}`;inst.add(p);const sz=Math.floor(Math.random()*5000+500);return`Reading package lists... Done\nBuilding dependency tree... Done\nThe following NEW packages will be installed:\n  ${p}\nGet:1 http://archive.ubuntu.com/ubuntu jammy/main amd64 ${p} [${sz} kB]\nSetting up ${p} ...\nProcessing triggers for man-db ...`}
  function remove(p){if(!inst.has(p))return`E: Package '${p}' is not installed`;if(p==='bash'||p==='coreutils'||p==='apt')return`E: Cannot remove essential package '${p}'`;inst.delete(p);return`Removing ${p} ...\nProcessing triggers for man-db ...`}
  function ls(){return[...inst]}return{update,install,remove,ls};
})();

/* ====== MAN PAGES ====== */
const Man={
  ls:{section:'1',name:'ls',summary:'list directory contents',synopsis:'ls [OPTION]... [FILE]...',description:'List files and directories in the current directory or in the paths you pass in.',options:['-a  do not ignore entries starting with .','-l  use a long listing format','-h  with -l, print human readable sizes','-R  list subdirectories recursively'],examples:['ls','ls -la /etc','ls -lh ~/projects'],seealso:['cd(1)','find(1)','stat(1)']},
  cd:{section:'1',name:'cd',summary:'change the shell working directory',synopsis:'cd [DIR]',description:'Change the current working directory. With no argument, switch to the home directory.',examples:['cd /var/log','cd ..','cd ~'],seealso:['pwd(1)','pushd(1)','popd(1)']},
  pwd:{section:'1',name:'pwd',summary:'print name of current working directory',synopsis:'pwd [OPTION]...',description:'Print the absolute pathname of the current working directory.',examples:['pwd'],seealso:['cd(1)','sh(1)']},
  grep:{section:'1',name:'grep',summary:'print lines that match patterns',synopsis:'grep [OPTION]... PATTERN [FILE]...',description:'Search text for a pattern and print matching lines.',options:['-i  ignore case distinctions','-n  print line numbers','-r  read all files under each directory, recursively','-v  invert the sense of matching','-c  print only a count of matching lines'],examples:['grep TODO todo.txt','grep -rin "server" /home/user/projects'],seealso:['find(1)','sed(1)','awk(1)']},
  find:{section:'1',name:'find',summary:'search for files in a directory hierarchy',synopsis:'find [PATH] [EXPRESSION]',description:'Walk a directory tree and filter entries by name or type.',options:['-name PATTERN  match file name with glob syntax','-type f|d  match files or directories'],examples:['find /home/user -name "*.js"','find . -type d'],seealso:['grep(1)','locate(1)']},
  cat:{section:'1',name:'cat',summary:'concatenate files and print on the standard output',synopsis:'cat [OPTION]... [FILE]...',description:'Display file contents or pass stdin through unchanged.',examples:['cat notes.txt','cat README.md | grep WebLinux'],seealso:['head(1)','tail(1)','less(1)']},
  chmod:{section:'1',name:'chmod',summary:'change file mode bits',synopsis:'chmod MODE FILE...',description:'Change the permissions associated with a file or directory.',examples:['chmod 755 app.js','chmod 644 data.json'],seealso:['chown(1)','chgrp(1)']},
  chown:{section:'1',name:'chown',summary:'change file owner and group',synopsis:'chown OWNER[:GROUP] FILE...',description:'Change the owner, and optionally the group, of a file or directory.',examples:['chown root:root /etc/hosts','chown user notes.txt'],seealso:['chmod(1)','chgrp(1)']},
  mkdir:{section:'1',name:'mkdir',summary:'make directories',synopsis:'mkdir [OPTION]... DIRECTORY...',description:'Create one or more directories.',options:['-p  no error if existing, make parent directories as needed'],examples:['mkdir projects','mkdir -p ~/work/app'],seealso:['rmdir(1)','cd(1)']},
  rm:{section:'1',name:'rm',summary:'remove files or directories',synopsis:'rm [OPTION]... [FILE]...',description:'Remove files and directories from the virtual file system.',options:['-r, -R  remove directories and their contents recursively','-f  ignore nonexistent files and arguments, never prompt'],examples:['rm notes.txt','rm -rf old-project'],seealso:['rmdir(1)','mv(1)']},
  cp:{section:'1',name:'cp',summary:'copy files and directories',synopsis:'cp [OPTION]... SOURCE DEST',description:'Copy files or directories to a new location.',examples:['cp notes.txt backup.txt','cp -r projects projects-old'],seealso:['mv(1)','rm(1)']},
  mv:{section:'1',name:'mv',summary:'move or rename files',synopsis:'mv [OPTION]... SOURCE DEST',description:'Move files or rename them inside the virtual file system.',examples:['mv todo.txt tasks.txt','mv projects /tmp/'],seealso:['cp(1)','rm(1)']},
  echo:{section:'1',name:'echo',summary:'display a line of text',synopsis:'echo [OPTION]... [STRING]...',description:'Print the given arguments to standard output with simple environment expansion.',options:['-n  do not output the trailing newline'],examples:['echo hello world','echo $HOME'],seealso:['printf(1)']},
  touch:{section:'1',name:'touch',summary:'change file timestamps or create files',synopsis:'touch [OPTION]... FILE...',description:'Create a file if it does not exist, or update its modification time.',examples:['touch notes.txt','touch logs/today.log'],seealso:['stat(1)']},
  head:{section:'1',name:'head',summary:'output the first part of files',synopsis:'head [OPTION]... [FILE]...',description:'Print the first lines from a file or from stdin.',options:['-n NUM  print the first NUM lines'],examples:['head -n 5 todo.txt','cat notes.txt | head'],seealso:['tail(1)','cat(1)']},
  tail:{section:'1',name:'tail',summary:'output the last part of files',synopsis:'tail [OPTION]... [FILE]...',description:'Print the last lines from a file or from stdin.',options:['-n NUM  print the last NUM lines','-f  follow appended data (simulated)'],examples:['tail -n 20 sys.log','tail -f auth.log'],seealso:['head(1)','less(1)']},
  wc:{section:'1',name:'wc',summary:'print newline, word, and byte counts',synopsis:'wc [OPTION]... [FILE]...',description:'Count lines, words, and characters in text.',options:['-l  print line counts','-w  print word counts','-c  print byte counts'],examples:['wc todo.txt','cat notes.txt | wc -w'],seealso:['sort(1)','uniq(1)']},
  sort:{section:'1',name:'sort',summary:'sort lines of text files',synopsis:'sort [OPTION]... [FILE]...',description:'Sort the input lines lexicographically or numerically.',options:['-r  reverse the result of comparisons','-n  compare according to string numerical value','-u  output only the first of an equal run'],examples:['sort todo.txt','cat numbers.txt | sort -n'],seealso:['uniq(1)','wc(1)']},
  uniq:{section:'1',name:'uniq',summary:'report or filter repeated lines',synopsis:'uniq [OPTION]... [INPUT [OUTPUT]]',description:'Filter adjacent matching lines from sorted input.',options:['-c  prefix lines by the number of occurrences','-d  only print duplicate lines'],examples:['sort names.txt | uniq','sort names.txt | uniq -c'],seealso:['sort(1)']},
  cut:{section:'1',name:'cut',summary:'remove sections from each line of files',synopsis:'cut -d DELIM -f LIST [FILE]...',description:'Select specific fields from delimited text.',examples:['cut -d "," -f 1 data.csv','cut -f 1,3 hosts.tsv'],seealso:['awk(1)','sed(1)']},
  sed:{section:'1',name:'sed',summary:'stream editor for filtering and transforming text',synopsis:'sed SCRIPT [FILE]...',description:'Apply simple substitutions to each input line.',examples:['sed s/old/new/g notes.txt','cat file.txt | sed s/foo/bar/'],seealso:['awk(1)','grep(1)']},
  awk:{section:'1',name:'awk',summary:'pattern scanning and processing language',synopsis:'awk [OPTION]... PROGRAM [FILE]...',description:'Pattern-based text processing with field extraction support.',examples:['awk "{print $1}" hosts','awk -F: "{print $1}" /etc/passwd'],seealso:['sed(1)','cut(1)']},
  ps:{section:'1',name:'ps',summary:'report a snapshot of current processes',synopsis:'ps [OPTIONS]',description:'Show the simulated process table for the current session.',examples:['ps','ps aux'],seealso:['top(1)','kill(1)']},
  kill:{section:'1',name:'kill',summary:'send a signal to a process',synopsis:'kill [OPTION]... PID...',description:'Send a signal to one or more simulated processes.',options:['-9  forcefully terminate a process','-15  request graceful termination'],examples:['kill 12','kill -9 14'],seealso:['ps(1)','top(1)']},
  top:{section:'1',name:'top',summary:'display Linux processes',synopsis:'top',description:'Show a live process snapshot with CPU and memory information.',examples:['top'],seealso:['ps(1)','kill(1)']},
  ping:{section:'8',name:'ping',summary:'send ICMP ECHO_REQUEST packets to network hosts',synopsis:'ping [OPTION]... HOST',description:'Test connectivity to a host with simulated ICMP replies.',options:['-c N  stop after sending N packets'],examples:['ping example.com','ping -c 3 8.8.8.8'],seealso:['ifconfig(8)','netstat(8)']},
  tar:{section:'1',name:'tar',summary:'an archiving utility',synopsis:'tar [cxtf] ARCHIVE [FILE]...',description:'Create, inspect, or extract simulated tar archives.',examples:['tar cf backup.tar notes.txt','tar tf archive.tar'],seealso:['zip(1)','gzip(1)']},
  apt:{section:'8',name:'apt',summary:'command-line package manager',synopsis:'apt [update|install|remove|list]',description:'Manage the simulated package set used by the terminal.',examples:['apt update','apt install htop','apt list'],seealso:['dpkg(1)','man-db(8)']},
  df:{section:'1',name:'df',summary:'report file system disk space usage',synopsis:'df [OPTION]...',description:'Display available and used space for mounted filesystems.',options:['-h  print sizes in human readable format'],examples:['df','df -h'],seealso:['du(1)']},
  du:{section:'1',name:'du',summary:'estimate file space usage',synopsis:'du [OPTION]... [FILE]...',description:'Summarize disk usage for files and directories.',options:['-h  human readable sizes','-s  display only a total for each argument'],examples:['du -sh .','du -h /home/user'],seealso:['df(1)']},
  free:{section:'1',name:'free',summary:'display amount of free and used memory in the system',synopsis:'free [OPTION]...',description:'Show memory usage for the simulated system.',options:['-h  print human readable output'],examples:['free','free -h'],seealso:['top(1)']},
  less:{section:'1',name:'less',summary:'opposite of more',synopsis:'less FILE',description:'View a file one screen at a time; in this terminal it is rendered as a static page ending marker.',examples:['less README.md'],seealso:['cat(1)','head(1)','tail(1)']},
  history:{section:'1',name:'history',summary:'command history',synopsis:'history',description:'Show commands entered in the current browser session.',examples:['history'],seealso:['fc(1)']},
  man:{section:'1',name:'man',summary:'an interface to the system reference manuals',synopsis:'man [OPTION]... [SECTION] PAGE...',description:'Show detailed manual pages, summaries, or search results from the built-in static manual database.',options:['-f, --whatis  display a one-line description for a manual page','-k, --apropos  search the one-line descriptions for a keyword'],examples:['man ls','man -f grep','man -k network','man 5 passwd'],seealso:['help(1)','info(1)']},
  help:{section:'1',name:'help',summary:'display help for built-in commands',synopsis:'help',description:'Show a categorized list of commands supported by the terminal.',examples:['help'],seealso:['man(1)']},
  clear:{section:'1',name:'clear',summary:'clear the terminal screen',synopsis:'clear',description:'Clear the visible terminal output and reset the prompt line.',examples:['clear'],seealso:['reset(1)']},
  date:{section:'1',name:'date',summary:'print or set the system date and time',synopsis:'date',description:'Show the current local date and time in the browser session.',examples:['date'],seealso:['cal(1)']},
  cal:{section:'1',name:'cal',summary:'display a calendar',synopsis:'cal',description:'Render the current month in a compact terminal calendar.',examples:['cal'],seealso:['date(1)']},
  env:{section:'1',name:'env',summary:'print the environment',synopsis:'env',description:'Display the current shell environment variables.',examples:['env'],seealso:['printenv(1)']},
  uname:{section:'1',name:'uname',summary:'print system information',synopsis:'uname [OPTION]...',description:'Return information about the simulated kernel and host.',examples:['uname','uname -a'],seealso:['hostname(1)']},
  whoami:{section:'1',name:'whoami',summary:'print effective user name',synopsis:'whoami',description:'Display the name of the current user.',examples:['whoami'],seealso:['id(1)','who(1)']},
  who:{section:'1',name:'who',summary:'show who is logged on',synopsis:'who',description:'Show the current logged-in session information.',examples:['who'],seealso:['whoami(1)']},
  hostname:{section:'1',name:'hostname',summary:'show or set the system host name',synopsis:'hostname',description:'Print the simulated host name for the terminal session.',examples:['hostname'],seealso:['uname(1)']},
  id:{section:'1',name:'id',summary:'print real and effective user and group IDs',synopsis:'id',description:'Display the current simulated UID, GID, and groups.',examples:['id'],seealso:['whoami(1)']},
  useradd:{section:'8',name:'useradd',summary:'create a new user or update default new user information',synopsis:'useradd USER',description:'Create a new simulated user account and home directory.',examples:['useradd alice'],seealso:['userdel(8)','passwd(1)']},
  userdel:{section:'8',name:'userdel',summary:'delete a user account and related files',synopsis:'userdel USER',description:'Remove a simulated user account.',examples:['userdel alice'],seealso:['useradd(8)','passwd(1)']},
  passwd:{section:'1',name:'passwd',summary:'change user password',synopsis:'passwd [USER]',description:'Update the password for a simulated account.',examples:['passwd','passwd alice'],seealso:['useradd(8)','userdel(8)']},
  ifconfig:{section:'8',name:'ifconfig',summary:'configure network interfaces',synopsis:'ifconfig',description:'Display the simulated network interface configuration.',examples:['ifconfig'],seealso:['ping(8)','netstat(8)']},
  netstat:{section:'8',name:'netstat',summary:'network statistics',synopsis:'netstat',description:'Show active sockets and listening ports in the simulation.',examples:['netstat'],seealso:['ifconfig(8)','ss(8)']},
  ssh:{section:'1',name:'ssh',summary:'OpenSSH remote login client',synopsis:'ssh [USER@]HOST',description:'Attempt a simulated SSH connection to a remote host.',examples:['ssh user@example.com'],seealso:['scp(1)','ping(8)']},
  scp:{section:'1',name:'scp',summary:'secure copy files over SSH',synopsis:'scp SOURCE TARGET',description:'Simulated secure copy client for remote transfer workflows.',examples:['scp file.txt user@example.com:/tmp/'],seealso:['ssh(1)']}
};


function manRecord(name){return Man[name]||null}

function manPage(name,section){
  const entry=manRecord(name);
  if(!entry)return null;
  if(section&&String(section)!==String(entry.section))return null;
  const out=[];
  out.push(`MAN(${entry.section})${entry.name.toUpperCase()}`);
  out.push('');
  out.push('NAME');
  out.push(`    ${entry.name} - ${entry.summary}`);
  out.push('');
  out.push('SYNOPSIS');
  out.push(`    ${entry.synopsis}`);
  if(entry.description){out.push('');out.push('DESCRIPTION');out.push(`    ${entry.description}`)}
  if(entry.options&&entry.options.length){out.push('');out.push('OPTIONS');for(const opt of entry.options)out.push(`    ${opt}`)}
  if(entry.examples&&entry.examples.length){out.push('');out.push('EXAMPLES');for(const ex of entry.examples)out.push(`    $ ${ex}`)}
  if(entry.seealso&&entry.seealso.length){out.push('');out.push('SEE ALSO');out.push(`    ${entry.seealso.join(', ')}`)}
  return out.join('\n');
}

function manWhatis(name){
  const entry=manRecord(name);
  if(!entry)return null;
  return `${entry.name} (${entry.section}) - ${entry.summary}`;
}

function manApropos(term){
  const needle=(term||'').toLowerCase();
  if(!needle)return 'apropos: keyword expected';
  const hits=Object.values(Man)
    .filter(entry=>[entry.name,entry.summary,entry.description,...(entry.options||[]),...(entry.examples||[])].join(' ').toLowerCase().includes(needle))
    .map(entry=>`${entry.name} (${entry.section}) - ${entry.summary}`);
  return hits.length?hits.join('\n'):'apropos: nothing appropriate';
}

/* ====== COMMANDS ====== */
const C={};
function fmtL(e){const pm=e.permissions||(e.type==='directory'?'drwxr-xr-x':'-rw-r--r--');const lk=e.type==='directory'?'2':'1';const ow=(e.owner||'user').padEnd(6);const gr=(e.group||'user').padEnd(6);const sz=String(e.size||0).padStart(6);const d=new Date(e.modifiedAt||Date.now());const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];const ds=`${mo[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;const cl=e.type==='directory'?'\x1b[1;34m':'';const rs=e.type==='directory'?'\x1b[0m':'';return`${pm} ${lk} ${ow} ${gr} ${sz} ${ds} ${cl}${e.name}${rs}`}

C.pwd=(a,s)=>s.cwd;
C.ls=(args,s)=>{let sa=false,lo=false;const paths=[];for(const a of args){if(a.startsWith('-')){if(a.includes('a'))sa=true;if(a.includes('l'))lo=true}else paths.push(a)}if(!paths.length)paths.push('.');const res=[];for(const p of paths){const nd=VFS.getN(p,s.cwd);if(!nd)return`ls: cannot access '${p}': No such file or directory`;if(nd.type==='file'){res.push(lo?fmtL(nd):nd.name);continue}let ent=Object.values(nd.children);if(sa)ent=[{name:'.',type:'directory',permissions:nd.permissions,owner:nd.owner,group:nd.group,size:4096,modifiedAt:nd.modifiedAt},{name:'..',type:'directory',permissions:'drwxr-xr-x',owner:'root',group:'root',size:4096,modifiedAt:nd.modifiedAt},...ent];else ent=ent.filter(e=>!e.name.startsWith('.'));if(paths.length>1)res.push(p+':');if(lo){res.push('total '+ent.length*4);for(const e of ent)res.push(fmtL(e))}else res.push(ent.map(e=>e.type==='directory'?`\x1b[1;34m${e.name}\x1b[0m`:e.name).join('  '))}return res.join('\n')};
C.cd=(args,s)=>{const t=args[0]||'~';const abs=VFS.absStr(t,s.cwd);const nd=VFS.getN(t,s.cwd);if(!nd)return`bash: cd: ${t}: No such file or directory`;if(nd.type!=='directory')return`bash: cd: ${t}: Not a directory`;s.cwd=abs||'/';updateStatusCwd(s.cwd);return''};
C.mkdir=(args,s)=>{if(!args.length)return'mkdir: missing operand';let mp=false;const dirs=[];for(const a of args){if(a==='-p')mp=true;else dirs.push(a)}const r=[];for(const d of dirs){if(mp)VFS._mkdirp(VFS.absStr(d,s.cwd));else{const e=VFS.mkdir(d,s.cwd);if(e)r.push(e)}}return r.join('\n')};
C.rmdir=(args,s)=>{if(!args.length)return'rmdir: missing operand';const r=[];for(const a of args){const n=VFS.getN(a,s.cwd);if(!n){r.push(`rmdir: '${a}': No such file or directory`);continue}if(n.type!=='directory'){r.push(`rmdir: '${a}': Not a directory`);continue}if(Object.keys(n.children).length>0){r.push(`rmdir: '${a}': Directory not empty`);continue}VFS.rm(a,s.cwd)}return r.join('\n')};
C.rm=(args,s)=>{let rec=false,force=false;const files=[];for(const a of args){if(a.startsWith('-')){if(a.includes('r')||a.includes('R'))rec=true;if(a.includes('f'))force=true}else files.push(a)}if(!files.length)return force?'':'rm: missing operand';const r=[];for(const f of files){const e=VFS.rm(f,s.cwd,rec);if(e&&!force)r.push(e)}return r.join('\n')};
C.cp=(args,s)=>{const nf=args.filter(a=>!a.startsWith('-'));if(nf.length<2)return'cp: missing operand';const dst=nf.pop();const r=[];for(const src of nf){const e=VFS.cp(src,dst,s.cwd);if(e)r.push(e)}return r.join('\n')};
C.mv=(args,s)=>{const nf=args.filter(a=>!a.startsWith('-'));if(nf.length<2)return'mv: missing operand';const dst=nf.pop();const r=[];for(const src of nf){const e=VFS.mv(src,dst,s.cwd);if(e)r.push(e)}return r.join('\n')};
C.touch=(args,s)=>{if(!args.length)return'touch: missing operand';for(const a of args){if(a.startsWith('-'))continue;const ex=VFS.getN(a,s.cwd);if(ex)ex.modifiedAt=VFS.now();else VFS.write(a,s.cwd,'')}return''};
C.cat=(args,s,stdin)=>{if(!args.length&&stdin!=null)return stdin;if(!args.length)return'cat: missing file operand';const r=[];for(const a of args){if(a.startsWith('-'))continue;const c=VFS.read(a,s.cwd);if(c===null){const n=VFS.getN(a,s.cwd);r.push(n&&n.type==='directory'?`cat: ${a}: Is a directory`:`cat: ${a}: No such file or directory`)}else r.push(c)}return r.join('\n')};
C.head=(args,s,stdin)=>{let n=10;const files=[];for(let i=0;i<args.length;i++){if(args[i]==='-n'&&args[i+1])n=parseInt(args[++i])||10;else if(!args[i].startsWith('-'))files.push(args[i])}if(!files.length&&stdin!=null)return stdin.split('\n').slice(0,n).join('\n');if(!files.length)return'head: missing operand';const r=[];for(const f of files){const c=VFS.read(f,s.cwd);if(c===null){r.push(`head: '${f}': No such file`);continue}if(files.length>1)r.push(`==> ${f} <==`);r.push(c.split('\n').slice(0,n).join('\n'))}return r.join('\n')};
C.tail=(args,s,stdin)=>{let n=10,fol=false;const files=[];for(let i=0;i<args.length;i++){if(args[i]==='-n'&&args[i+1])n=parseInt(args[++i])||10;else if(args[i]==='-f')fol=true;else if(!args[i].startsWith('-'))files.push(args[i])}if(!files.length&&stdin!=null){const l=stdin.split('\n');return l.slice(Math.max(0,l.length-n)).join('\n')}if(!files.length)return'tail: missing operand';const r=[];for(const f of files){const c=VFS.read(f,s.cwd);if(c===null){r.push(`tail: '${f}': No such file`);continue}if(files.length>1)r.push(`==> ${f} <==`);const l=c.split('\n');r.push(l.slice(Math.max(0,l.length-n)).join('\n'))}if(fol)r.push('\x1b[33m[tail -f simulated]\x1b[0m');return r.join('\n')};
C.less=(args,s,stdin)=>{if(!args.length&&stdin!=null)return stdin;if(!args.length)return'less: missing operand';const f=args.find(a=>!a.startsWith('-'));const c=VFS.read(f,s.cwd);if(c===null)return`${f}: No such file or directory`;return c+'\n\x1b[7m(END)\x1b[0m'};
C.grep=(args,s,stdin)=>{let ic=false,ln=false,rec=false,inv=false,cnt=false;const pos=[];for(const a of args){if(a.startsWith('-')&&!a.startsWith('--')){if(a.includes('i'))ic=true;if(a.includes('n'))ln=true;if(a.includes('r'))rec=true;if(a.includes('v'))inv=true;if(a.includes('c'))cnt=true}else pos.push(a)}if(!pos.length)return'grep: missing pattern';const pat=pos[0];const files=pos.slice(1);let re;try{re=new RegExp(pat,ic?'i':'')}catch(e){return`grep: Invalid regex: '${pat}'`}function gC(ct,fn,mf){const ls=ct.split('\n');const r=[];let count=0;for(let i=0;i<ls.length;i++){const m=re.test(ls[i]);if(m!==inv){count++;if(!cnt){let l=ls[i],px='';if(mf&&fn)px+=`\x1b[35m${fn}\x1b[0m:`;if(ln)px+=`\x1b[32m${i+1}\x1b[0m:`;if(!inv)l=l.replace(re,m=>`\x1b[1;31m${m}\x1b[0m`);r.push(px+l)}}}if(cnt)r.push((mf&&fn?fn+':':'')+count);return r}if(!files.length){if(stdin==null)return'grep: no input';return gC(stdin,null,false).join('\n')}if(rec){const r=[];for(const f of files){const found=VFS.findN(f,s.cwd,n=>n.type==='file');for(const path of found){const c=VFS.read(path,s.cwd);if(c!==null)r.push(...gC(c,path,true))}}return r.join('\n')}const r=[];const mf=files.length>1;for(const f of files){const c=VFS.read(f,s.cwd);if(c===null){r.push(`grep: ${f}: No such file or directory`);continue}r.push(...gC(c,f,mf))}return r.join('\n')};
C.find=(args,s)=>{let sp='.',np=null,tf=null;for(let i=0;i<args.length;i++){if(args[i]==='-name'&&args[i+1])np=args[++i];else if(args[i]==='-type'&&args[i+1])tf=args[++i];else if(!args[i].startsWith('-'))sp=args[i]}return VFS.findN(sp,s.cwd,(n)=>{if(np){const re=new RegExp('^'+np.replace(/\*/g,'.*').replace(/\?/g,'.')+'$');if(!re.test(n.name))return false}if(tf){if(tf==='f'&&n.type!=='file')return false;if(tf==='d'&&n.type!=='directory')return false}return true}).join('\n')};
C.locate=(args,s)=>{if(!args.length)return'locate: no pattern';const re=new RegExp(args[0],'i');const r=VFS.findN('/',s.cwd,n=>re.test(n.name));return r.length?r.join('\n'):`locate: no results for '${args[0]}'`};
C.which=(args)=>{if(!args.length)return'which: missing argument';return args.map(cmd=>C[cmd]?`/usr/bin/${cmd}`:`${cmd} not found`).join('\n')};
C.chmod=(args,s)=>{if(args.length<2)return'chmod: missing operand';const n=VFS.getN(args[1],s.cwd);if(!n)return`chmod: '${args[1]}': No such file or directory`;if(/^\d{3,4}$/.test(args[0])){const d=args[0].length===4?args[0].slice(1):args[0];n.permissions=(n.type==='directory'?'d':'-')+'rwxrwxrwx'.split('').map((c,i)=>(parseInt(d[Math.floor(i/3)])&(4>>(i%3)))?c:'-').join('')}return''};
C.chown=(args,s)=>{if(args.length<2)return'chown: missing operand';const n=VFS.getN(args[1],s.cwd);if(!n)return`chown: '${args[1]}': No such file or directory`;const p=args[0].split(':');n.owner=p[0]||n.owner;if(p[1])n.group=p[1];return''};
C.chgrp=(args,s)=>{if(args.length<2)return'chgrp: missing operand';const n=VFS.getN(args[1],s.cwd);if(!n)return`chgrp: '${args[1]}': No such file or directory`;n.group=args[0];return''};
C.ps=()=>{const P=PM.list();const h='USER       PID  %CPU  %MEM    VSZ   RSS STAT START COMMAND';return h+'\n'+P.map(p=>`${p.user.padEnd(8)} ${String(p.pid).padStart(5)}  ${p.cpu.padStart(4)}  ${p.mem.padStart(4)}  ${String(p.vsz).padStart(6)} ${String(p.rss).padStart(5)}  ${p.status.padEnd(3)}  ${p.start}  ${p.name}`).join('\n')};
C.top=()=>{const P=PM.list();let o=`\x1b[1;37mtop - ${new Date().toLocaleTimeString()} up ${Math.floor(Math.random()*30)} days, load: ${(Math.random()*2).toFixed(2)}\x1b[0m\nTasks: ${P.length} total, 1 running, ${P.length-1} sleeping\n%Cpu: ${(Math.random()*15).toFixed(1)} us, ${(Math.random()*5).toFixed(1)} sy, ${(80+Math.random()*15).toFixed(1)} id\nMem: 7872M total, ${(2000+Math.random()*2000).toFixed(0)}M used, ${(1000+Math.random()*3000).toFixed(0)}M free\n\n\x1b[7m  PID USER      VIRT    RES  S  %CPU  %MEM COMMAND \x1b[0m\n`;for(const p of P.slice(0,15))o+=`${String(p.pid).padStart(5)} ${p.user.padEnd(9)} ${String(p.vsz).padStart(7)} ${String(p.rss).padStart(6)}  ${p.status==='R'?'R':'S'}  ${p.cpu.padStart(5)}  ${p.mem.padStart(4)} ${p.name}\n`;o+='\n\x1b[33m[Snapshot - press Enter]\x1b[0m';return o};
C.kill=(args)=>{let sig=15;const pids=[];for(const a of args){if(a==='-9'||a==='-KILL')sig=9;else if(a==='-15'||a==='-TERM')sig=15;else if(!a.startsWith('-'))pids.push(parseInt(a))}if(!pids.length)return'kill: usage: kill [-signal] pid';const r=[];for(const pid of pids){if(isNaN(pid)){r.push('kill: invalid pid');continue}const e=PM.kill(pid,sig);if(e)r.push(e)}return r.join('\n')};
C.tar=(args,s)=>{const fl=args[0]||'';const ar=args[1]||'archive.tar';const files=args.slice(2);if(fl.includes('c')){if(!files.length)return'tar: Cowardly refusing to create an empty archive';const p=[];for(const f of files){const c=VFS.read(f,s.cwd);if(c!==null)p.push(`[${f}]: ${c.length}b`);else{const n=VFS.getN(f,s.cwd);if(n)p.push(`[${f}/]`);else return`tar: ${f}: No such file`}}VFS.write(ar,s.cwd,'[TAR]\n'+p.join('\n')+'\n[END]');return files.join('\n')}if(fl.includes('x')){const c=VFS.read(ar,s.cwd);return c?`Extracted from ${ar} (simulated)`:`tar: ${ar}: Cannot open`}if(fl.includes('t')){const c=VFS.read(ar,s.cwd);return c||`tar: ${ar}: Cannot open`}return'tar: specify -c, -x, or -t'};
C.zip=(args,s)=>{if(args.length<2)return'zip: missing arguments';const ar=args[0];const files=args.slice(1);const r=[];for(const f of files){const c=VFS.read(f,s.cwd);if(c!==null)r.push(`  adding: ${f} (deflated ${Math.floor(Math.random()*60+20)}%)`);else return`zip: ${f}: No such file`}VFS.write(ar,s.cwd,`[ZIP: ${files.join(', ')}]`);return r.join('\n')};
C.gzip=(args,s)=>{if(!args.length)return'gzip: missing operand';for(const f of args){if(f.startsWith('-'))continue;const c=VFS.read(f,s.cwd);if(c===null)return`gzip: ${f}: No such file`;VFS.write(f+'.gz',s.cwd,`[GZIP ${c.length}b->${Math.floor(c.length*0.6)}b]`);VFS.rm(f,s.cwd)}return''};
C.gunzip=(args,s)=>{if(!args.length)return'gunzip: missing operand';for(const f of args){if(f.startsWith('-'))continue;const c=VFS.read(f,s.cwd);if(c===null)return`gunzip: ${f}: No such file`;if(!f.endsWith('.gz'))return`gunzip: ${f}: unknown suffix`;VFS.write(f.slice(0,-3),s.cwd,'[Decompressed]');VFS.rm(f,s.cwd)}return''};
C.ping=(args)=>{let count=4,host='';for(let i=0;i<args.length;i++){if(args[i]==='-c'&&args[i+1])count=parseInt(args[++i])||4;else if(!args[i].startsWith('-'))host=args[i]}if(!host)return'ping: usage: ping [-c count] destination';const ip=`${Math.floor(Math.random()*223+1)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;const l=[`PING ${host} (${ip}) 56(84) bytes of data.`];for(let i=0;i<count;i++)l.push(`64 bytes from ${host}: icmp_seq=${i+1} ttl=64 time=${(Math.random()*50+5).toFixed(2)} ms`);l.push(`\n--- ${host} ping statistics ---\n${count} packets transmitted, ${count} received, 0% packet loss`);return l.join('\n')};
C.ifconfig=()=>`eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.1.${Math.floor(Math.random()*254+1)}  netmask 255.255.255.0\n        ether 08:00:27:8e:8a:a8  txqueuelen 1000\n        RX packets 125432  bytes 98234567 (93.6 MiB)\n        TX packets 89021  bytes 12345678 (11.7 MiB)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0`;
C.netstat=()=>'Active Internet connections\nProto Recv-Q Send-Q Local Address           Foreign Address         State\ntcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN\ntcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN\ntcp        0      0 127.0.0.1:3306          0.0.0.0:*               LISTEN\ntcp        0      0 192.168.1.100:22        192.168.1.50:52431      ESTABLISHED';
C.ssh=(args)=>args.length?`ssh: connect to host ${args[args.length-1]}: Connection refused\n\x1b[33m[Simulated]\x1b[0m`:'usage: ssh [user@]hostname';
C.scp=(args)=>args.length<2?'usage: scp source target':'scp: Connection refused\n\x1b[33m[Simulated]\x1b[0m';
C.apt=(args)=>{if(!args.length)return'Usage: apt [update|install|remove|list]';if(args[0]==='update')return Pkg.update();if(args[0]==='install')return args[1]?Pkg.install(args[1]):'E: No package specified';if(args[0]==='remove')return args[1]?Pkg.remove(args[1]):'E: No package specified';if(args[0]==='list')return Pkg.ls().map(p=>`${p}/now installed`).join('\n');return`E: Invalid operation ${args[0]}`};
C.df=(args)=>{const h=args.includes('-h');return'Filesystem      Size  Used Avail Use% Mounted on\n'+(h?'/dev/sda1        50G   12G   35G  26% /':'/dev/sda1     52428800  12582912  36700160  26% /')+'\n'+(h?'tmpfs           3.9G     0  3.9G   0% /dev/shm':'tmpfs          4030464         0   4030464   0% /dev/shm')+'\n'+(h?'/dev/sda2       200G   89G  101G  47% /home':'/dev/sda2    209715200  93323264 105906176  47% /home')};
C.du=(args,s)=>{const h=args.includes('-h'),sm=args.includes('-s'),t=args.find(a=>!a.startsWith('-'))||'.';const n=VFS.getN(t,s.cwd);if(!n)return`du: '${t}': No such file`;function sz(nd){if(nd.type==='file')return nd.size||0;let tot=4096;if(nd.children)for(const c of Object.values(nd.children))tot+=sz(c);return tot}if(sm){const size=sz(n);return h?`${(size/1024).toFixed(0)}K\t${t}`:`${size}\t${t}`}const r=[];function walk(nd,p){if(nd.type==='directory'){let size=4096;if(nd.children)for(const[k,v]of Object.entries(nd.children)){walk(v,p+'/'+k);size+=sz(v)}r.push(h?`${(size/1024).toFixed(0)}K\t${p}`:`${size}\t${p}`)}}walk(n,t);return r.join('\n')};
C.free=(args)=>args.includes('-h')?'              total        used        free      shared  buff/cache   available\nMem:          7.7Gi       2.1Gi       3.8Gi       256Mi       1.8Gi       5.1Gi\nSwap:         2.0Gi          0B       2.0Gi':'              total        used        free      shared  buff/cache   available\nMem:        8052736     2202624     3985408      262144     1864704     5373952\nSwap:       2097152           0     2097152';
C.uname=(args)=>{if(args.includes('-a'))return'Linux weblinux 6.5.0-generic #1 SMP x86_64 GNU/Linux';if(args.includes('-r'))return'6.5.0-generic';return'Linux'};
C.whoami=()=>US.cur();
C.who=()=>{const d=new Date();return`user     pts/0        ${d.toISOString().slice(0,10)} ${d.toTimeString().slice(0,5)} (web-terminal)`};
C.hostname=()=>'weblinux';
C.id=()=>'uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)';
C.sort=(args,s,stdin)=>{let rev=false,num=false,uniq=false;const files=[];for(const a of args){if(a.startsWith('-')){if(a.includes('r'))rev=true;if(a.includes('n'))num=true;if(a.includes('u'))uniq=true}else files.push(a)}let text='';if(files.length){for(const f of files){const c=VFS.read(f,s.cwd);if(c===null)return`sort: ${f}: No such file`;text+=(text?'\n':'')+c}}else if(stdin!=null)text=stdin;else return'';let l=text.split('\n');if(num)l.sort((a,b)=>parseFloat(a)-parseFloat(b));else l.sort();if(rev)l.reverse();if(uniq)l=[...new Set(l)];return l.join('\n')};
C.uniq=(args,s,stdin)=>{let cm=false,dm=false;const files=[];for(const a of args){if(a.startsWith('-')){if(a.includes('c'))cm=true;if(a.includes('d'))dm=true}else files.push(a)}let text='';if(files.length){const c=VFS.read(files[0],s.cwd);if(c===null)return`uniq: ${files[0]}: No such file`;text=c}else if(stdin!=null)text=stdin;else return'';const lines=text.split('\n');const r=[];let prev=null,count=0;for(const line of lines){if(line===prev)count++;else{if(prev!==null&&(!dm||count>1))r.push(cm?`${String(count).padStart(7)} ${prev}`:prev);prev=line;count=1}}if(prev!==null&&(!dm||count>1))r.push(cm?`${String(count).padStart(7)} ${prev}`:prev);return r.join('\n')};
C.wc=(args,s,stdin)=>{let lf=false,wf=false,cf=false;const files=[];for(const a of args){if(a.startsWith('-')){if(a.includes('l'))lf=true;if(a.includes('w'))wf=true;if(a.includes('c'))cf=true}else files.push(a)}const all=!lf&&!wf&&!cf;function cnt(t,nm){const l=t.split('\n').length;const w=t.split(/\s+/).filter(Boolean).length;const ch=t.length;const p=[];if(all||lf)p.push(String(l).padStart(6));if(all||wf)p.push(String(w).padStart(6));if(all||cf)p.push(String(ch).padStart(6));if(nm)p.push(' '+nm);return p.join('')}if(!files.length){if(stdin==null)return'wc: missing operand';return cnt(stdin,'')}const r=[];for(const f of files){const c=VFS.read(f,s.cwd);if(c===null){r.push(`wc: ${f}: No such file`);continue}r.push(cnt(c,f))}return r.join('\n')};
C.cut=(args,s,stdin)=>{let delim='\t',fields=null;const files=[];for(let i=0;i<args.length;i++){if(args[i]==='-d'&&args[i+1])delim=args[++i];else if(args[i]==='-f'&&args[i+1])fields=args[++i];else if(!args[i].startsWith('-'))files.push(args[i])}if(!fields)return'cut: specify -f fields';const fns=fields.split(',').map(f=>parseInt(f)-1);function proc(t){return t.split('\n').map(l=>{const p=l.split(delim);return fns.map(f=>p[f]||'').join(delim)}).join('\n')}if(files.length){const c=VFS.read(files[0],s.cwd);if(c===null)return`cut: ${files[0]}: No such file`;return proc(c)}if(stdin!=null)return proc(stdin);return''};
C.awk=(args,s,stdin)=>{let prog='',sep=/\s+/;const files=[];for(let i=0;i<args.length;i++){if(args[i]==='-F'&&args[i+1]){const sp=args[++i];sep=sp==='\\t'?/\t/:new RegExp(sp.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}else if(!prog&&(args[i].startsWith("'")||args[i].startsWith('{')||args[i].startsWith('/'))){prog=args[i].replace(/^'|'$/g,'')}else if(!args[i].startsWith('-'))files.push(args[i])}if(!prog)return'awk: missing program';let text='';if(files.length){const c=VFS.read(files[0],s.cwd);if(c===null)return`awk: ${files[0]}: No such file`;text=c}else if(stdin!=null)text=stdin;else return'';const lines=text.split('\n');const r=[];let patM=null,printF=null;const pr=prog.match(/^\/(.+?)\//);if(pr){patM=new RegExp(pr[1]);prog=prog.slice(pr[0].length)}const pm=prog.match(/\{\s*print\s+(.*?)\s*\}/);if(pm)printF=pm[1].split(/\s*,\s*/);else if(prog.match(/\{\s*print\s*\}/))printF=['$0'];for(let nr=0;nr<lines.length;nr++){const line=lines[nr];if(patM&&!patM.test(line))continue;const flds=line.split(sep);if(printF){r.push(printF.map(f=>{f=f.trim().replace(/"/g,'');if(f==='$0')return line;if(f==='NR')return String(nr+1);if(f==='NF')return String(flds.length);const m=f.match(/^\$(\d+)$/);if(m)return flds[parseInt(m[1])-1]||'';return f}).join(' '))}else r.push(line)}return r.join('\n')};
C.sed=(args,s,stdin)=>{let expr='',inplace=false;const files=[];for(let i=0;i<args.length;i++){if(args[i]==='-i')inplace=true;else if(args[i]==='-e'&&args[i+1])expr=args[++i];else if(!expr&&(args[i].includes('/')||args[i].startsWith('s')))expr=args[i];else if(!args[i].startsWith('-'))files.push(args[i])}if(!expr)return'sed: no expression';const sm=expr.match(/^s(.)(.+?)\1(.*?)\1([gi]*)$/);if(!sm)return'sed: invalid expression';const[,,pat,rep,fl]=sm;const re=new RegExp(pat,fl.includes('g')?'g'+(fl.includes('i')?'i':''):(fl.includes('i')?'i':''));function proc(t){return t.split('\n').map(l=>l.replace(re,rep)).join('\n')}if(files.length){const r=[];for(const f of files){const c=VFS.read(f,s.cwd);if(c===null)return`sed: ${f}: No such file`;const rr=proc(c);if(inplace)VFS.write(f,s.cwd,rr);else r.push(rr)}return inplace?'':r.join('\n')}if(stdin!=null)return proc(stdin);return''};
C.useradd=(args)=>{const n=args.find(a=>!a.startsWith('-'));if(!n)return'useradd: missing username';return US.addU(n)||''};
C.userdel=(args)=>{if(!args.length)return'userdel: missing username';return US.delU(args[0])||''};
C.passwd=(args)=>US.passwd(args[0]||US.cur())||'';
C.history=(a,s)=>s.history.map((h,i)=>`  ${String(i+1).padStart(4)}  ${h}`).join('\n');
C.clear=()=>'\x1b[CLEAR]';
C.date=()=>new Date().toString();
C.cal=()=>{const now=new Date(),y=now.getFullYear(),m=now.getMonth();const mo=['January','February','March','April','May','June','July','August','September','October','November','December'];let cal=`    ${mo[m]} ${y}\nSu Mo Tu We Th Fr Sa\n`;const fd=new Date(y,m,1).getDay(),dim=new Date(y,m+1,0).getDate();let line='   '.repeat(fd);for(let d=1;d<=dim;d++){const ds=d===now.getDate()?`\x1b[7m${String(d).padStart(2)}\x1b[0m`:String(d).padStart(2);line+=ds;if((fd+d)%7===0){cal+=line+'\n';line=''}else line+=' '}if(line.trim())cal+=line;return cal};
C.echo=(args,s)=>{let start=0;if(args[0]==='-n')start=1;let text=args.slice(start).join(' ');text=text.replace(/\$HOME/g,'/home/user').replace(/\$USER/g,US.cur()).replace(/\$PWD/g,s.cwd).replace(/\$SHELL/g,'/bin/bash').replace(/\$HOSTNAME/g,'weblinux').replace(/\$PATH/g,'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin');text=text.replace(/^"(.*)"$/s,'$1').replace(/^'(.*)'$/s,'$1');return text};
C.man=(args)=>{
  if(!args.length)return"What manual page do you want?\nTry 'man man'.";
  if(args[0]==='-f'||args[0]==='--whatis')return args[1]?manWhatis(args[1])||`No manual entry for ${args[1]}`:'whatis: what manual page do you want?';
  if(args[0]==='-k'||args[0]==='--apropos')return args[1]?manApropos(args.slice(1).join(' ')):'apropos: what keyword do you want?';
  if(args[0]==='-a'){
    const target=args[1];
    if(!target)return 'man: missing manual page name';
    const page=manPage(target);
    return page||`No manual entry for ${target}`;
  }
  let section=null;
  let target=args[0];
  if(/^\d+$/.test(args[0])&&args[1]){section=args[0];target=args[1]}
  const page=manPage(target,section);
  return page||`No manual entry for ${target}${section?` in section ${section}`:''}`;
};
C.env=(a,s)=>`HOME=/home/user\nUSER=${US.cur()}\nSHELL=/bin/bash\nPWD=${s.cwd}\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOSTNAME=weblinux\nTERM=xterm-256color\nLANG=en_US.UTF-8`;
C.export=()=>'';C.alias=()=>'';
C.exit=()=>'\x1b[33mCannot exit: running in browser.\x1b[0m';
C.sudo=(args,s,stdin)=>{if(!args.length)return'usage: sudo command';if(C[args[0]])return C[args[0]](args.slice(1),s,stdin);return`sudo: ${args[0]}: command not found`};
C.help=()=>{const sec={'FILE SYSTEM':['pwd','ls','cd','mkdir','rmdir','rm','cp','mv','touch'],'FILE VIEWING':['cat','head','tail','less'],'SEARCH':['grep','find','locate','which'],'TEXT':['sort','uniq','wc','cut','awk','sed'],'PERMISSIONS':['chmod','chown','chgrp'],'PROCESS':['ps','top','kill'],'COMPRESSION':['tar','zip','gzip','gunzip'],'NETWORK':['ping','ifconfig','netstat','ssh','scp'],'PACKAGES':['apt'],'SYSTEM':['df','du','free','uname','whoami','who','hostname','id'],'USER MGMT':['useradd','userdel','passwd'],'MISC':['echo','date','cal','history','clear','man','env','help']};let o='\x1b[1;37mAvailable Commands\x1b[0m\n';for(const[s,cmds]of Object.entries(sec))o+=`\n\x1b[1;33m${s}\x1b[0m\n  \x1b[36m${cmds.join('\x1b[0m, \x1b[36m')}\x1b[0m\n`;o+='\n\x1b[90mSupports: pipes (|), redirects (> >> <), Tab completion, history\x1b[0m';return o};

/* ====== PIPE ENGINE ====== */
const Pipe=(()=>{
  function tokenize(input){const tk=[];let cur='',inS=false,inD=false,esc=false;for(let i=0;i<input.length;i++){const c=input[i];if(esc){cur+=c;esc=false;continue}if(c==='\\'&&!inS){esc=true;continue}if(c==="'"&&!inD){inS=!inS;continue}if(c==='"'&&!inS){inD=!inD;continue}if(!inS&&!inD){if(c==='|'||c==='>'||c==='<'){if(cur){tk.push(cur);cur=''}if(c==='>'&&input[i+1]==='>'){tk.push('>>');i++}else tk.push(c);continue}if(c===' '||c==='\t'){if(cur){tk.push(cur);cur=''}continue}}cur+=c}if(cur)tk.push(cur);return tk}
  function splitP(tk){const sg=[];let cur=[];for(const t of tk){if(t==='|'){if(cur.length)sg.push(cur);cur=[]}else cur.push(t)}if(cur.length)sg.push(cur);return sg}
  function exRedir(tk){const args=[];const rd={out:null,oApp:null,in:null};for(let i=0;i<tk.length;i++){if(tk[i]==='>'&&tk[i+1])rd.out=tk[++i];else if(tk[i]==='>>'&&tk[i+1])rd.oApp=tk[++i];else if(tk[i]==='<'&&tk[i+1])rd.in=tk[++i];else args.push(tk[i])}return{args,rd}}
  function execute(raw,state){
    const tr=raw.trim();if(!tr)return'';
    if(tr.includes('&&')){const parts=tr.split(/\s*&&\s*/);const r=[];for(const p of parts){const res=execute(p.trim(),state);if(res)r.push(res)}return r.join('\n')}
    if(tr.includes(';')){const parts=tr.split(/\s*;\s*/);const r=[];for(const p of parts){if(p.trim()){const res=execute(p.trim(),state);if(res)r.push(res)}}return r.join('\n')}
    const tk=tokenize(tr);const segs=splitP(tk);
    let pIn=null,lastO='';
    for(let i=0;i<segs.length;i++){
      const{args,rd}=exRedir(segs[i]);if(!args.length)continue;
      const cn=args[0];const ca=args.slice(1);
      let stdin=pIn;if(rd.in){const c=VFS.read(rd.in,state.cwd);if(c===null)return`bash: ${rd.in}: No such file or directory`;stdin=c}
      let out='';if(C[cn])out=C[cn](ca,state,stdin)||'';else out=`bash: ${cn}: command not found`;
      if(rd.out){VFS.write(rd.out,state.cwd,out);out=''}else if(rd.oApp){VFS.append(rd.oApp,state.cwd,out);out=''}
      pIn=out;lastO=out;
    }
    return lastO;
  }
  return{execute};
})();

/* ====== INIT FS ====== */
function initFS(){
  VFS._mkdirp('/home/user/projects');VFS._mkdirp('/home/user/.config');VFS._mkdirp('/home/user/.ssh');
  VFS._mkdirp('/etc');VFS._mkdirp('/var/log');VFS._mkdirp('/tmp');
  VFS._mkdirp('/usr/bin');VFS._mkdirp('/usr/local/bin');VFS._mkdirp('/bin');VFS._mkdirp('/root');VFS._mkdirp('/opt');VFS._mkdirp('/dev');
  VFS._mkfile('/home/user/notes.txt','Meeting Notes - March 2026\n==========================\n1. Project deadline moved to April 15th\n2. New team member starting next week: Sarah\n3. Budget approved for cloud infrastructure\n4. Weekly standups changed to 10:00 AM\n5. Code review process needs improvement\n6. Consider migrating to microservices\n7. Performance benchmarks due by end of month\n8. Security audit scheduled for next quarter');
  VFS._mkfile('/home/user/todo.txt','TODO List\n---------\n[x] Set up development environment\n[x] Review pull requests\n[ ] Write unit tests for auth module\n[ ] Update API documentation\n[ ] Fix login page CSS bug\n[ ] Deploy staging environment\n[ ] Refactor database queries\n[ ] Add error handling to payment flow\n[ ] Schedule team retrospective\n[ ] Update dependencies to latest versions');
  VFS._mkfile('/home/user/projects/app.js','const express = require(\'express\');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.use(express.json());\n\napp.get(\'/\', (req, res) => {\n  res.json({ message: \'Welcome to the API\', version: \'2.1.0\' });\n});\n\napp.get(\'/api/users\', (req, res) => {\n  res.json([\n    { id: 1, name: \'Alice\', role: \'admin\' },\n    { id: 2, name: \'Bob\', role: \'user\' },\n    { id: 3, name: \'Charlie\', role: \'moderator\' }\n  ]);\n});\n\napp.listen(PORT, () => console.log(\'Server on port \' + PORT));',{permissions:'-rwxr-xr-x'});
  VFS._mkfile('/home/user/projects/data.json','{\n  "application": "WebLinux Demo",\n  "version": "1.0.0",\n  "database": { "host": "localhost", "port": 5432 },\n  "features": { "dark_mode": true, "notifications": true },\n  "users_count": 1547\n}');
  VFS._mkfile('/home/user/projects/README.md','# WebLinux Project\nA browser-based Linux terminal simulator.\n## Features\n- Virtual file system\n- 50+ commands\n- Pipes and redirections\n- Process management');
  VFS._mkfile('/home/user/projects/.gitignore','node_modules/\n.env\n*.log\ndist/\n');
  VFS._mkfile('/home/user/projects/config.yml','server:\n  host: 0.0.0.0\n  port: 8080\n  workers: 4\nlogging:\n  level: info\n  format: json');
  VFS._mkfile('/home/user/projects/Makefile','CC=gcc\nCFLAGS=-Wall -O2\nTARGET=app\n\nall: $(TARGET)\n\nclean:\n\trm -f *.o $(TARGET)\n\n.PHONY: all clean');
  VFS._mkfile('/home/user/.bashrc','# ~/.bashrc\nexport PATH="/usr/local/bin:/usr/bin:/bin"\nalias ll="ls -la"\nalias la="ls -a"\n');
  VFS._mkfile('/home/user/.profile','# ~/.profile\n[ -f ~/.bashrc ] && . ~/.bashrc\n');
  VFS._mkfile('/home/user/.ssh/known_hosts','github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...\n');
  VFS._mkfile('/etc/passwd',US.getPF());
  VFS._mkfile('/etc/hosts','127.0.0.1\tlocalhost\n127.0.1.1\tweblinux\n::1\t\tlocalhost ip6-localhost\n');
  VFS._mkfile('/etc/hostname','weblinux');
  VFS._mkfile('/etc/os-release','NAME="WebLinux"\nVERSION="1.0 (Jammy)"\nID=weblinux\n');
  VFS._mkfile('/etc/resolv.conf','nameserver 8.8.8.8\nnameserver 8.8.4.4\n');
  VFS._mkfile('/var/log/sys.log','Mar 27 08:00:01 weblinux systemd[1]: Started Daily apt download activities.\nMar 27 08:01:12 weblinux CRON[4521]: (root) CMD (test -x /usr/sbin/anacron)\nMar 27 08:15:00 weblinux kernel: [42351.234] eth0: link up, 1000Mbps full duplex\nMar 27 09:00:00 weblinux systemd[1]: Starting Cleanup of Temporary Directories...\nMar 27 09:12:44 weblinux sshd[5102]: Accepted publickey for user from 192.168.1.50\nMar 27 10:00:00 weblinux systemd[1]: Starting Daily man-db regeneration...\nMar 27 10:15:22 weblinux kernel: [49922.001] CPU0: Core temperature above threshold\nMar 27 11:00:00 weblinux rsyslogd[412]: -- MARK --\nMar 27 12:00:00 weblinux rsyslogd[412]: -- MARK --');
  VFS._mkfile('/var/log/auth.log','Mar 27 08:00:01 weblinux sshd[1042]: Server listening on port 22\nMar 27 09:12:44 weblinux sshd[5102]: Accepted publickey for user\n');
}

/* ====== TERMINAL UI ====== */
(function boot(){
  initFS();
  const el=document.getElementById('terminal');
  const st={cwd:'/home/user',history:[],historyIdx:-1,input:'',cursor:0,saved:''};

  function promptH(){
    let dp=st.cwd;
    if(dp.startsWith('/home/user'))dp='~'+dp.slice(10);
    if(!dp)dp='~';
    return`<span class="prompt-user">user</span><span class="prompt-host">@weblinux</span><span class="prompt-sym">:</span><span class="prompt-path">${dp}</span><span class="prompt-dollar">$ </span>`;
  }

  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  function renderInput(){
    let il=document.getElementById('il');
    if(!il){il=document.createElement('div');il.id='il';il.style.display='inline';el.appendChild(il)}
    const b=esc(st.input.slice(0,st.cursor));
    const cc=st.cursor<st.input.length?esc(st.input[st.cursor]):' ';
    const a=st.cursor<st.input.length?esc(st.input.slice(st.cursor+1)):'';
    il.innerHTML=promptH()+b+'<span class="cursor-char cursor-blink">'+cc+'</span>'+a;
  }

  function wl(html){const d=document.createElement('div');d.className='output-line';d.innerHTML=html;el.appendChild(d)}
  function writeOut(text){if(!text)return;const h=Ansi.toHtml(text);h.split('\n').forEach(l=>wl(l||' '))}
  function removeIL(){const il=document.getElementById('il');if(il)il.remove()}
  function scroll(){el.scrollTop=el.scrollHeight}

  function submit(){
    const input=st.input;removeIL();wl(promptH()+esc(input));st.input='';st.cursor=0;
    const tr=input.trim();
    if(tr){st.history.push(tr);st.historyIdx=st.history.length;const r=Pipe.execute(tr,st);if(r==='\x1b[CLEAR]')el.innerHTML='';else if(r)writeOut(r)}
    renderInput();scroll();
  }

  /* Boot sequence - typewriter style */
  const bootLines = [
    '\x1b[1;32m  ██╗    ██╗███████╗██████╗ ██╗     ██╗███╗   ██╗██╗   ██╗██╗  ██╗\x1b[0m',
    '\x1b[1;32m  ██║    ██║██╔════╝██╔══██╗██║     ██║████╗  ██║██║   ██║╚██╗██╔╝\x1b[0m',
    '\x1b[1;32m  ██║ █╗ ██║█████╗  ██████╔╝██║     ██║██╔██╗ ██║██║   ██║ ╚███╔╝\x1b[0m',
    '\x1b[1;32m  ██║███╗██║██╔══╝  ██╔══██╗██║     ██║██║╚██╗██║██║   ██║ ██╔██╗\x1b[0m',
    '\x1b[1;32m  ╚███╔███╔╝███████╗██████╔╝███████╗██║██║ ╚████║╚██████╔╝██╔╝ ██╗\x1b[0m',
    '\x1b[1;32m   ╚══╝╚══╝ ╚══════╝╚═════╝ ╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝\x1b[0m',
    '',
    '\x1b[37m  WebLinux Terminal v1.1\x1b[0m  \x1b[90m·\x1b[0m  \x1b[33mKernel\x1b[0m 6.5.0-generic  \x1b[90m·\x1b[0m  \x1b[33mShell\x1b[0m bash 5.2',
    '\x1b[90m  Type "help" for available commands · "man <cmd>" for details\x1b[0m',
    ''
  ];

  let bootIdx = 0;
  function bootStep(){
    if(bootIdx < bootLines.length){
      writeOut(bootLines[bootIdx]);
      bootIdx++;
      const delay = 15;
      setTimeout(bootStep, delay);
    } else {
      renderInput();
      scroll();
    }
  }
  bootStep();

  /* Tab */
  function handleTab(){
    const parts=st.input.split(/\s+/);
    if(parts.length<=1){const partial=parts[0]||'';const m=Object.keys(C).filter(c=>c.startsWith(partial));if(m.length===1){st.input=m[0]+' ';st.cursor=st.input.length;renderInput()}else if(m.length>1){removeIL();wl(promptH()+esc(st.input));wl(m.join('  '));renderInput()}}
    else{const partial=parts[parts.length-1];const comps=VFS.completions(partial,st.cwd);if(comps.length===1){parts[parts.length-1]=comps[0];st.input=parts.join(' ');st.cursor=st.input.length;renderInput()}else if(comps.length>1){let common=comps[0];for(let i=1;i<comps.length;i++){while(!comps[i].startsWith(common))common=common.slice(0,-1)}if(common.length>partial.length){parts[parts.length-1]=common;st.input=parts.join(' ');st.cursor=st.input.length;renderInput()}else{removeIL();wl(promptH()+esc(st.input));wl(comps.join('  '));renderInput()}}}scroll()
  }

  /* Keys */
  document.addEventListener('keydown',function(ev){
    const k=ev.key;
    if(ev.ctrlKey&&k==='c'){ev.preventDefault();removeIL();wl(promptH()+esc(st.input)+'^C');st.input='';st.cursor=0;renderInput();scroll();return}
    if(ev.ctrlKey&&k==='l'){ev.preventDefault();el.innerHTML='';renderInput();scroll();return}
    if(ev.ctrlKey&&k==='a'){ev.preventDefault();st.cursor=0;renderInput();return}
    if(ev.ctrlKey&&k==='e'){ev.preventDefault();st.cursor=st.input.length;renderInput();return}
    if(ev.ctrlKey&&k==='u'){ev.preventDefault();st.input=st.input.slice(st.cursor);st.cursor=0;renderInput();return}
    if(ev.ctrlKey&&k==='k'){ev.preventDefault();st.input=st.input.slice(0,st.cursor);renderInput();return}
    if(ev.ctrlKey&&k==='w'){ev.preventDefault();const b=st.input.slice(0,st.cursor);const a=st.input.slice(st.cursor);const t=b.trimEnd();const ls=t.lastIndexOf(' ');const nb=ls===-1?'':t.slice(0,ls+1);st.input=nb+a;st.cursor=nb.length;renderInput();return}
    if(k==='Tab'){ev.preventDefault();handleTab();return}
    if(k==='Enter'){ev.preventDefault();submit();return}
    if(k==='Backspace'){ev.preventDefault();if(st.cursor>0){st.input=st.input.slice(0,st.cursor-1)+st.input.slice(st.cursor);st.cursor--;renderInput();scroll()}return}
    if(k==='Delete'){ev.preventDefault();if(st.cursor<st.input.length){st.input=st.input.slice(0,st.cursor)+st.input.slice(st.cursor+1);renderInput()}return}
    if(k==='ArrowUp'){ev.preventDefault();if(st.historyIdx===st.history.length)st.saved=st.input;if(st.historyIdx>0){st.historyIdx--;st.input=st.history[st.historyIdx];st.cursor=st.input.length;renderInput();scroll()}return}
    if(k==='ArrowDown'){ev.preventDefault();if(st.historyIdx<st.history.length){st.historyIdx++;st.input=st.historyIdx===st.history.length?st.saved:st.history[st.historyIdx];st.cursor=st.input.length;renderInput();scroll()}return}
    if(k==='ArrowLeft'){ev.preventDefault();if(st.cursor>0){st.cursor--;renderInput()}return}
    if(k==='ArrowRight'){ev.preventDefault();if(st.cursor<st.input.length){st.cursor++;renderInput()}return}
    if(k==='Home'){ev.preventDefault();st.cursor=0;renderInput();return}
    if(k==='End'){ev.preventDefault();st.cursor=st.input.length;renderInput();return}
    if(k.length===1&&!ev.ctrlKey&&!ev.altKey&&!ev.metaKey){ev.preventDefault();st.input=st.input.slice(0,st.cursor)+k+st.input.slice(st.cursor);st.cursor++;renderInput();scroll()}
  });
  document.addEventListener('paste',function(ev){ev.preventDefault();const t=(ev.clipboardData||window.clipboardData).getData('text').replace(/[\r\n]+/g,'');st.input=st.input.slice(0,st.cursor)+t+st.input.slice(st.cursor);st.cursor+=t.length;renderInput();scroll()});
  el.addEventListener('click',()=>el.focus());
})();
