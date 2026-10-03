import { html, useState, useMemo } from '../lib/deps.js';
import { useStore, setStatus, saveItem } from '../lib/store.js';
import { isLocal } from '../lib/db.js';
import { loadSampleCloset } from '../lib/sample.js';
import { Header, Icon, ItemThumb, Empty, Chips, navigate, toast, Segmented } from '../ui/components.js';
import { CATEGORIES, CATEGORY_LABELS, SEASONS } from '../styling/taxonomy.js';
import { colorName, hexToHsl, isNeutral } from '../styling/color.js';
import { STATUSES } from '../styling/laundry.js';

const COLOR_GROUPS = ['black', 'white', 'grey', 'navy', 'blue', 'beige', 'brown', 'green', 'olive', 'red', 'pink', 'purple', 'yellow', 'orange'];
const groupOf = (c) => {
  const n = (c.name || colorName(c.hex)).toLowerCase();
  return COLOR_GROUPS.find((g) => n.includes(g)) || (n.includes('cream') || n.includes('tan') || n.includes('camel') || n.includes('khaki') ? 'beige'
    : n.includes('charcoal') || n.includes('gray') ? 'grey' : n.includes('denim') || n.includes('indigo') ? 'blue' : colorName(c.hex));
};

export function ClosetView({ query }) {
  const { items } = useStore();
  const [cat, setCat] = useState(query.cat || 'all');
  const [q, setQ] = useState('');
  const [status, setStatusF] = useState(null);
  const [colors, setColors] = useState([]);
  const [season, setSeason] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [select, setSelect] = useState(null); // Set of ids in select mode

  const filtered = useMemo(() => items.filter((i) =>
    (cat === 'all' || i.category === cat)
    && (!status || i.status === status)
    && (!season || i.seasons?.includes(season))
    && (!colors.length || i.colors.some((c) => colors.includes(groupOf(c))))
    && (!q || [i.name, i.subcategory, i.brand, i.description, ...(i.style_tags || []), ...i.colors.map((c) => c.name)].join(' ').toLowerCase().includes(q.toLowerCase()))), [items, cat, q, status, colors, season]);

  const counts = useMemo(() => ({ dirty: items.filter((i) => i.status === 'dirty').length, in_wash: items.filter((i) => i.status === 'in_wash').length }), [items]);

  async function bulk(st) {
    const ids = [...select];
    setSelect(null);
    await setStatus(ids, st);
    toast(`${ids.length} item${ids.length > 1 ? 's' : ''} marked ${STATUSES[st].toLowerCase()}`);
  }

  if (!items.length) return html`<${Header} title="Closet" right=${html`<a class="icon-btn" href="#/settings" aria-label="Settings"><${Icon} name="settings" /></a>`} />
    <${Empty} title="Your closet is empty">Add photos of your clothes. The background is removed automatically and the AI tags colour, fabric, fit and layering.
      <div class="mt actions col"><button class="btn primary" onClick=${() => navigate('/closet/add')}><${Icon} name="camera" /> Add clothes</button>
        ${isLocal ? html`<button class="btn" onClick=${() => loadSampleCloset().then(() => toast('Sample closet loaded'))}>Try with a sample closet</button>` : null}</div>
    <//>`;

  return html`
    <${Header} title="Closet" sub=${`${items.length} items · ${items.length - counts.dirty - counts.in_wash} clean`} right=${html`
      <a class="btn small" href="#/create?from=/closet"><${Icon} name="edit" size=${16} /> Create a fit</a>
      <a class="icon-btn" href="#/stats" aria-label="Stats"><${Icon} name="chart" /></a>
      <a class="icon-btn" href="#/settings" aria-label="Settings"><${Icon} name="settings" /></a>`} />
    <div class="laundry-strip" onClick=${() => navigate('/laundry')} role="button" tabindex="0">
      <${Icon} name="wash" /> <b>Laundry</b>
      <span class="muted">${counts.dirty} dirty · ${counts.in_wash} in the wash</span>
      <span class="grow"></span><span class="link">Open</span>
    </div>
    <div class="toolbar">
      <div class="search"><${Icon} name="search" size=${18} /><input placeholder="Search colour, type, brand…" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search closet" /></div>
      <button class=${'btn small' + (showFilters ? ' on' : '')} onClick=${() => setShowFilters(!showFilters)}>Filters${status || colors.length || season ? ' •' : ''}</button>
      <button class="btn small" onClick=${() => setSelect(select ? null : new Set())}>${select ? 'Cancel' : 'Select'}</button>
    </div>
    <div class="scroll-x"><${Chips} value=${cat} onChange=${(v) => setCat(v || 'all')} options=${[['all', 'All'], ...CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]])]} /></div>
    ${showFilters ? html`<div class="filters card">
      <div class="label">Status</div><${Chips} small value=${status} onChange=${setStatusF} options=${Object.entries(STATUSES)} />
      <div class="label">Colour</div><${Chips} small multi value=${colors} onChange=${setColors} options=${COLOR_GROUPS} />
      <div class="label">Season</div><${Chips} small value=${season} onChange=${setSeason} options=${SEASONS} />
    </div>` : null}
    ${select ? html`<div class="bulkbar">
      <span>${select.size} selected</span>
      <button class="btn small" disabled=${!select.size} onClick=${() => bulk('clean')}>Clean</button>
      <button class="btn small" disabled=${!select.size} onClick=${() => bulk('dirty')}>Dirty</button>
      <button class="btn small" disabled=${!select.size} onClick=${() => bulk('in_wash')}>In wash</button>
    </div>` : null}
    <div class="grid">
      ${filtered.map((it) => html`<${ItemThumb} item=${it} selected=${select?.has(it.id)}
        onClick=${() => { if (select) { const s = new Set(select); s.has(it.id) ? s.delete(it.id) : s.add(it.id); setSelect(s); } else navigate('/item/' + it.id); }} />`)}
    </div>
    ${!filtered.length ? html`<p class="muted center">Nothing matches.</p>` : null}
    <button class="fab" aria-label="Add clothes" onClick=${() => navigate('/closet/add')}><${Icon} name="plus" size=${26} /></button>`;
}

export function LaundryView() {
  const { items } = useStore();
  const [tab, setTab] = useState('worn');
  const dirty = items.filter((i) => i.status === 'dirty');
  const washing = items.filter((i) => i.status === 'in_wash');
  // clean but worn since the last wash — the ones to check
  const worn = items.filter((i) => i.status === 'clean' && (i.wears_since_wash || 0) > 0).sort((a, b) => b.wears_since_wash - a.wears_since_wash || (b.last_worn > a.last_worn ? 1 : -1));
  const [sel, setSel] = useState(new Set());
  const list = tab === 'dirty' ? dirty : tab === 'in_wash' ? washing : worn;
  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const ids = sel.size ? [...sel] : list.map((i) => i.id);

  async function act(st, label) {
    if (!ids.length) return;
    await setStatus(ids, st);
    setSel(new Set());
    toast(label);
  }

  return html`
    <${Header} title="Laundry" backTo="/closet" sub="Outfits only use clean clothes" />
    <${Segmented} value=${tab} onChange=${(t) => { setTab(t); setSel(new Set()); }} options=${[['worn', `Worn (${worn.length})`], ['dirty', `Dirty (${dirty.length})`], ['in_wash', `In wash (${washing.length})`]]} />
    ${list.length ? html`
      <p class="muted small">${sel.size ? `${sel.size} selected` : 'Tap items to select some, or act on all of them.'}</p>
      <div class="grid">${list.map((it) => html`<${ItemThumb} item=${it} selected=${sel.has(it.id)} onClick=${() => toggle(it.id)}
        badge=${tab === 'worn' ? `worn ${it.wears_since_wash}×` : null} />`)}</div>
      <div class="actions sticky">
        ${tab === 'dirty' ? html`
          <button class="btn" onClick=${() => act('in_wash', 'Into the wash 🫧')}>Start wash</button>
          <button class="btn primary" onClick=${() => act('clean', 'Clean and back in rotation ✨')}>Mark clean</button>` : null}
        ${tab === 'in_wash' ? html`<button class="btn primary wide" onClick=${() => act('clean', 'Laundry done ✨')}>Laundry done → all clean</button>` : null}
        ${tab === 'worn' ? html`<button class="btn primary wide" onClick=${() => act('dirty', 'Moved to the dirty pile')}>Mark ${sel.size ? 'selected' : 'all'} dirty</button>` : null}
      </div>` : html`<${Empty} icon="wash" title=${tab === 'dirty' ? 'Nothing dirty' : tab === 'in_wash' ? 'Nothing in the wash' : 'Nothing worn since washing'}>
        ${tab === 'worn' ? 'Clothes you log as worn show up here so you can decide what needs a wash.' : ''}<//>`}
    <section class="card mt">
      <h3>How it works</h3>
      <p class="muted small">You decide when something is dirty — wearing it only counts the wear. Clothes you've worn since their last wash collect under <b>Worn</b>; mark the ones that need washing as dirty (or use <b>Select</b> in the closet, or the item page). Dirty and washing items are left out of every suggestion until you mark them clean.</p>
    </section>`;
}

// quick inline status toggle used on the item page
export function StatusPicker({ item }) {
  return html`<${Segmented} value=${item.status} onChange=${(s) => saveItem(item.id, s === 'clean' ? { status: 'clean', wears_since_wash: 0 } : { status: s }).then(() => toast(STATUSES[s]))}
    options=${Object.entries(STATUSES)} />`;
}

export { groupOf, isNeutral, hexToHsl };
