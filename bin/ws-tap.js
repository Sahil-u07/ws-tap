#!/usr/bin/env node
const net = require('net');
const readline = require('readline');
const { parseArgs, styleText } = require('util');

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '4400' },
    filter: { type: 'string', short: 'f', default: '' },
  },
});

const DIR_COLORS = { IN: 'green', OUT: 'cyan', disconnect: 'red' };
const ID_COLORS = ['magenta', 'yellow', 'blue', 'magentaBright', 'yellowBright', 'blueBright'];
const MAX_HELD = 1000;

let filter = values.filter;
let paused = false;
let typing = null; // filter text being typed, or null when not prompting
let held = [];
let dropped = 0;

// Same socket, same colour, so interleaved conversations are easy to follow.
const idColor = (id) => ID_COLORS[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % ID_COLORS.length];
const note = (text) => console.log(styleText('dim', `-- ${text}`));

// "chat" matches event names containing chat, "@abc" matches socket ids starting with abc.
function matches({ id, event }) {
  if (!filter) return true;
  if (filter.startsWith('@')) return id.startsWith(filter.slice(1));
  return event.toLowerCase().includes(filter.toLowerCase());
}

function show(entry) {
  if (!matches(entry)) return;
  const { time, id, dir, event, payload } = entry;
  const parts = [
    styleText('dim', time),
    styleText(idColor(id), id),
    styleText(DIR_COLORS[dir] || 'white', dir.padEnd(3)),
    event && styleText('bold', event),
    payload,
  ];
  console.log(parts.filter(Boolean).join(' '));
}

function receive(entry) {
  if (!paused && typing === null) return show(entry);
  // hold everything while paused or prompting; the filter is applied when it's shown
  if (held.length >= MAX_HELD) {
    held.shift();
    dropped++;
  }
  held.push(entry);
}

function flush() {
  if (paused || typing !== null) return;
  if (dropped) note(`${dropped} older events dropped while paused`);
  held.forEach(show);
  held = [];
  dropped = 0;
}

function endPrompt(newFilter) {
  process.stdout.write('\n');
  if (newFilter !== undefined) filter = newFilter.trim();
  typing = null;
  note(filter ? `filter: ${filter}` : 'filter cleared');
  flush();
}

function onKey(key) {
  if (key === '\u0003') process.exit(0); // ctrl+c, raw mode turns it into a plain key
  if (typing !== null) {
    if (key === '\r' || key === '\n') endPrompt(typing);
    else if (key === '\u001b') endPrompt(); // esc keeps the old filter
    else if (key === '\u007f' || key === '\b') {
      if (typing) process.stdout.write('\b \b');
      typing = typing.slice(0, -1);
    } else {
      typing += key;
      process.stdout.write(key);
    }
  } else if (key === 'p' || key === ' ') {
    paused = !paused;
    note(paused ? `paused, press p to resume` : 'resumed');
    flush();
  } else if (key === 'f' || key === '/') {
    typing = '';
    process.stdout.write(styleText('dim', 'filter (event name, @socket id, empty for all): '));
  } else if (key === 'q') {
    process.exit(0);
  }
}

const server = net.createServer((conn) => {
  note('app connected');
  readline.createInterface({ input: conn }).on('line', (line) => {
    try {
      const { time = '', id, dir, event = '', payload = '' } = JSON.parse(line);
      if (typeof id === 'string' && typeof dir === 'string') receive({ time, id, dir, event: String(event), payload });
    } catch {
      // ignore anything that isn't a ws-tap entry
    }
  });
  conn.on('error', () => {}).on('close', () => note('app disconnected'));
});

server.on('error', (err) => {
  console.error(`ws-tap: ${err.message}`);
  process.exit(1);
});

server.listen(Number(values.port), '127.0.0.1', () => {
  console.log(`ws-tap viewer listening on 127.0.0.1:${server.address().port}`);
  note('add io.use(tap({ viewer: true })) to your server, then use it as usual');
  note('keys: p pause/resume, f filter, q quit');
  if (filter) note(`filter: ${filter}`);
});

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8').on('data', (chunk) => {
  for (const key of chunk) onKey(key);
});
