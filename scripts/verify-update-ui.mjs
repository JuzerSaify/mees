import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const userData = await mkdtemp(join(tmpdir(), 'mees-update-ui-'))
let application

try {
  application = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      MEES_DISABLE_HARNESS_DISCOVERY: '1',
      MEES_USER_DATA_DIR: userData
    }
  })
  const page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(700)

  const sendUpdate = (status, percent) =>
    application.evaluate(
      ({ BrowserWindow }, update) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send(
          'mees:update-event',
          update
        )
      },
      {
        currentVersion: '1.2.0',
        status,
        availableVersion: '1.3.0',
        ...(percent === undefined ? {} : { percent })
      }
    )

  await sendUpdate('available')
  const available = page.getByRole('button', {
    name: /Download Mees 1\.3\.0/i
  })
  await available.waitFor({ state: 'visible' })
  const availableText = await available.textContent()

  await sendUpdate('downloading', 48)
  const downloading = page.getByRole('button', {
    name: /Update download 48% complete/i
  })
  await downloading.waitFor({ state: 'visible' })
  const downloadingText = await downloading.textContent()

  await sendUpdate('downloaded')
  const restart = page.getByRole('button', {
    name: /Restart Mees to install version 1\.3\.0/i
  })
  await restart.waitFor({ state: 'visible' })
  await page.waitForTimeout(220)
  const restartText = await restart.textContent()
  const restartStyle = await restart.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      color: style.color,
      disabled: element instanceof HTMLButtonElement && element.disabled
    }
  })

  const screenshot = join(root, '.ui-check', 'titlebar-update.png')
  await page.screenshot({ path: screenshot })
  console.log(
    JSON.stringify(
      {
        labels: [
          availableText,
          downloadingText,
          restartText
        ],
        restartStyle,
        screenshot
      },
      null,
      2
    )
  )
} finally {
  await application?.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
