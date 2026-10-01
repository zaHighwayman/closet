// Clothing taxonomy: every subcategory carries sensible defaults so items work in the
// engine even before (or without) AI tagging. AI/user values always override these.

export const CATEGORIES = ['top', 'outerwear', 'bottom', 'one_piece', 'shoes', 'accessory', 'bag'];

export const CATEGORY_LABELS = {
  top: 'Tops', outerwear: 'Outerwear', bottom: 'Bottoms', one_piece: 'Dresses & jumpsuits',
  shoes: 'Shoes', accessory: 'Accessories', bag: 'Bags',
};

// layer_roles: which torso layer(s) the item can occupy.
// neckline: crew | v | scoop | collared | turtleneck | mock | hooded | quarter_zip | henley | open | none
// front: closed | open  (open = cardigan / unbuttoned overshirt; needs something underneath)
// thickness/warmth/formality: 1–5. wear_limit: wears before it needs washing.
const D = (category, o) => ({ category, layer_roles: [], neckline: 'none', front: 'closed', sleeve: 'none',
  hem_length: 'regular', thickness: 2, warmth: 1, formality: 2, fit: 'regular', wear_limit: 3, needs_base: false, ...o });

export const SUBCATEGORIES = {
  // ---- tops: base layers
  't-shirt':        D('top', { layer_roles: ['base'], neckline: 'crew', sleeve: 'short', thickness: 1, warmth: 1, formality: 1, wear_limit: 1 }),
  'long-sleeve tee':D('top', { layer_roles: ['base'], neckline: 'crew', sleeve: 'long', thickness: 1, warmth: 1.5, formality: 1, wear_limit: 1 }),
  'tank top':       D('top', { layer_roles: ['base'], neckline: 'scoop', sleeve: 'none', thickness: 1, warmth: 0.5, formality: 1, wear_limit: 1 }),
  'henley':         D('top', { layer_roles: ['base'], neckline: 'henley', sleeve: 'long', thickness: 1.5, warmth: 1.5, formality: 2, wear_limit: 2 }),
  'polo':           D('top', { layer_roles: ['base'], neckline: 'collared', sleeve: 'short', thickness: 1.5, warmth: 1, formality: 2.5, wear_limit: 1 }),
  'dress shirt':    D('top', { layer_roles: ['base'], neckline: 'collared', sleeve: 'long', thickness: 1, warmth: 1, formality: 4, hem_length: 'long', fit: 'slim', wear_limit: 1 }),
  'oxford shirt':   D('top', { layer_roles: ['base', 'mid'], neckline: 'collared', sleeve: 'long', thickness: 1.5, warmth: 1.5, formality: 3, hem_length: 'long', wear_limit: 2 }),
  'casual shirt':   D('top', { layer_roles: ['base', 'mid'], neckline: 'collared', sleeve: 'long', thickness: 1.5, warmth: 1.5, formality: 2.5, wear_limit: 2 }),
  'short-sleeve shirt': D('top', { layer_roles: ['base'], neckline: 'collared', sleeve: 'short', thickness: 1, warmth: 1, formality: 2, wear_limit: 1 }),
  'blouse':         D('top', { layer_roles: ['base'], neckline: 'v', sleeve: 'long', thickness: 1, warmth: 1, formality: 3, wear_limit: 1 }),
  'turtleneck':     D('top', { layer_roles: ['base', 'mid'], neckline: 'turtleneck', sleeve: 'long', thickness: 2, warmth: 2.5, formality: 3, fit: 'slim', wear_limit: 3 }),
  'mock neck':      D('top', { layer_roles: ['base', 'mid'], neckline: 'mock', sleeve: 'long', thickness: 1.5, warmth: 2, formality: 2.5, wear_limit: 2 }),
  'crop top':       D('top', { layer_roles: ['base'], neckline: 'crew', sleeve: 'short', hem_length: 'cropped', thickness: 1, warmth: 0.5, formality: 1, wear_limit: 1 }),
  // ---- tops: mid layers
  'crewneck sweater': D('top', { layer_roles: ['mid'], neckline: 'crew', sleeve: 'long', thickness: 3, warmth: 3, formality: 2.5, wear_limit: 5 }),
  'v-neck sweater': D('top', { layer_roles: ['mid'], neckline: 'v', sleeve: 'long', thickness: 2.5, warmth: 2.5, formality: 3, wear_limit: 5 }),
  'quarter-zip':    D('top', { layer_roles: ['mid'], neckline: 'quarter_zip', sleeve: 'long', thickness: 3, warmth: 3, formality: 2.5, wear_limit: 4 }),
  'cardigan':       D('top', { layer_roles: ['mid'], neckline: 'v', front: 'open', sleeve: 'long', thickness: 2.5, warmth: 2.5, formality: 2.5, needs_base: true, wear_limit: 5 }),
  'sweater vest':   D('top', { layer_roles: ['mid'], neckline: 'v', sleeve: 'none', thickness: 2, warmth: 1.5, formality: 3, needs_base: true, wear_limit: 5 }),
  'sweatshirt':     D('top', { layer_roles: ['mid'], neckline: 'crew', sleeve: 'long', thickness: 3, warmth: 3, formality: 1.5, fit: 'relaxed', wear_limit: 3 }),
  'hoodie':         D('top', { layer_roles: ['mid'], neckline: 'hooded', sleeve: 'long', thickness: 3, warmth: 3, formality: 1, fit: 'relaxed', wear_limit: 3 }),
  'zip hoodie':     D('top', { layer_roles: ['mid', 'outer'], neckline: 'hooded', front: 'open', sleeve: 'long', thickness: 3, warmth: 3, formality: 1, fit: 'relaxed', wear_limit: 3 }),
  'overshirt':      D('top', { layer_roles: ['mid', 'outer'], neckline: 'collared', front: 'open', sleeve: 'long', thickness: 3, warmth: 2.5, formality: 2.5, wear_limit: 5 }),
  'fleece':         D('top', { layer_roles: ['mid', 'outer'], neckline: 'quarter_zip', sleeve: 'long', thickness: 3.5, warmth: 3.5, formality: 1, wear_limit: 5 }),
  // ---- outerwear
  'blazer':         D('outerwear', { layer_roles: ['outer'], neckline: 'open', front: 'open', sleeve: 'long', thickness: 3, warmth: 2, formality: 4, wear_limit: 10 }),
  'suit jacket':    D('outerwear', { layer_roles: ['outer'], neckline: 'open', front: 'open', sleeve: 'long', thickness: 3, warmth: 2, formality: 5, fit: 'slim', wear_limit: 10 }),
  'denim jacket':   D('outerwear', { layer_roles: ['outer'], neckline: 'collared', front: 'open', sleeve: 'long', hem_length: 'cropped', thickness: 3.5, warmth: 2.5, formality: 1.5, wear_limit: 15 }),
  'bomber jacket':  D('outerwear', { layer_roles: ['outer'], neckline: 'crew', front: 'open', sleeve: 'long', hem_length: 'cropped', thickness: 3.5, warmth: 3, formality: 2, wear_limit: 15 }),
  'leather jacket': D('outerwear', { layer_roles: ['outer'], neckline: 'collared', front: 'open', sleeve: 'long', hem_length: 'cropped', thickness: 4, warmth: 3, formality: 2.5, wear_limit: 20 }),
  'chore jacket':   D('outerwear', { layer_roles: ['outer'], neckline: 'collared', front: 'open', sleeve: 'long', thickness: 3.5, warmth: 2.5, formality: 2, wear_limit: 15 }),
  'rain jacket':    D('outerwear', { layer_roles: ['outer'], neckline: 'hooded', front: 'open', sleeve: 'long', thickness: 3, warmth: 1.5, formality: 1.5, water_resistant: true, wear_limit: 20 }),
  'trench coat':    D('outerwear', { layer_roles: ['outer'], neckline: 'collared', front: 'open', sleeve: 'long', hem_length: 'long', thickness: 4, warmth: 3, formality: 3.5, water_resistant: true, wear_limit: 20 }),
  'wool coat':      D('outerwear', { layer_roles: ['outer'], neckline: 'collared', front: 'open', sleeve: 'long', hem_length: 'long', thickness: 5, warmth: 5, formality: 4, wear_limit: 25 }),
  'puffer jacket':  D('outerwear', { layer_roles: ['outer'], neckline: 'hooded', front: 'open', sleeve: 'long', thickness: 5, warmth: 6, formality: 1, wear_limit: 25 }),
  'parka':          D('outerwear', { layer_roles: ['outer'], neckline: 'hooded', front: 'open', sleeve: 'long', hem_length: 'long', thickness: 5, warmth: 6.5, formality: 1.5, water_resistant: true, wear_limit: 25 }),
  'gilet':          D('outerwear', { layer_roles: ['outer'], neckline: 'crew', front: 'open', sleeve: 'none', thickness: 4, warmth: 2, formality: 1.5, wear_limit: 15 }),
  // ---- bottoms (warmth = leg warmth, counted lightly)
  'jeans':          D('bottom', { thickness: 3, warmth: 2, formality: 1.5, wear_limit: 5 }),
  'chinos':         D('bottom', { thickness: 2, warmth: 1.5, formality: 2.5, wear_limit: 3 }),
  'trousers':       D('bottom', { thickness: 2, warmth: 1.5, formality: 4, fit: 'regular', wear_limit: 3 }),
  'suit trousers':  D('bottom', { thickness: 2, warmth: 1.5, formality: 5, fit: 'slim', wear_limit: 3 }),
  'cargo pants':    D('bottom', { thickness: 3, warmth: 2, formality: 1, fit: 'relaxed', wear_limit: 4 }),
  'joggers':        D('bottom', { thickness: 2.5, warmth: 2, formality: 0.5, fit: 'relaxed', wear_limit: 2 }),
  'shorts':         D('bottom', { thickness: 1.5, warmth: 0, formality: 1, wear_limit: 2 }),
  'skirt':          D('bottom', { thickness: 1.5, warmth: 0.5, formality: 2.5, wear_limit: 3 }),
  'leggings':       D('bottom', { thickness: 1.5, warmth: 1, formality: 0.5, fit: 'slim', wear_limit: 1 }),
  // ---- one piece
  'dress':          D('one_piece', { layer_roles: ['base'], neckline: 'scoop', sleeve: 'short', thickness: 1.5, warmth: 1.5, formality: 3, wear_limit: 2 }),
  'jumpsuit':       D('one_piece', { layer_roles: ['base'], neckline: 'v', sleeve: 'none', thickness: 2, warmth: 2, formality: 2.5, wear_limit: 2 }),
  // ---- shoes
  'sneakers':       D('shoes', { formality: 1.5, wear_limit: 999 }),
  'running shoes':  D('shoes', { formality: 0.5, wear_limit: 999 }),
  'loafers':        D('shoes', { formality: 3.5, wear_limit: 999 }),
  'derbies':        D('shoes', { formality: 4, wear_limit: 999 }),
  'oxfords':        D('shoes', { formality: 5, wear_limit: 999 }),
  'boots':          D('shoes', { formality: 2.5, warmth: 1, wear_limit: 999 }),
  'chelsea boots':  D('shoes', { formality: 3, warmth: 1, wear_limit: 999 }),
  'sandals':        D('shoes', { formality: 1, warmth: -0.5, wear_limit: 999 }),
  'heels':          D('shoes', { formality: 4, wear_limit: 999 }),
  // ---- accessories / bags
  'belt':           D('accessory', { formality: 3, wear_limit: 999 }),
  'cap':            D('accessory', { formality: 0.5, wear_limit: 10 }),
  'beanie':         D('accessory', { formality: 1, warmth: 0.5, wear_limit: 10 }),
  'scarf':          D('accessory', { formality: 3, warmth: 1, wear_limit: 10 }),
  'watch':          D('accessory', { formality: 3, wear_limit: 999 }),
  'sunglasses':     D('accessory', { formality: 2, wear_limit: 999 }),
  'jewelry':        D('accessory', { formality: 3, wear_limit: 999 }),
  'tie':            D('accessory', { formality: 5, wear_limit: 20 }),
  'bag':            D('bag', { formality: 2.5, wear_limit: 999 }),
  'backpack':       D('bag', { formality: 1, wear_limit: 999 }),
};

export const SUBCATS_BY_CATEGORY = Object.entries(SUBCATEGORIES).reduce((acc, [name, d]) => {
  (acc[d.category] ||= []).push(name); return acc;
}, {});

export const PATTERNS = ['solid', 'stripe', 'check', 'plaid', 'houndstooth', 'dot', 'floral', 'graphic', 'camo', 'print', 'knit texture'];
export const PATTERN_SCALES = ['none', 'small', 'medium', 'large'];
export const TEXTURES = ['cotton', 'denim', 'wool', 'knit', 'cashmere', 'linen', 'leather', 'suede', 'corduroy', 'fleece', 'silk', 'satin', 'nylon', 'tweed', 'canvas', 'jersey', 'flannel', 'synthetic'];
export const FITS = ['slim', 'regular', 'relaxed', 'oversized', 'wide'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const STYLE_TAGS = ['minimal', 'classic', 'preppy', 'smart casual', 'streetwear', 'workwear', 'athleisure', 'sporty',
  'scandi', 'old money', 'business', 'formal', 'bohemian', 'grunge', 'vintage', 'techwear', 'romantic', 'edgy', 'outdoor'];
export const NECKLINES = ['crew', 'v', 'scoop', 'collared', 'turtleneck', 'mock', 'hooded', 'quarter_zip', 'henley', 'open', 'none'];

export const OCCASIONS = {
  lounge:        { label: 'Lounge',        formality: 0.5 },
  sport:         { label: 'Active',        formality: 0.5 },
  casual:        { label: 'Casual',        formality: 1.5 },
  'smart casual':{ label: 'Smart casual',  formality: 2.75 },
  date:          { label: 'Date',          formality: 3 },
  work:          { label: 'Work',          formality: 3.25 },
  party:         { label: 'Party',         formality: 3 },
  business:      { label: 'Business',      formality: 4.25 },
  formal:        { label: 'Formal',        formality: 5 },
};

export function defaultsFor(subcategory) {
  return SUBCATEGORIES[subcategory] || null;
}

// Fill missing engine attributes from subcategory defaults. Never overwrites set values.
export function normalizeItem(item) {
  const d = defaultsFor(item.subcategory) || D(item.category || 'top', {});
  const out = { ...item };
  for (const [k, v] of Object.entries(d)) {
    if (out[k] === undefined || out[k] === null || out[k] === '' || (Array.isArray(out[k]) && out[k].length === 0 && k === 'layer_roles')) out[k] = v;
  }
  out.colors = Array.isArray(out.colors) && out.colors.length ? out.colors : [{ hex: '#808080', name: 'grey', share: 1 }];
  out.pattern ||= 'solid';
  out.pattern_scale ||= out.pattern === 'solid' ? 'none' : 'medium';
  out.style_tags ||= [];
  out.seasons = out.seasons?.length ? out.seasons : SEASONS.slice();
  out.status ||= 'clean';
  return out;
}

export function seasonFor(date = new Date(), lat = 60) {
  const m = date.getMonth(); // 0-11
  const north = lat >= 0;
  const s = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  if (north) return s;
  return { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[s];
}
