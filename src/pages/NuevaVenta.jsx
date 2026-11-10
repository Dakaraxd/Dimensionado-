import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { hoyChile, aYMD } from '../lib/fechas'
import { formatRut, validarRut } from '../lib/rut'
import EditorCortes from '../components/EditorCortes'

const ETIQUETAS = { cliente: 'Cliente', plancha: 'Plancha', cortes: 'Cortes', dia: 'Día de corte', boleta: 'Boleta' }

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }
const label = { display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }
const btnPrimario = { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '500' }
const btnSecundario = { background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', fontSize: '13px' }

// Los triggers de la base entregan mensajes claros (stock, cupo); el resto se resume.
function mensajeDe(err) {
  const m = err?.message ?? ''
  return /Stock insuficiente|Sin cupo|no tiene dimensionadores|No existe stock/i.test(m)
    ? m
    : 'No se pudo completar la orden. Intenta de nuevo.'
}

export default function NuevaVenta({ onNavegar }) {
  const { profile } = useAuth()
  const hoy = hoyChile()

  const [paso, setPaso] = useState('cliente') // cliente | plancha | cortes | dia | boleta | listo
  const [cliente, setCliente] = useState({ rut: '', nombre: '', telefono: '', email: '' })
  const [plancha, setPlancha] = useState(null)
  const [cortes, setCortes] = useState(null) // { piezas, dims, planchas } cuando se hacen cortes
  const [cantidad, setCantidad] = useState('1') // solo para ventas sin cortes
  const [fecha, setFecha] = useState(null)
  const [servicios, setServicios] = useState([])
  const [serviciosSel, setServiciosSel] = useState([])
  const [nota, setNota] = useState('')
  const [boleta, setBoleta] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [venta, setVenta] = useState(null) // resumen de la venta ya aprobada

  const [planchasStock, setPlanchasStock] = useState([])
  const [busquedaPlancha, setBusquedaPlancha] = useState('')
  const [clientesPrevios, setClientesPrevios] = useState([])
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [dias, setDias] = useState([])
  const [plan, setPlan] = useState({ listo: false, hoy: null, dias: [] })
  const [cargandoDias, setCargandoDias] = useState(false)

  const tableros = cortes?.planchas.length ?? 0
  const claves = ['cliente', 'plancha', 'cortes', ...(cortes ? ['dia'] : []), 'boleta']
  const indice = claves.indexOf(paso)

  // ── Datos iniciales ──
  useEffect(() => {
    async function cargar() {
      const [stock, serv, ords, proys] = await Promise.all([
        supabase.from('vista_stock_general').select('*').gt('disponible', 0)
          .not('plancha_categoria', 'in', '("Servicios","Otros")')
          .order('plancha_categoria').order('plancha_nombre'),
        supabase.from('tipos_plancha').select('*').eq('activo', true).eq('categoria', 'Servicios').order('nombre'),
        supabase.from('ordenes').select('cliente_nombre, cliente_rut, telefono_cliente, cliente_email')
          .not('cliente_rut', 'is', null).order('creado_en', { ascending: false }).limit(300),
        supabase.from('proyectos_dimensionado').select('cliente_nombre, cliente_rut, cliente_telefono, cliente_email')
          .order('creado_en', { ascending: false }).limit(300),
      ])
      setPlanchasStock(stock.data ?? [])
      setServicios(serv.data ?? [])
      // Clientes ya atendidos, sin repetir RUT (lo más reciente primero)
      const vistos = new Map()
      for (const o of ords.data ?? []) {
        if (o.cliente_rut && !vistos.has(o.cliente_rut)) vistos.set(o.cliente_rut, { nombre: o.cliente_nombre, rut: o.cliente_rut, telefono: o.telefono_cliente ?? '', email: o.cliente_email ?? '' })
      }
      for (const p of proys.data ?? []) {
        if (p.cliente_rut && !vistos.has(p.cliente_rut)) vistos.set(p.cliente_rut, { nombre: p.cliente_nombre, rut: p.cliente_rut, telefono: p.cliente_telefono ?? '', email: p.cliente_email ?? '' })
      }
      setClientesPrevios([...vistos.values()])
    }
    cargar()
  }, [])

  // ── Verificación del taller: ¿hay dimensionadores asignados? ──
  useEffect(() => {
    async function cargarPlan() {
      const hasta = new Date()
      hasta.setDate(hasta.getDate() + 30)
      const { data } = await supabase.from('vista_dias_mes').select('*')
        .gte('fecha', hoy).lte('fecha', aYMD(hasta)).order('fecha')
      const planificados = (data ?? []).filter(d => d.cuota)
      setPlan({ listo: true, hoy: planificados.find(d => d.fecha === hoy) ?? null, dias: planificados })
    }
    cargarPlan()
  }, [hoy])

  // ── Días con cupo (solo cuando hay cortes) ──
  useEffect(() => {
    if (paso !== 'dia') return
    let activo = true
    async function cargarDias() {
      setCargandoDias(true)
      const hasta = new Date()
      hasta.setDate(hasta.getDate() + 30)
      const { data } = await supabase.from('vista_dias_mes').select('*')
        .gte('fecha', hoy).lte('fecha', aYMD(hasta)).order('fecha')
      if (!activo) return
      const planificados = (data ?? []).filter(d => d.cuota)
      setDias(planificados)
      setFecha(actual => actual ?? planificados.find(d => d.cupo_disponible >= tableros)?.fecha ?? null)
      setCargandoDias(false)
    }
    cargarDias()
    return () => { activo = false }
  }, [paso, hoy, tableros])

  const sugerencias = useMemo(() => {
    const porNombre = cliente.nombre.trim().toLowerCase()
    const porRut = cliente.rut.replace(/[^0-9kK]/g, '')
    if (porNombre.length < 2 && porRut.length < 3) return []
    return clientesPrevios.filter(c =>
      (porNombre.length >= 2 && c.nombre?.toLowerCase().includes(porNombre)) ||
      (porRut.length >= 3 && c.rut?.replace(/[^0-9kK]/g, '').includes(porRut))
    ).slice(0, 5)
  }, [cliente.nombre, cliente.rut, clientesPrevios])

  const planchasFiltradas = planchasStock.filter(p =>
    `${p.plancha_nombre} ${p.plancha_medida} ${p.plancha_sku}`.toLowerCase().includes(busquedaPlancha.toLowerCase())
  )

  function ir(destino) { setError(''); setPaso(destino) }

  function elegirCliente(c) {
    setCliente({ nombre: c.nombre ?? '', rut: c.rut ?? '', telefono: c.telefono ?? '', email: c.email ?? '' })
    setMostrarSugerencias(false)
  }

  function siguienteCliente() {
    if (!cliente.nombre.trim() || !cliente.rut) { setError('Nombre y RUT son obligatorios'); return }
    if (cliente.email.trim() && !/^[^s@]+@[^s@]+.[^s@]{2,}$/.test(cliente.email.trim())) { setError('El correo del cliente no es válido (ej: nombre@correo.cl)'); return }
    if (!validarRut(cliente.rut)) { setError('El RUT ingresado no es válido (dígito verificador incorrecto)'); return }
    ir('plancha')
  }

  function elegirPlancha(p) {
    if (plancha?.tipo_plancha_id !== p.tipo_plancha_id) { setCortes(null); setFecha(null) }
    setPlancha(p)
  }

  function siguientePlancha() {
    if (!plancha) { setError('Selecciona una plancha'); return }
    ir('cortes')
  }

  function confirmarCortes(datos) {
    const necesarios = datos.planchas.length
    if (necesarios > plancha.disponible) {
      setError(`Los cortes necesitan ${necesarios} tablero${necesarios !== 1 ? 's' : ''} y solo hay ${plancha.disponible} disponible${plancha.disponible !== 1 ? 's' : ''} de esta plancha.`)
      return
    }
    setCortes(datos)
    setFecha(null)
    ir('dia')
  }

  function sinCortes() {
    setCortes(null)
    setFecha(null)
    ir('boleta')
  }

  function siguienteDia() {
    const d = dias.find(x => x.fecha === fecha)
    if (!d || d.cupo_disponible < tableros) { setError('Selecciona un día con cupo disponible'); return }
    ir('boleta')
  }

  function toggleServicio(id) {
    setServiciosSel(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  function reiniciar() {
    setPaso('cliente'); setCliente({ rut: '', nombre: '', telefono: '', email: '' }); setPlancha(null); setCortes(null)
    setCantidad('1'); setFecha(null); setServiciosSel([]); setNota(''); setBoleta(''); setError(''); setVenta(null)
    setBusquedaPlancha('')
  }

  // Crea la orden, guarda el proyecto de cortes y aprueba la boleta en una sola acción.
  // Si algo falla a mitad de camino la orden queda anulada: nunca queda una venta a medias.
  async function aprobarVenta() {
    setError('')
    const cantidadFinal = cortes ? tableros : parseInt(cantidad)
    if (!boleta.trim()) { setError('Ingresa el número de boleta'); return }
    if (!cantidadFinal || cantidadFinal < 1) { setError('La cantidad de planchas debe ser al menos 1'); return }
    if (cantidadFinal > plancha.disponible) { setError(`Solo hay ${plancha.disponible} planchas disponibles en stock`); return }

    setGuardando(true)
    const { data: orden, error: errOrden } = await supabase.from('ordenes').insert({
      tipo_plancha_id: plancha.tipo_plancha_id,
      stock_id: null,
      cantidad: cantidadFinal,
      nota: nota.trim(),
      telefono_cliente: cliente.telefono,
      cliente_email: cliente.email.trim().toLowerCase() || null,
      cliente_nombre: cliente.nombre.trim(),
      cliente_rut: cliente.rut,
      fecha_agendada: cortes ? fecha : null,
      vendedor_id: profile.id
    }).select().single()

    if (errOrden || !orden) {
      setError(mensajeDe(errOrden))
      setGuardando(false)
      return
    }

    try {
      if (serviciosSel.length > 0) {
        const { error: e } = await supabase.from('orden_servicios').insert(
          serviciosSel.map(sid => ({ orden_id: orden.id, tipo_plancha_id: sid }))
        )
        if (e) throw e
      }
      if (cortes) {
        const { error: e } = await supabase.from('proyectos_dimensionado').insert({
          cliente_nombre: cliente.nombre.trim(),
          cliente_rut: cliente.rut,
          cliente_telefono: cliente.telefono,
          cliente_email: cliente.email.trim().toLowerCase() || null,
          plancha_nombre: plancha.plancha_nombre,
          plancha_medida: plancha.plancha_medida,
          piezas: cortes.piezas,
          resultado: { dims: cortes.dims, planchas: cortes.planchas },
          creado_por: profile.id,
          creado_por_nombre: profile.nombre,
          orden_id: orden.id
        })
        if (e) throw e
      }
      const { error: e } = await supabase.from('ordenes')
        .update({ estado: 'aprobada', nro_boleta: boleta.trim(), aprobado_por: profile.id })
        .eq('id', orden.id)
      if (e) throw e
    } catch (err) {
      await supabase.from('ordenes').update({ estado: 'cancelada' }).eq('id', orden.id)
      setError(`${mensajeDe(err)} No se descontó stock ni se registró la orden.`)
      setGuardando(false)
      return
    }

    const nombrePlancha = `${plancha.plancha_nombre} ${plancha.plancha_medida ?? ''}`.trim()
    await registrarLog({
      accion: 'CREAR', entidad: 'orden',
      detalle: {
        cantidad: cantidadFinal, plancha: nombrePlancha, cliente: cliente.nombre.trim(),
        fecha_agendada: cortes ? fecha : null,
        servicios: serviciosSel.length > 0 ? servicios.filter(s => serviciosSel.includes(s.id)).map(s => s.nombre).join(', ') : null
      }
    }, profile)
    await registrarLog({
      accion: 'APROBAR', entidad: 'orden',
      detalle: { orden_id: orden.id, nro_boleta: boleta.trim(), cantidad: cantidadFinal, plancha: nombrePlancha }
    }, profile)
    if (cortes) {
      await registrarLog({ accion: 'CREAR', entidad: 'proyecto', detalle: { cliente: cliente.nombre.trim(), plancha: nombrePlancha } }, profile)
    }

    setVenta({ boleta: boleta.trim(), cantidad: cantidadFinal, cortes: !!cortes, fecha: cortes ? fecha : null, cliente: cliente.nombre.trim(), plancha: nombrePlancha })
    setPaso('listo')
    setGuardando(false)
  }

  const diaElegido = dias.find(d => d.fecha === fecha)
  const formatoDia = (f) => f === hoy ? 'Hoy' : new Date(f + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  const encabezado = (titulo, ayuda) => (
    <div style={{ marginBottom: '18px' }}>
      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Paso {indice + 1}</p>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>{titulo}</h3>
      <p style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>{ayuda}</p>
    </div>
  )

  const proximoConCupo = plan.dias.find(d => d.cupo_disponible > 0)
  const sinTaller = plan.listo && plan.dias.length === 0
  const sufijo = (n) => (n === 1 ? '' : 's')
  const textoProximo = proximoConCupo ? <> (el próximo con cupo es <strong>{formatoDia(proximoConCupo.fecha)}</strong>)</> : null
  const avisoTaller = () => {
    if (!plan.listo) return null
    let tono = 'ok'
    let texto
    if (plan.hoy && plan.hoy.cupo_disponible > 0) {
      texto = <>✅ <strong>Hoy hay {plan.hoy.dimensionadores} dimensionador{sufijo(plan.hoy.dimensionadores) ? 'es' : ''} asignado{sufijo(plan.hoy.dimensionadores)}</strong> · cupo disponible: {plan.hoy.cupo_disponible} plancha{plan.hoy.cupo_disponible === 1 ? '' : 's'}.</>
    } else if (plan.hoy) {
      tono = 'aviso'
      texto = <>⚠️ <strong>Hoy ya no queda cupo de corte.</strong> Si el cliente necesita cortes, se agendarán para otro día{textoProximo}. Las órdenes sin cortes no se ven afectadas.</>
    } else if (plan.dias.length > 0) {
      tono = 'aviso'
      texto = <>⚠️ <strong>No hay dimensionadores asignados para hoy.</strong> Si el cliente necesita cortes, se agendarán para otro día{textoProximo}. Las órdenes sin cortes no se ven afectadas.</>
    } else {
      tono = 'error'
      texto = <>⛔ <strong>No hay dimensionadores asignados en los próximos 30 días.</strong> Por ahora solo se pueden registrar órdenes <strong>sin cortes</strong>. El administrador debe asignarlos en el <strong>📅 Planificador</strong>.</>
    }
    const colores = { ok: ['var(--green-soft)', 'rgba(21,128,61,0.3)', 'var(--green)'], aviso: ['var(--amber-soft)', 'rgba(180,83,9,0.3)', 'var(--amber)'], error: ['var(--red-soft)', 'rgba(220,38,38,0.3)', 'var(--red)'] }[tono]
    return (
      <div style={{ background: colores[0], border: '1px solid ' + colores[1], borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', color: colores[2], lineHeight: 1.5 }}>{texto}</p>
      </div>
    )
  }

  // ── VENTA TERMINADA ──
  if (paso === 'listo' && venta) {
    return (
      <div style={{ color: 'var(--text1)', maxWidth: '620px', margin: '0 auto' }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '8px' }}>✅</div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px' }}>Orden aprobada</h2>
          <p style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '18px' }}>Boleta <strong>#{venta.boleta}</strong> · {venta.cliente}</p>
          <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '14px 16px', textAlign: 'left', fontSize: '13px', lineHeight: 1.7, marginBottom: '18px' }}>
            <p>🟫 {venta.cantidad} × {venta.plancha}</p>
            <p>✂️ {venta.cortes ? 'Con cortes: el proyecto quedó guardado y asociado a esta orden' : 'Sin cortes'}</p>
            {venta.fecha && <p>📅 Taller: {formatoDia(venta.fecha)}</p>}
          </div>
          {venta.fecha && venta.fecha !== hoy && (
            <p style={{ fontSize: '12px', color: 'var(--amber)', marginBottom: '16px' }}>📞 Recuerda avisarle al cliente el día de entrega.</p>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={reiniciar} style={btnPrimario}>+ Nueva orden</button>
            {venta.cortes && <button onClick={() => onNavegar?.('reportes', 'dimensionado')} style={btnSecundario}>Ver historial de dimensionado</button>}
            <button onClick={() => onNavegar?.('inicio')} style={btnSecundario}>Ir al inicio</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ color: 'var(--text1)', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Nueva orden</h2>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Registra la orden completa: cliente, plancha, cortes, día de taller y boleta</p>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '26px', overflowX: 'auto', paddingBottom: '4px' }}>
        {claves.map((k, i) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', flex: i < claves.length - 1 ? 1 : 'none', minWidth: 'max-content' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: i < indice ? 'pointer' : 'default' }}
              onClick={() => i < indice && ir(k)}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '600', flexShrink: 0,
                background: i <= indice ? 'var(--primary)' : 'var(--bg3)',
                color: i <= indice ? '#fff' : 'var(--text3)',
                border: i === indice ? '2px solid #fdba74' : 'none'
              }}>
                {i < indice ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '12px', fontWeight: i === indice ? '600' : '400', color: i === indice ? 'var(--primary)' : i < indice ? 'var(--text2)' : 'var(--text3)', whiteSpace: 'nowrap' }}>
                {ETIQUETAS[k]}
              </span>
            </div>
            {i < claves.length - 1 && <div style={{ flex: 1, minWidth: '14px', height: '1px', background: i < indice ? 'var(--primary)' : 'var(--border)', margin: '0 8px' }} />}
          </div>
        ))}
      </div>

      {/* 1 · CLIENTE */}
      {paso === 'cliente' && avisoTaller()}
      {paso === 'cliente' && (
        <div style={card}>
          {encabezado('¿Quién compra?', 'Ingresa el RUT y el nombre del cliente. Si ya compró antes, escribe su RUT o nombre y toca la sugerencia para autocompletar sus datos.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div style={{ position: 'relative' }}>
              <label style={label}>RUT *</label>
              <input value={cliente.rut} onChange={e => setCliente({ ...cliente, rut: formatRut(e.target.value) })}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                placeholder="12.345.678-9" maxLength={12} />
              {mostrarSugerencias && sugerencias.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }}>
                  {sugerencias.map(c => (
                    <button key={c.rut} type="button" onMouseDown={() => elegirCliente(c)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '12px', color: 'var(--text1)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: '500' }}>{c.nombre}</div>
                      <div style={{ color: 'var(--text3)', fontSize: '11px' }}>{c.rut}{c.telefono ? ` · ${c.telefono}` : ''}{c.email ? ` · ${c.email}` : ''}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={label}>Nombre y apellido *</label>
              <input value={cliente.nombre} onChange={e => setCliente({ ...cliente, nombre: e.target.value })}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                placeholder="Juan Pérez" />
            </div>
            <div>
              <label style={label}>Teléfono</label>
              <input value={cliente.telefono} onChange={e => setCliente({ ...cliente, telefono: e.target.value })} placeholder="+56 9 1234 5678" />
            </div>
            <div>
              <label style={label}>Correo (opcional)</label>
              <input type="email" value={cliente.email} onChange={e => setCliente({ ...cliente, email: e.target.value })} placeholder="cliente@correo.cl" autoComplete="off" />
            </div>
          </div>
          {sugerencias.length > 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>💡 Cliente ya atendido antes — toca una sugerencia para autocompletar sus datos.</p>
          )}
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '14px', lineHeight: 1.5 }}>
            🔒 Los datos del cliente se usan únicamente para identificar y elaborar esta orden.
            El cliente puede solicitar su acceso, rectificación o eliminación (Ley 19.628 / Ley 21.719).
          </p>
          {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button onClick={siguienteCliente} style={btnPrimario}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* 2 · PLANCHA */}
      {paso === 'plancha' && (
        <div style={card}>
          {encabezado('¿Qué plancha lleva?', 'Elige el tipo de plancha. Solo aparecen las que tienen stock disponible.')}
          <input type="text" placeholder="🔍 Buscar por nombre, medida o SKU..."
            value={busquedaPlancha} onChange={e => setBusquedaPlancha(e.target.value)} style={{ marginBottom: '12px' }} />
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', maxHeight: '340px', overflowY: 'auto' }}>
            {planchasFiltradas.map((p, i) => {
              const sel = plancha?.tipo_plancha_id === p.tipo_plancha_id
              return (
                <div key={p.tipo_plancha_id} onClick={() => elegirPlancha(p)}
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: sel ? 'var(--primary-soft)' : i % 2 === 0 ? 'var(--bg2)' : 'var(--bg3)' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '500' }}>{p.plancha_nombre} {p.plancha_medida}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)' }}>SKU: {p.plancha_sku || '—'} · {p.disponible} disponibles</p>
                  </div>
                  <div style={{ width: '18px', height: '18px', borderRadius: '3px', border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`, background: sel ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
                  </div>
                </div>
              )
            })}
            {planchasFiltradas.length === 0 && (
              <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>No se encontraron planchas con stock</p>
            )}
          </div>
          {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
            <button onClick={() => ir('cliente')} style={btnSecundario}>← Volver</button>
            <button onClick={siguientePlancha} style={btnPrimario}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* 3 · CORTES */}
      {paso === 'cortes' && (
        <>
          {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px' }}>{error}</p>}
          <div style={{ ...card, marginBottom: '14px', padding: '18px 24px' }}>
            {encabezado('¿El cliente necesita cortes?', <>Ingresa las piezas y optimiza para ver cómo se cortan. Si el cliente <strong>se lleva las planchas enteras</strong>, elige <strong>“No hacer corte”</strong>.</>)}
            {sinTaller && (
              <>
                <p style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>⛔ No hay dimensionadores asignados en los próximos 30 días, así que por ahora no se pueden agendar cortes.</p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={() => ir('plancha')} style={btnSecundario}>← Volver</button>
                  <button onClick={sinCortes} style={btnPrimario}>Continuar sin cortes</button>
                </div>
              </>
            )}
          </div>
          {!sinTaller && <EditorCortes
            key={plancha.tipo_plancha_id}
            cliente={cliente}
            plancha={plancha}
            inicial={cortes}
            onConfirmar={confirmarCortes}
            onSinCortes={sinCortes}
            onVolver={() => ir('plancha')}
            textoConfirmar="Continuar →"
          />}
        </>
      )}

      {/* 4 · DÍA (solo con cortes) */}
      {paso === 'dia' && cortes && (
        <div style={card}>
          {encabezado('¿Qué día se cortan?', <>Los cortes usan <strong>{tableros} tablero{tableros !== 1 ? 's' : ''}</strong> de la capacidad del taller. Elige un día con cupo disponible.</>)}
          {cargandoDias ? (
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Calculando días...</p>
          ) : dias.length === 0 ? (
            <div style={{ background: 'var(--amber-soft)', border: '1px solid rgba(180,83,9,0.3)', borderRadius: '10px', padding: '12px 16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--amber)' }}>⚠️ No hay días planificados. El administrador debe asignar dimensionadores en el <strong>📅 Planificador</strong>.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {dias.map(d => {
                  const cabe = d.cupo_disponible >= tableros
                  const sel = fecha === d.fecha
                  return (
                    <button key={d.fecha} type="button" onClick={() => { if (cabe) { setFecha(d.fecha); setError('') } }}
                      style={{
                        padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: '500',
                        border: `1px solid ${sel ? 'var(--primary)' : cabe ? 'rgba(21,128,61,0.4)' : 'rgba(220,38,38,0.3)'}`,
                        background: sel ? 'var(--primary)' : cabe ? 'var(--green-soft)' : 'var(--red-soft)',
                        color: sel ? '#fff' : cabe ? 'var(--green)' : 'var(--red)',
                        cursor: cabe ? 'pointer' : 'not-allowed', opacity: cabe ? 1 : 0.6
                      }}>
                      <div>{d.fecha === hoy ? 'Hoy' : new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                      <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.85 }}>{d.agendadas}/{d.cuota} · {cabe ? `${d.cupo_disponible} libre` : 'Sin cupo'}</div>
                    </button>
                  )
                })}
              </div>
              {!dias.some(d => d.cupo_disponible >= tableros) && (
                <p style={{ fontSize: '13px', color: 'var(--red)', marginTop: '12px' }}>⚠️ Ningún día tiene cupo para {tableros} tableros. El administrador debe planificar más días en el Planificador.</p>
              )}
              {diaElegido && <p style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '12px' }}>📅 Se agendará para: <strong>{formatoDia(diaElegido.fecha)}</strong></p>}
            </>
          )}
          {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
            <button onClick={() => ir('cortes')} style={btnSecundario}>← Volver</button>
            <button onClick={siguienteDia} disabled={!diaElegido || diaElegido.cupo_disponible < tableros}
              style={{ ...btnPrimario, opacity: !diaElegido || diaElegido.cupo_disponible < tableros ? 0.5 : 1 }}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* 5 · BOLETA */}
      {paso === 'boleta' && (
        <div style={card}>
          {encabezado('Revisa y aprueba', 'Confirma el resumen, ingresa el número de boleta y aprueba la orden. Hasta ese momento no se descuenta stock.')}

          <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', lineHeight: 1.7, marginBottom: '18px' }}>
            <p>👤 <strong>{cliente.nombre}</strong> · {cliente.rut}{cliente.telefono ? ` · ${cliente.telefono}` : ''}{cliente.email ? ` · ${cliente.email}` : ''}</p>
            <p>🟫 {plancha.plancha_nombre} {plancha.plancha_medida} <span style={{ color: 'var(--text3)' }}>({plancha.disponible} disponibles)</span></p>
            {cortes ? (
              <>
                <p>✂️ Con cortes: {cortes.piezas.reduce((s, p) => s + (parseInt(p.cantidad) || 0), 0)} piezas en <strong>{tableros} tablero{tableros !== 1 ? 's' : ''}</strong></p>
                {diaElegido && <p>📅 Taller: {formatoDia(diaElegido.fecha)}</p>}
              </>
            ) : (
              <p>✂️ Sin cortes</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {!cortes && (
              <div>
                <label style={label}>Cantidad de planchas *</label>
                <input type="number" min="1" max={plancha.disponible} value={cantidad}
                  onChange={e => setCantidad(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={e => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()} />
              </div>
            )}
            <div>
              <label style={label}>Nº de boleta *</label>
              <input type="text" inputMode="numeric" value={boleta} placeholder="Ej: 123456"
                onChange={e => setBoleta(e.target.value.replace(/[^0-9]/g, ''))} autoFocus />
            </div>
            <div>
              <label style={label}>Nota (opcional)</label>
              <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: retira el viernes" />
            </div>
          </div>

          <div style={{ border: '1px dashed var(--border)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: 'var(--text2)', lineHeight: 1.7 }}>
            <p style={{ fontWeight: 600, color: 'var(--text1)', marginBottom: '2px' }}>Al aprobar la orden, el sistema:</p>
            <p>✓ Registra la orden a nombre de {cliente.nombre}</p>
            <p>✓ Descuenta {cortes ? tableros : (parseInt(cantidad) || 0)} plancha{(cortes ? tableros : (parseInt(cantidad) || 0)) === 1 ? '' : 's'} del stock</p>
            {cortes && <p>✓ Guarda el proyecto de cortes ({tableros} tablero{tableros !== 1 ? 's' : ''}){diaElegido ? ' y lo agenda para ' + (diaElegido.fecha === hoy ? 'hoy' : 'el ' + formatoDia(diaElegido.fecha)) : ''}</p>}
          </div>

          {servicios.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginBottom: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px', fontWeight: '500' }}>Servicios adicionales (opcional)</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {servicios.map(s => {
                  const sel = serviciosSel.includes(s.id)
                  return (
                    <button key={s.id} type="button" onClick={() => toggleServicio(s.id)}
                      style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`, background: sel ? 'var(--primary-soft)' : 'var(--bg3)', color: sel ? 'var(--primary)' : 'var(--text2)' }}>
                      {sel ? '✓ ' : ''}{s.nombre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '14px' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => ir(cortes ? 'dia' : 'cortes')} style={btnSecundario} disabled={guardando}>← Volver</button>
            <button onClick={aprobarVenta} disabled={guardando}
              style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 26px', fontSize: '14px', fontWeight: '600', opacity: guardando ? 0.7 : 1 }}>
              {guardando ? 'Guardando...' : '✓ Aprobar orden'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
