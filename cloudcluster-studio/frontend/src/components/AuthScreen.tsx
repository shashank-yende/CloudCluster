import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useAuth } from '../useAuth'
import ClusterMap from './ClusterMap'
import type { Worker } from '../types'

const demoWorkers: Worker[] = [
  { id: 'wk-01', name: 'Northstar', region: 'us-east-1', cpu: 16, memory: 64, accent: 'violet', status: 'online', active_jobs: 1, utilization: 42, queue_depth: 0 },
  { id: 'wk-02', name: 'Daybreak', region: 'us-east-1', cpu: 12, memory: 48, accent: 'blue', status: 'online', active_jobs: 0, utilization: 31, queue_depth: 0 },
  { id: 'wk-03', name: 'Juniper', region: 'ap-south-1', cpu: 8, memory: 32, accent: 'mint', status: 'busy', active_jobs: 2, utilization: 72, queue_depth: 0 },
  { id: 'wk-04', name: 'Solstice', region: 'us-west-2', cpu: 16, memory: 64, accent: 'orange', status: 'online', active_jobs: 0, utilization: 26, queue_depth: 0 },
  { id: 'wk-05', name: 'Bluebell', region: 'ap-south-1', cpu: 8, memory: 32, accent: 'rose', status: 'online', active_jobs: 0, utilization: 37, queue_depth: 0 },
]

export default function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    try { if (mode === 'signup') await signUp(name, email, password); else await signIn(email, password) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  return <main className="auth-screen">
    <section className="auth-story">
      <div className="auth-story-glow" />
      <div className="brand brand--light"><div className="brand-mark"><span>cc</span><i /></div><span className="brand-copy"><b>CloudCluster</b><small>WORKLOAD CONTROL PLANE</small></span></div>
      <div className="story-copy"><div className="eyebrow eyebrow--light"><Sparkles size={13}/> YOUR EVERYDAY WORK, IN MOTION</div><h1>Make busywork<br/><em>disappear.</em></h1><p>Six useful tools. One quiet, powerful cluster. Send the small jobs out and get back to the work that matters.</p>
        <div className="story-points"><span><i><Zap size={15}/></i><b>One-click workflows</b><small>Useful jobs, ready when you are.</small></span><span><i><ShieldCheck size={15}/></i><b>Your own private workspace</b><small>Only you can see your files and results.</small></span></div>
      </div>
      <div className="auth-map-card"><div className="auth-map-head"><span>CLUSTER IN MOTION</span><span className="live-pill"><i/> ALL SYSTEMS NOMINAL</span></div><ClusterMap workers={demoWorkers} compact/><div className="auth-map-bottom"><span><b>05</b> WORKERS</span><span><b>03</b> REGIONS</span><span><b>24/7</b> READY</span></div></div>
      <div className="auth-story-foot"><span>© 2026 CLOUDCLUSTER STUDIO</span><span>MADE FOR THE EVERYDAY</span></div>
    </section>
    <section className="auth-panel"><div className="auth-mobile-brand brand"><div className="brand-mark"><span>cc</span><i/></div><span className="brand-copy"><b>CloudCluster</b><small>WORKLOAD CONTROL PLANE</small></span></div>
      <div className="auth-form-wrap"><div className="auth-welcome"><div className="eyebrow"><span className="eyebrow-dot"/>{mode === 'signin' ? 'WELCOME BACK' : 'YOUR WORKSPACE STARTS HERE'}</div><h2>{mode === 'signin' ? 'Good to see you.' : 'Let’s get you set up.'}</h2><p>{mode === 'signin' ? 'Sign in and pick up where you left off.' : 'Create your private CloudCluster workspace.'}</p></div>
        <div className="auth-toggle"><button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError('') }}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>Create account</button></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <label>Your name<div className="input-wrap"><input autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="How should we address you?" minLength={2} maxLength={80} required/><span className="input-icon">✳</span></div></label>}
          <label>Email address<div className="input-wrap"><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" required/><span className="input-icon">@</span></div></label>
          <label>Password<div className="input-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'At least 12 characters' : 'Enter your password'} minLength={mode === 'signup' ? 12 : 1} maxLength={128} required/><button type="button" className="reveal-password" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{mode === 'signup' && <small className="field-hint">Use 12 or more characters for a stronger passphrase.</small>}</label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" disabled={busy}>{busy ? <span className="spinner"/> : <>{mode === 'signin' ? 'Sign in to workspace' : 'Create workspace'}<ArrowRight size={17}/></>}</button>
        </form>
        <div className="auth-secure"><LockKeyhole size={14}/><span>Protected with secure, expiring sessions</span></div>
      </div><div className="auth-panel-foot"><span>By continuing, you agree to our <button>Terms</button> and <button>Privacy policy</button>.</span><span>NEED A HAND? <a href="mailto:support@cloudcluster.local">CONTACT SUPPORT</a></span></div>
    </section>
  </main>
}
