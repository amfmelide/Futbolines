// Ejecutar con: node --test torneos/tests
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../engine.js");

function torneoCon(n, config) {
  const st = T.nuevoTorneo({ semilla: 42, config });
  for (let i = 1; i <= n; i++) T.añadirEquipo(st, { id: "e" + i, nombre: "Pareja " + i, ranking: i <= 8 ? i : null });
  return st;
}
// Resultado determinista: gana el de id menor (más "fuerte")
function jugar(st, filtro) {
  let p;
  const f = filtro || (() => true);
  const siguiente = () => st.partidos.find(x => x.estado === "mesa" && f(x)) || T.cola(st).find(f);
  while ((p = siguiente())) {
    const na = Number(p.a.slice(1)), nb = Number(p.b.slice(1));
    T.registrarResultado(st, p.id, na < nb ? 2 : 1, na < nb ? 1 : 2);
  }
}

test("tamaños de grupo de 4 (con alguno de 5) y de 5", () => {
  assert.deepEqual(T.tamañosGrupos(16, 4), [4, 4, 4, 4]);
  assert.deepEqual(T.tamañosGrupos(18, 4), [5, 5, 4, 4]);
  assert.deepEqual(T.tamañosGrupos(200, 4).length, 50);
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
  const gs = new Set(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"].map(id => grupoDe[id]));
  assert.equal(gs.size, 8);
  assert.equal(st.partidos.filter(p => p.tipo === "G").length, 8 * 6);
});

test("clasificación con desempate por enfrentamiento directo", () => {
  const st = torneoCon(3);
  st.config.tamGrupo = 3;
  T.sortearGrupos(st);
  const ps = st.partidos;
  // triple empate a 3 puntos imposible con 3 equipos y 1 partido cada uno → forzamos 2 empatados
  const res = { "e1-e2": [2, 0], "e1-e3": [0, 2], "e2-e3": [2, 1] };
  ps.forEach(p => {
    const k = [p.a, p.b].sort().join("-"), [x, y] = res[k];
    const aPrimero = [p.a, p.b].sort()[0] === p.a;
    T.registrarResultado(st, p.id, aPrimero ? x : y, aPrimero ? y : x);
  });
  const c = T.clasificacionGrupo(st, "A");
  assert.equal(c.length, 3);
  // los tres tienen 3 puntos; mini-liga igual → diferencia: e1 +0, e2 -1, e3 +1
  assert.deepEqual(c.map(r => r.id), ["e3", "e1", "e2"]);
});

test("flujo completo con 3 categorías y caída", () => {
  const st = torneoCon(40);
  T.sortearGrupos(st);
  assert.equal(st.grupos.length, 10);
  assert.throws(() => T.generarCuadro(st, "c1"), /grupos/);
  jugar(st);
  assert.ok(T.gruposTerminados(st));

  // Primera: 20 parejas (1º y 2º) → cuadro de 32 con 12 byes
  const e1 = T.estadoCategoria(st, "c1");
  assert.ok(e1.listo);
  assert.equal(e1.directos.length, 20);
  const c1 = T.generarCuadro(st, "c1");
  assert.equal(c1.tam, 32);
  // Segunda espera a los caídos de Primera, y Tercera a los de Segunda
  assert.equal(T.estadoCategoria(st, "c2").listo, false);
  assert.equal(T.estadoCategoria(st, "c3").listo, false);
  // ningún cruce de 1ª ronda entre parejas del mismo grupo
  const grupoDe = {};
  st.grupos.forEach(g => g.equipos.forEach(id => (grupoDe[id] = g.id)));
  T.partidosCuadro(st, "c1").filter(p => p.ronda === 1 && !p.bye).forEach(p => assert.notEqual(grupoDe[p.a], grupoDe[p.b]));

  // jugar sólo la ronda 1 y 2 de Primera → todos han jugado su primer partido
  jugar(st, p => p.cat === "c1" && p.ronda <= 2);
  const e2 = T.estadoCategoria(st, "c2");
  assert.ok(e2.listo, e2.motivo);
  // 20 equipos: 8 juegan R1 (4 caen), 12 byes + 4 ganadores juegan R2 → 8 partidos; caen los 6 con bye que pierden
  // (los ganadores de R1 que pierden en R2 ya habían jugado, no caen)
  assert.ok(e2.caidos.length > 0);
  assert.equal(e2.directos.length, 10);
  const c2 = T.generarCuadro(st, "c2");
  assert.equal(c2.siembra.length, e2.caidos.length + 10);
  assert.deepEqual(c2.siembra.slice(0, e2.caidos.length), e2.caidos.map(x => x.id));

  assert.match(T.estadoCategoria(st, "c3").motivo, /Segunda/);
  jugar(st);                       // termina Primera y Segunda
  const e3 = T.estadoCategoria(st, "c3");
  assert.ok(e3.listo, e3.motivo);
  T.generarCuadro(st, "c3");
  jugar(st);
  for (const c of ["c1", "c2", "c3"]) assert.ok(T.campeon(st, c));
  assert.equal(T.campeon(st, "c1"), "e1");
  assert.equal(st.fase, "terminado");
});

test("200 parejas en grupos de 4 y 4 categorías", () => {
  const st = torneoCon(200, {
    categorias: [
      { id: "c1", nombre: "Primera", posiciones: [1] },
      { id: "c2", nombre: "Segunda", posiciones: [2] },
      { id: "c3", nombre: "Tercera", posiciones: [3] },
      { id: "c4", nombre: "Cuarta", posiciones: [4, 5] }
    ], caida: false, mesas: 20
  });
  T.sortearGrupos(st);
  assert.equal(st.grupos.length, 50);
  // reparto de mesas sin parejas repetidas
  const llamados = T.asignarMesas(st);
  assert.equal(llamados.length, 20);
  const ids = llamados.flatMap(p => [p.a, p.b]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(T.mesasLibres(st).length, 0);
  jugar(st);
  for (const c of ["c1", "c2", "c3", "c4"]) T.generarCuadro(st, c);
  assert.equal(st.cuadros.c1.tam, 64);
  jugar(st);
  assert.equal(st.fase, "terminado");
});

test("resultados: no se puede deshacer si el siguiente ya se jugó", () => {
  const st = torneoCon(8, { categorias: [{ id: "c1", nombre: "Única", posiciones: [1, 2, 3, 4] }], caida: false });
  st.config.tamGrupo = 8; st.config.numGrupos = 1;
  T.sortearGrupos(st);
  jugar(st);
  T.generarCuadro(st, "c1");
  const r1 = T.partidosCuadro(st, "c1").filter(p => p.ronda === 1);
  r1.forEach(p => T.registrarResultado(st, p.id, 2, 0));
  const semi = T.partido(st, "K:c1:2:1");
  assert.ok(semi.a && semi.b);
  T.registrarResultado(st, semi.id, 2, 1);
  assert.throws(() => T.deshacerResultado(st, r1[0].id));
  T.deshacerResultado(st, semi.id);
  T.deshacerResultado(st, r1[0].id);
  assert.equal(T.partido(st, "K:c1:2:1").a, null);
  assert.throws(() => T.registrarResultado(st, semi.id, 1, 1));
});

test("W.O. y tercer puesto", () => {
  const st = torneoCon(4, { categorias: [{ id: "c1", nombre: "Única", posiciones: [1, 2, 3, 4] }], caida: false, tercerPuesto: true });
  st.config.numGrupos = 1;
  T.sortearGrupos(st);
  jugar(st);
  T.generarCuadro(st, "c1");
  const [s1, s2] = T.partidosCuadro(st, "c1").filter(p => p.ronda === 1);
  T.registrarResultado(st, s1.id, 0, 0, { wo: "b" });
  assert.equal(s1.ganador, s1.a);
  assert.equal(s1.ra, 2);
  T.registrarResultado(st, s2.id, 1, 2);
  const tp = T.partido(st, "K:c1:3P");
  assert.ok(tp.a && tp.b);
});
