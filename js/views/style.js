import { html, useState, useEffect, useMemo } from '../lib/deps.js';
import { useStore, saveOutfit, logWear, planOutfit, recentCombos, settings, saveSettings, todayStr } from '../lib/store.js';
import { generate } from '../styling/engine.js';
import { OCCASIONS } from '../styling/taxonomy.js';
import { describe } from '../styling/layering.js';
import { pickBest, aiAvailable } from '../lib/ai.js';
import { fmtTemp, describeCode } from '../lib/weather.js';
import { useWeather, forecastFor, baseContext } from '../ui/hooks.js';
import { Header, Icon, Chips, Toggle, Segmented, Board, Rating, Reasons, Sheet, ItemThumb, Spinner, Empty, navigate, toast, autoLayout } from '../ui/components.js';

/** Weather mode controls, shared with the stylist and planner. */
export function WeatherControls({ value, onChange, weather, compact }) {
  const s = settings();
  const f = forecastFor(weather);
  const set = (p) => { const v = { ...value, ...p }; onChange(v); saveSettings({ weatherMode: v.mode, dayProfile: v.dayProfile, indoorTemp: v.indoorTemp }).catch(() => {}); };
  return html`<div class=${'weather-box' + (compact ? ' compact' : '')}>
    <div class="row">
      <${Toggle} checked=${value.mode === 'weather'} onChange=${(c) => set({ mode: c ? 'weather' : 'indoor' })} label="Dress for the weather" />
      <span class="grow"></span>
      ${f ? html`<span class="wx">${describeCode(f.code)[1]} ${fmtTemp(f.current ?? f.temp, s.units)} <span class="muted small">feels ${fmtTemp(f.feelsLike, s.units)}${f.rain ? ' · rain' : ''}</span></span>`
        : weather.loading ? html`<span class="muted small">Getting weather…</span>` : html`<a class="small" href="#/settings">Set location</a>`}
    </div>
    ${value.mode === 'weather' && !f && !weather.loading ? html`<p class="notice warn small">No forecast yet — styling for indoors until you <a href="#/settings">set a location</a>.</p>` : null}
    ${value.mode === 'weather' ? html`
      <${Segmented} value=${value.dayProfile} onChange=${(d) => set({ dayProfile: d })} options=${[['outside', 'Mostly outside'], ['mixed', 'Inside, out for a bit']]} />
      <p class="muted small">${value.dayProfile === 'outside' ? 'Built for the forecast.' : 'Inner layers for indoors, plus a jacket that handles the time outside.'}</p>`
    : html`<div class="row gap">
        <span class="muted small grow">Ignoring the forecast — styling for indoors at</span>
        <div class="stepper">
          <button aria-label="Colder" onClick=${() => set({ indoorTemp: (value.indoorTemp ?? 21) - 1 })}>−</button>
          <b>${fmtTemp(value.indoorTemp ?? 21, s.units)}</b>
          <button aria-label="Warmer" onClick=${() => set({ indoorTemp: (value.indoorTemp ?? 21) + 1 })}>+</button>
        </div>
      </div>
      <p class="muted small">If it's cold out, you'll get a separate commute layer suggestion.</p>`}
  </div>`;
}

export const HARMONY = { neutral: 'neutral palette', monochrome: 'one accent colour', analogous: 'analogous colours', complementary: 'complementary colours',
  triadic: 'triadic colours', 'split complementary': 'split-complementary colours', discordant: 'mixed colours' };

export function OutfitCard({ outfit, items, onSave, onWear, onPlan, onEdit, aiWhy, compact }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const its = outfit.itemIds.map((id) => byId.get(id)).filter(Boolean);
  const commute = outfit.commute && byId.get(outfit.commute.id);
  // only call it layered when part of the lower layer actually shows (collar, cuffs, hem…)
  const layered = outfit.slots.mid && (outfit.slots.base || outfit.slots.one_piece) && outfit.visibleParts?.length;
  return html`<article class="outfit-card">
    <${Board} items=${its} slots=${outfit.slots} />
    <div class="outfit-body">
      <div class="row"><${Rating} value=${outfit.rating} /><span class="muted small">${HARMONY[outfit.harmony] || outfit.harmony}${layered ? ' · layered' : ''}</span></div>
      ${aiWhy ? html`<p class="ai-why"><${Icon} name="chat" size=${14} /> ${aiWhy}</p>` : null}
      ${!compact ? html`<${Reasons} reasons=${outfit.reasons} warnings=${outfit.warnings} />` : null}
      ${layered ? html`<p class="layer-note small"><${Icon} name="layers" size=${14} /> ${describe(byId.get(outfit.slots.base || outfit.slots.one_piece))} under the ${describe(byId.get(outfit.slots.mid))}${outfit.visibleParts?.length ? ` — let the ${outfit.visibleParts[0].part} show` : ''}${outfit.slots.outer ? `, ${describe(byId.get(outfit.slots.outer))} on top` : ''}.</p>` : null}
      ${commute ? html`<div class="commute"><img src=${commute.image_url} alt="" /><span><b>Commute layer:</b> ${describe(commute)} — ${outfit.commute.reason}</span></div>` : null}
      <div class="actions small">
        ${onSave ? html`<button class="btn small" onClick=${onSave}><${Icon} name="save" size=${16} /> Save</button>` : null}
        ${onWear ? html`<button class="btn small" onClick=${onWear}><${Icon} name="check" size=${16} /> Wear today</button>` : null}
        ${onPlan ? html`<button class="btn small" onClick=${onPlan}><${Icon} name="calendar" size=${16} /> Plan</button>` : null}
        ${onEdit ? html`<button class="btn small" onClick=${onEdit}><${Icon} name="edit" size=${16} /> Edit</button>` : null}
      </div>
    </div>
  </article>`;
}

/** Shared actions for engine outfits (save / wear / plan / edit). */
export function useOutfitActions(items, occasion) {
  const [planFor, setPlanFor] = useState(null);
  const [date, setDate] = useState(todayStr(new Date(Date.now() + 864e5)));
  const byId = new Map(items.map((i) => [i.id, i]));
  const layoutOf = (o) => autoLayout(o.itemIds.map((id) => byId.get(id)).filter(Boolean), o.slots);
  const actions = (o) => ({
    onSave: async () => {
      const saved = await saveOutfit({ item_ids: o.itemIds, layout: layoutOf(o), occasion, rating: o.rating, reasons: o.reasons.slice(0, 5) });
      toast(html`Saved · <a href=${'#/outfit/' + saved.id}>open</a>`);
    },
    onWear: async () => { await logWear(o.itemIds); toast('Logged as worn today — laundry updated'); },
    onPlan: () => setPlanFor(o),
    onEdit: () => navigate(`/builder?items=${o.itemIds.join(',')}&slots=${encodeURIComponent(JSON.stringify(o.slots))}&occasion=${occasion || ''}`),
  });
  const sheet = html`<${Sheet} open=${!!planFor} onClose=${() => setPlanFor(null)} title="Plan this outfit">
    <label>Date<input type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
    <button class="btn primary wide mt" onClick=${async () => { await planOutfit(date, planFor.itemIds); setPlanFor(null); toast('Added to your calendar'); }}>Add to calendar</button>
  <//>`;
  return { actions, sheet };
}

export function StyleView({ query }) {
  const { items } = useStore();
  const s = settings();
  const weather = useWeather();
  const [occasion, setOccasion] = useState(query.occasion || s.occasion || 'casual');
  const [wx, setWx] = useState({ mode: s.weatherMode, dayProfile: s.dayProfile, indoorTemp: s.indoorTemp });
  const [must, setMust] = useState(query.with ? [query.with] : []);
  const [seed, setSeed] = useState(0);
  const [recent, setRecent] = useState(new Set());
  const [picker, setPicker] = useState(false);
  const [ai, setAi] = useState(null); // {loading} | {picks}
  const { actions, sheet } = useOutfitActions(items, occasion);

  useEffect(() => { recentCombos().then(setRecent).catch(() => {}); }, []);
  useEffect(() => setAi(null), [occasion, wx, must, seed]);

  const clean = items.filter((i) => i.status === 'clean');
  const outfits = useMemo(() => {
    if (clean.length < 2) return [];
    const ctx = baseContext({ occasion, weather: { ...wx, forecast: forecastFor(weather) }, mustInclude: must, seed: seed || undefined, recentCombos: recent, count: 8 });
    return generate(items, ctx);
  }, [items, occasion, wx, must, seed, recent, weather.data]);

  async function askAi() {
    setAi({ loading: true });
    try {
      const byId = new Map(items.map((i) => [i.id, i]));
      const picks = await pickBest(outfits, { occasion: OCCASIONS[occasion].label, lookup: (id) => describe(byId.get(id)) });
      setAi({ picks });
    } catch (e) { toast(e, 'error'); setAi(null); }
  }

  const shown = ai?.picks ? ai.picks.map((p) => ({ o: outfits[p.n], why: p.why })) : outfits.map((o) => ({ o }));
  const mustItems = must.map((id) => items.find((i) => i.id === id)).filter(Boolean);

  return html`
    <${Header} title="Style me" right=${html`
      <a class="icon-btn" href="#/inspo" aria-label="Recreate a look"><${Icon} name="image" /></a>
      <a class="btn small" href="#/outfits">Saved</a>`} />
    <div class="scroll-x"><${Chips} value=${occasion} onChange=${(o) => { if (o) { setOccasion(o); saveSettings({ occasion: o }).catch(() => {}); } }} options=${Object.entries(OCCASIONS).map(([k, v]) => [k, v.label])} /></div>
    <${WeatherControls} value=${wx} onChange=${setWx} weather=${weather} />
    <div class="row gap wrap">
      ${mustItems.map((it) => html`<span class="pill"><img src=${it.image_url} alt="" /> ${describe(it)} <button aria-label="Remove" onClick=${() => setMust(must.filter((x) => x !== it.id))}>×</button></span>`)}
      <button class="btn small" onClick=${() => setPicker(true)}><${Icon} name="plus" size=${16} /> Build around an item</button>
    </div>
    <div class="row gap">
      <button class="btn" onClick=${() => setSeed(Math.floor(Math.random() * 1e9))}><${Icon} name="shuffle" /> More ideas</button>
      ${aiAvailable() && outfits.length > 2 ? html`<button class="btn" disabled=${ai?.loading} onClick=${askAi}><${Icon} name="chat" /> ${ai?.loading ? 'Thinking…' : 'Stylist\'s top 3'}</button>` : null}
      ${ai?.picks ? html`<button class="link" onClick=${() => setAi(null)}>Show all</button>` : null}
    </div>
    ${clean.length < 3 ? html`<${Empty} icon="style" title="Not enough clean clothes">Add a few tops, bottoms and shoes${items.length > clean.length ? ', or do some laundry' : ''} to get outfit ideas.<//>`
      : !outfits.length ? html`<${Empty} icon="style" title="No outfit works yet">Nothing in your clean clothes passes the style rules for this occasion and weather. Try another occasion, toggle the weather, or wash something.<//>`
      : html`<div class="outfit-list">${shown.map(({ o, why }) => html`<${OutfitCard} key=${o.itemIds.join()} outfit=${o} items=${items} aiWhy=${why} ...${actions(o)} />`)}</div>`}
    ${sheet}
    <${Sheet} open=${picker} onClose=${() => setPicker(false)} title="Build around…">
      <div class="grid small">${clean.map((it) => html`<${ItemThumb} small item=${it} selected=${must.includes(it.id)}
        onClick=${() => { setMust(must.includes(it.id) ? must.filter((x) => x !== it.id) : [...must, it.id]); setPicker(false); }} />`)}</div>
    <//>`;
}

export { Spinner };
