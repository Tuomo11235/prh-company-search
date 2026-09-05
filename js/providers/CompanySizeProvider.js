/**
 * Abstract base class for a "company size provider": a data source that can
 * enrich a Company with revenue / employee-count information so the app can
 * filter by company size. PRH's public open data does NOT include financial
 * data, so this is deliberately a separate abstraction (see
 * js/providers/PrhProvider.js for the full explanation) - plug in a real
 * paid data source (e.g. Asiakastieto, Vainu, Fonecta Finder) later by
 * implementing this interface, without touching filtering/sorting/UI code.
 */
export class CompanySizeProvider {
  id = 'base-size';
  label = 'Base size provider';

  /**
   * Returns size info for a single company, or null if unknown.
   * @param {import('../models/Company.js').Company} company
   * @returns {Promise<import('../models/Company.js').CompanySize|null>}
   */
  async getSize(company) {
    throw new Error(`${this.constructor.name} does not implement getSize`);
  }

  /**
   * Convenience batch helper; default implementation just maps getSize.
   * Real providers with bulk APIs can override this for efficiency.
   * @param {import('../models/Company.js').Company[]} companies
   */
  async getSizes(companies) {
    return Promise.all(companies.map((c) => this.getSize(c)));
  }
}
