const net = require('net');

const SECRET_KEYS = /^(password|token|secret|authorization)$/i;

// Same text as JSON.stringify of the payload with secrets hidden and cycles/binary replaced,
// but written in one pass that stops as soon as it passes maxLength, so huge payloads stay cheap.
function format(args, maxLength) {
  let out = '';
  const parents = new Set();

  // returns false when the value has no JSON form (undefined, symbol), like JSON.stringify
  const walk = (v, inArray) => {
    if (typeof v === 'function') v = '<ack>';
    if (v === null) return (out += 'null'), true;
    switch (typeof v) {
      case 'string': return (out += JSON.stringify(v)), true;
      case 'number': return (out += Number.isFinite(v) ? String(v) : 'null'), true;
      case 'boolean': return (out += v), true;
      case 'bigint': throw new TypeError('Do not know how to serialize a BigInt');
      case 'object': break;
      default: return inArray ? ((out += 'null'), true) : false;
    }
    if (Buffer.isBuffer(v) || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
      return (out += `"<Buffer ${v.byteLength} bytes>"`), true;
    }
    if (typeof v.toJSON === 'function') return walk(v.toJSON(), inArray);
    if (out.length > maxLength) return true; // past the cut, the rest is never shown
    if (parents.has(v)) return (out += '"[circular]"'), true;

    parents.add(v);
    if (Array.isArray(v)) {
      out += '[';
      for (let i = 0; i < v.length && out.length <= maxLength; i++) {
        if (i) out += ',';
        walk(v[i], true);
      }
      out += ']';
    } else {
      out += '{';
      let first = true;
      for (const k of Object.keys(v)) {
        if (out.length > maxLength) break;
        const mark = out.length;
        out += (first ? '' : ',') + JSON.stringify(k) + ':';
        if (SECRET_KEYS.test(k)) out += '"[redacted]"';
        else if (!walk(v[k], false)) { out = out.slice(0, mark); continue; } // skipped like JSON.stringify
        first = false;
      }
      out += '}';
    }
    parents.delete(v); // only ancestors count as cycles, not shared references
    return true;
  };

  for (let i = 0; i < args.length && out.length <= maxLength; i++) {
    if (i) out += ' ';
    const mark = out.length;
    if (!walk(args[i], false)) out = out.slice(0, mark) + String(args[i]);
  }
  return out.length > maxLength ? out.slice(0, maxLength) + '…' : out;
}

// Busy servers log many events per millisecond, so build the HH:MM:SS.mmm string once per ms.
let lastMs = -1;
let lastTime = '';
function timestamp() {
  const ms = Date.now();
  if (ms !== lastMs) {
    lastMs = ms;
    lastTime = new Date(ms).toISOString().slice(11, 23);
  }
  return lastTime;
}

// Streams entries to a running `ws-tap` viewer as JSON lines; drops them while none is listening.
function connectViewer(port) {
  let conn = null;
  let nextTry = 0;
  return {
    // also (re)connects, at most once a second
    ready() {
      if (!conn && Date.now() >= nextTry) {
        nextTry = Date.now() + 1000;
        conn = net.connect(port, '127.0.0.1').unref(); // never keep the host process alive
        conn.on('error', () => {}).on('close', () => (conn = null));
      }
      return conn !== null && conn.writableLength < 1e6; // drop if the viewer falls behind
    },
    send(entry) {
      conn.write(JSON.stringify(entry) + '\n');
    },
  };
}

function tap(options = {}) {
  const { maxLength = 200, viewer } = options;
  const log = options.log ?? (viewer ? null : console.log);
  const enabled = options.enabled ?? process.env.NODE_ENV !== 'production';
  if (!enabled) return (socket, next) => next();

  const view = viewer && connectViewer(viewer === true ? 4400 : viewer);

  // getPayload is only called when someone will see the line
  const print = (socket, dir, event, getPayload) => {
    try {
      const toViewer = view && view.ready();
      if (!log && !toViewer) return;
      const payload = getPayload();
      const entry = { time: timestamp(), id: socket.id.slice(0, 6), dir, event, payload };
      if (toViewer) view.send(entry);
      if (log) log(['[ws-tap]', entry.time, entry.id, dir, event, payload].filter(Boolean).join(' '));
    } catch {
      // a logging problem must never reach the host app
    }
  };

  return (socket, next) => {
    try {
      socket.onAny((event, ...args) => print(socket, 'IN', event, () => format(args, maxLength)));
      socket.onAnyOutgoing((event, ...args) => print(socket, 'OUT', event, () => format(args, maxLength)));
      socket.on('disconnect', (reason) => print(socket, 'disconnect', '', () => reason));
    } catch {
      // never block a connection because of the tap
    }
    next();
  };
}

module.exports = tap;
