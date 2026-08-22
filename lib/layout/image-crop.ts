export interface ImageCropRect {
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

const MIN_CROP_SIZE = 0.0001

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Keeps persisted/collaborative crop data safe before it reaches CSS/SVG math. */
export function normalizeImageCrop(crop: Partial<ImageCropRect>): ImageCropRect {
  const cropWidth = clamp(finiteOr(crop.cropWidth, 1), MIN_CROP_SIZE, 1)
  const cropHeight = clamp(finiteOr(crop.cropHeight, 1), MIN_CROP_SIZE, 1)
  return {
    cropX: clamp(finiteOr(crop.cropX, 0), 0, 1 - cropWidth),
    cropY: clamp(finiteOr(crop.cropY, 0), 0, 1 - cropHeight),
    cropWidth,
    cropHeight,
  }
}

export function hasImageCrop(crop: ImageCropRect): boolean {
  return crop.cropX !== 0 || crop.cropY !== 0 || crop.cropWidth !== 1 || crop.cropHeight !== 1
}

/** Aspect ratio of the visible crop, not the full source image. */
export function croppedImageAspectRatio({
  naturalWidth,
  naturalHeight,
  crop,
}: {
  naturalWidth: number
  naturalHeight: number
  crop: ImageCropRect
}): number | null {
  if (
    !Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 || naturalHeight <= 0
  ) return null

  const ratio = (naturalWidth * crop.cropWidth) / (naturalHeight * crop.cropHeight)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

/**
 * Gives a newly-cropped auto-sized image a frame based on its rendered size,
 * not the source file's raw pixels. That prevents a high-resolution upload
 * from expanding a page by several thousand CSS pixels when crop is applied.
 */
export function croppedImageFrameSize({
  renderedWidth,
  renderedHeight,
  naturalWidth,
  naturalHeight,
  crop,
  minimum = 32,
  maximum = 1200,
}: {
  renderedWidth?: number
  renderedHeight?: number
  naturalWidth: number
  naturalHeight: number
  crop: ImageCropRect
  minimum?: number
  maximum?: number
}): { width: number; height: number } {
  const safeNaturalWidth = Math.max(1, finiteOr(naturalWidth, 1))
  const safeNaturalHeight = Math.max(1, finiteOr(naturalHeight, 1))
  const baseWidth = renderedWidth && renderedWidth > 0 ? renderedWidth : Math.min(safeNaturalWidth, maximum)
  const baseHeight = renderedHeight && renderedHeight > 0
    ? renderedHeight
    : baseWidth * (safeNaturalHeight / safeNaturalWidth)
  let width = baseWidth * crop.cropWidth
  let height = baseHeight * crop.cropHeight

  const scale = Math.min(
    maximum / Math.max(width, 1),
    maximum / Math.max(height, 1),
    Math.max(minimum / Math.max(width, 1), minimum / Math.max(height, 1), 1)
  )
  width *= scale
  height *= scale
  return {
    width: Math.max(minimum, Math.round(width)),
    height: Math.max(minimum, Math.round(height)),
  }
}

/** Source coordinate system for the SVG crop renderer, including legacy docs. */
export function imageSourceDimensions({
  intrinsicWidth,
  intrinsicHeight,
  frameWidth,
  frameHeight,
  crop,
}: {
  intrinsicWidth?: number | null
  intrinsicHeight?: number | null
  frameWidth?: number | null
  frameHeight?: number | null
  crop: ImageCropRect
}): { width: number; height: number } {
  if (
    intrinsicWidth != null && intrinsicHeight != null &&
    Number.isFinite(intrinsicWidth) && Number.isFinite(intrinsicHeight) &&
    intrinsicWidth > 0 && intrinsicHeight > 0
  ) {
    return { width: intrinsicWidth, height: intrinsicHeight }
  }

  // The first crop implementation stored a frame matching the selected
  // natural crop dimensions. Recover the source aspect from that frame so
  // existing documents render without distortion after this migration.
  if (
    frameWidth != null && frameHeight != null &&
    Number.isFinite(frameWidth) && Number.isFinite(frameHeight) &&
    frameWidth > 0 && frameHeight > 0
  ) {
    return {
      width: (frameWidth / frameHeight) * (crop.cropHeight / crop.cropWidth),
      height: 1,
    }
  }

  return { width: 1, height: 1 }
}
