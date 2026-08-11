// mupdf's WASM glue (mupdf-wasm.js) is emscripten's dual Node/browser output
// -- it conditionally `await import('module')` to get Node's createRequire,
// guarded by a runtime Node-environment check that's always false in the
// browser. That guarded branch never actually executes here, but Turbopack
// still tries to statically resolve the bare `module` specifier for the
// browser bundle and fails since there's no browser polyfill for Node's
// `module` builtin. This shim satisfies that resolution; createRequire is
// never really called client-side.
export function createRequire() {
  throw new Error('createRequire is not available in the browser')
}
