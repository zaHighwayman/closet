import { html, useState, useEffect, useMemo, useRef } from '../lib/deps.js';
import { useStore, saveOutfit, settings } from '../lib/store.js';
import { generate, rateSlots } from '../styling/engine.js';
import { canBe, assignRoles, describe } from '../styling/layering.js';
import { OCCASIONS } from '../styling/taxonomy.js';
import { useWeather, forecastFor, baseContext } from '../ui/hooks.js';
import { Header, Icon, Rating, Reasons, Sheet, Toggle, Empty, navigate, toast, autoLayout, useAspects, Piece } from '../ui/components.js';
import { HARMONY, TasteButtons } from './style.js';

// The outfit is built slot by slot; each slot says which pieces belong in it.
const SLOTS = [
  { key: 'base', label: 'Top', hint: 'tee, shirt, polo, dress', fits: (i) => (i.category === 'top' && canBe(i, 'base')) || i.category === 'one_piece' },
  { key: 'mid', label: 'Layer', hint: 'knit, hoodie, overshirt', fits: (i) => (i.category === 'top' || i.category === 'outerwear') && canBe(i, 'mid') },
  { key: 'outer', label: 'Outerwear', hint: 'jacket, coat, blazer', fits: (i) => canBe(i, 'outer') },
  { key: 'bottom', label: 'Bottoms', hint: 'jeans, chinos, skirt', fits: (i) => i.category === 'bottom' },
  { key: 'shoes', label: 'Shoes', hint: '', fits: (i) => i.category === 'shoes' },
  { key: 'accessories', label: 'Accessories', hint: 'hat, watch, belt, bag', fits: (i) => i.category === 'accessory' || i.category === 'bag', multi: true },
];
const EMPTY = { base: null, mid: null, outer: null, bottom: null, shoes: null, accessories: [] };

// a dress picked as "Top" fills the one-piece slot for the engine
const toEngine = (s) => (s.base?.category === 'one_piece' ? { ...s, one_piece: s.base, base: null, bottom: null } : s);
const idsOf = (s) => [s.base, s.mid, s.outer, s.bottom, s.shoes, ...s.accessories].filter(Boolean).map((i) => i.id);
const slotIdsOf = (s) => {
  const e = toEngine(s);
  return Object.fromEntries(['base', 'mid', 'outer', 'bottom', 'one_piece', 'shoes'].filter((k) => e[k]).map((k) => [k, e[k].id]));
};

function fromItems(items) {
  const r = assignRoles(items);
  return { base: r.one_piece || r.base, mid: r.mid, outer: r.outer, bottom: r.one_piece ? null : r.bottom, shoes: r.shoes, accessories: r.accessories || [] };
}

export function CreatorView({ id, query }) {
  const st = useStore();
  const weather = useWeather();
  const byId = new Map(st.items.map((i) => [i.id, i]));
  const existing = id ? st.outfits.find((o) => o.id === id) : null;

  const [slots, setSlots] = useState(() => {
    const ids = existing?.item_ids || (query.items ? query.items.split(',') : []);
    const its = ids.map((x) => byId.get(x)).filter(Boolean);
    if (query.slots) {
      const q = JSON.parse(query.slots);
      const g = (k) => byId.get(q[k]) || null;
      return { base: g('one_piece') || g('base'), mid: g('mid'), outer: g('outer'), bottom: g('bottom'), shoes: g('shoes'),
        accessories: its.filter((i) => i.category === 'accessory' || i.category === 'bag') };
    }
    return its.length ? fromItems(its) : EMPTY;
  });
  const [locked, setLocked] = useState(new Set());
  const [picker, setPicker] = useState(null); // slot key
  const [occasion, setOccasion] = useState(existing?.occasion || query.occasion || settings().occasion || 'casual');
  const [layout, setLayout] = useState(() => (existing?.layout?.every?.((l) => l.v === 2) && existing.layout.length ? existing.layout : null));
  const touched = useRef(!!layout);
  const [sel, setSel] = useState(null);
  const [meta, setMeta] = useState(false);
  const [name, setName] = useState(existing?.name || '');
  const [vis, setVis] = useState(existing?.visibility || 'private');
  const [colId, setColId] = useState(existing?.collection_id || '');
  const [saving, setSaving] = useState(false);
  const boardRef = useRef(null);
  const drag = useRef(null);

  const ids = idsOf(slots);
  const its = ids.map((x) => byId.get(x)).filter(Boolean);
  const aspects = useAspects(its);
  const ctx = useMemo(() => baseContext({ occasion, weather: { ...baseContext().weather, forecast: forecastFor(weather) } }), [occasion, weather.data]);
  const hasTop = !!(slots.base || slots.mid);
  const rating = useMemo(() => (hasTop && its.length >= 2 ? rateSlots(toEngine(slots), ctx) : null), [ids.join(), ctx]);

  // keep the picture auto-arranged until you move something yourself
  const lay = !touched.current || !layout ? autoLayout(its, slotIdsOf(slots)) : layout.filter((l) => ids.includes(l.id));
  useEffect(() => { if (!touched.current) setLayout(null); }, [ids.join(), aspects]);

  function put(key, item) {
    setSlots((s) => {
      const next = { ...s };
      if (key === 'accessories') {
        const has = s.accessories.some((a) => a.id === item.id);
        next.accessories = has ? s.accessories.filter((a) => a.id !== item.id) : [...s.accessories, item];
      } else {
        // a piece can only be in one slot
        for (const k of ['base', 'mid', 'outer']) if (next[k]?.id === item.id) next[k] = null;
        next[key] = s[key]?.id === item.id ? null : item;
        if (key === 'base' && item.category === 'one_piece') next.bottom = null;
      }
      return next;
    });
    if (touched.current && layout) {
      // add the new piece where auto-layout would put it, keep your arrangement for the rest
      const auto = autoLayout([...its, item], slotIdsOf({ ...slots, [key]: item }));
      const spot = auto.find((l) => l.id === item.id);
      if (spot && !layout.some((l) => l.id === item.id)) setLayout([...layout, { ...spot, z: Math.max(0, ...layout.map((l) => l.z)) + 1 }]);
    }
  }
  const clear = (key) => setSlots((s) => ({ ...s, [key]: key === 'accessories' ? [] : null }));
  const toggleLock = (key) => setLocked((l) => { const n = new Set(l); n.has(key) ? n.delete(key) : n.add(key); return n; });

  /** Fill empty slots (complete) or replace unlocked ones (shuffle), keeping your locked / chosen pieces. */
  function fill(mode) {
    const keep = mode === 'complete' ? ids : SLOTS.flatMap((sl) => (locked.has(sl.key) ? (sl.multi ? slots.accessories.map((a) => a.id) : [slots[sl.key]?.id]) : [])).filter(Boolean);
    const drop = mode === 'shuffle' ? ids.filter((x) => !keep.includes(x)) : [];
    // pieces you picked may be in the laundry; everything the creator adds must be clean
    const dirtyOthers = st.items.filter((i) => i.status !== 'clean' && !keep.includes(i.id)).map((i) => i.id);
    const out = generate(st.items, { ...ctx, mustInclude: keep, exclude: [...drop, ...dirtyOthers], includeDirty: true, count: 1, seed: Math.floor(Math.random() * 1e9) })[0];
    if (!out) return toast(mode === 'complete' ? 'Nothing in your clean clothes completes this — try swapping a piece' : 'No other combination works with the locked pieces', 'error');
    const g = (k) => byId.get(out.slots[k]) || null;
    setSlots({ base: g('one_piece') || g('base'), mid: g('mid'), outer: g('outer'), bottom: g('bottom'), shoes: g('shoes'),
      accessories: (out.accessoryIds || []).map((x) => byId.get(x)).filter(Boolean) });
    touched.current = false; setLayout(null);
  }

  // ---- dragging on the picture
  const current = lay;
  const upd = (itemId, p) => setLayout((L) => (L || current).map((l) => (l.id === itemId ? { ...l, ...p } : l)));
  function onDown(e, l) {
    e.preventDefault();
    if (!touched.current) { touched.current = true; setLayout(current); }
    setSel(l.id);
    const r = boardRef.current.getBoundingClientRect();
    drag.current = { id: l.id, sx: e.clientX, sy: e.clientY, x: l.x, y: l.y, W: r.width, H: r.height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    const d = drag.current;
    if (d) upd(d.id, { x: d.x + ((e.clientX - d.sx) / d.W) * 100, y: d.y + ((e.clientY - d.sy) / d.H) * 100 });
  }
  const onUp = () => { drag.current = null; };
  const selL = current.find((l) => l.id === sel);

  async function save() {
    setSaving(true);
    try {
      const saved = await saveOutfit({ ...(existing || {}), id: existing?.id, name, item_ids: ids, layout: current.map((l) => ({ ...l, v: 2 })), occasion,
        visibility: vis, collection_id: colId || null, rating: rating?.rating ?? null, reasons: rating?.reasons?.slice(0, 5) || [] });
      toast(html`Fit saved · <a href=${'#/outfit/' + saved.id}>open</a>`);
      navigate(query.from || '/outfits', { replace: true });
    } catch (e) { toast(e, 'error'); }
    setSaving(false);
  }

  if (st.items.length < 2) return html`<${Header} title="Create a fit" backTo="" /><${Empty} icon="style" title="Add some clothes first">The fit creator builds from your closet.<//>`;

  return html`
    <${Header} title=${existing ? 'Edit fit' : 'Create a fit'} backTo="" right=${html`<button class="btn small primary" disabled=${!ids.length} onClick=${() => setMeta(true)}>Save</button>`} />
    <div class="creator">
      <div class="creator-board">
        <div class="board edit" ref=${boardRef} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp} onClick=${(e) => e.target === boardRef.current && setSel(null)}>
          ${current.filter((l) => byId.has(l.id)).sort((a, b) => a.z - b.z).map((l) => html`
            <${Piece} key=${l.id} item=${byId.get(l.id)} l=${l} cls=${sel === l.id ? 'sel' : ''} onPointerDown=${(e) => onDown(e, l)} />`)}
          ${!ids.length ? html`<div class="board-hint">Pick pieces below, or tap “Complete my fit”</div>` : null}
        </div>
        ${selL ? html`<div class="row gap edit-tools">
          <label class="range grow">Size<input type="range" min="5" max="90" value=${selL.w} onInput=${(e) => { const w = Number(e.target.value); upd(sel, { w, h: selL.h * (w / selL.w) }); }} /></label>
          <button class="icon-btn" aria-label="Bring forward" onClick=${() => upd(sel, { z: Math.max(...current.map((l) => l.z)) + 1 })}><${Icon} name="up" /></button>
          <button class="icon-btn" aria-label="Send back" onClick=${() => upd(sel, { z: Math.min(...current.map((l) => l.z)) - 1 })}><${Icon} name="down" /></button>
          <button class="btn small" onClick=${() => { touched.current = false; setLayout(null); setSel(null); }}>Auto-arrange</button>
        </div>` : html`<p class="muted small center">Drag pieces on the picture to arrange them.</p>`}
      </div>

      <div class="creator-side">
        <div class="row gap wrap">
          <select class="small" value=${occasion} onChange=${(e) => setOccasion(e.target.value)} aria-label="Occasion">${Object.entries(OCCASIONS).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select>
          <span class="grow"></span>
          <button class="btn small" onClick=${() => fill('complete')}><${Icon} name="style" size=${16} /> Complete my fit</button>
          <button class="btn small" disabled=${!ids.length} onClick=${() => fill('shuffle')}><${Icon} name="shuffle" size=${16} /> Shuffle${locked.size ? ' unlocked' : ''}</button>
        </div>

        <div class="card rating-live">
          ${!hasTop ? html`<p class="muted small">Add a top to see how the fit scores.</p>`
            : !rating ? html`<p class="muted small">Add another piece to see the score.</p>`
            : rating.invalid ? html`<${Reasons} warnings=${rating.warnings} />`
            : html`<div class="row"><${Rating} value=${rating.rating} /><span class="muted small grow">${HARMONY[rating.harmony]}</span><${TasteButtons} ids=${ids} /></div>
              <${Reasons} reasons=${rating.reasons} warnings=${rating.warnings} max=${3} />`}
        </div>

        <div class="slots">
          ${SLOTS.filter((sl) => !(sl.key === 'bottom' && slots.base?.category === 'one_piece')).map((sl) => {
            const filled = sl.multi ? slots.accessories : slots[sl.key] ? [slots[sl.key]] : [];
            return html`<div class=${'slot' + (filled.length ? ' filled' : '')}>
              <button class="slot-main" onClick=${() => setPicker(sl.key)} aria-label=${`Choose ${sl.label}`}>
                ${filled.length ? html`<div class="slot-imgs">${filled.slice(0, 3).map((i) => html`<img src=${i.image_url} alt="" />`)}</div>`
                  : html`<div class="slot-empty"><${Icon} name="plus" size=${18} /></div>`}
                <span class="slot-label"><b>${sl.label}</b><span class="muted small">${filled.length ? (sl.multi ? `${filled.length} picked` : describe(filled[0])) : sl.hint}</span></span>
              </button>
              ${filled.length ? html`<div class="slot-tools">
                <button class=${'icon-btn' + (locked.has(sl.key) ? ' on' : '')} aria-pressed=${locked.has(sl.key)} aria-label=${locked.has(sl.key) ? 'Unlock' : 'Lock (keep when shuffling)'} onClick=${() => toggleLock(sl.key)}><${Icon} name="lock" size=${16} /></button>
                <button class="icon-btn" aria-label="Remove" onClick=${() => clear(sl.key)}><${Icon} name="close" size=${16} /></button>
              </div>` : null}
            </div>`;
          })}
        </div>
      </div>
    </div>

    ${picker ? html`<${SlotPicker} slot=${SLOTS.find((s) => s.key === picker)} slots=${slots} items=${st.items} ctx=${ctx}
      onPick=${(it) => { put(picker, it); if (picker !== 'accessories') setPicker(null); }} onClose=${() => setPicker(null)} />` : null}

    <${Sheet} open=${meta} onClose=${() => setMeta(false)} title="Save fit">
      <div class="form">
        <label>Name<input value=${name} placeholder="optional" onInput=${(e) => setName(e.target.value)} /></label>
        <label>Collection<select value=${colId} onChange=${(e) => setColId(e.target.value)}><option value="">None</option>${(st.collections || []).map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select></label>
        <${Toggle} checked=${vis === 'public'} onChange=${(c) => setVis(c ? 'public' : 'private')} label="Share publicly" />
        <button class="btn primary wide" disabled=${saving} onClick=${save}>${saving ? 'Saving…' : 'Save'}</button>
      </div>
    <//>`;
}

/** Pick a piece for one slot; candidates are ranked by how well they'd score with the rest of the fit. */
function SlotPicker({ slot, slots, items, ctx, onPick, onClose }) {
  const [hideDirty, setHideDirty] = useState(true);
  const [q, setQ] = useState('');
  const others = idsOf(slots);
  const ranked = useMemo(() => items.filter(slot.fits).map((it) => {
    const trial = slot.multi
      ? { ...slots, accessories: slots.accessories.some((a) => a.id === it.id) ? slots.accessories : [...slots.accessories, it] }
      : { ...slots, [slot.key]: it, ...(it.category === 'one_piece' ? { bottom: null } : {}) };
    const hasTop = trial.base || trial.mid;
    const r = hasTop && idsOf(trial).length >= 2 ? rateSlots(toEngine(trial), ctx) : null;
    return { it, r };
  }).sort((a, b) => (b.r?.invalid ? -1 : b.r?.rating ?? 0) - (a.r?.invalid ? -1 : a.r?.rating ?? 0)), [slot.key, others.join(), ctx]);
  const list = ranked.filter(({ it }) => (!hideDirty || it.status === 'clean' || others.includes(it.id))
    && (!q || [it.name, it.subcategory, ...it.colors.map((c) => c.name)].join(' ').toLowerCase().includes(q.toLowerCase())));

  return html`<${Sheet} open=${true} onClose=${onClose} title=${'Choose ' + slot.label.toLowerCase()}>
    <div class="row gap"><div class="search"><${Icon} name="search" size=${18} /><input placeholder="Search" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <${Toggle} checked=${hideDirty} onChange=${setHideDirty} label="Clean only" /></div>
    ${list.length ? html`<div class="pick-grid">${list.map(({ it, r }) => {
      const on = others.includes(it.id);
      return html`<button class=${'pick' + (on ? ' on' : '') + (r?.invalid ? ' bad' : '')} onClick=${() => onPick(it)} title=${r?.invalid ? r.warnings[0]?.text : ''}>
        <div class="img"><img src=${it.image_url} alt="" loading="lazy" /></div>
        ${r && !r.invalid ? html`<span class="pick-score">${r.rating.toFixed(1)}</span>` : null}
        ${r?.invalid ? html`<span class="pick-score bad">✕</span>` : null}
        ${it.status !== 'clean' ? html`<span class=${'tag-status ' + it.status}>${it.status === 'dirty' ? 'Dirty' : 'Washing'}</span>` : null}
        <span class="cap">${it.name || it.subcategory}</span>
      </button>`;
    })}</div>
    <p class="muted small">Numbers show how the whole fit would score with that piece. ✕ means it doesn't work with what you've picked (e.g. a collared shirt under a hoodie).</p>`
    : html`<p class="muted">Nothing here yet${hideDirty ? ' (or it\'s all in the laundry)' : ''}.</p>`}
  <//>`;
}
