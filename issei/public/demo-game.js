/* 一斉 — 体験デモの中身。
 * あなた1人 + コンピュータ5人。判定ロジックは本番の games.js と同じ形。 */
'use strict';
(function () {

const W = 1280, H = 720;
const cv = document.getElementById('big');
const c = cv.getContext('2d');
const PAL = Art.PAL, E = Art.ease;
const fx = new Art.FX();

const $ = (s) => document.querySelector(s);
const btn = $('#btn'), foot = $('#foot'), scEl = $('#sc');

// ---------------------------------------------------------------- 参加者
const SHAPES = ['circle','triangle','square','star','heart','diamond','pentagon','hexagon','crown','moon'];
const COLORS = [PAL.red, PAL.blue, PAL.yellow, PAL.green, PAL.purple];
const NAMES = ['あなた', 'たかし', 'ゆい', 'けん', 'まり', 'そう'];

const players = NAMES.map((name, i) => ({
  id: i, name, you: i === 0, score: 0,
  shape: SHAPES[i % SHAPES.length],
  color: COLORS[(i + Math.floor(i / SHAPES.length)) % COLORS.length],
  seed: i * 37 + 5,
  sigma: [0, 55, 38, 92, 46, 70][i],      // 腕前のばらつき（ms）
  bravery: [0, .82, .6, .95, .5, .72][i], // だるまさんで粘る度合い
  face: 'smile', bob: 0, squash: 1, blink: 0, nextBlink: 1 + i * .7
}));
const YOU = players[0];

{ const mc = $('#me').getContext('2d');
  mc.setTransform(2, 0, 0, 2, 0, 0);
  Art.tick(0);
  Art.chara(mc, { x: 22, y: 25, r: 15, color: YOU.color, shape: YOU.shape,
                  seed: YOU.seed, face: 'smile' }); }

// ---------------------------------------------------------------- 進行
const BEAT = 500, COUNT_IN = 4;
let phase = 'idle', game = null, g = null, last = null, sent = 0;
let shake = 0, flash = 0, wipe = 0, wipeDir = 0;
let t0 = performance.now(), tSec = 0, prev = t0;
const now = () => performance.now();
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function setBtn(label, disabled, hit) {
  btn.textContent = label; btn.disabled = !!disabled;
  btn.classList.toggle('hit', !!hit);
}

btn.addEventListener('pointerdown', onDown);
btn.addEventListener('pointerup', onUp);
btn.addEventListener('pointercancel', onUp);
btn.addEventListener('pointerleave', onUp);
addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); onDown(e); } });
addEventListener('keyup', e => { if (e.code === 'Space') onUp(e); });

function onDown(e) {
  Snd.init();
  if (phase === 'idle') { Snd.music(true, 120); return startRound(); }
  if (phase !== 'play') return;
  /* 押した瞬間を端末内で記録する。event.timeStamp はイベントが発生した時刻で、
   * JS が処理した時刻ではない。本番ではこの値だけをサーバーに送る。 */
  const t = (e && e.timeStamp > 0) ? e.timeStamp : now();
  if (game === 'seino') {
    if (g.press[0] !== undefined) return;
    g.press[0] = t; sent++;
    Snd.sfx('tap');
    YOU.squash = .72; YOU.face = 'joy';
    fx.burst(youScreenX(), youScreenY(), { n: 10, color: ['#fff', PAL.yellow],
      speed: 240, size: 8, kind: 'star', life: .5 });
    setBtn('おした！', false, true);
    if (navigator.vibrate) navigator.vibrate(18);
  } else {
    if (g.held[0]) return;
    g.held[0] = true;
    (g.spans[0] = g.spans[0] || []).push([t, null]);
    Snd.sfx('step');
    setBtn('すすめ！', false, true);
    if (navigator.vibrate) navigator.vibrate(14);
  }
}

function onUp(e) {
  if (phase !== 'play' || game !== 'daruma' || !g.held[0]) return;
  const t = (e && e.timeStamp > 0) ? e.timeStamp : now();
  g.held[0] = false;
  const s = g.spans[0]; s[s.length - 1][1] = t;
  setBtn('とまれ', false, false);
}

function startRound() {
  game = game === 'seino' ? 'daruma' : 'seino';
  phase = 'play'; last = null; sent = 0; wipe = 1; wipeDir = -1;
  for (const p of players) { p.face = 'smile'; p.squash = 1; }

  if (game === 'seino') {
    g = { target: now() + COUNT_IN * BEAT, endsAt: now() + COUNT_IN * BEAT + 1300,
          press: {}, fired: new Set() };
    for (const p of players) if (!p.you) {
      const at = g.target + gauss() * p.sigma;
      setTimeout(() => { if (phase === 'play' && game === 'seino') {
        g.press[p.id] = at; sent++; p.squash = .72; p.face = 'joy';
      } }, Math.max(0, at - now()));
    }
    setBtn('おす', false, false);
    foot.textContent = '輪が重なった瞬間に押す';
  } else {
    const chants = [];
    let t = now() + 1200, until = now() + 21000;
    while (t < until) {
      const ch = 900 + Math.random() * 2300, wt = 700 + Math.random() * 800;
      chants.push({ start: t, turnAt: t + ch, watchUntil: t + ch + wt });
      t += ch + wt + 250;
    }
    g = { chants, endsAt: until + 900, spans: {}, held: {}, fired: new Set(),
          goal: 240, speed: 30 };
    for (const p of players) if (!p.you) scheduleBot(p);
    setBtn('おしっぱなし', false, false);
    foot.textContent = '掛け声の間だけ進む。振り向く前に離す';
  }
  setTimeout(finish, g.endsAt - now());
}

/* コンピュータのだるまさん。bravery が高いほど振り向きギリギリまで粘る。 */
function scheduleBot(p) {
  for (const ch of g.chants) {
    const win = ch.turnAt - ch.start;
    const release = ch.turnAt - (1 - p.bravery) * win * .9 - 60 + gauss() * 90;
    setTimeout(() => { if (phase === 'play' && game === 'daruma')
      (g.spans[p.id] = g.spans[p.id] || []).push([ch.start, Math.max(ch.start + 30, release)]);
    }, Math.max(0, ch.start - now()));
  }
}

function finish() {
  if (phase !== 'play') return;
  phase = 'reveal'; wipe = 1; wipeDir = -1;
  last = game === 'seino' ? judgeSeino() : judgeDaruma();
  for (const id of last.winners) players[id].score++;
  scEl.textContent = YOU.score;

  const won = last.winners.indexOf(0) >= 0;
  Snd.duck(.6, .9);
  Snd.sfx(won || last.ok ? 'win' : 'lose');
  if (navigator.vibrate) navigator.vibrate(won ? [40, 60, 40] : 150);

  for (const p of players) {
    const w = last.winners.indexOf(p.id) >= 0;
    p.face = w ? 'joy' : (last.entries.find(e => e.id === p.id) || {}).bad ? 'sad' : 'flat';
  }
  if (won || last.ok) {
    for (let i = 0; i < 3; i++) setTimeout(() => fx.burst(W / 2, H * .3, {
      n: 30, color: [PAL.yellow, PAL.pink, PAL.blue, PAL.green, '#fff'],
      speed: 620, lift: 180, size: 15, life: 1.9, grav: 700 }), i * 130);
    flash = .5;
  } else { shake = 11; }

  setBtn(last.you, true, false);
  foot.textContent = 'つぎのゲームへ…';
  setTimeout(() => { phase = 'idle'; startRound(); }, 6200);
}

function judgeSeino() {
  const entries = players.map(p => ({
    id: p.id, name: p.name, shape: p.shape, color: p.color, seed: p.seed, you: p.you,
    error: g.press[p.id] === undefined ? null : Math.round(g.press[p.id] - g.target)
  }));
  const hits = entries.filter(e => e.error !== null).map(e => e.error);
  let spread = null, ok = false;
  if (hits.length >= 2) {
    const m = hits.reduce((a, b) => a + b, 0) / hits.length;
    spread = Math.round(Math.sqrt(hits.reduce((a, b) => a + (b - m) ** 2, 0) / hits.length));
    ok = spread <= 80 && hits.length === entries.length;
  }
  for (const e of entries) e.bad = e.error === null || Math.abs(e.error) > 120;
  entries.sort((a, b) => a.error === null ? 1 : b.error === null ? -1
    : Math.abs(a.error) - Math.abs(b.error));
  const mine = entries.find(e => e.you);
  return { entries, spread, ok, winners: ok ? players.map(p => p.id) : [],
    you: mine.error === null ? 'みおくり' : (mine.error > 0 ? '+' : '') + mine.error + 'ms' };
}

/* 押下の区間を組み直して、監視窓と重なったら脱落。
 * 本番ではこれをサーバーが時刻から作り直すので、通信の遅延に影響されない。 */
function judgeDaruma() {
  const need = g.goal / g.speed * 1000;
  const entries = players.map(p => {
    const spans = (g.spans[p.id] || []).map(([a, b]) => [a, b === null ? g.endsAt : b]);
    let caughtAt = null;
    for (const ch of g.chants)
      if (spans.some(([a, b]) => a < ch.watchUntil && b > ch.turnAt)) { caughtAt = ch.turnAt; break; }
    let held = 0, fin = null;
    for (const [a, b0] of spans) {
      const b = caughtAt === null ? b0 : Math.min(b0, caughtAt);
      if (b <= a) continue;
      if (fin === null && held + (b - a) >= need) fin = a + (need - held);
      held += b - a;
    }
    return { id: p.id, name: p.name, shape: p.shape, color: p.color, seed: p.seed, you: p.you,
      dist: Math.min(g.goal, Math.round(held / 1000 * g.speed)),
      caught: caughtAt !== null, bad: caughtAt !== null,
      fin: caughtAt !== null ? null : fin };
  });
  const done = entries.filter(e => e.fin !== null).sort((a, b) => a.fin - b.fin);
  const alive = entries.filter(e => !e.caught).sort((a, b) => b.dist - a.dist);
  const winners = done.length ? [done[0].id] : (alive.length && alive[0].dist > 0 ? [alive[0].id] : []);
  entries.sort((a, b) => {
    if ((a.fin === null) !== (b.fin === null)) return a.fin === null ? 1 : -1;
    if (a.fin !== null) return a.fin - b.fin;
    if (a.caught !== b.caught) return a.caught ? 1 : -1;
    return b.dist - a.dist;
  });
  const mine = entries.find(e => e.you);
  return { entries, winners, goal: g.goal,
    you: mine.caught ? 'つかまった' : mine.fin !== null ? 'ゴール！' : mine.dist + ' すすんだ' };
}

// ---------------------------------------------------------------- 配置
/* 舞台の上に横一列。中央がわずかに奥（＝上）になるよう弧を描かせると、
 * 平らに並べるより舞台に立っている感じが出る。 */
const ARC = players.map((p, i) => {
  const k = players.length === 1 ? .5 : i / (players.length - 1);
  return { x: 232 + k * 816, y: 606 + Math.sin(k * Math.PI) * -34 };
});
const youScreenX = () => ARC[0].x;
const youScreenY = () => ARC[0].y;

// ---------------------------------------------------------------- ループ
function loop(nowMs) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (nowMs - prev) / 1000); prev = nowMs;
  tSec += dt;
  Art.tick(tSec);
  fx.update(dt);

  // 生き物らしさ。拍で弾み、たまに瞬きする。
  const beatPhase = (tSec * 1000 / BEAT) % 1;
  for (const p of players) {
    p.squash += (1 - p.squash) * Math.min(1, dt * 9);
    p.bob = -Math.abs(Math.sin(tSec * Math.PI * 1000 / BEAT + p.seed)) * 7;
    p.nextBlink -= dt;
    if (p.nextBlink <= 0) { p.blink = .12; p.nextBlink = 2.2 + Math.random() * 3.4; }
    p.blink = Math.max(0, p.blink - dt);
  }
  shake = Math.max(0, shake - dt * 42);
  flash = Math.max(0, flash - dt * 2.2);
  if (wipeDir) { wipe -= dt * 3.4; if (wipe <= 0) { wipe = 0; wipeDir = 0; } }

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.save();
  if (shake > 0) c.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  Art.stage(c, W, H, tSec);
  Art.garland(c, W, tSec, -14);
  if (phase === 'play') (game === 'seino' ? viewSeino : viewDaruma)();
  else if (phase === 'reveal') (last.spread !== undefined ? revealSeino : revealDaruma)();
  else viewIdle();

  fx.draw(c);
  roster();
  c.restore();

  if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + (flash * .5) + ')'; c.fillRect(0, 0, W, H); }
  if (wipe > 0) {   // 場面転換。上下から閉じた幕が開く
    const k = E.outCubic(wipe);
    c.fillStyle = PAL.ink;
    c.fillRect(0, 0, W, H * .5 * k);
    c.fillRect(0, H - H * .5 * k, W, H * .5 * k);
  }
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- 待ち受け
function viewIdle() {
  Art.backdrop(c, W, H, 496, tSec);
  Art.floor(c, W, H, 496, PAL.purple);
  Art.title(c, '一斉', W / 2, 200, 128, { rot: -.03 });
  Art.label(c, 'ボタンを押すと はじまります', W / 2, 300, 26, PAL.cream, { ow: .22 });
  drawArc();
}

function drawArc(opt) {
  opt = opt || {};
  players.forEach((p, i) => {
    const a = ARC[i];
    const r = p.you ? 44 : 38;
    Art.chara(c, { x: a.x, y: a.y - r, r, color: p.color, shape: p.shape,
      seed: p.seed, face: p.face, squash: p.squash, bob: p.bob,
      blink: p.blink > 0, shadowY: a.y + 4, armT: tSec * 2,
      look: opt.look || [0, -.2] });
    if (p.you) {
      // 自分がどれか一目で分かるように、頭上に印を出す
      const yy = a.y + p.bob - r * 2 - 34 + Math.sin(tSec * 4) * 4;
      c.save(); c.fillStyle = PAL.yellow; c.strokeStyle = PAL.ink; c.lineWidth = 4;
      c.beginPath(); c.moveTo(a.x, yy + 16); c.lineTo(a.x - 13, yy - 6);
      c.lineTo(a.x + 13, yy - 6); c.closePath(); c.fill(); c.stroke();
      c.restore();
      Art.label(c, 'あなた', a.x, yy - 22, 17, PAL.yellow, { ow: .34 });
    }
  });
}

function sentPill() {
  const txt = sent + ' / ' + players.length;
  Art.slab(c, W / 2 - 92, 646, 184, 44, PAL.purple, { depth: 6, r: 22, seed: 71, gloss: false });
  Art.label(c, 'そうしん ' + txt, W / 2, 666, 20, PAL.cream, { ow: .26 });
}

// ---------------------------------------------------------------- せーの
function viewSeino() {
  const left = g.target - now();
  for (let i = 0; i <= COUNT_IN; i++) {
    const at = -(COUNT_IN - i) * BEAT;
    if (left <= at && !g.fired.has(i)) {
      g.fired.add(i);
      Snd.sfx(i === COUNT_IN ? 'beat' : 'tick');
      if (i === COUNT_IN) { fx.ring(W / 2, 330, { r1: 300, color: PAL.yellow, lw: 14, life: .5 }); shake = 6; }
    }
  }
  Art.backdrop(c, W, H, 496, tSec);
  Art.floor(c, W, H, 496, PAL.purple);
  Art.title(c, 'せーの！', W / 2, 92, 84, { rot: -.02 });
  Art.label(c, 'ぜんいんで おなじ しゅんかん に おす', W / 2, 158, 23, PAL.ink2 || '#E3CBF5', { ow: .24 });

  // 的と、縮む輪
  const cx = W / 2, cy = 330, R = 150;
  c.save();
  c.setLineDash([13, 11]); c.lineDashOffset = -tSec * 26;
  c.strokeStyle = 'rgba(255,255,255,.42)'; c.lineWidth = 4;
  c.beginPath(); c.arc(cx, cy, R, 0, Art.TAU); c.stroke();
  c.restore();

  const k = Math.max(0, Math.min(1.7, left / (COUNT_IN * BEAT)));
  const near = Math.abs(left) < 90;
  const rr = Math.max(8, R * k);
  c.save();
  c.shadowColor = near ? PAL.yellow : PAL.blue; c.shadowBlur = near ? 34 : 18;
  c.strokeStyle = near ? PAL.yellow : PAL.blue;
  c.lineWidth = near ? 16 : 9;
  c.beginPath(); c.arc(cx, cy, rr, 0, Art.TAU); c.stroke();
  c.restore();

  if (left > 0) {
    const n = Math.ceil(left / BEAT);
    const pop = 1 - ((left % BEAT) / BEAT);
    Art.title(c, String(n), cx, cy, 96 * (1 + E.outBack(Math.min(1, pop * 3)) * .12), { fill: PAL.cream });
  } else {
    Art.title(c, 'いま！', cx, cy, 76, { fill: PAL.yellow, rot: Math.sin(tSec * 26) * .05 });
  }

  drawArc({ look: [0, -.55] });
  sentPill();
}

function revealSeino() {
  const L = last;
  Art.floor(c, W, H, 470, PAL.purple);
  if (L.ok) {
    Art.title(c, 'そろった！', W / 2, 86, 78, { rot: -.025 });
    Art.label(c, 'ぜんいん +1てん', W / 2, 148, 25, PAL.green, { ow: .26 });
  } else {
    Art.title(c, 'ばらけた…', W / 2, 86, 74, { fill: '#E3CBF5', rot: .015 });
    Art.label(c, 'ばらつき ' + (L.spread === null ? '—' : L.spread + 'ms') + '　/　80ms いないで せいこう',
      W / 2, 148, 21, '#C6A9E0', { ow: .24 });
  }
  scatter(L.entries, 150, 300, W - 300, 300);
  podium(L.entries.filter(e => e.error !== null).slice(0, 3),
    e => (e.error > 0 ? '+' : '') + e.error + 'ms');
}

/* ズレを競う全ゲームで使い回す散布軸。近い点は縦に積んで潰れないようにする。 */
function scatter(entries, x, y, w, range) {
  const cx = x + w / 2;
  const px = ms => cx + Art.clamp(ms / range, -1, 1) * (w / 2 - 30);

  Art.slab(c, x - 26, y - 92, w + 52, 150, '#4A2270', { depth: 8, r: 20, seed: 33, gloss: false });

  c.save();
  c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke();
  for (const ms of [-range, -range / 2, 0, range / 2, range]) {
    const gx = px(ms), zero = ms === 0;
    c.strokeStyle = zero ? PAL.yellow : 'rgba(255,255,255,.25)';
    c.lineWidth = zero ? 5 : 2;
    c.beginPath(); c.moveTo(gx, y - (zero ? 20 : 9)); c.lineTo(gx, y + (zero ? 20 : 9)); c.stroke();
    Art.label(c, (ms > 0 ? '+' : '') + ms, gx, y + 34, 15, '#C6A9E0', { ow: .3, weight: 700 });
  }
  c.restore();
  Art.label(c, 'はやい', x + 6, y - 62, 15, '#8E6BB0', { align: 'left', ow: .3 });
  Art.label(c, 'おそい', x + w - 6, y - 62, 15, '#8E6BB0', { align: 'right', ow: .3 });

  const placed = [];
  for (const e of entries.filter(e => e.error !== null).sort((a, b) => a.error - b.error)) {
    const gx = px(e.error); let row = 0;
    while (placed.some(q => Math.abs(q.x - gx) < 40 && q.row === row)) row++;
    placed.push({ x: gx, row, e });
  }
  for (const q of placed) {
    const gy = y - 30 - q.row * 42;
    if (q.e.you) {
      c.save(); c.globalAlpha = .3 + Math.sin(tSec * 6) * .12;
      c.fillStyle = PAL.yellow;
      c.beginPath(); c.arc(q.x, gy, 30, 0, Art.TAU); c.fill(); c.restore();
    }
    Art.chara(c, { x: q.x, y: gy, r: 17, color: q.e.color, shape: q.e.shape,
      seed: q.e.seed, face: q.e.bad ? 'sad' : 'joy' });
  }

  const miss = entries.filter(e => e.error === null).length;
  if (miss) Art.label(c, 'みおくり ' + miss + '人', cx, y + 60, 16, '#8E6BB0', { ow: .3 });
}

function podium(top, label) {
  const hs = [104, 74, 58], order = [1, 0, 2];
  const bx = W / 2 - 190;
  order.forEach((rank, slot) => {
    const e = top[rank]; if (!e) return;
    const x = bx + slot * 190, hgt = hs[rank], baseY = 660;
    Art.slab(c, x - 74, baseY - hgt, 148, hgt, rank === 0 ? PAL.yellow : '#6A3A9C',
      { depth: 9, r: 12, seed: 40 + rank });
    Art.chara(c, { x, y: baseY - hgt - 40, r: 33, color: e.color, shape: e.shape,
      seed: e.seed, face: 'joy', bob: -Math.abs(Math.sin(tSec * 5 + rank)) * 5,
      shadowY: baseY - hgt - 4 });
    Art.label(c, e.name, x, baseY - hgt + 26, 19, rank === 0 ? '#3A2400' : PAL.cream, { ow: .26 });
    Art.label(c, label(e), x, baseY - hgt + 52, 17,
      rank === 0 ? '#5A3A00' : '#D9BCF0', { ow: .24 });
  });
}

// ---------------------------------------------------------------- だるまさん
function viewDaruma() {
  const t = now();
  let cur = null, watching = false;
  for (const ch of g.chants) {
    if (t >= ch.start && !g.fired.has('s' + ch.start)) { g.fired.add('s' + ch.start); Snd.sfx('chant'); }
    if (t >= ch.turnAt && !g.fired.has('t' + ch.turnAt)) {
      g.fired.add('t' + ch.turnAt); Snd.sfx('turn'); shake = 9;
    }
    if (t >= ch.start && t < ch.watchUntil) { cur = ch; watching = t >= ch.turnAt; break; }
  }

  Art.backdrop(c, W, H, 386, tSec);
  Art.floor(c, W, H, 386, watching ? '#7A2A45' : PAL.purple);
  if (watching) { c.fillStyle = 'rgba(255,71,87,.14)'; c.fillRect(0, 0, W, H); }

  Art.title(c, watching ? 'ふりむいた！' : 'だるまさんが……',
    W / 2, 78, watching ? 72 : 58,
    { fill: watching ? PAL.red : PAL.cream, rot: watching ? Math.sin(tSec * 30) * .04 : -.01 });

  const X0 = 190, X1 = W - 250, GY = 386;
  // ゴールの旗
  c.save();
  c.strokeStyle = PAL.ink; c.lineWidth = 7; c.lineCap = 'round';
  c.beginPath(); c.moveTo(X1, GY + 20); c.lineTo(X1, GY - 150); c.stroke();
  c.beginPath();
  c.moveTo(X1, GY - 150);
  c.quadraticCurveTo(X1 + 46, GY - 136 + Math.sin(tSec * 4) * 6, X1 + 86, GY - 150);
  c.lineTo(X1 + 86, GY - 96);
  c.quadraticCurveTo(X1 + 46, GY - 82 + Math.sin(tSec * 4) * 6, X1, GY - 96);
  c.closePath();
  Art.ink(c, PAL.yellow, 5);
  c.restore();
  Art.label(c, 'ゴール', X1 + 43, GY - 168, 18, PAL.yellow, { ow: .3 });

  // 鬼
  const ox = X1 + 150, oy = GY + 108;
  Art.chara(c, { x: ox, y: oy, r: 58, color: watching ? PAL.red : '#7A5A96',
    shape: 'crown', seed: 999, face: watching ? 'mad' : 'flat',
    look: watching ? [-1, 0] : [1, .3], shadowY: oy + 62,
    bob: watching ? Math.sin(tSec * 22) * 3 : -Math.abs(Math.sin(tSec * 3)) * 4,
    rot: watching ? 0 : .08 });

  // 参加者。表示は遅れてよい（判定は最後に時刻から作り直す）
  /* 奥から手前へ6レーン。奥ほど小さく描かないと、床の上に立っているように見えない。
   * 自分は必ず一番手前のレーンに置いて、探さなくても目に入るようにする。 */
  const LANE = [0, 1, 2, 3, 4, 5].map(i => {
    const d = i / 5;                      // 0=奥 1=手前
    return { y: GY + 34 + d * 232, scale: .74 + d * .46 };
  });
  const order = players.map((p, i) => ({ p, lane: p.you ? 5 : [0, 1, 2, 3, 4][i - 1] || 0 }))
    .sort((a, b) => a.lane - b.lane);      // 奥から描いて手前が重なるように

  for (const { p, lane } of order) {
    const L = LANE[lane];
    const spans = g.spans[p.id] || [];
    let held = 0, moving = false;
    for (const [a, b] of spans) { held += (b === null ? t : b) - a; if (b === null) moving = true; }
    const k = Math.min(1, held / 1000 * g.speed / g.goal);
    const x = X0 + (X1 - X0) * k;
    const y = L.y;
    const r = (p.you ? 34 : 30) * L.scale;
    Art.chara(c, { x, y: y - r, r, color: p.color, shape: p.shape, seed: p.seed,
      face: watching && moving ? 'shock' : moving ? 'joy' : 'flat',
      look: [1, 0], blink: p.blink > 0, shadowY: y + r * .1,
      walk: moving ? tSec * 13 + p.seed : 0,
      bob: moving ? -Math.abs(Math.sin(tSec * 13 + p.seed)) * r * .16 : 0,
      rot: moving ? Math.sin(tSec * 13 + p.seed) * .07 : 0 });
    if (moving && Math.random() < .25)
      fx.burst(x - r * .7, y, { n: 1, color: ['#C9A6E8'], speed: 80, size: 6 * L.scale,
        kind: 'dot', life: .35, grav: 240 });
    if (p.you) {
      const yy = y - r * 2 - 34 + Math.sin(tSec * 4) * 4;
      c.save(); c.fillStyle = PAL.yellow; c.strokeStyle = PAL.ink; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x, yy + 15); c.lineTo(x - 13, yy - 6);
      c.lineTo(x + 13, yy - 6); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
  }

  // 掛け声の進み具合
  if (cur && !watching) {
    const k = (t - cur.start) / (cur.turnAt - cur.start);
    Art.slab(c, W / 2 - 250, 618, 500, 30, '#3A1A5C', { depth: 6, r: 15, seed: 61, gloss: false });
    c.save();
    Art.wobbleRect(c, W / 2 - 242, 624, Math.max(6, 484 * Math.min(1, k)), 17, 9, 62);
    c.fillStyle = k > .8 ? PAL.red : PAL.yellow; c.fill();
    c.restore();
  }
}

function revealDaruma() {
  const L = last;
  Art.floor(c, W, H, 470, PAL.purple);
  const w = L.entries.find(e => e.fin !== null);
  Art.title(c, w ? w.name + ' の かち！' : 'ぜんいん とどかず', W / 2, 78, 62, { rot: -.015 });

  const bx = 400, bw = 520;
  L.entries.forEach((e, i) => {
    const y = 178 + i * 62;
    Art.chara(c, { x: bx - 52, y, r: 24, color: e.color, shape: e.shape, seed: e.seed,
      face: e.caught ? 'sad' : e.fin !== null ? 'joy' : 'flat' });
    Art.label(c, e.name, bx - 92, y, 18, e.caught ? '#8E6BB0' : PAL.cream,
      { align: 'right', ow: .28 });

    Art.slab(c, bx, y - 15, bw, 30, '#3A1A5C', { depth: 5, r: 15, seed: 80 + i, gloss: false });
    const k = e.dist / L.goal;
    if (k > .02) {
      c.save();
      Art.wobbleRect(c, bx + 7, y - 9, Math.max(8, (bw - 14) * k), 18, 9, 90 + i);
      c.fillStyle = e.fin !== null ? PAL.yellow : e.caught ? '#5B3B78' : e.color;
      c.fill(); c.restore();
    }
    if (e.caught) Art.label(c, 'つかまった', bx + bw + 66, y, 17, PAL.red, { ow: .28 });
    else if (e.fin !== null) Art.label(c, 'ゴール', bx + bw + 52, y, 17, PAL.yellow, { ow: .28 });
  });
}

// ---------------------------------------------------------------- 常時表示
function roster() {
  const y = H - 30;
  Art.slab(c, 16, y - 24, 300, 48, '#2A1240', { depth: 5, r: 24, seed: 12, gloss: false, shadow: false });
  let x = 46;
  for (const p of players) {
    Art.chara(c, { x, y: y - 2, r: 14, color: p.color, shape: p.shape, seed: p.seed,
      face: p.face, blink: p.blink > 0 });
    Art.label(c, String(p.score), x + 1, y + 17, 14,
      p.you ? PAL.yellow : '#B896D6', { ow: .34 });
    x += 46;
  }
}

})();
