create extension if not exists pg_net with schema extensions;

create type canal as enum ('whatsapp', 'instagram');
create type modo_conv as enum ('bot', 'esperando_humano', 'humano', 'pausado');
create type estado_conv as enum ('nuevo', 'calificado', 'cotizado', 'pedido', 'transferido', 'ganado', 'perdido', 'frio');
create type autor_msg as enum ('cliente', 'bot', 'humano', 'sistema');

create or replace function tocar_actualizado() returns trigger
language plpgsql set search_path = public as $$
begin
  new.actualizado = now();
  return new;
end $$;

create table contactos (
  id uuid primary key default gen_random_uuid(),
  canal canal not null,
  id_externo text not null,
  nombre text,
  usuario text,
  telefono text,
  creado timestamptz not null default now(),
  unique (canal, id_externo)
);
create index contactos_tel10 on contactos (right(regexp_replace(coalesce(telefono, id_externo), '\D', '', 'g'), 10));
create index contactos_usuario on contactos (lower(usuario));

create table conversaciones (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null unique references contactos (id) on delete cascade,
  canal canal not null,
  modo modo_conv not null default 'bot',
  modo_hasta timestamptz,
  motivo_modo text,
  estado estado_conv not null default 'nuevo',
  referencia jsonb,
  hilo int not null default 1,
  resumen_hilo text,
  primer_cliente timestamptz,
  ultimo_cliente timestamptz,
  ultimo_bot timestamptz,
  ventana_gratis_hasta timestamptz,
  responder_en timestamptz,
  en_proceso_desde timestamptz,
  aviso_espera_enviado boolean not null default false,
  toques int not null default 0,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index conversaciones_responder on conversaciones (responder_en) where responder_en is not null;
create index conversaciones_en_proceso on conversaciones (en_proceso_desde) where en_proceso_desde is not null;
create index conversaciones_modo_hasta on conversaciones (modo_hasta) where modo_hasta is not null;
create trigger conversaciones_actualizado before update on conversaciones for each row execute function tocar_actualizado();

create table mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  hilo int not null,
  autor autor_msg not null,
  tipo text not null,
  texto text,
  adjunto jsonb,
  id_externo text unique,
  creado timestamptz not null default now()
);
create index mensajes_hilo on mensajes (conversacion_id, hilo, creado);

create table leads (
  conversacion_id uuid primary key references conversaciones (id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);
create trigger leads_actualizado before update on leads for each row execute function tocar_actualizado();

create table productos (
  slug text primary key,
  categoria text not null,
  activo boolean not null default true,
  datos jsonb not null,
  sincronizado timestamptz not null default now()
);

create table alertas (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  motivo text not null,
  texto text not null,
  enviada_a text not null,
  id_externo text,
  enviada_en timestamptz not null default now(),
  atendida_en timestamptz,
  reintentos int not null default 0,
  diferida boolean not null default false
);
create index alertas_conversacion on alertas (conversacion_id);
create index alertas_externo on alertas (id_externo);
create index alertas_pendientes on alertas (enviada_en) where atendida_en is null;

create table seguimientos (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  tipo text not null check (tipo in ('toque1', 'toque2', 'cierre')),
  programado_para timestamptz not null,
  usar_plantilla boolean not null default false,
  enviado_en timestamptz,
  cancelado boolean not null default false,
  tomado_en timestamptz
);
create index seguimientos_conversacion on seguimientos (conversacion_id);
create index seguimientos_pendientes on seguimientos (programado_para) where enviado_en is null and not cancelado;

create table eventos (
  id_externo text primary key,
  canal canal not null,
  evento jsonb not null,
  recibido timestamptz not null default now(),
  procesado timestamptz,
  error text,
  intentos int not null default 0
);
create index eventos_pendientes on eventos (recibido) where procesado is null;

create table ventanas_duenos (
  telefono text primary key,
  ultimo timestamptz not null
);

create table llamadas_modelo (
  id bigint generated always as identity primary key,
  conversacion_id uuid references conversaciones (id) on delete set null,
  modelo text not null,
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  tokens_cache int not null default 0,
  herramientas text[] not null default '{}',
  latencia_ms int not null default 0,
  error text,
  creado timestamptz not null default now()
);

create index llamadas_modelo_conversacion on llamadas_modelo (conversacion_id);

create table marcas (
  clave text primary key,
  valor text not null,
  actualizado timestamptz not null default now()
);

alter table contactos enable row level security;
alter table conversaciones enable row level security;
alter table mensajes enable row level security;
alter table leads enable row level security;
alter table productos enable row level security;
alter table alertas enable row level security;
alter table seguimientos enable row level security;
alter table eventos enable row level security;
alter table ventanas_duenos enable row level security;
alter table llamadas_modelo enable row level security;
alter table marcas enable row level security;

-- Toma turnos sin que dos despachadores tomen el mismo. Toma:
--  a) turnos vencidos (responder_en <= now()) sin bloqueo o con bloqueo caducado (3 min);
--  b) turnos huérfanos: responder_en es null (lo puso esta función al tomarlos) pero el
--     bloqueo caducó, es decir, el trabajador cayó a media conversación.
-- Contrato del trabajador: al terminar un turno (con éxito o con fallo ya manejado) pone
-- en_proceso_desde = null y NO toca responder_en: si llegó un mensaje durante el
-- procesamiento, ese mensaje ya volvió a fijar responder_en y el turno siguiente se toma solo.
create or replace function tomar_turnos(p_limite int) returns setof uuid
language sql set search_path = public as $$
  update conversaciones c
  set en_proceso_desde = now(), responder_en = null
  where c.id in (
    select id from conversaciones
    where (responder_en <= now()
           and (en_proceso_desde is null or en_proceso_desde < now() - interval '3 minutes'))
       or (responder_en is null and en_proceso_desde < now() - interval '3 minutes')
    order by coalesce(responder_en, en_proceso_desde)
    limit p_limite
    for update skip locked
  )
  returning c.id;
$$;

create or replace function tomar_seguimientos(p_limite int) returns setof seguimientos
language sql set search_path = public as $$
  update seguimientos s
  set tomado_en = now()
  where s.id in (
    select id from seguimientos
    where enviado_en is null and not cancelado and programado_para <= now()
      and (tomado_en is null or tomado_en < now() - interval '5 minutes')
    order by programado_para
    limit p_limite
    for update skip locked
  )
  returning s.*;
$$;

revoke execute on function tomar_turnos(int) from anon, authenticated, public;
revoke execute on function tomar_seguimientos(int) from anon, authenticated, public;

insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false) on conflict (id) do nothing;
