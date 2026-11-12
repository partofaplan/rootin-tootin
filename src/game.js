// World simulation. Pure logic (no DOM): driven by an input snapshot each
// 60Hz step, reports sounds through world.events, and is drawn by render.js.

import { TILE, LEVELS, parseLevel, moveBody, rectSolid, rectSecret, tileAt } from './level.js';

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
export const TURBO_FRAMES = 600; // easter egg: 10 seconds of rapid-fire farts
export const TURBO_RATE = 8; // frames between turbo farts

export const ENEMY = {
  scorpion: { w: 24, h: 12, hp: 2, score: 100 },
  bandit: { w: 12, h: 26, hp: 3, score: 200 },
  chupacabra: { w: 26, h: 16, hp: 2, score: 300 },
  rat: { w: 22, h: 10, hp: 1, score: 100 },
  madam: { w: 14, h: 28, hp: 3, score: 300 },
  boss: { w: 40, h: 50, hp: 40, score: 5000 },
};

export const BOSS_NAME = 'BIG FRANK';
export const BOSS_INTRO = 'YOU DONE IT NOW, RUDY! BIG FRANK IS GONNA MESS YOU UP!';
export const DIALOG_SPEED = 2; // frames per letter

export const NO_INPUT = Object.freeze({
  left: false, right: false, jump: false, jumpPressed: false, shoot: false, fartPressed: false,
});

const DUST = ['#f2d79a', '#dba864'];
const SPARK = ['#fbf5ef', '#f7d35c'];
const GORE = ['#f7d35c', '#e8843a', '#d0402f', '#fbf5ef'];
const GAS = ['#c6ec5a', '#7fb82a', '#e6f7a0'];
const GLASS = ['#9ad8b0', '#d8f4e0', '#5aa878', '#ffffff'];

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
    farts: 1, fartCd: 0, fartAnim: 0, turbo: 0,
    anim: 0,
  };
}

export function makeEnemy(type, cx, by) {
  const d = ENEMY[type];
  return {
    type, x: cx - d.w / 2, y: by - d.h, w: d.w, h: d.h, vx: 0, vy: 0,
    hp: d.hp, face: -1, pace: -1, state: 'idle', t: 0, cd: 40, flash: 0, anim: 0,
    homeX: cx - d.w / 2, onGround: false, hitWall: false, dead: false, cycle: 0,
  };
}

// opts: { levelIndex, mode: 'normal' | 'speedrun', god,
//         carry: { score, hp, farts, runTime } (from the previous level) }
export function createWorld(opts = {}) {
  const levelIndex = opts.levelIndex || 0;
  const def = LEVELS[levelIndex];
  const level = opts.level || parseLevel(def.rows);
  const w = {
    level,
    levelIndex,
    levelName: def.name,
    theme: def.theme, // 'desert' | 'saloon': picks the art
    lastLevel: levelIndex === LEVELS.length - 1,
    state: 'play', // play | dying | gameover | won
    stateT: 0,
    frame: 0,
    mode: opts.mode === 'speedrun' ? 'speedrun' : 'normal',
    runStart: 0, // frames already on the run clock when this level began
    time: 0, // frames spent playing this level
    score: 0,
    kills: 0,
    bonus: null,
    camX: 0,
    shake: 0,
    god: !!opts.god,
    secretFound: false,
    jumpHeld: false,
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
    target: null, // the trick dartboard (level 2 easter egg)
    boss: null,
    arena: null, // { x0, x1, locked }: the boss room
    dialog: null, // { who, text, t }: pauses the action while shown
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
      case 'r': w.enemies.push(makeEnemy('rat', cx, by)); break;
      case 'm': w.enemies.push(makeEnemy('madam', cx, by)); break;
      case 'F':
        w.boss = makeEnemy('boss', cx, by);
        w.boss.state = 'wait';
        w.enemies.push(w.boss);
        w.arena = { x0: level.pxW - VIEW_W, x1: level.pxW, locked: false };
        break;
      case 'D': w.target = { x: cx - 7, y: by - 15, w: 14, h: 14, cx, cy: by - 8, hit: false }; break;
      case 'B': w.pickups.push({ type: 'beans', x: cx - 6, y: by - 18, w: 12, h: 14, phase: s.col * 5 }); break;
      case 'H': w.pickups.push({ type: 'heart', x: cx - 6, y: by - 17, w: 13, h: 12, phase: s.col * 5 }); break;
      case 'C': w.hazards.push({ x: cx - 5, y: by - 28, w: 10, h: 28, cx, by }); break;
      case 'K': w.checkpoints.push({ x: cx, y: by, active: false }); break;
      case 'E': w.pickups.push({ type: 'chili', x: cx - 6, y: by - 16, w: 12, h: 14, phase: 0 }); break;
      case 'G': w.goal = { x: cx - 9, y: by - 30, w: 18, h: 30, cx, by }; break;
      default: throw new Error(`unknown spawn '${s.type}'`);
    }
  }
  if (!w.player) throw new Error('level has no player start');
  if (opts.carry) { // what Rudy brings from the previous level
    w.score = opts.carry.score;
    w.player.hp = opts.carry.hp;
    w.player.farts = opts.carry.farts;
    w.runStart = opts.carry.runTime || 0;
  }
  w.camX = cameraTarget(w);
  return w;
}

// Play time for the whole run so far (all levels), in frames.
export const runFrames = (w) => w.runStart + w.time;

function cameraTarget(w) {
  const p = w.player;
  if (w.arena && w.arena.locked) return w.arena.x0; // the boss room fills the screen
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
  if (w.god || p.turbo > 0) { if (pit) respawnPlayer(w); return; } // turbo: untouchable
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

// mini = one of the rapid-fire turbo farts: free, smaller on screen, no recoil.
function fart(w, mini = false) {
  const p = w.player;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  if (mini) {
    w.shake = Math.max(w.shake, 3);
    w.blasts.push({ x: cx, y: cy, t: 0, dur: 16, r: FART_RADIUS, mini: true });
    w.events.push('toot');
    burst(w, cx, cy, 7, GAS, 3, 34, 4, -0.012);
  } else {
    p.farts--;
    p.fartCd = 30;
    p.fartAnim = 24;
    w.shake = 14;
    w.blasts.push({ x: cx, y: cy, t: 0, dur: 26, r: FART_RADIUS });
    w.events.push('fart');
    burst(w, cx, cy, 40, GAS, 3.4, 50, 5, -0.012);
  }

  let kills = 0, pts = 0;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const nx = clamp(cx, e.x, e.x + e.w), ny = clamp(cy, e.y, e.y + e.h);
    if ((nx - cx) ** 2 + (ny - cy) ** 2 > FART_RADIUS ** 2) continue;
    const dmg = e.type === 'boss' ? (mini ? 1 : FART_DAMAGE * 2) : FART_DAMAGE;
    if (damageEnemy(w, e, dmg)) { kills++; pts += ENEMY[e.type].score; }
  }
  if (kills > 1) { // multi-kill: total is multiplied by the number of kills
    w.score += pts * (kills - 1);
    popup(w, cx, p.y - 14, `${kills}X COMBO!`);
  }
  w.ebullets = w.ebullets.filter((b) => (b.x - cx) ** 2 + (b.y - cy) ** 2 > (FART_RADIUS + 8) ** 2);
  if (!mini && !p.onGround) { p.vy = -4.2; p.noCut = 20; } // gas-powered double jump
}

function updatePlayer(w, inp) {
  const p = w.player, L = w.level;
  if (p.inv > 0) p.inv--;
  if (p.fartCd > 0) p.fartCd--;
  if (p.fartAnim > 0) p.fartAnim--;
  if (p.shootCd > 0) p.shootCd--;
  if (p.shootAnim > 0) p.shootAnim--;
  if (p.noCut > 0) p.noCut--;
  if (p.turbo > 0) { // the easter egg: fart continuously, fear nothing
    if (p.turbo % TURBO_RATE === 0) fart(w, true);
    if (--p.turbo === 0) { p.inv = 90; w.events.push('turboEnd'); } // short grace when it wears off
  }
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
    if (inp.fartPressed && p.farts > 0 && p.fartCd === 0 && p.turbo === 0) fart(w);
  }

  // Variable jump height: releasing jump early cuts the ascent.
  if (!inp.jump && p.vy < -1.5 && p.noCut === 0) p.vy = -1.5;
  p.vy = Math.min(p.vy + PHYS.G, PHYS.MAX_FALL);

  const wasOnGround = p.onGround;
  moveBody(L, p);
  if (w.arena && w.arena.locked && p.x < w.arena.x0) { p.x = w.arena.x0; p.vx = 0; } // no leaving the boss room
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
  if (e.state === 'dead') return false;
  e.hp -= dmg;
  e.flash = 6;
  if (e.hp <= 0 && e.type === 'boss') { // Big Frank goes down slowly (see updateEnemy)
    e.hp = 0;
    e.state = 'dead';
    e.t = 0;
    e.vx = 0;
    w.kills++;
    w.score += ENEMY.boss.score;
    w.ebullets = [];
    popup(w, cx, e.y - 8, String(ENEMY.boss.score));
    w.events.push('bossDown');
    return true;
  }
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

    case 'rat': // fast; makes a beeline for Rudy when he's close
      if (e.t > 0) e.t--;
      if (e.onGround) {
        if (dist < 110 && dy < 24 && e.t === 0) e.face = toward;
        if (e.hitWall || !groundAhead(L, e, e.face)) { e.face = -e.face; e.t = 40; }
        e.vx = 1.15 * e.face;
      }
      break;

    case 'madam': // stands her ground and lobs bottles
      e.vx = 0;
      e.face = toward;
      if (e.state === 'aim') {
        if (--e.t <= 0) { throwBottle(w, e.x + e.w / 2 + e.face * 8, e.y + 4); e.state = 'idle'; e.cd = 100; }
      } else {
        if (e.cd > 0) e.cd--;
        if (dist < 180 && e.cd <= 0) { e.state = 'aim'; e.t = 22; }
      }
      break;

    case 'boss':
      bossThink(w, e, toward);
      break;
  }

  e.vy = Math.min(e.vy + PHYS.G, PHYS.MAX_FALL);
  const leaping = e.state === 'leap';
  moveBody(L, e, !w.secretFound); // the false wall is solid to everyone but Rudy
  if (leaping && e.onGround) { e.state = 'idle'; e.cd = 45; e.vx = 0; }
  if (e.y > L.pxH + 32) e.dead = true; // fell in a pit: no score

  if (e.type === 'boss') {
    if (e.x < w.arena.x0) { e.x = w.arena.x0; e.hitWall = true; } // the left edge of his room is a wall to him
    if (e.state === 'hop' && e.onGround) { // belly-flop landing: shockwaves along the floor
      e.state = 'stagger';
      e.t = bossRage(e) ? 45 : 70;
      e.vx = 0;
      w.shake = 10;
      w.events.push('slam');
      burst(w, e.x + e.w / 2, e.y + e.h, 10, DUST, 2, 18, 3, 0);
      for (const dir of [-1, 1]) {
        w.ebullets.push({ type: 'shock', x: e.x + e.w / 2 + dir * 18 - 5, y: e.y + e.h - 8, w: 10, h: 8, vx: dir * 2.4, life: 90 });
      }
    }
    if (e.state === 'wait' || e.state === 'intro' || e.state === 'dead') return; // harmless
  }

  if (!e.dead && overlap(e, p)) {
    // Coming down on top of an enemy stomps it; touching it any other way hurts.
    const feetBefore = p.y + p.h - p.vy;
    if (p.vy > 0.5 && feetBefore <= e.y + Math.min(12, e.h * 0.6) + 1) stomp(w, e);
    else hurtPlayer(w, e.x + e.w / 2);
  }
}

// Rudy lands on an enemy: it dies (Big Frank just gets hurt) and Rudy bounces.
function stomp(w, e) {
  const p = w.player;
  p.y = e.y - p.h;
  p.vy = w.jumpHeld ? -5 : -3.6; // hold jump for a higher bounce
  p.noCut = 10;
  p.coyote = 0;
  w.events.push('stomp');
  burst(w, p.x + p.w / 2, p.y + p.h, 5, DUST, 1.4, 14, 2, 0);
  damageEnemy(w, e, e.type === 'boss' ? 3 : 99);
}

// A bottle lobbed in an arc so that it comes down on Rudy.
function throwBottle(w, x, y, frames = 52) {
  const p = w.player, g = 0.18;
  const tx = p.x + p.w / 2 + p.vx * frames * 0.4, ty = p.y + p.h / 2;
  w.ebullets.push({
    type: 'bottle', x: x - 3, y: y - 3, w: 6, h: 6, grav: g, life: 220, spin: w.rand() * 6,
    vx: clamp((tx - x) / frames, -3.2, 3.2),
    vy: (ty - y) / frames - 0.5 * g * frames,
  });
  w.events.push('throw');
}

// ---- Big Frank ------------------------------------------------------------------
// A big, fat, drunk cowboy. He weaves toward Rudy, then cycles through three
// attacks: a belly charge (he knocks himself dizzy on the wall: hit him then),
// a volley of bottles, and a belly-flop that sends shockwaves along the floor.
const bossRage = (e) => e.hp <= ENEMY.boss.hp / 2; // gets faster at half health

function bossThink(w, e, toward) {
  const rage = bossRage(e), k = rage ? 1.3 : 1;
  switch (e.state) {
    case 'wait':
    case 'intro':
      e.vx = 0;
      e.face = toward;
      break;
    case 'stagger':
      e.face = toward;
      e.vx = toward * 0.55 * k * (1 + 0.6 * Math.sin(e.anim / 8));
      if (--e.t <= 0) {
        const next = ['charge', 'throw', 'hop'][e.cycle++ % 3];
        e.vx = 0;
        if (next === 'charge') { e.state = 'windup'; e.t = rage ? 26 : 38; w.events.push('bossRoar'); }
        else if (next === 'throw') { e.state = 'throw'; e.t = 0; }
        else { e.state = 'hop'; e.vy = -5; e.vx = toward * 1.3 * k; w.events.push('pounce'); }
      }
      break;
    case 'windup':
      e.vx = 0;
      if (--e.t <= 0) { e.state = 'charge'; e.t = 160; e.hitWall = false; }
      break;
    case 'charge':
      if (e.hitWall) {
        e.state = 'dizzy';
        e.t = rage ? 80 : 110;
        e.vx = 0;
        w.shake = 12;
        w.events.push('slam');
        burst(w, e.face > 0 ? e.x + e.w : e.x, e.y + e.h / 2, 12, DUST, 2.4, 20, 3, 0.02);
      } else if (--e.t <= 0) { e.state = 'stagger'; e.t = 60; } else e.vx = e.face * 2.7 * k;
      break;
    case 'dizzy':
      e.vx = 0;
      if (--e.t <= 0) { e.state = 'stagger'; e.t = rage ? 50 : 80; }
      break;
    case 'throw': {
      const bottles = rage ? 4 : 3;
      e.vx = 0;
      e.face = toward;
      if (e.t % 24 === 12 && e.t < 24 * bottles) throwBottle(w, e.x + e.w / 2 + e.face * 16, e.y + 8);
      if (++e.t >= 24 * bottles + 10) { e.state = 'stagger'; e.t = rage ? 50 : 80; }
      break;
    }
    case 'dead': // he topples; the level ends when the dust settles
      e.vx = 0;
      if (e.t % 9 === 0 && e.t < 110) burst(w, e.x + w.rand() * e.w, e.y + w.rand() * e.h, 8, GORE, 2.2, 26, 3);
      if (++e.t === 150) finishLevel(w);
      break;
  }
}

function finishLevel(w) {
  const p = w.player;
  const time = Math.max(0, 3000 - Math.floor(w.time / 60) * 10);
  const hearts = p.hp * 500;
  w.bonus = { time, hearts, kills: w.kills, seconds: Math.floor(w.time / 60), runFrames: runFrames(w) };
  w.score += time + hearts;
  w.state = 'won';
  w.stateT = 0;
  p.vx = 0;
  w.bullets = [];
  w.ebullets = [];
  w.events.push('win');
}

// ---- world --------------------------------------------------------------------
function updatePlay(w, inp) {
  const p = w.player, L = w.level;
  w.time++;
  w.jumpHeld = inp.jump;
  updatePlayer(w, inp);
  if (w.state !== 'play') return;

  // Walking into Big Frank's room locks the door and starts his speech.
  if (w.boss && !w.arena.locked && p.x > w.arena.x0 + 20) {
    w.arena.locked = true;
    w.boss.state = 'intro';
    w.dialog = { who: BOSS_NAME, text: BOSS_INTRO, t: 0 };
    p.vx = 0;
    w.events.push('bossIntro');
  }

  // The secret cave: revealed the moment Rudy steps through the false wall.
  if (!w.secretFound) {
    const mouth = L.secretMouth;
    if (rectSecret(L, p.x, p.y, p.w, p.h)) {
      w.secretFound = true;
      w.events.push('secret');
      popup(w, p.x + p.w / 2, p.y - 18, 'SECRET!');
    } else if (mouth && w.frame % 90 === 0 && Math.abs(mouth.x - w.camX - VIEW_W / 2) < VIEW_W / 2) {
      // the only clue: now and then a little gas seeps out of the rock
      w.particles.push({ x: mouth.x, y: mouth.y - 12 - w.rand() * 12, vx: 0.25, vy: -0.12, grav: -0.004, size: 2, life: 70, max: 70, color: GAS[0] });
    }
  }

  // Rudy's bullets
  for (const b of w.bullets) {
    b.x += b.vx;
    b.life--;
    if (b.life <= 0 || b.x < w.camX - 16 || b.x > w.camX + VIEW_W + 16) { b.dead = true; continue; }
    if (rectSolid(L, b.x, b.y, b.w, b.h, !w.secretFound)) {
      b.dead = true;
      burst(w, b.x + 2, b.y, 3, SPARK, 1, 8, 1);
      continue;
    }
    if (w.target && !w.target.hit && overlap(b, w.target)) { // bullseye: the trick dartboard
      b.dead = true;
      hitTarget(w);
      continue;
    }
    for (const e of w.enemies) {
      if (e.dead || e.state === 'dead' || !overlap(b, e)) continue;
      b.dead = true;
      damageEnemy(w, e, e.state === 'dizzy' ? 2 : 1); // a dizzy Frank takes double
      break;
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
  for (const b of w.ebullets) { // slugs fly straight, bottles arc, shockwaves hug the floor
    b.x += b.vx;
    if (b.grav) { b.vy += b.grav; b.y += b.vy; }
    b.life--;
    const outOfRoom = b.type === 'shock' && w.arena && b.x < w.arena.x0;
    if (b.life <= 0 || outOfRoom || rectSolid(L, b.x, b.y, b.w, b.h, !w.secretFound)) b.dead = true;
    else if (overlap(b, p) && p.inv === 0) { b.dead = true; hurtPlayer(w, b.x - b.vx * 4); }
    if (b.dead && b.type === 'bottle') {
      burst(w, b.x + 3, b.y + 3, 8, GLASS, 1.8, 20, 2);
      w.events.push('smash');
    }
  }
  w.ebullets = w.ebullets.filter((b) => !b.dead);
  if (w.state !== 'play') return;

  for (const hz of w.hazards) {
    if (overlap(hz, p)) hurtPlayer(w, hz.cx);
  }
  if (w.state !== 'play') return;

  for (const k of w.pickups) {
    if (k.fallTo !== undefined && k.y < k.fallTo) k.y = Math.min(k.fallTo, k.y + 3); // dropping to the floor
    if (!overlap(k, p)) continue;
    k.dead = true;
    w.score += 50;
    w.events.push('pickup');
    if (k.type === 'beans') {
      p.farts = Math.min(MAX_FARTS, p.farts + 1);
      popup(w, k.x + 5, k.y - 4, 'BEANS!');
    } else if (k.type === 'chili') {
      p.turbo = TURBO_FRAMES;
      w.score += 950; // 1000 in all
      w.events[w.events.length - 1] = 'turbo';
      popup(w, k.x + 5, k.y - 6, '5-ALARM CHILI!');
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

  if (w.goal && overlap(w.goal, p)) finishLevel(w);
}

// The level 2 easter egg: shooting the trick dartboard drops the chili.
function hitTarget(w) {
  const t = w.target, L = w.level;
  t.hit = true;
  w.secretFound = true;
  w.events.push('secret');
  popup(w, t.cx, t.y - 10, 'BULLSEYE!');
  burst(w, t.cx, t.cy, 14, SPARK, 2.4, 26, 2);
  let row = Math.floor(t.cy / TILE);
  while (row < L.h && !tileAt(L, Math.floor(t.cx / TILE), row)) row++;
  w.pickups.push({ type: 'chili', x: t.cx - 6, y: t.cy - 7, w: 12, h: 14, phase: 0, fallTo: row * TILE - 16 });
}

export function updateWorld(w, inp = NO_INPUT) {
  w.frame++;
  w.stateT++;
  if (w.shake > 0) w.shake--;

  if (w.state === 'play' && w.dialog) {
    // A speech bubble freezes the action. Jump, shoot or fart skips ahead,
    // first to the end of the line and then on with the fight.
    const d = w.dialog, full = d.text.length * DIALOG_SPEED;
    const press = inp.jumpPressed || inp.fartPressed || (inp.shoot && !d.held);
    d.held = inp.shoot;
    d.t++;
    if (press && d.t < full) d.t = full;
    else if ((press && d.t > full + 10) || d.t > full + 300) {
      w.dialog = null;
      if (w.boss && w.boss.state === 'intro') { w.boss.state = 'stagger'; w.boss.t = 50; w.events.push('boss'); }
    }
  } else if (w.state === 'play') updatePlay(w, inp);
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
