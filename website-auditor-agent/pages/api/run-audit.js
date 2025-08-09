// pages/api/run-audit.js
import fs from "fs";
import path from "path";
import dns from "dns/promises";
import ipaddr from "ipaddr.js";
import crypto from "crypto";
import { fetchWithTimeout } from "../../lib/fetcher";
import { analyzeSEO } from "../../lib/seo";
import { analyzePerformance } from "../../lib/perf";
import { analyzeSecurity } from "../../lib/security";
import { summarize } from "../../lib/ai";

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 min
const RATE_LIMIT_MAX = 10;
const limiter = new Map();

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",").map(s => s.trim())[0];
  return req.socket.remoteAddress;
}

async function isPrivateAddress(hostname) {
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.some(a => {
      try {
        const parsed = ipaddr.parse(a.address);
        const range = parsed.range();
        if (["private", "loopback", "linkLocal", "carrierGradeNat", "uniqueLocal"].includes(range)) return true;
        if (parsed.kind && parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
          const v4 = parsed.toIPv4Address().toString();
          const p2 = ipaddr.parse(v4);
          return ["private", "loopback"].includes(p2.range());
        }
      } catch {}
      return false;
    });
  } catch {
    return false;
  }
}

function validateUrlText(u) {
  if (!u || typeof u !== "string") return "Missing url";
  if (u.length > 2000) return "URL too long";
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return "URL must be http or https";
  } catch {
    return "Invalid URL";
  }
  return null;
}

function rateLimit(ip) {
  const now = Date.now();
  const rec = limiter.get(ip);

  if (!rec) {
    limiter.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (now - rec.windowStart > RATE_LIMIT_WINDOW_MS) {
    limiter.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  rec.count++;
  if (rec.count > RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: (rec.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000 };
  }
  limiter.set(ip, rec);
  return { allowed: true, remaining: RATE_LIMIT_MAX - rec.count };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req) || "unknown";
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rl.retryAfter || 60)));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  let body;
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const url = (body.url || "").trim();
  const vErr = validateUrlText(url);
  if (vErr) return res.status(400).json({ error: vErr });

  try {
    if (await isPrivateAddress(new URL(url).hostname)) {
      return res.status(400).json({ error: "URL resolves to a private or disallowed IP" });
    }
  } catch (err) {
    console.warn("[SSRF Check Warning]", err);
  }

  const rawFindings = { meta: { url, requestedAt: new Date().toISOString() } };

  let seoResult = { seo: { findings: [], scoreEstimate: 0 }, headers: {}, html: "" };
  try {
    seoResult = await analyzeSEO(url, fetchWithTimeout);
  } catch (err) {
    console.error("[SEO Error]", err);
  }

  let perfResult = { findings: [], serverFetchMs: 0 };
  try {
    const psiKey = process.env.PSI_API_KEY || "";
    perfResult = await analyzePerformance(url, fetchWithTimeout, psiKey);
  } catch (err) {
    console.error("[Performance Error]", err);
  }

  let securityResult = { findings: [], headers: {} };
  try {
    securityResult = analyzeSecurity(url, seoResult.headers, seoResult.html);
  } catch (err) {
    console.error("[Security Error]", err);
  }

  rawFindings.seo = seoResult.seo;
  rawFindings.performance = perfResult;
  rawFindings.security = securityResult;

  let aiSummary = { summary: "No AI summary produced", recommendations: [] };
  try {
    aiSummary = await summarize(rawFindings);
  } catch (err) {
    console.error("[AI Summary Error]", err);
  }

  const auditData = {
    meta: { url, generatedAt: new Date().toISOString() },
    seo: {
      score: seoResult.seo.scoreEstimate || 0,
      findings: seoResult.seo.findings,
    },
    performance: {
      score:
        perfResult.mobile && perfResult.mobile.perfScore
          ? Math.round(
              (perfResult.mobile.perfScore +
                (perfResult.desktop?.perfScore || 0)) / 2
            )
          : perfResult.desktop?.perfScore || 0,
      findings: perfResult.findings,
      mobile: perfResult.mobile || null,
      desktop: perfResult.desktop || null,
      serverFetchMs: perfResult.serverFetchMs,
    },
    security: {
      score: Math.max(0, 100 - securityResult.findings.length * 8),
      findings: securityResult.findings,
      headers: securityResult.headers,
    },
    aiSummary,
    raw: rawFindings,
  };

  // --- Save to data/audits.json ---
  const auditsFile = path.join(process.cwd(), "data", "audits.json");
  let existingAudits = {};
  if (fs.existsSync(auditsFile)) {
    try {
      existingAudits = JSON.parse(fs.readFileSync(auditsFile, "utf8"));
    } catch {
      existingAudits = {};
    }
  }

  const auditId = crypto.randomUUID();
  existingAudits[auditId] = auditData;
  fs.writeFileSync(auditsFile, JSON.stringify(existingAudits, null, 2));

  return res.status(200).json({ auditId, ...auditData });
}
