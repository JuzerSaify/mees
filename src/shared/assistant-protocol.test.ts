import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from './assistant-protocol'

const now = new Date('2026-10-27T12:34:00.000Z')

describe('assistant protocol', () => {
  it('gives direct generation the real date and current-fact rules', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '',
      now
    })

    expect(prompt).toContain('2026-10-27T12:34:00.000Z')
    expect(prompt).toContain('rely only on tool-returned evidence')
    expect(prompt).toContain('do not replace it with the present')
    expect(prompt).toContain('omit uncertain current claims')
    expect(prompt).toContain('Do not insert a separate planning phase')
  })

  it('keeps generated structure model-authored instead of template-driven', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '',
      now
    })

    expect(prompt).toContain('No template, mock, preset or previous generated artifact')
    expect(prompt).toContain('centered marketing headline')
    expect(prompt).toContain('directly from this request')
    expect(prompt).not.toContain('Model-authored direction for this run')
  })

  it('uses a standalone SVG contract for logo and vector modes', () => {
    const logo = buildSystemPrompt({
      currentDesign: '',
      designMode: 'logo',
      now
    })
    const vector = buildSystemPrompt({
      currentDesign: '',
      designMode: 'vector',
      now
    })

    expect(logo).toContain('standalone SVG document only')
    expect(logo).toContain('remains legible at 16px')
    expect(logo).toContain('letter in a colored circle')
    expect(vector).toContain('complete illustration, diagram, icon set, pattern')
    expect(vector).toContain('No doctype, HTML wrapper')
  })

  it('uses a deterministic silent canvas contract for motion', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '',
      designMode: 'motion',
      now
    })

    expect(prompt).toContain('window.MEES_MOTION')
    expect(prompt).toContain('renderAt(time)')
    expect(prompt).toContain('between 3 and 15 seconds')
    expect(prompt).toContain('No audio')
    expect(prompt).toContain('one <canvas>')
    expect(prompt).toContain('directed film, not a demonstration of code')
    expect(prompt).toContain('cinematic continuity')
    expect(prompt).toContain('three coordinated layers')
    expect(prompt).toContain('inspect_artifact')
  })

  it('includes a concrete anti-slop design contract', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '',
      now
    })

    expect(prompt).toContain('Anti-slop contract')
    expect(prompt).toContain('cream paper with a serif display and terracotta accent')
    expect(prompt).toContain('tiny tracked uppercase eyebrows')
    expect(prompt).toContain('decorative 01/02/03 index markers')
    expect(prompt).toContain('Anti-slop is not an avoidance aesthetic')
    expect(prompt).toContain('would swapping in a competitor break the concept')
  })

  it('returns a single-element patch contract for selected edits', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '<main>This full document must not be sent again.</main>',
      mode: 'targeted-edit',
      purpose: 'targeted-edit',
      target: {
        selector: 'main > section:nth-of-type(2) > h2',
        tag: 'h2',
        label: 'h2 - Better heading',
        text: 'Better heading',
        html: '<h2 class="title">Better heading</h2>',
        styles: 'color: rgb(24, 26, 24); font-size: 48px;'
      },
      now
    })

    expect(prompt).toContain('surgical edit')
    expect(prompt).toContain('selector: main > section:nth-of-type(2) > h2')
    expect(prompt).toContain(':::patch')
    expect(prompt).toContain('Return the complete replacement for only this one element')
    expect(prompt).toContain('Do not introduce an eyebrow label')
    expect(prompt).not.toContain('This full document must not be sent again.')
  })

  it('returns a coordinated patch contract for multiple selected elements', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '<main><h1>Old</h1><p>Copy</p></main>',
      mode: 'targeted-edit',
      purpose: 'targeted-edit',
      targets: [
        {
          selector: 'main > h1',
          tag: 'h1',
          label: 'h1 - Old',
          text: 'Old',
          html: '<h1>Old</h1>'
        },
        {
          selector: 'main > p',
          tag: 'p',
          label: 'p - Copy',
          text: 'Copy',
          html: '<p>Copy</p>'
        }
      ],
      now
    })

    expect(prompt).toContain(':::patches')
    expect(prompt).toContain('main > h1')
    expect(prompt).toContain('main > p')
    expect(prompt).toContain('exactly one patch for every selected selector')
  })

  it('adds recent structural memory so new designs do not repeat themselves', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '',
      recentDesigns: [
        {
          title: 'Previous model launch',
          fingerprint: {
            hero: 'split',
            media: 'graphic',
            typography: 'serif-display',
            background: 'dark',
            density: 'sparse',
            sectionCount: 6
          },
          palette: ['#121b24', '#ba7048'],
          fonts: ['Cormorant Garamond']
        }
      ],
      now
    })

    expect(prompt).toContain('Recent generated directions in this workspace')
    expect(prompt).toContain('hero=split; media=graphic')
    expect(prompt).toContain('palette=#121b24, #ba7048')
    expect(prompt).toContain('fonts=Cormorant Garamond')
    expect(prompt).toContain('materially different in at least the hero structure')
  })

  it('uses an evidence-only contract for visual inspection', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '',
      purpose: 'visual-inspection',
      now
    })

    expect(prompt).toContain('candidate visual assets')
    expect(prompt).toContain('Never describe an unrelated image as relevant')
    expect(prompt).toContain('Do not return HTML, SVG, code, a design block')
  })

  it('gives measured reference data and approved memory precise constraints', () => {
    const prompt = buildSystemPrompt({
      currentDesign: '',
      referenceVisuals: [
        {
          imageId: 'reference-1',
          name: 'Editorial reference',
          width: 1440,
          height: 1080,
          aspectRatio: 1.33,
          palette: ['#1b566d', '#f0eee8'],
          averageLuminance: 0.58,
          contrast: 0.54,
          colorfulness: 0.27,
          edgeDensity: 0.31,
          transparent: false
        }
      ],
      designMemory: [
        {
          id: 'memory-1',
          kind: 'brand-kit',
          name: 'Northline',
          designMode: 'website',
          palette: ['#1b566d', '#f0eee8'],
          fonts: ['Georgia'],
          createdAt: '2026-10-28T10:00:00.000Z'
        }
      ],
      now
    })

    expect(prompt).toContain('reference:reference-1')
    expect(prompt).toContain('palette=#1b566d, #f0eee8')
    expect(prompt).toContain('Approved design memory')
    expect(prompt).toContain('do not repeat its layout')
  })

  it('keeps the optional tool loop available in every design mode', () => {
    for (const designMode of [
      'website',
      'logo',
      'vector',
      'motion'
    ] as const) {
      const prompt = buildSystemPrompt({
        currentDesign: '',
        designMode,
        now
      })
      expect(prompt).toContain('You are one continuous agent')
      expect(prompt).toContain('Tools are optional')
      expect(prompt).toContain('Inspection')
      expect(prompt).toContain('ask_user')
    }
  })
})
