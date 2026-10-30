import { _electron as electron } from 'playwright'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executablePath = resolve(
  root,
  process.argv[2] ?? join('release', 'win-unpacked', 'Mees.exe')
)
const nativeModuleRoot = join(
  dirname(executablePath),
  'resources',
  'app.asar.unpacked',
  'node_modules',
  '@img'
)
const userData = await mkdtemp(join(tmpdir(), 'mees-packaged-smoke-'))

let application
try {
  await access(executablePath)
  const expectedVersion = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8')
  ).version
  const nativeModules = (
    await readdir(nativeModuleRoot, { recursive: true })
  ).filter((path) => path.endsWith('.node'))
  if (!nativeModules.some((path) => path.includes('sharp-win32-x64'))) {
    throw new Error('The packaged Windows sharp native module is missing.')
  }

  application = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`],
    env: {
      ...process.env,
      MEES_USER_DATA_DIR: userData
    },
    timeout: 45_000
  })

  const page = await application.firstWindow({ timeout: 30_000 })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 })
  await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 })

  const smoke = await page.evaluate(() => ({
    title: document.title,
    text: document.body.innerText.trim().slice(0, 500),
    bridgeReady:
      typeof window.mees?.getState === 'function' &&
      typeof window.mees?.getUpdateState === 'function'
  }))

  if (!smoke.bridgeReady) {
    throw new Error('The packaged preload bridge did not initialize.')
  }
  if (!smoke.text) {
    throw new Error('The packaged renderer mounted an empty document.')
  }
  if (pageErrors.length > 0) {
    throw new Error(`Packaged renderer error: ${pageErrors.join('; ')}`)
  }

  const runtime = await page.evaluate(async () => {
    const snapshot = await window.mees.getState()
    const update = await window.mees.getUpdateState()
    return {
      currentVersion: update.currentVersion,
      onboarding: snapshot.settings.onboardingComplete
    }
  })
  if (runtime.currentVersion !== expectedVersion) {
    throw new Error(
      `Packaged version ${runtime.currentVersion} does not match ${expectedVersion}.`
    )
  }

  console.log(
    JSON.stringify(
      {
        executablePath,
        nativeModuleRoot,
        title: smoke.title,
        bridgeReady: smoke.bridgeReady,
        rendererTextLength: smoke.text.length,
        nativeModules,
        runtime
      },
      null,
      2
    )
  )
} finally {
  await application?.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true })
}
