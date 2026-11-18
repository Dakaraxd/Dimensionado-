-- ============================================================
-- SUBGERENTES, SEGUNDA PARTE — Dimensionado App
-- Ejecutar completo en el SQL Editor ANTES de desplegar la nueva versión de la
-- función `autorizar-stock` y de la app. Requiere haber aplicado antes
-- `migracion_subgerente.sql`. Se puede ejecutar más de una vez.
-- ============================================================
-- Qué cambia:
--   1) La clave de un subgerente solo se exige para MERMA y AJUSTE. El ingreso y la
--      devolución se registran sin clave. Siguen sin poder insertarse desde la app
--      directamente: solo los registra la función de servidor `autorizar-stock`.
--   2) Pueden registrar movimientos tanto administradores como vendedores activos
--      (el trigger lo verifica además de la función).
--   3) Los subgerentes pueden LEER (no modificar) el registro de actividad (`logs`)
--      y la auditoría de la base (`auditoria`), igual que el administrador.
-- No borra ni modifica datos existentes.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1 y 2. TRIGGER DE MOVIMIENTOS
-- ────────────────────────────────────────────────────────────
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
  -- Defensa en profundidad: aunque alguien lograra insertar con una sesión de usuario, se rechaza
  if auth.uid() is not null then
    raise exception 'Los movimientos de inventario solo se registran a través de la función autorizada';
  end if;

  -- Quién lo registra: un administrador o vendedor activo
  if new.usuario_id is null or not exists (
    select 1 from public.profiles p
    where p.id = new.usuario_id and p.rol::text in ('administrador', 'vendedor') and p.activo is not false
  ) then
    raise exception 'Solo un administrador o vendedor activo puede registrar movimientos de inventario';
  end if;

  -- Merma y ajuste exigen la autorización de un subgerente activo
  if new.tipo in ('merma', 'ajuste') then
    if new.autorizado_por is null or not exists (
      select 1 from public.profiles p
      where p.id = new.autorizado_por and p.rol::text = 'subgerente' and p.activo is not false
    ) then
      raise exception 'La % requiere la autorización de un subgerente activo', case when new.tipo = 'merma' then 'merma' else 'corrección (ajuste)' end;
    end if;
  elsif new.autorizado_por is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.autorizado_por and p.rol::text = 'subgerente' and p.activo is not false
  ) then
    raise exception 'La autorización no corresponde a un subgerente activo';
  end if;

  select p.nombre into new.usuario_nombre from public.profiles p where p.id = new.usuario_id;
  new.autorizado_nombre := null;
  if new.autorizado_por is not null then
    select p.nombre into new.autorizado_nombre from public.profiles p where p.id = new.autorizado_por;
  end if;

  -- Un primer ingreso de un tipo que aún no tiene stock lo crea
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


-- ────────────────────────────────────────────────────────────
-- 3. LECTURA DE ACTIVIDAD Y AUDITORÍA PARA SUBGERENTES (solo SELECT)
-- ────────────────────────────────────────────────────────────
drop policy if exists "auditoria: subgerente lee" on public.auditoria;
create policy "auditoria: subgerente lee" on public.auditoria
  for select using (mi_rol()::text = 'subgerente');

drop policy if exists "logs: subgerente lee" on public.logs;
create policy "logs: subgerente lee" on public.logs
  for select using (mi_rol()::text = 'subgerente');
