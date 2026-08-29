/* 一斉 — 端末側の共通部品。時計合わせ・通信・識別・散布軸。
 * メイン画面とスマホの両方から読む。 */
'use strict';

const GG = {};

// ---------------------------------------------------------------- 時計合わせ
/* 各往復から「offset はこの範囲にいる」という区間を1つ得て、
 * それを全部重ね合わせて絞り込む（NTP と同じ区間交差の考え方）。
 *
 * これが全体の土台。ここが合っていれば、通信がどれだけ遅くても
 * 「押した瞬間」を全端末で同じ物差しに乗せられる。 */
GG.clock = {
  offset: 0,          // serverTime = performance.now() + offset
  rtt: 0,
  ready: false,
  rows: [],           // これまでの全標本。往復が速いものほど価値が高い

  async sync(samples = 20) {
    let rows = [];
    for (let i = 0; i < samples; i++) {
      const t0 = performance.now();
      let t1;
      try {
        t1 = (await (await fetch('/api/time')).json()).t1;
      } catch (_) { continue; }
      const t2 = performance.now();
      rows.push({ t0, t1, t2, rtt: t2 - t0 });
      await new Promise(r => setTimeout(r, 30));
    }
    if (!rows.length) return false;
    this.rows = this.rows.concat(rows).sort((a, b) => a.rtt - b.rtt).slice(0, 80);
    this.estimate();
    return true;
  },

  /* 各標本は offset の取りうる区間を1つ与える。
   *   t1 = t0 + d1 + offset  (d1 >= 0)  →  offset <= t1 - t0
   *   t2 = t1 + d2 - offset  (d2 >= 0)  →  offset >= t1 - t2
   * つまり offset は [t1-t2, t1-t0] の中にいる。
   * 全標本の区間を重ね合わせると、標本を選ぶ方式より原理的に狭く絞れる。 */
  estimate() {
    let lo = -Infinity, hi = Infinity;
    for (const r of this.rows) {
      lo = Math.max(lo, r.t1 - r.t2);
      hi = Math.min(hi, r.t1 - r.t0);
    }
    if (lo <= hi) {
      this.offset = (lo + hi) / 2;
      this.bound = Math.round((hi - lo) / 2);   // 残っている不確かさ
    } else {
      // 時計の進み方の差などで区間が交わらない場合は、最小RTTの標本に頼る
      const r = this.rows[0];
      this.offset = r.t1 - (r.t0 + r.t2) / 2;
      this.bound = Math.round(r.rtt / 2);
    }
    this.rtt = Math.round(this.rows[0].rtt);
    this.ready = true;
  },

  /* 遅い回線ほど時計合わせの誤差が大きくなるが、標本は多いほど良くなる。
   * 起動時に何十回も測ると待たせてしまうので、遊んでいる間に裏で測り足す。
   * 12分のセッションなら数百標本たまり、最初の推定より確実に良くなる。 */
  startRefining(everyMs = 4000) {
    setInterval(() => this.sync(1), everyMs);
  },

  /** 端末のいまをサーバー時刻で表した値 */
  nowServer() { return performance.now() + this.offset; },

  /** サーバー時刻を端末のいまからの残り時間（ms）に変換 */
  until(serverTime) { return serverTime - this.nowServer(); }
};

// ---------------------------------------------------------------- 通信
GG.net = {
  onState: null,

  listen(id, lag) {
    const q = new URLSearchParams();
    if (id) q.set('id', id);
    if (lag) q.set('lag', lag);
    const es = new EventSource('/api/events?' + q);
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.partial) { if (this.onPressed) this.onPressed(ev.pressed, ev.live); return; }
      if (ev.type === 'state' && this.onState) this.onState(ev);
    };
    return es;
  },

  post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(r => r.json()).catch(() => null);
  }
};

// ---------------------------------------------------------------- 識別
/* 30色は識別できないので、形を主・色を従にする。色覚多様性にも効く。 */
GG.drawShape = function (c, shape, color, x, y, r, opt) {
  opt = opt || {};
  c.save();
  c.translate(x, y);
  c.beginPath();
  const TAU = Math.PI * 2;
  switch (shape) {
    case 'circle':
      c.arc(0, 0, r, 0, TAU); break;
    case 'square':
      c.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64); break;
    case 'triangle':
      poly(c, 3, r, -Math.PI / 2); break;
    case 'pentagon':
      poly(c, 5, r, -Math.PI / 2); break;
    case 'hexagon':
      poly(c, 6, r, -Math.PI / 2); break;
    case 'diamond':
      poly(c, 4, r, -Math.PI / 2); break;
    case 'star':
      starPath(c, r, r * 0.45, 5); break;
    case 'crown':
      starPath(c, r, r * 0.5, 3); break;
    case 'heart': {
      const s = r / 16;
      c.moveTo(0, 12 * s);
      c.bezierCurveTo(-16 * s, 0, -10 * s, -14 * s, 0, -6 * s);
      c.bezierCurveTo(10 * s, -14 * s, 16 * s, 0, 0, 12 * s);
      break;
    }
    case 'moon':
      c.arc(0, 0, r, 0, TAU);
      c.arc(r * 0.45, -r * 0.2, r * 0.85, 0, TAU, true);
      break;
    default:
      c.arc(0, 0, r, 0, TAU);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill(shape === 'moon' ? 'evenodd' : 'nonzero');
  c.lineWidth = Math.max(2, r * 0.16);
  c.strokeStyle = opt.ink || '#141414';
  c.stroke();
  c.restore();

  function poly(c, n, r, rot) {
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * TAU;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
  }
  function starPath(c, ro, ri, n) {
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i / (n * 2) * TAU;
      const rr = i % 2 === 0 ? ro : ri;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
  }
};

// ---------------------------------------------------------------- 散布軸
/* 「ピタリ」「体内時計」「せーの」など、ズレを競うゲーム全部で使い回す共通部品。
 * ゲーム本体より、この一枚の絵の方が体験の本体になる。 */
GG.scatter = function (c, opt) {
  const { x, y, w, entries, range, selfId } = opt;
  const cx = x + w / 2;
  const px = (ms) => cx + Math.max(-1, Math.min(1, ms / range)) * (w / 2 - 24);

  c.save();

  // 軸
  c.strokeStyle = 'rgba(255,255,255,0.28)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke();

  // 目盛り
  c.font = '500 13px ui-monospace, monospace';
  c.textAlign = 'center';
  for (const ms of [-range, -range / 2, 0, range / 2, range]) {
    const gx = px(ms);
    c.strokeStyle = ms === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)';
    c.lineWidth = ms === 0 ? 3 : 1.5;
    c.beginPath(); c.moveTo(gx, y - (ms === 0 ? 22 : 10)); c.lineTo(gx, y + (ms === 0 ? 22 : 10)); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.fillText((ms > 0 ? '+' : '') + ms, gx, y + 40);
  }
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.textAlign = 'left';  c.fillText('はやい', x, y - 44);
  c.textAlign = 'right'; c.fillText('おそい', x + w, y - 44);

  // 同じ位置に重なると読めないので、近い点は縦に積む
  const placed = [];
  const hit = entries.filter(e => e.error !== null)
    .slice().sort((a, b) => a.error - b.error);
  for (const e of hit) {
    const gx = px(e.error);
    let row = 0;
    while (placed.some(q => Math.abs(q.x - gx) < 26 && q.row === row)) row++;
    placed.push({ x: gx, row, e });
  }

  for (const q of placed) {
    const gy = y - 22 - q.row * 30;
    const isSelf = selfId && q.e.id === selfId;
    if (isSelf) {
      c.beginPath();
      c.arc(q.x, gy, 22, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fill();
    }
    GG.drawShape(c, q.e.shape, q.e.color, q.x, gy, 12);
  }

  // 押さなかった人
  const miss = entries.filter(e => e.error === null);
  if (miss.length) {
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.font = '500 14px system-ui';
    c.fillText('未入力 ' + miss.length + '人', cx, y + 74);
  }

  c.restore();
};

GG.fmt = (ms) => (ms > 0 ? '+' : '') + ms + 'ms';
