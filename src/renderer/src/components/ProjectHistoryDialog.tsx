import {
  Check,
  Clapperboard,
  FilePlus2,
  Globe2,
  LayoutGrid,
  PenTool,
  Plus,
  Shapes,
  Trash2,
  X
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { AppProject, DesignMode } from '../../../shared/types'
import { textBytes } from '../lib/agentOutput'
import { formatBytes, formatUpdatedAt } from '../lib/format'
import { useModalFocus } from '../lib/useModalFocus'

type LibraryFilter = DesignMode | 'all'

const modeDefinitions: Array<{
  id: DesignMode
  label: string
  plural: string
  icon: typeof Globe2
}> = [
  {
    id: 'website',
    label: 'Website',
    plural: 'Websites',
    icon: Globe2
  },
  { id: 'logo', label: 'Logo', plural: 'Logos', icon: PenTool },
  { id: 'vector', label: 'Vector', plural: 'Vectors', icon: Shapes },
  {
    id: 'motion',
    label: 'Motion',
    plural: 'Motion',
    icon: Clapperboard
  }
]

const designModeLabels = Object.fromEntries(
  modeDefinitions.map((mode) => [mode.id, mode.label])
) as Record<DesignMode, string>

function libraryPreview(project: AppProject): string | null {
  const screenshots =
    project.audit?.runtime?.screenshots ?? project.audit?.screenshots ?? []
  if (screenshots.length === 0) return null
  if (project.designMode === 'motion') {
    return (
      screenshots.find((screenshot) => screenshot.label === 'Midpoint')
        ?.assetUrl ??
      screenshots[Math.floor(screenshots.length / 2)]?.assetUrl ??
      screenshots[0]?.assetUrl ??
      null
    )
  }
  if (project.designMode === 'website') {
    return (
      screenshots.find((screenshot) => screenshot.viewport === 'desktop')
        ?.assetUrl ??
      screenshots[0]?.assetUrl ??
      null
    )
  }
  return screenshots[0]?.assetUrl ?? null
}

interface ProjectHistoryDialogProps {
  activeProjectId: string | null
  onClose: () => void
  onDelete: (projectId: string) => Promise<void>
  onNew: () => void
  onSelect: (projectId: string) => void
  projects: AppProject[]
}

export function ProjectHistoryDialog({
  activeProjectId,
  onClose,
  onDelete,
  onNew,
  onSelect,
  projects
}: ProjectHistoryDialogProps): React.JSX.Element {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null)
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const dialogRef = useRef<HTMLElement>(null)
  useModalFocus(dialogRef, onClose)

  const counts = {
    all: projects.length,
    ...Object.fromEntries(
      modeDefinitions.map((mode) => [
        mode.id,
        projects.filter((project) => project.designMode === mode.id).length
      ])
    )
  } as Record<LibraryFilter, number>
  const visibleProjects =
    filter === 'all'
      ? projects
      : projects.filter((project) => project.designMode === filter)
  const activeMode = modeDefinitions.find((mode) => mode.id === filter)
  const usedModeCount = modeDefinitions.filter(
    (mode) => counts[mode.id] > 0
  ).length

  async function removeProject(projectId: string): Promise<void> {
    setBusyDeleteId(projectId)
    try {
      await onDelete(projectId)
      setPendingDeleteId(null)
    } finally {
      setBusyDeleteId(null)
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby="library-title"
        aria-describedby="library-description"
        aria-modal="true"
        className="history-dialog library-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div>
            <h2 id="library-title">Library</h2>
            <p id="library-description">
              {projects.length === 0
                ? 'No saved projects'
                : `${projects.length} saved ${
                    projects.length === 1 ? 'project' : 'projects'
                  } across ${usedModeCount} ${usedModeCount === 1 ? 'mode' : 'modes'}`}
            </p>
          </div>
          <div className="dialog-header-actions">
            <button
              className="primary-button compact"
              onClick={onNew}
              type="button"
            >
              <Plus aria-hidden="true" size={14} />
              New
            </button>
            <button
              aria-label="Close library"
              className="icon-button"
              data-autofocus
              data-tooltip="Close"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
        </header>

        <div
          aria-label="Filter library by design mode"
          className="library-mode-tabs"
          role="group"
        >
          <button
            aria-pressed={filter === 'all'}
            className={filter === 'all' ? 'is-active' : ''}
            onClick={() => setFilter('all')}
            type="button"
          >
            <LayoutGrid aria-hidden="true" size={13} />
            <span>All</span>
            <small>{counts.all}</small>
          </button>
          {modeDefinitions.map((mode) => {
            const Icon = mode.icon
            return (
              <button
                aria-pressed={filter === mode.id}
                className={filter === mode.id ? 'is-active' : ''}
                key={mode.id}
                onClick={() => setFilter(mode.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={13} />
                <span>{mode.plural}</span>
                <small>{counts[mode.id]}</small>
              </button>
            )
          })}
        </div>

        <div className="library-scroll">
          {visibleProjects.length === 0 ? (
            <div className="history-empty">
              <FilePlus2 aria-hidden="true" size={26} />
              <h3>{activeMode ? `No ${activeMode.plural.toLowerCase()} yet` : 'No projects yet'}</h3>
              <p>
                {activeMode
                  ? `Start a new ${activeMode.label.toLowerCase()} from the agent panel.`
                  : 'Start with a brief in the agent panel.'}
              </p>
            </div>
          ) : (
            <div className="library-grid">
              {visibleProjects.map((project) => {
                const active = project.id === activeProjectId
                const designSize = textBytes(project.designHtml)
                const versionCount = project.versions?.length ?? 0
                const mode = modeDefinitions.find(
                  (entry) => entry.id === project.designMode
                )
                const Icon = mode?.icon ?? Globe2
                const previewUrl = libraryPreview(project)
                return (
                  <article
                    className={`library-card is-${project.designMode} ${active ? 'is-active' : ''}`}
                    key={project.id}
                  >
                    <button
                      aria-current={active ? 'page' : undefined}
                      aria-label={`Open ${project.title}, ${designModeLabels[project.designMode]}`}
                      className="library-card-main"
                      onClick={() => onSelect(project.id)}
                      type="button"
                    >
                      <span className="library-preview">
                        {previewUrl ? (
                          <img
                            alt=""
                            decoding="async"
                            loading="lazy"
                            src={previewUrl}
                          />
                        ) : (
                          <span className="library-preview-empty">
                            <Icon aria-hidden="true" size={19} />
                            <span>
                              {project.designHtml.trim()
                                ? 'Open to review'
                                : 'Brief only'}
                            </span>
                          </span>
                        )}
                        <span className="library-mode-mark">
                          <Icon aria-hidden="true" size={11} />
                          {mode?.label}
                        </span>
                        {active ? (
                          <span className="library-active-mark">
                            <Check aria-hidden="true" size={11} />
                            Open
                          </span>
                        ) : null}
                      </span>
                      <span className="library-card-copy">
                        <span className="library-card-title">{project.title}</span>
                        <span className="library-card-meta">
                          Updated {formatUpdatedAt(project.updatedAt)}
                        </span>
                        <span className="library-card-foot">
                          <span>
                            {designSize > 0
                              ? formatBytes(designSize)
                              : 'Brief only'}
                          </span>
                          {versionCount > 0 ? (
                            <span>
                              {versionCount} {versionCount === 1 ? 'version' : 'versions'}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>

                    {pendingDeleteId === project.id ? (
                      <span className="library-delete-confirm">
                        <button
                          className="text-button destructive-text"
                          disabled={busyDeleteId === project.id}
                          onClick={() => void removeProject(project.id)}
                          type="button"
                        >
                          {busyDeleteId === project.id ? 'Deleting' : 'Delete'}
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setPendingDeleteId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        aria-label={`Delete ${project.title}`}
                        className="icon-button library-delete"
                        data-tooltip="Delete"
                        onClick={() => setPendingDeleteId(project.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={14} />
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
