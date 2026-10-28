import type {
  AgentActivity,
  AgentToolMetrics,
  DesignMode,
  DesignSelection,
  FetchedVisualAsset,
  ProviderId,
  TokenUsage
} from '../../../shared/types'

export type AgentRunStatus =
  | 'starting'
  | 'streaming'
  | 'done'
  | 'error'
  | 'cancelled'

export interface AgentRunView {
  requestId: string | null
  projectId: string
  assistantMessageId: string
  provider: ProviderId
  model: string
  modelName: string
  startedAt: number
  finishedAt?: number
  status: AgentRunStatus
  bytes: number
  designBytes: number
  designStarted: boolean
  mode: 'design' | 'polish' | 'targeted-edit'
  designMode: DesignMode
  target?: DesignSelection
  assets: FetchedVisualAsset[]
  activities: AgentActivity[]
  metrics?: AgentToolMetrics
  error?: string
  usage?: TokenUsage
}
