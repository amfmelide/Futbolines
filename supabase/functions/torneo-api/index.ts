// =====================================================================
// Edge Function "torneo-api" · AMF Melide
// Todas las escrituras de la herramienta de torneos pasan por aquí.
//
// Secretos necesarios (supabase secrets set ...):
//   TORNEO_ADMIN_PASS   contraseña del organizador
// Necesita también el SQL 20261013000000_freno_accesos.sql (freno contra adivinar contraseñas).
//   VAPID_PUBLIC_KEY    } claves Web Push  (npx web-push generate-vapid-keys)
//   VAPID_PRIVATE_KEY   }
//   VAPID_SUBJECT       mailto:<correo de la asociación>
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen en todas las funciones.)
//
// Desplegar sin verificación JWT (la página usa la clave pública):
//   supabase functions deploy torneo-api --no-verify-jwt
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const VAPID_PUB = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
if (VAPID_PUB && VAPID_PRIV) {
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", VAPID_PUB, VAPID_PRIV);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
class Fallo extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

// ---------- freno contra quien intenta adivinar contraseñas (guardado en la base de datos) ----------
//  · por IP: 5 fallos en 15 min → bloqueo de 15 min que se duplica en cada reincidencia (hasta 24 h)
//  · global por acción: 40 fallos en 10 min entre todas las IP → 10 min de pausa
//  Si falta la tabla (SQL sin ejecutar) se deniega el acceso: nunca se deja pasar sin freno.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rpcFreno(fn: string, args: Record<string, unknown>): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_SRV, Authorization: "Bearer " + SB_SRV, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error("Falta el SQL del freno de accesos (20261013000000_freno_accesos.sql)");
  const t = await r.text();
  return t ? Number(JSON.parse(t)) || 0 : 0;
}
function ipDe(req: Request) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
}
function igualSeguro(a: unknown, secreto: string | undefined) {
  if (!secreto || typeof a !== "string" || a.length !== secreto.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ secreto.charCodeAt(i);
  return d === 0;
}
async function esperaFreno(accion: string, ip: string) {
  const [a, b] = await Promise.all([rpcFreno("acceso_espera", { p_clave: `${accion}|${ip}` }), rpcFreno("acceso_espera", { p_clave: `${accion}|*` })]);
  return Math.max(a, b);
}
async function apuntarFallo(accion: string, ip: string) {
  const [a, b] = await Promise.all([
    rpcFreno("acceso_fallo", { p_clave: `${accion}|${ip}`, p_max: 5, p_ventana_seg: 900, p_castigo_seg: 900 }),
    rpcFreno("acceso_fallo", { p_clave: `${accion}|*`, p_max: 40, p_ventana_seg: 600, p_castigo_seg: 600 }),
  ]);
  await new Promise((r) => setTimeout(r, 600));          // cada intento fallido tarda más
  return Math.max(a, b);
}
// Comprueba un valor contra un secreto con freno. {ok, espera}
async function comprobarConFreno(accion: string, ip: string, valor: unknown, secreto: string | undefined) {
  const espera = await esperaFreno(accion, ip);
  if (espera > 0) return { ok: false, espera };
  if (igualSeguro(valor, secreto)) { await rpcFreno("acceso_ok", { p_clave: `${accion}|${ip}` }); return { ok: true, espera: 0 }; }
  return { ok: false, espera: await apuntarFallo(accion, ip) };
}
// Límite de uso (no de contraseña): p. ej. inscripciones o resultados enviados por las parejas
async function limitarUso(accion: string, ip: string, max: number, ventanaSeg: number) {
  const espera = await rpcFreno("acceso_espera", { p_clave: `${accion}|${ip}` });
  if (espera > 0) return espera;
  await rpcFreno("acceso_fallo", { p_clave: `${accion}|${ip}`, p_max: max, p_ventana_seg: ventanaSeg, p_castigo_seg: ventanaSeg });
  return 0;
}

// Contraseña de organizador con freno. Sin contraseña → false sin contar como fallo.
async function adminValido(b: any): Promise<boolean> {
  if (b.pass == null || b.pass === "") return false;
  const r = await comprobarConFreno("torneo-admin", b.__ip, b.pass, Deno.env.get("TORNEO_ADMIN_PASS"));
  if (r.espera > 0) throw new Fallo(`Demasiados intentos. Espera ${Math.ceil(r.espera / 60)} min.`, 429);
  return r.ok;
}
async function exigirAdmin(b: any) {
  if (!(await adminValido(b))) throw new Fallo("Contraseña incorrecta", 401);
}

async function sha256(txt: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function aleatorio(n = 16) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Deja sólo dígitos; los móviles españoles de 9 cifras se guardan con prefijo 34.
function normalizarTelefono(t: unknown): string {
  let s = String(t ?? "").replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  if (/^[6789]\d{8}$/.test(s)) s = "34" + s;
  return s;
}
function texto(v: unknown, max = 60) {
  return String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

async function cargarTorneo(codigo: string) {
  const { data, error } = await db.from("torneos").select("datos, version").eq("codigo", codigo).maybeSingle();
  if (error) throw new Fallo(error.message, 500);
  if (!data) throw new Fallo("El torneo no existe", 404);
  return data as { datos: any; version: number };
}

// ---------------------------------------------------------------------
// Borra teléfonos y suscripciones de avisos de un torneo (al terminar ya no hacen falta).
async function limpiarDatosPrivados(codigo: string) {
  await db.from("torneo_push").delete().eq("codigo", codigo);
  await db.from("torneo_inscripciones").delete().eq("codigo", codigo);
}

const acciones: Record<string, (b: any) => Promise<unknown>> = {
  // ---------- público (sin claves en la página: se lee a través de aquí) ----------
  async estado(b) {
    const { datos, version } = await cargarTorneo(texto(b.codigo));
    return { datos, version };
  },

  async version(b) {
    const { data } = await db.from("torneos").select("version").eq("codigo", texto(b.codigo)).maybeSingle();
    return { version: data?.version ?? 0 };
  },

  // Clave PÚBLICA de los avisos (la privada nunca sale del servidor)
  async config() {
    return { vapidPublica: VAPID_PUB || null };
  },

  // Inscripción pública (o del organizador, que puede saltarse el cierre y el máximo).
  async inscribir(b) {
    const codigo = texto(b.codigo);
    const admin = await adminValido(b);
    const { datos } = await cargarTorneo(codigo);
    const cfg = datos.config ?? {};
    if (!admin && !cfg.inscripcionAbierta) throw new Fallo("Las inscripciones están cerradas");
    if (!admin && b.web) throw new Fallo("Error");                   // campo trampa anti-bots
    if (!admin && (await limitarUso("inscribir", b.__ip, 10, 3600))) throw new Fallo("Demasiadas inscripciones desde este dispositivo. Prueba más tarde.", 429);
    const telefono = normalizarTelefono(b.telefono);
    if (!admin && !/^\d{9,15}$/.test(telefono)) throw new Fallo("Teléfono no válido");
    const j1 = texto(b.equipo?.j1), j2 = texto(b.equipo?.j2);
    if (!admin && (!j1 || !j2)) throw new Fallo("Faltan los nombres de los jugadores");
    if (telefono && !admin) {
      const { count } = await db.from("torneo_inscripciones").select("id", { count: "exact", head: true })
        .eq("codigo", codigo).eq("telefono", telefono);
      if ((count ?? 0) > 0) throw new Fallo("Ese teléfono ya tiene una pareja inscrita");
    }
    const divs: { id: string }[] = Array.isArray(cfg.divisiones) && cfg.divisiones.length ? cfg.divisiones : [{ id: "d1" }];
    const division = divs.some((d) => d.id === b.equipo?.division) ? b.equipo.division : divs[0].id;
    const equipo = {
      id: "e" + Date.now().toString(36) + aleatorio(3),
      division,
      nombre: texto(b.equipo?.nombre) || `${j1} / ${j2}`,
      j1, j2,
      ranking: admin && b.equipo?.ranking ? Number(b.equipo.ranking) : null,
      baja: false, presente: false, alta: Date.now(),
    };
    const token = aleatorio(16);
    const { data: version, error } = await db.rpc("torneo_inscribir", {
      p_codigo: codigo, p_equipo: equipo, p_max: admin ? null : (cfg.maxEquipos ?? 200),
    });
    if (error) throw new Fallo(error.message.includes("completo") ? "El torneo está completo" : error.message, 409);
    const { error: e2 } = await db.from("torneo_inscripciones").insert({
      codigo, equipo_id: equipo.id, telefono: telefono || null, token_hash: await sha256(token),
    });
    if (e2) throw new Fallo(e2.message, 500);
    return { equipo, token, version };
  },

  // Un móvil se apunta a los avisos de su pareja (con el token de la inscripción o con el teléfono).
  async suscribir(b) {
    const codigo = texto(b.codigo), equipoId = texto(b.equipoId);
    const sub = b.suscripcion;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Fallo("Suscripción no válida");
    const { data: ins } = await db.from("torneo_inscripciones").select("telefono, token_hash")
      .eq("codigo", codigo).eq("equipo_id", equipoId).maybeSingle();
    if (!ins) throw new Fallo("Esa pareja no tiene teléfono registrado; pide al organizador que lo añada", 404);
    const okToken = b.token && ins.token_hash && (await sha256(String(b.token))) === ins.token_hash;
    const tel = normalizarTelefono(b.telefono);
    const esperaTel = await esperaFreno("suscribir", b.__ip);
    if (esperaTel > 0) throw new Fallo(`Demasiados intentos. Espera ${Math.ceil(esperaTel / 60)} min.`, 429);
    const okTel = tel && ins.telefono && tel.slice(-9) === String(ins.telefono).slice(-9);
    if (!okToken && !okTel && !b.pass) await apuntarFallo("suscribir", b.__ip);
    if (!okToken && !okTel && !(await adminValido(b))) throw new Fallo("El teléfono no coincide con el de la inscripción", 403);
    const { error } = await db.from("torneo_push").upsert(
      { codigo, equipo_id: equipoId, endpoint: sub.endpoint, suscripcion: sub, ultimo_ok: new Date().toISOString() },
      { onConflict: "endpoint" },
    );
    if (error) throw new Fallo(error.message, 500);
    return { ok: true };
  },

  async desuscribir(b) {
    if (b.endpoint) await db.from("torneo_push").delete().eq("endpoint", String(b.endpoint));
    return { ok: true };
  },

  // ---------- sólo organizador ----------
  async login(b) {
    await exigirAdmin(b);
    return { ok: true, push: !!(VAPID_PUB && VAPID_PRIV) };
  },

  async listar(b) {
    await exigirAdmin(b);
    const { data, error } = await db.from("torneos").select("codigo, updated_at, datos->>nombre, datos->>fecha, datos->>lugar, datos->>fase")
      .order("updated_at", { ascending: false }).limit(50);
    if (error) throw new Fallo(error.message, 500);
    return { torneos: (data ?? []).map((r: any) => ({ codigo: r.codigo, nombre: r.nombre, fecha: r.fecha, lugar: r.lugar, fase: r.fase })) };
  },

  // Fin del torneo: se borran teléfonos y avisos (un torneo nuevo empieza de cero)
  async limpiar(b) {
    await exigirAdmin(b);
    await limpiarDatosPrivados(texto(b.codigo));
    return { ok: true };
  },

  async crear(b) {
    await exigirAdmin(b);
    const codigo = texto(b.codigo);
    if (!/^[a-z0-9-]{3,60}$/.test(codigo)) throw new Fallo("Código no válido (minúsculas, números y guiones)");
    const { error } = await db.from("torneos").insert({ codigo, datos: b.datos, version: 1 });
    if (error) throw new Fallo(error.code === "23505" ? "Ya existe un torneo con ese código" : error.message, 409);
    // Por si alguno se quedó sin limpiar: borrar teléfonos y avisos de los torneos ya terminados
    const { data: viejos } = await db.from("torneos").select("codigo").eq("datos->>fase", "terminado");
    for (const v of viejos ?? []) await limpiarDatosPrivados(v.codigo);
    return { version: 1 };
  },

  async guardar(b) {
    await exigirAdmin(b);
    const { data, error } = await db.rpc("torneo_guardar", { p_codigo: texto(b.codigo), p_datos: b.datos, p_version: b.version });
    if (error) {
      if (error.message.includes("conflicto")) throw new Fallo("conflicto_version", 409);
      throw new Fallo(error.message, 500);
    }
    if (b.datos?.fase === "terminado") await limpiarDatosPrivados(texto(b.codigo));   // torneo acabado → fuera teléfonos y avisos
    return { version: data };
  },

  async borrar(b) {
    await exigirAdmin(b);
    await limpiarDatosPrivados(texto(b.codigo));
    await db.from("torneos").delete().eq("codigo", texto(b.codigo));
    return { ok: true };
  },

  // Teléfonos y nº de móviles con avisos activados de cada pareja.
  async privado(b) {
    await exigirAdmin(b);
    const codigo = texto(b.codigo);
    const [{ data: ins }, { data: subs }] = await Promise.all([
      db.from("torneo_inscripciones").select("equipo_id, telefono").eq("codigo", codigo),
      db.from("torneo_push").select("equipo_id").eq("codigo", codigo),
    ]);
    const telefonos: Record<string, string> = {}, push: Record<string, number> = {};
    (ins ?? []).forEach((r) => r.telefono && (telefonos[r.equipo_id] = r.telefono));
    (subs ?? []).forEach((r) => (push[r.equipo_id] = (push[r.equipo_id] ?? 0) + 1));
    return { telefonos, push };
  },

  async telefono(b) {
    await exigirAdmin(b);
    const codigo = texto(b.codigo), equipo_id = texto(b.equipoId);
    const telefono = normalizarTelefono(b.telefono) || null;
    const { error } = await db.from("torneo_inscripciones").upsert({ codigo, equipo_id, telefono }, { onConflict: "codigo,equipo_id" });
    if (error) throw new Fallo(error.message, 500);
    return { telefono };
  },

  // Envía un push a los móviles de las parejas indicadas.
  async avisar(b) {
    await exigirAdmin(b);
    if (!VAPID_PUB || !VAPID_PRIV) throw new Fallo("Faltan las claves VAPID en los secretos de Supabase", 500);
    const codigo = texto(b.codigo);
    const ids: string[] = Array.isArray(b.equipoIds) ? b.equipoIds.map(String).slice(0, 400) : [];
    let q = db.from("torneo_push").select("id, equipo_id, suscripcion").eq("codigo", codigo);
    if (!b.todos) q = q.in("equipo_id", ids);
    const { data: subs, error } = await q;
    if (error) throw new Fallo(error.message, 500);
    const payload = JSON.stringify({
      titulo: texto(b.titulo, 80) || "Torneo",
      cuerpo: texto(b.cuerpo, 240),
      url: texto(b.url, 300) || undefined,
      tag: texto(b.tag, 60) || undefined,
    });
    const conAviso = new Set<string>();
    let enviados = 0, fallidos = 0;
    const caducadas: number[] = [];
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(s.suscripcion, payload, { TTL: 600, urgency: "high" });
        enviados++; conAviso.add(s.equipo_id);
      } catch (e: any) {
        fallidos++;
        if (e?.statusCode === 404 || e?.statusCode === 410) caducadas.push(s.id);
      }
    }));
    if (caducadas.length) await db.from("torneo_push").delete().in("id", caducadas);
    return { enviados, fallidos, sinAviso: b.todos ? [] : ids.filter((id) => !conAviso.has(id)) };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const b = await req.json();
    if (b && typeof b === "object") b.__ip = ipDe(req);        // la pone el servidor; el cliente no puede falsearla en el cuerpo
    const fn = acciones[b?.accion];
    if (!fn) return json({ error: "Acción desconocida" }, 400);
    return json(await fn(b));
  } catch (e) {
    const status = e instanceof Fallo ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
