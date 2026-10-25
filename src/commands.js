// -----------------------------------------------------------------------------
// Gladys commands -> temescal `set` messages, and the scene action presets.
//
// Every `set` used here is in python-temescal 0.5 or in the Home Assistant
// integration (b_powerkey, i_play_ctrl):
//   SPK_LIST_VIEW_INFO  i_vol, b_mute, b_powerkey
//   FUNC_VIEW_INFO      i_curr_func
//   EQ_VIEW_INFO        i_curr_eq
//   SETTING_VIEW_INFO   b_night_time / b_night_mode, b_auto_vol, b_drc,
//                       b_auto_power, i_<speaker>_level (raw = dB - min)
//   PLAY_INFO           i_play_ctrl (0 play, 1 pause)
//
// The music box features of Gladys 5.3 go to the same fields: music_volume
// (0-100 % of the range) to i_vol, music_mute to b_mute. temescal has no
// stop, next, previous nor seek: playback takes 0 (pause) and 1 (play) only.
//
// Values are checked against what the soundbar reported (volume range,
// inputs, sound modes, level ranges): a value outside is refused with a
// message rather than sent.
// -----------------------------------------------------------------------------

import { MSG } from './temescal/protocol.js';
import { SWITCHES, levelOf } from './temescal/model.js';
import { optionIndex } from './temescal/names.js';
import { FEATURES, volumeRange } from './devices.js';

/** A command Gladys cannot send, with the text key of its explanation. */
export class CommandError extends Error {
  constructor(key, values = {}) {
    super(key);
    this.name = 'CommandError';
    this.key = key;
    this.values = values;
  }
}

const asBool = (value) => Number(value) >= 1 || value === true || value === 'true';

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value))));

/**
 * @description The `set` of a feature command.
 * @param {object} state - The soundbar state.
 * @param {string} key - The feature key.
 * @param {*} value - The value from Gladys (a number, or a string for a select).
 * @returns {{ msg: string, data: object }} The message to send.
 * @throws {CommandError} When the value cannot be sent.
 */
export function commandFor(state, key, value) {
  switch (key) {
    case FEATURES.POWER:
      return { msg: MSG.SPEAKER, data: { b_powerkey: asBool(value) } };
    case FEATURES.VOLUME: {
      if (!Number.isFinite(Number(value))) throw new CommandError('errorValue');
      const min = Number.isInteger(state.volumeMin) ? state.volumeMin : 0;
      const max = Number.isInteger(state.volumeMax) ? state.volumeMax : 100;
      return { msg: MSG.SPEAKER, data: { i_vol: clampInt(value, min, max) } };
    }
    case FEATURES.MUSIC_VOLUME: {
      if (!Number.isFinite(Number(value))) throw new CommandError('errorValue');
      const { min, max } = volumeRange(state);
      const percent = clampInt(value, 0, 100);
      return { msg: MSG.SPEAKER, data: { i_vol: min + Math.round(((max - min) * percent) / 100) } };
    }
    case FEATURES.MUTE:
    case FEATURES.MUSIC_MUTE:
      return { msg: MSG.SPEAKER, data: { b_mute: asBool(value) } };
    case FEATURES.SOURCE: {
      const index = optionIndex('func', value);
      if (index === null) throw new CommandError('errorValue');
      if (Array.isArray(state.funcList) && !state.funcList.includes(index)) {
        throw new CommandError('errorSourceUnknown');
      }
      return { msg: MSG.FUNCTION, data: { i_curr_func: index } };
    }
    case FEATURES.SOUND_MODE: {
      const index = optionIndex('eq', value);
      if (index === null) throw new CommandError('errorValue');
      if (Array.isArray(state.eqList) && !state.eqList.includes(index)) {
        throw new CommandError('errorSoundModeUnknown');
      }
      return { msg: MSG.EQUALISER, data: { i_curr_eq: index } };
    }
    case FEATURES.NIGHT_MODE:
      if (!state.nightField) throw new CommandError('errorNotSupported');
      return { msg: MSG.SETTINGS, data: { [state.nightField]: asBool(value) } };
    case FEATURES.PLAYBACK:
      if (state.play?.supportControl !== true) throw new CommandError('errorNotSupported');
      if (state.play?.streamType === 0) throw new CommandError('errorNotStreaming');
      // Gladys 5.3 may write 2 (stop) or 3 (buffering): no such order here.
      if (Number(value) > 1) throw new CommandError('errorValue');
      return { msg: MSG.PLAY, data: { i_play_ctrl: asBool(value) ? 0 : 1 } };
    default:
      break;
  }
  if (SWITCHES[key]) {
    return { msg: MSG.SETTINGS, data: { [SWITCHES[key]]: asBool(value) } };
  }
  const level = /^(\w+)_level$/.exec(key)?.[1];
  if (level) {
    const range = levelOf(state, level);
    if (!range) throw new CommandError('errorNotSupported');
    if (!Number.isFinite(Number(value))) throw new CommandError('errorValue');
    const db = clampInt(value, range.min, range.max);
    return { msg: MSG.SETTINGS, data: { [`i_${level}_level`]: db - range.min } };
  }
  throw new CommandError('errorNotSupported');
}

/**
 * @description The `set` messages of a sound preset (scene action), in the
 * order they are sent: input first (some soundbars restore the sound mode of
 * an input when it changes), then the sound mode, the night mode, the
 * volume last.
 * @param {object} state - The soundbar state.
 * @param {object} fields - `{ source?, sound_mode?, night_mode?, volume? }`
 * as resolved by Gladys (`night_mode`: unchanged, on, off).
 * @returns {Array<{ key: string, msg: string, data: object }>} The messages.
 * @throws {CommandError} When a value cannot be sent.
 */
export function presetCommands(state, fields) {
  const commands = [];
  const present = (value) => value !== undefined && value !== null && value !== '';
  if (present(fields.source)) {
    commands.push({ key: FEATURES.SOURCE, ...commandFor(state, FEATURES.SOURCE, fields.source) });
  }
  if (present(fields.sound_mode)) {
    commands.push({
      key: FEATURES.SOUND_MODE,
      ...commandFor(state, FEATURES.SOUND_MODE, fields.sound_mode),
    });
  }
  if (fields.night_mode === 'on' || fields.night_mode === 'off') {
    commands.push({
      key: FEATURES.NIGHT_MODE,
      ...commandFor(state, FEATURES.NIGHT_MODE, fields.night_mode === 'on' ? 1 : 0),
    });
  }
  if (present(fields.volume)) {
    commands.push({ key: FEATURES.VOLUME, ...commandFor(state, FEATURES.VOLUME, fields.volume) });
  }
  return commands;
}

/**
 * @description The volume after a relative change, within the range.
 * @param {object} state - The soundbar state.
 * @param {number} step - The change (negative lowers).
 * @returns {number} The new volume.
 * @throws {CommandError} When the volume is not known.
 */
export function steppedVolume(state, step) {
  if (!Number.isInteger(state.volume)) {
    throw new CommandError('errorVolumeUnknown');
  }
  const min = Number.isInteger(state.volumeMin) ? state.volumeMin : 0;
  const max = Number.isInteger(state.volumeMax) ? state.volumeMax : 100;
  return clampInt(state.volume + Number(step || 0), min, max);
}
