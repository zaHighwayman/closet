// Turn a shop product (title, type, tags) into the app's clothing type + colour.
import { SUBCATEGORIES } from './taxonomy.js';

// most specific first
const TYPE_RULES = [
  [/quarter[- ]?zip|1\/4[- ]?zip|half[- ]?zip/, 'quarter-zip'], [/zip[- ]?(up )?hood/, 'zip hoodie'], [/hood(ie|ed sweat)?\b/, 'hoodie'],
  [/sweat ?shirt|crew ?neck sweat|crewneck sweat/, 'sweatshirt'], [/cardigan/, 'cardigan'], [/sweater vest|knit vest|slipover/, 'sweater vest'],
  [/turtle ?neck|roll ?neck/, 'turtleneck'], [/mock ?neck/, 'mock neck'], [/v[- ]?neck (sweater|jumper|knit)/, 'v-neck sweater'],
  [/(crew|crewneck|knit|wool|merino|cashmere|lambswool|shetland)?\s*(sweater|jumper|pullover|knit\b)/, 'crewneck sweater'],
  [/(merino|wool|cashmere|lambswool|knit).*\bcrew\b|\bcrew ?neck\b(?!.*(tee|t-shirt|sweat))/, 'crewneck sweater'],
  [/over ?shirt|shacket|shirt jacket/, 'overshirt'], [/oxford/, 'oxford shirt'], [/dress shirt|poplin shirt/, 'dress shirt'],
  [/short[- ]sleeve.*shirt|camp collar|bowling shirt|resort shirt/, 'short-sleeve shirt'], [/polo/, 'polo'], [/henley/, 'henley'],
  [/long[- ]sleeve.*(tee|t-shirt)|\bl\/?s (tee|t-?shirt)/, 'long-sleeve tee'], [/tank|vest top|singlet/, 'tank top'], [/\btee\b|t-shirt|tshirt/, 't-shirt'],
  [/\bshirt\b|button[- ]down|flannel/, 'casual shirt'], [/blouse/, 'blouse'],
  [/blazer|sport coat|sportcoat/, 'blazer'], [/suit jacket/, 'suit jacket'], [/trench/, 'trench coat'], [/parka/, 'parka'],
  [/puffer|down jacket|quilted jacket/, 'puffer jacket'], [/bomber/, 'bomber jacket'], [/leather jacket|biker/, 'leather jacket'],
  [/denim jacket|trucker jacket|jean jacket/, 'denim jacket'], [/chore|work jacket|field jacket|utility jacket/, 'chore jacket'],
  [/rain ?(jacket|coat)|shell jacket|gore-tex/, 'rain jacket'], [/overcoat|wool coat|topcoat|\bcoat\b/, 'wool coat'], [/gilet|vest\b/, 'gilet'],
  [/fleece/, 'fleece'], [/jacket/, 'chore jacket'],
  [/jeans?\b|denim (pant|trouser)/, 'jeans'], [/chino/, 'chinos'], [/cargo/, 'cargo pants'], [/jogger|sweat ?pant|track ?pant/, 'joggers'],
  [/\bshorts?\b/, 'shorts'], [/skirt/, 'skirt'], [/legging/, 'leggings'], [/trouser|\bpants?\b|slacks/, 'trousers'],
  [/dress\b/, 'dress'], [/jumpsuit|boiler ?suit/, 'jumpsuit'],
  [/chelsea/, 'chelsea boots'], [/\bboots?\b/, 'boots'], [/loafer|penny/, 'loafers'], [/derby|derbies/, 'derbies'], [/oxford shoe/, 'oxfords'],
  [/runner|running shoe|trainer/, 'running shoes'], [/sneaker|court shoe|low top|high top/, 'sneakers'], [/sandal|slide\b/, 'sandals'],
  [/\bcap\b|baseball hat|6[- ]panel/, 'cap'], [/beanie/, 'beanie'], [/bucket hat/, 'bucket hat'], [/scarf/, 'scarf'], [/belt/, 'belt'],
  [/\bbag\b|tote/, 'tote bag'], [/backpack/, 'backpack'], [/watch/, 'watch'], [/sunglass/, 'sunglasses'], [/glove/, 'gloves'], [/\btie\b/, 'tie'],
];

const COLORS = [
  ['off white', '#efeadf'], ['off-white', '#efeadf'], ['ecru', '#e9e1cf'], ['cream', '#ece3d0'], ['oatmeal', '#d9cdb6'], ['oat', '#d9cdb6'],
  ['bone', '#e8e1d3'], ['chalk', '#ecebe6'], ['snow', '#f6f6f4'], ['milk', '#f2efe6'], ['white', '#f4f4f2'], ['ivory', '#f1ebdc'], ['sand', '#d6c4a2'], ['stone', '#b9b2a3'], ['khaki', '#b5a27a'], ['beige', '#c8b28d'],
  ['taupe', '#8b7d6b'], ['mushroom', '#a39684'], ['camel', '#b08d68'], ['toffee', '#8b5a2b'], ['caramel', '#a0672f'], ['tan', '#a87a4f'], ['tobacco', '#7a5230'], ['chocolate', '#3f2a1d'], ['brown', '#4a2c1a'], ['rust', '#a0522d'],
  ['burgundy', '#6b1f2a'], ['bordeaux', '#5e1a26'], ['wine', '#5e1a26'], ['maroon', '#5a1a22'], ['red', '#b0262c'], ['pink', '#e3a5b4'],
  ['orange', '#d9752b'], ['mustard', '#c99a2e'], ['yellow', '#e3c447'], ['olive', '#5b5e3c'], ['khaki green', '#6b6a45'], ['sage', '#9caf88'],
  ['forest', '#2f5a3a'], ['bottle green', '#244a33'], ['green', '#3c7a4a'], ['teal', '#2a6f73'], ['light blue', '#a9c1dc'], ['sky', '#9cc3e4'],
  ['powder blue', '#b9cfe5'], ['indigo', '#2b3956'], ['dark denim', '#2b3956'], ['rinse', '#2b3956'], ['mid wash', '#5a7ca8'], ['light wash', '#93aec9'],
  ['ink', '#1c2230'], ['navy', '#1f2a44'], ['slate', '#5a6470'], ['midnight', '#1b2236'], ['blue', '#2f5d9a'], ['lilac', '#b9a6cf'], ['purple', '#5e3a7a'], ['charcoal', '#3a3a3c'],
  ['smoke', '#7d7d7d'], ['ash', '#a6a6a2'], ['heather grey', '#9d9d9d'], ['grey', '#8d8d8d'], ['gray', '#8d8d8d'], ['silver', '#b8bcc2'], ['black', '#151515'], ['coal', '#262626'], ['onyx', '#1a1a1a'], ['washed black', '#2a2a2a'],
];

/** { subcategory, category, color:{name,hex}|null, women:boolean } — subcategory null if it isn't clothing we understand */
export function classify(p) {
  const title = String(p.title || '').toLowerCase();
  const hay = `${title} ${String(p.type || '').toLowerCase()} ${(p.tags || []).join(' ').toLowerCase()}`;
  let subcategory = null;
  for (const [re, sub] of TYPE_RULES) if (re.test(title)) { subcategory = sub; break; }
  if (!subcategory) for (const [re, sub] of TYPE_RULES) if (re.test(hay)) { subcategory = sub; break; }
  // colour: prefer the part after " - " / " in " / " | " in the title, where shops usually put it
  const tail = title.split(/ - | – | in | \| |, /).slice(1).join(' ');
  const findColor = (txt) => { for (const [name, hex] of COLORS) if (new RegExp(`\\b${name}\\b`).test(txt)) return { name, hex }; return null; };
  const color = findColor(tail) || findColor(title);
  const women = /\bwomen'?s?\b|\bwmns\b|\bladies\b|\bfemale\b/.test(hay) && !/\bunisex\b/.test(hay);
  const men = /\bmen'?s\b|\bmale\b/.test(hay.replace(/women'?s?/g, ''));
  return { subcategory, category: subcategory ? SUBCATEGORIES[subcategory]?.category : null, color, women, men };
}
