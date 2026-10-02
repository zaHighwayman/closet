import { html, useState, useEffect, useRef, useMemo } from '../lib/deps.js';
import { useStore, saveOutfit, deleteOutfit, logWear, planOutfit, addCollection, deleteCollection, me, hydrateOutfits, todayStr, like, unlike, report } from '../lib/store.js';
import * as db from '../lib/db.js';
import { rateItems } from '../styling/engine.js';
import { OCCASIONS, CATEGORIES, CATEGORY_LABELS } from '../styling/taxonomy.js';
import { baseContext } from '../ui/hooks.js';
import { Header, Icon, Chips, Board, Rating, Reasons, Sheet, ItemThumb, Empty, Spinner, Toggle, navigate, toast, confirmAsk, autoLayout, useAsync, useAspects, Piece } from '../ui/components.js';
import { HARMONY, TasteButtons } from './style.js';

export function OutfitsView() {
  const { outfits, items, collections } = useStore();
  const [col, setCol] = useState('all');
  const [newCol, setNewCol] = useState(false);
  const [name, setName] = useState('');
  const byId = new Map(items.map((i) => [i.id, i]));
  const list = outfits.filter((o) => col === 'all' || o.collection_id === col);

  return html`
    <${Header} title="Saved outfits" backTo="/style" right=${html`<button class="btn small" onClick=${() => navigate('/builder')}><${Icon} name="plus" size=${16} /> Create</button>`} />
    <div class="scroll-x row gap">
      <${Chips} value=${col} onChange=${(c) => setCol(c || 'all')} options=${[['all', 'All'], ...collections.map((c) => [c.id, c.name])]} />
      <button class="chip" onClick=${() => setNewCol(true)}>+ Collection</button>
    </div>
    ${col !== 'all' ? html`<button class="link small" onClick=${async () => { if (confirmAsk('Delete this collection? Outfits stay saved.')) { await deleteCollection(col); setCol('all'); } }}>Delete collection</button>` : null}
    ${list.length ? html`<div class="grid outfits">${list.map((o) => {
      const its = o.item_ids.map((id) => byId.get(id)).filter(Boolean);
      return html`<button class="outfit-tile" onClick=${() => navigate('/outfit/' + o.id)}>
        <${Board} items=${its} layout=${o.layout} />
        <div class="cap">${o.name || (OCCASIONS[o.occasion]?.label ?? 'Outfit')} ${o.visibility === 'public' ? html`<${Icon} name="globe" size=${12} />` : null}
          ${its.some((i) => i.status !== 'clean') ? html`<span class="tag-status dirty">needs wash</span>` : null}</div>
      </button>`;
    })}</div>` : html`<${Empty} icon="style" title="No saved outfits yet">Save ideas from the Style tab, or build one by hand.<//>`}
    <${Sheet} open=${newCol} onClose=${() => setNewCol(false)} title="New collection">
      <label>Name<input value=${name} placeholder="e.g. Work week, Date night" onInput=${(e) => setName(e.target.value)} /></label>
      <button class="btn primary wide mt" disabled=${!name.trim()} onClick=${async () => { await addCollection(name.trim()); setName(''); setNewCol(false); }}>Create</button>
    <//>`;
}

export function OutfitView({ id }) {
  const st = useStore();
  const mine = st.outfits.find((o) => o.id === id);
  const remote = useAsync(async () => (mine ? null : (await hydrateOutfits([await db.get('outfits', id)].filter(Boolean)))[0] || null), [id, !!mine]);
  const [plan, setPlan] = useState(false);
  const [date, setDate] = useState(todayStr(new Date(Date.now() + 864e5)));
  const [liked, setLiked] = useState(null);

  if (!mine && remote.loading) return html`<${Header} title="Outfit" backTo="" /><${Spinner} />`;
  const o = mine || remote.data;
  if (!o) return html`<${Header} title="Outfit" backTo="" /><${Empty} title="Outfit not found">It may be private or deleted.<//>`;
  const byId = new Map((mine ? st.items : o.items).map((i) => [i.id, i]));
  const its = o.item_ids.map((x) => byId.get(x)).filter(Boolean);
  const rating = its.length ? rateItems(its, baseContext({ occasion: o.occasion || 'casual' })) : null;
  const isMine = o.user_id === me();
  const isLiked = liked ?? o.liked;

  async function update(p) { await saveOutfit({ ...o, ...p }); toast('Saved'); }

  return html`
    <${Header} title=${o.name || 'Outfit'} backTo="" sub=${o.author ? html`by <a href=${'#/u/' + o.author.username}>@${o.author.username}</a>` : (OCCASIONS[o.occasion]?.label || '')}
      right=${isMine ? html`<button class="icon-btn" aria-label="Edit" onClick=${() => navigate('/builder/' + o.id + '?from=/outfits')}><${Icon} name="edit" /></button>` : null} />
    <${Board} items=${its} layout=${o.layout} className="big" />
    ${rating && !rating.invalid ? html`<div class="card"><div class="row"><${Rating} value=${rating.rating} /><span class="muted small grow">${HARMONY[rating.harmony]}</span>${isMine ? html`<${TasteButtons} ids=${o.item_ids} />` : null}</div><${Reasons} reasons=${rating.reasons} warnings=${rating.warnings} max=${5} /></div>` : null}
    ${rating?.invalid ? html`<div class="card"><${Reasons} warnings=${rating.warnings} /></div>` : null}
    <div class="strip">${its.map((it) => html`<${ItemThumb} small item=${it} onClick=${() => isMine && navigate('/item/' + it.id)} />`)}</div>
    ${isMine ? html`
      <div class="actions">
        <button class="btn primary" disabled=${its.some((i) => i.status !== 'clean')} onClick=${async () => { await logWear(o.item_ids, { outfitId: o.id }); toast('Logged as worn today'); }}>Wear today</button>
        <button class="btn" onClick=${() => setPlan(true)}>Plan</button>
      </div>
      ${its.some((i) => i.status !== 'clean') ? html`<p class="muted small center">Some pieces are in the laundry.</p>` : null}
      <div class="card form">
        <label>Name<input value=${o.name || ''} onChange=${(e) => update({ name: e.target.value })} /></label>
        <label>Collection<select value=${o.collection_id || ''} onChange=${(e) => update({ collection_id: e.target.value || null })}>
          <option value="">None</option>${st.collections.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select></label>
        <${Toggle} checked=${o.visibility === 'public'} onChange=${(c) => update({ visibility: c ? 'public' : 'private' })} label="Share publicly (shows in Explore)" />
      </div>
      <button class="btn danger wide" onClick=${async () => { if (confirmAsk('Delete this outfit?')) { await deleteOutfit(o.id); navigate('/outfits'); } }}>Delete outfit</button>`
    : html`<div class="actions">
        <button class=${'btn' + (isLiked ? ' on' : '')} onClick=${async () => { isLiked ? await unlike(o.id) : await like(o.id); setLiked(!isLiked); }}><${Icon} name="heart" fill=${isLiked ? 'currentColor' : 'none'} /> ${isLiked ? 'Liked' : 'Like'}</button>
        <button class="btn" onClick=${async () => { const r = prompt('What\'s wrong with this outfit?'); if (r) { await report('outfit', o.id, r); toast('Reported — thanks'); } }}><${Icon} name="flag" /> Report</button>
      </div>`}
    <${Sheet} open=${plan} onClose=${() => setPlan(false)} title="Plan this outfit">
      <label>Date<input type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
      <button class="btn primary wide mt" onClick=${async () => { await planOutfit(date, o.item_ids, o.id); setPlan(false); toast('Added to your calendar'); }}>Add to calendar</button>
    <//>`;
}

// ------------------------------------------------------------------ builder (drag / resize / layer)
export function BuilderView({ id, query }) {
  const st = useStore();
  const existing = id ? st.outfits.find((o) => o.id === id) : null;
  const initIds = existing?.item_ids || (query.items ? query.items.split(',') : []);
  const initSlots = query.slots ? JSON.parse(query.slots) : null;
  const byId = new Map(st.items.map((i) => [i.id, i]));
  const [ids, setIds] = useState(initIds.filter((x) => byId.has(x)));
  const custom = existing?.layout?.length && existing.layout.every((l) => l.v === 2);
  const [layout, setLayout] = useState(() => custom ? existing.layout : autoLayout(initIds.map((x) => byId.get(x)).filter(Boolean), initSlots));
  const touched = useRef(!!custom); // once you arrange things by hand, auto-layout leaves them alone
  const [sel, setSel] = useState(null);
  const [cat, setCat] = useState('top');
  const [occasion, setOccasion] = useState(existing?.occasion || query.occasion || 'casual');
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState(false);
  const [name, setName] = useState(existing?.name || '');
  const [vis, setVis] = useState(existing?.visibility || 'private');
  const [colId, setColId] = useState(existing?.collection_id || '');
  const boardRef = useRef(null);
  const drag = useRef(null);

  const its = ids.map((x) => byId.get(x)).filter(Boolean);
  const aspectsVersion = useAspects(its);
  useEffect(() => { if (!touched.current && its.length) setLayout(autoLayout(its, initSlots && ids.join() === initIds.join() ? initSlots : null)); }, [aspectsVersion]);
  const rating = useMemo(() => (its.length >= 2 ? rateItems(its, baseContext({ occasion })) : null), [ids.join(), occasion]);

  function add(it) {
    if (ids.includes(it.id)) { remove(it.id); return; }
    const next = [...ids, it.id];
    setIds(next);
    const auto = autoLayout(next.map((x) => byId.get(x)));
    if (!touched.current) setLayout(auto); // still auto-arranged: re-flow everything
    else setLayout([...layout, { ...auto.find((l) => l.id === it.id), z: Math.max(0, ...layout.map((l) => l.z)) + 1 }]);
    setSel(it.id);
  }
  function remove(itemId) {
    const next = ids.filter((x) => x !== itemId);
    setIds(next);
    setLayout(touched.current ? layout.filter((l) => l.id !== itemId) : autoLayout(next.map((x) => byId.get(x))));
    setSel(null);
  }
  const upd = (itemId, p) => setLayout((L) => L.map((l) => (l.id === itemId ? { ...l, ...p } : l)));

  function onDown(e, l) {
    e.preventDefault();
    touched.current = true;
    setSel(l.id);
    const r = boardRef.current.getBoundingClientRect();
    drag.current = { id: l.id, sx: e.clientX, sy: e.clientY, x: l.x, y: l.y, W: r.width, H: r.height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    upd(d.id, { x: d.x + ((e.clientX - d.sx) / d.W) * 100, y: d.y + ((e.clientY - d.sy) / d.H) * 100 });
  }
  const onUp = () => { drag.current = null; };
  const selL = layout.find((l) => l.id === sel);

  async function save() {
    setSaving(true);
    try {
      const saved = await saveOutfit({ ...(existing || {}), id: existing?.id, name, item_ids: ids, layout, occasion, visibility: vis, collection_id: colId || null,
        rating: rating?.rating ?? null, reasons: rating?.reasons?.slice(0, 5) || [] });
      toast(html`Outfit saved · <a href=${'#/outfit/' + saved.id}>open</a>`);
      navigate(query.from || '/outfits', { replace: true });
    } catch (e) { toast(e, 'error'); }
    setSaving(false);
  }

  return html`
    <${Header} title=${existing ? 'Edit outfit' : 'Create outfit'} backTo="" right=${html`<button class="btn small primary" disabled=${!ids.length} onClick=${() => setMeta(true)}>Save</button>`} />
    <div class="board edit" ref=${boardRef} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp} onClick=${(e) => e.target === boardRef.current && setSel(null)}>
      ${layout.filter((l) => byId.has(l.id)).sort((a, b) => a.z - b.z).map((l) => html`
        <${Piece} key=${l.id} item=${byId.get(l.id)} l=${l} cls=${sel === l.id ? 'sel' : ''} onPointerDown=${(e) => onDown(e, l)} />`)}
      ${!ids.length ? html`<div class="board-hint">Tap clothes below to add them, then drag to arrange</div>` : null}
    </div>
    ${selL ? html`<div class="row gap edit-tools">
      <label class="range grow">Size<input type="range" min="5" max="90" value=${selL.w} onInput=${(e) => { touched.current = true; const w = Number(e.target.value); upd(sel, { w, h: selL.h * (w / selL.w) }); }} /></label>
      <button class="icon-btn" aria-label="Bring forward" onClick=${() => upd(sel, { z: Math.max(...layout.map((l) => l.z)) + 1 })}><${Icon} name="up" /></button>
      <button class="icon-btn" aria-label="Send back" onClick=${() => upd(sel, { z: Math.min(...layout.map((l) => l.z)) - 1 })}><${Icon} name="down" /></button>
      <button class="icon-btn" aria-label="Remove" onClick=${() => remove(sel)}><${Icon} name="trash" /></button>
    </div>` : html`<div class="row gap"><button class="btn small" disabled=${!ids.length} onClick=${() => { touched.current = false; setLayout(autoLayout(its)); }}>Auto-arrange</button>
      <span class="grow"></span><select class="small" value=${occasion} onChange=${(e) => setOccasion(e.target.value)} aria-label="Occasion">${Object.entries(OCCASIONS).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select></div>`}
    ${rating ? html`<div class="card rating-live">
      ${rating.invalid ? html`<${Reasons} warnings=${rating.warnings} />` : html`<div class="row"><${Rating} value=${rating.rating} /><span class="muted small">${HARMONY[rating.harmony]}</span></div><${Reasons} reasons=${rating.reasons} warnings=${rating.warnings} max=${3} />`}
    </div>` : null}
    <div class="scroll-x"><${Chips} small value=${cat} onChange=${(c) => c && setCat(c)} options=${CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]])} /></div>
    <div class="strip tray">${st.items.filter((i) => i.category === cat).map((it) => html`<${ItemThumb} small item=${it} selected=${ids.includes(it.id)} onClick=${() => add(it)} />`)}</div>
    <${Sheet} open=${meta} onClose=${() => setMeta(false)} title="Save outfit">
      <div class="form">
        <label>Name<input value=${name} placeholder="optional" onInput=${(e) => setName(e.target.value)} /></label>
        <label>Collection<select value=${colId} onChange=${(e) => setColId(e.target.value)}><option value="">None</option>${st.collections.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select></label>
        <${Toggle} checked=${vis === 'public'} onChange=${(c) => setVis(c ? 'public' : 'private')} label="Share publicly" />
        <button class="btn primary wide" disabled=${saving} onClick=${save}>${saving ? 'Saving…' : 'Save'}</button>
      </div>
    <//>`;
}
