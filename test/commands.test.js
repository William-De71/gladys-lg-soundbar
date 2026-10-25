import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandError, commandFor, presetCommands, steppedVolume } from '../src/commands.js';
import { applyMessage, emptyState } from '../src/temescal/model.js';
import { MSG } from '../src/temescal/protocol.js';
import { profileData } from './helpers/fake-soundbar.js';

const stateOf = (profile) => {
  const state = emptyState();
  for (const [msg, data] of Object.entries(profileData(profile))) {
    applyMessage(state, { cmd: 'notibyget', msg, data, result: 'ok' });
  }
  return state;
};
const refused = (fn, key) =>
  assert.throws(fn, (error) => error instanceof CommandError && error.key === key);

test('each feature becomes the set of python-temescal / Home Assistant', () => {
  const state = stateOf('SP8YA');
  assert.deepEqual(commandFor(state, 'power', 0), {
    msg: MSG.SPEAKER,
    data: { b_powerkey: false },
  });
  assert.deepEqual(commandFor(state, 'power', 1), { msg: MSG.SPEAKER, data: { b_powerkey: true } });
  assert.deepEqual(commandFor(state, 'volume', 12), { msg: MSG.SPEAKER, data: { i_vol: 12 } });
  assert.deepEqual(commandFor(state, 'mute', 1), { msg: MSG.SPEAKER, data: { b_mute: true } });
  assert.deepEqual(commandFor(state, 'source', 'func-6'), {
    msg: MSG.FUNCTION,
    data: { i_curr_func: 6 },
  });
  assert.deepEqual(commandFor(state, 'sound_mode', 'eq-7'), {
    msg: MSG.EQUALISER,
    data: { i_curr_eq: 7 },
  });
  assert.deepEqual(commandFor(state, 'night_mode', 1), {
    msg: MSG.SETTINGS,
    data: { b_night_time: true },
  });
  assert.deepEqual(commandFor(state, 'auto_volume', 1), {
    msg: MSG.SETTINGS,
    data: { b_auto_vol: true },
  });
  assert.deepEqual(commandFor(state, 'drc', 0), { msg: MSG.SETTINGS, data: { b_drc: false } });
  assert.deepEqual(commandFor(state, 'auto_power', 0), {
    msg: MSG.SETTINGS,
    data: { b_auto_power: false },
  });
});

test('values are bounded by what the soundbar reported', () => {
  const state = stateOf('SP8YA');
  assert.deepEqual(commandFor(state, 'volume', 99).data, { i_vol: 40 }, 'i_vol_max is 40');
  assert.deepEqual(commandFor(state, 'volume', -3).data, { i_vol: 0 });
  assert.deepEqual(commandFor(state, 'volume', 12.6).data, { i_vol: 13 });
  // Levels: dB in Gladys, offset from the minimum on the wire.
  assert.deepEqual(commandFor(state, 'woofer_level', 0).data, { i_woofer_level: 15 });
  assert.deepEqual(commandFor(state, 'woofer_level', -15).data, { i_woofer_level: 0 });
  assert.deepEqual(
    commandFor(state, 'woofer_level', 20).data,
    { i_woofer_level: 21 },
    '+6 dB at most',
  );
  assert.deepEqual(commandFor(state, 'rear_level', -2).data, { i_rear_level: 4 });
  refused(() => commandFor(state, 'volume', 'loud'), 'errorValue');
  refused(() => commandFor(state, 'source', 'func-11'), 'errorSourceUnknown');
  refused(() => commandFor(state, 'source', 'hdmi'), 'errorValue');
  refused(() => commandFor(state, 'sound_mode', 'eq-8'), 'errorSoundModeUnknown');
  refused(() => commandFor(state, 'unknown', 1), 'errorNotSupported');
  refused(() => commandFor(emptyState(), 'night_mode', 1), 'errorNotSupported');
  refused(() => commandFor(emptyState(), 'woofer_level', 1), 'errorNotSupported');
});

test('play and pause only while something is streamed', () => {
  refused(() => commandFor(stateOf('SP8YA'), 'playback', 1), 'errorNotStreaming');
  const s90 = stateOf('S90QY');
  assert.deepEqual(commandFor(s90, 'playback', 0), { msg: MSG.PLAY, data: { i_play_ctrl: 1 } });
  assert.deepEqual(commandFor(s90, 'playback', 1), { msg: MSG.PLAY, data: { i_play_ctrl: 0 } });
  s90.play.supportControl = false;
  refused(() => commandFor(s90, 'playback', 1), 'errorNotSupported');
});

test('a preset sends the input first and the volume last, empty fields untouched', () => {
  const state = stateOf('SP8YA');
  assert.deepEqual(
    presetCommands(state, {
      volume: 15,
      sound_mode: 'eq-7',
      source: 'func-6',
      night_mode: 'on',
    }).map((command) => command.key),
    ['source', 'sound_mode', 'night_mode', 'volume'],
  );
  assert.deepEqual(presetCommands(state, { volume: '', night_mode: 'unchanged' }), []);
  refused(() => presetCommands(state, { source: 'func-17' }), 'errorSourceUnknown');
});

test('relative volume stays within the range', () => {
  const state = stateOf('SP8YA');
  assert.equal(steppedVolume(state, -5), 2);
  assert.equal(steppedVolume(state, -50), 0);
  assert.equal(steppedVolume(state, 50), 40);
  refused(() => steppedVolume(emptyState(), 1), 'errorVolumeUnknown');
});

test('the music box: volume in % of the range, mute, play and pause only', () => {
  const state = stateOf('SP8YA');
  assert.deepEqual(commandFor(state, 'music_volume', 50), {
    msg: MSG.SPEAKER,
    data: { i_vol: 20 },
  });
  assert.deepEqual(commandFor(state, 'music_volume', 140).data, { i_vol: 40 });
  assert.deepEqual(commandFor(state, 'music_volume', -3).data, { i_vol: 0 });
  refused(() => commandFor(state, 'music_volume', 'loud'), 'errorValue');
  assert.deepEqual(commandFor(state, 'music_mute', 1), {
    msg: MSG.SPEAKER,
    data: { b_mute: true },
  });
  const s90 = stateOf('S90QY');
  refused(() => commandFor(s90, 'playback', 2), 'errorValue');
  refused(() => commandFor(s90, 'playback', 3), 'errorValue');
});
