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

test("vidas individual: cada jugador 3 vidas, pareja a sorteo cada ronda y fase final con 8 o menos", () => {
  for (const n of [9, 10, 12, 16, 20, 23]) {
    const st = conJugadores("vidas", n);
    assert.equal(st.config.vidas, 3);
    C.empezar(st);
    assert.equal(st.parejas.length, 0, "en las rondas no hay parejas fijas");
    let guard = 0;
    while (st.fase === "juego") {
      // en cada ronda sólo juegan los vivos, en parejas de 2 contra 2
      const vivos = new Set(C.vivos(st));
      C.rondaActual(st).forEach(p => p.a.concat(p.b).forEach(id => assert.ok(vivos.has(id), "juega alguien sin vidas")));
      jugarTodo(st);
      if (st.fase === "juego") C.siguienteRonda(st);
      assert.ok(guard++ < 80, "no termina");
    }
    assert.equal(st.fase, "final");
    const v = C.vidasDe(st);
    const quedan = C.vivos(st).length;
    assert.ok(quedan <= 8 && quedan >= 4, "quedan " + quedan);
    assert.ok(Object.values(v).every(x => x >= 0 && x <= 3));
    // las parejas de la final son de jugadores vivos y nadie repite
    const enFinal = st.parejas.flatMap(p => [p.j1, p.j2]);
    assert.equal(new Set(enFinal).size, enFinal.length);
    enFinal.forEach(id => assert.ok(v[id] > 0));
    assert.equal(enFinal.length, quedan - (quedan % 2));
    jugarTodo(st);
    assert.equal(st.fase, "terminado");
    const pod = C.podio(st);
    assert.equal(pod[0].pos, 1);
    assert.equal(pod[0].ids.length, 2);
  }
});

test("vidas: los descansos se reparten (nadie descansa dos veces mientras otro no ha descansado)", () => {
  const st = conJugadores("vidas", 14, { vidas: 9 });          // muchas vidas para que sigan todos
  C.empezar(st);
  for (let r = 0; r < 6; r++) { jugarTodo(st); C.siguienteRonda(st); }
  const desc = {};
  C.vivos(st).forEach(id => (desc[id] = 0));
  (st.descansos || []).forEach(d => d.ids.forEach(id => { if (id in desc) desc[id]++; }));
  const v = Object.values(desc);
  assert.ok(Math.max(...v) - Math.min(...v) <= 1, "descansos: " + v);
});

test("vidas: perder quita una vida a los dos jugadores de la pareja", () => {
  const st = conJugadores("vidas", 12);
  C.empezar(st);
  const p = C.rondaActual(st)[0];
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
