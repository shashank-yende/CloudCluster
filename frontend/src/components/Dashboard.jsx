import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { ChartNoAxesCombined, Clock3, Command, History, LayoutDashboard, Plus, RefreshCw, Server, Workflow } from 'lucide-react'
import Navbar from './Navbar'
import ClusterOrbit from './ClusterOrbit'
import KpiBar from './KpiBar'
import NodeFleet from './NodeFleet'
import TaskDispatcher from './TaskDispatcher'
import WorkflowStudio from './WorkflowStudio'
import TaskLedger from './TaskLedger'
import OverviewCharts from './OverviewCharts'
import { apiFetch } from '../api'
import { formatApiError } from '../apiErrors'
import styles from './Dashboard.module.css'

const TELEMETRY_INTERVAL_MS = 1000
const HISTORY_LENGTH = 60
const AnalyticsGrid = lazy(() => import('./AnalyticsGrid'))

const SECTIONS = [
  { id: 'overview', label: 'Overview', title: 'Cluster command center', description: 'A live view of your compute mesh, workload flow, and cluster health.', icon: LayoutDashboard },
  { id: 'workloads', label: 'Workloads', title: 'Workload operations', description: 'Submit workloads and follow live execution and output.', icon: Workflow },
  { id: 'history', label: 'History', title: 'Workload history', description: 'Search, filter, and inspect every recorded workload.', icon: History },
  { id: 'fleet', label: 'Fleet', title: 'Worker fleet', description: 'Monitor worker health and current resource utilization.', icon: Server },
  { id: 'analytics', label: 'Analytics', title: 'Cluster analytics', description: 'Explore workload mix, execution status, and worker performance.', icon: ChartNoAxesCombined },
]

const WORKLOAD_LABELS = {
  data_preprocessing: 'Data preprocessing',
  qr_generator: 'Link QR maker',
  csv_json_converter: 'CSV ↔ JSON',
  image_optimizer: 'Image optimizer',
  pdf_brief: 'PDF brief',
  file_integrity: 'File integrity check',
  ascii_art: 'Legacy Text Workload',
}

export default function Dashboard({ user, onLogout, theme, toggleTheme }) {
  const [activeSection, setActiveSection] = useState('overview')
  const [nodes, setNodes] = useState({})
  const [tasks, setTasks] = useState([])
  const [activeTask, setActiveTask] = useState(null)
  const [cpuHistory, setCpuHistory] = useState({ labels: [] })
  const [lastUpdated, setLastUpdated] = useState(null)
  const [telemetryState, setTelemetryState] = useState('connecting')
  const [refreshing, setRefreshing] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const deletedTaskIds = useRef(new Set())

  const fetchNodes = useCallback(async () => {
    try {
      const response = await fetch('/nodes/status', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Node status returned ${response.status}`)
      const data = await response.json()
      setNodes(data)
      setTelemetryState('online')
      setLastUpdated(new Date())
      const label = new Intl.DateTimeFormat(undefined, { minute: '2-digit', second: '2-digit' }).format(new Date())
      setCpuHistory(previous => {
        const history = { ...previous, labels: [...previous.labels, label].slice(-HISTORY_LENGTH) }
        Object.entries(data).forEach(([nodeId, metrics]) => {
          history[nodeId] = [...(previous[nodeId] || []), Number(metrics?.cpu_usage ?? 0)].slice(-HISTORY_LENGTH)
        })
        return history
      })
    } catch (error) {
      setTelemetryState('unavailable')
      console.error('Unable to refresh cluster telemetry:', error)
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    try {
      const response = await apiFetch('/tasks')
      if (response.status === 401) {
        onLogout()
        return
      }
      if (!response.ok) throw new Error(`Task list returned ${response.status}`)
      const data = (await response.json()).filter(task => !deletedTaskIds.current.has(task.task_id))
      setTasks(data)
      setActiveTask(current => current
        ? deletedTaskIds.current.has(current.task_id) ? null : data.find(task => task.task_id === current.task_id) || current
        : null)
    } catch (error) {
      console.error('Unable to refresh workload list:', error)
    }
  }, [onLogout])

  useEffect(() => {
    const initialRefresh = setTimeout(() => {
      const refreshTelemetry = async () => {
        const nextRefreshAt = Date.now() + TELEMETRY_INTERVAL_MS
        await fetchNodes()
        if (!stopped) {
          telemetryTimer = setTimeout(refreshTelemetry, Math.max(0, nextRefreshAt - Date.now()))
        }
      }
      refreshTelemetry()
      fetchTasks()
    }, 0)
    let stopped = false
    let telemetryTimer
    const taskInterval = setInterval(fetchTasks, 8000)
    return () => {
      stopped = true
      clearTimeout(initialRefresh)
      clearTimeout(telemetryTimer)
      clearInterval(taskInterval)
    }
  }, [fetchNodes, fetchTasks])

  const handleTaskSubmitted = submittedTasks => {
    const taskList = Array.isArray(submittedTasks) ? submittedTasks : [submittedTasks]
    setActiveTask(taskList.at(-1) || null)
    fetchTasks()
  }

  const navigateSection = section => {
    setActiveSection(section)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const handleShortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(open => !open)
      } else if (event.key === 'Escape') {
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const refreshWorkspace = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([fetchNodes(), fetchTasks()])
    } finally {
      setRefreshing(false)
    }
  }

  const runCommand = command => {
    setPaletteOpen(false)
    setCommandQuery('')
    command.run()
  }

  const handleViewTask = task => {
    setActiveTask(task)
    navigateSection('workloads')
  }

  const handleDeleteTask = async task => {
    const response = await apiFetch(`/tasks/${encodeURIComponent(task.task_id)}`, { method: 'DELETE' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(formatApiError(result, `Unable to delete workload (${response.status}).`))

    deletedTaskIds.current.add(task.task_id)
    setTasks(current => current.filter(item => item.task_id !== task.task_id))
    setActiveTask(current => current?.task_id === task.task_id ? null : current)
    return result
  }

  const onlineNodes = Object.values(nodes).filter(node => node.status === 'Online').length
  const totalNodes = Object.keys(nodes).length
  const clusterState = telemetryState !== 'online' || totalNodes === 0
    ? telemetryState === 'unavailable' ? 'unavailable' : 'connecting'
    : onlineNodes === totalNodes ? 'healthy' : onlineNodes > 0 ? 'degraded' : 'offline'
  const activeSectionDetails = SECTIONS.find(section => section.id === activeSection) || SECTIONS[0]
  const recentTasks = [...tasks]
    .sort((left, right) => (Date.parse(right.submission_time || '') || 0) - (Date.parse(left.submission_time || '') || 0))
    .slice(0, 5)
  const workloadMix = Object.entries(tasks.reduce((counts, task) => {
    const type = WORKLOAD_LABELS[task.task_type] || task.task_type?.replaceAll('_', ' ') || 'Other'
    counts[type] = (counts[type] || 0) + 1
    return counts
  }, {})).sort((left, right) => right[1] - left[1])
  const normalizedCommandQuery = commandQuery.trim().toLowerCase()
  const commandItems = [
    ...SECTIONS.map(section => ({
      id: `section-${section.id}`,
      label: `Go to ${section.label}`,
      detail: section.description,
      run: () => navigateSection(section.id),
    })),
    {
      id: 'new-workload',
      label: 'Create a new workload',
      detail: 'Open the workload dispatcher',
      run: () => navigateSection('workloads'),
    },
    {
      id: 'toggle-theme',
      label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
      detail: 'Change workspace appearance',
      run: toggleTheme,
    },
    ...tasks.slice(0, 8).map(task => ({
      id: task.task_id,
      label: task.task_id,
      detail: `${WORKLOAD_LABELS[task.task_type] || task.task_type?.replaceAll('_', ' ') || 'Workload'} · ${task.status}`,
      run: () => handleViewTask(task),
    })),
  ].filter(item => !normalizedCommandQuery || `${item.label} ${item.detail}`.toLowerCase().includes(normalizedCommandQuery))
  return (
    <div className={styles.shell}>
      <Navbar user={user} onLogout={onLogout} theme={theme} toggleTheme={toggleTheme} onlineNodes={onlineNodes} totalNodes={totalNodes} clusterState={clusterState} />
      <div className={styles.sectionNav}>
        <div className={styles.sectionNavInner}>
          <span className={styles.sidebarLabel}>WORKSPACE</span>
          <nav className={styles.sideNav} aria-label="Main navigation">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`${styles.navItem} ${activeSection === id ? styles.navItemActive : ''}`}
                onClick={() => navigateSection(id)}
                aria-current={activeSection === id ? 'page' : undefined}
                title={label}
              >
                <Icon className={styles.navIcon} size={17} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className={styles.sidebarFoot}>
            <span className={`${styles.sidebarStatusDot} ${styles[`health${clusterState}`]}`} />
            <span>
              <strong>{telemetryState === 'connecting' ? 'Connecting…' : telemetryState === 'unavailable' ? 'Telemetry unavailable' : `${onlineNodes} / ${totalNodes} online`}</strong>
              <small>Cluster health</small>
            </span>
          </div>
        </div>
      </div>

      <div className={styles.appFrame}>
        <main className={styles.main} id="top">
          <section className={`${styles.pageHeading} ${activeSection === 'overview' ? styles.pageHeadingOverview : ''}`}>
            <div className={styles.headingCopy}>
              <div className={styles.eyebrow}><span className={styles.eyebrowDot} /> CLOUDCLUSTER / {activeSection === 'overview' ? 'COMMAND CENTER' : activeSection.toUpperCase()}</div>
              <h1>{activeSection === 'overview' ? 'Your cluster, in motion.' : activeSectionDetails.title}</h1>
              <p>{activeSection === 'overview' ? 'Dispatch work, watch every worker, and spot bottlenecks as they emerge.' : activeSectionDetails.description}</p>
            </div>
            {activeSection === 'overview' && (
              <div className={styles.overviewHeroAside}>
                <div className={styles.pageActions}>
                  <button className={styles.primaryAction} onClick={() => navigateSection('workloads')}>
                    <Plus size={16} /> New workload
                  </button>
                  <div className={styles.introMeta}>
                    <span><strong>CloudCluster</strong><small>Distributed processing</small></span>
                    <span className={styles.metaDivider} />
                    <span><strong>{telemetryState === 'connecting' ? '—' : `${onlineNodes} / ${totalNodes}`}</strong><small>workers online</small></span>
                  </div>
                </div>
                <ClusterOrbit nodes={nodes} tasks={tasks} theme={theme} />
              </div>
            )}
          </section>

          {activeSection === 'overview' && (
            <>
              <section className={styles.kpiSection} aria-label="Workload performance">
                <div className={styles.sectionHeading}>
                  <div><h2>Cluster performance</h2><p>Throughput, reliability, and worker capacity, refreshed in real time.</p></div>
                  {lastUpdated && <span className={styles.updated}><Clock3 size={14} /> Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                  <button className={styles.refreshButton} onClick={refreshWorkspace} disabled={refreshing} aria-label="Refresh cluster and workload data">
                    <RefreshCw size={14} className={refreshing ? styles.refreshing : ''} />
                    Refresh
                  </button>
                </div>
                <KpiBar tasks={tasks} nodes={nodes} />
              </section>

              <OverviewCharts cpuHistory={cpuHistory} nodes={nodes} tasks={tasks} theme={theme} onOpenAnalytics={() => navigateSection('analytics')} />

              <div className={styles.overviewGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div><h2>Workload mix</h2><p>Distribution by processing type</p></div>
                    <button className={styles.textLink} onClick={() => navigateSection('analytics')}>Analytics <span>→</span></button>
                  </div>
                  {workloadMix.length ? (
                    <div className={styles.workloadMix}>
                      <div className={styles.mixSummary}>
                        <span><strong>{tasks.length}</strong> total workloads</span>
                        <span>{workloadMix.length} workload {workloadMix.length === 1 ? 'type' : 'types'}</span>
                      </div>
                      <div className={styles.mixDistribution} role="img" aria-label="Workload type distribution">
                        {workloadMix.map(([type, count], index) => (
                          <i key={type} style={{ width: `${count / tasks.length * 100}%`, background: ['#4f46e5', '#0891b2', '#059669', '#d97706', '#db2777'][index % 5] }} />
                        ))}
                      </div>
                      {workloadMix.map(([type, count], index) => (
                        <div className={styles.mixRow} key={type}>
                          <span className={styles.mixSwatch} style={{ background: ['#4f46e5', '#0891b2', '#059669', '#d97706', '#db2777'][index % 5] }} />
                          <span className={styles.mixLabel}>{type}</span>
                          <span className={styles.mixShare}>{Math.round(count / tasks.length * 100)}%</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                      <button className={styles.mixHistoryLink} onClick={() => navigateSection('history')}>Review all {tasks.length} workloads <span>→</span></button>
                    </div>
                  ) : (
                    <div className={styles.emptyRecent}>
                      <strong>No workload activity yet</strong>
                      <span>Task types will appear as work is submitted.</span>
                      <button className={styles.textLink} onClick={() => navigateSection('workloads')}>Create a workload →</button>
                    </div>
                  )}
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div><h2>Recent workloads</h2><p>Latest activity from your task ledger</p></div>
                    <button className={styles.textLink} onClick={() => navigateSection('history')}>View history <span>→</span></button>
                  </div>
                  {recentTasks.length ? (
                    <div className={styles.recentList}>
                      {recentTasks.map(task => (
                        <button className={styles.recentTask} key={task.task_id} onClick={() => handleViewTask(task)}>
                          <span className={styles.recentTaskInfo}><strong>{task.task_id}</strong><small>{WORKLOAD_LABELS[task.task_type] || task.task_type?.replaceAll('_', ' ') || 'Other'}</small></span>
                          <span className={`${styles.recentStatus} ${styles[`status${task.status}`] || ''}`}><i />{task.status}</span>
                          <span className={styles.recentTaskTime}>{Number(task.execution_time || 0).toFixed(2)}s</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyRecent}>
                      <strong>No workloads yet</strong>
                      <span>Start a task to see cluster activity here.</span>
                      <button className={styles.textLink} onClick={() => navigateSection('workloads')}>Submit a workload →</button>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {activeSection === 'workloads' && (
            <div className={styles.workspaceGrid}>
              <TaskDispatcher onTaskSubmitted={handleTaskSubmitted} />
              <WorkflowStudio activeTask={activeTask} onClear={() => setActiveTask(null)} />
            </div>
          )}

          {activeSection === 'history' && <TaskLedger id="workload-history" tasks={tasks} onViewTask={handleViewTask} onDeleteTask={handleDeleteTask} />}

          {activeSection === 'fleet' && (
            <>
              <div className={styles.fleetSummary}>
                <div><span>Workers online</span><strong>{onlineNodes} <small>/ {totalNodes}</small></strong></div>
                <div><span>Active workloads</span><strong>{tasks.filter(task => ['RUNNING', 'QUEUED', 'SUBMITTED'].includes(task.status)).length}</strong></div>
                <div><span>Provisioned vCPU</span><strong>{Object.values(nodes).filter(node => node.status === 'Online').reduce((total, node) => total + Number(node.cpu_cores || 0), 0)}</strong></div>
                <div><span>Provisioned memory</span><strong>{Object.values(nodes).filter(node => node.status === 'Online').reduce((total, node) => total + Number(node.total_ram_gb || 0), 0)} <small>GB</small></strong></div>
              </div>
              <NodeFleet nodes={nodes} tasks={tasks} cpuHistory={cpuHistory} />
            </>
          )}

          {activeSection === 'analytics' && (
            <Suspense fallback={<div className={styles.analyticsLoading}>Loading cluster analytics…</div>}>
              <AnalyticsGrid tasks={tasks} cpuHistory={cpuHistory} nodes={nodes} theme={theme} activityDay={lastUpdated?.toDateString()} />
            </Suspense>
          )}

          <footer className={styles.footer}><span>CloudCluster</span><span>Workload control plane</span><span>Worker telemetry refreshes every second</span></footer>
        </main>
      </div>
      {paletteOpen && (
        <div className={styles.commandOverlay} onMouseDown={event => {
          if (event.target === event.currentTarget) setPaletteOpen(false)
        }}>
          <section className={styles.commandDialog} role="dialog" aria-modal="true" aria-labelledby="command-title">
            <h2 id="command-title" className={styles.visuallyHidden}>Workspace commands</h2>
            <div className={styles.commandSearch}>
              <Command size={18} aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={commandQuery}
                onChange={event => setCommandQuery(event.target.value)}
                placeholder="Search pages, actions, and workloads..."
                aria-label="Search workspace commands"
              />
              <kbd>ESC</kbd>
            </div>
            <div className={styles.commandList} role="listbox" aria-label="Commands">
              {commandItems.length ? commandItems.map(item => (
                <button key={item.id} className={styles.commandItem} onClick={() => runCommand(item)} role="option" aria-selected="false">
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <span aria-hidden="true">↵</span>
                </button>
              )) : <p className={styles.commandEmpty}>No matching pages or workloads.</p>}
            </div>
            <div className={styles.commandHint}><span><kbd>Ctrl</kbd> <kbd>K</kbd> to open</span><span>Navigate your workspace</span></div>
          </section>
        </div>
      )}
    </div>
  )
}
