// MuPDF's package entry contains a Node-only `import('node:fs')` branch.
// Turbopack still resolves that branch for a browser chunk, so provide a
// deliberately unusable browser implementation. These functions cannot run
// in the picker because it always opens documents from Uint8Array data.
export function readFileSync() {
  throw new Error('readFileSync is not available in the browser')
}

export function writeFileSync() {
  throw new Error('writeFileSync is not available in the browser')
}
