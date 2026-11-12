import { useMemo, useState, type PointerEvent, type WheelEvent } from 'react'
import { Cpu, HardDrive, MemoryStick, RotateCcw, X } from 'lucide-react'
import type { Worker } from '../types'

type Props = { workers: Worker[]; compact?: boolean }
const positions = [[0, -0.1], [1.45, 0.48], [2.75, -0.58], [4.05, 0.32], [5.1, -0.42]] as const
const colorMap: Record<string, string> = { violet: '#7968ff', blue: '#62a8ff', mint: '#55d6b0', orange: '#ffb35f', rose: '#ff7a98' }

export default function ClusterMap({ workers, compact = false }: Props) {
  const [rotation, setRotation] = useState(0.3)
  const [pitch, setPitch] = useState(0.12)
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<Worker | null>(null)
  const [dragging, setDragging] = useState(false)
  const [last, setLast] = useState<{ x: number; y: number } | null>(null)
  const projected = useMemo(() => workers.map((worker, index) => {
    const [angle, latitude] = positions[index % positions.length] ?? positions[0]
    const theta = angle + rotation
    const lat = latitude + pitch * Math.sin(theta)
    const depth = Math.cos(theta) * Math.cos(lat)
    return { worker, x: 260 + Math.sin(theta) * Math.cos(lat) * 154 * zoom, y: 158 + Math.sin(lat) * 92 * zoom, depth, radius: 8 + Math.max(depth, 0) * 4 }
  }).sort((a, b) => a.depth - b.depth), [workers, rotation, pitch, zoom])
  const startDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.target instanceof Element && event.target.closest('.worker-point')) return
    setDragging(true); setLast({ x: event.clientX, y: event.clientY }); event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragging || !last) return
    const dx = event.clientX - last.x
    const dy = event.clientY - last.y
    setRotation(value => value + dx * 0.009)
    setPitch(value => Math.max(-0.9, Math.min(0.9, value + dy * 0.007)))
    setLast({ x: event.clientX, y: event.clientY })
  }
  const finishDrag = () => { setDragging(false); setLast(null) }
  const wheel = (event: WheelEvent<SVGSVGElement>) => { event.preventDefault(); setZoom(value => Math.max(0.76, Math.min(1.42, value + (event.deltaY < 0 ? 0.06 : -0.06)))) }
  const reset = () => { setRotation(0.3); setPitch(0.12); setZoom(1); setSelected(null) }

  return <div className={`cluster-map ${compact ? 'cluster-map--compact' : ''}`}>
    <div className="map-toolbar"><span className="map-key"><i /> live worker topology</span><button className="map-reset" onClick={reset} aria-label="Reset cluster view"><RotateCcw size={14} /></button></div>
    <svg className={`map-svg ${dragging ? 'is-dragging' : ''}`} viewBox="0 0 520 320" role="img" aria-label="Interactive 3D worker cluster map" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onWheel={wheel}>
      <defs>
        <radialGradient id="coreGlow"><stop offset="0" stopColor="#8273ff" stopOpacity=".52"/><stop offset="1" stopColor="#8273ff" stopOpacity="0"/></radialGradient>
        <linearGradient id="orbit" x1="0" x2="1"><stop stopColor="#a09aff" stopOpacity=".05"/><stop offset=".5" stopColor="#9f91ff" stopOpacity=".75"/><stop offset="1" stopColor="#a09aff" stopOpacity=".05"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse cx="260" cy="159" rx={178 * zoom} ry={94 * zoom} fill="none" stroke="url(#orbit)" strokeDasharray="2 7" strokeWidth="1" transform={`rotate(${-12 + pitch * 14} 260 159)`}/>
      <ellipse cx="260" cy="159" rx={148 * zoom} ry={78 * zoom} fill="none" stroke="#8e89d8" strokeOpacity=".15" strokeWidth="1" transform={`rotate(${22 + rotation * 9} 260 159)`}/>
      <ellipse cx="260" cy="159" rx="116" ry="66" fill="url(#coreGlow)" />
      {projected.map((node, index) => {
        const next = projected[(index + 1) % projected.length] ?? node
        return <line key={`link-${node.worker.id}`} x1={node.x} y1={node.y} x2={next.x} y2={next.y} stroke="#8e89d8" strokeOpacity={0.11 + Math.max(node.depth, 0) * 0.2} strokeWidth="1" strokeDasharray="3 5" />
      })}
      <g className="core-mark"><circle cx="260" cy="158" r="32" fill="#151932" stroke="#7669ff" strokeOpacity=".55"/><circle cx="260" cy="158" r="25" fill="none" stroke="#9b8eff" strokeOpacity=".32" strokeDasharray="2 4"/><text x="260" y="156" textAnchor="middle" className="core-label">CC</text><text x="260" y="171" textAnchor="middle" className="core-sub">CLUSTER</text></g>
      {projected.map(({ worker, x, y, depth, radius }) => {
        const color = colorMap[worker.accent] ?? '#8273ff'
        const active = selected?.id === worker.id
        return <g className="worker-point" key={worker.id} role="button" aria-label={`Inspect ${worker.name}`} tabIndex={0} onClick={event => { event.stopPropagation(); setSelected(worker) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelected(worker) }} style={{ cursor: 'pointer', opacity: 0.55 + Math.max(depth, 0) * 0.45 }}>
          <circle cx={x} cy={y} r={radius + 8} fill={color} opacity=".11" filter="url(#glow)"/>
          <circle cx={x} cy={y} r={radius} fill="#14182c" stroke={color} strokeWidth={active ? 3 : 1.5}/>
          <circle cx={x} cy={y} r={radius * .42} fill={color}/>
          <text x={x} y={y + radius + 18} textAnchor="middle" className="worker-label">{worker.name}</text>
          {worker.status === 'busy' && <circle cx={x + 10} cy={y - 10} r="3.5" fill="#ffbd63"/>}
        </g>
      })}
      <text x="18" y="299" className="map-hint">DRAG TO ORBIT · SCROLL TO ZOOM</text>
    </svg>
    {selected && <div className="node-popover" key={selected.id}>
      <div className="node-popover-top"><div><span className={`status-dot ${selected.status}`} /> <b>{selected.name}</b><span className="node-region">{selected.region}</span></div><button aria-label="Close worker details" onClick={() => setSelected(null)}><X size={15}/></button></div>
      <div className="node-stats"><span><Cpu size={14}/>{selected.cpu} vCPU</span><span><MemoryStick size={14}/>{selected.memory} GB</span><span><HardDrive size={14}/>{selected.utilization}% load</span></div>
    </div>}
    {!compact && <div className="map-footer"><span><i className="legend-online"/> {workers.filter(worker => worker.status === 'online').length} available</span><span><i className="legend-busy"/> {workers.filter(worker => worker.status === 'busy').length} processing</span><span>{workers.length} nodes in mesh</span></div>}
  </div>
}
