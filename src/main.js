/* MICRO MANIA — main.js
 * ブート。キャンバスのレターボックス調整と固定タイムステップのループだけを持つ。 */
(function (GG) {
  'use strict';

  var W = GG.VIEW_W, H = GG.VIEW_H;
  var STEP = 1 / 60;

  function boot() {
    var canvas = document.getElementById('screen');
    var stage = document.getElementById('stage');

    var audio = GG.provide('audio', new GG.Audio());
    var input = GG.provide('input', new GG.Input());
    input.attach(canvas);

    var game = GG.provide('game', new GG.Game(canvas, audio, input));

    var dpr = 1;
    function resize() {
      var vw = window.innerWidth, vh = window.innerHeight;
      var scale = Math.min(vw / W, vh / H);
      var cw = Math.floor(W * scale), ch = Math.floor(H * scale);
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      game.dpr = dpr;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      input.map = function (cx, cy, rect) {
        return { x: cx / rect.width * W, y: cy / rect.height * H };
      };
    }
    window.addEventListener('resize', resize);
    resize();

    // 最初のユーザー操作でオーディオを起こす
    function wake() { audio.init(); }
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });

    var last = performance.now(), acc = 0;
    function frame(now) {
      var dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;          // タブ復帰時のスパイクを潰す
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard++ < 6) {
        game.update(STEP);
        acc -= STEP;
      }
      game.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // QA/デバッグ用フック（本番プレイには影響しない）
    GG.debug = {
      game: game,
      jump: function (id, diff) {
        var def = GG.microgame(id);
        if (!def) throw new Error('no such microgame: ' + id);
        audio.init();
        game.startRun();
        game._forceDef = def;
        game._forceDiff = diff || 1;
        game.nextMicrogame();
      },
      free: function () { game._forceDef = null; game._forceDiff = 0; },
      list: function () { return GG.MICROGAMES.map(function (d) { return d.id; }); }
    };
    document.body.classList.add('ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})(window.GG = window.GG || {});
