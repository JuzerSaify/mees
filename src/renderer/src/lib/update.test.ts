import { describe, expect, it } from 'vitest'
import { updateActionView } from './update'

describe('titlebar update action', () => {
  it('turns an available release into a download action', () => {
    expect(
      updateActionView({
        currentVersion: '1.2.0',
        status: 'available',
        availableVersion: '1.3.0'
      })
    ).toMatchObject({
      action: 'download',
      label: 'Update available'
    })
  })

  it('shows live download progress', () => {
    expect(
      updateActionView({
        currentVersion: '1.2.0',
        status: 'downloading',
        availableVersion: '1.3.0',
        percent: 48
      })
    ).toMatchObject({
      action: 'download',
      label: 'Updating 48%',
      progress: 48
    })
  })

  it('turns a downloaded release into a restart action', () => {
    expect(
      updateActionView({
        currentVersion: '1.2.0',
        status: 'downloaded',
        availableVersion: '1.3.0'
      })
    ).toMatchObject({
      action: 'install',
      label: 'Restart to update'
    })
  })

  it('stays hidden when there is no actionable update', () => {
    expect(
      updateActionView({
        currentVersion: '1.2.0',
        status: 'not-available'
      })
    ).toBeNull()
  })
})
