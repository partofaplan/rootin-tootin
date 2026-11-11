// Headless checks for the game logic and data. Run with: npm test
import assert from 'node:assert/strict';
import { buildSprites, buildTiles, FONT } from '../src/sprites.js';
import {
  LEVEL_ROWS, ROWS, TILE, SOLID_CHARS, SPAWN_CHARS, SECRET_CHARS, parseLevel, surfaceRow, tileAt, secretAt, rectSolid,
} from '../src/level.js';
import {
  createWorld, updateWorld, makeEnemy, NO_INPUT, PHYS, CLIP, RELOAD_FRAMES, MAX_HP, TURBO_FRAMES, TURBO_RATE, FART_RADIUS,
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

test('level rows are well formed', () => {
  assert.equal(LEVEL_ROWS.length, ROWS);
  const count = {};
  for (const row of LEVEL_ROWS) {
    assert.equal(row.length, LEVEL_ROWS[0].length);
    for (const ch of row) {
      assert.ok(ch === '.' || ch in SOLID_CHARS || SPAWN_CHARS.includes(ch) || SECRET_CHARS.includes(ch), `unknown map char '${ch}'`);
      count[ch] = (count[ch] || 0) + 1;
    }
  }
  assert.equal(count.P, 1, 'exactly one player start');
  assert.equal(count.G, 1, 'exactly one goal');
  assert.equal(count.E, 1, 'exactly one easter egg');
  assert.ok(count.K >= 1, 'has a checkpoint');
  for (const ch of 'sbcB') assert.ok(count[ch] >= 3, `has several '${ch}'`);
  assert.ok(LEVEL_ROWS[0].length >= 200, 'level is long enough');
});

test('pits and ledges are jumpable', () => {
  const L = parseLevel();
  // Max flat jump distance in pixels, and max rise in tiles.
  const airFrames = (2 * -PHYS.JUMP) / PHYS.G;
  const maxGapTiles = Math.floor((airFrames * PHYS.RUN) / TILE);
  const maxRise = Math.floor((PHYS.JUMP ** 2 / (2 * PHYS.G)) / TILE);
  let gap = 0;
  for (let c = 0; c < L.w; c++) {
    let any = false;
    for (let r = 0; r < L.h; r++) any = any || !!tileAt(L, c, r);
    gap = any ? 0 : gap + 1;
    assert.ok(gap <= maxGapTiles, `gap of ${gap} tiles ending at col ${c} is too wide`);
  }
  for (let c = 0; c + 1 < L.w; c++) {
    const a = surfaceRow(L, c), b = surfaceRow(L, c + 1);
    if (a < L.h && b < L.h) assert.ok(a - b <= maxRise, `step up of ${a - b} tiles at col ${c + 1}`);
  }
  // Every spawn sits in open space directly above something solid.
  for (const s of L.spawns) {
    if ('BH'.includes(s.type)) continue;
    assert.ok(tileAt(L, s.col, s.row + 1), `'${s.type}' at col ${s.col} is floating`);
  }
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
  assert.deepEqual(normalizeScores([{ name: 'ok', score: 5 }, { name: '', score: 5 }, { name: 'X', score: -2 }, null]), [{ name: 'OK', score: 5, at: 0 }]);
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

test('level can be completed end to end (invulnerable bot)', () => {
  const w = createWorld({ god: true });
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
