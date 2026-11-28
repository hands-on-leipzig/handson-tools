/* Gateway PWA worker. No fetch handler: one-links and proxied apps stay on the network. */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function sameOriginUrl(value) {
  try {
    const url = new URL(value || '/', self.location.origin);
    if (url.origin !== self.location.origin) return `${self.location.origin}/`;
    return url.href;
  } catch (error) {
    return `${self.location.origin}/`;
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = String(payload.title || 'HANDS on').slice(0, 120);
  const body = String(payload.body || '').slice(0, 240);
  const url = sameOriginUrl(payload.url);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/pwa-192.png',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if (typeof client.navigate === 'function') {
        await client.navigate(target);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
