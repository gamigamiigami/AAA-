/* MICRO MANIA — core/registry.js
 * ランタイムレジストリ。モジュール同士は互いの実装を直接掴まず、
 * ここを経由して疎結合にアクセスする（ARCHITECTURE.md 1章の規約）。 */
(function (GG) {
  'use strict';

  GG.VIEW_W = 960;
  GG.VIEW_H = 540;

  /* アートディレクション: メイドインワリオ系の「ベタ塗り原色 + 太い黒フチ + 白背景」。
   *
   * 要点は 3 つ。
   *  1. グラデーションで立体を作らない。ベタ塗りと 2 階調の影で作る。
   *  2. 輪郭線は太い黒。彩度は落とさず、原色をそのまま置く。
   *  3. ミニゲームごとに画風を変える（ドット絵・粘土・紙工作…）。
   *     統一された 1 つの絵柄を持たないこと自体がこのジャンルの様式。
   *
   * キー名は前の和色版から引き継いでいる（全ミニゲームの参照を壊さないため）。
   */
  GG.PAL = {
    ink:      '#151515',   // 輪郭線。ほぼ黒
    inkSoft:  'rgba(21,21,21,0.5)',
    paper:    '#ffffff',
    kinari:   '#fdfdfd',
    shu:      '#e8112d',   // 赤
    kobai:    '#ff6699',   // 桃
    ai:       '#0b64c8',   // 青
    asagi:    '#00b4e6',   // 水
    mizu:     '#7fd8f0',   // 淡水
    wakaba:   '#22b14c',   // 緑
    yamabuki: '#ffd400',   // 黄
    kuchiba:  '#ff8000',   // 橙
    fuji:     '#9a6fd8',   // 藤
    murasaki: '#7b2fbe',   // 紫
    sumire:   '#d2a8ee'    // 淡紫
  };

  /* ミニゲームが宣言できる画風。質感はポストエフェクトで一括して掛かるので、
   * ミニゲーム側は 1 行 style を書くだけでよい。 */
  GG.STYLES = ['toon', 'pixel', 'clay', 'paper', 'sketch', 'retro'];

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
    press: { icon: 'btn',   label: 'スペース か クリック',    labelTouch: 'タップ' },
    hold:  { icon: 'hold',  label: 'ボタン ながおし',         labelTouch: '長おし' },
    mash:  { icon: 'mash',  label: 'ボタン れんだ',           labelTouch: 'タップ れんだ' },
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
    def.bg = def.bg || ['#ffffff', '#ededed'];
    def.style = def.style || 'toon';
    if (GG.STYLES.indexOf(def.style) < 0) throw new Error('unknown style: ' + def.style);
    byId[def.id] = def;
    GG.MICROGAMES.push(def);
    return def;
  };
  GG.microgame = function (id) { return byId[id]; };

})(window.GG = window.GG || {});
