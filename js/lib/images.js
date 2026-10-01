// Image pipeline: load → (remove background in-browser) → trim → resize → WebP. Plus colour extraction.
import { loadBackgroundRemoval } from './deps.js';
import { extractPalette } from '../styling/color.js';

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not load image'));
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  });
}

function canvasFor(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const toBlob = (canvas, type = 'image/webp', q = 0.86) => new Promise((res) => canvas.toBlob((b) => res(b), type, q));

/** Downscale a file so background removal and uploads stay fast. */
export async function prepare(file, max = 1280) {
  const img = await loadImage(file);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvasFor(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return toBlob(c, 'image/jpeg', 0.9);
}

let bgLib = null;
/** Runs entirely in the browser (first use downloads the model, then it's cached). */
export async function removeBackground(blob, onProgress) {
  bgLib ||= await loadBackgroundRemoval();
  const fn = bgLib.removeBackground || bgLib.default;
  return fn(blob, {
    output: { format: 'image/png' },
    progress: (key, current, total) => { // must return nothing
      onProgress?.(key.startsWith('fetch') ? `Downloading cut-out model ${Math.round((current / total) * 100)}%` : 'Cutting out…');
    },
  });
}

/** Crop transparent margins, fit into max px, return WebP blob + palette. */
export async function finalize(blob, max = 800) {
  const img = await loadImage(blob);
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = canvasFor(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, transparent = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (data[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    else transparent++;
  }
  const hasAlpha = transparent > (W * H) / 4 * 0.05;
  if (!hasAlpha || x1 <= x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const pad = Math.round(Math.max(W, H) * 0.02);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const s = Math.min(1, max / Math.max(cw, ch));
  const out = canvasFor(Math.round(cw * s), Math.round(ch * s));
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
  const pixels = octx.getImageData(0, 0, out.width, out.height).data;
  // without a cut-out, sample the centre so the background doesn't dominate the palette
  let palette;
  if (hasAlpha) palette = extractPalette(pixels);
  else {
    const cx = Math.round(out.width * 0.25), cy = Math.round(out.height * 0.25);
    palette = extractPalette(octx.getImageData(cx, cy, Math.round(out.width / 2), Math.round(out.height / 2)).data);
  }
  return { blob: await toBlob(out), palette, hasAlpha, width: out.width, height: out.height };
}

/** Small JPEG data URL on white for sending to the vision model. */
export async function toAiDataUrl(blobOrUrl, max = 640) {
  const img = await loadImage(blobOrUrl);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvasFor(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
