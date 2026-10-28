import type { KernApi } from '../../shared/types'

declare global {
  interface Window {
    kern?: KernApi
  }
}

export {}
