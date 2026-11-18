-- ============================================================
-- SUBGERENTES: AUTORIZACIÓN PARA EDITAR EL STOCK — Dimensionado App
-- Ejecutar completo en el SQL Editor ANTES de desplegar la función
-- `autorizar-stock` y la nueva versión de la app. Se puede ejecutar
-- más de una vez.
-- ============================================================
-- Qué cambia:
--   1) Nuevo rol de perfil: 'subgerente' (solo puede ver, igual que solo_lectura,
--      y crear su propia clave de autorización).
--   2) clave_subgerente: la clave personal de cada subgerente (guardada con hash
--      PBKDF2 + sal, con bloqueo por intentos fallidos). Nadie puede leerla desde
--      la app: solo la función de servidor `autorizar-stock`.
--   3) Los movimientos de inventario (ingreso, merma, devolución, ajuste) YA NO se
--      pueden insertar directamente desde la app. Solo los registra la función
--      `autorizar-stock`, después de verificar la clave de un subgerente. Queda
--      guardado quién lo hizo y qué subgerente lo autorizó.
--   4) stock_general: se quitan los permisos de escritura directa a los usuarios
--      de la app. Las ventas siguen funcionando porque sus triggers son
--      SECURITY DEFINER (esta migración lo verifica antes de cambiar nada).
--
-- No borra ni modifica datos existentes.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. VERIFICACIÓN PREVIA: las ventas deben poder seguir descontando stock
-- ────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array['validar_orden', 'handle_orden_aprobada', 'handle_orden_eliminada', 'aplicar_movimiento_inventario'] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f and not p.prosecdef
    ) then
      raise exception 'La función % no es SECURITY DEFINER: cerrar la escritura directa de stock_general rompería las ventas. No se aplicó ningún cambio.', f;
    end if;
  end loop;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 1. ROL 'subgerente' EN profiles
-- ────────────────────────────────────────────────────────────
do $$
declare
  c record;
  v_tipo text;
begin
  -- Si el rol es un enum, se agrega el valor
  select t.typname into v_tipo
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.profiles'::regclass and a.attname = 'rol' and t.typtype = 'e';
  if v_tipo is not null then
    execute format('alter type public.%I add value if not exists %L', v_tipo, 'subgerente');
  end if;

  -- Si hay restricciones CHECK sobre rol, se reemplazan por una que incluya al subgerente
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%rol%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
  if v_tipo is null then
    alter table public.profiles
      add constraint profiles_rol_check
      check (rol in ('administrador', 'vendedor', 'solo_lectura', 'subgerente'));
  end if;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. CLAVE DE AUTORIZACIÓN DE CADA SUBGERENTE
-- ────────────────────────────────────────────────────────────
create table if not exists public.clave_subgerente (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  clave_salt       text not null,
  clave_hash       text not null,
  intentos         integer not null default 0,
  bloqueado_hasta  timestamptz,
  actualizado_en   timestamptz not null default now()
);

-- Sin políticas: la app no puede leerla ni escribirla; solo la función de servidor (service_role)
alter table public.clave_subgerente enable row level security;
revoke all on public.clave_subgerente from anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. MOVIMIENTOS DE INVENTARIO: SOLO CON AUTORIZACIÓN
-- ────────────────────────────────────────────────────────────
alter table public.movimientos_inventario
  add column if not exists autorizado_por uuid references auth.users(id),
  add column if not exists autorizado_nombre text;

-- La app ya no inserta directamente: solo la función `autorizar-stock` (service_role)
drop policy if exists "movimientos: solo admin registra" on public.movimientos_inventario;
revoke insert, update, delete, truncate on public.movimientos_inventario from anon, authenticated;

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
    raise exception 'Los movimientos de inventario solo se registran con la autorización de un subgerente';
  end if;
  if new.usuario_id is null or new.autorizado_por is null then
    raise exception 'Todo movimiento de inventario debe indicar quién lo registra y qué subgerente lo autoriza';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.autorizado_por and p.rol = 'subgerente' and p.activo is not false
  ) then
    raise exception 'La autorización no corresponde a un subgerente activo';
  end if;

  select p.nombre into new.usuario_nombre from public.profiles p where p.id = new.usuario_id;
  select p.nombre into new.autorizado_nombre from public.profiles p where p.id = new.autorizado_por;

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
-- 4. stock_general: SIN ESCRITURA DIRECTA DESDE LA APP
-- (los triggers de ventas y de movimientos son SECURITY DEFINER y siguen funcionando)
-- ────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate on public.stock_general from anon, authenticated;
