import { describe, expect, test } from 'bun:test';
import { highlightMarkdown } from '../src/features/editor/markdown-source';
import { mapScroll } from '../src/hooks/useSyncScroll';
import { sourceHasMath } from '../src/render/math';

describe('source editor regressions', () => {
  test('shortcode delimiters are highlighted without interpreting HTML', () => {
    const html = highlightMarkdown('{{< qq-emoji "微笑" >}} <script>alert(1)</script>');
    expect(html).toContain('class="md-shortcode"');
    expect(html).toContain('&lt; qq-emoji');
    expect(html).not.toContain('<script>');
  });
  test('fenced headings do not become scroll anchors', () => {
    const html = highlightMarkdown('# A\n```md\n### example\n```\n###### B');
    expect(html.match(/data-source-heading=/g)?.length).toBe(2);
  });
});

describe('heading scroll mapping', () => {
  const source = [100, 200, 400].map((top) => ({ top }));
  const render = [50, 450, 900].map((top) => ({ top }));
  test('each heading aligns exactly in both directions', () => {
    source.forEach((anchor, i) => {
      expect(mapScroll(anchor.top, source, render, 600, 1500)).toBe(render[i]!.top);
      expect(mapScroll(render[i]!.top, render, source, 1500, 600)).toBe(anchor.top);
    });
  });
  test('movement remains continuous between headings and at the end', () => {
    expect(mapScroll(150, source, render, 600, 1500)).toBe(250);
    expect(mapScroll(600, source, render, 600, 1500)).toBe(1500);
    expect(mapScroll(300, [], [], 600, 1500)).toBe(750);
  });
});

describe('math front matter detection', () => {
  test('recognizes supported inline and display math delimiters', () => {
    expect(sourceHasMath('Inline $x^2$')).toBe(true);
    expect(sourceHasMath('Inline \\(x^2\\)')).toBe(true);
    expect(sourceHasMath('\\[\nx^2\n\\]')).toBe(true);
    expect(sourceHasMath('$$\nx^2\n$$')).toBe(true);
  });
  test('ignores math-looking content inside fenced code', () => {
    expect(sourceHasMath('```md\n$x^2$\n```')).toBe(false);
    expect(sourceHasMath('Plain text only')).toBe(false);
  });
});
