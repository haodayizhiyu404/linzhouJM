// ═══════════════════════════════════════════════════════════
//  apps/diary.js —— 备忘录 app（独立的第二屏）
//  自有屏幕（列表/阅读）、自有样式、自有交互；状态挂在共享 UI 对象上
//  （diaryNpc/dBusy/dRead/dConfirm/dConfirmR），wechat.js 只留一行委托。
//  选人 chips + 存档列表 + 写一篇/重roll/删除（确认流全在本文件）。
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  var esc = window.LZJM.Uikit.esc;

  // ── 备忘录样式（注入顺序：uikit → 本 css → wechat 主样式） ──
  var css = [
    '.lzjm-dchips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px 8px;flex:none;background:#f7f7f9;border-bottom:1px solid rgba(0,0,0,.06)}',
    '.lzjm-dchip{flex:none;border:1px solid rgba(0,0,0,.12);background:#fff;color:#333;border-radius:14px;padding:4px 12px;font-size:12.5px;cursor:pointer;font-family:inherit}',
    '.lzjm-dchip.on{background:#576b95;border-color:#576b95;color:#fff}',
    '.lzjm-dlist{flex:1;min-height:0;overflow-y:auto;padding:6px 0 12px}',
    '.lzjm-drow{display:flex;align-items:center;gap:8px;padding:11px 14px;cursor:pointer}',
    '.lzjm-drow:active{background:rgba(0,0,0,.05)}',
    '.lzjm-drow-main{flex:1;min-width:0}',
    '.lzjm-drow-t{font-size:14px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lzjm-drow-s{font-size:11.5px;color:#9aa0a8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lzjm-drow-date{flex:none;font-size:11px;color:#9aa0a8}',
    '.lzjm-drow-ops{flex:none;display:flex;gap:0}',
    '.lzjm-dop{border:none;background:none;color:#a0a6ad;padding:6px;cursor:pointer;font-family:inherit;line-height:0;border-radius:8px}',
    '.lzjm-dop:active{color:#576b95;background:rgba(0,0,0,.05)}',
    '.lzjm-dfoot{flex:none;padding:10px 14px 12px;border-top:1px solid rgba(0,0,0,.06);background:#f7f7f9}',
    '.lzjm-dwrite{width:100%;border:none;background:#22c05e;color:#fff;border-radius:8px;padding:10px 0;font-size:14px;cursor:pointer;font-family:inherit}',
    '.lzjm-dwrite:disabled{background:#a8ddb9}',
    // 阅读页：整页白纸、无卡片——日期/标题/正文同落一页，靠排版分层（iOS 备忘录式）
    '.lzjm-dread{flex:1;min-height:0;overflow-y:auto;background:#fff;padding:26px 22px 48px;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent}',
    '.lzjm-screen .lzjm-dread::-webkit-scrollbar{width:3px}',
    '.lzjm-screen .lzjm-dread::-webkit-scrollbar-track{background:transparent}',
    '.lzjm-screen .lzjm-dread::-webkit-scrollbar-thumb{background:rgba(0,0,0,.14);border-radius:2px}',
    '.lzjm-dread-h{font-size:12px;color:#9aa0a8;letter-spacing:.05em;margin-bottom:6px}',
    '.lzjm-dread-t{font-size:21px;font-weight:600;color:#1a1d21;padding-bottom:14px;border-bottom:1px solid rgba(0,0,0,.06);margin-bottom:18px}',
    '.lzjm-dread-c{font-size:15px;line-height:1.95;color:#262a2e}',
    '.lzjm-dread-c p{margin:0 0 14px}',
    '.lzjm-dread-c p:last-child{margin-bottom:0}'
  ].join('\n');

  // ── 屏幕渲染：wechat.render() 遇到 diary/dread 委托到这里 ──
  function render(UI) {
    var eng = window.LZJM.Engine;
    if (UI.screen === 'dread') {
      var entsR = UI.diaryNpc ? eng.diaryEntries(UI.diaryNpc) : [];
      var eR = entsR[UI.dRead];
      var parasR = eR ? String(eR.content).split('\n').filter(function (l) { return l.trim(); })
        .map(function (l) { return '<p>' + esc(l.trim()) + '</p>'; }).join('') : '';
      return '<div class="lzjm-dread">' +
        (eR
          ? '<div class="lzjm-dread-h">' + esc(eR.date) + (eR.day ? ' · 记于' + esc(String(eR.day).replace(/^\d{4}年/, '')) : '') + '</div>' +
            (eR.title ? '<div class="lzjm-dread-t">' + esc(eR.title) + '</div>' : '') +
            '<div class="lzjm-dread-c">' + parasR + '</div>'
          : '<div class="lzjm-sysrow" style="margin-top:40px">这篇备忘录不存在了</div>') +
        '</div>';
    }
    // diary 列表
    var secD = eng.section() || {};
    var chipsD = (secD.contacts || []).map(function (c) {
      return '<button class="lzjm-dchip' + (c.name === UI.diaryNpc ? ' on' : '') + '" data-dnpc="' + esc(c.name) + '">' + esc(c.name) + '</button>';
    }).join('');
    var entsD = UI.diaryNpc ? eng.diaryEntries(UI.diaryNpc) : [];
    var rowsD = '';
    for (var di2 = entsD.length - 1; di2 >= 0; di2--) {
      var eD = entsD[di2];
      rowsD +=
        '<div class="lzjm-drow" data-dopen="' + di2 + '">' +
        '<div class="lzjm-drow-main"><div class="lzjm-drow-t">' + esc(eD.title || '（无标题）') + '</div>' +
        '<div class="lzjm-drow-s">' + esc(String(eD.content).replace(/\s+/g, ' ').slice(0, 42)) + '</div></div>' +
        '<span class="lzjm-drow-date">' + esc(eD.date) + '</span>' +
        '<div class="lzjm-drow-ops">' +
        '<button class="lzjm-dop" data-dreroll="' + di2 + '" title="删掉这篇，重新生成一篇">' + window.ICON_REROLL + '</button>' +
        '<button class="lzjm-dop" data-ddel="' + di2 + '" title="删除这篇">' + window.ICON_TRASH + '</button>' +
        '</div></div>';
    }
    return '<div class="lzjm-body" style="display:flex;flex-direction:column;overflow:hidden">' +
      '<div class="lzjm-dchips">' + (chipsD || '<span class="lzjm-sysrow">本世界线暂无联系人</span>') + '</div>' +
      '<div class="lzjm-dlist">' +
      (rowsD || '<div class="lzjm-sysrow" style="margin-top:40px">还没有备忘录<br>点下方「写一篇」，偷看 TA 的一天</div>') +
      (UI.dBusy ? '<div class="lzjm-sysrow">正在生成…</div>' : '') +
      '</div>' +
      '<div class="lzjm-dfoot"><button class="lzjm-dwrite" data-dwrite="1"' + (UI.dBusy ? ' disabled' : '') + '>写一篇</button></div>' +
      (UI.dConfirm >= 0 || UI.dConfirmR >= 0
        ? '<div class="lzjm-scrim"><div class="lzjm-confirm">' + (UI.dConfirm >= 0 ? '删掉这篇备忘录？' : '删掉这篇，重新生成一篇？') +
          '<div class="lzjm-cbtns"><button class="lzjm-cbtn no" data-cact="ddelno">取消</button><button class="lzjm-cbtn yes" data-cact="' + (UI.dConfirm >= 0 ? 'ddelok' : 'drerollok') + '">' + (UI.dConfirm >= 0 ? '删除' : '重roll') + '</button></div></div></div>'
        : '') +
      '</div>';
  }

  // ── 交互：wechat.bind() 末尾委托；cact 分发对 ddelno/ddelok/drerollok 也走这里 ──
  function bind(ph, UI) {
    ph.querySelectorAll('[data-dnpc]').forEach(function (el) {
      el.onclick = function () { UI.openDiary(el.dataset.dnpc); };
    });
    ph.querySelectorAll('[data-dwrite]').forEach(function (el) {
      el.onclick = function () { UI.diaryWriteOne(); };
    });
    ph.querySelectorAll('[data-dopen]').forEach(function (el) {
      el.onclick = function () {
        UI.dRead = parseInt(el.dataset.dopen, 10);
        UI.dConfirm = -1;
        UI.dConfirmR = -1;
        UI.screen = 'dread';
        UI.render();
      };
    });
    // 行内操作要拦冒泡，免得点「重roll/删除」顺手把条目打开了
    ph.querySelectorAll('[data-dreroll]').forEach(function (el) {
      el.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); UI.diaryReroll(parseInt(el.dataset.dreroll, 10)); };
    });
    ph.querySelectorAll('[data-ddel]').forEach(function (el) {
      el.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); UI.dConfirm = parseInt(el.dataset.ddel, 10); UI.render(); };
    });
  }

  // cact 统一分发里的备忘录三件套；返回 true 表示已处理
  function cact(UI, a) {
    if (a === 'ddelno') { UI.dConfirm = -1; UI.dConfirmR = -1; UI.render(); return true; }
    if (a === 'ddelok') { var ddx = UI.dConfirm; UI.dConfirm = -1; try { window.LZJM.Engine.diaryDeleteAt(UI.diaryNpc, ddx); } catch (e) {} UI.render(); return true; }
    if (a === 'drerollok') { var drx = UI.dConfirmR; UI.dConfirmR = -1; try { window.LZJM.Engine.diaryDeleteAt(UI.diaryNpc, drx); } catch (e) {} UI.diaryWriteOne(); return true; }
    return false;
  }

  // ── 逻辑（wechat.js 的 UI 方法是一行委托） ──
  function open(UI, npc) {
    var W = window.LZJM;
    if (npc) UI.diaryNpc = npc;
    if (!UI.diaryNpc) {
      var secD0 = W.Engine.section();
      if (secD0 && secD0.contacts && secD0.contacts.length) UI.diaryNpc = secD0.contacts[0].name;
    }
    UI.dConfirm = -1;
    UI.dConfirmR = -1;
    UI.dRead = -1;
    UI.screen = 'diary';
    UI.render();
  }

  // 手动「写一篇」：无当日判重——同日想写几篇写几篇，日期由 usedDates 排除、撞车并列不覆盖
  function writeOne(UI) {
    if (UI.dBusy || !UI.diaryNpc) return;
    UI.dBusy = true;
    UI.render();
    window.LZJM.Engine.diaryWrite(UI.diaryNpc).catch(function (e) {
      console.warn('[霖州引擎] 备忘录生成失败', e);
      try { toastr.error('备忘录生成失败：' + (e && e.message || e), '霖州手机'); } catch (e2) {}
    }).finally(function () {
      UI.dBusy = false;
      if (UI.screen === 'diary') UI.render();
    });
  }

  // 重roll：先弹确认（误触防删），确认后删指定旧篇再生成（AI 选题自然避开其余日期）
  function reroll(UI, idx) {
    if (UI.dBusy || !UI.diaryNpc) return;
    UI.dConfirmR = idx;
    UI.render();
  }

  window.LZJM = window.LZJM || {};
  window.LZJM.DiaryApp = {
    css: css,
    render: render,
    bind: bind,
    cact: cact,
    open: open,
    writeOne: writeOne,
    reroll: reroll
  };
})();
