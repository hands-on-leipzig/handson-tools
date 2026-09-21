const { escapeHtml } = require('./escape');

const STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #F78B1F 0%, #ff9f40 100%);
    min-height: 100vh;
    padding: 20px;
  }
  .container {
    background: white;
    border-radius: 20px;
    box-sizing: border-box;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 960px;
    width: 100%;
    margin: 20px auto;
    padding: 40px;
  }
  h1 { color: #F78B1F; font-size: 2rem; margin-bottom: 8px; }
  h2 { color: #333; font-size: 1.2rem; margin: 28px 0 12px; }
  .subtitle { color: #666; margin-bottom: 24px; }
  .logo { max-width: 96px; display: block; margin: 0 auto 16px; }
  .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #f0f0f0; }
  .url-item, .card {
    background: #f8f9fa;
    border-left: 4px solid #F78B1F;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 12px;
  }
  .slug { font-weight: 600; color: #F78B1F; font-size: 1.1rem; text-decoration: none; }
  .target { color: #666; font-size: 0.95rem; margin-top: 4px; word-break: break-all; }
  .mode { display: inline-block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; background: #fff; border-radius: 999px; padding: 2px 8px; margin-left: 8px; color: #333; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .form-group { margin-bottom: 12px; }
  label { display: block; font-weight: 600; margin-bottom: 4px; }
  input, select {
    width: 100%;
    padding: 10px;
    border: 2px solid #ddd;
    border-radius: 8px;
    font-size: 1rem;
  }
  .btn { padding: 10px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; text-decoration: none; display: inline-block; }
  .btn-primary { background: #F78B1F; color: white; }
  .btn-danger { background: #dc3545; color: white; }
  .btn-small { padding: 6px 10px; font-size: 0.9rem; }
  .message { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: none; }
  .message-success { background: #d4edda; color: #155724; display: block; }
  .message-error { background: #f8d7da; color: #721c24; display: block; }
  .muted { color: #888; font-size: 0.9rem; }
`;

function generateIndexPage(store, baseDomain, notFoundSlug = null) {
  const apps = store.apps || [];
  const notFound = notFoundSlug
    ? `<div class="message message-error">Unbekannt: ${escapeHtml(notFoundSlug)}</div>`
    : '';

  const items = apps.map((app) => {
    const host = `${app.slug}.${baseDomain}`;
    return `
      <li class="url-item">
        <a class="slug" href="https://${escapeHtml(host)}">${escapeHtml(host)}</a>
        <span class="mode">${escapeHtml(app.mode)}</span>
        <div class="target">→ ${escapeHtml(app.target)}</div>
      </li>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>handson.tools</title>
  <link rel="icon" href="/favicon.ico">
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <img src="/hot.png" alt="" class="logo">
    <h1>handson.tools</h1>
    <p class="subtitle">One-Link: <code>${escapeHtml(baseDomain)}/&lt;event&gt;</code> · Apps auf Subdomains</p>
    ${notFound}
    ${apps.length ? `<ul style="list-style:none">${items}</ul>` : '<p class="muted">Noch keine Apps.</p>'}
  </div>
</body>
</html>`;
}

function generateAdminPage(store, baseDomain, user) {
  const apps = store.apps || [];
  const rows = apps.map((app) => `
    <li class="url-item">
      <div class="row">
        <div>
          <div class="slug">${escapeHtml(app.slug)}.${escapeHtml(baseDomain)}</div>
          <div class="target">→ ${escapeHtml(app.target)}</div>
        </div>
        <div>
          <span class="mode">${escapeHtml(app.mode)}</span>
          <button class="btn btn-danger btn-small" data-delete="${escapeHtml(app.slug)}">Löschen</button>
        </div>
      </div>
    </li>`).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin · handson.tools</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Shorts</h1>
      <div>
        <strong>${escapeHtml(user.name || user.email || '')}</strong>
        <a class="btn btn-danger btn-small" href="/auth/logout">Logout</a>
      </div>
    </div>

    <div class="card">
      <h2>Apex / One-Link</h2>
      <p class="muted" style="margin-bottom:12px">${escapeHtml(baseDomain)}/norderstedt → dieser Host (Proxy, URL bleibt).</p>
      <form id="apexForm">
        <div class="form-group">
          <label for="apexTarget">FLOW-Ziel</label>
          <input id="apexTarget" name="apexTarget" value="${escapeHtml(store.apexTarget)}" required>
        </div>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </form>
    </div>

    <h2>App hinzufügen</h2>
    <form id="addForm" class="card">
      <div class="form-group">
        <label for="slug">Slug (wird zu slug.${escapeHtml(baseDomain)})</label>
        <input id="slug" name="slug" placeholder="rg" required>
      </div>
      <div class="form-group">
        <label for="target">Ziel</label>
        <input id="target" name="target" placeholder="https://timer.hands-on-technology.org" required>
      </div>
      <div class="form-group">
        <label for="mode">Modus</label>
        <select id="mode" name="mode">
          <option value="proxy">Proxy — Subdomain bleibt in der Adresszeile</option>
          <option value="redirect">Redirect — weiter zum Ziel-Host</option>
        </select>
      </div>
      <button class="btn btn-primary" type="submit">Speichern</button>
    </form>

    <div id="message" class="message"></div>
    <h2>Apps</h2>
    <ul style="list-style:none">${rows}</ul>
  </div>
  <script>
    function showMessage(text, type) {
      const el = document.getElementById('message');
      el.className = 'message message-' + type;
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
  </script>
</body>
</html>`;
}

module.exports = { generateIndexPage, generateAdminPage };
