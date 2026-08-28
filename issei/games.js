/* 一斉 — ミニゲームの中身。サーバーから使う。
 *
 * どのゲームも守る規約:
 *   - 判定は必ず「端末が押した時刻」で行う。到着時刻は絶対に見ない。
 *   - 入力中に開示してよいのは人数だけ。誰が速いかは出さない。
 */
'use strict';

const BEAT = 500;   // 120 BPM

// =====================================================================
// せーの — 全員が同じ瞬間に押す。ばらつきが規定内なら全員成功（協力）
// =====================================================================
const seino = {
  id: 'seino',
  verb: 'せーの！',
  hint: '全員で 同じ 瞬間に おす',
  control: 'tap',
  countIn: 4,
  collectMs: 1500,
  spreadOk: 80,

  /** 目標時刻を1つ置くだけ */
  setup(now) {
    return { target: now + 4 * BEAT, endsAt: now + 4 * BEAT + this.collectMs };
  },

  /** tap: { at } — サーバー時刻に変換済みの押下時刻 */
  accept(g, id, ev) {
    if (typeof ev.at !== 'number' || g.presses[id] !== undefined) return false;
    g.presses[id] = ev.at;
    return true;
  },

  judge(g, players) {
    const entries = players.map(p => ({
      id: p.id, name: p.name, shape: p.shape, color: p.color,
      error: g.presses[p.id] === undefined ? null : Math.round(g.presses[p.id] - g.target)
    }));
    const hits = entries.filter(e => e.error !== null).map(e => e.error);

    let spread = null, success = false;
    if (hits.length >= 2) {
      const mean = hits.reduce((a, b) => a + b, 0) / hits.length;
      spread = Math.round(Math.sqrt(hits.reduce((a, b) => a + (b - mean) ** 2, 0) / hits.length));
      success = spread <= this.spreadOk && hits.length === entries.length;
    } else if (hits.length === 1 && entries.length === 1) {
      spread = 0;
      success = Math.abs(hits[0]) <= this.spreadOk;
    }

    entries.sort((a, b) => a.error === null ? 1 : b.error === null ? -1
      : Math.abs(a.error) - Math.abs(b.error));

    // 協力ゲームなので、成功なら全員が得点する
    const winners = success ? entries.map(e => e.id) : [];
    return { entries, spread, success, winners, threshold: this.spreadOk };
  }
};

// =====================================================================
// だるまさんがころんだ — 押している間だけ前進。振り向いた瞬間に押していたら脱落
//
// ルール説明が要らないのが最大の強み。判定の基準が掛け声（音）なので、
// メイン画面から全員に同時に届き、遅延が原理的に効かない。
// =====================================================================
const daruma = {
  id: 'daruma',
  verb: 'だるまさんが ころんだ',
  hint: 'おしてる あいだ すすむ / ふりむいたら はなす',
  control: 'hold',
  collectMs: 1200,
  /* ゴールは「安全に稼げる時間」より遠くに置く。近すぎると危険を冒す理由がなくなり、
   * 全員が余裕をもって完走してしまって駆け引きが消える（実際に一度そうなった）。
   * 掛け声から安全に取れるのは合計12秒ほどなので、必要8秒＝粘らないと届かない距離にする。 */
  goal: 240,          // 到達すべき距離
  speed: 30,          // 距離 / 秒。goal/speed = 8秒ぶん押せば到達

  setup(now, rng) {
    const chants = [];
    let t = now + 1200;                    // 最初の一呼吸
    const until = now + 26000;             // 上限26秒
    while (t < until) {
      // 掛け声の長さを毎回変えるのが、このゲームの難易度そのもの。
      // 「だるまさんがぁぁぁ…ころんだ！」と溜めたり早口にしたりする。
      const chant = 900 + rng() * 2600;
      const watch = 700 + rng() * 900;     // 振り向いて見ている時間
      chants.push({ start: t, turnAt: t + chant, watchUntil: t + chant + watch });
      t += chant + watch + 250;
    }
    return { chants, endsAt: until + this.collectMs, goal: this.goal, speed: this.speed };
  },

  /** hold: { t, down } — 押し始め / 離した瞬間を、それぞれサーバー時刻で送る */
  accept(g, id, ev) {
    if (typeof ev.t !== 'number' || typeof ev.down !== 'boolean') return false;
    (g.events[id] = g.events[id] || []).push({ t: ev.t, down: ev.down });
    return true;
  },

  /* 押下の区間を時系列に組み直して、区間が監視窓に重なったら脱落。
   * 表示は遅れてもよいが、判定はここで時刻から作り直すので遅延に影響されない。 */
  judge(g, players) {
    const entries = [];
    for (const p of players) {
      const evs = (g.events[p.id] || []).slice().sort((a, b) => a.t - b.t);

      // 押下区間を作る（閉じていない最後の区間は endsAt で閉じる）
      const spans = [];
      let openAt = null;
      for (const e of evs) {
        if (e.down && openAt === null) openAt = e.t;
        else if (!e.down && openAt !== null) { spans.push([openAt, e.t]); openAt = null; }
      }
      if (openAt !== null) spans.push([openAt, g.endsAt]);

      // いつ捕まったか
      let caughtAt = null;
      for (const ch of g.chants) {
        for (const [a, b] of spans) {
          if (a < ch.watchUntil && b > ch.turnAt) { caughtAt = ch.turnAt; break; }
        }
        if (caughtAt !== null) break;
      }

      // 捕まるまでに押していた合計時間が距離になる
      let held = 0, finishedAt = null;
      const need = g.goal / g.speed * 1000;
      for (const [a, b] of spans) {
        const end = caughtAt === null ? b : Math.min(b, caughtAt);
        if (end <= a) continue;
        if (finishedAt === null && held + (end - a) >= need) {
          finishedAt = a + (need - held);
        }
        held += end - a;
      }

      entries.push({
        id: p.id, name: p.name, shape: p.shape, color: p.color,
        dist: Math.min(g.goal, Math.round(held / 1000 * g.speed)),
        caught: caughtAt !== null,
        finishedAt: caughtAt !== null ? null : finishedAt
      });
    }

    // ゴールした人が勝ち。誰も届かなければ、捕まらずに一番進んだ人。
    const finished = entries.filter(e => e.finishedAt !== null)
      .sort((a, b) => a.finishedAt - b.finishedAt);
    let winners;
    if (finished.length) {
      winners = [finished[0].id];
    } else {
      const alive = entries.filter(e => !e.caught).sort((a, b) => b.dist - a.dist);
      winners = alive.length && alive[0].dist > 0 ? [alive[0].id] : [];
    }

    entries.sort((a, b) => {
      if ((a.finishedAt === null) !== (b.finishedAt === null)) return a.finishedAt === null ? 1 : -1;
      if (a.finishedAt !== null) return a.finishedAt - b.finishedAt;
      if (a.caught !== b.caught) return a.caught ? 1 : -1;
      return b.dist - a.dist;
    });

    return { entries, winners, success: winners.length > 0, goal: g.goal };
  }
};

module.exports = { BEAT, seino, daruma, ALL: [seino, daruma] };
