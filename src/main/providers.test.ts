import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listModels,
  runAgentTurn,
  streamAgent,
  type AgentToolDefinition
} from './providers'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`))
      }
      controller.close()
    }
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('provider model discovery', () => {
  it('discovers and sorts OpenAI text models', async () => {
    const now = Math.floor(Date.now() / 1_000)
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'gpt-5.4', created: now - 200 },
          { id: 'text-embedding-3-large', created: now - 100 },
          { id: 'gpt-5.5', created: now }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const models = await listModels('openai', 'sk-test')
    expect(models.map((model) => model.id)).toEqual(['gpt-5.5', 'gpt-5.4'])
    expect(models[0]?.latest).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' })
      })
    )
  })

  it('discovers Gemini generation models and strips the model prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          models: [
            {
              name: 'models/gemini-4-argon',
              displayName: 'Gemini 4 Argon',
              supportedGenerationMethods: ['generateContent'],
              inputTokenLimit: 1000000,
              outputTokenLimit: 65536
            },
            {
              name: 'models/text-embedding-004',
              supportedGenerationMethods: ['embedContent']
            }
          ]
        })
      )
    )

    const models = await listModels('google', 'gemini-test')
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      id: 'gemini-4-argon',
      name: 'Gemini 4 Argon',
      supportsImages: true
    })
  })

  it('reads image capability from DeepSeek model metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              id: 'deepseek-flash',
              name: 'DeepSeek V4.1 Flash',
              input_modalities: ['text', 'image'],
              context_window: 1048576,
              max_output_tokens: 393216
            },
            {
              id: 'deepseek-v4-pro',
              name: 'DeepSeek V4 Pro',
              input_modalities: ['text'],
              context_window: 1048576,
              max_output_tokens: 393216
            }
          ]
        })
      )
    )
    const models = await listModels('deepseek', 'deepseek-test')
    expect(
      models.find((model) => model.id === 'deepseek-flash')?.supportsImages
    ).toBe(true)
    expect(
      models.find((model) => model.id === 'deepseek-v4-pro')?.supportsImages
    ).toBe(false)
  })
})

describe('stream adapters', () => {
  function requestBody(
    fetchMock: ReturnType<typeof vi.fn>
  ): Record<string, unknown> {
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    return JSON.parse(String(call[1].body)) as Record<string, unknown>
  }

  it('reads OpenAI Responses text deltas and usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          JSON.stringify({ type: 'response.output_text.delta', delta: 'Hello ' }),
          JSON.stringify({ type: 'response.output_text.delta', delta: 'world' }),
          JSON.stringify({
            type: 'response.completed',
            response: { usage: { input_tokens: 4, output_tokens: 7 } }
          })
        ])
      )
    )

    let text = ''
    const usage = await streamAgent({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: (delta) => {
        text += delta
      }
    })

    expect(text).toBe('Hello world')
    expect(usage).toEqual({ inputTokens: 4, outputTokens: 7 })
  })

  it('reads Anthropic text deltas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 9 } } }),
          JSON.stringify({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Quiet composition.' }
          }),
          JSON.stringify({ type: 'message_delta', usage: { output_tokens: 12 } })
        ])
      )
    )

    let text = ''
    const usage = await streamAgent({
      provider: 'anthropic',
      model: 'claude-test',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: (delta) => {
        text += delta
      }
    })

    expect(text).toBe('Quiet composition.')
    expect(usage).toEqual({ inputTokens: 9, outputTokens: 12 })
  })

  it('reads Gemini text parts and ignores thought parts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: 'Hidden', thought: true }] } }
            ]
          }),
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Visible design' }] } }],
            usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 }
          })
        ])
      )
    )

    let text = ''
    const usage = await streamAgent({
      provider: 'google',
      model: 'gemini-test',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: (delta) => {
        text += delta
      }
    })

    expect(text).toBe('Visible design')
    expect(usage).toEqual({ inputTokens: 3, outputTokens: 4 })
  })

  it('reads DeepSeek chat deltas and ignores reasoning content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          JSON.stringify({
            choices: [{ delta: { reasoning_content: 'Private reasoning' } }]
          }),
          JSON.stringify({
            choices: [{ delta: { content: 'Public design source' } }],
            usage: { prompt_tokens: 5, completion_tokens: 8 }
          }),
          '[DONE]'
        ])
      )
    )

    let text = ''
    const usage = await streamAgent({
      provider: 'deepseek',
      model: 'deepseek-test',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: (delta) => {
        text += delta
      }
    })

    expect(text).toBe('Public design source')
    expect(usage).toEqual({ inputTokens: 5, outputTokens: 8 })
  })

  it('surfaces provider errors without reading the stream as a success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { message: 'Invalid API key.' } }, 401)
      )
    )

    await expect(
      streamAgent({
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'bad-key',
        history: [{ role: 'user', content: 'Design a page' }],
        currentDesign: '',
        signal: new AbortController().signal,
        onDelta: () => undefined
      })
    ).rejects.toThrow('Invalid API key')
  })

  it("sends each provider's native effort parameter", async () => {
    const openAiFetch = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          type: 'response.completed',
          response: { usage: {} }
        })
      ])
    )
    vi.stubGlobal('fetch', openAiFetch)
    await streamAgent({
      provider: 'openai',
      model: 'gpt-6-astra',
      effort: 'max',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(requestBody(openAiFetch)).toMatchObject({
      reasoning: { effort: 'max' }
    })

    const anthropicFetch = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ type: 'message_delta', usage: { output_tokens: 1 } })
      ])
    )
    vi.stubGlobal('fetch', anthropicFetch)
    await streamAgent({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      effort: 'max',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(requestBody(anthropicFetch)).toMatchObject({
      output_config: { effort: 'max' }
    })

    const geminiFetch = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Design' }] } }]
        })
      ])
    )
    vi.stubGlobal('fetch', geminiFetch)
    await streamAgent({
      provider: 'google',
      model: 'gemini-4-argon',
      effort: 'high',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(requestBody(geminiFetch)).toMatchObject({
      generationConfig: {
        thinkingConfig: { thinkingLevel: 'high' }
      }
    })

    const geminiBudgetFetch = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Design' }] } }]
        })
      ])
    )
    vi.stubGlobal('fetch', geminiBudgetFetch)
    await streamAgent({
      provider: 'google',
      model: 'gemini-2.5-flash',
      effort: 'high',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(requestBody(geminiBudgetFetch)).toMatchObject({
      generationConfig: {
        thinkingConfig: { thinkingBudget: 24_576 }
      }
    })

    const deepSeekFetch = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          choices: [{ delta: { content: 'Design' } }]
        }),
        '[DONE]'
      ])
    )
    vi.stubGlobal('fetch', deepSeekFetch)
    await streamAgent({
      provider: 'deepseek',
      model: 'deepseek-flash',
      effort: 'max',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(requestBody(deepSeekFetch)).toMatchObject({
      reasoning_effort: 'max',
      thinking: { type: 'enabled' }
    })
  })

  it('retries a transient provider failure before streaming', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Temporary outage' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'retry-after': '0' }
        })
      )
      .mockResolvedValueOnce(
        sseResponse([
          JSON.stringify({
            type: 'response.output_text.delta',
            delta: 'Recovered'
          }),
          JSON.stringify({ type: 'response.completed', response: {} })
        ])
      )
    vi.stubGlobal('fetch', fetchMock)

    let text = ''
    await streamAgent({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'key',
      history: [{ role: 'user', content: 'Design a page' }],
      currentDesign: '',
      signal: new AbortController().signal,
      onDelta: (delta) => {
        text += delta
      }
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text).toBe('Recovered')
  })
})

describe('agent tool turns', () => {
  function turnBody(
    fetchMock: ReturnType<typeof vi.fn>
  ): Record<string, unknown> {
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    return JSON.parse(String(call[1].body)) as Record<string, unknown>
  }

  const referenceImage = {
    id: 'reference-1',
    name: 'layout.png',
    mimeType: 'image/png' as const,
    width: 1200,
    height: 800,
    dataUrl: 'data:image/png;base64,iVBORw0KGgo='
  }
  const tools: AgentToolDefinition[] = [
    {
      name: 'search_web',
      description: 'Search the live web.',
      inputSchema: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['queries']
      }
    }
  ]

  it('parses OpenAI function calls and sends optional tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          type: 'response.output_item.added',
          item: {
            id: 'fc_1',
            call_id: 'call_1',
            type: 'function_call',
            name: 'search_web',
            arguments: ''
          }
        }),
        JSON.stringify({
          type: 'response.function_call_arguments.delta',
          item_id: 'fc_1',
          delta: '{"queries":["verified release notes"]}'
        }),
        JSON.stringify({
          type: 'response.completed',
          response: { usage: { input_tokens: 8, output_tokens: 3 } }
        })
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await runAgentTurn({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'key',
      currentDesign: '',
      messages: [{ role: 'user', content: 'Research this release.' }],
      tools,
      signal: new AbortController().signal,
      onDelta: () => undefined
    })

    expect(result.toolCalls).toEqual([
      {
        id: 'call_1',
        providerItemId: 'fc_1',
        name: 'search_web',
        arguments: { queries: ['verified release notes'] }
      }
    ])
    expect(turnBody(fetchMock)).toMatchObject({
      tools: [
        {
          type: 'function',
          name: 'search_web'
        }
      ]
    })
  })

  it('keeps the optional native tool contract present in every design mode', async () => {
    for (const designMode of [
      'website',
      'logo',
      'vector',
      'motion'
    ] as const) {
      const fetchMock = vi.fn().mockResolvedValue(
        sseResponse([
          JSON.stringify({
            type: 'response.output_text.delta',
            delta: 'Working'
          }),
          JSON.stringify({
            type: 'response.completed',
            response: { usage: {} }
          })
        ])
      )
      vi.stubGlobal('fetch', fetchMock)
      await runAgentTurn({
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'key',
        currentDesign: '',
        designMode,
        messages: [{ role: 'user', content: `Review ${designMode}` }],
        tools,
        signal: new AbortController().signal,
        onDelta: () => undefined
      })
      expect(turnBody(fetchMock)).toMatchObject({
        tools: [
          {
            type: 'function',
            name: 'search_web'
          }
        ]
      })
    }
  })

  it('sends reference images without forcing tool use in OpenAI', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          type: 'response.output_text.delta',
          delta: 'Direct answer'
        }),
        JSON.stringify({
          type: 'response.completed',
          response: { usage: {} }
        })
      ])
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await runAgentTurn({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'key',
      currentDesign: '',
      messages: [
        {
          role: 'user',
          content: 'Match this layout.',
          referenceImages: [referenceImage]
        }
      ],
      tools: [],
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    const body = turnBody(fetchMock)
    expect(result.text).toBe('Direct answer')
    expect(body.tools).toBeUndefined()
    expect(JSON.stringify(body.input)).toContain('input_image')
    expect(JSON.stringify(body.input)).toContain('layout.png')
  })

  it('parses Claude tool-use blocks and preserves image inputs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          type: 'message_start',
          message: { usage: { input_tokens: 12 } }
        }),
        JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'search_web',
            input: {}
          }
        }),
        JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"queries":["official current docs"]}'
          }
        }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({
          type: 'message_delta',
          usage: { output_tokens: 7 }
        })
      ])
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await runAgentTurn({
      provider: 'anthropic',
      model: 'claude-test',
      apiKey: 'key',
      currentDesign: '',
      messages: [
        {
          role: 'user',
          content: 'Use this reference.',
          referenceImages: [referenceImage]
        }
      ],
      tools,
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(result.toolCalls[0]).toMatchObject({
      id: 'toolu_1',
      name: 'search_web',
      arguments: { queries: ['official current docs'] }
    })
    const body = turnBody(fetchMock)
    expect(JSON.stringify(body.messages)).toContain('"type":"image"')
    expect(JSON.stringify(body.messages)).toContain('iVBORw0KGgo=')
  })

  it('parses Gemini function calls and inline image parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      id: 'gemini-call-1',
                      name: 'search_web',
                      args: { queries: ['current official source'] }
                    }
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 9,
            candidatesTokenCount: 2
          }
        })
      ])
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await runAgentTurn({
      provider: 'google',
      model: 'gemini-test',
      apiKey: 'key',
      currentDesign: '',
      messages: [
        {
          role: 'user',
          content: 'Use this reference.',
          referenceImages: [referenceImage]
        }
      ],
      tools,
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(result.toolCalls[0]).toMatchObject({
      id: 'gemini-call-1',
      name: 'search_web',
      arguments: { queries: ['current official source'] }
    })
    const body = turnBody(fetchMock)
    expect(JSON.stringify(body.contents)).toContain('inlineData')
    expect(JSON.stringify(body.tools)).toContain('functionDeclarations')
  })

  it('parses DeepSeek tool-call deltas and multimodal message content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: {
                      name: 'search_web',
                      arguments: '{"queries":["fresh source"]}'
                    }
                  }
                ]
              }
            }
          ]
        }),
        '[DONE]'
      ])
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await runAgentTurn({
      provider: 'deepseek',
      model: 'deepseek-flash',
      apiKey: 'key',
      currentDesign: '',
      messages: [
        {
          role: 'user',
          content: 'Use this reference.',
          referenceImages: [referenceImage]
        }
      ],
      tools,
      signal: new AbortController().signal,
      onDelta: () => undefined
    })
    expect(result.toolCalls[0]).toMatchObject({
      id: 'call_1',
      name: 'search_web',
      arguments: { queries: ['fresh source'] }
    })
    const body = turnBody(fetchMock)
    expect(JSON.stringify(body.messages)).toContain('image_url')
    expect(JSON.stringify(body.messages)).toContain('layout.png')
  })
})
