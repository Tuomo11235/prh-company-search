import { PrhProvider } from './PrhProvider.js';
import { LocalSizeProvider } from './LocalSizeProvider.js';

/**
 * Central place that wires up which data providers are active. Adding a new
 * company-data provider later means: implement DataProvider, then register
 * it here (and add it to the provider <select> in index.html) - no other
 * file needs to change.
 */
export const dataProviders = {
  prh: new PrhProvider(),
};

export const defaultDataProviderId = 'prh';

/** Same idea for company-size enrichment providers. */
export const sizeProviders = {
  local: new LocalSizeProvider(),
};

export const defaultSizeProviderId = 'local';

export function getDataProvider(id) {
  const provider = dataProviders[id];
  if (!provider) throw new Error(`Unknown data provider: ${id}`);
  return provider;
}

export function getSizeProvider(id) {
  const provider = sizeProviders[id];
  if (!provider) throw new Error(`Unknown size provider: ${id}`);
  return provider;
}
