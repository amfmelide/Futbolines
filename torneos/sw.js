/* Service worker de Torneos AMF: recibe los avisos push y abre la web al tocarlos. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Torneo AMF", {
    body: d.cuerpo || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || "torneo",
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 600],
    data: { url: d.url || self.registration.scope }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of lista) if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  })());
});
