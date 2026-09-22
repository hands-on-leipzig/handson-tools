const httpProxy = require('http-proxy');
const { agentFor } = require('./egress');
const { escapeHtml } = require('./escape');

/** Idle timeout on the upstream response. Connect failures surface earlier. */
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']);

/** http-proxy hands the error handler a parsed target, `proxyWeb` a string. */
function targetHost(target) {
  if (target && typeof target === 'object') return target.host || target.hostname || '';
  try {
    return new URL(String(target)).host;
  } catch {
    return String(target || '');
  }
}

function describeError(error) {
  if (error == null || typeof error !== 'object') return { error: String(error) };
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    via: error.via,
    address: error.address,
    port: error.port,
    cause: error.cause ? String(error.cause) : undefined,
  };
}

function errorPage(host, upstream) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dienst nicht erreichbar</title>
<style>
  body { margin: 0; display: grid; place-items: center; min-height: 100vh;
         font: 16px/1.5 system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
  main { max-width: 32rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.4rem; margin: 0 0 .75rem; }
  code { color: #94a3b8; }
  a { color: #38bdf8; }
</style></head>
<body><main>
<h1>Dienst nicht erreichbar</h1>
<p><code>${escapeHtml(host)}</code> erreicht <code>${escapeHtml(upstream)}</code> gerade nicht.</p>
<p>Später erneut versuchen oder <a href="https://handson.tools/">handson.tools</a> öffnen.</p>
</main></body></html>`;
}

function sendError(req, res, error, target) {
  const status = TIMEOUT_CODES.has(error && error.code) ? 504 : 502;
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(errorPage(req.headers.host || '', targetHost(target)));
}

function firstValue(header) {
  return String(header || '').split(',')[0].trim();
}

/**
 * Tell the upstream who asked and under which name. Written onto the incoming
 * headers, which http-proxy copies: the `proxyReq` event fires too late once
 * the socket is opened asynchronously.
 */
function setForwarded(req) {
  const socket = req.socket || {};
  const headers = req.headers;
  headers['x-forwarded-for'] = firstValue(headers['x-forwarded-for']) || socket.remoteAddress || '';
  headers['x-forwarded-host'] = firstValue(headers['x-forwarded-host']) || headers.host || '';
  headers['x-forwarded-proto'] = firstValue(headers['x-forwarded-proto'])
    || (socket.encrypted ? 'https' : 'http');
}

function createProxy() {
  const proxy = httpProxy.createProxyServer({
    // Upstreams are name-based vhosts, so they must see their own Host header.
    changeOrigin: true,
    ws: true,
    secure: true,
    // Keep the visitor on the vanity host: rewrite upstream redirects back to
    // the requested host and let upstream cookies belong to it.
    autoRewrite: true,
    protocolRewrite: 'https',
    cookieDomainRewrite: '',
    proxyTimeout: UPSTREAM_TIMEOUT_MS,
  });

  proxy.on('error', (error, req, res, target) => {
    console.error('Proxy error', {
      method: req && req.method,
      host: req && req.headers && req.headers.host,
      url: req && req.url,
      target: targetHost(target),
      ...describeError(error),
    });
    if (!res) return;
    if (typeof res.writeHead === 'function') {
      sendError(req, res, error, target);
      return;
    }
    // Upgrade requests: `res` is the raw socket.
    res.destroy();
  });

  return proxy;
}

function rewrite(req, rewritePath) {
  if (!rewritePath) return;
  req.url = rewritePath.startsWith('/') ? rewritePath : `/${rewritePath}`;
}

function proxyWeb(proxy, req, res, target, rewritePath) {
  rewrite(req, rewritePath);
  setForwarded(req);
  proxy.web(req, res, { target, agent: agentFor(target) });
}

function proxyWebSocket(proxy, req, socket, head, target, rewritePath) {
  rewrite(req, rewritePath);
  setForwarded(req);
  socket.on('error', () => socket.destroy());
  proxy.ws(req, socket, head, { target, agent: agentFor(target) });
}

module.exports = { createProxy, proxyWeb, proxyWebSocket, errorPage };
