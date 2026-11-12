import { useState, useEffect } from 'react'
import { Activity, Archive, ArrowDownToLine, BadgeCheck, CircleAlert, Clock3, FileInput, Fingerprint, GitBranch, Lightbulb, Palette, Server, Sparkles, Zap } from 'lucide-react'
import { apiFetch } from '../api'
import styles from './WorkflowStudio.module.css'
import { getWorkerName } from './workerSeries'

const STEPS = [
  { id: 'upload', label: 'Upload & Validation', icon: FileInput },
  { id: 'route', label: 'Cluster Routing', icon: GitBranch },
  { id: 'exec', label: 'Node Execution', icon: Server },
  { id: 'done', label: 'Artifact Ready', icon: BadgeCheck },
]

function getStepState(stage, stepIndex) {
  // Returns: 'idle' | 'active' | 'done' | 'error'
  if (stage === 'FAILED' && stepIndex === 2) return 'error'
  if (stage === 'COMPLETED') return 'done'
  const activeStep = { UPLOADED: 0, QUEUED: 2, ROUTED: 2, RUNNING: 2 }[stage] ?? 0
  if (stepIndex < activeStep) return 'done'
  if (stepIndex === activeStep) return 'active'
  return 'idle'
}

function WorkflowStep({ step, index, stage, assignedNode }) {
  const state = getStepState(stage, index)
  return (
    <div className={`${styles.step} ${styles[state]}`}>
      <div className={styles.stepCircle}>
        {state === 'done' ? '✓' : state === 'error' ? '✗' : state === 'active' ? <span className={styles.activeDot} /> : index + 1}
      </div>
      <div className={styles.stepText}>
        <span className={styles.stepLabel}>{step.label}</span>
        <span className={styles.stepStatus}>
          {state === 'done' && index === 1 && assignedNode ? `→ ${getWorkerName(assignedNode)}` :
           state === 'done' ? 'Completed' :
           state === 'active' ? 'In Progress...' :
           state === 'error' ? 'Failed' : 'Waiting'}
        </span>
      </div>
    </div>
  )
}

export default function WorkflowStudio({ activeTask, onClear }) {
  const [preview, setPreview] = useState(null)

  const task = activeTask
  const stage = task?.status || ''
  const taskId = task?.task_id
  const taskStatus = task?.status
  const outputFile = task?.output_file
  const resultUrl = taskStatus === 'COMPLETED' && outputFile
    ? `/tasks/${encodeURIComponent(taskId)}/artifact/output`
    : ''

  // Determine workflow display stage from task status
  const workflowStage = stage === 'COMPLETED' ? 'COMPLETED' :
                        stage === 'RUNNING' ? 'RUNNING' :
                        stage === 'QUEUED' ? 'QUEUED' :
                        stage === 'FAILED' ? 'FAILED' : 'UPLOADED'

  useEffect(() => {
    if (taskStatus !== 'COMPLETED' || !outputFile) return
    const controller = new AbortController()
    let objectUrl
    apiFetch(resultUrl, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Artifact request returned ${response.status}`)
        return response.blob()
      })
      .then(async blob => {
        objectUrl = URL.createObjectURL(blob)
        const text = /\.(txt|json|csv)$/i.test(outputFile) ? await blob.text() : null
        if (controller.signal.aborted) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setPreview({ taskId, text, url: objectUrl })
      })
      .catch(error => {
        if (error.name === 'AbortError') return
        console.error('Unable to load task output artifact:', error)
        setPreview({ taskId, error: 'The output could not be loaded. Please try again.' })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [taskId, taskStatus, outputFile, resultUrl])

  const isImage = outputFile && (
    outputFile.endsWith('.png') ||
    outputFile.endsWith('.jpg') ||
    outputFile.endsWith('.jpeg') ||
    outputFile.endsWith('.webp')
  )
  const isArchive = outputFile?.endsWith('.zip')
  const downloadName = outputFile?.replaceAll('\\', '/').split('/').pop() || `${taskId}_result`

  const showWorkflow = !!task

  return (
    <section className={styles.card} id="workflow-studio">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span><Palette size={18} /></span>
          <div>
            <h2 className={styles.title}>Live Output Studio</h2>
            <p className={styles.sub}>Workflow execution & result preview</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {task && (
            <span className={`${styles.statusBadge} ${styles['badge_' + stage]}`}>
              {stage || 'IDLE'}
            </span>
          )}
          {task && <button className={styles.clearBtn} onClick={onClear} title="Clear Studio">✕</button>}
        </div>
      </div>

      {/* Workflow Stepper — always shows when a task is active */}
      {showWorkflow && (
        <div className={styles.stepper}>
          {STEPS.map((step, i) => (
            <div key={step.id} className={styles.stepWrap}>
              <WorkflowStep step={step} index={i} stage={workflowStage} assignedNode={task?.assigned_node} />
              {i < STEPS.length - 1 && (
                <div className={`${styles.connector} ${getStepState(workflowStage, i) === 'done' ? styles.connectorDone : ''}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Task metadata chip bar */}
      {task && (
        <div className={styles.metaChips}>
          <span className={styles.metaChip}><Fingerprint size={13} />{task.task_id}</span>
          <span className={styles.metaChip}><Server size={13} />{task.assigned_node ? getWorkerName(task.assigned_node) : '—'}</span>
          <span className={styles.metaChip}><Zap size={13} />{task.algorithm || 'Auto'}</span>
          {task.execution_time > 0 && <span className={styles.metaChip}><Clock3 size={13} />{task.execution_time.toFixed(3)}s</span>}
        </div>
      )}

      {/* Main content area */}
      <div className={styles.studioContent}>
        {!task && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderOrb} />
            <div className={styles.placeholderIcon}><Sparkles size={22} /></div>
            <h3>No Active Task</h3>
            <p>Submit a workload from the Dispatcher panel. Your generated output will render here with download capability.</p>
            <div className={styles.placeholderSteps}>
              {STEPS.map(s => (
                <div key={s.id} className={styles.placeholderStep}>
                  <s.icon size={13} />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {task && stage === 'SUBMITTED' && (
          <div className={styles.loaderBox}>
            <div className={styles.loaderRing}>
              <div className={styles.spinnerOuter} />
              <div className={styles.spinnerInner} />
              <span className={styles.loaderIcon}><Activity size={22} /></span>
            </div>
            <h3>Preparing workload</h3>
            <p>Task <strong>{task.task_id}</strong> is being validated and routed to the cluster.</p>
          </div>
        )}

        {task && stage === 'QUEUED' && (
          <div className={styles.loaderBox}>
            <div className={styles.loaderRing}>
              <div className={styles.spinnerOuter} />
              <div className={styles.spinnerInner} />
              <span className={styles.loaderIcon}><Clock3 size={22} /></span>
            </div>
            <h3>Queued for {task.assigned_node ? getWorkerName(task.assigned_node) : 'a worker'}</h3>
            <p>Task <strong>{task.task_id}</strong> is ready and waiting for execution.</p>
          </div>
        )}

        {task && stage === 'RUNNING' && (
          <div className={styles.loaderBox}>
            <div className={styles.loaderRing}>
              <div className={styles.spinnerOuter} />
              <div className={styles.spinnerInner} />
              <span className={styles.loaderIcon}><Activity size={22} /></span>
            </div>
            <h3>Executing on {task.assigned_node ? getWorkerName(task.assigned_node) : 'a cluster worker'}</h3>
            <p>Task <strong>{task.task_id}</strong> is running with the <strong>{task.algorithm}</strong> strategy.</p>
            <div className={styles.loaderDots}>
              <span /><span /><span />
            </div>
          </div>
        )}

        {task && stage === 'COMPLETED' && task.output_file && (
          <div className={styles.resultBox}>
            {isImage ? (
              <div className={styles.imageResult}>
                {preview?.taskId === taskId && preview.url
                  ? <img src={preview.url} alt="Task Result" className={styles.resultImage} />
                  : <p>{preview?.taskId === taskId ? preview.error || 'Loading output…' : 'Loading output…'}</p>}
              </div>
            ) : isArchive ? (
              <div className={styles.archiveResult}>
                <span><Archive size={28} /></span>
                <strong>Your organized archive is ready.</strong>
                <p>Download the ZIP to browse files sorted into Images, Documents, Sheets, Media, Code, and Other.</p>
              </div>
            ) : (
              <div className={styles.textResult}>
                <pre className={styles.preCode}>{preview?.taskId === taskId ? preview.error || preview.text || 'The output file is empty.' : 'Preparing preview…'}</pre>
              </div>
            )}
            <div className={styles.downloadBar}>
              <div className={styles.downloadInfo}>
                <span className={styles.resultReady}><BadgeCheck size={15} /> Processing complete</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Exec: {task.execution_time?.toFixed(3)}s · Worker: {task.assigned_node ? getWorkerName(task.assigned_node) : '—'}
                </span>
              </div>
              <a
                href={preview?.taskId === taskId ? preview.url : undefined}
                download={downloadName}
                className={styles.downloadBtn}
                aria-disabled={preview?.taskId !== taskId || !preview.url}
              >
                <ArrowDownToLine size={15} /> Download output
              </a>
            </div>
          </div>
        )}

        {task && stage === 'FAILED' && (
          <div className={styles.failedBox}>
            <div className={styles.failedIcon}><CircleAlert size={38} /></div>
            <h3>Execution Failed</h3>
            <div className={styles.errorDetail}>
              <label>Diagnostic Message</label>
              <pre>{task.error_message || 'An unexpected error occurred during execution.'}</pre>
            </div>
            <div className={styles.remediation}>
              <strong><Lightbulb size={14} /> Recommended action</strong>
              <p>Verify your input file format matches the task requirements and resubmit.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
