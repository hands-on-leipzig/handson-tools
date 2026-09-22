const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { configureAuth } = require('./auth');
const { loadStore, upsertApp, deleteApp, setListed, setApexTarget } = require('./shortsStore');
const { resolve, originOf } = require('./resolve');
const { generateIndexPage, generateAdminPage } = require('./pages');
const { createProxy, proxyWeb, proxyWebSocket } = require('./proxy');
const { probe, hopFromEnv } = require('./egress');

const STATIC_FILES = ['favicon.ico', 'hot.png'];

/** Neutral hosts for /admin/api/egress — unrelated to any app. */
const REFERENCE_TARGETS = (process.env.EGRESS_REFERENCE
  || 'https://one.one.one.one,https://www.google.com').split(',').map((entry) => entry.trim()).filter(Boolean);

function glassRoot() {
  const candidates = [
    process.env.GLASS_ROOT,
    path.join(__dirname, '..', 'node_modules', '@hands-on', 'glass'),
    path.join(__dirname, '..', '..', 'glass'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'styles', 'index.css'))) return dir;
  }
  throw new Error(
    'Glass design system not found. Install @hands-on/glass (npm install) or set GLASS_ROOT.',
  );
}

function createApp() {
  const app = express();
  const baseDomain = (process.env.BASE_DOMAIN || 'handson.tools').toLowerCase();
  const proxy = createProxy();
  let store = loadStore();
  const glassDir = glassRoot();

  app.disable('x-powered-by');
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  function requestHost(req) {
    return (req.headers.host || '').split(':')[0].toLowerCase();
  }

  function isLocalPreviewHost(host) {
    return process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1');
  }

  function onApex(req, res, next) {
    const host = requestHost(req);
    if (host === baseDomain || host === `www.${baseDomain}` || isLocalPreviewHost(host)) return next();
    next('route');
  }

  STATIC_FILES.forEach((file) => {
    app.get(`/${file}`, onApex, (req, res) => {
      res.sendFile(path.join(__dirname, '..', file));
    });
  });

  app.get('/app.css', onApex, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'app.css'));
  });

  app.get('/shell.js', onApex, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'shell.js'));
  });

  app.use('/glass/styles', onApex, express.static(path.join(glassDir, 'styles'), { fallthrough: false }));
  app.use('/glass/fonts', onApex, express.static(path.join(glassDir, 'fonts'), { fallthrough: false }));
  app.use(
    '/icons',
    onApex,
    express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap-icons', 'font'), { fallthrough: false }),
  );

  const { ensureAuthenticated } = configureAuth(app, { onApex });

  app.get('/admin', onApex, ensureAuthenticated, (req, res) => {
    res.send(generateAdminPage(store, baseDomain, req.user || {}, req.query || {}));
  });

  app.get('/admin/api/apps', onApex, ensureAuthenticated, (req, res) => {
    res.json(store);
  });

  app.post('/admin/api/apps', onApex, ensureAuthenticated, (req, res) => {
    const result = upsertApp(store, req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    store = result.store;
    res.json({ message: 'Gespeichert', ...store });
  });

  app.post('/admin/api/apps/:slug/listed', onApex, ensureAuthenticated, (req, res) => {
    const result = setListed(store, String(req.params.slug || '').toLowerCase(), req.body && req.body.listed);
    if (result.error) return res.status(404).json({ error: result.error });
    store = result.store;
    res.json({ message: 'Gespeichert', ...store });
  });

  app.delete('/admin/api/apps/:slug', onApex, ensureAuthenticated, (req, res) => {
    const result = deleteApp(store, String(req.params.slug || '').toLowerCase());
    if (result.error) return res.status(404).json({ error: result.error });
    store = result.store;
    res.json({ message: 'Gelöscht', ...store });
  });

  app.post('/admin/api/apex', onApex, ensureAuthenticated, (req, res) => {
    const result = setApexTarget(store, req.body && req.body.target);
    if (result.error) return res.status(400).json({ error: result.error });
    store = result.store;
    res.json({ message: 'Gespeichert', ...store });
  });

  // Which egress route reaches which upstream — the answer to "es lädt ewig
  // und dann kommt 502" without shell access to the host. The reference hosts
  // separate "this box has no egress" from "that upstream refuses us".
  app.get('/admin/api/egress', onApex, ensureAuthenticated, async (req, res) => {
    const targets = [store.apexTarget, ...store.apps.map((row) => row.target)]
      .map(originOf)
      .filter(Boolean);
    const [reference, results] = await Promise.all([
      Promise.all(REFERENCE_TARGETS.map((target) => probe(target))),
      Promise.all([...new Set(targets)].map((target) => probe(target))),
    ]);
    res.json({ hop: hopFromEnv(), reference, targets: results });
  });

  // Backward-compatible admin API used by the previous UI.
  app.get('/admin/api/urls', onApex, ensureAuthenticated, (req, res) => {
    const urls = {};
    for (const row of store.apps) urls[row.slug] = row.target;
    res.json(urls);
  });

  app.use((req, res) => {
    const host = isLocalPreviewHost(requestHost(req)) ? baseDomain : (req.headers.host || '');
    const decision = resolve(
      { host, pathname: req.path, search: req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '' },
      store,
      { baseDomain },
    );

    switch (decision.type) {
      case 'gateway':
        return res.status(404).send('Not found');
      case 'index':
        return res.send(generateIndexPage(store, baseDomain, null, req.query || {}, req.user || null));
      case 'block':
        return res.status(404).end();
      case 'redirect':
        return res.redirect(decision.permanent ? 301 : 302, decision.url);
      case 'proxy':
        return proxyWeb(proxy, req, res, decision.target, decision.path);
      default:
        res.status(404);
        return res.send(generateIndexPage(store, baseDomain, host, {}, req.user || null));
    }
  });

  app.set('proxy', proxy);
  app.set('dispatchUpgrade', (req, socket, head) => {
    const host = req.headers.host || '';
    let pathname = req.url || '/';
    let search = '';
    const q = pathname.indexOf('?');
    if (q !== -1) {
      search = pathname.slice(q);
      pathname = pathname.slice(0, q);
    }
    const decision = resolve({ host, pathname, search }, store, { baseDomain });
    if (decision.type !== 'proxy') {
      socket.destroy();
      return;
    }
    proxyWebSocket(proxy, req, socket, head, decision.target, decision.path);
  });
  return app;
}

module.exports = { createApp };
