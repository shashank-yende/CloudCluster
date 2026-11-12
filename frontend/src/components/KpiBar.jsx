import { useMemo } from 'react'
import styles from './KpiBar.module.css'

export default function KpiBar({ tasks, nodes }) {
  const stats = useMemo(() => {
    const completed = tasks.filter(task => task.status === 'COMPLETED')
    const activeNodes = Object.values(nodes).filter(node => node.status === 'Online')
    const measuredCpu = activeNodes.filter(node => Number.isFinite(Number(node.cpu_usage)))
    const terminal = tasks.filter(task => task.status === 'COMPLETED' || task.status === 'FAILED')
    return {
      total: tasks.length,
      completed: completed.length,
      avgExec: completed.length ? (completed.reduce((sum, task) => sum + Number(task.execution_time || 0), 0) / completed.length).toFixed(2) : '—',
      avgCpu: measuredCpu.length ? `${(measuredCpu.reduce((sum, node) => sum + Number(node.cpu_usage), 0) / measuredCpu.length).toFixed(1)}%` : '—',
      successRate: terminal.length ? `${Math.round(completed.length / terminal.length * 100)}%` : '—',
    }
  }, [tasks, nodes])

  const items = [
    { label: 'Total workloads', value: stats.total, note: 'All recorded tasks' },
    { label: 'Completed', value: stats.completed, note: 'Successfully processed' },
    { label: 'Success rate', value: stats.successRate, note: 'Completed · failed workloads' },
    { label: 'Mean runtime', value: `${stats.avgExec}${stats.avgExec === '—' ? '' : 's'}`, note: 'Completed workloads' },
    { label: 'Mean CPU', value: stats.avgCpu, note: 'Online workers · current' },
  ]

  return (
    <div className={styles.grid}>
      {items.map(({ label, value, note }) => (
        <article key={label} className={styles.card}>
          <div className={styles.info}>
            <span className={styles.label}>{label}</span>
            <span className={styles.value}>{value}</span>
            <span className={styles.sub}>{note}</span>
          </div>
        </article>
      ))}
    </div>
  )
}
