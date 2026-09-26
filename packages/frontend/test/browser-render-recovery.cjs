const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__workerFault = 'always';
      window.__workerCount = 0;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) { super(url, options); this.renderWorker = String(url).includes('/render/worker') || String(url).includes('/assets/worker-'); if (this.renderWorker) window.__workerCount++; }
        postMessage(message) {
          if (this.renderWorker && message.type === 'render' && window.__workerFault !== 'none') {
            if (window.__workerFault === 'once') window.__workerFault = 'none';
            if (!this.failed) { this.failed = true; setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { message: 'Injected worker failure' })), 10); }
            return;
          }
          return super.postMessage(message);
        }
      };
    });
    await page.goto(process.env.WRITER_URL || 'http://localhost:5173');
    await page.getByRole('button', { name: /Writer Test/ }).click();
    await page.getByRole('button', { name: '即时渲染', exact: true }).click();
    await page.locator('.preview-error').waitFor();
    assert.equal(await page.locator('.preview-loading').count(), 0, 'repeated worker failures settle instead of hanging');
    await page.evaluate(() => { window.__workerFault = 'none'; });
    await page.getByRole('button', { name: '重新渲染', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.preview-prose')?.textContent.includes('这是H1') && !document.querySelector('.preview-loading'));
    assert.equal(await page.locator('.preview-error').count(), 0);
    // Fresh page: a single crash must restart transparently with qmoji mapping.
    await page.reload();
    await page.evaluate(() => { window.__workerFault = 'once'; });
    await page.getByRole('button', { name: /Writer Test/ }).click();
    await page.waitForFunction(() => document.querySelector('.preview-prose')?.textContent.includes('这是H1') && !document.querySelector('.preview-loading'));
    assert.equal(await page.locator('.preview-error').count(), 0);
    assert.equal(await page.locator('.preview-prose .qmoji').count(), 4);
    assert.ok(await page.evaluate(() => window.__workerCount >= 2));
    console.log('PASS: worker failure settles, manual retry recovers, single crash restarts with shortcode mapping.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
