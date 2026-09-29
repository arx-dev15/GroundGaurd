const net = require('net');

const store = new Map();
// channel -> Set<net.Socket>
const subscribers = new Map();
// socket -> Set<channel>
const socketChannels = new Map();

function cleanKey(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
}

const server = net.createServer((socket) => {
  let buffer = '';

  const cleanupSocket = () => {
    const chans = socketChannels.get(socket);
    if (chans) {
      for (const ch of chans) {
        const subs = subscribers.get(ch);
        if (subs) {
          subs.delete(socket);
          if (subs.size === 0) subscribers.delete(ch);
        }
      }
      socketChannels.delete(socket);
    }
  };

  socket.on('close', cleanupSocket);
  socket.on('error', cleanupSocket);

  socket.on('data', (data) => {
    buffer += data.toString();

    while (buffer.length > 0) {
      let lineEnd = buffer.indexOf('\r\n');
      if (lineEnd === -1) break;

      let line = buffer.substring(0, lineEnd);

      if (line.startsWith('*')) {
        const numArgs = parseInt(line.substring(1), 10);
        let pos = lineEnd + 2;
        const args = [];
        let valid = true;

        for (let i = 0; i < numArgs; i++) {
          const nextEnd = buffer.indexOf('\r\n', pos);
          if (nextEnd === -1) { valid = false; break; }
          const lenLine = buffer.substring(pos, nextEnd);
          if (!lenLine.startsWith('$')) { valid = false; break; }
          const argLen = parseInt(lenLine.substring(1), 10);
          const argStart = nextEnd + 2;
          if (buffer.length < argStart + argLen + 2) { valid = false; break; }
          args.push(buffer.substring(argStart, argStart + argLen));
          pos = argStart + argLen + 2;
        }

        if (!valid) break;
        buffer = buffer.substring(pos);

        const cmd = (args[0] || '').toUpperCase();
        if (cmd === 'PING') {
          socket.write('+PONG\r\n');
        } else if (cmd === 'INFO') {
          const info = 'redis_version:7.2.0\r\nrole:master\r\n';
          socket.write(`$${info.length}\r\n${info}\r\n`);
        } else if (cmd === 'SET') {
          const key = args[1];
          const val = args[2];
          let expiresAt = undefined;
          if (args.length >= 5 && args[3].toUpperCase() === 'EX') {
            const secs = parseInt(args[4], 10);
            if (!isNaN(secs)) expiresAt = Date.now() + secs * 1000;
          } else if (args.length >= 5 && args[3].toUpperCase() === 'PX') {
            const ms = parseInt(args[4], 10);
            if (!isNaN(ms)) expiresAt = Date.now() + ms;
          }
          store.set(key, { val, expiresAt });
          socket.write('+OK\r\n');
        } else if (cmd === 'GET') {
          const entry = cleanKey(args[1]);
          if (!entry) {
            socket.write('$-1\r\n');
          } else {
            socket.write(`$${Buffer.byteLength(entry.val)}\r\n${entry.val}\r\n`);
          }
        } else if (cmd === 'TTL') {
          const entry = cleanKey(args[1]);
          if (!entry) {
            socket.write(':-2\r\n'); // key does not exist
          } else if (!entry.expiresAt) {
            socket.write(':-1\r\n'); // key exists but has no expiration
          } else {
            const ttlSec = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
            socket.write(`:${ttlSec}\r\n`);
          }
        } else if (cmd === 'EXPIRE') {
          const entry = cleanKey(args[1]);
          if (!entry) {
            socket.write(':0\r\n');
          } else {
            const secs = parseInt(args[2], 10);
            entry.expiresAt = Date.now() + secs * 1000;
            socket.write(':1\r\n');
          }
        } else if (cmd === 'DEL') {
          let count = 0;
          for (let i = 1; i < args.length; i++) {
            if (store.delete(args[i])) count++;
          }
          socket.write(`:${count}\r\n`);
        } else if (cmd === 'PUBLISH') {
          const channel = args[1];
          const message = args[2];
          const subs = subscribers.get(channel);
          let count = 0;
          if (subs) {
            count = subs.size;
            const resp = `*3\r\n$7\r\nmessage\r\n$${Buffer.byteLength(channel)}\r\n${channel}\r\n$${Buffer.byteLength(message)}\r\n${message}\r\n`;
            for (const subSocket of subs) {
              try {
                subSocket.write(resp);
              } catch (_) {}
            }
          }
          socket.write(`:${count}\r\n`);
        } else if (cmd === 'SUBSCRIBE') {
          if (!socketChannels.has(socket)) {
            socketChannels.set(socket, new Set());
          }
          const chans = socketChannels.get(socket);
          for (let i = 1; i < args.length; i++) {
            const ch = args[i];
            chans.add(ch);
            if (!subscribers.has(ch)) {
              subscribers.set(ch, new Set());
            }
            subscribers.get(ch).add(socket);
            socket.write(`*3\r\n$9\r\nsubscribe\r\n$${Buffer.byteLength(ch)}\r\n${ch}\r\n:${chans.size}\r\n`);
          }
        } else if (cmd === 'UNSUBSCRIBE') {
          const chans = socketChannels.get(socket) || new Set();
          const targetChans = args.length > 1 ? args.slice(1) : Array.from(chans);
          for (const ch of targetChans) {
            chans.delete(ch);
            const subs = subscribers.get(ch);
            if (subs) subs.delete(socket);
            socket.write(`*3\r\n$11\r\nunsubscribe\r\n$${Buffer.byteLength(ch)}\r\n${ch}\r\n:${chans.size}\r\n`);
          }
        } else if (cmd === 'SELECT') {
          socket.write('+OK\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('+OK\r\n');
          socket.end();
        } else if (cmd === 'CLIENT') {
          socket.write('+OK\r\n');
        } else {
          socket.write('+OK\r\n');
        }
      } else {
        // Plain inline command
        buffer = buffer.substring(lineEnd + 2);
        const parts = line.trim().split(/\s+/);
        const cmd = (parts[0] || '').toUpperCase();
        if (cmd === 'PING') {
          socket.write('+PONG\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('+OK\r\n');
          socket.end();
        } else {
          socket.write('+OK\r\n');
        }
      }
    }
  });
});

const PORT = 6379;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[GroundGuard Dev Redis] Native RESP server listening on 127.0.0.1:${PORT}`);
});
