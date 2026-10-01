// Sample closet (simple silhouettes) so the app can be tried before photographing anything.
import { addItem } from './store.js';
import { SUBCATEGORIES } from '../styling/taxonomy.js';

const SHAPES = {
  shirt: 'M20 20 L40 8 L50 16 L60 8 L80 20 L95 50 L82 54 L80 96 L20 96 L18 54 L5 50 Z',
  tee: 'M20 20 L40 10 L60 10 L80 20 L95 45 L80 50 L78 95 L22 95 L20 50 L5 45 Z',
  knit: 'M18 18 L38 8 Q50 16 62 8 L82 18 L96 80 L84 84 L80 96 L20 96 L16 84 L4 80 Z',
  bottom: 'M25 5 L75 5 L80 95 L58 95 L50 35 L42 95 L20 95 Z',
  shoes: 'M5 60 L40 55 L60 40 L95 60 L95 75 L5 75 Z',
  coat: 'M15 15 L38 5 L62 5 L85 15 L97 70 L82 72 L80 98 L20 98 L18 72 L3 70 Z',
  cap: 'M10 60 Q12 25 50 22 Q88 25 90 60 L98 66 L60 70 L10 66 Z',
  buds: 'M30 30 Q42 26 44 40 L42 80 L36 80 L35 48 Q26 46 30 30 Z M70 30 Q58 26 56 40 L58 80 L64 80 L65 48 Q74 46 70 30 Z',
  watch: 'M38 5 L62 5 L62 30 Q78 34 78 50 Q78 66 62 70 L62 95 L38 95 L38 70 Q22 66 22 50 Q22 34 38 30 Z',
  belt: 'M2 40 L98 40 L98 60 L2 60 Z M70 34 L86 34 L86 66 L70 66 Z',
};
// tight view boxes so the images have real garment proportions, like trimmed photos
const VIEW = { shirt: '4 7 92 90', tee: '4 9 92 87', knit: '3 7 94 90', bottom: '19 4 62 92', shoes: '4 39 92 37', coat: '2 4 96 95',
  cap: '9 21 90 50', buds: '25 25 50 56', watch: '21 4 58 92', belt: '1 33 98 34' };
const svg = (shape, hex) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW[shape]}"><path d="${SHAPES[shape]}" fill="${hex}" stroke="rgba(0,0,0,.25)" stroke-width="1"/></svg>`);

const SAMPLE = [
  ['White oxford shirt', 'oxford shirt', 'shirt', '#f4f4f2', 'white', 'cotton', ['classic', 'preppy']],
  ['Light blue shirt', 'casual shirt', 'shirt', '#a9c1dc', 'light blue', 'cotton', ['classic']],
  ['White tee', 't-shirt', 'tee', '#f7f7f7', 'white', 'cotton', ['minimal']],
  ['Black tee', 't-shirt', 'tee', '#141414', 'black', 'cotton', ['minimal', 'streetwear']],
  ['Navy crewneck', 'crewneck sweater', 'knit', '#1f2a44', 'navy', 'wool', ['classic', 'smart casual']],
  ['Bottle green crewneck', 'crewneck sweater', 'knit', '#2f6b3a', 'green', 'wool', ['preppy']],
  ['Grey hoodie', 'hoodie', 'knit', '#9a9a9a', 'grey', 'cotton', ['streetwear']],
  ['Dark jeans', 'jeans', 'bottom', '#2b3956', 'dark denim', 'denim', ['classic']],
  ['Beige chinos', 'chinos', 'bottom', '#c8b28d', 'beige', 'cotton', ['preppy', 'smart casual']],
  ['Charcoal trousers', 'trousers', 'bottom', '#3a3a3c', 'charcoal', 'wool', ['business']],
  ['White sneakers', 'sneakers', 'shoes', '#f2f2f2', 'white', 'leather', ['minimal']],
  ['Brown loafers', 'loafers', 'shoes', '#4a2c1a', 'brown', 'leather', ['preppy', 'old money']],
  ['Camel wool coat', 'wool coat', 'coat', '#b08d68', 'camel', 'wool', ['classic']],
  ['Denim jacket', 'denim jacket', 'coat', '#5a7ca8', 'mid denim', 'denim', ['classic', 'streetwear']],
  ['Navy blazer', 'blazer', 'coat', '#22304f', 'navy', 'wool', ['classic', 'business']],
  ['Black cap', 'cap', 'cap', '#1a1a1a', 'black', 'cotton', ['streetwear']],
  ['AirPods', 'earbuds', 'buds', '#f4f4f4', 'white', 'synthetic', ['minimal']],
  ['Silver watch', 'watch', 'watch', '#b8bcc2', 'silver', 'synthetic', ['classic']],
  ['Brown leather belt', 'belt', 'belt', '#4a2c1a', 'brown', 'leather', ['classic']],
];

export async function loadSampleCloset() {
  for (const [name, sub, shape, hex, cname, material, style_tags] of SAMPLE) {
    await addItem({ name, subcategory: sub, category: SUBCATEGORIES[sub].category, colors: [{ hex, name: cname, share: 1 }],
      material, style_tags, image_url: svg(shape, hex), price: 40, notes: 'Sample item' });
  }
}
