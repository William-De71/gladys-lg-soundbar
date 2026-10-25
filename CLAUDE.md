# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the **LG Wi-Fi soundbars**
of the LG Sound Bar / Wi-Fi Speaker app: a Node.js service (Node 22+, ESM, no
build step) in its own sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency, and to the soundbars **on the local network
only** (`transports: ["local"]`) over their "temescal" protocol: TCP port
9741, frames `0x10` + 4-byte big-endian length + AES-256-CBC JSON with a
fixed key and IV. `type: "device"`, Gladys 5.3.0+ (music box; widget and
scenes since 5.1.0), manifest `music: {}` (no catalog, no queue),
`network_discovery` mDNS `_lg-smart-device._tcp` and `_googlecast._tcp`.

The protocol is rewritten from [python-temescal](https://github.com/google/python-temescal)
0.5 (Apache 2.0, the library of the Home Assistant `lg_soundbar` integration);
no code copied (see NOTICE). **Never tested with a real soundbar**: the fake
soundbar of the tests is checked against python-temescal itself
(`scripts/check-simulator.sh`).

## Commands

```bash
npm install
npm test                                  # node --test; fake soundbars on 127.0.0.1
node --test test/app.test.js              # one file
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/discovery.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
node scripts/fake-soundbar.mjs 9741 SP8YA # the fake soundbar of the tests, on its own
scripts/check-simulator.sh                # the fake soundbar against python-temescal 0.5 (venv)
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                     SDK wiring only: createApp(gladys) + connect + start
src/app.js                   every handler: start, scan, states, commands, scene events and
                             actions, widget (album art), configuration button, status
src/soundbar.js              one soundbar: connection + state + reachability + full reading,
                             `set` then read back, which changes are the integration's own
src/devices.js               state -> the Gladys device (features from what the model reports), values
src/commands.js              feature commands, presets, relative volume -> `set` messages, bounds
src/scenes.js                trigger / action keys, event data (source, sound mode, track)
src/widgets.js               the soundbar widget (pure, reused by docs/illustrations)
src/states.js                state publication: created devices only, coalesced, 240/min, 429 pause
src/storage.js               /data/soundbars.json (address, model, last state)
src/config.js                hosts, network search, quiet start, language
src/i18n.js                  runtime texts, en / fr / de / es
src/temescal/protocol.js     cipher, frames, incremental decoder (plain JSON too), messages
src/temescal/client.js       one TCP connection kept per soundbar, requests one at a time,
                             silent reconnection, growing retry delay
src/temescal/model.js        messages -> state (fields of real models, garbage strings, levels)
src/temescal/names.js        inputs and sound modes: index -> option value and names
src/temescal/discovery.js    mDNS results, typed addresses
test/helpers/fake-soundbar.js  the fake soundbar (SP8YA and S90QY profiles), real TCP
scripts/check-simulator.sh   python-temescal 0.5 against the fake soundbar
.github/scripts/release.mjs  version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store:
  `ext:<selector>:soundbar:<id>` (id = `s_uuid` of MAC_INFO_DEV / PRODUCT_INFO,
  else `mac-<12 hex>`, else `ip-a-b-c-d`), features `…:<key>` (`power`,
  `volume`, `mute`, `source`, `sound_mode`, `night_mode`, `auto_volume`,
  `drc`, `auto_power`, `woofer_level`, `rear_level`, `center_level`,
  `top_level`, `playback`, `title`, `artist`, `audio_signal`, `music_title`,
  `music_artist`, `music_artwork`, `music_volume`, `music_mute`), the select
  values (`func-<index>`, `eq-<index>`: indexes, never names), feature
  `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema` and `actions`, the widget and its settings, the triggers
  (fields, options, variables), the scene actions (fields, options, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update it to make a test pass
  without a documented migration.
- **Never invent a message or a field**: every `get` / `set` is in
  python-temescal 0.5 or in the Home Assistant integration (`b_powerkey`,
  `i_play_ctrl`). A new one needs its source in a comment and in the fake.
- **The music box** (Gladys 5.3): the player features (`playback` and the
  `music_*` ones, `NOW_PLAYING_FEATURES`) go through `publishNowPlaying`
  (diffed, one batch) on the soundbar's events only, never through
  src/states.js; the old `title` / `artist` texts and the television volume /
  switch mute stay as they were. temescal has play / pause only (no stop,
  next, previous, seek, album, duration, position, shuffle, repeat): never
  publish those. The artwork key is `artworkKey(url)` of the album art URL of
  the soundbar itself; `onMusicGetArtwork` serves it only while it is the
  current album art of a soundbar.
- **Never ask a soundbar anything by itself except** the full reading at
  discovery, at the first connection and after it was unreachable (and never
  with `quiet_start`): a request wakes a soundbar in standby. No polling, no
  heartbeat; `should_poll` stays false. The idle close of the soundbar
  (about 5 minutes) is followed by a silent reconnection.
- **One connection per soundbar**, requests one at a time
  (`SoundbarConnection.request`).
- **Scene events** once per transition pushed by the soundbar, never at the
  first reading, never for the echo of a `set` of the integration
  (`Soundbar.isOwn`: the values just set, 5 seconds), so a scene cannot loop.
- **Power**: reported (`b_powerstatus`, has_feedback) or assumed (last order,
  on when used, off when unreachable). An "off" the soundbar ignores is an
  error to the user, never a silent success.
- **Levels** are offsets from their minimum on the wire: dB = raw + min.
- **No empty text state** (Gladys would drop it): `NO_TEXT`.
- **The album art** is fetched only from the address of the soundbar, checked
  with `validateWidgetImage`, keyed by the hash of its bytes.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `src/temescal/names.js`, `docs/*.md`, README) exists in en, fr, de, es;
  `test/i18n.test.js` checks it. German says "du", Spanish "usted".
- **Widget images.** After any change to the widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
  Budget: 8 components (the tiles give way first), 4 buttons.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network beyond 127.0.0.x.

## Pitfalls

- Answers are `notibyget` / `notibyset` with `result: "ok"`, or
  `"sorry not support"` without `data`; some models never answer a message
  (MEM_MON_DEV, sometimes MAC_INFO_DEV) and some never answer a `set`: the
  message is then read back.
- Strings may be garbage from a reused buffer (`d"MAC_INFO_DEV"}`), MAC
  addresses too (`do@`, zeros): `cleanString`, `cleanMac`.
- `i_curr_func` may be outside `ai_func_list` (E-ARC 20 on an SP8YA listing
  Optical / HDMI ARC 15): `shownFunction` uses the equivalence groups of Home
  Assistant.
- Night mode is `b_night_time` on most models, `b_night_mode` in
  python-temescal.
- Indexes past the tables exist (sound modes 23-26 on S90TY / SG10TY): they
  stay usable as "Sound mode 27".
- python-temescal writes the frame length on one byte; this client writes
  four (the soundbar does).
- Gladys 5.1 / 5.2 show `music/playback_state` as a value; 5.3 as a
  play / pause switch. `playback` keeps `max: 1` (eternal): Gladys 5.3 may
  write 2 (stop), refused with `errorValue`.
- Empty music texts are valid in 5.3 (`''` clears the track); the old text
  features keep `NO_TEXT`.
- `node --test` also runs `test/helpers/`: nothing starts on import.
- The validator of the Gladys core creates `gladys-development.duckdb` in the
  current folder: run it from elsewhere.
- A top-level `const SVG` in `docs/illustrations/render.js` would shadow the
  global of ApexCharts: it is `SVG_NS`.
