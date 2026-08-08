/* qa-shots のコンタクトシートを1枚に合成する（レビュー効率化用） */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const OUT = path.resolve(__dirname, '..', 'qa-shots');
(async () => {
  const pat = process.argv[2] || 'g-';
  const files = fs.readdirSync(OUT).filter(f => f.startsWith(pat) && f.endsWith('.png')).sort();
  const cells = files.map(f => `<figure><img src="${f}"><figcaption>${f.replace(/\.png$/,'')}</figcaption></figure>`).join('');
  const html = `<style>body{margin:0;background:#111;font:12px monospace;color:#ccc;
    display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px}
    figure{margin:0}img{width:100%;display:block;border-radius:4px}
    figcaption{padding:2px 4px}</style>${cells}`;
  fs.writeFileSync(path.join(OUT, '_sheet.html'), html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 400 } });
  await p.goto('file://' + path.join(OUT, '_sheet.html'));
  await p.screenshot({ path: path.join(OUT, '_sheet.png'), fullPage: true });
  await b.close();
  console.log('wrote', path.join(OUT, '_sheet.png'), files.length, 'cells');
})();
