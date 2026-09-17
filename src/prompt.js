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
    return { plotFloors: 8, plotCap: 900, histPriv: 50, histGroup: 50, crossMax: 3, crossLines: 18, injRecent: 8, injMention: 4, injMax: 3, injRounds: 20, diaryFloors: 100 };
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

  // ── 楼层清洗：去 HTML/状态栏/代码块/思考块，cap 截断（尽量落行边界）──
  //    mainContext 共用。cap<=0 表示不截断。
  function cleanFloor(m, cap) {
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
      // 结构化输出块：summary 摘要 / choice(s) 分支选项，只剥标签会留碎片，整段剔除。
      //    （聊天历史由 generateRaw 的 chat_history 槽位整体装配，与主生成同一管线，
      //      这些残片在日记指令里另行为 AI 声明用途。）
      .replace(/<summary>[\s\S]*?<\/summary>/gi, '')
      .replace(/<choices?>[\s\S]*?<\/choices?>/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
    if (cap > 0 && t.length > cap) {
      var cut = t.lastIndexOf('\n', cap);
      if (cut < cap * 0.5) cut = t.lastIndexOf('。', cap);
      if (cut < cap * 0.5) cut = cap;
      t = t.substring(0, cut) + '……（此楼后续从略）';
    }
    return t;
  }

  // ── 主线近况：最近 N 楼，每楼截断 ──
  function mainContext() {
    try {
      var msgs = getChatMessages('0-{{lastMessageId}}');
      if (!msgs || !msgs.length) return '';
      return msgs.slice(-cfg().plotFloors).map(function (m) {
        var t = cleanFloor(m, cfg().plotCap);
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
      '- [接收转账:金额:备注]  单独成行：收下机主发来的转账（金额备注可省；机主那边这笔转账将标记「已收款」）',
      '- [拒收转账:金额:备注]  单独成行：拒收机主发来的转账（金额备注可省；机主那边这笔转账将标记「已退还」）',
      '- 机主发来的转账：回复里没有 [拒收转账] 即视为已收下，无需特意声明',
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
    },

    // ── 备忘录：替某人写一篇手机备忘录（玩家跳出角色翻阅，文本限知）──
  // contact = {name, profile}；hist = 与机主的微信记录（选材回味用，可空数组）
  // usedDates = 已存在的备忘录日期（注入排除，防同日撞车覆盖旧篇）
  // shortRetry = 上一篇正文过短被驳回，带补强要求重试一轮
  diary: function (contact, hist, snapshot, userInfo, usedDates, shortRetry) {
    var myName = me();
    var p = [
      '# 虚构沙盒',
      '',
      FICTION,
      '',
      '# 数字世界 · 备忘录生成',
      '',
      '本次任务：以第一人称，替「' + contact.name + '」写一篇手机备忘录。它存在这个人的手机里，不打算给任何人看。读者（玩家）拥有翻阅权限——但文本必须是这个人私密的、限知的真实声音，不是全知旁白。',
      '',
      contact.profile ? '## 人物档案 · ' + contact.name + '\n' + contact.profile : '## 人物档案 · ' + contact.name + '\n（暂无档案，依据对话上下文自然演绎）',
      '',
      userInfo ? '## 机主资料 · ' + myName + '（备忘录里可能以真名出现）\n' + userInfo : '',
      '',
      situationBlock(snapshot) ? '## 当前情境\n' + situationBlock(snapshot) : '',
      '',
      (hist && hist.length)
        ? '## 与' + myName + '的微信记录（近 30 条，备忘录可以回味这里的事）\n' + histText(hist, 30, true, snapshot && snapshot.dateText)
        : '',
      '',
      '## 输出要求（严格遵守）',
      '- 格式（独占标记行，一字不改）：',
      '  第一行：※备忘录※|日期|标题',
      '  中间：正文（可多段）',
      '  最后一行：※完※',
      '- 日期：从当前时间往前 1~7 天内任选一天（不必是当天），格式 YYYY-MM-DD，不得晚于当前时间。',
      (usedDates && usedDates.length)
        ? '- **不可使用已存在的日期**：' + usedDates.join('、') + '（这些天已各有一篇，必须避开）'
        : '- 当前此人无已存在的备忘录日期。',
      '- 篇幅：正文不少于 500 字。写满，严禁提纲式缩写、严禁用「……（后略）」省字。',
      shortRetry ? '- ⚠ 上一篇正文过短被驳回：这次必须写足 500 字，宁可写多不可写少。' : '',
      '- 这是「' + contact.name + '」写给自己看、不打算给任何人看的东西。',
      '- 白天发生的事可以写、也值得回味——但写的是事情在 Ta 心里沉过之后的样子，不是新闻播报。主体永远是那些 Ta 没对任何人说出口的部分。',
      '- 分层写，按这个顺序推进：Ta 清楚知道、但从不对人提的事 → Ta 感觉到但不愿细想的事 → Ta 自己都没看懂的事。第三层只呈现、不解释。',
      '- 用具体的生活细节落地——写什么物件取决于这个人是谁（工具、账本、药盒、车库、课桌都算）。禁止空洞抒情（"生活如此艰难"这类句子一律不要）。',
      '- **关系亲疏以聊天记录为准**：上方记录藏着' + contact.name + '与' + myName + '一路走到哪一步——哪怕最近几楼对方没出场，那些旧事同样是已发生的事实，备忘录里的熟稔程度、信任深度、说话分寸都必须符合这份积累，严禁写得像刚认识。',
      '- 记录中若出现 <summary>…</summary> 残片：那是该楼剧情的提要，可作参考，不是任何人物说的话，严禁写进备忘录正文。',
      '- 时间线锚定已发生的剧情，可以引用、回想、甚至曲解白天的事——尤其是 Ta 对 ' + myName + ' 相关事件的私人解读（若 ' + myName + ' 近期没出场，也允许完全不提，但提起来就必须是旧知的口气）。',
      '- 文体是备忘录：允许不完整句、允许戛然而止、允许只有一段。但整体要有小作文的完成度——读完像窥见了一页真实的人生。',
      '- 严禁：本人不知道的任何信息（包括 ' + myName + ' 的真实想法与内心）、对未来的预言式感叹、总结中心思想、任何元叙述（"作为……""本章……"）。',
      '- ※完※ 之后不再输出任何文字。'
    ].filter(function (s) { return s !== ''; }).join('\n');

    // 聊天记录不走自拼：ordered_prompts 里放标准 'chat_history' 槽位，由 generateRaw
    // 按主生成同一管线装配（隐藏楼排除、IN_CHAT 深档注入按 depth 置顶、宏替换齐全），
    // max_chat_history 控制带最近几楼（设置项 diaryFloors）。
    return {
      ordered_prompts: [
        { role: 'system', content: p },
        'chat_history',
        { role: 'user', content: '（现在请严格按上方输出要求，输出一篇「' + contact.name + '」的备忘录。只输出标记行、正文与结束标记本身。）' }
      ],
      should_silence: true,
      max_chat_history: cfg().diaryFloors
    };
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Prompt = Prompt;
})();
