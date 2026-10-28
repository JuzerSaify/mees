import { describe, expect, it } from 'vitest'
import { injectPreviewSelectionRuntime } from './previewSelection'

describe('preview selection runtime', () => {
  it('injects one selection bridge before the body closes', () => {
    const source = '<!doctype html><html><body><main>Design</main></body></html>'
    const injected = injectPreviewSelectionRuntime(source)

    expect(injected).toContain('data-kern-selection-runtime')
    expect(injected.indexOf('data-kern-selection-runtime')).toBeLessThan(
      injected.indexOf('</body>')
    )
    expect(injected.match(/data-kern-selection-runtime/g)).toHaveLength(1)
  })

  it('does not inject twice', () => {
    const source =
      '<html><body><script data-kern-selection-runtime></script></body></html>'
    expect(injectPreviewSelectionRuntime(source)).toBe(source)
  })

  it('finds the nearest semantic element and publishes a stable selector', () => {
    const injected = injectPreviewSelectionRuntime('<html><body></body></html>')
    expect(injected).toContain('section,article,header,footer,nav,main')
    expect(injected).not.toContain('closest("svg,g,path,rect,circle')
    expect(injected).toContain(':nth-of-type(')
  })

  it('targets individual vector geometry inside SVG artwork', () => {
    const injected = injectPreviewSelectionRuntime(
      '<html><body><svg viewBox="0 0 10 10"><path d="M0 0" /></svg></body></html>',
      true
    )
    expect(injected).toContain(
      'closest("svg,g,path,rect,circle,ellipse,line,polyline,polygon,text,use")'
    )
  })
})
