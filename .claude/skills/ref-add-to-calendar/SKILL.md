---
name: ref-add-to-calendar
description: Ideas del repositorio add2cal/add-to-calendar-button (1,5k estrellas) para añadir torneos y jornadas al calendario del móvil. Úsala siempre que se hable de añadir al calendario, recordatorios, .ics, Google Calendar, Apple Calendar u Outlook en la web de la AMF.
---

# add2cal/add-to-calendar-button — "Añadir al calendario"

- **Repositorio:** https://github.com/add2cal/add-to-calendar-button
- **Estrellas:** 1,5k (comprobado el 12/10/2026) · **Licencia:** Elastic License 2.0 (no es código abierto pleno)
- Soporta Google, Apple, Microsoft 365/Outlook, Yahoo y archivos .ics; sin servidor ni rastreo.

## Qué se aplicó en la web AMF
- `calendario.html` ya tenía exportación a Google y .ics para los torneos.
- `liga.html`: botón **"Añadir al calendario"** en cada jornada **con fecha** (acción `calJor` en `ACCIONES`). Genera un .ics de día completo con jornada, grupo y lugar. Se escribió código propio en vez de usar la librería por su licencia y para no cargar scripts externos.

## Reglas del .ics que funcionan
- Día completo: `DTSTART;VALUE=DATE:AAAAMMDD` y `DTEND` = día siguiente.
- `UID` estable (p. ej. `codigo-grupo-jornada@amfmelide.es`) para que, si se vuelve a añadir, el calendario lo actualice en vez de duplicarlo.
- Escapar `\`, `;`, `,` y saltos de línea en textos; líneas separadas con `\r\n`.
- Si un día hay hora de partido, usar `DTSTART;TZID=Europe/Madrid:AAAAMMDDTHHMMSS`.
