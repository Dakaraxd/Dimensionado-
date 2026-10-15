import { useState, useRef } from 'react'
import { calcularDistribucion, analizarSobrante, KERF, PLANCHA_W_DEFAULT, PLANCHA_H_DEFAULT } from '../lib/optimizador'
import { maskRut } from '../lib/rut'

const COLORES = ['#4a9eff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c', '#86efac', '#f472b6', '#67e8f9']
const FILAS_INICIALES = 8
const filaVacia = () => ({ cantidad: '', nombre: '', largo: '', ancho: '' })

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

const btnSecundario = { background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', fontSize: '13px' }
const btnPrimario = { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: '500' }

// Editor de cortes: piezas → optimizar → resultado.
//  - Dentro de una venta recibe onConfirmar / onSinCortes / onVolver.
//  - Como visor de un proyecto guardado se usa con `soloLectura`.
export default function EditorCortes({ cliente, plancha, inicial, soloLectura = false, onConfirmar, onSinCortes, onVolver, textoConfirmar = 'Continuar →' }) {
  const [piezas, setPiezas] = useState(() => {
    const base = inicial?.piezas ?? []
    return [...base, ...Array.from({ length: Math.max(0, FILAS_INICIALES - base.length) }, filaVacia)]
  })
  const [dimensiones, setDimensiones] = useState(inicial?.dims ?? { w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT })
  const [resultado, setResultado] = useState(inicial?.planchas ?? null)
  const [vista, setVista] = useState(inicial?.planchas ? 'resultado' : 'piezas')
  const [permitirGiro, setPermitirGiro] = useState(true)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)
  const diagramaRef = useRef(null)

  const piezasValidas = piezas.filter(p => p.cantidad && p.largo && p.ancho)

  function actualizarPieza(i, campo, valor) {
    const nuevas = [...piezas]
    nuevas[i] = { ...nuevas[i], [campo]: valor }
    setPiezas(nuevas)
  }

  function agregarFila() {
    setPiezas([...piezas, filaVacia()])
  }

  function eliminarFila(i) {
    if (piezas.length <= 1) return
    setPiezas(piezas.filter((_, idx) => idx !== i))
  }

  function calcular() {
    setError('')
    if (piezasValidas.length === 0) { setError('Ingresa al menos una pieza con cantidad, largo y ancho'); return }
    const { w: W, h: H } = dimensiones
    for (const p of piezasValidas) {
      const l = parseFloat(p.largo)
      const a = parseFloat(p.ancho)
      // Una pieza es válida si cabe derecha o, si se permite girar, rotada 90°
      const cabe = (l <= W && a <= H) || (permitirGiro && a <= W && l <= H)
      if (!cabe) {
        setError(permitirGiro
          ? `Una pieza (${p.largo}×${p.ancho}cm) excede las dimensiones de la plancha (${W}×${H}cm), incluso rotada`
          : `Una pieza (${p.largo}×${p.ancho}cm) no cabe en la plancha (${W}×${H}cm) sin girarla. Activa "Permitir girar piezas" si puede ir de lado`)
        return
      }
    }
    const cortesValidos = piezasValidas.map(p => ({
      largo: parseFloat(p.largo),
      ancho: parseFloat(p.ancho),
      cantidad: parseInt(p.cantidad),
      nombre: p.nombre
    }))
    const { planchas, noColocadas } = calcularDistribucion(cortesValidos, W, H, { permitirGiro })
    if (noColocadas.length > 0) {
      setError(`${noColocadas.length} pieza(s) no pudieron ubicarse en ningún tablero. Revisa las medidas.`)
      return
    }
    setResultado(planchas)
    setVista('resultado')
  }

  async function exportarPDF() {
    setExportando(true)
    try {
      // Carga diferida: jsPDF + html2canvas pesan ~1 MB y solo se usan aquí
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ])
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = 210
      const margin = 15

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
      pdf.text(plancha ? `${plancha.plancha_nombre} ${plancha.plancha_medida}` : '—', pageW / 2 + 5, 50)
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

      pdf.save(`dimensionado_${(cliente.nombre ?? '').replace(/\s+/g, '_') || 'cliente'}.pdf`)
    } catch {
      setError('No se pudo generar el PDF')
    } finally {
      setExportando(false)
    }
  }

  const eficiencia = resultado?.map(p => {
    const usada = p.cortes.reduce((s, c) => s + c.w * c.h, 0)
    return Math.round((usada / (dimensiones.w * dimensiones.h)) * 100)
  }) ?? []
  const sobrantes = resultado ? analizarSobrante(resultado, dimensiones.w, dimensiones.h).porTablero : []
  const eficienciaPromedio = eficiencia.length
    ? Math.round(eficiencia.reduce((s, e) => s + e, 0) / eficiencia.length)
    : 0

  // ── PASO: PIEZAS ──
  if (vista === 'piezas') {
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '500', marginBottom: '4px' }}>Cortes de las piezas</h3>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Medidas en centímetros (cm)</p>
          </div>
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 16px', marginLeft: 'auto' }}>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Tablero seleccionado</p>
            <p style={{ fontSize: '13px', fontWeight: '500' }}>{plancha?.plancha_nombre} {plancha?.plancha_medida}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
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

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
          <input type="checkbox" checked={permitirGiro} onChange={e => setPermitirGiro(e.target.checked)}
            style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text1)' }}>Permitir girar piezas 90°</strong> — ahorra material y deja un retazo más grande.
            Desmárcalo si la veta o el dibujo del tablero debe respetar la dirección.
          </span>
        </label>

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
                      onKeyDown={e => ['e', 'E', '+', '-', '.'].includes(e.key) && e.preventDefault()}
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
                      onKeyDown={e => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                      placeholder="cm"
                      style={{ width: '80px', padding: '6px 8px', fontSize: '12px' }} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input type="number" min="1" max={dimensiones.h} value={p.ancho}
                      onChange={e => actualizarPieza(i, 'ancho', e.target.value.replace(/[^0-9.]/g, ''))}
                      onKeyDown={e => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', gap: '10px', flexWrap: 'wrap' }}>
          {onVolver && <button onClick={onVolver} style={btnSecundario}>← Volver</button>}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {onSinCortes && (
              <button onClick={onSinCortes}
                style={{ ...btnSecundario, color: 'var(--text1)', fontWeight: '500' }}>
                No hacer corte
              </button>
            )}
            <button onClick={calcular} style={btnPrimario}>Optimizar →</button>
          </div>
        </div>
      </div>
    )
  }

  // ── PASO: RESULTADO ──
  return (
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
              <p style={{ fontSize: '24px', fontWeight: '500' }}>{resultado.reduce((s, p) => s + p.cortes.length, 0)}</p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Eficiencia prom.</p>
              <p style={{ fontSize: '24px', fontWeight: '500', color: 'var(--green)' }}>{eficienciaPromedio}%</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!soloLectura && (
              <button onClick={() => { setResultado(null); setVista('piezas') }}
                style={{ ...btnSecundario, padding: '8px 16px' }}>
                ← Editar
              </button>
            )}
            <button onClick={exportarPDF} disabled={exportando}
              style={{ background: exportando ? 'var(--bg3)' : 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', opacity: exportando ? 0.7 : 1 }}>
              {exportando ? 'Generando...' : '⬇ Exportar PDF'}
            </button>
            {!soloLectura && onConfirmar && (
              <button onClick={() => onConfirmar({ piezas: piezasValidas, dims: dimensiones, planchas: resultado })}
                style={{ ...btnPrimario, padding: '8px 18px' }}>
                {textoConfirmar}
              </button>
            )}
          </div>
        </div>
        {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '10px' }}>{error}</p>}
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
          <p style={{ fontSize: '13px', fontWeight: '500' }}>{plancha?.plancha_nombre} {plancha?.plancha_medida}</p>
          <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{dimensiones.w} × {dimensiones.h} cm</p>
        </div>
      </div>

      <div ref={diagramaRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {resultado.map((tablero, pi) => (
          <div key={pi} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600' }}>Tablero {pi + 1} de {resultado.length}</p>
                <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{tablero.cortes.length} piezas</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {sobrantes[pi]?.area > 0 && (
                  <span style={{ background: 'var(--info-soft)', color: 'var(--info)', fontSize: '12px', fontWeight: '500', padding: '3px 12px', borderRadius: '99px' }}
                    title="Rectángulo libre más grande que queda de este tablero, útil para otras órdenes">
                    ♻ Retazo reutilizable: {Math.round(sobrantes[pi].w)} × {Math.round(sobrantes[pi].h)} cm
                  </span>
                )}
                <span style={{
                  background: eficiencia[pi] >= 70 ? 'var(--green-soft)' : 'var(--amber-soft)',
                  color: eficiencia[pi] >= 70 ? 'var(--green)' : 'var(--amber)',
                  fontSize: '12px', fontWeight: '500', padding: '3px 12px', borderRadius: '99px'
                }}>
                  {eficiencia[pi]}% aprovechamiento
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minWidth: '300px' }}>
                <div className="diagrama-wrap" style={{ overflowX: 'auto' }}>
                  <DiagramaPlancha plancha={tablero} escala={1.8} planchaW={dimensiones.w} planchaH={dimensiones.h} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '40px 40px 1fr', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase' }}>Color</span>
                    <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase' }}>Cant.</span>
                    <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase' }}>Medidas</span>
                  </div>
                  {tablero.cortes.map((c, ci) => (
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
  )
}
