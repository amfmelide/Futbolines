---
name: ref-cookieconsent
description: Ideas del repositorio orestbida/cookieconsent (5,7k estrellas), banner de cookies conforme al RGPD. Úsala siempre que se hable de banner de cookies, consentimiento, RGPD, LSSI, vídeos de YouTube incrustados o servicios de terceros en la web de la AMF.
---

# orestbida/cookieconsent — banner de cookies

- **Repositorio:** https://github.com/orestbida/cookieconsent
- **Estrellas:** 5,7k (comprobado el 12/10/2026) · **Licencia:** MIT · JavaScript sin dependencias.

## ¿Lo necesita la web AMF?
**Hoy no.** La web no usa cookies de análisis ni publicidad (GoatCounter no usa cookies) y lo explica en `legal.html#cookies`. El almacenamiento local técnico (sesión de admin, idioma, envíos sin conexión, copia offline de la liga) está exento (art. 22.2 LSSI).

## Cuándo sí haría falta
- Si se añade Google Analytics, píxel de Meta, anuncios o cualquier servicio que ponga cookies no técnicas.
- Entonces: bloquear esos scripts hasta que la persona acepte (`type="text/plain" data-category="analytics"`) y ofrecer rechazar igual de fácil que aceptar.

## Idea pendiente que sale de aquí
En Recuerdos, las **miniaturas de YouTube** se cargan desde `i.ytimg.com` sin pedir permiso (el aviso legal lo dice). Para evitarlo: guardar la miniatura en la propia web al dar de alta el vídeo, o mostrar un fondo propio con el título hasta que se pulse. El reproductor ya usa `youtube-nocookie.com` y solo carga al pulsar.
