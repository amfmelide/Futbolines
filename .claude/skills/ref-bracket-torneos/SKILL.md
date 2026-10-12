---
name: ref-bracket-torneos
description: Ideas del repositorio evroon/bracket (gestor de torneos de código abierto, 1,7k estrellas) para los torneos de la AMF. Úsala siempre que se hable de cuadros, eliminatorias, liguillas, sistema suizo, sorteos, mesas, horarios de partidos, una página de torneo en directo o el Máster de Melide, aunque no se nombre el repositorio.
---

# evroon/bracket — gestor de torneos

- **Repositorio:** https://github.com/evroon/bracket
- **Estrellas:** 1,7k (comprobado el 12/10/2026) · **Licencia:** AGPL-3.0
- **Tecnología:** FastAPI (Python) + React/Vite + PostgreSQL, se despliega con Docker.

## Qué hace bien
- Formatos: eliminatoria simple, liguilla (round-robin) y sistema suizo, en torneos de varias fases con grupos.
- Asigna partidos a **pistas/mesas y horas** arrastrándolos; el suizo se empareja solo.
- **Páginas públicas** por torneo, personalizables con logo, para que el público siga el torneo.
- Varios clubes, cada uno con varios torneos.

## Ideas para la web de la AMF
1. **Página "Torneo en directo"** (pendiente): cuadro + mesa y hora de cada partido + próximos partidos, con modo TV para el local. Falta decidir de dónde salen los datos: `sorteo.html` hoy solo funciona en el navegador de quien lo usa (no guarda en servidor). Habría que guardar el cuadro en Supabase (proyecto `axjanluawnatwqmwwbgd`, el mismo de la liga) con escritura protegida por contraseña en el servidor, como hace `liga.html` con su función `guardar-liga`.
2. Asignar mesa a cada partido para que la gente sepa dónde jugar.
3. Vista pública por pareja ("mis partidos"), como los dashboards de Bracket.

## Cuidado
- AGPL: si se copia código, la web que lo use debe publicar su código con la misma licencia. Inspirarse en ideas no tiene esa obligación.
- No usar Bracket tal cual: necesita servidor propio (Docker + PostgreSQL); la web de la AMF es estática en GitHub Pages.
