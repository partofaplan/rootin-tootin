// Level data + tile collision. Pure logic (no DOM) so it runs under Node.

export const TILE = 16;
export const ROWS = 15;

// Map legend
//   .  empty
//   #  ground (solid): sand / floorboards     =  block (solid): rock / crates
//   -  ledge (solid): shelf or balcony
//   P  player start   K  checkpoint          G  goal (saloon door)
//   s  scorpion       b  bandit              c  chupacabra
//   r  big rat        m  bottle-throwing madam   F  the boss, Big Frank
//   B  bean can       H  heart               C  hazard (cactus)
//   %  secret space: open air that looks like solid rock until Rudy finds it
//   E  easter egg (5-alarm chili), also a secret space
//   D  the trick dartboard: shoot it and it drops the easter egg
export const SOLID_CHARS = { '#': 1, '=': 2, '-': 3 };
export const SPAWN_CHARS = 'PsbcrmFBHCKGED';
export const SECRET_CHARS = '%E';

// Levels are authored with a tiny cursor-based builder (so column counts
// never have to be lined up by hand) and emitted as ASCII tilemaps.
function builder() {
  const columns = []; // { h, ch } ground height in tiles (0 = pit)
  const plats = [];
  const marks = [];
  const edits = [];

  const mark = (items, col0, row) => {
    for (const [ch, offsets] of Object.entries(items)) {
      for (const o of offsets) marks.push({ ch, col: col0 + o, row });
    }
  };
  const api = {
    cursor: () => columns.length,
    // n columns of ground, h tiles tall. items: { spawnChar: [offsets...] } standing on it.
    seg(n, h, items = {}, ch = '#') {
      const col0 = columns.length;
      for (let i = 0; i < n; i++) columns.push({ h, ch });
      mark(items, col0, ROWS - h - 1);
    },
    // Floating platform, dx columns after the cursor, at absolute tile row.
    plat(dx, row, n, items = {}, ch = '=') {
      const col0 = columns.length + dx;
      plats.push({ col0, row, n, ch });
      mark(items, col0, row - 1);
    },
    pit(n) { api.seg(n, 0); },
    // One spawn at an absolute row, dx columns after the cursor (for things in mid-air).
    at(ch, dx, row) { marks.push({ ch, col: columns.length + dx, row }); },
    // Overwrites a single cell after the terrain is laid down (for hollows).
    carve(col, row, ch) { edits.push({ col, row, ch }); },
    rows() {
      const width = columns.length;
      const grid = Array.from({ length: ROWS }, () => Array(width).fill('.'));
      columns.forEach(({ h, ch }, c) => {
        for (let r = ROWS - h; r < ROWS; r++) grid[r][c] = ch;
      });
      for (const p of plats) {
        for (let i = 0; i < p.n; i++) grid[p.row][p.col0 + i] = p.ch;
      }
      for (const e of edits) grid[e.row][e.col] = e.ch;
      for (const m of marks) {
        if (grid[m.row][m.col] !== '.') {
          throw new Error(`level: spawn '${m.ch}' overlaps '${grid[m.row][m.col]}' at col ${m.col}, row ${m.row}`);
        }
        grid[m.row][m.col] = m.ch;
      }
      return grid.map((r) => r.join(''));
    },
  };
  return api;
}

// ---- Level 1: the desert --------------------------------------------------------
function buildDesert() {
  const { seg, plat, pit, carve, cursor, rows } = builder();

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
  plat(2, 10, 4, { B: [1] });
  seg(8, 2, { s: [5] });
  plat(2, 12, 3);
  plat(7, 11, 3);
  pit(13);
  seg(14, 2, { K: [2], b: [10] });

  // --- 3. Canyon: chupacabras and cacti --------------------------------------
  seg(16, 1, { C: [6], c: [12] });
  seg(1, 2, {}, '=');
  // A hollow butte. Its right-hand face is a false wall: walk back into it
  // from the far side to find the cave, and the easter egg at the back.
  const butte = cursor();
  seg(5, 4, {}, '=');
  for (let c = butte + 1; c <= butte + 4; c++) {
    carve(c, ROWS - 3, '%');
    carve(c, ROWS - 2, '%');
  }
  carve(butte + 1, ROWS - 2, 'E');
  plat(1, 10, 3, { H: [1] });
  seg(12, 1, { C: [3], c: [7], B: [10] });
  pit(2);
  seg(12, 1, { c: [4, 10], s: [7] });
  seg(4, 2);

  // --- 4. Bandit camp ambush -------------------------------------------------
  seg(8, 2, { B: [3] });
  plat(9, 10, 5, { b: [2] });
  seg(22, 2, { C: [2], b: [6, 15], s: [8, 17], c: [20] });
  pit(2);
  seg(6, 3, {}, '=');

  // --- 5. Saloon ---------------------------------------------------------------
  seg(20, 2, { c: [5], G: [14] });
  return rows();
}

// ---- Level 2: the saloon that keeps going on and on ---------------------------------
// Floorboards, crate stacks ('='), balcony ledges ('-') and holes down to the cellar.
export const ARENA_COLS = 16; // Big Frank's room: exactly one screen wide

function buildSaloon() {
  const { seg, plat, pit, at, rows } = builder();

  // --- 1. Through the swinging doors: rats -------------------------------------
  seg(14, 2, { P: [2] });
  seg(14, 2, { r: [5, 10] });
  seg(3, 3, { B: [1] }, '=');
  seg(8, 2, { r: [5] });

  // --- 2. The first madam, up on a balcony ----------------------------------------
  plat(2, 10, 5, { m: [2] }, '-');
  seg(11, 2, { b: [7] });
  pit(2);
  seg(9, 2, { r: [3, 7] });

  // --- 3. Crate stacks --------------------------------------------------------------
  seg(2, 3, {}, '=');
  seg(3, 4, { b: [1] }, '=');
  seg(2, 3, {}, '=');
  seg(12, 2, { C: [3], K: [6], r: [10] });

  // --- 4. Ledges over the cellar ------------------------------------------------------
  plat(2, 12, 3, {}, '-');
  plat(7, 11, 3, { B: [1] }, '-');
  pit(13);
  seg(12, 2, { r: [4], m: [9] });

  // --- 5. The trick dartboard (easter egg): one board hangs on a post, not the wall.
  //        Jump and shoot it. ---------------------------------------------------------
  at('D', 5, 10);
  seg(14, 2, { b: [10] });
  seg(3, 3, {}, '=');
  plat(1, 10, 4, { m: [2] }, '-');
  seg(10, 2, { r: [3, 6], C: [8] });
  pit(3);
  seg(4, 3, { H: [2] }, '=');
  seg(12, 2, { b: [4], r: [8], B: [10] });
  pit(2);

  // --- 6. Last stop before the boss ------------------------------------------------------
  seg(10, 2, { K: [2], m: [8] });
  seg(6, 2, { B: [2], H: [4] });

  // --- 7. Big Frank's room -------------------------------------------------------------------
  seg(ARENA_COLS, 2, { F: [12] });
  return rows();
}

export const LEVELS = [
  { name: 'DUSTY GULCH', theme: 'desert', rows: buildDesert() },
  { name: 'THE ENDLESS SALOON', theme: 'saloon', rows: buildSaloon() },
];
export const LEVEL_ROWS = LEVELS[0].rows;

export function parseLevel(rows = LEVEL_ROWS) {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const secret = new Uint8Array(w * h);
  const spawns = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (SOLID_CHARS[ch]) tiles[r * w + c] = SOLID_CHARS[ch];
      else {
        if (SECRET_CHARS.includes(ch)) secret[r * w + c] = 1;
        if (ch !== '.' && ch !== '%') spawns.push({ type: ch, col: c, row: r });
      }
    }
  }
  const level = { w, h, pxW: w * TILE, pxH: h * TILE, tiles, secret, spawns, pits: [], secretMouth: null };

  // The secret's entrance: the floor at the outer edge of its right-most cell.
  for (let c = w - 1; c >= 0 && !level.secretMouth; c--) {
    for (let r = h - 1; r >= 0; r--) {
      if (secret[r * w + c]) { level.secretMouth = { x: (c + 1) * TILE, y: (r + 1) * TILE }; break; }
    }
  }

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
// blockSecret: treat undiscovered secret spaces as the rock they appear to be.
export function tileAt(level, c, r, blockSecret = false) {
  if (c < 0 || c >= level.w) return 1;
  if (r < 0 || r >= level.h) return 0;
  const i = r * level.w + c;
  return level.tiles[i] || (blockSecret && level.secret[i] ? 2 : 0);
}

export function secretAt(level, c, r) {
  return c >= 0 && c < level.w && r >= 0 && r < level.h && level.secret[r * level.w + c] === 1;
}

// True if the rectangle overlaps any secret space.
export function rectSecret(level, x, y, w, h) {
  for (let r = Math.floor(y / TILE); r <= Math.ceil((y + h) / TILE) - 1; r++) {
    for (let c = Math.floor(x / TILE); c <= Math.ceil((x + w) / TILE) - 1; c++) {
      if (secretAt(level, c, r)) return true;
    }
  }
  return false;
}

export function rectSolid(level, x, y, w, h, blockSecret = false) {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.ceil((x + w) / TILE) - 1;
  const r0 = Math.floor(y / TILE);
  const r1 = Math.ceil((y + h) / TILE) - 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (tileAt(level, c, r, blockSecret)) return true;
    }
  }
  return false;
}

// Moves body b ({x,y,w,h,vx,vy}) one step, resolving against solid tiles.
// Sets b.onGround and b.hitWall.
export function moveBody(level, b, blockSecret = false) {
  b.hitWall = false;
  if (b.vx !== 0) {
    b.x += b.vx;
    if (rectSolid(level, b.x, b.y, b.w, b.h, blockSecret)) {
      if (b.vx > 0) b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w;
      else b.x = Math.floor(b.x / TILE) * TILE + TILE;
      b.vx = 0;
      b.hitWall = true;
    }
  }
  b.onGround = false;
  b.y += b.vy;
  if (rectSolid(level, b.x, b.y, b.w, b.h, blockSecret)) {
    if (b.vy > 0) {
      b.y = Math.floor((b.y + b.h) / TILE) * TILE - b.h;
      b.onGround = true;
    } else {
      b.y = Math.floor(b.y / TILE) * TILE + TILE;
    }
    b.vy = 0;
  }
}
