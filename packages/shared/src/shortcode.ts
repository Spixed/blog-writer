/**
 * Specs for the 3 theme shortcodes (themes/polymer/layouts/shortcodes).
 *
 * The preview pipeline (markdown-it plugin) and the TipTap node views share
 * these descriptors for insert dialogs and argument parsing.
 */

export type ShortcodeName = 'hl' | 'qq-emoji' | 'ruby';

export interface ShortcodeArg {
  name: string;
  label: string;
  type: 'text' | 'color' | 'emoji' | 'select';
  required?: boolean;
  default?: string;
  options?: string[];
  help?: string;
}

export interface ShortcodeSpec {
  name: ShortcodeName;
  label: string;
  description: string;
  /** Whether the shortcode has inner content (block shortcode). */
  hasInner: boolean;
  args: ShortcodeArg[];
  icon: string;
}

export const HL_COLORS = ['orange', 'yellow', 'blue', 'green'] as const;
export const HL_COLOR_MAP: Record<string, string> = {
  orange: '#FF3D00',
  yellow: '#FFD600',
  blue: '#2979FF',
  green: '#00E676',
};

export const SHORTCODES: Record<ShortcodeName, ShortcodeSpec> = {
  hl: {
    name: 'hl',
    label: '彩色高亮',
    description: '为文字添加彩色高亮；内容含换行时渲染为块级引用条。',
    hasInner: true,
    icon: 'H',
    args: [
      {
        name: 'color',
        label: '颜色',
        type: 'color',
        default: 'blue',
        options: [...HL_COLORS],
      },
    ],
  },
  'qq-emoji': {
    name: 'qq-emoji',
    label: 'QQ 表情',
    description: '插入 QQ 风格表情（Qmoji），支持 APNG / Lottie 动画。',
    hasInner: false,
    icon: 'E',
    args: [
      { name: 'name', label: '表情名称', type: 'emoji', required: true, help: '可带 / 前缀，如 "微笑" 或 "/色"' },
      { name: 'mode', label: '模式', type: 'select', default: 'inline', options: ['inline', 'block'] },
    ],
  },
  ruby: {
    name: 'ruby',
    label: '注音 (Ruby)',
    description: '为文字添加注音，如 漢字(かんじ)。',
    hasInner: false,
    icon: 'R',
    args: [
      { name: 'text', label: '文字', type: 'text', required: true },
      { name: 'rt', label: '注音', type: 'text', required: true },
    ],
  },
};

export const SHORTCODE_LIST: ShortcodeSpec[] = [SHORTCODES.hl, SHORTCODES['qq-emoji'], SHORTCODES.ruby];

/** Regex matching a Hugo shortcode call: {{< name args >}} or {{% name args %}} */
export const SHORTCODE_RE = /\{\{[<%]\s*(\w[\w-]*)\s*([^%>]*?)[%>]\}\}/;

export const QMOJI_CDN = 'https://cdn.jsdelivr.net/gh/Spixed/Qmoji@main/res';

/** Resolve a qmoji entry to its asset URL (mirrors themes/polymer/.../qq-emoji.html). */
export function qmojiUrl(entry: { emojiId: string; emojiType: number }): string {
  const file = entry.emojiType === 2 ? 'lottie.json' : entry.emojiType === 1 ? 'apng.png' : 'thumb.png';
  return `${QMOJI_CDN}/${entry.emojiId}/${file}`;
}

/** Normalize an emoji name: allow both "微笑" and "/微笑". */
export function normalizeQmojiName(name: string): string {
  return name.startsWith('/') ? name : `/${name}`;
}
