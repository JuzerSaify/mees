import {
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw
} from 'lucide-react'
import { useState } from 'react'
import {
  PROVIDER_DEFINITIONS,
  type AppSnapshot,
  type ProviderId,
  type ProviderStatus
} from '../../../shared/types'
import { errorMessage } from '../lib/errors'
import { formatUpdatedAt } from '../lib/format'
import { ProviderMark } from './ProviderMark'

interface ProviderFormProps {
  provider: ProviderId
  status: ProviderStatus
  secureStorageAvailable: boolean
  onSnapshot: (snapshot: AppSnapshot) => void
}

export function ProviderForm({
  provider,
  status,
  secureStorageAvailable,
  onSnapshot
}: ProviderFormProps): React.JSX.Element {
  const definition = PROVIDER_DEFINITIONS[provider]
  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState<'connect' | 'refresh' | 'model' | 'disconnect' | null>(
    null
  )
  const [error, setError] = useState('')

  const selectedModel =
    status.models.find((model) => model.id === status.selectedModel) ?? status.models[0]
  const showingKeyForm = !status.connected || editingKey
  const fieldId = `api-key-${provider}`

  async function connect(): Promise<void> {
    if (!apiKey.trim()) {
      setError('Paste an API key before connecting.')
      return
    }
    setBusy('connect')
    setError('')
    try {
      const snapshot = await window.kern?.connectProvider(provider, apiKey)
      if (snapshot) onSnapshot(snapshot)
      setApiKey('')
      setEditingKey(false)
      setOpen(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  async function refresh(): Promise<void> {
    setBusy('refresh')
    setError('')
    try {
      const snapshot = await window.kern?.refreshModels(provider)
      if (snapshot) onSnapshot(snapshot)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  async function selectModel(model: string): Promise<void> {
    setBusy('model')
    setError('')
    try {
      const snapshot = await window.kern?.selectModel(provider, model)
      if (snapshot) onSnapshot(snapshot)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(): Promise<void> {
    setBusy('disconnect')
    setError('')
    try {
      const snapshot = await window.kern?.disconnectProvider(provider)
      if (snapshot) onSnapshot(snapshot)
      setEditingKey(false)
      setOpen(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`provider-form ${open ? 'is-open' : ''}`}>
      <button
        aria-controls={`provider-details-${provider}`}
        aria-expanded={open}
        className="provider-row"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ProviderMark provider={provider} size={23} />
        <span className="provider-identity">
          <span className="provider-name">{definition.name}</span>
          <span className="provider-series">{definition.series}</span>
        </span>
        <span className={`provider-state ${status.connected ? 'is-connected' : ''}`}>
          {busy ? (
            <LoaderCircle aria-hidden="true" className="spin" size={14} />
          ) : status.connected ? (
            (selectedModel?.name ?? `${status.models.length} models`)
          ) : (
            'Not connected'
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`provider-chevron ${open ? 'is-open' : ''}`}
          size={16}
        />
      </button>

      {open ? (
        <div className="provider-details" id={`provider-details-${provider}`}>
          {status.connected && !editingKey ? (
            <div className="connected-summary">
              <div className="connected-meta">
                <span className="connected-label">Connected</span>
                <span>{status.keyHint ?? 'Encrypted key on this device'}</span>
                {status.verifiedAt ? (
                  <span>Checked {formatUpdatedAt(status.verifiedAt)}</span>
                ) : null}
              </div>
              <div className="field-group">
                <label htmlFor={`model-${provider}`}>Model</label>
                <select
                  className="select-control"
                  disabled={busy === 'model'}
                  id={`model-${provider}`}
                  onChange={(event) => void selectModel(event.target.value)}
                  value={status.selectedModel ?? selectedModel?.id ?? ''}
                >
                  {status.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="provider-actions">
                <button
                  className="text-button"
                  disabled={Boolean(busy)}
                  onClick={() => void refresh()}
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={busy === 'refresh' ? 'spin' : ''}
                    size={14}
                  />
                  Refresh models
                </button>
                <button
                  className="text-button"
                  disabled={Boolean(busy)}
                  onClick={() => setEditingKey(true)}
                  type="button"
                >
                  Replace key
                </button>
                <button
                  className="text-button destructive-text"
                  disabled={Boolean(busy)}
                  onClick={() => void disconnect()}
                  type="button"
                >
                  {busy === 'disconnect' ? 'Disconnecting' : 'Disconnect'}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="provider-key-form"
              onSubmit={(event) => {
                event.preventDefault()
                void connect()
              }}
            >
              <div className="field-group">
                <label htmlFor={fieldId}>API key</label>
                <div className="secret-field">
                  <KeyRound aria-hidden="true" size={15} />
                  <input
                    autoComplete="off"
                    autoFocus={open}
                    disabled={busy === 'connect' || !secureStorageAvailable}
                    id={fieldId}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={definition.name}
                    spellCheck={false}
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                  />
                  <button
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    className="field-icon-button"
                    onClick={() => setShowKey((value) => !value)}
                    type="button"
                  >
                    {showKey ? (
                      <EyeOff aria-hidden="true" size={15} />
                    ) : (
                      <Eye aria-hidden="true" size={15} />
                    )}
                  </button>
                </div>
              </div>
              <div className="provider-form-footer">
                <button
                  className="inline-link"
                  onClick={() => void window.kern?.openExternal(definition.keyUrl)}
                  type="button"
                >
                  Get {definition.id === 'openai' ? 'an' : 'a'} {definition.name} key
                  <ExternalLink aria-hidden="true" size={12} />
                </button>
                <div className="provider-form-actions">
                  {status.connected ? (
                    <button
                      className="secondary-button compact"
                      onClick={() => {
                        setEditingKey(false)
                        setApiKey('')
                        setError('')
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    className="primary-button compact"
                    disabled={
                      busy === 'connect' || !apiKey.trim() || !secureStorageAvailable
                    }
                    type="submit"
                  >
                    {busy === 'connect' ? (
                      <>
                        <LoaderCircle aria-hidden="true" className="spin" size={14} />
                        Checking
                      </>
                    ) : status.connected ? (
                      'Save key'
                    ) : (
                      'Connect'
                    )}
                  </button>
                </div>
              </div>
              {!secureStorageAvailable ? (
                <p className="field-error">
                  Secure key storage is unavailable on this machine. Kern will not save a key
                  in plain text.
                </p>
              ) : null}
            </form>
          )}
          {error ? <p className="field-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
