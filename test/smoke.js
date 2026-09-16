// smoke.js —— 数据层离线冒烟测试（node test/smoke.js）
// 只测纯逻辑：状态栏解析 / 记录块往返 / NPC输出解析 / 提示词装配 / 转账契约 / 注入保险丝
// 移植自霖州往事同款套件：LZJM 命名空间 + 霖州蒋默:: 世界书前缀 + DLC 线名（无论坛app）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const __vars = {};
const ctx = {
  window: {},
  console,
  getChatMessages: (range) => { global.__lastRange = range; return global.__msgs || []; },
  getVariables: () => __vars,
  replaceVariables: (v) => { const snap = JSON.parse(JSON.stringify(v)); for (const k of Object.keys(__vars)) delete __vars[k]; Object.assign(__vars, snap); },
};
vm.createContext(ctx);
for (const f of ['src/store.js', 'src/status.js', 'src/worldbook.js', 'src/prompt.js', 'src/floor.js', 'src/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const LW = ctx.window.LZJM;
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n    got  ' + g + '\n    want ' + w); }
}

// ── 1. 状态栏解析 ──
console.log('[状态栏]');
const statusText = `<status>

<环境>
2034年8月26日 星期五|22:49|天禧城3幢901室|阴
</环境>

<沈锡元>
着装：黑色圆领薄棉T
姿态：靠在车边单手夹烟
位置：霖州城南门外
关系：克制内敛的青梅竹马，尚未告白
心声：“到了也不放个屁。”
</沈锡元>

</status>`;
const p = LW._parseStatusBlock(statusText);
eq('时间', p.time, '22:49');
eq('日期文本', p.dateText, '2034年8月26日 星期五');
eq('user地点', p.userPlace, '天禧城3幢901室');
eq('NPC位置', p.characters['沈锡元'].place, '霖州城南门外');
eq('NPC姿态', p.characters['沈锡元'].posture, '靠在车边单手夹烟');
eq('NPC关系', p.characters['沈锡元'].relation, '克制内敛的青梅竹马，尚未告白');
eq('心声不外泄', '心声' in p.characters['沈锡元'], false);
eq('无状态栏返回null', LW._parseStatusBlock('普通正文'), null);

// ── 1.5 存储：popLast / meta / historyKeys ──
console.log('[存储]');
LW.Store.push('周言', [{ who: 'user', text: 'a' }, { who: '周言', text: 'b' }, { who: '周言', text: 'c' }], 100);
const popped = LW.Store.popLast('周言', 2);
eq('弹出条数', popped.length, 2);
eq('弹出内容', popped[0].text, 'b');
eq('剩余条数', LW.Store.history('周言').length, 1);
LW.Store.setMeta('周言', { headline: '睡了没', atMainCount: 5 });
eq('元信息读回', LW.Store.meta('周言').headline, '睡了没');
eq('会话key列表', LW.Store.historyKeys(), ['周言']);
LW.Store.push('撤回测试', [{ who: 'user', kind: 'text', text: 'hi' }, { who: '周言', kind: 'text', text: '在的' }], 100);
LW.Store.push('撤回测试', [{ who: '周言', kind: 'recall', text: '' }], 100);
const rh = LW.Store.history('撤回测试');
eq('撤回不打断条数', rh.length, 2);
eq('撤回标落到上一条', rh[1].recalled, true);
eq('定点删除', LW.Store.removeAt('撤回测试', 0), true);
eq('删除后条数', LW.Store.history('撤回测试').length, 1);
LW.Store.removeAt('撤回测试', 0);
eq('删空后元信息清除', LW.Store.meta('撤回测试').headline === undefined && Object.keys(LW.Store.meta('撤回测试')).length === 0, true);
// patchAt：按下标改一条（朋友圈点赞/评论/转账翻账用）
LW.Store.push('momPatch', [{ who: '周言', kind: 'moments', text: 't1' }, { who: '林溪', kind: 'moments', text: 't2' }], 100);
eq('patchAt 返回值', LW.Store.patchAt('momPatch', 1, { likes: ['陈默'] }), true);
eq('patchAt 生效', LW.Store.history('momPatch')[1].likes[0], '陈默');
eq('patchAt 不动邻居', LW.Store.history('momPatch')[0].likes === undefined, true);
eq('patchAt 越界', LW.Store.patchAt('momPatch', 9, { x: 1 }), false);
LW.Store.wipeHistory();

// ── 2. 记录块往返 ──
console.log('[记录块]');
LW.Engine = LW.Engine || {};
LW.Engine.userName = () => '陈默';
LW.Engine.stickers = () => ({ '偷看': 's9v34y.jpeg' });
LW.Engine.resolveSticker = (n) => (n === '探头' ? '偷看' : (LW.Engine.stickers()[n] ? n : null));
const msgs = [
  { who: 'user', kind: 'text', text: '在吗', time: '22:49' },
  { who: '周言', kind: 'text', text: '刚写完卷子', time: '' },
  { who: '周言', kind: 'sticker', text: '偷看', time: '' },
  { who: '周言', kind: 'poke', text: '', time: '' },
];
const block = LW.Floor.formatRecord('与周言的私聊', msgs, '22:49', '陈默');
const m = block.match(LW.Floor.RECORD_RE);
eq('块可被正则整体匹配', !!m, true);
eq('块头', m[1].trim(), '与周言的私聊 22:49');
eq(' sticker行', /周言：\[表情:偷看\]/.test(m[2]), true);
eq('poke行无冒号参数', /周言：\[戳一戳\]/.test(m[2]), true);

// ── 3. NPC 原始输出解析 ──
console.log('[NPC输出解析]');
const npcRaw = '在的\n[表情:探头]\n[语音|明天老地方]\n[戳一戳]\n[撤回]\n（思考了一下）';
const parsed = LW.Floor.parseNpcLines(npcRaw, '周言');
eq('解析条数', parsed.length, 5);
eq('文字行', parsed[0], { who: '周言', kind: 'text', text: '在的', time: '' });
eq('表情同义词解析为白名单名', parsed[1], { who: '周言', kind: 'sticker', text: '偷看', time: '' });
eq('语音行', parsed[2], { who: '周言', kind: 'voice', text: '明天老地方', time: '' });
eq('戳一戳行', parsed[3], { who: '周言', kind: 'poke', text: '', time: '' });
eq('撤回行解析', parsed[4].kind, 'recall');
eq('括号旁白被丢弃', parsed.some(x => x.text.indexOf('思考') !== -1), false);
const grpParsed = LW.Floor.parseNpcLines('林溪：啊啊啊\n陆飞：[图片|一张试卷]\n路人甲：围观', null);
eq('群聊发件人', grpParsed.map(x => x.who), ['林溪', '陆飞', '路人甲']);
eq('群聊图片类型', grpParsed[1].kind, 'image');
// 黏行剥离：AI 忘换行，把类型消息和文字写在一行 → 剥成两条，文字照常走文字行
const glued = LW.Floor.parseNpcLines('林溪：[表情:看戏吃瓜] 哎哟，正主终于舍得在群里冒泡了？', null);
eq('黏行剥为两条', glued.length, 2);
eq('黏行表情条保留', glued[0].who === '林溪' && glued[0].text.indexOf('看戏吃瓜') !== -1, true);
eq('黏行文字条', glued[1].kind, 'text');
eq('黏行文字内容', glued[1].text, '哎哟，正主终于舍得在群里冒泡了？');
const gluedV = LW.Floor.parseNpcLines('[语音:早点睡] 晚安', '周言');
eq('黏行语音条', gluedV[0].kind, 'voice');
eq('黏行语音尾巴', gluedV[1] && gluedV[1].text, '晚安');
// 行内嵌类型消息：标签黏在句尾（「文字[表情:xxx]」）→ 依原序拆成多条，未匹配素材的表情剥壳当纯文字
const gluedSuf = LW.Floor.parseNpcLines('真的只是搬家太忙？[表情:有什么八卦让我听听]', '周言');
eq('句尾标签剥成两条', gluedSuf.length, 2);
eq('句尾标签前文字', gluedSuf[0], { who: '周言', kind: 'text', text: '真的只是搬家太忙？', time: '' });
eq('句尾未知表情剥壳为文字', gluedSuf[1], { who: '周言', kind: 'text', text: '有什么八卦让我听听', time: '' });
const gluedMid = LW.Floor.parseNpcLines('林溪：对了[戳一戳]你人呢', null);
eq('群聊中段标签剥成三条', gluedMid.map(x => x.kind), ['text', 'poke', 'text']);
// 寒暄短句照常保留（不过滤——完整呈现 AI 回复，出问题时便于诊断）
const ackKeep = LW.Floor.parseNpcLines('好的。\n收到\n明白了，我马上到', '周言');
eq('寒暄短句保留条数', ackKeep.length, 3);
eq('寒暄短句原样成泡', ackKeep.map(x => x.text), ['好的。', '收到', '明白了，我马上到']);

// ── 4. 提示词装配 ──
console.log('[提示词]');
global.__msgs = [
  { role: 'user', message: '周言把卷子递了过来。<span class="x">注</span>' },
  { role: 'assistant', message: '<status><环境>2034年8月26日 星期五|22:49|教室|阴</环境></status>他笑了笑。' },
  { role: 'assistant', message: '<cot>Step.1：输入解析与意图拆解</cot>真正的回复。' },
];
const req = LW.Prompt.private({ name: '周言', profile: '档案：班长。' }, msgs, { time: '22:49', dateText: '2034年8月26日 星期五', userPlace: '教室', npc: { place: '图书馆', posture: '坐着' } });
const sysPrompt = req.ordered_prompts[0].content;
eq('框架头部', sysPrompt.indexOf('数字世界') !== -1, true);
eq('包含档案', sysPrompt.indexOf('班长') !== -1, true);
eq('包含时间', sysPrompt.indexOf('22:49') !== -1, true);
eq('包含NPC情境', sysPrompt.indexOf('图书馆') !== -1, true);
eq('HTML被剥离', sysPrompt.indexOf('class="x"') !== -1, false);
eq('status标签剥离', sysPrompt.indexOf('<环境>') !== -1, false);
eq('状态栏内容不进主线近况', sysPrompt.indexOf('阴') !== -1, false);
eq('正文保留', sysPrompt.indexOf('他笑了笑') !== -1, true);
eq('cot思维链剥离', sysPrompt.indexOf('Step.1') !== -1, false);
eq('cot剥离后正文保留', sysPrompt.indexOf('真正的回复') !== -1, true);
eq('静默生成', req.should_silence, true);
eq('不占用主历史', req.max_chat_history, 0);
eq('无user宏残留·系统块', sysPrompt.indexOf('{{user}}'), -1);
eq('无user宏残留·user轮', req.ordered_prompts[1].content.indexOf('{{user}}'), -1);
const greq = LW.Prompt.group({ name: '高三（2）班', open: true }, [{ name: '林溪', profile: '闺蜜' }], [], null);
eq('群提示词含成员', greq.ordered_prompts[0].content.indexOf('林溪') !== -1, true);
eq('群档案全量不截断', greq.ordered_prompts[0].content.indexOf('- 林溪：\n闺蜜') !== -1, true);
const greqLong = LW.Prompt.group({ name: '长档案群', open: false },
  [{ name: '林溪', profile: 'x'.repeat(900) }], [], null);
eq('群档案超500字保留', greqLong.ordered_prompts[0].content.indexOf('x'.repeat(900)) !== -1, true);
eq('开放群提示', greq.ordered_prompts[0].content.indexOf('未具名的其他成员') !== -1, true);
eq('群phone块·起始标记', greq.ordered_prompts[0].content.indexOf('<!--phone') !== -1, true);
eq('群phone块·占位示例', greq.ordered_prompts[0].content.indexOf('{成员名}：{私聊内容}') !== -1, true);
eq('群无user宏残留', greq.ordered_prompts[0].content.indexOf('{{user}}'), -1);

const reqR = LW.Prompt.private({ name: '周言', profile: '' }, [{ who: '周言', kind: 'text', text: '在的', recalled: true }], null, null, null, null);
eq('撤回标注进记录', reqR.ordered_prompts[0].content.indexOf('（此条已撤回）') !== -1, true);
const reqN = LW.Prompt.private({ name: '周言', profile: '' }, [
  { who: 'user', kind: 'text', text: '早', day: '2034年8月25日 星期四', time: '22:00' },
  { who: '周言', kind: 'text', text: '嗯', day: '2034年8月26日 星期五', time: '08:00' },
], { time: '22:49', dateText: '2034年8月26日 星期五', userPlace: '', npc: null }, null, null, null);
const spN = reqN.ordered_prompts[0].content;
eq('私聊记录带对方名', spN.indexOf('周言：嗯') !== -1, true);
eq('私聊记录带user名', spN.indexOf('陈默：早') !== -1, true);
eq('跨天时间标·昨天', spN.indexOf('[昨天 22:00]') !== -1, true);
eq('跨天时间标·今天', spN.indexOf('[今天 08:00]') !== -1, true);
// 今日通话尾巴：同故事日的通话记录带进私聊提示词
const reqCall = LW.Prompt.private({ name: '周言', profile: '' }, [], { dateText: '2034年8月26日 星期五' }, [], null, null, null, null,
  { kind: '视频通话', dur: '03:24', video: true, lines: ['周言：你那边风好大', '（画面：把镜头对准了江面）', '陈默：看到了'] });
const spCall = reqCall.ordered_prompts[0].content;
eq('今日通话段头', spCall.indexOf('## 今日通话（视频通话 · 03:24') !== -1, true);
eq('通话对白进提示词', spCall.indexOf('你那边风好大') !== -1, true);
eq('通话画面进提示词', spCall.indexOf('把镜头对准了江面') !== -1, true);
const greq2 = LW.Prompt.group({ name: '高三（2）班', open: false, style: '有班主任在，发言收敛' }, [{ name: '林溪', profile: '闺蜜' }], [], null);
eq('群氛围字段', greq2.ordered_prompts[0].content.indexOf('有班主任在，发言收敛') !== -1, true);
const greq3 = LW.Prompt.group({ name: '霖附吃瓜二手交易市场', open: true, crowd: '类型：校园公共群，超百人。\n风格：信息量大、节奏快。\n特殊规则：可同时存在多个话题，成员不一定会直接回应。' }, [], [], null);
const gtxt3 = greq3.ordered_prompts[0].content;
eq('群crowd逐字进提示词', gtxt3.indexOf('其余成员设定：\n类型：校园公共群，超百人。') !== -1, true);
eq('群crowd多行保留', gtxt3.indexOf('特殊规则：可同时存在多个话题') !== -1, true);
LW.Store.push('stampT', [{ who: 'user', kind: 'text', text: 'x', time: '22:00' }], 100);
eq('落库自动补日期', LW.Store.history('stampT')[0].day, '2034年8月26日 星期五');
LW.Store.push('stampT2', [{ who: '周言', kind: 'text', text: 'y', time: '' }], 100);
eq('NPC消息自动补时钟', LW.Store.history('stampT2')[0].time, '22:49');
eq('NPC消息自动补日期', LW.Store.history('stampT2')[0].day, '2034年8月26日 星期五');

// ── 8. 世界书通讯录：群字段透传 ──
console.log('[世界书]');
ctx.getCharLorebooks = () => ({ primary: '测试书' });
ctx.getWorldbook = async () => [
  { comment: '霖州蒋默::通讯录', enabled: true, content: JSON.stringify({
    'DLC·高中': {
      contacts: [{ name: '周言', avatar: 'a.png' }, { name: '张裕民', avatar: 'z.png' }],
      groups: [{
        name: '霖附吃瓜二手交易市场', open: true, avatar: 'g.png',
        style: '节奏快', crowd: '超百人，多为陌生人',
        members: ['周言', '{{user}}', '陆飞', '外校生']
      }]
    }
  }) },
  { comment: '周言', enabled: true, content: '周言的单人条目内容（短标题兜底）' },
  { comment: 'NPC（DLC·高中-核心人员）', enabled: true, content: '[NPC·陆飞]\n性别: 男。\n身份: 篮球队（高中版）。\n\n[NPC·张裕民]\n性别: 男。\n身份: 班主任。' },
  { comment: 'NPC（DLC·大学）', enabled: true, content: '[NPC·陆飞]\n性别: 男。\n身份: 运动康复专业（大学版），与{{user}}同住一栋公寓。' },
  { comment: '主角人设（DLC·大学）', enabled: true, content: '[MAIN·周言·演化后]\n- 法学院学生，戴金丝边眼镜。\n\n[MAIN·{{user}}·演化后]\n- 新闻与传播学院学生，住校内宿舍。\n\n## III. 时代锚点事件\n- 第一次送别。\n\n# IV. 叙事指导\n- 这段不该进手机提示词。' },
  { comment: '世界设定杂项', enabled: true, content: '[NPC·外校生]\n性别: 女。\n身份: 来打友谊赛的。' },
  { comment: 'NPC（DLC·成人-破镜重圆）', enabled: true, content: '# I. 核心配角独立档案\n林溪、陆飞从高中时代起，与周言、沈锡元、{{user}}成为好友，关系密切，共同构筑了一个五人的核心小团体。\n\n[NPC·林溪]\n性别: 女。\n身份: 设计师（破镜重圆线）。\n\n[NPC·陆飞]\n性别: 男。\n身份: 运动康复师（破镜重圆线）。\n\n# II. 其他NPC档案\n\n[NPC·许嘉文]\n性别: 男。\n身份: 双面人（破镜重圆线）。' },
  { comment: '主角人设（DLC·成人-同路而行）', enabled: true, content: '# II. 角色演化档案\n\n[MAIN·周言·演化后]\n- 已婚设定（同路线）。\n\n[MAIN·{{user}}·演化后]\n- 与周言同居（同路线）。' },
  { comment: '霖州蒋默::人设::林溪', enabled: true, content: '林溪的手机专用档案' }
];
(async () => {
  const wb = await LW.Worldbook.load();
  const g0 = (wb.rosters['DLC·高中'].groups || [])[0] || {};
  eq('群avatar透传', g0.avatar, 'g.png');
  eq('群style透传', g0.style, '节奏快');
  eq('群crowd透传', g0.crowd, '超百人，多为陌生人');
  eq('群open透传', g0.open, true);
  eq('群members透传', JSON.stringify(g0.members), '["周言","陆飞","外校生"]');
  eq('群members滤掉user宏', g0.members.indexOf('{{user}}') === -1, true);
  eq('联系人avatar透传', (wb.rosters['DLC·高中'].contacts || [])[0].avatar, 'a.png');
  eq('短标题条目兜底档案', wb.profiles['周言'], '周言的单人条目内容（短标题兜底）');
  eq('人设条目优先于块', wb.profiles['林溪'], '林溪的手机专用档案');
  // 线作用域条目：只进线库，不再进全局池（防两条线共用一版档案）
  const rawNpcGz = (wb.npcLineRaw.filter(r => r.scope === 'DLC·高中-核心人员')[0] || { blocks: {} }).blocks;
  const rawNpcDx = (wb.npcLineRaw.filter(r => r.scope === 'DLC·大学')[0] || { blocks: {} }).blocks;
  eq('线NPC库raw·高中陆飞', (rawNpcGz['陆飞'] || '').indexOf('高中版') !== -1, true);
  eq('线NPC库raw·不串块', (rawNpcGz['陆飞'] || '').indexOf('班主任') === -1, true);
  eq('线NPC库raw·大学陆飞', (rawNpcDx['陆飞'] || '').indexOf('大学版') !== -1, true);
  eq('作用域条目不进全局池', wb.profiles['陆飞'], '');
  eq('未作用域条目全局池仍生效', (wb.profiles['外校生'] || '').indexOf('友谊赛') !== -1, true);
  const rawEvol = (wb.evolLineRaw.filter(r => r.scope === 'DLC·大学')[0] || { blocks: {} }).blocks;
  eq('演化块·剥演化后缀', (rawEvol['周言'] || '').indexOf('法学院') !== -1, true);
  eq('演化块·user块单列', (rawEvol['{{user}}'] || '').indexOf('新闻与传播学院') !== -1, true);
  eq('末块不吞后续章节', (rawEvol['{{user}}'] || '').indexOf('叙事指导') === -1
    && (rawEvol['{{user}}'] || '').indexOf('时代锚点事件') === -1, true);

  // ── 8.5 引擎线作用域：拼装、串线隔离、user 宏替换 ──
  console.log('[引擎·线档案]');
  LW.Apps = { wechat: { inject() {}, render() {}, remove() {} } };
  LW.Engine.userName = () => '陈默';
  ctx.getPersona = undefined;   // 模拟旧版酒馆助手：无 getPersona，走父页 powerUserSettings
  ctx.window.parent = { SillyTavern: { getContext: () => ({
    name1: '陈默',
    powerUserSettings: { persona_description: 'persona描述：陈默，住天禧城3幢901。' },
  }) } };
  await LW.Engine.load();
  eq('作用域→线名·高中带尾', LW.Engine.lineOfScope('DLC·高中-核心人员'), 'DLC·高中');
  eq('作用域→线名·大学', LW.Engine.lineOfScope('DLC·大学'), 'DLC·大学');
  eq('作用域→线名·成人带尾', LW.Engine.lineOfScope('DLC·成人-破镜重圆'), 'DLC·成人');
  eq('作用域→线名·成人省略线字', LW.Engine.lineOfScope('DLC·成人'), 'DLC·成人');
  eq('作用域→线名·古代', LW.Engine.lineOfScope('古代线'), null);
  eq('作用域→线名·认不出', LW.Engine.lineOfScope('未来线'), null);
  LW.Engine.applyLine('DLC·成人', '测试');
  eq('成人线林溪读线档案', LW.Engine.profileFor('林溪').indexOf('设计师（破镜重圆线）') !== -1, true);
  eq('成人线林溪不读基础档', LW.Engine.profileFor('林溪').indexOf('手机专用档案') === -1, true);
  eq('成人线陆飞不吞章节头', LW.Engine.profileFor('陆飞').indexOf('其他NPC档案') === -1, true);
  eq('成人线user演化', LW.Engine.userBlock().indexOf('与周言同居（同路线）') !== -1, true);
  eq('成人线主角演化叠加', LW.Engine.profileFor('周言').indexOf('已婚设定（同路线）') !== -1, true);
  LW.Engine.applyLine('DLC·高中', '测试');
  eq('高中线陆飞读高中版', LW.Engine.profileFor('陆飞').indexOf('高中版') !== -1, true);
  LW.Engine.applyLine('DLC·大学', '测试');
  eq('大学线陆飞读大学版·串线隔离', LW.Engine.profileFor('陆飞').indexOf('高中版') === -1 && LW.Engine.profileFor('陆飞').indexOf('大学版') !== -1, true);
  eq('大学线user宏替换', LW.Engine.profileFor('陆飞').indexOf('{{user}}') === -1 && LW.Engine.profileFor('陆飞').indexOf('陈默') !== -1, true);
  const zy = LW.Engine.profileFor('周言');
  eq('基础人设+演化层叠加', zy.indexOf('短标题兜底') !== -1 && zy.indexOf('法学院') !== -1, true);
  eq('演化层衔接句', zy.indexOf('最新人设演化如下') !== -1 && zy.indexOf('【DLC·大学】') !== -1, true);
  eq('用户段·persona描述', LW.Engine.userBlock().indexOf('天禧城3幢901') !== -1, true);
  eq('用户段·衔接句', LW.Engine.userBlock().indexOf('叠加于上方机主资料') !== -1, true);
  eq('用户段·线user演化', LW.Engine.userBlock().indexOf('新闻与传播学院') !== -1, true);
  eq('用户段·user宏替换', LW.Engine.userBlock().indexOf('{{user}}') === -1, true);

  // ── 8.6 跨会话上下文：群→私聊 / 私聊→群，当天门控 ──
  console.log('[跨会话上下文]');
  LW.Store.push('group:霖附吃瓜二手交易市场', [
    { who: 'user', kind: 'text', text: '群里水的消息', day: '2034年8月26日 星期五', time: '23:00' },
    { who: '周言', kind: 'text', text: '哈哈+1', day: '2034年8月26日 星期五', time: '23:01' },
  ], 100);
  LW.Store.push('陆飞', [
    { who: 'user', kind: 'text', text: '晚安，睡了', day: '2034年8月26日 星期五', time: '23:30' },
  ], 100);
  LW.Engine.applyLine('DLC·高中', '测试');
  const cg = LW.Engine.crossGroups('陆飞', '2034年8月26日 星期五');
  eq('跨群·命中群数', cg.length, 1);
  eq('跨群·群名', cg[0].name, '霖附吃瓜二手交易市场');
  eq('跨群·尾巴条数', cg[0].hist.length, 2);
  eq('跨群·非成员不命中', LW.Engine.crossGroups('张裕民', '2034年8月26日 星期五').length, 0);
  eq('跨群·跨天不携带', LW.Engine.crossGroups('陆飞', '2034年8月27日 星期六').length, 0);
  const cp = LW.Engine.crossPrivates(['陆飞', '周言'], '2034年8月26日 星期五');
  eq('跨私聊·命中', (cp['陆飞'] || []).length, 1);
  eq('跨私聊·无记录成员跳过', '周言' in cp, false);
  eq('跨私聊·跨天不携带', Object.keys(LW.Engine.crossPrivates(['陆飞'], '2034年8月27日 星期六')).length, 0);
  const reqX = LW.Prompt.private({ name: '陆飞', profile: '大学版档案' }, [], { dateText: '2034年8月26日 星期五' }, [], null, null, null, cg);
  eq('私聊提示词·带群近况节', reqX.ordered_prompts[0].content.indexOf('相关群聊近况') !== -1, true);
  eq('私聊提示词·群内容进入', reqX.ordered_prompts[0].content.indexOf('哈哈+1') !== -1, true);
  const gtxtX = LW.Prompt.group({ name: '霖附吃瓜二手交易市场', open: false }, [{ name: '陆飞', profile: '大学版档案' }], [], { dateText: '2034年8月26日 星期五' }, [], null, null, null, cp).ordered_prompts[0].content;
  eq('群提示词·scoped情报', gtxtX.indexOf('※ 仅 陆飞 本人知晓') !== -1, true);
  eq('群提示词·私聊内容进入', gtxtX.indexOf('晚安，睡了') !== -1, true);
  eq('群提示词·防泄漏规则', gtxtX.indexOf('引用一字即出戏') !== -1, true);

  // ── 8.7 主动消息捕捉：<!--phone--> 注释块 ──
  console.log('[主动消息捕捉]');
  global.__msgs = [
    { message_id: 101, role: 'assistant', swipe_id: 0, message: '正文内容<!--phone\n沈锡元：[语音:早点睡]\n沈锡元：在？\n沈锡元：又来一条\n-->可见尾巴' },
    { message_id: 102, role: 'user', message: '普通 user 消息' },
  ];
  LW.Engine.sweepPhoneBlocks(5);
  const capHist = LW.Store.history('沈锡元');
  eq('捕捉·带范围参数', global.__lastRange, '0-{{lastMessageId}}');
  eq('捕捉·写入联系人记录', capHist.length, 3);
  eq('捕捉·语音契约解析', capHist[0].kind, 'voice');
  eq('捕捉·文字行解析', capHist[1].text, '在？');
  eq('捕捉·id登记', LW.Store.procIds().some(function (k) { return k.indexOf('101:') === 0; }), true);
  // 同层同 swipe 同内容 → 不重复捕捉（楼层:swipe:内容哈希 三要素查重）
  LW.Engine.sweepPhoneBlocks(5);
  eq('捕捉·防重不二次写入', LW.Store.history('沈锡元').length, 3);
  // 重roll = 同层换 swipe → 重新捕捉（删记录后重roll的场景）
  global.__msgs[0].swipe_id = 1;
  LW.Engine.sweepPhoneBlocks(5);
  eq('捕捉·换swipe重新捕捉', LW.Store.history('沈锡元').length, 6);
  eq('捕捉·重roll内容正确', LW.Store.history('沈锡元')[5].text, '又来一条');
  // 未读：捕捉落入未打开的会话 → 记红点，重复扫不重复累加；打开即清零
  const capUn1 = LW.Store.meta('沈锡元').unread || 0;
  LW.Engine.sweepPhoneBlocks(5);
  eq('未读·不重复累加', (LW.Store.meta('沈锡元').unread || 0) === capUn1, true);
  eq('未读·已有计数', capUn1 > 0, true);
  LW.Store.clearUnread('沈锡元');
  eq('未读·打开清零', LW.Store.meta('沈锡元').unread, 0);
  // ── 8.8 通话：提示词构造 + 群夹带私聊路由 + sys 条目 ──
  console.log('[通话]');
  const invHist = [{ who: 'user', kind: 'text', text: '晚安，睡了', day: '2034年8月26日 星期五', time: '23:01' }];
  const inv = LW.Prompt.callInvite({ name: '沈锡元', profile: '测试档案' }, invHist, { dateText: '2034年8月26日 星期五', npc: { relation: '竹马' } }, '机主资料', 'audio', []);
  const invTxt = inv.ordered_prompts[0].content;
  eq('通话·邀请任务', invTxt.indexOf('语音通话') !== -1, true);
  eq('通话·拒绝约定', invTxt.indexOf('[拒绝]') !== -1, true);
  eq('通话·接听约定', invTxt.indexOf('[接听]') !== -1, true);
  // 视频邀请单独要求 [画面] 行（与台词交织，不只开头）
  const invV = LW.Prompt.callInvite({ name: '沈锡元', profile: '测试档案' }, invHist, { dateText: '2034年8月26日 星期五', npc: { relation: '竹马' } }, '机主资料', 'video', []);
  const invVTxt = invV.ordered_prompts[0].content;
  eq('通话·视频邀请任务', invVTxt.indexOf('视频通话') !== -1, true);
  eq('通话·视频邀请画面约定', invVTxt.indexOf('[画面]') !== -1, true);
  eq('通话·视频邀请画面穿插', invVTxt.indexOf('穿插') !== -1, true);
  eq('通话·语音邀请无画面约定', invTxt.indexOf('[画面]') === -1, true);
  eq('通话·邀请不带通话记录段', invTxt.indexOf('## 通话记录') === -1, true);
  eq('通话·邀请带主线近况', invTxt.indexOf('## 主线近况') !== -1, true);
  eq('通话·邀请带最近私聊', invTxt.indexOf('晚安，睡了') !== -1, true);
  const turn = LW.Prompt.callTurn({ name: '沈锡元', profile: '测试档案' }, '沈锡元：喂\n裴知意：嗯', invHist, { dateText: '2034年8月26日 星期五' }, '机主资料', 'video', [], '你睡了吗');
  const turnTxt = turn.ordered_prompts[0].content;
  eq('通话·轮任务', turnTxt.indexOf('视频通话') !== -1, true);
  eq('通话·transcript带入', turnTxt.indexOf('沈锡元：喂') !== -1, true);
  eq('通话·轮带主线近况', turnTxt.indexOf('## 主线近况') !== -1, true);
  eq('通话·轮带近期私聊', turnTxt.indexOf('## 近期私聊记录') !== -1, true);
  eq('通话·机主话入user轮', turn.ordered_prompts[1].content.indexOf('你睡了吗') !== -1, true);
  // 视频轮次同样要 [画面] 行且要求穿插；splitCallOutput 保序拆分画面与台词
  eq('通话·视频轮画面约定', turnTxt.indexOf('[画面]') !== -1, true);
  eq('通话·视频轮画面穿插', turnTxt.indexOf('穿插') !== -1, true);
  const sp = LW.Engine.splitCallOutput('[画面] 他揉了揉眼睛，凑近屏幕\n喂\n[画面] 他笑着摆了摆手\n明天见');
  eq('通话·拆分保序数', sp.length, 4);
  eq('通话·拆分首条画面', sp[0].kind, 'scene');
  eq('通话·拆分画面内容', sp[0].text.indexOf('揉了揉眼睛') !== -1, true);
  eq('通话·拆分台词在画面后', sp[1].kind + ':' + sp[1].text, 'line:喂');
  eq('通话·拆分画面穿插中间', sp[2].kind, 'scene');
  eq('通话·拆分结尾台词', sp[3].text, '明天见');
  // 旧格式兼容：[画面] 行后未写完的续行收到 --- 为止
  const sp2 = LW.Engine.splitCallOutput('[画面]\n他凑近屏幕，眨了眨眼\n---\n喂，听得到吗');
  eq('通话·旧格式画面合块', sp2[0].kind, 'scene');
  eq('通话·旧格式画面内容', sp2[0].text.indexOf('眨了眨眼') !== -1, true);
  eq('通话·旧格式台词保留', sp2[1].text, '喂，听得到吗');
  // 通话记录灰泡：楼层存档与列表页预览统一压成 [语音通话]/[视频通话]
  eq('通话·记录行格式音频', LW.Floor.msgToLine({ who: 'user', kind: 'calllog', mode: 'audio', text: '通话时长 00:09' }, '裴知意'), '裴知意：[语音通话 · 00:09]');
  eq('通话·记录行格式视频', LW.Floor.msgToLine({ who: 'user', kind: 'calllog', mode: 'video', text: '对方已拒绝' }, '裴知意'), '裴知意：[视频通话 · 对方已拒绝]');
  // ── 8.9 朋友圈：契约解析 + 提示词装配 + 互动痕迹 ──
  console.log('[朋友圈]');
  const mposts = LW.Engine.parseMoments('[动态:周言:月考成绩出了，还活着]\n[配图:周言:公告栏前挤满人的成绩单]\n[点赞:林溪、陆飞]\n[评论:陆飞@周言:年级第七请客]\n[动态:林溪:救命 数学最后一道大题是什么鬼]\n这是游离行不要');
  eq('朋友圈·动态条数', mposts.length, 2);
  eq('朋友圈·动态作者', mposts[0].who, '周言');
  eq('朋友圈·配图挂上', mposts[0].img.indexOf('成绩单') !== -1, true);
  eq('朋友圈·无图动态', mposts[1].img, '');
  eq('朋友圈·游离行丢弃', mposts.some(x => x.text.indexOf('游离') !== -1), false);
  eq('朋友圈·点赞挂上', mposts[0].likes.join('、'), '林溪、陆飞');
  eq('朋友圈·生成期评论挂上', mposts[0].comments.length, 1);
  eq('朋友圈·生成期评论指向作者', mposts[0].comments[0].replyTo, '周言');
  eq('朋友圈·无互动动态空表', mposts[1].likes.length + mposts[1].comments.length, 0);
  // 发布时间行：挂在紧跟的那条动态下（动态自身时间，由 AI 生成）
  const mpostsT = LW.Engine.parseMoments('[动态:周言:第一条]\n[时间:8月26日 21:05]\n[动态:林溪:第二条没写时间]');
  eq('朋友圈·时间行挂上', mpostsT[0].ptRaw, '8月26日 21:05');
  eq('朋友圈·没时间行留空', mpostsT[1].ptRaw == null, true);
  // @回复评论者：挂在紧跟的那条动态下，不回溯到被回复者自己的动态（曾错挂）
  const mposts2 = LW.Engine.parseMoments('[动态:沈锡元:有些人这消失的功夫真是见长]\n[评论:林溪:笑死，被谁家闭门羹喂饱了]\n[评论:沈锡元@林溪:滚蛋]\n[动态:林溪:糖水铺快乐老家]\n[评论:周言:哈哈哈]');
  eq('朋友圈·回复挂跟随动态', mposts2[0].comments.length, 2);
  eq('朋友圈·回复指向评论者', mposts2[0].comments[1].replyTo, '林溪');
  eq('朋友圈·后续评论挂新动态', mposts2[1].comments.length, 1);
  const mreps = LW.Engine.parseMomentsReplies('[评论:周言@陈默:就你话多]\n[评论:林溪:哈哈哈哈]');
  eq('朋友圈·接话条数', mreps.length, 2);
  eq('朋友圈·接话回复指向', mreps[0].replyTo, '陈默');
  eq('朋友圈·接话无指向', mreps[1].replyTo, '');
  const mf = LW.Prompt.momentsFill([{ name: '周言', profile: '班长档案' }, { name: '林溪', profile: '闺蜜档案' }],
    { dateText: '2034年8月26日 星期五', time: '22:49' }, '机主资料');
  const mfTxt = mf.ordered_prompts[0].content;
  eq('朋友圈·填充任务', mfTxt.indexOf('朋友圈') !== -1, true);
  eq('朋友圈·填充带档案', mfTxt.indexOf('班长档案') !== -1, true);
  eq('朋友圈·动态契约', mfTxt.indexOf('[动态:名字:动态文字]') !== -1, true);
  eq('朋友圈·时间契约', mfTxt.indexOf('[时间:M月D日 HH:MM]') !== -1, true);
  eq('朋友圈·时间不晚于当前', mfTxt.indexOf('不得晚于当前时刻') !== -1, true);
  eq('朋友圈·配图契约', mfTxt.indexOf('[配图:名字:画面描述]') !== -1, true);
  eq('朋友圈·点赞契约', mfTxt.indexOf('[点赞:点赞者1、点赞者2]') !== -1, true);
  eq('朋友圈·生成期评论契约', mfTxt.indexOf('[评论:评论者@被回复的人:') !== -1, true);
  eq('朋友圈·不刻意emoji', mfTxt.indexOf('不要刻意凑 emoji') !== -1, true);
  eq('朋友圈·不为发动态而发动态', mfTxt.indexOf('为了发动态而发动态') !== -1, true);
  eq('朋友圈·静默生成', mf.should_silence, true);
  const mr = LW.Prompt.momentsReply({ who: '周言', text: '月考出分了', img: '成绩单' },
    [{ who: '林溪', replyTo: '', text: '牛啊' }], '请客吗', [{ name: '周言', profile: '班长' }, { name: '林溪', profile: '闺蜜' }],
    { dateText: '2034年8月26日 星期五' }, '机主资料');
  const mrTxt = mr.ordered_prompts[0].content;
  eq('朋友圈·回复带动态', mrTxt.indexOf('月考出分了') !== -1, true);
  eq('朋友圈·回复带机主评论', mrTxt.indexOf('请客吗') !== -1, true);
  eq('朋友圈·评论契约', mrTxt.indexOf('[评论:名字:评论内容]') !== -1, true);
  eq('朋友圈·回复指向契约', mrTxt.indexOf('@') !== -1, true);
  const reqMN = LW.Prompt.private({ name: '周言', profile: '' }, [], { dateText: '2034年8月26日 星期五' }, [], null, null, null, null, null,
    '机主在动态「月考成绩出了」下评论「请客吗」');
  eq('朋友圈·互动痕迹段', reqMN.ordered_prompts[0].content.indexOf('## 近期朋友圈（近3天') !== -1, true);
  eq('朋友圈·互动痕迹内容', reqMN.ordered_prompts[0].content.indexOf('请客吗') !== -1, true);
  // 带日期：AI 写 [时间:] 的归一化、晚于快照时刻的被驳回走兜底、兜底不越过「现在」
  global.__msgs = [{ role: 'assistant', message: statusText }];
  ctx.generateRaw = async (req) => '[动态:周言:带时间的动态]\n[时间:8月26日 21:05]\n[动态:林溪:没写时间的动态]\n[动态:陆飞:写了个未来时间]\n[时间:8月26日 23:59]';
  eq('朋友圈·带日期生成', await LW.Engine.momentsEnsure(), true);
  const mfd = LW.Engine.momentsFeed();
  eq('朋友圈·AI时间归一化', mfd.some(function (e) { return e.pt === '2034年8月26日 21:05'; }), true);
  eq('朋友圈·未来时间被驳回', mfd.every(function (e) { return e.pt !== '2034年8月26日 23:59'; }), true);
  eq('朋友圈·缺省时间兜底', mfd.every(function (e) { return /^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/.test(e.pt); }), true);
  eq('朋友圈·时间不越过快照', mfd.filter(function (e) { return e.pt.indexOf('8月26日') !== -1; }).every(function (e) { return e.pt.slice(-5) <= '22:49'; }), true);
  // 存量回补：时间体系前的旧动态没有 pt，打开朋友圈时按序补一个不超过快照时刻的时间
  //（放在 filledDay 早退之前，旧数据只此一次 healing 机会）
  LW.Store.push(LW.Engine.momentsKey, [{ who: '周言', text: '旧数据动态', img: '', pt: '', label: '昨天 10:28', likes: [], comments: [] }], 100);
  eq('朋友圈·当日已生成不重复', await LW.Engine.momentsEnsure(), false);
  const legacyE = LW.Engine.momentsFeed().filter(function (e) { return e.text === '旧数据动态'; })[0];
  eq('朋友圈·旧数据回补时间', legacyE && /^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/.test(legacyE.pt), true);
  eq('朋友圈·回补不越过快照', legacyE.pt.indexOf('8月26日') !== -1 && legacyE.pt.slice(-5) <= '22:49', true);
  // 互动旧动态进摘要：评论一条 5 天前的动态，摘要不能因为超窗丢掉（互动是刚发生的，对方记得）
  LW.Store.push(LW.Engine.momentsKey, [{ who: '林溪', text: '五天前的旧动态', img: '', pt: '2034年8月21日 20:00', label: '', likes: [], comments: [{ who: '陈默', replyTo: '', text: '火锅走起' }] }], 100);
  const noteOld = LW.Engine.momentsNoteFor('林溪', { dateText: '2034年8月26日 星期五' });
  eq('朋友圈·互动旧动态进摘要', noteOld.indexOf('火锅走起') !== -1, true);
  eq('朋友圈·互动旧动态标注刚发生', noteOld.indexOf('刚评论') !== -1 && noteOld.indexOf('互动是刚发生的') !== -1, true);
  eq('朋友圈·近3天动态仍进摘要', noteOld.indexOf('没写时间的动态') !== -1, true);
  // 无日期兜底：状态栏解析不到日期也能生成一次（修复曾静默 return false、前端永远空态的 bug）
  while (LW.Engine.momentsFeed().length) LW.Store.popLast(LW.Engine.momentsKey, 1);   // 清空上一段带日期的 3 条
  global.__msgs = [{ role: 'assistant', message: '没有任何状态栏块的普通楼层' }];
  ctx.generateRaw = async (req) => '[动态:周言:无日期也能正常发动态]\n[动态:林溪:第二条兜底]';
  eq('朋友圈·无日期兜底生成', await LW.Engine.momentsEnsure(), true);
  eq('朋友圈·哨兵打卡', LW.Store.meta(LW.Engine.momentsKey).filledDay, '__nodate__');
  eq('朋友圈·兜底条数', LW.Engine.momentsFeed().length, 2);
  eq('朋友圈·兜底无伪造时间', LW.Engine.momentsFeed().every(function (e) { return e.pt === '' && e.label === ''; }), true);
  eq('朋友圈·兜底不重复生成', await LW.Engine.momentsEnsure(), false);
  // 机主自己发朋友圈：落库即 feed 尾部（最新）、pt 取状态栏当下、空文本拒绝
  global.__msgs = [{ role: 'assistant', message: statusText }];
  eq('发圈·空文本拒绝', LW.Engine.momentsPost('   '), -1);
  const mpIdx0 = LW.Engine.momentsPost('配图测试', '一张拍糊的试卷');
  eq('发圈·配图文描落库', LW.Engine.momentsFeed()[mpIdx0].img, '一张拍糊的试卷');
  const mpIdx = LW.Engine.momentsPost('月考终于结束了');
  eq('发圈·下标即尾部', mpIdx, LW.Engine.momentsFeed().length - 1);
  const mpE = LW.Engine.momentsFeed()[mpIdx];
  eq('发圈·作者机主', mpE.who, '陈默');
  eq('发圈·pt取快照当下', mpE.pt, '2034年8月26日 22:49');
  // 朋友们反应的解析：赞/评论两种行、去重、剔机主自己、赞封顶 5
  const reacts = LW.Engine.parseMomentReacts('[赞:林溪]\n[赞:周言]\n[赞:陈默]\n[赞:林溪]\n[评论:陆飞:恭喜脱离苦海]\n[评论:张裕民@陈默:卷子撕了吗]', '陈默');
  eq('发圈·解析赞去重剔自己', reacts.likes.join('、'), '林溪、周言');
  eq('发圈·解析评论条数', reacts.comments.length, 2);
  eq('发圈·一人只许反应一次', reacts.comments.every(function (cm) { return reacts.likes.indexOf(cm.who) === -1; }), true);
  eq('发圈·评论带回复指向', reacts.comments[1].replyTo, '陈默');
  const reactsCap = LW.Engine.parseMomentReacts('[赞:林溪]\n[赞:周言]\n[赞:陆飞]\n[赞:张裕民]\n[赞:裴知意]\n[赞:许嘉文]', '陈默');
  eq('发圈·赞封顶5', reactsCap.likes.length, 5);
  // 机主动态摘要：近 3 天机主发的 + 谁互动了，进私聊上下文当话题
  LW.Store.patchAt(LW.Engine.momentsKey, mpIdx, { likes: ['林溪', '周言'], comments: [{ who: '周言', replyTo: '', text: '恭喜脱离苦海' }] });
  const myNote = LW.Engine.myMomentsNote({ dateText: '2034年8月26日 星期五' });
  eq('发圈·机主摘要含动态', myNote.indexOf('月考终于结束了') !== -1, true);
  eq('发圈·机主摘要含互动', myNote.indexOf('恭喜脱离苦海') !== -1 && myNote.indexOf('林溪 赞了') !== -1, true);
  const reqMy = LW.Prompt.private({ name: '周言', profile: '' }, [], { dateText: '2034年8月26日 星期五' }, [], null, null, null, null, null, '',
    '8月26日 21:47 机主发了「月考终于结束了」，林溪 赞了');
  eq('发圈·私聊带机主朋友圈段', reqMy.ordered_prompts[0].content.indexOf('## 机主发过的朋友圈（近3天）') !== -1, true);
  eq('发圈·私聊段含内容', reqMy.ordered_prompts[0].content.indexOf('月考终于结束了') !== -1, true);
  // 机主删自己的动态：只许删自己的；删除后下标移位、摘要不再提它
  eq('发圈·删别人的动态拒绝', LW.Engine.momentsDelete(0), false);
  eq('发圈·删超界拒绝', LW.Engine.momentsDelete(999), false);
  eq('发圈·删除生效', LW.Engine.momentsDelete(mpIdx), true);
  eq('发圈·删除后尾部移位', LW.Engine.momentsFeed().length - 1, mpIdx0);
  eq('发圈·摘要不再提已删', LW.Engine.myMomentsNote({ dateText: '2034年8月26日 星期五' }).indexOf('月考终于结束了') === -1, true);
  eq('发圈·同条校验认人认文', LW.Engine.sameMoment(LW.Engine.momentsKey, mpIdx0, LW.Engine.momentsFeed()[mpIdx0]), true);
  eq('发圈·同条校验拒越界', LW.Engine.sameMoment(LW.Engine.momentsKey, 999, {}), false);
  // 转账：聊天记录里的一种消息 kind（无独立账本），双向契约 + 状态翻转
  eq('转账·上下文行机主发出', LW.Floor.msgToLine({ who: 'user', kind: 'transfer', amount: 50, note: '奶茶钱', to: '周言' }, '陈默'), '陈默：[转账给周言 ¥50（奶茶钱）]（待收款）');
  eq('转账·上下文行NPC发来', LW.Floor.msgToLine({ who: '周言', kind: 'transfer', amount: 20, note: '', to: '' }, '陈默'), '周言：[周言转账 ¥20]（待收款）');
  eq('转账·已收款状态尾巴', LW.Floor.msgToLine({ who: 'user', kind: 'transfer', amount: 50, note: '', to: '周言', state: 'accepted' }, '陈默'), '陈默：[转账给周言 ¥50]（对方已收款）');
  eq('转账·机主已收下状态尾巴', LW.Floor.msgToLine({ who: '周言', kind: 'transfer', amount: 20, note: '', to: '', state: 'accepted' }, '陈默'), '周言：[周言转账 ¥20]（机主已收下）');
  eq('转账·机主已退还状态尾巴', LW.Floor.msgToLine({ who: '周言', kind: 'transfer', amount: 20, note: '', to: '', state: 'declined' }, '陈默'), '周言：[周言转账 ¥20]（机主已退还）');
  const tnpc = LW.Floor.parseNpcLines('[转账:50:奶茶钱]', '周言');
  eq('转账·NPC契约解析', tnpc.length === 1 && tnpc[0].kind === 'transfer' && tnpc[0].amount === 50 && tnpc[0].note === '奶茶钱' && tnpc[0].state === 'waiting', true);
  // 重roll 回退：本轮已翻账的恢复待收款；更早轮次（前面隔了 NPC 消息）的旧账不动
  LW.Store.push('回退测试', [
    { who: 'user', kind: 'transfer', amount: 10, note: '旧账', to: '周言', state: 'waiting' },
    { who: '周言', kind: 'text', text: '上次的钱我收啦' },
    { who: 'user', kind: 'transfer', amount: 50, note: '本轮', to: '周言', state: 'waiting' },
  ], 100);
  eq('转账·回复成功翻账（批量翻全部待收款）', LW.Engine.markTransfersAccepted('回退测试'), 2);
  eq('转账·本轮已收款', LW.Store.history('回退测试')[2].state, 'accepted');
  eq('转账·重roll回退本轮', LW.Engine.rollbackTransfers('回退测试'), 1);
  eq('转账·回退后待收款', LW.Store.history('回退测试')[2].state, 'waiting');
  eq('转账·旧账不被动', LW.Store.history('回退测试')[0].state, 'accepted');
  // 回退后再生成成功会重新翻账
  eq('转账·重roll后再翻账', LW.Engine.markTransfersAccepted('回退测试'), 1);
  eq('转账·再翻后已收款', LW.Store.history('回退测试')[2].state, 'accepted');
  eq('转账·非法金额忽略', LW.Floor.parseNpcLines('[转账:abc]', '周言').length, 0);
  eq('转账·超限金额忽略', LW.Floor.parseNpcLines('[转账:99999999]', '周言').length, 0);
  const tseg = LW.Floor.parseNpcLines('拿着 [转账:20] 不用找了', '周言');
  eq('转账·行内契约拆条', tseg.some(function (m) { return m.kind === 'transfer' && m.amount === 20; }), true);
  const tk = '转账测试';
  LW.Store.push(tk, [
    { who: 'user', kind: 'transfer', amount: 50, note: '', to: '周言', state: 'waiting', time: '' },
    { who: 'user', kind: 'text', text: '给你转了点钱', time: '' },
    { who: '周言', kind: 'transfer', amount: 20, note: '找零', to: '', state: 'waiting', time: '' },
  ], 100);
  eq('转账·翻卡只动机主发的', LW.Engine.markTransfersAccepted(tk), 1);
  eq('转账·机主发的已翻', LW.Store.history(tk)[0].state, 'accepted');
  eq('转账·NPC发的未动', LW.Store.history(tk)[2].state, 'waiting');
  eq('转账·再翻零条', LW.Engine.markTransfersAccepted(tk), 0);
  eq('转账·不能收自己发的', LW.Engine.acceptTransfer(tk, 0), false);
  eq('转账·点收NPC发的', LW.Engine.acceptTransfer(tk, 2), true);
  eq('转账·重复收款拒绝', LW.Engine.acceptTransfer(tk, 2), false);
  eq('转账·越界拒绝', LW.Engine.acceptTransfer(tk, 9), false);
  // 转账处置回执：收下/退还（机主）与拒收（对方）——记录行进上下文，AI 靠行全知情
  eq('转账·收下上下文行', LW.Floor.msgToLine({ who: 'user', kind: 'taccept', amount: 66, note: '', from: '周言' }, '陈默'), '陈默：[收下了周言的转账 ¥66]');
  eq('转账·退还上下文行', LW.Floor.msgToLine({ who: 'user', kind: 'tdecline', amount: 66, note: '', from: '周言' }, '陈默'), '陈默：[退还了周言的转账 ¥66]');
  eq('转账·NPC拒收上下文行', LW.Floor.msgToLine({ who: '周言', kind: 'tdecline', amount: 50, note: '', from: '' }, '陈默'), '周言：[周言拒收了转账 ¥50]');
  const tdec = LW.Floor.parseNpcLines('[拒收转账:50:这钱不能收]', '周言');
  eq('转账·NPC拒收契约解析', tdec.length === 1 && tdec[0].kind === 'tdecline' && tdec[0].amount === 50 && tdec[0].note === '这钱不能收', true);
  eq('转账·拒收非法金额忽略', LW.Floor.parseNpcLines('[拒收转账:abc]', '周言').length, 0);
  // [接收转账] 契约：带参精确 / 裸标识空参占位 / 非法参数忽略
  const tacc = LW.Floor.parseNpcLines('[接收转账:50:奶茶钱]', '周言');
  eq('转账·NPC接收契约解析', tacc.length === 1 && tacc[0].kind === 'taccept' && tacc[0].amount === 50 && tacc[0].note === '奶茶钱', true);
  const taccB = LW.Floor.parseNpcLines('[接收转账]', '周言');
  eq('转账·接收裸标识', taccB.length === 1 && taccB[0].kind === 'taccept' && taccB[0].amount === '', true);
  eq('转账·接收非法金额忽略', LW.Floor.parseNpcLines('[接收转账:abc]', '周言').length, 0);
  const tdecB = LW.Floor.parseNpcLines('[拒收转账]', '周言');
  eq('转账·拒收裸标识', tdecB.length === 1 && tdecB[0].kind === 'tdecline' && tdecB[0].amount === '', true);
  // 裸标识宽松对账：对到该发送方最近一笔待收款，回执金额回填
  LW.Store.push('宽松对账', [
    { who: 'user', kind: 'transfer', amount: 10, note: '旧', to: '周言', state: 'waiting' },
    { who: 'user', kind: 'transfer', amount: 50, note: '新', to: '周言', state: 'waiting' },
    { who: '周言', kind: 'taccept', amount: '', note: '', from: '', time: '' },
  ], 100);
  eq('转账·裸接收对最近一笔', LW.Engine.applyNpcAccepts('宽松对账'), 1);
  eq('转账·最近一笔已收', LW.Store.history('宽松对账')[1].state, 'accepted');
  eq('转账·较早一笔仍待收', LW.Store.history('宽松对账')[0].state, 'waiting');
  eq('转账·回执金额回填', LW.Store.history('宽松对账')[2].amount === 50 && LW.Store.history('宽松对账')[2].note === '新', true);
  // 拒收同规则：裸 [拒收转账] 对最近待收款翻退还并回填
  LW.Store.push('宽松对账', [
    { who: 'user', kind: 'transfer', amount: 10, note: '旧', to: '周言', state: 'waiting' },
    { who: '周言', kind: 'tdecline', amount: '', note: '', from: '', time: '' },
  ], 100);
  eq('转账·裸拒收对最近一笔', LW.Engine.applyNpcDeclines('宽松对账'), 1);
  eq('转账·裸拒收翻退还', LW.Store.history('宽松对账')[3].state, 'declined');
  eq('转账·拒收回执回填', LW.Store.history('宽松对账')[4].amount, 10);
  const tk2 = '转账处置测试';
  LW.Store.push(tk2, [
    { who: '周言', kind: 'transfer', amount: 66, note: '红包', to: '', state: 'waiting', time: '' },
    { who: 'user', kind: 'text', text: '这多不好意思', time: '' },
    { who: 'user', kind: 'transfer', amount: 50, note: '', to: '周言', state: 'waiting', time: '' },
  ], 100);
  eq('转账·机主收下发出即翻', LW.Engine.verdictTransfer(tk2, 'accepted', '周言', 66, '红包'), true);
  eq('转账·收下后卡已收款', LW.Store.history(tk2)[0].state, 'accepted');
  eq('转账·已处置不能再翻', LW.Engine.verdictTransfer(tk2, 'declined', '周言', 66, '红包'), false);
  eq('转账·备注不匹配不翻', LW.Engine.verdictTransfer(tk2, 'accepted', '周言', 66, '错备注'), false);
  eq('转账·发送方不匹配不翻', LW.Engine.verdictTransfer(tk2, 'declined', '林溪', 50, ''), false);
  LW.Store.push(tk2, [{ who: '林溪', kind: 'tdecline', amount: 50, note: '', from: '', time: '' }], 100);
  eq('转账·NPC拒收落地翻退还', LW.Engine.applyNpcDeclines(tk2), 1);
  eq('转账·机主发的卡已退还', LW.Store.history(tk2)[2].state, 'declined');
  eq('转账·拒收后回复不再收款', LW.Engine.markTransfersAccepted(tk2), 0);
  eq('转账·无契约时拒收落地零条', LW.Engine.applyNpcDeclines(tk), 0);
  const reqT = LW.Prompt.private({ name: '周言', profile: '' }, [], { dateText: '2034年8月26日 星期五' }, [], null, null, null, null, null, '', '');
  eq('转账·私聊契约说明', reqT.ordered_prompts[0].content.indexOf('[转账:金额:备注]') !== -1, true);
  eq('转账·私聊接收契约说明', reqT.ordered_prompts[0].content.indexOf('[接收转账:金额:备注]') !== -1, true);
  eq('转账·私聊拒收契约说明', reqT.ordered_prompts[0].content.indexOf('[拒收转账:金额:备注]') !== -1, true);
  // 转账/处置记录行进提示词上下文：AI 全知情，不会重复转账（回归：msgBody 缺 case 时空行）
  const reqTT = LW.Prompt.private({ name: '周言', profile: '' }, [
    { who: 'user', kind: 'transfer', amount: 50, note: '奶茶钱', to: '周言', state: 'accepted', day: '2034年8月26日 星期五', time: '22:00' },
    { who: 'user', kind: 'taccept', amount: 66, note: '', from: '周言', day: '2034年8月26日 星期五', time: '22:01' },
    { who: '周言', kind: 'transfer', amount: 20, note: '', to: '', state: 'waiting', day: '2034年8月26日 星期五', time: '22:02' },
    { who: '周言', kind: 'tdecline', amount: 30, note: '', from: '', day: '2034年8月26日 星期五', time: '22:03' },
  ], { dateText: '2034年8月26日 星期五' }, [], null, null, null, null, null, '');
  const spTT = reqTT.ordered_prompts[0].content;
  eq('提示词·机主转账已收款行', spTT.indexOf('陈默：[转账给周言 ¥50（奶茶钱）]（对方已收款）') !== -1, true);
  eq('提示词·机主收下回执行', spTT.indexOf('陈默：[收下了周言的转账 ¥66]') !== -1, true);
  eq('提示词·NPC转账待收款行', spTT.indexOf('周言：[周言转账 ¥20]（待收款）') !== -1, true);
  eq('提示词·NPC拒收回执行', spTT.indexOf('周言：[周言拒收了转账 ¥30]') !== -1, true);
  // 机主朋友圈的回应 prompt：契约行与人数约束
  const mreact = LW.Prompt.momentsReact({ who: '陈默', text: '月考终于结束了', img: '一张拍糊的试卷', when: '8月26日 22:49' },
    [{ name: '周言', profile: '班长' }, { name: '林溪', profile: '闺蜜' }],
    { dateText: '2034年8月26日 星期五' }, '机主资料', '周言：明天球馆别迟到', '群「霖附吃瓜二手交易市场」· 陆飞：哈哈哈');
  const mreactTxt = mreact.ordered_prompts[0].content;
  const mreactUser = mreact.ordered_prompts[1].content;
  eq('发圈·动态在user消息里', mreactUser.indexOf('月考终于结束了') !== -1, true);
  eq('发圈·user消息带配图', mreactUser.indexOf('配图：一张拍糊的试卷') !== -1, true);
  eq('发圈·system不埋动态', mreactTxt.indexOf('月考终于结束了') === -1, true);
  eq('发圈·回应带私聊段', mreactTxt.indexOf('机主今天的私聊') !== -1 && mreactTxt.indexOf('明天球馆别迟到') !== -1, true);
  eq('发圈·回应带群聊段', mreactTxt.indexOf('机主今天的群聊') !== -1 && mreactTxt.indexOf('哈哈哈') !== -1, true);
  eq('发圈·赞契约', mreactTxt.indexOf('[赞:名字]') !== -1, true);
  eq('发圈·评论契约', mreactTxt.indexOf('[评论:名字:评论内容]') !== -1, true);
  eq('发圈·一人至多一次', mreactTxt.indexOf('一人至多反应一次') !== -1, true);
  // 群夹带私聊：群回复里的 <!--phone--> 块路由进私聊且从群记录剥掉
  global.__msgs = null;
  const sideNames = LW.Engine.capturePhoneText('陆飞：哈哈<!--phone\n许嘉文：我有，直接送你\n-->还有');
  eq('群夹带·路由到人', sideNames.indexOf('许嘉文') !== -1, true);
  eq('群夹带·写入私聊', LW.Store.history('许嘉文').some(function (m) { return m.text.indexOf('直接送你') !== -1; }), true);
  // sys 条目：msgToLine 不带人名前缀（跨场景携带里就是干净的「语音通话 · 03:24」）
  eq('通话·sys行格式', LW.Floor.msgToLine({ who: 'sys', kind: 'sys', text: '语音通话 · 03:24' }, '裴知意'), '语音通话 · 03:24');
  eq('通话·callKey', LW.Engine.callKey('沈锡元'), 'call:沈锡元');

  // ── 7.5 备忘录：契约解析 / 当日判重 / 日期排除 / 短重试 / 撞车不覆盖 ──
  console.log('[备忘录]');
  const dOk = LW.Engine.parseDiary('※备忘录※|2034-08-25|月考\n今天出分了。\n※完※');
  eq('备忘录·标准解析', [dOk.date, dOk.title, dOk.content], ['2034-08-25', '月考', '今天出分了。']);
  eq('备忘录·空标题容忍', LW.Engine.parseDiary('※备忘录※|2034-08-25|\n正文\n※完※').title, '');
  eq('备忘录·日期零填充', LW.Engine.parseDiary('※备忘录※|2034-8-5|t\nx\n※完※').date, '2034-08-05');
  eq('备忘录·中文分隔符容忍', LW.Engine.parseDiary('※备忘录※|2034年8月5日|t\nx\n※完※').date, '2034-08-05');
  const dMulti = LW.Engine.parseDiary('※备忘录※|2034-08-25|t\n第一段。\n\n第二段。\n※完※');
  eq('备忘录·多段保留', dMulti.content.indexOf('第一段') !== -1 && dMulti.content.indexOf('第二段') !== -1, true);
  eq('备忘录·缺标记返回null', LW.Engine.parseDiary('今天想了很多，但没写标记。'), null);
  eq('备忘录·key形如', LW.Engine.diaryKey('周言'), 'diary:周言');

  // diaryWrite 全流程（gen 走 generateRaw 桩，日期取状态栏 fixture）
  global.__msgs = [{ role: 'assistant', message: statusText }];
  let dGenCalls = 0, dLastReq = null;
  ctx.generateRaw = async (req) => {
    dGenCalls++; dLastReq = req;
    return '※备忘录※|2034-08-25|训练\n' + '今天正常训练，十组深蹲，下课回家。'.repeat(20) + '\n※完※';
  };
  const dw1 = await LW.Engine.diaryWrite('周言', false);
  eq('备忘录·首次生成', dw1 && dw1.title, '训练');
  eq('备忘录·落库条数', LW.Engine.diaryEntries('周言').length, 1);
  const dCalls1 = dGenCalls;
  eq('备忘录·当日判重不刷新', (await LW.Engine.diaryWrite('周言', false)) === null && dGenCalls === dCalls1, true);
  ctx.generateRaw = async (req) => {
    dGenCalls++; dLastReq = req;
    return '※备忘录※|2034-08-24|旧账\n' + '又一篇正文内容。'.repeat(30) + '\n※完※';
  };
  const dw3 = await LW.Engine.diaryWrite('周言', true);
  eq('备忘录·显式写一篇无视判重', dw3 && LW.Engine.diaryEntries('周言').length, 2);
  eq('备忘录·提示词注入usedDates', dLastReq.ordered_prompts[0].content.indexOf('2034-08-25') !== -1, true);
  eq('备忘录·提示词含日期排除令', dLastReq.ordered_prompts[0].content.indexOf('不可使用已存在的日期') !== -1, true);
  // 短正文 → 补强重试一次，重试稿替换短稿
  dGenCalls = 0;
  ctx.generateRaw = async () => {
    dGenCalls++;
    return dGenCalls === 1 ? '※备忘录※|2034-08-23|短\n太短。\n※完※' : '※备忘录※|2034-08-22|写长了\n' + '这次写足了篇幅。'.repeat(40) + '\n※完※';
  };
  const dw4 = await LW.Engine.diaryWrite('周言', true);
  eq('备忘录·短正文补强重试', dGenCalls === 2 && dw4.title === '写长了', true);
  // 同日撞车不覆盖：AI 又选 08-22 → 并列存成第二篇
  ctx.generateRaw = async () => '※备忘录※|2034-08-22|撞车\n' + '同一天又来一篇。'.repeat(30) + '\n※完※';
  await LW.Engine.diaryWrite('周言', true);
  eq('备忘录·同日撞车并列不覆盖', (function () {
    const a = LW.Engine.diaryEntries('周言');
    return a.length === 4 && a.filter(function (e) { return e.date === '2034-08-22'; }).length === 2;
  })(), true);
  eq('备忘录·删除', LW.Engine.diaryDeleteAt('周言', 0), true);
  eq('备忘录·删后余量', LW.Engine.diaryEntries('周言').length, 3);
  // Prompt.diary 装配要点
  const dreq = LW.Prompt.diary({ name: '周言', profile: '班长' }, [], { dateText: '2034年8月26日 星期五' }, '机主资料', ['2034-08-25'], false);
  const dtxt = dreq.ordered_prompts[0].content;
  eq('备忘录·字数下限', dtxt.indexOf('不少于 500 字') !== -1, true);
  eq('备忘录·限知禁令', dtxt.indexOf('严禁：本人不知道的任何信息') !== -1, true);
  eq('备忘录·回味许可', dtxt.indexOf('值得回味') !== -1, true);
  const dreq2 = LW.Prompt.diary({ name: '周言' }, [], null, '', [], true);
  eq('备忘录·短重试标记', dreq2.ordered_prompts[0].content.indexOf('过短被驳回') !== -1, true);
  const dreq3 = LW.Prompt.diary({ name: '周言' }, [], null, '', [], false);
  eq('备忘录·无存量日期不注排除', dreq3.ordered_prompts[0].content.indexOf('不可使用已存在的日期') === -1, true);
  // 清理：日记条目留在内存变量无碍，但顺手清掉免得影响后续下标类测试
  while (LW.Engine.diaryEntries('周言').length) LW.Store.removeAt(LW.Engine.diaryKey('周言'), LW.Engine.diaryEntries('周言').length - 1);

  // ── 8. 设置项：cfg 默认值 / 覆写 / 非法回退 / apiConfig 四模式 ──
  console.log('[设置项]');
  LW.Store.setSettings({ plotFloors: 3, histPriv: 20, crossMax: 2, crossLines: 9 });
  const c1 = LW.Store.cfg();
  eq('cfg·覆写生效', [c1.plotFloors, c1.histPriv, c1.crossMax, c1.crossLines], [3, 20, 2, 9]);
  eq('cfg·未动项取默认', c1.plotCap, 900);
  LW.Store.setSettings({ plotFloors: -5, histPriv: 'abc' });
  const c2 = LW.Store.cfg();
  eq('cfg·非法值回退默认', [c2.plotFloors, c2.histPriv], [8, 50]);
  LW.Store.setSettings({ plotFloors: 3 });
  // 提示词跟随设置：主线楼数 3 → 只带 3 楼
  global.__msgs = [
    { role: 'user', message: '一楼正文' }, { role: 'assistant', message: '二楼正文' },
    { role: 'user', message: '三楼正文' }, { role: 'assistant', message: '四楼正文' },
  ];
  const preq = LW.Prompt.private({ name: '周言', profile: '班长' }, [], null, [], [], '', '机主资料', [], null, '', '');
  const ptxt = preq.ordered_prompts[0].content;
  eq('设置·主线只带3楼', ptxt.indexOf('一楼正文') === -1 && ptxt.indexOf('二楼正文') !== -1 && ptxt.indexOf('四楼正文') !== -1, true);
  LW.Store.setSettings({ plotFloors: undefined, histPriv: undefined, crossMax: undefined, crossLines: undefined });
  eq('cfg·清空后回默认', LW.Store.cfg().plotFloors, 8);
  // apiConfig 四模式
  const lsStore = {};
  ctx.localStorage = { getItem: (k) => lsStore[k] || null, setItem: (k, v) => { lsStore[k] = v; } };
  eq('api·默认跟随', LW.Engine.apiConfig(), undefined);
  LW.Store.setSettings({ api: { mode: 'model', model: 'gemini-3.1' } });
  eq('api·只换模型', LW.Engine.apiConfig(), { model: 'gemini-3.1' });
  LW.Store.setSettings({ api: { mode: 'preset', preset: 'MyProxy' } });
  eq('api·旧版代理预设已剔除→回退跟随', LW.Engine.apiConfig(), undefined);
  ctx.localStorage.setItem('lzjm_phone_apikey', 'sk-test');
  LW.Store.setSettings({ api: { mode: 'custom', apiurl: 'https://x.dev', cmodel: 'm1' } });
  eq('api·自定义带本机密钥', LW.Engine.apiConfig(), { apiurl: 'https://x.dev', key: 'sk-test', model: 'm1', source: 'openai' });
  LW.Store.setSettings({ api: { mode: 'custom', apiurl: '' } });
  eq('api·自定义缺地址回退跟随', LW.Engine.apiConfig(), undefined);
  LW.Store.setSettings({ api: undefined });
  eq('api·清空回跟随', LW.Engine.apiConfig(), undefined);
  LW.Store.setSettings({ api: { mode: 'custom', apiurl: 'https://g.dev', source: 'makersuite', cmodel: 'gemini-3.1' } });
  eq('api·自定义可换makersuite源', LW.Engine.apiConfig().source, 'makersuite');
  LW.Store.setSettings({ api: undefined });
  eq('cfg·注入四键默认', [LW.Store.cfg().injRecent, LW.Store.cfg().injMention, LW.Store.cfg().injMax, LW.Store.cfg().injRounds], [8, 4, 3, 20]);
  LW.Store.setSettings({ injRounds: 60 });
  eq('cfg·注入键可覆写', LW.Store.cfg().injRounds, 60);
  LW.Store.setSettings({ injRounds: undefined });

  // ── UI 源码静态检查（回归保险丝）──
  console.log('[UI 源码]');
  const wsrc = fs.readFileSync(path.join(ROOT, 'src/apps/wechat.js'), 'utf8');
  eq('关闭app·有点击绑定', wsrc.includes('ph.querySelectorAll(\'[data-app="close"]\').forEach'), true);
  eq('关闭app·绑定未被误改成正则字面量（fdb0520 事故）', /^\s*\/\s*ph\\\./m.test(wsrc), false);
  eq('选线弹窗·按可视视口显式定位', wsrc.includes('function placeLinesPop') && wsrc.includes('visualViewport'), true);
  // 正文注入·幽灵残留保险丝：入口无条件清除同名键（stc.extensionPrompts 直删），且先于所有 return 分支
  // （注意：uninjectPrompts( 里含着 injectPrompts( 子串——截取到 injectPrompts([{ 处，注释先行剥掉）
  const esrc = fs.readFileSync(path.join(ROOT, 'src/engine.js'), 'utf8');
  const injBody = esrc.slice(esrc.indexOf('injectDigest: function'));
  const injCut = injBody.slice(0, injBody.search(/\n\s*injectPrompts\(\[\{/));
  const injNoCmt = injCut.replace(/\/\/[^\n]*/g, '');
  eq('正文注入·入口先清同名键', injNoCmt.includes("delete stc.extensionPrompts['lzjm-phone-digest']"), true);
  eq('正文注入·清除先于所有return分支', injNoCmt.indexOf('extensionPrompts') !== -1 && injNoCmt.indexOf('extensionPrompts') < injNoCmt.search(/return/), true);
  eq('正文注入·注入分支同名键摘除', esrc.includes("uninjectPrompts(['lzjm-phone-digest'])"), true);
  // 图床双源保险丝：主源 jsdelivr、catbox 兜底、回退监听、壁纸 CSS 变量
  eq('图床·主源jsdelivr', esrc.indexOf("var IMG_BASE = 'https://cdn.jsdelivr.net/gh/haodayizhiyu404/linzhou-world@main/img/'") !== -1, true);
  eq('图床·catbox兜底常量', esrc.indexOf("IMG_BASE_FALLBACK = 'https://files.catbox.moe/'") !== -1, true);
  eq('图床·img回退监听', esrc.indexOf("addEventListener('error', function (ev)") !== -1 && esrc.indexOf('lzjmFbk') !== -1, true);
  eq('壁纸·CSS变量可换源', wsrc.includes('var(--lzjm-wall') && wsrc.includes("setProperty('--lzjm-wall'") && wsrc.includes('HOME_WALL_FB'), true);
  // 备忘录回归保险丝：主屏入口 / 生成判重与排除 / 重roll先删再写
  const psrc = fs.readFileSync(path.join(ROOT, 'src/prompt.js'), 'utf8');
  eq('备忘录·主屏入口', wsrc.includes('data-app="diary"') && wsrc.includes('ICON_MEMO'), true);
  eq('备忘录·写一篇与选人绑定', wsrc.includes('[data-dwrite]') && wsrc.includes('[data-dnpc]'), true);
  eq('备忘录·重roll先删再写', wsrc.includes('diaryReroll') && wsrc.includes('Engine.diaryDeleteAt(this.diaryNpc, idx)'), true);
  eq('备忘录·当日判重在引擎', esrc.includes('lastGenDay') && esrc.includes('diaryWrite'), true);
  eq('备忘录·usedDates注入排除', esrc.includes('usedDates') && psrc.includes('不可使用已存在的日期'), true);
  eq('备忘录·契约标记', psrc.includes('※备忘录※|日期|标题') && psrc.includes('※完※'), true);
  eq('备忘录·短重试补强', esrc.indexOf('正文过短') !== -1 && psrc.indexOf('过短被驳回') !== -1, true);
  global.__msgs = null;
  LW.Engine.applyLine(null, '收尾');
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
