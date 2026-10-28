import type { AgentHistoryMessage } from '../shared/types'

const DEFAULT_CONTEXT_WINDOW = 128_000
const APPROX_CHARS_PER_TOKEN = 3.2
const MAX_CONTEXT_CHARS = 480_000
const MIN_CONTEXT_CHARS = 28_000
const PER_MESSAGE_LIMIT = 18_000
const RESERVED_PROMPT_CHARS = 18_000

export interface CompactedAgentHistory {
  history: AgentHistoryMessage[]
  omittedMessages: number
  estimatedChars: number
}

export function compactAgentHistory(
  history: AgentHistoryMessage[],
  options: {
    contextWindow?: number
    currentDesignChars?: number
  } = {}
): CompactedAgentHistory {
  const contextChars = Math.max(
    MIN_CONTEXT_CHARS,
    Math.min(
      MAX_CONTEXT_CHARS,
      Math.floor(
        (options.contextWindow ?? DEFAULT_CONTEXT_WINDOW) *
          APPROX_CHARS_PER_TOKEN
      )
    )
  )
  const designChars = Math.min(
    120_000,
    Math.max(0, options.currentDesignChars ?? 0)
  )
  const historyBudget = Math.max(
    14_000,
    contextChars - designChars - RESERVED_PROMPT_CHARS
  )
  const candidates = history.slice(-24)
  const selected: AgentHistoryMessage[] = []
  let used = 0
  let remainingImageSlots = 4

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index]
    if (!message || !message.content.trim()) continue
    const remaining = historyBudget - used
    if (selected.length >= 6 && remaining < 1_200) break
    const allowed = Math.max(0, Math.min(PER_MESSAGE_LIMIT, remaining))
    if (allowed < 240 && selected.length > 0) break
    const content =
      message.content.length > allowed
        ? message.role === 'user'
          ? message.content.slice(0, allowed)
          : message.content.slice(-allowed)
        : message.content
    const referenceImages =
      message.role === 'user' && message.referenceImages?.length
        ? message.referenceImages.slice(0, remainingImageSlots)
        : []
    remainingImageSlots -= referenceImages.length
    selected.unshift({
      role: message.role,
      content,
      ...(referenceImages.length ? { referenceImages } : {})
    })
    used += content.length
  }

  const firstUser = history.find((message) => message.role === 'user')
  if (
    firstUser &&
    firstUser.content.trim() &&
    !selected.some(
      (message) =>
        message.role === 'user' && message.content === firstUser.content
    )
  ) {
    const remaining = historyBudget - used
    if (remaining >= 600) {
      const content = firstUser.content.slice(0, Math.min(2_400, remaining))
      const referenceImages = firstUser.referenceImages?.slice(
        0,
        Math.max(0, remainingImageSlots)
      )
      selected.unshift({
        role: 'user',
        content,
        ...(referenceImages?.length ? { referenceImages } : {})
      })
      used += content.length
    }
  }

  return {
    history: selected,
    omittedMessages: Math.max(0, history.length - selected.length),
    estimatedChars: used
  }
}
