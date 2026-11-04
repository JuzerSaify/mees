import { describe, expect, it } from 'vitest'
import {
  parseAgyModelLines,
  parseOpenCodeModelLines,
  parseToolCallBlocks,
  visibleHarnessText
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

  it('adds OpenCode effort support from its model metadata cache', () => {
    const models = parseOpenCodeModelLines(
      'opencode/beam-free\nopencode/big-pickle',
      {
        opencode: {
          models: {
            'beam-free': {
              name: 'Beam Free',
              reasoning_options: [
                {
                  type: 'effort',
                  values: ['low', 'medium', 'high', 'xhigh', 'max']
                }
              ]
            },
            'big-pickle': {
              name: 'Big Pickle',
              reasoning_options: []
            }
          }
        }
      }
    )

    expect(models[0]).toMatchObject({
      id: 'opencode/beam-free',
      name: 'Beam Free',
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'medium'
    })
    expect(models[1]?.reasoningEfforts).toBeUndefined()
  })

  it('groups AGY effort variants into one clean model entry', () => {
    const models = parseAgyModelLines(`
      Fetching available models...
      gemini-3.8-flash-high	Gemini 3.8 Flash (High)
      gemini-3.8-flash-medium	Gemini 3.8 Flash (Medium)
      gemini-3.8-flash-low	Gemini 3.8 Flash (Low)
      claude-sonnet-4-6	Claude Sonnet 4.6 (Thinking)
      gpt-oss-120b-medium	GPT-OSS 120B (Medium)
    `)

    expect(models.map((model) => model.id)).toEqual([
      'gemini-3.8-flash',
      'claude-sonnet-4-6',
      'gpt-oss-120b'
    ])
    expect(models[0]).toMatchObject({
      name: 'Gemini 3.8 Flash',
      provider: 'agy',
      defaultEffort: 'medium'
    })
    expect(models[0]?.reasoningEfforts).toEqual([
      'low',
      'medium',
      'high'
    ])
    expect(models[2]).toMatchObject({
      id: 'gpt-oss-120b',
      reasoningEfforts: ['medium'],
      defaultEffort: 'medium'
    })
    expect(
      models.find((model) => model.id === 'claude-sonnet-4-6')
        ?.reasoningEfforts
    ).toBeUndefined()
  })
})

describe('local harness tool bridge', () => {
  it('streams prose and design text without exposing tool transport markup', () => {
    expect(visibleHarnessText('<mees_tool_c')).toBe('')
    expect(
      visibleHarnessText(
        'Collecting evidence.\n<mees_tool_call>{"name":"search_web"'
      )
    ).toBe('Collecting evidence.\n')
    expect(
      visibleHarnessText(
        'Building the page.\n<mees_tool_call>{"name":"search_web","arguments":{}}'
      )
    ).toBe('Building the page.\n')
    expect(
      visibleHarnessText(
        'Done.\n<mees_tool_call>{"name":"search_web","arguments":{}}</mees_tool_call>\n:::design\n<html></html>\n:::'
      )
    ).toBe('Done.\n\n:::design\n<html></html>\n:::')
  })

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
