/**
 * Abstract base class for a "company data provider". A provider knows how to
 * talk to one upstream data source (PRH, or in the future e.g. Asiakastieto,
 * Vainu, Fonecta Finder, ...) and must return data already normalized into
 * the shared Company model (see js/models/Company.js).
 *
 * Adding a new provider later only requires:
 *   1. Create a new class extending DataProvider.
 *   2. Implement `searchByPostCodes` and/or `searchByMunicipality`.
 *   3. Register it in js/providers/ProviderRegistry.js.
 * No other part of the app needs to change.
 */
export class DataProvider {
  /** @type {string} Unique machine-readable id, e.g. "prh". */
  id = 'base';

  /** @type {string} Human readable label shown in the UI. */
  label = 'Base provider';

  /**
   * Search companies whose registered address postal code is in the given
   * list. Implementations should return normalized Company objects.
   * @param {string[]} postCodes
   * @param {{ page?: number, changedSince?: string }} [options]
   * @returns {Promise<import('../models/Company.js').Company[]>}
   */
  async searchByPostCodes(postCodes, options = {}) {
    throw new Error(`${this.constructor.name} does not implement searchByPostCodes`);
  }

  /**
   * Search companies registered in a given municipality (kunta). Used as the
   * coarse pre-filter for radius search, since PRH's public API has no
   * native geo-radius search endpoint (see GeocodingService for the
   * radius-refinement step that runs after this).
   * @param {string} municipality
   * @param {{ page?: number, changedSince?: string }} [options]
   * @returns {Promise<import('../models/Company.js').Company[]>}
   */
  async searchByMunicipality(municipality, options = {}) {
    throw new Error(`${this.constructor.name} does not implement searchByMunicipality`);
  }
}
