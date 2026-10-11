// Round-trip throughput with and without ws-tap: one client emits N events, the server echoes each one.
// usage: npm run bench
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const tap = require('..');

const N = 20000;
const ROUNDS = 5;
const VIEWER_PORT = 4555;
const payload = { text: 'hello from the benchmark', user: { name: 'alice', token: 'secret-token' }, tags: ['a', 'b', 'c'] };

async function run(middleware) {
  const io = new Server(0);
  if (middleware) io.use(middleware);
  io.on('connection', (s) => s.on('msg', (m) => s.emit('echo', m)));
  await new Promise((r) => io.httpServer.on('listening', r));
  const client = connect(`http://localhost:${io.httpServer.address().port}`, { transports: ['websocket'] });
  await new Promise((r) => client.on('connect', r));

  const start = process.hrtime.bigint();
  await new Promise((resolve) => {
    let got = 0;
    client.on('echo', () => ++got === N && resolve());
    for (let i = 0; i < N; i++) client.emit('msg', payload);
  });
  const seconds = Number(process.hrtime.bigint() - start) / 1e9;
  client.close();
  io.close();
  return N / seconds;
}

const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

(async () => {
  const viewer = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'ws-tap.js'), '--port', String(VIEWER_PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));

  const modes = [
    ['no ws-tap', () => null],
    ['console mode', () => tap({ log: () => {} })], // formatting cost only; real terminal speed varies
    ['viewer mode', () => tap({ viewer: VIEWER_PORT })],
  ];
  const results = [];
  for (const [name, make] of modes) {
    await run(make()); // warm-up
    const runs = [];
    for (let i = 0; i < ROUNDS; i++) runs.push(await run(make()));
    results.push({ name, perSecond: Math.round(median(runs)) });
  }
  viewer.kill();

  const base = results[0].perSecond;
  for (const r of results) {
    const overhead = r === results[0] ? '' : `  (${Math.round((1 - r.perSecond / base) * 100)}% slower)`;
    console.log(`${r.name.padEnd(14)} ${String(r.perSecond).padStart(7)} round trips/s${overhead}`);
  }
  console.log(JSON.stringify({ node: process.version, n: N, rounds: ROUNDS, results }));
})();
