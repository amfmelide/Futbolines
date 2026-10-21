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
    { const ganaA = (k++ % 3) !== 2; C.registrarResultado(st, p.id, ganaA ? 2 : 1, ganaA ? 1 : 2); }
    if (alSortear) alSortear(C.sortearVidas(st)); else C.sortearVidas(st);
    assert.ok(guard++ < 500, "no termina");
  }
}

test("vidas: a la fase final llegan siempre 8 en pie → 4 parejas, 2 semifinales y final (nunca pasa nadie directo)", () => {
  for (const n of [9, 10, 11, 12, 13, 16, 20, 23, 30]) for (const semilla of [1, 2, 3, 4, 5]) {
    const st = C.nuevoTorneo({ modo: "vidas", semilla });
    for (let i = 1; i <= n; i++) C.añadirJugador(st, "J" + i);
    C.empezar(st);
    assert.equal(st.parejas.length, 0, "no hay parejas fijas");
    jugarVidas(st, () => {
      assert.ok(C.vivos(st).length >= 8, "baja de 8 en pie: " + C.vivos(st).length);
      const v = C.vidasDe(st), vistos = new Set();
      C.pendientes(st).filter(p => p.fase === "ronda").forEach(p => p.a.concat(p.b).forEach(id => { assert.ok(v[id] > 0); assert.ok(!vistos.has(id), "jugador en dos partidos"); vistos.add(id); }));
    });
    assert.equal(st.fase, "final", "n=" + n);
    assert.equal(C.vivos(st).length, 8, "n=" + n + " semilla " + semilla);
    assert.equal(st.parejas.length, 4);
    const semis = st.partidos.filter(p => p.fase === "final" && p.ronda === 1);
    assert.equal(semis.length, 2);
    assert.ok(semis.every(p => p.a && p.b && !p.bye), "nadie pasa directo");
    const enFinal = st.parejas.flatMap(p => [p.j1, p.j2]);
    assert.deepEqual(enFinal.slice().sort(), C.vivos(st).slice().sort());
    jugarTodo(st);
    assert.equal(st.fase, "terminado");
    assert.deepEqual(C.podio(st).map(x => x.pos), [1, 2, 3, 3]);
  }
});

test("vidas: atasco con 9 en pie y 1 vida cada uno → si caen dos, uno se salva por sorteo y quedan 8", () => {
  const st = conJugadores("vidas", 9, { vidas: 1 });
  C.empezar(st);
  const [p] = C.pendientes(st);
  assert.ok(p, "debe jugarse un partido aunque no sea seguro");
  C.registrarResultado(st, p.id, 2, 0);
  assert.equal(C.vivos(st).length, 8);
  assert.equal(p.salvados.length, 1);
  C.sortearVidas(st);
  assert.equal(st.fase, "final");
});

test("vidas: al acabar un partido, si hay 4 libres se sortea ya otro (sin esperar a que acabe la tanda)", () => {
  const st = conJugadores("vidas", 12);
  C.empezar(st);                                   // 3 partidos a la vez, nadie libre
  assert.equal(C.estadoVidas(st).libres.length, 0);
  assert.equal(C.sortearVidas(st).length, 0);
  const [p1] = C.pendientes(st);
  C.registrarResultado(st, p1.id, 2, 0);
  const libres = C.estadoVidas(st).libres;
  assert.equal(libres.length, 4);                  // los 4 del partido que acabó
  const nuevos = C.sortearVidas(st);
  assert.equal(nuevos.length, 1);
  assert.deepEqual(nuevos[0].a.concat(nuevos[0].b).sort(), libres.slice().sort());
  // y no repiten compañero
  const parejas = new Set([p1.a.slice().sort().join("|"), p1.b.slice().sort().join("|")]);
  assert.ok(!parejas.has(nuevos[0].a.slice().sort().join("|")) && !parejas.has(nuevos[0].b.slice().sort().join("|")));
});

test("vidas: con 8 en pie se anulan los partidos sin empezar y, al acabar los de las mesas, semifinales", () => {
  const st = conJugadores("vidas", 12, { vidas: 1 });
  C.empezar(st);                                   // 12 con 1 vida: presupuesto 4 → sólo partidos que no dejen menos de 8
  for (const p of C.pendientes(st)) assert.ok(p.a.concat(p.b).length === 4);
  C.asignarMesas(st);
  jugarVidas(st);
  assert.equal(C.vivos(st).length, 8);
  assert.equal(st.fase, "final");
  assert.equal(st.partidos.filter(p => p.fase === "ronda" && p.estado !== "fin").length, 0);
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
  C.registrarResultado(st, p.id, 2, 0);
  const v = C.vidasDe(st);
  p.b.forEach(id => assert.equal(v[id], 2));
  p.a.forEach(id => assert.equal(v[id], 3));
});

test("vidas: hacen falta 8 jugadores; con 8 justos se va directo a semifinales", () => {
  assert.throws(() => C.empezar(conJugadores("vidas", 7)), /al menos 8/);
  const st = conJugadores("vidas", 8);
  C.empezar(st);
  assert.equal(st.fase, "final");
  assert.equal(st.parejas.length, 4);
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

test("por defecto se juega a ganar 2 partidas de 7 goles", () => {
  for (const m of ["ciegos", "monster", "suizo", "vidas"]) assert.deepEqual(C.nuevoTorneo({ modo: m }).config.partidas, { tipo: "al", partidas: 2, goles: 7 });
});

test("vidas: cada partido va en la ronda del nº de partido de sus jugadores", () => {
  const st = conJugadores("vidas", 12);
  C.empezar(st);
  assert.deepEqual(C.rondasVista(st).map(r => [r.n, r.partidos.length]), [[1, 3]]);
  const [p1] = C.pendientes(st);
  C.registrarResultado(st, p1.id, 2, 0);
  const [nuevo] = C.sortearVidas(st);
  assert.equal(C.rondaDe(st, nuevo), 2);
  assert.deepEqual(C.rondasVista(st).map(r => [r.n, r.partidos.length]), [[1, 3], [2, 1]]);
});
