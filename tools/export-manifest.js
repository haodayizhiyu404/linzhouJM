// tools/export-manifest.js —— 酒馆世界书导出 JSON → content/manifest.json（设定同步清单）
//
// 用法：node tools/export-manifest.js <世界书导出.json> [--version N] [--minPlugin x.y.z]
//   version   缺省 = 旧清单 version + 1
//   minPlugin 缺省 = 沿用旧清单（没有则当前引擎版本 1.1.0）
//
// 标题含「::」的条目（音色/版本等运行时与用户数据）自动排除，永不进清单。
// 工作流：在酒馆里改完世界书 → 导出 JSON → 跑本脚本 → git 推 main → 用户下次开卡自动同步。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'manifest.json');

const args = process.argv.slice(2);
const src = args[0];
if (!src) {
  console.error('用法：node tools/export-manifest.js <世界书导出.json> [--version N] [--minPlugin x.y.z]');
  process.exit(1);
}
function opt(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; }

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
let list = [];
if (Array.isArray(raw)) list = raw;
else if (raw && Array.isArray(raw.entries)) list = raw.entries;
else if (raw && raw.entries && typeof raw.entries === 'object') list = Object.keys(raw.entries).map(k => raw.entries[k]);
else { console.error('认不出世界书导出格式（entries 既不是数组也不是对象）'); process.exit(1); }

const excluded = [];
const entries = [];
for (const e of list) {
  const title = String((e && (e.comment || e.name || e.title)) || '').trim();
  if (!title) continue;
  if (title.indexOf('::') !== -1) { excluded.push(title); continue; }   // 运行时/用户数据永不托管
  entries.push({
    title,
    content: String(e.content != null ? e.content : (e.text || '')),
    keys: Array.isArray(e.key) ? e.key : (Array.isArray(e.keys) ? e.keys : []),
    keysSecondary: Array.isArray(e.keysecondary) ? e.keysecondary : [],
    constant: !!e.constant,
    selective: !!e.selective,
    order: typeof e.order === 'number' ? e.order : 100,
    position: typeof e.position === 'number' ? e.position : 0,
    enabled: e.disable !== true && e.enabled !== false
  });
}

let old = { version: 0, minPlugin: '1.1.0' };
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
const version = opt('--version') ? parseInt(opt('--version'), 10) : (old.version || 0) + 1;
const minPlugin = opt('--minPlugin') || old.minPlugin || '1.1.0';
if (!Number.isInteger(version) || version < 0) { console.error('version 必须是非负整数'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version, minPlugin, entries }, null, 2) + '\n', 'utf8');
console.log('manifest v' + version + '（minPlugin ' + minPlugin + '）：托管 ' + entries.length + ' 条，排除 ' + excluded.length + ' 条 :: 条目');
if (excluded.length) console.log('  排除：' + excluded.join('、'));
