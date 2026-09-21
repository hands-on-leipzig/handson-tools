const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, isValidSlug, parseHost } = require('./resolve');

const baseDomain = 'handson.tools';
const store = {
  apexTarget: 'https://flow.hands-on-technology.org',
  apps: [
    { slug: 'flow', target: 'https://flow.hands-on-technology.org', mode: 'proxy' },
    { slug: 'rg', target: 'https://timer.hands-on-technology.org', mode: 'proxy' },
    { slug: 'dev', target: 'https://dev.flow.hands-on-technology.org', mode: 'proxy' },
    { slug: 'docs', target: 'https://example.org/help', mode: 'redirect' },
  ],
};
const config = { baseDomain };

function decide(host, pathname, search = '') {
  return resolve({ host, pathname, search }, store, config);
}

describe('parseHost', () => {
  it('treats the apex and www separately', () => {
    assert.equal(parseHost('handson.tools', baseDomain).kind, 'apex');
    assert.equal(parseHost('www.handson.tools', baseDomain).kind, 'www');
    assert.deepEqual(parseHost('rg.handson.tools:443', baseDomain), {
      kind: 'app',
      hostname: 'rg.handson.tools',
      slug: 'rg',
    });
  });
});

describe('subdomain apps', () => {
  it('proxies rg.handson.tools to the timer origin', () => {
    assert.deepEqual(decide('rg.handson.tools', '/foo'), {
      type: 'proxy',
      target: 'https://timer.hands-on-technology.org',
      path: null,
    });
  });

  it('proxies flow.handson.tools to FLOW', () => {
    assert.deepEqual(decide('flow.handson.tools', '/plan/overview'), {
      type: 'proxy',
      target: 'https://flow.hands-on-technology.org',
      path: null,
    });
  });

  it('redirects a redirect-mode app on its subdomain to the target', () => {
    assert.equal(
      decide('docs.handson.tools', '/a', '?x=1').url,
      'https://example.org/help/a?x=1',
    );
  });

  it('redirects unknown subdomains to the apex', () => {
    assert.deepEqual(decide('nope.handson.tools', '/foo', '?x=1'), {
      type: 'redirect',
      url: 'https://handson.tools/',
      permanent: false,
    });
  });
});

describe('apex one-link', () => {
  it('proxies event slugs to FLOW and keeps the path', () => {
    assert.deepEqual(decide('handson.tools', '/norderstedt', '?source=qr'), {
      type: 'proxy',
      target: 'https://flow.hands-on-technology.org',
      path: null,
    });
  });

  it('proxies past-season paths', () => {
    assert.equal(decide('handson.tools', '/2025/aachen').type, 'proxy');
  });

  it('redirects /rg to the app subdomain', () => {
    assert.deepEqual(decide('handson.tools', '/rg', '?x=1'), {
      type: 'redirect',
      url: 'https://rg.handson.tools/?x=1',
      permanent: true,
    });
  });

  it('redirects /dev/aachen to dev.handson.tools/aachen', () => {
    assert.equal(
      decide('handson.tools', '/dev/aachen').url,
      'https://dev.handson.tools/aachen',
    );
  });

  it('redirects bare /flow to flow.handson.tools', () => {
    assert.equal(decide('handson.tools', '/flow').url, 'https://flow.handson.tools/');
  });

  it('proxies /flow/logo.png to FLOW (static files)', () => {
    assert.deepEqual(decide('handson.tools', '/flow/hot+fll.png'), {
      type: 'proxy',
      target: 'https://flow.hands-on-technology.org',
      path: null,
    });
  });

  it('sends planner paths to flow.handson.tools', () => {
    assert.deepEqual(decide('handson.tools', '/plan/overview'), {
      type: 'redirect',
      url: 'https://flow.handson.tools/plan/overview',
      permanent: false,
    });
  });

  it('rewrites /s/:id to FLOW carousel', () => {
    assert.deepEqual(decide('handson.tools', '/s/42', '?k=1'), {
      type: 'proxy',
      target: 'https://flow.hands-on-technology.org',
      path: '/carousel/42?k=1',
    });
  });

  it('keeps /admin, /auth and /glass on the gateway', () => {
    assert.equal(decide('handson.tools', '/admin').type, 'gateway');
    assert.equal(decide('handson.tools', '/auth/keycloak').type, 'gateway');
    assert.equal(decide('handson.tools', '/glass/styles/index.css').type, 'gateway');
  });

  it('blocks FLOW service-worker files on the apex', () => {
    assert.equal(decide('handson.tools', '/sw.js').type, 'block');
    assert.equal(decide('handson.tools', '/manifest.webmanifest').type, 'block');
  });

  it('shows the index at /', () => {
    assert.equal(decide('handson.tools', '/').type, 'index');
  });

  it('canonicalises www to the apex', () => {
    assert.deepEqual(decide('www.handson.tools', '/norderstedt'), {
      type: 'redirect',
      url: 'https://handson.tools/norderstedt',
      permanent: true,
    });
  });
});

describe('slugs', () => {
  it('rejects reserved and malformed slugs', () => {
    assert.equal(isValidSlug('rg'), true);
    assert.equal(isValidSlug('norderstedt'), true);
    assert.equal(isValidSlug('admin'), false);
    assert.equal(isValidSlug('glass'), false);
    assert.equal(isValidSlug('plan'), false);
    assert.equal(isValidSlug('api'), false);
    assert.equal(isValidSlug('FLOW'), false);
    assert.equal(isValidSlug('-rg'), false);
  });
});
