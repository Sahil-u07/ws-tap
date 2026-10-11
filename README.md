# ws-tap

See live Socket.IO traffic in your console while you develop.

Every event a client sends, every event your server emits (including `io.emit` and room broadcasts), and every disconnect shows up as one line. No browser devtools digging, no `console.log` sprinkled through your handlers.

## Install

```bash
npm install --save-dev ws-tap
```

Needs `socket.io` 4.5 or newer (it uses `socket.onAnyOutgoing`).

## Usage

```js
const { Server } = require('socket.io');
const tap = require('ws-tap');

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

## Options

| Option      | Default                              | What it does |
|-------------|--------------------------------------|--------------|
| `enabled`   | `true` unless `NODE_ENV=production`  | Force logging on or off. |
| `maxLength` | `200`                                | Payloads longer than this are cut and end with `…`. |
| `log`       | `console.log`                        | Where each line goes. Gets one string per event. |

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

## Tests

```bash
npm test
```

## Roadmap

- **v2**: a terminal viewer with a scrolling, colour-coded event list.
- **v3**: filter by event or socket, and pause/resume the stream.

## License

MIT
