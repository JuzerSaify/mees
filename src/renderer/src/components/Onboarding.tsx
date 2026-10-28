import {
  ArrowRight,
  Check,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  PROVIDER_DEFINITIONS,
  type AppSnapshot,
  type ProviderId
} from '../../../shared/types'
import { errorMessage } from '../lib/errors'
import { Wordmark } from './Brand'
import { ProviderForm } from './ProviderForm'

interface OnboardingProps {
  snapshot: AppSnapshot
  onSnapshot: (snapshot: AppSnapshot) => void
}

export function Onboarding({
  snapshot,
  onSnapshot
}: OnboardingProps): React.JSX.Element {
  const [entering, setEntering] = useState(false)
  const [error, setError] = useState('')
  const connected = snapshot.settings.providers.filter((provider) => provider.connected)
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

  return (
    <div className="onboarding-page">
      <header className="app-topbar onboarding-topbar">
        <Wordmark iconOnly />
        <span className="topbar-context">Local design workspace</span>
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
              Bring a paid API key from OpenAI, Claude, Gemini or DeepSeek. Mees streams a
              complete responsive design into the viewport while you refine it in conversation.
            </p>
          </div>

          <div className="onboarding-points">
            <div>
              <Check aria-hidden="true" size={15} />
              <span>Use your own provider account and billing.</span>
            </div>
            <div>
              <Check aria-hidden="true" size={15} />
              <span>Switch model families without changing the workspace.</span>
            </div>
            <div>
              <Check aria-hidden="true" size={15} />
              <span>The agent researches the web, fetches page assets and keeps sources attached.</span>
            </div>
          </div>

          <div className="onboarding-footnote">
            <LockKeyhole aria-hidden="true" size={16} />
            <p>
              API keys are encrypted with {snapshot.settings.storageBackend}. They are sent only
              to the provider you select. Search queries and public page URLs are sent without
              your key.
            </p>
          </div>
        </section>

        <section className="connection-sheet" aria-labelledby="model-access-title">
          <div className="connection-sheet-header">
            <div>
              <h2 id="model-access-title">Model access</h2>
              <p>Connect one paid account to begin. You can add the others later.</p>
            </div>
            <ShieldCheck aria-hidden="true" size={19} />
          </div>

          <div className="provider-list">
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
              disabled={connected.length === 0 || entering || !snapshot.settings.secureStorageAvailable}
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
              Mees could not access {snapshot.settings.storageBackend}. API keys must be stored
              securely, so provider setup is disabled.
            </p>
          ) : null}
          {error ? <p className="field-error connection-error">{error}</p> : null}
        </section>
      </main>
    </div>
  )
}
