import '@fontsource-variable/schibsted-grotesk'
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Wordmark } from './components/Brand'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Mees could not find the application root.')
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { message: string }
> {
  state = { message: '' }

  static getDerivedStateFromError(error: unknown): { message: string } {
    return {
      message:
        error instanceof Error
          ? error.message
          : 'An unexpected interface error interrupted the workspace.'
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Mees interface error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.message) return this.props.children
    return (
      <div className="opening-screen error-screen" role="alert">
        <Wordmark />
        <h1>The workspace needs to reload</h1>
        <p>{this.state.message}</p>
        <button
          className="secondary-button"
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload workspace
        </button>
      </div>
    )
  }
}

createRoot(root).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
)
