import type { CSSProperties } from 'react'

export interface ImageEffectProps {
  opacity?: number
  brightness?: number
  contrast?: number
  saturation?: number
  hue?: number
  grayscale?: number
  blur?: number
}

export interface ImageEffectPreview {
  nodeId: string
  effects: ImageEffectProps
}

function finiteClamped(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function normalizeImageEffects(props: ImageEffectProps) {
  return {
    opacity: finiteClamped(props.opacity, 100, 0, 100),
    brightness: finiteClamped(props.brightness, 100, 0, 200),
    contrast: finiteClamped(props.contrast, 100, 0, 200),
    saturation: finiteClamped(props.saturation, 100, 0, 200),
    hue: finiteClamped(props.hue, 0, -180, 180),
    grayscale: finiteClamped(props.grayscale, 0, 0, 100),
    blur: finiteClamped(props.blur, 0, 0, 20),
  }
}

export function imageEffectStyles(props: ImageEffectProps): {
  frame: CSSProperties
  image: CSSProperties
} {
  const effects = normalizeImageEffects(props)
  const filters = [
    effects.brightness !== 100 && `brightness(${effects.brightness}%)`,
    effects.contrast !== 100 && `contrast(${effects.contrast}%)`,
    effects.saturation !== 100 && `saturate(${effects.saturation}%)`,
    effects.hue !== 0 && `hue-rotate(${effects.hue}deg)`,
    effects.grayscale !== 0 && `grayscale(${effects.grayscale}%)`,
    effects.blur !== 0 && `blur(${effects.blur}px)`,
  ].filter(Boolean)
  return {
    frame: effects.opacity === 100 ? {} : { opacity: effects.opacity / 100 },
    image: filters.length > 0 ? { filter: filters.join(' ') } : {},
  }
}
