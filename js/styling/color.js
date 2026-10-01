// Color theory helpers: neutrals, hue relationships, value contrast.

export function hexToRgb(hex) {
  let h = String(hex || '#808080').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 128, g: 128, b: 128 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h * 60, s, l };
}

const NEUTRAL_NAMES = /\b(black|white|ivory|cream|off[- ]?white|ecru|grey|gray|charcoal|navy|beige|tan|camel|khaki|stone|taupe|sand|oatmeal|denim|indigo|chambray|brown|chocolate|olive)\b/i;

// Classic menswear/womenswear neutrals: achromatics, navy, earth tones, denim, olive.
export function isNeutral(color) {
  const { h, s, l } = hexToHsl(color.hex);
  if (color.name && NEUTRAL_NAMES.test(color.name)) return true;
  if (s < 0.15 || l < 0.13 || l > 0.93) return true;
  if (h >= 200 && h <= 245 && l < 0.32) return true;                 // navy
  if (h >= 20 && h <= 50 && s < 0.5 && l > 0.5) return true;          // beige / khaki / camel
  if (h >= 15 && h <= 40 && l < 0.35 && s < 0.6) return true;         // browns
  if (h >= 200 && h <= 225 && s < 0.45 && l >= 0.3 && l <= 0.6) return true; // denim blue
  if (h >= 60 && h <= 95 && s < 0.4 && l < 0.45) return true;         // olive
  return false;
}

export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function luminance(hex) {
  // relative luminance (WCAG), 0..1
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// Perceived lightness 0..1 (L* / 100)
export function lightness(hex) {
  const Y = luminance(hex);
  const L = Y <= 216 / 24389 ? Y * (24389 / 27) : Math.cbrt(Y) * 116 - 16;
  return L / 100;
}

// Group chromatic areas into hue families (within 25°), weighted by area.
export function hueFamilies(areas) {
  const fams = [];
  for (const a of areas) {
    const { h, s } = hexToHsl(a.hex);
    const f = fams.find((x) => hueDistance(x.h, h) <= 25);
    if (f) { f.area += a.area; f.h = (f.h * (f.area - a.area) + h * a.area) / f.area; f.s = Math.max(f.s, s); f.names.add(a.name); }
    else fams.push({ h, s, area: a.area, names: new Set([a.name]) });
  }
  return fams.sort((x, y) => y.area - x.area);
}

// Classify how a set of hue families relate.
export function harmonyType(fams) {
  if (fams.length <= 1) return fams.length ? 'monochrome' : 'neutral';
  const hs = fams.map((f) => f.h);
  const maxD = Math.max(...hs.flatMap((a) => hs.map((b) => hueDistance(a, b))));
  if (fams.length === 2) {
    const d = hueDistance(hs[0], hs[1]);
    if (d <= 60) return 'analogous';
    if (d >= 150) return 'complementary';
    if (d >= 105 && d <= 135) return 'triadic';
    return 'discordant';
  }
  if (maxD <= 75) return 'analogous';
  if (fams.length === 3) {
    const ds = [hueDistance(hs[0], hs[1]), hueDistance(hs[1], hs[2]), hueDistance(hs[0], hs[2])].sort((a, b) => a - b);
    if (ds.every((d) => d >= 95 && d <= 145)) return 'triadic';
    // split complementary: two close to each other, both roughly opposite the third
    if (ds[0] <= 70 && ds[1] >= 130) return 'split complementary';
  }
  return 'discordant';
}

export function colorName(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (l < 0.12) return 'black';
  if (l > 0.92) return 'white';
  if (s < 0.12) return l < 0.35 ? 'charcoal' : l < 0.7 ? 'grey' : 'light grey';
  if (h >= 200 && h <= 245 && l < 0.32) return 'navy';
  if (h >= 20 && h <= 50 && s < 0.5 && l > 0.55) return l > 0.78 ? 'cream' : 'beige';
  if (h >= 15 && h <= 40 && l < 0.35) return 'brown';
  if (h >= 60 && h <= 95 && s < 0.4 && l < 0.45) return 'olive';
  const names = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [160, 'green'], [195, 'teal'], [250, 'blue'], [285, 'purple'], [335, 'pink'], [360, 'red']];
  return names.find(([max]) => h <= max)[1];
}

// Dominant colors from RGBA pixel data (ignores transparent pixels). Small k-means.
export function extractPalette(data, k = 3) {
  const px = [];
  for (let i = 0; i < data.length; i += 4 * 3) {
    if (data[i + 3] < 200) continue;
    px.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!px.length) return [];
  let cents = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < 10; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      let best = 0, bd = Infinity;
      cents.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } });
      assign[i] = best; const s = sums[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    cents = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[j]));
  }
  const counts = cents.map((_, j) => assign.filter((a) => a === j).length);
  const out = cents.map((c, j) => ({ hex: rgbToHex({ r: c[0], g: c[1], b: c[2] }), share: counts[j] / px.length }))
    .filter((c) => c.share > 0.08).sort((a, b) => b.share - a.share);
  // merge near-identical clusters
  const merged = [];
  for (const c of out) {
    const m = merged.find((x) => { const a = hexToRgb(x.hex), b = hexToRgb(c.hex); return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 40; });
    if (m) m.share += c.share; else merged.push({ ...c });
  }
  return merged.map((c) => ({ ...c, name: colorName(c.hex), share: Math.round(c.share * 100) / 100 }));
}
