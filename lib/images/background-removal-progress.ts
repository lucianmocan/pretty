export interface FriendlyBackgroundProgress {
  label: string
  detail: string
  progress: number
}

function ratio(current: number, total: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return 0
  return Math.min(1, Math.max(0, current / total))
}

/** Converts IMG.LY's internal callback keys into stable user-facing phases. */
export function friendlyBackgroundProgress(
  key: string,
  current: number,
  total: number,
  previousProgress = 0
): FriendlyBackgroundProgress {
  const phaseRatio = ratio(current, total)
  let label = 'Preparing background removal'
  let detail = 'Starting the on-device image model…'
  let progress = 2

  if (key.startsWith('fetch:')) {
    label = 'Downloading removal model'
    detail = 'The first run downloads model files; later runs are cached.'
    progress = phaseRatio * 45
  } else if (key === 'compute:decode') {
    label = 'Preparing image'
    detail = 'Decoding the image locally in your browser.'
    progress = 45 + phaseRatio * 10
  } else if (key === 'compute:inference') {
    label = 'Analyzing image'
    detail = 'Separating the subject from its background.'
    progress = 55 + phaseRatio * 33
  } else if (key === 'compute:mask') {
    label = 'Refining edges'
    detail = 'Building the transparent foreground mask.'
    progress = 88 + phaseRatio * 8
  } else if (key === 'compute:encode') {
    label = 'Preparing result'
    detail = 'Encoding the transparent image.'
    progress = 96 + phaseRatio * 3
  }

  return {
    label,
    detail,
    progress: Math.min(99, Math.max(previousProgress, Math.round(progress))),
  }
}
