// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and to the fake soundbars of the tests (real local TCP servers speaking
// temescal). Two cards of the "soundbar" widget:
//   rest        an SP8YA used with the TV (E-ARC), night mode on, a subwoofer
//               turned down a little;
//   streaming   an S90QY playing music sent over AirPlay, with a cover.
// Never real data. The cover is a picture drawn by render.sh (art.png).
// Written as JSON for render.js: node gen.mjs <repo> <out.json> <art.png>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out, artPath] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { memoryStorage } = await load('src/storage.js');
const { LANGUAGES } = await load('src/i18n.js');
const { createFakeSoundbar } = await load('test/helpers/fake-soundbar.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const art = readFileSync(artPath);
const silent = { info() {}, warn() {}, error() {}, debug() {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const UNITS = { decibel: 'dB' };

/**
 * @description One card: a fake soundbar, the app, the widget content in
 * every language (device-bound tiles filled in as the core does).
 * @param {string} profile - SP8YA or S90QY.
 * @param {Function} prepare - `(fake) => void`, the state of the fake.
 * @returns {Promise<object>} `{ contents: { lang: content }, images }`.
 */
async function card(profile, prepare) {
  const fake = createFakeSoundbar({ profile });
  prepare(fake);
  await fake.start();
  const gladys = createFakeGladys({ config: { hosts: '127.0.0.1', network_search: false } });
  const app = createApp(gladys, {
    storage: memoryStorage(),
    port: fake.port,
    logger: silent,
    fetchImage: async () => art,
  });
  await gladys.connect();
  await app.start();
  const [device] = gladys.fake.discoveredDevices;
  await gladys.fake.deviceCreated(structuredClone(device));
  await sleep(1500);
  const contents = {};
  const images = {};
  for (const language of LANGUAGES) {
    const { content } = (await gladys.fake.widgetGet('soundbar', { settings: {}, language })).data;
    for (const component of content.components) {
      if (component.device_feature) {
        const feature = device.features.find(
          (item) => item.external_id === component.device_feature,
        );
        component.value = gladys.fake.lastState(component.device_feature);
        if (feature?.unit) component.unit = UNITS[feature.unit] ?? feature.unit;
        delete component.device_feature;
      }
      if (component.type === 'image') {
        const { image } = (await gladys.fake.widgetGetImage(component.key)).data;
        images[component.key] = `data:image/png;base64,${image}`;
      }
    }
    contents[language] = content;
  }
  await app.stop();
  await gladys.fake.shutdown();
  await fake.stop();
  return { contents, images };
}

const rest = await card('SP8YA', (fake) => {
  fake.data.SPK_LIST_VIEW_INFO.i_vol = 14;
  fake.data.SETTING_VIEW_INFO.b_night_time = true;
  fake.data.SETTING_VIEW_INFO.i_woofer_level = 12;
  fake.data.EQ_VIEW_INFO.i_curr_eq = 7;
  fake.data.SETTING_VIEW_INFO.i_curr_eq = 7;
  fake.data.SPK_LIST_VIEW_INFO.s_user_name = 'Salon';
  fake.data.SETTING_VIEW_INFO.s_user_name = 'Salon';
});
const streaming = await card('S90QY', (fake) => {
  fake.data.SPK_LIST_VIEW_INFO.i_vol = 22;
  fake.data.SPK_LIST_VIEW_INFO.s_audio_source = 'PCM';
  fake.data.SPK_LIST_VIEW_INFO.s_user_name = 'Chambre';
  fake.data.SETTING_VIEW_INFO.s_user_name = 'Chambre';
  fake.data.EQ_VIEW_INFO.i_curr_eq = 6;
  fake.data.SETTING_VIEW_INFO.i_curr_eq = 6;
  fake.data.SETTING_VIEW_INFO.b_night_time = false;
  fake.data.PLAY_INFO.s_title = 'Clair de lune';
  fake.data.PLAY_INFO.s_artist = 'Claude Debussy';
  fake.data.PLAY_INFO.s_albumart = 'http://127.0.0.1:7000/artwork?hash=2808963605';
});
const widget = manifest.widgets.find((item) => item.key === 'soundbar');
const contents = Object.fromEntries(
  LANGUAGES.map((language) => [
    language,
    { rest: rest.contents[language], streaming: streaming.contents[language] },
  ]),
);
writeFileSync(
  out,
  JSON.stringify({
    contents,
    images: { ...rest.images, ...streaming.images },
    cards: {
      rest: { icon: widget.icon, label: widget.label },
      streaming: { icon: widget.icon, label: widget.label },
    },
  }),
);
