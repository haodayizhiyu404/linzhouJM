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
// 标题含「::」的条目（音色/NSFW/通讯录等用户与运行时数据）导出进清单 defaults 段——
// 仅供用户端「整条缺失」时接生（存在即一字不动），永不做内容同步。
// 例外：霖州蒋默::版本 是同步模块自己写的本地诊断标记，不是作者内容，永不导出。
// 清单生成后需推上 main 才对用户生效：喊 Claude「发设定」，或自行提交 content/manifest.json。
//
// 选项：--detect（只诊断不写盘） / --version N / --minPlugin x.y.z / --from <目录>（换兜底扫描目录）
// 测试用环境变量：LZJM_ROOTS（分号分隔，替代盘符根列表）
//
// 清单同时带「角色卡字段」（二期同步源）：从 data/<user>/characters/蒋默.png 内嵌 JSON 抠白名单字段
// （开场白组/描述/性格/场景/示例对话/系统提示/后历史指令/作者名/创作者注释/版本号/标签 + 卡面正则），
// 其他插件挂在 data.extensions 下的数据一律不抠。
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const CARD_FIELDS = ['first_mes', 'alternate_greetings', 'description', 'personality', 'scenario',
  'mes_example', 'system_prompt', 'post_history_instructions', 'creator', 'creator_notes',
  'character_version', 'tags'];

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'manifest.json');
const CFG = path.join(__dirname, 'st-world.local.txt');
const NAMEKEY = '蒋默';         // 文件名关键字（世界书以书命名）
const SIGN = '霖州蒋默';        // 内容签名：确认是这张卡的书而非同名杂物
const EXACT = '【世界书】' + NAMEKEY + '.json';
const MARK_VERSION = '霖州蒋默::版本';   // 同步模块自写的本地诊断标记，永不导出

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
// 从角色卡 PNG 抠内嵌 JSON（tEXt/zTXt 的 chara/ccv3 块，base64）
function readCardPng(p) {
  let buf;
  try { buf = fs.readFileSync(p); } catch (e) { return null; }
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504E47) return null;
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'tEXt' || type === 'zTXt') {
      const nul = data.indexOf(0);
      const kw = data.toString('ascii', 0, nul);
      if (kw === 'chara' || kw === 'ccv3') {
        try {
          const payload = type === 'tEXt' ? data.toString('latin1', nul + 1)
            : zlib.inflateSync(data.slice(nul + 2)).toString('latin1');   // nul+1 是压缩方式字节
          return JSON.parse(Buffer.from(payload.trim(), 'base64').toString('utf8'));
        } catch (e) {}
      }
    }
    off += 8 + len + 4;
    if (type === 'IEND') break;
  }
  return null;
}

// 找角色卡 PNG：优先世界书母本的兄弟目录（data/<user>/worlds/x → data/<user>/characters/蒋默.png），
// 其次扫酒馆数据目录
function findCardPng() {
  for (const s of sources) {
    const guess = path.join(path.dirname(path.dirname(s.path)), 'characters', NAMEKEY + '.png');
    if (fs.existsSync(guess)) return guess;
  }
  for (const r of stRoots()) {
    const data = path.join(r, 'SillyTavern', 'data');
    let users = [];
    try { users = fs.readdirSync(data); } catch (e) { continue; }
    for (const u of users) {
      const guess = path.join(data, u, 'characters', NAMEKEY + '.png');
      if (fs.existsSync(guess)) return guess;
    }
  }
  return null;
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
const byDef = new Map();    // :: 条目 → defaults 段（接生用，内容永不同步）
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
    if (title === MARK_VERSION) continue;   // 同步模块的本地诊断标记，不是作者内容
    const ent = {
      title,
      content: String(e.content != null ? e.content : (e.text || '')),
      keys: Array.isArray(e.key) ? e.key : (Array.isArray(e.keys) ? e.keys : []),
      keysSecondary: Array.isArray(e.keysecondary) ? e.keysecondary : [],
      constant: !!e.constant,
      selective: !!e.selective,
      order: typeof e.order === 'number' ? e.order : 100,
      position: typeof e.position === 'number' ? e.position : 0,
      enabled: e.disable !== true && e.enabled !== false
    };
    if (typeof e.depth === 'number') ent.depth = e.depth;   // at_depth 条目需要
    if (typeof e.role === 'number') ent.role = e.role;      // 0 system / 1 user / 2 assistant
    if (title.indexOf('::') !== -1) { ent.enabled = false; byDef.set(title, ent); continue; }   // 接生条目建出来即禁用（母本全部如此）
    byTitle.set(title, ent);
  }
}
const entries = [...byTitle.values()];
const defaults = [...byDef.values()];

// ── 角色卡字段（二期同步源）：白名单抠取，其他插件的 data.extensions 数据不碰 ──
let card = null;
const cardPng = findCardPng();
if (cardPng) {
  const cj = readCardPng(cardPng);
  const d = (cj && (cj.data || cj)) || {};
  const fields = {};
  for (const f of CARD_FIELDS) { if (d[f] !== undefined) fields[f] = d[f]; }
  card = { fields };
  const rx = d.extensions && d.extensions.regex_scripts;
  if (Array.isArray(rx) && rx.length) card.regex = rx;
  console.log('角色卡（' + path.basename(cardPng) + '）：' + Object.keys(fields).length + ' 个字段' +
    (card.regex ? ' + ' + card.regex.length + ' 条卡面正则' : '') + '，版本号 ' + (fields.character_version || '（空）'));
} else {
  console.log('未找到角色卡 PNG（' + NAMEKEY + '.png），本次清单不含角色卡字段');
}

let old = { version: 0, minPlugin: '1.1.0' };
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
const version = opt('--version') ? parseInt(opt('--version'), 10) : (old.version || 0) + 1;
const minPlugin = opt('--minPlugin') || old.minPlugin || '1.1.0';
if (!Number.isInteger(version) || version < 0) { console.error('version 必须是非负整数'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const manifest = { version, minPlugin, entries };
if (defaults.length) manifest.defaults = defaults;
if (card) manifest.card = card;
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// ── 差异报告：本次到底改了什么（对照上一份清单），不堆原始列表 ──
// 比对前按写入侧默认值归一化（role/depth 缺省=0/4 与显式写 0/4 是同一回事，否则旧清单全部误报「更新」）
const sig = e => JSON.stringify([String(e.content || ''), e.keys || [], e.keysSecondary || [], !!e.constant, !!e.selective,
  typeof e.order === 'number' ? e.order : 100, typeof e.position === 'number' ? e.position : 0,
  typeof e.depth === 'number' ? e.depth : 4, typeof e.role === 'number' ? e.role : 0]);
function diffEntries(oldList, newList) {
  const om = new Map((Array.isArray(oldList) ? oldList : []).map(e => [e.title, e]));
  const nm = new Map(newList.map(e => [e.title, e]));
  const added = [], removed = [], changed = [];
  for (const [t, e] of nm) {
    if (!om.has(t)) added.push(t);
    else if (sig(om.get(t)) !== sig(e)) changed.push(t);
  }
  for (const t of om.keys()) { if (!nm.has(t)) removed.push(t); }
  return { added, removed, changed };
}
const FIELD_LABEL = {
  first_mes: '开场白', alternate_greetings: '备选开场白', description: '角色描述',
  personality: '性格', scenario: '场景', mes_example: '示例对话',
  system_prompt: '系统提示', post_history_instructions: '后历史指令',
  creator: '作者名', creator_notes: '创作者注释', character_version: '版本号', tags: '标签'
};
const joinNames = a => a.length <= 6 ? a.join('、') : a.slice(0, 6).join('、') + ' 等' + a.length + '条';

console.log('manifest v' + version + '（minPlugin ' + minPlugin + '）已生成：托管 ' + entries.length + ' 条，接生 ' + defaults.length + ' 条' + (card ? '，含角色卡字段' : ''));
if (!old.version) {
  console.log('（本地没有旧清单可对照，这是首次生成）');
} else {
  const de = diffEntries(old.entries, entries);
  const dd = diffEntries(old.defaults, defaults);
  const of = (old.card && old.card.fields) || {};
  const nf = (card && card.fields) || {};
  const fieldsChanged = Object.keys(nf).filter(k => JSON.stringify(of[k]) !== JSON.stringify(nf[k])).map(k => FIELD_LABEL[k] || k);
  const fieldsRemoved = Object.keys(of).filter(k => nf[k] === undefined).map(k => FIELD_LABEL[k] || k);
  const rxOld = ((old.card && old.card.regex) || []).length;
  const rxNew = ((card && card.regex) || []).length;
  const rxChanged = JSON.stringify((old.card && old.card.regex) || null) !== JSON.stringify((card && card.regex) || null);
  const lines = [];
  if (de.added.length) lines.push('  托管条目 · 新增 ' + de.added.length + ' 条：' + joinNames(de.added));
  if (de.changed.length) lines.push('  托管条目 · 更新 ' + de.changed.length + ' 条：' + joinNames(de.changed));
  if (de.removed.length) lines.push('  托管条目 · 移除 ' + de.removed.length + ' 条：' + joinNames(de.removed) + '（用户侧已有的不会被同步删除，只是不再托管）');
  if (dd.added.length) lines.push('  :: 接生 · 新增 ' + dd.added.length + ' 条：' + joinNames(dd.added));
  if (dd.changed.length) lines.push('  :: 接生 · 更新 ' + dd.changed.length + ' 条：' + joinNames(dd.changed) + '（只影响之后「整条缺失」时的接生内容，已存在的用户一字不动）');
  if (dd.removed.length) lines.push('  :: 接生 · 移除 ' + dd.removed.length + ' 条：' + joinNames(dd.removed) + '（用户侧已有的不受影响）');
  if (fieldsChanged.length) lines.push('  角色卡 · 更新字段：' + fieldsChanged.join('、'));
  if (fieldsRemoved.length) lines.push('  角色卡 · 移除字段：' + fieldsRemoved.join('、'));
  if (rxChanged) lines.push('  角色卡 · 卡面正则有变化（' + rxOld + ' → ' + rxNew + ' 条）');
  if (lines.length) {
    console.log('本次更新（对照 v' + old.version + '）：');
    for (const l of lines) console.log(l);
  } else {
    console.log('本次更新：对照 v' + old.version + ' 没有任何内容变化（仅版本号 +1）。没改东西的话其实不用发。');
  }
}

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
