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
      'fetch_visual_assets'
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
})
