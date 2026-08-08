/* MICRO MANIA — core/registry.js
 * ランタイムレジストリ。モジュール同士は互いの実装を直接掴まず、
 * ここを経由して疎結合にアクセスする（ARCHITECTURE.md 1章の規約）。 */
(function (GG) {
  'use strict';

  GG.VIEW_W = 960;
  GG.VIEW_H = 540;

  /* アートディレクション: 縁日／和のポップ。
   * 「暗いネオングラデ + 太い黒フチ + 放射線 + ツヤ」= 西洋のモバイルゲーム語彙なので使わない。
   * 高明度・低彩度の和色をフラットに置き、線は細く、墨は真っ黒にしない。 */
  GG.PAL = {
    ink:      '#403a48',   // 墨（純黒は使わない）
    inkSoft:  'rgba(64,58,72,0.55)',
    paper:    '#fbf6ec',   // 白練
    kinari:   '#f5ecd9',   // 生成り
    shu:      '#e2584a',   // 朱
    kobai:    '#ef9aa6',   // 紅梅
    ai:       '#31608c',   // 藍
    asagi:    '#4fa9b4',   // 浅葱
    mizu:     '#9ad2da',   // 水色
    wakaba:   '#7fab63',   // 若葉
    yamabuki: '#eeb43c',   // 山吹
    kuchiba:  '#dc9350',   // 朽葉
    fuji:     '#8f8ac2',   // 藤
    murasaki: '#6b5a9e',   // 紫
    sumire:   '#c9a6d8'    // 菫
  };

  var services = Object.create(null);
  GG.provide = function (name, obj) { services[name] = obj; return obj; };
  GG.get = function (name) {
    if (!(name in services)) throw new Error('service not provided: ' + name);
    return services[name];
  };
  GG.has = function (name) { return name in services; };

  // --- ミニゲーム登録 -------------------------------------------------
  GG.MICROGAMES = [];
  var byId = Object.create(null);

  var CONTROL_HINT = {
    move:  { icon: 'pad',   label: '← → で うごかす',       labelTouch: 'ドラッグで うごかす' },
    move2: { icon: 'pad4',  label: '↑↓←→ で うごかす',      labelTouch: 'ドラッグで うごかす' },
    press: { icon: 'btn',   label: 'スペース / クリック',    labelTouch: 'タップ' },
    hold:  { icon: 'hold',  label: '押しっぱなし',           labelTouch: '長押し' },
    mash:  { icon: 'mash',  label: 'れんだ！',               labelTouch: 'れんだ！' },
    aim:   { icon: 'aim',   label: 'ねらって クリック',      labelTouch: 'ねらって タップ' },
    dir:   { icon: 'pad4',  label: '↑↓←→ を えらぶ',        labelTouch: 'スワイプ' },
    pick:  { icon: 'aim',   label: 'えらんで クリック',      labelTouch: 'えらんで タップ' }
  };
  GG.CONTROL_HINT = CONTROL_HINT;

  GG.reg = function (def) {
    if (!def || !def.id) throw new Error('microgame needs an id');
    if (byId[def.id]) throw new Error('duplicate microgame id: ' + def.id);
    if (typeof def.create !== 'function') throw new Error('microgame needs create(): ' + def.id);
    if (!CONTROL_HINT[def.control]) throw new Error('unknown control: ' + def.control);
    def.beats = def.beats || 8;
    def.boss = !!def.boss;
    def.defaultResult = def.defaultResult || 'lose';
    def.bg = def.bg || ['#4a4e9e', '#2b2b57'];
    byId[def.id] = def;
    GG.MICROGAMES.push(def);
    return def;
  };
  GG.microgame = function (id) { return byId[id]; };

})(window.GG = window.GG || {});
