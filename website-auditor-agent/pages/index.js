// >>> file: pages/index.js
import { useState } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AuditForm from '../components/AuditForm'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ReportView from '../components/ReportView'
import ChatAnalyst from '../components/ChatAnalyst'
import PDFReport from '../components/PDFReport'

export default function Home() {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [report, setReport] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  async function runAudit(url) {
    setStatus('running')
    setErrorMessage(null)
    setReport(null)

    try {
      const res = await fetch('/api/run-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      if (!res.ok) {
        // fallback: try to parse error body if available, then use sample result (graceful)
        let msg = `Server returned ${res.status}`
        try {
          const body = await res.json()
          if (body && body.error) msg = body.error
        } catch (e) {}
        // No backend? use a sample result so UI can be inspected locally.
        setErrorMessage(`${msg} — showing sample report (no backend).`)
        setReport(sampleReport(url))
        setStatus('done')
        return
      }

      const data = await res.json()
      setReport(data)
      setStatus('done')
    } catch (err) {
      // network error or no server running
      setErrorMessage('Network error or API not available — showing sample report.')
      setReport(sampleReport(url))
      setStatus('done')
    }
  }

  function reset() {
    setStatus('idle')
    setReport(null)
    setErrorMessage(null)
  }

  return (
    <div className="page-root">
      <Header />
      <main className="container" role="main">
        <section className="hero">
          <div className="hero-left">
            <h1 className="title">Website Auditor Agent</h1>
            <p className="lead">
              Paste a URL and run a lightweight, actionable audit for SEO, Performance and Security.
              Results include prioritized fixes and a friendly scorecard.
            </p>

            {status === 'idle' && (
              <AuditForm onSubmit={runAudit} />
            )}

            {status === 'running' && (
              <>
                <LoadingSkeleton />
                <div className="muted-note" aria-live="polite">Running checks — this typically takes a few seconds.</div>
              </>
            )}

            {status === 'done' && report && (
              <>
                {errorMessage && <div className="alert warning" role="alert">{errorMessage}</div>}

                {/* Main report viewer */}
                <ReportView report={report} onBack={reset} />

                {/* NEW FEATURES: Chat Analyst (interactive Q&A) and PDF download */}
                <div className="extras" aria-label="Report extras">
                  <ChatAnalyst report={report} />
                  <PDFReport report={report} />
                </div>
              </>
            )}

            {status === 'done' && !report && (
              <div className="alert error" role="alert">No report available.</div>
            )}

          </div>

          <aside className="hero-right" aria-hidden="false">
            <div className="card" role="region" aria-labelledby="how-it-works-title">
              <h3 id="how-it-works-title">How it works</h3>
              <ol>
                <li>Paste the site URL.</li>
                <li>Run the audit — we request <code>/api/run-audit</code> server-side.</li>
                <li>Receive an actionable report split into SEO, Performance, Security.</li>
              </ol>
            </div>

            <div className="card" role="region" aria-labelledby="accessibility-title">
              <h3 id="accessibility-title">Accessibility</h3>
              <p>Keyboard-friendly, high contrast badges, and aria attributes for assistive tech.</p>
            </div>
          </aside>
        </section>
      </main>
      <Footer />
      <style jsx>{`
        .container { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
        .hero { display: grid; grid-template-columns: 1fr 320px; gap: 1.25rem; align-items: start; }
        .title { font-size: 2rem; margin: 0 0 .5rem; }
        .lead { margin: 0 0 1rem; color: #475569; max-width: 56ch; }
        .hero-right .card { margin-bottom: 1rem; padding: 1rem; border-radius: 10px; background: var(--card-bg); box-shadow: var(--card-shadow); }
        .muted-note { margin-top: .5rem; color: #6b7280; font-size: .9rem; }
        .alert { margin-top: 1rem; padding: .75rem 1rem; border-radius: 8px; }
        .alert.warning { background:#fff7ed; color:#92400e; border: 1px solid #ffd8a8; }
        .alert.error { background:#ffeded; color:#7f1d1d; border: 1px solid #fca5a5; }
        .extras { margin-top: 1.25rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items:start; }
        @media (max-width: 900px) {
          .hero { grid-template-columns: 1fr; }
          .hero-right { order: 2; }
          .extras { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

// Sample report used when backend not available (keeps the frontend demoable)
function sampleReport(url = 'https://example.com') {
  return {
    meta: { url, generatedAt: new Date().toISOString(), siteId: url.replace(/^https?:\/\//,'').replace(/\/$/,'') },
    seo: {
      score: 78,
      findings: [
        { title: 'Missing meta description', action: 'Add a unique meta description (50–160 chars).' },
        { title: 'Low heading structure', action: 'Ensure a single H1 and use H2/H3 for sections.' },
      ]
    },
    performance: {
      score: 64,
      findings: [
        { title: 'Large images', action: 'Compress images and use modern formats (WebP/AVIF).' },
        { title: 'Long TTFB', action: 'Review server response time and caching strategy.' },
      ]
    },
    security: {
      score: 86,
      findings: [
        { title: 'Missing Content-Security-Policy', action: 'Add a tight CSP header to reduce XSS risk.' },
        { title: 'Missing HSTS', action: 'Enable HSTS to enforce HTTPS.' },
      ]
    }
  }
}
