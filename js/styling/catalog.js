// "Pieces you could add": a virtual catalog of classic garments in wearable colours,
// filtered so it never suggests duplicates of what you own or types you don't wear.

import { SUBCATEGORIES, normalizeItem } from './taxonomy.js';
import { isNeutral, hexToHsl, hueDistance, lightness } from './color.js';
import { silhouette } from '../lib/silhouettes.js';
import { generate } from './engine.js';

const C = (name, hex) => ({ name, hex });
const COLORS = {
  white: C('white', '#f4f4f2'), cream: C('cream', '#ece3d0'), beige: C('beige', '#c8b28d'), camel: C('camel', '#b08d68'),
  grey: C('grey', '#8d8d8d'), charcoal: C('charcoal', '#3a3a3c'), black: C('black', '#151515'), navy: C('navy', '#1f2a44'),
  lightblue: C('light blue', '#a9c1dc'), olive: C('olive', '#5b5e3c'), forest: C('forest green', '#2f5a3a'), brown: C('brown', '#4a2c1a'),
  tan: C('tan', '#a87a4f'), burgundy: C('burgundy', '#6b1f2a'), rust: C('rust', '#a0522d'), stone: C('stone', '#b9b2a3'),
  darkdenim: C('dark denim', '#2b3956'), middenim: C('mid denim', '#5a7ca8'), lightdenim: C('light denim', '#93aec9'), sage: C('sage', '#9caf88'),
};
const K = COLORS;

// subcategory → [colours, style tags, material]
const CATALOG = {
  't-shirt':          [[K.white, K.black, K.grey, K.navy, K.cream, K.olive], ['minimal'], 'cotton'],
  'long-sleeve tee':  [[K.white, K.black, K.cream, K.navy], ['minimal'], 'cotton'],
  'polo':             [[K.navy, K.white, K.cream, K.forest, K.black], ['preppy', 'smart casual'], 'cotton'],
  'oxford shirt':     [[K.white, K.lightblue, K.cream], ['classic', 'preppy'], 'cotton'],
  'casual shirt':     [[K.olive, K.cream, K.navy, K.rust], ['workwear', 'classic'], 'linen'],
  'dress shirt':      [[K.white, K.lightblue], ['business', 'classic'], 'cotton'],
  'turtleneck':       [[K.black, K.cream, K.charcoal, K.camel], ['minimal', 'classic'], 'wool'],
  'henley':           [[K.cream, K.olive, K.navy], ['workwear'], 'cotton'],
  'crewneck sweater': [[K.navy, K.grey, K.cream, K.forest, K.camel, K.burgundy, K.charcoal], ['classic', 'scandi'], 'wool'],
  'v-neck sweater':   [[K.navy, K.grey, K.camel], ['preppy'], 'wool'],
  'quarter-zip':      [[K.navy, K.grey, K.cream, K.forest], ['preppy', 'sporty'], 'wool'],
  'cardigan':         [[K.navy, K.cream, K.brown, K.charcoal], ['classic', 'old money'], 'wool'],
  'sweatshirt':       [[K.grey, K.navy, K.cream, K.sage], ['streetwear', 'athleisure'], 'cotton'],
  'hoodie':           [[K.grey, K.black, K.cream, K.navy], ['streetwear', 'athleisure'], 'cotton'],
  'overshirt':        [[K.olive, K.navy, K.brown, K.stone], ['workwear'], 'cotton'],
  'blazer':           [[K.navy, K.charcoal, K.camel], ['classic', 'smart casual'], 'wool'],
  'denim jacket':     [[K.middenim, K.lightdenim, K.black], ['classic', 'streetwear'], 'denim'],
  'bomber jacket':    [[K.olive, K.black, K.navy], ['streetwear'], 'nylon'],
  'leather jacket':   [[K.black, K.brown], ['edgy'], 'leather'],
  'chore jacket':     [[K.navy, K.olive, K.stone], ['workwear'], 'canvas'],
  'trench coat':      [[K.beige, K.stone], ['classic'], 'cotton'],
  'wool coat':        [[K.camel, K.navy, K.charcoal, K.black], ['classic', 'old money'], 'wool'],
  'puffer jacket':    [[K.black, K.olive, K.navy], ['streetwear', 'outdoor'], 'nylon'],
  'jeans':            [[K.darkdenim, K.middenim, K.lightdenim, K.black], ['classic'], 'denim'],
  'chinos':           [[K.beige, K.navy, K.olive, K.stone, K.cream], ['preppy', 'smart casual'], 'cotton'],
  'trousers':         [[K.charcoal, K.grey, K.camel, K.black, K.navy], ['smart casual', 'classic'], 'wool'],
  'cargo pants':      [[K.olive, K.black, K.stone], ['streetwear', 'workwear'], 'cotton'],
  'joggers':          [[K.grey, K.black, K.navy], ['athleisure'], 'cotton'],
  'shorts':           [[K.beige, K.navy, K.olive, K.stone], ['classic'], 'cotton'],
  'skirt':            [[K.black, K.camel, K.cream, K.navy], ['classic', 'minimal'], 'wool'],
  'dress':            [[K.black, K.navy, K.cream, K.forest], ['minimal', 'romantic'], 'cotton'],
  'sneakers':         [[K.white, K.black, K.grey, K.cream], ['minimal'], 'leather'],
  'loafers':          [[K.brown, K.black, K.tan], ['old money', 'preppy'], 'leather'],
  'derbies':          [[K.brown, K.black], ['classic', 'business'], 'leather'],
  'chelsea boots':    [[K.brown, K.black, K.tan], ['classic', 'minimal'], 'suede'],
  'boots':            [[K.brown, K.black], ['workwear', 'outdoor'], 'leather'],
  'heels':            [[K.black, K.beige], ['classic'], 'leather'],
};

// Only suggested if you already own something from the same group (so no dresses for someone who never wears them).
const NEEDS_OWNED_GROUP = {
  skirt: ['skirt', 'dress', 'jumpsuit', 'heels', 'blouse'], dress: ['skirt', 'dress', 'jumpsuit', 'heels', 'blouse'],
  heels: ['skirt', 'dress', 'jumpsuit', 'heels', 'blouse'],
  'leather jacket': ['leather jacket', 'chelsea boots', 'boots', 'bomber jacket', 'denim jacket'],
};

const near = (a, b) => {
  if (isNeutral(a) !== isNeutral(b)) return false;
  const ha = hexToHsl(a.hex), hb = hexToHsl(b.hex);
  return Math.abs(lightness(a.hex) - lightness(b.hex)) < 0.12 && (isNeutral(a) || hueDistance(ha.h, hb.h) < 25);
};

/** All virtual pieces worth suggesting for this closet. */
const SEASONAL = {
  shorts: ['spring', 'summer'], sandals: ['spring', 'summer'], 'short-sleeve shirt': ['spring', 'summer'],
  'puffer jacket': ['autumn', 'winter'], parka: ['autumn', 'winter'], 'wool coat': ['autumn', 'winter'], boots: ['autumn', 'winter', 'spring'],
  'chelsea boots': ['autumn', 'winter', 'spring'], turtleneck: ['autumn', 'winter', 'spring'], cardigan: ['autumn', 'winter', 'spring'],
  'crewneck sweater': ['autumn', 'winter', 'spring'], 'v-neck sweater': ['autumn', 'winter', 'spring'], 'quarter-zip': ['autumn', 'winter', 'spring'],
};
export const inSeason = (it, season) => !season || !(SEASONAL[it.subcategory] || it.seasons || []).length || (SEASONAL[it.subcategory] || it.seasons).includes(season);

export function buildCatalog(rawOwned, { season } = {}) {
  const owned = rawOwned.map(normalizeItem);
  const subs = new Set(owned.map((i) => i.subcategory));
  const cats = new Set(owned.map((i) => i.category));
  const out = [];
  for (const [sub, [colors, tags, material]] of Object.entries(CATALOG)) {
    const def = SUBCATEGORIES[sub];
    if (!def || !cats.has(def.category)) continue;            // never wears this kind of thing at all
    const group = NEEDS_OWNED_GROUP[sub];
    if (group && !group.some((g) => subs.has(g))) continue;
    if (!inSeason({ subcategory: sub }, season)) continue;
    for (const col of colors) {
      if (owned.some((i) => i.subcategory === sub && near(i.colors[0], col))) continue; // already have it
      const { url, aspect } = silhouette(sub, col.hex, { ghost: true });
      out.push(normalizeItem({
        id: `v:${sub}:${col.name}`, virtual: true, status: 'clean', subcategory: sub, category: def.category,
        name: `${col.name} ${sub}`, colors: [{ ...col, share: 1 }], style_tags: tags, material, image_url: url, aspect,
        photo: CATALOG_PHOTOS.has(sub) ? photoPath(sub) : null, // grey product photo, recoloured in the browser
      }));
    }
  }
  return out;
}

// clothing types that have a product photo in img/catalog/
export const CATALOG_PHOTOS = new Set(['t-shirt', 'long-sleeve tee', 'polo', 'oxford shirt', 'casual shirt', 'dress shirt', 'turtleneck', 'henley',
  'crewneck sweater', 'v-neck sweater', 'quarter-zip', 'cardigan', 'sweatshirt', 'hoodie', 'overshirt', 'blazer', 'denim jacket', 'bomber jacket',
  'leather jacket', 'chore jacket', 'trench coat', 'wool coat', 'puffer jacket', 'jeans', 'chinos', 'trousers', 'cargo pants', 'joggers', 'shorts',
  'sneakers', 'loafers', 'derbies', 'chelsea boots', 'boots', 'heels']);
export const photoPath = (sub) => `img/catalog/${sub.replace(/[^a-z0-9]+/g, '-')}.webp`;

export const isVirtual = (id) => typeof id === 'string' && id.startsWith('v:');
export const shopLink = (name) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name)}`;

function shuffled(list, seed) {
  let a = seed >>> 0 || 1;
  const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  return list.map((x) => [r(), x]).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
}

/**
 * One batch of discovery ideas: outfits mostly from your closet plus 1–2 pieces you don't own.
 * Returns [{ outfit, have, total, missing:[virtual items] }]. `seen` (Set of signatures) avoids repeats.
 */
export function discoverBatch(owned, catalog, ctx = {}, { seed = 1, seen = new Set(), featured = new Map(), size = 6 } = {}) {
  // a varied handful of candidate pieces each batch keeps the feed fresh and fast
  const byCat = new Map();
  for (const v of shuffled(catalog, seed)) {
    const list = byCat.get(v.category) || [];
    if (list.length < 4) list.push(v);
    byCat.set(v.category, list);
  }
  const subset = [...byCat.values()].flat();
  const pool = [...owned.filter((i) => inSeason(i, ctx.season)), ...subset];
  const byId = new Map(pool.map((i) => [i.id, i]));
  const out = [];
  // first ideas that need just one new piece; top up with two-piece ideas if there aren't enough
  for (const maxVirtual of [1, 2]) {
    if (out.length >= size) break;
    const ideas = generate(pool, { ...ctx, seed: seed + maxVirtual * 7919, count: size * 3, includeDirty: true, maxVirtual,
      preferIds: new Set(subset.map((v) => v.id)), preferWeight: 0.2 });
    for (const o of ideas) {
      const sig = o.itemIds.slice().sort().join('|');
      if (seen.has(sig)) continue;
      const pieces = o.itemIds.map((id) => byId.get(id)).filter((i) => i && i.category !== 'accessory' && i.category !== 'bag');
      const missing = pieces.filter((i) => i.virtual);
      const have = pieces.length - missing.length;
      if (!missing.length || have < 2 || have < missing.length || o.rating < 7.8) continue;
      // spread the feed across different suggestions and different combos of your own clothes
      const ownedKey = pieces.filter((i) => !i.virtual).map((i) => i.id).sort().join('|');
      if (missing.some((m) => (featured.get(m.id) || 0) >= 2) || (featured.get(ownedKey) || 0) >= 2) continue;
      seen.add(sig);
      [...missing.map((m) => m.id), ownedKey].forEach((k) => featured.set(k, (featured.get(k) || 0) + 1));
      out.push({ outfit: o, have, total: pieces.length, missing });
      if (maxVirtual === 2 && out.length >= size) break;
    }
  }
  // closest-to-wearable first: one missing piece before two
  return out.sort((a, b) => a.missing.length - b.missing.length || b.outfit.rating - a.outfit.rating).slice(0, size);
}
