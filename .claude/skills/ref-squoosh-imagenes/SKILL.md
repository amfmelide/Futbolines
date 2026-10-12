---
name: ref-squoosh-imagenes
description: Ideas del repositorio GoogleChromeLabs/squoosh (26k estrellas) para comprimir imágenes. Úsala siempre que se suban fotos, carteles, logos o imágenes a la web de la AMF, o cuando una página pese mucho.
---

# GoogleChromeLabs/squoosh — comprimir imágenes

- **Repositorio:** https://github.com/GoogleChromeLabs/squoosh · web: https://squoosh.app
- **Estrellas:** 26k (comprobado el 12/10/2026) · **Licencia:** Apache-2.0
- Comprime en el propio navegador (las fotos no se suben a ningún servidor). Ojo: la web squoosh.app usa Google Analytics.

## Pautas para la web AMF
- Fotos: JPEG o WebP calidad ~80, máximo ~1600 px de lado. Logos: PNG/WebP con transparencia, ~600 px.
- Imagen para compartir (Open Graph): 1200×630, JPEG < 200 KB (`og-amf.jpg`, `liga-og.jpg`, `k7m2x9/og.jpg`).
- No meter fotos en base64 dentro del HTML: hace que cada página pese 200–500 KB y no se guarde en caché aparte.
- Al recomprimir, mantener nombre y dimensiones para no romper enlaces ni `width`/`height`.
- Sin Squoosh, en este entorno: Pillow (`save(..., quality=80, optimize=True, progressive=True)`).
