-- Antes de aplicarla deben existir dos secretos en Vault (los crea la tarea 22):
-- url_despachar (https://<proyecto-bot>.vercel.app/api/despachar) y cron_secret (igual a CRON_SECRET de Vercel).
create extension if not exists pg_cron;

create or replace function disparar_despacho() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secreto text;
begin
  if not exists (select 1 from conversaciones where responder_en <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'url_despachar';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secreto is null then
    raise warning 'disparar_despacho: faltan los secretos url_despachar o cron_secret en Vault';
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;

revoke execute on function disparar_despacho() from anon, authenticated, public;

select cron.schedule('despachar-turnos', '5 seconds', 'select disparar_despacho()');
