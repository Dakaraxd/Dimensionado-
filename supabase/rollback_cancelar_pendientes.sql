-- Deshace la cancelación automática de órdenes pendientes (no revive las ya canceladas).
select cron.unschedule('cancelar-ordenes-pendientes');
drop function if exists public.cancelar_ordenes_pendientes_vencidas();
