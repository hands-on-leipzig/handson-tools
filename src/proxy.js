const httpProxy = require('http-proxy');

function createProxy() {
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    xfwd: true,
    ws: true,
    proxyTimeout: 120000,
    timeout: 120000,
  });

  proxy.on('error', (error, _req, res) => {
    console.error('Proxy error:', error.message);
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
