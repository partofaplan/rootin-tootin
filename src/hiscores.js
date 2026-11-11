// Hi-score table: validation and ordering (shared by the browser and
// server.js), plus the browser-side store that talks to the server.

export const MAX_SCORES = 10;
export const NAME_LEN = 3;
export const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const MAX_SCORE = 999999;
export const STORAGE_KEY = 'rootin-tootin.scores';
const PENDING_KEY = 'rootin-tootin.scores.pending';

// 1-3 characters, A-Z / 0-9. Returns null if nothing usable is left.
export function cleanName(raw) {
  const name = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NAME_LEN);
  return name || null;
}

export function cleanScore(raw) {
  return Number.isInteger(raw) && raw >= 0 && raw <= MAX_SCORE ? raw : null;
}

// Turns anything (a file, a server reply, stale saved data) into a valid,
// sorted, top-MAX_SCORES list.
export function normalizeScores(raw) {
  if (!Array.isArray(raw)) return [];
  const list = [];
  for (const e of raw) {
    const name = cleanName(e && e.name), score = cleanScore(e && e.score);
    if (name && score !== null) list.push({ name, score, at: Number(e.at) || 0 });
  }
  // Highest first; on a tie, whoever got there first stays ahead.
  list.sort((a, b) => b.score - a.score || a.at - b.at);
  return list.slice(0, MAX_SCORES);
}

export function qualifies(list, score) {
  return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
}

// Returns { list, rank }: a new list, and the new entry's index in it (-1 if
// it didn't make the board or was invalid).
export function addScore(list, rawName, rawScore, at = Date.now()) {
  const name = cleanName(rawName), score = cleanScore(rawScore);
  if (!name || score === null || !qualifies(list, score)) return { list, rank: -1 };
  const entry = { name, score, at };
  const next = normalizeScores([...list, entry]);
  return { list: next, rank: next.findIndex((e) => e.name === name && e.score === score && e.at === at) };
}

// Browser-side store. Scores live on the server (GET/POST api/scores) so
// every player sees the same board. If the server can't be reached (for
// example the game is hosted as plain static files) scores are kept in this
// browser instead, and sent to the server the next time it answers.
export function createScoreStore({ fetchFn, storage, url = 'api/scores', timeoutMs = 4000 }) {
  const read = (key) => {
    try { return JSON.parse(storage.getItem(key)); } catch { return null; }
  };
  const write = (key, value) => {
    try { storage.setItem(key, JSON.stringify(value)); } catch { /* memory only */ }
  };
  let list = normalizeScores(read(STORAGE_KEY));
  let pending = normalizeScores(read(PENDING_KEY));
  let shared = false;

  async function call(options) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { ...options, signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body || !Array.isArray(body.scores)) throw new Error('bad reply');
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
  const post = (entry) => call({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: entry.name, score: entry.score }),
  });
  function adopt(serverScores) {
    list = normalizeScores(serverScores);
    shared = true;
    write(STORAGE_KEY, list);
  }

  return {
    list: () => list,
    best: () => list[0] || null,
    isShared: () => shared,
    qualifies: (score) => qualifies(list, score),

    // Loads the board from the server, first sending any scores saved offline.
    async refresh() {
      try {
        while (pending.length) {
          adopt((await post(pending[0])).scores);
          pending = pending.slice(1);
          write(PENDING_KEY, pending);
        }
        adopt((await call({})).scores);
      } catch {
        shared = false;
      }
      return list;
    },

    // Adds a score. Resolves to { rank, shared }; never rejects.
    async submit(name, score) {
      const local = addScore(list, name, score);
      list = local.list;
      write(STORAGE_KEY, list);
      let rank = local.rank;
      if (rank < 0) return { rank, shared };
      const entry = list[rank];
      try {
        const body = await post(entry);
        adopt(body.scores);
        rank = Number.isInteger(body.rank) ? body.rank : list.findIndex((e) => e.name === entry.name && e.score === entry.score);
      } catch {
        shared = false;
        pending = normalizeScores([...pending, entry]);
        write(PENDING_KEY, pending);
      }
      return { rank, shared };
    },
  };
}
