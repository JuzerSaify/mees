import { _electron as electron } from 'playwright'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const userData = await mkdtemp(join(tmpdir(), 'mees-harness-ui-'))
let application

try {
  application = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      MEES_USER_DATA_DIR: userData
    },
    timeout: 60_000
  })
  const page = await application.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(
    () => typeof window.mees?.getState === 'function',
    { timeout: 15_000 }
  )
  await page.waitForTimeout(2_000)
  const snapshot = await page.evaluate(() => window.mees.getState())
  const harnesses = snapshot.settings.providers.filter(
    (provider) =>
      provider.source === 'harness' &&
      provider.available &&
      provider.models.length > 0
  )
  const result = {
    harnesses: harnesses.map((provider) => ({
      provider: provider.provider,
      version: provider.harnessVersion,
      executable: provider.harnessPath,
      selectedModel: provider.selectedModel,
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        reasoningEfforts: model.reasoningEfforts ?? [],
        defaultEffort: model.defaultEffort ?? null
      }))
    }))
  }

  for (const harness of harnesses) {
    const row = page.getByRole('button', {
      name: new RegExp(
        harness.provider === 'codex' ? 'Codex CLI' : 'OpenCode',
        'i'
      )
    })
    await row.waitFor({ state: 'visible', timeout: 10_000 })
    await row.click()
    const details = page.locator(`#provider-details-${harness.provider}`)
    await details.getByLabel('Model').waitFor({ state: 'visible' })
    if (await details.getByLabel('API key').count()) {
      throw new Error(`${harness.provider} incorrectly requested an API key.`)
    }
  }

  const onboardingScreenshot = join(
    root,
    '.ui-check',
    'local-harnesses.png'
  )
  await page.screenshot({ path: onboardingScreenshot })
  result.onboardingScreenshot = onboardingScreenshot

  if (harnesses.length > 0) {
    await page.getByRole('button', { name: /Enter Mees/i }).click()
    await page.getByRole('button', {
      name: /Choose model and effort/
    }).click()
    await page.locator('.model-menu').waitFor({ state: 'visible' })
    result.modelGroups = await page
      .locator('.model-group-label span:first-child')
      .allTextContents()
    const studioScreenshot = join(
      root,
      '.ui-check',
      'local-harnesses-model-picker.png'
    )
    await page.screenshot({ path: studioScreenshot })
    result.studioScreenshot = studioScreenshot
  }

  if (harnesses.length > 0) {
    const first = harnesses[0]
    if (!first.harnessPath) {
      throw new Error('A detected harness did not expose its executable path.')
    }
    await access(first.harnessPath)
    if (!result.modelGroups?.some((name) => /Codex CLI/i.test(name))) {
      throw new Error('The Codex CLI group is missing from the model picker.')
    }
  }

  console.log(JSON.stringify(result, null, 2))
} finally {
  await application?.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
