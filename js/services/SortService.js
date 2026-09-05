/**
 * Sorting helpers for the results table. "Size" sorting uses employees as
 * the primary metric and revenue as a tiebreaker (both nullable, unknowns
 * sort last) since a company could have one but not the other set.
 */

function compareNullableNumber(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

const comparators = {
  name: (a, b) => a.name.localeCompare(b.name, 'fi'),
  size: (a, b) => {
    const byEmployees = compareNullableNumber(a.size?.employees, b.size?.employees);
    if (byEmployees !== 0) return byEmployees;
    return compareNullableNumber(a.size?.revenueEur, b.size?.revenueEur);
  },
  changeDate: (a, b) => {
    if (!a.latestChangeDate && !b.latestChangeDate) return 0;
    if (!a.latestChangeDate) return 1;
    if (!b.latestChangeDate) return -1;
    return a.latestChangeDate.localeCompare(b.latestChangeDate);
  },
};

/**
 * @param {Array<import('../models/Company.js').Company>} companies
 * @param {'name'|'size'|'changeDate'} field
 * @param {'asc'|'desc'} direction
 */
export function sortCompanies(companies, field, direction = 'asc') {
  const comparator = comparators[field] ?? comparators.name;
  const sorted = [...companies].sort(comparator);
  return direction === 'desc' ? sorted.reverse() : sorted;
}
