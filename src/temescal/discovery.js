// -----------------------------------------------------------------------------
// Finding the soundbars on the local network.
//
// The integration container sits behind the Docker bridge, where multicast
// never reaches the LAN: the search goes through the mediated mDNS scan of
// Gladys (the core, on the host network, browses the services declared in
// the manifest and relays the raw answers). Two services:
//
//   _lg-smart-device._tcp   announced by the LG Wi-Fi speakers and soundbars
//                           (the netdisco "lg_smart_device" discoverable the
//                           old Home Assistant discovery used for them);
//   _googlecast._tcp        recent soundbars have Chromecast built in
//                           (lgsb2mqtt finds them that way), but so has every
//                           Google speaker or TV.
//
// Every address found is then tried on TCP port 9741, by unicast from the
// container (that crosses the bridge): only a soundbar answers there. The
// Home Assistant integration itself has no discovery: the addresses typed in
// the configuration are tried the same way (another subnet, a network that
// filters multicast).
// -----------------------------------------------------------------------------

import { parseMdnsTxt } from '@gladysassistant/integration-sdk';

export const MDNS_SERVICES = ['_lg-smart-device._tcp', '_googlecast._tcp'];
export const SCAN_SECONDS = 5;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * @description Whether a text is an IPv4 address.
 * @param {*} value - The text.
 * @returns {boolean} True for 192.168.1.20.
 */
export function isIpv4(value) {
  return (
    typeof value === 'string' &&
    IPV4.test(value) &&
    value.split('.').every((octet) => Number(octet) <= 255)
  );
}

/**
 * @description The candidates of an mDNS scan.
 * @param {Array} results - `scanNetwork('mdns')` results:
 * `[{ name, host, addresses, port, txt }]`.
 * @returns {Map<string, { name: string, model: string }>} IPv4 address ->
 * the labels of the answer (Chromecast `fn` / `md` TXT entries when present).
 */
export function mdnsCandidates(results) {
  const candidates = new Map();
  for (const result of Array.isArray(results) ? results : []) {
    const address = (Array.isArray(result?.addresses) ? result.addresses : []).find(isIpv4);
    if (!address) {
      continue;
    }
    let txt;
    try {
      txt = parseMdnsTxt(Array.isArray(result.txt) ? result.txt : []);
    } catch {
      txt = {};
    }
    const previous = candidates.get(address);
    candidates.set(address, {
      name: previous?.name || (typeof txt.fn === 'string' ? txt.fn.slice(0, 60) : ''),
      model: previous?.model || (typeof txt.md === 'string' ? txt.md.slice(0, 40) : ''),
    });
  }
  return candidates;
}

/**
 * @description Run the mediated mDNS scan.
 * @param {object} gladys - SDK client.
 * @param {object} [options] - `{ logger, timeoutSeconds }`.
 * @returns {Promise<{ candidates: Map, error: string|null }>} The addresses
 * found and why the scan failed, if it did.
 */
export async function mdnsScan(gladys, { logger, timeoutSeconds = SCAN_SECONDS } = {}) {
  try {
    const results = await gladys.scanNetwork('mdns', { timeoutSeconds });
    return { candidates: mdnsCandidates(results), error: null };
  } catch (error) {
    if (error?.status === 403) {
      logger?.warn(
        'LG Soundbar: Gladys refused the network scan (reinstall the integration to accept its network discovery)',
      );
      return { candidates: new Map(), error: 'forbidden' };
    }
    if (error?.status === 429 || error?.status === 409) {
      return { candidates: new Map(), error: 'busy' };
    }
    logger?.warn(`LG Soundbar: network scan failed: ${error?.message ?? error}`);
    return { candidates: new Map(), error: 'failed' };
  }
}

/**
 * @description Parse the addresses typed in the configuration.
 * @param {string} value - `192.168.1.20, 192.168.1.21`.
 * @returns {string[]} The valid IPv4 addresses, deduplicated.
 */
export function parseHosts(value) {
  return [
    ...new Set(
      String(value ?? '')
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter(isIpv4),
    ),
  ];
}
