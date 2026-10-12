# Torneos AMF (micro-app privada)

Herramienta propia para organizar torneos de futbolín de hasta ~200 parejas:
**inscripción → grupos → Élite en doble K + Oro → cruces con ventaja → semis y final → control de mesas → avisos al móvil.**

**App oculta**: vive en la carpeta `zt4k9m/` (nombre sin sentido a propósito, como `k7m2x9/`), lleva `noindex`
y no está enlazada desde ninguna página pública. Sólo se llega:
- el organizador → desde el panel de administración de la Liga (botón **🏆 Torneos**, visible tras meter la contraseña)
  (el panel es el único `.html` de esta carpeta con nombre aleatorio; no lo enlaces en ningún sitio);
- las parejas → con el enlace/QR de cada torneo que les pasa la organización (`zt4k9m/index.html?t=CODIGO`).
  Sin `?t=` la página no muestra nada.

| Página | Para quién | Qué hace |
|---|---|---|
| `zt4k9m/index.html?t=CODIGO` | parejas | Inscribirse, "¿cuándo juego?", activar avisos, grupos, cuadros, mesas en juego |
| `zt4k9m/index.html?t=CODIGO&tv` | pantalla del local | Mesas en juego y próximos partidos en grande |
| `zt4k9m/<panel>.html` | organización | Parejas, sorteo, mesas, resultados, cuadros, cruces, avisos y ajustes |

## Formatos

**4 categorías (el habitual):** dos torneos en el mismo evento que **comparten mesas y cola**:
- Torneo **Élite / Oro**: grupos → 1º-4º a **Élite** (doble K) y el 5º a **Oro** (eliminatoria directa).
- Torneo **Plata / Bronce**: igual → 1º-4º a **Plata** (doble K) y el 5º a **Bronce**.
Cada pareja elige su torneo al inscribirse (o se lo pones tú).

**2 categorías:** sólo uno de los dos torneos (plantilla al crear el torneo).

Reglas comunes (todo editable en *Ajustes*):
1. **Grupos** de 4 (y alguno de 5), todos contra todos, **2 partidas a 6 goles** (puede acabar 1-1).
   Puntos 2/1/0. Desempates: puntos → enfrentamiento directo → dif. de partidas → dif. de goles → goles a favor → sorteo.
2. **Doble K** (Élite y Plata): quien pierde en ganadores baja a perdedores; quien pierde en perdedores, fuera. Hasta que
   quedan 4 y 4 → *🎲 Sortear cruces*: cada ganador contra un perdedor, a 3 partidas y el de ganadores empieza 1-0.
   Luego semifinales y final.
3. **Partidas de eliminatoria por categoría**: Élite y Plata a 3 partidas ganadas de 7 goles; Oro y Bronce a 3 de 5.
4. Los mejores de grupo reciben los pases directos y en la 1ª ronda no se cruzan dos del mismo grupo.

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
5. Entra en el panel de administración de la Liga, pulsa el botón 🏆, mete la contraseña de torneos y crea el torneo.

### Probar sin servidor

el panel con `?local` al final de la dirección guarda todo en el navegador (botón *💻 Local*). Sirve para ensayar, o para llevar un torneo sin
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
