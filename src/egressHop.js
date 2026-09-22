'use strict';

const dns = require('dns');
const net = require('net');

dns.setDefaultResultOrder('ipv6first');

const LISTEN_HOST = process.env.HOP_LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = Number(process.env.HOP_LISTEN_PORT || process.env.FLOW_HOP_PORT || 4180);
const DEST_PORT = Number(process.env.HOP_DEST_PORT || 443);
const LOOP_APEX = String(process.env.BASE_DOMAIN || 'handson.tools').toLowerCase();
const LOOP_SUFFIX = `.${LOOP_APEX}`;

function isLoopHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === LOOP_APEX || host === `www.${LOOP_APEX}`) return true;
  if (host.endsWith(LOOP_SUFFIX)) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  return false;
}

/**
 * TLS ClientHello SNI. `null` = need more bytes, `''` = not a usable hello.
 */
function parseSni(buf) {
  if (!buf || buf.length < 5) return null;
  if (buf[0] !== 0x16) return '';
  const recordLen = buf.readUInt16BE(3);
  if (buf.length < 5 + recordLen) return null;
  let offset = 5;
  if (buf[offset] !== 0x01) return '';
  offset += 4;
  if (offset + 2 + 32 + 1 > buf.length) return '';
  offset += 2;
  offset += 32;
  const sessionLen = buf[offset];
  offset += 1 + sessionLen;
  if (offset + 2 > buf.length) return '';
  const cipherLen = buf.readUInt16BE(offset);
  offset += 2 + cipherLen;
  if (offset + 1 > buf.length) return '';
  const compLen = buf[offset];
  offset += 1 + compLen;
  if (offset + 2 > buf.length) return '';
  const extLen = buf.readUInt16BE(offset);
  offset += 2;
  const extEnd = Math.min(offset + extLen, buf.length);
  while (offset + 4 <= extEnd) {
    const type = buf.readUInt16BE(offset);
    const len = buf.readUInt16BE(offset + 2);
    offset += 4;
    if (type === 0 && len >= 5 && offset + len <= buf.length) {
      const nameType = buf[offset + 2];
      const nameLen = buf.readUInt16BE(offset + 3);
      if (nameType !== 0 || nameLen < 1 || 5 + nameLen > len) return '';
      return buf.slice(offset + 5, offset + 5 + nameLen).toString('ascii').toLowerCase();
    }
    offset += len;
  }
  return '';
}

function defaultConnect(sni, callback) {
  const socket = net.connect(
    {
      host: sni,
      port: DEST_PORT,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 300,
    },
    () => {
      console.log(`hop ${sni} → ${socket.remoteAddress}`);
      callback();
    },
  );
  socket.on('error', (err) => {
    console.error(`hop ${sni} ${err.code || err.message}`);
  });
  return socket;
}

function createHopServer({ connect = defaultConnect } = {}) {
  return net.createServer((client) => {
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const sni = parseSni(buf);
      if (sni === null) {
        if (buf.length > 16 * 1024) client.destroy();
        return;
      }
      client.pause();
      client.removeListener('data', onData);
      if (!sni || isLoopHost(sni)) {
        console.error(`hop reject ${sni || 'no-sni'}`);
        client.destroy();
        return;
      }
      const dest = connect(sni, () => {
        dest.write(buf);
        client.pipe(dest);
        dest.pipe(client);
        client.resume();
      });
      dest.on('error', () => client.destroy());
    };
    client.on('data', onData);
    client.on('error', () => client.destroy());
  });
}

function listen(server = createHopServer()) {
  server.on('error', (err) => {
    console.error(`egress hop listen failed: ${err.code || err.message}`);
    process.exit(1);
  });
  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    console.log(`egress hop on ${LISTEN_HOST}:${LISTEN_PORT} → *:${DEST_PORT} (ipv6first)`);
  });
  return server;
}

if (require.main === module) {
  listen();
}

module.exports = { parseSni, isLoopHost, createHopServer, listen };
