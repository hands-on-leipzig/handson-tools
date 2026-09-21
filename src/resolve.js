/**
 * Decide what handson.tools (and its app subdomains) should do with a request.
 *
 * Apps live at {slug}.{baseDomain} and proxy (or redirect) to their target.
 * The apex is the FLOW one-link: unknown paths are proxied to FLOW so
 * handson.tools/norderstedt stays in the address bar.
 */

const GATEWAY_PREFIXES = new Set(['admin', 'auth', 'glass', 'icons']);

/** First path segment of FLOW planner / auth surfaces — send those to flow.{base}. */
const PLANNER_PREFIXES = new Set([
  'plan', 'overview', 'event', 'events', 'schedule', 'teams', 'rooms',
  'publish', 'live', 'event-day', 'presentation', 'preview', 'editslide',
  'logos', 'profile', 'volunteers', 'slots', 'login', 'logout', 'password',
  'sanctum', 'legacy', 'output',
]);

const BLOCKED_APEX_FILES = [
  /^\/sw\.js$/i,
  /^\/registerSW\.js$/i,
  /^\/manifest\.webmanifest$/i,
  /^\/workbox-.*\.js$/i,
];

function withProtocol(target) {
  const raw = String(target || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`;
}

function originOf(target) {
  const url = withProtocol(target);
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function firstSegment(pathname) {
  const trimmed = String(pathname || '/').split('?')[0];
  const parts = trimmed.split('/').filter(Boolean);
  return parts[0] || '';
}

function restPath(pathname) {
  const trimmed = String(pathname || '/').split('?')[0];
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return `/${parts.slice(1).join('/')}`;
}

function appendSearch(url, search) {
  if (!search) return url;
  const q = search.startsWith('?') ? search : `?${search}`;
  return url.includes('?') ? `${url}&${q.slice(1)}` : `${url}${q}`;
}

function stripPort(host) {
  return String(host || '').split(':')[0].toLowerCase();
}

function parseHost(host, baseDomain) {
  const hostname = stripPort(host);
  const base = String(baseDomain || '').toLowerCase();
  if (!hostname || !base) return { kind: 'unknown', hostname, slug: null };
  if (hostname === base) return { kind: 'apex', hostname, slug: null };
  if (hostname === `www.${base}`) return { kind: 'www', hostname, slug: null };
  const suffix = `.${base}`;
  if (hostname.endsWith(suffix)) {
    const slug = hostname.slice(0, -suffix.length);
    if (slug && !slug.includes('.')) return { kind: 'app', hostname, slug };
  }
  return { kind: 'unknown', hostname, slug: null };
}

function appBySlug(apps, slug) {
  return (apps || []).find((app) => app.slug === slug) || null;
}

function isBlockedApexFile(pathname) {
  const path = String(pathname || '/').split('?')[0];
  return BLOCKED_APEX_FILES.some((re) => re.test(path));
}

/**
 * @param {{ host: string, pathname: string, search?: string }} req
 * @param {{ apps: Array<{slug: string, target: string, mode?: string}>, apexTarget: string }} store
 * @param {{ baseDomain: string }} config
 */
function resolve(req, store, config) {
  const pathname = req.pathname || '/';
  const search = req.search || '';
  const baseDomain = config.baseDomain;
  const apexOrigin = originOf(store.apexTarget);
  const parsed = parseHost(req.host, baseDomain);
  const apps = store.apps || [];

  if (parsed.kind === 'www') {
    return {
      type: 'redirect',
      url: appendSearch(`https://${baseDomain}${pathname === '/' ? '/' : pathname}`, search),
      permanent: true,
    };
  }

  if (parsed.kind === 'app') {
    const app = appBySlug(apps, parsed.slug);
    if (!app) {
      return {
        type: 'redirect',
        url: `https://${baseDomain}/`,
        permanent: false,
      };
    }
    const target = withProtocol(app.target);
    const path = pathname === '/' ? '' : pathname;
    if ((app.mode || 'proxy') === 'redirect') {
      return { type: 'redirect', url: appendSearch(`${target}${path}`, search), permanent: true };
    }
    return { type: 'proxy', target: originOf(target), path: null };
  }

  if (parsed.kind !== 'apex') {
    return { type: 'unknown-host' };
  }

  const segment = firstSegment(pathname);

  if (!segment) return { type: 'index' };
  if (GATEWAY_PREFIXES.has(segment)) return { type: 'gateway' };
  if (isBlockedApexFile(pathname)) return { type: 'block' };

  if (segment === 's') {
    const rest = restPath(pathname);
    if (!rest || rest === '/') return { type: 'index' };
    return {
      type: 'proxy',
      target: apexOrigin,
      path: appendSearch(`/carousel${rest}`, search),
    };
  }

  const app = appBySlug(apps, segment);
  if (app) {
    const rest = restPath(pathname);
    // FLOW logos live at /flow/*.png on the FLOW origin — proxy those, only
    // the bare /flow shortcut jumps to the app subdomain.
    if (segment === 'flow' && rest) {
      return { type: 'proxy', target: apexOrigin, path: null };
    }
    const destPath = rest || '/';
    return {
      type: 'redirect',
      url: appendSearch(`https://${app.slug}.${baseDomain}${destPath}`, search),
      permanent: true,
    };
  }

  if (PLANNER_PREFIXES.has(segment)) {
    return {
      type: 'redirect',
      url: appendSearch(`https://flow.${baseDomain}${pathname}`, search),
      permanent: false,
    };
  }

  return { type: 'proxy', target: apexOrigin, path: null };
}

function reservedSlugs() {
  return new Set([
    ...GATEWAY_PREFIXES,
    ...PLANNER_PREFIXES,
    'www', 's', 'api', 'assets', 'build', 'storage', 'carousel',
    'public-schedule', 'scores', 'favicon.ico', 'hot.png', 'app.css', 'glass', 'icons',
  ]);
}

function isValidSlug(slug) {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) && !reservedSlugs().has(slug);
}

module.exports = {
  resolve,
  withProtocol,
  originOf,
  parseHost,
  isValidSlug,
  reservedSlugs,
  GATEWAY_PREFIXES,
  PLANNER_PREFIXES,
};
