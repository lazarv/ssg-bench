// Read every result file under bench/results and emit a Markdown
// report. For each (PAGE_COUNT, framework) cell, pick a SINGLE run
// — the fastest successful one — and emit that run's numbers as-is.
// No averaging, no across-runs summary columns; every value in a row
// is the literal record from one actual build.
//
// Selection rule, per cell:
//   1. Prefer status `ok` > `warn` > `ERR`.
//   2. Within the best status group, lowest `wallMs` wins.
//
// Usage:
//   node bench/report.mjs                 # writes bench/REPORT.md
//   node bench/report.mjs path/to/out.md  # custom output path
//
// Stdout shows the same table; redirect the output if you only want the
// file write log: `pnpm report > /dev/null`.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { frameworks } from "./frameworks.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RESULTS_DIR = path.join(ROOT, "bench/results");
const OUT_PATH = path.resolve(ROOT, process.argv[2] ?? "bench/REPORT.md");

// ─── formatting ──────────────────────────────────────────────────────
function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
function fmtBytes(b) {
  if (b == null || !Number.isFinite(b)) return "—";
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KiB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MiB`;
  return `${(b / 1024 ** 3).toFixed(2)} GiB`;
}
function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

// ─── load + group ────────────────────────────────────────────────────
const files = (await readdir(RESULTS_DIR).catch(() => [])).filter((f) =>
  f.endsWith(".json"),
);
if (files.length === 0) {
  process.stderr.write("no results — run `pnpm bench` first\n");
  process.exit(1);
}

/** @type {Array<any & { _file: string }>} */
const allRecords = [];
for (const f of files.sort()) {
  let j;
  try {
    j = JSON.parse(await readFile(path.join(RESULTS_DIR, f), "utf8"));
  } catch (e) {
    process.stderr.write(`skipping ${f}: ${e.message}\n`);
    continue;
  }
  for (const r of j.records ?? []) {
    allRecords.push({ ...r, _file: f, _pageCount: j.pageCount });
  }
}

// (PAGE_COUNT, framework_id) → records
/** @type {Map<string, any[]>} */
const cells = new Map();
for (const r of allRecords) {
  const k = `${r._pageCount}|${r.framework}`;
  const arr = cells.get(k) ?? [];
  arr.push(r);
  cells.set(k, arr);
}

// ─── pick the single representative run for a cell ───────────────────
function statusRank(r) {
  if (r.status === "ok") return 0;
  if (r.status === "warn") return 1;
  return 2; // ERR or unknown
}

function pickBest(records) {
  return [...records].sort((a, b) => {
    const dr = statusRank(a) - statusRank(b);
    if (dr !== 0) return dr;
    return (a.wallMs ?? Infinity) - (b.wallMs ?? Infinity);
  })[0];
}

function statusLabel(r) {
  return r.status ?? (r.ok ? "ok" : "ERR");
}

// ─── emit ────────────────────────────────────────────────────────────
const pageCounts = [...new Set(allRecords.map((r) => r._pageCount))].sort(
  (a, b) => a - b,
);
// Use the canonical framework order from frameworks.mjs so columns are
// stable across runs even when only a subset has results.
const orderedFwIds = frameworks.map((f) => f.id);
const presentFwIds = new Set(allRecords.map((r) => r.framework));
const orderedPresent = orderedFwIds.filter((id) => presentFwIds.has(id));
// In case future result files reference a framework no longer in the
// registry, keep them at the end rather than dropping data.
const extraFws = [...presentFwIds].filter((id) => !orderedFwIds.includes(id));
const fws = [...orderedPresent, ...extraFws];

const lines = [];
lines.push("# SSG benchmark report");
lines.push("");
lines.push(`_Generated: ${new Date().toISOString()}_`);
lines.push("");
lines.push(
  `Read **${allRecords.length}** records from **${files.length}** result ` +
    `files across **${pageCounts.length}** page count(s) × ` +
    `**${fws.length}** framework(s). Each cell shows the **fastest ` +
    `successful run** — every value in the row comes from that single ` +
    `build, no averaging.`,
);
lines.push("");
lines.push("Columns:");
lines.push("");
lines.push("- **wall** — total build time, spawn-to-exit");
lines.push("- **ttfp** — time from build start to first `*.html` written");
lines.push("- **peak RSS** — peak resident memory across the build process tree");
lines.push("- **html** — count of HTML files in the deployable output dir");
lines.push("- **bytes** — total bytes of the deployable output dir");
lines.push("- **pages/s** — `html / wall`");
lines.push(
  "- **status** — `ok` (validated), `warn` (build exited non-zero but pages render), `ERR` (sampled HTML missing/wrong)",
);
lines.push("");

for (const pc of pageCounts) {
  lines.push(`## PAGE_COUNT = ${pc.toLocaleString()}`);
  lines.push("");
  lines.push(
    "| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |",
  );
  lines.push("| :-- | --: | --: | --: | --: | --: | --: | :-- |");
  for (const fwId of fws) {
    const recs = cells.get(`${pc}|${fwId}`);
    if (!recs) {
      const label = frameworks.find((f) => f.id === fwId)?.label ?? fwId;
      lines.push(`| ${label} | — | — | — | — | — | — | n/a |`);
      continue;
    }
    const r = pickBest(recs);
    lines.push(
      `| ${r.label ?? r.framework} | ${fmtMs(r.wallMs)} | ${fmtMs(r.ttfpMs)} | ` +
        `${fmtBytes(r.peakRssBytes)} | ${fmtInt(r.output?.html)} | ` +
        `${fmtBytes(r.output?.bytes)} | ${fmtInt(r.pagesPerSec)} | ` +
        `${statusLabel(r)} |`,
    );
  }
  lines.push("");
}

// Per-cell error footnotes — only the chosen run's first validation
// error, no aggregation across the other runs in the cell.
const errorEntries = [];
for (const [key, recs] of cells) {
  const r = pickBest(recs);
  const status = statusLabel(r);
  if (status === "ok") continue;
  const [pc, fw] = key.split("|");
  const label = r.label ?? fw;
  const detail =
    r.validation?.errors?.[0] ??
    (status === "ERR" ? "(no sampled error message)" : "build exited non-zero");
  errorEntries.push(
    `- **${label} @ PAGE_COUNT=${Number(pc).toLocaleString()}** — ${status} · ${detail}`,
  );
}
if (errorEntries.length) {
  lines.push("## Cells with warnings / errors");
  lines.push("");
  lines.push(...errorEntries);
  lines.push("");
}

const md = lines.join("\n") + "\n";
await writeFile(OUT_PATH, md);
process.stderr.write(`wrote ${path.relative(ROOT, OUT_PATH)}\n`);
process.stdout.write(md);
