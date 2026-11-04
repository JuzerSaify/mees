import type { ModelInfo, ProviderId } from './types'

export const EFFORT_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra'
] as const

export type EffortLevel = (typeof EFFORT_LEVELS)[number]

export type EffortTransport =
  | 'openai'
  | 'anthropic'
  | 'gemini-level'
  | 'gemini-budget'
  | 'deepseek'
  | 'harness'
  | 'none'

export interface EffortOption {
  value: EffortLevel
  label: string
  description: string
}

export interface EffortSupport {
  transport: EffortTransport
  options: EffortOption[]
  defaultEffort: EffortLevel | null
}

const OPTION_COPY: Record<EffortLevel, string> = {
  none: 'Fastest response with reasoning disabled',
  minimal: 'The lightest reasoning pass',
  low: 'Faster, with a lighter reasoning pass',
  medium: 'Balanced speed, depth and cost',
  high: 'Deeper reasoning for complex interface work',
  xhigh: 'Extended work for long, demanding tasks',
  max: 'The model spends whatever it needs for its strongest result',
  ultra: 'Maximum reasoning with automatic task delegation'
}

const LABELS: Record<EffortLevel, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max',
  ultra: 'Ultra'
}

function options(levels: EffortLevel[], topIsMaximum = false): EffortOption[] {
  return levels.map((value, index) => ({
    value,
    label: LABELS[value],
    description:
      topIsMaximum && index === levels.length - 1
        ? "This is the model's maximum thinking depth"
        : OPTION_COPY[value]
  }))
}

function support(
  transport: Exclude<EffortTransport, 'none'>,
  levels: EffortLevel[],
  defaultEffort: EffortLevel,
  topIsMaximum = false
): EffortSupport {
  return {
    transport,
    options: options(levels, topIsMaximum),
    defaultEffort
  }
}

const NO_EFFORT: EffortSupport = {
  transport: 'none',
  options: [],
  defaultEffort: null
}

function openAiSupport(modelId: string): EffortSupport {
  const id = modelId.toLowerCase()
  const all = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as EffortLevel[]

  if (/^gpt-6\.1-(?:sol|terra|luna)(?:-|$)/.test(id)) {
    if (id.startsWith('gpt-6.1-sol')) {
      return support('openai', ['low', 'medium', 'high', 'xhigh', 'max'], 'medium')
    }
    return support('openai', all, 'medium')
  }
  if (id === 'gpt-6-astra' || id.startsWith('gpt-6-astra-')) {
    return support('openai', ['low', 'medium', 'high', 'xhigh', 'max'], 'high')
  }
  if (/^gpt-6-(?:sol|luna)(?:-|$)/.test(id)) {
    return support('openai', all, 'medium')
  }
  if (/^gpt-5\.6(?:-|$)/.test(id)) {
    return support('openai', all, 'medium')
  }
  if (/^gpt-5\.5(?:-|$)/.test(id)) {
    return support(
      'openai',
      ['none', 'low', 'medium', 'high', 'xhigh'],
      'medium'
    )
  }
  if (/^gpt-5\.4(?:-|$)/.test(id)) {
    return support(
      'openai',
      ['none', 'low', 'medium', 'high', 'xhigh'],
      'none'
    )
  }
  return NO_EFFORT
}

function anthropicSupport(modelId: string): EffortSupport {
  const id = modelId.toLowerCase()
  const all = ['low', 'medium', 'high', 'xhigh', 'max'] as EffortLevel[]
  const noExtended = ['low', 'medium', 'high', 'max'] as EffortLevel[]

  if (
    /claude-(?:fable|mythos)-5(?:[.-](?:1|5))?(?:-|$)/.test(id) ||
    /claude-(?:opus|sonnet)-5(?:[.-](?:1|5))?(?:-|$)/.test(id) ||
    /claude-haiku-5(?:[.-](?:1|5))?(?:-|$)/.test(id)
  ) {
    return support(
      'anthropic',
      all,
      /claude-(?:opus|haiku)-5(?:[.-](?:1|5))?(?:-|$)/.test(id)
        ? 'medium'
        : 'high'
    )
  }
  if (/claude-opus-4[.-](?:7|8)(?:-|$)/.test(id)) {
    return support('anthropic', all, 'high')
  }
  if (
    /claude-opus-4[.-]6(?:-|$)/.test(id) ||
    /claude-sonnet-4[.-]6(?:-|$)/.test(id)
  ) {
    return support('anthropic', noExtended, 'high')
  }
  if (/claude-opus-4[.-]5(?:-|$)/.test(id)) {
    return support('anthropic', ['low', 'medium', 'high'], 'high')
  }
  return NO_EFFORT
}

function geminiSupport(modelId: string): EffortSupport {
  const id = modelId.toLowerCase().replace(/^models\//, '')

  if (/^gemini-4-/.test(id)) {
    return support('gemini-level', ['low', 'medium', 'high'], 'medium', true)
  }
  if (/^gemini-3[.-]8-flash(?:-|$)/.test(id)) {
    return support('gemini-level', ['low', 'medium', 'high'], 'medium', true)
  }
  if (
    /^gemini-3[.-](?:6-flash|5-flash-lite|1-flash-lite)(?:-|$)/.test(id) ||
    /^gemini-3-flash(?:-|$)/.test(id)
  ) {
    return support(
      'gemini-level',
      ['minimal', 'low', 'medium', 'high'],
      'medium',
      true
    )
  }
  if (/^gemini-3[.-]1-pro(?:-|$)/.test(id)) {
    return support('gemini-level', ['low', 'medium', 'high'], 'high', true)
  }
  if (/^gemini-3-pro(?:-|$)/.test(id)) {
    return support('gemini-level', ['low', 'high'], 'high', true)
  }
  if (/^gemini-2[.-]5-/.test(id)) {
    return support('gemini-budget', ['low', 'medium', 'high'], 'medium', true)
  }
  return NO_EFFORT
}

function deepSeekSupport(modelId: string): EffortSupport {
  const id = modelId.toLowerCase()
  if (
    /^deepseek-(?:flash|reasoner|v4(?:[.-]1)?-pro)(?:-|$)/.test(id) ||
    /^deepseek-v4(?:[.-]1)?-flash(?:-|$)/.test(id)
  ) {
    return support('deepseek', ['low', 'high', 'max'], 'high')
  }
  return NO_EFFORT
}

export function getEffortSupport(
  provider: ProviderId,
  modelId: string,
  modelInfo?: ModelInfo
): EffortSupport {
  switch (provider) {
    case 'openai':
      return openAiSupport(modelId)
    case 'anthropic':
      return anthropicSupport(modelId)
    case 'google':
      return geminiSupport(modelId)
    case 'deepseek':
      return deepSeekSupport(modelId)
    case 'codex':
    case 'opencode':
    case 'agy':
      if (!modelInfo?.reasoningEfforts || modelInfo.reasoningEfforts.length < 2) {
        return NO_EFFORT
      }
      return {
        transport: 'harness',
        options: options(modelInfo.reasoningEfforts, true),
        defaultEffort:
          modelInfo.defaultEffort &&
          modelInfo.reasoningEfforts.includes(modelInfo.defaultEffort)
            ? modelInfo.defaultEffort
            : modelInfo.reasoningEfforts[0]
      }
    default:
      return NO_EFFORT
  }
}

export function isEffortLevel(value: unknown): value is EffortLevel {
  return (
    typeof value === 'string' &&
    (EFFORT_LEVELS as readonly string[]).includes(value)
  )
}

export function normalizeEffort(
  provider: ProviderId,
  modelId: string,
  requested: unknown,
  modelInfo?: ModelInfo
): EffortLevel | null {
  const effort = getEffortSupport(provider, modelId, modelInfo)
  if (!effort.defaultEffort) return null
  return isEffortLevel(requested) &&
    effort.options.some((option) => option.value === requested)
    ? requested
    : effort.defaultEffort
}

export function geminiThinkingBudget(
  modelId: string,
  effort: EffortLevel
): number {
  const id = modelId.toLowerCase()
  const isPro = id.includes('2.5-pro')
  if (effort === 'low') return 1_024
  if (effort === 'medium') return -1
  return isPro ? 32_768 : 24_576
}
