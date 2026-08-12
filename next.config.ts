import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables SharedArrayBuffer-backed ONNX execution for client-side
  // background removal. Without cross-origin isolation the model falls back
  // to a noticeably slower execution path.
  //
  // Also duplicated in vercel.json, deliberately -- on Vercel, static assets
  // under /_next/static/* (including the hidden iframe Turbopack uses to
  // load a `type: 'module'` Worker) are served straight from the CDN edge,
  // bypassing this Next.js server function entirely, so these headers()
  // never reach them in production even though they do here in dev. COEP
  // requires every embedded iframe to declare the same policy on its own
  // response, so without the vercel.json copy that worker iframe gets
  // silently blocked in production only -- see the "background removal
  // fails in production" investigation for the actual failure mode.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },
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
