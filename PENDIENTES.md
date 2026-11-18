
## Fase 19 – Cortes rectos y ordenados (en rama, sin desplegar)
- Modo "Cortes ordenados" (por defecto): tiras de lado a lado + columnas, máx. 3 etapas por tablero.
- Si ordenar costaría una plancha más, usa el modo general y avisa.
- Insignia "N etapas de corte" por tablero y en el PDF.

## Fase 20 – Agenda por hora, borrador y cancelación a medianoche (en rama, sin desplegar)
- Día sugerido al agendar: antes de las 12:00 (Chile) hoy; desde las 12:00 el día siguiente con cupo (hoy se puede elegir igual).
- Borrador de la orden (localStorage por usuario, solo del día, se borra al cerrar sesión / terminar / descartar).
- SQL `supabase/migracion_cancelar_pendientes.sql` (pg_cron cada 10 min): cancela pendientes de días anteriores. Rollback incluido. Falta que el usuario lo ejecute.
- Arreglo: el correo con la letra "s" era rechazado por una expresión regular mal escrita.
