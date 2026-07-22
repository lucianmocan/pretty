/** Border-radius property icon (Figma/dev-tool convention: an L-shaped path
 * with a rounded corner). Lucide's own `Radius` icon means geometric circle
 * radius, not this -- there's no good lucide equivalent, so this one small
 * hand-drawn icon is kept from the pre-shadcn icon set. */
export function RadiusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={14}
      height={14}
    >
      <path d="M4 20V10a6 6 0 0 1 6-6h10" />
    </svg>
  )
}
