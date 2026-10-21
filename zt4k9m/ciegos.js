/* ==============================================================
   CIEGOS · motor de torneos pequeños a sorteo (AMF Melide)
   Modos:
     ciegos  → cada jugador se apunta solo, se sortean las parejas y eliminatoria directa
     monster → Monster DYP: cada ronda un compañero distinto, clasificación individual
     suizo   → sistema suizo por parejas (a sorteo o fijas), N rondas
     vidas   → individual: cada jugador tiene 3 vidas, pareja a sorteo en cada ronda; cada derrota quita
               una vida a los dos; con 8 o menos en pie: parejas a sorteo, semifinales y final
   Funciona en el navegador (window.CiegosEngine) y en Node (tests).
   ============================================================== */
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.CiegosEngine = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- utilidades ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function barajar(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  let contador = 0;
  function uid(p) { return (p || "x") + Date.now().toString(36) + (contador++).toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function potencia2(n) { let p = 1; while (p < n) p *= 2; return p; }
  function ordenSiembra(tam) {                 // [1, 8, 4, 5, 2, 7, 3, 6] para 8
    let o = [1];
    while (o.length < tam) { const n = o.length * 2; o = o.flatMap(s => [s, n + 1 - s]); }
    return o;
  }
  // semilla nueva para cada sorteo (reproducible a partir del estado)
  function azar(st) { st.sorteos = (st.sorteos || 0) + 1; return rng((st.semilla + st.sorteos * 7919) >>> 0); }

  const MODOS = {
    ciegos: { nombre: "Ciegos", texto: "Parejas a sorteo y eliminatoria directa", partidas: { tipo: "al", partidas: 2, goles: 7 } },
    monster: { nombre: "Monster DYP", texto: "Cada ronda un compañero distinto · clasificación individual", partidas: { tipo: "al", partidas: 1, goles: 7 } },
    suizo: { nombre: "Suizo", texto: "Rondas emparejando a quien va igual en la clasificación", partidas: { tipo: "al", partidas: 1, goles: 7 } },
    vidas: { nombre: "Vidas", texto: "Cada jugador 3 vidas · pareja a sorteo en cada ronda · al final, semifinales y final", partidas: { tipo: "al", partidas: 1, goles: 7 } }
  };

  /* ---------- estado ---------- */
  function nuevoTorneo(o) {
    o = o || {};
    const modo = MODOS[o.modo] ? o.modo : "ciegos";
    return {
      app: "ciegos", formato: 1,
      codigo: o.codigo || "ciegos", nombre: o.nombre || MODOS[modo].nombre, fecha: o.fecha || "", lugar: o.lugar || "",
      modo, fase: "inscripcion",              // inscripcion | juego | final | terminado
      config: Object.assign({
        partidas: Object.assign({}, MODOS[modo].partidas),
        mesas: 4,
        rondas: 0,                            // monster / suizo: 0 = automático
        vidas: 3,
        parejas: "sorteo",                    // suizo: "sorteo" (se apuntan solos) o "fijas" (se apuntan por parejas)
        tercerPuesto: false
      }, o.config || {}),
      jugadores: [],                          // {id, nombre, baja}
      parejas: [],                            // {id, j1, j2}  (todos los modos menos monster)
      partidos: [],                           // ver nuevoPartido
      ronda: 0,
      semilla: o.semilla || Math.floor(Math.random() * 1e9),
      sorteos: 0,
      log: []
    };
  }
  function individual(st) { return st.modo === "monster" || st.modo === "vidas"; }
  function porParejas(st) { return !individual(st); }
  function parejasFijas(st) { return st.modo === "suizo" && st.config.parejas === "fijas"; }

  function añadirJugador(st, nombre, id) {
    nombre = String(nombre || "").trim();
    if (!nombre) throw new Error("Falta el nombre");
    if (st.fase !== "inscripcion") throw new Error("El torneo ya ha empezado");
    const j = { id: id || uid("j"), nombre, baja: false };
    st.jugadores.push(j);
    return j;
  }
  // Para «parejas fijas»: se apunta la pareja entera
  function añadirPareja(st, n1, n2) {
    const a = añadirJugador(st, n1), b = añadirJugador(st, n2);
    const p = { id: uid("p"), j1: a.id, j2: b.id };
    st.parejas.push(p);
    return p;
  }
  function jugador(st, id) { return st.jugadores.find(j => j.id === id) || null; }
  function pareja(st, id) { return st.parejas.find(p => p.id === id) || null; }
  function partido(st, id) { return st.partidos.find(p => p.id === id) || null; }
  function activos(st) { return st.jugadores.filter(j => !j.baja); }

  function nombreJugador(st, id) { const j = jugador(st, id); return j ? j.nombre : "?"; }
  // Un lado de un partido: id de pareja (o array de 2 jugadores en Monster DYP)
  function nombreLado(st, lado) {
    if (!lado) return "Por decidir";
    if (Array.isArray(lado)) return lado.map(id => nombreJugador(st, id)).join(" / ");
    const p = pareja(st, lado);
    return p ? nombreJugador(st, p.j1) + " / " + nombreJugador(st, p.j2) : "?";
  }
  function jugadoresDe(st, lado) {
    if (!lado) return [];
    if (Array.isArray(lado)) return lado;
    const p = pareja(st, lado);
    return p ? [p.j1, p.j2] : [];
  }

  function nuevoPartido(o) {
    return Object.assign({ id: uid("m"), ronda: 0, n: 0, fase: "ronda", a: null, b: null, ra: null, rb: null, ganador: null, estado: "pendiente", mesa: null, bye: false }, o);
  }

  /* ---------- formato de partidas ---------- */
  function textoFormato(f) {
    return f.tipo === "fijo" ? `${f.partidas} partida${f.partidas > 1 ? "s" : ""} de ${f.goles} goles` : `Al mejor de ${2 * f.partidas - 1} (${f.partidas} ganada${f.partidas > 1 ? "s" : ""}) a ${f.goles} goles`;
  }
  function marcadoresPosibles(st) {
    const f = st.config.partidas, r = [];
    if (f.tipo === "fijo") { for (let i = f.partidas; i >= 0; i--) if (i !== f.partidas - i) r.push([i, f.partidas - i]); }
    else { for (let k = 0; k < f.partidas; k++) r.push([f.partidas, k]); for (let k = f.partidas - 1; k >= 0; k--) r.push([k, f.partidas]); }
    return r;
  }
  function comprobarMarcador(st, ra, rb) {
    const f = st.config.partidas;
    if (!Number.isInteger(ra) || !Number.isInteger(rb) || ra < 0 || rb < 0) throw new Error("Marcador no válido");
    if (ra === rb) throw new Error("Tiene que haber un ganador");
    if (f.tipo === "fijo") { if (ra + rb !== f.partidas) throw new Error(`Se juegan ${f.partidas} partidas`); }
    else if (Math.max(ra, rb) !== f.partidas || Math.min(ra, rb) >= f.partidas) throw new Error(`Gana quien llega a ${f.partidas}`);
  }

  /* ---------- arranque: sorteo de parejas ---------- */
  function sortearParejas(st) {
    const js = barajar(activos(st), azar(st));
    if (js.length % 2) throw new Error(`Hay ${js.length} jugadores: hace falta un número par para hacer parejas. Añade o quita uno.`);
    st.parejas = [];
    for (let i = 0; i < js.length; i += 2) st.parejas.push({ id: uid("p"), j1: js[i].id, j2: js[i + 1].id });
    return st.parejas;
  }

  function minimo(st) {
    if (st.modo === "monster") return 4;
    if (st.modo === "vidas") return 4;
    return 2;
  }

  // Empieza el torneo. Devuelve las parejas sorteadas (si las hay) para enseñarlas en directo.
  function empezar(st) {
    if (st.fase !== "inscripcion") throw new Error("El torneo ya ha empezado");
    if (individual(st)) {
      if (activos(st).length < 4) throw new Error("Hacen falta al menos 4 jugadores");
    } else {
      if (parejasFijas(st)) {
        st.parejas = st.parejas.filter(p => !(jugador(st, p.j1) || {}).baja && !(jugador(st, p.j2) || {}).baja);
      } else sortearParejas(st);
      if (st.parejas.length < minimo(st)) throw new Error(`Hacen falta al menos ${minimo(st)} parejas`);
    }
    st.fase = "juego";
    if (st.modo === "ciegos") generarCuadroKO(st, st.parejas.map(p => p.id), "ko");
    else siguienteRonda(st);
    return st.parejas;
  }

  /* ---------- eliminatoria directa (ciegos) y fase final (vidas) ---------- */
  function generarCuadroKO(st, ids, fase) {
    const rand = azar(st);
    const orden = barajar(ids, rand);
    const tam = potencia2(Math.max(2, orden.length)), R = Math.round(Math.log2(tam));
    const siembra = ordenSiembra(tam);
    const slots = siembra.map(s => orden[s - 1] || null);
    const porRonda = [];
    for (let r = 1; r <= R; r++) {
      porRonda[r] = [];
      const n = tam >> r;
      for (let m = 1; m <= n; m++) {
        const p = nuevoPartido({ ronda: r, n: m, fase });
        if (r === 1) { p.a = slots[2 * m - 2]; p.b = slots[2 * m - 1]; }
        else { p.fa = porRonda[r - 1][2 * m - 2].id; p.fb = porRonda[r - 1][2 * m - 1].id; }
        porRonda[r].push(p);
        st.partidos.push(p);
      }
    }
    if (st.config.tercerPuesto && R >= 2) {
      const [s1, s2] = porRonda[R - 1];
      st.partidos.push(nuevoPartido({ ronda: R, n: 2, fase, tercer: true, fa: s1.id, fb: s2.id, toma: "p" }));
    }
    st.ko = { fase, rondas: R, finalId: porRonda[R][0].id };
    resolverKO(st);
  }

  // Rellena los rivales que ya se conocen y pasa solos a quien no tiene rival (sólo en la 1ª ronda)
  function resolverKO(st) {
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const p of st.partidos) {
        if (p.estado === "fin") continue;
        if (p.fa || p.fb) {
          const pa = partido(st, p.fa), pb = partido(st, p.fb);
          const val = x => x && x.estado === "fin" ? (p.toma === "p" ? perdedor(x) : x.ganadorId) : null;
          const a = val(pa), b = val(pb);
          if (a && p.a !== a) { p.a = a; cambio = true; }
          if (b && p.b !== b) { p.b = b; cambio = true; }
        } else if (p.ronda === 1 && (!p.a || !p.b) && (p.a || p.b)) {
          p.estado = "fin"; p.bye = true; p.ganador = p.a ? "a" : "b"; p.ganadorId = p.a || p.b; cambio = true;
        } else if (p.ronda === 1 && !p.a && !p.b) {
          p.estado = "fin"; p.bye = true; p.ganadorId = null; cambio = true;
        }
      }
    }
  }
  function perdedor(p) { return p.bye ? null : p.ganador === "a" ? p.b : p.a; }

  /* ---------- rondas (monster, suizo, vidas) ---------- */
  function rondaActual(st) { return st.partidos.filter(p => p.fase === "ronda" && p.ronda === st.ronda); }
  function rondaTerminada(st) { const r = rondaActual(st); return r.length > 0 && r.every(p => p.estado === "fin"); }
  function rondasTotales(st) {
    if (st.config.rondas) return st.config.rondas;
    if (st.modo === "monster") return 5;
    if (st.modo === "suizo") return Math.max(3, Math.ceil(Math.log2(Math.max(2, st.parejas.length))));
    return null;
  }

  function puedeSiguienteRonda(st) {
    if (st.fase !== "juego" || st.modo === "ciegos") return false;
    if (st.ronda > 0 && !rondaTerminada(st)) return false;
    return true;
  }

  function siguienteRonda(st) {
    if (st.fase !== "juego") throw new Error("No se puede generar otra ronda ahora");
    if (st.ronda > 0 && !rondaTerminada(st)) throw new Error("Aún quedan partidos de esta ronda");
    if (st.modo === "vidas" && vivos(st).length <= 8) return empezarFinalVidas(st);
    const tot = rondasTotales(st);
    if (tot && st.ronda >= tot) { st.fase = "terminado"; return []; }
    st.ronda++;
    const ps = st.modo === "monster" ? rondaMonster(st) : st.modo === "suizo" ? rondaSuiza(st) : rondaVidas(st);
    ps.forEach((p, i) => { p.n = i + 1; st.partidos.push(p); });
    return ps;
  }

  // ---------- Monster DYP ----------
  function historialMonster(st) {
    const comp = {}, riv = {}, descansos = {};
    const k = (x, y) => x < y ? x + "|" + y : y + "|" + x;
    st.partidos.forEach(p => {
      if (p.fase !== "ronda" || p.bye) return;
      [p.a, p.b].forEach(l => { if (Array.isArray(l)) comp[k(l[0], l[1])] = (comp[k(l[0], l[1])] || 0) + 1; });
      if (Array.isArray(p.a) && Array.isArray(p.b)) p.a.forEach(x => p.b.forEach(y => (riv[k(x, y)] = (riv[k(x, y)] || 0) + 1)));
    });
    (st.descansos || []).forEach(d => d.ids.forEach(id => (descansos[id] = (descansos[id] || 0) + 1)));
    return { comp, riv, descansos, k };
  }

  function rondaMonster(st, ids) {
    const rand = azar(st);
    const h = historialMonster(st);
    let js = barajar(ids || activos(st).map(j => j.id), rand);
    const juegan = Math.floor(js.length / 4) * 4;
    // descansan los que menos han descansado (a igualdad, al azar)
    js.sort((x, y) => (h.descansos[x] || 0) - (h.descansos[y] || 0));
    const sobran = js.length - juegan;
    const descansan = js.slice(0, sobran), enJuego = js.slice(sobran);
    st.descansos = (st.descansos || []).concat(descansan.length ? [{ ronda: st.ronda, ids: descansan }] : []);
    // buscar el reparto que menos repite compañeros (y rivales)
    let mejor = null, mejorCoste = Infinity;
    for (let intento = 0; intento < 300 && mejorCoste > 0; intento++) {
      const o = barajar(enJuego, rand);
      let coste = 0;
      for (let i = 0; i < o.length; i += 4) {
        coste += 100 * ((h.comp[h.k(o[i], o[i + 1])] || 0) + (h.comp[h.k(o[i + 2], o[i + 3])] || 0));
        for (const x of [o[i], o[i + 1]]) for (const y of [o[i + 2], o[i + 3]]) coste += h.riv[h.k(x, y)] || 0;
      }
      if (coste < mejorCoste) { mejorCoste = coste; mejor = o; }
    }
    const ps = [];
    for (let i = 0; i < mejor.length; i += 4) ps.push(nuevoPartido({ ronda: st.ronda, a: [mejor[i], mejor[i + 1]], b: [mejor[i + 2], mejor[i + 3]] }));
    return ps;
  }

  // ---------- Suizo ----------
  function rondaSuiza(st) {
    const rand = azar(st);
    const tabla = clasificacion(st);
    const orden = st.ronda === 1 ? barajar(tabla.map(f => f.id), rand) : tabla.map(f => f.id);
    const jugados = new Set();
    st.partidos.forEach(p => { if (p.a && p.b) { jugados.add(p.a + "|" + p.b); jugados.add(p.b + "|" + p.a); } });
    const ps = [];
    let libres = orden.slice();
    // impar: descansa (y gana) el peor clasificado que aún no haya descansado
    if (libres.length % 2) {
      const yaDescanso = new Set(st.partidos.filter(p => p.bye).map(p => p.a));
      let idx = -1;
      for (let i = libres.length - 1; i >= 0; i--) if (!yaDescanso.has(libres[i])) { idx = i; break; }
      if (idx < 0) idx = libres.length - 1;
      const id = libres.splice(idx, 1)[0];
      ps.push(nuevoPartido({ ronda: st.ronda, a: id, b: null, bye: true, estado: "fin", ganador: "a", ganadorId: id, ra: null, rb: null }));
    }
    const emparejar = lista => {
      if (!lista.length) return [];
      const [x, ...resto] = lista;
      for (let i = 0; i < resto.length; i++) {
        if (jugados.has(x + "|" + resto[i])) continue;
        const sub = emparejar(resto.slice(0, i).concat(resto.slice(i + 1)));
        if (sub) return [[x, resto[i]]].concat(sub);
      }
      return null;
    };
    const pares = (libres.length <= 24 && emparejar(libres)) || (() => {   // si no hay forma sin repetir, se permite repetir
      const r = []; for (let i = 0; i < libres.length; i += 2) r.push([libres[i], libres[i + 1]]); return r;
    })();
    return pares.map(([a, b]) => nuevoPartido({ ronda: st.ronda, a, b })).concat(ps);
  }

  // ---------- Vidas (individual) ----------
  // Cada jugador empieza con N vidas. En cada ronda se sortean parejas y rivales entre los que siguen vivos
  // (como en el Monster DYP: sin repetir compañero si se puede; si sobran, descansan por turnos).
  // Perder quita una vida a los dos jugadores de la pareja.
  function vidasDe(st) {
    const v = {};
    activos(st).forEach(j => (v[j.id] = st.config.vidas));
    st.partidos.forEach(p => {
      if (p.fase !== "ronda" || p.estado !== "fin" || p.bye) return;
      const l = p.ganador === "a" ? p.b : p.a;
      (Array.isArray(l) ? l : []).forEach(id => (v[id] = Math.max(0, (v[id] || 0) - 1)));
    });
    return v;
  }
  function vivos(st) { const v = vidasDe(st); return activos(st).filter(j => v[j.id] > 0).map(j => j.id); }

  function rondaVidas(st) { return rondaMonster(st, vivos(st)); }

  // Quedan 8 o menos en pie: se sortean parejas entre ellos → semifinales y final. Sin repesca.
  // Si son impares, se queda fuera quien tenga menos vidas (a igualdad, por sorteo).
  // Con 6 jugadores (3 parejas) una pareja pasa directa a la final; con 4 o 5, final directa.
  function empezarFinalVidas(st) {
    const rand = azar(st);
    const v = vidasDe(st);
    let js = barajar(vivos(st), rand);
    st.fueraFinal = null;
    if (js.length % 2) {
      const menos = Math.min(...js.map(id => v[id]));
      const id = js.find(x => v[x] === menos);
      st.fueraFinal = id;
      js = js.filter(x => x !== id);
    }
    st.parejas = [];
    for (let i = 0; i < js.length; i += 2) st.parejas.push({ id: uid("p"), j1: js[i], j2: js[i + 1], final: true });
    st.fase = "final";
    generarCuadroKO(st, st.parejas.map(p => p.id), "final");
    return st.partidos.filter(p => p.fase === "final");
  }

  function difPartidas(st) {
    const d = {};
    st.partidos.forEach(p => {
      if (p.estado !== "fin" || p.bye || p.ra == null) return;
      d[p.a] = (d[p.a] || 0) + p.ra - p.rb; d[p.b] = (d[p.b] || 0) + p.rb - p.ra;
    });
    return d;
  }

  /* ---------- resultados ---------- */
  function registrarResultado(st, id, ra, rb) {
    const p = partido(st, id);
    if (!p || p.bye) throw new Error("Partido no disponible");
    if (!p.a || !p.b) throw new Error("Aún no se conocen los dos rivales");
    ra = Number(ra); rb = Number(rb);
    comprobarMarcador(st, ra, rb);
    if (p.estado === "fin" && !puedeEditar(st, id)) throw new Error("Ya se han jugado partidos que dependen de este resultado");
    p.ra = ra; p.rb = rb; p.ganador = ra > rb ? "a" : "b"; p.ganadorId = Array.isArray(p.a) ? null : p[p.ganador];
    p.estado = "fin"; p.fin = Date.now(); p.mesa = null;
    if (p.fase !== "ronda") { limpiarDespues(st, p); resolverKO(st); }
    actualizarFase(st);
    return p;
  }

  // Si se corrige un resultado de eliminatoria, los partidos siguientes (aún sin jugar) cambian de rival
  function limpiarDespues(st, p) {
    st.partidos.forEach(x => { if (x.estado !== "fin" && (x.fa === p.id || x.fb === p.id)) { if (x.fa === p.id) x.a = null; if (x.fb === p.id) x.b = null; } });
  }

  function puedeEditar(st, id) {
    const p = partido(st, id);
    if (!p || p.bye) return false;
    if (p.fase === "ronda") return p.ronda === st.ronda && st.fase === "juego";
    return !st.partidos.some(x => (x.fa === p.id || x.fb === p.id) && x.estado === "fin" && !x.bye);
  }

  function borrarResultado(st, id) {
    const p = partido(st, id);
    if (!puedeEditar(st, id) || p.estado !== "fin") throw new Error("Este resultado ya no se puede borrar");
    p.ra = p.rb = null; p.ganador = p.ganadorId = null; p.estado = "pendiente";
    if (p.fase !== "ronda") limpiarDespues(st, p);
    actualizarFase(st);
  }

  function actualizarFase(st) {
    if (st.fase === "inscripcion") return;
    if (st.ko) {
      const f = partido(st, st.ko.finalId);
      const tercero = st.partidos.find(p => p.tercer && p.fase === st.ko.fase);
      const fin = f && f.estado === "fin" && (!tercero || tercero.estado === "fin");
      if (fin) st.fase = "terminado";
      else st.fase = st.ko.fase === "final" ? "final" : "juego";
    } else if (st.fase === "terminado") st.fase = "juego";
  }

  /* ---------- clasificación ---------- */
  // Monster y vidas: por jugador. Suizo: por pareja. Ciegos: sin tabla (es un cuadro).
  function clasificacion(st) {
    const filas = {};
    const base = id => (filas[id] = filas[id] || { id, pj: 0, pg: 0, pp: 0, pf: 0, pc: 0, puntos: 0, descansos: 0, buchholz: 0 });
    if (individual(st)) activos(st).forEach(j => base(j.id));
    else st.parejas.forEach(p => base(p.id));
    const rivales = {};
    st.partidos.forEach(p => {
      if (p.fase !== "ronda" || p.estado !== "fin") return;
      if (p.bye) { const f = base(p.a); f.puntos += 1; f.descansos++; return; }
      const lados = [[p.a, p.ra, p.rb, p.ganador === "a", p.b], [p.b, p.rb, p.ra, p.ganador === "b", p.a]];
      lados.forEach(([lado, fav, con, gana, otro]) => {
        const ids = Array.isArray(lado) ? lado : [lado];
        ids.forEach(id => {
          const f = base(id);
          f.pj++; f.pf += fav; f.pc += con;
          if (gana) { f.pg++; f.puntos += 1; } else f.pp++;
          if (!Array.isArray(otro)) (rivales[id] = rivales[id] || []).push(otro);
        });
      });
    });
    (st.descansos || []).forEach(d => d.ids.forEach(id => { if (filas[id]) filas[id].descansos++; }));
    if (st.modo === "suizo") Object.values(filas).forEach(f => { f.buchholz = (rivales[f.id] || []).reduce((s, r) => s + ((filas[r] || {}).puntos || 0), 0); });
    if (st.modo === "vidas") { const v = vidasDe(st); Object.values(filas).forEach(f => (f.vidas = v[f.id])); }
    const lista = Object.values(filas);
    lista.sort((x, y) =>
      (st.modo === "vidas" ? (y.vidas - x.vidas) : 0) ||
      y.puntos - x.puntos ||
      (st.modo === "suizo" ? y.buchholz - x.buchholz : 0) ||
      (y.pf - y.pc) - (x.pf - x.pc) ||
      y.pf - x.pf ||
      (x.id < y.id ? -1 : 1));
    lista.forEach((f, i) => (f.pos = i + 1));
    return lista;
  }

  /* ---------- podio ---------- */
  // [{pos, ids:[jugadores], lado}]
  function podio(st) {
    if (st.fase !== "terminado") return [];
    if (st.ko) {
      const f = partido(st, st.ko.finalId);
      const res = [{ pos: 1, lado: f.ganadorId }, { pos: 2, lado: perdedor(f) }];
      const t = st.partidos.find(p => p.tercer && p.fase === st.ko.fase && p.estado === "fin");
      if (t) res.push({ pos: 3, lado: t.ganadorId }, { pos: 4, lado: perdedor(t) });
      else [f.fa, f.fb].forEach(id => { const s = partido(st, id); if (s && !s.bye && perdedor(s)) res.push({ pos: 3, lado: perdedor(s) }); });
      return res.map(r => Object.assign(r, { ids: jugadoresDe(st, r.lado) }));
    }
    return clasificacion(st).slice(0, 3).map(f => ({ pos: f.pos, lado: st.modo === "monster" ? [f.id] : f.id, ids: st.modo === "monster" ? [f.id] : jugadoresDe(st, f.id) }));
  }

  /* ---------- mesas ---------- */
  function pendientes(st) {
    return st.partidos.filter(p => p.estado !== "fin" && p.a && p.b)
      .sort((x, y) => (x.fase === "ronda" ? 0 : 1) - (y.fase === "ronda" ? 0 : 1) || (x.tercer ? 1 : 0) - (y.tercer ? 1 : 0) || x.ronda - y.ronda || x.n - y.n);
  }
  function enJuego(st, p) {
    const s = new Set();
    st.partidos.forEach(x => { if (x.estado === "mesa" && x !== p) jugadoresDe(st, x.a).concat(jugadoresDe(st, x.b)).forEach(id => s.add(id)); });
    return s;
  }
  function mesasLibres(st) {
    const usadas = new Set(st.partidos.filter(p => p.estado === "mesa").map(p => p.mesa));
    const r = [];
    for (let m = 1; m <= st.config.mesas; m++) if (!usadas.has(m)) r.push(m);
    return r;
  }
  function asignarMesas(st) {
    const libres = mesasLibres(st), llamados = [];
    for (const p of pendientes(st)) {
      if (!libres.length) break;
      if (p.estado !== "pendiente") continue;
      const ocup = enJuego(st, p);
      if (jugadoresDe(st, p.a).concat(jugadoresDe(st, p.b)).some(id => ocup.has(id))) continue;
      p.estado = "mesa"; p.mesa = libres.shift(); p.llamado = Date.now();
      llamados.push(p);
    }
    return llamados;
  }
  function soltar(st, id) { const p = partido(st, id); if (p && p.estado === "mesa") { p.estado = "pendiente"; p.mesa = null; } }

  /* ---------- nombres ---------- */
  function nombreRondaKO(st, p) {
    if (p.tercer) return "3er puesto";
    const R = (st.ko || {}).rondas || 1, faltan = R - p.ronda;
    return faltan === 0 ? "Final" : faltan === 1 ? "Semifinal" : faltan === 2 ? "Cuartos" : faltan === 3 ? "Octavos" : `Ronda ${p.ronda}`;
  }
  function nombrePartido(st, p) {
    if (p.fase === "ronda") return `Ronda ${p.ronda}`;
    return nombreRondaKO(st, p);
  }

  return {
    MODOS, rng, barajar, uid, ordenSiembra, potencia2,
    nuevoTorneo, añadirJugador, añadirPareja, jugador, pareja, partido, activos, porParejas, parejasFijas, individual,
    nombreJugador, nombreLado, jugadoresDe, textoFormato, marcadoresPosibles, comprobarMarcador,
    sortearParejas, empezar, siguienteRonda, puedeSiguienteRonda, rondaActual, rondaTerminada, rondasTotales,
    vidasDe, vivos, registrarResultado, borrarResultado, puedeEditar, clasificacion, podio,
    pendientes, mesasLibres, asignarMesas, soltar, nombrePartido, nombreRondaKO
  };
});
