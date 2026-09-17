// gen-batt.js —— 滚动条规则比武场：同页 8 套候选规则，每套独立 iframe 隔离
// 用法：node test/gen-batt.js → 生成 test/batt.html → 用 Edge 打开截图
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ── 抽取 lzjm 三源里所有含 scrollbar 的 CSS 行（模拟 injectStyle 三段拼）──
function grabLzjm() {
  const ctx = { window: {} };
  ctx.window.LZJM = {};
  vm.createContext(ctx);
  for (const f of ['src/apps/uikit.js', 'src/apps/diary.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  }
  const wc = fs.readFileSync(path.join(ROOT, 'src/apps/wechat.js'), 'utf8');
  const lines = [];
  // uikit + diary：eval 后取 join 好的 css 文本，逐行过滤（跳过无 { 的续行碎片）
  for (const src of [ctx.window.LZJM.Uikit.css, ctx.window.LZJM.DiaryApp.css]) {
    for (const l of src.split('\n')) {
      const t = l.trim();
      if (t.indexOf('scrollbar') !== -1 && t.indexOf('{') !== -1) lines.push(t);
    }
  }
  // wechat 的 CSS 数组行，同样跳过无 { 的续行碎片
  for (const l of wc.split('\n')) {
    const t = l.trim().replace(/^'|'[,]?$/g, '');
    if (t.indexOf('scrollbar') !== -1 && t.indexOf('{') !== -1) lines.push(t);
  }
  return lines;
}

const lzjmAll = grabLzjm();
const noBtnKill = lzjmAll.filter(l => l.indexOf('scrollbar-button') === -1);
const noBlanket = lzjmAll.filter(l => l.indexOf('.lzjm-screen *') === -1);
const noStd = lzjmAll.filter(l => l.indexOf('scrollbar-width') === -1 && l.indexOf('scrollbar-color') === -1);
const lzwLines = fs.readFileSync(path.join('E:/【个人项目】酒馆/霖州往事/手机插件/src/apps/wechat.js'), 'utf8')
  .split('\n').map(l => l.trim().replace(/^'|'[,]?$/g, ''))
  .filter(l => l.indexOf('scrollbar') !== -1 && l.indexOf('{') !== -1)
  .map(l => l.replace(/\.lzw-/g, '.lzjm-'));

const rows = Array.from({ length: 60 }, (_, i) =>
  '<div class="lzjm-chatrow"><div class="lzjm-ava">蒋</div><div class="lzjm-bub">第' + i + '条测试消息，滚动条样本</div></div>').join('');

const SETS = [
  ['1-bare-unscoped', '::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.1);border-radius:3px}'],
  ['2-lzw-full', lzwLines.join('\n')],
  ['3-lzjm-full', lzjmAll.join('\n')],
  ['4-lzjm-noBtnKill', noBtnKill.join('\n')],
  ['5-lzjm-noBlanket', noBlanket.join('\n')],
  ['6-lzjm-noStd', noStd.join('\n')],
  ['7-std-only', '.lzjm-body{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}'],
  ['8-bare-plus-std', '::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.1);border-radius:3px}\n.lzjm-body{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}'],
];

  // ── 第二轮：纯净隔离测试（修复方案选型）──
  const FIVE = ".lzjm-body::-webkit-scrollbar,.lzjm-dlist::-webkit-scrollbar,.lzjm-stickgrid::-webkit-scrollbar,.lzjm-lpop-list::-webkit-scrollbar,.lzjm-dread::-webkit-scrollbar";
  const uikitComp = [
    ".lzjm-body,.lzjm-dlist,.lzjm-stickgrid,.lzjm-lpop-list{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent}",
    FIVE + "{width:4px}",
    FIVE.replace(/scrollbar/g, "scrollbar-track") + "{background:transparent}",
    FIVE.replace(/scrollbar/g, "scrollbar-thumb") + "{background:rgba(0,0,0,.16);border-radius:2px}",
  ].join("\n");
  const fixAll = [
    uikitComp,
    ".lzjm-dread{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent}",
    ".lzjm-dread::-webkit-scrollbar{width:3px}",
    ".lzjm-dread::-webkit-scrollbar-track{background:transparent}",
    ".lzjm-dread::-webkit-scrollbar-thumb{background:rgba(0,0,0,.14);border-radius:2px}",
    ".lzjm-screen *{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.16) transparent}",
    FIVE.replace(/scrollbar/g, "scrollbar-button") + "{display:none;width:0;height:0}",
    FIVE.replace(/scrollbar-thumb{/, "scrollbar-thumb:hover{").replace(/{background:rgba(0,0,0,.16);border-radius:2px}/, "{background:rgba(0,0,0,.32)}") + "\n" + FIVE.replace(/scrollbar/g, "scrollbar-thumb") + "{background:rgba(0,0,0,.22);border-radius:2px}",
  ].join("\n");
  SETS.push(
    ["9-uikit-compounds-only", uikitComp],
    ["10-scope-atrule", "@scope (#lzjm-phone){::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.22);border-radius:2px}}"],
    ["11-lzjm-fixed-compounds", fixAll],
    ["12-displaynone-compound", ".lzjm-body::-webkit-scrollbar{display:none}"]
  );
const iframes = SETS.map(([name, css]) => {
  const doc = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f7f7f9}'
    + '.lzjm-chatrow{display:flex;gap:7px;margin:11px 12px}.lzjm-ava{width:34px;height:34px;border-radius:9px;flex:none;background:#c9cfd6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13.5px}'
    + '.lzjm-bub{max-width:62%;padding:8px 11px;border-radius:9px;background:#fff;line-height:1.45;font-size:13.5px}'
    + '.lzjm-body{height:100%;overflow-y:auto}'
    + css + '</style><div id="lzjm-phone"><div class="lzjm-screen"><div class="lzjm-body" id=b>' + rows + '</div></div></div>'
    + '<script>parent.__diag&&parent.__diag(document.getElementById("b"))<\/script>';
  return '<div class="cell"><div class="lbl">' + name + '</div>'
    + '<iframe style="width:280px;height:380px;border:1px solid #999" srcdoc="' + doc.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>'
    + '<div class="diag" id="diag-' + name + '"></div></div>';
}).join('');

const html = '<!doctype html><meta charset="utf-8"><title>滚动条比武场</title><style>'
  + 'body{font-family:system-ui;margin:12px;background:#eee}'
  + '#env{background:#fff;border:1px solid #999;padding:8px 12px;margin-bottom:10px;font-size:13px;white-space:pre-wrap}'
  + '.cell{display:inline-block;vertical-align:top;margin:0 10px 14px 0;background:#fff;padding:6px}'
  + '.lbl{font-weight:700;font-size:13px;margin-bottom:4px;color:#c00}'
  + '.diag{font-size:11px;color:#333;margin-top:3px;white-space:pre-wrap}'
  + '</style>'
  + '<div id=env>环境诊断加载中…</div>'
  + iframes
  + '<script>'
  + 'var env = [];'
  + 'env.push("forced-colors: " + matchMedia("(forced-colors: active)").matches);'
  + 'env.push("prefers-contrast: " + matchMedia("(prefers-contrast: more)").matches);'
  + 'env.push("UA: " + navigator.userAgent);'
  + 'document.getElementById("env").textContent = env.join("\\n");'
  + 'window.__diag = function(el){'
  + '  try {'
  + '    var cs = getComputedStyle(el);'
  + '    el.closest("body").setAttribute("data-sw", cs.scrollbarWidth);'
  + '  } catch(e) {}'
  + '};'
  + '<\/script>';

fs.writeFileSync(path.join(__dirname, 'batt.html'), html, 'utf8');
console.log('OK → test/batt.html（' + SETS.length + ' 套规则）');
console.log('lzjm 规则数:', lzjmAll.length, '| lzw 规则数:', lzwLines.length);
lzjmAll.forEach(l => console.log('  lzjm:', l.slice(0, 90)));
