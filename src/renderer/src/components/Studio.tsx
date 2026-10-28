import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  MessageSquare,
  Plus,
  Settings2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PROVIDER_DEFINITIONS,
  type AgentStreamEvent,
  type AgentActivity,
  type AgentQuestion,
  type AgentReferenceImage,
  type AppProject,
  type AppSnapshot,
  type ArtifactRuntimeReport,
  type ChatMessage,
  type DesignMemoryEntry,
  type DesignMode,
  type DesignFingerprint,
  type RecentDesignSummary,
  type DesignSelection
} from '../../../shared/types'
import {
  deriveProjectTitle,
  hydrateFetchedAssets,
  parseAgentOutput,
  parseDesignTitle,
  parseEditPatch,
  parseEditPatchOutput,
  textBytes
} from '../lib/agentOutput'
import { applyDesignPatch } from '../lib/designPatch'
import {
  applyDesignMemoryReview,
  buildRecentDesignCandidates,
  fingerprintArtifactDesign
} from '../lib/designMemory'
import {
  auditArtifactDesign,
  fingerprintDesign,
  formatAuditForAgent,
  mergeRuntimeArtifactReport
} from '../lib/designAudit'
import { addDesignVersion } from '../lib/designVersions'
import { errorMessage } from '../lib/errors'
import type { AgentRunView } from '../lib/run'
import { normalizeEffort } from '../../../shared/effort'
import { AgentPanel } from './AgentPanel'
import { Wordmark } from './Brand'
import {
  DesignInspector,
  type InspectorTab
} from './DesignInspector'
import { PreviewCanvas } from './PreviewCanvas'
import { ProjectHistoryDialog } from './ProjectHistoryDialog'
import { SettingsDialog } from './SettingsDialog'

interface StudioProps {
  onSnapshot: (snapshot: AppSnapshot) => void
  snapshot: AppSnapshot
}

interface ToastState {
  id: number
  kind: 'success' | 'error'
  message: string
}

function upsertActivity(
  activities: AgentActivity[] | undefined,
  activity: AgentActivity
): AgentActivity[] {
  const current = activities ?? []
  const index = current.findIndex((item) => item.id === activity.id)
  if (index === -1) return [...current, activity]
  return current.map((item, itemIndex) =>
    itemIndex === index ? activity : item
  )
}

function settleActivities(
  activities: AgentActivity[] | undefined,
  status: 'complete' | 'error' | 'cancelled'
): AgentActivity[] {
  const finishedAt = new Date().toISOString()
  return (activities ?? []).map((activity) =>
    activity.status === 'running'
      ? { ...activity, status, finishedAt }
      : activity
  )
}

function clarificationTranscript(question: AgentQuestion): string {
  return [
    `Clarification request: ${question.prompt}`,
    ...question.options.map(
      (option) =>
        `- ${option.label}${option.description ? `: ${option.description}` : ''}`
    )
  ].join('\n')
}

function withMessageActivity(
  project: AppProject,
  messageId: string,
  activity: AgentActivity
): AppProject {
  return {
    ...project,
    messages: project.messages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            activities: upsertActivity(message.activities, activity)
          }
        : message
    )
  }
}

async function prepareRecentDesignSummaries(
  projects: AppProject[],
  currentProjectId: string,
  designMode: DesignMode,
  cache: Map<string, { revision: number; fingerprint: DesignFingerprint }>
): Promise<RecentDesignSummary[]> {
  const candidates = buildRecentDesignCandidates(
    projects,
    currentProjectId,
    designMode,
    3
  )
  const summaries = await Promise.all(
    candidates.map(async (project) => {
      const stored = project.audit?.viewports.find(
        (viewport) => viewport.viewport === 'desktop'
      )?.fingerprint
      let fingerprint = stored
      const cached = cache.get(project.id)
      if (
        !fingerprint &&
        cached &&
        cached.revision === project.revision
      ) {
        fingerprint = cached.fingerprint
      }
      if (!fingerprint) {
        try {
          fingerprint =
            designMode === 'website'
              ? await fingerprintDesign(project.designHtml)
              : fingerprintArtifactDesign(project.designHtml, designMode)
          if (fingerprint) {
            cache.set(project.id, {
              revision: project.revision,
              fingerprint
            })
          }
        } catch {
          return null
        }
      }
      return fingerprint
        ? { title: project.title, fingerprint }
        : null
    })
  )
  return summaries.filter(
    (summary): summary is RecentDesignSummary => Boolean(summary)
  )
}

export function Studio({ onSnapshot, snapshot }: StudioProps): React.JSX.Element {
  const [projects, setProjects] = useState<AppProject[]>(snapshot.projects)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    snapshot.projects[0]?.id ?? null
  )
  const [run, setRun] = useState<AgentRunView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab | null>(null)
  const [auditRunningFor, setAuditRunningFor] = useState<string | null>(null)
  const [auditError, setAuditError] = useState('')
  const [selectedTarget, setSelectedTarget] =
    useState<DesignSelection | null>(null)
  const [selectedDesignMode, setSelectedDesignMode] =
    useState<DesignMode>(snapshot.projects[0]?.designMode ?? 'website')
  const [exporting, setExporting] = useState(false)

  const projectsRef = useRef(projects)
  const runRef = useRef<AgentRunView | null>(null)
  const rawRef = useRef('')
  const animationFrameRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const cancelRequestedRef = useRef(false)
  const auditSequenceRef = useRef(0)
  const settingsRef = useRef(snapshot.settings)
  const fingerprintCacheRef = useRef(
    new Map<string, { revision: number; fingerprint: DesignFingerprint }>()
  )

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null
  const isGenerating = run?.status === 'starting' || run?.status === 'streaming'
  const hasModel = Boolean(snapshot.settings.activeProvider && snapshot.settings.activeModel)
  const isAuditingActive =
    Boolean(activeProjectId) && auditRunningFor === activeProjectId

  const commitRun = useCallback((next: AgentRunView | null) => {
    runRef.current = next
    setRun(next)
  }, [])

  useEffect(() => {
    settingsRef.current = snapshot.settings
  }, [snapshot.settings])

  const updateProjects = useCallback(
    (updater: (current: AppProject[]) => AppProject[]): AppProject[] => {
      const next = updater(projectsRef.current)
      projectsRef.current = next
      setProjects(next)
      return next
    },
    []
  )

  const showToast = useCallback((message: string, kind: ToastState['kind']) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ id: Date.now(), kind, message })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  const clearSelectedTarget = useCallback(() => {
    setSelectedTarget(null)
  }, [])

  const requestTargetEdit = useCallback(() => {
    setAgentDrawerOpen(true)
    window.setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '.agent-panel textarea'
      )
      textarea?.focus()
    }, 80)
  }, [])

  const persistProject = useCallback(
    async (project: AppProject): Promise<AppProject> => {
      if (!window.kern) throw new Error('The desktop bridge is unavailable.')
      try {
        const saved = await window.kern.saveProject(project)
        updateProjects((current) =>
          current.map((item) =>
            item.id === saved.id ? { ...item, updatedAt: saved.updatedAt } : item
          )
        )
        return saved
      } catch (caught) {
        showToast(errorMessage(caught), 'error')
        throw caught
      }
    },
    [showToast, updateProjects]
  )

  const runReview = useCallback(
    async (
      projectId: string,
      designHtml: string,
      revision: number,
      announceFailure = false,
      messageId?: string,
      previousIssueCount?: number
    ): Promise<void> => {
      if (!designHtml.trim()) return
      const sequence = auditSequenceRef.current + 1
      auditSequenceRef.current = sequence
      setAuditRunningFor(projectId)
      setAuditError('')
      const reviewActivity: AgentActivity | null = messageId
        ? {
            id: crypto.randomUUID(),
            kind: 'review',
            label: 'Reviewing the artifact',
            detail: 'Checking structure, accessibility and design integrity',
            status: 'running',
            startedAt: new Date().toISOString()
          }
        : null
      if (messageId && reviewActivity) {
        updateProjects((current) =>
          current.map((project) =>
            project.id === projectId
              ? withMessageActivity(project, messageId, reviewActivity)
              : project
          )
        )
      }

      try {
        const designMode =
          projectsRef.current.find((project) => project.id === projectId)
            ?.designMode ?? 'website'
        const reviewStartedAt = new Date().toISOString()
        const [localResult, runtimeResult] = await Promise.allSettled([
          auditArtifactDesign(designHtml, revision, designMode),
          window.kern?.captureArtifact(designHtml, designMode)
        ])
        if (localResult.status === 'rejected') throw localResult.reason
        const runtimeMessage =
          runtimeResult.status === 'rejected'
            ? errorMessage(runtimeResult.reason)
            : runtimeResult.value
              ? ''
              : 'The desktop browser bridge is unavailable.'
        const runtime: ArtifactRuntimeReport =
          runtimeResult.status === 'fulfilled' && runtimeResult.value
            ? runtimeResult.value
            : {
                capturedAt: new Date().toISOString(),
                durationMs: 0,
                consoleErrors: [],
                pageErrors: [runtimeMessage],
                networkFailures: [],
                issues: [
                  {
                    viewport: 'desktop',
                    rule: 'runtime-verification-unavailable',
                    severity: 'error',
                    title: 'Browser verification did not run',
                    detail:
                      runtimeMessage ||
                      'The artifact could not be played in the local browser.'
                  }
                ],
                screenshots: [],
                document: {
                  title: '',
                  language: '',
                  headings: [],
                  landmarks: [],
                  controls: 0,
                  links: 0,
                  images: 0,
                  forms: 0
                }
              }
        const measuredAudit = mergeRuntimeArtifactReport(
          localResult.value,
          runtime
        )
        const audit = applyDesignMemoryReview(
          measuredAudit,
          projectsRef.current,
          projectId,
          fingerprintCacheRef.current
        )
        if (auditSequenceRef.current !== sequence) return
        const nextProjects = updateProjects((current) =>
          current.map((project) => {
            if (
              project.id !== projectId ||
              project.revision !== revision ||
              project.designHtml !== designHtml
            ) {
              return project
            }
            const reviewed = { ...project, audit }
            if (!messageId || !reviewActivity) return reviewed
            const reviewedAt = new Date()
            const reviewDuration = Math.max(
              0,
              reviewedAt.getTime() - new Date(reviewStartedAt).getTime()
            )
            const issuePercent =
              previousIssueCount && previousIssueCount > 0
                ? Math.round(
                    ((previousIssueCount - audit.issueCount) /
                      previousIssueCount) *
                      1000
                  ) / 10
                : null
            const activity = {
              ...reviewActivity,
              status: 'complete' as const,
              detail: audit.issueCount
                ? `${audit.issueCount} ${
                    audit.issueCount === 1 ? 'issue' : 'issues'
                  } found after browser playback`
                : 'Browser playback passed',
              finishedAt: reviewedAt.toISOString(),
              durationMs: reviewDuration
            }
            const withReview = withMessageActivity(
              reviewed,
              messageId,
              activity
            )
            return {
              ...withReview,
              messages: withReview.messages.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      toolComparison: {
                        ...(message.toolComparison ?? {
                          evidencePercent: null
                        }),
                        issuePercent
                      },
                      telemetry: {
                        ...(message.telemetry ?? {
                          requestStartedAt: reviewStartedAt,
                          spans: []
                        }),
                        spans: [
                          ...(message.telemetry?.spans ?? []).filter(
                            (span) => span.stage !== 'runtime'
                          ),
                          {
                            id: crypto.randomUUID(),
                            stage: 'runtime' as const,
                            label: 'Testing in a real browser',
                            status: 'complete' as const,
                            startedAt: reviewStartedAt,
                            finishedAt: reviewedAt.toISOString(),
                            durationMs: runtime?.durationMs ?? reviewDuration,
                            detail: runtime
                              ? `${runtime.screenshots.length} screenshot${
                                  runtime.screenshots.length === 1 ? '' : 's'
                                }, ${runtime.issues.length} runtime issue${
                                  runtime.issues.length === 1 ? '' : 's'
                                }`
                              : 'Runtime capture unavailable'
                          }
                        ]
                      }
                    }
                  : message
              )
            }
          })
        )
        const reviewed = nextProjects.find((project) => project.id === projectId)
        if (
          reviewed &&
          reviewed.revision === revision &&
          reviewed.designHtml === designHtml
        ) {
          await persistProject(reviewed)
        }
      } catch (caught) {
        if (auditSequenceRef.current !== sequence) return
        const message = errorMessage(caught)
        setAuditError(message)
        if (messageId && reviewActivity) {
          const nextProjects = updateProjects((current) =>
            current.map((project) =>
              project.id === projectId
                ? withMessageActivity(project, messageId, {
                    ...reviewActivity,
                    status: 'error',
                    detail: message,
                    finishedAt: new Date().toISOString()
                  })
                : project
            )
          )
          const failed = nextProjects.find((project) => project.id === projectId)
          if (failed) void persistProject(failed)
        }
        if (announceFailure) showToast(message, 'error')
      } finally {
        if (auditSequenceRef.current === sequence) {
          setAuditRunningFor(null)
        }
      }
    },
    [persistProject, showToast, updateProjects]
  )

  const flushStream = useCallback(() => {
    const activeRun = runRef.current
    if (!activeRun) return

    const editOutput =
      activeRun.mode === 'targeted-edit'
        ? parseEditPatchOutput(rawRef.current)
        : null
    const parsed = editOutput ? null : parseAgentOutput(rawRef.current)
    const designStarted =
      activeRun.designStarted ||
      Boolean(editOutput?.patchStarted ?? parsed?.designStarted)
    const streamedDesign =
      parsed?.designStarted
        ? hydrateFetchedAssets(parsed.designHtml, activeRun.assets)
        : ''
    const writeActivity =
      designStarted && !activeRun.designStarted
        ? {
            id: crypto.randomUUID(),
            kind: 'write' as const,
            label:
              activeRun.mode === 'targeted-edit'
                ? 'Preparing a targeted patch'
                : 'Writing the live canvas',
            detail:
              activeRun.mode === 'targeted-edit'
                ? `Changing ${activeRun.target?.label ?? 'the selected element'}`
                : 'Streaming the responsive document into the preview',
            status: 'running' as const,
            startedAt: new Date().toISOString()
          }
        : null
    const nextRun: AgentRunView = {
      ...activeRun,
      status: activeRun.status === 'starting' ? 'streaming' : activeRun.status,
      bytes: textBytes(rawRef.current),
      designBytes: textBytes(
        editOutput?.patchSource ?? parsed?.designHtml ?? ''
      ),
      designStarted,
      activities: writeActivity
        ? upsertActivity(activeRun.activities, writeActivity)
        : activeRun.activities
    }
    runRef.current = nextRun
    setRun(nextRun)

    updateProjects((current) =>
      current.map((project) => {
        if (project.id !== activeRun.projectId) return project
        const documentTitle = streamedDesign
          ? parseDesignTitle(streamedDesign)
          : null
        const nextDesign = streamedDesign
          ? streamedDesign.length > 24 || !project.designHtml
            ? streamedDesign
            : project.designHtml
          : project.designHtml
        const revisionStarted =
          activeRun.mode !== 'targeted-edit' &&
          Boolean(parsed?.designStarted) &&
          !activeRun.designStarted

        return {
          ...project,
          title:
            !project.titleEdited && documentTitle ? documentTitle : project.title,
          designHtml: nextDesign,
          audit: revisionStarted ? undefined : project.audit,
          revision: project.revision + (revisionStarted ? 1 : 0),
          messages: project.messages.map((message) =>
            message.id === activeRun.assistantMessageId
              ? {
                  ...message,
                  content:
                    editOutput?.narrative ?? parsed?.narrative ?? message.content,
                  status: message.status === 'error' ? 'error' : 'streaming',
                  activities: writeActivity
                    ? upsertActivity(message.activities, writeActivity)
                    : message.activities
                }
              : message
          )
        }
      })
    )
  }, [updateProjects])

  const scheduleFlush = useCallback(() => {
    if (animationFrameRef.current !== null) return
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null
      flushStream()
    })
  }, [flushStream])

  useEffect(() => {
    document.title = activeProject ? `${activeProject.title} - Kern` : 'Kern'
  }, [activeProject?.title])

  useEffect(() => {
    const unsubscribe = window.kern?.onAgentEvent((event: AgentStreamEvent) => {
      let activeRun = runRef.current
      if (!activeRun) return
      if (!activeRun.requestId) {
        activeRun = { ...activeRun, requestId: event.requestId }
        commitRun(activeRun)
      } else if (activeRun.requestId !== event.requestId) {
        return
      }

      if (event.type === 'activity') {
        const activities = upsertActivity(activeRun.activities, event.activity)
        commitRun({ ...activeRun, activities })
        updateProjects((current) =>
          current.map((project) =>
            project.id === activeRun.projectId
              ? withMessageActivity(
                  project,
                  activeRun.assistantMessageId,
                  event.activity
                )
              : project
          )
        )
        return
      }

      if (event.type === 'assets') {
        commitRun({ ...activeRun, assets: event.assets })
        if (rawRef.current) scheduleFlush()
        return
      }

      if (event.type === 'evidence') {
        commitRun({ ...activeRun, evidence: event.evidence })
        updateProjects((current) =>
          current.map((project) =>
            project.id === activeRun.projectId
              ? {
                  ...project,
                  messages: project.messages.map((message) =>
                    message.id === activeRun.assistantMessageId
                      ? { ...message, evidence: event.evidence }
                      : message
                  )
                }
              : project
          )
        )
        return
      }

      if (event.type === 'telemetry') {
        commitRun({ ...activeRun, telemetry: event.telemetry })
        updateProjects((current) =>
          current.map((project) =>
            project.id === activeRun.projectId
              ? {
                  ...project,
                  messages: project.messages.map((message) =>
                    message.id === activeRun.assistantMessageId
                      ? { ...message, telemetry: event.telemetry }
                      : message
                  )
                }
              : project
          )
        )
        return
      }

      if (event.type === 'delta') {
        rawRef.current += event.delta
        scheduleFlush()
        return
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      flushStream()
      const currentRun = runRef.current
      if (!currentRun) return
      const parsed = parseAgentOutput(rawRef.current)
      const finishedAt = Date.now()

      if (event.type === 'question') {
        const activities = settleActivities(currentRun.activities, 'complete')
        commitRun({
          ...currentRun,
          status: 'done',
          finishedAt,
          activities
        })
        const nextProjects = updateProjects((current) =>
          current.map((project) =>
            project.id !== currentRun.projectId
              ? project
              : {
                  ...project,
                  updatedAt: new Date(finishedAt).toISOString(),
                  messages: project.messages.map((message) =>
                    message.id === currentRun.assistantMessageId
                      ? {
                          ...message,
                          content: clarificationTranscript(event.question),
                          status: 'complete',
                          clarification: event.question,
                          activities
                        }
                      : message
                  )
                }
          )
        )
        const questioned = nextProjects.find(
          (project) => project.id === currentRun.projectId
        )
        if (questioned) void persistProject(questioned)
        return
      }

      if (event.type === 'done') {
        if (!rawRef.current.trim()) {
          const failure = 'The provider finished without returning a response.'
          const activities = settleActivities(currentRun.activities, 'error')
          commitRun({
            ...currentRun,
            status: 'error',
            error: failure,
            finishedAt,
            activities
          })
          const nextProjects = updateProjects((current) =>
            current.map((project) =>
              project.id !== currentRun.projectId
                ? project
                : {
                    ...project,
                    messages: project.messages.map((message) =>
                      message.id === currentRun.assistantMessageId
                        ? {
                            ...message,
                            status: 'error',
                            error: failure,
                            activities
                          }
                        : message
                    )
                  }
            )
          )
          const failedProject = nextProjects.find(
            (project) => project.id === currentRun.projectId
          )
          if (failedProject) void persistProject(failedProject)
          return
        }

        if (currentRun.mode === 'targeted-edit') {
          try {
            if (!currentRun.target) {
              throw new Error('The selected element is no longer available.')
            }
            const editOutput = parseEditPatchOutput(rawRef.current)
            if (!editOutput.patchStarted) {
              throw new Error('The agent did not return a targeted edit.')
            }
            const patch = parseEditPatch(editOutput.patchSource)
            const baseProject = projectsRef.current.find(
              (project) => project.id === currentRun.projectId
            )
            if (!baseProject) {
              throw new Error('The design being edited is no longer available.')
            }
            const patched = applyDesignPatch(
              baseProject.designHtml,
              currentRun.target,
              patch
            )
            const finalDesign = hydrateFetchedAssets(
              patched,
              currentRun.assets
            )
            const finalActivities = settleActivities(
              currentRun.activities,
              'complete'
            )
            commitRun({
              ...currentRun,
              status: 'done',
              finishedAt,
              usage: event.usage,
              metrics: event.metrics,
              activities: finalActivities
            })
            const nextProjects = updateProjects((current) =>
              current.map((project) =>
                project.id !== currentRun.projectId
                  ? project
                  : {
                      ...project,
                      designHtml: finalDesign,
                      revision: project.revision + 1,
                      audit: undefined,
                      versions: addDesignVersion(
                        project.versions ?? [],
                        finalDesign,
                        project.revision + 1
                      ),
                      messages: project.messages.map((message) =>
                        message.id === currentRun.assistantMessageId
                          ? {
                              ...message,
                              content: patch.note,
                              status: 'complete',
                              ...(event.metrics
                                ? {
                                    toolMetrics: event.metrics,
                                    toolComparison: {
                                      evidencePercent: null
                                    }
                                  }
                                : {}),
                              activities: finalActivities
                            }
                          : message
                      )
                    }
              )
            )
            setSelectedTarget(null)
            const completed = nextProjects.find(
              (project) => project.id === currentRun.projectId
            )
            if (completed) {
              void persistProject(completed)
              if (settingsRef.current.reviewAfterBuild) {
                void runReview(
                  completed.id,
                  completed.designHtml,
                  completed.revision,
                  false,
                  currentRun.assistantMessageId,
                  currentRun.baselineIssueCount
                )
              }
            }
          } catch (caught) {
            const message = errorMessage(caught)
            const activities = settleActivities(
              currentRun.activities,
              'error'
            )
            commitRun({
              ...currentRun,
              status: 'error',
              error: message,
              finishedAt,
              activities
            })
            const nextProjects = updateProjects((current) =>
              current.map((project) =>
                project.id !== currentRun.projectId
                  ? project
                  : {
                      ...project,
                      messages: project.messages.map((entry) =>
                        entry.id === currentRun.assistantMessageId
                          ? {
                              ...entry,
                              status: 'error',
                              error: message,
                              activities
                            }
                          : entry
                      )
                    }
              )
            )
            const failed = nextProjects.find(
              (project) => project.id === currentRun.projectId
            )
            if (failed) void persistProject(failed)
            showToast(message, 'error')
          }
          return
        }

        const finalActivities = settleActivities(
          currentRun.activities,
          'complete'
        )
        commitRun({
          ...currentRun,
          status: 'done',
          finishedAt,
          usage: event.usage,
          metrics: event.metrics,
          activities: finalActivities
        })
        const nextProjects = updateProjects((current) =>
          current.map((project) => {
            if (project.id !== currentRun.projectId) return project
            const finalDesign = parsed.designStarted
              ? hydrateFetchedAssets(
                  parsed.designHtml,
                  currentRun.assets
                ) || project.designHtml
              : project.designHtml
            const previousEvidence = [...project.messages]
              .reverse()
              .find(
                (message) =>
                  message.id !== currentRun.assistantMessageId &&
                  message.toolMetrics
              )?.toolMetrics?.evidenceItems
            const evidencePercent =
              event.metrics &&
              previousEvidence &&
              previousEvidence > 0
                ? Math.round(
                    ((event.metrics.evidenceItems - previousEvidence) /
                      previousEvidence) *
                      1000
                  ) / 10
                : null
            return {
              ...project,
              designHtml: finalDesign,
              audit: parsed.designStarted ? undefined : project.audit,
              versions:
                parsed.designStarted && finalDesign.trim()
                  ? addDesignVersion(
                      project.versions ?? [],
                      finalDesign,
                      project.revision
                    )
                  : project.versions,
              messages: project.messages.map((message) =>
                message.id === currentRun.assistantMessageId
                  ? {
                      ...message,
                      content: parsed.narrative,
                      status: 'complete',
                      ...(event.metrics
                        ? {
                            toolMetrics: event.metrics,
                            toolComparison: { evidencePercent }
                          }
                        : {}),
                      activities: finalActivities
                    }
                  : message
              )
            }
          })
        )
        const completed = nextProjects.find(
          (project) => project.id === currentRun.projectId
        )
        if (completed) {
          void persistProject(completed)
          if (
            settingsRef.current.reviewAfterBuild &&
            parsed.designStarted &&
            completed.designHtml.trim()
          ) {
            void runReview(
              completed.id,
              completed.designHtml,
              completed.revision,
              false,
              currentRun.assistantMessageId,
              currentRun.baselineIssueCount
            )
          }
        }
        return
      }

      if (event.type === 'error') {
        const activities = settleActivities(currentRun.activities, 'error')
        commitRun({
          ...currentRun,
          status: 'error',
          error: event.error,
          finishedAt,
          activities
        })
        const nextProjects = updateProjects((current) =>
          current.map((project) =>
            project.id !== currentRun.projectId
              ? project
              : {
                  ...project,
                  audit: parsed.designStarted ? undefined : project.audit,
                  messages: project.messages.map((message) =>
                    message.id === currentRun.assistantMessageId
                      ? {
                          ...message,
                          status: 'error',
                          error: event.error,
                          content: message.content || parsed.narrative,
                          activities
                        }
                      : message
                  )
                }
          )
        )
        const failed = nextProjects.find(
          (project) => project.id === currentRun.projectId
        )
        if (failed) void persistProject(failed)
        return
      }

      if (event.type === 'cancelled') {
        const activities = settleActivities(
          currentRun.activities,
          'cancelled'
        )
        commitRun({
          ...currentRun,
          status: 'cancelled',
          finishedAt,
          activities
        })
        const nextProjects = updateProjects((current) =>
          current.map((project) =>
            project.id !== currentRun.projectId
              ? project
              : {
                  ...project,
                  audit: parsed.designStarted ? undefined : project.audit,
                  messages: project.messages.map((message) =>
                    message.id === currentRun.assistantMessageId
                      ? {
                          ...message,
                          status: 'cancelled',
                          content: message.content || parsed.narrative,
                          activities
                        }
                      : message
                  )
                }
          )
        )
        const cancelled = nextProjects.find(
          (project) => project.id === currentRun.projectId
        )
        if (cancelled) void persistProject(cancelled)
      }
    })

    return () => unsubscribe?.()
  }, [
    commitRun,
    flushStream,
    persistProject,
    runReview,
    scheduleFlush,
    showToast,
    updateProjects
  ])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      const requestId = runRef.current?.requestId
      if (requestId) void window.kern?.cancelAgent(requestId)
    }
  }, [])

  async function generate(
    project: AppProject,
    prompt: string,
    appendUser: boolean,
    options?: {
      mode?: 'design' | 'polish' | 'targeted-edit'
      designMode?: DesignMode
      reviewNotes?: string
      target?: DesignSelection
      referenceImages?: AgentReferenceImage[]
    }
  ): Promise<void> {
    if (runRef.current && ['starting', 'streaming'].includes(runRef.current.status)) {
      throw new Error('The agent is already working.')
    }
    const provider = snapshot.settings.activeProvider
    const model = snapshot.settings.activeModel
    if (!provider || !model) throw new Error('Connect a model before sending a brief.')
    const effort = normalizeEffort(
      provider,
      model,
      snapshot.settings.activeEffort
    )
    const designMode =
      options?.designMode ?? project.designMode ?? selectedDesignMode
    const providerStatus = snapshot.settings.providers.find(
      (item) => item.provider === provider
    )
    const modelInfo = providerStatus?.models.find((item) => item.id === model)
    if (!providerStatus?.connected || !modelInfo) {
      throw new Error('Choose an available model in the agent panel.')
    }

    const now = Date.now()
    const userMessage: ChatMessage | null = appendUser
      ? {
          id: crypto.randomUUID(),
          role: 'user',
          content: prompt.trim(),
          createdAt: new Date(now).toISOString(),
          status: 'complete',
          designMode,
          target: options?.target,
          ...(options?.referenceImages?.length
            ? {
                referenceImages: options.referenceImages,
                referenceVisuals: options.referenceImages
                  .flatMap((image) =>
                    image.visualSummary ? [image.visualSummary] : []
                  )
              }
            : {})
        }
      : null
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date(now).toISOString(),
      status: 'streaming',
      provider,
      model: modelInfo.name,
      effort: effort ?? undefined,
      designMode,
      activities: [],
      evidence: [],
      telemetry: {
        requestStartedAt: new Date(now).toISOString(),
        spans: []
      }
    }

    const messagesWithUser = userMessage
      ? [...project.messages, userMessage]
      : [...project.messages]
    const history = messagesWithUser
      .filter(
        (message) =>
          message.content.trim().length > 0 &&
          (message.role === 'user' || message.status === 'complete')
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.role === 'user' && message.referenceImages?.length
          ? { referenceImages: message.referenceImages }
          : {})
      }))
    const baselineVersions = project.designHtml.trim()
      ? addDesignVersion(
          project.versions ?? [],
          project.designHtml,
          project.revision,
          `Draft ${Math.max(1, project.revision)}`
        )
      : project.versions ?? []
    const nextProject: AppProject = {
      ...project,
      title:
        !project.titleEdited && project.messages.length === 0 && userMessage
          ? deriveProjectTitle(userMessage.content)
          : project.title,
      designMode,
      messages: [...messagesWithUser, assistantMessage],
      versions: baselineVersions,
      updatedAt: new Date(now).toISOString()
    }

    updateProjects((current) =>
      current.some((item) => item.id === nextProject.id)
        ? current.map((item) => (item.id === nextProject.id ? nextProject : item))
        : [nextProject, ...current]
    )
    setActiveProjectId(nextProject.id)
    setAgentDrawerOpen(false)
    auditSequenceRef.current += 1
    setAuditRunningFor(null)
    setAuditError('')
    void persistProject(nextProject)

    rawRef.current = ''
    cancelRequestedRef.current = false
    const startingRun: AgentRunView = {
      requestId: null,
      projectId: nextProject.id,
      assistantMessageId: assistantMessage.id,
      provider,
      model,
      modelName: modelInfo.name,
      startedAt: now,
      status: 'starting',
      bytes: 0,
      designBytes: 0,
      designStarted: false,
      mode: options?.mode ?? 'design',
      designMode,
      target: options?.target,
      baselineIssueCount: project.audit?.issueCount,
      assets: [],
      activities: [],
      evidence: [],
      telemetry: {
        requestStartedAt: new Date(now).toISOString(),
        spans: []
      }
    }
    commitRun(startingRun)

    try {
      const recentDesigns = await prepareRecentDesignSummaries(
        projectsRef.current,
        nextProject.id,
        designMode,
        fingerprintCacheRef.current
      )
      const referenceVisuals = messagesWithUser
        .flatMap((message) => message.referenceImages ?? [])
        .flatMap((image) =>
          image.visualSummary ? [image.visualSummary] : []
        )
        .slice(0, 8)
      const designMemory = snapshot.designMemory
        .filter(
          (entry) =>
            entry.designMode === designMode ||
            entry.kind === 'brand-kit' ||
            entry.kind === 'palette' ||
            entry.kind === 'typography'
        )
        .slice(-6)
      const result = await window.kern?.startAgent({
        provider,
        model,
        effort: effort ?? undefined,
        history,
        currentDesign: project.designHtml,
        designMode,
        mode: options?.mode ?? 'design',
        reviewNotes: options?.reviewNotes,
        target: options?.target,
        recentDesigns,
        referenceVisuals,
        designMemory
      })
      if (!result) throw new Error('The desktop bridge is unavailable.')
      const latestRun = runRef.current
      if (latestRun?.assistantMessageId === assistantMessage.id) {
        commitRun({ ...latestRun, requestId: result.requestId })
      }
      if (cancelRequestedRef.current) {
        await window.kern?.cancelAgent(result.requestId)
      }
    } catch (caught) {
      const message = errorMessage(caught)
      const latestRun = runRef.current
      if (latestRun?.assistantMessageId === assistantMessage.id) {
        const activities = settleActivities(latestRun.activities, 'error')
        commitRun({
          ...latestRun,
          status: 'error',
          error: message,
          finishedAt: Date.now(),
          activities
        })
      }
      const nextProjects = updateProjects((current) =>
        current.map((item) =>
          item.id !== nextProject.id
            ? item
            : {
                ...item,
                messages: item.messages.map((entry) =>
                  entry.id === assistantMessage.id
                    ? {
                        ...entry,
                        status: 'error',
                        error: message,
                        activities: settleActivities(entry.activities, 'error')
                      }
                    : entry
                )
              }
        )
      )
      const failed = nextProjects.find((item) => item.id === nextProject.id)
      if (failed) void persistProject(failed)
      throw caught
    }
  }

  async function sendPrompt(
    text: string,
    target: DesignSelection | null = null,
    referenceImages: AgentReferenceImage[] = []
  ): Promise<void> {
    let project = activeProject
    if (
      project?.designHtml.trim() &&
      project.designMode !== selectedDesignMode
    ) {
      project = null
    }
    if (!project) {
      const now = new Date().toISOString()
      project = {
        id: crypto.randomUUID(),
        title: deriveProjectTitle(text),
        titleEdited: false,
        createdAt: now,
        updatedAt: now,
        designMode: selectedDesignMode,
        messages: [],
        designHtml: '',
        revision: 0,
        versions: []
      }
    }
    await generate(project, text, true, {
      mode: target ? 'targeted-edit' : 'design',
      designMode: selectedDesignMode,
      target: target ?? undefined,
      referenceImages
    })
  }

  function openInspector(tab: InspectorTab): void {
    if (!activeProject?.designHtml.trim()) return
    setInspectorTab(tab)
    setAuditError('')
    if (
      (tab === 'review' || tab === 'reference' || tab === 'memory') &&
      (activeProject.audit?.revision !== activeProject.revision ||
        !activeProject.audit) &&
      auditRunningFor !== activeProject.id
    ) {
      void runReview(
        activeProject.id,
        activeProject.designHtml,
        activeProject.revision,
        true
      )
    }
  }

  function fixMeasuredIssues(): void {
    if (!activeProject || isGenerating) return
    if (activeProject.audit?.revision !== activeProject.revision) return
    const reviewNotes = formatAuditForAgent(activeProject.audit)
    setInspectorTab('review')
    void generate(
      activeProject,
      'Repair the measured review issues and keep the established direction.',
      true,
      { mode: 'polish', reviewNotes }
    ).catch((caught: unknown) => {
      showToast(errorMessage(caught), 'error')
    })
  }

  function quickRefine(prompt: string): void {
    if (!activeProject || isGenerating) return
    void sendPrompt(prompt).catch((caught: unknown) => {
      showToast(errorMessage(caught), 'error')
    })
  }

  function restoreVersion(versionId: string): void {
    if (!activeProject || isGenerating) return
    const version = activeProject.versions.find((item) => item.id === versionId)
    if (!version) return

    auditSequenceRef.current += 1
    setAuditRunningFor(null)
    setAuditError('')
    const now = new Date().toISOString()
    const versions = activeProject.designHtml.trim()
      ? addDesignVersion(
          activeProject.versions,
          activeProject.designHtml,
          activeProject.revision
        )
      : activeProject.versions
    const restoredProject: AppProject = {
      ...activeProject,
      designHtml: version.designHtml,
      revision: activeProject.revision + 1,
      audit: undefined,
      versions,
      updatedAt: now
    }
    commitRun(null)
    setSelectedTarget(null)
    updateProjects((current) =>
      current.map((project) =>
        project.id === restoredProject.id ? restoredProject : project
      )
    )
    void persistProject(restoredProject)
    showToast(`Restored ${version.label}`, 'success')
    if (settingsRef.current.reviewAfterBuild) {
      void runReview(
        restoredProject.id,
        restoredProject.designHtml,
        restoredProject.revision
      )
    }
  }

  async function retryLast(): Promise<void> {
    if (!activeProject) return
    const failedIndex = [...activeProject.messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(
        ({ message }) =>
          message.role === 'assistant' && message.status === 'error'
      )?.index
    if (failedIndex === undefined) return

    const retriedProject: AppProject = {
      ...activeProject,
      messages: activeProject.messages.filter((_message, index) => index !== failedIndex)
    }
    updateProjects((current) =>
      current.map((project) =>
        project.id === retriedProject.id ? retriedProject : project
      )
    )
    try {
      await generate(retriedProject, '', false)
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
    }
  }

  function stopGeneration(): void {
    const requestId = runRef.current?.requestId
    cancelRequestedRef.current = true
    if (requestId) {
      void window.kern?.cancelAgent(requestId).catch((caught: unknown) => {
        showToast(errorMessage(caught), 'error')
      })
    }
  }

  function newDesign(): void {
    if (isGenerating) stopGeneration()
    commitRun(null)
    setActiveProjectId(null)
    setAgentDrawerOpen(false)
    setInspectorTab(null)
    setSelectedTarget(null)
    setAuditError('')
  }

  function selectProject(projectId: string): void {
    if (isGenerating) return
    commitRun(null)
    setActiveProjectId(projectId)
    const selected = projectsRef.current.find(
      (project) => project.id === projectId
    )
    if (selected) setSelectedDesignMode(selected.designMode)
    setHistoryOpen(false)
    setAgentDrawerOpen(false)
    setSelectedTarget(null)
    setAuditError('')
  }

  async function deleteProject(projectId: string): Promise<void> {
    try {
      await window.kern?.deleteProject(projectId)
      const next = updateProjects((current) =>
        current.filter((project) => project.id !== projectId)
      )
      if (activeProjectId === projectId) {
        const nextProject = next[0] ?? null
        setActiveProjectId(nextProject?.id ?? null)
        if (nextProject) setSelectedDesignMode(nextProject.designMode)
        commitRun(null)
        setInspectorTab(null)
        setSelectedTarget(null)
      }
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
      throw caught
    }
  }

  function renameProject(title: string): void {
    if (!activeProject) return
    const nextTitle = title.slice(0, 80)
    updateProjects((current) =>
      current.map((project) =>
        project.id === activeProject.id
          ? { ...project, title: nextTitle, titleEdited: true }
          : project
      )
    )
  }

  function commitRename(): void {
    const latest = projectsRef.current.find(
      (project) => project.id === activeProjectId
    )
    if (latest) void persistProject(latest)
  }

  async function exportDesign(): Promise<void> {
    if (!activeProject?.designHtml) return
    setExporting(true)
    try {
      const result =
        activeProject.designMode === 'motion'
          ? await window.kern?.exportMotion(
              activeProject.designHtml,
              activeProject.title
            )
          : await window.kern?.exportHtml(
              activeProject.designHtml,
              activeProject.title,
              activeProject.designMode
            )
      if (result?.saved) {
        const name = result.filePath?.split(/[\\/]/).pop()
        showToast(name ? `Exported ${name}` : 'Design exported', 'success')
      }
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
    } finally {
      setExporting(false)
    }
  }

  async function saveCurrentDesignMemory(): Promise<void> {
    if (!activeProject?.audit || !window.kern) return
    const audit =
      activeProject.audit.revision === activeProject.revision
        ? activeProject.audit
        : undefined
    if (!audit) {
      showToast('Review this draft before saving its design system.', 'error')
      return
    }
    const entry: DesignMemoryEntry = {
      id: `memory-${activeProject.id}-${activeProject.revision}`,
      kind:
        activeProject.designMode === 'logo'
          ? 'logo'
          : 'brand-kit',
      name: activeProject.title.slice(0, 80),
      designMode: activeProject.designMode,
      palette: audit.palette,
      fonts: audit.fonts,
      fingerprint: audit.viewports.find(
        (viewport) => viewport.viewport === 'desktop'
      )?.fingerprint,
      sourceProjectId: activeProject.id,
      sourceTitle: activeProject.title,
      ...(activeProject.designMode === 'logo' ||
      activeProject.designMode === 'vector'
        ? { artifactHtml: activeProject.designHtml }
        : {}),
      createdAt: new Date().toISOString()
    }
    try {
      const next = await window.kern.saveDesignMemory(entry)
      onSnapshot(next)
      showToast('Saved the direction to design memory.', 'success')
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
      throw caught
    }
  }

  async function saveReferenceMemory(
    image: AgentReferenceImage
  ): Promise<void> {
    if (!activeProject || !window.kern) return
    const entry: DesignMemoryEntry = {
      id: `reference-${activeProject.id}-${image.id}`,
      kind: 'asset',
      name: image.name,
      designMode: activeProject.designMode,
      palette: image.visualSummary?.palette ?? [],
      fonts: [],
      sourceProjectId: activeProject.id,
      sourceTitle: activeProject.title,
      assetUrls: [image.dataUrl],
      createdAt: new Date().toISOString()
    }
    try {
      const next = await window.kern.saveDesignMemory(entry)
      onSnapshot(next)
      showToast('Saved the reference as an approved asset.', 'success')
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
      throw caught
    }
  }

  async function deleteDesignMemoryEntry(entryId: string): Promise<void> {
    if (!window.kern) return
    try {
      const next = await window.kern.deleteDesignMemory(entryId)
      onSnapshot(next)
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
      throw caught
    }
  }

  async function openPreview(): Promise<void> {
    if (!activeProject?.designHtml) return
    try {
      await window.kern?.openPreview(activeProject.designHtml, activeProject.title)
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
    }
  }

  const modePending =
    Boolean(activeProject) && activeProject?.designMode !== selectedDesignMode
  const selectedModeLabel = {
    website: 'website',
    logo: 'logo',
    vector: 'vector',
    motion: 'motion'
  }[selectedDesignMode]

  return (
    <div className="studio-page">
      <header className="app-topbar studio-topbar">
        <Wordmark />
        <span className="topbar-separator" aria-hidden="true" />
        <button
          aria-label="Open agent"
          className="icon-button mobile-agent-toggle"
          data-tooltip="Agent"
          onClick={() => setAgentDrawerOpen(true)}
          type="button"
        >
          <MessageSquare aria-hidden="true" size={16} />
        </button>
        <div className="project-heading">
          {activeProject && !modePending ? (
            <h1>
              <input
                aria-label="Project title"
                maxLength={80}
                onBlur={commitRename}
                onChange={(event) => renameProject(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                spellCheck={false}
                value={activeProject.title}
              />
            </h1>
          ) : (
            <h1>{modePending ? `New ${selectedModeLabel}` : 'Untitled design'}</h1>
          )}
        </div>

        <div className="mobile-topbar-actions">
          <button
            aria-label="Open saved designs"
            className="icon-button"
            data-tooltip="Designs"
            disabled={isGenerating}
            onClick={() => setHistoryOpen(true)}
            type="button"
          >
            <Clock3 aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="Open settings"
            className="icon-button"
            data-tooltip="Settings"
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            <Settings2 aria-hidden="true" size={16} />
          </button>
        </div>
        <div className="topbar-window-space" />
      </header>

      <div className="studio-body">
        <nav aria-label="Workspace" className="app-rail">
          <div className="rail-group">
            <button
              aria-label="New design"
              className="icon-button rail-button"
              data-tooltip="New design"
              disabled={isGenerating}
              onClick={newDesign}
              type="button"
            >
              <Plus aria-hidden="true" size={18} />
            </button>
            <button
              aria-label="Saved designs"
              className="icon-button rail-button"
              data-tooltip="Saved designs"
              disabled={isGenerating}
              onClick={() => setHistoryOpen(true)}
              type="button"
            >
              <Clock3 aria-hidden="true" size={17} />
            </button>
          </div>
          <div className="rail-group">
            <button
              aria-label="Settings"
              className="icon-button rail-button"
              data-tooltip="Settings"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              <Settings2 aria-hidden="true" size={17} />
            </button>
          </div>
        </nav>

        <AgentPanel
          designMode={selectedDesignMode}
          isGenerating={isGenerating}
          isMobileOpen={agentDrawerOpen}
          onCloseMobile={() => setAgentDrawerOpen(false)}
          onClearTarget={clearSelectedTarget}
          onDesignModeChange={(mode) => {
            setSelectedDesignMode(mode)
            commitRun(null)
            setSelectedTarget(null)
            setInspectorTab(null)
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onRetry={() => void retryLast()}
          onSend={sendPrompt}
          onSnapshot={onSnapshot}
          onStop={stopGeneration}
          project={activeProject}
          run={run}
          selectedTarget={selectedTarget}
          snapshot={snapshot}
        />
        {agentDrawerOpen ? (
          <button
            aria-label="Close agent panel"
            className="mobile-panel-backdrop"
            onClick={() => setAgentDrawerOpen(false)}
            type="button"
          />
        ) : null}

        <div className="canvas-column">
          <PreviewCanvas
            auditing={isAuditingActive}
            designMode={selectedDesignMode}
            exporting={exporting}
            inspectorOpen={Boolean(inspectorTab)}
            onExport={() => void exportDesign()}
            onOpenInspector={openInspector}
            onOpenPreview={() => void openPreview()}
            onQuickRefine={quickRefine}
            onRequestTargetEdit={requestTargetEdit}
            onRetry={() => void retryLast()}
            onSelectTarget={setSelectedTarget}
            project={activeProject}
            run={run}
            selectedTarget={selectedTarget}
          />
          {inspectorTab && activeProject ? (
            <DesignInspector
              activeTab={inspectorTab}
              auditError={auditError}
              auditing={isAuditingActive}
              designMemory={snapshot.designMemory}
              isGenerating={isGenerating}
              onClose={() => setInspectorTab(null)}
              onDeleteMemory={deleteDesignMemoryEntry}
              onFixIssues={fixMeasuredIssues}
              onRestoreVersion={restoreVersion}
              onRunReview={() =>
                void runReview(
                  activeProject.id,
                  activeProject.designHtml,
                  activeProject.revision,
                  true,
                  undefined,
                  activeProject.audit?.issueCount
                )
              }
              onSaveReference={saveReferenceMemory}
              onSaveMemory={saveCurrentDesignMemory}
              onTabChange={openInspector}
              project={activeProject}
            />
          ) : null}
        </div>
      </div>

      {settingsOpen ? (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onSnapshot={onSnapshot}
          snapshot={snapshot}
        />
      ) : null}
      {historyOpen ? (
        <ProjectHistoryDialog
          activeProjectId={activeProjectId}
          onClose={() => setHistoryOpen(false)}
          onDelete={deleteProject}
          onNew={() => {
            setHistoryOpen(false)
            newDesign()
          }}
          onSelect={selectProject}
          projects={projects}
        />
      ) : null}

      {toast ? (
        <div className={`toast is-${toast.kind}`} key={toast.id} role="status">
          {toast.kind === 'success' ? (
            <CheckCircle2 aria-hidden="true" size={16} />
          ) : (
            <AlertCircle aria-hidden="true" size={16} />
          )}
          <span>{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            className="icon-button toast-close"
            onClick={() => setToast(null)}
            type="button"
          >
            <X aria-hidden="true" size={13} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
