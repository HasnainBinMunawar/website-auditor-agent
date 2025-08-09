// >>> file: components/ChatAnalyst.js
import { useState } from 'react'

export default function ChatAnalyst({ report, siteIdProp }) {
  // report: optional report object passed by parent
  // siteIdProp: optional siteId string. If not provided, attempt to read from report.meta.siteId or report.meta.url.
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState(null)

  const siteId = siteIdProp || (report?.meta?.siteId || report?.meta?.url || '').replace(/^https?:\/\//,'')

  async function submitQuery(e) {
    e && e.preventDefault()
    if (!siteId) { setError('Missing siteId'); return }
    if (!query || query.length < 3) { setError('Enter a short question'); return }
    setError(null)
    setLoading(true)
    setAnswer(null)
    try {
      const res = await fetch('/api/chat-analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, query, limit: 1200 })
      })
      if (!res.ok) {
        const body = await res.json().catch(()=>({ error: 'Server error' }))
        setError(body.error || `Server returned ${res.status}`)
        setLoading(false)
        return
      }
      const data = await res.json()
      setAnswer(data)
    } catch (err) {
      setError('Network error or API unavailable')
    } finally { setLoading(false) }
  }

  return (
    <section className="chat-analyst" aria-label="Chat Analyst">
      <h3>Chat Analyst</h3>
      <p className="muted">Ask follow-up questions about this audit. Answers will cite the audit JSON.</p>

      <form onSubmit={submitQuery} style={{display:'flex', gap:8, marginBottom:8}}>
        <input
          aria-label="Question"
          placeholder="e.g. Which pages lost mobile performance?"
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          style={{flex:1, padding:'8px 10px'}}
        />
        <button type="submit" disabled={loading} style={{padding:'8px 12px'}}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {error && <div role="alert" style={{color:'#7f1d1d', marginBottom:8}}>{error}</div>}

      {answer && (
        <div className="chat-result" style={{border:'1px solid #e6e7eb', padding:12, borderRadius:8}}>
          <div style={{whiteSpace:'pre-wrap', marginBottom:8}}><strong>Answer:</strong> {answer.answer}</div>

          {Array.isArray(answer.citations) && answer.citations.length > 0 && (
            <div style={{marginBottom:8}}>
              <strong>Evidence:</strong>
              <ul>
                {answer.citations.map((c,i)=>(
                  <li key={i}><code style={{background:'#f3f4f6', padding:'2px 6px', borderRadius:4}}>{c.section}</code> — {c.excerpt}</li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(answer.suggestedActions) && answer.suggestedActions.length > 0 && (
            <div style={{marginBottom:8}}>
              <strong>Next steps:</strong>
              <ol>
                {answer.suggestedActions.map((s,i)=><li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          <div><strong>Urgency:</strong> {answer.urgency}</div>
        </div>
      )}

      <style jsx>{`
        .muted { color: #6b7280; margin: 0 0 8px 0; font-size: .95rem }
        @media (max-width:900px) { form { flex-direction: column } }
      `}</style>
    </section>
  )
}
