import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildExternalContext,
  extractReadablePageContent,
  extractPageAssetCandidates,
  extractWebUrls,
  fetchWebAssets,
  normalizeToolQuery,
  parseBingRssResults,
  parseDuckDuckGoResults,
  readWebSources,
  researchWeb
} from './tools'

afterEach(() => {
  vi.unstubAllGlobals()
})

function htmlResponse(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}

function imageResponse(bytes: Uint8Array, type: string): Response {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': type }
  })
}

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(9_000)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('web research', () => {
  it('parses result titles, snippets and redirect URLs', () => {
    const html = `
      <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fstudio&amp;rut=abc" class='result-link'>Example Studio</a>
      <td class='result-snippet'>A design studio in the north of England.</td>
    `
    expect(parseDuckDuckGoResults(html)).toEqual([
      {
        id: 'web-1',
        title: 'Example Studio',
        url: 'https://example.com/studio',
        publisher: 'example.com',
        snippet: 'A design studio in the north of England.'
      }
    ])
  })

  it('normalizes the user request without a keyword table', () => {
    expect(
      normalizeToolQuery(
        '  Create a landing page for a modern architecture studio in Northumberland.  '
      )
    ).toBe(
      'Create a landing page for a modern architecture studio in Northumberland.'
    )
  })

  it('returns real search results with a retrieval timestamp', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(`
          <a rel="nofollow" class='result-link' href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">Example Studio</a>
          <td class='result-snippet'>A design studio in Northumberland.</td>
        `)
      )
    )

    const sources = await researchWeb(
      'landing page for a Northumberland architecture studio',
      new AbortController().signal
    )
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      title: 'Example Studio',
      publisher: 'example.com'
    })
    expect(Date.parse(sources[0]?.retrievedAt ?? '')).not.toBeNaN()
  })

  it('falls back to Bing RSS when the primary search endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('temporarily unavailable', { status: 503 })
        )
        .mockResolvedValueOnce(
          new Response(
            `<?xml version="1.0"?><rss><channel><item>
              <title>Primary source</title>
              <link>https://example.com/release</link>
              <description>Current release notes and exact dates.</description>
            </item></channel></rss>`,
            {
              status: 200,
              headers: { 'content-type': 'application/rss+xml' }
            }
          )
        )
    )

    const sources = await researchWeb(
      'official current release notes',
      new AbortController().signal
    )
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      title: 'Primary source',
      url: 'https://example.com/release',
      publisher: 'example.com'
    })
  })

  it('parses Bing RSS results without trusting embedded markup', () => {
    const sources = parseBingRssResults(`
      <rss><channel><item>
        <title><![CDATA[Studio <b>Notes</b>]]></title>
        <link>https://example.com/notes</link>
        <description><![CDATA[<p>A studio working with reclaimed stone.</p>]]></description>
      </item></channel></rss>
    `)
    expect(sources[0]).toMatchObject({
      title: 'Studio Notes',
      url: 'https://example.com/notes',
      snippet: 'A studio working with reclaimed stone.'
    })
  })

  it('reads public page text beyond the search excerpt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        htmlResponse(`
          <html><head><title>Source report</title></head><body>
            <nav>Ignore this navigation</nav>
            <article>
              <h2>Current findings</h2>
              <p>The first supported claim includes a concrete date and a verified result.</p>
              <p>The second supported claim adds context from the primary source.</p>
            </article>
          </body></html>
        `)
      )
    )
    const sources = await readWebSources(
      [
        {
          id: 'web-example',
          title: 'Example',
          url: 'https://93.184.215.14/article',
          publisher: 'example.com',
          snippet: 'Short result excerpt.'
        }
      ],
      ['web-example'],
      new AbortController().signal
    )
    expect(sources[0]?.pageContent).toContain('first supported claim')
    expect(sources[0]?.pageContent).toContain('second supported claim')
    expect(sources[0]?.pageContent).not.toContain('Ignore this navigation')
  })

  it('extracts readable article blocks and ignores page chrome', () => {
    const content = extractReadablePageContent(`
      <meta name="description" content="A concise page description.">
      <header>Menu</header><main>
        <h2>Research notes</h2>
        <p>This paragraph carries enough readable detail to be useful.</p>
        <p>A second complete paragraph gives the evidence independent support.</p>
      </main><footer>Legal links</footer>
    `)
    expect(content).toContain('A concise page description.')
    expect(content).toContain('This paragraph carries enough readable detail')
    expect(content).not.toContain('Legal links')
  })
})

describe('web asset extraction', () => {
  it('extracts social imagery, page images and website icons', () => {
    const candidates = extractPageAssetCandidates(
      `
        <meta property="og:title" content="Northline Studio">
        <meta property="og:image" content="/media/northline-project.jpg">
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch.png">
        <img src="images/workshop.jpg" width="1200" height="800" alt="Workshop bench">
      `,
      'https://example.com/studio'
    )

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      'image',
      'icon',
      'image'
    ])
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      'https://example.com/media/northline-project.jpg',
      'https://example.com/icons/apple-touch.png',
      'https://example.com/images/workshop.jpg'
    ])
  })

  it('finds supplied public URLs without trailing prose punctuation', () => {
    expect(
      extractWebUrls(
        'Use https://example.com/studio. Also this image: https://cdn.example.com/pic.webp, please.'
      )
    ).toEqual([
      'https://example.com/studio',
      'https://cdn.example.com/pic.webp'
    ])
  })

  it('validates and packages fetched page imagery with stable tokens', async () => {
    const image = pngBytes(1200, 800)
    const icon = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: string | URL) => {
        const url = String(input)
        if (url.endsWith('/studio')) {
          return Promise.resolve(
            htmlResponse(`
              <title>Northline Studio</title>
              <meta property="og:title" content="Northline Studio workshop">
              <meta property="og:image" content="/images/workshop.png">
              <link rel="icon" sizes="32x32" href="/favicon.ico">
            `)
          )
        }
        if (url.endsWith('/images/workshop.png')) {
          return Promise.resolve(imageResponse(image, 'image/png'))
        }
        if (url.endsWith('/favicon.ico')) {
          return Promise.resolve(imageResponse(icon, 'image/x-icon'))
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })
    )

    const assets = await fetchWebAssets(
      'Use this page for the workshop visuals: https://93.184.215.14/studio',
      new AbortController().signal
    )
    expect(assets).toHaveLength(2)
    expect(assets[0]).toMatchObject({
      kind: 'image',
      title: 'Northline Studio workshop',
      contentType: 'image/png',
      width: 1200,
      height: 800
    })
    expect(assets[0]?.token).toMatch(/^kern-asset:\/\//)
    expect(assets[0]?.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(assets[1]).toMatchObject({
      kind: 'icon',
      contentType: 'image/x-icon'
    })
  })

  it('gives the generator exact embed tokens and source provenance', () => {
    const context = buildExternalContext(
      [
        {
          id: 'web-1',
          title: 'Studio notes',
          url: 'https://example.com/notes',
          publisher: 'example.com',
          snippet: 'The studio works with reclaimed stone.',
          retrievedAt: '2026-10-27T12:34:00.000Z'
        }
      ],
      [
        {
          id: 'asset-a1',
          token: 'kern-asset://asset-a1',
          kind: 'image',
          title: 'Workshop',
          pageUrl: 'https://example.com',
          sourceUrl: 'https://example.com/workshop.jpg',
          contentType: 'image/jpeg',
          byteLength: 1200,
          width: 1200,
          height: 800,
          dataUrl: 'data:image/jpeg;base64,abc'
        }
      ]
    )

    expect(context).toContain('Fetched web assets')
    expect(context).toContain('kern-asset://asset-a1')
    expect(context).toContain('dimensions: 1200x800')
    expect(context).toContain('Credit the source page')
  })
})

describe.skipIf(process.env.KERN_LIVE_TOOL_CHECK !== '1')(
  'live tool contract',
  () => {
    it(
      'reaches public search and page-asset sources',
      async () => {
        const query =
          process.env.KERN_LIVE_VISUAL_QUERY ||
          'official Northumberland architecture studio'
        const signal = AbortSignal.timeout(60_000)
        const [sources, assets] = await Promise.all([
          researchWeb(query, signal),
          fetchWebAssets(query, signal)
        ])

        expect(sources.length).toBeGreaterThan(0)
        expect(sources.every((source) => /^https?:\/\//.test(source.url))).toBe(
          true
        )
        expect(assets.length).toBeGreaterThan(0)
        expect(assets.every((asset) => /^data:image\//.test(asset.dataUrl))).toBe(
          true
        )
      },
      65_000
    )
  }
)
