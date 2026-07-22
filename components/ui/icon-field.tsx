import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'

interface IconFieldProps {
  icon: ReactNode
  value: number
  onChange: (value: number) => void
  min?: number
  title?: string
}

/** A numeric input with a small leading icon instead of a text label --
 * Figma-style compact property field (gap/padding/radius/width/height). */
export function IconField({ icon, value, onChange, min = 0, title }: IconFieldProps) {
  return (
    <span className="field-with-icon" title={title}>
      {icon}
      <Input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </span>
  )
}
