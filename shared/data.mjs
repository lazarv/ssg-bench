/**
 * Deterministic post data shared across all framework apps.
 *
 * Two goals:
 *   1. Identical content per id across frameworks → fair comparison.
 *   2. No upfront materialization → callers can iterate lazily for SSG
 *      streaming (react-server) or eagerly via {@link allIds}.
 *
 * Page count is controlled by env: `PAGE_COUNT` (default 100000).
 */

const TAG_POOL = [
  "react",
  "ssr",
  "ssg",
  "rsc",
  "perf",
  "vite",
  "static",
  "html",
  "bench",
  "node",
];

/**
 * Resolved page count. Read once, at module load, so every consumer in a
 * single build sees the same number.
 * @type {number}
 */
export const PAGE_COUNT = Math.max(1, Number(process.env.PAGE_COUNT ?? 100000));

/**
 * Cheap, stable string hash → 32-bit unsigned int.
 * @param {string} s
 * @returns {number}
 */
function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * @typedef {object} Post
 * @property {number} id
 * @property {string} slug
 * @property {string} title
 * @property {string} body
 * @property {string[]} tags
 * @property {number[]} neighbors  - Up to 5 neighbour ids for cross-linking.
 */

/**
 * Build the post payload for a given id. Pure, deterministic, allocation-light
 * — meant to be safe to call millions of times across a build.
 *
 * @param {number} id
 * @returns {Post}
 */
export function getPost(id) {
  const h = hash(`post:${id}`);
  const tagCount = (h % 3) + 1;
  const tags = [];
  for (let i = 0; i < tagCount; i++) {
    tags.push(TAG_POOL[(h + i * 7) % TAG_POOL.length]);
  }

  const total = PAGE_COUNT;
  const neighbors = [];
  for (let i = 1; i <= 5; i++) {
    const n = ((id - 1 + i) % total) + 1;
    if (n !== id) neighbors.push(n);
  }

  return {
    id,
    slug: String(id),
    title: `Post #${id}`,
    body: `This is post number ${id}. Tags: ${tags.join(", ")}. Hash ${h.toString(16)}.`,
    tags,
    neighbors,
  };
}

/**
 * Eager array of every id. Use only when the framework requires a
 * materialized list (Next/Astro/TanStack/Gatsby).
 * @returns {number[]}
 */
export function allIds() {
  const a = new Array(PAGE_COUNT);
  for (let i = 0; i < PAGE_COUNT; i++) a[i] = i + 1;
  return a;
}

/**
 * Lazy id iterator. Use for streaming exports (react-server) so peak
 * memory stays at O(1).
 * @returns {Generator<number>}
 */
export function* idStream() {
  for (let i = 1; i <= PAGE_COUNT; i++) yield i;
}
