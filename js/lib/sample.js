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
};
const svg = (shape, hex) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${SHAPES[shape]}" fill="${hex}" stroke="rgba(0,0,0,.25)" stroke-width="1"/></svg>`);

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
];

export async function loadSampleCloset() {
  for (const [name, sub, shape, hex, cname, material, style_tags] of SAMPLE) {
    await addItem({ name, subcategory: sub, category: SUBCATEGORIES[sub].category, colors: [{ hex, name: cname, share: 1 }],
      material, style_tags, image_url: svg(shape, hex), price: 40, notes: 'Sample item' });
  }
}
