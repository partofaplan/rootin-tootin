// Headless checks for the game logic and data. Run with: npm test
import assert from 'node:assert/strict';
import { PAL, SPRITES, FONT } from '../src/sprites.js';
import { LEVEL_ROWS, ROWS, TILE, SOLID_CHARS, SPAWN_CHARS, parseLevel, surfaceRow, tileAt } from '../src/level.js';
import {
  createWorld, updateWorld, makeEnemy, NO_INPUT, PHYS, CLIP, RELOAD_FRAMES, MAX_HP,
} from '../src/game.js';
import {
  createInput, normalizeBindings, bindingName, ACTIONS, SLOTS, DEFAULT_BINDINGS, STORAGE_KEY,
} from '../src/input.js';
import { TITLE_MENU, PAUSE_MENU, menuItemAt, controlsCellAt, CTL, CTL_RESET_ROW, CTL_BACK_ROW } from '../src/ui.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
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
test('sprites are rectangular and use known palette chars', () => {
  for (const [name, rows] of Object.entries(SPRITES)) {
    rows.forEach((row, i) => {
      assert.equal(row.length, rows[0].length, `${name} row ${i} has length ${row.length}`);
      for (const ch of row) assert.ok(ch in PAL, `${name} row ${i}: unknown colour '${ch}'`);
    });
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
      assert.ok(ch === '.' || ch in SOLID_CHARS || SPAWN_CHARS.includes(ch), `unknown map char '${ch}'`);
      count[ch] = (count[ch] || 0) + 1;
    }
  }
  assert.equal(count.P, 1, 'exactly one player start');
  assert.equal(count.G, 1, 'exactly one goal');
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
  t.move(100 + 128 * 2, 50 + 110 * 2); // canvas is drawn at 2x, offset (100, 50)
  const s = t.input.poll();
  assert.ok(s.ui.mouseMoved && Math.abs(s.ui.mouseX - 128) < 0.01 && Math.abs(s.ui.mouseY - 110) < 0.01);
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

// ---- whole-level runs ------------------------------------------------------------
// A simple bot: run right, shoot, jump at walls and gaps.
function botInput(w, prev) {
  const p = w.player, L = w.level;
  const footRow = Math.floor((p.y + p.h - 1) / TILE);
  const edgeCol = Math.floor((p.x + p.w + 1) / TILE);
  const wallCol = Math.floor((p.x + p.w + 10) / TILE);
  let groundBelow = false;
  for (let r = footRow + 1; r < L.h; r++) groundBelow = groundBelow || !!tileAt(L, edgeCol, r);
  const wall = !!tileAt(L, wallCol, footRow);
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

console.log(process.exitCode ? '\nSome tests failed.' : `\nAll ${passed} tests passed.`);
if (process.argv.includes('--map')) console.log(LEVEL_ROWS.join('\n'));
