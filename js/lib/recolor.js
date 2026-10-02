// Recolour a light-grey product photo to any colour, keeping its real shading and texture.
// Catalog photos ship as neutral grey cut-outs (img/catalog/*.webp); each colour is made on the fly.
import { hexToHsl } from '../styling/color.js';

const cache = new Map(); // `${src}|${hex}` -> Promise<dataURL>

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function recolor(src, hex) {
  const key = `${src}|${hex}`;
  if (!cache.has(key)) cache.set(key, new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
      // average brightness of the garment, so shading becomes +/- offsets around the target colour
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; n++; }
      const mean = n ? sum / n : 0.7;
      const { h, s, l } = hexToHsl(hex);
      const depth = l < 0.3 ? 0.6 : l > 0.85 ? 0.7 : 0.9; // keep folds visible without washing out darks/lights
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const L = Math.max(0.02, Math.min(0.97, l + (lum - mean) * depth));
        const [r, g, b] = hslToRgb(h, s, L);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
      ctx.putImageData(im, 0, 0);
      resolve(c.toDataURL('image/webp', 0.85));
    };
    img.onerror = () => { cache.delete(key); reject(new Error('photo missing: ' + src)); };
    img.src = src;
  }));
  return cache.get(key);
}
