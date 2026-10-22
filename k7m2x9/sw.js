/* Service worker de la Liga La Unión: permite verla sin cobertura.
   · La página y los datos de la liga → primero la red; sin conexión, la última copia guardada.
   · Solo guarda datos públicos de la liga en este navegador. Los guardados del panel nunca se tocan. */
const CACHE = "liga-launion-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("./")).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("liga-launion-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function redPrimero(req, clave) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(clave, r.clone());
    return r;
  } catch (err) {
    const g = await c.match(clave);
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
  // Lectura de la liga (POST a la función del servidor): red primero, copia para ver sin cobertura
  if (req.method === "POST" && url.pathname.endsWith("/functions/v1/amf-web")) {
    e.respondWith((async () => {
      let c = null;
      try { c = JSON.parse(await req.clone().text()); } catch (_) {}
      if (!c || c.accion !== "leer" || c.tabla !== "liga_publica") return fetch(req);
      return redPrimero(req, "./__datos?" + (c.consulta || ""));
    })());
    return;
  }
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") { e.respondWith(redPrimero(req, "./")); return; }
  // tipografías e imágenes de la página (carpeta a/): copia guardada y se actualiza en segundo plano
  if (url.pathname.includes("/k7m2x9/a/")) e.respondWith(copiaYActualiza(req));
});
