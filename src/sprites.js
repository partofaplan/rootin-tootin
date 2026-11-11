// Pixel-art data only (no DOM) so it can be validated under Node.
// Every sprite is an array of equal-length strings; each char is a PAL key.

export const PAL = {
  '.': null, // transparent
  k: '#1b1220', // outline black
  w: '#fbf5ef', // white
  l: '#c8c8d0', // light grey
  g: '#7b7b8a', // grey
  d: '#45444f', // dark grey
  s: '#f2c98a', // skin
  b: '#8a4b2a', // brown
  B: '#5a2e1a', // dark brown
  y: '#f7d35c', // yellow
  o: '#e8843a', // orange
  r: '#d0402f', // red
  R: '#8c2330', // dark red
  p: '#a05a9a', // purple
  P: '#4a2f66', // dark purple
  u: '#3a6ea5', // blue
  n: '#5fa33a', // cactus green
  N: '#2f6b2e', // dark green
  f: '#c6ec5a', // fart green
  F: '#7fb82a', // dark fart green
};

// ---- Rudy Tootin' (16x16, faces right) ------------------------------------
const HEAD = [
  '................',
  '.....bbbbbb.....',
  '....bbbbbbbb....',
  '....rrrrrrrr....',
  '.bbbbbbbbbbbbbb.',
  '....sssssssss...',
  '....ssswksswk...',
  '...BBBBBBBBBBBB.',
  '..BBBB.sss.BBBB.',
];
const HEAD_HURT = [...HEAD.slice(0, 6), '....sskkssskk...', ...HEAD.slice(7)];
const TORSO = [
  '....rrrrrrrr....',
  '..rrrbbrrbbrrrs.',
  '..ss.bbyrbbb....',
  '....BBBByBBB....',
];
const LEGS = {
  idle: ['....uuuuuuuu....', '....uuu..uuu....', '...BBBB..BBBB...'],
  runA: ['....uuuuuuuu....', '...uuu....uuu...', '..BBB......BBBB.'],
  runB: ['....uuuuuuuu....', '.....uuuuuu.....', '.....BBBBBB.....'],
  runC: ['....uuuuuuuu....', '....uuu..uuu....', '....BBB...BBBB..'],
  jump: ['....uuuuuuuu....', '..BBuuu..uuuBB..', '................'],
  fart: ['...uuuuuuuuuu...', '..uuu......uuu..', '.BBBB......BBBB.'],
};
const rudy = (legs, head = HEAD) => [...head, ...TORSO, ...legs];

// ---- Giant scorpion (24x14, faces right) ----------------------------------
const SCORPION_BODY = [
  '.....rrrrrr.............',
  '....rr....rrr...........',
  '...rr.......rr..........',
  '...rr.......ryy.........',
  '...rr........y..........',
  '...rrr..............rr.r',
  '....rrr............rr..r',
  '.....rroooooooo....rrrr.',
  '....rooooooooooooo.rr...',
  '...roooRooRooRooooorr...',
  '...rooooooooooowkor.....',
  '....ooooooooooooooo.....',
];

// ---- Bandit (16x20, faces right) ------------------------------------------
const BANDIT_BODY = [
  '................',
  '.....dddddd.....',
  '....dddddddd....',
  '....dRRRRRRd....',
  '..dddddddddddd..',
  '....ssssssss....',
  '....ssksssks....',
  '....rrrrrrrr....',
  '....rrrrrrrr....',
  '.....rrrrrr.....',
  '...PPPPPPPPPP...',
  '..PPPpPPPPpPPsll',
  '..PPPPpPPpPPP.g.',
  '..PPPPPppPPPP...',
  '...PPPPPPPPPP...',
  '....dddddddd....',
];

// ---- Chupacabra (24x15, faces right) --------------------------------------
const CHUPA_BODY = [
  '......R...R...R.........',
  '.....RgR.RgR.RgR...g..g.',
  '....ggggggggggggg.ggggg.',
  '...gggggggggggggggggggg.',
  '..ggggdggggdgggggggykggg',
  '..gggggggggggggggggggggg',
  '.ggggggggggggggggggwgwg.',
  '.gg.ggggggggggggg.w.w...',
  'gg..ggggg...ggggg.......',
  'g...gggg.....gggg.......',
];

export const SPRITES = {
  rudyIdle: rudy(LEGS.idle),
  rudyRunA: rudy(LEGS.runA),
  rudyRunB: rudy(LEGS.runB),
  rudyRunC: rudy(LEGS.runC),
  rudyJump: rudy(LEGS.jump),
  rudyFart: rudy(LEGS.fart),
  rudyHurt: rudy(LEGS.jump, HEAD_HURT),

  gun: ['..llllll', 'lggggl..', 'lgg.....', 'bb......', 'bb......'],

  scorpionA: [
    ...SCORPION_BODY,
    '...r..r..r..r..r..r.....',
    '..r..r..r..r..r..r......',
  ],
  scorpionB: [
    ...SCORPION_BODY,
    '....r..r..r..r..r..r....',
    '.....r..r..r..r..r..r...',
  ],

  banditA: [
    ...BANDIT_BODY,
    '....ddd..ddd....',
    '....ddd..ddd....',
    '....ddd..ddd....',
    '...BBBB..BBBB...',
  ],
  banditB: [
    ...BANDIT_BODY,
    '....ddd..ddd....',
    '...ddd....ddd...',
    '...ddd....ddd...',
    '..BBBB....BBBB..',
  ],

  chupaA: [
    ...CHUPA_BODY,
    '....ggg.......ggg.......',
    '....gg........gg........',
    '....gg........gg........',
    '...ggg.......ggg........',
    '...www.......www........',
  ],
  chupaB: [
    ...CHUPA_BODY,
    '....ggg.......ggg.......',
    '...gg..........gg.......',
    '..gg............gg......',
    '.ggg............ggg.....',
    '.www............www.....',
  ],
  chupaLeap: [
    ...CHUPA_BODY,
    '...gggg.......gggg......',
    '.gggg...........gggg....',
    'www...............ggww..',
    '........................',
    '........................',
  ],

  cactus: [
    '................',
    '......nn........',
    '.....nnnn.......',
    '.....nnNn.......',
    '.....nnNn..nn...',
    '.nn..nnNn..nnn..',
    'nnn..nnNn..nNn..',
    'nNn..nnNn..nNn..',
    'nNn..nnNn..nNn..',
    'nNnnnnnNnnnnNn..',
    'nnnnnnnNnnnnn...',
    '.nnnnnnNn.......',
    '.....nnNn.......',
    '.....nnNn.......',
    '.....nnNn.......',
    '.....nnNn.......',
    '.....nnNn.......',
    '.....nnNn.......',
    '.....nnNn.......',
    '.....nnNn.......',
  ],

  beans: [
    '..llllll..',
    '.lwwwwwwl.',
    '.gllllllg.',
    '.nnnnnnnn.',
    '.nyyyyyyn.',
    '.nyBByByn.',
    '.nyyyyyyn.',
    '.nnnnnnnn.',
    '.gllllllg.',
    '..gggggg..',
  ],

  heart: [
    '.rr...rr.',
    'rrrr.rrrr',
    'rwrrrrrrr',
    'rrrrrrrrr',
    '.rrrrrrr.',
    '..rrrrr..',
    '...rrr...',
    '....r....',
  ],
};

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
};
