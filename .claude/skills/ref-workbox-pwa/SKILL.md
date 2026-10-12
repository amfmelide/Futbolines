---
name: ref-workbox-pwa
description: Ideas del repositorio GoogleChrome/workbox (13k estrellas) para que las páginas de la AMF se instalen como app y funcionen sin cobertura. Úsala siempre que se hable de app, instalar en el móvil, pantalla de inicio, modo sin conexión, offline, service worker, caché o manifest.
---

# GoogleChrome/workbox — app instalable y sin conexión

- **Repositorio:** https://github.com/GoogleChrome/workbox
- **Estrellas:** 13k (comprobado el 12/10/2026) · **Licencia:** MIT

## Qué se aplicó en la web AMF
La **Liga Melide** ya es instalable y funciona sin cobertura, sin usar la librería (la web no tiene paso de compilación), copiando sus estrategias a mano:
- `liga.webmanifest` — nombre, iconos `liga-icon-192.png` / `liga-icon-512.png`, colores, `scope: /liga`.
- `sw-liga.js` — service worker:
  - página `liga.html` y lectura de `rest/v1/liga_publica` → **red primero** (si no hay red, última copia);
  - iconos e imágenes `liga-*` → **copia guardada y se actualiza en segundo plano** (stale-while-revalidate);
  - nunca toca peticiones POST (guardar resultados).
- Registro al final de `liga.html` (solo en https o localhost).

## Cómo extenderlo a otra página (p. ej. `calendario.html`)
1. Crear su manifest e iconos, o reutilizar uno común.
2. Un service worker con su propio `CACHE` y `scope` (p. ej. `/calendario`) para no mezclar cachés.
3. Al cambiar `sw-liga.js`, **subir la versión** de `CACHE` (`liga-melide-v2`) para que se borre la copia vieja.
4. Probar: cargar, recargar (ya controlada), cortar la red y recargar.
5. Si guarda algo nuevo en el navegador, mencionarlo en `legal.html#cookies` (almacenamiento técnico).
