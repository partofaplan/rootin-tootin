// Chiptune-style sound: everything is synthesised with WebAudio, no files.

let ac = null;
let master = null;
let musicBus = null;
let noiseBuffer = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;
let musicNext = 0;

// Browsers only allow audio after a user gesture, so this is called on key press.
export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.5;
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

function noiseAt(t, dur, vol, freq, dest = master) {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuffer;
  s.loop = true;
  f.type = 'lowpass';
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
  start() { arp([392, 523, 659, 784], 0.06, 0.1, 0.15); },
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

// ---- music: a four-bar galloping loop in A minor ---------------------------------
const STEP = 60 / 138 / 4; // one sixteenth note
const BASS = [45, 45, 43, 40]; // root per bar (MIDI)
const LEAD = [
  69, 0, 0, 0, 72, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0,
  67, 0, 69, 0, 0, 0, 0, 0, 64, 0, 67, 0, 69, 0, 0, 0,
  67, 0, 0, 0, 71, 0, 74, 0, 72, 0, 71, 0, 67, 0, 0, 0,
  64, 0, 68, 0, 71, 0, 68, 0, 64, 0, 0, 0, 0, 0, 0, 0,
];
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function scheduleMusic() {
  while (musicNext < ac.currentTime + 0.25) {
    const s = musicStep, t = musicNext, beat = s % 4;
    if (beat !== 1) { // gallop: da-(rest)-da-da
      const f = hz(BASS[s >> 4] + (beat === 3 ? 7 : 0));
      toneAt(t, 'triangle', f, f, STEP * 0.9, 0.5, musicBus);
    }
    if (LEAD[s]) toneAt(t, 'square', hz(LEAD[s]), hz(LEAD[s]), STEP * 1.9, 0.09, musicBus);
    if (beat === 2) noiseAt(t, 0.03, 0.12, 6000, musicBus);
    musicNext += STEP;
    musicStep = (s + 1) % LEAD.length;
  }
}

export function startMusic(restart = true) {
  if (!ac || musicTimer) return;
  if (restart) musicStep = 0;
  musicNext = ac.currentTime + 0.05;
  musicTimer = setInterval(scheduleMusic, 50);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
