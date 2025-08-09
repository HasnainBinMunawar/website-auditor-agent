// >>> file: lib/storage.js
/**
 * lib/storage.js
 * Safe read/write helpers for audit JSON stored under data/audits/{siteId}.json
 * Exports: getAudit(siteId), saveAudit(siteId, json), listAudits()
 *
 * Atomic write: write to temp file then rename.
 */

import fs from "fs";
import path from "path";

const AUDITS_DIR = path.join(process.cwd(), "data", "audits");

function ensureDir() {
  if (!fs.existsSync(AUDITS_DIR)) fs.mkdirSync(AUDITS_DIR, { recursive: true });
}

export async function getAudit(siteId) {
  if (!siteId || typeof siteId !== "string") return null;
  ensureDir();
  const safeName = siteId.replace(/[^a-zA-Z0-9\-_.]/g, "_");
  const file = path.join(AUDITS_DIR, `${safeName}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = await fs.promises.readFile(file, "utf8");
  try { return JSON.parse(raw); } catch (e) { throw new Error("Audit JSON parse error: " + e.message); }
}

export async function saveAudit(siteId, jsonObj) {
  ensureDir();
  const safeName = siteId.replace(/[^a-zA-Z0-9\-_.]/g, "_");
  const file = path.join(AUDITS_DIR, `${safeName}.json`);
  const tmp = file + ".tmp";
  const data = JSON.stringify(jsonObj, null, 2);
  await fs.promises.writeFile(tmp, data, "utf8");
  await fs.promises.rename(tmp, file);
  return true;
}

export async function listAudits() {
  ensureDir();
  const files = await fs.promises.readdir(AUDITS_DIR);
  return files.filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, ""));
}
