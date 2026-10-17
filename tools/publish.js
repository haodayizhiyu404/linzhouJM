// tools/publish.js —— 一键发版：直读酒馆母本世界书 → content/manifest.json（设定同步清单）
//
// 母本永远在酒馆数据目录里（酒馆界面每改一条立即写盘），无需人工导出。
// 数据源解析顺序：
//   ① 命令行指定文件（把 JSON 拖到「发布设定.bat」上等价于此）
//   ② tools/st-world.local.txt —— 世界书母本路径缓存（每行一个，首次自动识别后写入；本文件不进 git）
//   ③ 自动识别：扫盘符根下的 SillyTavern\data\*\worlds\，文件名含「蒋默」且内容含「霖州蒋默」签名者入选
//      （精确名「【世界书】蒋默.json」优先——旁边可能有「霖州往事-蒋默测试.json」这类同名片）
//   ④ 兜底：「下载」文件夹两级筛（兼容旧导出流：文件名含「蒋默」收窄 → 内容签名确认 → 取最新）
//
// 标题含「::」的条目（音色/版本/通讯录等运行时与用户数据）自动排除，永不进清单。
// 清单生成后需推上 main 才对用户生效：喊 Claude「发设定」，或自行提交 content/manifest.json。
//
// 选项：--detect（只诊断不写盘） / --version N / --minPlugin x.y.z / --from <目录>（换兜底扫描目录）
// 测试用环境变量：LZJM_ROOTS（分号分隔，替代盘符根列表）
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'manifest.json');
const CFG = path.join(__dirname, 'st-world.local.txt');
const NAMEKEY = '蒋默';         // 文件名关键字（世界书以书命名）
const SIGN = '霖州蒋默';        // 内容签名：确认是这张卡的书而非同名杂物
const EXACT = '【世界书】' + NAMEKEY + '.json';

const args = process.argv.slice(2);
function opt(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; }
const has = name => args.indexOf(name) !== -1;
let src = null;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { i++; continue; }
  if (!src) src = args[i];
}

// 读文件全文，验签名+条目结构；通过返回 true
function looksLikeOurBook(p) {
  let txt;
  try { txt = fs.readFileSync(p, 'utf8'); } catch (e) { return false; }
  if (txt.indexOf(SIGN) === -1) return false;
  return /"entries"\s*:/.test(txt);
}

// 扫一个 worlds 目录：文件名含关键字 + 内容过签名；精确名优先
function scanWorldDir(wdir) {
  let files = [];
  try { files = fs.readdirSync(wdir); } catch (e) { return []; }
  const hits = [];
  for (const f of files) {
    if (!/\.json$/i.test(f) || f.indexOf(NAMEKEY) === -1) continue;
    const p = path.join(wdir, f);
    if (!looksLikeOurBook(p)) continue;
    let mtime = 0;
    try { mtime = fs.statSync(p).mtimeMs; } catch (e) {}
    hits.push({ path: p, mtime, exact: f === EXACT });
  }
  const exacts = hits.filter(h => h.exact);
  return (exacts.length ? exacts : hits).sort((a, b) => b.mtime - a.mtime);
}

function stRoots() {
  const env = process.env.LZJM_ROOTS;
  if (env) return env.split(';').filter(Boolean);
  return ['E:\\', 'D:\\', 'C:\\', 'F:\\'];
}

// 自动识别酒馆：盘符根 → SillyTavern\data\*\worlds
function autoDetect() {
  for (const r of stRoots()) {
    const data = path.join(r, 'SillyTavern', 'data');
    let users = [];
    try { users = fs.readdirSync(data); } catch (e) { continue; }
    for (const u of users) {
      const hits = scanWorldDir(path.join(data, u, 'worlds'));
      if (hits.length) return hits;
    }
  }
  return [];
}

// 兜底：下载夹两级筛（文件名收窄 → 内容确认 → 最新者优先）
function findExports(dir) {
  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return []; }
  const hits = [];
  for (const f of files) {
    if (!/\.json$/i.test(f) || f.indexOf(NAMEKEY) === -1) continue;
    const p = path.join(dir, f);
    if (!looksLikeOurBook(p)) continue;
    try { hits.push({ path: p, mtime: fs.statSync(p).mtimeMs }); } catch (e) {}
  }
  return hits.sort((a, b) => b.mtime - a.mtime);
}

// ── 数据源解析 ──
let sources = [];
let via = '';
if (src) {
  sources = [{ path: src, mtime: 0 }];
  via = '指定文件';
} else if (fs.existsSync(CFG)) {
  const lines = fs.readFileSync(CFG, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  sources = lines.filter(p => fs.existsSync(p)).map(p => ({ path: p, mtime: fs.statSync(p).mtimeMs }));
  via = '路径缓存';
  if (!sources.length) console.log('路径缓存里的文件都不在了，重新自动识别…');
}
if (!sources.length && !src) {
  const hits = autoDetect();
  if (hits.length) {
    sources = hits;
    via = '酒馆母本（自动识别）';
    try { fs.writeFileSync(CFG, hits.map(h => h.path).join('\n') + '\n', 'utf8'); } catch (e) {}
  }
}
if (!sources.length && !src) {
  const dir = opt('--from') || path.join(os.homedir(), 'Downloads');
  const hits = findExports(dir);
  if (hits.length) {
    sources = [hits[0]];
    via = '下载夹兜底';
    if (hits.length > 1) {
      console.log('  其余候选（未选）：' + hits.slice(1, 4).map(c => path.basename(c.path)).join('、') + (hits.length > 4 ? ' …共' + hits.length + '个' : ''));
    }
  }
}
if (!sources.length) {
  console.error('没找到本卡世界书：酒馆母本没扫到，下载夹里也没有文件名含「' + NAMEKEY + '」的导出。');
  console.error('可以：把世界书 JSON 直接拖到「发布设定.bat」上。');
  process.exit(1);
}

console.log('数据源（' + via + '）：');
for (const s of sources) {
  console.log('  ' + s.path + (s.mtime ? '（' + new Date(s.mtime).toLocaleString() + '）' : ''));
}
if (has('--detect')) { console.log('--detect：诊断完毕，未写盘。'); process.exit(0); }

// ── 解析条目（多源合并，同名后源覆盖先源） ──
const excluded = [];
const byTitle = new Map();
for (const s of sources) {
  const raw = JSON.parse(fs.readFileSync(s.path, 'utf8'));
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && Array.isArray(raw.entries)) list = raw.entries;
  else if (raw && raw.entries && typeof raw.entries === 'object') list = Object.keys(raw.entries).map(k => raw.entries[k]);
  else { console.error('认不出「' + path.basename(s.path) + '」的世界书格式（entries 既不是数组也不是对象）——如果这是角色卡 JSON 而非世界书，请改用世界书文件'); process.exit(1); }
  for (const e of list) {
    const title = String((e && (e.comment || e.name || e.title)) || '').trim();
    if (!title) continue;
    if (title.indexOf('::') !== -1) { excluded.push(title); continue; }   // 运行时/用户数据永不托管
    byTitle.set(title, {
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
}
const entries = [...byTitle.values()];

let old = { version: 0, minPlugin: '1.1.0' };
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
const version = opt('--version') ? parseInt(opt('--version'), 10) : (old.version || 0) + 1;
const minPlugin = opt('--minPlugin') || old.minPlugin || '1.1.0';
if (!Number.isInteger(version) || version < 0) { console.error('version 必须是非负整数'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version, minPlugin, entries }, null, 2) + '\n', 'utf8');
console.log('manifest v' + version + '（minPlugin ' + minPlugin + '）：托管 ' + entries.length + ' 条，排除 ' + excluded.length + ' 条 :: 条目');
if (excluded.length) console.log('  排除：' + excluded.join('、'));

// ── 一键上线：y 则直接推 main（dev 同步提交，管道推送不切分支）；否则清单留本地 ──
if (process.stdin.isTTY) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('推送到 main 上线？用户下次打开卡即收到新设定。[y/N] ', function (ans) {
    rl.close();
    if (/^y(es)?$/i.test(String(ans).trim())) {
      try { require('./push-manifest').push(ROOT, version); }
      catch (e) {
        console.error('推送失败：' + String((e && e.message) || e).split('\n')[0]);
        console.error('清单已在本地，重跑本工具或喊 Claude「发设定」可补推。');
      }
    } else {
      console.log('好，清单已生成但未推送，用户暂时收不到。想发时重跑本工具，或喊 Claude「发设定」。');
    }
  });
} else {
  console.log('清单已生成：content/manifest.json（非交互环境，跳过推送询问）');
}
