import { chromium } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
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
const appInterface = await readFile(
  join(root, 'marketing', 'assets', 'mees-app-interface.png')
)
const outputDirectory = join(root, 'marketing')
const target = join(outputDirectory, 'mees-1.1.0-x-poster-landscape.png')

const improvementItems = [
  ['01', 'Live tool-aware agent status'],
  ['02', 'Provider-correct model menus'],
  ['03', 'License-aware visual research'],
  ['04', 'Deeper agent tool harness'],
  ['05', 'Less repeated visual direction'],
  ['06', 'Responsive checks in every mode']
]

const fixItems = [
  ['07', 'Restored animated loader'],
  ['08', 'Relevance-based visual ranking'],
  ['09', 'Search pagination corrected'],
  ['10', 'Unrelated visual assets excluded'],
  ['11', 'Cross-provider models removed'],
  ['12', 'Stale model state cleared'],
  ['13', 'Refine menu removed'],
  ['14', 'Mobile composer overlap fixed']
]

const renderItems = (items) =>
  items
    .map(
      ([number, label]) => `
        <li>
          <span class="item-number">${number}</span>
          <span>${label}</span>
        </li>
      `
    )
    .join('')

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
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
        background: #f1ede4;
        color: #21190f;
        font-family: "Schibsted Grotesk", sans-serif;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
      }

      .poster {
        position: relative;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        padding: 38px 72px 34px;
        background:
          linear-gradient(#ddd6cc 1px, transparent 1px),
          linear-gradient(90deg, #ddd6cc 1px, transparent 1px),
          #f1ede4;
        background-size: 160px 160px;
      }

      .poster::before {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(241, 237, 228, 0.83);
        pointer-events: none;
      }

      header, main, footer { position: relative; z-index: 1; }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 62px;
        padding-bottom: 20px;
        border-bottom: 2px solid #21190f;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 31px;
        font-weight: 720;
        letter-spacing: -0.025em;
      }

      .brand svg {
        width: 48px;
        height: 48px;
        display: block;
      }

      .release-meta {
        display: flex;
        align-items: center;
        gap: 14px;
        font-size: 15px;
        font-weight: 680;
        text-transform: uppercase;
      }

      .release-meta span:first-child { color: #73685e; }

      .release-meta span:last-child {
        padding: 10px 14px;
        border-radius: 5px;
        background: #21190f;
        color: #fffaf3;
      }

      .hero {
        display: grid;
        grid-template-columns: 760px minmax(0, 1fr);
        gap: 46px;
        height: 500px;
        padding-top: 18px;
      }

      .hero-copy {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding-top: 8px;
      }

      .release-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 22px;
      }

      .version-pill {
        padding: 8px 13px;
        border-radius: 5px;
        background: #ff9f64;
        color: #21190f;
        font-size: 17px;
        font-weight: 760;
      }

      .release-type {
        color: #6e645a;
        font-size: 15px;
        font-weight: 650;
        text-transform: uppercase;
      }

      .release-type::before {
        content: "";
        display: inline-block;
        width: 9px;
        height: 9px;
        margin-right: 8px;
        border-radius: 50%;
        background: #3c9568;
      }

      h1 {
        margin: 0;
        font-size: 92px;
        font-weight: 650;
        line-height: 0.9;
        letter-spacing: -0.055em;
      }

      .summary {
        max-width: 720px;
        margin: 25px 0 0;
        color: #5f574f;
        font-size: 25px;
        font-weight: 480;
        line-height: 1.3;
        letter-spacing: -0.01em;
      }

      .app-stage {
        position: relative;
        height: 500px;
      }

      .app-caption {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 0 14px 10px 0;
        color: #6e645a;
        font-size: 14px;
        font-weight: 680;
        text-transform: uppercase;
      }

      .app-caption strong {
        color: #a84f1f;
        font-weight: 720;
      }

      .app-window {
        width: 892px;
        height: 460px;
        margin-left: auto;
        overflow: hidden;
        border: 2px solid #21190f;
        border-radius: 8px;
        background: #fcfaf6;
        box-shadow:
          16px 16px 0 #ff9f64,
          0 26px 54px rgba(33, 25, 15, 0.18);
        transform: rotate(-0.8deg);
        transform-origin: 50% 50%;
      }

      .app-window img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .app-note {
        position: absolute;
        right: 10px;
        bottom: 10px;
        padding: 8px 11px;
        border-radius: 5px;
        background: #21190f;
        color: #fffaf3;
        font-size: 13px;
        font-weight: 620;
      }

      .changelog {
        margin-top: 10px;
        padding-top: 18px;
        border-top: 2px solid #21190f;
      }

      .section-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        height: 40px;
      }

      .section-heading h2 {
        margin: 0;
        font-size: 25px;
        font-weight: 680;
        letter-spacing: -0.015em;
      }

      .section-heading span {
        color: #73685e;
        font-size: 14px;
        font-weight: 680;
        text-transform: uppercase;
      }

      .change-grid {
        display: grid;
        grid-template-columns: 1fr 1.18fr;
        gap: 22px;
      }

      .change-group {
        min-width: 0;
        padding: 18px 20px 14px;
        border: 2px solid #21190f;
        border-radius: 8px;
        background: rgba(255, 252, 247, 0.91);
      }

      .group-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-bottom: 13px;
        border-bottom: 1px solid #d8d0c6;
      }

      .group-heading .ordinal {
        color: #a84f1f;
        font-size: 13px;
        font-weight: 760;
      }

      .group-heading h3 {
        margin: 0;
        font-size: 24px;
        font-weight: 650;
        letter-spacing: -0.02em;
      }

      .group-heading .count {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        margin-left: auto;
        border-radius: 50%;
        background: #21190f;
        color: #fffaf3;
        font-size: 13px;
        font-weight: 720;
      }

      .item-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0 18px;
        margin: 0;
        padding: 4px 0 0;
        list-style: none;
      }

      .item-grid li {
        display: grid;
        grid-template-columns: 27px minmax(0, 1fr);
        gap: 8px;
        align-items: start;
        min-height: 40px;
        padding: 10px 0;
        border-top: 1px solid #e1d9d0;
        font-size: 15px;
        font-weight: 570;
        line-height: 1.18;
      }

      .item-grid li:nth-child(-n + 2) {
        border-top: 0;
      }

      .item-number {
        color: #a84f1f;
        font-size: 12px;
        font-weight: 740;
      }

      footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 66px;
        margin-top: 16px;
        padding: 0 24px;
        border-radius: 6px;
        background: #21190f;
        color: #fffaf3;
      }

      .download-copy {
        display: flex;
        align-items: baseline;
        gap: 15px;
      }

      .download-copy strong {
        color: #ffad7b;
        font-size: 13px;
        font-weight: 720;
        text-transform: uppercase;
      }

      .download-copy span {
        font-size: 18px;
        font-weight: 520;
        letter-spacing: -0.01em;
      }

      .platforms {
        display: flex;
        align-items: center;
        gap: 11px;
        font-size: 14px;
        font-weight: 620;
      }

      .platform-icon {
        display: grid;
        grid-template-columns: repeat(2, 12px);
        gap: 2px;
        width: 29px;
        height: 29px;
        padding: 5px;
        border-radius: 4px;
        background: #ff9f64;
      }

      .platform-icon i {
        display: block;
        background: #21190f;
      }
    </style>
  </head>
  <body>
    <div class="poster">
      <header>
        <div class="brand">
          <svg viewBox="0 0 512 512" aria-hidden="true">
            <path d="M77 52H226C239 52 249 62 249 76V232C249 250 257 264 274 264H436C450 264 460 274 460 288V435C460 449 450 459 436 459H76C62 459 52 449 52 435V76C52 62 62 52 77 52Z" fill="#261A13"/>
            <rect x="296" y="97" width="120" height="120" rx="30" fill="#FF9B5A"/>
          </svg>
          <span>Mees</span>
        </div>
        <div class="release-meta">
          <span>Release notes</span>
          <span>31 October 2026</span>
        </div>
      </header>

      <main>
        <section class="hero">
          <div class="hero-copy">
            <div class="release-row">
              <span class="version-pill">v1.1.0</span>
              <span class="release-type">Stable release</span>
            </div>
            <h1>Sharper tools.<br>Cleaner control.</h1>
            <p class="summary">
              The Mees design agent now exposes what it is doing, keeps model
              choices accurate and checks the canvas across every mode.
            </p>
          </div>

          <div class="app-stage">
            <div class="app-caption">
              <span>Real Mees interface and generated canvas</span>
              <strong>All four modes</strong>
            </div>
            <div class="app-window">
              <img
                src="data:image/png;base64,${appInterface.toString('base64')}"
                alt="Mees app interface showing a generated archive website"
              >
            </div>
            <span class="app-note">Agent work completed</span>
          </div>
        </section>

        <section class="changelog" aria-labelledby="changelog-title">
          <div class="section-heading">
            <h2 id="changelog-title">Changelog</h2>
            <span>14 focused updates</span>
          </div>

          <div class="change-grid">
            <article class="change-group">
              <div class="group-heading">
                <span class="ordinal">01</span>
                <h3>Improvements</h3>
                <span class="count">06</span>
              </div>
              <ul class="item-grid">
                ${renderItems(improvementItems)}
              </ul>
            </article>

            <article class="change-group">
              <div class="group-heading">
                <span class="ordinal">02</span>
                <h3>Fixes</h3>
                <span class="count">08</span>
              </div>
              <ul class="item-grid">
                ${renderItems(fixItems)}
              </ul>
            </article>
          </div>
        </section>
      </main>

      <footer>
        <div class="download-copy">
          <strong>Download Mees 1.1.0</strong>
          <span>github.com/JuzerSaify/mees/releases/tag/v1.1.0</span>
        </div>
        <div class="platforms">
          <span class="platform-icon" aria-hidden="true">
            <i></i><i></i><i></i><i></i>
          </span>
          <span>Windows 10 / 11</span>
        </div>
      </footer>
    </div>
  </body>
</html>`

await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: target, type: 'png' })
  console.log(`Wrote ${target}`)
} finally {
  await browser.close()
}
