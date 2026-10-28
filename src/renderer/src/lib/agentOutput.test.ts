import { describe, expect, it } from 'vitest'
import {
  deriveProjectTitle,
  hydrateFetchedAssets,
  parseAgentOutput,
  parseDesignTitle,
  parseEditPatch,
  parseEditPatchOutput,
  textBytes
} from './agentOutput'

describe('parseAgentOutput', () => {
  it('keeps prose separate from a streaming design document', () => {
    const parsed = parseAgentOutput(
      'A restrained editorial direction.\n:::design\n<!doctype html><html><body>Hello'
    )
    expect(parsed.narrative).toBe('A restrained editorial direction.')
    expect(parsed.designStarted).toBe(true)
    expect(parsed.designHtml).toContain('<!doctype html>')
  })

  it('accepts a marker that starts immediately after prose', () => {
    const parsed = parseAgentOutput(
      'Built from stone and sea light.:::design\n<!doctype html><html><title>Coast</title></html>\n:::'
    )
    expect(parsed.narrative).toBe('Built from stone and sea light.')
    expect(parsed.designStarted).toBe(true)
    expect(parsed.designHtml).toContain('<!doctype html>')
  })

  it('removes the closing marker and code fence', () => {
    const parsed = parseAgentOutput(
      'Direction first.\n:::design\n```html\n<!doctype html><title>Northline</title>\n```\n:::'
    )
    expect(parsed.designHtml).toBe('<!doctype html><title>Northline</title>')
    expect(parsed.designStarted).toBe(true)
  })

  it('removes a closing marker directly after the document', () => {
    const parsed = parseAgentOutput(
      'Direction first.\n:::design\n<!doctype html><title>Northline</title>:::'
    )
    expect(parsed.designHtml).toBe('<!doctype html><title>Northline</title>')
  })

  it('does not leak a partially streamed marker into the narrative', () => {
    const parsed = parseAgentOutput('I am composing the page.\n:::desi')
    expect(parsed.narrative).toBe('I am composing the page.')
    expect(parsed.designStarted).toBe(false)
  })
})

describe('design metadata', () => {
  it('reads a real document title', () => {
    expect(parseDesignTitle('<title>Ridgeway &amp; Co.</title>')).toBe('Ridgeway & Co.')
  })

  it('derives a concise project title from the request', () => {
    expect(deriveProjectTitle('Create a quiet portfolio for a photographer')).toBe(
      'Quiet portfolio for a photographer'
    )
  })

  it('counts UTF-8 bytes', () => {
    expect(textBytes('hello')).toBe(5)
    expect(textBytes('cafe\u0301')).toBe(6)
  })
})

describe('targeted element output', () => {
  it('keeps prose separate from a streaming patch block', () => {
    const parsed = parseEditPatchOutput(
      'Tightening the heading.\n:::patch\n{"replacement":"<h2>New</h2>"}'
    )
    expect(parsed.narrative).toBe('Tightening the heading.')
    expect(parsed.patchStarted).toBe(true)
    expect(parsed.patchSource).toContain('<h2>New</h2>')
  })

  it('parses a complete single-element patch', () => {
    expect(
      parseEditPatch(
        '```json\n{"replacement":"<h2 class=\\"title\\">Clearer</h2>","styles":".title{max-width:18ch}","note":"Shortened the heading."}\n```'
      )
    ).toEqual({
      replacement: '<h2 class="title">Clearer</h2>',
      styles: '.title{max-width:18ch}',
      note: 'Shortened the heading.'
    })
  })

  it('hydrates fetched asset tokens before rendering', () => {
    expect(
      hydrateFetchedAssets(
        '<img src="mees-asset://asset-a1"><img src="mees-asset://asset-a1">',
        [
          {
            id: 'asset-a1',
            token: 'mees-asset://asset-a1',
            kind: 'image',
            title: 'Studio',
            pageUrl: 'https://example.com',
            sourceUrl: 'https://example.com/studio.jpg',
            contentType: 'image/jpeg',
            byteLength: 5,
            dataUrl: 'data:image/jpeg;base64,abc'
          }
        ]
      )
    ).toBe(
      '<img src="data:image/jpeg;base64,abc"><img src="data:image/jpeg;base64,abc">'
    )
  })
})
