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
        // 残留清除（无条件，最先执行）：上一轮的注入若因任何原因没被摘除，
        // 必须在本轮prompt组装前清掉——否则会作为"上一条roll的快照"骑进本轮请求。
        try {
          var stc = window.parent.SillyTavern && window.parent.SillyTavern.getContext && window.parent.SillyTavern.getContext();
          if (stc && stc.extensionPrompts && stc.extensionPrompts['lzjm-phone-digest']) {
            delete stc.extensionPrompts['lzjm-phone-digest'];
            console.log('[霖州引擎] 注入诊断：已清除上一轮残留注入');
          }
        } catch (e) {}
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
        // ── 诊断：生成起点全量实况（排查"已删消息仍被注入"）──
        // A. 注入区残留检测：我们key下的旧值（每次注前应先无）
        // B. 聊天明文载体检测：哪条楼层的消息文本里明文含着[手机近况]（旧块若混在消息内容里，此处现形）
        try {
          var msgsNow = getChatMessages('0-{{lastMessageId}}');
          var tail = msgsNow.slice(-2)
            .map(function (m) { return (m && (m.role || '?')) + ':' + String((m && m.name) || '').slice(0, 10); });
          var carriers = [];
          for (var mi = 0; mi < msgsNow.length; mi++) {
            var mt = String((msgsNow[mi] && msgsNow[mi].message) || '');
            if (mt.indexOf('手机近况') !== -1) {
              carriers.push('#' + mi + '(' + (msgsNow[mi].role || '?') + ',swipe' + (msgsNow[mi].swipe_id || 0) + ')');
            }
          }
          if (carriers.length) {
            console.log('[霖州引擎] ⚠载体检测：聊天记录中明文含[手机近况]的楼层 → ' + carriers.join(' '));
          }
          var st0 = window.parent.SillyTavern && window.parent.SillyTavern.getContext && window.parent.SillyTavern.getContext();
          var oldV = st0 && st0.extensionPrompts && st0.extensionPrompts['lzjm-phone-digest'];
          console.log('[霖州引擎] 注入诊断@' + now + '楼 | 记录库[' +
            keys.map(function (k) { return k + '=' + root.history(k).length; }).join(' ') + '] | 末尾: ' +
            tail.join(' ← ') + ' | 注入区残留: ' + (oldV ? ('⚠有 ' + JSON.stringify(oldV).slice(0, 120)) : '无'));
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
        // 注入位置（一行可切换）：
        //   'in_chat' = 正文记录旁（深度1，原方案；slash-runner injectPrompts）
        //   'prompt'  = prompt区（IN_PROMPT；最保守，in_chat 若再出幽灵改这里即可）
        // 块头无nonce（调试nonce仅进console）。
        var INJECT_POS = 'in_chat';
        var nonce = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
        var fullContent = '【手机近况 · 微信】' + myName + '近期在手机上聊过天（仅作背景，正文不必专门提及。角色可自然引用自己参与过的聊天——私聊只限对话双方、群聊只限群成员知情；不得说出自己不在场的私聊内容）：\n' + blocks.join('\n');
        var injected = false;
        if (INJECT_POS === 'in_chat') {
          try {
            uninjectPrompts(['lzjm-phone-digest']);
            injectPrompts([{
              id: 'lzjm-phone-digest',
              position: 'in_chat',
              depth: 1,   // 历史正文内部、最后一楼之上
              role: 'system',
              content: fullContent
            }], { once: true });
            injected = true;
          } catch (e) { console.warn('[霖州引擎] in_chat注入失败', e); }
        } else {
          try {
            var st = window.parent.SillyTavern;
            var ctx = st && st.getContext && st.getContext();
            if (ctx && typeof ctx.setExtensionPrompt === 'function') {
              if (ctx.extensionPrompts) delete ctx.extensionPrompts['lzjm-phone-digest'];
              ctx.setExtensionPrompt('lzjm-phone-digest', fullContent,
                0 /* IN_PROMPT */, 0, false, 0 /* role: system */);
              injected = true;
            }
          } catch (e) { console.warn('[霖州引擎] prompt区注入失败', e); }
        }
        console.log('[霖州引擎] 注入全文 nonce=' + nonce + ' 位置=' + INJECT_POS + ' >>>\n' + fullContent + '\n<<< 注入全文结束');
        console.log('[霖州引擎] 注入诊断@' + now + '楼 | ' + (injected ? '★注册注入 nonce=' + nonce : '★注入失败') + ' | ' + blocks.length + ' 块：' +
          cands.slice(0, injCfg().injMax).map(function (c) { return c.key + '(' + root.history(c.key).length + '条)'; }).join('、'));
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
        var clearInject = function () {
          // 两条注入通道都清：slash-runner 注册表 + ST 上下文注入区
          try { uninjectPrompts(['lzjm-phone-digest']); } catch (e) {}
          try {
            var ctx = window.parent.SillyTavern && window.parent.SillyTavern.getContext && window.parent.SillyTavern.getContext();
            if (ctx && ctx.extensionPrompts) delete ctx.extensionPrompts['lzjm-phone-digest'];
          } catch (e) {}
        };
        var genDone = (typeof tavern_events !== 'undefined' && tavern_events.GENERATION_ENDED) || 'generation_ended';
        on(genDone, function () {
          clearInject();
          Engine.sweepPhoneBlocks(5);
        });
        var genStopped = (typeof tavern_events !== 'undefined' && tavern_events.GENERATION_STOPPED) || 'generation_stopped';
        on(genStopped, clearInject);
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
