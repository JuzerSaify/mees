import { describe, expect, it } from 'vitest'
import type { ModelInfo } from './types'
import { filterModelCatalog } from './model-catalog'

function model(
  id: string,
  provider: ModelInfo['provider'],
  shutdownDate?: string,
  releasedAt?: string
): ModelInfo {
  return { id, name: id, provider, shutdownDate, releasedAt }
}

describe('model catalog filtering', () => {
  it('keeps Gemini text models and removes generated-media and agent families', () => {
    const models = filterModelCatalog('google', [
      model('gemini-3.8-flash', 'google'),
      model('gemini-3.8-flash-tts', 'google'),
      model('gemini-3.8-live', 'google'),
      model('gemini-3.1-flash-image', 'google'),
      model('gemini-nano-banana-2.1', 'google'),
      model('gemini-3.5-transcribe', 'google'),
      model('gemini-embedding-001', 'google'),
      model('lyria-3.5', 'google'),
      model('gemma-4-31b-it', 'google')
    ])
    expect(models.map((entry) => entry.id)).toEqual(['gemini-3.8-flash'])
    expect(models[0]?.latest).toBe(true)
  })

  it('removes retired OpenAI models and non-chat API families', () => {
    const models = filterModelCatalog('openai', [
      model('gpt-5.5', 'openai'),
      model('gpt-5.5-2026-04-23', 'openai'),
      model('gpt-image-2', 'openai'),
      model('text-embedding-3-large', 'openai'),
      model('gpt-4o-mini-realtime-preview', 'openai'),
      model('o3-deep-research', 'openai'),
      model('gpt-5-search-api', 'openai'),
      model('gpt-5.3-codex', 'openai'),
      model('gpt-live-1', 'openai'),
      model('gpt-4.1', 'openai', '2020-01-01T00:00:00.000Z')
    ])
    expect(models.map((entry) => entry.id)).toEqual(['gpt-5.5'])
  })

  it('never mixes another provider into a provider group', () => {
    const models = filterModelCatalog('anthropic', [
      model('claude-opus-5-5', 'anthropic'),
      model('gpt-6.1-sol', 'openai'),
      model('claude-sonnet-5-5', 'openai')
    ])

    expect(models.map((entry) => entry.id)).toEqual(['claude-opus-5-5'])
  })

  it('removes duplicate previews and latest aliases when stable names exist', () => {
    const models = filterModelCatalog('google', [
      model('gemini-3.1-flash-lite-preview', 'google'),
      model('gemini-3.1-flash-lite', 'google'),
      model('gemini-flash-latest', 'google'),
      model('gemini-3.1-pro-preview-customtools', 'google')
    ])

    expect(models.map((entry) => entry.id)).toEqual(['gemini-3.1-flash-lite'])
  })

  it('keeps only the current generation window for a provider', () => {
    const models = filterModelCatalog('google', [
      model('gemini-2.5-pro', 'google'),
      model('gemini-3.8-flash', 'google'),
      model('gemini-4-argon', 'google')
    ])

    expect(models.map((entry) => entry.id)).toEqual([
      'gemini-4-argon',
      'gemini-3.8-flash'
    ])
  })

  it('drops stale dated generations and sorts current models first', () => {
    const current = new Date().toISOString()
    const models = filterModelCatalog('openai', [
      model('gpt-5.1', 'openai', undefined, current),
      model('gpt-6.1-sol', 'openai', undefined, current),
      model('gpt-4o-2024-11-20', 'openai', undefined, '2024-11-20T00:00:00.000Z')
    ])

    expect(models.map((entry) => entry.id)).toEqual([
      'gpt-6.1-sol',
      'gpt-5.1'
    ])
    expect(models[0]?.latest).toBe(true)
  })

  it('deduplicates repeated model ids', () => {
    const models = filterModelCatalog('deepseek', [
      model('deepseek-chat', 'deepseek'),
      model('deepseek-chat', 'deepseek'),
      model('deepseek-embedding', 'deepseek')
    ])
    expect(models).toHaveLength(1)
  })
})
