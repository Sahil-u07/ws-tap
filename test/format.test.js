const { test } = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const tap = require('..');

// Drives the middleware with a fake socket, so payloads never touch the network.
function fakeSocket(opts) {
  const s = { id: 'abcdef123456', on() {}, onAnyOutgoing() {}, onAny(fn) { s.emitIn = fn; } };
  tap(opts)(s, () => {});
  return s;
}

function payloadOf(args, maxLength) {
  let line;
  fakeSocket({ log: (l) => (line = l), maxLength }).emitIn('ev', ...args);
  return line.slice(line.indexOf(' IN ev') + 7);
}

// The previous implementation, kept as the reference the new one must match exactly.
const SECRET = /^(password|token|secret|authorization)$/i;
function clean(value, parents = new Set()) {
  if (typeof value === 'function') return '<ack>';
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `<Buffer ${value.byteLength} bytes>`;
  if (typeof value.toJSON === 'function') return clean(value.toJSON(), parents);
  if (parents.has(value)) return '[circular]';
  parents.add(value);
  let out;
  if (Array.isArray(value)) out = value.map((v) => clean(v, parents));
  else { out = {}; for (const [k, v] of Object.entries(value)) out[k] = SECRET.test(k) ? '[redacted]' : clean(v, parents); }
  parents.delete(value);
  return out;
}
function oldFormat(args, maxLength) {
  const text = args.map((a) => JSON.stringify(clean(a)) ?? String(a)).join(' ');
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

let seed = 42;
const rnd = (n) => ((seed = (seed * 16807) % 2147483647) % n);
function randomValue(depth) {
  const leaves = [() => 'he said "hi"\n\t ', () => rnd(1000) - 500, () => 1.5e21, () => -0, () => NaN, () => Infinity,
    () => true, () => null, () => undefined, () => Symbol('s'), () => () => {}, () => Buffer.alloc(rnd(50)),
    () => new Uint8Array(3), () => new Date(0), () => 'x'.repeat(rnd(300))];
  if (depth <= 0 || rnd(3) === 0) return leaves[rnd(leaves.length)]();
  if (rnd(2)) return Array.from({ length: rnd(5) }, () => randomValue(depth - 1));
  const o = {};
  const keys = ['a', 'b c', 'pass"word', 'password', 'Token', 'nested', 'secret', 'list'];
  for (let i = rnd(5); i > 0; i--) o[keys[rnd(keys.length)]] = randomValue(depth - 1);
  return o;
}

test('formats exactly like before, across thousands of random payloads', () => {
  for (let i = 0; i < 3000; i++) {
    const args = Array.from({ length: 1 + rnd(3) }, () => randomValue(4));
    if (i % 7 === 0) { const c = { n: i }; c.self = c; c.list = [c, { up: c }]; args.push(c); }
    if (i % 11 === 0) { const shared = { s: 1 }; args.push({ a: shared, b: shared }); }
    const maxLength = [0, 1, 10, 50, 200, 5000][i % 6];
    assert.strictEqual(payloadOf(args, maxLength), oldFormat(args, maxLength), `case ${i}`);
  }
});

test('stops reading huge payloads once maxLength is reached', () => {
  let reads = 0;
  const huge = Array.from({ length: 100000 }, () => ({ get x() { reads++; return 1; } }));
  const payload = payloadOf([huge], 50);
  assert.ok(payload.endsWith('…'), payload);
  assert.ok(reads < 20, `read ${reads} items, expected only the first few`);
});

test('viewer-only mode does no formatting work while no viewer is connected', async () => {
  // a viewer that accepts the connection and immediately hangs up
  const server = net.createServer((c) => c.destroy());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let formatted = 0;
  const payload = { toJSON() { formatted++; return 1; } };
  const s = fakeSocket({ viewer: server.address().port });

  s.emitIn('ev', payload); // starts the first connection attempt
  await new Promise((r) => setTimeout(r, 200)); // viewer has hung up, next retry is ~1s away
  formatted = 0;
  for (let i = 0; i < 100; i++) s.emitIn('ev', payload);
  server.close();
  assert.strictEqual(formatted, 0);
});
