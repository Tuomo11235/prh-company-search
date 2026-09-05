import { getDataProvider, getSizeProvider } from '../providers/ProviderRegistry.js';
import { RadiusSearchService } from './RadiusSearchService.js';
import { applyExclusionFilters } from './ExclusionFilters.js';
import { applySizeFilters } from './SizeFilterService.js';

/**
 * Orchestrates a full search: fetch from the selected data provider (by
 * radius or postal code), enrich with size data, then apply exclusion and
 * size filters. This is the single place that knows how to combine
 * providers/services, so the UI layer only needs to call `runSearch`.
 *
 * @typedef {Object} SearchCriteria
 * @property {string} dataProviderId
 * @property {string} sizeProviderId
 * @property {'radius'|'postCode'} mode
 * @property {string} [address]
 * @property {number} [radiusKm]
 * @property {string} [postCodes]  comma/space separated list
 * @property {boolean} excludeCareOf
 * @property {boolean} excludeHousingCompanies
 * @property {number|null} minRevenue
 * @property {number|null} maxRevenue
 * @property {number|null} minEmployees
 * @property {number|null} maxEmployees
 */

export class SearchController {
  constructor(config = {}) {
    this.radiusSearchService = config.radiusSearchService ?? new RadiusSearchService();
  }

  /**
   * @param {SearchCriteria} criteria
   * @param {(status: string) => void} [onProgress]
   * @returns {Promise<import('../models/Company.js').Company[]>}
   */
  async runSearch(criteria, onProgress = () => {}) {
    const dataProvider = getDataProvider(criteria.dataProviderId);
    const sizeProvider = getSizeProvider(criteria.sizeProviderId);

    let companies;
    if (criteria.mode === 'radius') {
      if (!criteria.address) throw new Error('Anna osoite säteittäistä hakua varten.');
      const radiusKm = Math.min(10, Math.max(0, Number(criteria.radiusKm) || 0));
      companies = await this.radiusSearchService.search(dataProvider, criteria.address, radiusKm, onProgress);
    } else if (criteria.mode === 'postCode') {
      const postCodes = this._parsePostCodes(criteria.postCodes);
      if (!postCodes.length) throw new Error('Anna vähintään yksi postinumero.');
      onProgress(`Haetaan postinumeroilla: ${postCodes.join(', ')}...`);
      companies = await dataProvider.searchByPostCodes(postCodes);
    } else {
      throw new Error(`Tuntematon hakutapa: ${criteria.mode}`);
    }

    onProgress('Suodatetaan tuloksia...');
    companies = applyExclusionFilters(companies, criteria);

    onProgress('Haetaan kokotietoja...');
    const sizes = await sizeProvider.getSizes(companies);
    companies = companies.map((company, i) => ({ ...company, size: sizes[i] ?? company.size }));

    companies = applySizeFilters(companies, criteria);

    onProgress(`Valmis. ${companies.length} yritystä.`);
    return companies;
  }

  _parsePostCodes(value) {
    return (value ?? '')
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
