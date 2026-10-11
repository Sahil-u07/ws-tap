const { io } = require('socket.io-client');

const socket = io('http://localhost:3000');
setInterval(() => socket.emit('chat', { text: 'hi' }), 1000);
socket.on('chat-reply', (msg) => console.log('got', msg));
