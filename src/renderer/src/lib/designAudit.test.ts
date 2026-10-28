import { describe, expect, it } from 'vitest'
import type { DesignAudit, DesignIssue } from '../../../shared/types'
import {
  auditScript,
  formatAuditForAgent,
  groupDesignIssues
} from './designAudit'

const duplicateLanguageIssue: DesignIssue[] = [
  {
    id: 'desktop-language',
    viewport: 'desktop',
    severity: 'warning',
    rule: 'missing-language',
    title: 'Document language missing',
    detail: 'Add a lang attribute to the html element.',
    selector: 'html'
  },
  {
    id: 'tablet-language',
    viewport: 'tablet',
    severity: 'warning',
    rule: 'missing-language',
    title: 'Document language missing',
    detail: 'Add a lang attribute to the html element.',
    selector: 'html'
  },
  {
    id: 'mobile-target',
    viewport: 'mobile',
    severity: 'warning',
    rule: 'tap-target',
    title: 'Small touch targets',
    detail: '1 interactive element is smaller than 32 by 32px.',
    selector: 'button'
  }
]

describe('design audit grouping', () => {
  it('builds valid runtime checks for every viewport', () => {
    for (const viewport of ['desktop', 'tablet', 'mobile'] as const) {
      const script = auditScript(`token-${viewport}`, viewport, 1440)
        .replace(/^<script>/, '')
        .replace(/<\/script>$/, '')
      expect(() => new Function(script)).not.toThrow()
      expect(script).toContain('micro-label-stack')
      expect(script).toContain('card-kit')
      expect(script).toContain('text-only-composition')
    }
  })

  it('groups the same finding across viewports while preserving coverage', () => {
    const groups = groupDesignIssues(duplicateLanguageIssue)
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.issue.rule === 'missing-language')?.viewports).toEqual([
      'desktop',
      'tablet'
    ])
  })

  it('formats grouped findings for a repair prompt', () => {
    const audit: DesignAudit = {
      createdAt: new Date().toISOString(),
      revision: 2,
      mode: 'website',
      issueCount: 2,
      issues: duplicateLanguageIssue,
      viewports: [],
      palette: [],
      fonts: []
    }
    const prompt = formatAuditForAgent(audit)
    expect(prompt).toContain('[desktop, tablet] Document language missing')
    expect(prompt).toContain('[mobile] Small touch targets')
    expect(prompt.match(/Document language missing/g)).toHaveLength(1)
  })
})
