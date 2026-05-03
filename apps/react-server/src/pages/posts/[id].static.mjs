// Streaming static-paths source.
// Per https://react-server.dev/router/static#streaming-static-paths the
// router detects async-generator default exports by function kind and
// pulls one descriptor at a time, keeping peak memory at O(1) regardless
// of total path count. This matters at 100k pages.
//
// RSC payload generation is disabled in `react-server.config.mjs` via
// the streaming `export()` hook — `rsc: false` is a config-level flag,
// not a per-yield static-descriptor field.

import { idStream } from "@ssg-test/shared";

export default async function* () {
  for (const id of idStream()) {
    yield { id: String(id) };
  }
}
