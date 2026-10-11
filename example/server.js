const { Server } = require('socket.io');
const tap = require('..');

const io = new Server(3000, { cors: { origin: '*' } });
io.use(tap());

io.on('connection', (socket) => {
  socket.on('chat', (msg) => socket.emit('chat-reply', { text: `you said: ${msg.text}` }));
});

console.log('listening on http://localhost:3000, run `node example/client.js` in another terminal');
