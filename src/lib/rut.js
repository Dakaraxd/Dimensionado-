// Utilidades de RUT chileno compartidas por el flujo de venta y el Dimensionador.

export function formatRut(rut) {
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return clean
  const dv = clean.slice(-1)
  const num = clean.slice(0, -1)
  const formatted = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}

// Valida el dígito verificador con módulo 11
export function validarRut(rut) {
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
export function maskRut(rut) {
  return rut.replace(/\d{3}-[\dkK]$/i, '•••-•')
}
