const httpProxy = require('http-proxy');

function describeError(error) {
  if (error == null) return { error: String(error) };
  if (typeof error !== 'object') return { error: String(error) };
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    address: error.address,
    port: error.port,
    cause: error.cause ? String(error.cause) : undefined,
    stack: error.stack,
  };
}

function createProxy() {
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    xfwd: true,
    ws: true,
    proxyTimeout: 120000,
    timeout: 120000,
  });

  proxy.on('error', (error, req, res) => {
    console.error('Proxy error', {
      method: req && req.method,
      url: req && req.url,
      host: req && req.headers && req.headers.host,
      ...describeError(error),
    });
    if (res && !res.headersSent && typeof res.writeHead === 'function') {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Upstream nicht erreichbar');
    }
  });

  proxy.on('proxyReq', (proxyReq, req) => {
    const host = req.headers.host || '';
    proxyReq.setHeader('X-Forwarded-Host', host);
    proxyReq.setHeader('X-Forwarded-Proto', req.headers['x-forwarded-proto'] || 'https');
  });

  return proxy;
}

function proxyWeb(proxy, req, res, target, rewritePath) {
  if (rewritePath) {
    req.url = rewritePath.startsWith('/') ? rewritePath : `/${rewritePath}`;
  }
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, secure: true });
}

module.exports = { createProxy, proxyWeb };
