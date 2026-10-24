// -----------------------------------------------------------------------------
// One TCP connection to one soundbar, kept open.
//
// Why a persistent connection rather than short sessions:
//   - the soundbar PUSHES its changes (volume, input, sound mode... changed
//     with the remote, the TV or the app) on the open connection: a kept
//     connection sees them at once, a poller would have to ask again and
//     again (python-temescal, Home Assistant and lgsb2mqtt all keep it);
//   - SENDING a request wakes a soundbar in standby (python-temescal issue
//     #7, Home Assistant issue #157507): a poller would keep switching it on.
//     Opening a connection does not, so a dropped connection is opened again
//     silently, without asking anything;
//   - the soundbar closes an idle connection after about 5 minutes
//     (python-temescal pull request #6): normal, it is reopened at once.
//     A connection that cannot be opened is retried with a growing delay
//     (1 s, 2 s, 4 s... up to a minute).
//
// Requests go one at a time. An answer is the next message of the same `msg`
// with `cmd` "notibyget" / "notibyset"; `result` other than "ok" ("sorry not
// support") rejects. Every message, answer or not, is also emitted as
// 'message' (the state is built from all of them).
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createConnection } from 'node:net';
import { PORT, createDecoder, encodeFrame } from './protocol.js';

export const CONNECT_TIMEOUT_MS = 5000;
export const REQUEST_TIMEOUT_MS = 2500;
export const RECONNECT_MIN_MS = 1000;
export const RECONNECT_MAX_MS = 60 * 1000;

/** The soundbar answered with a refusal. */
export class RefusedError extends Error {
  constructor(msg, result) {
    super(`${msg}: ${result}`);
    this.name = 'RefusedError';
    this.result = result;
  }
}

/** No answer in time. */
export class TimeoutError extends Error {
  constructor(cmd, msg) {
    super(`no answer to ${cmd} ${msg}`);
    this.name = 'TimeoutError';
  }
}

/** The connection is not open. */
export class NotConnectedError extends Error {
  constructor(host) {
    super(`not connected to ${host}`);
    this.name = 'NotConnectedError';
  }
}

/**
 * The connection. Events: 'open', 'close' `{ wasOpen, error }`, 'message'
 * `(message)`, 'garbage' `(reason)`.
 */
export class SoundbarConnection extends EventEmitter {
  /**
   * @param {string} host - IP address.
   * @param {object} [options] - Options.
   * @param {number} [options.port] - TCP port (9741).
   * @param {Function} [options.connect] - `net.createConnection` (tests).
   * @param {number} [options.connectTimeoutMs] - Connection timeout.
   * @param {number} [options.requestTimeoutMs] - Answer timeout.
   * @param {number} [options.reconnectMinMs] - First retry delay.
   * @param {number} [options.reconnectMaxMs] - Longest retry delay.
   */
  constructor(host, options = {}) {
    super();
    this.host = host;
    this.port = options.port ?? PORT;
    this.connectFn = options.connect ?? createConnection;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.reconnectMinMs = options.reconnectMinMs ?? RECONNECT_MIN_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? RECONNECT_MAX_MS;
    this.socket = null;
    this.open = false;
    this.running = false;
    this.failures = 0;
    this.retryDelay = this.reconnectMinMs;
    this.retryTimer = null;
    this.decoder = createDecoder();
    this.waiters = [];
    this.queue = Promise.resolve();
  }

  /** Open the connection, and keep it open until stop(). */
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.connectNow();
  }

  /** Close for good. */
  stop() {
    this.running = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.rejectWaiters(new NotConnectedError(this.host));
    if (socket) {
      socket.destroy();
    }
    if (this.open) {
      this.open = false;
      this.emit('close', { wasOpen: true, error: null });
    }
  }

  /**
   * @description Change the address (DHCP): the connection is reopened.
   * @param {string} host - The new IP address.
   */
  moveTo(host) {
    if (host === this.host) {
      return;
    }
    this.host = host;
    if (this.running) {
      this.stop();
      this.retryDelay = this.reconnectMinMs;
      this.failures = 0;
      this.start();
    }
  }

  /** Open again now (a scan found the soundbar, or a command is waiting). */
  retryNow() {
    if (!this.running || this.socket) {
      return;
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connectNow();
  }

  connectNow() {
    const socket = this.connectFn({ host: this.host, port: this.port });
    this.socket = socket;
    this.decoder.reset();
    let opened = false;
    let lastError = null;
    socket.setNoDelay?.(true);
    socket.setTimeout?.(this.connectTimeoutMs);
    socket.on('connect', () => {
      opened = true;
      this.open = true;
      this.failures = 0;
      this.retryDelay = this.reconnectMinMs;
      socket.setTimeout?.(0);
      socket.setKeepAlive?.(true, 30 * 1000);
      this.emit('open');
    });
    socket.on('timeout', () => {
      lastError = new Error(`connection to ${this.host}:${this.port} timed out`);
      socket.destroy();
    });
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (error) => {
      lastError = error;
    });
    socket.on('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.rejectWaiters(new NotConnectedError(this.host));
      const wasOpen = this.open;
      this.open = false;
      if (!opened) {
        this.failures += 1;
      }
      this.emit('close', { wasOpen, error: lastError });
      this.scheduleRetry(opened);
    });
  }

  scheduleRetry(wasOpened) {
    if (!this.running || this.retryTimer) {
      return;
    }
    // Closed by the soundbar after a while (idle): open again at once.
    // Could not connect: wait longer each time.
    const delay = wasOpened ? this.reconnectMinMs : this.retryDelay;
    if (!wasOpened) {
      this.retryDelay = Math.min(this.retryDelay * 2, this.reconnectMaxMs);
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.running && !this.socket) {
        this.connectNow();
      }
    }, delay);
    this.retryTimer.unref?.();
  }

  onData(chunk) {
    const { messages, errors } = this.decoder.push(chunk);
    errors.forEach((reason) => this.emit('garbage', reason));
    for (const message of messages) {
      const index = this.waiters.findIndex(
        (waiter) => waiter.msg === message.msg && waiter.cmd === message.cmd,
      );
      if (index !== -1) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        if (message.result !== undefined && message.result !== 'ok') {
          waiter.reject(new RefusedError(message.msg, message.result));
        } else {
          waiter.resolve(message);
        }
      }
      this.emit('message', message);
    }
  }

  rejectWaiters(error) {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  /**
   * @description Send a request and wait for its answer, one request at a time.
   * @param {'get'|'set'} cmd - The command.
   * @param {string} msg - The message (MSG).
   * @param {object} [data] - The fields of a `set`.
   * @param {object} [options] - `{ timeoutMs }`.
   * @returns {Promise<object>} The answer.
   */
  request(cmd, msg, data, options = {}) {
    const run = () =>
      new Promise((resolve, reject) => {
        if (!this.open || !this.socket) {
          reject(new NotConnectedError(this.host));
          return;
        }
        const waiter = { cmd: `notiby${cmd}`, msg, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          reject(new TimeoutError(cmd, msg));
        }, options.timeoutMs ?? this.requestTimeoutMs);
        waiter.timer.unref?.();
        this.waiters.push(waiter);
        const message = data === undefined ? { cmd, msg } : { cmd, data, msg };
        this.socket.write(encodeFrame(message));
      });
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  /**
   * @param {string} msg - The message to read.
   * @param {object} [options] - `{ timeoutMs }`.
   * @returns {Promise<object>} The answer.
   */
  get(msg, options) {
    return this.request('get', msg, undefined, options);
  }

  /**
   * @param {string} msg - The message to change.
   * @param {object} data - The fields.
   * @param {object} [options] - `{ timeoutMs }`.
   * @returns {Promise<object>} The answer.
   */
  set(msg, data, options) {
    return this.request('set', msg, data, options);
  }
}
