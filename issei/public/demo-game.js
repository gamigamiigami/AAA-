/* 一斉 — 体験デモ。あなた1人 + コンピュータ5人。
 * 判定ロジックは本番の games.js と同じ形にしてある。
 *
 * 画面設計の原則:
 *   - 金はロゴだけ。「いま操作する場所」は白。体色に金と白は使わない
 *   - 装飾は必ず見出しより奥。文字の上に何も乗せない
 *   - 床の上に置く物は床と同じ消失点を持つ（正面の角丸長方形を載せない）
 *   - 結果は数字ではなく芝居で見せる。数字は添え物
 */
'use strict';
(function () {

const W = 1280, H = 720;
const c = document.getElementById('big').getContext('2d');
const PAL = Art.PAL, E = Art.ease;
const fx = new Art.FX();
const $ = s => document.querySelector(s);
const btn = $('#btn'), foot = $('#foot'), scEl = $('#sc');

// ---------------------------------------------------------------- 一座
/* 6人が体型・頭部・顔つき・色すべてで分かれるよう手で組む。
 * 「あなた」は一番目立つ造形（王冠）にする。主人公が地味では困る。 */
const CAST_DEF = [
  { name: 'あなた', shape: 'pentagon', color: '#FF4D5E' },
  { name: 'たかし', shape: 'triangle', color: '#3E8CFF' },
  { name: 'ゆい',   shape: 'star',     color: '#FFB0D8' },
  { name: 'けん',   shape: 'crown',    color: '#39C96A' },
  { name: 'まり',   shape: 'moon',     color: '#A96BEE' },
  { name: 'そう',   shape: 'square',   color: '#FF8A2B' }
];
const players = CAST_DEF.map((d, i) => Object.assign({}, d, {
  id: i, you: i === 0, score: 0, seed: i * 37 + 5,
  sigma: [0, 55, 38, 92, 46, 70][i],
  bravery: [0, .82, .6, .95, .5, .72][i],
  face: 'smile', bob: 0, squash: 1, lean: 0, armUp: false,
  blink: 0, nextBlink: 1 + i * .7
}));
const YOU = players[0];

{ const mc = $('#me').getContext('2d');
  mc.setTransform(2, 0, 0, 2, 0, 0);
  Art.bounceColor = PAL.wood;
  Art.chara(mc, { x: 22, y: 27, r: 14, color: YOU.color, shape: YOU.shape,
                  seed: YOU.seed, face: 'joy' }); }
// 手元のボタンを自分の色にする。大画面の自分を探す手掛かりになる。
document.documentElement.style.setProperty('--me', YOU.color);
document.documentElement.style.setProperty('--me-dark', Art.shade(YOU.color, -.42));

// ---------------------------------------------------------------- 進行
const BEAT = 500, COUNT_IN = 4;
let phase = 'idle', game = null, g = null, last = null, sent = 0;
let shake = 0, flash = 0, wipe = 0, revealT = 0;
let tSec = 0, prev = performance.now();
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
  const t = (e && e.timeStamp > 0) ? e.timeStamp : now();
  if (game === 'seino') {
    if (g.press[0] !== undefined) return;
    g.press[0] = t; sent++;
    Snd.sfx('tap');
    YOU.squash = .68; YOU.armUp = true; YOU.face = 'joy';
    fx.burst(ARC[0].x, ARC[0].y - 60, { n: 12, color: ['#fff', PAL.focusGlow],
      speed: 260, size: 8, kind: 'star', life: .5, lift: 60 });
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
  phase = 'play'; last = null; sent = 0; wipe = 1;
  for (const p of players) { p.face = 'smile'; p.squash = 1; p.armUp = false; p.lean = 0; }

  if (game === 'seino') {
    g = { target: now() + COUNT_IN * BEAT, endsAt: now() + COUNT_IN * BEAT + 1300,
          press: {}, fired: new Set() };
    for (const p of players) if (!p.you) {
      const at = g.target + gauss() * p.sigma;
      setTimeout(() => { if (phase === 'play' && game === 'seino') {
        g.press[p.id] = at; sent++; p.squash = .68; p.armUp = true; p.face = 'joy';
      } }, Math.max(0, at - now()));
    }
    setBtn('おす', false, false);
    foot.textContent = 'しろい わが かさなったら おす';
  } else {
    const chants = []; let t = now() + 1200; const until = now() + 21000;
    while (t < until) {
      const ch = 900 + Math.random() * 2300, wt = 700 + Math.random() * 800;
      chants.push({ start: t, turnAt: t + ch, watchUntil: t + ch + wt });
      t += ch + wt + 250;
    }
    g = { chants, endsAt: until + 900, spans: {}, held: {}, fired: new Set(),
          goal: 240, speed: 30 };
    for (const p of players) if (!p.you) scheduleBot(p);
    setBtn('おしっぱなし', false, false);
    foot.textContent = 'かけごえの あいだだけ すすむ';
  }
  setTimeout(finish, g.endsAt - now());
}

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
  phase = 'reveal'; wipe = 1; revealT = 0;
  last = game === 'seino' ? judgeSeino() : judgeDaruma();
  for (const id of last.winners) players[id].score++;
  scEl.textContent = YOU.score;

  const won = last.winners.indexOf(0) >= 0;
  Snd.duck(.6, .9);
  Snd.sfx(won || last.ok ? 'win' : 'lose');
  if (navigator.vibrate) navigator.vibrate(won ? [40, 60, 40] : 150);

  /* 芝居をつける。勝者は万歳、敗者はうなだれる。数字より先にこれが目に入る。 */
  for (const p of players) {
    const e = last.entries.find(x => x.id === p.id) || {};
    const w = last.winners.indexOf(p.id) >= 0;
    p.face = w ? 'joy' : e.bad ? 'sad' : 'flat';
    p.armUp = w; p.lean = w ? 0 : (e.bad ? .1 : 0);
  }
  if (won || last.ok) {
    for (let i = 0; i < 3; i++) setTimeout(() => fx.burst(W / 2, 150, {
      n: 34, color: [PAL.gold, PAL.pink, '#3E8CFF', '#39C96A', '#fff'],
      speed: 640, lift: 200, size: 15, life: 2, grav: 720 }), i * 140);
    flash = .45;
  } else shake = 12;

  setBtn(last.you, true, false);
  foot.textContent = 'つぎのゲームへ…';
  setTimeout(() => { phase = 'idle'; startRound(); }, 6400);
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
const STAGE_Y = 430;
/* 舞台上の立ち位置は手で決める。等間隔に並べた瞬間、絵は
 * 「for 文が並べた画面」になる。奥行き3列、大きさに差、間隔に粗密、
 * そして全員が違う方を向く。 */
const SPOTS = {
  'あなた': { x: 470, row: 2, look: [ .1, -.7], tilt: -.02 },
  'たかし': { x: 648, row: 1, look: [-.5, -.4], tilt:  .04 },
  'ゆい':   { x: 366, row: 0, look: [ .6, -.5], tilt: -.05 },
  'けん':   { x: 966, row: 1, look: [-.7, -.2], tilt:  .03 },
  'まり':   { x: 880, row: 0, look: [-.3, -.6], tilt: -.03 },
  'そう':   { x: 256, row: 0, look: [ .8, -.2], tilt:  .06 }
};
const ROWS = [ { y: 508, s: .82 }, { y: 566, s: .98 }, { y: 648, s: 1.2 } ];
players.forEach(p => {
  const sp = SPOTS[p.name] || { x: 500, row: 1, look: [0, -.4], tilt: 0 };
  p.spot = sp; p.row = ROWS[sp.row];
});
/* 奥から描いて手前が重なるようにする。重なりは奥行きの一番強い手掛かり。 */
const DRAW_ORDER = players.slice().sort((a, b) => a.spot.row - b.spot.row);
const ARC = players.map(p => ({ x: p.spot.x, y: p.row.y }));

// ---------------------------------------------------------------- ループ
function loop(ms) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (ms - prev) / 1000); prev = ms;
  tSec += dt; revealT += dt;
  fx.update(dt);

  for (const p of players) {
    p.squash += (1 - p.squash) * Math.min(1, dt * 9);
    p.bob = -Math.abs(Math.sin(tSec * Math.PI * 1000 / BEAT + p.seed)) * 7;
    p.nextBlink -= dt;
    if (p.nextBlink <= 0) { p.blink = .12; p.nextBlink = 2.2 + Math.random() * 3.4; }
    p.blink = Math.max(0, p.blink - dt);
  }
  shake = Math.max(0, shake - dt * 44);
  flash = Math.max(0, flash - dt * 2.2);
  wipe = Math.max(0, wipe - dt * 3.2);

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.save();
  if (shake > 0) c.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  Art.stage(c, W, H, tSec);
  if (phase === 'play') (game === 'seino' ? viewSeino : viewDaruma)();
  else if (phase === 'reveal') (last.spread !== undefined ? revealSeino : revealDaruma)();
  else viewIdle();

  fx.draw(c);
  roster();
  c.restore();

  if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + (flash * .5) + ')'; c.fillRect(0, 0, W, H); }
  if (wipe > 0) {
    const k = E.outCubic(wipe);
    c.fillStyle = PAL.ink;
    c.fillRect(0, 0, W, H * .52 * k);
    c.fillRect(0, H - H * .52 * k, W, H * .52 * k);
  }
}
requestAnimationFrame(loop);

/* 画面左上の状態表示。プレイの邪魔をしない位置に固定する。 */
function hud(cap, val) {
  const w = Math.max(150, Art.measure(c, cap, 15) + 60);
  Art.slab(c, 20, 20, w, 54, '#2A1B44', { depth: 4, r: 14, shadow: false, lw: 2.5 });
  Art.label(c, cap, 34, 38, 14, 'rgba(255,247,232,.5)', { align: 'left', ow: .34 });
  Art.num(c, val, 34, 60, 20, PAL.cream, { align: 'left', ow: .32 });
}

/* 見出しの帯。文字の背後に必ず落ち影の面を敷いて、装飾から守る。 */
function heading(text, size, color, y, rot) {
  const w = Art.measure(c, text, size, { face: '"Dela Gothic One", sans-serif' }) + size * .9;
  c.save();
  c.globalAlpha = .38; c.filter = 'blur(16px)';
  c.fillStyle = '#0A0320';
  Art.roundRect(c, W / 2 - w / 2, y - size * .78, w, size * 1.56, size * .6);
  c.fill(); c.restore();
  Art.title(c, text, W / 2, y, size, { fill: color, rot: rot || 0 });
}

// ---------------------------------------------------------------- 待ち受け
function viewIdle() {
  Art.backdrop(c, W, H, STAGE_Y, tSec);
  Art.lights(c, W, tSec, -34);
  Art.floor(c, W, H, STAGE_Y);
  Art.logo(c, W / 2 + 26, 286, 104);
  Art.label(c, 'ボタンを おすと はじまる', W / 2, 372, 25, PAL.cream, { ow: .26 });
  drawCast({ look: [0, -.2] });
}

function drawCast(opt) {
  opt = opt || {};
  for (const p of DRAW_ORDER) {
    const sp = p.spot, row = p.row;
    const depth = sp.row / 2;                       // 0=奥 1=手前
    const r = (p.you ? 48 : 43) * row.s;
    // 光だまりの中にいる者ほど明るく見える。床の光と人物を繋ぐ。
    Art.lightPool(c, sp.x, row.y, r * 2.2, r * .7, '#FFD79B', .1 + depth * .06);
    Art.chara(c, { x: sp.x, y: row.y - r, r, color: p.color, shape: p.shape, seed: p.seed,
      face: p.face, squash: p.squash, bob: p.bob * row.s, lean: p.lean, armUp: p.armUp,
      blink: p.blink > 0, shadowY: row.y + 2, shadowK: .55, armT: tSec * 2,
      rot: sp.tilt,
      look: opt.forceLook || sp.look });
    Art.label(c, p.name, sp.x, row.y + 22 * row.s, 15 * row.s,
      p.you ? PAL.cream : 'rgba(255,247,232,.55)', { ow: .34 });
    if (p.you) {
      const yy = row.y + p.bob - r * 2.3 - 34 + Math.sin(tSec * 4) * 4;
      c.save();
      c.beginPath(); c.moveTo(sp.x, yy + 17); c.lineTo(sp.x - 14, yy - 7);
      c.lineTo(sp.x + 14, yy - 7); c.closePath();
      c.fillStyle = PAL.focus; c.fill();
      Art.stroke(c, PAL.ink, 3.5); c.restore();
    }
  }
}

// ---------------------------------------------------------------- せーの
function viewSeino() {
  const left = g.target - now();
  for (let i = 0; i <= COUNT_IN; i++) {
    const at = -(COUNT_IN - i) * BEAT;
    if (left <= at && !g.fired.has(i)) {
      g.fired.add(i);
      Snd.sfx(i === COUNT_IN ? 'beat' : 'tick');
      if (i === COUNT_IN) { fx.ring(W / 2, 292, { r1: 300, color: PAL.focus, lw: 16, life: .5 }); shake = 7; }
    }
  }
  Art.backdrop(c, W, H, STAGE_Y, tSec);
  Art.lights(c, W, tSec, -34);
  Art.floor(c, W, H, STAGE_Y);

  const cx = W / 2, cy = 292, R = 118;
  // 的の輪。画面で最も強い白。ここが機能色。
  c.beginPath(); c.arc(cx, cy, R, 0, Art.TAU);
  Art.stroke(c, 'rgba(255,255,255,.22)', 14);
  c.beginPath(); c.arc(cx, cy, R, 0, Art.TAU);
  Art.stroke(c, PAL.focus, 5);

  const k = Math.max(0, Math.min(1.7, left / (COUNT_IN * BEAT)));
  const near = Math.abs(left) < 90;
  c.save();
  c.shadowColor = PAL.focusGlow; c.shadowBlur = near ? 40 : 20;
  c.beginPath(); c.arc(cx, cy, Math.max(9, R * k), 0, Art.TAU);
  Art.stroke(c, near ? PAL.focus : PAL.focusGlow, near ? 17 : 10);
  c.restore();

  if (left > 0) {
    const n = Math.ceil(left / BEAT);
    const pop = 1 - ((left % BEAT) / BEAT);
    Art.title(c, String(n), cx, cy, 100 * (1 + E.outBack(Math.min(1, pop * 3)) * .1),
      { fill: PAL.cream, extrude: 8 });
  } else {
    Art.title(c, 'いま！', cx, cy, 74, { fill: PAL.focus, rot: Math.sin(tSec * 26) * .05, extrude: 8 });
  }

  heading('せーの！', 74, PAL.cream, 92, -.02);
  Art.label(c, 'ぜんいん そろえて おす', W / 2, 158, 23, 'rgba(255,247,232,.8)', { ow: .28 });

  /* 溜めの芝居。拍が近づくほど身を屈める。 */
  const crouch = left > 0 ? 1 - Math.min(.22, (1 - Math.min(1, left / (COUNT_IN * BEAT))) * .22) : 1;
  players.forEach(p => { if (g.press[p.id] === undefined) p.squash = Math.min(p.squash, crouch); });
  drawCast();

  hud('そうしん', sent + ' / ' + players.length);
}

function revealSeino() {
  const L = last;
  Art.lights(c, W, tSec, -34);
  Art.floor(c, W, H, STAGE_Y);

  const pop = E.outBack(Math.min(1, revealT * 2.6));
  c.save();
  c.translate(W / 2, 108); c.scale(pop, pop); c.translate(-W / 2, -108);
  heading(L.ok ? 'そろった！' : 'ばらけた…', 82,
    L.ok ? PAL.gold : PAL.cream, 108, L.ok ? -.02 : .015);
  c.restore();

  // 大きい数字ひとつ。表とグラフではなく、これとキャラの芝居で見せる。
  const big = L.spread === null ? '—' : String(L.spread);
  Art.label(c, 'ばらつき', W / 2 - 104, 196, 22, 'rgba(255,247,232,.6)', { ow: .3, align: 'right' });
  Art.num(c, big + 'ms', W / 2 + 6, 198, 46, L.ok ? '#39C96A' : PAL.danger,
    { align: 'left', ow: .34 });
  Art.label(c, L.ok ? 'ぜんいん +1てん' : '80ms いないで せいこう',
    W / 2, 246, 20, 'rgba(255,247,232,.55)', { ow: .3 });

  drawCast({ look: [0, -.15] });
  strip(L.entries, 190, 400, W - 380);
}

/* ズレの帯。分析グラフではなく「どこに集まったか」を一目で見せる補助。
 * 目盛りは3本だけ。密集したら自動で拡大する。 */
function strip(entries, x, y, w) {
  const hits = entries.filter(e => e.error !== null);
  if (!hits.length) return;
  const peak = Math.max(60, ...hits.map(e => Math.abs(e.error)));
  const range = Math.ceil(peak * 1.25 / 20) * 20;
  const px = ms => x + w / 2 + Art.clamp(ms / range, -1, 1) * (w / 2 - 26);

  Art.slab(c, x - 22, y - 34, w + 44, 74, '#3A2358', { depth: 6, r: 24 });
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y);
  Art.stroke(c, 'rgba(255,255,255,.18)', 3);
  c.beginPath(); c.moveTo(px(0), y - 20); c.lineTo(px(0), y + 20);
  Art.stroke(c, PAL.focus, 4);
  Art.num(c, '-' + range, px(-range), y + 24, 13, 'rgba(255,247,232,.4)', { ow: .34 });
  Art.num(c, '+' + range, px(range), y + 24, 13, 'rgba(255,247,232,.4)', { ow: .34 });

  for (const e of hits) {
    // 重なっても分離するようステッカー縁を付ける
    Art.chara(c, { x: px(e.error), y: y - 6, r: 15, color: e.color, shape: e.shape,
      seed: e.seed, face: e.bad ? 'sad' : 'joy', feet: false, arms: false,
      sticker: e.you ? PAL.focus : '#3A2358' });
  }
}

// ---------------------------------------------------------------- だるまさん
const D_Y = 356, D_X0 = 150, D_X1 = W - 330;
/* レーンごとに奥行きと、横のずれ量を持たせる。
 * 進行度だけで x を決めると、同じくらい進んだ者が縦一列に並んでしまう。 */
const LANES = [
  { y: D_Y + 34,  scale: .70, dx: -34 },
  { y: D_Y + 84,  scale: .80, dx:  26 },
  { y: D_Y + 134, scale: .90, dx: -16 },
  { y: D_Y + 190, scale: 1.0, dx:  38 },
  { y: D_Y + 250, scale: 1.1, dx: -28 },
  { y: D_Y + 316, scale: 1.24, dx: 12 }
];

function viewDaruma() {
  const t = now();
  let cur = null, watching = false;
  for (const ch of g.chants) {
    if (t >= ch.start && !g.fired.has('s' + ch.start)) { g.fired.add('s' + ch.start); Snd.sfx('chant'); }
    if (t >= ch.turnAt && !g.fired.has('t' + ch.turnAt)) {
      g.fired.add('t' + ch.turnAt); Snd.sfx('turn'); shake = 10;
    }
    if (t >= ch.start && t < ch.watchUntil) { cur = ch; watching = t >= ch.turnAt; break; }
  }

  Art.backdrop(c, W, H, D_Y, tSec);
  Art.lights(c, W, tSec, -46);
  /* 危険時は床を暗く濁った赤にする。鮮やかな赤にすると、
   * 背景が画面で最も強い色になって主役（鬼）が沈む。 */
  Art.floor(c, W, H, D_Y, watching ? '#7A3038' : PAL.wood);
  if (watching) { c.fillStyle = 'rgba(120,10,26,.2)'; c.fillRect(0, 0, W, H); }

  // ゴールの旗。支柱を床まで届かせ、接地影を落とす。
  const gx = D_X1 + 96;
  Art.contact(c, gx, D_Y + 214, 30, .4);
  c.beginPath(); c.moveTo(gx, D_Y + 214); c.lineTo(gx, D_Y - 44);
  Art.stroke(c, '#2A1F3E', 8);
  c.beginPath(); c.moveTo(gx, D_Y + 214); c.lineTo(gx, D_Y - 44);
  Art.stroke(c, '#7D6A9E', 4);
  const flag = () => { c.beginPath();
    c.moveTo(gx, D_Y - 44);
    c.quadraticCurveTo(gx + 44, D_Y - 30 + Math.sin(tSec * 4) * 7, gx + 86, D_Y - 44);
    c.lineTo(gx + 86, D_Y + 10);
    c.quadraticCurveTo(gx + 44, D_Y + 24 + Math.sin(tSec * 4) * 7, gx, D_Y + 10);
    c.closePath(); };
  flag(); c.fillStyle = '#F2E7D2'; c.fill();
  c.save(); flag(); c.clip();          // 市松。白い布より「ゴール」だと形で分かる
  c.fillStyle = '#2A2036';
  for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 6; ix++)
    if ((ix + iy) % 2 === 0) c.fillRect(gx + ix * 15, D_Y - 46 + iy * 16, 15, 16);
  c.restore();
  flag(); Art.stroke(c, PAL.ink, 4);
  Art.label(c, 'ゴール', gx + 43, D_Y - 68, 18, PAL.cream, { ow: .32 });

  /* 鬼。床の補色側（暗い紫）に置く。危険色の床と同じ色にしない。
   * 目だけを強く光らせて、振り向いた瞬間に視線が集まるようにする。 */
  const ox = D_X1 + 168, oy = D_Y + 236;
  const or = 66;
  Art.chara(c, { x: ox, y: oy - or, r: or, color: watching ? '#3B1F4E' : '#4A3A66',
    shape: 'trio' in Art.CAST ? 'crown' : 'crown', seed: 999,
    face: watching ? 'mad' : 'flat',
    look: watching ? [-1, 0] : [1, .3], shadowY: oy + 4, shadowK: .6,
    bob: watching ? Math.sin(tSec * 24) * 3 : -Math.abs(Math.sin(tSec * 3)) * 5,
    rot: watching ? 0 : .09, armT: tSec * 2 });
  if (watching) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const gg = c.createRadialGradient(ox, oy - or * 1.1, 0, ox, oy - or * 1.1, 90);
    gg.addColorStop(0, 'rgba(255,70,80,.5)'); gg.addColorStop(1, 'rgba(255,70,80,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(ox, oy - or * 1.1, 90, 0, Art.TAU); c.fill();
    c.restore();
  }

  /* 参加者。奥から手前へ。横位置も少しずらして縦一列にしない。 */
  const assign = players.map((p, i) => ({ p, lane: p.you ? 5 : [0, 2, 1, 4, 3][i - 1] }))
    .sort((a, b) => a.lane - b.lane);
  for (const { p, lane } of assign) {
    const L = LANES[lane];
    const spans = g.spans[p.id] || [];
    let held = 0, moving = false;
    for (const [a, b] of spans) { held += (b === null ? t : b) - a; if (b === null) moving = true; }
    const k = Math.min(1, held / 1000 * g.speed / g.goal);
    const x = D_X0 + (D_X1 - D_X0) * k + L.dx;
    const r = (p.you ? 34 : 29) * L.scale;
    // 振り向かれた瞬間、動いていた者は体が流れて止まる
    Art.chara(c, { x, y: L.y - r, r, color: p.color, shape: p.shape, seed: p.seed,
      face: watching && moving ? 'shock' : moving ? 'joy' : 'flat',
      look: [1, 0], blink: p.blink > 0, shadowY: L.y, sticker: 'rgba(20,10,40,.5)',
      walk: moving && !watching ? tSec * 13 + p.seed : 0,
      lean: watching && moving ? .18 : 0,
      bob: moving && !watching ? -Math.abs(Math.sin(tSec * 13 + p.seed)) * r * .16 : 0 });
    if (moving && !watching && Math.random() < .25)
      fx.burst(x - r * .7, L.y, { n: 1, color: ['#E7D2B0'], speed: 80, size: 6 * L.scale,
        kind: 'dot', life: .35, grav: 240 });
    if (p.you) {
      const yy = L.y - r * 2 - 36 + Math.sin(tSec * 4) * 4;
      c.save();
      c.beginPath(); c.moveTo(x, yy + 16); c.lineTo(x - 13, yy - 6);
      c.lineTo(x + 13, yy - 6); c.closePath();
      c.fillStyle = PAL.focus; c.fill(); Art.stroke(c, PAL.ink, 3.5); c.restore();
    }
  }

  heading(watching ? 'ふりむいた！' : 'だるまさんが……', watching ? 76 : 56,
    watching ? PAL.danger : PAL.cream, 74, watching ? Math.sin(tSec * 30) * .035 : -.01);

  // 掛け声の進み。舞台の外（下の余白）に置き、キャラと重ねない。
  if (cur && !watching) {
    const k = (t - cur.start) / (cur.turnAt - cur.start);
    Art.slab(c, 30, 664, 640, 30, '#3A2358', { depth: 5, r: 15, shadow: false });
    Art.roundRect(c, 37, 669, Math.max(8, 626 * Math.min(1, k)), 18, 9);
    c.fillStyle = k > .82 ? PAL.danger : PAL.focus; c.fill();
  }
}

function revealDaruma() {
  const L = last;
  Art.lights(c, W, tSec, -34);
  Art.floor(c, W, H, STAGE_Y);

  const w = L.entries.find(e => e.fin !== null);
  const pop = E.outBack(Math.min(1, revealT * 2.6));
  c.save();
  c.translate(W / 2, 104); c.scale(pop, pop); c.translate(-W / 2, -104);
  heading(w ? w.name + ' の かち！' : 'ぜんいん とどかず', 64, PAL.cream, 104, -.015);
  c.restore();

  podium(L.entries.slice(0, 3), e =>
    e.caught ? 'つかまった' : e.fin !== null ? 'ゴール' : e.dist + '/' + L.goal);

  // 4位以下は小さく一列。全員に居場所を与える。
  const rest = L.entries.slice(3);
  if (rest.length) {
    const step = 118, x0 = W / 2 - (rest.length - 1) * step / 2;
    rest.forEach((e, i) => {
      const x = x0 + i * step;
      Art.chara(c, { x, y: 664, r: 22, color: e.color, shape: e.shape, seed: e.seed,
        face: e.caught ? 'sad' : 'flat', shadowY: 690, feet: false, arms: false,
        bob: -Math.abs(Math.sin(tSec * 3 + i)) * 3 });
      Art.label(c, e.name, x, 700, 15, 'rgba(255,247,232,.6)', { ow: .34 });
    });
  }
}

/* 表彰台。床と同じ消失点を持つ立体で、キャラは天面に立ち、影も天面に落ちる。
 * 1位が最も高く・最も手前・最も大きい。 */
function podium(top, label) {
  const slots = [{ rank: 1, x: W / 2 - 220, h: 74, r: 40 },
                 { rank: 0, x: W / 2,       h: 116, r: 50 },
                 { rank: 2, x: W / 2 + 220, h: 54, r: 36 }];
  const baseY = 600;
  for (const s of slots.sort((a, b) => b.h - a.h)) {   // 低い台を先に描く
    const e = top[s.rank]; if (!e) continue;
    const topY = baseY - s.h;
    const face = Art.podium(c, s.x, topY, baseY, s.rank === 0 ? 176 : 152,
      s.rank === 0 ? '#C9922E' : '#5B4480', W / 2);
    const standY = topY - face.depth * .45;
    Art.contact(c, s.x + face.skew * .4, standY + 4, s.r * .9, .45);
    Art.chara(c, { x: s.x + face.skew * .4, y: standY - s.r, r: s.r,
      color: e.color, shape: e.shape, seed: e.seed,
      face: s.rank === 0 ? 'joy' : e.caught ? 'sad' : 'flat',
      armUp: s.rank === 0, armT: tSec * 2,
      bob: -Math.abs(Math.sin(tSec * (s.rank === 0 ? 6 : 3) + s.rank)) * (s.rank === 0 ? 9 : 4) });
    Art.title(c, String(s.rank + 1), s.x, topY + s.h * .5, 40,
      { fill: s.rank === 0 ? PAL.cream : 'rgba(255,247,232,.75)', extrude: 4 });
    Art.label(c, e.name, s.x, baseY + 26, 22, PAL.cream, { ow: .3 });
    Art.label(c, label(e), s.x, baseY + 52, 17, 'rgba(255,247,232,.6)', { ow: .3 });
  }
}

// ---------------------------------------------------------------- 常時表示
/* 30人でも破綻しないよう、8人を超えたら上位5人＋自分だけを出す。
 * 6人時の見た目を先に作ると、30人で必ず壊れる。 */
function roster() {
  const sorted = players.slice().sort((a, b) => b.score - a.score);
  let show = sorted;
  if (players.length > 8) {
    show = sorted.slice(0, 5);
    if (show.indexOf(YOU) < 0) show.push(YOU);
  }
  const cw = 84, pad = 12;
  const total = show.length * cw + pad * 2;
  const rx0 = W - 18 - total;
  Art.slab(c, rx0, H - 62, total, 50, '#2A1B44', { depth: 4, r: 25, shadow: false, lw: 2.5 });
  show.forEach((p, i) => {
    const x = rx0 + pad + cw * i + cw / 2 - 16;
    Art.chara(c, { x, y: H - 38, r: 15, color: p.color, shape: p.shape, seed: p.seed,
      face: p.face, blink: p.blink > 0, feet: false, arms: false });
    Art.label(c, p.name, x + 21, H - 46, 13,
      p.you ? PAL.cream : 'rgba(255,247,232,.6)', { ow: .34, align: 'left' });
    Art.num(c, String(p.score), x + 21, H - 28, 15,
      p.you ? PAL.focus : 'rgba(255,247,232,.45)', { ow: .34, align: 'left' });
  });
}

})();
