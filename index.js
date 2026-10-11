const net = require('net');

const SECRET_KEYS = /^(password|token|secret|authorization)$/i;

// Copy a payload into something safe to JSON.stringify: secrets hidden,
// cycles and binary replaced with short placeholders.
function clean(value, parents = new Set()) {
  if (typeof value === 'function') return '<ack>';
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return `<Buffer ${value.byteLength} bytes>`;
  }
  if (typeof value.toJSON === 'function') return clean(value.toJSON(), parents);
  if (parents.has(value)) return '[circular]';

  parents.add(value);
  let out;
  if (Array.isArray(value)) {
    out = value.map((v) => clean(v, parents));
  } else {
    out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : clean(v, parents);
    }
  }
  parents.delete(value); // only ancestors count as cycles, not shared references
  return out;
}

function format(args, maxLength) {
  const text = args.map((a) => JSON.stringify(clean(a)) ?? String(a)).join(' ');
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

// Streams entries to a running `ws-tap` viewer as JSON lines; drops them while none is listening.
function connectViewer(port) {
  let conn = null;
  let nextTry = 0;
  return (entry) => {
    if (!conn && Date.now() >= nextTry) {
      nextTry = Date.now() + 1000;
      conn = net.connect(port, '127.0.0.1').unref(); // never keep the host process alive
      conn.on('error', () => {}).on('close', () => (conn = null));
    }
    if (conn && conn.writableLength < 1e6) conn.write(JSON.stringify(entry) + '\n'); // drop if the viewer falls behind
  };
}

function tap(options = {}) {
  const { maxLength = 200, viewer } = options;
  const log = options.log ?? (viewer ? null : console.log);
  const enabled = options.enabled ?? process.env.NODE_ENV !== 'production';
  if (!enabled) return (socket, next) => next();

  const send = viewer && connectViewer(viewer === true ? 4400 : viewer);

  const print = (socket, dir, event, payload) => {
    try {
      const entry = { time: new Date().toISOString().slice(11, 23), id: socket.id.slice(0, 6), dir, event, payload };
      if (send) send(entry);
      if (log) log(['[ws-tap]', entry.time, entry.id, dir, event, payload].filter(Boolean).join(' '));
    } catch {
      // a logging problem must never reach the host app
    }
  };

  return (socket, next) => {
    try {
      socket.onAny((event, ...args) => print(socket, 'IN', event, format(args, maxLength)));
      socket.onAnyOutgoing((event, ...args) => print(socket, 'OUT', event, format(args, maxLength)));
      socket.on('disconnect', (reason) => print(socket, 'disconnect', '', reason));
    } catch {
      // never block a connection because of the tap
    }
    next();
  };
}

module.exports = tap;
