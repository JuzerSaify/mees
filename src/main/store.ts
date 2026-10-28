import { app, safeStorage } from 'electron'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  PROVIDER_IDS,
  type AppProject,
  type AppSnapshot,
  type DesignAudit,
  type DesignVersion,
  type DesignMode,
  type KernSettings,
  type ModelInfo,
  type PreferencesUpdate,
  type ProviderId,
  type ProviderStatus
} from '../shared/types'
import {
  getEffortSupport,
  isEffortLevel,
  normalizeEffort,
  type EffortLevel
} from '../shared/effort'
import { filterModelCatalog } from '../shared/model-catalog'

interface StoredProvider {
  encryptedApiKey: string
  keyHint: string
  models: ModelInfo[]
  selectedModel?: string
  verifiedAt: string
}

interface StoredSettings {
  version: 1
  onboardingComplete: boolean
  reviewAfterBuild: boolean
  activeProvider: ProviderId | null
  activeModel: string | null
  efforts: Partial<Record<ProviderId, Record<string, EffortLevel>>>
  providers: Partial<Record<ProviderId, StoredProvider>>
}

interface StoredProjects {
  version: 1
  projects: AppProject[]
}

function defaultSettings(): StoredSettings {
  return {
    version: 1,
    onboardingComplete: false,
    reviewAfterBuild: true,
    activeProvider: null,
    activeModel: null,
    efforts: {},
    providers: {}
  }
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDER_IDS.includes(value as ProviderId)
}

function isDesignMode(value: unknown): value is DesignMode {
  return (
    value === 'website' ||
    value === 'logo' ||
    value === 'vector' ||
    value === 'motion'
  )
}

function sanitizeStoredSettings(value: unknown): StoredSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rawProviders =
    record.providers && typeof record.providers === 'object'
      ? (record.providers as Record<string, unknown>)
      : {}
  const providers: Partial<Record<ProviderId, StoredProvider>> = {}
  const rawEfforts =
    record.efforts && typeof record.efforts === 'object'
      ? (record.efforts as Record<string, unknown>)
      : {}
  const efforts: Partial<Record<ProviderId, Record<string, EffortLevel>>> = {}

  for (const providerId of PROVIDER_IDS) {
    const providerEfforts = rawEfforts[providerId]
    if (!providerEfforts || typeof providerEfforts !== 'object') continue
    const entries = Object.entries(providerEfforts as Record<string, unknown>)
      .filter(
        (entry): entry is [string, EffortLevel] =>
          entry[0].length > 0 && isEffortLevel(entry[1])
      )
    if (entries.length > 0) efforts[providerId] = Object.fromEntries(entries)
  }

  for (const providerId of PROVIDER_IDS) {
    const candidate = rawProviders[providerId]
    if (!candidate || typeof candidate !== 'object') continue
    const provider = candidate as Record<string, unknown>
    if (
      typeof provider.encryptedApiKey !== 'string' ||
      !Array.isArray(provider.models) ||
      provider.models.length === 0
    ) {
      continue
    }

    providers[providerId] = {
      encryptedApiKey: provider.encryptedApiKey,
      keyHint: typeof provider.keyHint === 'string' ? provider.keyHint : 'stored key',
      models: provider.models as ModelInfo[],
      selectedModel:
        typeof provider.selectedModel === 'string' ? provider.selectedModel : undefined,
      verifiedAt:
        typeof provider.verifiedAt === 'string'
          ? provider.verifiedAt
          : new Date(0).toISOString()
    }
  }

  return {
    version: 1,
    onboardingComplete: record.onboardingComplete === true,
    reviewAfterBuild: record.reviewAfterBuild !== false,
    activeProvider: isProviderId(record.activeProvider) ? record.activeProvider : null,
    activeModel: typeof record.activeModel === 'string' ? record.activeModel : null,
    efforts,
    providers
  }
}

function sanitizeProjects(value: unknown): AppProject[] {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.projects)) return []

  return record.projects
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter(
      (project) =>
        typeof project.id === 'string' &&
        typeof project.title === 'string' &&
        Array.isArray(project.messages)
    )
    .map((project) => ({
      id: String(project.id),
      title: String(project.title),
      titleEdited: project.titleEdited === true,
      createdAt:
        typeof project.createdAt === 'string'
          ? project.createdAt
          : new Date(0).toISOString(),
      updatedAt:
        typeof project.updatedAt === 'string'
          ? project.updatedAt
          : new Date(0).toISOString(),
      designMode: isDesignMode(project.designMode)
        ? project.designMode
        : 'website',
      messages: project.messages as AppProject['messages'],
      designHtml: typeof project.designHtml === 'string' ? project.designHtml : '',
      revision:
        typeof project.revision === 'number' && Number.isFinite(project.revision)
          ? project.revision
          : 0,
      versions: sanitizeVersions(project.versions),
      audit: sanitizeAudit(project.audit)
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function sanitizeVersions(value: unknown): DesignVersion[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter(
      (version) =>
        typeof version.id === 'string' &&
        typeof version.label === 'string' &&
        typeof version.designHtml === 'string'
    )
    .slice(-10)
    .map((version) => ({
      id: String(version.id),
      label: String(version.label).slice(0, 80),
      designHtml: String(version.designHtml),
      createdAt:
        typeof version.createdAt === 'string'
          ? version.createdAt
          : new Date(0).toISOString(),
      revision:
        typeof version.revision === 'number' && Number.isFinite(version.revision)
          ? version.revision
          : 0
    }))
}

function sanitizeAudit(value: unknown): DesignAudit | undefined {
  if (!value || typeof value !== 'object') return undefined
  const audit = value as Record<string, unknown>
  if (
    typeof audit.createdAt !== 'string' ||
    typeof audit.revision !== 'number' ||
    !Array.isArray(audit.issues) ||
    !Array.isArray(audit.viewports)
  ) {
    return undefined
  }

  return {
    createdAt: audit.createdAt,
    revision: audit.revision,
    mode: isDesignMode(audit.mode) ? audit.mode : 'website',
    issueCount:
      typeof audit.issueCount === 'number' ? audit.issueCount : audit.issues.length,
    issues: audit.issues as DesignAudit['issues'],
    viewports: audit.viewports as DesignAudit['viewports'],
    palette: Array.isArray(audit.palette)
      ? audit.palette.filter((color): color is string => typeof color === 'string').slice(0, 8)
      : [],
    fonts: Array.isArray(audit.fonts)
      ? audit.fonts.filter((font): font is string => typeof font === 'string').slice(0, 5)
      : []
  }
}

export class KernStore {
  readonly dataDirectory = app.getPath('userData')
  private readonly settingsPath = join(this.dataDirectory, 'settings.json')
  private readonly projectsPath = join(this.dataDirectory, 'projects.json')
  private settings = defaultSettings()
  private projects: AppProject[] = []
  private settingsTask: Promise<void> = Promise.resolve()
  private projectsTask: Promise<void> = Promise.resolve()
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) return
    await mkdir(this.dataDirectory, { recursive: true })

    try {
      const raw = await readFile(this.settingsPath, 'utf8')
      this.settings = sanitizeStoredSettings(JSON.parse(raw))
    } catch {
      this.settings = defaultSettings()
    }

    try {
      const raw = await readFile(this.projectsPath, 'utf8')
      this.projects = sanitizeProjects(JSON.parse(raw))
    } catch {
      this.projects = []
    }

    this.initialized = true
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true })
    const tempPath = `${path}.${randomUUID()}.tmp`
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(tempPath, path)
    await chmod(path, 0o600).catch(() => undefined)
  }

  private async mutateSettings<T>(mutator: () => Promise<T> | T): Promise<T> {
    const task = this.settingsTask.then(async () => {
      const result = await mutator()
      await this.writeJson(this.settingsPath, this.settings)
      return result
    })
    this.settingsTask = task.then(
      () => undefined,
      () => undefined
    )
    return task
  }

  private async mutateProjects<T>(mutator: () => Promise<T> | T): Promise<T> {
    const task = this.projectsTask.then(async () => {
      const result = await mutator()
      await this.writeJson(this.projectsPath, {
        version: 1,
        projects: this.projects
      } satisfies StoredProjects)
      return result
    })
    this.projectsTask = task.then(
      () => undefined,
      () => undefined
    )
    return task
  }

  private async encryptionAvailable(): Promise<boolean> {
    try {
      const available = await safeStorage.isAsyncEncryptionAvailable()
      if (!available) return false
      if (process.platform === 'linux') {
        return safeStorage.getSelectedStorageBackend() !== 'basic_text'
      }
      return true
    } catch {
      return false
    }
  }

  private storageBackend(): string {
    if (process.platform === 'win32') return 'Windows Data Protection'
    if (process.platform === 'darwin') return 'macOS Keychain'
    try {
      const backend = safeStorage.getSelectedStorageBackend()
      if (backend === 'basic_text') return 'No protected Linux key store'
      return backend || 'System secret store'
    } catch {
      return 'System secret store'
    }
  }

  private providerStatuses(): ProviderStatus[] {
    return PROVIDER_IDS.map((providerId) => {
      const stored = this.settings.providers[providerId]
      const models = filterModelCatalog(providerId, stored?.models ?? [])
      return {
        provider: providerId,
        connected: Boolean(stored) && models.length > 0,
        keyHint: stored?.keyHint,
        models,
        selectedModel: stored?.selectedModel,
        verifiedAt: stored?.verifiedAt
      }
    })
  }

  private normalizedActiveProvider(): ProviderId | null {
    if (
      this.settings.activeProvider &&
      this.settings.providers[this.settings.activeProvider] &&
      filterModelCatalog(
        this.settings.activeProvider,
        this.settings.providers[this.settings.activeProvider]?.models ?? []
      ).length > 0
    ) {
      return this.settings.activeProvider
    }
    return (
      PROVIDER_IDS.find(
        (id) =>
          this.settings.providers[id] &&
          filterModelCatalog(id, this.settings.providers[id]?.models ?? []).length > 0
      ) ?? null
    )
  }

  private normalizedActiveModel(): string | null {
    const provider = this.normalizedActiveProvider()
    if (!provider) return null
    const stored = this.settings.providers[provider]
    if (!stored) return null
    const models = filterModelCatalog(provider, stored.models)
    if (
      this.settings.activeModel &&
      models.some((model) => model.id === this.settings.activeModel)
    ) {
      return this.settings.activeModel
    }
    return (
      (stored.selectedModel &&
      models.some((model) => model.id === stored.selectedModel)
        ? stored.selectedModel
        : undefined) ??
      models[0]?.id ??
      null
    )
  }

  private normalizedActiveEffort(): EffortLevel | null {
    const provider = this.normalizedActiveProvider()
    const model = this.normalizedActiveModel()
    if (!provider || !model) return null
    return normalizeEffort(
      provider,
      model,
      this.settings.efforts[provider]?.[model]
    )
  }

  async getSnapshot(): Promise<AppSnapshot> {
    await Promise.all([this.settingsTask, this.projectsTask])
    const activeProvider = this.normalizedActiveProvider()
    const activeModel = this.normalizedActiveModel()
    const activeEffort = this.normalizedActiveEffort()

    const settings: KernSettings = {
      onboardingComplete: this.settings.onboardingComplete,
      reviewAfterBuild: this.settings.reviewAfterBuild,
      activeProvider,
      activeModel,
      activeEffort,
      providers: this.providerStatuses(),
      secureStorageAvailable: await this.encryptionAvailable(),
      storageBackend: this.storageBackend(),
      dataPath: this.dataDirectory
    }

    return {
      settings,
      projects: [...this.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
  }

  async saveEncryptedProvider(
    provider: ProviderId,
    encryptedApiKey: string,
    keyHint: string,
    models: ModelInfo[]
  ): Promise<void> {
    await this.mutateSettings(() => {
      const selectedModel = models[0]?.id
      this.settings.providers[provider] = {
        encryptedApiKey,
        keyHint,
        models,
        selectedModel,
        verifiedAt: new Date().toISOString()
      }
      this.settings.activeProvider = provider
      this.settings.activeModel = selectedModel ?? null
      this.settings.efforts[provider] = Object.fromEntries(
        Object.entries(this.settings.efforts[provider] ?? {}).filter(([modelId]) =>
          models.some((model) => model.id === modelId)
        )
      )
    })
  }

  async updateProviderModels(
    provider: ProviderId,
    models: ModelInfo[],
    encryptedApiKey?: string
  ): Promise<void> {
    await this.mutateSettings(() => {
      const existing = this.settings.providers[provider]
      if (!existing) throw new Error('Connect this provider before refreshing its models.')
      const selectedModel =
        existing.selectedModel && models.some((model) => model.id === existing.selectedModel)
          ? existing.selectedModel
          : models[0]?.id

      this.settings.providers[provider] = {
        ...existing,
        encryptedApiKey: encryptedApiKey ?? existing.encryptedApiKey,
        models,
        selectedModel,
        verifiedAt: new Date().toISOString()
      }
      this.settings.efforts[provider] = Object.fromEntries(
        Object.entries(this.settings.efforts[provider] ?? {}).filter(([modelId]) =>
          models.some((model) => model.id === modelId)
        )
      )
      if (this.settings.activeProvider === provider) {
        this.settings.activeModel = selectedModel ?? null
      }
    })
  }

  async disconnectProvider(provider: ProviderId): Promise<void> {
    await this.mutateSettings(() => {
      delete this.settings.providers[provider]
      delete this.settings.efforts[provider]
      if (this.settings.activeProvider === provider) {
        this.settings.activeProvider =
          PROVIDER_IDS.find((id) => this.settings.providers[id]) ?? null
        this.settings.activeModel = this.normalizedActiveModel()
      }
    })
  }

  async selectModel(provider: ProviderId, modelId: string): Promise<void> {
    await this.mutateSettings(() => {
      const stored = this.settings.providers[provider]
      if (!stored) throw new Error('Provider is not connected.')
      if (!stored.models.some((model) => model.id === modelId)) {
        throw new Error('That model is not available for the connected account.')
      }
      stored.selectedModel = modelId
      this.settings.activeProvider = provider
      this.settings.activeModel = modelId
    })
  }

  async savePreferences(update: PreferencesUpdate): Promise<void> {
    await this.mutateSettings(() => {
      if (typeof update.onboardingComplete === 'boolean') {
        this.settings.onboardingComplete = update.onboardingComplete
      }
      if (typeof update.reviewAfterBuild === 'boolean') {
        this.settings.reviewAfterBuild = update.reviewAfterBuild
      }
      if (update.activeProvider !== undefined) {
        if (update.activeProvider === null) {
          this.settings.activeProvider = null
          this.settings.activeModel = null
        } else if (this.settings.providers[update.activeProvider]) {
          this.settings.activeProvider = update.activeProvider
        }
      }
      if (update.activeModel !== undefined) {
        this.settings.activeModel = update.activeModel
      }
      if (update.activeEffort !== undefined) {
        const provider = this.normalizedActiveProvider()
        const model = this.normalizedActiveModel()
        if (!provider || !model) {
          throw new Error('Choose a model before setting its effort.')
        }
        if (update.activeEffort === null) {
          delete this.settings.efforts[provider]?.[model]
        } else {
          const effort = getEffortSupport(provider, model)
          if (
            !effort.options.some((option) => option.value === update.activeEffort)
          ) {
            throw new Error('That effort level is not supported by this model.')
          }
          this.settings.efforts[provider] = {
            ...this.settings.efforts[provider],
            [model]: update.activeEffort
          }
        }
      }
      this.settings.activeProvider = this.normalizedActiveProvider()
      this.settings.activeModel = this.normalizedActiveModel()
    })
  }

  async getApiKey(provider: ProviderId): Promise<string> {
    const stored = this.settings.providers[provider]
    if (!stored) throw new Error('Provider is not connected.')
    if (!(await this.encryptionAvailable())) {
      throw new Error('OS-protected key storage is unavailable.')
    }

    try {
      const encrypted = Buffer.from(stored.encryptedApiKey, 'base64')
      if (safeStorage.decryptStringAsync) {
        const result = await safeStorage.decryptStringAsync(encrypted)
        if (typeof result === 'string') return result
        return result.result
      }
      if (safeStorage.decryptString) return safeStorage.decryptString(encrypted)
    } catch {
      throw new Error(
        'Kern could not unlock the saved API key. Reconnect the provider in Settings.'
      )
    }

    throw new Error('This version of Electron cannot decrypt saved keys.')
  }

  async encryptApiKey(apiKey: string): Promise<string> {
    if (!(await this.encryptionAvailable())) {
      throw new Error(
        'OS-protected storage is unavailable. Kern will not save API keys in plain text.'
      )
    }

    if (safeStorage.encryptStringAsync) {
      const encrypted = await safeStorage.encryptStringAsync(apiKey)
      return encrypted.toString('base64')
    }
    if (safeStorage.encryptString) {
      return safeStorage.encryptString(apiKey).toString('base64')
    }
    throw new Error('This version of Electron cannot encrypt API keys.')
  }

  async saveProject(project: AppProject): Promise<AppProject> {
    const nextProject: AppProject = {
      ...project,
      updatedAt: new Date().toISOString()
    }
    await this.mutateProjects(() => {
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects[index] = nextProject
      else this.projects.push(nextProject)
      this.projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
    return nextProject
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.mutateProjects(() => {
      this.projects = this.projects.filter((project) => project.id !== projectId)
    })
  }
}
