import { dataProviders, defaultDataProviderId, sizeProviders, defaultSizeProviderId, getSizeProvider } from './providers/ProviderRegistry.js';
import { SearchController } from './services/SearchController.js';
import { SavedSearchService } from './services/SavedSearchService.js';
import { sortCompanies } from './services/SortService.js';
import { formatElapsedYearsMonths, formatDate } from './services/DateUtils.js';
import { exportCompaniesToCsv } from './services/CsvExportService.js';
import { MIN_RADIUS_KM, MAX_RADIUS_KM } from './constants.js';

const searchController = new SearchController();
const savedSearchService = new SavedSearchService();

let currentResults = [];
let currentSort = { field: 'changeDate', direction: 'desc' };

const els = {
  form: document.getElementById('search-form'),
  dataProviderSelect: document.getElementById('data-provider'),
  sizeProviderSelect: document.getElementById('size-provider'),
  modeRadios: () => document.querySelectorAll('input[name="mode"]'),
  radiusFields: document.getElementById('radius-fields'),
  postCodeFields: document.getElementById('postcode-fields'),
  radius: document.getElementById('radius'),
  radiusValue: document.getElementById('radius-value'),
  statusMessage: document.getElementById('status-message'),
  saveSearchButton: document.getElementById('save-search-button'),
  savedSearchesList: document.getElementById('saved-searches-list'),
  resultCount: document.getElementById('result-count'),
  resultsBody: document.getElementById('results-body'),
  exportButton: document.getElementById('export-csv-button'),
  sizeImportInput: document.getElementById('size-import-input'),
  resultsTable: document.getElementById('results-table'),
};

function populateProviderSelects() {
  for (const [id, provider] of Object.entries(dataProviders)) {
    const opt = new Option(provider.label, id, id === defaultDataProviderId, id === defaultDataProviderId);
    els.dataProviderSelect.add(opt);
  }
  for (const [id, provider] of Object.entries(sizeProviders)) {
    const opt = new Option(provider.label, id, id === defaultSizeProviderId, id === defaultSizeProviderId);
    els.sizeProviderSelect.add(opt);
  }
}

function setMode(mode) {
  els.radiusFields.hidden = mode !== 'radius';
  els.postCodeFields.hidden = mode !== 'postCode';
}

function setStatus(message, isError = false) {
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle('error', isError);
}

function readCriteria() {
  const formData = new FormData(els.form);
  const toNullableNumber = (name) => {
    const value = formData.get(name);
    return value === '' || value === null ? null : Number(value);
  };
  return {
    dataProviderId: formData.get('dataProviderId'),
    sizeProviderId: formData.get('sizeProviderId'),
    mode: formData.get('mode'),
    address: formData.get('address')?.trim() ?? '',
    radiusKm: Number(formData.get('radiusKm')) || 0,
    postCodes: formData.get('postCodes')?.trim() ?? '',
    excludeCareOf: formData.get('excludeCareOf') === 'on',
    excludeHousingCompanies: formData.get('excludeHousingCompanies') === 'on',
    minRevenue: toNullableNumber('minRevenue'),
    maxRevenue: toNullableNumber('maxRevenue'),
    minEmployees: toNullableNumber('minEmployees'),
    maxEmployees: toNullableNumber('maxEmployees'),
  };
}

function applyCriteriaToForm(criteria) {
  els.dataProviderSelect.value = criteria.dataProviderId ?? defaultDataProviderId;
  els.sizeProviderSelect.value = criteria.sizeProviderId ?? defaultSizeProviderId;
  for (const radio of els.modeRadios()) {
    radio.checked = radio.value === criteria.mode;
  }
  setMode(criteria.mode);
  els.form.address.value = criteria.address ?? '';
  els.radius.value = criteria.radiusKm ?? 5;
  els.radiusValue.textContent = els.radius.value;
  els.form.postCodes.value = criteria.postCodes ?? '';
  els.form.excludeCareOf.checked = criteria.excludeCareOf !== false;
  els.form.excludeHousingCompanies.checked = criteria.excludeHousingCompanies !== false;
  els.form.minRevenue.value = criteria.minRevenue ?? '';
  els.form.maxRevenue.value = criteria.maxRevenue ?? '';
  els.form.minEmployees.value = criteria.minEmployees ?? '';
  els.form.maxEmployees.value = criteria.maxEmployees ?? '';
}

function renderResults() {
  const sorted = sortCompanies(currentResults, currentSort.field, currentSort.direction);
  els.resultCount.textContent = String(sorted.length);
  els.resultsBody.innerHTML = '';

  if (!sorted.length) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    row.innerHTML = '<td colspan="9">Ei tuloksia. Kokeile eri hakuehtoja.</td>';
    els.resultsBody.appendChild(row);
    return;
  }

  const sizeProvider = getSizeProvider(els.sizeProviderSelect.value);

  for (const company of sorted) {
    const visiting = company.addresses.find((a) => a.type === 'visiting');
    const postal = company.addresses.find((a) => a.type === 'postal');
    const row = document.createElement('tr');

    const revenueId = `rev-${company.businessId}`;
    const employeesId = `emp-${company.businessId}`;

    row.innerHTML = `
      <td>${escapeHtml(company.name)}</td>
      <td>${escapeHtml(company.businessId)}</td>
      <td>${escapeHtml(company.companyForm)}</td>
      <td>${escapeHtml(visiting?.raw ?? '-')}</td>
      <td>${escapeHtml(postal?.raw ?? '-')}</td>
      <td>${formatDate(company.latestChangeDate)}</td>
      <td>${formatElapsedYearsMonths(company.latestChangeDate)}</td>
      <td>
        <div class="size-inputs">
          <input type="number" min="0" placeholder="Liikevaihto" id="${revenueId}" value="${company.size?.revenueEur ?? ''}" />
          <input type="number" min="0" placeholder="Henkilöstö" id="${employeesId}" value="${company.size?.employees ?? ''}" />
        </div>
      </td>
      <td>${company.distanceKm != null ? company.distanceKm.toFixed(2) : '-'}</td>
    `;
    els.resultsBody.appendChild(row);

    row.querySelector(`#${revenueId}`).addEventListener('change', (e) => {
      const value = parseNullableNumberInput(e.target, company.size?.revenueEur ?? null);
      if (value === undefined) return;
      if (typeof sizeProvider.setSize !== 'function') {
        setStatus('Valittu kokotietolähde ei tue muokkausta - arvoa ei tallennettu.', true);
        e.target.value = company.size?.revenueEur ?? '';
        return;
      }
      sizeProvider.setSize(company.businessId, { revenueEur: value });
      company.size = { ...company.size, revenueEur: value, source: sizeProvider.id };
    });
    row.querySelector(`#${employeesId}`).addEventListener('change', (e) => {
      const value = parseNullableNumberInput(e.target, company.size?.employees ?? null);
      if (value === undefined) return;
      if (typeof sizeProvider.setSize !== 'function') {
        setStatus('Valittu kokotietolähde ei tue muokkausta - arvoa ei tallennettu.', true);
        e.target.value = company.size?.employees ?? '';
        return;
      }
      sizeProvider.setSize(company.businessId, { employees: value });
      company.size = { ...company.size, employees: value, source: sizeProvider.id };
    });
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

/**
 * Parses a number input's value, returning:
 *   - null if the field was cleared (explicit "unset")
 *   - a finite number if valid
 *   - undefined if the input is invalid (not a parseable number). In that
 *     case the field is reset back to `previousValue` and a visible error
 *     is shown, so the caller can simply ignore the change.
 */
function parseNullableNumberInput(inputEl, previousValue = null) {
  const raw = inputEl.value.trim();
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    setStatus(`Virheellinen luku: "${raw}". Arvoa ei tallennettu.`, true);
    inputEl.value = previousValue ?? '';
    return undefined;
  }
  return value;
}

function renderSavedSearches() {
  const items = savedSearchService.list();
  els.savedSearchesList.innerHTML = '';
  if (!items.length) {
    els.savedSearchesList.innerHTML = '<li class="saved-meta">Ei tallennettuja hakuja.</li>';
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="saved-name">${escapeHtml(item.name)}</span>
      <span class="saved-meta">${new Date(item.savedAt).toLocaleString('fi-FI')} · ${item.resultsSnapshot?.length ?? 0} tulosta</span>
      <div class="saved-actions">
        <button type="button" class="run-btn">Aja uudelleen</button>
        <button type="button" class="load-btn">Näytä tallennettu tulos</button>
        <button type="button" class="delete-btn">Poista</button>
      </div>
    `;
    li.querySelector('.run-btn').addEventListener('click', () => {
      applyCriteriaToForm(item.criteria);
      els.form.requestSubmit();
    });
    li.querySelector('.load-btn').addEventListener('click', () => {
      currentResults = item.resultsSnapshot ?? [];
      renderResults();
      setStatus(`Näytetään tallennettu tulos "${item.name}".`);
    });
    li.querySelector('.delete-btn').addEventListener('click', () => {
      savedSearchService.remove(item.id);
      renderSavedSearches();
    });
    els.savedSearchesList.appendChild(li);
  }
}

async function handleSearchSubmit(event) {
  event.preventDefault();
  const criteria = readCriteria();
  els.form.querySelector('#search-button').disabled = true;
  setStatus('Haetaan...');
  try {
    currentResults = await searchController.runSearch(criteria, (msg) => setStatus(msg));
    renderResults();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    els.form.querySelector('#search-button').disabled = false;
  }
}

function handleSaveSearch() {
  const name = window.prompt('Anna haulle nimi:', new Date().toLocaleString('fi-FI'));
  if (!name) return;
  const criteria = readCriteria();
  savedSearchService.save(name, criteria, currentResults);
  renderSavedSearches();
  setStatus(`Haku tallennettu nimellä "${name}".`);
}

function handleSort(event) {
  const th = event.target.closest('th[data-sort]');
  if (!th) return;
  const field = th.dataset.sort;
  if (currentSort.field === field) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort = { field, direction: 'asc' };
  }
  renderResults();
}

function handleExport() {
  if (!currentResults.length) {
    setStatus('Ei tuloksia vietäväksi.', true);
    return;
  }
  exportCompaniesToCsv(currentResults);
}

const BUSINESS_ID_PATTERN = /^\d{6,8}-\d$/;

function parseCsvText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(','))
    .filter((cols) => cols.length >= 2)
    .map(([businessId, revenueEur, employees]) => ({
      businessId: businessId.trim(),
      revenueEur: revenueEur ? Number(revenueEur) : undefined,
      employees: employees ? Number(employees) : undefined,
    }))
    // Skip a header row (e.g. "y-tunnus,liikevaihto,henkilostomaara") or any
    // other row whose first column isn't a valid Finnish business id
    // (NNNNNNN-N), instead of importing it as bogus data.
    .filter((row) => BUSINESS_ID_PATTERN.test(row.businessId));
}

async function handleSizeImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsvText(text);
  const provider = getSizeProvider(els.sizeProviderSelect.value);
  if (typeof provider.importRows !== 'function') {
    setStatus('Valittu kokotietolähde ei tue tuontia.', true);
    return;
  }
  provider.importRows(rows);
  setStatus(`Tuotu ${rows.length} kokotietoriviä. Hae uudelleen nähdäksesi ne.`);
  event.target.value = '';
}

function init() {
  populateProviderSelects();
  els.radius.min = String(MIN_RADIUS_KM);
  els.radius.max = String(MAX_RADIUS_KM);
  setMode('radius');
  renderSavedSearches();
  renderResults();

  for (const radio of els.modeRadios()) {
    radio.addEventListener('change', (e) => setMode(e.target.value));
  }
  els.radius.addEventListener('input', () => {
    els.radiusValue.textContent = els.radius.value;
  });
  els.form.addEventListener('submit', handleSearchSubmit);
  els.saveSearchButton.addEventListener('click', handleSaveSearch);
  els.resultsTable.querySelector('thead').addEventListener('click', handleSort);
  els.exportButton.addEventListener('click', handleExport);
  els.sizeImportInput.addEventListener('change', handleSizeImport);
}

init();
