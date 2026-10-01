import { html, useState, useEffect, useRef } from '../lib/deps.js';
import { assignRoles } from '../styling/layering.js';
import { normalizeItem } from '../styling/taxonomy.js';

// ------------------------------------------------------------------ routing
export const navigate = (path) => { location.hash = '#' + path; };
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
// Positions are % of a 4:5 board. Base layers sit just behind and above their mid layer
// so the collar peeks out, like a real flat lay.
export function autoLayout(items, slotIds = null) {
  const its = items.map(normalizeItem);
  let s;
  if (slotIds) {
    const by = (id) => its.find((i) => i.id === id) || null;
    s = { base: by(slotIds.base), mid: by(slotIds.mid), outer: by(slotIds.outer), bottom: by(slotIds.bottom), one_piece: by(slotIds.one_piece), shoes: by(slotIds.shoes),
      accessories: its.filter((i) => !Object.values(slotIds).includes(i.id)) };
  } else s = assignRoles(its);
  const L = [];
  const put = (it, x, y, w, h, z) => it && L.push({ id: it.id, x, y, w, h, z });
  const torso = s.one_piece || s.base;
  const hasOuter = !!s.outer;
  const tx = hasOuter ? 44 : 20, tw = hasOuter ? 52 : 58;
  if (s.outer) put(s.outer, 2, 4, 50, 52, 2);
  if (s.one_piece) {
    put(s.one_piece, tx, 3, tw, 82, 3);
    if (s.mid) put(s.mid, tx - 4, 6, tw * 0.9, 42, 4);
  } else if (s.mid && torso) {
    put(torso, tx + 2, 1, tw - 4, 46, 3);      // behind, shifted up: collar shows
    put(s.mid, tx, 7, tw, 44, 4);
  } else put(s.mid || torso, tx, 4, tw, 46, 4);
  if (s.bottom) put(s.bottom, hasOuter ? 30 : 24, 44, 42, 54, 1);
  if (s.shoes) put(s.shoes, 66, 78, 32, 20, 5);
  (s.accessories || []).forEach((a, i) => put(a, 76, 48 + i * 11, 22, 12, 6 + i));
  return L;
}

export function Board({ items, layout, slots, onClick, className = '', children }) {
  const lay = layout?.length ? layout : autoLayout(items, slots);
  const byId = new Map(items.map((i) => [i.id, i]));
  return html`<div class=${'board ' + className} onClick=${onClick}>
    ${lay.filter((l) => byId.has(l.id)).sort((a, b) => a.z - b.z).map((l) => html`
      <img src=${byId.get(l.id).image_url} alt=${byId.get(l.id).name || ''} loading="lazy" draggable="false"
        style=${`left:${l.x}%;top:${l.y}%;width:${l.w}%;height:${l.h}%;z-index:${l.z}`} />`)}
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
