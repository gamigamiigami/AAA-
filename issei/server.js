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
 * 検証:  node issei/test-latency.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');
const G = require('./games.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');

/* サーバーの単調時計。全端末はこの時計にオフセットを合わせる。 */
const now = () => performance.now();

const REVEAL_MS = 6500;

const SHAPES = ['circle', 'triangle', 'square', 'star', 'heart',
                'diamond', 'pentagon', 'hexagon', 'crown', 'moon'];
// 暗い背景に置くので、そのままの原色ではなく少し明るく振る
const COLORS = ['#FF3B4E', '#2E8BFF', '#FFD400', '#35D06A'];

/* 乱数は必ずシード付きを通す。同じ種なら同じ試合を再現できる（mulberry32）。 */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const room = {
  code: makeCode(),
  players: new Map(),
  phase: 'lobby',         // lobby | play | reveal
  round: 0,
  def: null,              // 進行中のミニゲーム定義
  g: null,                // その回の状態
  last: null,
  timer: null,
  seed: (Math.random() * 1e9) | 0,
  order: []               // 出題順。ランダムに並べる
};

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

/* 形が主・色が従。ただし形を一巡してから色を変えると最初の10人が全員同色になり、
 * 少人数のとき色が識別の役に立たない。隣り合う人が形も色も変わるように配る。 */
function assignLook(index) {
  return {
    shape: SHAPES[index % SHAPES.length],
    color: COLORS[(index + Math.floor(index / SHAPES.length)) % COLORS.length]
  };
}

// ---------------------------------------------------------------- SSE 配信

const clients = new Set();

function send(client, event) {
  const body = `data: ${JSON.stringify(event)}\n\n`;
  const write = () => { try { client.res.write(body); } catch (_) {} };
  if (client.lag > 0) setTimeout(write, client.lag); else write();   // lag は検証用
}

function broadcast(event) { for (const c of clients) send(c, event); }

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
    beat: G.BEAT,
    game: room.def && {
      id: room.def.id, verb: room.def.verb, hint: room.def.hint,
      control: room.def.control, countIn: room.def.countIn || 0
    },
    g: room.g,
    players: roster(),
    last: room.last
  };
}

// ---------------------------------------------------------------- 進行

function nextDef() {
  // 並び順はランダム。同系統が続く回も出るが、まずはそのまま回して様子を見る。
  if (!room.order.length) {
    room.order = G.ALL.slice();
    for (let i = room.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [room.order[i], room.order[j]] = [room.order[j], room.order[i]];
    }
  }
  return room.order.shift();
}

function startRound(forceId) {
  if (room.players.size === 0) return;
  room.round++;
  // forceId は検証用。本番は必ずランダム順。
  room.def = forceId ? G.ALL.find(d => d.id === forceId) || nextDef() : nextDef();
  room.phase = 'play';
  room.last = null;

  const rng = makeRng(room.seed + room.round * 7919);
  room.g = Object.assign({ presses: {}, events: {} }, room.def.setup(now(), rng));

  broadcast(stateEvent());
  clearTimeout(room.timer);
  room.timer = setTimeout(finishRound, room.g.endsAt - now());
}

function finishRound() {
  const players = [...room.players.values()];
  const result = room.def.judge(room.g, players);

  for (const id of result.winners) {
    const p = room.players.get(id);
    if (p) p.score++;
  }

  room.last = Object.assign({ round: room.round, game: room.def.id, verb: room.def.verb }, result);
  room.phase = 'reveal';
  broadcast(stateEvent());

  clearTimeout(room.timer);
  room.timer = setTimeout(startRound, REVEAL_MS);
}

function stopGame() {
  clearTimeout(room.timer);
  room.phase = 'lobby';
  room.last = null;
  room.def = null;
  room.g = null;
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

  // 時計合わせ。往復のうち最速のものだけが使われるので何度も叩かれる。
  if (p === '/api/time') return json(res, 200, { t1: now() });

  if (p === '/api/join' && req.method === 'POST') {
    const body = await readBody(req);
    const id = 'p' + Math.random().toString(36).slice(2, 9);
    const look = assignLook(room.players.size);
    const name = String(body.name || '').trim().slice(0, 12) || 'ゲスト';
    room.players.set(id, { id, name, ...look, score: 0 });
    broadcast(stateEvent());
    return json(res, 200, { id, name, ...look, code: room.code });
  }

  /* 入力。中身のタイムスタンプだけを見る。
   * このリクエストが何ms遅れて届いたかは一切参照しない。 */
  if (p === '/api/input' && req.method === 'POST') {
    const body = await readBody(req);
    const pl = room.players.get(body.id);
    if (!pl || room.phase !== 'play') return json(res, 200, { ok: false });
    if (room.def.accept(room.g, pl.id, body)) {
      /* せーのは人数だけを配る。誰が・何ms速かったかを途中で出すと、
       * その場で回線の差が見えてしまう。開示は全員同時。
       * だるまは逆に位置を配る。走者の見えないレースは競技として成立しない。
       * どちらも判定は最後に時刻から作り直すので、この配信は結果に影響しない。 */
      if (room.def.id === 'seino') {
        broadcast({ type: 'state', partial: true,
                    pressed: Object.keys(room.g.presses).length });
      } else {
        broadcast({ type: 'state', partial: true,
                    pressed: Object.keys(room.g.events).length,
                    live: room.def.live(room.g, [...room.players.values()], now()) });
      }
    }
    return json(res, 200, { ok: true });
  }

  if (p === '/api/state') return json(res, 200, stateEvent());
  if (p === '/api/start' && req.method === 'POST') {
    startRound(url.searchParams.get('game'));
    return json(res, 200, { ok: true });
  }
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

  const file = p === '/' ? '/screen.html' : p;
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) return n.address;
  }
  return 'localhost';
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    const ip = lanAddress();
    console.log('\n  一斉 — プロトタイプ');
    console.log('  ルームコード: ' + room.code + '\n');
    console.log('  メイン画面 (プロジェクター):  http://localhost:' + PORT + '/screen.html');
    console.log('  スマホ (同じWi-Fiから):        http://' + ip + ':' + PORT + '/phone.html\n');
  });
}

module.exports = { server, room };
