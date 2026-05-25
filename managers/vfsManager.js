/**
 * Virtual File System Manager
 * Loads the browser VFS manifest and applies it to the runtime VFS.
 */
const VFSManager = (() => {
  let vfsState = null;
  let isInitialized = false;

  /**
   * Initialize the VFS from JSON manifest
   * @returns {Promise<void>}
   */
  async function init() {
    if (isInitialized) return;

    const data = await JSONLoader.load('./config/vfs-initial-state.json');
    if (data) {
      vfsState = data;
      console.log('VFSManager: Loaded initial VFS state from manifest');
      if (VFS && typeof VFS.reset === 'function') {
        VFS.reset();
      }
      await applyState();
    } else {
      console.warn('VFSManager: Failed to load VFS state, will use default initialization');
    }
    isInitialized = true;
  }

  /**
   * Apply the loaded VFS state to the actual VFS
   * @private
   * @returns {Promise<void>}
   */
  async function applyState() {
    if (!vfsState) return;

    // Create directories
    if (vfsState.directories && Array.isArray(vfsState.directories)) {
      for (const dirPath of vfsState.directories) {
        const entry = typeof dirPath === 'string' ? { path: dirPath } : dirPath;
        VFS._mkdirp(entry.path, '/', entry);
      }
    }

    // Create files
    if (vfsState.files && Array.isArray(vfsState.files)) {
      for (const fileEntry of vfsState.files) {
        const { path, content = '', permissions, owner, group } = fileEntry;
        const options = {};
        if (permissions) options.permissions = permissions;
        if (owner) options.owner = owner;
        if (group) options.group = group;
        VFS._mkfile(path, content, options);
      }
    }

    if (vfsState.virtualFiles && Array.isArray(vfsState.virtualFiles)) {
      for (const virtualEntry of vfsState.virtualFiles) {
        const { path, generator, permissions, owner, group, kind, device, readOnly } = virtualEntry;
        VFS._mkvirtual(path, generator, '/', {
          permissions,
          owner,
          group,
          kind,
          device,
          readOnly,
        });
      }
    }

    if (vfsState.devices && Array.isArray(vfsState.devices)) {
      for (const deviceEntry of vfsState.devices) {
        const { path, generator, permissions, owner, group, device, readOnly } = deviceEntry;
        VFS._mkdevice(path, generator || device, '/', {
          permissions,
          owner,
          group,
          device,
          readOnly,
        });
      }
    }

    if (vfsState.executables && Array.isArray(vfsState.executables)) {
      for (const executableEntry of vfsState.executables) {
        const { path, command, permissions, owner, group, content } = executableEntry;
        VFS._mkexecutable(path, command, '/', {
          permissions,
          owner,
          group,
          content,
        });
      }
    }
  }

  /**
   * Get file content by path
   * @param {string} path - File path
   * @param {string} cwd - Current working directory
   * @returns {string|null}
   */
  function readFile(path, cwd) {
    return VFS.read(path, cwd);
  }

  /**
   * List directory contents
   * @param {string} path - Directory path
   * @param {string} cwd - Current working directory
   * @returns {Array<Object>|null}
   */
  function listDirectory(path, cwd) {
    const node = VFS.getN(path, cwd);
    if (!node || node.type !== 'directory') return null;
    return Object.values(node.children);
  }

  /**
   * Check if path is a directory
   * @param {string} path - File path
   * @param {string} cwd - Current working directory
   * @returns {boolean}
   */
  function isDirectory(path, cwd) {
    const node = VFS.getN(path, cwd);
    return node && node.type === 'directory';
  }

  /**
   * Check if path is a file
   * @param {string} path - File path
   * @param {string} cwd - Current working directory
   * @returns {boolean}
   */
  function isFile(path, cwd) {
    const node = VFS.getN(path, cwd);
    return node && node.type === 'file';
  }

  /**
   * Get file/directory info
   * @param {string} path - File path
   * @param {string} cwd - Current working directory
   * @returns {Object|null}
   */
  function getInfo(path, cwd) {
    return VFS.getN(path, cwd);
  }

  /**
   * Get the loaded VFS state object
   * @returns {Object|null}
   */
  function getState() {
    return vfsState;
  }

  /**
   * Check if VFS was initialized from JSON
   * @returns {boolean}
   */
  function isFromJSON() {
    return vfsState !== null;
  }

  return {
    init,
    readFile,
    listDirectory,
    isDirectory,
    isFile,
    getInfo,
    getState,
    isFromJSON,
  };
})();
