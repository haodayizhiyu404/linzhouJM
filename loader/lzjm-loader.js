// ═══════════════════════════════════════════════════════════
//  霖州蒋默 · 数字世界引擎 —— 装载器（卡片脚本）
//  自研实现。把本体托管在用户自己的 GitHub 仓库，
//  优先 raw.githubusercontent（实时），jsDelivr 三域备用；断网回退本地缓存。
//
//  使用方法：整段粘贴为卡片脚本（酒馆助手 / JS-Slash-Runner）。
//  ⚠ 使用前把 GH_USER / GH_REPO 改成你自己的仓库。
// ═══════════════════════════════════════════════════════════
(async function () {
  'use strict';

  var NS = '__LZJM__';
  var GH_USER = 'haodayizhiyu404';
  var GH_REPO = 'linzhouJM';
  var FILE = 'dist/engine.js';
  var MIRRORS = ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'testingcf.jsdelivr.net', 'gcore.jsdelivr.net'];
  var log = function (m) { try { console.log('[霖州引擎] ' + m); } catch (e) {} };

  // ── 1. 防重复注入 ──
  if (window[NS]) { log('已在运行，跳过重复加载'); return; }
  window[NS] = { status: 'loading', retry: boot };

  // ── 2. 带闸刀的 fetch ──
  function timedFetch(url, ms) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // ── 3. 版本指针：GitHub API 取 main 最新提交号，失败退回 'main' ──
  async function resolveRef() {
    try {
      var r = await timedFetch(
        'https://api.github.com/repos/' + GH_USER + '/' + GH_REPO + '/commits/main',
        5000);
      if (r.ok) {
        var j = await r.json();
        var sha = String((j && j.sha) || '').trim();
        if (/^[0-9a-f]{7,40}$/.test(sha)) return sha;
      }
      log('GitHub API 不可用（限流），改用备用源');
    } catch (e) { log('提交号请求失败：' + (e && e.message || e)); }
    return 'main';
  }

  // ── 4. 本地缓存（断网兜底） ──
  var CACHE_KEY = 'lzjm_dist_cache';
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      return (c && typeof c.code === 'string' && c.code.length > 1000) ? c : null;
    } catch (e) { return null; }
  }
  function writeCache(ref, code) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ref: ref, code: code, saved_at: Date.now() })); } catch (e) {}
  }

  // ── 5. 失败重试按钮 ──
  function showRetry(msg) {
    try {
      var doc = window.parent.document;
      if (doc.getElementById(NS + '-retry')) return;
      var b = doc.createElement('button');
      b.id = NS + '-retry';
      b.textContent = '📱 霖州引擎加载失败 · 点击重试';
      b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;' +
        'padding:10px 16px;border:none;border-radius:10px;cursor:pointer;' +
        'background:#c0392b;color:#fff;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      b.onclick = function () { b.remove(); boot(); };
      doc.body.appendChild(b);
    } catch (e) {}
    try { toastr.error(msg, '📱 霖州蒋默 · 数字世界引擎'); } catch (e) {}
  }

  // ── 6. 主流程 ──
  async function boot() {
    if (window[NS] && window[NS].status === 'running') return;
    if (window[NS]) window[NS].status = 'loading';

    var ref = await resolveRef();
    var code = null, lastErr = null;

    // 源清单：raw 优先（版本号 pinning——raw 对同一 URL 有 5 分钟边缘缓存，
    // 用提交号当路径才能绕过；写死 /main/ 会白等 300 秒），jsDelivr 镜像其后。
    // 原因：jsDelivr 的 @main 有最长12h缓存，API被限流时容易拿到旧版；
    // 镜像用于 raw 被墙/故障的备用。
    var urls = ['https://raw.githubusercontent.com/' + GH_USER + '/' + GH_REPO + '/' + ref + '/' + FILE];
    MIRRORS.forEach(function (h) {
      urls.push('https://' + h + '/gh/' + GH_USER + '/' + GH_REPO + '@' + ref + '/' + FILE);
    });

    for (var i = 0; i < urls.length && !code; i++) {
      try {
        var r = await timedFetch(urls[i], 10000);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var t = await r.text();
        if (!t || t.length < 1000) throw new Error('内容异常(' + (t ? t.length : 0) + ')');
        code = t;
        var host = urls[i].split('/')[2] || urls[i].split('/')[2];
        log('@' + ref.slice(0, 7) + ' via ' + host + '（' + code.length + ' chars）');
      } catch (e) { lastErr = e; log('源' + (i + 1) + ' ' + (urls[i].split('/')[2] || 'raw') + ' 失败：' + (e && e.message || e)); }
    }

    if (code) {
      writeCache(ref, code);
    } else {
      var c = readCache();
      if (c) {
        code = c.code;
        log('三个源均失败，改用 ' + new Date(c.saved_at).toLocaleString() + ' 的缓存（@' + String(c.ref).slice(0, 7) + '）');
        try { toastr.warning('网络不通，引擎以缓存版本离线运行', '📱 霖州蒋默 · 数字世界引擎'); } catch (e) {}
      } else {
        window[NS] && (window[NS].status = 'failed');
        showRetry('三个 CDN 源均不可达，且本地无缓存：' + (lastErr && lastErr.message || lastErr));
        log('加载失败且无缓存');
        return;
      }
    }

    try {
      (0, eval)(code + '\n//# sourceURL=lzjm-engine.js');
      window[NS].status = 'running';
    } catch (e) {
      window[NS] && (window[NS].status = 'failed');
      showRetry('执行出错：' + (e && e.message || e));
      log('eval 失败：' + (e && e.message || e));
    }
  }

  boot();
})();
