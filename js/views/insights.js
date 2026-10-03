import { html, useState, useMemo } from '../lib/deps.js';
import { useStore, settings, saveOutfit, logWear } from '../lib/store.js';
import { gapAnalysis, matchLook } from '../styling/engine.js';
import { CATEGORIES, CATEGORY_LABELS } from '../styling/taxonomy.js';
import { describe } from '../styling/layering.js';
import { describeLook, aiAvailable } from '../lib/ai.js';
import { toAiDataUrl } from '../lib/images.js';
import { baseContext } from '../ui/hooks.js';
import { Header, Icon, Board, ItemThumb, Empty, Rating, Reasons, money, navigate, toast, autoLayout } from '../ui/components.js';
import { groupOf } from './closet.js';

export function StatsView() {
  const { items } = useStore();
  const cur = settings().currency;
  const [gaps, setGaps] = useState(null);
  const s = useMemo(() => {
    const priced = items.filter((i) => i.price != null);
    const value = priced.reduce((a, i) => a + Number(i.price), 0);
    const worn = items.filter((i) => i.wear_count > 0);
    const totalWears = items.reduce((a, i) => a + (i.wear_count || 0), 0);
    const cpwItems = priced.filter((i) => i.wear_count > 0).map((i) => ({ i, cpw: i.price / i.wear_count })).sort((a, b) => a.cpw - b.cpw);
    const cutoff = Date.now() - 90 * 864e5;
    const unworn = items.filter((i) => !i.last_worn || new Date(i.last_worn).getTime() < cutoff);
    const byCat = CATEGORIES.map((c) => [c, items.filter((i) => i.category === c).length]).filter(([, n]) => n);
    const colors = {};
    items.forEach((i) => i.colors.forEach((c) => { const g = groupOf(c); colors[g] = colors[g] || { n: 0, hex: c.hex }; colors[g].n += c.share || 1; }));
    const colorList = Object.entries(colors).sort((a, b) => b[1].n - a[1].n);
    return { value, priced: priced.length, worn, totalWears, cpwItems, unworn, byCat, colorList, mostWorn: [...items].sort((a, b) => (b.wear_count || 0) - (a.wear_count || 0)).slice(0, 6),
      laundry: { dirty: items.filter((i) => i.status === 'dirty').length, wash: items.filter((i) => i.status === 'in_wash').length } };
  }, [items]);

  if (!items.length) return html`<${Header} title="Stats" backTo="/closet" /><${Empty} icon="chart" title="No data yet">Add clothes and log what you wear.<//>`;
  const maxCat = Math.max(...s.byCat.map(([, n]) => n));
  const colorTotal = s.colorList.reduce((a, [, c]) => a + c.n, 0);

  return html`
    <${Header} title="Closet stats" backTo="/closet" />
    <div class="stats-row big">
      <div><b>${items.length}</b><span>items</span></div>
      <div><b>${s.priced ? money(s.value, cur) : '–'}</b><span>closet value</span></div>
      <div><b>${s.totalWears}</b><span>wears logged</span></div>
      <div><b>${Math.round((s.worn.length / items.length) * 100)}%</b><span>worn at least once</span></div>
    </div>
    <section class="card"><h3>Colour palette</h3>
      <div class="palette-bar">${s.colorList.map(([g, c]) => html`<span title=${g} style=${`flex:${c.n};background:${c.hex}`}></span>`)}</div>
      <div class="muted small">${s.colorList.slice(0, 6).map(([g, c]) => `${g} ${Math.round((c.n / colorTotal) * 100)}%`).join(' · ')}</div>
    </section>
    <section class="card"><h3>By category</h3>
      ${s.byCat.map(([c, n]) => html`<div class="bar-row"><span>${CATEGORY_LABELS[c]}</span><div class="bar"><i style=${`width:${(n / maxCat) * 100}%`}></i></div><b>${n}</b></div>`)}
    </section>
    ${s.cpwItems.length ? html`<section class="card"><h3>Best cost per wear</h3>
      ${s.cpwItems.slice(0, 5).map(({ i, cpw }) => html`<a class="list-row" href=${'#/item/' + i.id}><img src=${i.image_url} alt="" /><span class="grow">${i.name || describe(i)}</span><b>${money(cpw, cur)}</b></a>`)}
      ${s.cpwItems.length > 5 ? html`<h4 class="mt">Highest cost per wear</h4>${s.cpwItems.slice(-3).reverse().map(({ i, cpw }) => html`<a class="list-row" href=${'#/item/' + i.id}><img src=${i.image_url} alt="" /><span class="grow">${i.name || describe(i)}</span><b>${money(cpw, cur)}</b></a>`)}` : null}
    </section>` : null}
    <section class="card"><h3>Most worn</h3><div class="strip">${s.mostWorn.filter((i) => i.wear_count).map((i) => html`<${ItemThumb} small item=${i} badge=${i.wear_count + '×'} onClick=${() => navigate('/item/' + i.id)} />`)}</div>
      ${!s.totalWears ? html`<p class="muted small">Log outfits in Plan to see this.</p>` : null}</section>
    <section class="card"><h3>Not worn in 90 days <span class="muted">(${s.unworn.length})</span></h3>
      <p class="muted small">Tap one to style it, or list it in the marketplace.</p>
      <div class="strip">${s.unworn.slice(0, 20).map((i) => html`<${ItemThumb} small item=${i} onClick=${() => navigate('/item/' + i.id)} />`)}</div></section>
    <section class="card"><h3>What to buy next</h3>
      <p class="muted small">Tests classic staples against your closet and counts how many new high-scoring outfits each one would unlock.</p>
      ${gaps ? html`<div class="list">${gaps.map((g) => html`<div class="list-row"><span class="swatch big" style=${'background:' + g.staple.colors[0].hex}></span>
        <span class="grow"><b>${g.staple.name}</b><div class="muted small">${g.staple.style_tags.join(', ')}</div></span><b>+${g.unlocked} outfits</b></div>`)}
        ${!gaps.length ? html`<p class="muted">Your closet covers the classic staples — nice.</p>` : null}</div>`
      : html`<button class="btn" onClick=${() => { setGaps([]); setTimeout(() => setGaps(gapAnalysis(items, baseContext({ weather: { mode: 'indoor' } }))), 30); }}>Analyse my closet</button>`}
    </section>
    <section class="card"><h3>Laundry</h3><p>${s.laundry.dirty} dirty · ${s.laundry.wash} in the wash · ${items.length - s.laundry.dirty - s.laundry.wash} ready to wear</p></section>`;
}

export function InspoView() {
  const { items } = useStore();
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);

  async function onFile(f) {
    if (!f) return;
    setImg(URL.createObjectURL(f)); setRes(null); setBusy(true);
    try {
      const look = await describeLook(await toAiDataUrl(f, 900));
      const m = matchLook(items, look.pieces, baseContext({ occasion: look.occasion || 'casual' }));
      setRes({ look, ...m });
    } catch (e) { toast(e, 'error'); }
    setBusy(false);
  }

  if (!aiAvailable()) return html`<${Header} title="Recreate a look" backTo="/style" /><${Empty} icon="image" title="Needs AI">Add a Groq key in <a href="#/settings">Settings</a> (demo mode) or set up accounts.<//>`;
  const matched = res?.matches.filter((m) => m.item).map((m) => m.item) || [];

  return html`
    <${Header} title="Recreate a look" backTo="/style" />
    <label class="upload card">
      <input type="file" accept="image/*" onChange=${(e) => onFile(e.target.files[0])} />
      ${img ? html`<img class="inspo-img" src=${img} alt="Inspiration" />` : html`<${Icon} name="image" size=${28} /><b>Upload an inspiration photo</b><span class="muted small">A screenshot from Instagram, Pinterest, a street-style shot…</span>`}
    </label>
    ${busy ? html`<div class="center muted"><span class="spinner tiny"></span> Breaking down the look…</div>` : null}
    ${res ? html`
      <section class="card"><p>${res.look.summary}</p></section>
      <h3>From your closet</h3>
      ${matched.length ? html`<${Board} items=${matched} className="big" />` : null}
      ${res.rating && !res.rating.invalid ? html`<div class="card"><div class="row"><${Rating} value=${res.rating.rating} /></div><${Reasons} reasons=${res.rating.reasons} warnings=${res.rating.warnings} /></div>` : null}
      <div class="list">${res.matches.map((m) => html`<div class="list-row">
        <span class="swatch big" style=${'background:' + (m.target.color?.hex || '#ccc')}></span>
        <span class="grow"><b>${m.target.color?.name || ''} ${m.target.subcategory}</b><div class="muted small">${m.target.note || ''}</div></span>
        ${m.item ? html`<img src=${m.item.image_url} alt="" /><span class=${'closeness ' + (m.closeness > 70 ? 'hi' : m.closeness > 40 ? 'mid' : 'lo')}>${m.closeness}%</span>` : html`<span class="muted small">missing</span>`}
      </div>`)}</div>
      ${res.matches.some((m) => !m.item || m.closeness < 40) ? html`<p class="muted small">Low matches are pieces you could add to get closer to this look.</p>` : null}
      ${matched.length ? html`<div class="actions">
        <button class="btn primary" onClick=${async () => { const o = await saveOutfit({ item_ids: matched.map((i) => i.id), layout: autoLayout(matched), occasion: res.look.occasion, name: 'Inspired look', rating: res.rating?.rating }); navigate('/outfit/' + o.id); }}>Save outfit</button>
        <button class="btn" onClick=${() => navigate(`/create?items=${matched.map((i) => i.id).join(',')}`)}>Tweak it</button>
        <button class="btn" disabled=${matched.some((i) => i.status !== 'clean')} onClick=${() => logWear(matched.map((i) => i.id)).then(() => toast('Logged as worn today'))}>Wear today</button>
      </div>` : null}` : null}`;
}
