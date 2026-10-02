import { html, useState, useEffect, useRef } from '../lib/deps.js';
import { assignRoles } from '../styling/layering.js';
import { normalizeItem } from '../styling/taxonomy.js';

// ------------------------------------------------------------------ routing
export const navigate = (path, { replace = false } = {}) => {
  if (replace) location.replace(location.pathname + location.search + '#' + path); // no history entry (e.g. leaving an editor)
  else location.hash = '#' + path;
};
export const back = () => (history.length > 1 ? history.back() : navigate('/'));

// ------------------------------------------------------------------ icons (inline SVG, stroke style)
const P = {
  closet: 'M4 3h16v18H4zM12 3v18M9 11v2M15 11v2',
  style: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z',
  chat: 'M4 5h16v11H8l-4 4z',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  explore: 'M12 3a9 9 0 100 18 9 9 0 000-18zM15.5 8.5l-2 5-5 2 2-5z',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z',
  wash: 'M4 4h16v17H4zM4 8h16M7 6h1M12 11a4 4 0 100 8 4 4 0 000-8z',
  shuffle: 'M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M18 4l3 3-3 3M18 14l3 3-3 3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  check: 'M5 12l5 5 9-10',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4-6 8-6s7 2 8 6',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .2-1.5-1.5L16.8 4l-3-1-1 2h-1.6l-1-2-3 1 .2 2.7L5.9 8.2 4 8l-1 3 2 1v1.6L3 15l1 3 2-.2 1.4 1.4L7.2 21l3 1 1-2h1.6l1 2 3-1-.2-2.6 1.5-1.5 2 .2 1-3-2-1z',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2',
  trip: 'M3 17l18-6-18-6 4 6zM7 11h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  message: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  lock: 'M6 10h12v11H6zM9 10V7a3 3 0 016 0v3',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  camera: 'M4 8h4l2-3h4l2 3h4v12H4zM12 10a4 4 0 100 8 4 4 0 000-8z',
};
export const Icon = ({ name, size = 20, fill = 'none', cls = '' }) => html`
  <svg class=${'icon ' + cls} width=${size} height=${size} viewBox="0 0 24 24" fill=${fill} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[name] || ''} /></svg>`;

// ------------------------------------------------------------------ toast
let toastSet = null;
export function toast(msg, kind = 'info') {
  const text = typeof msg === 'string' ? msg : msg?.message ? String(msg.message) : msg; // strings, errors or html
  toastSet?.({ msg: text, kind, t: Date.now() });
}
export function Toasts() {
  const [t, setT] = useState(null);
  toastSet = setT;
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), t.kind === 'error' ? 5000 : 2600); return () => clearTimeout(h); }, [t]);
  return t ? html`<div class=${'toast ' + t.kind} role="status" onClick=${() => setT(null)}>${t.msg}</div>` : null;
}

// ------------------------------------------------------------------ layout bits
export const Header = ({ title, backTo, right, sub }) => html`
  <header class="topbar">
    ${backTo !== undefined ? html`<button class="icon-btn" aria-label="Back" onClick=${() => (backTo ? navigate(backTo) : back())}><${Icon} name="back" /></button>` : null}
    <div class="topbar-title"><h1>${title}</h1>${sub ? html`<div class="sub">${sub}</div>` : null}</div>
    <div class="topbar-right">${right}</div>
  </header>`;

export const Spinner = ({ label }) => html`<div class="spinner-wrap"><div class="spinner"></div>${label ? html`<div class="muted">${label}</div>` : null}</div>`;
export const Empty = ({ icon = 'closet', title, children }) => html`
  <div class="empty"><${Icon} name=${icon} size=${36} /><h3>${title}</h3><div class="muted">${children}</div></div>`;

export function Chips({ options, value, onChange, multi = false, small = false }) {
  const list = Array.isArray(options) ? options.map((o) => (typeof o === 'string' ? [o, o] : o)) : Object.entries(options);
  const on = (k) => (multi ? (value || []).includes(k) : value === k);
  const click = (k) => {
    if (!multi) return onChange(value === k ? null : k);
    const v = value || [];
    onChange(v.includes(k) ? v.filter((x) => x !== k) : [...v, k]);
  };
  return html`<div class=${'chips' + (small ? ' small' : '')}>${list.map(([k, label]) => html`
    <button type="button" class=${'chip' + (on(k) ? ' on' : '')} aria-pressed=${on(k)} onClick=${() => click(k)}>${label}</button>`)}</div>`;
}

export function Segmented({ options, value, onChange }) {
  return html`<div class="seg" role="tablist">${options.map(([k, label]) => html`
    <button role="tab" aria-selected=${value === k} class=${value === k ? 'on' : ''} onClick=${() => onChange(k)}>${label}</button>`)}</div>`;
}

export function Toggle({ checked, onChange, label }) {
  return html`<label class="toggle"><input type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} /><span class="track"><span class="thumb"></span></span>${label ? html`<span>${label}</span>` : null}</label>`;
}

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return html`<div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="sheet-head"><h2>${title}</h2><button class="icon-btn" aria-label="Close" onClick=${onClose}><${Icon} name="close" /></button></div>
      <div class="sheet-body">${children}</div>
    </div></div>`;
}

export function useAsync(fn, deps = []) {
  const [s, set] = useState({ loading: true, data: null, error: null });
  const n = useRef(0);
  const run = () => {
    const id = ++n.current;
    set((p) => ({ ...p, loading: true }));
    Promise.resolve().then(fn).then((data) => id === n.current && set({ loading: false, data, error: null }))
      .catch((error) => { console.error(error); id === n.current && set({ loading: false, data: null, error }); });
  };
  useEffect(run, deps);
  return { ...s, reload: run };
}

export const StatusDot = ({ status }) => html`<span class=${'status-dot ' + status} title=${status}></span>`;

export function ItemThumb({ item, onClick, selected, badge, small }) {
  return html`<button type="button" class=${'item-thumb' + (selected ? ' selected' : '') + (small ? ' small' : '') + (item.status !== 'clean' ? ' unavailable' : '')} onClick=${onClick} aria-label=${item.name || item.subcategory}>
    <div class="img"><img src=${item.image_url} alt="" loading="lazy" /></div>
    ${item.status !== 'clean' ? html`<span class=${'tag-status ' + item.status}>${item.status === 'dirty' ? 'Dirty' : 'Washing'}</span>` : null}
    ${badge ? html`<span class="badge">${badge}</span>` : null}
    ${!small ? html`<div class="cap">${item.name || item.subcategory}</div>` : null}
  </button>`;
}

// ------------------------------------------------------------------ flat-lay board
// Laid out like a real flat lay: torso on top, trousers below it, shoes at the bottom,
// outer layer to the side, accessories in a column. Boxes follow each photo's real
// proportions so pieces keep a consistent size. A base layer sits just behind and
// above its mid layer so the collar peeks out.
const DEFAULT_ASPECT = { top: 0.95, outerwear: 0.85, bottom: 0.45, one_piece: 0.5, shoes: 1.9, accessory: 1, bag: 1 };
const ACC_W = { head: 22, eyes: 20, ears: 11, wrist: 13, jewelry: 12, waist: 24, tie: 7, neck: 16, hands: 15, carry: 25 };
const BOARD_H = 125; // board is 100 wide × 125 tall (4:5)
// Per image: the garment's visible bounding box inside the photo (cut-outs often keep empty
// margins or stray specks), so layout and sizing follow the actual garment.
const shapeCache = new Map(); // url -> { aspect, crop:{x,y,w,h} } (crop in 0..1 of the image)
const shapePending = new Set();
const aspectListeners = new Set();
const FULL = { x: 0, y: 0, w: 1, h: 1 };

export const shapeOf = (it) => shapeCache.get(it.image_url) || { aspect: it.aspect || DEFAULT_ASPECT[it.category] || 1, crop: FULL };
export const aspectOf = (it) => shapeOf(it).aspect;

/** Bounding box of the visible garment: rows/columns with a meaningful amount of opaque pixels. */
function contentBox(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const k = Math.min(1, 200 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data; // throws if the image isn't CORS-readable
  const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
  let opaque = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 60) { rows[y]++; cols[x]++; opaque++; }
  if (opaque > w * h * 0.97 || opaque < 20) return FULL; // not a cut-out (or empty): use the whole photo
  const rMin = Math.max(1, w * 0.02), cMin = Math.max(1, h * 0.02); // ignore specks and thin halos
  let y0 = rows.findIndex((n) => n >= rMin), y1 = h - 1 - [...rows].reverse().findIndex((n) => n >= rMin);
  let x0 = cols.findIndex((n) => n >= cMin), x1 = w - 1 - [...cols].reverse().findIndex((n) => n >= cMin);
  if (y0 < 0 || x0 < 0 || y1 <= y0 || x1 <= x0) return FULL;
  return { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h };
}

function measure(url) {
  if (!url || shapeCache.has(url) || shapePending.has(url)) return;
  shapePending.add(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    let crop = FULL;
    try { crop = contentBox(img); } catch {}
    const aspect = ((img.naturalWidth || 1) * crop.w) / ((img.naturalHeight || 1) * crop.h) || 1;
    shapeCache.set(url, { aspect, crop });
    aspectListeners.forEach((f) => f());
  };
  img.onerror = () => shapePending.delete(url);
  img.src = url;
}

/** Re-render once the real garment shapes are known. */
export function useAspects(items) {
  const [v, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    aspectListeners.add(f);
    items.forEach((i) => measure(i.image_url));
    return () => aspectListeners.delete(f);
  }, [items.map((i) => i.id).join()]);
  return v;
}

/** One garment on a board: the box is the visible garment; the photo is stretched so its margins fall outside it. */
export function Piece({ item, l, cls = '', onPointerDown }) {
  const c = shapeOf(item).crop;
  const img = `left:${(-c.x / c.w) * 100}%;top:${(-c.y / c.h) * 100}%;width:${100 / c.w}%;height:${100 / c.h}%`;
  return html`<div class=${'piece ' + cls} onPointerDown=${onPointerDown}
    style=${`left:${l.x}%;top:${l.y}%;width:${l.w}%;height:${l.h}%;z-index:${l.z}`}>
    <img src=${item.image_url} alt=${item.name || ''} loading="lazy" draggable="false" style=${img} />
  </div>`;
}

export function autoLayout(items, slotIds = null) {
  const its = items.map(normalizeItem);
  let s;
  if (slotIds) {
    const by = (id) => its.find((i) => i.id === id) || null;
    s = { base: by(slotIds.base), mid: by(slotIds.mid), outer: by(slotIds.outer), bottom: by(slotIds.bottom), one_piece: by(slotIds.one_piece), shoes: by(slotIds.shoes),
      accessories: its.filter((i) => !Object.values(slotIds).includes(i.id)) };
  } else s = assignRoles(its);
  if (s.one_piece) s.base = null;
  const accs = s.accessories || [];
  // a box with the photo's real proportions, width w, capped at maxH
  const box = (it, cx, top, w, maxH, z) => {
    const a = aspectOf(it);
    let h = w / a;
    if (h > maxH) { h = maxH; w = h * a; }
    return { id: it.id, x: cx - w / 2, y: top, w, h, z };
  };
  const L = [];
  const cx = s.outer ? (accs.length ? 54 : 60) : (accs.length ? 42 : 50);
  const torso = s.mid || s.one_piece || s.base;
  const under = s.mid ? (s.one_piece || s.base) : null;
  let t = null;
  if (s.one_piece && s.mid) {
    L.push(box(s.one_piece, cx, 4, 44, 92, 3));
    t = box(s.mid, cx, 6, 48, 46, 4);
  } else if (torso) {
    t = box(torso, cx, under ? 9 : 4, s.one_piece ? 44 : 50, s.one_piece ? 92 : 52, 4);
    if (under) {
      const shows = under.neckline === 'collared' || s.mid.front === 'open' || s.mid.sleeve === 'none';
      if (shows) L.push(box(under, cx, t.y - 6, t.w * 0.96, 60, 3)); // behind, shifted up: collar shows
      else { const u = box(under, 0, t.y - 4, t.w * 0.8, 48, 3); u.x = Math.max(1, t.x - u.w * 0.45); L.push(u); } // hidden layer: tucked beside it
    }
  }
  if (t) L.push(t);
  let bot = null;
  if (s.bottom) {
    const top = t ? t.y + t.h * 0.78 : 30;
    bot = box(s.bottom, cx, top, 44, Math.min(72, BOARD_H - 3 - top), 1);
    L.push(bot);
  }
  if (s.outer) {
    const o = box(s.outer, 0, 6, 46, 64, 2);
    o.x = Math.max(1, (t ? t.x : cx - 20) - o.w + 14);
    L.push(o);
  }
  let shoesTop = BOARD_H;
  if (s.shoes) {
    const sh = box(s.shoes, 0, 0, 27, 22, 5);
    sh.y = bot ? Math.min(BOARD_H - 2 - sh.h, bot.y + bot.h - sh.h * 0.35) : BOARD_H - 2 - sh.h; // by the trouser hems
    sh.x = Math.min(100 - sh.w - 1, bot ? bot.x + bot.w - 8 : cx + 8);
    shoesTop = sh.y;
    L.push(sh);
  }
  // accessories: a column on the right, overflowing to the bottom-left
  const colR = t ? t.x + t.w : 75;
  const colW = Math.max(14, 99 - colR);
  let y = 3, yLeft = BOARD_H - 3;
  accs.forEach((a, i) => {
    const w = Math.min(ACC_W[a.acc?.slot] || 16, colW);
    const b = box(a, 0, 0, w, 20, 6 + i);
    if (y + b.h < shoesTop - 2) { b.x = 99 - Math.max(b.w, (colW + b.w) / 2); b.y = y; y += b.h + 2; }
    else { b.x = 2 + (i % 2) * 14; yLeft -= b.h + 2; b.y = yLeft; }
    L.push(b);
  });
  // scale and centre the whole arrangement so it fills the board without clipping
  if (L.length) {
    const x0 = Math.min(...L.map((l) => l.x)), x1 = Math.max(...L.map((l) => l.x + l.w));
    const y0 = Math.min(...L.map((l) => l.y)), y1 = Math.max(...L.map((l) => l.y + l.h));
    const k = Math.min(94 / (x1 - x0), (BOARD_H - 6) / (y1 - y0), 1.3);
    const dx = (100 - (x1 - x0) * k) / 2 - x0 * k, dy = (BOARD_H - (y1 - y0) * k) / 2 - y0 * k;
    L.forEach((l) => { l.x = l.x * k + dx; l.y = l.y * k + dy; l.w *= k; l.h *= k; });
  }
  // to percentages of the board
  return L.map((l) => ({ id: l.id, x: l.x, y: (l.y / BOARD_H) * 100, w: l.w, h: (l.h / BOARD_H) * 100, z: l.z, v: 2 }));
}

/** Saved layouts from the editor carry v:2; anything older is re-laid out. */
const usable = (layout) => layout?.length && layout.every((l) => l.v === 2);

export function Board({ items, layout, slots, onClick, className = '', children }) {
  useAspects(items);
  const lay = usable(layout) ? layout : autoLayout(items, slots);
  const byId = new Map(items.map((i) => [i.id, i]));
  return html`<div class=${'board ' + className} onClick=${onClick}>
    ${lay.filter((l) => byId.has(l.id)).sort((a, b) => a.z - b.z).map((l) => html`<${Piece} key=${l.id} item=${byId.get(l.id)} l=${l} />`)}
    ${children}
  </div>`;
}

export const Rating = ({ value }) => html`<span class=${'rating ' + (value >= 8.5 ? 'great' : value >= 7 ? 'good' : value >= 5 ? 'ok' : 'low')}>${(value ?? 0).toFixed(1)}</span>`;

export function Reasons({ reasons = [], warnings = [], max = 4 }) {
  return html`<ul class="reasons">
    ${reasons.slice(0, max).map((r) => html`<li class="pos"><${Icon} name="check" size=${14} /> ${r.text}</li>`)}
    ${warnings.slice(0, 2).map((r) => html`<li class="neg">! ${r.text}</li>`)}
  </ul>`;
}

export const confirmAsk = (msg) => window.confirm(msg);
export const money = (n, cur = 'EUR') => (n == null || n === '' ? '' : new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n));
export const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`; return new Date(iso).toLocaleDateString();
};
