import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateLegacyUserData } from './user-data-migration'

const directories: string[] = []

async function tempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('legacy user data migration', () => {
  it('copies app data and only fills missing assets', async () => {
    const source = await tempDirectory('mees-legacy-')
    const target = await tempDirectory('mees-current-')
    await mkdir(join(source, 'assets', 'nested'), { recursive: true })
    await mkdir(join(target, 'assets'), { recursive: true })
    await writeFile(
      join(source, 'settings.json'),
      '{"version":1,"activeModel":"legacy"}\n',
      'utf8'
    )
    await writeFile(
      join(source, 'projects.json'),
      '{"version":1,"projects":[]}\n',
      'utf8'
    )
    await writeFile(
      join(source, 'assets', 'nested', 'saved.png'),
      'legacy asset',
      'utf8'
    )
    await writeFile(
      join(source, 'assets', 'existing.png'),
      'legacy copy',
      'utf8'
    )
    await writeFile(
      join(target, 'assets', 'existing.png'),
      'current copy',
      'utf8'
    )

    const copied = await migrateLegacyUserData(source, target)

    expect(copied).toEqual([
      'settings.json',
      'projects.json',
      'assets/nested/saved.png'
    ])
    expect(await readFile(join(target, 'settings.json'), 'utf8')).toContain(
      'legacy'
    )
    expect(
      await readFile(join(target, 'assets', 'existing.png'), 'utf8')
    ).toBe('current copy')
  })

  it('keeps newer app data when the target already has it', async () => {
    const source = await tempDirectory('mees-legacy-')
    const target = await tempDirectory('mees-current-')
    await writeFile(join(source, 'projects.json'), 'legacy', 'utf8')
    await writeFile(join(target, 'projects.json'), 'current', 'utf8')

    const copied = await migrateLegacyUserData(source, target)

    expect(copied).toEqual([])
    expect(await readFile(join(target, 'projects.json'), 'utf8')).toBe(
      'current'
    )
  })
})
