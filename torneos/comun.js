/* ==============================================================
   COMÚN · utilidades y vistas compartidas por la web pública y el panel
   ============================================================== */
(function () {
  "use strict";
  const T = window.TorneoEngine;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];

  function nombre(st, id, porDefecto) {
    if (!id) return porDefecto || "Por decidir";
    const e = T.equipo(st, id);
    return e ? e.nombre : "?";
  }
  function jugadores(st, id) {
    const e = T.equipo(st, id);
    return e && (e.j1 || e.j2) ? [e.j1, e.j2].filter(Boolean).join(" y ") : "";
  }

  const CAT_COLORES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
  function colorCat(st, catId) {
    const i = st.config.categorias.findIndex(c => c.id === catId);
    return CAT_COLORES[i % CAT_COLORES.length];
  }
  function catDePosicion(st, pos) {
    return st.config.categorias.find(c => c.posiciones.includes(pos));
  }

  function hace(ts) {
    if (!ts) return "";
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "ahora";
    const m = Math.floor(s / 60);
    return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  const FASES = { inscripcion: "Inscripción abierta", grupos: "Fase de grupos", eliminatorias: "Eliminatorias", terminado: "Terminado" };

  /* ---------- clasificación de un grupo ---------- */
  function htmlGrupo(st, g, op) {
    op = op || {};
    const filas = T.clasificacionGrupo(st, g.id);
    const fin = T.grupoTerminado(st, g.id);
    const ps = st.partidos.filter(p => p.tipo === "G" && p.grupo === g.id).sort((a, b) => a.ronda - b.ronda || a.n - b.n);
    const jugados = ps.filter(p => p.estado === "fin").length;
    let h = `<div class="card grupo" data-grupo="${esc(g.id)}"><h3><span>Grupo ${esc(g.id)}</span>
      <span class="pill ${fin ? "ok" : ""}">${fin ? "Terminado" : jugados + "/" + ps.length}</span></h3>
      <div class="scroll-x"><table class="tabla"><thead><tr><th class="n">#</th><th>Pareja</th><th class="n">PJ</th><th class="n">G</th>${st.config.permitirEmpate ? '<th class="n">E</th>' : ""}<th class="n">P</th><th class="n">Dif</th><th class="n">Pts</th></tr></thead><tbody>`;
    filas.forEach(r => {
      const cat = catDePosicion(st, r.pos);
      const color = cat ? colorCat(st, cat.id) : "transparent";
      h += `<tr class="${op.yo === r.id ? "yo" : ""}"><td class="n"><span class="pos" style="box-shadow: inset 0 -3px 0 ${color}" title="${cat ? esc(cat.nombre) : ""}">${r.pos}</span></td>
        <td>${esc(nombre(st, r.id))}${op.jugadores ? `<div class="small dim">${esc(jugadores(st, r.id))}</div>` : ""}</td>
        <td class="n">${r.pj}</td><td class="n">${r.g}</td>${st.config.permitirEmpate ? `<td class="n">${r.e}</td>` : ""}<td class="n">${r.p}</td>
        <td class="n">${r.dif > 0 ? "+" : ""}${r.dif}</td><td class="n"><b>${r.pts}</b></td></tr>`;
    });
    h += `</tbody></table></div>`;
    if (op.partidos !== false) {
      h += `<div class="partidos-g">`;
      ps.forEach(p => { h += htmlFilaPartido(st, p, op); });
      h += `</div>`;
    }
    return h + `</div>`;
  }

  function htmlFilaPartido(st, p, op) {
    op = op || {};
    const fin = p.estado === "fin";
    const res = fin ? `${p.ra}-${p.rb}${p.wo ? " WO" : ""}` : p.estado === "mesa" ? `M${p.mesa}` : "vs";
    const click = op.admin ? " click" : "";
    return `<div class="pg${fin ? " fin" : ""}${click}" data-partido="${esc(p.id)}">
      <span class="a ${fin && p.ganador === p.a ? "gana" : ""}">${esc(nombre(st, p.a))}</span>
      <span class="res" ${p.estado === "mesa" ? 'style="color:var(--ok)"' : ""}>${res}</span>
      <span class="b ${fin && p.ganador === p.b ? "gana" : ""}">${esc(nombre(st, p.b))}</span>
      <span class="dim small">J${p.ronda}</span></div>`;
  }

  /* ---------- cuadro de eliminatoria ---------- */
  function htmlCuadro(st, catId, op) {
    op = op || {};
    const c = st.cuadros[catId];
    const cat = st.config.categorias.find(x => x.id === catId);
    if (!c || !c.generado) return `<div class="vacio">El cuadro de ${esc(cat ? cat.nombre : catId)} aún no está generado.</div>`;
    const ps = T.partidosCuadro(st, catId);
    let h = "";
    const camp = T.campeon(st, catId);
    if (camp) h += `<div class="card campeon"><span class="dim">🏆 Campeones de ${esc(cat.nombre)}</span><b>${esc(nombre(st, camp))}</b><span class="small dim">${esc(jugadores(st, camp))}</span></div>`;
    h += `<div class="cuadro">`;
    for (let r = 1; r <= c.rondas; r++) {
      const ronda = ps.filter(p => p.ronda === r && !p.tercer).sort((a, b) => a.n - b.n);
      h += `<div class="ronda"><div class="rt">${esc(T.rondaNombre(c.tam, r))}</div><div class="lista">`;
      ronda.forEach(p => { h += htmlMk(st, p, c, op); });
      if (r === c.rondas) {
        const tp = ps.find(p => p.tercer);
        if (tp) h += `<div class="rt" style="margin-top:14px">3er puesto</div>` + htmlMk(st, tp, c, op);
      }
      h += `</div></div>`;
    }
    return h + `</div>`;
  }

  function htmlMk(st, p, c, op) {
    const fin = p.estado === "fin";
    const linea = lado => {
      const id = p[lado], r = lado === "a" ? p.ra : p.rb;
      const cls = fin && !p.bye ? (p.ganador === id ? "gana" : "pierde") : "";
      const origen = p.ronda === 1 && id && c.origen && c.origen[id] ? `<span class="o">${esc(c.origen[id])}</span>` : "";
      const txt = id ? esc(nombre(st, id)) : (p.bye && p.ronda === 1 ? '<span class="dim">— libre —</span>' : '<span class="dim">Por decidir</span>');
      return `<div class="l ${cls}"><span>${txt}${origen}</span><span class="sc">${fin && !p.bye ? r : ""}</span></div>`;
    };
    const cls = ["mk"];
    if (p.bye) cls.push("bye");
    if (p.estado === "mesa") cls.push("mesa");
    if (op.admin && p.a && p.b && !p.bye) cls.push("click");
    if (op.yo && (p.a === op.yo || p.b === op.yo)) cls.push("yo");
    const info = p.estado === "mesa" ? `<div class="info">● Jugando en mesa ${p.mesa}</div>` : "";
    return `<div class="${cls.join(" ")}" data-partido="${esc(p.id)}">${linea("a")}${linea("b")}${info}</div>`;
  }

  /* ---------- mesas ---------- */
  function htmlMesasPublicas(st) {
    const enMesa = st.partidos.filter(p => p.estado === "mesa").sort((a, b) => a.mesa - b.mesa);
    if (!enMesa.length) return `<div class="vacio">Ahora mismo no hay partidos en juego.</div>`;
    return `<div class="mesas">` + enMesa.map(p => `<div class="mesa ocupada"><div class="row"><span class="num">Mesa ${p.mesa}</span><span class="spacer"></span><span class="t">${hace(p.llamado)}</span></div>
      <div class="small dim">${esc(T.nombrePartido(st, p))}</div>
      <div class="vs"><span>${esc(nombre(st, p.a))}</span><i>contra</i><span>${esc(nombre(st, p.b))}</span></div></div>`).join("") + `</div>`;
  }

  /* ---------- avisos en pantalla ---------- */
  function toast(msg, tipo, ms) {
    let box = $("#toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + (tipo || "");
    t.innerHTML = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), ms || 3500);
  }

  function modal(html, alAbrir) {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    const cerrar = () => { bg.remove(); document.removeEventListener("keydown", tecla); };
    const tecla = e => { if (e.key === "Escape") cerrar(); };
    bg.addEventListener("click", e => { if (e.target === bg || e.target.closest("[data-cerrar]")) cerrar(); });
    document.addEventListener("keydown", tecla);
    document.body.appendChild(bg);
    if (alAbrir) alAbrir(bg.firstElementChild, cerrar);
    const f = bg.querySelector("input, select, textarea");
    if (f) setTimeout(() => f.focus(), 50);
    return cerrar;
  }

  /* ---------- WhatsApp ---------- */
  function linkWhatsApp(tel, texto) {
    let t = String(tel || "").replace(/\D/g, "");
    if (/^[6789]\d{8}$/.test(t)) t = "34" + t;
    return t ? `https://wa.me/${t}?text=${encodeURIComponent(texto || "")}` : "";
  }

  /* ---------- push ---------- */
  function b64aUint8(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
  async function registrarSW() {
    if (!("serviceWorker" in navigator)) return null;
    try { return await navigator.serviceWorker.register("sw.js"); } catch (_) { return null; }
  }
  async function suscripcionPush(vapid) {
    const reg = (await navigator.serviceWorker.getRegistration()) || (await registrarSW());
    if (!reg) throw new Error("Este navegador no admite avisos");
    await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("No has dado permiso para las notificaciones");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aUint8(vapid) });
    return sub.toJSON();
  }
  const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const esPWA = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  /* ---------- sonido de aviso (sin archivos) ---------- */
  function pitido() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.2, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
      });
    } catch (_) {}
  }

  function tema() {
    try { const t = localStorage.getItem("torneo-tema"); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
  }
  function cambiarTema() {
    const actual = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = actual;
    try { localStorage.setItem("torneo-tema", actual); } catch (_) {}
  }
  tema();

  window.TC = {
    esc, $, $$, nombre, jugadores, colorCat, catDePosicion, hace, FASES,
    htmlGrupo, htmlFilaPartido, htmlCuadro, htmlMesasPublicas,
    toast, modal, linkWhatsApp, registrarSW, suscripcionPush, esIOS, esPWA, pitido, cambiarTema
  };
})();
