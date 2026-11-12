import { LogOut, Moon, Sun } from 'lucide-react'
import styles from './Navbar.module.css'

export default function Navbar({ user, onLogout, theme, toggleTheme, onlineNodes, totalNodes, clusterState }) {
  const displayName = user?.name || user?.username || 'Workspace'
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean)
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts.at(-1)[0]}`.toUpperCase()
    : displayName.substring(0, 2).toUpperCase()
  const statusLabel = clusterState === 'connecting' ? 'CONNECTING TO FLEET'
    : clusterState === 'unavailable' ? 'TELEMETRY UNAVAILABLE'
      : clusterState === 'offline' ? 'NO WORKERS ONLINE'
        : clusterState === 'degraded' ? `${onlineNodes} OF ${totalNodes} WORKERS ONLINE`
          : 'ALL SYSTEMS OPERATIONAL'

  return (
    <header className={styles.navbar}>
      <a className={styles.brand} href="#top" aria-label="CloudCluster home">
        <img className={styles.brandIcon} src="/cloudcluster-mark.svg" alt="" />
        <span className={styles.brandText}>
          <span className={styles.brandName}>CloudCluster</span>
          <span className={styles.brandSub}>WORKLOAD CONTROL PLANE</span>
        </span>
      </a>

      <div className={styles.centerStatus} aria-live="polite">
        <span className={`${styles.statusChip} ${styles[`status${clusterState}`]}`} role="status" aria-live="polite">
          <span className={`${styles.pulseDot} ${styles[`dot${clusterState}`]}`} />
          {statusLabel}
        </span>
      </div>

      <div className={styles.navRight}>
        <button className={styles.themeBtn} onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <div className={styles.userBadge}>
          <span className={styles.avatar}>{initials}</span>
          <span className={styles.userMeta}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userRole}>{user?.role || 'Workspace'}</span>
          </span>
          <button className={styles.logoutBtn} onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={15} /></button>
        </div>
      </div>
    </header>
  )
}
