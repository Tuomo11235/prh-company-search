const STORAGE_KEY = 'prh-company-search.savedSearches.v1';

/**
 * Persists named search criteria (and, optionally, a snapshot of the last
 * results) in the browser's localStorage so users can re-run or revisit a
 * search later without retyping it. This is intentionally simple
 * (localStorage, no backend) since the app is a static browser-only app;
 * swap this out for a real backend-backed implementation later if needed -
 * consumers only depend on the methods below.
 */
export class SavedSearchService {
  constructor(storage = window.localStorage) {
    this.storage = storage;
  }

  list() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch {
      return [];
    }
  }

  /**
   * @param {string} name
   * @param {object} criteria search form criteria to persist
   * @param {Array<import('../models/Company.js').Company>} [resultsSnapshot]
   */
  save(name, criteria, resultsSnapshot = []) {
    const items = this.list();
    const id = crypto.randomUUID();
    items.push({
      id,
      name,
      criteria,
      resultsSnapshot,
      savedAt: new Date().toISOString(),
    });
    this.storage.setItem(STORAGE_KEY, JSON.stringify(items));
    return id;
  }

  remove(id) {
    const items = this.list().filter((item) => item.id !== id);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  get(id) {
    return this.list().find((item) => item.id === id) ?? null;
  }
}
