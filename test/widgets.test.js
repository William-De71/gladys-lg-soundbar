import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BUTTONS, buildSoundbarWidget, powerOf } from '../src/widgets.js';
import { sourceEvent, soundModeEvent, streamName, trackEvent } from '../src/scenes.js';
import { applyMessage, emptyState } from '../src/temescal/model.js';
import { LANGUAGES } from '../src/i18n.js';
import { profileData } from './helpers/fake-soundbar.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const stateOf = (profile) => {
  const state = emptyState();
  for (const [msg, data] of Object.entries(profileData(profile))) {
    applyMessage(state, { cmd: 'notibyget', msg, data, result: 'ok' });
  }
  return state;
};
const entryOf = (profile, extra = {}) => ({
  id: 'abc12345',
  host: '192.168.1.20',
  state: stateOf(profile),
  online: true,
  assumedPower: true,
  lastSeen: 0,
  ...extra,
});
const types = (content) => content.components.map((component) => component.type);

const variants = () => [
  ['no soundbar', { entry: null }],
  [
    'SP8YA, created',
    { entry: entryOf('SP8YA'), deviceId: 'ext:test-integration:soundbar:abc12345' },
  ],
  ['SP8YA, not created', { entry: entryOf('SP8YA') }],
  ['S90QY streaming, album art', { entry: entryOf('S90QY'), imageKey: 'art-0123456789abcdef' }],
  ['S90QY streaming, no art', { entry: entryOf('S90QY'), deviceId: 'ext:x:soundbar:abc' }],
  ['unreachable', { entry: entryOf('SP8YA', { online: false, lastSeen: 1 }), now: 3600000 }],
  [
    'power unknown, muted',
    {
      entry: (() => {
        const e = entryOf('SP8YA', { assumedPower: null });
        e.state.mute = true;
        return e;
      })(),
    },
  ],
];

test('every content passes the validator of the SDK, in every language', () => {
  for (const [name, params] of variants()) {
    for (const language of LANGUAGES) {
      const content = buildSoundbarWidget({ language, now: 0, ...params });
      assert.deepEqual(validateWidgetContent(content), [], `${name} (${language})`);
      assert.ok(content.components.length <= 8, `${name}: ${content.components.length}`);
      const keys = content.components.filter((c) => c.action).map((c) => c.action.key);
      assert.equal(new Set(keys).size, keys.length, 'button keys are unique');
      for (const item of content.components.find((c) => c.type === 'status')?.items ?? []) {
        assert.notEqual(item.value, undefined, `${name}: a status row without value is dropped`);
      }
    }
  }
});

test('the layout: tiles at rest, track and cover while streaming, no remote when unreachable', () => {
  const rest = buildSoundbarWidget({
    entry: entryOf('SP8YA'),
    language: 'fr',
    deviceId: 'ext:x:soundbar:a',
  });
  assert.deepEqual(types(rest), [
    'value',
    'value',
    'status',
    'button',
    'button',
    'button',
    'button',
  ]);
  assert.equal(rest.components[0].device_feature, 'ext:x:soundbar:a:volume', 'a live tile');
  const status = Object.fromEntries(
    rest.components[2].items.map((item) => [item.label, item.value]),
  );
  assert.deepEqual(status, {
    Alimentation: 'Allumée (supposé)',
    Source: 'Optique / HDMI ARC',
    'Mode sonore': 'Standard',
    'Mode nuit': 'Désactivé',
  });
  const streaming = buildSoundbarWidget({
    entry: entryOf('S90QY'),
    language: 'en',
    imageKey: 'art-1',
  });
  assert.deepEqual(types(streaming), [
    'text',
    'text',
    'image',
    'status',
    'button',
    'button',
    'button',
    'button',
  ]);
  assert.equal(streaming.components[1].text, 'Mozarteumorchester Salzburg · Apple AirPlay');
  assert.ok(
    streaming.components[3].items.some((item) => item.label === 'Volume'),
    'volume moved to the status',
  );
  const offline = buildSoundbarWidget({
    entry: entryOf('S90QY', { online: false }),
    language: 'en',
    now: 0,
  });
  assert.deepEqual(types(offline), ['value', 'value', 'status']);
  assert.equal(offline.components.at(-1).items.at(-1).color, 'danger');
});

test('the buttons carry what the handler needs, never a user input', () => {
  const content = buildSoundbarWidget({ entry: entryOf('SP8YA'), language: 'de' });
  const actions = content.components.filter((c) => c.type === 'button').map((c) => c.action);
  assert.deepEqual(
    actions.map((action) => action.key),
    [BUTTONS.VOLUME_DOWN, BUTTONS.VOLUME_UP, BUTTONS.MUTE, BUTTONS.POWER],
  );
  assert.deepEqual(actions[2].params, { soundbar: 'abc12345', mute: true });
  assert.deepEqual(actions[3].params, { soundbar: 'abc12345', on: false });
  assert.deepEqual(powerOf({ online: false, state: { power: true } }), {
    on: false,
    assumed: false,
  });
});

test('scene events are flat, small, and carry exactly the declared variables', () => {
  const triggers = new Map(manifest.scene_triggers.map((trigger) => [trigger.key, trigger]));
  const state = stateOf('S90QY');
  const device = 'ext:test-integration:soundbar:abc12345';
  const events = {
    source_changed: sourceEvent(device, 6, state, 'fr'),
    sound_mode_changed: soundModeEvent(device, 7, state, 'fr'),
    track_changed: trackEvent(device, { title: 'old', artist: '' }, state.play),
    soundbar_offline: { soundbar: device },
    soundbar_online: { soundbar: device },
  };
  for (const [key, data] of Object.entries(events)) {
    assert.ok(data, key);
    assert.deepEqual(
      Object.keys(data).sort(),
      triggers
        .get(key)
        .variables.map((variable) => variable.key)
        .sort(),
      key,
    );
    assert.ok(Object.keys(data).length <= 30);
    for (const value of Object.values(data)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value) || value === null, key);
      if (typeof value === 'string') assert.ok(value.length <= 1000);
    }
  }
  assert.deepEqual(events.source_changed, {
    soundbar: device,
    source: 'func-0',
    source_name: 'Wi-Fi',
    previous_source_name: 'HDMI',
  });
  assert.equal(events.sound_mode_changed.previous_sound_mode_name, 'Cinéma');
  assert.equal(events.track_changed.stream, 'Apple AirPlay');
});

test('no event without a real transition', () => {
  const state = stateOf('SP8YA');
  const device = 'd';
  assert.equal(sourceEvent(device, null, state, 'en'), null, 'first reading');
  assert.equal(sourceEvent(device, 7, state, 'en'), null, 'ARC to E-ARC: the same listed input');
  assert.equal(soundModeEvent(device, 0, state, 'en'), null);
  assert.equal(trackEvent(device, null, state.play), null, 'used as a soundbar');
  const s90 = stateOf('S90QY');
  assert.equal(trackEvent(device, { ...s90.play }, s90.play), null, 'same track');
  assert.equal(streamName(0), '');
  assert.equal(streamName(4), 'Spotify Connect');
});
