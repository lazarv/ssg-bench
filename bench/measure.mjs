import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  rm,
  lstat,
  watch as fsWatch,
  stat,
  readdir,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

// ────────────────────────────────────────────────────────────────────
// Signal handling for the active build child group.
//
// Builds are spawned with `detached: true` so the child becomes a
// process-group leader (pgid === child.pid). Killing `-pgid` then
// signals every descendant (vite/esbuild/Next worker pool/Gatsby
// worker pool/...) in one shot. Without this, a ^C on the bench
// leaves orphaned `node server.js` workers reparented to init.
//
// First INT/TERM/HUP: forward SIGTERM to the child group, escalate
// to SIGKILL after 5s. Second signal: SIGKILL immediately and exit.
// ────────────────────────────────────────────────────────────────────

/** @type {{ pgid: number } | null} */
let active = null;
let aborting = false;
let signalsInstalled = false;

function killActive(signal) {
  if (!active) return;
  try {
    process.kill(-active.pgid, signal);
  } catch {
    /* group already gone */
  }
}

function installSignalHandlers() {
  if (signalsInstalled) return;
  signalsInstalled = true;
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      if (!aborting) {
        aborting = true;
        process.stderr.write(
          `\n${sig} — terminating active build group; ^C again to force\n`,
        );
        killActive("SIGTERM");
        const t = setTimeout(() => {
          process.stderr.write(`build group did not exit within 5s, SIGKILL\n`);
          killActive("SIGKILL");
        }, 5000);
        t.unref();
      } else {
        // Second strike: kill hard and bail.
        killActive("SIGKILL");
        process.exit(130);
      }
    });
  }
  // Last-resort cleanup if the parent exits any other way.
  process.on("exit", () => killActive("SIGKILL"));
}

/** Whether a SIGINT/TERM/HUP has been observed. The runner loop
 *  consults this to break early instead of continuing to the next app. */
export function isAborting() {
  return aborting;
}

/**
 * Sum RSS (KiB) for a process and all of its descendants. Macos / Linux ps.
 * Returns 0 if the process group is gone.
 *
 * @param {number} rootPid
 * @returns {number} total RSS in bytes
 */
function rssTreeBytes(rootPid) {
  let out;
  try {
    out = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss="], {
      encoding: "utf8",
    });
  } catch {
    return 0;
  }
  /** @type {Map<number, { ppid: number, rss: number }>} */
  const procs = new Map();
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
    if (!m) continue;
    procs.set(Number(m[1]), { ppid: Number(m[2]), rss: Number(m[3]) });
  }
  /** @type {Map<number, number[]>} */
  const children = new Map();
  for (const [pid, p] of procs) {
    const arr = children.get(p.ppid) ?? [];
    arr.push(pid);
    children.set(p.ppid, arr);
  }
  let total = 0;
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    const p = procs.get(pid);
    if (!p) continue;
    total += p.rss;
    const kids = children.get(pid);
    if (kids) stack.push(...kids);
  }
  // ps reports RSS in KiB on macOS/Linux.
  return total * 1024;
}

/**
 * Recursively walk dir, count files and sum bytes; also count *.html files.
 *
 * @param {string} dir
 * @returns {Promise<{ files: number, html: number, bytes: number }>}
 */
export async function measureOutput(dir) {
  const acc = { files: 0, html: 0, bytes: 0 };
  if (!existsSync(dir)) return acc;
  /** @type {string[]} */
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(current, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
      } else if (ent.isFile()) {
        acc.files++;
        if (p.endsWith(".html")) acc.html++;
        try {
          const st = await stat(p);
          acc.bytes += st.size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return acc;
}

/**
 * Watch outDir for the first *.html file, record monotonic ms relative
 * to a `start` reference. AbortController stops the watch at end of run.
 *
 * @param {string} outDir
 * @param {number} startMs
 * @param {AbortSignal} signal
 * @returns {Promise<number | null>}
 */
async function watchTtfp(outDir, startMs, signal) {
  await mkdir(outDir, { recursive: true });
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };
    signal.addEventListener("abort", () => finish(null));
    (async () => {
      try {
        const ac = new AbortController();
        signal.addEventListener("abort", () => ac.abort());
        const w = fsWatch(outDir, { recursive: true, signal: ac.signal });
        for await (const ev of w) {
          if (resolved) break;
          if (
            typeof ev.filename === "string" &&
            ev.filename.endsWith(".html")
          ) {
            finish(performance.now() - startMs);
            ac.abort();
            break;
          }
        }
      } catch {
        finish(null);
      }
    })();
  });
}

/**
 * Run a single build and capture timings + memory + output stats.
 *
 * @param {import("./frameworks.mjs").Framework} fw
 * @param {{ pageCount: number, log: (s: string) => void, verbose?: boolean }} opts
 */
export async function runBuild(fw, { pageCount, log, verbose = false }) {
  const cwd = path.join(ROOT, fw.dir);
  const outDir = path.join(cwd, fw.outDir);

  // Clean previous build output + framework caches.
  // We log because at 100k pages a stale `dist/` can hold tens of
  // thousands of small files; the removal alone takes seconds and
  // looks like a hung process otherwise.
  //
  // `lstat` (not `existsSync`) on the existence check — we have to
  // catch dangling symlinks too. `existsSync` follows links and
  // returns false for a link to a missing target, but `rm`/`mkdir`
  // would still trip over the link itself.
  const cleanTargets = [
    outDir,
    ...(fw.cleanGlobs ?? []).map((g) => path.join(cwd, g)),
  ];
  for (const target of cleanTargets) {
    let present = false;
    try {
      await lstat(target);
      present = true;
    } catch {
      /* missing — nothing to do */
    }
    if (!present) continue;
    const rel = path.relative(cwd, target) || path.basename(target);
    const t0 = performance.now();
    log(`    [${fw.id}] cleaning ${rel}…`);
    await rm(target, { recursive: true, force: true });
    const dt = Math.round(performance.now() - t0);
    if (dt > 50) log(`    [${fw.id}] cleaned ${rel} in ${dt}ms`);
  }

  const env = {
    ...process.env,
    PAGE_COUNT: String(pageCount),
    NODE_ENV: "production",
    // Generous heap so we measure the framework, not the GC.
    // NODE_OPTIONS: [
    //   process.env.NODE_OPTIONS ?? "",
    //   "--max-old-space-size=8192",
    // ]
    // .filter(Boolean)
    // .join(" "),
    ...(fw.env ?? {}),
  };

  const startMs = performance.now();
  const ttfpAbort = new AbortController();
  const ttfpPromise = watchTtfp(outDir, startMs, ttfpAbort.signal);

  installSignalHandlers();

  log(`  → ${fw.label}: spawning pnpm ${fw.buildArgs.join(" ")}`);
  const child = spawn("pnpm", fw.buildArgs, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // New process group so we can `kill -pgid` the entire descendant
    // tree on signal — covers vite, esbuild, framework worker pools,
    // and anything else the build forks.
    detached: true,
  });
  active = { pgid: child.pid };

  let stderrTail = "";
  // Per-line prefix so interleaved output stays readable when many
  // frameworks run back-to-back. Stays attached even in verbose mode
  // so failure post-mortems still have the tail.
  const prefix = `    [${fw.id}] `;
  /** @type {(stream: NodeJS.WriteStream, buf: string) => string} */
  const prefixedWrite = (stream, leftover) => {
    return (b) => {
      const s = leftover + b.toString();
      const lines = s.split("\n");
      const tail = lines.pop(); // partial last line
      for (const line of lines) stream.write(prefix + line + "\n");
      return tail;
    };
  };
  let stdoutLeftover = "";
  let stderrLeftover = "";
  child.stdout.on("data", (b) => {
    if (verbose) {
      stdoutLeftover = prefixedWrite(process.stderr, stdoutLeftover)(b);
    }
    // else: drain (the pipe must be consumed) — no-op
  });
  child.stderr.on("data", (b) => {
    const s = b.toString();
    stderrTail = (stderrTail + s).slice(-4000);
    if (verbose) {
      stderrLeftover = prefixedWrite(process.stderr, stderrLeftover)(b);
    }
  });

  let peakBytes = 0;
  const poll = setInterval(() => {
    const b = rssTreeBytes(child.pid);
    if (b > peakBytes) peakBytes = b;
  }, 250);

  /** @type {{ code: number | null, signal: NodeJS.Signals | null }} */
  const exitInfo = await new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  active = null;
  clearInterval(poll);
  ttfpAbort.abort();

  // Flush any unterminated trailing bytes from the child's pipes.
  if (verbose) {
    if (stdoutLeftover) process.stderr.write(prefix + stdoutLeftover + "\n");
    if (stderrLeftover) process.stderr.write(prefix + stderrLeftover + "\n");
  }

  const endMs = performance.now();
  const ttfpMs = await ttfpPromise;
  const wallMs = endMs - startMs;
  const out = await measureOutput(outDir);

  return {
    framework: fw.id,
    label: fw.label,
    pageCount,
    ok: exitInfo.code === 0,
    exitCode: exitInfo.code,
    signal: exitInfo.signal,
    wallMs: Math.round(wallMs),
    ttfpMs: ttfpMs == null ? null : Math.round(ttfpMs),
    peakRssBytes: peakBytes,
    output: out,
    pagesPerSec:
      out.html > 0 && wallMs > 0 ? Math.round((out.html / wallMs) * 1000) : 0,
    stderrTail: exitInfo.code === 0 ? "" : stderrTail,
  };
}
