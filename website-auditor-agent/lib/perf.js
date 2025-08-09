// >>> file: lib/perf.js
/**
 * lib/perf.js
 * Performance checks using Google PageSpeed Insights API plus simple server-side timing.
 *
 * Exports analyzePerformance(url, fetcher, psiKey)
 *
 * PSI docs: https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed
 */

const { URL } = require('url')

async function callPSI(targetUrl, strategy, key, fetcher) {
  const base = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
  const u = `${base}?url=${encodeURIComponent(targetUrl)}&strategy=${strategy}${key ? `&key=${encodeURIComponent(key)}` : ''}`
  const res = await fetcher(u, { method: 'GET', headers: { 'User-Agent': 'WebsiteAuditor/1.0' } }, 10000)
  if (!res || res.status >= 400) {
    return { error: `PSI request failed (status=${res ? res.status : 'no-response'})` }
  }
  const text = res.text || ''
  let json = {}
  try { json = JSON.parse(text) } catch (e) { return { error: 'Invalid PSI JSON response' } }

  const lighthouse = json.lighthouseResult || {}
  const categories = lighthouse.categories || {}
  const audits = lighthouse.audits || {}

  const perfScore = categories.performance ? Math.round((categories.performance.score || 0) * 100) : null

  // Common metrics
  const lcp = audits['largest-contentful-paint'] ? audits['largest-contentful-paint'].displayValue || audits['largest-contentful-paint'].numericValue : null
  const inp = audits['interaction-to-next-paint'] ? audits['interaction-to-next-paint'].displayValue || audits['interaction-to-next-paint'].numericValue : null
  const cls = audits['cumulative-layout-shift'] ? audits['cumulative-layout-shift'].displayValue || audits['cumulative-layout-shift'].numericValue : null

  return { perfScore, lcp, inp, cls, raw: json }
}

async function analyzePerformance(targetUrl, fetcher, psiKey) {
  const result = { mobile: null, desktop: null, serverFetchMs: null, findings: [] }

  // Server-side fetch timing (simple indicator)
  const t = await fetcher(targetUrl, { method: 'GET', headers: { 'User-Agent': 'WebsiteAuditor/1.0' } }, 10000)
  if (t && typeof t.elapsed === 'number') result.serverFetchMs = t.elapsed

  // Call PSI for mobile & desktop (these calls may consume quota)
  const [mobile, desktop] = await Promise.all([
    callPSI(targetUrl, 'mobile', psiKey, fetcher),
    callPSI(targetUrl, 'desktop', psiKey, fetcher)
  ])

  result.mobile = mobile
  result.desktop = desktop

  // Simple heuristic findings
  if (result.serverFetchMs && result.serverFetchMs > 1000) {
    result.findings.push({ title: 'Slow server response time', action: `Initial fetch took ${result.serverFetchMs} ms. Consider server tuning or CDN.` })
  }
  if (mobile && mobile.perfScore !== null && mobile.perfScore < 60) {
    result.findings.push({ title: 'Low mobile performance score', action: `Mobile performance score is ${mobile.perfScore}. Optimize LCP, INP, and CLS.` })
  }
  if (desktop && desktop.perfScore !== null && desktop.perfScore < 70) {
    result.findings.push({ title: 'Low desktop performance score', action: `Desktop performance score is ${desktop.perfScore}. Investigate render-blocking resources.` })
  }

  return result
}

module.exports = { analyzePerformance }
