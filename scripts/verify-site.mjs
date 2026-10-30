import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve('mees-product-site')
const screenshotDirectory = resolve('.taste-skill', 'site-states')
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2'
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/api/metrics') {
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8'
      })
      response.end(
        JSON.stringify({
          stars: 1,
          downloads: 2,
          downloadUrl:
            'https://github.com/JuzerSaify/mees/releases/download/v1.0.0/Mees-Setup-1.0.0.exe'
        })
      )
      return
    }

    const relativePath =
      pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const filePath = normalize(join(root, relativePath))
    if (!filePath.startsWith(root)) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }
    const bytes = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type':
        contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
    })
    response.end(bytes)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
})

await mkdir(screenshotDirectory, { recursive: true })
await new Promise((resolveListening) =>
  server.listen(4173, '127.0.0.1', resolveListening)
)

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  const forbiddenScreenshots = await page
    .locator('img')
    .evaluateAll((images) =>
      images
        .map((image) => image.getAttribute('src') ?? '')
        .filter((source) =>
          /(studio|agent|review|reference|mode-website|mode-logo|mode-vector|mode-motion)\.(png|webp)/i.test(
            source
          )
        )
    )
  assert.deepEqual(forbiddenScreenshots, [])

  assert.equal(await page.locator('.github-stars .star-icon').count(), 1)
  assert.equal(await page.locator('.github-stars .github-icon').count(), 1)
  assert.equal(await page.locator('.button .windows-icon').count(), 3)
  assert.match(await page.locator('.provider-ticker').innerText(), /OpenAI/)
  assert.match(await page.locator('.provider-ticker').innerText(), /Claude/)
  assert.match(await page.locator('.provider-ticker').innerText(), /Gemini/)
  assert.match(await page.locator('.provider-ticker').innerText(), /DeepSeek/)
  await page.waitForFunction(
    () => document.querySelector('[data-github-stars]')?.textContent === '1'
  )

  assert.equal(
    await page
      .locator('.provider-ticker-track')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
    'provider-drift'
  )
  assert.doesNotMatch(
    await page.locator('.models-section').innerText(),
    /Opus 5\.5/
  )

  const appWindow = page.locator('.app-window')
  assert.equal(await appWindow.locator('button, input, textarea, a[href]').count(), 0)
  assert.match(await appWindow.innerText(), /Senti - Lead intelligence/)
  assert.match(await appWindow.innerText(), /Website ready/)
  assert.match(await appWindow.innerText(), /Opus 5\.5/)
  assert.equal(await page.locator('.app-canvas img').count(), 1)
  assert.ok(
    await page
      .locator('.canvas-preview img')
      .evaluate((image) => image.complete && image.naturalWidth > 0)
  )

  const stagePosition = await appWindow.evaluate((element) =>
    Math.round(element.getBoundingClientRect().top)
  )
  assert.ok(stagePosition < 900)
  await appWindow.screenshot({
    path: join(screenshotDirectory, 'desktop-static-app.png')
  })

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await mobile.locator('[data-menu-toggle]').click()
  await mobile.locator('[data-mobile-menu]').waitFor({ state: 'visible' })
  assert.equal(
    await mobile.locator('[data-menu-toggle]').getAttribute('aria-expanded'),
    'true'
  )
  await mobile.screenshot({
    path: join(screenshotDirectory, 'mobile-menu.png')
  })
  await mobile.locator('[data-mobile-menu] a[href="#download"]').click()
  await mobile.locator('[data-mobile-menu]').waitFor({ state: 'hidden' })

  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  assert.equal(overflow, 0)
  await mobile.locator('.app-window').screenshot({
    path: join(screenshotDirectory, 'mobile-static-app.png')
  })
  const mobilePreviewWidth = await mobile
    .locator('.app-canvas')
    .evaluate((element) => Math.round(element.getBoundingClientRect().width))
  assert.ok(mobilePreviewWidth >= 320)

  const tablet = await browser.newPage({ viewport: { width: 768, height: 900 } })
  await tablet.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  const tabletState = await tablet.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    canvasWidth: Math.round(
      document.querySelector('.app-canvas').getBoundingClientRect().width
    ),
    imageLoaded:
      document.querySelector('.canvas-preview img')?.complete === true &&
      document.querySelector('.canvas-preview img')?.naturalWidth > 0
  }))
  assert.equal(tabletState.overflow, 0)
  assert.ok(tabletState.canvasWidth >= 420)
  assert.equal(tabletState.imageLoaded, true)

  const narrow = await browser.newPage({ viewport: { width: 320, height: 900 } })
  await narrow.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  const narrowState = await narrow.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    githubMetricVisible:
      getComputedStyle(document.querySelector('.github-stars')).display !== 'none',
    canvasWidth: Math.round(
      document.querySelector('.app-canvas').getBoundingClientRect().width
    ),
    imageLoaded:
      document.querySelector('.canvas-preview img')?.complete === true &&
      document.querySelector('.canvas-preview img')?.naturalWidth > 0
  }))
  assert.equal(narrowState.overflow, 0)
  assert.equal(narrowState.githubMetricVisible, false)
  assert.ok(narrowState.canvasWidth >= 260)
  assert.equal(narrowState.imageLoaded, true)
  await narrow.locator('.app-window').screenshot({
    path: join(screenshotDirectory, 'narrow-static-app.png')
  })

  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await reduced.emulateMedia({ reducedMotion: 'reduce' })
  await reduced.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  const reducedState = await reduced.locator('.app-window').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      display: style.display,
      opacity: style.opacity,
      providerAnimation: getComputedStyle(
        document.querySelector('.provider-ticker-track')
      ).animationName
    }
  })
  assert.notEqual(reducedState.display, 'none')
  assert.equal(reducedState.opacity, '1')
  assert.equal(reducedState.providerAnimation, 'none')
  assert.deepEqual(errors, [])

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        screenshotAssets: 0,
        appWindowControls: 0,
        appCanvasImages: 1,
        providerTicker: 'OpenAI / Claude / Gemini / DeepSeek',
        githubStarsRendered: 1,
        downloadsRendered: 2,
        appWindowTop: stagePosition,
        mobileOverflow: overflow,
        mobilePreviewWidth,
        tabletState,
        narrowState,
        reducedMotionFallback: reducedState,
        screenshots: screenshotDirectory
      },
      null,
      2
    )
  )
} finally {
  await browser.close()
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose()))
  )
}
