// Tipos de movimiento de inventario (compartidos por el modal y el historial)
export const TIPOS_MOVIMIENTO = {
  ingreso: { icono: '📥', nombre: 'Ingreso', ayuda: 'Entra mercadería (compra, traspaso).', color: 'var(--green)', soft: 'var(--green-soft)', exigeMotivo: false },
  merma: { icono: '🗑️', nombre: 'Merma', ayuda: 'Planchas dañadas o perdidas. Resta del stock. Requiere la clave de un subgerente.', color: 'var(--red)', soft: 'var(--red-soft)', exigeMotivo: true, requiereSubgerente: true },
  devolucion: { icono: '↩️', nombre: 'Devolución', ayuda: 'Un cliente devuelve planchas ya vendidas; vuelven al stock.', color: 'var(--info)', soft: 'var(--info-soft)', exigeMotivo: true },
  ajuste: { icono: '⚖️', nombre: 'Ajuste', ayuda: 'Corrige el total según el conteo físico. Requiere la clave de un subgerente.', color: 'var(--amber)', soft: 'var(--amber-soft)', exigeMotivo: true, requiereSubgerente: true },
}
