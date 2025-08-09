// >>> file: pages/api/audit-chart-data.js
/**
 * pages/api/audit-chart-data.js
 * GET ?siteId=&metric=
 * Returns small time-series derived from stored audit JSON.
 *
 * Note: This implementation expects audit JSON may contain a .history or .metrics field.
 * It will do a safe fallback and return simple array of objects: [{ts, value}, ...]
 */

import { getAudit } from "../../lib/storage.js";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const limiter = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const rec = limiter.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count++;
  limiter.set(ip, rec);
  return rec.count <= RATE_MAX;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (!rateLimit(ip)) return res.status(429).json({ error: "Rate limit exceeded" });

  try {
    const siteId = req.query.siteId;
    const metric = req.query.metric || "lcp";
    if (!siteId) return res.status(400).json({ error: "Missing siteId" });

    const audit = await getAudit(siteId);
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    // Try known places for historical metrics
    const series = [];
    // Typical places: audit.history[metric], audit.metrics[metric], audit.perf.history
    if (audit.history && audit.history[metric] && Array.isArray(audit.history[metric])) {
      for (const p of audit.history[metric].slice(-90)) series.push(p);
    } else if (audit.metrics && audit.metrics[metric]) {
      for (const item of (audit.metrics[metric]||[]).slice(-90)) series.push(item);
    } else if (audit.perf && audit.perf.timeline && audit.perf.timeline[metric]) {
      for (const item of (audit.perf.timeline[metric]||[]).slice(-90)) series.push(item);
    } else {
      // fallback: single current datapoint
      const current = audit.perf?.mobile?.lcp || audit.perf?.desktop?.lcp || audit.perf?.serverFetchMs;
      if (current) series.push({ ts: audit.meta?.generatedAt || new Date().toISOString(), value: current });
    }

    return res.status(200).json({ siteId, metric, series: series.slice(-90) });
  } catch (err) {
    console.error("audit-chart-data error:", err);
    return res.status(500).json({ error: "Failed to fetch chart data" });
  }
}
