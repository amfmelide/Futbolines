-- =====================================================================
-- TORNEOS · AMF Melide
-- Tablas para la herramienta de torneos (carpeta zt4k9m/).
--   torneos                → estado del torneo (JSON). Se lee a través de la Edge Function.
--   torneo_inscripciones   → teléfonos de las parejas. PRIVADO (sólo la Edge Function).
--   torneo_push            → suscripciones Web Push de cada pareja. PRIVADO.
-- Todo (lecturas y escrituras) pasa por la Edge Function "torneo-api": en las páginas no hay ninguna clave.
-- =====================================================================

create table if not exists public.torneos (
  codigo      text primary key check (codigo ~ '^[a-z0-9-]{3,60}$'),
  datos       jsonb not null,
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);
alter table public.torneos enable row level security;            -- sin políticas: nadie salvo la Edge Function
drop policy if exists "torneos lectura publica" on public.torneos;

create table if not exists public.torneo_inscripciones (
  id          bigserial primary key,
  codigo      text not null references public.torneos(codigo) on delete cascade,
  equipo_id   text not null,
  telefono    text,
  token_hash  text,
  created_at  timestamptz not null default now(),
  unique (codigo, equipo_id)
);
alter table public.torneo_inscripciones enable row level security;   -- sin políticas: nadie salvo service role

create table if not exists public.torneo_push (
  id          bigserial primary key,
  codigo      text not null references public.torneos(codigo) on delete cascade,
  equipo_id   text not null,
  endpoint    text not null unique,
  suscripcion jsonb not null,
  created_at  timestamptz not null default now(),
  ultimo_ok   timestamptz
);
create index if not exists torneo_push_equipo on public.torneo_push (codigo, equipo_id);
alter table public.torneo_push enable row level security;            -- sin políticas: privado

-- Añade una pareja de forma atómica (varias inscripciones a la vez no se pisan).
create or replace function public.torneo_inscribir(p_codigo text, p_equipo jsonb, p_max integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_datos jsonb; v_version integer; n integer;
begin
  select datos into v_datos from torneos where codigo = p_codigo for update;
  if v_datos is null then raise exception 'torneo_no_existe'; end if;
  select count(*) into n from jsonb_array_elements(coalesce(v_datos->'equipos','[]'::jsonb)) e where coalesce((e->>'baja')::boolean,false) = false;
  if p_max is not null and n >= p_max then raise exception 'torneo_completo'; end if;
  update torneos
     set datos = jsonb_set(datos, '{equipos}', coalesce(datos->'equipos','[]'::jsonb) || jsonb_build_array(p_equipo)),
         version = version + 1, updated_at = now()
   where codigo = p_codigo
   returning version into v_version;
  return v_version;
end $$;

-- Guarda el estado completo sólo si nadie lo cambió entretanto (control optimista por versión).
create or replace function public.torneo_guardar(p_codigo text, p_datos jsonb, p_version integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_version integer;
begin
  update torneos set datos = p_datos, version = version + 1, updated_at = now()
   where codigo = p_codigo and version = p_version
   returning version into v_version;
  if v_version is null then raise exception 'conflicto_version'; end if;
  return v_version;
end $$;

revoke all on function public.torneo_inscribir(text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.torneo_guardar(text, jsonb, integer) from public, anon, authenticated;
