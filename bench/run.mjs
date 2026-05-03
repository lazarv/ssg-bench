// Bench runner: builds every app once for the configured PAGE_COUNT,
// records timings/memory/output stats, validates a sample of pages, and
// emits both a JSON record and a human-readable table.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { frameworks } from "./frameworks.mjs";
import { runBuild, isAborting } from "./measure.mjs";
import { validateSamples } from "./validate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RESULTS_DIR = path.join(ROOT, "bench/results");

const PAGE_COUNT = Math.max(1, Number(process.env.PAGE_COUNT ?? 1000));
const ONLY = process.env.ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const VERBOSE = /^(1|true|yes|on)$/i.test(process.env.VERBOSE ?? "");

const targets = ONLY
  ? frameworks.filter((f) => ONLY.includes(f.id))
  : frameworks;

const log = (s) => process.stderr.write(s + "\n");

function fmtMs(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
function fmtBytes(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)}KiB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)}MiB`;
  return `${(b / 1024 ** 3).toFixed(2)}GiB`;
}

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });

  log(
    `▶ SSG bench · PAGE_COUNT=${PAGE_COUNT} · ${targets.length} app(s)` +
      (VERBOSE ? " · verbose" : ""),
  );

  /** @type {Array<Awaited<ReturnType<typeof runBuild>> & { validation: any, status: string }>} */
  const records = [];
  for (const fw of targets) {
    if (isAborting()) {
      log(`  · skipping ${fw.label} — bench aborted`);
      continue;
    }
    const t0 = Date.now();
    const r = await runBuild(fw, { pageCount: PAGE_COUNT, log, verbose: VERBOSE });
    // Always validate — some frameworks (notably TanStack Start with
    // `failOnError: true`) exit non-zero while still writing every page.
    // Validation against actual rendered HTML is the source of truth.
    const validation = await validateSamples(fw, PAGE_COUNT);
    const validationOk = validation.errors.length === 0;
    const status = validationOk
      ? r.ok
        ? "ok"
        : "warn" // pages render correctly but build exited non-zero
      : "ERR";
    const rec = { ...r, validation, status, durationMs: Date.now() - t0 };
    records.push(rec);
    log(
      `  ← ${fw.label}: ${status} ` +
        `wall=${fmtMs(rec.wallMs)} ttfp=${fmtMs(rec.ttfpMs)} ` +
        `peakRSS=${fmtBytes(rec.peakRssBytes)} ` +
        `html=${rec.output.html} bytes=${fmtBytes(rec.output.bytes)} ` +
        `exit=${rec.exitCode} valid=${validationOk ? "ok" : "ERR"}`,
    );
    if (status !== "ok") {
      if (validation.errors.length) {
        log(`     validation errors: ${validation.errors.slice(0, 3).join(" | ")}`);
      }
      if (!r.ok && rec.stderrTail) {
        log(`     stderr tail:\n${rec.stderrTail.split("\n").slice(-12).join("\n")}`);
      }
    }
  }

  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const file = path.join(RESULTS_DIR, `pc${PAGE_COUNT}-${ts}.json`);
  await writeFile(
    file,
    JSON.stringify(
      { pageCount: PAGE_COUNT, runAt: new Date().toISOString(), records },
      null,
      2,
    ),
  );

  // Pretty table to stdout.
  const cols = [
    ["framework", 18],
    ["wall", 10],
    ["ttfp", 10],
    ["peakRSS", 10],
    ["html", 8],
    ["bytes", 10],
    ["pages/s", 8],
    ["status", 6],
  ];
  const head = cols.map(([n, w]) => n.padEnd(w)).join(" ");
  const rule = cols.map(([, w]) => "-".repeat(w)).join(" ");
  const out = [
    `\nPAGE_COUNT=${PAGE_COUNT}`,
    head,
    rule,
    ...records.map((r) =>
      [
        r.label.padEnd(18),
        fmtMs(r.wallMs).padEnd(10),
        fmtMs(r.ttfpMs).padEnd(10),
        fmtBytes(r.peakRssBytes).padEnd(10),
        String(r.output.html).padEnd(8),
        fmtBytes(r.output.bytes).padEnd(10),
        String(r.pagesPerSec).padEnd(8),
        r.status.padEnd(6),
      ].join(" "),
    ),
  ].join("\n");
  process.stdout.write(out + "\n");
  process.stdout.write(`\nresults → ${path.relative(ROOT, file)}\n`);

  if (isAborting()) process.exit(130);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
