import type {
  EditPatch,
  FetchedVisualAsset
} from '../../../shared/types'

export interface ParsedAgentOutput {
  narrative: string
  designHtml: string
  designStarted: boolean
}

export interface ParsedEditPatchOutput {
  narrative: string
  patchSource: string
  patchStarted: boolean
}

function stripCodeFence(value: string): string {
  let result = value.trim()
  result = result.replace(/^```(?:html)?[ \t]*\r?\n?/i, '')
  result = result.replace(/\r?\n?```[ \t]*$/i, '')
  return result.trim()
}

function stripPartialMarker(value: string): string {
  return value
    .replace(/\n?\s*:::{0,6}\s*(?:desi(?:g(?:n)?)?)?$/i, '')
    .replace(/\n?\s*<desi(?:g(?:n)?)?$/i, '')
    .trimEnd()
}

export function parseAgentOutput(raw: string): ParsedAgentOutput {
  if (!raw.trim()) {
    return { narrative: '', designHtml: '', designStarted: false }
  }

  const explicitMarker = /:::\s*design\s*(?:\r?\n|$)/i.exec(raw)
  const tagMarker = /<design>\s*(?:\r?\n)?/i.exec(raw)
  const marker = explicitMarker ?? tagMarker

  if (marker && marker.index !== undefined) {
    const markerLength = marker[0].length
    const sourceStart = marker.index + markerLength
    const narrative = stripPartialMarker(raw.slice(0, marker.index))
    let source = raw.slice(sourceStart)
    const closing = tagMarker
      ? /<\/design>/i.exec(source)
      : /:::\s*(?:\r?\n|$)/.exec(source)

    if (closing && closing.index !== undefined) {
      source = source.slice(0, closing.index)
    }

    return {
      narrative,
      designHtml: stripCodeFence(source),
      designStarted: true
    }
  }

  const fencedHtml = /```(?:html)?\s*\r?\n([\s\S]*)$/i.exec(raw)
  if (fencedHtml && /(?:<!doctype|<html)/i.test(fencedHtml[1])) {
    const narrative = stripPartialMarker(raw.slice(0, fencedHtml.index))
    return {
      narrative,
      designHtml: stripCodeFence(fencedHtml[1]),
      designStarted: true
    }
  }

  if (/^\s*(?:<!doctype|<html)/i.test(raw)) {
    return {
      narrative: '',
      designHtml: stripCodeFence(raw),
      designStarted: true
    }
  }

  return {
    narrative: stripPartialMarker(raw),
    designHtml: '',
    designStarted: false
  }
}

export function parseEditPatchOutput(raw: string): ParsedEditPatchOutput {
  if (!raw.trim()) {
    return { narrative: '', patchSource: '', patchStarted: false }
  }

  const marker = /:::\s*patch\s*(?:\r?\n|$)/i.exec(raw)
  if (!marker || marker.index === undefined) {
    return {
      narrative: stripPartialMarker(raw),
      patchSource: '',
      patchStarted: false
    }
  }

  const sourceStart = marker.index + marker[0].length
  const narrative = stripPartialMarker(raw.slice(0, marker.index))
  const remainder = raw.slice(sourceStart)
  const closing = /\r?\n:::\s*$/.exec(remainder)
  const patchSource = (
    closing ? remainder.slice(0, closing.index) : remainder
  ).trim()
  return { narrative, patchSource, patchStarted: true }
}

function stripJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function parseEditPatch(source: string): EditPatch {
  const cleaned = stripJsonFence(source)
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('The selected-element edit did not return a usable patch.')
  }

  let value: unknown
  try {
    value = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    throw new Error('The selected-element edit returned invalid patch data.')
  }
  const record =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
  const replacement =
    typeof record.replacement === 'string' ? record.replacement.trim() : ''
  const styles =
    typeof record.styles === 'string' ? record.styles.trim() : undefined
  const note = typeof record.note === 'string' ? record.note.trim() : ''

  if (!replacement || replacement.length > 40_000) {
    throw new Error('The selected-element edit returned an empty or oversized replacement.')
  }
  if (styles && styles.length > 40_000) {
    throw new Error('The selected-element edit returned too much styling.')
  }

  return {
    replacement,
    styles: styles || undefined,
    note: note.slice(0, 420) || 'Updated the selected element.'
  }
}

export function hydrateFetchedAssets(
  html: string,
  assets: FetchedVisualAsset[]
): string {
  if (!html || assets.length === 0) return html
  let next = html
  for (const asset of assets) {
    if (!asset.token || !asset.dataUrl) continue
    next = next.split(asset.token).join(asset.dataUrl)
  }
  return next
}

function decodeTitleEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
}

export function parseDesignTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  if (!title) return null
  const clean = decodeTitleEntities(title).replace(/\s+/g, ' ').trim()
  return clean ? clean.slice(0, 80) : null
}

export function deriveProjectTitle(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim()
  const stripped = clean.replace(
    /^(?:please\s+)?(?:create|make|design|build|generate|draft)\s+(?:me\s+)?(?:a|an|the)?\s*/i,
    ''
  )
  const firstPhrase = stripped.split(/[.!?]/)[0]?.trim() || clean
  const title = firstPhrase.slice(0, 64).trim()
  if (!title) return 'Untitled design'
  return title[0].toUpperCase() + title.slice(1)
}

export function textBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
