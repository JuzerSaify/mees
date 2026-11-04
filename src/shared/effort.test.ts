import { describe, expect, it } from 'vitest'
import {
  geminiThinkingBudget,
  getEffortSupport,
  normalizeEffort
} from './effort'
import type { ModelInfo } from './types'

describe('model effort support', () => {
  it('exposes native OpenAI effort ceilings', () => {
    expect(getEffortSupport('openai', 'gpt-6-astra')).toMatchObject({
      transport: 'openai',
      defaultEffort: 'high',
      options: [
        { value: 'low' },
        { value: 'medium' },
        { value: 'high' },
        { value: 'xhigh' },
        { value: 'max' }
      ]
    })
    expect(
      getEffortSupport('openai', 'gpt-6.1-terra').options.map(
        (option) => option.value
      )
    ).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(
      getEffortSupport('openai', 'gpt-5.5').options.map(
        (option) => option.value
      )
    ).toEqual(['none', 'low', 'medium', 'high', 'xhigh'])
    expect(getEffortSupport('openai', 'gpt-5.4').defaultEffort).toBe('none')
    expect(getEffortSupport('openai', 'gpt-4.1').options).toEqual([])
  })

  it('gates Claude max and xhigh by model family', () => {
    expect(
      getEffortSupport('anthropic', 'claude-opus-4-5').options.map(
        (option) => option.value
      )
    ).toEqual(['low', 'medium', 'high'])
    expect(
      getEffortSupport('anthropic', 'claude-opus-4-6').options.map(
        (option) => option.value
      )
    ).toEqual(['low', 'medium', 'high', 'max'])
    expect(getEffortSupport('anthropic', 'claude-opus-5-5')).toMatchObject({
      transport: 'anthropic',
      defaultEffort: 'medium'
    })
    expect(
      getEffortSupport('anthropic', 'claude-opus-5-5').options.map(
        (option) => option.value
      )
    ).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(getEffortSupport('anthropic', 'claude-opus-5-1')).toMatchObject({
      transport: 'anthropic',
      defaultEffort: 'medium'
    })
    expect(
      getEffortSupport('anthropic', 'claude-opus-5-1').options.map(
        (option) => option.value
      )
    ).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('uses Gemini thinking levels and the 2.5 token-budget path', () => {
    expect(getEffortSupport('google', 'gemini-4-argon')).toMatchObject({
      transport: 'gemini-level',
      defaultEffort: 'medium',
      options: [
        { value: 'low' },
        { value: 'medium' },
        { value: 'high' }
      ]
    })
    expect(
      getEffortSupport('google', 'gemini-3.6-flash').options.map(
        (option) => option.value
      )
    ).toEqual(['minimal', 'low', 'medium', 'high'])
    expect(getEffortSupport('google', 'gemini-2.5-flash')).toMatchObject({
      transport: 'gemini-budget',
      defaultEffort: 'medium'
    })
    expect(geminiThinkingBudget('gemini-2.5-pro', 'high')).toBe(32_768)
    expect(geminiThinkingBudget('gemini-2.5-flash', 'high')).toBe(24_576)
  })

  it('uses DeepSeek native low, high and max levels', () => {
    expect(getEffortSupport('deepseek', 'deepseek-flash')).toMatchObject({
      transport: 'deepseek',
      defaultEffort: 'high'
    })
    expect(
      getEffortSupport('deepseek', 'deepseek-flash').options.map(
        (option) => option.value
      )
    ).toEqual(['low', 'high', 'max'])
  })

  it('normalizes stale or unsupported effort without sending it', () => {
    expect(normalizeEffort('openai', 'gpt-6.1-sol', 'max')).toBe('max')
    expect(normalizeEffort('openai', 'gpt-6.1-sol', 'none')).toBe('medium')
    expect(normalizeEffort('openai', 'gpt-4.1', 'high')).toBeNull()
  })

  it('uses the reasoning levels advertised by an installed harness', () => {
    const model: ModelInfo = {
      id: 'gpt-6.1-sol',
      name: 'GPT-6.1-Sol',
      provider: 'codex',
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
      defaultEffort: 'medium'
    }
    expect(getEffortSupport('codex', model.id, model)).toMatchObject({
      transport: 'harness',
      defaultEffort: 'medium'
    })
    expect(
      getEffortSupport('codex', model.id, model).options.map(
        (option) => option.value
      )
    ).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
    expect(normalizeEffort('codex', model.id, 'ultra', model)).toBe('ultra')
    expect(normalizeEffort('codex', model.id, 'none', model)).toBe('medium')
  })

  it('normalizes AGY and OpenCode variants from their reported capabilities', () => {
    const agy: ModelInfo = {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      provider: 'agy',
      reasoningEfforts: ['low', 'medium', 'high'],
      defaultEffort: 'high'
    }
    expect(normalizeEffort('agy', agy.id, 'max', agy)).toBe('high')
    expect(normalizeEffort('agy', agy.id, 'low', agy)).toBe('low')

    const openCode: ModelInfo = {
      id: 'opencode/beam-free',
      name: 'Beam Free',
      provider: 'opencode',
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'medium'
    }
    expect(normalizeEffort('opencode', openCode.id, 'max', openCode)).toBe('max')
    expect(getEffortSupport('opencode', openCode.id, openCode).options).toHaveLength(5)
  })
})
