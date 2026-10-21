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
      t.map(f => `<tr class="${st.modo === "vidas" && f.vidas === 0 && !(enFinal && enFinal.has(f.id)) ? "fuera" : ""}"><td class="n dim">${f.pos}</td><td><b>${nombreFila(f)}</b>${enFinal && enFinal.has(f.id) ? ' <span class="pill ok">fase final</span>' : ""}${st.fueraFinal === f.id ? ' <span class="pill warn">fuera por impar</span>' : ""}</td>
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
      vidas: `Cada jugador empieza con <b>${st.config.vidas} vidas</b>. No hay rondas: <b>en cuanto hay 4 jugadores libres se sortean</b> parejas y rivales entre ellos y se juega ya (primero los que más llevan esperando, sin repetir compañero si se puede). Si tu pareja pierde, <b>los dos perdéis una vida</b>. Sin repesca. Cuando quedan 8 o menos en pie: <b>parejas a sorteo, semifinales y final</b> (con 6 una pareja pasa directa a la final; con 4 o 5, final directa; si son impares, se queda fuera quien tenga menos vidas). ${f}.`
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
      "espera-mesa": `<span class="vt-est">⏳ Esperando mesa</span>`,
      libre: `<span class="vt-est libre">Libre${j.orden != null ? " · " + (j.orden + 1) + "º en espera" : ""}</span>`,
      eliminado: `<span class="vt-est fuera">Eliminado</span>`,
      final: `<span class="vt-est final">🏆 Fase final</span>`,
      fuera: `<span class="vt-est fuera">Fuera</span>`
    })[j.estado];
    const vivos = t.filter(j => j.vidas > 0).length;
    return `<div class="vt-resumen"><b>${vivos}</b> en pie de ${t.length}</div><div class="vt">` + t.map(j => `<div class="vt-j ${j.vidas > 0 ? "" : "muerto"} ${j.estado === "mesa" ? "en-mesa" : ""}">
        <div class="vt-nom">${esc(j.nombre)}</div>
        <div class="vt-vidas" aria-label="${j.vidas} vidas">${[...Array(max).keys()].map(i => `<i class="${i < j.vidas ? "on" : ""}">♥</i>`).join("")}</div>
        <div class="vt-pie">${chip(j)}<span class="dim">${j.pg}G · ${j.pp}P</span></div></div>`).join("") + `</div>`;
  }

  window.CV = { htmlTableroVidas, htmlMesas, htmlCola, htmlRonda, htmlCuadro, htmlTabla, htmlParejas, htmlPodio, estadoTexto, reglas, datosImagen, imagenRedes, corazones };
})();
