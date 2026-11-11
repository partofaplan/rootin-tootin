// A tiny software rasterizer for building shaded pixel art in code.
// Pure JS (no DOM): shapes are drawn into an RGBA buffer and shaded with a
// colour ramp (dark -> light) as if lit from the upper left, which gives the
// banded, rounded look of 16-bit era sprites.

const LIGHT = [-0.5, -0.62, 0.6];

const rgbCache = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = rgbCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [n >> 16, (n >> 8) & 255, n & 255];
    rgbCache.set(c, v);
  }
  return v;
}

// Picks a ramp colour for a surface whose normal has the given dot product with the light.
function shade(ramp, dot) {
  const t = Math.max(0, Math.min(0.999, dot * 0.6 + 0.3));
  return ramp[Math.floor(t * ramp.length)];
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  px(x, y, c, a = 255) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = (y * this.w + x) * 4, [r, g, b] = rgb(c);
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
    return this;
  }

  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
    return this;
  }

  // Flat-faced block: lit top/left edges, shaded bottom/right edges.
  box(x, y, w, h, ramp) {
    const mid = Math.floor(ramp.length / 2);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let k = mid;
        if (j === 0 || i === 0) k++;
        if (j === h - 1 || i === w - 1) k--;
        this.px(x + i, y + j, ramp[Math.max(0, Math.min(ramp.length - 1, k))]);
      }
    }
    return this;
  }

  // Shaded ellipse ("ball").
  ball(cx, cy, rx, ry, ramp) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        this.px(x, y, shade(ramp, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]));
      }
    }
    return this;
  }

  // Shaded capsule from (x0,y0) to (x1,y1); radius r0 tapering to r1.
  limb(x0, y0, x1, y1, r0, ramp, r1 = r0) {
    const rm = Math.max(r0, r1);
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y0, y1) - rm); y <= Math.ceil(Math.max(y0, y1) + rm); y++) {
      for (let x = Math.floor(Math.min(x0, x1) - rm); x <= Math.ceil(Math.max(x0, x1) + rm); x++) {
        const px = x + 0.5, py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
        const r = r0 + (r1 - r0) * t;
        const nx = (px - (x0 + dx * t)) / r, ny = (py - (y0 + dy * t)) / r;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        this.px(x, y, shade(ramp, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]));
      }
    }
    return this;
  }

  // Upright cylinder with flat ends (cans, posts).
  cyl(x, y, w, h, ramp) {
    for (let i = 0; i < w; i++) {
      const nx = (i + 0.5 - w / 2) / (w / 2);
      const c = shade(ramp, nx * LIGHT[0] + Math.sqrt(1 - nx * nx) * 0.75);
      for (let j = 0; j < h; j++) this.px(x + i, y + j, c);
    }
    return this;
  }

  // Filled polygon. With a ramp (array) it is shaded from the top-left corner
  // of its bounding box down to the bottom-right; with a colour it is flat.
  // erase = true punches a hole instead.
  poly(pts, fill, erase = false) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const ramp = Array.isArray(fill) && typeof fill[0] === 'string' ? fill : null;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (!inside) continue;
        if (erase) { this.px(x, y, '#000000', 0); continue; }
        if (!ramp) { this.px(x, y, fill); continue; }
        const fx = (px - x0) / (x1 - x0 || 1), fy = (py - y0) / (y1 - y0 || 1);
        const t = Math.max(0, Math.min(0.999, 0.85 - 0.55 * fy - 0.3 * fx));
        this.px(x, y, ramp[Math.floor(t * ramp.length)]);
      }
    }
    return this;
  }

  // Copy of this sprite with a 1px dark outline tinted by the neighbouring
  // colour ("selective outlining"), so sprites read against any background.
  outlined() {
    const out = new Pix(this.w + 2, this.h + 2);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const sx = x - 1, sy = y - 1;
        if (this.alpha(sx, sy)) {
          const i = (sy * this.w + sx) * 4;
          out.px(x, y, [this.data[i], this.data[i + 1], this.data[i + 2]]);
          continue;
        }
        let best = null, bestLum = Infinity;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!this.alpha(sx + ox, sy + oy)) continue;
          const i = ((sy + oy) * this.w + sx + ox) * 4;
          const lum = this.data[i] * 3 + this.data[i + 1] * 6 + this.data[i + 2];
          if (lum < bestLum) { bestLum = lum; best = i; }
        }
        if (best !== null) {
          out.px(x, y, [this.data[best] * 0.3 + 10, this.data[best + 1] * 0.26 + 6, this.data[best + 2] * 0.32 + 14]);
        }
      }
    }
    out.meta = this.meta;
    return out;
  }

  mirrored() {
    const out = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const s = (y * this.w + x) * 4, d = (y * this.w + (this.w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) out.data[d + k] = this.data[s + k];
      }
    }
    return out;
  }

  // Solid-colour silhouette (hit flash).
  silhouette(c = '#ffffff') {
    const out = new Pix(this.w, this.h), [r, g, b] = rgb(c);
    for (let i = 0; i < this.data.length; i += 4) {
      if (!this.data[i + 3]) continue;
      out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
    }
    return out;
  }

  // Number of opaque pixels (used by tests).
  count() {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i]) n++;
    return n;
  }
}

// Small deterministic PRNG so generated art is identical on every load.
export function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
}
