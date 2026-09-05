/**
 * Thin wrapper around the free OpenStreetMap Nominatim geocoding API, used
 * to turn a free-form address into coordinates (for radius search) and to
 * reverse-geocode coordinates into a municipality name (used as the coarse
 * pre-filter before PRH's postCode/municipality-based search, since PRH has
 * no native geo-radius search - see PrhProvider.js).
 *
 * NOTE / ASSUMPTION: Nominatim's public instance has a strict usage policy
 * (max ~1 request/second, no heavy bulk use, requires a descriptive
 * identifying header/param). This app is a lightweight interactive tool, so
 * it throttles requests and caches results in-memory. For production/heavy
 * use, replace the `baseUrl` with a self-hosted Nominatim instance or a
 * commercial geocoder that implements the same interface.
 */
export class GeocodingService {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl ?? 'https://nominatim.openstreetmap.org';
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.minIntervalMs = config.minIntervalMs ?? 1100;
    this._lastRequestAt = 0;
    this._cache = new Map();
  }

  async _throttle() {
    const wait = this.minIntervalMs - (Date.now() - this._lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this._lastRequestAt = Date.now();
  }

  /**
   * Geocodes a free-form address string to coordinates.
   * @param {string} address
   * @returns {Promise<{ lat: number, lon: number, municipality: string, displayName: string } | null>}
   */
  async geocode(address) {
    const cacheKey = `geocode:${address}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    await this._throttle();
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'fi');
    url.searchParams.set('limit', '1');

    let results;
    try {
      const response = await this.fetchImpl(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      results = await response.json();
    } catch (err) {
      throw new Error(`Geocoding failed for "${address}": ${err.message}`);
    }

    if (!results?.length) {
      this._cache.set(cacheKey, null);
      return null;
    }
    const best = results[0];
    const municipality = best.address?.city
      ?? best.address?.town
      ?? best.address?.municipality
      ?? best.address?.village
      ?? '';
    const result = {
      lat: Number.parseFloat(best.lat),
      lon: Number.parseFloat(best.lon),
      municipality,
      displayName: best.display_name ?? address,
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * Geocodes a company's visiting (or first available) address. Returns
   * null if the address can't be resolved (kept non-fatal so one bad
   * address doesn't abort a whole search).
   * @param {import('../models/Company.js').Company} company
   */
  async geocodeCompanyAddress(company) {
    const address = company.addresses.find((a) => a.type === 'visiting') ?? company.addresses[0];
    if (!address || !address.raw) return null;
    try {
      return await this.geocode(address.raw);
    } catch {
      return null;
    }
  }
}

/**
 * Great-circle distance between two lat/lon points, in kilometers.
 */
export function haversineDistanceKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}
