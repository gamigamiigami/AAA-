/**
 * Single-file bundler.
 *
 * The game ships as plain ES modules, which is ideal for development but needs
 * flattening for two targets: a self-contained dist/index.html, and an Artifact
 * fragment whose host injects its own document skeleton and blocks every
 * external request.
 *
 * There is no npm bundler here on purpose — the project has no dependencies.
 * Instead each module is wrapped in an IIFE and registered in a table, which
 * preserves per-module scope (several modules define their own `TAU`) without
 * needing a real parser. That works because this codebase sticks to static,
 * top-of-file imports and simple named/default exports; the checks below fail
 * loudly if a module ever strays from that.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = 'src';
const ENTRY = 'main.js';
const OUT_DIR = 'dist';

const IMPORT_RE =
  /^[ \t]*import\s+(?:([\w$]+)\s*,\s*)?(?:\{([\s\S]*?)\}|([\w$]+)|\*\s+as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const BARE_IMPORT_RE = /^[ \t]*import\s+['"]([^'"]+)['"];?[ \t]*$/gm;

function resolveSpec(from, spec) {
  if (!spec.startsWith('.')) throw new Error(`bare import not supported: ${spec} (in ${from})`);
  return path
    .normalize(path.join(path.dirname(from), spec))
    .split(path.sep)
    .join('/');
}

/** Rewrite one module into an IIFE body plus its dependency list. */
function transform(id, code) {
  /** @type {string[]} */
  const deps = [];
  let body = code;

  body = body.replace(BARE_IMPORT_RE, (_m, spec) => {
    const dep = resolveSpec(id, spec);
    deps.push(dep);
    return `__mod(${JSON.stringify(dep)});`;
  });

  body = body.replace(IMPORT_RE, (_m, defaultAndNamed, named, defaultOnly, star, spec) => {
    const dep = resolveSpec(id, spec);
    deps.push(dep);
    const ref = `__mod(${JSON.stringify(dep)})`;
    const parts = [];
    const defName = defaultAndNamed || defaultOnly;
    if (defName) parts.push(`const ${defName} = ${ref}.default;`);
    if (star) parts.push(`const ${star} = ${ref};`);
    if (named) {
      const bindings = named
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const m = s.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
          if (!m) throw new Error(`unsupported import binding "${s}" in ${id}`);
          return m[2] ? `${m[1]}: ${m[2]}` : m[1];
        });
      if (bindings.length) parts.push(`const { ${bindings.join(', ')} } = ${ref};`);
    }
    return parts.join(' ');
  });

  /** @type {Set<string>} */
  const exported = new Set();
  let hasDefault = false;

  body = body.replace(/^[ \t]*export\s+default\s+/gm, () => {
    hasDefault = true;
    return 'const __default = ';
  });

  body = body.replace(/^[ \t]*export\s*\{([^}]*)\};?[ \t]*$/gm, (_m, list) => {
    for (const raw of list.split(',')) {
      const s = raw.trim();
      if (!s) continue;
      const m = s.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
      if (!m) throw new Error(`unsupported export binding "${s}" in ${id}`);
      exported.add(m[2] ?? m[1]);
    }
    return '';
  });

  body = body.replace(
    /^[ \t]*export\s+(async\s+)?(function\*?|class|const|let|var)\s+([\w$]+)/gm,
    (_m, asyncKw, kind, name) => {
      exported.add(name);
      return `${asyncKw ?? ''}${kind} ${name}`;
    },
  );

  const leftover = body.match(/^[ \t]*export[\s{]/m);
  if (leftover) throw new Error(`unhandled export syntax in ${id}: ${leftover[0].trim()}`);

  const returns = [...exported];
  if (hasDefault) returns.push('default: __default');

  return {
    deps: [...new Set(deps)],
    source: `__define(${JSON.stringify(id)}, () => {\n${body}\nreturn { ${returns.join(', ')} };\n});`,
  };
}

async function collect() {
  const modules = new Map();
  const queue = [ENTRY];
  while (queue.length) {
    const id = queue.shift();
    if (modules.has(id)) continue;
    const code = await fs.readFile(path.join(SRC, id), 'utf8');
    const mod = transform(id, code);
    modules.set(id, mod);
    for (const d of mod.deps) if (!modules.has(d)) queue.push(d);
  }
  return modules;
}

/** Depth-first topological order so a module is defined before it is required. */
function order(modules) {
  const seen = new Set();
  const out = [];
  const visit = (id, stack) => {
    if (seen.has(id)) return;
    if (stack.includes(id)) throw new Error(`import cycle: ${[...stack, id].join(' -> ')}`);
    for (const d of modules.get(id).deps) visit(d, [...stack, id]);
    seen.add(id);
    out.push(id);
  };
  for (const id of modules.keys()) visit(id, []);
  return out;
}

const runtime = (bodies) => `(() => {
const __factories = {};
const __cache = {};
const __define = (id, fn) => { __factories[id] = fn; };
const __mod = (id) => {
  if (__cache[id]) return __cache[id];
  const f = __factories[id];
  if (!f) throw new Error('missing module: ' + id);
  return (__cache[id] = f());
};
${bodies}
__mod(${JSON.stringify(ENTRY)});
})();`;

async function main() {
  const modules = await collect();
  const ids = order(modules);
  const script = runtime(ids.map((id) => modules.get(id).source).join('\n'));

  const html = await fs.readFile(path.join(SRC, 'index.html'), 'utf8');
  await fs.mkdir(OUT_DIR, { recursive: true });

  // 1. Standalone page — opened directly, and what `qa.mjs --dist` verifies.
  const standalone = html.replace(
    /<script\s+type="module"\s+src="\.\/main\.js"><\/script>/,
    `<script type="module">\n${script}\n</script>`,
  );
  if (standalone === html) throw new Error('entry <script> tag not found in index.html');
  await fs.writeFile(path.join(OUT_DIR, 'index.html'), standalone);

  // 2. Artifact fragment — the host supplies <html>/<head>/<body> itself, so
  //    only the title, styles, canvas and script may be emitted here.
  const styleMatch = html.match(/<style>[\s\S]*?<\/style>/);
  const fragment = [
    '<title>ミニゲーム ラッシュ</title>',
    styleMatch ? styleMatch[0] : '',
    '<canvas id="game"></canvas>',
    '<div id="boot">よみこみちゅう<span class="dot">…</span></div>',
    `<script type="module">\n${script}\n</script>`,
  ].join('\n');
  await fs.writeFile(path.join(OUT_DIR, 'artifact.html'), fragment);

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
  console.log(`bundled ${ids.length} modules`);
  console.log(`  dist/index.html    ${kb(standalone)} KB`);
  console.log(`  dist/artifact.html ${kb(fragment)} KB`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
