import { Activity, ArrowUpRight, Server } from 'lucide-react'
import styles from './OverviewCharts.module.css'
import { getWorkerSeries } from './workerSeries'
import CpuUtilizationChart from './CpuUtilizationChart'

const RADAR_AXES = ['CPU use', 'Memory use', 'vCPU capacity', 'RAM capacity', 'Availability']

function WorkerRadarChart({ nodes, tasks }) {
  const series = getWorkerSeries(nodes, tasks)
  const nodeIds = series.map(worker => worker.id)
  const hasOnlineWorker = nodeIds.some(id => nodes[id]?.status === 'Online')
  const maxCpuCores = Math.max(...nodeIds.map(id => Number(nodes[id]?.cpu_cores || 0)), 1)
  const maxRamGb = Math.max(...nodeIds.map(id => Number(nodes[id]?.total_ram_gb || 0)), 1)
  const center = { x: 310, y: 109 }
  const radius = 74
  const radarPoint = (axisIndex, scale) => {
    const angle = -Math.PI / 2 + axisIndex * Math.PI * 2 / RADAR_AXES.length
    return `${center.x + Math.cos(angle) * radius * scale},${center.y + Math.sin(angle) * radius * scale}`
  }
  const valuePoints = nodeIds.map(id => {
    const node = nodes[id]
    const online = node?.status === 'Online'
    return [
      online ? Number(node.cpu_usage || 0) : 0,
      online ? Number(node.ram_usage || 0) : 0,
      Number(node.cpu_cores || 0) / maxCpuCores * 100,
      Number(node.total_ram_gb || 0) / maxRamGb * 100,
      online ? 100 : 0,
    ]
  })

  return (
    <div className={styles.chartBody}>
      {hasOnlineWorker ? (
        <>
          <svg className={styles.chart} viewBox="0 0 600 220" preserveAspectRatio="none" role="img" aria-label="Spider-web comparison of worker CPU, memory, capacity, and availability">
            {[0.25, 0.5, 0.75, 1].map(scale => (
              <polygon key={scale} points={RADAR_AXES.map((_, index) => radarPoint(index, scale)).join(' ')} className={styles.radarGrid} />
            ))}
            {RADAR_AXES.map((axis, index) => {
              const point = radarPoint(index, 1).split(',')
              return (
                <g key={axis}>
                  <line x1={center.x} y1={center.y} x2={point[0]} y2={point[1]} className={styles.radarAxis} />
                  <text x={point[0]} y={Number(point[1]) + (index === 0 ? -3 : index === 2 || index === 3 ? 9 : 3)} textAnchor={Number(point[0]) < center.x - 12 ? 'end' : Number(point[0]) > center.x + 12 ? 'start' : 'middle'} className={styles.radarLabel}>{axis}</text>
                </g>
              )
            })}
            {valuePoints.map((values, index) => (
              <polygon
                key={nodeIds[index]}
                points={values.map((value, axisIndex) => radarPoint(axisIndex, Math.max(0.025, value / 100))).join(' ')}
                fill={series[index].fill}
                stroke={series[index].color}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          <div className={styles.legend}>
            {series.map(worker => <span key={worker.id}><i style={{ background: worker.color }} />{worker.label}</span>)}
          </div>
        </>
      ) : <div className={styles.empty}>Worker metrics will appear when the fleet connects.</div>}
    </div>
  )
}

export default function OverviewCharts({ cpuHistory, nodes, tasks, theme, onOpenAnalytics }) {
  return (
    <section className={styles.section} aria-label="Live utilization">
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}><Activity size={15} /> LIVE UTILIZATION</span>
          <h2>See the work in motion</h2>
          <p>Live resource trends and current worker-by-worker comparison</p>
        </div>
        <button className={styles.analyticsLink} onClick={onOpenAnalytics}>Explore analytics <ArrowUpRight size={15} /></button>
      </div>
      <div className={styles.grid}>
        <article className={styles.chartCard}>
          <div className={styles.chartHeading}><Activity size={16} /><div><h3>CPU utilization</h3><p>Live worker usage · %</p></div><span>Last minute</span></div>
          <div className={styles.chartBody}>
            <CpuUtilizationChart cpuHistory={cpuHistory} nodes={nodes} tasks={tasks} theme={theme} />
          </div>
        </article>
        <article className={styles.chartCard}>
          <div className={styles.chartHeading}><Server size={16} /><div><h3>Worker comparison</h3><p>Usage, capacity and availability</p></div><span>Fleet</span></div>
          <WorkerRadarChart nodes={nodes} tasks={tasks} />
        </article>
      </div>
    </section>
  )
}
