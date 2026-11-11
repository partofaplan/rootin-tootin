// Low-level drawing helpers: sprite baking, bitmap font, pixel circles.

import { PAL, FONT } from './sprites.js';

export const OUTLINE = PAL.k;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function mirrored(src) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

// Turns ASCII pixel rows into canvases: normal, mirrored, and all-white
// (hit flash) versions. A 1px dark outline is added automatically so sprites
// read against any background.
export function bakeSprite(rows, { outline = true } = {}) {
  const h = rows.length, w = rows[0].length;
  const pad = outline ? 1 : 0;
  const c = makeCanvas(w + pad * 2, h + pad * 2);
  const white = makeCanvas(c.width, c.height);
  const g = c.getContext('2d'), gw = white.getContext('2d');
  if (outline) {
    g.fillStyle = OUTLINE;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rows[y][x] === '.') continue;
        g.fillRect(x, y + 1, 3, 1);
        g.fillRect(x + 1, y, 1, 3);
      }
    }
  }
  gw.drawImage(c, 0, 0);
  gw.fillStyle = PAL.w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = PAL[rows[y][x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x + pad, y + pad, 1, 1);
      gw.fillRect(x + pad, y + pad, 1, 1);
    }
  }
  return { c, f: mirrored(c), white, whiteF: mirrored(white), w: c.width, h: c.height, pad };
}

// x,y is the top-left of the sprite's own pixels (the outline hangs outside).
export function drawSprite(ctx, spr, x, y, flip = false, flash = false) {
  const img = flash ? (flip ? spr.whiteF : spr.white) : flip ? spr.f : spr.c;
  ctx.drawImage(img, Math.round(x) - spr.pad, Math.round(y) - spr.pad);
}

export function drawSpriteScaled(ctx, spr, x, y, scale, flip = false) {
  ctx.drawImage(flip ? spr.f : spr.c, Math.round(x), Math.round(y), spr.w * scale, spr.h * scale);
}

// ---- bitmap font ---------------------------------------------------------------
const glyphCache = new Map();
function glyph(ch, color) {
  const key = ch + color;
  let c = glyphCache.get(key);
  if (!c) {
    const rows = (FONT[ch] || FONT['?']).split('/');
    c = makeCanvas(5, 7);
    const g = c.getContext('2d');
    g.fillStyle = color;
    rows.forEach((row, y) => {
      for (let x = 0; x < 5; x++) if (row[x] === '#') g.fillRect(x, y, 1, 1);
    });
    glyphCache.set(key, c);
  }
  return c;
}

export const textWidth = (str, scale = 1) => (String(str).length * 6 - 1) * scale;

export function drawText(ctx, str, x, y, { color = PAL.w, shadow = OUTLINE, scale = 1, align = 'left' } = {}) {
  str = String(str).toUpperCase();
  const width = textWidth(str, scale);
  if (align === 'center') x -= Math.floor(width / 2);
  else if (align === 'right') x -= width;
  x = Math.round(x);
  y = Math.round(y);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ') continue;
    const gx = x + i * 6 * scale;
    if (shadow) ctx.drawImage(glyph(ch, shadow), gx + scale, y + scale, 5 * scale, 7 * scale);
    ctx.drawImage(glyph(ch, color), gx, y, 5 * scale, 7 * scale);
  }
}

// Big two-tone logo lettering with a chunky outline and drop shadow.
export function drawLogo(ctx, str, cx, y, scale, top = PAL.y, bottom = PAL.o) {
  const x0 = Math.round(cx - textWidth(str, scale) / 2);
  const W = 5 * scale, H = 7 * scale;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === ' ') continue;
      const gx = x0 + i * 6 * scale;
      if (pass === 0) {
        const dark = glyph(ch, OUTLINE);
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [2, 3], [3, 3], [3, 2]]) {
          ctx.drawImage(dark, gx + ox, y + oy, W, H);
        }
      } else {
        ctx.drawImage(glyph(ch, top), gx, y, W, H);
        ctx.drawImage(glyph(ch, bottom), 0, 4, 5, 3, gx, y + 4 * scale, W, 3 * scale);
        ctx.drawImage(glyph(ch, PAL.w), 0, 0, 5, 1, gx, y, W, Math.max(1, scale >> 1));
      }
    }
  }
}

// ---- pixel circles ---------------------------------------------------------------
export function fillCircle(ctx, cx, cy, r, fill) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  if (fill) ctx.fillStyle = fill;
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

export function fillRing(ctx, cx, cy, rOuter, rInner, fill) {
  cx = Math.round(cx); cy = Math.round(cy); rOuter = Math.round(rOuter); rInner = Math.max(0, Math.round(rInner));
  if (fill) ctx.fillStyle = fill;
  for (let dy = -rOuter; dy <= rOuter; dy++) {
    const hw = Math.floor(Math.sqrt(rOuter * rOuter - dy * dy));
    if (Math.abs(dy) >= rInner) {
      ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    } else {
      const hi = Math.floor(Math.sqrt(rInner * rInner - dy * dy));
      ctx.fillRect(cx - hw, cy + dy, hw - hi, 1);
      ctx.fillRect(cx + hi + 1, cy + dy, hw - hi, 1);
    }
  }
}

// 2x2 checkerboard fill, for retro "transparency".
export function ditherPattern(ctx, color) {
  const c = makeCanvas(2, 2);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  g.fillRect(1, 1, 1, 1);
  return ctx.createPattern(c, 'repeat');
}
