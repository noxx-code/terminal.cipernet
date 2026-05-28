"use strict";

/* ====== STATUS BAR CLOCK ====== */
(function updateClock() {
  const timeElement = document.getElementById('status-time');
  if (timeElement) {
    timeElement.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  setTimeout(updateClock, 1000);
})();

function updateStatusCwd(cwd) {
  const cwdElement = document.getElementById('status-cwd');
  const titleBarElement = document.querySelector('.title-bar-title');
  const sessionUser = window.weblinuxSessionUser || 'pass';

  let displayPath = cwd;
  if (displayPath.startsWith('/home/pass')) displayPath = `~${displayPath.slice(10)}`;
  if (!displayPath) displayPath = '~';

  if (cwdElement) cwdElement.textContent = displayPath;
  if (titleBarElement) {
    titleBarElement.innerHTML = `${sessionUser}@weblinux <span>${displayPath}</span> <span>— bash</span>`;
  }
}

function getRuntimeUser(state) {
  if (state && state.isRoot) return 'root';
  if (state && typeof state.user === 'string' && state.user) return state.user;
  if (window.WebLinuxPermissions && typeof window.WebLinuxPermissions.getCurrentUser === 'function') {
    return window.WebLinuxPermissions.getCurrentUser(state);
  }
  return window.weblinuxSessionUser || 'pass';
}

function getPermissionHelper() {
  return window.WebLinuxPermissions || null;
}

function getRuntimeEnv(state) {
  const runtimeState = state || {};
  if (!runtimeState.env || typeof runtimeState.env !== 'object') {
    runtimeState.env = {
      PATH: '/bin:/usr/bin:/usr/local/bin',
      HOME: '/home/pass',
      USER: 'pass',
      SHELL: '/bin/bash',
      PWD: runtimeState && typeof runtimeState.cwd === 'string' ? runtimeState.cwd : '/home/pass',
      HOSTNAME: 'weblinux',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
    };
  }

  const isRoot = !!runtimeState.isRoot;
  runtimeState.env.USER = isRoot ? 'root' : getRuntimeUser(runtimeState);
  runtimeState.env.HOME = isRoot ? '/root' : '/home/pass';
  runtimeState.env.PWD = runtimeState && typeof runtimeState.cwd === 'string' ? runtimeState.cwd : '/home/pass';
  if (!runtimeState.env.PATH) runtimeState.env.PATH = '/bin:/usr/bin:/usr/local/bin';
  return runtimeState.env;
}

function expandShellVariables(input, state) {
  const source = String(input || '');
  if (!source.includes('$')) return source;

  const env = getRuntimeEnv(state);
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += ch;
      continue;
    }

    if (ch === '\\' && i + 1 < source.length) {
      result += ch + source[i + 1];
      i += 1;
      continue;
    }

    if (ch === '$' && !inSingleQuote) {
      const next = source[i + 1] || '';
      if (!/[A-Za-z_]/.test(next)) {
        result += ch;
        continue;
      }

      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
      const key = source.slice(i + 1, j);
      result += Object.prototype.hasOwnProperty.call(env, key) ? String(env[key]) : '';
      i = j - 1;
      continue;
    }

    result += ch;
  }

  return result;
}

function formatMode(mode, type) {
  const value = String(mode || '');
  if (/^[01]?[0-7]{3}$/.test(value)) {
    const digits = value.length === 4 ? value.slice(1) : value;
    const bits = digits.split('').map((digit) => {
      const numeric = parseInt(digit, 10);
      return `${numeric & 4 ? 'r' : '-'}${numeric & 2 ? 'w' : '-'}${numeric & 1 ? 'x' : '-'}`;
    }).join('');
    return `${type === 'directory' ? 'd' : '-'}${bits}`;
  }
  return value;
}

function displayPermissions(node) {
  if (!node || !node.permissions) {
    if (node && node.type === 'directory') return 'drwxr-xr-x';
    if (node && node.type === 'executable') return '-rwxr-xr-x';
    return '-rw-r--r--';
  }
  return formatMode(node.permissions, node.type);
}

window.__weblinuxLoginComplete = false;
window.weblinuxSessionUser = window.weblinuxSessionUser || 'pass';
window.weblinuxSession = window.weblinuxSession || null;
window.__weblinuxInputManager = null;
window.__weblinuxTerminalState = null;

const WebLinuxAuth = (() => {
  const STORAGE_KEY = 'weblinux.auth';

  function readRecord() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        username: typeof parsed.username === 'string' ? parsed.username : 'pass',
        password: typeof parsed.password === 'string' ? parsed.password : '',
      };
    } catch (error) {
      return null;
    }
  }

  function writeRecord(username, password) {
    window.weblinuxSession = {
      username: username || 'pass',
      password: password || '',
    };

    try {
      // Persist only the username; keep the password in memory so sudo still works.
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        username: window.weblinuxSession.username,
      }));
    } catch (error) {
      return false;
    }

    return true;
  }

  function getPassword() {
    if (window.weblinuxSession && typeof window.weblinuxSession.password === 'string') {
      return window.weblinuxSession.password;
    }

    const record = readRecord();
    return record ? record.password : '';
  }

  function getUsername() {
    const record = readRecord();
    return record ? record.username : (window.weblinuxSessionUser || 'pass');
  }

  function verifyPassword(candidate) {
    return !!candidate && candidate === getPassword();
  }

  return {
    readRecord,
    writeRecord,
    getPassword,
    getUsername,
    verifyPassword,
  };
})();

/* ====== LOGIN SCREEN ====== */
const LoginScreen = (() => {
  const bootLines = [
    'Boot Into the Browser Shell',
    'Lightweight Linux Simulation',
    'Built for Learning and Exploration'
  ];
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let running = false;
  let matrixAnimationId = 0;
  let bootTimerId = 0;

  function setStatus(statusElement, text, state = 'idle') {
    if (!statusElement) return;
    statusElement.textContent = text;
    statusElement.dataset.state = state;
  }

  function appendBootLine(bootElement, text) {
    if (!bootElement) return;

    const lineElement = document.createElement('div');
    lineElement.className = 'login-boot-line';
    lineElement.textContent = text;
    bootElement.appendChild(lineElement);
  }

  function buildMatrixState(canvas) {
    const context = canvas.getContext('2d');
    const state = {
      canvas,
      context,
      width: 0,
      height: 0,
      columns: [],
      fontSize: 16,
      glyphs: '01#/\\[]{}<>|.:;*+abcdefghijklmnopqrstuvwxyz',
    };

    function resize() {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      state.width = canvas.clientWidth || window.innerWidth;
      state.height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(state.width * scale);
      canvas.height = Math.floor(state.height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      state.fontSize = Math.max(12, Math.round(Math.min(state.width / 96, 18)));
      const columnCount = Math.max(1, Math.floor(state.width / (state.fontSize * 0.9)));
      state.columns = new Array(columnCount).fill(0).map((_, index) => ({
        x: index * state.fontSize * 0.9,
        y: Math.random() * state.height,
        speed: 0.8 + Math.random() * 2.1,
        length: 8 + Math.floor(Math.random() * 18),
      }));
    }

    function draw() {
      if (!running) return;

      context.fillStyle = 'rgba(0, 0, 0, 0.14)';
      context.fillRect(0, 0, state.width, state.height);
      context.font = `${state.fontSize}px 'JetBrains Mono', 'IBM Plex Mono', monospace`;
      context.textAlign = 'left';
      context.textBaseline = 'top';

      for (const column of state.columns) {
        const headX = column.x;
        const headY = column.y;

        for (let i = 0; i < column.length; i++) {
          const alpha = Math.max(0, 1 - (i / column.length));
          context.fillStyle = `rgba(124, 255, 138, ${0.08 + (alpha * 0.82)})`;
          const glyph = state.glyphs[Math.floor(Math.random() * state.glyphs.length)];
          context.fillText(glyph, headX, headY - (i * state.fontSize * 1.02));
        }

        column.y += column.speed * (reducedMotion ? 0.35 : 1);
        if (column.y - column.length * state.fontSize > state.height + 40) {
          column.y = -Math.random() * state.height * 0.45;
          column.speed = 0.8 + Math.random() * 2.1;
          column.length = 8 + Math.floor(Math.random() * 18);
        }
      }

      matrixAnimationId = window.requestAnimationFrame(draw);
    }

    resize();
    return { resize, draw };
  }

  function revealTerminal(username) {
    const terminalElement = document.getElementById('terminal');
    const terminalInput = document.getElementById('terminal-input');
    const inputManager = window.__weblinuxInputManager;
    const terminalState = window.__weblinuxTerminalState;

    window.weblinuxSessionUser = username || 'pass';
    if (window.WebLinuxUsers && typeof window.WebLinuxUsers.setCurrentUser === 'function') {
      window.WebLinuxUsers.setCurrentUser(window.weblinuxSessionUser);
    }

    if (terminalElement) terminalElement.innerHTML = '';

    if (terminalState) {
      terminalState.input = '';
      terminalState.cursor = 0;
      terminalState.user = window.weblinuxSessionUser;
      if (typeof updateStatusCwd === 'function') updateStatusCwd(terminalState.cwd);
    }

    if (terminalElement) {
      const loginLine = document.createElement('div');
      loginLine.className = 'output-line';
      loginLine.textContent = `Last login: ${new Date().toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })} on tty1`;
      terminalElement.appendChild(loginLine);

      const bannerLine = document.createElement('div');
      bannerLine.className = 'output-line';
      bannerLine.innerHTML = '<span style="color:#7bebb2;font-weight:700;">WEBLINUX v1.3</span> <span style="color:#5a6270;">·</span> browser-native Linux runtime .. enter to continue';
      terminalElement.appendChild(bannerLine);
    }

    if (typeof inputManager?.setEnabled === 'function') {
      inputManager.setEnabled(true);
    } else if (terminalInput) {
      terminalInput.disabled = false;
    }

    if (typeof inputManager?.focus === 'function') {
      inputManager.focus();
    } else if (terminalInput) {
      terminalInput.focus({ preventScroll: true });
    }

    if (terminalElement) {
      terminalElement.scrollTop = terminalElement.scrollHeight;
    }
  }

  function completeLogin(screenElement, username, password) {
    if (window.__weblinuxLoginComplete) return;

    const loginStatus = document.getElementById('login-status');
    setStatus(loginStatus, 'Authentication accepted. Switching tty1...', 'idle');

    WebLinuxAuth.writeRecord(username, password);
    window.__weblinuxLoginComplete = true;
    running = false;
    if (matrixAnimationId) window.cancelAnimationFrame(matrixAnimationId);
    document.body.classList.remove('login-booting');
    document.body.classList.add('login-complete');

    if (screenElement) {
      screenElement.setAttribute('aria-hidden', 'true');
      screenElement.classList.add('login-screen--exit');
    }

    window.setTimeout(() => {
      if (screenElement) screenElement.hidden = true;
      revealTerminal(username);
    }, 420);
  }

  function init() {
    const screenElement = document.getElementById('login-screen');
    const bootElement = document.getElementById('login-boot');
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const statusElement = document.getElementById('login-status');
    const matrixCanvas = document.getElementById('login-matrix');

    if (!screenElement || !bootElement || !loginForm || !usernameInput || !passwordInput || !statusElement) return null;

    if (matrixCanvas && typeof matrixCanvas.getContext === 'function') {
      const matrixState = buildMatrixState(matrixCanvas);
      running = true;

      if (!reducedMotion) {
        const startMatrix = () => {
          matrixState.draw();
        };

        startMatrix();
        window.addEventListener('resize', matrixState.resize, { passive: true });
      }
    }

    const bootSequence = reducedMotion ? bootLines.slice(0, 2) : bootLines;
    let bootIndex = 0;

    const runBoot = () => {
      appendBootLine(bootElement, bootSequence[bootIndex]);
      bootIndex += 1;

      if (bootIndex < bootSequence.length) {
        bootTimerId = window.setTimeout(runBoot, reducedMotion ? 220 : 160);
      } else {
        setStatus(statusElement, 'Waiting for authentication.', 'idle');
        window.setTimeout(() => usernameInput.focus({ preventScroll: true }), reducedMotion ? 120 : 240);
      }
    };

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const username = usernameInput.value.trim() || 'pass';
      const password = passwordInput.value;

      if (!password) {
        setStatus(statusElement, 'Password required.', 'error');
        passwordInput.focus({ preventScroll: true });
        return;
      }

      setStatus(statusElement, 'Verifying credentials...', 'idle');
      window.setTimeout(() => completeLogin(screenElement, username, password), 520);
    });

    usernameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        passwordInput.focus({ preventScroll: true });
      }
    });

    passwordInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loginForm.requestSubmit();
      }
    });

    runBoot();

    return {
      destroy() {
        running = false;
        window.clearTimeout(bootTimerId);
        window.cancelAnimationFrame(matrixAnimationId);
      }
    };
  }

  return { init };
})();

/* ====== TERMINAL FITTING ====== */
const TerminalFit = (() => {
  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 13;
  const BASE_FONT_SIZE = 13;
  const measurementCanvas = document.createElement('canvas');
  const measurementContext = measurementCanvas.getContext('2d');
  let frameId = 0;

  function getLongestLineLength(terminalElement) {
    let longest = 0;
    for (const node of terminalElement.children) {
      const text = node.textContent || '';
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (line.length > longest) longest = line.length;
      }
    }
    return longest;
  }

  function getAvailableWidth(terminalElement) {
    const parent = terminalElement.parentElement;
    if (!parent) return 0;

    const style = getComputedStyle(terminalElement);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    return Math.max(0, parent.clientWidth - paddingLeft - paddingRight);
  }

  function measureCharacterWidth(terminalElement, fontSize) {
    if (!measurementContext) return fontSize * 0.6;

    const style = getComputedStyle(terminalElement);
    measurementContext.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    const sample = '00000000000000000000';
    return measurementContext.measureText(sample).width / sample.length || fontSize * 0.6;
  }

  function apply(terminalElement) {
    const availableWidth = getAvailableWidth(terminalElement);
    if (!availableWidth) return;

    const longestLineLength = Math.max(1, getLongestLineLength(terminalElement));
    const baseCharacterWidth = measureCharacterWidth(terminalElement, BASE_FONT_SIZE);
    const idealFontSize = availableWidth / (longestLineLength * (baseCharacterWidth / BASE_FONT_SIZE));
    const fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.floor(idealFontSize)));
    const widthAtFontSize = longestLineLength * baseCharacterWidth * (fontSize / BASE_FONT_SIZE);
    const scale = widthAtFontSize > availableWidth ? availableWidth / widthAtFontSize : 1;

    terminalElement.style.setProperty('--terminal-font-size', `${fontSize}px`);
    terminalElement.style.setProperty('--terminal-scale', String(Math.min(1, scale)));
  }

  function schedule(terminalElement) {
    if (frameId) cancelAnimationFrame(frameId);

    frameId = requestAnimationFrame(() => {
      frameId = 0;
      apply(terminalElement);
    });
  }

  return { schedule };
})();

/* ====== ANSI PARSER ====== */
const Ansi = (() => {
  const FG = {
    30: '#6e7681',
    31: '#ff5c57',
    32: '#5af78e',
    33: '#f3f99d',
    34: '#57c7ff',
    35: '#c792ea',
    36: '#9aedfe',
    37: '#f0f6fc',
    90: '#5a6270',
    91: '#ff8a85',
    92: '#7bebb2',
    93: '#e3c97a',
    94: '#7bc4ff',
    95: '#d2a8ff',
    96: '#79e3f5',
    97: '#f0f6fc',
  };

  function toHtml(input) {
    if (!input) return '';

    let output = '';
    let currentColor = '';
    let isBold = false;
    let isReverse = false;
    let i = 0;

    while (i < input.length) {
      if (input[i] === '\x1b' && input[i + 1] === '[') {
        let j = i + 2;
        let code = '';
        while (j < input.length && !(/[A-Za-z]/).test(input[j])) {
          code += input[j];
          j++;
        }

        if (input[j] === 'm') {
          const codes = code.split(';').map(Number);
          for (const ansiCode of codes) {
            if (ansiCode === 0) {
              if (currentColor || isBold || isReverse) output += '</span>';
              currentColor = '';
              isBold = false;
              isReverse = false;
            } else if (ansiCode === 1) {
              if (currentColor || isBold || isReverse) output += '</span>';
              isBold = true;
              output += buildSpan(currentColor, isBold, isReverse);
            } else if (ansiCode === 7) {
              if (currentColor || isBold || isReverse) output += '</span>';
              isReverse = true;
              output += buildSpan(currentColor, isBold, isReverse);
            } else if ((ansiCode >= 30 && ansiCode <= 37) || (ansiCode >= 90 && ansiCode <= 97)) {
              if (currentColor || isBold || isReverse) output += '</span>';
              currentColor = FG[ansiCode] || '';
              output += buildSpan(currentColor, isBold, isReverse);
            }
          }
        }

        i = j + 1;
        continue;
      }

      if (input[i] === '<') output += '&lt;';
      else if (input[i] === '>') output += '&gt;';
      else if (input[i] === '&') output += '&amp;';
      else output += input[i];

      i++;
    }

    if (currentColor || isBold || isReverse) output += '</span>';
    return output;
  }

  function buildSpan(color, bold, reverse) {
    let style = '<span style="';
    if (reverse) style += 'background:var(--text-primary);color:var(--bg-terminal);';
    else if (color) style += `color:${color};`;

    if (bold) style += 'font-weight:700;';
    return `${style}">`;
  }

  return { toHtml };
})();

/* ====== VFS ====== */
const VFS = window.BrowserLinuxVFS || window.LinuxVFS;
if (!VFS) throw new Error('BrowserLinuxVFS is not available');

/* ====== PROCESS MANAGER ====== */
const PM=(()=>{let np=1;const P=[];
  function init(){P.length=0;np=1;add('init','root','S');add('bash','user','R');add('systemd','root','S');add('sshd','root','S');add('cron','root','S');add('dbus-daemon','root','S');add('rsyslogd','root','S')}
  function add(n,u,st){const pid=np++;P.push({pid,name:n,user:u||'user',status:st||'S',cpu:(Math.random()*2).toFixed(1),mem:(Math.random()*3).toFixed(1),vsz:Math.floor(Math.random()*100000+10000),rss:Math.floor(Math.random()*20000+1000),start:'00:'+String(Math.floor(Math.random()*60)).padStart(2,'0')});return pid}
  function kill(pid,sig=15){const i=P.findIndex(p=>p.pid===pid);if(i===-1)return`kill: (${pid}) - No such process`;if(P[i].name==='init'||P[i].name==='bash')return`kill: (${pid}) - Operation not permitted`;if(sig===9)P.splice(i,1);else P[i].status='T';return null}
  function list(){return[...P]}
  init();return{add,kill,list};
})();

/* ====== USER SYSTEM ====== */
const US=(()=>{const db={root:{uid:0,gid:0,home:'/root',shell:'/bin/bash'},pass:{uid:1000,gid:1000,home:'/home/pass',shell:'/bin/bash'},daemon:{uid:1,gid:1,home:'/usr/sbin',shell:'/usr/sbin/nologin'},nobody:{uid:65534,gid:65534,home:'/nonexistent',shell:'/usr/sbin/nologin'}};
  function addU(n){if(db[n])return`useradd: user '${n}' already exists`;db[n]={uid:1000+Object.keys(db).length,gid:1000+Object.keys(db).length,home:'/home/'+n,shell:'/bin/bash'};VFS._mkdirp('/home/'+n);return null}
  function delU(n){if(!db[n])return`userdel: user '${n}' does not exist`;if(n==='root'||n==='pass')return`userdel: cannot remove essential user`;delete db[n];return null}
  function passwd(n){if(!db[n])return`passwd: user '${n}' does not exist`;return`passwd: password updated successfully for ${n}`}
  function getPF(){return Object.entries(db).map(([n,u])=>`${n}:x:${u.uid}:${u.gid}:${n}:${u.home}:${u.shell}`).join('\n')}
  function cur(){return'pass'}function exists(n){return!!db[n]}
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
/* ====== JSON MANAGERS INITIALIZATION ====== */
async function initializeJSONManagers() {
  try {
    // Load command manifest
    await CommandManager.init();
    // Load manual pages
    await ManManager.init();
    // Load VFS initial state
    await VFSManager.init();
    console.log('JSON managers initialized successfully');
  } catch (error) {
    console.warn('Error initializing JSON managers:', error);
  }
}

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
  nano:{section:'1',name:'nano',summary:'simple fullscreen text editor',synopsis:'nano FILE',description:'Open a fullscreen nano-style editor overlay for editing files in the virtual filesystem.',examples:['nano notes.txt','nano ~/projects/app.js'],seealso:['cat(1)','less(1)','man(1)']},
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

function manRecord(name){
  if (ManManager && ManManager.getEntry) {
    const entry = ManManager.getEntry(name);
    if (entry) return `${entry.name} (${entry.section}) - ${entry.summary}`;
  }

  const entry = Man[name];
  if (!entry) return null;
  return `${entry.name} (${entry.section}) - ${entry.summary}`;
}

function manPage(name, section) {
  if (ManManager && ManManager.getPage) {
    const page = ManManager.getPage(name, section);
    if (page) return page;
  }

  const entry = Man[name];
  if (!entry) return null;
  if (section && String(section) !== String(entry.section)) return null;

  const lines = [];
  lines.push(`${entry.name.toUpperCase()}(${entry.section})`);
  lines.push('');
  lines.push('NAME');
  lines.push(`    ${entry.name} - ${entry.summary}`);
  lines.push('');
  lines.push('SYNOPSIS');
  lines.push(`    ${entry.synopsis}`);

  if (entry.description) {
    lines.push('');
    lines.push('DESCRIPTION');
    lines.push(`    ${entry.description}`);
  }

  if (entry.options && entry.options.length) {
    lines.push('');
    lines.push('OPTIONS');
    for (const option of entry.options) lines.push(`    ${option}`);
  }

  if (entry.examples && entry.examples.length) {
    lines.push('');
    lines.push('EXAMPLES');
    for (const example of entry.examples) lines.push(`    $ ${example}`);
  }

  if (entry.seealso && entry.seealso.length) {
    lines.push('');
    lines.push('SEE ALSO');
    lines.push(`    ${entry.seealso.join(', ')}`);
  }

  return lines.join('\n');
}

function manWhatis(name) {
  if (ManManager && ManManager.getWhatis) {
    const whatis = ManManager.getWhatis(name);
    if (whatis) return whatis;
  }

  return manRecord(name);
}

function manApropos(term){
  // Try JSON manager first if available
  if (ManManager && ManManager.exists) {
    return ManManager.searchApropos(term);
  }
  // Fallback to hardcoded logic
  const needle=(term||'').toLowerCase();
  if(!needle)return 'apropos: keyword expected';
  const hits=Object.values(Man)
    .filter(entry=>[entry.name,entry.summary,entry.description,...(entry.options||[]),...(entry.examples||[])].join(' ').toLowerCase().includes(needle))
    .map(entry=>`${entry.name} (${entry.section}) - ${entry.summary}`);
  return hits.length?hits.join('\n'):'apropos: nothing appropriate';
}

function getManifestHelpCatalog() {
  if (!CommandManager || typeof CommandManager.getCatalog !== 'function') return [];
  const catalog = CommandManager.getCatalog();
  if (!Array.isArray(catalog) || !catalog.length) return [];

  return catalog.map((group) => ({
    category: group.category,
    commands: (group.commands || []).map((entry) => ({
      name: entry.name,
      summary: entry.summary || '',
    })),
  }));
}

function getFallbackHelpCatalog() {
  const sections = {
    'FILE SYSTEM': ['pwd', 'ls', 'cd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'touch', 'stat', 'tree', 'basename', 'dirname', 'realpath'],
    'FILE VIEWING': ['cat', 'head', 'tail', 'less'],
    SEARCH: ['grep', 'find', 'locate', 'which'],
    TEXT: ['sort', 'uniq', 'wc', 'cut', 'awk', 'sed'],
    EDITORS: ['nano'],
    PERMISSIONS: ['chmod', 'chown', 'chgrp'],
    PROCESS: ['ps', 'top', 'kill'],
    COMPRESSION: ['tar', 'zip', 'gzip', 'gunzip'],
    NETWORK: ['ping', 'ifconfig', 'netstat', 'ssh', 'scp'],
    PACKAGES: ['apt'],
    SYSTEM: ['df', 'du', 'free', 'uname', 'whoami', 'who', 'hostname', 'id'],
    'USER MGMT': ['useradd', 'userdel', 'passwd'],
    SHELL: ['type', 'echo', 'date', 'cal', 'history', 'clear', 'man', 'env', 'export', 'alias', 'unset', 'exit', 'sudo', 'help'],
  };

  return Object.entries(sections).map(([category, commandNames]) => ({
    category,
    commands: commandNames.map((name) => {
      const entry = Man[name] || null;
      return {
        name,
        summary: entry && entry.summary ? entry.summary : '',
      };
    }),
  }));
}

function getHelpCatalog() {
  const catalog = getManifestHelpCatalog();
  return catalog.length ? catalog : getFallbackHelpCatalog();
}

function renderHelpCatalog(catalog) {
  const lines = ['\x1b[1;37mAvailable Commands\x1b[0m'];

  for (const group of catalog) {
    const category = String(group.category || 'UTILITIES').replace(/_/g, ' ');
    lines.push('');
    lines.push(`\x1b[1;33m${category}\x1b[0m`);

    const commandLines = (group.commands || [])
      .slice()
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
      .map((entry) => {
        const summary = entry && entry.summary ? ` - ${entry.summary}` : '';
        return `  \x1b[36m${entry.name}\x1b[0m${summary}`;
      });

    lines.push(commandLines.join('\n'));
  }

  lines.push('');
  lines.push('\x1b[90mSupports: pipes (|), redirects (> >> <), Tab completion, history\x1b[0m');
  return lines.join('\n');
}

function formatStatTimestamp(value) {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getPathName(pathValue, cwd) {
  if (!pathValue) return '';
  return VFS.basename ? VFS.basename(pathValue, cwd || '/') : String(pathValue).split('/').filter(Boolean).pop() || '/';
}

function getNormalizedPath(pathValue, cwd) {
  if (!VFS || typeof VFS.absStr !== 'function') return String(pathValue || '');
  return VFS.absStr(pathValue, cwd || '/');
}

function getCommandRegistry() {
  return window.__weblinuxCommandRegistry || null;
}

// Command resolution is centralized so type, which, autocomplete, and dispatch
// all classify names from the same runtime registry flow.
function resolveCommandTarget(commandName, state) {
  if (!commandName) return { status: 'missing', name: '' };

  const normalizedName = String(commandName);
  if (SHELL_BUILTINS.has(normalizedName)) {
    return { status: 'builtin', name: normalizedName };
  }

  const executable = findExecutable(normalizedName, state);
  if (executable && executable.permissionDenied) {
    return { status: 'denied', name: normalizedName, executable };
  }
  if (executable) {
    return { status: 'executable', name: executable.command || normalizedName, executable };
  }

  const runtimeCommands = getCommandRegistry();
  if (runtimeCommands && runtimeCommands[normalizedName]) {
    return { status: 'command', name: normalizedName };
  }

  if (CommandManager && typeof CommandManager.getCommand === 'function' && CommandManager.getCommand(normalizedName)) {
    return { status: 'command', name: normalizedName, manifest: true };
  }

  return { status: 'missing', name: normalizedName, executable: null };
}

function describeCommandTarget(commandName, state) {
  if (!commandName) return 'type: missing command name';
  const resolved = resolveCommandTarget(commandName, state);

  if (resolved.status === 'builtin') return `${resolved.name} is a shell builtin`;
  if (resolved.status === 'executable' && resolved.executable && resolved.executable.path) return `${resolved.name} is ${resolved.executable.path}`;
  if (resolved.status === 'command') return `${resolved.name} is a shell command`;
  return `${resolved.name} not found`;
}

function buildTreeLines(node, depthLimit, prefix, depth, seen, lines) {
  if (!node || node.type !== 'directory' || !node.children) return;
  if (depth >= depthLimit) {
    lines.push(`${prefix}└── ...`);
    return;
  }

  const children = Object.values(node.children).slice().sort((left, right) => left.name.localeCompare(right.name));
  children.forEach((childNode, index) => {
    const isLast = index === children.length - 1;
    const branch = isLast ? '└── ' : '├── ';
    lines.push(`${prefix}${branch}${childNode.name}`);

    if (childNode.type === 'directory') {
      const nextPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
      const nodeKey = childNode.path || `${prefix}/${childNode.name}`;
      if (seen.has(nodeKey)) {
        lines.push(`${nextPrefix}└── ...`);
        return;
      }
      seen.add(nodeKey);
      buildTreeLines(childNode, depthLimit, nextPrefix, depth + 1, seen, lines);
    }
  });
}

function formatTree(pathValue, cwd) {
  const normalizedPath = getNormalizedPath(pathValue || '.', cwd);
  const node = VFS.getN(normalizedPath, '/');
  if (!node) return `tree: ${pathValue}: No such file or directory`;

  const lines = [];
  const label = !pathValue || pathValue === '.' ? '.' : normalizedPath;
  lines.push(label);

  if (node.type !== 'directory') return lines.join('\n');

  buildTreeLines(node, 25, '', 0, new Set([node.path || normalizedPath]), lines);
  return lines.join('\n');
}

function formatStatOutput(pathValue, cwd) {
  const normalizedPath = getNormalizedPath(pathValue, cwd);
  const node = VFS.getN(normalizedPath, '/');
  if (!node) return `stat: cannot stat '${pathValue}': No such file or directory`;

  if (normalizedPath === '/etc/passwd') {
    console.log('stat debug node', node);
  }

  const kindMap = {
    directory: 'directory',
    executable: 'executable file',
    virtual: 'virtual file',
    file: 'regular file',
  };

  const createdAt = node.createdAt || node.modifiedAt || Date.now();
  const modifiedAt = node.modifiedAt || createdAt;
  const permissions = displayPermissions(node);
  const size = typeof node.size === 'number' ? node.size : 0;
  const owner = node.owner !== undefined && node.owner !== null ? node.owner : 'unknown';
  const group = node.group !== undefined && node.group !== null ? node.group : 'unknown';

  return [
    `  File: ${normalizedPath}`,
    `  Path: ${normalizedPath}`,
    `  Type: ${kindMap[node.type] || node.type || 'file'}`,
    `  Size: ${size}`,
    `  Permissions: ${permissions}`,
    `  Owner: ${owner}`,
    `  Group: ${group}`,
    `  Created: ${formatStatTimestamp(createdAt)}`,
    `  Modified: ${formatStatTimestamp(modifiedAt)}`,
    `  Changed: ${formatStatTimestamp(modifiedAt)}`,
  ].join('\n');
}

function formatRealPath(pathValue, cwd) {
  const normalizedPath = getNormalizedPath(pathValue, cwd);
  const node = VFS.getN(normalizedPath, '/');
  if (!node) return `realpath: ${pathValue}: No such file or directory`;
  return normalizedPath;
}

/* ====== COMMANDS ====== */
const C={};
const SHELL_BUILTINS = new Set(['cd', 'export', 'exit', 'pwd', 'history', 'alias', 'unset', 'type']);
function fmtL(e){const pm=displayPermissions(e);const lk=e.type==='directory'?'2':'1';const ow=(e.owner||'pass').padEnd(6);const gr=(e.group||'pass').padEnd(6);const sz=String(e.size||0).padStart(6);const d=new Date(e.modifiedAt||Date.now());const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];const ds=`${mo[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;const cl=e.type==='directory'?'\x1b[1;34m':'';const rs=e.type==='directory'?'\x1b[0m':'';return`${pm} ${lk} ${ow} ${gr} ${sz} ${ds} ${cl}${e.name}${rs}`}
function resolveFsPath(pathValue, cwd){return VFS.resolvePath(pathValue, cwd);}
function resolveFsNode(pathValue, cwd){return VFS.getN(resolveFsPath(pathValue, cwd), '/');}
function resolveFsParent(pathValue, cwd){const absolutePath=resolveFsPath(pathValue, cwd);return{path:absolutePath,parentPath:VFS.dirname(absolutePath,'/'),node:resolveFsNode(absolutePath,'/'),parentNode:resolveFsNode(VFS.dirname(absolutePath,'/'),'/')};}

// Resolve a shell command through PATH into an executable VFS node.
function findExecutable(commandName, state) {
  if (!commandName || typeof commandName !== 'string') return null;

  const runtimeState = state || null;
  const env = getRuntimeEnv(runtimeState);
  const baseCwd = runtimeState && typeof runtimeState.cwd === 'string' ? runtimeState.cwd : '/';

  const candidatePaths = commandName.includes('/')
    ? [VFS.resolvePath(commandName, baseCwd)]
    : String(env.PATH || '').split(':').filter(Boolean).map((dir) => `${dir.replace(/\/$/, '')}/${commandName}`);

  let deniedMatch = null;

  for (const candidatePath of candidatePaths) {
    const node = VFS.getN(candidatePath, baseCwd);
    if (!node || (node.type !== 'executable' && node.type !== 'file')) continue;
    if (!hasExecutePermission(node, runtimeState)) {
      deniedMatch = { path: candidatePath, node, command: node.command || commandName, permissionDenied: true };
      continue;
    }
    return { path: candidatePath, node, command: node.command || commandName, permissionDenied: false };
  }

  return deniedMatch;
}

function hasExecutePermission(node, state) {
  if (!node) return false;

  const user = getRuntimeUser(state);
  if (user === 'root') return true;

  const permissionsHelper = getPermissionHelper();
  if (permissionsHelper && typeof permissionsHelper.isProtectedPath === 'function' && permissionsHelper.isProtectedPath(node.path)) {
    return false;
  }

  const permissions = String(node.permissions || '');
  if (!permissions || permissions.length < 10) return true;

  const ownerBits = permissions.slice(1, 4);
  const groupBits = permissions.slice(4, 7);
  const otherBits = permissions.slice(7, 10);
  const bits = user === node.owner ? ownerBits : (user === node.group ? groupBits : otherBits);
  return bits[2] === 'x';
}

C.pwd=(a,s)=>resolveFsPath(s.cwd, '/');
C.ls=(args,s)=>{let sa=false,lo=false;const paths=[];for(const a of args){if(a.startsWith('-')){if(a.includes('a'))sa=true;if(a.includes('l'))lo=true}else paths.push(a)}if(!paths.length)paths.push('.');const perms=getPermissionHelper();const res=[];for(const p of paths){const target=resolveFsPath(p,s.cwd);const nd=resolveFsNode(target,'/');if(!nd)return`ls: cannot access '${p}': No such file or directory`;if(perms&&!perms.canRead(nd,getRuntimeUser(s),s))return`ls: cannot access '${p}': Permission denied`;if(nd.type==='file'){res.push(lo?fmtL(nd):nd.name);continue}let ent=Object.values(nd.children);if(sa)ent=[{name:'.',type:'directory',permissions:nd.permissions,owner:nd.owner,group:nd.group,size:4096,modifiedAt:nd.modifiedAt},{name:'..',type:'directory',permissions:'drwxr-xr-x',owner:'root',group:'root',size:4096,modifiedAt:nd.modifiedAt},...ent];else ent=ent.filter(e=>!e.name.startsWith('.'));if(paths.length>1)res.push(p+':');if(lo){res.push('total '+ent.length*4);for(const e of ent)res.push(fmtL(e))}else res.push(ent.map(e=>e.type==='directory'?`\x1b[1;34m${e.name}\x1b[0m`:e.name).join('  '))}return res.join('\n')};
C.cd=(args,s)=>{const t=args[0]||'~';const abs=resolveFsPath(t,s.cwd);const nd=resolveFsNode(abs,'/');const perms=getPermissionHelper();if(!nd)return{stdout:'',stderr:`bash: cd: ${t}: No such file or directory\n`,exitCode:1};if(nd.type!=='directory')return{stdout:'',stderr:`bash: cd: ${t}: Not a directory\n`,exitCode:1};if(perms&&!perms.canExecute(nd,getRuntimeUser(s),s))return{stdout:'',stderr:`bash: cd: ${t}: Permission denied\n`,exitCode:1};s.cwd=abs||'/';return{stdout:'',stderr:'',exitCode:0}};
C.mkdir=(args,s)=>{if(!args.length)return'mkdir: missing operand';let mp=false;const dirs=[];for(const a of args){if(a==='-p')mp=true;else dirs.push(a)}const perms=getPermissionHelper();const r=[];for(const d of dirs){const target=resolveFsPath(d,s.cwd);const parent=resolveFsNode(VFS.dirname(target,'/'),'/');if(perms&&parent&&!perms.canWrite(parent,getRuntimeUser(s),s)){r.push(`mkdir: cannot create directory '${d}': Permission denied`);continue}if(mp){VFS.ensureDirectoryPath(target,'/')}else{const e=VFS.mkdir(target,'/');if(e)r.push(e)}}return r.join('\n')};
C.rmdir=(args,s)=>{if(!args.length)return'rmdir: missing operand';const r=[];const perms=getPermissionHelper();for(const a of args){const target=resolveFsPath(a,s.cwd);const n=resolveFsNode(target,'/');const parentPath=VFS.dirname(target,'/');const parent=resolveFsNode(parentPath,'/');if(!n){r.push(`rmdir: '${a}': No such file or directory`);continue}if(n.type!=='directory'){r.push(`rmdir: '${a}': Not a directory`);continue}if(perms&&parent&&!perms.canWrite(parent,getRuntimeUser(s),s)){r.push(`rmdir: '${a}': Permission denied`);continue}if(Object.keys(n.children).length>0){r.push(`rmdir: '${a}': Directory not empty`);continue}const unlinkRef=VFS.getPN(target,'/');if(!unlinkRef.parent||unlinkRef.parent.type!=='directory'||!unlinkRef.parent.children[unlinkRef.name]){r.push(`rmdir: '${a}': No such file or directory`);continue}delete unlinkRef.parent.children[unlinkRef.name];}return r.join('\n')};
C.rm=(args,s)=>{let rec=false,force=false;const files=[];for(const a of args){if(a.startsWith('-')){if(a.includes('r')||a.includes('R'))rec=true;if(a.includes('f'))force=true}else files.push(a)}if(!files.length)return force?'':'rm: missing operand';const perms=getPermissionHelper();const r=[];for(const f of files){const target=resolveFsPath(f,s.cwd);const node=resolveFsNode(target,'/');const parent=resolveFsNode(VFS.dirname(target,'/'),'/');if(perms&&node&&!perms.canWrite(node,getRuntimeUser(s),s)&&(!parent||!perms.canWrite(parent,getRuntimeUser(s),s))){r.push(`rm: cannot remove '${f}': Permission denied`);continue}const e=VFS.rm(target,'/',rec);if(e&&!force)r.push(e)}return r.join('\n')};
C.cp=(args,s)=>{const nf=args.filter(a=>!a.startsWith('-'));if(nf.length<2)return'cp: missing operand';const dst=resolveFsPath(nf.pop(),s.cwd);const r=[];for(const src of nf){const e=VFS.cp(resolveFsPath(src,s.cwd),dst,'/');if(e)r.push(e)}return r.join('\n')};
C.mv=(args,s)=>{const nf=args.filter(a=>!a.startsWith('-'));if(nf.length<2)return'mv: missing operand';const dst=resolveFsPath(nf.pop(),s.cwd);const r=[];for(const src of nf){const e=VFS.mv(resolveFsPath(src,s.cwd),dst,'/');if(e)r.push(e)}return r.join('\n')};
C.touch=(args,s)=>{if(!args.length)return'touch: missing operand';const perms=getPermissionHelper();const r=[];for(const a of args){if(a.startsWith('-'))continue;const target=resolveFsPath(a,s.cwd);const node=resolveFsNode(target,'/');const parent=resolveFsNode(VFS.dirname(target,'/'),'/');if(node&&node.type==='directory'){r.push(`touch: cannot touch '${a}': Is a directory`);continue}if(perms&&node&&!perms.canWrite(node,getRuntimeUser(s),s)){r.push(`touch: cannot touch '${a}': Permission denied`);continue}if(perms&&!node&&parent&&!perms.canWrite(parent,getRuntimeUser(s),s)){r.push(`touch: cannot touch '${a}': Permission denied`);continue}const ok=VFS.touch(target,'/');if(!ok)r.push(`touch: cannot touch '${a}': No such file or directory`)}return r.join('\n')};
C.cat=(args,s,stdin)=>{if(!args.length&&stdin!=null)return stdin;if(!args.length)return'cat: missing file operand';const perms=getPermissionHelper();const r=[];for(const a of args){if(a.startsWith('-'))continue;const target=resolveFsPath(a,s.cwd);const node=resolveFsNode(target,'/');if(!node){r.push(`cat: ${a}: No such file or directory`);continue}if(node.type==='directory'){r.push(`cat: ${a}: Is a directory`);continue}if(perms&&!perms.canRead(node,getRuntimeUser(s),s)){r.push(`cat: ${a}: Permission denied`);continue}const c=VFS.read(target,'/');if(c===null&&node.type==='virtual')r.push('cat: invalid virtual node');else if(c===null)r.push(`cat: ${a}: No such file or directory`);else r.push(c)}return r.join('\n')};
C.head=(args,s,stdin)=>{let n=10;const files=[];for(let i=0;i<args.length;i++){if(args[i]==='-n'&&args[i+1])n=parseInt(args[++i])||10;else if(!args[i].startsWith('-'))files.push(args[i])}if(!files.length&&stdin!=null)return stdin.split('\n').slice(0,n).join('\n');if(!files.length)return'head: missing operand';const r=[];for(const f of files){const target=resolveFsPath(f,s.cwd);const c=VFS.read(target,'/');if(c===null){r.push(`head: '${f}': No such file`);continue}if(files.length>1)r.push(`==> ${f} <==`);r.push(c.split('\n').slice(0,n).join('\n'))}return r.join('\n')};
C.tail=(args,s,stdin)=>{let n=10,fol=false;const files=[];for(let i=0;i<args.length;i++){if(args[i]==='-n'&&args[i+1])n=parseInt(args[++i])||10;else if(args[i]==='-f')fol=true;else if(!args[i].startsWith('-'))files.push(args[i])}if(!files.length&&stdin!=null){const l=stdin.split('\n');return l.slice(Math.max(0,l.length-n)).join('\n')}if(!files.length)return'tail: missing operand';const r=[];for(const f of files){const target=resolveFsPath(f,s.cwd);const c=VFS.read(target,'/');if(c===null){r.push(`tail: '${f}': No such file`);continue}if(files.length>1)r.push(`==> ${f} <==`);const l=c.split('\n');r.push(l.slice(Math.max(0,l.length-n)).join('\n'))}if(fol)r.push('\x1b[33m[tail -f simulated]\x1b[0m');return r.join('\n')};
C.less=(args,s,stdin)=>{if(!args.length&&stdin!=null)return stdin;if(!args.length)return'less: missing operand';const f=args.find(a=>!a.startsWith('-'));const target=resolveFsPath(f,s.cwd);const c=VFS.read(target,'/');if(c===null)return`${f}: No such file or directory`;return c+'\n\x1b[7m(END)\x1b[0m'};
C.nano=(args,s)=>{const target=args.find(a=>!a.startsWith('-'));if(!target)return'nano: missing file operand';if(!window.NanoEditor||typeof window.NanoEditor.open!=='function')return'nano: editor is not available';const result=window.NanoEditor.open(target,s.cwd);return result&&result.success?'':(result&&result.message?result.message:'nano: editor is not available')};
C.grep=(args,s,stdin)=>{let ic=false,ln=false,rec=false,inv=false,cnt=false;const pos=[];for(const a of args){if(a.startsWith('-')&&!a.startsWith('--')){if(a.includes('i'))ic=true;if(a.includes('n'))ln=true;if(a.includes('r'))rec=true;if(a.includes('v'))inv=true;if(a.includes('c'))cnt=true}else pos.push(a)}if(!pos.length)return{stdout:'',stderr:'grep: missing pattern\n',exitCode:2};const pat=pos[0];const files=pos.slice(1);let re;try{re=new RegExp(pat,ic?'i':'')}catch(e){return{stdout:'',stderr:`grep: Invalid regex: '${pat}'\n`,exitCode:2}}function gC(ct,fn,mf){const ls=String(ct).split('\n');const r=[];let count=0;for(let i=0;i<ls.length;i++){const rawLine=ls[i];const m=re.test(rawLine);if(m!==inv){count++;if(!cnt){let l=rawLine,px='';if(mf&&fn)px+=`\x1b[35m${fn}\x1b[0m:`;if(ln)px+=`\x1b[32m${i+1}\x1b[0m:`;if(!inv)l=l.replace(re,mv=>`\x1b[1;31m${mv}\x1b[0m`);r.push(px+l)}}}if(cnt)r.push((mf&&fn?fn+':':'')+count);return{lines:r,count}}if(!files.length){if(stdin==null)return{stdout:'',stderr:'grep: no input\n',exitCode:2};const hit=gC(stdin,null,false);return{stdout:hit.lines.length?`${hit.lines.join('\n')}\n`:'',stderr:'',exitCode:hit.count>0?0:1}}if(rec){const r=[];let total=0;for(const f of files){const found=VFS.findN(f,s.cwd,n=>n.type==='file');for(const path of found){const c=VFS.read(path,s.cwd);if(c!==null){const hit=gC(c,path,true);r.push(...hit.lines);total+=hit.count}}}return{stdout:r.length?`${r.join('\n')}\n`:'',stderr:'',exitCode:total>0?0:1}}const r=[];const errs=[];let total=0;const mf=files.length>1;for(const f of files){const c=VFS.read(f,s.cwd);if(c===null){errs.push(`grep: ${f}: No such file or directory`);continue}const hit=gC(c,f,mf);r.push(...hit.lines);total+=hit.count}return{stdout:r.length?`${r.join('\n')}\n`:'',stderr:errs.length?`${errs.join('\n')}\n`:'',exitCode:errs.length?2:(total>0?0:1)}};
C.find=(args,s)=>{let sp='.',np=null,tf=null;for(let i=0;i<args.length;i++){if(args[i]==='-name'&&args[i+1])np=args[++i];else if(args[i]==='-type'&&args[i+1])tf=args[++i];else if(!args[i].startsWith('-'))sp=args[i]}return VFS.findN(sp,s.cwd,(n)=>{if(np){const re=new RegExp('^'+np.replace(/\*/g,'.*').replace(/\?/g,'.')+'$');if(!re.test(n.name))return false}if(tf){if(tf==='f'&&n.type!=='file')return false;if(tf==='d'&&n.type!=='directory')return false}return true}).join('\n')};
C.locate=(args,s)=>{if(!args.length)return'locate: no pattern';const re=new RegExp(args[0],'i');const r=VFS.findN('/',s.cwd,n=>re.test(n.name));return r.length?r.join('\n'):`locate: no results for '${args[0]}'`};
C.which=(args,s)=>{if(!args.length)return'which: missing argument';return args.map((cmd)=>{const resolved=resolveCommandTarget(cmd,s);return resolved.status==='executable'&&resolved.executable&&resolved.executable.path&&!resolved.executable.permissionDenied?resolved.executable.path:`${cmd} not found`;}).join('\n')};
C.type=(args,s)=>{if(!args.length)return'type: missing operand';return args.map((commandName)=>describeCommandTarget(commandName,s)).join('\n')};
C.chmod=(args,s)=>{if(args.length<2)return'chmod: missing operand';const n=VFS.getN(args[1],s.cwd);const perms=getPermissionHelper();if(!n)return`chmod: '${args[1]}': No such file or directory`;if(perms&&!perms.canWrite(n,getRuntimeUser(s),s))return`chmod: '${args[1]}': Permission denied`;if(/^\d{3,4}$/.test(args[0])){const d=args[0].length===4?args[0].slice(1):args[0];n.permissions=(n.type==='directory'?'d':'-')+d.split('').map((digit)=>{const numeric=parseInt(digit,10);return`${numeric&4?'r':'-'}${numeric&2?'w':'-'}${numeric&1?'x':'-'}`}).join('')}return''};
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
C.whoami=(args,s)=>getRuntimeUser(s);
C.who=(args,s)=>{const d=new Date();const user=getRuntimeUser(s);return`${user}     pts/0        ${d.toISOString().slice(0,10)} ${d.toTimeString().slice(0,5)} (web-terminal)`};
C.hostname=()=>'weblinux';
C.id=(args,s)=>s&&s.isRoot?'uid=0(root) gid=0(root)':'uid=1000(pass) gid=1000(pass)';
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
C.echo=(args,s)=>{let start=0;let addNewline=true;if(args[0]==='-n'){start=1;addNewline=false}const text=args.slice(start).join(' ');return addNewline?`${text}\n`:text};
C.basename=(args,s)=>{if(!args.length)return'basename: missing operand';return args.map((pathValue)=>VFS.basename(pathValue,s.cwd)).join('\n')};
C.dirname=(args,s)=>{if(!args.length)return'dirname: missing operand';return args.map((pathValue)=>VFS.dirname(pathValue,s.cwd)).join('\n')};
C.realpath=(args,s)=>{if(!args.length)return'realpath: missing operand';return args.map((pathValue)=>formatRealPath(pathValue,s.cwd)).join('\n')};
C.stat=(args,s)=>{if(!args.length)return"stat: missing operand";return args.map((pathValue)=>formatStatOutput(pathValue,s.cwd)).join('\n\n')};
C.tree=(args,s)=>{const target=args.find((arg)=>!arg.startsWith('-'))||'.';return formatTree(target,s.cwd)};
// Debug helpers for tokenizer/parser behavior inspection.
C['debug-tokens']=(args)=>{const source=args.join(' ');if(!source)return{stdout:'',stderr:'debug-tokens: missing input\n',exitCode:2};try{return{stdout:`${JSON.stringify(window.ShellTokenizer.tokenize(source),null,2)}\n`,stderr:'',exitCode:0}}catch(error){return{stdout:'',stderr:`${error&&error.message?error.message:'tokenizer error'}\n`,exitCode:2}}};
C['debug-ast']=(args)=>{const source=args.join(' ');if(!source)return{stdout:'',stderr:'debug-ast: missing input\n',exitCode:2};try{const tokens=window.ShellTokenizer.tokenize(source);const chunks=window.ShellParser.splitBySemicolon(tokens).filter(chunk=>chunk.length);const ast=chunks.length===1?window.ShellParser.parse(chunks[0]):chunks.map(chunk=>window.ShellParser.parse(chunk));return{stdout:`${JSON.stringify(ast,null,2)}\n`,stderr:'',exitCode:0}}catch(error){return{stdout:'',stderr:`${error&&error.message?error.message:'parser error'}\n`,exitCode:2}}};
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
C.env=(a,s)=>Object.entries(getRuntimeEnv(s)).map(([key,value])=>`${key}=${value}`).join('\n');
C.export=(args,s)=>{const env=getRuntimeEnv(s);if(!args.length)return Object.entries(env).map(([key,value])=>`${key}=${value}`).join('\n');const out=[];for(let i=0;i<args.length;i++){let token=args[i];const idx=token.indexOf('=');if(idx<=0){out.push(`export: '${token}': not a valid assignment`);continue;}const key=token.slice(0,idx);if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)){out.push(`export: '${token}': not a valid identifier`);continue;}let value=token.slice(idx+1);while(i+1<args.length&&!args[i+1].includes('=')){value+=`${value ? ' ' : ''}${args[i+1]}`;i++;}if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))){value=value.slice(1,-1);}env[key]=value;}return out.join('\n')};C.alias=()=>'';
C.unset=(args,s)=>{if(!args.length)return'';const env=getRuntimeEnv(s);for(const name of args){if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) delete env[name];}return''};
C.exit=()=>'\x1b[33mCannot exit: running in browser.\x1b[0m';
C.sudo=(args,s,stdin)=>{if(!args.length)return'usage: sudo command';if(C[args[0]])return C[args[0]](args.slice(1),s,stdin);return`sudo: ${args[0]}: command not found`};
C.help=()=>renderHelpCatalog(getHelpCatalog());

/* ====== SHELL COMMAND RUNTIME ====== */
function normalizeCommandResult(rawResult) {
  if (rawResult && typeof rawResult === 'object' && ('stdout' in rawResult || 'stderr' in rawResult || 'exitCode' in rawResult)) {
    return {
      stdout: typeof rawResult.stdout === 'string' ? rawResult.stdout : '',
      stderr: typeof rawResult.stderr === 'string' ? rawResult.stderr : '',
      exitCode: Number.isInteger(rawResult.exitCode) ? rawResult.exitCode : 0,
      control: typeof rawResult.control === 'string' ? rawResult.control : '',
    };
  }

  if (rawResult === '\x1b[CLEAR]') {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      control: 'CLEAR',
    };
  }

  if (rawResult === undefined || rawResult === null) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      control: '',
    };
  }

  const text = String(rawResult);
  const isErrorLike = /^(bash:|[a-z][a-z0-9_-]*:)/i.test(text) && !/^usage:/i.test(text);
  return {
    stdout: isErrorLike ? '' : text,
    stderr: isErrorLike ? (text.endsWith('\n') ? text : `${text}\n`) : '',
    exitCode: isErrorLike ? 1 : 0,
    control: '',
  };
}

function createCommandRuntime(commands) {
  const registry = {};
  window.__weblinuxCommandRegistry = registry;

  function appendLines(base, extra) {
    if (!extra) return base;
    if (!base) return extra;
    return `${base}\n${extra}`;
  }

  async function executeScriptFile(name, context) {
    if (!name || !name.includes('/')) return null;
    const runtimeState = context && context.terminalState ? context.terminalState : null;
    const cwd = runtimeState && runtimeState.cwd ? runtimeState.cwd : '/';
    const scriptPath = VFS.resolvePath(name, cwd);
    const node = VFS.getN(scriptPath, cwd);
    if (!node) return null;
    if (node.type !== 'file' && node.type !== 'executable') return null;
    if (!hasExecutePermission(node, runtimeState)) {
      return {
        stdout: '',
        stderr: `Permission denied: ${name}`,
        exitCode: 126,
        control: '',
      };
    }

    const content = VFS.read(scriptPath, cwd);
    if (content === null) return null;
    if (!context || !context.shell || typeof context.shell.run !== 'function') {
      return {
        stdout: '',
        stderr: `bash: ${name}: cannot execute script`,
        exitCode: 1,
        control: '',
      };
    }

    const lines = String(content).split(/\r?\n/);
    let merged = { stdout: '', stderr: '', exitCode: 0, control: '' };

    for (let index = 0; index < lines.length; index++) {
      const rawLine = lines[index];
      const line = String(rawLine || '').trim();
      if (!line) continue;
      if (index === 0 && line.startsWith('#!')) continue;
      if (line.startsWith('#')) continue;

      const lineResult = await context.shell.run(line, context);
      merged.stdout = appendLines(merged.stdout, lineResult.stdout || '');
      merged.stderr = appendLines(merged.stderr, lineResult.stderr || '');
      merged.exitCode = Number.isInteger(lineResult.exitCode) ? lineResult.exitCode : merged.exitCode;
      if (lineResult.control) merged.control = lineResult.control;
    }

    return merged;
  }

  function resolveDispatchTarget(name, context) {
    const terminalState = context && context.terminalState ? context.terminalState : context;
    const resolved = resolveCommandTarget(name, terminalState);

    if (resolved.status === 'executable' && registry[resolved.name]) {
      return { status: 'command', name: resolved.name, executable: resolved.executable };
    }

    if (resolved.status === 'command' && registry[resolved.name]) {
      return resolved;
    }

    if (resolved.status === 'command' && !registry[resolved.name]) {
      return { status: 'missing', executable: resolved.executable || null, name: resolved.name };
    }

    return resolved;
  }

  for (const [name, handler] of Object.entries(commands || {})) {
    registry[name] = {
      name,
      async execute(args, context) {
        try {
          const runtimeState = context.terminalState;
          const stdin = context.stdin != null ? String(context.stdin) : '';
          const raw = handler(args || [], runtimeState, stdin);
          return normalizeCommandResult(raw);
        } catch (error) {
          return {
            stdout: '',
            stderr: `shell: ${name}: ${error && error.message ? error.message : 'execution failed'}`,
            exitCode: 1,
            control: '',
          };
        }
      },
    };
  }

  return {
    listCommandNames() {
      const names = new Set(Object.keys(registry));
      if (CommandManager && typeof CommandManager.getAllNames === 'function') {
        for (const name of CommandManager.getAllNames()) names.add(name);
      }
      return Array.from(names).sort();
    },

    findExecutable(commandName, context) {
      return findExecutable(commandName, context && context.terminalState ? context.terminalState : context);
    },

    async execute(name, args, context) {
      const resolved = resolveDispatchTarget(name, context);
      if (resolved.status === 'denied') {
        return {
          stdout: '',
          stderr: `Permission denied: ${name}`,
          exitCode: 126,
          control: '',
        };
      }

      const command = (resolved.status === 'builtin' || resolved.status === 'command') ? registry[resolved.name] : null;
      if (!command) {
        const scriptPath = resolved.executable && resolved.executable.path ? resolved.executable.path : name;
        const scriptResult = await executeScriptFile(scriptPath, context);
        if (scriptResult) return scriptResult;
        return {
          stdout: '',
          stderr: `command not found: ${name}`,
          exitCode: 127,
          control: '',
        };
      }

      return command.execute(args, context);
    },
  };
}

/* ====== INIT FS ====== */
function initFS(){
  if (VFS && typeof VFS.ensureBootstrapped === 'function') {
    VFS.ensureBootstrapped();
  }
}


/* ====== TERMINAL UI ====== */
(function boot() {
  // Initialize JSON managers (async)
  initializeJSONManagers().catch(err => console.warn('JSON managers initialization error:', err));

  initFS();
  LoginScreen.init();
  const terminalElement = document.getElementById('terminal');
  const terminalInput = document.getElementById('terminal-input');
  let inputManager = null;
  let terminalMode = 'normal';
  const terminalState = {
    cwd: '/home/pass',
    history: [],
    historyIdx: -1,
    input: '',
    cursor: 0,
    saved: '',
    user: window.weblinuxSessionUser || 'pass',
    isRoot: false,
    env: {
      PATH: '/bin:/usr/bin:/usr/local/bin',
      HOME: '/home/pass',
      USER: window.weblinuxSessionUser || 'pass',
      SHELL: '/bin/bash',
      PWD: '/home/pass',
      HOSTNAME: 'weblinux',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
    },
    sudo: {
      active: false,
      command: '',
      attempts: 0,
      cacheUntil: 0,
    },
  };
  const commandRuntime = createCommandRuntime(C);
  const shellRuntime = new window.ShellRuntime({ commandRuntime });
  const scheduleTerminalFit = () => TerminalFit.schedule(terminalElement);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleTerminalFit);
  }

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(() => scheduleTerminalFit());
    if (terminalElement.parentElement) resizeObserver.observe(terminalElement.parentElement);
  }

  function setTerminalMode(mode) {
    terminalMode = mode === 'nano' ? 'nano' : 'normal';
    if (inputManager) inputManager.setEnabled(terminalMode === 'normal');
    document.body.classList.toggle('nano-active', terminalMode === 'nano');
  }

  async function executeCommand(command, options = {}) {
    const previousRootState = terminalState.isRoot;
    if (typeof options.isRoot === 'boolean') {
      terminalState.isRoot = options.isRoot;
    }

    try {
      const runtimeContext = {
        cwd: terminalState.cwd,
        user: getRuntimeUser(terminalState),
        env: getRuntimeEnv(terminalState),
        expandInput: (input) => expandShellVariables(input, terminalState),
        vfs: VFS,
        shell: shellRuntime,
        stdin: '',
        terminalState,
      };

      const result = await shellRuntime.run(command, runtimeContext);
      updateStatusCwd(terminalState.cwd);
      return result;
    } finally {
      terminalState.isRoot = previousRootState;
    }
  }

  function executeDebugUtility(rawInput) {
    const text = String(rawInput || '').trim();
    const match = text.match(/^(debug-(?:tokens|ast))\s+([\s\S]+)$/);
    if (!match) return null;

    const [, commandName, payload] = match;
    if (!payload || !payload.trim()) {
      return {
        stdout: '',
        stderr: `${commandName}: missing input\n`,
        exitCode: 2,
        control: '',
      };
    }

    try {
      if (commandName === 'debug-tokens') {
        const tokens = window.ShellTokenizer.tokenize(payload);
        return {
          stdout: `${JSON.stringify(tokens, null, 2)}\n`,
          stderr: '',
          exitCode: 0,
          control: '',
        };
      }

      const tokens = window.ShellTokenizer.tokenize(payload);
      const chunks = window.ShellParser.splitBySemicolon(tokens).filter(chunk => chunk.length);
      const ast = chunks.length === 1
        ? window.ShellParser.parse(chunks[0])
        : chunks.map(chunk => window.ShellParser.parse(chunk));

      return {
        stdout: `${JSON.stringify(ast, null, 2)}\n`,
        stderr: '',
        exitCode: 0,
        control: '',
      };
    } catch (error) {
      return {
        stdout: '',
        stderr: `${error && error.message ? error.message : 'debug parser error'}\n`,
        exitCode: 2,
        control: '',
      };
    }
  }

  function startSudoPrompt(command) {
    terminalState.sudo.active = true;
    terminalState.sudo.command = command;
    terminalState.sudo.attempts = 0;
    terminalState.input = '';
    terminalState.cursor = 0;
    terminalState.saved = '';
    if (window.__weblinuxInputManager && typeof window.__weblinuxInputManager.clearInputValue === 'function') {
      window.__weblinuxInputManager.clearInputValue();
    }
    renderInput();
    scrollToBottom();
    if (inputManager) inputManager.focus();
  }

  function resetSudoEntry() {
    terminalState.input = '';
    terminalState.cursor = 0;
    terminalState.saved = '';
    if (window.__weblinuxInputManager && typeof window.__weblinuxInputManager.clearInputValue === 'function') {
      window.__weblinuxInputManager.clearInputValue();
    }
  }

  function cancelSudoPrompt(message) {
    terminalState.sudo.active = false;
    terminalState.sudo.command = '';
    terminalState.sudo.attempts = 0;
    resetSudoEntry();
    if (message) writeLine(message);
    renderInput();
    scrollToBottom();
  }

  function finishSudoPrompt() {
    terminalState.sudo.active = false;
    terminalState.sudo.command = '';
    terminalState.sudo.attempts = 0;
    resetSudoEntry();
  }

  // Re-fit when output changes so long lines stay visible without clipping.
  const mutationObserver = new MutationObserver(() => scheduleTerminalFit());
  mutationObserver.observe(terminalElement, { childList: true, subtree: true, characterData: true });

  window.addEventListener('resize', scheduleTerminalFit, { passive: true });
  window.addEventListener('orientationchange', scheduleTerminalFit, { passive: true });

  function buildPromptHtml() {
    const sessionUser = terminalState.user || window.weblinuxSessionUser || 'pass';

    if (terminalState.sudo.active) {
      return `<span class="prompt-user">[sudo]</span><span class="prompt-host"> password for ${escapeHtml(sessionUser)}</span><span class="prompt-sym">:</span><span class="prompt-dollar"> </span>`;
    }

    let displayPath = terminalState.cwd;
    if (displayPath.startsWith('/home/pass')) displayPath = `~${displayPath.slice(10)}`;
    if (!displayPath) displayPath = '~';
    const promptSymbol = terminalState.isRoot ? '#' : '$';

    return `<span class="prompt-user">${escapeHtml(sessionUser)}</span><span class="prompt-host">@weblinux</span><span class="prompt-sym">:</span><span class="prompt-path">${displayPath}</span><span class="prompt-dollar">${promptSymbol} </span>`;
  }

  function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderInput() {
    let inputLineElement = document.getElementById('il');
    if (!inputLineElement) {
      inputLineElement = document.createElement('div');
      inputLineElement.id = 'il';
      inputLineElement.style.display = 'inline';
      terminalElement.appendChild(inputLineElement);
    }

    const isPasswordPrompt = terminalState.sudo.active;
    const visibleInput = isPasswordPrompt ? '•'.repeat(terminalState.input.length) : terminalState.input;
    const beforeCursor = escapeHtml(visibleInput.slice(0, terminalState.cursor));
    const cursorCharacter = isPasswordPrompt
      ? ' '
      : (terminalState.cursor < terminalState.input.length
        ? escapeHtml(terminalState.input[terminalState.cursor])
        : ' ');
    const afterCursor = isPasswordPrompt
      ? ''
      : (terminalState.cursor < terminalState.input.length
        ? escapeHtml(terminalState.input.slice(terminalState.cursor + 1))
        : '');

    inputLineElement.innerHTML = buildPromptHtml() + beforeCursor + '<span class="cursor-char cursor-blink">' + cursorCharacter + '</span>' + afterCursor;
    scheduleTerminalFit();
  }

  function writeLine(html) {
    const lineElement = document.createElement('div');
    lineElement.className = 'output-line';
    lineElement.innerHTML = html;
    terminalElement.appendChild(lineElement);
    scheduleTerminalFit();
  }

  function writeOutput(text, stream = 'stdout') {
    if (!text) return;
    const renderedText = stream === 'stderr' ? `\x1b[31m${text}\x1b[0m` : text;
    const html = Ansi.toHtml(renderedText);
    html.split('\n').forEach((line) => writeLine(line || ' '));
  }

  function removeInputLine() {
    const inputLineElement = document.getElementById('il');
    if (inputLineElement) inputLineElement.remove();
  }

  function scrollToBottom() {
    terminalElement.scrollTop = terminalElement.scrollHeight;
  }

  async function submitInput() {
    const input = terminalState.input;

    if (terminalState.sudo.active) {
      removeInputLine();

      const password = input;
      const sudoCommand = terminalState.sudo.command || '';

      terminalState.input = '';
      terminalState.cursor = 0;

      const sessionPassword = window.weblinuxSession && typeof window.weblinuxSession.password === 'string'
        ? window.weblinuxSession.password
        : WebLinuxAuth.getPassword();

      if (password === sessionPassword) {
        terminalState.sudo.cacheUntil = Date.now() + 60000;
        finishSudoPrompt();

        const commandToRun = sudoCommand.replace(/^sudo\s+/, '');
        if (!commandToRun) {
          writeLine('sudo: a command is required');
        } else {
          const commandResult = await executeCommand(commandToRun, { isRoot: true });
          if (commandResult.control === 'CLEAR') terminalElement.innerHTML = '';
          if (commandResult.stdout) writeOutput(commandResult.stdout, 'stdout');
          if (commandResult.stderr) writeOutput(commandResult.stderr, 'stderr');
        }

        renderInput();
        scrollToBottom();
        return;
      }

      terminalState.sudo.attempts += 1;
      if (terminalState.sudo.attempts >= 3) {
        finishSudoPrompt();
        writeLine('sudo: 3 incorrect password attempts');
      } else {
        writeLine('Sorry, try again.');
        resetSudoEntry();
        renderInput();
        scrollToBottom();
        return;
      }

      renderInput();
      scrollToBottom();
      return;
    }

    removeInputLine();
    writeLine(buildPromptHtml() + escapeHtml(input));

    terminalState.input = '';
    terminalState.cursor = 0;

    const trimmedInput = input.trim();
    if (trimmedInput) {
      if (/^sudo(?:\s|$)/.test(trimmedInput)) {
        const sudoTarget = trimmedInput.replace(/^sudo\s+/, '');
        terminalState.history.push(trimmedInput);
        terminalState.historyIdx = terminalState.history.length;

        if (!sudoTarget) {
          writeLine('sudo: a command is required');
          renderInput();
          scrollToBottom();
          return;
        }

        if (terminalState.sudo.cacheUntil > Date.now()) {
          const commandResult = await executeCommand(sudoTarget, { isRoot: true });
          if (commandResult.control === 'CLEAR') terminalElement.innerHTML = '';
          if (commandResult.stdout) writeOutput(commandResult.stdout, 'stdout');
          if (commandResult.stderr) writeOutput(commandResult.stderr, 'stderr');
          renderInput();
          scrollToBottom();
          return;
        }

        startSudoPrompt(trimmedInput);
        return;
      }

      terminalState.history.push(trimmedInput);
      terminalState.historyIdx = terminalState.history.length;
      const debugResult = executeDebugUtility(trimmedInput);
      const commandResult = debugResult || await executeCommand(trimmedInput);
      if (commandResult.control === 'CLEAR') terminalElement.innerHTML = '';
      if (commandResult.stdout) writeOutput(commandResult.stdout, 'stdout');
      if (commandResult.stderr) writeOutput(commandResult.stderr, 'stderr');
    }

    renderInput();
    scrollToBottom();
  }

  function insertChars(text) {
    if (!text) return;

    terminalState.input = terminalState.input.slice(0, terminalState.cursor) + text + terminalState.input.slice(terminalState.cursor);
    terminalState.cursor += text.length;
    renderInput();
    scrollToBottom();
  }

  function backspaceOnce() {
    if (terminalState.cursor <= 0) return;

    terminalState.input = terminalState.input.slice(0, terminalState.cursor - 1) + terminalState.input.slice(terminalState.cursor);
    terminalState.cursor--;
    renderInput();
    scrollToBottom();
  }

  /* Tab */
  function handleTab() {
    const inputParts = terminalState.input.split(/\s+/);

    if (inputParts.length <= 1) {
      const commandPartial = inputParts[0] || '';
      const matchingCommands = commandRuntime.listCommandNames().filter((commandName) => commandName.startsWith(commandPartial));

      if (matchingCommands.length === 1) {
        terminalState.input = `${matchingCommands[0]} `;
        terminalState.cursor = terminalState.input.length;
        renderInput();
      } else if (matchingCommands.length > 1) {
        removeInputLine();
        writeLine(buildPromptHtml() + escapeHtml(terminalState.input));
        writeLine(matchingCommands.join('  '));
        renderInput();
      }
    } else {
      const pathPartial = inputParts[inputParts.length - 1];
      const completions = VFS.completions(pathPartial, terminalState.cwd);

      if (completions.length === 1) {
        inputParts[inputParts.length - 1] = completions[0];
        terminalState.input = inputParts.join(' ');
        terminalState.cursor = terminalState.input.length;
        renderInput();
      } else if (completions.length > 1) {
        let commonPrefix = completions[0];
        for (let i = 1; i < completions.length; i++) {
          while (!completions[i].startsWith(commonPrefix)) commonPrefix = commonPrefix.slice(0, -1);
        }

        if (commonPrefix.length > pathPartial.length) {
          inputParts[inputParts.length - 1] = commonPrefix;
          terminalState.input = inputParts.join(' ');
          terminalState.cursor = terminalState.input.length;
          renderInput();
        } else {
          removeInputLine();
          writeLine(buildPromptHtml() + escapeHtml(terminalState.input));
          writeLine(completions.join('  '));
          renderInput();
        }
      }
    }

    scrollToBottom();
  }

  function handleKey(key, metadata = {}) {
    if (!window.__weblinuxLoginComplete) {
      return true;
    }

    if (terminalState.sudo.active) {
      const isCtrlPressed = !!metadata.ctrlKey;

      if (isCtrlPressed && key === 'c') {
        removeInputLine();
        writeLine('^C');
        cancelSudoPrompt();
        return true;
      }

      if (key === 'Enter') {
        void submitInput();
        return true;
      }

      if (key === 'Backspace') {
        backspaceOnce();
        return true;
      }

      return true;
    }

    if (terminalMode !== 'normal') {
      return window.NanoEditor && typeof window.NanoEditor.isActive === 'function' ? window.NanoEditor.isActive() : true;
    }

    const isCtrlPressed = !!metadata.ctrlKey;
    const isAltPressed = !!metadata.altKey;
    const isShiftPressed = !!metadata.shiftKey;
    const isMetaPressed = !!metadata.metaKey;

    if (isCtrlPressed && key === 'c') {
      removeInputLine();
      writeLine(buildPromptHtml() + escapeHtml(terminalState.input) + '^C');
      terminalState.input = '';
      terminalState.cursor = 0;
      renderInput();
      scrollToBottom();
      return true;
    }

    if (isCtrlPressed && key === 'l') {
      terminalElement.innerHTML = '';
      renderInput();
      scrollToBottom();
      return true;
    }

    if (isCtrlPressed && key === 'a') {
      terminalState.cursor = 0;
      renderInput();
      return true;
    }

    if (isCtrlPressed && key === 'e') {
      terminalState.cursor = terminalState.input.length;
      renderInput();
      return true;
    }

    if (isCtrlPressed && key === 'u') {
      terminalState.input = terminalState.input.slice(terminalState.cursor);
      terminalState.cursor = 0;
      renderInput();
      return true;
    }

    if (isCtrlPressed && key === 'k') {
      terminalState.input = terminalState.input.slice(0, terminalState.cursor);
      renderInput();
      return true;
    }

    if (isCtrlPressed && key === 'w') {
      const beforeCursor = terminalState.input.slice(0, terminalState.cursor);
      const afterCursor = terminalState.input.slice(terminalState.cursor);
      const trimmedBeforeCursor = beforeCursor.trimEnd();
      const lastSpaceIndex = trimmedBeforeCursor.lastIndexOf(' ');
      const newBeforeCursor = lastSpaceIndex === -1 ? '' : trimmedBeforeCursor.slice(0, lastSpaceIndex + 1);
      terminalState.input = newBeforeCursor + afterCursor;
      terminalState.cursor = newBeforeCursor.length;
      renderInput();
      return true;
    }

    if (key === 'Tab') {
      handleTab();
      return true;
    }

    if (key === 'Enter') {
      void submitInput();
      return true;
    }

    if (key === 'Backspace') {
      backspaceOnce();
      return true;
    }

    if (key === 'Delete') {
      if (terminalState.cursor < terminalState.input.length) {
        terminalState.input = terminalState.input.slice(0, terminalState.cursor) + terminalState.input.slice(terminalState.cursor + 1);
        renderInput();
      }
      return true;
    }

    if (key === 'ArrowUp') {
      if (terminalState.historyIdx === terminalState.history.length) terminalState.saved = terminalState.input;
      if (terminalState.historyIdx > 0) {
        terminalState.historyIdx--;
        terminalState.input = terminalState.history[terminalState.historyIdx];
        terminalState.cursor = terminalState.input.length;
        renderInput();
        scrollToBottom();
      }
      return true;
    }

    if (key === 'ArrowDown') {
      if (terminalState.historyIdx < terminalState.history.length) {
        terminalState.historyIdx++;
        terminalState.input = terminalState.historyIdx === terminalState.history.length
          ? terminalState.saved
          : terminalState.history[terminalState.historyIdx];
        terminalState.cursor = terminalState.input.length;
        renderInput();
        scrollToBottom();
      }
      return true;
    }

    if (key === 'ArrowLeft') {
      if (terminalState.cursor > 0) {
        terminalState.cursor--;
        renderInput();
      }
      return true;
    }

    if (key === 'ArrowRight') {
      if (terminalState.cursor < terminalState.input.length) {
        terminalState.cursor++;
        renderInput();
      }
      return true;
    }

    if (key === 'Home') {
      terminalState.cursor = 0;
      renderInput();
      return true;
    }

    if (key === 'End') {
      terminalState.cursor = terminalState.input.length;
      renderInput();
      return true;
    }

    return false;
  }

  if (terminalInput && typeof window.InputManager === 'function') {
    inputManager = new window.InputManager({
      inputElement: terminalInput,
      terminalElement,
      onText: insertChars,
      onKey: handleKey,
      onPaste: (text) => insertChars(text)
    });

    window.__weblinuxInputManager = inputManager;
    window.__weblinuxTerminalState = terminalState;

    if (!window.__weblinuxLoginComplete) {
      inputManager.setEnabled(false);
    }
  }

  if (window.NanoEditor && typeof window.NanoEditor.init === 'function') {
    window.NanoEditor.init({
      resolvePath: (path, cwd) => VFS.absStr(path, cwd),
      readFile: (path, cwd) => VFS.read(path, cwd),
      writeFile: (path, cwd, content) => VFS.write(path, cwd, content),
      getInfo: (path, cwd) => VFS.getN(path, cwd),
      setTerminalMode,
      focusTerminal: () => { if (inputManager) inputManager.focus(); }
    });
  }

  if (window.__weblinuxLoginComplete) {
    renderInput();
    scrollToBottom();
  }

  window.handleKey = handleKey;
})();
