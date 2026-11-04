import {
  Check,
  ChevronDown,
  Clapperboard,
  Globe2,
  PenTool,
  Shapes
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DesignMode } from '../../../shared/types'

interface DesignModePickerProps {
  disabled?: boolean
  mode: DesignMode
  onChange: (mode: DesignMode) => void
}

const modes: Array<{
  id: DesignMode
  label: string
  description: string
  icon: typeof Globe2
}> = [
  {
    id: 'website',
    label: 'Website',
    description: 'Responsive page in HTML',
    icon: Globe2
  },
  {
    id: 'logo',
    label: 'Logo',
    description: 'Standalone scalable SVG mark',
    icon: PenTool
  },
  {
    id: 'vector',
    label: 'Vector',
    description: 'Standalone scalable SVG artwork',
    icon: Shapes
  },
  {
    id: 'motion',
    label: 'Motion',
    description: 'Directed, frame-accurate silent film',
    icon: Clapperboard
  }
]

export function DesignModePicker({
  disabled,
  mode,
  onChange
}: DesignModePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const active = modes.find((item) => item.id === mode) ?? modes[0]
  const ActiveIcon = active.icon

  useEffect(() => {
    if (!open) return
    const selectedIndex = Math.max(
      0,
      modes.findIndex((item) => item.id === mode)
    )
    window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
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
  }, [mode, open])

  function closeAndFocus(): void {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div className="mode-picker" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Design type: ${active.label}`}
        className="mode-trigger"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <ActiveIcon aria-hidden="true" size={14} />
        <span>{active.label}</span>
        <ChevronDown aria-hidden="true" size={13} />
      </button>
      {open ? (
        <div
          aria-label="Design type"
          className="mode-menu"
          onKeyDown={(event) => {
            const currentIndex = optionRefs.current.findIndex(
              (option) => option === document.activeElement
            )
            if (event.key === 'Escape') {
              event.preventDefault()
              closeAndFocus()
              return
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              return
            }
            event.preventDefault()
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? modes.length - 1
                  : event.key === 'ArrowDown'
                    ? (currentIndex + 1) % modes.length
                    : (currentIndex - 1 + modes.length) % modes.length
            optionRefs.current[nextIndex]?.focus()
          }}
          role="listbox"
        >
          {modes.map((item, index) => {
            const Icon = item.icon
            const selected = item.id === mode
            return (
              <button
                aria-selected={selected}
                className={`mode-option ${selected ? 'is-selected' : ''}`}
                key={item.id}
                onClick={() => {
                  onChange(item.id)
                  closeAndFocus()
                }}
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                role="option"
                type="button"
              >
                <span className="mode-option-icon">
                  <Icon aria-hidden="true" size={15} />
                </span>
                <span className="mode-option-copy">
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </span>
                {selected ? <Check aria-hidden="true" size={13} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
