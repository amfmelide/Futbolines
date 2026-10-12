---
name: ref-photoswipe-galeria
description: Ideas del repositorio dimsemenov/PhotoSwipe (25k estrellas) para galerías de fotos en móvil. Úsala siempre que se toque el visor de fotos de Recuerdos, galerías, zoom, pellizcar, deslizar entre fotos o ver fotos a pantalla completa en la web de la AMF.
---

# dimsemenov/PhotoSwipe — galería de fotos para móvil

- **Repositorio:** https://github.com/dimsemenov/PhotoSwipe
- **Estrellas:** 25k (comprobado el 12/10/2026) · **Licencia:** MIT

## Gestos que se esperan de una buena galería
- Deslizar a los lados = foto siguiente/anterior.
- Deslizar hacia abajo = cerrar.
- **Doble toque** = ampliar en el punto tocado; otro doble toque = volver.
- **Pellizcar** = zoom; con la foto ampliada, un dedo **mueve** la foto (no cambia de foto).
- Carga primero la miniatura y luego la grande; precarga las vecinas.

## Estado en la web AMF (`recuerdos.html`, objeto `Visor`)
- Ya tenía: deslizar lateral, deslizar abajo para cerrar, flechas del teclado, miniatura→grande, precarga.
- Añadido: doble toque, pellizco (1×–4×) y arrastre con zoom (`aplicarZoom`, `quitarZoom`, `zoomEn`). El zoom se quita al cambiar de foto y al cerrar.
- La zona `.visor-escena` necesita `touch-action:none` para recibir los gestos.
- Para probar sin datos: rellenar `estado.fotosActuales` con imágenes locales y llamar `Visor.abrir(0)`.
