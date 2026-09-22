const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateIndexPage, generateAdminPage } = require('./pages');

const store = {
  apexTarget: 'https://flow.hands-on-technology.org',
  apps: [
    {
      slug: 'rg',
      title: 'Robot Game',
      subtitle: 'Timer an den Robot-Game-Tischen.',
      target: 'https://timer.example',
      mode: 'proxy',
      listed: true,
    },
    {
      slug: 'test-flow',
      title: 'FLOW Test',
      subtitle: 'Intern.',
      target: 'https://test.flow.example',
      mode: 'proxy',
      listed: false,
    },
  ],
};

describe('pages', () => {
  it('renders the index in the Glass app shell', () => {
    const html = generateIndexPage(store, 'handson.tools');
    assert.match(html, /glass-app liquid-surface-scope/);
    assert.doesNotMatch(html, /glass-app--drawer-open/);
    assert.match(html, /glass-app__backdrop/);
    assert.match(html, /glass-sidebar/);
    assert.match(html, /bi-gear-fill/);
    assert.match(html, /Apps verwalten/);
    assert.match(html, /rg\.handson\.tools/);
    assert.match(html, /Timer an den Robot-Game-Tischen/);
    assert.match(html, /Die Apps von HANDS on TECHNOLOGY/);
    assert.doesNotMatch(html, /Wettkampf/);
    assert.doesNotMatch(html, /Gateway/);
    assert.doesNotMatch(html, />Tools</);
    assert.doesNotMatch(html, /Adresse bleibt/);
  });

  it('omits unlisted slugs from the public index', () => {
    const html = generateIndexPage(store, 'handson.tools');
    assert.match(html, /rg\.handson\.tools/);
    assert.doesNotMatch(html, /test-flow\.handson\.tools/);
  });

  it('renders stored title and subtitle on the index', () => {
    const html = generateIndexPage({
      apexTarget: store.apexTarget,
      apps: [{
        slug: 'docs',
        title: 'Doku',
        subtitle: 'Handbuch zum Event.',
        target: 'https://example.org',
        mode: 'redirect',
        listed: true,
      }],
    }, 'handson.tools');
    assert.match(html, />Doku</);
    assert.match(html, /Handbuch zum Event/);
    assert.doesNotMatch(html, /Planung, Check-in/);
  });

  it('shows a forbidden notice on the index', () => {
    const html = generateIndexPage(store, 'handson.tools', null, { error: 'forbidden' });
    assert.match(html, /handson-tools-admin/);
  });

  it('renders admin inside the shell, with account in the footer', () => {
    const html = generateAdminPage(store, 'handson.tools', { name: 'Ada' }, { error: 'auth_failed' });
    assert.match(html, /glass-app/);
    assert.match(html, /glass-input liquid-surface-control/);
    assert.match(html, /glass-btn-accent/);
    assert.match(html, /glass-btn-danger/);
    assert.match(html, /Ada/);
    assert.match(html, /\/auth\/logout/);
    assert.match(html, /Anmeldung fehlgeschlagen/);
    assert.match(html, /test-flow\.handson\.tools/);
    assert.match(html, /id="listed"/);
    assert.match(html, /In der Übersicht zeigen/);
    assert.match(html, /data-listed="test-flow"/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /id="title"/);
    assert.match(html, /id="subtitle"/);
    assert.match(html, /Bezeichnung/);
    assert.match(html, /Untertitel/);
    assert.match(html, /data-edit/);
  });
});
