const { Server } = require('socket.io');
const tap = require('..');

const io = new Server(3000, { cors: { origin: '*' } });
// `node example/server.js --viewer` streams to `npx ws-tap` instead of this console
io.use(tap({ viewer: process.argv.includes('--viewer') }));

io.on('connection', (socket) => {
  socket.on('chat', (msg) => socket.emit('chat-reply', { text: `you said: ${msg.text}` }));
});

console.log('listening on http://localhost:3000, run `node example/client.js` in another terminal');
