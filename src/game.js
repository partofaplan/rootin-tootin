// World simulation. Pure logic (no DOM): driven by an input snapshot each
// 60Hz step, reports sounds through world.events, and is drawn by render.js.

import { TILE, parseLevel, moveBody, rectSolid, tileAt } from './level.js';

export const VIEW_W = 256;
export const VIEW_H = 240;

export const PHYS = {
  G: 0.25, // px/frame^2
  JUMP: -5.4,
  RUN: 1.6,
  MAX_FALL: 5,
  BULLET: 4,
  COYOTE: 6,
  INVULN: 90,
};

export const MAX_HP = 3;
export const CLIP = 6;
export const RELOAD_FRAMES = 42;
export const MAX_FARTS = 3;
export const FART_RADIUS = 64;
export const FART_DAMAGE = 3;

export const ENEMY = {
  scorpion: { w: 24, h: 12, hp: 2, score: 100 },
  bandit: { w: 12, h: 26, hp: 3, score: 200 },
  chupacabra: { w: 26, h: 16, hp: 2, score: 300 },
};

export const NO_INPUT = Object.freeze({
  left: false, right: false, jump: false, jumpPressed: false, shoot: false, fartPressed: false,
});

const DUST = ['#f2d79a', '#dba864'];
const SPARK = ['#fbf5ef', '#f7d35c'];
const GORE = ['#f7d35c', '#e8843a', '#d0402f', '#fbf5ef'];
const GAS = ['#c6ec5a', '#7fb82a', '#e6f7a0'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function makePlayer(cx, by) {
  const w = 12, h = 20;
  return {
    x: cx - w / 2, y: by - h, w, h, vx: 0, vy: 0, face: 1,
    onGround: false, hitWall: false, coyote: 0, jumpBuf: 0, noCut: 0,
    hp: MAX_HP, inv: 0, stun: 0,
    ammo: CLIP, reload: 0, shootCd: 0, shootAnim: 0,
    farts: 1, fartCd: 0, fartAnim: 0,
    anim: 0,
  };
}

export function makeEnemy(type, cx, by) {
  const d = ENEMY[type];
  return {
    type, x: cx - d.w / 2, y: by - d.h, w: d.w, h: d.h, vx: 0, vy: 0,
    hp: d.hp, face: -1, pace: -1, state: 'idle', t: 0, cd: 40, flash: 0, anim: 0,
    homeX: cx - d.w / 2, onGround: false, hitWall: false, dead: false,
  };
}

export function createWorld(opts = {}) {
  const level = opts.level || parseLevel();
  const w = {
    level,
    state: 'play', // play | dying | gameover | won
    stateT: 0,
    frame: 0,
    time: 0, // frames spent playing
    score: 0,
    kills: 0,
    bonus: null,
    camX: 0,
    shake: 0,
    god: !!opts.god,
    rand: mulberry32(1337),
    events: [],
    player: null,
    respawn: null,
    enemies: [],
    bullets: [],
    ebullets: [],
    pickups: [],
    hazards: [],
    checkpoints: [],
    goal: null,
    particles: [],
    blasts: [],
    popups: [],
  };
  for (const s of level.spawns) {
    const cx = s.col * TILE + TILE / 2;
    const by = (s.row + 1) * TILE;
    switch (s.type) {
      case 'P': w.player = makePlayer(cx, by); w.respawn = { x: cx, y: by }; break;
      case 's': w.enemies.push(makeEnemy('scorpion', cx, by)); break;
      case 'b': w.enemies.push(makeEnemy('bandit', cx, by)); break;
      case 'c': w.enemies.push(makeEnemy('chupacabra', cx, by)); break;
      case 'B': w.pickups.push({ type: 'beans', x: cx - 6, y: by - 18, w: 12, h: 14, phase: s.col * 5 }); break;
      case 'H': w.pickups.push({ type: 'heart', x: cx - 6, y: by - 17, w: 13, h: 12, phase: s.col * 5 }); break;
      case 'C': w.hazards.push({ x: cx - 5, y: by - 28, w: 10, h: 28, cx, by }); break;
      case 'K': w.checkpoints.push({ x: cx, y: by, active: false }); break;
      case 'G': w.goal = { x: cx - 9, y: by - 30, w: 18, h: 30, cx, by }; break;
      default: throw new Error(`unknown spawn '${s.type}'`);
    }
  }
  if (!w.player) throw new Error('level has no player start');
  w.camX = cameraTarget(w);
  return w;
}

function cameraTarget(w) {
  const p = w.player;
  return clamp(p.x + p.w / 2 - VIEW_W / 2 + p.face * 16, 0, w.level.pxW - VIEW_W);
}

// ---- effects ----------------------------------------------------------------
function burst(w, x, y, n, colors, speed, life, size = 2, grav = 0.06) {
  for (let i = 0; i < n; i++) {
    const a = w.rand() * Math.PI * 2;
    const s = speed * (0.3 + w.rand() * 0.7);
    w.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav, size,
      life: Math.round(life * (0.6 + w.rand() * 0.4)), max: life,
      color: colors[Math.floor(w.rand() * colors.length)],
    });
  }
  if (w.particles.length > 400) w.particles.splice(0, w.particles.length - 400);
}

function popup(w, x, y, text) {
  w.popups.push({ x, y, text, t: 0, life: 50 });
}

// ---- player -------------------------------------------------------------------
function respawnPlayer(w) {
  const p = w.player;
  p.x = w.respawn.x - p.w / 2;
  p.y = w.respawn.y - p.h;
  p.vx = 0; p.vy = 0; p.stun = 0; p.face = 1;
  w.camX = cameraTarget(w);
}

export function hurtPlayer(w, fromX, pit = false) {
  const p = w.player;
  if (w.state !== 'play') return;
  if (w.god) { if (pit) respawnPlayer(w); return; }
  if (!pit && p.inv > 0) return;
  p.hp--;
  w.shake = 8;
  if (p.hp <= 0) {
    w.state = 'dying';
    w.stateT = 0;
    p.vx = 0; p.vy = -4;
    w.events.push('die');
    return;
  }
  w.events.push('hurt');
  p.inv = PHYS.INVULN;
  if (pit) respawnPlayer(w);
  else {
    p.stun = 14; p.noCut = 14;
    p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 1.8;
    p.vy = -2.6;
  }
}

function fart(w) {
  const p = w.player;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  p.farts--;
  p.fartCd = 30;
  p.fartAnim = 24;
  w.shake = 14;
  w.blasts.push({ x: cx, y: cy, t: 0, dur: 26, r: FART_RADIUS });
  w.events.push('fart');
  burst(w, cx, cy, 40, GAS, 3.4, 50, 5, -0.012);

  let kills = 0, pts = 0;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const nx = clamp(cx, e.x, e.x + e.w), ny = clamp(cy, e.y, e.y + e.h);
    if ((nx - cx) ** 2 + (ny - cy) ** 2 > FART_RADIUS ** 2) continue;
    if (damageEnemy(w, e, FART_DAMAGE)) { kills++; pts += ENEMY[e.type].score; }
  }
  if (kills > 1) { // multi-kill: total is multiplied by the number of kills
    w.score += pts * (kills - 1);
    popup(w, cx, p.y - 14, `${kills}X COMBO!`);
  }
  w.ebullets = w.ebullets.filter((b) => (b.x - cx) ** 2 + (b.y - cy) ** 2 > (FART_RADIUS + 8) ** 2);
  if (!p.onGround) { p.vy = -4.2; p.noCut = 20; } // gas-powered double jump
}

function updatePlayer(w, inp) {
  const p = w.player, L = w.level;
  if (p.inv > 0) p.inv--;
  if (p.fartCd > 0) p.fartCd--;
  if (p.fartAnim > 0) p.fartAnim--;
  if (p.shootCd > 0) p.shootCd--;
  if (p.shootAnim > 0) p.shootAnim--;
  if (p.noCut > 0) p.noCut--;
  if (p.reload > 0 && --p.reload === 0) { p.ammo = CLIP; w.events.push('reload'); }

  if (p.stun > 0) p.stun--;
  else {
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const target = dir * PHYS.RUN;
    const acc = p.onGround ? 0.25 : 0.18;
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - acc);
    if (dir) p.face = dir;

    if (inp.jumpPressed) p.jumpBuf = 6;
    else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = PHYS.JUMP;
      p.coyote = 0; p.jumpBuf = 0;
      w.events.push('jump');
      burst(w, p.x + p.w / 2, p.y + p.h, 4, DUST, 0.8, 14, 2, 0);
    }
    if (inp.shoot && p.shootCd === 0 && p.reload === 0 && p.ammo > 0) {
      p.ammo--;
      p.shootCd = 12;
      p.shootAnim = 6;
      w.bullets.push({ x: p.face > 0 ? p.x + p.w + 8 : p.x - 14, y: p.y + 9, w: 6, h: 3, vx: PHYS.BULLET * p.face, life: 70 });
      w.events.push('shoot');
      if (p.ammo === 0) p.reload = RELOAD_FRAMES;
    }
    if (inp.fartPressed && p.farts > 0 && p.fartCd === 0) fart(w);
  }

  // Variable jump height: releasing jump early cuts the ascent.
  if (!inp.jump && p.vy < -1.5 && p.noCut === 0) p.vy = -1.5;
  p.vy = Math.min(p.vy + PHYS.G, PHYS.MAX_FALL);

  const wasOnGround = p.onGround;
  moveBody(L, p);
  if (p.onGround) {
    p.coyote = PHYS.COYOTE;
    if (!wasOnGround) burst(w, p.x + p.w / 2, p.y + p.h, 3, DUST, 0.6, 12, 2, 0);
    if (Math.abs(p.vx) > 0.3) p.anim++;
  } else if (p.coyote > 0) p.coyote--;

  if (p.y > L.pxH + 24) hurtPlayer(w, 0, true);
}

// ---- enemies ------------------------------------------------------------------
function groundAhead(L, e, dir) {
  const fx = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  return !!tileAt(L, Math.floor(fx / TILE), Math.floor((e.y + e.h + 1) / TILE));
}

// Returns true if the enemy died.
export function damageEnemy(w, e, dmg) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  e.hp -= dmg;
  e.flash = 6;
  if (e.hp <= 0) {
    e.dead = true;
    w.kills++;
    w.score += ENEMY[e.type].score;
    popup(w, cx, e.y - 4, String(ENEMY[e.type].score));
    burst(w, cx, cy, 16, GORE, 2.4, 32, 3);
    w.events.push('kill');
    return true;
  }
  burst(w, cx, cy, 4, SPARK, 1.2, 12, 1);
  w.events.push('hit');
  return false;
}

function updateEnemy(w, e) {
  const p = w.player, L = w.level;
  const dx = p.x + p.w / 2 - (e.x + e.w / 2);
  const dist = Math.abs(dx);
  const dy = Math.abs(p.y + p.h - (e.y + e.h));
  const toward = dx >= 0 ? 1 : -1;
  if (e.flash > 0) e.flash--;
  e.anim++;

  switch (e.type) {
    case 'scorpion':
      if (e.onGround && (e.hitWall || !groundAhead(L, e, e.face))) e.face = -e.face;
      if (e.onGround) e.vx = 0.45 * e.face;
      break;

    case 'bandit':
      if (e.state === 'aim') {
        e.vx = 0;
        if (--e.t <= 0) {
          w.ebullets.push({ x: e.face > 0 ? e.x + e.w + 8 : e.x - 13, y: e.y + 9, w: 5, h: 5, vx: 2 * e.face, life: 150 });
          w.events.push('eshoot');
          e.state = 'idle';
          e.cd = 110;
        }
      } else {
        if (e.cd > 0) e.cd--;
        if (dist < 150 && dy < 28) {
          e.face = toward;
          e.vx = 0;
          if (e.cd <= 0) { e.state = 'aim'; e.t = 24; }
        } else {
          if (e.hitWall || (e.onGround && !groundAhead(L, e, e.pace)) || (e.x - e.homeX) * e.pace > 20) e.pace = -e.pace;
          e.face = e.pace;
          e.vx = e.onGround ? 0.25 * e.pace : 0;
        }
      }
      break;

    case 'chupacabra':
      if (e.state === 'crouch') {
        e.vx = 0;
        if (--e.t <= 0) { e.state = 'leap'; e.vx = 2.5 * e.face; e.vy = -3.6; w.events.push('pounce'); }
      } else if (e.state !== 'leap') {
        e.face = toward;
        if (e.cd > 0) { e.cd--; e.vx = 0; }
        else if (dist < 80 && dy < 40 && e.onGround) { e.state = 'crouch'; e.t = 22; e.vx = 0; }
        else if (dist < 200 && e.onGround) {
          if (e.hitWall || !groundAhead(L, e, e.face)) { e.state = 'leap'; e.vx = 1.8 * e.face; e.vy = -4; }
          else e.vx = 0.9 * e.face;
        } else if (e.onGround) e.vx = 0;
      }
      break;
  }

  e.vy = Math.min(e.vy + PHYS.G, PHYS.MAX_FALL);
  const leaping = e.state === 'leap';
  moveBody(L, e);
  if (leaping && e.onGround) { e.state = 'idle'; e.cd = 45; e.vx = 0; }
  if (e.y > L.pxH + 32) e.dead = true; // fell in a pit: no score

  if (!e.dead && overlap(e, p)) hurtPlayer(w, e.x + e.w / 2);
}

// ---- world --------------------------------------------------------------------
function updatePlay(w, inp) {
  const p = w.player, L = w.level;
  w.time++;
  updatePlayer(w, inp);
  if (w.state !== 'play') return;

  // Rudy's bullets
  for (const b of w.bullets) {
    b.x += b.vx;
    b.life--;
    if (b.life <= 0 || b.x < w.camX - 16 || b.x > w.camX + VIEW_W + 16) { b.dead = true; continue; }
    if (rectSolid(L, b.x, b.y, b.w, b.h)) {
      b.dead = true;
      burst(w, b.x + 2, b.y, 3, SPARK, 1, 8, 1);
      continue;
    }
    for (const e of w.enemies) {
      if (!e.dead && overlap(b, e)) { b.dead = true; damageEnemy(w, e, 1); break; }
    }
  }
  w.bullets = w.bullets.filter((b) => !b.dead);

  // Enemies only wake up near the camera.
  for (const e of w.enemies) {
    if (e.dead) continue;
    if (e.x + e.w < w.camX - 48 || e.x > w.camX + VIEW_W + 48) continue;
    updateEnemy(w, e);
    if (w.state !== 'play') return;
  }
  w.enemies = w.enemies.filter((e) => !e.dead);

  // Enemy bullets
  for (const b of w.ebullets) {
    b.x += b.vx;
    b.life--;
    if (b.life <= 0 || rectSolid(L, b.x, b.y, b.w, b.h)) b.dead = true;
    else if (overlap(b, p) && p.inv === 0) { b.dead = true; hurtPlayer(w, b.x - b.vx * 4); }
  }
  w.ebullets = w.ebullets.filter((b) => !b.dead);
  if (w.state !== 'play') return;

  for (const hz of w.hazards) {
    if (overlap(hz, p)) hurtPlayer(w, hz.cx);
  }
  if (w.state !== 'play') return;

  for (const k of w.pickups) {
    if (!overlap(k, p)) continue;
    k.dead = true;
    w.score += 50;
    w.events.push('pickup');
    if (k.type === 'beans') {
      p.farts = Math.min(MAX_FARTS, p.farts + 1);
      popup(w, k.x + 5, k.y - 4, 'BEANS!');
    } else {
      p.hp = Math.min(MAX_HP, p.hp + 1);
      popup(w, k.x + 5, k.y - 4, '+1');
    }
  }
  w.pickups = w.pickups.filter((k) => !k.dead);

  for (const cp of w.checkpoints) {
    if (!cp.active && p.x + p.w / 2 >= cp.x) {
      cp.active = true;
      w.respawn = { x: cp.x, y: cp.y };
      w.events.push('checkpoint');
      popup(w, cp.x, cp.y - 50, 'CHECKPOINT');
    }
  }

  if (w.goal && overlap(w.goal, p)) {
    const time = Math.max(0, 3000 - Math.floor(w.time / 60) * 10);
    const hearts = p.hp * 500;
    w.bonus = { time, hearts, kills: w.kills, seconds: Math.floor(w.time / 60) };
    w.score += time + hearts;
    w.state = 'won';
    w.stateT = 0;
    p.vx = 0;
    w.events.push('win');
  }
}

export function updateWorld(w, inp = NO_INPUT) {
  w.frame++;
  w.stateT++;
  if (w.shake > 0) w.shake--;

  if (w.state === 'play') updatePlay(w, inp);
  else if (w.state === 'dying') {
    const p = w.player; // classic hop-and-drop off the screen
    p.vy = Math.min(p.vy + PHYS.G, PHYS.MAX_FALL);
    p.y += p.vy;
    if (w.stateT > 100) { w.state = 'gameover'; w.stateT = 0; }
  }

  for (const q of w.particles) {
    q.x += q.vx; q.y += q.vy; q.vy += q.grav; q.vx *= 0.96; q.life--;
  }
  w.particles = w.particles.filter((q) => q.life > 0);
  for (const b of w.blasts) b.t++;
  w.blasts = w.blasts.filter((b) => b.t < b.dur);
  for (const t of w.popups) { t.t++; t.y -= 0.4; }
  w.popups = w.popups.filter((t) => t.t < t.life);

  if (w.state === 'play' || w.state === 'won') w.camX += (cameraTarget(w) - w.camX) * 0.1;
}
