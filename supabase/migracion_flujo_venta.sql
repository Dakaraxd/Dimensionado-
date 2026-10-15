-- ============================================================
-- FLUJO DE VENTA UNIFICADO — Dimensionado App
-- Ejecutar completo en el SQL Editor del dashboard ANTES de publicar
-- la nueva versión de la app (si no, "Nueva venta" no podrá guardar).
-- ============================================================
-- Qué cambia:
--   1) ordenes: guarda nombre y RUT del cliente de cada venta (hasta ahora
--      solo el teléfono; el nombre/RUT vivían únicamente en los proyectos
--      de corte). Así las ventas SIN cortes también quedan identificadas.
--   2) proyectos_dimensionado: cada proyecto de corte queda vinculado a la
--      orden de venta que lo originó (orden_id).
-- Es solo agregar columnas nulas: no modifica ni borra datos existentes y
-- las políticas RLS y triggers actuales siguen aplicando igual.
-- ============================================================

alter table public.ordenes
  add column if not exists cliente_nombre text,
  add column if not exists cliente_rut text;

alter table public.proyectos_dimensionado
  add column if not exists orden_id uuid references public.ordenes(id) on delete set null;

create index if not exists proyectos_dimensionado_orden_id_idx
  on public.proyectos_dimensionado (orden_id);
