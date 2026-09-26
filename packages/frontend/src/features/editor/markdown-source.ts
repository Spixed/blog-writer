const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tokenize source before escaping it, so shortcode delimiters remain intact. */
export function highlightMarkdown(source: string): string {
  let fence = '';
  let fenceLength = 0;
  let heading = 0;
  return `${source
    .split('\n')
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker && !fence) {
        fence = marker[0]!;
        fenceLength = marker.length;
        return `<span class="md-fence">${escape(line)}</span>`;
      }
      if (fence) {
        if (
          marker?.[0] === fence &&
          marker.length >= fenceLength &&
          line.slice(line.indexOf(marker) + marker.length).trim() === ''
        )
          fence = '';
        return `<span class="md-fence">${escape(line)}</span>`;
      }
      const isHeading = /^ {0,3}#{1,6}\s/.test(line);
      const html = line
        .split(/(\{\{[<%][\s\S]*?[>%]\}\}|`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|!?\[[^\]]*\]\([^)]*\))/g)
        .map((part) => {
          const kind = part.startsWith('{{')
            ? 'shortcode'
            : /^(`|\*\*|__)/.test(part)
              ? 'mark'
              : /^!?\[/.test(part)
                ? 'link'
                : '';
          return kind ? `<span class="md-${kind}">${escape(part)}</span>` : escape(part);
        })
        .join('');
      if (isHeading)
        return `<span class="md-heading" data-source-heading="${heading++}" data-level="${/^\s*(#{1,6})/.exec(line)?.[1].length ?? 1}">${html}</span>`;
      if (/^\s*(?:[-*+]\s|\d+[.)]\s)/.test(line)) return `<span class="md-list">${html}</span>`;
      return html;
    })
    .join('\n')}\n`;
}
