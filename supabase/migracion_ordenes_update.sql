-- ============================================================
-- FIX: UPDATE de `ordenes` sin restricciones — Dimensionado App
-- Generado tras revisar el esquema real del proyecto ubphkikaebevhijqikdh
-- (2026-08-21). Ejecutar completo en el SQL Editor del dashboard.
-- ============================================================
-- Problema encontrado:
--   La política RLS "ordenes: vendedor y admin actualizan" (UPDATE) no
--   tiene WITH CHECK, y ningún trigger valida un UPDATE que no cambie de
--   estado. En la práctica, cualquier vendedor podía, vía la API REST
--   directa (sin pasar por la UI), hacer cosas como:
--     - cambiar `cantidad`, `tipo_plancha_id`, `fecha_agendada` o
--       `vendedor_id` de CUALQUIER orden, sin ninguna validación de
--       stock/cupo (esas validaciones solo corren en INSERT).
--     - alternar el estado aprobada -> pendiente -> aprobada para que el
--       trigger de aprobación descuente el stock dos veces por la misma
--       orden física.
--   Revisado el código de la app (Ordenes.jsx, Historial.jsx, Tablero.jsx):
--   el único UPDATE que la app hace sobre `ordenes` es:
--     1) pendiente -> aprobada (con nro_boleta y aprobado_por)
--     2) pendiente -> cancelada
--     3) aprobada  -> cancelada
--   Nunca edita cantidad/plancha/fecha/vendedor de una orden existente
--   (para eso se cancela y se crea una nueva). Este fix solo formaliza
--   esa restricción a nivel de base de datos; no cambia ningún flujo
--   que la app use hoy.
-- ────────────────────────────────────────────────────────────

create or replace function public.validar_actualizacion_orden()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- Campos que no deben cambiar tras crear la orden.
  if new.cantidad         is distinct from old.cantidad
     or new.tipo_plancha_id is distinct from old.tipo_plancha_id
     or new.fecha_agendada  is distinct from old.fecha_agendada
     or new.vendedor_id     is distinct from old.vendedor_id
     or new.creado_en       is distinct from old.creado_en
  then
    raise exception 'No se pueden modificar los datos de una orden ya creada';
  end if;

  -- Solo las transiciones de estado que la app realmente usa.
  if new.estado is distinct from old.estado then
    if not (
      (old.estado = 'pendiente' and new.estado in ('aprobada', 'cancelada'))
      or (old.estado = 'aprobada' and new.estado = 'cancelada')
    ) then
      raise exception 'Transición de estado no permitida: % -> %', old.estado, new.estado;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_actualizacion_orden() from public, anon, authenticated;

drop trigger if exists trg_validar_actualizacion_orden on public.ordenes;
create trigger trg_validar_actualizacion_orden
  before update on public.ordenes
  for each row execute function public.validar_actualizacion_orden();
