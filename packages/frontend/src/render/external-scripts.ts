/**
 * Lazy loaders for the third-party scripts the theme itself loads lazily
 * (partials/mathjax.html, assets/js/main.js). Shared by the preview pane and
 * the WYSIWYG raw-block node views so the two never load them twice.
 */
import type { MathJaxObject, LottiePlayer, LottieAnimation } from '../components/external.js';

let mjPromise: Promise<MathJaxObject | null> | null = null;
let mathQueue: Promise<unknown> = Promise.resolve();

export function loadMathJax(): Promise<MathJaxObject | null> {
  if (mjPromise) return mjPromise;
  mjPromise = new Promise((resolve) => {
    const w = window as unknown as { MathJax?: MathJaxObject };
    if (typeof w.MathJax?.typesetPromise === 'function') {
      w.MathJax.startup.promise.then(() => resolve(w.MathJax!)).catch(() => resolve(null));
      return;
    }
    // Same config as the theme's mathjax partial.
    w.MathJax = {
      loader: { load: ['[tex]/mhchem'] },
      tex: {
        packages: { '[+]': ['mhchem'] },
        inlineMath: [
          ['$', '$'],
          ['\\(', '\\)'],
        ],
        displayMath: [
          ['$$', '$$'],
          ['\\[', '\\]'],
        ],
        processEscapes: true,
        processEnvironments: true,
        tags: 'ams',
      },
      options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre'],
        enableMenu: false,
      },
      startup: {
        typeset: false,
        ready: () => {
          w.MathJax!.startup.defaultReady();
          w.MathJax!.startup.promise.then(() => { clearTimeout(timeout); resolve(w.MathJax!); }).catch(fail);
        },
      },
    } as unknown as MathJaxObject;
    const s = document.createElement('script');
    const fail = () => { clearTimeout(timeout); s.remove(); mjPromise = null; resolve(null); };
    const timeout = setTimeout(fail, 20_000);
    s.onerror = fail;
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js';
    s.async = true;
    document.head.appendChild(s);
  });
  return mjPromise;
}

let lottiePromise: Promise<LottiePlayer | null> | null = null;

export function loadLottie(): Promise<LottiePlayer | null> {
  if (lottiePromise) return lottiePromise;
  lottiePromise = new Promise((resolve) => {
    const w = window as unknown as { lottie?: LottiePlayer };
    if (w.lottie) {
      resolve(w.lottie);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js';
    s.async = true;
    const fail = () => { clearTimeout(timeout); s.remove(); lottiePromise = null; resolve(null); };
    const timeout = setTimeout(fail, 20_000);
    s.onload = () => { clearTimeout(timeout); resolve(w.lottie ?? null); };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return lottiePromise;
}

/**
 * Typeset every `[data-math]` element under `root`: fill it with its raw TeX
 * first (the render pipeline keeps the TeX in an attribute), then let MathJax
 * replace it. Non-fatal: a typeset error never blocks editing.
 */
export function typesetMath(root: HTMLElement): void {
  const nodes = root.querySelectorAll<HTMLElement>('[data-math]');
  if (nodes.length === 0) return;
  nodes.forEach((n) => {
    const tex = n.getAttribute('data-math') ?? '';
    // MathJax scans delimiters, while the renderer stores raw TeX in an
    // attribute to keep Markdown parsing from touching underscores/braces.
    n.textContent = n.classList.contains('math-display') ? `\\[${tex}\\]` : `\\(${tex}\\)`;
  });
  const ready = loadMathJax();
  mathQueue = mathQueue.catch(() => undefined).then(() => ready).then(async (mj) => {
    if (!mj) return;
    try {
      if (!root.isConnected) return;
      // Clear only this subtree's previous MathJax state before reusing it.
      mj.typesetClear?.([root]);
      mj.texReset?.();
      await mj.typesetPromise([root]);
    } catch {
      // typeset errors are non-fatal for the preview
    }
  });
}

/**
 * Port of the theme's `adjustDropCap` (assets/js/main.js). The static CSS
 * fallback is 4rem, but the blog sizes the first letter per paragraph: two line
 * heights, or 2.2x the font size when the paragraph is a single line. Call this
 * after every render so the editor's drop cap is identical to the blog's.
 */
function measureDropCap(element: HTMLElement): string | undefined {
  const style = getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight);
  const fontSize = parseFloat(style.fontSize);
  if (!lineHeight || !fontSize) return;
  // Use the paragraph's line-box height. Range.getClientRects also returns
  // the floated first letter at a different baseline, incorrectly counting a
  // single sentence as two lines. Cloning into editable DOM is unsafe because
  // ProseMirror would parse the clone and reload every embedded media node.
  const lines = Math.max(1, Math.round(element.getBoundingClientRect().height / lineHeight));
  const dropCapSize = lines === 1 ? fontSize * 2.2 : lineHeight * 2;
  return `${dropCapSize}px`;
}

export function dropCapMeasurements(root: HTMLElement): Map<HTMLElement, string> {
  const result = new Map<HTMLElement, string>();
  const content = root.classList.contains('content') ? root : root.querySelector<HTMLElement>('.content');
  if (!content) return result;
  const firstP = content.querySelector<HTMLElement>(':scope > p:first-of-type');
  const eligible = new Set<HTMLElement>();
  if (firstP && !firstP.closest('.footnotes')) eligible.add(firstP);
  content.querySelectorAll<HTMLElement>('blockquote p:first-of-type').forEach((p) => {
    if (!p.closest('.footnotes, .raw-block')) eligible.add(p);
  });
  eligible.forEach((el) => {
    const size = measureDropCap(el);
    if (size) result.set(el, size);
  });
  return result;
}

/** For read-only previews only. Editable views use ProseMirror decorations. */
export function adjustDropCap(root: HTMLElement): void {
  const measurements = dropCapMeasurements(root);
  root.querySelectorAll<HTMLElement>('[style*="--drop-cap-size"]').forEach((el) => {
    if (!measurements.has(el)) el.style.removeProperty('--drop-cap-size');
  });
  measurements.forEach((size, el) => {
    if (el.style.getPropertyValue('--drop-cap-size') !== size) el.style.setProperty('--drop-cap-size', size);
  });
}

/** Animate `[data-lottie-path]` qmoji exactly like the theme's main.js. */
export function animateLottie(root: HTMLElement): (() => void) | undefined {
  const lotties = root.querySelectorAll<HTMLElement>('[data-lottie-path]');
  if (lotties.length === 0) return;
  let cancelled = false;
  const animations = new Map<HTMLElement, LottieAnimation>();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const animation = animations.get(entry.target as HTMLElement);
      if (entry.isIntersecting && !document.hidden) animation?.play();
      else animation?.pause();
    });
  });
  const visibility = () => {
    animations.forEach((animation, container) => {
      animation.pause();
      if (!document.hidden) { observer.unobserve(container); observer.observe(container); }
    });
  };
  document.addEventListener('visibilitychange', visibility);
  loadLottie().then((lottie) => {
    if (!lottie || cancelled || !root.isConnected) return;
    lotties.forEach((container) => {
      const path = container.getAttribute('data-lottie-path');
      if (path && container.innerHTML === '' && container.dataset.lottieInitialized !== 'true') {
        // Mark before starting the async animation. A ResizeObserver or a
        // React node-view update may call this function again before lottie
        // has inserted its SVG; without the marker that creates duplicate
        // network loads and competing animations.
        container.dataset.lottieInitialized = 'true';
        const animation = lottie.loadAnimation({
          container,
          renderer: 'svg',
          loop: true,
          autoplay: false,
          path,
        } as never);
        animations.set(container, animation);
        observer.observe(container);
      }
    });
  });
  return () => {
    cancelled = true;
    observer.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    animations.forEach((animation, container) => { animation.destroy(); delete container.dataset.lottieInitialized; });
    animations.clear();
  };
}
