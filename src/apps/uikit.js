// ═══════════════════════════════════════════════════════════
//  apps/uikit.js —— 手机 UI 共享件：esc / 确认弹窗等通用 CSS / 跨应用图标
//  任何 app 的屏幕都直接取用；新增 app 优先复用这里的东西而不是重造。
//  注意：构建按序裸拼接，无模块系统，跨文件一律走 window.LZJM 命名空间。
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 通用 CSS（多 app 共用的弹窗/提示/按钮，先于各 app 样式注入） ──
  var css = [
    '.lzjm-sysrow{text-align:center;font-size:11.5px;color:#9aa0a8;margin:10px 0}',
    // 确认弹窗（删除/重roll等）：遮罩 + 白卡，暗色场景由 .lzjm-callpop/.lzjm-calldel 覆写
    '.lzjm-scrim{position:absolute;inset:0;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;z-index:50}',
    '.lzjm-confirm{background:#fff;border-radius:14px;padding:20px 20px 14px;width:216px;text-align:center;font-size:14px;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25)}',
    '.lzjm-cbtns{display:flex;gap:8px;margin-top:13px}',
    '.lzjm-cbtn{flex:1;border:none;border-radius:8px;padding:6px 0;font-size:14px;cursor:pointer}',
    '.lzjm-cbtn.no{background:#f2f3f5;color:#333}',
    '.lzjm-cbtn.yes{background:#e64b4b;color:#fff}',
    // 干净细滚动条（多容器共用）：纯色细拇指、无轨道底色、无箭头。
    // Firefox 走 scrollbar-color（设为非 auto 即不渲染箭头/轨道），Webkit 走伪元素。
    '.lzjm-body,.lzjm-dlist,.lzjm-stickgrid,.lzjm-lpop-list{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent}',
    '.lzjm-body::-webkit-scrollbar,.lzjm-dlist::-webkit-scrollbar,.lzjm-stickgrid::-webkit-scrollbar,.lzjm-lpop-list::-webkit-scrollbar{width:4px}',
    '.lzjm-body::-webkit-scrollbar-track,.lzjm-dlist::-webkit-scrollbar-track,.lzjm-stickgrid::-webkit-scrollbar-track,.lzjm-lpop-list::-webkit-scrollbar-track{background:transparent}',
    '.lzjm-body::-webkit-scrollbar-thumb,.lzjm-dlist::-webkit-scrollbar-thumb,.lzjm-stickgrid::-webkit-scrollbar-thumb,.lzjm-lpop-list::-webkit-scrollbar-thumb{background:rgba(0,0,0,.16);border-radius:2px}',
    // 全域兜底：屏幕内任何可滚元素都强制细条+透明轨道（Firefox 细条渲染无箭头按钮；
    // 各 app 如需隐藏滚动条，自身 scrollbar-width:none 规则在注入顺序上更靠后、仍可覆盖本行）
    '.lzjm-screen *{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.16) transparent}',
    // 有头 Edge/Chrome 在经典（非悬浮）滚动条模式下会给自定义滚动条按系统主题画端部按钮
    // （Windows 下即上下三角箭头）；显式置零隐藏，各端渲染路径差异一并堵死
    '#lzjm-phone ::-webkit-scrollbar-button{display:none;width:0;height:0}',
    // ── 临时探针（验证后删除）：拇指洋红/轨道青，用于确认浏览器加载的是最新 dist ──
    '#lzjm-phone ::-webkit-scrollbar-thumb{background:#ff00ff !important;border-radius:0 !important}',
    '#lzjm-phone ::-webkit-scrollbar{background:#00ffff !important}',
    // ── 临时探针 v2（验证后删除）：阅读页整页洋红底，与滚动条无关的元素级标记 ──
    '#lzjm-phone .lzjm-dread{background:#ff00ff !important}'
  ].join('\n');

  // ── 跨应用图标（window 全局，各文件 IIFE 内直接按名引用） ──
  window.ICON_REROLL = '<svg width="18" height="18" viewBox="0 0 1024 1024"><path fill="currentColor" d="M512 85.333333c102.869333 0 199.509333 36.693333 275.029333 100.437334l93.866667-94.037334a21.333333 21.333333 0 0 1 36.437333 15.061334V384a21.333333 21.333333 0 0 1-21.333333 21.333333h-276.693333a21.333333 21.333333 0 0 1-15.104-36.394666l122.325333-122.496a341.333333 341.333333 0 1 0 118.314667 341.632 42.666667 42.666667 0 1 1 83.2 18.901333A426.794667 426.794667 0 0 1 512 938.666667C276.352 938.666667 85.333333 747.648 85.333333 512S276.352 85.333333 512 85.333333z"/></svg>';
  window.ICON_TRASH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.8 6V4.9a1.4 1.4 0 0 1 1.4-1.4h1.6a1.4 1.4 0 0 1 1.4 1.4V6.5M6.8 6.5l.7 12a1.9 1.9 0 0 0 1.9 1.8h5.2a1.9 1.9 0 0 0 1.9-1.8l.7-12M10 10.5v6M14 10.5v6"/></svg>';

  window.LZJM = window.LZJM || {};
  window.LZJM.Uikit = { esc: esc, css: css };
})();
