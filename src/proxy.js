const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');

const hopHost = String(process.env.FLOW_HOP_HOST || '').trim();
const hopPort = Number(process.env.FLOW_HOP_PORT || 4180);

function isFlowHostname(hostname) {
  return hostname === 'flow.hands-on-technology.org'
    || hostname.endsWith('.flow.hands-on-technology.org');
}

function createHopAgent(BaseAgent) {
  const agent = new BaseAgent({ keepAlive: true, family: 4 });
  const connect = BaseAgent.prototype.createConnection;
  agent.createConnection = function hopConnection(options, callback) {
    if (!options.servername) {
      options.servername = options.hostname || options.host;
    }
    options.host = hopHost;
    options.hostname = hopHost;
    options.port = hopPort;
    options.family = 4;
    return connect.call(this, options, callback);
  };
  return agent;
}

const ipv6HttpsAgent = new https.Agent({ family: 6, keepAlive: true });
const ipv6HttpAgent = new http.Agent({ family: 6, keepAlive: true });
const hopHttpsAgent = hopHost ? createHopAgent(https.Agent) : null;
const hopHttpAgent = hopHost ? createHopAgent(http.Agent) : null;

function agentFor(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  const secure = url.protocol === 'https:';
  if (hopHost) return secure ? hopHttpsAgent : hopHttpAgent;
  if (!isFlowHostname(url.hostname)) return undefined;
  return secure ? ipv6HttpsAgent : ipv6HttpAgent;
}

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
  proxy.web(req, res, {
    target,
    changeOrigin: true,
    xfwd: true,
    secure: true,
    agent: agentFor(target),
  });
}

module.exports = { createProxy, proxyWeb, agentFor };
