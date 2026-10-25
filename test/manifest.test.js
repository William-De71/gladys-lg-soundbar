import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { TRIGGERS, ACTIONS } from '../src/scenes.js';
import { CONFIG_ACTIONS } from '../src/app.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { DEFAULTS, LANGUAGES } from '../src/config.js';
import { FUNCTIONS, EQUALISERS, optionValue } from '../src/temescal/names.js';
import { MDNS_SERVICES } from '../src/temescal/discovery.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const lock = read('../package-lock.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const REPO = 'William-De71/gladys-lg-soundbar';

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'LG Soundbar');
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(pkg.version, /^0\./);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-lg-soundbar:${pkg.version}`);
  assert.equal(manifest.cover_image, `https://raw.githubusercontent.com/${REPO}/main/cover.jpg`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-lg-soundbar');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the local transport: port 9741 of the soundbar, nothing on the internet', () => {
  assert.deepEqual(manifest.transports, ['local']);
  assert.match(source('../src/temescal/protocol.js'), /PORT = 9741/);
  // Only the client opens sockets; the only HTTP request is the album art,
  // from the address of the soundbar itself.
  for (const file of [
    'devices',
    'commands',
    'scenes',
    'widgets',
    'config',
    'states',
    'i18n',
    'temescal/model',
    'temescal/names',
    'temescal/discovery',
  ]) {
    assert.doesNotMatch(
      source(`../src/${file}.js`),
      /fetch\(|node:https?|node:net|node:dgram/,
      file,
    );
  }
  assert.match(source('../src/devices.js'), /parsed\.hostname === entry\.host/);
  assert.match(source('../src/app.js'), /albumArtUrl\(bar\) === url/, 'music box artwork');
  // A single channel: no transport to publish per device.
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
});

test('the music box needs Gladys 5.3.0; only the mDNS discovery permission', () => {
  // `music` (the music box, artwork served on demand) needs 5.3.0; widgets
  // and scenes 5.1.0.
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.music, {}, 'no catalog, no queue: temescal has none');
  assert.deepEqual(manifest.categories, ['multimedia']);
  assert.deepEqual(
    manifest.network_discovery,
    MDNS_SERVICES.map((service) => ({ type: 'mdns', service })),
  );
  const text = JSON.stringify(manifest);
  assert.doesNotMatch(text, /"source":"houses"/, 'houses need 5.2.0');
  for (const key of [
    'location',
    'network_wake',
    'containers',
    'webhooks',
    'messaging',
    'energy_contracts',
  ]) {
    assert.equal(manifest[key], undefined, `${key} (permission, or a newer Gladys)`);
  }
  // A widget button with a form needs 5.2.0: the buttons are built at
  // runtime (src/widgets.js) and never declare `fields`.
  assert.doesNotMatch(source('../src/widgets.js'), /fields:/);
});

test('the configuration mirrors src/config.js', () => {
  const config = byKey(manifest.config_schema);
  assert.deepEqual(
    [...config.keys()],
    ['intro', 'hosts', 'network_search', 'quiet_start', 'language'],
  );
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(config.get(key).default, value, key);
  }
  assert.equal(config.get('hosts').type, 'string');
  assert.equal(config.get('network_search').type, 'boolean');
  assert.equal(config.get('quiet_start').type, 'boolean');
  assert.deepEqual(values(config.get('language')), LANGUAGES);
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password'].includes(field.type), field.key);
    assert.equal(field.display_if, undefined, `${field.key}: display_if is refused by the store`);
  }
});

test('declares exactly the scene triggers, actions, buttons and widgets the code handles', () => {
  const app = source('../src/app.js');
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key),
    Object.values(TRIGGERS),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key),
    [WIDGET_KEY],
  );
  assert.match(app, /onWidgetGet\(WIDGET_KEY/);
  assert.match(app, /onWidgetAction\(WIDGET_KEY/);
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(CONFIG_ACTIONS),
  );
  assert.match(app, /onAction\(CONFIG_ACTIONS\.SEARCH/);
  // Every trigger field is a key of the event data (the core compares
  // them), and a variable too.
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields ?? []) {
      assert.ok(
        trigger.variables.some((variable) => variable.key === field.key),
        `${trigger.key}.${field.key}`,
      );
      if (field.source) assert.equal(field.source, 'devices');
    }
  }
});

test('the options of the scenes are every input and sound mode the code names', () => {
  const funcs = FUNCTIONS.map((_, index) => optionValue('func', index));
  const eqs = EQUALISERS.map((_, index) => optionValue('eq', index));
  const triggers = byKey(manifest.scene_triggers);
  assert.deepEqual(values(byKey(triggers.get('source_changed').fields).get('source')), funcs);
  assert.deepEqual(values(byKey(triggers.get('sound_mode_changed').fields).get('sound_mode')), eqs);
  const preset = byKey(byKey(manifest.scene_actions).get('apply_sound_preset').fields);
  assert.deepEqual(values(preset.get('source')), funcs);
  assert.deepEqual(values(preset.get('sound_mode')), eqs);
  assert.deepEqual(values(preset.get('night_mode')), ['unchanged', 'on', 'off']);
  for (const field of preset.values()) {
    assert.notEqual(field.required, true, `${field.key}: empty keeps the value`);
  }
  const step = byKey(byKey(manifest.scene_actions).get('change_volume').fields).get('step');
  assert.deepEqual([step.type, step.min, step.max, step.required], ['number', -20, 20, true]);
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.actions.length <= 10);
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20 && manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of manifest.scene_actions) {
    assert.ok(action.fields.length <= 10, `${action.key}: ${action.fields.length} fields`);
    assert.ok(action.outputs.length <= 20, action.key);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
  // 800 x 534: the SOF0/SOF2 marker of the JPEG.
  let offset = 2;
  let size2 = null;
  while (offset < cover.length) {
    const marker = cover.readUInt16BE(offset);
    const length = cover.readUInt16BE(offset + 2);
    if (marker === 0xffc0 || marker === 0xffc2) {
      size2 = [cover.readUInt16BE(offset + 7), cover.readUInt16BE(offset + 5)];
      break;
    }
    offset += 2 + length;
  }
  assert.deepEqual(size2, [800, 534]);
});

test('the catalog description fits 10 to 100 characters in every language', () => {
  for (const language of ['en', 'fr', 'de', 'es']) {
    const length = manifest.description[language].length;
    assert.ok(length >= 10 && length <= 100, `${language}: ${length}`);
  }
});

test('catalog keywords (Gladys 5.3.0), worldwide', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  for (const keyword of keywords) {
    assert.ok(keyword.trim().length >= 2 && keyword.trim().length <= 30, keyword);
  }
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length);
  assert.ok(!normalized.includes(manifest.name.toLowerCase()));
  // LG sells these soundbars worldwide and they talk on the LAN only.
  assert.equal(manifest.countries, undefined);
});
