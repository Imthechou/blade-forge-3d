import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const slash = p => p.split(path.sep).join('/');
const relative = p => slash(path.relative(root, p));
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(e => {
    if (['node_modules', '.git'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(root);
const sources = files.filter(p => relative(p).startsWith('src/') && p.endsWith('.js'));
function imports(text) {
  const found = new Set();
  const re = /\b(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of text.matchAll(re)) found.add(m[1] || m[2]);
  return [...found].sort();
}
function localTarget(file, spec) {
  const clean = spec.split(/[?#]/)[0];
  return clean.startsWith('/') ? path.join(root, clean.slice(1)) : path.resolve(path.dirname(file), clean);
}
const mode = process.argv[2];
if (mode === 'index') {
  const rows = sources.map(p => {
    const text = fs.readFileSync(p, 'utf8');
    const deps = imports(text);
    const exports = [...text.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/g)].map(m => m[1]);
    return { file: relative(p), bytes: fs.statSync(p).size, lines: text.split('\n').length,
      imports: deps.map(s => s.startsWith('.') ? relative(localTarget(p,s)) : s), exports };
  });
  for (const row of rows) row.importedBy = rows.filter(r => r.imports.includes(row.file)).map(r => r.file);
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/dependencies.json'), JSON.stringify(rows, null, 2) + '\n');
  const lines = ['# 源码索引（自动生成）', '', '执行 `npm run ai:index` 更新。导入为文本提取；导出仅列具名声明，不含重导出清单或完整 API。完整原文以源码为准。', '', '| 文件 | 行数 | 字节 | 具名导出声明 |', '| --- | ---: | ---: | --- |',
    ...rows.map(r => `| [${r.file}](../${r.file}) | ${r.lines} | ${r.bytes} | ${r.exports.join(', ') || '—'} |`)];
  fs.writeFileSync(path.join(root, 'docs/SOURCE_INDEX.md'), lines.join('\n') + '\n');
  console.log(`Indexed ${rows.length} source modules.`);
} else if (mode === 'check') {
  const errors = [];
  let refs = 0;
  function checkRef(file, spec) {
    if (!spec || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(spec)) return;
    refs++;
    const target = localTarget(file, spec);
    if (!fs.existsSync(target)) errors.push(`${relative(file)}: missing ${spec}`);
  }
  const scripts = files.filter(p => /\.(js|mjs|cjs)$/.test(p));
  for (const p of scripts) {
    const result = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    if (result.error || result.status !== 0) errors.push(`${relative(p)}: ${result.error || result.stderr}`);
    for (const spec of imports(fs.readFileSync(p, 'utf8'))) if (spec.startsWith('.')) checkRef(p,spec);
  }
  for (const p of files.filter(p => /\.(html|css)$/.test(p))) {
    const text = fs.readFileSync(p,'utf8');
    const re = p.endsWith('.html') ? /\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/g : /url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g;
    for (const m of text.matchAll(re)) checkRef(p,m[1]);
  }
  // 当前开发文档的本地链接必须存在；历史记录可能引用已移出包的证据，单独归档。
  for (const p of files.filter(p => p.endsWith('.md') && !relative(p).startsWith('docs/archive/') && !relative(p).includes('.workbuddy/'))) {
    const text = fs.readFileSync(p, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/!?\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
      checkRef(p, decodeURIComponent(m[1] || m[2]));
    }
  }
  const packageFile = path.join(root, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    for (const script of Object.values(pkg.scripts || {})) {
      const entry = /^node\s+(?!-)(\S+)/.exec(script);
      if (entry) checkRef(packageFile, entry[1]);
    }
  } catch (error) { errors.push(`package.json: ${error.message}`); }
  const manifest = path.join(root,'assets/models/manifest.json');
  function scan(v) {
    if (!v || typeof v !== 'object') return;
    for (const [key, value] of Object.entries(v)) {
      if (key === 'file' && typeof value === 'string') checkRef(path.join(root,'index.html'), value);
      else scan(value);
    }
  }
  try { scan(JSON.parse(fs.readFileSync(manifest,'utf8'))); } catch (e) { errors.push(`manifest: ${e.message}`); }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  console.log(`${scripts.length} scripts checked; ${refs} local references checked; ${errors.length} errors.`);
} else {
  console.error('Usage: node tools/project.mjs <check|index>');
  process.exitCode = 1;
}
