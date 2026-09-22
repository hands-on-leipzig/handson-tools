'use strict';

/**
 * Outbound connections to the apps behind handson.tools.
 *
 * Every app is a public HTTPS origin, so the gateway needs a working route to
 * the internet. Two routes exist and either can be broken on its own:
 *
 *   direct — from the container, IPv4 or IPv6 (Happy Eyeballs)
 *   hop    — through the SNI router on the host (src/egressHop.js), which has
 *            the host's routing table, including IPv6
 *
 * TLS connections try both, the hop staggered behind the direct attempt, and
 * the first finished handshake wins. A dead hop or a black-holed route then
 * costs a few hundred milliseconds instead of taking every app down. Nothing
 * here knows any hostname: whatever the admin UI stores is what gets dialled.
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');

const HOP_DELAY_MS = Number(process.env.EGRESS_HOP_DELAY_MS || 250);
const CONNECT_TIMEOUT_MS = Number(process.env.EGRESS_CONNECT_TIMEOUT_MS || 10000);
const FAMILY_ATTEMPT_MS = 250;
const MAX_SOCKETS = 128;
const TLS_PORT = 443;

function hopFromEnv(env = process.env) {
  const host = String(env.EGRESS_HOP_HOST || '').trim();
  if (!host) return null;
  const port = Number(env.EGRESS_HOP_PORT || 4180);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { host, port };
}

function once(fn) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    fn(...args);
  };
}

/**
 * Start the attempts one after another, `delayMs` apart, and keep the first
 * socket that comes up. An attempt is `(done) => socket`; it reports through
 * `done(error)` or `done(null, socket)`. A failing attempt pulls the next one
 * forward instead of waiting out the stagger.
 */
function race(attempts, options, callback) {
  const { delayMs = HOP_DELAY_MS, timeoutMs = CONNECT_TIMEOUT_MS } = options || {};
  const done = once(callback);
  const open = [];
  let scheduled = null;
  let next = 0;
  let pending = 0;
  let lastError = null;
  let settled = false;

  function settle(error, socket) {
    if (settled) {
      if (socket) socket.destroy();
      return;
    }
    settled = true;
    clearTimeout(scheduled);
    clearTimeout(deadline);
    for (const other of open) {
      if (other !== socket) other.destroy();
    }
    done(error, socket);
  }

  function startNext() {
    clearTimeout(scheduled);
    scheduled = null;
    if (settled || next >= attempts.length) return;
    const attempt = attempts[next];
    next += 1;
    pending += 1;
    if (next < attempts.length) scheduled = setTimeout(startNext, delayMs);
    const socket = attempt(once((error, ready) => {
      pending -= 1;
      if (!error) {
        settle(null, ready);
        return;
      }
      lastError = error;
      if (pending > 0) return;
      if (next < attempts.length) startNext();
      else settle(error);
    }));
    if (socket) open.push(socket);
  }

  const deadline = setTimeout(() => {
    settle(Object.assign(new Error(`Upstream antwortet nicht (${timeoutMs} ms)`), {
      code: 'ETIMEDOUT',
      cause: lastError || undefined,
    }));
  }, timeoutMs);

  startNext();
}

function directSocket(host, port) {
  return net.connect({
    host,
    port,
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: FAMILY_ATTEMPT_MS,
  });
}

/** Plain TCP attempt — used for http upstreams and for diagnostics. */
function tcpAttempt(createSocket, via = 'direct') {
  return (done) => {
    let socket;
    try {
      socket = createSocket();
    } catch (error) {
      done(Object.assign(error, { via }));
      return null;
    }
    const fail = (error) => {
      socket.destroy();
      done(Object.assign(error, { via }));
    };
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.removeListener('error', fail);
      done(null, socket);
    });
    return socket;
  };
}

/**
 * TLS attempt. The handshake — not the TCP connect — decides the race: the hop
 * accepts every connection and only then dials the SNI host, so a TCP-level
 * race would always pick the hop.
 */
function tlsAttempt(createSocket, { servername, rejectUnauthorized, via }) {
  return (done) => {
    let raw;
    try {
      raw = createSocket();
    } catch (error) {
      done(Object.assign(error, { via }));
      return null;
    }
    const secure = tls.connect({
      socket: raw,
      servername,
      rejectUnauthorized,
      ALPNProtocols: ['http/1.1'],
    });
    const fail = (error) => {
      raw.destroy();
      secure.destroy();
      done(Object.assign(error, { via }));
    };
    raw.once('error', fail);
    secure.once('error', fail);
    secure.once('secureConnect', () => {
      raw.removeListener('error', fail);
      secure.removeListener('error', fail);
      secure.egressPath = via;
      done(null, secure);
    });
    return secure;
  };
}

function secureAttempts(host, port, tlsOptions, hop) {
  const attempts = [tlsAttempt(() => directSocket(host, port), { ...tlsOptions, via: 'direct' })];
  // The hop dials its SNI host on 443; other ports have to go direct.
  if (hop && port === TLS_PORT) {
    attempts.push(tlsAttempt(() => directSocket(hop.host, hop.port), { ...tlsOptions, via: 'hop' }));
  }
  return attempts;
}

function connectSecure(options, callback) {
  const host = options.host || options.hostname;
  const port = Number(options.port) || TLS_PORT;
  const hop = options.hop === undefined ? hopFromEnv() : options.hop;
  const tlsOptions = {
    servername: options.servername || (net.isIP(host) ? undefined : host),
    rejectUnauthorized: options.rejectUnauthorized !== false,
  };
  race(secureAttempts(host, port, tlsOptions, hop), {
    delayMs: options.hopDelayMs,
    timeoutMs: options.timeoutMs,
  }, callback);
}

function createHttpsAgent(agentOptions = {}) {
  const agent = new https.Agent({ keepAlive: true, maxSockets: MAX_SOCKETS, ...agentOptions });
  agent.createConnection = function createConnection(options, callback) {
    connectSecure(options, callback);
  };
  return agent;
}

function createHttpAgent(agentOptions = {}) {
  return new http.Agent({ keepAlive: true, maxSockets: MAX_SOCKETS, ...agentOptions });
}

const httpsAgent = createHttpsAgent();
const httpAgent = createHttpAgent();

function parseTarget(target) {
  try {
    return new URL(String(target));
  } catch {
    return null;
  }
}

function agentFor(target) {
  const url = parseTarget(target);
  if (!url) return undefined;
  return url.protocol === 'https:' ? httpsAgent : httpAgent;
}

function runAttempt(attempt, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    race([attempt], { timeoutMs }, (error, socket) => {
      if (socket) socket.destroy();
      resolve({
        ok: !error,
        ms: Date.now() - started,
        error: error ? error.code || error.message : undefined,
      });
    });
  });
}

/**
 * Check both routes to one upstream, for /admin/api/egress. Reports each route
 * on its own so a broken one is visible even while the other still serves.
 */
async function probe(target, options = {}) {
  const url = parseTarget(target);
  if (!url) return { target: String(target), error: 'Zieladresse ungültig' };
  const timeoutMs = options.timeoutMs || 5000;
  const hop = options.hop === undefined ? hopFromEnv() : options.hop;

  if (url.protocol !== 'https:') {
    const port = Number(url.port) || 80;
    return {
      target: url.origin,
      direct: await runAttempt(tcpAttempt(() => directSocket(url.hostname, port)), timeoutMs),
      hop: { skipped: 'nur TLS' },
    };
  }

  const port = Number(url.port) || TLS_PORT;
  const tlsOptions = {
    servername: net.isIP(url.hostname) ? undefined : url.hostname,
    rejectUnauthorized: true,
  };
  const [direct, viaHop] = secureAttempts(url.hostname, port, tlsOptions, hop);
  return {
    target: url.origin,
    direct: await runAttempt(direct, timeoutMs),
    hop: viaHop ? await runAttempt(viaHop, timeoutMs) : { skipped: hop ? 'Port ≠ 443' : 'nicht konfiguriert' },
  };
}

module.exports = {
  agentFor,
  probe,
  hopFromEnv,
  race,
  tcpAttempt,
  tlsAttempt,
  connectSecure,
  createHttpsAgent,
  createHttpAgent,
};
