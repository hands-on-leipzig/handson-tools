/* Shared by the gateway page and node:test. Messages use source "hands-on-shell". */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HandsOnShell = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SOURCE = 'hands-on-shell';

  function safePath(path) {
    var raw = String(path || '/');
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
    return raw;
  }

  function appList(config) {
    return (config && config.apps) || [];
  }

  function originOf(target) {
    try {
      return new URL(target).origin;
    } catch (error) {
      return '';
    }
  }

  function findSlug(host, config) {
    var base = String((config && config.baseDomain) || '').toLowerCase();
    var name = String(host || '').toLowerCase();
    var suffix = '.' + base;
    if (base && name.endsWith(suffix)) {
      var slug = name.slice(0, -suffix.length);
      if (slug && !slug.includes('.') && appList(config).some(function (app) { return app.slug === slug; })) {
        return slug;
      }
    }
    var match = appList(config).find(function (app) {
      return originOf(app.target) === 'https://' + name || originOf(app.target) === 'http://' + name;
    });
    return match ? match.slug : '';
  }

  function resolveNavigate(url, config) {
    var parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return null;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    var slug = findSlug(parsed.hostname, config);
    if (!slug) return null;
    return { slug: slug, path: safePath(parsed.pathname + parsed.search) };
  }

  function isAllowedExternal(url, config) {
    var parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return false;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    var host = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'http:' && host !== 'localhost' && host !== '127.0.0.1') return false;
    var base = String((config && config.baseDomain) || '').toLowerCase();
    if (base && (host === base || host.endsWith('.' + base))) return true;
    if (host === 'hands-on-technology.org' || host.endsWith('.hands-on-technology.org')) return true;
    return appList(config).some(function (app) {
      try {
        return new URL(app.target).hostname.toLowerCase() === host;
      } catch (error) {
        return false;
      }
    });
  }

  function frameUrl(slug, baseDomain, path) {
    var url = new URL(safePath(path), 'https://' + slug + '.' + baseDomain);
    url.searchParams.set('shell', '1');
    return url.href;
  }

  function vanityUrl(slug, baseDomain, path) {
    var url = new URL(safePath(path), 'https://' + slug + '.' + baseDomain);
    url.searchParams.delete('shell');
    return url.href;
  }

  function hubQuery(href, config) {
    var url;
    try {
      url = new URL(href);
    } catch (error) {
      return null;
    }
    var slug = url.searchParams.get('app') || '';
    if (!slug) return null;
    var app = appList(config).find(function (row) { return row.slug === slug; });
    if (!app) return null;
    return { slug: slug, path: safePath(url.searchParams.get('to') || '/'), title: app.title || slug };
  }

  function notificationTarget(url, config) {
    var base = new URL('https://' + config.baseDomain + '/');
    var resolved = resolveNavigate(url, config);
    if (resolved) {
      var target = new URL('/', base);
      target.searchParams.set('app', resolved.slug);
      target.searchParams.set('to', resolved.path);
      return target.pathname + target.search;
    }
    try {
      var parsed = new URL(url, base);
      if (parsed.origin === base.origin) return parsed.pathname + parsed.search;
    } catch (error) {}
    return '/';
  }

  function helloMessage(standalone) {
    return { source: SOURCE, type: 'hello', version: 1, standalone: !!standalone };
  }

  return {
    SOURCE: SOURCE,
    safePath: safePath,
    resolveNavigate: resolveNavigate,
    isAllowedExternal: isAllowedExternal,
    frameUrl: frameUrl,
    vanityUrl: vanityUrl,
    hubQuery: hubQuery,
    notificationTarget: notificationTarget,
    helloMessage: helloMessage,
  };
});
