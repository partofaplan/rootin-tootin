// Sound: everything is synthesised with WebAudio, no audio files.

let ac = null;
let master = null;
let musicBus = null;
let noiseBuffer = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;
let musicNext = 0;
let tempo = 1; // music speed multiplier (raised during the turbo easter egg)

// Browsers only allow audio after a user gesture, so this is called on key press.
export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    const limiter = ac.createDynamicsCompressor(); // keeps loud moments from clipping
    master.connect(limiter).connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.6;
    musicBus.connect(master);
  }
  if (ac.state === 'suspended') ac.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export const isMuted = () => muted;

function toneAt(t, type, f0, f1, dur, vol, dest = master) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const tone = (type, f0, f1, dur, vol, delay = 0) => toneAt(ac.currentTime + delay, type, f0, f1, dur, vol);

function noiseAt(t, dur, vol, freq, dest = master, filter = 'lowpass') {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuffer;
  s.loop = true;
  f.type = filter;
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}
const noise = (dur, vol, freq, delay = 0) => noiseAt(ac.currentTime + delay, dur, vol, freq);

const arp = (notes, step, dur, vol, type = 'square') =>
  notes.forEach((f, i) => tone(type, f, f, dur, vol, i * step));

const SFX = {
  shoot() { noise(0.09, 0.5, 3000); tone('square', 880, 110, 0.1, 0.2); },
  reload() { tone('square', 320, 320, 0.03, 0.12); tone('square', 480, 480, 0.04, 0.12, 0.07); },
  jump() { tone('square', 240, 520, 0.13, 0.12); },
  hit() { tone('square', 220, 90, 0.08, 0.2); noise(0.05, 0.2, 1500); },
  kill() { tone('square', 520, 60, 0.24, 0.2); noise(0.18, 0.3, 900); },
  eshoot() { tone('square', 520, 180, 0.12, 0.12); },
  pounce() { tone('sawtooth', 180, 520, 0.16, 0.12); },
  pickup() { arp([660, 880, 1320], 0.06, 0.09, 0.15); },
  checkpoint() { arp([523, 659, 784], 0.08, 0.12, 0.15); },
  hurt() { tone('sawtooth', 320, 70, 0.3, 0.25); },
  die() { stopMusic(); arp([523, 494, 466, 440, 349, 262, 196], 0.11, 0.16, 0.2); },
  win() { stopMusic(); arp([523, 659, 784, 1047, 784, 1047], 0.12, 0.2, 0.2); tone('triangle', 131, 131, 0.9, 0.3); },
  start() { tempo = 1; arp([392, 523, 659, 784], 0.06, 0.1, 0.15); },
  stomp() { tone('square', 180, 620, 0.1, 0.2); noise(0.06, 0.25, 1200); },
  throw() { tone('triangle', 500, 900, 0.12, 0.1); },
  smash() { noise(0.16, 0.3, 7000); tone('square', 2400, 900, 0.06, 0.08); tone('square', 1800, 3000, 0.05, 0.06, 0.03); },
  slam() { tone('sine', 110, 30, 0.35, 0.6); noise(0.25, 0.4, 300); },
  bossIntro() { stopMusic(); arp([196, 185, 175, 165, 147], 0.16, 0.3, 0.2, 'sawtooth'); },
  boss() { startMusic(); tempo = 1.2; }, // the fight: same tune, faster
  bossRoar() { tone('sawtooth', 90, 140, 0.3, 0.3); noise(0.25, 0.2, 500); },
  bossDown() { stopMusic(); arp([330, 294, 262, 220, 196, 147, 110], 0.12, 0.2, 0.22, 'sawtooth'); noise(0.5, 0.3, 400); },
  secret() { arp([659, 622, 587, 494, 523, 659, 784, 1047], 0.07, 0.1, 0.16, 'triangle'); },
  toot() { const f = 110 + Math.random() * 70; tone('sawtooth', f, f * 0.55, 0.11, 0.22); noise(0.07, 0.18, 400); },
  turbo() { tempo = 1.4; arp([392, 494, 587, 784, 988, 1175], 0.05, 0.12, 0.18); }, // the music speeds up too
  turboEnd() { tempo = 1; arp([784, 587, 392], 0.08, 0.12, 0.14); },
  fart() {
    const t = ac.currentTime, dur = 0.7;
    const o = ac.createOscillator(), g = ac.createGain();
    const lfo = ac.createOscillator(), lfoGain = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + dur);
    lfo.type = 'square'; // the flutter
    lfo.frequency.setValueAtTime(36, t);
    lfo.frequency.linearRampToValueAtTime(13, t + dur);
    lfoGain.gain.value = 24;
    lfo.connect(lfoGain).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    noiseAt(t, 0.5, 0.5, 280);
    toneAt(t, 'square', 70, 30, 0.35, 0.3);
  },
};

export function play(name) {
  if (!ac || !SFX[name]) return;
  SFX[name]();
}

// ---- music: a country-western two-step in G ------------------------------------
// Boom-chick rhythm (bass on 1 and 3, muted guitar strum on 2 and 4), a
// train-beat shuffle, a picked banjo lead for eight bars, then a fiddle tune
// over banjo rolls for eight more. Strings are Karplus-Strong plucks.
const STEP = 60 / 124 / 2; // one eighth note
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

const CHORDS = {
  G: { bass: [43, 38], strum: [59, 62, 67], roll: [55, 59, 62, 67] },
  C: { bass: [48, 43], strum: [60, 64, 67], roll: [60, 64, 67, 72] },
  D: { bass: [50, 45], strum: [57, 62, 66], roll: [57, 62, 66, 69] },
};
const PROGRESSION = ['G', 'G', 'C', 'G', 'D', 'D', 'G', 'G', 'C', 'C', 'G', 'G', 'D', 'D', 'G', 'G'];
const WALK = { 'G>C': [45, 47], 'C>G': [47, 45], 'G>D': [47, 49], 'D>G': [38, 42] }; // bass walk-ups into a chord change
const ROLL = [0, 1, 2, 3, 1, 2, 3, 2];

// Banjo lead, bars 1-8 (MIDI notes per eighth; 0 = rest).
const BANJO = [
  [67, 71, 74, 71, 76, 74, 71, 74],
  [79, 0, 76, 74, 71, 74, 67, 0],
  [72, 76, 79, 76, 81, 79, 76, 79],
  [74, 71, 67, 71, 74, 0, 71, 69],
  [66, 69, 74, 69, 78, 74, 69, 74],
  [76, 74, 72, 69, 66, 69, 62, 0],
  [67, 71, 74, 79, 76, 74, 71, 67],
  [69, 71, 67, 0, 62, 64, 66, 0],
];
// Fiddle tune, bars 9-16 (-1 = hold the previous note).
const FIDDLE = [
  [76, -1, -1, 79, 76, -1, 72, -1],
  [76, -1, 79, -1, 84, -1, -1, -1],
  [83, -1, -1, 79, 74, -1, 71, -1],
  [74, -1, -1, -1, 0, -1, 71, 74],
  [78, -1, -1, 74, 69, -1, 74, -1],
  [76, -1, 74, -1, 72, -1, 69, -1],
  [71, -1, 74, -1, 79, -1, -1, -1],
  [74, -1, 71, -1, 67, -1, -1, -1],
];
const MUSIC_STEPS = PROGRESSION.length * 8;

// Karplus-Strong plucked string, rendered once per note and cached.
const PLUCK = {
  banjo: { dur: 0.7, damp: 0.992, bright: 0.95 },
  guitar: { dur: 0.45, damp: 0.99, bright: 0.5 },
  bass: { dur: 0.6, damp: 0.997, bright: 0.22 },
};
const pluckCache = new Map();
function pluckBuffer(midi, kind) {
  const key = kind + midi;
  let buf = pluckCache.get(key);
  if (buf) return buf;
  const { dur, damp, bright } = PLUCK[kind];
  const sr = ac.sampleRate, n = Math.max(2, Math.round(sr / hz(midi))), len = Math.floor(sr * dur);
  buf = ac.createBuffer(1, len, sr);
  const out = buf.getChannelData(0), ring = new Float32Array(n);
  let prev = 0, peak = 0;
  for (let i = 0; i < n; i++) { // the "pluck": a burst of (softened) noise
    prev += bright * (Math.random() * 2 - 1 - prev);
    ring[i] = prev;
    peak = Math.max(peak, Math.abs(prev));
  }
  for (let i = 0; i < n; i++) ring[i] /= peak || 1;
  for (let i = 0, j = 0; i < len; i++) { // the string: a delay line that averages itself
    const k = j + 1 === n ? 0 : j + 1;
    const fade = Math.min(1, (len - i) / 400);
    out[i] = ring[j] * fade;
    ring[j] = (ring[j] + ring[k]) * 0.5 * damp;
    j = k;
  }
  pluckCache.set(key, buf);
  return buf;
}

function pluckAt(t, midi, kind, vol, muteAfter = 0) {
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = pluckBuffer(midi, kind);
  g.gain.setValueAtTime(vol, t);
  if (muteAfter) { // palm-muted: choke the string
    g.gain.setValueAtTime(vol, t + muteAfter * 0.4);
    g.gain.linearRampToValueAtTime(0, t + muteAfter);
  }
  src.connect(g).connect(musicBus);
  src.start(t);
  if (muteAfter) src.stop(t + muteAfter + 0.02);
}

// Bowed fiddle: two slightly detuned saws, scooped up into the note, with vibrato.
function fiddleAt(t, midi, dur) {
  const f = hz(midi);
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  const lfo = ac.createOscillator(), lfoGain = ac.createGain();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  lfo.frequency.value = 5.6;
  lfoGain.gain.setValueAtTime(0, t);
  lfoGain.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(dur, 0.25));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.085, t + 0.04);
  g.gain.setValueAtTime(0.085, t + Math.max(0.05, dur - 0.05));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  lfo.connect(lfoGain);
  for (const detune of [0, 8]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = detune;
    o.frequency.setValueAtTime(f * 0.945, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    lfoGain.connect(o.frequency);
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  lp.connect(g).connect(musicBus);
  lfo.start(t);
  lfo.stop(t + dur + 0.02);
}

function drumsAt(t, st) {
  if (st % 4 === 0) toneAt(t, 'sine', 130, 46, 0.13, 0.55, musicBus); // kick on 1 and 3
  if (st % 4 === 2) noiseAt(t, 0.1, 0.2, 2200, musicBus, 'bandpass'); // brushed backbeat
  noiseAt(t, 0.025, 0.05, 7000, musicBus, 'highpass'); // train-beat shuffle
  noiseAt(t + STEP / 2 / tempo, 0.02, 0.028, 7000, musicBus, 'highpass');
}

// Everything that sounds on one eighth-note step of the 16-bar loop.
function playStep(step, t) {
  const bar = step >> 3, st = step & 7;
  const name = PROGRESSION[bar], chord = CHORDS[name];
  const walk = WALK[`${name}>${PROGRESSION[(bar + 1) % PROGRESSION.length]}`];

  // bass: root, fifth, and a two-note walk into the next chord
  let bass = st === 0 ? chord.bass[0] : st === 4 ? chord.bass[1] : 0;
  if (walk && st >= 6) bass = walk[st - 6];
  if (bass) {
    pluckAt(t, bass, 'bass', 0.55);
    toneAt(t, 'triangle', hz(bass), hz(bass), 0.22, 0.3, musicBus);
  }
  if (st === 2 || st === 6) chord.strum.forEach((m, i) => pluckAt(t + i * 0.012, m, 'guitar', 0.15, 0.16)); // "chick"
  drumsAt(t, st);

  if (bar < 8) {
    const note = BANJO[bar][st];
    if (note) pluckAt(t, note, 'banjo', 0.3);
  } else {
    pluckAt(t, chord.roll[ROLL[st]], 'banjo', 0.13);
    const line = FIDDLE[bar - 8], note = line[st];
    if (note > 0) {
      let held = 1;
      while (st + held < 8 && line[st + held] === -1) held++;
      fiddleAt(t, note, (held * STEP * 0.96) / tempo);
    }
  }
}

function scheduleMusic() {
  while (musicNext < ac.currentTime + 0.25) {
    playStep(musicStep, musicNext);
    musicNext += STEP / tempo;
    musicStep = (musicStep + 1) % MUSIC_STEPS;
  }
}

// Tune data, exported so tests can check it.
export const TUNE = { STEP, PROGRESSION, CHORDS, WALK, ROLL, BANJO, FIDDLE, MUSIC_STEPS };

// Debug: builds every sound effect and every step of the song once and
// reports the first error, without needing to hear it.
export function selfTest() {
  try {
    unlock();
    if (!ac) return 'no AudioContext';
    for (const name of Object.keys(SFX)) SFX[name]();
    for (let s = 0; s < MUSIC_STEPS; s++) playStep(s, ac.currentTime + 0.1 + s * 0.01);
    return `ok: ${Object.keys(SFX).length} sfx, ${MUSIC_STEPS} steps, ${pluckCache.size} plucked notes`;
  } catch (err) {
    return `error: ${err.message}`;
  }
}

export function startMusic(restart = true) {
  if (!ac || musicTimer) return;
  if (restart) { musicStep = 0; tempo = 1; }
  musicNext = ac.currentTime + 0.05;
  musicTimer = setInterval(scheduleMusic, 50);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
