import { useMemo } from 'react'
import { Activity, ChartColumn, CircleDot, Server, TrendingUp } from 'lucide-react'
import { getWorkerSeries } from './workerSeries'
import CpuUtilizationChart from './CpuUtilizationChart'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  BarController, BarElement, PieController, ArcElement, RadarController,
  RadialLinearScale, LineController, LineElement, Filler, Tooltip, Legend
} from 'chart.js'
import { Bar, Line, Pie, Radar } from 'react-chartjs-2'
import styles from './AnalyticsGrid.module.css'

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  BarController, BarElement, PieController, ArcElement, RadarController,
  RadialLinearScale, LineController, LineElement, Filler, Tooltip, Legend
)

function getChartColors(theme) {
  return {
    grid: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    text: theme === 'dark' ? '#64748b' : '#94a3b8',
    surface: theme === 'dark' ? '#101827' : '#ffffff',
  }
}

const WORKLOAD_CATEGORIES = {
  data_preprocessing: 'Data preprocessing',
  qr_generator: 'Link QR maker',
  csv_json_converter: 'CSV ↔ JSON',
  image_optimizer: 'Image optimizer',
  pdf_brief: 'PDF brief',
  file_integrity: 'File integrity check',
  ascii_art: 'Legacy text workload',
}

function parseTaskDate(value) {
  if (!value) return null
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function WeeklyActivityChart({ tasks, theme, activityDay }) {
  const { grid, text } = getChartColors(theme)
  const days = useMemo(() => {
    if (!activityDay) return []
    const today = new Date(activityDay)
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - 6 + index)
      return date
    })
  }, [activityDay])
  const counts = useMemo(() => {
    const buckets = days.map(() => 0)
    const keys = new Map(days.map((date, index) => [date.toDateString(), index]))
    tasks.forEach(task => {
      const submitted = parseTaskDate(task.submission_time)
      if (!submitted) return
      const index = keys.get(new Date(submitted.getFullYear(), submitted.getMonth(), submitted.getDate()).toDateString())
      if (index !== undefined) buckets[index] += 1
    })
    return buckets
  }, [days, tasks])
  const total = counts.reduce((sum, count) => sum + count, 0)
  const labels = days.map(date => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date))
  const data = {
    labels,
    datasets: [{
      label: 'Workloads started',
      data: counts,
      borderColor: '#7864f2',
      backgroundColor: 'rgba(120, 100, 242, 0.1)',
      fill: true,
      tension: 0.32,
      borderWidth: 2,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      pointBackgroundColor: '#7864f2',
      pointBorderColor: theme === 'dark' ? '#151e2c' : '#fff',
      pointBorderWidth: 2,
    }],
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 550 },
    interaction: { intersect: false, mode: 'index' },
    scales: {
      y: { beginAtZero: true, suggestedMax: Math.max(3, ...counts), ticks: { color: text, stepSize: 1, precision: 0 }, grid: { color: grid, borderDash: [3, 5] } },
      x: { grid: { display: false }, ticks: { color: text } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: context => ` ${context.parsed.y} ${context.parsed.y === 1 ? 'workload' : 'workloads'}` } },
    },
  }
  return <div className={`${styles.chartBody} ${styles.activityChartBody}`}><div className={styles.activitySummary}><strong>{total}</strong><span>workloads started</span><small><i /> LIVE</small></div>{days.length ? <Line data={data} options={options} /> : <div className={styles.chartEmpty}>Waiting for the first cluster heartbeat.</div>}</div>
}

// 1. Workload Category Bar Chart
function WorkloadBarChart({ tasks, theme }) {
  const { grid, text } = getChartColors(theme)
  const categoryColors = [
    ['rgba(56,189,248,0.7)', '#38bdf8'],
    ['rgba(129,140,248,0.7)', '#818cf8'],
    ['rgba(168,85,247,0.7)', '#a855f7'],
    ['rgba(16,185,129,0.7)', '#10b981'],
    ['rgba(245,158,11,0.7)', '#f59e0b'],
    ['rgba(236,72,153,0.7)', '#ec4899'],
    ['rgba(15,118,110,0.7)', '#0f766e'],
    ['rgba(99,102,241,0.7)', '#6366f1'],
  ]
  const counts = useMemo(() => {
    const c = {}
    tasks.forEach(task => {
      const category = WORKLOAD_CATEGORIES[task.task_type]
      if (category) c[category] = (c[category] || 0) + 1
    })
    return c
  }, [tasks])
  if (!tasks.length) return <div className={styles.chartEmpty}>Workload categories will appear after your first submission.</div>

  const data = {
    labels: Object.keys(counts),
    datasets: [{
      label: 'Workloads',
      data: Object.values(counts),
      backgroundColor: Object.keys(counts).map((_, index) => categoryColors[index % categoryColors.length][0]),
      borderColor: Object.keys(counts).map((_, index) => categoryColors[index % categoryColors.length][1]),
      borderWidth: 1.5,
      borderRadius: 8,
    }]
  }
  const opts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 600 },
    scales: {
      y: { grid: { color: grid }, ticks: { color: text, font: { size: 10 } }, beginAtZero: true },
      x: { grid: { display: false }, ticks: { color: text, font: { size: 10 } } }
    },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.parsed.y} tasks` } } }
  }
  return <Bar data={data} options={opts} />
}

function CapacityRadarChart({ theme, nodes, tasks }) {
  const { grid, text } = getChartColors(theme)
  const workers = getWorkerSeries(nodes, tasks)
  const nodeIds = workers.map(worker => worker.id)
  const maxCpuCores = Math.max(...nodeIds.map(id => Number(nodes[id]?.cpu_cores || 0)), 1)
  const maxRamGb = Math.max(...nodeIds.map(id => Number(nodes[id]?.total_ram_gb || 0)), 1)
  const data = {
    labels: ['CPU use', 'Memory use', 'vCPU capacity', 'RAM capacity', 'Availability'],
    datasets: workers.map(worker => {
      const { id } = worker
      const node = nodes[id]
      const online = node?.status === 'Online'
      return {
        label: worker.label,
        data: [
          online ? Number(node.cpu_usage || 0) : 0,
          online ? Number(node.ram_usage || 0) : 0,
          Number(node.cpu_cores || 0) / maxCpuCores * 100,
          Number(node.total_ram_gb || 0) / maxRamGb * 100,
          online ? 100 : 0,
        ],
        borderColor: worker.color,
        backgroundColor: worker.fill,
        borderWidth: 2,
        pointRadius: 2,
      }
    }),
  }
  const opts = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
    scales: { r: { grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: text, font: { size: 10 } }, ticks: { display: false }, min: 0, max: 100 } },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, color: text, font: { size: 10 } } } }
  }
  return <Radar data={data} options={opts} />
}

// A pie chart shows the share of workloads at each lifecycle stage.
function TaskLifecycleChart({ tasks, theme }) {
  const { surface, text } = getChartColors(theme)
  const counts = useMemo(() => {
    return {
      COMPLETED: tasks.filter(t => t.status === 'COMPLETED').length,
      RUNNING: tasks.filter(t => t.status === 'RUNNING').length,
      QUEUED: tasks.filter(t => t.status === 'QUEUED').length,
      SUBMITTED: tasks.filter(t => t.status === 'SUBMITTED').length,
      FAILED: tasks.filter(t => t.status === 'FAILED').length,
    }
  }, [tasks])
  if (!tasks.length) return <div className={styles.chartEmpty}>Task status distribution appears when workloads are submitted.</div>

  const statusColors = {
    COMPLETED: '#2563eb',
    RUNNING: '#7c3aed',
    QUEUED: '#c58a22',
    SUBMITTED: '#64748b',
    FAILED: '#c2410c',
  }
  const stages = [
    ['COMPLETED', 'Completed'],
    ['RUNNING', 'Running'],
    ['QUEUED', 'Queued'],
    ['SUBMITTED', 'Submitted'],
    ['FAILED', 'Failed'],
  ].filter(([status]) => counts[status] > 0)
  const data = {
    labels: stages.map(([, label]) => label),
    datasets: [{
      data: stages.map(([status]) => counts[status]),
      backgroundColor: stages.map(([status]) => statusColors[status]),
      borderColor: surface,
      borderWidth: 3,
      hoverOffset: 4,
    }],
  }
  const opts = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 450 },
    plugins: {
      legend: { position: 'bottom', labels: { color: text, boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 10 } } },
      tooltip: { callbacks: { label: context => ` ${context.label}: ${context.parsed} workloads` } },
    },
  }
  return <Pie data={data} options={opts} role="img" aria-label="Workload share by lifecycle stage" />
}

const CHART_CARDS = [
  { id: 'activity', title: 'Workload activity', sub: 'Jobs started · last 7 days', icon: TrendingUp, tag: '7 days' },
  { id: 'cpu', title: 'CPU utilization', sub: 'Live worker usage · %', icon: Activity, tag: 'Live' },
  { id: 'workload', title: 'Workload mix', sub: 'Tasks by processing type', icon: ChartColumn, tag: 'Distribution' },
  { id: 'radar', title: 'Worker comparison', sub: 'Usage, provisioned capacity & availability', icon: Server, tag: 'Fleet' },
  { id: 'status', title: 'Task lifecycle', sub: 'Workload count at each stage', icon: CircleDot, tag: 'Counts' },
]

export default function AnalyticsGrid({ tasks, cpuHistory, nodes, theme, activityDay }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.titleGroup}>
          <span className={styles.sectionIcon}><Activity size={17} /></span>
          <div>
            <h2 className={styles.sectionTitle}>Cluster analytics</h2>
            <p className={styles.sectionSub}>Real measurements, grouped by the attribute that matters</p>
          </div>
        </div>
      </div>
      <div className={styles.grid}>
        {CHART_CARDS.map(c => (
          <div key={c.id} className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitleGroup}>
                <span className={styles.chartIcon}><c.icon size={16} strokeWidth={1.9} /></span>
                <div>
                  <div className={styles.chartTitle}>{c.title}</div>
                  <div className={styles.chartSub}>{c.sub}</div>
                </div>
              </div>
              <span className={styles.chartTag}>{c.id === 'cpu' ? 'Last minute' : c.tag}</span>
            </div>
            <div className={styles.chartBody}>
              {c.id === 'activity' && <WeeklyActivityChart tasks={tasks} theme={theme} activityDay={activityDay} />}
              {c.id === 'cpu' && <CpuUtilizationChart cpuHistory={cpuHistory} nodes={nodes} tasks={tasks} theme={theme} />}
              {c.id === 'workload' && <WorkloadBarChart tasks={tasks} theme={theme} />}
              {c.id === 'radar' && <CapacityRadarChart theme={theme} nodes={nodes} tasks={tasks} />}
              {c.id === 'status' && <TaskLifecycleChart tasks={tasks} theme={theme} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
