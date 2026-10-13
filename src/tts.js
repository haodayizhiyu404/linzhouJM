// ═══════════════════════════════════════════════════════════
//  tts.js —— 语音合成与播放
//  双适配器：fish 原生 /v1/tts（reference_id 音色克隆）+ OpenAI 兼容 /v1/audio/speech
//  （通吃公益站/OpenAI 系）。一律走酒馆服务端 /proxy 转发——免 CORS，沙盒内可用。
//  配置音色映射写角色卡扩展（跟卡走、全聊天通用、卡作者可预置）；API key 只存本机。
//  音频 blob 绝不进聊天变量/卡：会话级 Map + IndexedDB 双级缓存，键=文本内容哈希；
//  删除通话内容时按原文精确清音频。
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  var EXT_KEY = 'lzjm_tts';          // 角色卡扩展字段名
  var LS_KEY = 'lzjm_tts_key';       // API key 本机存储
  var IDB_NAME = 'lzjm-tts';
  var IDB_STORE = 'audio';
  var sessionUrls = {};              // hash → objectURL（会话级）
  var csrfToken = null;
  var audioEl = null;                // 单例播放器（通话连播共用）

  // djb2 → 8 位 hex：文本+音色+厂商决定一段音频的身份
  function hash(s) {
    var h = 5381;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // ── IndexedDB 最小封装（不可用则全部静默降级为仅会话缓存）──
  function idbOpen() {
    return new Promise(function (res, rej) {
      try {
        var rq = indexedDB.open(IDB_NAME, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE, { keyPath: 'k' }); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error || new Error('idb')); };
      } catch (e) { rej(e); }
    });
  }
  function idbGet(k) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        try {
          var rq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(k);
          rq.onsuccess = function () { res(rq.result || null); };
          rq.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    }).catch(function () { return null; });
  }
  function idbPut(rec) {
    idbOpen().then(function (db) {
      try { db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(rec); } catch (e) {}
    }).catch(function () {});
  }
  // 按原文精确清除音频（删除通话/消息条目时同步调用；键里含音色，遍历匹配原文全删）
  function idbPurgeByText(text) {
    idbOpen().then(function (db) {
      try {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var rq = tx.objectStore(IDB_STORE).openCursor();
        rq.onsuccess = function () {
          var cur = rq.result;
          if (cur) {
            if (cur.value && cur.value.t === text) cur.delete();
            cur.continue();
          }
        };
      } catch (e) {}
    }).catch(function () {});
  }

  var Tts = {
    hash: hash,
    cfgCache: null,

    // 卡接口多路径解析：不同版本酒馆助手注入位置不一——裸全局 / window.TavernHelper /
    // 父页 TavernHelper。解析不到就退回默认值（仅本会话生效），绝不静默半挂。
    _charApi: function () {
      try { if (typeof getCharacter === 'function' && typeof replaceCharacter === 'function') return { get: getCharacter, set: replaceCharacter }; } catch (e) {}
      try { if (typeof TavernHelper !== 'undefined' && TavernHelper && TavernHelper.getCharacter && TavernHelper.replaceCharacter) return { get: TavernHelper.getCharacter.bind(TavernHelper), set: TavernHelper.replaceCharacter.bind(TavernHelper) }; } catch (e) {}
      try { var tp = window.parent.TavernHelper; if (tp && tp.getCharacter && tp.replaceCharacter) return { get: tp.getCharacter.bind(tp), set: tp.replaceCharacter.bind(tp) }; } catch (e) {}
      return null;
    },

    // 角色卡扩展里的音色配置（卡接口不可用时退回默认值，仅本会话生效）
    ready: async function () {
      if (this.cfgCache) return this.cfgCache;
      var def = { enabled: true, autoCall: true, provider: 'fish', endpoint: '', model: '', voices: {} };
      try {
        var api = this._charApi();
        if (api) {
          var ch = await api.get('current');
          var ext = (ch && ch.data && ch.data.extensions) || (ch && ch.extensions) || {};
          this.cfgCache = Object.assign({}, def, ext[EXT_KEY] || {});
          this.cfgCache.voices = Object.assign({}, (ext[EXT_KEY] || {}).voices || {});
        } else {
          this.cfgCache = def;
        }
      } catch (e) { this.cfgCache = def; }
      return this.cfgCache;
    },

    // 写回角色卡扩展（跟卡走）。写卡被酒馆权限拦截时 toast 说明，会话内仍生效。
    save: async function (patch) {
      var cfg = await this.ready();
      var voices = Object.assign({}, cfg.voices, patch.voices || {});
      cfg = Object.assign({}, cfg, patch);
      cfg.voices = voices;
      this.cfgCache = cfg;
      try {
        var api2 = this._charApi();
        if (api2) {
          var extObj = {};
          extObj[EXT_KEY] = cfg;
          await api2.set('current', { data: { extensions: extObj } }, { render: 'none' });
        }
      } catch (e) {
        try { toastr.warning('音色配置未能写进角色卡（酒馆设置需允许脚本修改角色卡），本次会话内仍生效', '📱 霖州引擎'); } catch (e2) {}
      }
      return cfg;
    },

    apiKey: function () {
      try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; }
    },
    setApiKey: function (k) {
      try { if (k) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY); } catch (e) {}
    },

    // CSRF：新版 /proxy 免校验，老版本仍可能校验——自取 token 两头兼容（不依赖页面全局）
    _csrf: async function () {
      if (csrfToken) return csrfToken;
      try {
        var r = await fetch('/csrf-token');
        if (r.ok) csrfToken = (await r.json()).token;
      } catch (e) {}
      return csrfToken;
    },

    // 带超时的 fetch：厂商请求悬挂会让连播队列永久卡死（表现为只有第一句有声）。
    // 超时即 reject，队列跳过该行继续——宁丢一句不锁全链。
    _fetchT: function (url, opts, ms) {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 25000) : null;
      return fetch(url, ctrl ? Object.assign({}, opts, { signal: ctrl.signal }) : (opts || {}))
        .finally(function () { if (timer) clearTimeout(timer); });
    },

    _fish: async function (text, voice, cfg, key) {
      var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
      if (cfg.model) headers['model'] = cfg.model;
      var csrf = await this._csrf();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      var r = await this._fetchT('/proxy/https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ text: text, reference_id: voice, format: 'mp3' })
      });
      if (!r.ok) throw new Error('Fish TTS HTTP ' + r.status + '：' + String(await r.text()).slice(0, 100));
      return await r.blob();
    },

    _openai: async function (text, voice, cfg, key) {
      var ep = String(cfg.endpoint || '').trim().replace(/\/+$/, '');
      if (!ep) throw new Error('OpenAI 兼容：未填接口地址');
      var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
      var csrf = await this._csrf();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      var r = await this._fetchT('/proxy/' + ep + '/v1/audio/speech', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ model: cfg.model || 'tts-1', voice: voice, input: text, response_format: 'mp3' })
      });
      if (!r.ok) throw new Error('TTS HTTP ' + r.status + '：' + String(await r.text()).slice(0, 100));
      return await r.blob();
    },

    // 合成：会话缓存 → IndexedDB 命中 → 厂商 API → 双级写入。返回 objectURL。
    synth: async function (text, voice) {
      text = String(text || '').trim();
      if (!text) throw new Error('空文本');
      var cfg = await this.ready();
      if (!cfg.enabled) throw new Error('语音功能未开启');
      var key = this.apiKey();
      if (!key) throw new Error('未配置 API 密钥（手机「音色」里填）');
      if (!voice) throw new Error('该角色未配置音色');
      var h = hash(cfg.provider + '|' + voice + '|' + text);
      if (sessionUrls[h]) return sessionUrls[h];
      var rec = await idbGet(h);
      if (rec && rec.blob) {
        var u1 = URL.createObjectURL(rec.blob);
        sessionUrls[h] = u1;
        return u1;
      }
      var blob = cfg.provider === 'openai'
        ? await this._openai(text, voice, cfg, key)
        : await this._fish(text, voice, cfg, key);
      idbPut({ k: h, t: text, v: voice, p: cfg.provider, blob: blob, at: Date.now() });
      var u2 = URL.createObjectURL(blob);
      sessionUrls[h] = u2;
      return u2;
    },

    play: async function (text, voice) {
      var url = await this.synth(text, voice);
      this.stop();
      audioEl = new Audio(url);
      return audioEl.play();
    },
    stop: function () {
      try { if (audioEl) { audioEl.pause(); audioEl.onended = null; audioEl.onerror = null; audioEl = null; } } catch (e) {}
    },

    // 通话连播：台词行入队逐条播；画面行跳过；挂断/新输入/重说 → stopQueue 打断
    _q: [],
    _pumping: false,
    speakLines: async function (name, entries) {
      var self = this;
      var cfg = await this.ready();
      if (!cfg.enabled || !cfg.autoCall) return;
      var W = window.LZJM;
      var meName = '';
      try { meName = W.Engine.userName(); } catch (e) {}
      (entries || []).forEach(function (en) {
        if (!en || en.kind !== 'text' || !String(en.text || '').trim()) return;
        var who = en.who === 'user' ? meName : name;
        var v = cfg.voices[who];
        if (v) self._q.push({ text: String(en.text).trim(), voice: v });
      });
      this._pump();
    },
    _pump: function () {
      var self = this;
      if (this._pumping) return;
      var item = this._q.shift();
      if (!item) return;
      this._pumping = true;
      // 看门狗：播放中任何一步挂死（合成悬挂/ended 未触发），30 秒后强制解锁续播，
      // 宁丢一句不锁全链。逐步日志让远程排查能直接读到死在哪一环。
      if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
      this._watchdog = setTimeout(function () {
        console.warn('[霖州引擎] TTS 看门狗触发：上一句播放卡死，强制解锁续播');
        self._watchdog = null;
        self._pumping = false;
        self._pump();
      }, 30000);
      console.log('[霖州引擎] TTS 队列:合成「' + item.text.slice(0, 12) + '」(' + this._q.length + ' 句排队)');
      this.synth(item.text, item.voice).then(function (url) {
        console.log('[霖州引擎] TTS 队列:合成完毕，播放');
        audioEl = new Audio(url);
        audioEl.onended = function () {
          if (self._watchdog) { clearTimeout(self._watchdog); self._watchdog = null; }
          self._pumping = false;
          self._pump();
        };
        audioEl.onerror = function () {
          if (self._watchdog) { clearTimeout(self._watchdog); self._watchdog = null; }
          console.warn('[霖州引擎] TTS 队列:播放报错，跳到下一句');
          self._pumping = false;
          self._pump();
        };
        audioEl.play().catch(function (e) {
          if (self._watchdog) { clearTimeout(self._watchdog); self._watchdog = null; }
          console.warn('[霖州引擎] TTS 队列:play() 被拒（自动播放策略？）', e);
          self._pumping = false;
          self._pump();
        });
      }).catch(function (e) {
        if (self._watchdog) { clearTimeout(self._watchdog); self._watchdog = null; }
        console.warn('[霖州引擎] TTS 队列:合成失败，跳到下一句', e);
        self._pumping = false;
        self._pump();
      });
    },
    stopQueue: function () {
      this._q.length = 0;
      if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
      this._pumping = false;
      this.stop();
    },

    purgeByText: function (text) {
      idbPurgeByText(String(text || '').trim());
    }
  };

  window.LZJM = window.LZJM || {};
  window.LZJM.Tts = Tts;
})();
