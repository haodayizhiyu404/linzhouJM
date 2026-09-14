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
