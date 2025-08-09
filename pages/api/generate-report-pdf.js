// >>> file: pages/api/generate-report-pdf.js
import fs from "fs";
import path from "path";
import { getAudit as storageGetAudit } from "../../lib/storage.js";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const rateLimiter = new Map();

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(ip) {
  const now = Date.now();
  const rec = rateLimiter.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW_MS) {
    rec.count = 1; rec.start = now;
  } else rec.count++;
  rateLimiter.set(ip, rec);
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
  const audits = await loadAllAuditsJson();
  if (audits) {
    if (audits[id]) return audits[id];
    for (const [k, v] of Object.entries(audits)) {
      try {
        const meta = v?.meta || {};
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

  const perFile = path.join(process.cwd(), "data", "audits", `${id}.json`);
  if (fs.existsSync(perFile)) {
    try {
      return JSON.parse(await fs.promises.readFile(perFile, "utf8"));
    } catch (e) {}
  }

  if (typeof storageGetAudit === "function") {
    try {
      const s = await storageGetAudit(id);
      if (s) return s;
    } catch (e) {}
  }

  return null;
}

function timeoutPromise(p, ms, errMsg = "Operation timed out") {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(errMsg)), ms))]);
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

  const { siteId, auditId } = body || {};
  const id = String(auditId || siteId || "").trim();
  if (!id) return res.status(400).json({ error: "Missing siteId or auditId" });

  let audit = null;
  try {
    audit = await findAuditByIdOrSite(id);
  } catch (err) {
    console.error("audit load error:", err);
    return res.status(500).json({ error: "Failed to load audit" });
  }

  if (!audit) return res.status(404).json({ error: "Audit not found" });

  // dynamic import pdf helper
  let pdfModule = null;
  try {
    pdfModule = await import("../../lib/pdf.js");
  } catch (e) {
    console.warn("lib/pdf import failed:", e?.message || e);
  }
  const createPdfBuffer = pdfModule?.createPdfBuffer || pdfModule?.default?.createPdfBuffer;

  if (!createPdfBuffer) {
    return res.status(501).json({ error: "PDF generation unavailable. Ensure server has 'pdfkit' and lib/pdf.js is present." });
  }

  try {
    const buf = await timeoutPromise(createPdfBuffer({ siteId: id, auditJson: audit }), 20000, "PDF generation timed out");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${id}-audit.pdf"`);
    res.setHeader("Content-Length", String(buf.length));
    return res.status(200).send(buf);
  } catch (err) {
    const msg = String(err?.message || err);
    console.error("generate-report-pdf error:", msg);
    if (/pdfkit/i.test(msg) || msg.includes("pdfkit module not found")) {
      return res.status(501).json({ error: "PDF generation unavailable: install server-side dependency 'pdfkit'" });
    }
    if (msg.toLowerCase().includes("timed out")) {
      return res.status(504).json({ error: "PDF generation timed out" });
    }
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
}

