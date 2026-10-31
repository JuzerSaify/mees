import {
  AlertCircle,
  ArrowUpRight,
  Clapperboard,
  Columns2,
  Download,
  FileCode2,
  Frame,
  Globe2,
  Layers3,
  LoaderCircle,
  Minus,
  Monitor,
  MousePointer2,
  Plus,
  PenTool,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  Smartphone,
  Shapes,
  Tablet,
  VolumeX,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppProject,
  DesignMode,
  DesignSelection
} from '../../../shared/types'
import type { AgentRunView } from '../lib/run'
import {
  injectPreviewSelectionRuntime,
  PREVIEW_SELECTION_CHANNEL,
  type PreviewSelectionMessage
} from '../lib/previewSelection'
import {
  injectMotionPreviewRuntime,
  MOTION_PREVIEW_CHANNEL,
  type MotionPreviewMessage
} from '../lib/motionPreview'
import type { InspectorTab } from './DesignInspector'

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

interface PreviewCanvasProps {
  onExport: () => void
  onOpenInspector: (tab: InspectorTab) => void
  onOpenPreview: () => void
  onRequestTargetEdit: () => void
  onRetry: () => void
  onSelectTarget: (target: DesignSelection | null) => void
  auditing: boolean
  designMode: DesignMode
  exporting: boolean
  inspectorOpen: boolean
  project: AppProject | null
  run: AgentRunView | null
  selectedTarget: DesignSelection | null
}

const viewportMeta: Record<
  ViewportMode,
  { width: number; height: number; label: string }
> = {
  desktop: { width: 1440, height: 1000, label: 'Desktop' },
  tablet: { width: 834, height: 1000, label: 'Tablet' },
  mobile: { width: 390, height: 844, label: 'Mobile' }
}

const viewportOptions: Array<{
  id: ViewportMode
  label: string
  icon: typeof Monitor
}> = [
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'tablet', label: 'Tablet', icon: Tablet },
  { id: 'mobile', label: 'Mobile', icon: Smartphone }
]

const artifactModes: Record<
  DesignMode,
  { label: string; icon: typeof Globe2 }
> = {
  website: { label: 'Website', icon: Globe2 },
  logo: { label: 'Logo', icon: PenTool },
  vector: { label: 'Vector', icon: Shapes },
  motion: { label: 'Motion', icon: Clapperboard }
}

const emptyMotionPreview = {
  ready: false,
  playing: false,
  currentTime: 0,
  duration: 0,
  fps: 0,
  width: 1280,
  height: 720,
  error: ''
}

function formatMotionTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function preparePreviewDocument(html: string, mode: DesignMode): string {
  if (!html.trim()) return ''
  if (mode === 'logo' || mode === 'vector') {
    const previewSize = mode === 'logo' ? '72' : '88'
    const wrapper = [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<style>',
      'html,body{margin:0;width:100%;height:100%;overflow:hidden}',
      'body{display:grid;place-items:center;background-color:#f4f5f2;background-image:repeating-conic-gradient(#e8ebe5 0 25%,#f6f7f4 0 50%);background-size:24px 24px}', // taste-skill-ignore
      `svg{display:block;width:${previewSize}%;height:${previewSize}%;max-width:92vh;max-height:92vw}`,
      '</style></head><body>',
      html,
      '</body></html>'
    ].join('')
    return injectPreviewSelectionRuntime(wrapper, true)
  }
  if (mode === 'motion') return injectMotionPreviewRuntime(html)
  return injectPreviewSelectionRuntime(html)
}

export function PreviewCanvas({
  auditing,
  designMode: requestedDesignMode,
  exporting,
  inspectorOpen,
  onExport,
  onOpenInspector,
  onOpenPreview,
  onRequestTargetEdit,
  onRetry,
  onSelectTarget,
  project,
  run,
  selectedTarget
}: PreviewCanvasProps): React.JSX.Element {
  const [viewport, setViewport] = useState<ViewportMode>('desktop')
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [stage, setStage] = useState({ width: 1000, height: 720 })
  const [displayedHtml, setDisplayedHtml] = useState(project?.designHtml ?? '')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectionRect, setSelectionRect] =
    useState<NonNullable<DesignSelection['rect']> | null>(
      selectedTarget?.rect ?? null
    )
  const stageRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const choseInitialViewport = useRef(false)
  const motionAutoPlayed = useRef(false)
  const lastPreviewUpdate = useRef(0)
  const designHtml = project?.designHtml ?? ''
  const designMode = requestedDesignMode
  const projectMatchesMode = project?.designMode === designMode
  const modeMeta = artifactModes[designMode]
  const ModeIcon = modeMeta.icon
  const [motionPreview, setMotionPreview] = useState(emptyMotionPreview)
  const selectionHtml = useMemo(
    () =>
      preparePreviewDocument(
        projectMatchesMode ? displayedHtml : '',
        designMode
      ),
    [designMode, displayedHtml, projectMatchesMode]
  )
  const isGenerating = run?.status === 'starting' || run?.status === 'streaming'
  const hasDesign = projectMatchesMode && Boolean(displayedHtml.trim())
  const hasError = run?.status === 'error'
  const hasQuestions =
    !hasDesign &&
    projectMatchesMode &&
    Boolean(project?.messages.at(-1)?.clarification)
  const size =
    designMode === 'website'
      ? viewportMeta[viewport]
      : designMode === 'motion'
        ? { width: 1280, height: 720, label: 'Motion' }
        : designMode === 'logo'
          ? { width: 1000, height: 1000, label: 'Logo' }
          : { width: 1200, height: 900, label: 'Vector' }
  const currentAudit =
    project && project.audit?.revision === project.revision ? project.audit : undefined
  const issueCount = currentAudit?.issueCount ?? 0
  const versionCount = project?.versions?.length ?? 0
  const sideInspector = Boolean(inspectorOpen)
  const toolsDisabled = !hasDesign || isGenerating
  const hasReferences = Boolean(
    project?.messages.some((message) => message.referenceImages?.length)
  )
  const activeActivity = [...(run?.activities ?? [])]
    .filter(
      (activity) => !['visuals', 'plan'].includes(activity.kind as string)
    )
    .reverse()
    .find((activity) => activity.status === 'running')
  const liveLabel =
    activeActivity?.kind === 'research'
      ? 'Researching'
      : activeActivity?.kind === 'fetch'
        ? 'Fetching assets'
        : activeActivity?.kind === 'write'
          ? 'Rendering'
          : activeActivity?.kind === 'review'
            ? 'Reviewing'
            : activeActivity?.kind === 'compose'
              ? 'Composing'
              : 'Working'

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setStage({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setSelectionRect(selectedTarget?.rect ?? null)
    if (!selectedTarget) {
      iframeRef.current?.contentWindow?.postMessage(
        { channel: PREVIEW_SELECTION_CHANNEL, type: 'clear' },
        '*'
      )
    }
  }, [selectedTarget])

  useEffect(() => {
    const receive = (event: MessageEvent): void => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const message = event.data as PreviewSelectionMessage
      if (!message || message.channel !== PREVIEW_SELECTION_CHANNEL) return
      if (message.type === 'ready') {
        iframeRef.current?.contentWindow?.postMessage(
          {
            channel: PREVIEW_SELECTION_CHANNEL,
            type: 'set-mode',
            active: selectionMode
          },
          '*'
        )
        if (selectionMode) {
          iframeRef.current?.contentWindow?.postMessage(
            { channel: PREVIEW_SELECTION_CHANNEL, type: 'request-rect' },
            '*'
          )
        }
        return
      }
      if (message.type === 'rect') {
        setSelectionRect(message.rect)
        return
      }
      if (message.type === 'cancelled') {
        setSelectionMode(false)
        return
      }
      if (message.type === 'selection') {
        setSelectionMode(false)
        setSelectionRect(message.target.rect ?? null)
        onSelectTarget(message.target)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [onSelectTarget, selectionMode])

  useEffect(() => {
    const receiveMotion = (event: MessageEvent): void => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!hasDesign || designMode !== 'motion') return
      const message = event.data as MotionPreviewMessage
      if (!message || message.channel !== MOTION_PREVIEW_CHANNEL) return
      if (message.type === 'error') {
        setMotionPreview((current) => ({
          ...current,
          error: message.error
        }))
        return
      }
      setMotionPreview((current) => ({
        ...current,
        ready: true,
        playing: message.playing,
        currentTime: message.currentTime,
        duration: message.metadata.duration,
        fps: message.metadata.fps,
        width: message.metadata.width,
        height: message.metadata.height,
        error: ''
      }))
      if (
        message.type === 'ready' &&
        !isGenerating &&
        !motionAutoPlayed.current
      ) {
        motionAutoPlayed.current = true
        window.setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage(
            { channel: MOTION_PREVIEW_CHANNEL, type: 'play' },
            '*'
          )
        }, 90)
      }
    }
    window.addEventListener('message', receiveMotion)
    return () => window.removeEventListener('message', receiveMotion)
  }, [designMode, hasDesign, isGenerating])

  useEffect(() => {
    motionAutoPlayed.current = false
    setMotionPreview(emptyMotionPreview)
  }, [designMode, selectionHtml])

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        channel: PREVIEW_SELECTION_CHANNEL,
        type: 'set-mode',
        active: selectionMode
      },
      '*'
    )
  }, [selectionHtml, selectionMode])

  useEffect(() => {
    setZoom('fit')
  }, [designMode, viewport])

  useEffect(() => {
    if (!isGenerating) {
      lastPreviewUpdate.current = performance.now()
      setDisplayedHtml(designHtml)
      return
    }

    const elapsed = performance.now() - lastPreviewUpdate.current
    const wait = Math.max(0, 220 - elapsed)
    const timer = window.setTimeout(() => {
      lastPreviewUpdate.current = performance.now()
      setDisplayedHtml(designHtml)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [designHtml, isGenerating])

  useEffect(() => {
    if (choseInitialViewport.current || stage.width === 1000) return
    choseInitialViewport.current = true
    if (stage.width < 560) setViewport('mobile')
  }, [stage.width])

  const availableWidth = Math.max(
    240,
    stage.width - (sideInspector ? 352 : 0)
  )
  const artifactInset = designMode === 'website' ? 0 : 48
  const availableHeight = Math.max(200, stage.height - artifactInset)
  const fitScale = Math.max(
    0.2,
    Math.min(
      1,
      availableWidth / size.width,
      designMode === 'website' ? 1 : availableHeight / size.height
    )
  )
  const appliedScale = zoom === 'fit' ? fitScale : zoom
  const percent = Math.round(appliedScale * 100)
  const selectionVisible = Boolean(
    selectedTarget &&
      selectionRect &&
      selectionRect.width > 0 &&
      selectionRect.height > 0 &&
      selectionRect.y < size.height &&
      selectionRect.y + selectionRect.height > 0
  )
  const selectionLeft = selectionRect
    ? Math.max(0, selectionRect.x * appliedScale)
    : 0
  const selectionTop = selectionRect
    ? Math.max(0, selectionRect.y * appliedScale)
    : 0
  const selectionWidth = selectionRect
    ? Math.max(1, selectionRect.width * appliedScale)
    : 0
  const selectionHeight = selectionRect
    ? Math.max(1, selectionRect.height * appliedScale)
    : 0
  const promptAbove = selectionTop > 42
  const promptLeft = Math.max(
    8,
    Math.min(
      selectionLeft + selectionWidth - 188,
      Math.max(8, size.width * appliedScale - 196)
    )
  )

  function zoomOut(): void {
    setZoom(Math.max(0.25, Math.round((appliedScale - 0.1) * 100) / 100))
  }

  function zoomIn(): void {
    setZoom(Math.min(1.5, Math.round((appliedScale + 0.1) * 100) / 100))
  }

  function controlMotion(type: 'play' | 'pause' | 'seek', time?: number): void {
    iframeRef.current?.contentWindow?.postMessage(
      { channel: MOTION_PREVIEW_CHANNEL, type, time },
      '*'
    )
  }

  useEffect(() => {
    if (!hasDesign || isGenerating) setSelectionMode(false)
  }, [hasDesign, isGenerating])

  return (
    <section className="workspace-sheet" aria-label="Design preview">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-left">
          {designMode === 'website' ? (
            <div className="segmented-control" aria-label="Preview width">
              {viewportOptions.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    aria-label={option.label}
                    aria-pressed={viewport === option.id}
                    className={`segment-button ${viewport === option.id ? 'is-active' : ''}`}
                    data-tooltip={option.label}
                    key={option.id}
                    onClick={() => setViewport(option.id)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={15} />
                  </button>
                )
              })}
            </div>
          ) : (
            <span className="artifact-mode-badge">
              <ModeIcon aria-hidden="true" size={13} />
              {modeMeta.label}
            </span>
          )}
          {designMode === 'motion' && hasDesign ? (
            <span className="motion-spec">
              <VolumeX aria-hidden="true" size={12} />
              {motionPreview.ready
                ? `${formatMotionTime(motionPreview.duration)} · ${motionPreview.fps} fps`
                : 'Preparing timeline'}
            </span>
          ) : null}
          <span className="viewport-size">
            {size.width} × {size.height}
          </span>
          {isGenerating ? (
            <span className="canvas-live-status" role="status">
              <span className="live-dot" />
              {liveLabel}
            </span>
          ) : null}
        </div>

        <div className="canvas-toolbar-right">
          <div className="zoom-control">
            <button
              aria-label="Zoom out"
              className="icon-button compact-icon"
              data-tooltip="Zoom out"
              onClick={zoomOut}
              type="button"
            >
              <Minus aria-hidden="true" size={14} />
            </button>
            <button
              aria-label="Fit design to window"
              className="zoom-value"
              data-tooltip="Fit to window"
              onClick={() => setZoom('fit')}
              type="button"
            >
              {percent}%
            </button>
            <button
              aria-label="Zoom in"
              className="icon-button compact-icon"
              data-tooltip="Zoom in"
              onClick={zoomIn}
              type="button"
            >
              <Plus aria-hidden="true" size={14} />
            </button>
          </div>

          <span className="toolbar-divider" aria-hidden="true" />

          <button
            aria-label={
              selectionMode
                ? 'Cancel element selection'
                : 'Select an element to edit'
            }
            aria-pressed={selectionMode}
            className={`toolbar-action selection-trigger ${
              selectionMode ? 'is-active' : ''
            }`}
            data-tooltip="Select element"
            disabled={toolsDisabled || designMode === 'motion'}
            onClick={() => {
              setSelectionMode((value) => !value)
              if (selectedTarget) onSelectTarget(null)
            }}
            type="button"
          >
            <MousePointer2 aria-hidden="true" size={14} />
            <span>{selectionMode ? 'Selecting' : 'Select'}</span>
          </button>

          <button
            aria-label={`Open design review${issueCount > 0 ? `, ${issueCount} issues` : ''}`}
            className="toolbar-action review-trigger"
            data-tooltip="Review"
            disabled={toolsDisabled}
            onClick={() => onOpenInspector('review')}
            type="button"
          >
            {auditing ? (
              <LoaderCircle aria-hidden="true" className="spin" size={14} />
            ) : (
              <ScanSearch aria-hidden="true" size={14} />
            )}
            <span>Review</span>
            {issueCount > 0 && !auditing ? (
              <span className="toolbar-count">{issueCount}</span>
            ) : null}
          </button>

          {hasReferences ? (
            <button
              aria-label="Compare reference images with the rendered artifact"
              className="toolbar-action"
              data-tooltip="Reference comparison"
              disabled={toolsDisabled}
              onClick={() => onOpenInspector('reference')}
              type="button"
            >
              <Columns2 aria-hidden="true" size={14} />
              <span>Reference</span>
            </button>
          ) : null}

          <button
            aria-label={`Open design versions, ${versionCount} saved`}
            className="toolbar-action"
            data-tooltip="Versions"
            disabled={toolsDisabled}
            onClick={() => onOpenInspector('versions')}
            type="button"
          >
            <Layers3 aria-hidden="true" size={14} />
            <span>Versions</span>
            {versionCount > 0 ? <span className="toolbar-count">{versionCount}</span> : null}
          </button>

          <button
            aria-label="Open generated page files"
            className="toolbar-action"
            data-tooltip="Files"
            disabled={toolsDisabled}
            onClick={() => onOpenInspector('files')}
            type="button"
          >
            <FileCode2 aria-hidden="true" size={14} />
            <span>Files</span>
          </button>

          <span className="toolbar-divider" aria-hidden="true" />

          <button
            className="toolbar-action"
            data-tooltip="Open in a window"
            disabled={!hasDesign || isGenerating}
            onClick={onOpenPreview}
            type="button"
          >
            <ArrowUpRight aria-hidden="true" size={14} />
            <span>Open</span>
          </button>
          <button
            className="toolbar-action"
            data-tooltip={
              designMode === 'motion'
                ? 'Export silent video'
                : designMode === 'logo' || designMode === 'vector'
                  ? 'Export SVG'
                  : 'Export HTML'
            }
            disabled={!hasDesign || isGenerating || exporting}
            onClick={onExport}
            type="button"
          >
            {exporting ? (
              <LoaderCircle aria-hidden="true" className="spin" size={14} />
            ) : (
              <Download aria-hidden="true" size={14} />
            )}
            <span>
              {exporting
                ? designMode === 'motion'
                  ? 'Rendering'
                  : 'Exporting'
                : 'Export'}
            </span>
          </button>
        </div>
      </div>

      <div
        aria-busy={isGenerating}
        className={`preview-stage is-${designMode} ${hasDesign ? 'has-artifact' : ''}`}
        ref={stageRef}
      >
        {hasDesign ? (
          <div
            className={`preview-centering is-${designMode}`}
            style={{ paddingRight: sideInspector ? 352 : 0 }}
          >
            <div
              className={`preview-scale-space is-${designMode}`}
              style={{
                width: size.width * appliedScale,
                height: size.height * appliedScale
              }}
            >
              <div
                className={`preview-scaled-page is-${designMode}`}
                style={{
                  width: size.width,
                  height: size.height,
                  transform: `scale(${appliedScale})`
                }}
              >
                <iframe
                  sandbox="allow-scripts allow-forms"
                  ref={iframeRef}
                  srcDoc={selectionHtml}
                  title={project?.title ?? 'Generated design'}
                />
              </div>
              {selectionVisible && selectedTarget ? (
                <div className="preview-selection-layer" aria-live="polite">
                  <div
                    className="preview-selection-outline"
                    style={{
                      left: selectionLeft,
                      top: selectionTop,
                      width: selectionWidth,
                      height: selectionHeight
                    }}
                  >
                    <span className="preview-selection-corner is-tl" />
                    <span className="preview-selection-corner is-tr" />
                    <span className="preview-selection-corner is-bl" />
                    <span className="preview-selection-corner is-br" />
                  </div>
                  <div
                    className={`preview-selection-prompt ${
                      promptAbove ? 'is-above' : 'is-below'
                    }`}
                    style={{
                      left: promptLeft,
                      top: promptAbove
                        ? Math.max(8, selectionTop - 36)
                        : selectionTop + selectionHeight + 8
                    }}
                  >
                    <button
                      className="preview-selection-prompt-main"
                      onClick={onRequestTargetEdit}
                      type="button"
                    >
                      <MousePointer2 aria-hidden="true" size={13} />
                      What to change?
                    </button>
                    <span
                      className="preview-selection-target"
                      title={selectedTarget.label}
                    >
                      {selectedTarget.label}
                    </span>
                    <button
                      aria-label="Clear selected element"
                      className="preview-selection-dismiss"
                      onClick={() => onSelectTarget(null)}
                      type="button"
                    >
                      <X aria-hidden="true" size={12} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : isGenerating ? (
          <div className="canvas-empty-state" aria-live="polite">
            <LoaderCircle aria-hidden="true" className="spin" size={25} />
            <h2>{activeActivity?.label ?? 'Working on the request'}</h2>
            <p>
              {activeActivity?.detail ??
                'The canvas will update as soon as the document starts arriving.'}
            </p>
          </div>
        ) : hasError ? (
          <div className="canvas-empty-state">
            <Frame aria-hidden="true" size={28} />
            <h2>No document was returned</h2>
            <p>{run?.error ?? 'The provider stopped before returning a design.'}</p>
            <button className="secondary-button" onClick={onRetry} type="button">
              <RotateCcw aria-hidden="true" size={14} />
              Retry
            </button>
          </div>
        ) : hasQuestions ? (
          <div className="canvas-empty-state">
            <Frame aria-hidden="true" size={28} />
            <h2>Waiting for your answer</h2>
            <p>Choose an option or reply in the agent panel to start the draft.</p>
          </div>
        ) : (
          <div className="canvas-empty-state">
            <ModeIcon aria-hidden="true" size={28} />
            <h2>No {modeMeta.label.toLowerCase()} yet</h2>
            <p>
              {designMode === 'logo'
                ? 'Describe the mark, name and use case in the agent panel.'
                : designMode === 'vector'
                  ? 'Describe the artwork or diagram in the agent panel.'
                  : designMode === 'motion'
                    ? 'Describe the silent motion sequence in the agent panel.'
                    : 'Describe the website in the agent panel.'}
            </p>
            <span className="canvas-empty-format">
              {designMode === 'logo'
                ? 'Scalable SVG · editable vectors'
                : designMode === 'vector'
                  ? 'Scalable SVG · transparent artwork'
                  : designMode === 'motion'
                    ? '1280 × 720 · silent code-rendered video'
                    : 'Responsive HTML · desktop, tablet and mobile'}
            </span>
          </div>
        )}
        {designMode === 'motion' && hasDesign ? (
          <div
            className={`motion-transport ${motionPreview.error ? 'has-error' : ''}`}
            role="group"
            aria-label="Motion preview controls"
          >
            <button
              aria-label={motionPreview.playing ? 'Pause motion' : 'Play motion'}
              className="motion-transport-button"
              disabled={!motionPreview.ready}
              onClick={() =>
                controlMotion(motionPreview.playing ? 'pause' : 'play')
              }
              type="button"
            >
              {motionPreview.playing ? (
                <Pause aria-hidden="true" fill="currentColor" size={13} />
              ) : (
                <Play aria-hidden="true" fill="currentColor" size={13} />
              )}
            </button>
            <button
              aria-label="Restart motion"
              className="motion-transport-button"
              disabled={!motionPreview.ready}
              onClick={() => controlMotion('seek', 0)}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={13} />
            </button>
            <span className="motion-transport-time">
              {formatMotionTime(motionPreview.currentTime)}
            </span>
            <input
              aria-label="Motion timeline"
              aria-valuetext={`${formatMotionTime(motionPreview.currentTime)} of ${formatMotionTime(motionPreview.duration)}`}
              disabled={!motionPreview.ready}
              max={Math.max(0.01, motionPreview.duration)}
              min={0}
              onChange={(event) =>
                controlMotion('seek', Number(event.target.value))
              }
              step={0.01}
              type="range"
              value={Math.min(
                motionPreview.currentTime,
                Math.max(0.01, motionPreview.duration)
              )}
            />
            <span className="motion-transport-time">
              {formatMotionTime(motionPreview.duration)}
            </span>
            {motionPreview.error ? (
              <span className="motion-transport-error" title={motionPreview.error}>
                <AlertCircle aria-hidden="true" size={13} />
              </span>
            ) : (
              <span className="motion-silent">
                <VolumeX aria-hidden="true" size={12} />
                Silent
              </span>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
