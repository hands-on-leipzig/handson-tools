const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createProxy, proxyWeb } = require('./proxy');

const VANITY_HOST = 'rg.handson.tools';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, headers: { host: VANITY_HOST, ...headers }, setHost: false },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('gateway proxy', () => {
  const seen = {};
  const upstream = http.createServer((req, res) => {
    seen.host = req.headers.host;
    seen.forwardedHost = req.headers['x-forwarded-host'];
    seen.forwardedProto = req.headers['x-forwarded-proto'];
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: `http://127.0.0.1:${upstreamPort}/next` });
      res.end();
      return;
    }
    if (req.url === '/cookie') {
      res.writeHead(200, { 'Set-Cookie': `s=1; Domain=127.0.0.1; Path=/` });
      res.end('ok');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(req.url);
  });
  let upstreamPort;
  let gateway;
  let gatewayPort;
  let deadPort;

  before(async () => {
    upstreamPort = await listen(upstream);
    const dead = http.createServer();
    deadPort = await listen(dead);
    await close(dead);

    const proxy = createProxy();
    gateway = http.createServer((req, res) => {
      const target = req.url.startsWith('/dead')
        ? `http://127.0.0.1:${deadPort}`
        : `http://127.0.0.1:${upstreamPort}`;
      const rewrite = req.url === '/s/42' ? '/carousel/42' : null;
      proxyWeb(proxy, req, res, target, rewrite);
    });
    gatewayPort = await listen(gateway);
  });

  after(async () => {
    await close(gateway);
    await close(upstream);
  });

  it('passes the request through and rewrites the path', async () => {
    const res = await request(gatewayPort, '/s/42');
    assert.equal(res.status, 200);
    assert.equal(res.body, '/carousel/42');
  });

  it('gives the upstream its own Host and keeps the public one forwarded', async () => {
    await request(gatewayPort, '/whoami');
    assert.equal(seen.host, `127.0.0.1:${upstreamPort}`);
    assert.equal(seen.forwardedHost, VANITY_HOST);
    assert.equal(seen.forwardedProto, 'http');
  });

  it('passes Traefik’s forwarded scheme through once', async () => {
    await request(gatewayPort, '/whoami', { 'x-forwarded-proto': 'https' });
    assert.equal(seen.forwardedProto, 'https');
  });

  it('keeps upstream redirects on the vanity host', async () => {
    const res = await request(gatewayPort, '/redirect');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `https://${VANITY_HOST}/next`);
  });

  it('drops the upstream cookie domain so the session belongs to the vanity host', async () => {
    const res = await request(gatewayPort, '/cookie');
    assert.ok(!/domain=/i.test(String(res.headers['set-cookie'])));
  });

  it('answers an unreachable upstream with 502 instead of hanging', async () => {
    const res = await request(gatewayPort, '/dead');
    assert.equal(res.status, 502);
    assert.match(res.body, /Dienst nicht erreichbar/);
    assert.match(res.body, new RegExp(`127.0.0.1:${deadPort}`));
  });
});
