-- ============================================================
-- CAMBIO RÁPIDO DE USUARIO CON PIN — Dimensionado App
-- Ejecutar completo en el SQL Editor del dashboard ANTES de desplegar
-- las funciones `pin-dispositivo` y `cambiar-usuario`.
-- ============================================================
-- Cada equipo (navegador) que un usuario vincula tiene un registro aquí:
--   * un secreto aleatorio del equipo (solo se guarda su hash),
--   * el PIN personal del usuario (solo se guarda un hash con sal),
--   * contadores para bloquear tras intentos fallidos.
-- Para cambiar de usuario hacen falta las DOS cosas: el secreto guardado en
-- ese equipo y el PIN. Alguien en internet que no tenga el equipo no puede
-- adivinar PINs.
--
-- La tabla NO es accesible desde la app ni desde la API pública (RLS activo
-- y sin políticas, más REVOKE): solo la leen las funciones de servidor.
-- ============================================================

create table if not exists public.dispositivos_pin (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  secreto_hash    text not null unique,
  pin_salt        text not null,
  pin_hash        text not null,
  intentos        integer not null default 0,
  bloqueado_hasta timestamptz,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  ultimo_uso      timestamptz
);

create index if not exists dispositivos_pin_user_id_idx
  on public.dispositivos_pin (user_id);

alter table public.dispositivos_pin enable row level security;
revoke all on public.dispositivos_pin from anon, authenticated;
