/**
 * Ambient typings for the third-party scripts the preview loads lazily
 * (MathJax v4 and lottie-web). Only the surface the preview uses is declared.
 */
export interface MathJaxStartup {
  defaultReady(): void;
  promise: Promise<unknown>;
}

export interface MathJaxObject {
  startup: MathJaxStartup;
  typesetPromise(elements?: HTMLElement[]): Promise<void>;
  typesetClear?(elements?: HTMLElement[]): void;
  texReset?(start?: number): void;
  [key: string]: unknown;
}

export interface LottieAnimation {
  destroy(): void;
  play(): void;
  pause(): void;
}

export interface LottiePlayer {
  loadAnimation(opts: {
    container: HTMLElement;
    renderer: 'svg' | 'canvas' | 'html';
    loop: boolean;
    autoplay: boolean;
    path: string;
  }): LottieAnimation;
}
