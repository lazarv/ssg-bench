// Run the bench across the documented PAGE_COUNT sweep.
// Each step delegates to bench/run.mjs so result files stay one-per-step.

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const STEPS = (
  process.env.STEPS ?? "1000,10000,100000,200000,300000,400000,500000"
)
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);

// Install a tiny SIGINT/TERM/HUP handler so Node doesn't kill us with
// its default action — we want to drain the active spawnSync, then
// break out of the loop instead of charging into the next PAGE_COUNT.
// stdio: "inherit" means the run.mjs child receives the same terminal
// signal directly, so it gets a chance to clean up its own build group.
let aborted = false;
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    aborted = true;
    process.stderr.write(`\nsweep aborting (${sig})…\n`);
  });
}

for (const n of STEPS) {
  if (aborted) break;
  process.stderr.write(`\n══════ PAGE_COUNT=${n} ══════\n`);
  const r = spawnSync("node", ["bench/run.mjs"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PAGE_COUNT: String(n) },
  });
  // Child exit codes that imply abort: 130 (SIGINT), 143 (SIGTERM),
  // 129 (SIGHUP), or it died from a signal directly.
  if (
    aborted ||
    r.signal === "SIGINT" ||
    r.signal === "SIGTERM" ||
    r.status === 130 ||
    r.status === 143 ||
    r.status === 129
  ) {
    process.stderr.write(`sweep aborted at PAGE_COUNT=${n}\n`);
    process.exit(130);
  }
  if (r.status !== 0) {
    process.stderr.write(`step PAGE_COUNT=${n} exited with ${r.status}\n`);
  }
}
