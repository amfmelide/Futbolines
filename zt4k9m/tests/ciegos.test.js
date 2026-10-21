// node --test zt4k9m/tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../ciegos.js");

function conJugadores(modo, n, config) {
  const st = C.nuevoTorneo({ modo, semilla: 7, config });
  for (let i = 1; i <= n; i++) C.añadirJugador(st, "J" + i);
  return st;
}
// juega todo lo que haya en mesa/pendiente; gana el lado «a» salvo cada 3º
function jugarTodo(st) {
  let k = 0, p;
  const fmt = st.config.partidas;
  while ((p = C.pendientes(st)[0])) {
    const ganaA = (k++ % 3) !== 2;
    C.registrarResultado(st, p.id, ganaA ? fmt.partidas : 0, ganaA ? 0 : fmt.partidas);
  }
}

test("ciegos: sorteo de parejas y eliminatoria directa con pases para cualquier número", () => {
  for (const n of [4, 6, 10, 12, 16, 22, 32, 40]) {
    const st = conJugadores("ciegos", n);
    C.empezar(st);
    assert.equal(st.parejas.length, n / 2);
    const todos = st.parejas.flatMap(p => [p.j1, p.j2]);
    assert.equal(new Set(todos).size, n, "cada jugador en una sola pareja");
    jugarTodo(st);
    assert.equal(st.fase, "terminado", "n=" + n);
    const pod = C.podio(st);
    assert.equal(pod[0].pos, 1);
    assert.equal(pod[0].ids.length, 2);
  }
});

test("ciegos: con número impar de jugadores avisa en vez de dejar a uno sin pareja", () => {
  const st = conJugadores("ciegos", 7);
  assert.throws(() => C.empezar(st), /número par/);
  assert.equal(st.fase, "inscripcion");
});

test("monster DYP: nadie repite compañero mientras se pueda y los descansos se reparten", () => {
  const st = conJugadores("monster", 10, { rondas: 5 });
  C.empezar(st);
  const vistos = new Set();
  let repes = 0;
  for (let r = 1; r <= 5; r++) {
    C.rondaActual(st).forEach(p => [p.a, p.b].forEach(l => { const k = l.slice().sort().join("|"); if (vistos.has(k)) repes++; vistos.add(k); }));
    jugarTodo(st);
    if (r < 5) C.siguienteRonda(st);
  }
  assert.equal(repes, 0);
  C.siguienteRonda(st);
  assert.equal(st.fase, "terminado");
  const desc = {};
  st.jugadores.forEach(j => (desc[j.id] = 0));
  (st.descansos || []).forEach(d => d.ids.forEach(id => (desc[id] = desc[id] + 1)));
  const v = Object.values(desc);
  assert.equal(v.reduce((a, b) => a + b, 0), 10);          // 2 descansan por ronda × 5
  assert.ok(Math.max(...v) - Math.min(...v) <= 1, "descansos mal repartidos: " + v);
  const tabla = C.clasificacion(st);
  assert.equal(tabla.length, 10);
  assert.equal(C.podio(st).length, 3);
});

test("suizo: no repite rival, el impar descansa una sola vez y termina tras N rondas", () => {
  const st = conJugadores("suizo", 14, { rondas: 4 });   // 7 parejas
  C.empezar(st);
  const vistos = new Set();
  for (let r = 1; r <= 4; r++) {
    const ronda = C.rondaActual(st);
    assert.equal(ronda.filter(p => p.bye).length, 1);
    ronda.filter(p => !p.bye).forEach(p => { const k = [p.a, p.b].sort().join("|"); assert.ok(!vistos.has(k), "rival repetido"); vistos.add(k); });
    jugarTodo(st);
    C.siguienteRonda(st);
  }
  assert.equal(st.fase, "terminado");
  const byes = st.partidos.filter(p => p.bye).map(p => p.a);
  assert.equal(new Set(byes).size, byes.length);
  const t = C.clasificacion(st);
  assert.ok(t[0].puntos >= t[t.length - 1].puntos);
});

test("suizo con parejas fijas", () => {
  const st = C.nuevoTorneo({ modo: "suizo", semilla: 3, config: { parejas: "fijas", rondas: 3 } });
  for (let i = 1; i <= 6; i++) C.añadirPareja(st, "A" + i, "B" + i);
  C.empezar(st);
  const p = st.parejas.find(x => C.nombreJugador(st, x.j1) === "A1");
  assert.equal(C.nombreJugador(st, p.j2), "B1");
});

// Vidas: juega los partidos de uno en uno y, tras cada resultado, sortea con los que quedan libres
function jugarVidas(st, alSortear) {
  let k = 0, guard = 0;
  while (st.fase === "juego") {
    const p = C.pendientes(st)[0];
    if (!p) { const nuevos = C.sortearVidas(st); if (alSortear) alSortear(nuevos); if (!nuevos.length && st.fase === "juego") throw new Error("atascado"); continue; }
    C.registrarResultado(st, p.id, (k++ % 3) !== 2 ? 1 : 0, (k % 3) !== 0 ? 0 : 1);
    if (alSortear) alSortear(C.sortearVidas(st)); else C.sortearVidas(st);
    assert.ok(guard++ < 500, "no termina");
  }
}

test("vidas: cada jugador 3 vidas; en cuanto hay 4 libres se sortea y juegan sin esperar a los demás", () => {
  for (const n of [9, 10, 12, 16, 20, 23]) {
    const st = conJugadores("vidas", n);
    assert.equal(st.config.vidas, 3);
    C.empezar(st);
    assert.equal(st.parejas.length, 0, "no hay parejas fijas");
    assert.equal(C.pendientes(st).length, Math.floor(n / 4));
    jugarVidas(st, nuevos => {
      // nunca juega alguien sin vidas ni alguien que ya está en otro partido
      const v = C.vidasDe(st), vistos = new Set();
      C.pendientes(st).filter(p => p.fase === "ronda").forEach(p => p.a.concat(p.b).forEach(id => { assert.ok(v[id] > 0); assert.ok(!vistos.has(id), "jugador en dos partidos"); vistos.add(id); }));
    });
    assert.equal(st.fase, "final", "n=" + n);
    const v = C.vidasDe(st), quedan = C.vivos(st).length;
    assert.ok(quedan <= 8 && quedan >= 4, "quedan " + quedan);
    const enFinal = st.parejas.flatMap(p => [p.j1, p.j2]);
    assert.equal(new Set(enFinal).size, enFinal.length);
    enFinal.forEach(id => assert.ok(v[id] > 0));
    assert.equal(enFinal.length, quedan - (quedan % 2));
    jugarTodo(st);
    assert.equal(st.fase, "terminado");
    assert.equal(C.podio(st)[0].ids.length, 2);
  }
});

test("vidas: al acabar un partido, si hay 4 libres se sortea ya otro (sin esperar a que acabe la tanda)", () => {
  const st = conJugadores("vidas", 12);
  C.empezar(st);                                   // 3 partidos a la vez, nadie libre
  assert.equal(C.estadoVidas(st).libres.length, 0);
  assert.equal(C.sortearVidas(st).length, 0);
  const [p1] = C.pendientes(st);
  C.registrarResultado(st, p1.id, 1, 0);
  const libres = C.estadoVidas(st).libres;
  assert.equal(libres.length, 4);                  // los 4 del partido que acabó
  const nuevos = C.sortearVidas(st);
  assert.equal(nuevos.length, 1);
  assert.deepEqual(nuevos[0].a.concat(nuevos[0].b).sort(), libres.slice().sort());
  // y no repiten compañero
  const parejas = new Set([p1.a.slice().sort().join("|"), p1.b.slice().sort().join("|")]);
  assert.ok(!parejas.has(nuevos[0].a.slice().sort().join("|")) && !parejas.has(nuevos[0].b.slice().sort().join("|")));
});

test("vidas: con 8 o menos en pie se espera a que acaben los partidos en juego antes de la fase final", () => {
  const st = conJugadores("vidas", 10, { vidas: 1 });
  C.empezar(st);                                   // 2 partidos, 2 esperando
  const [p1, p2] = C.pendientes(st);
  C.registrarResultado(st, p1.id, 1, 0);          // quedan 8 vivos, pero p2 sigue en juego
  assert.equal(C.vivos(st).length, 8);
  assert.equal(C.sortearVidas(st).length, 0);
  assert.equal(st.fase, "juego");
  C.registrarResultado(st, p2.id, 1, 0);
  C.sortearVidas(st);
  assert.equal(st.fase, "final");
  assert.equal(st.parejas.length, 3);              // 6 vivos → 3 parejas
});

test("vidas: tablero con las vidas y el estado de cada jugador", () => {
  const st = conJugadores("vidas", 10);
  C.empezar(st);
  C.asignarMesas(st);
  const t = C.tableroVidas(st);
  assert.equal(t.length, 10);
  assert.equal(t.filter(x => x.estado === "mesa").length, 8);
  assert.equal(t.filter(x => x.estado === "libre").length, 2);
  assert.ok(t.every(x => x.vidas === 3));
});

test("vidas: perder quita una vida a los dos jugadores de la pareja", () => {
  const st = conJugadores("vidas", 12);
  C.empezar(st);
  const p = C.pendientes(st)[0];
  C.registrarResultado(st, p.id, 1, 0);
  const v = C.vidasDe(st);
  p.b.forEach(id => assert.equal(v[id], 2));
  p.a.forEach(id => assert.equal(v[id], 3));
});

test("vidas: con 8 jugadores o menos se va directo a la fase final", () => {
  const st = conJugadores("vidas", 7);
  C.empezar(st);
  assert.equal(st.fase, "final");
  assert.equal(st.parejas.length, 3);
  assert.ok(st.fueraFinal);
});

test("resultados: formato, corrección y no se puede tocar lo que ya tiene partidos detrás", () => {
  const st = conJugadores("ciegos", 8);
  C.empezar(st);
  const r1 = st.partidos.filter(p => p.ronda === 1);
  assert.throws(() => C.registrarResultado(st, r1[0].id, 1, 1), /ganador/);
  assert.throws(() => C.registrarResultado(st, r1[0].id, 3, 0), /llega a 2/);
  C.registrarResultado(st, r1[0].id, 2, 1);
  C.registrarResultado(st, r1[0].id, 0, 2);               // corregir antes de que se juegue lo siguiente
  C.registrarResultado(st, r1[1].id, 2, 0);
  const semi = st.partidos.find(p => p.ronda === 2 && p.n === 1);
  assert.equal(semi.a, r1[0].b);
  C.registrarResultado(st, semi.id, 2, 0);
  assert.equal(C.puedeEditar(st, r1[0].id), false);
  assert.throws(() => C.registrarResultado(st, r1[0].id, 2, 0), /dependen/);
});

test("mesas: no llama a dos partidos con el mismo jugador a la vez", () => {
  const st = conJugadores("monster", 9, { mesas: 5 });
  C.empezar(st);
  const ll = C.asignarMesas(st);
  assert.equal(ll.length, 2);
  const ids = ll.flatMap(p => p.a.concat(p.b));
  assert.equal(new Set(ids).size, ids.length);
});
