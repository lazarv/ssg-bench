import { defineConfig } from "astro/config";

// `output: "static"` is Astro's default; declared explicitly for clarity.
// No `@astrojs/react` integration: this benchmark records what each
// framework's idiomatic SSG output looks like. Astro's renderer is its
// own — flagged in the README, not patched away here.
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
});
