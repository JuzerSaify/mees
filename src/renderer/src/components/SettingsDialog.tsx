import {
  ArrowDownToLine,
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  PROVIDER_DEFINITIONS,
  type AppUpdateState,
  type AppSnapshot
} from '../../../shared/types'
import { errorMessage } from '../lib/errors'
import { useModalFocus } from '../lib/useModalFocus'
import { ProviderForm } from './ProviderForm'

interface SettingsDialogProps {
  onClose: () => void
  onSnapshot: (snapshot: AppSnapshot) => void
  snapshot: AppSnapshot
}

export function SettingsDialog({
  onClose,
  onSnapshot,
  snapshot
}: SettingsDialogProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  useModalFocus(dialogRef, onClose)

  useEffect(() => {
    let active = true
    const applyState = (next: AppUpdateState): void => {
      if (active) setUpdateState(next)
    }
    void window.mees?.getUpdateState().then(applyState).catch(() => undefined)
    const unsubscribe = window.mees?.onUpdateEvent(applyState)
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  async function toggleReview(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const next = await window.mees?.savePreferences({
        reviewAfterBuild: !snapshot.settings.reviewAfterBuild
      })
      if (next) onSnapshot(next)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function scanHarnesses(): Promise<void> {
    if (scanning) return
    setScanning(true)
    setError('')
    try {
      const next = await window.mees?.syncHarnesses()
      if (next) onSnapshot(next)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setScanning(false)
    }
  }

  async function runUpdateAction(): Promise<void> {
    if (!window.mees || !updateState || updateBusy) return
    setUpdateBusy(true)
    setError('')
    try {
      if (updateState.status === 'downloaded') {
        await window.mees.installUpdate()
      } else if (updateState.status === 'available') {
        setUpdateState(await window.mees.downloadUpdate())
      } else {
        setUpdateState(await window.mees.checkForUpdates())
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setUpdateBusy(false)
    }
  }

  const updateStatus = !updateState
    ? 'Loading update status.'
    : updateState.status === 'checking'
      ? 'Checking GitHub releases.'
      : updateState.status === 'available'
        ? `Version ${updateState.availableVersion} is available.`
        : updateState.status === 'downloading'
          ? `Downloading version ${updateState.availableVersion}. ${updateState.percent ?? 0}%`
          : updateState.status === 'downloaded'
            ? `Version ${updateState.availableVersion} is ready to install.`
            : updateState.status === 'not-available'
              ? 'Mees is up to date.'
              : updateState.status === 'unsupported'
                ? 'Updates run in the installed app.'
                : updateState.status === 'error'
                  ? updateState.message || 'The update check could not complete.'
                  : 'Check GitHub for the next Mees release.'

  const updateAction =
    updateBusy || updateState?.status === 'checking'
      ? 'Checking...'
      : updateState?.status === 'downloading'
        ? 'Downloading...'
        : updateState?.status === 'downloaded'
          ? 'Restart and install'
          : updateState?.status === 'available'
            ? 'Download update'
            : 'Check for updates'
  const updateIcon =
    updateState?.status === 'downloaded' ? (
      <RotateCcw aria-hidden="true" size={14} />
    ) : updateState?.status === 'available' ? (
      <ArrowDownToLine aria-hidden="true" size={14} />
    ) : (
      <RefreshCw aria-hidden="true" size={14} />
    )
  const updateDisabled =
    updateBusy ||
    !updateState ||
    updateState.status === 'checking' ||
    updateState.status === 'downloading' ||
    updateState.status === 'unsupported'
  const availableProviders = snapshot.settings.providers.filter(
    (provider) =>
      PROVIDER_DEFINITIONS[provider.provider].source === 'api' ||
      provider.available
  )
  const apiProviders = availableProviders.filter(
    (provider) => PROVIDER_DEFINITIONS[provider.provider].source === 'api'
  )
  const harnessProviders = availableProviders.filter(
    (provider) => PROVIDER_DEFINITIONS[provider.provider].source === 'harness'
  )

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby="settings-title"
        aria-describedby="settings-description"
        aria-modal="true"
        className="settings-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p id="settings-description">Model access and local behavior.</p>
          </div>
          <button
            aria-label="Close settings"
            className="icon-button"
            data-autofocus
            data-tooltip="Close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <div className="dialog-scroll">
          <section className="settings-section" aria-labelledby="sources-title">
            <div className="settings-label">
              <h3 id="sources-title">Model sources</h3>
              <p>
                API keys stay encrypted on this device. Local harnesses keep their own
                credentials and billing.
              </p>
            </div>
            <div className="settings-panel provider-settings-panel">
              <div className="provider-group-label">API accounts</div>
              {apiProviders.map((status) => (
                <ProviderForm
                  key={status.provider}
                  onSnapshot={onSnapshot}
                  provider={status.provider}
                  secureStorageAvailable={snapshot.settings.secureStorageAvailable}
                  status={status}
                />
              ))}
              {harnessProviders.length ? (
                <>
                  <div className="provider-group-label">Detected paid harnesses</div>
                  {harnessProviders.map((status) => (
                  <ProviderForm
                    key={status.provider}
                    onSnapshot={onSnapshot}
                    provider={status.provider}
                    secureStorageAvailable={snapshot.settings.secureStorageAvailable}
                    status={status}
                  />
                  ))}
                </>
              ) : null}
              <div className="settings-provider-actions">
                <button
                  className="text-button"
                  disabled={scanning}
                  onClick={() => void scanHarnesses()}
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={scanning ? 'spin' : ''}
                    size={14}
                  />
                  {scanning ? 'Scanning local harnesses' : 'Scan local harnesses'}
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="behavior-title">
            <div className="settings-label">
              <h3 id="behavior-title">Agent behavior</h3>
              <p>Questions and research are decided by the agent for each request.</p>
            </div>
            <div className="settings-panel">
              <button
                aria-checked={snapshot.settings.reviewAfterBuild}
                className="settings-switch-row"
                disabled={busy}
                onClick={() => void toggleReview()}
                role="switch"
                type="button"
              >
                <span>
                  <span className="settings-row-title">
                    {busy ? (
                      <LoaderCircle aria-hidden="true" className="spin" size={14} />
                    ) : null}
                    Measure every draft
                  </span>
                  <span className="settings-row-description">
                    Check desktop, tablet and mobile layouts locally after each build.
                  </span>
                </span>
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
              </button>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="updates-title">
            <div className="settings-label">
              <h3 id="updates-title">App updates</h3>
              <p>
                Mees checks the public GitHub release feed and installs the next
                Windows version when you choose to restart.
              </p>
            </div>
            <div className="settings-panel update-panel">
              <div className="update-status">
                <span className="update-version">
                  Mees {updateState?.currentVersion ?? '...'}
                </span>
                <span
                  className={`settings-row-description ${
                    updateState?.status === 'error' ? 'is-error' : ''
                  }`}
                  role="status"
                >
                  {updateStatus}
                </span>
              </div>
              {updateState?.status === 'downloading' ? (
                <div
                  aria-label={`Update download ${updateState.percent ?? 0}% complete`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={updateState.percent ?? 0}
                  className="update-progress"
                  role="progressbar"
                >
                  <span style={{ width: `${updateState.percent ?? 0}%` }} />
                </div>
              ) : null}
              <button
                className="secondary-button compact"
                disabled={updateDisabled}
                onClick={() => void runUpdateAction()}
                type="button"
              >
                {updateBusy || updateState?.status === 'checking' ? (
                  <LoaderCircle aria-hidden="true" className="spin" size={14} />
                ) : (
                  updateIcon
                )}
                {updateAction}
              </button>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="storage-title">
            <div className="settings-label">
              <h3 id="storage-title">Local storage</h3>
              <p>Projects and model discovery data stay in the app data directory.</p>
            </div>
            <div className="settings-panel storage-panel">
              <div className="storage-line">
                <ShieldCheck aria-hidden="true" size={17} />
                <div>
                  <span className="settings-row-title">{snapshot.settings.storageBackend}</span>
                  <span className="settings-row-description">
                    API keys are encrypted before they are written to disk.
                  </span>
                </div>
              </div>
              <div className="storage-line">
                <LockKeyhole aria-hidden="true" size={17} />
                <div className="storage-path">
                  <span className="settings-row-title">Workspace data</span>
                  <span className="settings-row-description" title={snapshot.settings.dataPath}>
                    {snapshot.settings.dataPath}
                  </span>
                </div>
                <button
                  className="secondary-button compact"
                  onClick={() =>
                    void window.mees?.openDataFolder().catch((caught: unknown) => {
                      setError(errorMessage(caught))
                    })
                  }
                  type="button"
                >
                  <FolderOpen aria-hidden="true" size={14} />
                  Open
                </button>
              </div>
            </div>
          </section>
          {error ? <p className="field-error settings-error">{error}</p> : null}
        </div>
      </section>
    </div>
  )
}
