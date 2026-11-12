// Game modes. Pure logic (no DOM) so the rules can be tested.
//
//   normal   - lose all your hearts and you retry the level you were on.
//   speedrun - lose all your hearts and the run starts over from level 1;
//              a clock runs for the whole run.

import { MAX_HP } from './game.js';

export const MODES = {
  normal: { label: 'NORMAL GAME', short: 'NORMAL' },
  speedrun: { label: 'SPEED RUN', short: 'SPEED' },
};
export const MODE_IDS = Object.keys(MODES);

export const cleanMode = (raw) => (raw === 'speedrun' ? 'speedrun' : 'normal');

// What Rudy carries into the next level after finishing one.
// runFrames: play time so far in this run, in frames.
export function carryForward(world, runFrames) {
  return { score: world.score, hp: world.player.hp, farts: world.player.farts, runTime: runFrames };
}

// Where to restart after a game over.
// entry: { levelIndex, carry } exactly as the level was entered (carry is null on level 1).
// Returns { levelIndex, carry } to start again with.
export function retryPlan(mode, entry) {
  if (cleanMode(mode) === 'speedrun' || !entry.carry) return { levelIndex: mode === 'speedrun' ? 0 : entry.levelIndex, carry: null };
  // Normal: same level, with the score you arrived with, full hearts, and at least one fart.
  return { levelIndex: entry.levelIndex, carry: { ...entry.carry, hp: MAX_HP, farts: Math.max(1, entry.carry.farts) } };
}

// Frames -> "m:ss.t"
export function formatTime(frames) {
  const tenths = Math.floor((frames / 60) * 10);
  const m = Math.floor(tenths / 600), s = Math.floor(tenths / 10) % 60;
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}
