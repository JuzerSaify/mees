import {
  AlertCircle,
  ArrowUp,
  Check,
  CircleSlash2,
  CornerDownRight,
  ImagePlus,
  LoaderCircle,
  MessageCircleQuestion,
  MousePointer2,
  RotateCcw,
  Square,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  AppProject,
  AppSnapshot,
  AgentActivity,
  AgentQuestion,
  AgentReferenceImage,
  AgentToolComparison,
  AgentToolMetrics,
  ChatMessage,
  DesignMode,
  DesignSelection,
  MessageStatus
} from '../../../shared/types'
import { errorMessage } from '../lib/errors'
import { chooseAgentStatus } from '../lib/agentStatus'
import { formatDuration } from '../lib/format'
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

function useLiveElapsed(
  startedAt: number,
  active: boolean,
  intervalMs = 1_000
): number {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs, startedAt])

  return active ? Math.max(0, now - startedAt) : 0
}

const pixelDelays = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3)
  const column = index % 3
  return (column + Math.abs(row - 1)) * 90
})

function AgentPixelGrid(): React.JSX.Element {
  return (
    <span className="agent-pixel-grid" aria-hidden="true">
      {pixelDelays.map((delay, index) => (
        <i
          key={index}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
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
      {metrics.visualInspections ? (
        <span>
          {metrics.visualInspections}{' '}
          {metrics.visualInspections === 1
            ? 'visual check'
            : 'visual checks'}
        </span>
      ) : null}
      {metrics.reusedToolCalls ? (
        <span>
          {metrics.reusedToolCalls}{' '}
          {metrics.reusedToolCalls === 1 ? 'result reused' : 'results reused'}
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

function AgentStatusLine({
  activities,
  active,
  metrics,
  run,
  status
}: {
  activities: AgentActivity[]
  active: boolean
  metrics?: AgentToolMetrics
  run: AgentRunView | null
  status: MessageStatus
}): React.JSX.Element | null {
  const visibleActivities = activities.filter(
    (activity) => !['visuals', 'plan'].includes(activity.kind as string)
  )
  const elapsed = useLiveElapsed(
    run?.startedAt ?? 0,
    active && Boolean(run),
    250
  )

  if (active) {
    const running = visibleActivities.find(
      (activity) => activity.status === 'running'
    )
    const activeIndex = running
      ? visibleActivities.findIndex((activity) => activity.id === running.id)
      : -1
    const current = chooseAgentStatus(
      running,
      run?.designStarted ?? false,
      elapsed,
      run?.modelName
    )
    const step =
      activeIndex >= 0
        ? `Step ${activeIndex + 1}`
        : ''
    return (
      <section
        aria-label="Agent working"
        className="agent-status-line is-working"
        role="status"
      >
        <AgentPixelGrid />
        <span
          className="agent-status-copy"
          title={current.detail}
        >
          <span className="agent-status-label" key={current.label}>
            {current.label}
          </span>
          {current.detail ? (
            <span className="agent-status-detail">{current.detail}</span>
          ) : null}
        </span>
        {step ? <span className="agent-status-step">{step}</span> : null}
        <span className="agent-status-time">
          {formatDuration(elapsed)}
        </span>
      </section>
    )
  }

  if (visibleActivities.length === 0) return null
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
      : 'Agent work completed'
  const detail = [
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
    <section
      aria-label={[title, detail].filter(Boolean).join('. ')}
      className={`agent-status-line ${
        failed
          ? 'is-error'
          : cancelled
            ? 'is-cancelled'
            : 'is-complete'
      }`}
    >
      <span className="agent-status-result-icon" aria-hidden="true">
        {failed ? (
          <AlertCircle size={13} />
        ) : cancelled ? (
          <CircleSlash2 size={13} />
        ) : (
          <Check size={13} />
        )}
      </span>
      <span className="agent-status-title">{title}</span>
      {detail ? (
        <span className="agent-status-meta">{detail}</span>
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
      {isActiveRun || message.activities?.length ? (
        <AgentStatusLine
          activities={message.activities ?? []}
          active={isActiveRun}
          metrics={message.toolMetrics}
          run={run}
          status={message.status}
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
    <aside
      aria-labelledby="agent-panel-title"
      className={`agent-panel ${isMobileOpen ? 'is-mobile-open' : ''}`}
    >
      <div className="agent-header">
        <div className="agent-heading">
          <h2 id="agent-panel-title">Agent</h2>
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
