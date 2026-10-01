// Accessory rules: when a cap, beanie, AirPods, watch, belt, tie, bag… suits an outfit.
// fit() returns { ok:false, why } when it breaks a rule, else { ok:true, score, reason }.

import { isNeutral, hexToHsl, hueDistance } from './color.js';
import { describe } from './layering.js';

const LOOPS = new Set(['jeans', 'chinos', 'trousers', 'suit trousers', 'cargo pants', 'shorts']);
const SUNNY = (code) => code != null && code <= 2;

/** Which shirt-like pieces are actually visible (a collar under a knit still counts). */
function visibleCollar(slots) {
  const base = slots.base, mid = slots.mid, outer = slots.outer;
  // button-up shirts (not polos) — a cap or bucket hat fights these
  const collared = (it) => it && it.neckline === 'collared' && it.subcategory !== 'polo' && it.formality >= 2;
  if (collared(mid) || collared(base) && (!mid || !['hooded', 'turtleneck', 'mock'].includes(mid.neckline))) return true;
  return !!(outer && outer.formality >= 3.5 && outer.neckline === 'open'); // blazer
}

/** black / brown / tan / light / other — for matching leathers. */
function leatherFamily(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (l < 0.14 || (s < 0.15 && l < 0.3)) return 'black';
  if (h >= 8 && h <= 50 && s > 0.2) return l < 0.33 ? 'brown' : l < 0.7 ? 'tan' : 'light';
  if (s < 0.15 && l > 0.75) return 'light';
  return 'other';
}

const tailored = (slots) => !!(slots.outer && slots.outer.formality >= 3.5);

/**
 * @param acc     normalized accessory item
 * @param slots   outfit slots (clothes)
 * @param env     { formality: outfit mean formality, occasionFormality, tags:Set, profile:Set, climate, code }
 */
export function fit(acc, slots, env) {
  const r = acc.acc || {};
  const name = acc.subcategory || 'accessory';
  const [lo, hi] = r.range || [0, 5];
  const f = Math.max(env.formality, env.occasionFormality ?? 0);
  if (f > hi + 0.35) return { ok: false, why: `a ${name} is too casual for this outfit` };
  if (env.formality < lo - 0.5) return { ok: false, why: `a ${name} is too dressy for this outfit` };
  const clash = (r.avoid || []).filter((t) => env.tags.has(t));
  if (clash.length) return { ok: false, why: `a ${name} clashes with the ${clash[0]} look` };
  if (r.noCollar && visibleCollar(slots)) return { ok: false, why: `a ${name} fights the collared shirt / tailoring` };
  if (r.noTailoring && tailored(slots)) return { ok: false, why: `a ${name} spoils the line of the ${slots.outer.subcategory}` };

  const c = env.climate || {};
  const outsideTemp = c.mode === 'indoor' ? null : c.outerTemp;
  if (r.maxTemp != null) {
    if (c.mode === 'indoor' && !env.manual) return { ok: false, why: `no ${name} needed indoors` };
    if (outsideTemp != null && outsideTemp > r.maxTemp + 3) return { ok: false, why: `too warm for a ${name} (${Math.round(outsideTemp)}°C)` };
  }
  if (r.minTemp != null && outsideTemp != null && outsideTemp < r.minTemp - 3) return { ok: false, why: `too cold for a ${name}` };
  if (r.sunny && !env.manual && (c.mode === 'indoor' || !SUNNY(env.code))) return { ok: false, why: 'no sun for sunglasses' };

  if (r.needsLoops) {
    if (!slots.bottom || !LOOPS.has(slots.bottom.subcategory)) return { ok: false, why: `${slots.bottom?.subcategory || 'this outfit'} has no belt loops` };
  }
  if (r.needsDressShirt) {
    const b = slots.base;
    if (!b || b.neckline !== 'collared' || b.formality < 3 || slots.mid?.neckline === 'hooded') return { ok: false, why: 'a tie needs a dress shirt' };
  }

  // passes the rules — how much does it add?
  let score = 0.15;
  const reasons = [];
  const suits = (r.suits || []).filter((t) => env.tags.has(t) || env.profile.has(t));
  if (suits.length) { score += 0.35; reasons.push(`suits the ${suits[0]} look`); }
  if (r.slot === 'head' && r.maxTemp != null && outsideTemp != null && outsideTemp <= r.maxTemp) { score += 0.3; reasons.push(`warm for ${Math.round(outsideTemp)}°C`); }
  if (r.sunny && SUNNY(env.code)) { score += 0.4; reasons.push('sunny out'); }
  if (r.slot === 'wrist' && f >= 2.5 && acc.subcategory === 'watch') { score += 0.3; reasons.push('a watch finishes a smart outfit'); }
  if (r.slot === 'tie' && env.occasionFormality >= 4) { score += 0.6; reasons.push('the occasion calls for a tie'); }
  // AirPods & co. aren't really styling — only suggest them for workouts and lazy days
  if (r.slot === 'ears' && acc.subcategory === 'earbuds') {
    if (env.occasionFormality <= 0.5) { score += 0.4; reasons.push('handy for a workout or a walk'); } else score -= 0.3;
  }
  if (r.slot === 'neck' && outsideTemp != null && outsideTemp <= r.maxTemp) { score += 0.3; reasons.push(`cold out (${Math.round(outsideTemp)}°C)`); }

  // leather belt ↔ leather shoes should match (brown with brown, black with black)
  if (r.slot === 'waist' && slots.shoes) {
    const fb = leatherFamily(acc.colors[0].hex), fs = leatherFamily(slots.shoes.colors[0].hex);
    if (fb === fs) { score += 0.4; reasons.push(`the belt matches the ${describe(slots.shoes)}`); }
    else if (f >= 2.5 && ((fb === 'black') !== (fs === 'black')) && fb !== 'other' && fs !== 'other') {
      return { ok: false, why: `the ${describe(acc)} doesn't match the ${describe(slots.shoes)}` };
    }
  }
  // a loud accessory should echo a colour already in the outfit
  const main = acc.colors[0];
  if (main && !isNeutral(main)) {
    const echo = env.colors.some((c2) => !isNeutral(c2) && hueDistance(hexToHsl(c2.hex).h, hexToHsl(main.hex).h) < 25);
    if (echo) { score += 0.25; reasons.push(`the ${main.name} picks up the outfit`); }
    else score -= 0.3;
  }
  return { ok: true, score, reason: reasons.length ? `${describe(acc)}: ${reasons[0]}` : null };
}

export const slotOf = (acc) => acc.acc?.slot || acc.subcategory || 'other';
export const MAX_PER_SLOT = { jewelry: 2 };
