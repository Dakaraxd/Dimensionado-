-- ============================================================
-- PIN POR USUARIO (con equipo autorizado) — Dimensionado App
-- Ejecutar completo en el SQL Editor ANTES de desplegar las funciones
-- `pin-dispositivo` y `cambiar-usuario` actualizadas. Se puede ejecutar más de una vez.
-- ============================================================
-- Antes: cada equipo guardaba su propio PIN; al quitar el equipo se perdía el PIN.
-- Ahora: el PIN es de la persona (tabla pin_usuario) y cada equipo sigue necesitando
-- su propio secreto (tabla dispositivos_pin). Quitar un equipo ya no borra el PIN.
-- Para entrar con PIN siguen haciendo falta las DOS cosas: secreto del equipo + PIN.
--
-- No borra datos. Los PIN actuales se copian a la tabla nueva, así que nadie tiene
-- que volver a crearlo. Las funciones antiguas siguen funcionando hasta que se
-- desplieguen las nuevas.
-- ============================================================

create table if not exists public.pin_usuario (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  pin_salt       text not null,
  pin_hash       text not null,
  actualizado_en timestamptz not null default now()
);

alter table public.pin_usuario enable row level security;
revoke all on public.pin_usuario from anon, authenticated;

-- Los equipos ya no guardan PIN propio (las columnas quedan opcionales)
alter table public.dispositivos_pin alter column pin_salt drop not null;
alter table public.dispositivos_pin alter column pin_hash drop not null;

-- Conserva el PIN que cada persona ya tenía (el del equipo usado más recientemente)
insert into public.pin_usuario (user_id, pin_salt, pin_hash)
select distinct on (user_id) user_id, pin_salt, pin_hash
from public.dispositivos_pin
where pin_salt is not null and pin_hash is not null
order by user_id, coalesce(ultimo_uso, creado_en) desc
on conflict (user_id) do nothing;
