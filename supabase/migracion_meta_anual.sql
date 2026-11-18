-- ============================================================
-- META ANUAL DE VENTAS (para el bono) — Dimensionado App
-- Ejecutar completo en el SQL Editor ANTES de publicar la nueva versión de la app.
-- Se puede ejecutar más de una vez.
-- ============================================================
-- Qué agrega:
--   1) metas_anuales: por cada año, las planchas vendidas el año anterior (que ingresa
--      un SUBGERENTE) y el porcentaje de aumento de la meta (25 % por defecto).
--      Todos los usuarios la leen; solo un subgerente activo la escribe. Cada cambio
--      queda en la auditoría de la base.
--   2) meta_anual_resumen(año): devuelve las planchas vendidas de un año (total, por mes
--      y las del usuario que consulta), contando por fecha de Chile. Solo entrega totales:
--      ningún dato de clientes.
-- No modifica ni borra datos existentes.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. TABLA DE METAS
-- ────────────────────────────────────────────────────────────
create table if not exists public.metas_anuales (
  id                    uuid primary key default gen_random_uuid(),
  anio                  integer not null unique check (anio between 2000 and 2100),
  ventas_anio_anterior  integer not null check (ventas_anio_anterior >= 0),
  porcentaje            numeric(5, 2) not null default 25 check (porcentaje >= 0 and porcentaje <= 200),
  actualizado_por       uuid references auth.users(id),
  actualizado_en        timestamptz not null default now()
);

alter table public.metas_anuales enable row level security;

drop policy if exists "metas: lectura autenticados" on public.metas_anuales;
create policy "metas: lectura autenticados" on public.metas_anuales
  for select using (auth.role() = 'authenticated');

-- Solo un subgerente ACTIVO crea o cambia la meta; nadie la borra
drop policy if exists "metas: subgerente crea" on public.metas_anuales;
create policy "metas: subgerente crea" on public.metas_anuales
  for insert with check (
    mi_rol()::text = 'subgerente'
    and coalesce((select p.activo from public.profiles p where p.id = auth.uid()), false)
  );

drop policy if exists "metas: subgerente edita" on public.metas_anuales;
create policy "metas: subgerente edita" on public.metas_anuales
  for update using (
    mi_rol()::text = 'subgerente'
    and coalesce((select p.activo from public.profiles p where p.id = auth.uid()), false)
  ) with check (
    mi_rol()::text = 'subgerente'
    and coalesce((select p.activo from public.profiles p where p.id = auth.uid()), false)
  );

revoke all on public.metas_anuales from anon, authenticated;
grant select, insert, update on public.metas_anuales to authenticated;

-- Quién y cuándo la cambió: lo pone la base, no la app
create or replace function public.metas_anuales_sello()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_metas_sello on public.metas_anuales;
create trigger trg_metas_sello
  before insert or update on public.metas_anuales
  for each row execute function public.metas_anuales_sello();

-- Auditoría de la base (quién cambió la cifra y cuál era antes)
drop trigger if exists trg_auditoria on public.metas_anuales;
create trigger trg_auditoria
  after insert or update or delete on public.metas_anuales
  for each row execute function public.registrar_auditoria();


-- ────────────────────────────────────────────────────────────
-- 2. PLANCHAS VENDIDAS DE UN AÑO
-- Cuenta las órdenes aprobadas (las anuladas no suman) por fecha de Chile, de modo que
-- una venta del 31 de diciembre a las 23:30 cuente en ese año y no en el siguiente.
-- ────────────────────────────────────────────────────────────
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
