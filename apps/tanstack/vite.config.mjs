import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { allIds } from "@ssg-test/shared";

// TanStack Start has no streaming / async-iterable path API as of 1.167.x.
// Every route to prerender must be materialized up-front in `pages`. This
// is the framework's documented contract (verbatim shape per docs):
//   { path: "/p", prerender: { enabled: true, outputPath: "/p/index.html" } }
//
// At 100k entries, this 100k-element array is constructed inside the Vite
// config module — peak memory grows with PAGE_COUNT. The benchmark is
// designed to expose exactly this kind of asymmetry.
const pages = allIds().map((id) => ({
  path: `/posts/${id}`,
  prerender: { enabled: true, outputPath: `/posts/${id}/index.html` },
}));

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        autoSubfolderIndex: true,
        concurrency: 14,
        failOnError: true,
        // crawlLinks=false: avoid the link-walker visiting /posts/1 → 2 → ...
        // We supply the full set explicitly via `pages`.
        crawlLinks: false,
        autoStaticPathsDiscovery: false,
      },
      pages,
    }),
    viteReact(),
  ],
});
