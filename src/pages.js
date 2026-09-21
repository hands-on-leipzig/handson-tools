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

const THEME_SCRIPT = `
(function () {
  var KEY = 'hands-on-theme';
  function current() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      var on = btn.getAttribute('data-theme-set') === theme;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(btn.getAttribute('data-theme-set'));
    });
  });
  apply(current());
})();
`;

function themeToggle() {
  return `
    <div class="page-theme glass-sidebar-footer__prefs-row" role="group" aria-label="Darstellung">
      <button type="button" class="glass-sidebar-footer__pref-btn" data-theme-set="light" aria-pressed="true">Hell</button>
      <button type="button" class="glass-sidebar-footer__pref-btn" data-theme-set="dark" aria-pressed="false">Dunkel</button>
    </div>`;
}

function layout({ title, body, script = '', wide = false }) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico">
  <script>${THEME_BOOT}</script>
  <link rel="stylesheet" href="/glass/styles/index.css">
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <div class="page${wide ? ' page--wide' : ''} liquid-surface-scope">
    ${body}
  </div>
  <script>${THEME_SCRIPT}${script}</script>
</body>
</html>`;
}

function flash(text, kind) {
  if (!text) return '';
  const cls = kind === 'ok' ? 'flash--ok' : 'flash--err';
  return `<div class="flash is-visible ${cls} liquid-surface-inner" role="status">${escapeHtml(text)}</div>`;
}

function generateIndexPage(store, baseDomain, notFoundSlug = null, query = {}) {
  const apps = store.apps || [];
  const notices = [
    notFoundSlug ? flash(`Unbekannt: ${notFoundSlug}`, 'err') : '',
    flash(indexErrorMessage(query.error), 'err'),
  ].join('');

  const items = apps.map((app) => {
    const host = `${app.slug}.${baseDomain}`;
    return `
      <li class="app-row liquid-surface-inner">
        <div class="app-row__top">
          <div>
            <a class="app-host" href="https://${escapeHtml(host)}">${escapeHtml(host)}</a>
            <div class="app-target">→ ${escapeHtml(app.target)}</div>
          </div>
          <span class="mode">${escapeHtml(app.mode)}</span>
        </div>
      </li>`;
  }).join('');

  return layout({
    title: 'handson.tools',
    body: `
    <section class="page-hero liquid-surface liquid-surface--accent">
      <img src="/hot.png" alt="" class="page-logo">
      <p class="page-kicker">Gateway</p>
      <h1>handson.tools</h1>
      <p class="page-lead">One-Link: <code>${escapeHtml(baseDomain)}/&lt;event&gt;</code> · Apps auf Subdomains</p>
      <div class="page-toolbar">${themeToggle()}</div>
    </section>
    ${notices}
    ${apps.length
      ? `<ul class="list">${items}</ul>`
      : '<p class="muted">Noch keine Apps.</p>'}`,
  });
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
      el.hidden = false;
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

  const userLabel = user.name || user.email || '';

  return layout({
    title: 'Admin · handson.tools',
    wide: true,
    script,
    body: `
    <section class="page-hero liquid-surface liquid-surface--accent">
      <p class="page-kicker">handson.tools</p>
      <h1>Shorts</h1>
      <div class="page-toolbar">
        <span class="page-user">${escapeHtml(userLabel)}</span>
        ${themeToggle()}
        <a class="glass-btn-secondary glass-btn--sm" href="/auth/logout">Logout</a>
      </div>
    </section>

    ${flash(adminErrorMessage(query.error), 'err')}
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

module.exports = { generateIndexPage, generateAdminPage };
