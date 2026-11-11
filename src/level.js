// Level data + tile collision. Pure logic (no DOM) so it runs under Node.

export const TILE = 16;
export const ROWS = 15;

// Map legend
//   .  empty        #  sand (solid)     =  rock (solid)
//   P  player start s  scorpion         b  bandit        c  chupacabra
//   B  bean can     H  heart            C  hazard cactus
//   K  checkpoint   G  goal (saloon door)
export const SOLID_CHARS = { '#': 1, '=': 2 };
export const SPAWN_CHARS = 'PsbcBHCKG';

// The level is authored with a tiny cursor-based builder (so column counts
// never have to be lined up by hand) and emitted as an ASCII tilemap.
function buildRows() {
  const columns = []; // { h, ch } ground height in tiles (0 = pit)
  const plats = [];
  const marks = [];

  const mark = (items, col0, row) => {
    for (const [ch, offsets] of Object.entries(items)) {
      for (const o of offsets) marks.push({ ch, col: col0 + o, row });
    }
  };
  // n columns of ground, h tiles tall. items: { spawnChar: [offsets...] } standing on it.
  const seg = (n, h, items = {}, ch = '#') => {
    const col0 = columns.length;
    for (let i = 0; i < n; i++) columns.push({ h, ch });
    mark(items, col0, ROWS - h - 1);
  };
  // Floating rock platform, dx columns after the cursor, at absolute tile row.
  const plat = (dx, row, n, items = {}) => {
    const col0 = columns.length + dx;
    plats.push({ col0, row, n });
    mark(items, col0, row - 1);
  };
  const pit = (n) => seg(n, 0);

  // --- 1. Open flats: learn to shoot ---------------------------------------
  seg(16, 2, { P: [2] });
  seg(12, 2, { s: [5] });
  seg(5, 3, { B: [2] });
  seg(12, 2, { s: [3, 9] });
  pit(2);
  seg(10, 2, { s: [6] });

  // --- 2. Mesas and pits ----------------------------------------------------
  seg(4, 3, {}, '=');
  seg(6, 4, { b: [3] }, '=');
  seg(4, 2);
  pit(3);
  plat(2, 11, 4, { B: [1] });
  seg(8, 2, { s: [5] });
  plat(1, 12, 2);
  plat(5, 11, 2);
  pit(10);
  seg(14, 2, { K: [2], b: [10] });

  // --- 3. Canyon: chupacabras and cacti --------------------------------------
  seg(17, 1, { C: [6], c: [12] });
  seg(4, 3, {}, '=');
  plat(1, 10, 3, { H: [1] });
  seg(12, 1, { C: [3], c: [7], B: [10] });
  pit(2);
  seg(12, 1, { c: [4, 10], s: [7] });
  seg(4, 2);

  // --- 4. Bandit camp ambush -------------------------------------------------
  seg(8, 2, { B: [3] });
  plat(9, 11, 5, { b: [2] });
  seg(22, 2, { C: [2], b: [6, 15], s: [8, 17], c: [20] });
  pit(2);
  seg(6, 3, {}, '=');

  // --- 5. Saloon ---------------------------------------------------------------
  seg(20, 2, { c: [5], G: [14] });

  const width = columns.length;
  const grid = Array.from({ length: ROWS }, () => Array(width).fill('.'));
  columns.forEach(({ h, ch }, c) => {
    for (let r = ROWS - h; r < ROWS; r++) grid[r][c] = ch;
  });
  for (const p of plats) {
    for (let i = 0; i < p.n; i++) grid[p.row][p.col0 + i] = '=';
  }
  for (const m of marks) {
    if (grid[m.row][m.col] !== '.') {
      throw new Error(`level: spawn '${m.ch}' overlaps '${grid[m.row][m.col]}' at col ${m.col}, row ${m.row}`);
    }
    grid[m.row][m.col] = m.ch;
  }
  return grid.map((r) => r.join(''));
}

export const LEVEL_ROWS = buildRows();

export function parseLevel(rows = LEVEL_ROWS) {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const spawns = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (SOLID_CHARS[ch]) tiles[r * w + c] = SOLID_CHARS[ch];
      else if (ch !== '.') spawns.push({ type: ch, col: c, row: r });
    }
  }
  const level = { w, h, pxW: w * TILE, pxH: h * TILE, tiles, spawns, pits: [] };

  // Pits: runs of columns with no ground at the bottom of the map.
  let c = 0;
  while (c < w) {
    if (surfaceRow(level, c) === h) {
      let c1 = c;
      while (c1 + 1 < w && surfaceRow(level, c1 + 1) === h) c1++;
      const left = c > 0 ? surfaceRow(level, c - 1) : 0;
      const right = c1 + 1 < w ? surfaceRow(level, c1 + 1) : 0;
      level.pits.push({ col0: c, col1: c1, topRow: Math.max(left, right) });
      c = c1 + 1;
    } else c++;
  }
  return level;
}

// Top row of the solid stack rising from the bottom of column c (level.h if none).
export function surfaceRow(level, c) {
  let r = level.h;
  while (r > 0 && level.tiles[(r - 1) * level.w + c]) r--;
  return r;
}

// Outside the map: walls left/right, open sky above, open pit below.
export function tileAt(level, c, r) {
  if (c < 0 || c >= level.w) return 1;
  if (r < 0 || r >= level.h) return 0;
  return level.tiles[r * level.w + c];
}

export function rectSolid(level, x, y, w, h) {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.ceil((x + w) / TILE) - 1;
  const r0 = Math.floor(y / TILE);
  const r1 = Math.ceil((y + h) / TILE) - 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (tileAt(level, c, r)) return true;
    }
  }
  return false;
}

// Moves body b ({x,y,w,h,vx,vy}) one step, resolving against solid tiles.
// Sets b.onGround and b.hitWall.
export function moveBody(level, b) {
  b.hitWall = false;
  if (b.vx !== 0) {
    b.x += b.vx;
    if (rectSolid(level, b.x, b.y, b.w, b.h)) {
      if (b.vx > 0) b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w;
      else b.x = Math.floor(b.x / TILE) * TILE + TILE;
      b.vx = 0;
      b.hitWall = true;
    }
  }
  b.onGround = false;
  b.y += b.vy;
  if (rectSolid(level, b.x, b.y, b.w, b.h)) {
    if (b.vy > 0) {
      b.y = Math.floor((b.y + b.h) / TILE) * TILE - b.h;
      b.onGround = true;
    } else {
      b.y = Math.floor(b.y / TILE) * TILE + TILE;
    }
    b.vy = 0;
  }
}
