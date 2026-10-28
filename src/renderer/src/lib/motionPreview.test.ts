import { describe, expect, it } from 'vitest'
import {
  injectMotionPreviewRuntime,
  MOTION_PREVIEW_CHANNEL
} from './motionPreview'

describe('motion preview runtime', () => {
  it('injects one deterministic transport bridge into a motion document', () => {
    const html = '<!doctype html><html><body><canvas></canvas></body></html>'
    const injected = injectMotionPreviewRuntime(html)

    expect(injected).toContain('data-kern-motion-preview-runtime')
    expect(injected).toContain(MOTION_PREVIEW_CHANNEL)
    expect(injected).toContain('KERN_MOTION')
    expect(injected.indexOf('data-kern-motion-preview-runtime')).toBeLessThan(
      injected.indexOf('</body>')
    )
    expect(injectMotionPreviewRuntime(injected)).toBe(injected)
  })

  it('leaves empty input unchanged', () => {
    expect(injectMotionPreviewRuntime('')).toBe('')
  })
})
