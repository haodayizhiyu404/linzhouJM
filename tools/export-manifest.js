// tools/export-manifest.js —— 酒馆世界书导出 JSON → content/manifest.json（设定同步清单）
//
// 用法（一般不用手动跑，双击仓库根的「发布设定.bat」即可）：
//   node tools/export-manifest.js                  ← 自动在「下载」里找最新的本卡世界书导出
//   node tools/export-manifest.js <文件路径>        ← 指定导出文件（拖文件到 bat 上等价于此）
//   node tools/export-manifest.js --from <目录>     ← 换扫描目录
//   选项：--version N（缺省旧清单+1） / --minPlugin x.y.z（缺省沿用旧清单）
//
// 识别口径（两级筛，不蛮扫）：
//   ① 文件名含「蒋默」——只列文件名不读内容，下载夹里几百个文件也是毫秒级；
//   ② 对收窄后的寥寥几本读文本，确认含「霖州蒋默」标记 + 有世界书条目结构。
// 多个命中取修改时间最新，文件名带不带 (1)(2) 后缀无所谓。
// 标题含「::」的条目（音色/版本等运行时与用户数据）自动排除，永不进清单。
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'manifest.json');
const NAMEKEY = '蒋默';        // 一级筛：文件名关键字（世界书导出以书命名）
const SIGN = '霖州蒋默';       // 二级筛：内容签名，确认是这张卡的书而非同名杂物

const args = process.argv.slice(2);
function opt(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; }
let src = null;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { i++; continue; }
  if (!src) src = args[i];
}

// 在目录里找本卡世界书导出：先按文件名含「蒋默」收窄（不读内容），
// 再对命中者读文本确认签名 + 条目结构，按修改时间从新到旧
function findExports(dir) {
  const cands = [];
  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return cands; }
  for (const f of files) {
    if (!/\.json$/i.test(f)) continue;
    if (f.indexOf(NAMEKEY) === -1) continue;   // 一级筛：只看文件名，大文件再多也不读
    const p = path.join(dir, f);
    let txt;
    try { txt = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
    if (txt.indexOf(SIGN) === -1) continue;
    if (!/"entries"\s*:/.test(txt) && !/"content"\s*:/.test(txt)) continue;
    try { cands.push({ path: p, mtime: fs.statSync(p).mtimeMs }); } catch (e) {}
  }
  cands.sort((a, b) => b.mtime - a.mtime);
  return cands;
}

if (!src) {
  const dir = opt('--from') || path.join(os.homedir(), 'Downloads');
  const cands = findExports(dir);
  if (!cands.length) {
    console.error('在「' + dir + '」没找到文件名含「' + NAMEKEY + '」的世界书导出 JSON。');
    console.error('可以：把导出的 JSON 直接拖到「发布设定.bat」上，或用 --from 指定目录。');
    process.exit(1);
  }
  src = cands[0].path;
  console.log('自动选中最新导出：' + path.basename(src) + '（' + new Date(cands[0].mtime).toLocaleString() + '）');
  if (cands.length > 1) {
    console.log('  其余候选（未选）：' + cands.slice(1, 4).map(c => path.basename(c.path)).join('、') + (cands.length > 4 ? ' …共' + cands.length + '个' : ''));
  }
}

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
let list = [];
if (Array.isArray(raw)) list = raw;
else if (raw && Array.isArray(raw.entries)) list = raw.entries;
else if (raw && raw.entries && typeof raw.entries === 'object') list = Object.keys(raw.entries).map(k => raw.entries[k]);
else { console.error('认不出「' + path.basename(src) + '」的世界书导出格式（entries 既不是数组也不是对象）——如果这是角色卡 JSON 而非世界书导出，请导出世界书本身'); process.exit(1); }

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
console.log('→ 下一步：喊 Claude「发设定」把清单推上 main（或自行提交 content/manifest.json）');
