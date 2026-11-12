import { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { formatApiError } from '../apiErrors'
import ClusterOrbit from './ClusterOrbit'
import styles from './AuthPage.module.css'

export default function AuthPage({ onLogin }) {
  const [tab, setTab] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState({})

  useEffect(() => {
    const controller = new AbortController()
    fetch('/nodes/status', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : {})
      .then(data => { if (!controller.signal.aborted) setNodes(data) })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const changeTab = nextTab => {
    setTab(nextTab)
    setError('')
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError('Enter your email address and password to continue.'); return }
    if (tab === 'register' && !name.trim()) { setError('Enter your name to set up your workspace.'); return }
    if (tab === 'register' && password.length < 12) { setError('Use 12 or more characters for a stronger passphrase.'); return }

    setLoading(true)
    try {
      const body = tab === 'login'
        ? { email: email.trim().toLowerCase(), password }
        : { name: name.trim(), email: email.trim().toLowerCase(), password }
      const response = await fetch(tab === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(formatApiError(result, 'We couldn’t verify those details. Try again.'))
      }
      if (!result?.user || !result?.token) {
        throw new Error('The server could not start your secure session. Please try again.')
      }
      onLogin(result.user, result.token)
    } catch (submitError) {
      const isNetworkError = submitError instanceof TypeError
      setError(isNetworkError
        ? 'CloudCluster could not reach the sign-in service. Check that the server is running, then try again.'
        : submitError.message || 'We couldn’t verify those details. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page} data-theme="dark">
      <div className={styles.layout}>
        <aside className={styles.brandPanel}>
          <a className={styles.brand} href="/" aria-label="CloudCluster home">
            <img className={styles.brandMark} src="/cloudcluster-mark.svg" alt="" />
            <span><strong>CloudCluster</strong><small>WORKLOAD CONTROL PLANE</small></span>
          </a>

          <div className={styles.brandContent}>
            <span className={styles.overline}><Sparkles size={13} /> YOUR EVERYDAY WORK, IN MOTION</span>
            <h1>Make busywork<br /><em>disappear.</em></h1>
            <p>Six useful tools. One quiet, powerful cluster. Send the small jobs out and get back to the work that matters.</p>
            <div className={styles.benefits}>
              <div><span><Zap size={16} /></span><p><strong>One-click workflows</strong><small>Useful jobs, ready when you are.</small></p></div>
              <div><span><ShieldCheck size={16} /></span><p><strong>Your own private workspace</strong><small>Only you can see your files and results.</small></p></div>
            </div>
          </div>

          <div className={styles.clusterBlock}>
            <ClusterOrbit nodes={nodes} variant="auth" />
            <div className={styles.clusterStats}>
              <span><strong>{String(Object.keys(nodes).length || 5).padStart(2, '0')}</strong><small>WORKERS</small></span>
              <span><strong>03</strong><small>REGIONS</small></span>
              <span><strong>24/7</strong><small>READY</small></span>
            </div>
          </div>

          <footer className={styles.brandFooter}><span>CloudCluster · Private by design</span><span>Secure workspace access</span></footer>
        </aside>

        <section className={styles.formPanel} aria-labelledby="auth-title">
          <div className={styles.formContainer}>
            <div className={styles.formIntro}>
              <span className={styles.formEyebrow}><i /> {tab === 'login' ? 'WELCOME BACK' : 'YOUR WORKSPACE STARTS HERE'}</span>
              <h2 id="auth-title">{tab === 'login' ? 'Good to see you.' : 'Let’s get you set up.'}</h2>
              <p>{tab === 'login' ? 'Sign in and pick up where you left off.' : 'Create your private CloudCluster workspace.'}</p>
            </div>

            <div className={styles.tabs} role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={tab === 'login'} className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`} onClick={() => changeTab('login')}>Sign in</button>
              <button type="button" role="tab" aria-selected={tab === 'register'} className={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`} onClick={() => changeTab('register')}>Create account</button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              {tab === 'register' && (
                <div className={styles.field}>
                  <label htmlFor="auth-name">Your name</label>
                  <div className={styles.inputShell}>
                    <input id="auth-name" type="text" value={name} onChange={event => setName(event.target.value)} placeholder="How should we address you?" autoComplete="name" maxLength={100} required />
                    <span aria-hidden="true">✦</span>
                  </div>
                </div>
              )}

              <div className={styles.field}>
                <label htmlFor="auth-email">Email address</label>
                <div className={styles.inputShell}>
                  <input id="auth-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" maxLength={128} required />
                  <span aria-hidden="true">@</span>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="auth-password">Password</label>
                <div className={styles.inputShell}>
                  <input id="auth-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={tab === 'login' ? 'Enter your password' : 'At least 12 characters'} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} maxLength={128} required />
                  <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
                {tab === 'register' && <small className={styles.passwordHint}>Use 12 or more characters for a stronger passphrase.</small>}
              </div>

              {error && <div className={styles.messageError} role="alert">{error}</div>}

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? <><span className={styles.spinner} /> {tab === 'login' ? 'Signing in…' : 'Creating workspace…'}</> : <>{tab === 'login' ? 'Sign in to workspace' : 'Create workspace'} <ArrowRight size={17} /></>}
              </button>
              <p className={styles.secureHint}><LockKeyhole size={13} /> {tab === 'login' ? 'Protected with secure, expiring sessions.' : 'Your workspace and files stay private.'}</p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
