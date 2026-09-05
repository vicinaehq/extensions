// Test-only loader: replace @vicinae/api with an in-memory stub so the Node
// test runner can exercise code that depends on LocalStorage without the
// Vicinae app runtime (which is unavailable outside the launcher).
const store = new Map();

const LocalStorage = {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async setItem(key, value) {
    store.set(key, String(value));
  },
  async removeItem(key) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
  async allKeys() {
    return [...store.keys()];
  },
  async getItems() {
    return Object.fromEntries(store);
  },
};

const stub = {
  LocalStorage,
  // Minimal no-op exports used by code under test if any import slips through.
  Cache: class {
    async get() { return null; }
    async set() {}
    async has() { return false; }
    async remove() {}
    async clear() {}
  },
  environment: { assetsPath: "", supportPath: "", isDevelopment: true, locale: "en" },
  getPreferenceValues: () => ({}),
};

export async function resolve(specifier, context, next) {
  if (specifier === "@vicinae/api") {
    return {
      url: "data:text/javascript," + encodeURIComponent(
        "export const LocalStorage = globalThis.__VICINAE_STUB__.LocalStorage;" +
        "export const Cache = globalThis.__VICINAE_STUB__.Cache;" +
        "export const environment = globalThis.__VICINAE_STUB__.environment;" +
        "export const getPreferenceValues = globalThis.__VICINAE_STUB__.getPreferenceValues;"
      ),
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}

globalThis.__VICINAE_STUB__ = stub;
