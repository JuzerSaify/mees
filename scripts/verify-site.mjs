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
          stars: 0,
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
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
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
await new Promise((resolveListening) => server.listen(4173, '127.0.0.1', resolveListening))

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
  assert.match(await page.locator('.provider-ticker').innerText(), /DeepSeek/)
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
  const heroStagePosition = await page.evaluate(() => {
    const stage = document.querySelector('[data-live-ui]')
    return Math.round(stage.getBoundingClientRect().top)
  })
  assert.ok(heroStagePosition < 900)

  await page.locator('[data-model-trigger]').click()
  await page.locator('[data-model-popover]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-model-trigger]').getAttribute('aria-expanded'), 'true')
  assert.match(await page.locator('[data-model-popover]').innerText(), /Opus 5\.5/)
  await page.locator('[data-live-ui]').screenshot({
    path: join(screenshotDirectory, 'desktop-model-popover.png')
  })
  await page.keyboard.press('Escape')
  await page.locator('[data-model-popover]').waitFor({ state: 'hidden' })

  const expectedDirectionTitles = {
    coastal: 'Read the coast.',
    civic: 'A city keeps time.',
    signal: 'Make the room turn.'
  }
  for (const [direction, title] of Object.entries(expectedDirectionTitles)) {
    await page.locator(`[data-direction-button="${direction}"]`).click()
    assert.equal(
      await page.locator('[data-live-ui]').getAttribute('data-direction'),
      direction
    )
    assert.equal(await page.locator('[data-artifact-title]').innerText(), title)
    await page.waitForTimeout(420)
    await page.locator('[data-live-ui]').screenshot({
      path: join(screenshotDirectory, `desktop-direction-${direction}.png`)
    })
  }

  await page.locator('[data-direction-button="civic"]').click()

  for (const mode of ['logo', 'vector', 'motion']) {
    await page.locator(`[data-mode-button="${mode}"]`).click()
    assert.equal(await page.locator('[data-live-ui]').getAttribute('data-mode'), mode)
    assert.equal(
      await page.locator(`[data-artifact="${mode}"]`).getAttribute('aria-hidden'),
      null
    )
    await page.waitForTimeout(520)
    await page.locator('[data-live-ui]').screenshot({
      path: join(screenshotDirectory, `desktop-${mode}.png`)
    })
  }

  const motionPlaying = await page
    .locator('[data-motion-artifact]')
    .evaluate((element) => element.classList.contains('is-playing'))
  if (!(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))) {
    assert.equal(motionPlaying, true)
    await page.locator('[data-motion-toggle]').click()
    assert.equal(
      await page.locator('[data-motion-artifact]').evaluate((element) =>
        element.classList.contains('is-playing')
      ),
      false
    )
  }

  await page.locator('[data-set-mode="website"]').click()
  assert.equal(await page.locator('[data-live-ui]').getAttribute('data-mode'), 'website')

  const linkTargets = await page.locator('a[href]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href'))
  )
  assert.ok(linkTargets.every(Boolean))

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await mobile.locator('[data-menu-toggle]').click()
  await mobile.locator('[data-mobile-menu]').waitFor({ state: 'visible' })
  assert.equal(await mobile.locator('[data-menu-toggle]').getAttribute('aria-expanded'), 'true')
  await mobile.screenshot({
    path: join(screenshotDirectory, 'mobile-menu.png')
  })
  await mobile.locator('[data-mobile-menu] a[href="#download"]').click()
  await mobile.locator('[data-mobile-menu]').waitFor({ state: 'hidden' })
  await mobile.locator('[data-live-ui]').screenshot({
    path: join(screenshotDirectory, 'mobile-live-ui.png')
  })

  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  assert.equal(overflow, 0)

  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await reduced.emulateMedia({ reducedMotion: 'reduce' })
  await reduced.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  const reducedState = await reduced.locator('[data-artifact="website"]').evaluate((element) => {
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
        providerTicker: true,
        heroStagePosition,
        modes: ['website', 'logo', 'vector', 'motion'],
        directions: ['coastal', 'civic', 'signal'],
        model: 'Opus 5.5',
        mobileOverflow: overflow,
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
