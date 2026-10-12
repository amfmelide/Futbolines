/* =====================================================================
   FX · efectos de amfmelide.es: aparición al hacer scroll, botones con
   onda, tarjetas que se inclinan y brillan, cursor luminoso, fondo vivo
   (luces y partículas), titulares que entran palabra a palabra y textos
   que se escriben solos o cambian de palabra.

   No cambia el contenido de la página ni sus estilos: sólo añade clases
   y capas encima. Se apaga solo con "reducir movimiento" y en pestañas
   ocultas. Opciones en <html data-fx="ligero|off">.

   Atributos que se pueden poner en cualquier texto:
     data-fx-escribir                → se escribe letra a letra
     data-fx-rotar="uno|dos|tres"    → la palabra va cambiando
   ===================================================================== */
(function () {
  "use strict";
  const html = document.documentElement;
  const modo = html.getAttribute("data-fx") || "";
  if (modo === "off") return;
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const raton = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const ligero = modo === "ligero";
  const ahorro = navigator.connection && navigator.connection.saveData;

  const yaAnimado = el => {
    const cs = getComputedStyle(el);
    return (cs.transform && cs.transform !== "none") || (cs.animationName && cs.animationName !== "none") ||
      cs.position === "fixed" || cs.position === "sticky";
  };
  const dentroDeFijo = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === "fixed" || pos === "sticky") return true;
    }
    return false;
  };

  /* ---------------- aparición al hacer scroll ---------------- */
  const SEL_REVELAR = "main section, main article, section, article, .card, [class*='card']:not([class*='cards']), [class*='tile'], .grupo, .mesa, .ronda, .stat, h1, h2, figure, .fx";
  let io = null;
  function revelar(raiz) {
    if (quieto || ligero || !("IntersectionObserver" in window)) return;
    if (!io) io = new IntersectionObserver(ents => ents.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("fx-visible");
      e.target.classList.remove("fx-oculto");
      io.unobserve(e.target);
      setTimeout(() => e.target.classList.remove("fx-visible"), 1600);   // dejar el elemento como estaba
    }), { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    const altoVista = innerHeight;
    const cands = [...(raiz || document).querySelectorAll(SEL_REVELAR)].filter(el => !el.dataset.fxVisto);
    const porPadre = new Map();
    cands.forEach(el => {
      el.dataset.fxVisto = "1";
      if (el.closest("[data-fx-no]") || el.closest(".modal, [class*='modal'], [class*='overlay'], dialog")) return;
      // no anidar: si un antepasado ya se revela, éste entra con él
      for (let p = el.parentElement; p; p = p.parentElement) if (p.classList && (p.classList.contains("fx-oculto"))) return;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.top < altoVista * .92) return;          // lo que ya se ve no se esconde
      if (r.height > altoVista * 2.5) return;                          // bloques enormes, tal cual
      if (yaAnimado(el) || dentroDeFijo(el)) return;
      const n = porPadre.get(el.parentElement) || 0;
      porPadre.set(el.parentElement, n + 1);
      el.style.setProperty("--fx-retraso", Math.min(n, 6) * 70 + "ms");
      el.classList.add("fx-oculto");
      io.observe(el);
    });
  }

  /* ---------------- titulares que entran palabra a palabra ---------------- */
  function titulares() {
    if (quieto || ligero) return;
    document.querySelectorAll("h1").forEach((h, i) => {
      if (h.dataset.fxTitulo || h.childElementCount || !h.textContent.trim() || h.closest("[data-fx-no]")) return;
      const cs = getComputedStyle(h);
      if (cs.backgroundClip === "text" || cs.webkitBackgroundClip === "text") return;   // degradado en el texto: no partirlo
      h.dataset.fxTitulo = "1";
      const palabras = h.textContent.trim().split(/\s+/);
      h.setAttribute("aria-label", h.textContent.trim());
      h.textContent = "";
      palabras.forEach((p, k) => {
        const s = document.createElement("span");
        s.className = "fx-palabra";
        s.setAttribute("aria-hidden", "true");
        s.style.setProperty("--fx-retraso", (i * 120 + k * 90) + "ms");
        s.textContent = p;
        h.appendChild(s);
        if (k < palabras.length - 1) h.appendChild(document.createTextNode(" "));
      });
    });
  }

  /* ---------------- texto que se escribe solo / palabra que cambia ---------------- */
  function textos() {
    document.querySelectorAll("[data-fx-escribir]:not([data-fx-hecho])").forEach(el => {
      el.dataset.fxHecho = "1";
      if (quieto) return;
      const txt = el.textContent;
      el.setAttribute("aria-label", txt);
      el.textContent = "";
      el.classList.add("fx-cursor");
      let i = 0;
      const paso = () => {
        el.textContent = txt.slice(0, ++i);
        if (i < txt.length) setTimeout(paso, 28 + Math.random() * 45);
        else setTimeout(() => el.classList.remove("fx-cursor"), 2200);
      };
      setTimeout(paso, 500);
    });
    document.querySelectorAll("[data-fx-rotar]:not([data-fx-hecho])").forEach(el => {
      el.dataset.fxHecho = "1";
      const lista = el.getAttribute("data-fx-rotar").split("|").map(s => s.trim()).filter(Boolean);
      if (quieto || lista.length < 2) return;
      el.classList.add("fx-rotar");
      let k = Math.max(0, lista.indexOf(el.textContent.trim()));
      setInterval(() => {
        if (document.hidden) return;
        el.classList.add("fx-cambiando");
        setTimeout(() => { k = (k + 1) % lista.length; el.textContent = lista[k]; el.classList.remove("fx-cambiando"); }, 450);
      }, 2600);
    });
  }

  /* ---------------- botones: onda al pulsar ---------------- */
  const SEL_BOTON = "button, .btn, [class*='btn'], [role='button'], input[type='submit']";
  if (!quieto) document.addEventListener("pointerdown", e => {
    const b = e.target.closest && e.target.closest(SEL_BOTON);
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    if (r.width < 8 || r.width > 900) return;
    const capa = document.createElement("div");
    capa.className = "fx-onda-capa";
    Object.assign(capa.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: getComputedStyle(b).borderRadius });
    const o = document.createElement("span");
    o.className = "fx-onda";
    const d = Math.hypot(r.width, r.height) * 2;
    Object.assign(o.style, { left: e.clientX - r.left + "px", top: e.clientY - r.top + "px", width: d + "px", height: d + "px" });
    capa.appendChild(o);
    document.body.appendChild(capa);
    setTimeout(() => capa.remove(), 700);
  }, { passive: true });

  /* ---------------- tarjetas que se inclinan y brillan ---------------- */
  const SEL_TARJETA = ".card, [class*='card']:not([class*='cards']), [class*='tile'], .mesa, .mk, .stat, .admin-menu-btn";
  if (raton && !quieto && !ligero) {
    let actual = null;
    document.addEventListener("pointermove", e => {
      const t = e.target.closest && e.target.closest(SEL_TARJETA);
      if (t !== actual) { soltar(actual); actual = null; }
      if (!t || t.closest("[data-fx-no]")) return;
      if (!t.dataset.fxT) {
        const r0 = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        const apto = r0.width < 640 && r0.height < 640 && (cs.transform === "none" || t.classList.contains("fx-tarjeta")) && cs.position !== "fixed";
        t.dataset.fxT = apto ? "1" : "0";
        if (apto) {
          t.classList.add("fx-tarjeta");
          if (cs.position !== "static" && getComputedStyle(t, "::before").content === "none") t.classList.add("fx-brillo");
        }
      }
      if (t.dataset.fxT !== "1") return;
      actual = t;
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t.classList.add("fx-activa");
      t.style.transform = `perspective(900px) rotateX(${(.5 - y) * 6}deg) rotateY(${(x - .5) * 8}deg) translateY(-3px)`;
      t.style.setProperty("--fx-x", x * 100 + "%");
      t.style.setProperty("--fx-y", y * 100 + "%");
    }, { passive: true });
    function soltar(t) { if (!t) return; t.classList.remove("fx-activa"); t.style.transform = ""; }
    document.addEventListener("pointerleave", () => { soltar(actual); actual = null; });
  }

  /* ---------------- cursor luminoso ---------------- */
  if (raton && !quieto) {
    const punto = document.createElement("div"), aro = document.createElement("div");
    punto.id = "fx-cursor"; aro.id = "fx-cursor-aro";
    document.body.append(punto, aro);
    let mx = -100, my = -100, ax = -100, ay = -100;
    document.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX; my = e.clientY;
      html.classList.add("fx-raton");
      punto.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      const sobre = e.target.closest && e.target.closest("a, " + SEL_BOTON + ", input, select, textarea, label, [onclick]");
      aro.classList.toggle("fx-sobre", !!sobre);
    }, { passive: true });
    document.addEventListener("pointerleave", () => html.classList.remove("fx-raton"));
    (function seguir() {
      ax += (mx - ax) * .18; ay += (my - ay) * .18;
      aro.style.transform = `translate3d(${ax}px, ${ay}px, 0)`;
      requestAnimationFrame(seguir);
    })();
  }

  /* ---------------- fondo vivo: luces que se mueven, partículas y rejilla ---------------- */
  function fondo() {
    if (quieto || ahorro) return;
    const cv = document.createElement("canvas");
    cv.id = "fx-fondo";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const movil = !raton;
    let W = 0, H = 0, parts = [], t0 = performance.now(), mx = -1e4, my = -1e4;
    const c1 = getComputedStyle(html).getPropertyValue("--fx-c1").trim() || "233,205,148";
    const c2 = getComputedStyle(html).getPropertyValue("--fx-c2").trim() || "30,136,229";
    function medir() {
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(movil ? 22 : 55, Math.round(W * H / 26000));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + .4,
        vx: (Math.random() - .5) * .12, vy: -Math.random() * .22 - .04, a: Math.random() * .5 + .15, f: Math.random() * 6.28
      }));
    }
    medir();
    addEventListener("resize", medir, { passive: true });
    if (raton) addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; }, { passive: true });
    const luces = [
      { c: c1, r: .55, vx: .00007, vy: .00005, fx: 0, a: .085 },
      { c: c2, r: .5, vx: -.00005, vy: .00008, fx: 2, a: .075 },
      { c: c1, r: .35, vx: .00009, vy: -.00006, fx: 4, a: .05 }
    ];
    function dibujar(t) {
      if (document.hidden) return requestAnimationFrame(dibujar);
      const dt = t - t0;
      ctx.clearRect(0, 0, W, H);
      // luces: degradados grandes que derivan despacio
      luces.forEach(l => {
        const x = W * (.5 + .42 * Math.sin(dt * l.vx * 6.28 + l.fx)), y = H * (.5 + .38 * Math.cos(dt * l.vy * 6.28 + l.fx));
        const R = Math.max(W, H) * l.r;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, `rgba(${l.c},${l.a})`); g.addColorStop(1, `rgba(${l.c},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
      // rejilla que sólo se ve alrededor del ratón
      if (raton && mx > -1e3) {
        const paso = 46, rad = 220;
        ctx.lineWidth = 1;
        for (let x = Math.floor((mx - rad) / paso) * paso; x < mx + rad; x += paso) {
          const a = Math.max(0, 1 - Math.abs(x - mx) / rad) * .07;
          ctx.strokeStyle = `rgba(${c1},${a})`; ctx.beginPath(); ctx.moveTo(x + .5, my - rad); ctx.lineTo(x + .5, my + rad); ctx.stroke();
        }
        for (let y = Math.floor((my - rad) / paso) * paso; y < my + rad; y += paso) {
          const a = Math.max(0, 1 - Math.abs(y - my) / rad) * .07;
          ctx.strokeStyle = `rgba(${c1},${a})`; ctx.beginPath(); ctx.moveTo(mx - rad, y + .5); ctx.lineTo(mx + rad, y + .5); ctx.stroke();
        }
      }
      // partículas que suben como polvo con luz
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.f += .02;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
        const d = Math.hypot(p.x - mx, p.y - my), cerca = d < 160 ? (1 - d / 160) : 0;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${c1},${(p.a * (.6 + .4 * Math.sin(p.f)) + cerca * .5).toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r + cerca * 1.2, 0, 6.283);
        ctx.fill();
      });
      requestAnimationFrame(dibujar);
    }
    requestAnimationFrame(dibujar);
    requestAnimationFrame(() => cv.classList.add("fx-on"));
  }

  /* ---------------- enlaces internos con desplazamiento suave ---------------- */
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("href").length < 2) return;
    let dest = null;
    try { dest = document.querySelector(a.getAttribute("href")); } catch (_) {}
    if (!dest) return;
    e.preventDefault();
    dest.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", a.getAttribute("href"));
  });

  /* ---------------- arranque ---------------- */
  function iniciar() {
    titulares();
    textos();
    revelar();
    fondo();
    // contenido que las páginas pintan después (ligas, torneos…)
    let pendiente = false;
    new MutationObserver(() => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => { pendiente = false; revelar(); textos(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
