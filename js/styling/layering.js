// Layering rules for torso stacks: base (against skin) → mid → outer.
// Encodes the practical rules stylists use: what neckline can sit under what,
// thickness ordering, sleeve and hem length, and which bits of the lower layer show.

const SLEEVE_RANK = { none: 0, short: 1, long: 2 };
const LOOSE = new Set(['relaxed', 'oversized', 'wide']);

export const canBe = (item, role) => !!item && (item.layer_roles || []).includes(role);

// How well a base neckline sits under a CLOSED mid layer, keyed by mid neckline.
// good = classic pairing, ok = fine, bad = awkward (penalised), no = doesn't work (rejected).
const UNDER_CLOSED = {
  crew:        { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'ok', collared: 'good', turtleneck: 'no', mock: 'bad', hooded: 'no', quarter_zip: 'no' },
  v:           { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'ok', collared: 'good', turtleneck: 'bad', mock: 'bad', hooded: 'no', quarter_zip: 'no' },
  quarter_zip: { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'ok', collared: 'good', turtleneck: 'no', mock: 'bad', hooded: 'no', quarter_zip: 'no' },
  hooded:      { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'ok', collared: 'no', turtleneck: 'no', mock: 'bad', hooded: 'no', quarter_zip: 'no' },
  turtleneck:  { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'bad', collared: 'no', turtleneck: 'no', mock: 'no', hooded: 'no', quarter_zip: 'no' },
  mock:        { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'bad', collared: 'no', turtleneck: 'no', mock: 'no', hooded: 'no', quarter_zip: 'no' },
  collared:    { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'ok', collared: 'no', turtleneck: 'bad', mock: 'bad', hooded: 'no', quarter_zip: 'no' },
  henley:      { crew: 'ok', v: 'ok', scoop: 'ok', henley: 'bad', collared: 'no', turtleneck: 'no', mock: 'no', hooded: 'no', quarter_zip: 'no' },
};

// Base under an OPEN-front mid (cardigan, open overshirt, zip hoodie): the base shows fully.
function underOpen(baseNeck, mid) {
  if (baseNeck === 'hooded') return mid.neckline === 'hooded' ? 'no' : 'bad';
  if (baseNeck === 'collared') return mid.neckline === 'collared' ? 'bad' : 'good';
  if (['crew', 'henley', 'turtleneck', 'mock'].includes(baseNeck)) return 'good';
  return 'ok';
}

// Anything under an outer layer. `inner` = the top-most layer beneath it.
function underOuter(inner, outer) {
  const tailored = outer.formality >= 3.5 && outer.neckline === 'open';
  if (tailored) {
    if (inner.neckline === 'hooded') return 'bad';
    if (['collared', 'turtleneck', 'mock'].includes(inner.neckline) || inner.subcategory?.includes('sweater')) return 'good';
    return 'ok';
  }
  if (inner.neckline === 'hooded' && outer.neckline === 'hooded') return 'bad';
  if (inner.neckline === 'hooded') return 'good'; // hoodie under denim / bomber / coat
  return 'ok';
}

const COMPAT_SCORE = { good: 0.25, ok: 0, bad: -1.4 }; // a good layer is nice, not a reason to layer everything

export function describe(item) {
  let c = item.colors?.[0]?.name || '';
  const sub = item.subcategory || item.category;
  // "mid denim" + "denim jacket" → "mid denim jacket"
  const last = c.split(' ').pop();
  if (last && sub.split(' ')[0] === last) c = c.split(' ').slice(0, -1).join(' ');
  return [c, sub].filter(Boolean).join(' ');
}

/**
 * Validate a torso stack and work out what shows.
 * @returns {{ok:boolean, score:number, reasons:string[], warnings:string[], areas:Array<{item,area,part}>, formality:Map}}
 */
export function checkStack({ base = null, mid = null, outer = null }) {
  const res = { ok: true, score: 0, reasons: [], warnings: [], areas: [], formality: new Map(), visibleParts: [] };
  const reject = (msg) => { res.ok = false; res.warnings.push(msg); return res; };
  if (!base && !mid) return reject('Needs a top');
  if (base && !canBe(base, 'base')) return reject(`${describe(base)} isn't a base layer`);
  if (mid && !canBe(mid, 'mid')) return reject(`${describe(mid)} isn't a mid layer`);
  if (outer && !canBe(outer, 'outer')) return reject(`${describe(outer)} isn't an outer layer`);
  // cardigans and sweater vests need something under them
  if (mid && !base && mid.needs_base) return reject(`${describe(mid)} needs a layer underneath`);

  // --- neckline compatibility
  if (base && mid) {
    const open = mid.front === 'open';
    const verdict = open ? underOpen(base.neckline, mid) : (UNDER_CLOSED[mid.neckline] || UNDER_CLOSED.crew)[base.neckline] || 'ok';
    if (verdict === 'no') return reject(`A ${base.neckline} ${base.subcategory || 'top'} doesn't work under a ${mid.subcategory || 'mid layer'}`);
    res.score += COMPAT_SCORE[verdict];
    if (verdict === 'good') {
      if (!open && base.neckline === 'collared') res.reasons.push(`${describe(base)} under the ${describe(mid)} with the collar out — a classic layer`);
      else res.reasons.push(`${describe(base)} shows nicely under the open ${mid.subcategory || 'layer'}`);
    }
    if (verdict === 'bad') res.warnings.push(`${base.subcategory} under ${mid.subcategory} is an awkward neckline combination`);
  }
  const inner = mid || base;
  if (outer) {
    const verdict = underOuter(inner, outer);
    res.score += COMPAT_SCORE[verdict];
    if (verdict === 'good') res.reasons.push(`${describe(inner)} layers well under the ${describe(outer)}`);
    if (verdict === 'bad') res.warnings.push(`${inner.subcategory} under a ${outer.subcategory} clashes in style`);
  }

  // --- thickness order: thin layers go underneath
  if (base && mid && base.thickness > mid.thickness + 0.5) return reject(`${describe(base)} is thicker than the ${describe(mid)} over it`);
  if (outer && inner) {
    const d = inner.thickness - outer.thickness;
    if (d > 1.5) return reject(`${describe(inner)} is too bulky to fit under the ${describe(outer)}`);
    if (d > 0.5) { res.score -= 1; res.warnings.push(`${describe(inner)} is bulky under the ${outer.subcategory}`); }
  }

  // --- sleeves: a longer sleeve under a shorter one only works with sleeveless top layers
  const sleeveCheck = (under, over) => {
    if (!under || !over || over.sleeve === 'none') return;
    if (SLEEVE_RANK[under.sleeve] > SLEEVE_RANK[over.sleeve]) {
      res.score -= 1; res.warnings.push(`long sleeves under a short-sleeved ${over.subcategory}`);
    }
  };
  sleeveCheck(base, mid);
  sleeveCheck(inner, outer);

  // --- hem lengths
  if (outer && outer.hem_length === 'cropped' && (inner.hem_length === 'long' || (base && base.hem_length === 'long' && !mid))) {
    res.score -= 0.5; res.warnings.push(`the ${inner.subcategory} hangs below the cropped ${outer.subcategory}`);
  }

  // --- formality: a collared shirt under a knit dresses the knit up
  if (base) res.formality.set(base, base.formality);
  if (mid) {
    let f = mid.formality;
    if (base && base.neckline === 'collared' && base.formality >= 2.5 && mid.front !== 'open' && mid.neckline !== 'hooded') {
      f = Math.max(f, Math.min(4, f + 1));
      res.reasons.push(`the collar dresses up the ${mid.subcategory}`);
    }
    res.formality.set(mid, f);
  }
  if (outer) res.formality.set(outer, outer.formality);

  // --- visible areas (fraction of the whole outfit) for colour and pattern maths
  const TORSO = 0.5;
  let innerShare = TORSO;
  if (outer) { res.areas.push({ item: outer, area: TORSO * 0.6, part: 'body' }); innerShare = TORSO * 0.4; }
  if (base && mid) {
    if (mid.front === 'open') {
      res.areas.push({ item: mid, area: innerShare * 0.55, part: 'body' });
      res.areas.push({ item: base, area: innerShare * 0.45, part: 'front' });
      res.visibleParts.push({ item: base, part: 'front' });
    } else if (mid.sleeve === 'none') {
      res.areas.push({ item: mid, area: innerShare * 0.6, part: 'body' });
      res.areas.push({ item: base, area: innerShare * 0.4, part: 'sleeves' });
      res.visibleParts.push({ item: base, part: 'collar & sleeves' });
    } else {
      let accent = 0;
      const parts = [];
      if (base.neckline === 'collared' && !['hooded', 'turtleneck', 'mock', 'collared'].includes(mid.neckline)) { accent += 0.05; parts.push('collar'); }
      else if (mid.neckline === 'v') { accent += 0.03; parts.push('neckline'); }
      if (base.neckline === 'collared' && base.sleeve === 'long' && mid.sleeve === 'long') { accent += 0.02; parts.push('cuffs'); }
      if (base.hem_length === 'long' && mid.hem_length !== 'long') { accent += 0.03; parts.push('hem'); }
      if (outer) accent *= 0.6;
      res.areas.push({ item: mid, area: innerShare - accent, part: 'body' });
      if (accent) {
        res.areas.push({ item: base, area: accent, part: parts.join('+') });
        res.visibleParts.push({ item: base, part: parts.join(', ') });
      }
    }
  } else {
    res.areas.push({ item: inner, area: innerShare, part: 'body' });
  }
  return res;
}

export function torsoWarmth({ base, mid, outer }) {
  return (base?.warmth || 0) + (mid?.warmth || 0) + (outer?.warmth || 0);
}

// For an arbitrary hand-picked outfit, work out which top is base / mid / outer.
export function assignRoles(items) {
  const slots = { base: null, mid: null, outer: null, bottom: null, one_piece: null, shoes: null, accessories: [] };
  const tops = [];
  for (const it of items) {
    if (it.category === 'bottom') slots.bottom ||= it;
    else if (it.category === 'one_piece') slots.one_piece ||= it;
    else if (it.category === 'shoes') slots.shoes ||= it;
    else if (it.category === 'accessory' || it.category === 'bag') slots.accessories.push(it);
    else tops.push(it);
  }
  if (slots.one_piece) slots.base = slots.one_piece;
  // innermost first: thinner and base-capable layers go under
  tops.sort((a, b) => (a.thickness - b.thickness) || (canBe(b, 'base') - canBe(a, 'base')));
  for (const t of tops) {
    if (!slots.base && canBe(t, 'base')) slots.base = t;
    else if (!slots.mid && canBe(t, 'mid')) slots.mid = t;
    else if (!slots.outer && canBe(t, 'outer')) slots.outer = t;
    else if (!slots.mid && canBe(t, 'base')) slots.mid = { ...t, layer_roles: [...t.layer_roles, 'mid'] };
  }
  return slots;
}

export const isLoose = (it) => LOOSE.has(it?.fit);
