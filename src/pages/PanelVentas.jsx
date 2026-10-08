import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, LabelList, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'
import { aYMD } from '../lib/fechas'

const COLORES_BARRAS = ['#f26b1d', '#2563eb', '#15803d', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d']
const COLOR_PRIMARIO = '#f26b1d'
const UMBRAL_STOCK_BAJO = 10
const EJE_TICK = { fill: '#6b7280', fontSize: 11 }
const GRILLA = 'rgba(15,23,42,0.08)'

function primerDiaMes(offsetMeses = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offsetMeses)
  return d
}

function rangoMes(base) {
  const desde = new Date(base.getFullYear(), base.getMonth(), 1)
  const hasta = new Date(base.getFullYear(), base.getMonth() + 1, 1)
  return { desde, hasta }
}

const cardStyle = {
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px'
}

function TooltipPersonalizado({ active, payload, label, sufijo = 'planchas' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
      <p style={{ color: 'var(--text2)', marginBottom: '2px' }}>{label}</p>
      <p style={{ color: 'var(--text1)', fontWeight: '600' }}>{payload[0].value} {sufijo}</p>
    </div>
  )
}

function Scorecard({ icono, titulo, valor, detalle, colorValor = 'var(--text1)', colorDetalle = 'var(--text3)' }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '18px' }}>{icono}</span>
        <p style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: '600' }}>{titulo}</p>
      </div>
      <p style={{ fontSize: typeof valor === 'number' ? '28px' : '19px', fontWeight: '700', color: colorValor, lineHeight: 1.2, wordBreak: 'break-word' }}>{valor}</p>
      <p style={{ fontSize: '12px', color: colorDetalle, marginTop: '4px' }}>{detalle}</p>
    </div>
  )
}

export default function PanelVentas() {
  const [offsetMeses, setOffsetMeses] = useState(0)
  const [ordenes, setOrdenes] = useState([])
  const [totalMesAnterior, setTotalMesAnterior] = useState(0)
  const [dimensionadosMes, setDimensionadosMes] = useState(0)
  const [pendientes, setPendientes] = useState(0)
  const [stock, setStock] = useState({ total: 0, tiposBajos: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)

  const mesBase = primerDiaMes(offsetMeses)
  const { desde, hasta } = rangoMes(mesBase)
  const nombreMes = mesBase.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  async function fetchVentas() {
    setLoading(true)
    setError('')
    const { desde: desdeAnt } = rangoMes(primerDiaMes(offsetMeses - 1))
    const rango = (d1, d2) => [`${aYMD(d1)}T00:00:00`, `${aYMD(d2)}T00:00:00`]
    const [ini, fin] = rango(desde, hasta)
    const [iniAnt, finAnt] = rango(desdeAnt, desde)

    const [ventas, anterior, proyectos, pend, stockRes] = await Promise.all([
      supabase
        .from('ordenes')
        .select('id, cantidad, aprobado_en, nro_boleta, tipo:tipos_plancha!tipo_plancha_id(nombre, medida, categoria)')
        .eq('estado', 'aprobada').gte('aprobado_en', ini).lt('aprobado_en', fin)
        .order('aprobado_en', { ascending: true }),
      supabase.from('ordenes').select('cantidad').eq('estado', 'aprobada').gte('aprobado_en', iniAnt).lt('aprobado_en', finAnt),
      supabase.from('proyectos_dimensionado').select('id', { count: 'exact', head: true }).gte('creado_en', ini).lt('creado_en', fin),
      supabase.from('ordenes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('vista_stock_general').select('disponible, plancha_categoria').not('plancha_categoria', 'in', '("Servicios","Otros")'),
    ])

    if (ventas.error) {
      setError('No se pudieron cargar las ventas del mes')
      setOrdenes([])
    } else {
      setOrdenes(ventas.data ?? [])
    }
    setTotalMesAnterior((anterior.data ?? []).reduce((s, o) => s + o.cantidad, 0))
    setDimensionadosMes(proyectos.count ?? 0)
    setPendientes(pend.count ?? 0)
    const filasStock = stockRes.data ?? []
    setStock({
      total: filasStock.reduce((s, f) => s + (f.disponible ?? 0), 0),
      tiposBajos: filasStock.filter(f => (f.disponible ?? 0) <= UMBRAL_STOCK_BAJO).length
    })
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchVentas() }, [offsetMeses])

  const stats = useMemo(() => {
    const totalPlanchas = ordenes.reduce((sum, o) => sum + o.cantidad, 0)

    // Volumen por día del mes
    const diasEnMes = new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0).getDate()
    const porDiaMap = {}
    for (let d = 1; d <= diasEnMes; d++) porDiaMap[d] = 0
    ordenes.forEach(o => {
      const dia = new Date(o.aprobado_en).getDate()
      porDiaMap[dia] = (porDiaMap[dia] ?? 0) + o.cantidad
    })
    const porDia = Object.entries(porDiaMap).map(([dia, cantidad]) => ({
      dia: String(dia),
      cantidad,
      fecha: new Date(mesBase.getFullYear(), mesBase.getMonth(), Number(dia))
    }))

    // Por tipo de plancha
    const porTipoMap = {}
    ordenes.forEach(o => {
      const nombre = o.tipo ? `${o.tipo.nombre} ${o.tipo.medida ?? ''}`.trim() : 'Sin tipo'
      porTipoMap[nombre] = (porTipoMap[nombre] ?? 0) + o.cantidad
    })
    const porTipo = Object.entries(porTipoMap)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)

    const masVendidos = porTipo.slice(0, 6)
    const menosVendidos = [...porTipo].sort((a, b) => a.cantidad - b.cantidad).slice(0, 6)

    // Por categoría
    const porCategoriaMap = {}
    ordenes.forEach(o => {
      const cat = o.tipo?.categoria || 'Otros'
      porCategoriaMap[cat] = (porCategoriaMap[cat] ?? 0) + o.cantidad
    })
    const porCategoria = Object.entries(porCategoriaMap)
      .map(([categoria, cantidad]) => ({ categoria, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)

    return { totalPlanchas, porDia, porTipo, masVendidos, menosVendidos, porCategoria }
  }, [ordenes, mesBase])

  // Variación contra el mes anterior
  const variacion = useMemo(() => {
    if (totalMesAnterior === 0) return null
    return Math.round(((stats.totalPlanchas - totalMesAnterior) / totalMesAnterior) * 100)
  }, [stats.totalPlanchas, totalMesAnterior])

  const detalleVentas = variacion === null
    ? 'Sin ventas el mes anterior para comparar'
    : `${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion)}% vs mes anterior (${totalMesAnterior})`
  const colorDetalleVentas = variacion === null ? 'var(--text3)' : variacion >= 0 ? 'var(--green)' : 'var(--red)'
  const top = stats.porTipo[0]

  async function exportarPDF() {
    setExportando(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ])

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margen = 14
      const anchoUtil = pageWidth - margen * 2
      let y = margen

      function asegurarEspacio(alturaNecesaria) {
        if (y + alturaNecesaria > pageHeight - margen) {
          pdf.addPage()
          y = margen
        }
      }

      function tituloSeccion(texto) {
        asegurarEspacio(12)
        pdf.setFont(undefined, 'bold')
        pdf.setFontSize(12)
        pdf.setTextColor(30, 32, 39)
        pdf.text(texto, margen, y)
        y += 3
        pdf.setDrawColor(242, 107, 29)
        pdf.setLineWidth(0.5)
        pdf.line(margen, y, margen + anchoUtil, y)
        y += 7
        pdf.setFont(undefined, 'normal')
        pdf.setTextColor(40, 40, 40)
      }

      // ---- Encabezado ----
      pdf.setFont(undefined, 'bold')
      pdf.setFontSize(18)
      pdf.setTextColor(30, 32, 39)
      pdf.text('Reporte de ventas', margen, y)
      y += 8
      pdf.setFont(undefined, 'normal')
      pdf.setFontSize(12)
      pdf.setTextColor(80, 80, 80)
      pdf.text(nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1), margen, y)
      y += 5
      pdf.setFontSize(9)
      pdf.setTextColor(130, 130, 130)
      pdf.text(`Generado el ${new Date().toLocaleString('es-CL')} — Dimensionado, Home Center`, margen, y)
      y += 10

      // ---- Resumen ----
      tituloSeccion('Resumen del mes')
      const resumenFilas = [
        ['Planchas vendidas', String(stats.totalPlanchas)],
        ['Mes anterior', variacion === null ? 'Sin ventas para comparar' : `${totalMesAnterior} planchas (${variacion >= 0 ? '+' : ''}${variacion}%)`],
        ['Proyectos dimensionados', String(dimensionadosMes)],
        ['Lo más vendido', top ? `${top.nombre} (${top.cantidad})` : '—']
      ]
      autoTable(pdf, {
        startY: y,
        margin: { left: margen, right: margen },
        body: resumenFilas,
        theme: 'plain',
        styles: { fontSize: 11, cellPadding: 1.5 },
        columnStyles: { 0: { textColor: [100, 100, 100] }, 1: { fontStyle: 'bold', textColor: [30, 32, 39] } }
      })
      y = pdf.lastAutoTable.finalY + 10

      // ---- Flujo del mes: gráfico de línea vectorial ----
      tituloSeccion('Flujo del mes — planchas vendidas por día')
      const chartH = 50
      const chartW = anchoUtil - 6
      asegurarEspacio(chartH + 16)
      const chartX = margen + 6
      const chartY = y
      const maxCantidad = Math.max(1, ...stats.porDia.map(d => d.cantidad))

      pdf.setDrawColor(220, 220, 220)
      pdf.setLineWidth(0.2)
      for (let i = 0; i <= 4; i++) {
        const ly = chartY + chartH - (chartH * i) / 4
        pdf.line(chartX, ly, chartX + chartW, ly)
        pdf.setFontSize(7)
        pdf.setTextColor(150, 150, 150)
        pdf.text(String(Math.round((maxCantidad * i) / 4)), chartX - 2, ly + 1, { align: 'right' })
      }

      const puntos = stats.porDia.map((d, i) => ({
        x: chartX + (chartW * i) / (stats.porDia.length - 1 || 1),
        y: chartY + chartH - (d.cantidad / maxCantidad) * chartH
      }))
      pdf.setDrawColor(242, 107, 29)
      pdf.setLineWidth(0.6)
      for (let i = 0; i < puntos.length - 1; i++) {
        pdf.line(puntos[i].x, puntos[i].y, puntos[i + 1].x, puntos[i + 1].y)
      }
      pdf.setFontSize(6.5)
      pdf.setTextColor(130, 130, 130)
      const pasoEtiqueta = Math.ceil(stats.porDia.length / 15)
      stats.porDia.forEach((d, i) => {
        if (i % pasoEtiqueta === 0) pdf.text(d.dia, puntos[i].x, chartY + chartH + 5, { align: 'center' })
      })
      pdf.setFontSize(7)
      pdf.text('Día del mes', chartX + chartW / 2, chartY + chartH + 10, { align: 'center' })
      pdf.text('Planchas', margen, chartY - 2)
      y = chartY + chartH + 16

      // ---- Tabla: ventas por tipo de plancha (ranking completo, de mayor a menor) ----
      tituloSeccion('Ventas por tipo de plancha')
      autoTable(pdf, {
        startY: y,
        margin: { left: margen, right: margen },
        head: [['#', 'Tipo de plancha', 'Planchas vendidas']],
        body: stats.porTipo.map((t, i) => [String(i + 1), t.nombre, String(t.cantidad)]),
        theme: 'striped',
        headStyles: { fillColor: [242, 107, 29], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right', cellWidth: 40 } }
      })
      y = pdf.lastAutoTable.finalY + 10

      // ---- Tabla: ventas por categoría ----
      if (stats.porCategoria.length > 1) {
        tituloSeccion('Ventas por categoría')
        autoTable(pdf, {
          startY: y,
          margin: { left: margen, right: margen },
          head: [['Categoría', 'Planchas vendidas']],
          body: stats.porCategoria.map(c => [c.categoria, String(c.cantidad)]),
          theme: 'striped',
          headStyles: { fillColor: [21, 128, 61], fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: { 1: { halign: 'right', cellWidth: 40 } }
        })
        y = pdf.lastAutoTable.finalY + 10
      }

      pdf.save(`reporte-ventas-${aYMD(mesBase)}.pdf`)
    } catch {
      setError('No se pudo generar el PDF')
    } finally {
      setExportando(false)
    }
  }

  const sinVentas = !loading && ordenes.length === 0
  const botonSecundario = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '2px' }}>Panel de ventas</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)', textTransform: 'capitalize' }}>{nombreMes}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setOffsetMeses(m => m - 1)} style={botonSecundario}>← Mes anterior</button>
          <button onClick={() => setOffsetMeses(m => m + 1)} disabled={offsetMeses >= 0}
            style={{ ...botonSecundario, opacity: offsetMeses >= 0 ? 0.5 : 1, cursor: offsetMeses >= 0 ? 'not-allowed' : 'pointer' }}>
            Mes siguiente →
          </button>
          <button onClick={exportarPDF} disabled={exportando || loading || sinVentas}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', opacity: (exportando || loading || sinVentas) ? 0.55 : 1 }}>
            {exportando ? 'Generando...' : '⬇ Exportar PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--red-soft)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--red)' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando panel...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Indicadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
            <Scorecard icono="🟫" titulo="Planchas vendidas" valor={stats.totalPlanchas}
              detalle={detalleVentas} colorValor="var(--primary)" colorDetalle={colorDetalleVentas} />
            <Scorecard icono="🕐" titulo="Órdenes pendientes (ahora)" valor={pendientes}
              detalle={pendientes > 0 ? 'Esperando aprobación de boleta' : 'Todo al día'}
              colorValor={pendientes > 0 ? 'var(--amber)' : 'var(--green)'} />
            <Scorecard icono="📦" titulo="Stock disponible (ahora)" valor={stock.total}
              detalle={stock.tiposBajos > 0 ? `${stock.tiposBajos} tipo${stock.tiposBajos !== 1 ? 's' : ''} con stock bajo (≤${UMBRAL_STOCK_BAJO})` : 'Sin alertas de stock bajo'}
              colorDetalle={stock.tiposBajos > 0 ? 'var(--red)' : 'var(--text3)'} />
            <Scorecard icono="✂️" titulo="Proyectos dimensionados" valor={dimensionadosMes} detalle="Creados en el mes" />
            <Scorecard icono="🏆" titulo="Lo más vendido" valor={top ? top.nombre : '—'}
              detalle={top ? `${top.cantidad} planchas en el mes` : 'Sin ventas en el mes'} colorValor="var(--text1)" />
          </div>

          {sinVentas ? (
            <div style={cardStyle}>
              <p style={{ color: 'var(--text3)', textAlign: 'center' }}>No hay ventas aprobadas para este mes.</p>
            </div>
          ) : (
            <>
              {/* Flujo del mes (volumen diario) */}
              <div style={cardStyle}>
                <p style={{ fontSize: '14px', fontWeight: '600' }}>Flujo del mes</p>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>Planchas vendidas en cada día del mes</p>
                <ResponsiveContainer width="100%" height={290}>
                  <AreaChart data={stats.porDia} margin={{ left: 0, right: 12, top: 8, bottom: 22 }}>
                    <defs>
                      <linearGradient id="gradFlujo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLOR_PRIMARIO} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={COLOR_PRIMARIO} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRILLA} vertical={false} />
                    <XAxis dataKey="dia" tick={EJE_TICK} axisLine={{ stroke: GRILLA }} tickLine={false}
                      label={{ value: 'Día del mes', position: 'insideBottom', offset: -12, fill: '#4b5563', fontSize: 12 }} />
                    <YAxis tick={EJE_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44}
                      label={{ value: 'Planchas', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 12, style: { textAnchor: 'middle' } }} />
                    <Tooltip content={<TooltipPersonalizado />} labelFormatter={d => `Día ${d}`} />
                    <Legend verticalAlign="top" align="right" iconType="plainline" wrapperStyle={{ fontSize: 12, paddingBottom: 6 }} />
                    <Area type="monotone" name="Planchas vendidas por día" dataKey="cantidad" stroke={COLOR_PRIMARIO} strokeWidth={2.5}
                      fill="url(#gradFlujo)" dot={{ r: 3, fill: COLOR_PRIMARIO }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {/* Más vendidos */}
                <div style={cardStyle}>
                  <p style={{ fontSize: '14px', fontWeight: '600' }}>Lo más vendido</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>Top de tipos de plancha (cantidad de planchas)</p>
                  <ResponsiveContainer width="100%" height={Math.max(150, stats.masVendidos.length * 46)}>
                    <BarChart data={stats.masVendidos} layout="vertical" margin={{ left: 0, right: 40, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRILLA} horizontal={false} />
                      <XAxis type="number" tick={EJE_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="nombre" width={140} tick={{ fill: '#374151', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<TooltipPersonalizado />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                      <Bar dataKey="cantidad" radius={[0, 6, 6, 0]}>
                        {stats.masVendidos.map((_, i) => <Cell key={i} fill={COLORES_BARRAS[i % COLORES_BARRAS.length]} />)}
                        <LabelList dataKey="cantidad" position="right" fill="#1f2937" fontSize={12} fontWeight={600} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Menos vendidos */}
                <div style={cardStyle}>
                  <p style={{ fontSize: '14px', fontWeight: '600' }}>Lo menos vendido</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>Tipos con menor salida (cantidad de planchas)</p>
                  <ResponsiveContainer width="100%" height={Math.max(150, stats.menosVendidos.length * 46)}>
                    <BarChart data={stats.menosVendidos} layout="vertical" margin={{ left: 0, right: 40, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRILLA} horizontal={false} />
                      <XAxis type="number" tick={EJE_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="nombre" width={140} tick={{ fill: '#374151', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<TooltipPersonalizado />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                      <Bar dataKey="cantidad" radius={[0, 6, 6, 0]} fill="#dc2626">
                        <LabelList dataKey="cantidad" position="right" fill="#1f2937" fontSize={12} fontWeight={600} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {stats.porTipo.length <= 1 && (
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '-10px' }}>
                  ℹ️ Este mes solo se vendió un tipo de plancha, por eso "más vendido" y "menos vendido" coinciden.
                </p>
              )}

              {/* Por categoría */}
              {stats.porCategoria.length > 1 && (
                <div style={cardStyle}>
                  <p style={{ fontSize: '14px', fontWeight: '600' }}>Ventas por categoría</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>Planchas vendidas agrupadas por categoría</p>
                  <ResponsiveContainer width="100%" height={270}>
                    <BarChart data={stats.porCategoria} margin={{ left: 0, right: 10, top: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRILLA} vertical={false} />
                      <XAxis dataKey="categoria" tick={{ fill: '#374151', fontSize: 11 }} axisLine={{ stroke: GRILLA }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={EJE_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44}
                        label={{ value: 'Planchas', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 12, style: { textAnchor: 'middle' } }} />
                      <Tooltip content={<TooltipPersonalizado />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                      <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                        {stats.porCategoria.map((_, i) => <Cell key={i} fill={COLORES_BARRAS[i % COLORES_BARRAS.length]} />)}
                        <LabelList dataKey="cantidad" position="top" fill="#1f2937" fontSize={12} fontWeight={600} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
