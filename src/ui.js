// Menu layouts and mouse hit-testing, shared by main.js (logic) and
// render.js (drawing). Pure data and math: no DOM.

import { ACTIONS, SLOTS } from './input.js';

const CENTER_X = 128;
const textW = (s) => s.length * 6 - 1;

export const TITLE_MENU = { y: 108, step: 12, items: ['START GAME', 'CONTROLS'] };
export const PAUSE_MENU = { y: 112, step: 14, items: ['RESUME', 'CONTROLS', 'QUIT TO TITLE'] };

function overCentered(label, y, mx, my) {
  const half = textW(label) / 2 + 10;
  return mx >= CENTER_X - half && mx <= CENTER_X + half && my >= y - 3 && my < y + 10;
}

// Index of the menu item under the mouse, or -1.
export function menuItemAt(menu, mx, my) {
  return menu.items.findIndex((label, i) => overCentered(label, menu.y + i * menu.step, mx, my));
}

// Controls screen: one row per action with SLOTS binding cells, then two
// full-width rows (reset, back).
export const CTL = {
  labelX: 8,
  slotX: [72, 132, 192],
  slotW: 56,
  rowY: 44,
  rowH: 14,
  resetY: 150,
  backY: 164,
  resetLabel: 'RESET TO DEFAULTS',
  backLabel: 'BACK',
};
export const CTL_RESET_ROW = ACTIONS.length;
export const CTL_BACK_ROW = ACTIONS.length + 1;
export const CTL_ROWS = ACTIONS.length + 2;

// { row, col } of the controls-screen cell under the mouse, or null.
export function controlsCellAt(mx, my) {
  for (let row = 0; row < ACTIONS.length; row++) {
    const y = CTL.rowY + row * CTL.rowH - 3;
    if (my < y || my >= y + 13) continue;
    for (let col = 0; col < SLOTS; col++) {
      if (mx >= CTL.slotX[col] && mx < CTL.slotX[col] + CTL.slotW) return { row, col };
    }
    return null;
  }
  if (overCentered(CTL.resetLabel, CTL.resetY, mx, my)) return { row: CTL_RESET_ROW, col: 0 };
  if (overCentered(CTL.backLabel, CTL.backY, mx, my)) return { row: CTL_BACK_ROW, col: 0 };
  return null;
}
