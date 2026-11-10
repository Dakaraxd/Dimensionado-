-- ============================================================
-- CORREO DEL CLIENTE + CONTROL DE INVENTARIO + AUDITORÍA EN LA BASE
-- Ejecutar completo en el SQL Editor del dashboard ANTES de publicar
-- la nueva versión de la app. Se puede ejecutar más de una vez.
-- ============================================================
-- Qué agrega:
--   1) cliente_email en ordenes y proyectos_dimensionado (columna nula).
--   2) movimientos_inventario: historial inmutable de ingresos, mermas,
--      devoluciones y ajustes. Un trigger aplica cada movimiento al stock
--      (stock_general) de forma atómica y rechaza los que dejarían el stock
--      en negativo.
--   3) auditoria: registro a nivel de base de datos de todo INSERT / UPDATE /
--      DELETE en las tablas de negocio, con quién y cuándo, valores antes y
--      después. Funciona aunque el cambio no venga de la app. Solo los
--      administradores pueden leerla y nadie puede modificarla ni borrarla.
--
-- No modifica ni borra datos existentes, ni las políticas o triggers
-- actuales.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. CORREO DEL CLIENTE
-- ────────────────────────────────────────────────────────────
alter table public.ordenes
  add column if not exists cliente_email text;

alter table public.proyectos_dimensionado
  add column if not exists cliente_email text;


-- ────────────────────────────────────────────────────────────
-- 2. CONTROL DE INVENTARIO
--   ingreso    : entra mercadería (compra, traspaso).   total  + cantidad
--   merma      : daño o pérdida.                        total  − cantidad
--   devolucion : un cliente devuelve planchas ya        vendido − cantidad
--                vendidas (vuelven al stock).
--   ajuste     : corrección por conteo físico.          total  ± cantidad
-- "Disponible" siempre es total − vendido.
-- ────────────────────────────────────────────────────────────
create table if not exists public.movimientos_inventario (
  id              uuid primary key default gen_random_uuid(),
  tipo_plancha_id uuid not null references public.tipos_plancha(id),
  tipo            text not null check (tipo in ('ingreso', 'merma', 'devolucion', 'ajuste')),
  cantidad        integer not null check (cantidad <> 0),
  motivo          text,
  referencia      text,
  usuario_id      uuid references auth.users(id),
  usuario_nombre  text,
  stock_antes     integer,
  stock_despues   integer,
  creado_en       timestamptz not null default now(),
  constraint movimientos_cantidad_signo check (tipo = 'ajuste' or cantidad > 0)
);

create index if not exists movimientos_inventario_plancha_idx
  on public.movimientos_inventario (tipo_plancha_id, creado_en desc);
create index if not exists movimientos_inventario_fecha_idx
  on public.movimientos_inventario (creado_en desc);

alter table public.movimientos_inventario enable row level security;

drop policy if exists "movimientos: lectura autenticados" on public.movimientos_inventario;
create policy "movimientos: lectura autenticados" on public.movimientos_inventario
  for select using (auth.role() = 'authenticated');

drop policy if exists "movimientos: solo admin registra" on public.movimientos_inventario;
create policy "movimientos: solo admin registra" on public.movimientos_inventario
  for insert with check (mi_rol() = 'administrador');

-- Sin políticas de UPDATE ni DELETE: el historial es inmutable
revoke update, delete, truncate on public.movimientos_inventario from anon, authenticated;

-- Aplica el movimiento al stock con el registro bloqueado (sin carreras con ventas)
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


-- ────────────────────────────────────────────────────────────
-- 3. AUDITORÍA A NIVEL DE BASE DE DATOS
-- ────────────────────────────────────────────────────────────
create table if not exists public.auditoria (
  id             bigint generated always as identity primary key,
  creado_en      timestamptz not null default now(),
  tabla          text not null,
  operacion      text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id    text,
  usuario_id     uuid,
  usuario_nombre text,
  datos_antes    jsonb,
  datos_despues  jsonb
);

create index if not exists auditoria_fecha_idx on public.auditoria (creado_en desc);
create index if not exists auditoria_tabla_idx on public.auditoria (tabla, creado_en desc);
create index if not exists auditoria_usuario_idx on public.auditoria (usuario_id);

alter table public.auditoria enable row level security;

drop policy if exists "auditoria: solo admin lee" on public.auditoria;
create policy "auditoria: solo admin lee" on public.auditoria
  for select using (mi_rol() = 'administrador');

-- Inmutable: solo los triggers (SECURITY DEFINER) escriben; nadie la modifica ni la borra
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;

-- Si por cualquier motivo no se pudiera registrar la auditoría, la operación de negocio
-- NO se bloquea: queda una advertencia en los logs de Postgres.
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
  v_id      text;
  v_nombre  text;
begin
  if tg_op = 'INSERT' then
    v_despues := to_jsonb(new);
    v_id := v_despues ->> 'id';
  elsif tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
    v_id := v_despues ->> 'id';
    if v_antes = v_despues then
      return new;  -- actualización sin cambios: no se registra
    end if;
  else
    v_antes := to_jsonb(old);
    v_id := v_antes ->> 'id';
  end if;

  begin
    select p.nombre into v_nombre from public.profiles p where p.id = auth.uid();
    insert into public.auditoria (tabla, operacion, registro_id, usuario_id, usuario_nombre, datos_antes, datos_despues)
    values (tg_table_name, tg_op, v_id, auth.uid(), v_nombre, v_antes, v_despues);
  exception when others then
    raise warning 'auditoria no registrada (%): %', tg_table_name, sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

-- Tablas de negocio auditadas
do $$
declare
  t text;
begin
  foreach t in array array[
    'ordenes', 'orden_servicios', 'proyectos_dimensionado', 'stock_general',
    'tipos_plancha', 'profiles', 'planificacion_dias'
  ] loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t);
  end loop;
end;
$$;
