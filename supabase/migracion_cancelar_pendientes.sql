-- ============================================================
-- Cancelación automática de órdenes sin pagar — Dimensionado App
-- Regla: una orden que sigue 'pendiente' (sin boleta) al pasar la medianoche
-- de Chile del día en que se creó, se pasa a 'cancelada'. Así se libera su
-- cupo de corte (el cupo cuenta pendientes + aprobadas).
-- Una pendiente nunca descontó stock, por eso no hay stock que devolver.
-- Ejecutar completo en el SQL Editor del dashboard.
-- ============================================================

create or replace function public.cancelar_ordenes_pendientes_vencidas()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_total integer := 0;
  r record;
begin
  -- Se compara por fecha de Chile (no por UTC): sirve igual con horario de verano e invierno.
  for r in
    with canceladas as (
      update public.ordenes o
         set estado = 'cancelada'
       where o.estado = 'pendiente'
         and (o.creado_en at time zone 'America/Santiago')::date < v_hoy
      returning o.id, o.cantidad, o.vendedor_id, o.fecha_agendada, o.tipo_plancha_id
    )
    select c.*, trim(coalesce(t.nombre, '') || ' ' || coalesce(t.medida, '')) as plancha
      from canceladas c
      left join public.tipos_plancha t on t.id = c.tipo_plancha_id
  loop
    v_total := v_total + 1;
    -- El registro de auditoría nunca debe impedir la cancelación
    begin
      insert into public.logs (usuario_id, usuario_nombre, accion, entidad, detalle)
      values (r.vendedor_id, 'Sistema (cancelación automática)', 'CANCELAR', 'orden',
              jsonb_build_object('orden_id', r.id, 'cantidad', r.cantidad, 'plancha', r.plancha,
                                 'fecha_agendada', r.fecha_agendada,
                                 'motivo', 'Sin pagar al pasar la medianoche'));
    exception when others then
      null;
    end;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.cancelar_ordenes_pendientes_vencidas() from public, anon, authenticated;

-- Programación: cada 10 minutos (pg_cron corre en UTC y Chile cambia de horario,
-- por eso la función compara fechas de Chile en vez de depender de la hora exacta).
create extension if not exists pg_cron;

select cron.schedule(
  'cancelar-ordenes-pendientes',
  '*/10 * * * *',
  $cron$select public.cancelar_ordenes_pendientes_vencidas()$cron$
);
