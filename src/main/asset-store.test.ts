import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetStore, assetFileNameFromUrl } from './asset-store'

const temporaryDirectories: string[] = []
const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('content-addressed asset store', () => {
  it('stores, resolves and removes embedded images from artifact data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kern-assets-'))
    temporaryDirectories.push(directory)
    const assets = new AssetStore(directory)
    await assets.init()
    const stored = await assets.saveDataUrl(onePixelPng, 'reference')
    expect(stored?.token).toMatch(
      /^kern-asset:\/\/asset\/[a-f0-9]{64}\.png$/
    )
    expect(assetFileNameFromUrl(stored?.token ?? '')).toMatch(/\.png$/)
    expect(await assets.toDataUrl(stored?.token ?? '')).toBe(onePixelPng)

    const original = `<main><img src="${onePixelPng}" alt="Pixel"></main>`
    const assetized = await assets.assetizeHtml(original)
    expect(assetized).not.toContain('data:image/png;base64')
    expect(assetized).toContain('kern-asset://asset/')
    expect(await assets.hydrateHtml(assetized)).toBe(original)
  })
})
