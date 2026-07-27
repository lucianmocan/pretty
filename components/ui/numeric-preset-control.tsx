'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

interface NumericPresetControlProps {
  value: number
  options: readonly number[]
  min: number
  max: number
  unit: string
  ariaLabel: string
  onChange: (value: number) => void
  className?: string
  choiceClassName?: string
  inputClassName?: string
}

/** A compact segmented numeric preference with an optional custom value. */
export function NumericPresetControl({
  value,
  options,
  min,
  max,
  unit,
  ariaLabel,
  onChange,
  className,
  choiceClassName,
  inputClassName,
}: NumericPresetControlProps) {
  const valueIsPreset = options.includes(value)
  const [customSelected, setCustomSelected] = useState(!valueIsPreset)
  const [draft, setDraft] = useState(String(value))
  const showCustomInput = customSelected || !valueIsPreset

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  function handleSelection(next: string) {
    if (!next) return
    if (next === 'custom') {
      setCustomSelected(true)
      setDraft(String(value))
      return
    }

    const preset = Number(next)
    setCustomSelected(false)
    setDraft(next)
    onChange(preset)
  }

  function handleCustomValue(next: string) {
    setDraft(next)
    const parsed = Number(next)
    if (next !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed)
    }
  }

  return (
    <div className={cn('flex w-80 max-w-full items-center justify-end gap-2', className)}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={showCustomInput ? 'custom' : String(value)}
        onValueChange={handleSelection}
        aria-label={ariaLabel}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option}
            value={String(option)}
            aria-label={`${option} ${unit}`}
            className={choiceClassName}
          >
            {option}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="custom" className={choiceClassName}>Custom</ToggleGroupItem>
      </ToggleGroup>

      {showCustomInput && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={draft}
            className={cn('w-24 text-right tabular-nums', inputClassName)}
            aria-label={`Custom ${ariaLabel.toLowerCase()}`}
            onChange={(event) => handleCustomValue(event.target.value)}
            onBlur={() => setDraft(String(value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
          {unit}
        </label>
      )}
    </div>
  )
}
