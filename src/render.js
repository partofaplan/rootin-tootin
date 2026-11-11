// All drawing: parallax background, tiles, entities, HUD and menu screens.

import { PAL, RAMP, buildSprites, buildTiles, cloud } from './sprites.js';
import { TILE, tileAt } from './level.js';
import { VIEW_W, VIEW_H, MAX_HP, MAX_FARTS, CLIP, RELOAD_FRAMES } from './game.js';
import { ACTIONS, SLOTS, bindingName } from './input.js';
import { TITLE_MENU, PAUSE_MENU, CTL, CTL_RESET_ROW, CTL_BACK_ROW, INITIALS } from './ui.js';
import { MAX_SCORES } from './hiscores.js';
import {
  makeCanvas, pixToCanvas, bakeSprite, drawSprite, drawSpriteScaled, drawText, drawLogo, textWidth,
  fillCircle, fillRing, LOGO_GOLD, LOGO_GAS, LOGO_RED,
} from './gfx.js';

const S = {}; // baked sprites
const bg = {}; // baked background layers
const tiles = {}; // baked 16x16 tiles
const BG_W = 512;
const HORIZON = 178;
const SUN_X = 226, SUN_Y = 64; // clear of the HUD and the title logo

export function initRender() {
  for (const [name, pix] of Object.entries(buildSprites())) S[name] = bakeSprite(pix);
  for (const [name, variants] of Object.entries(buildTiles())) tiles[name] = variants.map(pixToCanvas);
  bg.sky = bakeSky();
  bg.clouds = bakeClouds();
  bg.far = bakeFar();
  bg.mid = bakeMid();
  bg.dunes = bakeDunes();
}

// ---- background baking -------------------------------------------------------------
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// Vertical gradient drawn as thin solid bands, like a 16-bit console's
// per-scanline colour changes. stops: [[0..1, '#rrggbb'], ...]
function gradient(g, x, y, w, h, stops, band = 2) {
  for (let j = 0; j < h; j += band) {
    const t = j / Math.max(1, h - band);
    let i = 0;
    while (i + 2 < stops.length && t > stops[i + 1][0]) i++;
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
    const a = hex(c0), b = hex(c1);
    g.fillStyle = `rgb(${a.map((v, n) => Math.round(v + (b[n] - v) * k)).join(',')})`;
    g.fillRect(x, y + j, w, Math.min(band, h - j));
  }
}

function bakeSky() {
  const c = makeCanvas(VIEW_W, VIEW_H), g = c.getContext('2d');
  gradient(g, 0, 0, VIEW_W, VIEW_H, [
    [0, '#16347a'], [0.26, '#2f6fc4'], [0.48, '#6fb0e8'], [0.62, '#bfe0f0'], [0.72, '#f8ecc8'], [1, '#f6d49a'],
  ]);
  for (const [r, a] of [[30, 0.1], [23, 0.16], [17, 0.3]]) { // sun glow
    g.globalAlpha = a;
    fillCircle(g, SUN_X, SUN_Y, r, '#fff6c8');
  }
  g.globalAlpha = 1;
  fillCircle(g, SUN_X, SUN_Y, 13, '#fff8d8');
  fillCircle(g, SUN_X, SUN_Y, 11, '#ffec9a');
  fillCircle(g, SUN_X - 3, SUN_Y - 3, 5, '#fff8d8');
  return c;
}

function bakeClouds() {
  const c = makeCanvas(BG_W, 130), g = c.getContext('2d');
  for (const [x, y, w, seed] of [[18, 16, 58, 3], [118, 52, 36, 7], [210, 6, 74, 11], [322, 40, 48, 5], [408, 72, 34, 9], [450, 14, 44, 13]]) {
    const img = pixToCanvas(cloud(w, seed));
    g.drawImage(img, x, y);
    if (x + w > BG_W) g.drawImage(img, x - BG_W, y);
  }
  return c;
}

// A flat-topped mesa with stepped sides, a sunlit rim, a shaded right face and strata.
function mesa(g, x, w, h, base, col, slope = 0.16) {
  for (let j = 0; j < h; j++) {
    const y = base - h + j;
    const inset = Math.floor((j * slope) / 2) * 2;
    const x0 = x - inset, ww = w + inset * 2, lit = Math.floor(ww * 0.7);
    g.fillStyle = j < 2 ? col.top : col.body;
    g.fillRect(x0, y, lit, 1);
    g.fillStyle = col.shade;
    g.fillRect(x0 + lit, y, ww - lit, 1);
    if (j > 3 && j % 7 === 4) {
      g.fillStyle = col.strata;
      g.fillRect(x0 + 2, y, ww - 4, 1);
    }
  }
}

function bakeFar() { // hazy, far-off mesas
  const c = makeCanvas(BG_W, VIEW_H), g = c.getContext('2d');
  const col = { body: '#b3a3d0', top: '#d3c6e8', shade: '#9a8abd', strata: '#a595c6' };
  for (const [x, w, h] of [[10, 80, 40], [128, 30, 52], [196, 120, 34], [352, 44, 60], [420, 70, 44]]) mesa(g, x, w, h, HORIZON, col, 0.1);
  gradient(g, 0, HORIZON, BG_W, VIEW_H - HORIZON, [[0, '#f0dcb8'], [1, '#e6c48e']]);
  return c;
}

function bakeMid() { // nearer, sunlit red-rock mesas and buttes
  const c = makeCanvas(BG_W, VIEW_H), g = c.getContext('2d');
  const base = 192;
  const col = { body: '#cf855c', top: '#f2bc88', shade: '#a25e44', strata: '#b56e4c' };
  for (const [x, w, h] of [[36, 64, 54], [150, 22, 70], [182, 14, 44], [262, 96, 64], [404, 30, 38], [458, 40, 58]]) mesa(g, x, w, h, base, col);
  gradient(g, 0, base, BG_W, VIEW_H - base, [[0, '#e4b878'], [1, '#d6a25e']]);
  g.fillStyle = '#c99a5e'; // scattered boulders
  for (const [x, w] of [[14, 9], [118, 6], [236, 11], [372, 7], [498, 8]]) {
    g.fillRect(x, base - 3, w, 3);
    g.fillRect(x + 1, base - 5, w - 3, 2);
  }
  return c;
}

function bakeDunes() {
  const c = makeCanvas(BG_W, VIEW_H), g = c.getContext('2d');
  const top = (x) => 199 - 11 * Math.sin((x / 256) * Math.PI * 2) - 6 * Math.sin((x / 128) * Math.PI * 2 + 1.3) - 3 * Math.sin((x / 64) * Math.PI * 2 + 0.5);
  for (let x = 0; x < BG_W; x++) {
    const y = Math.round(top(x));
    const lit = top(x + 2) - top(x - 2) <= 0.4; // slopes facing the sun
    g.fillStyle = lit ? '#ecc27e' : '#cb9a5a';
    g.fillRect(x, y, 1, 16);
    g.fillStyle = '#d8aa66';
    g.fillRect(x, y + 16 - (x % 2), 1, VIEW_H - y - 16);
    g.fillStyle = lit ? '#fde9b4' : '#e4bb7c';
    g.fillRect(x, y, 1, 2);
  }
  for (const x of [44, 172, 300, 334, 468]) { // small far-off cacti, clearly scenery
    const y = Math.round(top(x));
    g.fillStyle = '#6f9458';
    g.fillRect(x, y - 10, 3, 11);
    g.fillRect(x - 3, y - 7, 3, 2); g.fillRect(x - 3, y - 9, 2, 2);
    g.fillRect(x + 3, y - 5, 3, 2); g.fillRect(x + 4, y - 8, 2, 3);
    g.fillStyle = '#93b574';
    g.fillRect(x, y - 10, 1, 10);
  }
  return c;
}

function drawLayer(ctx, img, offset, y = 0) {
  const x = -(((Math.floor(offset) % BG_W) + BG_W) % BG_W);
  ctx.drawImage(img, x, y);
  if (x + BG_W < VIEW_W) ctx.drawImage(img, x + BG_W, y);
}

function drawBackdrop(ctx, cam, time = 0) {
  ctx.drawImage(bg.sky, 0, 0);
  drawLayer(ctx, bg.clouds, cam * 0.04 + time * 0.03, 8);
  drawLayer(ctx, bg.far, cam * 0.1);
  drawLayer(ctx, bg.mid, cam * 0.22);
  drawLayer(ctx, bg.dunes, cam * 0.45);
}

// ---- world -------------------------------------------------------------------------
function drawTile(ctx, kind, top, c, r) {
  const set = kind === 2 ? (top ? tiles.rockTop : tiles.rock) : top ? tiles.sandTop : tiles.sand;
  ctx.drawImage(set[(c * 7 + r * 13) & 1], c * TILE, r * TILE);
}

function drawTiles(ctx, L, cam) {
  for (const pit of L.pits) {
    const x = pit.col0 * TILE, w = (pit.col1 - pit.col0 + 1) * TILE, y = pit.topRow * TILE;
    if (x + w < cam || x > cam + VIEW_W) continue;
    gradient(ctx, x, y, w, VIEW_H - y, [[0, '#6a3a3c'], [0.35, '#3a1c30'], [1, '#150a1a']]);
  }
  const c0 = Math.max(0, Math.floor(cam / TILE)), c1 = Math.min(L.w - 1, Math.floor((cam + VIEW_W) / TILE));
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < L.h; r++) {
      const kind = tileAt(L, c, r);
      if (!kind) continue;
      drawTile(ctx, kind, !tileAt(L, c, r - 1), c, r);
      // exposed sides: sunlit on the left, in shadow on the right
      if (c > 0 && !tileAt(L, c - 1, r)) { ctx.fillStyle = 'rgba(255,240,200,0.3)'; ctx.fillRect(c * TILE, r * TILE, 1, TILE); }
      if (c < L.w - 1 && !tileAt(L, c + 1, r)) { ctx.fillStyle = 'rgba(40,10,20,0.3)'; ctx.fillRect(c * TILE + TILE - 2, r * TILE, 2, TILE); }
      if (r < L.h - 1 && !tileAt(L, c, r + 1)) { ctx.fillStyle = 'rgba(40,10,20,0.35)'; ctx.fillRect(c * TILE, r * TILE + TILE - 2, TILE, 2); }
    }
  }
}

function drawSaloon(ctx, goal, frame) {
  const x = goal.cx - 48, by = goal.by;
  const W = { dark: '#4a2614', shade: '#6e3a1c', mid: '#96592b', lit: '#b87440', pale: '#e8cf9a' };

  // false front and sign
  gradient(ctx, x + 8, by - 88, 80, 30, [[0, W.lit], [1, W.shade]], 3);
  ctx.fillStyle = W.dark; ctx.fillRect(x + 6, by - 90, 84, 3);
  ctx.fillStyle = W.lit; ctx.fillRect(x + 6, by - 91, 84, 1);
  ctx.fillStyle = W.dark; ctx.fillRect(x + 15, by - 83, 66, 18);
  ctx.fillStyle = W.pale; ctx.fillRect(x + 17, by - 81, 62, 14);
  ctx.fillStyle = '#fff3c8'; ctx.fillRect(x + 17, by - 81, 62, 1);
  drawText(ctx, 'SALOON', goal.cx, by - 78, { color: PAL.R, shadow: '#f4b06a', align: 'center' });

  // plank wall
  gradient(ctx, x, by - 60, 96, 60, [[0, W.lit], [0.5, W.mid], [1, W.shade]], 4);
  for (let px = x + 7; px < x + 96; px += 8) {
    ctx.fillStyle = W.dark; ctx.fillRect(px, by - 60, 1, 60);
    ctx.fillStyle = 'rgba(255,220,160,0.25)'; ctx.fillRect(px + 1, by - 60, 1, 60);
  }

  for (const wx of [x + 8, x + 70]) { // lamp-lit windows
    ctx.fillStyle = 'rgba(255,220,120,0.18)'; ctx.fillRect(wx - 4, by - 42, 26, 26);
    ctx.fillStyle = W.dark; ctx.fillRect(wx - 1, by - 39, 20, 20);
    gradient(ctx, wx, by - 38, 18, 18, [[0, '#fff3b0'], [1, '#f7a83c']], 3);
    ctx.fillStyle = W.dark; ctx.fillRect(wx + 8, by - 38, 2, 18); ctx.fillRect(wx, by - 30, 18, 2);
  }

  // doorway with batwing doors
  ctx.fillStyle = W.dark; ctx.fillRect(goal.x - 2, goal.y - 2, goal.w + 4, goal.h + 2);
  gradient(ctx, goal.x, goal.y, goal.w, goal.h, [[0, '#3a1c18'], [1, '#150a12']], 3);
  for (const dx of [0, 10]) {
    gradient(ctx, goal.x + dx, goal.y + 9, 8, 14, [[0, '#e0a868'], [1, '#a86a38']], 2);
    ctx.fillStyle = W.dark;
    ctx.fillRect(goal.x + dx + 1, goal.y + 12, 6, 1); ctx.fillRect(goal.x + dx + 1, goal.y + 16, 6, 1); ctx.fillRect(goal.x + dx + 1, goal.y + 20, 6, 1);
  }

  // porch roof, posts and boardwalk
  gradient(ctx, x - 8, by - 50, 112, 7, [[0, W.lit], [1, W.shade]], 2);
  ctx.fillStyle = W.dark; ctx.fillRect(x - 8, by - 43, 112, 2);
  ctx.fillStyle = 'rgba(30,10,20,0.3)'; ctx.fillRect(x, by - 41, 96, 4);
  for (const px of [x - 5, x + 98]) {
    ctx.fillStyle = W.mid; ctx.fillRect(px, by - 41, 3, 41);
    ctx.fillStyle = W.lit; ctx.fillRect(px, by - 41, 1, 41);
    ctx.fillStyle = W.dark; ctx.fillRect(px + 2, by - 41, 1, 41);
  }
  ctx.fillStyle = W.shade; ctx.fillRect(x - 8, by - 2, 112, 2);
  if ((frame >> 4) & 1) drawText(ctx, '~', goal.cx, goal.y - 14, { color: PAL.y, align: 'center' });
}

function drawCheckpoint(ctx, cp, frame) {
  const top = cp.y - 44;
  ctx.fillStyle = PAL.k; ctx.fillRect(cp.x - 2, top, 5, 44);
  ctx.fillStyle = '#96592b'; ctx.fillRect(cp.x - 1, top + 1, 3, 43);
  ctx.fillStyle = '#dba05c'; ctx.fillRect(cp.x - 1, top + 1, 1, 43);
  fillCircle(ctx, cp.x, top, 3, PAL.k);
  fillCircle(ctx, cp.x, top, 2, RAMP.gold[2]);
  const fy = cp.active ? top + 4 : cp.y - 18;
  for (let i = 0; i < 16; i++) { // rippling flag, column by column
    const wave = cp.active ? Math.round(Math.sin((frame / 6) + i / 2.5) * 1.5) : Math.round(i / 5);
    ctx.fillStyle = PAL.k; ctx.fillRect(cp.x + 3 + i, fy - 1 + wave, 1, 13);
    ctx.fillStyle = cp.active ? RAMP.red[i % 5 === 4 ? 1 : 2] : PAL.g; ctx.fillRect(cp.x + 3 + i, fy + wave, 1, 11);
    if (cp.active && i > 5 && i < 10) { ctx.fillStyle = RAMP.gold[2]; ctx.fillRect(cp.x + 3 + i, fy + 4 + wave, 1, 3); }
  }
}

// Soft blob of shade under anything standing on the ground.
function drawShadow(ctx, cx, y, w) {
  const x = Math.round(cx - w / 2);
  y = Math.round(y);
  ctx.fillStyle = 'rgba(30,12,24,0.3)';
  ctx.fillRect(x + 2, y - 1, w - 4, 1);
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
}

function enemySprite(e) {
  const alt = (e.anim >> 3) & 1;
  switch (e.type) {
    case 'scorpion': return alt ? S.scorpionB : S.scorpionA;
    case 'bandit': return alt && Math.abs(e.vx) > 0.05 ? S.banditB : S.banditA;
    default:
      if (e.state === 'leap') return S.chupaLeap;
      return alt && Math.abs(e.vx) > 0.05 ? S.chupaB : S.chupaA;
  }
}

function drawEnemy(ctx, e) {
  const spr = enemySprite(e);
  const w = spr.w - spr.pad * 2, h = spr.h - spr.pad * 2;
  const x = e.x + e.w / 2 - w / 2;
  let y = e.y + e.h - h;
  if (e.state === 'crouch') y += 2; // winding up to pounce
  if (e.onGround) drawShadow(ctx, e.x + e.w / 2, e.y + e.h, e.w + 4);
  drawSprite(ctx, spr, x, y, e.face < 0, e.flash > 0);
  if (e.state === 'aim' || e.state === 'crouch') {
    drawText(ctx, '!', e.x + e.w / 2 + 1, e.y - 16, { color: PAL.r, align: 'center' });
  }
}

function drawPlayer(ctx, w) {
  const p = w.player;
  if (w.state === 'gameover') return;
  if (w.state === 'play' && p.onGround) drawShadow(ctx, p.x + p.w / 2, p.y + p.h, 18);
  if (w.state === 'play' && p.inv > 0 && (w.frame >> 2) & 1) return; // blink while invulnerable
  let spr;
  if (w.state === 'dying' || p.stun > 0) spr = S.rudyHurt;
  else if (p.fartAnim > 10) spr = S.rudyFart;
  else if (!p.onGround) spr = S.rudyJump;
  else if (Math.abs(p.vx) > 0.3) spr = [S.rudyRunA, S.rudyRunB, S.rudyRunC, S.rudyRunB][Math.floor(p.anim / 5) % 4];
  else spr = S.rudyIdle;

  const flip = p.face < 0;
  const artW = spr.w - spr.pad * 2, artH = spr.h - spr.pad * 2;
  const sx = Math.round(p.x + p.w / 2 - artW / 2), sy = Math.round(p.y + p.h - artH);
  drawSprite(ctx, spr, sx, sy, flip);
  if (!spr.meta.gun) return;

  const gunW = S.gun.w - 2;
  const recoil = p.shootAnim > 2 ? 2 : 0;
  const gx = flip ? sx + artW - 21 - gunW + recoil : sx + 21 - recoil;
  const gy = sy + 16 + spr.meta.bob;
  drawSprite(ctx, S.gun, gx, gy, flip);
  if (p.shootAnim > 3) { // muzzle flash
    const mx = flip ? gx - 4 : gx + gunW + 3, my = gy + 2;
    ctx.fillStyle = PAL.o; ctx.fillRect(mx - 4, my - 1, 9, 3); ctx.fillRect(mx - 1, my - 4, 3, 9);
    ctx.fillStyle = PAL.y; ctx.fillRect(mx - 3, my - 1, 7, 3); ctx.fillRect(mx - 1, my - 3, 3, 7);
    ctx.fillStyle = PAL.w; ctx.fillRect(mx - 1, my - 1, 3, 3);
  }
}

function drawBlast(ctx, b) {
  const k = b.t / b.dur;
  const r = b.r * (1 - (1 - k) ** 2);
  const thick = 3 + 10 * (1 - k);
  ctx.globalAlpha = 0.5 * (1 - k);
  fillCircle(ctx, b.x, b.y, r, PAL.f);
  ctx.globalAlpha = 1 - k * 0.7;
  fillRing(ctx, b.x, b.y, r, r - thick, PAL.F);
  fillRing(ctx, b.x, b.y, r - 1, r - thick + 2, PAL.f);
  fillRing(ctx, b.x, b.y, r - 2, r - thick + 4, '#f0ffc0');
  if (k < 0.25) { ctx.globalAlpha = 0.85; fillCircle(ctx, b.x, b.y, r * 0.7, '#ffffff'); }
  ctx.globalAlpha = 1;
}

function drawParticle(ctx, q) {
  const x = Math.round(q.x), y = Math.round(q.y);
  ctx.fillStyle = q.color;
  if (q.size >= 4) { // gas puff: swells and fades
    const age = 1 - Math.min(1, q.life / q.max);
    ctx.globalAlpha = Math.min(0.8, 1.1 - age);
    fillCircle(ctx, x, y, Math.round(q.size * (0.5 + age * 0.7)));
    ctx.globalAlpha = 1;
  } else if (q.size === 3) {
    ctx.fillRect(x, y + 1, 3, 1);
    ctx.fillRect(x + 1, y, 1, 3);
  } else ctx.fillRect(x, y, q.size, q.size);
}

export function drawWorld(ctx, w) {
  const L = w.level;
  const cam = Math.round(w.camX);
  drawBackdrop(ctx, cam, w.frame);

  ctx.save();
  if (w.shake > 0) {
    const amp = Math.min(3, Math.ceil(w.shake / 4));
    ctx.translate(Math.round(Math.sin(w.frame * 2.3) * amp), Math.round(Math.cos(w.frame * 3.1) * amp));
  }
  ctx.translate(-cam, 0);
  const visible = (x, margin = 48) => x > cam - margin && x < cam + VIEW_W + margin;

  drawTiles(ctx, L, cam);
  if (w.goal && visible(w.goal.cx, 80)) drawSaloon(ctx, w.goal, w.frame);
  for (const cp of w.checkpoints) if (visible(cp.x)) drawCheckpoint(ctx, cp, w.frame);
  for (const hz of w.hazards) {
    if (!visible(hz.cx)) continue;
    drawShadow(ctx, hz.cx, hz.by, 16);
    drawSprite(ctx, S.cactus, hz.cx - 11, hz.by - 34);
  }
  for (const k of w.pickups) {
    if (!visible(k.x)) continue;
    const bob = Math.round(Math.sin((w.frame + k.phase) / 9) * 2);
    drawSprite(ctx, k.type === 'beans' ? S.beans : S.heart, k.x, k.y + bob);
    if (((w.frame + k.phase) >> 3) % 6 === 0) { ctx.fillStyle = PAL.w; ctx.fillRect(k.x + 9, k.y + bob - 1, 1, 3); ctx.fillRect(k.x + 8, k.y + bob, 3, 1); }
  }
  for (const e of w.enemies) if (visible(e.x)) drawEnemy(ctx, e);
  for (const b of w.ebullets) { // glowing red slug
    const x = Math.round(b.x), y = Math.round(b.y);
    ctx.globalAlpha = 0.35; fillCircle(ctx, x + 2, y + 2, 5, PAL.r); ctx.globalAlpha = 1;
    fillCircle(ctx, x + 2, y + 2, 3, PAL.k);
    fillCircle(ctx, x + 2, y + 2, 2, PAL.r);
    ctx.fillStyle = '#ffd0b0'; ctx.fillRect(x + 1, y + 1, 2, 1);
  }
  drawPlayer(ctx, w);
  for (const b of w.bullets) { // bullet with a fading tracer
    const x = Math.round(b.x), y = Math.round(b.y), dir = b.vx > 0 ? 1 : -1;
    const tail = dir > 0 ? x - 10 : x + b.w;
    ctx.fillStyle = 'rgba(255,215,94,0.25)'; ctx.fillRect(tail, y + 1, 10, 1);
    ctx.fillStyle = 'rgba(255,215,94,0.5)'; ctx.fillRect(dir > 0 ? x - 5 : x + b.w, y + 1, 5, 1);
    ctx.fillStyle = PAL.k; ctx.fillRect(x - 1, y - 1, b.w + 2, b.h + 2);
    ctx.fillStyle = RAMP.gold[1]; ctx.fillRect(x, y, b.w, b.h);
    ctx.fillStyle = RAMP.gold[2]; ctx.fillRect(x, y, b.w, 2);
    ctx.fillStyle = PAL.w; ctx.fillRect(dir > 0 ? x + b.w - 2 : x, y, 2, 1);
  }
  for (const q of w.particles) drawParticle(ctx, q);
  for (const b of w.blasts) drawBlast(ctx, b);
  for (const t of w.popups) {
    drawText(ctx, t.text, t.x, t.y, { color: (t.t >> 2) & 1 ? PAL.y : PAL.w, align: 'center' });
  }
  ctx.restore();

  const blast = w.blasts[0]; // brief green flash over the whole screen
  if (blast && blast.t < 6) { ctx.fillStyle = `rgba(205,240,106,${0.3 - blast.t * 0.05})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
}

// ---- HUD and screens ---------------------------------------------------------------
const pad6 = (n) => String(n).padStart(6, '0');

export function drawHUD(ctx, w, muted) {
  const p = w.player;
  for (let i = 0; i < MAX_HP; i++) drawSprite(ctx, i < p.hp ? S.heart : S.heartEmpty, 6 + i * 16, 6);

  // Revolver rounds: six brass cartridges, refilling while reloading.
  const loaded = p.reload > 0 ? Math.floor((1 - p.reload / RELOAD_FRAMES) * CLIP) : p.ammo;
  for (let i = 0; i < CLIP; i++) {
    const x = 6 + i * 7, y = 23, live = i < loaded;
    ctx.fillStyle = PAL.k; ctx.fillRect(x - 1, y - 1, 6, 11);
    ctx.fillStyle = live ? RAMP.gold[1] : PAL.d; ctx.fillRect(x, y, 4, 9);
    if (live) {
      ctx.fillStyle = RAMP.gold[3]; ctx.fillRect(x, y, 1, 9);
      ctx.fillStyle = p.reload > 0 ? PAL.l : '#d8702a'; ctx.fillRect(x, y, 4, 3);
      ctx.fillStyle = RAMP.gold[0]; ctx.fillRect(x + 3, y + 3, 1, 6);
    }
  }
  if (p.reload > 0 && (w.frame >> 2) & 1) drawText(ctx, 'RELOAD', 52, 24, { color: PAL.r });

  for (let i = 0; i < MAX_FARTS; i++) drawSprite(ctx, i < p.farts ? S.beans : S.beansEmpty, 6 + i * 15, 38);

  drawText(ctx, 'SCORE', VIEW_W - 6, 6, { align: 'right', color: PAL.y });
  drawText(ctx, pad6(w.score), VIEW_W - 6, 16, { align: 'right' });
  if (muted) drawText(ctx, 'MUTE', VIEW_W - 6, 28, { align: 'right', color: PAL.l });
}

function dim(ctx, alpha = 0.74) {
  ctx.fillStyle = `rgba(20,12,30,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// Framed panel for menus and dialogs.
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PAL.k; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = RAMP.gold[1]; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = RAMP.gold[3]; ctx.fillRect(x - 1, y - 1, w + 2, 1);
  gradient(ctx, x, y, w, h, [[0, '#3a2450'], [1, '#1a1228']], 3);
}

// One centred menu line; the selected one is yellow with blinking arrows.
function drawMenuItem(ctx, label, y, selected, tick) {
  drawText(ctx, label, VIEW_W / 2, y, { align: 'center', color: selected ? PAL.y : PAL.w });
  if (selected && (tick >> 3) & 1) {
    const half = Math.ceil(textWidth(label) / 2);
    drawText(ctx, '>', VIEW_W / 2 - half - 9, y, { color: PAL.y });
    drawText(ctx, '<', VIEW_W / 2 + half + 4, y, { color: PAL.y });
  }
}

function drawMenu(ctx, menu, sel, tick) {
  menu.items.forEach((label, i) => drawMenuItem(ctx, label, menu.y + i * menu.step, i === sel, tick));
}

export function drawPause(ctx, sel, tick) {
  dim(ctx, 0.6);
  panel(ctx, 64, 66, 128, 96);
  drawLogo(ctx, 'PAUSED', VIEW_W / 2, 78, 2);
  drawMenu(ctx, PAUSE_MENU, sel, tick);
}

// Rebinding screen. ctl = { row, col, listening }.
export function drawControls(ctx, tick, bindings, ctl) {
  drawBackdrop(ctx, tick * 0.3, tick);
  dim(ctx);
  drawLogo(ctx, 'CONTROLS', VIEW_W / 2, 8, 2);

  const boxW = CTL.slotW - 2;
  drawText(ctx, 'ACTION', CTL.labelX, 31, { color: PAL.g });
  for (let c = 0; c < SLOTS; c++) {
    drawText(ctx, `KEY ${c + 1}`, CTL.slotX[c] + boxW / 2, 31, { color: PAL.g, align: 'center' });
  }
  ACTIONS.forEach((action, r) => {
    const y = CTL.rowY + r * CTL.rowH;
    const rowSel = ctl.row === r;
    drawText(ctx, action.label, CTL.labelX, y, { color: rowSel ? PAL.y : PAL.w });
    for (let c = 0; c < SLOTS; c++) {
      const x = CTL.slotX[c];
      const sel = rowSel && ctl.col === c;
      const waiting = sel && ctl.listening;
      const code = bindings[action.id][c];
      ctx.fillStyle = sel ? PAL.y : PAL.d;
      ctx.fillRect(x, y - 3, boxW, 13);
      gradient(ctx, x + 1, y - 2, boxW - 2, 11, waiting ? [[0, '#a8242c'], [1, '#6e1626']] : [[0, '#2a2038'], [1, '#161020']], 3);
      const label = waiting ? ((tick >> 3) & 1 ? '...' : '') : bindingName(code);
      drawText(ctx, label, x + boxW / 2, y, { align: 'center', shadow: null, color: code || waiting ? PAL.w : PAL.g });
    }
  });
  drawMenuItem(ctx, CTL.resetLabel, CTL.resetY, ctl.row === CTL_RESET_ROW, tick);
  drawMenuItem(ctx, CTL.backLabel, CTL.backY, ctl.row === CTL_BACK_ROW, tick);

  drawText(ctx, 'ENTER OR CLICK TO REBIND', VIEW_W / 2, 188, { align: 'center', color: PAL.l });
  drawText(ctx, 'BACKSPACE OR RIGHT CLICK TO CLEAR', VIEW_W / 2, 199, { align: 'center', color: PAL.l });
  drawText(ctx, 'ESC TO GO BACK', VIEW_W / 2, 210, { align: 'center', color: PAL.l });

  if (ctl.listening) {
    panel(ctx, 26, 82, 204, 52);
    drawText(ctx, 'PRESS A KEY OR MOUSE BUTTON', VIEW_W / 2, 90, { align: 'center' });
    drawText(ctx, `FOR ${ACTIONS[ctl.row].label}`, VIEW_W / 2, 103, { align: 'center', color: PAL.y });
    drawText(ctx, 'ESC TO CANCEL', VIEW_W / 2, 119, { align: 'center', color: PAL.g });
  }
}

export function drawGameOver(ctx, w, best, tick) {
  dim(ctx);
  drawLogo(ctx, 'GAME OVER', VIEW_W / 2, 70, 3, LOGO_RED);
  drawText(ctx, "RUDY'S RUN OUT OF GAS", VIEW_W / 2, 104, { align: 'center', color: PAL.f });
  drawText(ctx, `SCORE      ${pad6(w.score)}`, VIEW_W / 2, 126, { align: 'center' });
  drawText(ctx, `TOP SCORE  ${pad6(best)}`, VIEW_W / 2, 138, { align: 'center', color: PAL.y });
  if ((tick >> 4) & 1) drawText(ctx, 'PRESS ENTER', VIEW_W / 2, 164, { align: 'center' });
}

export function drawWin(ctx, w, madeTheBoard, tick) {
  dim(ctx);
  drawLogo(ctx, 'LEVEL COMPLETE', VIEW_W / 2, 40, 2);
  drawText(ctx, 'THE SALOON IS SAFE. FOR NOW.', VIEW_W / 2, 64, { align: 'center', color: PAL.f });
  const b = w.bonus;
  const mm = Math.floor(b.seconds / 60), ss = String(b.seconds % 60).padStart(2, '0');
  const lines = [
    ['VARMINTS BLASTED', String(b.kills)],
    [`TIME ${mm}:${ss} BONUS`, String(b.time)],
    ['HEARTS BONUS', String(b.hearts)],
    ['TOTAL SCORE', String(w.score)],
  ];
  panel(ctx, 38, 82, 180, 62);
  lines.forEach(([label, value], i) => {
    const y = 90 + i * 12 + (i === 3 ? 6 : 0);
    const color = i === 3 ? PAL.y : PAL.w;
    drawText(ctx, label, 48, y, { color });
    drawText(ctx, value, VIEW_W - 48, y, { color, align: 'right' });
  });
  if (madeTheBoard) drawText(ctx, 'YOU MADE THE HI SCORE BOARD!', VIEW_W / 2, 158, { align: 'center', color: (tick >> 3) & 1 ? PAL.r : PAL.y });
  if ((tick >> 4) & 1) drawText(ctx, 'PRESS ENTER', VIEW_W / 2, 180, { align: 'center' });
}

// Arcade-style initials entry. entry = { chars: ['A','A','A'], pos, busy }.
export function drawInitials(ctx, tick, entry, score) {
  drawBackdrop(ctx, tick * 0.3, tick);
  dim(ctx);
  drawLogo(ctx, 'NEW HI SCORE', VIEW_W / 2, 22, 2);
  drawText(ctx, pad6(score), VIEW_W / 2, 48, { align: 'center', color: PAL.y, scale: 2 });
  drawText(ctx, 'ENTER YOUR INITIALS', VIEW_W / 2, 70, { align: 'center' });

  const I = INITIALS, glyphW = 5 * I.scale;
  entry.chars.forEach((ch, i) => {
    const x = I.slotX[i], sel = i === entry.pos && !entry.busy;
    panel(ctx, x - 3, I.y - 4, glyphW + 6, 7 * I.scale + 8);
    drawLogo(ctx, ch, x + glyphW / 2, I.y, I.scale, sel ? LOGO_GOLD : LOGO_GAS);
    const arrow = sel && (tick >> 3) & 1 ? PAL.y : PAL.l;
    drawText(ctx, '^', x + glyphW / 2, I.upY, { align: 'center', color: arrow });
    drawText(ctx, '~', x + glyphW / 2, I.downY, { align: 'center', color: arrow });
  });
  if (entry.busy) drawText(ctx, 'SAVING...', VIEW_W / 2, I.okY, { align: 'center', color: PAL.y });
  else drawMenuItem(ctx, I.okLabel, I.okY, true, tick);

  drawText(ctx, 'TYPE LETTERS OR USE THE ARROWS', VIEW_W / 2, 188, { align: 'center', color: PAL.l });
  drawText(ctx, 'ENTER OR CLICK OK TO SAVE', VIEW_W / 2, 199, { align: 'center', color: PAL.l });
}

// Hi-score table. highlight = index of the row to flash (or -1).
export function drawScores(ctx, tick, list, highlight, shared) {
  drawBackdrop(ctx, tick * 0.3, tick);
  dim(ctx);
  drawLogo(ctx, 'HI SCORES', VIEW_W / 2, 10, 3);
  panel(ctx, 50, 42, 156, 142);
  drawText(ctx, 'RANK  NAME   SCORE', 62, 49, { color: PAL.g });
  for (let i = 0; i < MAX_SCORES; i++) {
    const e = list[i];
    const y = 62 + i * 12;
    const hot = i === highlight;
    const color = hot ? ((tick >> 2) & 1 ? PAL.w : PAL.y) : i === 0 ? PAL.y : e ? PAL.w : PAL.d;
    const rank = `${i + 1}`.padStart(2, ' ');
    drawText(ctx, `${rank}.   ${e ? e.name.padEnd(3, ' ') : '---'}   ${e ? pad6(e.score) : '------'}`, 62, y, { color });
    if (hot) drawText(ctx, '<', 190, y, { color: PAL.y });
  }
  drawText(ctx, shared ? 'SHARED WITH EVERYONE ON THIS SERVER' : 'SAVED ON THIS DEVICE ONLY', VIEW_W / 2, 196, { align: 'center', color: shared ? PAL.f : PAL.l });
  if ((tick >> 4) & 1) drawText(ctx, 'PRESS ENTER', VIEW_W / 2, 214, { align: 'center' });
}

export function drawTitle(ctx, tick, best, muted, sel, bindings) {
  drawBackdrop(ctx, tick * 0.3, tick);
  for (let c = 0; c < VIEW_W / TILE; c++) { // strip of desert floor
    drawTile(ctx, 1, true, c, 13);
    drawTile(ctx, 1, false, c, 14);
  }
  const ground = 13 * TILE;

  const hi = best ? `HI ${pad6(best.score)} ${best.name}` : `HI ${pad6(0)}`;
  drawText(ctx, hi, VIEW_W / 2, 5, { align: 'center', color: PAL.y });
  const bounce = Math.round(Math.sin(tick / 20) * 2);
  drawLogo(ctx, "ROOTIN'", VIEW_W / 2, 18 + bounce, 4, LOGO_GOLD);
  drawLogo(ctx, "TOOTIN'", VIEW_W / 2, 50 - bounce, 4, LOGO_GAS);
  drawText(ctx, "STARRING RUDY TOOTIN'", VIEW_W / 2, 84, { align: 'center' });
  drawMenu(ctx, TITLE_MENU, sel, tick);

  // Current controls, read from the live bindings (first slot of each action).
  const key = (id) => bindingName(bindings[id].find(Boolean));
  const hint = { align: 'center', color: PAL.w };
  drawText(ctx, `MOVE ${key('left')} / ${key('right')}   JUMP ${key('jump')}`, VIEW_W / 2, 132, hint);
  drawText(ctx, `SHOOT ${key('shoot')}   FART ${key('fart')}`, VIEW_W / 2, 142, hint);

  // Rudy, a toot, and some company.
  const toot = tick % 170;
  const rudySpr = toot < 16 ? S.rudyFart : S.rudyIdle;
  const rx = 82, ry = ground - (rudySpr.h - 1) * 2;
  if (toot < 50) {
    const k = toot / 50;
    ctx.globalAlpha = 0.85 - k * 0.6;
    for (let i = 0; i < 3; i++) {
      fillCircle(ctx, rx + 4 - k * (16 + i * 10), ground - 14 - i * 6 - k * 12, 3 + k * (6 + i * 2), i === 1 ? PAL.F : PAL.f);
    }
    ctx.globalAlpha = 1;
  }
  drawShadow(ctx, rx + rudySpr.w, ground, 40);
  drawSpriteScaled(ctx, rudySpr, rx, ry, 2);
  if (rudySpr.meta.gun) drawSpriteScaled(ctx, S.gun, rx + 42, ry + 32, 2);
  drawSpriteScaled(ctx, S.cactus, 12, ground - (S.cactus.h - 1) * 2, 2);
  const scuttle = (tick >> 3) & 1 ? S.scorpionA : S.scorpionB;
  const sx = 168 + Math.round(Math.sin(tick / 40) * 6);
  drawShadow(ctx, sx + scuttle.w, ground, 60);
  drawSpriteScaled(ctx, scuttle, sx, ground - (scuttle.h - 1) * 2, 2, true);

  drawText(ctx, `${key('mute')}: SOUND ${muted ? 'OFF' : 'ON'}`, VIEW_W - 5, 228, { align: 'right', color: PAL.B, shadow: null });
}

// Debug: every sprite on sky and sand, for checking the art.
export function drawSpriteSheet(ctx) {
  gradient(ctx, 0, 0, VIEW_W, VIEW_H / 2, [[0, '#2f6fc4'], [1, '#bfe0f0']], 4);
  ctx.fillStyle = '#d6a660'; ctx.fillRect(0, VIEW_H / 2, VIEW_W, VIEW_H / 2);
  let x = 2, y = 2, rowH = 0;
  for (const [name, spr] of Object.entries(S)) {
    if (x + spr.w > VIEW_W - 2) { x = 2; y += rowH + 3; rowH = 0; }
    ctx.drawImage(name.length % 2 ? spr.c : spr.f, x, y);
    x += spr.w + 3;
    rowH = Math.max(rowH, spr.h);
  }
  y += rowH + 6;
  x = 2;
  for (const set of Object.values(tiles)) for (const t of set) { ctx.drawImage(t, x, y); ctx.drawImage(t, x + 16, y); x += 36; }
}
