import {
  AlertTriangle,
  Check,
  CircleAlert,
  Code2,
  FileCode2,
  FileImage,
  History,
  LoaderCircle,
  Monitor,
  PenTool,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Smartphone,
  Tablet,
  Wrench,
  X
} from 'lucide-react'
import { useEffect, useMemo } from 'react'
import type {
  AppProject,
  DesignAudit,
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

export type InspectorTab = 'review' | 'versions' | 'files'

interface DesignInspectorProps {
  activeTab: InspectorTab
  auditError: string
  auditing: boolean
  isGenerating: boolean
  onClose: () => void
  onFixIssues: () => void
  onRestoreVersion: (versionId: string) => void
  onRunReview: () => void
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

export function DesignInspector({
  activeTab,
  auditError,
  auditing,
  isGenerating,
  onClose,
  onFixIssues,
  onRestoreVersion,
  onRunReview,
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
