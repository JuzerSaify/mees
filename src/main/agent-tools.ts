import type {
  AgentActivityKind,
  FetchedVisualAsset,
  ResearchSource
} from '../shared/types'
import type {
  AgentToolCall,
  AgentToolDefinition
} from './providers'
import {
  extractWebUrls,
  fetchWebAssets,
  readPublicUrls,
  readWebSources,
  researchWeb
} from './tools'

export interface AgentToolState {
  sources: ResearchSource[]
  assets: FetchedVisualAsset[]
}

export interface AgentToolDescription {
  kind: AgentActivityKind
  label: string
  detail: string
}

export interface AgentToolExecution extends AgentToolDescription {
  content: string
  sources?: ResearchSource[]
  assets?: FetchedVisualAsset[]
}

const sourceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    queries: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'string' }
    },
    reason: { type: 'string' }
  },
  required: ['queries']
}

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'search_web',
    description:
      'Search the live web for facts that can change, named entities, current releases, prices, schedules, or subject research that materially improves the work. Use several distinct self-contained queries when different facets are missing. Do not use this for approval or for facts already established in the conversation.',
    inputSchema: sourceSchema
  },
  {
    name: 'read_web_pages',
    description:
      'Read the full public page text for up to four source IDs returned by previous search_web or read_urls results. Use this before relying on a source for detailed or high-stakes claims.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: { type: 'string' }
        },
        reason: { type: 'string' }
      },
      required: ['source_ids']
    }
  },
  {
    name: 'read_urls',
    description:
      'Read up to four public HTTP or HTTPS pages supplied by the user or identified by the agent when a direct URL is more precise than a search. This returns readable page text and source metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        urls: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: { type: 'string' }
        },
        reason: { type: 'string' }
      },
      required: ['urls']
    }
  },
  {
    name: 'fetch_visual_assets',
    description:
      'Find and validate real public images or website icons for website and motion work. The result includes exact kern-asset tokens that can be embedded in the final artifact. Use only when a real visual would improve the requested subject; logo and vector outputs should not embed raster assets.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['query']
    }
  }
]

function strings(
  value: unknown,
  limit: number,
  minimumLength = 2
): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length >= minimumLength)
    )
  ).slice(0, limit)
}

function sourceSummary(source: ResearchSource): Record<string, unknown> {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    snippet: source.snippet.slice(0, 520),
    ...(source.pageContent
      ? { page_content: source.pageContent.slice(0, 5_500), full_text: true }
      : { full_text: false }),
    ...(source.retrievedAt ? { retrieved_at: source.retrievedAt } : {})
  }
}

function assetSummary(asset: FetchedVisualAsset): Record<string, unknown> {
  return {
    token: asset.token,
    kind: asset.kind,
    title: asset.title,
    page_url: asset.pageUrl,
    source_url: asset.sourceUrl,
    content_type: asset.contentType,
    width: asset.width,
    height: asset.height
  }
}

function searchDescription(queryCount: number): AgentToolDescription {
  return {
    kind: 'research',
    label: queryCount > 1 ? 'Searching several angles' : 'Searching the live web',
    detail:
      queryCount > 1
        ? `Checking ${queryCount} focused queries in parallel`
        : 'Checking the live web for current, relevant evidence'
  }
}

export function describeAgentTool(call: AgentToolCall): AgentToolDescription {
  if (call.name === 'search_web') {
    const queries = strings(call.arguments.queries, 4, 3)
    return {
      ...searchDescription(queries.length || 1),
      detail: queries.length
        ? queries.map((query, index) => `${index + 1}. ${query}`).join(' | ')
        : 'Preparing a live search'
    }
  }
  if (call.name === 'read_web_pages') {
    const ids = strings(call.arguments.source_ids, 4, 2)
    return {
      kind: 'research',
      label: 'Reading primary sources',
      detail: ids.length
        ? `Opening ${ids.length} ${ids.length === 1 ? 'source' : 'sources'} beyond the search excerpt`
        : 'Opening the strongest available sources'
    }
  }
  if (call.name === 'read_urls') {
    const urls = strings(call.arguments.urls, 4, 8)
    return {
      kind: 'research',
      label: 'Reading the supplied pages',
      detail: urls.length
        ? `Extracting readable evidence from ${urls.length} ${urls.length === 1 ? 'URL' : 'URLs'}`
        : 'Checking supplied URLs'
    }
  }
  return {
    kind: 'fetch',
    label: 'Finding real visual material',
    detail: 'Validating public page media and website icons for the artifact'
  }
}

export async function executeAgentTool(
  call: AgentToolCall,
  state: AgentToolState,
  signal: AbortSignal
): Promise<AgentToolExecution> {
  const description = describeAgentTool(call)
  if (call.name === 'search_web') {
    const queries = strings(call.arguments.queries, 4, 3)
    if (!queries.length) throw new Error('search_web needs at least one query.')
    const sources = await researchWeb(queries, signal)
    return {
      ...description,
      sources,
      content: JSON.stringify({
        tool: call.name,
        source_count: sources.length,
        sources: sources.map(sourceSummary)
      })
    }
  }

  if (call.name === 'read_web_pages') {
    const ids = strings(call.arguments.source_ids, 4, 2)
    if (!ids.length) throw new Error('read_web_pages needs source_ids.')
    if (!state.sources.some((source) => ids.includes(source.id))) {
      throw new Error('None of those source IDs exist in this run.')
    }
    const sources = await readWebSources(state.sources, ids, signal)
    return {
      ...description,
      sources,
      content: JSON.stringify({
        tool: call.name,
        requested: ids,
        source_count: sources.length,
        sources: sources.map(sourceSummary)
      })
    }
  }

  if (call.name === 'read_urls') {
    const urls = strings(call.arguments.urls, 4, 8)
    if (!urls.length) throw new Error('read_urls needs at least one public URL.')
    const sources = await readPublicUrls(urls, signal)
    return {
      ...description,
      sources,
      content: JSON.stringify({
        tool: call.name,
        requested: urls,
        source_count: sources.length,
        sources: sources.map(sourceSummary)
      })
    }
  }

  if (call.name === 'fetch_visual_assets') {
    const query =
      typeof call.arguments.query === 'string'
        ? call.arguments.query.trim()
        : ''
    const assetQuery = query || extractWebUrls(state.sources[0]?.url ?? '')[0]
    if (!assetQuery) {
      throw new Error('fetch_visual_assets needs a visual subject or URL.')
    }
    const assets = await fetchWebAssets(assetQuery, signal)
    const sources = Array.from(
      new Map(
        assets.map((asset) => [
          asset.pageUrl,
          {
            id: `asset-page-${asset.id}`,
            title: asset.title,
            url: asset.pageUrl,
            publisher: (() => {
              try {
                return new URL(asset.pageUrl).hostname.replace(/^www\./, '')
              } catch {
                return 'Web'
              }
            })(),
            snippet: `Visual source for ${asset.title}.`,
            retrievedAt: new Date().toISOString()
          } satisfies ResearchSource
        ])
      ).values()
    )
    return {
      ...description,
      sources,
      assets,
      content: JSON.stringify({
        tool: call.name,
        query: assetQuery,
        asset_count: assets.length,
        assets: assets.map(assetSummary),
        usage:
          assets.length > 0
            ? 'Use the exact kern-asset token in the artifact and credit page_url.'
            : 'No accurate public visual passed validation. Do not substitute an unrelated stock image.'
      })
    }
  }

  throw new Error(`Unknown tool: ${call.name}`)
}
