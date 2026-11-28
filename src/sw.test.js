const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('service worker', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');

  it('delivers pushes and does not handle navigations', () => {
    assert.match(source, /addEventListener\('push'/);
    assert.match(source, /addEventListener\('notificationclick'/);
    assert.doesNotMatch(source, /addEventListener\('fetch'/);
    assert.doesNotMatch(source, /navigateFallback/);
  });
});
