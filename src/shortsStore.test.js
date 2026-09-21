const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseListed, normalizeApp } = require('./shortsStore');

describe('parseListed', () => {
  it('honours an explicit listed flag', () => {
    assert.equal(parseListed(true, 'test-flow'), true);
    assert.equal(parseListed(false, 'rg'), false);
    assert.equal(parseListed('0', 'flow'), false);
  });

  it('hides test and dev slugs when listed is omitted', () => {
    assert.equal(parseListed(undefined, 'test'), false);
    assert.equal(parseListed(undefined, 'dev'), false);
    assert.equal(parseListed(undefined, 'test-flow'), false);
    assert.equal(parseListed(undefined, 'flow-test'), false);
    assert.equal(parseListed(undefined, 'rg'), true);
    assert.equal(parseListed(undefined, 'flow'), true);
  });
});

describe('normalizeApp copy', () => {
  it('stores title and subtitle', () => {
    const app = normalizeApp({
      slug: 'docs',
      target: 'https://example.org',
      title: '  Doku  ',
      subtitle: 'Handbuch zum Event.',
    });
    assert.equal(app.title, 'Doku');
    assert.equal(app.subtitle, 'Handbuch zum Event.');
  });

  it('fills known slugs when copy is missing', () => {
    const app = normalizeApp({ slug: 'flow', target: 'https://flow.example' });
    assert.equal(app.title, 'FLOW');
    assert.match(app.subtitle, /Eventseiten/);
  });

  it('keeps an empty subtitle', () => {
    const app = normalizeApp({
      slug: 'rg',
      target: 'https://timer.example',
      title: 'Robot Game',
      subtitle: '',
    });
    assert.equal(app.subtitle, '');
  });
});
