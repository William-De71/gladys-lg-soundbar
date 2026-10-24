// -----------------------------------------------------------------------------
// Gladys side of a soundbar: the device of the Discover tab, and the values
// of its features.
//
// One device per soundbar. A feature exists only when the soundbar reports
// the field behind it (models differ: night time or night mode, rear and
// top speakers or not, power status or not):
//
//   power          television/binary  b_powerkey / b_powerstatus; assumed
//                                     (has_feedback false) when the model
//                                     does not report it
//   volume         television/volume  i_vol, i_vol_min..i_vol_max
//   mute           switch/binary      b_mute (1 = muted)
//   source         text/select        i_curr_func among ai_func_list
//   sound_mode     text/select        i_curr_eq among ai_eq_list
//   night_mode     switch/binary      b_night_time or b_night_mode
//   auto_volume    switch/binary      b_auto_vol
//   drc            switch/binary      b_drc (dynamic range compression)
//   auto_power     switch/binary      b_auto_power (wakes up with the signal)
//   woofer_level, rear_level, center_level, top_level
//                  television/volume  speaker levels in dB, the range of the
//                                     soundbar (a slider, like the volume)
//   playback       music/playback_state  i_play_ctrl while streaming (1
//                                     playing, 0 paused), writable when
//                                     b_support_play_ctrl
//   title, artist  text/text          the track while streaming
//   audio_signal   text/text          s_audio_source ("DOLBY AUDIO")
//
// The ranges (volume, levels) are read from the soundbar when it is
// discovered: the Discover "Update" compares `min` and `max`.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { LEVELS, SWITCHES, levelOf } from './temescal/model.js';
import { optionLabel, optionValue, shownFunction } from './temescal/names.js';
import { t } from './i18n.js';

export const DEVICE_TYPE = 'soundbar';

export const FEATURES = {
  POWER: 'power',
  VOLUME: 'volume',
  MUTE: 'mute',
  SOURCE: 'source',
  SOUND_MODE: 'sound_mode',
  NIGHT_MODE: 'night_mode',
  AUTO_VOLUME: 'auto_volume',
  DRC: 'drc',
  AUTO_POWER: 'auto_power',
  WOOFER_LEVEL: 'woofer_level',
  REAR_LEVEL: 'rear_level',
  CENTER_LEVEL: 'center_level',
  TOP_LEVEL: 'top_level',
  PLAYBACK: 'playback',
  TITLE: 'title',
  ARTIST: 'artist',
  AUDIO_SIGNAL: 'audio_signal',
};

export const levelFeature = (level) => `${level}_level`;

/**
 * @description The name of a soundbar: the name set in the LG app
 * (`LG_Speaker_SP8YA` reads `LG Speaker SP8YA`), else `LG <model>`.
 * @param {object} entry - `{ state, host }`.
 * @returns {string} The name.
 */
export function deviceName(entry) {
  const name = String(entry.state?.name ?? '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name) {
    return name;
  }
  if (entry.state?.model) {
    return `LG ${entry.state.model}`;
  }
  return `LG Soundbar ${entry.host ?? ''}`.trim();
}

/**
 * @description The options of the source select: the inputs of the soundbar,
 * plus the current one when it is outside the list and has no equivalent.
 * @param {object} state - The soundbar state.
 * @param {string} language - Label language.
 * @returns {Array<{value: string, label: string, sort_order: number}>} The options.
 */
export function sourceOptions(state, language) {
  const indexes = [...(state.funcList ?? [])];
  if (Number.isInteger(state.func)) {
    const shown = shownFunction(state.func, state.funcList);
    if (!indexes.includes(shown)) {
      indexes.push(shown);
    }
  }
  return indexes.map((index, order) => ({
    value: optionValue('func', index),
    label: optionLabel('func', index, language),
    sort_order: order,
  }));
}

/**
 * @description The options of the sound mode select.
 * @param {object} state - The soundbar state.
 * @param {string} language - Label language.
 * @returns {Array<{value: string, label: string, sort_order: number}>} The options.
 */
export function soundModeOptions(state, language) {
  const indexes = [...(state.eqList ?? [])];
  if (Number.isInteger(state.eq) && !indexes.includes(state.eq)) {
    indexes.push(state.eq);
  }
  return indexes.map((index, order) => ({
    value: optionValue('eq', index),
    label: optionLabel('eq', index, language),
    sort_order: order,
  }));
}

const binary = (category, type, hasFeedback = true) => ({
  category,
  type,
  min: 0,
  max: 1,
  read_only: false,
  has_feedback: hasFeedback,
  keep_history: true,
});

const text = (readOnly = true) => ({
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  min: 0,
  max: 0,
  read_only: readOnly,
  has_feedback: true,
  keep_history: false,
});

const select = (options) => ({
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.SELECT,
  min: 0,
  max: 0,
  read_only: false,
  has_feedback: true,
  keep_history: false,
  supported_options: options,
});

const slider = (min, max, unit) => ({
  category: CATEGORIES.TELEVISION,
  type: TYPES.TELEVISION.VOLUME,
  ...(unit ? { unit } : {}),
  min,
  max,
  step: 1,
  read_only: false,
  has_feedback: true,
  keep_history: false,
});

/**
 * @description The features a soundbar has, from what it reports.
 * @param {object} state - The soundbar state.
 * @param {string} language - Label language.
 * @returns {Array<[string, object]>} `[featureKey, feature]`, in display order.
 */
export function featureSpecs(state, language) {
  const specs = [];
  specs.push([
    FEATURES.POWER,
    binary(CATEGORIES.TELEVISION, TYPES.TELEVISION.BINARY, typeof state.power === 'boolean'),
  ]);
  if (Number.isInteger(state.volumeMax)) {
    const min = Number.isInteger(state.volumeMin) ? state.volumeMin : 0;
    specs.push([FEATURES.VOLUME, slider(min, Math.max(min + 1, state.volumeMax))]);
  }
  if (typeof state.mute === 'boolean') {
    specs.push([FEATURES.MUTE, binary(CATEGORIES.SWITCH, TYPES.SWITCH.BINARY)]);
  }
  if (Array.isArray(state.funcList) || Number.isInteger(state.func)) {
    specs.push([FEATURES.SOURCE, select(sourceOptions(state, language))]);
  }
  if (Array.isArray(state.eqList) || Number.isInteger(state.eq)) {
    specs.push([FEATURES.SOUND_MODE, select(soundModeOptions(state, language))]);
  }
  if (state.nightField) {
    specs.push([FEATURES.NIGHT_MODE, binary(CATEGORIES.SWITCH, TYPES.SWITCH.BINARY)]);
  }
  for (const key of Object.keys(SWITCHES)) {
    if (typeof state.switches?.[key] === 'boolean') {
      specs.push([key, binary(CATEGORIES.SWITCH, TYPES.SWITCH.BINARY)]);
    }
  }
  for (const level of LEVELS) {
    const range = levelOf(state, level);
    if (range) {
      specs.push([levelFeature(level), slider(range.min, range.max, UNITS.DECIBEL)]);
    }
  }
  if (
    state.play &&
    (typeof state.play.supportControl === 'boolean' || Number.isInteger(state.play.streamType))
  ) {
    specs.push([
      FEATURES.PLAYBACK,
      {
        ...binary(CATEGORIES.MUSIC, TYPES.MUSIC.PLAYBACK_STATE),
        read_only: state.play.supportControl !== true,
        keep_history: false,
      },
    ]);
    specs.push([FEATURES.TITLE, text()]);
    specs.push([FEATURES.ARTIST, text()]);
  }
  if (typeof state.audioSource === 'string') {
    specs.push([FEATURES.AUDIO_SIGNAL, text()]);
  }
  return specs;
}

/**
 * @description The device of the Discover tab.
 * @param {object} gladys - SDK client (externalIds).
 * @param {object} entry - `{ id, host, state }`.
 * @param {string} language - Language of the names.
 * @returns {object} The Gladys device.
 */
export function buildDevice(gladys, entry, language) {
  const ids = gladys.externalIds(DEVICE_TYPE, entry.id);
  const name = deviceName(entry);
  return {
    name,
    external_id: ids.device,
    // The soundbar pushes its changes on the open connection: nothing to poll.
    should_poll: false,
    features: featureSpecs(entry.state, language).map(([key, feature]) => ({
      name: `${name} - ${t(`feature_${key}`, language)}`,
      external_id: ids.feature(key),
      ...feature,
    })),
    params: [
      { name: 'LG_SOUNDBAR_HOST', value: entry.host },
      { name: 'LG_SOUNDBAR_MODEL', value: entry.state?.model || '' },
    ],
  };
}

const flag = (value) => (value ? 1 : 0);

// Gladys takes an empty text for no text at all (the state would be lost):
// nothing playing reads as a dash.
export const NO_TEXT = '–';

/**
 * @description The values of the features of a soundbar.
 * @param {object} entry - `{ state, online, assumedPower }`.
 * @returns {Array<[string, number|{text: string}]>} `[featureKey, value]`.
 */
export function featureValues(entry) {
  const { state } = entry;
  const values = [];
  // Unreachable is off (a soundbar switched off at the mains, or that drops
  // the network in deep standby); otherwise the reported status, else the
  // last order (assumed).
  let power = null;
  if (entry.online === false) {
    power = 0;
  } else if (typeof state.power === 'boolean') {
    power = flag(state.power);
  } else if (typeof entry.assumedPower === 'boolean') {
    power = flag(entry.assumedPower);
  }
  if (power !== null) values.push([FEATURES.POWER, power]);
  if (Number.isInteger(state.volume)) values.push([FEATURES.VOLUME, state.volume]);
  if (typeof state.mute === 'boolean') values.push([FEATURES.MUTE, flag(state.mute)]);
  if (Number.isInteger(state.func)) {
    values.push([
      FEATURES.SOURCE,
      { text: optionValue('func', shownFunction(state.func, state.funcList)) },
    ]);
  }
  if (Number.isInteger(state.eq))
    values.push([FEATURES.SOUND_MODE, { text: optionValue('eq', state.eq) }]);
  if (typeof state.night === 'boolean') values.push([FEATURES.NIGHT_MODE, flag(state.night)]);
  for (const key of Object.keys(SWITCHES)) {
    if (typeof state.switches?.[key] === 'boolean') values.push([key, flag(state.switches[key])]);
  }
  for (const level of LEVELS) {
    const range = levelOf(state, level);
    if (range && range.value !== null) values.push([levelFeature(level), range.value]);
  }
  if (state.play) {
    const streaming = Number.isInteger(state.play.streamType) && state.play.streamType !== 0;
    if (Number.isInteger(state.play.streamType) || typeof state.play.playing === 'boolean') {
      values.push([FEATURES.PLAYBACK, flag(streaming && state.play.playing === true)]);
      values.push([FEATURES.TITLE, { text: (streaming && state.play.title) || NO_TEXT }]);
      values.push([FEATURES.ARTIST, { text: (streaming && state.play.artist) || NO_TEXT }]);
    }
  }
  if (typeof state.audioSource === 'string') {
    values.push([FEATURES.AUDIO_SIGNAL, { text: state.audioSource || NO_TEXT }]);
  }
  return values;
}
