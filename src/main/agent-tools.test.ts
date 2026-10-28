import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_TOOLS,
  describeAgentTool,
  executeAgentTool
} from './agent-tools'

afterEach(() => {
  vi.unstubAllGlobals()
})

function htmlResponse(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}

describe('agent tools', () => {
  it('exposes optional tools with explicit input schemas', () => {
    expect(AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      'search_web',
      'read_web_pages',
      'read_urls',
      'fetch_visual_assets',
      'resolve_site_icon',
      'inspect_artifact',
      'evaluate_evidence',
      'ask_user',
      'crop_asset',
      'optimize_asset',
      'extract_palette',
      'vectorize_asset'
    ])
    expect(AGENT_TOOLS.every((tool) => tool.inputSchema.type === 'object')).toBe(
      true
    )
  })

  it('turns a model search request into real sources', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(`
          <a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnotes">Primary notes</a>
          <td class="result-snippet">Current evidence with a verifiable date.</td>
        `)
      )
    )
    const result = await executeAgentTool(
      {
        id: 'call-1',
        name: 'search_web',
        arguments: { queries: ['current official release notes'] }
      },
      { sources: [], assets: [] },
      new AbortController().signal
    )
    expect(result.sources).toHaveLength(1)
    expect(result.sources?.[0]?.url).toBe('https://example.com/notes')
    expect(result.content).toContain('Current evidence')
  })

  it('reads a source selected by the model', async () => {
    const source = {
      id: 'web-example',
      title: 'Example source',
      url: 'https://93.184.215.14/report',
      publisher: 'example.com',
      snippet: 'Short excerpt.'
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(`
          <article>
            <h2>Verified report</h2>
            <p>The full page contains the detailed evidence needed for this decision.</p>
            <p>A second paragraph independently supports the same conclusion.</p>
          </article>
        `)
      )
    )
    const result = await executeAgentTool(
      {
        id: 'call-2',
        name: 'read_web_pages',
        arguments: { source_ids: [source.id] }
      },
      { sources: [source], assets: [] },
      new AbortController().signal
    )
    expect(result.sources?.[0]?.pageContent).toContain('detailed evidence')
    expect(result.content).toContain('full_text')
  })

  it('describes parallel research calls without hiding their intent', () => {
    expect(
      describeAgentTool({
        id: 'call-3',
        name: 'search_web',
        arguments: {
          queries: ['current release date', 'official product documentation']
        }
      })
    ).toMatchObject({
      kind: 'research',
      label: 'Searching several angles'
    })
  })

  it('scores a claim against the returned source ledger', async () => {
    const source = {
      id: 'web-release',
      title: 'Official release notes',
      url: 'https://example.com/releases',
      publisher: 'example.com',
      snippet:
        'The official release date is 28 October 2026 after validation.',
      pageContent:
        'The official release date is 28 October 2026. Validation completed before publication.',
      retrievedAt: '2026-10-28T10:00:00.000Z'
    }
    const result = await executeAgentTool(
      {
        id: 'call-4',
        name: 'evaluate_evidence',
        arguments: {
          claims: [
            {
              claim: 'The official release date is 28 October 2026.',
              source_ids: [source.id]
            }
          ]
        }
      },
      { sources: [source], assets: [] },
      new AbortController().signal
    )
    expect(result.evidence?.[0]).toMatchObject({
      verdict: 'supported',
      sourceIds: [source.id]
    })
    expect(result.content).toContain('quality_score')
  })

  it('measures a real stored image through the optional media tools', async () => {
    const token = `kern-asset://asset/${'a'.repeat(64)}.png`
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
    const result = await executeAgentTool(
      {
        id: 'call-5',
        name: 'extract_palette',
        arguments: { source: token, colors: 4 }
      },
      {
        sources: [],
        assets: [
          {
            id: 'image',
            token,
            kind: 'image',
            title: 'Stored image',
            pageUrl: 'https://example.com/image',
            sourceUrl: 'https://example.com/image.png',
            contentType: 'image/png',
            byteLength: bytes.byteLength,
            dataUrl: token
          }
        ],
        readAsset: async () => ({ bytes, contentType: 'image/png' })
      },
      new AbortController().signal
    )
    expect(result.content).toContain('averageLuminance')
    expect(result.content).toContain('colors')
  })

  it('surfaces conflicting figures instead of flattening them into one claim', async () => {
    const result = await executeAgentTool(
      {
        id: 'call-6',
        name: 'evaluate_evidence',
        arguments: {
          claims: [
            {
              claim: 'The archive contains 12 maps.',
              source_ids: ['web-maps']
            },
            {
              claim: 'The archive contains 18 maps.',
              source_ids: ['web-maps']
            }
          ]
        }
      },
      {
        sources: [
          {
            id: 'web-maps',
            title: 'Archive catalogue',
            url: 'https://example.com/archive',
            publisher: 'example.com',
            snippet: 'The archive catalogue lists maps and field records.',
            retrievedAt: '2026-10-28T10:00:00.000Z'
          }
        ],
        assets: []
      },
      new AbortController().signal
    )
    expect(result.evidence?.every((item) => item.verdict === 'conflicting')).toBe(
      true
    )
  })

  it('can ask one structured question when the agent is genuinely blocked', async () => {
    const result = await executeAgentTool(
      {
        id: 'call-7',
        name: 'ask_user',
        arguments: {
          prompt: 'Which archive year should the site document?',
          rationale: 'The date changes every label and image caption.',
          options: [
            { label: '2024', recommended: true },
            { label: '1998' },
            { label: 'Another year' }
          ]
        }
      },
      { sources: [], assets: [] },
      new AbortController().signal
    )
    expect(result.question).toMatchObject({
      id: 'question-call-7',
      prompt: 'Which archive year should the site document?'
    })
    expect(result.question?.options).toHaveLength(3)
  })
})
