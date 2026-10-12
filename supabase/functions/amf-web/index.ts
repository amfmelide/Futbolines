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
//   MONTERROSO_PASS   contraseña de la Liga Monterroso (k7m2x9)
//   SORTEO_PASS       contraseña del sorteo en directo (sorteo.html)
//   TORNEOS_PANEL     ruta del panel de torneos (p. ej. zt4k9m/xxxx.html);
//                     sólo se entrega tras meter la contraseña del Admin
// (SUPABASE_URL y SUPABASE_ANON_KEY ya existen en todas las funciones.)
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

// Comparación en tiempo constante (no da pistas por el tiempo de respuesta)
function igual(a: unknown, secreto: string | undefined) {
  if (!secreto || typeof a !== "string" || a.length !== secreto.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ secreto.charCodeAt(i);
  return d === 0;
}

// Freno contra adivinar contraseñas: 8 fallos por IP y acción → 15 min bloqueado (por instancia).
const fallos = new Map<string, { n: number; hasta: number }>();
function bloqueado(clave: string) {
  const f = fallos.get(clave);
  return f && f.hasta > Date.now() ? Math.ceil((f.hasta - Date.now()) / 1000) : 0;
}
function fallo(clave: string) {
  const f = fallos.get(clave) ?? { n: 0, hasta: 0 };
  f.n++;
  if (f.n >= 8) { f.hasta = Date.now() + 15 * 60_000; f.n = 0; }
  fallos.set(clave, f);
}
async function comprobar(req: Request, accion: string, valor: unknown, secreto: string | undefined) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const k = accion + "|" + ip;
  const espera = bloqueado(k);
  if (espera) return { ok: false, status: 429, espera };
  if (igual(valor, secreto)) { fallos.delete(k); return { ok: true, status: 200, espera: 0 }; }
  fallo(k);
  await new Promise((r) => setTimeout(r, 400));
  return { ok: false, status: 401, espera: 0 };
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
  }
  return json({ error: "Acción desconocida" }, 400);
});
