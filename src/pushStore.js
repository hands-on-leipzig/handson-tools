const fs = require('fs');
const path = require('path');

function pushFile() {
  return process.env.PUSH_FILE
    ? path.resolve(process.env.PUSH_FILE)
    : path.join(__dirname, '..', 'data', 'push-subscriptions.json');
}

function loadSubscriptions() {
  try {
    const parsed = JSON.parse(fs.readFileSync(pushFile(), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveSubscriptions(list) {
  const file = pushFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, file);
}

function subscriptionFrom(body) {
  const subscription = body && body.endpoint ? body : body && body.subscription;
  if (!subscription || typeof subscription.endpoint !== 'string') return null;
  let endpoint;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch (error) {
    return null;
  }
  if (endpoint.protocol !== 'https:') return null;
  const keys = subscription.keys || {};
  if (!keys.auth || !keys.p256dh) return null;
  return {
    endpoint: subscription.endpoint,
    keys: { auth: String(keys.auth), p256dh: String(keys.p256dh) },
    expirationTime: subscription.expirationTime || null,
  };
}

function addSubscription(body) {
  const next = subscriptionFrom(body);
  if (!next) return { error: 'invalid' };
  const list = loadSubscriptions().filter((row) => row.endpoint !== next.endpoint);
  list.push(next);
  saveSubscriptions(list);
  return { ok: true };
}

function removeSubscription(endpoint) {
  const list = loadSubscriptions().filter((row) => row.endpoint !== endpoint);
  saveSubscriptions(list);
}

module.exports = {
  loadSubscriptions,
  addSubscription,
  removeSubscription,
  subscriptionFrom,
};
