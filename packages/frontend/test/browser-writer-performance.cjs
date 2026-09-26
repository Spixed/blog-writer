const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(process.env.WRITER_URL || 'http://localhost:5173');
    await page.getByRole('button', { name: /Writer Test/ }).click();
    await page.locator('.tiptap').waitFor();
    await page.evaluate(() => {
      const editor = document.querySelector('.tiptap').editor;
      const content = editor.getJSON().content;
      editor.commands.setContent({
        type: 'doc',
        content: Array.from({ length: 24 }, () => content).flat(),
      });
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.raw-block mjx-container').length === 96,
      undefined,
      { timeout: 60000 },
    );
    const result = await page.evaluate(async () => {
      const editor = document.querySelector('.tiptap').editor;
      let sourceText = '';
      editor.state.doc.descendants((node) => {
        if (node.isText) sourceText += node.text;
        else if (node.type.name === 'rawBlock') sourceText += String(node.attrs.source ?? '');
      });
      const bytes = new TextEncoder().encode(sourceText).byteLength;
      const longTasks = [];
      const observer = new PerformanceObserver((list) =>
        list.getEntries().forEach((e) => longTasks.push(e.duration)),
      );
      observer.observe({ type: 'longtask', buffered: false });
      editor.commands.setTextSelection(5);
      const times = [];
      for (let i = 0; i < 40; i++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now();
        editor.commands.insertContent('测');
        times.push(performance.now() - start);
      }
      const scroll = document.querySelector('.wysiwyg-scroll');
      for (let i = 0; i < 20; i++) {
        scroll.scrollTop = i * 130;
        await new Promise(requestAnimationFrame);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      observer.disconnect();
      times.sort((a, b) => a - b);
      return {
        bytes,
        paragraphs: document.querySelectorAll('.tiptap p').length,
        codeBlocks: document.querySelectorAll('.editor-code-container').length,
        tables: document.querySelectorAll('.tiptap table').length,
        math: document.querySelectorAll('mjx-container').length,
        qmoji: document.querySelectorAll('.qmoji-atom').length,
        p95Ms: times[Math.floor(times.length * 0.95)],
        maxMs: times.at(-1),
        longTasks,
      };
    });
    assert.ok(result.bytes >= 40_000, `mixed document contains only ${result.bytes} source bytes`);
    assert.equal(
      result.longTasks.length,
      0,
      'typing and scrolling must not produce long tasks after rendering settles',
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
