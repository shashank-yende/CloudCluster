import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import styles from './ClusterOrbit.module.css'
import { getWorkerName } from './workerSeries'

const FALLBACK_WORKERS = Array.from({ length: 5 }, (_, index) => [
  `node${index + 1}`,
  { status: 'Connecting', cpu_usage: 0, ram_usage: 0 },
])
const NODE_COLORS = ['#64d5bd', '#7db4ff', '#36c49b', '#f5a16b', '#e87594']

function spherePoint(index, count) {
  const vertical = 1 - 2 * ((index + 0.5) / Math.max(count, 1))
  const radius = Math.sqrt(Math.max(0, 1 - vertical * vertical))
  const angle = Math.PI * (3 - Math.sqrt(5)) * index
  return [Math.cos(angle) * radius, vertical, Math.sin(angle) * radius]
}

function rotatePoint([x, y, z], rotationX, rotationY) {
  const cosY = Math.cos(rotationY)
  const sinY = Math.sin(rotationY)
  const turnedX = x * cosY + z * sinY
  const turnedZ = -x * sinY + z * cosY
  return [turnedX, y * Math.cos(rotationX) - turnedZ * Math.sin(rotationX), y * Math.sin(rotationX) + turnedZ * Math.cos(rotationX)]
}

function metric(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : '—'
}

export default function ClusterOrbit({ nodes, tasks = [], variant = 'dashboard', theme = 'dark' }) {
  const authMode = variant === 'auth'
  const isDark = authMode || theme === 'dark'
  const canvasRef = useRef(null)
  const rotationRef = useRef({ x: -0.12, y: 0.42 })
  const dragRef = useRef(null)
  const zoomRef = useRef(1)
  const projectedRef = useRef([])
  const [hoveredId, setHoveredId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [activePoint, setActivePoint] = useState(null)
  const [sceneWidth, setSceneWidth] = useState(0)
  const [sceneHeight, setSceneHeight] = useState(0)

  const workers = useMemo(() => {
    const entries = Object.entries(nodes || {})
    return (entries.length ? entries : FALLBACK_WORKERS).map(([id, metrics]) => ({ id, ...metrics }))
  }, [nodes])
  const onlineCount = workers.filter(worker => worker.status === 'Online').length
  const primaryWorkers = workers.filter(worker => worker.role !== 'Backup')
  const systemStatus = primaryWorkers.length && primaryWorkers.every(worker => worker.status === 'Online')
    ? 'All systems nominal'
    : onlineCount > 0 ? 'Fleet checking in' : 'Fleet connecting'
  const activeNodeId = hoveredId || selectedId
  const activeWorker = workers.find(worker => worker.id === activeNodeId)
  const activeJobs = activeWorker ? tasks.filter(task => task.assigned_node === activeWorker.id && ['QUEUED', 'SUBMITTED', 'RUNNING'].includes(task.status)).length : 0

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return undefined

    let frameId
    let width = 0
    let height = 0
    let pixelRatio = 1
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const palette = isDark
      ? { ring: 'rgba(149,173,255,.22)', line: 'rgba(145,170,238,.23)', activeLine: 'rgba(119,228,255,.66)', label: '#f1f3ff', rim: 'rgba(244,247,255,.95)' }
      : { ring: 'rgba(80,101,157,.21)', line: 'rgba(69,103,171,.24)', activeLine: 'rgba(54,146,180,.62)', label: '#25334b', rim: 'rgba(255,255,255,.98)' }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      setSceneWidth(current => current === width ? current : width)
      setSceneHeight(current => current === height ? current : height)
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    const draw = () => {
      context.clearRect(0, 0, width, height)
      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width * 0.36, height * 0.76)
      // Keep the selected node stationary while its resource popover is open.
      if (!dragRef.current && !reduceMotion && !activeNodeId) rotationRef.current.y += 0.0018
      const rotation = rotationRef.current
      const workerPoints = workers.map((worker, index) => {
        const rotated = rotatePoint(spherePoint(index, workers.length), rotation.x, rotation.y)
        const perspective = (radius * zoomRef.current) / (1.9 - rotated[2] * 0.2)
        return {
          worker,
          index,
          x: centerX + rotated[0] * perspective,
          y: centerY + rotated[1] * perspective,
          depth: rotated[2],
        }
      })
      projectedRef.current = workerPoints

      const halo = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.3)
      halo.addColorStop(0, isDark ? 'rgba(89,108,255,.15)' : 'rgba(112,118,236,.105)')
      halo.addColorStop(0.55, isDark ? 'rgba(32,203,231,.055)' : 'rgba(37,173,187,.035)')
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      context.fillStyle = halo
      context.beginPath()
      context.arc(centerX, centerY, radius * 1.3, 0, Math.PI * 2)
      context.fill()

      for (let ring = 0; ring < 2; ring += 1) {
        context.beginPath()
        context.strokeStyle = palette.ring
        context.lineWidth = 0.8
        for (let segment = 0; segment <= 96; segment += 1) {
          const angle = segment / 96 * Math.PI * 2
          const point = ring === 0 ? [Math.cos(angle), 0, Math.sin(angle)] : [Math.cos(angle), Math.sin(angle), 0]
          const rotated = rotatePoint(point, rotation.x, rotation.y)
          const perspective = (radius * zoomRef.current) / (1.9 - rotated[2] * 0.2)
          const x = centerX + rotated[0] * perspective
          const y = centerY + rotated[1] * perspective
          if (segment === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      }

      context.lineWidth = 0.8
      for (let first = 0; first < workerPoints.length; first += 1) {
        for (let second = first + 1; second < workerPoints.length; second += 1) {
          if (Math.abs(first - second) > 2 && workerPoints.length > 4) continue
          const left = workerPoints[first]
          const right = workerPoints[second]
          const focused = left.worker.id === activeNodeId || right.worker.id === activeNodeId
          context.strokeStyle = focused ? palette.activeLine : palette.line
          context.beginPath()
          context.moveTo(left.x, left.y)
          context.lineTo(right.x, right.y)
          context.stroke()
        }
      }

      workerPoints.sort((a, b) => a.depth - b.depth).forEach(({ worker, index, x, y }) => {
        const selected = worker.id === activeNodeId
        const color = worker.status === 'Online' ? NODE_COLORS[index % NODE_COLORS.length] : isDark ? '#77839b' : '#9aa6ba'
        const size = selected ? 6.3 : 4.4
        context.shadowBlur = selected ? 18 : 10
        context.shadowColor = color
        context.fillStyle = color
        context.beginPath()
        context.arc(x, y, size, 0, Math.PI * 2)
        context.fill()
        context.shadowBlur = 0
        context.strokeStyle = palette.rim
        context.lineWidth = selected ? 1.7 : 1
        context.beginPath()
        context.arc(x, y, size + 2.5, 0, Math.PI * 2)
        context.stroke()
        if (selected) {
          context.font = '650 10px DM Sans, sans-serif'
          context.fillStyle = palette.label
          context.fillText(getWorkerName(worker.id), x + 11, y - 8)
        }
      })
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const animate = () => {
      draw()
      if (!reduceMotion) frameId = window.requestAnimationFrame(animate)
    }
    animate()
    return () => {
      observer.disconnect()
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [workers, activeNodeId, isDark])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const handleWheel = event => {
      event.preventDefault()
      zoomRef.current = Math.max(0.72, Math.min(1.45, zoomRef.current - event.deltaY * 0.001))
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [])

  const updateHover = event => {
    const bounds = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const closest = projectedRef.current.reduce((best, point) => {
      const distance = Math.hypot(point.x - x, point.y - y)
      return distance < best.distance ? { point, distance } : best
    }, { point: null, distance: 24 })
    if (closest.point) {
      setHoveredId(current => current === closest.point.worker.id ? current : closest.point.worker.id)
      setActivePoint(closest.point)
    } else {
      setHoveredId(null)
      setActivePoint(selectedId ? projectedRef.current.find(point => point.worker.id === selectedId) || null : null)
    }
  }

  const handlePointerDown = event => {
    dragRef.current = { x: event.clientX, y: event.clientY, rotation: { ...rotationRef.current }, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = event => {
    if (dragRef.current) {
      const deltaX = event.clientX - dragRef.current.x
      const deltaY = event.clientY - dragRef.current.y
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) dragRef.current.moved = true
      rotationRef.current = {
        y: dragRef.current.rotation.y + deltaX * 0.009,
        x: Math.max(-1.1, Math.min(1.1, dragRef.current.rotation.x + deltaY * 0.009)),
      }
    } else {
      updateHover(event)
    }
  }

  const handlePointerUp = event => {
    if (dragRef.current && !dragRef.current.moved) {
      const point = projectedRef.current.reduce((best, candidate) => {
        const bounds = canvasRef.current.getBoundingClientRect()
        const distance = Math.hypot(candidate.x - (event.clientX - bounds.left), candidate.y - (event.clientY - bounds.top))
        return distance < best.distance ? { candidate, distance } : best
      }, { candidate: null, distance: 24 })
      if (point.candidate) {
        const id = point.candidate.worker.id
        setSelectedId(current => current === id ? null : id)
        setActivePoint(point.candidate)
      }
    }
    dragRef.current = null
    if (selectedId) setActivePoint(projectedRef.current.find(point => point.worker.id === selectedId) || null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleDoubleClick = () => {
    rotationRef.current = { x: -0.12, y: 0.42 }
    zoomRef.current = 1
    setSelectedId(null)
  }

  const handleKeyDown = event => {
    if (event.key === 'Home') {
      event.preventDefault()
      handleDoubleClick()
      setHoveredId(null)
      setActivePoint(null)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const currentIndex = workers.findIndex(worker => worker.id === selectedId)
      const direction = event.key === 'ArrowRight' ? 1 : -1
      const nextIndex = currentIndex < 0
        ? direction > 0 ? 0 : workers.length - 1
        : (currentIndex + direction + workers.length) % workers.length
      const nextWorker = workers[nextIndex]
      setSelectedId(nextWorker.id)
      setHoveredId(null)
      setActivePoint(projectedRef.current.find(point => point.worker.id === nextWorker.id) || null)
    }
  }

  const tooltipSide = activePoint
    ? activePoint.x > sceneWidth * 0.64 ? 'left' : activePoint.x < sceneWidth * 0.36 ? 'right' : 'center'
    : 'right'
  const tooltipTop = activePoint
    ? Math.max(86, Math.min(sceneHeight - 86, activePoint.y))
    : 0

  return (
    <section className={`${styles.orbitCard} ${authMode ? styles.authOrbit : ''} ${!isDark ? styles.lightOrbit : ''}`} aria-label="Interactive worker cluster map">
      <header className={styles.orbitHeader}>
        <div className={styles.orbitTitle}>
          <span className={styles.liveIcon}><Sparkles size={13} /></span>
          <span><strong>{authMode ? 'Cluster in motion' : 'Cluster topology'}</strong><small>{authMode ? 'LIVE WORKER TOPOLOGY' : 'WORKER MAP · DRAG TO ORBIT'}</small></span>
        </div>
        <span className={styles.liveCount}><i /> {authMode ? systemStatus : `${onlineCount} / ${workers.length} online`}</span>
      </header>
      <div className={styles.sceneWrap}>
        <canvas
          ref={canvasRef}
          className={styles.sceneCanvas}
          tabIndex={0}
          aria-label="Animated worker cluster map. Hover or tap a node to inspect its resources. Drag to orbit and scroll to zoom. Double-click to reset."
          aria-keyshortcuts="ArrowLeft ArrowRight Home"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setHoveredId(null)
            setActivePoint(selectedId ? projectedRef.current.find(point => point.worker.id === selectedId) || null : null)
          }}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
        />
        {activeWorker && activePoint && (
          <aside
            className={styles.nodeTooltip}
            data-side={tooltipSide}
            style={{ left: `${activePoint.x}px`, top: `${tooltipTop}px` }}
            role="status"
            aria-live="polite"
          >
            <div className={styles.tooltipHeader}>
              <span className={styles.tooltipDot} data-online={activeWorker.status === 'Online'} />
              <strong>{getWorkerName(activeWorker.id)}</strong>
              <small>{activeWorker.status || 'Unknown'}</small>
            </div>
            <div className={styles.tooltipMetrics}>
              <span><small>CPU CORES</small><strong>{activeWorker.cpu_cores || activeWorker.total_cores || '—'} vCPU</strong></span>
              <span><small>MEMORY</small><strong>{activeWorker.total_ram_gb ? `${activeWorker.total_ram_gb} GB` : '—'}</strong></span>
              <span><small>CPU LOAD</small><strong>{metric(activeWorker.cpu_usage)}</strong></span>
              <span><small>MEMORY LOAD</small><strong>{metric(activeWorker.ram_usage)}</strong></span>
              <span><small>AVAILABLE RAM</small><strong>{activeWorker.available_ram_mb ? `${(activeWorker.available_ram_mb / 1024).toFixed(1)} GB` : '—'}</strong></span>
              <span><small>ACTIVE QUEUE</small><strong>{activeJobs} job{activeJobs === 1 ? '' : 's'}</strong></span>
            </div>
            <small className={styles.tooltipRole}>{activeWorker.role || 'Primary'} worker · {activeWorker.supported_tasks?.length || 6} workloads enabled</small>
          </aside>
        )}
      </div>
    </section>
  )
}
