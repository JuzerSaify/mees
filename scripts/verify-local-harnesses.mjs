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
  let snapshot = await page.evaluate(() => window.mees.getState())
  for (let attempt = 0; attempt < 35; attempt += 1) {
    if (
      snapshot.settings.providers.some(
        (provider) =>
          provider.source === 'harness' &&
          provider.available &&
          provider.models.length > 0
      )
    ) {
      break
    }
    await page.waitForTimeout(1_000)
    snapshot = await page.evaluate(() => window.mees.getState())
  }
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
    const providerLabel =
      harness.provider === 'codex'
        ? 'Codex CLI'
        : harness.provider === 'agy'
          ? 'AGY CLI'
          : 'OpenCode'
    const row = page.getByRole('button', {
      name: new RegExp(providerLabel, 'i')
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
    const agyModel = page.locator(
      '.model-option[data-model-provider="agy"][data-model-id="gemini-3.8-flash"]'
    )
    if (await agyModel.count()) {
      await agyModel.click()
      await page.waitForTimeout(450)
      result.agyEffortOptions = await page
        .locator('.model-effort-options button')
        .allTextContents()
      if (
        result.agyEffortOptions.some((label) => /max|x-high/i.test(label)) ||
        result.agyEffortOptions.length !== 3
      ) {
        throw new Error(
          `AGY effort options are incorrect: ${result.agyEffortOptions.join(', ')}`
        )
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(180)
      result.agyInputModelName =
        (await page.locator('.model-trigger-name').textContent())?.trim() ?? ''
      if (result.agyInputModelName !== '3.8 Flash') {
        throw new Error(
          `AGY model name is not compact in the composer: ${result.agyInputModelName}`
        )
      }

      await page
        .getByRole('button', { name: /Choose model and effort/ })
        .click()
      await page.locator('.model-menu').waitFor({ state: 'visible' })
      const openCodeModel = page.locator(
        '.model-option[data-model-provider="opencode"][data-model-id="opencode/beam-free"]'
      )
      if (await openCodeModel.count()) {
        await openCodeModel.click()
        await page.waitForTimeout(450)
        result.openCodeEffortOptions = await page
          .locator('.model-effort-options button')
          .allTextContents()
        if (result.openCodeEffortOptions.length !== 5) {
          throw new Error(
            `OpenCode effort options are missing: ${result.openCodeEffortOptions.join(', ')}`
          )
        }
        await page.keyboard.press('Escape')
        await page.waitForTimeout(180)
        result.openCodeInputModelName =
          (await page.locator('.model-trigger-name').textContent())?.trim() ?? ''
        if (result.openCodeInputModelName !== 'Beam Free') {
          throw new Error(
            `OpenCode model name is not clean in the composer: ${result.openCodeInputModelName}`
          )
        }
      }
    }
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
    if (
      !result.modelGroups?.some((name) => /Codex CLI/i.test(name)) ||
      !result.modelGroups?.some((name) => /AGY CLI/i.test(name))
    ) {
      throw new Error('Codex or AGY CLI is missing from the model picker.')
    }
  }

  console.log(JSON.stringify(result, null, 2))
} finally {
  await application?.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
