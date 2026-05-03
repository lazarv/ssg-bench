// Single source of truth for what each app produces and where.
// `outDir`     — relative to the app's own directory.
// `htmlFor(id)` — predicate over candidate paths inside outDir; the first
//                 match is used to validate that page id was rendered.
// `cleanGlobs` — additional caches to wipe between runs (Gatsby in particular).

/** @typedef {{
 *   id: string,
 *   label: string,
 *   dir: string,
 *   outDir: string,
 *   buildArgs: string[],
 *   env?: Record<string, string>,
 *   htmlFor: (id: number) => string[],
 *   cleanGlobs?: string[],
 * }} Framework */

/** @type {Framework[]} */
export const frameworks = [
  {
    id: "react-server",
    label: "react-server",
    dir: "apps/react-server",
    // The deployable static site lives at `dist/dist/`; the parent
    // `dist/` also holds the server bundle and client assets used by
    // the build pipeline. We measure only the deployable portion to
    // stay apples-to-apples with the other frameworks' output dirs.
    outDir: "dist/dist",
    buildArgs: ["run", "build"],
    htmlFor: (id) => [`posts/${id}/index.html`, `posts/${id}.html`],
    cleanGlobs: ["dist"],
  },
  {
    id: "next",
    label: "Next.js",
    dir: "apps/next",
    outDir: "out",
    buildArgs: ["run", "build"],
    htmlFor: (id) => [`posts/${id}/index.html`],
    cleanGlobs: [".next"],
  },
  {
    id: "tanstack",
    label: "TanStack Start",
    dir: "apps/tanstack",
    // The deployable static site lives at `dist/client/` (Nitro
    // convention); `dist/server/` and `dist/ssr/` are build artifacts
    // not needed at request time. Measure only the deployable subtree.
    outDir: "dist/client",
    buildArgs: ["run", "build"],
    htmlFor: (id) => [`posts/${id}/index.html`],
    cleanGlobs: ["dist", ".output", ".tanstack", "src/routeTree.gen.ts"],
  },
  {
    id: "gatsby",
    label: "Gatsby",
    dir: "apps/gatsby",
    outDir: "public",
    buildArgs: ["run", "build"],
    htmlFor: (id) => [`posts/${id}/index.html`],
    cleanGlobs: [".cache"],
    env: {
      // Suppress prompts and update checks that look like a hang in
      // a non-TTY environment.
      GATSBY_TELEMETRY_DISABLED: "1",
      NO_UPDATE_NOTIFIER: "1",
      CI: "true",
    },
  },
  {
    id: "astro",
    label: "Astro",
    dir: "apps/astro",
    outDir: "dist",
    buildArgs: ["run", "build"],
    htmlFor: (id) => [`posts/${id}/index.html`],
  },
];
