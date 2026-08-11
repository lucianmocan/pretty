import type { ReactNode } from 'react'
import { CircleCheck, CircleX, Info } from 'lucide-react'

export function NotificationChip({
  children,
  action,
  variant = 'default',
}: {
  children: ReactNode
  action?: ReactNode
  variant?: 'default' | 'error' | 'success'
}) {
  const Icon = variant === 'error' ? CircleX : variant === 'success' ? CircleCheck : Info

  return (
    <div
      className="scripture-notification-chip"
      data-variant={variant}
      data-has-action={action ? '' : undefined}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <Icon className="scripture-notification-chip-icon" aria-hidden="true" />
      <span>{children}</span>
      {action}
    </div>
  )
}
