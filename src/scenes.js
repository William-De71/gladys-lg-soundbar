// -----------------------------------------------------------------------------
// Scene triggers and actions.
//
// Triggers: what the soundbar pushes and the Gladys "device state changed"
// trigger cannot match. A select (input, sound mode) is a text state, which
// that trigger does not compare; a track is not a state; being unreachable
// is not a feature. Power, volume, mute and the switches are numeric
// features: the core trigger covers them, no duplicate here.
//
// Every trigger fires once per transition seen on the connection, only for
// a change made outside Gladys (remote, TV, app): never for a change the
// integration has just sent (a scene action, a dashboard command), so a
// scene cannot loop through the integration. Nothing fires at the first
// reading (what the state was before is unknown).
// -----------------------------------------------------------------------------

import { optionLabel, optionValue, shownFunction } from './temescal/names.js';

export const TRIGGERS = {
  SOURCE_CHANGED: 'source_changed',
  SOUND_MODE_CHANGED: 'sound_mode_changed',
  TRACK_CHANGED: 'track_changed',
  OFFLINE: 'soundbar_offline',
  ONLINE: 'soundbar_online',
};

export const ACTIONS = {
  APPLY_PRESET: 'apply_sound_preset',
  CHANGE_VOLUME: 'change_volume',
};

// i_stream_type of PLAY_INFO. 1 and 4 are in python-temescal 0.5; the others
// come from mjg59/python-temescal pull request #3 (labels of the LG app).
const STREAMS = [
  'Wi-Fi',
  'Google Cast',
  'Amazon Alexa',
  'Apple AirPlay',
  'Spotify Connect',
  'Tidal Connect',
];

/**
 * @description The name of a stream type.
 * @param {number} type - i_stream_type.
 * @returns {string} The name, '' when unknown.
 */
export function streamName(type) {
  return Number.isInteger(type) && type > 0 && type < STREAMS.length ? STREAMS[type] : '';
}

/**
 * @description The data of a source_changed event.
 * @param {string} device - The device external id.
 * @param {number} previous - The previous i_curr_func (null when unknown).
 * @param {object} state - The new state.
 * @param {string} language - Language of the names.
 * @returns {object|null} The data, null when the shown input did not change.
 */
export function sourceEvent(device, previous, state, language) {
  if (!Number.isInteger(previous) || !Number.isInteger(state.func)) {
    return null;
  }
  const before = shownFunction(previous, state.funcList);
  const after = shownFunction(state.func, state.funcList);
  if (before === after) {
    return null;
  }
  return {
    soundbar: device,
    source: optionValue('func', after),
    source_name: optionLabel('func', after, language),
    previous_source_name: optionLabel('func', before, language),
  };
}

/**
 * @description The data of a sound_mode_changed event.
 * @param {string} device - The device external id.
 * @param {number} previous - The previous i_curr_eq.
 * @param {object} state - The new state.
 * @param {string} language - Language of the names.
 * @returns {object|null} The data.
 */
export function soundModeEvent(device, previous, state, language) {
  if (!Number.isInteger(previous) || !Number.isInteger(state.eq) || previous === state.eq) {
    return null;
  }
  return {
    soundbar: device,
    sound_mode: optionValue('eq', state.eq),
    sound_mode_name: optionLabel('eq', state.eq, language),
    previous_sound_mode_name: optionLabel('eq', previous, language),
  };
}

/**
 * @description The data of a track_changed event.
 * @param {string} device - The device external id.
 * @param {object} previous - The previous `play` of the state.
 * @param {object} play - The new one.
 * @returns {object|null} The data, null when no new track is playing.
 */
export function trackEvent(device, previous, play) {
  if (!play || play.streamType === 0 || !play.title) {
    return null;
  }
  if (previous && previous.title === play.title && previous.artist === play.artist) {
    return null;
  }
  return {
    soundbar: device,
    title: play.title.slice(0, 1000),
    artist: (play.artist || '').slice(0, 1000),
    stream: streamName(play.streamType),
  };
}
