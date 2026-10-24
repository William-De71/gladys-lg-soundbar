// -----------------------------------------------------------------------------
// The LG Soundbar integration: every Gladys handler.
//
//   start            the soundbars already known (/data, devices created in
//                    Gladys, typed addresses) are connected; the Discover tab
//                    gets their devices without a scan
//   scan             mDNS through Gladys + typed addresses, each new address
//                    tried on port 9741, then a full reading
//   states           pushed by the soundbars on their open connection,
//                    published as they come (src/states.js)
//   commands         onSetValue, scene actions and widget buttons -> `set`,
//                    then the state read back
//   scene events     changes made outside Gladys only (src/scenes.js)
//   widget           src/widgets.js, with the album art served by the
//                    soundbar (fetched from its own address only, checked)
//   status           the soundbars unreachable for 2 minutes
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { createStatePublisher } from './states.js';
import { createStorage } from './storage.js';
import { Soundbar } from './soundbar.js';
import { DEVICE_TYPE, FEATURES, buildDevice, deviceName, featureValues } from './devices.js';
import { CommandError, commandFor, presetCommands, steppedVolume } from './commands.js';
import { ACTIONS, TRIGGERS, sourceEvent, soundModeEvent, trackEvent } from './scenes.js';
import { BUTTONS, WIDGET_KEY, buildSoundbarWidget, powerOf } from './widgets.js';
import { LANGUAGES, all, t } from './i18n.js';
import { mdnsScan } from './temescal/discovery.js';
import { MSG } from './temescal/protocol.js';
import { optionLabel, shownFunction } from './temescal/names.js';
import { platformIdOf } from './temescal/model.js';

export const STORAGE_FILE = 'soundbars.json';
export const CONFIG_ACTIONS = { SEARCH: 'search' };
const PROBE_MS = 4000;
const COMMAND_CONNECT_MS = 5000;
const PROBE_CONCURRENCY = 4;
const REDISCOVER_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 300 * 1024;
const IMAGE_TIMEOUT_MS = 4000;
const WIDGET_REFRESH_MS = 10 * 1000;

// Fields whose change alters the device structure (features, ranges,
// options): the Discover tab is published again.
const STRUCTURE = new Set([
  'name',
  'model',
  'volumeMin',
  'volumeMax',
  'funcList',
  'eqList',
  'nightField',
  'power',
  'audioSource',
  'mute',
  'level_woofer',
  'level_rear',
  'level_center',
  'level_top',
  'switch_auto_volume',
  'switch_drc',
  'switch_auto_power',
  'play',
]);

/**
 * @description Fetch an album art from the soundbar.
 * @param {string} url - The http URL the soundbar gave.
 * @returns {Promise<Buffer>} The bytes.
 */
async function defaultFetchImage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_IMAGE_BYTES) {
    throw new Error('too big');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('too big');
  }
  return bytes;
}

/**
 * @description Create the integration.
 * @param {object} gladys - SDK client.
 * @param {object} [deps] - Dependencies (tests).
 * @returns {object} `{ start, stop, scan, soundbars }`.
 */
export function createApp(gladys, deps = {}) {
  const logger = deps.logger ?? { info() {}, warn() {}, error() {}, debug() {} };
  const storage = deps.storage ?? createStorage();
  const now = deps.now ?? Date.now;
  const fetchImage = deps.fetchImage ?? defaultFetchImage;
  const port = deps.port;
  const probeMs = deps.probeMs ?? PROBE_MS;
  const commandConnectMs = deps.commandConnectMs ?? COMMAND_CONNECT_MS;
  let config = normalizeConfig(gladys.config ?? {});

  const bars = new Map(); // platform id -> Soundbar
  const created = new Set(); // device external ids created in Gladys
  const previous = new Map(); // platform id -> { func, eq, play } (scene events)
  const images = new Map(); // image key -> base64
  const imageOf = new Map(); // platform id -> { url, key }
  let scanError = null;
  let lastRediscover = 0;
  let stopped = false;
  let saveTimer = null;
  let discoveredTimer = null;
  let widgetTimer = null;
  let lastWidgetRefresh = 0;
  let lastStatus = null;

  const isCreated = (deviceId) => created.has(deviceId);
  const states = createStatePublisher(gladys, { logger, now, isCreated });
  const idsOf = (bar) => gladys.externalIds(DEVICE_TYPE, bar.id);

  const safely = async (fn, what) => {
    try {
      return await fn();
    } catch (error) {
      logger.warn(`LG Soundbar: ${what} failed: ${error?.message ?? error}`);
      return undefined;
    }
  };

  // --- Persistence and publication ---------------------------------------------------------------

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      safely(
        () =>
          storage.write(
            STORAGE_FILE,
            Object.fromEntries([...bars.values()].map((bar) => [bar.id, bar.toStorage()])),
          ),
        'saving /data',
      );
    }, 1000);
    saveTimer.unref?.();
  };

  const publishDiscovered = async () => {
    const devices = [...bars.values()]
      .filter((bar) => bar.state.seen.includes(MSG.SPEAKER) || bar.state.name)
      .map((bar) => buildDevice(gladys, bar, config.language));
    await safely(
      () => gladys.publishDiscoveredDevices(devices),
      'publishing the discovered devices',
    );
  };

  const publishDiscoveredSoon = () => {
    clearTimeout(discoveredTimer);
    discoveredTimer = setTimeout(() => {
      discoveredTimer = null;
      publishDiscovered();
    }, 2000);
    discoveredTimer.unref?.();
  };

  const pushValues = (bar) => {
    const ids = idsOf(bar);
    for (const [key, value] of featureValues(bar)) {
      states.push(ids.feature(key), value);
    }
  };

  const refreshWidget = (force = false) => {
    const wait = lastWidgetRefresh + WIDGET_REFRESH_MS - now();
    if (force || wait <= 0) {
      lastWidgetRefresh = now();
      clearTimeout(widgetTimer);
      widgetTimer = null;
      safely(() => gladys.requestWidgetRefresh(WIDGET_KEY), 'refreshing the widget');
      return;
    }
    if (!widgetTimer) {
      widgetTimer = setTimeout(() => {
        widgetTimer = null;
        refreshWidget(true);
      }, wait);
      widgetTimer.unref?.();
    }
  };

  const publishStatus = () => {
    const offline = [...bars.values()].filter(
      (bar) => created.has(idsOf(bar).device) && bar.online === false,
    );
    const key = offline.map((bar) => bar.id).join(',');
    if (key === lastStatus) {
      return;
    }
    lastStatus = key;
    if (offline.length === 0) {
      safely(() => gladys.setConnectionStatus(true), 'status');
      return;
    }
    const names = offline.map((bar) => deviceName(bar)).join(', ');
    const message = all('statusOffline', {
      names: names.length > 80 ? `${names.slice(0, 79)}…` : names,
    });
    safely(() => gladys.setConnectionStatus(false, message), 'status');
  };

  const fire = (bar, key, data) => {
    if (!data || !created.has(idsOf(bar).device)) {
      return;
    }
    safely(() => gladys.publishSceneEvent(key, data), `scene event ${key}`);
  };

  // --- Soundbars -----------------------------------------------------------------------------------

  const snapshotOf = (bar) => ({
    func: bar.state.func,
    eq: bar.state.eq,
    play: { ...bar.state.play },
  });

  const onChanged = (bar, changed, { own }) => {
    if (!bar.id) {
      return;
    }
    const device = idsOf(bar).device;
    const before = previous.get(bar.id);
    if (!own && before) {
      if (changed.has('func')) {
        fire(
          bar,
          TRIGGERS.SOURCE_CHANGED,
          sourceEvent(device, before.func, bar.state, config.language),
        );
      }
      if (changed.has('eq')) {
        fire(
          bar,
          TRIGGERS.SOUND_MODE_CHANGED,
          soundModeEvent(device, before.eq, bar.state, config.language),
        );
      }
      if (changed.has('play')) {
        fire(bar, TRIGGERS.TRACK_CHANGED, trackEvent(device, before.play, bar.state.play));
      }
      // Someone uses a soundbar whose power is not reported: it is on.
      if (
        typeof bar.state.power !== 'boolean' &&
        ['volume', 'func', 'eq', 'mute', 'play'].some((field) => changed.has(field))
      ) {
        bar.assumedPower = true;
      }
    }
    if (before || bar.state.seen.includes(MSG.SPEAKER)) {
      previous.set(bar.id, snapshotOf(bar));
    }
    pushValues(bar);
    if (
      [...changed].some((field) => STRUCTURE.has(field) && field !== 'play' && field !== 'mute')
    ) {
      publishDiscoveredSoon();
    } else if (changed.has('play') || changed.has('mute') || changed.has('power')) {
      // Features that appear with their first value (playback, mute, power status).
      publishDiscoveredSoon();
    }
    save();
    refreshWidget();
  };

  const wire = (bar) => {
    bar.on('changed', (changed, info) => onChanged(bar, changed, info));
    bar.on('online', ({ wasOffline }) => {
      if (typeof bar.state.power !== 'boolean' && bar.assumedPower === null) {
        bar.assumedPower = true;
      }
      if (wasOffline) {
        logger.info(`LG Soundbar: ${deviceName(bar)} (${bar.host}) answers again`);
        fire(bar, TRIGGERS.ONLINE, { soundbar: idsOf(bar).device });
      }
      pushValues(bar);
      publishStatus();
      refreshWidget();
    });
    bar.on('offline', () => {
      logger.warn(`LG Soundbar: ${deviceName(bar)} (${bar.host}) unreachable`);
      if (typeof bar.state.power !== 'boolean') {
        bar.assumedPower = false;
      }
      fire(bar, TRIGGERS.OFFLINE, { soundbar: idsOf(bar).device });
      pushValues(bar);
      publishStatus();
      refreshWidget();
      rediscover();
    });
    bar.on('read', () => {
      save();
      publishDiscoveredSoon();
    });
  };

  const newSoundbar = (init) =>
    new Soundbar(
      { ...init, port },
      {
        logger,
        now,
        quietStart: () => config.quietStart,
        connectionOptions: deps.connectionOptions,
        offlineMs: deps.offlineMs,
      },
    );

  const adopt = (bar) => {
    bars.set(bar.id, bar);
    wire(bar);
    // Found by a probe: it answered before its 'online' handler existed.
    if (bar.online === true && typeof bar.state.power !== 'boolean' && bar.assumedPower === null) {
      bar.assumedPower = true;
    }
    if (bar.state.seen.includes(MSG.SPEAKER)) {
      previous.set(bar.id, snapshotOf(bar));
    }
  };

  /**
   * @description Try an address: a soundbar answers on port 9741.
   * @param {string} host - IPv4 address.
   * @returns {Promise<Soundbar|null>} The soundbar, null when nothing answers.
   */
  const tryHost = async (host) => {
    const known = [...bars.values()].find((bar) => bar.host === host);
    if (known) {
      if (known.connected && !known.state.seen.includes(MSG.SPEAKER)) {
        await known.read().catch(() => {});
      }
      return known;
    }
    const bar = newSoundbar({ host });
    bar.needsRead = false; // read below, once
    bar.start();
    if (!(await bar.waitOpen(probeMs))) {
      bar.stop();
      return null;
    }
    const { answered } = await bar.read();
    if (!answered.includes(MSG.SPEAKER)) {
      bar.stop();
      return null;
    }
    const id = platformIdOf(bar.state, host);
    const existing = bars.get(id);
    if (existing) {
      // The same soundbar at a new address (DHCP).
      bar.stop();
      existing.moveTo(host);
      save();
      return existing;
    }
    bar.id = id;
    adopt(bar);
    logger.info(
      `LG Soundbar: found ${deviceName(bar)} (${bar.state.model || 'model unknown'}) at ${host}`,
    );
    previous.set(bar.id, snapshotOf(bar));
    pushValues(bar);
    save();
    return bar;
  };

  const tryHosts = async (hosts) => {
    const queue = [...new Set(hosts)];
    const found = [];
    const worker = async () => {
      while (queue.length > 0 && !stopped) {
        const host = queue.shift();
        const bar = await safely(() => tryHost(host), `trying ${host}`);
        if (bar) found.push(bar);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, worker));
    return found;
  };

  /**
   * @description Search the network and the typed addresses.
   * @returns {Promise<Soundbar[]>} The soundbars found or known.
   */
  const scan = async () => {
    const hosts = [...config.hosts];
    scanError = null;
    if (config.networkSearch) {
      const { candidates, error } = await mdnsScan(gladys, {
        logger,
        timeoutSeconds: deps.scanSeconds,
      });
      scanError = error;
      hosts.push(...candidates.keys());
    }
    const found = await tryHosts(hosts);
    await publishDiscovered();
    return [...new Set([...found, ...bars.values()])];
  };

  // An unreachable soundbar may have a new address: search again, now and then.
  const rediscover = () => {
    if (!config.networkSearch || now() - lastRediscover < REDISCOVER_MS || stopped) {
      return;
    }
    lastRediscover = now();
    safely(() => scan(), 'searching a soundbar that moved');
  };

  // --- Commands ------------------------------------------------------------------------------------

  const userError = (key, values = {}) => new Error(t(key, config.language, values));

  const barOfDevice = (deviceExternalId) => {
    const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
    const id = String(deviceExternalId ?? '').startsWith(prefix)
      ? String(deviceExternalId).slice(prefix.length).split(':')[0]
      : null;
    const bar = id ? bars.get(id) : null;
    if (!bar) {
      throw userError('errorUnknownSoundbar');
    }
    return bar;
  };

  const firstBar = () => {
    const createdBars = [...bars.values()].filter((bar) => created.has(idsOf(bar).device));
    return createdBars[0] ?? [...bars.values()][0] ?? null;
  };

  const ensureOpen = async (bar) => {
    if (!(await bar.waitOpen(commandConnectMs))) {
      throw userError('errorUnreachable', { name: deviceName(bar), host: bar.host });
    }
  };

  const explain = (error, bar) => {
    if (error instanceof CommandError) {
      return userError(error.key, error.values);
    }
    if (error?.name === 'RefusedError') {
      return userError('errorRefused', { name: deviceName(bar) });
    }
    if (error?.name === 'NotConnectedError' || error?.name === 'TimeoutError') {
      return userError('errorUnreachable', { name: deviceName(bar), host: bar.host });
    }
    return error;
  };

  /**
   * @description Send a feature command and make sure the state follows.
   * @param {Soundbar} bar - The soundbar.
   * @param {string} key - The feature key.
   * @param {*} value - The value.
   */
  const command = async (bar, key, value) => {
    const { msg, data } = commandFor(bar.state, key, value);
    await ensureOpen(bar);
    await bar.set(msg, data);
    if (key === FEATURES.POWER) {
      const wanted = data.b_powerkey;
      if (typeof bar.state.power === 'boolean') {
        if (bar.state.power !== wanted) {
          // Some answer before switching: read once more.
          await bar.connection.get(MSG.SPEAKER).catch(() => {});
        }
        if (bar.state.power !== wanted) {
          throw new CommandError(wanted ? 'errorPowerOnIgnored' : 'errorPowerOffIgnored');
        }
      } else {
        bar.assumedPower = wanted;
      }
    } else if (typeof bar.state.power !== 'boolean') {
      // Any command wakes the soundbar up.
      bar.assumedPower = true;
    }
  };

  gladys.onSetValue(async (device, feature, value) => {
    const bar = barOfDevice(device?.external_id);
    const key = String(feature?.external_id ?? '')
      .split(':')
      .pop();
    try {
      await command(bar, key, value);
    } catch (error) {
      throw explain(error, bar);
    } finally {
      // Gladys shows the value asked for: publish the real one.
      states.forget(feature?.external_id);
      if (key === FEATURES.POWER) states.forget(idsOf(bar).feature(FEATURES.POWER));
      pushValues(bar);
      refreshWidget();
    }
  });

  // --- Device events -----------------------------------------------------------------------------

  const track = (device) => {
    const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
    const externalId = String(device?.external_id ?? '');
    if (!externalId.startsWith(prefix) || externalId.slice(prefix.length).includes(':')) {
      return null;
    }
    created.add(externalId);
    const id = externalId.slice(prefix.length);
    if (bars.has(id)) {
      return bars.get(id);
    }
    const host = device.params?.find?.((param) => param.name === 'LG_SOUNDBAR_HOST')?.value;
    if (!host || stopped) {
      return null;
    }
    const bar = newSoundbar({ id, host });
    bar.needsRead = !config.quietStart;
    adopt(bar);
    bar.start();
    return bar;
  };

  gladys.onDeviceCreated(async (device) => {
    const bar = track(device);
    if (bar) {
      // States published before the creation were thrown away by Gladys.
      states.republish(device.external_id);
      pushValues(bar);
    }
    publishStatus();
    refreshWidget(true);
  });

  gladys.onDeviceUpdated(async (device) => {
    const bar = track(device);
    if (bar) {
      states.republish(device.external_id);
      pushValues(bar);
    }
  });

  gladys.onDeviceDeleted(async (device) => {
    const externalId = String(device?.external_id ?? '');
    created.delete(externalId);
    states.forget(externalId);
    publishStatus();
    refreshWidget(true);
  });

  gladys.onScanRequest(async () => {
    await scan();
  });

  gladys.onConfigUpdated(async (raw) => {
    const before = config;
    config = normalizeConfig(raw ?? {});
    if (before.language !== config.language) {
      await publishDiscovered();
    }
    const added = config.hosts.filter((host) => !before.hosts.includes(host));
    if (added.length > 0) {
      await tryHosts(added);
      await publishDiscovered();
    }
  });

  // --- Configuration button ------------------------------------------------------------------------

  gladys.onAction(CONFIG_ACTIONS.SEARCH, async () => {
    const found = await scan();
    const known = found.filter((bar) => bar.id);
    if (known.length === 0) {
      return all(scanError === 'forbidden' ? 'searchForbidden' : 'searchNone');
    }
    return all((language) => {
      const lines = known.map((bar) => {
        const details = [bar.host];
        if (bar.state.model) details.push(bar.state.model);
        details.push(
          bar.connected ? t('searchConnected', language) : t('searchNotConnected', language),
        );
        return `${deviceName(bar)} (${details.join(', ')})`;
      });
      return t('searchFound', language, { count: known.length, list: lines.join(' · ') }).slice(
        0,
        1000,
      );
    });
  });

  // --- Scene actions -------------------------------------------------------------------------------

  const barOfField = (value) => {
    if (value) {
      return barOfDevice(value);
    }
    const bar = firstBar();
    if (!bar) {
      throw userError('errorUnknownSoundbar');
    }
    return bar;
  };

  gladys.onSceneAction(ACTIONS.APPLY_PRESET, async (fields = {}) => {
    const bar = barOfField(fields.soundbar);
    try {
      const commands = presetCommands(bar.state, fields);
      if (commands.length === 0) {
        throw new CommandError('errorPresetEmpty');
      }
      await ensureOpen(bar);
      for (const { msg, data } of commands) {
        await bar.set(msg, data);
      }
      if (typeof bar.state.power !== 'boolean') bar.assumedPower = true;
    } catch (error) {
      throw explain(error, bar);
    } finally {
      pushValues(bar);
      refreshWidget();
    }
    const { state } = bar;
    return {
      volume: Number.isInteger(state.volume) ? state.volume : null,
      source_name: Number.isInteger(state.func)
        ? optionLabel('func', shownFunction(state.func, state.funcList), config.language)
        : '',
      sound_mode_name: Number.isInteger(state.eq)
        ? optionLabel('eq', state.eq, config.language)
        : '',
    };
  });

  gladys.onSceneAction(ACTIONS.CHANGE_VOLUME, async (fields = {}) => {
    const bar = barOfField(fields.soundbar);
    try {
      await ensureOpen(bar);
      if (!Number.isInteger(bar.state.volume)) {
        await bar.connection.get(MSG.SPEAKER).catch(() => {});
      }
      const volume = steppedVolume(bar.state, Number(fields.step));
      if (volume !== bar.state.volume) {
        await bar.set(MSG.SPEAKER, { i_vol: volume });
      }
      if (typeof bar.state.power !== 'boolean') bar.assumedPower = true;
    } catch (error) {
      throw explain(error, bar);
    } finally {
      pushValues(bar);
      refreshWidget();
    }
    return { volume: bar.state.volume };
  });

  // --- Widget --------------------------------------------------------------------------------------

  const albumArtKey = async (bar) => {
    const url = bar.state.play?.albumArt;
    const streaming =
      Number.isInteger(bar.state.play?.streamType) && bar.state.play.streamType !== 0;
    if (!url || !streaming) {
      return null;
    }
    const cached = imageOf.get(bar.id);
    if (cached?.url === url) {
      return cached.key;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    // Only from the soundbar itself, never a URL elsewhere.
    if (parsed.protocol !== 'http:' || parsed.hostname !== bar.host) {
      return null;
    }
    try {
      const bytes = await fetchImage(url);
      const base64 = bytes.toString('base64');
      if (validateWidgetImage(base64).length > 0) {
        imageOf.set(bar.id, { url, key: null });
        return null;
      }
      const key = `art-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
      images.clear();
      images.set(key, base64);
      imageOf.set(bar.id, { url, key });
      return key;
    } catch (error) {
      logger.debug?.(`LG Soundbar: album art of ${bar.host} unavailable: ${error?.message}`);
      imageOf.set(bar.id, { url, key: null });
      return null;
    }
  };

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings = {}, language } = {}) => {
    const lang = LANGUAGES.includes(language) ? language : config.language;
    let bar;
    try {
      bar = barOfField(settings.soundbar);
    } catch {
      bar = null;
    }
    if (!bar) {
      return buildSoundbarWidget({ entry: null, language: lang, now: now() });
    }
    const deviceId = created.has(idsOf(bar).device) ? idsOf(bar).device : null;
    const imageKey = await albumArtKey(bar);
    return buildSoundbarWidget({ entry: bar, language: lang, deviceId, imageKey, now: now() });
  });

  gladys.onWidgetGetImage(async (imageKey) => {
    const image = images.get(imageKey);
    if (!image) {
      throw new Error('image not available');
    }
    return image;
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey, params = {}) => {
    let bar;
    try {
      bar = params.soundbar ? bars.get(String(params.soundbar)) : null;
      if (!bar) throw userError('errorUnknownSoundbar');
    } catch (error) {
      return all(() => error.message.slice(0, 200));
    }
    try {
      if (actionKey === BUTTONS.VOLUME_DOWN || actionKey === BUTTONS.VOLUME_UP) {
        await ensureOpen(bar);
        const volume = steppedVolume(bar.state, actionKey === BUTTONS.VOLUME_UP ? 1 : -1);
        await bar.set(MSG.SPEAKER, { i_vol: volume });
        if (typeof bar.state.power !== 'boolean') bar.assumedPower = true;
        return all('toastVolume', { volume: bar.state.volume ?? volume });
      }
      if (actionKey === BUTTONS.MUTE) {
        await command(bar, FEATURES.MUTE, params.mute ? 1 : 0);
        return all(bar.state.mute ? 'toastMuted' : 'toastUnmuted');
      }
      if (actionKey === BUTTONS.POWER) {
        await command(bar, FEATURES.POWER, params.on ? 1 : 0);
        return all(powerOf(bar).on ? 'toastOn' : 'toastOff');
      }
      return all('errorNotSupported');
    } catch (error) {
      const explained = explain(error, bar);
      return all(() => String(explained.message).slice(0, 200));
    } finally {
      pushValues(bar);
      refreshWidget(true);
    }
  });

  // --- Lifecycle -----------------------------------------------------------------------------------

  const start = async () => {
    // gladys.config is filled by connect(), after createApp.
    config = normalizeConfig(gladys.config ?? {});
    const stored = (await safely(() => storage.read(STORAGE_FILE), 'reading /data')) ?? {};
    for (const [id, saved] of Object.entries(stored)) {
      if (!saved?.host || bars.has(id)) continue;
      const bar = newSoundbar({ id, host: saved.host, state: saved.state });
      bar.needsRead = !config.quietStart;
      adopt(bar);
    }
    const devices = (await safely(() => gladys.getDevices(), 'reading the devices')) ?? [];
    for (const device of Array.isArray(devices) ? devices : []) {
      track(device);
    }
    for (const bar of bars.values()) {
      bar.start();
      pushValues(bar);
    }
    await publishDiscovered();
    const unknownHosts = config.hosts.filter(
      (host) => ![...bars.values()].some((bar) => bar.host === host),
    );
    if (unknownHosts.length > 0) {
      await tryHosts(unknownHosts);
      await publishDiscovered();
    }
    publishStatus();
  };

  const stop = async () => {
    stopped = true;
    clearTimeout(saveTimer);
    clearTimeout(discoveredTimer);
    clearTimeout(widgetTimer);
    for (const bar of bars.values()) {
      bar.stop();
    }
    states.stop();
    await safely(
      () =>
        storage.write(
          STORAGE_FILE,
          Object.fromEntries(
            [...bars.values()].filter((bar) => bar.id).map((bar) => [bar.id, bar.toStorage()]),
          ),
        ),
      'saving /data',
    );
  };

  return { start, stop, scan, soundbars: bars, states, created };
}
