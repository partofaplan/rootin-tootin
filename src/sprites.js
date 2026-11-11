// Art data (no DOM, so it can be validated under Node).
// Sprites and tiles are built procedurally with the Pix rasterizer from
// shaded shapes and colour ramps; the font is a 5x7 bitmap.

import { Pix, prng } from './pixels.js';

// Flat UI colours (text, HUD, menus).
export const PAL = {
  k: '#1a1420', // near black
  w: '#fdf8ee', // white
  l: '#c8c8d8', // light grey
  g: '#8a8d9c', // grey
  d: '#474656', // dark grey
  y: '#ffd75e', // yellow
  o: '#f08a3c', // orange
  r: '#e04a36', // red
  R: '#8c2330', // dark red
  B: '#5a2e1a', // dark brown
  f: '#cdf06a', // fart green
  F: '#86c23a', // dark fart green
};

// Colour ramps, dark -> light.
export const RAMP = {
  hat: ['#3f2412', '#6b3d1c', '#96592b', '#bd7b40', '#dba05c'],
  skin: ['#9c5a3c', '#cf8a5e', '#efb98a', '#ffd9b0'],
  nose: ['#b05a3c', '#e08a62', '#f8b08a'],
  stache: ['#1f1008', '#3a2010', '#5a3418', '#7a4a24'],
  red: ['#6e1626', '#a8242c', '#d8423a', '#f4705a'],
  vest: ['#3a2010', '#5e3618', '#84522a', '#a87040'],
  jeans: ['#1f2f5e', '#30508f', '#4a78c0', '#78a8e4'],
  boot: ['#2a1810', '#4a2c18', '#70452a', '#946238'],
  steel: ['#3a3d50', '#6a6e84', '#a2a6b8', '#dfe2ec'],
  gold: ['#8a5a14', '#d49a28', '#ffd75e', '#fff3b0'],
  scorp: ['#6e2412', '#a8421a', '#d8702a', '#f4a04a', '#ffd088'],
  scorpDark: ['#4e1a10', '#7e3016', '#a84a1e'],
  sting: ['#7a2a14', '#d0601c', '#ffc040'],
  dark: ['#15131c', '#2a2836', '#434154', '#63607a'],
  poncho: ['#35204e', '#553278', '#7a4ea2', '#a57ac8'],
  hide: ['#28243a', '#443f5a', '#67617e', '#8d88a4', '#b6b2c8'],
  hideDark: ['#1c1a2a', '#34304a', '#4e4966'],
  spine: ['#5a1020', '#9a2030', '#d04848'],
  cactus: ['#1c4a28', '#2f7a36', '#56a846', '#8ed060', '#c2f090'],
  flower: ['#a02a6a', '#e05a8a', '#ffa0c0'],
  label: ['#2f6b2e', '#5fa33a', '#9ad060'],
  heart: ['#7a1024', '#b81e30', '#e8403c', '#ff7868'],
  empty: ['#22202c', '#302e3c', '#403e4e', '#4c4a5c'],
  cloud: ['#a9c0e2', '#cfdcf0', '#eef4fb', '#ffffff'],
  pebble: ['#8f6030', '#b98850', '#e0b880'],
};
const INK = '#1a1420';
const WHITE = '#ffffff';

// ---- Rudy Tootin' (26x28, faces right, feet on the bottom row) ----------------
// A pose is: legs [[hipX, hipY, ankleX, ankleY, bootX, bootY] x2 (far, near)],
// bob (upper body offset in px), eyes ('open' | 'shut' | 'dazed'), arms ('gun' | 'up').
const POSES = {
  idle: { legs: [[10.5, 22.5, 10.3, 25.3, 10.8, 26.4], [15.5, 22.5, 15.7, 25.3, 16.4, 26.4]] },
  runA: { bob: 1, legs: [[11, 23.5, 7.5, 24.9, 6.6, 25.7], [15, 23.5, 18.5, 25.3, 19.6, 26.4]] },
  runB: { legs: [[12, 22.5, 11.5, 25.3, 12, 26.4], [14, 22.5, 15, 24.4, 16, 25.2]] },
  runC: { bob: 1, legs: [[15, 23.5, 9, 24.9, 8, 25.7], [11, 23.5, 16.5, 25.3, 17.6, 26.4]] },
  jump: { legs: [[11, 22.5, 8, 24.2, 7, 25.2], [15, 22.5, 18.2, 24, 19.4, 24.8]] },
  fart: { bob: 2, eyes: 'shut', legs: [[10.5, 24.5, 7, 25.4, 6.2, 26.4], [15.5, 24.5, 19, 25.4, 19.8, 26.4]] },
  hurt: { eyes: 'dazed', arms: 'up', legs: [[11, 22.5, 8, 24.2, 7, 25.2], [15, 22.5, 18.2, 24, 19.4, 24.8]] },
};

function rudy(pose) {
  const p = new Pix(26, 28);
  const b = pose.bob || 0;
  const armsUp = pose.arms === 'up';
  const R = RAMP;

  // back arm
  if (armsUp) { p.limb(7.5, 17.5 + b, 5, 14.5 + b, 1.5, R.red); p.ball(4.5, 13.6 + b, 1.4, 1.4, R.skin); }
  else { p.limb(7.5, 17.5 + b, 6.2, 21 + b, 1.5, R.red); p.ball(6, 22 + b, 1.4, 1.4, R.skin); }

  for (const [hx, hy, ax, ay, bx, by] of pose.legs) {
    p.limb(hx, hy, ax, ay, 1.9, R.jeans);
    p.ball(bx, by, 2.9, 1.5, R.boot);
  }
  p.ball(13, 22.2 + b, 5.4, 1.9, R.jeans); // hips

  // barrel chest: red shirt, leather vest, tin star, belt
  p.ball(13, 19 + b, 6.2, 4.2, R.red);
  p.ball(9.2, 19.2 + b, 2.4, 3.6, R.vest);
  p.ball(16.8, 19.2 + b, 2.4, 3.6, R.vest);
  p.px(16, 18 + b, R.gold[3]).px(17, 18 + b, R.gold[1]);
  p.rect(8, 22 + b, 10, 1, R.boot[0]);
  p.px(12, 22 + b, R.gold[1]).px(13, 22 + b, R.gold[2]);

  p.ball(13, 16.3 + b, 4.6, 1.6, R.red); // bandana

  // head
  p.ball(13, 11 + b, 5.6, 4.6, R.skin);
  if (pose.eyes === 'shut') {
    p.rect(11, 10 + b, 2, 1, INK).rect(15, 10 + b, 2, 1, INK);
    p.px(9, 12 + b, R.red[3]).px(18, 12 + b, R.red[3]); // straining
  } else if (pose.eyes === 'dazed') {
    p.rect(11, 9 + b, 2, 2, WHITE).rect(15, 9 + b, 2, 2, WHITE);
    p.px(11, 9 + b, INK).px(12, 10 + b, INK).px(15, 10 + b, INK).px(16, 9 + b, INK);
  } else {
    p.rect(11, 9 + b, 2, 2, WHITE).rect(15, 9 + b, 2, 2, WHITE);
    p.rect(12, 9 + b, 1, 2, INK).rect(16, 9 + b, 1, 2, INK);
  }
  p.ball(18, 11.6 + b, 1.6, 1.3, R.nose);

  // the mustache
  p.ball(6.2, 14.3 + b, 1.5, 1.4, R.stache);
  p.ball(20.2, 14.3 + b, 1.5, 1.4, R.stache);
  p.ball(10, 13.2 + b, 3.8, 1.6, R.stache);
  p.ball(16.4, 13.2 + b, 3.8, 1.6, R.stache);

  // hat
  p.ball(13, 3.6 + b, 5, 3.6, R.hat);
  p.rect(9, 5 + b, 8, 1, R.red[1]);
  p.px(9, 5 + b, R.red[2]).px(10, 5 + b, R.red[3]);
  p.ball(13, 6.6 + b, 11, 1.8, R.hat);

  // front arm, held out for the six-shooter
  if (armsUp) { p.limb(18, 18 + b, 21, 14.5 + b, 1.5, R.red); p.ball(21.6, 13.6 + b, 1.5, 1.5, R.skin); }
  else { p.limb(18, 18 + b, 21.5, 19 + b, 1.5, R.red); p.ball(22.6, 19 + b, 1.5, 1.5, R.skin); }

  p.meta = { bob: b, gun: !armsUp };
  return p;
}

// Six-shooter (12x7), drawn over Rudy's front hand. Muzzle is at the right edge.
function gun() {
  const p = new Pix(12, 7);
  p.limb(1.7, 3.8, 1.3, 6, 1.2, RAMP.vest);
  p.box(3, 1, 9, 2, RAMP.steel);
  p.px(11, 0, RAMP.steel[1]);
  p.ball(3.6, 2.6, 2.6, 2.3, RAMP.steel);
  p.px(3, 2, RAMP.steel[0]).px(5, 3, RAMP.steel[0]);
  return p;
}

// ---- Giant scorpion (36x22, faces right) --------------------------------------
function scorpion(frame) {
  const p = new Pix(36, 22);
  const S = RAMP.scorp, D = RAMP.scorpDark;
  const f = frame ? 1.4 : -1.4;

  // far claw
  p.limb(23, 16.6, 28, 17.2, 1.2, D);
  p.ball(31, 17.4, 2.8, 2, D);
  p.poly([[31.6, 17.2], [35, 16], [35, 18.6]], null, true);

  // legs: four on the near side, splayed, feet shuffling
  for (let i = 0; i < 4; i++) {
    const bx = 9 + i * 4, dir = i - 1.5, step = i % 2 ? f : -f;
    p.limb(bx, 16.5, bx + dir * 1.2, 15.2, 1, D);
    p.limb(bx + dir * 1.2, 15.2, bx + dir * 2.4 + step, 21.2, 0.9, D);
  }

  // tail: a chain of segments curling over the back
  for (const [x, y, r] of [[5.6, 12.6, 2.5], [3.8, 9.2, 2.3], [4.6, 5.8, 2.2], [7.4, 3.3, 2.1], [10.8, 2.7, 2], [13.6, 3.9, 1.9]]) {
    p.ball(x, y, r, r, S);
  }
  p.poly([[12.5, 5], [15.5, 4.6], [15.3, 9.4]], RAMP.sting);

  // armoured body
  p.ball(8.5, 15.5, 3.6, 3, S);
  p.ball(12.5, 15, 4, 3.4, S);
  p.ball(17, 15, 4.2, 3.5, S);
  p.ball(21.5, 15.2, 3.8, 3.2, S);
  p.px(22, 13, INK).px(24, 14, INK).px(23, 13, WHITE);

  // near claw, pincer open
  p.limb(24, 13.6, 28, 10.6, 1.3, S);
  p.ball(30.8, 9, 3.3, 2.6, S);
  p.poly([[31, 8.8], [35.5, 7], [35.5, 10.4]], null, true);
  return p;
}

// ---- Bandit (30x32, faces right) -----------------------------------------------
function bandit(frame) {
  const p = new Pix(30, 32);
  const D = RAMP.dark, P = RAMP.poncho;

  if (frame) {
    p.limb(13, 23, 11, 28.4, 1.8, D); p.ball(11.4, 30.3, 2.9, 1.5, RAMP.boot);
    p.limb(17, 23, 19, 28.4, 1.8, D); p.ball(19.8, 30.3, 2.9, 1.5, RAMP.boot);
  } else {
    p.limb(13, 23, 12.6, 28.6, 1.8, D); p.ball(13.2, 30.3, 2.9, 1.5, RAMP.boot);
    p.limb(17, 23, 17.4, 28.6, 1.8, D); p.ball(18.2, 30.3, 2.9, 1.5, RAMP.boot);
  }

  // poncho with a woven stripe
  p.poly([[10, 13], [20, 13], [23.6, 25], [6.4, 25]], P);
  p.ball(15, 14.4, 5.6, 2.2, P);
  p.rect(8, 20, 14, 1, P[3]);
  for (let x = 8; x < 22; x += 2) p.px(x, 21, RAMP.gold[1]);
  p.rect(7, 22, 16, 1, P[0]);

  // gun arm
  p.box(24, 15, 6, 2, RAMP.steel);
  p.rect(24, 17, 2, 2, RAMP.vest[1]);
  p.limb(20, 16.5, 23.4, 17.4, 1.5, P);
  p.ball(24.4, 17.6, 1.4, 1.4, RAMP.skin);

  // head, mean eyes, bandana mask
  p.ball(15, 8.8, 4.3, 4.1, RAMP.skin);
  p.px(12, 6, INK).px(13, 7, INK).px(18, 6, INK).px(17, 7, INK);
  p.px(13, 8, INK).px(17, 8, INK);
  p.ball(10.2, 10.8, 1.3, 1.2, RAMP.red);
  p.poly([[10.4, 9.6], [19.6, 9.6], [18.6, 13.6], [15, 15.8], [11.4, 13.6]], RAMP.red);

  // black hat
  p.ball(15, 2.9, 4.5, 3.1, D);
  p.rect(11, 4, 8, 1, RAMP.red[0]);
  p.ball(15, 5.4, 8.8, 1.7, D);
  return p;
}

// ---- Chupacabra (38x26, faces right) -------------------------------------------
function chupacabra(pose) {
  const p = new Pix(38, 26);
  const H = RAMP.hide, D = RAMP.hideDark;
  const leg = (pts, r, ramp) => {
    for (let i = 0; i + 1 < pts.length; i++) p.limb(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r - i * 0.3, ramp);
    const [fx, fy] = pts[pts.length - 1];
    p.px(fx + 1, fy, WHITE).px(fx + 2, fy, WHITE); // claws
  };
  const LEGS = {
    a: { farHind: [[11, 17], [13, 21.5], [12, 24.6]], farFore: [[24, 17], [25.5, 24.6]], hind: [[9, 17.5], [7, 21.5], [9, 24.6]], fore: [[21.5, 18], [22.5, 24.6]] },
    b: { farHind: [[11, 17], [9, 21.5], [10.5, 24.6]], farFore: [[24, 17], [22.5, 24.6]], hind: [[9, 17.5], [11, 21.5], [8, 24.6]], fore: [[21.5, 18], [24.5, 24.6]] },
    leap: { farHind: [[11, 17], [6, 19.5], [3, 22]], farFore: [[24, 17], [30, 19.5], [33.5, 20.5]], hind: [[9, 17.5], [4, 20.5], [1, 22.6]], fore: [[21.5, 18], [27.5, 21], [31, 22.2]] },
  }[pose];

  p.limb(7, 13, 1.6, 8, 1.6, D, 0.7); // tail
  leg(LEGS.farHind, 1.5, D);
  leg(LEGS.farFore, 1.4, D);

  // hunched body
  p.ball(10, 14.5, 5.6, 5.2, H);
  p.ball(16.5, 13.5, 8, 5, H);
  p.ball(23, 14.5, 5, 4.8, H);
  for (const [x, top] of [[9, 10.2], [12.5, 9], [16, 8.6], [19.5, 9], [23, 10.2]]) {
    p.poly([[x - 1.4, top + 1.6], [x + 1.4, top + 1.6], [x - 1.2, top - 3.2]], RAMP.spine);
  }

  // head: ears, glowing eye, fangs
  p.poly([[24.5, 8.6], [27, 7.6], [23.6, 2.8]], H);
  p.poly([[27.6, 7.6], [30.2, 7.8], [28.8, 2.4]], H);
  p.ball(28, 11.5, 5.2, 4.4, H);
  p.ball(32.6, 15.4, 3, 1.3, D);
  p.ball(33, 13, 3.7, 2.4, H);
  p.rect(28, 9, 3, 1, D[0]);
  p.rect(29, 10, 2, 2, '#ff3b2f').px(30, 10, '#ffe070');
  p.px(36, 12, INK);
  p.rect(31, 15, 1, 2, WHITE).rect(34, 15, 1, 2, WHITE);

  leg(LEGS.hind, 1.8, H);
  leg(LEGS.fore, 1.5, H);
  return p;
}

// ---- Scenery and pickups -------------------------------------------------------
function cactus() { // 22x34
  const p = new Pix(22, 34);
  const C = RAMP.cactus;
  p.limb(11, 22, 4.6, 22, 2.3, C).limb(4.6, 22, 4.6, 13.5, 2.3, C);
  p.limb(11, 17, 17.4, 17, 2.2, C).limb(17.4, 17, 17.4, 9.5, 2.2, C);
  p.limb(11, 38, 11, 6.5, 3.4, C);
  for (let y = 6; y < 34; y++) p.px(12, y, C[1]); // rib
  for (let y = 7; y < 33; y += 3) { // spines
    p.px(8, y, C[4]).px(14, y + 1, C[3]);
    if (y > 12 && y < 22) p.px(3, y, C[4]);
    if (y > 8 && y < 17) p.px(18, y, C[3]);
  }
  p.ball(11, 3.6, 1.9, 1.6, RAMP.flower);
  return p;
}

function beans(ramp = RAMP.steel, label = RAMP.label) { // 12x14
  const p = new Pix(12, 14);
  p.cyl(1, 2, 10, 11, ramp);
  p.cyl(1, 5, 10, 5, label);
  p.rect(1, 12, 10, 1, ramp[0]);
  p.ball(6, 2.4, 5, 1.5, ramp.slice(1));
  if (label === RAMP.label) { // a few beans on the label
    for (const [x, y] of [[3, 7], [5, 6], [6, 8], [8, 7]]) p.px(x, y, '#7a3a18').px(x + 1, y, '#a85a2a');
  }
  return p;
}

function heart(ramp = RAMP.heart) { // 13x12
  const p = new Pix(13, 12);
  p.poly([[0.4, 4.4], [12.6, 4.4], [6.5, 11.8]], ramp);
  p.ball(3.7, 3.7, 3.5, 3.5, ramp);
  p.ball(9.3, 3.7, 3.5, 3.5, ramp);
  if (ramp === RAMP.heart) p.px(2, 2, WHITE).px(3, 2, '#ffc0b0').px(2, 3, '#ffc0b0');
  return p;
}

export function cloud(w, seed) { // fluffy, flat-bottomed, no outline
  const p = new Pix(w, 20), rnd = prng(seed);
  const n = Math.max(3, Math.round(w / 8));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), hump = Math.sin(t * Math.PI);
    const r = 3.5 + hump * 4 + rnd() * 1.5;
    p.ball(6 + t * (w - 12), 14 - hump * 5 - rnd() * 1.5, r * 1.25, r, RAMP.cloud);
  }
  for (let y = 15; y < p.h; y++) for (let x = 0; x < w; x++) p.px(x, y, '#000000', 0);
  for (let x = 0; x < w; x++) if (p.alpha(x, 14)) p.px(x, 14, RAMP.cloud[0]);
  return p;
}

// Builds every sprite. Returned Pix objects are un-outlined; gfx.js bakes them.
export function buildSprites() {
  const sprites = {};
  for (const [name, pose] of Object.entries(POSES)) sprites[`rudy${name[0].toUpperCase()}${name.slice(1)}`] = rudy(pose);
  Object.assign(sprites, {
    gun: gun(),
    scorpionA: scorpion(0),
    scorpionB: scorpion(1),
    banditA: bandit(0),
    banditB: bandit(1),
    chupaA: chupacabra('a'),
    chupaB: chupacabra('b'),
    chupaLeap: chupacabra('leap'),
    cactus: cactus(),
    beans: beans(),
    beansEmpty: beans(RAMP.empty, RAMP.empty),
    heart: heart(),
    heartEmpty: heart(RAMP.empty),
  });
  return sprites;
}

// ---- Tiles (16x16, opaque) -------------------------------------------------------
// Smooth value noise that wraps at the tile edge, so tiles repeat seamlessly.
function tileNoise(rnd, cells = 4) {
  const g = Array.from({ length: cells * cells }, () => rnd());
  const at = (i, j) => g[((j + cells) % cells) * cells + ((i + cells) % cells)];
  const size = 16 / cells;
  return (x, y) => {
    const fx = x / size, fy = y / size, i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const top = at(i, j) * (1 - tx) + at(i + 1, j) * tx;
    const bot = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
}

function sandTile(seed, top) {
  const p = new Pix(16, 16), rnd = prng(seed), noise = tileNoise(rnd);
  const body = ['#b47c3e', '#c08a48', '#cb9853', '#d6a660'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = noise(x, y) + (rnd() - 0.5) * 0.3;
      p.px(x, y, body[Math.max(0, Math.min(3, Math.floor(v * 4)))]);
    }
  }
  for (let i = 0; i < 2; i++) p.ball(2 + rnd() * 12, (top ? 8 : 3) + rnd() * 6, 1 + rnd(), 0.8 + rnd() * 0.5, RAMP.pebble);
  if (top) { // sunlit crust with a ragged lower edge
    for (let x = 0; x < 16; x++) {
      const depth = 3 + (Math.sin((x / 16) * Math.PI * 4 + seed) > 0.2 ? 1 : 0);
      p.px(x, 0, '#fff3c8').px(x, 1, '#f8e0a0');
      for (let y = 2; y < depth; y++) p.px(x, y, '#ecca84');
      p.px(x, depth, '#e0b56e').px(x, depth + 1, '#a8703a');
    }
  }
  return p;
}

function rockTile(seed, top) {
  const p = new Pix(16, 16), rnd = prng(seed);
  const strata = [['#8f4a2c', 3], ['#a85a34', 2], ['#b96a3c', 4], ['#9c5230', 3], ['#c27a48', 4]];
  let y = 0;
  for (const [col, h] of strata) {
    for (let j = 0; j < h; j++, y++) {
      for (let x = 0; x < 16; x++) {
        const r = rnd();
        p.px(x, y, j === h - 1 && r < 0.7 ? '#7a3c24' : r < 0.08 ? '#d08a58' : r < 0.16 ? '#864428' : col);
      }
    }
  }
  for (let i = 0; i < 2; i++) { // cracks
    const x = 1 + Math.floor(rnd() * 14), y0 = 3 + Math.floor(rnd() * 8);
    for (let j = 0; j < 3 + Math.floor(rnd() * 3); j++) p.px(x + (j > 1 ? 1 : 0), y0 + j, '#6a3420');
  }
  if (top) {
    for (let x = 0; x < 16; x++) {
      p.px(x, 0, '#f4c08a').px(x, 1, '#e4a06a').px(x, 2, x % 3 ? '#d08a58' : '#e4a06a').px(x, 3, '#7a3c24');
    }
  }
  return p;
}

export function buildTiles() {
  return {
    sand: [sandTile(11, false), sandTile(23, false)],
    sandTop: [sandTile(37, true), sandTile(41, true)],
    rock: [rockTile(53, false), rockTile(67, false)],
    rockTop: [rockTile(71, true), rockTile(83, true)],
  };
}

// ---- 5x7 bitmap font --------------------------------------------------------
// Each glyph: 7 rows of 5 chars separated by '/', '#' = pixel on.
export const FONT = {
  ' ': '...../...../...../...../...../...../.....',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '#####/..#../..#../..#../..#../..#../#####',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '#####/...#./..#../...#./....#/#...#/.###.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..',
  "'": '..#../..#../.#.../...../...../...../.....',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../..#../.#...',
  ':': '...../.##../.##../...../.##../.##../.....',
  '-': '...../...../...../#####/...../...../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '>': '#..../.#.../..#../...#./..#../.#.../#....',
  '<': '....#/...#./..#../.#.../..#../...#./....#',
  '^': '..#../.###./#####/...../...../...../.....', // up arrow
  '~': '...../...../...../...../#####/.###./..#..', // down arrow
};
