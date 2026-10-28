import { describe, expect, it } from 'vitest'
import {
  geminiThinkingBudget,
  getEffortSupport,
  normalizeEffort
} from './effort'

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
})
