const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { addSubscription, loadSubscriptions } = require('./pushStore');
const { sendPush } = require('./pushSend');

describe('push subscriptions', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handson-push-'));
    process.env.PUSH_FILE = path.join(dir, 'push.json');
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  after(() => {
    delete process.env.PUSH_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stores an https subscription once', () => {
    const body = {
      endpoint: 'https://push.example/sub/1',
      keys: { auth: 'auth', p256dh: 'key' },
    };
    assert.deepEqual(addSubscription(body), { ok: true });
    assert.deepEqual(addSubscription(body), { ok: true });
    assert.equal(loadSubscriptions().length, 1);
    assert.equal(addSubscription({ endpoint: 'http://push.example/sub' }).error, 'invalid');
  });

  it('refuses to send without VAPID keys', async () => {
    await assert.rejects(sendPush({ title: 'Hallo' }), (error) => error.status === 503);
  });
});
