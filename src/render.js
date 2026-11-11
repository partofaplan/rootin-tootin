// All drawing: parallax background, tiles, entities, HUD and menu screens.

import { PAL, SPRITES } from './sprites.js';
import { TILE, tileAt } from './level.js';
import { VIEW_W, VIEW_H, MAX_HP, MAX_FARTS, CLIP, RELOAD_FRAMES } from './game.js';
import { ACTIONS, SLOTS, bindingName } from './input.js';
import { TITLE_MENU, PAUSE_MENU, CTL, CTL_RESET_ROW, CTL_BACK_ROW } from './ui.js';
import {
  makeCanvas, bakeSprite, drawSprite, drawSpriteScaled, drawText, drawLogo, textWidth,
  fillCircle, fillRing, ditherPattern,
} from './gfx.js';

const S = {}; // baked sprites
const bg = {}; // baked background layers
const tiles = {}; // baked 16x16 tiles
let gasDither = null;
const BG_W = 512;

const C = {
  sand: '#c98f52', sandDark: '#a8713c', sandLight: '#dba864', sandCap: '#f2d79a', sandShine: '#fff0c4',
  rock: '#a85f3a', rockDark: '#7d4428', rockLight: '#bf7448', rockCap: '#dd9a66',
  pit: '#2a1626', pitLip: '#4a2a36',
  wood: '#8a4b2a', woodDark: '#5a2e1a', woodLight: '#a8683c',
};

export function initRender(ctx) {
  for (const [name, rows] of Object.entries(SPRITES)) S[name] = bakeSprite(rows);
  S.heartEmpty = bakeSprite(SPRITES.heart.map((r) => r.replace(/[rw]/g, 'd')));
  S.beansEmpty = bakeSprite(SPRITES.beans.map((r) => r.replace(/[^.]/g, 'd')));
  bg.sky = bakeSky();
  bg.far = bakeFar();
  bg.dunes = bakeDunes();
  bakeTiles();
  gasDither = ditherPattern(ctx, PAL.f);
}

// Small deterministic PRNG so baked art is identical on every load.
function prng(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function bakeSky() {
  const c = makeCanvas(VIEW_W, VIEW_H), g = c.getContext('2d');
  const bands = [[0, '#2c6fb7'], [34, '#3f86c9'], [64, '#5fa2d6'], [92, '#8cc0e0'], [118, '#c2dde0'], [142, '#f3dfb4'], [VIEW_H, null]];
  for (let i = 0; i + 1 < bands.length; i++) {
    const [y, col] = bands[i];
    g.fillStyle = col;
    g.fillRect(0, y, VIEW_W, bands[i + 1][0] - y);
  }
  for (let i = 1; i + 1 < bands.length; i++) { // dither each band edge
    const [y, col] = bands[i];
    g.fillStyle = col;
    for (let x = 0; x < VIEW_W; x++) {
      if (x % 2 === 0) g.fillRect(x, y - 1, 1, 1);
      else g.fillRect(x, y - 2, 1, 1);
      if (x % 4 === 0) g.fillRect(x, y - 4, 1, 1);
    }
  }
  fillCircle(g, 198, 50, 14, '#fff3c0');
  fillCircle(g, 198, 50, 11, '#ffe07a');
  g.fillStyle = '#eef6f8';
  for (const [x, y] of [[30, 30], [120, 58], [226, 96]]) {
    g.fillRect(x + 5, y, 14, 3);
    g.fillRect(x, y + 3, 26, 4);
    g.fillRect(x + 8, y + 7, 22, 2);
  }
  return c;
}

function bakeFar() {
  const c = makeCanvas(BG_W, VIEW_H), g = c.getContext('2d');
  const base = 178;
  g.fillStyle = '#e7c79a'; // distant desert floor
  g.fillRect(0, base, BG_W, VIEW_H - base);
  for (const [x, w, h] of [[24, 70, 46], [136, 36, 30], [214, 104, 58], [368, 48, 36], [446, 40, 50]]) {
    const step = Math.ceil(h / 5);
    for (let k = 0; k < 5; k++) { // stepped sides
      g.fillStyle = '#c98d7a';
      g.fillRect(x - k * 3, base - h + k * step, w + k * 6, step + 1);
      g.fillStyle = '#b0786c'; // shaded right face
      g.fillRect(x + w + k * 3 - 8, base - h + k * step, 8, step + 1);
    }
    g.fillStyle = '#dda592';
    g.fillRect(x, base - h, w - 8, 2);
    g.fillStyle = '#b0786c';
    for (let sx = x + 6; sx < x + w - 12; sx += 13) g.fillRect(sx, base - h + 6, 1, h - 12);
  }
  return c;
}

function bakeDunes() {
  const c = makeCanvas(BG_W, VIEW_H), g = c.getContext('2d');
  const top = (x) => Math.round(196 - 12 * Math.sin((x / 256) * Math.PI * 2) - 6 * Math.sin((x / 128) * Math.PI * 2 + 1.3) - 3 * Math.sin((x / 64) * Math.PI * 2 + 0.5));
  for (let x = 0; x < BG_W; x++) {
    const y = top(x);
    g.fillStyle = C.sandLight;
    g.fillRect(x, y, 1, VIEW_H - y);
    g.fillStyle = '#f0cf8e';
    g.fillRect(x, y, 1, 2);
  }
  g.fillStyle = '#8fa867'; // tiny far-off cacti, clearly background
  for (const x of [40, 170, 300, 331, 470]) {
    const y = top(x);
    g.fillRect(x, y - 9, 2, 10);
    g.fillRect(x - 3, y - 6, 3, 1);
    g.fillRect(x - 3, y - 8, 1, 2);
    g.fillRect(x + 2, y - 4, 3, 1);
    g.fillRect(x + 4, y - 7, 1, 3);
  }
  return c;
}

function bakeTiles() {
  const make = (seed, base, dark, light, cap) => {
    const c = makeCanvas(TILE, TILE), g = c.getContext('2d'), rnd = prng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, TILE, TILE);
    const speck = (n, col) => {
      g.fillStyle = col;
      for (let i = 0; i < n; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 16), 1 + Math.floor(rnd() * 2), 1);
    };
    speck(9, dark);
    speck(6, light);
    if (cap) cap(g);
    return c;
  };
  const sandCap = (g) => {
    g.fillStyle = C.sandCap; g.fillRect(0, 0, TILE, 3);
    g.fillStyle = C.sandShine; g.fillRect(0, 0, TILE, 1);
    g.fillStyle = C.sandDark;
    for (let x = 0; x < TILE; x += 2) g.fillRect(x, 3, 1, 1);
  };
  const strata = (g) => {
    g.fillStyle = C.rockDark;
    g.fillRect(0, 6, TILE, 1);
    g.fillRect(0, 12, TILE, 1);
  };
  const rockCap = (g) => {
    strata(g);
    g.fillStyle = C.rockCap; g.fillRect(0, 0, TILE, 2);
    g.fillStyle = C.rockDark; g.fillRect(0, 2, TILE, 1);
  };
  tiles.sand = [make(11, C.sand, C.sandDark, C.sandLight), make(23, C.sand, C.sandDark, C.sandLight)];
  tiles.sandTop = [make(37, C.sand, C.sandDark, C.sandLight, sandCap), make(41, C.sand, C.sandDark, C.sandLight, sandCap)];
  tiles.rock = [make(53, C.rock, C.rockDark, C.rockLight, strata), make(67, C.rock, C.rockDark, C.rockLight, strata)];
  tiles.rockTop = [make(71, C.rock, C.rockDark, C.rockLight, rockCap), make(83, C.rock, C.rockDark, C.rockLight, rockCap)];
}

function drawLayer(ctx, img, offset) {
  const x = -(Math.floor(offset) % BG_W);
  ctx.drawImage(img, x, 0);
  if (x + BG_W < VIEW_W) ctx.drawImage(img, x + BG_W, 0);
}

function drawBackdrop(ctx, cam) {
  ctx.drawImage(bg.sky, 0, 0);
  drawLayer(ctx, bg.far, cam * 0.15);
  drawLayer(ctx, bg.dunes, cam * 0.4);
}

function drawTile(ctx, kind, top, c, r) {
  const set = kind === 2 ? (top ? tiles.rockTop : tiles.rock) : top ? tiles.sandTop : tiles.sand;
  ctx.drawImage(set[(c * 7 + r * 13) & 1], c * TILE, r * TILE);
}

function drawTiles(ctx, L, cam) {
  for (const pit of L.pits) {
    const x = pit.col0 * TILE, w = (pit.col1 - pit.col0 + 1) * TILE, y = pit.topRow * TILE;
    if (x + w < cam || x > cam + VIEW_W) continue;
    ctx.fillStyle = C.pitLip;
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = C.pit;
    ctx.fillRect(x, y + 5, w, VIEW_H - y - 5);
  }
  const c0 = Math.floor(cam / TILE), c1 = Math.floor((cam + VIEW_W) / TILE);
  for (let c = Math.max(0, c0); c <= Math.min(L.w - 1, c1); c++) {
    for (let r = 0; r < L.h; r++) {
      const kind = tileAt(L, c, r);
      if (kind) drawTile(ctx, kind, !tileAt(L, c, r - 1), c, r);
    }
  }
}

function drawSaloon(ctx, goal, frame) {
  const x = goal.cx - 40, by = goal.by;
  ctx.fillStyle = C.woodDark; // roof line + sign board
  ctx.fillRect(x - 5, by - 54, 90, 4);
  ctx.fillRect(x + 6, by - 76, 68, 22);
  ctx.fillStyle = C.woodLight;
  ctx.fillRect(x + 8, by - 74, 64, 18);
  drawText(ctx, 'SALOON', goal.cx, by - 69, { color: PAL.R, shadow: null, align: 'center' });
  ctx.fillStyle = C.wood; // wall
  ctx.fillRect(x, by - 50, 80, 50);
  ctx.fillStyle = C.woodDark;
  for (let px = x + 7; px < x + 80; px += 8) ctx.fillRect(px, by - 50, 1, 50);
  for (const wx of [x + 8, x + 58]) { // lit windows
    ctx.fillStyle = C.woodDark; ctx.fillRect(wx - 1, by - 39, 16, 16);
    ctx.fillStyle = PAL.y; ctx.fillRect(wx, by - 38, 14, 14);
    ctx.fillStyle = '#fff3c0'; ctx.fillRect(wx, by - 38, 14, 3);
    ctx.fillStyle = C.woodDark; ctx.fillRect(wx + 6, by - 38, 2, 14); ctx.fillRect(wx, by - 32, 14, 2);
  }
  ctx.fillStyle = PAL.k; // doorway
  ctx.fillRect(goal.x - 1, goal.y, goal.w + 2, goal.h);
  ctx.fillStyle = C.woodLight; // swinging doors
  ctx.fillRect(goal.x, goal.y + 9, 7, 11);
  ctx.fillRect(goal.x + 9, goal.y + 9, 7, 11);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(goal.x + 1, goal.y + 11, 5, 1); ctx.fillRect(goal.x + 10, goal.y + 11, 5, 1);
  ctx.fillRect(goal.x + 1, goal.y + 15, 5, 1); ctx.fillRect(goal.x + 10, goal.y + 15, 5, 1);
  ctx.fillStyle = C.woodDark; // porch posts
  ctx.fillRect(x - 3, by - 50, 3, 50);
  ctx.fillRect(x + 80, by - 50, 3, 50);
  if ((frame >> 4) & 1) drawText(ctx, 'v', goal.cx, goal.y - 12, { color: PAL.y, align: 'center' });
}

function drawCheckpoint(ctx, cp, frame) {
  ctx.fillStyle = PAL.k; ctx.fillRect(cp.x - 2, cp.y - 30, 4, 30);
  ctx.fillStyle = C.woodLight; ctx.fillRect(cp.x - 1, cp.y - 29, 2, 29);
  const wave = cp.active && (frame >> 3) & 1 ? 1 : 0;
  const fy = cp.active ? cp.y - 29 : cp.y - 14;
  ctx.fillStyle = PAL.k; ctx.fillRect(cp.x + 1, fy - 1, 13, 10 + wave);
  ctx.fillStyle = cp.active ? PAL.r : PAL.g; ctx.fillRect(cp.x + 2, fy, 11, 8 + wave);
  if (cp.active) { ctx.fillStyle = PAL.y; ctx.fillRect(cp.x + 6, fy + 3, 3, 3); }
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
  drawSprite(ctx, spr, x, y, e.face < 0, e.flash > 0);
  if (e.state === 'aim' || e.state === 'crouch') {
    drawText(ctx, '!', e.x + e.w / 2, e.y - 12, { color: PAL.r, align: 'center' });
  }
}

function drawPlayer(ctx, w) {
  const p = w.player;
  if (w.state === 'gameover') return;
  if (w.state === 'play' && p.inv > 0 && (w.frame >> 2) & 1) return; // blink while invulnerable
  let spr;
  if (w.state === 'dying' || p.stun > 0) spr = S.rudyHurt;
  else if (p.fartAnim > 10) spr = S.rudyFart;
  else if (!p.onGround) spr = S.rudyJump;
  else if (Math.abs(p.vx) > 0.3) spr = [S.rudyRunA, S.rudyRunB, S.rudyRunC, S.rudyRunB][(p.anim >> 2) & 3];
  else spr = S.rudyIdle;

  const flip = p.face < 0;
  const sx = Math.round(p.x) - 3, sy = Math.round(p.y) - 2;
  drawSprite(ctx, spr, sx, sy, flip);
  if (w.state === 'dying') return;

  const recoil = p.shootAnim > 2 ? 1 : 0;
  const gx = flip ? sx - 5 + recoil : sx + 13 - recoil;
  drawSprite(ctx, S.gun, gx, sy + 7, flip);
  if (p.shootAnim > 3) { // muzzle flash
    const mx = flip ? gx - 5 : gx + 9;
    ctx.fillStyle = PAL.y; ctx.fillRect(mx, sy + 5, 4, 5);
    ctx.fillStyle = PAL.w; ctx.fillRect(mx + 1, sy + 6, 2, 3);
  }
}

function drawBlast(ctx, b) {
  const k = b.t / b.dur;
  const r = b.r * (1 - (1 - k) ** 2);
  const thick = 2 + 9 * (1 - k);
  if (k < 0.7) fillCircle(ctx, b.x, b.y, r, gasDither);
  fillRing(ctx, b.x, b.y, r, r - thick, PAL.F);
  fillRing(ctx, b.x, b.y, r - 1, r - thick + 2, PAL.f);
  if (k < 0.25) fillCircle(ctx, b.x, b.y, r * 0.6, PAL.w);
}

export function drawWorld(ctx, w) {
  const L = w.level;
  const cam = Math.round(w.camX);
  drawBackdrop(ctx, cam);

  ctx.save();
  if (w.shake > 0) {
    const amp = Math.min(3, Math.ceil(w.shake / 4));
    ctx.translate(Math.round(Math.sin(w.frame * 2.3) * amp), Math.round(Math.cos(w.frame * 3.1) * amp));
  }
  ctx.translate(-cam, 0);
  const visible = (x, margin = 48) => x > cam - margin && x < cam + VIEW_W + margin;

  drawTiles(ctx, L, cam);
  if (w.goal && visible(w.goal.cx, 64)) drawSaloon(ctx, w.goal, w.frame);
  for (const cp of w.checkpoints) if (visible(cp.x)) drawCheckpoint(ctx, cp, w.frame);
  for (const hz of w.hazards) if (visible(hz.cx)) drawSprite(ctx, S.cactus, hz.cx - 8, hz.by - 20);
  for (const k of w.pickups) {
    if (!visible(k.x)) continue;
    const bob = Math.round(Math.sin((w.frame + k.phase) / 9) * 2);
    drawSprite(ctx, k.type === 'beans' ? S.beans : S.heart, k.x, k.y + bob);
  }
  for (const e of w.enemies) if (visible(e.x)) drawEnemy(ctx, e);
  for (const b of w.ebullets) {
    ctx.fillStyle = PAL.k; ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 6, 5);
    ctx.fillStyle = PAL.r; ctx.fillRect(Math.round(b.x), Math.round(b.y), 4, 3);
    ctx.fillStyle = PAL.o; ctx.fillRect(Math.round(b.x) + 1, Math.round(b.y) + 1, 2, 1);
  }
  drawPlayer(ctx, w);
  for (const b of w.bullets) {
    ctx.fillStyle = PAL.k; ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 6, 4);
    ctx.fillStyle = PAL.y; ctx.fillRect(Math.round(b.x), Math.round(b.y), 4, 2);
    ctx.fillStyle = PAL.w; ctx.fillRect(Math.round(b.x) + (b.vx > 0 ? 2 : 0), Math.round(b.y), 2, 1);
  }
  for (const q of w.particles) {
    ctx.fillStyle = q.color;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
  }
  for (const b of w.blasts) drawBlast(ctx, b);
  for (const t of w.popups) {
    drawText(ctx, t.text, t.x, t.y, { color: (t.t >> 2) & 1 ? PAL.y : PAL.w, align: 'center' });
  }
  ctx.restore();
}

export function drawHUD(ctx, w, muted) {
  const p = w.player;
  for (let i = 0; i < MAX_HP; i++) drawSprite(ctx, i < p.hp ? S.heart : S.heartEmpty, 6 + i * 12, 6);

  // Revolver cylinder: six rounds, refilling while reloading.
  const loaded = p.reload > 0 ? Math.floor((1 - p.reload / RELOAD_FRAMES) * CLIP) : p.ammo;
  for (let i = 0; i < CLIP; i++) {
    const x = 6 + i * 6;
    ctx.fillStyle = PAL.k; ctx.fillRect(x - 1, 18, 5, 9);
    ctx.fillStyle = i < loaded ? (p.reload > 0 ? PAL.l : PAL.y) : PAL.d;
    ctx.fillRect(x, 19, 3, 7);
    if (i < loaded && p.reload === 0) { ctx.fillStyle = PAL.o; ctx.fillRect(x, 24, 3, 2); }
  }
  if (p.reload > 0 && (w.frame >> 2) & 1) drawText(ctx, 'RELOAD', 46, 19, { color: PAL.r });

  for (let i = 0; i < MAX_FARTS; i++) drawSprite(ctx, i < p.farts ? S.beans : S.beansEmpty, 6 + i * 13, 31);

  drawText(ctx, 'SCORE', VIEW_W - 6, 6, { align: 'right', color: PAL.y });
  drawText(ctx, String(w.score).padStart(6, '0'), VIEW_W - 6, 16, { align: 'right' });
  if (muted) drawText(ctx, 'MUTE', VIEW_W - 6, 28, { align: 'right', color: PAL.l });
}

function dim(ctx) {
  ctx.fillStyle = 'rgba(27,18,32,0.74)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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
  dim(ctx);
  drawLogo(ctx, 'PAUSED', VIEW_W / 2, 78, 2);
  drawMenu(ctx, PAUSE_MENU, sel, tick);
}

// Rebinding screen. ctl = { row, col, listening }.
export function drawControls(ctx, tick, bindings, ctl) {
  drawBackdrop(ctx, tick * 0.3);
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
      ctx.fillStyle = waiting ? PAL.R : PAL.k;
      ctx.fillRect(x + 1, y - 2, boxW - 2, 11);
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
    ctx.fillStyle = PAL.y; ctx.fillRect(24, 80, 208, 56);
    ctx.fillStyle = PAL.k; ctx.fillRect(26, 82, 204, 52);
    drawText(ctx, 'PRESS A KEY OR MOUSE BUTTON', VIEW_W / 2, 90, { align: 'center' });
    drawText(ctx, `FOR ${ACTIONS[ctl.row].label}`, VIEW_W / 2, 103, { align: 'center', color: PAL.y });
    drawText(ctx, 'ESC TO CANCEL', VIEW_W / 2, 119, { align: 'center', color: PAL.g });
  }
}

export function drawGameOver(ctx, w, hi, tick) {
  dim(ctx);
  drawLogo(ctx, 'GAME OVER', VIEW_W / 2, 70, 3, PAL.r, PAL.R);
  drawText(ctx, "RUDY'S RUN OUT OF GAS", VIEW_W / 2, 104, { align: 'center', color: PAL.f });
  drawText(ctx, `SCORE  ${String(w.score).padStart(6, '0')}`, VIEW_W / 2, 126, { align: 'center' });
  drawText(ctx, `BEST   ${String(hi).padStart(6, '0')}`, VIEW_W / 2, 138, { align: 'center', color: PAL.y });
  if ((tick >> 4) & 1) drawText(ctx, 'PRESS ENTER', VIEW_W / 2, 164, { align: 'center' });
}

export function drawWin(ctx, w, hi, tick) {
  dim(ctx);
  drawLogo(ctx, 'LEVEL COMPLETE', VIEW_W / 2, 44, 2);
  drawText(ctx, 'THE SALOON IS SAFE. FOR NOW.', VIEW_W / 2, 68, { align: 'center', color: PAL.f });
  const b = w.bonus;
  const mm = Math.floor(b.seconds / 60), ss = String(b.seconds % 60).padStart(2, '0');
  const lines = [
    [`VARMINTS BLASTED`, String(b.kills)],
    [`TIME ${mm}:${ss} BONUS`, String(b.time)],
    [`HEARTS BONUS`, String(b.hearts)],
    [`TOTAL SCORE`, String(w.score)],
  ];
  lines.forEach(([label, value], i) => {
    const y = 92 + i * 13 + (i === 3 ? 6 : 0);
    const color = i === 3 ? PAL.y : PAL.w;
    drawText(ctx, label, 48, y, { color });
    drawText(ctx, value, VIEW_W - 48, y, { color, align: 'right' });
  });
  if (w.score >= hi && w.score > 0) drawText(ctx, 'NEW HIGH SCORE!', VIEW_W / 2, 158, { align: 'center', color: (tick >> 3) & 1 ? PAL.r : PAL.y });
  if ((tick >> 4) & 1) drawText(ctx, 'PRESS ENTER', VIEW_W / 2, 180, { align: 'center' });
}

export function drawTitle(ctx, tick, hi, muted, sel, bindings) {
  drawBackdrop(ctx, tick * 0.3);
  for (let c = 0; c < VIEW_W / TILE; c++) { // strip of desert floor
    drawTile(ctx, 1, true, c, 13);
    drawTile(ctx, 1, false, c, 14);
  }
  const ground = 13 * TILE;

  drawText(ctx, `HI ${String(hi).padStart(6, '0')}`, VIEW_W / 2, 6, { align: 'center', color: PAL.y });
  const bounce = Math.round(Math.sin(tick / 20) * 2);
  drawLogo(ctx, "ROOTIN'", VIEW_W / 2, 22 + bounce, 4);
  drawLogo(ctx, "TOOTIN'", VIEW_W / 2, 56 - bounce, 4, PAL.f, PAL.F);
  drawText(ctx, "STARRING RUDY TOOTIN'", VIEW_W / 2, 94, { align: 'center' });
  drawMenu(ctx, TITLE_MENU, sel, tick);

  // Current controls, read from the live bindings (first slot of each action).
  const key = (id) => bindingName(bindings[id].find(Boolean));
  const hint = { align: 'center', color: PAL.w };
  drawText(ctx, `MOVE ${key('left')} / ${key('right')}   JUMP ${key('jump')}`, VIEW_W / 2, 138, hint);
  drawText(ctx, `SHOOT ${key('shoot')}   FART ${key('fart')}`, VIEW_W / 2, 149, hint);

  // Rudy, a toot, and some company.
  const toot = tick % 170;
  const rudySpr = toot < 16 ? S.rudyFart : S.rudyIdle;
  const rx = 92, ry = ground - (rudySpr.h - 1) * 2;
  if (toot < 50) {
    const k = toot / 50;
    for (let i = 0; i < 3; i++) {
      const r = 3 + k * (5 + i * 2);
      fillCircle(ctx, rx - 4 - k * (14 + i * 9), ground - 12 - i * 5 - k * 10, r, i === 1 ? PAL.F : PAL.f);
    }
  }
  drawSpriteScaled(ctx, rudySpr, rx, ry, 2);
  drawSpriteScaled(ctx, S.gun, rx + 26, ry + 14, 2);
  drawSpriteScaled(ctx, S.cactus, 22, ground - (S.cactus.h - 1) * 2, 2);
  const scuttle = (tick >> 3) & 1 ? S.scorpionA : S.scorpionB;
  drawSpriteScaled(ctx, scuttle, 178 + Math.round(Math.sin(tick / 40) * 6), ground - (scuttle.h - 1) * 2, 2, true);

  drawText(ctx, `${key('mute')}: SOUND ${muted ? 'OFF' : 'ON'}`, VIEW_W - 5, 228, { align: 'right', color: PAL.B, shadow: null });
}
