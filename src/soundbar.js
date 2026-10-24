// -----------------------------------------------------------------------------
// One soundbar: its connection (kept open, src/temescal/client.js), its
// state (src/temescal/model.js), whether it answers, and the reading.
//
// When it reads:
//   - a full reading (every message of READ_SEQUENCE, one at a time; a model
//     that does not answer one, or refuses it, is simply missing that part)
//     at discovery, at the first connection when nothing is known yet, and
//     after the soundbar was unreachable for a while;
//   - never on the silent reconnection after the soundbar closed an idle
//     connection: the state did not change meanwhile, and asking would wake
//     a soundbar in standby;
//   - with `quiet_start`, never by itself: only at discovery and when a
//     command is sent.
//
// Who changed what: a message carrying the very values the integration has
// just `set` (5 seconds) is the integration's own echo; the others came from
// the remote, the TV or the app. Scene events are only fired for the latter
// (an event caused by a scene action would let a scene loop through the
// integration).
//
// Unreachable: the connection could not be opened for OFFLINE_MS.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { SoundbarConnection } from './temescal/client.js';
import { MSG, READ_SEQUENCE } from './temescal/protocol.js';
import { applyMessage, emptyState } from './temescal/model.js';

export const OFFLINE_MS = 2 * 60 * 1000;
export const OWN_CHANGE_MS = 5000;
// After this long unreachable, the next connection reads everything again.
export const STALE_MS = 2 * 60 * 1000;

/**
 * A soundbar. Events: 'changed' `(fields: Set, { own, msg })`, 'online',
 * 'offline', 'read' (a full reading ended).
 */
export class Soundbar extends EventEmitter {
  /**
   * @param {object} init - `{ id, host, state?, port? }`.
   * @param {object} deps - Dependencies.
   * @param {object} deps.logger - Logger.
   * @param {Function} [deps.now] - Clock (ms).
   * @param {object} [deps.connectionOptions] - SoundbarConnection options (tests).
   * @param {Function} [deps.quietStart] - `() => boolean`.
   * @param {number} [deps.offlineMs] - Unreachable after this long.
   */
  constructor(init, deps) {
    super();
    this.id = init.id ?? null;
    this.host = init.host;
    const empty = emptyState();
    this.state = init.state
      ? {
          ...empty,
          ...init.state,
          play: { ...empty.play, ...(init.state.play ?? {}) },
          switches: { ...(init.state.switches ?? {}) },
          levels: { ...(init.state.levels ?? {}) },
          seen: [...(init.state.seen ?? [])],
        }
      : empty;
    this.logger = deps.logger;
    this.now = deps.now ?? Date.now;
    this.quietStart = deps.quietStart ?? (() => false);
    this.offlineMs = deps.offlineMs ?? OFFLINE_MS;
    this.online = null;
    this.assumedPower = null;
    this.lastSeen = 0;
    this.closedAt = 0;
    this.needsRead = !init.state;
    this.reading = null;
    this.expected = new Map();
    this.offlineTimer = null;
    this.connection = new SoundbarConnection(this.host, {
      port: init.port,
      ...(deps.connectionOptions ?? {}),
    });
    this.connection.on('open', () => this.onOpen());
    this.connection.on('close', (info) => this.onClose(info));
    this.connection.on('message', (message) => this.onMessage(message));
    this.connection.on('garbage', (reason) =>
      this.logger.debug?.(`LG Soundbar: ${this.host} sent something unreadable (${reason})`),
    );
  }

  start() {
    this.connection.start();
    this.armOffline();
  }

  stop() {
    clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
    this.connection.stop();
  }

  /** @returns {boolean} The connection is open. */
  get connected() {
    return this.connection.open;
  }

  moveTo(host) {
    if (host && host !== this.host) {
      this.logger.info(`LG Soundbar: ${this.host} moved to ${host}`);
      this.host = host;
      this.connection.moveTo(host);
    }
  }

  armOffline() {
    if (this.offlineTimer || this.connection.open) {
      return;
    }
    this.offlineTimer = setTimeout(() => {
      this.offlineTimer = null;
      if (!this.connection.open && this.online !== false) {
        this.online = false;
        this.emit('offline');
      }
    }, this.offlineMs);
    this.offlineTimer.unref?.();
  }

  onOpen() {
    clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
    const wasOffline = this.online === false;
    const stale = this.closedAt > 0 && this.now() - this.closedAt > STALE_MS;
    this.lastSeen = this.now();
    if (this.online !== true) {
      this.online = true;
      this.emit('online', { wasOffline });
    }
    if ((this.needsRead || stale) && !this.quietStart()) {
      this.read().catch(() => {});
    }
  }

  onClose({ wasOpen }) {
    if (wasOpen) {
      this.closedAt = this.now();
    }
    this.armOffline();
  }

  onMessage(message) {
    this.lastSeen = this.now();
    const changed = applyMessage(this.state, message);
    if (changed.size === 0) {
      return;
    }
    const own = this.isOwn(message);
    this.emit('changed', changed, { own, msg: message.msg });
  }

  /**
   * @description Whether a message is the echo of a `set` of the integration:
   * it carries a value just set (b_powerkey is echoed as b_powerstatus, an
   * input or a sound mode by several messages), and no other value of a
   * field just set.
   * @param {object} message - The message.
   * @returns {boolean} True for an echo.
   */
  isOwn(message) {
    const now = this.now();
    let echo = false;
    for (const [field, value] of Object.entries(message?.data ?? {})) {
      const expected = this.expected.get(field);
      if (!expected || expected.until <= now) {
        continue;
      }
      if (expected.value !== value) {
        return false;
      }
      echo = true;
    }
    return echo;
  }

  /**
   * @description Read every message, one at a time.
   * @param {object} [options] - `{ timeoutMs }` per message.
   * @returns {Promise<{ answered: string[], missing: string[] }>} What answered.
   */
  read(options = {}) {
    if (this.reading) {
      return this.reading;
    }
    this.reading = (async () => {
      const answered = [];
      const missing = [];
      for (const msg of READ_SEQUENCE) {
        try {
          await this.connection.get(msg, options);
          answered.push(msg);
        } catch (error) {
          missing.push(msg);
          if (error?.name === 'NotConnectedError') {
            break;
          }
        }
      }
      if (answered.includes(MSG.SPEAKER)) {
        this.needsRead = false;
        this.closedAt = 0;
      }
      this.emit('read', { answered, missing });
      return { answered, missing };
    })();
    return this.reading.finally(() => {
      this.reading = null;
    });
  }

  /**
   * @description Wait for the connection to open.
   * @param {number} timeoutMs - How long at most.
   * @returns {Promise<boolean>} Open in time.
   */
  async waitOpen(timeoutMs) {
    if (this.connection.open) {
      return true;
    }
    this.connection.retryNow();
    return new Promise((resolve) => {
      const done = (value) => {
        clearTimeout(timer);
        this.connection.off('open', onOpen);
        resolve(value);
      };
      const onOpen = () => done(true);
      // Not unref'd: a command is waiting for it.
      const timer = setTimeout(() => done(false), timeoutMs);
      this.connection.on('open', onOpen);
    });
  }

  /**
   * @description Change fields of a message, then make sure the state knows
   * the result: the answer of the soundbar, else a reading of that message.
   * @param {string} msg - The message.
   * @param {object} data - The fields.
   * @returns {Promise<void>} Resolves once the state is up to date.
   * @throws {Error} NotConnectedError, RefusedError.
   */
  async set(msg, data) {
    const expect = () => {
      const until = this.now() + OWN_CHANGE_MS;
      for (const [field, value] of Object.entries(data)) {
        this.expected.set(field === 'b_powerkey' ? 'b_powerstatus' : field, { value, until });
      }
    };
    expect();
    try {
      await this.connection.set(msg, data);
    } catch (error) {
      if (error?.name !== 'TimeoutError') {
        throw error;
      }
      // Some models do not answer a set: read the message back.
      try {
        await this.connection.get(msg);
      } catch (readError) {
        if (readError?.name !== 'TimeoutError') {
          throw readError;
        }
      }
    } finally {
      expect();
    }
  }

  /** @returns {object} What /data keeps of the soundbar. */
  toStorage() {
    const { play, seen, ...state } = this.state;
    return {
      host: this.host,
      state: {
        ...state,
        play: { streamType: play.streamType, supportControl: play.supportControl },
        seen,
      },
    };
  }
}
