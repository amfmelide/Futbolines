# Torneos AMF

Herramienta propia para organizar torneos de futbolín de hasta ~200 parejas:
**inscripción por la web → grupos de 4/5 → categorías según la posición en el grupo →
eliminatorias por categoría, con caída a la categoría inferior → control de mesas → avisos al móvil.**

| Página | Para quién | Qué hace |
|---|---|---|
| `torneos/index.html?t=CODIGO` | jugadores y público | Inscribirse, "¿cuándo juego?", activar avisos, grupos, cuadros, mesas en juego |
| `torneos/index.html?t=CODIGO&tv` | pantalla del local | Mesas en juego y próximos partidos en grande |
| `torneos/admin.html` | organización | Parejas, sorteo, mesas, resultados, cuadros, avisos y ajustes |

## Cómo funciona el formato

1. **Grupos**: con tamaño 4 salen grupos de 4 y, si sobran parejas, algunos de 5 (con 5, al revés).
   Las parejas con *cabeza de serie* (1 = la mejor) se reparten en serpiente en grupos distintos; el resto, por sorteo.
   Liguilla todos contra todos. Desempates: puntos → enfrentamiento directo → diferencia → a favor → sorteo.
2. **Categorías**: en *Ajustes* decides qué posiciones van a cada categoría (por defecto 1º-2º Primera, 3º Segunda, 4º-5º Tercera).
3. **Cuadros**: eliminatoria directa por categoría. Los mejores clasificados reciben los "libres" (byes) y se evita
   que dos parejas del mismo grupo se crucen en la primera ronda.
4. **Caída** (opcional): quien pierde **su primer partido** en una categoría baja a la siguiente y entra en ella como
   cabeza de serie. Por eso el cuadro de Segunda se genera cuando todas las parejas de Primera han jugado su primer partido
   (el panel avisa en cuanto se puede).
5. **Mesas**: el botón *Llamar partidos y avisar* rellena las mesas libres con la cola (primero grupos por jornadas, luego
   eliminatorias; nunca llama a una pareja que ya está jugando). En modo automático, al meter un resultado se llama al siguiente.

## Avisos al móvil

- **Push (recomendado)**: la pareja abre la web, elige su pareja y pulsa *Avisarme*. Al llamar su partido le llega una
  notificación aunque tenga el móvil bloqueado. En iPhone hay que *Añadir a pantalla de inicio* primero (iOS 16.4+);
  la web lo explica.
- **WhatsApp**: si una pareja no tiene push pero sí teléfono, el panel abre un botón de WhatsApp con el mensaje ya escrito.
- **Con la web abierta**: aunque no activen nada, la página pita y vibra cuando les toca.

Los teléfonos **no son públicos**: van en una tabla privada que sólo lee la Edge Function con la contraseña de organizador.

## Puesta en marcha (una sola vez)

Usa el mismo proyecto de Supabase que la Liga.

1. **Base de datos**: en Supabase → *SQL Editor*, pega y ejecuta `supabase/migrations/20261012000000_torneos.sql`.
2. **Claves push**: en tu ordenador, `npx web-push generate-vapid-keys`.
   Copia la *Public Key* en `torneos/config.js` → `vapidPublica`.
3. **Secretos** (Supabase → *Edge Functions* → *Secrets*, o con la CLI):
   ```
   supabase secrets set TORNEO_ADMIN_PASS='tu-contraseña' \
     VAPID_PUBLIC_KEY='...' VAPID_PRIVATE_KEY='...' VAPID_SUBJECT='mailto:ivanmelide8@gmail.com'
   ```
4. **Función**: `supabase functions deploy torneo-api --no-verify-jwt`
   (o créala desde el panel con el código de `supabase/functions/torneo-api/index.ts` y desactiva "Verify JWT").
5. Abre `https://amfmelide.es/torneos/admin.html`, entra con la contraseña y crea el torneo.

### Probar sin servidor

`admin.html?local` guarda todo en el navegador (botón *💻 Local*). Sirve para ensayar, o para llevar un torneo sin
internet desde un portátil. Usa *Parejas de prueba* para simular un torneo grande. Sin Supabase no hay push ni inscripción
desde otros móviles.

## Tests del motor

```
node --test torneos/tests/*.test.js
```

## Ideas para seguir mejorando

- Mejores terceros (repescas entre grupos) y doble eliminación.
- Horario estimado por pareja según la cola y la duración media de los partidos.
- Que los propios jugadores introduzcan el resultado y el organizador lo confirme.
- Ranking acumulado entre torneos (enlazar con `bases_ranking.html`).
- Cobro de inscripción y lista de espera.

Inspirado en proyectos libres como *brackets-manager.js* / *brackets-viewer.js* (modelo fase → ronda → partido,
siembra estándar y byes), *tournament/groupstage* (reparto en serpiente y liguillas) y en el flujo de mesas de Challonge.
