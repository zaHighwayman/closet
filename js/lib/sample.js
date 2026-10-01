// Sample closet (simple silhouettes) so the app can be tried before photographing anything.
import { addItem } from './store.js';
import { SUBCATEGORIES } from '../styling/taxonomy.js';
import { silhouette } from './silhouettes.js';

const SAMPLE = [
  ['White oxford shirt', 'oxford shirt', '#f4f4f2', 'white', 'cotton', ['classic', 'preppy']],
  ['Light blue shirt', 'casual shirt', '#a9c1dc', 'light blue', 'cotton', ['classic']],
  ['White tee', 't-shirt', '#f7f7f7', 'white', 'cotton', ['minimal']],
  ['Black tee', 't-shirt', '#141414', 'black', 'cotton', ['minimal', 'streetwear']],
  ['Navy crewneck', 'crewneck sweater', '#1f2a44', 'navy', 'wool', ['classic', 'smart casual']],
  ['Bottle green crewneck', 'crewneck sweater', '#2f6b3a', 'green', 'wool', ['preppy']],
  ['Grey hoodie', 'hoodie', '#9a9a9a', 'grey', 'cotton', ['streetwear']],
  ['Dark jeans', 'jeans', '#2b3956', 'dark denim', 'denim', ['classic']],
  ['Beige chinos', 'chinos', '#c8b28d', 'beige', 'cotton', ['preppy', 'smart casual']],
  ['Charcoal trousers', 'trousers', '#3a3a3c', 'charcoal', 'wool', ['business']],
  ['White sneakers', 'sneakers', '#f2f2f2', 'white', 'leather', ['minimal']],
  ['Brown loafers', 'loafers', '#4a2c1a', 'brown', 'leather', ['preppy', 'old money']],
  ['Camel wool coat', 'wool coat', '#b08d68', 'camel', 'wool', ['classic']],
  ['Denim jacket', 'denim jacket', '#5a7ca8', 'mid denim', 'denim', ['classic', 'streetwear']],
  ['Navy blazer', 'blazer', '#22304f', 'navy', 'wool', ['classic', 'business']],
  ['Black cap', 'cap', '#1a1a1a', 'black', 'cotton', ['streetwear']],
  ['AirPods', 'earbuds', '#f4f4f4', 'white', 'synthetic', ['minimal']],
  ['Silver watch', 'watch', '#b8bcc2', 'silver', 'synthetic', ['classic']],
  ['Brown leather belt', 'belt', '#4a2c1a', 'brown', 'leather', ['classic']],
];

export async function loadSampleCloset() {
  for (const [name, sub, hex, cname, material, style_tags] of SAMPLE) {
    const { url, aspect } = silhouette(sub, hex);
    await addItem({ name, subcategory: sub, category: SUBCATEGORIES[sub].category, colors: [{ hex, name: cname, share: 1 }],
      material, style_tags, image_url: url, aspect, price: 40, notes: 'Sample item' });
  }
}
