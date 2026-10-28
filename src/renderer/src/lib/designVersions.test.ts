import { describe, expect, it, vi } from 'vitest'
import type { DesignVersion } from '../../../shared/types'
import { addDesignVersion } from './designVersions'

describe('design versions', () => {
  it('does not duplicate identical source snapshots', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'first' })
    const first = addDesignVersion([], '<p>One</p>', 1)
    const duplicate = addDesignVersion(first, '<p>One</p>', 2)
    expect(duplicate).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('keeps only the eight most recent snapshots', () => {
    let versions: DesignVersion[] = []
    for (let index = 0; index < 11; index += 1) {
      versions = addDesignVersion(versions, `<p>${index}</p>`, index)
    }
    expect(versions).toHaveLength(8)
    expect(versions[0]?.designHtml).toBe('<p>3</p>')
    expect(versions[7]?.designHtml).toBe('<p>10</p>')
  })
})
