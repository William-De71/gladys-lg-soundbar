// -----------------------------------------------------------------------------
// The "temescal" wire format of the LG Wi-Fi soundbars (the protocol of the
// LG Sound Bar / Wi-Fi Speaker app), TCP port 9741.
//
// Rewritten from python-temescal (Google LLC, Apache License 2.0,
// https://github.com/google/python-temescal, version 0.5 on PyPI): no code
// copied, see NOTICE.
//
//   frame   = 0x10, payload length (4 bytes, big endian), payload
//   payload = AES-256-CBC of the JSON message, PKCS#7 padding, with the fixed
//             key and IV every client of the protocol uses
//   message = { cmd, msg, data? } from the client ("get" / "set"),
//             { cmd, msg, data?, result } from the soundbar ("notibyget",
//             "notibyset"... `result` is "ok" or a refusal such as
//             "sorry not support")
//
// python-temescal writes the length on ONE byte (a message over 255 bytes
// would not fit); the soundbar sends the 4 bytes, and so does this module.
// Some firmwares answer in plain JSON, without the header (lgsb2mqtt, MIT):
// the decoder accepts both.
// -----------------------------------------------------------------------------

import { createCipheriv, createDecipheriv } from 'node:crypto';

export const PORT = 9741;
export const HEADER = 0x10;
const HEADER_LENGTH = 5;
// A message of the soundbar is a few hundred bytes; past this, the stream is
// not the protocol (or is corrupted): the decoder starts over.
export const MAX_PAYLOAD = 64 * 1024;

const KEY = Buffer.from('T^&*J%^7tr~4^%^&I(o%^!jIJ__+a0 k', 'latin1');
const IV = Buffer.from("'%^Ur7gy$~t+f)%@", 'latin1');

/**
 * @description Encrypt a JSON text.
 * @param {string} text - The JSON text.
 * @returns {Buffer} The ciphertext (a multiple of 16 bytes).
 */
export function encrypt(text) {
  const cipher = createCipheriv('aes-256-cbc', KEY, IV);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
}

/**
 * @description Decrypt a payload.
 * @param {Buffer} payload - The ciphertext.
 * @returns {string} The JSON text.
 * @throws {Error} When the payload is not a valid ciphertext.
 */
export function decrypt(payload) {
  const decipher = createDecipheriv('aes-256-cbc', KEY, IV);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
}

/**
 * @description Build the frame of a message.
 * @param {object} message - `{ cmd, msg, data? }`.
 * @returns {Buffer} The frame.
 */
export function encodeFrame(message) {
  const payload = encrypt(JSON.stringify(message));
  const header = Buffer.alloc(HEADER_LENGTH);
  header[0] = HEADER;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

/**
 * @description An incremental decoder: push the chunks of the socket, get the
 * messages back (a frame may be split across chunks, a chunk may hold several
 * frames).
 * @returns {{ push: Function, reset: Function }} The decoder; `push(chunk)`
 * returns `{ messages: object[], errors: string[] }`.
 */
export function createDecoder() {
  let buffer = Buffer.alloc(0);

  const parse = (text, messages, errors) => {
    try {
      const message = JSON.parse(text);
      if (message && typeof message === 'object' && !Array.isArray(message)) {
        messages.push(message);
      } else {
        errors.push('not an object');
      }
    } catch {
      errors.push('invalid JSON');
    }
  };

  return {
    push(chunk) {
      buffer = buffer.length > 0 ? Buffer.concat([buffer, chunk]) : Buffer.from(chunk);
      const messages = [];
      const errors = [];
      while (buffer.length > 0) {
        if (buffer[0] !== HEADER) {
          // Plain JSON: up to the next header byte, or the end of the chunk.
          const next = buffer.indexOf(HEADER);
          const end = next === -1 ? buffer.length : next;
          const text = buffer.subarray(0, end).toString('utf8').trim();
          buffer = buffer.subarray(end);
          if (text) {
            parse(text, messages, errors);
          }
          continue;
        }
        if (buffer.length < HEADER_LENGTH) {
          break;
        }
        const length = buffer.readUInt32BE(1);
        if (length === 0 || length > MAX_PAYLOAD) {
          errors.push(`invalid frame length ${length}`);
          buffer = Buffer.alloc(0);
          break;
        }
        if (buffer.length < HEADER_LENGTH + length) {
          break;
        }
        const payload = buffer.subarray(HEADER_LENGTH, HEADER_LENGTH + length);
        buffer = buffer.subarray(HEADER_LENGTH + length);
        if (payload.length % 16 !== 0) {
          errors.push('payload is not a multiple of 16 bytes');
          continue;
        }
        let text;
        try {
          text = decrypt(payload);
        } catch {
          errors.push('payload does not decrypt');
          continue;
        }
        parse(text, messages, errors);
      }
      return { messages, errors };
    },
    reset() {
      buffer = Buffer.alloc(0);
    },
  };
}

// The messages read by the integration. Every one of them is in
// python-temescal 0.5 and in the Home Assistant integration.
export const MSG = {
  SPEAKER: 'SPK_LIST_VIEW_INFO',
  FUNCTION: 'FUNC_VIEW_INFO',
  EQUALISER: 'EQ_VIEW_INFO',
  SETTINGS: 'SETTING_VIEW_INFO',
  PLAY: 'PLAY_INFO',
  PRODUCT: 'PRODUCT_INFO',
  MAC: 'MAC_INFO_DEV',
  UPDATE: 'UPDATE_VIEW_INFO',
};

// What a full reading asks, in this order: identity first (the platform id
// of the device comes from it), then the state.
export const READ_SEQUENCE = [
  MSG.SPEAKER,
  MSG.MAC,
  MSG.PRODUCT,
  MSG.FUNCTION,
  MSG.EQUALISER,
  MSG.SETTINGS,
  MSG.PLAY,
  MSG.UPDATE,
];
