/**
 * Local accuracy test: Gemini vs current Tesseract parsing on real prescription photos.
 *
 *   1. Put GEMINI_API_KEY=... in Btbiz_backend/.env (optional GEMINI_MODEL=...)
 *   2. Copy photos (jpg / png / webp / pdf) into Btbiz_backend/prescription-test/input/
 *   3. npm run test:gemini-rx            (add `-- --no-tesseract` to skip the Tesseract column)
 *   4. Open Btbiz_backend/prescription-test/report.html in a browser
 *
 * Nothing is written to MongoDB; images only leave this machine for the Gemini API call.
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import Tesseract from "tesseract.js";

import {
  extractPrescriptionWithGemini,
  getGeminiModel,
  isGeminiConfigured,
  type GeminiPrescriptionExtract,
} from "../services/geminiPrescriptionService";
import { parsePrescriptionOcr } from "../utils/prescriptionOcrParse";

dotenv.config();

const ROOT = path.resolve(__dirname, "../../prescription-test");
const INPUT_DIR = path.join(ROOT, "input");
const REPORT_PATH = path.join(ROOT, "report.html");
const RESULTS_PATH = path.join(ROOT, "results.json");

const MODEL = getGeminiModel();
const SKIP_TESSERACT = process.argv.includes("--no-tesseract");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

interface FileResult {
  file: string;
  gemini?: GeminiPrescriptionExtract;
  geminiError?: string;
  geminiMs?: number;
  tesseract?: {
    medicines: string[];
    tests: string[];
    unknown: string[];
    rawText: string;
    confidence?: number;
  };
  tesseractError?: string;
  tesseractMs?: number;
}

async function runTesseract(filePath: string): Promise<NonNullable<FileResult["tesseract"]>> {
  const { data } = await Tesseract.recognize(filePath, "eng");
  const rawText = (data.text || "").trim();
  // Same inputs as production: ocrService stores confidence as 0–1.
  const confidence = data.confidence != null ? data.confidence / 100 : undefined;
  const parsed = parsePrescriptionOcr(rawText, confidence);
  return {
    medicines: parsed.medicines.map((m) => m.text),
    tests: parsed.tests.map((t) => t.text),
    unknown: parsed.unknown.map((u) => u.text),
    rawText,
    confidence,
  };
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checkCell(id: string): string {
  return `<td class="chk"><input type="checkbox" data-id="${esc(id)}" title="Tick if this line is correct"></td>`;
}

function renderGemini(r: FileResult): string {
  if (r.geminiError) return `<p class="err">Gemini error: ${esc(r.geminiError)}</p>`;
  const g = r.gemini!;
  const meta = [
    g.isPrescription ? "" : "<strong class=\"err\">Gemini says this is NOT a prescription.</strong>",
    g.doctorName ? `Doctor: ${esc(g.doctorName)}` : "",
    g.patientName ? `Patient: ${esc(g.patientName)}` : "",
    g.prescriptionDate ? `Date: ${esc(g.prescriptionDate)}` : "",
    r.geminiMs != null ? `Time: ${(r.geminiMs / 1000).toFixed(1)}s` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const medRows = g.medicines
    .map(
      (m, i) => `<tr class="c-${esc(m.confidence)}">${checkCell(`${r.file}|med|${i}`)}
        <td><strong>${esc(m.medicineName)}</strong>${m.strength ? ` <span class="muted">${esc(m.strength)}</span>` : ""}
        ${m.writtenAs && m.writtenAs !== m.medicineName ? `<div class="muted">written: ${esc(m.writtenAs)}</div>` : ""}</td>
        <td>${esc(m.dosage)}</td><td>${esc(m.duration)}</td><td>${esc(m.quantity)}</td><td>${esc(m.instructions)}</td>
        <td><span class="badge">${esc(m.confidence)}</span></td></tr>`
    )
    .join("");
  const testRows = g.tests
    .map(
      (t, i) => `<tr class="c-${esc(t.confidence)}">${checkCell(`${r.file}|test|${i}`)}
        <td><strong>${esc(t.testName)}</strong>
        ${t.writtenAs && t.writtenAs !== t.testName ? `<div class="muted">written: ${esc(t.writtenAs)}</div>` : ""}</td>
        <td><span class="badge">${esc(t.confidence)}</span></td></tr>`
    )
    .join("");

  return `<p class="muted">${meta}</p>
    <h4>Medicines (${g.medicines.length})</h4>
    ${g.medicines.length ? `<table><tr><th>OK</th><th>Medicine</th><th>Dosage</th><th>Duration</th><th>Qty</th><th>Instructions</th><th>Conf.</th></tr>${medRows}</table>` : "<p class=\"muted\">None found</p>"}
    <h4>Tests (${g.tests.length})</h4>
    ${g.tests.length ? `<table><tr><th>OK</th><th>Test</th><th>Conf.</th></tr>${testRows}</table>` : "<p class=\"muted\">None found</p>"}
    ${g.unreadableNotes ? `<p class="warn">Unreadable: ${esc(g.unreadableNotes)}</p>` : ""}
    <label class="missed">Lines Gemini missed: <input type="number" min="0" value="0" data-missed="${esc(r.file)}"></label>`;
}

function renderTesseract(r: FileResult): string {
  if (SKIP_TESSERACT) return "";
  if (r.tesseractError) return `<p class="err">Tesseract error: ${esc(r.tesseractError)}</p>`;
  if (!r.tesseract) return "<p class=\"muted\">Skipped (PDF)</p>";
  const t = r.tesseract;
  const list = (items: string[]) =>
    items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p class=\"muted\">None</p>";
  return `<p class="muted">Time: ${((r.tesseractMs ?? 0) / 1000).toFixed(1)}s</p>
    <h4>Medicines (${t.medicines.length})</h4>${list(t.medicines)}
    <h4>Tests (${t.tests.length})</h4>${list(t.tests)}
    <details><summary>Raw OCR text</summary><pre>${esc(t.rawText)}</pre></details>`;
}

function renderReport(results: FileResult[]): string {
  const cards = results
    .map(
      (r) => `<section class="card">
        <h3>${esc(r.file)}</h3>
        <div class="grid${SKIP_TESSERACT ? " two" : ""}">
          <div class="img">${
            r.file.toLowerCase().endsWith(".pdf")
              ? `<a href="input/${encodeURIComponent(r.file)}" target="_blank">Open PDF</a>`
              : `<a href="input/${encodeURIComponent(r.file)}" target="_blank"><img src="input/${encodeURIComponent(r.file)}" alt=""></a>`
          }</div>
          <div><h4 class="col">Gemini (${esc(MODEL)})</h4>${renderGemini(r)}</div>
          ${SKIP_TESSERACT ? "" : `<div><h4 class="col">Current OCR (Tesseract)</h4>${renderTesseract(r)}</div>`}
        </div>
      </section>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Gemini prescription test</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}
header{position:sticky;top:0;background:#0f766e;color:#fff;padding:12px 20px;z-index:1}
header p{margin:4px 0 0;font-size:14px}
main{padding:16px 20px}
.card{background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:16px;box-shadow:0 1px 3px #0002}
.card h3{margin:0 0 10px;font-size:15px}
.grid{display:grid;grid-template-columns:minmax(220px,1fr) 2fr 1.2fr;gap:16px;align-items:start}
.grid.two{grid-template-columns:minmax(220px,1fr) 2fr}
.img img{width:100%;border:1px solid #e2e8f0;border-radius:6px}
h4{margin:10px 0 6px;font-size:13px}
h4.col{margin-top:0;font-size:14px;color:#0f766e}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #e2e8f0;padding:5px 6px;text-align:left;vertical-align:top}
th{background:#f8fafc}
td.chk{text-align:center;width:28px}
tr.c-LOW{background:#fee2e2}tr.c-MEDIUM{background:#fef9c3}
.badge{font-size:11px;font-weight:600}
.muted{color:#64748b;font-size:12px}
.err{color:#b91c1c}.warn{color:#92400e;font-size:13px}
.missed{display:block;margin-top:8px;font-size:13px}.missed input{width:60px}
pre{white-space:pre-wrap;font-size:12px;background:#f8fafc;padding:8px;border-radius:6px}
ul{margin:0;padding-left:18px;font-size:13px}
</style></head><body>
<header><strong>Gemini prescription test</strong> — ${results.length} file(s), model ${esc(MODEL)}
<p>Tick every Gemini line that is correct and enter how many lines it missed. Red = LOW confidence, yellow = MEDIUM.
<strong id="score"></strong></p></header>
<main>${cards}</main>
<script>
const KEY='gemini-rx-test';
const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
const boxes=[...document.querySelectorAll('input[data-id]')];
const missed=[...document.querySelectorAll('input[data-missed]')];
boxes.forEach(b=>{b.checked=!!saved['c:'+b.dataset.id];});
missed.forEach(m=>{m.value=saved['m:'+m.dataset.missed]||0;});
function update(){
  const s={};boxes.forEach(b=>{if(b.checked)s['c:'+b.dataset.id]=1;});
  let miss=0;missed.forEach(m=>{const n=Math.max(0,parseInt(m.value||'0',10)||0);miss+=n;if(n)s['m:'+m.dataset.missed]=n;});
  localStorage.setItem(KEY,JSON.stringify(s));
  const ok=boxes.filter(b=>b.checked).length,total=boxes.length+miss;
  document.getElementById('score').textContent=' Score: '+ok+' correct out of '+total+' real lines'+(total?' ('+Math.round(ok*100/total)+'%)':'');
}
document.addEventListener('input',update);update();
</script></body></html>`;
}

async function main(): Promise<void> {
  if (!isGeminiConfigured()) {
    console.error("GEMINI_API_KEY is missing. Add it to Btbiz_backend/.env and run again.");
    process.exit(1);
  }
  fs.mkdirSync(INPUT_DIR, { recursive: true });
  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((f) => MIME_BY_EXT[path.extname(f).toLowerCase()])
    .sort();
  if (!files.length) {
    console.error(`No images found. Put prescription photos (jpg/png/webp/pdf) in:\n  ${INPUT_DIR}`);
    process.exit(1);
  }

  console.log(`Testing ${files.length} file(s) with ${MODEL}${SKIP_TESSERACT ? "" : " + Tesseract"}...\n`);
  const results: FileResult[] = [];

  for (const [i, file] of files.entries()) {
    const filePath = path.join(INPUT_DIR, file);
    const mimeType = MIME_BY_EXT[path.extname(file).toLowerCase()]!;
    const result: FileResult = { file };
    process.stdout.write(`[${i + 1}/${files.length}] ${file} ... `);

    const g0 = Date.now();
    try {
      result.gemini = await extractPrescriptionWithGemini(fs.readFileSync(filePath), mimeType);
    } catch (error) {
      result.geminiError = error instanceof Error ? error.message : String(error);
    }
    result.geminiMs = Date.now() - g0;

    if (!SKIP_TESSERACT && mimeType !== "application/pdf") {
      const t0 = Date.now();
      try {
        result.tesseract = await runTesseract(filePath);
      } catch (error) {
        result.tesseractError = error instanceof Error ? error.message : String(error);
      }
      result.tesseractMs = Date.now() - t0;
    }

    console.log(
      result.geminiError
        ? `Gemini failed: ${result.geminiError}`
        : `${result.gemini!.medicines.length} medicines, ${result.gemini!.tests.length} tests`
    );
    results.push(result);
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify({ model: MODEL, results }, null, 2));
  fs.writeFileSync(REPORT_PATH, renderReport(results));
  console.log(`\nReport: ${REPORT_PATH}\nRaw JSON: ${RESULTS_PATH}`);
}

void main();
