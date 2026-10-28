import type { ResearchSource } from '../shared/types'
import type { AssetStore } from './asset-store'

const iconCache = new Map<string, string | null>()
const MAX_ICON_BYTES = 320_000

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function iconType(bytes: Uint8Array, declared: string): string | null {
  const normalized = declared.split(';')[0]?.trim().toLowerCase() ?? ''
  if (
    normalized === 'image/png' ||
    normalized === 'image/jpeg' ||
    normalized === 'image/webp' ||
    normalized === 'image/gif' ||
    normalized === 'image/svg+xml' ||
    normalized === 'image/vnd.microsoft.icon' ||
    normalized === 'image/x-icon'
  ) {
    return normalized
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'image/jpeg'
  }
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1) {
    return 'image/x-icon'
  }
  return null
}

async function fetchIcon(url: string): Promise<{
  bytes: Uint8Array
  contentType: string
} | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1_800),
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8',
        'User-Agent': 'Kern/0.1'
      }
    })
    if (!response.ok) return null
    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_ICON_BYTES) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) return null
    const contentType = iconType(
      bytes,
      response.headers.get('content-type') ?? ''
    )
    return contentType ? { bytes, contentType } : null
  } catch {
    return null
  }
}

async function iconForHost(
  host: string,
  assets: AssetStore
): Promise<string | null> {
  const cached = iconCache.get(host)
  if (cached !== undefined) return cached
  const encoded = encodeURIComponent(host)
  const candidates = [
    `https://www.google.com/s2/favicons?sz=64&domain=${encoded}`,
    `https://icons.duckduckgo.com/ip3/${encoded}.ico`
  ]
  for (const candidate of candidates) {
    const icon = await fetchIcon(candidate)
    if (!icon) continue
    try {
      const stored = await assets.saveBytes(
        icon.bytes,
        icon.contentType,
        'reference'
      )
      iconCache.set(host, stored.token)
      return stored.token
    } catch {
      continue
    }
  }
  iconCache.set(host, null)
  return null
}

export async function attachSourceIcons(
  sources: ResearchSource[],
  assets: AssetStore
): Promise<ResearchSource[]> {
  const hosts = Array.from(
    new Set(sources.map((source) => hostOf(source.url)).filter(Boolean))
  )
  const icons = new Map(
    await Promise.all(
      hosts.map(async (host) => [host, await iconForHost(host, assets)] as const)
    )
  )
  return sources.map((source) => {
    const host = hostOf(source.url)
    const faviconUrl = icons.get(host)
    return faviconUrl ? { ...source, faviconUrl } : source
  })
}
