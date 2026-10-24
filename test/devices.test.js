// The device of the Discover tab, checked against what Gladys expects but
// does not always say (section "pitfalls" of the community feedback): every
// feature has min / max / read_only / has_feedback, should_poll is false
// without a poll_frequency, the category / type pairs come from the SDK
// constants and render as intended by the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { applyMessage, emptyState } from '../src/temescal/model.js';
import {
  FEATURES,
  NO_TEXT,
  buildDevice,
  deviceName,
  featureSpecs,
  featureValues,
  sourceOptions,
} from '../src/devices.js';
import { LANGUAGES } from '../src/i18n.js';
import { profileData } from './helpers/fake-soundbar.js';

const stateOf = (profile) => {
  const state = emptyState();
  for (const [msg, data] of Object.entries(profileData(profile))) {
    applyMessage(state, { cmd: 'notibyget', msg, data, result: 'ok' });
  }
  return state;
};
const gladys = createFakeGladys();
const keysOf = (device) => device.features.map((feature) => feature.external_id.split(':').pop());

// The pairs the integration may use, and why (front DeviceRow of Gladys):
// binary -> on/off switch, volume -> slider, text/select -> dynamic select,
// music/playback_state -> play/pause (master) or a value (5.1, 5.2), text -> value.
const PAIRS = new Set([
  `${CATEGORIES.TELEVISION}/${TYPES.TELEVISION.BINARY}`,
  `${CATEGORIES.TELEVISION}/${TYPES.TELEVISION.VOLUME}`,
  `${CATEGORIES.SWITCH}/${TYPES.SWITCH.BINARY}`,
  `${CATEGORIES.TEXT}/${TYPES.TEXT.SELECT}`,
  `${CATEGORIES.TEXT}/${TYPES.TEXT.TEXT}`,
  `${CATEGORIES.MUSIC}/${TYPES.MUSIC.PLAYBACK_STATE}`,
]);

test('every feature carries what Gladys requires, from SDK constants, without polling', () => {
  for (const profile of ['SP8YA', 'S90QY']) {
    for (const language of LANGUAGES) {
      const device = buildDevice(
        gladys,
        { id: 'abc12345-0000', host: '192.168.1.20', state: stateOf(profile) },
        language,
      );
      assert.equal(device.should_poll, false);
      assert.equal(device.poll_frequency, undefined);
      assert.match(device.external_id, /^ext:test-integration:soundbar:abc12345-0000$/);
      for (const feature of device.features) {
        for (const field of ['min', 'max', 'read_only', 'has_feedback']) {
          assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.ok(PAIRS.has(`${feature.category}/${feature.type}`), feature.external_id);
        assert.ok(Object.values(CATEGORIES).includes(feature.category));
        if (feature.unit) assert.ok(Object.values(UNITS).includes(feature.unit));
        assert.ok(feature.name.startsWith(`${device.name} - `), feature.name);
        assert.equal(feature.external_id.startsWith(`${device.external_id}:`), true);
      }
    }
  }
});

test('the SP8YA: assumed power, no audio signal, three levels, a select of 4 inputs', () => {
  const state = stateOf('SP8YA');
  const device = buildDevice(gladys, { id: 'x1234567', host: '192.168.1.20', state }, 'fr');
  assert.equal(device.name, 'LG Speaker SP8YA');
  assert.deepEqual(keysOf(device), [
    'power',
    'volume',
    'mute',
    'source',
    'sound_mode',
    'night_mode',
    'auto_volume',
    'drc',
    'auto_power',
    'woofer_level',
    'rear_level',
    'center_level',
    'top_level',
    'playback',
    'title',
    'artist',
  ]);
  const byKey = Object.fromEntries(device.features.map((f) => [f.external_id.split(':').pop(), f]));
  assert.equal(byKey.power.has_feedback, false, 'no b_powerstatus: assumed');
  assert.deepEqual([byKey.volume.min, byKey.volume.max, byKey.volume.step], [0, 40, 1]);
  assert.deepEqual(
    [byKey.woofer_level.min, byKey.woofer_level.max, byKey.woofer_level.unit],
    [-15, 6, 'decibel'],
  );
  assert.deepEqual(
    byKey.source.supported_options.map((option) => [option.value, option.label]),
    [
      ['func-0', 'Wi-Fi'],
      ['func-1', 'Bluetooth'],
      ['func-15', 'Optique / HDMI ARC'],
      ['func-6', 'HDMI'],
    ],
  );
  assert.equal(byKey.playback.read_only, false, 'b_support_play_ctrl');
  assert.equal(byKey.title.read_only, true);
  assert.deepEqual(device.params, [
    { name: 'LG_SOUNDBAR_HOST', value: '192.168.1.20' },
    { name: 'LG_SOUNDBAR_MODEL', value: 'SP8YA' },
  ]);
});

test('the S90QY: reported power, audio signal; a bare soundbar has power only', () => {
  const s90 = featureSpecs(stateOf('S90QY'), 'en');
  const power = s90.find(([key]) => key === FEATURES.POWER)[1];
  assert.equal(power.has_feedback, true);
  assert.ok(s90.some(([key]) => key === FEATURES.AUDIO_SIGNAL));
  assert.deepEqual(
    featureSpecs(emptyState(), 'en').map(([key]) => key),
    ['power'],
  );
});

test('values: assumed power, unreachable is off, selects as text, levels in dB, no empty text', () => {
  const state = stateOf('SP8YA');
  const entry = { state, online: true, assumedPower: true };
  const values = Object.fromEntries(featureValues(entry));
  assert.equal(values.power, 1);
  assert.equal(values.volume, 7);
  assert.equal(values.mute, 0);
  assert.deepEqual(values.source, { text: 'func-15' }, 'E-ARC shows as the listed equivalent');
  assert.deepEqual(values.sound_mode, { text: 'eq-0' });
  assert.equal(values.woofer_level, 0);
  assert.equal(values.playback, 0, 'used as a soundbar: nothing plays');
  assert.deepEqual(values.title, { text: NO_TEXT });
  assert.equal(Object.fromEntries(featureValues({ ...entry, online: false })).power, 0);
  assert.equal(
    Object.fromEntries(featureValues({ state, online: true, assumedPower: null })).power,
    undefined,
  );
  const s90 = Object.fromEntries(featureValues({ state: stateOf('S90QY'), online: true }));
  assert.equal(s90.power, 1);
  assert.equal(s90.playback, 1);
  assert.match(s90.title.text, /^Sinfonia/);
  assert.deepEqual(s90.audio_signal, { text: 'NO SIGNAL' });
  for (const value of Object.values(s90)) {
    if (typeof value === 'object') assert.ok(value.text.length > 0, 'Gladys drops an empty text');
  }
});

test('names: the name of the LG app, else the model, else the address', () => {
  assert.equal(deviceName({ state: { name: 'LG_Speaker_SP8YA' } }), 'LG Speaker SP8YA');
  assert.equal(deviceName({ state: { name: '', model: 'S95QR' } }), 'LG S95QR');
  assert.equal(deviceName({ state: {}, host: '192.168.1.20' }), 'LG Soundbar 192.168.1.20');
  // The current input is offered even when the soundbar does not list it.
  const state = { func: 17, funcList: [0, 6] };
  assert.deepEqual(
    sourceOptions(state, 'en').map((option) => option.value),
    ['func-0', 'func-6', 'func-17'],
  );
});

test('the fake Gladys accepts the discovered devices and their states', async () => {
  const fake = createFakeGladys();
  await fake.connect();
  const sp8ya = {
    id: 'aaaabbbb-1',
    host: '192.168.1.20',
    state: stateOf('SP8YA'),
    online: true,
    assumedPower: true,
  };
  const s90qy = { id: 'aaaabbbb-2', host: '192.168.1.21', state: stateOf('S90QY'), online: true };
  const devices = [buildDevice(fake, sp8ya, 'de'), buildDevice(fake, s90qy, 'de')];
  await fake.publishDiscoveredDevices(devices);
  assert.equal(fake.fake.discoveredDevices.length, 2);
  for (const entry of [sp8ya, s90qy]) {
    const ids = fake.externalIds('soundbar', entry.id);
    await fake.publishStates(
      featureValues(entry).map(([key, value]) =>
        typeof value === 'object'
          ? { device_feature_external_id: ids.feature(key), text: value.text }
          : { device_feature_external_id: ids.feature(key), state: value },
      ),
    );
  }
  assert.equal(
    fake.fake.lastState('ext:test-integration:soundbar:aaaabbbb-2:audio_signal'),
    'NO SIGNAL',
  );
  await fake.disconnect();
});
