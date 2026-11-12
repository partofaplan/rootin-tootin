// Headless checks for the game logic and data. Run with: npm test
import assert from 'node:assert/strict';
import { buildSprites, buildTiles, FONT } from '../src/sprites.js';
import {
  LEVELS, LEVEL_ROWS, ROWS, TILE, SOLID_CHARS, SPAWN_CHARS, SECRET_CHARS, ARENA_COLS, parseLevel, surfaceRow, tileAt, secretAt, rectSolid,
} from '../src/level.js';
import {
  createWorld, updateWorld, makeEnemy, NO_INPUT, PHYS, CLIP, RELOAD_FRAMES, MAX_HP, TURBO_FRAMES, TURBO_RATE, FART_RADIUS,
  ENEMY, BOSS_INTRO, BOSS_NAME, DIALOG_SPEED, VIEW_W,
} from '../src/game.js';
import {
  createInput, normalizeBindings, bindingName, ACTIONS, SLOTS, DEFAULT_BINDINGS, STORAGE_KEY,
} from '../src/input.js';
import {
  TITLE_MENU, PAUSE_MENU, menuItemAt, controlsCellAt, CTL, CTL_RESET_ROW, CTL_BACK_ROW, INITIALS, initialsHitAt,
} from '../src/ui.js';
import {
  normalizeScores, addScore, qualifies, cleanName, cleanScore, createScoreStore, MAX_SCORES, NAME_CHARS,
} from '../src/hiscores.js';
import { TUNE } from '../src/audio.js';
import { MODES, MODE_IDS, cleanMode, carryForward, retryPlan, formatTime } from '../src/modes.js';
import { runFrames } from '../src/game.js';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
const running = [];
function test(name, fn) {
  running.push(run1(name, fn));
}
async function run1(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n${err.stack}`);
    process.exitCode = 1;
  }
}
const input = (o = {}) => ({ ...NO_INPUT, ...o });
const run = (w, n, inp = NO_INPUT) => { for (let i = 0; i < n; i++) updateWorld(w, inp); };
// Puts an enemy on the same ground as the player, dx pixels ahead.
function place(w, type, dx) {
  const p = w.player;
  const e = makeEnemy(type, p.x + p.w / 2 + dx, p.y + p.h);
  w.enemies.push(e);
  return e;
}
function emptyWorld() {
  const w = createWorld();
  w.enemies = [];
  run(w, 5); // settle onto the ground
  return w;
}

// ---- data validation --------------------------------------------------------
test('sprites and tiles build with the expected sizes', () => {
  const sprites = buildSprites();
  const sizes = { rudyIdle: [26, 34], gun: [12, 7], scorpionA: [36, 22], banditA: [30, 32], chupaA: [38, 26], cactus: [22, 34], beans: [12, 14], heart: [13, 12] };
  for (const [name, [w, h]] of Object.entries(sizes)) {
    assert.equal(sprites[name].w, w, `${name} width`);
    assert.equal(sprites[name].h, h, `${name} height`);
  }
  for (const name of ['rudyIdle', 'rudyRunA', 'rudyRunB', 'rudyRunC', 'rudyJump', 'rudyFart', 'rudyHurt', 'scorpionB', 'banditB', 'chupaB', 'chupaLeap', 'beansEmpty', 'heartEmpty', 'chili']) {
    assert.ok(sprites[name], `missing sprite ${name}`);
  }
  for (const [name, pix] of Object.entries(sprites)) {
    const fill = pix.count() / (pix.w * pix.h);
    assert.ok(fill > 0.15 && fill < 0.95, `${name} looks wrong: ${Math.round(fill * 100)}% filled`);
    const o = pix.outlined();
    assert.equal(o.w, pix.w + 2);
    assert.ok(o.count() > pix.count(), `${name} outline adds pixels`);
    assert.equal(o.mirrored().count(), o.count());
  }
  // Rudy's feet reach the bottom row in every grounded pose (so he stands on the floor).
  for (const name of ['rudyIdle', 'rudyRunA', 'rudyRunC', 'rudyFart']) {
    const pix = sprites[name];
    let feet = 0;
    for (let x = 0; x < pix.w; x++) feet += pix.alpha(x, pix.h - 1) ? 1 : 0;
    assert.ok(feet >= 3, `${name} has no feet on the ground`);
  }
  const tiles = buildTiles();
  for (const [name, variants] of Object.entries(tiles)) {
    for (const t of variants) assert.equal(t.count(), 256, `${name} tile must be fully opaque`);
  }
});

test('font glyphs are 5x7', () => {
  for (const [ch, g] of Object.entries(FONT)) {
    const rows = g.split('/');
    assert.equal(rows.length, 7, `glyph '${ch}' rows`);
    for (const r of rows) assert.match(r, /^[#.]{5}$/, `glyph '${ch}' row '${r}'`);
  }
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '!") assert.ok(ch in FONT, `missing glyph '${ch}'`);
});

test('every level is well formed', () => {
  assert.equal(LEVELS.length, 2);
  assert.deepEqual(LEVELS.map((l) => l.theme), ['desert', 'saloon']);
  LEVELS.forEach((def, i) => {
    assert.equal(def.rows.length, ROWS);
    const count = {};
    for (const row of def.rows) {
      assert.equal(row.length, def.rows[0].length);
      for (const ch of row) {
        assert.ok(ch === '.' || ch in SOLID_CHARS || SPAWN_CHARS.includes(ch) || SECRET_CHARS.includes(ch), `level ${i + 1}: unknown map char '${ch}'`);
        count[ch] = (count[ch] || 0) + 1;
      }
    }
    assert.equal(count.P, 1, 'exactly one player start');
    assert.ok(count.K >= 1, 'has a checkpoint');
    assert.ok(count.B >= 3, 'has bean cans');
    assert.ok(def.rows[0].length >= 180, 'level is long enough');
    assert.equal((count.E || 0) + (count.D || 0), 1, 'exactly one easter egg');
    assert.equal((count.G || 0) + (count.F || 0), 1, 'ends in a goal door or a boss');
  });
  const desert = LEVELS[0].rows.join(''), saloon = LEVELS[1].rows.join('');
  for (const ch of 'sbcGE') assert.ok(desert.includes(ch), `desert has '${ch}'`);
  // The saloon has its own cast: rats, bandits and the madam, and Big Frank at the end.
  for (const ch of 'rbmFD') assert.ok(saloon.includes(ch), `saloon has '${ch}'`);
  for (const ch of 'scG') assert.ok(!saloon.includes(ch), `saloon has no '${ch}'`);
  assert.ok((saloon.match(/r/g) || []).length >= 6 && (saloon.match(/m/g) || []).length >= 3 && (saloon.match(/b/g) || []).length >= 3);
});

test('pits and ledges are jumpable in every level', () => {
  // Max flat jump distance in pixels, and max rise in tiles.
  const airFrames = (2 * -PHYS.JUMP) / PHYS.G;
  const maxGapTiles = Math.floor((airFrames * PHYS.RUN) / TILE);
  const maxRise = Math.floor((PHYS.JUMP ** 2 / (2 * PHYS.G)) / TILE);
  for (const def of LEVELS) {
    const L = parseLevel(def.rows);
    let gap = 0;
    for (let c = 0; c < L.w; c++) {
      let any = false;
      for (let r = 0; r < L.h; r++) any = any || !!tileAt(L, c, r);
      gap = any ? 0 : gap + 1;
      assert.ok(gap <= maxGapTiles, `${def.name}: gap of ${gap} tiles ending at col ${c} is too wide`);
    }
    for (let c = 0; c + 1 < L.w; c++) {
      const a = surfaceRow(L, c), b = surfaceRow(L, c + 1);
      if (a < L.h && b < L.h) assert.ok(a - b <= maxRise, `${def.name}: step up of ${a - b} tiles at col ${c + 1}`);
    }
    // Every spawn sits in open space directly above something solid (pickups and the dartboard may float).
    for (const s of L.spawns) {
      if ('BHD'.includes(s.type)) continue;
      assert.ok(tileAt(L, s.col, s.row + 1), `${def.name}: '${s.type}' at col ${s.col} is floating`);
    }
  }
  // Big Frank's room is one flat screen at the very end.
  const L = parseLevel(LEVELS[1].rows);
  assert.equal(ARENA_COLS * TILE, VIEW_W);
  for (let c = L.w - ARENA_COLS; c < L.w; c++) assert.equal(surfaceRow(L, c), L.h - 2, 'arena floor is flat');
});

// ---- mechanics -----------------------------------------------------------------
test('six shots, then a forced reload', () => {
  const w = emptyWorld();
  let shots = 0;
  for (let i = 0; i < 100; i++) {
    updateWorld(w, input({ shoot: true }));
    shots += w.events.filter((e) => e === 'shoot').length;
    w.events.length = 0;
    if (w.player.reload > 0) break;
  }
  assert.equal(shots, CLIP);
  assert.equal(w.player.ammo, 0);
  run(w, RELOAD_FRAMES - 5, input({ shoot: true }));
  assert.equal(w.player.ammo, 0, 'cannot fire while reloading');
  run(w, 5);
  assert.equal(w.player.ammo, CLIP, 'reloaded');
});

test('a scorpion takes two bullets', () => {
  const w = emptyWorld();
  const s = place(w, 'scorpion', 60);
  updateWorld(w, input({ shoot: true }));
  run(w, 25);
  assert.equal(s.hp, 1);
  assert.equal(w.score, 0);
  updateWorld(w, input({ shoot: true }));
  run(w, 25);
  assert.ok(s.dead && !w.enemies.includes(s));
  assert.equal(w.score, 100);
});

test('the fart kills every enemy in range with a combo bonus', () => {
  const w = emptyWorld();
  const near = [place(w, 'scorpion', 34), place(w, 'bandit', -30), place(w, 'chupacabra', 44)];
  const far = place(w, 'bandit', 110);
  near.push(place(w, 'bandit', 30));
  assert.equal(w.player.farts, 1);
  updateWorld(w, input({ fartPressed: true }));
  for (const e of near) assert.ok(e.dead, `${e.type} should be dead`);
  assert.ok(!far.dead, 'out-of-range bandit survives');
  assert.equal(w.player.farts, 0);
  assert.equal(w.score, (100 + 200 + 300 + 200) * 4);
  updateWorld(w, input({ fartPressed: true }));
  assert.equal(w.blasts.length, 1, 'no second fart without beans');
});

test('beans refill the fart; hearts heal', () => {
  const w = emptyWorld();
  const p = w.player;
  p.farts = 0; p.hp = 1;
  const beans = w.pickups.find((k) => k.type === 'beans');
  const heart = w.pickups.find((k) => k.type === 'heart');
  p.x = beans.x; p.y = beans.y; p.vy = 0;
  updateWorld(w);
  assert.equal(p.farts, 1);
  p.x = heart.x; p.y = heart.y; p.vy = 0;
  updateWorld(w);
  assert.equal(p.hp, 2);
});

test('falling in a pit costs a heart and respawns at the checkpoint', () => {
  const w = emptyWorld();
  const p = w.player, L = w.level;
  const cp = w.checkpoints[0];
  p.x = cp.x + 4; // walk past the checkpoint
  p.y = cp.y - p.h;
  updateWorld(w);
  assert.ok(cp.active);
  const pit = L.pits.find((q) => q.col0 * TILE > cp.x);
  p.x = pit.col0 * TILE + 2; p.y = 100; p.vx = 0;
  for (let i = 0; i < 200 && p.hp === MAX_HP; i++) updateWorld(w);
  assert.equal(p.hp, MAX_HP - 1);
  assert.equal(w.state, 'play');
  assert.ok(Math.abs(p.x + p.w / 2 - cp.x) < 2, 'back at checkpoint');
  assert.ok(p.inv > 0);
});

test('contact damage, then game over at zero hearts', () => {
  const w = emptyWorld();
  const p = w.player;
  place(w, 'scorpion', 0);
  updateWorld(w);
  assert.equal(p.hp, MAX_HP - 1);
  run(w, 10);
  assert.equal(p.hp, MAX_HP - 1, 'invulnerable after a hit');
  p.hp = 1; p.inv = 0;
  w.enemies = [];
  place(w, 'scorpion', 0);
  updateWorld(w);
  assert.equal(w.state, 'dying');
  run(w, 130);
  assert.equal(w.state, 'gameover');
});

test('bandits shoot and chupacabras pounce', () => {
  const w = emptyWorld();
  const b = place(w, 'bandit', 90);
  run(w, 80);
  assert.ok(w.ebullets.length > 0 || w.player.hp < MAX_HP, 'bandit fired');
  w.enemies = []; w.ebullets = [];
  w.player.inv = 0;
  const c = place(w, 'chupacabra', 60);
  let leapt = false;
  for (let i = 0; i < 120; i++) { updateWorld(w); leapt = leapt || c.state === 'leap'; }
  assert.ok(leapt, 'chupacabra leapt');
  assert.ok(b.dead === false);
});

test('touching the saloon door wins the level', () => {
  const w = emptyWorld();
  const p = w.player;
  p.x = w.goal.x; p.y = w.goal.y + w.goal.h - p.h;
  w.camX = w.level.pxW - 256;
  updateWorld(w);
  assert.equal(w.state, 'won');
  assert.equal(w.bonus.hearts, MAX_HP * 500);
  assert.equal(w.score, w.bonus.time + w.bonus.hearts);
});

// ---- stomping --------------------------------------------------------------------------
test('jumping on an enemy kills it and bounces Rudy; touching it otherwise still hurts', () => {
  for (const type of ['scorpion', 'bandit', 'chupacabra', 'rat', 'madam']) {
    const w = emptyWorld();
    const p = w.player;
    const e = place(w, type, 0);
    e.cd = 999; // keep it from attacking during the test
    p.y = e.y - p.h - 14; p.vy = 1; p.onGround = false;
    let stomped = false;
    for (let i = 0; i < 30 && !stomped; i++) { updateWorld(w, input({ jump: i > 3 })); stomped = w.events.includes('stomp'); w.events.length = 0; }
    assert.ok(stomped, `${type} was stomped`);
    assert.ok(!w.enemies.includes(e), `${type} is gone`);
    assert.equal(p.hp, MAX_HP, `${type} stomp costs nothing`);
    assert.ok(p.vy < -3, 'Rudy bounces');
    assert.equal(w.score, ENEMY[type].score);
  }
  // Holding jump gives a higher bounce.
  const bounce = (held) => {
    const w = emptyWorld(), p = w.player, e = place(w, 'rat', 0);
    e.vx = 0;
    p.y = e.y - p.h - 6; p.vy = 2; p.onGround = false;
    for (let i = 0; i < 10 && w.enemies.length; i++) updateWorld(w, input({ jump: held }));
    return p.vy;
  };
  assert.ok(bounce(true) < bounce(false));
  // Walking into one is still a hit.
  const w = emptyWorld();
  place(w, 'rat', 8);
  run(w, 3);
  assert.equal(w.player.hp, MAX_HP - 1);
});

// ---- the saloon --------------------------------------------------------------------------
const saloon = (opts = {}) => {
  const w = createWorld({ levelIndex: 1, ...opts });
  run(w, 5);
  return w;
};

test('level 2 is the saloon and carries Rudy over from level 1', () => {
  const w = saloon({ carry: { score: 4321, hp: 2, farts: 3 } });
  assert.equal(w.theme, 'saloon');
  assert.equal(w.levelName, 'THE ENDLESS SALOON');
  assert.equal(w.lastLevel, true);
  assert.equal(createWorld().lastLevel, false);
  assert.deepEqual([w.score, w.player.hp, w.player.farts], [4321, 2, 3]);
  assert.equal(w.goal, null);
  const types = new Set(w.enemies.map((e) => e.type));
  assert.deepEqual([...types].sort(), ['bandit', 'boss', 'madam', 'rat']);
  assert.equal(w.boss.state, 'wait');
});

test('rats rush Rudy; the madam lobs bottles that arc down onto him', () => {
  const w = emptyWorld();
  const p = w.player;
  const rat = place(w, 'rat', 90);
  rat.face = 1; // running away...
  run(w, 5);
  assert.equal(rat.face, -1, '...until it notices him');
  assert.ok(Math.abs(rat.vx) > PHYS.RUN * 0.6, 'rats are quick');
  w.enemies = [];

  const m = place(w, 'madam', 120);
  m.cd = 0;
  let thrown = null, peak = Infinity, smashed = false;
  for (let i = 0; i < 140; i++) {
    updateWorld(w);
    thrown = thrown || w.ebullets.find((b) => b.type === 'bottle');
    if (thrown) peak = Math.min(peak, thrown.y);
    smashed = smashed || w.events.includes('smash');
    w.events.length = 0;
  }
  assert.ok(thrown, 'she threw a bottle');
  assert.ok(peak < m.y - 10, 'it goes up and over');
  assert.ok(smashed, 'and smashes');
  assert.equal(p.hp, MAX_HP - 1, 'on Rudy, who stood still');
  assert.equal(m.vx, 0, 'she stays put');
});

// Walks Rudy into Big Frank's room.
function atBoss(opts) {
  const w = saloon(opts);
  const p = w.player;
  p.x = w.arena.x0 + 30; p.y = (w.level.h - 2) * TILE - p.h; p.vx = 0; p.vy = 0;
  updateWorld(w);
  return w;
}
function skipDialog(w) {
  for (let i = 0; i < 400 && w.dialog; i++) updateWorld(w, input({ jumpPressed: i % 15 === 0 }));
  w.events.length = 0;
}

test('meeting Big Frank: his line, word for word, then the fight', () => {
  assert.equal(BOSS_INTRO, 'YOU DONE IT NOW, RUDY! BIG FRANK IS GONNA MESS YOU UP!');
  const w = atBoss();
  const p = w.player, frank = w.boss;
  assert.ok(w.arena.locked);
  assert.deepEqual([w.dialog.who, w.dialog.text], [BOSS_NAME, BOSS_INTRO]);
  assert.equal(frank.state, 'intro');
  assert.ok(w.events.includes('bossIntro'));
  // Nothing moves while he talks, and nothing can hurt.
  const x = p.x, fx = frank.x, time = w.time;
  run(w, 30, input({ right: true }));
  assert.deepEqual([p.x, frank.x, w.time], [x, fx, time]);
  // One press finishes the line, the next starts the fight.
  updateWorld(w, input({ jumpPressed: true }));
  assert.ok(w.dialog && w.dialog.t >= BOSS_INTRO.length * DIALOG_SPEED);
  run(w, 12);
  updateWorld(w, input({ jumpPressed: true }));
  assert.equal(w.dialog, null);
  assert.equal(frank.state, 'stagger');
  // The camera settles on his room and Rudy can't walk back out.
  run(w, 200, input({ left: true }));
  assert.ok(Math.abs(w.camX - w.arena.x0) < 1);
  assert.ok(p.x >= w.arena.x0);
  // Left alone, the line also moves on by itself.
  const w2 = atBoss();
  run(w2, BOSS_INTRO.length * DIALOG_SPEED + 320);
  assert.equal(w2.dialog, null);
});

test('Big Frank charges, throws bottles and belly-flops; beating him wins the game', () => {
  const w = atBoss({ god: true });
  const p = w.player, frank = w.boss;
  skipDialog(w);
  const seen = new Set();
  let bottles = 0, shocks = 0;
  for (let i = 0; i < 1500; i++) {
    updateWorld(w);
    seen.add(frank.state);
    bottles += w.events.filter((e) => e === 'throw').length;
    shocks = Math.max(shocks, w.ebullets.filter((b) => b.type === 'shock').length);
    w.events.length = 0;
    assert.ok(frank.x >= w.arena.x0 - 0.01 && frank.x + frank.w <= w.arena.x1 + 0.01, 'he stays in his room');
  }
  for (const st of ['stagger', 'windup', 'charge', 'dizzy', 'throw', 'hop']) assert.ok(seen.has(st), `saw him ${st}`);
  assert.ok(bottles >= 3 && shocks === 2);
  assert.equal(frank.hp, ENEMY.boss.hp, 'unharmed so far');

  // Bullets chip away, a stomp does 3, a fart does 6, and he takes double when dizzy.
  w.god = false;
  p.inv = 0;
  frank.state = 'stagger'; frank.t = 999; frank.x = p.x - 4; frank.y = p.y + p.h - frank.h + 0;
  p.y = frank.y - p.h - 8; p.vy = 2; p.onGround = false;
  for (let i = 0; i < 12 && frank.hp === ENEMY.boss.hp; i++) updateWorld(w);
  assert.equal(frank.hp, ENEMY.boss.hp - 3, 'stomp');
  assert.equal(p.hp, MAX_HP);
  assert.ok(w.enemies.includes(frank), 'a stomp does not kill the boss');
  w.god = true;
  p.farts = 1;
  updateWorld(w, input({ fartPressed: true }));
  assert.equal(frank.hp, ENEMY.boss.hp - 9, 'fart');

  // Finish him.
  frank.hp = 2;
  frank.state = 'dizzy'; frank.t = 999;
  p.x = frank.x - 60; p.y = (w.level.h - 2) * TILE - p.h; p.vy = 0; p.face = 1;
  const before = w.score;
  for (let i = 0; i < 60 && frank.state !== 'dead'; i++) updateWorld(w, input({ shoot: true, right: i === 0 }));
  assert.equal(frank.state, 'dead');
  assert.equal(w.score, before + ENEMY.boss.score);
  assert.ok(w.events.includes('bossDown'));
  assert.equal(w.state, 'play');
  run(w, 160);
  assert.equal(w.state, 'won');
  assert.ok(w.bonus && w.lastLevel);
});

test('the saloon easter egg: shoot the trick dartboard for the chili', () => {
  const w = saloon();
  const p = w.player, t = w.target;
  assert.ok(t && !t.hit);
  w.enemies = [];
  p.x = t.cx - 70; p.y = (w.level.h - 2) * TILE - p.h; p.face = 1;
  w.camX = t.cx - 128;
  run(w, 3);
  // From the ground the shot passes underneath.
  updateWorld(w, input({ shoot: true }));
  run(w, 40);
  assert.equal(t.hit, false, 'too low from the floor');
  // Jump and shoot.
  updateWorld(w, input({ jump: true, jumpPressed: true }));
  for (let i = 0; i < 60 && !t.hit; i++) updateWorld(w, input({ jump: true, shoot: true }));
  assert.ok(t.hit, 'bullseye');
  assert.ok(w.secretFound && w.events.includes('secret'));
  const chili = w.pickups.find((k) => k.type === 'chili');
  assert.ok(chili);
  run(w, 60);
  assert.equal(chili.y + chili.h, (w.level.h - 2) * TILE - 2, 'the chili drops to the floor');
  for (let i = 0; i < 120 && p.turbo === 0; i++) updateWorld(w, input({ right: true }));
  assert.ok(p.turbo > 0, 'and gives turbo');
});

// ---- easter egg ------------------------------------------------------------------------
test('the secret cave is sealed, hidden behind a right-hand face, and reachable', () => {
  const L = parseLevel();
  const cells = [];
  for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) if (secretAt(L, c, r)) cells.push([c, r]);
  assert.ok(cells.length >= 4, 'has a cave');
  const cols = cells.map(([c]) => c), rows = cells.map(([, r]) => r);
  const c0 = Math.min(...cols), c1 = Math.max(...cols), r0 = Math.min(...rows), r1 = Math.max(...rows);
  assert.ok((r1 - r0 + 1) * TILE >= 20, 'tall enough for Rudy');
  for (let c = c0; c <= c1; c++) {
    assert.ok(tileAt(L, c, r0 - 1), 'roof is solid');
    assert.ok(tileAt(L, c, r1 + 1), 'floor is solid');
  }
  for (let r = r0; r <= r1; r++) {
    assert.ok(tileAt(L, c0 - 1, r), 'back wall is solid');
    assert.ok(!tileAt(L, c1 + 1, r) && !secretAt(L, c1 + 1, r), 'opens onto open air on the right');
  }
  assert.ok(tileAt(L, c1 + 1, r1 + 1), 'ground outside the entrance is level with the cave floor');
  assert.deepEqual(L.secretMouth, { x: (c1 + 1) * TILE, y: (r1 + 1) * TILE });
  // Looks like rock (and blocks like rock) until found.
  assert.ok(rectSolid(L, c1 * TILE + 2, r1 * TILE + 2, 4, 4, true));
  assert.ok(!rectSolid(L, c1 * TILE + 2, r1 * TILE + 2, 4, 4, false));
  const egg = L.spawns.find((s) => s.type === 'E');
  assert.equal(egg.col, c0, 'the egg is at the back of the cave');
});

// Stands Rudy just outside the cave mouth, facing it.
function atCaveMouth() {
  const w = emptyWorld();
  const p = w.player, m = w.level.secretMouth;
  p.x = m.x + 6; p.y = m.y - p.h; p.vx = 0; p.vy = 0;
  w.camX = m.x - 128;
  run(w, 2);
  return w;
}

test('walking into the false wall reveals the cave; the chili starts turbo', () => {
  const w = atCaveMouth();
  const p = w.player, m = w.level.secretMouth;
  // The wall stops enemies and bullets while it is still a secret.
  const s = place(w, 'scorpion', 40);
  s.face = -1;
  for (let i = 0; i < 200; i++) { updateWorld(w); p.inv = 5; }
  assert.ok(s.x >= m.x - 0.01, 'scorpion cannot walk into the cave');
  w.enemies = [];
  p.face = -1;
  updateWorld(w, input({ shoot: true }));
  run(w, 10);
  assert.equal(w.bullets.length, 0, 'bullet stopped by the wall');
  assert.equal(w.secretFound, false);

  let events = [];
  for (let i = 0; i < 80 && p.turbo === 0; i++) { updateWorld(w, input({ left: true })); events.push(...w.events); w.events.length = 0; }
  assert.ok(w.secretFound, 'found by walking in');
  assert.ok(events.includes('secret') && events.includes('turbo'));
  assert.ok(p.turbo > TURBO_FRAMES - 10 && p.turbo <= TURBO_FRAMES);
  assert.ok(!w.pickups.some((k) => k.type === 'chili'), 'chili is eaten');
  assert.ok(w.score >= 1000);
});

test('turbo: ten seconds of free rapid-fire farts and invincibility', () => {
  const w = emptyWorld();
  const p = w.player;
  p.turbo = TURBO_FRAMES;
  p.farts = 1;
  let toots = 0, kills = 0, ended = 0;
  for (let i = 0; i < TURBO_FRAMES; i++) {
    if (i % 40 === 0) { // keep throwing trouble at him
      place(w, 'scorpion', 20); place(w, 'bandit', -30); place(w, 'chupacabra', 50);
      w.ebullets.push({ x: p.x + 2, y: p.y + 4, w: 5, h: 5, vx: 0, life: 50 });
      w.hazards.push({ x: p.x, y: p.y, w: 10, h: 10, cx: p.x, by: p.y + p.h });
    }
    if (i === 300) { p.y = w.level.pxH + 100; } // even a pit costs nothing
    updateWorld(w, input({ fartPressed: i % 50 === 0 }));
    toots += w.events.filter((e) => e === 'toot').length;
    kills += w.events.filter((e) => e === 'kill').length;
    ended += w.events.filter((e) => e === 'turboEnd').length;
    w.events.length = 0;
    w.hazards = [];
    assert.equal(w.state, 'play');
  }
  assert.equal(toots, TURBO_FRAMES / TURBO_RATE, 'farts continuously');
  assert.ok(toots / (TURBO_FRAMES / 60) >= 5, 'at least 5 farts a second');
  assert.equal(p.hp, MAX_HP, 'took no damage');
  assert.equal(p.farts, 1, 'turbo farts are free and manual ones are held back');
  assert.ok(kills >= 30, `cleared the enemies (${kills})`);
  assert.equal(p.turbo, 0);
  assert.equal(ended, 1);
  assert.ok(FART_RADIUS > 50);
  // ...and then it is over: after the short grace period he can be hurt again.
  w.enemies = []; w.ebullets = [];
  run(w, 100);
  place(w, 'scorpion', 0);
  updateWorld(w);
  assert.equal(p.hp, MAX_HP - 1);
});

// ---- controls: rebinding with keyboard and mouse ------------------------------------
function fakeInput(saved) {
  const target = new EventTarget();
  const canvas = { width: 256, height: 240, getBoundingClientRect: () => ({ left: 100, top: 50, width: 512, height: 480 }) };
  const store = new Map(saved ? [[STORAGE_KEY, saved]] : []);
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const fire = (type, props) => target.dispatchEvent(Object.assign(new Event(type), props));
  return {
    input: createInput(target, canvas, storage),
    store,
    key: (code, down = true) => fire(down ? 'keydown' : 'keyup', { code }),
    mouse: (button, down = true, x = 0, y = 0) => fire(down ? 'mousedown' : 'mouseup', { button, clientX: x, clientY: y }),
    move: (x, y) => fire('mousemove', { clientX: x, clientY: y }),
  };
}

test('default controls: keys and mouse buttons drive actions', () => {
  const t = fakeInput();
  t.key('ArrowRight'); t.key('KeyW'); t.mouse(0); t.mouse(2);
  let s = t.input.poll();
  assert.ok(s.right && s.jump && s.jumpPressed && s.shoot && s.fartPressed && s.anyPressed);
  assert.ok(!s.left && !s.pausePressed);
  s = t.input.poll();
  assert.ok(s.right && s.shoot && !s.jumpPressed && !s.fartPressed, 'held persists, pressed is one-shot');
  t.key('ArrowRight', false); t.mouse(0, false);
  s = t.input.poll();
  assert.ok(!s.right && !s.shoot);
  t.key('Escape');
  assert.ok(t.input.poll().pausePressed, 'Esc always pauses');
});

test('rebinding to a key or mouse button, with capture', () => {
  const t = fakeInput();
  t.input.capture();
  t.key('F5'); // not bindable: ignored, still waiting
  assert.equal(t.input.poll().captured, null);
  t.mouse(1);
  let s = t.input.poll();
  assert.equal(s.captured, 'Mouse1');
  assert.ok(!s.ui.click && !s.jumpPressed, 'the captured press does not act');
  assert.ok(t.input.bind('jump', 0, s.captured));
  t.mouse(1, false);
  assert.deepEqual(t.input.getBindings().jump, ['Mouse1', 'KeyW', 'Space']);
  t.mouse(1);
  assert.ok(t.input.poll().jumpPressed, 'middle mouse now jumps');
  t.key('ArrowUp');
  assert.ok(!t.input.poll().jumpPressed, 'the old key no longer jumps');

  // A code can only belong to one action: binding Z to fart takes it from shoot.
  t.input.bind('fart', 2, 'KeyZ');
  assert.deepEqual(t.input.getBindings().shoot, [null, 'KeyJ', 'Mouse0']);
  assert.deepEqual(t.input.getBindings().fart, ['KeyX', 'KeyK', 'KeyZ']);
  assert.equal(t.input.bind('fart', 0, 'Escape'), false, 'Esc is reserved');

  t.input.capture();
  t.key('Escape');
  assert.equal(t.input.poll().captured, 'Escape', 'Esc is reported so the screen can cancel');
});

test('bindings persist, clear, reset, and survive bad saved data', () => {
  const t = fakeInput();
  t.input.bind('shoot', 0, 'ShiftLeft');
  t.input.clear('shoot', 1);
  const again = fakeInput(t.store.get(STORAGE_KEY));
  assert.deepEqual(again.input.getBindings().shoot, ['ShiftLeft', null, 'Mouse0']);
  again.input.reset();
  assert.deepEqual(again.input.getBindings(), DEFAULT_BINDINGS);
  assert.deepEqual(JSON.parse(again.store.get(STORAGE_KEY)), DEFAULT_BINDINGS);

  assert.deepEqual(fakeInput('not json').input.getBindings(), DEFAULT_BINDINGS);
  const odd = normalizeBindings({ left: ['KeyQ', 'KeyQ', 42], jump: 'nope', shoot: ['Escape'], bogus: ['KeyB'] });
  assert.deepEqual(odd.left, ['KeyQ', null, null]);
  assert.deepEqual(odd.jump, DEFAULT_BINDINGS.jump);
  assert.deepEqual(odd.shoot, [null, null, null]);
  assert.ok(!('bogus' in odd));
  for (const a of ACTIONS) assert.equal(odd[a.id].length, SLOTS);
});

test('held inputs are ignored after a screen change until released', () => {
  const t = fakeInput();
  t.mouse(0);
  t.input.poll();
  t.input.releaseAll();
  assert.ok(!t.input.poll().shoot, 'the click that chose START does not fire');
  t.mouse(0, false); t.mouse(0);
  assert.ok(t.input.poll().shoot);
});

test('binding names fit the font and the slot width', () => {
  const codes = [...Object.values(DEFAULT_BINDINGS).flat(), 'Mouse1', 'Mouse3', 'Mouse4', 'ShiftLeft', 'ControlRight',
    'Backspace', 'Semicolon', 'BracketLeft', 'Backslash', 'Digit7', 'Numpad3', 'NumpadEnter', 'PageDown', 'IntlBackslash', null];
  for (const code of codes) {
    const name = bindingName(code);
    assert.ok(name.length >= 1 && name.length <= 9, `'${name}' too long`);
    for (const ch of name) assert.ok(ch in FONT, `'${name}' has no glyph for '${ch}'`);
  }
  for (const a of ACTIONS) for (const ch of a.label) assert.ok(ch in FONT);
});

test('menus and the controls screen respond to the mouse', () => {
  const t = fakeInput();
  const y0 = TITLE_MENU.y + 2;
  t.move(100 + 128 * 2, 50 + y0 * 2); // canvas is drawn at 2x, offset (100, 50)
  const s = t.input.poll();
  assert.ok(s.ui.mouseMoved && Math.abs(s.ui.mouseX - 128) < 0.01 && Math.abs(s.ui.mouseY - y0) < 0.01);
  assert.equal(menuItemAt(TITLE_MENU, s.ui.mouseX, s.ui.mouseY), 0);
  assert.equal(menuItemAt(TITLE_MENU, 128, TITLE_MENU.y + TITLE_MENU.step + 2), 1);
  assert.equal(menuItemAt(TITLE_MENU, 10, 10), -1);
  assert.equal(menuItemAt(PAUSE_MENU, 128, PAUSE_MENU.y + 2 * PAUSE_MENU.step), 2);

  for (let row = 0; row < ACTIONS.length; row++) {
    for (let col = 0; col < SLOTS; col++) {
      assert.deepEqual(controlsCellAt(CTL.slotX[col] + 20, CTL.rowY + row * CTL.rowH + 4), { row, col });
    }
  }
  assert.equal(controlsCellAt(CTL.labelX + 5, CTL.rowY + 4), null, 'labels are not clickable');
  assert.equal(controlsCellAt(128, CTL.resetY + 3).row, CTL_RESET_ROW);
  assert.equal(controlsCellAt(128, CTL.backY + 3).row, CTL_BACK_ROW);
  assert.ok(CTL.slotX[SLOTS - 1] + CTL.slotW <= 256, 'slots fit on screen');
});

// ---- game modes ---------------------------------------------------------------------
test('normal mode retries the level you died on; speed run starts over at level 1', () => {
  assert.deepEqual(MODE_IDS, ['normal', 'speedrun']);
  assert.deepEqual(TITLE_MENU.items.slice(0, 2), MODE_IDS.map((id) => MODES[id].label), 'title menu offers both modes, in order');
  assert.equal(cleanMode('speedrun'), 'speedrun');
  for (const junk of ['normal', 'SPEEDRUN', '', null, undefined, 7]) assert.equal(cleanMode(junk), 'normal');

  // Finish level 1 with a score, one heart and two farts, 50 seconds on the clock.
  const w1 = createWorld({ mode: 'normal' });
  w1.score = 6200; w1.player.hp = 1; w1.player.farts = 2; w1.time = 3000;
  const carry = carryForward(w1, runFrames(w1));
  assert.deepEqual(carry, { score: 6200, hp: 1, farts: 2, runTime: 3000 });
  const entry = { levelIndex: 1, carry };

  // Normal: die in level 2 -> still level 2, score as on arrival, hearts refilled.
  assert.deepEqual(retryPlan('normal', entry), { levelIndex: 1, carry: { score: 6200, hp: MAX_HP, farts: 2, runTime: 3000 } });
  assert.equal(retryPlan('normal', { levelIndex: 1, carry: { ...carry, farts: 0 } }).carry.farts, 1, 'never retried with an empty tank');
  // Normal: die in level 1 -> level 1 from scratch.
  assert.deepEqual(retryPlan('normal', { levelIndex: 0, carry: null }), { levelIndex: 0, carry: null });
  // Speed run: die anywhere -> level 1 from scratch.
  assert.deepEqual(retryPlan('speedrun', entry), { levelIndex: 0, carry: null });
  assert.deepEqual(retryPlan('speedrun', { levelIndex: 0, carry: null }), { levelIndex: 0, carry: null });

  // The plan actually builds the right world.
  const plan = retryPlan('normal', entry);
  const again = createWorld({ levelIndex: plan.levelIndex, carry: plan.carry, mode: 'normal' });
  assert.deepEqual([again.levelIndex, again.theme, again.score, again.player.hp, again.mode], [1, 'saloon', 6200, MAX_HP, 'normal']);
  const over = retryPlan('speedrun', entry);
  const fresh = createWorld({ levelIndex: over.levelIndex, carry: over.carry, mode: 'speedrun' });
  assert.deepEqual([fresh.levelIndex, fresh.theme, fresh.score, fresh.mode, runFrames(fresh)], [0, 'desert', 0, 'speedrun', 0]);
});

test('the speed-run clock runs across levels and stops for dialog', () => {
  const w = createWorld({ levelIndex: 1, mode: 'speedrun', carry: { score: 0, hp: 3, farts: 1, runTime: 3000 } });
  assert.equal(runFrames(w), 3000);
  run(w, 120);
  assert.equal(runFrames(w), 3120);
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(3120), '0:52.0');
  assert.equal(formatTime(60 * 75 + 30), '1:15.5');
  for (const ch of formatTime(123456)) assert.ok(ch in FONT, `clock uses a glyph the font lacks: '${ch}'`);
  assert.equal(createWorld({ mode: 'bogus' }).mode, 'normal');
});

// ---- hi scores ---------------------------------------------------------------------
test('hi-score rules: names, ordering, top ten', () => {
  assert.equal(cleanName('zp!'), 'ZP');
  assert.equal(cleanName('rudy tootin'), 'RUD');
  assert.equal(cleanName('<b>'), 'B');
  assert.equal(cleanName('!!!'), null);
  assert.equal(cleanName(null), null);
  assert.equal(cleanScore(1200), 1200);
  for (const bad of [-1, 1.5, '900', NaN, 1e9, null]) assert.equal(cleanScore(bad), null);

  let list = [];
  for (let i = 1; i <= 12; i++) list = addScore(list, `P${i}`, i * 100, i).list;
  assert.equal(list.length, MAX_SCORES);
  assert.deepEqual(list.map((e) => e.score), [1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300]);
  assert.ok(!qualifies(list, 300), 'must beat the last place');
  assert.ok(qualifies(list, 301));
  assert.ok(!qualifies([], 0), 'a zero score never qualifies');
  assert.equal(addScore(list, 'LOW', 100).rank, -1);
  const tie = addScore(list, 'TIE', 1200, 99);
  assert.equal(tie.rank, 1, 'a tie goes below the earlier score');
  assert.equal(tie.list[0].name, 'P12');
  assert.equal(addScore(list, 'TOP', 5000).rank, 0);
  assert.deepEqual(normalizeScores('junk'), []);
  assert.deepEqual(normalizeScores([{ name: 'ok', score: 5 }, { name: '', score: 5 }, { name: 'X', score: -2 }, null]), [{ name: 'OK', score: 5, at: 0, mode: 'normal' }]);
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), map: m };
}

test('score store falls back to this device, then syncs when the server answers', async () => {
  const storage = memoryStorage();
  let online = false;
  let server = [];
  const fetchFn = async (url, opts = {}) => {
    if (!online) throw new Error('offline');
    let rank;
    if (opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      const r = addScore(server, body.name, body.score);
      server = r.list; rank = r.rank;
    }
    return { ok: true, json: async () => ({ scores: server, rank }) };
  };
  const store = createScoreStore({ fetchFn, storage });
  await store.refresh();
  assert.equal(store.isShared(), false);
  const first = await store.submit('zp', 4200);
  assert.deepEqual([first.rank, first.shared], [0, false]);
  assert.equal(store.best().name, 'ZP');

  // A new page load on the same device still has it...
  const again = createScoreStore({ fetchFn, storage });
  assert.equal(again.best().score, 4200);
  // ...and once the server is reachable the offline score is uploaded.
  online = true;
  server = [{ name: 'AAA', score: 9000, at: 1 }];
  await again.refresh();
  assert.equal(again.isShared(), true);
  assert.deepEqual(again.list().map((e) => e.name), ['AAA', 'ZP']);
  assert.deepEqual(server.map((e) => e.name), ['AAA', 'ZP']);
  const second = await again.submit('BOB', 9500);
  assert.deepEqual([second.rank, second.shared], [0, true]);
  assert.equal((await again.submit('LOW', 0)).rank, -1);
});

test('server keeps one shared board across players and restarts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rootin-'));
  const file = path.join(dir, 'scores.json');
  const port = 20000 + (process.pid % 20000);
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const base = `http://127.0.0.1:${port}`;
  const start = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SCORES_FILE: file } });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(child); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
  });
  const stop = (child) => new Promise((resolve) => { child.removeAllListeners('exit'); child.on('exit', resolve); child.kill(); });
  const post = (body, raw) => fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body) });

  let child = await start();
  try {
    assert.deepEqual((await (await fetch(`${base}/api/scores`)).json()).scores, []);
    // Two different "players" (two stores, separate browsers) share the board.
    const alice = createScoreStore({ fetchFn: (u, o) => fetch(`${base}/${u}`, o), storage: memoryStorage() });
    const bob = createScoreStore({ fetchFn: (u, o) => fetch(`${base}/${u}`, o), storage: memoryStorage() });
    assert.deepEqual(await alice.submit('ali', 3000), { rank: 0, shared: true });
    assert.deepEqual(await bob.submit('bob', 5000), { rank: 0, shared: true });
    await alice.refresh();
    assert.deepEqual(alice.list().map((e) => [e.name, e.score]), [['BOB', 5000], ['ALI', 3000]]);
    // The mode a score was earned in is stored and shared too.
    await bob.submit('zip', 4000, 'speedrun');
    await alice.refresh();
    assert.deepEqual(alice.list().map((e) => [e.name, e.mode]), [['BOB', 'normal'], ['ZIP', 'speedrun'], ['ALI', 'normal']]);
    assert.equal((await (await post({ name: 'odd', score: 1, mode: 'cheat' })).json()).scores.find((e) => e.name === 'ODD').mode, 'normal');

    // Bad input is rejected and changes nothing.
    assert.equal((await post({ name: '***', score: 10 })).status, 400);
    assert.equal((await post({ name: 'ABC', score: 'lots' })).status, 400);
    assert.equal((await post(null, '{nope')).status, 400);
    assert.equal((await post(null, JSON.stringify({ name: 'ABC', score: 1, pad: 'x'.repeat(5000) }))).status, 413);
    assert.equal((await fetch(`${base}/api/scores`, { method: 'DELETE' })).status, 405);
    for (let i = 0; i < 12; i++) await post({ name: `N${i}`, score: 100 + i });
    const full = (await (await fetch(`${base}/api/scores`)).json()).scores;
    assert.equal(full.length, MAX_SCORES);
    assert.equal(full[0].name, 'BOB');

    // Only the game itself is served.
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/src/main.js`)).status, 200);
    for (const p of ['/server.js', '/package.json', '/.git/config', '/data/scores.json', '/src/../server.js', '/src/%2e%2e/server.js', '/test/smoke.mjs']) {
      assert.equal((await fetch(`${base}${p}`)).status, 404, `${p} must not be served`);
    }

    // Scores survive a restart.
    await stop(child);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).length, MAX_SCORES);
    child = await start();
    assert.equal((await (await fetch(`${base}/api/scores`)).json()).scores[0].name, 'BOB');
  } finally {
    await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});

test('initials entry: typing, and mouse targets', () => {
  const t = fakeInput();
  t.key('KeyZ'); t.key('Digit7'); t.key('ArrowUp'); t.key('Comma');
  const s = t.input.poll();
  assert.deepEqual(s.ui.typed, ['Z', '7']);
  for (const ch of s.ui.typed) assert.ok(NAME_CHARS.includes(ch));
  const w = 5 * INITIALS.scale;
  INITIALS.slotX.forEach((x, i) => {
    assert.deepEqual(initialsHitAt(x + w / 2, INITIALS.upY + 3), { type: 'up', i });
    assert.deepEqual(initialsHitAt(x + w / 2, INITIALS.downY + 3), { type: 'down', i });
    assert.deepEqual(initialsHitAt(x + w / 2, INITIALS.y + 10), { type: 'slot', i });
  });
  assert.deepEqual(initialsHitAt(128, INITIALS.okY + 3), { type: 'ok' });
  assert.equal(initialsHitAt(10, 10), null);
});

// ---- music ---------------------------------------------------------------------------
test('the country tune is well formed', () => {
  const { PROGRESSION, CHORDS, WALK, BANJO, FIDDLE, ROLL, MUSIC_STEPS } = TUNE;
  assert.equal(PROGRESSION.length, 16);
  assert.equal(MUSIC_STEPS, 128);
  assert.equal(BANJO.length + FIDDLE.length, PROGRESSION.length);
  // Major key, three chords: I, IV and V of G.
  assert.deepEqual([...new Set(PROGRESSION)].sort(), ['C', 'D', 'G']);
  const G_MAJOR = new Set([0, 2, 4, 6, 7, 9, 11]); // pitch classes: C D E F# G A B
  const inKey = (m) => G_MAJOR.has(m % 12);
  for (const [name, c] of Object.entries(CHORDS)) {
    for (const m of [...c.bass, ...c.strum, ...c.roll]) assert.ok(inKey(m), `${name} chord note ${m}`);
    assert.equal(c.roll.length, 4);
  }
  for (const i of ROLL) assert.ok(i >= 0 && i < 4);
  for (const row of [...BANJO, ...FIDDLE]) {
    assert.equal(row.length, 8);
    for (const m of row) assert.ok(m === 0 || m === -1 || (m >= 55 && m <= 88 && (inKey(m) || m % 12 === 1 || m % 12 === 8)), `note ${m}`);
  }
  for (const row of BANJO) assert.ok(!row.includes(-1));
  for (const row of FIDDLE) assert.notEqual(row[0], -1, 'a held note cannot start a bar');
  for (let b = 0; b < 16; b++) { // every chord change has a bass walk-up defined
    const a = PROGRESSION[b], n = PROGRESSION[(b + 1) % 16];
    if (a !== n) assert.ok(WALK[`${a}>${n}`], `no bass walk for ${a}>${n}`);
  }
});

// ---- whole-level runs ------------------------------------------------------------
// A simple bot: run right, shoot, jump at walls and gaps.
function botInput(w, prev) {
  const p = w.player, L = w.level;
  if (w.dialog) return input({ jumpPressed: w.frame % 20 === 0 });
  if (w.boss && w.arena.locked) { // boss fight: face him and keep shooting, hopping now and then
    const toward = w.boss.x + w.boss.w / 2 > p.x + p.w / 2 ? 1 : -1;
    const hop = p.onGround && w.frame % 90 === 0;
    return input({ right: toward > 0 && p.face < 0, left: toward < 0 && p.face > 0, shoot: true, jump: hop || !p.onGround, jumpPressed: hop });
  }
  const footRow = Math.floor((p.y + p.h - 1) / TILE);
  const edgeCol = Math.floor((p.x + p.w + 1) / TILE);
  const wallCol = Math.floor((p.x + p.w + 10) / TILE);
  let groundBelow = false;
  for (let r = footRow + 1; r < L.h; r++) groundBelow = groundBelow || !!tileAt(L, edgeCol, r);
  let wall = false; // anything solid ahead between head and feet
  for (let r = Math.floor(p.y / TILE); r <= footRow; r++) wall = wall || !!tileAt(L, wallCol, r);
  const wantJump = p.onGround && (wall || !groundBelow);
  return input({ right: true, shoot: true, jump: wantJump || !p.onGround, jumpPressed: wantJump && !prev.jump });
}

for (const levelIndex of [0, 1]) test(`level ${levelIndex + 1} can be completed end to end (invulnerable bot)`, () => {
  const w = createWorld({ god: true, levelIndex });
  let inp = NO_INPUT, maxX = 0;
  for (let i = 0; i < 20000 && w.state === 'play'; i++) {
    inp = botInput(w, inp);
    updateWorld(w, inp);
    w.events.length = 0;
    maxX = Math.max(maxX, w.player.x);
    assert.ok(Number.isFinite(w.player.x) && Number.isFinite(w.player.y), 'player position is finite');
  }
  assert.equal(w.state, 'won', `bot got stuck at col ${Math.floor(maxX / TILE)} of ${w.level.w}`);
  console.log(`        bot finished in ${(w.time / 60).toFixed(1)}s, ${w.kills} kills, score ${w.score}`);
});

test('mortal bot run stays sane for 6000 frames', () => {
  const w = createWorld();
  let inp = NO_INPUT, events = 0;
  for (let i = 0; i < 6000; i++) {
    inp = w.state === 'play' ? botInput(w, inp) : NO_INPUT;
    if (i % 400 === 399) inp = { ...inp, fartPressed: true };
    updateWorld(w, inp);
    events += w.events.length;
    w.events.length = 0;
    for (const e of w.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `${e.type} position is finite`);
    assert.ok(w.particles.length <= 400);
  }
  assert.ok(events > 0);
  assert.ok(['play', 'gameover', 'won'].includes(w.state));
  console.log(`        mortal bot ended in state '${w.state}' at col ${Math.floor(w.player.x / TILE)}, hp ${w.player.hp}`);
});

await Promise.all(running);
console.log(process.exitCode ? '\nSome tests failed.' : `\nAll ${passed} tests passed.`);
if (process.argv.includes('--map')) console.log(LEVEL_ROWS.join('\n'));
