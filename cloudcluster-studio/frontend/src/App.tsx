import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, CircleHelp, Clock3, Cloud, Command, Cpu, FileClock, Filter, Gauge, History, LayoutDashboard, LogOut, Moon, MoreHorizontal, Plus, QrCode, Search, Server, Settings2, ShieldCheck, Sparkles, Sun, Workflow, X, Zap } from 'lucide-react'
import { useAuth } from './useAuth'
import { api } from './lib/api'
import type { Dashboard, TaskSpec, Worker, Workload } from './types'
import AuthScreen from './components/AuthScreen'
import ClusterMap from './components/ClusterMap'
import TaskComposer from './components/TaskComposer'
import './App.css'

type View = 'overview' | 'workloads' | 'history' | 'fleet' | 'insights'
const viewTitles: Record<View, string> = { overview: 'Overview', workloads: 'Workloads', history: 'History', fleet: 'Fleet', insights: 'Insights' }
const taskIcons: Record<string, typeof QrCode> = { QrCode, ListFilter: Filter, ArrowLeftRight: Workflow, Image: Sparkles, FileText: FileClock, FolderTree: Cloud }
const menu: { id: View; label: string; icon: typeof LayoutDashboard; section?: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, section: 'WORKSPACE' },
  { id: 'workloads', label: 'Workloads', icon: Workflow },
  { id: 'history', label: 'History', icon: History },
  { id: 'fleet', label: 'Fleet', icon: Server, section: 'INFRASTRUCTURE' },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
]

export default function App() {
  const { user, ready, signOut } = useAuth()
  const [view, setView] = useState<View>('overview')
  const [tasks, setTasks] = useState<TaskSpec[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [workloads, setWorkloads] = useState<Workload[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedTask, setSelectedTask] = useState<TaskSpec | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('cc-theme') || 'light')
  const [mobileNav, setMobileNav] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('cc-theme', theme) }, [theme])
  useEffect(() => { window.scrollTo(0, 0) }, [user, view])
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInputRef.current?.focus() }
      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) { setSearch(''); searchInputRef.current?.blur() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  const loadData = useCallback(async (initial = false) => {
    if (!user) return
    try {
      const [typeRows, dash, jobs, nodes] = await Promise.all([api.workloadTypes(), api.dashboard(), api.workloads(), api.workers()])
      setTasks(typeRows); setDashboard(dash); setWorkloads(jobs); setWorkers(nodes); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not refresh the workspace.') }
    finally { if (initial) setLoadingData(false) }
  }, [user])
  useEffect(() => { if (user) { setLoadingData(true); void loadData(true) } else { setLoadingData(false); setDashboard(null); setWorkloads([]) } }, [user, loadData])
  useEffect(() => { if (!user) return; const timer = window.setInterval(() => void loadData(), 5000); return () => window.clearInterval(timer) }, [user, loadData])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4600); return () => window.clearTimeout(timer) }, [notice])

  const filteredJobs = useMemo(() => workloads.filter(job => (filter === 'all' || job.status === filter) && (!search || `${job.title} ${job.input_name} ${job.task_type}`.toLowerCase().includes(search.toLowerCase()))), [workloads, filter, search])
  const searchedTasks = useMemo(() => tasks.filter(task => !search || `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(search.toLowerCase())), [tasks, search])
  async function onSubmitted(workload: Workload) {
    setWorkloads(current => [workload, ...current]); setView('history'); setPickerOpen(false); setNotice('Workload accepted and added to your queue.');
    window.setTimeout(() => void loadData(), 700)
  }
  async function download(job: Workload) {
    try { const blob = await api.artifact(job.id); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = job.artifact_name || `${job.title}.file`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Your result has been downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not download this result.') }
  }
  async function remove(job: Workload) {
    try { await api.remove(job.id); setWorkloads(current => current.filter(item => item.id !== job.id)); setNotice('Workload removed from your history.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this workload.') }
  }
  async function logout() { await signOut(); setView('overview') }

  if (!ready) return <div className="boot-screen"><div className="boot-mark">cc</div><span>Opening your workspace…</span><i className="boot-bar"/></div>
  if (!user) return <AuthScreen />

  const activeWorkers = workers.filter(worker => worker.status === 'online').length
  return <div className="app-frame">
    <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
      <div className="sidebar-brand"><div className="brand-mark"><span>cc</span><i /></div><span className="brand-copy"><b>CloudCluster</b><small>STUDIO</small></span><button className="mobile-close icon-button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-switcher"><div className="workspace-cube"><Cloud size={17}/></div><span><b>Personal workspace</b><small>Private cluster</small></span><ChevronDown size={15}/></div>
      <nav className="main-nav" aria-label="Main navigation">{menu.map((item, index) => <div key={item.id}>{item.section && <div className={`nav-section ${index > 0 ? 'nav-section--spaced' : ''}`}>{item.section}</div>}<button className={`nav-item ${view === item.id ? 'nav-item--active' : ''}`} onClick={() => { setView(item.id); setMobileNav(false) }}><item.icon size={18}/><span>{item.label}</span>{item.id === 'history' && dashboard?.metrics.running ? <b className="nav-count">{dashboard.metrics.running}</b> : null}{view === item.id && <i/>}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="plan-card"><div className="plan-orbit"><Zap size={17}/></div><div><b>Your cluster is ready</b><small>5 workers · 3 regions</small></div><button aria-label="View fleet" onClick={() => setView('fleet')}><ArrowUpRight size={15}/></button><div className="plan-line"><i/></div></div><button className="nav-item nav-item--subtle" onClick={() => setNotice('Workspace settings are coming soon.')}><Settings2 size={17}/><span>Settings</span></button><button className="nav-item nav-item--subtle" onClick={() => setNotice('Support is available at support@cloudcluster.local.')}><CircleHelp size={17}/><span>Help & support</span></button>
        <div className="sidebar-user"><div className="user-avatar">{initials(user.name)}</div><span className="sidebar-user-copy"><b>{user.name}</b><small>{user.email}</small></span><button onClick={() => setAccountOpen(value => !value)} aria-label="Account menu"><MoreHorizontal size={17}/></button>{accountOpen && <div className="account-menu account-menu--sidebar"><span className="account-menu-label">SIGNED IN AS</span><b>{user.email}</b><button onClick={() => void logout()}><LogOut size={15}/> Sign out</button></div>}</div>
      </div>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Workflow size={19}/></button><span className="crumb">WORKSPACE</span><span className="crumb-divider">/</span><b>{viewTitles[view]}</b></div><div className="topbar-right"><div className="online-chip"><span className="live-dot"/>{activeWorkers} of {workers.length || 5} workers online</div><label className="global-search"><Search size={15}/><input ref={searchInputRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workspace"/><kbd><Command size={10}/> K</kbd></label><button className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}</button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotice('You’re all caught up.') }><Bell size={17}/><i/></button><div className="top-profile"><div className="user-avatar user-avatar--small">{initials(user.name)}</div><span><b>{user.name.split(' ')[0]}</b><small>Workspace owner</small></span><button aria-label="Account menu" onClick={() => setAccountOpen(value => !value)}><ChevronDown size={14}/></button>{accountOpen && <div className="account-menu"><span className="account-menu-label">SIGNED IN AS</span><b>{user.email}</b><button onClick={() => void logout()}><LogOut size={15}/> Sign out</button></div>}</div></div></header>
      <div className="page-scroll"><div className="page-shell">
        {error && <div className="alert alert-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={15}/></button></div>}
        {view === 'overview' && <Overview userName={user.name} dashboard={dashboard} workers={workers} tasks={searchedTasks} jobs={workloads} busy={loadingData} onLaunch={task => setSelectedTask(task)} onNew={() => setPickerOpen(true)} onPage={setView} onDownload={download}/>}
        {view === 'workloads' && <WorkloadsPage tasks={searchedTasks} onLaunch={task => setSelectedTask(task)} onNew={() => setPickerOpen(true)}/>}
        {view === 'history' && <HistoryPage jobs={filteredJobs} filter={filter} setFilter={setFilter} onDownload={download} onDelete={remove} busy={loadingData}/>}
        {view === 'fleet' && <FleetPage workers={workers} jobs={workloads}/>}
        {view === 'insights' && <InsightsPage dashboard={dashboard} jobs={workloads}/>}
      </div></div>
    </main>
    {pickerOpen && <TaskPicker tasks={tasks} onClose={() => setPickerOpen(false)} onChoose={task => { setPickerOpen(false); setSelectedTask(task) }}/>}
    {selectedTask && <TaskComposer task={selectedTask} onClose={() => setSelectedTask(null)} onSubmitted={job => { void onSubmitted(job) }}/>}
    {notice && <div className="toast"><span className="toast-check"><Check size={14}/></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14}/></button></div>}
  </div>
}

function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U' }
function formatTime(value?: string | null) { return value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—' }
function relativeTime(value: string) { const diff = Math.max(0, Date.now() - new Date(value).getTime()); const minutes = Math.floor(diff / 60000); if (minutes < 1) return 'Just now'; if (minutes < 60) return `${minutes} min ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} hr ago`; return `${Math.floor(hours / 24)} days ago` }
function niceDuration(ms: number) { if (ms <= 0) return '—'; if (ms < 1000) return `${ms} ms`; return `${(ms / 1000).toFixed(1)} s` }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function EmptyGraphic() { return <div className="empty-graphic"><div><Cloud size={25}/></div><i/><i/><i/></div> }

function ActivityChart({ data, large = false }: { data: { day: string; workloads: number }[]; large?: boolean }) {
  const [active, setActive] = useState<number | null>(null)
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const values = data.length ? data : labels.map(day => ({ day, workloads: 0 }))
  const max = Math.max(3, ...values.map(item => item.workloads))
  const width = 440; const height = 180; const left = 31; const right = 10; const top = 16; const bottom = 29
  const innerWidth = width - left - right; const innerHeight = height - top - bottom
  const points = values.map((item, index) => ({ x: left + (values.length < 2 ? .5 : index / (values.length - 1)) * innerWidth, y: top + innerHeight - item.workloads / max * innerHeight, ...item }))
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
  const area = `${line} L${points.at(-1)?.x ?? left},${top + innerHeight} L${points[0]?.x ?? left},${top + innerHeight} Z`
  const point = active === null ? null : points[active]
  return <div className={`chart-wrap ${large ? 'chart-wrap--large' : 'chart-wrap--small'}`}><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Workload activity by day" onMouseLeave={() => setActive(null)}>
    <defs><linearGradient id={large ? 'insightsFill' : 'activityFill'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7765f8" stopOpacity=".23"/><stop offset="100%" stopColor="#7765f8" stopOpacity=".015"/></linearGradient></defs>
    {[0, 1, 2, 3].map(step => { const y = top + innerHeight * step / 3; const value = Math.round(max * (3 - step) / 3); return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} stroke="var(--grid-line)" strokeDasharray="3 5"/><text x={left - 8} y={y + 3} textAnchor="end" fill="var(--muted)" fontSize="9">{value}</text></g> })}
    <path d={area} fill={`url(#${large ? 'insightsFill' : 'activityFill'})`}/><path d={line} fill="none" stroke="#7969fa" strokeWidth="2.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
    {points.map((item, index) => <g key={`${item.day}-${index}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} tabIndex={0} role="button" aria-label={`${item.day}: ${item.workloads} workloads`}><circle cx={item.x} cy={item.y} r={large ? 13 : 10} fill="transparent"/><circle cx={item.x} cy={item.y} r={point && active === index ? 5 : 2.5} fill="#7969fa" stroke="var(--surface)" strokeWidth="2"/></g>)}
    {values.map((item, index) => <text key={`day-${index}`} x={points[index]?.x ?? 0} y={height - 7} textAnchor="middle" fill="var(--muted)" fontSize="9">{item.day}</text>)}
    {point && <g pointerEvents="none"><rect x={Math.min(Math.max(point.x - 42, left), width - 87)} y={Math.max(2, point.y - 31)} width="83" height="22" rx="6" fill="var(--ink)"/><text x={Math.min(Math.max(point.x, left + 42), width - 45)} y={Math.max(17, point.y - 17)} textAnchor="middle" fill="var(--surface)" fontSize="9" fontWeight="600">{point.day} · {point.workloads} jobs</text></g>}
  </svg></div>
}

function Overview({ userName, dashboard, workers, tasks, jobs, busy, onLaunch, onNew, onPage, onDownload }: { userName: string; dashboard: Dashboard | null; workers: Worker[]; tasks: TaskSpec[]; jobs: Workload[]; busy: boolean; onLaunch: (task: TaskSpec) => void; onNew: () => void; onPage: (page: View) => void; onDownload: (job: Workload) => void }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const metrics = dashboard?.metrics
  const heroTasks = tasks.slice(0, 4)
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>CLOUDCLUSTER / OVERVIEW</div><h1>{greeting}, {userName.split(' ')[0]}<span className="heading-period">.</span></h1><p>Your useful work, moving quietly in the background.</p></div><button className="button button-primary" onClick={onNew}><Plus size={17}/> New workload</button></div>
    <section className="overview-stats">
      <MetricCard icon={Workflow} label="Total workloads" value={metrics?.total ?? 0} foot="All time in your workspace" color="violet"/>
      <MetricCard icon={Activity} label="Completed" value={metrics?.completed ?? 0} foot={metrics?.success_rate == null ? 'No completed runs yet' : `${metrics.success_rate}% successful run rate`} color="mint"/>
      <MetricCard icon={Gauge} label="In motion" value={(metrics?.running ?? 0) + (metrics?.queued ?? 0)} foot={`${metrics?.running ?? 0} running · ${metrics?.queued ?? 0} queued`} color="blue" pulse={(metrics?.running ?? 0) > 0}/>
      <MetricCard icon={Zap} label="Avg. turnaround" value={niceDuration(metrics?.avg_duration_ms ?? 0)} foot="Across completed workloads" color="orange" compactValue/>
    </section>
    <div className="overview-grid overview-grid--lead">
      <section className="panel cluster-panel"><div className="panel-heading"><div><div className="eyebrow">YOUR COMPUTE FLEET</div><h2>Work in motion</h2><p>Five workers sharing the load across three regions.</p></div><button className="text-link" onClick={() => onPage('fleet')}>View fleet <ArrowUpRight size={14}/></button></div><ClusterMap workers={workers}/><div className="cluster-panel-foot"><span><span className="live-dot"/> Fleet heartbeat normal</span><span>Updated just now <Clock3 size={13}/></span></div></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><div className="eyebrow">YOUR LAST 7 DAYS</div><h2>Workload activity</h2><p>Jobs started across your workspace.</p></div><button className="icon-button soft-icon" aria-label="Activity details" onClick={() => onPage('insights')}><ArrowUpRight size={16}/></button></div><div className="activity-total"><b>{(dashboard?.activity ?? []).reduce((sum, item) => sum + item.workloads, 0)}</b><span>workloads started</span><span className="activity-change"><Activity size={13}/> LIVE</span></div><ActivityChart data={dashboard?.activity ?? []}/><button className="activity-link" onClick={() => onPage('insights')}>Explore your insights <ArrowRight size={14}/></button></section>
    </div>
    <div className="section-header section-header--tasks"><div><div className="eyebrow">SIX TOOLS, RIGHT HERE</div><h2>What do you need done?</h2></div><button className="text-link" onClick={() => onPage('workloads')}>Browse all tools <ArrowRight size={14}/></button></div>
    <div className="quick-tools">{heroTasks.map(task => <TaskCard key={task.id} task={task} onClick={() => onLaunch(task)} compact/>)}</div>
    <section className="panel recent-panel"><div className="panel-heading panel-heading--row"><div><div className="eyebrow">RECENT ACTIVITY</div><h2>Your latest workloads</h2></div><button className="text-link" onClick={() => onPage('history')}>Full history <ArrowRight size={14}/></button></div>{jobs.length ? <div className="mini-job-list">{jobs.slice(0, 4).map(job => <WorkloadLine key={job.id} job={job} onDownload={onDownload}/>)}</div> : <div className="empty-inline"><span className="empty-icon"><FileClock size={18}/></span><span><b>{busy ? 'Loading your recent work…' : 'Your first workload starts here'}</b><small>{busy ? 'Your workspace will be ready in a moment.' : 'Choose a tool above and get your first task moving.'}</small></span><button className="text-link" onClick={onNew}>Start a task <ArrowRight size={14}/></button></div>}</section>
  </>
}

function MetricCard({ icon: Icon, label, value, foot, color, pulse, compactValue }: { icon: typeof Workflow; label: string; value: number | string; foot: string; color: string; pulse?: boolean; compactValue?: boolean }) {
  return <article className="metric-card"><div className={`metric-icon metric-icon--${color}`}><Icon size={17}/></div><span className="metric-label">{label}</span><b className={`metric-value ${compactValue ? 'metric-value--compact' : ''}`}>{value}</b><span className="metric-foot">{pulse && <i className="live-dot"/>}{foot}</span></article>
}

function TaskCard({ task, onClick, compact = false }: { task: TaskSpec; onClick: () => void; compact?: boolean }) {
  const Icon = taskIcons[task.icon] || Workflow
  return <button className={`task-card task-card--${task.color} ${compact ? 'task-card--compact' : ''}`} onClick={onClick}><div className="task-card-top"><div className={`task-icon task-icon--${task.color}`}><Icon size={19}/></div><span className={`complexity complexity--${task.category.toLowerCase()}`}>{task.category}<i>·</i> {task.complexity}/3</span></div><b className="task-title">{task.title}</b><span className="task-description">{task.description}</span><span className="task-card-bottom"><span>{task.input === 'url' ? 'LINK INPUT' : task.accept.split(',').slice(0, 2).join(' · ')}</span><i><ArrowUpRight size={15}/></i></span></button>
}

function WorkloadsPage({ tasks, onLaunch, onNew }: { tasks: TaskSpec[]; onLaunch: (task: TaskSpec) => void; onNew: () => void }) {
  const groups = ['Quick', 'Standard', 'Advanced'] as const
  const subtitles: Record<string, string> = { Quick: 'A small helper. Ready in seconds.', Standard: 'A little more processing, a lot less busywork.', Advanced: 'Heavier jobs with room to breathe.' }
  return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>CLOUDCLUSTER / WORKLOADS</div><h1>Everyday tools,<br className="mobile-break"/> on tap.</h1><p>Pick a job, give it an input, and let your cluster take it from there.</p></div><button className="button button-primary" onClick={onNew}><Plus size={17}/> New workload</button></div><div className="workloads-intro"><div className="intro-mark"><Zap size={19}/></div><div><b>Start with what you need.</b><span>Quick runs need only a few resources. Larger jobs are routed to a worker with room to handle them.</span></div><div className="scheduler-badge"><span className="live-dot"/>SMART SCHEDULING ACTIVE</div></div>{groups.map((group, index) => <section className="tool-group" key={group}><header className="tool-group-head"><div className={`group-number group-number--${group.toLowerCase()}`}>0{index + 1}</div><div><h2>{group}<span>{group === 'Quick' ? '01' : group === 'Standard' ? '02' : '03'} — LEVEL {index + 1}</span></h2><p>{subtitles[group]}</p></div><div className="group-rule"/><span className="group-count">{tasks.filter(task => task.category === group).length} tools</span></header><div className="tool-grid">{tasks.filter(task => task.category === group).map(task => <TaskCard key={task.id} task={task} onClick={() => onLaunch(task)}/>)}</div></section>)}</>
}

function WorkloadLine({ job, onDownload }: { job: Workload; onDownload: (job: Workload) => void }) {
  const iconName = ({ 'link-qr': 'QrCode', 'csv-clean': 'ListFilter', 'data-convert': 'ArrowLeftRight', 'image-optimize': 'Image', 'pdf-brief': 'FileText', 'zip-organize': 'FolderTree' } as Record<string, string>)[job.task_type] || 'Workflow'
  const Icon = taskIcons[iconName] || Workflow
  return <div className="mini-job-row"><div className="mini-job-icon"><Icon size={17}/></div><div className="mini-job-name"><b>{job.title}</b><small>{job.input_name || 'Link QR'} · {relativeTime(job.created_at)}</small></div><StatusChip status={job.status}/><span className="mini-job-duration">{job.status === 'completed' ? niceDuration(job.duration_ms) : job.status === 'running' ? `${job.progress}%` : '—'}</span>{job.status === 'completed' && <button className="download-icon" aria-label={`Download ${job.artifact_name}`} onClick={() => onDownload(job)}><ArrowDownToLine size={16}/></button>}</div>
}

function StatusChip({ status }: { status: string }) { return <span className={`status-chip status-chip--${status}`}><i/>{titleCase(status)}</span> }

function HistoryPage({ jobs, filter, setFilter, onDownload, onDelete, busy }: { jobs: Workload[]; filter: string; setFilter: (value: string) => void; onDownload: (job: Workload) => void; onDelete: (job: Workload) => void; busy: boolean }) {
  const filters: [string, string][] = [['all', 'All runs'], ['running', 'In motion'], ['completed', 'Completed'], ['failed', 'Needs attention']]
  return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>CLOUDCLUSTER / HISTORY</div><h1>Your work, accounted for.</h1><p>Track each run, find its result, and download the files you made.</p></div><div className="history-summary"><span><b>{jobs.length}</b> displayed</span><span><Clock3 size={14}/> Auto-updates every 5 seconds</span></div></div><section className="panel history-panel"><div className="history-toolbar"><div className="filter-tabs">{filters.map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}{key === 'running' && jobs.some(job => job.status === 'running') && <i/>}</button>)}</div><span className="history-count">{jobs.length} WORKLOADS</span></div>{jobs.length ? <div className="history-table-wrap"><table className="history-table"><thead><tr><th>WORKLOAD</th><th>STATUS</th><th>WORKER</th><th>SCHEDULER</th><th>STARTED</th><th>RUNTIME</th><th/></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td><div className="history-job-cell"><div className="history-job-glyph"><Workflow size={16}/></div><span><b>{job.title}</b><small>{job.input_name || 'Link input'}</small></span></div></td><td><StatusChip status={job.status}/></td><td>{job.worker_id ? <span className="worker-tag"><span className="live-dot"/>{job.worker_id}</span> : <span className="muted-cell">Queueing</span>}</td><td><span className="algorithm-tag">{job.algorithm || 'pending'}</span></td><td>{formatTime(job.started_at || job.created_at)}</td><td>{job.status === 'running' ? <span className="progress-mini"><i style={{ width: `${Math.max(14, job.progress)}%` }}/>{job.progress}%</span> : niceDuration(job.duration_ms)}</td><td><div className="row-actions">{job.status === 'completed' && <button className="download-icon" aria-label={`Download ${job.artifact_name}`} onClick={() => onDownload(job)}><ArrowDownToLine size={16}/></button>}{['completed', 'failed'].includes(job.status) && <button className="download-icon" aria-label={`Delete ${job.title}`} onClick={() => onDelete(job)}><X size={16}/></button>}</div></td></tr>)}</tbody></table></div> : <div className="empty-state"><EmptyGraphic/><h3>{busy ? 'Loading your history…' : 'No workloads in this view yet.'}</h3><p>{filter === 'all' ? 'Your runs will appear here as soon as you start a tool.' : `No ${filter} workloads are showing right now.`}</p>{filter !== 'all' && <button className="button button-quiet" onClick={() => setFilter('all')}>Show all runs</button>}</div>}</section><p className="history-footnote"><ShieldCheck size={14}/> Results are stored in your private workspace. Removing a run also removes its downloadable file.</p></>
}

function FleetPage({ workers, jobs }: { workers: Worker[]; jobs: Workload[] }) {
  const [selected, setSelected] = useState<Worker | null>(null)
  return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>CLOUDCLUSTER / FLEET</div><h1>Meet your workers.</h1><p>Five capable nodes, placed where work can get done.</p></div><div className="fleet-live"><span className="live-dot"/> SYSTEM OPERATIONAL</div></div><section className="panel fleet-map-panel"><div className="panel-heading"><div><div className="eyebrow">INTERACTIVE TOPOLOGY</div><h2>A closer look at your cluster</h2><p>Drag to rotate. Scroll to zoom. Select a worker to inspect it.</p></div><div className="fleet-map-total"><b>{workers.length.toString().padStart(2, '0')}</b><span>WORKERS</span></div></div><ClusterMap workers={workers}/></section><div className="fleet-section-title"><div><div className="eyebrow">ALL WORKERS</div><h2>Resources & current load</h2></div><span>HEARTBEAT · EVERY 5 SEC</span></div><div className="worker-grid">{workers.map(worker => <article className={`worker-card ${selected?.id === worker.id ? 'worker-card--selected' : ''}`} key={worker.id} onClick={() => setSelected(worker)}><div className="worker-card-top"><div className={`worker-avatar worker-avatar--${worker.accent}`}><Server size={18}/></div><span className={`worker-status ${worker.status === 'busy' ? 'worker-status--busy' : ''}`}><i/>{worker.status === 'busy' ? 'Processing' : 'Online'}</span></div><div className="worker-card-title"><h3>{worker.name}</h3><span>{worker.id}</span></div><div className="worker-region"><Cloud size={13}/>{worker.region}</div><div className="worker-load-label"><span>Resource utilization</span><b>{worker.utilization}%</b></div><div className="load-track"><i style={{ width: `${worker.utilization}%` }}/></div><div className="worker-capacity"><span><Cpu size={14}/>{worker.cpu} vCPU</span><span><Zap size={13}/>{worker.memory} GB RAM</span><span><Activity size={14}/>{jobs.filter(job => job.worker_id === worker.id && job.status === 'running').length} active</span></div></article>)}</div><section className="panel fleet-note"><div className="fleet-note-icon"><ShieldCheck size={19}/></div><div><b>Balanced by design.</b><p>Quick workloads use a first-fit scheduler; standard jobs use Min-Min; advanced jobs use Max-Min to place larger tasks on workers with the most room.</p></div></section></>
}

function InsightsPage({ dashboard, jobs }: { dashboard: Dashboard | null; jobs: Workload[] }) {
  const data = dashboard?.activity ?? []
  const taskTotals = jobs.reduce<Record<string, number>>((result, job) => { result[job.title] = (result[job.title] || 0) + 1; return result }, {})
  const maxTask = Math.max(1, ...Object.values(taskTotals))
  return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>CLOUDCLUSTER / INSIGHTS</div><h1>The shape of your work.</h1><p>A clear view of the jobs you run and how they move through your cluster.</p></div><div className="range-select"><span className="live-dot"/> LAST 7 DAYS <ChevronDown size={14}/></div></div><div className="insights-overview"><MetricCard icon={Workflow} label="Total workloads" value={dashboard?.metrics.total ?? 0} foot="Since your workspace began" color="violet"/><MetricCard icon={Check} label="Success rate" value={dashboard?.metrics.success_rate == null ? '—' : `${dashboard.metrics.success_rate}%`} foot={dashboard?.metrics.success_rate == null ? 'No completed runs yet' : `${dashboard.metrics.completed} completed successfully`} color="mint"/><MetricCard icon={Clock3} label="Average runtime" value={niceDuration(dashboard?.metrics.avg_duration_ms ?? 0)} foot="Across completed workloads" color="blue" compactValue/><MetricCard icon={Activity} label="Failed runs" value={dashboard?.metrics.failed ?? 0} foot="Runs needing another look" color="orange"/></div><div className="insights-grid"><section className="panel insights-chart-panel"><div className="panel-heading"><div><div className="eyebrow">DAILY THROUGHPUT</div><h2>Workload activity</h2><p>Every job submitted to your workspace this week.</p></div><span className="chart-key"><i/> Workloads</span></div><ActivityChart data={data} large/></section><section className="panel workload-mix"><div className="panel-heading"><div><div className="eyebrow">WORKLOAD MIX</div><h2>What you run most</h2><p>Based on your complete history.</p></div></div>{Object.keys(taskTotals).length ? <div className="mix-list">{Object.entries(taskTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count], index) => <div className="mix-row" key={name}><div className={`mix-dot mix-dot--${index % 5}`}/><span>{name}</span><div className="mix-progress"><i style={{ width: `${Math.max(8, count / maxTask * 100)}%` }}/></div><b>{count}</b></div>)}</div> : <div className="mix-empty"><EmptyGraphic/><b>Your workload mix will grow here.</b><span>Run a tool and come back to see your patterns.</span></div>}</section></div><section className="insight-callout"><div className="insight-callout-icon"><Sparkles size={20}/></div><div><b>Small jobs add up. Good scheduling helps.</b><p>Your scheduler picks a placement strategy based on the complexity of each task and available worker capacity.</p></div><div className="insight-chips"><span>FIRST-FIT</span><span>MIN-MIN</span><span>MAX-MIN</span></div></section></>
}

function TaskPicker({ tasks, onClose, onChoose }: { tasks: TaskSpec[]; onClose: () => void; onChoose: (task: TaskSpec) => void }) {
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title"><header className="modal-head"><div><div className="eyebrow"><span className="eyebrow-dot"/>CHOOSE A WORKLOAD</div><h2 id="picker-title">What should we take off your hands?</h2><p>Pick one of your everyday tools to get started.</p></div><button className="icon-button" onClick={onClose} aria-label="Close picker"><X size={18}/></button></header><div className="picker-list">{tasks.map(task => { const Icon = taskIcons[task.icon] || Workflow; return <button className="picker-option" key={task.id} onClick={() => onChoose(task)}><div className={`task-icon task-icon--${task.color}`}><Icon size={19}/></div><span><b>{task.title}</b><small>{task.description}</small></span><span className={`complexity complexity--${task.category.toLowerCase()}`}>{task.category}</span><ArrowRight size={17}/></button> })}</div><footer className="picker-foot"><ShieldCheck size={14}/> Files and outputs stay private to your account.</footer></section></div>
}
