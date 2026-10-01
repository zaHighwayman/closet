import { html, useState, useEffect, useRef, useMemo } from '../lib/deps.js';
import { useStore, settings, wishlist, inWishlist, toggleWishlist } from '../lib/store.js';
import { buildCatalog, discoverBatch, shopLink } from '../styling/catalog.js';
import { OCCASIONS, seasonFor } from '../styling/taxonomy.js';
import { baseContext } from '../ui/hooks.js';
import { Header, Icon, Chips, Board, Rating, Reasons, Sheet, Empty, Spinner, navigate, toast } from '../ui/components.js';
import { TasteButtons } from './style.js';

const MIX = ['casual', 'smart casual', 'date', 'casual', 'work', 'smart casual'];

function WishButton({ piece, onChange }) {
  const [on, setOn] = useState(() => inWishlist(piece.id));
  return html`<button class=${'icon-btn' + (on ? ' liked' : '')} aria-pressed=${on} aria-label=${on ? 'Remove from wishlist' : 'Add to wishlist'}
    onClick=${async () => { const v = await toggleWishlist(piece); setOn(v); onChange?.(); toast(v ? 'Added to your wishlist' : 'Removed from wishlist'); }}>
    <${Icon} name="heart" fill=${on ? 'currentColor' : 'none'} /></button>`;
}

function DiscoverCard({ idea, items, counts, onDislike, onWish }) {
  const { outfit, have, total, missing } = idea;
  const byId = new Map(items.map((i) => [i.id, i]));
  const its = outfit.itemIds.map((id) => byId.get(id)).filter(Boolean);
  return html`<article class="outfit-card discover-card">
    <${Board} items=${its} slots=${outfit.slots} />
    <div class="outfit-body">
      <div class="row">
        <span class="have"><b>You have ${have}/${total}</b></span>
        <span class="progress"><i style=${`width:${(have / total) * 100}%`}></i></span>
        <${Rating} value=${outfit.rating} />
        <${TasteButtons} ids=${outfit.itemIds} onDislike=${onDislike} />
      </div>
      <div class="missing">
        ${missing.map((m) => html`<div class="missing-row">
          <img src=${m.image_url} alt="" />
          <span class="grow"><b>${m.name}</b><span class="muted small">${counts.get(m.id) > 1 ? ` · in ${counts.get(m.id)} ideas so far` : ''}</span></span>
          <a class="btn small" href=${shopLink(m.name)} target="_blank" rel="noopener">Find it</a>
          <${WishButton} piece=${m} onChange=${onWish} />
        </div>`)}
      </div>
      <${Reasons} reasons=${outfit.reasons} warnings=${[]} max=${2} />
    </div>
  </article>`;
}

export function DiscoverView() {
  const { items } = useStore();
  const [occasion, setOccasion] = useState('mix');
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showWish, setShowWish] = useState(false);
  const [wishCount, setWishCount] = useState(wishlist().length);
  const [hidden, setHidden] = useState(new Set());
  const st = useRef({ seed: 1, seen: new Set(), featured: new Map(), empty: 0 });
  const sentinel = useRef(null);

  const season = seasonFor(new Date(), settings().location?.lat ?? 60);
  const catalog = useMemo(() => buildCatalog(items, { season }), [items.length, season]);
  const pool = useMemo(() => [...items, ...catalog], [items, catalog]);

  function loadMore() {
    if (loading || done) return;
    setLoading(true);
    setTimeout(() => { // let the spinner paint before crunching
      const s = st.current;
      const occ = occasion === 'mix' ? MIX[s.seed % MIX.length] : occasion;
      const batch = discoverBatch(items, catalog, baseContext({ occasion: occ, season, weather: { mode: 'indoor' } }),
        { seed: s.seed++ * 104729, seen: s.seen, featured: s.featured, size: 6 });
      s.empty = batch.length ? 0 : s.empty + 1;
      if (s.empty >= 4) setDone(true);
      setFeed((f) => [...f, ...batch.map((b) => ({ ...b, occasion: occ }))]);
      setLoading(false);
    }, 30);
  }

  // restart when the occasion or closet changes
  useEffect(() => { st.current = { seed: 1, seen: new Set(), featured: new Map(), empty: 0 }; setFeed([]); setDone(false); }, [occasion, catalog]);
  useEffect(() => { if (!feed.length && !done) loadMore(); }, [feed.length, done]);

  // infinite scroll: load the next batch as the bottom comes into view
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '600px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  });

  const counts = new Map();
  feed.forEach((d) => d.missing.forEach((m) => counts.set(m.id, (counts.get(m.id) || 0) + 1)));
  const shown = feed.filter((d) => !hidden.has(d.outfit.itemIds.join()));

  if (items.filter((i) => i.category !== 'accessory' && i.category !== 'bag').length < 3) {
    return html`<${Header} title="Discover" backTo="/style" /><${Empty} icon="style" title="Add a few clothes first">Discover builds ideas around what you already own.<//>`;
  }

  return html`
    <${Header} title="Discover" backTo="/style" sub="Outfit ideas with a piece or two you don't own yet"
      right=${html`<button class="btn small" onClick=${() => setShowWish(true)}><${Icon} name="heart" size=${16} /> Wishlist${wishCount ? ` (${wishCount})` : ''}</button>`} />
    <div class="scroll-x"><${Chips} value=${occasion} onChange=${(o) => o && setOccasion(o)}
      options=${[['mix', 'Mix'], ...Object.entries(OCCASIONS).filter(([k]) => !['lounge', 'sport', 'formal'].includes(k)).map(([k, v]) => [k, v.label])]} /></div>
    <div class="outfit-list">
      ${shown.map((d) => html`<${DiscoverCard} key=${d.outfit.itemIds.join()} idea=${d} items=${pool} counts=${counts}
        onWish=${() => setWishCount(wishlist().length)} onDislike=${() => setHidden(new Set([...hidden, d.outfit.itemIds.join()]))} />`)}
    </div>
    <div ref=${sentinel} class="sentinel">
      ${loading ? html`<${Spinner} />` : done ? html`<p class="muted center">That's every idea for now. Add more clothes or try another occasion.</p>`
        : html`<button class="btn" onClick=${loadMore}>Load more</button>`}
    </div>
    <${WishlistSheet} open=${showWish} onClose=${() => { setShowWish(false); setWishCount(wishlist().length); }} counts=${counts} />`;
}

function WishlistSheet({ open, onClose, counts }) {
  const [, force] = useState(0);
  const list = wishlist().slice().sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
  return html`<${Sheet} open=${open} onClose=${onClose} title="Wishlist">
    ${list.length ? html`<p class="muted small">Pieces you saved from Discover, the most useful first.</p>
      <div class="list">${list.map((w) => html`<div class="list-row">
        <img src=${w.image_url} alt="" />
        <span class="grow"><b>${w.name}</b>${counts.get(w.id) > 1 ? html`<div class="muted small">in ${counts.get(w.id)} ideas you've seen</div>` : null}</span>
        <a class="btn small" href=${shopLink(w.name)} target="_blank" rel="noopener">Find it</a>
        <button class="icon-btn" aria-label="Remove" onClick=${async () => { await toggleWishlist({ ...w, colors: [w.color] }); force((n) => n + 1); }}><${Icon} name="trash" /></button>
      </div>`)}</div>
      <p class="muted small">Bought something? <a href="#/closet/add" onClick=${onClose}>Add its photo</a> and it'll show up in your outfits.</p>`
    : html`<p class="muted">Tap ♡ next to a missing piece to save it here.</p>`}
  <//>`;
}
