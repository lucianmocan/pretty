import type { ReactNode } from 'react'
import { CircleCheck, CircleX, Info, LoaderCircle } from 'lucide-react'

export function NotificationChip({
  children,
  action,
  variant = 'default',
  busy = false,
}: {
  children: ReactNode
  action?: ReactNode
  variant?: 'default' | 'error' | 'success'
  busy?: boolean
}) {
  const Icon = busy ? LoaderCircle : variant === 'error' ? CircleX : variant === 'success' ? CircleCheck : Info

  return (
    <div
      className="scripture-notification-chip"
      data-variant={variant}
      data-has-action={action ? '' : undefined}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-busy={busy}
    >
      <Icon className={`scripture-notification-chip-icon${busy ? ' animate-spin' : ''}`} aria-hidden="true" />
      <span>{children}</span>
      {action}
    </div>
  )
}
