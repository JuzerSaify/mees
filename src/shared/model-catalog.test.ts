import { describe, expect, it } from 'vitest'
import type { ModelInfo } from './types'
import { filterModelCatalog } from './model-catalog'

function model(
  id: string,
  provider: ModelInfo['provider'],
  shutdownDate?: string
): ModelInfo {
  return { id, name: id, provider, shutdownDate }
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
      model('lyria-3.5', 'google')
    ])
    expect(models.map((entry) => entry.id)).toEqual(['gemini-3.8-flash'])
    expect(models[0]?.latest).toBe(true)
  })

  it('removes retired OpenAI models and non-chat API families', () => {
    const models = filterModelCatalog('openai', [
      model('gpt-5.5', 'openai'),
      model('gpt-image-2', 'openai'),
      model('text-embedding-3-large', 'openai'),
      model('gpt-4o-mini-realtime-preview', 'openai'),
      model('o3-deep-research', 'openai'),
      model('gpt-4.1', 'openai', '2020-01-01T00:00:00.000Z')
    ])
    expect(models.map((entry) => entry.id)).toEqual(['gpt-5.5'])
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
