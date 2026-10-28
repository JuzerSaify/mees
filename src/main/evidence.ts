import { createHash } from 'node:crypto'
import type { EvidenceItem, ResearchSource } from '../shared/types'

export interface EvidenceClaimInput {
  claim: string
  source_ids: string[]
}

const EDITORIAL_DOMAINS = [
  'apnews.com',
  'bbc.com',
  'ft.com',
  'nytimes.com',
  'reuters.com',
  'theguardian.com',
  'wired.com'
]

const REFERENCE_DOMAINS = [
  'archive.org',
  'britannica.com',
  'commons.wikimedia.org',
  'wikipedia.org'
]

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function wordTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase('en')
        .match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu)
        ?.filter(
          (token) =>
            ![
              'and',
              'are',
              'for',
              'from',
              'has',
              'have',
              'the',
              'this',
              'that',
              'was',
              'were',
              'with'
            ].includes(token)
        ) ?? []
    )
  )
}

function sourceText(source: ResearchSource): string {
  return `${source.title} ${source.snippet} ${source.pageContent ?? ''}`
}

function sourceQuality(source: ResearchSource): {
  label: NonNullable<ResearchSource['quality']>
  score: number
} {
  const host = hostOf(source.url)
  if (
    host.endsWith('.gov') ||
    host.endsWith('.edu') ||
    host.startsWith('docs.') ||
    host.startsWith('developer.')
  ) {
    return { label: 'official', score: 1 }
  }
  if (
    /\.(?:gov|edu)$/i.test(host) ||
    /\/(?:datasets?|reports?|publications?)\//i.test(new URL(source.url).pathname)
  ) {
    return { label: 'primary', score: 0.9 }
  }
  if (EDITORIAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return { label: 'editorial', score: 0.76 }
  }
  if (REFERENCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return { label: 'reference', score: 0.64 }
  }
  return { label: 'unknown', score: 0.48 }
}

function extractedDate(source: ResearchSource): Date | null {
  const parsedPublished = source.publishedAt
    ? new Date(source.publishedAt)
    : null
  if (parsedPublished && Number.isFinite(parsedPublished.getTime())) {
    return parsedPublished
  }
  const text = sourceText(source).slice(0, 18_000)
  const match =
    /\b(?:published|updated|posted|revised)\s*(?:on|:)?\s*([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(
      text
    ) ?? /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)
  if (!match?.[1]) return null
  const date = new Date(match[1])
  return Number.isFinite(date.getTime()) ? date : null
}

function freshnessScore(source: ResearchSource): {
  score: number
  note: string
} {
  const date = extractedDate(source)
  const retrieved = source.retrievedAt ? new Date(source.retrievedAt) : null
  const reference = date ?? retrieved
  if (!reference) {
    return {
      score: 0.42,
      note: 'No publication date was visible in the source.'
    }
  }
  const ageDays = Math.max(
    0,
    (Date.now() - reference.getTime()) / 86_400_000
  )
  const score =
    ageDays <= 7
      ? 1
      : ageDays <= 31
        ? 0.88
        : ageDays <= 365
          ? 0.7
          : ageDays <= 365 * 3
            ? 0.5
            : 0.3
  return {
    score,
    note: date
      ? `Source date ${date.toISOString().slice(0, 10)}.`
      : `Only the retrieval time ${retrieved?.toISOString().slice(0, 10)} is known.`
  }
}

function evidenceId(claim: string): string {
  return `evidence-${createHash('sha256')
    .update(claim)
    .digest('hex')
    .slice(0, 20)}`
}

function claimKey(value: string): string {
  return value
    .toLocaleLowerCase('en')
    .replace(/\b\d+(?:[.,]\d+)?(?:%|px|gb|mb|kb|ms|s|h|k|m|b)?\b/gi, '#')
    .replace(/[^a-z#]+/g, ' ')
    .trim()
}

function numbersIn(value: string): string {
  return (value.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [])
    .sort()
    .join('|')
}

export function assessEvidence(
  claims: EvidenceClaimInput[],
  sources: ResearchSource[]
): EvidenceItem[] {
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const keys = claims.map((entry) => claimKey(entry.claim))

  return claims.slice(0, 16).map((entry, index) => {
    const selected = entry.source_ids
      .map((id) => sourceById.get(id))
      .filter((source): source is ResearchSource => Boolean(source))
    const claimTokens = wordTokens(entry.claim)
    const notes: string[] = []
    let overlapTotal = 0
    let qualityTotal = 0
    let freshnessTotal = 0

    for (const source of selected) {
      const quality = sourceQuality(source)
      const freshness = freshnessScore(source)
      const tokens = new Set(wordTokens(sourceText(source)))
      const overlap =
        claimTokens.length > 0
          ? claimTokens.filter((token) => tokens.has(token)).length /
            claimTokens.length
          : 0
      overlapTotal += overlap
      qualityTotal += quality.score
      freshnessTotal += freshness.score
      source.quality = quality.label
      notes.push(
        `${source.publisher}: ${Math.round(overlap * 100)}% claim-term match, ${quality.label} source. ${freshness.note}`
      )
    }

    const sourceCount = selected.length
    const averageOverlap = sourceCount ? overlapTotal / sourceCount : 0
    const qualityScore = sourceCount ? qualityTotal / sourceCount : 0
    const freshness = sourceCount ? freshnessTotal / sourceCount : 0
    const sameClaim = claims
      .map((candidate, candidateIndex) => ({
        candidate,
        candidateIndex,
        key: keys[candidateIndex] ?? ''
      }))
      .filter(
        (candidate) =>
          candidate.candidateIndex !== index &&
          keys[index] &&
          candidate.key === keys[index] &&
          numbersIn(candidate.candidate.claim) !== numbersIn(entry.claim)
      )

    for (const conflict of sameClaim) {
      notes.push(
        `Conflicting figure in another claim: "${conflict.candidate.claim.slice(0, 180)}".`
      )
    }

    const verdict: EvidenceItem['verdict'] =
      sourceCount === 0
        ? 'unsupported'
        : sameClaim.length > 0
          ? 'conflicting'
          : averageOverlap >= 0.22 && qualityScore >= 0.45
            ? 'supported'
            : 'partial'
    if (sourceCount === 0) notes.push('No valid source IDs were supplied.')
    if (verdict === 'partial') {
      notes.push(
        'The supplied excerpts do not directly support the complete claim; verify the primary text before publishing.'
      )
    }

    return {
      id: evidenceId(entry.claim),
      claim: entry.claim.trim().slice(0, 1_200),
      verdict,
      sourceIds: selected.map((source) => source.id),
      citations: selected.map((source) => ({
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        retrievedAt: source.retrievedAt
      })),
      qualityScore: Math.round(qualityScore * 100),
      freshnessScore: Math.round(freshness * 100),
      notes: notes.slice(0, 8)
    }
  })
}
