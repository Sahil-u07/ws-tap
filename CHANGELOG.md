# Changelog

## 0.3.1

- Faster: the timestamp is built once per millisecond instead of once per event, and each line is written in one pass that stops at `maxLength`. In `npm run bench` (same laptop, same session, median of 7 interleaved runs) console mode went from 21,395 to 24,101 round trips per second (+13%) and viewer mode from 21,340 to 26,865 (+26%).
- Viewer mode with no viewer running now skips formatting entirely.
- Huge payloads are no longer fully read and stringified just to be truncated: reading stops at `maxLength`.
- A payload that can't be serialized (like a BigInt) can no longer throw into the host app.
- Output is unchanged. A new test checks the formatter against the previous one on 3,000 random payloads.

## 0.3.0

- First release on npm, as `@sahil-u07/ws-tap`. The viewer command is still `ws-tap`.
- Viewer: `p` / space pauses and resumes. Events that arrive while paused are held (up to 1000) and printed on resume.
- Viewer: `f` / `/` sets a filter. `chat` matches event names, `@abc` matches socket ids. Also available at startup as `--filter`.
- Viewer ignores lines that aren't ws-tap entries.

## 0.2.0

- New `npx ws-tap` terminal viewer with colour-coded IN / OUT / disconnect and a colour per socket.
- New `viewer` option streams events to the viewer over localhost instead of the console.

## 0.1.0

- `io.use(tap())` logs every incoming and outgoing event and every disconnect.
- Redacts `password`, `token`, `secret` and `authorization` at any depth, handles circular objects and Buffers, truncates long payloads.
- Does nothing in production unless `enabled: true`, and never throws into the host app.
