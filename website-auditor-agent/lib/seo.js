// >>> file: lib/seo.js
/**
 * lib/seo.js
 * Functions to fetch a page HTML and extract SEO-related information.
 *
 * - Extracts title, meta description, canonical link
 * - Counts H1/H2
 * - Attempts to fetch /sitemap.xml and /robots.txt
 * - Collects internal links (max 20) and shallow-checks them for broken statuses
 *
 * Note: Uses the provided fetcher to enforce timeouts and safe network behavior.
 */

const cheerio = require('cheerio')
const { URL } = require('url')

/**
 * Normalize and ensure an absolute URL for link hrefs.
 */
function normalizeHref(href, base) {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

/**
 * Determine whether a URL is internal to base origin.
 */
function isInternal(href, baseOrigin) {
  try {
    const u = new URL(href)
    return u.origin === baseOrigin
  } catch {
    return false
  }
}

/**
 * Main SEO analysis function.
 * @param {string} targetUrl
 * @param {function} fetcher - fetchWithTimeout
 * @param {object} opts
 */
async function analyzeSEO(targetUrl, fetcher, opts = {}) {
  const maxLinks = opts.maxLinks || 20
  const findings = []
  const raw = { internalLinks: [], brokenLinks: [] }

  // Fetch main page
  const pageRes = await fetcher(targetUrl, { method: 'GET', headers: { 'User-Agent': 'WebsiteAuditor/1.0' } })
  if (!pageRes) throw new Error('Failed to fetch page')
  const html = pageRes.text || ''
  const $ = cheerio.load(html)

  // Basic tags
  const title = ($('title').first().text() || '').trim()
  const metaDescription = ($('meta[name="description"]').attr('content') || '').trim()
  const canonical = ($('link[rel="canonical"]').attr('href') || '').trim()

  if (!title) findings.push({ title: 'Missing title tag', action: 'Add a descriptive <title> (50-70 chars recommended).' })
  if (!metaDescription) findings.push({ title: 'Missing meta description', action: 'Add a meta description (50-160 chars).' })
  if (!canonical) findings.push({ title: 'Missing canonical link', action: 'Add <link rel="canonical" href="..."> to avoid duplicate content.' })

  // Headings
  const h1count = $('h1').length
  const h2count = $('h2').length
  if (h1count === 0) findings.push({ title: 'No H1 found', action: 'Ensure each page has a single, clear H1 tag.' })
  if (h1count > 1) findings.push({ title: 'Multiple H1 tags', action: 'Use a single H1 and H2/H3 for subsections.' })

  // sitemap.xml and robots.txt
  const origin = new URL(targetUrl).origin
  const sitemapCheck = await fetcher(new URL('/sitemap.xml', origin).toString(), { method: 'GET' })
  const robotsCheck = await fetcher(new URL('/robots.txt', origin).toString(), { method: 'GET' })
  const hasSitemap = sitemapCheck && sitemapCheck.status >= 200 && sitemapCheck.status < 300
  const hasRobots = robotsCheck && robotsCheck.status >= 200 && robotsCheck.status < 300
  if (!hasSitemap) findings.push({ title: 'No sitemap.xml found', action: 'Consider adding a sitemap.xml for discoverability.' })
  if (!hasRobots) findings.push({ title: 'No robots.txt found', action: 'Add robots.txt to guide crawlers (and prevent accidental indexing).' })

  // Internal links (limit)
  const links = []
  $('a[href]').each((i, el) => {
    if (links.length >= maxLinks) return
    const href = $(el).attr('href')
    const abs = normalizeHref(href, targetUrl)
    if (!abs) return
    if (isInternal(abs, origin)) {
      if (!links.includes(abs)) links.push(abs)
    }
  })
  raw.internalLinks = links.slice(0, maxLinks)

  // Check internal link statuses (shallow, HEAD then GET fallback), limited concurrency
  const broken = []
  const headChecks = raw.internalLinks.map(async (lnk) => {
    try {
      // Try HEAD to be light
      let res = await fetcher(lnk, { method: 'HEAD' })
      if (res.status === 405 || res.status === 501) {
        // HEAD not allowed — fallback to GET
        res = await fetcher(lnk, { method: 'GET' })
      }
      if (!res || res.status < 200 || res.status >= 400) {
        broken.push({ url: lnk, status: res ? res.status : 'no-response' })
      }
    } catch (e) {
      broken.push({ url: lnk, status: 'error', error: String(e) })
    }
  })

  // Limit overall link checks to avoid too many outgoing requests
  await Promise.all(headChecks)

  raw.brokenLinks = broken
  if (broken.length) findings.push({ title: 'Broken internal links', action: `Found ${broken.length} broken internal links. Fix or redirect them.` })

  // Return structured seo result
  const seo = {
    scoreEstimate: Math.max(40, Math.min(95, 80 - (broken.length * 3) + (h1count ? 0 : -10))), // naive estimate
    title,
    metaDescription,
    canonical,
    h1count,
    h2count,
    findings,
    raw
  }

  return { seo, html, pageTiming: pageRes.elapsed || null, headers: pageRes.headers }
}

module.exports = { analyzeSEO }
