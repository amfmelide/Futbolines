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
  function catDePosicion(st, pos, division) {
    const d0 = T.divisiones(st)[0].id;
    return st.config.categorias.find(c => c.posiciones.includes(pos) && (c.division || d0) === (division || d0));
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
    const emp = ps.length && T.admiteEmpate(st, ps[0]);
    const conGoles = ps.some(p => p.goles && p.goles.length);
    let h = `<div class="card grupo" data-grupo="${esc(g.id)}"><h3><span>Grupo ${esc(g.id)}</span>
      <span class="pill ${fin ? "ok" : ""}">${fin ? "Terminado" : jugados + "/" + ps.length}</span></h3>
      <div class="scroll-x"><table class="tabla"><thead><tr><th class="n">#</th><th>Pareja</th><th class="n">PJ</th><th class="n">G</th>${emp ? '<th class="n">E</th>' : ""}<th class="n">P</th><th class="n" title="Diferencia de partidas">Dif</th>${conGoles ? '<th class="n" title="Diferencia de goles">Goles</th>' : ""}<th class="n">Pts</th></tr></thead><tbody>`;
    const signo = n => (n > 0 ? "+" : "") + n;
    filas.forEach(r => {
      const cat = catDePosicion(st, r.pos, g.division);
      const color = cat ? colorCat(st, cat.id) : "transparent";
      h += `<tr class="${op.yo === r.id ? "yo" : ""}"><td class="n"><span class="pos" style="box-shadow: inset 0 -3px 0 ${color}" title="${cat ? esc(cat.nombre) : ""}">${r.pos}</span></td>
        <td>${esc(nombre(st, r.id))}${op.jugadores ? `<div class="small dim">${esc(jugadores(st, r.id))}</div>` : ""}</td>
        <td class="n">${r.pj}</td><td class="n">${r.g}</td>${emp ? `<td class="n">${r.e}</td>` : ""}<td class="n">${r.p}</td>
        <td class="n">${signo(r.dif)}</td>${conGoles ? `<td class="n">${signo(r.gd)}</td>` : ""}<td class="n"><b>${r.pts}</b></td></tr>`;
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
    const det = fin && p.goles && p.goles.length ? `<span class="dim small">${p.goles.map(g => g.join("-")).join(" · ")}</span>` : `<span class="dim small">J${p.ronda}</span>`;
    const click = op.admin ? " click" : "";
    return `<div class="pg${fin ? " fin" : ""}${click}" data-partido="${esc(p.id)}">
      <span class="a ${fin && p.ganador === p.a ? "gana" : ""}">${esc(nombre(st, p.a))}</span>
      <span class="res" ${p.estado === "mesa" ? 'style="color:var(--ok)"' : ""}>${res}</span>
      <span class="b ${fin && p.ganador === p.b ? "gana" : ""}">${esc(nombre(st, p.b))}</span>
      ${det}</div>`;
  }

  /* ---------- cuadro de eliminatoria ---------- */
  // Doble K: cuadro de ganadores, cuadro de perdedores y fase final (cruces, semis y final).
  function htmlCuadro(st, catId, op) {
    op = op || {};
    const c = st.cuadros[catId];
    const cat = T.categoria(st, catId);
    if (!c || !c.generado) return `<div class="vacio">El cuadro de ${esc(cat ? cat.nombre : catId)} aún no está generado.</div>`;
    const ps = T.partidosCuadro(st, catId);
    const visible = p => !p.bye || (p.llave === "W" && p.ronda === 1 && p.ganador);
    const ronda = (llave, r) => ps.filter(p => p.llave === llave && p.ronda === r && visible(p)).sort((a, b) => a.n - b.n);
    let h = "";
    const camp = T.campeon(st, catId);
    if (camp) h += `<div class="card campeon"><span class="dim">🏆 Campeones de ${esc(cat.nombre)}</span><b>${esc(nombre(st, camp))}</b><span class="small dim">${esc(jugadores(st, camp))}</span></div>`;
    const columnas = (cols) => `<div class="cuadro">` + cols.filter(k => k.ps.length).map(k =>
      `<div class="ronda"><div class="rt">${esc(k.t)}</div><div class="lista">${k.ps.map(p => htmlMk(st, p, c, op)).join("")}</div></div>`).join("") + `</div>`;
    if (c.formato === "doble" || c.formato === "niveles") {
      const maxR = l => ps.filter(p => p.llave === l).reduce((m, p) => Math.max(m, p.ronda), 0);
      const rW = c.formato === "niveles" ? maxR("W") : c.rondasW, rL = c.formato === "niveles" ? maxR("L") : c.rondasL;
      const fin = [{ t: "Cruces", ps: ronda("X", 1) }, { t: "Semifinales", ps: ronda("S", 1) }, { t: "Final", ps: ronda("F", 1) }, { t: "3er puesto", ps: ronda("T", 1) }];
      const e = T.estadoCruce(st, catId);
      if (e.aplica || fin.some(k => k.ps.length)) {
        h += `<h3 class="seccion">Fase final</h3>`;
        if (!e.sorteado && e.aplica) h += `<p class="small dim">${e.listo ? "Listos los 4 de ganadores y los 4 de perdedores: falta el sorteo de cruces." : `Cuando queden 4 en ganadores y 4 en perdedores se sortean los cruces (el de ganadores empieza ${st.config.ventajaCruce}-0).`}</p>`;
        else h += columnas(fin);
      }
      if (c.formato === "niveles" && !rW) h += `<p class="small dim">Todavía no ha llegado nadie a esta categoría.</p>`;
      const titulo = (p0, i) => (p0 && p0.etiqueta) || "R" + (i + 1);
      h += `<h3 class="seccion">${c.formato === "niveles" && !rL && !e.aplica ? "Cuadro" : "Cuadro de ganadores"}</h3>` + columnas([...Array(rW).keys()].map(i => { const r = ronda("W", i + 1); return { t: c.formato === "niveles" ? titulo(ps.find(p => p.llave === "W" && p.ronda === i + 1), i) : "Ganadores R" + (i + 1), ps: r }; }));
      if (rL) h += `<h3 class="seccion">Cuadro de perdedores</h3>` + columnas([...Array(rL).keys()].map(i => ({ t: "Perdedores R" + (i + 1), ps: ronda("L", i + 1) })));
      return h;
    }
    return h + columnas([...Array(c.rondasW).keys()].map(i => ({ t: T.rondaNombre(c.tam, i + 1), ps: ronda("W", i + 1) })).concat([{ t: "3er puesto", ps: ronda("T", 1) }]));
  }

  function htmlMk(st, p, c, op) {
    const fin = p.estado === "fin";
    const v = p.ventaja ? st.config.ventajaCruce : 0;
    const linea = lado => {
      const id = p[lado], r = lado === "a" ? p.ra : p.rb;
      const cls = fin && !p.bye ? (p.ganador === id ? "gana" : "pierde") : "";
      const origen = p.llave === "W" && p.ronda === 1 && id && c.origen && c.origen[id] ? `<span class="o">${esc(c.origen[id])}</span>` : "";
      const ventaja = v && p.ventaja === lado && id && !fin ? `<span class="o" title="Empieza con ventaja">+${v}</span>` : "";
      const txt = id ? esc(nombre(st, id)) : (p.bye ? '<span class="dim">— libre —</span>' : '<span class="dim">Por decidir</span>');
      return `<div class="l ${cls}"><span>${txt}${origen}${ventaja}</span><span class="sc">${fin && !p.bye ? r : ""}</span></div>`;
    };
    const cls = ["mk"];
    if (p.bye) cls.push("bye");
    if (p.estado === "mesa") cls.push("mesa");
    if (op.admin && p.a && p.b && !p.bye) cls.push("click");
    if (op.yo && (p.a === op.yo || p.b === op.yo)) cls.push("yo");
    const info = p.estado === "mesa" ? `<div class="info">● Jugando en mesa ${p.mesa}</div>` : "";
    return `<div class="${cls.join(" ")}" data-partido="${esc(p.id)}">${linea("a")}${linea("b")}${info}</div>`;
  }

  /* ---------- modo por niveles: esquema de flujo y camino de cada pareja ---------- */
  function htmlFlujoNiveles(st, div) {
    const res = T.resumenNiveles(st, div);
    if (!res) return "";
    const est = { campeon: "pill gold", "fase final": "pill ok", "directo a la final": "pill ok", jugando: "pill", esperando: "pill" };
    return `<div class="flujo" role="list">` + res.map((r, k) => `
      ${k ? `<div class="flujo-flecha" aria-hidden="true"><span>${r.bajaron}</span>↓ bajan</div>` : ""}
      <div class="flujo-cat card" role="listitem">
        <div class="row"><b>${esc(r.cat.nombre)}</b><span class="${est[r.estado]}">${esc(r.estado)}</span><span class="spacer"></span><span class="small dim">${r.cat.formato === "doble" ? "doble K" : "simple"}</span></div>
        <div class="flujo-nums">
          <div><b>${r.entran}</b><span>entran</span></div>
          <div><b>${r.enGanadores}</b><span>en ganadores</span></div>
          ${r.enPerdedores != null ? `<div><b>${r.enPerdedores}</b><span>en perdedores</span></div>` : ""}
          ${res[k + 1] ? `<div><b>${r.bajan}</b><span>bajan a ${esc(res[k + 1].cat.nombre)}</span></div>` : ""}
          <div><b>${r.fuera}</b><span>eliminadas</span></div>
        </div>
        <div class="small dim">${[r.deGrupo ? `${r.deGrupo} desde los grupos` : "", r.quintos ? `${r.quintos} quintos de grupo` : "", r.bajaron ? `${r.bajaron} bajaron de ${esc(res[k - 1] ? res[k - 1].cat.nombre : "")}` : "", r.aPerdedores ? `${r.aPerdedores} pasaron a perdedores` : ""].filter(Boolean).join(" · ")}</div>
      </div>`).join("") + `</div>`;
  }

  function htmlCamino(st, id) {
    const pasos = T.caminoNiveles(st, id);
    if (!pasos.length) return "";
    return `<div class="camino">` + pasos.map(p => `<span class="paso paso-${p.tipo}" title="${p.rival ? "contra " + esc(nombre(st, p.rival)) + " " + esc(p.marcador) : ""}">${esc(p.texto)}${p.rival ? `<small>${esc(nombre(st, p.rival))} · ${esc(p.marcador)}</small>` : ""}</span>`).join('<span class="paso-sep" aria-hidden="true">→</span>') + `</div>`;
  }

  /* ---------- mesas ---------- */
  function htmlMesasPublicas(st) {
    const enMesa = st.partidos.filter(p => p.estado === "mesa").sort((a, b) => a.mesa - b.mesa);
    if (!enMesa.length) return `<div class="vacio">Ahora mismo no hay partidos en juego.</div>`;
    return `<div class="mesas">` + enMesa.map(p => `<div class="mesa ocupada"><div class="row"><span class="num">Mesa ${p.mesa}</span><span class="spacer"></span><span class="t">${hace(p.llamado)}</span></div>
      <div class="small dim">${esc(T.nombrePartido(st, p))} · ${esc(T.textoFormato(T.formatoDe(st, p)))}</div>
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

  /* ---------- sorteo en directo (para proyectar) ----------
     sorteoEnDirecto({ titulo, columnas:[{titulo, fijos:[texto], huecos:n}], bolas:[{col, texto, sub}] })
     Las "bolas" salen en orden del bombo y entran en su columna. */
  /* ---------- sorteo en directo ----------
     Una tira de nombres que gira como una tragaperras, frena en el elegido y la tarjeta vuela a su sitio.
     op = { titulo, columnas: [{ titulo, fijos? }], bolas: [{ col, texto, sub? }] }  (bolas en el orden del sorteo) */
  function sorteoEnDirecto(op) {
    const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = op.bolas.length;
    const huecos = op.columnas.map((_, i) => op.bolas.filter(b => b.col === i).length);
    const capa = document.createElement("div");
    capa.className = "sd";
    capa.innerHTML = `<div class="sd-cab"><div class="sd-tit">${esc(op.titulo)}</div><span class="spacer"></span>
        <button class="btn sm" data-sd="pausa">⏸ Pausa</button><button class="btn sm" data-sd="vel">${total > 40 ? "Normal" : "⚡ Rápido"}</button><button class="btn sm" data-sd="fin">Ver todo</button>
        <button class="btn sm" data-sd="full">⛶</button><button class="btn sm" data-sd="cerrar">Cerrar</button></div>
      <div class="sd-barra"><i></i></div>
      <div class="sd-escena">
        <div class="sd-slot" aria-live="polite"><div class="sd-ventana"><div class="sd-tira"></div></div><div class="sd-destino"></div></div>
        <div class="sd-cuenta"></div>
      </div>
      <div class="sd-cols">${op.columnas.map((c, i) => `<div class="sd-col" data-colc="${i}"><div class="sd-ct">${esc(c.titulo)}</div>
          ${(c.fijos || []).map(f => `<div class="sd-fijo">${esc(f)}</div>`).join("")}<div class="sd-lista" data-col="${i}">${'<div class="sd-hueco"></div>'.repeat(huecos[i])}</div></div>`).join("")}</div>`;
    document.body.appendChild(capa);
    document.documentElement.style.overflow = "hidden";
    const tira = capa.querySelector(".sd-tira"), slot = capa.querySelector(".sd-slot"), destino = capa.querySelector(".sd-destino");
    const barra = capa.querySelector(".sd-barra i"), cuenta = capa.querySelector(".sd-cuenta");
    const nombres = op.bolas.map(b => b.texto);
    let i = 0, rapido = total > 40, pausa = false, cancel = false;
    const espera = ms => new Promise(r => setTimeout(r, quieto ? 0 : rapido ? ms / 3.5 : ms));
    const esperarPausa = async () => { while (pausa && !cancel) await new Promise(r => setTimeout(r, 120)); };
    const item = t => `<div class="sd-n">${esc(t)}</div>`;
    tira.innerHTML = item("¡Vamos!");
    function progreso() {
      barra.style.width = (100 * i / Math.max(1, total)) + "%";
      cuenta.textContent = `${i} de ${total}`;
    }
    function colocar(b, animar) {
      const lista = capa.querySelector(`.sd-lista[data-col="${b.col}"]`);
      const hueco = lista.querySelector(".sd-hueco");
      const el = document.createElement("div");
      el.className = "sd-item" + (animar ? " sd-entra" : "");
      el.innerHTML = `<b>${esc(b.texto)}</b>${b.sub ? `<span>${esc(b.sub)}</span>` : ""}`;
      if (hueco) hueco.replaceWith(el); else lista.appendChild(el);
      return el;
    }
    // la tarjeta sale de la tragaperras y vuela hasta su hueco
    async function volar(b) {
      const col = capa.querySelector(`[data-colc="${b.col}"]`);
      const hueco = col.querySelector(".sd-hueco");
      if (cancel) return;
      if (quieto || !hueco || !hueco.animate) return colocar(b, !quieto);
      hueco.scrollIntoView({ block: "nearest", behavior: rapido ? "auto" : "smooth" });
      await espera(rapido ? 60 : 220);
      const de = slot.querySelector(".sd-ventana").getBoundingClientRect(), a = hueco.getBoundingClientRect();
      const fl = document.createElement("div");
      fl.className = "sd-vuela";
      fl.innerHTML = `<b>${esc(b.texto)}</b>`;
      Object.assign(fl.style, { left: de.left + "px", top: de.top + "px", width: de.width + "px", height: de.height + "px" });
      capa.appendChild(fl);
      const dx = a.left - de.left, dy = a.top - de.top, sx = a.width / de.width, sy = a.height / de.height;
      await fl.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(${(1 + sx) / 2}, ${(1 + sy) / 2}) rotate(-3deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4 }
      ], { duration: rapido ? 260 : 650, easing: "cubic-bezier(.45,.05,.2,1)", transformOrigin: "0 0" }).finished.catch(() => {});
      fl.remove();
      if (cancel) return;                              // «Ver todo» ya lo ha colocado
      colocar(b, true);
      col.classList.remove("sd-col-on"); void col.offsetWidth; col.classList.add("sd-col-on");
    }
    async function girar(b) {
      // tira: nombres al azar y, al final, el elegido. Frena poco a poco.
      const n = quieto ? 1 : rapido ? 10 : 22;
      const lista = [];
      for (let k = 0; k < n; k++) lista.push(nombres[Math.floor(Math.random() * nombres.length)]);
      lista.push(b.texto);
      tira.innerHTML = lista.map(item).join("");
      destino.textContent = "→ " + op.columnas[b.col].titulo;
      destino.classList.remove("on");
      capa.querySelectorAll(".sd-col-obj").forEach(x => x.classList.remove("sd-col-obj"));
      capa.querySelector(`[data-colc="${b.col}"]`).classList.add("sd-col-obj");
      const alto = tira.firstElementChild.getBoundingClientRect().height || 90;
      slot.classList.add("gira");
      if (!quieto && tira.animate) {
        await tira.animate([
          { transform: "translateY(0)", filter: "blur(0)" },
          { transform: `translateY(${-alto * n * 0.55}px)`, filter: "blur(2.5px)", offset: 0.45 },
          { transform: `translateY(${-alto * n}px)`, filter: "blur(0)" }
        ], { duration: rapido ? 700 : 1900, easing: "cubic-bezier(.15,.65,.25,1)", fill: "forwards" }).finished.catch(() => {});
      } else tira.style.transform = `translateY(${-alto * n}px)`;
      slot.classList.remove("gira");
      slot.classList.add("pum"); destino.classList.add("on");
      await espera(650);
      slot.classList.remove("pum");
    }
    async function sacar() {
      await espera(500);
      while (i < total && !cancel) {
        await esperarPausa(); if (cancel) break;
        const b = op.bolas[i];
        await girar(b); if (cancel) break;
        await volar(b);
        i++; progreso();
        await espera(250);
      }
      if (i >= total && !cancel) terminar();
    }
    function terminar() {
      tira.style.transform = ""; tira.getAnimations && tira.getAnimations().forEach(a => a.cancel());
      tira.innerHTML = item("¡Sorteo terminado!");
      destino.textContent = ""; slot.classList.add("hecho");
      capa.querySelectorAll(".sd-col-obj").forEach(x => x.classList.remove("sd-col-obj"));
      ["pausa", "vel", "fin"].forEach(k => (capa.querySelector(`[data-sd="${k}"]`).style.display = "none"));
      if (!quieto) confeti(capa);
    }
    function verTodo() {
      cancel = true;
      while (i < total) colocar(op.bolas[i++], false);
      progreso(); terminar();
    }
    capa.addEventListener("click", e => {
      const a = e.target.closest("[data-sd]"); if (!a) return;
      const acc = a.dataset.sd;
      if (acc === "pausa") { pausa = !pausa; a.textContent = pausa ? "▶ Seguir" : "⏸ Pausa"; }
      if (acc === "vel") { rapido = !rapido; a.textContent = rapido ? "Normal" : "⚡ Rápido"; }
      if (acc === "fin") verTodo();
      if (acc === "full") { try { (document.fullscreenElement ? document.exitFullscreen() : capa.requestFullscreen()).catch(() => {}); } catch (_) {} }
      if (acc === "cerrar") { cancel = true; try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {} capa.remove(); document.documentElement.style.overflow = ""; }
    });
    progreso();
    sacar();
    return capa;
  }

  // confeti dorado al terminar
  function confeti(donde) {
    const colores = ["#e9cd94", "#b08d4f", "#ffffff", "#00c853", "#f50057", "#1e88e5"];
    for (let k = 0; k < 90; k++) {
      const c = document.createElement("i");
      c.className = "sd-confeti";
      c.style.left = (Math.random() * 100) + "vw";
      c.style.background = colores[k % colores.length];
      c.style.setProperty("--x", ((Math.random() - 0.5) * 220) + "px");
      c.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      c.style.animationDuration = (1.8 + Math.random() * 1.8) + "s";
      c.style.animationDelay = (Math.random() * 0.4) + "s";
      donde.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
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

  // Datos para la imagen de redes: podio de cada categoría con campeón
  function datosImagen(st) {
    const bloques = st.config.categorias.map(c => ({
      nombre: c.nombre,
      podio: T.podio(st, c.id).map(x => ({ pos: x.pos, nombre: nombre(st, x.id), detalle: jugadores(st, x.id) }))
    })).filter(b => b.podio.length);
    const f = st.fecha ? new Date(st.fecha + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
    return { titulo: st.nombre, sub: [f, st.lugar].filter(Boolean).join(" · "), bloques };
  }
  function imagenRedes(st) {
    const d = datosImagen(st);
    if (!d.bloques.length) return toast("Aún no hay ninguna categoría con campeón");
    window.TImagen.mostrar(d, (st.codigo || "torneo") + "-resultados.png");
  }

  window.TC = {
    esc, $, $$, nombre, jugadores, colorCat, catDePosicion, hace, FASES,
    htmlGrupo, htmlFilaPartido, htmlCuadro, htmlMesasPublicas,
    toast, modal, linkWhatsApp, registrarSW, suscripcionPush, esIOS, esPWA, pitido, cambiarTema, sorteoEnDirecto, confeti, htmlFlujoNiveles, htmlCamino, datosImagen, imagenRedes
  };
})();
