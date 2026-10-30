import { app, type WebContents } from 'electron'
import electronUpdater from 'electron-updater'
import type {
  ProgressInfo,
  UpdateDownloadedEvent,
  UpdateInfo
} from 'electron-updater'
import { IPC_CHANNELS, type AppUpdateState } from '../shared/types'

// electron-updater ships as CommonJS. The default import is the stable ESM
// interop boundary; a named import crashes Electron's main process at startup.
const { autoUpdater } = electronUpdater

type UpdateSender = () => WebContents | null

let sender: UpdateSender = () => null
let initialized = false
let updateState: AppUpdateState = {
  currentVersion: app.getVersion(),
  status: app.isPackaged ? 'idle' : 'unsupported',
  message: app.isPackaged
    ? undefined
    : 'Updates run in the installed app.'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function publish(next: Partial<AppUpdateState>): AppUpdateState {
  updateState = {
    ...updateState,
    ...next,
    currentVersion: app.getVersion()
  }
  const webContents = sender()
  if (webContents && !webContents.isDestroyed()) {
    webContents.send(IPC_CHANNELS.updateEvent, updateState)
  }
  return updateState
}

function versionState(
  status: AppUpdateState['status'],
  info?: UpdateInfo | UpdateDownloadedEvent
): AppUpdateState {
  return publish({
    status,
    availableVersion: info?.version,
    checkedAt: new Date().toISOString(),
    message: undefined,
    percent: status === 'available' ? 0 : undefined
  })
}

export function initializeUpdater(nextSender: UpdateSender): void {
  sender = nextSender
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    publish({
      status: 'checking',
      message: undefined,
      percent: undefined
    })
  })
  autoUpdater.on('update-available', (info) => {
    versionState('available', info)
  })
  autoUpdater.on('update-not-available', (info) => {
    versionState('not-available', info)
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    publish({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(progress.percent)))
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    versionState('downloaded', info)
  })
  autoUpdater.on('error', (error) => {
    publish({
      status: 'error',
      message: errorText(error)
    })
  })
}

export function getUpdateState(): AppUpdateState {
  return updateState
}

export async function checkForUpdates(): Promise<AppUpdateState> {
  if (!app.isPackaged) {
    return publish({
      status: 'unsupported',
      message: 'Updates run in the installed app.'
    })
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    publish({ status: 'error', message: errorText(error) })
  }
  return updateState
}

export async function downloadUpdate(): Promise<AppUpdateState> {
  if (!app.isPackaged || updateState.status !== 'available') {
    return updateState
  }
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    publish({ status: 'error', message: errorText(error) })
  }
  return updateState
}

export function installUpdate(): void {
  if (updateState.status !== 'downloaded') return
  autoUpdater.quitAndInstall(false, true)
}

export function scheduleAutomaticUpdateCheck(): void {
  if (!app.isPackaged) return
  const timer = setTimeout(() => {
    void checkForUpdates()
  }, 7_000)
  timer.unref()
}
