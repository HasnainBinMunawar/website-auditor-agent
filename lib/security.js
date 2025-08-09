// >>> file: lib/security.js
/**
 * lib/security.js
 * Security checks that are non-intrusive (no active scanning).
 *
 * - Inspect response headers for security-related headers
 * - Check for redirect to HTTPS
 * - Check for permissive CORS headers
 * - Look for common JS libraries and note "check versions" suggestions
 */

const commonLibraries = [
    /jquery(?:[-.](\d+\.\d+\.\d+))?\.js/i,
    /react(?:[-.](\d+\.\d+\.\d+))?(\.min)?\.js/i,
    /vue(?:[-.](\d+\.\d+\.\d+))?\.js/i,
    /angular(?:[-.](\d+\.\d+\.\d+))?\.js/i,
    /lodash(?:[-.](\d+\.\d+\.\d+))?\.js/i
  ]
  
  function analyzeSecurity(targetUrl, initialResponse, htmlText) {
    const findings = []
    const headers = {}
    if (initialResponse && initialResponse.headers) {
      for (const [k, v] of initialResponse.headers.entries()) {
        headers[k.toLowerCase()] = v
      }
    }
  
    // Header checks
    const required = [
      { name: 'strict-transport-security', present: !!headers['strict-transport-security'], title: 'Missing HSTS', action: 'Add Strict-Transport-Security header to enforce HTTPS.' },
      { name: 'content-security-policy', present: !!headers['content-security-policy'], title: 'Missing Content-Security-Policy', action: 'Add a CSP header to mitigate XSS risks.' },
      { name: 'x-frame-options', present: !!headers['x-frame-options'], title: 'Missing X-Frame-Options', action: 'Add X-Frame-Options to reduce clickjacking.' },
      { name: 'referrer-policy', present: !!headers['referrer-policy'], title: 'Missing Referrer-Policy', action: 'Add Referrer-Policy to limit referrer exposure.' }
    ]
    required.forEach(r => {
      if (!r.present) findings.push({ title: r.title, action: r.action })
    })
  
    // HTTPS redirect check
    try {
      const requestedProto = new URL(targetUrl).protocol
      if (requestedProto === 'http:') {
        // If initialResponse.url is present and is https, the site redirects to HTTPS
        if (initialResponse && initialResponse.url && initialResponse.url.startsWith('https:')) {
          // ok
        } else {
          findings.push({ title: 'No HTTPS redirect', action: 'Ensure the site redirects HTTP → HTTPS.' })
        }
      }
    } catch (e) { /* ignore */ }
  
    // CORS permissive check
    if (headers['access-control-allow-origin'] === '*') {
      findings.push({ title: 'Permissive CORS', action: 'Access-Control-Allow-Origin is "*". Review to ensure it is safe for sensitive endpoints.' })
    }
  
    // Look for common JS libraries in the HTML (script src or comments)
    const libs = []
    const snippet = (htmlText || '').slice(0, 200000) // limit search size
    for (const rx of commonLibraries) {
      const m = snippet.match(rx)
      if (m) libs.push({ match: m[0], version: m[1] || null })
    }
    if (libs.length) {
      findings.push({ title: 'Detected JS libraries — verify versions', action: `Found ${libs.length} common libraries in page; check versions and update if outdated. Examples: ${libs.map(l => l.match).join(', ')}` })
    }
  
    return { headers, findings }
  }
  
  module.exports = { analyzeSecurity }
  