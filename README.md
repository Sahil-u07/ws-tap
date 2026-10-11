# ws-tap

[![test](https://github.com/Sahil-u07/ws-tap/actions/workflows/test.yml/badge.svg)](https://github.com/Sahil-u07/ws-tap/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/@sahil-u07/ws-tap)](https://www.npmjs.com/package/@sahil-u07/ws-tap)
[![license](https://img.shields.io/npm/l/@sahil-u07/ws-tap)](LICENSE)

See live Socket.IO traffic while you develop, either in your console or in a separate terminal viewer you can pause and filter.

![ws-tap demo: events streaming into the viewer, pausing and filtering](docs/demo.gif)

Every event a client sends, every event your server emits (including `io.emit` and room broadcasts), and every disconnect shows up as one line. No browser devtools digging, no `console.log` sprinkled through your handlers.

## Install

```bash
npm install --save-dev @sahil-u07/ws-tap
```

Needs `socket.io` 4.5 or newer (it uses `socket.onAnyOutgoing`) and Node 22.13 or newer. No other dependencies.

## Usage

```js
const { Server } = require('socket.io');
const tap = require('@sahil-u07/ws-tap');

const io = new Server(3000);
io.use(tap());
```

That's it.

## Example output

```
[ws-tap] 18:36:31.696 j9jjbf IN chat {"text":"hi"}
[ws-tap] 18:36:31.697 j9jjbf OUT chat-reply {"text":"you said: hi"}
[ws-tap] 18:36:33.632 j9jjbf disconnect transport close
```

Format: `[ws-tap] <time> <first 6 chars of socket id> IN|OUT <event> <payload>`.

## Terminal viewer

If your server already prints a lot, send the traffic to its own terminal instead. Start the viewer:

```bash
npx ws-tap
```

(That works in a project where ws-tap is installed. Without installing, use `npx @sahil-u07/ws-tap`.)

and turn on `viewer` in your server:

```js
io.use(tap({ viewer: true }));
```

Events then scroll by in the viewer, colour-coded: `IN` green, `OUT` cyan, `disconnect` red, and each socket id gets its own colour so you can follow one client among many. Your server console stays quiet.

- Start the viewer and your server in either order. ws-tap connects when the viewer comes up and reconnects if you restart it.
- If no viewer is running, events are just dropped. Nothing is buffered and your app isn't affected.
- Use another port with `npx ws-tap --port 5000` and `tap({ viewer: 5000 })`. The default is 4400.
- Several servers can stream to the same viewer.
- The viewer only listens on `127.0.0.1`, and redaction and truncation happen inside your app before anything is sent.

### Pause and filter

While the viewer is running:

| Key | What it does |
|-----|--------------|
| `p` or space | Pause / resume. Events that arrive while paused are held (up to 1000) and printed when you resume. |
| `f` or `/` | Set a filter, then press Enter. Esc keeps the old one, and an empty filter shows everything. |
| `q` or Ctrl+C | Quit. |

Filters:

- `chat` shows only events whose name contains `chat` (not case-sensitive).
- `@abc` shows only sockets whose id starts with `abc` (the ids are the coloured column).

You can also start with a filter: `npx ws-tap --filter chat` or `npx ws-tap -f @abc`.

## Options

| Option      | Default                              | What it does |
|-------------|--------------------------------------|--------------|
| `enabled`   | `true` unless `NODE_ENV=production`  | Force logging on or off. |
| `maxLength` | `200`                                | Payloads longer than this are cut and end with `…`. |
| `log`       | `console.log` (none when `viewer` is set) | Where each line goes. Gets one string per event. |
| `viewer`    | off                                  | `true` or a port number: stream events to `npx ws-tap`. |

```js
io.use(tap({ maxLength: 500, log: (line) => logger.debug(line) }));
```

## Safety

ws-tap is meant to be left in your dev setup without worrying about it.

- **Off in production.** When `NODE_ENV=production` it does nothing unless you pass `enabled: true`.
- **Never breaks your app.** Every hook is wrapped, so even a `log` function that throws can't crash the server or block a connection.
- **Hides secrets.** Values under `password`, `token`, `secret` and `authorization` keys (any case, any depth) print as `[redacted]`.
- **Handles odd payloads.** Circular objects print `[circular]`, Buffers print `<Buffer N bytes>`, ack callbacks print `<ack>`.
- **Short lines.** Big payloads are truncated (see `maxLength`).

## Try it

```bash
npm install
npm run example
```

Then in a second terminal:

```bash
node example/client.js
```

The client sends `chat` every second and the server replies with `chat-reply`, and you'll see both directions in the server terminal.

To try the viewer instead, run `npm run viewer` in one terminal, `node example/server.js --viewer` in another, and the client in a third.

## Tests

```bash
npm test
```

## Roadmap

- ~~**v2**: a terminal viewer with a scrolling, colour-coded event list.~~ Done.
- ~~**v3**: filter by event or socket, and pause/resume the stream.~~ Done.

## License

MIT
