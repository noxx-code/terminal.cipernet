/**
 * Virtual File System Manager
 * Loads and initializes the VFS from vfs-initial-state.json.
 * Provides helper functions for common VFS operations.
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
        VFS._mkdirp(dirPath);
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
