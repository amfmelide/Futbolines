// =====================================================================
// Edge Function "torneo-api" · AMF Melide
// Todas las escrituras de la herramienta de torneos pasan por aquí.
//
// Secretos necesarios (supabase secrets set ...):
//   TORNEO_ADMIN_PASS   contraseña del organizador
//   VAPID_PUBLIC_KEY    } claves Web Push  (npx web-push generate-vapid-keys)
//   VAPID_PRIVATE_KEY   }
//   VAPID_SUBJECT       mailto:tu-correo@ejemplo.com
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

function esAdmin(pass: unknown): boolean {
  const ok = Deno.env.get("TORNEO_ADMIN_PASS") ?? "";
  if (!ok || typeof pass !== "string" || pass.length !== ok.length) return false;
  let d = 0;
  for (let i = 0; i < ok.length; i++) d |= ok.charCodeAt(i) ^ pass.charCodeAt(i);
  return d === 0;
}
function exigirAdmin(pass: unknown) {
  if (!esAdmin(pass)) throw new Fallo("Contraseña incorrecta", 401);
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
const acciones: Record<string, (b: any) => Promise<unknown>> = {
  // Inscripción pública (o del organizador, que puede saltarse el cierre y el máximo).
  async inscribir(b) {
    const codigo = texto(b.codigo);
    const admin = esAdmin(b.pass);
    const { datos } = await cargarTorneo(codigo);
    const cfg = datos.config ?? {};
    if (!admin && !cfg.inscripcionAbierta) throw new Fallo("Las inscripciones están cerradas");
    if (!admin && b.web) throw new Fallo("Error");                   // campo trampa anti-bots
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
    const okTel = tel && ins.telefono && tel.slice(-9) === String(ins.telefono).slice(-9);
    if (!okToken && !okTel && !esAdmin(b.pass)) throw new Fallo("El teléfono no coincide con el de la inscripción", 403);
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
    exigirAdmin(b.pass);
    return { ok: true, push: !!(VAPID_PUB && VAPID_PRIV) };
  },

  async crear(b) {
    exigirAdmin(b.pass);
    const codigo = texto(b.codigo);
    if (!/^[a-z0-9-]{3,60}$/.test(codigo)) throw new Fallo("Código no válido (minúsculas, números y guiones)");
    const { error } = await db.from("torneos").insert({ codigo, datos: b.datos, version: 1 });
    if (error) throw new Fallo(error.code === "23505" ? "Ya existe un torneo con ese código" : error.message, 409);
    return { version: 1 };
  },

  async guardar(b) {
    exigirAdmin(b.pass);
    const { data, error } = await db.rpc("torneo_guardar", { p_codigo: texto(b.codigo), p_datos: b.datos, p_version: b.version });
    if (error) {
      if (error.message.includes("conflicto")) throw new Fallo("conflicto_version", 409);
      throw new Fallo(error.message, 500);
    }
    return { version: data };
  },

  async borrar(b) {
    exigirAdmin(b.pass);
    await db.from("torneos").delete().eq("codigo", texto(b.codigo));
    return { ok: true };
  },

  // Teléfonos y nº de móviles con avisos activados de cada pareja.
  async privado(b) {
    exigirAdmin(b.pass);
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
    exigirAdmin(b.pass);
    const codigo = texto(b.codigo), equipo_id = texto(b.equipoId);
    const telefono = normalizarTelefono(b.telefono) || null;
    const { error } = await db.from("torneo_inscripciones").upsert({ codigo, equipo_id, telefono }, { onConflict: "codigo,equipo_id" });
    if (error) throw new Fallo(error.message, 500);
    return { telefono };
  },

  // Envía un push a los móviles de las parejas indicadas.
  async avisar(b) {
    exigirAdmin(b.pass);
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
    const fn = acciones[b?.accion];
    if (!fn) return json({ error: "Acción desconocida" }, 400);
    return json(await fn(b));
  } catch (e) {
    const status = e instanceof Fallo ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
