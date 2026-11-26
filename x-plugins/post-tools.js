// ==UserScript Combined for Pake==
// @name         Post Tools — X, Reddit & Facebook (Pake Desktop Edition)
// @namespace    http://tampermonkey.net/
// @version      4.1.0-pake
// @description  AI-powered Copy, Truth, Explain & Reply on X (Twitter), Reddit, and Facebook. Hardened for Pake (proxy_http, kv_load/kv_set, Trusted Types, strict tweet-toolbar targeting).
// @match        https://twitter.com/*
// @match        https://x.com/*
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://m.facebook.com/*
// ==/UserScript Combined for Pake==

(() => {
  'use strict';

  /* =========================================================================
     1. IFRAME CRASH GUARD, HOSTNAME CHECK & DOUBLE-EXECUTION GUARD
     ========================================================================= */
  if (window.self !== window.top) return;

  const __HOST__ = (window.location && window.location.hostname) || '';
  if (!/(^|\.)(x|twitter|reddit|facebook)\.com$/i.test(__HOST__)) return;
  if (/^(abs|pbs|ton|api|ads|analytics|cards|o|captcha|verify|static|connect)\./i.test(__HOST__)) return;

  if (window.__postToolsPakeInit) return;
  window.__postToolsPakeInit = true;

  /* =========================================================================
     2. TAURI / PAKE V3.20.0 IPC CAPTURE (MUST RUN AT DOCUMENT-START)
     ========================================================================= */
  const __PAKE_INVOKE__ =
    (typeof __TAURI__ !== 'undefined' && __TAURI__?.core?.invoke) ||
    window.__TAURI__?.core?.invoke ||
    window.__TAURI_INTERNALS__?.invoke ||
    null;

  const __PAKE_SHELL_OPEN__ =
    (typeof __TAURI__ !== 'undefined' && __TAURI__?.shell?.open) ||
    window.__TAURI__?.shell?.open ||
    null;

  /* =========================================================================
     3. PERSISTENT DISK STORAGE (kv_load / kv_set) & FULL GM_* POLYFILLS
     ========================================================================= */
  window.unsafeWindow = window;

  const __KV_PREFIX__ = '__pake_pt_kv__:';
  const __KV_CACHE__ = Object.create(null);
  const __PAKE_MENU_COMMANDS__ = (window.__PAKE_MENU_COMMANDS__ =
    window.__PAKE_MENU_COMMANDS__ || []);
  const __ACTIVE_XHR_SET__ = new Set();

  function __safeJsonParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function __lsRead(key) {
    try {
      const prefixed = window.localStorage.getItem(__KV_PREFIX__ + key);
      if (prefixed !== null) {
        const parsed = __safeJsonParse(prefixed, undefined);
        if (parsed && typeof parsed === 'object' && '__v' in parsed) {
          return parsed.__v;
        }
        return parsed;
      }
      if (key.startsWith('x_adv_')) {
        const legacy = window.localStorage.getItem(key);
        if (legacy !== null) return __safeJsonParse(legacy, legacy);
      }
    } catch (_) {}
    return undefined;
  }

  function __lsWrite(key, value) {
    try {
      if (value === null || value === undefined) {
        window.localStorage.removeItem(__KV_PREFIX__ + key);
        if (key.startsWith('x_adv_')) window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(__KV_PREFIX__ + key, JSON.stringify({ __v: value }));
        if (key.startsWith('x_adv_')) {
          window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      }
    } catch (_) {}
  }

  // Synchronously pre-seed in-memory cache from localStorage fallback
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(__KV_PREFIX__)) {
        const realKey = k.slice(__KV_PREFIX__.length);
        const val = __lsRead(realKey);
        if (val !== undefined) __KV_CACHE__[realKey] = val;
      } else if (k.startsWith('x_adv_') && !(k in __KV_CACHE__)) {
        const val = __lsRead(k);
        if (val !== undefined) __KV_CACHE__[k] = val;
      }
    }
  } catch (_) {}

  const __KV_READY__ = (async () => {
    if (!__PAKE_INVOKE__) return;
    try {
      const diskData = await __PAKE_INVOKE__('kv_load');
      if (diskData && typeof diskData === 'object') {
        for (const [k, v] of Object.entries(diskData)) {
          if (v !== null && v !== undefined) {
            __KV_CACHE__[k] = v;
            __lsWrite(k, v);
          }
        }
        window.dispatchEvent(new CustomEvent('pt:kvHydrated'));
      }
    } catch (_) {}
  })();

  function GM_getValue(key, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(__KV_CACHE__, key)) {
      const val = __KV_CACHE__[key];
      return val === undefined ? defaultValue : val;
    }
    const lsVal = __lsRead(key);
    if (lsVal !== undefined) {
      __KV_CACHE__[key] = lsVal;
      return lsVal;
    }
    return defaultValue;
  }

  function GM_setValue(key, value) {
    __KV_CACHE__[key] = value;
    __lsWrite(key, value);
    if (__PAKE_INVOKE__) {
      try {
        Promise.resolve(
          __PAKE_INVOKE__('kv_set', { key, value: value === undefined ? null : value })
        ).catch(() => {});
      } catch (_) {}
    }
  }

  function GM_deleteValue(key) {
    delete __KV_CACHE__[key];
    __lsWrite(key, null);
    if (__PAKE_INVOKE__) {
      try {
        Promise.resolve(__PAKE_INVOKE__('kv_set', { key, value: null })).catch(() => {});
      } catch (_) {}
    }
  }

  function GM_listValues() {
    return Object.keys(__KV_CACHE__);
  }

  const __pendingStyles = [];
  let __styleFlusherAttached = false;

  function __flushPendingStyles() {
    const target = document.head || document.documentElement;
    if (!target) return;
    while (__pendingStyles.length > 0) {
      const st = __pendingStyles.shift();
      if (st && !st.parentNode) target.appendChild(st);
    }
  }

  function GM_addStyle(css) {
    const style = document.createElement('style');
    style.textContent = typeof css === 'string' ? css : String(css || '');
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    } else {
      __pendingStyles.push(style);
      if (!__styleFlusherAttached) {
        __styleFlusherAttached = true;
        document.addEventListener('DOMContentLoaded', __flushPendingStyles, { once: true });
      }
    }
    return style;
  }

  function GM_registerMenuCommand(caption, onClick) {
    const entry = { id: __PAKE_MENU_COMMANDS__.length + 1, caption, onClick };
    __PAKE_MENU_COMMANDS__.push(entry);
    return entry.id;
  }

  function GM_setClipboard(text) {
    const str = text == null ? '' : String(text);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(str).catch(() => {
        try {
          const ta = document.createElement('textarea');
          ta.value = str;
          ta.style.setProperty('position', 'fixed', 'important');
          ta.style.setProperty('opacity', '0', 'important');
          (document.body || document.documentElement).appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        } catch (_) {}
      });
    }
    return Promise.resolve();
  }

  function GM_openInTab(url, options) {
    const targetUrl = String(url || '');
    if (!targetUrl) return null;
    if (__PAKE_SHELL_OPEN__) {
      try {
        Promise.resolve(__PAKE_SHELL_OPEN__(targetUrl)).catch(() => {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        });
        return { close() {} };
      } catch (_) {}
    }
    const active = typeof options === 'boolean' ? !options : options?.active;
    const win = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (win && active === false && typeof win.blur === 'function') {
      try { win.blur(); } catch (_) {}
    }
    return win;
  }

  function __buildXhrResponse(details, res) {
    const responseText = typeof res.responseText === 'string' ? res.responseText : '';
    let response = responseText;
    const rType = (details.responseType || '').toLowerCase();

    if (rType === 'json') {
      try {
        response = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;
      } catch (_) {
        response = null;
      }
    } else if (rType === 'arraybuffer') {
      response = new TextEncoder().encode(responseText).buffer;
    } else if (rType === 'blob') {
      response = new Blob([responseText]);
    }

    return {
      readyState: 4,
      status: res.status ?? 200,
      statusText: res.statusText ?? 'OK',
      finalUrl: res.finalUrl || details.url,
      responseHeaders: res.responseHeaders || '',
      responseText,
      response,
      context: details.context
    };
  }

  function GM_xmlhttpRequest(details) {
    if (!details || !details.url) {
      return { abort() {} };
    }

    let aborted = false;
    let timedOut = false;
    let timeoutId = null;
    const abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      __ACTIVE_XHR_SET__.delete(handle);
    };

    const handle = {
      abort() {
        if (aborted) return;
        aborted = true;
        cleanup();
        if (abortCtrl) {
          try { abortCtrl.abort(); } catch (_) {}
        }
        if (typeof details.onabort === 'function') {
          try { details.onabort({ readyState: 4, status: 0, context: details.context }); } catch (_) {}
        }
      }
    };

    __ACTIVE_XHR_SET__.add(handle);

    if (typeof details.timeout === 'number' && details.timeout > 0) {
      timeoutId = setTimeout(() => {
        if (aborted) return;
        timedOut = true;
        cleanup();
        if (abortCtrl) {
          try { abortCtrl.abort(); } catch (_) {}
        }
        if (typeof details.ontimeout === 'function') {
          try { details.ontimeout({ readyState: 4, status: 0, context: details.context }); } catch (_) {}
        }
      }, details.timeout);
    }

    const method = (details.method || 'GET').toUpperCase();
    const headers = details.headers ? { ...details.headers } : {};
    const body = details.data !== undefined ? details.data : null;

    const run = async () => {
      try {
        let result;
        if (__PAKE_INVOKE__) {
          const proxyBody =
            body === null || body === undefined
              ? null
              : typeof body === 'string'
                ? body
                : String(body);

          const res = await __PAKE_INVOKE__('proxy_http', {
            req: {
              url: details.url,
              method,
              headers,
              body: proxyBody
            }
          });
          result = __buildXhrResponse(details, res || {});
        } else {
          const fetchOpts = {
            method,
            headers,
            signal: abortCtrl ? abortCtrl.signal : undefined
          };
          if (method !== 'GET' && method !== 'HEAD' && body !== null) {
            fetchOpts.body = body;
          }
          const resp = await fetch(details.url, fetchOpts);
          const responseText = await resp.text();
          let headerStr = '';
          resp.headers.forEach((v, k) => {
            headerStr += `${k}: ${v}\r\n`;
          });
          result = __buildXhrResponse(details, {
            status: resp.status,
            statusText: resp.statusText,
            finalUrl: resp.url || details.url,
            responseHeaders: headerStr,
            responseText
          });
        }

        cleanup();
        if (aborted || timedOut) return;

        if (typeof details.onreadystatechange === 'function') {
          try { details.onreadystatechange(result); } catch (_) {}
        }
        if (typeof details.onload === 'function') {
          try { details.onload(result); } catch (_) {}
        }
      } catch (err) {
        cleanup();
        if (aborted || timedOut) return;
        if (typeof details.onerror === 'function') {
          try {
            details.onerror({
              readyState: 4,
              status: 0,
              statusText: err?.message || 'Network Error',
              error: err,
              context: details.context
            });
          } catch (_) {}
        }
      }
    };

    run();
    return handle;
  }

  function GM_download(arg1, arg2) {
    const opts = typeof arg1 === 'string' ? { url: arg1, name: arg2 } : (arg1 || {});
    if (!opts.url) return { abort() {} };

    const triggerSave = (blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = opts.name || 'download';
      a.style.setProperty('display', 'none', 'important');
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(blobUrl);
      }, 1500);
      if (typeof opts.onload === 'function') {
        try { opts.onload(); } catch (_) {}
      }
    };

    return GM_xmlhttpRequest({
      url: opts.url,
      method: 'GET',
      headers: opts.headers,
      responseType: 'blob',
      onload(res) {
        const blob = res.response instanceof Blob ? res.response : new Blob([res.responseText || '']);
        triggerSave(blob);
      },
      onerror(err) {
        if (typeof opts.onerror === 'function') {
          try { opts.onerror(err); } catch (_) {}
        }
      }
    });
  }

  const GM = {
    async getValue(key, defaultValue) {
      await __KV_READY__;
      return GM_getValue(key, defaultValue);
    },
    async setValue(key, value) {
      GM_setValue(key, value);
    },
    async deleteValue(key) {
      GM_deleteValue(key);
    },
    async listValues() {
      await __KV_READY__;
      return GM_listValues();
    },
    async addStyle(css) {
      return GM_addStyle(css);
    },
    async registerMenuCommand(caption, onClick) {
      return GM_registerMenuCommand(caption, onClick);
    },
    async setClipboard(text) {
      return GM_setClipboard(text);
    },
    async openInTab(url, options) {
      return GM_openInTab(url, options);
    },
    xmlHttpRequest(details) {
      let ctrl;
      const promise = new Promise((resolve, reject) => {
        ctrl = GM_xmlhttpRequest({
          ...details,
          onload(res) {
            if (typeof details.onload === 'function') details.onload(res);
            resolve(res);
          },
          onerror(err) {
            if (typeof details.onerror === 'function') details.onerror(err);
            reject(err);
          },
          ontimeout(err) {
            if (typeof details.ontimeout === 'function') details.ontimeout(err);
            reject(err);
          }
        });
      });
      promise.abort = () => ctrl && ctrl.abort();
      return promise;
    },
    download(arg1, arg2) {
      return GM_download(arg1, arg2);
    }
  };

  /* =========================================================================
     4. POST TOOLS APPLICATION (PURE DOM, TRUSTED TYPES SAFE, STRICT TWEET TARGETING)
     ========================================================================= */
  (function () {
    'use strict';

    function onBodyReady(fn) {
      if (document.body) return fn();
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    }

    function el(tag, props, children) {
      const node = document.createElement(tag);
      if (props) {
        for (const [k, v] of Object.entries(props)) {
          if (k === 'className') node.className = v;
          else if (k === 'textContent') node.textContent = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
          else node.setAttribute(k, String(v));
        }
      }
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        }
      }
      return node;
    }

    // Safe bold + newline renderer (zero innerHTML / zero Trusted Types errors)
    function appendFormattedText(container, rawText) {
      const lines = String(rawText || '').split('\n');
      lines.forEach((line, idx) => {
        if (idx > 0) container.appendChild(document.createElement('br'));
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        for (const part of parts) {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            container.appendChild(el('strong', { textContent: part.slice(2, -2) }));
          } else if (part) {
            container.appendChild(document.createTextNode(part));
          }
        }
      });
    }

    // ==========================================
    // 1. PLATFORM DETECTION
    // ==========================================
    const PLATFORM = (() => {
      const h = location.hostname;
      if (h.includes('twitter.com') || h.includes('x.com')) return 'twitter';
      if (h.includes('reddit.com')) return 'reddit';
      if (h.includes('facebook.com')) return 'facebook';
      return 'unknown';
    })();

    // ==========================================
    // 2. PLATFORM ADAPTERS (STRICT TARGETING — NEVER SIDEBAR OR AVATARS)
    // ==========================================
    const ADAPTERS = {
      twitter: {
        // Strictly target bottom action toolbars INSIDE actual tweets (never sidebar/profile role="group")
        anchorSelector: 'article[data-testid="tweet"] [role="group"]',
        alreadyTagged: 'data-ai-tools',
        getWrapper(node) {
          const tweet = node.closest('article[data-testid="tweet"]');
          if (!tweet) return null;
          // Exclude sidebars, modals without tweets, or account switchers
          if (node.closest('header[role="banner"], [data-testid="SideNav_AccountSwitcher_Button"], nav')) {
            return null;
          }
          const group = node.closest('[role="group"]');
          if (!group || !tweet.contains(group)) return null;
          // Verify this group is the actual tweet action bar (has reply/like/retweet/bookmark)
          if (!group.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="retweet"], [data-testid="bookmark"]')) {
            return null;
          }
          return group;
        },
        getText(wrapper) {
          const article = wrapper.closest('article[data-testid="tweet"]');
          if (!article) return '';
          const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
          if (textNodes.length > 0) {
            return Array.from(textNodes).map((n) => n.innerText.trim()).filter(Boolean).join('\n\n');
          }
          return article.innerText.trim();
        },
        injectBtn(wrapper, btn) {
          wrapper.appendChild(btn);
        }
      },

      reddit: {
        anchorSelector: [
          'shreddit-post-action-row',
          'shreddit-post',
          'button[aria-label="More options"]',
          'ul.flat-list.buttons'
        ].join(', '),
        alreadyTagged: 'data-ai-tools',
        getWrapper(node) {
          const tag = node.tagName ? node.tagName.toLowerCase() : '';
          if (tag === 'shreddit-post') {
            return node.querySelector('shreddit-post-action-row, [slot="credit-bar"]') || node;
          }
          if (tag === 'shreddit-post-action-row') return node;
          if (node.matches('button[aria-label="More options"]')) {
            return node.closest('[data-click-id="body"]') || node.closest('.Post') || node.parentElement;
          }
          if (node.matches('ul.flat-list.buttons')) return node;
          return node.parentElement || node;
        },
        getText(wrapper) {
          const shPost = wrapper.closest('shreddit-post');
          if (shPost) {
            const title = shPost.getAttribute('post-title') || shPost.getAttribute('title') || shPost.querySelector('h1, h2')?.innerText || '';
            const slot = shPost.querySelector('[slot="text-body"]');
            const bodyText = slot ? slot.innerText.trim() : '';
            return [title, bodyText].filter(Boolean).join('\n\n').trim();
          }
          const body = wrapper.closest('.Post') || wrapper.closest('[data-testid="post-container"]');
          if (body) {
            const textEl = body.querySelector('[data-click-id="text"] p, .RichTextJSON-root p');
            const titleEl = body.querySelector('h3, h1, [data-adclicklocation="title"]');
            return [titleEl?.innerText, textEl?.innerText].filter(Boolean).join('\n').trim();
          }
          const entry = wrapper.closest('.entry, .thing');
          if (entry) {
            return [entry.querySelector('a.title')?.innerText, entry.querySelector('.usertext-body .md')?.innerText].filter(Boolean).join('\n').trim();
          }
          return '';
        },
        injectBtn(wrapper, btn) {
          if (wrapper.tagName === 'UL' && wrapper.classList.contains('buttons')) {
            const li = document.createElement('li');
            li.appendChild(btn);
            wrapper.appendChild(li);
            return;
          }
          wrapper.appendChild(btn);
        }
      },

      facebook: {
        anchorSelector: [
          '[role="article"] [aria-label^="Actions for this post"][role="button"]',
          '[role="article"] [aria-label*="Actions for this post"]',
          '[data-pagelet^="FeedUnit"] [aria-label*="Actions for this post"]'
        ].join(', '),
        alreadyTagged: 'data-ai-tools',
        getWrapper(node) {
          if (!node.closest('[role="article"], [data-pagelet^="FeedUnit"]')) return null;
          const nativeRow = node.closest('.xqcrz7y') || node.closest('[role="toolbar"]') || node.parentElement;
          if (nativeRow && nativeRow.parentElement) return nativeRow.parentElement;
          return node.parentElement?.parentElement?.parentElement || node.parentElement;
        },
        getText(wrapper) {
          const post = wrapper.closest('[role="article"], [data-pagelet^="FeedUnit"], [data-tracking-duration-id], article, .userContentWrapper')
            || (() => {
              let curr = wrapper;
              for (let i = 0; i < 8; i++) {
                if (!curr || !curr.parentElement || curr.parentElement === document.body) break;
                curr = curr.parentElement;
                if (curr.getAttribute('role') === 'article' || curr.getAttribute('data-pagelet')?.startsWith('FeedUnit')) return curr;
                if (curr.getAttribute('role') === 'feed' || curr.getAttribute('role') === 'main') break;
              }
              return curr || wrapper;
            })();

          if (!post) return '';

          const messageSelectors = [
            '[data-ad-rendering-role="story_message"]',
            '[data-ad-comet-preview="message"]',
            '[data-ad-preview="message"]',
            '[data-testid="post_message"]',
            '.userContent',
            'div[style*="text-align: start"][dir="auto"]'
          ];

          for (const sel of messageSelectors) {
            const msgEl = post.querySelector(sel);
            if (msgEl) {
              const txt = msgEl.innerText.trim();
              if (txt.length > 5 && txt.toLowerCase() !== 'facebook') return txt;
            }
          }

          const candidates = [];
          const dirNodes = post.querySelectorAll('[dir="auto"]');
          for (const node of dirNodes) {
            if (node.closest('h2, h3, h4, header, [data-ad-rendering-role="profile_name"], [role="toolbar"], [role="button"], .ai-tools-action-btn-wrap, form, ul')) {
              continue;
            }
            const txt = node.innerText.trim();
            if (txt.length > 5 && txt.toLowerCase() !== 'facebook' && !txt.startsWith('http')) {
              candidates.push(txt);
            }
          }

          if (candidates.length > 0) {
            candidates.sort((a, b) => b.length - a.length);
            return candidates[0];
          }
          return '';
        },
        injectBtn(wrapper, btn) {
          const nativeRow = wrapper.querySelector('.xqcrz7y');
          if (nativeRow) {
            wrapper.insertBefore(btn, nativeRow);
          } else {
            const anchor = wrapper.querySelector('[aria-label*="Actions for this post"]') || wrapper.firstElementChild;
            if (anchor) wrapper.insertBefore(btn, anchor);
            else wrapper.appendChild(btn);
          }
        }
      }
    };

    const ADAPTER = ADAPTERS[PLATFORM];

    // ==========================================
    // 3. CONSTANTS & DATA
    // ==========================================
    const MODEL_OPTIONS = {
      gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
      openrouter: ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat', 'anthropic/claude-3.5-haiku'],
      groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant'],
      cerebras: ['gpt-oss-120b', 'llama3.1-8b', 'llama-3.3-70b']
    };

    const DEFAULT_SETTINGS = {
      apiMode: 'Hybrid',
      geminiKey: '',
      geminiModel: 'gemini-2.5-flash-lite',
      openrouterKey: '',
      openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
      groqKey: '',
      groqModel: 'llama-3.3-70b-versatile',
      cerebrasKey: '',
      cerebrasModel: 'gpt-oss-120b',
      enableCopy: true,
      enableTruth: true,
      enableExplain: true,
      enableReply: true,
      enableTwitter: true,
      enableReddit: true,
      enableFacebook: true,
      explainDepth: 'Detailed',
      maxQuestions: 3,
      uiFont: 'inherit',
      uiWidth: 450,
      uiHeight: 550,
      uiButtonSize: 'M',
      themeMode: 'Auto'
    };

    const TONE_LIBRARY = [
      { group: 'Neutral & Informational', tones: ['Professional', 'Formal', 'Factual', 'Informative', 'Academic', 'Analytical', 'Objective', 'Measured', 'Precise', 'Serious'] },
      { group: 'Conversational & Social', tones: ['Casual', 'Friendly', 'Warm', 'Approachable', 'Playful', 'Witty', 'Humorous', 'Bantering', 'Quirky', 'Charming'] },
      { group: 'Positive Emotional', tones: ['Happy', 'Joyful', 'Cheerful', 'Optimistic', 'Encouraging', 'Hopeful', 'Grateful', 'Appreciative', 'Proud', 'Excited'] },
      { group: 'Affection & Romantic', tones: ['Affectionate', 'Loving', 'Romantic', 'Flirty', 'Tender', 'Adoring', 'Admiring', 'Devoted', 'Heartwarming', 'Passionate'] },
      { group: 'Reflective & Thoughtful', tones: ['Thoughtful', 'Reflective', 'Contemplative', 'Philosophical', 'Introspective', 'Nostalgic', 'Poignant', 'Sentimental', 'Meditative', 'Pensive'] },
      { group: 'Negative Emotional', tones: ['Angry', 'Irritated', 'Frustrated', 'Resentful', 'Bitter', 'Cynical', 'Melancholic', 'Sad', 'Grieving', 'Miserable'] },
      { group: 'Fear & Anxiety', tones: ['Anxious', 'Nervous', 'Worried', 'Uneasy', 'Tense', 'Suspenseful', 'Alarmed', 'Horrified', 'Panicked', 'Apprehensive'] },
      { group: 'Cold or Detached', tones: ['Cold', 'Detached', 'Indifferent', 'Distant', 'Curt', 'Blunt', 'Stoic', 'Matter-of-fact', 'Unemotional', 'Apathetic'] },
      { group: 'Critical & Confrontational', tones: ['Critical', 'Skeptical', 'Questioning', 'Doubtful', 'Sarcastic', 'Ironic', 'Satirical', 'Mocking', 'Scornful', 'Disrespectful'] },
      { group: 'Bold or Aggressive', tones: ['Bold', 'Assertive', 'Audacious', 'Defiant', 'Rebellious', 'Provocative', 'Edgy', 'Challenging', 'Boastful', 'Arrogant'] },
      { group: 'Dramatic & Literary', tones: ['Dramatic', 'Poetic', 'Elegant', 'Allusive', 'Mysterious', 'Ominous', 'Grim', 'Tragic', 'Fanciful', 'Whimsical'] },
      { group: 'Response / Dialogue', tones: ['Agreement', 'Disagreement', 'Accepting', 'Supportive', 'Empathetic', 'Apologetic', 'Puzzled', 'Curious', 'Incredulous', 'Persuasive'] },
      { group: 'Specialized', tones: ['Condescending', 'Patronizing', 'Reverent', 'Respectful', 'Inspirational', 'Motivational', 'Resigned', 'Awestruck', 'Shocked', 'Confessional'] }
    ];

    const REPLY_LABELS = {
      twitter:  { name: 'Tweet',   charLimit: 280,   limitNote: 'Must be under 280 characters (Twitter limit).' },
      reddit:   { name: 'Comment', charLimit: 10000, limitNote: 'Reddit comments can be long — aim for quality over brevity.' },
      facebook: { name: 'Comment', charLimit: 8000,  limitNote: 'Facebook comments can be conversational and a few sentences long.' }
    };
    const REPLY_LABEL = REPLY_LABELS[PLATFORM] || { name: 'Reply', charLimit: 1000, limitNote: '' };

    const HUMANIZER_PROMPT = `
Act as a world-class text humanizer. Your expertise lies in converting machine-generated content into natural, nuanced, and emotionally resonant writing that is indistinguishable from authentic human prose. Your goal is to maintain the core meaning while ensuring the output flows spontaneously and feels written in-the-moment—always with logical structure, emotional subtlety, and cultural context.

OUTPUT REQUIREMENTS:
- Use a conversational, spontaneous tone. Include contractions, idioms, and colloquial expressions.
- Mix formal and casual phrasing naturally. Include mild contradictions that are later explained for realism.
- Mimic human imperfections like slightly informal phrasing, redundancy, or unexpected transitions.
- Vary sentence length and structure (short bursts + long meandering ones). Aim for high perplexity and burstiness.
- Ensure the result passes as something written spontaneously by a thoughtful human — not a machine.
- Avoid marketing clichés, excessive adverbs, buzzwords. Embrace clear, direct sentences.
`;

    // ==========================================
    // 4. SETTINGS MANAGER
    // ==========================================
    const Settings = {
      get(key) {
        const v = GM_getValue(`x_adv_${key}`, DEFAULT_SETTINGS[key]);
        return v === undefined ? DEFAULT_SETTINGS[key] : v;
      },
      set(key, val) { GM_setValue(`x_adv_${key}`, val); },
      getAll() {
        const cfg = {};
        for (const k in DEFAULT_SETTINGS) cfg[k] = this.get(k);
        return cfg;
      }
    };

    // ==========================================
    // 5. CSS INJECTION
    // ==========================================
    GM_addStyle(`
      .ai-tools-panel {
        position: fixed; z-index: 2147483647; border-radius: 12px;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 12px 36px rgba(0,0,0,0.72);
        background: #1a1a2e !important;
        color: #e8e8f0 !important;
        border: 1px solid #2d2d4e !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .ai-tools-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; border-bottom: 1px solid #2d2d4e;
        font-weight: bold; font-size: 13px;
        background: #16213e; color: #e8e8f0;
        cursor: move; user-select: none;
      }
      .ai-tools-body {
        flex: 1; overflow-y: auto; padding: 14px;
        display: flex; flex-direction: column; gap: 10px;
        background: #1a1a2e;
      }
      .ai-tools-footer {
        padding: 10px 14px; border-top: 1px solid #2d2d4e;
        display: flex; gap: 8px; align-items: center;
        background: #16213e;
      }
      .ai-tools-btn-chrome {
        background: none; border: none; cursor: pointer; padding: 4px 6px;
        border-radius: 6px; display: flex; align-items: center; justify-content: center;
        transition: background 0.15s; color: #a0a0c0;
      }
      .ai-tools-btn-chrome:hover { background: rgba(255,255,255,0.1); color: #fff; }
      .ai-tools-chat-msg {
        padding: 8px 12px; border-radius: 10px; max-width: 92%;
        line-height: 1.5; font-size: 13px; margin-bottom: 4px;
        word-wrap: break-word;
      }
      .ai-tools-chat-user { align-self: flex-end; background: #1da1f2; color: #fff; }
      .ai-tools-chat-bot  { align-self: flex-start; background: #252542; color: #e8e8f0; }
      .ai-tools-input {
        flex: 1; border: 1px solid #3d3d6e; border-radius: 18px;
        padding: 7px 12px; background: #252542; outline: none;
        font-size: 13px; color: #e8e8f0;
      }
      .ai-tools-input::placeholder { color: #6060a0; }
      .ai-tools-chip {
        display: inline-block; padding: 3px 9px; border-radius: 14px;
        font-size: 11px; cursor: pointer; border: 1px solid #3d3d6e;
        margin: 2px; user-select: none; transition: all 0.15s;
        color: #a0a0c0; background: #252542;
      }
      .ai-tools-chip:hover { border-color: #1da1f2; color: #1da1f2; }
      .ai-tools-chip.active { background: #1da1f2; color: #fff; border-color: #1da1f2; }
      .ai-tools-group summary { font-size: 12px; font-weight: bold; cursor: pointer; margin-bottom: 4px; padding-top: 6px; color: #c0c0e0; }
      .ai-tools-qa summary { cursor: pointer; color: #1da1f2; font-weight: bold; font-size: 13px; margin-top: 6px; }
      .ai-tools-qa p { margin: 5px 0 0 10px; padding-left: 10px; border-left: 2px solid #1da1f2; font-size: 12px; color: #c0c0e0; }
      .ai-tools-settings {
        display: none; padding: 14px; border-bottom: 1px solid #2d2d4e;
        font-size: 12px; flex-direction: column; gap: 10px;
        flex: 1; overflow-y: auto;
        background: #12122a; color: #e8e8f0;
      }
      .ai-tools-settings.active { display: flex; }
      .ai-tools-settings label { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: #c0c0e0; }
      .ai-tools-settings input[type="text"], .ai-tools-settings input[type="password"], .ai-tools-settings input[type="number"], .ai-tools-settings select {
        padding: 5px 7px; border-radius: 4px;
        background: #252542; border: 1px solid #3d3d6e;
        color: #e8e8f0; flex: 1; max-width: 60%; font-size: 12px;
      }
      .ai-tools-api-wrap { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px dashed #3d3d6e; border-radius: 6px; }
      .ai-tools-error { color: #ff6b6b; padding: 10px; background: rgba(255,107,107,0.1); border-radius: 8px; font-size: 12px; border: 1px solid #ff6b6b; }
      .ai-tools-toast { color: #00ba7c; font-size: 12px; text-align: center; min-height: 16px; }

      /* ─── INJECTED ACTION BUTTONS (DESKTOP-COMPACT) ─── */
      .ai-tools-action-btn-wrap {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        gap: 3px;
        margin-left: 6px;
      }
      .ai-tools-action-btn {
        display: inline-flex; align-items: center; justify-content: center;
        background: transparent; border: 1px solid rgba(128,128,128,0.35);
        border-radius: 4px; cursor: pointer; font-size: 11px;
        font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #71767b; line-height: 1; transition: all 0.12s;
        user-select: none; padding: 0; width: 20px; height: 20px;
        box-sizing: border-box; vertical-align: middle;
      }
      .ai-tools-action-btn:hover { background: rgba(29,161,242,0.14); color: #1da1f2; border-color: #1da1f2; }

      /* REDDIT */
      shreddit-post .ai-tools-action-btn-wrap {
        align-self: center; margin-right: 8px; gap: 4px;
      }
      shreddit-post .ai-tools-action-btn {
        width: 24px; height: 24px; font-size: 11px; border-radius: 5px;
        color: var(--color-neutral-content-weak, #71767b);
        border: 1px solid rgba(128,128,128,0.4);
      }
      shreddit-post .ai-tools-action-btn:hover {
        background: rgba(255,69,0,0.12); color: #ff4500; border-color: #ff4500;
      }

      /* FACEBOOK */
      .xqcrz7y { overflow: visible !important; }
      .xqcrz7y ~ .ai-tools-action-btn-wrap, [data-ai-tools] > .ai-tools-action-btn-wrap {
        align-self: center; margin-right: 4px;
      }
    `);

    // ==========================================
    // 6. API SERVICE (ROUTED VIA PAKE proxy_http)
    // ==========================================
    const CACHE = new Map();
    const API_TIMEOUT_MS = 30000;

    const API = {
      async chat(history, config, expectJson = false) {
        const cacheKey = JSON.stringify({
          history, mode: config.apiMode, expectJson,
          gModel: config.groqModel, cModel: config.cerebrasModel,
          oModel: config.openrouterModel, geModel: config.geminiModel
        });
        if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

        const mode = config.apiMode;
        let response;
        try {
          if (mode === 'OpenRouter') {
            response = await this.callOpenAIFormat(history, config.openrouterKey, config.openrouterModel || 'meta-llama/llama-3.3-70b-instruct', 'https://openrouter.ai/api/v1/chat/completions', 'OpenRouter', expectJson);
          } else if (mode === 'Groq') {
            response = await this.callOpenAIFormat(history, config.groqKey, config.groqModel || 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1/chat/completions', 'Groq', expectJson);
          } else if (mode === 'Cerebras') {
            response = await this.callOpenAIFormat(history, config.cerebrasKey, config.cerebrasModel || 'gpt-oss-120b', 'https://api.cerebras.ai/v1/chat/completions', 'Cerebras', expectJson);
          } else if (mode === 'Gemini') {
            response = await this.callGemini(history, config.geminiKey, config.geminiModel || 'gemini-2.5-flash-lite', expectJson);
          } else {
            // Hybrid: try all configured providers in order
            const providers = [];
            if (config.geminiKey) providers.push(() => this.callGemini(history, config.geminiKey, config.geminiModel || 'gemini-2.5-flash-lite', expectJson));
            if (config.openrouterKey) providers.push(() => this.callOpenAIFormat(history, config.openrouterKey, config.openrouterModel || 'meta-llama/llama-3.3-70b-instruct', 'https://openrouter.ai/api/v1/chat/completions', 'OpenRouter', expectJson));
            if (config.groqKey) providers.push(() => this.callOpenAIFormat(history, config.groqKey, config.groqModel || 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1/chat/completions', 'Groq', expectJson));
            if (config.cerebrasKey) providers.push(() => this.callOpenAIFormat(history, config.cerebrasKey, config.cerebrasModel || 'gpt-oss-120b', 'https://api.cerebras.ai/v1/chat/completions', 'Cerebras', expectJson));

            if (providers.length === 0) {
              throw new Error('No API key configured. Click ⚙️ to add a Gemini, OpenRouter, Groq, or Cerebras key.');
            }

            let lastErr = null;
            for (const attempt of providers) {
              try {
                response = await attempt();
                lastErr = null;
                break;
              } catch (err) {
                lastErr = err;
              }
            }
            if (lastErr) throw lastErr;
          }

          CACHE.set(cacheKey, response);
          return response;
        } catch (error) {
          throw new Error(this.formatErrorMessage(error.message));
        }
      },

      async callGemini(history, key, model, expectJson) {
        if (!key) throw new Error('Gemini API Key is missing. Please click ⚙️ to set it.');
        const contents = history.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'POST',
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ contents }),
            responseType: 'json',
            timeout: API_TIMEOUT_MS,
            onload: (res) => {
              if (res.status !== 200) return reject(new Error(res.response?.error?.message || `Gemini API Error (${res.status})`));
              const text = res.response?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (!text) return reject(new Error('Empty content returned from Gemini.'));
              try {
                resolve(expectJson ? this.extractJson(text) : this.cleanThinking(text));
              } catch (e) {
                reject(new Error('Failed to parse JSON response from Gemini.'));
              }
            },
            ontimeout: () => reject(new Error('Gemini request timed out.')),
            onerror: () => reject(new Error('Network Error contacting Gemini.'))
          });
        });
      },

      async callOpenAIFormat(history, key, model, endpoint, providerName, expectJson) {
        if (!key) throw new Error(`${providerName} API Key is missing. Please click ⚙️ to set it.`);
        const payload = { model, messages: history };
        if (expectJson) payload.response_format = { type: 'json_object' };

        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
        if (endpoint.includes('openrouter.ai')) {
          headers['HTTP-Referer'] = window.location.origin || 'https://github.com';
          headers['X-Title'] = 'Post Tools';
        }

        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'POST',
            url: endpoint,
            headers,
            data: JSON.stringify(payload),
            responseType: 'json',
            timeout: API_TIMEOUT_MS,
            onload: (res) => {
              if (res.status === 402) return reject(new Error(`HTTP 402 Payment Required on ${providerName}.`));
              if (res.status !== 200) return reject(new Error(res.response?.error?.message || `${providerName} API Error (${res.status})`));
              const text = res.response?.choices?.[0]?.message?.content;
              if (!text) return reject(new Error(`Empty content returned from ${providerName}.`));
              try {
                resolve(expectJson ? this.extractJson(text) : this.cleanThinking(text));
              } catch (e) {
                reject(new Error(`Failed to parse JSON response from ${providerName}.`));
              }
            },
            ontimeout: () => reject(new Error(`${providerName} request timed out.`)),
            onerror: () => reject(new Error(`Network Error contacting ${providerName}.`))
          });
        });
      },

      extractJson(text) {
        let clean = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        clean = clean.replace(/<think>[\s\S]*?<\/think>\n?/gi, '').trim();
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          clean = clean.slice(firstBrace, lastBrace + 1);
        }
        return JSON.parse(clean);
      },
      cleanThinking(text) {
        return String(text || '').replace(/<think>[\s\S]*?<\/think>\n?/gi, '').trim();
      },
      formatErrorMessage(msg) {
        if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
          return 'API Rate Limit Exceeded. Switch to Hybrid mode in ⚙️ Settings for auto failover.';
        }
        return msg;
      }
    };

    // ==========================================
    // 7. UI RENDERER & SETTINGS (100% PURE DOM)
    // ==========================================
    const UI = {
      getTheme() {
        const accent = { twitter: '#1da1f2', reddit: '#ff4500', facebook: '#1877f2' }[PLATFORM] || '#1da1f2';
        return { bg: '#1a1a2e', text: '#e8e8f0', border: '#2d2d4e', header: '#16213e', accent };
      },

      createActionButton(label, icon) {
        const btn = document.createElement('button');
        btn.className = 'ai-tools-action-btn';
        btn.title = label;
        btn.textContent = icon;
        return btn;
      },

      buildPanel(title, anchorEl, isGlobal = false) {
        document.querySelectorAll('.ai-tools-panel').forEach((p) => p.remove());
        const th = this.getTheme();
        const cfg = Settings.getAll();

        const pW = Math.min(cfg.uiWidth, window.innerWidth * 0.95);
        const pH = Math.min(cfg.uiHeight, window.innerHeight * 0.90);

        let top = 0, left = 0;
        if (isGlobal || !anchorEl || anchorEl === document.body) {
          left = (window.innerWidth - pW) / 2;
          top = (window.innerHeight - pH) / 2;
        } else {
          const rect = anchorEl.getBoundingClientRect();
          top = rect.bottom + 8;
          left = rect.right - pW;
          if (window.innerWidth < 600) {
            left = (window.innerWidth - pW) / 2;
            top = (window.innerHeight - pH) / 2;
          } else {
            if (left < 10) left = 10;
            if (left + pW > window.innerWidth - 10) left = window.innerWidth - pW - 10;
            if (top + pH > window.innerHeight - 10) {
              top = rect.top - pH - 8;
              if (top < 10) top = 10;
            }
          }
        }

        const panel = el('div', {
          className: 'ai-tools-panel',
          style: {
            top: `${top}px`, left: `${left}px`,
            width: `${pW}px`, height: `${pH}px`,
            maxWidth: '95vw', maxHeight: '90vh'
          }
        });

        const platformBadge = { twitter: '𝕏', reddit: '🔴 Reddit', facebook: '📘 Facebook' }[PLATFORM] || '';

        // Header (Draggable)
        const settingsBtn = el('button', { className: 'ai-tools-btn-chrome ai-btn-settings', title: 'Settings', textContent: '⚙️' });
        const closeBtn = el('button', { className: 'ai-tools-btn-chrome ai-btn-close', title: 'Close', textContent: '✖' });
        const header = el('div', {
          className: 'ai-tools-header',
          style: { borderBottom: `2px solid ${th.accent}` }
        }, [
          el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
            el('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: th.accent, display: 'inline-block' } }),
            document.createTextNode(`${platformBadge} ${title}`)
          ]),
          el('div', { style: { display: 'flex', gap: '6px' } }, [settingsBtn, closeBtn])
        ]);

        // Settings Panel
        const settingsDiv = el('div', { className: 'ai-tools-settings' });
        settingsDiv.appendChild(el('strong', { textContent: 'API Settings', style: { marginBottom: '2px', fontSize: '13px', color: th.accent } }));

        const modeSelect = el('select', { id: 'ai-cfg-mode' }, [
          el('option', { value: 'Gemini', textContent: 'Gemini' }),
          el('option', { value: 'OpenRouter', textContent: 'OpenRouter' }),
          el('option', { value: 'Groq', textContent: 'Groq' }),
          el('option', { value: 'Cerebras', textContent: 'Cerebras' }),
          el('option', { value: 'Hybrid', textContent: 'Hybrid (Auto-Failover)' })
        ]);
        modeSelect.value = cfg.apiMode;
        settingsDiv.appendChild(el('label', null, [document.createTextNode('Mode:'), modeSelect]));

        const buildProviderBlock = (id, keyLabel, placeholder, keyVal, providerKey, modelVal, selId, inpId) => {
          const keyInp = el('input', { type: 'password', autocomplete: 'new-password', placeholder });
          keyInp.value = keyVal;

          const options = MODEL_OPTIONS[providerKey] || [];
          const isCustom = !options.includes(modelVal);
          const sel = el('select', { id: selId });
          for (const m of options) {
            const opt = el('option', { value: m, textContent: m });
            if (modelVal === m) opt.selected = true;
            sel.appendChild(opt);
          }
          const customOpt = el('option', { value: 'custom', textContent: 'Custom...' });
          if (isCustom) customOpt.selected = true;
          sel.appendChild(customOpt);

          const modelInp = el('input', { type: 'text', id: inpId, style: { marginTop: '2px' } });
          modelInp.value = modelVal;

          sel.addEventListener('change', () => {
            if (sel.value !== 'custom') modelInp.value = sel.value;
            else modelInp.focus();
          });

          const wrap = el('div', { id, className: 'ai-tools-api-wrap' }, [
            el('label', null, [document.createTextNode(keyLabel), keyInp]),
            el('label', null, [document.createTextNode('Model:'), sel]),
            el('label', null, [document.createTextNode('Model ID:'), modelInp])
          ]);
          return { wrap, keyInp, modelInp };
        };

        const gemBlock  = buildProviderBlock('ai-wrap-gemini', 'Gemini Key:', 'AIzaSy...', cfg.geminiKey, 'gemini', cfg.geminiModel, 'ai-cfg-gemm-sel', 'ai-cfg-gemm');
        const openBlock = buildProviderBlock('ai-wrap-openrouter', 'OpenRouter Key:', 'sk-or-v1-...', cfg.openrouterKey, 'openrouter', cfg.openrouterModel, 'ai-cfg-openm-sel', 'ai-cfg-openm');
        const groqBlock = buildProviderBlock('ai-wrap-groq', 'Groq Key:', 'gsk_...', cfg.groqKey, 'groq', cfg.groqModel, 'ai-cfg-grqm-sel', 'ai-cfg-grqm');
        const cerBlock  = buildProviderBlock('ai-wrap-cerebras', 'Cerebras Key:', 'csk_...', cfg.cerebrasKey, 'cerebras', cfg.cerebrasModel, 'ai-cfg-cerm-sel', 'ai-cfg-cerm');

        settingsDiv.append(gemBlock.wrap, openBlock.wrap, groqBlock.wrap, cerBlock.wrap);

        const refreshModeUI = () => {
          const v = modeSelect.value;
          gemBlock.wrap.style.display  = (v === 'Gemini' || v === 'Hybrid') ? 'flex' : 'none';
          openBlock.wrap.style.display = (v === 'OpenRouter' || v === 'Hybrid') ? 'flex' : 'none';
          groqBlock.wrap.style.display = (v === 'Groq' || v === 'Hybrid') ? 'flex' : 'none';
          cerBlock.wrap.style.display  = (v === 'Cerebras' || v === 'Hybrid') ? 'flex' : 'none';
        };
        modeSelect.addEventListener('change', refreshModeUI);
        refreshModeUI();

        settingsDiv.appendChild(el('strong', { textContent: 'Platforms & Buttons', style: { marginTop: '4px', fontSize: '13px', color: th.accent } }));

        const mkCheck = (txt, checked) => {
          const cb = el('input', { type: 'checkbox', style: { cursor: 'pointer' } });
          cb.checked = Boolean(checked);
          settingsDiv.appendChild(el('label', { style: { cursor: 'pointer' } }, [document.createTextNode(txt), cb]));
          return cb;
        };

        const cbTwitter  = mkCheck('Enable on X (Twitter):', cfg.enableTwitter);
        const cbReddit   = mkCheck('Enable on Reddit:', cfg.enableReddit);
        const cbFacebook = mkCheck('Enable on Facebook:', cfg.enableFacebook);
        const cbCopy     = mkCheck('Show Copy (C) Button:', cfg.enableCopy);
        const cbTruth    = mkCheck('Show Truth (✔) Button:', cfg.enableTruth);
        const cbExplain  = mkCheck('Show Explain (e) Button:', cfg.enableExplain);
        const cbReply    = mkCheck('Show Reply (R) Button:', cfg.enableReply);

        settingsDiv.appendChild(el('strong', { textContent: 'Display', style: { marginTop: '4px', fontSize: '13px', color: th.accent } }));
        const inpW = el('input', { type: 'number', value: cfg.uiWidth });
        inpW.value = String(cfg.uiWidth);
        const inpH = el('input', { type: 'number', value: cfg.uiHeight });
        inpH.value = String(cfg.uiHeight);
        settingsDiv.appendChild(el('label', null, [document.createTextNode('Width (px):'), inpW]));
        settingsDiv.appendChild(el('label', null, [document.createTextNode('Height (px):'), inpH]));

        const toastEl = el('div', { className: 'ai-tools-toast' });
        const saveBtn = el('button', {
          textContent: 'Save Settings',
          style: {
            marginTop: '4px', padding: '9px 8px', borderRadius: '8px', background: th.accent,
            color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold'
          }
        });
        settingsDiv.append(toastEl, saveBtn);

        const bodyDiv = el('div', { className: 'ai-tools-body' });

        const chatInput = el('input', {
          type: 'text', className: 'ai-tools-input', autocomplete: 'off', spellcheck: 'true',
          placeholder: 'Ask a follow-up…'
        });
        const sendBtn = el('button', {
          className: 'ai-tools-btn-chrome ai-btn-send', textContent: '➤',
          style: { color: th.accent, fontWeight: 'bold', fontSize: '15px' }
        });
        const footerDiv = el('div', { className: 'ai-tools-footer' }, [chatInput, sendBtn]);

        panel.append(header, settingsDiv, bodyDiv, footerDiv);
        document.body.appendChild(panel);

        closeBtn.onclick = (e) => { e.stopPropagation(); panel.remove(); };
        settingsBtn.onclick = (e) => {
          e.stopPropagation();
          const open = settingsDiv.classList.toggle('active');
          bodyDiv.style.display = open ? 'none' : 'flex';
          if (panel.dataset.mode !== 'reply') footerDiv.style.display = open ? 'none' : 'flex';
        };

        saveBtn.onclick = () => {
          Settings.set('apiMode', modeSelect.value);
          Settings.set('geminiKey', gemBlock.keyInp.value.trim());
          Settings.set('geminiModel', gemBlock.modelInp.value.trim());
          Settings.set('openrouterKey', openBlock.keyInp.value.trim());
          Settings.set('openrouterModel', openBlock.modelInp.value.trim());
          Settings.set('groqKey', groqBlock.keyInp.value.trim());
          Settings.set('groqModel', groqBlock.modelInp.value.trim());
          Settings.set('cerebrasKey', cerBlock.keyInp.value.trim());
          Settings.set('cerebrasModel', cerBlock.modelInp.value.trim());
          Settings.set('enableTwitter', cbTwitter.checked);
          Settings.set('enableReddit', cbReddit.checked);
          Settings.set('enableFacebook', cbFacebook.checked);
          Settings.set('enableCopy', cbCopy.checked);
          Settings.set('enableTruth', cbTruth.checked);
          Settings.set('enableExplain', cbExplain.checked);
          Settings.set('enableReply', cbReply.checked);
          Settings.set('uiWidth', Math.max(300, parseInt(inpW.value, 10) || 450));
          Settings.set('uiHeight', Math.max(300, parseInt(inpH.value, 10) || 550));

          toastEl.textContent = '✓ Settings saved!';
          setTimeout(() => {
            toastEl.textContent = '';
            settingsDiv.classList.remove('active');
            bodyDiv.style.display = 'flex';
            if (panel.dataset.mode !== 'reply') footerDiv.style.display = 'flex';
          }, 900);
        };

        // Drag panel by header
        let dragging = false, sx = 0, sy = 0, origL = 0, origT = 0;
        header.addEventListener('mousedown', (e) => {
          if (e.button !== 0 || e.target.closest('button')) return;
          dragging = true;
          sx = e.clientX;
          sy = e.clientY;
          const rect = panel.getBoundingClientRect();
          origL = rect.left;
          origT = rect.top;
          e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
          if (!dragging) return;
          const maxL = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
          const maxT = Math.max(8, window.innerHeight - 60);
          panel.style.left = `${Math.max(8, Math.min(origL + (e.clientX - sx), maxL))}px`;
          panel.style.top  = `${Math.max(8, Math.min(origT + (e.clientY - sy), maxT))}px`;
        });
        window.addEventListener('mouseup', () => { dragging = false; });

        return panel;
      },

      addMessage(body, role, contentNodeOrText) {
        const msg = el('div', { className: `ai-tools-chat-msg ai-tools-chat-${role}` });
        if (typeof contentNodeOrText === 'string') {
          msg.textContent = contentNodeOrText;
        } else if (contentNodeOrText instanceof Node) {
          msg.appendChild(contentNodeOrText);
        }
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
        return msg;
      },

      addError(targetMsg, prefix, errMessage) {
        targetMsg.replaceChildren();
        const errBox = el('div', { className: 'ai-tools-error' }, [
          el('strong', { textContent: prefix }),
          document.createElement('br'),
          document.createTextNode(errMessage)
        ]);
        targetMsg.appendChild(errBox);
      },

      bindChat(panel, chatHistory) {
        const input = panel.querySelector('.ai-tools-input');
        const btn   = panel.querySelector('.ai-btn-send');
        const body  = panel.querySelector('.ai-tools-body');

        const send = async (overrideText = null) => {
          const text = overrideText || input.value.trim();
          if (!text) return;
          input.value = '';
          this.addMessage(body, 'user', text);
          chatHistory.push({
            role: 'user',
            content: text + '\n\n(Note: Reply in natural plain text only. Do NOT output JSON. Do NOT show internal reasoning.)'
          });
          const loadMsg = this.addMessage(body, 'bot', el('span', { textContent: 'Thinking…', style: { opacity: '0.6' } }));

          try {
            const response = await API.chat(chatHistory, Settings.getAll(), false);
            chatHistory.push({ role: 'assistant', content: response });
            loadMsg.remove();
            const frag = document.createDocumentFragment();
            appendFormattedText(frag, response);
            this.addMessage(body, 'bot', frag);
          } catch (e) {
            this.addError(loadMsg, 'Error: ', e.message);
            chatHistory.pop();
          }
        };

        btn.onclick = () => send();
        input.onkeypress = (e) => { if (e.key === 'Enter') send(); };
        panel._sendChat = send;
      }
    };

    // ==========================================
    // 8. FEATURES (100% PURE DOM)
    // ==========================================
    const Features = {
      async runAnalysis(type, postText, anchorEl) {
        const config = Settings.getAll();
        const panel  = UI.buildPanel(type === 'truth' ? 'Truth Analysis' : 'Post Explanation', anchorEl);
        const body   = panel.querySelector('.ai-tools-body');
        const contentLabel = { twitter: 'tweet', reddit: 'post', facebook: 'post' }[PLATFORM] || 'post';

        const initialPrompt = type === 'truth'
          ? `Analyze the truthfulness of this ${contentLabel} objectively. Return JSON ONLY: {"score":<number 0-100>,"verdict":"<short verdict>","context":"<why>"}.\n${contentLabel}: "${postText}"`
          : `Analyze this ${contentLabel}. Depth: ${config.explainDepth}. Return JSON ONLY: {"summary":"<tldr>","key_points":["<pt>"],"context":"<bg>","qa":[{"q":"<ques>","a":"<ans>"}]}. Generate exactly ${config.maxQuestions} QA pairs.\n${contentLabel}: "${postText}"`;

        const chatHistory = [{ role: 'user', content: initialPrompt }];
        const loading = UI.addMessage(body, 'bot', el('span', { textContent: 'Analyzing…', style: { opacity: '0.6' } }));

        try {
          const data = await API.chat(chatHistory, config, true);
          chatHistory.push({ role: 'assistant', content: JSON.stringify(data) });
          chatHistory.push({ role: 'user', content: 'Thank you. For all subsequent questions, respond in natural plain text only. Do NOT output JSON or internal reasoning.' });
          chatHistory.push({ role: 'assistant', content: 'Understood.' });
          loading.remove();

          if (type === 'truth') {
            const score = Number(data.score) || 0;
            const color = score > 70 ? '#00ba7c' : score > 40 ? '#ffd400' : '#f4212e';
            const box = el('div', null, [
              el('div', { textContent: `Score: ${score}% — ${data.verdict || ''}`, style: { fontSize: '18px', fontWeight: '800', color } }),
              el('p', { textContent: data.context || '', style: { marginTop: '8px', marginBottom: '0' } }),
              el('p', { textContent: 'AI models can have biases. Ask follow-up questions to challenge this score.', style: { marginTop: '10px', fontSize: '11px', opacity: '0.6', marginBottom: '0' } })
            ]);
            UI.addMessage(body, 'bot', box);
          } else {
            const box = el('div');
            box.appendChild(el('strong', { textContent: 'Summary: ' }));
            box.appendChild(document.createTextNode(data.summary || ''));
            box.appendChild(document.createElement('br'));
            box.appendChild(document.createElement('br'));

            box.appendChild(el('strong', { textContent: 'Key Points:' }));
            const ul = el('ul', { style: { marginTop: '4px', paddingLeft: '18px', marginBottom: '8px' } });
            for (const k of (data.key_points || [])) {
              ul.appendChild(el('li', { textContent: String(k) }));
            }
            box.appendChild(ul);

            box.appendChild(el('strong', { textContent: 'Context: ' }));
            box.appendChild(document.createTextNode(data.context || ''));

            if (Array.isArray(data.qa) && data.qa.length) {
              box.appendChild(document.createElement('br'));
              box.appendChild(document.createElement('br'));
              box.appendChild(el('strong', { textContent: 'Follow-up Q&A:' }));
              for (const item of data.qa) {
                const qSum = el('summary', { textContent: item.q || '' });
                qSum.addEventListener('click', (e) => {
                  e.preventDefault();
                  if (panel._sendChat) panel._sendChat(qSum.textContent);
                });
                box.appendChild(el('details', { className: 'ai-tools-qa' }, [
                  qSum,
                  el('p', { textContent: item.a || '' })
                ]));
              }
            }
            UI.addMessage(body, 'bot', box);
          }
          UI.bindChat(panel, chatHistory);
        } catch (err) {
          UI.addError(loading, 'Analysis failed:', err.message);
        }
      },

      openReplyGenerator(postText, anchorEl) {
        const panel = UI.buildPanel(`Generate ${REPLY_LABEL.name}`, anchorEl);
        panel.dataset.mode = 'reply';
        const body = panel.querySelector('.ai-tools-body');
        const th   = UI.getTheme();

        const footer = panel.querySelector('.ai-tools-footer');
        if (footer) footer.style.display = 'none';

        const replyUI = el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } });
        const toneHeader = el('div', { textContent: 'Select up to 3 tones:', style: { fontSize: '12px', marginBottom: '6px', fontWeight: 'bold' } });
        const toneBox = el('div', {
          style: { flex: '1', overflowY: 'auto', border: `1px solid ${th.border}`, padding: '8px', borderRadius: '8px', marginBottom: '10px' }
        });

        let selectedTones = [];
        const replyMsg = el('div', { className: 'ai-tools-toast' });

        for (const cat of TONE_LIBRARY) {
          const chipsWrap = el('div');
          for (const t of cat.tones) {
            const chip = el('span', { className: 'ai-tools-chip', textContent: t, style: { borderColor: th.border } });
            chip.addEventListener('click', () => {
              if (selectedTones.includes(t)) {
                selectedTones = selectedTones.filter((x) => x !== t);
                chip.classList.remove('active');
              } else {
                if (selectedTones.length >= 3) {
                  replyMsg.textContent = 'Max 3 tones allowed.';
                  setTimeout(() => { replyMsg.textContent = ''; }, 1800);
                  return;
                }
                selectedTones.push(t);
                chip.classList.add('active');
              }
            });
            chipsWrap.appendChild(chip);
          }
          const det = el('details', { className: 'ai-tools-group' }, [
            el('summary', { textContent: cat.group }),
            chipsWrap
          ]);
          det.open = true;
          toneBox.appendChild(det);
        }

        const mkLenRadio = (val, labelTxt, checked) => {
          const r = el('input', { type: 'radio', name: 'ai-r-len', value: val });
          if (checked) r.checked = true;
          return el('label', { style: { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
            r,
            document.createTextNode(labelTxt)
          ]);
        };

        const lenRow = el('div', {
          style: { display: 'flex', gap: '12px', fontSize: '12px', alignItems: 'center', marginBottom: '8px' }
        }, [
          el('strong', { textContent: 'Length:' }),
          mkLenRadio('short', 'Short', false),
          mkLenRadio('medium', 'Medium', true),
          mkLenRadio('long', 'Long', false)
        ]);

        const ctxArea = el('textarea', {
          placeholder: "Optional context or stance (e.g. 'I agree but...')",
          style: {
            width: '100%', height: '56px', borderRadius: '8px', padding: '8px',
            background: '#252542', color: th.text, border: `1px solid ${th.border}`,
            resize: 'none', boxSizing: 'border-box', fontSize: '12px'
          }
        });

        const btnGen = el('button', {
          textContent: `Generate ${REPLY_LABEL.name}`,
          style: {
            marginTop: '8px', width: '100%', padding: '9px', borderRadius: '18px',
            background: '#1da1f2', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer'
          }
        });

        const resultDiv = el('div', {
          style: { padding: '10px', borderRadius: '8px', background: 'rgba(128,128,128,0.12)', fontSize: '13px', marginBottom: '8px', userSelect: 'text' }
        });
        const copyBtn = el('button', {
          textContent: 'Copy',
          style: { padding: '5px 14px', borderRadius: '14px', background: 'transparent', border: `1px solid ${th.border}`, color: th.text, cursor: 'pointer', fontWeight: 'bold' }
        });
        const regenBtn = el('button', {
          textContent: 'Regenerate',
          style: { padding: '5px 14px', borderRadius: '14px', background: 'transparent', border: `1px solid ${th.border}`, color: th.text, cursor: 'pointer' }
        });

        const outputDiv = el('div', { style: { marginTop: '10px', display: 'none' } }, [
          resultDiv,
          el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [copyBtn, regenBtn])
        ]);

        replyUI.append(toneHeader, toneBox, lenRow, ctxArea, replyMsg, btnGen, outputDiv);
        body.appendChild(replyUI);

        let lastResultText = '';
        copyBtn.addEventListener('click', () => {
          if (!lastResultText) return;
          GM_setClipboard(lastResultText);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
        });

        const generate = async () => {
          if (selectedTones.length === 0) {
            replyMsg.textContent = 'Please select at least 1 tone.';
            setTimeout(() => { replyMsg.textContent = ''; }, 1800);
            return;
          }
          const checkedRadio = replyUI.querySelector('input[name="ai-r-len"]:checked');
          const len = checkedRadio ? checkedRadio.value : 'medium';
          const lenConstraint = len === 'short' ? 'under 120 chars' : len === 'medium' ? 'around 200–300 chars' : `long and detailed — ${REPLY_LABEL.limitNote}`;
          const ctx = ctxArea.value.trim();

          const prompt = `Write a ${REPLY_LABEL.name.toLowerCase()} to the following ${PLATFORM} post.\nOriginal: "${postText}"\nGuidelines: Tone: ${selectedTones.join(', ')}. Length: ${lenConstraint}. Context: ${ctx ? `"${ctx}"` : 'None.'}\nHUMANIZER DIRECTIVE:\n${HUMANIZER_PROMPT}\nReturn ONLY the plain ${REPLY_LABEL.name.toLowerCase()} text.`;

          btnGen.textContent = 'Generating…';
          btnGen.disabled = true;
          outputDiv.style.display = 'none';
          resultDiv.replaceChildren();

          try {
            const result = await API.chat([{ role: 'user', content: prompt }], Settings.getAll(), false);
            lastResultText = result;
            outputDiv.style.display = 'block';
            appendFormattedText(resultDiv, result);
            body.scrollTop = body.scrollHeight;
          } catch (err) {
            outputDiv.style.display = 'block';
            UI.addError(resultDiv, 'Failed: ', err.message);
          } finally {
            btnGen.textContent = `Generate ${REPLY_LABEL.name}`;
            btnGen.disabled = false;
          }
        };

        btnGen.addEventListener('click', generate);
        regenBtn.addEventListener('click', generate);
      }
    };

    // ==========================================
    // 9. BUTTON GROUP BUILDER (ANTI-DUPLICATION)
    // ==========================================
    function buildButtonGroup(wrapper, getText) {
      if (!wrapper) return;

      const postContainer = wrapper.closest('article[data-testid="tweet"], shreddit-post, [data-testid="post-container"], .Post, .thing, [role="article"], [data-pagelet^="FeedUnit"]') || wrapper;
      if (postContainer.querySelector('.ai-tools-action-btn-wrap') || wrapper.querySelector('.ai-tools-action-btn-wrap')) return;

      if (wrapper.hasAttribute(ADAPTER.alreadyTagged)) return;
      wrapper.setAttribute(ADAPTER.alreadyTagged, 'true');

      const config = Settings.getAll();
      const group = document.createElement('span');
      group.className = 'ai-tools-action-btn-wrap';

      const getTruncatedText = () => {
        let t = getText() || '';
        if (t.length > 4000) t = t.substring(0, 4000) + '\n...[TRUNCATED FOR TOKEN EFFICIENCY]';
        return t;
      };

      if (config.enableCopy) {
        const btn = UI.createActionButton('Copy post text', 'C');
        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const t = getText();
          if (!t) return;
          GM_setClipboard(t).then(() => {
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = 'C'; }, 1200);
          });
        });
        group.appendChild(btn);
      }
      if (config.enableTruth) {
        const btn = UI.createActionButton('Truth Meter', '✔');
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); Features.runAnalysis('truth', getTruncatedText(), btn); });
        group.appendChild(btn);
      }
      if (config.enableExplain) {
        const btn = UI.createActionButton('Explain Post', 'e');
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); Features.runAnalysis('explain', getTruncatedText(), btn); });
        group.appendChild(btn);
      }
      if (config.enableReply) {
        const btn = UI.createActionButton(`Generate ${REPLY_LABEL.name}`, 'R');
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); Features.openReplyGenerator(getTruncatedText(), btn); });
        group.appendChild(btn);
      }

      if (group.children.length) ADAPTER.injectBtn(wrapper, group);
    }

    // ==========================================
    // 10. DOM INJECTION OBSERVER, COMMANDS & CLEANUP
    // ==========================================
    GM_registerMenuCommand('⚙️ Post Tools Settings', () => {
      let panel = document.querySelector('.ai-tools-panel');
      if (!panel) panel = UI.buildPanel('Settings', document.body, true);
      const settingsDiv = panel.querySelector('.ai-tools-settings');
      const bodyDiv     = panel.querySelector('.ai-tools-body');
      const footerDiv   = panel.querySelector('.ai-tools-footer');

      if (settingsDiv) settingsDiv.classList.add('active');
      if (bodyDiv) bodyDiv.style.display = 'none';
      if (footerDiv && panel.dataset.mode !== 'reply') footerDiv.style.display = 'none';
    });

    const DOMObserver = {
      _scheduled: false,
      _observer: null,
      init() {
        if (PLATFORM === 'unknown' || !ADAPTER) return;
        const platformKey = 'enable' + PLATFORM.charAt(0).toUpperCase() + PLATFORM.slice(1);
        if (Settings.get(platformKey) === false) return;

        const schedule = () => {
          if (this._scheduled || document.hidden) return;
          this._scheduled = true;
          requestAnimationFrame(() => {
            this._scheduled = false;
            this.injectButtons();
          });
        };

        this._observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (!m.addedNodes || m.addedNodes.length === 0) continue;
            if (m.target && m.target.closest && m.target.closest('.ai-tools-panel, .ai-tools-action-btn-wrap')) continue;
            schedule();
            break;
          }
        });

        onBodyReady(() => {
          this._observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => this.injectButtons(), 800);
        });
      },
      injectButtons() {
        if (!ADAPTER) return;
        document.querySelectorAll(ADAPTER.anchorSelector).forEach((anchor) => {
          const wrapper = ADAPTER.getWrapper(anchor);
          if (wrapper) buildButtonGroup(wrapper, () => ADAPTER.getText(wrapper));
        });
      }
    };

    function emergencyCleanup() {
      if (DOMObserver._observer) {
        try { DOMObserver._observer.disconnect(); } catch (_) {}
      }
      __ACTIVE_XHR_SET__.forEach((xhr) => {
        try { xhr.abort(); } catch (_) {}
      });
      __ACTIVE_XHR_SET__.clear();
    }

    window.addEventListener('pagehide', emergencyCleanup);
    window.addEventListener('beforeunload', emergencyCleanup);
    window.addEventListener('pt:kvHydrated', () => DOMObserver.injectButtons());

    DOMObserver.init();
  })();
})();
