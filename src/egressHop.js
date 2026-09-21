'use strict';

const net = require('net');

const LISTEN_HOST = process.env.HOP_LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = Number(process.env.HOP_LISTEN_PORT || process.env.FLOW_HOP_PORT || 4180);
const DEST_PORT = Number(process.env.HOP_DEST_PORT || 443);
const LOOP_SUFFIX = `.${String(process.env.BASE_DOMAIN || 'handson.tools').toLowerCase()}`;
const LOOP_APEX = String(process.env.BASE_DOMAIN || 'handson.tools').toLowerCase();

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
  return net.connect(
    {
      host: sni,
      port: DEST_PORT,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 400,
    },
    callback,
  );
}

function pipe(a, b) {
  a.pipe(b);
  b.pipe(a);
  const close = () => {
    a.destroy();
    b.destroy();
  };
  a.on('error', close);
  b.on('error', close);
  a.on('close', () => b.destroy());
  b.on('close', () => a.destroy());
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
      client.removeListener('data', onData);
      if (!sni || isLoopHost(sni)) {
        client.destroy();
        return;
      }
      let dest;
      try {
        dest = connect(sni, () => {
          dest.write(buf);
          pipe(client, dest);
        });
      } catch {
        client.destroy();
        return;
      }
      dest.setTimeout(15000, () => {
        dest.destroy();
        client.destroy();
      });
      dest.on('connect', () => dest.setTimeout(0));
      dest.on('error', () => client.destroy());
    };
    client.on('data', onData);
    client.on('error', () => client.destroy());
  });
}

function listen(server = createHopServer()) {
  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    console.log(`egress hop on ${LISTEN_HOST}:${LISTEN_PORT} → *:${DEST_PORT}`);
  });
  return server;
}

if (require.main === module) {
  listen();
}

module.exports = { parseSni, isLoopHost, createHopServer, listen };
