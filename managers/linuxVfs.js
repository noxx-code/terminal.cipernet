(function registerBrowserLinuxVFS(globalScope) {
  const runtimeGenerators = globalScope.RuntimeGenerators || null;

  const state = {
    root: null,
    bootstrapped: false,
    deviceBuffers: {
      tty: '',
    },
  };

  function now() {
    return new Date().toISOString();
  }

  function normalizePermissions(type, permissions) {
    if (permissions) return permissions;
    if (type === 'directory') return 'drwxr-xr-x';
    if (type === 'virtual') return '-r--r--r--';
    return '-rw-r--r--';
  }

  function createNode(name, type, options = {}) {
    const createdAt = options.createdAt || now();
    const node = {
      name,
      path: options.path || '',
      type,
      content: options.content !== undefined && options.content !== null ? String(options.content) : '',
      permissions: normalizePermissions(type, options.permissions),
      owner: options.owner || (type === 'directory' ? 'root' : 'user'),
      group: options.group || (type === 'directory' ? 'root' : 'user'),
      children: type === 'directory' ? {} : null,
      createdAt,
      modifiedAt: options.modifiedAt || createdAt,
      size: typeof options.size === 'number'
        ? options.size
        : (type === 'directory' ? 4096 : String(options.content || '').length),
    };

    if (type === 'virtual') {
      node.kind = options.kind || 'runtime';
      node.generator = options.generator || null;
      node.device = options.device || null;
      node.readOnly = options.readOnly !== undefined ? options.readOnly : true;
    }

    return node;
  }

  function createPath(parentPath, name) {
    if (!parentPath || parentPath === '/') return `/${name}`;
    return `${parentPath}/${name}`;
  }

  function cloneNode(node) {
    const copy = createNode(node.name, node.type, {
      content: node.content,
      permissions: node.permissions,
      owner: node.owner,
      group: node.group,
      createdAt: node.createdAt,
      modifiedAt: node.modifiedAt,
      size: node.size,
      kind: node.kind,
      generator: node.generator,
      device: node.device,
      readOnly: node.readOnly,
    });

    if (node.type === 'directory' && node.children) {
      for (const [childName, childNode] of Object.entries(node.children)) {
        copy.children[childName] = cloneNode(childNode);
      }
    }

    return copy;
  }

  function assignPaths(node, nodePath) {
    node.path = nodePath || '/';

    if (node.type === 'directory' && node.children) {
      for (const [childName, childNode] of Object.entries(node.children)) {
        assignPaths(childNode, createPath(node.path, childName));
      }
    }
  }

  function reset() {
    state.root = createNode('/', 'directory', {
      path: '/',
      owner: 'root',
      group: 'root',
      permissions: 'drwxr-xr-x',
    });
    state.deviceBuffers.tty = '';
    state.bootstrapped = false;
    return state.root;
  }

  function splitSegments(pathValue) {
    return String(pathValue || '').split('/').filter(Boolean);
  }

  function resolve(pathValue, cwd = '/home/user') {
    if (!pathValue) return splitSegments(cwd);

    let input = String(pathValue);
    if (input.startsWith('~')) input = `/home/user${input.slice(1)}`;

    const baseSegments = input.startsWith('/') ? [] : splitSegments(cwd);
    const parts = splitSegments(input);

    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        if (baseSegments.length) baseSegments.pop();
      } else {
        baseSegments.push(part);
      }
    }

    return baseSegments;
  }

  function absStr(pathValue, cwd = '/home/user') {
    const resolved = resolve(pathValue, cwd);
    return resolved.length ? `/${resolved.join('/')}` : '/';
  }

  function getNode(pathValue, cwd = '/home/user') {
    if (!state.root) reset();
    const segments = resolve(pathValue, cwd);
    let current = state.root;

    for (const segment of segments) {
      if (!current || current.type !== 'directory' || !current.children || !current.children[segment]) {
        return null;
      }
      current = current.children[segment];
    }

    return current;
  }

  function getParentRef(pathValue, cwd = '/home/user') {
    const segments = resolve(pathValue, cwd);
    if (!segments.length) return { parent: null, name: '/' };

    const name = segments.pop();
    let current = state.root || reset();

    for (const segment of segments) {
      if (!current || current.type !== 'directory' || !current.children || !current.children[segment]) {
        return { parent: null, name };
      }
      current = current.children[segment];
    }

    return { parent: current, name };
  }

  function ensureDirectoryPath(pathValue, cwd = '/home/user', options = {}) {
    if (!state.root) reset();
    const segments = resolve(pathValue, cwd);
    let current = state.root;
    let currentPath = '';

    if (!segments.length) return current;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      currentPath = createPath(currentPath || '/', segment);
      let child = current.children[segment];

      if (!child) {
        child = createNode(segment, 'directory', {
          path: currentPath,
          owner: options.owner || current.owner || 'user',
          group: options.group || current.group || 'user',
          permissions: options.permissions || 'drwxr-xr-x',
        });
        current.children[segment] = child;
      } else if (child.type !== 'directory') {
        return null;
      }

      current = child;
    }

    assignPaths(state.root, '/');
    return current;
  }

  function ensureFilePath(pathValue, content = '', cwd = '/home/user', options = {}) {
    const targetPath = absStr(pathValue, cwd);
    const segments = splitSegments(targetPath);
    if (!segments.length) return null;

    const name = segments.pop();
    const parentPath = segments.length ? `/${segments.join('/')}` : '/';
    const parent = ensureDirectoryPath(parentPath, '/', options.parent || {});
    if (!parent) return null;

    const node = createNode(name, 'file', {
      path: targetPath,
      content,
      permissions: options.permissions,
      owner: options.owner,
      group: options.group,
      createdAt: options.createdAt,
      modifiedAt: options.modifiedAt,
    });
    node.size = String(content || '').length;
    parent.children[name] = node;
    assignPaths(state.root, '/');
    return node;
  }

  function ensureVirtualPath(pathValue, generatorKey, cwd = '/home/user', options = {}) {
    const targetPath = absStr(pathValue, cwd);
    const segments = splitSegments(targetPath);
    if (!segments.length) return null;

    const name = segments.pop();
    const parentPath = segments.length ? `/${segments.join('/')}` : '/';
    const parent = ensureDirectoryPath(parentPath, '/', options.parent || {});
    if (!parent) return null;

    const node = createNode(name, 'virtual', {
      path: targetPath,
      permissions: options.permissions,
      owner: options.owner,
      group: options.group,
      kind: options.kind || (generatorKey && generatorKey.startsWith('device.') ? 'device' : 'runtime'),
      generator: generatorKey || null,
      device: options.device || null,
      readOnly: options.readOnly,
      createdAt: options.createdAt,
      modifiedAt: options.modifiedAt,
    });
    parent.children[name] = node;
    assignPaths(state.root, '/');
    return node;
  }

  function ensureDirectoryValue(pathValue, cwd = '/home/user', options = {}) {
    return ensureDirectoryPath(pathValue, cwd, options);
  }

  function createGeneratorContext(node) {
    return {
      node,
      path: node.path,
      vfs: api,
      state,
    };
  }

  function readVirtual(node) {
    const generator = node.generator && runtimeGenerators ? runtimeGenerators.get(node.generator) : null;

    if (generator && typeof generator.read === 'function') {
      return String(generator.read(createGeneratorContext(node)) ?? '');
    }

    if (node.kind === 'device' && node.device === 'null') return '';
    if (node.kind === 'device' && node.device === 'random') {
      const fallback = runtimeGenerators && runtimeGenerators.get('device.random');
      return fallback && typeof fallback.read === 'function' ? String(fallback.read(createGeneratorContext(node)) ?? '') : '';
    }
    if (node.kind === 'device' && node.device === 'tty') {
      return state.deviceBuffers.tty;
    }

    return String(node.content || '');
  }

  function writeVirtual(node, content) {
    const generator = node.generator && runtimeGenerators ? runtimeGenerators.get(node.generator) : null;

    if (generator && typeof generator.write === 'function') {
      return !!generator.write(createGeneratorContext(node), String(content));
    }

    if (node.kind === 'device' && node.device === 'null') return true;
    if (node.kind === 'device' && node.device === 'random') return true;
    if (node.kind === 'device' && node.device === 'tty') {
      state.deviceBuffers.tty += String(content);
      return true;
    }

    return false;
  }

  function read(pathValue, cwd = '/home/user') {
    const node = getNode(pathValue, cwd);
    if (!node) return null;
    if (node.type === 'directory') return null;
    if (node.type === 'file') return node.content;
    return readVirtual(node);
  }

  function write(pathValue, cwd = '/home/user', content = '') {
    const { parent, name } = getParentRef(pathValue, cwd);
    if (!parent || parent.type !== 'directory') return false;

    const existing = parent.children[name];

    if (existing && existing.type === 'directory') return false;
    if (existing && existing.type === 'virtual') {
      const ok = writeVirtual(existing, content);
      if (ok) existing.modifiedAt = now();
      return ok;
    }

    if (existing) {
      existing.content = String(content);
      existing.size = existing.content.length;
      existing.modifiedAt = now();
      return true;
    }

    const fileNode = createNode(name, 'file', {
      content,
      owner: parent.owner,
      group: parent.group,
      permissions: '-rw-r--r--',
    });
    fileNode.size = String(content || '').length;
    parent.children[name] = fileNode;
    assignPaths(state.root, '/');
    return true;
  }

  function append(pathValue, cwd = '/home/user', content = '') {
    const { parent, name } = getParentRef(pathValue, cwd);
    if (!parent || parent.type !== 'directory') return false;

    const existing = parent.children[name];
    if (existing && existing.type === 'directory') return false;

    if (existing && existing.type === 'virtual') {
      const ok = writeVirtual(existing, content);
      if (ok) existing.modifiedAt = now();
      return ok;
    }

    if (existing) {
      existing.content = `${existing.content}${String(content)}`;
      existing.size = existing.content.length;
      existing.modifiedAt = now();
      return true;
    }

    return write(pathValue, cwd, content);
  }

  function mkdir(pathValue, cwd = '/home/user', options = {}) {
    const { parent, name } = getParentRef(pathValue, cwd);
    if (!parent || parent.type !== 'directory') {
      return `mkdir: cannot create directory: No such file or directory`;
    }
    if (name === '/') {
      return `mkdir: cannot create directory '/': File exists`;
    }
    if (parent.children[name]) {
      return `mkdir: cannot create directory '${name}': File exists`;
    }

    parent.children[name] = createNode(name, 'directory', {
      owner: options.owner || parent.owner || 'user',
      group: options.group || parent.group || 'user',
      permissions: options.permissions || 'drwxr-xr-x',
    });
    assignPaths(state.root, '/');
    return null;
  }

  function removeRecursive(node) {
    if (node.type === 'directory' && node.children) {
      for (const childNode of Object.values(node.children)) removeRecursive(childNode);
    }
  }

  function rm(pathValue, cwd = '/home/user', recursive = false) {
    const { parent, name } = getParentRef(pathValue, cwd);
    if (!parent || parent.type !== 'directory' || !parent.children[name]) {
      return `rm: cannot remove '${pathValue}': No such file or directory`;
    }

    const existing = parent.children[name];
    if (existing.type === 'directory' && !recursive) {
      return `rm: cannot remove '${pathValue}': Is a directory`;
    }

    if (existing.type === 'directory') removeRecursive(existing);
    delete parent.children[name];
    assignPaths(state.root, '/');
    return null;
  }

  function copyNode(node) {
    return cloneNode(node);
  }

  function mv(src, dst, cwd = '/home/user') {
    const sourceRef = getParentRef(src, cwd);
    if (!sourceRef.parent || sourceRef.parent.type !== 'directory' || !sourceRef.parent.children[sourceRef.name]) {
      return `mv: cannot stat '${src}': No such file or directory`;
    }

    const sourceNode = sourceRef.parent.children[sourceRef.name];
    const targetNode = getNode(dst, cwd);
    const targetRef = getParentRef(dst, cwd);

    if (targetNode && targetNode.type === 'directory') {
      if (targetNode.children[sourceNode.name]) delete targetNode.children[sourceNode.name];
      targetNode.children[sourceNode.name] = sourceNode;
      delete sourceRef.parent.children[sourceRef.name];
      assignPaths(state.root, '/');
      return null;
    }

    if (!targetRef.parent || targetRef.parent.type !== 'directory') {
      return `mv: target '${dst}': No such file or directory`;
    }

    if (targetRef.parent.children[targetRef.name]) delete targetRef.parent.children[targetRef.name];
    delete sourceRef.parent.children[sourceRef.name];
    sourceNode.name = targetRef.name;
    targetRef.parent.children[targetRef.name] = sourceNode;
    assignPaths(state.root, '/');
    return null;
  }

  function cp(src, dst, cwd = '/home/user') {
    const source = getNode(src, cwd);
    if (!source) {
      return `cp: cannot stat '${src}': No such file or directory`;
    }

    const destinationNode = getNode(dst, cwd);
    const destinationRef = getParentRef(dst, cwd);
    const cloned = copyNode(source);

    if (destinationNode && destinationNode.type === 'directory') {
      if (destinationNode.children[cloned.name]) delete destinationNode.children[cloned.name];
      destinationNode.children[cloned.name] = cloned;
      assignPaths(state.root, '/');
      return null;
    }

    if (!destinationRef.parent || destinationRef.parent.type !== 'directory') {
      return `cp: target '${dst}': No such file or directory`;
    }

    cloned.name = destinationRef.name;
    destinationRef.parent.children[destinationRef.name] = cloned;
    assignPaths(state.root, '/');
    return null;
  }

  function findN(startPath, cwd = '/home/user', predicate = () => true) {
    const startNode = getNode(startPath, cwd);
    if (!startNode || startNode.type !== 'directory') return [];

    const results = [];

    function walk(node) {
      if (predicate(node, node.path)) results.push(node.path);
      if (node.type === 'directory' && node.children) {
        for (const childNode of Object.values(node.children)) walk(childNode);
      }
    }

    walk(startNode);
    return results;
  }

  function completions(partial, cwd = '/home/user') {
    const value = String(partial || '');
    if (!value) {
      const node = getNode('.', cwd);
      if (!node || node.type !== 'directory') return [];
      return Object.entries(node.children).map(([name, child]) => name + (child.type === 'directory' ? '/' : ''));
    }

    const slashIndex = value.lastIndexOf('/');
    const directoryPart = slashIndex === -1 ? '.' : value.slice(0, slashIndex) || '/';
    const filePart = slashIndex === -1 ? value : value.slice(slashIndex + 1);
    const directoryNode = getNode(directoryPart, cwd);
    if (!directoryNode || directoryNode.type !== 'directory') return [];

    const prefix = slashIndex === -1 ? '' : (directoryPart === '/' ? '/' : `${directoryPart}/`);
    const matches = [];

    for (const [name, child] of Object.entries(directoryNode.children)) {
      if (name.startsWith(filePart)) {
        matches.push(`${prefix}${name}${child.type === 'directory' ? '/' : ''}`);
      }
    }

    return matches;
  }

  function listDirectory(pathValue = '.', cwd = '/home/user') {
    const node = getNode(pathValue, cwd);
    if (!node || node.type !== 'directory') return null;
    return Object.values(node.children);
  }

  function setDeviceBuffer(name, value) {
    state.deviceBuffers[name] = String(value || '');
  }

  function appendDeviceBuffer(name, value) {
    state.deviceBuffers[name] = `${state.deviceBuffers[name] || ''}${String(value || '')}`;
  }

  function getDeviceBuffer(name) {
    return state.deviceBuffers[name] || '';
  }

  function normalizeManifestEntry(entry, fallbackType) {
    if (typeof entry === 'string') {
      return { path: entry, type: fallbackType };
    }
    if (!entry || !entry.path) return null;
    return { ...entry, type: entry.type || fallbackType };
  }

  function applyManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') return false;

    const directoryEntries = Array.isArray(manifest.directories)
      ? manifest.directories.map((entry) => normalizeManifestEntry(entry, 'directory')).filter(Boolean)
      : [];
    const fileEntries = Array.isArray(manifest.files)
      ? manifest.files.map((entry) => normalizeManifestEntry(entry, 'file')).filter(Boolean)
      : [];
    const virtualEntries = Array.isArray(manifest.virtualFiles)
      ? manifest.virtualFiles.map((entry) => normalizeManifestEntry(entry, 'virtual')).filter(Boolean)
      : [];
    const deviceEntries = Array.isArray(manifest.devices)
      ? manifest.devices.map((entry) => normalizeManifestEntry(entry, 'virtual')).filter(Boolean)
      : [];

    for (const entry of directoryEntries) {
      ensureDirectoryPath(entry.path, '/', entry);
    }

    for (const entry of fileEntries) {
      const options = {
        owner: entry.owner,
        group: entry.group,
        permissions: entry.permissions,
        createdAt: entry.createdAt,
        modifiedAt: entry.modifiedAt,
      };
      ensureFilePath(entry.path, entry.content || '', '/', options);
    }

    for (const entry of virtualEntries) {
      const options = {
        owner: entry.owner,
        group: entry.group,
        permissions: entry.permissions,
        kind: entry.kind || 'runtime',
        generator: entry.generator || null,
        device: entry.device || null,
        readOnly: entry.readOnly,
        createdAt: entry.createdAt,
        modifiedAt: entry.modifiedAt,
      };
      ensureVirtualPath(entry.path, entry.generator || null, '/', options);
    }

    for (const entry of deviceEntries) {
      const options = {
        owner: entry.owner,
        group: entry.group,
        permissions: entry.permissions,
        kind: 'device',
        generator: entry.generator || entry.deviceGenerator || null,
        device: entry.device || entry.name || null,
        readOnly: entry.readOnly,
        createdAt: entry.createdAt,
        modifiedAt: entry.modifiedAt,
      };
      ensureVirtualPath(entry.path, options.generator || null, '/', options);
    }

    state.bootstrapped = true;
    assignPaths(state.root, '/');
    return true;
  }

  function buildDefaultManifest() {
    return {
      directories: [
        { path: '/', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/bin', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/boot', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/dev', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/etc', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/home', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/lib', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/media', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/mnt', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/opt', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/proc', owner: 'root', group: 'root', permissions: 'dr-xr-xr-x' },
        { path: '/root', owner: 'root', group: 'root', permissions: 'drwx------' },
        { path: '/run', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/sbin', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/srv', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/sys', owner: 'root', group: 'root', permissions: 'dr-xr-xr-x' },
        { path: '/tmp', owner: 'root', group: 'root', permissions: 'drwxrwxrwt' },
        { path: '/usr', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/usr/bin', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/usr/lib', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/usr/sbin', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/usr/share', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/var', owner: 'root', group: 'root', permissions: 'drwxr-xr-x' },
        { path: '/var/log', owner: 'root', group: 'adm', permissions: 'drwxr-xr-x' },
        { path: '/var/tmp', owner: 'root', group: 'root', permissions: 'drwxrwxrwt' },
        { path: '/home/user', owner: 'user', group: 'user', permissions: 'drwxr-xr-x' },
        { path: '/home/user/projects', owner: 'user', group: 'user', permissions: 'drwxr-xr-x' },
        { path: '/home/user/.config', owner: 'user', group: 'user', permissions: 'drwx------' },
        { path: '/home/user/.ssh', owner: 'user', group: 'user', permissions: 'drwx------' },
      ],
      files: [
        {
          path: '/etc/passwd',
          owner: 'root',
          group: 'root',
          permissions: '-rw-r--r--',
          content: 'root:x:0:0:root:/root:/bin/bash\nuser:x:1000:1000:User:/home/user:/bin/bash\n',
        },
        {
          path: '/etc/hostname',
          owner: 'root',
          group: 'root',
          permissions: '-rw-r--r--',
          content: 'weblinux',
        },
        {
          path: '/etc/hosts',
          owner: 'root',
          group: 'root',
          permissions: '-rw-r--r--',
          content: '127.0.0.1 localhost\n127.0.1.1 weblinux\n::1 localhost ip6-localhost ip6-loopback\n',
        },
        {
          path: '/etc/bashrc',
          owner: 'root',
          group: 'root',
          permissions: '-rw-r--r--',
          content: '# /etc/bashrc\nexport PS1="\\u@\\h:\\w$ "\n',
        },
        {
          path: '/home/user/.bashrc',
          owner: 'user',
          group: 'user',
          permissions: '-rw-r--r--',
          content: '# ~/.bashrc\nexport PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nalias ll="ls -la"\nalias la="ls -a"\n',
        },
        {
          path: '/home/user/.profile',
          owner: 'user',
          group: 'user',
          permissions: '-rw-r--r--',
          content: '# ~/.profile\n[ -f ~/.bashrc ] && . ~/.bashrc\n',
        },
        {
          path: '/home/user/notes.txt',
          owner: 'user',
          group: 'user',
          permissions: '-rw-r--r--',
          content: 'Learning sandbox notes.\nUse pwd, ls, cd, cat, touch, mkdir, and rm to explore.\n',
        },
        {
          path: '/home/user/todo.txt',
          owner: 'user',
          group: 'user',
          permissions: '-rw-r--r--',
          content: 'TODO\n- Learn path resolution\n- Practice directory traversal\n- Inspect /proc runtime files\n',
        },
        {
          path: '/home/user/projects/README.md',
          owner: 'user',
          group: 'user',
          permissions: '-rw-r--r--',
          content: '# Browser Linux Sandbox\nThis directory is for practice projects inside the virtual filesystem.\n',
        },
        {
          path: '/home/user/projects/app.js',
          owner: 'user',
          group: 'user',
          permissions: '-rwxr-xr-x',
          content: 'console.log(\'Hello from the virtual filesystem\');\n',
        },
        {
          path: '/home/user/projects/data.json',
          owner: 'user',
          group: 'user',
          permissions: '-rw-r--r--',
          content: '{\n  "app": "virtual-sandbox",\n  "version": "1.0.0"\n}\n',
        },
        {
          path: '/var/log/syslog',
          owner: 'root',
          group: 'adm',
          permissions: '-rw-r-----',
          content: 'Jan 01 00:00:01 weblinux kernel: Virtual kernel booted successfully\nJan 01 00:00:02 weblinux systemd[1]: Started browser runtime services\n',
        },
        {
          path: '/var/log/auth.log',
          owner: 'root',
          group: 'adm',
          permissions: '-rw-r-----',
          content: 'Jan 01 00:00:03 weblinux sshd[100]: Accepted key for user from 127.0.0.1\n',
        },
      ],
      virtualFiles: [
        {
          path: '/proc/version',
          owner: 'root',
          group: 'root',
          permissions: '-r--r--r--',
          generator: 'proc.version',
          kind: 'runtime',
          readOnly: true,
        },
        {
          path: '/proc/meminfo',
          owner: 'root',
          group: 'root',
          permissions: '-r--r--r--',
          generator: 'proc.meminfo',
          kind: 'runtime',
          readOnly: true,
        },
        {
          path: '/proc/cpuinfo',
          owner: 'root',
          group: 'root',
          permissions: '-r--r--r--',
          generator: 'proc.cpuinfo',
          kind: 'runtime',
          readOnly: true,
        },
      ],
      devices: [
        {
          path: '/dev/null',
          owner: 'root',
          group: 'root',
          permissions: 'crw-rw-rw-',
          generator: 'device.null',
          device: 'null',
          kind: 'device',
          readOnly: false,
        },
        {
          path: '/dev/random',
          owner: 'root',
          group: 'root',
          permissions: 'crw-rw-rw-',
          generator: 'device.random',
          device: 'random',
          kind: 'device',
          readOnly: false,
        },
        {
          path: '/dev/tty',
          owner: 'user',
          group: 'tty',
          permissions: 'crw-rw-rw-',
          generator: 'device.tty',
          device: 'tty',
          kind: 'device',
          readOnly: false,
        },
      ],
    };
  }

  function bootstrapDefault() {
    reset();
    applyManifest(buildDefaultManifest());
    state.bootstrapped = true;
    return state.root;
  }

  function ensureBootstrapped() {
    if (!state.root || !state.bootstrapped) {
      bootstrapDefault();
    }
    return state.root;
  }

  const api = {
    get root() {
      ensureBootstrapped();
      return state.root;
    },
    now,
    reset,
    bootstrapDefault,
    ensureBootstrapped,
    isBootstrapped: () => !!state.bootstrapped,
    resolve,
    absStr,
    getN: getNode,
    getPN: getParentRef,
    read,
    write,
    append,
    mkdir,
    rm,
    cp,
    mv,
    findN,
    completions,
    listDirectory,
    ensureDirectoryPath,
    ensureDirectoryValue,
    _mkdirp: ensureDirectoryPath,
    _mkfile: ensureFilePath,
    _mkvirtual: ensureVirtualPath,
    _mkdevice: (pathValue, deviceType, cwd = '/home/user', options = {}) => ensureVirtualPath(pathValue, deviceType || `device.${options.device || 'unknown'}`, cwd, {
      ...options,
      kind: 'device',
      device: options.device || deviceType || null,
    }),
    copyNode,
    applyManifest,
    setDeviceBuffer,
    appendDeviceBuffer,
    getDeviceBuffer,
    createNode,
  };

  reset();
  bootstrapDefault();

  globalScope.BrowserLinuxVFS = api;
  globalScope.LinuxVFS = api;
})(window);
