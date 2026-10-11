const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const tap = require('..');

let io, client;

afterEach(() => {
  client?.close();
  io?.close();
  delete process.env.NODE_ENV;
});

// Start a server with tap(opts), run onConnection per socket, return the client URL.
function start(opts, onConnection = () => {}) {
  io = new Server(0);
  io.use(tap(opts));
  io.on('connection', onConnection);
  return new Promise((resolve) => {
    io.httpServer.on('listening', () => resolve(`http://localhost:${io.httpServer.address().port}`));
  });
}

const until = async (fn) => {
  for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(fn(), 'condition not met in time');
};

test('logs incoming, outgoing and disconnect', async () => {
  const lines = [];
  const url = await start({ log: (l) => lines.push(l) }, (s) => {
    s.on('chat', (msg) => s.emit('chat-reply', { echo: msg.text }));
  });
  client = connect(url);
  client.emit('chat', { text: 'hi' });
  await new Promise((r) => client.on('chat-reply', r));
  client.close();
  await until(() => lines.some((l) => l.includes('disconnect')));

  assert.ok(lines.some((l) => /^\[ws-tap\] .* IN chat \{"text":"hi"\}$/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /OUT chat-reply \{"echo":"hi"\}$/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /disconnect client namespace disconnect$/.test(l)), lines.join('\n'));
});

test('redacts secrets at any depth and survives circular objects and buffers', async () => {
  const lines = [];
  const url = await start({ log: (l) => lines.push(l) });
  client = connect(url);
  client.emit('login', { user: 'a', password: 'p', nested: { Token: 't', list: [{ secret: 's' }] }, buf: Buffer.from('x') });
  await until(() => lines.some((l) => l.includes('login')));
  const line = lines.find((l) => l.includes('login'));
  assert.ok(!/"p"|"t"|"s"/.test(line), line);
  assert.match(line, /"password":"\[redacted\]"/);
  assert.match(line, /"buf":"<Buffer 1 bytes>"/);

  const circ = { a: 1 };
  circ.self = circ;
  // socket.io itself throws on circular data; the tap must still log it first without recursing
  const [s] = io.of('/').sockets.values();
  assert.throws(() => s.emit('circ', circ, Buffer.from('ab')), RangeError);
  await until(() => lines.some((l) => l.includes('circ')));
  assert.match(lines.find((l) => l.includes('circ')), /\{"a":1,"self":"\[circular\]"\} "<Buffer 2 bytes>"/);
});

test('truncates long payloads', async () => {
  const lines = [];
  const url = await start({ log: (l) => lines.push(l), maxLength: 50 });
  client = connect(url);
  client.emit('big', 'x'.repeat(500));
  await until(() => lines.some((l) => l.includes('big')));
  const payload = lines.find((l) => l.includes('big')).split(' big ')[1];
  assert.ok(payload.length <= 51 && payload.endsWith('…'), payload);
});

test('logs nothing in production unless enabled', async () => {
  process.env.NODE_ENV = 'production';
  const lines = [];
  let got = false;
  const url = await start({ log: (l) => lines.push(l) }, (s) => s.on('ping2', () => (got = true)));
  client = connect(url);
  client.emit('ping2');
  await until(() => got);
  assert.deepStrictEqual(lines, []);
});

test('a throwing log function never breaks the app', async () => {
  const url = await start({ log: () => { throw new Error('boom'); } }, (s) => {
    s.on('chat', () => s.emit('chat-reply', 'ok'));
  });
  client = connect(url);
  client.emit('chat', {});
  const reply = await new Promise((r) => client.on('chat-reply', r));
  assert.strictEqual(reply, 'ok');
});
