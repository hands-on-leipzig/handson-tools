/* Chrome behaviour for the Glass app shell (no Vue). */
(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }

  var THEME_KEY = 'hands-on-theme';
  var COLLAPSE_KEY = 'hands-on-sidebar-collapsed';
  var app = document.querySelector('.glass-app');
  var sidebar = document.querySelector('.glass-sidebar');
  if (!app || !sidebar) return;

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      var on = btn.getAttribute('data-theme-set') === theme;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyTheme(btn.getAttribute('data-theme-set'));
    });
  });
  applyTheme(currentTheme());

  function setCollapsed(on) {
    app.classList.toggle('glass-app--sidebar-collapsed', on);
    sidebar.classList.toggle('glass-sidebar--collapsed', on);
    var toggle = document.querySelector('[data-collapse]');
    if (toggle) {
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      toggle.setAttribute('aria-label', on ? 'Sidebar ausklappen' : 'Sidebar einklappen');
      toggle.setAttribute('title', on ? 'Sidebar ausklappen' : 'Sidebar einklappen');
      var icon = toggle.querySelector('.bi');
      if (icon) {
        icon.classList.toggle('bi-chevron-right', on);
        icon.classList.toggle('bi-chevron-left', !on);
      }
    }
    try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0'); } catch (e) {}
  }

  try {
    if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
  } catch (e) {}

  var collapseBtn = document.querySelector('[data-collapse]');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function () {
      setCollapsed(!sidebar.classList.contains('glass-sidebar--collapsed'));
    });
  }

  function setDrawer(open) {
    app.classList.toggle('glass-app--drawer-open', open);
    sidebar.classList.toggle('glass-sidebar--open', open);
    var menuBtn = document.querySelector('[data-menu-toggle]');
    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      var icon = menuBtn.querySelector('.bi');
      if (icon) {
        icon.classList.toggle('bi-x-lg', open);
        icon.classList.toggle('bi-list', !open);
      }
    }
  }

  var menuBtn = document.querySelector('[data-menu-toggle]');
  if (menuBtn) {
    menuBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      setDrawer(!sidebar.classList.contains('glass-sidebar--open'));
    });
  }

  var backdrop = document.querySelector('.glass-app__backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', function () { setDrawer(false); });
  }

  function closeFooterMenus() {
    document.querySelectorAll('[data-menu]').forEach(function (menu) {
      menu.hidden = true;
    });
    document.querySelectorAll('[data-menu-btn]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('glass-sidebar-footer__icon-btn--active');
    });
    var footer = document.querySelector('.glass-sidebar-footer');
    if (footer) footer.classList.remove('glass-sidebar-footer--menu-open');
  }

  document.querySelectorAll('[data-menu-btn]').forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      var name = btn.getAttribute('data-menu-btn');
      var menu = document.querySelector('[data-menu="' + name + '"]');
      if (!menu) return;
      var willOpen = menu.hidden;
      closeFooterMenus();
      if (willOpen) {
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('glass-sidebar-footer__icon-btn--active');
        var footer = document.querySelector('.glass-sidebar-footer');
        if (footer) footer.classList.add('glass-sidebar-footer--menu-open');
      }
    });
  });

  document.addEventListener('pointerdown', function (event) {
    if (!event.target.closest('.glass-sidebar-footer')) closeFooterMenus();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeFooterMenus();
      setDrawer(false);
    }
  });
})();

/* Installed PWA: keep the apex window and open apps in an iframe. The browser keeps the links. */
(function () {
  var protocol = window.HandsOnShell;
  var home = document.querySelector('[data-home]');
  var hub = document.querySelector('[data-hub]');
  var configEl = document.getElementById('hub-config');
  var appEl = document.querySelector('.glass-app');
  if (!protocol || !home || !hub || !configEl || !appEl) return;

  var config;
  try {
    config = JSON.parse(configEl.textContent || '{}');
  } catch (error) {
    return;
  }

  var frame = hub.querySelector('[data-hub-frame]');
  var titleEl = hub.querySelector('[data-hub-title]');
  var homeBtn = hub.querySelector('[data-hub-home]');
  var externalBtn = hub.querySelector('[data-hub-external]');
  var notifyBtn = hub.querySelector('[data-hub-notify]');
  var frameOrigin = '';
  var current = null;

  function installed() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('hub') === '1') return true;
    if (window.navigator.standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches;
  }

  if (!installed()) return;

  document.documentElement.classList.add('is-standalone');

  function appBySlug(slug) {
    return (config.apps || []).find(function (row) { return row.slug === slug; }) || null;
  }

  function homeUrl() {
    return new URLSearchParams(window.location.search).get('hub') === '1' ? '/?hub=1' : '/';
  }

  function showHome(push) {
    current = null;
    frameOrigin = '';
    hub.hidden = true;
    appEl.classList.remove('glass-app--hub');
    frame.src = 'about:blank';
    if (push) history.pushState({ hub: false }, '', homeUrl());
  }

  function postHello() {
    if (!frame.contentWindow || !frameOrigin) return;
    frame.contentWindow.postMessage(protocol.helloMessage(true), frameOrigin);
  }

  function openApp(slug, path, title, push) {
    var known = appBySlug(slug);
    if (!known) return;
    current = { slug: slug, path: protocol.safePath(path), title: title || known.title || slug };
    frameOrigin = 'https://' + slug + '.' + config.baseDomain;
    titleEl.textContent = current.title;
    frame.title = current.title;
    externalBtn.setAttribute('data-url', protocol.vanityUrl(slug, config.baseDomain, current.path));
    hub.hidden = false;
    appEl.classList.add('glass-app--hub');
    frame.src = protocol.frameUrl(slug, config.baseDomain, current.path);
    if (push) {
      var next = new URL(homeUrl(), window.location.origin);
      next.searchParams.set('app', slug);
      next.searchParams.set('to', current.path);
      if (new URLSearchParams(window.location.search).get('hub') === '1') next.searchParams.set('hub', '1');
      history.pushState({ hub: true, slug: slug, path: current.path }, '', next.pathname + next.search);
    }
  }

  function openExternal(url) {
    if (!protocol.isAllowedExternal(url, config)) return;
    var opened = window.open(url, '_blank', 'noopener');
    if (!opened) externalBtn.setAttribute('data-url', url);
  }

  function onNavigate(url) {
    var resolved = protocol.resolveNavigate(url, config);
    if (resolved) {
      var known = appBySlug(resolved.slug);
      openApp(resolved.slug, resolved.path, known && known.title, true);
      return;
    }
    openExternal(url);
  }

  function showNote(data) {
    if (!window.Notification || Notification.permission !== 'granted') return;
    var title = String((data && data.title) || 'HANDS on').slice(0, 120);
    var body = String((data && data.body) || '').slice(0, 240);
    var url = new URL(protocol.notificationTarget(data && data.url, config), window.location.origin).href;
    navigator.serviceWorker.getRegistration().then(function (registration) {
      if (registration) {
        registration.showNotification(title, { body: body, icon: '/pwa-192.png', data: { url: url } });
      }
    }).catch(function () {});
  }

  function urlBase64ToUint8Array(value) {
    var padding = '='.repeat((4 - (value.length % 4)) % 4);
    var base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = window.atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function subscribe() {
    var key = config.vapidPublicKey;
    if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then(function (registration) {
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }).then(function (subscription) {
      return fetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });
    }).catch(function () {});
  }

  home.addEventListener('click', function (event) {
    var node = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
    var card = node && node.closest('[data-app-slug]');
    if (!card) return;
    event.preventDefault();
    openApp(card.getAttribute('data-app-slug'), '/', card.getAttribute('data-app-title'), true);
  });

  homeBtn.addEventListener('click', function () { showHome(true); });
  externalBtn.addEventListener('click', function () {
    var url = externalBtn.getAttribute('data-url');
    if (url) window.open(url, '_blank', 'noopener');
  });
  notifyBtn.addEventListener('click', function () {
    if (!window.Notification) return;
    Notification.requestPermission().then(function (permission) {
      if (permission === 'granted') subscribe();
    });
  });
  frame.addEventListener('load', postHello);

  window.addEventListener('message', function (event) {
    if (!frame.contentWindow || event.source !== frame.contentWindow) return;
    if (!frameOrigin || event.origin !== frameOrigin) return;
    var data = event.data || {};
    if (data.source !== protocol.SOURCE) return;
    if (data.type === 'ready') postHello();
    if (data.type === 'open-external') openExternal(data.url);
    if (data.type === 'navigate') onNavigate(data.url);
    if (data.type === 'notify') showNote(data);
  });

  window.addEventListener('popstate', function () {
    var query = protocol.hubQuery(window.location.href, config);
    if (query) openApp(query.slug, query.path, query.title, false);
    else showHome(false);
  });

  var initial = protocol.hubQuery(window.location.href, config);
  if (initial) openApp(initial.slug, initial.path, initial.title, false);
})();
