import {
  Chart as ChartJS, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { getWorkerSeries } from './workerSeries'
import styles from './CpuUtilizationChart.module.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

function getAxisMax(values) {
  const peak = Math.max(...values, 0)
  return [10, 20, 25, 50, 75, 100].find(scale => peak <= scale * 0.9) || 100
}

export default function CpuUtilizationChart({ cpuHistory, nodes, tasks, theme }) {
  const workers = getWorkerSeries(nodes, tasks)
  const values = workers.flatMap(worker => cpuHistory[worker.id] || []).map(Number).filter(Number.isFinite)
  const axisMax = getAxisMax(values)
  const grid = theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.08)'
  const text = theme === 'dark' ? '#94a3b8' : '#64748b'
  const data = {
    labels: cpuHistory.labels || [],
    datasets: workers.map(worker => ({
      label: worker.label,
      data: cpuHistory[worker.id] || [],
      borderColor: worker.color,
      fill: false,
      tension: 0.32,
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 12,
    })),
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        min: 0,
        max: axisMax,
        grid: { color: grid },
        ticks: { color: text, font: { size: 10 }, stepSize: axisMax / 4, callback: value => `${value}%` },
        border: { display: false },
      },
      x: { display: false, grid: { display: false }, border: { display: false } },
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: { boxWidth: 8, boxHeight: 8, color: text, font: { size: 10 }, usePointStyle: true, pointStyle: 'circle', padding: 14 },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: { label: context => ` ${context.dataset.label}: ${Number(context.parsed.y).toFixed(1)}%` },
      },
    },
  }

  if (!cpuHistory.labels?.length || !workers.length) {
    return <div className={styles.empty}>Waiting for the first worker telemetry sample…</div>
  }

  return <Line className={styles.chart} data={data} options={options} role="img" aria-label="Live worker CPU utilization trend for the last minute" />
}
