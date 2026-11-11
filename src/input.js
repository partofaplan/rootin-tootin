// Keyboard + mouse input with rebindable controls.
//
// A binding is a string code: a KeyboardEvent.code ("KeyZ", "Space") or a
// mouse button ("Mouse0" = left, "Mouse1" = middle, "Mouse2" = right, ...).
// Each action has SLOTS bindings. Menus use fixed keys (arrows, Enter, Esc,
// Backspace) and the mouse, so the player can never rebind their way out of them.

export const SLOTS = 3;
export const STORAGE_KEY = 'rootin-tootin.controls';

export const ACTIONS = [
  { id: 'left', label: 'MOVE LEFT' },
  { id: 'right', label: 'MOVE RIGHT' },
  { id: 'jump', label: 'JUMP' },
  { id: 'shoot', label: 'SHOOT' },
  { id: 'fart', label: 'FART' },
  { id: 'pause', label: 'PAUSE' },
  { id: 'mute', label: 'MUTE SOUND' },
];

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA', null],
  right: ['ArrowRight', 'KeyD', null],
  jump: ['ArrowUp', 'KeyW', 'Space'],
  shoot: ['KeyZ', 'KeyJ', 'Mouse0'],
  fart: ['KeyX', 'KeyK', 'Mouse2'],
  pause: ['Enter', 'KeyP', null],
  mute: ['KeyM', null, null],
};

const MENU_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Escape', 'Backspace', 'Delete', 'Space', 'Tab']);

const NAMES = {
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  Space: 'SPACE', Enter: 'ENTER', Backspace: 'BACKSPACE', Tab: 'TAB', Escape: 'ESC',
  ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL',
  AltLeft: 'L ALT', AltRight: 'R ALT', CapsLock: 'CAPS LOCK',
  Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH', Backslash: 'BACKSLASH', Semicolon: 'SEMICOLON',
  Quote: 'QUOTE', BracketLeft: 'L BRACKET', BracketRight: 'R BRACKET', Minus: 'MINUS', Equal: 'EQUALS',
  Backquote: 'BACKQUOTE', Delete: 'DELETE', Insert: 'INSERT', Home: 'HOME', End: 'END',
  PageUp: 'PAGE UP', PageDown: 'PAGE DOWN',
  NumpadEnter: 'NUM ENTER', NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM STAR',
  NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
  Mouse0: 'MOUSE L', Mouse1: 'MOUSE M', Mouse2: 'MOUSE R', Mouse3: 'MOUSE 4', Mouse4: 'MOUSE 5',
};

// Short display name (max 9 chars, font-safe) for a binding code.
export function bindingName(code) {
  if (!code) return '---';
  if (NAMES[code]) return NAMES[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return `NUM ${m[1]}`;
  return code.toUpperCase().slice(0, 9);
}

// Esc always pauses / goes back, and browser-level keys are left alone.
export function isBindable(code) {
  return typeof code === 'string' && code !== '' && code !== 'Unidentified' && code !== 'Escape' &&
    code !== 'ContextMenu' && !code.startsWith('Meta') && !/^F\d+$/.test(code);
}

const cloneDefaults = () => Object.fromEntries(ACTIONS.map((a) => [a.id, [...DEFAULT_BINDINGS[a.id]]]));

// Turns anything (e.g. stale or corrupt saved data) into a valid bindings object.
export function normalizeBindings(raw) {
  if (!raw || typeof raw !== 'object') return cloneDefaults();
  const out = {};
  const used = new Set();
  for (const { id } of ACTIONS) {
    const src = Array.isArray(raw[id]) ? raw[id] : DEFAULT_BINDINGS[id];
    out[id] = [];
    for (let s = 0; s < SLOTS; s++) {
      const code = src[s];
      const ok = isBindable(code) && !used.has(code);
      if (ok) used.add(code);
      out[id].push(ok ? code : null);
    }
  }
  return out;
}

// Assigns code to one slot. A code can only drive one action, so it is
// removed from wherever else it was bound.
export function rebind(bindings, action, slot, code) {
  if (!isBindable(code) || !bindings[action] || slot < 0 || slot >= SLOTS) return false;
  for (const { id } of ACTIONS) {
    bindings[id] = bindings[id].map((c) => (c === code ? null : c));
  }
  bindings[action][slot] = code;
  return true;
}

// target: where to listen (window). canvas: used to map the mouse into game
// pixels. storage: optional { getItem, setItem } for persistence.
export function createInput(target, canvas, storage) {
  const down = new Set(); // codes currently held
  const ignored = new Set(); // held codes that must be released before they count again
  const pressed = new Set(); // codes pressed since the last poll
  const mouse = { x: -1, y: -1, moved: false };
  let any = false;
  let capturing = false;
  let captured = null;
  let bindings = load();

  function load() {
    try { return normalizeBindings(JSON.parse(storage.getItem(STORAGE_KEY))); } catch { return cloneDefaults(); }
  }
  function save() {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch { /* not persisted; still works this session */ }
  }
  const isBound = (code) => ACTIONS.some((a) => bindings[a.id].includes(code));

  function onPress(code) {
    any = true;
    down.add(code);
    if (capturing) { // the controls screen is waiting for a new binding
      if (code !== 'Escape' && !isBindable(code)) return;
      capturing = false;
      captured = code;
      ignored.add(code);
      return;
    }
    pressed.add(code);
  }
  function onRelease(code) {
    down.delete(code);
    ignored.delete(code);
  }
  function trackMouse(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    mouse.x = ((e.clientX - r.left) * canvas.width) / r.width;
    mouse.y = ((e.clientY - r.top) * canvas.height) / r.height;
  }

  target.addEventListener('keydown', (e) => {
    const code = e.code;
    if (!code) return;
    if (e.metaKey || (e.ctrlKey && !code.startsWith('Control'))) return; // browser shortcuts
    if (capturing || MENU_KEYS.has(code) || isBound(code)) e.preventDefault();
    if (e.repeat) return;
    onPress(code);
  });
  target.addEventListener('keyup', (e) => onRelease(e.code));
  target.addEventListener('mousemove', (e) => { trackMouse(e); mouse.moved = true; });
  target.addEventListener('mousedown', (e) => {
    trackMouse(e);
    if (e.button !== 0) e.preventDefault(); // no autoscroll / back-forward navigation
    onPress(`Mouse${e.button}`);
  });
  target.addEventListener('mouseup', (e) => onRelease(`Mouse${e.button}`));
  target.addEventListener('contextmenu', (e) => e.preventDefault());
  target.addEventListener('blur', () => { down.clear(); ignored.clear(); });

  const held = (id) => bindings[id].some((c) => c && down.has(c) && !ignored.has(c));
  const hit = (id) => bindings[id].some((c) => c && pressed.has(c));

  return {
    // One snapshot per simulation step; clears the "just pressed" state.
    poll() {
      const snap = {
        left: held('left'),
        right: held('right'),
        jump: held('jump'),
        shoot: held('shoot'),
        jumpPressed: hit('jump'),
        fartPressed: hit('fart'),
        pausePressed: hit('pause') || pressed.has('Escape'),
        mutePressed: hit('mute'),
        anyPressed: any,
        captured, // code picked while capture() was armed, else null
        ui: { // fixed menu controls
          up: pressed.has('ArrowUp'),
          down: pressed.has('ArrowDown'),
          left: pressed.has('ArrowLeft'),
          right: pressed.has('ArrowRight'),
          confirm: pressed.has('Enter') || pressed.has('NumpadEnter'),
          back: pressed.has('Escape'),
          clear: pressed.has('Backspace') || pressed.has('Delete'),
          click: pressed.has('Mouse0'),
          rightClick: pressed.has('Mouse2'),
          mouseX: mouse.x,
          mouseY: mouse.y,
          mouseMoved: mouse.moved,
        },
      };
      pressed.clear();
      any = false;
      captured = null;
      mouse.moved = false;
      return snap;
    },
    getBindings: () => bindings,
    bind(action, slot, code) {
      const ok = rebind(bindings, action, slot, code);
      if (ok) save();
      return ok;
    },
    clear(action, slot) {
      if (!bindings[action]) return;
      bindings[action][slot] = null;
      save();
    },
    reset() {
      bindings = cloneDefaults();
      save();
    },
    // The next key or mouse button pressed is reported as snapshot.captured
    // instead of acting. Esc is reported too, so the caller can cancel.
    capture() { capturing = true; captured = null; },
    cancelCapture() { capturing = false; captured = null; },
    // Anything held right now is ignored until released (so the click or key
    // that chose a menu item doesn't also fire in the game).
    releaseAll() { for (const c of down) ignored.add(c); },
  };
}
