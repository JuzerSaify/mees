import type { AgentActivity, AgentActivityKind } from '../../../shared/types'

export const AGENT_STATUS_CYCLE_MS = 2_400

export const AGENT_STATUS_CYCLES: Record<AgentActivityKind, string[]> = {
  research: [
    'Searching the web',
    'Viewing current sources',
    'Checking publication dates',
    'Comparing source quality',
    'Reading the evidence',
    'Resolving conflicting details'
  ],
  fetch: [
    'Finding real visuals',
    'Viewing image sources',
    'Checking image relevance',
    'Comparing crops and dimensions',
    'Matching the subject',
    'Preparing the visual asset'
  ],
  evidence: [
    'Verifying the claims',
    'Checking source support',
    'Weighing the evidence',
    'Looking for contradictions',
    'Confirming the final facts'
  ],
  inspect: [
    'Understanding the render',
    'Viewing the visual result',
    'Checking the composition',
    'Testing the responsive view',
    'Inspecting accessibility',
    'Reviewing runtime behavior'
  ],
  transform: [
    'Measuring the source',
    'Reading the palette',
    'Preparing the crop',
    'Tracing the vector geometry',
    'Optimizing the asset',
    'Checking the transformed result'
  ],
  clarify: [
    'Checking one missing detail',
    'Preparing a precise question',
    'Removing an unsafe assumption'
  ],
  compose: [
    'Thinking through the brief',
    'Understanding the request',
    'Reading the context',
    'Mapping the content',
    'Choosing the direction',
    'Weighing the composition',
    'Preparing the artifact'
  ],
  write: [
    'Writing the live canvas',
    'Building the layout',
    'Composing the sections',
    'Balancing type and spacing',
    'Setting responsive behavior',
    'Checking the details',
    'Streaming the artifact',
    'Tightening the finish'
  ],
  review: [
    'Reviewing the artifact',
    'Testing the layout',
    'Checking accessibility',
    'Looking for visual repetition',
    'Reviewing the runtime',
    'Preparing the final result'
  ]
}

export const DEFAULT_AGENT_STATUSES = [
  'Thinking through the brief',
  'Reading the request',
  'Understanding the context',
  'Mapping the direction',
  'Weighing the material',
  'Preparing the composition',
  'Sending the request',
  'Waiting for the model',
  'Reading the first response',
  'Checking the structure',
  'Considering the visual system',
  'Choosing the strongest idea'
]

export const ARTIFACT_AGENT_STATUSES = [
  'Receiving the artifact',
  'Writing the live canvas',
  'Arranging the layout',
  'Balancing type and spacing',
  'Checking responsive behavior',
  'Reviewing the finish',
  'Preparing the final artifact'
]

export function agentStatusOptions(
  activity: AgentActivity | undefined,
  designStarted: boolean,
  modelName?: string
): string[] {
  if (designStarted) {
    return ARTIFACT_AGENT_STATUSES
  }
  if (activity) {
    return Array.from(
      new Set([
        activity.label,
        ...(activity.detail ? [] : AGENT_STATUS_CYCLES[activity.kind])
      ])
    ).filter(Boolean)
  }
  if (!designStarted && modelName) {
    return [`Waiting for ${modelName}`, ...DEFAULT_AGENT_STATUSES]
  }
  return DEFAULT_AGENT_STATUSES
}

export function chooseAgentStatus(
  activity: AgentActivity | undefined,
  designStarted: boolean,
  elapsedMs: number,
  modelName?: string
): { label: string; detail?: string } {
  const options = agentStatusOptions(activity, designStarted, modelName)
  const index =
    Math.floor(Math.max(0, elapsedMs) / AGENT_STATUS_CYCLE_MS) %
    Math.max(1, options.length)
  return {
    label: options[index] ?? 'Working on the request',
    ...(activity?.detail ? { detail: activity.detail } : {})
  }
}

export function uniqueAgentStatusCount(): number {
  return new Set([
    ...Object.values(AGENT_STATUS_CYCLES).flat(),
    ...DEFAULT_AGENT_STATUSES,
    ...ARTIFACT_AGENT_STATUSES
  ]).size
}
