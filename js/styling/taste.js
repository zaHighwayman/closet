// Learns what you like from 👍 / 👎 on outfits.
// Each outfit is broken into features (exact pieces, piece pairs, type pairs, colour pairs,
// style tags, layered or not, accessories). Likes push feature weights up, dislikes down,
// and new outfits get a bonus or penalty from the features they share.

import { normalizeItem } from './taxonomy.js';
import { isNeutral, colorName } from './color.js';

const W = { pair: 0.35, subpair: 0.25, colorpair: 0.15, item: 0.1, sub: 0.08, tag: 0.05, layered: 0.15, acc: 0.2, color: 0.06 };
const DISLIKE = -1.2; // a dislike counts a bit more than a like

const colorKey = (it) => {
  const c = it.colors?.[0];
  if (!c) return 'unknown';
  const n = (c.name || colorName(c.hex)).toLowerCase().split(' ').pop();
  return isNeutral(c) ? n : n;
};

/** Feature strings for a set of items. */
export function features(rawItems) {
  const items = rawItems.filter(Boolean).map(normalizeItem);
  const clothes = items.filter((i) => i.category !== 'accessory' && i.category !== 'bag');
  const accs = items.filter((i) => i.category === 'accessory' || i.category === 'bag');
  const f = new Set();
  for (const it of items) { f.add(`item:${it.id}`); f.add(`sub:${it.subcategory}`); }
  for (const it of clothes) { f.add(`color:${colorKey(it)}`); it.style_tags.forEach((t) => f.add(`tag:${t}`)); }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const [a, b] = [items[i], items[j]].sort((x, y) => (x.id < y.id ? -1 : 1));
    f.add(`pair:${a.id}|${b.id}`);
    if (a.category !== b.category) f.add(`subpair:${[a.subcategory, b.subcategory].sort().join('+')}`);
  }
  for (let i = 0; i < clothes.length; i++) for (let j = i + 1; j < clothes.length; j++) {
    f.add(`colorpair:${[colorKey(clothes[i]), colorKey(clothes[j])].sort().join('+')}`);
  }
  const tops = clothes.filter((c) => c.category === 'top').length;
  f.add(`layered:${tops >= 2 ? 'yes' : 'no'}`);
  for (const a of accs) clothes.forEach((c) => f.add(`acc:${a.subcategory}+${c.subcategory}`));
  return [...f];
}

/** events: [{ ids:[...], s: 1 | -1, t }]. Returns a model for scoring. */
export function compileTaste(events = [], itemsById = new Map()) {
  const w = new Map();
  const disliked = new Set();
  let n = 0;
  for (const e of events) {
    const its = e.ids.map((id) => itemsById.get(id)).filter(Boolean);
    if (its.length < 2) continue;
    n++;
    const val = e.s > 0 ? 1 : DISLIKE;
    for (const f of features(its)) w.set(f, (w.get(f) || 0) + val);
    if (e.s < 0) disliked.add(e.ids.slice().sort().join('|'));
  }
  return { w, disliked, n };
}

/** Bonus/penalty for an outfit from learned taste. */
export function tasteScore(items, model) {
  if (!model?.n) return { score: 0 };
  const sig = items.map((i) => i.id).sort().join('|');
  if (model.disliked.has(sig)) return { score: -4, text: 'you disliked this exact outfit' };
  let s = 0;
  for (const f of features(items)) {
    const v = model.w.get(f);
    if (v) s += Math.tanh(v / 2) * (W[f.split(':')[0]] || 0.05);
  }
  s = Math.max(-2.5, Math.min(2, s));
  return { score: s, text: s > 0.3 ? 'similar to outfits you liked' : s < -0.3 ? 'similar to outfits you disliked' : null };
}

/** Human-readable summary of the strongest learned likes / dislikes (for the stylist and Settings). */
export function describeTaste(model, itemsById = new Map()) {
  if (!model?.n) return { likes: [], dislikes: [] };
  const label = (f) => {
    const [kind, rest] = [f.slice(0, f.indexOf(':')), f.slice(f.indexOf(':') + 1)];
    const nm = (id) => { const it = itemsById.get(id); return it ? (it.name || it.subcategory) : null; };
    if (kind === 'pair') { const [a, b] = rest.split('|').map(nm); return a && b ? `${a} with ${b}` : null; }
    if (kind === 'item') return nm(rest);
    if (kind === 'subpair') return rest.replace('+', ' with ');
    if (kind === 'colorpair') return `${rest.replace('+', ' + ')} colours`;
    if (kind === 'acc') return rest.replace('+', ' with a ');
    if (kind === 'layered') return rest === 'yes' ? 'layered outfits' : 'single-layer outfits';
    if (kind === 'tag') return `${rest} style`;
    if (kind === 'sub' || kind === 'color') return rest;
    return null;
  };
  const ranked = [...model.w.entries()].map(([f, v]) => ({ f, v: v * (W[f.split(':')[0]] || 0.05), label: label(f) })).filter((x) => x.label);
  const uniq = (list) => { const s = new Set(); return list.filter((x) => !s.has(x.label) && s.add(x.label)); };
  return {
    likes: uniq(ranked.filter((x) => x.v > 0).sort((a, b) => b.v - a.v)).slice(0, 6).map((x) => x.label),
    dislikes: uniq(ranked.filter((x) => x.v < 0).sort((a, b) => a.v - b.v)).slice(0, 6).map((x) => x.label),
  };
}
