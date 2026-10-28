import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  CircleSlash2,
  CloudDownload,
  CornerDownRight,
  Crop,
  Globe2,
  ImagePlus,
  ListChecks,
  LoaderCircle,
  MessageCircleQuestion,
  MousePointer2,
  PenLine,
  RotateCcw,
  ScanSearch,
  Search,
  Square,
  WandSparkles,
  X
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  AppProject,
  AppSnapshot,
  AgentActivity,
  AgentQuestion,
  AgentReferenceImage,
  AgentRunTelemetry,
  AgentToolComparison,
  AgentToolMetrics,
  ChatMessage,
  DesignMode,
  DesignSelection,
  MessageStatus,
  ResearchSource
} from '../../../shared/types'
import { errorMessage } from '../lib/errors'
import { formatBytes, formatDuration } from '../lib/format'
import {
  MAX_REFERENCE_IMAGES,
  isSupportedReferenceImage,
  prepareReferenceImage
} from '../lib/referenceImages'
import type { AgentRunView } from '../lib/run'
import { ModelPicker } from './ModelPicker'
import { DesignModePicker } from './DesignModePicker'
import { ProviderMark } from './ProviderMark'

interface AgentPanelProps {
  designMode: DesignMode
  isGenerating: boolean
  isMobileOpen?: boolean
  onCloseMobile?: () => void
  onClearTarget: () => void
  onDesignModeChange: (mode: DesignMode) => void
  onOpenSettings: () => void
  onRetry: () => void
  onSend: (
    text: string,
    target: DesignSelection | null,
    referenceImages: AgentReferenceImage[]
  ) => Promise<void>
  onSnapshot: (snapshot: AppSnapshot) => void
  onStop: () => void
  project: AppProject | null
  run: AgentRunView | null
  selectedTarget: DesignSelection | null
  snapshot: AppSnapshot
}

const activityIcons = {
  research: Search,
  fetch: CloudDownload,
  evidence: ListChecks,
  inspect: ScanSearch,
  transform: Crop,
  clarify: MessageCircleQuestion,
  compose: WandSparkles,
  write: PenLine,
  review: ScanSearch
} as const

function ClarificationPopover({
  busy,
  onChoose,
  question
}: {
  busy: boolean
  onChoose: (option: string) => void
  question: AgentQuestion
}): React.JSX.Element {
  const headingId = `clarification-${question.id}`

  return (
    <section
      aria-labelledby={headingId}
      className="clarification-popover"
    >
      <div className="clarification-heading">
        <span className="clarification-kicker">
          <MessageCircleQuestion aria-hidden="true" size={13} />
          One decision
        </span>
        {question.rationale ? (
          <p className="clarification-rationale">{question.rationale}</p>
        ) : null}
        <h3 id={headingId}>{question.prompt}</h3>
      </div>
      <div className="clarification-options">
        {question.options.map((option) => (
          <button
            className="clarification-option"
            disabled={busy}
            key={option.id}
            onClick={() => onChoose(option.label)}
            type="button"
          >
            <span className="clarification-option-copy">
              <span className="clarification-option-label">
                {option.label}
                {option.recommended ? (
                  <span className="clarification-recommended">Suggested</span>
                ) : null}
              </span>
              {option.description ? (
                <span className="clarification-option-description">
                  {option.description}
                </span>
              ) : null}
            </span>
            {busy ? (
              <LoaderCircle
                aria-hidden="true"
                className="spin"
                size={13}
              />
            ) : (
              <CornerDownRight aria-hidden="true" size={14} />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

function ActivityStatusIcon({
  activity
}: {
  activity: AgentActivity
}): React.JSX.Element {
  if (activity.status === 'running') {
    return <LoaderCircle aria-hidden="true" className="spin" size={13} />
  }
  if (activity.status === 'error') {
    return <AlertCircle aria-hidden="true" size={13} />
  }
  if (activity.status === 'cancelled') {
    return <CircleSlash2 aria-hidden="true" size={13} />
  }
  return <Check aria-hidden="true" size={13} />
}

function ActivityItem({
  activity,
  run
}: {
  activity: AgentActivity
  run: AgentRunView | null
}): React.JSX.Element {
  if (['visuals', 'plan'].includes(activity.kind as string)) {
    return <></>
  }
  const Icon =
    activityIcons[activity.kind as keyof typeof activityIcons] ?? Search
  const hasResults = Boolean(activity.sources?.length)
  const [expanded, setExpanded] = useState(
    activity.status === 'running' || hasResults
  )
  const detail =
    activity.kind === 'write' && activity.status === 'running' && run
      ? `Rendering ${formatBytes(run.designBytes)}`
      : activity.detail

  useEffect(() => {
    if (activity.status === 'running') setExpanded(true)
  }, [activity.status])

  return (
    <div className={`agent-activity is-${activity.status}`}>
      <span className="activity-kind-icon" aria-hidden="true">
        <Icon size={13} />
      </span>
      <div className="activity-content">
        <div className="activity-heading">
          <span className="activity-status-icon" aria-hidden="true">
            <ActivityStatusIcon activity={activity} />
          </span>
          <span className="activity-copy">
            <span className="activity-label">{activity.label}</span>
            {detail ? <span className="activity-detail">{detail}</span> : null}
          </span>
          {activity.durationMs !== undefined ? (
            <span className="activity-duration">
              {formatDuration(activity.durationMs)}
            </span>
          ) : null}
          {hasResults ? (
            <button
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} ${activity.label.toLowerCase()} results`}
              className="activity-disclosure"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              <ChevronDown
                aria-hidden="true"
                className={expanded ? 'is-open' : ''}
                size={14}
              />
            </button>
          ) : null}
        </div>

        {expanded && activity.sources?.length ? (
          <div className="activity-sources" aria-label="Web sources">
            {activity.sources.map((source) => (
              <SourceFavicon key={source.id} source={source} />
            ))}
          </div>
        ) : null}

      </div>
    </div>
  )
}

function faviconHost(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return ''
  }
}

function SourceFavicon({
  source
}: {
  source: ResearchSource
}): React.JSX.Element {
  const host = faviconHost(source.url)
  const [attempt, setAttempt] = useState(0)
  const sources = source.faviconUrl
    ? [source.faviconUrl]
    : host
      ? [
          `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`,
          `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`
        ]
      : []
  const icon = sources[attempt]
  return (
    <button
      aria-label={`Open ${source.title} from ${source.publisher}`}
      className="source-favicon"
      onClick={() => void window.mees?.openExternal(source.url)}
      title={`${source.title} - ${source.publisher}`}
      type="button"
    >
      <span aria-hidden="true" className="source-favicon-fallback">
        {host.replace(/^www\./, '').charAt(0).toUpperCase() || 'W'}
      </span>
      {icon ? (
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setAttempt((value) => value + 1)}
          referrerPolicy="no-referrer"
          src={icon}
        />
      ) : (
        <Globe2 aria-hidden="true" size={12} />
      )}
    </button>
  )
}

function useLiveElapsed(startedAt: number, active: boolean): number {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active, startedAt])

  return active ? Math.max(0, now - startedAt) : 0
}

function AgentWorkingStatus({
  run
}: {
  run: AgentRunView
}): React.JSX.Element {
  const elapsed = useLiveElapsed(run.startedAt, true)

  return (
    <div
      aria-live="polite"
      className="agent-working-stack"
      role="status"
    >
      <div className="agent-working-row is-done">
        <span className="agent-working-mark" aria-hidden="true">
          <Check size={11} />
        </span>
        <span>Brief received</span>
        <span className="agent-working-elapsed">
          {formatDuration(elapsed)}
        </span>
      </div>
      <div className="agent-working-row is-current">
        <span className="agent-working-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="agent-working-label">
          {run.designStarted
            ? 'Receiving the artifact'
            : `Sending request to ${run.modelName}`}
        </span>
      </div>
      <div className="agent-working-row is-pending">
        <span className="agent-working-pending" aria-hidden="true" />
        <span>
          {run.designStarted
            ? 'Canvas is updating from the response'
            : 'Awaiting the provider response'}
        </span>
      </div>
    </div>
  )
}

function ToolMetricsSummary({
  className = '',
  comparison,
  metrics
}: {
  className?: string
  comparison?: AgentToolComparison
  metrics?: AgentToolMetrics
}): React.JSX.Element | null {
  if (
    !metrics ||
    ((metrics.toolCalls ?? 0) <= 0 && metrics.rounds <= 0)
  ) {
    return null
  }
  return (
    <div
      aria-label="Tool harness results"
      className={`harness-summary ${className}`.trim()}
    >
      <span className="harness-summary-label">Agent tools</span>
      <span>
        {metrics.rounds} {metrics.rounds === 1 ? 'round' : 'rounds'}
      </span>
      <span>
        {metrics.queries} {metrics.queries === 1 ? 'query' : 'queries'}
      </span>
      <span>
        {metrics.evidenceItems}{' '}
        {metrics.evidenceItems === 1 ? 'item' : 'items'}
      </span>
      {metrics.claims ? (
        <span>
          {metrics.claims} {metrics.claims === 1 ? 'claim' : 'claims'}
        </span>
      ) : null}
      {metrics.conflicts ? (
        <span className="harness-conflict">
          {metrics.conflicts}{' '}
          {metrics.conflicts === 1 ? 'conflict' : 'conflicts'}
        </span>
      ) : null}
      {metrics.pagesRead ? (
        <span>
          {metrics.pagesRead} {metrics.pagesRead === 1 ? 'page' : 'pages'} read
        </span>
      ) : null}
      {metrics.fetchedAssets ? (
        <span>
          {metrics.fetchedAssets}{' '}
          {metrics.fetchedAssets === 1 ? 'asset' : 'assets'} fetched
        </span>
      ) : null}
      <span>{(metrics.durationMs / 1000).toFixed(1)}s total</span>
      {metrics.parallelBatches > 0 ? (
        <span>{metrics.parallelBatches} parallel</span>
      ) : null}
      {typeof comparison?.evidencePercent === 'number' ? (
        <span
          className={`harness-delta ${
            comparison.evidencePercent < 0
              ? 'is-down'
              : comparison.evidencePercent > 0
                ? 'is-up'
                : 'is-neutral'
          }`}
        >
          {comparison.evidencePercent > 0 ? '+' : ''}
          {comparison.evidencePercent}% evidence vs previous
        </span>
      ) : (
        <span className="harness-delta is-baseline">Baseline run</span>
      )}
      {typeof comparison?.issuePercent === 'number' ? (
        <span
          className={`harness-delta ${
            comparison.issuePercent < 0
              ? 'is-down'
              : comparison.issuePercent > 0
                ? 'is-up'
                : 'is-neutral'
          }`}
        >
          {comparison.issuePercent === 0
            ? 'No finding change'
            : `${Math.abs(comparison.issuePercent)}% ${
                comparison.issuePercent > 0 ? 'fewer' : 'more'
              } findings`}
        </span>
      ) : null}
    </div>
  )
}

function TelemetrySummary({
  telemetry
}: {
  telemetry?: AgentRunTelemetry
}): React.JSX.Element | null {
  if (!telemetry?.spans.length) return null
  const firstTokenMs = telemetry.firstTokenAt
    ? Math.max(
        0,
        new Date(telemetry.firstTokenAt).getTime() -
          new Date(telemetry.requestStartedAt).getTime()
      )
    : null
  const durationFor = (stage: AgentRunTelemetry['spans'][number]['stage']) =>
    telemetry.spans
      .filter(
        (span) => span.stage === stage && span.durationMs !== undefined
      )
      .reduce((total, span) => total + (span.durationMs ?? 0), 0)
  const modelMs = durationFor('model')
  const toolMs = durationFor('tool')
  const writeMs = durationFor('write')
  const runtimeMs = durationFor('runtime')
  const totalMs = telemetry.completedAt
    ? new Date(telemetry.completedAt).getTime() -
      new Date(telemetry.requestStartedAt).getTime()
    : null

  return (
    <div className="run-telemetry" aria-label="Measured run timing">
      {firstTokenMs !== null ? (
        <span>
          <strong>{formatDuration(firstTokenMs)}</strong> first token
        </span>
      ) : null}
      {modelMs > 0 ? (
        <span>
          <strong>{formatDuration(modelMs)}</strong> model
        </span>
      ) : null}
      {toolMs > 0 ? (
        <span>
          <strong>{formatDuration(toolMs)}</strong> tools
        </span>
      ) : null}
      {writeMs > 0 ? (
        <span>
          <strong>{formatDuration(writeMs)}</strong> writing
        </span>
      ) : null}
      {runtimeMs > 0 ? (
        <span>
          <strong>{formatDuration(runtimeMs)}</strong> browser
        </span>
      ) : null}
      {totalMs !== null ? (
        <span>
          <strong>{formatDuration(totalMs)}</strong> total
        </span>
      ) : null}
    </div>
  )
}

function AgentWorkTimeline({
  activities,
  active,
  comparison,
  metrics,
  run,
  status,
  telemetry
}: {
  activities: AgentActivity[]
  active: boolean
  comparison?: AgentToolComparison
  metrics?: AgentToolMetrics
  run: AgentRunView | null
  status: MessageStatus
  telemetry?: AgentRunTelemetry
}): React.JSX.Element | null {
  const visibleActivities = activities.filter(
    (activity) => !['visuals', 'plan'].includes(activity.kind as string)
  )
  const panelId = useId()
  const [expanded, setExpanded] = useState(active)
  const elapsed = useLiveElapsed(run?.startedAt ?? 0, active && Boolean(run))

  useEffect(() => {
    setExpanded(active)
  }, [active])

  if (visibleActivities.length === 0) return null

  if (active) {
    const activeIndex = visibleActivities.findIndex(
      (activity) => activity.status === 'running'
    )
    return (
      <section className="agent-work is-live" aria-label="Agent working steps">
        <div className="agent-work-live-head">
          <span>
            <LoaderCircle aria-hidden="true" className="spin" size={12} />
            Agent working
          </span>
          <span>
            {activeIndex >= 0
              ? `${activeIndex + 1} of ${visibleActivities.length} steps`
              : `${visibleActivities.length} ${
                  visibleActivities.length === 1 ? 'step' : 'steps'
                }`}{' '}
            / {formatDuration(elapsed)}
          </span>
        </div>
        <div className="activity-timeline" aria-label="Agent activity">
          {visibleActivities.map((activity) => (
            <ActivityItem activity={activity} key={activity.id} run={run} />
          ))}
        </div>
      </section>
    )
  }

  const failed = visibleActivities.some(
    (activity) => activity.status === 'error'
  )
  const cancelled =
    status === 'cancelled' ||
    visibleActivities.some((activity) => activity.status === 'cancelled')
  const title = failed
    ? 'Agent work stopped'
    : cancelled
      ? 'Agent work cancelled'
      : 'Agent work'
  const detail = [
    `${visibleActivities.length} ${
      visibleActivities.length === 1 ? 'step' : 'steps'
    }`,
    metrics?.sources
      ? `${metrics.sources} ${metrics.sources === 1 ? 'source' : 'sources'}`
      : null,
    metrics?.durationMs
      ? formatDuration(metrics.durationMs)
      : null
  ]
    .filter(Boolean)
    .join(' / ')

  return (
    <section className={`agent-work ${expanded ? 'is-expanded' : ''}`}>
      <button
        aria-label={`${title}. ${detail}. ${
          expanded ? 'Hide' : 'Show'
        } work details`}
        aria-controls={panelId}
        aria-expanded={expanded}
        className="agent-work-summary"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className={`agent-work-check ${failed ? 'is-error' : ''}`}>
          {failed ? (
            <AlertCircle aria-hidden="true" size={13} />
          ) : (
            <Check aria-hidden="true" size={13} />
          )}
        </span>
        <span className="agent-work-summary-copy">
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={expanded ? 'is-open' : ''}
          size={14}
        />
      </button>
      {expanded ? (
        <div className="agent-work-panel" id={panelId}>
          <div className="activity-timeline" aria-label="Agent activity">
            {visibleActivities.map((activity) => (
              <ActivityItem activity={activity} key={activity.id} run={run} />
            ))}
          </div>
          <ToolMetricsSummary
            className="agent-work-metrics"
            comparison={comparison}
            metrics={metrics}
          />
          <TelemetrySummary telemetry={telemetry} />
        </div>
      ) : null}
    </section>
  )
}

function MessageBody({
  hideClarificationContent,
  message,
  run
}: {
  hideClarificationContent?: boolean
  message: ChatMessage
  run: AgentRunView | null
}): React.JSX.Element {
  const isActiveRun =
    run?.assistantMessageId === message.id &&
    (run.status === 'starting' || run.status === 'streaming')
  const hasLiveActivity = Boolean(
    message.activities?.some((activity) => activity.status === 'running')
  )

  if (message.role === 'user') {
    return (
      <>
        {message.referenceImages?.length ? (
          <div className="message-references" aria-label="Reference images">
            {message.referenceImages.map((image) => (
              <img
                alt={`Reference: ${image.name}`}
                decoding="async"
                key={image.id}
                src={image.dataUrl}
              />
            ))}
          </div>
        ) : null}
        {message.target ? (
          <span className="message-target">
            <MousePointer2 aria-hidden="true" size={11} />
            {message.target.label}
          </span>
        ) : null}
        <p className="user-message-copy">{message.content}</p>
      </>
    )
  }

  return (
    <div className="assistant-body">
      <div className="message-author">
        {message.provider ? <ProviderMark provider={message.provider} size={15} /> : null}
        <span>Mees</span>
        {message.model ? <span className="message-model">{message.model}</span> : null}
      </div>
      {message.activities?.length ? (
        <AgentWorkTimeline
          activities={message.activities}
          active={isActiveRun}
          comparison={message.toolComparison}
          metrics={message.toolMetrics}
          run={run}
          status={message.status}
          telemetry={message.telemetry}
        />
      ) : null}
      {message.content && !hideClarificationContent ? (
        <div className="markdown-body">
          <ReactMarkdown
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  onClick={(event) => {
                    event.preventDefault()
                    if (href) void window.mees?.openExternal(href)
                  }}
                >
                  {children}
                </a>
              )
            }}
            remarkPlugins={[remarkGfm]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      ) : null}

      {!message.activities?.length ? (
        <ToolMetricsSummary
          comparison={message.toolComparison}
          metrics={message.toolMetrics}
        />
      ) : null}

      {isActiveRun && run && !hasLiveActivity ? (
        <AgentWorkingStatus run={run} />
      ) : null}

      {message.status === 'error' ? (
        <div className="message-error">
          <AlertCircle aria-hidden="true" size={15} />
          <p>{message.error || 'The provider stopped before returning a complete response.'}</p>
        </div>
      ) : null}

      {message.status === 'cancelled' ? (
        <p className="message-cancelled">
          Stopped. Any received draft stays on the canvas.
        </p>
      ) : null}
    </div>
  )
}

export function AgentPanel({
  designMode,
  isGenerating,
  isMobileOpen,
  onCloseMobile,
  onClearTarget,
  onDesignModeChange,
  onOpenSettings,
  onRetry,
  onSend,
  onSnapshot,
  onStop,
  project,
  run,
  selectedTarget,
  snapshot
}: AgentPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sendError, setSendError] = useState('')
  const [pinned, setPinned] = useState(true)
  const [referenceImages, setReferenceImages] = useState<AgentReferenceImage[]>(
    []
  )
  const [draggingReferences, setDraggingReferences] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef<number | null>(null)

  const messages = project?.messages ?? []
  const projectMatchesMode = project?.designMode === designMode
  const visibleMessages = projectMatchesMode ? messages : []
  const hasDesign =
    projectMatchesMode && Boolean(project?.designHtml)
  const designModePlaceholder =
    designMode === 'logo'
      ? 'Describe the logo and where it will be used'
      : designMode === 'vector'
        ? 'Describe the vector artwork'
        : designMode === 'motion'
          ? 'Describe the silent motion piece'
          : 'Describe the website you want to make'
  const emptyPrompt =
    designMode === 'logo'
      ? 'Start with the name, what it stands for and where the mark must work.'
      : designMode === 'vector'
        ? 'Start with the subject, its visual language and where the artwork will be used.'
        : designMode === 'motion'
          ? 'Start with the subject, the moment to communicate and the intended duration.'
          : 'Start with the subject, the people it serves and what the page needs to do.'
  const hasAssistantReply = visibleMessages.some(
    (message) => message.role === 'assistant' && message.status === 'complete'
  )
  const hasModel = Boolean(snapshot.settings.activeProvider && snapshot.settings.activeModel)
  const activeProvider = snapshot.settings.providers.find(
    (provider) => provider.provider === snapshot.settings.activeProvider
  )
  const activeModelInfo = activeProvider?.models.find(
    (model) => model.id === snapshot.settings.activeModel
  )
  const supportsReferenceImages = activeModelInfo?.supportsImages !== false
  const lastMessage = visibleMessages[visibleMessages.length - 1]
  const pendingQuestion =
    projectMatchesMode &&
    lastMessage?.role === 'assistant' &&
    lastMessage.status === 'complete' &&
    lastMessage.clarification
      ? lastMessage.clarification
      : null
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 72), 168)}px`
  }, [draft])

  useEffect(() => {
    if (!selectedTarget) return
    textareaRef.current?.focus()
  }, [selectedTarget])

  useEffect(() => {
    const message =
      'This model accepts text only. Choose an image-capable model.'
    if (referenceImages.length && !supportsReferenceImages) {
      setSendError(message)
    } else {
      setSendError((current) => (current === message ? '' : current))
    }
  }, [referenceImages.length, supportsReferenceImages])

  useEffect(() => {
    if (!pinned) return
    if (scrollFrameRef.current !== null) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const element = messagesRef.current
      if (element) element.scrollTop = element.scrollHeight
    })
  }, [messages.length, messages, pinned, run?.bytes])

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    },
    []
  )

  async function sendValue(text: string): Promise<void> {
    const message =
      text.trim() ||
      (referenceImages.length
        ? 'Use the attached reference images as the visual direction.'
        : '')
    if (!message || isGenerating || !hasModel || submitting) return
    if (referenceImages.length && !supportsReferenceImages) {
      setSendError('This model accepts text only. Choose an image-capable model.')
      return
    }
    setSubmitting(true)
    setSendError('')
    try {
      await onSend(message, selectedTarget, referenceImages)
      setDraft('')
      setReferenceImages([])
    } catch (caught) {
      setSendError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function send(): Promise<void> {
    await sendValue(draft.trim())
  }

  async function addReferenceFiles(files: File[]): Promise<void> {
    if (isGenerating || submitting) return
    if (!supportsReferenceImages) {
      setSendError('This model accepts text only. Choose an image-capable model.')
      return
    }
    const remaining = MAX_REFERENCE_IMAGES - referenceImages.length
    if (remaining <= 0) {
      setSendError(`Use up to ${MAX_REFERENCE_IMAGES} reference images.`)
      return
    }
    const accepted = files
      .filter(isSupportedReferenceImage)
      .slice(0, remaining)
    if (accepted.length === 0) {
      setSendError('Use a PNG, JPEG, or WebP reference image.')
      return
    }
    setSendError('')
    const prepared = await Promise.allSettled(
      accepted.map((file) => prepareReferenceImage(file))
    )
    const next = prepared.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : []
    )
    if (next.length) {
      setReferenceImages((current) =>
        [...current, ...next].slice(0, MAX_REFERENCE_IMAGES)
      )
      textareaRef.current?.focus()
    }
    const rejected = prepared.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (rejected) {
      const reason = rejected.reason
      setSendError(
        reason instanceof Error
          ? reason.message
          : 'A reference image could not be prepared.'
      )
    }
  }

  const placeholder = pendingQuestion
    ? 'Write a different answer'
    : selectedTarget
      ? 'Describe what should change'
    : hasDesign && project?.designMode === designMode
      ? 'Describe the next change'
      : hasAssistantReply
        ? 'Answer the agent'
        : designModePlaceholder

  return (
    <aside className={`agent-panel ${isMobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="agent-header">
        <div className="agent-heading">
          <h2>Agent</h2>
        </div>
        {onCloseMobile ? (
          <button
            aria-label="Close agent"
            className="icon-button mobile-agent-close"
            data-tooltip="Close agent"
            onClick={onCloseMobile}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        ) : null}
      </div>

      <div
        aria-busy={isGenerating}
        className="agent-messages"
        onScroll={(event) => {
          const element = event.currentTarget
          setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 56)
        }}
        ref={messagesRef}
      >
        {visibleMessages.length === 0 ? (
          <div className="agent-empty">
            <p>{emptyPrompt}</p>
          </div>
        ) : null}

        {visibleMessages.map((message) => (
          <article
            className={`chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
            key={message.id}
          >
            <MessageBody
              hideClarificationContent={
                Boolean(pendingQuestion) && message.id === lastMessage?.id
              }
              message={message}
              run={run}
            />
            {message.role === 'assistant' &&
            message.status === 'error' &&
            message === visibleMessages[visibleMessages.length - 1] ? (
              <button className="retry-button" onClick={onRetry} type="button">
                <RotateCcw aria-hidden="true" size={13} />
                Retry
              </button>
            ) : null}
          </article>
        ))}
      </div>

      <div className="agent-footer">
        {pendingQuestion ? (
          <ClarificationPopover
            busy={submitting || isGenerating}
            onChoose={(option) => void sendValue(option)}
            question={pendingQuestion}
          />
        ) : null}
        <div
          className={`composer ${draggingReferences ? 'is-dragging' : ''}`}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            setDraggingReferences(true)
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return
            }
            setDraggingReferences(false)
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDraggingReferences(false)
            void addReferenceFiles(Array.from(event.dataTransfer.files))
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length) {
              event.preventDefault()
              void addReferenceFiles(files)
            }
          }}
        >
          {draggingReferences ? (
            <div className="composer-drop-target" aria-live="polite">
              <ImagePlus aria-hidden="true" size={18} />
              <span>Drop images to reference</span>
            </div>
          ) : null}
          {selectedTarget ? (
            <div className="composer-target" aria-label="Selected element">
              <span className="composer-target-icon" aria-hidden="true">
                <MousePointer2 size={13} />
              </span>
              <code title={selectedTarget.selector}>
                {selectedTarget.html.match(/<[^>]+>/)?.[0] ??
                  `<${selectedTarget.tag}>`}
              </code>
              <span className="composer-target-copy" title={selectedTarget.text}>
                {selectedTarget.text || selectedTarget.selector}
              </span>
              <button
                aria-label="Remove selected element"
                className="composer-target-remove"
                onClick={onClearTarget}
                type="button"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </div>
          ) : null}
          {referenceImages.length ? (
            <div className="composer-references" aria-label="Reference images">
              {referenceImages.map((image) => (
                <figure className="composer-reference" key={image.id}>
                  <img
                    alt={`Reference: ${image.name}`}
                    decoding="async"
                    src={image.dataUrl}
                  />
                  <button
                    aria-label={`Remove ${image.name}`}
                    className="composer-reference-remove"
                    onClick={() =>
                      setReferenceImages((current) =>
                        current.filter((item) => item.id !== image.id)
                      )
                    }
                    type="button"
                  >
                    <X aria-hidden="true" size={11} />
                  </button>
                </figure>
              ))}
            </div>
          ) : null}
          <textarea
            aria-label="Message the design agent"
            disabled={isGenerating || !hasModel}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                if (!isGenerating && (draft.trim() || referenceImages.length)) {
                  void send()
                }
              }
            }}
            placeholder={hasModel ? placeholder : 'Connect a model to begin'}
            ref={textareaRef}
            rows={2}
            value={draft}
          />
          <div className="composer-footer">
            <div className="composer-options">
              <ModelPicker
                disabled={isGenerating}
                onOpenSettings={onOpenSettings}
                onSnapshot={onSnapshot}
                snapshot={snapshot}
              />
              <DesignModePicker
                disabled={isGenerating}
                mode={designMode}
                onChange={onDesignModeChange}
              />
            </div>

            {isGenerating ? (
              <button
                aria-label="Stop generation"
                className="send-button stop-button"
                data-tooltip="Stop"
                onClick={onStop}
                type="button"
              >
                <Square aria-hidden="true" fill="currentColor" size={11} />
              </button>
            ) : (
              <button
                aria-label="Send message"
                className="send-button"
                data-tooltip="Send"
                disabled={
                  (!draft.trim() && referenceImages.length === 0) ||
                  !hasModel ||
                  (referenceImages.length > 0 && !supportsReferenceImages) ||
                  submitting
                }
                onClick={() => void send()}
                type="button"
              >
                {submitting ? (
                  <LoaderCircle aria-hidden="true" className="spin" size={15} />
                ) : (
                  <ArrowUp aria-hidden="true" size={16} />
                )}
              </button>
            )}
          </div>
        </div>
        {sendError ? <p className="field-error composer-error">{sendError}</p> : null}
      </div>
    </aside>
  )
}
