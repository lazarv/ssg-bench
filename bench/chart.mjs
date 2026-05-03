// Read every result file under bench/results, pick the fastest
// successful run per (PAGE_COUNT, framework) cell, and emit one SVG
// chart per metric to bench/charts/. Hand-rolled SVG, no deps.
//
// Charts produced:
//   wall.svg            — total build time vs PAGE_COUNT (log y)
//   ttfp.svg            — time to first page  vs PAGE_COUNT (log y)
//   peak-rss.svg        — peak resident memory vs PAGE_COUNT (log y)
//   pages-per-sec.svg   — throughput          vs PAGE_COUNT (linear y)
//   bytes.svg           — output size         vs PAGE_COUNT (log y)
//
// X axis is always log(PAGE_COUNT) — the data spans 2-3 decades and a
// linear x would smash everything but the largest count into one pixel.
//
// Selection rule per cell: status `ok` > `warn` > `ERR`, then lowest
// `wallMs`. ERR cells are dropped from charts (no honest curve goes
// through a failed build); warn cells are plotted with a hollow marker
// to flag them visually.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { frameworks } from "./frameworks.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RESULTS_DIR = path.join(ROOT, "bench/results");
const CHARTS_DIR = path.join(ROOT, "bench/charts");

// Dark-mode data-viz palette — Tailwind 400-series. Lighter hues read
// brighter on a near-black background; saturation matches across series
// so no single line dominates by hue.
const COLORS = {
  "react-server": "#60a5fa", // blue-400
  next: "#f4f4f5", // zinc-100 — Next's brand black inverted to near-white
  tanstack: "#f472b6", // pink-400
  gatsby: "#a78bfa", // violet-400
  astro: "#fb923c", // orange-400
};
const FALLBACK_COLOR = "#a1a1aa";

// Background + neutral ramp inverted for dark canvas. Halos and marker
// pinholes use BG so the "lit" effect reads against a dark plot area.
const BG = "#0a0a0b"; // canvas
const INK = {
  fg: "#fafafa", // zinc-50  — title
  body: "#d4d4d8", // zinc-300 — axis titles
  muted: "#a1a1aa", // zinc-400 — subtitle, ticks
  faint: "#71717a", // zinc-500 — footer
  rule: "#3f3f46", // zinc-700 — axis baseline
  grid: "#1f1f22", // between zinc-900/800 — minor grid (dashed)
  gridStrong: "#3f3f46", // zinc-700 — bottom-decade grid line
};

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Inter var', 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif";

// ─── load + group ────────────────────────────────────────────────────
const files = (await readdir(RESULTS_DIR).catch(() => [])).filter((f) =>
  f.endsWith(".json"),
);
if (files.length === 0) {
  process.stderr.write("no results — run `pnpm bench` first\n");
  process.exit(1);
}

const allRecords = [];
for (const f of files.sort()) {
  let j;
  try {
    j = JSON.parse(await readFile(path.join(RESULTS_DIR, f), "utf8"));
  } catch (e) {
    process.stderr.write(`skipping ${f}: ${e.message}\n`);
    continue;
  }
  for (const r of j.records ?? [])
    allRecords.push({ ...r, _pageCount: j.pageCount });
}

/** @type {Map<string, any[]>} */
const cells = new Map();
for (const r of allRecords) {
  const k = `${r._pageCount}|${r.framework}`;
  const arr = cells.get(k) ?? [];
  arr.push(r);
  cells.set(k, arr);
}

// ─── selection: same rule as report.mjs ──────────────────────────────
function statusRank(r) {
  if (r.status === "ok") return 0;
  if (r.status === "warn") return 1;
  return 2;
}
function statusOf(r) {
  return r.status ?? (r.ok ? "ok" : "ERR");
}
function pickBest(records) {
  return [...records].sort((a, b) => {
    const dr = statusRank(a) - statusRank(b);
    if (dr !== 0) return dr;
    return (a.wallMs ?? Infinity) - (b.wallMs ?? Infinity);
  })[0];
}

const pageCounts = [...new Set(allRecords.map((r) => r._pageCount))].sort(
  (a, b) => a - b,
);
const presentFwIds = new Set(allRecords.map((r) => r.framework));
const fws = frameworks.filter((f) => presentFwIds.has(f.id));

// ─── formatting ──────────────────────────────────────────────────────
function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
function fmtBytes(b) {
  if (b == null || !Number.isFinite(b)) return "";
  if (b < 1024) return `${Math.round(b)}B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)}KiB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(0)}MiB`;
  return `${(b / 1024 ** 3).toFixed(1)}GiB`;
}
function fmtCount(n) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Round a positive value up to 1·10^n, 2·10^n, or 5·10^n — common
 *  axis tick anchors that read cleanly. */
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const exp = Math.floor(Math.log10(v));
  const mant = v / 10 ** exp;
  const niceMant = mant <= 1 ? 1 : mant <= 2 ? 2 : mant <= 5 ? 5 : 10;
  return niceMant * 10 ** exp;
}

// ─── chart renderer ──────────────────────────────────────────────────
/**
 * @param {object} cfg
 * @param {string} cfg.title
 * @param {string} cfg.subtitle
 * @param {string} cfg.eyebrow
 * @param {string} cfg.yLabel
 * @param {(r: any) => number | null | undefined} cfg.getValue
 * @param {"log"|"linear"} cfg.yScale
 * @param {(v: number) => string} cfg.fmtY
 * @param {string} cfg.footer
 */
function renderChart(cfg) {
  const W = 1200;
  const H = 700;
  const PAD = { l: 110, r: 260, t: 120, b: 130 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const plotBottom = PAD.t + plotH;
  const plotRight = PAD.l + plotW;

  // Build series, dropping ERR cells and non-finite values.
  const series = fws
    .map((fw) => {
      const points = [];
      for (const pc of pageCounts) {
        const recs = cells.get(`${pc}|${fw.id}`);
        if (!recs) continue;
        const r = pickBest(recs);
        const status = statusOf(r);
        if (status === "ERR") continue;
        const v = cfg.getValue(r);
        if (v == null || !Number.isFinite(v) || v <= 0) continue;
        points.push({ x: pc, y: v, status });
      }
      return { fw, points };
    })
    .filter((s) => s.points.length > 0);

  if (series.length === 0) return null;

  // X projection: log10 over the actual data range
  const xMin = Math.min(...pageCounts);
  const xMax = Math.max(...pageCounts);
  const lxMin = Math.log10(xMin);
  const lxRange = Math.max(Math.log10(xMax) - lxMin, 1e-9);
  const projX = (v) => PAD.l + ((Math.log10(v) - lxMin) / lxRange) * plotW;

  // Y projection
  const yVals = series.flatMap((s) => s.points.map((p) => p.y));
  let yMin, yMax, projY, yTicks;
  if (cfg.yScale === "log") {
    const rawMin = Math.min(...yVals);
    const rawMax = Math.max(...yVals);
    const lyMin = Math.floor(Math.log10(rawMin));
    const lyMax = Math.ceil(Math.log10(rawMax));
    yMin = 10 ** lyMin;
    yMax = 10 ** Math.max(lyMax, lyMin + 1);
    const lyRange = Math.log10(yMax) - Math.log10(yMin);
    projY = (v) =>
      PAD.t + plotH - ((Math.log10(v) - Math.log10(yMin)) / lyRange) * plotH;
    yTicks = [];
    for (let l = lyMin; l <= Math.log10(yMax); l++) yTicks.push(10 ** l);
  } else {
    const rawMax = Math.max(...yVals);
    yMin = 0;
    yMax = niceCeil(rawMax * 1.1);
    projY = (v) => PAD.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const N = 5;
    yTicks = [];
    for (let i = 0; i <= N; i++) yTicks.push(yMin + ((yMax - yMin) * i) / N);
  }

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${escapeXml(FONT_STACK)}" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">`,
  );

  // ─── defs: per-series area gradients ─────────────────────────────
  out.push(`<defs>`);
  for (const s of series) {
    const color = COLORS[s.fw.id] ?? FALLBACK_COLOR;
    const id = `g-${s.fw.id}`;
    out.push(
      `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">` +
        `<stop offset="0" stop-color="${color}" stop-opacity="0.18"/>` +
        `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
        `</linearGradient>`,
    );
  }
  out.push(`</defs>`);

  // ─── canvas ──────────────────────────────────────────────────────
  out.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);

  // ─── editorial header (eyebrow + title + subtitle) ───────────────
  if (cfg.eyebrow) {
    out.push(
      `<text x="${PAD.l}" y="50" font-size="11" font-weight="600" letter-spacing="1.2" fill="${COLORS["react-server"]}">${escapeXml(cfg.eyebrow.toUpperCase())}</text>`,
    );
  }
  out.push(
    `<text x="${PAD.l}" y="80" font-size="26" font-weight="700" letter-spacing="-0.4" fill="${INK.fg}">${escapeXml(cfg.title)}</text>`,
  );
  out.push(
    `<text x="${PAD.l}" y="102" font-size="13" font-weight="400" fill="${INK.muted}">${escapeXml(cfg.subtitle)}</text>`,
  );

  // ─── grid ────────────────────────────────────────────────────────
  // Horizontal: light dashed lines at every tick. For log y, the
  // bottom decade gets a slightly stronger color to anchor the axis.
  for (const v of yTicks) {
    const py = projY(v);
    const isBottom = v === yTicks[0];
    const stroke = isBottom ? INK.gridStrong : INK.grid;
    out.push(
      `<line x1="${PAD.l}" x2="${plotRight}" y1="${py.toFixed(1)}" y2="${py.toFixed(1)}" stroke="${stroke}" stroke-width="1" stroke-dasharray="${isBottom ? "" : "3 3"}"/>`,
    );
  }

  // Y tick labels (tabular numerals for clean alignment)
  for (const v of yTicks) {
    const py = projY(v);
    out.push(
      `<text x="${PAD.l - 12}" y="${(py + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="${INK.muted}" font-variant-numeric="tabular-nums">${escapeXml(cfg.fmtY(v))}</text>`,
    );
  }

  // X baseline (faintly emphatic) and tick marks
  out.push(
    `<line x1="${PAD.l}" x2="${plotRight}" y1="${plotBottom}" y2="${plotBottom}" stroke="${INK.rule}" stroke-width="1.25"/>`,
  );

  // X ticks + rotated compact labels (1k / 10k / 100k / 200k …)
  for (const pc of pageCounts) {
    const px = projX(pc);
    const labelY = plotBottom + 16;
    out.push(
      `<line x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${plotBottom}" y2="${plotBottom + 6}" stroke="${INK.muted}" stroke-width="1"/>`,
    );
    out.push(
      `<text x="${px.toFixed(1)}" y="${labelY}" font-size="11" text-anchor="end" fill="${INK.muted}" font-variant-numeric="tabular-nums" transform="rotate(-35 ${px.toFixed(1)} ${labelY})">${escapeXml(fmtCount(pc))}</text>`,
    );
  }

  // Axis titles
  out.push(
    `<text x="${(PAD.l + plotW / 2).toFixed(1)}" y="${H - 50}" font-size="12" font-weight="500" text-anchor="middle" fill="${INK.body}">PAGE_COUNT (log scale)</text>`,
  );
  out.push(
    `<text x="34" y="${(PAD.t + plotH / 2).toFixed(1)}" font-size="12" font-weight="500" text-anchor="middle" fill="${INK.body}" transform="rotate(-90 34 ${(PAD.t + plotH / 2).toFixed(1)})">${escapeXml(cfg.yLabel)}</text>`,
  );

  // ─── series: gradient area then line then markers ────────────────
  for (const s of series) {
    const color = COLORS[s.fw.id] ?? FALLBACK_COLOR;
    const id = `g-${s.fw.id}`;

    // Area path: line of points → down to baseline → close
    const linePts = s.points.map((p) => ({
      x: projX(p.x),
      y: projY(p.y),
    }));
    const first = linePts[0];
    const last = linePts[linePts.length - 1];
    const areaD =
      `M${first.x.toFixed(1)},${plotBottom} ` +
      `L${first.x.toFixed(1)},${first.y.toFixed(1)} ` +
      linePts
        .slice(1)
        .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        .join(" ") +
      ` L${last.x.toFixed(1)},${plotBottom} Z`;
    out.push(
      `<path d="${areaD}" fill="url(#${id})" stroke="none"/>`,
    );

    // Line itself
    const polyPts = linePts
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    out.push(
      `<polyline points="${polyPts}" fill="none" stroke="${color}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/>`,
    );

    // Markers: bg-colored halo + colored donut (warn = hollow ring).
    // Halo punches out the line behind the marker so the donut reads
    // crisply where the line crosses underneath.
    for (const p of s.points) {
      const px = projX(p.x).toFixed(1);
      const py = projY(p.y).toFixed(1);
      out.push(
        `<circle cx="${px}" cy="${py}" r="7.5" fill="${BG}" stroke="none"/>`,
      );
      if (p.status === "warn") {
        out.push(
          `<circle cx="${px}" cy="${py}" r="5" fill="${BG}" stroke="${color}" stroke-width="2.25"/>`,
        );
      } else {
        out.push(
          `<circle cx="${px}" cy="${py}" r="5" fill="${color}" stroke="${BG}" stroke-width="1.5"/>`,
        );
      }
    }
  }

  // ─── legend ──────────────────────────────────────────────────────
  const legendX = plotRight + 32;
  let legendY = PAD.t + 4;
  for (const s of series) {
    const color = COLORS[s.fw.id] ?? FALLBACK_COLOR;
    // small line segment + marker overlay
    out.push(
      `<line x1="${legendX}" x2="${legendX + 28}" y1="${legendY + 7}" y2="${legendY + 7}" stroke="${color}" stroke-width="2.75" stroke-linecap="round"/>`,
    );
    out.push(
      `<circle cx="${legendX + 14}" cy="${legendY + 7}" r="5" fill="${color}" stroke="${BG}" stroke-width="1.5"/>`,
    );
    out.push(
      `<text x="${legendX + 40}" y="${legendY + 11}" font-size="13" font-weight="500" fill="${INK.fg}">${escapeXml(s.fw.label)}</text>`,
    );
    legendY += 28;
  }

  // warn marker legend, only if any cell is warn
  const anyWarn = series.some((s) =>
    s.points.some((p) => p.status === "warn"),
  );
  if (anyWarn) {
    legendY += 8;
    out.push(
      `<circle cx="${legendX + 14}" cy="${legendY + 7}" r="5" fill="${BG}" stroke="${INK.muted}" stroke-width="2"/>`,
    );
    out.push(
      `<text x="${legendX + 40}" y="${legendY + 11}" font-size="12" font-weight="400" fill="${INK.muted}">hollow = warn</text>`,
    );
  }

  // ─── footer ──────────────────────────────────────────────────────
  if (cfg.footer) {
    out.push(
      `<text x="${plotRight}" y="${H - 18}" font-size="11" font-weight="400" text-anchor="end" fill="${INK.faint}">${escapeXml(cfg.footer)}</text>`,
    );
  }

  out.push(`</svg>`);
  return out.join("\n");
}

// ─── emit ────────────────────────────────────────────────────────────
await mkdir(CHARTS_DIR, { recursive: true });

const eyebrow = "SSG benchmark";
const subtitle = `Best successful run per cell · ${pageCounts.length} page counts × ${fws.length} frameworks`;
const footer = `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${allRecords.length} runs from ${files.length} result files`;

const charts = [
  {
    name: "wall",
    title: "Build wall time",
    yLabel: "wall time",
    yScale: "log",
    getValue: (r) => r.wallMs,
    fmtY: fmtMs,
  },
  {
    name: "ttfp",
    title: "Time to first page",
    yLabel: "ttfp",
    yScale: "log",
    getValue: (r) => r.ttfpMs,
    fmtY: fmtMs,
  },
  {
    name: "peak-rss",
    title: "Peak resident memory",
    yLabel: "peak RSS",
    yScale: "log",
    getValue: (r) => r.peakRssBytes,
    fmtY: fmtBytes,
  },
  {
    name: "pages-per-sec",
    title: "Throughput",
    yLabel: "pages / second",
    yScale: "linear",
    getValue: (r) => r.pagesPerSec,
    fmtY: fmtCount,
  },
  {
    name: "bytes",
    title: "Deployable output size",
    yLabel: "total bytes",
    yScale: "log",
    getValue: (r) => r.output?.bytes,
    fmtY: fmtBytes,
  },
];

/** @type {string[]} */
const writtenSvgs = [];
for (const c of charts) {
  const svg = renderChart({ ...c, eyebrow, subtitle, footer });
  if (!svg) {
    process.stderr.write(`skipping ${c.name}.svg: no plottable data\n`);
    continue;
  }
  const file = path.join(CHARTS_DIR, `${c.name}.svg`);
  await writeFile(file, svg + "\n");
  writtenSvgs.push(file);
  process.stderr.write(`wrote ${path.relative(ROOT, file)}\n`);
}

// Optional PNG side-output for venues that don't render SVG inline
// (notably dev.to). Requires `rsvg-convert` (Homebrew: `librsvg`,
// apt: `librsvg2-bin`). Skipped silently if unavailable so the chart
// step still works for everyone.
const RSVG = spawnSync("rsvg-convert", ["--version"], { stdio: "ignore" });
if (RSVG.status === 0 && writtenSvgs.length > 0) {
  for (const svgPath of writtenSvgs) {
    const pngPath = svgPath.replace(/\.svg$/, ".png");
    const r = spawnSync("rsvg-convert", ["-w", "1800", "-o", pngPath, svgPath], {
      stdio: "inherit",
    });
    if (r.status === 0) {
      process.stderr.write(`wrote ${path.relative(ROOT, pngPath)}\n`);
    } else {
      process.stderr.write(
        `rsvg-convert failed for ${path.relative(ROOT, svgPath)} (status ${r.status})\n`,
      );
    }
  }
} else if (writtenSvgs.length > 0) {
  process.stderr.write(
    `rsvg-convert not found; skipped PNG export. Install with ` +
      `\`brew install librsvg\` (macOS) or \`apt install librsvg2-bin\` ` +
      `(Linux) if you need PNGs for dev.to / similar venues.\n`,
  );
}
