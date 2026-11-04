import type {
  AgentActivityKind,
  AgentQuestion,
  ArtifactRuntimeReport,
  DesignMode,
  EvidenceItem,
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
import {
  cropAsset,
  extractPalette,
  optimizeAsset,
  vectorizeAsset,
  type ImageAssetInput
} from './agent-media'
import {
  assessEvidence,
  type EvidenceClaimInput
} from './evidence'

export interface AgentToolState {
  sources: ResearchSource[]
  assets: FetchedVisualAsset[]
  evidence?: EvidenceItem[]
  currentDesign?: string
  designMode?: DesignMode
  referenceAssets?: Record<string, string>
  readAsset?: (token: string) => Promise<ImageAssetInput | null>
  writeAsset?: (
    bytes: Uint8Array,
    contentType: string,
    metadata: {
      title: string
      description?: string
      pageUrl?: string
      sourceUrl?: string
      width?: number
      height?: number
      kind?: FetchedVisualAsset['kind']
      role?: FetchedVisualAsset['role']
      provider?: FetchedVisualAsset['provider']
      creator?: string
      license?: string
      licenseUrl?: string
      attribution?: string
    }
  ) => Promise<FetchedVisualAsset>
  resolveSiteIcon?: (site: string) => Promise<{
    host: string
    token: string
    sourceUrl: string
    contentType: string
    byteLength: number
  } | null>
  inspectArtifact?: (html: string) => Promise<ArtifactRuntimeReport>
  inspectVisuals?: (
    input: {
      assets: Array<{
        asset: FetchedVisualAsset
        bytes: Buffer
        contentType: string
      }>
      question: string
    },
    signal: AbortSignal
  ) => Promise<string>
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
  evidence?: EvidenceItem[]
  question?: AgentQuestion
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
      'Find and validate real public images or website icons with creator and license metadata. Website and motion artifacts can embed the returned token when the image matches the subject. Logo and vector artifacts may use it only for measured reference, palette, crop or vector tracing, never as an embedded raster. Use when a real subject visual would materially improve the work.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['query']
    }
  },
  {
    name: 'inspect_visual_assets',
    description:
      'Inspect up to three fetched or user-supplied images with the active multimodal model before using them. Returns a subject-match and composition assessment. Use this whenever the exact subject, crop or visual relevance is uncertain; do not use it for decorative images with no factual subject.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sources: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string' }
        },
        question: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['sources', 'question']
    }
  },
  {
    name: 'resolve_site_icon',
    description:
      'Resolve a public website\'s real icon, logo mark or brand symbol and return an exact mees-asset token. Use this for a favicon or brand mark only when the named site is relevant to the brief; do not present a third-party icon as the user\'s own brand.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        site: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['site']
    }
  },
  {
    name: 'inspect_artifact',
    description:
      'Run the current artifact in a real browser, inspect its DOM, accessibility, console, resources and responsive overflow, then capture opening, midpoint and final Motion frames when relevant. When the active model supports vision, inspect the captured frames for composition, subject match, depth, legibility and generated-looking visual shortcuts. Use this when revising an existing artifact and runtime evidence would prevent a bad repair.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: { type: 'string' }
      }
    }
  },
  {
    name: 'evaluate_evidence',
    description:
      'Evaluate claims against source IDs returned by web tools. Returns source quality, freshness, direct support, and conflicts so the artifact cites defensible facts. Use after research for any factual claim that will appear in the design.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        claims: {
          type: 'array',
          minItems: 1,
          maxItems: 16,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claim: { type: 'string' },
              source_ids: {
                type: 'array',
                minItems: 0,
                maxItems: 4,
                items: { type: 'string' }
              }
            },
            required: ['claim', 'source_ids']
          }
        },
        reason: { type: 'string' }
      },
      required: ['claims']
    }
  },
  {
    name: 'ask_user',
    description:
      'Ask one concise decision question only when a genuinely missing fact blocks a credible result and cannot be inferred safely. Provide two to four concrete options. Do not use this for stylistic preferences, routine assumptions or permission to call a tool.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        rationale: { type: 'string' },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              description: { type: 'string' },
              recommended: { type: 'boolean' }
            },
            required: ['label']
          }
        }
      },
      required: ['prompt', 'options']
    }
  },
  {
    name: 'crop_asset',
    description:
      'Crop a fetched, derived or user reference image to a precise aspect ratio and produce a new real asset token. Source accepts a mees-asset token or reference:<id>. Use focus to keep the meaningful subject area.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string' },
        aspect_ratio: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        focus: {
          type: 'string',
          enum: ['center', 'top', 'bottom', 'left', 'right']
        },
        reason: { type: 'string' }
      },
      required: ['source']
    }
  },
  {
    name: 'optimize_asset',
    description:
      'Resize and compress a raster asset into an optimized WebP token without changing its subject. Use before embedding a large fetched image in a website or motion canvas.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string' },
        max_width: { type: 'number' },
        quality: { type: 'number' },
        reason: { type: 'string' }
      },
      required: ['source']
    }
  },
  {
    name: 'extract_palette',
    description:
      'Measure dominant colors, luminance, contrast and colorfulness from a source image. Use the returned measured palette to build a grounded visual direction instead of guessing colors.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string' },
        colors: { type: 'number' },
        reason: { type: 'string' }
      },
      required: ['source']
    }
  },
  {
    name: 'vectorize_asset',
    description:
      'Create an editable posterized SVG approximation from a raster source. This is useful for marks, diagrams and simple visual references, not for photoreal faces or text that must remain typographically exact.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string' },
        title: { type: 'string' },
        width: { type: 'number' },
        colors: { type: 'number' },
        reason: { type: 'string' }
      },
      required: ['source']
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
    ...(source.retrievedAt ? { retrieved_at: source.retrievedAt } : {}),
    ...(source.publishedAt ? { published_at: source.publishedAt } : {}),
    ...(source.quality ? { source_quality: source.quality } : {})
  }
}

function assetSummary(asset: FetchedVisualAsset): Record<string, unknown> {
  return {
    token: asset.token,
    kind: asset.kind,
    title: asset.title,
    description: asset.description,
    page_url: asset.pageUrl,
    source_url: asset.sourceUrl,
    content_type: asset.contentType,
    width: asset.width,
    height: asset.height,
    provider: asset.provider,
    creator: asset.creator,
    license: asset.license,
    license_url: asset.licenseUrl,
    attribution: asset.attribution,
    ...(asset.role ? { role: asset.role } : {})
  }
}

function finiteNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback
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
  if (call.name === 'resolve_site_icon') {
    return {
      kind: 'fetch',
      label: 'Resolving the real site icon',
      detail:
        typeof call.arguments.site === 'string'
          ? call.arguments.site.slice(0, 180)
          : 'Checking the site for its published icon'
    }
  }
  if (call.name === 'inspect_visual_assets') {
    return {
      kind: 'inspect',
      label: 'Checking visual candidates',
      detail:
        'Comparing subject, crop and visual role with the active multimodal model'
    }
  }
  if (call.name === 'inspect_artifact') {
    return {
      kind: 'inspect',
      label: 'Inspecting the rendered artifact',
      detail:
        'Checking the mode-specific render surface, accessibility, console and runtime state'
    }
  }
  if (call.name === 'evaluate_evidence') {
    return {
      kind: 'evidence',
      label: 'Checking claims against sources',
      detail: 'Scoring direct support, source quality, freshness and conflicts'
    }
  }
  if (call.name === 'ask_user') {
    return {
      kind: 'clarify',
      label: 'Checking one blocking detail',
      detail:
        typeof call.arguments.prompt === 'string'
          ? call.arguments.prompt.slice(0, 180)
          : 'Preparing one focused question'
    }
  }
  if (call.name === 'crop_asset') {
    return {
      kind: 'transform',
      label: 'Cropping a real asset',
      detail: 'Fitting the selected source to the requested composition'
    }
  }
  if (call.name === 'optimize_asset') {
    return {
      kind: 'transform',
      label: 'Optimizing a real asset',
      detail: 'Resizing and compressing the source for the rendered artifact'
    }
  }
  if (call.name === 'extract_palette') {
    return {
      kind: 'inspect',
      label: 'Measuring the source palette',
      detail: 'Reading dominant colors, contrast and color character'
    }
  }
  if (call.name === 'vectorize_asset') {
    return {
      kind: 'transform',
      label: 'Tracing the source to vector',
      detail: 'Building an editable posterized SVG approximation'
    }
  }
  return {
    kind: 'fetch',
    label: 'Finding real visual material',
    detail: 'Validating public page media and website icons for the artifact'
  }
}

async function imageSource(
  state: AgentToolState,
  rawSource: unknown
): Promise<{
  token: string
  input: ImageAssetInput
  title: string
  pageUrl: string
  sourceUrl: string
}> {
  if (typeof rawSource !== 'string' || !rawSource.trim()) {
    throw new Error('Choose a fetched asset or reference image first.')
  }
  const requested = rawSource.trim()
  const referenceId = requested.startsWith('reference:')
    ? requested.slice('reference:'.length)
    : requested
  const token =
    state.referenceAssets?.[referenceId] ??
    state.referenceAssets?.[requested] ??
    requested
  if (!token.startsWith('mees-asset://asset/')) {
    throw new Error('The image operation needs a saved mees-asset token.')
  }
  if (!state.readAsset) {
    throw new Error('The local asset store is unavailable.')
  }
  const input = await state.readAsset(token)
  if (!input) throw new Error('That source asset no longer exists.')
  const known = state.assets.find((asset) => asset.token === token)
  return {
    token,
    input,
    title: known?.title ?? referenceId,
    pageUrl: known?.pageUrl ?? '',
    sourceUrl: known?.sourceUrl ?? token
  }
}

async function storeDerivedAsset(
  state: AgentToolState,
  options: {
    bytes: Uint8Array
    contentType: string
    title: string
    description?: string
    pageUrl: string
    sourceUrl: string
    width?: number
    height?: number
    kind?: FetchedVisualAsset['kind']
    provider?: FetchedVisualAsset['provider']
    creator?: string
    license?: string
    licenseUrl?: string
    attribution?: string
  }
): Promise<FetchedVisualAsset> {
  if (!state.writeAsset) {
    throw new Error('The local asset store is unavailable.')
  }
  return state.writeAsset(
    options.bytes,
    options.contentType,
    {
      title: options.title,
      description: options.description,
      pageUrl: options.pageUrl,
      sourceUrl: options.sourceUrl,
      width: options.width,
      height: options.height,
      kind: options.kind ?? 'image',
      role: 'derived',
      provider: options.provider ?? 'derived',
      creator: options.creator,
      license: options.license,
      licenseUrl: options.licenseUrl,
      attribution: options.attribution
    }
  )
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
        reference_only:
          state.designMode === 'logo' || state.designMode === 'vector',
        usage:
          assets.length > 0
            ? state.designMode === 'logo' || state.designMode === 'vector'
              ? 'Inspect or measure the returned source before drawing. Do not embed the raster in a logo or vector artifact; use its subject, palette or geometry as reference only.'
              : 'Use the exact mees-asset token in the artifact and include the returned creator and license attribution near the image.'
            : 'No accurate public visual passed validation. Do not substitute an unrelated stock image.'
      })
    }
  }

  if (call.name === 'resolve_site_icon') {
    const site =
      typeof call.arguments.site === 'string'
        ? call.arguments.site.trim()
        : ''
    if (!site) throw new Error('resolve_site_icon needs a site name or URL.')
    const resolved = await state.resolveSiteIcon?.(site)
    let assets: FetchedVisualAsset[] = []
    if (resolved) {
      const assetData = await state.readAsset?.(resolved.token)
      assets = [
        {
          id: resolved.token.split('/').pop()?.replace(/\.[^.]+$/, '') ??
            resolved.host,
          token: resolved.token,
          kind: 'icon',
          title: `${resolved.host} icon`,
          description: `Official favicon resolved directly for ${resolved.host}.`,
          pageUrl: `https://${resolved.host}/`,
          sourceUrl: resolved.sourceUrl,
          contentType: resolved.contentType,
          byteLength: resolved.byteLength,
          width: 64,
          height: 64,
          dataUrl: assetData
            ? `data:${assetData.contentType};base64,${assetData.bytes.toString('base64')}`
            : resolved.token,
          role: 'asset',
          provider: 'web-page',
          creator: resolved.host
        }
      ]
    }
    return {
      ...description,
      assets,
      content: JSON.stringify({
        tool: call.name,
        site,
        asset_count: assets.length,
        assets: assets.map(assetSummary),
        usage:
          assets.length > 0
            ? 'Use a returned icon only to identify the named third-party site. Do not claim it as the user\'s own mark.'
            : 'No validated site icon was available.'
      })
    }
  }

  if (call.name === 'inspect_visual_assets') {
    const sources = strings(call.arguments.sources, 3, 2)
    const question =
      typeof call.arguments.question === 'string'
        ? call.arguments.question.trim().slice(0, 500)
        : ''
    if (!sources.length || !question) {
      throw new Error(
        'inspect_visual_assets needs up to three source tokens and a visual question.'
      )
    }
    if (!state.inspectVisuals) {
      throw new Error(
        'Visual inspection is unavailable for the active model or provider.'
      )
    }
    const inspected = await Promise.all(
      sources.map((source) => imageSource(state, source))
    )
    const report = await state.inspectVisuals(
      {
        assets: inspected.map((item) => ({
          asset:
            state.assets.find((asset) => asset.token === item.token) ?? {
              id: item.token,
              token: item.token,
              kind: 'image',
              title: item.title,
              pageUrl: item.pageUrl,
              sourceUrl: item.sourceUrl,
              contentType: item.input.contentType,
              byteLength: item.input.bytes.byteLength,
              dataUrl: item.token
            },
          bytes: item.input.bytes,
          contentType: item.input.contentType
        })),
        question
      },
      signal
    )
    return {
      ...description,
      content: JSON.stringify({
        tool: call.name,
        question,
        inspection: report.trim().slice(0, 8_000),
        assets: inspected.map((item) => ({
          token: item.token,
          title: item.title,
          page_url: item.pageUrl,
          source_url: item.sourceUrl
        }))
      })
    }
  }

  if (call.name === 'inspect_artifact') {
    if (!state.currentDesign?.trim()) {
      throw new Error('There is no current rendered artifact to inspect.')
    }
    if (!state.inspectArtifact) {
      throw new Error('The browser inspector is unavailable in this environment.')
    }
    const mode = state.designMode ?? 'website'
    const report = await state.inspectArtifact(state.currentDesign)
    let visualReview = ''
    let visualReviewError = ''
    if (
      state.inspectVisuals &&
      state.readAsset &&
      report.screenshots.length > 0
    ) {
      try {
        const captures = (
          await Promise.all(
            report.screenshots.slice(0, 3).map(async (screenshot, index) => {
              const input = await state.readAsset?.(screenshot.assetUrl)
              if (!input) return null
              const asset: FetchedVisualAsset = {
                id: `artifact-frame-${index + 1}`,
                token: screenshot.assetUrl,
                kind: 'image',
                title:
                  screenshot.label ||
                  `${screenshot.viewport} artifact capture ${index + 1}`,
                description: `Runtime capture${
                  screenshot.time !== undefined
                    ? ` at ${screenshot.time.toFixed(2)} seconds`
                    : ''
                }.`,
                pageUrl: '',
                sourceUrl: screenshot.assetUrl,
                contentType: input.contentType,
                byteLength: input.bytes.byteLength,
                width: screenshot.width,
                height: screenshot.height,
                dataUrl: screenshot.assetUrl,
                role: 'screenshot',
                provider: 'derived'
              }
              return { asset, bytes: input.bytes, contentType: input.contentType }
            })
          )
        ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

        if (captures.length) {
          const question =
            mode === 'motion'
              ? [
                  'Review these real rendered Motion frames as a film director and visual designer.',
                  'Name the visual premise you can read from the opening, midpoint and final frame.',
                  'Check subject identity, focal hierarchy, depth and camera continuity, composition at the frame edges, typography, material and whether the animation implies a meaningful transformation rather than generic particles or effects.',
                  'Return concise, actionable repair notes. Do not invent details that are not visible.'
                ].join(' ')
              : mode === 'logo' || mode === 'vector'
                ? 'Review the captured artwork for subject specificity, silhouette, optical balance, vector legibility and generic generated-mark shortcuts. Return concise, actionable repair notes.'
                : 'Review the rendered viewport captures for hierarchy, composition, responsive integrity, readability and generated-looking shortcuts. Return concise, actionable repair notes.'
          visualReview = await state.inspectVisuals(
            { assets: captures, question },
            signal
          )
        }
      } catch (error) {
        visualReviewError =
          error instanceof Error
            ? error.message.slice(0, 240)
            : 'The visual review could not be completed.'
      }
    }
    return {
      ...description,
      content: JSON.stringify({
        tool: call.name,
        mode,
        duration_ms: report.durationMs,
        document: report.document,
        screenshots: report.screenshots.map((screenshot) => ({
          viewport: screenshot.viewport,
          width: screenshot.width,
          height: screenshot.height,
          label: screenshot.label,
          time: screenshot.time
        })),
        console_errors: report.consoleErrors,
        page_errors: report.pageErrors,
        network_failures: report.networkFailures,
        issues: report.issues.slice(0, 24),
        ...(visualReview ? { visual_review: visualReview.slice(0, 8_000) } : {}),
        ...(visualReviewError
          ? { visual_review_error: visualReviewError }
          : {})
      })
    }
  }

  if (call.name === 'evaluate_evidence') {
    const claims: EvidenceClaimInput[] = Array.isArray(call.arguments.claims)
      ? call.arguments.claims
          .filter(
            (entry): entry is Record<string, unknown> =>
              Boolean(entry) && typeof entry === 'object'
          )
          .flatMap((entry) => {
            const claim =
              typeof entry.claim === 'string' ? entry.claim.trim() : ''
            if (!claim) return []
            return [
              {
                claim: claim.slice(0, 1_200),
                source_ids: strings(entry.source_ids, 4, 2)
              }
            ]
          })
          .slice(0, 16)
      : []
    if (claims.length === 0) {
      throw new Error('evaluate_evidence needs at least one claim.')
    }
    const evidence = assessEvidence(claims, state.sources)
    state.evidence = Array.from(
      new Map(
        [...(state.evidence ?? []), ...evidence].map((item) => [
          item.id,
          item
        ])
      ).values()
    ).slice(-24)
    return {
      ...description,
      evidence,
      content: JSON.stringify({
        tool: call.name,
        claims: evidence.map((item) => ({
          id: item.id,
          claim: item.claim,
          verdict: item.verdict,
          source_ids: item.sourceIds,
          quality_score: item.qualityScore,
          freshness_score: item.freshnessScore,
          notes: item.notes,
          citations: item.citations
        })),
        usage:
          'Use supported and partial claims carefully. Resolve or omit conflicting claims. Visible citations belong in the artifact when facts came from research.'
      })
    }
  }

  if (call.name === 'ask_user') {
    const prompt =
      typeof call.arguments.prompt === 'string'
        ? call.arguments.prompt.trim()
        : ''
    const rawOptions = Array.isArray(call.arguments.options)
      ? call.arguments.options
      : []
    const options = rawOptions
      .filter(
        (option): option is Record<string, unknown> =>
          Boolean(option) && typeof option === 'object'
      )
      .flatMap((option, index) => {
        const label =
          typeof option.label === 'string' ? option.label.trim() : ''
        if (!label) return []
        return [
          {
            id: `option-${index + 1}`,
            label: label.slice(0, 100),
            ...(typeof option.description === 'string' &&
            option.description.trim()
              ? { description: option.description.trim().slice(0, 240) }
              : {}),
            ...(option.recommended === true ? { recommended: true } : {})
          }
        ]
      })
      .slice(0, 4)
    if (!prompt || options.length < 2) {
      throw new Error('ask_user needs one question and at least two options.')
    }
    const question: AgentQuestion = {
      id: `question-${call.id}`,
      prompt: prompt.slice(0, 260),
      ...(typeof call.arguments.rationale === 'string' &&
      call.arguments.rationale.trim()
        ? { rationale: call.arguments.rationale.trim().slice(0, 280) }
        : {}),
      options
    }
    return {
      ...description,
      question,
      content: JSON.stringify({
        tool: call.name,
        status: 'waiting_for_user',
        question
      })
    }
  }

  if (
    call.name === 'crop_asset' ||
    call.name === 'optimize_asset' ||
    call.name === 'extract_palette' ||
    call.name === 'vectorize_asset'
  ) {
    const source = await imageSource(state, call.arguments.source)
    if (call.name === 'extract_palette') {
      const palette = await extractPalette(
        source.input,
        finiteNumber(call.arguments.colors, 6, 2, 8)
      )
      return {
        ...description,
        content: JSON.stringify({
          tool: call.name,
          source: source.token,
          ...palette
        })
      }
    }
    if (call.name === 'crop_asset') {
      const ratioText =
        typeof call.arguments.aspect_ratio === 'string'
          ? call.arguments.aspect_ratio.trim()
          : ''
      const ratioMatch = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(
        ratioText
      )
      const ratio = ratioMatch
        ? Number(ratioMatch[1]) / Math.max(0.01, Number(ratioMatch[2]))
        : Number(ratioText) > 0
          ? Number(ratioText)
          : 1.5
      let width = finiteNumber(call.arguments.width, 0, 0, 2400)
      let height = finiteNumber(call.arguments.height, 0, 0, 2400)
      if (!width && !height) {
        width = ratio >= 1 ? 1600 : 1200
        height = Math.round(width / ratio)
      } else if (!height) {
        height = Math.round(width / ratio)
      } else if (!width) {
        width = Math.round(height * ratio)
      }
      width = Math.max(64, Math.min(2400, width))
      height = Math.max(64, Math.min(2400, height))
      const focus =
        call.arguments.focus === 'top' ||
        call.arguments.focus === 'bottom' ||
        call.arguments.focus === 'left' ||
        call.arguments.focus === 'right'
          ? call.arguments.focus
          : 'center'
      const cropped = await cropAsset(source.input, {
        width,
        height,
        focus
      })
      const asset = await storeDerivedAsset(state, {
        bytes: cropped.bytes,
        contentType: cropped.contentType,
        title: `${source.title} - cropped`,
        pageUrl: source.pageUrl,
        sourceUrl: source.sourceUrl,
        width: cropped.width,
        height: cropped.height
      })
      return {
        ...description,
        assets: [asset],
        content: JSON.stringify({
          tool: call.name,
          source: source.token,
          asset: assetSummary(asset),
          usage: 'Use the returned exact token in the artifact.'
        })
      }
    }
    if (call.name === 'optimize_asset') {
      const optimized = await optimizeAsset(source.input, {
        maxWidth: Math.round(
          finiteNumber(call.arguments.max_width, 1600, 240, 3200)
        ),
        quality: Math.round(
          finiteNumber(call.arguments.quality, 84, 45, 96)
        )
      })
      const asset = await storeDerivedAsset(state, {
        bytes: optimized.bytes,
        contentType: optimized.contentType,
        title: `${source.title} - optimized`,
        pageUrl: source.pageUrl,
        sourceUrl: source.sourceUrl,
        width: optimized.width,
        height: optimized.height
      })
      return {
        ...description,
        assets: [asset],
        content: JSON.stringify({
          tool: call.name,
          source: source.token,
          asset: assetSummary(asset),
          byte_length: optimized.bytes.byteLength,
          usage: 'Use the returned exact token in the artifact.'
        })
      }
    }
    const vector = await vectorizeAsset(source.input, {
      title:
        typeof call.arguments.title === 'string'
          ? call.arguments.title.slice(0, 140)
          : source.title,
      width: Math.round(finiteNumber(call.arguments.width, 72, 24, 120)),
      colorLimit: Math.round(finiteNumber(call.arguments.colors, 5, 3, 8))
    })
    const asset = await storeDerivedAsset(state, {
      bytes: Buffer.from(vector.svg, 'utf8'),
      contentType: 'image/svg+xml',
      title: `${source.title} - vector approximation`,
      pageUrl: source.pageUrl,
      sourceUrl: source.sourceUrl,
      width: vector.width,
      height: vector.height
    })
    return {
      ...description,
      assets: [asset],
      content: JSON.stringify({
        tool: call.name,
        source: source.token,
        asset: assetSummary(asset),
        colors: vector.colors,
        caveat:
          'This is a posterized geometric trace. Inspect typography and fine details before using it as a finished logo.'
      })
    }
  }

  throw new Error(`Unknown tool: ${call.name}`)
}
