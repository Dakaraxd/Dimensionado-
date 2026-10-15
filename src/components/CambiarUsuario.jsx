import { useState } from 'react'
import { leerCuentas, quitarCuenta, olvidarEquipo } from '../lib/cuentas'
import { ListaCuentas, Modal, PinDialogo } from './CuentasRapidas'

// Selector de cuentas del equipo (como el de Google): cambiar con PIN, agregar otra cuenta
// o quitar una cuenta de este equipo.
export default function CambiarUsuario({ usuario, onCerrar, onAgregarOtra, onConfigurarPin }) {
  const [cuentas, setCuentas] = useState(leerCuentas)
  const [cuentaPin, setCuentaPin] = useState(null)

  const vinculada = cuentas.some(c => c.user_id === usuario.id)
  const otras = cuentas.filter(c => c.user_id !== usuario.id)

  function quitar(c) {
    if (!confirm(`¿Quitar a ${c.nombre} de este equipo? Para volver a usar el PIN tendrá que iniciar sesión con su contraseña.`)) return
    if (c.user_id === usuario.id) olvidarEquipo(c.secreto) // solo el dueño de la sesión puede quitar su registro del servidor
    quitarCuenta(c.user_id)
    setCuentas(leerCuentas())
  }

  if (cuentaPin) {
    return <PinDialogo cuenta={cuentaPin} onCerrar={() => setCuentaPin(null)} onExito={onCerrar} />
  }

  return (
    <Modal titulo="Cambiar de usuario" onCerrar={onCerrar}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>Cambiar de usuario</h3>
      <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '14px' }}>
        {otras.length > 0 ? 'Elige una cuenta e ingresa su PIN.' : 'No hay otras cuentas en este equipo todavía.'}
      </p>

      {cuentas.length > 0 && (
        <ListaCuentas cuentas={cuentas} actualId={usuario.id} onElegir={setCuentaPin} onQuitar={quitar} />
      )}

      {!vinculada && (
        <div style={{ background: 'var(--primary-soft)', borderRadius: '10px', padding: '12px 14px', marginTop: '12px', fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
          Tu cuenta aún no tiene PIN en este equipo. Créalo para que puedas volver a entrar rápido.
          <button type="button" onClick={onConfigurarPin}
            style={{ display: 'block', marginTop: '8px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600 }}>
            🔐 Crear mi PIN
          </button>
        </div>
      )}

      <button type="button" onClick={onAgregarOtra}
        style={{ width: '100%', marginTop: '12px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text1)', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 500 }}>
        + Agregar otra cuenta
      </button>
      <button type="button" onClick={onCerrar}
        style={{ width: '100%', marginTop: '8px', background: 'transparent', border: 'none', color: 'var(--text3)', padding: '8px', fontSize: '13px' }}>
        Cerrar
      </button>
    </Modal>
  )
}
