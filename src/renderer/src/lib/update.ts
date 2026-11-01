import type { AppUpdateState } from '../../../shared/types'

export interface UpdateActionView {
  action: 'download' | 'install'
  label: string
  ariaLabel: string
  progress?: number
}

export function updateActionView(
  state: AppUpdateState | null
): UpdateActionView | null {
  if (state?.status === 'available') {
    return {
      action: 'download',
      label: 'Update available',
      ariaLabel: `Download Mees ${state.availableVersion ?? 'update'}`
    }
  }
  if (state?.status === 'downloading') {
    const progress = Math.max(0, Math.min(100, state.percent ?? 0))
    return {
      action: 'download',
      label: progress > 0 ? `Updating ${progress}%` : 'Downloading update',
      ariaLabel: `Update download ${progress}% complete`,
      progress
    }
  }
  if (state?.status === 'downloaded') {
    return {
      action: 'install',
      label: 'Restart to update',
      ariaLabel: `Restart Mees to install version ${state.availableVersion ?? 'the update'}`
    }
  }
  return null
}
