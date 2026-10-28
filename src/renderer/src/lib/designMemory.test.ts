import { describe, expect, it } from 'vitest'
import type {
  AppProject,
  DesignAudit,
  DesignFingerprint,
  DesignMode
} from '../../../shared/types'
import {
  applyDesignMemoryReview,
  buildRecentDesignSummaries,
  fingerprintArtifactDesign
} from './designMemory'

const repeatedFingerprint: DesignFingerprint = {
  hero: 'split',
  media: 'graphic',
  typography: 'serif-display',
  background: 'dark',
  density: 'sparse',
  sectionCount: 6
}

function project(
  id: string,
  title: string,
  fingerprint?: DesignFingerprint,
  designMode: DesignMode = 'website'
): AppProject {
  const audit: DesignAudit = {
    createdAt: '2026-10-27T12:00:00.000Z',
    revision: 1,
    mode: designMode,
    issueCount: 0,
    issues: [],
    palette: [],
    fonts: [],
    viewports: [
      {
        viewport: 'desktop',
        width: 1440,
        issues: [],
        nodeCount: 10,
        headingCount: 3,
        interactiveCount: 2,
        imageCount: 0,
        fingerprint
      }
    ]
  }
  return {
    id,
    title,
    titleEdited: false,
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
    designMode,
    messages: [],
    designHtml: '<main><h1>Test</h1></main>',
    revision: 1,
    versions: [],
    audit
  }
}

describe('design memory', () => {
  it('ignores the current project when building recent directions', () => {
    expect(
      buildRecentDesignSummaries(
        [
          project('current', 'Current', repeatedFingerprint),
          project('previous', 'Previous', repeatedFingerprint)
        ],
        'current'
      )
    ).toEqual([
      {
        title: 'Previous',
        fingerprint: repeatedFingerprint
      }
    ])
  })

  it('flags a new page that repeats a recent structural direction', () => {
    const current = project('current', 'Current', repeatedFingerprint)
    const reviewed = applyDesignMemoryReview(
      current.audit!,
      [current, project('previous', 'Previous model page', repeatedFingerprint)],
      'current'
    )

    expect(reviewed.issueCount).toBe(1)
    expect(reviewed.issues[0]).toMatchObject({
      rule: 'repeated-design-direction',
      title: 'Repeated design direction'
    })
    expect(reviewed.issues[0]?.detail).toContain('Previous model page')
  })

  it('allows a materially different composition', () => {
    const current = project('current', 'Current', {
      hero: 'full-media',
      media: 'photo',
      typography: 'sans',
      background: 'light',
      density: 'dense',
      sectionCount: 8
    })
    const reviewed = applyDesignMemoryReview(
      current.audit!,
      [current, project('previous', 'Previous', repeatedFingerprint)],
      'current'
    )
    expect(reviewed.issueCount).toBe(0)
  })

  it('compares directions only within the same artifact mode', () => {
    expect(
      buildRecentDesignSummaries(
        [
          project('current', 'Current motion', undefined, 'motion'),
          project('website', 'Previous website', repeatedFingerprint, 'website'),
          project('motion', 'Previous motion', repeatedFingerprint, 'motion')
        ],
        'current',
        'motion'
      ).map((summary) => summary.title)
    ).toEqual(['Previous motion'])
  })

  it('derives a structural fingerprint from motion code', () => {
    const fingerprint = fingerprintArtifactDesign(
      `<canvas></canvas><script>
        window.MEES_MOTION = {
          width: 1280,
          height: 720,
          duration: 6,
          fps: 30,
          renderAt(t) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#111111';
            ctx.fillRect(0, 0, 1280, 720);
            ctx.fillText('Frame', 40, 80);
            ctx.lineTo(t * 80, 200);
            ctx.stroke();
          }
        };
      </script>`,
      'motion'
    )

    expect(fingerprint).toMatchObject({
      hero: 'motion-medium',
      media: 'shape-canvas',
      typography: 'canvas-lettering',
      background: 'dark',
      sectionCount: 1
    })
  })
})
