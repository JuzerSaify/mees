import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  CircleAlert,
  Columns2,
  Code2,
  Eye,
  FileCode2,
  FileImage,
  Frame,
  History,
  LoaderCircle,
  Minus,
  Monitor,
  PenTool,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Tablet,
  Wrench,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentReferenceImage,
  AppProject,
  DesignAudit,
  DesignMemoryEntry,
  DesignVersion
} from '../../../shared/types'
import { formatUpdatedAt } from '../lib/format'
import {
  groupDesignIssues,
  type GroupedDesignIssue
} from '../lib/designAudit'
import {
  createGeneratedFileManifest,
  type GeneratedFile
} from '../lib/designFiles'

export type InspectorTab =
  | 'review'
  | 'reference'
  | 'memory'
  | 'versions'
  | 'files'

interface DesignInspectorProps {
  activeTab: InspectorTab
  auditError: string
  auditing: boolean
  designMemory: DesignMemoryEntry[]
  isGenerating: boolean
  onClose: () => void
  onDeleteMemory: (entryId: string) => Promise<void>
  onFixIssues: () => void
  onRestoreVersion: (versionId: string) => void
  onRunReview: () => void
  onSaveReference: (image: AgentReferenceImage) => Promise<void>
  onSaveMemory: () => Promise<void>
  onTabChange: (tab: InspectorTab) => void
  project: AppProject
}

const viewportIcons = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone
} as const

function ReviewView({
  audit,
  auditError,
  auditing,
  isGenerating,
  onFixIssues,
  onRunReview,
  project
}: {
  audit: DesignAudit | undefined
  auditError: string
  auditing: boolean
  isGenerating: boolean
  onFixIssues: () => void
  onRunReview: () => void
  project: AppProject
}): React.JSX.Element {
  const currentAudit = audit?.revision === project.revision ? audit : undefined
  const issues = currentAudit?.issues ?? []
  const groupedIssues = groupDesignIssues(issues)
  const errors = groupedIssues.filter(
    ({ issue }) => issue.severity === 'error'
  ).length
  const warnings = groupedIssues.length - errors
  const evidence = [...project.messages]
    .reverse()
    .find((message) => message.evidence?.length)?.evidence

  if (!project.designHtml.trim()) {
    return (
      <div className="inspector-empty">
        <ScanSearch aria-hidden="true" size={25} />
        <h3>No draft to review</h3>
        <p>Generate a design first. The review measures the rendered page, not the prompt.</p>
      </div>
    )
  }

  if (auditing) {
    const loadingCopy =
      project.designMode === 'motion'
        ? 'Checking canvas, timing, silent export and motion API.'
        : project.designMode === 'logo' || project.designMode === 'vector'
          ? 'Checking SVG structure, accessibility and vector-only integrity.'
          : 'Checking layout, accessibility and generated-page patterns. This stays local.'
    return (
      <div className="inspector-loading">
        <LoaderCircle aria-hidden="true" className="spin" size={24} />
        <h3>Measuring the design</h3>
        <p>{loadingCopy}</p>
      </div>
    )
  }

  if (auditError) {
    return (
      <div className="inspector-empty">
        <CircleAlert aria-hidden="true" size={24} />
        <h3>Review unavailable</h3>
        <p>{auditError}</p>
        <button className="secondary-button compact" onClick={onRunReview} type="button">
          <RefreshCw aria-hidden="true" size={13} />
          Try again
        </button>
      </div>
    )
  }

  if (!currentAudit) {
    const emptyCopy =
      project.designMode === 'motion'
        ? 'Check the canvas, timing and silent-export contract.'
        : project.designMode === 'logo' || project.designMode === 'vector'
          ? 'Check SVG structure, accessibility and vector integrity.'
          : 'Measure layout, touch targets, imagery, labels and repeated design patterns across three widths.'
    return (
      <div className="inspector-empty">
        <ScanSearch aria-hidden="true" size={25} />
        <h3>Review this draft</h3>
        <p>{emptyCopy}</p>
        <button className="primary-button compact" onClick={onRunReview} type="button">
          <ScanSearch aria-hidden="true" size={13} />
          Run review
        </button>
      </div>
    )
  }

  return (
    <div className="review-view">
      <section className={`review-summary ${groupedIssues.length > 0 ? 'has-issues' : 'is-clear'}`}>
        <div className="review-summary-icon">
          {groupedIssues.length > 0 ? (
            <AlertTriangle aria-hidden="true" size={20} />
          ) : (
            <Check aria-hidden="true" size={20} />
          )}
        </div>
        <div>
          <h3>
            {groupedIssues.length > 0
              ? `${groupedIssues.length} ${groupedIssues.length === 1 ? 'issue' : 'issues'} found`
              : 'No measured issues'}
          </h3>
          <p>
            {groupedIssues.length > 0
              ? `${errors} ${errors === 1 ? 'blocking issue' : 'blocking issues'}, ${warnings} ${
                  warnings === 1 ? 'advisory finding' : 'advisory findings'
                } ${currentAudit.mode === 'website' ? 'across three widths' : 'in the generated artifact'}.`
              : 'The structural and artifact-specific checks passed.'}
          </p>
          {currentAudit.runtime ? (
            <span className="review-runtime-stamp">
              Browser playback completed in{' '}
              {(currentAudit.runtime.durationMs / 1000).toFixed(1)}s with{' '}
              {currentAudit.runtime.screenshots.length} captured view
              {currentAudit.runtime.screenshots.length === 1 ? '' : 's'};{' '}
              {currentAudit.runtime.consoleErrors.length === 0 &&
              currentAudit.runtime.pageErrors.length === 0 &&
              currentAudit.runtime.networkFailures.length === 0
                ? 'console and resource checks passed.'
                : 'runtime findings need attention.'}
            </span>
          ) : null}
        </div>
      </section>

      <div className="review-viewports">
        {currentAudit.viewports.map((viewport) => {
          const Icon = viewportIcons[viewport.viewport]
          return (
            <div className="review-viewport" key={viewport.viewport}>
              <Icon aria-hidden="true" size={14} />
              <span>{viewport.width}px</span>
              <strong>{viewport.issues.length === 0 ? 'Clear' : viewport.issues.length}</strong>
            </div>
          )
        })}
      </div>

      {groupedIssues.length > 0 ? (
        <section className="review-section" aria-labelledby="review-findings-title">
          <div className="review-section-heading">
            <h3 id="review-findings-title">Findings</h3>
            <span>{formatUpdatedAt(currentAudit.createdAt)}</span>
          </div>
          <div className="review-issue-list">
            {groupedIssues.map(({ key, issue, viewports }: GroupedDesignIssue) => (
              <article className="review-issue" key={key}>
                <span
                  aria-hidden="true"
                  className={`issue-mark is-${issue.severity}`}
                />
                <div>
                  <h4>
                    {issue.title}
                    <span className="issue-viewport">
                      {viewports.length === 3
                        ? 'All widths'
                        : viewports
                            .map(
                              (viewport) =>
                                `${viewport.charAt(0).toUpperCase()}${viewport.slice(1)}`
                            )
                            .join(', ')}
                    </span>
                  </h4>
                  <p>{issue.detail}</p>
                  {issue.selector ? (
                    <code className="issue-selector">{issue.selector}</code>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="review-section" aria-labelledby="review-material-title">
        <div className="review-section-heading">
          <h3 id="review-material-title">Material</h3>
        </div>
        <div className="review-material">
          <div>
            <span className="review-material-label">Palette</span>
            {currentAudit.palette.length > 0 ? (
              <div className="palette-list" aria-label="Colors found in the design">
                {currentAudit.palette.map((color) => (
                  <span
                    aria-label={color}
                    className="palette-swatch"
                    key={color}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            ) : (
              <span className="review-muted">No solid colors found</span>
            )}
          </div>
          <div>
            <span className="review-material-label">Typography</span>
            <div className="font-list">
              {currentAudit.fonts.length > 0
                ? currentAudit.fonts.join(', ')
                : 'System default'}
            </div>
          </div>
        </div>
      </section>

      {evidence?.length ? (
        <section
          className="review-section"
          aria-labelledby="review-evidence-title"
        >
          <div className="review-section-heading">
            <h3 id="review-evidence-title">Sources used</h3>
            <span>
              {evidence.filter((item) => item.verdict === 'supported').length}
              /{evidence.length} supported
            </span>
          </div>
          <div className="evidence-list">
            {evidence.map((item) => (
              <article className="evidence-row" key={item.id}>
                <span
                  aria-hidden="true"
                  className={`evidence-mark is-${item.verdict}`}
                />
                <div>
                  <h4>{item.claim}</h4>
                  <p>
                    {item.verdict} / {item.qualityScore}% source quality /{' '}
                    {item.freshnessScore}% freshness
                  </p>
                  <div className="evidence-links">
                    {item.citations.map((citation) => (
                      <button
                        key={`${item.id}-${citation.url}`}
                        onClick={() =>
                          void window.kern?.openExternal(citation.url)
                        }
                        title={citation.title}
                        type="button"
                      >
                        {citation.publisher}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="review-actions">
        {groupedIssues.length > 0 ? (
          <button
            className="primary-button"
            disabled={isGenerating}
            onClick={onFixIssues}
            type="button"
          >
            <Wrench aria-hidden="true" size={14} />
            Fix measured issues
          </button>
        ) : null}
        <button
          className="secondary-button"
          disabled={isGenerating}
          onClick={onRunReview}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={13} />
          Run again
        </button>
      </div>
      <p className="review-disclaimer">
        Automated checks cover structure, accessibility and repeatable design patterns. Visual judgment still matters.
      </p>
    </div>
  )
}

function VersionPreview({
  designHtml,
  title
}: {
  designHtml: string
  title: string
}): React.JSX.Element {
  return (
    <div className="version-preview" aria-hidden="true">
      <iframe
        loading="lazy"
        sandbox=""
        srcDoc={designHtml}
        tabIndex={-1}
        title={title}
      />
    </div>
  )
}

function VersionsView({
  isGenerating,
  onRestoreVersion,
  project
}: {
  isGenerating: boolean
  onRestoreVersion: (versionId: string) => void
  project: AppProject
}): React.JSX.Element {
  const versions = [...(project.versions ?? [])]
    .filter((version) => version.designHtml !== project.designHtml)
    .reverse()
    .slice(0, 6)

  if (!project.designHtml && versions.length === 0) {
    return (
      <div className="inspector-empty">
        <History aria-hidden="true" size={25} />
        <h3>No versions yet</h3>
        <p>Snapshots appear after the first edit, so any direction can be restored.</p>
      </div>
    )
  }

  return (
    <div className="versions-view">
      {project.designHtml ? (
        <section className="version-group" aria-labelledby="current-version-title">
          <h3 id="current-version-title">Current</h3>
          <article className="version-row is-current">
            <VersionPreview designHtml={project.designHtml} title="Current design" />
            <div className="version-copy">
              <span className="version-label">Draft {project.revision || 1}</span>
              <span className="version-meta">{formatUpdatedAt(project.updatedAt)}</span>
            </div>
            <span className="current-badge">Current</span>
          </article>
        </section>
      ) : null}

      <section className="version-group" aria-labelledby="earlier-versions-title">
        <h3 id="earlier-versions-title">Earlier drafts</h3>
        {versions.length === 0 ? (
          <p className="versions-empty">Snapshots appear after your next revision.</p>
        ) : (
          <div className="version-list">
            {versions.map((version: DesignVersion) => (
              <article className="version-row" key={version.id}>
                <VersionPreview designHtml={version.designHtml} title={version.label} />
                <div className="version-copy">
                  <span className="version-label">{version.label}</span>
                  <span className="version-meta">{formatUpdatedAt(version.createdAt)}</span>
                </div>
                <button
                  aria-label={`Restore ${version.label}`}
                  className="secondary-button compact"
                  disabled={isGenerating}
                  onClick={() => onRestoreVersion(version.id)}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={13} />
                  Restore
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function fileIcon(kind: GeneratedFile['kind']): typeof Code2 {
  if (kind === 'image') return FileImage
  if (kind === 'svg') return PenTool
  if (kind === 'css' || kind === 'js') return Code2
  return FileCode2
}

function FilesView({ project }: { project: AppProject }): React.JSX.Element {
  const files = useMemo(
    () =>
      createGeneratedFileManifest(
        project.designHtml,
        project.designMode
      ),
    [project.designHtml, project.designMode]
  )

  if (files.length === 0) {
    return (
      <div className="inspector-empty">
        <FileCode2 aria-hidden="true" size={25} />
        <h3>No page files yet</h3>
        <p>Generate a design to inspect its document, styles, scripts and assets.</p>
      </div>
    )
  }

  return (
    <div className="files-view">
      <ul aria-label="Generated page files" className="file-list">
        {files.map((file) => {
          const Icon = fileIcon(file.kind)
          return (
            <li className="file-row" key={file.path}>
              <Icon aria-hidden="true" size={14} />
              <span className="file-path">{file.path}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function latestReferences(project: AppProject) {
  return (
    [...project.messages]
      .reverse()
      .find((message) => message.referenceImages?.length)?.referenceImages ?? []
  )
}

function ReferenceView({
  onSaveReference,
  project
}: {
  onSaveReference: (image: AgentReferenceImage) => Promise<void>
  project: AppProject
}): React.JSX.Element {
  const references = latestReferences(project)
  const [selectedId, setSelectedId] = useState(references[0]?.id ?? '')
  const [mode, setMode] = useState<'overlay' | 'split'>('split')
  const [split, setSplit] = useState(52)
  const [zoom, setZoom] = useState(1)
  const [savingReference, setSavingReference] = useState(false)
  const [captureViewport, setCaptureViewport] = useState<
    'desktop' | 'tablet' | 'mobile'
  >('desktop')
  const [region, setRegion] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const regionStart = useRef<{ x: number; y: number } | null>(null)
  const current =
    project.audit?.screenshots?.find(
      (screenshot) => screenshot.viewport === captureViewport
    ) ??
    project.audit?.screenshots?.find(
      (screenshot) => screenshot.viewport === 'desktop'
    )
  const selected =
    references.find((reference) => reference.id === selectedId) ??
    references[0]

  function point(event: React.PointerEvent<HTMLDivElement>): {
    x: number
    y: number
  } {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(
        0,
        Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)
      ),
      y: Math.max(
        0,
        Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)
      )
    }
  }

  function beginRegion(event: React.PointerEvent<HTMLDivElement>): void {
    if (mode !== 'overlay') return
    const start = point(event)
    regionStart.current = start
    setRegion({ x: start.x, y: start.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function updateRegion(event: React.PointerEvent<HTMLDivElement>): void {
    if (!regionStart.current) return
    const end = point(event)
    const start = regionStart.current
    setRegion({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    })
  }

  function finishRegion(event: React.PointerEvent<HTMLDivElement>): void {
    if (!regionStart.current) return
    updateRegion(event)
    regionStart.current = null
  }

  async function saveReference(): Promise<void> {
    if (!selected) return
    setSavingReference(true)
    try {
      await onSaveReference(selected)
    } finally {
      setSavingReference(false)
    }
  }

  if (references.length === 0) {
    return (
      <div className="inspector-empty">
        <Frame aria-hidden="true" size={25} />
        <h3>No reference images</h3>
        <p>
          Drop reference images into the message composer to measure and compare
          them with the generated artifact.
        </p>
      </div>
    )
  }

  return (
    <div className="reference-view">
      <section className="reference-intro">
        <div>
          <h3>Reference comparison</h3>
          <p>
            The reference stays beside the browser capture. Use split or overlay
            to check proportion, spacing and visual weight.
          </p>
        </div>
        <span>{references.length}</span>
      </section>

      <div className="reference-strip" aria-label="Reference images">
        {references.map((reference, index) => (
          <button
            aria-label={`Compare reference ${index + 1}: ${reference.name}`}
            aria-pressed={selected?.id === reference.id}
            className={selected?.id === reference.id ? 'is-active' : ''}
            key={reference.id}
            onClick={() => setSelectedId(reference.id)}
            type="button"
          >
            <img alt="" decoding="async" src={reference.dataUrl} />
            <span>{index + 1}</span>
          </button>
        ))}
      </div>

      <div className="reference-options">
        <div className="segmented-control" aria-label="Comparison mode">
          <button
            aria-pressed={mode === 'split'}
            className={`segment-button ${mode === 'split' ? 'is-active' : ''}`}
            onClick={() => setMode('split')}
            type="button"
          >
            <Columns2 aria-hidden="true" size={14} />
            Split
          </button>
          <button
            aria-pressed={mode === 'overlay'}
            className={`segment-button ${mode === 'overlay' ? 'is-active' : ''}`}
            onClick={() => setMode('overlay')}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={14} />
            Overlay
          </button>
        </div>
        {mode === 'overlay' ? (
          <label className="reference-opacity">
            <span>Reference</span>
            <input
              aria-label="Reference overlay position"
              max={100}
              min={0}
              onChange={(event) => setSplit(Number(event.target.value))}
              type="range"
              value={split}
            />
            <span>{split}%</span>
          </label>
        ) : null}
      </div>
      <div className="reference-zoom" aria-label="Comparison zoom">
        <button
          aria-label="Zoom out comparison"
          className="icon-button compact-icon"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
          type="button"
        >
          <Minus aria-hidden="true" size={13} />
        </button>
        <button
          aria-label="Reset comparison zoom"
          className="reference-zoom-value"
          onClick={() => setZoom(1)}
          type="button"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in comparison"
          className="icon-button compact-icon"
          disabled={zoom >= 2}
          onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
          type="button"
        >
          <Plus aria-hidden="true" size={13} />
        </button>
        {region ? (
          <button
            className="reference-region-clear"
            onClick={() => setRegion(null)}
            type="button"
          >
            Clear region
          </button>
        ) : null}
        {project.audit?.screenshots?.length ? (
          <div
            className="reference-capture-switch"
            aria-label="Captured viewport"
          >
            {(['desktop', 'tablet', 'mobile'] as const).map((viewport) => {
              const Icon = viewportIcons[viewport]
              return (
                <button
                  aria-label={`Show ${viewport} capture`}
                  aria-pressed={captureViewport === viewport}
                  className={
                    captureViewport === viewport ? 'is-active' : ''
                  }
                  key={viewport}
                  onClick={() => setCaptureViewport(viewport)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={12} />
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {current && selected ? (
        mode === 'split' ? (
          <div className="reference-compare is-split">
            <figure>
              <figcaption>Reference</figcaption>
              <div className="reference-image-well">
                <img
                  alt={selected.name}
                  decoding="async"
                  src={selected.dataUrl}
                  style={{ width: `${zoom * 100}%` }}
                />
              </div>
            </figure>
            <figure>
              <figcaption>
                Current {captureViewport} capture
              </figcaption>
              <div className="reference-image-well">
                <img
                  alt="Current artifact"
                  decoding="async"
                  src={current.assetUrl}
                  style={{ width: `${zoom * 100}%` }}
                />
              </div>
            </figure>
          </div>
        ) : (
          <div
            aria-label="Overlay comparison. Drag to isolate a region."
            className="reference-compare is-overlay"
            onPointerCancel={finishRegion}
            onPointerDown={beginRegion}
            onPointerMove={updateRegion}
            onPointerUp={finishRegion}
          >
            <img
              alt="Current artifact"
              decoding="async"
              src={current.assetUrl}
              style={{ transform: `scale(${zoom})` }}
            />
            <img
              alt={`Reference overlay: ${selected.name}`}
              decoding="async"
              src={selected.dataUrl}
              style={{
                clipPath: `inset(0 ${100 - split}% 0 0)`,
                transform: `scale(${zoom})`
              }}
            />
            <span
              aria-hidden="true"
              className="reference-divider"
              style={{ left: `${split}%` }}
            />
            {region && region.width > 0.5 && region.height > 0.5 ? (
              <span
                aria-hidden="true"
                className="reference-region"
                style={{
                  left: `${region.x}%`,
                  top: `${region.y}%`,
                  width: `${region.width}%`,
                  height: `${region.height}%`
                }}
              />
            ) : null}
          </div>
        )
      ) : (
        <div className="reference-capture-empty">
          <ScanSearch aria-hidden="true" size={19} />
          <p>Run the review to capture the current artifact for comparison.</p>
        </div>
      )}

      {selected?.visualSummary ? (
        <section className="reference-measurements">
          <div className="review-section-heading">
            <h3>Measured visual cues</h3>
            <div className="reference-measurement-actions">
              <span>
                {selected.visualSummary.width} x{' '}
                {selected.visualSummary.height}
              </span>
              <button
                disabled={savingReference}
                onClick={() => void saveReference()}
                type="button"
              >
                <BookmarkPlus aria-hidden="true" size={12} />
                {savingReference ? 'Saving' : 'Save reference'}
              </button>
            </div>
          </div>
          <div className="reference-palette" aria-label="Reference palette">
            {selected.visualSummary.palette.map((color) => (
              <span
                key={color}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <dl className="reference-metrics">
            <div>
              <dt>Aspect</dt>
              <dd>{selected.visualSummary.aspectRatio.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Luminance</dt>
              <dd>
                {Math.round(selected.visualSummary.averageLuminance * 100)}%
              </dd>
            </div>
            <div>
              <dt>Contrast</dt>
              <dd>{Math.round(selected.visualSummary.contrast * 100)}%</dd>
            </div>
            <div>
              <dt>Edge density</dt>
              <dd>
                {Math.round(selected.visualSummary.edgeDensity * 100)}%
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  )
}

function MemoryView({
  designMemory,
  isGenerating,
  onDeleteMemory,
  onSaveMemory,
  project
}: {
  designMemory: DesignMemoryEntry[]
  isGenerating: boolean
  onDeleteMemory: (entryId: string) => Promise<void>
  onSaveMemory: () => Promise<void>
  project: AppProject
}): React.JSX.Element {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState('')

  async function save(): Promise<void> {
    setSaving(true)
    try {
      await onSaveMemory()
    } finally {
      setSaving(false)
    }
  }

  async function remove(entryId: string): Promise<void> {
    setDeleting(entryId)
    try {
      await onDeleteMemory(entryId)
    } finally {
      setDeleting('')
    }
  }

  return (
    <div className="memory-view">
      <section className="memory-intro">
        <div>
          <h3>Design memory</h3>
          <p>
            Approved colors, type and direction are available to future agent
            runs without forcing the same layout.
          </p>
        </div>
        <button
          className="primary-button compact"
          disabled={
            isGenerating ||
            saving ||
            !project.audit ||
            project.audit.revision !== project.revision
          }
          onClick={() => void save()}
          type="button"
        >
          <BookmarkPlus aria-hidden="true" size={13} />
          {saving ? 'Saving' : 'Save this direction'}
        </button>
      </section>

      {designMemory.length === 0 ? (
        <div className="inspector-empty memory-empty">
          <Eye aria-hidden="true" size={24} />
          <h3>No approved direction yet</h3>
          <p>
            Review the artifact, then keep its palette and type as reusable
            design memory.
          </p>
        </div>
      ) : (
        <div className="memory-list">
          {[...designMemory].reverse().map((entry) => (
            <article className="memory-row" key={entry.id}>
              {entry.assetUrls?.[0] ? (
                <img
                  alt=""
                  className="memory-asset-thumbnail"
                  decoding="async"
                  src={entry.assetUrls[0]}
                />
              ) : (
                <div className="memory-swatches" aria-hidden="true">
                  {(entry.palette.length
                    ? entry.palette.slice(0, 4)
                    : ['#e7e9e5', '#d6d9d5']
                  ).map((color, index) => (
                    <span
                      key={`${entry.id}-${color}-${index}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
              <div className="memory-copy">
                <strong>{entry.name}</strong>
                <span>
                  {entry.kind.replace('-', ' ')} / {entry.designMode}
                  {entry.fonts.length ? ` / ${entry.fonts[0]}` : ''}
                </span>
                {entry.sourceTitle && entry.sourceTitle !== entry.name ? (
                  <small>{entry.sourceTitle}</small>
                ) : null}
              </div>
              <button
                aria-label={`Remove ${entry.name} from design memory`}
                className="icon-button memory-delete"
                data-tooltip="Remove"
                disabled={Boolean(deleting)}
                onClick={() => void remove(entry.id)}
                type="button"
              >
                {deleting === entry.id ? (
                  <LoaderCircle aria-hidden="true" className="spin" size={13} />
                ) : (
                  <Trash2 aria-hidden="true" size={13} />
                )}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export function DesignInspector({
  activeTab,
  auditError,
  auditing,
  designMemory,
  isGenerating,
  onClose,
  onDeleteMemory,
  onFixIssues,
  onRestoreVersion,
  onRunReview,
  onSaveReference,
  onSaveMemory,
  onTabChange,
  project
}: DesignInspectorProps): React.JSX.Element {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <aside aria-label="Design tools" className="design-inspector">
      <header className="inspector-header">
        <div aria-label="Design tools" className="inspector-tabs" role="tablist">
          <button
            aria-controls="design-tools-panel"
            aria-selected={activeTab === 'review'}
            className={activeTab === 'review' ? 'is-active' : ''}
            id="review-tab"
            onClick={() => onTabChange('review')}
            role="tab"
            type="button"
          >
            <ScanSearch aria-hidden="true" size={14} />
            Review
          </button>
          <button
            aria-controls="design-tools-panel"
            aria-selected={activeTab === 'reference'}
            className={activeTab === 'reference' ? 'is-active' : ''}
            id="reference-tab"
            onClick={() => onTabChange('reference')}
            role="tab"
            type="button"
          >
            <Columns2 aria-hidden="true" size={14} />
            Reference
          </button>
          <button
            aria-controls="design-tools-panel"
            aria-selected={activeTab === 'memory'}
            className={activeTab === 'memory' ? 'is-active' : ''}
            id="memory-tab"
            onClick={() => onTabChange('memory')}
            role="tab"
            type="button"
          >
            <BookmarkPlus aria-hidden="true" size={14} />
            Memory
          </button>
          <button
            aria-controls="design-tools-panel"
            aria-selected={activeTab === 'versions'}
            className={activeTab === 'versions' ? 'is-active' : ''}
            id="versions-tab"
            onClick={() => onTabChange('versions')}
            role="tab"
            type="button"
          >
            <History aria-hidden="true" size={14} />
            Versions
          </button>
          <button
            aria-controls="design-tools-panel"
            aria-selected={activeTab === 'files'}
            className={activeTab === 'files' ? 'is-active' : ''}
            id="files-tab"
            onClick={() => onTabChange('files')}
            role="tab"
            type="button"
          >
            <FileCode2 aria-hidden="true" size={14} />
            Files
          </button>
        </div>
        <button
          aria-label="Close design tools"
          className="icon-button"
          data-tooltip="Close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <div
        aria-labelledby={
          activeTab === 'review'
            ? 'review-tab'
            : activeTab === 'reference'
              ? 'reference-tab'
              : activeTab === 'memory'
                ? 'memory-tab'
            : activeTab === 'versions'
              ? 'versions-tab'
              : 'files-tab'
        }
        className="inspector-scroll"
        id="design-tools-panel"
        role="tabpanel"
      >
        {activeTab === 'review' ? (
          <ReviewView
            audit={project.audit}
            auditError={auditError}
            auditing={auditing}
            isGenerating={isGenerating}
            onFixIssues={onFixIssues}
            onRunReview={onRunReview}
            project={project}
          />
        ) : activeTab === 'reference' ? (
          <ReferenceView
            onSaveReference={onSaveReference}
            project={project}
          />
        ) : activeTab === 'memory' ? (
          <MemoryView
            designMemory={designMemory}
            isGenerating={isGenerating}
            onDeleteMemory={onDeleteMemory}
            onSaveMemory={onSaveMemory}
            project={project}
          />
        ) : activeTab === 'versions' ? (
          <VersionsView
            isGenerating={isGenerating}
            onRestoreVersion={onRestoreVersion}
            project={project}
          />
        ) : (
          <FilesView project={project} />
        )}
      </div>
    </aside>
  )
}
