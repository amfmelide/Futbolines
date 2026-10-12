# Torneos AMF (micro-app privada)

Herramienta propia para organizar torneos de futbolín de hasta ~200 parejas:
**inscripción → grupos → Élite en doble K + Oro → cruces con ventaja → semis y final → control de mesas → avisos al móvil.**

**App oculta**: vive en la carpeta `zt4k9m/` (nombre sin sentido a propósito, como `k7m2x9/`), lleva `noindex`
y no está enlazada desde ninguna página pública. Sólo se llega:
- el organizador → desde el panel de administración de la Liga (botón **🏆 Torneos**, visible tras meter la contraseña)
  o directamente en `amfmelide.es/zt4k9m/admin.html`;
- las parejas → con el enlace/QR de cada torneo que les pasa la organización (`zt4k9m/index.html?t=CODIGO`).
  Sin `?t=` la página no muestra nada.

| Página | Para quién | Qué hace |
|---|---|---|
| `zt4k9m/index.html?t=CODIGO` | parejas | Inscribirse, "¿cuándo juego?", activar avisos, grupos, cuadros, mesas en juego |
| `zt4k9m/index.html?t=CODIGO&tv` | pantalla del local | Mesas en juego y próximos partidos en grande |
| `zt4k9m/admin.html` | organización | Parejas, sorteo, mesas, resultados, cuadros, cruces, avisos y ajustes |

## Formato (por defecto, todo se cambia en *Ajustes*)

1. **Grupos** de 4 (y alguno de 5 si no cuadra), todos contra todos, **2 partidas a 6 goles** (puede acabar 1-1).
   Puntos: 2 victoria, 1 empate, 0 derrota (= un punto por partida). Desempates: puntos → enfrentamiento directo →
   diferencia de partidas → diferencia de goles → goles a favor → sorteo. Los goles de cada partida se meten en el marcador.
2. **Reparto**: grupos de 4 → los 4 a **Élite**. Grupos de 5 → 1º-4º a **Élite** y el 5º a **Oro**.
3. **Élite en doble K**: cuadro de **ganadores**; quien pierde ahí baja al cuadro de **perdedores**; quien pierde en
   perdedores, fuera. Se avanza hasta que quedan **4 en ganadores y 4 en perdedores**.
4. **Cruces**: botón *🎲 Sortear cruces*. Cada ganador contra un perdedor, **a 3 partidas** y el de ganadores
   **empieza 1-0**. Luego **semifinales y final**.
5. **Eliminatorias a 3 partidas ganadas de 7 goles; la primera ronda, de 5 goles.**
6. **Oro**: eliminatoria directa (se puede poner también en doble K).
7. Los mejores clasificados de grupo reciben los pases directos (byes) y en la primera ronda no se cruzan dos del mismo grupo.

## Mesas

*Llamar partidos y avisar* rellena las mesas libres con la cola (grupos por jornadas, luego ganadores y perdedores
intercalados) sin llamar nunca a una pareja que ya está jugando. En modo automático, al meter un resultado se llama al siguiente.

## Avisos al móvil

- **Push (recomendado)**: la pareja abre la web, elige su pareja y pulsa *Avisarme*. Al llamar su partido le llega una
  notificación aunque tenga el móvil bloqueado. En iPhone hay que *Añadir a pantalla de inicio* primero (iOS 16.4+);
  la web lo explica.
- **WhatsApp**: si una pareja no tiene push pero sí teléfono, el panel abre un botón de WhatsApp con el mensaje ya escrito.
- **Con la web abierta**: aunque no activen nada, la página pita y vibra cuando les toca.

Los teléfonos **no son públicos**: van en una tabla privada que sólo lee la Edge Function con la contraseña de organizador.

## Puesta en marcha (una sola vez)

Usa el mismo proyecto de Supabase que la Liga. (Si algún día quieres sacarla a otro dominio, basta copiar la carpeta `zt4k9m/`: no depende de nada más de la web.)

1. **Base de datos**: en Supabase → *SQL Editor*, pega y ejecuta `supabase/migrations/20261012000000_torneos.sql`.
2. **Claves push**: en tu ordenador, `npx web-push generate-vapid-keys`.
   Copia la *Public Key* en `zt4k9m/config.js` → `vapidPublica`.
3. **Secretos** (Supabase → *Edge Functions* → *Secrets*, o con la CLI):
   ```
   supabase secrets set TORNEO_ADMIN_PASS='tu-contraseña' \
     VAPID_PUBLIC_KEY='...' VAPID_PRIVATE_KEY='...' VAPID_SUBJECT='mailto:ivanmelide8@gmail.com'
   ```
4. **Función**: `supabase functions deploy torneo-api --no-verify-jwt`
   (o créala desde el panel con el código de `supabase/functions/torneo-api/index.ts` y desactiva "Verify JWT").
5. Abre `https://amfmelide.es/zt4k9m/admin.html` (o el botón 🏆 Torneos del panel de la Liga), entra con la contraseña y crea el torneo.

### Probar sin servidor

`zt4k9m/admin.html?local` guarda todo en el navegador (botón *💻 Local*). Sirve para ensayar, o para llevar un torneo sin
internet desde un portátil. Usa *Parejas de prueba* para simular un torneo grande. Sin Supabase no hay push ni inscripción
desde otros móviles.

## Tests del motor

```
node --test zt4k9m/tests/*.test.js
```

## Ideas para seguir mejorando

- Horario estimado por pareja según la cola y la duración media de los partidos.
- Que los propios jugadores introduzcan el resultado y el organizador lo confirme.
- Ranking acumulado entre torneos (enlazar con `bases_ranking.html`).
- Cobro de inscripción y lista de espera.

Inspirado en proyectos libres como *brackets-manager.js* / *brackets-viewer.js* (modelo fase → ronda → partido,
siembra estándar y byes), *tournament/groupstage* (reparto en serpiente y liguillas) y en el flujo de mesas de Challonge.
