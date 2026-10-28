import { lookup } from 'node:dns/promises'
import type {
  FetchedVisualAsset,
  ResearchSource
} from '../shared/types'

type JsonRecord = Record<string, unknown>

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Mees/0.1'
const SEARCH_TIMEOUT_MS = 18_000
const ASSET_TIMEOUT_MS = 12_000
const MAX_ASSET_BYTES = 1_750_000
const assetCache = new Map<
  string,
  { expiresAt: number; assets: FetchedVisualAsset[] }
>()

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

export function htmlToText(value: string): string {
  return decodeEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Web'
  }
}

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function isPrivateHostname(value: string): boolean {
  const hostname = value.toLocaleLowerCase('en')
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return true
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    const octets = hostname.split('.').map(Number)
    const [first = 0, second = 0] = octets
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      first >= 224
    )
  }
  if (hostname.includes(':')) {
    return (
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe8') ||
      hostname.startsWith('fe9') ||
      hostname.startsWith('fea') ||
      hostname.startsWith('feb')
    )
  }
  return false
}

async function safePublicUrl(value: string): Promise<URL> {
  const url = new URL(value)
  if (!/^https?:$/.test(url.protocol) || isPrivateHostname(url.hostname)) {
    throw new Error('The reference page is not a public HTTP URL.')
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)) return url
  if (url.hostname.includes(':')) return url
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (
    addresses.length === 0 ||
    addresses.some((address) => isPrivateHostname(address.address))
  ) {
    throw new Error('The reference page resolves to a private address.')
  }
  return url
}

async function readLimitedBody(
  response: Response,
  limit: number
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total <= limit) chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  if (total > limit) {
    throw new Error('The fetched resource is larger than the supported limit.')
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function fetchPublicHtml(
  initialUrl: string,
  signal: AbortSignal
): Promise<{ html: string; finalUrl: string }> {
  let current = await safePublicUrl(initialUrl)
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': USER_AGENT
      }
    })
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get('location')
    ) {
      current = await safePublicUrl(
        new URL(response.headers.get('location') ?? '', current).toString()
      )
      continue
    }
    if (!response.ok) {
      throw new Error(`Reference page returned ${response.status}.`)
    }
    const type = response.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
      throw new Error('Reference page is not HTML.')
    }
    const bytes = await readLimitedBody(response, 900_000)
    return {
      html: new TextDecoder().decode(bytes),
      finalUrl: current.toString()
    }
  }
  throw new Error('Reference page redirected too many times.')
}

function attributeValue(
  attributes: string,
  name: string
): string | null {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`,
    'i'
  ).exec(attributes)
  return match?.[2] ?? null
}

interface PageAssetCandidate {
  kind: 'image' | 'icon'
  title: string
  url: string
  pageUrl: string
  pageTitle: string
  priority: number
  order: number
}

function resolvePublicAssetUrl(
  value: string,
  pageUrl: string
): string | null {
  try {
    const url = new URL(decodeEntities(value), pageUrl)
    if (!/^https?:$/.test(url.protocol) || isPrivateHostname(url.hostname)) {
      return null
    }
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function bestSrcsetValue(value: string): string {
  let best = ''
  let bestScore = -1
  for (const part of value.split(',')) {
    const descriptor = part.trim()
    if (!descriptor) continue
    const pieces = descriptor.split(/\s+/)
    const source = pieces.shift()
    if (!source || source.startsWith('data:')) continue
    const scoreText = pieces[0] ?? '1x'
    const score = Number.parseFloat(scoreText) || 1
    if (score > bestScore) {
      best = source
      bestScore = score
    }
  }
  return best
}

function jsonLdImageValues(value: unknown, output: string[]): void {
  if (output.length >= 3) return
  if (typeof value === 'string') {
    if (/^https?:|^\//i.test(value)) output.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) jsonLdImageValues(entry, output)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as JsonRecord
  if (record.image !== undefined) jsonLdImageValues(record.image, output)
  if (record.thumbnailUrl !== undefined) {
    jsonLdImageValues(record.thumbnailUrl, output)
  }
}

export function extractPageAssetCandidates(
  html: string,
  pageUrl: string
): PageAssetCandidate[] {
  const candidates: PageAssetCandidate[] = []
  const seen = new Set<string>()
  const metadata = new Map<string, string>()

  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = match[1] ?? ''
    const key = (
      attributeValue(attributes, 'property') ??
      attributeValue(attributes, 'name') ??
      ''
    ).toLocaleLowerCase('en')
    const content = attributeValue(attributes, 'content')
    if (key && content) metadata.set(key, decodeEntities(content))
  }

  const pageTitle =
    metadata.get('og:title') ??
    metadata.get('twitter:title') ??
    (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? hostLabel(pageUrl))
  const description =
    metadata.get('og:description') ??
    metadata.get('twitter:description') ??
    metadata.get('description') ??
    ''

  const add = (
    kind: PageAssetCandidate['kind'],
    title: string,
    value: string | null | undefined,
    priority: number
  ): void => {
    if (!value) return
    const url = resolvePublicAssetUrl(value, pageUrl)
    if (!url || seen.has(url)) return
    seen.add(url)
    candidates.push({
      kind,
      title: htmlToText(title).slice(0, 180) || hostLabel(pageUrl),
      url,
      pageUrl,
      pageTitle: htmlToText(pageTitle).slice(0, 180),
      priority,
      order: candidates.length
    })
  }

  add(
    'image',
    pageTitle,
    metadata.get('og:image:secure_url') ??
      metadata.get('og:image:url') ??
      metadata.get('og:image') ??
      metadata.get('twitter:image:src') ??
      metadata.get('twitter:image'),
    0
  )

  const jsonLdImages: string[] = []
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*(['"])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      jsonLdImageValues(JSON.parse(match[2] ?? ''), jsonLdImages)
    } catch {
      // Invalid structured data does not block the rest of the page.
    }
  }
  jsonLdImages.slice(0, 3).forEach((image, index) => {
    add('image', `${pageTitle} ${description}`.trim(), image, 2 + index)
  })

  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1] ?? ''
    const rel = attributeValue(attributes, 'rel')?.toLocaleLowerCase('en') ?? ''
    const href = attributeValue(attributes, 'href')
    if (/\bimage_src\b/.test(rel)) {
      add('image', pageTitle, href, 1)
    }
    if (/\b(?:icon|apple-touch-icon|mask-icon)\b/.test(rel)) {
      const sizes = attributeValue(attributes, 'sizes') ?? ''
      add('icon', `${hostLabel(pageUrl)} ${sizes}`.trim(), href, 0)
    }
  }
  if (!candidates.some((candidate) => candidate.kind === 'icon')) {
    add('icon', `${hostLabel(pageUrl)} favicon`, '/favicon.ico', 0)
  }

  const sourceTags = Array.from(
    html.matchAll(/<source\b([^>]*)>/gi)
  ).slice(0, 16)
  for (const match of sourceTags) {
    const attributes = match[1] ?? ''
    const source =
      bestSrcsetValue(
        attributeValue(attributes, 'srcset') ??
          attributeValue(attributes, 'data-srcset') ??
          ''
      ) ||
      attributeValue(attributes, 'src') ||
      attributeValue(attributes, 'data-src')
    if (!source || /(?:sprite|pixel|spacer|tracking)/i.test(source)) continue
    add(
      'image',
      `${pageTitle} ${description}`.trim(),
      source,
      8
    )
  }

  const imageTags = Array.from(html.matchAll(/<img\b([^>]*)>/gi)).slice(0, 20)
  for (const match of imageTags) {
    const attributes = match[1] ?? ''
    const width = Number.parseInt(attributeValue(attributes, 'width') ?? '', 10)
    const height = Number.parseInt(
      attributeValue(attributes, 'height') ?? '',
      10
    )
    if (
      (Number.isFinite(width) && width > 0 && width < 180) ||
      (Number.isFinite(height) && height > 0 && height < 120)
    ) {
      continue
    }
    const source =
      bestSrcsetValue(attributeValue(attributes, 'srcset') ?? '') ||
      attributeValue(attributes, 'data-src') ||
      attributeValue(attributes, 'data-lazy-src') ||
      attributeValue(attributes, 'src')
    if (
      !source ||
      /(?:sprite|pixel|spacer|tracking|avatar-default)/i.test(source)
    ) {
      continue
    }
    const alt =
      attributeValue(attributes, 'alt') ??
      attributeValue(attributes, 'title') ??
      `${pageTitle} ${description}`.trim()
    add('image', alt, source, 10)
  }

  return candidates.slice(0, 14)
}

function sniffImageType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 3)) === 'GIF'
  ) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1) {
    return 'image/x-icon'
  }
  const beginning = new TextDecoder()
    .decode(bytes.slice(0, Math.min(bytes.length, 1600)))
    .trimStart()
  if (/^<\?xml\b|^<svg\b/i.test(beginning)) return 'image/svg+xml'
  return null
}

function imageDimensions(
  bytes: Uint8Array,
  contentType: string
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (contentType === 'image/png' && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (contentType === 'image/gif' && bytes.length >= 10) {
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true)
    }
  }
  if (contentType === 'image/x-icon' && bytes.length >= 8) {
    return {
      width: bytes[6] === 0 ? 256 : bytes[6] ?? 0,
      height: bytes[7] === 0 ? 256 : bytes[7] ?? 0
    }
  }
  if (contentType === 'image/webp' && bytes.length >= 30) {
    const format = String.fromCharCode(...bytes.slice(12, 16))
    if (format === 'VP8X') {
      const width =
        1 +
        ((bytes[24] ?? 0) |
          ((bytes[25] ?? 0) << 8) |
          ((bytes[26] ?? 0) << 16))
      const height =
        1 +
        ((bytes[27] ?? 0) |
          ((bytes[28] ?? 0) << 8) |
          ((bytes[29] ?? 0) << 16))
      return { width, height }
    }
    if (
      format === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff
      }
    }
  }
  if (contentType === 'image/jpeg') {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1] ?? 0
      const length =
        ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb].includes(
          marker
        )
      ) {
        return {
          width:
            ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
          height:
            ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0)
        }
      }
      if (length < 2) break
      offset += 2 + length
    }
  }
  if (contentType === 'image/svg+xml') {
    const source = new TextDecoder().decode(
      bytes.slice(0, Math.min(bytes.length, 12_000))
    )
    const width = Number.parseFloat(
      /\bwidth\s*=\s*(['"])([\d.]+)/i.exec(source)?.[2] ?? ''
    )
    const height = Number.parseFloat(
      /\bheight\s*=\s*(['"])([\d.]+)/i.exec(source)?.[2] ?? ''
    )
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return { width, height }
    }
    const viewBox = /\bviewBox\s*=\s*(['"])[^'"]*?\s([\d.]+)\s([\d.]+)\1/i.exec(
      source
    )
    if (viewBox) {
      return {
        width: Number.parseFloat(viewBox[2] ?? '0'),
        height: Number.parseFloat(viewBox[3] ?? '0')
      }
    }
  }
  return null
}

async function fetchPublicAsset(
  initialUrl: string,
  signal: AbortSignal
): Promise<{
  contentType: string
  bytes: Uint8Array
  width?: number
  height?: number
}> {
  let current = await safePublicUrl(initialUrl)
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(ASSET_TIMEOUT_MS)]),
      redirect: 'manual',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        'User-Agent': USER_AGENT
      }
    })
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get('location')
    ) {
      current = await safePublicUrl(
        new URL(response.headers.get('location') ?? '', current).toString()
      )
      continue
    }
    if (!response.ok) {
      throw new Error(`Visual asset returned ${response.status}.`)
    }
    const bytes = await readLimitedBody(response, MAX_ASSET_BYTES)
    const declaredType = (
      response.headers.get('content-type') ?? ''
    )
      .split(';')[0]
      ?.trim()
      .toLocaleLowerCase('en')
    const sniffedType = sniffImageType(bytes)
    const contentType = sniffedType ?? declaredType ?? ''
    if (!/^image\//i.test(contentType)) {
      throw new Error('The fetched address is not a supported visual asset.')
    }
    const dimensions = imageDimensions(bytes, contentType)
    return {
      contentType,
      bytes,
      width: dimensions?.width,
      height: dimensions?.height
    }
  }
  throw new Error('The visual asset redirected too many times.')
}

function dataUrlForAsset(contentType: string, bytes: Uint8Array): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
}

function assetFamilyKey(value: string): string {
  try {
    const url = new URL(value)
    return `${url.hostname}${url.pathname}`
      .toLocaleLowerCase('en')
      .replace(
        /_(?:small|smalltall|medium|mediumtall|large|largetall|wide|tall|xlarge|ultrawide)(?:_2x)?(?=\.[a-z0-9]+$)/i,
        ''
      )
      .replace(/[_@-](?:1x|2x|3x)(?=\.[a-z0-9]+$)/i, '')
  } catch {
    return value
  }
}

export function extractWebUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []
  const urls: string[] = []
  for (const match of matches) {
    const normalized = match.replace(/[.,;:!?]+$/, '')
    try {
      const url = new URL(normalized)
      if (!/^https?:$/.test(url.protocol)) continue
      if (!urls.includes(url.toString())) urls.push(url.toString())
    } catch {
      continue
    }
  }
  return urls.slice(0, 5)
}

function queryTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase('en')
        .match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu)
        ?.filter(
          (token) =>
            ![
              'the',
              'and',
              'for',
              'with',
              'from',
              'this',
              'that',
              'into',
              'make',
              'create',
              'design',
              'page',
              'website',
              'landing'
            ].includes(token)
        ) ?? []
    )
  )
}

function assetScore(
  candidate: PageAssetCandidate,
  query: string,
  pageIndex: number
): number {
  const tokens = queryTokens(
    `${query} ${candidate.title} ${candidate.pageTitle}`
  )
  const sourceText = `${candidate.title} ${candidate.pageTitle}`.toLocaleLowerCase(
    'en'
  )
  const queryWords = queryTokens(query)
  const overlaps = queryWords.filter((word) => sourceText.includes(word)).length
  return (
    (candidate.kind === 'image' ? 30 : 10) -
    candidate.priority -
    pageIndex * 4 +
    overlaps * 8 +
    Math.min(8, tokens.length)
  )
}

function unwrapDuckDuckGoUrl(value: string): string {
  const normalized = value.startsWith('//') ? `https:${value}` : value
  try {
    const url = new URL(normalized, 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg')
    return target ? new URL(target).toString() : url.toString()
  } catch {
    return normalized
  }
}

export function parseDuckDuckGoResults(
  html: string,
  limit = 4
): ResearchSource[] {
  const anchors = Array.from(
    html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)
  )
  const sources: ResearchSource[] = []

  for (
    let index = 0;
    index < anchors.length && sources.length < limit;
    index += 1
  ) {
    const anchor = anchors[index]
    if (!anchor || !/\bresult-link\b/i.test(anchor[1] ?? '')) continue
    const href = attributeValue(anchor[1] ?? '', 'href')
    if (!href) continue
    const start = (anchor.index ?? 0) + anchor[0].length
    const next = anchors[index + 1]
    const end = next?.index ?? html.length
    const following = html.slice(start, end)
    const snippetMatch =
      /class\s*=\s*(['"])[^'"]*\bresult-snippet\b[^'"]*\1[^>]*>([\s\S]*?)<\/td>/i.exec(
        following
      )
    const url = unwrapDuckDuckGoUrl(href)
    const title = htmlToText(anchor[2] ?? '')
    if (!title || sources.some((source) => source.url === url)) continue
    sources.push({
      id: `web-${sources.length + 1}`,
      title: title.slice(0, 180),
      url,
      publisher: hostLabel(url),
      snippet: htmlToText(snippetMatch?.[2] ?? '').slice(0, 520)
    })
  }
  return sources
}

function xmlTagValue(value: string, tag: string): string {
  const match = new RegExp(
    `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i'
  ).exec(value)
  return (match?.[1] ?? '')
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
    .trim()
}

export function parseBingRssResults(
  xml: string,
  limit = 5
): ResearchSource[] {
  const sources: ResearchSource[] = []
  const seen = new Set<string>()
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    if (sources.length >= limit) break
    const item = match[1] ?? ''
    const url = htmlToText(xmlTagValue(item, 'link'))
    const title = htmlToText(xmlTagValue(item, 'title'))
    const snippet = htmlToText(xmlTagValue(item, 'description')).slice(0, 520)
    if (!/^https?:\/\//i.test(url) || !title || seen.has(url)) continue
    seen.add(url)
    sources.push({
      id: `web-${sources.length + 1}`,
      title: title.slice(0, 180),
      url,
      publisher: hostLabel(url),
      snippet
    })
  }
  return sources
}

export function normalizeToolQuery(value: string): string {
  return value
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

async function searchDuckDuckGo(
  query: string,
  signal: AbortSignal
): Promise<ResearchSource[]> {
  const normalized = normalizeToolQuery(query)
  if (!normalized) return []
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(normalized)}`
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]),
    headers: {
      Accept: 'text/html',
      'User-Agent': USER_AGENT
    }
  })
  if (!response.ok) {
    throw new Error(`Search returned ${response.status}.`)
  }
  const html = await response.text()
  return parseDuckDuckGoResults(html, 5)
}

async function searchBingRss(
  query: string,
  signal: AbortSignal
): Promise<ResearchSource[]> {
  const normalized = normalizeToolQuery(query)
  if (!normalized) return []
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(normalized)}`
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]),
    headers: {
      Accept: 'application/rss+xml,application/xml,text/xml',
      'User-Agent': USER_AGENT
    }
  })
  if (!response.ok) {
    throw new Error(`Fallback search returned ${response.status}.`)
  }
  return parseBingRssResults(await response.text(), 5)
}

async function searchWithFallback(
  query: string,
  signal: AbortSignal
): Promise<ResearchSource[]> {
  try {
    const primary = await searchDuckDuckGo(query, signal)
    if (primary.length > 0) return primary
  } catch (error) {
    if (signal.aborted) throw error
  }
  try {
    return await searchBingRss(query, signal)
  } catch (error) {
    if (signal.aborted) throw error
    return []
  }
}

function canonicalSourceUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (
        /^(?:utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i.test(key)
      ) {
        url.searchParams.delete(key)
      }
    }
    url.hostname = url.hostname.toLocaleLowerCase('en').replace(/^www\./, '')
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return value
  }
}

function inferPublishedAt(source: ResearchSource): string | undefined {
  const text = `${source.title} ${source.snippet}`.slice(0, 2_000)
  const candidates = [
    /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)?.[1],
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/i.exec(
      text
    )?.[0],
    /\b(?:19|20)\d{2}\b/.exec(text)?.[0]
  ].filter((value): value is string => Boolean(value))
  for (const candidate of candidates) {
    const date = new Date(candidate)
    if (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() >= 1990 &&
      date.getUTCFullYear() <= new Date().getUTCFullYear() + 1
    ) {
      return date.toISOString()
    }
  }
  return undefined
}

function diversifySources(
  sources: ResearchSource[],
  limit = 8
): ResearchSource[] {
  const selected: ResearchSource[] = []
  const overflow: ResearchSource[] = []
  const hostCounts = new Map<string, number>()
  for (const source of sources) {
    const host = hostLabel(source.url)
    const count = hostCounts.get(host) ?? 0
    if (count < 2) {
      selected.push(source)
      hostCounts.set(host, count + 1)
    } else {
      overflow.push(source)
    }
  }
  return [...selected, ...overflow].slice(0, limit)
}

export async function researchWeb(
  input: string | string[],
  signal: AbortSignal
): Promise<ResearchSource[]> {
  const queries = Array.from(
    new Set(
      (Array.isArray(input) ? input : [input])
        .map(normalizeToolQuery)
        .filter((query) => query.length >= 3)
    )
  ).slice(0, 4)
  const retrievedAt = new Date().toISOString()
  const groups = await Promise.allSettled(
    queries.map((query) => searchWithFallback(query, signal))
  )
  if (signal.aborted) throw new DOMException('Research cancelled', 'AbortError')
  const seen = new Set<string>()
  const deduplicated = groups
    .flatMap((group) => (group.status === 'fulfilled' ? group.value : []))
    .filter((source) => {
      const canonical = canonicalSourceUrl(source.url)
      if (seen.has(canonical)) return false
      seen.add(canonical)
      return true
    })
    .map((source) => {
      const publishedAt = inferPublishedAt(source)
      return {
        ...source,
        url: canonicalSourceUrl(source.url),
        publisher: hostLabel(source.url),
        retrievedAt,
        ...(publishedAt ? { publishedAt } : {})
      }
    })
  return diversifySources(deduplicated).map((source) => ({
    ...source,
    id: `web-${hashText(canonicalSourceUrl(source.url))}`
  }))
}

export function extractReadablePageContent(html: string): string {
  const description =
    /<meta\b[^>]*(?:name|property)\s*=\s*(['"])(?:description|og:description)\1[^>]*content\s*=\s*(['"])([\s\S]*?)\2[^>]*>/i.exec(
      html
    )?.[3] ??
    /<meta\b[^>]*content\s*=\s*(['"])([\s\S]*?)\1[^>]*(?:name|property)\s*=\s*(['"])(?:description|og:description)\3[^>]*>/i.exec(
      html
    )?.[2] ??
    ''
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(?:script|style|noscript|template|svg|nav|footer|header|aside|form|dialog)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|template|svg|nav|footer|header|aside|form|dialog)>/gi,
      ' '
    )
  const scope =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned)?.[1] ??
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned)?.[1] ??
    cleaned
  const paragraphs: string[] = []
  const seen = new Set<string>()
  for (const match of scope.matchAll(
    /<(?:p|li|h2|h3|h4|blockquote)\b[^>]*>([\s\S]*?)<\/(?:p|li|h2|h3|h4|blockquote)>/gi
  )) {
    const text = htmlToText(match[1] ?? '')
    if (text.length < 32 || text.length > 1_200 || seen.has(text)) continue
    seen.add(text)
    paragraphs.push(text)
    if (paragraphs.length >= 36) break
  }
  const body =
    paragraphs.length >= 2 ? paragraphs.join('\n') : htmlToText(scope)
  return [htmlToText(description), body]
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 7_500)
}

function extractPublishedAt(html: string): string | undefined {
  const metadata =
    /<meta\b[^>]*(?:property|name)\s*=\s*(['"])(?:article:published_time|datePublished|date|publish-date)\1[^>]*content\s*=\s*(['"])([^'"]+)\2/i.exec(
      html
    )?.[3] ??
    /<meta\b[^>]*content\s*=\s*(['"])([^'"]+)\1[^>]*(?:property|name)\s*=\s*(['"])(?:article:published_time|datePublished|date|publish-date)\3/i.exec(
      html
    )?.[2] ??
    /<time\b[^>]*datetime\s*=\s*(['"])([^'"]+)\1/i.exec(html)?.[2]
  if (!metadata) return undefined
  const date = new Date(metadata)
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1990 ||
    date.getUTCFullYear() > new Date().getUTCFullYear() + 1
  ) {
    return undefined
  }
  return date.toISOString()
}

export async function readWebSources(
  sources: ResearchSource[],
  sourceIds: string[],
  signal: AbortSignal
): Promise<ResearchSource[]> {
  const requested = new Set(sourceIds.slice(0, 4))
  const selected = requested.size
    ? sources.filter((source) => requested.has(source.id))
    : sources.filter((source) => !source.pageContent).slice(0, 3)
  const results = await Promise.allSettled(
    selected.map(async (source) => {
      const page = await fetchPublicHtml(source.url, signal)
      const pageContent = extractReadablePageContent(page.html)
      const publishedAt = extractPublishedAt(page.html)
      if (!pageContent) throw new Error('No readable page text was found.')
      return {
        ...source,
        url: canonicalSourceUrl(page.finalUrl),
        pageContent,
        retrievedAt: new Date().toISOString(),
        ...(publishedAt ? { publishedAt } : {})
      } satisfies ResearchSource
    })
  )
  if (signal.aborted) throw new DOMException('Page reading cancelled', 'AbortError')
  return results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  )
}

export async function readPublicUrls(
  urls: string[],
  signal: AbortSignal
): Promise<ResearchSource[]> {
  const unique = Array.from(
    new Set(urls.map((value) => value.trim()).filter(Boolean))
  ).slice(0, 4)
  const results = await Promise.allSettled(
    unique.map(async (value) => {
      const page = await fetchPublicHtml(value, signal)
      const title =
        htmlToText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1] ?? '') ||
        hostLabel(page.finalUrl)
      const pageContent = extractReadablePageContent(page.html)
      const publishedAt = extractPublishedAt(page.html)
      return {
        id: `url-${hashText(page.finalUrl)}`,
        title: title.slice(0, 180),
        url: canonicalSourceUrl(page.finalUrl),
        publisher: hostLabel(page.finalUrl),
        snippet: pageContent.slice(0, 520),
        pageContent,
        retrievedAt: new Date().toISOString(),
        ...(publishedAt ? { publishedAt } : {})
      } satisfies ResearchSource
    })
  )
  if (signal.aborted) throw new DOMException('URL reading cancelled', 'AbortError')
  return results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  )
}

async function assetCandidatesForUrl(
  url: string,
  signal: AbortSignal
): Promise<PageAssetCandidate[]> {
  try {
    const page = await fetchPublicHtml(url, signal)
    return extractPageAssetCandidates(page.html, page.finalUrl)
  } catch (error) {
    if (signal.aborted) throw error
    return [
      {
        kind: 'image',
        title: hostLabel(url),
        url,
        pageUrl: url,
        pageTitle: hostLabel(url),
        priority: 0,
        order: 0
      }
    ]
  }
}

export async function fetchWebAssets(
  query: string,
  signal: AbortSignal
): Promise<FetchedVisualAsset[]> {
  if (!normalizeToolQuery(query) && extractWebUrls(query).length === 0) return []
  const cacheKey = `${normalizeToolQuery(query)}|${extractWebUrls(query).join('|')}`.toLocaleLowerCase(
    'en'
  )
  const cached = assetCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.assets
  }

  const explicitUrls = extractWebUrls(query)
  const candidateGroups: PageAssetCandidate[][] = []

  for (const url of explicitUrls.slice(0, 3)) {
    candidateGroups.push(await assetCandidatesForUrl(url, signal))
    if (signal.aborted) {
      throw new DOMException('Asset fetch cancelled', 'AbortError')
    }
  }

  if (explicitUrls.length === 0 || candidateGroups.flat().length === 0) {
    try {
      const searchResults = await searchDuckDuckGo(query, signal)
      const pages = searchResults
        .filter(
          (source) =>
            !explicitUrls.some((explicit) => explicit === source.url)
        )
        .slice(0, 3)
      for (const page of pages) {
        candidateGroups.push(await assetCandidatesForUrl(page.url, signal))
        if (signal.aborted) {
          throw new DOMException('Asset fetch cancelled', 'AbortError')
        }
      }
    } catch (error) {
      if (signal.aborted) throw error
    }
  }

  const flattened = candidateGroups.flat()
  const seen = new Set<string>()
  const rankedAll = flattened
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false
      seen.add(candidate.url)
      return true
    })
    .map((candidate, index) => ({
      candidate,
      score: assetScore(candidate, query, Math.floor(index / 4))
    }))
    .sort((left, right) => right.score - left.score)
  const ranked = [
    ...rankedAll
      .filter(({ candidate }) => candidate.kind === 'image')
      .slice(0, 6),
    ...rankedAll
      .filter(({ candidate }) => candidate.kind === 'icon')
      .slice(0, 2)
  ]

  const fetched = await Promise.allSettled(
    ranked.map(async ({ candidate }) => {
      const asset = await fetchPublicAsset(candidate.url, signal)
      if (candidate.kind === 'image') {
        if (asset.bytes.byteLength < 8_000) {
          throw new Error('The image is too small to be a useful page asset.')
        }
        if (
          asset.width !== undefined &&
          asset.height !== undefined &&
          (asset.width < 240 ||
            asset.height < 140 ||
            asset.width / asset.height > 5 ||
            asset.height / asset.width > 3)
        ) {
          throw new Error('The image dimensions are not useful for this page.')
        }
      }
      const id = `asset-${hashText(candidate.url)}`
      return {
        id,
        token: `mees-asset://${id}`,
        kind: candidate.kind,
        title: candidate.title,
        pageUrl: candidate.pageUrl,
        sourceUrl: candidate.url,
        contentType: asset.contentType,
        byteLength: asset.bytes.byteLength,
        width: asset.width,
        height: asset.height,
        dataUrl: dataUrlForAsset(asset.contentType, asset.bytes)
      } satisfies FetchedVisualAsset
    })
  )
  if (signal.aborted) throw new DOMException('Asset fetch cancelled', 'AbortError')
  const successful = fetched.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  )
  const iconRequested = /\b(?:icon|logo|favicon|symbol|mark|brand)\b/i.test(
    query
  )
  const imageFamilies = new Set<string>()
  const images = successful
    .filter((asset) => asset.kind === 'image')
    .sort((left, right) => right.byteLength - left.byteLength)
    .filter((asset) => {
      const family = assetFamilyKey(asset.sourceUrl)
      if (imageFamilies.has(family)) return false
      imageFamilies.add(family)
      return true
    })
  const icons = successful.filter((asset) => asset.kind === 'icon')
  const selected = iconRequested
    ? [...icons.slice(0, 1), ...images.slice(0, 3)]
    : [...images.slice(0, 3), ...icons.slice(0, 1)]
  const result = selected.slice(0, 4)
  if (result.length > 0) {
    assetCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60_000,
      assets: result
    })
  }
  return result
}

export function buildExternalContext(
  sources: ResearchSource[],
  fetchedAssets: FetchedVisualAsset[] = []
): string {
  const sections: string[] = []
  if (sources.length > 0) {
    sections.push(
      'Web research:',
      ...sources.map(
        (source, index) =>
          `${index + 1}. ${source.title} (${source.publisher}) ${source.url}${
            source.retrievedAt ? `\nRetrieved: ${source.retrievedAt}` : ''
          }\nSearch excerpt: ${source.snippet}${
            source.pageContent
              ? `\nPage excerpt:\n${source.pageContent.slice(0, 3_500)}`
              : ''
          }`
      )
    )
  }
  if (fetchedAssets.length > 0) {
    sections.push(
      'Fetched web assets:',
      'These are real image files retrieved from public pages. Use them as visual material only when they accurately represent the requested subject. Credit the source page in the final page. Do not claim ownership.',
      ...fetchedAssets.map(
        (asset, index) =>
          `${index + 1}. ${asset.kind}: ${asset.title}; page: ${asset.pageUrl}; source: ${asset.sourceUrl}; type: ${asset.contentType}; bytes: ${asset.byteLength}${
            asset.width && asset.height
              ? `; dimensions: ${asset.width}x${asset.height}`
              : ''
          }; embed URL: ${asset.token}. Use this exact token in the generated HTML.`
      )
    )
  }
  return sections.join('\n').slice(0, 28_000)
}
