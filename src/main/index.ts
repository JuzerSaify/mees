import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
  type WebContents
} from 'electron'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IPC_CHANNELS,
  PROVIDER_IDS,
  type AgentActivity,
  type AgentQuestion,
  type AgentReferenceImage,
  type AgentRunTelemetry,
  type AgentTelemetrySpan,
  type AgentStreamEvent,
  type ArtifactRuntimeReport,
  type DesignMemoryEntry,
  type EvidenceItem,
  type ReferenceVisualSummary,
  type AgentToolMetrics,
  type AppProject,
  type DesignMode,
  type DesignSelection,
  type FetchedVisualAsset,
  type PreferencesUpdate,
  type ProviderId,
  type RecentDesignSummary,
  type ResearchSource,
  type StartAgentRequest,
  type TokenUsage
} from '../shared/types'
import {
  listModels,
  runAgentTurn,
  type AgentConversationMessage
} from './providers'
import { MeesStore } from './store'
import { compactAgentHistory } from './context'
import {
  getEffortSupport,
  isEffortLevel,
  normalizeEffort
} from '../shared/effort'
import {
  AGENT_TOOLS,
  describeAgentTool,
  executeAgentTool
} from './agent-tools'
import {
  ASSET_PROTOCOL,
  assetFileNameFromUrl,
  isAssetUrl,
  type AssetStore
} from './asset-store'
import { captureArtifactRuntime } from './artifact-runtime'
import { attachSourceIcons } from './source-icons'
import { migrateLegacyUserData } from './user-data-migration'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  initializeUpdater,
  installUpdate,
  scheduleAutomaticUpdateCheck
} from './updater'

const currentDirectory = fileURLToPath(new URL('.', import.meta.url))
const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)
const hasIsolatedUserData = !app.isPackaged && Boolean(process.env.MEES_USER_DATA_DIR)
const legacyUserDataFolder = 'kern'

let mainWindow: BrowserWindow | null = null
let store: MeesStore
app.setName('Mees')
protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

if (hasIsolatedUserData && process.env.MEES_USER_DATA_DIR) {
  app.setPath('userData', process.env.MEES_USER_DATA_DIR)
}

const agentRequests = new Map<
  string,
  { controller: AbortController; sender: WebContents }
>()
const previewWindows = new Set<BrowserWindow>()

async function registerDefaultAssetProtocol(assets: AssetStore): Promise<void> {
  await session.defaultSession.protocol.handle(
    ASSET_PROTOCOL,
    async (request) => {
      const fileName = assetFileNameFromUrl(request.url)
      const asset = fileName ? await assets.read(fileName) : null
      if (!asset) return new Response('Asset not found', { status: 404 })
      return new Response(asset.bytes, {
        status: 200,
        headers: {
          'Content-Type': asset.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      })
    }
  )
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function openTrustedExternal(value: unknown): void {
  const url = safeExternalUrl(value)
  if (url) void shell.openExternal(url)
}

function exportFileBase(title: string, fallback: string): string {
  return (
    title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || fallback
  )
}

async function recordMotionVideo(
  html: string,
  title: string
): Promise<Buffer> {
  const recorderWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      offscreen: true
    }
  })

  try {
    await recorderWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    )
    await new Promise((resolve) => setTimeout(resolve, 800))
    const result = (await recorderWindow.webContents.executeJavaScript(
      `(async()=>{
        const motion=window.MEES_MOTION;
        const canvas=document.querySelector('canvas');
        if(!motion||!canvas||typeof motion.renderAt!=='function'){
          throw new Error('This motion document does not expose the required renderAt timeline.');
        }
        const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||min));
        const width=clamp(canvas.width||motion.width||1280,320,1920);
        const height=clamp(canvas.height||motion.height||720,180,1080);
        const fps=clamp(motion.fps||30,24,60);
        const duration=clamp(motion.duration||8,3,15);
        canvas.width=width;
        canvas.height=height;
        motion.pause?.();
        const candidates=[
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm'
        ];
        const mimeType=candidates.find((type)=>MediaRecorder.isTypeSupported(type))||'video/webm';
        const stream=canvas.captureStream(fps);
        const recorder=new MediaRecorder(stream,{
          mimeType,
          videoBitsPerSecond: Math.round(width*height*fps*0.12)
        });
        const chunks=[];
        recorder.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data)};
        recorder.start();
        const startedAt=performance.now();
        await new Promise((resolve)=>{
          const frame=()=>{
            const elapsed=Math.min(duration,(performance.now()-startedAt)/1000);
            motion.renderAt(elapsed);
            if(elapsed<duration)setTimeout(frame,Math.max(1,1000/fps));
            else resolve();
          };
          frame();
        });
        motion.renderAt(duration);
        await new Promise((resolve)=>setTimeout(resolve,180));
        await new Promise((resolve)=>{recorder.onstop=resolve;recorder.stop();});
        stream.getTracks().forEach((track)=>track.stop());
        const blob=new Blob(chunks,{type:mimeType});
        const bytes=new Uint8Array(await blob.arrayBuffer());
        let binary='';
        for(let offset=0;offset<bytes.length;offset+=0x8000){
          binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
        }
        return {base64:btoa(binary),mimeType,duration,width,height};
      })()`,
      true
    )) as {
      base64?: string
      mimeType?: string
      duration?: number
      width?: number
      height?: number
    }
    if (!result?.base64) {
      throw new Error('The motion renderer returned an empty video.')
    }
    return Buffer.from(result.base64, 'base64')
  } finally {
    recorderWindow.destroy()
  }
}

function sendAgentEvent(sender: WebContents, event: AgentStreamEvent): void {
  if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.agentEvent, event)
}

function newActivity(
  kind: AgentActivity['kind'],
  label: string,
  detail?: string
): AgentActivity {
  return {
    id: randomUUID(),
    kind,
    label,
    detail,
    status: 'running',
    startedAt: new Date().toISOString()
  }
}

function finishActivity(
  activity: AgentActivity,
  status: Exclude<AgentActivity['status'], 'running'>,
  detail?: string,
  result?: Pick<AgentActivity, 'sources'>
): AgentActivity {
  const finishedAt = new Date().toISOString()
  return {
    ...activity,
    ...result,
    status,
    detail: detail ?? activity.detail,
    finishedAt,
    durationMs: Math.max(
      0,
      new Date(finishedAt).getTime() - new Date(activity.startedAt).getTime()
    )
  }
}

function startTelemetrySpan(
  stage: AgentTelemetrySpan['stage'],
  label: string,
  detail?: string
): AgentTelemetrySpan {
  return {
    id: randomUUID(),
    stage,
    label,
    detail,
    status: 'running',
    startedAt: new Date().toISOString()
  }
}

function finishTelemetrySpan(
  span: AgentTelemetrySpan,
  status: Exclude<AgentTelemetrySpan['status'], 'running'>,
  detail?: string
): AgentTelemetrySpan {
  const finishedAt = new Date().toISOString()
  return {
    ...span,
    status,
    detail: detail ?? span.detail,
    finishedAt,
    durationMs: Math.max(
      0,
      new Date(finishedAt).getTime() - new Date(span.startedAt).getTime()
    )
  }
}

function upsertTelemetrySpan(
  spans: AgentTelemetrySpan[],
  span: AgentTelemetrySpan
): AgentTelemetrySpan[] {
  const index = spans.findIndex((entry) => entry.id === span.id)
  if (index === -1) return [...spans, span]
  return spans.map((entry, entryIndex) =>
    entryIndex === index ? span : entry
  )
}

async function persistAgentAsset(
  asset: FetchedVisualAsset
): Promise<FetchedVisualAsset & { previousToken?: string }> {
  if (!asset.dataUrl.startsWith('data:')) {
    return { ...asset, dataUrl: asset.token }
  }
  const stored = await store.assetStore.saveDataUrl(asset.dataUrl, 'asset')
  if (!stored) return asset
  return {
    ...asset,
    token: stored.token,
    dataUrl: stored.token,
    previousToken: asset.token
  }
}

function combineUsage(...usages: Array<TokenUsage | undefined>): TokenUsage | undefined {
  const inputTokens = usages.reduce(
    (total, usage) => total + (usage?.inputTokens ?? 0),
    0
  )
  const outputTokens = usages.reduce(
    (total, usage) => total + (usage?.outputTokens ?? 0),
    0
  )
  if (inputTokens === 0 && outputTokens === 0) return undefined
  return {
    inputTokens: inputTokens || undefined,
    outputTokens: outputTokens || undefined
  }
}

function mergeResearchSources(
  current: ResearchSource[],
  incoming: ResearchSource[],
  limit = 12
): ResearchSource[] {
  const merged = new Map<string, ResearchSource>()
  for (const source of [...current, ...incoming]) {
    const key = source.url.toLocaleLowerCase('en')
    const existing = merged.get(key)
    merged.set(
      key,
      existing
        ? {
            ...existing,
            ...source,
            snippet: source.snippet || existing.snippet,
            pageContent: source.pageContent ?? existing.pageContent,
            retrievedAt: source.retrievedAt ?? existing.retrievedAt
          }
        : source
    )
  }
  return [...merged.values()].slice(0, limit)
}

function mergeFetchedAssets(
  current: FetchedVisualAsset[],
  incoming: FetchedVisualAsset[],
  limit = 8
): FetchedVisualAsset[] {
  const merged = new Map<string, FetchedVisualAsset>()
  for (const asset of [...current, ...incoming]) {
    merged.set(asset.token || asset.sourceUrl, asset)
  }
  return [...merged.values()].slice(0, limit)
}

function validateProvider(value: unknown): ProviderId {
  if (typeof value !== 'string' || !PROVIDER_IDS.includes(value as ProviderId)) {
    throw new Error('Choose a supported provider.')
  }
  return value as ProviderId
}

function validateApiKey(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Paste an API key.')
  const key = value.trim()
  if (key.length < 8 || key.length > 4096) throw new Error('That API key looks incomplete.')
  return key
}

function validateDesignMode(value: unknown): DesignMode {
  return value === 'logo' || value === 'vector' || value === 'motion'
    ? value
    : 'website'
}

function sanitizeDesignSelection(value: unknown): DesignSelection | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const selector =
    typeof record.selector === 'string' ? record.selector.trim() : ''
  const tag = typeof record.tag === 'string' ? record.tag.trim() : ''
  const html = typeof record.html === 'string' ? record.html.trim() : ''
  if (
    !selector ||
    selector.length > 500 ||
    !tag ||
    tag.length > 40 ||
    !html ||
    html.length > 40_000
  ) {
    throw new Error('The selected element is no longer usable.')
  }
  const rect = record.rect && typeof record.rect === 'object'
    ? (record.rect as Record<string, unknown>)
    : null
  const number = (input: unknown): number =>
    typeof input === 'number' && Number.isFinite(input) ? input : 0
  return {
    selector,
    tag,
    label:
      typeof record.label === 'string'
        ? record.label.trim().slice(0, 180)
        : tag,
    text:
      typeof record.text === 'string' ? record.text.trim().slice(0, 4_000) : '',
    html,
    styles:
      typeof record.styles === 'string'
        ? record.styles.trim().slice(0, 12_000)
        : undefined,
    rect: rect
      ? {
          x: number(rect.x),
          y: number(rect.y),
          width: number(rect.width),
          height: number(rect.height)
        }
      : undefined
  }
}

function sanitizeReferenceImages(value: unknown): AgentReferenceImage[] {
  if (!Array.isArray(value)) return []
  const images: AgentReferenceImage[] = []
  for (const entry of value.slice(0, 4)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const dataUrl =
      typeof record.dataUrl === 'string' ? record.dataUrl.trim() : ''
    const match =
      /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(
        dataUrl
      )
    const stored = assetFileNameFromUrl(dataUrl)
    if ((!match?.[1] || !match[2]) && !stored) continue
    if (dataUrl.length > 4_500_000) continue
    const width =
      typeof record.width === 'number' && Number.isFinite(record.width)
        ? Math.round(record.width)
        : 0
    const height =
      typeof record.height === 'number' && Number.isFinite(record.height)
        ? Math.round(record.height)
        : 0
    if (width < 24 || height < 24 || width > 4096 || height > 4096) continue
    const mimeType = (
      match?.[1]?.toLocaleLowerCase('en') ?? 'image/webp'
    ) as
      | 'image/png'
      | 'image/jpeg'
      | 'image/webp'
    const summary =
      record.visualSummary && typeof record.visualSummary === 'object'
        ? sanitizeReferenceVisualSummary(record.visualSummary)
        : undefined
    images.push({
      id:
        typeof record.id === 'string' && record.id.trim()
          ? record.id.trim().slice(0, 80)
          : randomUUID(),
      name:
        typeof record.name === 'string' && record.name.trim()
          ? record.name.trim().slice(0, 120)
          : `Reference ${images.length + 1}`,
      mimeType,
      width,
      height,
      dataUrl,
      ...(summary ? { visualSummary: summary } : {})
    })
  }
  return images
}

function sanitizeReferenceVisualSummary(
  value: unknown
): ReferenceVisualSummary | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (
    typeof record.imageId !== 'string' ||
    typeof record.name !== 'string' ||
    !Array.isArray(record.palette)
  ) {
    return undefined
  }
  const number = (input: unknown, min: number, max: number): number =>
    typeof input === 'number' && Number.isFinite(input)
      ? Math.max(min, Math.min(max, input))
      : 0
  return {
    imageId: record.imageId.slice(0, 80),
    name: record.name.slice(0, 120),
    width: Math.round(number(record.width, 1, 20_000)),
    height: Math.round(number(record.height, 1, 20_000)),
    aspectRatio: number(record.aspectRatio, 0.01, 100),
    palette: record.palette
      .filter(
        (color): color is string =>
          typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
      )
      .slice(0, 8),
    averageLuminance: number(record.averageLuminance, 0, 1),
    contrast: number(record.contrast, 0, 1),
    colorfulness: number(record.colorfulness, 0, 1),
    edgeDensity: number(record.edgeDensity, 0, 1),
    transparent: record.transparent === true
  }
}

function sanitizeRecentDesigns(value: unknown): RecentDesignSummary[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object'
    )
    .flatMap((entry) => {
      const fingerprint =
        entry.fingerprint && typeof entry.fingerprint === 'object'
          ? (entry.fingerprint as Record<string, unknown>)
          : null
      if (
        typeof entry.title !== 'string' ||
        !fingerprint ||
        typeof fingerprint.hero !== 'string' ||
        typeof fingerprint.media !== 'string' ||
        typeof fingerprint.typography !== 'string' ||
        typeof fingerprint.background !== 'string' ||
        typeof fingerprint.density !== 'string'
      ) {
        return []
      }
      return [
        {
          title: entry.title.trim().slice(0, 120),
          fingerprint: {
            hero: fingerprint.hero.slice(0, 40),
            media: fingerprint.media.slice(0, 40),
            typography: fingerprint.typography.slice(0, 60),
            background: fingerprint.background.slice(0, 40),
            density: fingerprint.density.slice(0, 40),
            sectionCount:
              typeof fingerprint.sectionCount === 'number' &&
              Number.isFinite(fingerprint.sectionCount)
                ? Math.max(0, Math.min(40, fingerprint.sectionCount))
                : 0
          }
        }
      ]
    })
    .slice(0, 4)
}

function sanitizeDesignMemory(value: unknown): DesignMemoryEntry[] {
  if (!Array.isArray(value)) return []
  const allowedKinds = new Set<DesignMemoryEntry['kind']>([
    'brand-kit',
    'palette',
    'typography',
    'logo',
    'asset',
    'component'
  ])
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object'
    )
    .flatMap((entry) => {
      const designMode = entry.designMode
      if (
        typeof entry.id !== 'string' ||
        typeof entry.name !== 'string' ||
        typeof entry.kind !== 'string' ||
        !allowedKinds.has(entry.kind as DesignMemoryEntry['kind']) ||
        (designMode !== 'website' &&
          designMode !== 'logo' &&
          designMode !== 'vector' &&
          designMode !== 'motion')
      ) {
        return []
      }
      return [
        {
          id: entry.id.slice(0, 80),
          kind: entry.kind as DesignMemoryEntry['kind'],
          name: entry.name.trim().slice(0, 80),
          designMode: designMode as DesignMode,
          palette: Array.isArray(entry.palette)
            ? entry.palette
                .filter(
                  (color): color is string =>
                    typeof color === 'string' &&
                    /^#[0-9a-f]{6}$/i.test(color)
                )
                .slice(0, 8)
            : [],
          fonts: Array.isArray(entry.fonts)
            ? entry.fonts
                .filter((font): font is string => typeof font === 'string')
                .slice(0, 4)
            : [],
          ...(entry.fingerprint && typeof entry.fingerprint === 'object'
            ? {
                fingerprint:
                  entry.fingerprint as DesignMemoryEntry['fingerprint']
              }
            : {}),
          ...(typeof entry.sourceProjectId === 'string'
            ? { sourceProjectId: entry.sourceProjectId.slice(0, 80) }
            : {}),
          ...(typeof entry.sourceTitle === 'string'
            ? { sourceTitle: entry.sourceTitle.slice(0, 120) }
            : {}),
          ...(typeof entry.artifactHtml === 'string'
            ? { artifactHtml: entry.artifactHtml.slice(0, 180_000) }
            : {}),
          ...(Array.isArray(entry.assetUrls)
            ? {
                assetUrls: entry.assetUrls
                  .filter(
                    (value): value is string =>
                      typeof value === 'string' && isAssetUrl(value)
                  )
                  .map((value) => value.slice(0, 400))
                  .slice(0, 8)
              }
            : {}),
          createdAt:
            typeof entry.createdAt === 'string'
              ? entry.createdAt
              : new Date().toISOString()
        }
      ]
    })
    .slice(0, 6)
}

function sanitizeAgentRequest(value: unknown): StartAgentRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid generation request.')
  const request = value as Record<string, unknown>
  const provider = validateProvider(request.provider)
  if (typeof request.model !== 'string' || !request.model.trim()) {
    throw new Error('Choose a model first.')
  }
  const model = request.model.trim()
  if (request.effort !== undefined) {
    const effort = getEffortSupport(provider, model)
    if (
      !isEffortLevel(request.effort) ||
      !effort.options.some((option) => option.value === request.effort)
    ) {
      throw new Error('That effort level is not supported by this model.')
    }
  }
  if (!Array.isArray(request.history) || request.history.length === 0) {
    throw new Error('Add a brief before starting.')
  }

  const history = request.history
    .slice(-30)
    .filter(
      (entry): entry is { role: 'user' | 'assistant'; content: string } =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        ((entry as Record<string, unknown>).role === 'user' ||
          (entry as Record<string, unknown>).role === 'assistant') &&
        typeof (entry as Record<string, unknown>).content === 'string'
    )
    .map((entry) => {
      const referenceImages = sanitizeReferenceImages(
        (entry as Record<string, unknown>).referenceImages
      )
      return {
        role: entry.role,
        content: entry.content.slice(0, 80_000),
        ...(referenceImages.length ? { referenceImages } : {})
      }
    })

  if (history.length === 0) throw new Error('Add a brief before starting.')
  let remainingReferenceImages = 4
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]
    if (!message) continue
    const images = (message.referenceImages ?? []).slice(
      0,
      Math.max(0, remainingReferenceImages)
    )
    remainingReferenceImages -= images.length
    if (images.length) message.referenceImages = images
    else delete message.referenceImages
  }
  const target = sanitizeDesignSelection(request.target)
  const designMode = validateDesignMode(request.designMode)
  const mode =
    request.mode === 'polish'
      ? 'polish'
      : request.mode === 'targeted-edit' && target
        ? 'targeted-edit'
        : 'design'

  return {
    provider,
    model,
    effort:
      normalizeEffort(provider, model, request.effort) ?? undefined,
    history,
    currentDesign:
      typeof request.currentDesign === 'string'
        ? request.currentDesign.slice(0, 240_000)
        : '',
    designMode,
    mode,
    reviewNotes:
      typeof request.reviewNotes === 'string'
        ? request.reviewNotes.slice(0, 8000)
        : undefined,
    target: mode === 'targeted-edit' ? target : undefined,
    recentDesigns: sanitizeRecentDesigns(request.recentDesigns),
    referenceVisuals: Array.isArray(request.referenceVisuals)
      ? request.referenceVisuals
          .slice(0, 8)
          .map((entry) => sanitizeReferenceVisualSummary(entry))
          .filter(
            (entry): entry is ReferenceVisualSummary => Boolean(entry)
          )
      : history
          .flatMap((message) => message.referenceImages ?? [])
          .flatMap((image) =>
            image.visualSummary ? [image.visualSummary] : []
          )
          .slice(0, 8),
    designMemory: sanitizeDesignMemory(request.designMemory)
  }
}

async function createMainWindow(): Promise<void> {
  const iconPath = isDevelopment
    ? join(process.cwd(), 'build/icon.png')
    : join(app.getAppPath(), 'build/icon.png')

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: '#E9E6DF',
    title: 'Mees',
    icon: iconPath,
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'darwin'
        ? undefined
        : {
            color: '#E9E6DF',
            symbolColor: '#21190F',
            height: 48
          },
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })

  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openTrustedExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() ?? ''
    if (url === currentUrl) return
    event.preventDefault()
    openTrustedExternal(url)
  })

  mainWindow.webContents.on('render-process-gone', () => {
    for (const [id, request] of agentRequests) {
      if (request.sender === mainWindow?.webContents) {
        request.controller.abort()
        agentRequests.delete(id)
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    for (const [id, request] of agentRequests) {
      if (request.sender.isDestroyed()) {
        request.controller.abort()
        agentRequests.delete(id)
      }
    }
  })

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(currentDirectory, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getState, async () => store.getSnapshot())

  ipcMain.handle(
    IPC_CHANNELS.connectProvider,
    async (_event, rawProvider: unknown, rawKey: unknown) => {
      const provider = validateProvider(rawProvider)
      const apiKey = validateApiKey(rawKey)
      const models = await listModels(provider, apiKey)
      if (models.length === 0) {
        throw new Error('No text models are available for this API key.')
      }

      const encryptedApiKey = await store.encryptApiKey(apiKey)
      await store.saveEncryptedProvider(
        provider,
        encryptedApiKey,
        `...${apiKey.slice(-4)}`,
        models
      )
      return store.getSnapshot()
    }
  )

  ipcMain.handle(IPC_CHANNELS.disconnectProvider, async (_event, rawProvider: unknown) => {
    const provider = validateProvider(rawProvider)
    await store.disconnectProvider(provider)
    return store.getSnapshot()
  })

  ipcMain.handle(IPC_CHANNELS.refreshModels, async (_event, rawProvider: unknown) => {
    const provider = validateProvider(rawProvider)
    const apiKey = await store.getApiKey(provider)
    const models = await listModels(provider, apiKey)
    if (models.length === 0) throw new Error('No text models are available for this API key.')
    await store.updateProviderModels(provider, models)
    return store.getSnapshot()
  })

  ipcMain.handle(
    IPC_CHANNELS.selectModel,
    async (_event, rawProvider: unknown, rawModel: unknown) => {
      const provider = validateProvider(rawProvider)
      if (typeof rawModel !== 'string' || !rawModel.trim()) {
        throw new Error('Choose a model.')
      }
      await store.selectModel(provider, rawModel)
      return store.getSnapshot()
    }
  )

  ipcMain.handle(IPC_CHANNELS.savePreferences, async (_event, rawUpdate: unknown) => {
    if (!rawUpdate || typeof rawUpdate !== 'object') throw new Error('Invalid preferences.')
    const update = rawUpdate as PreferencesUpdate
    await store.savePreferences(update)
    return store.getSnapshot()
  })

  ipcMain.handle(IPC_CHANNELS.saveProject, async (_event, rawProject: unknown) => {
    if (!rawProject || typeof rawProject !== 'object') throw new Error('Invalid project.')
    return store.saveProject(rawProject as AppProject)
  })

  ipcMain.handle(IPC_CHANNELS.deleteProject, async (_event, rawProjectId: unknown) => {
    if (typeof rawProjectId !== 'string') throw new Error('Invalid project.')
    await store.deleteProject(rawProjectId)
  })

  ipcMain.handle(
    IPC_CHANNELS.captureArtifact,
    async (
      _event,
      rawHtml: unknown,
      rawMode: unknown
    ): Promise<ArtifactRuntimeReport> => {
      if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
        throw new Error('There is no rendered artifact to inspect.')
      }
      if (rawHtml.length > 300_000) {
        throw new Error('The rendered artifact is too large to inspect.')
      }
      return captureArtifactRuntime(
        rawHtml,
        validateDesignMode(rawMode),
        store.assetStore
      )
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.saveDesignMemory,
    async (_event, rawEntry: unknown) => {
      if (!rawEntry || typeof rawEntry !== 'object') {
        throw new Error('Invalid design memory entry.')
      }
      await store.saveDesignMemory(rawEntry as DesignMemoryEntry)
      return store.getSnapshot()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.deleteDesignMemory,
    async (_event, rawEntryId: unknown) => {
      if (typeof rawEntryId !== 'string' || !rawEntryId.trim()) {
        throw new Error('Invalid design memory entry.')
      }
      await store.deleteDesignMemory(rawEntryId)
      return store.getSnapshot()
    }
  )

  ipcMain.handle(IPC_CHANNELS.startAgent, async (event, rawRequest: unknown) => {
    const inputRequest = sanitizeAgentRequest(rawRequest)
    const snapshot = await store.getSnapshot()
    const providerStatus = snapshot.settings.providers.find(
      (provider) => provider.provider === inputRequest.provider
    )
    if (!providerStatus?.connected) throw new Error('Reconnect this provider in Settings.')
    const modelInfo = providerStatus.models.find(
      (model) => model.id === inputRequest.model
    )
    if (!modelInfo) {
      throw new Error('That model is no longer available. Refresh the provider first.')
    }
    if (
      modelInfo.supportsImages === false &&
      inputRequest.history.some((message) => message.referenceImages?.length)
    ) {
      throw new Error(
        'This model accepts text only. Choose an image-capable model before using reference images.'
      )
    }

    const hydratedHistory = await Promise.all(
      inputRequest.history.map(async (message) => ({
        ...message,
        ...(message.referenceImages?.length
          ? {
              referenceImages: await Promise.all(
                message.referenceImages.map(async (image) => ({
                  ...image,
                  dataUrl:
                    (await store.assetStore.toDataUrl(image.dataUrl)) ??
                    image.dataUrl
                }))
              )
            }
          : {})
      }))
    )
    const compacted = compactAgentHistory(hydratedHistory, {
      contextWindow: modelInfo.contextWindow,
      currentDesignChars: inputRequest.currentDesign.length
    })
    const request: StartAgentRequest = {
      ...inputRequest,
      history: compacted.history
    }
    const apiKey = await store.getApiKey(request.provider)
    const requestId = randomUUID()
    const controller = new AbortController()
    agentRequests.set(requestId, { controller, sender: event.sender })

    void (async () => {
      const conversation: AgentConversationMessage[] = request.history.map(
        (message) => ({
          role: message.role,
          content: message.content,
          ...(message.referenceImages?.length
            ? { referenceImages: message.referenceImages }
            : {})
        })
      )
      const referenceAssets: Record<string, string> = {}
      for (const message of inputRequest.history) {
        for (const image of message.referenceImages ?? []) {
          const token = isAssetUrl(image.dataUrl)
            ? image.dataUrl
            : (
                await store.assetStore.saveDataUrl(
                  image.dataUrl,
                  'reference'
                )
              )?.token
          if (token) referenceAssets[image.id] = token
        }
      }
      const toolState = {
        sources: [] as ResearchSource[],
        assets: [] as FetchedVisualAsset[],
        evidence: [] as EvidenceItem[],
        currentDesign: inputRequest.currentDesign,
        designMode: inputRequest.designMode,
        referenceAssets,
        readAsset: async (token: string) => {
          const fileName = assetFileNameFromUrl(token)
          if (!fileName) return null
          const asset = await store.assetStore.read(fileName)
          return asset
            ? { bytes: asset.bytes, contentType: asset.contentType }
            : null
        },
        writeAsset: async (
          bytes: Uint8Array,
          contentType: string,
          metadata: {
            title: string
            pageUrl?: string
            sourceUrl?: string
            width?: number
            height?: number
            kind?: FetchedVisualAsset['kind']
            role?: FetchedVisualAsset['role']
          }
        ): Promise<FetchedVisualAsset> => {
          const stored = await store.assetStore.saveBytes(
            bytes,
            contentType,
            metadata.role ?? 'derived'
          )
          const id = stored.fileName.replace(/\.[^.]+$/, '')
          return {
            id,
            token: stored.token,
            kind: metadata.kind ?? 'image',
            title: metadata.title.slice(0, 180),
            pageUrl: metadata.pageUrl ?? stored.token,
            sourceUrl: metadata.sourceUrl ?? stored.token,
            contentType: stored.contentType,
            byteLength: stored.byteLength,
            width: metadata.width,
            height: metadata.height,
            dataUrl: stored.token,
            role: metadata.role ?? 'derived'
          }
        },
        inspectArtifact: (html: string) =>
          captureArtifactRuntime(
            html,
            inputRequest.designMode,
            store.assetStore
          )
      }
      const harnessStartedAt = Date.now()
      const harnessStats = {
        rounds: 0,
        parallelBatches: 0,
        queries: 0,
        toolCalls: 0,
        pagesRead: 0
      }
      const telemetry: AgentRunTelemetry = {
        requestStartedAt: new Date(harnessStartedAt).toISOString(),
        spans: []
      }
      let usage: TokenUsage | undefined
      let writeSpan: AgentTelemetrySpan | null = null
      let writeFinished = false
      let completed = false
      let streamedModelText = ''

      const emitActivity = (activity: AgentActivity): void => {
        if (controller.signal.aborted || event.sender.isDestroyed()) return
        sendAgentEvent(event.sender, {
          requestId,
          type: 'activity',
          activity
        })
      }

      const emitTelemetry = (): void => {
        if (controller.signal.aborted || event.sender.isDestroyed()) return
        sendAgentEvent(event.sender, {
          requestId,
          type: 'telemetry',
          telemetry: {
            ...telemetry,
            spans: [...telemetry.spans]
          }
        })
      }

      const startWriting = (): void => {
        if (writeSpan || writeFinished) return
        writeSpan = startTelemetrySpan(
          'write',
          'Streaming the artifact',
          'Writing the provider response into the canvas'
        )
        telemetry.spans = upsertTelemetrySpan(
          telemetry.spans,
          writeSpan
        )
        emitTelemetry()
      }

      const finishWriting = (
        status: 'complete' | 'error' | 'cancelled',
        detail: string
      ): void => {
        if (!writeSpan || writeFinished) return
        writeFinished = true
        writeSpan = finishTelemetrySpan(writeSpan, status, detail)
        telemetry.spans = upsertTelemetrySpan(
          telemetry.spans,
          writeSpan
        )
        emitTelemetry()
      }

      try {
        const maxToolSteps = 12
        for (let step = 0; step <= maxToolSteps; step += 1) {
          if (controller.signal.aborted) {
            throw new DOMException('Request cancelled', 'AbortError')
          }
          const modelSpan = startTelemetrySpan(
            'model',
            step === 0 ? 'Understanding the brief' : 'Continuing the agent loop',
            `Provider turn ${step + 1}`
          )
          const modelActivity = newActivity(
            'compose',
            step === 0
              ? 'Understanding the brief'
              : 'Continuing the agent loop',
            `Provider turn ${step + 1}`
          )
          emitActivity(modelActivity)
          telemetry.spans = upsertTelemetrySpan(
            telemetry.spans,
            modelSpan
          )
          emitTelemetry()
          let turn
          try {
            turn = await runAgentTurn({
              provider: request.provider,
              model: request.model,
              effort: request.effort,
              apiKey,
              currentDesign: request.currentDesign,
              designMode: request.designMode,
              mode: request.mode,
              reviewNotes: request.reviewNotes,
              target: request.target,
              recentDesigns: request.recentDesigns,
              referenceVisuals: request.referenceVisuals,
              designMemory: request.designMemory,
              purpose:
                request.mode === 'targeted-edit' ? 'targeted-edit' : 'design',
              messages: conversation,
              tools: step < maxToolSteps ? AGENT_TOOLS : [],
              signal: controller.signal,
              onProviderEvent: (providerEvent) => {
                const detail =
                  providerEvent.type === 'retry'
                    ? `Provider ${providerEvent.status ?? 'error'}; retrying as attempt ${providerEvent.attempt} after ${Math.round((providerEvent.delayMs ?? 0) / 100) / 10}s`
                    : providerEvent.type === 'connected'
                      ? `Provider connected on attempt ${providerEvent.attempt}${providerEvent.status ? ` (${providerEvent.status})` : ''}`
                      : `Sending provider request, attempt ${providerEvent.attempt}`
                telemetry.spans = telemetry.spans.map((span) =>
                  span.id === modelSpan.id ? { ...span, detail } : span
                )
                emitTelemetry()
              },
              onDelta: (delta) => {
                if (controller.signal.aborted || event.sender.isDestroyed()) return
                streamedModelText += delta
                if (!telemetry.firstTokenAt) {
                  telemetry.firstTokenAt = new Date().toISOString()
                  emitTelemetry()
                }
                if (
                  /:::\s*design\b|<design\b|<!doctype\s+html\b|<html\b|<svg\b/i.test(
                    streamedModelText
                  )
                ) {
                  startWriting()
                }
                sendAgentEvent(event.sender, {
                  requestId,
                  type: 'delta',
                  delta
                })
              }
            })
            telemetry.spans = upsertTelemetrySpan(
              telemetry.spans,
              finishTelemetrySpan(
                modelSpan,
                'complete',
                turn.toolCalls.length
                  ? `${turn.toolCalls.length} tool ${
                      turn.toolCalls.length === 1 ? 'call' : 'calls'
                    } selected`
                  : 'Model response returned'
              )
            )
            emitActivity(
              finishActivity(
                modelActivity,
                'complete',
                turn.toolCalls.length
                  ? `${turn.toolCalls.length} next ${
                      turn.toolCalls.length === 1 ? 'tool' : 'tools'
                    } selected`
                  : 'Response returned'
              )
            )
            emitTelemetry()
          } catch (error) {
            telemetry.spans = upsertTelemetrySpan(
              telemetry.spans,
              finishTelemetrySpan(
                modelSpan,
                controller.signal.aborted ? 'cancelled' : 'error',
                error instanceof Error ? error.message.slice(0, 240) : undefined
              )
            )
            emitActivity(
              finishActivity(
                modelActivity,
                controller.signal.aborted ? 'cancelled' : 'error',
                error instanceof Error
                  ? error.message.slice(0, 240)
                  : undefined
              )
            )
            emitTelemetry()
            throw error
          }
          usage = combineUsage(usage, turn.usage)

          if (turn.toolCalls.length === 0) {
            if (!turn.text.trim()) {
              throw new Error(
                'The agent finished without returning a response or using a tool.'
              )
            }
            completed = true
            break
          }

          conversation.push({
            role: 'assistant',
            content: turn.text,
            toolCalls: turn.toolCalls
          })
          harnessStats.rounds += 1
          harnessStats.toolCalls += turn.toolCalls.length
          if (turn.toolCalls.length > 1) {
            harnessStats.parallelBatches += 1
          }
          for (const call of turn.toolCalls) {
            if (call.name === 'search_web') {
              harnessStats.queries += Array.isArray(call.arguments.queries)
                ? call.arguments.queries.filter(
                    (value): value is string => typeof value === 'string'
                  ).length
                : 0
            } else if (call.name === 'fetch_visual_assets') {
              harnessStats.queries += 1
            }
          }

          let pendingQuestion: AgentQuestion | undefined
          const results = await Promise.all(
            turn.toolCalls.map(async (call) => {
              const description = describeAgentTool(call)
              const activity = newActivity(
                description.kind,
                description.label,
                description.detail
              )
              emitActivity(activity)
              const telemetrySpan = startTelemetrySpan(
                'tool',
                description.label,
                description.detail
              )
              telemetry.spans = upsertTelemetrySpan(
                telemetry.spans,
                telemetrySpan
              )
              emitTelemetry()
              try {
                const execution = await executeAgentTool(
                  call,
                  toolState,
                  controller.signal
                )
                telemetry.spans = upsertTelemetrySpan(
                  telemetry.spans,
                  finishTelemetrySpan(
                    telemetrySpan,
                    'complete',
                    execution.content.slice(0, 220)
                  )
                )
                emitTelemetry()
                return { call, activity, execution }
              } catch (error) {
                telemetry.spans = upsertTelemetrySpan(
                  telemetry.spans,
                  finishTelemetrySpan(
                    telemetrySpan,
                    controller.signal.aborted ? 'cancelled' : 'error',
                    error instanceof Error
                      ? error.message.slice(0, 240)
                      : undefined
                  )
                )
                emitTelemetry()
                return { call, activity, error }
              }
            })
          )

          for (const result of results) {
            if ('execution' in result && result.execution) {
              const execution = result.execution
              if (execution.assets?.length) {
                const persistedAssets = await Promise.all(
                  execution.assets.map(async (asset) => {
                    const persisted = await persistAgentAsset(asset)
                    if (
                      persisted.previousToken &&
                      persisted.previousToken !== persisted.token
                    ) {
                      execution.content = execution.content
                        .split(persisted.previousToken)
                        .join(persisted.token)
                    }
                    const { previousToken: _previousToken, ...clean } =
                      persisted
                    return clean
                  })
                )
                execution.assets = persistedAssets
              }
              if (execution.sources?.length) {
                execution.sources = await attachSourceIcons(
                  execution.sources,
                  store.assetStore
                )
                toolState.sources = mergeResearchSources(
                  toolState.sources,
                  execution.sources
                )
                harnessStats.pagesRead += execution.sources.filter(
                  (source) => Boolean(source.pageContent)
                ).length
              }
              if (execution.assets?.length) {
                toolState.assets = mergeFetchedAssets(
                  toolState.assets,
                  execution.assets
                )
                if (!event.sender.isDestroyed()) {
                  sendAgentEvent(event.sender, {
                    requestId,
                    type: 'assets',
                    assets: toolState.assets
                  })
                }
              }
              if (execution.evidence?.length) {
                toolState.evidence = Array.from(
                  new Map(
                    [
                      ...(toolState.evidence ?? []),
                      ...execution.evidence
                    ].map((item) => [item.id, item])
                  ).values()
                ).slice(-24)
                if (!event.sender.isDestroyed()) {
                  sendAgentEvent(event.sender, {
                    requestId,
                    type: 'evidence',
                    evidence: toolState.evidence
                  })
                }
              }
              if (execution.question) {
                pendingQuestion = execution.question
              }
              const sourceCount = execution.sources?.length ?? 0
              const assetCount = execution.assets?.length ?? 0
              const detail =
                result.call.name === 'search_web'
                  ? sourceCount
                    ? `${sourceCount} ${
                        sourceCount === 1 ? 'source' : 'sources'
                      } returned from the live search`
                    : 'No usable search results were returned'
                  : result.call.name === 'fetch_visual_assets'
                    ? assetCount
                      ? `${assetCount} ${
                          assetCount === 1 ? 'visual' : 'visuals'
                        } validated for the artifact`
                      : 'No accurate public visual passed validation'
                    : sourceCount
                      ? `${sourceCount} ${
                          sourceCount === 1 ? 'page' : 'pages'
                        } read beyond the search excerpt`
                      : 'No readable page text was returned'
              emitActivity(
                finishActivity(result.activity, 'complete', detail, {
                  sources: execution.sources
                })
              )
              conversation.push({
                role: 'tool',
                toolCallId: result.call.id,
                toolName: result.call.name,
                content: execution.content
              })
            } else {
              const message =
                result.error instanceof Error
                  ? result.error.message.slice(0, 500)
                  : 'The tool could not complete.'
              if (!controller.signal.aborted) {
                emitActivity(
                  finishActivity(result.activity, 'error', message)
                )
              }
              conversation.push({
                role: 'tool',
                toolCallId: result.call.id,
                toolName: result.call.name,
                content: JSON.stringify({
                  tool: result.call.name,
                  ok: false,
                  error: message
                })
              })
            }
          }

          if (pendingQuestion) {
            finishWriting('complete', 'Waiting for the blocking decision')
            telemetry.completedAt = new Date().toISOString()
            telemetry.spans = telemetry.spans.map((span) =>
              span.status === 'running'
                ? finishTelemetrySpan(
                    span,
                    'complete',
                    'Waiting for the user decision'
                  )
                : span
            )
            emitTelemetry()
            sendAgentEvent(event.sender, {
              requestId,
              type: 'question',
              question: pendingQuestion
            })
            return
          }
        }

        if (!completed) {
          throw new Error('The agent reached its tool limit without a final response.')
        }
        finishWriting('complete', 'Response complete')
        telemetry.completedAt = new Date().toISOString()
        emitTelemetry()
        if (controller.signal.aborted) {
          sendAgentEvent(event.sender, { requestId, type: 'cancelled' })
        } else {
          const firstTokenMs = telemetry.firstTokenAt
            ? new Date(telemetry.firstTokenAt).getTime() -
              harnessStartedAt
            : undefined
          const toolDurationMs = telemetry.spans
            .filter(
              (span) =>
                span.stage === 'tool' && span.status === 'complete'
            )
            .reduce((total, span) => total + (span.durationMs ?? 0), 0)
          const writeDurationMs = telemetry.spans
            .filter(
              (span) =>
                span.stage === 'write' && span.status === 'complete'
            )
            .reduce((total, span) => total + (span.durationMs ?? 0), 0)
          const metrics: AgentToolMetrics = {
            rounds: harnessStats.rounds,
            parallelBatches: harnessStats.parallelBatches,
            queries: harnessStats.queries,
            toolCalls: harnessStats.toolCalls,
            pagesRead: harnessStats.pagesRead,
            sources: toolState.sources.length,
            fetchedAssets: toolState.assets.length,
            evidenceItems:
              toolState.sources.length +
              toolState.assets.length +
              toolState.evidence.length,
            claims: toolState.evidence.length,
            conflicts: toolState.evidence.filter(
              (item) => item.verdict === 'conflicting'
            ).length,
            durationMs: Date.now() - harnessStartedAt,
            ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
            toolDurationMs,
            writeDurationMs
          }
          sendAgentEvent(event.sender, {
            requestId,
            type: 'done',
            usage,
            metrics
          })
        }
      } catch (error) {
        if (controller.signal.aborted) {
          finishWriting('cancelled', 'Stopped')
          telemetry.completedAt = new Date().toISOString()
          telemetry.spans = telemetry.spans.map((span) =>
            span.status === 'running'
              ? finishTelemetrySpan(span, 'cancelled', 'Stopped')
              : span
          )
          emitTelemetry()
          sendAgentEvent(event.sender, { requestId, type: 'cancelled' })
          return
        }
        const message =
          error instanceof Error
            ? error.message
            : 'The provider request failed unexpectedly.'
        finishWriting('error', message.slice(0, 500))
        telemetry.completedAt = new Date().toISOString()
        telemetry.spans = telemetry.spans.map((span) =>
          span.status === 'running'
            ? finishTelemetrySpan(span, 'error', message.slice(0, 240))
            : span
        )
        emitTelemetry()
        sendAgentEvent(event.sender, {
          requestId,
          type: 'error',
          error: message.slice(0, 1000)
        })
      } finally {
        agentRequests.delete(requestId)
      }
    })()

    return { requestId }
  })

  ipcMain.handle(IPC_CHANNELS.cancelAgent, async (_event, rawRequestId: unknown) => {
    if (typeof rawRequestId !== 'string') return
    agentRequests.get(rawRequestId)?.controller.abort()
  })

  ipcMain.handle(
    IPC_CHANNELS.exportHtml,
    async (
      _event,
      rawHtml: unknown,
      rawTitle: unknown,
      rawDesignMode: unknown
    ) => {
      if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
        throw new Error('There is no design to export yet.')
      }
      const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : 'Mees design'
      const designMode = validateDesignMode(rawDesignMode)
      const isVector = designMode === 'logo' || designMode === 'vector'
      const filename = `${exportFileBase(title, 'mees-design')}.${
        isVector ? 'svg' : 'html'
      }`

      const options: Electron.SaveDialogOptions = {
        title: isVector ? 'Export SVG' : 'Export design',
        defaultPath: join(app.getPath('documents'), filename),
        filters: [
          isVector
            ? { name: 'SVG artwork', extensions: ['svg'] }
            : { name: 'HTML document', extensions: ['html'] }
        ]
      }
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { saved: false }
      const exportedHtml = await store.assetStore.hydrateHtml(rawHtml)
      await writeFile(result.filePath, exportedHtml, 'utf8')
      return { saved: true, filePath: result.filePath }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.exportMotion,
    async (_event, rawHtml: unknown, rawTitle: unknown) => {
      if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
        throw new Error('There is no motion design to export yet.')
      }
      const title =
        typeof rawTitle === 'string' && rawTitle.trim()
          ? rawTitle.trim()
          : 'Mees motion'
      const filename = `${exportFileBase(title, 'mees-motion')}.webm`
      const options: Electron.SaveDialogOptions = {
        title: 'Export silent motion video',
        defaultPath: join(app.getPath('documents'), filename),
        filters: [{ name: 'WebM video', extensions: ['webm'] }]
      }
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { saved: false }
      const buffer = await recordMotionVideo(rawHtml, title)
      await writeFile(result.filePath, buffer)
      return { saved: true, filePath: result.filePath }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.openPreview,
    async (_event, rawHtml: unknown, rawTitle: unknown) => {
      if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
        throw new Error('There is no design to preview yet.')
      }
      const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : 'Mees preview'
      const previewWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 390,
        minHeight: 520,
        title,
        backgroundColor: '#FFFFFF',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      })
      previewWindows.add(previewWindow)
      previewWindow.on('closed', () => previewWindows.delete(previewWindow))
      previewWindow.webContents.setWindowOpenHandler(({ url }) => {
        openTrustedExternal(url)
        return { action: 'deny' }
      })
      previewWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('data:text/html')) return
        event.preventDefault()
        openTrustedExternal(url)
      })
      await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(rawHtml)}`)
    }
  )

  ipcMain.handle(IPC_CHANNELS.openDataFolder, async () => {
    const error = await shell.openPath(store.dataDirectory)
    if (error) throw new Error(`Could not open the data folder: ${error}`)
  })

  ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, rawUrl: unknown) => {
    const url = safeExternalUrl(rawUrl)
    if (!url) throw new Error('Only http and https links can be opened.')
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC_CHANNELS.getUpdateState, () => getUpdateState())
  ipcMain.handle(IPC_CHANNELS.checkForUpdates, () => checkForUpdates())
  ipcMain.handle(IPC_CHANNELS.downloadUpdate, () => downloadUpdate())
  ipcMain.handle(IPC_CHANNELS.installUpdate, () => installUpdate())
}

async function boot(): Promise<void> {
  app.setAppUserModelId('studio.mees.desktop')
  if (!hasIsolatedUserData) {
    try {
      await migrateLegacyUserData(
        join(app.getPath('appData'), legacyUserDataFolder),
        app.getPath('userData')
      )
    } catch (error) {
      console.warn('Could not migrate legacy app data.', error)
    }
  }
  store = new MeesStore()
  await store.init()
  await registerDefaultAssetProtocol(store.assetStore)
  registerIpc()
  initializeUpdater(() => mainWindow?.webContents ?? null)

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  await createMainWindow()
  scheduleAutomaticUpdateCheck()
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(boot).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('Mees could not start', message)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    for (const [id, request] of agentRequests) {
      request.controller.abort()
      agentRequests.delete(id)
    }
    for (const preview of previewWindows) preview.close()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    for (const [id, request] of agentRequests) {
      request.controller.abort()
      agentRequests.delete(id)
    }
  })
}
