import { describe, expect, it } from 'vitest'
import {
  parseOpenCodeModelLines,
  parseToolCallBlocks
} from './local-harness'

describe('local harness discovery', () => {
  it('normalizes the model catalog printed by OpenCode', () => {
    const models = parseOpenCodeModelLines(`
      \u001b[36mopencode/beam-free\u001b[0m
      anthropic/claude-sonnet-5.5
      anthropic/claude-sonnet-5.5
      openai/gpt-6.1-sol#priority
      progress: connecting
    `)

    expect(models.map((model) => model.id)).toEqual([
      'opencode/beam-free',
      'anthropic/claude-sonnet-5.5',
      'openai/gpt-6.1-sol#priority'
    ])
    expect(models.every((model) => model.provider === 'opencode')).toBe(true)
  })
})

describe('local harness tool bridge', () => {
  it('accepts multiple known tool calls and removes their transport markup', () => {
    const parsed = parseToolCallBlocks(
      [
        'I will collect the needed evidence.',
        '<mees_tool_call>{"name":"search_web","arguments":{"queries":["current product release"]}}</mees_tool_call>',
        '<mees_tool_call>{"name":"fetch_visual_assets","arguments":{"subject":"product photo"}}</mees_tool_call>'
      ].join('\n'),
      ['search_web', 'fetch_visual_assets']
    )

    expect(parsed.text).toBe('I will collect the needed evidence.')
    expect(parsed.toolCalls).toHaveLength(2)
    expect(parsed.toolCalls.map((call) => call.name)).toEqual([
      'search_web',
      'fetch_visual_assets'
    ])
    expect(parsed.toolCalls[0]?.arguments).toEqual({
      queries: ['current product release']
    })
  })

  it('never forwards unknown or malformed harness tool calls', () => {
    const parsed = parseToolCallBlocks(
      [
        '<mees_tool_call>{"name":"shell","arguments":{"command":"rm -rf ."}}</mees_tool_call>',
        '<mees_tool_call>not json</mees_tool_call>',
        'Final answer'
      ].join('\n'),
      ['search_web']
    )

    expect(parsed.toolCalls).toEqual([])
    expect(parsed.text).toBe('Final answer')
  })

  it('recovers tool calls when a harness omits closing transport tags', () => {
    const parsed = parseToolCallBlocks(
      [
        '<mees_tool_call>{"name":"read_urls","arguments":{"urls":["https://openai.com/"]}}',
        '<mees_tool_call>{"name":"resolve_site_icon","arguments":{"site":"openai.com"}}',
        'Continue with the evidence.'
      ].join(''),
      ['read_urls', 'resolve_site_icon']
    )

    expect(parsed.text).toBe('Continue with the evidence.')
    expect(parsed.toolCalls.map((call) => call.name)).toEqual([
      'read_urls',
      'resolve_site_icon'
    ])
  })

  it('strips extra wrapper tags emitted by a harness', () => {
    const parsed = parseToolCallBlocks(
      '<mees_tool_call>{"name":"search_web","arguments":{"queries":["news"]}}</mees_tool_call></arg_value></tool_call>Final',
      ['search_web']
    )

    expect(parsed.text).toBe('Final')
    expect(parsed.toolCalls).toHaveLength(1)
  })
})
