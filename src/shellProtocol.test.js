const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../public/shell-protocol');

const config = {
  baseDomain: 'handson.tools',
  apps: [
    { slug: 'flow', title: 'FLOW', target: 'https://flow.hands-on-technology.org' },
    { slug: 'rg', title: 'Robot Game', target: 'https://timer.hands-on-technology.org' },
  ],
};

describe('shell protocol', () => {
  it('builds an iframe url on the vanity host and marks the shell', () => {
    const url = new URL(protocol.frameUrl('flow', 'handson.tools', '/scor?tab=1'));
    assert.equal(url.origin, 'https://flow.handson.tools');
    assert.equal(url.pathname, '/scor');
    assert.equal(url.searchParams.get('tab'), '1');
    assert.equal(url.searchParams.get('shell'), '1');
  });

  it('rejects a protocol-relative path', () => {
    const url = new URL(protocol.frameUrl('flow', 'handson.tools', '//evil.example'));
    assert.equal(url.pathname, '/');
    assert.equal(url.hostname, 'flow.handson.tools');
  });

  it('maps an upstream app url onto its vanity slug', () => {
    assert.deepEqual(
      protocol.resolveNavigate('https://flow.hands-on-technology.org/scor', config),
      { slug: 'flow', path: '/scor' },
    );
    assert.deepEqual(
      protocol.resolveNavigate('https://rg.handson.tools/tables', config),
      { slug: 'rg', path: '/tables' },
    );
  });

  it('refuses a host the gateway does not know', () => {
    assert.equal(protocol.resolveNavigate('https://example.org/phish', config), null);
    assert.equal(protocol.isAllowedExternal('javascript:alert(1)', config), false);
    assert.equal(protocol.isAllowedExternal('https://example.org/', config), false);
    assert.equal(protocol.isAllowedExternal('https://flow.hands-on-technology.org/plan', config), true);
    assert.equal(protocol.isAllowedExternal('https://join.hands-on-technology.org/', config), true);
  });

  it('turns an app url into a shell deep link', () => {
    assert.equal(
      protocol.notificationTarget('https://flow.hands-on-technology.org/plan/overview', config),
      '/?app=flow&to=%2Fplan%2Foverview',
    );
    assert.equal(protocol.notificationTarget('https://evil.example/', config), '/');
  });

  it('reads the hub query only for a known app', () => {
    assert.deepEqual(
      protocol.hubQuery('https://handson.tools/?app=flow&to=%2Fplan', config),
      { slug: 'flow', path: '/plan', title: 'FLOW' },
    );
    assert.equal(protocol.hubQuery('https://handson.tools/?app=nope', config), null);
  });

  it('says hello with the installed flag', () => {
    assert.deepEqual(protocol.helloMessage(true), {
      source: 'hands-on-shell',
      type: 'hello',
      version: 1,
      standalone: true,
    });
  });
});
