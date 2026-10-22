/* ==============================================================
   CIEGOS · pintado compartido (panel y web pública)
   ============================================================== */
(function () {
  "use strict";
  const E = window.CiegosEngine;
  const { esc } = window.TC;

  const lado = (st, l) => esc(E.nombreLado(st, l));
  const hace = ts => window.TC.hace(ts);

  function htmlMesas(st) {
    const enMesa = st.partidos.filter(p => p.estado === "mesa").sort((a, b) => a.mesa - b.mesa);
    if (!enMesa.length) return `<div class="vacio">Ahora mismo no hay partidos en juego.</div>`;
    return `<div class="mesas">` + enMesa.map(p => `<div class="mesa ocupada"><div class="row"><span class="num">Mesa ${p.mesa}</span><span class="spacer"></span><span class="t">${hace(p.llamado)}</span></div>
      <div class="small dim">${esc(E.nombrePartido(st, p))}</div>
      <div class="vs"><span>${lado(st, p.a)}</span><i>contra</i><span>${lado(st, p.b)}</span></div></div>`).join("") + `</div>`;
  }

  function htmlCola(st, max) {
    const c = E.pendientes(st).filter(p => p.estado === "pendiente").slice(0, max || 12);
    if (!c.length) return "";
    return `<div class="card">` + c.map((p, i) => `<div class="pg"><span class="a">${lado(st, p.a)}</span><span class="res">${i + 1}º</span><span class="b">${lado(st, p.b)}</span><span class="dim small">${esc(E.nombrePartido(st, p))}</span></div>`).join("") + `</div>`;
  }

  // Partidos de una ronda (lista)
  function htmlRonda(st, r, op) {
    op = op || {};
    const ps = st.partidos.filter(p => p.fase === "ronda" && p.ronda === r);
    if (!ps.length) return "";
    return `<div class="card">` + ps.map(p => {
      if (p.bye) return `<div class="pg fin"><span class="a gana">${lado(st, p.a)}</span><span class="res">—</span><span class="b dim">descansa (cuenta como victoria)</span><span></span></div>`;
      const fin = p.estado === "fin";
      const res = fin ? `${p.ra}-${p.rb}` : p.estado === "mesa" ? "M" + p.mesa : "vs";
      return `<div class="pg ${fin ? "fin" : ""} ${op.admin ? "click" : ""}" data-partido="${esc(p.id)}"><span class="a ${fin && p.ganador === "a" ? "gana" : ""}">${lado(st, p.a)}</span><span class="res" ${p.estado === "mesa" ? 'style="color:var(--ok)"' : ""}>${res}</span><span class="b ${fin && p.ganador === "b" ? "gana" : ""}">${lado(st, p.b)}</span><span></span></div>`;
    }).join("") + (E.individual(st) && (st.descansos || []).some(d => d.ronda === r) ? `<div class="small dim" style="padding-top:8px">Descansan: ${st.descansos.filter(d => d.ronda === r).flatMap(d => d.ids).map(id => esc(E.nombreJugador(st, id))).join(", ")}</div>` : "") + `</div>`;
  }

  // Cuadro de eliminatoria (Ciegos, o la fase final de Vidas)
  function htmlCuadro(st, op) {
    op = op || {};
    if (!st.ko) return "";
    const ps = st.partidos.filter(p => p.fase === st.ko.fase);
    const mk = p => {
      const fin = p.estado === "fin";
      const linea = l => {
        const id = p[l], cls = fin && !p.bye ? (p.ganador === l ? "gana" : "pierde") : "";
        const txt = id ? lado(st, id) : (p.bye ? '<span class="dim">— pasa directo —</span>' : '<span class="dim">Por decidir</span>');
        return `<div class="l ${cls}"><span>${txt}</span><span class="sc">${fin && !p.bye ? (l === "a" ? p.ra : p.rb) : ""}</span></div>`;
      };
      const cls = ["mk"];
      if (p.bye) cls.push("bye");
      if (p.estado === "mesa") cls.push("mesa");
      if (op.admin && p.a && p.b && !p.bye) cls.push("click");
      return `<div class="${cls.join(" ")}" data-partido="${esc(p.id)}">${linea("a")}${linea("b")}${p.estado === "mesa" ? `<div class="info">● Jugando en mesa ${p.mesa}</div>` : ""}</div>`;
    };
    const visibles = p => !p.bye || p.ganadorId;
    let h = `<div class="cuadro">`;
    for (let r = 1; r <= st.ko.rondas; r++) {
      const ronda = ps.filter(p => p.ronda === r && !p.tercer && visibles(p)).sort((a, b) => a.n - b.n);
      if (!ronda.length) continue;
      h += `<div class="ronda"><div class="rt">${esc(E.nombreRondaKO(st, ronda[0]))}</div><div class="lista">${ronda.map(mk).join("")}</div></div>`;
    }
    const t = ps.find(p => p.tercer);
    if (t) h += `<div class="ronda"><div class="rt">3er puesto</div><div class="lista">${mk(t)}</div></div>`;
    return h + `</div>`;
  }

  function corazones(n, max) {
    return `<span class="vidas" title="${n} vida(s)">${"♥".repeat(Math.max(0, n))}<span class="dim">${"♡".repeat(Math.max(0, max - n))}</span></span>`;
  }

  // Clasificación (Monster: jugadores · Suizo y Vidas: parejas)
  function htmlTabla(st) {
    if (st.modo === "ciegos") return "";
    const t = E.clasificacion(st);
    const nombreFila = f => E.individual(st) ? esc(E.nombreJugador(st, f.id)) : lado(st, f.id);
    const enFinal = st.ko ? new Set(st.partidos.filter(p => p.fase === "final").flatMap(p => [p.a, p.b]).filter(Boolean).flatMap(l => E.individual(st) ? E.jugadoresDe(st, l) : [l])) : null;
    return `<div class="card scroll-x"><table class="tabla"><thead><tr><th class="n">#</th><th>${E.individual(st) ? "Jugador" : "Pareja"}</th>
      ${st.modo === "vidas" ? '<th class="n">Vidas</th>' : '<th class="n">Ptos</th>'}<th class="n">PJ</th><th class="n">G</th><th class="n">P</th><th class="n">Dif</th>${st.modo === "suizo" ? '<th class="n" title="Buchholz: suma de los puntos de tus rivales">Bh</th>' : ""}${st.modo === "monster" ? '<th class="n">Desc.</th>' : ""}</tr></thead><tbody>` +
      t.map(f => `<tr class="${st.modo === "vidas" && f.vidas === 0 && !(enFinal && enFinal.has(f.id)) ? "fuera" : ""}"><td class="n dim">${f.pos}</td><td><b>${nombreFila(f)}</b>${enFinal && enFinal.has(f.id) ? ' <span class="pill ok">fase final</span>' : ""}</td>
        ${st.modo === "vidas" ? `<td class="n">${corazones(f.vidas, st.config.vidas)}</td>` : `<td class="n"><b>${f.puntos}</b></td>`}<td class="n">${f.pj}</td><td class="n">${f.pg}</td><td class="n">${f.pp}</td><td class="n">${f.pf - f.pc > 0 ? "+" : ""}${f.pf - f.pc}</td>${st.modo === "suizo" ? `<td class="n dim">${f.buchholz}</td>` : ""}${st.modo === "monster" ? `<td class="n dim">${f.descansos}</td>` : ""}</tr>`).join("") +
      `</tbody></table></div>`;
  }

  function htmlParejas(st) {
    if (!st.parejas.length) return "";
    return `<div class="grid-s">` + st.parejas.map((p, i) => `<div class="card"><span class="dim small">Pareja ${i + 1}</span><div><b>${esc(E.nombreJugador(st, p.j1))}</b> y <b>${esc(E.nombreJugador(st, p.j2))}</b></div></div>`).join("") + `</div>`;
  }

  function htmlPodio(st) {
    const pod = E.podio(st);
    if (!pod.length) return "";
    const med = { 1: "🥇", 2: "🥈", 3: "🥉", 4: "4º" };
    return `<div class="grid" style="margin-bottom:16px">` + pod.map(x => `<div class="card campeon"><span class="dim">${med[x.pos]} ${x.pos}º</span><b>${x.ids.map(id => esc(E.nombreJugador(st, id))).join(" y ")}</b></div>`).join("") + `</div>`;
  }

  function estadoTexto(st) {
    const m = E.MODOS[st.modo].nombre;
    if (st.fase === "inscripcion") return `${m} · inscripción`;
    if (st.fase === "terminado") return `${m} · terminado`;
    if (st.fase === "final") return `${m} · fase final`;
    if (st.modo === "ciegos") return `${m} · eliminatoria`;
    if (st.modo === "vidas") return `${m} · ${E.vivos(st).length} en pie`;
    const tot = E.rondasTotales(st);
    return `${m} · ronda ${st.ronda}${tot ? " de " + tot : ""}`;
  }

  function reglas(st) {
    const f = esc(E.textoFormato(st.config.partidas));
    const r = {
      ciegos: `Cada jugador se apunta solo y <b>las parejas se sortean</b>. Después, <b>eliminatoria directa</b>: quien pierde, fuera. ${f}.`,
      monster: `En cada ronda <b>te toca un compañero distinto</b> (y rivales distintos). Cada victoria suma 1 punto a cada jugador. ${E.rondasTotales(st)} rondas. Si sobran jugadores, descansan por turnos. ${f}.`,
      suizo: `Por parejas${st.config.parejas === "fijas" ? "" : " sorteadas"}. En cada ronda juegas contra alguien que va igual que tú en la clasificación, sin repetir rival. Victoria = 1 punto; desempata la suma de puntos de tus rivales (Bh). ${E.rondasTotales(st) || "?"} rondas. ${f}.`,
      vidas: `Cada jugador empieza con <b>${st.config.vidas} vidas</b>. Las rondas se sortean por adelantado (siempre hay una por delante): en cuanto los 4 jugadores de un partido han acabado la ronda anterior, ese partido se pone <b>en verde</b> y se puede jugar. Las parejas cambian cada ronda (sin repetir compañero si se puede). Si tu pareja pierde, <b>los dos perdéis una vida</b>. Sin repesca. Cuando quedan <b>8 en pie</b> (da igual las vidas) se sortean <b>4 parejas → semifinales y final</b>. ${f}.`
    };
    return r[st.modo];
  }

  // Para la imagen de redes
  function datosImagen(st) {
    const pod = E.podio(st);
    const f = st.fecha ? new Date(st.fecha + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
    return {
      titulo: st.nombre,
      sub: [E.MODOS[st.modo].nombre, f, st.lugar].filter(Boolean).join(" · "),
      bloques: pod.length ? [{ nombre: E.MODOS[st.modo].nombre, podio: pod.map(x => ({ pos: x.pos, nombre: x.ids.map(id => E.nombreJugador(st, id)).join(" y ") })) }] : []
    };
  }
  function imagenRedes(st) {
    const d = datosImagen(st);
    if (!d.bloques.length) return window.TC.toast("El torneo aún no ha terminado");
    window.TImagen.mostrar(d, (st.codigo || "ciegos") + "-resultados.png");
  }

  // Tablero de Vidas: una tarjeta por jugador con sus corazones y qué está haciendo
  function htmlTableroVidas(st) {
    const t = E.tableroVidas(st), max = st.config.vidas;
    const chip = j => ({
      mesa: `<span class="vt-est jugando">● Mesa ${j.mesa}</span>`,
      lista: `<span class="vt-est libre">✅ Listo · R${j.ronda}</span>`,
      espera: `<span class="vt-est">⏳ Ronda ${j.ronda}</span>`,
      descansa: `<span class="vt-est">Descansa</span>`,
      eliminado: `<span class="vt-est fuera">Eliminado</span>`,
      final: `<span class="vt-est final">🏆 Fase final</span>`
    })[j.estado] || "";
    const vivos = t.filter(j => j.vidas > 0).length;
    return `<div class="vt-resumen"><b>${vivos}</b> en pie de ${t.length}</div><div class="vt">` + t.map(j => `<div class="vt-j ${j.vidas > 0 ? "" : "muerto"} ${j.estado === "mesa" ? "en-mesa" : ""}">
        <div class="vt-nom">${esc(j.nombre)}</div>
        <div class="vt-vidas" aria-label="${j.vidas} vidas">${[...Array(max).keys()].map(i => `<i class="${i < j.vidas ? "on" : ""}">♥</i>`).join("")}</div>
        <div class="vt-pie">${chip(j)}<span class="dim">${j.pg}G · ${j.pp}P</span></div></div>`).join("") + `</div>`;
  }

  /* ---------- resumen (dashboard) ---------- */
  function htmlResumen(st) {
    const ps = st.partidos.filter(p => !p.bye && p.a && p.b);
    const jugados = ps.filter(p => p.estado === "fin").length, mesa = ps.filter(p => p.estado === "mesa").length;
    const espera = ps.filter(p => p.estado === "pendiente").length;
    const tiles = [];
    if (st.modo === "vidas") tiles.push([E.vivos(st).length + "/" + E.activos(st).length, "en pie"]);
    else if (st.modo === "monster") tiles.push([E.activos(st).length, "jugadores"]);
    else tiles.push([st.parejas.length || Math.floor(E.activos(st).length / 2), "parejas"]);
    if (st.modo === "vidas" && st.fase === "juego") {
      const abiertas = st.partidos.filter(p => p.fase === "ronda" && p.estado !== "fin").map(p => p.ronda);
      const est = E.estadosVidas(st);
      tiles.push([abiertas.length ? Math.min(...abiertas) : "–", "ronda en juego"], [jugados, "jugados"], [mesa, "en mesa"], [Object.values(est).filter(e => e.estado === "lista").length, "listos"]);
    } else {
      if (st.modo !== "ciegos" && st.fase !== "final" && st.fase !== "terminado") tiles.push([E.rondasVista(st).length || "–", "ronda"]);
      tiles.push([jugados, "jugados"], [mesa, "en mesa"], [espera, "esperando mesa"]);
    }
    return `<div class="cd">${tiles.map(([n, t]) => `<div class="cd-t"><b>${esc(String(n))}</b><span>${esc(t)}</span></div>`).join("")}</div>`;
  }

  /* ---------- rondas con pestañas (como las de un navegador) ---------- */
  function htmlRondas(st, sel, op) {
    op = op || {};
    const rs = E.rondasVista(st);
    if (!rs.length) return `<div class="vacio">Aún no hay rondas.</div>`;
    const vidas = st.modo === "vidas" && st.fase === "juego";
    const est = vidas ? E.estadosVidas(st) : {};
    // por defecto, la ronda más baja que aún tiene algo por jugar
    const abierta = (rs.find(r => r.partidos.some(p => p.estado !== "fin")) || rs[rs.length - 1]).n;
    const actual = rs.some(r => r.n === sel) ? sel : abierta;
    const r = rs.find(x => x.n === actual);
    const hechos = r.partidos.filter(p => p.estado === "fin" && !p.bye).length, total = r.partidos.filter(p => !p.bye).length;
    const pestañas = `<div class="nav-tabs" role="tablist">${rs.map(x => {
      const fin = x.partidos.every(p => p.estado === "fin");
      const listos = x.partidos.filter(p => (est[p.id] || {}).estado === "lista").length;
      const enMesa = x.partidos.filter(p => p.estado === "mesa").length;
      const marca = fin ? `<i class="nt-ok">✓</i>` : listos ? `<i class="nt-dot verde" title="${listos} listo(s)"></i>` : enMesa ? `<i class="nt-dot jugando"></i>` : `<i class="nt-dot"></i>`;
      return `<button class="nav-tab ${x.n === actual ? "on" : ""}" data-ronda="${x.n}" role="tab" aria-selected="${x.n === actual}">${marca}<span>Ronda ${x.n}</span>${listos ? `<b class="nt-n">${listos}</b>` : ""}</button>`;
    }).join("")}${st.ko ? `<button class="nav-tab nt-final" data-tab="cuadro">🏆 Cuadro final</button>` : ""}</div>`;
    const lista = (p, e) => {
      if (!op.admin) return `<div class="cr-aviso verde">✅ Listos para jugar</div>`;
      return `<div class="cr-aviso verde">✅ Listos para jugar</div><button class="btn sm ok cr-llamar" data-llamar="${esc(p.id)}">▶ Llamar a mesa</button>`;
    };
    const tarjeta = p => {
      if (p.bye) return `<div class="cr-m bye"><div class="cr-l gana"><span>${lado(st, p.a)}</span><b>—</b></div><div class="small dim">Descansa (cuenta como victoria)</div></div>`;
      const fin = p.estado === "fin";
      const e = est[p.id] || {};
      let cls = p.estado, aviso = "";
      if (p.estado === "mesa") aviso = `<div class="cr-aviso mesa">● Jugando en mesa ${p.mesa}${op.admin ? " · toca para anotar" : ""}</div>`;
      else if (!fin && vidas && e.estado === "lista") { cls += " lista"; aviso = lista(p, e); }
      else if (!fin && vidas && e.estado === "espera") { cls += " espera"; aviso = `<div class="cr-aviso">⏳ Esperando a ${e.esperan.map(id => esc(E.nombreJugador(st, id))).join(", ")}</div>`; }
      else if (!fin && vidas && e.estado === "riesgo") { cls += " riesgo"; aviso = `<div class="cr-aviso ambar">⏸ Espera: ahora no se puede jugar sin arriesgar llegar a 8 justos</div>`; }
      else if (!fin) aviso = `<div class="cr-aviso">Por jugar</div>`;
      const fila = l => `<div class="cr-l ${fin ? (p.ganador === l ? "gana" : "pierde") : ""}"><span>${lado(st, p[l])}</span><b>${fin ? (l === "a" ? p.ra : p.rb) : ""}</b></div>`;
      const clic = op.admin && (fin || p.estado === "mesa" || e.estado === "lista" || !vidas);
      return `<div class="cr-m ${clic ? "click" : ""} ${cls}" data-partido="${esc(p.id)}">${fila("a")}${fila("b")}${aviso}${p.rehecho && !fin ? `<div class="small dim">Partido rehecho (alguien quedó eliminado o para no bajar de 8)</div>` : ""}</div>`;
    };
    const desc = (st.descansos || []).filter(d => d.ronda === actual).flatMap(d => d.ids);
    const futura = r.partidos.every(p => p.estado === "pendiente") && vidas && r.partidos.every(p => (est[p.id] || {}).estado === "espera");
    return pestañas + `<div class="nav-panel"><div class="cr-cab"><h3>Ronda ${actual}</h3><span class="dim small">${futura ? "ya sorteada · empieza cuando sus jugadores acaben la anterior" : `${hechos} de ${total} jugados`}</span></div>
      <div class="cr-grid">${r.partidos.map(tarjeta).join("")}</div>` +
      (desc.length ? `<div class="small dim" style="margin-top:10px">Descansan: ${desc.map(id => esc(E.nombreJugador(st, id))).join(", ")}</div>` : "") + `</div>`;
  }

  // Partidos listos para llamar a mesa (Vidas)
  function htmlListos(st) {
    if (st.modo !== "vidas" || st.fase !== "juego") return "";
    const est = E.estadosVidas(st);
    const ls = st.partidos.filter(p => (est[p.id] || {}).estado === "lista").sort((x, y) => x.ronda - y.ronda || x.n - y.n);
    if (!ls.length) return "";
    const libre = E.mesasLibres(st)[0];
    return `<div class="cr-grid">` + ls.map(p => `<div class="cr-m lista click" data-partido="${esc(p.id)}"><div class="cr-est">Ronda ${p.ronda}</div>
      <div class="cr-l"><span>${lado(st, p.a)}</span><b></b></div><div class="cr-l"><span>${lado(st, p.b)}</span><b></b></div>
      <button class="btn sm ok cr-llamar" data-llamar="${esc(p.id)}" ${libre ? "" : "disabled"}>${libre ? `▶ Llamar a mesa ${libre}` : "Todas las mesas ocupadas"}</button></div>`).join("") + `</div>`;
  }

  /* ---------- cuadro final estilo Champions / Roland Garros: dos mitades y la final en el centro ---------- */
  function htmlCuadroFinal(st, op) {
    op = op || {};
    if (!st.ko) {
      if (st.modo === "vidas") return `<div class="vacio">🏆 El cuadro final se sortea cuando queden 8 jugadores o menos en pie<br><span class="small">(ahora quedan ${E.vivos(st).length})</span>.</div>`;
      return `<div class="vacio">Este formato no tiene cuadro final.</div>`;
    }
    const fase = st.ko.fase, R = st.ko.rondas;
    const ps = st.partidos.filter(p => p.fase === fase);
    const de = r => ps.filter(p => p.ronda === r && !p.tercer).sort((a, b) => a.n - b.n);
    const fin = E.partido(st, st.ko.finalId);
    const campeon = fin && fin.estado === "fin" ? fin.ganadorId : null;
    const mk = p => {
      const terminado = p.estado === "fin";
      const fila = l => {
        const id = p[l];
        const cls = terminado && !p.bye ? (p.ganador === l ? "gana" : "pierde") : "";
        const txt = id ? lado(st, id) : p.bye ? '<span class="dim">pasa directo</span>' : '<span class="dim">Por decidir</span>';
        return `<div class="cf-l ${cls}"><span>${txt}</span><b>${terminado && !p.bye ? (l === "a" ? p.ra : p.rb) : ""}</b></div>`;
      };
      const cls = ["cf-m"];
      if (p.bye) cls.push("bye");
      if (p.estado === "mesa") cls.push("mesa");
      if (op.admin && p.a && p.b && !p.bye) cls.push("click");
      if (p.id === st.ko.finalId) cls.push("final");
      return `<div class="${cls.join(" ")}" data-partido="${esc(p.id)}" data-cf-id="${esc(p.id)}" data-fa="${esc(p.fa || "")}" data-fb="${esc(p.fb || "")}">${fila("a")}${fila("b")}${p.estado === "mesa" ? `<div class="cf-mesa">● Mesa ${p.mesa}</div>` : ""}</div>`;
    };
    const nombreR = r => E.nombreRondaKO(st, de(r)[0] || { ronda: r });
    let izq = "", der = "";
    for (let r = 1; r < R; r++) {
      const rs = de(r), mitad = rs.length / 2;
      izq += `<div class="cf-col"><div class="cf-t">${esc(nombreR(r))}</div><div class="cf-lista">${rs.slice(0, mitad).map(mk).join("")}</div></div>`;
      der = `<div class="cf-col"><div class="cf-t">${esc(nombreR(r))}</div><div class="cf-lista">${rs.slice(mitad).map(mk).join("")}</div></div>` + der;
    }
    const tercero = ps.find(p => p.tercer);
    const centro = `<div class="cf-col cf-centro"><div class="cf-copa ${campeon ? "gana" : ""}">🏆</div><div class="cf-t">Final</div>
      <div class="cf-lista">${fin ? mk(fin) : ""}</div>
      ${campeon ? `<div class="cf-campeon"><span>Campeones</span><b>${lado(st, campeon)}</b></div>` : ""}
      ${tercero ? `<div class="cf-t" style="margin-top:14px">3er puesto</div>${mk(tercero)}` : ""}</div>`;
    return `<div class="cf-scroll"><div class="cf" data-cf>${izq}${centro}${der}<svg class="cf-svg" aria-hidden="true"></svg></div></div>`;
  }

  // Líneas que unen cada partido con el siguiente (se dibujan tras pintar)
  function lineas(raiz) {
    (raiz || document).querySelectorAll("[data-cf]").forEach(cf => {
      const svg = cf.querySelector(".cf-svg");
      if (!svg) return;
      const base = cf.getBoundingClientRect();
      svg.setAttribute("width", cf.scrollWidth); svg.setAttribute("height", cf.scrollHeight);
      let d = "", dOro = "";
      cf.querySelectorAll(".cf-m[data-fa]").forEach(m => {
        const a = m.getBoundingClientRect();
        [m.dataset.fa, m.dataset.fb].forEach(src => {
          if (!src) return;
          const s = cf.querySelector(`[data-cf-id="${src}"]`);
          if (!s) return;
          const b = s.getBoundingClientRect();
          const izq = b.left < a.left;
          const x1 = (izq ? b.right : b.left) - base.left, y1 = b.top + b.height / 2 - base.top;
          const x2 = (izq ? a.left : a.right) - base.left, y2 = a.top + a.height / 2 - base.top;
          const xm = (x1 + x2) / 2;
          const tramo = `M${x1},${y1} H${xm} V${y2} H${x2} `;
          if (s.querySelector(".cf-l.gana")) dOro += tramo; else d += tramo;
        });
      });
      svg.innerHTML = `<path d="${d}" class="cf-p"/><path d="${dOro}" class="cf-p oro"/>`;
      // en pantallas estrechas, que se vea la final (en el centro) al abrir
      const sc = cf.parentElement;
      if (sc && !sc.dataset.centrado && sc.scrollWidth > sc.clientWidth) { sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2; sc.dataset.centrado = "1"; }
    });
  }
  let tLineas;
  window.addEventListener("resize", () => { clearTimeout(tLineas); tLineas = setTimeout(() => lineas(), 120); });

  window.CV = { htmlListos, htmlResumen, htmlRondas, htmlCuadroFinal, lineas, htmlTableroVidas, htmlMesas, htmlCola, htmlRonda, htmlCuadro, htmlTabla, htmlParejas, htmlPodio, estadoTexto, reglas, datosImagen, imagenRedes, corazones };
})();
