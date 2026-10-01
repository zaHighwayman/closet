import { html, useState, useEffect, useMemo } from '../lib/deps.js';
import { useStore, listCalendar, logWear, unlogWear, markPlannedWorn, planOutfit, deleteCalendarEntry, todayStr, settings, listTrips, getTrip, saveTrip, deleteTrip } from '../lib/store.js';
import { generate, planTrip } from '../styling/engine.js';
import { OCCASIONS, CATEGORY_LABELS, CATEGORIES } from '../styling/taxonomy.js';
import { geocode, rangeForecast, dayToForecast, fmtTemp, describeCode } from '../lib/weather.js';
import { useWeather, baseContext } from '../ui/hooks.js';
import { Header, Icon, Board, Sheet, ItemThumb, Empty, Spinner, Segmented, Chips, Rating, navigate, toast, confirmAsk, useAsync } from '../ui/components.js';
import { OutfitCard, useOutfitActions } from './style.js';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PlanView() {
  const st = useStore();
  const weather = useWeather();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(null);
  const from = todayStr(new Date(month.getFullYear(), month.getMonth(), 1));
  const to = todayStr(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const cal = useAsync(() => listCalendar(from, to), [from]);
  const byId = new Map(st.items.map((i) => [i.id, i]));
  const entries = cal.data || [];
  const wxDays = new Map((weather.data?.days || []).map((d) => [d.date, d]));

  const cells = [];
  const lead = (month.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(null);
  const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) cells.push(todayStr(new Date(month.getFullYear(), month.getMonth(), d)));
  const today = todayStr();

  return html`
    <${Header} title="Plan" right=${html`<a class="btn small" href="#/trips"><${Icon} name="trip" size=${16} /> Trips</a>`} />
    <div class="row cal-nav">
      <button class="icon-btn" aria-label="Previous month" onClick=${() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><${Icon} name="back" /></button>
      <h2 class="grow center">${month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn flip" aria-label="Next month" onClick=${() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><${Icon} name="back" /></button>
    </div>
    <div class="cal">
      ${WD.map((d) => html`<div class="cal-wd">${d}</div>`)}
      ${cells.map((date) => {
        if (!date) return html`<div></div>`;
        const es = entries.filter((e) => e.date === date);
        const first = es[0];
        const img = first && byId.get(first.item_ids.find((id) => ['top', 'one_piece'].includes(byId.get(id)?.category)) || first.item_ids[0]);
        const w = wxDays.get(date);
        return html`<button class=${'cal-day' + (date === today ? ' today' : '') + (first ? (first.worn ? ' worn' : ' planned') : '')} onClick=${() => setDay(date)}>
          <span class="n">${Number(date.slice(8))}</span>
          ${w ? html`<span class="w">${describeCode(w.code)[1]}</span>` : null}
          ${img ? html`<img src=${img.image_url} alt="" />` : null}
          ${es.length > 1 ? html`<span class="more">+${es.length - 1}</span>` : null}
        </button>`;
      })}
    </div>
    <p class="muted small center">Filled = worn · outlined = planned. Tap a day to plan or log an outfit.</p>
    <div class="actions"><button class="btn primary" onClick=${() => setDay(today)}>Log today's outfit</button></div>
    ${day ? html`<${DaySheet} date=${day} entries=${entries.filter((e) => e.date === day)} weatherDay=${wxDays.get(day)} onClose=${() => setDay(null)} onChange=${cal.reload} />` : null}`;
}

function DaySheet({ date, entries, weatherDay, onClose, onChange }) {
  const st = useStore();
  const byId = new Map(st.items.map((i) => [i.id, i]));
  const [mode, setMode] = useState(null); // 'log' | 'saved' | 'generate'
  const [picked, setPicked] = useState([]);
  const [cat, setCat] = useState('top');
  const isPast = date <= todayStr();
  const s = settings();
  const f = dayToForecast(weatherDay);
  const ideas = useMemo(() => (mode === 'generate' ? generate(st.items, baseContext({
    count: 4, includeDirty: date > todayStr(new Date(Date.now() + 3 * 864e5)), // far-off days: laundry will be done by then
    weather: { mode: s.weatherMode, dayProfile: s.dayProfile, indoorTemp: s.indoorTemp, forecast: f },
  })) : []), [mode]);

  async function run(fn, msg) { try { await fn(); toast(msg); onChange(); } catch (e) { toast(e, 'error'); } }

  return html`<${Sheet} open=${true} onClose=${onClose} title=${new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
    ${weatherDay ? html`<p class="muted small">${describeCode(weatherDay.code)[1]} ${describeCode(weatherDay.code)[0]} · ${fmtTemp(weatherDay.tmin, s.units)}–${fmtTemp(weatherDay.tmax, s.units)}</p>` : null}
    ${entries.map((e) => {
      const its = e.item_ids.map((id) => byId.get(id)).filter(Boolean);
      return html`<div class="card">
        <div class="row"><b>${e.worn ? 'Worn' : 'Planned'}</b><span class="grow"></span>
          ${!e.worn && isPast ? html`<button class="btn small primary" onClick=${() => run(() => markPlannedWorn(e), 'Marked worn — laundry updated')}>Mark worn</button>` : null}
          <button class="icon-btn" aria-label="Delete" onClick=${() => run(() => (e.worn ? unlogWear(e) : deleteCalendarEntry(e.id)), 'Removed')}><${Icon} name="trash" /></button></div>
        <${Board} items=${its} />
      </div>`;
    })}
    ${!mode ? html`<div class="actions col">
      ${isPast ? html`<button class="btn" onClick=${() => setMode('log')}>Log what I wore</button>` : null}
      <button class="btn" onClick=${() => setMode('saved')}>${isPast ? 'Pick a saved outfit' : 'Plan a saved outfit'}</button>
      ${date >= todayStr() ? html`<button class="btn primary" onClick=${() => setMode('generate')}>Suggest outfits for this day</button>` : null}
    </div>` : null}
    ${mode === 'log' ? html`
      <div class="scroll-x"><${Chips} small value=${cat} onChange=${(c) => c && setCat(c)} options=${CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]])} /></div>
      <div class="grid small">${st.items.filter((i) => i.category === cat).map((it) => html`<${ItemThumb} small item=${it} selected=${picked.includes(it.id)}
        onClick=${() => setPicked(picked.includes(it.id) ? picked.filter((x) => x !== it.id) : [...picked, it.id])} />`)}</div>
      <button class="btn primary wide mt" disabled=${!picked.length} onClick=${() => run(() => logWear(picked, { date }), 'Logged — laundry updated').then(() => { setMode(null); setPicked([]); })}>Log ${picked.length} item${picked.length === 1 ? '' : 's'} as worn</button>` : null}
    ${mode === 'saved' ? html`<div class="grid outfits">${st.outfits.map((o) => html`<button class="outfit-tile" onClick=${() => run(() => (isPast ? logWear(o.item_ids, { date, outfitId: o.id }) : planOutfit(date, o.item_ids, o.id)), isPast ? 'Logged' : 'Planned').then(() => setMode(null))}>
      <${Board} items=${o.item_ids.map((id) => byId.get(id)).filter(Boolean)} layout=${o.layout} /><div class="cap">${o.name || OCCASIONS[o.occasion]?.label || 'Outfit'}</div></button>`)}</div>
      ${!st.outfits.length ? html`<p class="muted">No saved outfits yet.</p>` : null}` : null}
    ${mode === 'generate' ? html`<div class="outfit-list">${ideas.map((o) => html`<${OutfitCard} compact outfit=${o} items=${st.items}
      onPlan=${() => run(() => planOutfit(date, o.itemIds), 'Planned').then(() => setMode(null))} />`)}</div>
      ${!ideas.length ? html`<p class="muted">No outfits found for this day.</p>` : null}` : null}
  <//>`;
}

// ------------------------------------------------------------------ trips
export function TripsView() {
  const trips = useAsync(listTrips, []);
  const [open, setOpen] = useState(false);
  return html`
    <${Header} title="Trips" backTo="/plan" right=${html`<button class="btn small primary" onClick=${() => setOpen(true)}><${Icon} name="plus" size=${16} /> New trip</button>`} />
    ${trips.loading ? html`<${Spinner} />` : trips.data?.length ? html`<div class="list">${trips.data.map((t) => html`
      <a class="list-row" href=${'#/trip/' + t.id}><${Icon} name="trip" /><div class="grow"><b>${t.name || t.destination}</b><div class="muted small">${t.destination} · ${t.start_date} → ${t.end_date}</div></div><span class="muted small">${t.plan?.packing?.length || 0} items</span></a>`)}</div>`
      : html`<${Empty} icon="trip" title="No trips yet">Tell it where and when — it checks the forecast, plans an outfit per day re-using pieces, and builds a packing list.<//>`}
    ${open ? html`<${NewTrip} onClose=${() => setOpen(false)} />` : null}`;
}

function NewTrip({ onClose }) {
  const st = useStore();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [place, setPlace] = useState(null);
  const [start, setStart] = useState(todayStr(new Date(Date.now() + 7 * 864e5)));
  const [end, setEnd] = useState(todayStr(new Date(Date.now() + 10 * 864e5)));
  const [occasion, setOccasion] = useState('casual');
  const [dayProfile, setDayProfile] = useState('outside');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.length < 2 || place?.name === q) return;
    const t = setTimeout(() => geocode(q).then(setResults).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function create() {
    setBusy(true);
    try {
      const trip = await buildTrip({ name: place.name.split(',')[0], destination: place.name, lat: place.lat, lon: place.lon, start_date: start, end_date: end,
        settings: { occasion, dayProfile }, packed: [] }, st.items);
      const saved = await saveTrip(trip);
      navigate('/trip/' + saved.id);
    } catch (e) { toast(e, 'error'); }
    setBusy(false);
  }

  return html`<${Sheet} open=${true} onClose=${onClose} title="New trip"><div class="form">
    <label>Destination<input value=${q} placeholder="City" onInput=${(e) => { setQ(e.target.value); setPlace(null); }} /></label>
    ${!place && results.length ? html`<div class="list">${results.map((r) => html`<button class="list-row" onClick=${() => { setPlace(r); setQ(r.name); setResults([]); }}>${r.name}</button>`)}</div>` : null}
    <div class="row gap"><label class="grow">From<input type="date" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
      <label class="grow">To<input type="date" value=${end} min=${start} onInput=${(e) => setEnd(e.target.value)} /></label></div>
    <label>Main occasion<select value=${occasion} onChange=${(e) => setOccasion(e.target.value)}>${Object.entries(OCCASIONS).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select></label>
    <${Segmented} value=${dayProfile} onChange=${setDayProfile} options=${[['outside', 'Out exploring'], ['mixed', 'Mostly indoors']]} />
    <button class="btn primary wide" disabled=${!place || busy || end < start} onClick=${create}>${busy ? 'Planning…' : 'Plan my trip'}</button>
    <p class="muted small">Trips more than 16 days away use last year's weather for those dates as an estimate.</p>
  </div><//>`;
}

async function buildTrip(trip, items, occasionsByDate = {}) {
  const range = await rangeForecast(trip.lat, trip.lon, trip.start_date, trip.end_date);
  if (range.length > 30) throw new Error('Trips are limited to 30 days');
  const days = range.map(({ date, day }) => ({ date, forecast: dayToForecast(day), estimated: !!day?.estimated, code: day?.code,
    occasion: occasionsByDate[date] || trip.settings.occasion, dayProfile: trip.settings.dayProfile }));
  const res = planTrip(items, days, baseContext({ indoorTemp: settings().indoorTemp }));
  return {
    ...trip,
    plan: {
      days: res.days.map((d) => ({ date: d.date, forecast: d.forecast, estimated: d.estimated, code: d.code, occasion: d.occasion,
        outfit: d.outfit && { slots: d.outfit.slots, itemIds: d.outfit.itemIds, rating: d.outfit.rating, reasons: d.outfit.reasons.slice(0, 3), warnings: d.outfit.warnings.slice(0, 2), harmony: d.outfit.harmony, visibleParts: d.outfit.visibleParts } })),
      packing: res.packing.map((p) => ({ id: p.item.id, uses: p.uses })),
    },
  };
}

export function TripView({ id }) {
  const st = useStore();
  const t = useAsync(() => getTrip(id), [id]);
  const [trip, setTrip] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t.data) setTrip(t.data); }, [t.data]);
  const { actions, sheet } = useOutfitActions(st.items, trip?.settings?.occasion);
  if (t.loading && !trip) return html`<${Header} title="Trip" backTo="/trips" /><${Spinner} />`;
  if (!trip) return html`<${Header} title="Trip" backTo="/trips" /><${Empty} title="Trip not found" />`;
  const byId = new Map(st.items.map((i) => [i.id, i]));
  const s = settings();
  const packed = new Set(trip.packed || []);
  const packing = (trip.plan.packing || []).map((p) => ({ ...p, item: byId.get(p.id) })).filter((p) => p.item);
  const toWash = packing.filter((p) => p.item.status !== 'clean');

  async function replan(occByDate = {}) {
    setBusy(true);
    try {
      const occ = Object.fromEntries(trip.plan.days.map((d) => [d.date, d.occasion]));
      const next = await buildTrip(trip, st.items, { ...occ, ...occByDate });
      setTrip(await saveTrip({ id: trip.id, plan: next.plan }));
    } catch (e) { toast(e, 'error'); }
    setBusy(false);
  }
  async function togglePacked(itemId) {
    const p = new Set(packed);
    p.has(itemId) ? p.delete(itemId) : p.add(itemId);
    setTrip(await saveTrip({ id: trip.id, packed: [...p] }));
  }

  return html`
    <${Header} title=${trip.name} backTo="/trips" sub=${`${trip.destination} · ${trip.start_date} → ${trip.end_date}`} />
    <section class="card">
      <div class="row"><h3 class="grow">Packing list</h3><span class="muted small">${packed.size}/${packing.length} packed</span></div>
      ${toWash.length ? html`<div class="notice warn"><${Icon} name="wash" size=${16} /> Wash before you go: ${toWash.map((p) => p.item.name || p.item.subcategory).join(', ')}</div>` : null}
      ${CATEGORIES.filter((c) => packing.some((p) => p.item.category === c)).map((c) => html`
        <div class="label">${CATEGORY_LABELS[c]}</div>
        ${packing.filter((p) => p.item.category === c).map((p) => html`<label class="pack-row">
          <input type="checkbox" checked=${packed.has(p.id)} onChange=${() => togglePacked(p.id)} />
          <img src=${p.item.image_url} alt="" /><span class="grow">${p.item.name || p.item.subcategory}</span>
          <span class="muted small">${p.uses}× ${p.item.status !== 'clean' ? html`<span class="tag-status dirty">wash</span>` : ''}</span></label>`)}`)}
    </section>
    <div class="row"><h3 class="grow">Day by day</h3><button class="btn small" disabled=${busy} onClick=${() => replan()}>${busy ? 'Planning…' : 'Re-plan'}</button></div>
    ${trip.plan.days.map((d) => html`<section class="trip-day">
      <div class="row gap">
        <b>${new Date(d.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        <span class="muted small grow">${d.forecast ? `${describeCode(d.code)[1]} ${fmtTemp(d.forecast.tmin, s.units)}–${fmtTemp(d.forecast.tmax, s.units)}${d.estimated ? ' (est.)' : ''}` : 'no forecast'}</span>
        <select class="small" value=${d.occasion} aria-label="Occasion" onChange=${(e) => replan({ [d.date]: e.target.value })}>${Object.entries(OCCASIONS).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select>
      </div>
      ${d.outfit ? html`<${OutfitCard} compact outfit=${d.outfit} items=${st.items} onSave=${actions(d.outfit).onSave} onPlan=${() => planOutfit(d.date, d.outfit.itemIds).then(() => toast('Added to calendar'))} />` : html`<p class="muted">No outfit — add more clothes for this weather.</p>`}
    </section>`)}
    <button class="btn danger wide mt" onClick=${async () => { if (confirmAsk('Delete this trip?')) { await deleteTrip(trip.id); navigate('/trips'); } }}>Delete trip</button>
    ${sheet}`;
}

export { Rating };
