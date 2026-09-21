const fs = require('fs');
const path = require('path');
const { withProtocol, isValidSlug } = require('./resolve');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHORTS_FILE = path.join(DATA_DIR, 'shorts.json');
const LEGACY_FILE = path.join(__dirname, '..', 'urls.json');

const DEFAULT_APEX = 'https://flow.hands-on-technology.org';

const DEFAULT_APPS = [
  { slug: 'flow', target: 'https://flow.hands-on-technology.org', mode: 'proxy' },
  { slug: 'dev', target: 'https://dev.flow.hands-on-technology.org', mode: 'proxy' },
  { slug: 'test', target: 'https://test.flow.hands-on-technology.org', mode: 'proxy' },
  { slug: 'rg', target: 'https://timer.hands-on-technology.org', mode: 'proxy' },
  { slug: 'jury', target: 'https://jurytimer.hands-on-technology.org', mode: 'proxy' },
  { slug: 'pfand', target: 'https://pfand.hands-on-technology.org', mode: 'proxy' },
];

function emptyStore() {
  return {
    version: 1,
    apexTarget: process.env.FLOW_BASE_URL || DEFAULT_APEX,
    apps: DEFAULT_APPS.map((app) => ({ ...app })),
  };
}

function normalizeApp(app) {
  const slug = String(app.slug || '').trim().toLowerCase();
  const target = withProtocol(app.target);
  const mode = app.mode === 'redirect' ? 'redirect' : 'proxy';
  return { slug, target, mode };
}

function normalizeStore(raw) {
  const store = emptyStore();
  if (!raw || typeof raw !== 'object') return store;
  if (raw.apexTarget) store.apexTarget = withProtocol(raw.apexTarget);
  if (Array.isArray(raw.apps)) {
    store.apps = raw.apps.map(normalizeApp).filter((app) => app.slug && app.target);
  }
  return store;
}

function migrateLegacy(urls) {
  const store = emptyStore();
  const apps = [];
  const seen = new Set();
  for (const [slug, target] of Object.entries(urls || {})) {
    const app = normalizeApp({ slug, target, mode: 'proxy' });
    if (!app.slug || seen.has(app.slug)) continue;
    seen.add(app.slug);
    apps.push(app);
  }
  // Keep defaults that were not in urls.json so FLOW/dev/test still exist.
  for (const fallback of DEFAULT_APPS) {
    if (!seen.has(fallback.slug)) apps.push({ ...fallback });
  }
  store.apps = apps;
  if (urls && urls.flow) store.apexTarget = withProtocol(urls.flow);
  return store;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadStore() {
  try {
    if (fs.existsSync(SHORTS_FILE)) {
      return normalizeStore(readJson(SHORTS_FILE));
    }
    if (fs.existsSync(LEGACY_FILE)) {
      const store = migrateLegacy(readJson(LEGACY_FILE));
      saveStore(store);
      return store;
    }
  } catch (error) {
    console.error('Failed to read shorts:', error);
  }
  return emptyStore();
}

function saveStore(store) {
  const normalized = normalizeStore(store);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SHORTS_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`);
  fs.renameSync(tmp, SHORTS_FILE);
  return normalized;
}

function upsertApp(store, input) {
  const app = normalizeApp(input);
  if (!isValidSlug(app.slug)) {
    return { error: 'Slug is reserved or invalid' };
  }
  if (!app.target) {
    return { error: 'Target is required' };
  }
  const apps = store.apps.filter((row) => row.slug !== app.slug);
  apps.push(app);
  apps.sort((a, b) => a.slug.localeCompare(b.slug));
  return { store: saveStore({ ...store, apps }) };
}

function deleteApp(store, slug) {
  const next = store.apps.filter((row) => row.slug !== slug);
  if (next.length === store.apps.length) return { error: 'Not found' };
  return { store: saveStore({ ...store, apps: next }) };
}

function setApexTarget(store, target) {
  const apexTarget = withProtocol(target);
  if (!apexTarget) return { error: 'Target is required' };
  return { store: saveStore({ ...store, apexTarget }) };
}

module.exports = {
  loadStore,
  saveStore,
  upsertApp,
  deleteApp,
  setApexTarget,
  SHORTS_FILE,
  DEFAULT_APEX,
};
