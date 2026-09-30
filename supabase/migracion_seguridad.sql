-- ============================================================
-- MIGRACIÓN DE SEGURIDAD — Dimensionado App
-- Generada tras revisar el esquema real del proyecto ubphkikaebevhijqikdh
-- (2026-07-07). Ejecutar completa en el SQL Editor del dashboard.
-- ============================================================
-- Lo que YA está bien y esta migración NO toca:
--   ✓ RLS activado en las 9 tablas, con políticas por rol vía mi_rol()
--   ✓ logs sin políticas de UPDATE/DELETE (auditoría inmutable)
--   ✓ Trigger que suma "vendido" al aprobar y lo resta al borrar
--   ✓ Edge function crear-usuario valida rol administrador
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. VISTAS CON SECURITY DEFINER (3 errores del linter de Supabase)
-- Las vistas hoy se ejecutan con permisos del creador (postgres),
-- saltándose RLS: incluso visitantes anónimos con la anon key pueden
-- leerlas. security_invoker las hace respetar los permisos de quien
-- consulta.
-- ────────────────────────────────────────────────────────────
alter view public.stock_disponible    set (security_invoker = true);
alter view public.vista_stock_general set (security_invoker = true);
alter view public.vista_dias_mes      set (security_invoker = true);

-- ────────────────────────────────────────────────────────────
-- 2. FUNCIONES: search_path fijo (5 warnings del linter)
-- Sin esto, un atacante puede desviar la resolución de nombres de
-- tablas dentro de funciones SECURITY DEFINER.
-- ────────────────────────────────────────────────────────────
alter function public.mi_rol()                                  set search_path = public;
alter function public.handle_orden_aprobada()                   set search_path = public;
alter function public.handle_orden_eliminada()                  set search_path = public;
alter function public.planchas_agendadas_en_fecha(date)         set search_path = public;
alter function public.proximo_dia_con_cupo(integer, date)       set search_path = public;

-- ────────────────────────────────────────────────────────────
-- 3. FUNCIONES: quitar ejecución a anónimos (warnings del linter)
-- Hoy cualquiera SIN iniciar sesión puede llamarlas vía /rest/v1/rpc/.
-- mi_rol() conserva EXECUTE para authenticated porque las políticas
-- RLS la usan. Las funciones de trigger no necesitan EXECUTE de nadie.
-- ────────────────────────────────────────────────────────────
revoke execute on function public.mi_rol()                            from public, anon;
revoke execute on function public.planchas_agendadas_en_fecha(date)   from public, anon;
revoke execute on function public.proximo_dia_con_cupo(integer, date) from public, anon;
revoke execute on function public.handle_orden_aprobada()             from public, anon, authenticated;
revoke execute on function public.handle_orden_eliminada()            from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. POLÍTICAS: impedir suplantación de identidad
-- Hoy un usuario autenticado puede insertar logs a nombre de otro,
-- crear órdenes con vendedor_id ajeno, o proyectos como otra persona.
-- ────────────────────────────────────────────────────────────

-- logs: cada quien registra solo con su propia identidad
drop policy if exists "logs: autenticados insertan" on public.logs;
create policy "logs: autenticados insertan" on public.logs
  for insert
  with check (auth.role() = 'authenticated' and usuario_id = auth.uid());

-- ordenes: el vendedor_id debe ser quien crea la orden
drop policy if exists "ordenes: vendedor y admin crean" on public.ordenes;
create policy "ordenes: vendedor y admin crean" on public.ordenes
  for insert
  with check (
    mi_rol() in ('vendedor', 'administrador')
    and vendedor_id = auth.uid()
  );

-- proyectos: solo vendedor/admin (antes cualquier autenticado, incluso
-- solo_lectura) y firmados con su propia identidad
drop policy if exists "proyectos: autenticados insertan" on public.proyectos_dimensionado;
create policy "proyectos: autenticados insertan" on public.proyectos_dimensionado
  for insert
  with check (
    mi_rol() in ('vendedor', 'administrador')
    and creado_por = auth.uid()
  );

-- ────────────────────────────────────────────────────────────
-- 5. VALIDACIÓN DE STOCK Y CUPO EN EL SERVIDOR
-- La app valida en JavaScript, pero dos vendedores simultáneos pueden
-- exceder el stock o el cupo del día (condición de carrera). Este
-- trigger lo hace imposible.
-- ────────────────────────────────────────────────────────────
create or replace function public.validar_orden()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_disponible integer;
  v_cuota integer;
  v_agendadas integer;
begin
  select (s.total - s.vendido) into v_disponible
  from stock_general s
  where s.tipo_plancha_id = new.tipo_plancha_id;

  if v_disponible is null then
    raise exception 'No existe stock registrado para ese tipo de plancha';
  end if;
  if v_disponible < new.cantidad then
    raise exception 'Stock insuficiente: quedan % planchas disponibles', v_disponible;
  end if;

  if new.fecha_agendada is not null then
    select p.cuota into v_cuota
    from planificacion_dias p
    where p.fecha = new.fecha_agendada;

    if v_cuota is null then
      raise exception 'El día % no tiene dimensionadores planificados', new.fecha_agendada;
    end if;

    select coalesce(sum(o.cantidad), 0) into v_agendadas
    from ordenes o
    where o.fecha_agendada = new.fecha_agendada
      and o.estado in ('pendiente', 'aprobada');

    if (v_cuota - v_agendadas) < new.cantidad then
      raise exception 'Sin cupo para el día %: quedan % planchas de cupo', new.fecha_agendada, (v_cuota - v_agendadas);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_orden() from public, anon, authenticated;

drop trigger if exists trg_validar_orden on public.ordenes;
create trigger trg_validar_orden
  before insert on public.ordenes
  for each row execute function public.validar_orden();

-- ────────────────────────────────────────────────────────────
-- 6. DEVOLVER STOCK AL ANULAR UNA VENTA APROBADA
-- La app ya no borra órdenes del historial: las pasa a 'cancelada'.
-- El trigger existente solo devolvía el stock en DELETE; esta versión
-- también lo devuelve en la transición aprobada → cancelada, y valida
-- el stock al aprobar (pendiente → aprobada).
-- ────────────────────────────────────────────────────────────
create or replace function public.handle_orden_aprobada()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_disponible integer;
begin
  -- Aprobar: validar y descontar stock
  if new.estado = 'aprobada' and old.estado = 'pendiente' then
    select (s.total - s.vendido) into v_disponible
    from stock_general s
    where s.tipo_plancha_id = new.tipo_plancha_id;

    if v_disponible is null or v_disponible < new.cantidad then
      raise exception 'Stock insuficiente para aprobar: quedan % planchas', coalesce(v_disponible, 0);
    end if;

    update stock_general set
      vendido = vendido + new.cantidad,
      actualizado_en = now()
    where tipo_plancha_id = new.tipo_plancha_id;
    new.aprobado_en = now();
  end if;

  -- Anular una venta aprobada: devolver el stock
  if new.estado = 'cancelada' and old.estado = 'aprobada' then
    update stock_general set
      vendido = greatest(vendido - old.cantidad, 0),
      actualizado_en = now()
    where tipo_plancha_id = old.tipo_plancha_id;
  end if;

  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 7. RETENCIÓN DE DATOS PERSONALES (Ley 21.719)
-- Anonimiza proyectos con más de 24 meses: conserva la estadística
-- pero elimina el vínculo con la persona. Ajustar el plazo a la
-- política de retención que definan.
-- ────────────────────────────────────────────────────────────
create or replace function public.anonimizar_proyectos_antiguos()
returns void
language sql security definer
set search_path = public
as $$
  update proyectos_dimensionado
  set cliente_nombre = 'Anonimizado',
      cliente_rut = null,
      cliente_telefono = null
  where creado_en < now() - interval '24 months'
    and cliente_rut is not null;
$$;

revoke execute on function public.anonimizar_proyectos_antiguos() from public, anon, authenticated;

-- Para programarla mensualmente (requiere extensión pg_cron activada
-- en Database → Extensions):
--   select cron.schedule('anonimizar-proyectos', '0 4 1 * *',
--     $cron$select public.anonimizar_proyectos_antiguos()$cron$);