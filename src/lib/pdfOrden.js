// PDF de una orden terminada: comprobante (cliente, plancha, boleta, día de taller) y, si hubo cortes,
// una hoja por tablero con su diagrama 2D y la tabla de piezas.
// El diagrama se dibuja como vectores (no depende de lo que haya en pantalla).
import { maskRut } from './rut'
import { analizarSobrante } from './optimizador'
import { etapasDeCorte } from './etapas'

const COLORES = ['#4a9eff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c', '#86efac', '#f472b6', '#67e8f9']
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

const fechaLarga = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export function nombreArchivoOrden(venta) {
  const base = (venta.cliente?.nombre ?? venta.clienteNombre ?? 'cliente').trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'cliente'
  return venta.enEspera ? `orden_en_espera_${base}.pdf` : `orden_boleta_${venta.boleta}_${base}.pdf`
}

// venta: { enEspera, boleta, cantidad, plancha, cliente:{nombre,rut,telefono,email}, vendedor, servicios:[], nota,
//          fecha, creadoEn, cortes: null | { piezas, dims, planchas } }
export async function generarPdfOrden(venta) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210, pageH = 297, margin = 15
  const cl = venta.cliente ?? {}
  const estiloTabla = {
    margin: { left: margin, right: margin }, styles: { fontSize: 9, cellPadding: 1.8, textColor: [31, 41, 55] },
    headStyles: { fillColor: [236, 238, 242], textColor: [107, 114, 128], fontStyle: 'bold' },
  }
  const gris = () => pdf.setTextColor(107, 114, 128)
  const oscuro = () => pdf.setTextColor(31, 41, 55)
  const linea = (y) => { pdf.setDrawColor(227, 6, 19); pdf.setLineWidth(0.4); pdf.line(margin, y, pageW - margin, y) }

  // ── Hoja 1: comprobante ──
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); oscuro()
  pdf.text('Comprobante de orden', margin, 22)
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); gris()
  const creado = venta.creadoEn ? new Date(venta.creadoEn) : new Date()
  pdf.text(`${creado.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })} · ${creado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`, margin, 29)
  linea(33)

  // Estado
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
  if (venta.enEspera) {
    pdf.setTextColor(180, 83, 9)
    pdf.text('ORDEN EN ESPERA DE PAGO', margin, 42)
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal')
    pdf.text('Sin boleta todavía. Si no se paga hoy, la orden se cancela automáticamente a las 00:00.', margin, 48)
  } else {
    pdf.setTextColor(21, 128, 61)
    pdf.text(`ORDEN APROBADA · Boleta N° ${venta.boleta}`, margin, 42)
  }

  autoTable(pdf, {
    ...estiloTabla, startY: 54, theme: 'plain', styles: { fontSize: 10, cellPadding: 1.5, textColor: [55, 65, 81] },
    columnStyles: { 0: { cellWidth: 45, textColor: [107, 114, 128] }, 1: { fontStyle: 'bold', textColor: [31, 41, 55] } },
    body: [
      ['Cliente', cl.nombre ?? ''],
      // RUT parcial: el PDF circula fuera del sistema
      ['RUT', cl.rut ? maskRut(cl.rut) : '—'],
      ['Teléfono', cl.telefono || '—'],
      ...(cl.email ? [['Correo', cl.email]] : []),
      ['Plancha', venta.plancha],
      ['Cantidad de planchas', String(venta.cantidad)],
      ...(venta.servicios?.length ? [['Servicios', venta.servicios.join(', ')]] : []),
      ['Cortes', venta.cortes ? 'Sí, ver detalle en las hojas siguientes' : 'Sin cortes (se lleva planchas enteras)'],
      ...(venta.fecha ? [['Día de taller', fechaLarga(venta.fecha)]] : []),
      ...(venta.nota ? [['Nota', venta.nota]] : []),
      ...(venta.vendedor ? [['Atendido por', venta.vendedor]] : []),
    ],
  })

  // ── Cortes: resumen, piezas solicitadas y una hoja por tablero ──
  const c = venta.cortes
  if (c?.planchas?.length) {
    const W = c.dims?.w ?? 249, H = c.dims?.h ?? 182
    const sobrantes = analizarSobrante(c.planchas, W, H).porTablero
    const eficiencia = c.planchas.map(p => Math.round(p.cortes.reduce((s, x) => s + x.w * x.h, 0) / (W * H) * 100))
    const promedio = Math.round(eficiencia.reduce((s, e) => s + e, 0) / eficiencia.length)
    const totalPiezas = c.planchas.reduce((s, p) => s + p.cortes.length, 0)

    let y = pdf.lastAutoTable.finalY + 10
    if (y + 40 > pageH - 18) { pdf.addPage(); y = 20 }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); oscuro(); pdf.text('RESUMEN DE CORTES', margin, y)
    autoTable(pdf, {
      ...estiloTabla, startY: y + 3, theme: 'plain', styles: { fontSize: 10, cellPadding: 1.4, textColor: [55, 65, 81] },
      body: [['Tableros usados', String(c.planchas.length)], ['Total de piezas a cortar', String(totalPiezas)], ['Aprovechamiento promedio', `${promedio}%`]],
      columnStyles: { 0: { cellWidth: 60, textColor: [107, 114, 128] }, 1: { fontStyle: 'bold', textColor: [31, 41, 55] } },
    })

    const piezas = (c.piezas ?? []).filter(p => p.cantidad && p.largo && p.ancho)
    if (piezas.length) {
      y = pdf.lastAutoTable.finalY + 8
      if (y + 30 > pageH - 18) { pdf.addPage(); y = 20 }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); oscuro(); pdf.text('PIEZAS SOLICITADAS', margin, y)
      autoTable(pdf, {
        ...estiloTabla, startY: y + 3, theme: 'striped',
        head: [['No.', 'Cant.', 'Nombre pieza', 'Largo (cm)', 'Ancho (cm)']],
        body: piezas.map((p, i) => [i + 1, p.cantidad, p.nombre || '—', p.largo, p.ancho]),
        columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 16 }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      })
    }

    c.planchas.forEach((tablero, pi) => {
      pdf.addPage()
      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); oscuro()
      pdf.text(`Plancha ${pi + 1} de ${c.planchas.length}`, margin, 18)
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); gris()
      pdf.text(`${tablero.cortes.length} piezas · Cliente: ${cl.nombre ?? ''}`, margin, 25)
      const retazo = sobrantes[pi]?.area > 0 ? ` · Retazo reutilizable: ${Math.round(sobrantes[pi].w)} x ${Math.round(sobrantes[pi].h)} cm` : ''
      const et = etapasDeCorte(tablero.cortes, W, H)
      const etTxt = et.valido ? ` · ${et.etapas} etapa${et.etapas === 1 ? '' : 's'} de corte` : ''
      pdf.text(`Aprovechamiento: ${eficiencia[pi]}%${retazo}${etTxt}`, margin, 30)
      linea(33)

      // Diagrama 2D en vectores
      const dispW = 180, dispH = 135
      const ratio = H / W
      let iW = dispW, iH = iW * ratio
      if (iH > dispH) { iH = dispH; iW = iH / ratio }
      const ox = margin + (dispW - iW) / 2, oy = 38, k = iW / W
      pdf.setFillColor(229, 231, 235); pdf.setDrawColor(156, 163, 175); pdf.setLineWidth(0.4)
      pdf.rect(ox, oy, iW, iH, 'FD')
      tablero.cortes.forEach(p => {
        const color = rgb(COLORES[p.colorIdx % COLORES.length])
        const x = ox + p.x * k, yy = oy + p.y * k, w = p.w * k, h = p.h * k
        pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...color); pdf.setLineWidth(0.5)
        pdf.rect(x, yy, w, h, 'FD')
        if (w > 14 && h > 6) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(Math.max(5, Math.min(8, Math.min(w, h) * 0.35))); pdf.setTextColor(85, 85, 85)
          const texto = `${p.w}x${p.h}`
          if (p.nombre && h > 10) {
            pdf.text(String(p.nombre).slice(0, 18), x + w / 2, yy + h / 2 - 1, { align: 'center' })
            pdf.text(texto, x + w / 2, yy + h / 2 + 2.6, { align: 'center' })
          } else {
            pdf.text(texto, x + w / 2, yy + h / 2 + 1, { align: 'center' })
          }
        }
      })
      pdf.setFontSize(7); gris(); pdf.text(`${W} x ${H} cm`, ox + iW - 1, oy + iH - 1.5, { align: 'right' })

      // Cortes de este tablero: cantidad, largo y ancho; los iguales se juntan
      const grupos = new Map()
      tablero.cortes.forEach(p => {
        const largo = p.largo ?? p.w, ancho = p.ancho ?? p.h
        const clave = `${largo}x${ancho}x${p.colorIdx}`
        const g = grupos.get(clave)
        if (g) g.cantidad += 1
        else grupos.set(clave, { cantidad: 1, largo, ancho, colorIdx: p.colorIdx })
      })
      autoTable(pdf, {
        ...estiloTabla, startY: oy + iH + 6, theme: 'grid', tableWidth: pageW - margin * 2,
        head: [['', 'Cant.', 'Largo (cm)', 'Ancho (cm)']],
        body: [...grupos.values()].map(g => Object.assign(['', g.cantidad, g.largo, g.ancho], { colorIdx: g.colorIdx })),
        foot: [['', tablero.cortes.length, 'Total de piezas en este tablero', '']],
        footStyles: { fillColor: [236, 238, 242], textColor: [31, 41, 55], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0 && data.row.raw?.colorIdx !== undefined) {
            data.cell.styles.fillColor = rgb(COLORES[data.row.raw.colorIdx % COLORES.length])
          }
        },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 22, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
    })
  }

  // Numeración de hojas
  const total = pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(150, 150, 150)
    pdf.text(`Hoja ${i} de ${total}`, pageW / 2, pageH - 8, { align: 'center' })
  }
  return pdf
}
