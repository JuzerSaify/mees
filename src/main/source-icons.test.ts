import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetStore } from './asset-store'
import { attachSourceIcons, resolveSiteIcon } from './source-icons'

const temporaryDirectories: string[] = []
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('source favicons', () => {
  it('stores a real fetched favicon and attaches its local token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mees-icons-'))
    temporaryDirectories.push(directory)
    const assets = new AssetStore(directory)
    await assets.init()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(png, {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      )
    )
    const [source] = await attachSourceIcons(
      [
        {
          id: 'source-1',
          title: 'Official record',
          url: 'https://example.gov/records',
          publisher: 'example.gov',
          snippet: 'Current official records.'
        }
      ],
      assets
    )
    expect(source?.faviconUrl).toMatch(
      /^mees-asset:\/\/asset\/[a-f0-9]{64}\.png$/
    )
  })

  it('resolves an icon directly for the exact requested host', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mees-icons-'))
    temporaryDirectories.push(directory)
    const assets = new AssetStore(directory)
    await assets.init()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const icon = await resolveSiteIcon('github.com', assets)
    expect(icon).toMatchObject({
      host: 'github.com',
      token: expect.stringMatching(
        /^mees-asset:\/\/asset\/[a-f0-9]{64}\.png$/
      ),
      sourceUrl: expect.stringContaining('github.com')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('domain=github.com'),
      expect.any(Object)
    )
  })
})
