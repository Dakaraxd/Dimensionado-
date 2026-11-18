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

  -- Solo si el rol es texto (no enum): se reemplaza la restricción CHECK de los roles por una
  -- que incluya al subgerente. Con enum (el caso de esta base) no se toca ninguna restricción.
  if v_tipo is null then
    for c in
      select conname from pg_constraint
      where conrelid = 'public.profiles'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%rol%' and pg_get_constraintdef(oid) ilike '%administrador%'
    loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
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

-- La política que dejaba escribir al administrador ya no tiene efecto (sin permisos no se llega a ella);
-- se elimina para que nadie la tome por vigente. La lectura sigue con "lectura autenticados".
drop policy if exists "stock_general: admin escribe" on public.stock_general;


-- ────────────────────────────────────────────────────────────
-- 5. LAS CUENTAS DE SUBGERENTE SOLO LAS GESTIONA UN SUBGERENTE
-- El administrador puede crear la PRIMERA cuenta de subgerente (o convertir a alguien en
-- subgerente) únicamente mientras no exista ninguna. Después ya no puede crear, convertir,
-- quitar el rol, activar, desactivar ni borrar cuentas de subgerente: solo otro subgerente
-- activo (desde la app, a través de las funciones de servidor, que no pasan por este trigger).
-- Un subgerente tampoco puede cambiarse el rol ni desactivarse a sí mismo.
-- Si algún día no quedara ningún subgerente activo, se corrige desde el SQL Editor.
-- ────────────────────────────────────────────────────────────
create or replace function public.proteger_cuentas_subgerente()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_es_sub     boolean;
  v_hay_sub    boolean;
begin
  -- Solo aplica a quien actúa con una sesión de usuario de la app
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol::text = 'subgerente' and p.activo is not false)
    into v_es_sub;
  select exists (select 1 from public.profiles p where p.rol::text = 'subgerente')
    into v_hay_sub;

  if tg_op = 'INSERT' then
    if new.rol::text = 'subgerente' and not v_es_sub and v_hay_sub then
      raise exception 'Las cuentas de subgerente solo las puede crear un subgerente';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.rol::text = 'subgerente' and not v_es_sub then
      raise exception 'Las cuentas de subgerente solo las puede gestionar un subgerente';
    end if;
    return old;
  end if;

  -- UPDATE: solo importa si cambia el rol o el estado de una cuenta que es o será de subgerente
  if (old.rol::text = 'subgerente' or new.rol::text = 'subgerente')
     and (new.rol is distinct from old.rol or new.activo is distinct from old.activo) then
    if old.id = auth.uid() then
      raise exception 'No puedes cambiar tu propio rol ni desactivarte a ti mismo';
    end if;
    if not v_es_sub then
      -- única excepción: el administrador convierte a alguien en subgerente cuando aún no hay ninguno
      if not (new.rol::text = 'subgerente' and old.rol::text <> 'subgerente' and not v_hay_sub) then
        raise exception 'Las cuentas de subgerente solo las puede gestionar un subgerente';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_cuentas_subgerente() from public, anon, authenticated;

drop trigger if exists trg_proteger_subgerentes on public.profiles;
create trigger trg_proteger_subgerentes
  before insert or update or delete on public.profiles
  for each row execute function public.proteger_cuentas_subgerente();
