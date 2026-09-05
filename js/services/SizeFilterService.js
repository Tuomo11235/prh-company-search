/**
 * Filters companies by size (revenue and/or employee count), where "size"
 * data comes from whatever CompanySizeProvider is active (see
 * js/providers/CompanySizeProvider.js). Companies with unknown size are
 * excluded only if the user has actually set a size constraint - otherwise
 * unknown-size companies are kept, since PRH itself never had this data.
 *
 * @param {Array<import('../models/Company.js').Company>} companies
 * @param {{ minRevenue?: number|null, maxRevenue?: number|null, minEmployees?: number|null, maxEmployees?: number|null }} options
 */
export function applySizeFilters(companies, options) {
  const hasRevenueFilter = options.minRevenue != null || options.maxRevenue != null;
  const hasEmployeeFilter = options.minEmployees != null || options.maxEmployees != null;
  if (!hasRevenueFilter && !hasEmployeeFilter) return companies;

  return companies.filter((company) => {
    const { revenueEur, employees } = company.size ?? {};

    if (hasRevenueFilter) {
      if (revenueEur == null) return false;
      if (options.minRevenue != null && revenueEur < options.minRevenue) return false;
      if (options.maxRevenue != null && revenueEur > options.maxRevenue) return false;
    }

    if (hasEmployeeFilter) {
      if (employees == null) return false;
      if (options.minEmployees != null && employees < options.minEmployees) return false;
      if (options.maxEmployees != null && employees > options.maxEmployees) return false;
    }

    return true;
  });
}
