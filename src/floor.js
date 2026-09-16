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

  // 接收/拒收转账的参数可全省：空参返回空串占位，由引擎对到该发送方最近一笔待收款
  function parseTransferArgLoose(arg) {
    if (!String(arg || '').trim()) return { amount: '', note: '' };
    return parseTransferArg(arg);
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
        if (/^\[接收转账(?:[:：|｜]([^\]]*))?\]$/.test(body)) { // 整行：收下机主发来的转账（参数可省，对到最近一笔待收款）
          var am = body.match(/^\[接收转账(?:[:：|｜]([^\]]*))?\]$/);
          var at2 = am && parseTransferArgLoose(am[1]);
          if (at2) out.push({ who: who, kind: 'taccept', amount: at2.amount, note: at2.note, from: '', time: '' });
          return;
        }
        if (/^\[拒收转账(?:[:：|｜]([^\]]*))?\]$/.test(body)) { // 整行：拒收机主发来的转账（参数可省；显式拒绝优先于「回复即收款」的默认推断）
          var dm = body.match(/^\[拒收转账(?:[:：|｜]([^\]]*))?\]$/);
          var dt = dm && parseTransferArgLoose(dm[1]);
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
