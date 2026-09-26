async (page) => {
  const assert = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5173/');
  await page
    .getByRole('button', { name: 'Chengdu No.20 Middle School 2024-04-03', exact: true })
    .click();
  await page.getByRole('button', { name: '所见即所得', exact: true }).click();
  await page.locator('.raw-block .content table').first().waitFor();
  const stability = await page.evaluate(async () => {
    await document.fonts.ready;
    const root = document.querySelector('.wysiwyg-scroll');
    const nodes = [...root.querySelectorAll('.raw-block,.image-atom')];
    const heights = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 300));
      heights.push(root.scrollHeight);
    }
    return {
      heights,
      sameNodes: nodes.every((n) => n.isConnected),
      images: [...root.querySelectorAll('img[src]')].map((n) => n.naturalWidth),
    };
  });
  assert(stability.sameNodes, 'Media node views were remounted while idle');
  assert(new Set(stability.heights).size === 1, 'Article height oscillates');
  assert(
    stability.images.every((n) => n > 0),
    'An article image did not load',
  );
  await page.getByRole('button', { name: '即时渲染', exact: true }).click();
  await page.locator('.preview-scroll h3').first().waitFor();
  const results = [];
  for (const source of [false, true, false, true]) {
    const expected = await page.evaluate((source) => {
      const ta = document.querySelector('.markdown-source-input');
      const pre = document.querySelector('.markdown-highlight');
      const preview = document.querySelector('.preview-scroll');
      const index = source ? 7 : 5;
      const a = [...pre.querySelectorAll('[data-source-heading]')][index];
      const b = [...preview.querySelectorAll('h1,h2,h3,h4,h5,h6')][index];
      const at = a.getBoundingClientRect().top - pre.getBoundingClientRect().top + pre.scrollTop;
      const bt =
        b.getBoundingClientRect().top - preview.getBoundingClientRect().top + preview.scrollTop;
      (source ? ta : preview).scrollTop = source ? at : bt;
      return { at, bt };
    }, source);
    await page.waitForTimeout(400);
    const actual = await page.evaluate(() => ({
      at: document.querySelector('.markdown-source-input').scrollTop,
      bt: document.querySelector('.preview-scroll').scrollTop,
    }));
    assert(
      Math.abs(actual.at - expected.at) < 2 && Math.abs(actual.bt - expected.bt) < 2,
      `Heading scroll alignment failed: ${JSON.stringify({ source, expected, actual })}`,
    );
    results.push({ source, expected, actual });
  }
  const stablePosition = await page.evaluate(() => [
    document.querySelector('.markdown-source-input').scrollTop,
    document.querySelector('.preview-scroll').scrollTop,
  ]);
  await page.waitForTimeout(1500);
  assert(
    JSON.stringify(stablePosition) ===
      JSON.stringify(
        await page.evaluate(() => [
          document.querySelector('.markdown-source-input').scrollTop,
          document.querySelector('.preview-scroll').scrollTop,
        ]),
      ),
    'Scroll bounced after settling',
  );
  assert(errors.length === 0, `Runtime errors: ${errors.join(';')}`);
  const report = { pass: true, stability, scroll: results, errors };
  await page.evaluate((report) => {
    window.__layoutResult = report;
  }, report);
  return report;
};
