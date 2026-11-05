const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function request(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        host: 'flow.handson.tools',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('proxied JSON body', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handson-proxy-'));
  const seen = {};
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      seen.body = Buffer.concat(chunks).toString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  let gateway;
  let gatewayPort;

  before(async () => {
    const upstreamPort = await listen(upstream);
    fs.writeFileSync(path.join(dir, 'shorts.json'), JSON.stringify({
      version: 1,
      apexTarget: `http://127.0.0.1:${upstreamPort}`,
      apps: [{
        slug: 'flow',
        title: 'FLOW',
        subtitle: '',
        target: `http://127.0.0.1:${upstreamPort}`,
        mode: 'proxy',
        listed: true,
      }],
    }));
    process.env.SHORTS_FILE = path.join(dir, 'shorts.json');
    const { createApp } = require('./app');
    gateway = http.createServer(createApp());
    gatewayPort = await listen(gateway);
  });

  after(async () => {
    if (gateway) await close(gateway);
    await close(upstream);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('forwards a JSON POST body to the upstream', async () => {
    const payload = '{"email":"a@b.co"}';
    const res = await request(gatewayPort, '/api/public-volunteer-form/x/otp', payload);
    assert.equal(res.status, 200);
    assert.equal(seen.body, payload);
  });
});
