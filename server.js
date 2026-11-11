// Game server: serves the static game files and keeps the shared hi-score
// table, so every player who connects sees the same board.
//
//   npm start                      -> http://localhost:8000
//   PORT=9000 HOST=127.0.0.1 npm start
//
// Scores are stored in data/scores.json (override with SCORES_FILE).
// No dependencies; needs Node 18+.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScores, addScore, cleanName, cleanScore, MAX_SCORES } from './src/hiscores.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '0.0.0.0';
const SCORES_FILE = process.env.SCORES_FILE || path.join(ROOT, 'data', 'scores.json');
const MAX_BODY = 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---- hi scores -----------------------------------------------------------------
let scores = [];
let queue = Promise.resolve(); // serialises writes so two posts can't interleave

async function loadScores() {
  try {
    scores = normalizeScores(JSON.parse(await fs.readFile(SCORES_FILE, 'utf8')));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Could not read ${SCORES_FILE} (${err.message}); starting with an empty board.`);
    scores = [];
  }
}

async function saveScores() {
  await fs.mkdir(path.dirname(SCORES_FILE), { recursive: true });
  const tmp = `${SCORES_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(scores, null, 2)}\n`);
  await fs.rename(tmp, SCORES_FILE); // atomic: readers never see a half-written file
}

function submitScore(name, score) {
  const job = queue.then(async () => {
    const result = addScore(scores, name, score);
    if (result.rank >= 0) {
      scores = result.list;
      await saveScores();
    }
    return result.rank;
  });
  queue = job.catch(() => {});
  return job;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) { chunks.push(chunk); return; }
      // Too big: stop keeping it (the rest is drained and dropped) and say so.
      chunks.length = 0;
      reject(Object.assign(new Error('body too large'), { status: 413 }));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleScores(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, { scores, max: MAX_SCORES });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.status ? err.message : 'invalid JSON' });
  }
  const name = cleanName(data && data.name), score = cleanScore(data && data.score);
  if (!name || score === null) return sendJson(res, 400, { error: 'need name (1-3 letters or digits) and an integer score' });
  try {
    const rank = await submitScore(name, score);
    return sendJson(res, 200, { scores, rank });
  } catch (err) {
    console.error('Could not save scores:', err.message);
    return sendJson(res, 500, { error: 'could not save score' });
  }
}

// ---- static files: only the game itself (index.html and src/) --------------------
async function handleStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  const allowed = file === path.join(ROOT, 'index.html') || file.startsWith(path.join(ROOT, 'src') + path.sep);
  if (!allowed || !TYPES[path.extname(file)]) return sendJson(res, 404, { error: 'not found' });
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-cache', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendJson(res, 400, { error: 'bad request' });
  }
  const handler = pathname === '/api/scores' ? handleScores(req, res) : handleStatic(req, res, pathname);
  handler.catch((err) => {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'server error' });
  });
});

await loadScores();
server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Rootin' Tootin' is running at http://${shown}:${PORT}  (hi scores: ${SCORES_FILE})`);
});
