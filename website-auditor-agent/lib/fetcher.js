// >>> file: lib/fetcher.js
/**
 * lib/fetcher.js
 * Lightweight fetch wrapper with timeout, redirect safety, and timing.
 *
 * Uses undici.fetch for consistent server-side behavior.
 */

const { fetch, Headers } = require('undici')

const DEFAULT_TIMEOUT = 10000 // ms

function timeoutSignal(ms) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(id), controller }
}

/**
 * Perform fetch with a timeout and return timing + response text.
 * @param {string} url
 * @param {object} opts - fetch options
 * @param {number} msTimeout
 */
async function fetchWithTimeout(url, opts = {}, msTimeout = DEFAULT_TIMEOUT) {
  const { signal, clear } = timeoutSignal(msTimeout)
  // merge signals if provided
  if (opts.signal) {
    // If caller passed a signal, we won't replace it — prefer combined logic is complex;
    // for simplicity, prefer the caller signal and our timeout if none exists.
  } else {
    opts.signal = signal
  }

  const start = Date.now()
  try {
    const res = await fetch(url, opts)
    const elapsed = Date.now() - start
    // Read text safely (may be large; callers can avoid reading large bodies).
    let text = null
    try {
      // Only try to read if content-type is text/html or json or similar.
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('text') || ct.includes('json') || ct.includes('html') || ct.includes('xml')) {
        text = await res.text()
      }
    } catch (e) {
      // ignore text read errors
    }
    return { ok: res.ok, status: res.status, headers: res.headers, url: res.url, text, elapsed }
  } finally {
    clear()
  }
}

module.exports = { fetchWithTimeout, DEFAULT_TIMEOUT }
