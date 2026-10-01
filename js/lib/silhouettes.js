// Simple garment silhouettes (SVG data URLs) for pieces you don't own yet and the sample closet.
// Each shape has a tight view box so the image has the garment's real proportions.

const SHAPES = {
  shirt:  ['4 7 92 90', 'M20 20 L40 8 L50 16 L60 8 L80 20 L95 50 L82 54 L80 96 L20 96 L18 54 L5 50 Z M50 16 L50 96'],
  tee:    ['4 9 92 87', 'M20 20 L40 10 Q50 16 60 10 L80 20 L95 45 L80 50 L78 95 L22 95 L20 50 L5 45 Z'],
  knit:   ['3 7 94 90', 'M18 18 L38 8 Q50 16 62 8 L82 18 L96 80 L84 84 L80 96 L20 96 L16 84 L4 80 Z'],
  hoodie: ['3 1 94 96', 'M18 18 L36 10 Q36 2 50 2 Q64 2 64 10 L82 18 L96 80 L84 84 L80 96 L20 96 L16 84 L4 80 Z'],
  vest:   ['14 7 72 90', 'M18 18 L38 8 L50 30 L62 8 L82 18 L82 96 L18 96 Z'],
  coat:   ['2 4 96 95', 'M15 15 L38 5 L50 22 L62 5 L85 15 L97 70 L82 72 L80 98 L20 98 L18 72 L3 70 Z M50 22 L50 98'],
  jacket: ['2 4 96 74', 'M15 15 L38 5 L50 20 L62 5 L85 15 L97 70 L82 72 L80 77 L20 77 L18 72 L3 70 Z M50 20 L50 77'],
  pants:  ['19 4 62 92', 'M25 5 L75 5 L80 95 L58 95 L50 35 L42 95 L20 95 Z'],
  shorts: ['17 4 66 52', 'M25 5 L75 5 L82 55 L56 55 L50 30 L44 55 L18 55 Z'],
  skirt:  ['14 4 72 62', 'M30 5 L70 5 L85 65 L15 65 Z'],
  dress:  ['9 3 82 94', 'M35 4 L42 4 Q50 12 58 4 L65 4 L66 30 L60 36 L88 96 L12 96 L40 36 L34 30 Z'],
  shoe:   ['4 39 92 37', 'M5 60 L40 55 L60 40 L95 60 L95 75 L5 75 Z'],
  boot:   ['8 9 84 68', 'M30 10 L60 10 L60 52 L90 62 L90 76 L10 76 L10 62 L30 58 Z'],
  cap:    ['9 21 90 50', 'M10 60 Q12 25 50 22 Q88 25 90 60 L98 66 L60 70 L10 66 Z'],
  beanie: ['14 14 72 68', 'M18 66 Q16 18 50 15 Q84 18 82 66 L82 80 L18 80 Z'],
  buds:   ['25 25 50 56', 'M30 30 Q42 26 44 40 L42 80 L36 80 L35 48 Q26 46 30 30 Z M70 30 Q58 26 56 40 L58 80 L64 80 L65 48 Q74 46 70 30 Z'],
  watch:  ['21 4 58 92', 'M38 5 L62 5 L62 30 Q78 34 78 50 Q78 66 62 70 L62 95 L38 95 L38 70 Q22 66 22 50 Q22 34 38 30 Z'],
  belt:   ['1 33 98 34', 'M2 40 L98 40 L98 60 L2 60 Z M70 34 L86 34 L86 66 L70 66 Z'],
  bag:    ['9 9 82 82', 'M14 34 L86 34 L90 90 L10 90 Z M35 34 Q35 10 50 10 Q65 10 65 34'],
  generic:['9 9 82 82', 'M10 10 L90 10 L90 90 L10 90 Z'],
};

const KIND = {
  'oxford shirt': 'shirt', 'dress shirt': 'shirt', 'casual shirt': 'shirt', 'short-sleeve shirt': 'shirt', 'overshirt': 'shirt', 'blouse': 'shirt', 'polo': 'tee',
  't-shirt': 'tee', 'long-sleeve tee': 'tee', 'tank top': 'tee', 'henley': 'tee', 'crop top': 'tee', 'turtleneck': 'knit', 'mock neck': 'knit',
  'crewneck sweater': 'knit', 'v-neck sweater': 'knit', 'quarter-zip': 'knit', 'cardigan': 'knit', 'sweatshirt': 'knit', 'fleece': 'knit',
  'hoodie': 'hoodie', 'zip hoodie': 'hoodie', 'sweater vest': 'vest', 'gilet': 'vest',
  'blazer': 'coat', 'suit jacket': 'coat', 'trench coat': 'coat', 'wool coat': 'coat', 'parka': 'coat', 'puffer jacket': 'jacket', 'rain jacket': 'jacket',
  'denim jacket': 'jacket', 'bomber jacket': 'jacket', 'leather jacket': 'jacket', 'chore jacket': 'jacket',
  'jeans': 'pants', 'chinos': 'pants', 'trousers': 'pants', 'suit trousers': 'pants', 'cargo pants': 'pants', 'joggers': 'pants', 'leggings': 'pants',
  'shorts': 'shorts', 'skirt': 'skirt', 'dress': 'dress', 'jumpsuit': 'dress',
  'sneakers': 'shoe', 'running shoes': 'shoe', 'loafers': 'shoe', 'derbies': 'shoe', 'oxfords': 'shoe', 'sandals': 'shoe', 'heels': 'shoe',
  'boots': 'boot', 'chelsea boots': 'boot',
  'cap': 'cap', 'bucket hat': 'cap', 'beanie': 'beanie', 'fedora': 'cap', 'earbuds': 'buds', 'headphones': 'buds',
  'watch': 'watch', 'smartwatch': 'watch', 'belt': 'belt', 'bag': 'bag', 'tote bag': 'bag', 'crossbody bag': 'bag', 'backpack': 'bag',
};

export const kindFor = (sub) => KIND[sub] || 'generic';

/** Data-URL SVG for a garment. ghost = dashed outline for pieces you don't own. Returns { url, aspect }. */
export function silhouette(sub, hex, { ghost = false } = {}) {
  const [view, d] = SHAPES[kindFor(sub)];
  const [, , w, h] = view.split(' ').map(Number);
  const stroke = ghost ? 'stroke="rgba(0,0,0,.55)" stroke-width="1.6" stroke-dasharray="4 3"' : 'stroke="rgba(0,0,0,.25)" stroke-width="1"';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="${w * 4}" height="${h * 4}"><path d="${d}" fill="${hex}" fill-opacity="${ghost ? 0.82 : 1}" ${stroke}/></svg>`;
  return { url: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg), aspect: w / h };
}
