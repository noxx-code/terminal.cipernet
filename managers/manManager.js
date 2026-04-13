/**
 * Manual Pages Manager
 * Loads and manages manual pages from manual-pages.json.
 * Provides backward-compatible interface with the existing Man system.
 */
const ManManager = (() => {
  let manPages = null;
  let isInitialized = false;

  /**
   * Initialize the manual pages manager by loading manifest
   * @returns {Promise<void>}
   */
  async function init() {
    if (isInitialized) return;

    const data = await JSONLoader.load('./config/manual-pages.json');
    if (data && data.pages) {
      manPages = data.pages;
      console.log(`ManManager: Loaded ${Object.keys(manPages).length} manual pages from manifest`);
    } else {
      console.warn('ManManager: Failed to load manifest, will use fallback mode');
      manPages = null;
    }
    isInitialized = true;
  }

  /**
   * Get manual page entry by name
   * @param {string} name - Command name
   * @returns {Object|null}
   */
  function getEntry(name) {
    if (!manPages) return null;
    return manPages[name] || null;
  }

  /**
   * Get formatted manual page output
   * @param {string} name - Command name
   * @param {string|number} section - Optional section number
   * @returns {string|null}
   */
  function getPage(name, section) {
    const entry = getEntry(name);
    if (!entry) return null;
    if (section && String(section) !== String(entry.section)) return null;

    const out = [];
    out.push(`MAN(${entry.section})${entry.name.toUpperCase()}`);
    out.push('');
    out.push('NAME');
    out.push(`    ${entry.name} - ${entry.summary}`);
    out.push('');
    out.push('SYNOPSIS');
    out.push(`    ${entry.synopsis}`);

    if (entry.description) {
      out.push('');
      out.push('DESCRIPTION');
      out.push(`    ${entry.description}`);
    }

    if (entry.options && entry.options.length) {
      out.push('');
      out.push('OPTIONS');
      for (const opt of entry.options) {
        out.push(`    ${opt}`);
      }
    }

    if (entry.examples && entry.examples.length) {
      out.push('');
      out.push('EXAMPLES');
      for (const ex of entry.examples) {
        out.push(`    $ ${ex}`);
      }
    }

    if (entry.seealso && entry.seealso.length) {
      out.push('');
      out.push('SEE ALSO');
      out.push(`    ${entry.seealso.join(', ')}`);
    }

    return out.join('\n');
  }

  /**
   * Get one-line whatis description
   * @param {string} name - Command name
   * @returns {string|null}
   */
  function getWhatis(name) {
    const entry = getEntry(name);
    if (!entry) return null;
    return `${entry.name} (${entry.section}) - ${entry.summary}`;
  }

  /**
   * Search manual pages by keyword (apropos)
   * @param {string} term - Search term
   * @returns {string}
   */
  function searchApropos(term) {
    const needle = (term || '').toLowerCase();
    if (!needle) return 'apropos: keyword expected';

    if (!manPages) {
      console.warn('ManManager: manPages not loaded, cannot search');
      return 'apropos: manuals not available';
    }

    const hits = Object.values(manPages)
      .filter(entry =>
        [
          entry.name,
          entry.summary,
          entry.description,
          ...(entry.options || []),
          ...(entry.examples || []),
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      )
      .map(entry => `${entry.name} (${entry.section}) - ${entry.summary}`);

    return hits.length ? hits.join('\n') : 'apropos: nothing appropriate';
  }

  /**
   * Get all manual page names
   * @returns {Array<string>}
   */
  function getAllNames() {
    if (!manPages) return [];
    return Object.keys(manPages);
  }

  /**
   * Check if a manual page exists
   * @param {string} name - Command name
   * @returns {boolean}
   */
  function exists(name) {
    if (!manPages) return false;
    return name in manPages;
  }

  return {
    init,
    getEntry,
    getPage,
    getWhatis,
    searchApropos,
    getAllNames,
    exists,
  };
})();
