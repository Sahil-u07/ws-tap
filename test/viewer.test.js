const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const tap = require('..');

let io, client, viewer;

afterEach(() => {
  client?.close();
  io?.close();
  viewer?.kill();
});

function startServer(opts, onConnection) {
  io = new Server(0);
  io.use(tap(opts));
  io.on('connection', onConnection);
  return new Promise((resolve) => {
    io.httpServer.on('listening', () => resolve(`http://localhost:${io.httpServer.address().port}`));
  });
}

// Start the viewer on a random port; resolves with its port and a live view of its output.
function startViewer(...args) {
  viewer = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'ws-tap.js'), '--port', '0', ...args]);
  const out = { text: '' };
  viewer.stdout.on('data', (d) => (out.text += d));
  return new Promise((resolve) => {
    viewer.stdout.on('data', function onData() {
      const m = out.text.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (m) {
        viewer.stdout.off('data', onData);
        resolve({ port: Number(m[1]), out });
      }
    });
  });
}

const until = async (fn) => {
  for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(fn(), 'condition not met in time');
};

test('streams IN, OUT and disconnect to the viewer, redacted', async () => {
  const { port, out } = await startViewer();
  const url = await startServer({ viewer: port }, (s) => {
    s.on('chat', () => s.emit('chat-reply', { ok: true }));
  });
  client = connect(url);
  client.emit('chat', { text: 'hi', token: 'abc' });
  await new Promise((r) => client.on('chat-reply', r));
  client.close();
  await until(() => out.text.includes('disconnect'));

  assert.match(out.text, /IN\s+chat \{"text":"hi","token":"\[redacted\]"\}/);
  assert.match(out.text, /OUT chat-reply \{"ok":true\}/);
  assert.match(out.text, /disconnect client namespace disconnect/);
  assert.ok(!out.text.includes('abc'));
});

test('app keeps working when no viewer is running', async () => {
  const url = await startServer({ viewer: 1 }, (s) => {
    s.on('chat', () => s.emit('chat-reply', 'ok'));
  });
  client = connect(url);
  client.emit('chat', {});
  assert.strictEqual(await new Promise((r) => client.on('chat-reply', r)), 'ok');
});

test('viewer mode does not also log to the console unless log is given', async () => {
  const lines = [];
  const original = console.log;
  console.log = (l) => lines.push(l);
  try {
    const url = await startServer({ viewer: 1 }, (s) => s.on('chat', () => s.emit('chat-reply')));
    client = connect(url);
    client.emit('chat');
    await new Promise((r) => client.on('chat-reply', r));
  } finally {
    console.log = original;
  }
  assert.ok(!lines.some((l) => String(l).startsWith('[ws-tap]')), lines.join('\n'));
});

const reply = (c, event, data) => new Promise((r) => { c.once('reply', r); c.emit(event, data); });
const echo = (s) => s.onAny(() => s.emit('reply'));

test('--filter shows only matching event names', async () => {
  const { port, out } = await startViewer('--filter', 'chat');
  client = connect(await startServer({ viewer: port }, echo));
  await reply(client, 'other');
  await reply(client, 'chat');
  await until(() => /IN\s+chat/.test(out.text));
  assert.ok(!out.text.includes('other'), out.text);
  assert.ok(!/OUT reply/.test(out.text), out.text);
});

test('f then @id filters to one socket', async () => {
  const { port, out } = await startViewer();
  const url = await startServer({ viewer: port }, echo);
  client = connect(url);
  const other = connect(url);
  await Promise.all([reply(client, 'warmup'), reply(other, 'warmup')]);

  const prefix = client.id.slice(0, 4);
  viewer.stdin.write(`f@${prefix}\n`);
  await until(() => out.text.includes(`filter: @${prefix}`));
  await reply(other, 'from-other');
  await reply(client, 'from-mine');
  other.close();

  await until(() => out.text.includes('from-mine'));
  assert.ok(!out.text.includes('from-other'), out.text);
});

test('p pauses the stream and resuming prints what was held', async () => {
  const { port, out } = await startViewer();
  client = connect(await startServer({ viewer: port }, echo));
  await reply(client, 'warmup');
  await until(() => out.text.includes('warmup'));

  viewer.stdin.write('p');
  await until(() => out.text.includes('paused'));
  await reply(client, 'while-paused');
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!out.text.includes('while-paused'), out.text);

  viewer.stdin.write('p');
  await until(() => out.text.includes('while-paused'));
});
