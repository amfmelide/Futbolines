// Pruebas de estrés de Ciegos: cientos de torneos al azar de los 4 formatos, con la gente
// que llega tarde, se va, resultados corregidos y "deshacer", como una noche real en el bar.
// Comprueba que nunca se rompe y que siempre termina con un podio coherente.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../ciegos.js");

// generador de números al azar con semilla (para poder repetir un fallo)
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const elige = (r, xs) => xs[Math.floor(r() * xs.length)];
// errores esperables (la app los enseña como aviso y no cambia nada)
const ESPERADOS = /mesa|fase final|cuadro|sin jugar|8 en pie|Quedan 8|no se sabe|parejas|terminado|no está|Falta|ninguna pareja|todavía|Aún|no se puede|ya no se puede|dependen|ronda/i;

function invariantes(st, donde) {
  JSON.parse(JSON.stringify(st));                                       // se puede guardar
  // nadie juega en dos mesas a la vez y no hay dos partidos en la misma mesa
  const enMesa = st.partidos.filter(p => p.estado === "mesa");
  const ids = enMesa.flatMap(p => C.jugadoresDe(st, p.a).concat(C.jugadoresDe(st, p.b)));
  assert.equal(new Set(ids).size, ids.length, donde + ": un jugador en dos mesas");
  assert.equal(new Set(enMesa.map(p => p.mesa)).size, enMesa.length, donde + ": dos partidos en la misma mesa");
  if (st.modo === "vidas" || st.modo === "monster") {
    // nadie juega dos partidos de la misma ronda
    const visto = {};
    st.partidos.filter(p => p.fase === "ronda" && !p.bye).forEach(p => C.jugadoresDe(st, p.a).concat(C.jugadoresDe(st, p.b)).forEach(id => {
      const k = p.ronda + "|" + id; assert.ok(!visto[k], donde + ": un jugador en dos partidos de la ronda " + p.ronda); visto[k] = 1;
    }));
  }
  if (st.modo === "vidas" && st.fase === "juego") {
    assert.ok(C.vivos(st).length >= 8, donde + ": baja de 8 en pie (" + C.vivos(st).length + ")");
    const v = C.vidasDe(st);
    st.partidos.filter(p => p.fase === "ronda" && p.estado === "mesa").forEach(p => C.jugadoresDe(st, p.a).concat(C.jugadoresDe(st, p.b)).forEach(id => assert.ok(v[id] > 0, donde + ": juega en mesa uno sin vidas")));
  }
  const b = C.bote(st);
  assert.ok(Number.isFinite(b.total) && b.premios.every(p => Number.isFinite(p.euros)), donde + ": bote con NaN");
}

function jugarTorneo(modo, semilla) {
  const r = azar(semilla);
  const n = modo === "vidas" ? 8 + Math.floor(r() * 15) : modo === "monster" ? 4 + Math.floor(r() * 14) : 2 * (2 + Math.floor(r() * 8));
  const fijas = modo === "suizo" && r() < 0.4;
  const st = C.nuevoTorneo({ modo, semilla, config: { mesas: 1 + Math.floor(r() * 4), cuota: r() < 0.5 ? 5 : 0, parejas: fijas ? "fijas" : "sorteo",
    partidas: r() < 0.2 ? { tipo: "fijo", partidas: 3, goles: 7 } : { tipo: "al", partidas: 2, goles: 7 } } });
  if (fijas) for (let i = 0; i < n / 2; i++) C.añadirPareja(st, "A" + i, "B" + i);
  else for (let i = 0; i < n; i++) C.añadirJugador(st, "J" + i);
  st.jugadores.forEach(j => (j.pagado = r() < 0.8));
  C.empezar(st);
  if (st.modo === "vidas") C.sortearVidas(st);
  const historia = [];
  let tardes = 0, pasos = 0;
  const donde = () => `${modo} semilla ${semilla} paso ${pasos}`;
  while (st.fase !== "terminado") {
    if (++pasos > 3000) assert.fail(donde() + ": no termina (fase " + st.fase + ")");
    historia.push(JSON.stringify(st)); if (historia.length > 10) historia.shift();
    const x = r();
    try {
      if (x < 0.03 && tardes < 4) {                                     // llega alguien tarde
        tardes++; C.altaTarde(st, "T" + tardes, "U" + tardes);
      } else if (x < 0.06) {                                            // alguien se va
        const vivos = C.activos(st).filter(j => !j.retirado);
        if (vivos.length) C.retirar(st, elige(r, vivos).id);
      } else if (x < 0.09) {                                            // corregir un resultado ya puesto
        const hechos = st.partidos.filter(p => p.estado === "fin" && !p.bye && C.puedeEditar(st, p.id));
        if (hechos.length) { const p = elige(r, hechos); C.registrarGanador(st, p.id, p.ganador === "a" ? "b" : "a"); }
      } else if (x < 0.11) {                                            // borrar un resultado
        const hechos = st.partidos.filter(p => p.estado === "fin" && !p.bye && C.puedeEditar(st, p.id));
        if (hechos.length) C.borrarResultado(st, elige(r, hechos).id);
      } else if (x < 0.13 && historia.length > 1) {                     // deshacer (como el botón ↶)
        const viejo = JSON.parse(historia[historia.length - 2]);
        Object.keys(st).forEach(k => delete st[k]); Object.assign(st, viejo); historia.pop();
      } else {
        if (C.puedeSiguienteRonda(st)) C.siguienteRonda(st);
        C.asignarMesas(st);
        const m = st.partidos.filter(p => p.estado === "mesa");
        if (m.length) {
          const p = elige(r, m);
          if (C.usaMarcador(st) && r() < 0.7) { const ms = C.marcadoresPosibles(st); const [a, b] = elige(r, ms); C.registrarResultado(st, p.id, a, b); }
          else C.registrarGanador(st, p.id, r() < 0.5 ? "a" : "b");
        } else if (st.fase !== "terminado" && !C.puedeSiguienteRonda(st)) {
          // nada en mesa ni ronda nueva: tiene que haber algo pendiente que se pueda jugar
          const pend = C.pendientes(st).filter(p => p.estado === "pendiente");
          if (!pend.length && st.modo !== "vidas") assert.fail(donde() + ": atascado sin partidos (fase " + st.fase + ")");
        }
      }
      if (st.modo === "vidas" && st.fase === "juego") C.sortearVidas(st);
    } catch (e) {
      if (e.code === "ERR_ASSERTION") throw e;
      if (!ESPERADOS.test(e.message)) throw new Error(donde() + ": error inesperado: " + e.message + "\n" + e.stack);
    }
    invariantes(st, donde());
  }
  const pod = C.podio(st);
  assert.ok(pod.length >= 2, donde() + ": podio vacío");
  assert.equal(pod[0].pos, 1);
  pod.forEach(x => assert.ok(x.ids.length >= 1 && x.ids.every(id => C.jugador(st, id)), donde() + ": podio con jugadores que no existen"));
  if (st.modo === "vidas" || st.modo === "ciegos") assert.equal(new Set(pod.flatMap(x => x.ids)).size, pod.flatMap(x => x.ids).length, donde() + ": alguien repite en el podio");
  const pr = C.premiosPodio(st);
  Object.values(pr).forEach(v => assert.ok(Number.isFinite(v) && v >= 0, donde() + ": premio raro"));
  if (st.config.cuota) assert.ok(Object.values(pr).reduce((a, b) => a + b, 0) <= C.bote(st).total + 0.05, donde() + ": se reparte más que el bote");
  return st;
}

for (const modo of ["ciegos", "monster", "suizo", "vidas"]) {
  test(`estrés ${modo}: 150 torneos al azar con altas, bajas, correcciones y deshacer`, () => {
    for (let s = 1; s <= (Number(process.env.FUZZ_N) || 150); s++) jugarTorneo(modo, s * 7919 + modo.length);
  });
}
