/** P4 acceptance probe: mixed 40KB+ content, typing and scroll long tasks. */
async (page) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: /Writer Test/ }).click();
  await page.getByRole('button', { name: '所见即所得', exact: true }).click();
  await page.locator('.tiptap').waitFor();
  return page.evaluate(async () => {
    const editor = document.querySelector('.tiptap')?.editor;
    if (!editor) throw new Error('TipTap editor unavailable');
    const para =
      '性能探针 paragraph with CJK text, inline `code`, **marks**, and media references. '.repeat(
        8,
      );
    const content = Array.from({ length: 90 }, (_, i) => ({
      type: i % 17 === 0 ? 'heading' : 'paragraph',
      attrs: i % 17 === 0 ? { level: 3 } : undefined,
      content: [{ type: 'text', text: `${i} ${para}` }],
    }));
    editor.commands.setContent({ type: 'doc', content });
    await new Promise((r) => setTimeout(r, 300));
    const longTasks = [];
    const observer = new PerformanceObserver((list) =>
      list.getEntries().forEach((e) => longTasks.push(e.duration)),
    );
    observer.observe({ type: 'longtask', buffered: false });
    const timings = [];
    for (let i = 0; i < 40; i++) {
      await new Promise(requestAnimationFrame);
      const t = performance.now();
      editor.commands.insertContent('a');
      timings.push(performance.now() - t);
    }
    const scroll = document.querySelector('.wysiwyg-scroll');
    for (let i = 0; i < 20; i++) {
      scroll.scrollTop = i * 180;
      await new Promise(requestAnimationFrame);
    }
    await new Promise((r) => setTimeout(r, 200));
    observer.disconnect();
    timings.sort((a, b) => a - b);
    return {
      bytes: new TextEncoder().encode(editor.getText()).byteLength,
      medianMs: timings[Math.floor(timings.length / 2)],
      p95Ms: timings[Math.floor(timings.length * 0.95)],
      maxMs: timings.at(-1),
      longTasks,
    };
  });
};
