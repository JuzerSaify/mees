import { access, chmod, copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const APP_FILES = [
  'settings.json',
  'projects.json',
  'design-memory.json'
] as const

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function copyMissingFile(
  source: string,
  target: string,
  relativePath: string,
  copied: string[]
): Promise<void> {
  if (!(await pathExists(source)) || (await pathExists(target))) return
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
  await chmod(target, 0o600).catch(() => undefined)
  copied.push(relativePath)
}

async function copyMissingDirectory(
  source: string,
  target: string,
  relativeDirectory: string,
  copied: string[]
): Promise<void> {
  if (!(await pathExists(source))) return
  await mkdir(target, { recursive: true })
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const sourcePath = join(source, entry.name)
    const targetPath = join(target, entry.name)
    const relativePath = `${relativeDirectory}/${entry.name}`
    if (entry.isDirectory()) {
      await copyMissingDirectory(sourcePath, targetPath, relativePath, copied)
    } else if (entry.isFile()) {
      await copyMissingFile(sourcePath, targetPath, relativePath, copied)
    }
  }
}

/**
 * Copies app-owned files from the pre-rebrand user-data directory.
 * Existing Mees files always win, so this is safe to run on every launch.
 */
export async function migrateLegacyUserData(
  sourceDirectory: string,
  targetDirectory: string
): Promise<string[]> {
  if (resolve(sourceDirectory) === resolve(targetDirectory)) return []
  if (!(await pathExists(sourceDirectory))) return []

  const copied: string[] = []
  await mkdir(targetDirectory, { recursive: true })
  for (const fileName of APP_FILES) {
    await copyMissingFile(
      join(sourceDirectory, fileName),
      join(targetDirectory, fileName),
      fileName,
      copied
    )
  }
  await copyMissingDirectory(
    join(sourceDirectory, 'assets'),
    join(targetDirectory, 'assets'),
    'assets',
    copied
  )
  return copied
}
