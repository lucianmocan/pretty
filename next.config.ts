import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // See lib/pdf/browser-module-shim.js for why this alias exists --
      // mupdf's WASM glue references Node's `module` builtin in a
      // Node-only code path that Turbopack still tries to resolve for the
      // browser bundle.
      module: { browser: "./lib/pdf/browser-module-shim.js" },
      "node:fs": { browser: "./lib/pdf/browser-fs-shim.js" },
    },
  },
};

export default nextConfig;
