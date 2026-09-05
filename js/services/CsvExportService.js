import { formatElapsedYearsMonths, formatDate } from './DateUtils.js';

/**
 * Exports the given companies to a CSV file and triggers a browser download.
 * Uses RFC 4180-style quoting for any field that needs it.
 * @param {Array<import('../models/Company.js').Company>} companies
 * @param {string} [filename]
 */
export function exportCompaniesToCsv(companies, filename = 'yrityshaku.csv') {
  const headers = [
    'Y-tunnus',
    'Nimi',
    'Yritysmuoto',
    'Käyntiosoite',
    'Postiosoite',
    'Muutospäivä',
    'Aikaa muutoksesta (vv/kk)',
    'Liikevaihto (EUR)',
    'Henkilöstömäärä',
    'Etäisyys (km)',
  ];

  const rows = companies.map((c) => {
    const visiting = c.addresses.find((a) => a.type === 'visiting');
    const postal = c.addresses.find((a) => a.type === 'postal');
    return [
      c.businessId,
      c.name,
      c.companyForm,
      visiting?.raw ?? '',
      postal?.raw ?? '',
      formatDate(c.latestChangeDate),
      formatElapsedYearsMonths(c.latestChangeDate),
      c.size?.revenueEur ?? '',
      c.size?.employees ?? '',
      c.distanceKm != null ? c.distanceKm.toFixed(2) : '',
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  // Prepend a UTF-8 BOM so Excel opens Scandinavian characters correctly.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
