/**
 * Command Manager
 * Loads and manages command metadata from commands-manifest.json.
 * Provides fallback to existing hardcoded commands for backward compatibility.
 */
const CommandManager = (() => {
  let commands = null;
  let isInitialized = false;

  /**
   * Initialize the command manager by loading manifest
   * @returns {Promise<void>}
   */
  async function init() {
    if (isInitialized) return;

    const data = await JSONLoader.load('./commands-manifest.json');
    if (data && data.commands) {
      commands = data.commands;
      console.log(`CommandManager: Loaded ${Object.keys(commands).length} commands from manifest`);
    } else {
      console.warn('CommandManager: Failed to load manifest, will use fallback mode');
      commands = null;
    }
    isInitialized = true;
  }

  /**
   * Get command metadata by name
   * @param {string} name - Command name
   * @returns {Object|null} Command metadata or null if not found
   */
  function getCommand(name) {
    if (!commands) return null;
    return commands[name] || null;
  }

  /**
   * Check if a command exists in the manifest
   * @param {string} name - Command name
   * @returns {boolean}
   */
  function exists(name) {
    if (!commands) return false;
    return name in commands;
  }

  /**
   * Get all command names
   * @returns {Array<string>}
   */
  function getAllNames() {
    if (!commands) return [];
    return Object.keys(commands);
  }

  /**
   * Get commands by category
   * @param {string} category - Category name
   * @returns {Array<Object>}
   */
  function getByCategory(category) {
    if (!commands) return [];
    return Object.values(commands).filter(cmd => cmd.category === category);
  }

  /**
   * Get command summary (one-line description)
   * @param {string} name - Command name
   * @returns {string|null}
   */
  function getSummary(name) {
    const cmd = getCommand(name);
    return cmd ? cmd.summary : null;
  }

  /**
   * Get all available categories
   * @returns {Array<string>}
   */
  function getCategories() {
    if (!commands) return [];
    const cats = new Set();
    Object.values(commands).forEach(cmd => {
      if (cmd.category) cats.add(cmd.category);
    });
    return Array.from(cats).sort();
  }

  return {
    init,
    getCommand,
    exists,
    getAllNames,
    getByCategory,
    getSummary,
    getCategories,
  };
})();
