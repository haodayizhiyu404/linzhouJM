// ═══════════════════════════════════════════════════════════
//  霖州蒋默 · 数字世界引擎（构建产物，勿手改）
//  源码见 src/ · 构建：node build/build.js
//  构建时间：2026-09-14T16:55:05.588Z
// ═══════════════════════════════════════════════════════════
var __LZJM_BUILD__ = '2026-09-14 16:55';
try { console.log('[霖州引擎] 构建 ' + __LZJM_BUILD__ + ' · 启动'); } catch (e) {}

// ── src/store.js ──
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


// ── src/status.js ──
// ═══════════════════════════════════════════════════════════
//  status.js —— 楼层状态栏解析
//  每层楼固定携带 <status> 块。本模块只读，不改。
//
//  解析规则（设计文档 §5.4）：
//    · <环境> 行：游戏内时间与【user 所在】地点 —— 时间可用，地点不可当作 NPC 位置
//    · <角色名> 小块：该角色的 着装/姿态/位置 —— 只取 位置+姿态，【绝不取心声】
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  var envRe = /<环境>\s*([\s\S]*?)<\/环境>/i;
  var charBlockRe = /<([^\s<>\/][^<>]*)>\s*([\s\S]*?)<\/\1>/g;

  function parseStatusBlock(text) {
    if (!text) return null;
    // 先剥外层 <status> 壳，角色小块在壳内逐一匹配
    var sm = String(text).match(/<status>\s*([\s\S]*?)<\/status>/i);
    var scope = sm ? sm[1] : String(text);
    var m = scope.match(envRe);
    if (!m) return null;

    // 环境行示例：2034年8月26日 星期五|22:49|天禧城3幢901室|阴
    var envParts = String(m[1]).split('|').map(function (s) { return s.trim(); });
    var result = {
      dateText: envParts[0] || '',      // 2034年8月26日 星期五
      time: '',                          // 22:49
      userPlace: envParts[2] || '',      // user 所在地点（不可用于 NPC）
      characters: {},                    // 角色小块：{ 位置, 姿态, 着装, 关系 }
      relations: {},                     // <关系总览> 逐行解析：{ 名字: 关系 }
      overview: ''                       // <关系总览> 整块原文
    };
    var tm = (envParts[1] || '').match(/(\d{1,2}:\d{2})/);
    if (tm) result.time = tm[1];

    // 角色小块：<蒋默> 着装：… 姿态：… 位置：… 关系：… 心声：… </沈锡元>
    var block;
    charBlockRe.lastIndex = 0;
    while ((block = charBlockRe.exec(scope)) !== null) {
      var name = block[1].trim();
      if (name === '环境' || name === 'status') continue;
      var body = block[2];
      if (name === '关系总览') {
        result.overview = body.trim();
        // 逐行「名字：关系」解析成映射，供角色块回填（关系跟人走）
        body.split(/\r?\n/).forEach(function(line) {
          var rm = line.match(/^\s*([^\s:：]+)\s*[:：]\s*(.+)$/);
          if (rm) result.relations[rm[1].trim()] = rm[2].trim();
        });
        continue;
      }
      var grab = function (label) {
        var r = body.match(new RegExp(label + '\\s*[:：]\\s*([^\\n]+)'));
        return r ? r[1].trim() : '';
      };
      result.characters[name] = {
        outfit: grab('着装'),
        posture: grab('姿态'),
        place: grab('位置'),
        relation: grab('关系')
        // 心声刻意不解析
      };
    }
    // 关系回填：角色块里没写内联「关系：」的，从关系总览映射补（该角色在场才补得到）。
    // 关系总览常排在角色块之后，所以必须在整块扫完之后做第二遍。
    for (var cn in result.characters) {
      if (!result.characters[cn].relation && result.relations[cn]) {
        result.characters[cn].relation = result.relations[cn];
      }
    }
    return result;
  }

  var Status = {
    // 从最近一条带状态栏的楼层解析（一般就是最新楼）
    parseLatest: function () {
      try {
        var msgs = getChatMessages('0-{{lastMessageId}}');
        if (!msgs || !msgs.length) return null;
        for (var i = msgs.length - 1; i >= 0 && i >= msgs.length - 6; i--) {
          var p = parseStatusBlock(msgs[i] && msgs[i].message);
          if (p) return p;
        }
      } catch (e) { console.warn('[霖州引擎] 状态栏解析失败', e); }
      return null;
    },

    // 供楼层记录头部使用的时间文本
    nowText: function () {
      var p = this.parseLatest();
      return (p && p.time) || '';
    },

    // 供消息落库打日期标用（'2034年8月26日 星期五'）
    nowDay: function () {
      var p = this.parseLatest();
      return (p && p.dateText) || '';
    },

    // 供生成装配使用：时间 + user地点 + 目标角色情境块（含关系）
    snapshot: function (npcName) {
      var p = this.parseLatest();
      if (!p) return { time: '', userPlace: '', npc: null, overview: '' };
      var npc = null;
      if (npcName && p.characters[npcName]) {
        npc = p.characters[npcName];
        npc.name = npcName;
      }
      return {
        time: p.time,
        dateText: p.dateText,
        userPlace: p.userPlace,
        npc: npc,
        overview: p.overview
      };
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Status = Status;
  window.LZJM._parseStatusBlock = parseStatusBlock; // 供调试/测试
})();


// ── src/worldbook.js ──
// ═══════════════════════════════════════════════════════════
//  worldbook.js —— 世界书读取与解析
//
//  约定（设计文档 §5.1，条目按「备注/标题」识别）：
//    霖州蒋默::通讯录          → 全部 IF 线联系人/群 JSON
//    霖州蒋默::表情包          → 表情名→catbox 文件名（JSON 或逐行 名: 文件）
//    霖州蒋默::人设::周言      → 角色「周言」的生成资料（可多条，自动拼接）
//    NPC（高中线-核心人员）    → 线专属 NPC 档案：内容里 [NPC·名字] 块只在该线生效（重写式）
//    主角人设（大学线）        → 线演化层：内容里 [MAIN·名字·演化后] 块叠加到该人基础人设后
//
//  酒馆助手不同版本函数名有差异，这里做容错适配。
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  var MARK_ROSTER = '霖州蒋默::通讯录';
  var MARK_STICKER = '霖州蒋默::表情包';
  var MARK_STICKER_ALIAS = ['媒体与表情包_StickerData'];   // 卡组既有条目，直接兼容
  var MARK_PROFILE = '霖州蒋默::人设::';

  // ── 适配层：世界书列表与条目 ──
  async function bookNames() {
    try {
      if (typeof getCharWorldbookNames === 'function') {
        var n = getCharWorldbookNames('current');
        var out = [];
        if (n && n.primary) out.push(n.primary);
        if (n && n.additional) out = out.concat(n.additional);
        if (out.length) return out;
      }
    } catch (e) {}
    try {
      if (typeof getCharLorebooks === 'function') {
        var c = getCharLorebooks({ name: 'current' });
        var out2 = [];
        if (c && c.primary) out2.push(c.primary);
        if (c && c.additional) out2 = out2.concat(c.additional);
        return out2;
      }
    } catch (e) {}
    return [];
  }

  async function entriesOf(book) {
    try {
      if (typeof getWorldbook === 'function') {
        var es = await getWorldbook(book);
        if (es && es.length) return es;
      }
    } catch (e) {}
    try {
      if (typeof getLorebookEntries === 'function') {
        var es2 = await getLorebookEntries(book);
        if (es2 && es2.length) return es2;
      }
    } catch (e) {}
    return [];
  }

  async function allEntries() {
    var names = await bookNames();
    var all = [];
    for (var i = 0; i < names.length; i++) {
      try { all = all.concat(await entriesOf(names[i])); } catch (e) {}
    }
    return all;
  }

  function titleOf(e) {
    // 不同版本字段名有差异：name（旧）/ comment（新）都认
    return String((e && (e.name || e.comment || e.title || e.remark)) || '').trim();
  }
  function contentOf(e) {
    return String((e && (e.content || e.text)) || '');
  }

  // 从文本中抠出第一个 {...} 块并解析
  function extractJson(text) {
    var s = String(text || '');
    var start = s.indexOf('{');
    if (start === -1) return null;
    var depth = 0;
    for (var i = start; i < s.length; i++) {
      var ch = s[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { return null; }
      } }
    }
    return null;
  }

  // ── DLC 条目识别：条目标题 → 世界线。长标题按关键词命中（编号/副标题随意）：──
  //   「DLC扩展：大学篇·青野与负途」「DLC独立扩展资料：旧梦余温（成人篇…）」
  //   「DLC·大学」「大学篇…」都算大学线。无任何命中 = 高中默认线（见 engine 定位逻辑）。
  function matchDlcLine(t) {
    var s = String(t || '').replace(/[【】\[\]\s]/g, '');
    if (!s) return null;
    if (s.indexOf('DLC·成人') !== -1 || s.indexOf('成人篇') !== -1) return 'DLC·成人';
    if (s.indexOf('DLC·大学') !== -1 || s.indexOf('大学篇') !== -1) return 'DLC·大学';
    if (s.indexOf('DLC·高中') !== -1 || s.indexOf('高中篇') !== -1) return 'DLC·高中';
    return null;
  }

  // ── DLC 长文条目解析（设计文档 §5.1）：大学/成人篇的自由 Markdown 档案 ──
  // 段识别靠标题关键词，不靠编号（条目编号可能重号/跳号）：
  //   主角演化档案：蒋默（…）/ 蒋默·角色叠加演化档案（…） → 主角演化层（叠加）
  //   既有NPC…演化                                        → 各NPC演化层（叠加）
  //   新增…NPC                                            → 该线专属新NPC全档（重写式）
  // 段内条目：顶格「数字. 名字（说明）：」，正文到下一个顶格条目或段尾。
  function splitDlcItems(body, into) {
    var itemRe = /^(\d+)[.、]\s*([^\s（(：:]{1,12})\s*[（(]/gm;
    var marks = [], m;
    while ((m = itemRe.exec(body))) {
      marks.push({ name: m[2].trim(), start: m.index, headEnd: itemRe.lastIndex });
    }
    for (var i = 0; i < marks.length; i++) {
      var end = (i + 1 < marks.length) ? marks[i + 1].start : body.length;
      var text = body.slice(marks[i].headEnd, end).trim()
        .replace(/^[：:]\s*/, '')            // 「（说明）：」尾巴上的冒号
        .replace(/(?:\n|^)[-–—]{3,}\s*$/, '');  // 段尾分隔线
      if (marks[i].name && text) {
        into[marks[i].name] = into[marks[i].name] ? into[marks[i].name] + '\n' + text : text;
      }
    }
  }

  function parseDlcEntry(text) {
    var src = String(text || '');
    var out = { mainName: '', main: '', evol: {}, fresh: {} };
    // 切段：「## 一、 xxx」或「一、 xxx」（# 可有可无）
    var secRe = /^#{0,6}\s*([一二三四五六七八九十]+)、\s*(.+)$/gm;
    var secs = [], sm;
    while ((sm = secRe.exec(src))) {
      secs.push({ title: sm[2].trim(), start: secRe.lastIndex, headStart: sm.index });
    }
    for (var i = 0; i < secs.length; i++) {
      var end = (i + 1 < secs.length) ? secs[i + 1].headStart : src.length;
      var body = src.slice(secs[i].start, end).trim();
      var title = secs[i].title;
      var mainM = title.match(/主角演化档案[:：]\s*([^\s（(]+)/) ||
                  title.match(/^([^\s·（(]+)·角色叠加演化档案/);
      if (mainM) { out.mainName = mainM[1].trim(); out.main = body; continue; }
      if (/既有NPC/i.test(title) && /演化/.test(title)) { splitDlcItems(body, out.evol); continue; }
      if (/新增/.test(title) && /NPC/i.test(title)) { splitDlcItems(body, out.fresh); continue; }
      // 其余段落（时代切片/既往因果/现状格局等）不设档案，正文提示词暂不注入
    }
    return out;
  }

  // ── 表情包解析：JSON 对象，或逐行「名字: 文件名」/「名字=文件名」/「名字 文件名」 ──
  function parseStickers(text) {
    var j = extractJson(text);
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      var out = {};
      for (var k in j) out[String(k).trim()] = String(j[k]).trim();
      return out;
    }
    var map = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^\s*[-*•]?\s*([^:：=\s|【】]+)\s*[:：=|\s]\s*([A-Za-z0-9]+\.(?:jpg|jpeg|png|gif|webp))\s*$/i);
      if (m) map[m[1].trim()] = m[2];
    });
    return map;
  }

  // 多人条目拆分：内容里的 [NPC·名字] 块 → {名字: 块内容}（直到下一个块头或文末）
  function parseNpcBlocks(text) {
    return parseTaggedBlocks(text, 'NPC');
  }
  // [MAIN·名字·演化后] 块（时代演化档案用）；块名尾缀「·演化后」剥掉
  function parseMainBlocks(text) {
    var raw = parseTaggedBlocks(text, 'MAIN');
    var out = {};
    for (var k in raw) out[k.replace(/·演化后$/, '').trim()] = raw[k];
    return out;
  }
  // 通用块拆分：tag = NPC | MAIN
  // 块体边界取「后一个块头」与「下一个顶格 # 标题」的先到者——
  // 时代线条目常用 # I. 核心配角 / # II. 其他NPC 这类章节把不同批次的块隔开，
  // 只看块头会把章节标题（以及下一章的块）吞进前一块的档案体。
  function parseTaggedBlocks(text, tag) {
    var src = String(text || '');
    var out = {};
    var re = new RegExp('\\[' + tag + '·([^\\]\\n]+)\\]', 'g');
    var m, marks = [];
    while ((m = re.exec(src))) {
      marks.push({ name: m[1].trim(), start: m.index, headEnd: re.lastIndex });
    }
    var topRe = /^#{1,6}\s+/m;
    for (var i = 0; i < marks.length; i++) {
      var start = marks[i].headEnd;
      var end = (i + 1 < marks.length) ? marks[i + 1].start : src.length;
      var hm = topRe.exec(src.slice(start, end));
      if (hm) end = start + hm.index;
      var body = src.slice(start, end).trim()
        // 条目内常用 --- 分隔档案块，尾巴上的分隔线不属于档案内容
        .replace(/(?:\n|^)[-–—]{3,}\s*$/, '');
      if (marks[i].name && body) {
        out[marks[i].name] = out[marks[i].name] ? out[marks[i].name] + '\n' + body : body;
      }
    }
    return out;
  }

  // 条目名的线作用域识别：NPC（高中线-核心人员）/ NPC（大学线）/ 主角人设（大学线）
  // 括号里的内容即「线作用域」，由 engine 映射到具体世界线；不匹配返回 null（归全局池）
  function scopeOfTitle(t) {
    var m = /^(?:NPC|主角人设)（(.+)）$/.exec(String(t || '').replace(/[【】]/g, ''));
    return m ? m[1] : null;
  }

  // ── 通讯录区块规范化：把各种写法收成 {contacts:[{name,avatar}],groups:[{name,members,open,avatar,style,crowd}]} ──
  function normSection(sec) {
    sec = sec || {};
    var contacts = (sec.contacts || sec.friends || []).map(function (c) {
      if (typeof c === 'string') return { name: c, avatar: '' };
      return { name: String(c.name || '').trim(), avatar: String(c.avatar || c.avatar_file || '').trim(), cover: String(c.cover || '').trim() };
    }).filter(function (c) { return c.name; });
    var groups = (sec.groups || []).map(function (g) {
      if (typeof g === 'string') return { name: g, members: [] };
      return {
        name: String(g.name || '').trim(),
        members: (g.members || []).map(String).filter(function (n) { return n.trim() && !/^\{\{user\}\}$/i.test(n.trim()); }),
        open: !!g.open,
        avatar: String(g.avatar || '').trim(),
        style: g.style ? String(g.style) : '',
        crowd: g.crowd || ''
      };
    }).filter(function (g) { return g.name; });
    return {
      contacts: contacts, groups: groups,
      moments: { cover: String((sec.moments || {}).cover || '').trim() }
    };
  }

  var Worldbook = {
    // 返回 { rosters, stickers, profiles, states, dlcLineRaw }
    // states = { 条目标题: 是否勾选开启 }——世界线主条目定位用（enabled 字段读不到时按"开"记）
    // dlcLineRaw = [{line, parsed:{mainName, main, evol:{名字:文本}, fresh:{名字:文本}}}]——DLC长文条目解析结果
    load: async function () {      var result = { rosters: {}, stickers: {}, profiles: {}, states: {}, dlcLineRaw: [] };
      var names = await bookNames();
      console.log('[霖州引擎] 世界书：' + names.length + ' 本 → ' + names.join(' / '));
      var es = await allEntries();
      var seen = es.slice(0, 25).map(function (e) { return titleOf(e).slice(0, 24); });
      console.log('[霖州引擎] 共扫描 ' + es.length + ' 条，前若干条标题：' + seen.join(' | '));

      // 短标题条目的索引，供「人设兜底」用（条目名=角色名）
      var titleMap = {};
      for (var ti = 0; ti < es.length; ti++) {
        var tt = titleOf(es[ti]);
        if (tt && tt.length <= 15 && !(tt in titleMap)) titleMap[tt] = contentOf(es[ti]);
      }

      // 多人条目索引：内容里 [NPC·名字] 块拆出来，供「人设兜底」用。
      // 名字带线作用域的条目（NPC（高中线-核心人员）/NPC（大学线）/主角人设（大学线））
      // 不进全局池——各自归各线，免得两条线共用同一个人的同一版档案（静默串线）。
      var npcBlocks = {};
      var npcLineRaw = [];    // [{scope, blocks:{名字:文本}}]　线专属 NPC 档案，engine 映射线名
      var evolLineRaw = [];   // [{scope, blocks:{名字:文本}}]　[MAIN·名字·演化后] 时代演化层
      for (var bi = 0; bi < es.length; bi++) {
        var scope = scopeOfTitle(titleOf(es[bi]));
        if (scope) {
          if (/^NPC/.test(titleOf(es[bi]).replace(/[【】]/g, ''))) {
            npcLineRaw.push({ scope: scope, blocks: parseNpcBlocks(contentOf(es[bi])) });
          } else {
            evolLineRaw.push({ scope: scope, blocks: parseMainBlocks(contentOf(es[bi])) });
          }
          continue;
        }
        var nb = parseNpcBlocks(contentOf(es[bi]));
        for (var bn in nb) {
          if (!(bn in npcBlocks)) npcBlocks[bn] = nb[bn];
        }
      }

      for (var i = 0; i < es.length; i++) {
        var t = titleOf(es[i]);
        if (t && !(t in result.states)) result.states[t] = es[i].enabled !== false;
        if (t === MARK_ROSTER) {
          var j = extractJson(contentOf(es[i]));
          if (j && typeof j === 'object') {
            for (var line in j) {
              result.rosters[String(line).trim()] = normSection(j[line]);
            }
          }
        } else if (t === MARK_STICKER || MARK_STICKER_ALIAS.indexOf(t) !== -1) {
          var st = parseStickers(contentOf(es[i]));
          for (var k in st) result.stickers[k] = st[k];
        } else if (t.indexOf(MARK_PROFILE) === 0) {
          var who = t.slice(MARK_PROFILE.length).trim();
          if (who) {
            var prev = result.profiles[who];
            result.profiles[who] = prev ? prev + '\n' + contentOf(es[i]) : contentOf(es[i]);
          }
        } else {
          // DLC 长文条目（大学篇/成人篇）：主角演化层 + 既有NPC演化层 + 新增NPC全档
          var dlcLn = matchDlcLine(t);
          if (dlcLn) {
            result.dlcLineRaw.push({ line: dlcLn, parsed: parseDlcEntry(contentOf(es[i])) });
          }
          // 卡组既有条目直接收编：「角色设定：蒋默」→ 蒋默 的基础人设（高中原版，
          // 大学/成人线的演化层由带线作用域的条目叠加，机制见 npcLineRaw/evolLineRaw）。
          // 不强制用户为引擎单独复制一份人设条目。
          var roleM = t.match(/^角色设定[:：]\s*(.+)$/);
          if (roleM) {
            var rn = roleM[1].trim();
            if (rn) {
              var prevR = result.profiles[rn];
              result.profiles[rn] = prevR ? prevR + '\n' + contentOf(es[i]) : contentOf(es[i]);
            }
          }
        }
      }

      // 人设兜底：通讯录/群成员里有档案的人，按 条目名=角色名 > [NPC·名字]块 的顺序补
      for (var ln in result.rosters) {
        var sec = result.rosters[ln];
        var cs = (sec.contacts || []).map(function (c) { return c.name; });
        (sec.groups || []).forEach(function (g) { cs = cs.concat(g.members || []); });
        for (var ci = 0; ci < cs.length; ci++) {
          var cn = cs[ci];
          if (!result.profiles[cn]) result.profiles[cn] = titleMap[cn] || npcBlocks[cn] || '';
        }
      }

      // 头像/表情预热：世界书一装载就拉进浏览器缓存，
      // 避免再次打开手机时 <img> 重新请求出现空白闪帧（壁纸同款思路，见 wechat.js 模块头）
      try {
        var preSeen = {};
        var preList = [];
        var preAdd = function (file) {
          var u = Worldbook.imgUrl(file);
          if (u && !preSeen[u]) { preSeen[u] = 1; preList.push(u); }
        };
        for (var rn in result.rosters) {
          var rsec = result.rosters[rn];
          (rsec.contacts || []).forEach(function (c) {
            if (c.avatar) preAdd(c.avatar);
            if (c.cover) preAdd(c.cover);
          });
          (rsec.groups || []).forEach(function (g) { if (g.avatar) preAdd(g.avatar); });
          if (rsec.moments && rsec.moments.cover) preAdd(rsec.moments.cover);
        }
        for (var sk in result.stickers) preAdd(result.stickers[sk]);
        for (var pi = 0; pi < preList.length; pi++) { var pim = new Image(); pim.src = preList[pi]; }
      } catch (e) {}
      result.npcLineRaw = npcLineRaw;
      result.evolLineRaw = evolLineRaw;
      return result;
    },

    // 重读全部条目的勾选状态（玩家在世界书界面手动开关条目后，加载时的快照已过时）
    readStates: async function () {
      var es = await allEntries();
      var states = {};
      for (var i = 0; i < es.length; i++) {
        var t = titleOf(es[i]);
        if (t && !(t in states)) states[t] = es[i].enabled !== false;
      }
      return states;
    },

    // 按条目标题批量开关条目（世界线归位/选线界面用）。
    // ops = [{match: '高中时代', enable: true}]，按去掉【】与空白后的标题匹配；
    // 只改匹配到的条目，其余原样保留，整本结构不动。
    // 新接口 updateWorldbookWith（回调式，天然防误伤）优先，老接口 getWorldbook+replaceWorldbook 兜底。
    setEntriesEnabled: async function (ops) {
      var names = await bookNames();
      if (!names.length) throw new Error('未找到角色卡世界书');
      var norm = function (s) { return String(s || '').replace(/[【】\s]/g, ''); };
      var want = {};
      ops.forEach(function (o) { want[norm(o.match)] = !!o.enable; });
      var render = { render: 'immediate' };   // 翻完立即重估注入，不等界面防抖
      // DLC 条目标题是长名（「DLC扩展：大学篇·青野与负途」），命中词允许包含匹配；
      // 精确相等优先，避免短词误伤
      var flip = function (entries) {
        for (var j = 0; j < entries.length; j++) {
          var t = norm(titleOf(entries[j]));
          for (var w in want) {
            if (t === w || t.indexOf(w) !== -1) {
              entries[j].enabled = want[w];        // 酒馆助手封装字段
              entries[j].disable = !want[w];       // ST 原生字段，双保险
              break;
            }
          }
        }
        return entries;
      };
      if (typeof updateWorldbookWith === 'function') {
        for (var i = 0; i < names.length; i++) {
          try { await updateWorldbookWith(names[i], flip, render); } catch (e) {}
        }
        return;
      }
      if (typeof getWorldbook === 'function' && typeof replaceWorldbook === 'function') {
        for (var k = 0; k < names.length; k++) {
          try {
            var es = await getWorldbook(names[k]);
            if (!es || !es.length) continue;
            var hit = false;
            for (var m = 0; m < es.length; m++) {
              if (norm(titleOf(es[m])) in want) { hit = true; break; }
            }
            if (hit) await replaceWorldbook(names[k], flip(es), render);
          } catch (e) {}
        }
      }
    },

    imgUrl: function (file) {
      file = String(file || '').trim();
      if (!file) return '';
      if (/^https?:\/\//i.test(file)) return file;
      return (window.LZJM.IMG_BASE || 'https://files.catbox.moe/') + file;
    },

    matchDlcLine: matchDlcLine,
    parseDlcEntry: parseDlcEntry
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Worldbook = Worldbook;
})();


// ── src/prompt.js ──
// ═══════════════════════════════════════════════════════════
//  prompt.js —— 数字世界引擎 · 提示词装配
//
//  框架：AI 不是"扮演角色"，而是数字生活应用的模拟引擎。
//  引擎不认角色，只认「应用 + 人 + 资料」——
//  微信私聊/群聊/未来的论坛，都只是不同的资料与输出要求。
//
//  ⚠ 提示词不走酒馆宏替换（generateRaw 独立生成），
//    {{user}} 必须在装配时换成 persona 真名，见 me()。
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  // 携带量配置：曾经写死的常量，现由设置 app 可调（Store.cfg()，默认值在 store.js）
  function cfg() {
    try { return window.LZJM.Store.cfg(); } catch (e) {}
    return { plotFloors: 8, plotCap: 900, histPriv: 50, histGroup: 50, crossMax: 3, crossLines: 18, injRecent: 8, injMention: 4, injMax: 3, injRounds: 20 };
  }

  // ── persona 真名。generateRaw 不做宏替换，{{user}} 会原文进提示词，
  //    所以这里自己解析（与 engine.js userName() 同一套回退）。──
  function me() {
    try {
      var W = window.LZJM;
      if (W && W.Engine && W.Engine.userName) {
        var n = W.Engine.userName();
        if (n && n !== '我') return n;
      }
    } catch (e) {}
    try {
      var st = window.parent.SillyTavern;
      var ctx = st && st.getContext && st.getContext();
      if (ctx && ctx.name1) return String(ctx.name1);
    } catch (e) {}
    return '我';
  }

  // ── 虚构沙盒声明：所有生成入口共用，置于提示词最前。
  //    作用：把整段文本锚定为封闭互动小说创作任务（给平台外审定性用），
  //    明确人物/转账/通话皆虚构，不指向真实个人与真实金钱往来。
  var FICTION = '# 虚构沙盒\n' +
    '这是一部封闭互动小说的内部生成任务：文中所有人物、对话、转账、通话记录均为虚构创作内容，不指向任何真实个人，不构成真实金钱往来。未涉及、描绘或伤害任何真实人物，目的仅仅是为了塑造动态生动的虚拟人物情感和数字世界。你的唯一任务是按下方格式要求，续写这部小说中手机应用内出现的消息。';

  // ── 主线近况：最近 N 楼，去 HTML/代码块/思考块，每楼截断 ──
  function mainContext() {
    try {
      var msgs = getChatMessages('0-{{lastMessageId}}');
      if (!msgs || !msgs.length) return '';
      return msgs.slice(-cfg().plotFloors).map(function (m) {
        var t = String((m && m.message) || '')
          // 状态栏是机器可读的元数据（时间/着装/心声等），已由「当前情境」按需引用，
          // 这里整段剔除——只剥标签会留下无主的「着装：…」碎片，严重干扰模型
          .replace(/<status>[\s\S]*?<\/status>/gi, '')
          // 旧版写进主楼层的手机记录块一并剔除（手机历史在「聊天记录」节单独给出）
          .replace(/\[📱[\s\S]*?\/\📱\]\s*/g, '')
          // 思维链：think 与 cot 两种标签都剥（后者见于部分前端/预设的推理输出）
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
          .replace(/<cot>[\s\S]*?<\/cot>/gi, '')
          // 预设的结构化输出块：summary 摘要 / choice(s) 分支选项，只剥标签会留碎片，整段剔除
          .replace(/<summary>[\s\S]*?<\/summary>/gi, '')
          .replace(/<choices?>[\s\S]*?<\/choices?>/gi, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{2,}/g, '\n')
          .trim();
        // 截断尽量落在行边界，避免半句话/半个词糊在切口上
        if (t.length > cfg().plotCap) {
          var cut = t.lastIndexOf('\n', cfg().plotCap);
          if (cut < cfg().plotCap * 0.5) cut = t.lastIndexOf('。', cfg().plotCap);
          if (cut < cfg().plotCap * 0.5) cut = cfg().plotCap;
          t = t.substring(0, cut) + '……（此楼后续从略）';
        }
        return (m.role === 'user' ? me() : '旁白') + '：' + t;
      }).filter(function (l) { return l.length > 4; }).join('\n');
    } catch (e) { return ''; }
  }
  // ── 单条消息 → 契约语法文本（与「消息类型」说明完全一致，AI 不用猜） ──
  // 转账类必带状态尾巴：AI 得知道这笔钱的下落，否则会重复转账/重复收款
  function msgBody(m) {
    switch (m.kind) {
      case 'sticker':  return '[表情:' + m.text + ']';
      case 'voice':    return '[语音:' + m.text + ']';
      case 'image':    return '[图片:' + m.text + ']';
      case 'poke':     return '[戳一戳]';
      case 'calllog':  return '[' + (m.mode === 'video' ? '视频通话' : '语音通话') + (m.text ? ' · ' + String(m.text).replace(/^通话时长 /, '') : '') + ']';
      case 'location': return '[定位:' + m.text + ']';
      case 'transfer': {
        var tstat = m.state === 'accepted' ? (m.who === 'user' ? '（对方已收款）' : '（机主已收下）')
          : m.state === 'declined' ? (m.who === 'user' ? '（对方已拒收）' : '（机主已退还）')
          : '（待收款）';
        return m.who === 'user'
          ? '[转账给' + (m.to || '对方') + ' ¥' + m.amount + (m.note ? '（' + m.note + '）' : '') + ']' + tstat
          : '[' + m.who + '转账 ¥' + m.amount + (m.note ? '（' + m.note + '）' : '') + ']' + tstat;
      }
      case 'taccept': return m.who === 'user'
        ? '[收下了' + (m.from || '对方') + '的转账 ¥' + m.amount + ']'
        : '[' + m.who + '收下了转账 ¥' + m.amount + ']';
      case 'tdecline': return m.who === 'user'
        ? '[退还了' + (m.from || '对方') + '的转账 ¥' + m.amount + ']'
        : '[' + m.who + '拒收了转账 ¥' + m.amount + ']';
      default:         return String(m.text || '');
    }
  }

  // ── 应用内聊天记录文本（发言人用真名，不再出现 {{user}}） ──
  // 消息带 day（状态栏日期文本）时，跨天插入 [昨天 22:10] 这类时间标
  function parseDay(s) {
    var m = /(\d+)年(\d+)月(\d+)日/.exec(s || '');
    return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
  }
  function dayNum(p) { return p.y * 372 + p.mo * 31 + p.d; }
  function relDay(day, cur) {
    var a = parseDay(day), b = parseDay(cur);
    if (!a) return day;
    if (!b) return a.mo + '月' + a.d + '日';
    var diff = dayNum(b) - dayNum(a);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    return (a.y !== b.y ? a.y + '年' : '') + a.mo + '月' + a.d + '日';
  }
  function histText(hist, n, withNames, curDay) {
    var out = [];
    var prevDay = null;
    hist.slice(-n).forEach(function (m) {
      if (m.day && m.day !== prevDay) {
        out.push('[' + relDay(m.day, curDay) + (m.time ? ' ' + m.time : '') + ']');
        prevDay = m.day;
      }
      var body = msgBody(m);
      if (m.recalled) body += '（此条已撤回）';
      if (!withNames) { out.push(body); return; }
      var who = m.who === 'user' ? me() : m.who;
      out.push(who + '：' + body);
    });
    return out.join('\n');
  }

  // ── 消息类型语法说明（输出要求的一部分） ──
  function typeSyntax(stickerNames) {
    var stickerLine = (stickerNames && stickerNames.length)
      ? '- [表情:名字]  只可选用图库现有名字，严禁编造：' + stickerNames.join('、')
      : '- [表情:名字]  图库为空，本次请勿发送表情';
    return [
      '消息类型（按需单独成行，不用则不写）：',
      stickerLine,
      '- [语音:要说的话]',
      '- [图片:画面描述]',
      '- [戳一戳]',
      '- [定位:地点名]',
      '- [转账:金额:备注]  单独成行：给机主转一笔钱，备注可省（罕用，剧情真的需要给钱时；机主会在手机上点收下或拒绝）',
      '- [拒收转账:金额:备注]  单独成行：拒收机主发来的转账（更罕用，剧情需要退钱时，如不好意思收、赌气退回；机主的卡会显示已退还）',
      '- [撤回]  单独成行：撤回自己刚发的上一条消息（打错字、冲动后悔时用，罕用）'
    ].join('\n');
  }

  // ── 一致性规则（防开天眼） ──
  function consistencyRules(entityDesc) {
    return [
      '## 一致性规则',
      '- ' + entityDesc + '只知道两类事：①本人亲眼所见、亲耳所闻的；②对方在微信里明确告诉本人的。',
      '- 以下一律不知：主线中没有本人出场的段落、其他私聊、其他群聊、对方此刻在哪里/在干什么/穿着什么、任何人的内心想法。',
      '- 想谈本人不在场的事，只能用「听说……」「你今天怎么样」这类不确定的说法开口，不得讲出细节。',
      '- 宁可少说，不可全知。说漏即出戏。'
    ].join('\n');
  }

  function situationBlock(snapshot) {
    var lines = [];
    if (snapshot && snapshot.time) {
      var when = snapshot.dateText ? snapshot.dateText + ' ' + snapshot.time : snapshot.time;
      lines.push('当前时间：' + when);
    }
    if (snapshot && snapshot.userPlace) {
      lines.push(me() + '此刻在：' + snapshot.userPlace + '（仅作参考，不代表你的位置）');
    }
    if (snapshot && snapshot.npc) {
      var bits = [];
      if (snapshot.npc.place) bits.push('位置：' + snapshot.npc.place);
      if (snapshot.npc.posture) bits.push('姿态：' + snapshot.npc.posture);
      if (bits.length) lines.push('你（' + (snapshot.npc.name || '本人') + '）此刻：' + bits.join('，'));
      // 关系项：卡面状态栏固定维护（如「克制内敛的青梅竹马，尚未告白」）。
      // 它是防情感越界出戏的主锚点，必须显式给出并划定表达上限。
      if (snapshot.npc.relation) {
        lines.push('你与' + me() + '的关系：' + snapshot.npc.relation + '——一切情感表达不得越过这个阶段');
      }
    }
    if (snapshot && snapshot.overview) {
      lines.push('人物关系总览：' + snapshot.overview);
    }
    return lines.join('\n');
  }

  var Prompt = {

    // ── 私聊 ──
    // tail = 本轮最新一批用户消息：不混在系统块里，作为最后的 user 轮单独给出
    // userInfo = 机主资料（persona 描述 + 当前线演化层），所有会话统一带上
    // crossGroups = 对方在的群当天记录尾巴（群→私聊跨会话上下文；对方在场，与防开天眼自洽）
    // callLog = 当日通话尾巴 {kind, dur, lines}：两人今天还在通话里说过的话，双方都记得
    // momentsNote = 近期朋友圈摘要（对方 3 天内发过的动态 + 机主互动痕迹，对方都记得）
    // myNote = 机主自己近 3 天的动态及互动（对方刷得到，可主动提起）
    private: function (contact, hist, snapshot, stickerNames, tail, digest, userInfo, crossGroups, callLog, momentsNote, myNote) {
      var myName = me();
      var tailLines = (tail && tail.length) ? histText(tail, 8, false) : '';
      var p = [
        '# 虚构沙盒',
        '',
        FICTION,
        '',
        '# 数字世界 · 回应生成',
        '',
        '本次任务：生成应用「微信」里，来自「' + contact.name + '」的新消息。',
        '',
        contact.profile ? '## 人物档案 · ' + contact.name + '\n' + contact.profile : '## 人物档案 · ' + contact.name + '\n（暂无档案，依据对话上下文自然演绎）',
        '',
        userInfo ? '## 机主资料 · ' + myName + '\n（微信这头的人，与「' + contact.name + '」对话的主角）\n' + userInfo : '',
        '',
        situationBlock(snapshot) ? '## 当前情境\n' + situationBlock(snapshot) : '',
        '',
        mainContext() ? '## 主线近况（只作背景，下方规则优先）\n' + mainContext() : '',
        '',
        '## 聊天记录 · 与' + myName + '的微信对话',
        '（优先承接这里的话题与语气；' + myName + '本轮发来的最新消息在末尾单独给出）',
        digest ? '（更早的记录已折叠为提要，供接续话题与承诺用：' + digest + '）' : '',
        histText(hist, cfg().histPriv, true, snapshot && snapshot.dateText),
        '',
        callLog
          ? '## 今日通话（' + callLog.kind + ' · ' + callLog.dur + ' · 双方已说的话' + (callLog.video ? '与画面' : '') + '）\n' +
            '（私聊之外，今天两人还在' + callLog.kind + '里说过这些——机主记得，「' + contact.name + '」也记得；承接其中话题、承诺、玩笑时必须一致）\n' +
            callLog.lines.join('\n')
          : '',
        momentsNote
          ? '## 近期朋友圈（近3天，另附机主互动过的旧动态）\n（对方近几天发过的动态；机主点过赞/留过言的——哪怕是几天前的旧动态——对方一直记得，互动是刚发生的，可自然提起、调侃或耿耿于怀；没互动的也能成为话题）\n' + momentsNote
          : '',
        myNote
          ? '## 机主发过的朋友圈（近3天）\n（机主这几天发的动态，对方都刷得到、看得见谁点了赞；可在聊天里自然提起、接梗、调侃或已读不回）\n' + myNote
          : '',
        (crossGroups && crossGroups.length)
          ? '## 相关群聊近况（下列记录中对方本人均在场，可自由承接其中的话题、情绪与玩笑）\n' + crossGroups.map(function (g) {
              return '群「' + g.name + '」今日的记录：\n' + histText(g.hist, cfg().crossLines, true, snapshot && snapshot.dateText);
            }).join('\n\n')
          : '',
        '',
        consistencyRules('「' + contact.name + '」'),
        '',
        '## 输出要求',
        '- 只输出「' + contact.name + '」发来的新消息，1~5 条，按情绪与话题自然增减，必要时可超出（如情绪激动）',
        '- 每条独立成行，只写消息内容；不要前缀、时间戳、动作描写、括号心理',
        '- 每条不超过 35 字，像真人打字，不重复对方刚说过的话',
        '- 「' + contact.name + '」的情感与态度必须符合上方「关系」所述阶段，遵循人设和关系进度双重约束，输出最符合的人物聊天反馈信息',
        typeSyntax(stickerNames),
        '- 直接输出消息本身，不要以「好的」「收到」这类寒暄开头'
      ].filter(function (s) { return s !== ''; }).join('\n');

      return {
        ordered_prompts: [
          { role: 'system', content: p },
          {
            role: 'user',
            content: tailLines
              ? '（' + myName + '刚在微信里发来以下消息。请严格按上方输出要求，只输出「' + contact.name + '」的新消息本身。）\n' + tailLines
              : '（现在轮到「' + contact.name + '」回复' + myName + '。请严格按上方输出要求，只输出消息本身。）'
          }
        ],
        should_silence: true,
        max_chat_history: 0
      };
    },

    // ── 通话邀请：机主拨打了语音/视频通话，AI 决定接/拒 ──
    // 约定：两种反应都带标识便于解析剔除——拒绝 → 第一行以 [拒绝] 开头，可附一句简短说明；
    // 接听 → 以 [接听] 开头，其后接接通后的开场（台词与画面交织）。
    // 视频通话的可见状态用 [画面] 行写，插在动作发生的对应位置（可穿插多行，不只开头）。
    // 呼叫页等待期间的一次生成。
    callInvite: function (contact, hist, snapshot, userInfo, mode, crossGroups) {
      var myName = me();
      var kind = mode === 'video' ? '视频通话' : '语音通话';
      var outReq = mode === 'video' ? [
        '## 输出要求（严格遵守，二选一）',
        '- 接听：第一行以 [接听] 开头；其后是接通后的开场——台词与画面交织，每行要么是「' + contact.name + '」的口语台词，要么是以 [画面] 开头的一行可见状态（在哪、姿势、表情、衣着、手上动作；只写看得见的东西，就写在该动作发生的对应位置，可穿插多行：一边说一边做的事要插在对应台词旁边）',
        '- 拒绝：第一行以 [拒绝] 开头，其后可附一句简短说明（如「在忙，晚点回」），也可不附',
        '- [接听]/[拒绝]/[画面] 是程序解析用的标记，只输出标记本身，不要给标记加引号或其他说明',
        '- 台词口语化：短句、停顿感、可有语气词；不要引号、动作描写、心理括号、时间戳（动作只写进 [画面] 行）',
        '- 决定须符合上方「关系」阶段与当前情境（深夜/工作时间/在群里刚聊过等）'
      ].join('\n') : [
        '## 输出要求（严格遵守，二选一）',
        '- 接听：第一行以 [接听] 开头，其后接 1~3 行口语台词，像真人打电话的开场',
        '- 拒绝：第一行以 [拒绝] 开头，其后可附一句简短说明（如「在忙，晚点回」），也可不附',
        '- [接听]/[拒绝] 是程序解析用的标记，只输出标记本身，不要给标记加引号或其他说明',
        '- 不得输出引号、动作描写、心理括号、时间戳',
        '- 决定须符合上方「关系」阶段与当前情境（深夜/工作时间/在群里刚聊过等）'
      ].join('\n');
      var p = [
        '# 虚构沙盒',
        '',
        FICTION,
        '',
        '# 数字世界 · ' + kind + '邀请',
        '',
        '本次任务：机主「' + myName + '」给「' + contact.name + '」发起了' + kind + '，生成对方的反应。',
        '',
        contact.profile ? '## 人物档案 · ' + contact.name + '\n' + contact.profile : '',
        '',
        userInfo ? '## 机主资料 · ' + myName + '\n' + userInfo : '',
        '',
        situationBlock(snapshot) ? '## 当前情境\n' + situationBlock(snapshot) : '',
        '',
        mainContext() ? '## 主线近况（只作背景，下方规则优先）\n' + mainContext() : '',
        '',
        (crossGroups && crossGroups.length)
          ? '## 相关群聊近况（下列记录中对方本人均在场）\n' + crossGroups.map(function (g) {
              return '群「' + g.name + '」今日的记录：\n' + histText(g.hist, cfg().crossLines, true, snapshot && snapshot.dateText);
            }).join('\n\n')
          : '',
        '',
        '## 聊天记录 · 与' + myName + '的微信对话（通话前的最近消息，供接续话题与语气）',
        histText(hist || [], 20, true, snapshot && snapshot.dateText),
        '',
        consistencyRules('「' + contact.name + '」'),
        '',
        outReq
      ].filter(function (s2) { return s2 !== ''; }).join('\n');
      return {
        ordered_prompts: [
          { role: 'system', content: p },
          { role: 'user', content: '（' + myName + '的' + kind + '正在呼叫' + contact.name + '。请按输出要求生成对方的反应。）' }
        ],
        should_silence: true,
        max_chat_history: 0
      };
    },

    // ── 通话轮：通话进行中，机主说了一句（或要求接续），生成对方台词 ──
    // transcript = 「名字：…/机主：…」台词行；userSays = 机主本轮说的话（可空）
    callTurn: function (contact, transcript, hist, snapshot, userInfo, mode, crossGroups, userSays) {
      var myName = me();
      var kind = mode === 'video' ? '视频通话' : '语音通话';
      var outReq = mode === 'video' ? [
        '## 输出要求',
        '- 输出 = 「' + contact.name + '」的台词与画面交织流：每行要么是台词，要么是以 [画面] 开头的一行可见状态（在哪、姿势、表情、衣着、手上的动作；只写看得见的东西）',
        '- [画面] 行穿插在台词中间、写在该动作发生的时刻——他一边说一边做的事（吃了片薯片、抬头看镜头、擦了把汗）就插在对应台词旁边，不要全堆在开头或结尾',
        '- 台词行数随情境自然决定（聊得热络可以多说，无事可说就少），口语化：短句、停顿感、可有语气词，不要书面腔',
        '- 每行独立，不要引号、动作描写、心理括号、时间戳（动作只写进 [画面] 行）',
        '- 情感与态度符合上方「关系」阶段；吵架、撒娇、汇报都按当前关系该有度',
        '- 不要复述机主刚说的话'
      ].join('\n') : [
        '## 输出要求',
        '- 只输出「' + contact.name + '」的台词，1~5 行，按情绪与话题自然增减（激动时可更多）',
        '- 口语化，像真人打电话：短句、停顿感、可有语气词；不要书面腔',
        '- 每行独立，不要引号、动作描写、心理括号、时间戳',
        '- 情感与态度符合上方「关系」阶段；吵架、撒娇、汇报都按当前关系该有度',
        '- 不要复述机主刚说的话'
      ].join('\n');
      var p = [
        '# 虚构沙盒',
        '',
        FICTION,
        '',
        '# 数字世界 · ' + kind + (mode === 'video' ? ' · 画面与台词' : '') + '进行中',
        '',
        '本次任务：生成' + kind + '中「' + contact.name + '」接下来的' + (mode === 'video' ? '画面与台词。' : '台词。'),
        '',
        contact.profile ? '## 人物档案 · ' + contact.name + '\n' + contact.profile : '',
        '',
        userInfo ? '## 机主资料 · ' + myName + '\n' + userInfo : '',
        '',
        situationBlock(snapshot) ? '## 当前情境\n' + situationBlock(snapshot) : '',
        '',
        mainContext() ? '## 主线近况（只作背景，下方规则优先）\n' + mainContext() : '',
        '',
        (crossGroups && crossGroups.length)
          ? '## 相关群聊近况（下列记录中对方本人均在场，可自然提及）\n' + crossGroups.map(function (g) {
              return '群「' + g.name + '」今日的记录：\n' + histText(g.hist, cfg().crossLines, true, snapshot && snapshot.dateText);
            }).join('\n\n')
          : '',
        '',
        '## 近期私聊记录（通话之外的消息，供接续话题）',
        histText(hist || [], 10, true, snapshot && snapshot.dateText),
        '',
        '## 通话记录（' + kind + ' · 双方已说的话' + (mode === 'video' ? '与画面' : '') + '）',
        transcript || '（刚接通）',
        '',
        consistencyRules('「' + contact.name + '」'),
        '',
        outReq
      ].filter(function (s2) { return s2 !== ''; }).join('\n');
      return {
        ordered_prompts: [
          { role: 'system', content: p },
          { role: 'user', content: userSays
              ? '（' + myName + '在' + kind + '里说：「' + userSays + '」。请生成「' + contact.name + '」的台词。）'
              : '（' + kind + '沉默了几秒。请生成「' + contact.name + '」接下来的台词。）' }
        ],
        should_silence: true,
        max_chat_history: 0
      };
    },

  // ── 朋友圈 · 首次填充：为抽中的几位各写一条近期动态 ──
  // people = [{name, profile}]（引擎侧已随机抽好 3~4 位，按时间从早到晚排）
  // 契约语法：[动态:名字:文字] 一人一条，[配图:名字:描述] 可选（至多一半人配）
  //           [点赞:点赞者1、点赞者2] / [评论:评论者@被回复的人:内容] 可选（都紧跟在对应动态之后）
  momentsFill: function (people, snapshot, userInfo) {
    var myName = me();
    var p = [
        '# 虚构沙盒',
        '',
        FICTION,
        '',
      '# 数字世界 · 朋友圈动态生成',
      '',
      '本次任务：为应用「微信·朋友圈」生成几位联系人的近期动态。',
      '机主「' + myName + '」刚打开朋友圈，刷到朋友们这几天陆续发的动态。',
      '',
      '## 当前情境\n' + (situationBlock(snapshot) || '（暂无）'),
      '',
      mainContext() ? '## 主线近况（只作背景，动态可与当天的事轻微相关，但不必强行呼应）\n' + mainContext() : '',
      '',
      userInfo ? '## 机主资料 · ' + myName + '\n' + userInfo : '',
      '',
      '## 要发动态的人（各自独立写各自的生活）',
      people.map(function (pp) { return '- ' + pp.name + '：\n' + (pp.profile ? String(pp.profile).trim() : '（无档案）'); }).join('\n'),
      '',
      '## 输出要求（严格遵守）',
      '- 每位各输出一条动态，按发布时间从早到晚排列（最早的最先输出）',
      '- 格式严格为：[动态:名字:动态文字]（单行，标记外不要任何其他内容）',
      '- 每条动态后紧跟一行发布时间：[时间:M月D日 HH:MM]（24 小时制；以当前情境时间为准，不得晚于当前时刻；几条动态的时刻彼此拉开，昨天到今天为主，个别可早到几天前的白天）',
      '- 动态文字 ≤70 字，可以只有几个字——篇幅和文风看这个人：有的人一张图就是全部（配文极短），有的人一两句碎碎念，有的人写小作文甚至写诗，有的人发疯抽象。不要"为了发动态而发动态"的流水账，不要凑字数的抒情小作文',
      '- 内容优先是这个人自己的生活：学业/工作/爱好/朋友/家人/吐槽/偶然撞见的小事，与主线轻微相关即可，不必围着机主转',
      '- 口吻必须符合各人人设；不要刻意凑 emoji（不是每条动态都需要）',
      '- 至多一半的人配图片；配图单独一行：[配图:名字:画面描述]（描述 ≤40 字，写看得见的内容，认真党写细节、随手拍一句话带过），跟在对应动态之后',
      '- 朋友圈是活的：可在动态后配熟人互动（都是紧跟在该动态后面的行，不每条都配满）——',
      '  · 点赞一行：[点赞:点赞者1、点赞者2]（至多 5 人，从共同熟人里挑）',
      '  · 评论一行：[评论:评论者@被回复的人:评论内容]（每条动态至多 3 条，≤25 字；@后面是被回复的人，可以是作者也可以是前面的评论者；普通评论省略@写成 [评论:评论者:评论内容]）',
      '- 互动口吻要符合关系：损友互怼、熟人捧场、长辈式关心，不要客套水军味',
      '- 不要点名单「' + myName + '」，不要写需要机主回复的问句（机主只是刷到，还没互动）',
      '- 各人的动态主题互不重复；除 [动态]/[时间]/[配图]/[点赞]/[评论] 行外不要输出任何其他内容'
    ].filter(function (s) { return s !== ''; }).join('\n');
    return {
      ordered_prompts: [
        { role: 'system', content: p },
        { role: 'user', content: '（请按输出要求生成上述 ' + people.length + ' 位联系人的朋友圈动态。）' }
      ],
      should_silence: true,
      max_chat_history: 0
    };
  },

  // ── 朋友圈 · 评论回复：机主评论了某条动态，生成 NPC 们的接话 ──
  // post = 动态条目 {who, text, img?}；comments = 现有平铺评论
  // people = 涉及的人（作者+已有评论者）的 [{name, profile}]
  // 契约语法：[评论:名字:内容]；回复机主 → [评论:名字@机主名:内容]
  momentsReply: function (post, comments, userSays, people, snapshot, userInfo) {
    var myName = me();
    var cmtLines = (comments || []).map(function (c) {
      return (c.replyTo ? c.who + ' 回复 ' + c.replyTo : c.who) + '：' + c.text;
    });
    var p = [
        '# 虚构沙盒',
        '',
        FICTION,
        '',
      '# 数字世界 · 朋友圈评论回复',
      '',
      '本次任务：机主「' + myName + '」刚评论了「' + post.who + '」的朋友圈动态，生成之后接话的评论。',
      '',
      situationBlock(snapshot) ? '## 当前情境\n' + situationBlock(snapshot) : '',
      '',
      userInfo ? '## 机主资料 · ' + myName + '\n' + userInfo : '',
      '',
      '## 涉及的人',
      people.map(function (pp) { return '- ' + pp.name + '：\n' + (pp.profile ? String(pp.profile).trim() : '（无档案）'); }).join('\n'),
      '',
      '## 动态（' + post.who + '发布' + (post.when ? '于 ' + post.when : '') + (post.img ? '，配图：' + post.img : '') + '）',
      post.text,
      '',
      '## 已有评论',
      cmtLines.length ? cmtLines.join('\n') : '（暂无）',
      '',
      '## 机主刚发布的评论',
      myName + '：' + userSays,
      '',
      '## 输出要求（严格遵守）',
      '- 生成 0~3 条接话评论，每条一行，格式严格为：[评论:名字:评论内容]',
      '- 回复机主时格式为：[评论:名字@' + myName + ':评论内容]；回复其他评论者同理 @ 对方名字',
      '- 朋友圈口吻：短（≤25 字）、轻松、可玩梗可阴阳，但须符合各人与机主的关系阶段',
      '- 没有谁接话就不输出那一条；至多 5 条，看热闹程度定——冷清的动态 0 条也行；除 [评论] 行外不要输出任何其他内容'
    ].filter(function (s) { return s !== ''; }).join('\n');
    return {
      ordered_prompts: [
        { role: 'system', content: p },
        { role: 'user', content: '（机主刚评论了这条动态。请按输出要求生成接话评论，可 0 条。）' }
      ],
      should_silence: true,
      max_chat_history: 0
    };
  },

  // ── 朋友圈 · 机主动态的回应：机主刚发了条动态，生成朋友们的点赞与评论 ──
  // post = {who, text, img?, when?}（who 恒为机主）；people = 全部候选朋友 [{name, profile}]
  // recentPriv / recentGrp = 机主当天私聊（≤20 行）/ 群聊（≤30 行）动静，引擎侧拼好，反应可接这些梗
  // 动态正文不放 system（会埋在档案中间），由最后的 user 消息指代给出
  // 契约语法：[赞:名字] ×1~4、[评论:名字:评论内容] ×0~2
  momentsReact: function (post, people, snapshot, userInfo, recentPriv, recentGrp) {
    var myName = me();
    var p = [
        '# 虚构沙盒',
        '',
        FICTION,
        '',
      '# 数字世界 · 朋友圈回应',
      '',
      '本次任务：机主「' + myName + '」刚发了一条朋友圈动态，生成朋友们刷到之后的反应。',
      '',
      situationBlock(snapshot) ? '## 当前情境\n' + situationBlock(snapshot) : '',
      '',
      mainContext() ? '## 主线近况（只作背景，反应可与当天的事轻微相关）\n' + mainContext() : '',
      '',
      userInfo ? '## 机主资料 · ' + myName + '\n' + userInfo : '',
      '',
      recentPriv
        ? '## 机主今天的私聊（朋友们都在这些对话现场或能刷到，反应可接其中的梗）\n' + recentPriv
        : '',
      recentGrp
        ? '## 机主今天的群聊（反应可接其中的梗）\n' + recentGrp
        : '',
      '## 可能刷到这条动态的人（只能从中挑人，一人至多反应一次）',
      people.map(function (pp) { return '- ' + pp.name + '：\n' + (pp.profile ? String(pp.profile).trim() : '（无档案）'); }).join('\n'),
      '',
      '## 输出要求（严格遵守）',
      '- 针对机主刚发的那条动态（最后一条用户消息里给出）生成反应',
      '- 生成 1~4 个 [赞:名字] 行，再生成 0~2 条 [评论:名字:评论内容] 行；每人只许出现一次（要么赞要么评论）',
      '- 谁会有反应由动态内容与人设决定：关系近的、爱玩梗的更容易冒泡；有人完全无感、没人评论也正常',
      '- 评论口径：短（≤25 字）、像真人在朋友圈留的言，可玩梗可阴阳，须符合此人与机主的关系阶段',
      '- 不要替机主回复，不要输出除 [赞]/[评论] 行以外的任何内容'
    ].filter(function (s) { return s !== ''; }).join('\n');
    var postInfo = (post.when ? '（' + post.when + (post.img ? '，配图：' + post.img : '') + '）' : (post.img ? '（配图：' + post.img + '）' : ''));
    return {
      ordered_prompts: [
        { role: 'system', content: p },
        { role: 'user', content: '（机主刚发了这条动态' + postInfo + '：\n「' + post.text + '」\n\n请按上方输出要求生成朋友们的反应。）' }
      ],
      should_silence: true,
      max_chat_history: 0
    };
  },


    // userInfo = 机主资料，与私聊同一份
    // crossPriv = {成员名: 当天私聊尾巴}（私聊→群跨会话上下文；挂到该成员档案下，※ 仅本人知晓）
    group: function (group, members, hist, snapshot, stickerNames, tail, digest, userInfo, crossPriv) {
      var myName = me();
      var tailLines2 = (tail && tail.length) ? histText(tail, 8, true) : '';
      var nameList = members.map(function (m) { return m.name; });
      var crowdTxt = Array.isArray(group.crowd) ? group.crowd.join('\n') : (group.crowd || '');
      var voices = members.map(function (m) {
        var brief = m.profile ? String(m.profile).trim() : '（无档案）';
        var priv = crossPriv && crossPriv[m.name];
        if (priv && priv.length) {
          brief += '\n※ 仅 ' + m.name + ' 本人知晓：机主今日与 ' + m.name + ' 的私聊——\n'
            + histText(priv, cfg().crossLines, true, snapshot && snapshot.dateText);
        }
        return '- ' + m.name + '：\n' + brief;
      });

      var p = [
        '# 虚构沙盒',
        '',
        FICTION,
        '',
        '# 数字世界 · 回应生成',
        '',
        '本次任务：生成应用「微信」的群「' + group.name + '」里新来的消息。',
        '',
        '## 群成员',
        (nameList.length ? nameList.join('、') + '、' + myName : myName) + (group.open ? '，以及若干未具名的其他成员（可让其冒泡，用真实昵称）' : ''),
        crowdTxt ? '其余成员设定：\n' + crowdTxt : '',
        group.style ? '群氛围：' + group.style : '',
        '',
        '## 成员档案',
        voices.join('\n'),
        '',
        userInfo ? '## 机主资料 · ' + myName + '\n（群里的人，群的实际使用者）\n' + userInfo : '',
        '',
        situationBlock(snapshot) ? '## 当前情境\n' + situationBlock(snapshot) : '',
        '',
        mainContext() ? '## 主线近况（只作背景，下方规则优先）\n' + mainContext() : '',
        '',
        '## 聊天记录 · 群「' + group.name + '」',
        '（优先承接这里的话题与语气；' + myName + '本轮发来的最新消息在末尾单独给出）',
        digest ? '（更早的记录已折叠为提要，供接续话题与承诺用：' + digest + '）' : '',
        histText(hist, cfg().histGroup, true, snapshot && snapshot.dateText),
        '',
        consistencyRules('每名成员各自')
          + '\n- 输出多行时，每行开头必须是「成员名：」，由各自独立判断自己是否知情。'
          + ((crossPriv && Object.keys(crossPriv).length)
              ? '\n- 成员档案内「※ 仅本人知晓」的私聊内容，其他成员引用一字即出戏；仅该成员本人可自然提及（包括调侃、阴阳怪气、翻旧账）。'
              : ''),
        '',
        '## 输出要求',
        '- 输出 3~8 条群消息，每条一行，格式严格为「成员名：消息」',
        '- 谁接得上这句谁说，不必人人开口；可以互相接梗、拆台',
        '- 每条不超过 35 字，口语',
        typeSyntax(stickerNames),
        '- 直接输出消息，不要以寒暄开头',
        // 群夹带私聊：成员借群里的话题顺势私聊机主的通道（引擎侧已配捕捉路由）。
        // 引导写保守——仅充分理由时用，防每轮都发。
        // 格式给整块多行示例（花括号占位），AI 对示例的遵守远好于文字描述，
        // 不给「」这类引号——笨 AI 会把引号本身打进输出。
        '- 若某成员有充分理由借机主在群里的话单独私聊机主（如回应机主的需求、私下提醒、单独吐槽群里的事），可在全部群消息之后追加一个注释块，严格按此格式（三行：起始标记、内容行、结束标记；花括号是占位说明，输出时替换成实际内容，不要把花括号/说明文字本身打出来）：',
        '<!--phone',
        '{成员名}：{私聊内容}',
        '-->',
        '- 一条充分理由至多一位成员，没有理由就不要输出该块'
      ].filter(function (s) { return s !== ''; }).join('\n');

      return {
        ordered_prompts: [
          { role: 'system', content: p },
          {
            role: 'user',
            content: tailLines2
              ? '（' + myName + '刚在群「' + group.name + '」里发来以下消息。请严格按上方输出要求，只输出成员们的新消息本身。）\n' + tailLines2
              : '（现在轮到群「' + group.name + '」里的成员们继续聊天。请严格按上方输出要求，只输出群消息本身。）'
          }
        ],
        should_silence: true,
        max_chat_history: 0
      };
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Prompt = Prompt;
})();


// ── src/floor.js ──
// ═══════════════════════════════════════════════════════════
//  floor.js —— 楼层记录写入 + 主聊天界面气泡渲染
//
//  楼层记录格式（设计文档 §5.5，双方通用语法）：
//    [📱与周言的私聊 22:49]
//    persona名：在吗
//    周言：[表情:偷看]
//    [/📱]
//
//  写入：独立 system 楼层（整层楼只含此块），主 AI 可裸读。
//  渲染：整块替换为微信样式气泡（操作主页面 DOM，沙盒内经 parent.$）。
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  var RECORD_RE = /^\s*\[📱([\s\S]*?)\]\s*([\s\S]*?)\s*\[\/📱\]\s*$/;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 消息 → 楼层行 ──
  // 转账契约参数解析：金额必填（可带 ¥/￥/元，最多两位小数），备注可选；非法返回 null
  function parseTransferArg(arg) {
    var parts = String(arg || '').split(/[:：|｜]/);
    var amt = String(parts[0] || '').trim().replace(/[¥￥\s元]/g, '');
    var amount = Number(amt);
    if (!amt || isNaN(amount) || amount <= 0 || amount > 99999) return null;
    return { amount: Math.round(amount * 100) / 100, note: String(parts[1] || '').trim().slice(0, 30) };
  }

  function msgToLine(m, userName) {
    if (m.who === 'sys') return String(m.text || ''); // 系统条目（通话时长等）不带人名前缀
    var who = m.who === 'user' ? userName : m.who;
    var body;
    switch (m.kind) {
      case 'sticker': body = '[表情:' + m.text + ']'; break;
      case 'voice':   body = '[语音:' + m.text + ']'; break;
      case 'image':   body = '[图片:' + m.text + ']'; break;
      case 'poke':    body = '[戳一戳]'; break;
      // 通话记录灰泡在楼层存档里就是一行类型标（与列表页预览一致，带上时长/结果）
      case 'calllog': body = '[' + (m.mode === 'video' ? '视频通话' : '语音通话') + (m.text ? ' · ' + String(m.text).replace(/^通话时长 /, '') : '') + ']'; break;
      case 'location':body = '[定位:' + m.text + ']'; break;
      // 转账：无人记账，卡片即记录——一行写清谁转给谁、金额、备注，必带状态尾巴（AI 得知道钱已收下/退还，防重复转账）
      case 'transfer': {
        var tst = m.state === 'accepted' ? (m.who === 'user' ? '（对方已收款）' : '（机主已收下）')
          : m.state === 'declined' ? (m.who === 'user' ? '（对方已拒收）' : '（机主已退还）')
          : '（待收款）';
        body = m.who === 'user'
          ? '[转账给' + (m.to || '对方') + ' ¥' + m.amount + (m.note ? '（' + m.note + '）' : '') + ']' + tst
          : '[' + who + '转账 ¥' + m.amount + (m.note ? '（' + m.note + '）' : '') + ']' + tst;
        break;
      }
      // 转账处置回执：机主收下/退还对方的转账、对方拒收机主的转账——AI 靠这两行走上下文就全知情
      case 'taccept': body = m.who === 'user'
        ? '[收下了' + (m.from || '对方') + '的转账 ¥' + m.amount + ']'
        : '[' + who + '收下了转账 ¥' + m.amount + ']';
        break;
      case 'tdecline': body = m.who === 'user'
        ? '[退还了' + (m.from || '对方') + '的转账 ¥' + m.amount + ']'
        : '[' + who + '拒收了转账 ¥' + m.amount + ']';
        break;
      // 视频通话的画面条目（跨行压成一行，带标记便于模型区分可见状态与台词）
      case 'scene':   body = '（画面：' + String(m.text || '').replace(/\n+/g, '　') + '）'; break;
      default:        body = String(m.text || '');
    }
    return who + '：' + body;
  }

  // ── 生成记录块文本 ──
  function formatRecord(title, msgs, timeText, userName) {
    var head = '[📱' + title + (timeText ? ' ' + timeText : '') + ']';
    var lines = msgs.map(function (m) { return msgToLine(m, userName); });
    return head + '\n' + lines.join('\n') + '\n[/📱]';
  }

  // ── 把记录块渲染成气泡 HTML ──
  function renderRecordHtml(title, bodyText) {
    var W = window.LZJM;
    var userName = W.Engine ? W.Engine.userName() : '我';
    var stickers = (W.Engine && W.Engine.stickers()) || {};
    var lines = bodyText.split('\n').filter(function (l) { return l.trim(); });
    var rows = [];

    lines.forEach(function (line) {
      var m = line.match(/^([^：:]+)[：:]([\s\S]*)$/);
      if (!m) return;
      var who = m[1].trim();
      var content = m[2].trim();
      // 旧记录里 persona 名可能是当时的取值（如"我"），两种都认作用户
      var isUser = who === userName || who === '我';
      var avatar;
      if (isUser) {
        var uav = W.Engine && W.Engine.userAvatar();
        avatar = uav
          ? '<img class="lzjm-ava lzjm-ava-me" src="' + esc(uav) + '" alt="">'
          : '<div class="lzjm-ava lzjm-ava-me">' + esc(who.slice(0, 1)) + '</div>';
      } else {
        var c = W.Engine && W.Engine.findContact(who);
        avatar = c && c.avatar
          ? '<img class="lzjm-ava" src="' + esc(W.Worldbook.imgUrl(c.avatar)) + '" alt="">'
          : '<div class="lzjm-ava">' + esc(who.slice(0, 1)) + '</div>';
      }

      var bub;
      // 戳一戳单独成行：整行居中灰字，不带头像气泡
      if (content === '[戳一戳]') {
        rows.push('<div class="lzjm-pokerow">' + (isUser ? '你戳了戳对方' : esc(who) + '戳了戳你') + '</div>');
        return;
      }
      // 通话记录：灰字一行，不带头像气泡
      if (content === '[语音通话]' || content === '[视频通话]') {
        rows.push('<div class="lzjm-pokerow">' + esc(content) + '</div>');
        return;
      }
      var tfm = content.match(/^\[(?:转账给\S+|\S+转账) ¥([\d.]+)(?:（([^()]*)）)?\]$/);
      var typed = content.match(/^\[(表情|语音|图片|戳一戳|定位)(?::|\||｜)([\s\S]*)\]$/);
      if (tfm) {
        // 转账在楼层回渲染里就是一行轻量灰泡（手机卡片才是完整形态）
        bub = '<div class="lzjm-bub lzjm-sys">💰 转账 ¥' + esc(tfm[1]) + (tfm[2] ? ' · ' + esc(tfm[2]) : '') + '</div>';
      } else if (typed) {
        var kind = typed[1], arg = (typed[2] || '').trim();
        if (kind === '表情') {
          var file = stickers[arg];
          bub = file
            ? '<img class="lzjm-sticker" src="' + esc(W.Worldbook.imgUrl(file)) + '" alt="' + esc(arg) + '" title="' + esc(arg) + '">'
            : '<div class="lzjm-bub">' + esc(arg) + '</div>';
        } else if (kind === '戳一戳') {
          bub = '<div class="lzjm-bub lzjm-sys">' + (isUser ? '你戳了戳对方' : esc(who) + '戳了戳你') + '</div>';
        } else if (kind === '语音') {
          bub = '<div class="lzjm-bub lzjm-voice"><span class="lzjm-voice-ico">▶</span>' + esc(arg) + '</div>';
        } else if (kind === '图片') {
          bub = '<div class="lzjm-bub lzjm-img"><div class="lzjm-img-ph">🖼</div><div class="lzjm-img-cap">' + esc(arg) + '</div></div>';
        } else {
          bub = '<div class="lzjm-bub lzjm-sys">📍 ' + esc(arg) + '</div>';
        }
      } else {
        bub = '<div class="lzjm-bub">' + esc(content) + '</div>';
      }

      // 头像列（头像+名字），气泡另起一列；me 行用 row-reverse 整体靠右
      rows.push(
        '<div class="lzjm-row' + (isUser ? ' lzjm-row-me' : '') + '">' +
        '<div><div class="lzjm-ava-wrap">' + avatar + '</div><div class="lzjm-who">' + esc(who) + '</div></div>' +
        bub +
        '</div>'
      );
    });

    return '<div class="lzjm-record">' +
      '<div class="lzjm-record-head">📱 ' + esc(title) + '</div>' +
      rows.join('') +
      '</div>';
  }

  // ── 主页面 DOM 操作（原生，不依赖 jQuery） ──
  function pdoc() { return window.parent.document; }

  // 楼层气泡样式（注进主页面；与手机内的类名同前缀，但只作用在 #chat 里）
  var FLOOR_CSS = [
    '#chat .lzjm-record{padding:4px 0}',
    '#chat .lzjm-record-head{text-align:center;font-size:12px;color:#8a8f99;margin:2px 0 8px}',
    '#chat .lzjm-row{display:flex;gap:8px;margin:12px 0;align-items:flex-start}',
    '#chat .lzjm-row.lzjm-row-me{flex-direction:row-reverse}',
    '#chat .lzjm-ava{width:36px;height:36px;border-radius:9px;flex:none;object-fit:cover;background:#c9cfd6;',
    'display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:600}',
    '#chat .lzjm-ava-me{background:#4d7cfe}',
    '#chat .lzjm-who{width:36px;text-align:center;font-size:10px;color:#9aa0a8;margin-top:2px;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#chat .lzjm-row>div{min-width:0}',
    '#chat .lzjm-bub{max-width:65%;padding:8px 12px;border-radius:12px;background:#fff;color:#111;line-height:1.5;',
    'word-break:break-word;border:1px solid rgba(0,0,0,.06)}',
    '#chat .lzjm-row-me .lzjm-bub{background:#95ec69;border-color:transparent}',
    '#chat .lzjm-bub.lzjm-sys{background:transparent;border:none;color:#8a8f99;font-size:12px;padding:2px 4px;max-width:none}',
    '#chat .lzjm-sticker{max-width:110px;border-radius:8px}',
    '#chat .lzjm-voice-ico{color:#111;margin-right:6px;opacity:.6}',
    '#chat .lzjm-img-ph{font-size:22px;text-align:center;padding:8px 0 4px}',
    '#chat .lzjm-img-cap{font-size:12px;opacity:.75}',
    '#chat .lzjm-pokerow{text-align:center;font-size:12px;color:#8a8f99;margin:10px 0}'
  ].join('\n');
  function ensureStyle() {
    try {
      var doc = pdoc();
      if (!doc.getElementById('lzjm-floor-style')) {
        var st = doc.createElement('style');
        st.id = 'lzjm-floor-style';
        st.textContent = FLOOR_CSS;
        doc.head.appendChild(st);
      }
    } catch (e) {}
  }

  // 替换某一个楼层的文本为气泡（整块匹配才动，混合内容不碰）
  function renderMesText(el) {
    var raw = el.textContent || '';
    var m = raw.match(RECORD_RE);
    if (!m) return false;
    ensureStyle();
    el.innerHTML = renderRecordHtml(m[1].trim(), m[2]);
    return true;
  }

  var Floor = {
    formatRecord: formatRecord,
    msgToLine: msgToLine,
    RECORD_RE: RECORD_RE,

    // 插入一条记录楼层并渲染。title 如「与周言的私聊」「高三（2）班 群聊」
    insertRecord: async function (title, msgs, timeText) {
      ensureStyle();
      var W = window.LZJM;
      var userName = W.Engine.userName();
      var block = formatRecord(title, msgs, timeText, userName);

      var before = 0;
      try { before = getChatMessages('0-{{lastMessageId}}').length; } catch (e) {}

      await createChatMessages([{
        role: 'system',
        is_hidden: false,
        message: block
      }], { insert_before: 'end', refresh: 'affected' });

      var mesid = before; // 新楼层 id = 插入前长度
      try {
        var el = pdoc().querySelector('#chat > .mes[mesid="' + mesid + '"] .mes_text');
        if (el) renderMesText(el);
      } catch (e) { console.warn('[霖州引擎] 楼层渲染失败', e); }
      if (W.Store) W.Store.markRendered(mesid);
      return mesid;
    },

    // 全量扫描主聊天界面，把所有记录块渲染成气泡（幂等）
    renderAll: function () {
      try {
        var els = pdoc().querySelectorAll('#chat .mes .mes_text');
        for (var i = 0; i < els.length; i++) renderMesText(els[i]);
      } catch (e) { console.warn('[霖州引擎] 全量渲染失败', e); }
    },

    // 删除手机消息时联动归位主聊天的记录楼层——正文上下文同步清掉，
    // 重roll时 AI 看不到已删内容，就不会顺着续写（防"删了又被当事实"）。
    // 整块删除：楼层只含被删行 → 删楼层；部分命中：楼层重写为剩余行。
    deleteFloorsFor: async function (chatKey, msgs) {
      try {
        var W = window.LZJM;
        if (!msgs || !msgs.length) return;
        var isGrp = chatKey.indexOf('group:') === 0;
        var name = isGrp ? chatKey.slice(6) : chatKey;
        var userName = W.Engine.userName();
        var lines = msgs.map(function (m) { return msgToLine(m, userName); });
        var headWant = '[📱' + (isGrp ? name + ' 群聊' : '与' + name + '的私聊');
        var all = getChatMessages('0-{{lastMessageId}}');
        var delIds = [], touched = false;
        for (var i = 0; i < all.length; i++) {
          var txt = String((all[i] && all[i].message) || '').replace(/^\s+/, '');
          var rm = txt.match(RECORD_RE);
          if (!rm || txt.indexOf(headWant) !== 0) continue;   // 头部精确归属该会话（前缀匹配防子串误伤）
          var bodyLines = rm[2].split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          var hitAny = lines.some(function (l) { return bodyLines.indexOf(l) !== -1; });
          if (!hitAny) continue;
          var remain = bodyLines.filter(function (l) { return lines.indexOf(l) === -1; });
          var mid = all[i].message_id != null ? all[i].message_id : i;
          if (!remain.length) {
            delIds.push(mid);
          } else {
            await setChatMessage('[📱' + rm[1] + ']\n' + remain.join('\n') + '\n[/📱]', mid, { refresh: 'affected' });
            touched = true;
          }
        }
        if (delIds.length) {
          await deleteChatMessages(delIds, { refresh: 'affected' });
          touched = true;
        }
        if (touched) {
          console.log('[霖州引擎] 记录楼层已随删除归位（' + name + '：删 ' + delIds.length + ' 层）');
          try { this.renderAll(); } catch (e) {}
        }
      } catch (e) { console.warn('[霖州引擎] 联动归位楼层失败', e); }
    },

    // NPC 原始输出 → 类型化消息数组（群聊行首带名字）
    parseNpcLines: function (rawText, defaultWho) {
      var out = [];
      String(rawText || '').split('\n').forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var who = defaultWho, body = line;
        if (defaultWho === null) { // 群聊：行首必须是「名字：」
          var gm = line.match(/^([^：:]{1,12})[：:]([\s\S]+)$/);
          if (!gm) return;
          who = gm[1].trim(); body = gm[2].trim();
        }
        if (/^\[撤回\]$/.test(body)) { out.push({ who: who, kind: 'recall', text: '', time: '' }); return; }
        if (/^\[戳一戳\]$/.test(body)) { out.push({ who: who, kind: 'poke', text: '', time: '' }); return; }
        if (/^\[转账[:：|｜]/.test(body)) { // 整行就是一条转账契约（金额必填，备注可选）
          var tm = body.match(/^\[转账[:：|｜]([^\]]*)\]$/);
          var tt = tm && parseTransferArg(tm[1]);
          if (tt) out.push({ who: who, kind: 'transfer', amount: tt.amount, note: tt.note, to: '', state: 'waiting', time: '' });
          return;
        }
        if (/^\[拒收转账[:：|｜]/.test(body)) { // 整行：拒收机主发来的转账（显式拒绝，优先于「回复即收款」的默认推断）
          var dm = body.match(/^\[拒收转账[:：|｜]([^\]]*)\]$/);
          var dt = dm && parseTransferArg(dm[1]);
          if (dt) out.push({ who: who, kind: 'tdecline', amount: dt.amount, note: dt.note, from: '', time: '' });
          return;
        }
        // 前缀匹配：AI 忘换行把类型消息和文字黏在一行（如「[表情:看戏吃瓜] 哎哟……」）
        // → 类型消息单独成一条，尾巴文字走下面的普通文字行流程
        var typed = body.match(/^\[(表情|语音|图片|戳一戳|定位)(?::|\||｜)([^\]]*)\]\s*([\s\S]*)$/);
        if (typed) {
          var kindMap = { '表情': 'sticker', '语音': 'voice', '图片': 'image', '戳一戳': 'poke', '定位': 'location' };
          var kind = kindMap[typed[1]];
          var arg = (typed[2] || '').trim();          if (kind === 'poke') {
            out.push({ who: who, kind: kind, text: '', time: '' });
          } else if (arg) {
            if (kind === 'sticker') {
              var real = window.LZJM.Engine.resolveSticker(arg);
              if (real) {
                out.push({ who: who, kind: kind, text: real, time: '' });
              } else {
                // 表情名没匹配到素材：剥掉 [表情:…] 壳子当普通文字发，不留括号
                out.push({ who: who, kind: 'text', text: arg, time: '' });
              }
            } else {
              out.push({ who: who, kind: kind, text: arg, time: '' });
            }
          }
          body = (typed[3] || '').trim();
          if (!body) return;
        }
        // 行内嵌的类型消息（如「真的只是搬家太忙？[表情:有什么八卦让我听听]」）：
        // 依原序拆成多条发送——[表情:x] 匹配到素材走表情、没匹配剥壳当纯文字；
        // [戳一戳] 不带参数也能嵌在行里；其余文字段照常过旁白/截断过滤
        var segRe = /\[(表情|语音|图片|定位|转账)(?::|\||｜)([^\]]*)\]|\[(戳一戳)\]/g;
        var segs = [], lastIdx = 0, sm;
        while ((sm = segRe.exec(body)) !== null) {
          if (sm.index > lastIdx) segs.push({ k: 'text', v: body.slice(lastIdx, sm.index) });
          segs.push(sm[3] ? { k: '戳一戳', v: '' } : { k: sm[1], v: (sm[2] || '').trim() });
          lastIdx = sm.index + sm[0].length;
        }
        if (segs.length) {
          if (lastIdx < body.length) segs.push({ k: 'text', v: body.slice(lastIdx) });
          var segKind = { '表情': 'sticker', '语音': 'voice', '图片': 'image', '定位': 'location' };
          segs.forEach(function (sg) {
            if (sg.k === 'text') {
              var t = sg.v.trim();
              if (!t) return;
              if (/^[（(][^）)]{1,28}[）)]$/.test(t)) return;
              if (t.length > 120) t = t.slice(0, 120);
              out.push({ who: who, kind: 'text', text: t, time: '' });
            } else if (sg.k === '戳一戳') {
              out.push({ who: who, kind: 'poke', text: '', time: '' });
            } else if (sg.k === '转账') {
              var tv = parseTransferArg(sg.v);
              if (tv) out.push({ who: who, kind: 'transfer', amount: tv.amount, note: tv.note, to: '', state: 'waiting', time: '' });
            } else if (sg.v) {
              if (sg.k === '表情') {
                var hit = window.LZJM.Engine.resolveSticker(sg.v);
                out.push({ who: who, kind: hit ? 'sticker' : 'text', text: hit || sg.v, time: '' });
              } else {
                out.push({ who: who, kind: segKind[sg.k], text: sg.v, time: '' });
              }
            }
          });
          return;
        }
        // 普通文字行；整行纯括号旁白丢弃（寒暄短句照常保留——完整呈现 AI 回复，出问题时便于诊断）
        if (/^[（(][^）)]{1,28}[）)]$/.test(body)) return;
        if (body.length > 120) body = body.slice(0, 120);
        out.push({ who: who, kind: 'text', text: body, time: '' });
      });
      return out.slice(0, 12);
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Floor = Floor;
})();


// ── src/apps/wechat.js ──
// ═══════════════════════════════════════════════════════════
//  apps/wechat.js —— 微信应用（引擎装载的第一个应用）
//  UI 全部为本项目自有设计（仿真手机壳 + 亮色屏）。
//  展示层注入主页面（沙盒内经 parent.document 操作）。
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  var ID = { phone: 'lzjm-phone' };

  function pdoc() { return window.parent.document; }
  function pwin() { return window.parent; }
  // 主屏壁纸（浅色可爱系；换图只改这里）。必须定义在 CSS 数组之前——
  // 数组在脚本加载时立即求值，引用晚于它的变量会得到 undefined。
  var HOME_WALL = 'https://files.catbox.moe/2rg9in.jpg';
  // 预载壁纸：引擎加载时就拉取，避免首次打开手机屏幕空白 1~2 秒
  try { var _wallPre = new Image(); _wallPre.src = HOME_WALL; } catch (e) {}
  function parseDay(s) {
    var m = /(\d+)年(\d+)月(\d+)日/.exec(s || '');
    return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
  }
  function relDay(day, cur) {
    var a = parseDay(day), b = parseDay(cur);
    if (!a) return day || '';
    if (!b) return a.mo + '月' + a.d + '日';
    var diff = (b.y * 372 + b.mo * 31 + b.d) - (a.y * 372 + a.mo * 31 + a.d);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    return (a.y !== b.y ? a.y + '年' : '') + a.mo + '月' + a.d + '日';
  }
  // 动态自身时间 pt → 显示标签：今天/昨天/N天前/M月D日（带 HH:MM）；
  // 7 天以外写完整日期。无 pt（无日期兜底档/旧数据）退回 legacy label
  function momentLabel(pt, legacy, curDay) {
    var m = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})/.exec(pt || '');
    if (!m) return legacy || '';
    var a = { y: +m[1], mo: +m[2], d: +m[3] }, t = m[4], b = parseDay(curDay);
    if (!b) return a.mo + '月' + a.d + '日 ' + t;
    var diff = (b.y * 372 + b.mo * 31 + b.d) - (a.y * 372 + a.mo * 31 + a.d);
    if (diff === 0) return '今天 ' + t;
    if (diff === 1) return '昨天 ' + t;
    if (diff >= 2 && diff < 7) return diff + '天前 ' + t;
    return (a.y !== b.y ? a.y + '年' : '') + a.mo + '月' + a.d + '日 ' + t;
  }
  // 主页时间轴左侧戳（返回 HTML）：今天/昨天大号；更早 = 大号加粗日 + 小号月；无 pt 退回 legacy label
  function stampParts(pt, legacy, curDay) {
    var m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(pt || '');
    if (!m) return '<b class="t">' + esc(legacy || '') + '</b>';
    var a = { y: +m[1], mo: +m[2], d: +m[3] }, b = parseDay(curDay);
    if (b) {
      var diff = (b.y * 372 + b.mo * 31 + b.d) - (a.y * 372 + a.mo * 31 + a.d);
      if (diff === 0) return '<b class="t">今天</b>';
      if (diff === 1) return '<b class="t">昨天</b>';
    }
    return '<b>' + a.d + '</b><span>' + (b && a.y !== b.y ? a.y + '年' : '') + a.mo + '月</span>';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 样式（自有设计） ──
  var CSS = [
    // 外壳：机身 + 屏幕
    '#lzjm-phone{position:fixed;z-index:99991;display:none;font-family:system-ui,"Microsoft YaHei",sans-serif}',
    '#lzjm-phone.lzjm-open{display:block}',
    '.lzjm-sbar{cursor:grab;touch-action:none}',
    '.lzjm-sbar:active{cursor:grabbing}',
    '.lzjm-bezel{width:100%;height:100%;background:#0b0d10;border-radius:48px;padding:11px;position:relative;',
    'box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 2px #2b3138;box-sizing:border-box}',
    '.lzjm-btn-side{position:absolute;background:#1d2228;border-radius:3px}',
    '.lzjm-btn-vol1{left:-3px;top:120px;width:4px;height:44px}',
    '.lzjm-btn-vol2{left:-3px;top:176px;width:4px;height:44px}',
    '.lzjm-btn-act{left:-3px;top:236px;width:4px;height:64px}',
    '.lzjm-btn-pow{right:-3px;top:170px;width:4px;height:88px}',
    '.lzjm-screen{width:100%;height:100%;border-radius:37px;overflow:hidden;display:flex;flex-direction:column;',
    'background:#f2f2f5;color:#111;position:relative;user-select:none}',
    // 状态栏（时间 / 灵动岛 / 信号·WiFi·电量）
    '.lzjm-sbar{flex:none;height:38px;display:flex;align-items:center;justify-content:space-between;',
    'padding:4px 20px 0;position:relative;color:#111;z-index:3;background:#f7f7f9}',
    '.lzjm-clock{font-size:13px;font-weight:600;letter-spacing:.3px;min-width:52px}',
    '.lzjm-island{position:absolute;left:50%;top:9px;transform:translateX(-50%);width:72px;height:17px;',
    'background:#0b0d10;border-radius:10px}',
    '.lzjm-sicons{display:flex;align-items:center;gap:5px}',
    '.lzjm-sig{display:inline-flex;align-items:flex-end;gap:1.5px;height:11px}',
    '.lzjm-sig i{display:block;width:3px;background:#111;border-radius:1px}',
    '.lzjm-sig i:nth-child(1){height:4px}.lzjm-sig i:nth-child(2){height:6px}',
    '.lzjm-sig i:nth-child(3){height:8px}.lzjm-sig i:nth-child(4){height:10px;opacity:.35}',
    // 应用栏
    '.lzjm-appbar{flex:none;min-height:40px;display:flex;align-items:center;gap:6px;padding:2px 10px 8px;',
    'background:rgba(247,247,249,.92);border-bottom:1px solid rgba(0,0,0,.06)}',
    '.lzjm-appbar-t{flex:1;text-align:center;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lzjm-back{display:inline-flex;align-items:center;color:#111;cursor:pointer;padding:4px;border-radius:8px;margin-left:-4px}',
    '.lzjm-back:hover{background:rgba(0,0,0,.05)}',
    '.lzjm-appbar-r{width:24px}',
    '.lzjm-reroll{display:inline-flex;color:#666;cursor:pointer;padding:5px;border-radius:8px;align-items:center;justify-content:center}',
    '.lzjm-reroll:hover{background:rgba(0,0,0,.06)}',
    // 朋友圈顶栏：透明浮在封面上（无标题，保留返回/相机）。状态栏与本栏都脱离文档流、
    // feed 独占整屏——封面顶点恒等于屏幕顶点，不再吃「38+51 算术」的像素误差
    //（padding-top:44 = 状态栏总高 42 + 原上内边距 2，只影响图标落点，不影响封面定位；
    // 状态栏 z-index 压回顶栏之上，保证顶栏不抢状态栏的拖动）
    '.lzjm-appbar-ovl{position:absolute;top:0;left:0;right:0;z-index:6;background:transparent;border-bottom:none;padding-top:44px}',
    '.lzjm-appbar-ovl .lzjm-back,.lzjm-appbar-ovl .lzjm-reroll{color:#111;text-shadow:0 0 6px rgba(255,255,255,.95),0 0 14px rgba(255,255,255,.6)}',
    '.lzjm-appbar-ovl .lzjm-back:hover,.lzjm-appbar-ovl .lzjm-reroll:hover{background:rgba(255,255,255,.35)}',
    // 朋友圈屏：状态栏脱离文档流 + 透明，时钟/信号加白色光晕保证暗封面上可读
    '.lzjm-scr-moments .lzjm-sbar{position:absolute;top:0;left:0;right:0;z-index:7;background:transparent}',
    '.lzjm-scr-moments .lzjm-clock{text-shadow:0 0 6px rgba(255,255,255,.95),0 0 12px rgba(255,255,255,.6)}',
    '.lzjm-scr-moments .lzjm-sig i{box-shadow:0 0 3px rgba(255,255,255,.95),0 0 8px rgba(255,255,255,.55)}',
    // 主体
    '.lzjm-body{flex:1;min-height:0;overflow-y:auto;position:relative;z-index:1}',
    // 首页（壁纸 + 大时钟 + 应用网格）；壁纸铺整个屏幕，浅色系配深色字
    '.lzjm-scr-home{background:url(' + HOME_WALL + ') center/cover no-repeat #f4f6fb}',
    '.lzjm-scr-home .lzjm-sbar{background:transparent}',
    '.lzjm-home-wall{height:100%;padding:20px 16px 26px;display:flex;flex-direction:column;justify-content:space-between;',
    'box-sizing:border-box}',
    // 时钟用与壁纸线稿同系的石板蓝灰；白色光晕保证在任何底色上可读
    '.lzjm-hometime{text-align:center;color:#46536f;text-shadow:0 1px 10px rgba(255,255,255,.9);margin-top:52px}',
    '.lzjm-hometime .t{font-size:56px;font-weight:700;letter-spacing:1px}',
    '.lzjm-hometime .d{font-size:14.5px;font-weight:600;letter-spacing:2.5px;margin-top:5px;opacity:.85}',
    // 应用名在浅色壁纸上用深字
    '.lzjm-scr-home .lzjm-app>span{color:#46536f;text-shadow:0 1px 4px rgba(255,255,255,.7)}',
    '.lzjm-homegrid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px 8px}',
    '.lzjm-app{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;color:#fff}',
    '.lzjm-app-ico{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;',
    'background:rgba(255,255,255,.28);backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.4)}',
    '.lzjm-app>span{font-size:11px;text-shadow:0 1px 4px rgba(0,0,0,.45)}',
    // 会话列表
    '.lzjm-conv{display:flex;gap:10px;align-items:center;padding:11px 12px;background:#fff;position:relative;',
    'border-bottom:1px solid rgba(0,0,0,.05);cursor:pointer}',
    '.lzjm-unread{position:absolute;right:12px;top:50%;transform:translateY(-50%);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#f43530;color:#fff;font-size:11px;line-height:18px;text-align:center;box-sizing:border-box}',
    '.lzjm-app-ico .lzjm-appdot{position:absolute;top:-5px;right:-7px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#f43530;color:#fff;font-size:10px;box-sizing:border-box;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;line-height:1}',
    '.lzjm-conv:hover{background:#f7f7f9}',
    '.lzjm-ava{width:34px;height:34px;border-radius:9px;flex:none;object-fit:cover;background:#c9cfd6;',
    'display:flex;align-items:center;justify-content:center;color:#fff;font-size:13.5px;font-weight:600}',
    '.lzjm-ava-me{background:#4d7cfe}',
    '.lzjm-conv-main{flex:1;min-width:0}',
    '.lzjm-conv-name{font-weight:500;font-size:14px}',
    '.lzjm-conv-prev{font-size:12px;color:#8a8f99;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}',
    // 选线界面：徽标 + 行态
    '.lzjm-ltags{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}',
    '.lzjm-ltag{font-size:10px;line-height:1;padding:3px 6px;border-radius:8px;background:#f0eafa;color:#8a7fc0;white-space:nowrap}',
    '.lzjm-ltag.rec{background:#ec8fb8;color:#fff}',
    '.lzjm-ltag.cur{background:#9b8ce8;color:#fff}',
    '.lzjm-ltag.bad{background:#f9e9ee;color:#c07890}',
    '.lzjm-ltag.on{background:#bfe8cf;color:#2f7d4f}',
    '.lzjm-ltag.off{background:#efeef2;color:#9a94a0}',
    '.lzjm-lineava{display:flex;align-items:center;justify-content:center;font-size:16px;border-radius:50%;background:linear-gradient(135deg,rgba(255,214,232,.85),rgba(220,210,255,.85));box-shadow:inset 0 0 0 1px rgba(255,255,255,.85),0 1px 4px rgba(180,140,210,.18)}',
    '.lzjm-linerow{cursor:pointer}',
    '.lzjm-linerow:active{filter:brightness(.97)}',
    '.lzjm-linedis{opacity:.55}',
    // 选线弹窗（新拟态，独立于手机壳的居中菜单；DLC大项 → IF小项 二级嵌套）
    '#lzjm-linespop{position:fixed;inset:0;z-index:99992;background:rgba(60,64,76,.35);display:flex;align-items:center;justify-content:center;font-family:"Microsoft YaHei","PingFang SC",sans-serif}',
    '.lzjm-lpop-card{width:min(330px,calc(100% - 24px));max-height:80%;background:#e3e6ec;border-radius:24px;overflow:hidden;box-shadow:8px 8px 20px rgba(70,76,90,.4),-8px -8px 20px rgba(255,255,255,.5);display:flex;flex-direction:column;color:#5a6272}',
    '.lzjm-lpop-head{position:relative;padding:18px 16px 12px;text-align:center}',
    '.lzjm-lpop-t{font-weight:700;font-size:16px;color:#4a4e5e;letter-spacing:3px}',
    '.lzjm-lpop-sub{margin-top:5px;font-size:11px;color:#9a9eb0;letter-spacing:1px}',
    '.lzjm-lpop-x{position:absolute;right:12px;top:12px;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:15px;color:#9a9eb0;line-height:26px;text-align:center;background:#e3e6ec;box-shadow:2px 2px 5px #c8ccd3,-2px -2px 5px #feffff}',
    '.lzjm-lpop-x:hover{color:#7b6fb0}',
    '.lzjm-lpop-list{overflow-y:auto;min-height:0;padding:4px 12px 10px}',
    '.lzjm-lpop-foot{padding:2px 14px 14px;font-size:10px;color:#b0b4c0;text-align:center;line-height:1.6;letter-spacing:1px}',
    // 二级菜单（DLC大项 / IF小项）
    '.lzjm-nm-group{margin-bottom:12px}',
    '.lzjm-nm-ghead{display:flex;align-items:center;gap:8px;padding:2px 4px 8px}',
    '.lzjm-nm-gicon{width:26px;height:26px;border-radius:50%;background:#e3e6ec;box-shadow:3px 3px 6px #c8ccd3,-3px -3px 6px #feffff;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}',
    '.lzjm-nm-gname{font-size:13px;font-weight:700;color:#4a4e5e;letter-spacing:2px}',
    '.lzjm-nm-gsub{font-size:10.5px;color:#9a9eb0;letter-spacing:1px}',
    '.lzjm-nm-gline{flex:1;height:1px;background:linear-gradient(to right,#cdd1d9,transparent)}',
    '.lzjm-nm-gtag{font-size:9.5px;letter-spacing:1px;padding:1px 7px;border-radius:999px;background:#e3e6ec;box-shadow:2px 2px 4px #c8ccd3,-2px -2px 4px #feffff;color:#7b6fb0;flex-shrink:0}',
    '.lzjm-nm-items{background:#e3e6ec;border-radius:14px;box-shadow:inset 3px 3px 6px #c8ccd3,inset -3px -3px 6px #feffff;padding:8px}',
    '.lzjm-nm-item{display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:6px;border-radius:10px;background:#e3e6ec;box-shadow:3px 3px 6px #c8ccd3,-3px -3px 6px #feffff;cursor:pointer;font-size:12.5px;color:#4a4e5e;user-select:none;transition:box-shadow .15s}',
    '.lzjm-nm-item:last-child{margin-bottom:0}',
    '.lzjm-nm-item:hover{box-shadow:4px 4px 8px #c8ccd3,-4px -4px 8px #feffff}',
    '.lzjm-nm-item:active{box-shadow:inset 2px 2px 4px #c8ccd3,inset -2px -2px 4px #feffff}',
    '.lzjm-nm-item.cur{box-shadow:inset 2px 2px 4px #c8ccd3,inset -2px -2px 4px #feffff;color:#7b6fb0}',
    '.lzjm-nm-dot{width:6px;height:6px;border-radius:50%;background:#b0a4d4;flex-shrink:0}',
    '.lzjm-nm-dot.off{background:#d0d3da}',
    '.lzjm-nm-if{display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;border:1.5px solid #a394cc;border-radius:50%;font-size:9px;font-weight:700;color:#9787c2;letter-spacing:0;flex-shrink:0;line-height:1}',
    '.lzjm-nm-fill{flex:1}',
    '.lzjm-nm-cur{font-size:10px;color:#b0b4c0;letter-spacing:1px;flex-shrink:0}',
    // 聊天
    '.lzjm-chatbg{background:#f2f2f5;min-height:100%;padding:4px 0 10px}',
    '.lzjm-chatrow{display:flex;gap:7px;margin:11px 12px;align-items:flex-start}',
    '.lzjm-col{display:flex;flex-direction:column;min-width:0;max-width:62%}',
    '.lzjm-col .lzjm-bub{max-width:100%}',
    '.lzjm-sender{font-size:11px;color:#9aa0a8;margin:0 0 3px}',
    '.lzjm-chatrow.me{flex-direction:row-reverse}',
    '.lzjm-bub{max-width:62%;padding:8px 11px;border-radius:9px;background:#fff;color:#111;line-height:1.45;font-size:13.5px;',
    'word-break:break-word;box-shadow:0 1px 2px rgba(0,0,0,.05)}',
    '.lzjm-chatrow.me .lzjm-bub{background:#95ec69}',
    // 通话记录泡：白/绿跟普通气泡走，只多一个听筒朝下的图标（图标比字略小）
    '.lzjm-bub.lzjm-calllog{display:flex;align-items:center;gap:6px;font-size:12.5px;padding:7px 12px}',
    '.lzjm-calllog-ico{display:inline-flex;transform:rotate(135deg);flex:none}', // 听筒朝下 = 已结束/未接通
    '.lzjm-calllog-ico svg{width:15px;height:15px}',
    '.lzjm-calllog-ico.vc{transform:none}', // 摄像机图标不旋转
    '.lzjm-bub.lzjm-sys{background:transparent;box-shadow:none;color:#8a8f99;font-size:12px;padding:2px 4px}',
    '.lzjm-sticker{max-width:120px;border-radius:8px}',
    '.lzjm-voice{display:flex;flex-wrap:wrap;align-items:center;gap:8px;cursor:pointer;min-width:80px}',
    '.lzjm-voice.me{flex-direction:row-reverse}',
    '.lzjm-voice.me .lzjm-voice-play svg{transform:scaleX(-1)}',
    '.lzjm-voice-play{display:inline-flex;line-height:0}',
    '.lzjm-voice-sec{font-size:12px;color:#333}',
    '.lzjm-voicetxt{display:none;flex-basis:100%;margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,0,0,.08);font-size:13px;color:#333;line-height:1.5}',
    '.lzjm-voice.open .lzjm-voicetxt{display:block}',
    '.lzjm-imgbox{width:150px;padding:0;border-radius:9px;overflow:hidden}',
    '.lzjm-imgph{min-height:110px;background:linear-gradient(150deg,#ccd6e2,#e8eef5);display:flex;align-items:center;justify-content:center;padding:16px 14px}',
    '.lzjm-imgph span{font-size:12.5px;line-height:1.55;color:#5a6577;text-align:center;word-break:break-word}',
    '.lzjm-locbox{width:160px;padding:0;border-radius:9px;overflow:hidden;background:#fff}',
    '.lzjm-chatrow.me .lzjm-bub.lzjm-locbox,.lzjm-chatrow.me .lzjm-bub.lzjm-imgbox{background:#fff}',
    '.lzjm-locmap{height:84px;position:relative;background:linear-gradient(150deg,#dde9d9,#eef4ea)}',
    '.lzjm-locmap:before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 42%,rgba(255,255,255,.95) 42% 50%,transparent 50%),linear-gradient(8deg,transparent 62%,rgba(255,255,255,.85) 62% 68%,transparent 68%),linear-gradient(0deg,transparent 80%,rgba(255,255,255,.75) 80% 86%,transparent 86%)}',
    '.lzjm-locmap:after{content:"📍";position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:26px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}',
    '.lzjm-tcard{width:190px;background:linear-gradient(135deg,#f9b84d,#f1972d);color:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.07);flex:none}',
    '.lzjm-tcard.back{background:linear-gradient(135deg,#cbced4,#b7bbc2)}',
    '.lzjm-tcard.waiting{cursor:pointer}',
    '.lzjm-tmain{display:flex;align-items:center;gap:10px;padding:12px 13px 8px}',
    '.lzjm-tbadge{width:36px;height:36px;border-radius:50%;background:#fff;color:#f1972d;flex:none;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700}',
    '.lzjm-tbadge.ring{background:transparent;border:1.7px solid #fff;color:#fff}',
    '.lzjm-tcard.back .lzjm-tbadge{color:#b0b4bb}',
    '.lzjm-tright{display:flex;flex-direction:column;min-width:0}',
    '.lzjm-tamt2{font-size:18px;font-weight:600;line-height:1.3;white-space:nowrap}',
    '.lzjm-tto{margin-left:6px;font-size:11px;font-weight:400;color:rgba(255,255,255,.9);white-space:nowrap}',
    '.lzjm-tst2{font-size:11px;color:#fff;padding-top:1px}',
    '.lzjm-tnote3{padding:0 13px 10px;min-height:15px;font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lzjm-tto-line{font-size:12.5px;color:#111;padding:2px 2px 0}',
    '.lzjm-tto-line b{color:#57606a;font-weight:600}',
    '.lzjm-ttohd{font-size:12px;color:#8a8f99;padding:4px 2px 6px}',
    '.lzjm-panel.lzjm-pto{display:flex;flex-direction:column}',
    '.lzjm-ttolist{display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none}',
    '.lzjm-ttolist::-webkit-scrollbar{display:none}',
    '.lzjm-ttofoot{flex:none;display:flex;justify-content:center;margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,.05)}',
    '.lzjm-locbox .cap{font-size:12.5px;font-weight:600;padding:7px 9px}',
    '.lzjm-sysrow{text-align:center;font-size:11.5px;color:#9aa0a8;margin:10px 0}',
    '.lzjm-recallrow{text-align:center;font-size:12px;color:#9aa0a8;margin:13px 0;line-height:1.7;cursor:pointer}',
    '.lzjm-poke{display:inline-block;background:#dcdfe4;color:#333;font-size:11.5px;padding:7px 20px;border-radius:14px;cursor:pointer}',
    '.lzjm-pokerow{margin:12px 12px;text-align:center}',
    '#lzjm-phone.shake{animation:lzjm-shake .5s}',
    '@keyframes lzjm-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}',
    '.lzjm-recallrow:hover{color:#6a7078}',
    '.lzjm-peektg{display:block;font-size:10px;color:#a7abb2;cursor:pointer;margin-bottom:2px}',
    '.lzjm-peektg:hover{color:#6a7078}',
    // 删除确认弹窗（右键/长按消息触发）
    '.lzjm-scrim{position:absolute;inset:0;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;z-index:50}',
    '.lzjm-confirm{background:#fff;border-radius:14px;padding:20px 20px 14px;width:216px;text-align:center;font-size:14px;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25)}',
    '.lzjm-tdlnote{font-size:11px;color:#8a8f99;margin-top:5px}',
    '.lzjm-cbtns{display:flex;gap:8px;margin-top:13px}',
    '.lzjm-cbtn{flex:1;border:none;border-radius:8px;padding:6px 0;font-size:14px;cursor:pointer}',
    '.lzjm-cbtn.no{background:#f2f3f5;color:#333}',
    '.lzjm-cbtn.yes{background:#e64b4b;color:#fff}',
    // 输入区（底部整体：面板叠加在输入条上方，不挤压聊天内容）
    '.lzjm-bottom{flex:none;position:relative;background:#f7f7f9;border-top:1px solid rgba(0,0,0,.06)}',
    '.lzjm-inputbar{display:flex;gap:8px;align-items:center;padding:8px 10px 4px;position:relative;z-index:3}',
    '.lzjm-plus{width:23px;height:23px;flex:none;border-radius:50%;border:1.8px solid #454545;background:#fff;',
    'cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
    '.lzjm-plus svg{display:block}',
    '.lzjm-plus:hover{background:#eef0f3}',
    '.lzjm-input{flex:1;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;color:#111;',
    'padding:7px 12px;font-size:14px;outline:none;min-width:0}',
    '.lzjm-input::placeholder{color:#b9bdc4;font-size:13px;font-weight:300;letter-spacing:.3px}',
    '.lzjm-send{flex:none;border:none;background:none;color:#3f66e8;cursor:pointer;padding:4px 2px;',
    'display:flex;align-items:center;justify-content:center}',
    '.lzjm-send svg{display:block}',
    // 待发区（回车攒多条，小飞机一起发）
    // 待发消息与历史记录同流显示（不再用虚线框隔开），行尾 × 可单条撤回
    '.lzjm-stgrow{position:relative}.lzjm-stgrow .lzjm-bub{opacity:.96}',
    '.lzjm-stgx{position:absolute;top:-7px;right:-7px;width:17px;height:17px;border-radius:50%;',
    'background:#e64b4b;color:#fff;font-size:12px;line-height:17px;text-align:center;',
    'cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3)}',
    '.lzjm-stgitem{position:relative;flex:1;justify-content:flex-end;display:flex;align-items:flex-start;gap:5px}',
    '.lzjm-stgitem .lzjm-bub{max-width:none;flex:none}',
    '.lzjm-stgcenter{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;margin:11px 12px}',
    '.lzjm-stgstick{max-width:64px;border-radius:6px;display:block}',
    // [+] 面板（绝对定位：从输入条上方弹出，盖住聊天区，不引起内容重排）
    '.lzjm-panel{position:absolute;left:0;right:0;bottom:100%;z-index:4;background:#f7f7f9;border-top:1px solid rgba(0,0,0,.06);',
    'padding:14px 14px 8px;display:none;max-height:236px;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none;box-shadow:0 -8px 20px rgba(0,0,0,.05)}',
    '.lzjm-panel::-webkit-scrollbar{display:none}',
    '.lzjm-panel.lzjm-open{display:block}',
    '.lzjm-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 6px}',
    '.lzjm-act{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;color:#555;font-size:11.5px}',
    '.lzjm-act-ico{width:52px;height:52px;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,.06);',
    'display:flex;align-items:center;justify-content:center;font-size:24px}',
    '.lzjm-act:hover .lzjm-act-ico{background:#eef0f3}',
    '.lzjm-modeform{display:flex;flex-direction:column;gap:8px;padding:2px 2px 8px}',
    '.lzjm-modeinput{flex:1;width:100%;box-sizing:border-box;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:10px;color:#111;padding:8px 11px;font-size:13.5px;line-height:1.5;outline:none;resize:none;font-family:inherit}',
    '.lzjm-modeinput::placeholder{color:#b9bdc4;font-size:12.5px}',
    '.lzjm-modebtns{align-self:stretch;display:flex;justify-content:space-between;gap:8px}',
    '.lzjm-modeok{border:none;border-radius:8px;background:#22c05e;color:#fff;font-size:13.5px;line-height:1;padding:9px 20px;cursor:pointer}',
    '.lzjm-modecancel{border:1px solid #d5d8dd;border-radius:8px;background:#f7f8fa;color:#444;font-size:13.5px;line-height:1;padding:8px 18px;cursor:pointer}',
    '.lzjm-stickgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:10px 4px;max-height:170px;overflow-y:auto;overflow-x:hidden;padding-bottom:6px}',
    '.lzjm-stickcell{cursor:pointer;text-align:center}',
    '.lzjm-stickcell .imgw{width:56px;height:56px;margin:0 auto;border-radius:8px;overflow:hidden;background:#eceff3}',
    '.lzjm-stickcell img{width:100%;height:100%;object-fit:cover;display:block}',
        // 滚动条（统一的细灰条，不用浏览器默认样式）
    // 滚动条：细、淡灰、无箭头、透明轨道（webkit + Firefox 双管）
    '.lzjm-screen ::-webkit-scrollbar{width:5px;height:5px}',
    '.lzjm-screen ::-webkit-scrollbar-track{background:transparent}',
    '.lzjm-screen ::-webkit-scrollbar-thumb{background:rgba(0,0,0,.22);border-radius:2px}',
    '.lzjm-screen ::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.32)}',
    // 底部 home 指示条
    '.lzjm-homebar{flex:none;height:18px;display:flex;align-items:center;justify-content:center;background:#f7f7f9;position:relative;z-index:3}',
    '.lzjm-homebar:after{content:"";display:block;width:110px;height:4px;border-radius:2px;background:rgba(0,0,0,.75)}',
    // ── 通话屏 ──
    '.lzjm-dial{display:inline-flex;color:#111;padding:4px;border-radius:8px;cursor:pointer}',
    '.lzjm-dial:hover{background:rgba(0,0,0,.06)}',
    '.lzjm-callbody{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 16px 12px;background:#101418;color:#fff;position:relative;overflow:hidden}',
    '.lzjm-scr-call .lzjm-callbody{background:transparent}', // 背景在屏幕层铺，内容区透出来
    '.lzjm-callfeed{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(22px);transform:scale(1.18)}',
    '.lzjm-callshade{position:absolute;inset:0;background:#101418;opacity:.85;z-index:0}',
    '.lzjm-calltop{position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;z-index:1;margin-top:44px}',
    '.lzjm-callava{width:88px;height:88px;border-radius:50%;overflow:hidden;background:#232a33;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:600;box-shadow:0 4px 18px rgba(0,0,0,.4)}',
    '.lzjm-callava img{width:100%;height:100%;object-fit:cover}',
    '.lzjm-callname{font-size:19px;font-weight:600;text-shadow:0 1px 6px rgba(0,0,0,.5)}',
    '.lzjm-callstatus{font-size:13px;color:#c9d1d9;min-height:18px}',
    // 字幕区：顶部占位条把短内容顶到底部；内容超高时占位条收缩为 0，可向上滚动翻记录。
    // 隐藏滚动条（带不带无所谓，藏了更干净）。
    '.lzjm-callsubs{position:relative;z-index:1;flex:1;min-height:0;width:100%;overflow-y:auto;display:flex;flex-direction:column;gap:7px;padding:6px 4px;scrollbar-width:none}',
    '.lzjm-callsubs::-webkit-scrollbar{display:none}',
    '.lzjm-callsubs:before{content:"";flex:1;min-height:0}',
    // 仿玻璃气泡：char 靠左、user 靠右，内容靠左不居中。
    // 注意：这里刻意不用 backdrop-filter——Chromium 在焦点变化（点击/alt+tab）时会重绘
    // 背景滤镜层，造成刺眼的白色闪烁（已知 bug），半透明底+高光边已经足够"玻璃"。
    '.lzjm-sub{max-width:85%;align-self:flex-start;text-align:left;font-size:13.5px;line-height:1.5;color:#f2f5f8;padding:7px 12px;border-radius:14px;background:rgba(17,21,26,.58);border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}',
    '.lzjm-sub.me{align-self:flex-end;background:rgba(64,104,52,.62);border-color:rgba(130,195,110,.32);box-shadow:inset 0 1px 0 rgba(255,255,255,.09)}',
    '.lzjm-callmid{position:relative;z-index:1;display:flex;gap:26px;margin-top:2px;align-items:flex-end}',
    '.lzjm-callbtn{display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:none;color:#e6edf3;font-size:10.5px;cursor:pointer}',
    '.lzjm-callbtn i{width:46px;height:46px;border-radius:50%;background:rgba(244,246,249,.95);color:#1a1d21;box-shadow:0 2px 8px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;font-style:normal;font-size:19px}',
    '.lzjm-callbtn.on i{background:rgba(255,255,255,.34)}',
    '.lzjm-callbtn.hang i{background:#e5484d;width:54px;height:54px;font-size:22px}',
    '.lzjm-callrow{position:relative;z-index:1;display:flex;align-items:center;gap:8px;width:100%;margin-top:4px}',
    '.lzjm-callinput{flex:1;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:17px;color:#fff;padding:8px 13px;font-size:13.5px;outline:none}',
    '.lzjm-callinput::placeholder{color:rgba(255,255,255,.45)}',
    '.lzjm-csend{background:#22c05e;border:none;color:#fff;border-radius:17px;padding:8px 14px;font-size:13px;cursor:pointer;white-space:nowrap}',
    '.lzjm-cwait{position:relative;z-index:1;color:#c9d1d9;font-size:13px}',
    '.lzjm-scr-call{background:#101418}', // 无头像时兜底，与通话内容区同色
    '.lzjm-scr-call .lzjm-sbar{background:transparent}',
    '.lzjm-scr-call .lzjm-homebar{background:transparent}',
    '.lzjm-scr-call .lzjm-homebar:after{background:rgba(255,255,255,.72)}', // 底部横条反白
    // 通话黑底：只反白时间/信号图标，灵动岛保持纯黑不反白
    '.lzjm-scr-call .lzjm-sbar .lzjm-clock,.lzjm-scr-call .lzjm-sbar .lzjm-sicons{filter:invert(1)}',
    '.lzjm-callmid{justify-content:space-between;width:100%;padding:0 42px;align-items:center}',
    '.lzjm-callbtn i{width:54px;height:54px;font-size:22px}',
    '.lzjm-callbtn.hang i{width:54px;height:54px}',
    '.lzjm-callroll{position:absolute;top:10px;right:12px;z-index:5;color:#fff;opacity:.85;cursor:pointer;padding:4px;line-height:0}',
    // 说话弹窗 + 删除确认：灰黑半透明面板，贴合通话暗色场景；输入区聚焦保持暗色不刺眼
    '.lzjm-callta{width:100%;box-sizing:border-box;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#fff;caret-color:#fff;padding:9px 11px;font-size:13.5px;line-height:1.55;resize:none;outline:none !important;margin-bottom:2px;font-family:inherit}',
    '.lzjm-callta::placeholder{color:rgba(255,255,255,.55) !important}', // 个别前端主题会给 placeholder 上奇色，强制柔和白
    '.lzjm-callta:focus,.lzjm-callta:focus-visible{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3);outline:none !important;box-shadow:none !important}', // 主题拷进沙盒的 :focus-visible 高亮圈会压过普通 outline:none，必须 !important；边框只微微变亮作聚焦提示
    // 浅色输入框（聊天主输入 + 图片/语音/定位表单）：同款免疫——主题的 :focus-visible 会在
    // 白底元素上画黑圈（闪黑色），压掉后把边框微微加深作聚焦提示
    '.lzjm-input:focus,.lzjm-input:focus-visible,.lzjm-modeinput:focus,.lzjm-modeinput:focus-visible{outline:none !important;box-shadow:none !important;border-color:rgba(0,0,0,.22)}',
    '.lzjm-callpop{width:266px;background:rgba(28,32,38,.96);color:#e6edf3;padding:14px 14px 12px;text-align:left;font-size:13.5px;box-shadow:0 10px 34px rgba(0,0,0,.5)}',
    '.lzjm-callpop .lzjm-cbtns{margin-top:10px}',
    '.lzjm-callpop .lzjm-cbtn.no,.lzjm-calldel .lzjm-cbtn.no{background:rgba(255,255,255,.12);color:#e6edf3}',
    '.lzjm-calldel{width:216px;background:rgba(28,32,38,.97);color:#e6edf3;padding:18px 18px 13px;text-align:center;font-size:14px;box-shadow:0 10px 34px rgba(0,0,0,.5)}',
    // ── 视频通话皮肤：头像图清晰全屏当实时画面（不模糊不压黑），去大头像圈，右上角 PiP 自视窗 ──
    '.lzjm-scr-video .lzjm-callfeed{filter:none;transform:none}',
    '.lzjm-scr-video .lzjm-callshade{opacity:.42}',
    '.lzjm-scr-video .lzjm-calltop{margin-top:22px}',
    '.lzjm-scr-video .lzjm-callava{display:none}',
    '.lzjm-scr-video .lzjm-callroll{right:auto;left:12px}', // 右上角让给 PiP
    '.lzjm-callpip{position:absolute;top:48px;right:12px;width:62px;height:84px;border-radius:12px;background:rgba(16,20,24,.8);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600;color:#aeb8c2;z-index:4;box-shadow:0 3px 12px rgba(0,0,0,.35);overflow:hidden}',
    '.lzjm-callpip img{width:100%;height:100%;object-fit:cover;display:block}',
    // 画面旁白：穿插在气泡流中间（说到哪演到哪），靠左淡字，与台词区分开
    '.lzjm-callscene{position:relative;z-index:1;align-self:flex-start;margin:2px 0 2px 4px;max-width:86%;font-size:12px;line-height:1.55;color:rgba(255,255,255,.66);text-align:left;text-shadow:0 1px 4px rgba(0,0,0,.65);padding:2px 0}',
    // ── 发现页底栏 + 朋友圈 ──
    '.lzjm-tabbar{flex:none;display:flex;border-top:1px solid rgba(0,0,0,.08);background:#f7f7f9}',
    '.lzjm-tab{flex:1;border:none;background:none;padding:6px 0 5px;font-size:10.5px;color:#8a8f99;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;font-family:inherit}',
    '.lzjm-tab.on{color:#22c05e}',
    '.lzjm-tab svg{width:22px;height:22px}',
    '.lzjm-tabdot{position:absolute;top:2px;left:calc(50% + 8px);min-width:15px;height:15px;border-radius:8px;background:#e5484d;color:#fff;font-size:9.5px;line-height:15px;text-align:center;padding:0 4px}',
    '.lzjm-disc-row{position:relative;display:flex;align-items:center;gap:11px;padding:12px;background:#fff;cursor:pointer}',
    '.lzjm-setwrap{padding:12px 12px 24px}',
    '.lzjm-setsec{margin:16px 6px 8px;font-size:12px;color:#8a8f99}',
    '.lzjm-setcard{background:#fff;border-radius:10px;overflow:hidden}',
    '.lzjm-setrow{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.05);cursor:pointer}',
    '.lzjm-setrow:last-child{border-bottom:none}',
    '.lzjm-setmain{flex:1;min-width:0}',
    '.lzjm-setname{font-size:14px;color:#1a1d21}',
    '.lzjm-setdesc{font-size:11px;color:#9aa0a8;margin-top:2px}',
    '.lzjm-setck{width:20px;height:20px;flex:none;color:#22c05e;visibility:hidden}',
    '.lzjm-setrow.on .lzjm-setck{visibility:visible}',
    '.lzjm-setcol{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.05)}',
    '.lzjm-setlbl{font-size:12px;color:#8a8f99}',
    '.lzjm-setrow2{display:flex;align-items:center;gap:8px}',
    '.lzjm-setnum{width:58px;padding:5px 6px;border:1px solid rgba(0,0,0,.1);border-radius:6px;font-size:13px;text-align:right;color:#1a1d21;background:#fafafa;outline:none}',
    '.lzjm-settxt{flex:1;min-width:0;padding:7px 8px;border:1px solid rgba(0,0,0,.1);border-radius:6px;font-size:12px;color:#1a1d21;background:#fafafa;outline:none}',
    '.lzjm-setbtn{flex:none;padding:6px 10px;border:none;border-radius:6px;background:#22c05e;color:#fff;font-size:12px;cursor:pointer}',
    '.lzjm-setpick{display:flex;flex-wrap:wrap;gap:6px;padding:4px 14px 12px}',
    '.lzjm-setpick span{padding:4px 9px;background:#f0f1f3;border-radius:20px;font-size:12px;color:#1a1d21;cursor:pointer}',
    '.lzjm-setdel{flex:none;width:22px;height:22px;color:#c1c6cc;font-size:13px;line-height:22px;text-align:center;cursor:pointer;-webkit-user-select:none;user-select:none}',
    '.lzjm-setdel:active{color:#e64340}',
    '.lzjm-setnote{margin:16px 8px 0;font-size:11px;color:#b0b5bc;line-height:1.7}',
    '.lzjm-disc-ico{width:38px;height:38px;flex:none;display:flex;align-items:center;justify-content:center}',
    '.lzjm-disc-ico svg{width:30px;height:30px}',
    '.lzjm-disc-main{flex:1;min-width:0}',
    '.lzjm-disc-name{font-size:14.5px;color:#111}',
    '.lzjm-disc-chev{flex:none;display:flex}',
    '.lzjm-disc-gap{height:9px;background:#f2f3f5;border-top:1px solid rgba(0,0,0,.05)}',
    // ── 通讯录 tab + 联系人详细资料 ──
    '.lzjm-sechead{font-size:12px;color:#8a8f99;padding:7px 14px 3px;background:#f7f7f9}',
    '.lzjm-cdetcard{display:flex;align-items:center;gap:14px;background:#fff;padding:18px 14px;margin-bottom:10px}',
    '.lzjm-cava{width:60px;height:60px;border-radius:10px;flex:none;object-fit:cover;background:#c9cfd6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:600}',
    '.lzjm-cdetnm{font-size:17px;color:#111;font-weight:600}',
    '.lzjm-cdetrow{display:flex;align-items:center;gap:8px;background:#fff;padding:12px 14px;cursor:pointer;margin-bottom:10px}',
    '.lzjm-cdetrow .l{font-size:15px;color:#111;flex:none}',
    '.lzjm-cdetpv{flex:1;text-align:right;font-size:12.5px;color:#9aa0a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lzjm-cdetcv{flex:none;display:flex}',
    '.lzjm-cdetmsg{margin:14px 14px 0;background:#22c05e;color:#fff;text-align:center;font-size:15.5px;padding:10px 0;border-radius:6px;cursor:pointer}',
    // 两个通话键合成一张分组卡片（iOS 组合列表样式），与上面的主按钮拉开层级
    '.lzjm-cdetcalls{display:flex;margin:12px 14px 0;background:#fff;border-radius:6px;overflow:hidden}',
    '.lzjm-cdetcall{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 0;font-size:14px;color:#111;cursor:pointer}',
    '.lzjm-cdetcall+.lzjm-cdetcall{border-left:1px solid rgba(0,0,0,.07)}',
    '.lzjm-cdetcall svg{width:20px;height:20px}',
    '.lzjm-mfeed{flex:1;min-height:0;overflow-y:auto;background:#fff;padding-bottom:14px;scrollbar-width:none}',
    '.lzjm-mfeed::-webkit-scrollbar{display:none}',
    '.lzjm-mcover{height:248px;position:relative;background:linear-gradient(160deg,#6f8cba,#a9bedd 55%,#d2dfee);overflow:visible}',
    '.lzjm-mcover img{width:100%;height:100%;object-fit:cover;display:block}',
    '.lzjm-mcover-shade{position:absolute;left:0;right:0;bottom:0;height:64px;background:linear-gradient(transparent,rgba(0,0,0,.42))}',
    // 名字+头像块：头像放大、下压 1/3 露出封面底边，名字在头像左侧、压在背景图上
    '.lzjm-mme{position:absolute;right:12px;bottom:-19px;display:flex;align-items:center;gap:9px;z-index:2}',
    '.lzjm-mme .nm{color:#fff;font-size:15px;text-shadow:0 1px 3px rgba(0,0,0,.85),0 0 8px rgba(0,0,0,.55);transform:translateY(-3px)}',
    '.lzjm-mme .av{width:58px;height:58px;border-radius:10px;border:2px solid #fff;object-fit:cover;background:#c9cfd6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:600;box-sizing:border-box}',
    '.lzjm-mpad{height:36px}',
    '.lzjm-post{display:flex;gap:9px;padding:13px 12px 11px;border-bottom:1px solid rgba(0,0,0,.05)}',
    '.lzjm-post-ava{width:37px;height:37px;border-radius:8px;flex:none;object-fit:cover;background:#c9cfd6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:600;cursor:pointer}',
    '.lzjm-post-main{flex:1;min-width:0}',
    '.lzjm-post-name{font-size:14px;font-weight:600;color:#576b95;cursor:pointer}',
    '.lzjm-post-text{font-size:14px;line-height:1.55;color:#111;margin-top:2px;word-break:break-word}',
    '.lzjm-post-img{margin-top:5px;background:#f2f3f5;border:1px solid rgba(0,0,0,.04);border-radius:7px;padding:7px 9px;font-size:12px;color:#5a6577;line-height:1.5;word-break:break-word}',
    '.lzjm-post-meta{position:relative;display:flex;align-items:center;margin-top:6px;font-size:12px;color:#999;font-family:"PingFang SC","Microsoft YaHei",sans-serif}',
    '.lzjm-post-meta .sp{flex:1}',
    '.lzjm-post-more{width:27px;height:19px;border:none;border-radius:5px;background:#f0f1f3;color:#576b95;font-size:13px;line-height:1;cursor:pointer;padding:0;flex:none}',
    '.lzjm-post-more:hover{background:#e7e9ec}',
    // ⋯菜单：紧贴按钮左侧浮出的横向灰色长条，不占高度不换行
    '.lzjm-pmenu{position:absolute;right:31px;top:50%;transform:translateY(-50%);display:flex;height:30px;background:#4c4c4c;border-radius:6px;overflow:hidden;z-index:4;box-shadow:0 2px 8px rgba(0,0,0,.22);align-items:stretch}',
    '.lzjm-pmenu button{border:none;background:none;color:#fff;font-size:12.5px;padding:0 13px;cursor:pointer;white-space:nowrap;font-family:inherit;display:flex;align-items:center;gap:4px}',
    '.lzjm-plike{margin-top:6px;background:#f7f7f7;border-radius:5px;padding:5px 9px;font-size:12.5px;color:#576b95;line-height:1.5;word-break:break-word;font-family:"PingFang SC","Microsoft YaHei",sans-serif}',
    '.lzjm-pcmts{margin-top:3px;background:#f7f7f7;border-radius:5px;padding:5px 9px;font-size:12.5px;line-height:1.65;word-break:break-word;font-family:"PingFang SC","Microsoft YaHei",sans-serif}',
    '.lzjm-pcmts .c{color:#111}',
    '.lzjm-pcmts .n{color:#576b95;font-weight:400}',
    // 冒号独立成 class：半角冒号在雅黑里两侧过挤，用 margin 调出全角的呼吸感（手感微调只动这里）
    '.lzjm-pcmts .cs{margin:0 2px}',
    // 主页时间轴左侧戳：今天/昨天大号；更早 = 大号加粗日 + 小号月（真实朋友圈相册样式）
    '.lzjm-post-stamp{width:38px;flex:none;padding-top:3px}',
    '.lzjm-post-stamp b{display:block;font-size:16px;font-weight:700;color:#111;line-height:1.15;font-family:"PingFang SC","Microsoft YaHei",sans-serif}',
    '.lzjm-post-stamp b.t{font-size:15px;font-weight:500}',
    '.lzjm-post-stamp span{display:block;font-size:10px;color:#8a8f99;margin-top:2px}',
    '.lzjm-cmtbar{display:flex;gap:6px;margin-top:6px;align-items:center}',
    '.lzjm-cmtbar input{flex:1;min-width:0;border:1px solid rgba(0,0,0,.12);border-radius:6px;padding:6px 11px;font-size:13px;outline:none;background:#fff;color:#111;font-family:inherit}',
    '.lzjm-cmtbar button{border:none;background:#22c05e;color:#fff;border-radius:6px;padding:6px 13px;font-size:12.5px;cursor:pointer;white-space:nowrap;font-family:inherit}',
    '.lzjm-mpta{width:100%;box-sizing:border-box;background:transparent;border:none;border-radius:0;box-shadow:none;color:#111;padding:12px 14px;font-size:15px;line-height:1.6;min-height:150px;resize:none;outline:none;font-family:inherit}',
    '.lzjm-mpta::placeholder{color:#b3b8bf}',
    // 聚焦高亮圈/圆角/阴影是 ST 主题 textarea 全局样式渗漏，必须 !important 压掉——
    // 不然点一下、alt+tab 切回来都会闪一下主题色边框；发布页不需要聚焦提示
    '.lzjm-mpta:focus,.lzjm-mpta:focus-visible{outline:none !important;box-shadow:none !important;border:none !important;border-radius:0 !important;background:transparent}',
    '.lzjm-mpimg{width:100%;box-sizing:border-box;background:transparent;border:none;border-top:1px solid rgba(0,0,0,.08);border-radius:0;box-shadow:none;color:#57606a;padding:11px 14px;font-size:12.5px;line-height:1.6;min-height:76px;resize:none;outline:none;font-family:inherit}',
    '.lzjm-mpimg::placeholder{color:#b3b8bf}',
    '.lzjm-mpimg:focus,.lzjm-mpimg:focus-visible{outline:none !important;box-shadow:none !important;border:none !important;border-top:1px solid rgba(0,0,0,.08) !important;border-radius:0 !important;background:transparent}',
    '.lzjm-postsend{background:#22c05e;color:#fff;border-radius:5px;font-size:14px;padding:5px 14px;cursor:pointer;font-family:inherit;border:none;white-space:nowrap}',
    '.lzjm-appbar-rw{width:auto;flex:none}',
    '.lzjm-mptip{padding:12px 14px;font-size:12px;color:#9aa0a8}'
  ].join('\n');

  var ICON_VOICE = '<svg width="15" height="15" viewBox="0 0 1024 1024"><path fill="#222222" d="M501.269333 517.610667a277.333333 277.333333 0 0 1-81.664 197.546666l-5.12 4.906667-3.306666 2.858667a42.666667 42.666667 0 0 1-58.325334-61.696l3.029334-3.136 6.954666-6.954667a192.042667 192.042667 0 0 0-7.936-273.002667l-3.050666-3.136a42.666667 42.666667 0 0 1 61.248-59.264l5.12 4.906667a277.333333 277.333333 0 0 1 83.050666 196.970667z m187.648 10.197333A418.090667 418.090667 0 0 1 565.845333 814.933333l-7.68 7.466667-3.306666 2.837333a42.666667 42.666667 0 0 1-58.346667-61.674666l3.029333-3.157334 6.101334-5.952a332.928 332.928 0 0 0 97.962666-228.48l0.085334-8.533333a332.821333 332.821333 0 0 0-105.834667-242.24 42.666667 42.666667 0 0 1 58.197333-62.4 418.133333 418.133333 0 0 1 132.970667 304.32l-0.106667 10.709333zM625.877333 137.877333a42.666667 42.666667 0 0 1 58.176-62.421333l-58.176 62.421333z m250.730667 394.026667a606.208 606.208 0 0 1-48.853333 225.365333l-6.293334 14.165334a606.016 606.016 0 0 1-123.2 176.554666l-11.136 10.816-3.306666 2.837334a42.666667 42.666667 0 0 1-58.346667-61.696l3.029333-3.136 9.557334-9.28a520.661333 520.661333 0 0 0 105.856-151.722667l5.397333-12.16a520.853333 520.853333 0 0 0 41.984-193.6l0.128-13.333333a520.341333 520.341333 0 0 0-38.4-194.261334l-5.141333-12.288a520.533333 520.533333 0 0 0-122.026667-172.288l58.197333-62.421333a605.909333 605.909333 0 0 1 142.016 200.533333l6.016 14.293334a605.653333 605.653333 0 0 1 44.672 226.133333l-0.149333 15.509333zM170.666667 518.442667a64 64 0 1 1 128 0 64 64 0 0 1-128 0z"/></svg>';

  var ICON_REROLL = '<svg width="18" height="18" viewBox="0 0 1024 1024"><path fill="currentColor" d="M512 85.333333c102.869333 0 199.509333 36.693333 275.029333 100.437334l93.866667-94.037334a21.333333 21.333333 0 0 1 36.437333 15.061334V384a21.333333 21.333333 0 0 1-21.333333 21.333333h-276.693333a21.333333 21.333333 0 0 1-15.104-36.394666l122.325333-122.496a341.333333 341.333333 0 1 0 118.314667 341.632 42.666667 42.666667 0 1 1 83.2 18.901333A426.794667 426.794667 0 0 1 512 938.666667C276.352 938.666667 85.333333 747.648 85.333333 512S276.352 85.333333 512 85.333333z"/></svg>';

  var ICON_CALL = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l1.5 4-2.2 1.6a13 13 0 0 0 6.1 6.1L16 13.5l4 1.5v4a1.6 1.6 0 0 1-1.8 1.6C10.4 19.9 4.1 13.6 3.4 5.8A1.6 1.6 0 0 1 5 4z"/></svg>';
  // 待收款徽标（白线圆环内）：双向粗条半箭头，上半朝左、下半朝右
  var ICON_TWAIT = '<svg width="22" height="21" viewBox="0 0 1024 1024" fill="none" preserveAspectRatio="none"><path d="M725.333333 377.2672V443.733333H298.666667v-68.266666h330.837333L554.666667 296.891733l47.104-49.493333 121.856 128h1.706666v1.800533zM298.666667 646.7328V580.266667h426.666666v68.266666H394.496L469.333333 727.108267l-47.104 49.493333-121.856-128H298.666667v-1.800533z" fill="currentColor"/></svg>';
  // 已收款/已被接受：白圈内直线对勾
  var ICON_TOK = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  // 已退还/已被拒绝：白圈内直线叉
  var ICON_TNO = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
  var ICON_VCALL = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3"/></svg>';
  var ICON_MIC = '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#1a1d21" stroke-width="1.9" stroke-linecap="round"><rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"/></svg>';
  var ICON_HANG = '<svg width="26" height="26" viewBox="0 0 24 24"><path fill="#fff" d="M6.6 3.2c.5-.2 1.1 0 1.4.5l1.8 2.7c.3.5.2 1.1-.2 1.5L8 9.3a12.8 12.8 0 0 0 6.7 6.7l1.4-1.6c.4-.4 1-.5 1.5-.2l2.7 1.8c.5.3.7.9.5 1.4l-.7 2.1c-.2.6-.8 1-1.4.9C9.6 18.9 5.1 14.4 4.6 5.8c0-.6.4-1.2 1-1.4l1-.2z" transform="rotate(135 12 12)"/></svg>';
  var ICON_BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_WIFI = '<svg width="15" height="11" viewBox="0 0 16 12" fill="#111"><path d="M8 9.9a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM8 6.2c-1.8 0-3.4.7-4.6 1.9l1.5 1.5a4.5 4.5 0 016.2 0l1.5-1.5A6.5 6.5 0 008 6.2zM8 1.4C4.9 1.4 2.1 2.8.2 5l1.5 1.5A9.2 9.2 0 018 3.8c2.5 0 4.8 1 6.3 2.7L15.8 5A11.4 11.4 0 008 1.4z" transform="scale(0.95)"/></svg>';
  // 电池：iPhone 风格——小圆角细描边、电芯近满内腔、右侧圆帽（依用户参考图，深灰 #2c2c2c）
  var ICON_BATT = '<svg width="21" height="12" viewBox="0 0 26 15" fill="#2c2c2c"><rect x="1" y="1.5" width="20.5" height="12" rx="1.2" fill="none" stroke="#2c2c2c" stroke-width="1.2"/><rect x="2.9" y="3.5" width="12.6" height="8"/><rect x="22.3" y="5.4" width="2.2" height="4.2" rx="1.1"/></svg>';
  var ICON_PLANE = '<svg width="23" height="23" viewBox="0 0 1024 1024" fill="#555"><path d="M972.48 40.64c-17.38666667-8.64-34.77333333-8.64-43.41333333 0L60.16 472.10666667C42.88 472.10666667 34.13333333 489.38666667 34.13333333 506.66666667s8.64 34.56 17.38666667 34.56l208.53333333 129.49333333c17.38666667 8.64 34.77333333 8.64 52.16-8.64l460.48-414.18666667 17.38666667 8.64-417.06666667 439.89333334c-8.64 8.64-8.64 17.28-8.64 25.92v189.86666666c0 17.28 8.64 34.56 26.02666667 43.2 17.38666667 8.64 34.77333333 0 43.41333333-8.64l104.32-103.57333333L746.66666667 981.22666667c8.64 8.64 17.38666667 8.64 26.02666666 8.64h17.38666667c17.38666667-8.64 26.02666667-17.28 26.02666667-34.56l173.76-862.93333334c0-25.92 0-43.09333333-17.38666667-51.73333333z"/></svg>';
  var ICON_PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5.4v13.2M5.4 12h13.2" stroke="#454545" stroke-width="3" stroke-linecap="round"/></svg>';
  // 主屏微信图标（绿色圆角块 + 白色对话泡）
  var ICON_POWEROFF = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.5a8 8 0 1 0 11.4 0"/></svg>';
  // 底栏两个 tab：对话 / 发现（指南针）
  var ICON_GEAR = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2.1" fill="#fff" stroke="none"/><circle cx="9" cy="12" r="2.1" fill="#fff" stroke="none"/><circle cx="17" cy="17" r="2.1" fill="#fff" stroke="none"/></svg>';
  var ICON_TAB_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.34-4.1-1L3 20l1.1-4.9A8.5 8.5 0 1 1 21 11.5z"/></svg>';
  var ICON_TAB_DISC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/></svg>';
  var ICON_TAB_CONT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 4.2a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z"/><path d="M3.8 19.4c.5-2.9 2.8-4.6 5.8-4.6s5.3 1.7 5.8 4.6"/><path d="M15.6 5.2a3 3 0 0 1 0 5.6M17.4 14.9c1.9.5 3.3 1.9 3.7 3.9"/></svg>';
  // 发现页里的朋友圈入口（彩色圆标）
  var ICON_MOMENTS = '<svg viewBox="0 0 1024 1024"><path fill="#fff" d="M512 954.24A442.24 442.24 0 1 0 69.76 512 442.08 442.08 0 0 0 512 954.24z m0-30.88a401.12 401.12 0 0 1-137.12-21.92V621.6l274.24 276.64A356 356 0 0 1 512 923.36z m285.28-119.68a400 400 0 0 1-112 81.28L487.2 687.04l389.44 1.92a359.52 359.52 0 0 1-79.2 114.72z m118.24-289.28a400 400 0 0 1-21.92 136.96H613.76l276.8-273.92a355.04 355.04 0 0 1 25.12 136.96z m-232.8-368a355.68 355.68 0 0 1 114.56 79.04 402.88 402.88 0 0 1 81.44 112L680.96 535.52zM512 653.6A141.6 141.6 0 1 1 653.6 512 141.6 141.6 0 0 1 512 653.6z m0-548.32A400 400 0 0 1 649.12 128v280L375.04 130.4A356.32 356.32 0 0 1 512 105.28z m-285.28 119.84a405.44 405.44 0 0 1 112-81.44l198.4 198.08-389.44-2.08a355.68 355.68 0 0 1 79.04-114.56zM108.64 514.4a400 400 0 0 1 21.92-136.96h279.84L133.6 651.36a357.92 357.92 0 0 1-24.96-136.96z m234.72-21.12l-1.92 389.44a357.12 357.12 0 0 1-114.72-79.04 401.76 401.76 0 0 1-81.28-112z"/><path fill="#FC6B4F" d="M649.12 128A400 400 0 0 0 512 105.28a356.32 356.32 0 0 0-137.12 25.12l274.08 276.8z"/><path fill="#7838F2" d="M797.44 225.12a355.68 355.68 0 0 0-114.56-79.04l-1.92 389.44 197.92-198.08a402.88 402.88 0 0 0-81.44-112.32z"/><path fill="#5698F3" d="M893.76 651.36a400 400 0 0 0 21.92-136.96 355.04 355.04 0 0 0-25.12-136.96l-276.8 273.92z"/><path fill="#20E9F4" d="M685.12 884.96a400 400 0 0 0 112-81.28 359.52 359.52 0 0 0 79.2-114.72l-389.44-1.92z"/><path fill="#00FD60" d="M375.04 901.44A401.12 401.12 0 0 0 512 923.36a356 356 0 0 0 136.96-25.12L375.04 621.6z"/><path fill="#ABFB5B" d="M341.44 882.72l1.92-389.44L145.44 691.2a401.76 401.76 0 0 0 81.28 112 357.12 357.12 0 0 0 114.72 79.52z"/><path fill="#F0E254" d="M130.56 377.44a400 400 0 0 0-21.92 136.96 357.92 357.92 0 0 0 24.96 136.96l276.8-273.92z"/><path fill="#F6B351" d="M339.04 144a405.44 405.44 0 0 0-112 81.44 355.68 355.68 0 0 0-79.04 114.56l389.44 2.08z"/></svg>';
  var ICON_CHEV = '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="#c3c7cd" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';
  var ICON_CAM = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#454545" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h2.2l1.6-2.4A1.5 1.5 0 0 1 9 5h6a1.5 1.5 0 0 1 1.2.6L17.8 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="12.5" r="3.2"/></svg>';
  // ⋯菜单里的爱心/对话线条图标（仿微信，深底上用白色描边）
  var ICON_HEART = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_HEART_F = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#e5484d"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var ICON_BUBBLE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.34-4.1-1L3 20l1.1-4.9A8.5 8.5 0 1 1 21 11.5z"/></svg>';

  var ICON_WECHAT = '<svg width="30" height="30" viewBox="0 0 1024 1024"><path fill="#fff" d="M669.3 369.4c9.8 0 19.6 0 29.4 1.6C671 245.2 536.9 152 383.2 152 211.6 152 71 269.7 71 416.8c0 85 45.8 156.9 124.2 210.9l-31.1 93.2L273.6 667c39.2 8.2 70.3 16.3 109.5 16.3 9.8 0 19.6 0 31.1-1.6-6.5-21.3-9.8-42.5-9.8-65.4 0.1-135.7 116.2-246.9 264.9-246.9z m-168.4-85c24.5 0 39.2 16.3 39.2 39.2 0 22.9-16.3 39.2-39.2 39.2-24.5 0-47.4-16.4-47.4-39.2 0-24.5 24.6-39.2 47.4-39.2z m-216.3 73.1c-24.7 0-47.8-16.2-47.8-38.8 0-24.3 24.7-38.8 47.8-38.8s39.5 16.2 39.5 38.8c0.1 22.7-16.4 38.8-39.5 38.8z"/><path fill="#fff" d="M953.8 613c0-125.9-124.2-227.2-264.8-227.2-148.8 0-266.5 103-266.5 227.2 0 125.9 117.7 227.2 266.5 227.2 31.1 0 62.1-8.2 93.2-16.3l85 47.4-22.9-78.5c62.1-47.4 109.5-109.5 109.5-179.8z m-351.5-39.2c-14.7 0-31.1-14.7-31.1-31.1 0-14.7 16.3-31.1 31.1-31.1 22.9 0 39.2 16.3 39.2 31.1 0 16.4-14.7 31.1-39.2 31.1z m178-7.6c-14.8 0-31.3-14.6-31.3-30.7 0-14.6 16.5-30.7 31.3-30.7 23.1 0 39.5 16.2 39.5 30.7 0 16.2-16.4 30.7-39.5 30.7z"/></svg>';
  // [+] 菜单图标（自绘线性图标，微信那种简洁风）
  var ICO = {
    sticker: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><circle cx="9" cy="9.8" r="1.1" fill="#555" stroke="none"/><circle cx="15" cy="9.8" r="1.1" fill="#555" stroke="none"/><path d="M8.4 14c1 1.2 2.2 1.8 3.6 1.8s2.6-.6 3.6-1.8"/></svg>',
    image: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="9.8" r="1.6"/><path d="M4.5 17.5l4.6-4.6 3 3 3.6-3.6 4.3 4.2"/></svg>',
    voice: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="10.5" rx="3"/><path d="M5.8 11.2a6.2 6.2 0 0 0 12.4 0M12 17.6V21M9.2 21h5.6"/></svg>',
    poke: '<svg width="26" height="26" viewBox="0 0 1024 1024" fill="#555"><path d="M654.890667 132.394667l5.290666 2.56 8.021334 4.266666 12.928 7.189334 14.293333 8.170666 26.794667 15.786667 24.170666 14.570667 33.578667 20.672 45.312 28.373333 50.773333 32.32 76.181334 49.194667 31.082666 20.266666 2.922667 2.069334a42.666667 42.666667 0 0 1 16.277333 30.058666l0.149334 3.584v416.682667l-0.106667 4.373333a85.333333 85.333333 0 0 1-72.789333 80.042667l-4.330667 0.533333-312.896 29.802667-4.8 0.384-4.8 0.192a128 128 0 0 1-128.96-108.010667l-0.682667-4.906666-20.16-169.962667-150.933333 0.021333-4.864-0.085333c-69.418667-2.624-124.16-61.226667-126.592-132.864L170.666667 482.666667l0.085333-5.013334 0.256-4.970666c4.757333-69.333333 58.538667-125.312 126.336-127.872l4.864-0.085334H544.426667l-3.2-2.432-3.626667-2.858666c-58.666667-47.786667-59.946667-116.672-29.930667-164.352l2.453334-3.712 3.968-5.525334c29.973333-39.253333 82.773333-59.968 140.8-33.450666z m-60.458667 143.146666l2.837333 2.026667 71.914667 49.578667 24.533333 17.322666 7.936 5.76 5.12 3.925334 2.496 2.154666c27.050667 25.130667 10.858667 71.04-25.962666 73.621334l-3.306667 0.128h-377.813333l-3.072 0.106666c-23.466667 1.813333-43.114667 24.042667-43.114667 52.501334 0 28.48 19.626667 50.709333 43.114667 52.501333l3.093333 0.128h188.864l3.370667 0.128A42.666667 42.666667 0 0 1 532.906667 569.6l0.533333 3.349333 24.597333 207.573334 0.512 3.242666a42.666667 42.666667 0 0 0 42.453334 34.389334l3.456-0.192L917.333333 788.16V394.581333l-60.842666-39.424-62.293334-39.829333-47.146666-29.696-34.88-21.589333-25.024-15.210667-22.442667-13.376-19.882667-11.52-8.96-5.098667-12.266666-6.741333-2.474667-1.258667c-38.634667-18.090667-68.565333 32.96-26.688 64.682667zM230.592 201.749333l27.669333 80.725334-7.296 2.666666a213.482667 213.482667 0 0 0-71.466666 45.568 212.544 212.544 0 0 0-65.322667 153.621334 212.565333 212.565333 0 0 0 66.026667 154.325333 213.269333 213.269333 0 0 0 78.272 47.616l-27.605334 80.746667-8.725333-3.136a298.752 298.752 0 0 1-100.864-63.509334 297.877333 297.877333 0 0 1-92.437333-216.042666c0-82.197333 33.429333-159.146667 91.434666-215.082667a298.624 298.624 0 0 1 110.314667-67.498667z"/></svg>',
    location: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.7" stroke-linejoin="round"><path d="M12 21s6.8-6 6.8-10.6A6.8 6.8 0 0 0 5.2 10.4C5.2 15 12 21 12 21z"/><circle cx="12" cy="10.3" r="2.4"/></svg>',
    transfer: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.8" y="6" width="18.4" height="13" rx="2.6"/><path d="M2.8 9.8h18.4M14.8 14.2h4.4"/></svg>'
  };

  // 转账卡：微信同款结构——左侧大徽标圈（高度≈金额+状态两行），右侧金额+状态上下排，
  // 备注放在最底的小字行；全状态同卡（黄卡/退还是灰卡），发送与接收双方同卡同款，
  // 群聊发送方卡在金额旁标「给 X」，待收款的对方卡可点收款。
  function fmtTAmount(a) {
    var n = Number(a);
    if (isNaN(n) || n <= 0) return '0';
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }
  function tcardHtml(amount, note, badge, status, back, toTag, clickable, ring) {
    return '<div class="lzjm-tcard' + (back ? ' back' : '') + (clickable ? ' waiting' : '') + '"' + (clickable ? ' data-taccept="1"' : '') + '>' +
      '<div class="lzjm-tmain"><span class="lzjm-tbadge' + (ring ? ' ring' : '') + '">' + badge + '</span>' +
      '<div class="lzjm-tright"><div class="lzjm-tamt2">¥' + fmtTAmount(amount) + (toTag || '') + '</div>' +
      '<div class="lzjm-tst2">' + status + '</div></div></div>' +
      '<div class="lzjm-tnote3">' + esc(note || '') + '</div></div>';
  }
  function transferCardHtml(m, isUser, groupMode) {
    var state = m.state === 'accepted' ? 'accepted' : m.state === 'declined' ? 'declined' : 'waiting';
    if (state !== 'waiting') {
      // 发起方视角的处置结果：accepted 已被接受 / declined 已被拒绝
      return tcardHtml(m.amount, m.note, state === 'accepted' ? ICON_TOK : ICON_TNO, state === 'accepted' ? '已被接受' : '已被拒绝', state === 'declined', '', false);
    }
    var toTag = (isUser && groupMode && m.to) ? '<span class="lzjm-tto">给 ' + esc(m.to) + '</span>' : '';
    return tcardHtml(m.amount, m.note, ICON_TWAIT, '待收款', false, toTag, !isUser, true);
  }

  // 转账处置回执卡：接收方视角的处置结果（taccept 已收款 / tdecline 已退还），与转账卡同卡同款。
  function verdictCardHtml(m) {
    return tcardHtml(m.amount, m.note, m.kind === 'taccept' ? ICON_TOK : ICON_TNO, m.kind === 'taccept' ? '已收款' : '已退还', m.kind === 'tdecline', '', false);
  }

  // ── 手机内气泡行 ──
  // targetName：会话对象显示名（私聊=联系人，群聊=群名），用户戳一戳时显示「你戳了戳 TA」
  function chatRowHtml(m, userName, contactMap, targetName, idx, peeked, showName) {
    if (m.who === 'sys') return '<div class="lzjm-sysrow">' + esc(m.text || '') + '</div>'; // 系统条目：挂断/拒接记录
    var isUser = m.who === 'user';
    var who = isUser ? userName : m.who;
    // 撤回未偷看：只留一行可点击的撤回提示
    if (m.recalled && !peeked) {
      return '<div class="lzjm-recallrow" data-peek="' + idx + '" data-del="' + idx + '">' + esc(who) + ' 撤回了一条消息</div>';
    }
    var peektg = m.recalled ? '<span class="lzjm-peektg" data-peek="' + idx + '">已撤回 · 点击隐藏</span>' : '';
    var avatar;
    if (isUser) {
      var uav = window.LZJM.Engine.userAvatar();
      avatar = uav
        ? '<img class="lzjm-ava lzjm-ava-me" src="' + esc(uav) + '">'
        : '<div class="lzjm-ava lzjm-ava-me">' + esc(who.slice(0, 1)) + '</div>';
    } else {
      var c = contactMap && contactMap[m.who];
      avatar = (c && c.avatar)
        ? '<img class="lzjm-ava" src="' + esc(window.LZJM.Worldbook.imgUrl(c.avatar)) + '">'
        : '<div class="lzjm-ava">' + esc(who.slice(0, 1)) + '</div>';
    }
    var bub;
    if (m.kind === 'sticker') {
      var file = window.LZJM.Engine.stickers()[m.text];
      bub = file
        ? '<img class="lzjm-sticker" src="' + esc(window.LZJM.Worldbook.imgUrl(file)) + '" title="' + esc(m.text) + '">'
        : '<div class="lzjm-bub">[表情:' + esc(m.text) + ']</div>';
    } else if (m.kind === 'poke') {
      bub = richBub(m, isUser, who, targetName, true);
      return '<div class="lzjm-pokerow" data-del="' + idx + '">' + bub + '</div>';
    } else if (m.kind === 'calllog') {
      // 通话记录泡：语音=听筒朝下，视频=摄像机（不旋转），图标比字略小
      var vcLog = m.mode === 'video';
      bub = '<div class="lzjm-bub lzjm-calllog">' + esc(m.text || '') + '<span class="lzjm-calllog-ico' + (vcLog ? ' vc' : '') + '">' + (vcLog ? ICON_VCALL : ICON_CALL) + '</span></div>';
    } else if (m.kind === 'transfer') {
      // 转账卡不是气泡：双方都是白底卡（showName 即群聊态），待收款的对方卡可点收款
      bub = transferCardHtml(m, isUser, !!showName);
    } else if (m.kind === 'taccept' || m.kind === 'tdecline') {
      // 转账处置回执：接收方侧的黄卡/灰卡，与转账卡同尺寸，走正常聊天行（带头像）
      bub = verdictCardHtml(m);
    } else if (m.kind === 'voice' || m.kind === 'image' || m.kind === 'location') {
      bub = richBub(m, isUser, who, targetName, false);
    } else {
      bub = '<div class="lzjm-bub">' + esc(m.text) + '</div>';
    }
    // 撤回标签注入气泡开口处（sticker 为裸 img，单独包一层）
    if (peektg) {
      if (bub.indexOf('<div class="lzjm-bub') === 0) {
        var gt = bub.indexOf('>');
        bub = bub.slice(0, gt + 1) + peektg + bub.slice(gt + 1);
      } else {
        bub = '<div class="lzjm-bub" style="padding:6px">' + peektg + bub + '</div>';
      }
    }
    if (showName && !isUser && m.who) bub = '<div class="lzjm-col"><div class="lzjm-sender">' + esc(m.who) + '</div>' + bub + '</div>';
    return '<div class="lzjm-chatrow' + (isUser ? ' me' : '') + '" data-del="' + idx + '">' + avatar + bub + '</div>';
  }

  // 富消息气泡：voice/image/location/poke 的真实渲染（chatRowHtml 与待发预览共用）
  function richBub(m, isUser, who, targetName, pokeIt) {
    if (m.kind === 'poke') {
      return '<div class="lzjm-poke"' + (pokeIt ? ' data-poke="1"' : '') + '>' + (isUser ? '你戳了戳 ' + esc(targetName || '对方') : esc(who) + ' 戳了戳你') + '</div>';
    }
    if (m.kind === 'voice') {
      var vsec = Math.max(2, Math.min(40, Math.round(m.text.length * 0.35)));
      return '<div class="lzjm-bub lzjm-voice' + (isUser ? ' me' : '') + '" data-voice="1" title="点击转文字查看内容"><span class="lzjm-voice-play">' + ICON_VOICE + '</span><span class="lzjm-voice-sec">' + vsec + '&#8243;</span><div class="lzjm-voicetxt">' + esc(m.text) + '</div></div>';
    }
    if (m.kind === 'image') {
      return '<div class="lzjm-bub lzjm-imgbox"><div class="lzjm-imgph"><span>' + esc(m.text) + '</span></div></div>';
    }
    if (m.kind === 'location') {
      return '<div class="lzjm-bub lzjm-locbox"><div class="lzjm-locmap"></div><div class="cap">&#128205; ' + esc(m.text) + '</div></div>';
    }
    return '<div class="lzjm-bub">' + esc(m.text) + '</div>';
  }

  // ── 待发区气泡（攒好的消息，小飞机一键全发） ──
  function stagedHtml(userName) {
    var W = window.LZJM;
    var uav = W.Engine.userAvatar();
    var av = uav
        ? '<img class="lzjm-ava lzjm-ava-me" src="' + esc(uav) + '">'
        : '<div class="lzjm-ava lzjm-ava-me">' + esc(userName.slice(0, 1)) + '</div>';
    return UI.staged.map(function (m, i) {
      var stgx = '<span class="lzjm-stgx" data-sdel="' + i + '" title="删掉这条">×</span>';
      if (m.kind === 'poke') {
        return '<div class="lzjm-stgrow lzjm-stgcenter">' + richBub(m, true, userName, '', false) + stgx + '</div>';
      }
      if (m.kind === 'transfer') {
        return '<div class="lzjm-chatrow me lzjm-stgrow">' + av + '<div class="lzjm-stgitem">' + transferCardHtml(m, true, false) + stgx + '</div></div>';
      }
      if (m.kind === 'taccept' || m.kind === 'tdecline') {
        // 回执预览与转账预览同构：机主行 + 头像 + 卡（不再用居中窄卡，避免错位）
        return '<div class="lzjm-chatrow me lzjm-stgrow">' + av + '<div class="lzjm-stgitem">' + verdictCardHtml({ who: 'user', kind: m.kind, amount: m.amount, note: m.note }) + stgx + '</div></div>';
      }
      if (m.kind === 'sticker') {
        var file = W.Engine.stickers()[m.text];
        var inner = file
          ? '<img class="lzjm-stgstick" src="' + esc(W.Worldbook.imgUrl(file)) + '" title="' + esc(m.text) + '">'
          : esc(m.text);
        return '<div class="lzjm-chatrow me lzjm-stgrow">' + av + '<div class="lzjm-bub">' + inner + stgx + '</div></div>';
      }
      if (m.kind === 'text') {
        return '<div class="lzjm-chatrow me lzjm-stgrow">' + av + '<div class="lzjm-bub">' + esc(m.text) + stgx + '</div></div>';
      }
      // image / voice / location：直接渲染成真实气泡，发送前后视觉一致
      return '<div class="lzjm-chatrow me lzjm-stgrow">' + av + '<div class="lzjm-stgitem">' + richBub(m, true, userName, '', false) + stgx + '</div></div>';
    }).join('');
  }

  var UI = {
    screen: 'home',      // home | list | moments | mprofile | cdetail | chat
    tab: 'chats',        // list 页底栏：chats | contacts | discover
    mProfile: null,      // mprofile 页看的对象名
    mFrom: 'moments',    // mprofile 的返回来源：moments | cdetail
    cdetName: null,      // cdetail 页看的对象名
    feedScr: null,       // 当前 DOM 里 .lzjm-mfeed 属于哪个屏（跨屏不还原滚动）
    mMenu: -1,           // 展开「赞/评论」小菜单的动态下标
    mCmt: -1,            // 展开评论输入框的动态下标
    panel: null,         // null | 'actions' | 'sticker' | 'image' | 'voice' | 'location' | 'transferto' | 'transfer'
    chatKey: null,
    isGroup: false,
    busy: false,
    lineBusy: false,       // 选线写入世界书进行中，防连点
    staged: [],          // 待发消息 [{kind,text}]，回车攒入，小飞机一起发
    failed: false,        // 上次生成失败（消息已发出但对方没回成）→ 小飞机/↻ 变为重试
    peek: {},             // 撤回偷看集合：chatKey:index → true
    confirmDel: -1,       // 待确认删除的消息下标（-1=无）
    mConfirmDel: -1,      // 待确认删除的自己的动态下标（-1=无）
    tConfirm: -1,         // 待确认收款的转账消息下标（-1=无）
    pConfirmDel: '',      // 待确认删除的自定义 API 预设名（''=无）
    tTarget: '',          // 群聊转账选中的接收方（确定发出后清空）
    _placed: false,

    injectStyle: function () {
      var doc = pdoc();
      if (!doc.getElementById('lzjm-style')) {
        var st = doc.createElement('style');
        st.id = 'lzjm-style';
        st.textContent = CSS;
        doc.head.appendChild(st);
      }
    },

    inject: function () {
      var doc = pdoc();
      this.injectStyle();
      if (!doc.getElementById(ID.phone)) {
        var ph = doc.createElement('div');
        ph.id = ID.phone;
        doc.body.appendChild(ph);
      }
      if (!this._placed) {
        this._placed = true;
        var vv = pwin().visualViewport;
        var target = vv || pwin();
        try {
          target.addEventListener('resize', placePhone);
          if (vv) vv.addEventListener('scroll', placePhone);
        } catch (e) {}
      }
    },

    remove: function () {
      var p = pdoc().getElementById(ID.phone);
      if (p) p.remove();
    },

    toggle: function () {
      var ph = pdoc().getElementById(ID.phone);
      if (!ph) return;
      ph.classList.toggle('lzjm-open');
      if (ph.classList.contains('lzjm-open')) {
        placePhone();
        this.screen = 'home';
        this.panel = null;
        this.staged = [];
        this.render();
      }
    },

    openChat: function (key, isGroup) {
      this.chatKey = key;
      this.isGroup = !!isGroup;
      this.screen = 'chat';
      this.panel = null;
      this.staged = [];
      try { window.LZJM.Store.clearUnread(key); } catch (e) {}
      this.render();
    },

    // ── 朋友圈 ──
    openMoments: function () {
      var W = window.LZJM;
      this.tab = 'discover';
      this.screen = 'moments';
      this.mMenu = -1;
      this.mCmt = -1;
      try { W.Store.clearUnread(W.Engine.momentsKey); } catch (e) {}
      this.render();
      this.momentsEnsureFresh();
    },
    // 每个故事日首次进入生成 3~4 条动态；生成完若还在朋友圈页就刷新
    // 已生成 / 状态栏日期缺失都不静默跳过：前者由引擎 filledDay 判重，后者兜底生成一次并提示
    momentsEnsureFresh: function () {
      if (this.mBusy) return;
      var eng = window.LZJM.Engine;
      var stamp = null;
      try { stamp = window.LZJM.Status.snapshot(null); } catch (e) {}
      if (!(stamp && stamp.dateText)) {
        console.warn('[霖州引擎] 朋友圈：最近 6 层未解析到 <status> 里的 <环境> 日期，按无日期兜底生成一次');
        try { toastr.warning('未解析到状态栏日期，朋友圈已按无日期生成；检查最近楼层的状态栏 <环境> 块', '霖州手机', { timeOut: 6000 }); } catch (e) {}
      }
      this.mBusy = true;
      this.render();
      var self = this;
      eng.momentsEnsure().then(function (got) {
        if (got) try { toastr.info('📱 朋友们更新了朋友圈', '霖州手机', { timeOut: 3000 }); } catch (e) {}
      }).catch(function (e) {
        console.warn('[霖州引擎] 朋友圈填充失败', e);
        try { toastr.error('朋友圈加载失败：' + (e && e.message || e), '霖州手机'); } catch (e2) {}
      }).finally(function () {
        self.mBusy = false;
        if (self.screen === 'moments') self.render();
      });
    },
    // 赞：纯本地往返
    momentsLike: function (idx) {
      try { window.LZJM.Engine.momentsLike(idx); } catch (e) {}
      this.mMenu = -1;
      this.render();
    },
    // 删自己的动态：下标移位会让 mMenu/mCmt 指向别的条目，一并复位再渲染
    momentsDeleteAt: function (idx) {
      try { window.LZJM.Engine.momentsDelete(idx); } catch (e) {}
      this.mMenu = -1;
      this.mCmt = -1;
      this.render();
    },
    // 评论：先落库，接话生成完若还在朋友圈页就刷新（不在场时红点由引擎挂）
    momentsSendComment: function (idx, text) {
      var eng = window.LZJM.Engine;
      this.mCmt = -1;
      this.mBusy = true;
      this.render();
      var self = this;
      eng.momentsComment(idx, text).catch(function (e) {
        console.warn('[霖州引擎] 朋友圈评论失败', e);
        try { toastr.error('评论发送失败：' + (e && e.message || e), '霖州手机'); } catch (e2) {}
      }).finally(function () {
        self.mBusy = false;
        if (self.screen === 'moments' || self.screen === 'mprofile') self.render();
      });
    },

    // 选线弹窗：居中菜单，独立于手机壳——古代线没有手机也要能由此换回现代线
    showLines: function () {
      this.injectStyle();
      var pop = pdoc().getElementById('lzjm-linespop');
      if (!pop) {
        pop = pdoc().createElement('div');
        pop.id = 'lzjm-linespop';
        pop.onclick = function (e) { if (e.target === pop) UI.closeLines(); }; // 点遮罩关闭
        pdoc().body.appendChild(pop);
      }
      // 定位：inset:0 锚定布局视口，移动端/缩放时会大于可见区导致卡片飞出屏幕；
      // 改按 visualViewport 可见矩形显式落位（含缩放偏移），居中交给 flex
      placeLinesPop();
      if (!this._lpPlaced) {
        this._lpPlaced = true;
        try {
          var lpt = pwin().visualViewport;
          if (lpt) { lpt.addEventListener('resize', placeLinesPop); lpt.addEventListener('scroll', placeLinesPop); }
        } catch (e) {}
        try { pwin().addEventListener('resize', placeLinesPop); } catch (e) {}
      }
      this.renderLinesPop();
      // 打开菜单时重读一次世界书开关实况（玩家可能手动翻过条目），回来刷新徽标
      try {
        var self = this;
        window.LZJM.Engine.refreshStates().then(function () { self.renderLinesPop(); });
      } catch (e) {}
    },

    closeLines: function () {
      var pop = pdoc().getElementById('lzjm-linespop');
      if (pop) pop.remove();
    },

    renderLinesPop: function () {
      var pop = pdoc().getElementById('lzjm-linespop');
      if (!pop) return;
      pop.innerHTML =
        '<div class="lzjm-lpop-card">' +
        '<div class="lzjm-lpop-head"><div class="lzjm-lpop-t">世界线</div><div class="lzjm-lpop-sub">切换后世界书自动归位并记录绑定 · 再次进入本聊天将恢复此世界线</div><span class="lzjm-lpop-x" data-lpx title="关闭">×</span></div>' +
        '<div class="lzjm-lpop-list">' + linesRowsHtml() + '</div>' +
        '<div class="lzjm-lpop-foot">世界线以此处绑定为准 · 手动开关世界书条目视为无效</div>' +
        '</div>';
      pop.querySelector('[data-lpx]').onclick = function () { UI.closeLines(); };
      pop.querySelectorAll('.lzjm-nm-item').forEach(function (el) {
        el.onclick = function () { UI.switchLine(el.dataset.line, el.dataset.if || null); };
      });
    },

    // 玩家在选线弹窗拍板：写世界书条目 + 更新记录，两边一起动（唯一合法的换线动作）。
    // ifEntry 为 null = 空白项（只切线不开IF）。弹窗留在原地刷新徽标，不碰手机。
    switchLine: async function (line, ifEntry) {
      if (this.lineBusy) return;
      var W = window.LZJM;
      var eng = W.Engine;
      if (!eng.entryKnown(line)) {
        try { toastr.warning('世界书里找不到【' + line + '】条目，无法切换', '📱 霖州引擎'); } catch (e) {}
        return;
      }
      this.lineBusy = true;
      try {
        await W.Worldbook.setEntriesEnabled(eng.lineIfOps(line, ifEntry || null));
        W.Store.setLine(line);
        await eng.refreshStates(); // 重读真实开关（含IF条目）——快照不含IF翻动的乐观更新，菜单高亮靠它
        eng.locateLine(); // 记录与开关已一致，只归位内部状态，不会二次写条目，也不会打开手机
        try {
          var meta = (eng.LINE_META || {})[line] || {};
          var msg = '已切换到【' + (meta.label || line) + '】' + (ifEntry ? ' · ' + ifEntry : ' · 空白');
          toastr.info(msg, '📱 霖州引擎');
        } catch (e) {}
        this.renderLinesPop();
      } catch (e) {
        console.warn('[霖州引擎] 切换世界线失败', e);
        try { toastr.error('切换世界线失败：' + (e && e.message || e), '📱 霖州引擎'); } catch (e2) {}
      } finally { this.lineBusy = false; }
    },

    render: function () {
      var ph = pdoc().getElementById(ID.phone);
      if (!ph) return;
      var W = window.LZJM;
      var eng = W.Engine;
      var userName = eng.userName();
      var snap = W.Status.snapshot(null);
      var clock = snap.time ? snap.time : '--:--';
      var dateShort = snap.dateText ? snap.dateText.replace(/^(\d{4})年/, '') : '';

      var sbar =
        '<div class="lzjm-sbar"><span class="lzjm-clock">' + esc(clock) + '</span>' +
        '<span class="lzjm-island"></span>' +
        '<span class="lzjm-sicons"><span class="lzjm-sig"><i></i><i></i><i></i><i></i></span>' +
        ICON_WIFI +
        ICON_BATT + '</span></div>';

      var callBg = '';
      if (this.call) {
        try {
          var cc = eng.findContact(this.call.name) || {};
          var cimg = cc.avatar ? esc(W.Worldbook.imgUrl(cc.avatar)) : '';
          callBg = (cimg ? '<img class="lzjm-callfeed" src="' + cimg + '">' : '') + '<div class="lzjm-callshade"></div>';
        } catch (e) { callBg = '<div class="lzjm-callshade"></div>'; }
      }

      var body;
      if (this.call) {
        body = callHtml(this.call, userName);
      } else if (this.screen === 'home') {
        var totalUn = 0;
        try {
          // 桌面图标是 app 级角标：会话未读 + 朋友圈动态未读（朋友对机主动态的赞/评论）都上角标，
          // 与发现 tab 红点是同一份计数（Store.meta(momentsKey).unread）
          W.Store.historyKeys().forEach(function (k) { totalUn += W.Store.meta(k).unread || 0; });
        } catch (e0) {}
        body =
          '<div class="lzjm-body"><div class="lzjm-home-wall">' +
          '<div class="lzjm-hometime"><div class="t">' + esc(clock) + '</div><div class="d">' + esc(dateShort || '霖州') + '</div></div>' +
          '<div class="lzjm-homegrid">' +
          '<div class="lzjm-app" data-app="wechat"><div class="lzjm-app-ico" style="background:#22c05e;border:none;position:relative">' + ICON_WECHAT +
          (totalUn ? '<span class="lzjm-appdot">' + (totalUn > 99 ? '99+' : totalUn) + '</span>' : '') + '</div><span>微信</span></div>' +
          '<div class="lzjm-app" data-app="settings"><div class="lzjm-app-ico" style="background:#8e97a8;border:none;color:#fff">' + ICON_GEAR + '</div><span>设置</span></div>' +
          '<div class="lzjm-app" data-app="close" title="收起手机"><div class="lzjm-app-ico" style="background:#e5484d;border:none;color:#fff">' + ICON_POWEROFF + '</div><span>关闭</span></div>' +
          '</div></div></div>';

      } else if (this.screen === 'settings') {
        body = settingsHtml();
      } else if (this.screen === 'list') {
        var sec = eng.section();
        var rowsHtml = '';
        if (this.tab === 'discover') {
          // 发现页：朋友圈入口（红点 = 机主不在场时新产生的接话评论数），无缩略行
          var mUn = 0;
          try { mUn = W.Store.meta(eng.momentsKey).unread || 0; } catch (e0) {}
          rowsHtml =
            '<div class="lzjm-disc-row" data-mom="1"><div class="lzjm-disc-ico">' + ICON_MOMENTS + '</div>' +
            '<div class="lzjm-disc-main"><div class="lzjm-disc-name">朋友圈</div></div>' +
            (mUn ? '<span class="lzjm-unread">' + (mUn > 99 ? '99+' : mUn) + '</span>' : '') +
            '<span class="lzjm-disc-chev">' + ICON_CHEV + '</span></div>';
        } else if (this.tab === 'contacts') {
          // 通讯录：群聊分组（点直接进群）+ 联系人平铺（点进详细资料）
          if (sec) {
            var gRows = (sec.groups || []).map(function (g) {
              var gav = g.avatar
                ? '<img class="lzjm-ava" src="' + esc(W.Worldbook.imgUrl(g.avatar)) + '">'
                : '<div class="lzjm-ava">👥</div>';
              return '<div class="lzjm-conv" data-key="group:' + esc(g.name) + '" data-group="1">' + gav +
                '<div class="lzjm-conv-main"><div class="lzjm-conv-name">' + esc(g.name) + '</div></div></div>';
            }).join('');
            var pRows = (sec.contacts || []).map(function (c) {
              var cav = c.avatar
                ? '<img class="lzjm-ava" src="' + esc(W.Worldbook.imgUrl(c.avatar)) + '">'
                : '<div class="lzjm-ava">' + esc(c.name.slice(0, 1)) + '</div>';
              return '<div class="lzjm-conv" data-cdet="' + esc(c.name) + '">' + cav +
                '<div class="lzjm-conv-main"><div class="lzjm-conv-name">' + esc(c.name) + '</div></div></div>';
            }).join('');
            rowsHtml =
              (gRows ? '<div class="lzjm-sechead">群聊</div>' + gRows : '') +
              (pRows ? '<div class="lzjm-sechead">联系人</div>' + pRows : '') ||
              '<div class="lzjm-sysrow">本世界线暂无联系人</div>';
          } else {
            rowsHtml = '<div class="lzjm-sysrow">未定位到当前世界线<br>进行一次主对话生成后自动归位</div>';
          }
        } else if (sec) {
          var convs = [];
          var kindCn = { sticker: '表情', voice: '语音', image: '图片', poke: '戳一戳', location: '定位' };
          (sec.contacts || []).forEach(function (c) { convs.push({ key: c.name, name: c.name, avatar: c.avatar, group: false }); });
          (sec.groups || []).forEach(function (g) { convs.push({ key: 'group:' + g.name, name: g.name, avatar: g.avatar || '', group: true }); });
          // 只留有消息的会话；按最后一条消息的时间倒序（真微信：最近说话的排最上面）
          var dayNum = function (s) {
            var m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(s || '');
            return m ? (+m[1]) * 372 + (+m[2]) * 31 + (+m[3]) : -1;
          };
          convs = convs.filter(function (cv) { return W.Store.history(cv.key).length > 0; });
          convs.sort(function (a, b) {
            var ha = W.Store.history(a.key), hb = W.Store.history(b.key);
            var la = ha[ha.length - 1], lb = hb[hb.length - 1];
            var da = dayNum(la && la.day), db = dayNum(lb && lb.day);
            if (da !== db) return db - da;
            var ta = (la && la.time) || '', tb = (lb && lb.time) || '';
            return ta === tb ? 0 : (ta > tb ? -1 : 1);
          });
          rowsHtml = convs.map(function (cv) {
            var h = W.Store.history(cv.key);
            var last = h[h.length - 1];
            var prev = last
              ? (last.kind === 'text' ? last.text
                : last.kind === 'calllog' ? '[' + (last.mode === 'video' ? '视频通话' : '语音通话') + ']'
                : '[' + (kindCn[last.kind] || last.kind) + ']')
              : '';
            var av = cv.avatar
              ? '<img class="lzjm-ava" src="' + esc(W.Worldbook.imgUrl(cv.avatar)) + '">'
              : (cv.group ? '<div class="lzjm-ava">👥</div>' : '<div class="lzjm-ava">' + esc(cv.name.slice(0, 1)) + '</div>');
            return '<div class="lzjm-conv" data-key="' + esc(cv.key) + '" data-group="' + (cv.group ? 1 : 0) + '">' +
              av + '<div class="lzjm-conv-main"><div class="lzjm-conv-name">' + esc(cv.name) + '</div>' +
              '<div class="lzjm-conv-prev">' + esc(prev) + '</div></div>' +
              (function () { var un = W.Store.meta(cv.key).unread || 0; return un ? '<span class="lzjm-unread">' + (un > 99 ? '99+' : un) + '</span>' : ''; })() +
              '</div>';
          }).join('') || '<div class="lzjm-sysrow">暂无会话<br>去通讯录找人聊聊吧</div>';
        } else {
          rowsHtml = '<div class="lzjm-sysrow">未定位到当前世界线<br>进行一次主对话生成后自动归位</div>';
        }
        // 底栏：微信 | 通讯录 | 发现（发现挂朋友圈未读红点；微信挂会话总红点）
        var totalUn2 = 0;
        try {
          // 只算会话未读；朋友圈的未读挂发现 tab（mUn2），别混进微信 tab
          W.Store.historyKeys().forEach(function (k) { if (k !== eng.momentsKey) totalUn2 += W.Store.meta(k).unread || 0; });
        } catch (e0) {}
        var mUn2 = 0;
        try { mUn2 = W.Store.meta(eng.momentsKey).unread || 0; } catch (e0) {}
        body = '<div class="lzjm-body">' + rowsHtml + '</div>' +
          '<div class="lzjm-tabbar">' +
          '<button class="lzjm-tab' + (this.tab === 'chats' ? ' on' : '') + '" data-tab="chats">' + ICON_TAB_CHAT + '<span>微信</span>' + (totalUn2 ? '<span class="lzjm-tabdot">' + (totalUn2 > 99 ? '99+' : totalUn2) + '</span>' : '') + '</button>' +
          '<button class="lzjm-tab' + (this.tab === 'contacts' ? ' on' : '') + '" data-tab="contacts">' + ICON_TAB_CONT + '<span>通讯录</span></button>' +
          '<button class="lzjm-tab' + (this.tab === 'discover' ? ' on' : '') + '" data-tab="discover">' + ICON_TAB_DISC + '<span>发现</span>' + (mUn2 ? '<span class="lzjm-tabdot">' + (mUn2 > 99 ? '99+' : mUn2) + '</span>' : '') + '</button>' +
          '</div>';

      } else if (this.screen === 'moments') {
        var secM = eng.section() || {};
        var coverF = (secM.moments && secM.moments.cover) || '';
        var coverU = coverF ? W.Worldbook.imgUrl(coverF) : '';
        var uav = '';
        try { uav = eng.userAvatar(); } catch (e0) {}
        var mfeed2 = eng.momentsFeed();
        var postsHtml = '';
        for (var mi = mfeed2.length - 1; mi >= 0; mi--) postsHtml += momentsPostHtml(mfeed2[mi], mi, userName, eng, W, true, snap.dateText || '');
        body = '<div class="lzjm-mfeed">' +
          '<div class="lzjm-mcover">' + (coverU ? '<img src="' + esc(coverU) + '" alt="">' : '') +
          '<div class="lzjm-mcover-shade"></div>' +
          '<div class="lzjm-mme"><span class="nm">' + esc(userName) + '</span>' +
          (uav ? '<img class="av" src="' + esc(uav) + '" alt="">' : '<div class="av">' + esc(userName.slice(0, 1)) + '</div>') + '</div></div>' +
          '<div class="lzjm-mpad"></div>' +
          (postsHtml || '<div class="lzjm-sysrow" style="margin-top:44px">朋友们还没发动态<br>稍等片刻，或退出重进刷新</div>') +
          (this.mBusy ? '<div class="lzjm-sysrow">朋友们正在更新…</div>' : '') +
          (this.mConfirmDel >= 0 ? '<div class="lzjm-scrim"><div class="lzjm-confirm">删除这条动态？<div class="lzjm-cbtns"><button class="lzjm-cbtn no" data-cact="mdelno">取消</button><button class="lzjm-cbtn yes" data-cact="mdelok">删除</button></div></div></div>' : '') +
          '</div>';

      } else if (this.screen === 'mprofile') {
        var pn = this.mProfile || '';
        var pc = eng.findContact(pn) || {};
        var covF2 = pc.cover || ((eng.section() || {}).moments || {}).cover || '';
        var covU2 = covF2 ? W.Worldbook.imgUrl(covF2) : '';
        // feed 只取一次、下标就地记录：沙箱桥接里 getVariables 每次返回的是副本，
        // 跨两次调用 indexOf 必然 -1——而 idx=-1 会让「UI.mMenu===idx」对所有动态恒真：
        // 进主页默认每条都弹菜单、点 ⋯ 切换失灵
        var feedAll = eng.momentsFeed();
        var hisIdx = [];
        for (var fi2 = feedAll.length - 1; fi2 >= 0 && hisIdx.length < 5; fi2--) {
          if (feedAll[fi2].who === pn) hisIdx.push(fi2);
        }
        var hisHtml = '';
        for (var hi2 = 0; hi2 < hisIdx.length; hi2++) hisHtml += momentsPostHtml(feedAll[hisIdx[hi2]], hisIdx[hi2], userName, eng, W, false, snap.dateText || '');
        body = '<div class="lzjm-mfeed">' +
          '<div class="lzjm-mcover">' + (covU2 ? '<img src="' + esc(covU2) + '" alt="">' : '') +
          '<div class="lzjm-mcover-shade"></div>' +
          '<div class="lzjm-mme"><span class="nm">' + esc(pn) + '</span>' +
          (pc.avatar ? '<img class="av" src="' + esc(W.Worldbook.imgUrl(pc.avatar)) + '" alt="">' : '<div class="av">' + esc(pn.slice(0, 1)) + '</div>') + '</div></div>' +
          '<div class="lzjm-mpad"></div>' +
          (hisHtml || '<div class="lzjm-sysrow" style="margin-top:36px">TA 还没有动态</div>') +
          '</div>';

      } else if (this.screen === 'mpost') {
        // body 必须包 .lzjm-body（flex:1）——否则底部横条不贴底，跟着内容跑
        body = '<div class="lzjm-body"><div class="lzjm-mptext"><textarea class="lzjm-mpta" id="lzjm-mptext" maxlength="280" placeholder="这一刻的想法…"></textarea></div>' +
          '<textarea class="lzjm-mpimg" id="lzjm-mpimg" maxlength="60" placeholder="图片（可选）：用文字描述这张图片的画面，如：一张拍糊的试卷"></textarea></div>';

      } else if (this.screen === 'cdetail') {
        // 联系人详细资料：头像姓名 + 朋友圈入口（带最新动态预览）+ 发消息/通话
        var dn = this.cdetName || '';
        var dc = eng.findContact(dn) || {};
        var dLast = '';
        try {
          var dfeed = eng.momentsFeed();
          for (var di = dfeed.length - 1; di >= 0; di--) {
            if (dfeed[di].who === dn) { dLast = String(dfeed[di].text || '').slice(0, 18); break; }
          }
        } catch (e0) {}
        var dav = dc.avatar
          ? '<img class="lzjm-cava" src="' + esc(W.Worldbook.imgUrl(dc.avatar)) + '">'
          : '<div class="lzjm-cava">' + esc(dn.slice(0, 1)) + '</div>';
        body = '<div class="lzjm-body">' +
          '<div class="lzjm-cdetcard">' + dav + '<div class="lzjm-cdetnm">' + esc(dn) + '</div></div>' +
          '<div class="lzjm-cdetrow" data-mpf="' + esc(dn) + '" data-mfrom="cdetail">' +
          '<span class="l">朋友圈</span>' +
          '<span class="lzjm-cdetpv">' + esc(dLast || '还没发动态') + '</span>' +
          '<span class="lzjm-cdetcv">' + ICON_CHEV + '</span></div>' +
          '<div class="lzjm-cdetmsg" data-cmsg="' + esc(dn) + '">发消息</div>' +
          '<div class="lzjm-cdetcalls">' +
          '<div class="lzjm-cdetcall" data-ccall="' + esc(dn) + ':audio">' + ICON_CALL + '<span>语音通话</span></div>' +
          '<div class="lzjm-cdetcall" data-ccall="' + esc(dn) + ':video">' + ICON_VCALL + '<span>视频通话</span></div>' +
          '</div></div>';

      } else { // chat
        var key = this.chatKey || '';
        var g = this.isGroup;
        var disp = g ? key.replace(/^group:/, '') : key;
        var hist = W.Store.history(key);
        var contactMap = {};
        var secNow = eng.section();
        if (g) {
          var grp = secNow ? (secNow.groups || []).filter(function (x) { return 'group:' + x.name === key; })[0] : null;
          if (grp) grp.members.forEach(function (n) { contactMap[n] = eng.findContact(n) || { name: n, avatar: '' }; });
        } else {
          contactMap[disp] = eng.findContact(disp) || { name: disp, avatar: '' };
        }
        var curDay = '';
        try { curDay = W.Status.snapshot(null).dateText; } catch (e2) {}
        var prevDay = null;
        var rows = hist.map(function (m, i) {
          var pre = '';
          if (m.day && m.day !== prevDay) {
            pre = '<div class="lzjm-sysrow">' + esc(relDay(m.day, curDay) + (m.time ? ' ' + m.time : '')) + '</div>';
            prevDay = m.day;
          }
          return pre + chatRowHtml(m, userName, contactMap, disp, i, !!this.peek[key + ':' + i], this.isGroup);
        }, this).join('');
        if (this.failed && this.canRetry()) rows += '<div class="lzjm-sysrow">⚠ 对方暂时没有回复（生成失败）<br>点右上角刷新图标，或再点小飞机重试</div>';
        if (this.staged.length) rows += stagedHtml(userName);
        body = '<div class="lzjm-body"><div class="lzjm-chatbg" id="lzjm-chatbody">' + rows + '</div></div>' +
          '<div class="lzjm-bottom">' +
          panelHtml(this.panel) +
          '<div class="lzjm-inputbar">' +
          '<button class="lzjm-plus" data-act="plus">' + ICON_PLUS + '</button>' +
          '<input class="lzjm-input" id="lzjm-input" placeholder="回车攒一条，小飞机一起发" maxlength="300">' +
          '<button class="lzjm-send" data-act="send" title="发送（把攒下的消息一起发出）">' + ICON_PLANE + '</button>' +
          '</div></div>';
      }

      var prevScroll = -1, prevNearBottom = true;
      var oldBody = ph.querySelector('#lzjm-chatbody');
      if (oldBody) {
        var opn = oldBody.parentNode;
        prevScroll = opn.scrollTop;
        prevNearBottom = (opn.scrollHeight - opn.clientHeight - opn.scrollTop) < 60;
      }
      var prevSubs = -1;
      var oldSubs = ph.querySelector('.lzjm-callsubs');
      if (oldSubs) prevSubs = oldSubs.scrollTop;
      // 朋友圈 feed 滚动位置保留（点 ⋯/赞/评论只局部改状态，整屏重绘后跳顶很难看）——
      // 只在同屏重绘时生效：跨屏切换（信息流↔个人主页）必须归零，否则主页封面会被
      // 顶上一条信息流带下来的滚动位置「吃掉一截」，看起来比信息流封面矮
      var prevFeed = -1;
      var oldFeed = ph.querySelector('.lzjm-mfeed');
      if (oldFeed && this.feedScr === this.screen) prevFeed = oldFeed.scrollTop;
      // 设置屏滚动位置保留（点选/拉取/存预设都只局部改状态，整屏重绘后跳顶很难看）
      var prevSetScr = -1;
      if (this.screen === 'settings') {
        var oldSetBody = ph.querySelector('.lzjm-body');
        if (oldSetBody) prevSetScr = oldSetBody.scrollTop;
      }

      ph.innerHTML =
        '<div class="lzjm-bezel"><span class="lzjm-btn-side lzjm-btn-vol1"></span><span class="lzjm-btn-side lzjm-btn-vol2"></span>' +
        '<span class="lzjm-btn-side lzjm-btn-act"></span><span class="lzjm-btn-side lzjm-btn-pow"></span>' +
        '<div class="lzjm-screen' + (this.screen === 'home' ? ' lzjm-scr-home' : '') + ((this.screen === 'moments' || this.screen === 'mprofile') ? ' lzjm-scr-moments' : '') + (this.call ? ' lzjm-scr-call' : '') + (this.call && this.call.mode === 'video' ? ' lzjm-scr-video' : '') + '">' + callBg + sbar + appbarHtml(this.screen, disp, this.canReroll() ? 'reroll' : (this.canRetry() ? 'retry' : '')) + body + '<div class="lzjm-homebar"></div>' +
        (this.confirmDel >= 0 ? '<div class="lzjm-scrim"><div class="lzjm-confirm">删除这条消息？<div class="lzjm-cbtns"><button class="lzjm-cbtn no" data-cact="cancel">取消</button><button class="lzjm-cbtn yes" data-cact="del">删除</button></div></div></div>' : '') +
        (this.tConfirm >= 0 ? (function () {
          var tcm = null;
          try { tcm = window.LZJM.Store.history(UI.chatKey)[UI.tConfirm]; } catch (e) {}
          // 卡被删/已处置就不再弹（点卡时已校验 waiting，这里兜底防删帖错位）
          if (!tcm || tcm.who === 'user' || tcm.kind !== 'transfer' || tcm.state !== 'waiting') return '';
          return '<div class="lzjm-scrim"><div class="lzjm-confirm">来自 ' + esc(tcm.who) + ' 的转账 ¥' + fmtTAmount(tcm.amount) +
            (tcm.note ? '<div class="lzjm-tdlnote">' + esc(tcm.note) + '</div>' : '') +
            '<div class="lzjm-cbtns"><button class="lzjm-cbtn no" data-cact="taccno">取消</button>' +
            '<button class="lzjm-cbtn no" data-cact="tdecl">拒绝</button>' +
            '<button class="lzjm-cbtn yes" data-cact="taccok">收下</button></div></div></div>';
        })() : '') +
        (this.pConfirmDel ? '<div class="lzjm-scrim"><div class="lzjm-confirm">删除预设「' + esc(this.pConfirmDel) + '」？<div class="lzjm-cbtns"><button class="lzjm-cbtn no" data-cact="pdelno">取消</button><button class="lzjm-cbtn yes" data-cact="pdelok">删除</button></div></div></div>' : '') +
        '</div></div>';

      this.bind(ph);
      if (prevSetScr >= 0) {
        var sb2 = ph.querySelector('.lzjm-body');
        if (sb2) sb2.scrollTop = Math.min(prevSetScr, sb2.scrollHeight);
      }
      if (this.screen === 'chat') {
        var cb = ph.querySelector('#lzjm-chatbody');
        if (cb) {
          var pn = cb.parentNode;
          pn.scrollTop = prevNearBottom ? pn.scrollHeight : Math.max(0, Math.min(prevScroll, pn.scrollHeight));
        }
        var inp = ph.querySelector('#lzjm-input');
        if (inp) inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); UI.sendText(); }
          // 空输入框按 Backspace 不弹删待发消息——删错别字按多了会误删；要删待发请点其右上角 ×
        });
      }
      // 朋友圈 feed 滚动位置还原
      if (prevFeed > 0) {
        var mfEl = ph.querySelector('.lzjm-mfeed');
        if (mfEl) mfEl.scrollTop = prevFeed;
      }
      // 记住本次 DOM 的 feed 属于哪个屏：下次重绘只在本屏内还原滚动
      this.feedScr = (this.screen === 'moments' || this.screen === 'mprofile') ? this.screen : null;
      // 朋友圈/主页：顶栏随滚动渐白（含滚动位置还原后的初始状态）
      if (this.screen === 'moments' || this.screen === 'mprofile') syncMomentBar(ph);
      // 朋友圈评论输入：回车即发
      var cmtIn = ph.querySelector('#lzjm-cmtin');
      if (cmtIn) cmtIn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var t = cmtIn.value.trim();
          if (t) UI.momentsSendComment(UI.mCmt, t);
        }
      });
      // 通话字幕区：首次渲染滚到底（看最新），重渲染尽量保住原滚动位置
      if (this.call) {
        var cs = ph.querySelector('.lzjm-callsubs');
        if (cs) cs.scrollTop = (prevSubs < 0) ? cs.scrollHeight : Math.min(prevSubs, cs.scrollHeight);
      }
      // 通话：每秒刷时长；通话输入框回车即发
      if (this._ct) { clearInterval(this._ct); this._ct = null; }
      if (this.call && this.call.phase === 'active') {
        this._ct = setInterval(function () {
          var c = UI.call;
          var el = pdoc().getElementById('lzjm-callstatus');
          if (!c || !el) return;
          el.textContent = fmtDur(Math.max(0, Math.round((Date.now() - c.startAt) / 1000)));
        }, 1000);
      }
    },

    bind: function (ph) {
      ph.querySelectorAll('[data-app="wechat"]').forEach(function (el) {
        el.onclick = function () { UI.screen = 'list'; UI.render(); };
      });
      // 主屏「关闭」app：收起手机。保险——小屏上弹窗可能盖住酒馆页的 QR 开关，
      // 万一被挡死，手机上永远有第二条路可以关掉自己
      ph.querySelectorAll('[data-app="close"]').forEach(function (el) {
        el.onclick = function () { UI.toggle(); };
      });

      // 设置 app：模式单选 / 数值与文本即时保存 / 拉取模型与预设列表 / 点选回填
      ph.querySelectorAll('[data-app="settings"]').forEach(function (el) {
        el.onclick = function () { UI.screen = 'settings'; UI._setpick = null; UI.render(); };
      });
      if (UI.screen === 'settings') {
        var saveApi = function (patch) {
          var api0 = {};
          try { api0 = window.LZJM.Store.settings().api || {}; } catch (e) {}
          for (var k in patch) api0[k] = patch[k];
          window.LZJM.Store.setSettings({ api: api0 });
        };
        ph.querySelectorAll('[data-amode]').forEach(function (el) {
          el.onclick = function () {
            saveApi({ mode: el.dataset.amode });
            UI._setpick = null;
            UI.render();
          };
        });
        ph.querySelectorAll('[data-num]').forEach(function (el) {
          el.onchange = function () {
            var lo = +el.dataset.min, hi = +el.dataset.max;
            var v = Math.round(Number(el.value));
            if (!isFinite(v)) v = window.LZJM.Store.DEFAULTS[el.dataset.num];
            el.value = Math.min(hi, Math.max(lo, v));
            var patch = {}; patch[el.dataset.num] = +el.value;
            window.LZJM.Store.setSettings(patch);
          };
        });
        ph.querySelectorAll('[data-atext]').forEach(function (el) {
          el.onchange = function () { var patch = {}; patch[el.dataset.atext] = el.value; saveApi(patch); };
        });
        ph.querySelectorAll('[data-akey]').forEach(function (el) {
          el.onchange = function () {
            try { localStorage.setItem('lzjm_phone_apikey', el.value); } catch (e) {}
          };
        });
        ph.querySelectorAll('[data-afetch]').forEach(function (el) {
          el.onclick = async function () {
            try {
              if (el.dataset.afetch === 'savepreset') {
                var nmEl = ph.querySelector('[data-apname]');
                var nm = ((nmEl && nmEl.value) || '').trim();
                if (!nm) {
                  UI._setpick = { field: null, items: ['（先输入预设名再保存）'] };
                } else {
                  var read = function (sel) { var x = ph.querySelector(sel); return x ? x.value.trim() : ''; };
                  var preset = { source: read('[data-atext="source"]') || 'openai', apiurl: read('[data-atext="apiurl"]'), cmodel: read('[data-atext="cmodel"]') };
                  var api1 = {};
                  try { api1 = window.LZJM.Store.settings().api || {}; } catch (e) {}
                  var presets0 = api1.presets || {};
                  presets0[nm] = preset;
                  saveApi({ presets: presets0, source: preset.source, apiurl: preset.apiurl, cmodel: preset.cmodel });
                  var kyEl = ph.querySelector('[data-akey]');
                  try { localStorage.setItem('lzjm_phone_apikey::' + nm, kyEl ? kyEl.value : ''); } catch (e) {}
                  UI._setpick = null;
                }
              } else {
                var api2 = {};
                try { api2 = window.LZJM.Store.settings().api || {}; } catch (e) {}
                var key1 = '';
                try { key1 = localStorage.getItem('lzjm_phone_apikey') || ''; } catch (e) {}
                var list = await getModelList({ apiurl: api2.apiurl || '', key: key1 });
                UI._setpick = { field: api2.mode === 'custom' ? 'cmodel' : 'model', items: list || [] };
              }
            } catch (e) {
              UI._setpick = { field: null, items: ['（操作失败：' + String(e && e.message || e) + '）'] };
            }
            UI.render();
          };
        });
        ph.querySelectorAll('[data-pick]').forEach(function (el) {
          el.onclick = function () {
            var patch = {};
            patch[(UI._setpick && UI._setpick.field) || 'model'] = el.dataset.pick;
            saveApi(patch);
            UI._setpick = null;
            UI.render();
          };
        });
        ph.querySelectorAll('[data-aapply]').forEach(function (el) {
          el.onclick = function () {
            var nm = el.dataset.aapply;
            var p = {};
            try { p = ((window.LZJM.Store.settings().api || {}).presets || {})[nm] || {}; } catch (e) {}
            saveApi({ source: p.source || 'openai', apiurl: p.apiurl || '', cmodel: p.cmodel || '' });
            var ky = '';
            try { ky = localStorage.getItem('lzjm_phone_apikey::' + nm) || ''; } catch (e) {}
            try { localStorage.setItem('lzjm_phone_apikey', ky); } catch (e) {}
            UI.render();
          };
        });
        ph.querySelectorAll('[data-apdel]').forEach(function (el) {
          el.onclick = function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            UI.pConfirmDel = el.dataset.apdel;
            UI.render();
          };
        });
      }
      ph.querySelectorAll('.lzjm-back').forEach(function (el) {
        el.onclick = function () {
          // mprofile 的返回看来源：详细资料进来回详细资料，朋友圈进来回朋友圈
          var act = el.dataset.act === 'mback' ? (UI.mFrom === 'cdetail' ? 'cdetail' : 'moments') : el.dataset.act;
          UI.screen = act === 'home' ? 'home' : act === 'moments' ? 'moments' : act === 'cdetail' ? 'cdetail' : 'list';
          UI.panel = null;
          UI.render();
        };
      });
      // 微信底栏 tab：微信 | 发现
      ph.querySelectorAll('[data-tab]').forEach(function (el) {
        el.onclick = function () { UI.tab = el.dataset.tab; UI.render(); };
      });
      // 发现页：朋友圈入口
      ph.querySelectorAll('[data-mom]').forEach(function (el) {
        el.onclick = function () { UI.openMoments(); };
      });
      // 朋友圈：相机打开发布器、头像/名字进主页、⋯菜单、赞、评论、发送
      ph.querySelectorAll('[data-mcam]').forEach(function (el) {
        el.onclick = function () { UI.screen = 'mpost'; UI.mFrom = 'moments'; UI.render(); };
      });
      ph.querySelectorAll('[data-mpost-send]').forEach(function (el) {
        el.onclick = function () {
          var ta = pdoc().getElementById('lzjm-mptext');
          var t = ta ? ta.value.trim() : '';
          if (!t) { try { toastr.info('写点什么再发表吧', '霖州手机'); } catch (e) {} return; }
          var im = pdoc().getElementById('lzjm-mpimg');
          var img = im ? im.value.trim().slice(0, 60) : '';
          var W = window.LZJM, eng = W.Engine;
          var idx = eng.momentsPost(t, img);
          if (idx < 0) return;
          UI.screen = 'moments';
          UI.render();
          // 朋友们的反应后台生成：落地时人在朋友圈就直接重渲染，不在就挂发现页红点
          eng.momentsReact(idx);
        };
      });
      ph.querySelectorAll('[data-mpf]').forEach(function (el) {
        el.onclick = function (ev) {
          ev.stopPropagation();
          UI.mProfile = el.dataset.mpf;
          UI.mFrom = el.dataset.mfrom || 'moments';
          UI.mMenu = -1;
          UI.mCmt = -1;
          UI.screen = 'mprofile';
          UI.render();
        };
      });
      // 通讯录：联系人行 → 详细资料；详细资料页：发消息 / 语音·视频通话
      ph.querySelectorAll('[data-cdet]').forEach(function (el) {
        el.onclick = function () {
          UI.cdetName = el.dataset.cdet;
          UI.screen = 'cdetail';
          UI.panel = null;
          UI.render();
        };
      });
      ph.querySelectorAll('[data-cmsg]').forEach(function (el) {
        el.onclick = function () { UI.openChat(el.dataset.cmsg, false); };
      });
      ph.querySelectorAll('[data-ccall]').forEach(function (el) {
        el.onclick = function () {
          var p = el.dataset.ccall.split(':');
          if (p.length !== 2) return;
          UI.chatKey = p[0];
          UI.isGroup = false;
          UI.panel = null;
          UI.dial(p[1]);
        };
      });
      ph.querySelectorAll('[data-mmenu]').forEach(function (el) {
        el.onclick = function (ev) {
          ev.stopPropagation();
          var i = parseInt(el.dataset.mmenu, 10);
          UI.mMenu = UI.mMenu === i ? -1 : i;
          UI.mCmt = -1;
          UI.render();
          // 点菜单外任意处收起（当前这次点击不生效，所以延迟挂监听）
          // 注意必须挂在 pdoc()（父页文档）——手机 UI 注入在父页，挂在沙箱自己的
          // document 上永远收不到点击，「点空白收起」会表现为完全失灵
          if (UI.mMenu !== -1) {
            setTimeout(function () {
              var doc = pdoc();
              doc.addEventListener('click', function onDocTap(ev2) {
                if (ev2.target.closest && (ev2.target.closest('.lzjm-pmenu') || ev2.target.closest('[data-mmenu]'))) return;
                doc.removeEventListener('click', onDocTap);
                UI.mMenu = -1;
                UI.mCmt = -1;
                if (UI.screen === 'moments' || UI.screen === 'mprofile') UI.render();
              });
            }, 0);
          }
        };
      });
      ph.querySelectorAll('[data-mlike]').forEach(function (el) {
        el.onclick = function () { UI.momentsLike(parseInt(el.dataset.mlike, 10)); };
      });
      ph.querySelectorAll('[data-mcmt]').forEach(function (el) {
        el.onclick = function () {
          UI.mMenu = -1;
          UI.mCmt = parseInt(el.dataset.mcmt, 10);
          UI.render();
          var ci = ph.querySelector('#lzjm-cmtin');
          if (ci) ci.focus();
        };
      });
      ph.querySelectorAll('[data-mdel]').forEach(function (el) {
        el.onclick = function () {
          UI.mMenu = -1;
          UI.mConfirmDel = parseInt(el.dataset.mdel, 10);
          UI.render();
        };
      });
      ph.querySelectorAll('[data-msend]').forEach(function (el) {
        el.onclick = function () {
          var ci = ph.querySelector('#lzjm-cmtin');
          var t = ci ? ci.value.trim() : '';
          if (!t) return;
          UI.momentsSendComment(parseInt(el.dataset.msend, 10), t);
        };
      });
      ph.querySelectorAll('.lzjm-conv:not(.lzjm-linerow):not([data-cdet])').forEach(function (el) {
        el.onclick = function () { UI.openChat(el.dataset.key, el.dataset.group === '1'); };
      });
      ph.querySelectorAll('[data-act="send"]').forEach(function (el) { el.onclick = function () { UI.trySend(); }; });
      ph.querySelectorAll('[data-act="reroll"]').forEach(function (el) { el.onclick = function () { UI.reroll(); }; });
      // 待发区：点红 ✕ 删一条
      // 右键（PC）或长按 550ms（触屏）→ 弹确认窗，防止误删。
      // 聊天记录行走 data-del，通话字幕走 data-cdel，同一套交互。
      ph.oncontextmenu = function (e) {
        var t = e.target && e.target.closest ? e.target : null;
        var sub = t ? t.closest('[data-cdel]') : null;
        if (sub) {
          e.preventDefault();
          UI.callDel = parseInt(sub.getAttribute('data-cdel'), 10);
          UI.render();
          return;
        }
        var row = t ? t.closest('[data-del]') : null;
        if (!row) return;
        e.preventDefault();
        UI.confirmDel = parseInt(row.getAttribute('data-del'), 10);
        UI.render();
      };
      var lpTimer = null;
      ph.ontouchstart = function (e) {
        var t = e.target && e.target.closest ? e.target : null;
        var sub = t ? t.closest('[data-cdel]') : null;
        var row = t ? t.closest('[data-del]') : null;
        var hit = sub || row;
        lpTimer = hit ? setTimeout(function () {
          if (sub) UI.callDel = parseInt(sub.getAttribute('data-cdel'), 10);
          else UI.confirmDel = parseInt(row.getAttribute('data-del'), 10);
          UI.render();
        }, 550) : null;
      };
      ph.ontouchend = function () { clearTimeout(lpTimer); };
      ph.ontouchmove = function () { clearTimeout(lpTimer); };
      ph.querySelectorAll('[data-voice]').forEach(function (el) {
        el.onclick = function () { el.classList.toggle('open'); };
      });
      ph.querySelectorAll('[data-poke]').forEach(function (el) {
        el.onclick = function () {
          ph.classList.remove('shake');
          void ph.offsetWidth; // 重启动画
          ph.classList.add('shake');
          // 动画结束务必卸类：class 留着的话，下次开屏（display 切换）会重放抖动
          setTimeout(function () { ph.classList.remove('shake'); }, 550);
        };
      });
      // 顶部拖动挪位置
      ph.querySelectorAll('.lzjm-sbar').forEach(function (hd) {
        hd.addEventListener('pointerdown', function (ev) {
          if (ev.button !== undefined && ev.button !== 0) return;
          var sx = ev.clientX, sy = ev.clientY;
          var stL = parseFloat(ph.style.left) || 0, stT = parseFloat(ph.style.top) || 0;
          var moved = false;
          var mv = function (e2) {
            var dx = e2.clientX - sx, dy = e2.clientY - sy;
            if (!moved && dx * dx + dy * dy < 16) return;
            moved = true;
            try { hd.setPointerCapture(ev.pointerId); } catch (e) {}
            var vw2 = pwin().innerWidth, vh2 = pwin().innerHeight;
            var L = Math.max(4, Math.min(stL + dx, vw2 - ph.offsetWidth - 4));
            var T = Math.max(4, Math.min(stT + dy, vh2 - ph.offsetHeight - 4));
            ph.style.left = L + 'px';
            ph.style.top = T + 'px';
            savedPos = { left: L, top: T };
          };
          var up = function () {
            hd.removeEventListener('pointermove', mv);
            hd.removeEventListener('pointerup', up);
            hd.removeEventListener('pointercancel', up);
            if (moved) {
              var kill = function (ce) { ce.stopPropagation(); ce.preventDefault(); pdoc().removeEventListener('click', kill, true); };
              pdoc().addEventListener('click', kill, true);
            }
          };
          hd.addEventListener('pointermove', mv);
          hd.addEventListener('pointerup', up);
          hd.addEventListener('pointercancel', up);
        });
      });
      ph.querySelectorAll('[data-peek]').forEach(function (el) {
        el.onclick = function () {
          UI.togglePeek(parseInt(el.getAttribute('data-peek'), 10));
        };
      });
      ph.querySelectorAll('[data-sdel]').forEach(function (el) {
        el.onclick = function (ev) {
          ev.stopPropagation();
          UI.staged.splice(parseInt(el.dataset.sdel, 10), 1);
          UI.render();
          var i2 = ph.querySelector('#lzjm-input'); if (i2) i2.focus();
        };
      });
      ph.querySelectorAll('[data-act="plus"]').forEach(function (el) {
        el.onclick = function () {
          UI.panel = UI.panel ? null : 'actions';
          UI.render();
          var inp = ph.querySelector('#lzjm-input');
          if (inp && UI.panel) inp.focus();
        };
      });
      // [+] 面板内的动作
      ph.querySelectorAll('[data-mode]').forEach(function (el) {
        el.onclick = function () {
          var mode = el.dataset.mode;
          if (mode === 'poke') { UI.stageTyped('poke', ''); return; } // 戳一戳也先攒着，随小飞机一起发
          if (mode === 'transfer') { // 群聊先选接收方；私聊直接表单（收款人=对方）
            UI.panel = (UI.isGroup && !UI.tTarget) ? 'transferto' : 'transfer';
            UI.render();
            return;
          }
          UI.panel = mode; // sticker | image | voice | location
          UI.render();
        };
      });
      ph.querySelectorAll('[data-ttarget]').forEach(function (el) {
        el.onclick = function () { UI.tTarget = el.dataset.ttarget; UI.panel = 'transfer'; UI.render(); };
      });
      ph.querySelectorAll('[data-tsend]').forEach(function (el) {
        el.onclick = function () {
          var amtIn = ph.querySelector('#lzjm-tamt');
          var raw = amtIn ? amtIn.value.trim().replace(/[¥￥\s元]/g, '') : '';
          var amount = Number(raw);
          if (!raw || isNaN(amount) || amount <= 0 || amount > 99999) {
            try { toastr.error('金额要是 1~99999 的数字', '霖州手机'); } catch (e) {}
            return;
          }
          var noteIn = ph.querySelector('#lzjm-tnote');
          var note = noteIn ? noteIn.value.trim().slice(0, 30) : '';
          var to = UI.isGroup ? UI.tTarget : UI.chatKey;
          if (!to) { UI.panel = 'transferto'; UI.render(); return; }
          UI.stageTransfer(Math.round(amount * 100) / 100, note, to);
        };
      });
      ph.querySelectorAll('[data-taccept]').forEach(function (el) {
        el.onclick = function () {
          var row = el.closest('.lzjm-chatrow');
          if (!row) return;
          UI.tConfirm = parseInt(row.dataset.del, 10);
          UI.render();
        };
      });
      ph.querySelectorAll('[data-stick]').forEach(function (el) {
        el.onclick = function () { UI.stageTyped('sticker', el.dataset.stick); }; // 表情也攒着
      });
      ph.querySelectorAll('[data-act="modecancel"]').forEach(function (el) {
        el.onclick = function () { UI.panel = null; UI.render(); };
      });
      ph.querySelectorAll('[data-modesend]').forEach(function (el) {
        el.onclick = function () {
          var kind = el.dataset.modesend;
          var inp = ph.querySelector('#lzjm-modeinput');
          var t = inp ? inp.value.trim() : '';
          if (!t) return;
          UI.stageTyped(kind, t);
        };
      });
      // 通话：拨打入口 + 通话屏按钮组
      ph.querySelectorAll('[data-act="dial"]').forEach(function (el) {
        el.onclick = function () { UI.dial(el.dataset.dial); };
      });
      // [data-cact] 统一分发：聊天删除确认（cancel/del）+ 通话屏按钮组
      ph.querySelectorAll('[data-cact]').forEach(function (el) {
        el.onclick = function () {
          var a = el.dataset.cact;
          if (a === 'cancel') { UI.confirmDel = -1; UI.render(); }
          else if (a === 'del') { UI.removeAt(UI.confirmDel); UI.confirmDel = -1; UI.render(); }
          else if (a === 'mdelno') { UI.mConfirmDel = -1; UI.render(); }
          else if (a === 'mdelok') { var mdi = UI.mConfirmDel; UI.mConfirmDel = -1; UI.momentsDeleteAt(mdi); }
          else if (a === 'tswap') { UI.panel = 'transferto'; UI.render(); }
          else if (a === 'taccno') { UI.tConfirm = -1; UI.render(); }
          else if (a === 'pdelno') { UI.pConfirmDel = ''; UI.render(); }
          else if (a === 'pdelok') {
            var pn2 = UI.pConfirmDel; UI.pConfirmDel = '';
            var apiX = {};
            try { apiX = window.LZJM.Store.settings().api || {}; } catch (e) {}
            apiX.presets = apiX.presets || {};
            delete apiX.presets[pn2];
            window.LZJM.Store.setSettings({ api: apiX });
            try { localStorage.removeItem('lzjm_phone_apikey::' + pn2); } catch (e) {}
            UI.render();
          }
          else if (a === 'taccok') { var ti = UI.tConfirm; UI.tConfirm = -1; UI.stageTVerdict('taccept', ti); }
          else if (a === 'tdecl') { var td = UI.tConfirm; UI.tConfirm = -1; UI.stageTVerdict('tdecline', td); }
          else if (a === 'hangup') UI.hangup(false);
          else if (a === 'cancelcall') UI.hangup(true);
          else if (a === 'callreroll') UI.callReroll();
          else if (a === 'micpop') { UI.callPop = true; UI.render(); }
          else if (a === 'popok') {
            var ta = ph.querySelector('#lzjm-calltext');
            var t = ta ? ta.value.trim() : '';
            UI.callPop = false;
            UI.render();
            if (t) UI.callSend(t);
          }
          else if (a === 'popcancel') { UI.callPop = false; UI.render(); }
          else if (a === 'delok') {
            if (UI.callDel != null) { try { window.LZJM.Store.removeAt(window.LZJM.Engine.callKey(UI.call.name), UI.callDel); } catch (e) {} }
            UI.callDel = null; UI.render();
          }
          else if (a === 'delno') { UI.callDel = null; UI.render(); }
        };
      });
      // 通话字幕删除：由上方 contextmenu / 长按统一处理（data-cdel 仅作下标载体）
    },

    // 回车：攒一条进待发区（[+] 二级模式的输入除外，那仍是即发）
    sendText: function () {
      var inp = pdoc().getElementById('lzjm-input') || pdoc().getElementById('lzjm-modeinput');
      if (!inp) return;
      var t = inp.value.trim();
      if (this.panel === 'image' || this.panel === 'voice' || this.panel === 'location') {
        if (t) this.sendTyped(this.panel, t);
        return;
      }
      inp.value = '';
      this.stageText(t);
    },

    stageText: function (t) {
      if (!t) return;
      this.staged.push({ kind: 'text', text: t });
      this.render();
      var inp = pdoc().getElementById('lzjm-input');
      if (inp) inp.focus();
    },

    // 所有类型的消息都先攒进待发区，小飞机一起发
    stageTyped: function (kind, text) {
      this.staged.push({ kind: kind, text: text });
      this.panel = null;
      this.render();
      var inp = pdoc().getElementById('lzjm-input');
      if (inp) inp.focus();
    },
    // 转账字段多（金额/备注/接收方），不走 stageTyped，但同样先进待发区随小飞机一起发
    stageTransfer: function (amount, note, to) {
      this.staged.push({ kind: 'transfer', amount: amount, note: note, to: to });
      this.panel = null;
      this.tTarget = ''; // 发完就忘，下次群聊转账重新选人，防手滑转错人
      this.render();
      var inp = pdoc().getElementById('lzjm-input');
      if (inp) inp.focus();
    },
    // 对对方待收款转账的处置（收下/退还）：攒进发灾区，小飞机发出即翻卡（发出即生效，不等 AI 回复）
    stageTVerdict: function (kind, idx) {
      var W = window.LZJM, m = null;
      try { m = W.Store.history(this.chatKey)[idx]; } catch (e) {}
      if (!m || m.who === 'user' || m.kind !== 'transfer' || m.state !== 'waiting') { this.render(); return; }
      this.staged.push({ kind: kind, amount: m.amount, note: m.note, from: m.who });
      this.render();
      var inp = pdoc().getElementById('lzjm-input');
      if (inp) inp.focus();
    },

    // 小飞机：输入框有字先攒上，然后把待发区一次性全发（AI 只生成一次、只写一楼）
    trySend: function () {
      if (this.panel === 'image' || this.panel === 'voice' || this.panel === 'location') { this.sendText(); return; }
      var inp = pdoc().getElementById('lzjm-input');
      var t = inp ? inp.value.trim() : '';
      if (t) { inp.value = ''; this.staged.push({ kind: 'text', text: t }); }
      if (!this.staged.length) {
        // 没有待发内容时，小飞机充当「重试」：末尾是我方消息且对方没下文（上次失败/回复被删/解析零条），就再生成一次
        var W0 = window.LZJM;
        var h0 = W0.Store.history(this.chatKey);
        if (!this.busy && h0.length && h0[h0.length - 1].who === 'user') {
          this.failed = false;
          this.generate(W0.Engine.userName());
        }
        return;
      }
      this.sendBatch();
    },

    sendBatch: function () {
      if (!this.staged.length || this.busy) return;
      var W = window.LZJM;
      var msgs = this.staged.map(function (m) {
        if (m.kind === 'transfer') {
          return { who: 'user', kind: 'transfer', amount: m.amount, note: m.note, to: m.to, state: 'waiting', time: W.Status.nowText() };
        }
        if (m.kind === 'taccept' || m.kind === 'tdecline') {
          return { who: 'user', kind: m.kind, amount: m.amount, note: m.note, from: m.from, time: W.Status.nowText() };
        }
        return { who: 'user', kind: m.kind, text: m.text, time: W.Status.nowText() };
      });
      this.staged = [];
      this.failed = false;
      W.Store.push(this.chatKey, msgs, 100);
      // 机主的转账处置（收下/退还）发出即生效：同帧翻掉对应待收款卡（双方的卡同源同一条记录）
      var keyNow = this.chatKey;
      msgs.forEach(function (mm) {
        if (mm.kind === 'taccept' || mm.kind === 'tdecline') {
          try { W.Engine.verdictTransfer(keyNow, mm.kind === 'taccept' ? 'accepted' : 'declined', mm.from, mm.amount, mm.note); } catch (e) {}
        }
      });
      this.render();
      this.generate(W.Engine.userName());
    },

    sendTyped: function (kind, text) {
      var W = window.LZJM;
      var userName = W.Engine.userName();
      var msg = { who: 'user', kind: kind, text: text, time: W.Status.nowText() };
      this.failed = false;
      W.Store.push(this.chatKey, [msg], 100);
      this.panel = null;
      this.render();
      this.generate(userName);
    },

    // 重roll 条件：当前会话最后一条是对方消息。
    // 注意不查 busy——生成结束渲染时 busy 尚未复位，查了就会导致按钮迟到一轮
    canReroll: function () {
      var h = window.LZJM.Store.history(this.chatKey);
      return !!(h.length && h[h.length - 1].who !== 'user');
    },

    removeAt: function (idx) {
      if (this.busy) return;
      var W = window.LZJM;
      var h = W.Store.history(this.chatKey);
      var m = h[idx];
      if (!m) return;
      if (W.Store.removeAt(this.chatKey, idx)) {
        this.render();
        // 联动归位主聊天里的记录楼层（正文上下文同步清掉）
        try { W.Floor.deleteFloorsFor(this.chatKey, [m]); } catch (e) {}
      }
    },

    togglePeek: function (idx) {
      var k = this.chatKey + ':' + idx;
      this.peek[k] = !this.peek[k];
      this.render();
    },

    // 重试条件：末尾是我方消息（发出后对方没下文——上次生成失败、回复被机主删了、或回复解析成 0 条都算）。
    // 小飞机空发与 ↻ 刷新图标共用此门
    canRetry: function () {
      var h = window.LZJM.Store.history(this.chatKey);
      return !!(h.length && h[h.length - 1].who === 'user');
    },

    // ↻ 双模式：末尾是对方消息 → 弹出重roll；末尾是我方消息且上次失败 → 直接重试
    reroll: async function () {
      var W = window.LZJM;
      if (this.busy) return;
      if (this.canRetry()) {
        this.failed = false;
        try { toastr.info('重试中……', '📱 霖州引擎'); } catch (e) {}
        this.render();
        await this.generate(W.Engine.userName());
        return;
      }
      if (!this.canReroll()) return;
      var h = W.Store.history(this.chatKey);
      var n = 0;
      for (var i = h.length - 1; i >= 0 && h[i].who !== 'user' && n < 12; i--) n++;
      var popped = W.Store.popLast(this.chatKey, n);
      if (!popped.length) { this.render(); return; }
      try { toastr.info('重roll中……', '📱 霖州引擎'); } catch (e) {}
      this.render();
      // 旧楼层里的这段台词同步归位（重roll=换一段，旧的别留在正文上下文）
      try { W.Floor.deleteFloorsFor(this.chatKey, popped); } catch (e2) {}
      await this.generate(W.Engine.userName());
    },

    // 独立生成 → 存历史（正文不写楼层，手机记录自包含）
    generate: async function (userName) {
      if (this.busy) return;
      this.busy = true;
      var W = window.LZJM;
      var eng = W.Engine;
      // 生成是异步的，期间用户可能已切到别的会话——key 必须先抓快照，
      // 否则回复会落进当前打开的会话（角色串聊）
      var key = this.chatKey;
      var grp = this.isGroup;
      try {
        var result = await withTimeout(eng.generateFor(key, grp), 90000);
        this.failed = false;
        if (result && result.msgs && result.msgs.length) {
          W.Store.push(key, result.msgs, 100);
          // 转账处置两连（顺序敏感）：先落 NPC 的 [拒收转账] 契约（显式拒绝优先），
          // 再按「对方回了话 = 收了钱」把机主发出的待收款批量翻「已收款」，同帧渲染
          try { eng.applyNpcDeclines(key); } catch (e) {}
          try { eng.markTransfersAccepted(key); } catch (e) {}
          // 生成是异步的：发出后生成了回复、人已经切去别的会话/主页 → 记未读红点
          if (this.screen !== 'chat' || this.chatKey !== key) W.Store.bumpUnread(key, result.msgs.length);
          // 正在看别的会话时不刷它的屏；列表/主页则刷新让预览跟上
          if (this.screen !== 'chat' || this.chatKey === key) this.render();
        }
      } catch (e) {
        // API 故障有两类：直接报错、或永远挂起（由 withTimeout 兜底）。两种都要能重试。
        this.failed = true;
        console.warn('[霖州引擎] 生成失败', e);
        try { toastr.error('手机消息生成失败：' + (e && e.message || e), '📱 霖州引擎'); } catch (e2) {}
        if (this.screen === 'chat') this.render();
      } finally {
        this.busy = false;
      }
    },

    // ── 语音/视频通话 ──
    // 拨打：呼叫页等一次「邀请生成」——AI 以 [拒绝] 开头 = 拒接（理由落聊天记录，
    // 回聊天页）；否则开场白进 transcript 直接接通。通话中锁屏，仅挂断可退。
    dial: async function (mode) {
      if (this.busy || this.call) return;
      if (this.isGroup || !this.chatKey) return;
      var W = window.LZJM, eng = W.Engine;
      var name = this.chatKey;
      this.panel = null;
      this.callMute = false; this.callSpkr = false;
      this.call = { name: name, mode: mode, phase: 'ringing', startAt: Date.now(), busy: false, by: 'user' };
      this.render();
      try {
        var text = await withTimeout(eng.callInvite(name, mode), 90000);
        text = String(text || '').trim();
        if (!text) throw new Error('对方没有响应，请稍后再拨');
        if (!this.call || this.call.name !== name) return; // 等待中被取消
        if (/^\[拒绝\]/.test(text)) {
          var reason = text.replace(/^\[拒绝\]\s*/, '').trim();
          var kindCn1 = mode === 'video' ? '视频通话' : '语音通话';
          var back = [];
          if (reason) back.push({ who: name, kind: 'text', text: reason });
          // 通话记录灰泡由发起方生成：被拒 = 「对方已拒绝」+ 听筒朝下图标
          back.push({ who: 'user', kind: 'calllog', mode: mode, text: '对方已拒绝' });
          W.Store.push(name, back, 100);
          try { W.Store.setMeta(name, { headline: kindCn1 + ' · 未接', atMainCount: eng.mainCount() }); } catch (e) {}
          this.call = null; this.render();
          return;
        }
        // 接听：剥掉 [接听] 标记（兼容笨 AI 的「接听：」写法），正文按保序流进通话记录
        // （视频 = [画面] 行与台词行交织；splitCallOutput 兼容旧式 --- 块）
        text = text.replace(/^\[接听\]\s*/, '').replace(/^接听[：:]\s*/, '').trim();
        var entries = [];
        if (mode === 'video') {
          eng.splitCallOutput(text).slice(0, 12).forEach(function (en) {
            entries.push({ who: name, kind: en.kind === 'scene' ? 'scene' : 'text', text: en.text });
          });
        } else {
          text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 8)
            .forEach(function (l) { entries.push({ who: name, kind: 'text', text: l }); });
        }
        if (entries.length) W.Store.push(eng.callKey(name), entries, 200);
        this.call.phase = 'active';
        this.call.startAt = Date.now();
        this.render();
      } catch (e) {
        this.call = null; this.render();
        try { toastr.error('拨打失败：' + (e && e.message || e), '📱 霖州引擎'); } catch (e2) {}
      }
    },

    // 通话轮：机主说了一段（可换行，拆成多条）→ 对方回台词（多行）
    callSend: async function (text) {
      var W = window.LZJM, eng = W.Engine;
      var call = this.call;
      if (!call || call.phase !== 'active' || call.busy) return;
      var lines = String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 10);
      if (!lines.length) return;
      var key = eng.callKey(call.name);
      W.Store.push(key, lines.map(function (l) { return { who: 'user', kind: 'text', text: l }; }), 200);
      call.busy = true;
      this.render();
      try {
        var ret = await withTimeout(eng.callTurn(call.name, call.mode, text), 90000);
        var entries = [];
        (ret.entries || []).forEach(function (en) {
          entries.push({ who: call.name, kind: en.kind === 'scene' ? 'scene' : 'text', text: en.text });
        });
        if (entries.length) W.Store.push(key, entries, 200);
      } catch (e) {
        try { toastr.error('对方信号不好，再试一次', '📱 霖州引擎'); } catch (e2) {}
      }
      if (this.call === call) { call.busy = false; this.render(); }
    },

    // 重说：弹掉对方最近一段台词，原地重生（带着机主最后一句的语境）
    callReroll: async function () {
      var W = window.LZJM, eng = W.Engine;
      var call = this.call;
      if (!call || call.phase !== 'active' || call.busy) return;
      var key = eng.callKey(call.name);
      var h = W.Store.history(key);
      var n = 0;
      for (var i = h.length - 1; i >= 0 && h[i].who !== 'user' && h[i].who !== 'sys' && n < 10; i--) n++;
      if (!n) return;
      W.Store.popLast(key, n);
      call.busy = true;
      this.render();
      try {
        var ret = await withTimeout(eng.callTurn(call.name, call.mode, ''), 90000);
        var entries = [];
        (ret.entries || []).forEach(function (en) {
          entries.push({ who: call.name, kind: en.kind === 'scene' ? 'scene' : 'text', text: en.text });
        });
        if (entries.length) W.Store.push(key, entries, 200);
      } catch (e) {
        try { toastr.error('重说失败，再试一次', '📱 霖州引擎'); } catch (e2) {}
      }
      if (this.call === call) { call.busy = false; this.render(); }
    },

    // 挂断：transcript 末尾写时长；私聊里由发起方留一条通话记录灰泡（微信真实样式：
    // 正常结束 = 通话时长 + 听筒朝下；取消 = 已取消），回聊天页。
    hangup: function (cancelled) {
      var call = this.call; if (!call) return;
      var W = window.LZJM, eng = W.Engine;
      this.call = null;
      if (this._ct) { clearInterval(this._ct); this._ct = null; }
      var who = call.by === 'user' ? 'user' : call.name;
      var kindCn2 = call.mode === 'video' ? '视频通话' : '语音通话';
      if (call.phase === 'active') {
        var sec = Math.max(1, Math.round((Date.now() - call.startAt) / 1000));
        var dur = fmtDur(sec);
        W.Store.push(eng.callKey(call.name), [{ who: 'sys', kind: 'sys', text: '通话结束 · ' + dur }], 200);
        W.Store.push(call.name, [{ who: who, kind: 'calllog', mode: call.mode, text: '通话时长 ' + dur }], 100);
        try { W.Store.setMeta(call.name, { headline: kindCn2 + ' ' + dur, atMainCount: eng.mainCount() }); } catch (e) {}
      } else if (cancelled) {
        W.Store.push(call.name, [{ who: who, kind: 'calllog', mode: call.mode, text: '已取消' }], 100);
      }
      this.screen = 'chat';
      this.chatKey = call.name;
      this.isGroup = false;
      this.render();
    }
  };

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
    var mm = (m < 10 ? '0' : '') + m, s2 = (ss < 10 ? '0' : '') + ss;
    return h ? (h + ':' + mm + ':' + s2) : (mm + ':' + s2);
  }

  // 通话屏：背景（模糊头像+厚遮罩）由 render() 铺在整个屏幕上，这里只排内容。
  // 字幕双人对白都上；底部一左一右：麦克风（点开多行输入弹窗）/ 挂断（电话倒扣）。右上角重说。
  // 右键/长按字幕 = 弹确认窗删除该条通话对白（与聊天记录同一套交互）。
  function callHtml(call, userName) {
    var W = window.LZJM;
    var eng = W.Engine;
    var av;
    try {
      var c = eng.findContact(call.name) || { name: call.name, avatar: '' };
      var imgUrl = c.avatar ? esc(W.Worldbook.imgUrl(c.avatar)) : '';
      av = imgUrl ? '<img src="' + imgUrl + '">' : esc(call.name.slice(0, 1));
    } catch (e) { av = esc(call.name.slice(0, 1)); }
    var hist = W.Store.history(eng.callKey(call.name));
    // PiP 自视窗：优先 persona 头像（同聊天页"我"的气泡头像来源），没有则退名首字
    var pip = '';
    if (call.mode === 'video' && call.phase === 'active') {
      var uav = '';
      try { uav = eng.userAvatar(); } catch (e) {}
      pip = '<div class="lzjm-callpip">' + (uav ? '<img src="' + esc(uav) + '" alt="">' : esc(userName.slice(0, 1))) + '</div>';
    }
    // 视频的画面条目穿插在气泡流中间：说第一句时吃薯片、说第二句时抬头看镜头……
    var subs = hist.map(function (m, i) {
      if (m.who === 'sys') return '';
      if (m.kind === 'scene') return '<div class="lzjm-callscene" data-cdel="' + i + '">' + esc(m.text || '').replace(/\n/g, '<br>') + '</div>';
      var isMe = m.who === 'user';
      return '<div class="lzjm-sub' + (isMe ? ' me' : '') + '" data-cdel="' + i + '">' + esc(m.text || '') + '</div>';
    }).join('');
    var status = call.phase === 'ringing'
      ? '正在呼叫…'
      : (call.busy ? '对方说话中…' : fmtDur(Math.max(0, Math.round((Date.now() - call.startAt) / 1000))));
    var roll = (call.phase === 'active' && !call.busy)
      ? '<span class="lzjm-callroll" data-cact="callreroll" title="重说对方上一段">' + ICON_REROLL + '</span>'
      : '';
    var btns;
    if (call.phase === 'ringing') {
      btns = '<div class="lzjm-callmid" style="justify-content:center"><button class="lzjm-callbtn hang" data-cact="cancelcall"><i>' + ICON_HANG + '</i><span>取消</span></button></div>';
    } else {
      btns = '<div class="lzjm-callmid">' +
        '<button class="lzjm-callbtn" data-cact="micpop"><i>' + ICON_MIC + '</i><span>说话</span></button>' +
        '<button class="lzjm-callbtn hang" data-cact="hangup"><i>' + ICON_HANG + '</i><span>挂断</span></button>' +
        '</div>';
    }
    var conf = (UI.callDel != null)
      ? '<div class="lzjm-scrim"><div class="lzjm-confirm lzjm-calldel">删除这条通话对白？<div class="lzjm-cbtns"><button class="lzjm-cbtn no" data-cact="delno">取消</button><button class="lzjm-cbtn yes" data-cact="delok">删除</button></div></div></div>'
      : '';
    var pop = UI.callPop
      ? '<div class="lzjm-scrim"><div class="lzjm-confirm lzjm-callpop"><textarea class="lzjm-callta" id="lzjm-calltext" rows="4" maxlength="500" placeholder="想说什么…（可换行）"></textarea>' +
        '<div class="lzjm-cbtns"><button class="lzjm-cbtn no" data-cact="popcancel">取消</button><button class="lzjm-cbtn yes" data-cact="popok">发送</button></div></div></div>'
      : '';
    return '<div class="lzjm-callbody">' + roll + pip +
      '<div class="lzjm-calltop"><div class="lzjm-callava">' + av + '</div>' +
      '<div class="lzjm-callname">' + esc(call.name) + '</div>' +
      '<div class="lzjm-callstatus" id="lzjm-callstatus">' + esc(status) + '</div></div>' +
      '<div class="lzjm-callsubs">' + subs + '</div>' +
      (call.phase === 'ringing' ? '<div class="lzjm-cwait">等待对方接听…</div>' : '') +
      conf + btns + '</div>' + pop;
  }

  // 生成超时保护：API 故障时 generateRaw 可能永远不返回，不兜底会让小飞机永远失灵
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve, reject) {
        setTimeout(function () { reject(new Error('生成超时（' + Math.round(ms / 1000) + '秒无响应），请重试')); }, ms);
      })
    ]);
  }

  // 选线列表（新拟态二级菜单）：DLC 大项 → IF 小项 + 空白项。
  // 徽标：本聊天（记录线）/ 当前（引擎实况线）；IF 小项的紫点=该IF当前开启；
  // 当前线且无IF开启时，「空白开场」行呈凹陷高亮。记录和开关不一致时双徽标并存。
  function linesRowsHtml() {
    var W = window.LZJM;
    var eng = W.Engine;
    var saved = W.Store.line();
    var states = eng.entryStates();
    var cur = eng.line();
    var meta = eng.LINE_META || {};
    var ifs = eng.LINE_IFS || {};
    var norm = function (s) { return String(s || '').replace(/[【】\s]/g, ''); };
    // IF 条目开态查表（备注/标题 归一包含匹配；找不到返回 null）
    var ifOn = function (entryName) {
      var want = norm(entryName);
      for (var k in states) {
        if (norm(k) === want || norm(k).indexOf(want) !== -1) return !!states[k];
      }
      return null;
    };
    return eng.LINES.map(function (ln) {
      var m = meta[ln] || {};
      var ros = eng.roster(ln);
      var hasPhone = !!(ros && ((ros.contacts || []).length || (ros.groups || []).length));
      var list = ifs[ln] || [];
      // 该线当前是否有 IF 开着
      var anyIfOn = list.some(function (f) { return ifOn(f.entry) === true; });

      var head = '<div class="lzjm-nm-ghead">' +
        '<span class="lzjm-nm-gicon">' + (hasPhone ? '📱' : '🏮') + '</span>' +
        '<span class="lzjm-nm-gname">' + esc(m.label || ln) + '</span>';
      if (m.sub) head += '<span class="lzjm-nm-gsub">' + esc(m.sub) + '</span>';
      head += '<span class="lzjm-nm-gline"></span>';
      if (saved === ln) head += '<span class="lzjm-nm-gtag">本聊天</span>';
      if (cur === ln) head += '<span class="lzjm-nm-gtag">当前</span>';
      head += '</div>';

      // 无 IF 的线（成人）：组头即整组，单一条目可点
      if (!list.length) {
        return '<div class="lzjm-nm-group" data-line="' + esc(ln) + '">' + head +
          '<div class="lzjm-nm-items">' +
          '<div class="lzjm-nm-item' + (cur === ln ? ' cur' : '') + '" data-line="' + esc(ln) + '" data-if="">' +
          '<span class="lzjm-nm-dot' + (cur === ln ? '' : ' off') + '"></span>' +
          '<span>无IF</span><span class="lzjm-nm-fill"></span>' +
          (cur === ln ? '<span class="lzjm-nm-cur">当前</span>' : '') +
          '</div></div></div>';
      }

      var rows = '<div class="lzjm-nm-item' + (cur === ln && !anyIfOn ? ' cur' : '') + '" data-line="' + esc(ln) + '" data-if="">' +
        '<span class="lzjm-nm-dot' + (cur === ln && !anyIfOn ? '' : ' off') + '"></span>' +
        '<span>无IF</span><span class="lzjm-nm-fill"></span>' +
        (cur === ln && !anyIfOn ? '<span class="lzjm-nm-cur">当前</span>' : '') + '</div>';
      rows += list.map(function (f) {
        var on = cur === ln && ifOn(f.entry) === true;
        var right = on ? '<span class="lzjm-nm-cur">当前</span>'
          : (ifOn(f.entry) === true && cur !== ln ? '<span class="lzjm-nm-gsub">他线开启</span>' : '');
        return '<div class="lzjm-nm-item' + (on ? ' cur' : '') + '" data-line="' + esc(ln) + '" data-if="' + esc(f.entry) + '">' +
          '<span class="lzjm-nm-dot' + (on ? '' : ' off') + '"></span>' +
          '<span class="lzjm-nm-if">IF</span>' +
          '<span>' + esc(f.label) + '</span><span class="lzjm-nm-fill"></span>' + right +
          '</div>';
      }).join('');
      return '<div class="lzjm-nm-group">' + head +
        '<div class="lzjm-nm-items">' + rows + '</div></div>';
    }).join('');
  }

  // 朋友圈顶栏渐白：封面底边滚过顶栏区域的过程中，状态栏+应用栏从透明渐变到白底，
  // 到位时补一条发丝分割线——真实微信同款。滚动到下面时 < / 相机 不再悬空
  function syncMomentBar(ph) {
    var feed = ph.querySelector('.lzjm-mfeed');
    var scr = ph.querySelector('.lzjm-screen');
    if (!feed || !scr) return;
    var sbar = scr.querySelector('.lzjm-sbar');
    var bar = scr.querySelector('.lzjm-appbar-ovl');
    var cover = feed.querySelector('.lzjm-mcover');
    if (!bar || !cover) return;
    var onScroll = function () {
      var p = Math.max(0, Math.min(1, feed.scrollTop / Math.max(1, cover.offsetHeight - 89)));
      var bg = 'rgba(255,255,255,' + (p * 0.97).toFixed(3) + ')';
      if (sbar) sbar.style.background = bg;
      bar.style.background = bg;
      bar.style.borderBottom = p > 0.95 ? '1px solid rgba(0,0,0,.09)' : 'none';
    };
    feed.addEventListener('scroll', onScroll);
    onScroll();
  }

  // 设置屏：生成 API（跟随正文/只换模型/自定义+可存预设）+ 提示词携带量。全部即时保存。
  var SET_NRANGES = { plotFloors: [1, 20], plotCap: [100, 2000], histPriv: [10, 100], histGroup: [10, 100], crossMax: [1, 6], crossLines: [5, 50], injRecent: [1, 30], injMention: [1, 20], injMax: [1, 6], injRounds: [10, 100] };
  function settingsHtml() {
    var W = window.LZJM;
    var cfg = W.Store.cfg();
    var api = {};
    try { api = W.Store.settings().api || {}; } catch (e) {}
    var mode = (api.mode === 'model' || api.mode === 'custom') ? api.mode : 'follow';
    var modes = [
      ['follow', '跟随正文', '手机与正文用同一条 API 线'],
      ['model', '只换模型', '正文同源，手机单独指定模型'],
      ['custom', '自定义 API', '完全独立：选格式、填地址、填密钥；谷歌反代=反代地址+反代密码']
    ];
    var rows = modes.map(function (m) {
      return '<div class="lzjm-setrow' + (mode === m[0] ? ' on' : '') + '" data-amode="' + m[0] + '">' +
        '<div class="lzjm-setmain"><div class="lzjm-setname">' + m[1] + '</div><div class="lzjm-setdesc">' + m[2] + '</div></div>' +
        '<span class="lzjm-setck">' + ICON_TOK + '</span></div>';
    }).join('');
    var detail = '';
    if (mode === 'model') {
      detail = '<div class="lzjm-setcol"><span class="lzjm-setlbl">模型名</span><div class="lzjm-setrow2">' +
        '<input class="lzjm-settxt" data-atext="model" value="' + esc(api.model || '') + '" placeholder="如 gemini-3.1-flash"></div></div>';
    } else if (mode === 'custom') {
      var key = '';
      try { key = localStorage.getItem('lzjm_phone_apikey') || ''; } catch (e) {}
      var srcOpts = [['openai', 'OpenAI 格式（第三方中转）'], ['makersuite', 'Google AI Studio（配反代地址）']];
      var srcSel = srcOpts.map(function (o) {
        return '<option value="' + o[0] + '"' + ((api.source || 'openai') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('');
      detail =
        '<div class="lzjm-setcol"><span class="lzjm-setlbl">API 源（决定请求格式）</span><div class="lzjm-setrow2">' +
        '<select class="lzjm-settxt" data-atext="source">' + srcSel + '</select></div></div>' +
        '<div class="lzjm-setcol"><span class="lzjm-setlbl">API 地址（OpenAI 中转 或 谷歌反代）</span><div class="lzjm-setrow2">' +
        '<input class="lzjm-settxt" data-atext="apiurl" value="' + esc(api.apiurl || '') + '" placeholder="https://…"></div></div>' +
        '<div class="lzjm-setcol"><span class="lzjm-setlbl">密钥 / 反代密码（仅本机保存）</span><div class="lzjm-setrow2">' +
        '<input class="lzjm-settxt" data-akey="1" value="' + esc(key) + '" placeholder="sk-…"></div></div>' +
        '<div class="lzjm-setcol"><span class="lzjm-setlbl">模型（先填地址与密钥）</span><div class="lzjm-setrow2">' +
        '<input class="lzjm-settxt" data-atext="cmodel" value="' + esc(api.cmodel || '') + '" placeholder="模型名">' +
        '<button class="lzjm-setbtn" data-afetch="models">拉取模型</button></div></div>' +
        '<div class="lzjm-setcol"><span class="lzjm-setlbl">预设名（把上面整套存下来）</span><div class="lzjm-setrow2">' +
        '<input class="lzjm-settxt" data-apname="1" placeholder="如：谷歌反代">' +
        '<button class="lzjm-setbtn" data-afetch="savepreset">保存预设</button></div></div>';
      var saved = api.presets || {};
      var savedRows = Object.keys(saved).map(function (nm) {
        var p = saved[nm] || {};
        var srcName = p.source === 'makersuite' ? '谷歌反代' : 'OpenAI';
        return '<div class="lzjm-setrow" data-aapply="' + esc(nm) + '">' +
          '<div class="lzjm-setmain"><div class="lzjm-setname">' + esc(nm) + '</div>' +
          '<div class="lzjm-setdesc">' + srcName + (p.apiurl ? ' · ' + esc(p.apiurl) : '') + (p.cmodel ? ' · ' + esc(p.cmodel) : '') + '</div></div>' +
          '<span class="lzjm-setdel" data-apdel="' + esc(nm) + '">✕</span></div>';
      }).join('');
      if (savedRows) {
        detail += '<div class="lzjm-setcol"><span class="lzjm-setlbl">已存预设（点按即套用；点 ✕ 需确认后删除，密钥随预设各存一份在本机）</span></div>' + savedRows;
      }
    }
    var pick = '';
    if (UI._setpick && UI._setpick.items.length) {
      pick = '<div class="lzjm-setpick">' + UI._setpick.items.map(function (it) {
        return '<span data-pick="' + esc(it) + '">' + esc(it) + '</span>';
      }).join('') + '</div>';
    }
    function numrow(key, name) {
      var r = SET_NRANGES[key];
      return '<div class="lzjm-setrow"><div class="lzjm-setmain"><div class="lzjm-setname">' + name + '</div>' +
        '<div class="lzjm-setdesc">' + r[0] + ' ~ ' + r[1] + '</div></div>' +
        '<input class="lzjm-setnum" data-num="' + key + '" data-min="' + r[0] + '" data-max="' + r[1] + '" value="' + cfg[key] + '" inputmode="numeric"></div>';
    }
    var numsMain = numrow('plotFloors', '带几楼正文') + numrow('plotCap', '每楼最多带多少字');
    var numsHist = numrow('histPriv', '私聊记录带几条') + numrow('histGroup', '群聊记录带几条');
    var numsCross = numrow('crossMax', '顺带带几个相关会话') + numrow('crossLines', '每个相关会话带几条');
    var numsInj = numrow('injRecent', '聊过几楼内就注入') + numrow('injMention', '点名几楼内就注入') +
      numrow('injMax', '一次最多注入几个会话') + numrow('injRounds', '每会话注入最近几条');
    return '<div class="lzjm-body"><div class="lzjm-setwrap">' +
      '<div class="lzjm-setsec">生成 API</div><div class="lzjm-setcard">' + rows + detail + '</div>' + pick +
      '<div class="lzjm-setsec">手机生成 · 主线正文</div><div class="lzjm-setcard">' + numsMain + '</div>' +
      '<div class="lzjm-setsec">手机生成 · 聊天记录</div><div class="lzjm-setcard">' + numsHist + '</div>' +
      '<div class="lzjm-setsec">手机生成 · 跨会话</div><div class="lzjm-setcard">' + numsCross + '</div>' +
      '<div class="lzjm-setsec">正文生成 · 手机注入（正文 AI 对手机的知情度）</div><div class="lzjm-setcard">' + numsInj + '</div>' +
      '<div class="lzjm-setnote">跨会话：生成私聊时，顺带带对方今天在的群的记录；生成群时，顺带带成员今天与机主的私聊，让对方接得上别处的梗。</div>' +
      '<div class="lzjm-setnote">数值改动立即生效；API 改动作用于之后的每次手机生成。携带量与 API 配置（含自定义预设，密钥除外）随聊天变量保存（明文、随卡走）；密钥按预设名各存一份，只留在本机浏览器。</div>' +
      '</div></div>';
  }

  function appbarHtml(screen, disp, act) {
    if (UI.call) return ''; // 通话界面：无顶栏（名字在通话屏里）
    if (screen === 'home') return ''; // 真手机主屏没有标题栏
    if (screen === 'settings') return '<div class="lzjm-appbar"><span class="lzjm-back" data-act="home">' + ICON_BACK + '</span><span class="lzjm-appbar-t">设置</span><span class="lzjm-appbar-r"></span></div>';
    if (screen === 'list') return '<div class="lzjm-appbar"><span class="lzjm-back" data-act="home">' + ICON_BACK + '</span><span class="lzjm-appbar-t">微信</span><span class="lzjm-appbar-r"></span></div>';
    if (screen === 'moments') return '<div class="lzjm-appbar lzjm-appbar-ovl"><span class="lzjm-back" data-act="list">' + ICON_BACK + '</span><span class="lzjm-appbar-t"></span><span class="lzjm-appbar-r"><span class="lzjm-reroll" data-mcam="1" title="相机">' + ICON_CAM + '</span></span></div>';
    if (screen === 'mprofile') return '<div class="lzjm-appbar lzjm-appbar-ovl"><span class="lzjm-back" data-act="mback">' + ICON_BACK + '</span><span class="lzjm-appbar-t"></span><span class="lzjm-appbar-r"></span></div>';
    if (screen === 'mpost') return '<div class="lzjm-appbar"><span class="lzjm-back" data-act="mback">' + ICON_BACK + '</span><span class="lzjm-appbar-t"></span><span class="lzjm-appbar-r lzjm-appbar-rw"><button class="lzjm-postsend" data-mpost-send="1">发表</button></span></div>';
    if (screen === 'cdetail') return '<div class="lzjm-appbar"><span class="lzjm-back" data-act="list">' + ICON_BACK + '</span><span class="lzjm-appbar-t"></span><span class="lzjm-appbar-r"></span></div>';
    return '<div class="lzjm-appbar"><span class="lzjm-back" data-act="list">' + ICON_BACK + '</span><span class="lzjm-appbar-t">' + esc(disp || '') + '</span><span class="lzjm-appbar-r">' +
      (act ? '<span class="lzjm-reroll" data-act="reroll" title="' + (act === 'retry' ? '上一条消息发送失败，点击重新获取回复' : '重新生成对方的上一条回复') + '">' + ICON_REROLL + '</span>' : '') +
      '</span></div>';
  }

  // 朋友圈动态卡片。
  // feedMode=true  动态流：头像(可进主页) + 名字 + 文字 + 配图 + 时间label + ⋯菜单(赞/评论)
  // feedMode=false 个人主页时间轴：不要头像/名字，头像位换成 今天/昨天/M月D日，meta 不再重复时间
  // idx = 动态在 Store 里的下标（点赞/评论按下标回写）
  function momentsPostHtml(e, idx, userName, eng, W, feedMode, curDay) {
    var c = {};
    try { c = eng.findContact(e.who) || {}; } catch (e0) {}
    var isMine = e.who === userName;
    var mpfAttr = isMine ? '' : ' data-mpf="' + esc(e.who) + '"';
    var head;
    if (feedMode) {
      // 机主自己的条目：头像走机主头像，名字/头像都不挂进主页的跳转
      var avaHtml;
      if (isMine) {
        var myAv = '';
        try { myAv = eng.userAvatar(); } catch (e1) {}
        avaHtml = myAv
          ? '<img class="lzjm-post-ava" src="' + esc(myAv) + '" alt="">'
          : '<div class="lzjm-post-ava">' + esc(e.who.slice(0, 1)) + '</div>';
      } else {
        avaHtml = c.avatar
          ? '<img class="lzjm-post-ava" src="' + esc(W.Worldbook.imgUrl(c.avatar)) + '"' + mpfAttr + ' alt="">'
          : '<div class="lzjm-post-ava"' + mpfAttr + '>' + esc(e.who.slice(0, 1)) + '</div>';
      }
      head = avaHtml +
        '<div class="lzjm-post-main"><div class="lzjm-post-name"' + mpfAttr + '>' + esc(e.who) + '</div>';
    } else {
      // 主页时间戳：与 feed 同源自 pt（动态自身时间），两边永远不会再打架
      head = '<div class="lzjm-post-stamp">' + stampParts(e.pt, e.label, curDay) + '</div><div class="lzjm-post-main">';
    }
    var liked = (e.likes || []).indexOf(userName) !== -1;
    var menu = UI.mMenu === idx
      ? '<div class="lzjm-pmenu">' + (isMine ? '' : '<button data-mlike="' + idx + '">' + (liked ? ICON_HEART_F + ' 取消' : ICON_HEART + ' 赞') + '</button>') + '<button data-mcmt="' + idx + '">' + ICON_BUBBLE + ' 评论</button>' + (isMine ? '<button data-mdel="' + idx + '">删除</button>' : '') + '</div>'
      : '';    var cmtbar = UI.mCmt === idx
      ? '<div class="lzjm-cmtbar"><input id="lzjm-cmtin" maxlength="60" placeholder="说点什么…"><button data-msend="' + idx + '">发送</button></div>'
      : '';
    var likeRow = (e.likes && e.likes.length)
      ? '<div class="lzjm-plike">❤ ' + e.likes.map(esc).join('、') + '</div>'
      : '';
    var cmtRows = (e.comments || []).map(function (cm) {
      return '<div><span class="n">' + esc(cm.who) + '</span>' +
        (cm.replyTo ? ' 回复 <span class="n">' + esc(cm.replyTo) + '</span>' : '') +
        '<span class="cs">:</span><span class="c">' + esc(cm.text) + '</span></div>';
    }).join('');
    var cmtBlock = cmtRows ? '<div class="lzjm-pcmts">' + cmtRows + '</div>' : '';
    return '<div class="lzjm-post">' + head +
      '<div class="lzjm-post-text">' + esc(e.text) + '</div>' +
      (e.img ? '<div class="lzjm-post-img">' + esc(e.img) + '</div>' : '') +
      '<div class="lzjm-post-meta">' + (feedMode ? '<span>' + esc(momentLabel(e.pt, e.label, curDay)) + '</span>' : '') + '<span class="sp"></span>' +
      menu +
      '<button class="lzjm-post-more" data-mmenu="' + idx + '">⋯</button></div>' +
      likeRow + cmtBlock + cmtbar +
      '</div></div>';
  }

  // [+] 面板内容
  function panelHtml(panel) {
    if (!panel) return '<div class="lzjm-panel" id="lzjm-panel"></div>';
    if (panel === 'sticker') {
      var stickers = window.LZJM.Engine.stickers();
      var names = Object.keys(stickers);
      var grid = names.length
        ? names.map(function (n) {
            return '<div class="lzjm-stickcell" data-stick="' + esc(n) + '"><div class="imgw">' +
              '<img src="' + esc(window.LZJM.Worldbook.imgUrl(stickers[n])) + '" loading="lazy"></div></div>';
          }).join('')
        : '<div class="lzjm-sysrow">世界书中未找到「霖州蒋默::表情包」条目</div>';
      return '<div class="lzjm-panel lzjm-open" id="lzjm-panel"><div class="lzjm-stickgrid">' + grid + '</div></div>';
    }
    if (panel === 'transferto') {
      // 群聊转账先选接收方（机主自己除外）
      var Wt = window.LZJM, engT = Wt.Engine, secT = engT.section() || {};
      var myNameT = engT.userName();
      var gT = null;
      (secT.groups || []).forEach(function (g) { if ('group:' + g.name === UI.chatKey) gT = g; });
      var cells = ((gT && gT.members) || []).filter(function (n) { return n && n !== myNameT; }).map(function (n) {
        var c = engT.findContact(n) || {};
        var avT = c.avatar
          ? '<img class="lzjm-ava" src="' + esc(Wt.Worldbook.imgUrl(c.avatar)) + '">'
          : '<div class="lzjm-ava">' + esc(n.slice(0, 1)) + '</div>';
        return '<div class="lzjm-conv" data-ttarget="' + esc(n) + '">' + avT + '<div class="lzjm-conv-main"><div class="lzjm-conv-name">' + esc(n) + '</div></div></div>';
      }).join('');
      return '<div class="lzjm-panel lzjm-open lzjm-pto" id="lzjm-panel"><div class="lzjm-ttohd">转账给群里的谁？</div><div class="lzjm-ttolist">' +
        (cells || '<div class="lzjm-sysrow">群成员名单空空如也</div>') + '</div>' +
        '<div class="lzjm-ttofoot"><button class="lzjm-modecancel" data-act="modecancel">取消</button></div></div>';
    }
    if (panel === 'transfer') {
      var toWhom = UI.isGroup ? UI.tTarget : UI.chatKey;
      var swapBtn = UI.isGroup ? '<button class="lzjm-modecancel" data-cact="tswap">更换</button>' : '';
      return '<div class="lzjm-panel lzjm-open" id="lzjm-panel"><div class="lzjm-modeform">' +
        '<div class="lzjm-tto-line">转账给 <b>' + esc(toWhom || '…') + '</b></div>' +
        '<input class="lzjm-modeinput" id="lzjm-tamt" maxlength="8" inputmode="decimal" placeholder="金额，1 ~ 99999">' +
        '<input class="lzjm-modeinput" id="lzjm-tnote" maxlength="30" placeholder="备注（可选），如：奶茶钱">' +
        '<div class="lzjm-modebtns"><button class="lzjm-modeok" data-tsend="1">确定</button>' + swapBtn +
        '<button class="lzjm-modecancel" data-act="modecancel">取消</button></div></div></div>';
    }
    if (panel === 'image' || panel === 'voice' || panel === 'location') {
      var hint = panel === 'image' ? '描述这张图片的画面，如：一张拍糊的试卷' : panel === 'voice' ? '这句语音说了什么，如：到了吱一声' : '地点名称，如：霖州一中北门';
      return '<div class="lzjm-panel lzjm-open" id="lzjm-panel"><div class="lzjm-modeform">' +
        '<textarea class="lzjm-modeinput" id="lzjm-modeinput" rows="2" maxlength="200" placeholder="' + hint + '"></textarea>' +
        '<div class="lzjm-modebtns"><button class="lzjm-modeok" data-modesend="' + panel + '">确定</button>' +
        '<button class="lzjm-modecancel" data-act="modecancel">取消</button></div></div></div>';
    }
    // actions（戳一戳只能私聊用：群里没有指定对象）
    return '<div class="lzjm-panel lzjm-open" id="lzjm-panel"><div class="lzjm-actions">' +
      '<div class="lzjm-act" data-mode="sticker"><div class="lzjm-act-ico">' + ICO.sticker + '</div><span>表情</span></div>' +
      '<div class="lzjm-act" data-mode="image"><div class="lzjm-act-ico">' + ICO.image + '</div><span>图片</span></div>' +
      '<div class="lzjm-act" data-mode="voice"><div class="lzjm-act-ico">' + ICO.voice + '</div><span>语音</span></div>' +
      (UI.isGroup ? '' : '<div class="lzjm-act" data-mode="poke"><div class="lzjm-act-ico">' + ICO.poke + '</div><span>戳一戳</span></div>') +
      '<div class="lzjm-act" data-mode="location"><div class="lzjm-act-ico">' + ICO.location + '</div><span>定位</span></div>' +
      '<div class="lzjm-act" data-mode="transfer"><div class="lzjm-act-ico">' + ICO.transfer + '</div><span>转账</span></div>' +
      (UI.isGroup ? '' :
        '<div class="lzjm-act" data-act="dial" data-dial="audio"><div class="lzjm-act-ico">' + ICON_CALL + '</div><span>语音通话</span></div>' +
        '<div class="lzjm-act" data-act="dial" data-dial="video"><div class="lzjm-act-ico">' + ICON_VCALL + '</div><span>视频通话</span></div>') +
      '</div></div>';
  }

  // 用 visualViewport 计算位置：F12/移动仿真/页面缩放下依然落在可视区右下角
  var savedPos = null; // 拖动过的位置，关闭再唤起仍记得（刷新重置）

  // 选线弹窗定位：按可视视口（visualViewport）矩形落位，小屏/移动端/缩放下
  // 始终跟着玩家实际可见的区域走；flex 负责把卡片居中其中
  function placeLinesPop() {
    var pop = pdoc().getElementById('lzjm-linespop');
    if (!pop) return;
    var vp = pwin().visualViewport;
    var left = vp ? vp.offsetLeft : 0;
    var top = vp ? vp.offsetTop : 0;
    var w2 = vp ? vp.width : pwin().innerWidth;
    var h2 = vp ? vp.height : pwin().innerHeight;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.width = w2 + 'px';
    pop.style.height = h2 + 'px';
    pop.style.right = 'auto';
    pop.style.bottom = 'auto';
  }

  function placePhone() {
    var ph = pdoc().getElementById(ID.phone);
    if (!ph || !ph.classList.contains('lzjm-open')) return;
    var vp = pwin().visualViewport;
    var vw = vp ? vp.width : pwin().innerWidth;
    var vh = vp ? vp.height : pwin().innerHeight;
    var w = Math.max(280, Math.min(348, vw - 16));
    var h = Math.max(420, Math.min(680, vh - 20));
    ph.style.width = w + 'px';
    ph.style.height = h + 'px';
    var left = savedPos ? savedPos.left : (vp ? vp.offsetLeft : 0) + vw - w - 8;
    var top = savedPos ? savedPos.top : (vp ? vp.offsetTop : 0) + vh - h - 8;
    ph.style.left = Math.max(4, Math.min(left, vw - w - 4)) + 'px';
    ph.style.top = Math.max(4, Math.min(top, vh - h - 4)) + 'px';
    ph.style.right = 'auto';
    ph.style.bottom = 'auto';
  }

  window.LZJM = window.LZJM || {};
  window.LZJM.Apps = window.LZJM.Apps || {};
  window.LZJM.Apps.wechat = UI;
})();


// ── src/engine.js ──
// ═══════════════════════════════════════════════════════════
//  engine.js —— 数字世界引擎 · 核心装配
//  职责：读世界书 → 定位世界线 → 装载应用 → 独立生成 → 写楼层
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  var IMG_BASE = 'https://files.catbox.moe/';

  // 注入块的日期相对标签（与手机界面/提示词同一套口径）
  function parseDayE(s) {
    var m = /(\d+)年(\d+)月(\d+)日/.exec(s || '');
    return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
  }
  function dayRelE(day, cur) {
    var a = parseDayE(day), b = parseDayE(cur);
    if (!a) return day || '';
    if (!b) return a.mo + '月' + a.d + '日';
    var diff = (b.y * 372 + b.mo * 31 + b.d) - (a.y * 372 + a.mo * 31 + a.d);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    return (a.y !== b.y ? a.y + '年' : '') + a.mo + '月' + a.d + '日';
  }
  function dayDiffE(a, b) {
    var pa = parseDayE(a), pb = parseDayE(b);
    if (!pa || !pb) return null;
    return (pb.y * 372 + pb.mo * 31 + pb.d) - (pa.y * 372 + pa.mo * 31 + pa.d);
  }

  // 三个主条目名（与卡组世界书一致）。数组顺序 = 选线菜单显示顺序（高中默认线排最前）。
  // 「开关读不出」时兜底也按此顺序遍历——高中兜底优先，符合默认线语义。
  var LINES = ['DLC·高中', 'DLC·大学', 'DLC·成人'];

  // 选线菜单用：各线的显示名 + 挂的 IF 条目（世界书备注名 + 菜单显示名）。
  // 二级结构：DLC 大项 → 各 IF 小项 + 空白项（不开任何 IF）。成人线暂无 IF。
  // ⚠ entry 必须与世界书条目备注一致（与开场白配置同源，改一边另一边同步）。
  var LINE_META = {
    'DLC·高中': { label: '高中', sub: '尘途逐光' },
    'DLC·大学': { label: '大学', sub: '青野长路' },
    'DLC·成人': { label: '成人', sub: '旧梦余温' }
  };
  var LINE_IFS = {
    'DLC·高中': [
      { entry: '高中·泥潭与飞鸟', label: '泥潭与飞鸟' },
      { entry: '高中·新城的月亮', label: '新城的月亮' },
      { entry: '高中·错位的资助', label: '错位的资助' },
      { entry: '高中·共生的藤蔓', label: '共生的藤蔓' }
    ],
    'DLC·大学': [
      { entry: '大学·契约之下', label: '契约之下' }
    ],
    'DLC·成人': []
  };

  // 跨会话上下文携带条数与个数：曾经写死，现由设置 app 可调（Store.cfg()）
  function crossLines() {
    try { return window.LZJM.Store.cfg().crossLines; } catch (e) { return 18; }
  }
  function crossMax() {
    try { return window.LZJM.Store.cfg().crossMax; } catch (e) { return 3; }
  }
  // 正文注入配置（含默认值兜底）
  function injCfg() {
    var d = { injRecent: 8, injMention: 4, injMax: 3, injRounds: 20 };
    try {
      var c = window.LZJM.Store.cfg();
      for (var k in d) d[k] = c[k] || d[k];
    } catch (e) {}
    return d;
  }

  // djb2 字符串哈希（主动消息防重键的一部分）
  function hashStr(s) {
    var h = 5381;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // 表情包同义词兜底（模型爱编名字；可继续扩充）
  var STICKER_SYN = {
    '探头': '偷看', '偷偷看': '偷看', '哭': '蛙蛙哭泣', '哭泣': '蛙蛙哭泣',
    '问号': '猫咪问号', '笑': '【可爱】大笑', '哈哈': '【可爱】大笑',
    '害羞': '有一丁点害羞', '晚安': '睡了拜拜', '道歉': '【可爱】道歉',
    '抱抱': '老公抱抱', '摸鱼': '摆烂'
  };

  var state = {
    rosters: {},
    stickers: {},
    profiles: {},
    npcLine: {},       // {线: {名字: 档案文本}}　线专属 NPC 档案（重写，只读它）
    evolLine: {},      // {线: {名字: 演化文本}}　[MAIN·名字·演化后]，叠加在基础人设后
    userEvol: {},      // {线: 文本}　[MAIN·{{user}}·演化后]，用户段的线增量
    entryStates: {},   // {条目标题: 是否勾选开启}
    line: null,        // 当前世界线（主条目名）
    lineSource: null,  // 这条线是怎么定出来的（日志用）
    ready: false
  };

  function on(ev, cb) {
    try {
      if (typeof eventOn === 'function') { eventOn(ev, cb); return; }
    } catch (e) {}
    try { eventSource.on(ev, cb); } catch (e) {}
  }

  var Engine = {
    IMG_BASE: IMG_BASE,

    section: function () {
      return (state.line && this.roster(state.line)) || null;
    },
    stickers: function () { return state.stickers; },
    profiles: function () { return state.profiles; },
    line: function () { return state.line; },
    LINES: LINES.slice(0),
    LINE_META: LINE_META,
    LINE_IFS: LINE_IFS,
    entryStates: function () { return state.entryStates; },
    // 按线名取通讯录：先精确，再忽略【】与空白比对（JSON key 和条目名略有差异也能对上）
    roster: function (line) {
      if (!line) return null;
      if (state.rosters[line]) return state.rosters[line];
      var want = String(line).replace(/[【】\s]/g, '');
      for (var k in state.rosters) {
        if (k.replace(/[【】\s]/g, '') === want) return state.rosters[k];
      }
      return null;
    },

    // 目标线对应的条目开关操作表：开目标线的命中词、关其余线的命中词。
    // DLC 条目标题是长名（如「DLC扩展：大学篇·青野与负途」），这里给的是关键词，
    // worldbook.setEntriesEnabled 按「标题包含」匹配。DLC·高中是默认线、无条目，不产生操作。
    lineOps: function (target) {
      var KEYS = {
        'DLC·大学': ['DLC·大学', '大学篇'],
        'DLC·成人': ['DLC·成人', '成人篇'],
        'DLC·高中': ['DLC·高中', '高中篇']
      };
      var ops = [];
      for (var ln in KEYS) {
        for (var ki = 0; ki < KEYS[ln].length; ki++) {
          ops.push({ match: KEYS[ln][ki], enable: ln === target });
        }
      }
      return ops;
    },

    // 「线 + IF」双层开关操作表：开本线主条目+目标IF，关其余线主条目+全部IF。
    // targetIf 传 null = 空白项（不开任何IF，只留本线主条目）。
    lineIfOps: function (target, targetIf) {
      var ops = [];
      for (var ln in LINE_IFS) {
        (LINE_IFS[ln] || []).forEach(function (f) {
          ops.push({ match: f.entry, enable: ln === target && f.entry === targetIf });
        });
      }
      return ops.concat(this.lineOps(target));
    },

    // 世界书里是否存在某条线的条目（选线界面禁用缺失项用）。
    // DLC·高中是默认线，无条目也永远可用；DLC 线按条目标题关键词命中。
    entryKnown: function (line) {
      if (line === 'DLC·高中') return true;
      var states = state.entryStates;
      for (var k in states) {
        if (window.LZJM.Worldbook.matchDlcLine(k) === line) return true;
      }
      return false;
    },

    // ── 人物档案取用（线感知 + 宏替换）──
    // 世界书原文里的 {{user}} 一律换成 persona 真名——generateRaw 不做宏替换，
    // 原文直发会让 NPC 对着「{{user}}」三个字聊天。
    deref: function (t) {
      var n = this.userName();
      return String(t || '').replace(/\{\{\s*user\s*\}\}/gi, n);
    },

    // 酒馆 persona 描述，两条路：
    // ① 酒馆助手沙盒自带 getPersona('current')（新版才有，旧版 undefined——升级后自动生效）
    // ② 父页 ctx.powerUserSettings.persona_description——ST 核心字段，即当前绑定 persona 的正文
    //    （power_user 是 ES 模块内部变量，window.parent 拿不到，必须走 getContext 的暴露字段）
    // 每次生成现读——换 persona 立刻跟上，不用刷新。
    userPersona: function () {
      var desc = '';
      var src = '';
      try {
        if (typeof getPersona === 'function') {
          var p = getPersona('current');
          if (p && p.description) { desc = String(p.description); src = 'getPersona'; }
        }
      } catch (e) {}
      try {
        if (!desc) {
          var st = window.parent.SillyTavern;
          var ctx = st && st.getContext && st.getContext();
          if (ctx && ctx.powerUserSettings && ctx.powerUserSettings.persona_description) {
            desc = String(ctx.powerUserSettings.persona_description); src = 'powerUserSettings';
          }
        }
      } catch (e) {}
      if (!this._personaLogged) {
        this._personaLogged = true;
        console.log('[霖州引擎] persona 诊断：来源=' + (src || '无') + '，长度=' + desc.length +
          (typeof getPersona === 'function' ? '' : '，getPersona 不存在（酒馆助手版本较旧）'));
      }
      return desc;
    },

    // 取某人在当前线的档案：线NPC库有 → 只读它（各线重写的独立档案）；
    // 否则 基础人设 + 当前线演化层（叠加，不替换）。
    profileFor: function (name) {
      var line = state.line;
      if (line && state.npcLine[line] && state.npcLine[line][name]) {
        return this.deref(state.npcLine[line][name]);
      }
      var base = state.profiles[name] || '';
      if (line && state.evolLine[line] && state.evolLine[line][name]) {
        var evo = state.evolLine[line][name];
        base = base
          ? base + '\n\n当前时间线【' + line + '】的最新人设演化如下（叠加于上方基础人设，不替换）：\n' + evo
          : evo;
      }
      return this.deref(base);
    },

    // ── 跨会话上下文（当天时效）──
    // 群→私聊：对方在的群当天有动静 → 带群记录尾巴（对方在场，与防开天眼规则自洽）
    crossGroups: function (name, dateText) {
      if (!dateText) return [];
      var sec = this.section();
      if (!sec) return [];
      var W = window.LZJM, out = [];
      (sec.groups || []).forEach(function (g) {
        if ((g.members || []).indexOf(name) === -1) return;
        var h = W.Store.history('group:' + g.name);
        if (!h.length || h[h.length - 1].day !== dateText) return;
        if (out.length >= crossMax()) return;
        out.push({ name: g.name, hist: h.slice(-crossLines()) });
      });
      return out;
    },
    // 私聊→群：成员与机主当天的私聊 → 挂到该成员档案下（※ 仅本人知晓，规则侧封死其他人的引用）
    crossPrivates: function (members, dateText) {
      if (!dateText) return {};
      var W = window.LZJM, out = {};
      (members || []).forEach(function (n) {
        var h = W.Store.history(n);
        if (!h.length || h[h.length - 1].day !== dateText) return;
        if (Object.keys(out).length >= crossMax()) return;
        out[n] = h.slice(-crossLines());
      });
      return out;
    },

    // 机主资料段：persona 描述 + 当前线的 [MAIN·{{user}}·演化后]，每次生成接进提示词末尾区。
    // 两段都在时中间加衔接句，标明演化层叠加于基础资料之上。
    userBlock: function () {
      var persona = this.userPersona();
      var evo = (state.line && state.userEvol[state.line]) ? state.userEvol[state.line] : '';
      var out;
      if (persona && evo) {
        out = persona + '\n\n当前时间线【' + state.line + '】的最新演化如下（叠加于上方机主资料，不替换）：\n' + evo;
      } else {
        out = persona || evo;
      }
      return this.deref(out);
    },

    userName: function () {
      // 沙盒里没有 name1，走主页面 SillyTavern.getContext() 拿 persona 名
      try {
        var st = window.parent.SillyTavern;
        var ctx = st && st.getContext && st.getContext();
        if (ctx && ctx.name1) return String(ctx.name1);
      } catch (e) {}
      try { if (typeof name1 !== 'undefined' && name1) return String(name1); } catch (e) {}
      try {
        var v = getVariables({ type: 'chat' }) || {};
        if (v.name || v.user) return String(v.name || v.user);
      } catch (e) {}
      return '我';
    },

    // 酒馆 persona 头像：只读用户设置面板里当前 persona 的高亮头像块，与聊天楼层无关。
    userAvatar: function () {
      try {
        var pimg = window.parent.document.querySelector('#user_avatar_block .avatar-container.selected .avatar img');
        if (pimg && pimg.src) return pimg.src;
        console.log('[霖州引擎] 头像：persona 面板未找到当前头像');
      } catch (e) { console.warn('[霖州引擎] 头像读取失败：' + (e && e.message)); }
      return '';
    },

    findContact: function (name) {
      var sec = this.section();
      if (!sec) return null;
      for (var i = 0; i < sec.contacts.length; i++) {
        if (sec.contacts[i].name === name) return sec.contacts[i];
      }
      return null;
    },

    resolveSticker: function (name) {
      name = String(name || '').trim().replace(/^[【\[]+|[】\]]+$/g, '');
      if (state.stickers[name]) return name;
      if (STICKER_SYN[name] && state.stickers[STICKER_SYN[name]]) return STICKER_SYN[name];
      var keys = Object.keys(state.stickers);
      for (var i = 0; i < keys.length; i++) {
        var bare = keys[i].replace(/【.*?】/g, '');
        if (bare === name) return keys[i];
      }
      if (name.length >= 2) {
        for (var j = 0; j < keys.length; j++) {
          var b2 = keys[j].replace(/【.*?】/g, '');
          if (keys[j].indexOf(name) !== -1 || b2.indexOf(name) !== -1) return keys[j];
        }
      }
      return null;
    },

    // ── 世界书装载 ──
    load: async function () {
      var data = await window.LZJM.Worldbook.load();
      state.rosters = data.rosters;
      state.stickers = data.stickers;
      state.profiles = data.profiles;
      state.entryStates = data.states || {};
      // 线作用域档案归线：NPC（…）/ 主角人设（…）里的块按括号里的线名分派，
      // 各线各读各的，根治「同一个人两条线共用一版档案」的串线
      state.npcLine = {}; state.evolLine = {}; state.userEvol = {};
      var raws = [{ list: data.npcLineRaw, into: 'npc' }, { list: data.evolLineRaw, into: 'evol' }];
      for (var ri = 0; ri < raws.length; ri++) {
        for (var rj = 0; rj < (raws[ri].list || []).length; rj++) {
          var line = this.lineOfScope(raws[ri].list[rj].scope);
          if (!line) {
            console.warn('[霖州引擎] 条目作用域「' + raws[ri].list[rj].scope + '」认不出属于哪条线，该条目不生效');
            continue;
          }
          var blocks = raws[ri].list[rj].blocks || {};
          for (var bn in blocks) {
            if (bn === '{{user}}' || bn === 'user') {
              if (raws[ri].into === 'evol') {
                state.userEvol[line] = state.userEvol[line] ? state.userEvol[line] + '\n' + blocks[bn] : blocks[bn];
              }
              continue; // NPC 条目里的 user 块不作档案
            }
            var bucket = raws[ri].into === 'npc' ? state.npcLine : state.evolLine;
            bucket[line] = bucket[line] || {};
            if (!(bn in bucket[line])) bucket[line][bn] = blocks[bn];
          }
        }
      }
      // DLC 长文条目（大学篇/成人篇）：主角演化层 + 既有NPC演化层 + 新增NPC全档。
      // 与 npcLine/evolLine 同一套两层机制，只是来源从 [NPC·]/[MAIN·] 块换成自由 Markdown 段落。
      var dlcRaw = data.dlcLineRaw || [];
      for (var di = 0; di < dlcRaw.length; di++) {
        var dline = dlcRaw[di].line;
        var d = dlcRaw[di].parsed || {};
        if (!dline) continue;
        if (d.mainName && d.main) {
          state.evolLine[dline] = state.evolLine[dline] || {};
          if (!(d.mainName in state.evolLine[dline])) state.evolLine[dline][d.mainName] = d.main;
        }
        for (var fn in (d.fresh || {})) {
          state.npcLine[dline] = state.npcLine[dline] || {};
          if (!(fn in state.npcLine[dline])) state.npcLine[dline][fn] = d.fresh[fn];
        }
        for (var en2 in (d.evol || {})) {
          state.evolLine[dline] = state.evolLine[dline] || {};
          if (!(en2 in state.evolLine[dline])) state.evolLine[dline][en2] = d.evol[en2];
        }
      }
      state.ready = true;
      console.log('[霖州引擎] 世界书装载完成：世界线 ' + Object.keys(state.rosters).join(' / ') +
        '｜表情包 ' + Object.keys(state.stickers).length + '｜人设 ' + Object.keys(state.profiles).join('、') +
        '｜线NPC库 ' + Object.keys(state.npcLine).join('、') +
        '｜演化层 ' + Object.keys(state.evolLine).map(function (l) { return l + '(' + Object.keys(state.evolLine[l]).join('/') + ')'; }).join('、'));
    },

    // 「高中线-核心人员」「大学线」「成人线-破镜重圆」这类作用域 → LINES 线名。
    // 取 '-' 前的字头（去掉线/时代尾缀）匹配 LINES 前缀；
    // 命中多条时（成人两条）再用 '-' 后的尾巴收窄；尾巴只是条目内分类（核心/编外）时无影响。
    lineOfScope: function (scope) {
      var s = String(scope || '').replace(/[【】\s]/g, '');
      var tail = '';
      var di = s.indexOf('-');
      if (di !== -1) { tail = s.slice(di + 1); s = s.slice(0, di); }
      s = s.replace(/(?:时代|线)$/, '');
      if (!s) return null;
      var hits = [];
      for (var i = 0; i < LINES.length; i++) {
        var ln = LINES[i].replace(/[【】\s]/g, '');
        if (ln.indexOf(s) === 0) hits.push(LINES[i]);
      }
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) {
        var tailed = hits.filter(function (h) {
          return !tail || h.replace(/[【】\s]/g, '').indexOf(tail) !== -1;
        });
        if (tailed.length) {
          if (tailed.length > 1) console.warn('[霖州引擎] 作用域「' + scope + '」同时命中 ' + tailed.join('、') + '，取第一条');
          return tailed[0];
        }
        console.warn('[霖州引擎] 作用域「' + scope + '」同时命中 ' + hits.join('、') + '，取第一条');
        return hits[0];
      }
      return null;
    },

    // 注意 entryStates 是加载时的快照，玩家随后手动开关条目必须先调 refreshStates()。
    refreshStates: async function () {
      try { state.entryStates = await window.LZJM.Worldbook.readStates(); } catch (e) {}
    },

    // ── 世界线定位 ──
    // 铁律：聊天记录里存的线是老大，世界书开关只是它的执行层。
    //   有记录 → 开关与记录不一致（含读不出）就写世界书归位（比对过才动手，一致就不碰）；
    //   无记录 → 读开关、写入记录（只写聊天变量，绝不碰世界书条目——记录永远不会提前关掉正在用的条目）；
    //   record=true 才落记录（打开手机时）；启动/切聊天只定显示不落记录——开场白选线等卡内
    //   代码可能在这之后才翻开关，记录要等生成回复后（激活广播）或打开手机时再写。
    // 注意 entryStates 是加载时的快照，动手前必须先调 refreshStates()。
    locateLine: function (record) {
      var W = window.LZJM;
      var saved = W.Store.line();
      var savedOk = saved && LINES.indexOf(saved) !== -1;
      var switchHit = this.lineBySwitch();

      if (savedOk) {
        if (!(switchHit.known && switchHit.line === saved)) this.reconcileLine(saved, switchHit);
        this.applyLine(saved, '聊天记录');
        return;
      }
      if (switchHit.known && switchHit.line) {
        if (record) W.Store.setLine(switchHit.line);
        this.applyLine(switchHit.line, '主条目开关');
        return;
      }
      // 开关读不出（全关/多开/条目缺失）且无记录：不猜不记，仅临时兜底显示
      for (var lj = 0; lj < LINES.length; lj++) {
        var sec0 = this.roster(LINES[lj]);
        if (sec0 && (sec0.contacts.length || sec0.groups.length)) {
          this.applyLine(LINES[lj], '兜底（开关读不出且无记录，未写入记录）');
          return;
        }
      }
      this.applyLine(null, '无可用世界线');
    },

    // 世界书开关归位到记录中的线（异步写条目；调用前已比对，一致不会走到这）。
    // 写入只影响下一次注入评估——正在进行的生成，注入在开头就定好了，改不动也不该改。
    reconcileLine: function (target, switchHit) {
      if (this._reconciling) return; // 写入是异步的，防重入
      this._reconciling = true;
      var self = this;
      var why = switchHit.known
        ? ('开关当前在【' + (switchHit.line || '全部关闭') + '】')
        : ('开关读不出：' + (switchHit.note || '条目缺失'));
      window.LZJM.Worldbook.setEntriesEnabled(this.lineOps(target)).then(function () {
        self.noteLineEntries(target);
        console.log('[霖州引擎] 世界书已按聊天记录归位到【' + target + '】（' + why + '）');
        try { toastr.info('已按该聊天记录切换到【' + target + '】（世界书条目已代劳开关）', '📱 霖州引擎'); } catch (e) {}
      }, function (e) {
        console.warn('[霖州引擎] 世界书归位写入失败', e);
        try { toastr.warning('世界书归位失败：' + (e && e.message || e), '📱 霖州引擎'); } catch (e2) {}
      }).then(function () { self._reconciling = false; },
              function () { self._reconciling = false; });
    },

    // 写完条目后把内存里的开关快照同步成目标状态：省一次重读，也防连续误判重复写。
    // DLC 条目标题是长名，按关键词反推归属线。
    noteLineEntries: function (target) {
      for (var k in state.entryStates) {
        var ln = window.LZJM.Worldbook.matchDlcLine(k);
        if (ln) state.entryStates[k] = (ln === target);
      }
    },

    // 读 DLC 主条目的勾选状态。返回 {known, line, note}：
    //   恰好一条 DLC 开 → 该线；
    //   全关             → DLC·高中（默认线，高中没有也不需要有自己条目）；
    //   多条同开         → 读不出（按聊天记录记录归位）。
    lineBySwitch: function () {
      var titles = Object.keys(state.entryStates);
      if (!titles.length) return { known: false, note: '开关字段读不到' };
      var opened = [];
      for (var i = 0; i < titles.length; i++) {
        if (!state.entryStates[titles[i]]) continue;
        var ln = window.LZJM.Worldbook.matchDlcLine(titles[i]);
        if (ln && ln !== 'DLC·高中' && opened.indexOf(ln) === -1) opened.push(ln);
      }
      if (opened.length === 1) return { known: true, line: opened[0], note: 'DLC主条目开关' };
      if (opened.length === 0) return { known: true, line: 'DLC·高中', note: '默认线（无DLC条目开启）' };
      console.warn('[霖州引擎] DLC 条目同时开启 ' + opened.length + ' 条（' + opened.join('、') +
        '），视为读不出，改按聊天记录记录归位');
      return { known: false, note: opened.length + ' 条DLC同时开' };
    },

    applyLine: function (line, source) {
      if (state.line === line && state.lineSource === source) return;
      state.line = line;
      state.lineSource = source;
      if (line) console.log('[霖州引擎] 世界线定位：' + line + '（依据：' + source + '）');
      else console.log('[霖州引擎] 世界线定位：无手机世界线（依据：' + source + '）');
      this.syncMount();
    },

    // 世界书激活广播（每次主对话生成后触发）：只在聊天记录还没有记录时写入记录——
    // 有记录的聊天广播说了不算（防止中途手动翻开关被当成换线意图），
    // 归位只发生在进聊天/开手机时。记录写入只碰聊天变量，不碰条目。
    setLineByEntries: function (entries) {
      if (!entries || !entries.length) return;
      var W = window.LZJM;
      var saved = W.Store.line();
      if (saved && LINES.indexOf(saved) !== -1) return;
      for (var i = 0; i < entries.length; i++) {
        var title = String((entries[i] && (entries[i].name || entries[i].comment || entries[i].title)) || '');
        var ln = W.Worldbook.matchDlcLine(title);
        if (ln) {
          W.Store.setLine(ln);
          this.applyLine(ln, '世界书激活广播');
          return;
        }
      }
    },

    // 有本线通讯录 → 挂手机；没有（古代线）→ 收起
    syncMount: function () {
      var has = !!this.section();
      var UI = window.LZJM.Apps.wechat;
      if (has) { UI.inject(); UI.render(); }
      else UI.remove();
    },

    // ── 生成 API 配置（设置 app 可调，存 Store.settings().api）──
    // mode: follow=跟随正文（默认） / model=正文同源只换模型 / custom=自定义API
    // 密钥唯一例外存 localStorage（仅本机浏览器，不随聊天变量/卡外流）
    apiConfig: function () {
      var a;
      try { a = window.LZJM.Store.settings().api || {}; } catch (e) { return undefined; }
      if (!a.mode || a.mode === 'follow') return undefined;
      if (a.mode === 'model') return a.model ? { model: a.model } : undefined;
      if (a.mode === 'custom') {
        if (!a.apiurl) return undefined;
        var key = '';
        try { key = localStorage.getItem('lzjm_phone_apikey') || ''; } catch (e) {}
        return { apiurl: a.apiurl, key: key, model: a.cmodel || '', source: a.source || 'openai' };
      }
      return undefined;
    },

    // 统一生成入口：按设置注入 custom_api 后调 generateRaw
    gen: function (req) {
      var a = this.apiConfig();
      if (a) req = Object.assign({}, req, { custom_api: a });
      return generateRaw(req);
    },
    // ── 聊天压缩：某会话未折叠的条数超阈值时，把窗口外的旧消息折成提要 ──
    // 提要留在 Store 里，手机提示词用它接续话题；正文注入用 headline 一行近况。
    COMPRESS_AT: 60,      // 未折叠超过 60 条触发（窗口 50 + 10 条缓冲）
    DIGEST_KEEP: 50,      // 提示词直接携带的最近条数

    compress: async function (chatKey) {
      var W = window.LZJM;
      var hist = W.Store.history(chatKey);
      var meta = W.Store.meta(chatKey);
      var digested = meta.digested || 0;
      if (hist.length - digested <= this.COMPRESS_AT) return meta.digest || '';
      var fold = hist.slice(digested, hist.length - this.DIGEST_KEEP);
      if (!fold.length) return meta.digest || '';
      var lines = fold.map(function (m) {
        return W.Floor.msgToLine(m, this.userName());
      }, this);
      var raw = await this.gen({
        ordered_prompts: [
          { role: 'system', content: '把以下微信聊天记录折叠成不超过150字的中文提要。保留：约定/计划、冲突与误会、关系进展、未了的情绪；丢弃：寒暄、重复内容。只输出提要本身。' },
          { role: 'user', content: lines.join('\n') }
        ],
        should_silence: true,
        max_chat_history: 0
      });
      var text = (typeof raw === 'string') ? raw : String((raw && (raw.text || raw.message)) || '');
      text = text.trim();
      if (!text) return meta.digest || '';
      var digest = (meta.digest ? meta.digest + '；' : '') + text;
      W.Store.setMeta(chatKey, { digest: digest, digested: digested + fold.length });
      console.log('[霖州引擎] 聊天记录折叠：' + chatKey + ' 折叠 ' + fold.length + ' 条，累计提要 ' + (digested + fold.length) + ' 条');
      return digest;
    },

    // ── 主线楼数（注入判定「多久前聊过」用） ──
    mainCount: function () {
      try { return getChatMessages('0-{{lastMessageId}}').length; } catch (e) { return 0; }
    },

    // ── 正文生成前的手机动态注入：每个入选会话带最近 10 轮完整对话 ──
    // 正文注入四参数（默认 8/4/3/20）已迁至 Store.DEFAULTS，设置 app「正文生成 · 手机注入」可调

    injectDigest: function () {
      try {
        var W = window.LZJM;
        var sec = this.section();
        if (!sec) return;
        var root = W.Store;
        var myName = this.userName();
        var now = this.mainCount();
        var recentText = '';
        try {
          recentText = getChatMessages('0-{{lastMessageId}}')
            .slice(-injCfg().injMention)
            .map(function (m) { return String((m && m.message) || ''); }).join('\n');
        } catch (e) {}
        var blocks = [];
        var keys = root.historyKeys();
        // ── 诊断：生成起点记录库实况（排查"已删消息仍被注入"）──
        try {
          var snap = keys.map(function (k) { return k + '=' + root.history(k).length; }).join(' ');
          console.log('[霖州引擎] 注入诊断@' + now + '楼 | 记录库[' + (snap || '空') + '] | 命中检查 recent=' + injCfg().injRecent + ' mention=' + injCfg().injMention);
        } catch (e) {}
        var cands = [];
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var hist0 = root.history(key);
          if (!hist0.length) continue;
          var meta0 = root.meta(key);
          var isGrp0 = key.indexOf('group:') === 0;
          var nm = isGrp0 ? key.slice(6) : key;
          var hit = false;
          if (meta0.atMainCount != null && now - meta0.atMainCount <= injCfg().injRecent) hit = true;
          if (!hit && recentText.indexOf(nm) !== -1) hit = true;
          if (hit) cands.push({ key: key, name: nm, isGrp: isGrp0, meta: meta0 });
        }
        // 最近活跃的会话优先（同活跃楼数按名字稳定排序，保证可预期）
        cands.sort(function (a, b) {
          var d = (b.meta.atMainCount || 0) - (a.meta.atMainCount || 0);
          return d !== 0 ? d : (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0));
        });
        var curDay = ''; try { curDay = W.Status.nowDay(); } catch (e0) {}
        for (var ci = 0; ci < cands.length && blocks.length < injCfg().injMax; ci++) {
          var hist = root.history(cands[ci].key);
          var meta = cands[ci].meta;
          var name = cands[ci].name;
          var ago = meta.atMainCount != null ? Math.max(0, now - meta.atMainCount) : null;
          var slice = hist.slice(-injCfg().injRounds);
          var firstDay = null;
          for (var fi = 0; fi < slice.length; fi++) { if (slice[fi].day) { firstDay = slice[fi].day; break; } }
          // 头部时间标：优先按消息自身的故事日期算时间差；旧记录没有 day 才退回楼层差
          var when = '';
          var dd = firstDay ? dayDiffE(firstDay, curDay) : null;
          if (dd != null) when = dd === 0 ? '（今天）' : dd === 1 ? '（昨天）' : (dd <= 31 ? '（' + dd + '天前）' : '（' + dayRelE(firstDay, curDay) + '）');
          else if (ago != null) when = '（' + ago + ' 楼前）';
          var prevDay = null;
          var lines = [];
          slice.forEach(function (m) {
            if (m.day && m.day !== prevDay) {
              lines.push('〔' + dayRelE(m.day, curDay) + (m.time ? ' ' + m.time : '') + '〕');
              prevDay = m.day;
            }
            lines.push((m.who === 'user' ? myName : m.who) + '：' + W.Floor.msgToLine(m, myName).replace(/^[^：]*：/, ''));
          });
          blocks.push('「' + name + '」' + (cands[ci].isGrp ? '（群聊，仅群成员知情）' : '（私聊，仅对话双方知情）') + when + '：\n' + lines.join('\n'));
        }
        if (!blocks.length) {
          console.log('[霖州引擎] 注入诊断@' + now + '楼 | 无命中会话，不注入');
          return;
        }
        console.log('[霖州引擎] 注入诊断@' + now + '楼 | 注入 ' + blocks.length + ' 块：' +
          cands.slice(0, injCfg().injMax).map(function (c) { return c.key + '(' + root.history(c.key).length + '条)'; }).join('、'));
        injectPrompts([{
          id: 'lzjm-phone-digest',
          position: 'in_chat',
          depth: 1,   // 历史正文内部、最后一楼之上——物理上位于所有 D0 规则上方
          role: 'system',
          content: '【手机近况 · 微信】' + myName + '近期在手机上聊过天（仅作背景，正文不必专门提及。角色可自然引用自己参与过的聊天——私聊只限对话双方、群聊只限群成员知情；不得说出自己不在场的私聊内容）：\n' + blocks.join('\n')
        }], { once: true });
      } catch (e) { console.warn('[霖州引擎] 手机动态注入失败', e); }
    },

    // ── 主动消息捕捉：正文末位 <!--phone ... --> 注释块 ──
    // 卡契约：主 AI 按世界书规则条目在正文末尾输出。ST 渲染时清洗 HTML 注释 → 正文
    // 天然不可见，原始文本完好。此处抠出后经 Floor.parseNpcLines（群模式，每行
    // 「名字：内容」，契约语法 [语音:…]/[图片:…] 照常可用）写入各联系人聊天记录。
    // 已处理消息 id 落聊天变量防重——重进聊天文件不会二次触发。
    // 只挂即时生成事件、不做历史补扫（避免扫全楼层）。
    capturePhoneBlock: function (msg) {
      return this.capturePhoneText(String((msg && msg.message) || ''));
    },
    // 从任意文本里抠 <!--phone--> 主动块并按人路由进私聊（带未读/近况元信息）。
    // 正文末位捕捉与手机群聊生成夹带私聊，两条管道共用此函数。
    capturePhoneText: function (text) {
      var W = window.LZJM;
      var re = /<!--\s*phone\s*([\s\S]*?)-->/gi;
      var m, body = '';
      while ((m = re.exec(String(text || '')))) body += (body ? '\n' : '') + m[1];
      if (!body.trim()) return [];
      var parsed;
      try { parsed = W.Floor.parseNpcLines(body, null); } catch (e) { return []; }
      if (!parsed.length) return [];
      var byWho = {};
      parsed.forEach(function (p) { (byWho[p.who] = byWho[p.who] || []).push(p); });
      var names = Object.keys(byWho);
      var UI = W.Apps && W.Apps.wechat;
      names.forEach(function (n) {
        W.Store.push(n, byWho[n], 100);
        // 未读：正开着该对话框看 = 已读；否则累加红点（打开即清零，见 wechat.openChat）
        var viewing = UI && UI.screen === 'chat' && UI.chatKey === n;
        if (!viewing) W.Store.bumpUnread(n, byWho[n].length);
        var arr = byWho[n];
        var last = arr[arr.length - 1];
        var headText = last.kind === 'text' ? last.text
          : last.kind === 'calllog' ? '[' + (last.mode === 'video' ? '视频通话' : '语音通话') + ']'
          : '[' + ({ sticker: '表情', voice: '语音', image: '图片', poke: '戳一戳', location: '定位', transfer: '转账', taccept: '转账', tdecline: '转账' }[last.kind] || '消息') + ']';
        W.Store.setMeta(n, { headline: String(headText).slice(0, 40), atMainCount: Engine.mainCount() });
      });
      return names;
    },
    // 扫最近的 assistant 消息（默认 5 条，仅即时事件后调用），抓未处理键里的注释块。
    // 防重键 = 楼层id + swipe序号 + 块内容哈希：重 roll 同层新 swipe 会换新键正常
    // 再捕捉；同层同 swipe 重复扫描才跳过。
    // 注意：酒馆助手的 getChatMessages 必须带范围参数（裸调会 throw），
    // 返回对象的楼层号是 message_id（不是 id）。
    sweepPhoneBlocks: function (backlog) {
      var msgs;
      try { msgs = getChatMessages('0-{{lastMessageId}}'); } catch (e) {
        console.warn('[霖州引擎] 主动消息扫描：getChatMessages 失败', e);
        return;
      }
      if (!msgs || !msgs.length) return;
      msgs = msgs.slice(-(backlog || 5));
      var W = window.LZJM;
      var seen = W.Store.procIds();
      for (var i = 0; i < msgs.length; i++) {
        var mm = msgs[i];
        if (!mm || mm.role !== 'assistant') continue;
        var mid = mm.message_id != null ? mm.message_id : (mm.id != null ? mm.id : ('idx' + i));
        var swipe = mm.swipe_id != null ? mm.swipe_id : 0;
        var blockM = /<!--\s*phone\s*([\s\S]*?)-->/i.exec(String(mm.message || ''));
        var key = mid + ':' + swipe + ':' + (blockM ? hashStr(blockM[1]) : '-');
        if (seen.indexOf(key) !== -1) continue;
        var names = [];
        if (blockM) {
          try { names = this.capturePhoneBlock(mm); } catch (e) {
            console.warn('[霖州引擎] 主动消息捕捉失败', e);
          }
        }
        W.Store.markProcId(key);
        seen.push(key);
        if (names.length) {
          console.log('[霖州引擎] 主动消息：' + names.join('、') + '（楼层 ' + mid + ' swipe ' + swipe + '）');
          try { toastr.info('📱 ' + names.join('、') + ' 发来了新消息', '霖州手机', { timeOut: 4000 }); } catch (e) {}
          try { W.Floor.renderAll(); } catch (e) {}
          try { var UI = W.Apps.wechat; if (UI && UI.screen) UI.render(); } catch (e) {}
        }
      }
    },

    // ── 独立生成 ──
    generateFor: async function (chatKey, isGroup) {
      var W = window.LZJM;
      var sec = this.section();
      if (!sec) throw new Error('当前世界线无通讯录');

      var digest = await this.compress(chatKey);
      var stickerNames = Object.keys(state.stickers).slice(0, 120);
      var userInfo = this.userBlock();
      var raw, title, parseGroup = false;

      if (!isGroup) {
        var c = this.findContact(chatKey);
        if (!c) throw new Error('联系人不在本线通讯录：' + chatKey);
        var profile = this.profileFor(c.name);
        var snap = W.Status.snapshot(c.name);
        var hist = W.Store.history(chatKey);
        // 最新一批连续的用户消息摘出来作为最终 user 轮次，其余留在系统块的应用内记录里
        var tail = [];
        for (var hi = hist.length - 1; hi >= 0 && hist[hi].who === 'user'; hi--) tail.unshift(hist[hi]);
        var rest = hist.slice(0, hist.length - tail.length);
        // 今日通话尾巴：同一故事日内两人通话里的对白/画面也要带到私聊里（双方都记得）
        var callLog = null;
        try {
          var callDay = snap && snap.dateText;
          if (callDay) {
            var chist = W.Store.history(this.callKey(c.name));
            var cday = chist.filter(function (m) { return m.day === callDay; });
            if (cday.length) {
              var dur = '';
              for (var ci = cday.length - 1; ci >= 0; ci--) {
                var dm = String(cday[ci].text || '').match(/^通话结束 · (.+)$/);
                if (dm) { dur = dm[1]; break; }
              }
              var video = cday.some(function (m) { return m.kind === 'scene'; });
              var lines = cday.filter(function (m) { return m.who !== 'sys'; })
                .slice(-20)
                .map(function (m) { return W.Floor.msgToLine(m, this.userName()); }, this);
              if (lines.length) callLog = { kind: video ? '视频通话' : '语音通话', dur: dur || '未接通', video: video, lines: lines };
            }
          }
        } catch (e) { callLog = null; }
        // 近期朋友圈摘要（近 3 天对方发过的动态 + 机主互动过的旧动态；互动痕迹对方都记得，
        // 聊天时可自然提起；没互动的也能成为话题）
        var momentsNote = '';
        try { momentsNote = this.momentsNoteFor(c.name, snap); } catch (e) { momentsNote = ''; }
        var myNote = '';
        try { myNote = this.myMomentsNote(snap); } catch (e) { myNote = ''; }
        var req = W.Prompt.private({ name: c.name, profile: profile }, rest, snap, stickerNames, tail, digest, userInfo,
          this.crossGroups(c.name, snap && snap.dateText), callLog, momentsNote, myNote);
        raw = await this.gen(req);
        title = '与' + c.name + '的私聊';
      } else {
        var gname = chatKey.replace(/^group:/, '');
        var g = null;
        for (var i = 0; i < sec.groups.length; i++) if (sec.groups[i].name === gname) g = sec.groups[i];
        if (!g) throw new Error('群不在本线通讯录：' + gname);
        var members = (g.members || []).map(function (n) {
          return { name: n, profile: this.profileFor(n) };
        }, this);
        var snap2 = W.Status.snapshot(null);
        var hist2 = W.Store.history(chatKey);
        var tail2 = [];
        for (var hj = hist2.length - 1; hj >= 0 && hist2[hj].who === 'user'; hj--) tail2.unshift(hist2[hj]);
        var rest2 = hist2.slice(0, hist2.length - tail2.length);
        var req2 = W.Prompt.group({ name: g.name, open: g.open, style: g.style, crowd: g.crowd }, members, rest2, snap2, stickerNames, tail2, digest, userInfo,
          this.crossPrivates(g.members, snap2 && snap2.dateText));
        raw = await this.gen(req2);
        title = g.name + ' 群聊';
        parseGroup = true;
      }

      var text = (typeof raw === 'string') ? raw : String((raw && (raw.text || raw.message)) || '');
      // 群聊生成可夹带 <!--phone--> 私聊主动块（成员借群里的话题顺势私聊机主）：
      // 路由进各私聊 + 红点 + toast，然后从回复里剥掉，免得被群解析器吃进记录
      if (parseGroup && /<!--\s*phone/i.test(text)) {
        var sideNames = [];
        try { sideNames = this.capturePhoneText(text); } catch (e) { console.warn('[霖州引擎] 群聊夹带私聊捕捉失败', e); }
        if (sideNames.length) {
          try { toastr.info('📱 ' + sideNames.join('、') + ' 借机私聊了你', '霖州手机', { timeOut: 4000 }); } catch (e) {}
          try { W.Floor.renderAll(); } catch (e) {}
          try { var UI0 = W.Apps && W.Apps.wechat; if (UI0 && UI0.screen && !UI0.call) UI0.render(); } catch (e) {}
        }
        text = text.replace(/<!--\s*phone\s*([\s\S]*?)-->/gi, '');
      }
      var msgs = W.Floor.parseNpcLines(text, parseGroup ? null : chatKey);
      if (!msgs.length) throw new Error('生成结果为空');
      // 一行近况（正文注入用）：取最后一条消息的核心内容
      var lastMsg = msgs[msgs.length - 1];
      var headText = lastMsg.kind === 'text' ? lastMsg.text
        : lastMsg.kind === 'calllog' ? '[' + (lastMsg.mode === 'video' ? '视频通话' : '语音通话') + ']'
        : '[' + ({ sticker: '表情', voice: '语音', image: '图片', poke: '戳一戳', location: '定位', transfer: '转账', taccept: '转账', tdecline: '转账' }[lastMsg.kind] || '消息') + ']';
      W.Store.setMeta(chatKey, { headline: String(headText).slice(0, 40), atMainCount: this.mainCount() });
      return { key: chatKey, title: title, msgs: msgs };
    },



    // ── 朋友圈 ──
    // 动态存在 Store key「__moments__」，条目 = {who, text, img, pt, label, likes:[名], comments:[{who,replyTo,text}]}
    // pt = 动态自身发布时间 'YYYY年M月D日 HH:MM'（AI 生成 or 兜底推算）；day/time = 入库戳（真实刷出时间，判重/未读用）
    // 首次进入按故事日生成一次（filledDay 打卡）；互动痕迹（不带全文）进同日私聊上下文。
    momentsKey: '__moments__',
    momentsFeed: function () { return window.LZJM.Store.history(this.momentsKey); },

    // 契约输出解析：[动态:名:文字] / [配图:名:描述]（跟在对应动态后）
    //           [点赞:名单] / [评论:评论者@被回复的人:内容]（都挂在紧跟的那条动态下；@可省略）
    parseMoments: function (text) {
      var posts = [];
      String(text || '').split('\n').forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var m = line.match(/^\[动态:([^:：\]]{1,12})[:：]([\s\S]+)\]$/);
        if (m) { posts.push({ who: m[1].trim(), text: m[2].trim(), img: '', likes: [], comments: [] }); return; }
        var g = line.match(/^\[配图:([^:：\]]{1,12})[:：]([\s\S]+)\]$/);
        if (g) {
          for (var i = posts.length - 1; i >= 0; i--) {
            if (posts[i].who === g[1].trim()) { posts[i].img = g[2].trim(); break; }
          }
          return;
        }
        var tm = line.match(/^\[时间[:：]([\s\S]+)\]$/);
        if (tm) {
          // 发布时间挂在紧跟的那条动态下（动态自身时间，AI 生成；缺省引擎兜底推算）
          var tp = posts[posts.length - 1];
          if (tp) tp.ptRaw = tm[1].trim();
          return;
        }
        var lk = line.match(/^\[点赞:([\s\S]+)\]$/);
        if (lk) {
          var lastPost = posts[posts.length - 1];
          if (lastPost) {
            var names = lk[1].split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
            names.forEach(function (n) { if (lastPost.likes.indexOf(n) === -1) lastPost.likes.push(n); });
            lastPost.likes = lastPost.likes.slice(0, 5);
          }
          return;
        }
        var cm = line.match(/^\[评论:([^:：@\]]{1,12})(?:@([^:：\]]{1,12}))?[:：]([\s\S]+)\]$/);
        if (cm) {
          // 评论挂在紧跟的那条动态下；@后面是"被回复的人"（作者或前面的评论者），不是动态作者校验
          var target = posts[posts.length - 1];
          if (target && target.comments.length < 5) {
            target.comments.push({ who: cm[1].trim(), replyTo: cm[2] ? cm[2].trim() : '', text: cm[3].trim() });
          }
        }
      });
      return posts.filter(function (p) { return p.who && p.text; }).slice(0, 6);
    },
    // 动态自身时间的三件小工具：解析 'YYYY年M月D日 HH:MM' / 短格式 / 天数差
    ptParts: function (pt) { var m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(pt || ''); return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null; },
    dayDiff: function (a, b) { return (b.y * 372 + b.mo * 31 + b.d) - (a.y * 372 + a.mo * 31 + a.d); },
    ptShort: function (pt) { var m = /^\d{4}年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})/.exec(pt || ''); return m ? m[1] + '月' + m[2] + '日 ' + m[3] : ''; },
    // 近期朋友圈摘要：近 3 天对方发过的动态（至多 3 条）+ 机主互动过的旧动态（再至多 2 条）。
    // 旧动态上的点赞/评论可能是刚发生的，对方一直记得——不能因动态天数超窗就把互动痕迹丢掉；
    // 没 pt 的旧数据只要机主互动过也走这条通道进摘要
    momentsNoteFor: function (name, snap) {
      var W = window.LZJM;
      var mToday = snap && snap.dateText;
      if (!mToday) return '';
      var myName0 = this.userName();
      var mfeed = W.Store.history(this.momentsKey);
      var ba = this.ptParts(mToday);
      var recent = [], touchedOld = [];
      mfeed.forEach(function (e2) {
        if (e2.who !== name) return;
        var ea = this.ptParts(e2.pt);
        var dd = (ea && ba) ? this.dayDiff(ea, ba) : null;
        var touched = (e2.likes || []).indexOf(myName0) !== -1 ||
          (e2.comments || []).some(function (cm) { return cm.who === myName0; });
        if (dd !== null && dd >= 0 && dd <= 3) recent.push(e2);
        else if (touched) touchedOld.push(e2);
      }, this);
      var picked = recent.slice(-3).map(function (e2) { return { e: e2, old: false }; });
      touchedOld.slice(-2).forEach(function (e2) {
        if (!picked.some(function (p) { return p.e === e2; })) picked.push({ e: e2, old: true });
      });
      return picked.map(function (p) {
        var e2 = p.e;
        var bits = [];
        if ((e2.likes || []).indexOf(myName0) !== -1) bits.push('点了赞');
        (e2.comments || []).forEach(function (cm) { if (cm.who === myName0) bits.push('评论「' + cm.text + '」'); });
        var when = this.ptShort(e2.pt);
        return (when ? when + ' ' : '') + '动态「' + String(e2.text).slice(0, 30) + '」' +
          (bits.length
            ? '，机主' + (p.old ? '刚' + bits.join('、') + '（互动是刚发生的，动态是几天前的）' : bits.join('、'))
            : '（机主还没互动）');
      }, this).join('\n');
    },
    // 机主自己近 3 天的动态 + 各条谁赞了/评论了——私聊里"对方刷到过机主朋友圈"的上下文，
    // 让 NPC 能主动提起、接梗、吐槽机主发的东西
    myMomentsNote: function (snap) {
      var W = window.LZJM;
      var mToday = snap && snap.dateText;
      if (!mToday) return '';
      var myName0 = this.userName();
      var ba = this.ptParts(mToday);
      var mine = W.Store.history(this.momentsKey).filter(function (e2) {
        if (e2.who !== myName0) return false;
        var ea = this.ptParts(e2.pt);
        var dd = (ea && ba) ? this.dayDiff(ea, ba) : null;
        return dd !== null && dd >= 0 && dd <= 3;
      }, this).slice(-3);
      if (!mine.length) return '';
      return mine.map(function (e2) {
        var bits = [];
        (e2.likes || []).forEach(function (n) { bits.push(n + ' 赞了'); });
        (e2.comments || []).forEach(function (cm) { bits.push(cm.who + ' 评论「' + cm.text + '」'); });
        var when = this.ptShort(e2.pt);
        return (when ? when + ' ' : '') + '机主发了「' + String(e2.text).slice(0, 30) + '」' +
          (bits.length ? '，' + bits.join('、') : '（还没人互动）');
      }, this).join('\n');
    },

    // 把 AI 写的 [时间:] 行归一化成 'YYYY年M月D日 HH:MM'；解析失败 / 晚于快照时刻 → null（走兜底）
    // 年份取快照年；月日比快照还靠后视为去年的事；只写了时刻没写月日当兜底失败（信息不足不瞎编日期）
    normMomentTime: function (raw, snap) {
      var m = /(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*[:：时]\s*(\d{1,2})/.exec(String(raw || ''));
      if (!m) return null;
      var mo = +m[1], d = +m[2], hh = +m[3], mm = +m[4];
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
      var sy = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec((snap && snap.dateText) || '');
      if (!sy) return null;
      var y = +sy[1], smo = +sy[2], sd = +sy[3];
      if (mo > smo || (mo === smo && d > sd)) y -= 1;
      if (y === +sy[1] && mo === smo && d === sd) {
        var st = /(\d{1,2}):(\d{2})/.exec((snap && snap.time) || '');
        if (st && (hh > +st[1] || (hh === +st[1] && mm > +st[2]))) return null;
      }
      return y + '年' + mo + '月' + d + '日 ' + ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2);
    },

    parseMomentsReplies: function (text) {
      var out = [];
      String(text || '').split('\n').forEach(function (line) {
        line = line.trim();
        var m = line.match(/^\[评论:([^:：@\]]{1,12})(?:@([^:：\]]{1,12}))?[:：]([\s\S]+)\]$/);
        if (m) out.push({ who: m[1].trim(), replyTo: m[2] ? m[2].trim() : '', text: m[3].trim() });
      });
      return out.slice(0, 5);
    },

    // 首次填充：抽 3~4 位联系人/群成员，各写一条动态（日期散在"今天/昨天/前几天"）
    // 状态栏日期缺失时按无日期兜底生成一次（filledDay 记哨兵，日期恢复后自然重生成）
    momentsEnsure: async function () {
      var W = window.LZJM;
      var snap; try { snap = W.Status.snapshot(null); } catch (e) {}
      var today = (snap && snap.dateText) || '__nodate__';
      var key = this.momentsKey;
      // 快照时刻（合成时间的上限）：状态栏 7 点就不会冒出「今天 12:xx」
      var sb = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec((snap && snap.dateText) || '');
      var st0 = /(\d{1,2}):(\d{2})/.exec((snap && snap.time) || '');
      var cur = sb ? new Date(+sb[1], +sb[2] - 1, +sb[3], st0 ? +st0[1] : 23, st0 ? +st0[2] : 59) : null;
      // 存量回补：时间体系上线前的旧动态没有 pt，按「数组顺序=时间顺序」从尾部往前补——
      // 每条比后一条再早 30~120 分钟，已有 pt 的条目把游标带到它那刻；全部不超过快照时刻。
      // 放在 filledDay 早退之前，否则旧数据永远没有补上 pt 的机会
      if (cur) {
        var exist = W.Store.history(key);
        var cursor = cur.getTime();
        for (var bi = exist.length - 1; bi >= 0; bi--) {
          var be = exist[bi];
          if (be.pt) {
            var bm = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/.exec(be.pt);
            if (bm) cursor = Math.min(cursor, new Date(+bm[1], +bm[2] - 1, +bm[3], +bm[4], +bm[5]).getTime());
            continue;
          }
          cursor -= (30 + (parseInt(hashStr(String(be.who) + String(be.text)), 36) % 90)) * 60000;
          var bdt = new Date(cursor);
          W.Store.patchAt(key, bi, { pt: bdt.getFullYear() + '年' + (bdt.getMonth() + 1) + '月' + bdt.getDate() + '日 ' +
            ('0' + bdt.getHours()).slice(-2) + ':' + ('0' + bdt.getMinutes()).slice(-2) });
        }
      }
      if (W.Store.meta(key).filledDay === today) return false;
      var sec = this.section(); if (!sec) return false;
      var pool = [], seen = {};
      (sec.contacts || []).forEach(function (c) { if (c.name && !seen[c.name]) { seen[c.name] = 1; pool.push(c.name); } });
      (sec.groups || []).forEach(function (g) {
        (g.members || []).forEach(function (n) { if (n && !seen[n]) { seen[n] = 1; pool.push(n); } });
      });
      // hashStr 返回 base36 字符串，算数前必须 parseInt（直接 % 得 NaN，want 变 NaN 一条都抽不出）
      var want = Math.min(pool.length, 3 + (parseInt(hashStr(today), 36) % 2)); // 3~4 位
      var picks = [];
      while (picks.length < want && pool.length) {
        var i = parseInt(hashStr(today + ':' + picks.length + ':' + pool.length), 36) % pool.length;
        picks.push(pool.splice(i, 1)[0]);
      }
      if (!picks.length) return false;
      var people = picks.map(function (n) { return { name: n, profile: this.profileFor(n) }; }, this);
      var req = W.Prompt.momentsFill(people, snap, this.userBlock());
      var raw = await this.gen(req);
      var text = (typeof raw === 'string') ? raw : String((raw && (raw.text || raw.message)) || '');
      var posts = this.parseMoments(text);
      if (!posts.length) throw new Error('朋友圈生成结果为空');
      // 动态自身时间 pt：优先 AI 的 [时间:] 行（归一化、不得晚于快照时刻）；
      // 缺省按快照时刻往前 hash 散布（最新 0~90 分钟前，更早的逐条再退 2~8 小时）——
      // 伪造钟点绝不越过「现在」：状态栏 7 点就不会冒出「今天 12:xx」的动态
      for (var pi = posts.length - 1; pi >= 0; pi--) {
        var pt = posts[pi].ptRaw ? this.normMomentTime(posts[pi].ptRaw, snap) : null;
        if (!pt && cur) {
          var h = parseInt(hashStr(posts[pi].who + posts[pi].text), 36);
          var back = pi === posts.length - 1 ? h % 90 : 120 + (h % 360);
          var dt = new Date(cur.getTime() - back * 60000);
          pt = dt.getFullYear() + '年' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日 ' +
            ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2);
        }
        posts[pi].pt = pt || '';
        delete posts[pi].ptRaw;
      }
      var entries = posts.map(function (p) {
        return { who: p.who, text: p.text, img: p.img || '', pt: p.pt || '', label: '', likes: p.likes || [], comments: p.comments || [] };
      });
      W.Store.push(key, entries, 100);
      W.Store.setMeta(key, { filledDay: today });
      return true;
    },

    // 机主点赞：纯本地往返，不调 API
    momentsLike: function (index) {
      var W = window.LZJM, key = this.momentsKey;
      var entry = W.Store.history(key)[index];
      if (!entry) return false;
      var myName = this.userName();
      var likes = (entry.likes || []).slice();
      var i = likes.indexOf(myName);
      if (i === -1) likes.push(myName); else likes.splice(i, 1);
      W.Store.patchAt(key, index, { likes: likes });
      return i === -1;
    },

    // 机主评论：先落库，再生成的 0~3 条接话追加进同一条；不在朋友圈页时未读红点挂发现
    momentsComment: async function (index, userSays) {
      var W = window.LZJM, key = this.momentsKey;
      var entry = W.Store.history(key)[index];
      userSays = String(userSays || '').trim();
      if (!entry || !userSays) return [];
      var myName = this.userName();
      var comments = (entry.comments || []).concat([{ who: myName, replyTo: '', text: userSays }]);
      W.Store.patchAt(key, index, { comments: comments });
      var involved = [], iv = {};
      [entry.who].concat(comments.map(function (c) { return c.who; })).forEach(function (n) {
        if (n && n !== myName && !iv[n]) { iv[n] = 1; involved.push(n); }
      });
      var replies = [];
      try {
        var snap; try { snap = W.Status.snapshot(null); } catch (e) {}
        var people = involved.map(function (n) { return { name: n, profile: this.profileFor(n) }; }, this);
        var req = W.Prompt.momentsReply({ who: entry.who, text: entry.text, img: entry.img, when: this.ptShort(entry.pt) }, comments, userSays, people, snap, this.userBlock());
        var raw = await this.gen(req);
        var text = (typeof raw === 'string') ? raw : String((raw && (raw.text || raw.message)) || '');
        replies = this.parseMomentsReplies(text);
      } catch (e) { console.warn('[霖州引擎] 朋友圈接话生成失败', e); }
      if (replies.length && this.sameMoment(key, index, entry)) {
        comments = comments.concat(replies);
        W.Store.patchAt(key, index, { comments: comments });
        try {
          var UI = W.Apps && W.Apps.wechat;
          if (!UI || UI.screen !== 'moments') W.Store.bumpUnread(key, replies.length);
        } catch (e) {}
      }
      return replies;
    },

    // 机主自己发朋友圈：纯本地落库，pt 取状态栏当下时刻（绝不越过「现在」）。
    // img = 配图画面临摹（文字描述，渲染成假装图片的灰框，与 NPC 动态的配图同理）
    momentsPost: function (text, img) {
      var W = window.LZJM;
      text = String(text || '').trim();
      if (!text) return -1;
      img = String(img || '').trim().slice(0, 60);
      var snap; try { snap = W.Status.snapshot(null); } catch (e) {}
      var d = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec((snap && snap.dateText) || '');
      var t = /(\d{1,2}):(\d{2})/.exec((snap && snap.time) || '');
      var pt = d
        ? d[1] + '年' + (+d[2]) + '月' + (+d[3]) + '日 ' + (t ? t[0] : '')
        : '';
      var idx = W.Store.history(this.momentsKey).length;
      W.Store.push(this.momentsKey, [{ who: this.userName(), text: text, img: img, pt: pt, label: '', likes: [], comments: [] }], 100);
      return idx;
    },

    // 机主删除自己的动态：整条移除，个人主页时间轴同源一起消失。
    // 只许删自己的；发现 tab 的未读累计与单条动态无关，不动
    momentsDelete: function (index) {
      var W = window.LZJM, key = this.momentsKey;
      var entry = W.Store.history(key)[index];
      if (!entry || entry.who !== this.userName()) return false;
      return W.Store.removeAt(key, index);
    },

    // 异步生成落地前的条目校验：机主可能已经把那条动态删了（或有别的写入让下标移位），
    // 只认 who+text 不认下标，免得赞/评论贴到别人动态上
    sameMoment: function (key, index, entry) {
      var cur = window.LZJM.Store.history(key)[index];
      return !!cur && cur.who === entry.who && cur.text === entry.text;
    },

    // 机主发出的转账在对方回复生成成功后批量翻「已收款」（双方视角同源，同帧生效）。
    // 生成失败不翻——对方还没收，下次成功自然补上
    markTransfersAccepted: function (key) {
      var W = window.LZJM, h = W.Store.history(key), n = 0;
      for (var i = 0; i < h.length; i++) {
        var m = h[i];
        if (m && m.who === 'user' && m.kind === 'transfer' && m.state === 'waiting') {
          W.Store.patchAt(key, i, { state: 'accepted' });
          n++;
        }
      }
      return n;
    },

    // 机主对待收款转账的处置（收下/退还）随小飞机发出即生效：按 发送方+金额+备注 定位待收款卡就地翻转。
    // 找不到对应卡（已删/已翻过）也照常——记录行本身已进上下文，AI 下一轮照样知情
    verdictTransfer: function (key, verdict, sender, amount, note) {
      var W = window.LZJM, h = W.Store.history(key);
      for (var i = 0; i < h.length; i++) {
        var m = h[i];
        if (m && m.who === sender && m.kind === 'transfer' && m.state === 'waiting'
          && m.amount === amount && (m.note || '') === (note || '')) {
          W.Store.patchAt(key, i, { state: verdict });
          return true;
        }
      }
      return false;
    },

    // NPC 输出 [拒收转账] 契约并生成成功：把机主对应待收款卡翻「已退还」。
    // 调用须先于 markTransfersAccepted——显式拒收优先于「回复即收款」的默认推断
    applyNpcDeclines: function (key) {
      var W = window.LZJM, h = W.Store.history(key), n = 0;
      for (var i = 0; i < h.length; i++) {
        var m = h[i];
        if (m && m.who !== 'user' && m.kind === 'tdecline') {
          if (this.verdictTransfer(key, 'declined', 'user', m.amount, m.note)) n++;
        }
      }
      return n;
    },

    // 机主点收 NPC 发来的转账：只许收对方发的、待收款的（收款弹窗走待发区后此接口仅留作校验用）
    acceptTransfer: function (key, idx) {
      var W = window.LZJM;
      var m = W.Store.history(key)[idx];
      if (!m || m.who === 'user' || m.kind !== 'transfer' || m.state !== 'waiting') return false;
      W.Store.patchAt(key, idx, { state: 'accepted' });
      return true;
    },

    // 朋友们对机主动态的反应：点赞 + 评论各生成一轮（异步，失败只 warn 不打扰机主）。
    // 机主在 moments 屏且没正在输入评论时直接重渲染；否则累计未读挂发现 tab
    momentsReact: async function (index) {
      var W = window.LZJM, key = this.momentsKey;
      var entry = W.Store.history(key)[index];
      if (!entry) return;
      var myName = this.userName();
      var sec = this.section(); if (!sec) return;
      var pool = [], seen = {};
      (sec.contacts || []).forEach(function (c) { if (c.name && c.name !== myName && !seen[c.name]) { seen[c.name] = 1; pool.push(c.name); } });
      (sec.groups || []).forEach(function (g) {
        (g.members || []).forEach(function (n) { if (n && n !== myName && !seen[n]) { seen[n] = 1; pool.push(n); } });
      });
      if (!pool.length) return;
      var snap; try { snap = W.Status.snapshot(null); } catch (e) {}
      // 反应要接得住正在发生的梗：当天私聊（合计至多 20 行）+ 群聊（合计至多 30 行），
      // 主线近况在 prompt 侧；发动态是一次性小生成，多带上下文不心疼 token
      var privLines = [], grpLines = [];
      try {
        var day0 = snap && snap.dateText;
        if (day0) {
          pool.forEach(function (n) {
            var h = W.Store.history(n);
            if (!h.length || h[h.length - 1].day !== day0) return;
            h.slice(-6).forEach(function (m) {
              privLines.push(n + '：' + String(m.text || '').slice(0, 40));
            });
          });
          (sec.groups || []).forEach(function (g) {
            var gh = W.Store.history('group:' + g.name);
            if (!gh.length || gh[gh.length - 1].day !== day0) return;
            gh.slice(-10).forEach(function (m) {
              grpLines.push('群「' + g.name + '」· ' + (m.who === 'user' ? myName : m.who) + '：' + String(m.text || '').slice(0, 40));
            });
          });
        }
      } catch (e) {}
      var recentPriv = privLines.slice(-20).join('\n');
      var recentGrp = grpLines.slice(-30).join('\n');
      var likes = [], comments = [];
      try {
        var people = pool.map(function (n) { return { name: n, profile: this.profileFor(n) }; }, this);
        var req = W.Prompt.momentsReact({ who: entry.who, text: entry.text, img: entry.img, when: this.ptShort(entry.pt) }, people, snap, this.userBlock(), recentPriv, recentGrp);
        var raw = await this.gen(req);
        var text = (typeof raw === 'string') ? raw : String((raw && (raw.text || raw.message)) || '');
        var parsed = this.parseMomentReacts(text, myName);
        likes = parsed.likes; comments = parsed.comments;
      } catch (e) { console.warn('[霖州引擎] 朋友圈回应生成失败', e); }
      if (!likes.length && !comments.length) return;
      if (!this.sameMoment(key, index, entry)) return; // 生成期间被删/下标移位：认条目不认下标
      var entry2 = W.Store.history(key)[index];
      if (!entry2) return;
      var newLikes = (entry2.likes || []).slice();
      likes.forEach(function (n) { if (newLikes.indexOf(n) === -1) newLikes.push(n); });
      newLikes = newLikes.slice(0, 8);
      var newComments = (entry2.comments || []).concat(comments).slice(0, 5);
      W.Store.patchAt(key, index, { likes: newLikes, comments: newComments });
      try {
        var UI = W.Apps && W.Apps.wechat;
        if (UI && UI.screen === 'moments' && UI.mCmt == null) UI.render();
        else W.Store.bumpUnread(key, likes.length + comments.length);
      } catch (e) {}
    },

    // 解析朋友们对机主动态的反应：[赞:名字] / [评论:名字:内容]；
    // 剔除机主自己与重复人名，各封顶 5（评论满 5 条后接话的传统从 momentsFill 沿用）
    parseMomentReacts: function (text, myName) {
      var likes = [], comments = [], used = {};
      if (myName) used[myName] = 1;
      String(text || '').split('\n').forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var lk = line.match(/^\[赞[:：]([^:：\]]{1,12})\]$/);
        if (lk) {
          var ln = lk[1].trim();
          if (ln && !used[ln] && likes.length < 5) { used[ln] = 1; likes.push(ln); }
          return;
        }
        var cm = line.match(/^\[评论[:：]([^:：@\]]{1,12})(?:@([^:：\]]{1,12}))?[:：]([\s\S]+)\]$/);
        if (cm) {
          var w = cm[1].trim();
          if (w && !used[w] && comments.length < 5) {
            used[w] = 1;
            comments.push({ who: w, replyTo: cm[2] ? cm[2].trim() : '', text: cm[3].trim() });
          }
        }
      });
      return { likes: likes, comments: comments };
    },



    // ── 语音/视频通话 ──
    // transcript 存 Store key「call:名字」，与聊天记录平级的一级历史：
    // 挂断时把时长写进私聊系统条目，跨场景/摘要/红点管道全部现成可用。
    // 拨打流程：呼叫页（等 AI）→ AI 以 [拒绝] 开头 = 拒接回聊天页；否则开场白
    // 进 transcript 直接接通。通话轮 = 「机主说一句 → 对方回台词」循环。
    callKey: function (name) { return 'call:' + name; },

    // 拨打邀请：AI 决定接/拒
    callInvite: async function (name, mode) {
      var W = window.LZJM;
      var c = this.findContact(name);
      if (!c) throw new Error('联系人不在本线通讯录：' + name);
      var profile = this.profileFor(name);
      var snap = W.Status.snapshot(name);
      var userInfo = this.userBlock();
      var req = W.Prompt.callInvite({ name: c.name, profile: profile }, W.Store.history(name).slice(-30), snap, userInfo, mode,
        this.crossGroups(c.name, snap && snap.dateText));
      var raw = await this.gen(req);
      var text = (typeof raw === 'string') ? raw : String((raw && (raw.text || raw.message)) || '');
      return text.trim();
    },

    // 通话输出拆分（保序，视频用）：逐行扫描，[画面] 行是画面条目，其余是台词，
    // 按出现顺序交织返回——说到哪演到哪，画面不堆在开头。
    // 兼容旧格式：[画面] 行后未写完的续行一直收到单独一行的 --- 为止。
    splitCallOutput: function (text) {
      var entries = [];
      var sceneBuf = null;
      String(text || '').split('\n').forEach(function (raw) {
        var ln = raw.trim();
        if (!ln) return;
        if (/^-{3,}\s*$/.test(ln)) { // 分隔线：旧格式的画面块到此闭合落档
          if (sceneBuf) { entries.push({ kind: 'scene', text: sceneBuf }); sceneBuf = null; }
          return;
        }
        var m = ln.match(/^\[画面\]\s*(.*)$/);
        if (m) {
          if (m[1]) { entries.push({ kind: 'scene', text: m[1] }); sceneBuf = null; }
          else sceneBuf = ''; // 空标记行：后续续行进画面块，直到 --- 或下一行 [画面]
          return;
        }
        if (sceneBuf != null) { sceneBuf = sceneBuf ? sceneBuf + '\n' + ln : ln; return; }
        entries.push({ kind: 'line', text: ln });
      });
      if (sceneBuf) entries.push({ kind: 'scene', text: sceneBuf });
      return entries;
    },

    callTurn: async function (name, mode, userSays) {
      var W = window.LZJM;
      var c = this.findContact(name);
      if (!c) throw new Error('联系人不在本线通讯录：' + name);
      var profile = this.profileFor(name);
      var snap = W.Status.snapshot(name);
      var userInfo = this.userBlock();
      var hist = W.Store.history(this.callKey(name));
      var tail = [];
      for (var i = Math.max(0, hist.length - 30); i < hist.length; i++) {
        var m = hist[i];
        if (m.who === 'sys') continue;
        tail.push(m);
      }
      // 机主本轮说的话已由 user 角色消息单独携带——transcript 里去掉尾部连续的机主条目，
      // 避免同一句在提示词里出现两次（userSays 为空 = 重说轮，机主的话是上下文，必须保留）
      if (userSays) while (tail.length && tail[tail.length - 1].who === 'user') tail.pop();
      var lines = tail.map(function (m2) { return W.Floor.msgToLine(m2, this.userName()); }, this);
      var req = W.Prompt.callTurn({ name: c.name, profile: profile }, lines.join('\n'), W.Store.history(name).slice(-20), snap, userInfo, mode,
        this.crossGroups(c.name, snap && snap.dateText), userSays || '');
      var raw = await this.gen(req);
      var text = (typeof raw === 'string') ? raw : String((raw && (raw.text || raw.message)) || '');
      // 剥注释块防污染（极端情况：AI 在通话里输出主动块）
      text = text.replace(/<!--" + BS + "s*phone" + BS + "s*([" + BS + "s" + BS + "S]*?)-->/gi, '');
      // 视频通话拆成保序条目流：[画面] 行与台词行按出现顺序交织（音频永远无画面）
      var entries = [];
      if (mode === 'video') {
        this.splitCallOutput(text).slice(0, 16).forEach(function (en) { entries.push(en); });
      } else {
        text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 12)
          .forEach(function (l) { entries.push({ kind: 'line', text: l }); });
      }
      return { entries: entries };
    },

    // ── QR 栏按钮：运行时注入，不落酒馆设置 ──
    // 直接往父页 #qr--bar 注两个原生样式按钮（div.qr--button.menu_button），
    // 酒馆的 QR 列表里看不到它们，也不随设置持久化；脚本关闭/沙盒销毁（pagehide）
    // 即随之消失，别的角色卡上不会再有死按钮。QR 栏重绘会清掉外来节点，用轮询兜底。
    // 按钮直挂 #qr--bar（不经包裹层，避免被 flex-wrap 顶成独立一行）；古代线只留世界线。
    _qrBtns: null,
    _qrTimer: null,
    injectQr: function () {
      var self = this;
      var W = window.LZJM;
      try {
        var doc = window.parent.document;
        var mkBtn = function (label, title, fn) {
          var b = doc.createElement('div');
          b.className = 'qr--button menu_button lzjm-qr';
          b.title = title;
          b.style.flex = '0 0 auto';
          var t = doc.createElement('div');
          t.className = 'qr--button-label';
          t.textContent = label;
          b.appendChild(t);
          b.addEventListener('click', fn);
          return b;
        };
        var ensure = function () {
          try {
            var bar = doc.getElementById('qr--bar');
            if (!bar) return;
            // 挂载点 = 最后一个原生 QR 按钮的父级：combined/非 combined、有无内层
            // 容器、版本差异全都不用猜，原生按钮排得进一行，我们就跟得上
            var natives = bar.querySelectorAll('.qr--button:not(.lzjm-qr)');
            var holder = (natives.length ? natives[natives.length - 1].parentNode : null) || bar.querySelector('.qr--buttons') || bar;
            // 一次性结构日志（排查换行/挂载问题用，F12 控制台可见）
            if (!self._qrLogged) {
              self._qrLogged = true;
              try {
                var cs = window.parent.getComputedStyle(holder);
                console.log('[霖州引擎] QR 挂载点 class=' + holder.className +
                  ' disp=' + cs.display + ' wrap=' + cs.flexWrap + ' w=' + holder.offsetWidth +
                  ' / bar w=' + bar.offsetWidth + ' / 原生按钮数=' + natives.length);
              } catch (e9) {}
            }
            // 古代线（无手机世界线）不显示手机按钮，只留世界线入口（靠它切回现代线）
            var wantPhone = !!W.Engine.section();
            var alive = !!(self._qrBtns && self._qrBtns.length && self._qrBtns.every(function (b) { return b.parentNode === holder; }));
            if (alive && (self._qrBtns.length === 2) === wantPhone) return;
            if (self._qrBtns) self._qrBtns.forEach(function (b) { if (b.parentNode) b.remove(); });
            var btns = [mkBtn('\uD83E\uDDED世界线', '切换 IF 世界线（五条线选一，代劳开关世界书并记入本聊天）', function () { W.Engine.qrLines(); })];
            if (wantPhone) btns.unshift(mkBtn('\uD83D\uDCF1手机', '霖州·数字世界（再点一次关闭）', function () { W.Engine.qrToggle(); }));
            btns.forEach(function (b) { holder.appendChild(b); });
            self._qrBtns = btns;
          } catch (e0) {}
        };
        ensure();
        if (self._qrTimer) clearInterval(self._qrTimer);
        self._qrTimer = setInterval(ensure, 1500);
        window.addEventListener('pagehide', function () {
          try { clearInterval(self._qrTimer); } catch (e1) {}
          try { if (self._qrBtns) self._qrBtns.forEach(function (b) { if (b.parentNode) b.remove(); }); } catch (e2) {}
        });
      } catch (e) {
        console.warn('[霖州引擎] QR 栏注入失败（不影响手机本体，可手动建QR按钮，命令：/event-emit event="lzjm-phone-toggle"）', e);
      }
    },

    // 旧版持久化按钮集「霖州手机」一次性自清：里面只有我们装过的两个按钮才动它
    // （用户往里加过自定义按钮则保留），取消全局并删除，改由运行时注入接班。
    uninstallLegacyQr: function () {
      var SET = '霖州手机';
      try {
        var api = window.parent.quickReplyApi;
        if (!api || typeof api.listSets !== 'function') return;
        if (api.listSets().indexOf(SET) === -1) return;
        var labels = api.listQuickReplies(SET) || [];
        var ours = { '\uD83D\uDCF1 手机': 1, '\uD83E\uDDED 世界线': 1 };
        var onlyOurs = labels.length > 0 && labels.every(function (l) { return ours[l]; });
        if (!onlyOurs) return;
        try { api.removeGlobalSet(SET); } catch (e0) {}
        try { var r = api.deleteSet(SET); if (r && typeof r.catch === 'function') r.catch(function () {}); } catch (e1) {}
        console.log('[霖州引擎] 已清理旧版持久化 QR 按钮集「霖州手机」（改为运行时注入）');
      } catch (e) {}
    },

    // QR 按钮行为（注入按钮与 /event-emit 事件监听共用）
    qrToggle: async function () {
      await this.refreshStates();
      this.locateLine(true);
      var ui = window.LZJM.Apps.wechat;
      if (!this.section()) {
        try { toastr.info('当前世界线没有手机（古代线或未定位）', '\uD83D\uDCF1 霖州引擎'); } catch (e) {}
        return;
      }
      ui.inject();
      ui.toggle();
    },
    qrLines: async function () {
      await this.refreshStates();
      window.LZJM.Apps.wechat.showLines();
    },

    // ── 启动 ──
    init: async function () {
      var W = window.LZJM;
      W.IMG_BASE = IMG_BASE;

      await this.load();

      this.locateLine();
      this.uninstallLegacyQr();
      this.injectQr();
      try { W.Floor.renderAll(); } catch (e) {}

      // 快捷回复入口：QR 按钮命令 /event-emit event="lzjm-phone-toggle"
      // （QR 栏注入按钮与手动 QR 按钮同走 qrToggle/qrLines 两个方法）
      try { on('lzjm-phone-toggle', function () { Engine.qrToggle(); }); } catch (e) {}
      try { on('lzjm-line-switch', function () { Engine.qrLines(); }); } catch (e) {}

      // 世界书激活广播 → 世界线定位（每次主对话生成后触发）
      try {
        on(tavern_events.WORLD_INFO_ACTIVATED, function (entries) {
          Engine.setLineByEntries(entries);
        });
      } catch (e) {}

      // 正文生成前：注入手机动态（一行近况/会话，绝不带原始记录）
      try {
        on(tavern_events.GENERATION_AFTER_COMMANDS, function () {
          Engine.injectDigest();
        });
      } catch (e) {}

      // 正文生成完成 → 捕捉末位 <!--phone--> 主动消息注释块（只扫最后几楼，id 查重防重）
      try {
        var genDone = (typeof tavern_events !== 'undefined' && tavern_events.GENERATION_ENDED) || 'generation_ended';
        on(genDone, function () { Engine.sweepPhoneBlocks(5); });
      } catch (e) {}

      // 切聊天 → 重载（聊天变量随卡切换，需重新渲染）
      var reinitTimer = null;
      try {
        on(tavern_events.CHAT_CHANGED, function () {
          clearTimeout(reinitTimer);
          reinitTimer = setTimeout(async function () {
            await Engine.refreshStates();
            Engine.locateLine(); // 切聊天只定显示不落记录（开场白可能在这之后才选线）
            Engine.syncMount();
            try { W.Floor.renderAll(); } catch (e) {}
            var UI = W.Apps.wechat;
            if (UI.screen) { UI.screen = 'home'; UI.render(); }
          }, 400);
        });
      } catch (e) {}

      console.log('[霖州引擎] 初始化完成');
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Engine = Engine;

  // 启动
  Engine.init().catch(function (e) {
    console.warn('[霖州引擎] 初始化失败', e);
    try { toastr.error('引擎初始化失败：' + (e && e.message || e), '📱 霖州引擎'); } catch (e2) {}
  });
})();

