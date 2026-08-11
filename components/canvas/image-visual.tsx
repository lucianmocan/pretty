import type { CSSProperties } from 'react'
import { clipPathForShape } from '@/lib/layout/image-shapes'
import type { ImageClipShape } from '@/lib/layout/types'
import {
  hasImageCrop,
  imageSourceDimensions,
  normalizeImageCrop,
} from '@/lib/layout/image-crop'
import { imageEffectStyles } from '@/lib/layout/image-effects'

interface ImageVisualProps {
  src: string
  alt: string
  radius: number
  clipShape: ImageClipShape
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  intrinsicWidth?: number | null
  intrinsicHeight?: number | null
  frameWidth?: number | null
  frameHeight?: number | null
  opacity?: number
  brightness?: number
  contrast?: number
  saturation?: number
  hue?: number
  grayscale?: number
  blur?: number
  onLoad?: () => void
  onError?: () => void
  overlay?: React.ReactNode
}

/** Shared canvas/export image renderer. Shape and radius belong to the final
 * frame; crop transforms only the image inside it. */
export function ImageVisual({
  src,
  alt,
  radius,
  clipShape,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  intrinsicWidth,
  intrinsicHeight,
  frameWidth,
  frameHeight,
  opacity,
  brightness,
  contrast,
  saturation,
  hue,
  grayscale,
  blur,
  onLoad,
  onError,
  overlay,
}: ImageVisualProps) {
  const crop = normalizeImageCrop({ cropX, cropY, cropWidth, cropHeight })
  const isCropped = hasImageCrop(crop)
  const shapeClipPath = clipPathForShape(clipShape)
  const effectStyles = imageEffectStyles({ opacity, brightness, contrast, saturation, hue, grayscale, blur })
  const frameStyle: CSSProperties = {
    ...effectStyles.frame,
    borderRadius: shapeClipPath ? undefined : radius ? `${radius}px` : undefined,
    clipPath: shapeClipPath,
  }
  const className = [
    'scripture-image-visual',
    isCropped && 'is-cropped',
    clipShape !== 'none' && 'is-shaped',
  ].filter(Boolean).join(' ')

  if (!isCropped) {
    return (
      <div className={className} style={frameStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element -- exact same-origin source is required for export parity */}
        <img
          className="scripture-image"
          style={effectStyles.image}
          src={src}
          alt={alt}
          onLoad={onLoad}
          onError={onError}
        />
        {overlay}
      </div>
    )
  }

  const source = imageSourceDimensions({
    intrinsicWidth,
    intrinsicHeight,
    frameWidth,
    frameHeight,
    crop,
  })
  const viewBox = [
    crop.cropX * source.width,
    crop.cropY * source.height,
    crop.cropWidth * source.width,
    crop.cropHeight * source.height,
  ].join(' ')

  return (
    <div className={className} style={frameStyle}>
      <svg
        className="scripture-image scripture-image-cropped-svg"
        style={effectStyles.image}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <image
          href={src}
          x="0"
          y="0"
          width={source.width}
          height={source.height}
          preserveAspectRatio="none"
          onLoad={onLoad}
          onError={onError}
        />
      </svg>
      {overlay}
    </div>
  )
}
