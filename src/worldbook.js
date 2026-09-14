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
