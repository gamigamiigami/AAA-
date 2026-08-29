/* 一斉 — 体験デモの進行。あなた1人 + コンピュータ5人。
 * 描画は stage.js に任せ、ここは状態と判定だけを持つ。
 * 判定ロジックは本番の games.js と同じ形。 */
'use strict';
(function () {

const c = document.getElementById('big').getContext('2d');
const PAL = Art.PAL, E = Art.ease, S = Stage;
const W = S.W, H = S.H, BEAT = S.BEAT, COUNT_IN = S.COUNT_IN;
const fx = new Art.FX();
const $ = s => document.querySelector(s);
const btn = $('#btn'), foot = $('#foot'), scEl = $('#sc');

/* 6人が体型・頭部・顔つき・色すべてで分かれるよう手で組む。
 * 「あなた」は一番目立つ造形にする。主人公が地味では困る。 */
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
  face: 'smile', poseName: 'idle', dist: 0, moving: false
}));
const YOU = players[0];
const cueFired = new Set();   // 同じ合図で二度鳴らさない
const order = S.seat(players);

{ const mc = $('#me').getContext('2d');
  mc.setTransform(2, 0, 0, 2, 0, 0);
  Art.bounceColor = PAL.wood;
  Art.chara(mc, { x: 22, y: 27, r: 14, color: YOU.color, shape: YOU.shape,
                  seed: YOU.seed, face: 'joy' }); }
// 手元のボタンを自分の色にする。大画面の自分を探す手掛かりになる。
document.documentElement.style.setProperty('--me', YOU.color);
document.documentElement.style.setProperty('--me-dark', Art.shade(YOU.color, -.42));

// ---------------------------------------------------------------- 状態
const st = { players, order, tSec: 0, sent: 0, revealT: 0, cardT: 0, cardWord: '',
             last: null, watching: false, chant: null, left: 0, goal: 240 };
let phase = 'idle', game = null, g = null;
let shake = 0, flash = 0, wipe = 0, hitStop = 0, cardHit = false;
let scoreShown = 0;
const scorePop = new Art.Spring(1, 260, 13);
let prev = performance.now();
const now = () => performance.now();
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
// QA用。?card=1 で命令カードを保持したまま止める（撮影のため。進行には影響しない）
const HOLD_CARD = new URLSearchParams(location.search).get('card') === '1';

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
  if (phase === 'idle') { Snd.mood('lobby'); return startRound(); }
  if (phase !== 'play') return;
  const t = (e && e.timeStamp > 0) ? e.timeStamp : now();
  if (game === 'seino') {
    if (g.press[0] !== undefined) return;
    g.press[0] = t; st.sent++;
    Snd.sfx('tap');
    YOU.sq.x = .62; YOU.sq.v = 4.2; YOU.poseName = 'cheer'; YOU.face = 'joy';
    hitStop = .055;
    fx.burst(YOU.spot.x, YOU.row.y - 70, { n: 12, color: ['#fff', PAL.focusGlow],
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
  const sp = g.spans[0]; sp[sp.length - 1][1] = t;
  setBtn('とまれ', false, false);
}

// ---------------------------------------------------------------- 進行
function startRound() {
  game = game === 'seino' ? 'daruma' : 'seino';
  st.cardWord = game === 'seino' ? 'せーの！' : 'とまれ！';
  st.cardHue  = game === 'seino' ? '#2E7BC4' : '#B03050';
  st.cardT = 0; cardHit = false; phase = 'card';
  Snd.mood('play');
}

function beginRound() {
  phase = 'play'; st.last = null; st.sent = 0; wipe = .55; st.revealT = 0;
  cueFired.clear();
  for (const p of players) {
    p.face = 'smile'; p.sq.to(1); p.poseName = 'idle'; p.lean = 0;
    p.dist = 0; p.moving = false; p.pending = null;
  }
  if (game === 'seino') {
    g = { target: now() + COUNT_IN * BEAT, endsAt: now() + COUNT_IN * BEAT + 1300,
          press: {}, fired: new Set() };
    for (const p of players) if (!p.you) {
      const at = g.target + gauss() * p.sigma;
      setTimeout(() => { if (phase === 'play' && game === 'seino') {
        g.press[p.id] = at; st.sent++; p.sq.x = .66; p.sq.v = 3.6; p.poseName = 'cheer'; p.face = 'joy';
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
    st.goal = g.goal;
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
  phase = 'reveal'; wipe = 1; st.revealT = 0;
  st.last = game === 'seino' ? judgeSeino() : judgeDaruma();
  for (const id of st.last.winners) players[id].score++;
  if (YOU.score !== scoreShown) scorePop.x = 1.7;
  scoreShown = YOU.score; scEl.textContent = YOU.score;

  const won = st.last.winners.indexOf(0) >= 0;
  Snd.mood('tense');
  Snd.duck(.6, .9);
  Snd.sfx(won || st.last.ok ? 'win' : 'lose');
  if (navigator.vibrate) navigator.vibrate(won ? [40, 60, 40] : 150);

  /* 全員が同時に同じ顔になると6体が1つの部品に見える。順位順に遅らせる。 */
  st.last.entries.forEach((e, i) => {
    const p = players[e.id];
    const w = st.last.winners.indexOf(p.id) >= 0;
    p.reactAt = .12 + i * .11;
    p.pending = { face: w ? 'joy' : e.bad ? 'sad' : 'flat',
                  poseName: w ? 'cheer' : e.bad ? 'flop' : 'idle' };
  });
  hitStop = (won || st.last.ok) ? .12 : .09;
  if (won || st.last.ok) {
    for (let i = 0; i < 3; i++) setTimeout(() => fx.burst(W / 2, 150, {
      n: 34, color: [PAL.gold, PAL.pink, '#3E8CFF', '#39C96A', '#fff'],
      speed: 640, lift: 200, size: 15, life: 2, grav: 720 }), i * 140);
    flash = .45;
  } else shake = 12;

  setBtn(st.last.you, true, false);
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

// ---------------------------------------------------------------- ループ
function loop(ms) {
  requestAnimationFrame(loop);
  let dt = Math.min(.05, (ms - prev) / 1000); prev = ms;
  // ヒットストップ中は世界の時間を止める
  if (hitStop > 0) { hitStop -= dt; dt = 0; }
  st.tSec += dt; st.revealT += dt;
  if (phase === 'card') {
    st.cardT = Math.min(HOLD_CARD ? .58 : 1, st.cardT + dt / 1.15);
    if (!cardHit && st.cardT > .28) { cardHit = true; hitStop = .085; shake = 14; Snd.sfx('beat'); }
    if (st.cardT >= 1) beginRound();
  }
  fx.update(dt);

  /* 溜め。目標の2拍前からしゃがませる。溜めがないと、成功しても
   * 「跳ねた」だけで「こらえて弾けた」に見えない。 */
  if (phase === 'play' && game === 'seino' && now() > g.target - BEAT * 2) {
    for (const p of players)
      if (g.press[p.id] === undefined && p.poseName === 'idle') p.poseName = 'ready';
  }

  for (const p of players) {
    S.stepPlayer(p, dt, st.tSec, { beat: phase === 'play' && game === 'seino' });
    if (p.pending && st.revealT >= p.reactAt) {
      const won = p.pending.poseName === 'cheer';
      p.face = p.pending.face; p.poseName = p.pending.poseName;
      p.sq.x = won ? .72 : 1.14; p.sq.v = won ? 5 : -1.6;
      if (won) fx.burst(p.spot.x, p.row.y - 70, {
        n: 8, color: [PAL.gold, '#fff'], speed: 220, size: 9, kind: 'star', life: .6, lift: 90 });
      p.pending = null;
    }
  }
  scorePop.to(1); scorePop.step(dt);
  scEl.style.display = 'inline-block';
  scEl.style.transform = 'scale(' + scorePop.x.toFixed(3) + ')';

  shake = Math.max(0, shake - dt * 44);
  flash = Math.max(0, flash - dt * 2.2);
  wipe = Math.max(0, wipe - dt * 3.2);

  if (phase === 'play' && game === 'daruma') updateDaruma();
  if (phase === 'play' && game === 'seino') {
    st.left = g.target - now();
    /* 予告の拍。そして最後の1拍の手前で曲を完全に止める。
     * 音を小さくするのでは足りない。ゼロにしないと客は息を止めない。 */
    for (let i = 0; i <= COUNT_IN; i++) {
      const at = -(COUNT_IN - i) * BEAT;
      if (st.left > at) continue;
      if (i === COUNT_IN - 1 && !cueFired.has('hush')) {
        cueFired.add('hush'); Snd.hush(BEAT / 1000 + 1.1);
      }
      if (!cueFired.has('c' + i)) {
        cueFired.add('c' + i);
        Snd.sfx(i === COUNT_IN ? 'beat' : 'tick');
        if (i === COUNT_IN) { hitStop = .06; shake = 8; }
      }
    }
  }

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.save();
  if (shake > 0) c.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  Art.sky(c, W, H, st.tSec);

  if (phase === 'card') S.cardScene(c, st);
  else if (phase === 'play') (game === 'seino' ? S.seino : S.daruma)(c, st);
  else if (phase === 'reveal') (st.last.spread !== undefined ? S.seinoReveal : S.darumaReveal)(c, st);
  else S.idle(c, st);

  fx.draw(c);
  S.roster(c, st);
  // 札は参加者一覧より後。暗転を一部のレイヤーだけに掛けると重ねただけに見える
  if (phase === 'card') S.cardOver(c, st);
  c.restore();

  if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + (flash * .5) + ')'; c.fillRect(0, 0, W, H); }
  if (wipe > 0) {
    const k = E.outCubic(wipe);
    c.fillStyle = PAL.ink;
    c.fillRect(0, 0, W, H * .52 * k);
    c.fillRect(0, H - H * .52 * k, W, H * .52 * k);
  }
}

function updateDaruma() {
  const t = now();
  st.watching = false; st.chant = null;
  for (const ch of g.chants) {
    if (t >= ch.start && !g.fired.has('s' + ch.start)) { g.fired.add('s' + ch.start); Snd.sfx('chant'); }
    if (t >= ch.turnAt && !g.fired.has('t' + ch.turnAt)) {
      g.fired.add('t' + ch.turnAt); Snd.sfx('turn'); shake = 13; hitStop = .1;
    }
    if (t >= ch.start && t < ch.watchUntil) {
      st.watching = t >= ch.turnAt;
      st.chant = st.watching ? null : (t - ch.start) / (ch.turnAt - ch.start);
      break;
    }
  }
  for (const p of players) {
    const spans = g.spans[p.id] || [];
    let held = 0; p.moving = false;
    for (const [a, b] of spans) { held += (b === null ? t : b) - a; if (b === null) p.moving = true; }
    p.dist = Math.min(g.goal, held / 1000 * g.speed);
    p.poseName = p.moving ? (st.watching ? 'shock' : 'walk') : 'idle';
    if (p.moving && !st.watching && Math.random() < .25) {
      const L = S.LANES[p.id % S.LANES.length];
      const x = S.D_X0 + (S.D_X1 - S.D_X0) * (p.dist / g.goal) + L.dx;
      fx.burst(x - 20, L.y, { n: 1, color: ['#E7D2B0'], speed: 80, size: 6 * L.scale,
        kind: 'dot', life: .35, grav: 240 });
    }
  }
}

requestAnimationFrame(loop);
})();
