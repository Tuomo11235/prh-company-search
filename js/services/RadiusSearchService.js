import { GeocodingService, haversineDistanceKm } from './GeocodingService.js';

/**
 * Implements "search within N km of an address" on top of a DataProvider
 * that only supports postal-code / municipality search (like PRH - see
 * js/providers/PrhProvider.js for why). Strategy:
 *   1. Geocode the center address -> lat/lon + municipality.
 *   2. Ask the data provider for all companies registered in that
 *      municipality (coarse pre-filter; keeps the number of API calls and
 *      geocoding look-ups reasonable instead of scanning the whole registry).
 *   3. Geocode each candidate company's address and keep only the ones
 *      whose true great-circle distance to the center is <= radiusKm.
 *
 * ASSUMPTION / LIMITATION: because Finnish municipalities can be large,
 * this may miss companies just across a municipality border from the
 * search center, and it may also be slow for big municipalities because
 * every candidate needs a reverse geocode call. This is documented in the
 * UI. If a future provider exposes a native radius/geo search, plug it in
 * directly instead of using this service.
 */
export class RadiusSearchService {
  constructor(config = {}) {
    this.geocoder = config.geocoder ?? new GeocodingService();
    this.maxCandidates = config.maxCandidates ?? 150;
  }

  /**
   * @param {import('../providers/DataProvider.js').DataProvider} provider
   * @param {string} address
   * @param {number} radiusKm
   * @param {(status: string) => void} [onProgress]
   * @returns {Promise<import('../models/Company.js').Company[]>}
   */
  async search(provider, address, radiusKm, onProgress = () => {}) {
    onProgress(`Geokoodataan osoitetta "${address}"...`);
    const center = await this.geocoder.geocode(address);
    if (!center) {
      throw new Error(`Osoitetta "${address}" ei löytynyt geokoodauksesta.`);
    }
    if (!center.municipality) {
      throw new Error(`Kuntaa ei pystytty päättelemään osoitteelle "${address}".`);
    }

    onProgress(`Haetaan yrityksiä kunnasta "${center.municipality}"...`);
    const candidates = await provider.searchByMunicipality(center.municipality);
    const limited = candidates.slice(0, this.maxCandidates);

    onProgress(`Tarkistetaan etäisyydet (${limited.length} yritystä)...`);
    const inRadius = [];
    for (const company of limited) {
      const point = await this.geocoder.geocodeCompanyAddress(company);
      if (!point) continue;
      const distanceKm = haversineDistanceKm(center, point);
      if (distanceKm <= radiusKm) {
        inRadius.push({ ...company, distanceKm });
      }
    }
    return inRadius;
  }
}
