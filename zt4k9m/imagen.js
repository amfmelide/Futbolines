/* ==============================================================
   Imagen de resultados para redes (Instagram / WhatsApp)
   Dibuja un PNG 1080×1350 con el podio de cada categoría.
   Uso:
     const blob = await TImagen.generar({ titulo, sub, bloques: [{ nombre, podio: [{ pos, nombre, detalle }] }] });
     TImagen.compartir(blob, "resultados.png");
   ============================================================== */
(function () {
  "use strict";
  const W = 1080, H = 1350;
  const ORO = "#e9cd94", ORO2 = "#b08d4f", TXT = "#e8edf5", DIM = "#8a9bb3";
  const MEDALLA = { 1: "#e9cd94", 2: "#c9d1db", 3: "#cd8b5a" };

  function cargarImagen(src) {
    return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }

  // Recorta el texto con «…» para que quepa en el ancho
  function ajustar(ctx, txt, ancho) {
    txt = String(txt || "");
    if (ctx.measureText(txt).width <= ancho) return txt;
    while (txt.length > 1 && ctx.measureText(txt + "…").width > ancho) txt = txt.slice(0, -1);
    return txt + "…";
  }

  async function generar(o) {
    try { await Promise.all([document.fonts.load('80px "Bebas Neue"'), document.fonts.load('700 40px "Barlow"'), document.fonts.load('40px "Barlow"')]); } catch (_) {}
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    // fondo
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0a0e1a"); g.addColorStop(1, "#141c30");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const luz = ctx.createRadialGradient(W * 0.8, 120, 20, W * 0.8, 120, 700);
    luz.addColorStop(0, "rgba(233,205,148,.20)"); luz.addColorStop(1, "rgba(233,205,148,0)");
    ctx.fillStyle = luz; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(233,205,148,.35)"; ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, W - 56, H - 56);

    // cabecera
    const logo = await cargarImagen(o.logo || "logo-amf.png");   // logo original de la AMF (fondo blanco)
    if (logo) {
      ctx.save(); redondo(ctx, 50, 56, 128, 128, 22); ctx.clip();
      ctx.fillStyle = "#fff"; ctx.fillRect(50, 56, 128, 128);
      ctx.drawImage(logo, 50, 56, 128, 128); ctx.restore();
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ORO; ctx.font = '86px "Bebas Neue", Impact, sans-serif';
    ctx.fillText(ajustar(ctx, (o.titulo || "Resultados").toUpperCase(), W - 230), 200, 140);
    ctx.fillStyle = DIM; ctx.font = '32px "Barlow", sans-serif';
    ctx.fillText(ajustar(ctx, o.sub || "", W - 230), 202, 186);

    // bloques (categorías)
    const bloques = (o.bloques || []).filter(b => b.podio && b.podio.length).slice(0, 4);
    const top = 240, bottom = H - 110;
    // 1-2 categorías: una debajo de otra (centradas) · 3-4: cuadrícula de 2×2
    const cols = bloques.length >= 3 ? 2 : 1;
    const filasDe = b => b.podio.slice(0, 4);
    const altoIdeal = b => 110 + filasDe(b).length * 150;
    let celdas;
    if (cols === 1) {
      const total = bloques.reduce((s, b) => s + altoIdeal(b), 0);
      const k = Math.min(1, (bottom - top) / Math.max(1, total));
      let y = top + Math.max(0, ((bottom - top) - total * k) / 2);
      celdas = bloques.map(b => { const h = altoIdeal(b) * k; const c = { x: 60, y, w: W - 120, h }; y += h; return c; });
    } else {
      const filas = Math.ceil(bloques.length / 2), gap = 20, w = (W - 120 - gap) / 2, h = (bottom - top - gap * (filas - 1)) / filas;
      celdas = bloques.map((b, i) => ({ x: (i === bloques.length - 1 && bloques.length % 2) ? (W - w) / 2 : 60 + (i % 2) * (w + gap), y: top + Math.floor(i / 2) * (h + gap), w, h }));
    }
    bloques.forEach((b, i) => {
      const { x, y: y0, w, h: alto } = celdas[i];
      ctx.fillStyle = "rgba(255,255,255,.04)";
      redondo(ctx, x, y0 + 8, w, alto - 16, 24); ctx.fill();
      ctx.strokeStyle = "rgba(233,205,148,.18)"; ctx.lineWidth = 2; ctx.stroke();
      const filas = filasDe(b);
      const cab = Math.min(100, alto * 0.2);
      const paso = Math.min(150, (alto - cab - 30) / Math.max(1, filas.length));
      ctx.fillStyle = ORO2; ctx.font = `${Math.round(Math.min(52, cab * 0.55))}px "Bebas Neue", Impact, sans-serif`;
      ctx.fillText(ajustar(ctx, "🏆 " + String(b.nombre || "").toUpperCase(), w - 60), x + 32, y0 + cab * 0.72);
      const cx = x + 32 + Math.min(40, paso * 0.27);
      filas.forEach((f, k) => {
        const y = y0 + cab + 6 + k * paso;
        const r = Math.min(40, paso * 0.27);
        ctx.fillStyle = MEDALLA[f.pos] || "#556";
        ctx.beginPath(); ctx.arc(cx, y + r, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0a0e1a"; ctx.font = `700 ${Math.round(r * 1.1)}px "Barlow", sans-serif`; ctx.textAlign = "center";
        ctx.fillText(String(f.pos), cx, y + r * 1.38); ctx.textAlign = "left";
        const tam = Math.round(Math.min(f.pos === 1 ? 54 : 44, paso * (f.pos === 1 ? 0.36 : 0.3), cols === 2 ? 34 : 99));
        const tx = cx + r + 22, ancho = x + w - tx - 20;
        ctx.fillStyle = f.pos === 1 ? TXT : "#cfd8e3";
        ctx.font = `700 ${tam}px "Barlow", sans-serif`;
        const conDet = f.detalle && paso > 70;
        ctx.fillText(ajustar(ctx, f.nombre, ancho), tx, y + (conDet ? r * 0.9 : r + tam * 0.36));
        if (conDet) {
          ctx.fillStyle = DIM; ctx.font = `${Math.round(Math.min(30, paso * 0.2, tam * 0.75))}px "Barlow", sans-serif`;
          ctx.fillText(ajustar(ctx, f.detalle, ancho), tx + 2, y + r * 0.9 + Math.min(42, paso * 0.3));
        }
      });
    });
    if (!bloques.length) {
      ctx.fillStyle = DIM; ctx.font = '40px "Barlow", sans-serif'; ctx.textAlign = "center";
      ctx.fillText("Aún no hay resultados finales", W / 2, H / 2); ctx.textAlign = "left";
    }

    // pie
    ctx.fillStyle = DIM; ctx.font = '28px "Barlow", sans-serif'; ctx.textAlign = "center";
    ctx.fillText(o.pie || "Asociación Melide Futbolín · amfmelide.es", W / 2, H - 62); ctx.textAlign = "left";

    return new Promise(res => cv.toBlob(res, "image/png"));
  }

  function redondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // Comparte la imagen (móvil) o la descarga (ordenador)
  async function compartir(blob, nombreArchivo, texto) {
    const file = new File([blob], nombreArchivo, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: texto || "" }); return "compartida"; }
      catch (e) { if (e && e.name === "AbortError") return "cancelada"; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombreArchivo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "descargada";
  }

  // Ventana con la vista previa y los botones compartir / descargar
  async function mostrar(o, nombreArchivo) {
    const blob = await generar(o);
    const url = URL.createObjectURL(blob);
    const fondo = document.createElement("div");
    fondo.className = "modal-bg";
    fondo.innerHTML = `<div class="modal" style="max-width:520px"><h3>Imagen para redes</h3>
      <img src="${url}" alt="Resultados" style="width:100%;border-radius:12px;margin:8px 0 12px">
      <div class="row"><button class="btn pri" data-comp>📤 Compartir / descargar</button><span class="spacer"></span><button class="btn" data-cerrar>Cerrar</button></div></div>`;
    document.body.appendChild(fondo);
    const cerrar = () => { fondo.remove(); URL.revokeObjectURL(url); };
    fondo.addEventListener("click", e => { if (e.target === fondo || e.target.closest("[data-cerrar]")) cerrar(); });
    fondo.querySelector("[data-comp]").onclick = () => compartir(blob, nombreArchivo || "resultados.png", o.titulo);
  }

  window.TImagen = { generar, compartir, mostrar };
})();
