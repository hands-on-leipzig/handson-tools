const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const tls = require('tls');
const { parseSni, isLoopHost, createHopServer } = require('./egressHop');

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function captureClientHello(servername) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.once('data', (data) => {
        socket.destroy();
        server.close(() => resolve(data));
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const sock = tls.connect({
        host: '127.0.0.1',
        port,
        servername,
        rejectUnauthorized: false,
      });
      sock.on('error', () => {});
      sock.setTimeout(500, () => sock.destroy());
    });
  });
}

describe('parseSni', () => {
  it('reads the server name from a TLS ClientHello', async () => {
    const hello = await captureClientHello('timer.hands-on-technology.org');
    assert.equal(parseSni(hello), 'timer.hands-on-technology.org');
  });

  it('returns null until the record is complete', () => {
    assert.equal(parseSni(Buffer.from([0x16, 0x03, 0x01])), null);
  });
});

describe('isLoopHost', () => {
  it('blocks the gateway’s own names', () => {
    assert.equal(isLoopHost('handson.tools'), true);
    assert.equal(isLoopHost('flow.handson.tools'), true);
    assert.equal(isLoopHost('timer.hands-on-technology.org'), false);
  });
});

describe('egress hop', () => {
  it('forwards the ClientHello to the SNI destination', async () => {
    const chunks = [];
    const target = net.createServer((socket) => {
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('data', () => socket.end());
    });
    const destPort = await listen(target);

    const hop = createHopServer({
      connect: (_sni, cb) => net.connect({ host: '127.0.0.1', port: destPort }, cb),
    });
    const hopPort = await listen(hop);

    const hello = await captureClientHello('pfand.hands-on-technology.org');
    await new Promise((resolve, reject) => {
      const client = net.connect({ host: '127.0.0.1', port: hopPort }, () => client.write(hello));
      client.on('end', () => {
        client.destroy();
        resolve();
      });
      client.on('error', reject);
      client.setTimeout(1000, () => {
        client.destroy();
        resolve();
      });
    });

    await close(hop);
    await close(target);
    assert.equal(parseSni(Buffer.concat(chunks)), 'pfand.hands-on-technology.org');
  });
});
