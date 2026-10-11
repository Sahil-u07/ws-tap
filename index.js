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

function tap(options = {}) {
  const { maxLength = 200, log = console.log } = options;
  const enabled = options.enabled ?? process.env.NODE_ENV !== 'production';
  if (!enabled) return (socket, next) => next();

  const print = (socket, ...parts) => {
    try {
      const time = new Date().toISOString().slice(11, 23);
      log(['[ws-tap]', time, socket.id.slice(0, 6), ...parts].filter(Boolean).join(' '));
    } catch {
      // a logging problem must never reach the host app
    }
  };

  return (socket, next) => {
    try {
      socket.onAny((event, ...args) => print(socket, 'IN', event, format(args, maxLength)));
      socket.onAnyOutgoing((event, ...args) => print(socket, 'OUT', event, format(args, maxLength)));
      socket.on('disconnect', (reason) => print(socket, 'disconnect', reason));
    } catch {
      // never block a connection because of the tap
    }
    next();
  };
}

module.exports = tap;
