// >>> file: pages/api/chat-analyst.js
import fs from "fs";
import path from "path";
import { getAudit as storageGetAudit } from "../../lib/storage.js";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const limiter = new Map();

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(ip) {
  const now = Date.now();
  const rec = limiter.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW_MS) {
    rec.count = 1;
    rec.start = now;
  } else {
    rec.count++;
  }
  limiter.set(ip, rec);
  return rec.count <= RATE_MAX;
}

async function loadAllAuditsJson() {
  const file = path.join(process.cwd(), "data", "audits.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    console.warn("Failed parse audits.json", e);
    return null;
  }
}

async function findAuditByIdOrSite(id) {
  // 1) try audits.json direct key or search values
  const audits = await loadAllAuditsJson();
  if (audits) {
    if (audits[id]) return audits[id]; // direct auditId lookup
    // search values for meta.siteId, meta.url or hostname
    for (const [k, v] of Object.entries(audits)) {
      try {
        const meta = v?.meta || {};
        if (!meta) continue;
        if (meta.siteId && String(meta.siteId) === id) return v;
        if (meta.url && String(meta.url) === id) return v;
        if (meta.url) {
          try {
            const h = new URL(meta.url).hostname;
            if (h === id) return v;
            if ((meta.url || "").includes(id)) return v;
          } catch {}
        }
      } catch {}
    }
  }

  // 2) try per-file data/audits/{id}.json
  const perFile = path.join(process.cwd(), "data", "audits", `${id}.json`);
  if (fs.existsSync(perFile)) {
    try {
      const raw = await fs.promises.readFile(perFile, "utf8");
      return JSON.parse(raw);
    } catch (e) { /* ignore */ }
  }

  // 3) try storage.getAudit (lib/storage)
  if (typeof storageGetAudit === "function") {
    try {
      const s = await storageGetAudit(id);
      if (s) return s;
    } catch (e) { /* ignore */ }
  }

  // not found
  return null;
}

function selectRelevantSnippets(auditJson, keywords = [], charLimit = 8000) {
  const result = {};
  const added = new Set();
  const lowerKeywords = (keywords || []).map(k => k.toLowerCase()).filter(Boolean);

  function addIfRelevant(key, val) {
    try {
      if (added.has(key)) return;
      const text = typeof val === "string" ? val : JSON.stringify(val);
      const lower = text.toLowerCase();
      if (lowerKeywords.length === 0) {
        if (["summary","seo","performance","perf","security","links","meta"].includes(key) || key.length < 16) {
          result[key] = text.slice(0, 3000);
          added.add(key);
        }
        return;
      }
      for (const kw of lowerKeywords) {
        if (lower.includes(kw)) {
          result[key] = text.slice(0, 3000);
          added.add(key);
          break;
        }
      }
    } catch {}
  }

  try {
    for (const k of Object.keys(auditJson || {})) {
      addIfRelevant(k, auditJson[k]);
      const v = auditJson[k];
      if (v && typeof v === "object") {
        for (const sub of Object.keys(v)) {
          addIfRelevant(`${k}.${sub}`, v[sub]);
        }
      }
      const total = Object.values(result).reduce((s, t) => s + (t?.length || 0), 0);
      if (total > charLimit - 500) break;
    }
  } catch (e) { /* ignore */ }

  if (Object.keys(result).length === 0) {
    if (auditJson.summary) result.summary = String(auditJson.summary).slice(0, 3000);
    if (auditJson.seo?.findings) result["seo.findings"] = JSON.stringify(auditJson.seo.findings.slice(0, 5));
    if (auditJson.performance) result["perf.snapshot"] = JSON.stringify({
      mobile: auditJson.performance?.mobile?.perfScore || auditJson.perf?.mobile?.perfScore,
      desktop: auditJson.performance?.desktop?.perfScore || auditJson.perf?.desktop?.perfScore
    });
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    res.setHeader("Retry-After", String(Math.ceil(RATE_WINDOW_MS / 1000)));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  let body = {};
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { siteId, auditId, query, limit = 1200 } = body || {};
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return res.status(400).json({ error: "Invalid query (too short)" });
  }

  const id = String(auditId || siteId || "").trim();
  if (!id) return res.status(400).json({ error: "Missing siteId or auditId" });

  let audit = null;
  try {
    audit = await findAuditByIdOrSite(id);
  } catch (e) {
    console.error("audit load error:", e);
    return res.status(500).json({ error: "Failed to load audit" });
  }

  if (!audit) return res.status(404).json({ error: "Audit not found" });

  const keywords = String(query || "").split(/\s+/).slice(0, 8);
  const relevant = selectRelevantSnippets(audit, keywords, 8000);

  // dynamic import of ai helper to avoid build/time issues
  let aiModule = null;
  try {
    aiModule = await import("../../lib/ai.js");
  } catch (e) {
    console.warn("lib/ai import failed:", e?.message || e);
  }
  const answerQuery = aiModule?.answerQuery || aiModule?.default?.answerQuery;

  if (!answerQuery) {
    // LLM not configured — return simple evidence-based answer
    const citations = Object.keys(relevant).slice(0, 6).map(k => ({ section: k, excerpt: (String(relevant[k]).slice(0, 300)) }));
    const fallbackAnswer = `AI unavailable. Showing evidence snippets and suggested actions.`;
    return res.status(200).json({
      answer: fallbackAnswer,
      citations,
      suggestedActions: ["Enable server-side LLM keys for richer answers", "Review the above evidence snippets"],
      urgency: "Low"
    });
  }

  try {
    const aiResp = await answerQuery(relevant, query, { limit: Number(limit) || 1200 });
    const out = {
      answer: aiResp.answer || "",
      citations: aiResp.citations || [],
      suggestedActions: aiResp.suggestedActions || [],
      urgency: aiResp.urgency || "Low"
    };
    return res.status(200).json(out);
  } catch (err) {
    console.error("chat-analyst error:", err);
    return res.status(500).json({ error: "Failed to process query" });
  }
}

