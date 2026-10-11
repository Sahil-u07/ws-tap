# Changelog

## 0.3.0

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
