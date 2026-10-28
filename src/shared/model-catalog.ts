import type { ModelInfo, ProviderId } from './types'

const OPENAI_TEXT_FAMILY = /^(?:gpt-|chatgpt-|o\d)/i
const OPENAI_NON_CHAT =
  /(?:embedding|moderation|whisper|transcri|tts|audio|image|dall-e|sora|realtime|computer-use|deep-research)/i

const GEMINI_TEXT_FAMILY = /^(?:gemini|gemma)-/i
const GEMINI_NON_CHAT =
  /(?:^|-)(?:image|tts|live|native-audio|transcri(?:be|pt)?|omni|embedding|robotics|computer-use|deep-research|antigravity|lyria|imagen|nano-banana)(?:-|$)/i

const ANTHROPIC_TEXT_FAMILY = /^claude-/i
const DEEPSEEK_TEXT_FAMILY = /^deepseek-/i
const DEEPSEEK_NON_CHAT = /(?:embedding|audio|transcri|image)/i

function isRetired(model: ModelInfo): boolean {
  if (!model.shutdownDate) return false
  const timestamp = Date.parse(model.shutdownDate)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

export function isRelevantDesignModel(
  provider: ProviderId,
  model: ModelInfo
): boolean {
  if (!model.id.trim() || isRetired(model)) return false
  switch (provider) {
    case 'openai':
      return OPENAI_TEXT_FAMILY.test(model.id) && !OPENAI_NON_CHAT.test(model.id)
    case 'anthropic':
      return ANTHROPIC_TEXT_FAMILY.test(model.id)
    case 'google':
      return GEMINI_TEXT_FAMILY.test(model.id) && !GEMINI_NON_CHAT.test(model.id)
    case 'deepseek':
      return DEEPSEEK_TEXT_FAMILY.test(model.id) && !DEEPSEEK_NON_CHAT.test(model.id)
    default:
      return false
  }
}

export function filterModelCatalog(
  provider: ProviderId,
  models: ModelInfo[]
): ModelInfo[] {
  const seen = new Set<string>()
  return models
    .filter((model) => isRelevantDesignModel(provider, model))
    .filter((model) => {
      if (seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
    .map((model, index) => ({
      ...model,
      provider,
      latest: index === 0
    }))
}
