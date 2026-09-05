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
    // Kept modest by default because each candidate needs a throttled (~1/s)
    // geocoding call - 60 candidates already means ~1 minute of waiting.
    // Callers can raise this for smaller municipalities / faster geocoders.
    this.maxCandidates = config.maxCandidates ?? 60;
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
    const truncated = candidates.length > limited.length;
    if (truncated) {
      onProgress(
        `Huom: kunnasta löytyi ${candidates.length} yritystä, joista tarkistetaan vain ensimmäiset ${limited.length} `
        + `(maxCandidates-raja) - osa säteen sisällä olevista yrityksistä saattaa puuttua tuloksista.`,
      );
    }

    // NOTE: each candidate needs its own geocoding lookup, and the geocoder
    // throttles requests (~1/second) to respect Nominatim's usage policy, so
    // this step can take a while for municipalities with many companies.
    // We report progress periodically so the UI doesn't look stuck.
    onProgress(`Tarkistetaan etäisyydet (0/${limited.length} yritystä, tämä voi kestää hetken)...`);
    const inRadius = [];
    for (const [index, company] of limited.entries()) {
      const point = await this.geocoder.geocodeCompanyAddress(company);
      if (point) {
        const distanceKm = haversineDistanceKm(center, point);
        if (distanceKm <= radiusKm) {
          inRadius.push({ ...company, distanceKm });
        }
      }
      if ((index + 1) % 5 === 0 || index === limited.length - 1) {
        onProgress(`Tarkistetaan etäisyydet (${index + 1}/${limited.length} yritystä)...`);
      }
    }
    // Attach truncation metadata to the result array so callers (e.g. the UI)
    // can warn the user that the candidate set was capped, without changing
    // the array's shape for consumers that only care about the companies.
    inRadius.truncated = truncated;
    inRadius.candidateCount = candidates.length;
    inRadius.checkedCount = limited.length;
    return inRadius;
  }
}
