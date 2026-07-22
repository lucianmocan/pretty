import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageToolbarProps {
  children: ReactNode
  className?: string
}

/** Shared bordered/card toolbar bar at the top of every page (dashboard,
 * editor, ...) -- so the app reads as one consistent product instead of
 * each page inventing its own header chrome. Not used by the print route,
 * which intentionally renders no page chrome at all. */
export function PageToolbar({ children, className }: PageToolbarProps) {
  return <div className={cn('scripture-toolbar', className)}>{children}</div>
}
