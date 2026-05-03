import { rm } from "node:fs/promises";
import path from "node:path";
import { frameworks } from "./frameworks.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

for (const fw of frameworks) {
  const cwd = path.join(ROOT, fw.dir);
  await rm(path.join(cwd, fw.outDir), { recursive: true, force: true });
  for (const g of fw.cleanGlobs ?? []) {
    await rm(path.join(cwd, g), { recursive: true, force: true });
  }
  process.stderr.write(`cleaned ${fw.dir}/{${fw.outDir}${(fw.cleanGlobs ?? []).map((c) => `,${c}`).join("")}}\n`);
}

await rm(path.join(ROOT, "bench/results"), { recursive: true, force: true });
process.stderr.write(`cleaned bench/results\n`);
