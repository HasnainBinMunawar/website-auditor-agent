// >>> file: components/PDFReport.js
import { useState } from 'react'

export default function PDFReport({ report, siteIdProp }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const siteId = siteIdProp || (report?.meta?.siteId || report?.meta?.url || '').replace(/^https?:\/\//,'')

  async function downloadPdf() {
    if (!siteId) { setError('Missing siteId'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/generate-report-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId })
      })
      if (!res.ok) {
        const body = await res.json().catch(()=>({error:'Server error'}))
        setError(body.error || `Server returned ${res.status}`)
        setLoading(false)
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${siteId}-audit.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Network or server error')
    } finally { setLoading(false) }
  }

  return (
    <div className="pdf-report" style={{marginTop:12}}>
      <button onClick={downloadPdf} disabled={loading} style={{padding:'8px 12px'}}>
        {loading ? 'Generating PDF…' : 'Download one-page PDF'}
      </button>
      {error && <div role="alert" style={{color:'#7f1d1d', marginTop:8}}>{error}</div>}
    </div>
  )
}
