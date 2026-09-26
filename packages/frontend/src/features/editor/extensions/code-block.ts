import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';

/** Only `code` is editable. The toolbar and gutter never enter the document. */
export const EditorCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'code-container editor-code-container';
      const toolbar = dom.appendChild(document.createElement('div'));
      toolbar.className = 'code-toolbar';
      toolbar.contentEditable = 'false';
      const label = toolbar.appendChild(document.createElement('span'));
      label.className = 'code-lang';
      const gutter = dom.appendChild(document.createElement('div'));
      gutter.className = 'editor-code-gutter';
      gutter.contentEditable = 'false';
      gutter.setAttribute('aria-hidden', 'true');
      const pre = dom.appendChild(document.createElement('pre'));
      pre.className = 'editor-code';
      const code = pre.appendChild(document.createElement('code'));
      let lineCount = 0;
      const update = (next: typeof node) => {
        label.textContent = String(next.attrs.language || 'text').toUpperCase();
        code.className = next.attrs.language ? `language-${next.attrs.language}` : '';
        const count = next.textContent.split('\n').length;
        if (count !== lineCount) {
          gutter.replaceChildren(...Array.from({ length: count }, (_, i) => {
            const line = document.createElement('span');
            line.dataset.line = String(i + 1);
            return line;
          }));
          lineCount = count;
        }
      };
      update(node);
      return {
        dom,
        contentDOM: code,
        update(next) {
          if (next.type !== node.type) return false;
          update(next);
          return true;
        },
        ignoreMutation(mutation) {
          return mutation.type !== 'selection' && !code.contains(mutation.target);
        },
      };
    };
  },
});
