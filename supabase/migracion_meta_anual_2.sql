-- ============================================================
-- META ANUAL: SOLO ADMINISTRADOR Y SUBGERENTE LA VEN — Dimensionado App
-- Ejecutar completo en el SQL Editor. Requiere haber aplicado antes
-- `migracion_meta_anual.sql`. Se puede ejecutar más de una vez.
-- ============================================================
-- Qué cambia: la meta y las cifras de ventas del año que la acompañan ya no las puede
-- consultar un vendedor ni un usuario de solo lectura, ni desde la app ni de otra forma:
--   1) La tabla metas_anuales solo se lee si eres administrador o subgerente activo.
--   2) La función meta_anual_resumen rechaza a cualquier otro rol.
-- Escribir la meta sigue siendo solo del subgerente. No modifica ni borra datos.
-- ============================================================

drop policy if exists "metas: lectura autenticados" on public.metas_anuales;
drop policy if exists "metas: lectura administracion" on public.metas_anuales;
create policy "metas: lectura administracion" on public.metas_anuales
  for select using (
    mi_rol()::text in ('administrador', 'subgerente')
    and coalesce((select p.activo from public.profiles p where p.id = auth.uid()), false)
  );

create or replace function public.meta_anual_resumen(p_anio integer)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_total    integer;
  v_ordenes  integer;
  v_mis      integer;
  v_meses    jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  -- Solo administración: administrador o subgerente activos
  if mi_rol()::text not in ('administrador', 'subgerente')
     or not coalesce((select p.activo from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'No tienes permiso para ver la meta';
  end if;
  if p_anio is null or p_anio < 2000 or p_anio > 2100 then
    raise exception 'Año no válido';
  end if;

  select coalesce(sum(o.cantidad), 0)::integer,
         count(*)::integer,
         coalesce(sum(o.cantidad) filter (where o.vendedor_id = auth.uid()), 0)::integer
    into v_total, v_ordenes, v_mis
  from public.ordenes o
  where o.estado = 'aprobada'
    and (o.aprobado_en at time zone 'America/Santiago')::date between make_date(p_anio, 1, 1) and make_date(p_anio, 12, 31);

  select jsonb_agg(coalesce(m.planchas, 0) order by g.mes)
    into v_meses
  from generate_series(1, 12) as g(mes)
  left join (
    select extract(month from (o.aprobado_en at time zone 'America/Santiago'))::integer as mes,
           sum(o.cantidad)::integer as planchas
    from public.ordenes o
    where o.estado = 'aprobada'
      and (o.aprobado_en at time zone 'America/Santiago')::date between make_date(p_anio, 1, 1) and make_date(p_anio, 12, 31)
    group by 1
  ) m on m.mes = g.mes;

  return jsonb_build_object(
    'anio', p_anio,
    'total', v_total,
    'ordenes', v_ordenes,
    'mis_planchas', v_mis,
    'por_mes', v_meses
  );
end;
$$;

revoke execute on function public.meta_anual_resumen(integer) from public, anon;
grant execute on function public.meta_anual_resumen(integer) to authenticated;
