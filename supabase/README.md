# Seguridad — Supabase

## Estado de la revisión (2026-07-07, con acceso directo a la BD)

Lo que ya estaba bien configurado:

- ✅ RLS activado en las 9 tablas, con políticas por rol (`mi_rol()`)
- ✅ Tabla `logs` inmutable (sin políticas de UPDATE/DELETE)
- ✅ Triggers de stock al aprobar/eliminar órdenes
- ✅ Edge function `crear-usuario` valida que el llamante sea administrador

## ✅ `migracion_seguridad.sql` — APLICADA el 2026-07-07

Aplicada vía MCP como migraciones `migracion_seguridad` y `revocar_funciones_legado`.
Verificado con el linter de Supabase: 0 errores. El archivo queda como referencia. Corrigió:

1. **3 errores del linter de Supabase**: vistas `SECURITY DEFINER` (`stock_disponible`, `vista_stock_general`, `vista_dias_mes`) que hoy pueden leerse **sin iniciar sesión**.
2. **5 warnings**: funciones sin `search_path` fijo y ejecutables por anónimos.
3. **Suplantación**: políticas de INSERT en `logs`, `ordenes` y `proyectos_dimensionado` que hoy permiten firmar como otro usuario; `solo_lectura` podía crear proyectos.
4. **Sobreventa**: validación de stock y cupo del día en el servidor (trigger), inmune a condiciones de carrera.
5. **Anulación de ventas**: la app ahora anula (estado `cancelada`) en vez de borrar; el trigger devuelve el stock también en esa transición.
6. **Ley 21.719**: función de anonimización de datos de clientes antiguos.

Cómo ejecutarla: Dashboard → SQL Editor → pegar el contenido completo → Run.

## ⚠️ `migracion_ordenes_update.sql` — GENERADA el 2026-08-21, pendiente de ejecutar

Encontrado en una revisión posterior: la política RLS de UPDATE en `ordenes`
no tenía `WITH CHECK`, y ningún trigger validaba un UPDATE que no cambiara
`estado`. Un vendedor podía, vía la API REST directa, cambiar `cantidad`,
`tipo_plancha_id`, `fecha_agendada` o `vendedor_id` de cualquier orden sin
ninguna validación de stock/cupo, o alternar `aprobada -> pendiente ->
aprobada` para duplicar el descuento de stock de una misma orden.

El archivo agrega un trigger que impide modificar esos campos después de
creada la orden y solo permite las transiciones de estado que la app usa
hoy (`pendiente -> aprobada`, `pendiente -> cancelada`, `aprobada ->
cancelada`). Revisado contra Ordenes.jsx, Historial.jsx y Tablero.jsx: no
cambia ningún flujo existente de la app.

Cómo ejecutarla: Dashboard → SQL Editor → pegar el contenido completo de
`migracion_ordenes_update.sql` → Run.

## ✅ Edge function `crear-usuario` — corregida el 2026-08-21 (falta desplegar)

Si `profiles.insert` fallaba después de crear el usuario en Auth, quedaba
un usuario huérfano (sin perfil, con el email "quemado" en Auth). Ahora
`index.ts` hace `auth.admin.deleteUser()` de compensación si falla el
insert del profile. Falta desplegar el cambio: `supabase functions deploy
crear-usuario` (o subirlo desde el dashboard).

## ⚠️ `migracion_flujo_venta.sql` — GENERADA 2026-10-14, ejecutar ANTES de publicar la fase 4

Habilita el flujo unificado "Nueva venta" (cliente → plancha → cortes → día → boleta):

- `ordenes` gana `cliente_nombre` y `cliente_rut` (hasta ahora solo existía el teléfono; las ventas sin cortes no guardaban quién compró).
- `proyectos_dimensionado` gana `orden_id`, que vincula cada proyecto de corte con la venta que lo originó.

Solo agrega columnas nulas: no toca datos existentes, ni políticas RLS, ni triggers. Cómo ejecutarla: Dashboard → SQL Editor → pegar el contenido completo → Run.

## ⚠️ Cambio rápido de usuario con PIN — GENERADO 2026-10-14, falta aplicar

Permite cambiar de usuario en un equipo compartido (como el selector de cuentas de Google) confirmando con un PIN personal de 4 dígitos.

**Cómo se protege:** cada equipo vinculado tiene un secreto aleatorio guardado en el navegador; para entrar se exigen el secreto del equipo **y** el PIN. Quien no tenga el equipo no puede adivinar PINs desde internet. Tras 5 fallos seguidos el equipo se bloquea 15 minutos y tras 10 se desactiva (hay que volver a vincularlo con la contraseña). En la base solo se guardan hashes (PBKDF2 con sal para el PIN, SHA-256 para el secreto).

Pasos, en este orden (desde la carpeta dimensionado-app):

1. SQL Editor → ejecutar `supabase/migracion_pin.sql` (crea `dispositivos_pin`, sin acceso desde la API pública).
2. `supabase functions deploy pin-dispositivo`
3. `supabase functions deploy cambiar-usuario --no-verify-jwt` (se llama sin sesión; la seguridad la dan el secreto + el PIN).
4. Publicar la app.

Pruebas de las funciones: `cd supabase/functions && deno test`.

## Pendientes manuales (no se pueden hacer por SQL)

- [ ] **Leaked password protection** (warning del linter): Dashboard → Authentication → Sign In / Up → Password → activar "Prevent use of leaked passwords".
- [ ] Programar `anonimizar_proyectos_antiguos()` con pg_cron (instrucción comentada al final de la migración).
- [ ] Decidir si los vendedores deben ver los emails de todos los usuarios: la política `profiles: lectura autenticados` lo permite (la app lo necesita para mostrar nombres de vendedores en órdenes; si se quiere restringir, crear una vista solo con `id, nombre`).
- [ ] La tabla `stock_diario` parece legado (la app usa `stock_general`; `ordenes.stock_id` siempre va null). Evaluar eliminarla junto a la vista `stock_disponible` y las funciones `planchas_agendadas_en_fecha` / `proximo_dia_con_cupo` si ya no se usan.