// -----------------------------------------------------------------------------
// The state of a soundbar, built from its messages.
//
// Every message carries a part of the state (`data`), as the answer to a
// `get` ("notibyget"), to a `set` ("notibyset", often only the fields that
// changed) or spontaneously when the remote, the TV (HDMI CEC) or the app
// changes something. A message only updates the fields it carries.
//
// Fields, as reported by real soundbars (Home Assistant issues, captures of
// albaintor/integration-lgsoundbar for an SP8YA and an S90QY, lgsb2mqtt for a
// DS90QY):
//   SPK_LIST_VIEW_INFO  i_vol, i_vol_min, i_vol_max, b_mute, i_curr_func,
//                       s_user_name, b_powerstatus (recent models only),
//                       s_audio_source ("DOLBY AUDIO", "NO SIGNAL"; recent)
//   FUNC_VIEW_INFO      i_curr_func, ai_func_list
//   EQ_VIEW_INFO        i_curr_eq, ai_eq_list
//   SETTING_VIEW_INFO   b_night_time or b_night_mode, b_auto_vol, b_drc,
//                       b_auto_power, i_<speaker>_level / _min / _max,
//                       s_user_name, i_curr_eq
//   PLAY_INFO           i_stream_type (0 = used as a soundbar), i_play_ctrl
//                       (0 playing, 1 paused), b_support_play_ctrl, s_title,
//                       s_artist, s_albumart
//   PRODUCT_INFO        s_model_name, sometimes s_uuid
//   MAC_INFO_DEV        s_uuid (the id Home Assistant uses), MAC addresses
//                       (often garbage: "do@", 00:00:00:00:00:00)
//   UPDATE_VIEW_INFO    o_system_ver.s_main (firmware), b_update
//
// Strings may be garbage on some firmwares (a reused buffer: `d"MAC_INFO_DEV"}`):
// a string holding JSON punctuation is ignored.
//
// Speaker levels: the soundbar reports the level as an offset from its
// minimum (DS90QY, lgsb2mqtt: i_woofer_level 15 with i_woofer_min -15 is
// 0 dB; an SP8YA reports the same 15 with a maximum of 6). Gladys shows dB:
// dB = raw + min, and a set sends dB - min.
// -----------------------------------------------------------------------------

import { MSG } from './protocol.js';

export const LEVELS = ['woofer', 'rear', 'center', 'top'];

// The switch settings of SETTING_VIEW_INFO the integration offers, and the
// field of each. Night mode is `b_night_time` on most models (python-temescal
// issue #12, SP9YA, SP8YA, S90QY) and `b_night_mode` in python-temescal.
export const SWITCHES = {
  auto_volume: 'b_auto_vol',
  drc: 'b_drc',
  auto_power: 'b_auto_power',
};

/**
 * @description An empty state.
 * @returns {object} The state.
 */
export function emptyState() {
  return {
    name: '',
    model: '',
    uuid: '',
    mac: '',
    firmware: '',
    updateAvailable: null,
    volume: null,
    volumeMin: null,
    volumeMax: null,
    mute: null,
    func: null,
    funcList: null,
    eq: null,
    eqList: null,
    power: null,
    audioSource: null,
    night: null,
    nightField: null,
    switches: {},
    levels: {},
    play: {
      streamType: null,
      playing: null,
      supportControl: null,
      title: '',
      artist: '',
      albumArt: '',
    },
    seen: [],
  };
}

const isInt = (value) => Number.isInteger(value);
const isBool = (value) => typeof value === 'boolean';
const intList = (value) =>
  Array.isArray(value) ? [...new Set(value.filter((item) => isInt(item) && item >= 0))] : null;

/**
 * @description A string of the soundbar, made safe.
 * @param {*} value - The raw value.
 * @param {number} [max] - Characters kept at most.
 * @returns {string|null} The string, null when it is not one or is garbage.
 */
export function cleanString(value, max = 200) {
  if (typeof value !== 'string') {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (/["{}]/.test(text)) {
    return null;
  }
  return text.slice(0, max);
}

/**
 * @description A MAC address of the soundbar, when it is a real one.
 * @param {*} value - The raw value.
 * @returns {string} 12 lowercase hex digits, or ''.
 */
export function cleanMac(value) {
  const text = cleanString(value) ?? '';
  if (!/^[0-9a-f]{2}([:-]?[0-9a-f]{2}){5}$/i.test(text)) {
    return '';
  }
  const mac = text.toLowerCase().replace(/[^0-9a-f]/g, '');
  return mac === '000000000000' || mac === 'ffffffffffff' ? '' : mac;
}

/**
 * @description The uuid of the soundbar, when it looks like one.
 * @param {*} value - The raw s_uuid.
 * @returns {string} Lowercase letters, digits and dashes, or ''.
 */
export function cleanUuid(value) {
  const text = cleanString(value, 100) ?? '';
  return /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/.test(text) ? text.toLowerCase() : '';
}

const setIf = (state, key, value, changed) => {
  if (value === null || value === undefined) {
    return;
  }
  if (JSON.stringify(state[key]) !== JSON.stringify(value)) {
    state[key] = value;
    changed.add(key);
  }
};

const applyLevel = (state, name, data, changed) => {
  const raw = data[`i_${name}_level`];
  const min = data[`i_${name}_min`];
  const max = data[`i_${name}_max`];
  const previous = state.levels[name] ?? {};
  const next = { ...previous };
  if (isInt(min)) next.min = min;
  if (isInt(max)) next.max = max;
  if (isInt(raw)) next.raw = raw;
  if (JSON.stringify(next) !== JSON.stringify(previous)) {
    state.levels[name] = next;
    changed.add(`level_${name}`);
  }
};

/**
 * @description Apply a message of the soundbar to its state.
 * @param {object} state - The state (changed in place).
 * @param {object} message - `{ cmd, msg, data?, result? }`.
 * @returns {Set<string>} The fields that changed.
 */
export function applyMessage(state, message) {
  const changed = new Set();
  const data = message?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return changed;
  }
  if (typeof message.msg === 'string' && !state.seen.includes(message.msg)) {
    state.seen.push(message.msg);
  }
  const name = cleanString(data.s_user_name, 60);
  if (name) {
    setIf(state, 'name', name, changed);
  }

  switch (message.msg) {
    case MSG.SPEAKER: {
      if (isInt(data.i_vol)) setIf(state, 'volume', data.i_vol, changed);
      if (isInt(data.i_vol_min)) setIf(state, 'volumeMin', data.i_vol_min, changed);
      if (isInt(data.i_vol_max) && data.i_vol_max > 0) {
        setIf(state, 'volumeMax', data.i_vol_max, changed);
      }
      if (isBool(data.b_mute)) setIf(state, 'mute', data.b_mute, changed);
      if (isInt(data.i_curr_func)) setIf(state, 'func', data.i_curr_func, changed);
      if (isBool(data.b_powerstatus)) setIf(state, 'power', data.b_powerstatus, changed);
      if (isBool(data.b_update)) setIf(state, 'updateAvailable', data.b_update, changed);
      const source = cleanString(data.s_audio_source, 40);
      if (source !== null) setIf(state, 'audioSource', source, changed);
      break;
    }
    case MSG.FUNCTION: {
      if (isInt(data.i_curr_func)) setIf(state, 'func', data.i_curr_func, changed);
      setIf(state, 'funcList', intList(data.ai_func_list), changed);
      break;
    }
    case MSG.EQUALISER: {
      if (isInt(data.i_curr_eq)) setIf(state, 'eq', data.i_curr_eq, changed);
      setIf(state, 'eqList', intList(data.ai_eq_list), changed);
      break;
    }
    case MSG.SETTINGS: {
      if (isInt(data.i_curr_eq)) setIf(state, 'eq', data.i_curr_eq, changed);
      // Night time when the model has it (and does not say it is disabled),
      // else night mode.
      if (isBool(data.b_night_time) && data.b_nighttime_enable !== false) {
        setIf(state, 'nightField', 'b_night_time', changed);
        setIf(state, 'night', data.b_night_time, changed);
      } else if (isBool(data.b_night_mode) && state.nightField !== 'b_night_time') {
        setIf(state, 'nightField', 'b_night_mode', changed);
        setIf(state, 'night', data.b_night_mode, changed);
      }
      for (const [key, field] of Object.entries(SWITCHES)) {
        if (isBool(data[field]) && state.switches[key] !== data[field]) {
          state.switches[key] = data[field];
          changed.add(`switch_${key}`);
        }
      }
      LEVELS.forEach((level) => applyLevel(state, level, data, changed));
      break;
    }
    case MSG.PLAY: {
      const play = { ...state.play };
      if (isInt(data.i_stream_type)) play.streamType = data.i_stream_type;
      if (isInt(data.i_play_ctrl)) play.playing = data.i_play_ctrl === 0;
      if (isBool(data.b_support_play_ctrl)) play.supportControl = data.b_support_play_ctrl;
      for (const [field, key] of [
        ['s_title', 'title'],
        ['s_artist', 'artist'],
        ['s_albumart', 'albumArt'],
      ]) {
        const value = cleanString(data[field], key === 'albumArt' ? 500 : 200);
        if (value !== null) play[key] = value;
      }
      if (play.streamType === 0) {
        // Used as a soundbar (TV, HDMI, optical): no track.
        play.title = '';
        play.artist = '';
        play.albumArt = '';
      }
      if (JSON.stringify(play) !== JSON.stringify(state.play)) {
        state.play = play;
        changed.add('play');
      }
      break;
    }
    case MSG.PRODUCT: {
      const model = cleanString(data.s_model_name, 40);
      if (model) setIf(state, 'model', model, changed);
      const uuid = cleanUuid(data.s_uuid);
      if (uuid && !state.uuid) setIf(state, 'uuid', uuid, changed);
      break;
    }
    case MSG.MAC: {
      const uuid = cleanUuid(data.s_uuid);
      if (uuid) setIf(state, 'uuid', uuid, changed);
      const mac = cleanMac(data.s_wired_mac) || cleanMac(data.s_wireless_mac);
      if (mac) setIf(state, 'mac', mac, changed);
      break;
    }
    case MSG.UPDATE: {
      const firmware = cleanString(data.o_system_ver?.s_main, 40);
      if (firmware) setIf(state, 'firmware', firmware, changed);
      if (isBool(data.b_update)) setIf(state, 'updateAvailable', data.b_update, changed);
      break;
    }
    default:
      break;
  }
  return changed;
}

/**
 * @description A speaker level in dB, with its range.
 * @param {object} state - The state.
 * @param {string} name - woofer, rear, center or top.
 * @returns {{ value: number|null, min: number, max: number }|null} Null when
 * the soundbar does not report a usable range.
 */
export function levelOf(state, name) {
  const level = state.levels?.[name];
  if (!level || !isInt(level.min) || !isInt(level.max) || level.min >= level.max) {
    return null;
  }
  const value = isInt(level.raw) ? level.raw + level.min : null;
  return {
    value: value !== null && value >= level.min && value <= level.max ? value : null,
    min: level.min,
    max: level.max,
  };
}

/**
 * @description The platform id of a soundbar: its uuid (the one Home
 * Assistant uses), else a real MAC address, else its address.
 * @param {object} state - The state.
 * @param {string} host - Its IP address.
 * @returns {string} `uuid-…`, `mac-…` or `ip-192-168-1-20`.
 */
export function platformIdOf(state, host) {
  if (state.uuid) {
    return state.uuid;
  }
  if (state.mac) {
    return `mac-${state.mac}`;
  }
  return `ip-${String(host).replace(/[^0-9a-z]+/gi, '-')}`;
}
