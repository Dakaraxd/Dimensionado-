-- ============================================================
-- REVERSA de migracion_subgerente.sql — Dimensionado App
-- Úsala SOLO si algo sale mal después de aplicar la migración de subgerentes.
-- Devuelve la base al comportamiento anterior: el administrador vuelve a poder
-- registrar movimientos de inventario directamente, sin clave de subgerente.
-- Se puede ejecutar más de una vez. No borra datos: los movimientos, las claves
-- y las cuentas de subgerente ya creadas se conservan.
-- Después de ejecutarla hay que volver a desplegar la versión anterior de la app
-- (revertir el merge en main), porque la nueva pide la clave del subgerente.
-- ============================================================

-- 1. Quitar la protección de cuentas de subgerente
drop trigger if exists trg_proteger_subgerentes on public.profiles;
drop function if exists public.proteger_cuentas_subgerente();

-- 2. Movimientos de inventario: política y función de antes (el administrador inserta directo)
grant insert on public.movimientos_inventario to authenticated;

drop policy if exists "movimientos: solo admin registra" on public.movimientos_inventario;
create policy "movimientos: solo admin registra" on public.movimientos_inventario
  for insert with check (mi_rol() = 'administrador');

create or replace function public.aplicar_movimiento_inventario()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  s          public.stock_general%rowtype;
  v_antes    integer;
  v_total    integer;
  v_vendido  integer;
begin
  -- La identidad siempre es la de quien está autenticado: no se puede registrar a nombre de otro
  new.usuario_id := auth.uid();
  select p.nombre into new.usuario_nombre from public.profiles p where p.id = auth.uid();

  -- Un primer ingreso de un tipo que aún no tiene stock lo crea
  if new.tipo = 'ingreso' then
    insert into public.stock_general (tipo_plancha_id, total, vendido, actualizado_por)
    values (new.tipo_plancha_id, 0, 0, auth.uid())
    on conflict (tipo_plancha_id) do nothing;
  end if;

  select * into s from public.stock_general
  where tipo_plancha_id = new.tipo_plancha_id
  for update;

  if not found then
    raise exception 'No existe stock registrado para ese tipo de plancha';
  end if;

  v_antes   := s.total - s.vendido;
  v_total   := s.total;
  v_vendido := s.vendido;

  if new.tipo in ('ingreso', 'ajuste') then
    v_total := s.total + new.cantidad;
  elsif new.tipo = 'merma' then
    v_total := s.total - new.cantidad;
  elsif new.tipo = 'devolucion' then
    v_vendido := s.vendido - new.cantidad;
  end if;

  if v_vendido < 0 then
    raise exception 'La devolución (%) es mayor que lo vendido (%)', new.cantidad, s.vendido;
  end if;
  if v_total < v_vendido then
    raise exception 'Stock insuficiente: hay % planchas disponibles y el movimiento resta más', v_antes;
  end if;

  update public.stock_general
  set total = v_total,
      vendido = v_vendido,
      actualizado_en = now(),
      actualizado_por = auth.uid()
  where id = s.id;

  new.stock_antes   := v_antes;
  new.stock_despues := v_total - v_vendido;
  return new;
end;
$$;

revoke execute on function public.aplicar_movimiento_inventario() from public, anon, authenticated;

drop trigger if exists trg_aplicar_movimiento on public.movimientos_inventario;
create trigger trg_aplicar_movimiento
  before insert on public.movimientos_inventario
  for each row execute function public.aplicar_movimiento_inventario();

-- 3. stock_general: devolver la escritura del administrador (política y permisos de antes)
grant insert, update, delete on public.stock_general to authenticated;

drop policy if exists "stock_general: admin escribe" on public.stock_general;
create policy "stock_general: admin escribe" on public.stock_general
  for all using (mi_rol() = 'administrador');
