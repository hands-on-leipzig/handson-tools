const { escapeHtml } = require('./escape');

const THEME_BOOT = `
(function () {
  try {
    var stored = localStorage.getItem('hands-on-theme') || localStorage.getItem('node-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;

const TOOL_META = {
  flow: {
    title: 'FLOW',
    blurb: 'Wettkampfplanung, Check-in und öffentliche Eventseiten.',
    icon: 'bi-calendar3',
  },
  dev: {
    title: 'FLOW Dev',
    blurb: 'Entwicklungsumgebung für FLOW.',
    icon: 'bi-code-slash',
  },
  test: {
    title: 'FLOW Test',
    blurb: 'Testinstanz von FLOW.',
    icon: 'bi-flask',
  },
  rg: {
    title: 'Robot Game',
    blurb: 'Timer an den Robot-Game-Tischen.',
    icon: 'bi-stopwatch',
  },
  jury: {
    title: 'Jury',
    blurb: 'Timer für die Jury-Bewertung.',
    icon: 'bi-clipboard-check',
  },
  pfand: {
    title: 'Pfand',
    blurb: 'Pfand-Ausgabe und -Rückgabe am Event.',
    icon: 'bi-coin',
  },
};

function toolMeta(app) {
  return TOOL_META[app.slug] || {
    title: app.slug,
    blurb: app.mode === 'redirect' ? 'Weiterleitung zur Zielseite.' : 'Die Subdomain bleibt in der Adresszeile.',
    icon: 'bi-box-arrow-up-right',
  };
}

function flash(text, kind) {
  if (!text) return '';
  const cls = kind === 'ok' ? 'flash--ok' : 'flash--err';
  return `<div class="flash is-visible ${cls} liquid-surface-inner" role="status">${escapeHtml(text)}</div>`;
}

function indexErrorMessage(error) {
  if (error === 'forbidden') return 'Kein Zugriff — die Client-Rolle handson-tools-admin fehlt.';
  if (error === 'auth_failed') return 'Anmeldung fehlgeschlagen.';
  if (error === 'logout_failed') return 'Abmelden fehlgeschlagen.';
  return '';
}

function adminErrorMessage(error) {
  if (error === 'auth_failed') return 'Anmeldung fehlgeschlagen.';
  if (error === 'logout_failed') return 'Abmelden fehlgeschlagen.';
  return '';
}

function navItem(href, icon, label, active) {
  return `
    <a href="${href}" class="glass-sidebar__item${active ? ' glass-sidebar__item--active' : ''}">
      <span class="glass-sidebar__item-icon"><i class="bi ${icon}" aria-hidden="true"></i></span>
      <span class="glass-sidebar__item-label">${escapeHtml(label)}</span>
    </a>`;
}

function shellLayout({ title, active, user, notices = '', main, script = '' }) {
  const userLabel = user && (user.name || user.email) ? (user.name || user.email) : '';
  const identity = userLabel
    ? `
      <div class="glass-sidebar-footer__slot glass-sidebar-footer__slot--identity">
        <button type="button" class="glass-sidebar-footer__icon-btn" data-menu-btn="identity" aria-label="${escapeHtml(userLabel)}" aria-haspopup="true" aria-expanded="false">
          <i class="bi bi-person-fill" aria-hidden="true"></i>
        </button>
      </div>`
    : '';

  const identityMenu = userLabel
    ? `
      <div class="glass-sidebar-footer__menu" data-menu="identity" role="menu" aria-label="Account" hidden>
        <div class="glass-sidebar-footer__menu-header">
          <span class="glass-sidebar-footer__menu-title">${escapeHtml(userLabel)}</span>
        </div>
        <a class="glass-sidebar-footer__menu-item glass-sidebar-footer__menu-item--danger" href="/auth/logout" role="menuitem">
          <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
          <span>Logout</span>
        </a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico">
  <script>${THEME_BOOT}</script>
  <link rel="stylesheet" href="/icons/bootstrap-icons.css">
  <link rel="stylesheet" href="/glass/styles/index.css">
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <div class="glass-app liquid-surface-scope">
    <button type="button" class="glass-app__menu-toggle" data-menu-toggle aria-label="Menu" aria-expanded="false">
      <i class="bi bi-list" aria-hidden="true"></i>
    </button>
    <div class="glass-app__backdrop" aria-hidden="true"></div>

    <aside class="glass-sidebar liquid-surface">
      <div class="glass-sidebar__brand-row">
        <div class="glass-sidebar__brand-slot">
          <a href="/" class="glass-sidebar__brand hot-brand">
            <img class="glass-sidebar__brand-logo" src="/hot.png" alt="handson.tools">
          </a>
        </div>
        <button type="button" class="glass-sidebar__collapse-toggle no-touch-min" data-collapse aria-label="Sidebar einklappen" aria-pressed="false" title="Sidebar einklappen">
          <i class="bi bi-chevron-left" aria-hidden="true"></i>
        </button>
      </div>

      <nav class="glass-sidebar__nav">
        ${navItem('/', 'bi-house-fill', 'Start', active === 'home')}
      </nav>

      <div class="glass-sidebar__lower">
        <div class="glass-sidebar-footer">
          <div class="glass-sidebar-footer__bar">
            ${identity}
            <div class="glass-sidebar-footer__slot glass-sidebar-footer__slot--settings">
              <button type="button" class="glass-sidebar-footer__icon-btn" data-menu-btn="settings" aria-label="Einstellungen" aria-haspopup="true" aria-expanded="false">
                <i class="bi bi-gear-fill" aria-hidden="true"></i>
              </button>
            </div>
            ${identityMenu}
            <div class="glass-sidebar-footer__menu" data-menu="settings" role="menu" aria-label="Einstellungen" hidden>
              <div class="glass-sidebar-footer__prefs">
                <div class="glass-sidebar-footer__prefs-block">
                  <span class="glass-sidebar-footer__menu-label">Darstellung</span>
                  <div class="glass-sidebar-footer__prefs-row" role="group" aria-label="Darstellung">
                    <button type="button" class="glass-sidebar-footer__pref-btn" data-theme-set="light" aria-pressed="true">Hell</button>
                    <button type="button" class="glass-sidebar-footer__pref-btn" data-theme-set="dark" aria-pressed="false">Dunkel</button>
                  </div>
                </div>
              </div>
              <a class="glass-sidebar-footer__menu-item" href="/admin" role="menuitem">
                <i class="bi bi-sliders" aria-hidden="true"></i>
                <span>Apps verwalten</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main class="glass-app__main">
      <div class="glass-app__panel">
        <div class="glass-app__panel-body hot-page">
          ${notices}
          ${main}
        </div>
      </div>
    </main>
  </div>
  <script src="/shell.js"></script>
  ${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

function generateIndexPage(store, baseDomain, notFoundSlug = null, query = {}, user = null) {
  const apps = store.apps || [];
  const notices = [
    notFoundSlug ? flash(`Unbekannt: ${notFoundSlug}`, 'err') : '',
    flash(indexErrorMessage(query.error), 'err'),
  ].join('');

  const tools = apps.map((app) => {
    const meta = toolMeta(app);
    const host = `${app.slug}.${baseDomain}`;
    return `
      <li>
        <a class="tool-card liquid-surface-inner" href="https://${escapeHtml(host)}">
          <span class="tool-card__icon" aria-hidden="true"><i class="bi ${meta.icon}"></i></span>
          <span>
            <span class="tool-card__title">${escapeHtml(meta.title)}</span>
            <span class="tool-card__host">${escapeHtml(host)}</span>
            <span class="tool-card__blurb">${escapeHtml(meta.blurb)}</span>
          </span>
        </a>
      </li>`;
  }).join('');

  return shellLayout({
    title: 'handson.tools',
    active: 'home',
    user,
    notices,
    main: `
      <section class="welcome-hero liquid-surface liquid-surface--accent">
        <p class="welcome-kicker">Gateway</p>
        <h1>handson.tools</h1>
        <p class="welcome-lead">Öffentliche Eventseiten und die Wettkampf-Apps unter einem Dach.</p>
        <p class="hot-note">Die Eventseite liegt unter <code>${escapeHtml(baseDomain)}/&lt;event&gt;</code> — die Adresse bleibt, dahinter antwortet FLOW. Die Tools darunter haben eigene Hosts.</p>
      </section>
      <section class="section liquid-surface">
        <h2>Tools</h2>
        ${apps.length
          ? `<ul class="tool-list">${tools}</ul>`
          : '<p class="muted">Noch keine Apps.</p>'}
      </section>`,
  });
}

function generateAdminPage(store, baseDomain, user, query = {}) {
  const apps = store.apps || [];
  const rows = apps.map((app) => `
    <li class="app-row liquid-surface-inner">
      <div class="app-row__top">
        <div>
          <div class="app-host">${escapeHtml(app.slug)}.${escapeHtml(baseDomain)}</div>
          <div class="app-target">→ ${escapeHtml(app.target)}</div>
        </div>
        <div class="app-row__actions">
          <span class="mode">${escapeHtml(app.mode)}</span>
          <button class="glass-btn-danger glass-btn--sm" type="button" data-delete="${escapeHtml(app.slug)}">Löschen</button>
        </div>
      </div>
    </li>`).join('');

  const script = `
    function showMessage(text, type) {
      const el = document.getElementById('message');
      el.className = 'flash is-visible liquid-surface-inner flash--' + (type === 'success' ? 'ok' : 'err');
      el.textContent = text;
    }

    document.getElementById('addForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        slug: document.getElementById('slug').value.trim(),
        target: document.getElementById('target').value.trim(),
        mode: document.getElementById('mode').value,
      };
      const res = await fetch('/admin/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) { showMessage(data.message || 'Gespeichert', 'success'); setTimeout(() => location.reload(), 600); }
      else showMessage(data.error || 'Fehler', 'error');
    });

    document.getElementById('apexForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/admin/api/apex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: document.getElementById('apexTarget').value.trim() }),
      });
      const data = await res.json();
      if (res.ok) { showMessage(data.message || 'Gespeichert', 'success'); setTimeout(() => location.reload(), 600); }
      else showMessage(data.error || 'Fehler', 'error');
    });

    document.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slug = btn.getAttribute('data-delete');
        if (!confirm('«' + slug + '» löschen?')) return;
        const res = await fetch('/admin/api/apps/' + encodeURIComponent(slug), { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) location.reload();
        else showMessage(data.error || 'Fehler', 'error');
      });
    });
  `;

  return shellLayout({
    title: 'Apps · handson.tools',
    active: 'admin',
    user,
    notices: flash(adminErrorMessage(query.error), 'err'),
    script,
    main: `
      <section class="welcome-hero liquid-surface liquid-surface--accent">
        <p class="welcome-kicker">Einstellungen</p>
        <h1>Apps verwalten</h1>
        <p class="welcome-lead">Subdomains, Ziele und den FLOW-One-Link für ${escapeHtml(baseDomain)}.</p>
      </section>
      <div id="message" class="flash liquid-surface-inner"></div>
      <section class="section liquid-surface">
        <h2>Apex / One-Link</h2>
        <p class="muted" style="margin-bottom:0.85rem">${escapeHtml(baseDomain)}/norderstedt → dieser Host (Proxy, URL bleibt).</p>
        <form id="apexForm">
          <label class="glass-field">
            <span class="glass-field__label">FLOW-Ziel</span>
            <input class="glass-input liquid-surface-control" id="apexTarget" name="apexTarget" value="${escapeHtml(store.apexTarget)}" required>
          </label>
          <div class="form-actions">
            <button class="glass-btn-accent" type="submit">Speichern</button>
          </div>
        </form>
      </section>
      <section class="section liquid-surface">
        <h2>App hinzufügen</h2>
        <form id="addForm">
          <label class="glass-field">
            <span class="glass-field__label">Slug (wird zu slug.${escapeHtml(baseDomain)})</span>
            <input class="glass-input liquid-surface-control" id="slug" name="slug" placeholder="rg" required>
          </label>
          <label class="glass-field">
            <span class="glass-field__label">Ziel</span>
            <input class="glass-input liquid-surface-control" id="target" name="target" placeholder="https://timer.hands-on-technology.org" required>
          </label>
          <label class="glass-field">
            <span class="glass-field__label">Modus</span>
            <select class="select-fancy" id="mode" name="mode">
              <option value="proxy">Proxy — Subdomain bleibt in der Adresszeile</option>
              <option value="redirect">Redirect — weiter zum Ziel-Host</option>
            </select>
          </label>
          <div class="form-actions">
            <button class="glass-btn-accent" type="submit">Speichern</button>
          </div>
        </form>
      </section>
      <section class="section liquid-surface">
        <h2>Apps</h2>
        ${apps.length ? `<ul class="list">${rows}</ul>` : '<p class="muted">Noch keine Apps.</p>'}
      </section>`,
  });
}

module.exports = { generateIndexPage, generateAdminPage, TOOL_META };
