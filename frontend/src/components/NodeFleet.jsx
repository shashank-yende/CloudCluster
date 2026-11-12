import { useEffect, useRef } from 'react'
import { Server } from 'lucide-react'
import { getWorkerColor, getWorkerName, getWorkerSeries } from './workerSeries'
import styles from './NodeFleet.module.css'

function MiniSparkline({ values, color }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || values.length < 2) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const max = Math.max(...values, 60)
    const min = Math.min(...values, 0)
    const range = max - min || 1

    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * w,
      y: h - ((v - min) / range) * (h - 4) - 2
    }))

    // Draw gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, color + '44')
    grad.addColorStop(1, color + '00')
    ctx.beginPath()
    ctx.moveTo(pts[0].x, h)
    pts.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.lineTo(pts[pts.length-1].x, h)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Draw line
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [values, color])

  return <canvas ref={canvasRef} width={80} height={28} className={styles.sparkline} />
}

function NodeCard({ nodeId, nodeData, tasks, cpuHistory }) {
  const info = { name: getWorkerName(nodeId), color: getWorkerColor(nodeId).line }
  const cpu = nodeData?.cpu_usage ?? 0
  const ram = nodeData?.ram_usage ?? 0
  const isOnline = nodeData?.status === 'Online'
  const isLoading = !nodeData
  const isBackup = nodeData?.role === 'Backup'
  const history = cpuHistory?.[nodeId] || []
  const totalRamGb = Number(nodeData?.total_ram_gb || 0)
  const nodeTasks = tasks.filter(task => task.assigned_node === nodeId)
  const completed = nodeTasks.filter(task => task.status === 'COMPLETED').length
  const active = nodeTasks.filter(task => ['RUNNING', 'QUEUED', 'SUBMITTED'].includes(task.status)).length
  const failed = nodeTasks.filter(task => task.status === 'FAILED').length
  const completedTasks = nodeTasks.filter(task => task.status === 'COMPLETED')
  const averageRuntime = completedTasks.length
    ? completedTasks.reduce((total, task) => total + Number(task.execution_time || 0), 0) / completedTasks.length
    : null
  const spec = nodeData ? `${Number(nodeData.cpu_cores || 0)} vCPU · ${totalRamGb} GB RAM` : 'Capacity unavailable'

  const cpuPct = Math.min(100, Math.max(0, cpu))
  const ramPct = Math.min(100, Math.max(0, ram))

  const cpuColor = cpuPct > 80 ? '#f43f5e' : cpuPct > 60 ? '#f59e0b' : info.color

  return (
    <div className={`${styles.nodeCard} ${!isOnline && !isLoading ? styles.nodeOffline : ''}`} style={{ '--node-color': info.color }}>
      {/* Header */}
      <div className={styles.nodeHead}>
        <div className={styles.nodeIcon} style={{ background: info.color + '1a', borderColor: info.color + '40' }}>
          <span style={{ color: info.color }}><Server size={17} /></span>
        </div>
        <div className={styles.nodeMeta}>
          <span className={styles.nodeName}>{info.name}{isBackup && <> <small className={styles.backupBadge}>BACKUP</small></>}</span>
          <span className={styles.nodeSpec}>{spec}</span>
        </div>
        <div className={styles.nodeRight}>
          <span className={`${styles.onlinePill} ${!isOnline ? styles.offlinePill : ''}`}>
            <span className={styles.onlineDot} style={{ background: isOnline ? '#059669' : '#dc2626' }} />
            {isLoading ? 'CONNECTING' : isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* CPU Bar */}
      <div className={styles.metricGroup}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>CPU utilization</span>
          <span className={styles.metricVal} style={{ color: isOnline ? cpuColor : 'var(--text-muted)' }}>{isOnline ? `${cpuPct.toFixed(1)}%` : '—'}</span>
        </div>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ width: isOnline ? `${cpuPct}%` : '0%', background: `linear-gradient(90deg, ${cpuColor}99, ${cpuColor})` }} />
        </div>
      </div>

      {/* RAM Bar */}
      <div className={styles.metricGroup}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>Memory utilization</span>
          <span className={styles.metricVal} style={{ color: isOnline ? '#7053c9' : 'var(--text-muted)' }}>{isOnline ? `${ramPct.toFixed(1)}%` : '—'}</span>
        </div>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ width: isOnline ? `${ramPct}%` : '0%', background: 'linear-gradient(90deg, rgba(112,83,201,0.35), #7053c9)' }} />
        </div>
      </div>

      <div className={styles.nodeDetails}>
        <div className={styles.detailStat}>
          <span>CPU cores</span><strong>{nodeData ? Number(nodeData.cpu_cores || 0) : '—'} <small>vCPU</small></strong>
        </div>
        <div className={styles.detailStat}>
          <span>Memory capacity</span><strong>{nodeData ? `${totalRamGb} GB` : '—'}</strong>
        </div>
        <div className={styles.detailStat}>
          <span>Assigned workloads</span><strong>{nodeTasks.length}</strong>
        </div>
        <div className={styles.detailStat}>
          <span>Mean execution</span><strong>{averageRuntime === null ? '—' : `${averageRuntime.toFixed(2)}s`}</strong>
        </div>
      </div>

      <div className={styles.taskCounts} aria-label={`${nodeId} workload outcomes`}>
        <span><i className={styles.completedDot} />{completed} completed</span>
        <span><i className={styles.activeDot} />{active} active</span>
        <span><i className={styles.failedDot} />{failed} failed</span>
      </div>

      {/* Mini Sparkline */}
      <div className={styles.sparklineRow}>
        <span className={styles.sparkLabel}>CPU Trend</span>
        <MiniSparkline values={isOnline ? history : []} color={info.color} />
      </div>
    </div>
  )
}

export default function NodeFleet({ nodes, tasks, cpuHistory }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.titleGroup}>
          <span className={styles.headerIcon}><Server size={18} /></span>
          <div>
            <span className={styles.sectionEyebrow}>ALL WORKERS</span>
            <h2 className={styles.sectionTitle}>Resources &amp; current load</h2>
            <p className={styles.sectionSub}>Capacity, utilization, and active work for every worker.</p>
          </div>
        </div>
        <div className={styles.liveBadge}>
          <span className={styles.liveDot} />
          TELEMETRY · 1 SEC
        </div>
      </div>
      <div className={styles.grid}>
        {getWorkerSeries(nodes, tasks, { includeOffline: true }).map(({ id }) => (
          <NodeCard key={id} nodeId={id} nodeData={nodes[id]} tasks={tasks} cpuHistory={cpuHistory} />
        ))}
      </div>
    </section>
  )
}
