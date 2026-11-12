import { useState, useMemo } from 'react'
import { ArrowDownWideNarrow, ClipboardList, Download, Inbox, Lightbulb, Search, SlidersHorizontal, Trash2, TriangleAlert, X } from 'lucide-react'
import { getWorkerName } from './workerSeries'
import styles from './TaskLedger.module.css'

const TYPE_LABELS = {
  data_preprocessing: 'Data preprocessing',
  qr_generator: 'Link QR maker',
  ascii_art: 'Legacy Text Workload',
  csv_json_converter: 'CSV ↔ JSON',
  image_optimizer: 'Image optimizer',
  pdf_brief: 'PDF brief',
  file_integrity: 'File integrity check',
}

const STATUSES = ['SUBMITTED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']
const formatAlgorithm = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '—'
const formatNode = value => value ? getWorkerName(value) : '—'
const formatTaskType = value => TYPE_LABELS[value] || value?.replaceAll('_', ' ') || 'Other'

function StatusPill({ status, queuePosition }) {
  const map = {
    SUBMITTED: { bg: 'rgba(148,163,184,0.12)', color: 'var(--text-secondary)', border: 'rgba(148,163,184,0.28)' },
    QUEUED:    { bg: 'rgba(245,158,11,0.10)', color: 'var(--accent-amber)', border: 'rgba(245,158,11,0.25)' },
    RUNNING:   { bg: 'rgba(99,102,241,0.10)', color: 'var(--accent-indigo)', border: 'rgba(99,102,241,0.25)' },
    COMPLETED: { bg: 'rgba(16,185,129,0.10)', color: 'var(--accent-emerald)', border: 'rgba(16,185,129,0.25)' },
    FAILED:    { bg: 'rgba(244,63,94,0.09)', color: 'var(--accent-rose)', border: 'rgba(244,63,94,0.24)' },
  }
  const s = map[status] || map.SUBMITTED
  return (
    <span className={styles.pill} style={{ background: s.bg, color: s.color, borderColor: s.border }}>
      {status === 'QUEUED' && queuePosition > 0 ? `QUEUED · #${queuePosition}` : status}
    </span>
  )
}

export default function TaskLedger({ id, tasks, onViewTask, onDeleteTask }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('newest')
  const [errorModal, setErrorModal] = useState(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set())
  const [deletingTasks, setDeletingTasks] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState(null)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return tasks
      .filter(task => statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? ['RUNNING', 'QUEUED', 'SUBMITTED'].includes(task.status) : task.status === statusFilter))
      .filter(task => typeFilter === 'ALL' || task.task_type === typeFilter)
      .filter(task => !q || [
        task.task_id, task.task_type, task.algorithm, task.assigned_node, task.status, task.queue_position,
      ].some(value => value?.toLowerCase().includes(q)))
      .sort((left, right) => {
        if (sortBy === 'runtime') return Number(right.execution_time || 0) - Number(left.execution_time || 0)
        if (sortBy === 'memory') return Number(right.peak_ram || 0) - Number(left.peak_ram || 0)
        return (Date.parse(right.submission_time || '') || 0) - (Date.parse(left.submission_time || '') || 0)
      })
  }, [tasks, search, statusFilter, typeFilter, sortBy])
  const selectedTasks = tasks.filter(task => selectedTaskIds.has(task.task_id))

  const toggleTaskSelection = taskId => {
    setSelectedTaskIds(current => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleVisibleSelection = checked => {
    setSelectedTaskIds(current => {
      const next = new Set(current)
      filtered.forEach(task => checked ? next.add(task.task_id) : next.delete(task.task_id))
      return next
    })
  }

  const deleteSelectedTasks = async () => {
    if (!selectedTasks.length) return
    const ids = selectedTasks.map(task => task.task_id)
    const taskLabel = ids.length === 1 ? 'workload' : 'workloads'
    if (!window.confirm(`Delete ${ids.length} selected ${taskLabel} from history? This cannot be undone.`)) return
    setDeletingTasks(true)
    setDeleteMessage(null)
    const results = await Promise.all(selectedTasks.map(async task => {
      try {
        const result = await onDeleteTask(task)
        return { taskId: task.task_id, result }
      } catch (error) {
        return { taskId: task.task_id, error: error.message || 'Unable to delete workload.' }
      }
    }))
    const deletedIds = results.filter(result => !result.error).map(result => result.taskId)
    setSelectedTaskIds(current => new Set([...current].filter(id => !deletedIds.includes(id))))
    const failed = results.filter(result => result.error)
    const warnings = results.flatMap(result => result.result?.cleanup_warnings || [])
    const deferred = results.some(result => result.result?.cleanup_deferred)
    const messages = []
    if (deletedIds.length) messages.push(`${deletedIds.length} ${deletedIds.length === 1 ? 'workload' : 'workloads'} deleted.`)
    if (deferred) messages.push('Files for active workloads will be cleaned after execution finishes.')
    if (warnings.length) messages.push(`Some files could not be removed: ${warnings.join('; ')}`)
    if (failed.length) messages.push(`Could not delete ${failed.map(result => `${result.taskId} (${result.error})`).join(', ')}.`)
    setDeleteMessage(messages.join(' '))
    setDeletingTasks(false)
  }

  const statusCounts = useMemo(() => tasks.reduce((counts, task) => {
    counts[task.status] = (counts[task.status] || 0) + 1
    return counts
  }, {}), [tasks])

  const exportCsv = () => {
    const columns = [
      ['Task ID', task => task.task_id],
      ['Workload type', task => formatTaskType(task.task_type)],
      ['Algorithm', task => task.algorithm],
      ['Worker node', task => task.assigned_node],
      ['Status', task => task.status],
      ['Queue position', task => task.queue_position],
      ['Submitted at', task => task.submission_time],
      ['Wait time (s)', task => task.waiting_time],
      ['Execution time (s)', task => task.execution_time],
      ['Average CPU (%)', task => task.avg_cpu],
      ['Peak CPU (%)', task => task.peak_cpu],
      ['Average RAM (MB)', task => task.avg_ram],
      ['Peak RAM (MB)', task => task.peak_ram],
    ]
    const escapeCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = [
      columns.map(([name]) => escapeCell(name)).join(','),
      ...filtered.map(task => columns.map(([, getValue]) => escapeCell(getValue(task))).join(',')),
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `cloudcluster-workloads-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section className={styles.card} id={id}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.headerIcon}><ClipboardList size={18} /></span>
          <div>
            <h2 className={styles.title}>Execution ledger</h2>
            <p className={styles.sub}>{filtered.length} of {tasks.length} workloads shown</p>
          </div>
        </div>
        <button className={styles.exportBtn} onClick={exportCsv} disabled={!filtered.length}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className={styles.quickFilters} aria-label="Quick workload filters">
        {[
          { value: 'ALL', label: 'All workloads', count: tasks.length },
          { value: 'ACTIVE', label: 'Active', count: (statusCounts.RUNNING || 0) + (statusCounts.QUEUED || 0) + (statusCounts.SUBMITTED || 0) },
          { value: 'COMPLETED', label: 'Completed', count: statusCounts.COMPLETED || 0 },
          { value: 'FAILED', label: 'Failed', count: statusCounts.FAILED || 0 },
        ].map(filter => (
          <button
            key={filter.value}
            className={`${styles.quickFilter} ${statusFilter === filter.value ? styles.quickFilterActive : ''}`}
            onClick={() => setStatusFilter(filter.value)}
            aria-pressed={statusFilter === filter.value}
          >
            {filter.label}<span>{filter.count}</span>
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.searchWrap}>
          <Search className={styles.searchIcon} size={15} />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search ID, algorithm, node…"
            className={styles.searchInput}
            aria-label="Search workloads"
          />
        </label>
        <label className={styles.filterControl}>
          <SlidersHorizontal size={14} />
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active workloads · {(statusCounts.RUNNING || 0) + (statusCounts.QUEUED || 0) + (statusCounts.SUBMITTED || 0)}</option>
            {STATUSES.map(status => <option key={status} value={status}>{status} · {statusCounts[status] || 0}</option>)}
          </select>
        </label>
        <label className={styles.filterControl}>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter by workload type">
            <option value="ALL">All workload types</option>
            {Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </label>
        <label className={styles.filterControl}>
          <ArrowDownWideNarrow size={14} />
          <select value={sortBy} onChange={event => setSortBy(event.target.value)} aria-label="Sort workloads">
            <option value="newest">Newest first</option>
            <option value="runtime">Longest runtime</option>
            <option value="memory">Highest peak RAM</option>
          </select>
        </label>
        <button
          type="button"
          className={styles.deleteSelectedBtn}
          onClick={deleteSelectedTasks}
          disabled={!selectedTasks.length || deletingTasks}
        >
          <Trash2 size={14} />
          {deletingTasks ? 'Deleting…' : `Delete selected${selectedTasks.length ? ` · ${selectedTasks.length}` : ''}`}
        </button>
      </div>

      {deleteMessage && (
        <div className={styles.deleteMessage} role="status">
          <span>{deleteMessage}</span>
          <button onClick={() => setDeleteMessage(null)} aria-label="Dismiss deletion message">Dismiss</button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  className={styles.selectCheckbox}
                  aria-label="Select all visible workloads"
                  checked={filtered.length > 0 && filtered.every(task => selectedTaskIds.has(task.task_id))}
                  onChange={event => toggleVisibleSelection(event.target.checked)}
                />
              </th>
              <th>Task ID</th>
              <th>Workload Type</th>
              <th>Algorithm</th>
              <th>Node</th>
              <th>Status</th>
              <th>Wait Time</th>
              <th>Exec Time</th>
              <th>Peak RAM</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className={styles.emptyRow}>
                  <div className={styles.emptyContent}>
                    <Inbox size={17} />
                    <span>{tasks.length === 0 ? 'No tasks submitted yet. Submit your first workload above.' : 'No matching tasks found.'}</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(task => {
                return (
                  <tr key={task.task_id}>
                    <td data-label="Select">
                      <input
                        type="checkbox"
                        className={styles.selectCheckbox}
                        aria-label={`Select workload ${task.task_id}`}
                        checked={selectedTaskIds.has(task.task_id)}
                        onChange={() => toggleTaskSelection(task.task_id)}
                      />
                    </td>
                    <td data-label="Task ID">
                      <span className={styles.taskId}>{task.task_id}</span>
                    </td>
                    <td data-label="Workload type">
                      <span className={styles.typeCell}>{formatTaskType(task.task_type)}</span>
                    </td>
                    <td data-label="Algorithm">
                      <code className={styles.algoCode}>{formatAlgorithm(task.algorithm)}</code>
                    </td>
                    <td data-label="Node">
                      <strong className={styles.nodeVal}>{formatNode(task.assigned_node)}</strong>
                    </td>
                    <td data-label="Status"><StatusPill status={task.status} queuePosition={task.queue_position} /></td>
                    <td data-label="Wait time" className={styles.numCol}>{Number(task.waiting_time || 0).toFixed(3)}s</td>
                    <td data-label="Execution" className={styles.numCol}>{Number(task.execution_time || 0).toFixed(3)}s</td>
                    <td data-label="Peak RAM" className={styles.numCol}>{task.peak_ram ? task.peak_ram.toFixed(1) : '0.0'} MB</td>
                    <td data-label="Actions">
                      {task.status === 'COMPLETED' && task.output_file ? (
                        <button className={styles.viewBtn} onClick={() => onViewTask(task)}>View output</button>
                      ) : task.status === 'FAILED' ? (
                        <button className={styles.failBtn} onClick={() => setErrorModal(task)}><TriangleAlert size={13} /> Details</button>
                      ) : (
                        <span className={styles.pipelineText}>{task.status === 'QUEUED' ? `Queue #${task.queue_position || '—'}` : 'In Pipeline…'}</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Error Detail Modal */}
      {errorModal && (
        <div className={styles.modalOverlay} onClick={() => setErrorModal(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="failure-title" onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <TriangleAlert size={20} />
                <div>
                  <h3 id="failure-title">Workload Execution Failure</h3>
                  <span className={styles.modalSub}>
                    Task: {errorModal.task_id} · {formatTaskType(errorModal.task_type)}
                  </span>
                </div>
              </div>
              <button className={styles.modalClose} onClick={() => setErrorModal(null)} aria-label="Close error details"><X size={16} /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.diagBox}>
                <label>Failure Diagnostic</label>
                <pre>{errorModal.error_message || 'Unknown error encountered during node execution.'}</pre>
              </div>
              <div className={styles.remBox}>
                <strong><Lightbulb size={14} /> Recommended action</strong>
                <p>Verify your input file complies with the required specification format and resubmit the task.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
