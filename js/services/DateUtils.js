/**
 * Formats the elapsed time between an ISO date and "now" as "years/months"
 * (Finnish: vv/kk), e.g. "2v 3kk" for a change 2 years and 3 months ago.
 * @param {string|null} isoDate
 * @param {Date} [now]
 * @returns {string} formatted elapsed time, or "-" if isoDate is missing
 */
export function formatElapsedYearsMonths(isoDate, now = new Date()) {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';

  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0 || (years === 0 && months < 0)) {
    return '0kk';
  }
  const parts = [];
  if (years > 0) parts.push(`${years}v`);
  parts.push(`${months}kk`);
  return parts.join(' ');
}

/**
 * @param {string|null} isoDate
 * @returns {string} localized (fi-FI) date string, or "-" if missing
 */
export function formatDate(isoDate) {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('fi-FI');
}
