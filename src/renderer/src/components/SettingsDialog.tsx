import {
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  X
} from 'lucide-react'
import { useRef, useState } from 'react'
import {
  PROVIDER_DEFINITIONS,
  type AppSnapshot,
  type ProviderId
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
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  useModalFocus(dialogRef, onClose)

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
                Keys stay encrypted on this device. Web research always receives the current
                search query; provider keys are never included.
              </p>
            </div>
            <div className="settings-panel provider-settings-panel">
              {(Object.keys(PROVIDER_DEFINITIONS) as ProviderId[]).map((providerId) => {
                const status = snapshot.settings.providers.find(
                  (provider) => provider.provider === providerId
                )
                if (!status) return null
                return (
                  <ProviderForm
                    key={providerId}
                    onSnapshot={onSnapshot}
                    provider={providerId}
                    secureStorageAvailable={snapshot.settings.secureStorageAvailable}
                    status={status}
                  />
                )
              })}
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
