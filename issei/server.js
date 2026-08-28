/* 一斉 — プロトタイプ サーバー
 *
 * 依存ゼロ。SSE（サーバー→全員）+ POST（各自→サーバー）だけで動く。
 *
 * WebSocket を使わない理由は性能を諦めたからではない。この設計では
 * 判定が「パケットが届いた時刻」ではなく「端末が押した時刻」なので、
 * 伝送が 50ms でも 500ms でも結果が 1ms も変わらない。
 * つまり低遅延の伝送路そのものが不要になる。
 *
 * 起動:  node issei/server.js
 * 検証:  node issei/test-latency.js   （遅延を注入しても順位が変わらないことを確認）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');

/* サーバーの単調時計。全端末はこの時計にオフセットを合わせる。 */
const now = () => performance.now();

// ---------------------------------------------------------------- 部屋の状態

const BPM = 120;
const BEAT = 60000 / BPM;          // 1拍 = 500ms
const COUNT_IN_BEATS = 4;          // 予告の拍数
const COLLECT_MS = 1500;           // 目標時刻を過ぎてから集計までの猶予
const REVEAL_MS = 6000;            // 結果を見せている時間
const SPREAD_OK_MS = 80;           // ばらつきがこの範囲なら全員成功

const SHAPES = ['circle', 'triangle', 'square', 'star', 'heart',
                'diamond', 'pentagon', 'hexagon', 'crown', 'moon'];
// 暗い背景に置くので、そのままの原色ではなく少し明るく振る
const COLORS = ['#FF3B4E', '#2E8BFF', '#FFD400', '#35D06A'];

const room = {
  code: makeCode(),
  players: new Map(),     // id -> {id, name, shape, color, score, streak}
  phase: 'lobby',         // lobby | countin | reveal
  round: 0,
  target: 0,              // 押すべき瞬間（サーバー時刻）
  presses: new Map(),     // id -> サーバー時刻に変換済みの押下時刻
  last: null,             // 直近の結果
  timer: null
};

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

/* 形が主・色が従。ただし形を一巡してから色を変えると最初の10人が全員同色になり、
 * 少人数のときに色が識別の役に立たない。隣り合う人が形も色も変わるように配る。
 * 10形 × 4色 = 40通りが重複なく出る（gcd の関係で s ごとに4色が全て現れる）。 */
function assignLook(index) {
  return {
    shape: SHAPES[index % SHAPES.length],
    color: COLORS[(index + Math.floor(index / SHAPES.length)) % COLORS.length]
  };
}

// ---------------------------------------------------------------- SSE 配信

const clients = new Set();   // {res, id, lag}

function send(client, event) {
  const body = `data: ${JSON.stringify(event)}\n\n`;
  const write = () => { try { client.res.write(body); } catch (_) {} };
  // lag は検証用の人工遅延。本番では常に 0。
  if (client.lag > 0) setTimeout(write, client.lag); else write();
}

function broadcast(event) {
  for (const c of clients) send(c, event);
}

function roster() {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, shape: p.shape, color: p.color, score: p.score
  }));
}

function stateEvent() {
  return {
    type: 'state',
    phase: room.phase,
    code: room.code,
    round: room.round,
    target: room.target,
    beat: BEAT,
    countIn: COUNT_IN_BEATS,
    players: roster(),
    last: room.last
  };
}

// ---------------------------------------------------------------- ゲーム進行

function startRound() {
  if (room.players.size === 0) return;
  room.round++;
  room.phase = 'countin';
  room.presses.clear();
  room.last = null;
  // 予告の拍数ぶん先に目標を置く。全端末はこの時刻を自分の時計に変換して描く。
  room.target = now() + COUNT_IN_BEATS * BEAT;
  broadcast(stateEvent());

  clearTimeout(room.timer);
  room.timer = setTimeout(finishRound, COUNT_IN_BEATS * BEAT + COLLECT_MS);
}

function finishRound() {
  const entries = [];
  for (const p of room.players.values()) {
    const at = room.presses.get(p.id);
    entries.push({
      id: p.id, name: p.name, shape: p.shape, color: p.color,
      error: at === undefined ? null : Math.round(at - room.target)
    });
  }

  const hits = entries.filter(e => e.error !== null).map(e => e.error);
  let spread = null, success = false;
  if (hits.length >= 2) {
    const mean = hits.reduce((a, b) => a + b, 0) / hits.length;
    const variance = hits.reduce((a, b) => a + (b - mean) ** 2, 0) / hits.length;
    spread = Math.round(Math.sqrt(variance));
    success = spread <= SPREAD_OK_MS && hits.length === entries.length;
  } else if (hits.length === 1 && entries.length === 1) {
    spread = 0;
    success = Math.abs(hits[0]) <= SPREAD_OK_MS;
  }

  // 協力ゲームなので、成功なら全員に加点する。
  if (success) for (const p of room.players.values()) p.score++;

  entries.sort((a, b) => {
    if (a.error === null) return 1;
    if (b.error === null) return -1;
    return Math.abs(a.error) - Math.abs(b.error);
  });

  room.last = { round: room.round, entries, spread, success, threshold: SPREAD_OK_MS };
  room.phase = 'reveal';
  broadcast(stateEvent());

  clearTimeout(room.timer);
  room.timer = setTimeout(startRound, REVEAL_MS);
}

function stopGame() {
  clearTimeout(room.timer);
  room.phase = 'lobby';
  room.last = null;
  broadcast(stateEvent());
}

// ---------------------------------------------------------------- HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (_) { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // --- 時計合わせ。往復のうち最速のものだけを採用するので何度も叩かれる。
  if (p === '/api/time') {
    return json(res, 200, { t1: now() });
  }

  if (p === '/api/join' && req.method === 'POST') {
    const body = await readBody(req);
    const id = 'p' + Math.random().toString(36).slice(2, 9);
    const look = assignLook(room.players.size);
    const name = String(body.name || '').trim().slice(0, 12) || 'ゲスト';
    room.players.set(id, { id, name, ...look, score: 0 });
    broadcast(stateEvent());
    return json(res, 200, { id, name, ...look, code: room.code });
  }

  // --- 押下。中身の at（端末が測った押下時刻をサーバー時計に変換した値）だけを見る。
  //     このリクエストが何ms遅れて届いたかは一切参照しない。
  if (p === '/api/press' && req.method === 'POST') {
    const body = await readBody(req);
    const pl = room.players.get(body.id);
    if (!pl) return json(res, 404, { ok: false });
    if (room.phase === 'countin' && typeof body.at === 'number' && !room.presses.has(pl.id)) {
      room.presses.set(pl.id, body.at);
      // 人数だけを配る。誰が・何秒に押したかは開示まで一切出さない。
      // 出した瞬間に遅延が可視化されて不公平になる。
      broadcast({ type: 'state', partial: true, pressed: room.presses.size });
    }
    return json(res, 200, { ok: true });
  }

  if (p === '/api/state') return json(res, 200, stateEvent());

  if (p === '/api/start' && req.method === 'POST') { startRound(); return json(res, 200, { ok: true }); }
  if (p === '/api/stop' && req.method === 'POST') { stopGame(); return json(res, 200, { ok: true }); }

  if (p === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    const client = { res, id: url.searchParams.get('id'), lag: Number(url.searchParams.get('lag')) || 0 };
    clients.add(client);
    send(client, stateEvent());
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(client); });
    return;
  }

  // --- 静的ファイル
  let file = p === '/' ? '/screen.html' : p;
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return 'localhost';
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    const ip = lanAddress();
    console.log('');
    console.log('  一斉 — プロトタイプ');
    console.log('  ルームコード: ' + room.code);
    console.log('');
    console.log('  メイン画面 (プロジェクター):  http://localhost:' + PORT + '/screen.html');
    console.log('  スマホ (同じWi-Fiから):        http://' + ip + ':' + PORT + '/phone.html');
    console.log('');
  });
}

module.exports = { server, room, BEAT, COUNT_IN_BEATS, SPREAD_OK_MS };
