import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const COLORES = ['#4a9eff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c', '#86efac', '#f472b6', '#67e8f9']
const GROSOR = 1.8 // cm de grosor de la plancha

export default function Plancha3D({ plancha, planchaW, planchaH, escala = 0.05 }) {
  const mountRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const frameRef = useRef(null)
  const meshesRef = useRef([])
  const [piezaSeleccionada, setPiezaSeleccionada] = useState(null)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const rotation = useRef({ x: -0.4, y: 0.5 })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const W = mount.clientWidth
    const H = mount.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#e5e7eb')
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000)
    camera.position.set(0, 12, 20)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(10, 20, 10)
    dirLight.castShadow = true
    scene.add(dirLight)

    const pointLight = new THREE.PointLight(0x4a9eff, 0.3)
    pointLight.position.set(-10, 10, 5)
    scene.add(pointLight)

    // Grupo principal centrado
    const group = new THREE.Group()
    scene.add(group)

    const pW = planchaW * escala
    const pH = planchaH * escala
    const pT = GROSOR * escala

    // Plancha base (sobrante) — color madera
    const baseGeo = new THREE.BoxGeometry(pW, pT, pH)
    const baseMat = new THREE.MeshPhongMaterial({
      color: 0x8B6914,
      specular: 0x222222,
      shininess: 30
    })
    const baseMesh = new THREE.Mesh(baseGeo, baseMat)
    baseMesh.receiveShadow = true
    baseMesh.position.set(0, 0, 0)
    group.add(baseMesh)

    // Grid helper
    const gridHelper = new THREE.GridHelper(Math.max(pW, pH) * 1.5, 10, 0x333344, 0x222233)
    gridHelper.position.y = -pT / 2 - 0.05
    scene.add(gridHelper)

    // Centrar grupo
    group.position.set(-pW / 2, 0, -pH / 2)

    // Cortes
    const meshes = []
    plancha.cortes.forEach((c, i) => {
      const cW = c.w * escala
      const cH = c.h * escala
      const cx = c.x * escala
      const cy = c.y * escala
      const color = new THREE.Color(COLORES[c.colorIdx % COLORES.length])

      // Pieza elevada
      const geo = new THREE.BoxGeometry(cW - 0.02, pT + 0.04, cH - 0.02)
      const mat = new THREE.MeshPhongMaterial({
        color,
        specular: 0x444444,
        shininess: 60,
        transparent: true,
        opacity: 0.92
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(
        cx + cW / 2,
        0.03,
        cy + cH / 2
      )
      mesh.userData = { corte: c, index: i, originalColor: color.clone() }
      group.add(mesh)
      meshes.push(mesh)

      // Borde de la pieza
      const edgesGeo = new THREE.EdgesGeometry(geo)
      const edgesMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
      const edges = new THREE.LineSegments(edgesGeo, edgesMat)
      mesh.add(edges)
    })
    meshesRef.current = meshes

    // Animate
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      group.rotation.y = rotation.current.y
      group.rotation.x = rotation.current.x
      renderer.render(scene, camera)
    }
    animate()

    // Resize
    const handleResize = () => {
      const W = mount.clientWidth
      const H = mount.clientHeight
      camera.aspect = W / H
      camera.updateProjectionMatrix()
      renderer.setSize(W, H)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(frameRef.current)
      mount.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [plancha, planchaW, planchaH, escala])

  // Mouse drag para rotar
  function onMouseDown(e) {
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  function onMouseMove(e) {
    if (!isDragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    rotation.current.y += dx * 0.01
    rotation.current.x += dy * 0.01
    rotation.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.current.x))
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  function onMouseUp() { isDragging.current = false }

  // Zoom con scroll
  function onWheel(e) {
    e.preventDefault()
    const camera = cameraRef.current
    if (!camera) return
    camera.position.z += e.deltaY * 0.03
    camera.position.z = Math.max(5, Math.min(50, camera.position.z))
  }

  // Click para seleccionar pieza
  function onMouseClick(e) {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return
    const rect = mountRef.current.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, cameraRef.current)
    const intersects = raycaster.intersectObjects(meshesRef.current)

    // Reset colores
    meshesRef.current.forEach(m => {
      m.material.emissive = new THREE.Color(0x000000)
      m.material.opacity = 0.92
    })

    if (intersects.length > 0) {
      const mesh = intersects[0].object
      if (mesh.userData.corte) {
        mesh.material.emissive = new THREE.Color(0x444444)
        mesh.material.opacity = 1
        setPiezaSeleccionada(mesh.userData.corte)
      }
    } else {
      setPiezaSeleccionada(null)
    }
  }

  // Touch para móvil
  const lastTouch = useRef(null)
  function onTouchStart(e) { lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  function onTouchMove(e) {
    if (!lastTouch.current) return
    const dx = e.touches[0].clientX - lastTouch.current.x
    const dy = e.touches[0].clientY - lastTouch.current.y
    rotation.current.y += dx * 0.01
    rotation.current.x += dy * 0.01
    rotation.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.current.x))
    lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Canvas 3D */}
      <div
        ref={mountRef}
        style={{ width: '100%', height: '420px', borderRadius: '12px', overflow: 'hidden', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onMouseClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => lastTouch.current = null}
      />

      {/* Info pieza seleccionada */}
      {piezaSeleccionada && (
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          background: 'rgba(30,32,39,0.95)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '12px 16px', minWidth: '160px'
        }}>
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Pieza seleccionada</p>
          {piezaSeleccionada.nombre && (
            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text1)', marginBottom: '4px' }}>{piezaSeleccionada.nombre}</p>
          )}
          <p style={{ fontSize: '13px', color: 'var(--primary)' }}>{piezaSeleccionada.w} × {piezaSeleccionada.h} cm</p>
          {piezaSeleccionada.rotado && <p style={{ fontSize: '11px', color: 'var(--amber)', marginTop: '4px' }}>↺ Rotada</p>}
          <button onClick={() => setPiezaSeleccionada(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '11px', marginTop: '8px', cursor: 'pointer', padding: 0 }}>
            Cerrar ✕
          </button>
        </div>
      )}

      {/* Controles hint */}
      <div style={{ position: 'absolute', bottom: '12px', left: '12px', display: 'flex', gap: '12px' }}>
        {[
          { icon: '🖱️', text: 'Arrastrar para rotar' },
          { icon: '🔍', text: 'Scroll para zoom' },
          { icon: '👆', text: 'Clic en pieza' },
        ].map(h => (
          <div key={h.text} style={{ background: 'rgba(30,32,39,0.8)', borderRadius: '6px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px' }}>{h.icon}</span>
            <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{h.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}