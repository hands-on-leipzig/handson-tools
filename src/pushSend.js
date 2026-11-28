const { loadSubscriptions, removeSubscription } = require('./pushStore');

function payloadFrom(body) {
  const source = body || {};
  return {
    title: String(source.title || 'HANDS on').slice(0, 120),
    body: String(source.body || '').slice(0, 240),
    url: String(source.url || '/'),
  };
}

async function sendPush(body) {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) {
    const error = new Error('VAPID keys missing');
    error.status = 503;
    throw error;
  }
  const webpush = require('web-push');
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@hands-on-technology.org',
    publicKey,
    privateKey,
  );
  const payload = JSON.stringify(payloadFrom(body));
  const subscriptions = loadSubscriptions();
  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, payload);
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error.statusCode === 404 || error.statusCode === 410) {
        removeSubscription(subscription.endpoint);
        removed += 1;
      }
    }
  }
  return { sent, failed, removed };
}

module.exports = { sendPush, payloadFrom };
