import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const refinements = [
  {
    label: 'Strengthen hierarchy',
    prompt:
      'Strengthen the visual hierarchy without changing the established concept. Make the primary reading order unmistakable and preserve the current content.'
  },
  {
    label: 'Simplify the layout',
    prompt:
      'Simplify the layout and remove decorative or repetitive elements while preserving the useful content and the established art direction.'
  },
  {
    label: 'Fix the mobile view',
    prompt:
      'Improve the mobile composition at 390px. Remove cramped spacing, prevent horizontal overflow, and preserve the page character.'
  },
  {
    label: 'Tighten typography',
    prompt:
      'Refine the typography with a clearer scale, consistent line lengths and better rhythm at desktop and mobile widths.'
  },
  {
    label: 'Raise accessibility',
    prompt:
      'Improve contrast, focus treatments, accessible labels and touch targets without making the design look like a generic accessibility template.'
  },
  {
    label: 'Make it distinctive',
    prompt:
      'Make the design more specific to its subject. Replace generic composition or stock card patterns with one meaningful visual idea rooted in the content.'
  }
]

interface RefineMenuProps {
  disabled: boolean
  onSelect: (prompt: string) => void
}

export function RefineMenu({ disabled, onSelect }: RefineMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="refine-control" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="toolbar-action refine-trigger"
        data-tooltip="Refine"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={14} />
        <span>Refine</span>
        <ChevronDown aria-hidden="true" size={11} />
      </button>
      {open ? (
        <div className="refine-menu" role="menu">
          <div className="refine-menu-heading">Refine this draft</div>
          {refinements.map((refinement) => (
            <button
              key={refinement.label}
              onClick={() => {
                setOpen(false)
                onSelect(refinement.prompt)
              }}
              role="menuitem"
              type="button"
            >
              {refinement.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
