/**
 * Command Manager
 * Loads and manages command metadata from commands-manifest.json.
 * Provides fallback to existing hardcoded commands for backward compatibility.
 */
const CommandManager = (() => {
  let commands = null;
  let isInitialized = false;

  function normalizeList(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
  }

  function normalizeCommandEntry(key, entry) {
    if (!entry || typeof entry !== 'object') return null;

    const name = typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : (typeof key === 'string' ? key.trim() : '');

    if (!name) return null;

    return {
      name,
      section: typeof entry.section === 'string' && entry.section.trim() ? entry.section.trim() : '1',
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : 'UTILITIES',
      summary: typeof entry.summary === 'string' ? entry.summary.trim() : '',
      synopsis: typeof entry.synopsis === 'string' ? entry.synopsis.trim() : name,
      description: typeof entry.description === 'string' ? entry.description.trim() : '',
      options: normalizeList(entry.options),
      examples: normalizeList(entry.examples),
      seealso: normalizeList(entry.seealso),
    };
  }

  function normalizeManifest(data) {
    if (!data || typeof data !== 'object' || !data.commands || typeof data.commands !== 'object') {
      return null;
    }

    const nextCommands = {};

    for (const [key, entry] of Object.entries(data.commands)) {
      const normalized = normalizeCommandEntry(key, entry);
      if (normalized) nextCommands[normalized.name] = normalized;
    }

    return Object.keys(nextCommands).length ? nextCommands : null;
  }

  function sortByName(left, right) {
    return left.name.localeCompare(right.name);
  }

  /**
   * Initialize the command manager by loading manifest
   * @returns {Promise<void>}
   */
  async function init() {
    if (isInitialized) return;

    const data = await JSONLoader.load('./config/commands-manifest.json');
    const normalized = normalizeManifest(data);

    if (normalized) {
      commands = normalized;
      console.log(`CommandManager: Loaded ${Object.keys(commands).length} commands from manifest`);
    } else {
      console.warn('CommandManager: Failed to load or validate manifest, will use fallback mode');
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
   * Get all normalized command entries
   * @returns {Array<Object>}
   */
  function getAllEntries() {
    if (!commands) return [];
    return Object.values(commands).slice().sort(sortByName);
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
    return getAllEntries().map((cmd) => cmd.name);
  }

  /**
   * Get commands by category
   * @param {string} category - Category name
   * @returns {Array<Object>}
   */
  function getByCategory(category) {
    if (!commands) return [];
    return getAllEntries().filter((cmd) => cmd.category === category);
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
    getAllEntries().forEach((cmd) => {
      if (cmd.category) cats.add(cmd.category);
    });
    return Array.from(cats).sort();
  }

  /**
   * Get commands grouped by category for help and discovery output
   * @returns {Array<{category: string, commands: Array<Object>}>}
   */
  function getCatalog() {
    if (!commands) return [];

    const grouped = new Map();
    for (const entry of getAllEntries()) {
      const category = entry.category || 'UTILITIES';
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(entry);
    }

    return Array.from(grouped.entries())
      .map(([category, groupedCommands]) => ({
        category,
        commands: groupedCommands,
      }))
      .sort((left, right) => left.category.localeCompare(right.category));
  }

  return {
    init,
    getCommand,
    getAllEntries,
    exists,
    getAllNames,
    getByCategory,
    getSummary,
    getCategories,
    getCatalog,
  };
})();
