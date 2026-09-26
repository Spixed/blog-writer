async (page) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: '我的第一篇博客 2024-02-13', exact: true }).click();
  await page.getByRole('button', { name: '所见即所得', exact: true }).click();
  if (await page.getByRole('button', { name: '自动保存：开', exact: true }).count()) await page.getByRole('button', { name: '自动保存：开', exact: true }).click();
  await page.locator('.tiptap').waitFor();
  const report = await page.evaluate(async () => {
    const e = document.querySelector('.tiptap').editor;
    const text = '测试长文章编辑。This is a long document with editable paragraphs and predictable layout. '.repeat(3);
    const content = Array.from({ length: 220 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `${i}. ${text}` }] }));
    e.commands.setContent({ type: 'doc', content });
    e.commands.focus('end');
    await new Promise(r => setTimeout(r, 500));
    const longTasks = [];
    const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => longTasks.push(entry.duration)));
    observer.observe({ type: 'longtask' });
    const times = [];
    for (let i = 0; i < 30; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const start = performance.now();
      e.commands.insertContent('a');
      times.push(performance.now() - start);
    }
    await new Promise(r => setTimeout(r, 200));
    observer.disconnect();
    times.sort((a,b) => a-b);
    return { characters: e.getText().length, bytes: new TextEncoder().encode(e.getText()).byteLength, samples: times.length, medianMs: times[15], p95Ms: times[28], maxMs: times[29], longTasks };
  });
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: 'Chengdu No.20 Middle School 2024-04-03', exact: true }).click();
  return report;
}
