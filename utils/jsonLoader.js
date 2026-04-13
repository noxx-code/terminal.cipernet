/**
 * JSON Loader Utility
 * Handles async loading of JSON configuration files with error handling
 * and caching support.
 */
const JSONLoader = (() => {
  const cache = new Map();

  /**
   * Load a JSON file from the specified path
   * @param {string} path - URL path to JSON file
   * @returns {Promise<Object|null>} Parsed JSON object or null on failure
   */
  async function load(path) {
    if (cache.has(path)) {
      return cache.get(path);
    }

    try {
      const response = await fetch(path);
      if (!response.ok) {
        console.warn(`JSONLoader: Failed to load ${path} (${response.status})`);
        return null;
      }
      const data = await response.json();
      cache.set(path, data);
      return data;
    } catch (error) {
      console.warn(`JSONLoader: Error loading ${path}:`, error.message);
      return null;
    }
  }

  /**
   * Load multiple JSON files in parallel
   * @param {Object} pathMap - Object with keys and JSON paths
   * @returns {Promise<Object>} Object with same keys and loaded data (or null if failed)
   */
  async function loadMany(pathMap) {
    const promises = Object.entries(pathMap).map(async ([key, path]) => {
      const data = await load(path);
      return [key, data];
    });

    const results = await Promise.all(promises);
    return Object.fromEntries(results);
  }

  /**
   * Clear the cache
   */
  function clearCache() {
    cache.clear();
  }

  return {
    load,
    loadMany,
    clearCache,
  };
})();
