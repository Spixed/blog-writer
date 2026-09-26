async (page) => {
  page.setDefaultTimeout(7000);
  // This script edits browser state only, even if autosave was previously on.
  await page.route('**/api/posts/**', route => route.request().method() === 'GET'
    ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: 'Chengdu No.20 Middle School 2024-04-03', exact: true }).click();
  await page.getByRole('button', { name: '所见即所得', exact: true }).click();
  const caption = page.getByRole('textbox', { name: 'Image caption', exact: true }).first();
  const oldCaption = await caption.inputValue();
  await caption.fill(oldCaption + ' 测试');
  assert(await caption.inputValue() === oldCaption + ' 测试', 'Caption edit lost text');
  await page.getByRole('button', { name: '即时渲染', exact: true }).click();
  assert((await page.getByRole('textbox', { name: 'Markdown source' }).inputValue()).includes('[' + oldCaption + ' 测试]'), 'Caption did not serialize');
  await page.getByRole('button', { name: 'Qmoji 表情展示 2024-05-23', exact: true }).click();
  await page.getByRole('button', { name: '所见即所得', exact: true }).click();
  await page.locator('.tiptap pre code').first().click();
  await page.getByLabel('Code language', { exact: true }).selectOption('python');
  const custom = page.getByLabel('Custom code language', { exact: true });
  await custom.fill('');
  await custom.pressSequentially('custom-language');
  assert(await custom.inputValue() === 'custom-language', 'Custom code language lost focus while typing');
  await page.getByRole('button', { name: '即时渲染', exact: true }).click();
  assert((await page.getByRole('textbox', { name: 'Markdown source' }).inputValue()).includes('```custom-language'), 'Code language did not serialize');
  await page.getByRole('button', { name: '一环 2026-02-17 ★', exact: true }).click();
  await page.getByRole('button', { name: '所见即所得', exact: true }).click();
  const dropCap = await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const p = document.querySelector('.tiptap > p');
    const range = document.createRange(); range.setStart(p.firstChild, 0); range.setEnd(p.firstChild, 1);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return { first: p.textContent, copied: selection.toString(), size: getComputedStyle(p, '::first-letter').fontSize, measured: p.style.getPropertyValue('--drop-cap-size') };
  });
  assert(dropCap.copied === '那', 'The real drop-cap character cannot be selected');
  assert(dropCap.measured && dropCap.size === dropCap.measured, 'Drop-cap size was not applied');
  assert(Math.abs(parseFloat(dropCap.size) - 39.6) < 0.1, 'Single-line drop cap must use font size times 2.2');
  await page.getByRole('button', { name: 'Blog Detail Log 2024-02-15 ★', exact: true }).click();
  await page.locator('.raw-block .content').first().waitFor();
  const process = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1500));
    const root = document.querySelector('.wysiwyg-scroll');
    const nodes = [...root.querySelectorAll('.raw-block,.image-atom')];
    const heights = [];
    for(let i=0; i<8; i++) { await new Promise(r=>setTimeout(r,250)); heights.push(root.scrollHeight); }
    return { same: nodes.every(x=>x.isConnected), heights };
  });
  assert(process.same && new Set(process.heights).size === 1, 'process.md media is unstable');
  await page.getByRole('button', { name: 'Chengdu No.20 Middle School 2024-04-03', exact: true }).click();
  await page.getByRole('button', { name: '双语翻译', exact: true }).click();
  await page.locator('[data-synced="en"] h2').first().waitFor();
  await page.waitForTimeout(700);
  const bilingual = [];
  for(const lang of ['zh', 'en']) {
    await page.evaluate(lang => { const sc = document.querySelector('[data-synced="' + lang + '"]'); const h = sc.querySelectorAll('h1,h2,h3,h4,h5,h6')[5]; sc.scrollTop = h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop; }, lang);
    await page.waitForTimeout(350);
    const offsets = await page.evaluate(() => [...document.querySelectorAll('.wysiwyg-scroll')].map(sc => sc.querySelectorAll('h1,h2,h3,h4,h5,h6')[5].getBoundingClientRect().top - sc.getBoundingClientRect().top));
    assert(offsets.every(n => Math.abs(n) < 2), 'Bilingual headings did not align: ' + offsets);
    bilingual.push(offsets);
  }
  const report = { pass: true, dropCap, process, bilingual, checks: ['caption serialization', 'custom code language typing', 'selectable adaptive drop cap', 'process media stability', 'bilingual headings'] };
  await page.evaluate(report => { window.__editorResult = report; }, report);
  await page.reload();
  await page.unroute('**/api/posts/**');
  return report;
}


