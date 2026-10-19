/* ==============================================================
   ALMACÉN · lee y guarda el torneo.
   - remoto: Supabase (lectura pública por REST, escrituras por la Edge Function)
   - local:  localStorage de este navegador (para probar o jugar sin internet)
   ============================================================== */
(function () {
  "use strict";
  const C = window.TORNEO_CONFIG || {};
  const LS = "torneo:", LSP = "torneo-priv:", LSR = "torneo-res:";
  const params = new URLSearchParams(location.search);
  let modo = params.has("local") || localStorage.getItem("torneo-modo") === "local" || !C.supabaseUrl ? "local" : "remoto";

  // Sin claves: todas las lecturas y escrituras van a la Edge Function.
  async function api(accion, cuerpo) {
    const r = await fetch(C.supabaseUrl + C.funcion, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
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
  let vapid = null;                                   // clave pública de avisos (la da el servidor)

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
    get pushDisponible() { return modo === "remoto" && !!vapid && "serviceWorker" in navigator && "PushManager" in window; },
    get vapidPublica() { return vapid; },
    async cargarConfig() {
      if (modo !== "remoto") return;
      try { vapid = (await api("config", {})).vapidPublica || null; } catch (_) { vapid = null; }
    },

    async listar(pass) {
      if (modo === "local") {
        return idsLocales().map(codigo => {
          const d = leerLS(LS + codigo, {}).datos || {};
          return { codigo, nombre: d.nombre, fecha: d.fecha, lugar: d.lugar, fase: d.fase };
        });
      }
      return (await api("listar", { pass })).torneos;
    },

    async cargar(codigo) {
      if (modo === "local") {
        const r = leerLS(LS + codigo, null);
        if (!r) throw new Error("No existe el torneo «" + codigo + "» en este navegador");
        return r;
      }
      return api("estado", { codigo });
    },

    async version(codigo) {
      if (modo === "local") return (leerLS(LS + codigo, {}) || {}).version || 0;
      return (await api("version", { codigo })).version;
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

    async limpiar(codigo, pass) {
      if (modo === "local") { localStorage.removeItem(LSP + codigo); localStorage.removeItem(LSR + codigo); return { ok: true }; }
      return api("limpiar", { codigo, pass });
    },

    async avisar(codigo, pass, opciones) {
      if (modo === "local") return { enviados: 0, fallidos: 0, sinAviso: opciones.equipoIds || [], local: true };
      return api("avisar", Object.assign({ codigo, pass }, opciones));
    },

    // ---------- resultados enviados por las parejas (QR de las mesas) ----------
    async proponer(codigo, k, datos) {
      if (modo === "local") {
        const r = leerLS(LS + codigo, null);
        if (!r || (r.datos.config.resultadosParejas || "no") === "no") throw new Error("En este torneo los resultados los apunta la organización");
        const p = r.datos.partidos.find(x => x.id === datos.partidoId);
        if (!p || !p.a || !p.b) throw new Error("Ese partido no existe o aún no tiene rivales");
        if (p.estado === "fin") throw new Error("Ese partido ya tiene resultado. Si está mal, avisa a la organización.");
        const lista = leerLS(LSR + codigo, []);
        lista.forEach(x => { if (x.partido_id === datos.partidoId && x.estado === "pendiente") x.estado = "reemplazada"; });
        lista.push({ id: Date.now(), partido_id: datos.partidoId, ra: datos.ra, rb: datos.rb, goles: datos.goles || null, wo: datos.wo || null, mesa: datos.mesa || null, estado: "pendiente", creado: new Date().toISOString() });
        escribirLS(LSR + codigo, lista);
        return { ok: true, modo: r.datos.config.resultadosParejas };
      }
      return api("proponer", Object.assign({ codigo, k }, datos));
    },
    async propuestas(codigo, pass) {
      if (modo === "local") return leerLS(LSR + codigo, []).filter(x => x.estado === "pendiente");
      return (await api("propuestas", { codigo, pass })).propuestas;
    },
    async resolverPropuesta(codigo, pass, id, estado, motivo) {
      if (modo === "local") {
        const lista = leerLS(LSR + codigo, []);
        lista.forEach(x => { if (x.id === id) { x.estado = estado; x.motivo = motivo || null; } });
        escribirLS(LSR + codigo, lista);
        return { ok: true };
      }
      return api("resolverPropuesta", { codigo, pass, id, estado, motivo });
    },
    async tokenMesas(codigo, pass, nuevo) {
      if (modo === "local") return "local";
      return (await api("tokenMesas", { codigo, pass, nuevo: !!nuevo })).token;
    },

    async suscribir(codigo, equipoId, credencial, suscripcion) {
      return api("suscribir", Object.assign({ codigo, equipoId, suscripcion }, credencial));
    },
    async desuscribir(endpoint) { return api("desuscribir", { endpoint }); }
  };

  window.TorneoStore = Store;
})();
