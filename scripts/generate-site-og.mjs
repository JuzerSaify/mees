import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const font = await readFile(
  join(
    root,
    'mees-product-site',
    'assets',
    'fonts',
    'schibsted-grotesk-latin-wght-normal.woff2'
  )
)
const target = join(root, 'mees-product-site', 'assets', 'og-image.png')

const html = `<!doctype html>
<html lang="en">
  <style>
    @font-face {
      font-family: "Schibsted Grotesk";
      src: url(data:font/woff2;base64,${font.toString('base64')}) format("woff2");
      font-style: normal;
      font-weight: 400 900;
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 58px 64px 52px;
      background: #111411;
      color: #f2f4ef;
      font-family: "Schibsted Grotesk", sans-serif;
    }
    header { display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 620; }
    .mark { width: 34px; height: 34px; }
    main { display: grid; grid-template-columns: 1fr 300px; align-items: end; gap: 48px; }
    h1 {
      max-width: 760px;
      margin: 0;
      font-size: 104px;
      font-weight: 520;
      letter-spacing: -0.06em;
      line-height: 0.86;
    }
    .signal {
      position: relative;
      height: 184px;
      overflow: hidden;
      background: #252925;
    }
    .signal::after {
      content: "";
      position: absolute;
      right: -52px;
      bottom: -86px;
      width: 190px;
      height: 190px;
      border-radius: 50%;
      background: #ff7449;
    }
    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #acb1aa;
      font-size: 17px;
    }
    strong { color: #f2f4ef; font-weight: 560; }
  </style>
  <body>
    <header>
      <svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
        <path d="M77 52H226C239 52 249 62 249 76V232C249 250 257 264 274 264H436C450 264 460 274 460 288V435C460 449 450 459 436 459H76C62 459 52 449 52 435V76C52 62 62 52 77 52Z" fill="#f2f4ef"/>
        <rect x="296" y="97" width="120" height="120" rx="30" fill="#ffa46e"/>
      </svg>
      <span>Mees</span>
    </header>
    <main>
      <h1>Design in<br>the open.</h1>
      <div class="signal" aria-hidden="true"></div>
    </main>
    <footer>
      <span>Local-first design agent</span>
      <strong>mees</strong>
    </footer>
  </body>
</html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1
  })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: target, type: 'png' })
  console.log(`Wrote ${target}`)
} finally {
  await browser.close()
}
