import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const userData = await mkdtemp(join(tmpdir(), 'mees-harness-agent-'))
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

  const requestedModel = process.env.MEES_HARNESS_MODEL?.trim() ?? ''
  const requestedProvider =
    process.env.MEES_HARNESS_PROVIDER?.trim() || 'opencode'
  const requestedPrompt = process.env.MEES_HARNESS_PROMPT?.trim() ?? ''
  const result = await page.evaluate(async ({ requestedModel, requestedProvider, requestedPrompt }) => {
    const delay = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
    let state = await window.mees.getState()
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (
        state.settings.providers.some(
          (provider) =>
            provider.provider === requestedProvider &&
            provider.available &&
            provider.models.length > 0
        )
      ) {
        break
      }
      await delay(1_000)
      state = await window.mees.getState()
    }

    const harness = state.settings.providers.find(
      (provider) => provider.provider === requestedProvider
    )
    if (!harness?.available || harness.models.length === 0) {
      throw new Error(`${requestedProvider} was not discovered by Mees.`)
    }
    const model =
      (requestedModel
        ? harness.models.find((entry) => entry.id === requestedModel)
        : requestedProvider === 'agy'
          ? harness.models.find((entry) =>
              /gemini-3\.8-flash/i.test(entry.id)
            )
          : harness.models.find((entry) =>
              /deepseek-v4\.1-flash-free/i.test(entry.id)
            )) ?? harness.models[0]

    await window.mees.savePreferences({
      onboardingComplete: true,
      activeProvider: requestedProvider,
      activeModel: model.id
    })

    const streamed = []
    const activity = []
    const activityTimings = new Map()
    const startedAt = performance.now()
    let firstDeltaMs = null
    let firstActivityMs = null
    const requestId = await new Promise((resolve, reject) => {
      const unsubscribe = window.mees.onAgentEvent((event) => {
        if (event.type === 'delta') {
          if (firstDeltaMs === null) {
            firstDeltaMs = Math.round(performance.now() - startedAt)
          }
          streamed.push(event.delta)
        }
        if (event.type === 'activity') {
          if (firstActivityMs === null) {
            firstActivityMs = Math.round(performance.now() - startedAt)
          }
          activity.push(`${event.activity.status}: ${event.activity.label}`)
          activityTimings.set(event.activity.id, {
            kind: event.activity.kind,
            label: event.activity.label,
            status: event.activity.status,
            detail: event.activity.detail,
            startedAt: event.activity.startedAt,
            finishedAt: event.activity.finishedAt,
            durationMs: event.activity.durationMs
          })
        }
        if (event.type === 'done') {
          unsubscribe()
          resolve({
            status: 'done',
            usage: event.usage,
            metrics: event.metrics,
            elapsedMs: Math.round(performance.now() - startedAt),
            firstActivityMs,
            firstDeltaMs,
            deltaCount: streamed.length,
            streamedChars: streamed.reduce(
              (total, chunk) => total + chunk.length,
              0
            ),
            activities: [...activityTimings.values()]
          })
        }
        if (event.type === 'error') {
          unsubscribe()
          reject(new Error(event.error))
        }
        if (event.type === 'cancelled') {
          unsubscribe()
          reject(new Error('The harness run was cancelled.'))
        }
      })
      window.mees
        .startAgent({
          provider: requestedProvider,
          model: model.id,
          history: [
            {
              role: 'user',
              content:
                requestedPrompt ||
                'Create a compact single-screen website titled "Schibsted Grotesk". Call resolve_site_icon once for schibsted.com, use the returned icon, and then return the complete website. Do not call any other tool.'
            }
          ],
          currentDesign: '',
          designMode: 'website',
          mode: 'design'
        })
        .then(({ requestId: id }) => {
          if (!id) reject(new Error('Mees did not return a request id.'))
        })
        .catch((error) => {
          unsubscribe()
          reject(error)
        })
    })
    return {
      ...requestId,
      provider: requestedProvider,
      model: model.id,
      activity,
      streamed,
      hasTransportMarkup: streamed.some(
        (value) =>
          value.includes('<mees_tool_call>') ||
          value.includes('</mees_tool_call>') ||
          value.includes('</arg_value>') ||
          value.includes('</tool_call>')
      ),
      hasDesign: streamed.some(
        (value) =>
          /:::\s*design\b|<!doctype\s+html\b|<html\b/i.test(value)
      )
    }
  }, { requestedModel, requestedProvider, requestedPrompt })

  await application.close()
  application = null
  console.log(JSON.stringify(result, null, 2))
  if (result.hasTransportMarkup) {
    throw new Error('Raw harness tool markup reached the agent stream.')
  }
  if (!result.hasDesign) {
    throw new Error('The harness run finished without a design artifact.')
  }
  if (result.streamed.length < 2) {
    throw new Error('The harness result did not update the preview progressively.')
  }
  if (result.activity.length === 0) {
    throw new Error('The harness run did not expose real agent activity.')
  }
} finally {
  await application?.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
