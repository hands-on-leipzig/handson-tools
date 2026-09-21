const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateIndexPage, generateAdminPage } = require('./pages');

const store = {
  apexTarget: 'https://flow.hands-on-technology.org',
  apps: [{ slug: 'rg', target: 'https://timer.example', mode: 'proxy' }],
};

describe('pages', () => {
  it('renders the index with glass chrome', () => {
    const html = generateIndexPage(store, 'handson.tools');
    assert.match(html, /\/glass\/styles\/index\.css/);
    assert.match(html, /liquid-surface/);
    assert.match(html, /rg\.handson\.tools/);
    assert.match(html, /data-theme-set="dark"/);
  });

  it('renders the admin with glass fields and buttons', () => {
    const html = generateAdminPage(store, 'handson.tools', { name: 'Ada' }, { error: 'auth_failed' });
    assert.match(html, /glass-input liquid-surface-control/);
    assert.match(html, /glass-btn-accent/);
    assert.match(html, /glass-btn-danger/);
    assert.match(html, /Ada/);
    assert.match(html, /Anmeldung fehlgeschlagen/);
  });
});
