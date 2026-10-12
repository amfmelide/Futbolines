// Ejecutar con: node --test zt4k9m/tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../engine.js");

function torneoCon(n, config) {
  const st = T.nuevoTorneo({ semilla: 42, config });
  for (let i = 1; i <= n; i++) T.añadirEquipo(st, { id: "e" + i, nombre: "Pareja " + i, ranking: i <= 8 ? i : null });
  return st;
}
const num = id => Number(id.slice(1));

// Marcador válido según el formato; gana el de id menor salvo que se pida "sorpresa"
function marcador(st, p, ganaA) {
  const f = T.formatoDe(st, p);
  if (f.tipo === "fijo") return ganaA ? [f.partidas, 0] : [0, f.partidas];
  const v = p.ventaja ? st.config.ventajaCruce : 0;
  return ganaA ? [f.partidas, 1] : [Math.max(v, 1), f.partidas];
}
function jugar(st, filtro, opciones) {
  opciones = opciones || {};
  const f = filtro || (() => true);
  const siguiente = () => st.partidos.find(x => x.estado === "mesa" && f(x)) || T.cola(st).find(f);
  let p, k = 0;
  for (;;) {
    while ((p = siguiente())) {
      let ganaA = num(p.a) < num(p.b);
      if (opciones.sorpresas && (k++ % 3 === 0)) ganaA = !ganaA;
      const [ra, rb] = marcador(st, p, ganaA);
      T.registrarResultado(st, p.id, ra, rb);
    }
    // sortear cruces cuando estén listos
    const pendiente = Object.keys(st.cuadros).find(c => { const e = T.estadoCruce(st, c); return e.aplica && e.listo && !e.sorteado; });
    if (!pendiente) break;
    T.sortearCruce(st, pendiente, 7);
  }
}

test("tamaños de grupo de 4 (con alguno de 5) y de 5", () => {
  assert.deepEqual(T.tamañosGrupos(16, 4), [4, 4, 4, 4]);
  assert.deepEqual(T.tamañosGrupos(18, 4), [5, 5, 4, 4]);
  assert.equal(T.tamañosGrupos(200, 4).length, 50);
  assert.deepEqual(T.tamañosGrupos(48, 5), [5, 5, 5, 5, 5, 5, 5, 5, 4, 4]);
  for (const n of [5, 7, 9, 13, 37, 101, 199]) {
    const t = T.tamañosGrupos(n, 4);
    assert.equal(t.reduce((a, b) => a + b, 0), n);
    assert.ok(t.every(x => x >= 3 && x <= 5), n + " → " + t);
  }
});

test("liguilla: todos contra todos una vez", () => {
  for (const n of [3, 4, 5]) {
    const ids = [...Array(n).keys()].map(i => "x" + i);
    const pares = T.liguilla(ids).flat().map(([a, b]) => [a, b].sort().join("-"));
    assert.equal(pares.length, (n * (n - 1)) / 2);
    assert.equal(new Set(pares).size, pares.length);
  }
});

test("sorteo: cabezas de serie en grupos distintos", () => {
  const st = torneoCon(32);
  T.sortearGrupos(st);
  assert.equal(st.grupos.length, 8);
  const grupoDe = {};
  st.grupos.forEach(g => g.equipos.forEach(id => (grupoDe[id] = g.id)));
  assert.equal(new Set(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"].map(id => grupoDe[id])).size, 8);
});

test("grupos a 2 partidas de 6 goles: empates y desempate por goles", () => {
  const st = torneoCon(4);
  st.config.numGrupos = 1;
  T.sortearGrupos(st);
  const ps = st.partidos;
  assert.throws(() => T.registrarResultado(st, ps[0].id, 2, 1), /2 partidas/);
  // todos empatan 1-1; los goles deciden
  const golesDe = { e1: 6, e2: 5, e3: 4, e4: 3 };
  ps.forEach(p => {
    const ga = golesDe[p.a], gb = golesDe[p.b];
    T.registrarResultado(st, p.id, null, null, { goles: [[6, gb - 1], [ga - 1, 6]] });
  });
  ps.forEach(p => assert.equal(p.ra + "-" + p.rb, "1-1"));
  const c = T.clasificacionGrupo(st, "A");
  assert.ok(c.every(r => r.pts === 3));
  assert.deepEqual(c.map(r => r.id), ["e1", "e2", "e3", "e4"]);
});

test("reparto: grupos de 4 → todos a Élite; grupos de 5 → 4 a Élite y el 5º a Oro", () => {
  const st = torneoCon(18);                 // 2 grupos de 5 + 2 de 4
  T.sortearGrupos(st);
  jugar(st);
  assert.equal(T.directosCategoria(st, "elite").length, 16);
  assert.equal(T.directosCategoria(st, "oro").length, 2);
});

test("doble K: cuadros de 8, 16, 32 y 256 acaban con 4 + 4, cruces y campeón", () => {
  for (const n of [5, 8, 12, 16, 23, 32, 200]) {
    const st = torneoCon(n, { categorias: [{ id: "elite", nombre: "Élite", posiciones: [1, 2, 3, 4, 5], formato: "doble" }] });
    T.sortearGrupos(st);
    jugar(st, p => p.tipo === "G");
    const meta = T.generarCuadro(st, "elite");
    assert.equal(meta.formato, n >= 5 ? "doble" : "simple");
    assert.equal(meta.cruce.perdedores.length, 4, "n=" + n);
    // antes de terminar ganadores/perdedores no se puede sortear
    assert.throws(() => T.sortearCruce(st, "elite"));
    jugar(st, p => p.llave === "W" || p.llave === "L", { sorpresas: true });
    const e = T.estadoCruce(st, "elite");
    assert.ok(e.listo, "n=" + n);
    assert.equal(e.ganadores.filter(Boolean).length, 4);
    // nadie está a la vez en ganadores y perdedores; los de perdedores han perdido exactamente 1 vez
    const vivosL = e.perdedores.filter(Boolean);
    vivosL.forEach(id => assert.ok(!e.ganadores.includes(id)));
    const derrotas = id => T.partidosCuadro(st, "elite").filter(p => p.estado === "fin" && !p.bye && p.perdedor === id).length;
    vivosL.forEach(id => assert.equal(derrotas(id), 1));
    e.ganadores.forEach(id => assert.equal(derrotas(id), 0));
    // quien pierde dos veces está fuera
    const fuera = st.equipos.map(x => x.id).filter(id => derrotas(id) >= 2);
    fuera.forEach(id => assert.ok(!T.cola(st).some(p => p.a === id || p.b === id)));
    T.sortearCruce(st, "elite", 3);
    const cruces = T.partidosCuadro(st, "elite").filter(p => p.llave === "X");
    cruces.forEach(p => { assert.ok(e.ganadores.includes(p.a)); assert.equal(p.ventaja, "a"); });
    jugar(st);
    assert.ok(T.campeon(st, "elite"), "n=" + n);
    assert.equal(st.fase, "terminado");
  }
});

test("cruce: el de ganadores empieza 1-0 y se juega a 3", () => {
  const st = torneoCon(16, { categorias: [{ id: "elite", nombre: "Élite", posiciones: [1, 2, 3, 4], formato: "doble" }] });
  T.sortearGrupos(st);
  jugar(st, p => p.tipo === "G");
  T.generarCuadro(st, "elite");
  jugar(st, p => p.llave === "W" || p.llave === "L");
  T.sortearCruce(st, "elite", 1);
  const x = T.partido(st, "K:elite:X:1:1");
  assert.throws(() => T.registrarResultado(st, x.id, 0, 3), /ventaja/);
  assert.throws(() => T.registrarResultado(st, x.id, 2, 2));
  // con goles partida a partida: el de ganadores ya tiene 1, gana 2 más
  T.registrarResultado(st, x.id, null, null, { goles: [[7, 5], [4, 7], [7, 6]] });
  assert.equal(x.ra + "-" + x.rb, "3-1");
  assert.equal(x.ganador, x.a);
  // no se puede deshacer la última ronda de perdedores una vez sorteados los cruces
  const ultL = T.partidosCuadro(st, "elite").filter(p => p.llave === "L" && !p.bye).pop();
  assert.equal(T.puedeDeshacer(st, ultL.id), false);
});

test("formato de partidas por categoría: Élite a 3 de 7 goles, Oro a 3 de 5", () => {
  const st = torneoCon(18);                 // grupos de 5 → hay Oro
  T.sortearGrupos(st);
  jugar(st, p => p.tipo === "G");
  T.generarCuadro(st, "elite");
  T.generarCuadro(st, "oro");
  const e = T.partidosCuadro(st, "elite").find(p => !p.bye), o = T.partidosCuadro(st, "oro").find(p => !p.bye);
  assert.equal(T.formatoDe(st, e).goles, 7);
  assert.equal(T.formatoDe(st, o).goles, 5);
  assert.equal(T.formatoDe(st, o).partidas, 3);
  assert.throws(() => T.registrarResultado(st, e.id, 2, 1), /3 partidas/);
  T.registrarResultado(st, e.id, 3, 2);
});

test("dos divisiones (Élite/Oro y Plata/Bronce): grupos separados y mesas compartidas", () => {
  const st = T.nuevoTorneo({ semilla: 5, config: { mesas: 6 } });
  for (let i = 1; i <= 20; i++) T.añadirEquipo(st, { id: "e" + i, nombre: "A" + i, division: "d1" });
  for (let i = 21; i <= 38; i++) T.añadirEquipo(st, { id: "e" + i, nombre: "B" + i, division: "d2" });
  T.sortearGrupos(st);
  const d1 = st.grupos.filter(g => g.division === "d1"), d2 = st.grupos.filter(g => g.division === "d2");
  assert.equal(d1.length, 5); assert.equal(d2.length, 4);
  d1.forEach(g => g.equipos.forEach(id => assert.ok(num(id) <= 20)));
  d2.forEach(g => g.equipos.forEach(id => assert.ok(num(id) > 20)));
  assert.equal(new Set(st.grupos.map(g => g.id)).size, 9);   // letras sin repetir
  const llamados = T.asignarMesas(st);
  assert.equal(llamados.length, 6);
  jugar(st);
  assert.equal(T.directosCategoria(st, "elite").length, 20);
  assert.equal(T.directosCategoria(st, "oro").length, 0);
  assert.equal(T.directosCategoria(st, "plata").length, 16);   // 2 grupos de 5 + 2 de 4
  assert.equal(T.directosCategoria(st, "bronce").length, 2);
  T.directosCategoria(st, "plata").forEach(x => assert.ok(num(x.id) > 20));
  for (const c of ["elite", "plata", "bronce"]) T.generarCuadro(st, c);
  jugar(st, null, { sorpresas: true });
  for (const c of ["elite", "plata", "bronce"]) assert.ok(T.campeon(st, c), c);
  assert.equal(st.fase, "terminado");
});

test("deshacer y W.O. en doble K", () => {
  const st = torneoCon(16);
  T.sortearGrupos(st);
  jugar(st, p => p.tipo === "G");
  T.generarCuadro(st, "elite");
  const w1 = T.partido(st, "K:elite:W:1:1");
  T.registrarResultado(st, w1.id, 0, 0, { wo: "b" });
  assert.equal(w1.ganador, w1.a);
  const l1 = T.partido(st, "K:elite:L:1:1");
  assert.equal(l1.a, w1.b);                     // el perdedor baja a perdedores
  T.deshacerResultado(st, w1.id);
  assert.equal(T.partido(st, "K:elite:L:1:1").a, null);
});

test("200 parejas: 50 grupos, Élite de 200 en doble K, Oro vacío", () => {
  const st = torneoCon(200, { mesas: 20 });
  T.sortearGrupos(st);
  assert.equal(st.grupos.length, 50);
  const llamados = T.asignarMesas(st);
  assert.equal(llamados.length, 20);
  const ids = llamados.flatMap(p => [p.a, p.b]);
  assert.equal(new Set(ids).size, ids.length);
  jugar(st);
  assert.equal(T.estadoCategoria(st, "oro").listo, false);
  const meta = T.generarCuadro(st, "elite");
  assert.equal(meta.tam, 256);
  jugar(st, null, { sorpresas: true });
  assert.ok(T.campeon(st, "elite"));
  assert.equal(st.fase, "terminado");
});

test("cuadro simple con caída (opcional)", () => {
  const st = torneoCon(40, {
    caida: true,
    categorias: [
      { id: "c1", nombre: "Primera", posiciones: [1, 2], formato: "simple" },
      { id: "c2", nombre: "Segunda", posiciones: [3, 4, 5], formato: "simple" }
    ]
  });
  T.sortearGrupos(st);
  jugar(st, p => p.tipo === "G");
  assert.equal(T.estadoCategoria(st, "c2").listo, false);
  T.generarCuadro(st, "c1");
  jugar(st, p => p.cat === "c1" && p.ronda <= 2);
  const e2 = T.estadoCategoria(st, "c2");
  assert.ok(e2.listo, e2.motivo);
  assert.ok(e2.caidos.length > 0);
  T.generarCuadro(st, "c2");
  jugar(st);
  assert.equal(T.campeon(st, "c1"), "e1");
  assert.ok(T.campeon(st, "c2"));
});

/* ------------------------- MODO POR NIVELES ------------------------- */
function torneoNiveles(n, formatos, niveles) {
  const cats = [
    { id: "elite", nombre: "Élite", division: "d1", posiciones: [1, 2, 3, 4], formato: formatos[0], partidas: { tipo: "al", partidas: 3, goles: 7 } },
    { id: "oro", nombre: "Oro", division: "d1", posiciones: [], formato: formatos[1], partidas: { tipo: "al", partidas: 3, goles: 5 } },
    { id: "plata", nombre: "Plata", division: "d1", posiciones: [], formato: formatos[2], partidas: { tipo: "al", partidas: 3, goles: 5 } }
  ];
  const st = T.nuevoTorneo({ semilla: 11, config: { tamGrupo: 5, divisiones: [{ id: "d1", nombre: "Open", modo: "niveles" }], categorias: cats } });
  for (let i = 1; i <= n; i++) T.añadirEquipo(st, { id: "e" + i, nombre: "P" + i, nivel: niveles(i) });
  return st;
}
const nivelDe = i => (i % 3 === 1 ? "elite" : i % 3 === 2 ? "oro" : "plata");

// Juega todo lo que haya; ganan los de id menor salvo "sorpresas"
function jugarTodo(st, sorpresas) {
  let k = 0;
  for (let vuelta = 0; vuelta < 5000; vuelta++) {
    const p = T.cola(st)[0];
    if (p) {
      let ganaA = num(p.a) < num(p.b);
      if (sorpresas && k++ % 3 === 0) ganaA = !ganaA;
      const [ra, rb] = marcador(st, p, ganaA);
      T.registrarResultado(st, p.id, ra, rb);
      continue;
    }
    const c = ["elite", "oro", "plata"].find(c => { const e = T.estadoCruce(st, c); return e.aplica && e.listo && !e.sorteado; });
    if (!c) return;
    T.sortearCruce(st, c, 3);
  }
  throw new Error("bucle");
}

test("niveles: el 5º baja según su nivel y quien pierde en ganadores baja o va a perdedores", () => {
  const st = torneoNiveles(40, ["doble", "doble", "simple"], nivelDe);
  T.sortearGrupos(st);
  jugar(st, p => p.tipo === "G");
  assert.ok(T.estadoCategoria(st, "elite").listo);
  assert.equal(T.estadoCategoria(st, "oro").listo, false);
  T.generarCuadro(st, "elite");
  const F0 = T.flujoNiveles(st, "d1");
  const quintos = F0.rank.filter(r => r.pos === 5).map(r => r.id);
  assert.equal(quintos.length, 8);
  quintos.forEach(id => {
    const e = T.equipo(st, id);
    if (e.nivel === "elite") assert.ok(F0.pools[0].L.set.has(id), "5º élite → perdedores de Élite");
    else assert.ok(F0.pools[1].W.set.has(id), "5º oro/plata → Oro");
  });
  jugarTodo(st, true);
  const F = T.flujoNiveles(st, "d1");
  // nadie de nivel inferior juega en perdedores de Élite; ningún élite baja a Oro
  F.pools[0].L.miembros.forEach(id => assert.equal(T.equipo(st, id).nivel, "elite"));
  F.pools[1].W.miembros.forEach(id => assert.notEqual(T.equipo(st, id).nivel, "elite"));
  F.pools[1].L.miembros.forEach(id => assert.equal(T.equipo(st, id).nivel, "oro"));
  F.pools[2].W.miembros.forEach(id => assert.equal(T.equipo(st, id).nivel, "plata"));
  // quien pierde en perdedores no vuelve a jugar
  st.partidos.filter(p => p.llave === "L" && p.estado === "fin").forEach(p => {
    const despues = st.partidos.slice(st.partidos.indexOf(p) + 1).filter(x => x.tipo === "K" && x.cat === p.cat && (x.a === p.perdedor || x.b === p.perdedor));
    assert.equal(despues.length, 0);
  });
  for (const c of ["elite", "oro", "plata"]) assert.ok(T.campeon(st, c), c);
  assert.ok(T.partidosCuadro(st, "elite").some(p => p.llave === "X"), "Élite con cruces");
  assert.ok(T.partidosCuadro(st, "oro").some(p => p.llave === "X"), "Oro con cruces");
  assert.ok(!T.partidosCuadro(st, "plata").some(p => p.llave === "X"), "Plata simple: sin cruces");
  assert.equal(st.fase, "terminado");
});

test("niveles: Oro sin doble K → los de nivel oro que pierden quedan fuera; los de plata bajan", () => {
  const st = torneoNiveles(40, ["doble", "simple", "simple"], nivelDe);
  T.sortearGrupos(st);
  jugar(st, p => p.tipo === "G");
  T.generarCuadro(st, "elite");
  jugarTodo(st, true);
  const F = T.flujoNiveles(st, "d1");
  assert.equal(F.pools[1].L.miembros.length, 0);
  F.pools[2].W.miembros.forEach(id => assert.equal(T.equipo(st, id).nivel, "plata"));
  for (const c of ["elite", "oro", "plata"]) assert.ok(T.campeon(st, c), c);
});

test("niveles: doble K sin nadie en perdedores → directo a la final sin sorteo", () => {
  // nadie es de nivel Élite: todos los que pierden en Élite bajan a Oro
  const st = torneoNiveles(20, ["doble", "doble", "simple"], i => (i % 2 ? "oro" : "plata"));
  T.sortearGrupos(st);
  jugar(st, p => p.tipo === "G");
  T.generarCuadro(st, "elite");
  jugarTodo(st, false);
  assert.ok(!T.partidosCuadro(st, "elite").some(p => p.llave === "X" || p.llave === "L"));
  assert.ok(T.partidosCuadro(st, "elite").some(p => p.etiqueta === "Final"));
  assert.equal(T.campeon(st, "elite"), "e1");
  assert.ok(T.campeon(st, "oro"));
  assert.ok(T.campeon(st, "plata"));
});

test("niveles: 200 parejas, corregir un resultado borra lo generado después", () => {
  const st = torneoNiveles(200, ["doble", "doble", "doble"], nivelDe);
  st.config.mesas = 30;
  T.sortearGrupos(st);
  assert.equal(st.grupos.length, 40);
  jugar(st, p => p.tipo === "G");
  T.generarCuadro(st, "elite");
  // primera ronda de Élite: 160 → 128
  const r1 = T.partidosCuadro(st, "elite").filter(p => p.llave === "W" && p.ronda === 1);
  assert.equal(r1.length, 32);
  r1.forEach(p => T.registrarResultado(st, p.id, 3, 1));
  const ultimo = r1[r1.length - 1];
  const antes = st.partidos.length;
  assert.ok(st.partidos.length > antes - 1);
  // cambiar el ganador del último partido: se rehacen las rondas que dependían de él
  assert.ok(T.puedeDeshacer(st, ultimo.id));
  T.registrarResultado(st, ultimo.id, 1, 3);
  assert.equal(ultimo.ganador, ultimo.b);
  const F = T.flujoNiveles(st, "d1");
  assert.ok(F.pools[0].W.vivos.includes(ultimo.b));
  assert.ok(!F.pools[0].W.vivos.includes(ultimo.a));
  jugarTodo(st, true);
  for (const c of ["elite", "oro", "plata"]) assert.ok(T.campeon(st, c), c);
  assert.equal(st.fase, "terminado");
});
