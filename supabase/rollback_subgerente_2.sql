-- ============================================================
-- REVERSA de migracion_subgerente_2.sql — Dimensionado App
-- Vuelve a la regla de la primera parte: TODO movimiento de inventario exige la
-- clave de un subgerente y solo lo registra un administrador.
-- (Para volver a antes de los subgerentes por completo, ejecuta después
--  rollback_subgerente.sql.) Se puede ejecutar más de una vez. No borra datos.
-- ============================================================

drop policy if exists "auditoria: subgerente lee" on public.auditoria;
drop policy if exists "logs: subgerente lee" on public.logs;

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
  if auth.uid() is not null then
    raise exception 'Los movimientos de inventario solo se registran con la autorización de un subgerente';
  end if;
  if new.usuario_id is null or new.autorizado_por is null then
    raise exception 'Todo movimiento de inventario debe indicar quién lo registra y qué subgerente lo autoriza';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.autorizado_por and p.rol::text = 'subgerente' and p.activo is not false
  ) then
    raise exception 'La autorización no corresponde a un subgerente activo';
  end if;

  select p.nombre into new.usuario_nombre from public.profiles p where p.id = new.usuario_id;
  select p.nombre into new.autorizado_nombre from public.profiles p where p.id = new.autorizado_por;

  if new.tipo = 'ingreso' then
    insert into public.stock_general (tipo_plancha_id, total, vendido, actualizado_por)
    values (new.tipo_plancha_id, 0, 0, new.usuario_id)
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
      actualizado_por = new.usuario_id
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
