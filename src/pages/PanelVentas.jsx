import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell
} from 'recharts'
import { supabase } from '../lib/supabase'
import { aYMD } from '../lib/fechas'

const COLORES_BARRAS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

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
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
      <p style={{ color: 'var(--text2)', marginBottom: '2px' }}>{label}</p>
      <p style={{ color: 'var(--text1)', fontWeight: '500' }}>{payload[0].value} {sufijo}</p>
    </div>
  )
}

export default function PanelVentas() {
  const [offsetMeses, setOffsetMeses] = useState(0)
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)

  const mesBase = primerDiaMes(offsetMeses)
  const { desde, hasta } = rangoMes(mesBase)
  const nombreMes = mesBase.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  async function fetchVentas() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('ordenes')
      .select(`
        id, cantidad, aprobado_en, nro_boleta,
        tipo:tipos_plancha!tipo_plancha_id(nombre, medida, categoria)
      `)
      .eq('estado', 'aprobada')
      .gte('aprobado_en', `${aYMD(desde)}T00:00:00`)
      .lt('aprobado_en', `${aYMD(hasta)}T00:00:00`)
      .order('aprobado_en', { ascending: true })

    if (err) {
      setError('No se pudieron cargar las ventas del mes')
      setOrdenes([])
    } else {
      setOrdenes(data ?? [])
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchVentas() }, [offsetMeses])

  const stats = useMemo(() => {
    const totalPlanchas = ordenes.reduce((sum, o) => sum + o.cantidad, 0)
    const boletas = new Set(ordenes.map(o => o.nro_boleta).filter(Boolean)).size

    // Volumen por día del mes
    const diasEnMes = hasta.getDate ? new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0).getDate() : 30
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

    const promedioDiario = diasEnMes > 0 ? (totalPlanchas / diasEnMes) : 0
    const mejorDia = porDia.reduce((max, d) => d.cantidad > max.cantidad ? d : max, { dia: null, cantidad: 0, fecha: null })

    return { totalPlanchas, boletas, porDia, porTipo, masVendidos, menosVendidos, porCategoria, promedioDiario, mejorDia }
  }, [ordenes, mesBase, hasta])

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
        pdf.setDrawColor(59, 130, 246)
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
      const nombreMesCapitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)
      pdf.text(nombreMesCapitalizado, margen, y)
      y += 5
      pdf.setFontSize(9)
      pdf.setTextColor(130, 130, 130)
      pdf.text(`Generado el ${new Date().toLocaleString('es-CL')} — Dimensionado, Home Center`, margen, y)
      y += 10

      // ---- Resumen ----
      tituloSeccion('Resumen del mes')
      const resumenFilas = [
        ['Planchas vendidas', String(stats.totalPlanchas)],
        ['Boletas emitidas', String(stats.boletas)],
        ['Promedio diario', stats.promedioDiario.toFixed(1)],
        ['Mejor día', stats.mejorDia.cantidad > 0 ? stats.mejorDia.fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric' }) : '—']
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
      const chartW = anchoUtil
      asegurarEspacio(chartH + 12)
      const chartX = margen
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
      pdf.setDrawColor(59, 130, 246)
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
      y = chartY + chartH + 12

      // ---- Tabla: ventas por tipo de plancha (ranking completo, de mayor a menor) ----
      tituloSeccion('Ventas por tipo de plancha')
      autoTable(pdf, {
        startY: y,
        margin: { left: margen, right: margen },
        head: [['#', 'Tipo de plancha', 'Planchas vendidas']],
        body: stats.porTipo.map((t, i) => [String(i + 1), t.nombre, String(t.cantidad)]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], fontSize: 9 },
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
          headStyles: { fillColor: [16, 185, 129], fontSize: 9 },
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

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Panel de ventas</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)', textTransform: 'capitalize' }}>{nombreMes}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setOffsetMeses(m => m - 1)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}>
            ← Mes anterior
          </button>
          <button onClick={() => setOffsetMeses(m => m + 1)} disabled={offsetMeses >= 0}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: offsetMeses >= 0 ? 'var(--text3)' : 'var(--text2)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', opacity: offsetMeses >= 0 ? 0.5 : 1, cursor: offsetMeses >= 0 ? 'not-allowed' : 'pointer' }}>
            Mes siguiente →
          </button>
          <button onClick={exportarPDF} disabled={exportando || loading || ordenes.length === 0}
            style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', opacity: (exportando || loading || ordenes.length === 0) ? 0.6 : 1 }}>
            {exportando ? 'Generando...' : '⬇ Exportar PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--red-soft)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--red)' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando ventas del mes...</p>
      ) : ordenes.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text3)', textAlign: 'center' }}>No hay ventas aprobadas para este mes.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Tarjetas resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
            <div style={cardStyle}>
              <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>Planchas vendidas</p>
              <p style={{ fontSize: '28px', fontWeight: '600', color: 'var(--blue)' }}>{stats.totalPlanchas}</p>
            </div>
            <div style={cardStyle}>
              <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>Boletas emitidas</p>
              <p style={{ fontSize: '28px', fontWeight: '600', color: 'var(--green)' }}>{stats.boletas}</p>
            </div>
            <div style={cardStyle}>
              <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>Promedio diario</p>
              <p style={{ fontSize: '28px', fontWeight: '600', color: 'var(--amber)' }}>{stats.promedioDiario.toFixed(1)}</p>
            </div>
            <div style={cardStyle}>
              <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>Mejor día</p>
              <p style={{ fontSize: '22px', fontWeight: '600', color: 'var(--purple)', textTransform: 'capitalize' }}>
                {stats.mejorDia.cantidad > 0
                  ? stats.mejorDia.fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric' })
                  : '—'}
              </p>
            </div>
          </div>

          {/* Flujo del mes (volumen diario) */}
          <div style={cardStyle}>
            <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '14px' }}>Flujo del mes — planchas vendidas por día</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.porDia} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradFlujo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<TooltipPersonalizado />} labelFormatter={d => `Día ${d}`} />
                <Area type="monotone" dataKey="cantidad" stroke="#3b82f6" strokeWidth={2} fill="url(#gradFlujo)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {stats.porTipo.length <= 1 && (
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '-10px' }}>
              ℹ️ Este mes solo se vendió {stats.porTipo.length === 1 ? 'un tipo de plancha' : 'ningún tipo de plancha'}, por eso "más vendido" y "menos vendido" coinciden.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Más vendidos */}
            <div style={cardStyle}>
              <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '14px' }}>Lo más vendido</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.masVendidos} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipPersonalizado />} />
                  <Bar dataKey="cantidad" radius={[0, 6, 6, 0]}>
                    {stats.masVendidos.map((_, i) => <Cell key={i} fill={COLORES_BARRAS[i % COLORES_BARRAS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Menos vendidos */}
            <div style={cardStyle}>
              <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '14px' }}>Lo menos vendido</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.menosVendidos} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipPersonalizado />} />
                  <Bar dataKey="cantidad" radius={[0, 6, 6, 0]} fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Por categoría */}
          {stats.porCategoria.length > 1 && (
            <div style={cardStyle}>
              <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '14px' }}>Ventas por categoría</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stats.porCategoria} margin={{ left: -20, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="categoria" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<TooltipPersonalizado />} />
                  <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                    {stats.porCategoria.map((_, i) => <Cell key={i} fill={COLORES_BARRAS[i % COLORES_BARRAS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
