import { AlertCircle, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppSnapshot } from '../../shared/types'
import { errorMessage } from './lib/errors'
import { Wordmark } from './components/Brand'
import { Onboarding } from './components/Onboarding'
import { Studio } from './components/Studio'

function OpeningScreen(): React.JSX.Element {
  return (
    <div className="opening-screen">
      <Wordmark />
      <p>Opening local workspace</p>
    </div>
  )
}

function BridgeError({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="opening-screen error-screen">
      <Wordmark />
      <AlertCircle aria-hidden="true" size={24} />
      <h1>Mees could not open</h1>
      <p>{message}</p>
      <button className="secondary-button" onClick={onRetry} type="button">
        <RotateCcw aria-hidden="true" size={14} />
        Retry
      </button>
    </div>
  )
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadState(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      if (!window.mees) {
        throw new Error(
          'The secure desktop bridge did not load. Open Mees through the Electron app, not a browser tab.'
        )
      }
      setSnapshot(await window.mees.getState())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadState()
  }, [])

  if (loading && !snapshot) return <OpeningScreen />
  if (error && !snapshot) return <BridgeError message={error} onRetry={() => void loadState()} />
  if (!snapshot) return <OpeningScreen />

  const connectedProviders = snapshot.settings.providers.filter(
    (provider) => provider.connected
  )

  if (!snapshot.settings.onboardingComplete || connectedProviders.length === 0) {
    return <Onboarding onSnapshot={setSnapshot} snapshot={snapshot} />
  }

  return <Studio onSnapshot={setSnapshot} snapshot={snapshot} />
}
