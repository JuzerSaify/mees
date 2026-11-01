import {
  ArrowRight,
  Check,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  PROVIDER_DEFINITIONS,
  type AppSnapshot
} from '../../../shared/types'
import { errorMessage } from '../lib/errors'
import { Wordmark } from './Brand'
import { ProviderForm } from './ProviderForm'
import { UpdateAction } from './UpdateAction'

interface OnboardingProps {
  snapshot: AppSnapshot
  onSnapshot: (snapshot: AppSnapshot) => void
}

export function Onboarding({
  snapshot,
  onSnapshot
}: OnboardingProps): React.JSX.Element {
  const [entering, setEntering] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const connected = snapshot.settings.providers.filter((provider) => provider.connected)
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
  const selectedProvider = snapshot.settings.activeProvider
  const modelCount = connected.reduce((count, provider) => count + provider.models.length, 0)

  useEffect(() => {
    document.title = 'Mees'
  }, [])

  async function enterStudio(): Promise<void> {
    if (connected.length === 0) return
    setEntering(true)
    setError('')
    try {
      const next = await window.mees?.savePreferences({ onboardingComplete: true })
      if (next) onSnapshot(next)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setEntering(false)
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

  return (
    <div className="onboarding-page">
      <header className="app-topbar onboarding-topbar">
        <Wordmark iconOnly />
        <span className="topbar-context">Local design workspace</span>
        <UpdateAction />
        <div className="topbar-window-space" />
      </header>

      <main className="onboarding-main">
        <section className="onboarding-intro">
          <div>
            <h1>
              Your models.
              <br />
              One living canvas.
            </h1>
            <p className="onboarding-lede">
              Bring a paid API key, or use a paid AI CLI already installed on this
              computer. Mees discovers its models and streams the complete design into
              the live canvas.
            </p>
          </div>

          <div className="onboarding-points">
            <div>
              <Check aria-hidden="true" size={15} />
              <span>Use your own provider account and billing.</span>
            </div>
            <div>
              <Check aria-hidden="true" size={15} />
              <span>Switch between API accounts and installed harnesses in one workspace.</span>
            </div>
            <div>
              <Check aria-hidden="true" size={15} />
              <span>The agent researches the web, fetches page assets and keeps sources attached.</span>
            </div>
          </div>

          <div className="onboarding-footnote">
            <LockKeyhole aria-hidden="true" size={16} />
            <p>
              API keys are encrypted with {snapshot.settings.storageBackend}. CLI
              harnesses keep their own sign-in and billing. Search queries and public
              page URLs are sent without either credential.
            </p>
          </div>
        </section>

        <section className="connection-sheet" aria-labelledby="model-access-title">
          <div className="connection-sheet-header">
            <div>
              <h2 id="model-access-title">Model access</h2>
              <p>Connect an API account or use a detected paid harness.</p>
            </div>
            <div className="connection-header-actions">
              <button
                aria-label="Scan for local harnesses"
                className="field-icon-button"
                data-tooltip="Scan local harnesses"
                disabled={scanning}
                onClick={() => void scanHarnesses()}
                type="button"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={scanning ? 'spin' : ''}
                  size={15}
                />
              </button>
              <ShieldCheck aria-hidden="true" size={19} />
            </div>
          </div>

          <div className="provider-list">
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
          </div>

          <div className="connection-footer">
            <div className="connection-summary">
              <span>
                {connected.length === 0
                  ? 'No provider connected'
                  : `${connected.length} ${
                      connected.length === 1 ? 'provider' : 'providers'
                    } connected`}
              </span>
              <span>{modelCount} models available</span>
              {selectedProvider ? (
                <span>
                  Active: {PROVIDER_DEFINITIONS[selectedProvider].name}
                </span>
              ) : null}
            </div>
            <button
              className="primary-button enter-button"
              disabled={connected.length === 0 || entering}
              onClick={() => void enterStudio()}
              type="button"
            >
              {entering ? (
                <>
                  <LoaderCircle aria-hidden="true" className="spin" size={15} />
                  Opening workspace
                </>
              ) : (
                <>
                  Enter Mees
                  <ArrowRight aria-hidden="true" size={15} />
                </>
              )}
            </button>
          </div>

          {!snapshot.settings.secureStorageAvailable ? (
            <p className="field-error connection-error">
              Mees could not access {snapshot.settings.storageBackend}. API-key setup
              is disabled; detected local harnesses remain available.
            </p>
          ) : null}
          {error ? <p className="field-error connection-error">{error}</p> : null}
        </section>
      </main>
    </div>
  )
}
