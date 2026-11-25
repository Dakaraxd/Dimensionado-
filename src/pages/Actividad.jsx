import { useState } from 'react'
import Logs from './Logs'
import Auditoria from './Auditoria'

export default function Actividad() {
  const [vista, setVista] = useState('actividad')
  return (
    <div>
      {/* Selector de dos pestañas: el indicador rojo se desliza de una a otra */}
      <div className={`seg${vista === 'auditoria' ? ' segundo' : ''}`} role="tablist">
        <span className="indicador" aria-hidden="true" />
        <button role="tab" aria-selected={vista === 'actividad'} className={vista === 'actividad' ? 'activo' : ''} onClick={() => setVista('actividad')}>📋 Actividad</button>
        <button role="tab" aria-selected={vista === 'auditoria'} className={vista === 'auditoria' ? 'activo' : ''} onClick={() => setVista('auditoria')}>🛡️ Auditoría de base de datos</button>
      </div>
      {vista === 'actividad' ? <Logs /> : <Auditoria />}
    </div>
  )
}
