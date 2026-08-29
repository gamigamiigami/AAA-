/* 一斉 — 音の検証。
 *
 * 音は聞けない環境で作っている。だから「良い曲になったはず」で
 * 終わらせず、実際にブラウザで鳴らして解析器で測る。
 * ここで確かめるのは音楽性ではなく、設計が意図どおり動いているか ——
 * 場面で厚みが変わるか、いちばん大事な瞬間に本当に無音になるか。
 *
 * 実行: node issei/test-sound.js
 */
'use strict';

const PAGE = "<!doctype html><meta charset=\"utf-8\"><body>\n<script src=\"/sound.js\"></script>\n<script>\nwindow.LOG = [];\nwindow.go = async function () {\n  const ctx = Snd.init();\n  await ctx.resume();\n  // \u30de\u30b9\u30bf\u30fc\u306b\u89e3\u6790\u5668\u3092\u3076\u3089\u4e0b\u3052\u3066\u3001\u5b9f\u969b\u306b\u51fa\u3066\u3044\u308b\u97f3\u306e\u5927\u304d\u3055\u3092\u6e2c\u308b\n  const an = ctx.createAnalyser(); an.fftSize = 2048;\n  Snd.master.connect(an);\n  const buf = new Float32Array(an.fftSize);\n  const freq = new Float32Array(an.frequencyBinCount);\n  // \u4f4e\u57df\u306e\u30a8\u30cd\u30eb\u30ae\u30fc\u3002\u30ad\u30c3\u30af\u306e\u6709\u7121\uff1d\u5834\u9762\u306e\u539a\u307f\u306e\u5dee\u304c\u3053\u3053\u306b\u51fa\u308b\n  const lowBand = () => { an.getFloatFrequencyData(freq);\n    const hz = ctx.sampleRate / 2 / freq.length;\n    let s = 0, n = 0;\n    for (let i = 0; i < freq.length; i++) {\n      if (i * hz > 200) break;\n      s += Math.pow(10, freq[i] / 20); n++;\n    }\n    return s / n; };\n  const rms = () => { an.getFloatTimeDomainData(buf);\n    let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };\n\n  /* \u5e73\u5747\u3068\u7d42\u308f\u308a\u969b\u306e\u4e21\u65b9\u3092\u53d6\u308b\u3002\u77ac\u9593\u5024\u3060\u3051\u3060\u3068\u3001\u5c0f\u7bc0\u306e\u3069\u3053\u3092\u63b4\u3093\u3060\u304b\u3067\n     \u5024\u304c\u8df3\u306d\u308b\u3002\u30d5\u30a7\u30fc\u30c9\u306e\u5224\u5b9a\u306b\u306f\u7d42\u308f\u308a\u969b\u3001\u539a\u307f\u306e\u5224\u5b9a\u306b\u306f\u5e73\u5747\u3092\u4f7f\u3046\u3002 */\n  const sample = (label, ms) => new Promise(r => {\n    const t0 = performance.now(); const all = [], tail = [], low = [];\n    const id = setInterval(() => {\n      const v = rms(), el = performance.now() - t0;\n      all.push(v); low.push(lowBand());\n      if (el > ms - 300) tail.push(v);\n      if (el > ms) { clearInterval(id);\n        const av = a2 => a2.reduce((x, y) => x + y, 0) / a2.length;\n        LOG.push([label, +av(all).toFixed(5), +av(tail).toFixed(5), +av(low).toFixed(6)]); r(); }\n    }, 20);\n  });\n\n  Snd.mood('lobby');  await sample('lobby', 3000);\n  Snd.mood('play');   await sample('play', 3000);\n  Snd.hush(1.4);      await sample('hush\u4e2d', 1150);\n                      await sample('hush\u660e\u3051', 2200);\n  Snd.mood('off');    await sample('off', 800);\n  window.DONE = true;\n};\n</script></body>\n";

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'public');
const srv=http.createServer((q,s)=>{
  const u=q.url.split('?')[0];
  if(u==='/sound-test.html'){s.writeHead(200,{'content-type':'text/html'});return s.end(PAGE);}
  const f=path.join(ROOT,u.replace(/^\/public/,''));
  if(!fs.existsSync(f)){s.writeHead(404);return s.end();}
  s.writeHead(200,{'content-type':u.endsWith('.js')?'text/javascript':'text/html'});
  s.end(fs.readFileSync(f));
});
(async()=>{await new Promise(r=>srv.listen(3995,'127.0.0.1',r));
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const pg=await b.newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://127.0.0.1:3995/sound-test.html');
await pg.evaluate(()=>window.go());
await pg.waitForFunction(()=>window.DONE,{timeout:30000});
const log=await pg.evaluate(()=>window.LOG);
console.log('\n  場面ごとの音量（平均 / 終わり際）');
for(const [k,m,t,lo] of log) console.log('   ', k.padEnd(10), m.toFixed(5), t.toFixed(5), 'ドラム'+lo.toFixed(5), '#'.repeat(Math.round(m*700)));
const g=Object.fromEntries(log.map(([k,m,t,lo])=>[k,{m,t,lo}]));
const checks = [
  ['待ち受けが鳴っている',      g['lobby'].m > 0.002],
  ['本番だけドラムが入る',      g['play'].lo > g['lobby'].lo * 1.6],
  ['hush中は無音',              g['hush中'].t < g['play'].m * 0.10],
  ['hush明けに戻る',            g['hush明け'].m > g['play'].m * 0.4],
  ['off で止まる',              g['off'].t < 0.004]
];
for(const [name,ok] of checks) console.log('   ', ok?'OK  ':'NG  ', name);
const ok = checks.every(c=>c[1]);
console.log('\n   旋律の音数        ', await pg.evaluate(()=>Snd.MOTIF.length), '音 /',
            await pg.evaluate(()=>new Set(Snd.MOTIF.map(m=>m.n)).size), '種類');
console.log('   場面ごとのBPM     ', await pg.evaluate(()=>Object.entries(Snd.MOOD).map(([k,v])=>k+':'+v.bpm).join('  ')));
console.log('   エラー            ', errs.length?errs.join(' / '):'(なし)');
console.log('\n  '+(ok&&!errs.length?'PASS — 待ち受け<本番、hush中は無音、明けたら戻る':'FAIL')+'\n');
await b.close();srv.close();process.exit(ok&&!errs.length?0:1);})();
