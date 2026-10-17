// ─────────────────────────────────────────────────────────────
// sync.js —— 设定自动同步（一期：世界书托管条目；二期：角色卡字段）
//
// 仓库 content/manifest.json 是「设定清单」：version 单调递增，entries = 托管条目全集。
// 引擎启动后异步拉取，比本地新则整体 upsert：
//   · 已存在条目：更新 内容/触发键/策略/顺序；【enabled 不动】——开关是运行时状态，归用户与引擎
//   · 不存在的条目：按清单整只创建（含 enabled 默认）
//   · 标题含「::」的条目（音色/版本等用户与运行时数据）一律拒收，清单误带也不收
// minPlugin 是格式门槛：清单要求比本插件新 → 拒收，等插件追上
// （防 CDN 缓存按文件分别过期造成的「旧插件+新清单」错配）。
// 全程失败静默：拉不到/读不懂/写不进都只记日志，绝不影响本地既有内容。
// ─────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var GH = 'haodayizhiyu404/linzhouJM';
  var MFILE = 'content/manifest.json';
  var MARK_VERSION = '霖州蒋默::版本';   // 本地同步版本号落这条（内容=整数；:: 前缀天然免托管）
  var MIRRORS = ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'testingcf.jsdelivr.net', 'gcore.jsdelivr.net'];
  var log = function (m) { try { console.log('[霖州引擎·同步] ' + m); } catch (e) {} };

  function timedFetch(url, ms) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // a ≤ b？三段数字比较（'1.10.0' > '1.9.0'，字符串比大小会翻车）
  function semverLTE(a, b) {
    var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
    for (var i = 0; i < 3; i++) {
      var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
      if (x !== y) return x < y;
    }
    return true;
  }

  function branch() {
    try { var lz = window.__LZJM__; if (lz && lz.branch) return lz.branch; } catch (e) {}
    return 'main';
  }

  // 与装载器同套：GitHub API 解析分支最新提交号（绕 jsdelivr @branch 缓存），失败退分支名。
  // 新装载器会直接给 ref（window.__LZJM__.ref），省一次 API 调用。
  async function resolveRef() {
    try { var lz = window.__LZJM__; if (lz && lz.ref) return lz.ref; } catch (e) {}
    try {
      var r = await timedFetch('https://api.github.com/repos/' + GH + '/commits/' + branch(), 5000);
      if (r.ok) {
        var sha = String(((await r.json()) || {}).sha || '').trim();
        if (/^[0-9a-f]{7,40}$/.test(sha)) return sha;
      }
    } catch (e) {}
    return branch();
  }

  async function fetchManifest() {
    var ref = await resolveRef();
    var urls = ['https://raw.githubusercontent.com/' + GH + '/' + ref + '/' + MFILE];
    MIRRORS.forEach(function (h) { urls.push('https://' + h + '/gh/' + GH + '@' + ref + '/' + MFILE); });
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await timedFetch(urls[i], 8000);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        if (!j || typeof j.version !== 'number' || !Array.isArray(j.entries)) throw new Error('清单格式不对');
        return j;
      } catch (e) { log('源' + (i + 1) + ' 失败：' + (e && e.message || e)); }
    }
    return null;
  }

  // 应用清单（拉取之外的全部逻辑，测试直调这里）。
  // 返回 {applied, updated, created, from, to} 或 {applied:false, reason}。
  async function apply(mf) {
    var W = window.LZJM;
    if (!semverLTE(mf.minPlugin || '0.0.0', W.VERSION)) {
      return { applied: false, reason: '清单要求插件≥' + mf.minPlugin + '（当前 ' + W.VERSION + '），跳过' };
    }
    var cur = await W.Worldbook.getEntry(MARK_VERSION);
    var local = cur ? (parseInt(cur.content, 10) || 0) : 0;
    if (!(mf.version > local)) return { applied: false, reason: '已是最新 v' + local };

    // :: 条目是用户/运行时数据，清单误带也一律拒收（双保险，导出工具那头也拦）
    var clean = mf.entries.filter(function (e) { return e && e.title && String(e.title).indexOf('::') === -1; });
    var res = await W.Worldbook.upsertManaged(clean);
    if (res.failed.length) {
      return { applied: false, reason: '部分条目写入失败：' + res.failed.join('、') + '（版本号不落，下次打开重试）' };
    }

    await W.Worldbook.upsertManaged([{ title: MARK_VERSION, content: String(mf.version), enabled: false }]);
    return { applied: true, updated: res.updated, created: res.created, from: local, to: mf.version };
  }

  // ─────────────────────────────────────────────
  // 二期：角色卡字段同步（开场白组/描述/性格/场景/示例对话/系统提示/后历史指令/
  //   作者名/创作者注释/版本号/标签 + 卡面正则 regex_scripts）
  //
  // 【纪律】只写白名单字段；其他插件挂在 data.extensions 下的数据永不触碰。
  // 主权与世界书统一为「作者赢」：清单值 ≠ 本地值就照清单覆盖，无基线、无锁死、无留底——
  //   用户自定义走用户空间（自建条目/::条目/自己的正则），设定本身以作者发布为准。
  // 开场白整组处理（first_mes + alternate_greetings 一起比对一起换）：
  //   作者增/删/改开场白都只是「新数组≠旧数组」，一次覆盖全部到位。
  // 模式（localStorage lzjm-cardsync-mode）：dry（默认）= 干跑只报告不落盘（发布验证用）；
  //   on = 静默直写（与世界书同待遇）；off = 全关。
  // ─────────────────────────────────────────────
  var MODE_KEY = 'lzjm-cardsync-mode';
  var CARD_GROUPS = [
    { key: 'greetings', label: '开场白', fields: ['first_mes', 'alternate_greetings'] },
    { key: 'description', label: '角色描述' },
    { key: 'personality', label: '性格' },
    { key: 'scenario', label: '场景' },
    { key: 'mes_example', label: '示例对话' },
    { key: 'system_prompt', label: '系统提示' },
    { key: 'post_history_instructions', label: '后历史指令' },
    { key: 'creator', label: '作者名' },
    { key: 'creator_notes', label: '创作者注释' },
    { key: 'character_version', label: '版本号' },
    { key: 'tags', label: '标签' },
    { key: 'regex', label: '卡面正则' }
  ];

  // 确定性哈希：键排序的稳定串化 + djb2。字符串统一 \r\n→\n（ST 读写可能归一化换行，
  // 不归一化会出现「永远有差异」的假象）。
  function stableStringify(v) {
    if (typeof v === 'string') return JSON.stringify(v.replace(/\r\n/g, '\n'));
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    var keys = Object.keys(v).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + stableStringify(v[k]); }).join(',') + '}';
  }
  function stableHash(v) {
    var s = stableStringify(v), h = 5381;
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // 清单里这组的远端值（没带这组返回 undefined = 不管）
  function groupRemote(card, g) {
    if (g.key === 'regex') return Array.isArray(card.regex) ? card.regex : undefined;
    var f = card.fields || {};
    if (g.fields) {
      if (f.first_mes === undefined && f.alternate_greetings === undefined) return undefined;
      return { first_mes: f.first_mes, alternate_greetings: f.alternate_greetings };
    }
    return f[g.key];
  }

  // 纯函数（测试直调）：比对清单卡字段 vs 本地值，有差异即进计划（作者赢，无基线概念）。
  // getField(key) 取本地当前值。返回 {planned:[{key,label,value}], unchanged}。
  function planCardUpdates(card, getField) {
    var planned = [], unchanged = 0;
    CARD_GROUPS.forEach(function (g) {
      var remote = groupRemote(card, g);
      if (remote === undefined) return;
      if (stableHash(getField(g.key)) === stableHash(remote)) { unchanged++; return; }
      planned.push({ key: g.key, label: g.label, value: remote });
    });
    return { planned: planned, unchanged: unchanged };
  }

  // 卡上下文：沙盒原生注入优先，父页 getContext 兜底（与 engine.openingCtx 同套）
  function cardCtx() {
    try { if (typeof SillyTavern !== 'undefined' && SillyTavern && SillyTavern.characters) return SillyTavern; } catch (e) {}
    try {
      var st = window.parent && window.parent.SillyTavern;
      var c = st && st.getContext && st.getContext();
      if (c && c.characters) return c;
    } catch (e) {}
    return null;
  }

  // 本地取值适配器：v2 卡字段可能在顶层也可能在 data 镜像下，两处都读（data 优先）
  function cardFieldGetter(ch) {
    var d = ch.data || {};
    return function (key) {
      if (key === 'greetings') {
        return {
          first_mes: d.first_mes !== undefined ? d.first_mes : ch.first_mes,
          alternate_greetings: d.alternate_greetings !== undefined ? d.alternate_greetings : ch.alternate_greetings
        };
      }
      if (key === 'regex') { var ex = d.extensions || {}; return Array.isArray(ex.regex_scripts) ? ex.regex_scripts : []; }
      return d[key] !== undefined ? d[key] : ch[key];
    };
  }

  // 组装 merge-attributes 请求体：顶层+data 镜像都写（ST 两个位置都读），
  // data 只带白名单字段——deepMerge 递归合对象，extensions 里其他插件的键不受影响。
  function buildCardUpdate(avatar, planned) {
    var up = { avatar: avatar, data: {} };
    planned.forEach(function (p) {
      if (p.key === 'greetings') {
        var v = p.value;
        if (v.first_mes !== undefined) { up.first_mes = v.first_mes; up.data.first_mes = v.first_mes; }
        if (v.alternate_greetings !== undefined) { up.alternate_greetings = v.alternate_greetings; up.data.alternate_greetings = v.alternate_greetings; }
      } else if (p.key === 'regex') {
        up.data.extensions = { regex_scripts: p.value };
      } else {
        up[p.key] = p.value; up.data[p.key] = p.value;
      }
    });
    return up;
  }

  // 写成功后同步内存里的卡对象（不等酒馆重读盘）
  function refreshCardMemory(ch, planned) {
    var d = ch.data = ch.data || {};
    planned.forEach(function (p) {
      if (p.key === 'greetings') {
        if (p.value.first_mes !== undefined) { ch.first_mes = p.value.first_mes; d.first_mes = p.value.first_mes; }
        if (p.value.alternate_greetings !== undefined) { ch.alternate_greetings = p.value.alternate_greetings; d.alternate_greetings = p.value.alternate_greetings; }
      } else if (p.key === 'regex') {
        d.extensions = d.extensions || {}; d.extensions.regex_scripts = p.value;
      } else { ch[p.key] = p.value; d[p.key] = p.value; }
    });
  }

  var csrfToken = null;
  async function postJson(url, body, ms) {
    if (!csrfToken) {
      try {
        var r0 = await timedFetch('/csrf-token', 5000);
        if (r0.ok) csrfToken = (await r0.json()).token;
      } catch (e) {}
    }
    var headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 15000) : null;
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // 卡同步主流程：差异驱动（不看清单版本号——版本号归世界书），失败静默。
  async function applyCard(mf) {
    var card = mf && mf.card;
    if (!card || typeof card !== 'object') return { applied: false, reason: '清单无卡字段' };
    var mode = Sync.cardMode();
    if (mode === 'off') return { applied: false, reason: '卡同步已关' };

    var ctx = cardCtx();
    var ch = ctx && ctx.characters && ctx.characters[ctx.characterId != null ? ctx.characterId : ctx.this_chid];
    if (!ch || !ch.avatar) return { applied: false, reason: '未打开角色卡' };

    var plan = planCardUpdates(card, cardFieldGetter(ch));

    if (!plan.planned.length) return { applied: false, reason: '卡字段无差异' };

    if (mode === 'dry') {
      var msg = '角色卡同步预览：将更新 ' + plan.planned.map(function (p) { return p.label; }).join('、');
      log('[干跑] ' + msg + '（localStorage 设 lzjm-cardsync-mode=on 即静默直写）');
      // 干跑报告是给人逐字核对的，必须常驻（timeOut:0 不自动消失，带关闭按钮），手机端没有 F12 看不了 console
      try { toastr.info(msg + '（预览模式，未改动）', '📱 霖州引擎', { timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false }); } catch (e) {}
      return { applied: false, dry: true, planned: plan.planned.length };
    }

    // on：静默直写（作者赢，与世界书同待遇）
    try {
      var up = buildCardUpdate(ch.avatar, plan.planned);
      var r = await postJson('/api/characters/merge-attributes', up);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      refreshCardMemory(ch, plan.planned);
      var done = '角色卡已更新到 v' + mf.version + '（' + plan.planned.map(function (p) { return p.label; }).join('、') + '）';
      log(done);
      try { toastr.success(done, '📱 霖州引擎'); } catch (e) {}
      return { applied: true, planned: plan.planned.length };
    } catch (e) {
      log('卡字段写入失败：' + (e && e.message || e) + '（本地内容不变，下次打开重试）');
      return { applied: false, reason: '写入失败' };
    }
  }

  var Sync = {
    semverLTE: semverLTE,
    apply: apply,
    // 二期卡同步（planCardUpdates/stableHash 是纯函数，测试直调）
    planCardUpdates: planCardUpdates,
    stableHash: stableHash,
    buildCardUpdate: buildCardUpdate,
    applyCard: applyCard,
    cardMode: function () {
      var m = 'dry';
      try { m = localStorage.getItem(MODE_KEY) || 'dry'; } catch (e) {}
      return (m === 'on' || m === 'off') ? m : 'dry';
    },
    setCardMode: function (m) {
      try {
        if (m === 'on' || m === 'off' || m === 'dry') localStorage.setItem(MODE_KEY, m);
        else localStorage.removeItem(MODE_KEY);
      } catch (e) {}
    },
    run: async function () {
      try {
        var mf = await fetchManifest();
        if (!mf) { log('清单拉取失败，跳过（本地内容不变）'); return; }
        var r = await apply(mf);
        if (!r.applied) { log(r.reason); }
        else {
          log('设定同步 v' + r.from + ' → v' + r.to + '：更新 ' + r.updated + ' 条，新增 ' + r.created + ' 条');
          try { toastr.success('设定已同步到 v' + r.to + '（更新' + r.updated + '条·新增' + r.created + '条）', '📱 霖州引擎'); } catch (e) {}
        }
        // 卡字段同步：差异驱动，独立于世界书版本号（清单版本不新也可能有卡差异待处理）；
        // 但 minPlugin 门槛不过 = 清单格式可能比本插件新，卡段同样不能碰
        if (mf.card && semverLTE(mf.minPlugin || '0.0.0', window.LZJM.VERSION)) {
          try { await applyCard(mf); } catch (e) { log('卡同步异常：' + (e && e.message || e)); }
        }
      } catch (e) { log('同步异常：' + (e && e.message || e)); }
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Sync = Sync;
})();
