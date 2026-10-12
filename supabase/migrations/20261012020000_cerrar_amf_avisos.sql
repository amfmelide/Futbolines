-- =====================================================================
-- CERRAR amf-avisos (amf-avisos.netlify.app)
-- Ejecutar SÓLO cuando ya no se use amf-avisos (los avisos se hacen ahora
-- desde la app de torneos, que guarda teléfonos y suscripciones en tablas
-- privadas y los borra al terminar cada torneo).
--
-- Problemas que cierra:
--   · las tablas parejas y push_subscriptions se podían leer, escribir y
--     borrar con la clave pública;
--   · (la función send-notification no pide contraseña: bórrala en
--     Supabase → Edge Functions → send-notification → Delete).
-- =====================================================================

do $$
declare t text; pol record;
begin
  foreach t in array array['parejas', 'push_subscriptions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', pol.policyname, t);
      end loop;
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- Las suscripciones y números del último torneo ya no sirven: se vacían.
do $$
begin
  if to_regclass('public.push_subscriptions') is not null then execute 'delete from public.push_subscriptions'; end if;
  if to_regclass('public.parejas') is not null then execute 'delete from public.parejas'; end if;
end $$;
