import { describe, expect, it } from 'vitest'
import type { AgentActivity } from '../../../shared/types'
import {
  AGENT_STATUS_CYCLE_MS,
  agentStatusOptions,
  chooseAgentStatus,
  uniqueAgentStatusCount
} from './agentStatus'

const research: AgentActivity = {
  id: 'activity-1',
  kind: 'research',
  label: 'Searching several angles',
  detail: 'Checking three focused queries',
  status: 'running',
  startedAt: '2026-10-31T10:00:00.000Z'
}

describe('agent status line', () => {
  it('offers more than twenty distinct working states', () => {
    expect(uniqueAgentStatusCount()).toBeGreaterThanOrEqual(20)
  })

  it('uses the real activity label and detail without inventing a tool state', () => {
    const options = agentStatusOptions(research, false, 'DeepSeek V4.1 Flash')
    expect(options[0]).toBe('Searching several angles')
    expect(options).toHaveLength(1)
    expect(
      chooseAgentStatus(
        research,
        false,
        AGENT_STATUS_CYCLE_MS + 1,
        'DeepSeek V4.1 Flash'
      )
    ).toMatchObject({
      label: 'Searching several angles',
      detail: 'Checking three focused queries'
    })
  })

  it('moves from brief states into artifact states after writing starts', () => {
    expect(agentStatusOptions(undefined, false)).toContain(
      'Thinking through the brief'
    )
    expect(agentStatusOptions(undefined, true)).toContain(
      'Writing the live canvas'
    )
    expect(
      agentStatusOptions(undefined, false, 'DeepSeek V4.1 Flash')[0]
    ).toBe('Waiting for DeepSeek V4.1 Flash')
  })
})
