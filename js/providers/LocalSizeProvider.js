import { CompanySizeProvider } from './CompanySizeProvider.js';

const STORAGE_KEY = 'prh-company-search.sizeOverrides.v1';

/**
 * Default company-size provider used by this app.
 *
 * PRH's open company register does not contain financial/headcount data at
 * all (see PrhProvider.js docs), so there is no live API this app can call
 * for revenue/employee figures out of the box. Instead this provider lets
 * the user attach revenue/employee figures to a company locally (typed in
 * the UI, or bulk-imported from a CSV export of a data source they already
 * have access to, e.g. Asiakastieto/Finder/Vainu). Values are persisted in
 * the browser's localStorage, keyed by business id.
 *
 * This keeps the app honest (it never invents financial data) while still
 * fully supporting size-based filtering/sorting. When a real live size-data
 * API becomes available, implement CompanySizeProvider against it and swap
 * it in via ProviderRegistry - no other code changes needed.
 */
export class LocalSizeProvider extends CompanySizeProvider {
  id = 'local';
  label = 'Manuaalinen / tuotu kokotieto (local)';

  constructor() {
    super();
    this._store = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._store));
  }

  async getSize(company) {
    const entry = this._store[company.businessId];
    if (!entry) return { revenueEur: null, employees: null, source: this.id };
    return { revenueEur: entry.revenueEur ?? null, employees: entry.employees ?? null, source: this.id };
  }

  /**
   * Sets/updates the size override for one company and persists it.
   * @param {string} businessId
   * @param {{ revenueEur?: number|null, employees?: number|null }} values
   */
  setSize(businessId, values) {
    const current = this._store[businessId] ?? {};
    this._store[businessId] = {
      revenueEur: values.revenueEur ?? current.revenueEur ?? null,
      employees: values.employees ?? current.employees ?? null,
    };
    this._save();
  }

  /**
   * Bulk-imports size data from parsed CSV rows.
   * @param {Array<{businessId: string, revenueEur?: number, employees?: number}>} rows
   */
  importRows(rows) {
    for (const row of rows) {
      if (!row.businessId) continue;
      this.setSize(row.businessId, row);
    }
  }
}
