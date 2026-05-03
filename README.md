# ssg-bench

Apples-to-apples SSG benchmark: how do React-ecosystem frameworks behave
when asked to pre-render **100,000+ pages** to pure static HTML + assets,
deployable with no Node runtime at request time?

The full writeup is in [`ARTICLE.md`](./ARTICLE.md). The aggregated
results live in [`bench/REPORT.md`](./bench/REPORT.md). Charts are SVGs
in [`bench/charts/`](./bench/charts/).

Frameworks compared:

| App | Static-export mechanism | Deployable output dir |
|---|---|---|
| `apps/react-server` | `[id].static.mjs` async-generator + config-level `async *export()` (streaming, O(1) memory, `rsc: false` to skip RSC payload sidecars) | `dist/dist/` |
| `apps/next` | `next.config.mjs` `output: "export"` + `generateStaticParams` (materialized array) | `out/` |
| `apps/tanstack` | `tanstackStart({ prerender, pages: [...] })` (materialized array in `vite.config.mjs`) | `dist/client/` |
| `apps/gatsby` | `createPages` imperative loop in `gatsby-node.mjs` | `public/` |
| `apps/astro` | `getStaticPaths()` returning materialized array | `dist/` |

All five emit the same logical site: a single dynamic route `/posts/[id]`
rendering deterministic content from `shared/data.mjs`, plus an index
page. Latest version of each framework. Each app uses whatever React
version its toolchain ships with — `react-server` does not list React as
a dependency at all (the runtime owns it).

## Layout

```
ssg-test/
├── pnpm-workspace.yaml
├── ARTICLE.md           # narrative writeup of the findings
├── shared/              # deterministic post generator (PAGE_COUNT env)
├── apps/
│   ├── react-server/    # streaming async-generator export
│   ├── next/            # output: 'export'
│   ├── tanstack/        # tanstackStart prerender
│   ├── gatsby/          # createPages
│   └── astro/           # getStaticPaths
└── bench/               # measurement harness, report, chart
    ├── run.mjs          # one-shot bench at the configured PAGE_COUNT
    ├── sweep.mjs        # multi-step sweep
    ├── measure.mjs      # build spawning + RSS polling + TTFP watcher
    ├── validate.mjs     # sample HTML validator
    ├── frameworks.mjs   # per-framework config (outDir, cleanGlobs, env)
    ├── report.mjs       # → bench/REPORT.md
    ├── chart.mjs        # → bench/charts/*.svg
    ├── clean.mjs        # wipes outputs + caches + results
    └── results/         # one JSON file per run (gitignored)
```

## What's measured

For every (framework × PAGE_COUNT) cell:

- **wall** — total build time, spawn-to-exit
- **ttfp** — time from build start to the **first** `.html` written to
  the output dir (signal of streaming vs. materialize-everything)
- **peakRSS** — peak resident memory across the build process tree
  (sampled every 250ms via `ps -A -o pid,ppid,rss`)
- **html** — count of `.html` files in the deployable output dir
- **bytes** — total bytes of the deployable output dir
- **pages/s** — `html / wall`
- **status** — tri-state on top of exit code and sample validation:
  - `ok` — exit zero and 5 sampled IDs (1, N/4, N/2, 3N/4, N) all
    rendered the right `Post #{id}` content
  - `warn` — exit non-zero but every sampled page renders correctly
    (TanStack Start hits this with `failOnError: true`)
  - `ERR` — sampled HTML missing or wrong

A failing build still records its tail of stderr in the JSON; the
harness keeps going so one OOM/crash doesn't kill the whole sweep.

## Running

```bash
pnpm install

# single page count
PAGE_COUNT=1000 pnpm bench

# convenience shortcuts (env preset)
pnpm bench:1k
pnpm bench:10k
pnpm bench:100k

# sweep — defaults to 1000,10000,100000,200000,300000,400000,500000
pnpm bench:sweep

# generate the markdown report from everything in bench/results/
pnpm report                  # → bench/REPORT.md

# generate the SVG charts (dark-mode, hand-rolled, no deps)
pnpm chart                   # → bench/charts/{wall,ttfp,peak-rss,pages-per-sec,bytes}.svg

# wipe build outputs + framework caches + bench/results
pnpm clean
```

Knobs:

- `ONLY=react-server,next pnpm bench` — limit to a subset of frameworks.
- `STEPS=1000,5000,25000,100000 pnpm bench:sweep` — custom sweep steps.
- `VERBOSE=1 pnpm bench` — stream each build's stdout/stderr to the
  parent's stderr, line-prefixed with the framework id. Useful for
  diagnosing why a build hangs or fails. Also accepts `true`, `yes`,
  `on`.
- `^C` once → orderly shutdown (signal handlers forward `SIGTERM` to the
  build's process group, escalate to `SIGKILL` after 5s). `^C` twice →
  immediate hard kill.

Each `pnpm bench` invocation writes a JSON record to
`bench/results/pc{N}-{ts}.json`. `pnpm report` reads every JSON file in
that directory and picks the **fastest successful run** per cell —
status precedence `ok > warn > ERR`, then lowest `wallMs`. Every value
in a row comes from one actual build, no averaging.

## Why the streaming asymmetry matters

Of the five frameworks, only **react-server** exposes an async-generator
contract for static-path enumeration:

```js
// apps/react-server/src/pages/posts/[id].static.mjs
import { idStream } from "@ssg-test/shared";
export default async function* () {
  for (const id of idStream()) yield { id: String(id) };
}
```

Per the [react-server static docs](https://react-server.dev/router/static#streaming-static-paths),
the router pulls one descriptor at a time and starts rendering on the
first yielded path. Peak memory for the path source is `O(1)` regardless
of N, and `ttfp` is bounded by the time to render one page.

The same `async function*` shape is used at the config level to apply
options to every yielded path without breaking the streaming contract:

```js
// apps/react-server/react-server.config.mjs
export default defineConfig({
  root: "src/pages",
  async *export(paths) {
    for await (const p of paths) {
      yield { ...p, rsc: false };  // emit HTML only — no RSC payload sidecars
    }
  },
});
```

The other four require a fully materialized array up-front:

- **Next** — `generateStaticParams` returns `Array`. 100k entries exist
  before any worker forks. Above ~150k entries the build crashes with
  `RangeError: Maximum call stack size exceeded` during page-data
  collection (recursion over the params array overflows V8's stack).
- **TanStack Start** — `pages: [...]` in `vite.config.mjs`. The array is
  built inside the config module.
- **Gatsby** — `createPages` is imperative-push, but every entry is
  appended to the Redux store; memory grows linearly with N.
- **Astro** — `getStaticPaths()` returns `Array`. Astro is also the only
  entry that doesn't run React in its page-render path — included as
  the SSG-throughput ceiling rather than as a like-for-like React tool.

The benchmark is designed to surface this asymmetry, not paper over it.

## Headline numbers

At 100,000 pages (full table in [`bench/REPORT.md`](./bench/REPORT.md)):

| Framework | wall | ttfp | peak RSS | output bytes |
| :-- | --: | --: | --: | --: |
| Astro | 22.6s | 2.18s | 927 MiB | 47 MiB |
| react-server | 26.1s | **1.63s** | 2.46 GiB | **83 MiB** |
| TanStack Start | 36.9s | 2.65s | 1.62 GiB | 172 MiB |
| Gatsby | 62.1s | 7.91s | 5.89 GiB | 189 MiB |
| Next.js | 264.5s | 124s | 4.33 GiB | **1.84 GiB** |

At 200,000 pages and beyond, Next.js's build crashes (`RangeError`) and
produces no HTML. The other four scale through 500,000 pages.

## Caveats / footnotes

- **React versions are not pinned.** Each framework uses whatever React
  its toolchain pulls in. Astro doesn't render React at all in this
  setup (idiomatic `.astro` pages). This is "SSG frameworks" not "React
  renderers".
- **Trailing-slash conventions differ.** Every framework writes
  `posts/<id>/index.html`; the harness's `htmlFor()` predicate in
  `bench/frameworks.mjs` accepts a list of candidates per framework
  in case the convention changes.
- **react-server's `rsc: false`.** Without the config-level
  `async *export()` setting that flag, react-server would also emit
  per-page RSC payload sidecars (a `.x-component` file per route). For
  this benchmark the bytes column should compare HTML-only output, so
  the runtime is configured to skip those — one config option, one
  line. Next.js has no documented equivalent flag for its per-page
  `.txt` RSC payloads or its `_next/static/` runtime bundle.
- **No NODE_OPTIONS heap bump.** Earlier revisions of the harness set
  `--max-old-space-size=8192` per child; that's been removed so each
  framework runs with its toolchain's default heap. If you see an OOM
  in your own run, that's the framework's own configured ceiling
  showing.
- **The harness does no warm-up runs.** Numbers are first-run cold.
  Re-run individual cells with `ONLY=…` if you want a steady-state
  read; `pnpm report` will pick the fastest run per cell automatically.
- **ISR is intentionally out of scope.** Next.js's Incremental Static
  Regeneration is a request-time runtime feature; this benchmark
  measures pure-static deployment (no Node runtime at request time —
  the kind of build that goes onto a CDN and stays there). See the
  ISR section in [`ARTICLE.md`](./ARTICLE.md) for the longer argument.

## Disk usage

HTML at ~1KB/page lands at ~100MB per framework at 100k. With per-page
assets, that's:

- react-server / Astro: ~50–100 MB at 100k
- Gatsby / TanStack Start: ~150–200 MB at 100k
- Next.js: **1.84 GiB at 100k** (per-page `.txt` RSC payloads + the
  `_next/static/` runtime bundle)

A full sweep through 500k with all five frameworks completing fits in
roughly **8–10 GB free disk**. The 500k step alone produces ~2.5 GB of
output across the four frameworks that complete it.
