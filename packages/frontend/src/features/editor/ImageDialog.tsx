import { useEffect, useRef, useState } from 'react';
import type { MediaItem } from '@blog-writer/shared';
import { Image as ImageIcon, ImagePlus, Upload, X } from 'lucide-react';
import { api } from '../../api/index.js';
import { resolveMediaUrl } from '../../render/media-url.js';

export function ImageDialog({ onClose, onInsert }: {
  onClose: () => void;
  onInsert: (src: string, alt: string) => void;
}) {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [tab, setTab] = useState<'url' | 'library'>('url');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [failedSrc, setFailedSrc] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])].filter((el) => el.getClientRects().length);
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (tab !== 'library') return;
    let cancelled = false;
    setLoading(true); setError('');
    api.listMedia().then((items) => { if (!cancelled) setMedia(items); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab]);
  const images = media.filter((item) => /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(item.name) && item.relPath.toLowerCase().includes(search.toLowerCase()));
  return <div className="editor-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={form} className="editor-dialog image-dialog" role="dialog" aria-modal="true" aria-labelledby="insert-image-title" onSubmit={(event) => { event.preventDefault(); if (src.trim()) onInsert(src.trim(), alt.trim()); }}>
      <div className="dialog-kicker"><span className="dialog-glyph" aria-hidden="true"><ImageIcon size={15} /></span>文章配图<button type="button" className="dialog-close" onClick={onClose} aria-label="关闭图片面板"><X size={17} /></button></div>
      <div className="dialog-title-row"><h3 id="insert-image-title">插入图片</h3></div>
      <div className="image-tabs" role="tablist" aria-label="图片来源">
        <button type="button" role="tab" aria-selected={tab === 'url'} onClick={() => setTab('url')}>图片地址</button>
        <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}>媒体库</button>
      </div>
      {tab === 'url' ? <div className="image-compose">
        <label className="dialog-field"><span>图片地址</span><input autoFocus aria-label="图片地址" placeholder="/images/example.png 或 https://…" value={src} onChange={(event) => setSrc(event.target.value)} /></label>
        <div className="image-dialog-preview">
          {src.trim() && failedSrc !== src ? <img key={src} src={resolveMediaUrl(src.trim())} alt="图片预览" onError={() => setFailedSrc(src)} /> : <div className="image-dialog-empty"><ImageIcon size={26} aria-hidden="true" /><small>{failedSrc === src && src ? '图片无法加载，请检查地址' : '图片预览将显示在这里'}</small></div>}
        </div>
      </div> : <div className="image-library">
        <div className="media-library-tools"><input aria-label="搜索媒体" placeholder="搜索图片名称…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className="dialog-secondary" disabled={uploading} onClick={() => uploadInput.current?.click()}><Upload size={15} aria-hidden="true" />{uploading ? '上传中…' : '上传图片'}</button></div>
        <input hidden ref={uploadInput} type="file" accept="image/*" onChange={async (event) => {
          const file = event.target.files?.[0]; if (!file) return;
          event.target.value = ''; setUploading(true); setError('');
          try { const item = await api.uploadMedia('', file.name, await file.arrayBuffer()); setMedia((items) => [item, ...items]); setSrc('/' + item.relPath); }
          catch (reason) { setError(String(reason)); }
          finally { setUploading(false); }
        }} />
        {error && <div role="alert" className="workspace-error">{error}</div>}
        <div className="media-grid" aria-busy={loading}>
          {loading ? <div className="media-empty">正在读取媒体库…</div> : images.length ? images.map((item) => <button className={'media-card' + (src === '/' + item.relPath ? ' selected' : '')} aria-pressed={src === '/' + item.relPath} key={item.relPath} type="button" onClick={() => setSrc('/' + item.relPath)} title={item.relPath}>
            <span className="media-thumb"><img src={resolveMediaUrl('/' + item.relPath)} alt="" loading="lazy" /></span><span className="media-name">{item.name}</span>
          </button>) : <div className="media-empty">{search ? '没有匹配的图片' : '还没有图片，上传第一张素材。'}</div>}
        </div>
        {src && <div className="media-selection">已选择 <span>{src}</span></div>}
      </div>}
      <label className="dialog-field"><span>图注 <small>可选 · 同时用作替代文字</small></span><input aria-label="图片注释" placeholder="用一句话描述这张图片" value={alt} onChange={(event) => setAlt(event.target.value)} /></label>
      <div className="dialog-actions"><span className="dialog-spacer" /><button className="dialog-secondary" type="button" onClick={onClose}>取消</button><button className="dialog-primary" type="submit" disabled={!src.trim() || uploading}><ImagePlus size={15} aria-hidden="true" />插入图片</button></div>
    </form>
  </div>;
}
