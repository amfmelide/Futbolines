/* Service worker de la Liga Melide: permite instalarla como app y verla sin cobertura.
   Estrategias (las mismas que propone Workbox):
   · Página y datos de la liga → primero la red; si no hay conexión, la última copia guardada.
   · Iconos e imágenes propias → copia guardada y se actualiza en segundo plano.
   Solo guarda datos públicos de la liga en este navegador. Los envíos (POST) nunca se tocan. */
const CACHE = "liga-melide-v2";
const BASE = ["/liga.html", "/liga.webmanifest", "/liga-icon-192.png", "/liga-icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("liga-melide-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function redPrimero(req, clave) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(clave || req, r.clone());
    return r;
  } catch (err) {
    const g = await c.match(clave || req, { ignoreSearch: !clave });
    if (g) return g;
    throw err;
  }
}
async function copiaYActualiza(req) {
  const c = await caches.open(CACHE);
  const g = await c.match(req);
  const red = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => g);
  return g || red;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Lecturas de la liga a través de la función amf-web (POST): red primero, copia para ver sin cobertura
  if (req.method === "POST" && url.pathname.endsWith("/functions/v1/amf-web")) {
    e.respondWith((async () => {
      let c = null;
      try { c = JSON.parse(await req.clone().text()); } catch (_) {}
      if (!c || c.accion !== "leer" || c.tabla !== "liga_publica") return fetch(req);
      return redPrimero(req, "/__liga_publica?" + (c.consulta || ""));
    })());
    return;
  }
  if (req.method !== "GET") return;
  // Datos públicos de la liga en Supabase (solo lectura)
  if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/liga_publica")) {
    e.respondWith(redPrimero(req, url.href));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate" || url.pathname === "/liga.html") {
    e.respondWith(redPrimero(req, "/liga.html"));
    return;
  }
  if (/^\/liga[-.]/.test(url.pathname)) e.respondWith(copiaYActualiza(req));
});
