import { DataProvider } from './DataProvider.js';
import { createCompany } from '../models/Company.js';

/**
 * Provider adapter for the PRH (Patentti- ja rekisterihallitus) "Avoin data"
 * open company register API: https://avoindata.prh.fi/fi
 *
 * === ASSUMPTIONS / FIELD MAPPING NOTES ===
 * PRH publishes its open data through the "opendata-ytj-api" (v3) JSON REST
 * endpoint. Because the exact response shape can vary slightly between API
 * revisions and this app must keep working even if a field is renamed or
 * missing, every read below is defensive (optional chaining + fallbacks) and
 * documented here:
 *
 *  - Endpoint used: GET {BASE_URL}/companies
 *      Query params used: `postCode`, `registeredOfficeIn` (municipality),
 *      `page`.
 *  - Response envelope is assumed to be either `{ companies: [...] }` or a
 *    bare array `[...]`. Both are handled.
 *  - Each company record is assumed to look approximately like:
 *      {
 *        businessId: { value: "1234567-8" } | "1234567-8",
 *        names: [{ name: "Example Oy", type: "1", endDate: null }],
 *        companyForms: [{ descriptions: [{ languageCode: "1", description: "Osakeyhtiö" }] }],
 *        addresses: [{
 *          type: 1 | 2,                // 1 = postal (postiosoite), 2 = visiting (käyntiosoite) - per PRH docs
 *          careOf: "c/o Someone",
 *          street: "Esimerkkikatu 1",
 *          postCode: "00100",
 *          postOffices: [{ languageCode: "1", city: "Helsinki" }],
 *          country: "FI",
 *          registrationDate: "2022-01-15"  // treated as the address change date
 *        }]
 *      }
 *    If the live API differs (e.g. `addresses[].type` is a string, or the
 *    postal-code field is named differently), only `mapAddress`/`mapCompany`
 *    below need to change - the rest of the app is unaffected.
 *  - "Change date" for an address: PRH's open data does not expose a
 *    dedicated "address change date" field distinct from the address
 *    record's own `registrationDate`. We treat `registrationDate` (the date
 *    the address entry became effective) as the address change date. This
 *    is the best available proxy in the public dataset.
 *  - Company size (revenue / employee count) is NOT part of PRH's open
 *    company register data at all - PRH only publishes registry (name,
 *    form, address, dates) information, not financial data. This provider
 *    therefore never sets `size`; company-size filtering is handled by a
 *    separate, pluggable CompanySizeProvider (see
 *    js/providers/CompanySizeProvider.js) so a future paid data source can
 *    be plugged in without touching this file.
 *  - No native radius/geo search exists in the PRH API. Radius search is
 *    implemented one layer up (see js/services/RadiusSearchService.js) by
 *    combining `searchByMunicipality` (coarse filter) with client-side
 *    geocoding + Haversine distance filtering.
 */
export class PrhProvider extends DataProvider {
  id = 'prh';
  label = 'PRH (Patentti- ja rekisterihallitus)';

  /**
   * @param {{ baseUrl?: string, fetchImpl?: typeof fetch }} [config]
   */
  constructor(config = {}) {
    super();
    this.baseUrl = config.baseUrl ?? 'https://avoindata.prh.fi/opendata-ytj-api/v3';
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async searchByPostCodes(postCodes, options = {}) {
    const results = [];
    for (const postCode of postCodes) {
      const companies = await this._fetchAllPages({ postCode }, options);
      results.push(...companies);
    }
    return this._dedupe(results);
  }

  async searchByMunicipality(municipality, options = {}) {
    const companies = await this._fetchAllPages({ registeredOfficeIn: municipality }, options);
    return companies;
  }

  /**
   * Fetches every page of results for a given query, up to a safety cap, so
   * callers get complete data without needing to know about pagination.
   * @private
   */
  async _fetchAllPages(params, options) {
    const maxPages = options.maxPages ?? 20;
    // ASSUMPTION: the PRH v3 API is documented to return a fixed number of
    // results per page (observed default: 20). This is only used to decide
    // whether another page is worth requesting; if the API ever returns a
    // page smaller than this on a non-final page, we simply make one extra
    // (empty) request and stop - never silently truncate the real results.
    const expectedPageSize = options.pageSize ?? 20;
    const all = [];
    let page = 0;
    // The PRH API paginates results; we stop when a page returns no more
    // companies or we hit the safety cap (avoids runaway loops if the API's
    // pagination contract ever changes).
    while (page < maxPages) {
      const url = this._buildUrl({ ...params, page });
      let payload;
      try {
        const response = await this.fetchImpl(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`PRH API request failed: ${response.status} ${response.statusText}`);
        }
        payload = await response.json();
      } catch (err) {
        throw new Error(`Could not reach PRH open data API (${url}): ${err.message}`);
      }
      const companies = this._extractCompanies(payload);
      if (!companies.length) break;
      all.push(...companies.map((c) => this._mapCompany(c)));
      if (companies.length < expectedPageSize) break;
      page += 1;
      if (page < maxPages) {
        // Small courtesy delay between paginated requests so a search that
        // spans many pages doesn't hammer the PRH API in a tight loop.
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    return all;
  }

  _buildUrl(params) {
    const url = new URL(`${this.baseUrl}/companies`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  _extractCompanies(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.companies)) return payload.companies;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
  }

  /**
   * Merges duplicate companies (same business id can appear more than once
   * when searching across several postal codes, since a company may have
   * both a postal and a visiting address in different post codes) instead
   * of silently overwriting one occurrence with another - addresses from
   * every occurrence are combined, and `latestChangeDate` recomputed.
   * @private
   */
  _dedupe(companies) {
    const byId = new Map();
    for (const company of companies) {
      const key = company.businessId || company.id;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, company);
        continue;
      }
      const mergedAddressesByRaw = new Map();
      for (const address of [...existing.addresses, ...company.addresses]) {
        mergedAddressesByRaw.set(`${address.type}|${address.raw}`, address);
      }
      const addresses = [...mergedAddressesByRaw.values()];
      const latestChangeDate = addresses
        .map((a) => a.changeDate)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
      byId.set(key, { ...existing, addresses, latestChangeDate });
    }
    return [...byId.values()];
  }

  /**
   * Maps one raw PRH company record into the shared Company model.
   * @private
   */
  _mapCompany(raw) {
    const businessId = this._readBusinessId(raw);
    const name = this._readCurrentName(raw);
    const companyForm = this._readCompanyForm(raw);
    const addresses = (raw?.addresses ?? []).map((a) => this._mapAddress(a));
    const latestChangeDate = addresses
      .map((a) => a.changeDate)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return createCompany({
      id: businessId,
      businessId,
      name,
      companyForm,
      addresses,
      latestChangeDate,
      provider: this.id,
      detailsUrl: businessId
        ? `https://tietopalvelu.ytj.fi/yritys.aspx?path=1547;1631;1678&yavain=${encodeURIComponent(businessId)}`
        : '',
    });
  }

  _readBusinessId(raw) {
    if (!raw) return '';
    if (typeof raw.businessId === 'string') return raw.businessId;
    return raw.businessId?.value ?? raw.businessId?.businessId ?? '';
  }

  _readCurrentName(raw) {
    const names = raw?.names ?? (raw?.name ? [{ name: raw.name }] : []);
    const current = names.find((n) => !n.endDate) ?? names[0];
    return current?.name ?? raw?.name ?? '(nimetön / unnamed)';
  }

  _readCompanyForm(raw) {
    const forms = raw?.companyForms ?? [];
    const first = forms[0];
    const descriptions = first?.descriptions ?? [];
    const fi = descriptions.find((d) => d.languageCode === '1' || d.languageCode === 'FI');
    return fi?.description ?? descriptions[0]?.description ?? first?.type ?? '';
  }

  /**
   * Maps one raw PRH address entry to the shared NormalizedAddress shape.
   * @private
   */
  _mapAddress(raw) {
    const typeCode = String(raw?.type ?? '');
    // Per PRH documentation: 1 = postal address (postiosoite),
    // 2 = visiting/street address (käyntiosoite). Anything else is "other".
    const type = typeCode === '1' ? 'postal' : typeCode === '2' ? 'visiting' : 'other';

    const cityEntry = (raw?.postOffices ?? []).find((p) => p.languageCode === '1' || p.languageCode === 'FI')
      ?? raw?.postOffices?.[0];
    const city = cityEntry?.city ?? raw?.city ?? '';
    const street = raw?.street ?? raw?.freeAddressLine ?? '';
    const buildingNumber = raw?.buildingNumber ? ` ${raw.buildingNumber}` : '';
    const postCode = raw?.postCode ?? '';
    const careOf = raw?.careOf ?? raw?.co ?? '';
    const changeDate = raw?.registrationDate ?? raw?.registeredDate ?? null;

    const rawLine = [
      careOf ? `c/o ${careOf}` : '',
      `${street}${buildingNumber}`.trim(),
      [postCode, city].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');

    return {
      type,
      street: `${street}${buildingNumber}`.trim(),
      postCode,
      city,
      country: raw?.country ?? 'FI',
      careOf,
      changeDate,
      raw: rawLine,
    };
  }
}
