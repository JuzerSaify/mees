import { describe, expect, it } from 'vitest'
import { compactAgentHistory } from './context'

describe('agent context compaction', () => {
  it('keeps the newest turns within the selected model context', () => {
    const history = Array.from({ length: 28 }, (_value, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `${index}:${'x'.repeat(12_000)}`
    }))
    const compacted = compactAgentHistory(history, {
      contextWindow: 32_000,
      currentDesignChars: 24_000
    })

    expect(compacted.history.length).toBeLessThan(history.length)
    expect(compacted.history.at(-1)?.content.startsWith('27:')).toBe(true)
    expect(compacted.omittedMessages).toBeGreaterThan(0)
    expect(compacted.estimatedChars).toBeLessThan(80_000)
  })

  it('preserves a short conversation unchanged', () => {
    const history = [
      { role: 'user' as const, content: 'Design a quiet hotel site.' },
      { role: 'assistant' as const, content: 'Which coast and audience?' }
    ]
    expect(
      compactAgentHistory(history, {
        contextWindow: 128_000,
        currentDesignChars: 0
      }).history
    ).toEqual(history)
  })

  it('keeps recent reference images with the user turn', () => {
    const referenceImages = Array.from({ length: 5 }, (_value, index) => ({
      id: `image-${index}`,
      name: `reference-${index}.png`,
      mimeType: 'image/png' as const,
      width: 1200,
      height: 800,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo='
    }))
    const compacted = compactAgentHistory(
      [
        {
          role: 'user',
          content: 'Use these references.',
          referenceImages
        }
      ],
      { contextWindow: 128_000 }
    )
    expect(compacted.history[0]?.referenceImages).toHaveLength(4)
    expect(compacted.history[0]?.referenceImages?.[0]?.name).toBe(
      'reference-0.png'
    )
  })
})
