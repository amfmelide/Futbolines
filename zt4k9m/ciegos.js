/* ==============================================================
   CIEGOS · motor de torneos pequeños a sorteo (AMF Melide)
   Modos:
     ciegos  → cada jugador se apunta solo, se sortean las parejas y eliminatoria directa
     monster → Monster DYP: cada ronda un compañero distinto, clasificación individual
     suizo   → sistema suizo por parejas (a sorteo o fijas), N rondas
     vidas   → individual y sin rondas fijas: cada jugador tiene 3 vidas; en cuanto hay 4 libres se sortean
               parejas y rivales entre ellos y juegan ya; cada derrota quita una vida a los dos;
               con 8 en pie (nunca menos): 4 parejas a sorteo, semifinales y, con los 4 ganadores, nuevo sorteo de parejas para la final
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
    monster: { nombre: "Monster DYP", texto: "Cada ronda un compañero distinto · clasificación individual", partidas: { tipo: "al", partidas: 2, goles: 7 } },
    suizo: { nombre: "Suizo", texto: "Rondas emparejando a quien va igual en la clasificación", partidas: { tipo: "al", partidas: 2, goles: 7 } },
    vidas: { nombre: "Vidas", texto: "Cada jugador 3 vidas · pareja a sorteo en cada ronda · al final, semifinales y final", partidas: { tipo: "al", partidas: 2, goles: 7 } }
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
    if (st.modo === "vidas") return 8;
    return 2;
  }

  // Empieza el torneo. Devuelve las parejas sorteadas (si las hay) para enseñarlas en directo.
  function empezar(st) {
    if (st.fase !== "inscripcion") throw new Error("El torneo ya ha empezado");
    if (individual(st)) {
      if (activos(st).length < minimo(st)) throw new Error(`Hacen falta al menos ${minimo(st)} jugadores`);
    } else {
      if (parejasFijas(st)) {
        st.parejas = st.parejas.filter(p => !(jugador(st, p.j1) || {}).baja && !(jugador(st, p.j2) || {}).baja);
      } else sortearParejas(st);
      if (st.parejas.length < minimo(st)) throw new Error(`Hacen falta al menos ${minimo(st)} parejas`);
    }
    st.fase = "juego";
    if (st.modo === "ciegos") generarCuadroKO(st, st.parejas.map(p => p.id), "ko");
    else if (st.modo === "vidas") sortearVidas(st);       // rondas 1 y 2 (o, con 8 justos, directo a semifinales)
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
        if (p.sorteo) { if (!p.a && sortearFinal(st, p)) cambio = true; continue; }
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

  // Vidas: al acabar las dos semifinales, los 4 ganadores se vuelven a sortear en 2 parejas nuevas para la final.
  // Cada pareja nueva junta a uno de cada semifinal, así nadie repite compañero.
  function sortearFinal(st, p) {
    const sa = partido(st, p.fa), sb = partido(st, p.fb);
    if (!sa || !sb || sa.estado !== "fin" || sb.estado !== "fin") return false;
    const rand = azar(st);
    const ga = barajar(jugadoresDe(st, sa.ganadorId), rand), gb = barajar(jugadoresDe(st, sb.ganadorId), rand);
    if (ga.length < 2 || gb.length < 2) return false;
    const n1 = { id: uid("p"), j1: ga[0], j2: gb[0], final: true, deFinal: true };
    const n2 = { id: uid("p"), j1: ga[1], j2: gb[1], final: true, deFinal: true };
    st.parejas.push(n1, n2);
    p.a = n1.id; p.b = n2.id;
    return true;
  }

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
    if (st.modo === "vidas") return estadoVidas(st).listaFinal;
    if (st.ronda > 0 && !rondaTerminada(st)) return false;
    return true;
  }

  function siguienteRonda(st) {
    if (st.fase !== "juego") throw new Error("No se puede generar otra ronda ahora");
    if (st.modo === "vidas") return sortearVidas(st);
    if (st.ronda > 0 && !rondaTerminada(st)) throw new Error("Aún quedan partidos de esta ronda");
    const tot = rondasTotales(st);
    if (tot && st.ronda >= tot) { st.fase = "terminado"; return []; }
    st.ronda++;
    const ps = st.modo === "monster" ? rondaMonster(st) : rondaSuiza(st);
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

  // ---------- Vidas (individual, por rondas sorteadas por adelantado) ----------
  // Cada jugador empieza con N vidas. Hay rondas de verdad: al empezar se sortean la 1 y la 2, y cada vez que
  // acaba una ronda se sortea la siguiente (siempre hay una por delante). Un partido de la ronda k se puede
  // jugar en cuanto sus 4 jugadores han terminado lo suyo de las rondas anteriores («listo», en verde).
  // Perder quita una vida a los dos jugadores de la pareja. Nunca se baja de 8 en pie: con 8, semifinales.
  const FINALISTAS = 8;

  function vidasDe(st) {
    const v = {};
    activos(st).forEach(j => (v[j.id] = st.config.vidas));
    st.partidos.forEach(p => {
      if (p.fase !== "ronda" || p.estado !== "fin" || p.bye) return;
      const l = p.ganador === "a" ? p.b : p.a;
      (Array.isArray(l) ? l : []).forEach(id => { if (!(p.salvados || []).includes(id)) v[id] = Math.max(0, (v[id] || 0) - 1); });
    });
    return v;
  }
  function vivos(st) { const v = vidasDe(st); return activos(st).filter(j => v[j.id] > 0).map(j => j.id); }

  // Lo que un partido puede eliminar como mucho: los jugadores con 1 vida del lado que pierda
  function riesgo(v, a, b) {
    const unos = l => l.filter(id => v[id] === 1).length;
    return Math.max(unos(a), unos(b));
  }
  const cuatroDe = p => p.a.concat(p.b);

  // Mejor forma de repartir 4 jugadores en 2 parejas: sin repetir compañero (ni rival) y con el menor riesgo
  function repartir(cuatro, v, h, maxRiesgo) {
    const c = cuatro;
    let mejor = null, coste = Infinity;
    [[[c[0], c[1]], [c[2], c[3]]], [[c[0], c[2]], [c[1], c[3]]], [[c[0], c[3]], [c[1], c[2]]]].forEach(([a, b]) => {
      const w = riesgo(v, a, b);
      if (maxRiesgo != null && w > maxRiesgo) return;
      let x = 100 * ((h.comp[h.k(a[0], a[1])] || 0) + (h.comp[h.k(b[0], b[1])] || 0)) + 10 * w;
      a.forEach(p => b.forEach(q => (x += h.riv[h.k(p, q)] || 0)));
      if (x < coste) { coste = x; mejor = { a, b, w }; }
    });
    return mejor;
  }

  // Agrupa jugadores de 4 en 4 (los que sobran descansan): sin repetir compañeros si se puede
  function agrupar(st, ids, v, rand) {
    const h = historialMonster(st);
    const juegan = Math.floor(ids.length / 4) * 4;
    let mejor = null, mejorCoste = Infinity;
    for (let intento = 0; intento < 300 && mejorCoste > 0; intento++) {
      const o = barajar(ids.slice(0, juegan), rand);
      let coste = 0;
      const grupos = [];
      for (let i = 0; i < o.length; i += 4) {
        const r = repartir(o.slice(i, i + 4), v, h);
        coste += 100 * ((h.comp[h.k(r.a[0], r.a[1])] || 0) + (h.comp[h.k(r.b[0], r.b[1])] || 0));
        r.a.forEach(x => r.b.forEach(y => (coste += h.riv[h.k(x, y)] || 0)));
        grupos.push(r);
      }
      if (coste < mejorCoste) { mejorCoste = coste; mejor = grupos; }
    }
    return { grupos: mejor || [], descansan: ids.slice(juegan) };
  }

  // Sortea la ronda siguiente con los que siguen vivos. Descansan (si no son múltiplo de 4) los que menos han descansado.
  function generarRondaVidas(st) {
    const rand = azar(st);
    const v = vidasDe(st);
    const desc = {};
    (st.descansos || []).forEach(d => d.ids.forEach(id => (desc[id] = (desc[id] || 0) + 1)));
    const pj = partidosAsignados(st);
    // juegan primero los que menos partidos llevan (contando los ya sorteados); a igualdad, los que más han descansado
    const ids = barajar(vivos(st), rand).sort((x, y) => (pj[x] || 0) - (pj[y] || 0) || (desc[y] || 0) - (desc[x] || 0));
    const r = ++st.ronda;
    const { grupos, descansan } = agrupar(st, ids, v, rand);
    if (descansan.length) st.descansos = (st.descansos || []).concat([{ ronda: r, ids: descansan }]);
    const total = st.partidos.filter(p => p.fase === "ronda").length;
    return grupos.map((g, i) => { const p = nuevoPartido({ ronda: r, n: total + i + 1, a: g.a, b: g.b }); st.partidos.push(p); return p; });
  }

  // Partidos de cada jugador (jugados o en mesa; cuentan para la equidad)
  function partidosJugados(st) {
    const pj = {};
    st.partidos.forEach(p => { if (p.fase === "ronda" && !p.bye && p.estado !== "pendiente") cuatroDe(p).forEach(id => (pj[id] = (pj[id] || 0) + 1)); });
    return pj;
  }

  // Partidos de cada jugador contando también los ya sorteados sin jugar (para decidir quién descansa)
  function partidosAsignados(st) {
    const pj = {};
    st.partidos.forEach(p => { if (p.fase === "ronda" && !p.bye) cuatroDe(p).forEach(id => (pj[id] = (pj[id] || 0) + 1)); });
    return pj;
  }
  // Ordena jugadores: primero los que menos partidos llevan (así, si sobran, descansan los que más llevan)
  function porMenosPartidos(st, ids, rand) {
    const pj = partidosAsignados(st);
    return barajar(ids, rand).sort((x, y) => (pj[x] || 0) - (pj[y] || 0));
  }

  // Si alguien cae eliminado y ya estaba sorteado en una ronda siguiente, se rehacen sólo esos partidos
  // (con los demás de esos partidos y los que descansaban en esa ronda).
  function repararVidas(st) {
    const v = vidasDe(st);
    const rand = azar(st);
    let cambio = false;
    for (let k = 1; k <= st.ronda; k++) {
      const rotos = st.partidos.filter(p => p.fase === "ronda" && p.ronda === k && p.estado === "pendiente" && cuatroDe(p).some(id => !(v[id] > 0)));
      if (!rotos.length) continue;
      cambio = true;
      const d = (st.descansos || []).find(x => x.ronda === k);
      const bolsa = rotos.flatMap(cuatroDe).concat(d ? d.ids : []).filter(id => v[id] > 0);
      st.partidos = st.partidos.filter(p => !rotos.includes(p));
      st.descansos = (st.descansos || []).filter(x => x.ronda !== k);
      const { grupos, descansan } = agrupar(st, porMenosPartidos(st, bolsa, rand), v, rand);
      if (descansan.length) st.descansos.push({ ronda: k, ids: descansan });
      grupos.forEach(g => st.partidos.push(nuevoPartido({ ronda: k, n: 0, a: g.a, b: g.b, rehecho: true })));
    }
    if (cambio) st.partidos.filter(p => p.fase === "ronda").forEach((p, i) => (p.n = i + 1));
    return cambio;
  }

  // ¿Qué jugadores tienen todavía algo sin terminar de antes de la ronda k?
  function ocupadosAntes(st, k, excepto) {
    const s = new Set();
    st.partidos.forEach(p => { if (p.fase === "ronda" && p !== excepto && p.estado !== "fin" && (p.ronda < k || p.estado === "mesa")) cuatroDe(p).forEach(id => s.add(id)); });
    return s;
  }

  /* ---- Llegar a 8 justos: qué situaciones tienen salida ----
     Una situación son las vidas de los que siguen en pie (cuántos tienen 1, 2 y 3+ vidas).
     «Ganable» = hay una forma de seguir jugando que, gane quien gane cada partido, termina con 8 justos.
     Se calcula una vez (memoria) y sirve para no meterse nunca en un callejón sin salida
     (p. ej. 9 en pie con 1 vida cada uno: cualquier partido dejaría 7). */
  const MEMO_GANABLE = new Map();
  function ganable(c1, c2, c3) {
    const A = c1 + c2 + c3;
    if (A < FINALISTAS) return false;
    if (A === FINALISTAS) return true;
    const clave = c1 + "," + c2 + "," + c3;
    if (MEMO_GANABLE.has(clave)) return MEMO_GANABLE.get(clave);
    MEMO_GANABLE.set(clave, false);                 // (la recursión siempre baja: cada partido quita 2 vidas)
    const c = [0, c1, c2, c3];
    const pares = [[1, 1], [1, 2], [1, 3], [2, 2], [2, 3], [3, 3]];
    const pierden = (cc, par) => { const n = cc.slice(); par.forEach(t => { n[t]--; if (t > 1) n[t - 1]++; }); return n; };
    let ok = false;
    for (const pa of pares) {
      for (const pb of pares) {
        const usa = [0, 0, 0, 0];
        pa.concat(pb).forEach(t => usa[t]++);
        if (usa[1] > c[1] || usa[2] > c[2] || usa[3] > c[3]) continue;
        const x = pierden(c, pa), y = pierden(c, pb);
        if (ganable(x[1], x[2], x[3]) && ganable(y[1], y[2], y[3])) { ok = true; break; }
      }
      if (ok) break;
    }
    MEMO_GANABLE.set(clave, ok);
    return ok;
  }
  // tipo de vida para el cálculo: 1, 2 o 3 (3 o más cuentan como 3)
  const tipo = n => Math.min(3, n);
  function cuentas(v, ids) { const c = [0, 0, 0, 0]; ids.forEach(id => { if (v[id] > 0) c[tipo(v[id])]++; }); return c; }

  // ¿Se pueden jugar a la vez estos partidos sin arriesgar llegar a 8 justos, gane quien gane cada uno?
  function seguros(v, vivosIds, partidos) {
    const base = cuentas(v, vivosIds);
    const m = partidos.length;
    for (let mask = 0; mask < (1 << m); mask++) {
      const c = base.slice();
      partidos.forEach((p, i) => {
        const perdedores = (mask >> i) & 1 ? p.a : p.b;
        perdedores.forEach(id => { const t = tipo(v[id]); c[t]--; if (v[id] - 1 > 0) c[tipo(v[id] - 1)]++; });
      });
      const A = c[1] + c[2] + c[3];
      if (A < FINALISTAS) return false;
      if (A > FINALISTAS && !ganable(c[1], c[2], c[3])) return false;
    }
    return true;
  }
  // De las 3 formas de emparejar a 4 jugadores, la mejor que sea segura junto a los partidos dados (o null)
  function repartoSeguro(cuatro, v, h, vivosIds, enJuego) {
    const c = cuatro;
    let mejor = null, coste = Infinity;
    [[[c[0], c[1]], [c[2], c[3]]], [[c[0], c[2]], [c[1], c[3]]], [[c[0], c[3]], [c[1], c[2]]]].forEach(([a, b]) => {
      if (!seguros(v, vivosIds, enJuego.concat([{ a, b }]))) return;
      let x = 100 * ((h.comp[h.k(a[0], a[1])] || 0) + (h.comp[h.k(b[0], b[1])] || 0));
      a.forEach(p => b.forEach(q => (x += h.riv[h.k(p, q)] || 0)));
      if (x < coste) { coste = x; mejor = { a, b, w: riesgo(v, a, b) }; }
    });
    return mejor;
  }
  // Forma partidos seguros con unos jugadores (por orden de prioridad), probando combinaciones (no al azar)
  function formarSeguros(st, pool, v, h, vivosIds, enJuego) {
    const jugadas = partidosJugados(st);
    let resto = pool.slice().sort((x, y) => (jugadas[x] || 0) - (jugadas[y] || 0));
    const grupos = [], juego = enJuego.slice();
    for (;;) {
      if (resto.length < 4) break;
      const n = Math.min(resto.length, 16);
      let elegido = null, mejorCoste = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
        const r = repartoSeguro([resto[i], resto[j], resto[k], resto[l]], v, h, vivosIds, juego);
        if (!r) continue;
        const coste = i + j + k + l + 0.01 * (h.comp[h.k(r.a[0], r.a[1])] || 0);   // prioridad a los que menos han jugado
        if (coste < mejorCoste) { mejorCoste = coste; elegido = r; }
      }
      if (!elegido) break;
      grupos.push(elegido); juego.push(elegido);
      const usados = elegido.a.concat(elegido.b);
      resto = resto.filter(id => !usados.includes(id));
    }
    return { grupos, resto };
  }

  // Estado de cada partido sin jugar de Vidas:
  //   "lista"   → sus 4 jugadores están libres y es seguro jugarlo ya (verde: se puede llamar)
  //   "espera"  → alguno aún juega una ronda anterior (esperan: [ids])
  //   "riesgo"  → están libres, pero ahora podría impedir llegar a 8 justos: espera a que acaben otros partidos
  // holgura: 0 = sólo partidos de jugadores que van con el mínimo de partidos; 1 = hasta 1 por delante; 9 = sin límite
  function estadosVidas(st, holgura, sinRelajar) {
    holgura = holgura || 0;
    const v = vidasDe(st);
    const vivosIds = activos(st).filter(j => v[j.id] > 0).map(j => j.id);
    const enJuego = st.partidos.filter(p => p.fase === "ronda" && p.estado === "mesa").map(p => ({ a: p.a, b: p.b }));
    const h = historialMonster(st);
    const res = {};
    const sin = st.partidos.filter(p => p.fase === "ronda" && p.estado === "pendiente").sort((x, y) => x.ronda - y.ronda || x.n - y.n);
    const libres = [];
    sin.forEach(p => {
      const ocup = ocupadosAntes(st, p.ronda, p);
      const esperan = cuatroDe(p).filter(id => ocup.has(id));
      if (esperan.length) { res[p.id] = { estado: "espera", esperan }; return; }
      libres.push(p);
    });
    let algunaLista = false;
    // Equidad: un partido sólo se pone en verde si ninguno de sus jugadores va ya por delante del que menos partidos lleva
    const pj = partidosJugados(st);
    const minPj = Math.min(...vivosIds.map(id => pj[id] || 0));
    libres.forEach(p => {
      if (cuatroDe(p).some(id => (pj[id] || 0) > minPj + holgura)) {
        const adelantados = cuatroDe(p).filter(id => (pj[id] || 0) > minPj + holgura);
        res[p.id] = { estado: "espera", esperan: [], equidad: true, adelantados };
        return;
      }
      if (seguros(v, vivosIds, enJuego.concat([{ a: p.a, b: p.b }]))) { res[p.id] = { estado: "lista", riesgo: riesgo(v, p.a, p.b) }; enJuego.push({ a: p.a, b: p.b }); algunaLista = true; return; }
      const otro = repartoSeguro(cuatroDe(p), v, h, vivosIds, enJuego);
      if (otro) { res[p.id] = { estado: "lista", riesgo: otro.w, reparto: otro }; enJuego.push(otro); algunaLista = true; }
      else res[p.id] = { estado: "riesgo", riesgo: riesgo(v, p.a, p.b) };
    });
    // Sin salida posible (sólo si se empezó ya en un callejón, p. ej. 9 jugadores con 1 vida): se deja jugar
    // el de menos riesgo y, si caen dos, uno se salva por sorteo para quedar 8.
    const enMesa = st.partidos.some(p => p.fase === "ronda" && p.estado === "mesa");
    // si por la equidad no queda nada que jugar (ni en mesa), se relaja para no atascar
    if (!sinRelajar && holgura < 9 && !algunaLista && !enMesa && Object.values(res).some(e => e.equidad)) return estadosVidas(st, holgura === 0 ? 1 : 9);
    const c = cuentas(v, vivosIds);
    if (!algunaLista && !enMesa && vivosIds.length > FINALISTAS && !ganable(c[1], c[2], c[3])) {
      const cand = libres.filter(p => res[p.id].estado === "riesgo");
      if (cand.length) {
        const p = cand.map(x => ({ x, r: repartir(cuatroDe(x), v, h) })).sort((m, n) => m.r.w - n.r.w)[0];
        res[p.x.id] = { estado: "lista", riesgo: p.r.w, reparto: p.r, forzado: true };
      }
    }
    return res;
  }

  // Llama a mesa un partido «listo» (si hace falta, reajusta las parejas de esos 4)
  function llamarVidas(st, id, mesa) {
    const p = partido(st, id);
    const e = estadosVidas(st)[id];
    if (!e || e.estado !== "lista") throw new Error(e && e.estado === "espera" ? "Aún hay jugadores de este partido jugando la ronda anterior" : "Este partido aún no se puede jugar");
    if (e.reparto) { p.a = e.reparto.a; p.b = e.reparto.b; p.reajustado = true; }
    p.estado = "mesa"; p.mesa = mesa; p.llamado = Date.now();
    return p;
  }

  // Últimas jornadas: los partidos sin empezar que ahora no se pueden jugar («riesgo») se recolocan con los
  // jugadores libres de esa ronda para formar partidos que mantengan la salida a 8 justos.
  function reajustarVidas(st) {
    const est = estadosVidas(st);
    const enRiesgo = st.partidos.filter(p => (est[p.id] || {}).estado === "riesgo");
    if (!enRiesgo.length) return false;
    const v = vidasDe(st), h = historialMonster(st);
    const vivosIds = vivos(st);
    const enJuego = st.partidos.filter(p => p.fase === "ronda" && (p.estado === "mesa" || (est[p.id] || {}).estado === "lista"))
      .map(p => (est[p.id] || {}).reparto || { a: p.a, b: p.b });
    for (const k of [...new Set(enRiesgo.map(p => p.ronda))].sort((x, y) => x - y)) {
      const libresK = enRiesgo.filter(p => p.ronda === k);
      const { grupos, resto } = formarSeguros(st, libresK.flatMap(cuatroDe), v, h, vivosIds, enJuego);
      if (!grupos.length) continue;
      // los que no caben en un partido seguro se quedan en partidos de espera (con el reparto de menos riesgo)
      const otros = agrupar(st, porMenosPartidos(st, resto, azar(st)), v, azar(st));
      st.partidos = st.partidos.filter(p => !libresK.includes(p));
      grupos.concat(otros.grupos).forEach(g => st.partidos.push(nuevoPartido({ ronda: k, n: 0, a: g.a, b: g.b, rehecho: true })));
      if (otros.descansan.length) {
        const d = (st.descansos || []).find(x => x.ronda === k);
        if (d) d.ids = d.ids.concat(otros.descansan); else st.descansos = (st.descansos || []).concat([{ ronda: k, ids: otros.descansan }]);
      }
      st.partidos.filter(p => p.fase === "ronda").forEach((p, i) => (p.n = i + 1));
      return true;
    }
    return false;
  }

  // Si nadie está jugando y no hay ningún partido listo, se vuelve a sortear todo lo pendiente con los vivos
  // buscando partidos que mantengan la salida a 8 justos.
  function desatascarVidas(st) {
    const est = estadosVidas(st, 1, true);           // con la equidad (hasta 1 partido de diferencia)
    const enMesa = st.partidos.some(p => p.fase === "ronda" && p.estado === "mesa");
    const hayLista = Object.values(est).some(e => e.estado === "lista" && !e.forzado);
    if (enMesa || hayLista) return false;
    const pend = st.partidos.filter(p => p.fase === "ronda" && p.estado === "pendiente");
    if (!pend.length) return false;
    const v = vidasDe(st), h = historialMonster(st);
    const ids = vivos(st);
    const { grupos, resto } = formarSeguros(st, ids, v, h, ids, []);
    if (!grupos.length) return false;               // sin salida: se jugará el de menos riesgo (salvado por sorteo)
    const k = Math.min(...pend.map(p => p.ronda));
    st.partidos = st.partidos.filter(p => !pend.includes(p));
    st.descansos = (st.descansos || []).filter(d => d.ronda < k);
    st.ronda = k;
    if (resto.length) st.descansos.push({ ronda: k, ids: resto });
    grupos.forEach(g => st.partidos.push(nuevoPartido({ ronda: k, n: 0, a: g.a, b: g.b, rehecho: true })));
    st.partidos.filter(p => p.fase === "ronda").forEach((p, i) => (p.n = i + 1));
    return true;
  }

  // Después de cada resultado: rehace lo que haga falta, sortea la ronda siguiente si toca y, con 8 en pie, la fase final.
  // Devuelve los partidos nuevos.
  function sortearVidas(st) {
    if (st.fase !== "juego") return [];
    repararVidas(st);
    if (vivos(st).length <= FINALISTAS) {
      st.partidos = st.partidos.filter(p => !(p.fase === "ronda" && p.estado === "pendiente"));   // ya no hacen falta
      return st.partidos.some(p => p.fase === "ronda" && p.estado === "mesa") ? [] : empezarFinalVidas(st);
    }
    reajustarVidas(st);
    desatascarVidas(st);
    // siempre una ronda por delante de la más baja que aún tiene partidos sin terminar
    const abiertas = st.partidos.filter(p => p.fase === "ronda" && p.estado !== "fin").map(p => p.ronda);
    const rMin = abiertas.length ? Math.min(...abiertas) : st.ronda + 1;
    const nuevos = [];
    let guard = 0;
    while (st.ronda < rMin + 1 && guard++ < 3) nuevos.push(...generarRondaVidas(st));
    return nuevos;
  }

  // Compatibilidad con el panel: estado general
  function estadoVidas(st) {
    const v = vidasDe(st), vivosIds = activos(st).filter(j => v[j.id] > 0).map(j => j.id);
    const est = estadosVidas(st);
    const listas = Object.keys(est).filter(id => est[id].estado === "lista");
    const enMesa = st.partidos.filter(p => p.fase === "ronda" && p.estado === "mesa");
    const fin = vivosIds.length <= FINALISTAS;
    return { vidas: v, vivos: vivosIds, estados: est, listas, enMesa, fin, listaFinal: fin && !enMesa.length, libres: [] };
  }

  // Tablero de vidas: cada jugador con sus vidas y qué está haciendo
  function tableroVidas(st) {
    const v = vidasDe(st), t = {};
    clasificacion(st).forEach(f => (t[f.id] = f));
    const est = st.fase === "juego" ? estadosVidas(st) : {};
    const info = {};
    st.partidos.filter(p => p.fase === "ronda" && p.estado !== "fin").sort((x, y) => x.ronda - y.ronda).forEach(p => cuatroDe(p).forEach(id => {
      if (info[id]) return;
      info[id] = p.estado === "mesa" ? { estado: "mesa", mesa: p.mesa, ronda: p.ronda } : { estado: (est[p.id] || {}).estado === "lista" ? "lista" : "espera", ronda: p.ronda };
    }));
    const enFinal = new Set();
    if (st.ko) st.parejas.forEach(p => { enFinal.add(p.j1); enFinal.add(p.j2); });
    return activos(st).map(j => {
      const f = t[j.id] || {};
      let i = info[j.id] || {};
      let estado = i.estado || "descansa";
      if (st.fase === "final" || st.fase === "terminado") estado = enFinal.has(j.id) ? "final" : "eliminado";
      else if (!(v[j.id] > 0)) estado = "eliminado";
      return { id: j.id, nombre: j.nombre, vidas: v[j.id], estado, mesa: i.mesa || null, ronda: i.ronda || null, pj: f.pj || 0, pg: f.pg || 0, pp: f.pp || 0 };
    }).sort((x, y) => (y.vidas > 0) - (x.vidas > 0) || y.vidas - x.vidas || y.pg - x.pg || x.nombre.localeCompare(y.nombre));
  }

  // Quedan 8 en pie: se sortean 4 parejas entre ellos (da igual las vidas) → semifinales. Los 4 ganadores se sortean otra vez para la final. Sin repesca.
  function empezarFinalVidas(st) {
    const rand = azar(st);
    const js = barajar(vivos(st), rand);
    st.parejas = [];
    for (let i = 0; i + 1 < js.length; i += 2) st.parejas.push({ id: uid("p"), j1: js[i], j2: js[i + 1], final: true });
    st.fase = "final";
    generarCuadroKO(st, st.parejas.map(p => p.id), "final");
    const f = partido(st, st.ko.finalId);
    if (f && f.fa && f.fb) { f.sorteo = true; f.a = f.b = null; }      // la final se sortea otra vez al acabar las semifinales
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
    if (st.modo === "vidas" && p.fase === "ronda" && p.estado === "pendiente") {
      const e = estadosVidas(st)[p.id];
      if (e && e.estado === "espera") throw new Error("Aún hay jugadores de este partido jugando la ronda anterior");
      if (e && e.estado === "riesgo") throw new Error("Este partido podría dejar a menos de 8 en pie: espera a que acaben los de las mesas");
      if (e && e.reparto) { p.a = e.reparto.a; p.b = e.reparto.b; }
    }
    p.ra = ra; p.rb = rb; p.ganador = ra > rb ? "a" : "b"; p.ganadorId = Array.isArray(p.a) ? null : p[p.ganador];
    p.estado = "fin"; p.fin = Date.now(); p.mesa = null;
    if (st.modo === "vidas" && p.fase === "ronda") salvarHastaOcho(st, p);
    if (p.fase !== "ronda") { limpiarDespues(st, p); resolverKO(st); }
    actualizarFase(st);
    return p;
  }

  // Vidas: nunca se baja de 8 en pie. Si un resultado dejaría menos (sólo en un atasco), se salva por sorteo
  // a los justos de los que acaban de perder su última vida.
  function salvarHastaOcho(st, p) {
    p.salvados = [];
    const v = vidasDe(st);
    const quedan = activos(st).filter(j => v[j.id] > 0).length;
    if (quedan >= FINALISTAS) return;
    const caen = (p.ganador === "a" ? p.b : p.a).filter(id => v[id] === 0);
    p.salvados = barajar(caen, azar(st)).slice(0, FINALISTAS - quedan);
  }

  // Si se corrige un resultado de eliminatoria, los partidos siguientes (aún sin jugar) cambian de rival
  function limpiarDespues(st, p) {
    st.partidos.forEach(x => {
      if (x.estado === "fin" || !x.sorteo || (x.fa !== p.id && x.fb !== p.id)) return;
      st.parejas = st.parejas.filter(q => !(q.deFinal && (q.id === x.a || q.id === x.b)));   // se vuelve a sortear
      x.a = x.b = null;
    });
    st.partidos.forEach(x => { if (x.sorteo) return; if (x.estado !== "fin" && (x.fa === p.id || x.fb === p.id)) { if (x.fa === p.id) x.a = null; if (x.fb === p.id) x.b = null; } });
  }

  function puedeEditar(st, id) {
    const p = partido(st, id);
    if (!p || p.bye) return false;
    if (p.fase === "ronda" && st.modo === "vidas") {
      // se puede corregir mientras ninguno de los 4 haya empezado un partido de una ronda posterior
      if (st.fase !== "juego") return false;
      const ids = cuatroDe(p);
      return !st.partidos.some(x => x.fase === "ronda" && x.ronda > p.ronda && x.estado !== "pendiente" && cuatroDe(x).some(id => ids.includes(id)));
    }
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
    if (st.modo === "vidas" && st.fase === "juego") {
      for (let k = 0; k < 50 && libres.length; k++) {
        const est = estadosVidas(st);
        const p = st.partidos.filter(x => (est[x.id] || {}).estado === "lista").sort((x, y) => x.ronda - y.ronda || x.n - y.n)[0];
        if (!p) break;
        llamados.push(llamarVidas(st, p.id, libres.shift()));
      }
      return llamados;
    }
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

  /* ---------- rondas para enseñar ---------- */
  // En Vidas no hay rondas de verdad: la ronda de un partido es el nº de partido de sus jugadores.
  function rondaDe(st, p) { return p.ronda; }
  function rondasVista(st) {
    const m = {};
    st.partidos.forEach(p => { if (p.fase === "ronda") (m[rondaDe(st, p)] = m[rondaDe(st, p)] || []).push(p); });
    return Object.keys(m).map(Number).sort((a, b) => a - b).map(n => ({ n, partidos: m[n].sort((x, y) => (x.bye ? 1 : 0) - (y.bye ? 1 : 0) || x.n - y.n) }));
  }

  /* ---------- nombres ---------- */
  function nombreRondaKO(st, p) {
    if (p.tercer) return "3er puesto";
    const R = (st.ko || {}).rondas || 1, faltan = R - p.ronda;
    return faltan === 0 ? "Final" : faltan === 1 ? "Semifinal" : faltan === 2 ? "Cuartos" : faltan === 3 ? "Octavos" : `Ronda ${p.ronda}`;
  }
  function nombrePartido(st, p) {
    if (p.fase === "ronda") return st.modo === "vidas" ? `Ronda ${p.ronda} · partido ${p.n}` : `Ronda ${p.ronda}`;
    return nombreRondaKO(st, p);
  }

  return {
    MODOS, rng, barajar, uid, ordenSiembra, potencia2,
    nuevoTorneo, añadirJugador, añadirPareja, jugador, pareja, partido, activos, porParejas, parejasFijas, individual,
    nombreJugador, nombreLado, jugadoresDe, textoFormato, marcadoresPosibles, comprobarMarcador,
    sortearParejas, empezar, siguienteRonda, puedeSiguienteRonda, rondaActual, rondaTerminada, rondasTotales,
    vidasDe, vivos, ganable, estadoVidas, estadosVidas, llamarVidas, sortearVidas, tableroVidas, registrarResultado, borrarResultado, puedeEditar, clasificacion, podio,
    rondaDe, rondasVista, pendientes, mesasLibres, asignarMesas, soltar, nombrePartido, nombreRondaKO
  };
});
