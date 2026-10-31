import {
  Check,
  ChevronDown,
  Gauge,
  LoaderCircle,
  Search,
  Settings2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  PROVIDER_DEFINITIONS,
  type AppSnapshot,
  type ProviderId
} from '../../../shared/types'
import {
  getEffortSupport,
  normalizeEffort,
  type EffortLevel
} from '../../../shared/effort'
import { filterModelCatalog } from '../../../shared/model-catalog'
import { errorMessage } from '../lib/errors'
import { ProviderMark } from './ProviderMark'

interface ModelPickerProps {
  disabled?: boolean
  onOpenSettings: () => void
  onSnapshot: (snapshot: AppSnapshot) => void
  snapshot: AppSnapshot
}

function compactModelName(provider: ProviderId, name: string): string {
  const withoutProvider =
    provider === 'anthropic'
      ? name.replace(/^Claude\s+/i, '')
      : provider === 'google'
        ? name.replace(/^Gemini\s+/i, '')
        : provider === 'deepseek'
          ? name.replace(/^DeepSeek[-\s]*/i, '')
          : name
  const normalized =
    provider === 'deepseek'
      ? withoutProvider.replace(/[-_]+/g, ' ')
      : withoutProvider
  return normalized.replace(/\s+/g, ' ').trim()
}

export function ModelPicker({
  disabled,
  onOpenSettings,
  onSnapshot,
  snapshot
}: ModelPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [busyModel, setBusyModel] = useState('')
  const [busyEffort, setBusyEffort] = useState<EffortLevel | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const activeProvider = snapshot.settings.activeProvider
  const activeModel = snapshot.settings.activeModel
  const connected = snapshot.settings.providers
    .filter((provider) => provider.connected)
    .map((provider) => ({
      ...provider,
      models: filterModelCatalog(provider.provider, provider.models)
    }))
    .filter((provider) => provider.models.length > 0)

  const activeProviderStatus = connected.find(
    (provider) => provider.provider === activeProvider
  )
  const activeModelInfo = activeProviderStatus?.models.find(
    (model) => model.id === activeModel
  )
  const effortSupport =
    activeProvider && activeModel
      ? getEffortSupport(activeProvider, activeModel)
      : null
  const activeEffort =
    activeProvider && activeModel
      ? normalizeEffort(
          activeProvider,
          activeModel,
          snapshot.settings.activeEffort
        )
      : null
  const activeEffortOption =
    effortSupport?.options.find((option) => option.value === activeEffort) ?? null

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const closeOnOutside = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredProviders = connected
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) => {
        if (!normalizedQuery) return true
        const providerName = PROVIDER_DEFINITIONS[provider.provider].name.toLowerCase()
        return (
          model.name.toLowerCase().includes(normalizedQuery) ||
          model.id.toLowerCase().includes(normalizedQuery) ||
          providerName.includes(normalizedQuery)
        )
      })
    }))
    .filter((provider) => provider.models.length > 0)

  async function chooseModel(provider: ProviderId, model: string): Promise<void> {
    setBusyModel(`${provider}:${model}`)
    setError('')
    try {
      const next = await window.mees?.selectModel(provider, model)
      if (next) onSnapshot(next)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyModel('')
    }
  }

  async function chooseEffort(effort: EffortLevel): Promise<void> {
    if (!activeProvider || !activeModel || effort === activeEffort) return
    setBusyEffort(effort)
    setError('')
    try {
      const next = await window.mees?.savePreferences({ activeEffort: effort })
      if (next) onSnapshot(next)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyEffort(null)
    }
  }

  return (
    <div className="model-picker" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Choose model and effort, current ${
          activeModelInfo?.name ?? 'none'
        }${activeEffortOption ? `, ${activeEffortOption.label} effort` : ''}`}
        className="model-trigger"
        disabled={disabled || connected.length === 0}
        onClick={() => {
          setQuery('')
          setError('')
          setOpen((value) => !value)
        }}
        type="button"
      >
        {activeProvider ? (
          <ProviderMark provider={activeProvider} size={16} />
        ) : (
          <span className="provider-mark-placeholder" />
        )}
        <span className="model-trigger-copy">
          <span className="model-trigger-name">
            {activeProvider && activeModelInfo
              ? compactModelName(activeProvider, activeModelInfo.name)
              : 'No model selected'}
          </span>
          {activeEffortOption ? (
            <span className="model-trigger-effort">
              {activeEffortOption.label}
            </span>
          ) : null}
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>

      {open ? (
        <div className="model-menu" role="dialog" aria-label="Model and effort">
          <div className="model-search">
            <Search aria-hidden="true" size={14} />
            <input
              aria-label="Search models"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a model"
              ref={searchRef}
              spellCheck={false}
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear model search"
                className="model-search-clear"
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                type="button"
              >
                <X aria-hidden="true" size={13} />
              </button>
            ) : null}
          </div>
          <div
            aria-label="Available models"
            className="model-menu-scroll"
            role="listbox"
          >
            {filteredProviders.map((provider) => {
              const definition = PROVIDER_DEFINITIONS[provider.provider]
              return (
                <div
                  aria-label={definition.name}
                  className="model-group"
                  key={provider.provider}
                  role="group"
                >
                  <div className="model-group-label">
                    <span>{definition.name}</span>
                    <span>{provider.models.length}</span>
                  </div>
                  {provider.models.map((model) => {
                    const selected =
                      provider.provider === activeProvider && model.id === activeModel
                    const loading = busyModel === `${provider.provider}:${model.id}`
                    return (
                      <button
                        aria-selected={selected}
                        className={`model-option ${selected ? 'is-selected' : ''}`}
                        data-model-id={model.id}
                        data-model-provider={provider.provider}
                        key={model.id}
                        onClick={() => void chooseModel(provider.provider, model.id)}
                        role="option"
                        title={`${model.name} · ${definition.name}`}
                        type="button"
                      >
                        <ProviderMark provider={provider.provider} size={15} />
                        <span className="model-option-copy">
                          <span className="model-option-name">
                            {compactModelName(provider.provider, model.name)}
                          </span>
                        </span>
                        {model.latest ? <span className="latest-label">Latest</span> : null}
                        {loading ? (
                          <LoaderCircle aria-hidden="true" className="spin" size={14} />
                        ) : selected ? (
                          <Check aria-hidden="true" size={14} />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {filteredProviders.length === 0 ? (
              <p className="model-menu-empty">No models match this search.</p>
            ) : null}
          </div>
          {effortSupport?.options.length && activeEffortOption ? (
            <div className="model-effort">
              <div className="model-effort-heading">
                <span className="model-effort-title">
                  <Gauge aria-hidden="true" size={13} />
                  Effort
                </span>
                <span className="model-effort-value">
                  {activeEffortOption.label}
                </span>
              </div>
              <div
                aria-label="Reasoning effort"
                className="model-effort-options"
                role="radiogroup"
              >
                {effortSupport.options.map((option) => {
                  const selected = option.value === activeEffort
                  const loading = busyEffort === option.value
                  return (
                    <button
                      aria-checked={selected}
                      className={`model-effort-option ${
                        selected ? 'is-selected' : ''
                      }`}
                      disabled={Boolean(busyEffort)}
                      key={option.value}
                      onClick={() => void chooseEffort(option.value)}
                      role="radio"
                      title={option.description}
                      type="button"
                    >
                      {loading ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="spin"
                          size={11}
                        />
                      ) : (
                        option.label
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="model-effort-description">
                {activeEffortOption.description}
              </p>
            </div>
          ) : activeModel ? (
            <div className="model-effort is-unavailable">
              <span className="model-effort-title">
                <Gauge aria-hidden="true" size={13} />
                Effort
              </span>
              <span>Uses this model's default behavior</span>
            </div>
          ) : null}
          <button
            className="model-menu-footer"
            onClick={() => {
              setOpen(false)
              onOpenSettings()
            }}
            type="button"
          >
            <Settings2 aria-hidden="true" size={14} />
            Manage model sources
          </button>
          {error ? <p className="field-error model-menu-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
