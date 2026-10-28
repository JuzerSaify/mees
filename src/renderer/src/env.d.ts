import type { MeesApi } from '../../shared/types'

declare global {
  interface Window {
    mees?: MeesApi
  }
}

export {}
