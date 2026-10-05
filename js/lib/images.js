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

// ------------------------------------------------------------------ shop product photos (scout)

/** Load a cross-origin image for pixel access (Shopify's CDN allows this). */
function loadCors(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image failed'));
    img.src = url;
  });
}

/** Is this a packshot? A plain, even studio background all around the edge (models/lifestyle shots aren't). */
function backgroundInfo(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const px = [];
  const at = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  for (let x = 0; x < w; x += 2) { px.push(at(x, 0), at(x, h - 1), at(x, 1), at(x, h - 2)); }
  for (let y = 0; y < h; y += 2) { px.push(at(0, y), at(w - 1, y), at(1, y), at(w - 2, y)); }
  const mean = [0, 1, 2].map((k) => px.reduce((s, p) => s + p[k], 0) / px.length);
  const dist = (p) => Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]);
  const spread = px.reduce((s, p) => s + dist(p), 0) / px.length;
  const uniform = px.filter((p) => dist(p) < 22).length / px.length;
  // centre of the image vs background: tells if a flood fill could eat into the garment
  const cx = Math.floor(w * 0.35), cy = Math.floor(h * 0.35), cw = Math.floor(w * 0.3), ch = Math.floor(h * 0.3);
  const c = ctx.getImageData(cx, cy, cw, ch).data;
  let cr = 0, cg = 0, cb = 0, n = 0;
  for (let i = 0; i < c.length; i += 16) { cr += c[i]; cg += c[i + 1]; cb += c[i + 2]; n++; }
  const centre = [cr / n, cg / n, cb / n];
  return { mean, spread, uniform, contrast: dist(centre), packshot: uniform > 0.9 && spread < 14 };
}

/** Remove a flat background by flood-filling from the edges, with soft edges. */
function floodRemove(ctx, w, h, mean, tol) {
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  const bg = new Uint8Array(w * h);
  const near = (i, t) => Math.hypot(d[i * 4] - mean[0], d[i * 4 + 1] - mean[1], d[i * 4 + 2] - mean[2]) < t;
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !near(i, tol)) continue;
    bg[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) { d[i * 4 + 3] = 0; continue; }
    // feather pixels next to the background that are still close to its colour
    const x = i % w, y = (i / w) | 0;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    if (edge) {
      const dd = Math.hypot(d[i * 4] - mean[0], d[i * 4 + 1] - mean[1], d[i * 4 + 2] - mean[2]);
      d[i * 4 + 3] = Math.max(60, Math.min(255, (dd / (tol * 2.2)) * 255));
    }
  }
  ctx.putImageData(im, 0, 0);
}

/**
 * Pick the best packshot from a product's photos and cut it out.
 * Returns { blob, palette, width, height, source } or null if there's no clean product-only photo.
 */
export async function cutoutProduct(urls, onProgress) {
  for (const url of urls.filter(Boolean).slice(0, 5)) {
    let img;
    try { img = await loadCors(url); } catch { continue; }
    const s = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const info = backgroundInfo(ctx, w, h);
    if (!info.packshot) continue; // a model / lifestyle shot: try the product's next photo
    let blob;
    if (info.contrast > 45) {
      floodRemove(ctx, w, h, info.mean, Math.max(20, info.spread * 3 + 12));
      blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    } else {
      // garment is close to the background colour (white tee on white): use the AI cut-out instead
      onProgress?.('Cutting out (AI)…');
      const src = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      blob = await removeBackground(src, onProgress);
    }
    const fin = await finalize(blob, 600);
    if (!fin.hasAlpha) continue;
    return { ...fin, source: url };
  }
  return null;
}
