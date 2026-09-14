// ═══════════════════════════════════════════════════════════
//  store.js —— 聊天级存储（随卡走，不污染 localStorage）
//  数据挂在聊天变量 lzjm_phone 下：
//    history:  { 会话key: [ {who, kind, text, time} ] }
//    line:     最近一次定位到的世界线
//    rendered: 已渲染成气泡的楼层 mesid（避免重复处理）
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';
  var KEY = 'lzjm_phone';

  function readRoot() {
    try {
      var v = getVariables({ type: 'chat' });
      var root = v && v[KEY];
      if (root && typeof root === 'object') return root;
    } catch (e) {}
    return {};
  }

  function writeRoot(root) {
    try {
      var v = getVariables({ type: 'chat' }) || {};
      v[KEY] = root;
      replaceVariables(v, { type: 'chat' });
    } catch (e) { console.warn('[霖州引擎] 存储写入失败', e); }
  }

  var Store = {
    KEY: KEY,

    // 有记录的会话 key 列表
    historyKeys: function () {
      var r = readRoot();
      return Object.keys(r.history || {});
    },

    history: function (chatKey) {
      var r = readRoot();
      var h = (r.history || {})[chatKey];
      return Array.isArray(h) ? h : [];
    },

    push: function (chatKey, msgs, cap) {
      var r = readRoot();
      var h = (r.history || {})[chatKey] || [];
      var stampDay = null, stampTime = null;
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        if (m && m.kind !== 'recall' && (m.day == null || !m.time)) {
          if (stampDay === null) { try { stampDay = window.LZJM.Status.nowDay() || ''; } catch (e) { stampDay = ''; } }
          if (stampTime === null) { try { stampTime = window.LZJM.Status.nowText() || ''; } catch (e) { stampTime = ''; } }
          m = Object.assign({}, m, { day: m.day == null ? stampDay : m.day, time: m.time || stampTime });
          msgs[i] = m;
        }
        if (m && m.kind === 'recall') {
          // 撤回标记本身不落库：给该发言人最近一条消息打撤回标
          for (var j = h.length - 1; j >= 0; j--) {
            if (h[j].who === m.who) { h[j] = Object.assign({}, h[j], { recalled: true }); break; }
          }
          continue;
        }
        h.push(m);
      }
      if (cap && h.length > cap) h = h.slice(-cap);
      r.history = r.history || {};
      r.history[chatKey] = h;
      writeRoot(r);
      return h;
    },

    // 按下标删除单条（玩家删除自己的话/清掉异常消息用）
    removeAt: function (chatKey, index) {
      var r = readRoot();
      var h = (r.history || {})[chatKey];
      if (!h || index < 0 || index >= h.length) return false;
      h.splice(index, 1);
      r.history[chatKey] = h;
      // 删空会话时连元信息一起清，免得变量里留下永不使用的残留
      if (!h.length && r.meta) delete r.meta[chatKey];
      writeRoot(r);
      return true;
    },

    // 从末尾弹出 n 条（重roll用）
    popLast: function (chatKey, n) {
      var r = readRoot();
      var h = (r.history || {})[chatKey];
      if (!h || !h.length) return [];
      var popped = h.splice(Math.max(0, h.length - n), n);
      writeRoot(r);
      return popped;
    },

    // 主动消息捕捉查重表：已处理过 <!--phone--> 块的正文消息 id。
    // 只查即时事件、不做历史补扫（避免扫全楼层），id 表封顶 200。
    procIds: function () {
      var r = readRoot();
      return Array.isArray(r.procIds) ? r.procIds : [];
    },
    markProcId: function (id) {
      var r = readRoot();
      var list = (Array.isArray(r.procIds) ? r.procIds : []).concat([String(id)]);
      r.procIds = list.slice(-200);
      writeRoot(r);
    },

    // ── 删除否决：玩家手动删掉过的消息记指纹，重roll时 AI 再生成同内容主动块 → 跳过不入库 ──
    _hashLine: function (s) {
      var h = 5381;
      s = String(s || '');
      for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      return h.toString(36);
    },
    rejectLine: function (key) {
      var r = readRoot();
      var list = (Array.isArray(r.rejected) ? r.rejected : []).concat([this._hashLine(key)]);
      r.rejected = list.slice(-150);
      writeRoot(r);
    },
    isRejectedLine: function (key) {
      var r = readRoot();
      var list = r.rejected || [];
      return list.indexOf(this._hashLine(key)) !== -1;
    },

    // 未读计数：消息落入时累加，打开会话即清零（「打开即已读」标准判定）。
    // 计数挂在会话元信息里，随聊天变量走。
    bumpUnread: function (chatKey, n) {
      var r = readRoot();
      r.meta = r.meta || {};
      var m = r.meta[chatKey] || {};
      m.unread = (m.unread || 0) + (n || 1);
      r.meta[chatKey] = m;
      writeRoot(r);
    },
    clearUnread: function (chatKey) {
      var r = readRoot();
      var m = ((r.meta || {})[chatKey]);
      if (m && m.unread) { m.unread = 0; writeRoot(r); }
    },

    // 会话元信息：headline（一句话近况）、atMainCount（最近活跃时的主线楼数）、
    // digested（已折进提要的条数）、digest（前文提要）
    meta: function (chatKey) {
      var r = readRoot();
      return ((r.meta || {})[chatKey]) || {};
    },

    setMeta: function (chatKey, patch) {
      var r = readRoot();
      r.meta = r.meta || {};
      var m = r.meta[chatKey] || {};
      for (var k in patch) m[k] = patch[k];
      r.meta[chatKey] = m;
      writeRoot(r);
    },

    // 只改最后一条（比如补时间）
    amendLast: function (chatKey, patch) {
      var r = readRoot();
      var h = (r.history || {})[chatKey];
      if (!h || !h.length) return;
      var last = h[h.length - 1];
      for (var k in patch) last[k] = patch[k];
      writeRoot(r);
    },

    // 按下标改一条（朋友圈动态的点赞/评论增量用）
    patchAt: function (chatKey, index, patch) {
      var r = readRoot();
      var h = (r.history || {})[chatKey];
      if (!h || index < 0 || index >= h.length) return false;
      h[index] = Object.assign({}, h[index], patch);
      r.history[chatKey] = h;
      writeRoot(r);
      return true;
    },

    line: function () {
      return readRoot().line || null;
    },

    // ── 引擎设置（提示词携带量 / 生成 API）。明文存于聊天变量，随卡走。──
    //    API 自定义模式的密钥是唯一例外：存 localStorage（仅本机浏览器，不随卡外流）。
    //    cfg() = 设置项 + 默认值兜底，prompt.js / engine.js 共用。
    DEFAULTS: {
      plotFloors: 8,   // 手机提示词带几楼正文
      plotCap: 900,    // 每楼正文上限字数
      histPriv: 50,    // 私聊带回几条
      histGroup: 50,   // 群聊带回几条
      crossMax: 3,     // 跨会话最多带几个（对方在的群 / 成员当天私聊）
      crossLines: 18,  // 每个跨会话带几条
      injRecent: 8,    // 正文注入：会话在主线最近 N 楼内聊过 → 带
      injMention: 4,   // 正文注入：名字出现在主线最近 N 楼 → 带（哪怕聊得早）
      injMax: 3,       // 正文注入：一次最多带几个会话
      injRounds: 20    // 正文注入：每会话带最近几条（约 10 轮）
    },

    settings: function () {
      var r = readRoot();
      return r.settings || {};
    },

    setSettings: function (patch) {
      var r = readRoot();
      var s = r.settings || {};
      for (var k in patch) {
        if (patch[k] === undefined) delete s[k];
        else s[k] = patch[k];
      }
      r.settings = s;
      writeRoot(r);
    },

    // 读取数值设置：非正数/非数值一律落回默认，防止手滑写崩提示词
    cfg: function () {
      var out = {};
      var d = this.DEFAULTS, s = this.settings();
      for (var k in d) {
        var v = Number(s[k]);
        out[k] = (isFinite(v) && v > 0) ? Math.round(v) : d[k];
      }
      return out;
    },

    setLine: function (name) {
      if (!name || name === this.line()) return;
      var r = readRoot();
      r.line = name;
      writeRoot(r);
    },

    markRendered: function (mesid) {
      var r = readRoot();
      r.rendered = r.rendered || [];
      if (r.rendered.indexOf(mesid) === -1) {
        r.rendered.push(mesid);
        if (r.rendered.length > 400) r.rendered = r.rendered.slice(-400);
        writeRoot(r);
      }
    },

    isRendered: function (mesid) {
      var r = readRoot();
      return r.rendered && r.rendered.indexOf(mesid) !== -1;
    },

    wipeHistory: function () {
      var r = readRoot();
      r.history = {};
      writeRoot(r);
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Store = Store;
})();
