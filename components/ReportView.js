// >>> file: components/ReportView.js
import styles from '../styles/ReportView.module.css'
import { useState } from 'react'

// Small score badge component
function ScoreBadge({ score }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)))
  let tone = 'good'
  if (pct < 60) tone = 'bad'
  else if (pct < 80) tone = 'warn'
  return <span className={`${styles.badge} ${styles[tone]}`} aria-hidden="true">{pct}</span>
}

export default function ReportView({ report, onBack }) {
  return (
    <div className={styles.reportRoot}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Audit report — <span className={styles.url}>{report.meta?.url}</span></h2>
          <div className={styles.meta}>Generated: {new Date(report.meta?.generatedAt).toLocaleString()}</div>
        </div>
        <div className={styles.actions}>
          <button className="btn ghost" onClick={onBack}>Run another</button>
        </div>
      </div>

      <div className={styles.grid}>
        <CollapsibleCard id="seo" title="SEO" score={report.seo?.score}>
          <FindingsList findings={report.seo?.findings} />
        </CollapsibleCard>

        <CollapsibleCard id="perf" title="Performance" score={report.performance?.score}>
          <FindingsList findings={report.performance?.findings} />
        </CollapsibleCard>

        <CollapsibleCard id="sec" title="Security" score={report.security?.score}>
          <FindingsList findings={report.security?.findings} />
        </CollapsibleCard>
      </div>
    </div>
  )
}

function CollapsibleCard({ id, title, score, children }) {
  const [open, setOpen] = useState(true)
  function toggle() { setOpen(v => !v) }

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <button
            className={styles.collapseBtn}
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            onClick={toggle}
            onKeyDown={(e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
          >
            <span className={styles.titleText}>{title}</span>
            <ChevronIcon open={open} />
          </button>
          <div className={styles.scoreWrap}><ScoreBadge score={score || 0} /></div>
        </div>
      </div>

      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-label`} className={styles.cardBody} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

function FindingsList({ findings = [] }) {
  if (!findings.length) return <p className={styles.empty}>No findings — looks good!</p>
  return (
    <ul className={styles.findings}>
      {findings.map((f, i) => (
        <li key={i} className={styles.finding}>
          <strong>{f.title}</strong>
          <p className={styles.action}>{f.action}</p>
        </li>
      ))}
    </ul>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg className={styles.chev} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{transform: open ? 'rotate(0deg)' : 'rotate(-180deg)', transformOrigin:'center'}}/>
    </svg>
  )
}

