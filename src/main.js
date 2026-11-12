// Boot, fixed-timestep loop and the screen state machine.

import { createWorld, updateWorld, hurtPlayer, runFrames, VIEW_W, VIEW_H, NO_INPUT } from './game.js';
import { MODE_IDS, cleanMode, carryForward, retryPlan } from './modes.js';
import { TILE } from './level.js';
import {
  initRender, drawWorld, drawHUD, drawTitle, drawPause, drawControls, drawGameOver, drawWin,
  drawInitials, drawScores, drawSpriteSheet,
} from './render.js';
import { createInput, ACTIONS, SLOTS } from './input.js';
import {
  TITLE_MENU, PAUSE_MENU, menuItemAt, controlsCellAt, initialsHitAt, CTL_ROWS, CTL_RESET_ROW, CTL_BACK_ROW,
} from './ui.js';
import { createScoreStore, NAME_CHARS, NAME_LEN } from './hiscores.js';
import * as audio from './audio.js';

const STEP_MS = 1000 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
initRender(ctx);

function resize() { // whole-number scaling keeps the pixels square and crisp
  const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}
window.addEventListener('resize', resize);
resize();

// localStorage can throw (private windows, blocked site data), so guard it.
const storage = {
  getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { localStorage.setItem(key, value); } catch { /* keep in memory only */ } },
};

const input = createInput(window, canvas, storage);
// Hi scores live on the server so all players share one board (see hiscores.js).
const scores = createScoreStore({ fetchFn: (...args) => fetch(...args), storage });
scores.refresh();

let screen = 'title'; // title | controls | scores | play | pause | gameover | won | initials
let world = null;
let tick = 0;
let screenT = 0;
const titleMenu = { sel: 0 };
const pauseMenu = { sel: 0 };
const ctl = { row: 0, col: 0, listening: false, from: 'title' }; // controls screen cursor
const entry = { chars: ['A', 'A', 'A'], pos: 0, busy: false }; // initials being entered
const board = { highlight: -1 }; // hi-score screen: row to flash
// The current run: its mode, and how the current level was entered (so a
// game over can restart from the right place: see retryPlan).
let run = { mode: 'normal', levelIndex: 0, carry: null };

function go(next) {
  screen = next;
  screenT = 0;
}

// carry: { score, hp, farts, runTime } brought over from the level before.
function startGame(mode, levelIndex = 0, carry = null) {
  run = { mode: cleanMode(mode), levelIndex, carry };
  world = createWorld({ levelIndex, carry, mode: run.mode });
  go('play');
  input.releaseAll();
  audio.play('start');
  audio.startMusic();
}

function resumeGame() {
  go('play');
  input.releaseAll();
  audio.startMusic(false);
}

function openScores(highlight = -1) {
  board.highlight = highlight;
  go('scores');
  scores.refresh(); // pick up anything other players posted meanwhile
}

function openControls(from) {
  Object.assign(ctl, { row: 0, col: 0, listening: false, from });
  go('controls');
}

// Keyboard (up/down/enter) and mouse (hover/click) for a vertical menu.
// Returns the index of the item chosen this step, or -1.
function navMenu(menu, state, ui) {
  const n = menu.items.length;
  const before = state.sel;
  let pick = -1;
  if (ui.mouseMoved) {
    const i = menuItemAt(menu, ui.mouseX, ui.mouseY);
    if (i >= 0) state.sel = i;
  }
  if (ui.up) state.sel = (state.sel + n - 1) % n;
  if (ui.down) state.sel = (state.sel + 1) % n;
  if (ui.confirm) pick = state.sel;
  if (ui.click) {
    const i = menuItemAt(menu, ui.mouseX, ui.mouseY);
    if (i >= 0) { state.sel = i; pick = i; }
  }
  if (state.sel !== before) audio.play('reload');
  return pick;
}

function stepControls(inp) {
  const ui = inp.ui;
  if (ctl.listening) { // waiting for the new key / mouse button
    if (inp.captured) {
      if (inp.captured !== 'Escape' && input.bind(ACTIONS[ctl.row].id, ctl.col, inp.captured)) audio.play('pickup');
      ctl.listening = false;
    }
    return;
  }

  const before = `${ctl.row},${ctl.col}`;
  const hover = controlsCellAt(ui.mouseX, ui.mouseY);
  const pointAt = (cell) => {
    ctl.row = cell.row;
    if (cell.row < ACTIONS.length) ctl.col = cell.col;
  };
  if (ui.mouseMoved && hover) pointAt(hover);
  if (ui.up) ctl.row = (ctl.row + CTL_ROWS - 1) % CTL_ROWS;
  if (ui.down) ctl.row = (ctl.row + 1) % CTL_ROWS;
  if (ui.left) ctl.col = Math.max(0, ctl.col - 1);
  if (ui.right) ctl.col = Math.min(SLOTS - 1, ctl.col + 1);

  let activate = ui.confirm;
  let clear = ui.clear;
  if (ui.click && hover) { pointAt(hover); activate = true; }
  if (ui.rightClick && hover) { pointAt(hover); clear = true; }
  if (`${ctl.row},${ctl.col}` !== before) audio.play('reload');

  const isAction = ctl.row < ACTIONS.length;
  if (ui.back || (activate && ctl.row === CTL_BACK_ROW)) {
    go(ctl.from);
  } else if (activate && ctl.row === CTL_RESET_ROW) {
    input.reset();
    audio.play('checkpoint');
  } else if (activate && isAction) {
    ctl.listening = true;
    input.capture();
  } else if (clear && isAction) {
    input.clear(ACTIONS[ctl.row].id, ctl.col);
    audio.play('hit');
  }
}

// Arcade-style initials: type letters, or use arrows / the on-screen arrows.
function stepInitials(inp) {
  const ui = inp.ui;
  if (entry.busy) return;
  const last = NAME_LEN - 1;
  const cycle = (i, by) => {
    const n = NAME_CHARS.length;
    entry.pos = i;
    entry.chars[i] = NAME_CHARS[(NAME_CHARS.indexOf(entry.chars[i]) + by + n) % n];
    audio.play('reload');
  };
  for (const ch of ui.typed) {
    entry.chars[entry.pos] = ch;
    entry.pos = Math.min(last, entry.pos + 1);
    audio.play('reload');
  }
  if (ui.left || ui.clear) entry.pos = Math.max(0, entry.pos - 1);
  if (ui.right) entry.pos = Math.min(last, entry.pos + 1);
  if (ui.up) cycle(entry.pos, 1);
  if (ui.down) cycle(entry.pos, -1);

  let save = ui.confirm;
  if (ui.click) {
    const hit = initialsHitAt(ui.mouseX, ui.mouseY);
    if (hit && hit.type === 'up') cycle(hit.i, 1);
    else if (hit && hit.type === 'down') cycle(hit.i, -1);
    else if (hit && hit.type === 'slot') entry.pos = hit.i;
    else if (hit && hit.type === 'ok') save = true;
  }
  if (save) {
    entry.busy = true;
    audio.play('checkpoint');
    scores.submit(entry.chars.join(''), world.score, run.mode).then(({ rank }) => {
      entry.busy = false;
      openScores(rank);
    });
  }
}

function step() {
  let inp = input.poll();
  if (debug) inp = debug.input(inp);
  tick++;
  screenT++;
  if (inp.anyPressed) audio.unlock();
  if (inp.mutePressed && screen !== 'initials') audio.toggleMute(); // letters are for typing there

  switch (screen) {
    case 'title': {
      const pick = navMenu(TITLE_MENU, titleMenu, inp.ui);
      if (pick === 0 || pick === 1) startGame(MODE_IDS[pick]);
      else if (pick === 2) openScores();
      else if (pick === 3) openControls('title');
      break;
    }
    case 'scores':
      if (screenT > 15 && (inp.ui.confirm || inp.ui.click || inp.ui.back)) go('title');
      break;
    case 'initials':
      stepInitials(inp);
      break;
    case 'controls':
      stepControls(inp);
      break;
    case 'play':
      if (inp.pausePressed) { pauseMenu.sel = 0; go('pause'); audio.stopMusic(); break; }
      updateWorld(world, inp);
      for (const e of world.events) audio.play(e);
      world.events.length = 0;
      if (world.state === 'gameover' || world.state === 'won') go(world.state);
      break;
    case 'pause': {
      const pick = navMenu(PAUSE_MENU, pauseMenu, inp.ui);
      if (pick === 0 || (pick < 0 && inp.pausePressed)) resumeGame();
      else if (pick === 1) openControls('pause');
      else if (pick === 2) go('title');
      break;
    }
    case 'gameover':
      updateWorld(world, NO_INPUT); // let particles settle
      world.events.length = 0;
      if (screenT > 45 && inp.ui.back) go('title');
      else if (screenT > 45 && (inp.ui.confirm || inp.ui.click)) {
        // Normal: retry the level Rudy died on. Speed run: back to level 1.
        const plan = retryPlan(run.mode, run);
        startGame(run.mode, plan.levelIndex, plan.carry);
      }
      break;
    case 'won':
      updateWorld(world, NO_INPUT);
      world.events.length = 0;
      if (screenT > 45 && (inp.ui.confirm || inp.ui.click || inp.pausePressed)) {
        if (!world.lastLevel) { // on to the next level, keeping score, hearts, beans and the run clock
          startGame(run.mode, world.levelIndex + 1, carryForward(world, runFrames(world)));
        } else if (scores.qualifies(world.score)) { // finishing the game can earn a spot on the board
          Object.assign(entry, { pos: 0, busy: false });
          go('initials');
        } else openScores();
      }
      break;
  }
}

function render() {
  const muted = audio.isMuted();
  if (screen === 'sprites') { drawSpriteSheet(ctx); return; }
  if (screen === 'title') { drawTitle(ctx, tick, scores.best(), muted, titleMenu.sel, input.getBindings()); return; }
  if (screen === 'controls') { drawControls(ctx, tick, input.getBindings(), ctl); return; }
  if (screen === 'scores') { drawScores(ctx, tick, scores.list(), board.highlight, scores.isShared()); return; }
  if (screen === 'initials') { drawInitials(ctx, tick, entry, world.score); return; }
  drawWorld(ctx, world);
  drawHUD(ctx, world, muted);
  if (screen === 'pause') drawPause(ctx, pauseMenu.sel, tick);
  else if (screen === 'gameover') drawGameOver(ctx, world, scores.best() ? scores.best().score : 0, tick);
  else if (screen === 'won' && screenT > 30) drawWin(ctx, world, scores.qualifies(world.score), tick);
}

// ---- debug hooks (?debug=play&col=160&hold=right,shoot&fartAt=30&skip=120) -----
// Used for automated screenshots; has no effect without the query string.
// debug = title | controls | scores | initials | sprites | play | pause | gameover | won
function makeDebug() {
  const q = new URLSearchParams(window.location.search);
  const mode = q.get('debug');
  if (!mode) return null;
  const hold = (q.get('hold') || '').split(',').filter(Boolean);
  const fartAt = Number(q.get('fartAt')) || 0;
  if (q.get('sel')) titleMenu.sel = pauseMenu.sel = Number(q.get('sel'));
  if (mode === 'controls') {
    openControls('title');
    ctl.row = Number(q.get('row')) || 0;
    ctl.col = Number(q.get('slot')) || 0;
    ctl.listening = !!q.get('listen');
  } else if (mode === 'sprites') {
    screen = 'sprites';
  } else if (mode === 'audio') { // result is readable with --dump-dom
    document.body.dataset.audio = audio.selfTest();
  } else if (mode === 'scores') {
    openScores(Number(q.get('row') ?? -1));
  } else if (mode === 'initials') {
    world = createWorld();
    world.score = Number(q.get('score')) || 4850;
    Object.assign(entry, { chars: ['R', 'U', 'D'], pos: 1 });
    screen = 'initials';
  } else if (mode !== 'title') {
    run = { mode: cleanMode(q.get('mode')), levelIndex: (Number(q.get('level')) || 1) - 1, carry: null }; // &level=2&mode=speedrun
    world = createWorld({ levelIndex: run.levelIndex, mode: run.mode });
    screen = 'play';
    const col = Number(q.get('col'));
    if (col) {
      const p = world.player;
      p.x = col * TILE;
      p.y = Number(q.get('y')) || 0;
      world.camX = Math.max(0, Math.min(world.level.pxW - VIEW_W, p.x - VIEW_W / 2));
    }
    if (q.get('farts')) world.player.farts = Number(q.get('farts'));
    if (q.get('god')) world.god = true;
    if (q.get('turbo')) world.player.turbo = Number(q.get('turbo'));
    if (q.get('found')) world.secretFound = true;
    if (mode === 'pause') screen = 'pause';
    if (mode === 'gameover') { world.player.hp = 1; hurtPlayer(world, 0); }
    if (mode === 'won' && world.goal) { world.player.x = world.goal.x - 30; world.camX = world.level.pxW - VIEW_W; hold.push('right'); }
    if (q.get('bosshp')) world.boss.hp = Number(q.get('bosshp'));
    if (q.get('time')) world.time = Number(q.get('time'));
  }
  return {
    input(inp) {
      const out = { ...inp };
      for (const a of hold) out[a] = true;
      if (fartAt && world && world.frame === fartAt) out.fartPressed = true;
      return out;
    },
  };
}
const debug = makeDebug();
if (debug) { // &skip=N fast-forwards N frames before the first draw
  const skip = Number(new URLSearchParams(window.location.search).get('skip')) || 0;
  for (let i = 0; i < skip; i++) step();
}

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(100, now - last); // clamp so a background tab doesn't fast-forward
  last = now;
  while (acc >= STEP_MS) {
    step();
    acc -= STEP_MS;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
