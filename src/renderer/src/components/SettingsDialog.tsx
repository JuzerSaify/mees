import {
  ArrowDownToLine,
  Bot,
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
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

type SettingsSectionId = 'sources' | 'agent' | 'updates' | 'storage'

const settingsSections: Array<{
  id: SettingsSectionId
  label: string
}> = [
  {
    id: 'sources',
    label: 'Model sources'
  },
  {
    id: 'agent',
    label: 'Agent'
  },
  {
    id: 'updates',
    label: 'Updates'
  },
  {
    id: 'storage',
    label: 'Storage'
  }
]

export function SettingsDialog({
  onClose,
  onSnapshot,
  snapshot
}: SettingsDialogProps): React.JSX.Element {
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>('sources')
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
  const apiProviders = snapshot.settings.providers.filter(
    (provider) => PROVIDER_DEFINITIONS[provider.provider].source === 'api'
  )
  const harnessProviders = snapshot.settings.providers.filter(
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
        className="settings-dialog settings-dialog-wide"
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

        <div className="settings-layout">
          <nav aria-label="Settings sections" className="settings-nav" role="tablist">
            {settingsSections.map((section) => {
              return (
                <button
                  aria-controls={`settings-panel-${section.id}`}
                  aria-selected={activeSection === section.id}
                  className={activeSection === section.id ? 'is-active' : ''}
                  id={`settings-tab-${section.id}`}
                  key={section.id}
                  onClick={() => {
                    setError('')
                    setActiveSection(section.id)
                  }}
                  role="tab"
                  type="button"
                >
                  {section.label}
                </button>
              )
            })}
          </nav>

          <div className="settings-content">
          {activeSection === 'sources' ? (
          <section
            aria-labelledby="sources-title"
            className="settings-pane"
            id="settings-panel-sources"
            role="tabpanel"
          >
            <header className="settings-pane-header">
              <h3 id="sources-title">Model sources</h3>
              <p>
                Connect paid API accounts or use a locally signed-in CLI. Keys
                remain encrypted on this device.
              </p>
            </header>
            <div className="settings-panel provider-settings-panel settings-panel-large">
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
                  <div className="provider-group-label">Local harnesses</div>
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
          ) : null}

          {activeSection === 'agent' ? (
            <section
              aria-labelledby="behavior-title"
              className="settings-pane"
              id="settings-panel-agent"
              role="tabpanel"
            >
              <header className="settings-pane-header">
                <h3 id="behavior-title">Agent</h3>
                <p>
                  Mees decides when research, file inspection or a clarifying
                  question will materially improve the result.
                </p>
              </header>
              <div className="settings-panel settings-behavior-list">
                <div className="settings-behavior-row">
                  <SlidersHorizontal aria-hidden="true" size={17} />
                  <span>
                    <span className="settings-row-title">Tool selection</span>
                    <span className="settings-row-description">
                      Chosen per request from the full Mees tool set.
                    </span>
                  </span>
                  <strong>Automatic</strong>
                </div>
                <div className="settings-behavior-row">
                  <RefreshCw aria-hidden="true" size={17} />
                  <span>
                    <span className="settings-row-title">Live research</span>
                    <span className="settings-row-description">
                      Current facts and media are checked whenever the brief needs them.
                    </span>
                  </span>
                  <strong>Available</strong>
                </div>
                <div className="settings-behavior-row">
                  <Bot aria-hidden="true" size={17} />
                  <span>
                    <span className="settings-row-title">Clarifying questions</span>
                    <span className="settings-row-description">
                      Asked only when a missing decision would change the work.
                    </span>
                  </span>
                  <strong>When needed</strong>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === 'updates' ? (
            <section
              aria-labelledby="updates-title"
              className="settings-pane"
              id="settings-panel-updates"
              role="tabpanel"
            >
              <header className="settings-pane-header">
                <h3 id="updates-title">App updates</h3>
                <p>
                  Mees checks the public GitHub release feed and can install the
                  next version without leaving the app.
                </p>
              </header>
              <div className="settings-panel update-panel settings-panel-large">
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
          ) : null}

          {activeSection === 'storage' ? (
            <section
              aria-labelledby="storage-title"
              className="settings-pane"
              id="settings-panel-storage"
              role="tabpanel"
            >
              <header className="settings-pane-header">
                <h3 id="storage-title">Local storage</h3>
                <p>
                  Projects, versions, references and model discovery data stay
                  in the app data directory.
                </p>
              </header>
              <div className="settings-panel storage-panel settings-panel-large">
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
          ) : null}
          {error ? <p className="field-error settings-error">{error}</p> : null}
          </div>
        </div>
      </section>
    </div>
  )
}
