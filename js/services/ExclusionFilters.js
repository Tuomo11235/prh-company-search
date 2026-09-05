/**
 * Filters that exclude companies/addresses the user does not want to see:
 *   - c/o addresses (visiting/postal address registered "care of" someone
 *     else, e.g. a shared office / accountant's address)
 *   - housing companies (asunto-osakeyhtiöt), which are legally companies
 *     but are essentially never relevant for a "company address change"
 *     business search.
 */

const HOUSING_COMPANY_PATTERNS = [
  /asunto[-\s]?osakeyhti/i,
  /\bas\.?\s?oy\b/i,
  /bostadsaktiebolag/i,
  /\bbost\.?\s?ab\b/i,
];

/**
 * @param {import('../models/Company.js').Company} company
 * @returns {boolean} true if this looks like a housing company
 */
export function isHousingCompany(company) {
  const haystack = `${company.name} ${company.companyForm}`;
  return HOUSING_COMPANY_PATTERNS.some((re) => re.test(haystack));
}

/**
 * @param {import('../models/Company.js').Company} company
 * @returns {boolean} true if any of the company's addresses is a c/o address
 */
export function hasCareOfAddress(company) {
  return company.addresses.some((a) => a.careOf && a.careOf.trim().length > 0);
}

/**
 * Applies the exclusion filters selected by the user.
 * @param {import('../models/Company.js').Company[]} companies
 * @param {{ excludeCareOf?: boolean, excludeHousingCompanies?: boolean }} options
 */
export function applyExclusionFilters(companies, options) {
  return companies.filter((company) => {
    if (options.excludeCareOf && hasCareOfAddress(company)) return false;
    if (options.excludeHousingCompanies && isHousingCompany(company)) return false;
    return true;
  });
}
