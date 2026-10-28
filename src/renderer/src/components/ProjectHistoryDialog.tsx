import { FilePlus2, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { AppProject } from '../../../shared/types'
import { textBytes } from '../lib/agentOutput'
import { formatBytes, formatUpdatedAt } from '../lib/format'
import { useModalFocus } from '../lib/useModalFocus'

const designModeLabels = {
  website: 'Website',
  logo: 'Logo',
  vector: 'Vector',
  motion: 'Motion'
} as const

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
  const dialogRef = useRef<HTMLElement>(null)
  useModalFocus(dialogRef, onClose)

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
        aria-labelledby="projects-title"
        aria-describedby="projects-description"
        aria-modal="true"
        className="history-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div>
            <h2 id="projects-title">Designs</h2>
            <p id="projects-description">
              {projects.length === 0
                ? 'No saved designs'
                : `${projects.length} saved ${projects.length === 1 ? 'design' : 'designs'}`}
            </p>
          </div>
          <div className="dialog-header-actions">
            <button className="primary-button compact" onClick={onNew} type="button">
              <Plus aria-hidden="true" size={14} />
              New
            </button>
            <button
              aria-label="Close designs"
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

        <div className="project-list">
          {projects.length === 0 ? (
            <div className="history-empty">
              <FilePlus2 aria-hidden="true" size={26} />
              <h3>No designs yet</h3>
              <p>Start with a brief in the agent panel.</p>
            </div>
          ) : (
            projects.map((project) => {
              const active = project.id === activeProjectId
              const designSize = textBytes(project.designHtml)
              return (
                <div
                  className={`project-row ${active ? 'is-active' : ''}`}
                  key={project.id}
                >
                  <button
                    aria-current={active ? 'page' : undefined}
                    className="project-row-main"
                    onClick={() => onSelect(project.id)}
                    type="button"
                  >
                    <span className="project-row-copy">
                      <span className="project-row-title">{project.title}</span>
                      <span className="project-row-meta">
                        {designModeLabels[project.designMode]} ·{' '}
                        {formatUpdatedAt(project.updatedAt)}
                      </span>
                    </span>
                    <span className="project-row-size">
                      {designSize > 0 ? formatBytes(designSize) : 'Brief'}
                    </span>
                  </button>

                  {pendingDeleteId === project.id ? (
                    <span className="delete-confirm">
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
                      className="icon-button row-delete-button"
                      data-tooltip="Delete"
                      onClick={() => setPendingDeleteId(project.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
