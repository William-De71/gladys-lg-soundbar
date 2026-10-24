// -----------------------------------------------------------------------------
// The "soundbar" dashboard widget: what the soundbar does now, and a remote.
//
//   heading + caption   the track and the artist, while streaming
//   image               the album art the soundbar serves (when it has one,
//                       checked and cached by app.js)
//   tiles               volume, subwoofer level (live when the device is
//                       created in Gladys)
//   status              power, input, sound mode, night mode, audio signal,
//                       connection
//   buttons             volume down, volume up, mute / unmute, switch on / off
//
// Pure: built from a soundbar entry, reused by docs/illustrations/gen.mjs.
// Budget: 2 texts, 1 focal, 6 tiles, 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { all, ago, t } from './i18n.js';
import { levelOf } from './temescal/model.js';
import { optionLabel, shownFunction } from './temescal/names.js';
import { FEATURES } from './devices.js';
import { streamName } from './scenes.js';

export const WIDGET_KEY = 'soundbar';

export const BUTTONS = {
  VOLUME_DOWN: 'volume_down',
  VOLUME_UP: 'volume_up',
  MUTE: 'mute',
  POWER: 'power',
};

const cut = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * @description The power as the widget says it.
 * @param {object} entry - The soundbar entry.
 * @returns {{ on: boolean|null, assumed: boolean }} On, off or unknown.
 */
export function powerOf(entry) {
  if (entry.online === false) {
    return { on: false, assumed: false };
  }
  if (typeof entry.state.power === 'boolean') {
    return { on: entry.state.power, assumed: false };
  }
  if (typeof entry.assumedPower === 'boolean') {
    return { on: entry.assumedPower, assumed: true };
  }
  return { on: null, assumed: true };
}

/**
 * @description The content of the widget.
 * @param {object} params - Parameters.
 * @param {object|null} params.entry - `{ id, host, state, online, assumedPower,
 * lastSeen }`, null when no soundbar is known.
 * @param {string} params.language - The language of the texts.
 * @param {string|null} [params.deviceId] - The device external id when the
 * user created it (live tiles), else null.
 * @param {string|null} [params.imageKey] - The key of a checked album art.
 * @param {number} [params.now] - Now (ms).
 * @returns {object} The widget content.
 */
export function buildSoundbarWidget({
  entry,
  language,
  deviceId = null,
  imageKey = null,
  now = Date.now(),
}) {
  if (!entry) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: all('widgetNoSoundbar') }],
    };
  }
  const { state } = entry;
  const header = [];
  const tiles = [];
  const buttons = [];
  const play = state.play ?? {};
  const streaming =
    Number.isInteger(play.streamType) && play.streamType !== 0 && entry.online !== false;

  if (streaming && play.title) {
    header.push({ type: 'text', variant: 'heading', text: cut(play.title, 40) });
    const by = [play.artist, streamName(play.streamType)].filter(Boolean).join(' · ');
    if (by) {
      header.push({ type: 'text', variant: 'caption', text: cut(by, 80) });
    }
  }
  if (streaming && imageKey) {
    header.push({
      type: 'image',
      key: imageKey,
      alt: all('widgetAlbumArt'),
      fit: 'contain',
    });
  }

  // Tiles.
  if (Number.isInteger(state.volumeMax)) {
    tiles.push(
      deviceId
        ? {
            type: 'value',
            label: all('widgetVolume'),
            icon: 'volume-2',
            device_feature: `${deviceId}:${FEATURES.VOLUME}`,
          }
        : {
            type: 'value',
            label: all('widgetVolume'),
            icon: 'volume-2',
            value: Number.isInteger(state.volume) ? state.volume : '–',
          },
    );
  }
  const woofer = levelOf(state, 'woofer');
  if (woofer) {
    tiles.push(
      deviceId
        ? {
            type: 'value',
            label: all('widgetWoofer'),
            icon: 'speaker',
            device_feature: `${deviceId}:${FEATURES.WOOFER_LEVEL}`,
          }
        : {
            type: 'value',
            label: all('widgetWoofer'),
            icon: 'speaker',
            value: woofer.value ?? '–',
            unit: 'dB',
          },
    );
  }

  // Status.
  const power = powerOf(entry);
  const items = [];
  items.push({
    label: t('widgetPower', language),
    icon: 'power',
    value:
      power.on === null
        ? t('widgetUnknown', language)
        : t(power.on ? (power.assumed ? 'widgetOnAssumed' : 'widgetOn') : 'widgetOff', language),
    color: power.on ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  });
  if (Number.isInteger(state.func)) {
    items.push({
      label: t('widgetSource', language),
      icon: 'log-in',
      value: cut(optionLabel('func', shownFunction(state.func, state.funcList), language), 40),
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  if (Number.isInteger(state.eq)) {
    items.push({
      label: t('widgetSoundMode', language),
      icon: 'sliders',
      value: cut(optionLabel('eq', state.eq, language), 40),
      color: WIDGET_COLORS.INFO,
    });
  }
  if (typeof state.mute === 'boolean' && state.mute) {
    items.push({
      label: t('widgetMute', language),
      icon: 'volume-x',
      value: t('widgetMuted', language),
      color: WIDGET_COLORS.WARNING,
    });
  }
  if (typeof state.night === 'boolean') {
    items.push({
      label: t('widgetNight', language),
      icon: 'moon',
      value: t(state.night ? 'widgetNightOn' : 'widgetNightOff', language),
      color: state.night ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (state.audioSource) {
    items.push({
      label: t('widgetSignal', language),
      icon: 'activity',
      value: cut(state.audioSource, 40),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (entry.online === false) {
    items.push({
      label: t('widgetConnection', language),
      icon: 'wifi-off',
      value: cut(t('widgetUnreachable', language, { ago: ago(entry.lastSeen, now, language) }), 40),
      color: WIDGET_COLORS.DANGER,
    });
  }

  // Remote.
  if (entry.online !== false) {
    if (Number.isInteger(state.volumeMax)) {
      buttons.push(
        {
          type: 'button',
          label: all('widgetVolumeDown'),
          icon: 'volume-1',
          style: 'secondary',
          action: { key: BUTTONS.VOLUME_DOWN, params: { soundbar: entry.id } },
        },
        {
          type: 'button',
          label: all('widgetVolumeUp'),
          icon: 'volume-2',
          style: 'secondary',
          action: { key: BUTTONS.VOLUME_UP, params: { soundbar: entry.id } },
        },
      );
    }
    if (typeof state.mute === 'boolean') {
      buttons.push({
        type: 'button',
        label: all(state.mute ? 'widgetUnmute' : 'widgetMuteButton'),
        icon: state.mute ? 'volume-2' : 'volume-x',
        style: 'secondary',
        action: { key: BUTTONS.MUTE, params: { soundbar: entry.id, mute: !state.mute } },
      });
    }
    buttons.push({
      type: 'button',
      label: all(power.on ? 'widgetSwitchOff' : 'widgetSwitchOn'),
      icon: 'power',
      style: power.on ? 'danger' : 'primary',
      action: { key: BUTTONS.POWER, params: { soundbar: entry.id, on: !power.on } },
    });
  }

  // 8 components at most: the tiles give way first (the volume then goes
  // to the status list).
  const room = Math.max(0, 8 - header.length - 1 - buttons.length);
  const shownTiles = tiles.slice(0, room);
  if (shownTiles.length < tiles.length && Number.isInteger(state.volume)) {
    items.splice(1, 0, {
      label: t('widgetVolume', language),
      icon: 'volume-2',
      value: state.volume,
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  const components = [
    ...header,
    ...shownTiles,
    { type: 'status', items: items.slice(0, 10) },
    ...buttons,
  ];

  return {
    // The live tiles follow the states by themselves; the rest is pulled
    // again on a change (requestWidgetRefresh) or every minute.
    ttl_seconds: 60,
    components,
  };
}
