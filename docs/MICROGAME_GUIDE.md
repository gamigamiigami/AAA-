# ミニゲームの書き方

`src/microgames/<id>/game.js` を1本書くための全てです。
**先に `src/microgames/dodge/game.js`（参照実装）と `src/microgames/types.js`（契約）を読んでください。**

---

## 1. 絶対規則

| # | ルール | 理由 |
|---|---|---|
| 1 | 設計空間は **1080×1920（縦）**。プレイヤーが見る・触るものは必ずこの中、かつ HUD が被る `y<190` と `y>1730` を避ける | 端末アスペクトが読めないため。背景（空・地面）だけは `g.full` まで広げてよい |
| 2 | `Math.random()` 禁止。**必ず `ctx.rng`** | 同じシードで同じ展開にならないと、QAが「本当にクリア可能か」を検証できない |
| 3 | 時間の単位は **ビート**。`update(dtBeats, …)` は秒ではなくビートを受け取る | テンポが 118→178 BPM まで上がるので、秒基準の調整は全部崩れる |
| 4 | **レベル1/2/3 を必ず実装し、手触りを変える** | 「同じゲームの速度違い」は不合格。`byLevel()` を使う |
| 5 | **タッチのみ**（tap / swipe / drag / hold） | スマホ片手プレイが前提 |
| 6 | **1秒で理解できること**。何を触るかが文字なしで分かる | 初見・4秒勝負 |
| 7 | 自力で `'win'`/`'lose'` を返すか、`timeoutResult` を設定する | 時間切れの意味を明示しないと進行が壊れる |
| 8 | 色は **必ず `ctx.palette`** から取る | 18本の統一感はここで決まる |
| 9 | 角丸・イージング・演出時間は `design/tokens.js` から取る | 同上 |

---

## 2. ファイルの形

```js
import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'catch',            // フォルダ名と一致
  command: 'キャッチ！',   // 6文字以内。168pxで表示、折り返し禁止
  input: 'drag',          // 'tap' | 'swipe' | 'drag' | 'hold'
  stage: 'town',          // 'town' | 'neon' | 'forest' | 'any'
  lengthBeats: 8,         // 既定8。ボスだけ16
  timeoutResult: 'lose',  // 生き残り系だけ 'win'

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;
    const cfg = byLevel(level, [ {/*L1*/}, {/*L2*/}, {/*L3*/} ]);
    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: 1660 });
    // …状態…
    return {
      update(dt, input, elapsedBeats) { /* 'playing' | 'win' | 'lose' */ },
      draw(g) { backdrop.draw(g, ctx.conductor.beat); /* … */ },
      onResult(won) {},   // 任意
      debugHint() {},     // 任意だが強く推奨（§5）
    };
  },
};
```

**`update(dt, input, elapsedBeats)`**

- `dt <= 0`（ヒットストップ中）は状態を進めない。
- `elapsedBeats` は**命令カード表示中は負**。入力は来ないが `update` は呼ばれるので登場アニメに使える。
- 勝敗を返した後もアニメ継続のため呼ばれ続けるが、戻り値は無視され `input` は空になる。

**`draw(g)`** の1行目は必ず背景。`backdrop.draw()` は内部でキャッシュ済みなので毎フレーム呼んで良い。

---

## 3. 入力

```js
input.taps      // [{x, y}]  短く離したタップ
input.presses   // [{x, y, id}]
input.releases  // [{x, y, id, dx, dy, heldMs}]
input.swipes    // [{x, y, dx, dy, dir:'up'|'down'|'left'|'right', dist}]
input.pointers  // 押しっぱなしの指 [{x, y, sx, sy, dx, dy, vx, vy}]
input.primary   // 最初の指 or null
input.down      // 押されているか
```

座標は全て仮想座標（1080×1920）。フリックは指を離す前に発火します（離すまで待つと遅く感じるため）。

---

## 4. 描画

**全てのソリッドな物体は `g.body()` を通す。** アウトライン・押し出し・陰・グロス・接地影が
一括で付き、18本の質感が揃います。

```js
g.body((gg) => gg.circle(x, y, r), {
  fill: palette.accent,      // 作者が選ぶのはこの1色だけ
  extrude: 12, shade: 0.22, gloss: 0.3,
  lw: STROKE.base, shadow: 0.2, shadowY: 10,
});
```

パス: `rrect / circle / ellipse / capsule / poly / star / blob`
その他: `g.text(…)` `g.face(x, y, {…})` `g.ground(x, y, rx)` `g.sunburst(…)`

**フィードバック** — 触った瞬間に必ず何かが起きること。`fx.burst / ring / puff / shake / freeze / pop`
と `audio.sfx(…)`、そしてスケール変化。**無反応のフレームを作らない。** 外した時ですら
小さなリングと音を返すこと。

使える効果音: `tap cursor select back pop blip coin hit wrong bounce sparkle thud whoosh swipe tick`

---

## 5. `debugHint()`（強く推奨）

QAが「そのゲームが本当にクリア可能か」を機械的に検証するためのフックです。
**いま正しい操作は何か**を返してください。

```js
debugHint() {
  return { type: 'tap', x: target.x, y: target.y };
  // 'drag' {x,y} / 'swipe' {x,y,dx,dy} / 'hold' {x,y} / 'release'
  // 何もすべきでない瞬間は null
}
```

これが無いゲームはランダム入力でしか検証できず、「絶対に勝てないバグ」を見逃します。

---

## 6. 自己チェック

- [ ] `npx tsc --noEmit -p jsconfig.json` が通る
- [ ] `node tools/preview.mjs <id> 1 --shots 4` を実行し、**PNGを自分の目で見た**
- [ ] レベル1と3で**やることが変わる**（速いだけではない）
- [ ] 無操作で放置すると必ず決着する（無限に `'playing'` を返さない）
- [ ] `debugHint()` に従えば勝てる
- [ ] 重要物が `y<190` / `y>1730` に無い
- [ ] `Math.random()` を書いていない
- [ ] パレット外の色をハードコードしていない

登録（`src/microgames/registry.js`）は最後にまとめて行います。
