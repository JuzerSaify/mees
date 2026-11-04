import { describe, expect, it } from 'vitest'
import { compactModelName } from './format'

describe('compact model labels', () => {
  it('removes provider prefixes while preserving model identity', () => {
    expect(compactModelName('anthropic', 'Claude Sonnet 5.5')).toBe(
      'Sonnet 5.5'
    )
    expect(compactModelName('google', 'Gemini 3.8 Flash')).toBe('3.8 Flash')
    expect(compactModelName('deepseek', 'DeepSeek-V4.1-Flash')).toBe(
      'V4.1 Flash'
    )
  })

  it('formats namespaced harness model ids for display', () => {
    expect(
      compactModelName('opencode', 'opencode/glm-5.3-flash-free')
    ).toBe('GLM 5.3 Flash Free')
    expect(
      compactModelName('opencode', 'anthropic/claude-sonnet-5.5')
    ).toBe('Claude Sonnet 5.5')
    expect(compactModelName('agy', 'Gemini 3.8 Flash')).toBe('3.8 Flash')
  })
})
