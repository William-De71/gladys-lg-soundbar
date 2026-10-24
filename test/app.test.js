// The integration end to end: the real app, the fake Gladys of the SDK and
// the fake soundbar on a real TCP socket of 127.0.0.1 (test/helpers/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createApp, STORAGE_FILE } from '../src/app.js';
import { memoryStorage } from '../src/storage.js';
import { MSG } from '../src/temescal/protocol.js';
import { createFakeSoundbar, UUID } from './helpers/fake-soundbar.js';

const FAST = {
  reconnectMinMs: 20,
  reconnectMaxMs: 100,
  requestTimeoutMs: 300,
  connectTimeoutMs: 300,
};
const DEVICE = `ext:test-integration:soundbar:${UUID}`;
const feature = (key) => `${DEVICE}:${key}`;
// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const until = async (condition, timeoutMs = 3000) => {
  const end = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(t, options = {}) {
  const fake =
    options.fake ??
    createFakeSoundbar({ profile: options.profile, ...(options.fakeOptions ?? {}) });
  if (!options.fake) await fake.start();
  const gladys = createFakeGladys({
    config: {
      hosts: '127.0.0.1',
      network_search: false,
      language: 'en',
      ...(options.config ?? {}),
    },
    devices: options.devices ?? [],
    scanResults: options.scanResults ?? {},
  });
  const storage = options.storage ?? memoryStorage();
  let clock = Date.now();
  const app = createApp(gladys, {
    storage,
    port: fake.port,
    connectionOptions: FAST,
    probeMs: 1000,
    commandConnectMs: 300,
    offlineMs: options.offlineMs ?? 200,
    scanSeconds: 1,
    now: () => clock,
    fetchImage: options.fetchImage,
  });
  await gladys.connect();
  await app.start();
  const context = {
    fake,
    gladys,
    app,
    storage,
    advance: (ms) => {
      clock += ms;
    },
  };
  t.after(async () => {
    await app.stop();
    await gladys.disconnect();
    await fake.stop();
  });
  return context;
}

const create = async ({ gladys }) => {
  const [device] = gladys.fake.discoveredDevices;
  await gladys.fake.deviceCreated(device);
  return device;
};
const gets = (fake) => fake.received.filter((message) => message.cmd === 'get');
const events = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('a typed address: found, read once, published with its uuid and the features it reports', async (t) => {
  const { fake, gladys, app, storage } = await setup(t);
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, DEVICE);
  assert.equal(device.name, 'LG Speaker SP8YA');
  assert.equal(device.features.length, 16);
  assert.deepEqual(
    gets(fake).map((message) => message.msg),
    [
      MSG.SPEAKER,
      MSG.MAC,
      MSG.PRODUCT,
      MSG.FUNCTION,
      MSG.EQUALISER,
      MSG.SETTINGS,
      MSG.PLAY,
      MSG.UPDATE,
    ],
  );
  assert.equal(fake.open, 1, 'one connection, kept');
  await app.stop();
  assert.equal(storage.files[STORAGE_FILE][UUID].host, '127.0.0.1');
  assert.equal(storage.files[STORAGE_FILE][UUID].state.model, 'SP8YA');
});

test('a created device gets its states; remote changes are published and fire the scene triggers', async (t) => {
  const context = await setup(t);
  const { fake, gladys } = context;
  await create(context);
  await until(() => gladys.fake.lastState(feature('volume')) === 7);
  assert.equal(gladys.fake.lastState(feature('source')), 'func-15');
  assert.equal(gladys.fake.lastState(feature('power')), 1, 'assumed on while it answers');
  fake.remote(MSG.FUNCTION, { i_curr_func: 6 });
  fake.remote(MSG.EQUALISER, { i_curr_eq: 7 });
  fake.remote(MSG.SPEAKER, { i_vol: 11 });
  await until(() => gladys.fake.lastState(feature('volume')) === 11);
  assert.equal(gladys.fake.lastState(feature('source')), 'func-6');
  assert.equal(gladys.fake.lastState(feature('sound_mode')), 'eq-7');
  assert.deepEqual(events(gladys, 'source_changed')[0].data, {
    soundbar: DEVICE,
    source: 'func-6',
    source_name: 'HDMI',
    previous_source_name: 'Optical / HDMI ARC',
  });
  assert.equal(events(gladys, 'sound_mode_changed')[0].data.sound_mode_name, 'Cinema');
});

test('commands from Gladys: bounded, read back, never a scene event', async (t) => {
  const context = await setup(t);
  const { fake, gladys } = context;
  const device = await create(context);
  const volume = device.features.find((f) => f.external_id === feature('volume'));
  const ack = await gladys.fake.setValue(device, volume, 99);
  assert.equal(ack.success, true);
  assert.deepEqual(fake.sets().at(-1).data, { i_vol: 40 });
  await until(() => gladys.fake.lastState(feature('volume')) === 40);
  const source = device.features.find((f) => f.external_id === feature('source'));
  assert.equal((await gladys.fake.setValue(device, source, 'func-6')).success, true);
  const woofer = device.features.find((f) => f.external_id === feature('woofer_level'));
  assert.equal((await gladys.fake.setValue(device, woofer, -3)).success, true);
  assert.deepEqual(fake.sets().at(-1).data, { i_woofer_level: 12 });
  await until(() => gladys.fake.lastState(feature('woofer_level')) === -3);
  await sleep(50);
  assert.equal(events(gladys, 'source_changed').length, 0, 'a change made by Gladys is no event');
  const refused = await gladys.fake.setValue(device, source, 'func-11');
  assert.equal(refused.success, false);
  assert.match(refused.error, /does not offer this input/);
});

test('power without a power status: assumed from the orders and from the use', async (t) => {
  const context = await setup(t);
  const { fake, gladys } = context;
  const device = await create(context);
  const power = device.features.find((f) => f.external_id === feature('power'));
  assert.equal((await gladys.fake.setValue(device, power, 0)).success, true);
  assert.deepEqual(fake.sets().at(-1).data, { b_powerkey: false });
  await until(() => gladys.fake.lastState(feature('power')) === 0);
  fake.remote(MSG.SPEAKER, { i_vol: 9 });
  await until(() => gladys.fake.lastState(feature('power')) === 1, 3000);
});

test('power with a power status: an ignored "off" is reported, the real state kept', async (t) => {
  const context = await setup(t, {
    profile: 'S90QY',
    fakeOptions: { ignoresOff: true },
    config: { language: 'fr' },
  });
  const { fake, gladys } = context;
  const device = await create(context);
  const power = device.features.find((f) => f.external_id.endsWith(':power'));
  assert.equal(power.has_feedback, true);
  const ack = await gladys.fake.setValue(device, power, 0);
  assert.equal(ack.success, false);
  assert.match(ack.error, /restée allumée/);
  await until(() => gladys.fake.lastState(power.external_id) === 1);
  fake.remote(MSG.SPEAKER, { b_powerkey: true });
});

test('the idle connection closed by the soundbar is reopened silently', async (t) => {
  const { fake } = await setup(t);
  const before = fake.received.length;
  fake.dropConnections();
  await until(() => fake.connections === 2 && fake.open === 1);
  await sleep(100);
  assert.equal(fake.received.length, before, 'asking would wake the soundbar');
});

test('a restart publishes the stored soundbar; quiet start never asks it anything', async (t) => {
  const fake = createFakeSoundbar();
  await fake.start();
  const first = await setup(t, { fake });
  await first.app.stop();
  const stored = first.storage.files[STORAGE_FILE];
  const before = fake.received.length;
  const quiet = await setup(t, {
    fake,
    config: { hosts: '', quiet_start: true },
    storage: memoryStorage({ [STORAGE_FILE]: stored }),
  });
  assert.equal(quiet.gladys.fake.discoveredDevices[0].external_id, DEVICE);
  await until(() => fake.open >= 1);
  await sleep(100);
  assert.equal(fake.received.length, before, 'quiet start: no request');
  await quiet.app.stop();
  const loud = await setup(t, {
    fake,
    config: { hosts: '' },
    storage: memoryStorage({ [STORAGE_FILE]: stored }),
  });
  await until(() => gets(fake).length >= before / 1 + 8);
  assert.equal(loud.gladys.fake.discoveredDevices.length, 1);
});

test('unreachable: off, an event, the status; back: an event and a new reading', async (t) => {
  const context = await setup(t);
  const { fake, gladys } = context;
  await create(context);
  const port = fake.port;
  await fake.stop();
  await until(() => events(gladys, 'soundbar_offline').length === 1);
  await until(() => gladys.fake.lastState(feature('power')) === 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /LG Speaker SP8YA/);
  const readsBefore = gets(fake).length;
  context.advance(3 * 60 * 1000);
  await fake.start(port);
  await until(() => events(gladys, 'soundbar_online').length === 1);
  await until(() => gladys.fake.connectionStatus.connected === true);
  await until(() => gets(fake).length >= readsBefore + 8, 3000);
});

test('mDNS discovery through Gladys, and the search button', async (t) => {
  const context = await setup(t, {
    config: { hosts: '', network_search: true, language: 'de' },
    scanResults: {
      mdns: [{ name: 'x', host: 'lge.local', addresses: ['127.0.0.1'], port: 9741, txt: [] }],
    },
  });
  const { gladys } = context;
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices[0].external_id, DEVICE);
  assert.equal(gladys.fake.scans.at(-1).type, 'mdns');
  const ack = await gladys.fake.action('search', {});
  assert.equal(ack.success, true);
  assert.match(
    ack.data.message.fr,
    /^1 barre\(s\) de son : LG Speaker SP8YA \(127\.0\.0\.1, SP8YA, connectée\)/,
  );
  assert.deepEqual(Object.keys(ack.data.message).sort(), ['de', 'en', 'es', 'fr']);
});

test('the search tells when nothing answers', async (t) => {
  const fake = createFakeSoundbar();
  await fake.start();
  const port = fake.port;
  await fake.stop();
  const context = await setup(t, {
    fake: { port, stop: async () => {}, start: async () => {} },
    config: { hosts: '' },
  });
  const ack = await context.gladys.fake.action('search', {});
  assert.match(ack.data.message.en, /No soundbar answered on port 9741/);
});

test('scene actions: a preset in order with its outputs, a relative volume', async (t) => {
  const context = await setup(t);
  const { fake, gladys } = context;
  await create(context);
  const ack = await gladys.fake.sceneAction('apply_sound_preset', {
    soundbar: DEVICE,
    source: 'func-6',
    sound_mode: 'eq-7',
    night_mode: 'on',
    volume: 15,
  });
  assert.equal(ack.success, true);
  assert.deepEqual(
    fake.sets().map((message) => Object.keys(message.data)[0]),
    ['i_curr_func', 'i_curr_eq', 'b_night_time', 'i_vol'],
  );
  assert.deepEqual(ack.data.outputs, {
    volume: 15,
    source_name: 'HDMI',
    sound_mode_name: 'Cinema',
  });
  const step = await gladys.fake.sceneAction('change_volume', { step: -5 });
  assert.deepEqual(step.data.outputs, { volume: 10 });
  const empty = await gladys.fake.sceneAction('apply_sound_preset', { night_mode: 'unchanged' });
  assert.equal(empty.success, false);
  await sleep(50);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'never an event from a scene action');
});

test('the widget: valid content, buttons that act, the album art of the soundbar only', async (t) => {
  const fetched = [];
  const context = await setup(t, {
    profile: 'S90QY',
    fetchImage: async (url) => {
      fetched.push(url);
      return PNG;
    },
  });
  const { fake, gladys } = context;
  await create(context);
  fake.remote(MSG.PLAY, { s_albumart: 'http://127.0.0.1:7000/artwork?hash=1', s_title: 'Other' });
  await until(
    () => gladys.fake.lastState(`ext:test-integration:soundbar:${UUID}:title`) === 'Other',
  );
  const ack = await gladys.fake.widgetGet('soundbar', { settings: {}, language: 'fr' });
  assert.equal(ack.success, true);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const image = ack.data.content.components.find((component) => component.type === 'image');
  assert.match(image.key, /^art-[0-9a-f]{16}$/);
  assert.equal((await gladys.fake.widgetGetImage(image.key)).data.image, PNG.toString('base64'));
  assert.deepEqual(fetched, ['http://127.0.0.1:7000/artwork?hash=1']);
  // Elsewhere than the soundbar: never fetched.
  fake.remote(MSG.PLAY, { s_albumart: 'http://192.0.2.1/x.jpg', s_title: 'Third' });
  await until(
    () => gladys.fake.lastState(`ext:test-integration:soundbar:${UUID}:title`) === 'Third',
  );
  const second = await gladys.fake.widgetGet('soundbar', {
    settings: { soundbar: DEVICE },
    language: 'en',
  });
  assert.equal(
    second.data.content.components.some((component) => component.type === 'image'),
    false,
  );
  assert.equal(fetched.length, 1);
  // Buttons.
  const up = await gladys.fake.widgetAction(
    'soundbar',
    'volume_up',
    { soundbar: UUID },
    { settings: {} },
  );
  assert.equal(up.data.message.en, 'Volume 6');
  const mute = await gladys.fake.widgetAction(
    'soundbar',
    'mute',
    { soundbar: UUID, mute: true },
    {},
  );
  assert.equal(mute.data.message.fr, 'Son coupé');
  const unknown = await gladys.fake.widgetAction('soundbar', 'mute', { soundbar: 'nope' }, {});
  assert.match(unknown.data.message.en, /Unknown soundbar/);
  assert.ok(gladys.fake.widgetRefreshes.includes('soundbar'));
});

test('a refusal and an unreachable soundbar give a readable error', async (t) => {
  const context = await setup(t);
  const { fake, gladys } = context;
  const device = await create(context);
  fake.refuse.add(MSG.SETTINGS);
  const drc = device.features.find((f) => f.external_id === feature('drc'));
  const refused = await gladys.fake.setValue(device, drc, 1);
  assert.match(refused.error, /refused the command/);
  fake.refuse.clear();
  await fake.stop();
  await sleep(50);
  const unreachable = await gladys.fake.setValue(device, drc, 1);
  assert.match(unreachable.error, /does not answer on port 9741/);
});

test('a device created in Gladys is followed after a restart, even without /data', async (t) => {
  const fake = createFakeSoundbar();
  await fake.start();
  const context = await setup(t, {
    fake,
    config: { hosts: '' },
    devices: [
      {
        external_id: DEVICE,
        name: 'Salon',
        params: [{ name: 'LG_SOUNDBAR_HOST', value: '127.0.0.1' }],
        features: [],
      },
    ],
  });
  await until(() => context.gladys.fake.lastState(feature('volume')) === 7);
  // Published again once read (a few seconds later, grouped).
  await until(() => context.gladys.fake.discoveredDevices.length === 1, 4000);
  assert.equal(context.gladys.fake.discoveredDevices[0].external_id, DEVICE);
});
