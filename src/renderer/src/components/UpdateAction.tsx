import { Download, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppUpdateState } from '../../../shared/types'
import { errorMessage } from '../lib/errors'
import { updateActionView } from '../lib/update'

export function UpdateAction(): React.JSX.Element | null {
  const [state, setState] = useState<AppUpdateState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const applyState = (next: AppUpdateState): void => {
      if (active) setState(next)
    }
    void window.mees?.getUpdateState().then(applyState).catch(() => undefined)
    const unsubscribe = window.mees?.onUpdateEvent(applyState)
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const view = updateActionView(state)
  if (!state || !view) return null

  async function applyUpdate(): Promise<void> {
    if (!window.mees || !view || busy || state?.status === 'downloading') {
      return
    }
    const action = view.action
    setBusy(true)
    setError('')
    try {
      if (action === 'download') {
        setState((current) =>
          current
            ? {
                ...current,
                status: 'downloading',
                percent: 0
              }
            : current
        )
      }
      const next =
        action === 'install'
          ? await window.mees.installUpdate().then(() => state)
          : await window.mees.downloadUpdate()
      if (next) setState(next)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const downloading = state.status === 'downloading'
  return (
    <button
      aria-label={view.ariaLabel}
      className={`titlebar-update ${
        state.status === 'downloaded' ? 'is-ready' : 'is-active'
      }`}
      data-tooltip={
        error ||
        (downloading
          ? `${view.progress ?? 0}% downloaded`
          : view.ariaLabel)
      }
      disabled={busy || downloading}
      onClick={() => void applyUpdate()}
      type="button"
    >
      {busy || downloading ? (
        <LoaderCircle aria-hidden="true" className="spin" size={13} />
      ) : state.status === 'downloaded' ? (
        <RotateCcw aria-hidden="true" size={13} />
      ) : (
        <Download aria-hidden="true" size={13} />
      )}
      <span className="titlebar-update-label" aria-live="polite">
        {view.label}
      </span>
    </button>
  )
}
