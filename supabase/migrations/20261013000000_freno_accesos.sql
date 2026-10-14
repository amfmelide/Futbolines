-- =====================================================================
-- FRENO CONTRA QUIEN INTENTA ADIVINAR CONTRASEÑAS (y contra el abuso)
-- Lo usan las Edge Functions amf-web y torneo-api. Tabla privada.
--
--   · Por dispositivo/IP: 5 fallos en 15 min → bloqueado 15 min; cada nuevo
--     bloqueo dura el doble (15, 30, 60 min… hasta 24 h).
--   · Global por acción: 40 fallos en 10 min entre todos → 10 min de pausa
--     para esa acción (frena ataques repartidos entre muchas IP).
--   · Al acertar, se borra el contador de esa IP.
-- =====================================================================

create table if not exists public.accesos_fallidos (
  clave           text primary key,                -- "accion|ip" o "accion|*"
  fallos          integer not null default 0,
  bloqueos        integer not null default 0,      -- cuántas veces se ha bloqueado (alarga el castigo)
  bloqueado_hasta timestamptz,
  ventana_desde   timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
alter table public.accesos_fallidos enable row level security;   -- sin políticas: sólo las funciones
revoke all on public.accesos_fallidos from anon, authenticated;

-- Segundos que faltan para poder volver a intentarlo (0 = libre)
create or replace function public.acceso_espera(p_clave text)
returns integer language sql security definer set search_path = public as $$
  select coalesce(max(greatest(0, ceil(extract(epoch from (bloqueado_hasta - now())))))::integer, 0)
    from accesos_fallidos where clave = p_clave;
$$;

-- Apunta un fallo; devuelve los segundos de bloqueo si con éste se ha pasado del límite
create or replace function public.acceso_fallo(p_clave text, p_max integer, p_ventana_seg integer, p_castigo_seg integer)
returns integer language plpgsql security definer set search_path = public as $$
declare r accesos_fallidos; espera integer := 0;
begin
  insert into accesos_fallidos as a (clave, fallos, ventana_desde)
  values (p_clave, 1, now())
  on conflict (clave) do update set
    fallos = case when a.ventana_desde < now() - make_interval(secs => p_ventana_seg) then 1 else a.fallos + 1 end,
    ventana_desde = case when a.ventana_desde < now() - make_interval(secs => p_ventana_seg) then now() else a.ventana_desde end,
    actualizado = now()
  returning * into r;
  if r.fallos >= p_max then
    espera := least(86400, p_castigo_seg * power(2, least(r.bloqueos, 7)))::integer;
    update accesos_fallidos set fallos = 0, bloqueos = bloqueos + 1,
           bloqueado_hasta = now() + make_interval(secs => espera), ventana_desde = now()
     where clave = p_clave;
  end if;
  -- limpieza de registros viejos
  delete from accesos_fallidos where actualizado < now() - interval '7 days' and (bloqueado_hasta is null or bloqueado_hasta < now());
  return espera;
end $$;

create or replace function public.acceso_ok(p_clave text)
returns void language sql security definer set search_path = public as $$
  delete from accesos_fallidos where clave = p_clave;
$$;

revoke all on function public.acceso_espera(text) from public, anon, authenticated;
revoke all on function public.acceso_fallo(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.acceso_ok(text) from public, anon, authenticated;
