import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, File, FileImage, Link2, LoaderCircle, ShieldCheck, UploadCloud, X } from 'lucide-react'
import { api } from '../lib/api'
import type { TaskSpec, Workload } from '../types'

type Props = { task: TaskSpec; onClose: () => void; onSubmitted: (workload: Workload) => void }
export default function TaskComposer({ task, onClose, onSubmitted }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [maxEdge, setMaxEdge] = useState(1800)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [finished, setFinished] = useState(false)
  const [submitted, setSubmitted] = useState<Workload | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function choose(candidate?: File) {
    if (!candidate) return
    setError('')
    if (candidate.size > 20 * 1024 * 1024) { setError('Choose a file smaller than 20 MB.'); return }
    setFile(candidate)
  }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) { choose(event.target.files?.[0]) }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragOver(false); choose(event.dataTransfer.files[0]) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      let workload = await api.submit(task.id, file ?? undefined, url.trim(), maxEdge)
      setSubmitted(workload); setFinished(true); onSubmitted(workload)
      const hasPreview = task.id === 'link-qr' || task.id === 'image-optimize'
      if (hasPreview) setPreviewLoading(true)
      for (let attempt = 0; attempt < 16; attempt++) {
        if (attempt) await new Promise(resolve => window.setTimeout(resolve, 300))
        workload = await api.workload(workload.id)
        setSubmitted(workload)
        if (workload.status === 'completed') {
          if (hasPreview) setPreviewUrl(URL.createObjectURL(await api.artifact(workload.id)))
          break
        }
        if (workload.status === 'failed') { setError(workload.error_message || 'This workload could not be completed.'); break }
      }
      if (hasPreview) setPreviewLoading(false)
    }
    catch (reason) { setPreviewLoading(false); setError(reason instanceof Error ? reason.message : 'Could not start this workload.') }
    finally { setBusy(false) }
  }
  async function downloadResult() {
    if (!submitted) return
    try { const blob = await api.artifact(submitted.id); const objectUrl = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = submitted.artifact_name || 'cloudcluster-result'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not download this result.') }
  }
  function displayResultValue(value: unknown) {
    if (Array.isArray(value)) return value.map(String).join(', ')
    if (typeof value === 'object' && value !== null) return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(' · ')
    return String(value)
  }

  const formatBytes = (size: number) => size < 1024 ? '< 1 KB' : size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <header className="modal-head"><div><div className="eyebrow"><span className="eyebrow-dot"/>{task.category.toUpperCase()} WORKLOAD · LEVEL {task.complexity}</div><h2 id="task-modal-title">{finished ? submitted?.status === 'completed' ? 'Run complete.' : 'On its way.' : `Run ${task.title}`}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      {finished ? <div className="submit-success"><div className="success-orbit"><Check size={27}/></div><h3>{submitted?.status === 'failed' ? 'This run needs another try.' : task.id === 'link-qr' && submitted?.status === 'completed' ? 'Your QR is ready.' : submitted?.status === 'completed' ? 'Your result is ready.' : 'Your work is in motion.'}</h3><p>{task.id === 'link-qr' ? 'Preview the generated code, then save the PNG to your device.' : submitted?.status === 'completed' ? 'The cluster finished processing. Your output is ready to download.' : 'We added this run to your workload history. You can follow its progress there.'}</p>{['link-qr', 'image-optimize'].includes(task.id) && <div className="qr-preview-frame">{previewUrl ? <img className={task.id === 'link-qr' ? 'qr-image-preview' : 'image-output-preview'} src={previewUrl} alt={task.id === 'link-qr' ? 'Generated QR code preview' : 'Optimized image preview'}/> : <div className="qr-preview-loading">{previewLoading ? <><LoaderCircle className="spin" size={20}/>Preparing your preview…</> : <span>Preview will appear here.</span>}</div>}</div>}{submitted?.status === 'completed' && <div className="result-summary">{Object.entries(submitted.result).filter(([key]) => key !== 'mime_type').slice(0, 4).map(([key, value]) => <span key={key}><b>{displayResultValue(value)}</b><small>{key.replaceAll('_', ' ')}</small></span>)}</div>}{submitted?.status === 'completed' && <button className="button button-primary" onClick={() => void downloadResult()}><ArrowDownToLine size={16}/> Download {task.id === 'link-qr' ? 'PNG image' : 'result file'}</button>}<button className="button button-quiet success-close" onClick={onClose}>{submitted?.status === 'completed' ? 'Done' : 'View workload history'} <ArrowUpRight size={16}/></button>{error && <div className="form-error success-error" role="alert">{error}</div>}</div> : <form onSubmit={submit}>
        <p className="modal-description">{task.description} Your result stays private to this workspace.</p>
        {task.input === 'url' ? <label className="field-label" htmlFor="qr-url">Web address</label> : <label className="field-label">Choose an input file</label>}
        {task.input === 'url' ? <div className="url-field"><Link2 size={17}/><input id="qr-url" type="url" placeholder="https://example.com/your-page" value={url} onChange={event => setUrl(event.target.value)} required/><span>HTTP / HTTPS</span></div> : <>
          <input ref={inputRef} className="visually-hidden" type="file" accept={task.accept} onChange={onFileChange}/>
          <div className={`dropzone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={event => { event.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}>
            {file ? <><div className="upload-icon upload-icon--ready">{file.type.startsWith('image/') ? <FileImage size={21}/> : <File size={21}/>}</div><div className="file-info"><b>{file.name}</b><span>{formatBytes(file.size)} · Ready to process</span></div><button type="button" className="remove-file" aria-label="Remove file" onClick={event => { event.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = '' }}><X size={15}/></button></> : <><div className="upload-icon"><UploadCloud size={22}/></div><b>Drop your file here</b><span>or <u>browse to upload</u></span><small>{task.accept.replaceAll(',', ' · ') || 'Supported file'} · up to 20 MB</small></>}
          </div>
          {task.id === 'image-optimize' && <div className="option-slider"><div><span>Maximum image width</span><b>{maxEdge.toLocaleString()} px</b></div><input aria-label="Maximum image edge" type="range" min="512" max="3200" step="128" value={maxEdge} onChange={event => setMaxEdge(Number(event.target.value))}/><small>Images are resized proportionally and saved as WebP.</small></div>}
        </>}
        {task.id === 'link-qr' && <div className="qr-note"><div className="qr-sample" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><span><b>Your link, scan-ready.</b><small>We’ll generate a high-resolution PNG QR image you can download or share.</small></span></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions"><span><ShieldCheck size={14}/> Private to your account</span><button className="button button-primary" disabled={busy || (task.input === 'file' && !file)}>{busy ? <><LoaderCircle className="spin" size={17}/> Sending to cluster</> : <>Start workload <ArrowUpRight size={16}/></>}</button></div>
      </form>}
    </section>
  </div>
}
