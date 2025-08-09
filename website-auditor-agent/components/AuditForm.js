// >>> file: components/AuditForm.js
import { useState } from 'react'

export default function AuditForm({ onSubmit }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function validateUrl(v) {
    try {
      const u = new URL(v)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch (e) {
      return false
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!value.trim()) {
      setError('Please enter a URL.')
      return
    }
    if (!validateUrl(value.trim())) {
      setError('Please enter a valid URL including http:// or https://')
      return
    }
    setBusy(true)
    try {
      await onSubmit(value.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="audit-form" onSubmit={handleSubmit} aria-label="Website audit form">
      <label htmlFor="url" className="sr-only">Website URL</label>
      <div className="input-row">
        <input
          id="url"
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'url-error' : undefined}
          className="input"
        />
        <button type="submit" className="btn" disabled={busy} aria-disabled={busy}>
          {busy ? 'Running…' : 'Run Audit'}
        </button>
      </div>
      {error && <div id="url-error" className="field-error" role="alert">{error}</div>}

      <style jsx>{`
        .audit-form { margin-top: .5rem; }
        .input-row { display:flex; gap:.5rem; }
        .input { flex:1; padding:.6rem .75rem; border-radius:8px; border:1px solid var(--edge); box-shadow: var(--inset); }
        .input:focus { outline: 3px solid rgba(79,70,229,0.12); border-color: #4f46e5; }
        .btn { padding: .55rem .9rem; border-radius:8px; background: linear-gradient(90deg,#4f46e5,#06b6d4); color:white; border:none; font-weight:600; cursor:pointer; }
        .btn[disabled] { opacity:.7; cursor:default; }
        .field-error { margin-top:.5rem; color:#b91c1c; font-size:.95rem; }
        @media (max-width:600px) { .input-row { flex-direction:column-reverse; } .btn{width:100%} }
      `}</style>
    </form>
  )
}
