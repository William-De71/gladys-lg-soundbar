// -----------------------------------------------------------------------------
// Integration configuration: the `config_schema` values of the manifest,
// normalized so the rest of the code never deals with strings from a form or
// `undefined`.
// -----------------------------------------------------------------------------

import { parseHosts } from './temescal/discovery.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULTS = {
  hosts: '',
  network_search: true,
  quiet_start: false,
  language: 'en',
};

const bool = (value, fallback) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return fallback;
};

/**
 * @description Normalize the raw configuration.
 * @param {object} raw - `gladys.config` or the `onConfigUpdated` payload.
 * @returns {{ hosts: string[], networkSearch: boolean, quietStart: boolean, language: string }}
 * The configuration.
 */
export function normalizeConfig(raw = {}) {
  return {
    hosts: parseHosts(raw?.hosts ?? DEFAULTS.hosts),
    networkSearch: bool(raw?.network_search, DEFAULTS.network_search),
    quietStart: bool(raw?.quiet_start, DEFAULTS.quiet_start),
    language: LANGUAGES.includes(raw?.language) ? raw.language : DEFAULTS.language,
  };
}
