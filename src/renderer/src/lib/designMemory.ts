import type {
  AppProject,
  DesignAudit,
  DesignFingerprint,
  DesignIssue,
  DesignMode,
  RecentDesignSummary
} from '../../../shared/types'

function desktopFingerprint(
  project: AppProject
): DesignFingerprint | undefined {
  return project.audit?.viewports.find(
    (viewport) => viewport.viewport === 'desktop'
  )?.fingerprint
}

function projectFingerprint(
  project: AppProject,
  cache?: Map<string, { revision: number; fingerprint: DesignFingerprint }>
): DesignFingerprint | undefined {
  const stored = desktopFingerprint(project)
  if (stored) return stored
  const cached = cache?.get(project.id)
  return cached?.revision === project.revision
    ? cached.fingerprint
    : undefined
}

export function buildRecentDesignSummaries(
  projects: AppProject[],
  currentProjectId: string,
  designMode: DesignMode = 'website',
  limit = 4
): RecentDesignSummary[] {
  return [...projects]
    .filter(
      (project) =>
        project.id !== currentProjectId &&
        project.designMode === designMode &&
        Boolean(project.designHtml.trim())
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .flatMap((project) => {
      const fingerprint = desktopFingerprint(project)
      return fingerprint
        ? [
            {
              title: project.title,
              fingerprint,
              ...(project.audit?.palette.length
                ? { palette: project.audit.palette.slice(0, 6) }
                : {}),
              ...(project.audit?.fonts.length
                ? { fonts: project.audit.fonts.slice(0, 4) }
                : {})
            }
          ]
        : []
    })
    .slice(0, limit)
}

export function buildRecentDesignCandidates(
  projects: AppProject[],
  currentProjectId: string,
  designMode: DesignMode = 'website',
  limit = 3
): AppProject[] {
  return [...projects]
    .filter(
      (project) =>
        project.id !== currentProjectId &&
        project.designMode === designMode &&
        Boolean(project.designHtml.trim())
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
}

function colorPolarity(value: string): 'dark' | 'light' | 'mid' | 'transparent' {
  const normalized = value.trim().toLowerCase()
  if (
    !normalized ||
    normalized === 'none' ||
    normalized === 'transparent' ||
    normalized === 'currentcolor'
  ) {
    return 'transparent'
  }
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])(?:[0-9a-f])?$/i.exec(
    normalized
  )
  const longHex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/i.exec(
    normalized
  )
  const match = shortHex
    ? shortHex.slice(1, 4).map((part) => Number.parseInt(part + part, 16))
    : longHex
      ? longHex.slice(1, 4).map((part) => Number.parseInt(part, 16))
      : null
  if (!match) return 'mid'
  const [red = 0, green = 0, blue = 0] = match
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance < 0.32 ? 'dark' : luminance > 0.74 ? 'light' : 'mid'
}

function vectorFingerprint(html: string): DesignFingerprint | undefined {
  const documentNode = new DOMParser().parseFromString(html, 'image/svg+xml')
  const svg = documentNode.querySelector('svg')
  if (!svg) return undefined
  const viewBox = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const viewWidth = Math.abs(viewBox[2] ?? 0)
  const viewHeight = Math.abs(viewBox[3] ?? 0)
  const aspect =
    !viewWidth || !viewHeight
      ? 'free'
      : Math.abs(viewWidth / viewHeight - 1) < 0.08
        ? 'square'
        : viewWidth > viewHeight
          ? 'landscape'
          : 'portrait'
  const drawable = Array.from(
    svg.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')
  )
  const textCount = svg.querySelectorAll('text').length
  const curvedCount = drawable.filter((element) =>
    /[cCsSqQtTaA]/.test(element.getAttribute('d') ?? '')
  ).length
  const outlineCount = drawable.filter((element) => {
    const stroke = element.getAttribute('stroke')
    return Boolean(stroke && stroke !== 'none')
  }).length
  const geometry =
    textCount > 0 && drawable.length < 3
      ? 'typographic'
      : curvedCount > drawable.length * 0.55
        ? 'curved'
        : drawable.length > 0
          ? 'geometric'
          : 'minimal'
  const rootFill = svg.getAttribute('fill') ?? ''
  const filledSurface = Array.from(svg.querySelectorAll('rect')).find(
    (element) => {
      const width = Number(element.getAttribute('width'))
      const height = Number(element.getAttribute('height'))
      return width >= viewWidth * 0.9 || height >= viewHeight * 0.9
    }
  )
  const background = colorPolarity(rootFill || filledSurface?.getAttribute('fill') || '')
  const density =
    drawable.length > 18
      ? 'dense'
      : drawable.length > 5
        ? 'balanced'
        : 'sparse'
  return {
    hero: `vector-${geometry}-${aspect}`,
    media:
      outlineCount > drawable.length / 2
        ? 'outline-vector'
        : 'filled-vector',
    typography: textCount > 0 ? 'vector-lettering' : 'vector-symbol',
    background,
    density,
    sectionCount: 0
  }
}

function motionFingerprint(html: string): DesignFingerprint {
  const duration = Number(/\bduration\s*:\s*([\d.]+)/i.exec(html)?.[1] ?? 0)
  const usesImages = /\bdrawImage\s*\(/.test(html)
  const usesType = /\bfillText\s*\(|\bstrokeText\s*\(/.test(html)
  const usesShapes =
    /\b(?:arc|ellipse|lineTo|bezierCurveTo|quadraticCurveTo|rect)\s*\(/.test(
      html
    )
  const drawCalls = (
    html.match(
      /\b(?:fillRect|strokeRect|beginPath|fill|stroke|drawImage|fillText|lineTo|arc|ellipse|rect)\s*\(/g
    ) ?? []
  ).length
  const background =
    colorPolarity(
      /\bfillStyle\s*=\s*['"]([^'"]+)['"]/i.exec(html)?.[1] ?? ''
    ) || 'mid'
  return {
    hero: `motion-${duration < 5 ? 'short' : duration < 10 ? 'medium' : 'long'}`,
    media: usesImages
      ? 'image-canvas'
      : usesShapes
        ? 'shape-canvas'
        : 'type-canvas',
    typography: usesType ? 'canvas-lettering' : 'canvas-symbol',
    background,
    density:
      drawCalls > 24 ? 'dense' : drawCalls > 9 ? 'balanced' : 'sparse',
    sectionCount: 1
  }
}

export function fingerprintArtifactDesign(
  html: string,
  designMode: DesignMode
): DesignFingerprint | undefined {
  if (!html.trim()) return undefined
  if (designMode === 'motion') return motionFingerprint(html)
  if (designMode === 'logo' || designMode === 'vector') {
    return vectorFingerprint(html)
  }
  return undefined
}

function fingerprintDistance(
  current: DesignFingerprint,
  previous: DesignFingerprint
): { score: number; matches: string[] } {
  let score = 0
  const matches: string[] = []
  if (current.hero === previous.hero) {
    score += 2
    matches.push('opening structure')
  }
  if (current.media === previous.media) {
    score += 2
    matches.push('media strategy')
  }
  if (current.background === previous.background) {
    score += 1
    matches.push('background polarity')
  }
  if (current.typography === previous.typography) {
    score += 1
    matches.push('typography character')
  }
  if (current.density === previous.density) {
    score += 1
    matches.push('content density')
  }
  return { score, matches }
}

export function applyDesignMemoryReview(
  audit: DesignAudit,
  projects: AppProject[],
  currentProjectId: string,
  cache?: Map<string, { revision: number; fingerprint: DesignFingerprint }>
): DesignAudit {
  const current = audit.viewports.find(
    (viewport) => viewport.viewport === 'desktop'
  )?.fingerprint
  if (!current) return audit

  let strongest:
    | {
        title: string
        score: number
        matches: string[]
      }
    | undefined

  for (const project of projects) {
    if (project.id === currentProjectId) continue
    const fingerprint = projectFingerprint(project, cache)
    if (!fingerprint) continue
    const comparison = fingerprintDistance(current, fingerprint)
    if (!strongest || comparison.score > strongest.score) {
      strongest = {
        title: project.title,
        score: comparison.score,
        matches: comparison.matches
      }
    }
  }

  if (!strongest || strongest.score < 4) return audit

  const issue: DesignIssue = {
    id: 'desktop-repeated-design-direction',
    viewport: 'desktop',
    severity: 'warning',
    rule: 'repeated-design-direction',
    title: 'Repeated design direction',
    detail: `This page repeats the ${strongest.matches
      .slice(0, 3)
      .join(', ')} used by “${strongest.title}”. Change the opening composition and visual material so the new brief does not inherit the previous project's structure.`
  }

  return {
    ...audit,
    issueCount: audit.issueCount + 1,
    issues: [...audit.issues, issue],
    viewports: audit.viewports.map((viewport) =>
      viewport.viewport === 'desktop'
        ? { ...viewport, issues: [...viewport.issues, issue] }
        : viewport
    )
  }
}
