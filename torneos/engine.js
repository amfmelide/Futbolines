/* =====================================================================
   MOTOR DE TORNEOS · AMF Melide
   ---------------------------------------------------------------------
   Lógica pura (sin DOM ni red): fase de grupos → reparto por categorías
   según la posición en el grupo → cuadros de eliminatoria por categoría,
   con "caída" opcional (quien pierde su primer partido en una categoría
   baja a la siguiente). Funciona en el navegador (window.TorneoEngine)
   y en Node (require) para los tests.

   Ideas tomadas de proyectos libres de GitHub:
   - brackets-manager.js / brackets-viewer.js (Drarig29): modelo
     fase → ronda → partido, byes para los mejores cabezas de serie y
     orden de siembra estándar (1 vs N, 2 vs N-1…).
   - tournament / groupstage (clux): reparto en serpiente de cabezas de
     serie y liguilla por el método del círculo.
   - Challonge: desempates por enfrentamiento directo y cola de mesas.
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
  function nuevoTorneo(opts) {
    opts = opts || {};
    return {
      formato: 1,
      version: 0,
      codigo: opts.codigo || "torneo",
      nombre: opts.nombre || "Torneo",
      fecha: opts.fecha || "",
      lugar: opts.lugar || "",
      fase: "inscripcion",                   // inscripcion | grupos | eliminatorias | terminado
      config: Object.assign({
        tamGrupo: 4,                          // 4 → grupos de 4 (y alguno de 5); 5 → de 5 (y alguno de 4)
        numGrupos: 0,                         // 0 = automático
        puntos: { victoria: 3, empate: 1, derrota: 0 },
        permitirEmpate: false,
        setsWO: 2,                            // marcador que se da a quien gana por W.O.
        mesas: 8,
        mesasOff: [],                         // mesas fuera de servicio
        caida: true,                          // quien pierde su 1er partido de una categoría baja a la siguiente
        tercerPuesto: false,
        inscripcionAbierta: true,
        maxEquipos: 200,
        categorias: [
          { id: "c1", nombre: "Primera", posiciones: [1, 2] },
          { id: "c2", nombre: "Segunda", posiciones: [3] },
          { id: "c3", nombre: "Tercera", posiciones: [4, 5] }
        ]
      }, opts.config || {}),
      equipos: [],                            // {id, nombre, j1, j2, ranking, baja, presente}
      grupos: [],                             // {id, equipos:[ids]}
      partidos: [],
      cuadros: {},                            // catId → {tam, rondas, siembra:[ids], generado}
      semilla: opts.semilla || Math.floor(Math.random() * 1e9),
      log: []
    };
  }

  function equipo(st, id) { return st.equipos.find(e => e.id === id) || null; }
  function partido(st, id) { return st.partidos.find(p => p.id === id) || null; }
  function equiposActivos(st) { return st.equipos.filter(e => !e.baja); }

  function añadirEquipo(st, datos) {
    const e = {
      id: datos.id || uid("e"),
      nombre: (datos.nombre || "").trim() || ((datos.j1 || "?") + " / " + (datos.j2 || "?")),
      j1: (datos.j1 || "").trim(),
      j2: (datos.j2 || "").trim(),
      ranking: datos.ranking ? Number(datos.ranking) : null,
      baja: false,
      presente: false,
      alta: datos.alta || Date.now()
    };
    st.equipos.push(e);
    return e;
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

  // Sorteo: cabezas de serie (ranking) en serpiente; el resto al azar.
  function sortearGrupos(st, opciones) {
    opciones = opciones || {};
    const activos = equiposActivos(st);
    if (activos.length < 2) throw new Error("Hacen falta al menos 2 parejas");
    const rand = rng(opciones.semilla != null ? opciones.semilla : st.semilla);
    const conRank = activos.filter(e => e.ranking).sort((a, b) => a.ranking - b.ranking);
    const sinRank = barajar(activos.filter(e => !e.ranking), rand);
    const orden = conRank.concat(sinRank);
    const tams = tamañosGrupos(orden.length, st.config.tamGrupo, st.config.numGrupos);
    const g = tams.length;
    const grupos = tams.map((t, i) => ({ id: letraGrupo(i), equipos: [] }));
    // serpiente: fila 0 → A..Z, fila 1 → Z..A, saltando grupos ya llenos
    let idx = 0, fila = 0;
    while (idx < orden.length) {
      const seq = [...Array(g).keys()];
      if (fila % 2) seq.reverse();
      for (const k of seq) {
        if (idx >= orden.length) break;
        if (grupos[k].equipos.length < tams[k]) grupos[k].equipos.push(orden[idx++].id);
      }
      fila++;
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
    return Object.assign({ ra: null, rb: null, wo: null, estado: "pendiente", mesa: null, llamado: null, avisos: 0, fin: null, ganador: null, perdedor: null }, p);
  }

  function puntosDe(st, p, lado) {
    const P = st.config.puntos;
    const mio = lado === "a" ? p.ra : p.rb, suyo = lado === "a" ? p.rb : p.ra;
    if (mio > suyo) return P.victoria;
    if (mio === suyo) return P.empate;
    return P.derrota;
  }

  function clasificacionGrupo(st, grupoId) {
    const gr = st.grupos.find(g => g.id === grupoId);
    if (!gr) return [];
    const ps = st.partidos.filter(p => p.tipo === "G" && p.grupo === grupoId);
    const fila = id => ({ id, pj: 0, g: 0, e: 0, p: 0, sf: 0, sc: 0, dif: 0, pts: 0, pos: 0, orden: gr.equipos.indexOf(id) });
    const tabla = {};
    gr.equipos.forEach(id => (tabla[id] = fila(id)));
    const sumar = (t, p) => {
      for (const lado of ["a", "b"]) {
        const id = p[lado], r = t[id];
        if (!r) continue;
        const mio = lado === "a" ? p.ra : p.rb, suyo = lado === "a" ? p.rb : p.ra;
        r.pj++; r.sf += mio; r.sc += suyo; r.dif = r.sf - r.sc;
        if (mio > suyo) r.g++; else if (mio === suyo) r.e++; else r.p++;
        r.pts += puntosDe(st, p, lado);
      }
    };
    const jugados = ps.filter(p => p.estado === "fin");
    jugados.forEach(p => sumar(tabla, p));
    const filas = Object.values(tabla).filter(r => !(equipo(st, r.id) || {}).baja || r.pj);
    filas.sort((x, y) => y.pts - x.pts);
    // desempate: enfrentamiento directo entre los empatados, luego diferencia, a favor y orden de sorteo
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
          mini[y.id].pts - mini[x.id].pts || mini[y.id].dif - mini[x.id].dif ||
          y.dif - x.dif || y.sf - x.sf || x.orden - y.orden);
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

  /* ---------- categorías y cuadros ---------- */

  function rondaNombre(tam, r) {
    const quedan = tam / Math.pow(2, r - 1);         // equipos al empezar la ronda
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
  function directosCategoria(st, catId) {
    const cat = st.config.categorias.find(c => c.id === catId);
    if (!cat) return [];
    const filas = [];
    st.grupos.forEach((g, gi) => {
      clasificacionGrupo(st, g.id).forEach(r => {
        if (cat.posiciones.includes(r.pos) && !(equipo(st, r.id) || {}).baja) filas.push(Object.assign({ grupo: g.id, gi }, r));
      });
    });
    const ratio = (v, pj) => (pj ? v / pj : 0);     // grupos de 4 y de 5 juegan distinto nº de partidos
    filas.sort((x, y) =>
      x.pos - y.pos || ratio(y.pts, y.pj) - ratio(x.pts, x.pj) ||
      ratio(y.dif, y.pj) - ratio(x.dif, x.pj) || ratio(y.sf, y.pj) - ratio(x.sf, x.pj) || x.gi - y.gi);
    return filas.map(r => ({ id: r.id, grupo: r.grupo, origen: r.pos + "º " + r.grupo }));
  }

  function partidosCuadro(st, catId) { return st.partidos.filter(p => p.tipo === "K" && p.cat === catId); }

  // Quien pierde el primer partido que juega de verdad (sin contar byes) en la categoría.
  function caidosDe(st, catId) {
    const ps = partidosCuadro(st, catId).filter(p => p.estado === "fin" && !p.bye && !p.tercer)
      .sort((x, y) => x.ronda - y.ronda || x.n - y.n);
    const yaJugo = new Set(), caen = [];
    for (const p of ps) {
      if (!yaJugo.has(p.perdedor)) caen.push(p.perdedor);
      yaJugo.add(p.a); yaJugo.add(p.b);
    }
    const siembra = (st.cuadros[catId] || {}).siembra || [];
    return caen.filter(Boolean).sort((x, y) => siembra.indexOf(x) - siembra.indexOf(y));
  }

  // ¿Llegará alguna pareja a la categoría i (directamente o cayendo desde arriba)?
  function tendraEquipos(st, i) {
    const cat = st.config.categorias[i];
    if (cat && directosCategoria(st, cat.id).length) return true;
    return !!(st.config.caida && i > 0 && tendraEquipos(st, i - 1));
  }

  // ¿Ya se conocen todos los equipos de la categoría?
  function estadoCategoria(st, catId) {
    const i = idxCategoria(st, catId);
    const res = { listo: false, motivo: "", directos: [], caidos: [], generado: !!(st.cuadros[catId] || {}).generado };
    if (!gruposTerminados(st)) { res.motivo = "Faltan partidos de grupos"; return res; }
    res.directos = directosCategoria(st, catId);
    if (st.config.caida && i > 0) {
      const sup = st.config.categorias[i - 1];
      const cs = st.cuadros[sup.id];
      if (!cs || !cs.generado) {
        // si la categoría superior va a tener parejas, hay que esperar a sus caídos
        if (tendraEquipos(st, i - 1)) { res.motivo = "Primero hay que generar el cuadro de " + sup.nombre; return res; }
      } else {
        const ps = partidosCuadro(st, sup.id).filter(p => !p.bye && !p.tercer);
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

  function generarCuadro(st, catId, opciones) {
    opciones = opciones || {};
    const est = estadoCategoria(st, catId);
    if (!est.listo && !opciones.forzar) throw new Error(est.motivo || "La categoría no está lista");
    const entrantes = est.caidos.concat(est.directos);   // los que caen de arriba son cabezas de serie
    const ids = entrantes.map(e => e.id);
    const grupoDe = {};
    st.grupos.forEach(g => g.equipos.forEach(id => (grupoDe[id] = g.id)));
    est.caidos.forEach(e => delete grupoDe[e.id]);
    const tam = potencia2(Math.max(2, ids.length));
    const rondas = Math.log2(tam);
    const orden = ordenSiembra(tam);
    let slots = orden.map(s => ids[s - 1] || null);
    slots = evitarMismoGrupo(slots, grupoDe);

    st.partidos = st.partidos.filter(p => !(p.tipo === "K" && p.cat === catId));
    const nuevos = [];
    for (let r = 1; r <= rondas; r++) {
      const nm = tam / Math.pow(2, r);
      for (let m = 1; m <= nm; m++) {
        const p = nuevoPartido({ id: `K:${catId}:${r}:${m}`, tipo: "K", cat: catId, ronda: r, n: m, a: null, b: null });
        if (r < rondas) p.sig = { id: `K:${catId}:${r + 1}:${Math.ceil(m / 2)}`, lado: m % 2 ? "a" : "b" };
        if (r === 1) { p.a = slots[2 * (m - 1)]; p.b = slots[2 * (m - 1) + 1]; }
        nuevos.push(p);
      }
    }
    if (st.config.tercerPuesto && rondas >= 2) {
      nuevos.push(nuevoPartido({ id: `K:${catId}:3P`, tipo: "K", cat: catId, ronda: rondas, n: 2, a: null, b: null, tercer: true }));
      nuevos.filter(p => p.ronda === rondas - 1).forEach(p => (p.sigPerdedor = { id: `K:${catId}:3P`, lado: p.n % 2 ? "a" : "b" }));
    }
    st.partidos.push(...nuevos);
    const origen = {};
    entrantes.forEach(e => (origen[e.id] = e.origen));
    st.cuadros[catId] = { tam, rondas, siembra: ids, origen, generado: true };
    // byes: pasan solos
    nuevos.filter(p => p.ronda === 1).forEach(p => {
      if ((p.a && !p.b) || (!p.a && p.b)) {
        p.bye = true; p.estado = "fin"; p.ganador = p.a || p.b; p.perdedor = null;
        propagar(st, p);
      }
    });
    if (st.fase === "grupos") st.fase = "eliminatorias";
    return st.cuadros[catId];
  }

  function propagar(st, p) {
    if (p.sig && p.ganador) { const s = partido(st, p.sig.id); if (s) s[p.sig.lado] = p.ganador; }
    if (p.sigPerdedor && p.perdedor) { const s = partido(st, p.sigPerdedor.id); if (s) s[p.sigPerdedor.lado] = p.perdedor; }
  }

  /* ---------- resultados ---------- */

  function registrarResultado(st, id, ra, rb, opciones) {
    opciones = opciones || {};
    const p = partido(st, id);
    if (!p) throw new Error("Partido no encontrado");
    if (!p.a || !p.b) throw new Error("Aún no se conocen los dos rivales");
    if (opciones.wo) {                                   // wo = "a" | "b" → ese equipo no se presentó
      p.wo = opciones.wo;
      ra = opciones.wo === "a" ? 0 : st.config.setsWO;
      rb = opciones.wo === "b" ? 0 : st.config.setsWO;
    } else p.wo = null;
    ra = Number(ra); rb = Number(rb);
    if (!Number.isFinite(ra) || !Number.isFinite(rb) || ra < 0 || rb < 0) throw new Error("Marcador no válido");
    if (ra === rb && (p.tipo === "K" || !st.config.permitirEmpate)) throw new Error("No puede haber empate");
    if (p.estado === "fin" && p.tipo === "K") {
      const nuevoGanador = ra > rb ? p.a : p.b;
      if (nuevoGanador !== p.ganador && !puedeDeshacer(st, id)) throw new Error("El siguiente partido ya se jugó; corrige primero ese");
      limpiarPropagacion(st, p);
    }
    p.ra = ra; p.rb = rb;
    p.estado = "fin"; p.fin = opciones.ahora || Date.now();
    p.ganador = ra > rb ? p.a : rb > ra ? p.b : null;
    p.perdedor = ra > rb ? p.b : rb > ra ? p.a : null;
    if (p.tipo === "K") propagar(st, p);
    actualizarFase(st);
    return p;
  }

  function puedeDeshacer(st, id) {
    const p = partido(st, id);
    if (!p || p.estado !== "fin") return false;
    for (const ref of [p.sig, p.sigPerdedor]) {
      if (!ref) continue;
      const s = partido(st, ref.id);
      if (s && s.estado === "fin" && !s.bye) return false;
    }
    if (p.tipo === "G") {
      // si ya hay cuadros generados, cambiar un resultado de grupos podría alterar el reparto
      if (Object.values(st.cuadros).some(c => c.generado)) return false;
    }
    if (p.tipo === "K" && st.config.caida) {
      const i = idxCategoria(st, p.cat), inf = st.config.categorias[i + 1];
      if (inf && (st.cuadros[inf.id] || {}).generado) return false;
    }
    return true;
  }

  function limpiarPropagacion(st, p) {
    for (const ref of [p.sig, p.sigPerdedor]) {
      if (!ref) continue;
      const s = partido(st, ref.id);
      if (s && s.estado !== "fin") s[ref.lado] = null;
    }
  }

  function deshacerResultado(st, id) {
    const p = partido(st, id);
    if (!puedeDeshacer(st, id)) throw new Error("No se puede deshacer: ya hay partidos que dependen de este");
    if (p.tipo === "K") limpiarPropagacion(st, p);
    Object.assign(p, { ra: null, rb: null, wo: null, estado: "pendiente", fin: null, ganador: null, perdedor: null, mesa: null, llamado: null });
    actualizarFase(st);
    return p;
  }

  // "terminado" cuando todos los cuadros generados tienen campeón y no queda ninguna categoría por generar.
  function actualizarFase(st) {
    if (!st.grupos.length) return;
    const generadas = st.config.categorias.filter(c => (st.cuadros[c.id] || {}).generado);
    const fin = gruposTerminados(st) && generadas.length > 0 &&
      generadas.every(c => campeon(st, c.id)) &&
      st.config.categorias.every(c => (st.cuadros[c.id] || {}).generado || !estadoCategoria(st, c.id).listo);
    if (fin) st.fase = "terminado";
    else st.fase = generadas.length ? "eliminatorias" : "grupos";
  }

  function campeon(st, catId) {
    const c = st.cuadros[catId];
    if (!c) return null;
    const f = partido(st, `K:${catId}:${c.rondas}:1`);
    return f && f.estado === "fin" ? f.ganador : null;
  }

  /* ---------- mesas y llamadas ---------- */

  const EN_MESA = "mesa";

  function ocupados(st) {
    const s = new Set();
    st.partidos.forEach(p => { if (p.estado === EN_MESA) { s.add(p.a); s.add(p.b); } });
    return s;
  }

  function ultimoPartido(st) {                         // equipo → fecha del último partido terminado
    const u = {};
    st.partidos.forEach(p => {
      if (p.estado === "fin" && !p.bye && p.fin) for (const id of [p.a, p.b]) if (id) u[id] = Math.max(u[id] || 0, p.fin);
    });
    return u;
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
        x.ronda - y.ronda ||
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
    p.estado = EN_MESA; p.mesa = mesa; p.llamado = ahora || Date.now(); p.avisos = (p.avisos || 0);
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

  function nombrePartido(st, p) {
    if (p.tipo === "G") return `Grupo ${p.grupo} · J${p.ronda}`;
    const cat = st.config.categorias.find(c => c.id === p.cat);
    const c = st.cuadros[p.cat];
    const r = p.tercer ? "3er puesto" : rondaNombre(c ? c.tam : 2, p.ronda);
    return `${cat ? cat.nombre : p.cat} · ${r}`;
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
    rng, barajar, uid, letraGrupo, potencia2,
    nuevoTorneo, añadirEquipo, equipo, partido, equiposActivos,
    tamañosGrupos, liguilla, sortearGrupos, clasificacionGrupo, grupoTerminado, gruposTerminados,
    rondaNombre, ordenSiembra, directosCategoria, caidosDe, estadoCategoria, generarCuadro, campeon,
    registrarResultado, deshacerResultado, puedeDeshacer,
    cola, mesasLibres, llamar, soltar, asignarMesas, ocupados,
    partidosDeEquipo, nombrePartido, resumen, partidosCuadro
  };
});
