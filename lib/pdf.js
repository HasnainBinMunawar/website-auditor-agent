// >>> file: lib/pdf.js
/**
 * lib/pdf.js
 * Generate single-page A4 PDF using pdfkit.
 * createPdfBuffer({ siteId, auditJson, summaries }) -> Promise<Buffer>
 *
 * Notes:
 * - Uses process.cwd()/public/logo.png for logo. If only logo.svg exists, convert to PNG for reliable rendering.
 * - Includes a small chatbot-logo if present at public/chatbot-logo.png (developer note in comments).
 */

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { summarizeForPdf } from "./ai.js"; // used for extra rewrite suggestions if caller didn't supply

const LOGO_PATH_PNG = path.join(process.cwd(), "public", "logo.png");
const CHATBOT_LOGO_PATH = path.join(process.cwd(), "public", "chatbot-logo.png");

function short(s, n = 140) {
  if (!s && s !== 0) return "";
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export async function createPdfBuffer({ siteId, auditJson, summaries }) {
  // Ensure we have summaries
  let useSummaries = summaries;
  if (!useSummaries) {
    try { useSummaries = await summarizeForPdf(auditJson); } catch (e) { useSummaries = {}; }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 36 });
      const bufs = [];
      doc.on("data", (c) => bufs.push(c));
      doc.on("end", () => resolve(Buffer.concat(bufs)));

      // Header: site name left, logo top-right
      const title = (auditJson.meta && (auditJson.meta.siteId || auditJson.meta.url)) || siteId;
      doc.fontSize(14).font("Helvetica-Bold").text(title, 36, 36, { continued: true });

      // Draw logo if exists
      if (fs.existsSync(LOGO_PATH_PNG)) {
        try {
          // position near top-right
          const imgW = 72;
          const x = doc.page.width - imgW - 36;
          const y = 28;
          doc.image(LOGO_PATH_PNG, x, y, { width: imgW });
        } catch (e) {
          // ignore image errors
        }
      } else {
        // Developer note: if you only have logo.svg, convert to public/logo.png because pdfkit handles PNG reliably.
        // e.g., use an image conversion tool to create public/logo.png
      }

      doc.moveDown(1);
      doc.fontSize(9).fillColor("gray").text(`Generated: ${new Date().toLocaleString()}`, { align: "left" });
      doc.moveDown(0.5);

      // Aggregate score badges (simple)
      const seoScore = auditJson.seo?.score ?? auditJson.seo?.scoreEstimate ?? 0;
      const perfScore = auditJson.perf?.mobile?.perfScore ?? auditJson.perf?.desktop?.perfScore ?? 0;
      const secScore = auditJson.security ? Math.max(0, 100 - (auditJson.security.findings?.length||0) * 8) : 0;
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("black").text(`SEO ${seoScore}   •   Perf ${perfScore}   •   Security ${secScore}`);
      doc.moveDown(0.5);

      // Section helper: title bold then short body
      const section = (titleText, text, recommendation) => {
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text(titleText);
        doc.moveDown(0.08);
        doc.fontSize(9).font("Helvetica").fillColor("#111827").text(short(text || "No data"), { width: doc.page.width - 72 });
        if (recommendation) {
          doc.moveDown(0.05);
          doc.fontSize(8).fillColor("#374151").text("Recommendation: " + short(recommendation, 200));
        }
        doc.moveDown(0.6);
      };

      // 1) Meta & On-page SEO
      const metaSummary = (auditJson.seo && (auditJson.seo.title || auditJson.seo.metaDescription || auditJson.seo.findings?.map(f=>f.title).join("; "))) || useSummaries.seoMeta || "No meta data";
      const metaRec = useSummaries.seoMeta || "Add descriptive title and meta description with target keywords.";
      section("Meta & On-page SEO", metaSummary, metaRec);

      // 2) Heading structure
      const headingText = auditJson.heading?.note || `H1s: ${(auditJson.heading?.h1s||[]).length || 0}, H2s: ${(auditJson.heading?.h2s||[]).length || 0}`;
      const headingRec = useSummaries.heading || "Ensure single clear H1 and logical H2/H3 hierarchy.";
      section("Heading structure & content hierarchy", headingText, headingRec);

      // 3) Sitemap & robots
      const sitemapText = auditJson.sitemap ? `sitemap.xml found: ${auditJson.sitemap.found}, robots.txt: ${auditJson.sitemap.robotsFound}` : useSummaries.sitemap || "No sitemap/robots data";
      const sitemapRec = useSummaries.sitemap || "Provide sitemap.xml and valid robots.txt to guide crawlers.";
      section("Sitemap & robots.txt", sitemapText, sitemapRec);

      // 4) Links summary (counts + top 3 broken)
      const links = auditJson.links || {};
      const linkText = `Internal: ${links.internalCount||0}, External: ${links.externalCount||0}, Broken: ${links.broken?.length||0}`;
      const topBroken = (links.broken||[]).slice(0,3).map(b => `${b.url} (${b.status||'err'})`).join("; ");
      const linksRec = useSummaries.links || "Fix broken links and add redirects for 404s.";
      section("Broken/Internal/External links", `${linkText}. Top broken: ${topBroken || 'none'}`, linksRec);

      // 5) PageSpeed / Core Web Vitals
      const perf = auditJson.perf || {};
      const perfText = `Mobile: ${perf.mobile?.perfScore ?? 'n/a'} (LCP ${perf.mobile?.lcp ?? 'n/a'}), Desktop: ${perf.desktop?.perfScore ?? 'n/a'} (LCP ${perf.desktop?.lcp ?? 'n/a'})`;
      const perfRec = useSummaries.performance || "Prioritize LCP and input delay improvements.";
      section("PageSpeed / Core Web Vitals", perfText, perfRec);

      // 6) HTTPS/TLS basics
      const https = auditJson.https || {};
      const httpsText = `HTTPS: ${https.usesHttps ? 'Yes' : 'No'}` + (https.certIssuer ? `; Issuer: ${https.certIssuer}` : "") + (https.certExpiry ? `; Expires: ${https.certExpiry}` : "");
      const httpsRec = useSummaries.https || (https.usesHttps ? "Ensure TLS is current and HSTS enabled." : "Enable HTTPS and redirect HTTP to HTTPS.");
      section("HTTPS / TLS basics", httpsText, httpsRec);

      // 7) Security headers
      const sh = auditJson.security?.headers || {};
      const shText = ["strict-transport-security","content-security-policy","x-frame-options","x-content-type-options","referrer-policy"].map(k=>{
        return `${k}: ${sh[k] ? "OK" : "Missing"}`;
      }).join("; ");
      const shRec = useSummaries.security || "Add missing security headers (CSP, HSTS, X-Frame-Options).";
      section("Security headers presence", shText, shRec);

      // 8) Contact signals
      const contact = auditJson.contact || {};
      const contactText = `Emails: ${(contact.emails||[]).slice(0,3).join(", ") || "none"}, Phones: ${(contact.phones||[]).slice(0,2).join(", ") || "none"}, Forms: ${(contact.forms||[]).slice(0,3).join(", ") || "none"}`;
      const contactRec = useSummaries.contact || "Ensure a visible contact page and functional form endpoints.";
      section("Contact signals", contactText, contactRec);

      // 9) Structured data / Schema.org
      const structuredTypes = (auditJson.structured?.types || []).slice(0,5).join(", ") || "None detected";
      const structuredRec = useSummaries.structured || "Validate JSON-LD structured data for correctness.";
      section("Structured data (JSON-LD)", structuredTypes, structuredRec);

      // Footer: hint to JSON and chat-bot logo
      doc.moveDown(0.3);
      const footerText = `Full report available in JSON at /api/audits/${siteId}`;
      doc.fontSize(8).fillColor("gray").text(footerText, { align: "center" });

      // small chatbot logo if present: place bottom-right
      if (fs.existsSync(CHATBOT_LOGO_PATH)) {
        try {
          const sz = 28;
          const x = doc.page.width - sz - 36;
          const y = doc.page.height - sz - 36;
          doc.image(CHATBOT_LOGO_PATH, x, y, { width: sz });
        } catch (e) {}
      } else {
        // Developer: add public/chatbot-logo.png to include chatbot badge in PDF footer
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
