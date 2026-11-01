import type { ModelInfo, ProviderId } from './types'

const OPENAI_TEXT_FAMILY = /^(?:gpt-|o\d)/i
const OPENAI_NON_CHAT =
  /(?:embedding|moderation|whisper|transcri|tts|audio|image|dall-e|sora|realtime|computer-use|deep-research|search|instruct|codex|live)/i

const GEMINI_TEXT_FAMILY = /^gemini-/i
const GEMINI_NON_CHAT =
  /(?:^|-)(?:image|tts|live|native-audio|transcri(?:be|pt)?|omni|embedding|robotics|computer-use|deep-research|antigravity|lyria|imagen|nano-banana|customtools)(?:-|$)/i

const ANTHROPIC_TEXT_FAMILY = /^claude-/i
const DEEPSEEK_TEXT_FAMILY = /^deepseek-/i
const DEEPSEEK_NON_CHAT = /(?:embedding|audio|transcri|image)/i
const DATED_SNAPSHOT =
  /(?:[-_](?:20\d{2}[-_]?\d{2}[-_]?\d{2}|20\d{6})|-\d{6})$/i
const ALIAS_SUFFIX = /-(?:latest|preview)$/i

const MAX_MODELS: Record<ProviderId, number> = {
  openai: 16,
  anthropic: 8,
  google: 12,
  deepseek: 6,
  codex: 24,
  opencode: 80
}

const MAX_AGE_DAYS: Record<ProviderId, number> = {
  openai: 365,
  anthropic: 540,
  google: 540,
  deepseek: 730,
  codex: Number.MAX_SAFE_INTEGER,
  opencode: Number.MAX_SAFE_INTEGER
}

function isRetired(model: ModelInfo): boolean {
  if (!model.shutdownDate) return false
  const timestamp = Date.parse(model.shutdownDate)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

function isCurrent(model: ModelInfo, provider: ProviderId): boolean {
  if (!model.releasedAt) return true
  const releasedAt = Date.parse(model.releasedAt)
  if (!Number.isFinite(releasedAt)) return true
  return Date.now() - releasedAt <= MAX_AGE_DAYS[provider] * 86_400_000
}

function versionParts(id: string): number[] {
  return Array.from(id.matchAll(/\d+/g))
    .map((match) => Number.parseInt(match[0], 10))
    .filter((part) => Number.isFinite(part))
}

function compareVersionDesc(left: ModelInfo, right: ModelInfo): number {
  const leftParts = versionParts(left.id)
  const rightParts = versionParts(right.id)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return left.id.length - right.id.length || left.id.localeCompare(right.id)
}

function compareModels(left: ModelInfo, right: ModelInfo): number {
  const leftReleased = left.releasedAt ? Date.parse(left.releasedAt) : 0
  const rightReleased = right.releasedAt ? Date.parse(right.releasedAt) : 0
  if (
    Number.isFinite(leftReleased) &&
    Number.isFinite(rightReleased) &&
    leftReleased !== rightReleased
  ) {
    return rightReleased - leftReleased
  }
  return compareVersionDesc(left, right)
}

function hasStableCounterpart(model: ModelInfo, ids: Set<string>): boolean {
  if (!model.id.endsWith('-preview')) return false
  return ids.has(model.id.slice(0, -'-preview'.length))
}

function leadingVersion(id: string): number | null {
  const match = /\d+/.exec(id)
  if (!match) return null
  const value = Number.parseInt(match[0], 10)
  return Number.isFinite(value) ? value : null
}

function keepCurrentGeneration(models: ModelInfo[]): ModelInfo[] {
  const versions = models
    .map((model) => leadingVersion(model.id))
    .filter((version): version is number => version !== null)
  if (versions.length === 0) return models
  const newest = Math.max(...versions)
  return models.filter((model) => {
    const version = leadingVersion(model.id)
    return version === null || version >= newest - 1
  })
}

export function isRelevantDesignModel(
  provider: ProviderId,
  model: ModelInfo
): boolean {
  const id = model.id.trim()
  if (!id || model.provider !== provider || isRetired(model) || !isCurrent(model, provider)) {
    return false
  }
  if (DATED_SNAPSHOT.test(id) || ALIAS_SUFFIX.test(id)) return false
  switch (provider) {
    case 'openai':
      return OPENAI_TEXT_FAMILY.test(id) && !OPENAI_NON_CHAT.test(id)
    case 'anthropic':
      return ANTHROPIC_TEXT_FAMILY.test(id)
    case 'google':
      return GEMINI_TEXT_FAMILY.test(id) && !GEMINI_NON_CHAT.test(id)
    case 'deepseek':
      return DEEPSEEK_TEXT_FAMILY.test(id) && !DEEPSEEK_NON_CHAT.test(id)
    case 'codex':
    case 'opencode':
      return true
    default:
      return false
  }
}

export function filterModelCatalog(
  provider: ProviderId,
  models: ModelInfo[]
): ModelInfo[] {
  if (provider === 'codex' || provider === 'opencode') {
    const seen = new Set<string>()
    return models
      .filter(
        (model) =>
          model.provider === provider &&
          model.id.trim().length > 0 &&
          !isRetired(model)
      )
      .filter((model) => {
        if (seen.has(model.id)) return false
        seen.add(model.id)
        return true
      })
      .slice(0, MAX_MODELS[provider])
      .map((model) => ({
        ...model,
        provider
      }))
  }

  const seen = new Set<string>()
  const ids = new Set(models.map((model) => model.id))
  const relevant = models
    .filter((model) => isRelevantDesignModel(provider, model))
    .filter((model) => !hasStableCounterpart(model, ids))
    .filter((model) => {
      if (seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
  return keepCurrentGeneration(relevant)
    .sort((left, right) => compareModels(left, right))
    .slice(0, MAX_MODELS[provider])
    .map((model, index) => ({
      ...model,
      provider,
      latest: index === 0
    }))
}
