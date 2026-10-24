// -----------------------------------------------------------------------------
// A fake LG soundbar: a real TCP server on 127.0.0.1 speaking temescal, the
// encrypted framing included. scripts/check-simulator.sh checks it against
// python-temescal 0.5 (the library of Home Assistant): if the reference
// library reads and changes it, the framing and the cipher of the
// integration, tested against it, are right.
//
// Its data are the answers of real soundbars (captures of
// albaintor/integration-lgsoundbar for an SP8YA and an S90QY, Home Assistant
// issues), anonymized. Two profiles:
//   - 'SP8YA' (2021): no power status, night time, garbage MAC addresses,
//     E-ARC current input outside its input list, used as a soundbar;
//   - 'S90QY' (2022): power status, audio signal, streaming over AirPlay.
//
// Behaviours a test can turn on: a message never answered (`silent`), a
// refusal (`refuse`, "sorry not support"), power off ignored (`ignoresOff`,
// SP11RA in Home Assistant issue #152742), plain JSON answers (`plaintext`),
// no answer to a `set` (`quietSets`), several frames in one TCP segment or a
// frame split in two (`chunking`).
//
// Nothing starts on import (node --test also runs this folder).
// -----------------------------------------------------------------------------

import { createServer } from 'node:net';
import { createDecoder, encodeFrame } from '../../src/temescal/protocol.js';

export const UUID = '3a1f9c2e-77b0-4c1d-9e8a-1b2c3d4e5f60';

/**
 * @description The data of a profile.
 * @param {'SP8YA'|'S90QY'} profile - The model.
 * @returns {object} msg -> data.
 */
export function profileData(profile = 'SP8YA') {
  if (profile === 'S90QY') {
    return {
      SPK_LIST_VIEW_INFO: {
        i_vol: 5,
        i_vol_min: 0,
        i_vol_max: 100,
        i_curr_func: 0,
        b_mute: false,
        b_support_avsmrm: true,
        b_spotify_connect: false,
        b_soundbarmode: false,
        i_year: 22,
        b_update: false,
        b_powerstatus: true,
        s_user_name: 'Chambre LG S90QY',
        s_audio_source: 'NO SIGNAL',
      },
      FUNC_VIEW_INFO: {
        b_connect: true,
        i_curr_func: 0,
        s_bt_name: 'd',
        s_spk_bt_name: 'dyget", "data": {"i_curr_eq": 19',
        ai_func_list: [0, 1, 15, 6, 19],
      },
      EQ_VIEW_INFO: {
        i_curr_eq: 19,
        i_bass: 5,
        i_treble: 5,
        ai_eq_list: [19, 0, 7, 26, 21, 6, 22, 14, 5, 15, 23, 24, 25],
      },
      SETTING_VIEW_INFO: {
        b_drc: false,
        b_auto_vol: false,
        b_auto_power: true,
        b_tv_remote: true,
        b_night_time: true,
        b_rear: false,
        b_neuralx: false,
        b_nighttime_enable: true,
        i_av_sync: 0,
        i_woofer_level: 15,
        i_woofer_min: -15,
        i_woofer_max: 6,
        i_rear_level: 6,
        i_rear_min: -6,
        i_rear_max: 6,
        i_top_level: 6,
        i_top_min: -6,
        i_top_max: 6,
        i_center_level: 6,
        i_center_min: -6,
        i_center_max: 6,
        i_curr_eq: 19,
        s_user_name: 'Chambre LG S90QY',
        s_ipv4_addr: '127.0.0.1',
      },
      PLAY_INFO: {
        b_support_play_ctrl: true,
        i_play_ctrl: 0,
        i_position: -1,
        i_stream_type: 3,
        i_duration: -1,
        s_title: 'Sinfonia Concertante in E-Flat Major, KV 364: III. Presto',
        s_artist: 'Mozarteumorchester Salzburg',
        s_albumart: '',
      },
      PRODUCT_INFO: { i_model_type: 0, i_network_type: 1, i_model_no: 0, s_model_name: 'S90QY' },
      MAC_INFO_DEV: {
        s_wired_mac: '00:00:00:00:00:00',
        s_wireless_mac: '82:5B:65:30:AB:8E',
        s_bt_mac: '00:00:00:00:00:00',
        s_uuid: UUID,
      },
      UPDATE_VIEW_INFO: {
        o_system_ver: { s_main: '2203090', s_c4a: '1.56.500000' },
        b_update: false,
        i_progress: 0,
      },
    };
  }
  return {
    SPK_LIST_VIEW_INFO: {
      i_vol: 7,
      i_vol_min: 0,
      i_vol_max: 40,
      b_mute: false,
      i_curr_func: 20,
      b_support_avsmrm: true,
      b_spotify_connect: false,
      b_soundbarmode: false,
      b_func_pictogram: true,
      b_update: false,
      s_user_name: 'LG_Speaker_SP8YA',
    },
    FUNC_VIEW_INFO: {
      i_curr_func: 20,
      b_connect: true,
      ai_func_list: [0, 1, 15, 6],
      s_spk_bt_name: 'LG_Speaker_SP8YA',
    },
    EQ_VIEW_INFO: {
      i_curr_eq: 0,
      i_bass: 5,
      i_treble: 5,
      ai_eq_list: [19, 0, 6, 7, 20, 21, 22, 14, 5, 15, 23],
    },
    SETTING_VIEW_INFO: {
      b_neuralx: false,
      i_av_sync: 0,
      b_night_time: false,
      i_woofer_min: -15,
      b_nighttime_enable: true,
      b_drc: false,
      s_user_name: 'LG_Speaker_SP8YA',
      b_auto_vol: false,
      b_auto_power: true,
      b_tv_remote: true,
      b_rear: false,
      i_center_level: 6,
      i_rear_max: 6,
      i_woofer_max: 6,
      i_woofer_level: 15,
      i_rear_level: 6,
      i_top_min: -6,
      i_rear_min: -6,
      i_top_level: 6,
      i_top_max: 6,
      i_center_min: -6,
      i_center_max: 6,
      i_curr_eq: 0,
      s_ipv4_addr: '127.0.0.1',
    },
    PLAY_INFO: {
      i_duration: 0,
      b_support_play_ctrl: true,
      i_play_ctrl: 0,
      i_position: 0,
      i_stream_type: 0,
    },
    PRODUCT_INFO: { i_model_type: 0, i_network_type: 1, i_model_no: 0, s_model_name: 'SP8YA' },
    MAC_INFO_DEV: {
      s_wired_mac: 'do@',
      s_wireless_mac: 'd"MAC_INFO_DEV"}',
      s_bt_mac: '00:00:00:00:00:00',
      s_uuid: UUID,
    },
    UPDATE_VIEW_INFO: {
      o_system_ver: { s_main: '2111240', s_c4a: '1.52.246654', s_micom: '2109071' },
      b_update: false,
      i_progress: 0,
      s_region: 'do',
      o_server_ver: {},
    },
  };
}

/**
 * @description Create the fake soundbar (not started).
 * @param {object} [options] - Options.
 * @param {'SP8YA'|'S90QY'} [options.profile] - The model.
 * @param {string[]} [options.silent] - Messages never answered.
 * @param {string[]} [options.refuse] - Messages answered "sorry not support".
 * @param {boolean} [options.ignoresOff] - Power off is ignored.
 * @param {boolean} [options.plaintext] - Answers in plain JSON.
 * @param {boolean} [options.quietSets] - Never answers a `set`.
 * @param {boolean} [options.chunking] - Splits and merges the frames.
 * @returns {object} The fake soundbar.
 */
export function createFakeSoundbar(options = {}) {
  const data = profileData(options.profile ?? 'SP8YA');
  const silent = new Set(options.silent ?? []);
  const refuse = new Set(options.refuse ?? []);
  const sockets = new Set();
  const received = [];
  let server = null;
  let port = 0;
  let connections = 0;

  const encode = (message) =>
    options.plaintext ? Buffer.from(JSON.stringify(message)) : encodeFrame(message);

  const send = (socket, message) => {
    const frame = encode(message);
    if (options.chunking && frame.length > 8) {
      socket.write(frame.subarray(0, 7));
      setTimeout(() => socket.writable && socket.write(frame.subarray(7)), 5);
    } else {
      socket.write(frame);
    }
  };

  const broadcast = (message) => sockets.forEach((socket) => send(socket, message));

  // What a set changes, and what the soundbar sends back.
  const applySet = (msg, fields) => {
    const changed = {};
    const target = data[msg];
    if (!target) {
      return null;
    }
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (msg === 'SPK_LIST_VIEW_INFO' && key === 'b_powerkey') {
        if (value === false && options.ignoresOff) {
          continue;
        }
        if ('b_powerstatus' in target) {
          target.b_powerstatus = value;
          changed.b_powerstatus = value;
        }
        continue;
      }
      if (msg === 'SPK_LIST_VIEW_INFO' && key === 'i_vol') {
        const volume = Math.max(target.i_vol_min, Math.min(target.i_vol_max, value));
        target.i_vol = volume;
        Object.assign(changed, {
          i_vol: volume,
          i_vol_min: target.i_vol_min,
          b_mute: target.b_mute,
          i_vol_max: target.i_vol_max,
        });
        continue;
      }
      if (msg === 'SETTING_VIEW_INFO' && key === 'b_night_mode' && 'b_night_time' in target) {
        target.b_night_time = value;
        changed.b_night_time = value;
        continue;
      }
      if (msg === 'PLAY_INFO' && key === 'i_play_ctrl') {
        target.i_play_ctrl = value;
        changed.i_play_ctrl = value;
        continue;
      }
      target[key] = value;
      changed[key] = value;
    }
    if ('i_curr_func' in changed) {
      data.SPK_LIST_VIEW_INFO.i_curr_func = changed.i_curr_func;
      data.FUNC_VIEW_INFO.i_curr_func = changed.i_curr_func;
    }
    if ('i_curr_eq' in changed) {
      data.EQ_VIEW_INFO.i_curr_eq = changed.i_curr_eq;
      data.SETTING_VIEW_INFO.i_curr_eq = changed.i_curr_eq;
    }
    return changed;
  };

  const onMessage = (socket, message) => {
    received.push(message);
    const { cmd, msg } = message;
    if (silent.has(msg)) {
      return;
    }
    if (refuse.has(msg) || !data[msg]) {
      send(socket, { msg, cmd: `notiby${cmd}`, result: 'sorry not support' });
      return;
    }
    if (cmd === 'get') {
      send(socket, { msg, cmd: 'notibyget', data: structuredClone(data[msg]), result: 'ok' });
      return;
    }
    if (cmd === 'set') {
      const changed = applySet(msg, message.data);
      if (!options.quietSets) {
        // Every connected client hears the change, like the app would.
        broadcast({ msg, cmd: 'notibyset', data: changed, result: 'ok' });
      }
    }
  };

  const fake = {
    data,
    received,
    silent,
    refuse,
    get port() {
      return port;
    },
    get connections() {
      return connections;
    },
    get open() {
      return sockets.size;
    },

    /**
     * @param {number} [wanted] - Port (0: any free one).
     * @param {string} [host] - Loopback address (127.0.0.2 for a second soundbar on the same port).
     * @returns {Promise<number>} The port.
     */
    async start(wanted = 0, host = '127.0.0.1') {
      server = createServer((socket) => {
        connections += 1;
        sockets.add(socket);
        const decoder = createDecoder();
        socket.on('data', (chunk) => {
          decoder.push(chunk).messages.forEach((message) => onMessage(socket, message));
        });
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));
      });
      await new Promise((resolve) => server.listen(wanted, host, resolve));
      port = server.address().port;
      return port;
    },

    /** Close the server and every connection (power cut). */
    async stop() {
      sockets.forEach((socket) => socket.destroy());
      sockets.clear();
      if (server) {
        await new Promise((resolve) => server.close(() => resolve()));
        server = null;
      }
    },

    /** Close the open connections, like the soundbar after 5 idle minutes. */
    dropConnections() {
      sockets.forEach((socket) => socket.end());
    },

    /**
     * @description A change made with the remote: applied, then pushed.
     * @param {string} msg - The message.
     * @param {object} fields - The changed fields.
     */
    remote(msg, fields) {
      const changed = applySet(msg, fields);
      broadcast({ msg, cmd: 'notibyset', data: changed, result: 'ok' });
    },

    /**
     * @description Push raw bytes to every client (garbage tests).
     * @param {Buffer} bytes - The bytes.
     */
    pushRaw(bytes) {
      sockets.forEach((socket) => socket.write(bytes));
    },

    /** @returns {object[]} The `set` messages received. */
    sets: () => received.filter((message) => message.cmd === 'set'),
  };
  return fake;
}
