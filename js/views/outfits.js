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
    <${Header} title="Saved outfits" backTo="/style" right=${html`<button class="btn small primary" onClick=${() => navigate('/create?from=/outfits')}><${Icon} name="plus" size=${16} /> Create a fit</button>`} />
    <div class="scroll-x row gap">
      <${Chips} value=${col} onChange=${(c) => setCol(c || 'all')} options=${[['all', 'All'], ...(collections || []).map((c) => [c.id, c.name])]} />
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
      right=${isMine ? html`<button class="icon-btn" aria-label="Edit" onClick=${() => navigate('/create/' + o.id + '?from=/outfits')}><${Icon} name="edit" /></button>` : null} />
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
          <option value="">None</option>${(st.collections || []).map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select></label>
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
