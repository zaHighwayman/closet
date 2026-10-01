// Outfit engine: builds outfits from clean clothes and scores them with style theory.
// Deterministic and explainable — every point added or removed carries a reason.

import { normalizeItem, OCCASIONS, SUBCATEGORIES } from './taxonomy.js';
import { isNeutral, hueFamilies, harmonyType, lightness, hexToHsl, hueDistance } from './color.js';
import { checkStack, torsoWarmth, canBe, assignRoles, describe, isLoose } from './layering.js';
import { fit as accessoryFit, slotOf, MAX_PER_SLOT } from './accessories.js';
import { tasteScore } from './taste.js';

export const INDOOR_DEFAULT = 21;

// ---------------------------------------------------------------- climate

export function targetWarmth(tempC) {
  return Math.max(0.5, Math.min(11, (24 - tempC) / 2.9 + 0.5));
}

/** Decide which temperatures the outfit has to work for. */
export function resolveClimate(weather = {}) {
  const indoor = weather.indoorTemp ?? INDOOR_DEFAULT;
  const f = weather.forecast;
  const outside = f ? (f.feelsLike ?? f.temp) : null;
  if (weather.mode !== 'weather' || !f) {
    return { mode: 'indoor', innerTemp: indoor, outerTemp: outside, legTemp: indoor, rain: false, code: f?.code, fallback: weather.mode === 'weather' && !f };
  }
  if (weather.dayProfile === 'mixed') {
    return { mode: 'mixed', innerTemp: indoor, outerTemp: outside, legTemp: Math.min(indoor, outside), rain: !!f.rain, code: f.code };
  }
  return { mode: 'outside', innerTemp: outside, outerTemp: outside, legTemp: outside, rain: !!f.rain, code: f.code };
}

const indoorOk = (outer) => outer && outer.formality >= 3.5 && outer.warmth <= 2.5; // blazers etc. stay on indoors

// ---------------------------------------------------------------- scoring

const BOLD_PATTERNS = new Set(['graphic', 'camo', 'floral', 'print', 'plaid']);
const CONFLICTING_TAGS = [['athleisure', 'formal'], ['sporty', 'business'], ['grunge', 'preppy'], ['streetwear', 'old money'], ['athleisure', 'business']];

function areasFor(slots, stack) {
  const areas = [...stack.areas];
  if (slots.one_piece) {
    const a = areas.find((x) => x.item === slots.one_piece);
    if (a) a.area += 0.35; else areas.push({ item: slots.one_piece, area: 0.35, part: 'skirt' });
  }
  if (slots.bottom) areas.push({ item: slots.bottom, area: 0.35, part: 'body' });
  if (slots.shoes) areas.push({ item: slots.shoes, area: 0.1, part: 'body' });
  for (const a of slots.accessories || []) areas.push({ item: a, area: 0.03, part: 'body' });
  return areas;
}

function colorAreas(areas) {
  const out = [];
  for (const { item, area, part } of areas) {
    const cols = item.colors;
    const tot = cols.reduce((s, c) => s + (c.share || 1 / cols.length), 0) || 1;
    for (const c of cols) out.push({ hex: c.hex, name: c.name, area: area * (c.share || 1 / cols.length) / tot, item, part, neutral: isNeutral(c) });
  }
  return out;
}

const mainColor = (item) => item.colors[0];

/** Style tags that define the outfit: shared by at least two pieces. */
function dominantTags(clothes) {
  const n = new Map();
  clothes.forEach((c) => c.style_tags.forEach((t) => n.set(t, (n.get(t) || 0) + 1)));
  return new Set([...n].filter(([, k]) => k >= 2 || clothes.length <= 2).map(([t]) => t));
}

/**
 * Score an outfit. slots = { base, mid, outer, bottom, one_piece, shoes, accessories[] }
 * Returns null if the outfit is invalid (a hard rule failed).
 */
export function scoreOutfit(slots, ctx = {}, opts = {}) {
  const reasons = [], warnings = [];
  let score = 5, bonus = 0, penalty = 0;
  // style points: count towards the rating
  const add = (d, text) => {
    score += d; if (d >= 0) bonus += d; else penalty += d;
    if (text) (d >= 0 ? reasons : warnings).push({ d: Math.round(d * 10) / 10, text });
  };
  // ranking-only nudges (rotation, packing re-use): change what's suggested, not how good it is
  const rank = (d) => { score += d; };

  const stack = checkStack({ base: slots.base || slots.one_piece, mid: slots.mid, outer: slots.outer });
  if (!stack.ok) return opts.explainInvalid ? { invalid: true, warnings: stack.warnings.map((text) => ({ d: -10, text })) } : null;
  add(stack.score, null);
  stack.reasons.forEach((t) => reasons.push({ d: 0.5, text: t }));
  stack.warnings.forEach((t) => warnings.push({ d: -0.8, text: t }));

  const clothes = [slots.one_piece || slots.base, slots.mid, slots.outer, slots.bottom, slots.shoes].filter(Boolean);
  const all = [...clothes, ...(slots.accessories || [])];
  const areas = areasFor(slots, stack);
  const cAreas = colorAreas(areas);
  const total = cAreas.reduce((s, a) => s + a.area, 0) || 1;

  // ---- colour harmony
  const chromatic = cAreas.filter((a) => !a.neutral);
  const fams = hueFamilies(chromatic);
  const chromaShare = chromatic.reduce((s, a) => s + a.area, 0) / total;
  const harmony = harmonyType(fams);
  const famLabel = (f) => [...f.names][0];
  if (fams.length > 3) add(-2.5, `too many colours (${fams.length} colour families) — stick to three`);
  else if (harmony === 'neutral') add(0.6, 'all-neutral palette — always cohesive');
  else if (harmony === 'monochrome') {
    const famItems = new Set(chromatic.map((a) => a.item)).size;
    add(famItems >= 2 ? 0.9 : 0.7, famItems >= 2 ? `tonal ${famLabel(fams[0])} look` : `${famLabel(fams[0])} ${chromaShare > 0.3 ? 'as the statement colour' : 'accent'} on a neutral base`);
  }
  else if (harmony === 'analogous') add(0.7, `analogous colours (${fams.map(famLabel).join(' + ')}) sit next to each other on the wheel`);
  else if (harmony === 'complementary') {
    const minor = fams[1].area / total;
    if (minor > 0.2 && fams[0].s > 0.5 && fams[1].s > 0.5) add(-0.8, `${famLabel(fams[0])} and ${famLabel(fams[1])} fight for attention — make one an accent`);
    else add(0.6, `complementary ${famLabel(fams[1])} accent against ${famLabel(fams[0])}`);
  }
  else if (harmony === 'triadic' || harmony === 'split complementary') add(fams.length === 3 ? 0.1 : 0.3, `${harmony} colour scheme`);
  else if (harmony === 'discordant') {
    if (chromaShare < 0.12) add(-0.2, null);
    else add(-1.5, `${fams.map(famLabel).join(' and ')} clash`);
  }
  // 60-30-10: one clearly dominant colour
  if (fams.length >= 2 && chromaShare > 0.6 && fams[1].area / total > 0.3) add(-0.4, 'no clear dominant colour (aim for 60/30/10)');

  // value contrast top vs bottom
  const torsoTop = slots.outer || slots.mid || slots.base || slots.one_piece;
  if (torsoTop && slots.bottom) {
    const lt = lightness(mainColor(torsoTop).hex), lb = lightness(mainColor(slots.bottom).hex);
    const d = Math.abs(lt - lb);
    const sameHue = hueDistance(hexToHsl(mainColor(torsoTop).hex).h, hexToHsl(mainColor(slots.bottom).hex).h) < 25;
    if (d >= 0.25) add(0.5, `${lt > lb ? 'light top over dark bottoms' : 'dark top over light bottoms'} gives clear contrast`);
    else if (d < 0.07 && !sameHue) add(-0.3, 'top and bottoms blend together — add contrast');
  }
  // visible lower layers (collar / cuffs / hem): small accent areas
  for (const v of stack.visibleParts) {
    const over = slots.mid && v.item !== slots.mid ? slots.mid : slots.outer;
    if (!over || v.item === over) continue;
    const d = Math.abs(lightness(mainColor(v.item).hex) - lightness(mainColor(over).hex));
    if (d > 0.25) add(0.25, `the ${mainColor(v.item).name} ${v.part} pops against the ${mainColor(over).name} ${over.subcategory}`);
    else if (d < 0.06) add(-0.1, null);
  }
  // shoes
  if (slots.shoes) {
    const sc = mainColor(slots.shoes);
    if (!isNeutral(sc)) {
      const echoes = cAreas.some((a) => a.item !== slots.shoes && !a.neutral && hueDistance(hexToHsl(a.hex).h, hexToHsl(sc.hex).h) < 25);
      add(echoes ? 0.4 : -0.3, echoes ? `${sc.name} shoes echo the outfit` : null);
    }
  }

  // ---- formality
  const occ = OCCASIONS[ctx.occasion] || OCCASIONS.casual;
  const fOf = (it) => stack.formality.get(it) ?? it.formality;
  const fw = areas.filter((a) => a.item.category !== 'accessory' && a.item.category !== 'bag');
  const weights = new Map();
  for (const a of fw) weights.set(a.item, (weights.get(a.item) || 0) + a.area);
  if (slots.shoes) weights.set(slots.shoes, 0.2);
  let wsum = 0, fsum = 0;
  for (const [it, w] of weights) { wsum += w; fsum += w * fOf(it); }
  const meanF = wsum ? fsum / wsum : occ.formality;
  const fd = meanF - occ.formality;
  if (Math.abs(fd) <= 0.6) add(0.6, `right level of dressiness for ${occ.label.toLowerCase()}`);
  else add(-(Math.abs(fd) - 0.6) * 1.6, fd > 0 ? `too dressy for ${occ.label.toLowerCase()}` : `too casual for ${occ.label.toLowerCase()}`);
  // coats go over anything, so they don't count towards the formality spread
  const spreadItems = clothes.filter((it) => weights.has(it) && !(it === slots.outer && it.warmth >= 4)); // only what's visible
  const fs = spreadItems.map(fOf);
  const spread = Math.max(...fs) - Math.min(...fs);
  if (spread > 2.25) {
    const lo = spreadItems[fs.indexOf(Math.min(...fs))], hi = spreadItems[fs.indexOf(Math.max(...fs))];
    add(-(spread - 2.25) * 1.5, `${describe(lo)} is much more casual than the ${describe(hi)}`);
  }

  // ---- patterns
  const patterned = [];
  for (const it of clothes) {
    if (!it.pattern || it.pattern === 'solid' || it.pattern === 'knit texture') continue;
    const vis = areas.filter((a) => a.item === it).reduce((s, a) => s + a.area, 0);
    if (vis < 0.02) continue;
    patterned.push({ it, vis, bold: it.pattern_scale === 'large' || (BOLD_PATTERNS.has(it.pattern) && it.pattern_scale !== 'small') });
  }
  if (patterned.length === 1) add(0.3, `the ${describe(patterned[0].it)} is the single focal pattern`);
  else if (patterned.length === 2) {
    const [a, b] = patterned;
    const shareColor = a.it.colors.some((c) => b.it.colors.some((d) => hueDistance(hexToHsl(c.hex).h, hexToHsl(d.hex).h) < 25 || (isNeutral(c) && isNeutral(d) && Math.abs(lightness(c.hex) - lightness(d.hex)) < 0.1)));
    if (a.bold && b.bold) add(-2, 'two bold patterns compete');
    else if (a.it.pattern === b.it.pattern && a.it.pattern_scale === b.it.pattern_scale) add(-1.2, `two ${a.it.pattern} patterns at the same scale`);
    else if (a.it.pattern_scale !== b.it.pattern_scale && shareColor) add(0.5, 'patterns differ in scale and share a colour');
    else add(-0.4, 'patterns don\'t tie together');
  } else if (patterned.length > 2) add(-2, 'too many patterns');

  // ---- silhouette / proportion
  if (torsoTop && slots.bottom) {
    const lt = isLoose(torsoTop), lb = isLoose(slots.bottom);
    const street = (ctx.styleProfile || []).includes('streetwear') || (torsoTop.style_tags.includes('streetwear') && slots.bottom.style_tags.includes('streetwear'));
    if (lt !== lb) add(0.6, lt ? 'relaxed top balanced by a slimmer leg' : 'fitted top balances the wider leg');
    else if (lt && lb) add(street ? 0.2 : -1, street ? 'intentionally relaxed streetwear volume' : 'two loose volumes swamp the body');
  }

  // ---- texture
  const tex = new Set(clothes.map((c) => c.material).filter(Boolean));
  if (tex.size >= 3 || (tex.size >= 2 && clothes.length <= 3)) add(0.4, `texture mix (${[...tex].slice(0, 3).join(', ')})`);
  const denim = clothes.filter((c) => c.material === 'denim');
  if (denim.length >= 2) {
    const d = Math.abs(lightness(mainColor(denim[0]).hex) - lightness(mainColor(denim[1]).hex));
    add(d > 0.15 ? 0.1 : -1, d > 0.15 ? 'contrasting denim washes' : 'matching denim-on-denim');
  }

  // ---- weather / warmth
  const climate = ctx.climate || resolveClimate(ctx.weather);
  const outer = slots.outer;
  const innerWarmth = torsoWarmth({ base: slots.base || slots.one_piece, mid: slots.mid, outer: indoorOk(outer) ? outer : null });
  const warmthCheck = (w, t, where) => {
    const tw = targetWarmth(t), diff = w - tw;
    // indoors you can always take a layer off; outside in the heat, overdressing really hurts
    const hot = where === 'outside' && t >= 20;
    const room = hot ? 1.5 : 3;
    if (diff < -1) add(-(-diff - 1) * 1.2, `not warm enough ${where} (${Math.round(t)}°C)`);
    else if (diff > room) add(-(diff - room) * (hot ? 1.5 : 1), `too warm ${where} (${Math.round(t)}°C)`);
  };
  if (!opts.partial || slots.base || slots.mid) {
    if (climate.mode === 'outside') warmthCheck(torsoWarmth({ base: slots.base || slots.one_piece, mid: slots.mid, outer }), climate.outerTemp, 'outside');
    else {
      warmthCheck(innerWarmth, climate.innerTemp, 'indoors');
      if (outer && !indoorOk(outer) && climate.mode === 'indoor' && climate.innerTemp >= 17) add(-2.5, 'no jacket needed indoors');
      if (climate.mode === 'mixed' && climate.outerTemp < 16) {
        if (!outer) add(-2, `you'll want a jacket for the time outside (${Math.round(climate.outerTemp)}°C)`);
        else warmthCheck(torsoWarmth({ base: slots.base || slots.one_piece, mid: slots.mid, outer }), climate.outerTemp, 'outside');
      }
    }
  }
  const legItem = slots.bottom || slots.one_piece;
  if (legItem) {
    if (legItem.warmth <= 0.5 && climate.legTemp < 15) add(-1.5, `too cold for ${legItem.subcategory} (${Math.round(climate.legTemp)}°C)`);
    if (legItem.warmth >= 2 && climate.legTemp > 27) add(-0.6, `${legItem.subcategory} will be hot (${Math.round(climate.legTemp)}°C)`);
  }
  if (slots.shoes) {
    if (slots.shoes.subcategory === 'sandals' && (climate.legTemp < 15 || climate.rain)) add(-1, 'sandals don\'t suit the weather');
    if (climate.rain && ['suede', 'canvas'].includes(slots.shoes.material)) add(-0.6, `${slots.shoes.material} shoes in the rain`);
  }
  if (climate.rain && climate.mode !== 'indoor' && !opts.partial) {
    if (outer?.water_resistant) add(0.4, `${outer.subcategory} handles the rain`);
    else if (climate.mode === 'outside') add(-0.4, 'rain expected — a water-resistant layer would help');
  }
  if (climate.mode !== 'indoor' && ctx.season) {
    for (const it of clothes) if (it.seasons && !it.seasons.includes(ctx.season)) add(-0.4, `${describe(it)} is out of season`);
  }

  // ---- style coherence
  const prof = new Set(ctx.styleProfile || []);
  if (prof.size) {
    const hit = clothes.filter((c) => c.style_tags.some((t) => prof.has(t))).length / clothes.length;
    if (hit > 0) add(hit * 0.6, hit >= 0.6 ? 'matches your style profile' : null);
  }
  const tagSet = new Set(clothes.flatMap((c) => c.style_tags));
  for (const [a, b] of CONFLICTING_TAGS) if (tagSet.has(a) && tagSet.has(b)) add(-0.6, `mixes ${a} and ${b} pieces`);

  // ---- accessories
  const accs = slots.accessories || [];
  if (accs.length) {
    const env = { formality: meanF, occasionFormality: occ.formality, tags: dominantTags(clothes), profile: prof, climate, code: climate.code,
      colors: clothes.map(mainColor), manual: !!opts.noRotation };
    const seen = new Map();
    for (const a of accs) {
      const sl = slotOf(a);
      seen.set(sl, (seen.get(sl) || 0) + 1);
      if (seen.get(sl) > (MAX_PER_SLOT[sl] || 1)) { add(-0.8, `two ${sl} accessories at once`); continue; }
      const r = accessoryFit(a, slots, env);
      if (!r.ok) add(-1.2, r.why);
      else add(r.score, r.reason);
    }
  }

  // ---- learned taste (👍 / 👎)
  if (ctx.taste) {
    const t = tasteScore(all, ctx.taste);
    if (t.score) add(t.score, t.text);
  }

  // ---- rotation (only when suggesting — not when rating an outfit the user picked)
  const now = ctx.today || Date.now();
  let rot = 0;
  for (const it of opts.noRotation ? [] : clothes) {
    if (!it.last_worn) { rot += 0.15; continue; }
    const days = (now - new Date(it.last_worn).getTime()) / 864e5;
    if (days < 2) { rot -= 1.2; warnings.push({ d: 0, text: `you wore the ${describe(it)} ${days < 1 ? 'today' : 'yesterday'}` }); }
    else if (days < 5) rot -= 0.4;
    else if (days > 30) rot += 0.3;
  }
  rank(Math.max(-3, Math.min(0.8, rot)));
  if (rot > 0.4) reasons.push({ d: 0, text: 'brings out pieces you haven\'t worn lately' });
  if (!opts.noRotation && ctx.recentCombos?.has(signature(all))) { rank(-1); warnings.push({ d: 0, text: 'you wore this exact outfit recently' }); }
  // packing re-use steers the choice but isn't a style merit, so it stays out of the rating
  const steer = ctx.preferIds ? clothes.filter((c) => ctx.preferIds.has(c.id)).length * (ctx.preferWeight ?? 0.7) : 0;
  if (slots.base?.status === 'dirty' || clothes.some((c) => c.status !== 'clean')) {
    if (!ctx.includeDirty) return null;
  }

  return {
    score: score + steer,
    rating: Math.max(1, Math.min(10, Math.round((7.5 + Math.min(2.5, bonus * 0.5) + penalty) * 10) / 10)),
    harmony,
    warmth: Math.round(torsoWarmth({ base: slots.base || slots.one_piece, mid: slots.mid, outer }) * 10) / 10,
    reasons: dedupe(reasons).sort((a, b) => b.d - a.d),
    warnings: dedupe(warnings).sort((a, b) => a.d - b.d),
    visibleParts: stack.visibleParts.map((v) => ({ id: v.item.id, part: v.part })),
  };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((r) => r.text && !seen.has(r.text) && seen.add(r.text));
}

export function signature(items) {
  return items.filter(Boolean).map((i) => i.id).sort().join('|');
}

// ---------------------------------------------------------------- generation

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function topDiverse(cands, n, cap) {
  const out = [], uses = new Map();
  for (const c of cands) {
    const ids = c.ids;
    if (ids.some((id) => (uses.get(id) || 0) >= cap)) continue;
    out.push(c); ids.forEach((id) => uses.set(id, (uses.get(id) || 0) + 1));
    if (out.length >= n) break;
  }
  return out;
}

// pieces you don't own yet (discovery feed) have ids starting with "v:"
const tooManyVirtual = (ids, ctx) => ctx.maxVirtual != null && ids.filter((id) => String(id).startsWith('v:')).length > ctx.maxVirtual;

const slotIds = (s) => [s.base, s.one_piece, s.mid, s.outer, s.bottom, s.shoes, ...(s.accessories || [])].filter(Boolean).map((i) => i.id);

/**
 * Generate outfits.
 * ctx: { occasion, weather:{mode,dayProfile,indoorTemp,forecast}, season, styleProfile[], mustInclude[], exclude[],
 *        includeDirty, seed, count, today, recentCombos:Set, preferIds:Set }
 */
export function generate(rawItems, ctx = {}) {
  const items = rawItems.map(normalizeItem);
  const climate = resolveClimate(ctx.weather);
  const c = { ...ctx, climate };
  const exclude = new Set(ctx.exclude || []);
  const must = items.filter((i) => (ctx.mustInclude || []).includes(i.id));
  const pool = items.filter((i) => !exclude.has(i.id) && (ctx.includeDirty || i.status === 'clean' || must.includes(i)));
  const rand = rng(ctx.seed ?? 1);
  const jitter = ctx.seed ? 0.6 : 0;

  const tops = pool.filter((i) => i.category === 'top' || i.category === 'outerwear');
  const bases = tops.filter((i) => canBe(i, 'base'));
  const mids = tops.filter((i) => canBe(i, 'mid'));
  // indoors, jackets and coats come off — they're offered separately as a commute layer
  const outers = tops.filter((i) => canBe(i, 'outer') && (climate.mode !== 'indoor' || climate.innerTemp < 17 || indoorOk(i) || must.includes(i)));
  const onePieces = pool.filter((i) => i.category === 'one_piece');
  let bottoms = pool.filter((i) => i.category === 'bottom');
  let shoes = pool.filter((i) => i.category === 'shoes');
  const accessories = must.filter((i) => i.category === 'accessory' || i.category === 'bag');
  const accPool = pool.filter((i) => (i.category === 'accessory' || i.category === 'bag') && !must.includes(i));

  const mustTorso = must.filter((i) => i.category === 'top' || i.category === 'outerwear' || i.category === 'one_piece');
  const mustBottom = must.find((i) => i.category === 'bottom');
  const mustShoes = must.find((i) => i.category === 'shoes');
  if (mustBottom) bottoms = [mustBottom];
  if (mustShoes) shoes = [mustShoes];

  // stage 1: torso stacks
  const stacks = [];
  const pushStack = (s) => {
    const used = [s.base, s.one_piece, s.mid, s.outer].filter(Boolean);
    if (new Set(used).size !== used.length) return;
    if (mustTorso.some((m) => !used.includes(m))) return;
    if (mustBottom && s.one_piece) return;
    if (tooManyVirtual(slotIds(s), ctx)) return;
    const r = scoreOutfit(s, c, { partial: true });
    if (r) stacks.push({ slots: s, score: r.score + (rand() - 0.5) * jitter, ids: slotIds(s) });
  };
  for (const base of [null, ...bases]) for (const mid of [null, ...mids]) for (const outer of [null, ...outers]) {
    if (!base && !mid) continue;
    pushStack({ base, mid, outer });
  }
  for (const op of onePieces) for (const mid of [null, ...mids]) for (const outer of [null, ...outers]) pushStack({ one_piece: op, mid, outer });
  stacks.sort((a, b) => b.score - a.score);
  const topStacks = topDiverse(stacks, 60, 10);

  // stage 2: + bottoms
  const withBottoms = [];
  for (const s of topStacks) {
    if (s.slots.one_piece) { withBottoms.push(s); continue; }
    for (const b of bottoms) {
      const slots = { ...s.slots, bottom: b };
      if (tooManyVirtual(slotIds(slots), ctx)) continue;
      const r = scoreOutfit(slots, c, { partial: true });
      if (r) withBottoms.push({ slots, score: r.score + (rand() - 0.5) * jitter, ids: slotIds(slots) });
    }
  }
  withBottoms.sort((a, b) => b.score - a.score);
  const topBottoms = topDiverse(withBottoms, 90, 14);

  // stage 3: + shoes, full score
  const full = [];
  for (const s of topBottoms) {
    for (const sh of shoes.length ? shoes : [null]) {
      const slots = { ...s.slots, shoes: sh, accessories };
      if (tooManyVirtual(slotIds(slots), ctx)) continue;
      const r = scoreOutfit(slots, c);
      if (r) full.push({ slots, result: r, score: r.score + (rand() - 0.5) * jitter, ids: slotIds(slots) });
    }
  }
  full.sort((a, b) => b.score - a.score);

  // diversity: maximal marginal relevance
  // (also spreads out structure, so not every idea is a shirt-under-knit)
  const n = ctx.count ?? 6;
  const chosen = [];
  const rest = full.slice(0, 300);
  const shape = (o) => {
    const b = o.slots.base || o.slots.one_piece, m = o.slots.mid;
    if (b && m) return b.neckline === 'collared' ? 'collar-under-layer' : 'layered';
    return `single:${(m || b)?.neckline === 'collared' ? 'shirt' : 'other'}`;
  };
  while (chosen.length < n && rest.length) {
    let best = -1, bestVal = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const sim = (ch) => rest[i].ids.filter((id) => ch.ids.includes(id)).length / rest[i].ids.length + (shape(ch) === shape(rest[i]) ? 0.25 * chosen.filter((x) => shape(x) === shape(rest[i])).length : 0);
      const overlap = chosen.length ? Math.max(...chosen.map(sim)) : 0;
      const v = rest[i].score - 3 * overlap;
      if (v > bestVal) { bestVal = v; best = i; }
    }
    chosen.push(rest.splice(best, 1)[0]);
  }

  return chosen.map((o) => {
    if (ctx.accessories !== false && accPool.length) {
      const slots = addAccessories(o.slots, accPool, c);
      if (slots !== o.slots) {
        const r = scoreOutfit(slots, c);
        if (r) return toOutfit(slots, r, climate, items, c);
      }
    }
    return toOutfit(o.slots, o.result, climate, items, c);
  });
}

/** Greedily add the best-fitting accessory per slot (caps, AirPods, watch, belt, bag…). */
function addAccessories(slots, accPool, ctx) {
  const base = scoreOutfit(slots, ctx);
  if (!base) return slots;
  const clothes = [slots.one_piece || slots.base, slots.mid, slots.outer, slots.bottom, slots.shoes].filter(Boolean);
  const occ = OCCASIONS[ctx.occasion] || OCCASIONS.casual;
  const wsum = clothes.reduce((s, c) => s + c.formality, 0) / (clothes.length || 1);
  const env = { formality: wsum, occasionFormality: occ.formality, tags: dominantTags(clothes),
    profile: new Set(ctx.styleProfile || []), climate: ctx.climate, code: ctx.climate?.code, colors: clothes.map(mainColor) };
  const bySlot = new Map();
  for (const a of accPool) {
    const r = accessoryFit(a, slots, env);
    if (!r.ok || r.score < 0.3) continue;
    // taste can veto (e.g. you disliked caps with polos)
    const t = ctx.taste ? tasteScore([...clothes, a], ctx.taste).score - tasteScore(clothes, ctx.taste).score : 0;
    const sc = r.score + t;
    if (sc < 0.3) continue;
    const sl = slotOf(a);
    const list = bySlot.get(sl) || [];
    list.push({ a, sc });
    bySlot.set(sl, list);
  }
  const picks = [];
  for (const [sl, list] of bySlot) {
    list.sort((x, y) => y.sc - x.sc);
    picks.push(...list.slice(0, MAX_PER_SLOT[sl] || 1));
  }
  picks.sort((x, y) => y.sc - x.sc);
  const chosen = picks.slice(0, ctx.maxAccessories ?? 2).map((p) => p.a);
  return chosen.length ? { ...slots, accessories: [...(slots.accessories || []), ...chosen] } : slots;
}

function toOutfit(slots, result, climate, items, ctx) {
  const out = {
    slots: Object.fromEntries(Object.entries(slots).filter(([k, v]) => v && k !== 'accessories').map(([k, v]) => [k, v.id])),
    accessoryIds: (slots.accessories || []).map((a) => a.id),
    itemIds: slotIds(slots),
    ...result,
    climate,
  };
  // indoor (or mild mixed) day but cold outside: suggest a separate commute layer
  if (!slots.outer && climate.outerTemp != null && climate.outerTemp < 14 && climate.mode !== 'outside') {
    out.commute = pickCommuteLayer(slots, items, ctx, climate.outerTemp);
  }
  return out;
}

export function pickCommuteLayer(slots, items, ctx, outsideTemp) {
  const outers = items.filter((i) => canBe(i, 'outer') && (ctx.includeDirty || i.status === 'clean'));
  let best = null;
  for (const o of outers) {
    const s = { ...slots, outer: o };
    const r = scoreOutfit(s, { ...ctx, climate: { mode: 'outside', innerTemp: outsideTemp, outerTemp: outsideTemp, legTemp: outsideTemp, rain: ctx.climate?.rain } });
    if (r && (!best || r.score > best.score)) best = { id: o.id, score: r.score, reason: `for the commute (${Math.round(outsideTemp)}°C outside)` };
  }
  return best;
}

/** Score a hand-built outfit (manual builder, inspiration match). */
export function rateItems(rawItems, ctx = {}) {
  const items = rawItems.map(normalizeItem);
  const slots = assignRoles(items);
  if (slots.one_piece) { slots.base = null; }
  const climate = resolveClimate(ctx.weather);
  return scoreOutfit(slots, { ...ctx, climate, includeDirty: true }, { explainInvalid: true, noRotation: true });
}

// ---------------------------------------------------------------- trips

/**
 * days: [{ date, forecast:{temp,feelsLike,rain}, occasion }]
 * Reuses packed pieces where it can (capsule packing) and flags dirty items to wash first.
 */
export function planTrip(rawItems, days, ctx = {}) {
  const packed = new Set();
  const uses = new Map();
  const plan = [];
  let lastTop = null;
  const cat = new Map(rawItems.map((i) => [i.id, i.category]));
  for (const [i, day] of days.entries()) {
    const res = generate(rawItems, {
      ...ctx, occasion: day.occasion || ctx.occasion || 'casual', count: 1, includeDirty: true, seed: i + 7,
      weather: { mode: 'weather', dayProfile: day.dayProfile || 'outside', indoorTemp: ctx.indoorTemp, forecast: day.forecast },
      // re-use bottoms, shoes and jackets freely; tops at most twice so days don't look identical
      preferIds: new Set([...packed].filter((id) => cat.get(id) !== 'top' || (uses.get(id) || 0) < 2)),
      exclude: [lastTop, ...[...uses].filter(([id, n]) => cat.get(id) === 'top' && n >= 3).map(([id]) => id)].filter(Boolean),
    })[0];
    if (res) {
      res.itemIds.forEach((id) => { packed.add(id); uses.set(id, (uses.get(id) || 0) + 1); });
      lastTop = res.slots.mid || res.slots.base || res.slots.one_piece || null; // the top people see
    }
    plan.push({ ...day, outfit: res || null });
  }
  const byId = new Map(rawItems.map((i) => [i.id, i]));
  const counts = {};
  plan.forEach((d) => d.outfit?.itemIds.forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
  const packing = [...packed].map((id) => ({ item: byId.get(id), uses: counts[id] || 0, needsWash: byId.get(id)?.status !== 'clean' }));
  return { days: plan, packing };
}

// ---------------------------------------------------------------- gap analysis

export const STAPLES = [
  { subcategory: 'oxford shirt', colors: [{ hex: '#f4f4f2', name: 'white' }], material: 'cotton', style_tags: ['classic', 'preppy', 'smart casual'] },
  { subcategory: 'oxford shirt', colors: [{ hex: '#9db7d5', name: 'light blue' }], material: 'cotton', style_tags: ['classic', 'preppy'] },
  { subcategory: 't-shirt', colors: [{ hex: '#f5f5f5', name: 'white' }], material: 'cotton', style_tags: ['minimal'] },
  { subcategory: 't-shirt', colors: [{ hex: '#151515', name: 'black' }], material: 'cotton', style_tags: ['minimal', 'streetwear'] },
  { subcategory: 'crewneck sweater', colors: [{ hex: '#1f2a44', name: 'navy' }], material: 'wool', style_tags: ['classic', 'preppy', 'smart casual'] },
  { subcategory: 'crewneck sweater', colors: [{ hex: '#8a8a8a', name: 'grey' }], material: 'wool', style_tags: ['minimal', 'scandi'] },
  { subcategory: 'crewneck sweater', colors: [{ hex: '#ede4d3', name: 'cream' }], material: 'wool', style_tags: ['old money', 'scandi'] },
  { subcategory: 'hoodie', colors: [{ hex: '#9a9a9a', name: 'grey' }], material: 'cotton', style_tags: ['streetwear', 'athleisure'] },
  { subcategory: 'jeans', colors: [{ hex: '#2c3a55', name: 'dark denim' }], material: 'denim', fit: 'slim', style_tags: ['classic', 'minimal'] },
  { subcategory: 'chinos', colors: [{ hex: '#c8b28d', name: 'beige' }], material: 'cotton', style_tags: ['preppy', 'smart casual'] },
  { subcategory: 'trousers', colors: [{ hex: '#3a3a3c', name: 'charcoal' }], material: 'wool', style_tags: ['smart casual', 'business'] },
  { subcategory: 'sneakers', colors: [{ hex: '#f6f6f6', name: 'white' }], material: 'leather', style_tags: ['minimal', 'smart casual'] },
  { subcategory: 'loafers', colors: [{ hex: '#4a2c1a', name: 'brown' }], material: 'leather', style_tags: ['old money', 'preppy'] },
  { subcategory: 'chelsea boots', colors: [{ hex: '#1a1a1a', name: 'black' }], material: 'leather', style_tags: ['minimal', 'edgy'] },
  { subcategory: 'blazer', colors: [{ hex: '#1f2a44', name: 'navy' }], material: 'wool', style_tags: ['classic', 'business', 'smart casual'] },
  { subcategory: 'overshirt', colors: [{ hex: '#5b5e3c', name: 'olive' }], material: 'cotton', style_tags: ['workwear'] },
  { subcategory: 'wool coat', colors: [{ hex: '#b08d68', name: 'camel' }], material: 'wool', style_tags: ['classic', 'old money'] },
  { subcategory: 'trench coat', colors: [{ hex: '#c9b28a', name: 'beige' }], material: 'cotton', style_tags: ['classic'] },
  { subcategory: 'denim jacket', colors: [{ hex: '#5a7ca8', name: 'mid denim' }], material: 'denim', style_tags: ['classic', 'streetwear'] },
];

export function gapAnalysis(rawItems, ctx = {}, staples = STAPLES) {
  const items = rawItems.map(normalizeItem);
  const owns = (s) => items.some((i) => i.subcategory === s.subcategory && Math.abs(lightness(i.colors[0].hex) - lightness(s.colors[0].hex)) < 0.15
    && (isNeutral(i.colors[0]) === isNeutral(s.colors[0])));
  const good = (list) => list.filter((o) => o.rating >= 8.5).length;
  const occasions = ctx.occasions || ['casual', 'smart casual'];
  const out = [];
  for (const s of staples) {
    if (owns(s)) continue;
    const fake = { ...s, id: `staple:${s.subcategory}:${s.colors[0].name}`, category: SUBCATEGORIES[s.subcategory].category, status: 'clean', name: `${s.colors[0].name} ${s.subcategory}` };
    let unlocked = 0;
    for (const occasion of occasions) {
      unlocked += good(generate([...items, fake], { ...ctx, occasion, mustInclude: [fake.id], count: 12, includeDirty: true, accessories: false }));
    }
    if (unlocked) out.push({ staple: fake, unlocked });
  }
  return out.sort((a, b) => b.unlocked - a.unlocked).slice(0, ctx.limit || 6);
}

// ---------------------------------------------------------------- inspiration matching

/** targets: [{ subcategory, category, color:{hex,name} }] from the vision model. Picks closest closet item per target. */
export function matchLook(rawItems, targets, ctx = {}) {
  const items = rawItems.map(normalizeItem).filter((i) => ctx.includeDirty || i.status === 'clean');
  const used = new Set();
  const matches = [];
  for (const t of targets) {
    const cat = t.category || SUBCATEGORIES[t.subcategory]?.category;
    let best = null, bestD = Infinity;
    for (const it of items) {
      if (used.has(it.id) || (cat && it.category !== cat)) continue;
      let d = it.subcategory === t.subcategory ? 0 : 1.2;
      if (t.color?.hex) {
        const a = hexToHsl(it.colors[0].hex), b = hexToHsl(t.color.hex);
        d += Math.abs(a.l - b.l) * 2 + (isNeutral(it.colors[0]) && isNeutral(t.color) ? 0 : hueDistance(a.h, b.h) / 90 * Math.min(a.s, b.s) * 2);
      }
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best) used.add(best.id);
    matches.push({ target: t, item: best, closeness: best ? Math.max(0, Math.round((1 - bestD / 3) * 100)) : 0 });
  }
  const chosen = matches.map((m) => m.item).filter(Boolean);
  return { matches, rating: chosen.length ? rateItems(chosen, ctx) : null };
}
