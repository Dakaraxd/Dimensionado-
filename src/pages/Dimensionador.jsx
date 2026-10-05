import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { hoyChile } from '../lib/fechas'

// Dimensiones por defecto del tablero en cm (editables en el paso 2)
const PLANCHA_W_DEFAULT = 249
const PLANCHA_H_DEFAULT = 182
// Espesor del corte de sierra (kerf) en cm: cada corte consume material
const KERF = 0.4

function formatRut(rut) {
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return clean
  const dv = clean.slice(-1)
  const num = clean.slice(0, -1)
  const formatted = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}

// Valida el dígito verificador con módulo 11
function validarRut(rut) {
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return false
  const dv = clean.slice(-1)
  const num = clean.slice(0, -1)
  if (!/^\d+$/.test(num)) return false
  let suma = 0, mul = 2
  for (let i = num.length - 1; i >= 0; i--) {
    suma += parseInt(num[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const res = 11 - (suma % 11)
  const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res)
  return dv === dvCalc
}

// RUT parcialmente enmascarado para documentos exportados (minimización de datos)
function maskRut(rut) {
  return rut.replace(/\d{3}-[\dkK]$/i, '•••-•')
}

function mejorEspacio(espacios, w, h) {
  // Best-Fit: el espacio más pequeño donde quepa
  let mejor = null
  for (const e of espacios) {
    if (e.w >= w && e.h >= h && (!mejor || e.w * e.h < mejor.w * mejor.h)) mejor = e
  }
  return mejor
}

function intentarColocar(plancha, corte) {
  const espacio = mejorEspacio(plancha.espacios, corte.largo, corte.ancho)
  if (espacio) {
    plancha.cortes.push({ ...corte, x: espacio.x, y: espacio.y, w: corte.largo, h: corte.ancho })
    actualizarEspacios(plancha.espacios, espacio, corte.largo, corte.ancho)
    return true
  }
  // Rotación 90°
  if (corte.largo !== corte.ancho) {
    const espacioRot = mejorEspacio(plancha.espacios, corte.ancho, corte.largo)
    if (espacioRot) {
      plancha.cortes.push({ ...corte, x: espacioRot.x, y: espacioRot.y, w: corte.ancho, h: corte.largo, rotado: true })
      actualizarEspacios(plancha.espacios, espacioRot, corte.ancho, corte.largo)
      return true
    }
  }
  return false
}

function guillotineBFD(cortesOrdenados, W, H) {
  const planchas = []
  const noColocadas = []

  for (const corte of cortesOrdenados) {
    let colocado = false
    for (const plancha of planchas) {
      if (intentarColocar(plancha, corte)) { colocado = true; break }
    }
    if (!colocado) {
      const nueva = { id: planchas.length + 1, cortes: [], espacios: [{ x: 0, y: 0, w: W, h: H }] }
      if (intentarColocar(nueva, corte)) {
        planchas.push(nueva)
      } else {
        // No cabe ni rotada en una plancha vacía: reportarla, nunca descartarla en silencio
        noColocadas.push(corte)
      }
    }
  }
  return { planchas, noColocadas }
}

function calcularDistribucion(cortes, W, H) {
  const pendientes = []
  cortes.forEach((c, ci) => {
    for (let i = 0; i < c.cantidad; i++) {
      pendientes.push({ ...c, key: `${ci}-${i}`, colorIdx: ci })
    }
  })

  // Generar múltiples estrategias de ordenamiento
  const estrategias = [
    // 1. Area descendente (BFD clásico)
    [...pendientes].sort((a, b) => (b.largo * b.ancho) - (a.largo * a.ancho)),
    // 2. Altura descendente
    [...pendientes].sort((a, b) => b.largo - a.largo),
    // 3. Ancho descendente
    [...pendientes].sort((a, b) => b.ancho - a.ancho),
    // 4. Perímetro descendente
    [...pendientes].sort((a, b) => (b.largo + b.ancho) - (a.largo + a.ancho)),
    // 5. Área ascendente (piezas chicas primero)
    [...pendientes].sort((a, b) => (a.largo * a.ancho) - (b.largo * b.ancho)),
    // 6. Ratio largo/ancho descendente
    [...pendientes].sort((a, b) => (b.largo / b.ancho) - (a.largo / a.ancho)),
  ]

  // Evaluar cada estrategia y calcular función objetivo
  let mejorResultado = null
  let mejorPuntaje = -Infinity

  for (const estrategia of estrategias) {
    const { planchas, noColocadas } = guillotineBFD(estrategia, W, H)

    const totalTableros = planchas.length || 1
    const aprovechamiento = planchas.reduce((sum, p) => {
      const areaUsada = p.cortes.reduce((s, c) => s + c.w * c.h, 0)
      return sum + (areaUsada / (W * H))
    }, 0) / totalTableros

    // Piezas sin ubicar penalizan por sobre todo; luego menos tableros y mayor aprovechamiento
    const puntaje = (-noColocadas.length * 100000) + (-planchas.length * 1000) + (aprovechamiento * 100)

    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje
      mejorResultado = { planchas, noColocadas }
    }
  }

  return mejorResultado
}

function actualizarEspacios(espacios, espacio, w, h) {
  const idx = espacios.indexOf(espacio)
  espacios.splice(idx, 1)
  // El kerf se descuenta del espacio libre: la sierra consume material en cada corte
  const wk = w + KERF
  const hk = h + KERF
  if (espacio.w - wk > 0) espacios.push({ x: espacio.x + wk, y: espacio.y, w: espacio.w - wk, h })
  if (espacio.h - hk > 0) espacios.push({ x: espacio.x, y: espacio.y + hk, w: espacio.w, h: espacio.h - hk })
  espacios.sort((a, b) => (a.y - b.y) || (a.x - b.x))
}

const COLORES = ['#4a9eff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c', '#86efac', '#f472b6', '#67e8f9']

function DiagramaPlancha({ plancha, escala, planchaW, planchaH }) {
  const W = planchaW * escala
  const H = planchaH * escala

  return (
    <div style={{ position: 'relative', width: W, height: H, border: '2px solid #9ca3af', background: '#e5e7eb', flexShrink: 0 }}>
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
        <defs>
          <pattern id="diag" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#d1d5db" strokeWidth="3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#diag)" />
      </svg>

      {plancha.cortes.map((c, i) => {
        const cx = c.x * escala
        const cy = c.y * escala
        const cw = c.w * escala
        const ch = c.h * escala
        const color = COLORES[c.colorIdx % COLORES.length]
        return (
          <div key={i} style={{
            position: 'absolute', left: cx, top: cy, width: cw, height: ch,
            background: 'white', border: `2px solid ${color}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', boxSizing: 'border-box'
          }}>
            {cw > 25 && ch > 18 && (
              <>
                <span style={{ fontSize: Math.min(cw, ch) * 0.15 > 11 ? 11 : Math.min(cw, ch) * 0.15, color: '#222', fontWeight: '600', lineHeight: 1.2, textAlign: 'center', padding: '0 2px' }}>
                  {c.nombre || `P${i + 1}`}
                </span>
                <span style={{ fontSize: Math.min(cw, ch) * 0.12 > 9 ? 9 : Math.min(cw, ch) * 0.12, color: '#555', lineHeight: 1.2 }}>
                  {c.w}×{c.h}cm
                </span>
              </>
            )}
          </div>
        )
      })}

      <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 9, color: '#6b7280' }}>
        {planchaW}×{planchaH}cm
      </div>
    </div>
  )
}

const PASOS = ['Datos del Cliente', 'Selección de Tablero', 'Dimensiones de Piezas', 'Optimizar']

export default function Dimensionador({ prefill, onPrefillConsumido }) {
  const { profile } = useAuth()
  const [vista, setVista] = useState('proyectos') // 'proyectos' | 'nuevo'
  const [paso, setPaso] = useState(0)
  const [cliente, setCliente] = useState({ nombre: '', rut: '', telefono: '' })
  const [planchasStock, setPlanchasStock] = useState([])
  const [planchaSeleccionada, setPlanchaSeleccionada] = useState(null)
  const [busquedaPlancha, setBusquedaPlancha] = useState('')
  const [piezas, setPiezas] = useState(
    Array.from({ length: 8 }, () => ({ cantidad: '', nombre: '', largo: '', ancho: '' }))
  )
  const [dimensiones, setDimensiones] = useState({ w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT })
  const [resultado, setResultado] = useState(null)
  const [proyectos, setProyectos] = useState([])
  const [proyectoActivo, setProyectoActivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [filtroFecha, setFiltroFecha] = useState('todos') // 'todos' | 'hoy' | 'semana' | 'mes'
  const [busquedaProyecto, setBusquedaProyecto] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const diagramaRef = useRef(null)

  const esAdmin = profile?.rol === 'administrador'

  // Clientes ya atendidos antes, deduplicados por RUT (proyectos viene ordenado
  // por fecha descendente, así que el primero que aparece es el más reciente).
  const clientesPrevios = useMemo(() => {
    const vistos = new Map()
    for (const p of proyectos) {
      if (!p.cliente_rut || vistos.has(p.cliente_rut)) continue
      vistos.set(p.cliente_rut, { nombre: p.cliente_nombre, rut: p.cliente_rut, telefono: p.cliente_telefono ?? '' })
    }
    return [...vistos.values()]
  }, [proyectos])

  const sugerenciasCliente = useMemo(() => {
    const porNombre = cliente.nombre.trim().toLowerCase()
    const porRut = cliente.rut.replace(/[^0-9kK]/g, '')
    if (porNombre.length < 2 && porRut.length < 3) return []
    return clientesPrevios.filter(c =>
      (porNombre.length >= 2 && c.nombre?.toLowerCase().includes(porNombre)) ||
      (porRut.length >= 3 && c.rut?.replace(/[^0-9kK]/g, '').includes(porRut))
    ).slice(0, 5)
  }, [cliente.nombre, cliente.rut, clientesPrevios])

  function elegirClientePrevio(c) {
    setCliente({ nombre: c.nombre ?? '', rut: c.rut ?? '', telefono: c.telefono ?? '' })
    setMostrarSugerencias(false)
  }

  useEffect(() => { fetchPlanchas(); fetchProyectos() }, [])

  // Llega desde "Órdenes" al aprobar una boleta y confirmar que el cliente cortará sus planchas:
  // precarga el teléfono y la plancha, el resto del proyecto se completa a mano como siempre.
  useEffect(() => {
    if (!prefill || planchasStock.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVista('nuevo')
    setPaso(0)
    setCliente(c => ({ ...c, telefono: prefill.telefono ?? '' }))
    const plancha = planchasStock.find(p => p.tipo_plancha_id === prefill.tipo_plancha_id)
    if (plancha) setPlanchaSeleccionada(plancha)
    onPrefillConsumido?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, planchasStock])

  async function fetchPlanchas() {
    const { data } = await supabase
      .from('vista_stock_general')
      .select('*')
      .gt('disponible', 0)
      .not('plancha_categoria', 'in', '("Servicios","Otros")')
      .order('plancha_categoria')
      .order('plancha_nombre')
    setPlanchasStock(data ?? [])
  }

  async function fetchProyectos() {
    const { data } = await supabase
      .from('proyectos_dimensionado')
      .select('*')
      .order('creado_en', { ascending: false })
    setProyectos(data ?? [])
  }

  async function handleGuardar() {
    setGuardando(true)
    setError('')
    const { error } = await supabase.from('proyectos_dimensionado').insert({
      cliente_nombre: cliente.nombre,
      cliente_rut: cliente.rut,
      cliente_telefono: cliente.telefono,
      plancha_nombre: planchaSeleccionada?.plancha_nombre,
      plancha_medida: planchaSeleccionada?.plancha_medida,
      piezas: piezasValidas,
      // Se guardan también las dimensiones del tablero para reabrir el proyecto fiel al original
      resultado: { dims: dimensiones, planchas: resultado },
      creado_por: profile.id,
      creado_por_nombre: profile.nombre
    })
    if (error) {
      setError('No se pudo guardar el proyecto')
    } else {
      await registrarLog({
        accion: 'CREAR',
        entidad: 'proyecto',
        detalle: { cliente: cliente.nombre, plancha: `${planchaSeleccionada?.plancha_nombre ?? ''} ${planchaSeleccionada?.plancha_medida ?? ''}`.trim() }
      }, profile)
      setGuardadoOk(true)
      fetchProyectos()
      setTimeout(() => setGuardadoOk(false), 3000)
    }
    setGuardando(false)
  }

  async function handleEliminar(p) {
    if (!confirm('¿Eliminar este proyecto?')) return
    const { error } = await supabase.from('proyectos_dimensionado').delete().eq('id', p.id)
    if (error) { alert('No se pudo eliminar el proyecto'); return }
    await registrarLog({
      accion: 'ELIMINAR',
      entidad: 'proyecto',
      detalle: { cliente: p.cliente_nombre, plancha: `${p.plancha_nombre ?? ''} ${p.plancha_medida ?? ''}`.trim() }
    }, profile)
    fetchProyectos()
    if (proyectoActivo?.id === p.id) setProyectoActivo(null)
  }

  // Los proyectos antiguos guardaron `resultado` como array; los nuevos como { dims, planchas }
  function extraerResultado(p) {
    const res = p.resultado
    if (Array.isArray(res)) return { dims: { w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT }, planchas: res }
    return { dims: res?.dims ?? { w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT }, planchas: res?.planchas ?? [] }
  }

  function cargarProyecto(p) {
    const { dims, planchas } = extraerResultado(p)
    setCliente({ nombre: p.cliente_nombre, rut: p.cliente_rut ?? '', telefono: p.cliente_telefono ?? '' })
    setPlanchaSeleccionada({ plancha_nombre: p.plancha_nombre, plancha_medida: p.plancha_medida })
    setPiezas([...p.piezas, ...Array.from({ length: Math.max(0, 8 - p.piezas.length) }, () => ({ cantidad: '', nombre: '', largo: '', ancho: '' }))])
    setDimensiones(dims)
    setResultado(planchas)
    setProyectoActivo(p)
    setPaso(3)
    setVista('nuevo')
  }

  function nuevoProyecto() {
    setCliente({ nombre: '', rut: '', telefono: '' })
    setPlanchaSeleccionada(null)
    setPiezas(Array.from({ length: 8 }, () => ({ cantidad: '', nombre: '', largo: '', ancho: '' })))
    setDimensiones({ w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT })
    setResultado(null)
    setProyectoActivo(null)
    setPaso(0)
    setError('')
    setVista('nuevo')
  }

  function handleRut(val) {
    const clean = val.replace(/[^0-9kK]/g, '').toUpperCase()
    setCliente({ ...cliente, rut: formatRut(clean) })
  }

  function actualizarPieza(i, campo, valor) {
    const nuevas = [...piezas]
    nuevas[i] = { ...nuevas[i], [campo]: valor }
    setPiezas(nuevas)
  }

  function agregarFila() {
    setPiezas([...piezas, { cantidad: '', nombre: '', largo: '', ancho: '' }])
  }

  function eliminarFila(i) {
    if (piezas.length <= 1) return
    setPiezas(piezas.filter((_, idx) => idx !== i))
  }

  const piezasValidas = piezas.filter(p => p.cantidad && p.largo && p.ancho)

  function calcular() {
    setError('')
    if (piezasValidas.length === 0) { setError('Ingresa al menos una pieza con cantidad, largo y ancho'); return }
    const { w: W, h: H } = dimensiones
    for (const p of piezasValidas) {
      const l = parseFloat(p.largo)
      const a = parseFloat(p.ancho)
      // Una pieza es válida si cabe derecha o rotada 90°
      const cabe = (l <= W && a <= H) || (a <= W && l <= H)
      if (!cabe) {
        setError(`Una pieza (${p.largo}×${p.ancho}cm) excede las dimensiones de la plancha (${W}×${H}cm), incluso rotada`)
        return
      }
    }
    const cortesValidos = piezasValidas.map(p => ({
      largo: parseFloat(p.largo),
      ancho: parseFloat(p.ancho),
      cantidad: parseInt(p.cantidad),
      nombre: p.nombre
    }))
    const { planchas, noColocadas } = calcularDistribucion(cortesValidos, W, H)
    if (noColocadas.length > 0) {
      setError(`${noColocadas.length} pieza(s) no pudieron ubicarse en ningún tablero. Revisa las medidas.`)
      return
    }
    setResultado(planchas)
    setPaso(3)
  }

  async function exportarPDF() {
    setExportando(true)
    // Carga diferida: jsPDF + html2canvas pesan ~1 MB y solo se usan aquí
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas')
    ])
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210
    const margin = 15

    pdf.rect(0, 0, pageW, 297, 'F')
    pdf.setFontSize(16); pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(31, 41, 55)
    pdf.text('Informe de Dimensionado', margin, 22)
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(107, 114, 128)
    pdf.text(new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }), margin, 29)
    pdf.setDrawColor(242, 107, 29); pdf.setLineWidth(0.4)
    pdf.line(margin, 33, pageW - margin, 33)

    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(31, 41, 55)
    pdf.text('DATOS DEL CLIENTE', margin, 42)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(55, 65, 81)
    pdf.text(`Nombre: ${cliente.nombre}`, margin, 50)
    // RUT parcial en el documento impreso: el PDF circula fuera del sistema
    pdf.text(`RUT: ${maskRut(cliente.rut)}`, margin, 57)
    pdf.text(`Teléfono: ${cliente.telefono}`, margin, 64)

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(31, 41, 55)
    pdf.text('TABLERO ELEGIDO', pageW / 2 + 5, 42)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(55, 65, 81)
    pdf.text(planchaSeleccionada ? `${planchaSeleccionada.plancha_nombre} ${planchaSeleccionada.plancha_medida}` : '—', pageW / 2 + 5, 50)
    pdf.text(`${dimensiones.w} x ${dimensiones.h} cm`, pageW / 2 + 5, 57)

    let y = 76
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(31, 41, 55)
    pdf.text('DIMENSIONES DE PIEZAS', margin, y); y += 8
    pdf.setFillColor(236, 238, 242)
    pdf.rect(margin, y - 4, pageW - margin * 2, 7, 'F')
    pdf.setFontSize(8); pdf.setTextColor(107, 114, 128)
    pdf.text('No.', margin + 2, y)
    pdf.text('Cant.', margin + 14, y)
    pdf.text('Nombre pieza', margin + 28, y)
    pdf.text('Largo (cm)', margin + 80, y)
    pdf.text('Ancho (cm)', margin + 115, y)
    y += 6

    piezasValidas.forEach((p, i) => {
      if (i % 2 === 0) { pdf.setFillColor(244, 245, 247); pdf.rect(margin, y - 4, pageW - margin * 2, 7, 'F') }
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(31, 41, 55)
      pdf.text(String(i + 1), margin + 2, y)
      pdf.text(String(p.cantidad), margin + 14, y)
      pdf.text(p.nombre || '—', margin + 28, y)
      pdf.text(String(p.largo), margin + 80, y)
      pdf.text(String(p.ancho), margin + 115, y)
      y += 7
    })

    if (resultado && diagramaRef.current) {
      const svgs = diagramaRef.current.querySelectorAll('.diagrama-wrap')
      for (let pi = 0; pi < resultado.length; pi++) {
        pdf.addPage()
        pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(31, 41, 55)
        pdf.text(`Plancha ${pi + 1} de ${resultado.length}`, margin, 18)
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(107, 114, 128)
        pdf.text(`${resultado[pi].cortes.length} piezas · Cliente: ${cliente.nombre}`, margin, 25)
        pdf.setDrawColor(242, 107, 29); pdf.line(margin, 28, 195, 28)

        if (svgs[pi]) {
          const canvas = await html2canvas(svgs[pi], { backgroundColor: '#e5e7eb', scale: 2 })
          const img = canvas.toDataURL('image/png')
          const dispW = 180, dispH = 240
          const ratio = dimensiones.h / dimensiones.w
          let iW = dispW, iH = iW * ratio
          if (iH > dispH) { iH = dispH; iW = iH / ratio }
          pdf.addImage(img, 'PNG', margin + (dispW - iW) / 2, 33, iW, iH)
        }
      }
    }

    pdf.save(`dimensionado_${cliente.nombre.replace(/\s+/g, '_') || 'cliente'}.pdf`)
    setExportando(false)
  }

  const planchasFiltradas = planchasStock.filter(p =>
    `${p.plancha_nombre} ${p.plancha_medida} ${p.plancha_sku}`.toLowerCase().includes(busquedaPlancha.toLowerCase())
  )

  const eficiencia = resultado?.map(p => {
    const usada = p.cortes.reduce((s, c) => s + c.w * c.h, 0)
    return Math.round((usada / (dimensiones.w * dimensiones.h)) * 100)
  }) ?? []
  const eficienciaPromedio = eficiencia.length
    ? Math.round(eficiencia.reduce((s, e) => s + e, 0) / eficiencia.length)
    : 0

  // ── VISTA PROYECTOS ──
  if (vista === 'proyectos') {
    const hoy = hoyChile()
    // Fecha (YYYY-MM-DD) de un proyecto en horario de Chile
    const fechaDe = (p) => new Date(p.creado_en).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
    const lunes = new Date(`${hoy}T12:00:00`)
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
    const inicioSemana = lunes.toLocaleDateString('en-CA')
    const enRango = (p, filtro) => {
      const f = fechaDe(p)
      if (filtro === 'hoy') return f === hoy
      if (filtro === 'semana') return f >= inicioSemana
      if (filtro === 'mes') return f.slice(0, 7) === hoy.slice(0, 7)
      return true
    }
    // m² de piezas pedidas (largo y ancho en cm)
    const m2De = (p) => (Array.isArray(p.piezas) ? p.piezas : []).reduce(
      (s, z) => s + (parseFloat(z.cantidad) || 0) * (parseFloat(z.largo) || 0) * (parseFloat(z.ancho) || 0) / 10000, 0)

    const proyectosHoy = proyectos.filter(p => enRango(p, 'hoy'))
    const proyectosMes = proyectos.filter(p => enRango(p, 'mes'))
    const tablerosHoy = proyectosHoy.reduce((s, p) => s + extraerResultado(p).planchas.length, 0)
    const m2Hoy = proyectosHoy.reduce((s, p) => s + m2De(p), 0)

    const q = busquedaProyecto.trim().toLowerCase()
    const vendedores = [...new Set(proyectos.map(p => p.creado_por_nombre).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    const proyectosFiltrados = proyectos.filter(p =>
      enRango(p, filtroFecha) &&
      (filtroVendedor === '' || p.creado_por_nombre === filtroVendedor) &&
      (q === '' ||
        (p.cliente_nombre ?? '').toLowerCase().includes(q) ||
        (p.cliente_rut ?? '').toLowerCase().includes(q) ||
        `${p.plancha_nombre ?? ''} ${p.plancha_medida ?? ''}`.toLowerCase().includes(q))
    )
    const hayFiltro = filtroFecha !== 'todos' || filtroVendedor !== '' || q !== ''

    const chip = (activo) => ({
      padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
      border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
      background: activo ? 'var(--primary)' : 'var(--bg2)',
      color: activo ? '#fff' : 'var(--text2)'
    })
    const tarjeta = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px' }
    const indicador = (icono, titulo, valor, detalle) => (
      <div key={titulo} style={tarjeta}>
        <p style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: '600', marginBottom: '6px' }}>{icono} {titulo}</p>
        <p style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text1)', lineHeight: 1.1 }}>{valor}</p>
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{detalle}</p>
      </div>
    )

    return (
      <div style={{ color: 'var(--text1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Proyectos de Dimensionado</h2>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{proyectos.length} proyectos guardados</p>
          </div>
          <button onClick={nuevoProyecto}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '500' }}>
            + Nuevo proyecto
          </button>
        </div>

        {proyectos.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {indicador('✂️', 'Dimensionados hoy', proyectosHoy.length, proyectosHoy.length === 1 ? 'proyecto' : 'proyectos')}
              {indicador('📐', 'Tableros usados hoy', tablerosHoy, 'planchas a cortar')}
              {indicador('📏', 'm² cortados hoy', m2Hoy.toFixed(1), 'según piezas pedidas')}
              {indicador('📅', 'Dimensionados del mes', proyectosMes.length, `${proyectos.length} en total`)}
            </div>

            <div style={{ marginBottom: '10px' }}>
              <input type="text" placeholder="🔍 Buscar por cliente, RUT o plancha..."
                value={busquedaProyecto} onChange={e => setBusquedaProyecto(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
              <button style={chip(filtroFecha === 'todos')} onClick={() => setFiltroFecha('todos')}>Todos</button>
              <button style={chip(filtroFecha === 'hoy')} onClick={() => setFiltroFecha('hoy')}>Hoy ({proyectosHoy.length})</button>
              <button style={chip(filtroFecha === 'semana')} onClick={() => setFiltroFecha('semana')}>Esta semana</button>
              <button style={chip(filtroFecha === 'mes')} onClick={() => setFiltroFecha('mes')}>Este mes ({proyectosMes.length})</button>
              {vendedores.length > 0 && (
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ width: 'auto', minWidth: '180px' }}>
                  <option value="">Todos los vendedores</option>
                  {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              {hayFiltro && (
                <>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    {proyectosFiltrados.length} resultado{proyectosFiltrados.length !== 1 ? 's' : ''}
                  </span>
                  <button onClick={() => { setFiltroFecha('todos'); setFiltroVendedor(''); setBusquedaProyecto('') }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: '500' }}>
                    ✕ Limpiar filtros
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {proyectos.length === 0 ? (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '48px', textAlign: 'center' }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>✂️</p>
            <p style={{ color: 'var(--text3)', fontSize: '14px' }}>No hay proyectos guardados aún.</p>
            <button onClick={nuevoProyecto}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '500', marginTop: '16px' }}>
              Crear primer proyecto
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {proyectosFiltrados.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '32px' }}>
                No hay proyectos que coincidan con los filtros
              </p>
            )}
            {proyectosFiltrados.map(p => (
              <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '15px', fontWeight: '500' }}>{p.cliente_nombre}</p>
                    {p.cliente_rut && <span style={{ fontSize: '12px', color: 'var(--text3)' }}>RUT: {p.cliente_rut}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>🪵 {p.plancha_nombre} {p.plancha_medida}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>📐 {extraerResultado(p).planchas.length} tablero{extraerResultado(p).planchas.length !== 1 ? 's' : ''}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>👤 {p.creado_por_nombre}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>🕐 {new Date(p.creado_en).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => cargarProyecto(p)}
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid rgba(242,107,29,0.35)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '500' }}>
                    Ver
                  </button>
                  {esAdmin && (
                    <button onClick={() => handleEliminar(p)}
                      style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px' }}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── VISTA NUEVO / EDITOR ──
  return (
    <div style={{ color: 'var(--text1)', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button onClick={() => setVista('proyectos')}
          style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', cursor: 'pointer' }}>
          ← Volver a proyectos
        </button>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', gap: '0' }}>
        {PASOS.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < PASOS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: i < paso ? 'pointer' : 'default' }}
              onClick={() => i < paso && setPaso(i)}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '600', flexShrink: 0,
                background: i <= paso ? 'var(--primary)' : 'var(--bg3)',
                color: i <= paso ? '#fff' : 'var(--text3)',
                border: i === paso ? '2px solid #fdba74' : 'none'
              }}>
                {i < paso ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '12px', fontWeight: i === paso ? '600' : '400', color: i === paso ? 'var(--primary)' : i < paso ? 'var(--text2)' : 'var(--text3)', whiteSpace: 'nowrap' }}>
                {p}
              </span>
            </div>
            {i < PASOS.length - 1 && (
              <div style={{ flex: 1, height: '1px', background: i < paso ? 'var(--primary)' : 'var(--border)', margin: '0 8px' }} />
            )}
          </div>
        ))}
      </div>

      {/* PASO 1 */}
      {paso === 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '500', marginBottom: '20px' }}>Datos del Cliente</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>RUT *</label>
              <input value={cliente.rut} onChange={e => handleRut(e.target.value)}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                placeholder="12.345.678-9" maxLength={12} />
              {mostrarSugerencias && sugerenciasCliente.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 10,
                  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden'
                }}>
                  {sugerenciasCliente.map(c => (
                    <button key={c.rut} type="button" onMouseDown={() => elegirClientePrevio(c)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                        padding: '8px 12px', fontSize: '12px', color: 'var(--text1)', cursor: 'pointer', borderBottom: '1px solid var(--border)'
                      }}>
                      <div style={{ fontWeight: '500' }}>{c.nombre}</div>
                      <div style={{ color: 'var(--text3)', fontSize: '11px' }}>{c.rut}{c.telefono ? ` · ${c.telefono}` : ''}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Nombre y apellido *</label>
              <input value={cliente.nombre} onChange={e => setCliente({ ...cliente, nombre: e.target.value })}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                placeholder="Juan Pérez" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Teléfono</label>
              <input value={cliente.telefono} onChange={e => setCliente({ ...cliente, telefono: e.target.value })} placeholder="+56 9 1234 5678" />
            </div>
          </div>
          {sugerenciasCliente.length > 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
              💡 Cliente ya atendido antes — toca una sugerencia para autocompletar sus datos.
            </p>
          )}
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '14px', lineHeight: 1.5 }}>
            🔒 Los datos del cliente se usan únicamente para identificar y elaborar este proyecto de dimensionado.
            El cliente puede solicitar su acceso, rectificación o eliminación (Ley 19.628 / Ley 21.719).
          </p>
          {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button onClick={() => {
              if (!cliente.nombre || !cliente.rut) { setError('Nombre y RUT son obligatorios'); return }
              if (!validarRut(cliente.rut)) { setError('El RUT ingresado no es válido (dígito verificador incorrecto)'); return }
              setError(''); setPaso(1)
            }}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '500' }}>
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* PASO 2 */}
      {paso === 1 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '500', marginBottom: '6px' }}>Selección de Tablero</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Dimensiones del tablero (cm):</p>
            <input type="number" min="10" max="600" value={dimensiones.w}
              onChange={e => setDimensiones({ ...dimensiones, w: parseFloat(e.target.value) || PLANCHA_W_DEFAULT })}
              style={{ width: '80px', padding: '5px 8px', fontSize: '12px' }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>×</span>
            <input type="number" min="10" max="600" value={dimensiones.h}
              onChange={e => setDimensiones({ ...dimensiones, h: parseFloat(e.target.value) || PLANCHA_H_DEFAULT })}
              style={{ width: '80px', padding: '5px 8px', fontSize: '12px' }} />
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>(incluye descuento de sierra de {KERF * 10} mm por corte)</span>
          </div>
          <input type="text" placeholder="Buscar por nombre, medida o SKU..."
            value={busquedaPlancha} onChange={e => setBusquedaPlancha(e.target.value)}
            style={{ marginBottom: '12px' }} />
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
            {planchasFiltradas.map((p, i) => (
              <div key={i} onClick={() => setPlanchaSeleccionada(p)}
                style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: planchaSeleccionada?.tipo_plancha_id === p.tipo_plancha_id ? 'var(--primary-soft)' : i % 2 === 0 ? 'var(--bg2)' : 'var(--bg3)',
                }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text1)' }}>{p.plancha_nombre} {p.plancha_medida}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)' }}>SKU: {p.plancha_sku ?? '—'} · {p.disponible} disponibles</p>
                </div>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '3px',
                  border: `2px solid ${planchaSeleccionada?.tipo_plancha_id === p.tipo_plancha_id ? 'var(--primary)' : 'var(--border)'}`,
                  background: planchaSeleccionada?.tipo_plancha_id === p.tipo_plancha_id ? 'var(--primary)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {planchaSeleccionada?.tipo_plancha_id === p.tipo_plancha_id && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
                </div>
              </div>
            ))}
            {planchasFiltradas.length === 0 && (
              <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>No se encontraron planchas con stock</p>
            )}
          </div>
          {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
            <button onClick={() => { setError(''); setPaso(0) }}
              style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', fontSize: '13px' }}>
              ← Volver
            </button>
            <button onClick={() => { if (!planchaSeleccionada) { setError('Selecciona un tablero'); return } setError(''); setPaso(2) }}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '500' }}>
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* PASO 3 */}
      {paso === 2 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '500', marginBottom: '4px' }}>Dimensiones de Piezas</h3>
              <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Medidas en centímetros (cm)</p>
            </div>
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 16px', marginLeft: 'auto' }}>
              <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Tablero seleccionado</p>
              <p style={{ fontSize: '13px', fontWeight: '500' }}>{planchaSeleccionada?.plancha_nombre} {planchaSeleccionada?.plancha_medida}</p>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['No.', 'Cant. Piezas *', 'Nombre pieza', 'Largo (cm) *', 'Ancho (cm) *', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: '500', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {piezas.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.03)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: '12px' }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <input type="number" min="1" value={p.cantidad}
                        onChange={e => actualizarPieza(i, 'cantidad', e.target.value.replace(/[^0-9]/g, ''))}
                        onKeyDown={e => ['e','E','+','-','.'].includes(e.key) && e.preventDefault()}
                        style={{ width: '70px', padding: '6px 8px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input type="text" value={p.nombre}
                        onChange={e => actualizarPieza(i, 'nombre', e.target.value)}
                        placeholder="Ej: Puerta"
                        style={{ width: '120px', padding: '6px 8px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input type="number" min="1" max={dimensiones.w} value={p.largo}
                        onChange={e => actualizarPieza(i, 'largo', e.target.value.replace(/[^0-9.]/g, ''))}
                        onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
                        placeholder="cm"
                        style={{ width: '80px', padding: '6px 8px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input type="number" min="1" max={dimensiones.h} value={p.ancho}
                        onChange={e => actualizarPieza(i, 'ancho', e.target.value.replace(/[^0-9.]/g, ''))}
                        onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
                        placeholder="cm"
                        style={{ width: '80px', padding: '6px 8px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <button onClick={() => eliminarFila(i)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '14px', opacity: piezas.length === 1 ? 0.3 : 1 }}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={agregarFila}
            style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text3)', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', marginTop: '10px', cursor: 'pointer', width: '100%' }}>
            + Agregar fila
          </button>
          {error && <p style={{ fontSize: '12px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
            <button onClick={() => { setError(''); setPaso(1) }}
              style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', fontSize: '13px' }}>
              ← Volver
            </button>
            <button onClick={calcular}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '500' }}>
              Optimizar →
            </button>
          </div>
        </div>
      )}

      {/* PASO 4 — Resultado */}
      {paso === 3 && resultado && (
        <div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Tableros usados</p>
                  <p style={{ fontSize: '24px', fontWeight: '500', color: 'var(--primary)' }}>{resultado.length}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total piezas</p>
                  <p style={{ fontSize: '24px', fontWeight: '500' }}>{piezasValidas.reduce((s, p) => s + parseInt(p.cantidad), 0)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Eficiencia prom.</p>
                  <p style={{ fontSize: '24px', fontWeight: '500', color: 'var(--green)' }}>
                    {eficienciaPromedio}%
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => { setResultado(null); setPaso(2) }}
                  style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px' }}>
                  ← Editar
                </button>
                {!proyectoActivo && (
                  <button onClick={handleGuardar} disabled={guardando}
                    style={{ background: guardadoOk ? 'var(--green)' : 'var(--amber)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', opacity: guardando ? 0.7 : 1 }}>
                    {guardando ? 'Guardando...' : guardadoOk ? '✓ Guardado' : '💾 Guardar proyecto'}
                  </button>
                )}
                <button onClick={exportarPDF} disabled={exportando}
                  style={{ background: exportando ? 'var(--bg3)' : 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', opacity: exportando ? 0.7 : 1 }}>
                  {exportando ? 'Generando...' : '⬇ Exportar PDF'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 20px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>Datos del Cliente</p>
              <p style={{ fontSize: '13px', fontWeight: '500' }}>{cliente.nombre}</p>
              <p style={{ fontSize: '12px', color: 'var(--text3)' }}>RUT: {cliente.rut}</p>
              {cliente.telefono && <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Tel: {cliente.telefono}</p>}
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>Tablero Elegido</p>
              <p style={{ fontSize: '13px', fontWeight: '500' }}>{planchaSeleccionada?.plancha_nombre} {planchaSeleccionada?.plancha_medida}</p>
              <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{dimensiones.w} × {dimensiones.h} cm</p>
            </div>
          </div>

          <div ref={diagramaRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {resultado.map((plancha, pi) => (
              <div key={pi} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600' }}>Tablero {pi + 1} de {resultado.length}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{plancha.cortes.length} piezas</p>
                  </div>
                  <span style={{
                    background: eficiencia[pi] >= 70 ? 'var(--green-soft)' : 'var(--amber-soft)',
                    color: eficiencia[pi] >= 70 ? 'var(--green)' : 'var(--amber)',
                    fontSize: '12px', fontWeight: '500', padding: '3px 12px', borderRadius: '99px'
                  }}>
                    {eficiencia[pi]}% aprovechamiento
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minWidth: '300px' }}>
                    {/* Vista 2D */}
                    <div className="diagrama-wrap" style={{ overflowX: 'auto' }}>
                        <DiagramaPlancha plancha={plancha} escala={1.8} planchaW={dimensiones.w} planchaH={dimensiones.h} />
                    </div>
                  
                </div>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '40px 40px 1fr', gap: '8px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase' }}>Color</span>
                        <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase' }}>Cant.</span>
                        <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase' }}>Medidas</span>
                      </div>
                      {plancha.cortes.map((c, ci) => (
                        <div key={ci} style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '40px 40px 1fr', gap: '8px', alignItems: 'center' }}>
                          <div style={{ width: '28px', height: '14px', background: COLORES[c.colorIdx % COLORES.length], borderRadius: '3px' }} />
                          <span style={{ fontSize: '12px', color: 'var(--text2)' }}>1</span>
                          <span style={{ fontSize: '12px', color: 'var(--text1)' }}>{c.w}×{c.h}cm{c.rotado ? ' ↺' : ''}</span>
                        </div>
                      ))}
                      <div style={{ padding: '7px 12px', display: 'grid', gridTemplateColumns: '40px 40px 1fr', gap: '8px', alignItems: 'center' }}>
                        <div style={{ width: '28px', height: '14px', background: 'repeating-linear-gradient(45deg, #d1d5db 0px, #d1d5db 2px, #e5e7eb 2px, #e5e7eb 8px)', borderRadius: '3px' }} />
                        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>—</span>
                        <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Sobrante</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}