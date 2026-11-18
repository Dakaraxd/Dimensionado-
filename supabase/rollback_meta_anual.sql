-- ============================================================
-- REVERSA de migracion_meta_anual.sql — Dimensionado App
-- Quita la función y la tabla de metas. Se puede ejecutar más de una vez.
-- ATENCIÓN: borra las cifras de meta ya ingresadas (el historial de cambios queda en
-- la tabla de auditoría). Úsala solo si algo sale mal, y avisa antes de ejecutarla.
-- ============================================================

drop function if exists public.meta_anual_resumen(integer);
drop table if exists public.metas_anuales;
drop function if exists public.metas_anuales_sello();
