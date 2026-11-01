import type { ProviderId } from '../../../shared/types'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} chars`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function compactModelName(
  provider: ProviderId | undefined,
  name: string
): string {
  let value = name.trim()
  if (provider === 'anthropic') value = value.replace(/^Claude\s+/i, '')
  if (provider === 'google') value = value.replace(/^Gemini\s+/i, '')
  if (provider === 'deepseek') {
    value = value.replace(/^DeepSeek[-\s]*/i, '').replace(/[-_]+/g, ' ')
  }
  if (provider === 'codex') value = value.replace(/^GPT[-\s]*/i, '')
  if (provider === 'opencode') {
    value = value.split('/').pop() ?? value
    value = value
      .replace(/#.*$/, '')
      .replace(/[-_]+/g, ' ')
  }

  const labels: Record<string, string> = {
    ai: 'AI',
    api: 'API',
    claude: 'Claude',
    deepseek: 'DeepSeek',
    flash: 'Flash',
    free: 'Free',
    gemini: 'Gemini',
    glm: 'GLM',
    gpt: 'GPT',
    luna: 'Luna',
    opus: 'Opus',
    sol: 'Sol',
    sonnet: 'Sonnet',
    terra: 'Terra',
    vl: 'VL'
  }
  return value
    .split(/\s+/)
    .map((word) => {
      const normalized = word.toLowerCase()
      return labels[normalized] ?? word
    })
    .join(' ')
    .trim()
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds / 1000)
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Saved locally'
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return `Today, ${new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    }).format(date)}`
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}
