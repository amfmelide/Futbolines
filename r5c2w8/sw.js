/* Service worker de Ciegos: se instala como app y abre aunque no haya cobertura en el bar.
   Estrategias (las de Workbox, a mano):
   · Página, scripts, estilos e imágenes → primero la red (con 4 s de espera máximo);
     si no hay red o tarda, la última copia guardada. Así siempre se usa la versión nueva cuando hay conexión.
   · Tipografías de Google → copia guardada y se actualiza en segundo plano.
   Nunca toca los POST (leer y guardar torneos): de eso se encarga la propia página, que guarda una copia
   del torneo en el móvil y la sube sola cuando vuelve la conexión. */
const CACHE = "ciegos-app-v2";
const BASE = [
  "./", "tv.html", "manifest.webmanifest", "fondo.jpg", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "logo-amf.png",
  "../zt4k9m/app.css", "../fx.css", "../fx.js",
  "../zt4k9m/config.js", "../zt4k9m/engine.js", "../zt4k9m/store.js", "../zt4k9m/comun.js",
  "../zt4k9m/imagen.js", "../zt4k9m/ciegos.js", "../zt4k9m/ciegos-vista.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith("ciegos-app-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function redPrimero(req, clave) {
  const c = await caches.open(CACHE);
  const red = fetch(req).then(r => { if (r.ok) c.put(clave || req, r.clone()); return r; });
  const guardada = await c.match(clave || req, { ignoreSearch: true });
  if (!guardada) return red;
  // con mala cobertura no se espera más de 4 s: se usa la copia
  const espera = new Promise(res => setTimeout(() => res(guardada), 4000));
  return Promise.race([red.catch(() => guardada), espera]);
}
async function copiaYActualiza(req) {
  const c = await caches.open(CACHE);
  const g = await c.match(req);
  const red = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => g);
  return g || red;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") { e.respondWith(copiaYActualiza(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // cada página con su copia (panel en «./», la TV en «tv.html»), sin mirar los parámetros (?t=…)
    const ruta = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html") ? new URL("./", self.registration.scope).href : url.origin + url.pathname;
    e.respondWith(redPrimero(req, ruta));
    return;
  }
  e.respondWith(redPrimero(req));
});
