const net = require('net');

const store = new Map();

const server = net.createServer((socket) => {
  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();

    while (buffer.length > 0) {
      // Handle inline or RESP commands
      let lineEnd = buffer.indexOf('\r\n');
      if (lineEnd === -1) break;

      let line = buffer.substring(0, lineEnd);

      if (line.startsWith('*')) {
        // Multi-bulk array (e.g. *1\r\n$4\r\nPING\r\n)
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
          store.set(args[1], args[2]);
          socket.write('+OK\r\n');
        } else if (cmd === 'GET') {
          const val = store.get(args[1]);
          if (val === undefined) {
            socket.write('$-1\r\n');
          } else {
            socket.write(`$${Buffer.byteLength(val)}\r\n${val}\r\n`);
          }
        } else if (cmd === 'DEL') {
          let count = 0;
          for (let i = 1; i < args.length; i++) {
            if (store.delete(args[i])) count++;
          }
          socket.write(`:${count}\r\n`);
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

  socket.on('error', () => {});
});

const PORT = 6379;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[GroundGuard Dev Redis] Native RESP server listening on 127.0.0.1:${PORT}`);
});
