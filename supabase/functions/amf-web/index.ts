// =====================================================================
// Edge Function "amf-web" · AMF Melide
// Intermediario para que en las páginas de la web NO aparezca ninguna
// clave, contraseña ni huella:
//   - lecturas públicas (liga, calendario, recuerdos)  → se hacen aquí
//   - funciones con contraseña (guardar-liga, recuerdos-admin, rpc del
//     calendario) → se reenvían desde aquí
//   - contraseñas de la web (Admin de la portada, PIN del control de
//     mesas, Liga Monterroso) → se comprueban aquí contra los secretos
//
// Secretos (Supabase → Edge Functions → Secrets):
//   AMF_ADMIN_PASS    contraseña del Admin de la portada (⚙)
//   MESAS_PIN         PIN del control de mesas (index_futbolines.html)
//   MONTERROSO_PASS   contraseña de la Liga Monterroso (k7m2x9): entrar y guardar ("union-guardar")
//   SORTEO_PASS       contraseña del sorteo en directo (sorteo.html)
//   TORNEOS_PANEL     ruta del panel de torneos (p. ej. zt4k9m/xxxx.html);
//                     sólo se entrega tras meter la contraseña del Admin
// (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya existen en todas las funciones.)
// Necesita el SQL supabase/migrations/20261013000000_freno_accesos.sql (freno contra adivinar contraseñas).
//
// Desplegar sin verificación JWT:  supabase functions deploy amf-web --no-verify-jwt
// =====================================================================

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-destino",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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

async function comprobar(req: Request, accion: string, valor: unknown, secreto: string | undefined) {
  const r = await comprobarConFreno(accion, ipDe(req), valor, secreto);
  return { ok: r.ok, status: r.ok ? 200 : r.espera > 0 ? 429 : 401, espera: r.espera };
}

const cabecerasSB = { apikey: ANON, Authorization: "Bearer " + ANON };

// Tablas que ya eran de lectura pública (se leen con la clave pública, así que se respetan las mismas reglas RLS)
const TABLAS = new Set(["liga_publica", "calendario_torneos", "recuerdos_ediciones", "recuerdos_medios"]);
const RPCS = new Set(["calendario_check", "calendario_guardar", "calendario_borrar"]);
const FUNCIONES = new Set(["guardar-liga", "recuerdos-admin"]);

async function reenviar(url: string, init: RequestInit) {
  const r = await fetch(url, init);
  const cuerpo = await r.text();
  return new Response(cuerpo, { status: r.status, headers: { ...CORS, "Content-Type": r.headers.get("content-type") ?? "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const u = new URL(req.url);

  // Subida de fotos de Recuerdos a una URL firmada de Storage (cuerpo binario)
  if (u.searchParams.get("accion") === "subir") {
    let destino = req.headers.get("x-destino") ?? "";
    if (destino.startsWith("/storage/")) destino = URL_SB + destino;
    if (!destino.startsWith(URL_SB + "/storage/v1/object/upload/sign/")) return json({ error: "Destino no permitido" }, 400);
    return reenviar(destino, {
      method: "PUT",
      headers: { ...cabecerasSB, "Content-Type": req.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "max-age=31536000", "x-upsert": "false" },
      body: req.body,
    });
  }

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "Petición no válida" }, 400); }
  try { return await atender(req, b); }
  catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 503); }
});

async function atender(req: Request, b: any): Promise<Response> {

  switch (b?.accion) {
    // ---------- lecturas públicas ----------
    case "leer": {
      const tabla = String(b.tabla ?? "");
      if (!TABLAS.has(tabla)) return json({ error: "Tabla no permitida" }, 400);
      const consulta = String(b.consulta ?? "").slice(0, 500);
      return reenviar(`${URL_SB}/rest/v1/${tabla}?${consulta}`, { headers: cabecerasSB });
    }
    // ---------- funciones que ya piden su contraseña ----------
    case "rpc": {
      const fn = String(b.fn ?? "");
      if (!RPCS.has(fn)) return json({ error: "Función no permitida" }, 400);
      return reenviar(`${URL_SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...cabecerasSB, "Content-Type": "application/json" }, body: JSON.stringify(b.datos ?? {}) });
    }
    case "funcion": {
      const fn = String(b.fn ?? "");
      if (!FUNCIONES.has(fn)) return json({ error: "Función no permitida" }, 400);
      return reenviar(`${URL_SB}/functions/v1/${fn}`, {
        method: "POST",
        headers: { ...cabecerasSB, "Content-Type": "application/json", "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "" },
        body: JSON.stringify(b.datos ?? {}),
      });
    }
    // ---------- contraseñas de la web ----------
    case "admin": {           // Admin de la portada: devuelve el menú (incluido el panel de torneos)
      const r = await comprobar(req, "admin", b.pass, Deno.env.get("AMF_ADMIN_PASS"));
      if (!r.ok) return json({ ok: false, espera: r.espera }, r.status);
      const enlaces = [
        { icono: "📝", titulo: "Gestión de inscripciones", texto: "Ver y editar inscritos al torneo", url: "INSCRIPCIONES.HTML?admin=1" },
        { icono: "⚽", titulo: "Control de mesas", texto: "Panel de gestión de futbolines en vivo", url: "index_futbolines.html", nueva: true },
        { icono: "🏆", titulo: "Editar ranking", texto: "Gestión de jugadores y torneos", url: "https://amfmelidefutbolin.github.io/ranking-evo-amf/", nueva: true },
        { icono: "📅", titulo: "Editar calendario", texto: "Añadir, editar o borrar torneos", url: "calendario.html?admin=1" },
      ];
      const panel = Deno.env.get("TORNEOS_PANEL");
      if (panel) enlaces.push({ icono: "🎯", titulo: "Torneos", texto: "Grupos, cuadros, mesas y avisos", url: panel, nueva: true });
      return json({ ok: true, enlaces });
    }
    case "mesas": {           // PIN del control de mesas
      const r = await comprobar(req, "mesas", b.pin, Deno.env.get("MESAS_PIN"));
      return json({ ok: r.ok, espera: r.espera }, r.ok ? 200 : r.status);
    }
    case "sorteo": {          // Sorteo en directo
      const r = await comprobar(req, "sorteo", b.pass, Deno.env.get("SORTEO_PASS"));
      return json({ ok: r.ok, espera: r.espera }, r.ok ? 200 : r.status);
    }
    case "monterroso": {      // Liga Monterroso (k7m2x9)
      const r = await comprobar(req, "monterroso", b.pass, Deno.env.get("MONTERROSO_PASS"));
      return json({ ok: r.ok, espera: r.espera }, r.ok ? 200 : r.status);
    }
    case "union-guardar": {   // Liga La Unión (k7m2x9): guarda toda la liga en su fila de liga_publica
      const codigo = String(b.codigo ?? "");
      if (!/^liga-launion-[a-z0-9-]{1,30}$/.test(codigo)) return json({ ok: false, error: "Código no permitido" }, 400);
      const datos = b.datos;
      if (!datos || typeof datos !== "object" || !Array.isArray(datos.grupos)) return json({ ok: false, error: "Datos no válidos" }, 400);
      if (JSON.stringify(datos).length > 500_000) return json({ ok: false, error: "Datos demasiado grandes" }, 413);
      const r = await comprobar(req, "monterroso", b.pass, Deno.env.get("MONTERROSO_PASS"));
      if (!r.ok) return json({ ok: false, espera: r.espera }, r.status);
      delete datos.passHash;
      const ahora = new Date().toISOString();
      const w = await fetch(`${URL_SB}/rest/v1/liga_publica?on_conflict=codigo`, {
        method: "POST",
        headers: { apikey: SB_SRV, Authorization: "Bearer " + SB_SRV, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ codigo, datos, updated_at: ahora }]),
      });
      if (!w.ok) return json({ ok: false, error: `No se pudo guardar (${w.status}): ${(await w.text()).slice(0, 200)}` }, 502);
      return json({ ok: true, updated_at: ahora });
    }
  }
  return json({ error: "Acción desconocida" }, 400);
}
