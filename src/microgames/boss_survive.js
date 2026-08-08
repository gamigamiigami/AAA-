/* BOSS: たえろ！ — 3段階の攻撃をかいくぐって生き延びる。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'boss_survive',
    verb: 'たえろ！',
    verbEn: 'SURVIVE!',
    control: 'move2',
    beats: 16,
    boss: true,
    defaultResult: 'win',
    bg: ['#7b2fbe', '#6d24ad'],
    style: 'toon',

    create: function (c) {
      var area = { x: 70, y: 120, w: c.W - 140, h: 340 };
      var hero = { x: c.W / 2, y: area.y + area.h - 50, r: 15, trail: [] };
      var boss = { x: c.W / 2, y: 176, r: 62, rage: 0, hitPop: 0, angry: 0 };
      var bullets = [];
      var phase = 0, phaseT = 0, wave = 0;
      var spdK = [1, 1.14, 1.3][c.diff - 1];

      function spawn(x, y, ang, sp, r, col) {
        bullets.push({
          x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          r: r || 12, col: col || GG.PAL.ai, t: 0
        });
      }

      return {
        update: function (dt) {
          boss.hitPop = Math.max(0, boss.hitPop - dt * 3);
          boss.x = c.W / 2 + Math.sin(c.t * 1.1) * 190;
          boss.angry = U.sat(c.progress * 1.4);

          hero.trail.unshift({ x: hero.x, y: hero.y });
          if (hero.trail.length > 8) hero.trail.pop();

          if (!c.result) {
            c.input.steer2D(hero, {
              x: area.x + 16, y: area.y + 16, w: area.w - 32, h: area.h - 32
            }, 405, dt);
          }

          phaseT += dt;
          var p = c.progress;
          var newPhase = p < 0.33 ? 0 : (p < 0.68 ? 1 : 2);
          if (newPhase !== phase) {
            phase = newPhase; phaseT = 0; wave = 0;
            boss.hitPop = 1;
            c.sfx('boss'); c.shake(10, 0.3); c.flash(0.16, GG.PAL.shu);
          }

          if (!c.result) {
            var i;
            if (phase === 0) {
              // ばらまき
              if (phaseT > wave * 0.52) {
                wave++;
                for (i = 0; i < 3; i++) {
                  spawn(boss.x, boss.y + 40,
                    Math.PI / 2 + (i - 1) * 0.42 + c.rng.range(-0.12, 0.12),
                    230 * spdK, 13, GG.PAL.ai);
                }
                c.sfx('blip');
              }
            } else if (phase === 1) {
              // 扇状の弾幕
              if (phaseT > wave * 0.72) {
                wave++;
                var off = c.rng.range(0, 0.5);
                for (i = 0; i < 7; i++) {
                  spawn(boss.x, boss.y + 40,
                    Math.PI / 2 + (i - 3) * 0.28 + off, 210 * spdK, 12, GG.PAL.murasaki);
                }
                c.sfx('blip');
              }
            } else {
              // 追尾つきの十字
              if (phaseT > wave * 0.58) {
                wave++;
                var a = Math.atan2(hero.y - boss.y, hero.x - boss.x);
                for (i = -1; i <= 1; i++) {
                  spawn(boss.x, boss.y + 40, a + i * 0.2, 275 * spdK, 12, GG.PAL.shu);
                }
                for (i = 0; i < 4; i++) {
                  spawn(boss.x, boss.y + 40, Math.PI / 2 + i * 1.57 + c.t, 175 * spdK, 11, GG.PAL.ai);
                }
                c.sfx('blip');
              }
            }
          }

          for (var k = bullets.length - 1; k >= 0; k--) {
            var b = bullets[k];
            b.t += dt;
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (b.x < -60 || b.x > c.W + 60 || b.y < -60 || b.y > c.H + 60) {
              bullets.splice(k, 1); continue;
            }
            if (!c.result && U.circHit(hero.x, hero.y, hero.r * 0.75, b.x, b.y, b.r * 0.8)) {
              c.sfx('hit'); c.shake(18, 0.45); c.flash(0.35, GG.PAL.shu);
              c.fx.burst(hero.x, hero.y, { n: 26, color: [GG.PAL.shu, '#fff'], speed: 380, size: 9 });
              c.lose(); return;
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          // アリーナ
          ctx.save();
          ctx.globalAlpha = 1;
          g.block(area.x - 14, area.y - 14, area.w + 28, area.h + 28, '#c19a66', { r: 14, lw: 3 });
          ctx.restore();
          ctx.save();
          ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
          ctx.fillStyle = GG.PAL.paper; ctx.fillRect(area.x, area.y, area.w, area.h);
          ctx.restore();

          // ボス
          ctx.save();
          ctx.translate(boss.x, boss.y);
          var s = 1 + boss.hitPop * 0.18 + Math.sin(c.t * 4) * 0.03;
          ctx.scale(s, 2 - s);
          ctx.rotate(Math.sin(c.t * 1.7) * 0.07);
          // 触手
          for (var i = 0; i < 6; i++) {
            var a = -0.3 + i * 0.32;
            ctx.save();
            ctx.rotate(a + Math.sin(c.t * 3 + i) * 0.14);
            g.rr(-7, 40, 14, 56, 7).ink('#8b6fb0', 2.6);
            ctx.restore();
          }
          g.circlePath(0, 0, boss.r).ink(U.shade('#6b5a9e', boss.angry * 0.12), 3.4);
          ctx.save();
          g.circlePath(0, 0, boss.r); ctx.clip();
          g.ellipsePath(-boss.r * 0.32, -boss.r * 0.36, boss.r * 0.3, boss.r * 0.19, -0.4)
            .fill('rgba(255,255,255,0.4)');
          ctx.restore();
          // 顔
          g.eyes(0, -6, 24, 13, U.clamp((320 - boss.x) / 300, -1, 1), 0.4, false);
          ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-32, -30); ctx.lineTo(-12, -20);
          ctx.moveTo(32, -30); ctx.lineTo(12, -20);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 40, 20, Math.PI + 0.3, -0.3);
          ctx.stroke();
          ctx.restore();

          // 弾
          for (var k = 0; k < bullets.length; k++) {
            var b = bullets[k];
            ctx.save();
            ctx.globalAlpha = 0.3;
            g.circlePath(b.x - b.vx * 0.02, b.y - b.vy * 0.02, b.r * 1.5).fill(b.col);
            ctx.globalAlpha = 1;
            g.circlePath(b.x, b.y, b.r).ink(b.col, 3);
            g.circlePath(b.x - b.r * 0.28, b.y - b.r * 0.3, b.r * 0.3).fill('rgba(255,255,255,0.6)');
            ctx.restore();
          }

          // 残像
          for (var t = hero.trail.length - 1; t >= 0; t--) {
            ctx.save();
            ctx.globalAlpha = 0.06 * (1 - t / hero.trail.length) * 4;
            g.circlePath(hero.trail[t].x, hero.trail[t].y, hero.r * (1 - t * 0.06)).fill(GG.PAL.yamabuki);
            ctx.restore();
          }
          A.blob(g, {
            x: hero.x, y: hero.y, r: hero.r + 8, color: GG.PAL.yamabuki, feet: false,
            mouth: c.result === 'lose' ? 'sad' : 'o'
          });
          // 判定点を明示（弾幕の礼儀）
          g.circlePath(hero.x, hero.y, 4).fill(GG.PAL.paper);

          // 進行ゲージ
          A.gauge(g, c.W / 2 - 200, 78, 400, 22, 1 - c.progress, GG.PAL.shu);
          
        }
      };
    }
  });
})(window.GG);
