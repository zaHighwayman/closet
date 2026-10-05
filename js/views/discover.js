import { html, useState, useEffect, useRef, useMemo } from '../lib/deps.js';
import { useStore, settings, saveSettings, wishlist, inWishlist, toggleWishlist } from '../lib/store.js';
import { isLocal } from '../lib/db.js';
import { buildCatalog, discoverBatch, shopLink } from '../styling/catalog.js';
import { STORES } from '../styling/stores.js';
import { recolor } from '../lib/recolor.js';
import { prefs, searchNow, markSeen, startScout, scoutBusy } from '../lib/scout.js';
import { OCCASIONS, seasonFor } from '../styling/taxonomy.js';
import { baseContext } from '../ui/hooks.js';
import { Header, Icon, Chips, Board, Rating, Reasons, Sheet, Empty, Spinner, Segmented, Toggle, toast, money } from '../ui/components.js';
import { TasteButtons } from './style.js';

const MIX = ['casual', 'smart casual', 'date', 'casual', 'work', 'smart casual'];
// typical day for the season (outside), so jackets and coats can be part of ideas
const SEASON_TEMP = { winter: 0, autumn: 10, spring: 13, summer: 22 };
export const seasonWeather = (season) => ({ mode: 'weather', dayProfile: 'outside', forecast: { temp: SEASON_TEMP[season], feelsLike: SEASON_TEMP[season], code: 2 } });

/** Generic catalog pieces: swap the silhouette for the recoloured product photo. */
async function withPhoto(v) {
  if (v.real || !v.photo || v.photoReady) return v;
  try { v.image_url = await recolor(v.photo, v.colors[0].hex); v.aspect = undefined; } catch {}
  v.photoReady = true;
  return v;
}

function WishImg({ w }) {
  const [src, setSrc] = useState(w.image_url || null);
  useEffect(() => { if (!w.image_url && w.photo) recolor(w.photo, w.color.hex).then(setSrc).catch(() => {}); }, [w.id]);
  return src ? html`<img src=${src} alt="" />` : html`<span class="swatch big" style=${'background:' + w.color.hex}></span>`;
}

function WishButton({ piece, onChange }) {
  const [on, setOn] = useState(() => inWishlist(piece.id));
  return html`<button class=${'icon-btn' + (on ? ' liked' : '')} aria-pressed=${on} aria-label=${on ? 'Remove from wishlist' : 'Add to wishlist'}
    onClick=${async () => { const v = await toggleWishlist(piece); setOn(v); onChange?.(); toast(v ? 'Added to your wishlist' : 'Removed from wishlist'); }}>
    <${Icon} name="heart" fill=${on ? 'currentColor' : 'none'} /></button>`;
}

function MissingRow({ m, counts, onWish }) {
  return html`<div class="missing-row">
    <img src=${m.image_url} alt="" />
    <span class="grow">${m.real ? html`<span class="real-tag">${m.brand}</span> ${m.hot ? html`<span class="hot-tag">Great find</span>` : null}<br />` : null}
      <b>${m.name}</b>${m.real && m.price != null ? html` <span class="price">${money(m.price, m.currency || 'EUR')}</span>` : null}
      ${counts.get(m.id) > 1 ? html`<span class="muted small"> · in ${counts.get(m.id)} ideas</span>` : null}</span>
    <a class="btn small" href=${m.real ? m.url : shopLink(m.name)} target="_blank" rel="noopener">${m.real ? 'View' : 'Find it'}</a>
    <${WishButton} piece=${m} onChange=${onWish} />
  </div>`;
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
      <div class="missing">${missing.map((m) => html`<${MissingRow} m=${m} counts=${counts} onWish=${onWish} />`)}</div>
      <${Reasons} reasons=${outfit.reasons} warnings=${[]} max=${2} />
    </div>
  </article>`;
}

export function DiscoverView() {
  const st = useStore();
  const { items } = st;
  const p = prefs();
  const [occasion, setOccasion] = useState('mix');
  const [brands, setBrands] = useState(p.brands);
  const [words, setWords] = useState(p.keywords);
  const [shopFor, setShopFor] = useState(p.shopFor);
  const [realOnly, setRealOnly] = useState(true);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState(false);
  const [sheet, setSheet] = useState(null); // 'wish' | 'brands'
  const [wishCount, setWishCount] = useState(wishlist().length);
  const [hidden, setHidden] = useState(new Set());
  const run = useRef({ seed: 1, seen: new Set(), featured: new Map(), empty: 0 });
  const sentinel = useRef(null);

  useEffect(() => { markSeen().catch(() => {}); startScout().catch(() => {}); }, []);

  const season = seasonFor(new Date(), settings().location?.lat ?? 60);
  const generic = useMemo(() => buildCatalog(items, { season }), [items.length, season]);
  // real products the scout found, filtered by brand / words
  const real = (st.scoutFound || []).filter((r) => (!brands.length || brands.includes(r.store))
    && (!words.trim() || words.toLowerCase().split(/\s+/).every((w) => `${r.name} ${r.brand}`.toLowerCase().includes(w))));
  const useReal = realOnly && real.length >= 4;
  const catalogRef = useRef([]);
  catalogRef.current = useReal ? real : [...real, ...generic];
  const pool = [...items, ...real, ...generic];

  function loadMore() {
    if (loading || done) return;
    setLoading(true);
    setTimeout(async () => {
      const s = run.current;
      const occ = occasion === 'mix' ? MIX[s.seed % MIX.length] : occasion;
      const batch = discoverBatch(items, catalogRef.current, baseContext({ occasion: occ, season, weather: seasonWeather(season) }),
        { seed: s.seed++ * 104729, seen: s.seen, featured: s.featured, size: 6 });
      await Promise.all(batch.flatMap((b) => b.missing.map(withPhoto)));
      s.empty = batch.length ? 0 : s.empty + 1;
      if (s.empty >= 4) setDone(true);
      setFeed((f) => [...f, ...batch]);
      setLoading(false);
    }, 30);
  }
  const reset = () => { run.current = { seed: 1, seen: new Set(), featured: new Map(), empty: 0 }; setFeed([]); setDone(false); };
  useEffect(reset, [occasion, brands.join(), realOnly, useReal]);
  useEffect(() => { if (!feed.length && !done) loadMore(); }, [feed.length, done]);
  // new finds arrived after the feed ran dry: keep going
  useEffect(() => { if (done) { run.current.empty = 0; setDone(false); } }, [real.length]);
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '600px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  });

  async function savePrefs(patch) { await saveSettings({ scout: { ...prefs(), ...patch } }).catch(() => {}); }
  async function search() {
    await savePrefs({ keywords: words.trim(), brands, shopFor });
    if (!words.trim()) return reset();
    setSearching(true);
    try {
      const n = await searchNow(words.trim());
      toast(n ? `Found ${n} new piece${n > 1 ? 's' : ''}` : 'Nothing new found for that — try other words or brands');
    } catch (e) {
      toast(e.message === 'outdated-function' ? 'Update your Supabase function first (see the README)' : e.message, 'error');
    }
    setSearching(false);
    reset();
  }

  const counts = new Map();
  feed.forEach((d) => d.missing.forEach((m) => counts.set(m.id, (counts.get(m.id) || 0) + 1)));
  const shown = feed.filter((d) => !hidden.has(d.outfit.itemIds.join()));

  if (items.filter((i) => i.category !== 'accessory' && i.category !== 'bag').length < 3) {
    return html`<${Header} title="Discover" backTo="/style" /><${Empty} icon="style" title="Add a few clothes first">Discover builds ideas around what you already own.<//>`;
  }

  return html`
    <${Header} title="Discover" backTo="/style" sub="Real clothes that would complete outfits with yours"
      right=${html`<button class="btn small" onClick=${() => setSheet('wish')}><${Icon} name="heart" size=${16} /> Wishlist${wishCount ? ` (${wishCount})` : ''}</button>`} />

    <div class="scout-bar">
      ${isLocal ? html`<span>Real-clothes search needs accounts (Supabase). Showing example pieces.</span>` : html`
        ${scoutBusy() || searching ? html`<span class="pulse"></span>` : html`<${Icon} name="search" size=${14} />`}
        <span class="grow">${st.scoutStatus || 'Looking for real clothes in the background while the app is open…'}</span>
        <span class="muted small">${(st.scoutFound || []).length} found</span>`}
    </div>

    <form class="row gap" onSubmit=${(e) => { e.preventDefault(); search(); }}>
      <div class="search"><${Icon} name="search" size=${18} /><input placeholder="Search words: linen, vintage, cashmere…" value=${words} onInput=${(e) => setWords(e.target.value)} aria-label="Search words" /></div>
      <button class="btn small primary" disabled=${searching}>${searching ? '…' : 'Search'}</button>
    </form>
    <div class="row gap wrap">
      <button class=${'btn small' + (brands.length ? ' on' : '')} onClick=${() => setSheet('brands')}>Brands${brands.length ? ` (${brands.length})` : ''}</button>
      <${Segmented} value=${shopFor} onChange=${(v) => { setShopFor(v); savePrefs({ shopFor: v }); }} options=${[['auto', 'Auto'], ['men', 'Men'], ['women', 'Women'], ['all', 'All']]} />
      ${real.length ? html`<${Toggle} checked=${realOnly} onChange=${setRealOnly} label="Real clothes only" />` : null}
    </div>
    <div class="scroll-x"><${Chips} value=${occasion} onChange=${(o) => o && setOccasion(o)}
      options=${[['mix', 'Mix'], ...Object.entries(OCCASIONS).filter(([k]) => !['lounge', 'sport', 'formal'].includes(k)).map(([k, v]) => [k, v.label])]} /></div>
    ${!useReal && !isLocal ? html`<p class="muted small">${real.length ? `Only ${real.length} real finds match so far — mixing in example pieces until the scout finds more.` : 'The scout is just getting started — example pieces are shown until real ones are found.'}</p>` : null}

    <div class="outfit-list">
      ${shown.map((d) => html`<${DiscoverCard} key=${d.outfit.itemIds.join()} idea=${d} items=${pool} counts=${counts}
        onWish=${() => setWishCount(wishlist().length)} onDislike=${() => setHidden(new Set([...hidden, d.outfit.itemIds.join()]))} />`)}
    </div>
    <div ref=${sentinel} class="sentinel">
      ${loading ? html`<${Spinner} />` : done ? html`<p class="muted center">That's every idea for now — the scout keeps looking while the app is open.</p>`
        : html`<button class="btn" onClick=${loadMore}>Load more</button>`}
    </div>

    <${Sheet} open=${sheet === 'brands'} onClose=${() => { setSheet(null); savePrefs({ brands }); }} title="Brands to search">
      <p class="muted small">Pick brands to only see (and search) their clothes. None picked = the scout chooses stores that fit your style.</p>
      <div class="brand-list">${STORES.map((s) => html`<label>
        <input type="checkbox" checked=${brands.includes(s.domain)} onChange=${() => setBrands(brands.includes(s.domain) ? brands.filter((b) => b !== s.domain) : [...brands, s.domain])} />
        <span>${s.brand}</span></label>`)}</div>
      ${brands.length ? html`<button class="btn small" onClick=${() => setBrands([])}>Clear brands</button>` : null}
    <//>
    <${WishlistSheet} open=${sheet === 'wish'} onClose=${() => { setSheet(null); setWishCount(wishlist().length); }} counts=${counts} />`;
}

function WishlistSheet({ open, onClose, counts }) {
  const [, force] = useState(0);
  const list = wishlist().slice().sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
  return html`<${Sheet} open=${open} onClose=${onClose} title="Wishlist">
    ${list.length ? html`<p class="muted small">Pieces you saved from Discover, the most useful first.</p>
      <div class="list">${list.map((w) => html`<div class="list-row">
        <${WishImg} w=${w} />
        <span class="grow">${w.brand ? html`<span class="real-tag">${w.brand}</span><br />` : null}<b>${w.name}</b>
          ${w.price != null ? html` <span class="price">${money(w.price, w.currency || 'EUR')}</span>` : null}
          ${counts.get(w.id) > 1 ? html`<div class="muted small">in ${counts.get(w.id)} ideas you've seen</div>` : null}</span>
        <a class="btn small" href=${w.url || shopLink(w.name)} target="_blank" rel="noopener">${w.url ? 'View' : 'Find it'}</a>
        <button class="icon-btn" aria-label="Remove" onClick=${async () => { await toggleWishlist({ ...w, colors: [w.color] }); force((n) => n + 1); }}><${Icon} name="trash" /></button>
      </div>`)}</div>
      <p class="muted small">Bought something? <a href="#/closet/add" onClick=${onClose}>Add its photo</a> and it'll show up in your outfits.</p>`
    : html`<p class="muted">Tap ♡ next to a missing piece to save it here.</p>`}
  <//>`;
}
