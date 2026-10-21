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

**Por niveles (3 o 4 categorías, todos juntos en grupos de 5):** cada pareja tiene un **nivel** (Élite, Oro, Plata,
Bronce) que pone el organizador antes del torneo (ficha de la pareja o columna *Nivel* al importar).
- 1º-4º de grupo → ganadores de Élite.
- El 5º → perdedores de Élite si es de nivel Élite; si no, baja a Oro.
- Quien pierde en ganadores de una categoría: si es de ese nivel (o mejor) va a perdedores de esa categoría
  (si tiene doble K; si no, queda fuera); si es de nivel inferior, baja a la categoría siguiente.
- Quien pierde en perdedores queda fuera.
- En cada categoría eliges doble K o simple. Con perdedores: al quedar 4 y 4 se sortean los cruces (el de ganadores
  empieza 1-0). Si no hay nadie en perdedores: directo hasta la final, sin sorteo.
- Como las parejas llegan a cada categoría sobre la marcha, las rondas se generan solas en cuanto termina la anterior
  (los mejores clasificados descansan cuando sobra alguien). Si corriges un resultado y cambia el ganador, se borran y
  rehacen los partidos que dependían de él (siempre que no se hayan empezado a jugar).

Reglas comunes (todo editable en *Ajustes*):
1. **Grupos** de 4 (y alguno de 5), todos contra todos, **2 partidas a 6 goles** (puede acabar 1-1).
   Puntos 2/1/0. Desempates: puntos → enfrentamiento directo → dif. de partidas → dif. de goles → goles a favor → sorteo.
2. **Doble K** (Élite y Plata): quien pierde en ganadores baja a perdedores; quien pierde en perdedores, fuera. Hasta que
   quedan 4 y 4 → *🎲 Sortear cruces*: cada ganador contra un perdedor, a 3 partidas y el de ganadores empieza 1-0.
   Luego semifinales y final.
3. **Partidas de eliminatoria por categoría**: Élite y Plata a 3 partidas ganadas de 7 goles; Oro y Bronce a 3 de 5.
4. Los mejores de grupo reciben los pases directos y en la 1ª ronda no se cruzan dos del mismo grupo.

## Resultados desde la mesa (QR)

En *Ajustes → ¿Quién apunta los resultados?* eliges:
- **Sólo la organización** (como siempre).
- **Las parejas con el QR de la mesa, y yo los valido**: llegan a una bandeja en *Mesas* y se apuntan con un toque (✓), se editan (✎) o se descartan (✕).
- **Las parejas con el QR de la mesa, se apuntan solos**: el panel (abierto) los apunta en segundos; sólo quedan en la bandeja los dudosos (partido ya jugado o marcador imposible).

Cada mesa tiene su QR (*Avisos → 🖨 QR de las mesas*). Al escanearlo la pareja ve el partido de esa mesa o elige su grupo
y la partida, mete los goles de cada partida, revisa y envía. El QR lleva un código secreto del torneo (cambia en cada torneo
y deja de valer al terminarlo); probar códigos a ciegas está frenado.

## Hojas para imprimir

*Grupos → 🖨 Imprimir hojas* (o *Avisos → 🖨*): grupos con todos los enfrentamientos y casillas para los goles de cada
partida, eliminatorias (con huecos para los que aún no se conocen), lista de parejas para pasar lista y QR de las mesas.
Los resultados ya apuntados salen rellenos.

## Sorteo en directo

Estilo tragaperras: los nombres giran, frenan en el elegido y la tarjeta vuela a su hueco (con pausa, rápido, ver todo y pantalla completa; confeti al terminar).

*Grupos → 🎬 Sorteo en directo* y, en doble K, *🎬 Sortear cruces en directo*: pantalla completa para proyectar con el
bombo sacando parejas una a una. Botones *Rápido*, *Ver todo* y *Pantalla completa*. El sorteo se hace al pulsar y la
animación lo va mostrando; se puede volver a ver cuando se quiera.

## Modo por niveles a la vista

En *Cuadros* aparece «Así se mueven las parejas»: por categoría, cuántas entran, siguen en ganadores y en perdedores,
bajan a la siguiente y están eliminadas. Cada pareja ve su camino en *Mi pareja* (p. ej. 5º grupo B → Oro → R1 ✓ → R2 ✗ → baja a Plata).

## Seguridad

- En el código no hay ninguna clave ni contraseña.
- **Freno contra quien intenta adivinar contraseñas** (en la base de datos): 5 fallos desde un dispositivo en 15 min →
  bloqueado 15 min, y cada reincidencia el doble (hasta 24 h); 40 fallos entre todos en 10 min → pausa de 10 min.
  También limita inscripciones y resultados enviados por dispositivo.

## Mesas

*Llamar partidos y avisar* rellena las mesas libres con la cola (grupos por jornadas, luego ganadores y perdedores
intercalados) sin llamar nunca a una pareja que ya está jugando. En modo automático, al meter un resultado se llama al siguiente.

- **Turnos justos**: si hay otros partidos esperando, no se llama a una pareja que acaba de terminar (descanso mínimo, 5 min por defecto) y tiene prioridad quien lleva más rato sin jugar.
- **Cuenta atrás para presentarse** (5 min por defecto): a la mitad se les vuelve a avisar solo; al acabar, la mesa se pone en rojo y **propone** el W.O. (botones «No vino…», «+5 min», «Han llegado»). Nunca da el W.O. sola.
- **«Os toca en X partidos»** en la pantalla de cada pareja. En eliminatorias también da el tiempo aproximado (35 min por partida por defecto, ajustable en *Ajustes → Mesas y tiempos*); en grupos sólo el número de partidos.
- **Pantalla TV** (`index.html?t=CODIGO&tv`): va cambiando sola cada 15 s entre mesas en juego, grupos, cuadros y campeones. `&seg=20` cambia el tiempo; `&fijo` deja sólo las mesas.
- **Imagen para redes**: en *Cuadros* (panel) y en *Campeones* (web pública), un PNG 1080×1350 con el podio de cada categoría, listo para Instagram o WhatsApp.

## Ciegos (torneos pequeños a sorteo)

Panel aparte (botón **🎲 Ciegos** en la pantalla de entrada del panel de torneos; misma contraseña). Web pública: `ciegos.html?t=CODIGO` (y `&tv`). Usa la misma función de Supabase: no hay que desplegar nada nuevo. Sus torneos empiezan por `ciegos-` y no se mezclan con los grandes.

- **Ciegos**: cada jugador se apunta solo, se sortean las parejas (sorteo en directo) y eliminatoria directa (con pases si no cuadran; 3er puesto opcional).
- **Monster DYP**: cada ronda un compañero distinto (y rivales distintos si se puede), clasificación individual; si sobran jugadores descansan por turnos. 5 rondas por defecto.
- **Suizo**: por parejas (a sorteo o fijas); en cada ronda se enfrentan quienes van igual, sin repetir rival; el impar descansa y suma victoria. Desempata la suma de puntos de los rivales (Buchholz).
- **Vidas** (individual, sin rondas): cada jugador empieza con 3 vidas. En cuanto hay 4 jugadores libres se sortean parejas y rivales entre ellos y juegan ya (primero los que más llevan esperando; sin repetir compañero si se puede). Perder quita una vida a los dos. Sin repesca. Tablero con las vidas y el estado de cada jugador (panel, web pública y TV). Con 8 o menos en pie, cuando acaban los partidos en juego: parejas a sorteo, semifinales y final.

## Avisos al móvil

- **Push (recomendado)**: la pareja abre la web, elige su pareja y pulsa *Avisarme*. Al llamar su partido le llega una
  notificación aunque tenga el móvil bloqueado. En iPhone hay que *Añadir a pantalla de inicio* primero (iOS 16.4+);
  la web lo explica.
- **WhatsApp**: si una pareja no tiene push pero sí teléfono, el panel abre un botón de WhatsApp con el mensaje ya escrito.
- **Con la web abierta**: aunque no activen nada, la página pita y vibra cuando les toca.

Los teléfonos **no son públicos**: van en una tabla privada que sólo lee la Edge Function con la contraseña de organizador.

## Puesta en marcha (una sola vez, desde el navegador)

En el código **no hay ninguna clave ni contraseña**: todo pasa por dos Edge Functions y las contraseñas son secretos de Supabase.

1. **Supabase → SQL Editor → New query**: pega `supabase/migrations/20261012000000_torneos.sql` y pulsa *Run*.
   Repite con `supabase/migrations/20261013000000_freno_accesos.sql` (sin él no se puede entrar: el freno es obligatorio).
2. **Edge Functions → Deploy a new function → Via Editor**: nombre `torneo-api`, pega `supabase/functions/torneo-api/index.ts`, *Deploy*.
   En los ajustes de la función desactiva **Verify JWT**.
3. Igual con `amf-web` (`supabase/functions/amf-web/index.ts`), también sin *Verify JWT*.
4. **Edge Functions → Secrets** (Add new secret):
   `TORNEO_ADMIN_PASS`, `AMF_ADMIN_PASS`, `MESAS_PIN`, `MONTERROSO_PASS`, `SORTEO_PASS`, `TORNEOS_PANEL`
   (ruta del panel de torneos, ver Notion) y las claves de avisos `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (si no las tienes de amf-avisos, el panel de torneos las genera: *Avisos → Generar claves*).
5. Fusionar la rama en `main` **después** de los pasos 2-4 (la portada, la liga, el calendario, recuerdos, el sorteo y
   el control de mesas ya dependen de `amf-web`).
6. Opcional, cuando dejes de usar amf-avisos: ejecutar `supabase/migrations/20261012020000_cerrar_amf_avisos.sql` y
   borrar la función `send-notification`.

Al terminar cada torneo se borran solos los teléfonos y las suscripciones de avisos (también hay un botón en *Ajustes*).

### Probar sin servidor

el panel con `?local` al final de la dirección guarda todo en el navegador (botón *💻 Local*). Sirve para ensayar, o para llevar un torneo sin
internet desde un portátil. Usa *Parejas de prueba* para simular un torneo grande. Sin Supabase no hay push ni inscripción
desde otros móviles.

## Tests del motor

```
node --test zt4k9m/tests/*.test.js   # 17 tests
```

## Ideas para seguir mejorando

- Horario estimado por pareja según la cola y la duración media de los partidos.
- Que los propios jugadores introduzcan el resultado y el organizador lo confirme.
- Ranking acumulado entre torneos (enlazar con `bases_ranking.html`).
- Cobro de inscripción y lista de espera.

Inspirado en proyectos libres como *brackets-manager.js* / *brackets-viewer.js* (modelo fase → ronda → partido,
siembra estándar y byes), *tournament/groupstage* (reparto en serpiente y liguillas) y en el flujo de mesas de Challonge.
