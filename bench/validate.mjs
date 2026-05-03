import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Pick a deterministic spread of ids: 1, last, and three across the middle.
 * @param {number} n
 * @returns {number[]}
 */
export function sampleIds(n) {
  if (n <= 5) return Array.from({ length: n }, (_, i) => i + 1);
  return [1, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n];
}

/**
 * Confirm that a given id was rendered by checking the file exists and
 * its body contains the deterministic title. Returns null on success or
 * a string describing the first failure.
 *
 * @param {import("./frameworks.mjs").Framework} fw
 * @param {number} id
 * @returns {Promise<string | null>}
 */
async function validateOne(fw, id) {
  const cwd = path.join(ROOT, fw.dir);
  const outDir = path.join(cwd, fw.outDir);
  const candidates = fw.htmlFor(id);
  for (const rel of candidates) {
    const abs = path.join(outDir, rel);
    if (!existsSync(abs)) continue;
    const html = await readFile(abs, "utf8");
    if (!html.includes(`Post #${id}`)) {
      return `${fw.id} id=${id}: file ${rel} present but missing 'Post #${id}'`;
    }
    return null;
  }
  return `${fw.id} id=${id}: no output found at ${candidates.join(" | ")}`;
}

/**
 * @param {import("./frameworks.mjs").Framework} fw
 * @param {number} pageCount
 */
export async function validateSamples(fw, pageCount) {
  const ids = sampleIds(pageCount);
  const errors = [];
  for (const id of ids) {
    const err = await validateOne(fw, id);
    if (err) errors.push(err);
  }
  return { sampled: ids.length, errors };
}
