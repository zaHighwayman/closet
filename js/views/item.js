import { html, useState, useEffect } from '../lib/deps.js';
import { useStore, addItem, saveItem, deleteItem, logWear, me, settings } from '../lib/store.js';
import { uploadImage } from '../lib/db.js';
import { prepare, removeBackground, finalize, toAiDataUrl } from '../lib/images.js';
import { tagItem, aiAvailable } from '../lib/ai.js';
import { Header, Icon, Chips, Toggle, navigate, toast, confirmAsk, money, Spinner, Empty } from '../ui/components.js';
import { StatusPicker } from './closet.js';
import { CATEGORIES, CATEGORY_LABELS, SUBCATS_BY_CATEGORY, SUBCATEGORIES, PATTERNS, PATTERN_SCALES, TEXTURES, FITS, SEASONS, STYLE_TAGS, NECKLINES } from '../styling/taxonomy.js';
import { colorName } from '../styling/color.js';
import { wearLimitFor, wearsLeft } from '../styling/laundry.js';
import { describe } from '../styling/layering.js';

const ENGINE_FIELDS = ['layer_roles', 'neckline', 'front', 'sleeve', 'hem_length', 'thickness', 'warmth', 'formality', 'fit', 'needs_base', 'water_resistant'];

// ------------------------------------------------------------------ add items
export function AddItemsView() {
  const [queue, setQueue] = useState([]);
  const [cutout, setCutout] = useState(true);
  const [useAi, setUseAi] = useState(aiAvailable());
  const [running, setRunning] = useState(false);

  const patch = (id, p) => setQueue((q) => q.map((e) => (e.id === id ? { ...e, ...(typeof p === 'function' ? p(e) : p) } : e)));

  async function onFiles(files) {
    const entries = [...files].map((f) => ({ id: Math.random().toString(36).slice(2), file: f, stage: 'Waiting…', preview: URL.createObjectURL(f), form: null }));
    setQueue((q) => [...q, ...entries]);
    setRunning(true);
    for (const e of entries) await processOne(e);
    setRunning(false);
  }

  async function processOne(e) {
    try {
      patch(e.id, { stage: 'Preparing…' });
      let blob = await prepare(e.file);
      if (cutout) {
        try { blob = await removeBackground(blob, (s) => patch(e.id, { stage: s })); }
        catch (err) { console.warn(err); toast('Background removal failed — keeping the original photo', 'error'); }
      }
      const fin = await finalize(blob);
      const preview = URL.createObjectURL(fin.blob);
      let form = { category: 'top', subcategory: '', name: '', colors: fin.palette.length ? fin.palette : [{ hex: '#808080', name: 'grey', share: 1 }], pattern: 'solid', pattern_scale: 'none', seasons: [], style_tags: [] };
      patch(e.id, { stage: useAi ? 'AI is looking at it…' : 'Ready', preview, blob: fin.blob, form });
      if (useAi) {
        try {
          const t = await tagItem(await toAiDataUrl(fin.blob));
          const colors = fin.palette.length
            ? fin.palette.map((p, i) => ({ ...p, name: t.colors?.[i]?.name || p.name }))
            : form.colors;
          form = { ...form, ...withDefaults(t.subcategory, {}), ...clean(t), colors };
        } catch (err) { toast('AI tagging failed: ' + err.message, 'error'); }
      }
      patch(e.id, { stage: 'Ready', form: form.subcategory ? { ...withDefaults(form.subcategory, {}), ...form } : form });
    } catch (err) {
      patch(e.id, { stage: 'Failed: ' + err.message });
    }
  }

  async function save(e) {
    if (!e.form.subcategory) return toast('Pick a type first', 'error');
    patch(e.id, { saving: true });
    try {
      const url = await uploadImage(e.blob, me());
      await addItem({ ...e.form, image_url: url, wear_limit: e.form.wear_limit ?? wearLimitFor(e.form) });
      setQueue((q) => q.filter((x) => x.id !== e.id));
      toast('Added to your closet');
    } catch (err) { toast(err, 'error'); patch(e.id, { saving: false }); }
  }

  async function saveAll() {
    for (const e of queue.filter((x) => x.form?.subcategory && !x.saving)) await save(e);
  }

  const ready = queue.filter((e) => e.form?.subcategory).length;
  return html`
    <${Header} title="Add clothes" backTo="/closet" />
    <div class="card">
      <label class="upload">
        <input type="file" accept="image/*" multiple onChange=${(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <${Icon} name="camera" size=${28} />
        <b>Take or choose photos</b>
        <span class="muted small">One item per photo. Lay it flat or hang it against a plain background for the best cut-out.</span>
      </label>
      <div class="row gap">
        <${Toggle} checked=${cutout} onChange=${setCutout} label="Remove background" />
        <${Toggle} checked=${useAi} onChange=${(v) => (v && !aiAvailable() ? toast('Add a Groq key in Settings to use AI in demo mode', 'error') : setUseAi(v))} label="AI tagging" />
      </div>
      <p class="muted small">Background removal runs on your device. The first time it downloads a model (~40 MB), after that it's cached.</p>
    </div>
    ${queue.map((e) => html`<div class="card add-entry" key=${e.id}>
      <div class="add-head">
        <div class="add-img checker"><img src=${e.preview} alt="" /></div>
        <div class="grow">
          ${e.stage !== 'Ready' ? html`<div class="stage">${e.stage.startsWith('Failed') ? '' : html`<span class="spinner tiny"></span>`} ${e.stage}</div>` : null}
          ${e.form ? html`<div class="muted small">${e.form.description || ''}</div>` : null}
        </div>
        <button class="icon-btn" aria-label="Discard" onClick=${() => setQueue((q) => q.filter((x) => x.id !== e.id))}><${Icon} name="close" /></button>
      </div>
      ${e.form && e.stage === 'Ready' ? html`
        <${ItemForm} value=${e.form} onChange=${(f) => patch(e.id, { form: f })} compact />
        <button class="btn primary wide" disabled=${e.saving} onClick=${() => save(e)}>${e.saving ? 'Saving…' : 'Save to closet'}</button>` : null}
    </div>`)}
    ${ready > 1 && !running ? html`<div class="actions sticky"><button class="btn primary wide" onClick=${saveAll}>Save all ${ready}</button></div>` : null}`;
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));
function withDefaults(sub, cur) {
  const d = SUBCATEGORIES[sub];
  if (!d) return cur;
  const out = { ...cur, category: d.category };
  for (const k of ENGINE_FIELDS) out[k] = d[k];
  out.wear_limit = d.wear_limit;
  return out;
}

// ------------------------------------------------------------------ item form
export function ItemForm({ value: v, onChange, compact }) {
  const [adv, setAdv] = useState(!compact);
  const set = (k, val) => onChange({ ...v, [k]: val });
  const isTop = v.category === 'top' || v.category === 'outerwear' || v.category === 'one_piece';
  const num = (k, min, max, step, label, hint) => html`<label class="range">${label} <b>${v[k] ?? '–'}</b>
    <input type="range" min=${min} max=${max} step=${step} value=${v[k] ?? min} onInput=${(e) => set(k, Number(e.target.value))} />
    ${hint ? html`<span class="muted small">${hint}</span>` : null}</label>`;

  return html`<div class="form item-form">
    <label>Name<input value=${v.name || ''} placeholder="e.g. navy merino crewneck" onInput=${(e) => set('name', e.target.value)} /></label>
    <div class="row gap">
      <label class="grow">Category<select value=${v.category} onChange=${(e) => onChange({ ...v, category: e.target.value, subcategory: '' })}>
        ${CATEGORIES.map((c) => html`<option value=${c}>${CATEGORY_LABELS[c]}</option>`)}</select></label>
      <label class="grow">Type<select value=${v.subcategory || ''} onChange=${(e) => onChange(withDefaults(e.target.value, { ...v, subcategory: e.target.value }))}>
        <option value="" disabled>Choose…</option>
        ${(SUBCATS_BY_CATEGORY[v.category] || []).map((s) => html`<option value=${s}>${s}</option>`)}</select></label>
    </div>
    <div class="label">Colours <span class="muted small">(largest first)</span></div>
    <div class="colors">
      ${v.colors.map((c, i) => html`<div class="color-edit">
        <input type="color" value=${c.hex} aria-label="Colour" onInput=${(e) => set('colors', v.colors.map((x, j) => (j === i ? { ...x, hex: e.target.value, name: colorName(e.target.value) } : x)))} />
        <input class="cname" value=${c.name} aria-label="Colour name" onInput=${(e) => set('colors', v.colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
        ${v.colors.length > 1 ? html`<button class="icon-btn" aria-label="Remove colour" onClick=${() => set('colors', v.colors.filter((_, j) => j !== i))}><${Icon} name="close" size=${16} /></button>` : null}
      </div>`)}
      ${v.colors.length < 3 ? html`<button class="btn small" onClick=${() => set('colors', [...v.colors, { hex: '#ffffff', name: 'white', share: 0.2 }])}>+ colour</button>` : null}
    </div>
    <div class="row gap">
      <label class="grow">Pattern<select value=${v.pattern} onChange=${(e) => onChange({ ...v, pattern: e.target.value, pattern_scale: e.target.value === 'solid' ? 'none' : (v.pattern_scale === 'none' ? 'medium' : v.pattern_scale) })}>
        ${PATTERNS.map((p) => html`<option>${p}</option>`)}</select></label>
      ${v.pattern !== 'solid' ? html`<label class="grow">Pattern size<select value=${v.pattern_scale} onChange=${(e) => set('pattern_scale', e.target.value)}>${PATTERN_SCALES.map((p) => html`<option>${p}</option>`)}</select></label>` : null}
      <label class="grow">Fabric<select value=${v.material || ''} onChange=${(e) => set('material', e.target.value)}><option value="">–</option>${TEXTURES.map((p) => html`<option>${p}</option>`)}</select></label>
    </div>
    <button class="link" type="button" onClick=${() => setAdv(!adv)}>${adv ? 'Hide' : 'Show'} style details (fit, layering, warmth, tags…)</button>
    ${adv ? html`
      <div class="row gap">
        <label class="grow">Fit<select value=${v.fit} onChange=${(e) => set('fit', e.target.value)}>${FITS.map((p) => html`<option>${p}</option>`)}</select></label>
        <label class="grow">Wears before wash<input type="number" min="1" max="999" value=${v.wear_limit ?? ''} onInput=${(e) => set('wear_limit', Number(e.target.value) || null)} /></label>
      </div>
      ${num('formality', 0, 5, 0.5, 'Formality', '0 lounge · 1 casual · 2.5 smart casual · 4 business · 5 formal')}
      ${num('warmth', 0, 7, 0.5, 'Warmth', 'tee 1 · knit 3 · wool coat 5 · puffer 6')}
      ${isTop ? html`
        ${num('thickness', 1, 5, 0.5, 'Thickness', 'thin layers go under thicker ones')}
        <div class="label">Can be worn as</div>
        <${Chips} small multi value=${v.layer_roles} onChange=${(r) => set('layer_roles', r)} options=${[['base', 'Base layer'], ['mid', 'Mid layer'], ['outer', 'Outer layer']]} />
        <div class="row gap">
          <label class="grow">Neckline<select value=${v.neckline} onChange=${(e) => set('neckline', e.target.value)}>${NECKLINES.map((p) => html`<option>${p}</option>`)}</select></label>
          <label class="grow">Sleeves<select value=${v.sleeve} onChange=${(e) => set('sleeve', e.target.value)}><option>none</option><option>short</option><option>long</option></select></label>
          <label class="grow">Length<select value=${v.hem_length} onChange=${(e) => set('hem_length', e.target.value)}><option>cropped</option><option>regular</option><option>long</option></select></label>
        </div>
        <div class="row gap">
          <${Toggle} checked=${v.front === 'open'} onChange=${(c) => set('front', c ? 'open' : 'closed')} label="Open front" />
          <${Toggle} checked=${!!v.needs_base} onChange=${(c) => set('needs_base', c)} label="Needs a layer under" />
          ${v.category === 'outerwear' ? html`<${Toggle} checked=${!!v.water_resistant} onChange=${(c) => set('water_resistant', c)} label="Water resistant" />` : null}
        </div>` : null}
      <div class="label">Seasons</div><${Chips} small multi value=${v.seasons} onChange=${(s) => set('seasons', s)} options=${SEASONS} />
      <div class="label">Style</div><${Chips} small multi value=${v.style_tags} onChange=${(s) => set('style_tags', s)} options=${STYLE_TAGS} />
      <label>Description <span class="muted small">(what the stylist "sees")</span><textarea rows="2" value=${v.description || ''} onInput=${(e) => set('description', e.target.value)}></textarea></label>
      <div class="row gap">
        <label class="grow">Brand<input value=${v.brand || ''} onInput=${(e) => set('brand', e.target.value)} /></label>
        <label class="grow">Size<input value=${v.size || ''} onInput=${(e) => set('size', e.target.value)} /></label>
      </div>
      <div class="row gap">
        <label class="grow">Price<input type="number" min="0" step="0.01" value=${v.price ?? ''} onInput=${(e) => set('price', e.target.value === '' ? null : Number(e.target.value))} /></label>
        <label class="grow">Bought<input type="date" value=${v.purchase_date || ''} onInput=${(e) => set('purchase_date', e.target.value)} /></label>
      </div>
      <label>Notes<textarea rows="2" value=${v.notes || ''} onInput=${(e) => set('notes', e.target.value)}></textarea></label>
      <div class="row gap"><${Toggle} checked=${(v.visibility || settings().defaultVisibility) === 'public'} onChange=${(c) => set('visibility', c ? 'public' : 'private')} label="Show on my public profile" /></div>
    ` : null}
  </div>`;
}

// ------------------------------------------------------------------ item detail
export function ItemView({ id }) {
  const { items } = useStore();
  const item = items.find((i) => i.id === id);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setEdit(null), [id]);
  if (!item) return html`<${Header} title="Item" backTo="/closet" /><${Empty} title="Item not found" />`;

  const cur = settings().currency;
  const cpw = item.price && item.wear_count ? item.price / item.wear_count : null;
  const limit = wearLimitFor(item);

  async function saveEdit() {
    setBusy(true);
    try { await saveItem(id, edit); setEdit(null); toast('Saved'); } catch (e) { toast(e, 'error'); }
    setBusy(false);
  }
  async function retag() {
    setBusy(true);
    try {
      const t = await tagItem(await toAiDataUrl(item.image_url));
      const colors = item.colors.map((c, i) => ({ ...c, name: t.colors?.[i]?.name || c.name }));
      setEdit({ ...item, ...withDefaults(t.subcategory, {}), ...clean(t), colors });
      toast('AI suggestions loaded — review and save');
    } catch (e) { toast(e, 'error'); }
    setBusy(false);
  }

  return html`
    <${Header} title=${item.name || item.subcategory} backTo="/closet" right=${!edit ? html`<button class="icon-btn" aria-label="Edit" onClick=${() => setEdit({ ...item })}><${Icon} name="edit" /></button>` : null} />
    <div class="item-hero checker"><img src=${item.image_url} alt=${item.name || ''} /></div>
    ${edit ? html`
      <div class="card"><${ItemForm} value=${edit} onChange=${setEdit} /></div>
      <div class="actions sticky">
        <button class="btn" onClick=${() => setEdit(null)}>Cancel</button>
        ${aiAvailable() ? html`<button class="btn" disabled=${busy} onClick=${retag}>Re-tag with AI</button>` : null}
        <button class="btn primary" disabled=${busy} onClick=${saveEdit}>Save</button>
      </div>` : html`
      <div class="card">
        <div class="label">Laundry</div>
        <${StatusPicker} item=${item} />
        <p class="muted small">${item.status === 'clean' ? (limit >= 100 ? 'Doesn\'t need regular washing.' : `${wearsLeft(item)} of ${limit} wears left before it needs a wash.`) : 'Left out of outfit suggestions until it\'s clean.'}</p>
      </div>
      <div class="stats-row">
        <div><b>${item.wear_count || 0}</b><span>wears</span></div>
        <div><b>${cpw != null ? money(cpw, cur) : '–'}</b><span>per wear</span></div>
        <div><b>${item.last_worn ? new Date(item.last_worn).toLocaleDateString() : 'never'}</b><span>last worn</span></div>
      </div>
      <div class="actions">
        <button class="btn primary" disabled=${item.status !== 'clean'} onClick=${() => navigate('/style?with=' + item.id)}><${Icon} name="style" /> Style this</button>
        <button class="btn" onClick=${() => logWear([item.id]).then(() => toast('Logged as worn today'))}>Wore it today</button>
      </div>
      <div class="card">
        <p>${item.description || describe(item)}</p>
        <dl class="specs">
          <dt>Type</dt><dd>${item.subcategory} (${CATEGORY_LABELS[item.category]})</dd>
          <dt>Colours</dt><dd>${item.colors.map((c) => html`<span class="swatch" style=${'background:' + c.hex}></span> ${c.name} `)}</dd>
          <dt>Pattern</dt><dd>${item.pattern}${item.pattern !== 'solid' ? ` (${item.pattern_scale})` : ''}</dd>
          ${item.material ? html`<dt>Fabric</dt><dd>${item.material}</dd>` : null}
          <dt>Fit</dt><dd>${item.fit}</dd>
          <dt>Formality</dt><dd>${item.formality}/5</dd>
          <dt>Warmth</dt><dd>${item.warmth}</dd>
          ${item.layer_roles?.length ? html`<dt>Layers as</dt><dd>${item.layer_roles.join(', ')} · ${item.neckline} neck · ${item.sleeve} sleeve</dd>` : null}
          <dt>Seasons</dt><dd>${item.seasons.join(', ')}</dd>
          ${item.style_tags.length ? html`<dt>Style</dt><dd>${item.style_tags.join(', ')}</dd>` : null}
          ${item.brand ? html`<dt>Brand</dt><dd>${item.brand}</dd>` : null}
          ${item.size ? html`<dt>Size</dt><dd>${item.size}</dd>` : null}
          ${item.price != null ? html`<dt>Price</dt><dd>${money(item.price, cur)}</dd>` : null}
          ${item.notes ? html`<dt>Notes</dt><dd>${item.notes}</dd>` : null}
          <dt>Visibility</dt><dd>${item.visibility}</dd>
        </dl>
      </div>
      <div class="actions">
        <button class="btn" onClick=${() => navigate('/listing/new/' + item.id)}><${Icon} name="bag" /> Sell or swap</button>
        <button class="btn danger" onClick=${async () => { if (confirmAsk('Delete this item? Outfits using it will lose it.')) { await deleteItem(item.id); navigate('/closet'); toast('Deleted'); } }}><${Icon} name="trash" /> Delete</button>
      </div>`}`;
}

export { Spinner };
