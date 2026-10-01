// Engine tests. Run in a browser via tests/index.html, or on macOS with:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/engine.test.js
import { generate, rateItems, resolveClimate, planTrip, gapAnalysis, matchLook } from '../js/styling/engine.js';
import { checkStack } from '../js/styling/layering.js';
import { normalizeItem } from '../js/styling/taxonomy.js';
import { applyWear, markClean } from '../js/styling/laundry.js';
import { isNeutral, harmonyType, hueFamilies } from '../js/styling/color.js';

const log = globalThis.print || ((...a) => console.log(...a));
let pass = 0, fail = 0;
const results = [];
function test(name, fn) {
  try { fn(); pass++; results.push({ name, ok: true }); log('✓ ' + name); }
  catch (e) { fail++; results.push({ name, ok: false, err: String(e.message || e) }); log('✗ ' + name + '\n    ' + (e.message || e)); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

const I = (id, subcategory, hex, name, extra = {}) => normalizeItem({ id, subcategory, colors: [{ hex, name, share: 1 }], status: 'clean', ...extra });

const closet = [
  I('oxford-white', 'oxford shirt', '#f4f4f2', 'white', { material: 'cotton' }),
  I('tee-white', 't-shirt', '#f7f7f7', 'white', { material: 'cotton' }),
  I('tee-black', 't-shirt', '#141414', 'black', { material: 'cotton' }),
  I('knit-navy', 'crewneck sweater', '#1f2a44', 'navy', { material: 'wool' }),
  I('knit-grey', 'crewneck sweater', '#8d8d8d', 'grey', { material: 'wool' }),
  I('hoodie-grey', 'hoodie', '#9a9a9a', 'grey', { material: 'cotton' }),
  I('jeans-dark', 'jeans', '#2b3956', 'dark denim', { material: 'denim', fit: 'slim' }),
  I('chinos-beige', 'chinos', '#c8b28d', 'beige', { material: 'cotton' }),
  I('shorts', 'shorts', '#c8b28d', 'beige', { material: 'cotton' }),
  I('sneakers-white', 'sneakers', '#f2f2f2', 'white', { material: 'leather' }),
  I('loafers', 'loafers', '#4a2c1a', 'brown', { material: 'leather' }),
  I('coat-camel', 'wool coat', '#b08d68', 'camel', { material: 'wool' }),
  I('denim-jacket', 'denim jacket', '#5a7ca8', 'mid denim', { material: 'denim' }),
];
const byId = Object.fromEntries(closet.map((i) => [i.id, i]));
const cold = { mode: 'weather', dayProfile: 'outside', indoorTemp: 21, forecast: { temp: 2, feelsLike: 0, rain: false } };
const indoorCold = { mode: 'indoor', indoorTemp: 21, forecast: { temp: 2, feelsLike: 0, rain: false } };

test('collared shirt under a crew knit is a valid, rewarded layer', () => {
  const r = checkStack({ base: byId['oxford-white'], mid: byId['knit-navy'] });
  assert(r.ok, r.warnings.join());
  assert(r.score > 0, 'expected a bonus');
  assert(r.visibleParts.some((v) => v.part.includes('collar')), 'collar should be visible');
});

test('collared shirt under a hoodie is rejected', () => {
  const r = checkStack({ base: byId['oxford-white'], mid: byId['hoodie-grey'] });
  assert(!r.ok, 'should be rejected');
});

test('thickness order is enforced (thick layer cannot go under a thin one)', () => {
  const chunky = I('chunky', 'turtleneck', '#222222', 'black', { thickness: 4.5 });
  const thinCardi = I('thin-cardi', 'cardigan', '#eeeeee', 'white', { thickness: 1.5 });
  assert(!checkStack({ base: chunky, mid: thinCardi }).ok, 'thick base under thin mid must fail');
  const wool = I('bulky', 'crewneck sweater', '#333333', 'charcoal', { thickness: 5 });
  const thinOuter = I('thin-outer', 'blazer', '#1f2a44', 'navy', { thickness: 2 });
  assert(!checkStack({ base: byId['tee-white'], mid: wool, outer: thinOuter }).ok, 'bulky knit under thin blazer must fail');
});

test('cardigan alone is rejected (needs a base)', () => {
  const cardi = I('cardi', 'cardigan', '#444444', 'charcoal');
  assert(!checkStack({ mid: cardi }).ok);
});

test('collar raises a knit\'s effective formality', () => {
  const r = checkStack({ base: byId['oxford-white'], mid: byId['knit-grey'] });
  assert(r.formality.get(byId['knit-grey']) > byId['knit-grey'].formality);
});

test('dirty items are never selected', () => {
  const dirty = closet.map((i) => (i.id === 'jeans-dark' || i.id === 'knit-navy' ? { ...i, status: 'dirty' } : i));
  const out = generate(dirty, { occasion: 'casual', count: 8, weather: cold });
  assert(out.length > 0, 'should still produce outfits');
  for (const o of out) assert(!o.itemIds.includes('jeans-dark') && !o.itemIds.includes('knit-navy'), 'dirty item used: ' + o.itemIds);
});

test('in-wash items are excluded too', () => {
  const w = closet.map((i) => (i.id === 'sneakers-white' ? { ...i, status: 'in_wash' } : i));
  for (const o of generate(w, { occasion: 'casual', count: 6, weather: cold })) assert(!o.itemIds.includes('sneakers-white'));
});

test('outerwear is added in the cold when weather mode is on', () => {
  const out = generate(closet, { occasion: 'casual', count: 4, weather: cold });
  assert(out.every((o) => o.slots.outer), 'all cold-weather outfits should have an outer layer: ' + out.map((o) => o.itemIds.join(',')).join(' / '));
});

test('indoor mode ignores a cold forecast (no coat, suggests a commute layer)', () => {
  const out = generate(closet, { occasion: 'casual', count: 4, weather: indoorCold });
  assert(out.length, 'expected outfits');
  assert(out.every((o) => !o.slots.outer || o.slots.outer !== 'coat-camel'), 'indoor outfits should not include the wool coat');
  assert(out.some((o) => o.commute), 'expected a commute layer suggestion');
  assert(resolveClimate(indoorCold).innerTemp === 21);
});

test('no shorts in the cold', () => {
  for (const o of generate(closet, { occasion: 'casual', count: 6, weather: cold })) assert(!o.itemIds.includes('shorts'));
});

test('smart casual picks up the shirt + knit layer', () => {
  const out = generate(closet, { occasion: 'smart casual', count: 6, weather: { mode: 'indoor', indoorTemp: 19 } });
  assert(out.some((o) => o.slots.base === 'oxford-white' && (o.slots.mid === 'knit-navy' || o.slots.mid === 'knit-grey')),
    'expected oxford under a knit among: ' + out.map((o) => o.itemIds.join(',')).join(' / '));
});

test('clashing colours score lower than a harmonious outfit', () => {
  const red = I('red-top', 't-shirt', '#e01b1b', 'red');
  const green = I('green-pants', 'chinos', '#1fbf2a', 'green');
  const purple = I('purple-shoes', 'sneakers', '#8a2be2', 'purple');
  const orange = I('orange-jacket', 'bomber jacket', '#ff8c00', 'orange');
  const clash = rateItems([red, green, purple, orange], { occasion: 'casual' });
  const good = rateItems([byId['tee-white'], byId['jeans-dark'], byId['sneakers-white']], { occasion: 'casual' });
  assert(good.score > clash.score + 2, `good ${good.score} vs clash ${clash.score}`);
});

test('two bold patterns are penalised', () => {
  const a = I('p1', 'casual shirt', '#aa3333', 'red', { pattern: 'floral', pattern_scale: 'large' });
  const b = I('p2', 'chinos', '#334477', 'blue', { pattern: 'camo', pattern_scale: 'large' });
  const r = rateItems([a, b, byId['sneakers-white']], { occasion: 'casual' });
  assert(r.warnings.some((w) => /bold patterns/.test(w.text)));
});

test('formality mismatch is flagged', () => {
  const r = rateItems([byId['hoodie-grey'], byId['chinos-beige'], byId['loafers']], { occasion: 'formal' });
  assert(r.warnings.some((w) => /too casual/.test(w.text)), JSON.stringify(r.warnings));
});

test('rating a hand-picked outfit ignores "worn recently"', () => {
  const now = new Date().toISOString();
  const r = rateItems([{ ...byId['oxford-white'], last_worn: now }, byId['knit-navy'], byId['chinos-beige'], byId['loafers']], { occasion: 'smart casual' });
  assert(!r.warnings.some((w) => /you wore/.test(w.text)), JSON.stringify(r.warnings));
  assert(r.rating >= 8, 'classic smart casual should rate well, got ' + r.rating);
});

test('neutral detection', () => {
  assert(isNeutral({ hex: '#1f2a44' }), 'navy');
  assert(isNeutral({ hex: '#c8b28d' }), 'beige');
  assert(!isNeutral({ hex: '#e01b1b' }), 'red');
  assert(harmonyType(hueFamilies([{ hex: '#e01b1b', area: 1 }, { hex: '#1bbfe0', area: 0.2 }])) === 'complementary');
});

test('laundry: wearing to the limit marks dirty, washing resets', () => {
  let tee = { ...byId['tee-white'], wears_since_wash: 0 };
  tee = { ...tee, ...applyWear(tee) };
  assert(tee.status === 'dirty', 'tee should be dirty after one wear');
  let jeans = { ...byId['jeans-dark'], wears_since_wash: 0 };
  jeans = { ...jeans, ...applyWear(jeans) };
  assert(jeans.status === 'clean' && jeans.wears_since_wash === 1);
  jeans = { ...jeans, ...markClean() };
  assert(jeans.wears_since_wash === 0);
});

test('must-include builds around an item', () => {
  const out = generate(closet, { occasion: 'casual', count: 3, mustInclude: ['denim-jacket'], weather: { mode: 'weather', dayProfile: 'outside', forecast: { feelsLike: 12 } } });
  assert(out.length && out.every((o) => o.itemIds.includes('denim-jacket')));
});

test('trip planner reuses pieces and flags dirty ones', () => {
  const c2 = closet.map((i) => (i.id === 'jeans-dark' ? { ...i, status: 'dirty' } : i));
  const days = [1, 2, 3, 4].map((d) => ({ date: `2026-11-0${d}`, forecast: { temp: 8, feelsLike: 6 } }));
  const { days: plan, packing } = planTrip(c2, days, { occasion: 'casual' });
  assert(plan.every((d) => d.outfit), 'every day gets an outfit');
  const outfitItems = plan.reduce((s, d) => s + d.outfit.itemIds.length, 0);
  assert(packing.length < outfitItems, 'pieces should be reused');
  if (packing.some((p) => p.item.id === 'jeans-dark')) assert(packing.find((p) => p.item.id === 'jeans-dark').needsWash);
});

test('gap analysis suggests missing staples', () => {
  const g = gapAnalysis(closet.slice(0, 8), { weather: { mode: 'indoor' } });
  assert(g.length > 0);
  assert(!g.some((x) => x.staple.subcategory === 'oxford shirt' && x.staple.colors[0].name === 'white'), 'already owned');
});

test('inspiration matching finds closest items', () => {
  const m = matchLook(closet, [{ subcategory: 'crewneck sweater', color: { hex: '#20294a', name: 'navy' } }, { subcategory: 'chinos', color: { hex: '#cbb48f' } }]);
  assert(m.matches[0].item.id === 'knit-navy' && m.matches[1].item.id === 'chinos-beige');
});

log(`\n${pass} passed, ${fail} failed`);
globalThis.__results = { pass, fail, results };
