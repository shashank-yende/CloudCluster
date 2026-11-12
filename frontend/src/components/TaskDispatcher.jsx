import { useState } from 'react'
import {
  ArrowRight, Check, FileCheck2, FileJson, FileText, Fingerprint,
  Image, Link2, Plus, QrCode, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react'
import { apiFetch } from '../api'
import { formatApiError } from '../apiErrors'
import styles from './TaskDispatcher.module.css'

const MAX_ITEMS = 50
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_BATCH_BYTES = 100 * 1024 * 1024

const WORKLOADS = [
  { id: 'qr_generator', category: 'Quick', complexity: 'QUICK', icon: QrCode, color: '#8072ff', title: 'Link QR maker', description: 'Create a crisp QR image from any public web link.', formats: 'HTTP or HTTPS link', accept: '', extensions: [] },
  { id: 'data_preprocessing', category: 'Quick', complexity: 'QUICK', icon: FileCheck2, color: '#3ec8a0', title: 'Data preprocessing', description: 'Standardize headers and cells, remove blank rows, and deduplicate CSV records.', formats: '.csv · UTF-8', accept: '.csv,text/csv', extensions: ['.csv'] },
  { id: 'csv_json_converter', category: 'Standard', complexity: 'STANDARD', icon: FileJson, color: '#62a8ff', title: 'CSV ↔ JSON', description: 'Move tabular data between spreadsheet and API-friendly formats.', formats: '.csv or .json', accept: '.csv,.json', extensions: ['.csv', '.json'] },
  { id: 'image_optimizer', category: 'Standard', complexity: 'STANDARD', icon: Image, color: '#ff9b69', title: 'Image optimizer', description: 'Resize photos and reduce file size with clean WebP exports.', formats: '.png, .jpg, .jpeg, .webp', accept: '.png,.jpg,.jpeg,.webp', extensions: ['.png', '.jpg', '.jpeg', '.webp'] },
  { id: 'pdf_brief', category: 'Advanced', complexity: 'ADVANCED', icon: FileText, color: '#ff7f9b', title: 'PDF brief', description: 'Extract page count, key terms, metadata, and selectable text.', formats: '.pdf · up to 500 pages', accept: '.pdf,application/pdf', extensions: ['.pdf'] },
  { id: 'file_integrity', category: 'Advanced', complexity: 'ADVANCED', icon: Fingerprint, color: '#e7b752', title: 'File integrity check', description: 'Generate a SHA-256 checksum to verify downloads and backups.', formats: 'Any file · 20 MB max', accept: '', extensions: [] },
]

const GROUPS = [
  { label: 'QUICK', caption: 'Fast everyday jobs', category: 'Quick' },
  { label: 'STANDARD', caption: 'Useful file transforms', category: 'Standard' },
  { label: 'ADVANCED', caption: 'Deeper file checks', category: 'Advanced' },
]

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TaskDispatcher({ onTaskSubmitted }) {
  const [groups, setGroups] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState('')

  const workItemCount = groups.reduce((total, group) => total + (group.taskId === 'qr_generator' ? 1 : group.files.length), 0)
  const selectedBytes = groups.reduce((total, group) => total + group.files.reduce((sum, file) => sum + file.size, 0), 0)

  const addWorkload = taskId => {
    const task = WORKLOADS.find(item => item.id === taskId)
    if (!task || workItemCount >= MAX_ITEMS) {
      setSubmitError(`A batch can contain up to ${MAX_ITEMS} work items.`)
      return
    }
    setGroups(current => [...current, { id: makeId(), taskId, files: [], qrContent: '' }])
    setSubmitError('')
    setSuccess('')
  }

  const removeGroup = groupId => {
    setGroups(current => current.filter(group => group.id !== groupId))
    setSubmitError('')
  }

  const handleFiles = (groupId, fileList, append = false) => {
    const group = groups.find(item => item.id === groupId)
    const task = WORKLOADS.find(item => item.id === group?.taskId)
    if (!group || !task) return

    const selected = Array.from(fileList || [])
    const invalid = selected.find(file => task.extensions.length && !task.extensions.includes(`.${file.name.split('.').pop().toLowerCase()}`))
    if (invalid) {
      setSubmitError(`${invalid.name} is not supported by ${task.title}. Choose ${task.formats}.`)
      return
    }
    const tooLarge = selected.find(file => file.size > MAX_FILE_BYTES)
    if (tooLarge) {
      setSubmitError(`${tooLarge.name} is over the 20 MB per-file limit.`)
      return
    }
    const incoming = append
      ? [...group.files, ...selected.filter(file => !group.files.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified))]
      : selected
    const otherGroups = groups.filter(item => item.id !== groupId)
    const otherFileCount = otherGroups.reduce((total, item) => total + item.files.length, 0)
    if (otherFileCount + incoming.length + groups.filter(item => item.taskId === 'qr_generator').length > MAX_ITEMS) {
      setSubmitError(`A batch can contain up to ${MAX_ITEMS} work items.`)
      return
    }
    const otherBytes = selectedBytes - group.files.reduce((sum, file) => sum + file.size, 0)
    const newBytes = incoming.reduce((sum, file) => sum + file.size, 0)
    if (otherBytes + newBytes > MAX_BATCH_BYTES) {
      setSubmitError('A batch can contain up to 100 MB of files. Split larger selections into another batch.')
      return
    }
    setGroups(current => current.map(item => item.id === groupId ? { ...item, files: incoming } : item))
    setSubmitError('')
    setSuccess('')
  }

  const updateQr = (groupId, qrContent) => {
    setGroups(current => current.map(group => group.id === groupId ? { ...group, qrContent } : group))
    setSubmitError('')
    setSuccess('')
  }

  const removeFile = (groupId, fileIndex) => {
    setGroups(current => current.map(group => group.id === groupId
      ? { ...group, files: group.files.filter((_, index) => index !== fileIndex) }
      : group))
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setSubmitError('')
    setSuccess('')
    if (!groups.length) {
      setSubmitError('Add at least one task to your batch.')
      return
    }

    const jobs = []
    const files = []
    for (const group of groups) {
      if (group.taskId === 'qr_generator') {
        if (!group.qrContent.trim()) {
          setSubmitError('Add a link to every Link QR maker card before queueing the batch.')
          return
        }
        jobs.push({ task_type: group.taskId, qr_content: group.qrContent.trim() })
        continue
      }
      if (!group.files.length) {
        const task = WORKLOADS.find(item => item.id === group.taskId)
        setSubmitError(`Add at least one file to ${task?.title || 'each task'} before queueing the batch.`)
        return
      }
      group.files.forEach(file => {
        jobs.push({ task_type: group.taskId, file_index: files.length })
        files.push(file)
      })
    }
    if (jobs.length > MAX_ITEMS) {
      setSubmitError(`A batch can contain up to ${MAX_ITEMS} work items.`)
      return
    }

    const formData = new FormData()
    formData.append('manifest', JSON.stringify(jobs))
    files.forEach(file => formData.append('files', file))

    setSubmitting(true)
    try {
      const response = await apiFetch('/tasks/submit-batch', { method: 'POST', body: formData })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(formatApiError(result, 'The batch could not be queued.'))
      const queued = Array.isArray(result?.tasks) ? result.tasks : []
      const waiting = queued.filter(task => Number(task.queue_position || 0) > 1).length
      setSuccess(`${queued.length} work item${queued.length === 1 ? '' : 's'} queued across ${new Set(queued.map(task => task.assigned_node)).size} worker${new Set(queued.map(task => task.assigned_node)).size === 1 ? '' : 's'}${waiting ? ` · ${waiting} waiting in worker queues` : ''}.`)
      setGroups([])
      onTaskSubmitted(queued)
    } catch (error) {
      setSubmitError(error.message || 'The batch could not be queued. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className={styles.workbench} aria-labelledby="workload-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>BATCH WORKBENCH · SMART QUEUE</span>
          <h2 className={styles.title} id="workload-title">Build a batch. Let the cluster handle the queue.</h2>
          <p className={styles.sub}>Mix everyday tasks, add files in groups, and let the scheduler balance each job across available workers.</p>
        </div>
        <div className={styles.batchCounter}>
          <span className={styles.counterIcon}><Sparkles size={16} /></span>
          <span><strong>{workItemCount.toString().padStart(2, '0')}</strong><small>WORK ITEMS</small></span>
        </div>
      </header>

      <div className={styles.queueInfo}>
        <div><span className={styles.queuePulse} /><strong>One mixed batch</strong><small>Same task or different task</small></div>
        <i />
        <div><strong>First Fit · Min-Min · Max-Min</strong><small>Selected by task size and complexity</small></div>
        <i />
        <div><strong>50 items · 100 MB per batch</strong><small>20 MB maximum per file</small></div>
      </div>

      <div className={styles.catalogSection}>
        <div className={styles.sectionTitleRow}>
          <div><span className={styles.sectionEyebrow}>01 / CHOOSE YOUR TASKS</span><h3>Add one or more tasks to the batch</h3></div>
          <span className={styles.catalogHint}>Add the same task more than once to make separate file groups.</span>
        </div>
        <div className={styles.catalogGroups}>
          {GROUPS.map(group => (
            <div className={styles.catalogGroup} key={group.label}>
              <div className={styles.groupHeading}><span>{group.label}</span><small>{group.caption}</small></div>
              <div className={styles.taskGrid}>
                {WORKLOADS.filter(task => task.category === group.category).map(task => {
                  const TaskIcon = task.icon
                  return (
                    <button className={styles.taskTile} key={task.id} style={{ '--task-color': task.color }} onClick={() => addWorkload(task.id)} type="button">
                      <span className={styles.taskIcon}><TaskIcon size={18} /></span>
                      <span className={styles.tileCopy}><strong>{task.title}</strong><small>{task.description}</small><i>{task.formats}</i></span>
                      <span className={styles.addIcon}><Plus size={16} /></span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form className={styles.batchForm} onSubmit={handleSubmit}>
        <div className={styles.sectionTitleRow}>
          <div><span className={styles.sectionEyebrow}>02 / ADD INPUTS</span><h3>Prepare the queue</h3></div>
          <span className={styles.queueCount}><ShieldCheck size={14} /> Private to your workspace</span>
        </div>

        {groups.length ? (
          <div className={styles.batchGroups}>
            {groups.map((group, index) => {
              const task = WORKLOADS.find(item => item.id === group.taskId) || WORKLOADS[0]
              const TaskIcon = task.icon
              return (
                <article className={styles.batchGroup} key={group.id} style={{ '--task-color': task.color }}>
                  <div className={styles.batchGroupHead}>
                    <span className={styles.groupNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <span className={styles.taskIcon}><TaskIcon size={18} /></span>
                    <div className={styles.groupCopy}><span>{task.complexity} TASK GROUP</span><strong>{task.title}</strong><small>{task.description}</small></div>
                    <button type="button" className={styles.removeGroup} onClick={() => removeGroup(group.id)} aria-label={`Remove ${task.title} from batch`}><X size={16} /></button>
                  </div>

                  {group.taskId === 'qr_generator' ? (
                    <label className={styles.urlField}>
                      <Link2 size={16} />
                      <input type="url" value={group.qrContent} onChange={event => updateQr(group.id, event.target.value)} placeholder="https://yourwebsite.com" maxLength={2048} aria-label="Link to turn into a QR image" />
                      <span>PNG output</span>
                    </label>
                  ) : (
                    <div className={styles.fileArea}>
                      <label
                        className={styles.dropZone}
                        htmlFor={`batch-files-${group.id}`}
                        onDragOver={event => { event.preventDefault(); event.currentTarget.classList.add(styles.dragover) }}
                        onDragLeave={event => event.currentTarget.classList.remove(styles.dragover)}
                        onDrop={event => { event.preventDefault(); event.currentTarget.classList.remove(styles.dragover); handleFiles(group.id, event.dataTransfer.files, true) }}
                      >
                        <span className={styles.uploadIcon}><Upload size={17} /></span>
                        <span><strong>{group.files.length ? 'Add more files' : 'Choose multiple files'}</strong><small>{task.formats} · drag files here or browse</small></span>
                        <span className={styles.browseButton}>Browse</span>
                        <input
                          id={`batch-files-${group.id}`}
                          type="file"
                          accept={task.accept || undefined}
                          multiple
                          onChange={event => { handleFiles(group.id, event.target.files, true); event.target.value = '' }}
                          aria-label={`Choose multiple files for ${task.title}`}
                        />
                      </label>
                      {!!group.files.length && (
                        <ul className={styles.fileList}>
                          {group.files.map((file, fileIndex) => (
                            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                              <span className={styles.fileGlyph}><FileText size={14} /></span>
                              <span className={styles.fileMeta}><strong>{file.name}</strong><small>{formatBytes(file.size)} · ready to queue</small></span>
                              <button type="button" onClick={() => removeFile(group.id, fileIndex)} aria-label={`Remove ${file.name}`}><X size={14} /></button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className={styles.emptyBatch}>
            <span><Plus size={18} /></span><strong>Your queue is empty</strong><small>Add a task above, then choose one or more input files.</small>
          </div>
        )}

        {submitError && <div className={styles.errorMsg} role="alert">{submitError}</div>}
        {success && <div className={styles.successMsg} role="status"><Check size={16} /> {success}</div>}

        <footer className={styles.submitRow}>
          <div className={styles.privacyStatus}><span className={styles.secureDot} /><span><strong>{workItemCount} item{workItemCount === 1 ? '' : 's'} ready</strong><small>{formatBytes(selectedBytes)} selected · queued jobs stay visible in History</small></span></div>
          <button className={styles.submitBtn} type="submit" disabled={submitting || !groups.length}>
            {submitting ? <><span className={styles.spinner} /> Scheduling batch…</> : <>Queue {workItemCount || 'batch'} work item{workItemCount === 1 ? '' : 's'} <ArrowRight size={16} /></>}
          </button>
        </footer>
      </form>
    </section>
  )
}
