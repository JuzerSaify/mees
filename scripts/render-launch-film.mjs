import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  copyFile,
  mkdir,
  readdir,
  rm
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const filmDirectory = join(root, 'mees-launch-film')
const renderDirectory = join(filmDirectory, 'renders')
const frameDirectory = join(filmDirectory, 'frames')
const width = 1920
const height = 1080
const fps = 30
const duration = 15
const frameCount = duration * fps

const ffmpeg =
  process.env.FFMPEG_PATH ??
  join(
    root,
    '.tooling',
    'ffmpeg',
    'node_modules',
    '@ffmpeg-installer',
    'win32-x64',
    'ffmpeg.exe'
  )

if (!existsSync(ffmpeg)) {
  throw new Error(
    'ffmpeg was not found. Set FFMPEG_PATH or install @ffmpeg-installer/ffmpeg under .tooling/ffmpeg.'
  )
}

await mkdir(renderDirectory, { recursive: true })
await mkdir(frameDirectory, { recursive: true })
for (const file of await readdir(frameDirectory)) {
  await rm(join(frameDirectory, file), { recursive: true, force: true })
}

const mp4 = join(renderDirectory, 'mees-launch-film-v2.mp4')
const webm = join(renderDirectory, 'mees-launch-film-v2.webm')
const poster = join(renderDirectory, 'mees-launch-poster-v2.png')

function encoderProcess(args) {
  const process = spawn(ffmpeg, args, {
    cwd: root,
    stdio: ['pipe', 'ignore', 'pipe']
  })
  let stderr = ''
  process.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })
  const closed = new Promise((resolvePromise, reject) => {
    process.on('error', reject)
    process.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(stderr || `ffmpeg exited with code ${code}.`))
    })
  })
  return { process, closed }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--force-color-profile=srgb']
})
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  colorScheme: 'light'
})
const page = await context.newPage()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

await page.goto(
  `${pathToFileURL(join(filmDirectory, 'index.html')).href}?capture=1`,
  { waitUntil: 'load' }
)
await page.waitForFunction(() => window.__MEES_LAUNCH_READY__ === true)

const { process: videoEncoder, closed: encodingComplete } = encoderProcess([
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'image2pipe',
  '-framerate',
  String(fps),
  '-i',
  '-',
  '-an',
  '-vf',
  'format=yuv420p',
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '15',
  '-profile:v',
  'high',
  '-level',
  '4.2',
  '-movflags',
  '+faststart',
  mp4
])

try {
  for (let frame = 0; frame < frameCount; frame += 1) {
    await page.evaluate(
      (time) =>
        new Promise((resolve) => {
          window.MEES_LAUNCH.seek(time)
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }),
      frame / fps
    )
    const png = await page.screenshot({ type: 'png' })
    if (!videoEncoder.stdin.write(png)) {
      await once(videoEncoder.stdin, 'drain')
    }
  }
  videoEncoder.stdin.end()
  await encodingComplete
} catch (error) {
  videoEncoder.kill()
  throw error
} finally {
  await context.close()
  await browser.close()
}

const webmProcess = spawn(
  ffmpeg,
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    mp4,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '29',
    '-b:v',
    '0',
    webm
  ],
  { cwd: root, stdio: 'inherit' }
)
const [webmCode] = await once(webmProcess, 'exit')
if (webmCode !== 0) throw new Error(`WebM encoding failed with code ${webmCode}.`)

const reviewFrames = [
  [0.65, '01-signal'],
  [3.15, '02-canvas'],
  [5.65, '03-agent-live'],
  [8.4, '04-modes'],
  [10.55, '05-model-select'],
  [13.4, '06-end']
]

const reviewBrowser = await chromium.launch({
  headless: true,
  args: ['--force-color-profile=srgb']
})
const reviewContext = await reviewBrowser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  colorScheme: 'light'
})
const reviewPage = await reviewContext.newPage()
await reviewPage.goto(
  `${pathToFileURL(join(filmDirectory, 'index.html')).href}?capture=1`,
  { waitUntil: 'load' }
)
await reviewPage.waitForFunction(() => window.__MEES_LAUNCH_READY__ === true)

for (const [time, name] of reviewFrames) {
  await reviewPage.evaluate(
    (nextTime) =>
      new Promise((resolve) => {
        window.MEES_LAUNCH.seek(nextTime)
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
    time
  )
  await reviewPage.screenshot({
    path: join(frameDirectory, `${name}.png`)
  })
  if (name === '02-canvas') {
    await copyFile(join(frameDirectory, `${name}.png`), poster)
  }
}

await reviewContext.close()
await reviewBrowser.close()

console.log(
  JSON.stringify(
    {
      mp4,
      webm,
      poster,
      frames: await readdir(frameDirectory),
      dimensions: `${width}x${height}`,
      frameRate: fps,
      durationSeconds: duration,
      silent: true,
      consoleErrors
    },
    null,
    2
  )
)
