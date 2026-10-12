/* =====================================================================
   MOTOR DE TORNEOS · AMF Melide
   ---------------------------------------------------------------------
   Lógica pura (sin DOM ni red). Funciona en el navegador
   (window.TorneoEngine) y en Node (require) para los tests.

   Formato por defecto (el de los torneos de futbolín de Melide):
   1. Grupos de 4 (o de 5), todos contra todos, a 2 partidas de 6 goles.
   2. Grupos de 4 → los 4 a ÉLITE. Grupos de 5 → 4 a ÉLITE y el 5º a ORO.
   3. ÉLITE en "doble K": quien pierde en el cuadro de GANADORES baja al de
      PERDEDORES; quien pierde en perdedores queda eliminado. Ambos cuadros
      avanzan hasta que quedan 4 y 4.
   4. CRUCES: sorteo que empareja cada ganador con un perdedor. Eliminatoria
      a 3 partidas ganadas y el de ganadores empieza 1-0.
   5. Semifinales y final.
   Las eliminatorias son a 3 partidas ganadas de 7 goles (la primera ronda
   de 5 goles). Todo es configurable.

   Ideas tomadas de proyectos libres de GitHub:
   - brackets-manager.js (Drarig29): partidos enlazados por "fuentes"
     (ganador/perdedor de otro partido), byes para los cabezas de serie,
     orden de siembra estándar y cuadro de perdedores del doble K.
   - tournament / groupstage (clux): reparto en serpiente y liguillas por
     el método del círculo.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TorneoEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- utilidades ---------- */
  function rng(seed) {                         // mulberry32: sorteos reproducibles
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function barajar(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function uid(prefijo) {
    return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function letraGrupo(i) {                     // A..Z, AA, AB…
    let s = "";
    i++;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function potencia2(n) { let p = 1; while (p < n) p *= 2; return p; }

  /* ---------- estado inicial ---------- */
  function configPorDefecto() {
    return {
      tamGrupo: 4,                            // 4 → grupos de 4 (y alguno de 5); 5 → de 5 (y alguno de 4)
      numGrupos: 0,                           // 0 = automático
      puntos: { victoria: 2, empate: 1, derrota: 0 },   // = 1 punto por partida ganada
      // tipo "fijo": se juegan siempre N partidas (puede haber empate)
      // tipo "al":   gana quien llega antes a N partidas
      // Cada categoría lleva su propio formato de eliminatoria ("partidas").
      formatos: {
        grupos: { tipo: "fijo", partidas: 2, goles: 6 },
        eliminatoria: { tipo: "al", partidas: 3, goles: 7 }     // si una categoría no dice nada
      },
      ventajaCruce: 1,                        // partidas con las que empieza el de ganadores en los cruces
      mesas: 8,
      mesasOff: [],
      caida: false,                           // (cuadros simples) quien pierde su 1er partido baja a la categoría siguiente
      tercerPuesto: false,
      inscripcionAbierta: true,
      maxEquipos: 200,
      // Divisiones: torneos independientes dentro del mismo evento (sus propios grupos y
      // categorías) que comparten las mesas. Ej.: Élite/Oro por un lado y Plata/Bronce por otro.
      divisiones: [{ id: "d1", nombre: "Élite / Oro" }, { id: "d2", nombre: "Plata / Bronce" }],
      categorias: [
        { id: "elite", nombre: "Élite", division: "d1", posiciones: [1, 2, 3, 4], formato: "doble", partidas: { tipo: "al", partidas: 3, goles: 7 } },
        { id: "oro", nombre: "Oro", division: "d1", posiciones: [5], formato: "simple", partidas: { tipo: "al", partidas: 3, goles: 5 } },
        { id: "plata", nombre: "Plata", division: "d2", posiciones: [1, 2, 3, 4], formato: "doble", partidas: { tipo: "al", partidas: 3, goles: 7 } },
        { id: "bronce", nombre: "Bronce", division: "d2", posiciones: [5], formato: "simple", partidas: { tipo: "al", partidas: 3, goles: 5 } }
      ]
    };
  }

  function divisiones(st) {
    const d = st.config.divisiones;
    return d && d.length ? d : [{ id: "d1", nombre: "" }];
  }
  function divisionDe(st, e) {
    const ds = divisiones(st);
    return e && ds.some(d => d.id === e.division) ? e.division : ds[0].id;
  }

  function nuevoTorneo(opts) {
    opts = opts || {};
    const config = Object.assign(configPorDefecto(), opts.config || {});
    return {
      formato: 2,
      version: 0,
      codigo: opts.codigo || "torneo",
      nombre: opts.nombre || "Torneo",
      fecha: opts.fecha || "",
      lugar: opts.lugar || "",
      fase: "inscripcion",                   // inscripcion | grupos | eliminatorias | terminado
      config,
      equipos: [],                            // {id, nombre, j1, j2, ranking, baja, presente}
      grupos: [],                             // {id, equipos:[ids]}
      partidos: [],
      cuadros: {},                            // catId → {formato, tam, siembra, origen, finalId, cruce…}
      semilla: opts.semilla || Math.floor(Math.random() * 1e9),
      log: []
    };
  }

  function equipo(st, id) { return st.equipos.find(e => e.id === id) || null; }
  function partido(st, id) { return st.partidos.find(p => p.id === id) || null; }
  function equiposActivos(st) { return st.equipos.filter(e => !e.baja); }
  function categoria(st, id) { return st.config.categorias.find(c => c.id === id) || null; }

  function añadirEquipo(st, datos) {
    const e = {
      id: datos.id || uid("e"),
      nombre: (datos.nombre || "").trim() || ((datos.j1 || "?") + " / " + (datos.j2 || "?")),
      j1: (datos.j1 || "").trim(),
      j2: (datos.j2 || "").trim(),
      ranking: datos.ranking ? Number(datos.ranking) : null,
      division: datos.division || null,
      nivel: datos.nivel || null,             // modo por niveles: id de la categoría de la pareja
      baja: false,
      presente: false,
      alta: datos.alta || Date.now()
    };
    st.equipos.push(e);
    return e;
  }

  /* ---------- formato de las partidas ---------- */
  function formatoDe(st, p) {
    const f = st.config.formatos;
    if (p.tipo === "G") return f.grupos;
    const cat = categoria(st, p.cat);
    return (cat && cat.partidas) || f.eliminatoria;
  }
  function textoFormato(f) {
    if (!f) return "";
    return f.tipo === "fijo" ? `${f.partidas} partidas a ${f.goles} goles` : `a ${f.partidas} partidas de ${f.goles} goles`;
  }
  function admiteEmpate(st, p) {
    const f = formatoDe(st, p);
    return p.tipo === "G" && f.tipo === "fijo" && f.partidas % 2 === 0;
  }

  /* ---------- fase de grupos ---------- */

  // Tamaños de los grupos. tam=4 → casi todos de 4 y los sobrantes forman grupos de 5.
  // tam=5 → casi todos de 5 y los que faltan dejan grupos de 4.
  function tamañosGrupos(n, tam, numGrupos) {
    if (n < 2) return n ? [n] : [];
    let g;
    if (numGrupos > 0) g = numGrupos;
    else if (tam <= 4) { g = Math.floor(n / tam); if (g < 1) g = 1; if (n - g * tam > g) g = Math.ceil(n / (tam + 1)); }
    else { g = Math.ceil(n / tam); }
    g = Math.max(1, Math.min(g, Math.floor(n / 2)));
    const base = Math.floor(n / g), extra = n % g;
    const out = [];
    for (let i = 0; i < g; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  // Liguilla todos contra todos (método del círculo); devuelve jornadas.
  function liguilla(ids) {
    const lista = ids.slice();
    if (lista.length % 2) lista.push(null);
    const n = lista.length, jornadas = [];
    let rot = lista.slice();
    for (let r = 0; r < n - 1; r++) {
      const j = [];
      for (let i = 0; i < n / 2; i++) {
        const a = rot[i], b = rot[n - 1 - i];
        if (a !== null && b !== null) j.push(r % 2 ? [b, a] : [a, b]);
      }
      jornadas.push(j);
      rot = [rot[0]].concat([rot[n - 1]], rot.slice(1, n - 1));
    }
    return jornadas;
  }

  // Sorteo por división: cabezas de serie (ranking) en serpiente; el resto al azar.
  function sortearGrupos(st, opciones) {
    opciones = opciones || {};
    const activos = equiposActivos(st);
    if (activos.length < 2) throw new Error("Hacen falta al menos 2 parejas");
    const rand = rng(opciones.semilla != null ? opciones.semilla : st.semilla);
    const grupos = [];
    for (const div of divisiones(st)) {
      const suyos = activos.filter(e => divisionDe(st, e) === div.id);
      if (!suyos.length) continue;
      if (suyos.length < 2) throw new Error(`En ${div.nombre || "la división"} hay una sola pareja`);
      const conRank = suyos.filter(e => e.ranking).sort((a, b) => a.ranking - b.ranking);
      const orden = conRank.concat(barajar(suyos.filter(e => !e.ranking), rand));
      const tams = tamañosGrupos(orden.length, st.config.tamGrupo, divisiones(st).length > 1 ? 0 : st.config.numGrupos);
      const g = tams.length, base = grupos.length;
      const nuevos = tams.map((t, i) => ({ id: letraGrupo(base + i), division: div.id, equipos: [] }));
      let idx = 0, fila = 0;
      while (idx < orden.length) {
        const seq = [...Array(g).keys()];
        if (fila % 2) seq.reverse();
        for (const k of seq) {
          if (idx >= orden.length) break;
          if (nuevos[k].equipos.length < tams[k]) nuevos[k].equipos.push(orden[idx++].id);
        }
        fila++;
      }
      grupos.push(...nuevos);
    }
    st.grupos = grupos;
    st.partidos = st.partidos.filter(p => p.tipo !== "G");
    grupos.forEach((gr, gi) => {
      liguilla(gr.equipos).forEach((jor, r) => {
        jor.forEach(([a, b], m) => {
          st.partidos.push(nuevoPartido({ id: `G:${gr.id}:${r + 1}:${m + 1}`, tipo: "G", grupo: gr.id, gi, ronda: r + 1, n: m + 1, a, b }));
        });
      });
    });
    st.fase = "grupos";
    st.config.inscripcionAbierta = false;
    return st;
  }

  function nuevoPartido(p) {
    return Object.assign({ ra: null, rb: null, goles: null, wo: null, estado: "pendiente", mesa: null, llamado: null, avisos: 0, fin: null, ganador: null, perdedor: null }, p);
  }

  function golesDe(p) {
    let a = 0, b = 0;
    (p.goles || []).forEach(([x, y]) => { a += x; b += y; });
    return [a, b];
  }

  function clasificacionGrupo(st, grupoId) {
    const gr = st.grupos.find(g => g.id === grupoId);
    if (!gr) return [];
    const P = st.config.puntos;
    const ps = st.partidos.filter(p => p.tipo === "G" && p.grupo === grupoId);
    const fila = id => ({ id, pj: 0, g: 0, e: 0, p: 0, pf: 0, pc: 0, dif: 0, gf: 0, gc: 0, gd: 0, pts: 0, pos: 0, orden: gr.equipos.indexOf(id) });
    const tabla = {};
    gr.equipos.forEach(id => (tabla[id] = fila(id)));
    const sumar = (t, p) => {
      const [ga, gb] = golesDe(p);
      for (const lado of ["a", "b"]) {
        const r = t[p[lado]];
        if (!r) continue;
        const mio = lado === "a" ? p.ra : p.rb, suyo = lado === "a" ? p.rb : p.ra;
        r.pj++; r.pf += mio; r.pc += suyo; r.dif = r.pf - r.pc;
        r.gf += lado === "a" ? ga : gb; r.gc += lado === "a" ? gb : ga; r.gd = r.gf - r.gc;
        if (mio > suyo) { r.g++; r.pts += P.victoria; } else if (mio === suyo) { r.e++; r.pts += P.empate; } else { r.p++; r.pts += P.derrota; }
      }
    };
    const jugados = ps.filter(p => p.estado === "fin");
    jugados.forEach(p => sumar(tabla, p));
    const filas = Object.values(tabla).filter(r => !(equipo(st, r.id) || {}).baja || r.pj);
    filas.sort((x, y) => y.pts - x.pts);
    // desempate: enfrentamiento directo entre los empatados, luego diferencia de partidas, de goles, goles a favor y sorteo
    const out = [];
    for (let i = 0; i < filas.length;) {
      let j = i;
      while (j < filas.length && filas[j].pts === filas[i].pts) j++;
      const empatados = filas.slice(i, j);
      if (empatados.length > 1) {
        const ids = new Set(empatados.map(r => r.id));
        const mini = {};
        empatados.forEach(r => (mini[r.id] = fila(r.id)));
        jugados.filter(p => ids.has(p.a) && ids.has(p.b)).forEach(p => sumar(mini, p));
        empatados.sort((x, y) =>
          mini[y.id].pts - mini[x.id].pts || mini[y.id].dif - mini[x.id].dif || mini[y.id].gd - mini[x.id].gd ||
          y.dif - x.dif || y.gd - x.gd || y.gf - x.gf || x.orden - y.orden);
      }
      out.push(...empatados);
      i = j;
    }
    out.forEach((r, k) => (r.pos = k + 1));
    return out;
  }

  function grupoTerminado(st, grupoId) {
    return st.partidos.filter(p => p.tipo === "G" && p.grupo === grupoId).every(p => p.estado === "fin");
  }
  function gruposTerminados(st) {
    return st.grupos.length > 0 && st.partidos.filter(p => p.tipo === "G").every(p => p.estado === "fin");
  }

  /* ---------- categorías ---------- */

  function rondaNombre(tam, r) {
    const quedan = tam / Math.pow(2, r - 1);
    return { 2: "Final", 4: "Semifinales", 8: "Cuartos", 16: "Octavos", 32: "Dieciseisavos", 64: "Treintaidosavos" }[quedan] || ("Ronda de " + quedan);
  }

  function ordenSiembra(tam) {                       // [1, 16, 8, 9, 4, 13, …]
    let o = [1];
    while (o.length < tam) {
      const n = o.length * 2 + 1, sig = [];
      o.forEach(x => sig.push(x, n - x));
      o = sig;
    }
    return o;
  }

  function idxCategoria(st, catId) { return st.config.categorias.findIndex(c => c.id === catId); }

  // Equipos que llegan a una categoría directamente desde los grupos, ya ordenados como cabezas de serie.
  // Todas las parejas de una división ordenadas como cabezas de serie (posición en el grupo y, a igual posición, rendimiento).
  function rankingDivision(st, div) {
    const filas = [];
    st.grupos.forEach((g, gi) => {
      if ((g.division || divisiones(st)[0].id) !== div) return;
      clasificacionGrupo(st, g.id).forEach(r => {
        if (!(equipo(st, r.id) || {}).baja) filas.push(Object.assign({ grupo: g.id, gi }, r));
      });
    });
    const q = (v, pj) => (pj ? v / pj : 0);
    return filas.sort((x, y) =>
      x.pos - y.pos || q(y.pts, y.pj) - q(x.pts, x.pj) || q(y.dif, y.pj) - q(x.dif, x.pj) ||
      q(y.gd, y.pj) - q(x.gd, x.pj) || q(y.gf, y.pj) - q(x.gf, x.pj) || x.gi - y.gi);
  }

  function directosCategoria(st, catId) {
    const cat = categoria(st, catId);
    if (!cat) return [];
    const filas = [];
    const div = cat.division || divisiones(st)[0].id;
    st.grupos.forEach((g, gi) => {
      if ((g.division || divisiones(st)[0].id) !== div) return;
      clasificacionGrupo(st, g.id).forEach(r => {
        if (cat.posiciones.includes(r.pos) && !(equipo(st, r.id) || {}).baja) filas.push(Object.assign({ grupo: g.id, gi }, r));
      });
    });
    const q = (v, pj) => (pj ? v / pj : 0);         // grupos de 4 y de 5 juegan distinto nº de partidos
    filas.sort((x, y) =>
      x.pos - y.pos || q(y.pts, y.pj) - q(x.pts, x.pj) || q(y.dif, y.pj) - q(x.dif, x.pj) ||
      q(y.gd, y.pj) - q(x.gd, x.pj) || q(y.gf, y.pj) - q(x.gf, x.pj) || x.gi - y.gi);
    return filas.map(r => ({ id: r.id, grupo: r.grupo, origen: r.pos + "º " + r.grupo }));
  }

  function partidosCuadro(st, catId) { return st.partidos.filter(p => p.tipo === "K" && p.cat === catId); }

  // La caída (perder el primer partido → categoría siguiente) sólo existe desde categorías de cuadro simple.
  function hayCaida(st, i) {
    if (!st.config.caida || i <= 0) return false;
    const [sup, cat] = [st.config.categorias[i - 1], st.config.categorias[i]];
    if ((sup.division || "") !== (cat.division || "")) return false;
    return (sup.formato || "simple") !== "doble";
  }
  function tendraEquipos(st, i) {
    const cat = st.config.categorias[i];
    if (cat && directosCategoria(st, cat.id).length) return true;
    return hayCaida(st, i) && tendraEquipos(st, i - 1);
  }

  // Quien pierde el primer partido que juega de verdad (sin contar byes) en la categoría.
  function caidosDe(st, catId) {
    const ps = partidosCuadro(st, catId).filter(p => p.estado === "fin" && !p.bye && p.llave === "W")
      .sort((x, y) => x.ronda - y.ronda || x.n - y.n);
    const yaJugo = new Set(), caen = [];
    for (const p of ps) {
      if (!yaJugo.has(p.perdedor)) caen.push(p.perdedor);
      yaJugo.add(p.a); yaJugo.add(p.b);
    }
    const siembra = (st.cuadros[catId] || {}).siembra || [];
    return caen.filter(Boolean).sort((x, y) => siembra.indexOf(x) - siembra.indexOf(y));
  }

  /* =================================================================
     MODO POR NIVELES (todos juntos en los grupos; cada pareja tiene un nivel)
     - 1º-4º de grupo → ganadores de la 1ª categoría (Élite).
     - 5º → si su nivel es Élite y Élite tiene doble K, a perdedores de Élite; si no, a la categoría siguiente.
     - Pierde en ganadores de la categoría k:
         nivel k o mejor → perdedores de k si k tiene doble K; si no, fuera.
         nivel peor que k → baja a ganadores de k+1.
     - Pierde en perdedores → fuera.
     - Con perdedores: al quedar 4 y 4 se sortean los cruces (el de ganadores empieza con ventaja).
       Sin perdedores: ganadores sigue directo hasta la final.
     Como las parejas llegan a cada categoría sobre la marcha, las rondas se generan solas,
     ronda a ronda, en cuanto termina la anterior ("bolsas" de ganadores y perdedores).
     ================================================================= */
  function divisionObj(st, id) { return divisiones(st).find(d => d.id === id) || divisiones(st)[0]; }
  function divDeCat(st, c) { return c.division || divisiones(st)[0].id; }
  function catsDe(st, div) { return st.config.categorias.filter(c => divDeCat(st, c) === div); }
  function esNiveles(st, catId) {
    const c = categoria(st, catId);
    return !!c && divisionObj(st, divDeCat(st, c)).modo === "niveles";
  }
  function nivelIdx(st, id, cats) {
    const e = equipo(st, id);
    const i = cats.findIndex(c => c.id === (e && e.nivel));
    return i < 0 ? cats.length - 1 : i;                // sin nivel = el más bajo
  }

  function flujoNiveles(st, div) {
    const cats = catsDe(st, div), K = cats.length;
    const pools = cats.map(c => ({
      W: { cat: c, llave: "W", miembros: [], set: new Set(), fuera: new Set(), partidos: [] },
      L: { cat: c, llave: "L", miembros: [], set: new Set(), fuera: new Set(), partidos: [] }
    }));
    const rank = rankingDivision(st, div), seed = {};
    rank.forEach((r, i) => (seed[r.id] = i));
    const F = { cats, pools, seed, rank, iniciado: !!(K && (st.cuadros[cats[0].id] || {}).generado) };
    if (!F.iniciado) return F;
    const meta = k => st.cuadros[cats[k].id] || {};
    const entra = (k, l, id) => {
      if (k >= K) return;
      const P = pools[k][l];
      if (!P.set.has(id)) { P.set.add(id); P.miembros.push(id); }
    };
    const caer = (k, id, desdeGrupo) => {
      const doble = cats[k].formato === "doble" && !meta(k).directo;
      if (nivelIdx(st, id, cats) <= k) {
        if (doble) entra(k, "L", id);
        else if (desdeGrupo) entra(k + 1, "W", id);
      } else entra(k + 1, "W", id);
    };
    const pos0 = cats[0].posiciones;
    rank.forEach(r => (pos0.includes(r.pos) ? entra(0, "W", r.id) : caer(0, r.id, true)));
    const idx = {};
    cats.forEach((c, i) => (idx[c.id] = i));
    st.partidos.forEach(p => {
      if (p.tipo !== "K" || !(p.cat in idx) || (p.llave !== "W" && p.llave !== "L")) return;
      const k = idx[p.cat];
      pools[k][p.llave].partidos.push(p);
      if (p.estado !== "fin" || p.bye || !p.perdedor) return;
      pools[k][p.llave].fuera.add(p.perdedor);
      const m = meta(k);
      if (p.llave === "W" && !(m.directoDesde && p.ronda >= m.directoDesde)) caer(k, p.perdedor, false);
    });
    pools.forEach(pp => ["W", "L"].forEach(l => {
      const P = pp[l];
      P.vivos = P.miembros.filter(id => !P.fuera.has(id));
      P.pendientes = P.partidos.filter(p => p.estado !== "fin");
      const ocup = new Set();
      P.pendientes.forEach(p => { ocup.add(p.a); ocup.add(p.b); });
      P.esperando = P.vivos.filter(id => !ocup.has(id)).sort((a, b) => seed[a] - seed[b]);
      P.rondas = P.partidos.reduce((mx, p) => Math.max(mx, p.ronda), 0);
    }));
    pools.forEach((pp, k) => {
      const c = cats[k], m = meta(k), doble = c.formato === "doble" && !m.directo;
      const W = pp.W, L = pp.L;
      W.feeders = k === 0 || pools[k - 1].W.hecho || !!meta(k - 1).directo;
      W.objetivo = doble ? 4 : 1;
      W.hecho = W.feeders && !W.pendientes.length && W.vivos.length <= W.objetivo;
      L.activo = doble;
      L.feeders = W.hecho;
      L.objetivo = 4;
      L.hecho = !doble || (L.feeders && !L.pendientes.length && L.vivos.length <= 4);
    });
    return F;
  }

  function partidosJugados(st, div) {
    const s = new Set();
    st.partidos.forEach(p => { if (p.a && p.b) { s.add(p.a + "|" + p.b); s.add(p.b + "|" + p.a); } });
    return s;
  }

  function generarRondaPool(st, c, P, mm) {
    const r = P.rondas + 1, lista = P.esperando, n = lista.length;
    const juegan = lista.slice(n - 2 * mm);             // los mejores descansan (pasan sin jugar)
    const pares = [];
    for (let i = 0; i < mm; i++) pares.push([juegan[i], juegan[2 * mm - 1 - i]]);
    const ya = partidosJugados(st);
    for (let i = 0; i < pares.length; i++) {             // evitar repetir enfrentamiento (también el de grupo)
      if (!ya.has(pares[i][0] + "|" + pares[i][1])) continue;
      for (let j = i + 1; j < pares.length; j++) {
        if (!ya.has(pares[i][0] + "|" + pares[j][1]) && !ya.has(pares[j][0] + "|" + pares[i][1])) {
          [pares[i][1], pares[j][1]] = [pares[j][1], pares[i][1]];
          break;
        }
      }
    }
    const final = P.llave === "W" && P.objetivo === 1 && P.feeders;
    const etiqueta = P.llave === "L" ? `Perdedores R${r}`
      : final && n === 2 ? "Final" : final && n <= 4 ? "Semifinales"
      : c.formato === "doble" && !(st.cuadros[c.id] || {}).directo ? `Ganadores R${r}` : `Ronda ${r}`;
    pares.forEach(([a, b], i) => {
      const p = nuevoPartido({ id: `K:${c.id}:${P.llave}:${r}:${i + 1}`, tipo: "K", cat: c.id, llave: P.llave, ronda: r, n: i + 1, a, b, fija: true, etiqueta });
      st.partidos.push(p);
      if (final && n === 2) st.cuadros[c.id].finalId = p.id;
    });
  }

  // Genera todas las rondas que ya se pueden jugar en una división por niveles.
  function avanzarNiveles(st, div) {
    for (let vuelta = 0; vuelta < 200; vuelta++) {
      const F = flujoNiveles(st, div);
      if (!F.iniciado) return;
      let cambio = false;
      for (let k = 0; k < F.cats.length && !cambio; k++) {
        const c = F.cats[k], m = st.cuadros[c.id], { W, L } = F.pools[k];
        m.campeon = !m.cruce && W.objetivo === 1 && W.hecho && W.vivos.length === 1 ? W.vivos[0] : null;
        if (m.cruce) continue;
        // doble K sin nadie en perdedores → se sigue directo hasta la final, sin sorteo
        if (c.formato === "doble" && !m.directo && W.hecho && L.miembros.length === 0) {
          m.directo = true; m.directoDesde = W.rondas + 1; cambio = true; break;
        }
        for (const P of L.activo ? [W, L] : [W]) {
          if (P.pendientes.length) continue;
          const n = P.esperando.length, t = P.objetivo;
          if (n < 2 || n <= t) continue;
          let mm;
          if (P.feeders) {
            if ((n & (n - 1)) === 0) mm = Math.min(n / 2, n - t);
            else { let pw = 1; while (pw * 2 < n) pw *= 2; mm = n - Math.max(pw, t); }
          } else mm = Math.min(Math.floor(n / 2), n - t);
          if (mm < 1) continue;
          generarRondaPool(st, c, P, mm);
          cambio = true;
        }
      }
      if (!cambio) return;
    }
  }

  function iniciarNiveles(st, catId) {
    const c = categoria(st, catId), div = divDeCat(st, c), cats = catsDe(st, div);
    if (cats[0].id !== catId) throw new Error("Las eliminatorias por niveles se empiezan desde " + cats[0].nombre);
    if (!gruposTerminados(st)) throw new Error("Faltan partidos de grupos");
    st.partidos = st.partidos.filter(p => !(p.tipo === "K" && cats.some(k => k.id === p.cat)));
    cats.forEach(k => (st.cuadros[k.id] = { formato: "niveles", generado: true, division: div, siembra: [], origen: {} }));
    avanzarNiveles(st, div);
    actualizarFase(st);
    return st.cuadros[catId];
  }

  // Resumen para el panel: cuántas parejas hay en cada bolsa.
  function estadoNiveles(st, catId) {
    const c = categoria(st, catId), F = flujoNiveles(st, divDeCat(st, c));
    const k = F.cats.findIndex(x => x.id === catId);
    if (!F.iniciado || k < 0) return { iniciado: false };
    const { W, L } = F.pools[k];
    return { iniciado: true, entradas: new Set(W.miembros.concat(L.miembros)).size, ganadores: W.vivos.length, perdedores: L.activo ? L.vivos.length : null, enPerdedores: L.miembros.length, directo: !!st.cuadros[catId].directo, cerrada: W.miembros.length + L.miembros.length === 0 && W.feeders };
  }

  // ¿Ya se conocen todas las parejas de la categoría?
  function estadoCategoria(st, catId) {
    const i = idxCategoria(st, catId);
    if (esNiveles(st, catId)) {
      const c = categoria(st, catId), cats = catsDe(st, divDeCat(st, c));
      const res = { listo: false, motivo: "", directos: [], caidos: [], generado: !!(st.cuadros[catId] || {}).generado, niveles: true };
      if (cats[0].id !== catId) { res.motivo = "Se llena sola con las parejas que bajan de " + cats[cats.indexOf(c) - 1].nombre; return res; }
      if (!gruposTerminados(st)) { res.motivo = "Faltan partidos de grupos"; return res; }
      res.directos = directosCategoria(st, catId);
      res.listo = rankingDivision(st, divDeCat(st, c)).length >= 2;
      return res;
    }
    const res = { listo: false, motivo: "", directos: [], caidos: [], generado: !!(st.cuadros[catId] || {}).generado };
    if (!gruposTerminados(st)) { res.motivo = "Faltan partidos de grupos"; return res; }
    res.directos = directosCategoria(st, catId);
    if (hayCaida(st, i)) {
      const sup = st.config.categorias[i - 1];
      const cs = st.cuadros[sup.id];
      if (!cs || !cs.generado) {
        if (tendraEquipos(st, i - 1)) { res.motivo = "Primero hay que generar el cuadro de " + sup.nombre; return res; }
      } else {
        const ps = partidosCuadro(st, sup.id).filter(p => !p.bye && p.llave === "W");
        const pendientes = cs.siembra.filter(id => !ps.some(p => p.estado === "fin" && (p.a === id || p.b === id)));
        if (pendientes.length) {
          res.motivo = `Faltan ${pendientes.length} pareja(s) de ${sup.nombre} por jugar su primer partido`;
          return res;
        }
        res.caidos = caidosDe(st, sup.id).map(id => ({ id, origen: "Cae de " + sup.nombre }));
      }
    }
    res.listo = res.directos.length + res.caidos.length >= 2;
    if (!res.listo) res.motivo = "No hay suficientes parejas";
    return res;
  }

  /* ---------- cuadros ---------- */

  // Evita que dos equipos del mismo grupo se crucen en la 1ª ronda (intercambiando con un emparejamiento vecino).
  function evitarMismoGrupo(slots, grupoDe) {
    const pares = [];
    for (let i = 0; i < slots.length; i += 2) pares.push([i, i + 1]);
    const choca = (x, y) => x && y && grupoDe[x] && grupoDe[x] === grupoDe[y];
    for (let k = 0; k < pares.length; k++) {
      const [i, j] = pares[k];
      if (!choca(slots[i], slots[j])) continue;
      let arreglado = false;
      for (let d = 1; d < pares.length && !arreglado; d++) {
        for (const kk of [k + d, k - d]) {
          if (kk < 0 || kk >= pares.length) continue;
          const [i2, j2] = pares[kk];
          if (!slots[j2]) continue;
          if (!choca(slots[i], slots[j2]) && !choca(slots[i2], slots[j])) {
            [slots[j], slots[j2]] = [slots[j2], slots[j]];
            arreglado = true; break;
          }
        }
      }
    }
    return slots;
  }

  /*  Cada partido de eliminatoria tiene "llave":
        W = ganadores (o el cuadro único si es simple)   L = perdedores
        X = cruces ganador-perdedor   S = semifinal   F = final   T = 3er puesto
      y sus dos huecos se rellenan con una pareja fija (siembra/sorteo) o con
      una "fuente": {id, take:"g"|"p"} = ganador o perdedor de otro partido.   */
  function generarCuadro(st, catId, opciones) {
    opciones = opciones || {};
    if (esNiveles(st, catId)) return iniciarNiveles(st, catId);
    const est = estadoCategoria(st, catId);
    if (!est.listo && !opciones.forzar) throw new Error(est.motivo || "La categoría no está lista");
    const cat = categoria(st, catId);
    const entrantes = est.caidos.concat(est.directos);   // los que caen de arriba son cabezas de serie
    const ids = entrantes.map(e => e.id);
    const grupoDe = {};
    st.grupos.forEach(g => g.equipos.forEach(id => (grupoDe[id] = g.id)));
    est.caidos.forEach(e => delete grupoDe[e.id]);
    const tam = potencia2(Math.max(2, ids.length));
    const R = Math.log2(tam);
    const doble = (cat.formato || "simple") === "doble" && tam >= 8;
    let slots = ordenSiembra(tam).map(s => ids[s - 1] || null);
    slots = evitarMismoGrupo(slots, grupoDe);

    st.partidos = st.partidos.filter(p => !(p.tipo === "K" && p.cat === catId));
    const nuevos = [];
    const pid = (llave, r, m) => `K:${catId}:${llave}:${r}:${m}`;
    const src = (llave, r, m, take) => ({ id: pid(llave, r, m), take });
    const add = (llave, r, m, extra) => {
      const p = nuevoPartido(Object.assign({ id: pid(llave, r, m), tipo: "K", cat: catId, llave, ronda: r, n: m, a: null, b: null, fa: null, fb: null }, extra || {}));
      nuevos.push(p);
      return p;
    };
    const rondasW = doble ? R - 2 : R;              // en doble K, ganadores se juega hasta que quedan 4
    for (let r = 1; r <= rondasW; r++) {
      for (let m = 1; m <= tam / Math.pow(2, r); m++) {
        if (r === 1) add("W", 1, m, { a: slots[2 * m - 2], b: slots[2 * m - 1], fija: true });
        else add("W", r, m, { fa: src("W", r - 1, 2 * m - 1, "g"), fb: src("W", r - 1, 2 * m, "g") });
      }
    }
    const meta = { formato: doble ? "doble" : "simple", tam, rondasW, rondasL: 0, siembra: ids, origen: {}, generado: true };
    entrantes.forEach(e => (meta.origen[e.id] = e.origen));

    if (!doble) {
      meta.finalId = pid("W", R, 1);
      if (st.config.tercerPuesto && R >= 2) add("T", 1, 1, { fa: src("W", R - 1, 1, "p"), fb: src("W", R - 1, 2, "p") });
    } else {
      // cuadro de perdedores
      const perd = r => { const out = []; for (let m = 1; m <= tam / Math.pow(2, r); m++) out.push(src("W", r, m, "p")); return out; };
      let vivos, j = 0;
      const ronda = parejas => { j++; const sig = []; parejas.forEach(([fa, fb], k) => { add("L", j, k + 1, { fa, fb }); sig.push(src("L", j, k + 1, "g")); }); return sig; };
      if (rondasW === 1) vivos = perd(1);              // cuadro de 8: los 4 que pierden ya son los 4 de perdedores
      else {
        const p1 = perd(1), pares = [];
        for (let k = 0; k < p1.length; k += 2) pares.push([p1[k], p1[k + 1]]);
        vivos = ronda(pares);
        for (let k = 2; k <= rondasW; k++) {
          if (k > 2) {                                 // ronda interna: se enfrentan los supervivientes entre sí
            const pi = [];
            for (let x = 0; x < vivos.length; x += 2) pi.push([vivos[x], vivos[x + 1]]);
            vivos = ronda(pi);
          }
          let caen = perd(k);                          // ronda de entrada: llegan los que pierden en ganadores
          if (k % 2 === 0) caen = caen.reverse();      // invertir para no repetir enfrentamientos
          vivos = ronda(vivos.map((v, x) => [v, caen[x]]));
        }
      }
      meta.rondasL = j;
      meta.cruce = { ganadores: [1, 2, 3, 4].map(m => src("W", rondasW, m, "g")), perdedores: vivos, sorteado: false };
      for (let m = 1; m <= 4; m++) add("X", 1, m, { ventaja: "a" });
      add("S", 1, 1, { fa: src("X", 1, 1, "g"), fb: src("X", 1, 2, "g") });
      add("S", 1, 2, { fa: src("X", 1, 3, "g"), fb: src("X", 1, 4, "g") });
      add("F", 1, 1, { fa: src("S", 1, 1, "g"), fb: src("S", 1, 2, "g") });
      if (st.config.tercerPuesto) add("T", 1, 1, { fa: src("S", 1, 1, "p"), fb: src("S", 1, 2, "p") });
      meta.finalId = pid("F", 1, 1);
    }
    st.partidos.push(...nuevos);
    st.cuadros[catId] = meta;
    resolver(st, catId);
    actualizarFase(st);
    return meta;
  }

  function valorFuente(byId, f) {
    const s = byId[f.id];
    if (!s || s.estado !== "fin") return { ok: false, v: null };
    return { ok: true, v: f.take === "g" ? s.ganador : s.perdedor };
  }

  // Recalcula quién juega cada partido a partir de sus fuentes y resuelve los "libres" (byes).
  function resolver(st, catId) {
    const ps = partidosCuadro(st, catId), byId = {};
    ps.forEach(p => (byId[p.id] = p));
    for (const p of ps) {                       // el orden de creación ya es topológico
      let A, B;
      if (p.fa || p.fb) {
        A = p.fa ? valorFuente(byId, p.fa) : { ok: true, v: null };
        B = p.fb ? valorFuente(byId, p.fb) : { ok: true, v: null };
      } else {
        const ok = !!p.fija;
        A = { ok, v: p.a }; B = { ok, v: p.b };
      }
      if (p.estado === "fin" && !p.bye) continue;
      if (p.fa || p.fb) { p.a = A.v; p.b = B.v; }
      if (A.ok && B.ok && (!A.v || !B.v)) {
        Object.assign(p, { bye: true, estado: "fin", ganador: A.v || B.v || null, perdedor: null, ra: null, rb: null, mesa: null });
      } else if (p.bye) {
        Object.assign(p, { bye: false, estado: "pendiente", ganador: null, perdedor: null });
      }
    }
  }

  /* ---------- cruces del doble K ---------- */
  function estadoCruce(st, catId) {
    if (esNiveles(st, catId)) {
      const cat = categoria(st, catId), m = st.cuadros[catId];
      if (!m || !m.generado || cat.formato !== "doble" || m.directo) return { aplica: false };
      const F = flujoNiveles(st, divDeCat(st, cat)), { W, L } = F.pools[F.cats.indexOf(cat)];
      const pad = a => a.concat([null, null, null, null]).slice(0, 4);
      return { aplica: true, sorteado: !!m.cruce, listo: W.hecho && L.hecho && L.miembros.length > 0, ganadores: pad(W.vivos), perdedores: pad(L.vivos) };
    }
    const c = st.cuadros[catId];
    if (!c || !c.cruce) return { aplica: false };
    const byId = {};
    partidosCuadro(st, catId).forEach(p => (byId[p.id] = p));
    const g = c.cruce.ganadores.map(f => valorFuente(byId, f));
    const l = c.cruce.perdedores.map(f => valorFuente(byId, f));
    return { aplica: true, sorteado: c.cruce.sorteado, listo: g.concat(l).every(x => x.ok), ganadores: g.map(x => x.v), perdedores: l.map(x => x.v) };
  }

  function sortearCruce(st, catId, semilla) {
    const e = estadoCruce(st, catId);
    if (!e.aplica) throw new Error("Esta categoría no tiene cruces");
    if (!e.listo) throw new Error("Aún no han terminado los cuadros de ganadores y perdedores");
    if (partidosCuadro(st, catId).some(p => p.llave === "X" && p.estado === "fin" && !p.bye)) throw new Error("Los cruces ya se están jugando");
    const rand = rng(semilla != null ? semilla : Math.floor(Math.random() * 1e9));
    const perd = barajar(e.perdedores, rand);
    if (esNiveles(st, catId)) {
      if (st.cuadros[catId].cruce) throw new Error("Los cruces ya están sorteados");
      const pid = (l, m) => `K:${catId}:${l}:1:${m}`, src = (l, m, take) => ({ id: pid(l, m), take });
      for (let m = 1; m <= 4; m++) st.partidos.push(nuevoPartido({ id: pid("X", m), tipo: "K", cat: catId, llave: "X", ronda: 1, n: m, a: e.ganadores[m - 1], b: perd[m - 1], fija: true, ventaja: "a" }));
      st.partidos.push(nuevoPartido({ id: pid("S", 1), tipo: "K", cat: catId, llave: "S", ronda: 1, n: 1, a: null, b: null, fa: src("X", 1, "g"), fb: src("X", 2, "g") }));
      st.partidos.push(nuevoPartido({ id: pid("S", 2), tipo: "K", cat: catId, llave: "S", ronda: 1, n: 2, a: null, b: null, fa: src("X", 3, "g"), fb: src("X", 4, "g") }));
      st.partidos.push(nuevoPartido({ id: pid("F", 1), tipo: "K", cat: catId, llave: "F", ronda: 1, n: 1, a: null, b: null, fa: src("S", 1, "g"), fb: src("S", 2, "g") }));
      if (st.config.tercerPuesto) st.partidos.push(nuevoPartido({ id: pid("T", 1), tipo: "K", cat: catId, llave: "T", ronda: 1, n: 1, a: null, b: null, fa: src("S", 1, "p"), fb: src("S", 2, "p") }));
      st.cuadros[catId].cruce = { sorteado: true };
      st.cuadros[catId].finalId = pid("F", 1);
      resolver(st, catId);
      return partidosCuadro(st, catId).filter(p => p.llave === "X");
    }
    for (let m = 1; m <= 4; m++) {
      const p = partido(st, `K:${catId}:X:1:${m}`);
      Object.assign(p, { a: e.ganadores[m - 1], b: perd[m - 1], fija: true, bye: false, estado: "pendiente", ganador: null, perdedor: null, mesa: null });
    }
    st.cuadros[catId].cruce.sorteado = true;
    resolver(st, catId);
    return partidosCuadro(st, catId).filter(p => p.llave === "X");
  }

  /* ---------- resultados ---------- */

  function comprobarMarcador(st, p, ra, rb) {
    const f = formatoDe(st, p);
    if (f.tipo === "fijo") {
      if (ra + rb !== f.partidas) throw new Error(`En este partido se juegan ${f.partidas} partidas (el marcador debe sumar ${f.partidas})`);
    } else {
      if (Math.max(ra, rb) !== f.partidas || Math.min(ra, rb) >= f.partidas) throw new Error(`Gana quien llega a ${f.partidas} partidas`);
    }
    const v = p.ventaja ? (st.config.ventajaCruce || 0) : 0;
    if (v && (p.ventaja === "a" ? ra : rb) < v) throw new Error(`La pareja de ganadores empieza con ${v} partida(s) de ventaja`);
    if (ra === rb && !admiteEmpate(st, p)) throw new Error("No puede haber empate");
  }

  // goles: [[golesA, golesB], …] partida a partida (opcional). Si se dan, el marcador se calcula solo.
  function registrarResultado(st, id, ra, rb, opciones) {
    opciones = opciones || {};
    const p = partido(st, id);
    if (!p) throw new Error("Partido no encontrado");
    if (!p.a || !p.b) throw new Error("Aún no se conocen los dos rivales");
    const f = formatoDe(st, p);
    const v = p.ventaja ? (st.config.ventajaCruce || 0) : 0;
    let goles = null;
    if (opciones.wo) {                                   // wo = "a" | "b" → ese equipo no se presentó
      ra = opciones.wo === "a" ? (p.ventaja === "a" ? v : 0) : f.partidas;
      rb = opciones.wo === "b" ? (p.ventaja === "b" ? v : 0) : f.partidas;
      if (f.tipo === "fijo") { ra = opciones.wo === "a" ? 0 : f.partidas; rb = opciones.wo === "b" ? 0 : f.partidas; }
    } else {
      if (opciones.goles && opciones.goles.length) {
        goles = opciones.goles.map(g => [Number(g[0]), Number(g[1])]);
        if (goles.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0)) throw new Error("Goles no válidos");
        if (goles.some(([x, y]) => x === y)) throw new Error("Cada partida tiene que tener un ganador");
        ra = goles.filter(([x, y]) => x > y).length + (p.ventaja === "a" ? v : 0);
        rb = goles.filter(([x, y]) => y > x).length + (p.ventaja === "b" ? v : 0);
      }
      ra = Number(ra); rb = Number(rb);
      if (!Number.isInteger(ra) || !Number.isInteger(rb) || ra < 0 || rb < 0) throw new Error("Marcador no válido");
      comprobarMarcador(st, p, ra, rb);
    }
    if (p.estado === "fin" && p.tipo === "K") {
      const nuevoGanador = ra > rb ? p.a : p.b;
      if (nuevoGanador !== p.ganador) {
        if (!puedeDeshacer(st, id)) throw new Error("El siguiente partido ya se jugó; corrige primero ese");
        if (esNiveles(st, p.cat)) borrarPosteriores(st, p);
      }
    }
    p.ra = ra; p.rb = rb; p.goles = goles; p.wo = opciones.wo || null;
    p.estado = "fin"; p.fin = opciones.ahora || Date.now(); p.mesa = p.mesa || null;
    p.ganador = ra > rb ? p.a : rb > ra ? p.b : null;
    p.perdedor = ra > rb ? p.b : rb > ra ? p.a : null;
    if (p.tipo === "K") resolver(st, p.cat);
    if (p.tipo === "K" && esNiveles(st, p.cat)) avanzarNiveles(st, divDeCat(st, categoria(st, p.cat)));
    actualizarFase(st);
    return p;
  }

  // Partidos generados después de p en los que juega alguna de sus parejas (modo niveles).
  function posteriores(st, p) {
    const i = st.partidos.indexOf(p);
    return st.partidos.slice(i + 1).filter(x => x.tipo === "K" && [x.a, x.b].some(id => id && (id === p.a || id === p.b)));
  }
  function borrarPosteriores(st, p) {
    const fuera = new Set(posteriores(st, p));
    st.partidos = st.partidos.filter(x => !fuera.has(x));
    const c = st.cuadros[p.cat];
    if (c && c.directo && p.llave === "W" && p.ronda < c.directoDesde) { delete c.directo; delete c.directoDesde; }
  }

  function dependientes(st, p) {
    return st.partidos.filter(x => x.tipo === "K" && x.cat === p.cat && ((x.fa && x.fa.id === p.id) || (x.fb && x.fb.id === p.id)));
  }

  function puedeDeshacer(st, id) {
    const p = partido(st, id);
    if (!p || p.estado !== "fin" || p.bye) return false;
    if (p.tipo === "G") return !Object.values(st.cuadros).some(c => c.generado);   // cambiaría el reparto
    if (esNiveles(st, p.cat) && (p.llave === "W" || p.llave === "L"))
      return posteriores(st, p).every(x => x.estado === "pendiente" && (x.llave === "W" || x.llave === "L"));
    if (dependientes(st, p).some(d => d.estado === "fin" && !d.bye)) return false;
    const c = st.cuadros[p.cat];
    if (c && c.cruce && c.cruce.sorteado && c.cruce.ganadores.concat(c.cruce.perdedores).some(f => f.id === p.id)) return false;
    if (st.config.caida) {
      const inf = st.config.categorias[idxCategoria(st, p.cat) + 1];
      if (inf && hayCaida(st, idxCategoria(st, inf.id)) && (st.cuadros[inf.id] || {}).generado) return false;
    }
    return true;
  }

  function deshacerResultado(st, id) {
    const p = partido(st, id);
    if (!puedeDeshacer(st, id)) throw new Error("No se puede deshacer: ya hay partidos que dependen de este");
    if (p.tipo === "K" && esNiveles(st, p.cat)) borrarPosteriores(st, p);
    Object.assign(p, { ra: null, rb: null, goles: null, wo: null, estado: "pendiente", fin: null, ganador: null, perdedor: null, mesa: null, llamado: null });
    if (p.tipo === "K") resolver(st, p.cat);
    if (p.tipo === "K" && esNiveles(st, p.cat)) avanzarNiveles(st, divDeCat(st, categoria(st, p.cat)));
    actualizarFase(st);
    return p;
  }

  function campeon(st, catId) {
    const c = st.cuadros[catId];
    if (c && c.formato === "niveles" && !c.cruce) return c.campeon || null;
    if (!c || !c.finalId) return null;
    const f = partido(st, c.finalId);
    return f && f.estado === "fin" ? f.ganador : null;
  }

  // "terminado" cuando todos los cuadros generados tienen campeón y no queda ninguna categoría por generar.
  function actualizarFase(st) {
    if (!st.grupos.length) return;
    const generadas = st.config.categorias.filter(c => (st.cuadros[c.id] || {}).generado);
    const fin = gruposTerminados(st) && generadas.length > 0 &&
      generadas.every(c => campeon(st, c.id) || (esNiveles(st, c.id) && estadoNiveles(st, c.id).cerrada)) &&
      st.config.categorias.every(c => (st.cuadros[c.id] || {}).generado || !estadoCategoria(st, c.id).listo);
    st.fase = fin ? "terminado" : generadas.length ? "eliminatorias" : "grupos";
  }

  /* ---------- mesas y llamadas ---------- */

  const EN_MESA = "mesa";

  function ocupados(st) {
    const s = new Set();
    st.partidos.forEach(p => { if (p.estado === EN_MESA) { s.add(p.a); s.add(p.b); } });
    return s;
  }

  function ultimoPartido(st) {                         // equipo → hora del último partido terminado
    const u = {};
    st.partidos.forEach(p => {
      if (p.estado === "fin" && !p.bye && p.fin) for (const id of [p.a, p.b]) if (id) u[id] = Math.max(u[id] || 0, p.fin);
    });
    return u;
  }

  // Orden aproximado en el tiempo de cada ronda (ganadores y perdedores se intercalan).
  function nivel(p) {
    if (p.tipo === "G") return p.ronda;
    return { W: 2 * p.ronda - 1, L: p.ronda + 1, X: 1000, S: 1001, T: 1002, F: 1003 }[p.llave] || 0;
  }

  // Partidos que se pueden jugar ya, en orden de prioridad.
  function cola(st) {
    const catIdx = {};
    st.config.categorias.forEach((c, i) => (catIdx[c.id] = i));
    const u = ultimoPartido(st);
    return st.partidos
      .filter(p => p.estado === "pendiente" && p.a && p.b && !(equipo(st, p.a) || {}).baja && !(equipo(st, p.b) || {}).baja)
      .sort((x, y) =>
        (x.tipo === "G" ? 0 : 1) - (y.tipo === "G" ? 0 : 1) ||
        nivel(x) - nivel(y) ||
        (x.tipo === "K" ? catIdx[x.cat] - catIdx[y.cat] : 0) ||
        Math.max(u[x.a] || 0, u[x.b] || 0) - Math.max(u[y.a] || 0, u[y.b] || 0) ||
        (x.gi || 0) - (y.gi || 0) || x.n - y.n);
  }

  function mesasLibres(st) {
    const usadas = new Set(st.partidos.filter(p => p.estado === EN_MESA).map(p => p.mesa));
    const off = new Set(st.config.mesasOff || []);
    const libres = [];
    for (let m = 1; m <= st.config.mesas; m++) if (!usadas.has(m) && !off.has(m)) libres.push(m);
    return libres;
  }

  function llamar(st, id, mesa, ahora) {
    const p = partido(st, id);
    if (!p || !p.a || !p.b) throw new Error("Partido no disponible");
    if (p.estado === "fin") throw new Error("Ese partido ya terminó");
    const occ = ocupados(st);
    if (p.estado !== EN_MESA && (occ.has(p.a) || occ.has(p.b))) throw new Error("Alguna pareja está jugando en otra mesa");
    p.estado = EN_MESA; p.mesa = mesa; p.llamado = ahora || Date.now();
    return p;
  }

  function soltar(st, id) {
    const p = partido(st, id);
    if (p && p.estado === EN_MESA) { p.estado = "pendiente"; p.mesa = null; p.llamado = null; }
    return p;
  }

  // Rellena las mesas libres con los siguientes partidos de la cola. Devuelve los partidos llamados.
  function asignarMesas(st, ahora) {
    const libres = mesasLibres(st), occ = ocupados(st), llamados = [];
    for (const p of cola(st)) {
      if (!libres.length) break;
      if (occ.has(p.a) || occ.has(p.b)) continue;
      llamar(st, p.id, libres.shift(), ahora);
      occ.add(p.a); occ.add(p.b);
      llamados.push(p);
    }
    return llamados;
  }

  function partidosDeEquipo(st, id) {
    return st.partidos.filter(p => p.a === id || p.b === id);
  }

  function nombreRonda(st, p) {
    const c = st.cuadros[p.cat] || {};
    if (p.etiqueta) return p.etiqueta;
    switch (p.llave) {
      case "W": return c.formato === "doble" ? `Ganadores R${p.ronda}` : rondaNombre(c.tam || 2, p.ronda);
      case "L": return `Perdedores R${p.ronda}`;
      case "X": return `Cruce ${p.n}`;
      case "S": return "Semifinal";
      case "F": return "Final";
      case "T": return "3er puesto";
    }
    return "";
  }

  function nombrePartido(st, p) {
    if (p.tipo === "G") return `Grupo ${p.grupo} · J${p.ronda}`;
    const cat = categoria(st, p.cat);
    return `${cat ? cat.nombre : p.cat} · ${nombreRonda(st, p)}`;
  }

  function resumen(st) {
    const ps = st.partidos.filter(p => !p.bye);
    return {
      equipos: equiposActivos(st).length,
      grupos: st.grupos.length,
      partidos: ps.length,
      jugados: ps.filter(p => p.estado === "fin").length,
      enMesa: ps.filter(p => p.estado === EN_MESA).length,
      enCola: cola(st).length
    };
  }

  return {
    rng, barajar, uid, letraGrupo, potencia2, configPorDefecto, divisiones, divisionDe,
    nuevoTorneo, añadirEquipo, equipo, partido, equiposActivos, categoria,
    formatoDe, textoFormato, admiteEmpate,
    tamañosGrupos, liguilla, sortearGrupos, clasificacionGrupo, grupoTerminado, gruposTerminados,
    rondaNombre, ordenSiembra, directosCategoria, caidosDe, estadoCategoria, generarCuadro, campeon, resolver,
    estadoCruce, sortearCruce, esNiveles, estadoNiveles, flujoNiveles, catsDe, rankingDivision,
    registrarResultado, deshacerResultado, puedeDeshacer,
    cola, mesasLibres, llamar, soltar, asignarMesas, ocupados,
    partidosDeEquipo, nombrePartido, nombreRonda, resumen, partidosCuadro
  };
});
