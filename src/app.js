const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { configureAuth } = require('./auth');
const { loadStore, upsertApp, deleteApp, setApexTarget } = require('./shortsStore');
const { resolve } = require('./resolve');
const { generateIndexPage, generateAdminPage } = require('./pages');
const { createProxy, proxyWeb } = require('./proxy');

const STATIC_FILES = ['favicon.ico', 'hot.png'];

function createApp() {
  const app = express();
  const baseDomain = (process.env.BASE_DOMAIN || 'handson.tools').toLowerCase();
  const proxy = createProxy();
  let store = loadStore();

  app.disable('x-powered-by');
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  function onApex(req, res, next) {
    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    if (host === baseDomain || host === `www.${baseDomain}`) return next();
    next('route');
  }

  STATIC_FILES.forEach((file) => {
    app.get(`/${file}`, onApex, (req, res) => {
      res.sendFile(path.join(__dirname, '..', file));
    });
  });

  const { ensureAuthenticated } = configureAuth(app, { onApex });

  app.get('/admin', onApex, ensureAuthenticated, (req, res) => {
    res.send(generateAdminPage(store, baseDomain, req.user || {}));
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

  // Backward-compatible admin API used by the previous UI.
  app.get('/admin/api/urls', onApex, ensureAuthenticated, (req, res) => {
    const urls = {};
    for (const row of store.apps) urls[row.slug] = row.target;
    res.json(urls);
  });

  app.use((req, res) => {
    const host = req.headers.host || '';
    const decision = resolve(
      { host, pathname: req.path, search: req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '' },
      store,
      { baseDomain },
    );

    switch (decision.type) {
      case 'gateway':
        return res.status(404).send('Not found');
      case 'index':
        return res.send(generateIndexPage(store, baseDomain));
      case 'block':
        return res.status(404).end();
      case 'redirect':
        return res.redirect(decision.permanent ? 301 : 302, decision.url);
      case 'proxy':
        return proxyWeb(proxy, req, res, decision.target, decision.path);
      case 'unknown-app':
        res.status(404);
        return res.send(generateIndexPage(store, baseDomain, `${decision.slug}.${baseDomain}`));
      default:
        res.status(404);
        return res.send(generateIndexPage(store, baseDomain, host));
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
    if (decision.path) req.url = decision.path;
    proxy.ws(req, socket, head, { target: decision.target, changeOrigin: true });
  });
  return app;
}

module.exports = { createApp };
