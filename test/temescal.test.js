import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecoder, decrypt, encodeFrame, encrypt, HEADER } from '../src/temescal/protocol.js';
import {
  applyMessage,
  cleanMac,
  cleanString,
  cleanUuid,
  emptyState,
  levelOf,
  platformIdOf,
} from '../src/temescal/model.js';
import {
  EQUALISERS,
  FUNCTIONS,
  optionIndex,
  optionLabel,
  optionValue,
  shownFunction,
} from '../src/temescal/names.js';
import { isIpv4, mdnsCandidates, parseHosts } from '../src/temescal/discovery.js';
import { UUID, profileData } from './helpers/fake-soundbar.js';

const stateOf = (profile) => {
  const state = emptyState();
  for (const [msg, data] of Object.entries(profileData(profile))) {
    applyMessage(state, { cmd: 'notibyget', msg, data, result: 'ok' });
  }
  return state;
};

test('the cipher is AES-256-CBC with the fixed key and IV of python-temescal', () => {
  // Reference vector: python-temescal 0.5 `encrypt_packet(json.dumps({"cmd": "get", "msg": "EQ_VIEW_INFO"}))`
  // (scripts/check-simulator.sh checks the library against the fake soundbar).
  const text = '{"cmd": "get", "msg": "EQ_VIEW_INFO"}';
  const reference = Buffer.from(
    '10000000303e44007588dd47d48234ff2cb7a30f8e6b66fd3cac9240205e2922befebe2c6d901913ddeb4c589ea3080417699f5ebf',
    'hex',
  );
  const payload = encrypt(text);
  assert.deepEqual(payload, reference.subarray(5));
  assert.equal(reference.readUInt32BE(1), payload.length);
  assert.equal(decrypt(payload), text);
  assert.throws(() => decrypt(Buffer.alloc(16, 1)));
});

test('a frame is 0x10, a 4-byte big-endian length, then the payload', () => {
  const frame = encodeFrame({ cmd: 'get', msg: 'SPK_LIST_VIEW_INFO' });
  assert.equal(frame[0], HEADER);
  assert.equal(frame.readUInt32BE(1), frame.length - 5);
  assert.deepEqual(JSON.parse(decrypt(frame.subarray(5))), {
    cmd: 'get',
    msg: 'SPK_LIST_VIEW_INFO',
  });
  // Longer than 255 bytes: python-temescal could not send it, the soundbar does.
  const long = encodeFrame({
    cmd: 'set',
    msg: 'SETTING_VIEW_INFO',
    data: { s_user_name: 'x'.repeat(400) },
  });
  assert.ok(long.readUInt32BE(1) > 255);
  assert.equal(createDecoder().push(long).messages[0].data.s_user_name.length, 400);
});

test('the decoder copes with split frames, merged frames, plain JSON and garbage', () => {
  const decoder = createDecoder();
  const a = encodeFrame({ msg: 'A', cmd: 'notibyget', data: { i: 1 } });
  const b = encodeFrame({ msg: 'B', cmd: 'notibyset', data: { i: 2 } });
  const both = Buffer.concat([a, b]);
  let messages = [];
  for (let i = 0; i < both.length; i += 7) {
    messages.push(...decoder.push(both.subarray(i, i + 7)).messages);
  }
  assert.deepEqual(
    messages.map((message) => message.msg),
    ['A', 'B'],
  );
  // Plain JSON (some firmwares), then a frame.
  messages = decoder.push(
    Buffer.concat([Buffer.from('{"msg":"C","cmd":"notibyget"}'), a]),
  ).messages;
  assert.deepEqual(
    messages.map((message) => message.msg),
    ['C', 'A'],
  );
  // A length that is not the protocol: dropped, then the stream goes on.
  const bad = Buffer.from([HEADER, 0xff, 0xff, 0xff, 0xff, 1, 2, 3]);
  const result = decoder.push(bad);
  assert.equal(result.messages.length, 0);
  assert.match(result.errors[0], /invalid frame length/);
  assert.equal(decoder.push(a).messages[0].msg, 'A');
  // A payload that is not a multiple of 16, one that does not decrypt.
  const odd = Buffer.from([HEADER, 0, 0, 0, 3, 1, 2, 3]);
  assert.match(decoder.push(odd).errors[0], /multiple of 16/);
  const wrong = Buffer.concat([Buffer.from([HEADER, 0, 0, 0, 16]), Buffer.alloc(16, 7)]);
  assert.match(decoder.push(wrong).errors[0], /decrypt/);
  assert.deepEqual(decoder.push(Buffer.from('not json')).errors, ['invalid JSON']);
});

test('the SP8YA state: uuid id, garbage MAC ignored, E-ARC outside its list, levels in dB', () => {
  const state = stateOf('SP8YA');
  assert.equal(state.uuid, UUID);
  assert.equal(state.mac, '', 'do@ and d"MAC_INFO_DEV"} are not MAC addresses');
  assert.equal(state.model, 'SP8YA');
  assert.equal(state.name, 'LG_Speaker_SP8YA');
  assert.equal(state.firmware, '2111240');
  assert.deepEqual([state.volume, state.volumeMin, state.volumeMax, state.mute], [7, 0, 40, false]);
  assert.equal(state.power, null, 'no b_powerstatus on this model');
  assert.deepEqual([state.func, state.funcList], [20, [0, 1, 15, 6]]);
  assert.equal(shownFunction(state.func, state.funcList), 15, 'E-ARC shows as Optical / HDMI ARC');
  assert.deepEqual([state.eq, state.nightField, state.night], [0, 'b_night_time', false]);
  assert.deepEqual(state.switches, { auto_volume: false, drc: false, auto_power: true });
  assert.deepEqual(levelOf(state, 'woofer'), { value: 0, min: -15, max: 6 });
  assert.deepEqual(levelOf(state, 'rear'), { value: 0, min: -6, max: 6 });
  assert.deepEqual(levelOf(state, 'center'), { value: 0, min: -6, max: 6 });
  assert.equal(state.play.streamType, 0);
  assert.equal(state.audioSource, null);
  assert.equal(platformIdOf(state, '192.168.1.20'), UUID);
});

test('the S90QY state: power status, audio signal, streaming with a track', () => {
  const state = stateOf('S90QY');
  assert.equal(state.power, true);
  assert.equal(state.audioSource, 'NO SIGNAL');
  assert.equal(state.mac, '825b6530ab8e', 'a real wireless MAC is kept');
  assert.deepEqual(state.eqList, [19, 0, 7, 26, 21, 6, 22, 14, 5, 15, 23, 24, 25]);
  assert.equal(optionLabel('eq', 26, 'fr'), 'Voix claire Pro');
  assert.equal(state.play.streamType, 3);
  assert.equal(state.play.playing, true);
  assert.match(state.play.title, /^Sinfonia Concertante/);
  // Back to the TV: no track any more.
  applyMessage(state, { cmd: 'notibyset', msg: 'PLAY_INFO', data: { i_stream_type: 0 } });
  assert.deepEqual([state.play.title, state.play.artist], ['', '']);
});

test('a message only changes what it carries, and says what changed', () => {
  const state = stateOf('SP8YA');
  const changed = applyMessage(state, {
    cmd: 'notibyset',
    msg: 'SPK_LIST_VIEW_INFO',
    data: { i_vol: 9, i_vol_min: 0, b_mute: false, i_vol_max: 40 },
    result: 'ok',
  });
  assert.deepEqual([...changed], ['volume']);
  assert.deepEqual(state.funcList, [0, 1, 15, 6]);
  assert.equal(
    applyMessage(state, { msg: 'SHARE_AP_INFO', cmd: 'notibyget', result: 'sorry not support' })
      .size,
    0,
  );
  assert.equal(applyMessage(state, { msg: 'EQ_VIEW_INFO', cmd: 'notibyget', data: [] }).size, 0);
  // Night mode on a model without night time.
  const other = emptyState();
  applyMessage(other, { msg: 'SETTING_VIEW_INFO', cmd: 'notibyget', data: { b_night_mode: true } });
  assert.deepEqual([other.nightField, other.night], ['b_night_mode', true]);
  // A level without its range is not a level.
  applyMessage(other, { msg: 'SETTING_VIEW_INFO', cmd: 'notibyget', data: { i_top_level: 3 } });
  assert.equal(levelOf(other, 'top'), null);
});

test('strings, MAC addresses and uuids of the soundbar are made safe', () => {
  assert.equal(cleanString('  Salon\u0007 '), 'Salon');
  assert.equal(cleanString('dyget", "data": {"i_curr_eq": 19'), null);
  assert.equal(cleanString(12), null);
  assert.equal(cleanMac('00:00:00:00:00:00'), '');
  assert.equal(cleanMac('AA-BB-CC-DD-EE-FF'), 'aabbccddeeff');
  assert.equal(cleanUuid('<I removed this>'), '');
  assert.equal(cleanUuid('ABCDEF12-0000'), 'abcdef12-0000');
  const state = emptyState();
  assert.equal(platformIdOf(state, '192.168.1.20'), 'ip-192-168-1-20');
  state.mac = 'aabbccddeeff';
  assert.equal(platformIdOf(state, '192.168.1.20'), 'mac-aabbccddeeff');
});

test('input and sound mode options are their indexes, named in four languages', () => {
  assert.equal(FUNCTIONS.length, 22);
  assert.equal(EQUALISERS.length, 27);
  assert.equal(optionValue('func', 6), 'func-6');
  assert.equal(optionIndex('func', 'func-6'), 6);
  assert.equal(optionIndex('func', '6'), 6);
  assert.equal(optionIndex('func', 'eq-6'), null);
  assert.equal(optionIndex('eq', 'nonsense'), null);
  assert.equal(optionLabel('func', 4, 'fr'), 'Optique');
  assert.equal(optionLabel('func', 6, 'de'), 'HDMI');
  assert.equal(optionLabel('eq', 7, 'es'), 'Cine');
  assert.equal(optionLabel('eq', 40, 'fr'), 'Mode sonore 40');
  assert.equal(optionLabel('func', 30, 'en'), 'Input 30');
  // Equivalent inputs, as in Home Assistant: HDMI 2 shows as HDMI when only HDMI is listed.
  assert.equal(shownFunction(10, [0, 6]), 6);
  assert.equal(shownFunction(17, [0, 6]), 17, 'FM has no equivalent');
  assert.equal(shownFunction(6, null), 6);
});

test('discovery: the IPv4 address of each mDNS answer, the Chromecast labels, typed addresses', () => {
  const candidates = mdnsCandidates([
    {
      name: 'LG-SP8YA',
      host: 'lge-st-c4a-emmc-mt7668.local',
      addresses: ['fe80::1', '192.168.1.20'],
      port: 9741,
      txt: [],
    },
    {
      name: '3a1f…',
      host: 'x.local',
      addresses: ['192.168.1.21'],
      port: 8009,
      txt: ['fn=Salon', 'md=LG S90QY'],
    },
    { name: 'v6 only', addresses: ['fe80::2'] },
    null,
  ]);
  assert.deepEqual(Object.fromEntries(candidates), {
    '192.168.1.20': { name: '', model: '' },
    '192.168.1.21': { name: 'Salon', model: 'LG S90QY' },
  });
  assert.deepEqual(parseHosts('192.168.1.20, 192.168.1.20;10.0.0.300 bar 10.0.0.4'), [
    '192.168.1.20',
    '10.0.0.4',
  ]);
  assert.equal(isIpv4('256.1.1.1'), false);
});
