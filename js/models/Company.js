/**
 * Normalized company record used throughout the app, independent of the
 * upstream data provider. Every provider adapter (see js/providers) must map
 * its raw API response into this shape so the rest of the app (filtering,
 * sorting, CSV export, UI) never needs to know where the data came from.
 *
 * @typedef {Object} NormalizedAddress
 * @property {'visiting'|'postal'|'other'} type
 * @property {string} street        Free-form street + building number.
 * @property {string} postCode
 * @property {string} city          Post office / municipality name.
 * @property {string} country
 * @property {string} careOf        Raw "c/o" (huolenpito) name, if any.
 * @property {string} changeDate    ISO date (YYYY-MM-DD) the address was
 *                                  registered/changed, if known.
 * @property {string} raw           Full free-form address line, for display
 *                                  and for CSV export.
 *
 * @typedef {Object} CompanySize
 * @property {number|null} revenueEur   Annual revenue in EUR, if known.
 * @property {number|null} employees    Employee count, if known.
 * @property {string} source            Name of the provider that supplied
 *                                      the size data (for transparency).
 *
 * @typedef {Object} Company
 * @property {string} id                Stable unique id (e.g. business id).
 * @property {string} businessId        Official business identifier (Y-tunnus).
 * @property {string} name
 * @property {string} companyForm       Human readable company form
 *                                      (e.g. "Osakeyhtiö", "Asunto-osakeyhtiö").
 * @property {NormalizedAddress[]} addresses
 * @property {string|null} latestChangeDate  ISO date of the most recent
 *                                      address change across all addresses.
 * @property {CompanySize} size
 * @property {string} provider          Id of the provider that returned
 *                                      this record (e.g. "prh").
 * @property {string} detailsUrl        Link to a human-readable source page.
 */

/**
 * Creates a normalized Company object with sensible defaults so that
 * consumers never have to null-check every field.
 * @param {Partial<import('./Company').Company>} data
 * @returns {import('./Company').Company}
 */
export function createCompany(data) {
  return {
    id: data.id ?? data.businessId ?? crypto.randomUUID(),
    businessId: data.businessId ?? '',
    name: data.name ?? '',
    companyForm: data.companyForm ?? '',
    addresses: data.addresses ?? [],
    latestChangeDate: data.latestChangeDate ?? null,
    size: data.size ?? { revenueEur: null, employees: null, source: 'none' },
    provider: data.provider ?? 'unknown',
    detailsUrl: data.detailsUrl ?? '',
  };
}
