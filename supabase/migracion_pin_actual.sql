-- ============================================================
-- PIN ACTUAL OBLIGATORIO AL CAMBIAR EL PIN — Dimensionado App
-- Ejecutar completo en el SQL Editor ANTES de desplegar la función
-- `pin-dispositivo` actualizada. Se puede ejecutar más de una vez.
-- ============================================================
-- Al cambiar el PIN ahora se pide el PIN actual. Estos dos campos cuentan los
-- intentos fallidos de esa verificación (5 fallos seguidos bloquean 15 minutos),
-- para que nadie con una sesión abierta pueda adivinar el PIN.
-- No borra ni modifica datos existentes.
-- ============================================================

alter table public.pin_usuario
  add column if not exists intentos_cambio integer not null default 0,
  add column if not exists bloqueado_cambio_hasta timestamptz;
