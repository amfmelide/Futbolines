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

// Vidas: juega un partido «listo» cada vez (el que se diga) y sigue
function listas(st) { const e = C.estadosVidas(st); return st.partidos.filter(p => (e[p.id] || {}).estado === "lista"); }
function jugarVidas(st, cada, elegir) {
  let k = 0, guard = 0;
  while (st.fase === "juego") {
    const ls = listas(st);
    if (!ls.length) throw new Error("atascado: nada listo en fase de juego");
    const p = elegir ? elegir(ls) : ls[0];
    const ganaA = (k++ % 3) !== 2;
    C.registrarResultado(st, p.id, ganaA ? 2 : 1, ganaA ? 1 : 2);
    C.sortearVidas(st);
    if (cada) cada(p);
    assert.ok(guard++ < 800, "no termina");
  }
}

test("vidas: al empezar se sortean la ronda 1 y la 2; la 2 espera a que sus jugadores acaben la 1", () => {
  const st = conJugadores("vidas", 12);
  assert.equal(st.config.vidas, 3);
  C.empezar(st);
  assert.deepEqual(C.rondasVista(st).map(r => [r.n, r.partidos.length]), [[1, 3], [2, 3]]);
  const e = C.estadosVidas(st);
  st.partidos.filter(p => p.ronda === 1).forEach(p => assert.equal(e[p.id].estado, "lista"));
  st.partidos.filter(p => p.ronda === 2).forEach(p => assert.equal(e[p.id].estado, "espera"));
  // no se puede jugar uno de la ronda 2 si sus jugadores no han acabado la 1
  const r2 = st.partidos.find(p => p.ronda === 2);
  assert.throws(() => C.registrarResultado(st, r2.id, 2, 0), /ronda anterior/);
  // al acabar los partidos de la ronda 1 de sus 4 jugadores, se pone «lista»
  const suyos = st.partidos.filter(p => p.ronda === 1 && p.a.concat(p.b).some(id => r2.a.concat(r2.b).includes(id)));
  suyos.forEach(p => { C.registrarResultado(st, p.id, 2, 0); C.sortearVidas(st); });
  assert.equal(C.estadosVidas(st)[r2.id].estado, "lista");
  // al acabar toda la ronda 1 se sortea la 3
  st.partidos.filter(p => p.ronda === 1 && p.estado !== "fin").forEach(p => { C.registrarResultado(st, p.id, 0, 2); C.sortearVidas(st); });
  assert.ok(C.rondasVista(st).some(r => r.n === 3));
  assert.ok(!C.rondasVista(st).some(r => r.n === 4), "sólo una ronda por delante");
});

test("vidas: a la fase final llegan siempre 8 en pie → 4 parejas, 2 semifinales y final (nunca pasa nadie directo)", () => {
  for (const n of [9, 10, 11, 12, 13, 16, 20, 23, 30]) for (const semilla of [1, 2, 3, 4, 5]) {
    const st = C.nuevoTorneo({ modo: "vidas", semilla });
    for (let i = 1; i <= n; i++) C.añadirJugador(st, "J" + i);
    C.empezar(st);
    jugarVidas(st, () => {
      assert.ok(C.vivos(st).length >= 8, "baja de 8 en pie: " + C.vivos(st).length);
      // nadie vivo-muerto en partidos sin jugar, y nadie en dos partidos de la misma ronda
      const v = C.vidasDe(st);
      const porRonda = {};
      st.partidos.filter(p => p.fase === "ronda" && p.estado !== "fin").forEach(p => p.a.concat(p.b).forEach(id => {
        assert.ok(v[id] > 0, "juega uno sin vidas");
        const k = p.ronda + "|" + id; assert.ok(!porRonda[k], "jugador dos veces en una ronda"); porRonda[k] = 1;
      }));
    }, ls => ls[Math.floor(Math.random() * ls.length)]);
    assert.equal(st.fase, "final", "n=" + n);
    assert.equal(C.vivos(st).length, 8, "n=" + n + " semilla " + semilla);
    assert.ok(!st.partidos.some(p => p.salvados && p.salvados.length), "no debe hacer falta salvar a nadie por sorteo");
    assert.equal(st.parejas.length, 4);
    const semis = st.partidos.filter(p => p.fase === "final" && p.ronda === 1);
    assert.equal(semis.length, 2);
    assert.ok(semis.every(p => p.a && p.b && !p.bye), "nadie pasa directo");
    jugarTodo(st);
    assert.equal(st.fase, "terminado");
    assert.deepEqual(C.podio(st).map(x => x.pos), [1, 2, 3, 3]);
  }
});

test("vidas: si un jugador cae y ya estaba sorteado en la ronda siguiente, ese partido se rehace sin él", () => {
  const st = conJugadores("vidas", 13, { vidas: 1 });          // 13: 3 partidos + 1 descansa por ronda
  C.empezar(st);
  const r1 = st.partidos.filter(p => p.ronda === 1);
  const p = r1.find(x => C.estadosVidas(st)[x.id].estado === "lista");
  C.registrarResultado(st, p.id, 2, 0);
  C.sortearVidas(st);
  const muertos = p.b.filter(id => !(C.vidasDe(st)[id] > 0));
  assert.ok(muertos.length >= 1);
  st.partidos.filter(x => x.ronda === 2 && x.estado !== "fin").forEach(x => muertos.forEach(m => assert.ok(!x.a.concat(x.b).includes(m), "un eliminado sigue sorteado")));
});

test("vidas: el cálculo de salidas a 8 justos (callejones sin salida)", () => {
  assert.equal(C.ganable(9, 0, 0), false);   // 9 con 1 vida: cualquier partido deja 7
  assert.equal(C.ganable(10, 0, 0), true);   // 10 con 1 vida: cae una pareja → 8
  assert.equal(C.ganable(11, 0, 0), false);  // 11 con 1 vida: quedarían 9 con 1 vida
  assert.equal(C.ganable(7, 2, 0), true);    // 9 en pie con dos de 2 vidas: se mezclan y cae sólo uno
  assert.equal(C.ganable(0, 0, 16), true);
});

test("vidas: atasco con 9 en pie y 1 vida cada uno → se juega y, si caen dos, uno se salva por sorteo y quedan 8", () => {
  const st = conJugadores("vidas", 9, { vidas: 1 });
  C.empezar(st);
  const ls = listas(st);
  assert.equal(ls.length, 1, "debe poder jugarse un partido aunque no sea seguro");
  C.registrarResultado(st, ls[0].id, 2, 0);
  assert.equal(C.vivos(st).length, 8);
  C.sortearVidas(st);
  assert.equal(st.fase, "final");
});

test("vidas: tablero con las vidas y lo que hace cada jugador", () => {
  const st = conJugadores("vidas", 10);
  C.empezar(st);
  st.config.mesas = 4;
  C.asignarMesas(st);
  const t = C.tableroVidas(st);
  assert.equal(t.length, 10);
  assert.equal(t.filter(x => x.estado === "mesa").length, 8);
  assert.ok(t.every(x => x.vidas === 3));
});

test("vidas: perder quita una vida a los dos jugadores de la pareja", () => {
  const st = conJugadores("vidas", 12);
  C.empezar(st);
  const p = listas(st)[0];
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

test("vidas: al acabar las semifinales se sortean otra vez las parejas de la final (uno de cada semifinal)", () => {
  for (const semilla of [1, 2, 3, 4, 5, 6]) {
    const st = C.nuevoTorneo({ modo: "vidas", semilla });
    for (let i = 1; i <= 8; i++) C.añadirJugador(st, "J" + i);
    C.empezar(st);
    const [s1, s2] = st.partidos.filter(p => p.fase === "final" && p.ronda === 1);
    const final = C.partido(st, st.ko.finalId);
    assert.ok(final.sorteo && !final.a && !final.b, "la final aún sin parejas");
    C.registrarResultado(st, s1.id, 2, 0);
    assert.ok(!final.a && !final.b, "con una semifinal no se sortea todavía");
    C.registrarResultado(st, s2.id, 0, 2);
    assert.ok(final.a && final.b, "sorteada al acabar las dos");
    const g1 = C.jugadoresDe(st, s1.ganadorId), g2 = C.jugadoresDe(st, s2.ganadorId);
    const nuevas = [final.a, final.b].map(id => C.jugadoresDe(st, id));
    assert.deepEqual(nuevas.flat().sort(), g1.concat(g2).sort(), "en la final están los 4 ganadores");
    nuevas.forEach(par => { assert.equal(par.filter(id => g1.includes(id)).length, 1); assert.equal(par.filter(id => g2.includes(id)).length, 1); });
    // corregir una semifinal vuelve a sortear la final con los nuevos ganadores
    const parejasAntes = st.parejas.length;
    C.registrarResultado(st, s1.id, 0, 2);
    assert.equal(st.parejas.length, parejasAntes, "no se acumulan parejas viejas");
    assert.deepEqual([final.a, final.b].flatMap(id => C.jugadoresDe(st, id)).sort(), C.jugadoresDe(st, s1.ganadorId).concat(g2).sort());
    C.registrarResultado(st, final.id, 2, 1);
    assert.equal(st.fase, "terminado");
    const pod = C.podio(st);
    assert.deepEqual(pod.map(x => x.pos), [1, 2, 3, 3]);
    assert.equal(new Set(pod.flatMap(x => x.ids)).size, 8, "los 8 en el podio, sin repetir");
  }
});

test("resultados: en Ciegos y Vidas basta con apuntar quién gana; en Monster y Suizo cuenta el marcador", () => {
  assert.equal(C.usaMarcador({ modo: "ciegos" }), false);
  assert.equal(C.usaMarcador({ modo: "vidas" }), false);
  assert.equal(C.usaMarcador({ modo: "monster" }), true);
  assert.equal(C.usaMarcador({ modo: "suizo" }), true);
  const st = conJugadores("ciegos", 8);
  C.empezar(st);
  const p = C.pendientes(st)[0];
  C.registrarGanador(st, p.id, "b");
  assert.equal(p.ganador, "b"); assert.ok(p.soloGanador); assert.ok(p.rb > p.ra);
  C.registrarResultado(st, p.id, 2, 1);                  // corregir con marcador quita la marca
  assert.equal(p.ganador, "a"); assert.ok(!p.soloGanador);
  assert.throws(() => C.registrarGanador(st, p.id, "x"), /ganador/);
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


test("vidas: equidad — nadie se adelanta en partidos (18 jugadores)", () => {
  let suma = 0, n = 0;
  for (let s = 1; s <= 25; s++) {
    const st = C.nuevoTorneo({ modo: "vidas", semilla: s * 7 + 1, config: { mesas: 4 } });
    for (let i = 1; i <= 18; i++) C.añadirJugador(st, "J" + i);
    C.empezar(st); C.asignarMesas(st);
    let g = 0, peor = 0, k = 0;
    while (st.fase === "juego" && g++ < 4000) {
      const pj = {};
      st.partidos.forEach(p => { if (p.fase === "ronda" && p.estado !== "pendiente") p.a.concat(p.b).forEach(id => (pj[id] = (pj[id] || 0) + 1)); });
      const viv = C.vivos(st).map(id => pj[id] || 0);
      peor = Math.max(peor, Math.max(...viv) - Math.min(...viv));
      const ms = st.partidos.filter(x => x.estado === "mesa");
      if (!ms.length) { C.sortearVidas(st); C.asignarMesas(st); continue; }
      const p = ms[(k * 7) % ms.length]; const a = (k++ % 3) !== 2;
      C.registrarResultado(st, p.id, a ? 2 : 0, a ? 0 : 2); C.sortearVidas(st); C.asignarMesas(st);
    }
    assert.equal(st.fase, "final");
    assert.ok(peor <= 3, "diferencia de partidos " + peor);
    suma += peor; n++;
  }
  assert.ok(suma / n <= 2.2, "media " + (suma / n));
});
