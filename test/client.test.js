import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { SoundbarConnection } from '../src/temescal/client.js';
import { MSG } from '../src/temescal/protocol.js';
import { createFakeSoundbar } from './helpers/fake-soundbar.js';

const FAST = {
  reconnectMinMs: 20,
  reconnectMaxMs: 200,
  requestTimeoutMs: 300,
  connectTimeoutMs: 500,
};

const waitFor = async (check, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('condition not met in time');
};

const open = async (t, options = {}, fakeOptions = {}) => {
  const fake = createFakeSoundbar(fakeOptions);
  await fake.start();
  const connection = new SoundbarConnection('127.0.0.1', { port: fake.port, ...FAST, ...options });
  t.after(async () => {
    connection.stop();
    await fake.stop();
  });
  connection.start();
  await once(connection, 'open');
  return { fake, connection };
};

test('reads a message and gets the answer of the same msg', async (t) => {
  const { connection } = await open(t);
  const answer = await connection.get(MSG.SPEAKER);
  assert.equal(answer.cmd, 'notibyget');
  assert.equal(answer.data.i_vol_max, 40);
});

test('requests go one at a time, every message is also emitted', async (t) => {
  const { connection, fake } = await open(t);
  const seen = [];
  connection.on('message', (message) => seen.push(message.msg));
  const answers = await Promise.all([
    connection.get(MSG.SPEAKER),
    connection.get(MSG.EQUALISER),
    connection.get(MSG.FUNCTION),
  ]);
  assert.deepEqual(
    answers.map((answer) => answer.msg),
    [MSG.SPEAKER, MSG.EQUALISER, MSG.FUNCTION],
  );
  assert.deepEqual(seen, [MSG.SPEAKER, MSG.EQUALISER, MSG.FUNCTION]);
  assert.deepEqual(
    fake.received.map((message) => message.msg),
    [MSG.SPEAKER, MSG.EQUALISER, MSG.FUNCTION],
  );
});

test('a set is answered with notibyset and the changed fields', async (t) => {
  const { connection, fake } = await open(t);
  const answer = await connection.set(MSG.SPEAKER, { i_vol: 12 });
  assert.equal(answer.cmd, 'notibyset');
  assert.equal(answer.data.i_vol, 12);
  assert.deepEqual(fake.sets()[0], { cmd: 'set', data: { i_vol: 12 }, msg: MSG.SPEAKER });
});

test('a refusal rejects, a silent message times out, a closed connection rejects', async (t) => {
  const { connection, fake } = await open(t, {}, { refuse: [MSG.MAC], silent: [MSG.UPDATE] });
  await assert.rejects(connection.get(MSG.MAC), {
    name: 'RefusedError',
    result: 'sorry not support',
  });
  await assert.rejects(connection.get(MSG.UPDATE), { name: 'TimeoutError' });
  // The queue goes on after a failure.
  assert.equal((await connection.get(MSG.PRODUCT)).data.s_model_name, 'SP8YA');
  await fake.stop();
  await once(connection, 'close');
  await assert.rejects(connection.get(MSG.SPEAKER), { name: 'NotConnectedError' });
});

test('plain JSON answers and split frames are read too', async (t) => {
  const { connection } = await open(t, {}, { plaintext: true });
  assert.equal((await connection.get(MSG.PRODUCT)).data.s_model_name, 'SP8YA');
  const second = await open(t, {}, { chunking: true });
  assert.equal((await second.connection.get(MSG.PRODUCT)).data.s_model_name, 'SP8YA');
});

test('closed by the soundbar after a while: opened again at once, without asking anything', async (t) => {
  const { connection, fake } = await open(t);
  const before = fake.received.length;
  fake.dropConnections();
  await once(connection, 'close');
  await once(connection, 'open');
  assert.equal(fake.connections, 2);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(fake.received.length, before, 'a request would wake a soundbar in standby');
});

test('pushed changes (remote) arrive on the open connection', async (t) => {
  const { connection, fake } = await open(t);
  const pushed = once(connection, 'message');
  fake.remote(MSG.FUNCTION, { i_curr_func: 6 });
  const [message] = await pushed;
  assert.deepEqual(
    [message.msg, message.cmd, message.data],
    [MSG.FUNCTION, 'notibyset', { i_curr_func: 6 }],
  );
});

test('an unreachable soundbar is retried with a growing delay, then found again', async (t) => {
  const fake = createFakeSoundbar();
  await fake.start();
  const port = fake.port;
  await fake.stop();
  const connection = new SoundbarConnection('127.0.0.1', { port, ...FAST });
  t.after(async () => {
    connection.stop();
    await fake.stop();
  });
  const closes = [];
  connection.on('close', (info) => closes.push(info));
  connection.start();
  await waitFor(() => closes.length >= 3);
  assert.ok(closes.every((info) => !info.wasOpen && info.error));
  assert.ok(connection.retryDelay > FAST.reconnectMinMs, 'the delay grows');
  await fake.start(port);
  await once(connection, 'open');
  assert.equal(connection.failures, 0);
  assert.equal(connection.retryDelay, FAST.reconnectMinMs);
});

test('moveTo reconnects to the new address (DHCP); stop closes for good', async (t) => {
  const { connection, fake } = await open(t);
  const moved = createFakeSoundbar({ profile: 'S90QY' });
  await moved.start(fake.port, '127.0.0.2');
  t.after(() => moved.stop());
  connection.moveTo('127.0.0.2');
  await once(connection, 'open');
  assert.equal((await connection.get(MSG.PRODUCT)).data.s_model_name, 'S90QY');
  connection.stop();
  assert.equal(connection.running, false);
  assert.equal(connection.socket, null);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(moved.connections, 1, 'no reconnection after stop');
});
