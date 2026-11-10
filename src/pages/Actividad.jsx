import { useState } from 'react'
import Logs from './Logs'
import Auditoria from './Auditoria'

const chip = (activo) => ({
  padding: '7px 16px', borderRadius: '99px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
  background: activo ? 'var(--primary)' : 'var(--bg2)',
  color: activo ? '#fff' : 'var(--text2)'
})

export default function Actividad() {
  const [vista, setVista] = useState('actividad')
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button style={chip(vista === 'actividad')} onClick={() => setVista('actividad')}>Actividad</button>
        <button style={chip(vista === 'auditoria')} onClick={() => setVista('auditoria')}>Auditoría de base de datos</button>
      </div>
      {vista === 'actividad' ? <Logs /> : <Auditoria />}
    </div>
  )
}
