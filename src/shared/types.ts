import type { EffortLevel } from './effort'

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek'

export interface ProviderDefinition {
  id: ProviderId
  name: string
  series: string
  keyUrl: string
}

export const PROVIDER_DEFINITIONS: Record<ProviderId, ProviderDefinition> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    series: 'GPT',
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Claude',
    series: 'Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys'
  },
  google: {
    id: 'google',
    name: 'Gemini',
    series: 'Google',
    keyUrl: 'https://aistudio.google.com/app/apikey'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    series: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com/api_keys'
  }
}

export const PROVIDER_IDS = Object.keys(PROVIDER_DEFINITIONS) as ProviderId[]

export interface ModelInfo {
  id: string
  name: string
  provider: ProviderId
  releasedAt?: string
  contextWindow?: number
  outputLimit?: number
  supportsImages?: boolean
  latest?: boolean
  shutdownDate?: string
}

export interface ProviderStatus {
  provider: ProviderId
  connected: boolean
  keyHint?: string
  models: ModelInfo[]
  selectedModel?: string
  verifiedAt?: string
}

export type DesignMode = 'website' | 'logo' | 'vector' | 'motion'

export interface MeesSettings {
  onboardingComplete: boolean
  reviewAfterBuild: boolean
  activeProvider: ProviderId | null
  activeModel: string | null
  activeEffort: EffortLevel | null
  providers: ProviderStatus[]
  secureStorageAvailable: boolean
  storageBackend: string
  dataPath: string
}

export type MessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled'

export interface AgentQuestionOption {
  id: string
  label: string
  description?: string
  recommended?: boolean
}

export interface AgentQuestion {
  id: string
  prompt: string
  rationale?: string
  options: AgentQuestionOption[]
}

export interface AgentToolMetrics {
  rounds: number
  parallelBatches: number
  queries: number
  toolCalls?: number
  pagesRead?: number
  sources: number
  claims?: number
  conflicts?: number
  fetchedAssets?: number
  visualInspections?: number
  reusedToolCalls?: number
  evidenceItems: number
  durationMs: number
  firstTokenMs?: number
  toolDurationMs?: number
  writeDurationMs?: number
}

export interface AgentToolComparison {
  evidencePercent: number | null
  issuePercent?: number | null
  runtimePercent?: number | null
}

export interface ResearchSource {
  id: string
  title: string
  url: string
  publisher: string
  snippet: string
  pageContent?: string
  retrievedAt?: string
  publishedAt?: string
  quality?: 'official' | 'primary' | 'editorial' | 'reference' | 'unknown'
  faviconUrl?: string
}

export interface EvidenceItem {
  id: string
  claim: string
  verdict: 'supported' | 'partial' | 'conflicting' | 'unsupported'
  sourceIds: string[]
  citations: Array<{
    title: string
    url: string
    publisher: string
    retrievedAt?: string
  }>
  qualityScore: number
  freshnessScore: number
  notes: string[]
}

export interface ReferenceVisualSummary {
  imageId: string
  name: string
  width: number
  height: number
  aspectRatio: number
  palette: string[]
  averageLuminance: number
  contrast: number
  colorfulness: number
  edgeDensity: number
  transparent: boolean
}

export interface AgentReferenceImage {
  id: string
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  dataUrl: string
  visualSummary?: ReferenceVisualSummary
}

export interface DesignSelection {
  selector: string
  tag: string
  label: string
  text: string
  html: string
  styles?: string
  rect?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface FetchedVisualAsset {
  id: string
  token: string
  kind: 'image' | 'icon'
  title: string
  description?: string
  pageUrl: string
  sourceUrl: string
  contentType: string
  byteLength: number
  width?: number
  height?: number
  dataUrl: string
  role?: 'asset' | 'reference' | 'screenshot' | 'derived'
  provider?: 'web-page' | 'wikimedia-commons' | 'derived'
  creator?: string
  license?: string
  licenseUrl?: string
  attribution?: string
}

export interface EditPatch {
  replacement: string
  styles?: string
  note: string
}

export type AgentActivityKind =
  | 'research'
  | 'fetch'
  | 'evidence'
  | 'inspect'
  | 'transform'
  | 'clarify'
  | 'compose'
  | 'write'
  | 'review'

export type AgentActivityStatus =
  | 'running'
  | 'complete'
  | 'error'
  | 'cancelled'

export interface AgentActivity {
  id: string
  kind: AgentActivityKind
  label: string
  detail?: string
  status: AgentActivityStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  sources?: ResearchSource[]
}

export type AgentTelemetryStage =
  | 'model'
  | 'tool'
  | 'write'
  | 'review'
  | 'runtime'

export interface AgentTelemetrySpan {
  id: string
  stage: AgentTelemetryStage
  label: string
  status: AgentActivityStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  detail?: string
}

export interface AgentRunTelemetry {
  requestStartedAt: string
  firstTokenAt?: string
  completedAt?: string
  spans: AgentTelemetrySpan[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  status: MessageStatus
  provider?: ProviderId
  model?: string
  effort?: EffortLevel
  designMode?: DesignMode
  target?: DesignSelection
  referenceImages?: AgentReferenceImage[]
  referenceVisuals?: ReferenceVisualSummary[]
  clarification?: AgentQuestion
  toolMetrics?: AgentToolMetrics
  toolComparison?: AgentToolComparison
  evidence?: EvidenceItem[]
  telemetry?: AgentRunTelemetry
  error?: string
  activities?: AgentActivity[]
}

export interface AppProject {
  id: string
  title: string
  titleEdited: boolean
  createdAt: string
  updatedAt: string
  designMode: DesignMode
  messages: ChatMessage[]
  designHtml: string
  revision: number
  versions: DesignVersion[]
  audit?: DesignAudit
}

export interface AppSnapshot {
  settings: MeesSettings
  projects: AppProject[]
  designMemory: DesignMemoryEntry[]
}

export interface PreferencesUpdate {
  onboardingComplete?: boolean
  reviewAfterBuild?: boolean
  activeProvider?: ProviderId | null
  activeModel?: string | null
  activeEffort?: EffortLevel | null
}

export interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  referenceImages?: AgentReferenceImage[]
}

export interface StartAgentRequest {
  provider: ProviderId
  model: string
  effort?: EffortLevel
  history: AgentHistoryMessage[]
  currentDesign: string
  designMode: DesignMode
  mode?: 'design' | 'polish' | 'targeted-edit'
  reviewNotes?: string
  target?: DesignSelection
  recentDesigns?: RecentDesignSummary[]
  referenceVisuals?: ReferenceVisualSummary[]
  designMemory?: DesignMemoryEntry[]
}

export type DesignViewport = 'desktop' | 'tablet' | 'mobile'
export type DesignIssueSeverity = 'error' | 'warning'

export interface DesignIssue {
  id: string
  viewport: DesignViewport
  severity: DesignIssueSeverity
  rule: string
  title: string
  detail: string
  selector?: string
}

export interface DesignViewportAudit {
  viewport: DesignViewport
  width: number
  issues: DesignIssue[]
  nodeCount: number
  headingCount: number
  interactiveCount: number
  imageCount: number
  fingerprint?: DesignFingerprint
}

export interface DesignFingerprint {
  hero: string
  media: string
  typography: string
  background: string
  density: string
  sectionCount: number
}

export interface RecentDesignSummary {
  title: string
  fingerprint: DesignFingerprint
  palette?: string[]
  fonts?: string[]
}

export interface DesignAudit {
  createdAt: string
  revision: number
  mode: DesignMode
  issueCount: number
  issues: DesignIssue[]
  viewports: DesignViewportAudit[]
  palette: string[]
  fonts: string[]
  runtime?: ArtifactRuntimeReport
  screenshots?: DesignScreenshot[]
}

export interface DesignScreenshot {
  viewport: DesignViewport
  width: number
  height: number
  assetUrl: string
  createdAt: string
}

export interface ArtifactRuntimeIssue {
  viewport: DesignViewport
  rule: string
  severity: DesignIssueSeverity
  title: string
  detail: string
  selector?: string
}

export interface ArtifactRuntimeReport {
  capturedAt: string
  durationMs: number
  consoleErrors: string[]
  pageErrors: string[]
  networkFailures: string[]
  issues: ArtifactRuntimeIssue[]
  screenshots: DesignScreenshot[]
  document: {
    title: string
    language: string
    headings: string[]
    landmarks: string[]
    controls: number
    links: number
    images: number
    forms: number
  }
}

export interface DesignVersion {
  id: string
  label: string
  designHtml: string
  createdAt: string
  revision: number
}

export type DesignMemoryKind =
  | 'brand-kit'
  | 'palette'
  | 'typography'
  | 'logo'
  | 'asset'
  | 'component'

export interface DesignMemoryEntry {
  id: string
  kind: DesignMemoryKind
  name: string
  designMode: DesignMode
  palette: string[]
  fonts: string[]
  fingerprint?: DesignFingerprint
  sourceProjectId?: string
  sourceTitle?: string
  artifactHtml?: string
  assetUrls?: string[]
  createdAt: string
}

export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
}

export type AgentStreamEvent =
  | { requestId: string; type: 'delta'; delta: string }
  | { requestId: string; type: 'activity'; activity: AgentActivity }
  | {
      requestId: string
      type: 'assets'
      assets: FetchedVisualAsset[]
    }
  | { requestId: string; type: 'question'; question: AgentQuestion }
  | { requestId: string; type: 'evidence'; evidence: EvidenceItem[] }
  | { requestId: string; type: 'telemetry'; telemetry: AgentRunTelemetry }
  | {
      requestId: string
      type: 'done'
      usage?: TokenUsage
      metrics?: AgentToolMetrics
    }
  | { requestId: string; type: 'error'; error: string }
  | { requestId: string; type: 'cancelled' }

export interface ExportResult {
  saved: boolean
  filePath?: string
}

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface AppUpdateState {
  currentVersion: string
  status: AppUpdateStatus
  availableVersion?: string
  percent?: number
  message?: string
  checkedAt?: string
}

export interface MeesApi {
  getState: () => Promise<AppSnapshot>
  connectProvider: (provider: ProviderId, apiKey: string) => Promise<AppSnapshot>
  disconnectProvider: (provider: ProviderId) => Promise<AppSnapshot>
  refreshModels: (provider: ProviderId) => Promise<AppSnapshot>
  selectModel: (provider: ProviderId, model: string) => Promise<AppSnapshot>
  savePreferences: (update: PreferencesUpdate) => Promise<AppSnapshot>
  saveProject: (project: AppProject) => Promise<AppProject>
  deleteProject: (projectId: string) => Promise<void>
  captureArtifact: (
    html: string,
    mode: DesignMode
  ) => Promise<ArtifactRuntimeReport>
  saveDesignMemory: (entry: DesignMemoryEntry) => Promise<AppSnapshot>
  deleteDesignMemory: (entryId: string) => Promise<AppSnapshot>
  startAgent: (request: StartAgentRequest) => Promise<{ requestId: string }>
  cancelAgent: (requestId: string) => Promise<void>
  onAgentEvent: (listener: (event: AgentStreamEvent) => void) => () => void
  exportHtml: (
    html: string,
    title: string,
    designMode: DesignMode
  ) => Promise<ExportResult>
  exportMotion: (html: string, title: string) => Promise<ExportResult>
  openPreview: (html: string, title: string) => Promise<void>
  openDataFolder: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  getUpdateState: () => Promise<AppUpdateState>
  checkForUpdates: () => Promise<AppUpdateState>
  downloadUpdate: () => Promise<AppUpdateState>
  installUpdate: () => Promise<void>
  onUpdateEvent: (listener: (state: AppUpdateState) => void) => () => void
}

export const IPC_CHANNELS = {
  getState: 'mees:get-state',
  connectProvider: 'mees:connect-provider',
  disconnectProvider: 'mees:disconnect-provider',
  refreshModels: 'mees:refresh-models',
  selectModel: 'mees:select-model',
  savePreferences: 'mees:save-preferences',
  saveProject: 'mees:save-project',
  deleteProject: 'mees:delete-project',
  captureArtifact: 'mees:capture-artifact',
  saveDesignMemory: 'mees:save-design-memory',
  deleteDesignMemory: 'mees:delete-design-memory',
  startAgent: 'mees:start-agent',
  cancelAgent: 'mees:cancel-agent',
  agentEvent: 'mees:agent-event',
  exportHtml: 'mees:export-html',
  exportMotion: 'mees:export-motion',
  openPreview: 'mees:open-preview',
  openDataFolder: 'mees:open-data-folder',
  openExternal: 'mees:open-external',
  getUpdateState: 'mees:get-update-state',
  checkForUpdates: 'mees:check-for-updates',
  downloadUpdate: 'mees:download-update',
  installUpdate: 'mees:install-update',
  updateEvent: 'mees:update-event'
} as const
