import { defineConfig } from "@lazarv/react-server/config";

export default defineConfig({
  root: "src/pages",
  // Streaming `export()` hook — must be written as `async function*`
  // directly (detection is by function kind, per docs). Wrappers that
  // return an ordinary function fall back to the array-transform
  // contract and lose O(1) memory.
  //
  // Forwarding every path the file-system router already resolved, but
  // tagging each with `rsc: false` so no `.x-component` payload sidecar
  // is written — keeps the output-bytes column comparing HTML-only
  // artifacts across all five frameworks.
  async *export(paths) {
    for await (const p of paths) {
      yield { ...p, rsc: false };
    }
  },
});
