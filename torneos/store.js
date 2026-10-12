/* ==============================================================
   ALMACÉN · lee y guarda el torneo.
   - remoto: Supabase (lectura pública por REST, escrituras por la Edge Function)
   - local:  localStorage de este navegador (para probar o jugar sin internet)
   ============================================================== */
(function () {
  "use strict";
  const C = window.TORNEO_CONFIG || {};
  const LS = "torneo:", LSP = "torneo-priv:";
  const params = new URLSearchParams(location.search);
  let modo = params.has("local") || localStorage.getItem("torneo-modo") === "local" || !C.supabaseUrl ? "local" : "remoto";

  function hdr() { return { apikey: C.supabaseKey, Authorization: "Bearer " + C.supabaseKey }; }

  async function api(accion, cuerpo) {
    const r = await fetch(C.supabaseUrl + C.funcion, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, hdr()),
      body: JSON.stringify(Object.assign({ accion }, cuerpo))
    });
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) {
      const e = new Error(j.error || ("Error " + r.status));
      e.status = r.status;
      if (j.error === "conflicto_version") e.conflicto = true;
      throw e;
    }
    return j;
  }
  async function rest(ruta) {
    const r = await fetch(C.supabaseUrl + "/rest/v1/" + ruta, { headers: hdr(), cache: "no-store" });
    if (!r.ok) throw new Error("No se pudo leer (" + r.status + ")");
    return r.json();
  }

  /* ---------- local ---------- */
  const leerLS = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (_) { return def; } };
  const escribirLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  function idsLocales() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(LS)) out.push(k.slice(LS.length));
    }
    return out;
  }
  function telLocal(t) {
    let s = String(t || "").replace(/[^\d]/g, "");
    if (/^[6789]\d{8}$/.test(s)) s = "34" + s;
    return s;
  }

  const Store = {
    get modo() { return modo; },
    setModo(m) { modo = m; try { localStorage.setItem("torneo-modo", m); } catch (_) {} },
    get pushDisponible() { return modo === "remoto" && !!C.vapidPublica && "serviceWorker" in navigator && "PushManager" in window; },

    async listar() {
      if (modo === "local") {
        return idsLocales().map(codigo => {
          const d = leerLS(LS + codigo, {}).datos || {};
          return { codigo, nombre: d.nombre, fecha: d.fecha, lugar: d.lugar, fase: d.fase };
        });
      }
      return rest("torneos?select=codigo,updated_at,nombre:datos->>nombre,fecha:datos->>fecha,lugar:datos->>lugar,fase:datos->>fase&order=updated_at.desc&limit=50");
    },

    async cargar(codigo) {
      if (modo === "local") {
        const r = leerLS(LS + codigo, null);
        if (!r) throw new Error("No existe el torneo «" + codigo + "» en este navegador");
        return r;
      }
      const filas = await rest("torneos?codigo=eq." + encodeURIComponent(codigo) + "&select=datos,version");
      if (!filas.length) throw new Error("No existe el torneo «" + codigo + "»");
      return filas[0];
    },

    async version(codigo) {
      if (modo === "local") return (leerLS(LS + codigo, {}) || {}).version || 0;
      const f = await rest("torneos?codigo=eq." + encodeURIComponent(codigo) + "&select=version");
      return f.length ? f[0].version : 0;
    },

    async login(pass) {
      if (modo === "local") return { ok: true, push: false };
      return api("login", { pass });
    },

    async crear(codigo, datos, pass) {
      if (modo === "local") {
        if (localStorage.getItem(LS + codigo)) throw new Error("Ya existe un torneo con ese código");
        escribirLS(LS + codigo, { datos, version: 1 });
        return { version: 1 };
      }
      return api("crear", { codigo, datos, pass });
    },

    async guardar(codigo, datos, version, pass) {
      if (modo === "local") {
        const r = leerLS(LS + codigo, { version: 0 });
        if (r.version !== version) { const e = new Error("conflicto_version"); e.conflicto = true; throw e; }
        escribirLS(LS + codigo, { datos, version: version + 1 });
        return { version: version + 1 };
      }
      return api("guardar", { codigo, datos, version, pass });
    },

    async borrar(codigo, pass) {
      if (modo === "local") { localStorage.removeItem(LS + codigo); localStorage.removeItem(LSP + codigo); return; }
      return api("borrar", { codigo, pass });
    },

    async inscribir(codigo, equipo, telefono, pass, web) {
      if (modo === "local") {
        const r = leerLS(LS + codigo, null);
        if (!r) throw new Error("El torneo no existe");
        const cfg = r.datos.config;
        if (!pass && !cfg.inscripcionAbierta) throw new Error("Las inscripciones están cerradas");
        if (!pass && r.datos.equipos.filter(e => !e.baja).length >= cfg.maxEquipos) throw new Error("El torneo está completo");
        const e = window.TorneoEngine.añadirEquipo(r.datos, equipo);
        r.version++;
        escribirLS(LS + codigo, r);
        const priv = leerLS(LSP + codigo, { telefonos: {} });
        if (telefono) priv.telefonos[e.id] = telLocal(telefono);
        escribirLS(LSP + codigo, priv);
        return { equipo: e, token: "local", version: r.version };
      }
      return api("inscribir", { codigo, equipo, telefono, pass, web });
    },

    async privado(codigo, pass) {
      if (modo === "local") return Object.assign({ telefonos: {}, push: {} }, leerLS(LSP + codigo, {}));
      return api("privado", { codigo, pass });
    },

    async telefono(codigo, equipoId, telefono, pass) {
      if (modo === "local") {
        const priv = leerLS(LSP + codigo, { telefonos: {} });
        priv.telefonos[equipoId] = telLocal(telefono);
        escribirLS(LSP + codigo, priv);
        return { telefono: priv.telefonos[equipoId] };
      }
      return api("telefono", { codigo, equipoId, telefono, pass });
    },

    async avisar(codigo, pass, opciones) {
      if (modo === "local") return { enviados: 0, fallidos: 0, sinAviso: opciones.equipoIds || [], local: true };
      return api("avisar", Object.assign({ codigo, pass }, opciones));
    },

    async suscribir(codigo, equipoId, credencial, suscripcion) {
      return api("suscribir", Object.assign({ codigo, equipoId, suscripcion }, credencial));
    },
    async desuscribir(endpoint) { return api("desuscribir", { endpoint }); }
  };

  window.TorneoStore = Store;
})();
