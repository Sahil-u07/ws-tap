#!/usr/bin/env node
const net = require('net');
const readline = require('readline');
const { parseArgs, styleText } = require('util');

const { values } = parseArgs({ options: { port: { type: 'string', short: 'p', default: '4400' } } });

const DIR_COLORS = { IN: 'green', OUT: 'cyan', disconnect: 'red' };
const ID_COLORS = ['magenta', 'yellow', 'blue', 'magentaBright', 'yellowBright', 'blueBright'];

// Same socket, same colour, so interleaved conversations are easy to follow.
const idColor = (id) => ID_COLORS[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % ID_COLORS.length];

function show({ time, id, dir, event, payload }) {
  const parts = [
    styleText('dim', time),
    styleText(idColor(id), id),
    styleText(DIR_COLORS[dir] || 'white', dir.padEnd(3)),
    event && styleText('bold', event),
    payload,
  ];
  console.log(parts.filter(Boolean).join(' '));
}

const server = net.createServer((conn) => {
  console.log(styleText('dim', '-- app connected'));
  readline.createInterface({ input: conn }).on('line', (line) => {
    try {
      show(JSON.parse(line));
    } catch {
      // ignore anything that isn't a ws-tap entry
    }
  });
  conn.on('error', () => {}).on('close', () => console.log(styleText('dim', '-- app disconnected')));
});

server.on('error', (err) => {
  console.error(`ws-tap: ${err.message}`);
  process.exit(1);
});

server.listen(Number(values.port), '127.0.0.1', () => {
  console.log(`ws-tap viewer listening on 127.0.0.1:${server.address().port}`);
  console.log(styleText('dim', 'add io.use(tap({ viewer: true })) to your server, then use it as usual'));
});
