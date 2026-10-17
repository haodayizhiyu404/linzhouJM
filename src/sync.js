// ─────────────────────────────────────────────────────────────
// sync.js —— 设定自动同步（一期：世界书托管条目）
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

  var Sync = {
    semverLTE: semverLTE,
    apply: apply,
    run: async function () {
      try {
        var mf = await fetchManifest();
        if (!mf) { log('清单拉取失败，跳过（本地内容不变）'); return; }
        var r = await apply(mf);
        if (!r.applied) { log(r.reason); return; }
        log('设定同步 v' + r.from + ' → v' + r.to + '：更新 ' + r.updated + ' 条，新增 ' + r.created + ' 条');
        try { toastr.success('设定已同步到 v' + r.to + '（更新' + r.updated + '条·新增' + r.created + '条）', '📱 霖州引擎'); } catch (e) {}
      } catch (e) { log('同步异常：' + (e && e.message || e)); }
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Sync = Sync;
})();
