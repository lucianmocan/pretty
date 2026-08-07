'use client'

import { LoaderCircle } from 'lucide-react'
import { useLinkStatus } from 'next/link'
import { createPortal } from 'react-dom'

interface RouteLoadingScreenProps {
  label: string
  mode?: 'content' | 'page' | 'overlay'
}

export function RouteLoadingScreen({ label, mode = 'content' }: RouteLoadingScreenProps) {
  return (
    <div
      className={`scripture-route-loading is-${mode}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="scripture-route-loading-progress">
        <LoaderCircle aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  )
}

/** Must be rendered inside a Next.js Link so it reflects that link's pending state. */
export function PendingRouteLoading({ label }: { label: string }) {
  const { pending } = useLinkStatus()
  if (!pending || typeof document === 'undefined') return null
  return createPortal(<RouteLoadingScreen label={label} mode="overlay" />, document.body)
}
