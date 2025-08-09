// >>> file: lib/ai.js
/**
 * lib/ai.js
 *
 * Multi-LLM helper: try OpenAI -> Gemini -> Deepseek (in that order) and ALWAYS return a safe fallback if LLMs fail.
 *
 * Environment variables used:
 *  - OPENAI_API_KEY
 *  - OPENAI_MODEL (optional, default 'gpt-4')
 *  - GEMINI_API_KEY      (optional)
 *  - GEMINI_MODEL        (optional, default 'gemini-1.0')
 *  - DEEPSEEK_API_KEY    (optional)
 *
 * Notes:
 *  - Gemini and Deepseek calls here are implemented with conservative / widely-used request patterns.
 *    If your provider requires different endpoints or request shape, replace the relevant call*() implementation.
 *  - All network calls use fetch with a short timeout and will be caught and logged.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.0";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

const DEFAULT_TIMEOUT_MS = 12_000;

/* --- Utility: fetch with timeout --- */
async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/* --- Fallback evidence-based answer generator (no external LLM) --- */
function fallbackAnswerFromSnippets(relevant, query) {
  const keys = Object.keys(relevant || {});
  const citations = keys.slice(0, 6).map(k => ({ section: k, excerpt: String(relevant[k]).slice(0, 300) }));

  const text = Object.values(relevant).join(" ").toLowerCase();
  const suggestions = new Set();
  let urgency = "Low";

  if (text.match(/\b(404|not found|broken)\b/)) {
    suggestions.add("Fix broken links and update or remove 404 resources.");
    urgency = "Medium";
  }
  if (text.match(/\b(lcp|largest contentful paint|ttfb|long ttfb|time to first byte)\b/)) {
    suggestions.add("Improve LCP/TTFB: optimize images, enable caching, review server response times.");
    urgency = urgency === "High" ? "High" : "Medium";
  }
  if (text.match(/\b(content-security-policy|csp|hsts|x-frame-options|x-content-type-options)\b/)) {
    suggestions.add("Add/strengthen security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options.");
    urgency = "Medium";
  }
  if (text.match(/\b(meta description|missing meta|title tag)\b/)) {
    suggestions.add("Add concise titles and unique meta descriptions for primary pages.");
  }
  if (suggestions.size === 0) {
    suggestions.add("Review the evidence snippets and prioritize fixes across performance, SEO and security.");
  }

  return {
    answer: `AI unavailable — returning evidence-based summary from audit JSON. See citations for evidence.`,
    citations,
    suggestedActions: Array.from(suggestions).slice(0, 4),
    urgency
  };
}

/* --- OpenAI Chat call --- */
async function callOpenAIChat(systemPrompt, userPrompt, opts = {}) {
  if (!OPENAI_API_KEY) throw Object.assign(new Error("OPENAI_API_KEY not set"), { code: "NO_OPENAI_KEY" });

  const payload = {
    model: opts.model || OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: opts.maxTokens || 500,
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2,
  };

  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);

  if (!res.ok) {
    const body = await res.text().catch(()=>null);
    const err = new Error(`OpenAI error ${res.status}: ${String(body).slice(0,100)}`);
    err.status = res.status;
    err.response = body;
    throw err;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { raw: data, text };
}

/* --- Gemini call (Google Generative API pattern) --- 
   NOTE: adjust endpoint/format if your Gemini/integration uses a different API.
   Using Bearer GEMINI_API_KEY and the model name; we call a 'generate' endpoint.
*/
async function callGemini(systemPrompt, userPrompt, opts = {}) {
  if (!GEMINI_API_KEY) throw Object.assign(new Error("GEMINI_API_KEY not set"), { code: "NO_GEMINI_KEY" });

  // Example endpoint for Google Generative API (may need adjustment for your setup)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta2/models/${GEMINI_MODEL}:generateText`;

  const body = {
    prompt: `${systemPrompt}\n\n${userPrompt}`,
    // temperature and candidate count are provider-specific; keep minimal
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2,
    maxOutputTokens: opts.maxTokens || 500
  };

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GEMINI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);

  if (!res.ok) {
    const bodyText = await res.text().catch(()=>null);
    const err = new Error(`Gemini error ${res.status}: ${String(bodyText).slice(0,120)}`);
    err.status = res.status;
    err.response = bodyText;
    throw err;
  }

  const data = await res.json().catch(()=>null);
  // Google generative responses vary; try common fields
  const text = data?.candidates?.[0]?.output || data?.output?.[0]?.content || data?.result?.output || "";
  return { raw: data, text };
}

/* --- Deepseek call (generic pattern) ---
   Replace URL/shape if Deepseek uses another API contract.
*/
async function callDeepseek(systemPrompt, userPrompt, opts = {}) {
  if (!DEEPSEEK_API_KEY) throw Object.assign(new Error("DEEPSEEK_API_KEY not set"), { code: "NO_DEEPSEEK_KEY" });

  const endpoint = "https://api.deepseek.ai/v1/generate"; // placeholder — adjust if needed
  const body = {
    prompt: `${systemPrompt}\n\n${userPrompt}`,
    max_tokens: opts.maxTokens || 500,
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2
  };

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);

  if (!res.ok) {
    const bodyText = await res.text().catch(()=>null);
    const err = new Error(`Deepseek error ${res.status}: ${String(bodyText).slice(0,120)}`);
    err.status = res.status;
    err.response = bodyText;
    throw err;
  }

  const data = await res.json().catch(()=>null);
  const text = data?.text || data?.result || data?.output || "";
  return { raw: data, text };
}

/* --- Public: summarizeForPdf(rawFindings) --- */
export async function summarizeForPdf(rawFindings = {}) {
  const small = {
    seo: (rawFindings.seo?.findings || []).slice(0, 6),
    performance: {
      mobile: rawFindings.performance?.mobile || rawFindings.perf?.mobile || null,
      desktop: rawFindings.performance?.desktop || rawFindings.perf?.desktop || null
    },
    security: (rawFindings.security?.findings || []).slice(0, 6)
  };

  const system = `You are a concise assistant: produce one-line PDF-ready summaries for SEO, performance, and security, using keys like [seo], [perf.mobile] as anchors. Return a tiny JSON object with keys seoMeta, performanceSummary, securitySummary (each <=140 chars).`;
  const user = `AUDIT_SNIPPETS: ${JSON.stringify(small).slice(0, 15000)}\n\nReturn JSON with seoMeta, performanceSummary, securitySummary.`;

  // Try chain: OpenAI -> Gemini -> Deepseek -> fallback
  const callers = [
    { fn: callOpenAIChat, name: "openai", enabled: !!OPENAI_API_KEY },
    { fn: callGemini, name: "gemini", enabled: !!GEMINI_API_KEY },
    { fn: callDeepseek, name: "deepseek", enabled: !!DEEPSEEK_API_KEY }
  ];

  for (const c of callers) {
    if (!c.enabled) continue;
    try {
      const resp = await c.fn(system, user, { maxTokens: 300, timeoutMs: 10_000 });
      const rawText = (resp && resp.text) ? resp.text.trim() : "";
      // try JSON parse
      try {
        const parsed = JSON.parse(rawText);
        return parsed;
      } catch {
        // if not JSON, build a concise object from lines
        const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
        return {
          seoMeta: lines[0] || (small.seo[0]?.title || ""),
          performanceSummary: lines[1] || (small.performance.mobile ? `Mobile ${small.performance.mobile.perfScore || "n/a"}` : ""),
          securitySummary: lines[2] || (small.security[0]?.title || "")
        };
      }
    } catch (err) {
      console.warn(`[ai] summarizeForPdf ${c.name} failed:`, err?.message || err);
      // try next
    }
  }

  // final fallback
  return {
    seoMeta: (small.seo.slice(0,2).map(f => f.title || "").join("; ") || "No SEO issues found."),
    performanceSummary: small.performance.mobile ? `Mobile ${small.performance.mobile.perfScore || "n/a"}` : "No perf snapshot",
    securitySummary: small.security.slice(0,2).map(f => f.title || "").join("; ") || "No security issues found."
  };
}

/* --- Public: answerQuery(relevantJson, query, options) --- */
export async function answerQuery(relevantJson = {}, query = "", options = {}) {
  if (!query || typeof query !== "string") throw new Error("Invalid query");

  const citations = Object.keys(relevantJson || {}).slice(0, 8).map(k => ({ section: k, excerpt: String(relevantJson[k]).slice(0, 400) }));

  const system = `You are an analyst. Use only the provided JSON snippets as evidence; when you reference evidence, include an anchor like [KEY] where KEY is the JSON key. Output: (1) short answer, (2) 2-4 suggested next steps (bulleted), (3) urgency: Low/Medium/High. Keep answer concise.`;

  let user = `USER QUERY: ${query}\n\nEVIDENCE SNIPPETS:\n`;
  for (const k of Object.keys(relevantJson).slice(0, 30)) {
    user += `${k}: ${String(relevantJson[k]).slice(0, 1600)}\n\n`;
  }

  const callers = [
    { fn: callOpenAIChat, name: "openai", enabled: !!OPENAI_API_KEY },
    { fn: callGemini, name: "gemini", enabled: !!GEMINI_API_KEY },
    { fn: callDeepseek, name: "deepseek", enabled: !!DEEPSEEK_API_KEY }
  ];

  for (const c of callers) {
    if (!c.enabled) continue;
    try {
      const resp = await c.fn(system, user, { maxTokens: options.limit || 500, timeoutMs: options.timeoutMs || 10_000 });
      const rawText = (resp && resp.text) ? resp.text.trim() : "";
      if (!rawText) throw new Error(`${c.name} returned empty`);

      // Try to parse JSON from model
      try {
        const parsed = JSON.parse(rawText);
        return {
          answer: parsed.answer || parsed.summary || "",
          citations: parsed.citations || citations.slice(0, 6),
          suggestedActions: parsed.suggestedActions || parsed.recommendations || [],
          urgency: parsed.urgency || "Low"
        };
      } catch {
        // Heuristic parse: first paragraph as answer; bullets as suggested actions; search for urgency word
        const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
        const answerLine = lines[0] || "";
        const suggestedActions = lines.filter(l => l.startsWith("-") || l.startsWith("•") || /^\d+\./.test(l)).slice(0,4).map(l => l.replace(/^[\-•\d\.\)\s]+/, ""));
        const urgencyMatch = rawText.match(/\b(Urgency|Priority|Level)\s*[:\-]\s*(Low|Medium|High)/i) || rawText.match(/\b(Low|Medium|High)\b/);
        const urgency = urgencyMatch ? (urgencyMatch[2] || urgencyMatch[1]) : "Low";

        return {
          answer: answerLine,
          citations,
          suggestedActions,
          urgency
        };
      }
    } catch (err) {
      console.warn(`[ai] answerQuery ${c.name} failed:`, err?.message || err);
      // try next provider
    }
  }

  // All LLMs failed — return evidence-based fallback (never throw)
  return fallbackAnswerFromSnippets(relevantJson, query);
}

export default {
  summarizeForPdf,
  answerQuery
};
