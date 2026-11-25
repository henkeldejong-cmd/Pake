// ==UserScript Combined for Pake==
// @name         TikTok Pake Suite (De-Bloater + TikTok Pro + Adjustable Comments Expander)
// @version      3.4.0
// @match        https://www.tiktok.com/*
// @match        *://*.tiktok.com/*
// ==/UserScript Combined for Pake==
//
// Merged Userscripts:
//   1. TikTok Web De-Bloater & Performance Booster (v1.0)
//   2. TikTok Pro — Typography, Anti-Bloat & UI (v3.4)
//   3. TikTok Adjustable Comments Expander (v2.0) — controlled via Pro panel checkbox

(() => {
  'use strict';

  /* =========================================================================
     1. IFRAME CRASH GUARD, HOSTNAME CHECK & DOUBLE-EXECUTION GUARD
     ========================================================================= */
  if (window.self !== window.top) return;

  const __HOST__ = (window.location && window.location.hostname) || '';
  if (!/(^|\.)tiktok\.com$/i.test(__HOST__)) return;
  if (/^(captcha|verify|mcs|mon|log|slardar)\./i.test(__HOST__)) return;

  if (window.__tiktokPakeInit) return;
  window.__tiktokPakeInit = true;

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

  const __KV_PREFIX__ = '__pake_ttp_kv__:';
  const __KV_CACHE__ = Object.create(null);
  const __PAKE_MENU_COMMANDS__ = (window.__PAKE_MENU_COMMANDS__ =
    window.__PAKE_MENU_COMMANDS__ || []);

  // Safe localStorage fallback reader (never monkey-patches Storage.prototype)
  function __lsRead(key) {
    try {
      const prefixed = window.localStorage.getItem(__KV_PREFIX__ + key);
      if (prefixed !== null) {
        const parsed = JSON.parse(prefixed);
        if (parsed && typeof parsed === 'object' && '__v' in parsed) {
          return parsed.__v;
        }
        return parsed;
      }
      // Legacy fallback for keys saved by earlier standalone scripts (e.g., tiktok-comment-width)
      if (key === 'tiktok-comment-width') {
        const legacy = window.localStorage.getItem(key);
        if (legacy !== null) return legacy;
      }
    } catch (_) {}
    return undefined;
  }

  function __lsWrite(key, value) {
    try {
      if (value === null || value === undefined) {
        window.localStorage.removeItem(__KV_PREFIX__ + key);
        if (key === 'tiktok-comment-width') {
          window.localStorage.removeItem(key);
        }
      } else {
        window.localStorage.setItem(__KV_PREFIX__ + key, JSON.stringify({ __v: value }));
        if (key === 'tiktok-comment-width' && typeof value === 'string') {
          window.localStorage.setItem(key, value);
        }
      }
    } catch (_) {}
  }

  // Pre-seed in-memory cache synchronously from localStorage fallback
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(__KV_PREFIX__)) {
        const realKey = k.slice(__KV_PREFIX__.length);
        const val = __lsRead(realKey);
        if (val !== undefined) __KV_CACHE__[realKey] = val;
      }
    }
    const legacyWidth = __lsRead('tiktok-comment-width');
    if (legacyWidth !== undefined && !('tiktok-comment-width' in __KV_CACHE__)) {
      __KV_CACHE__['tiktok-comment-width'] = legacyWidth;
    }
  } catch (_) {}

  // Hydrate authoritative disk storage from Rust plugin_storage.json
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
        window.dispatchEvent(new CustomEvent('ttp:kvHydrated'));
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
      return navigator.clipboard.writeText(str).catch(() => {});
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
    };

    if (typeof details.timeout === 'number' && details.timeout > 0) {
      timeoutId = setTimeout(() => {
        if (aborted) return;
        timedOut = true;
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

    return {
      abort() {
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
     4. SCRIPT 1: TIKTOK WEB DE-BLOATER & PERFORMANCE BOOSTER (v1.0)
     ========================================================================= */
  (function () {
    'use strict';

    // 1. Block Background Telemetry / Tracking Domains
    const blockedKeywords = [
      'mcs.tiktok.com',
      'mon.tiktokv.com',
      'log.byteoversea.com',
      'slardar',
      'telemetry',
      'analytics',
      'teec'
    ];

    function getUrlString(input) {
      if (!input) return '';
      if (typeof input === 'string') return input;
      if (typeof input === 'object' && 'url' in input) return String(input.url || '');
      return String(input);
    }

    function shouldBlock(url) {
      const strUrl = getUrlString(url);
      if (!strUrl) return false;
      return blockedKeywords.some((keyword) => strUrl.includes(keyword));
    }

    // Intercept Fetch API
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function (...args) {
        const [resource] = args;
        if (shouldBlock(resource)) {
          return new Response(JSON.stringify({ status: 'blocked' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return originalFetch.apply(this, args);
      };
    }

    // Intercept XMLHttpRequest (XHR)
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      if (shouldBlock(url)) {
        try {
          return originalOpen.apply(this, [method, 'data:text/plain;charset=utf-8,', ...rest]);
        } catch (_) {
          return originalOpen.apply(this, [method, 'about:blank', ...rest]);
        }
      }
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    // Kill Background Beacon telemetry
    if (navigator.sendBeacon) {
      const originalSendBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function (url) {
        if (shouldBlock(url)) return true;
        return originalSendBeacon.apply(this, arguments);
      };
    }

    // 2. Tame Video Preloading and Memory Leaks (inspect added nodes only)
    function optimizeVideoElement(video) {
      if (!(video instanceof HTMLVideoElement)) return;
      if (video.paused && !video.hasAttribute('data-optimized')) {
        video.preload = 'none';
        video.setAttribute('data-optimized', 'true');
      }
      video.disableRemotePlayback = true;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'VIDEO') {
            optimizeVideoElement(node);
          } else if (node.querySelectorAll) {
            const vids = node.querySelectorAll('video');
            for (let i = 0; i < vids.length; i++) {
              optimizeVideoElement(vids[i]);
            }
          }
        }
      }
    });

    function startVideoObserver() {
      if (!document.body) return;
      document.querySelectorAll('video').forEach(optimizeVideoElement);
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startVideoObserver, { once: true });
    } else {
      startVideoObserver();
    }

    // 3. Throttle inactive tabs (respects TikTok Pro's Background Play setting)
    document.addEventListener('visibilitychange', () => {
      const bgPlayEnabled = Boolean(GM_getValue('ttp_bgPlay', false));
      if (bgPlayEnabled) return;
      if (document.hidden) {
        document.querySelectorAll('video').forEach((v) => {
          if (!v.paused) v.pause();
        });
      }
    });
  })();

  /* =========================================================================
     5. SCRIPT 2: TIKTOK PRO — TYPOGRAPHY, ANTI-BLOAT & UI (v3.4)
     ========================================================================= */
  (function () {
    'use strict';

    const KEYS = {
      fontFamily:      'ttp_fontFamily',
      descSize:        'ttp_descSize',
      commentSize:     'ttp_commentSize',
      nameSize:        'ttp_nameSize',
      btnSize:         'ttp_btnSize',
      btnX:            'ttp_btnX',
      btnY:            'ttp_btnY',
      hideAvatars:     'ttp_hideAvatars',
      hideLive:        'ttp_hideLive',
      hideSidebar:     'ttp_hideSidebar',
      hideTooltips:    'ttp_hideTooltips',
      hideBackgrounds: 'ttp_hideBackgrounds',
      hideHeaderIcons: 'ttp_hideHeaderIcons',
      edgeFix:         'ttp_edgeFix',
      autoScroll:      'ttp_autoScroll',
      bgPlay:          'ttp_bgPlay',
      commentExpander: 'ttp_commentExpander'
    };

    const DEFAULTS = {
      [KEYS.fontFamily]:      'inherit',
      [KEYS.descSize]:        15,
      [KEYS.commentSize]:     15,
      [KEYS.nameSize]:        14,
      [KEYS.btnSize]:         32,
      [KEYS.btnX]:            '20px',
      [KEYS.btnY]:            'calc(100vh - 80px)',
      [KEYS.hideAvatars]:     false,
      [KEYS.hideLive]:        true,
      [KEYS.hideSidebar]:     false,
      [KEYS.hideTooltips]:    true,
      [KEYS.hideBackgrounds]: true,
      [KEYS.hideHeaderIcons]: true,
      [KEYS.edgeFix]:         false,
      [KEYS.autoScroll]:      false,
      [KEYS.bgPlay]:          false,
      [KEYS.commentExpander]: true
    };

    function toInt(val, def) {
      const n = parseInt(val, 10);
      return Number.isFinite(n) ? n : def;
    }

    function toBool(val, def) {
      if (typeof val === 'boolean') return val;
      if (val === 'true') return true;
      if (val === 'false') return false;
      return def;
    }

    let fontFamily, descSize, commentSize, nameSize, btnSize, btnX, btnY;
    let hideAvatars, hideLive, hideSidebar, hideTooltips, hideBackgrounds, hideHeaderIcons;
    let edgeFix, autoScroll, bgPlay, commentExpander;

    function loadSettings() {
      fontFamily      = String(GM_getValue(KEYS.fontFamily, DEFAULTS[KEYS.fontFamily]) || 'inherit');
      descSize        = toInt(GM_getValue(KEYS.descSize,    DEFAULTS[KEYS.descSize]),    DEFAULTS[KEYS.descSize]);
      commentSize     = toInt(GM_getValue(KEYS.commentSize, DEFAULTS[KEYS.commentSize]), DEFAULTS[KEYS.commentSize]);
      nameSize        = toInt(GM_getValue(KEYS.nameSize,    DEFAULTS[KEYS.nameSize]),    DEFAULTS[KEYS.nameSize]);
      btnSize         = toInt(GM_getValue(KEYS.btnSize,     DEFAULTS[KEYS.btnSize]),     DEFAULTS[KEYS.btnSize]);
      btnX            = String(GM_getValue(KEYS.btnX,       DEFAULTS[KEYS.btnX]) || DEFAULTS[KEYS.btnX]);
      btnY            = String(GM_getValue(KEYS.btnY,       DEFAULTS[KEYS.btnY]) || DEFAULTS[KEYS.btnY]);
      hideAvatars     = toBool(GM_getValue(KEYS.hideAvatars,     DEFAULTS[KEYS.hideAvatars]),     DEFAULTS[KEYS.hideAvatars]);
      hideLive        = toBool(GM_getValue(KEYS.hideLive,        DEFAULTS[KEYS.hideLive]),        DEFAULTS[KEYS.hideLive]);
      hideSidebar     = toBool(GM_getValue(KEYS.hideSidebar,     DEFAULTS[KEYS.hideSidebar]),     DEFAULTS[KEYS.hideSidebar]);
      hideTooltips    = toBool(GM_getValue(KEYS.hideTooltips,    DEFAULTS[KEYS.hideTooltips]),    DEFAULTS[KEYS.hideTooltips]);
      hideBackgrounds = toBool(GM_getValue(KEYS.hideBackgrounds, DEFAULTS[KEYS.hideBackgrounds]), DEFAULTS[KEYS.hideBackgrounds]);
      hideHeaderIcons = toBool(GM_getValue(KEYS.hideHeaderIcons, DEFAULTS[KEYS.hideHeaderIcons]), DEFAULTS[KEYS.hideHeaderIcons]);
      edgeFix         = toBool(GM_getValue(KEYS.edgeFix,         DEFAULTS[KEYS.edgeFix]),         DEFAULTS[KEYS.edgeFix]);
      autoScroll      = toBool(GM_getValue(KEYS.autoScroll,      DEFAULTS[KEYS.autoScroll]),      DEFAULTS[KEYS.autoScroll]);
      bgPlay          = toBool(GM_getValue(KEYS.bgPlay,          DEFAULTS[KEYS.bgPlay]),          DEFAULTS[KEYS.bgPlay]);
      commentExpander = toBool(GM_getValue(KEYS.commentExpander, DEFAULTS[KEYS.commentExpander]), DEFAULTS[KEYS.commentExpander]);
    }

    loadSettings();

    function save(key, value) {
      GM_setValue(key, value);
    }

    /* ====================
       Apply CSS Styles
       ==================== */
    const STYLE_ID = 'tm-tiktok-pro-styles';
    let siteStyleEl = null;

    function buildSiteCss() {
      const fontString = fontFamily !== 'inherit' ? fontFamily : 'inherit';
      return `
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Inter:wght@400;700&family=Josefin+Sans:wght@400;700&display=swap');

        /* Global Font Override */
        ${fontFamily !== 'inherit' ? `
        [data-e2e="video-desc"] *, [data-e2e^="comment-level"] *, [data-e2e^="comment-username"] *,
        h1, h2, h3, h4, p, span, a, div[class*="Text"] {
            font-family: ${fontString} !important;
        }` : ''}

        /* Video Description Text */
        [data-e2e="video-desc"] span, [data-e2e="video-desc"] a, [data-e2e="video-desc"] p {
          font-size: ${descSize}px !important;
          line-height: 1.4 !important;
        }

        /* Aggressive Comment Text Targeting */
        div[class*="-DivCommentContentWrapper"] > span,
        span[data-e2e^="comment-level"],
        span[data-e2e^="comment-level"] span,
        span[data-e2e^="comment-level"] p {
          font-size: ${commentSize}px !important;
          line-height: 1.4 !important;
        }

        /* Protect comment timestamps and reply buttons */
        [class*="-DivCommentSubContentWrapper"] span,
        [class*="-DivCommentSubContentWrapper"] p {
          font-size: 13px !important;
        }

        /* Usernames */
        [data-e2e^="comment-username"] p, [data-e2e^="comment-username"] span, [data-e2e^="comment-username"] a,
        [data-e2e="video-author-uniqueid"], [data-e2e="video-author-nickname"] {
          font-size: ${nameSize}px !important;
        }

        /* ANTI-BLOAT REMOVALS */
        ${hideAvatars ? `img[class*="ImgAvatar"], [class*="-DivAvatarWrapper"], .user-avatar-container, div[class*="-DivProfileContainer"] { display: none !important; }` : ''}
        ${hideLive ? `[data-e2e="nav-live"], [class*="-DivLiveNavWrapper"], a[href*="/live"] { display: none !important; }` : ''}
        ${hideSidebar ? `
          [class*="-DivSideNavContainer"], [class*="-DivSideNavPlaceholderContainer"] { display: none !important; }
          [class*="-DivMainContainer"] { margin-left: 0 !important; width: 100% !important; }
        ` : ''}
        ${hideTooltips ? `[class*="-StyledTUXTooltip"], [class*="DivBottomFloaterContainer"], [class*="DivGetApp"] { display: none !important; }` : ''}
        ${hideBackgrounds ? `[class*="-DivAnimationCover"], canvas[class*="-CanvasMediaCardPlaceholder"] { display: none !important; }` : ''}
        ${hideHeaderIcons ? `
          div[id="top-right-action-bar"] > div:not([class*="-DivProfileContainer"]) {
              display: none !important;
          }
        ` : ''}

        /* UI PANEL STYLES */
        .ttp-panel-container {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 320px; max-height: 85vh; overflow-y: auto;
          background: rgba(30, 30, 32, 0.98); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          padding: 16px; color: #fff; font-family: system-ui, -apple-system, sans-serif;
          z-index: 2147483647; display: none; box-shadow: 0 10px 40px rgba(0,0,0,0.6);
        }
        .ttp-panel-container::-webkit-scrollbar { width: 6px; }
        .ttp-panel-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }

        .ttp-panel-header {
          font-weight: bold; font-size: 16px; color: #fff; text-align: center; margin-bottom: 5px;
        }

        .ttp-section-title {
          font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 1px;
          margin: 18px 0 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;
        }

        .ttp-label { display: block; margin-bottom: 12px; font-size: 13px; }
        .ttp-label span.val { float: right; font-weight: bold; color: #2DCCD3; }

        .ttp-select, .ttp-range { width: 100%; margin-top: 6px; }
        .ttp-select {
          background: rgba(0,0,0,0.5); color: #fff; border: 1px solid rgba(255,255,255,0.2);
          padding: 8px; border-radius: 6px; font-size: 13px; outline: none;
        }

        .ttp-checkbox-label {
          display: flex; align-items: center; gap: 10px; margin-bottom: 12px; cursor: pointer; font-size: 13px;
        }
        .ttp-checkbox-label input { width: 16px; height: 16px; accent-color: #FE2C55; cursor: pointer; flex-shrink: 0; }

        .ttp-hint {
          font-size: 11px; color: #888; margin: -8px 0 12px 26px; line-height: 1.4;
        }

        .ttp-btn {
          width: 100%; padding: 10px; margin-top: 10px; border-radius: 8px; border: none;
          background: #FE2C55; color: #fff; font-weight: bold; cursor: pointer; transition: background 0.2s;
        }
        .ttp-btn:hover { background: #e0264a; }
      `;
    }

    function updateSiteStyles() {
      const existing = document.getElementById(STYLE_ID);
      if (existing) {
        siteStyleEl = existing;
      }
      if (!siteStyleEl) {
        siteStyleEl = GM_addStyle(buildSiteCss());
        siteStyleEl.id = STYLE_ID;
      } else {
        siteStyleEl.textContent = buildSiteCss();
      }
    }

    updateSiteStyles();

    /* ============================================================
       AUTO SCROLL
       ============================================================ */
    let autoScrollObserver = null;
    const watchedVideos = new WeakSet();
    let autoScrollCooldown = false;

    function isSwipeFeed() {
      const p = window.location.pathname;
      return p === '/' || p === '/foryou' || p === '/following' || p.includes('/video/');
    }

    function dispatchArrowDown() {
      if (!document.body) return;
      document.body.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40,
        bubbles: true, cancelable: true
      }));
    }

    function onVideoEnded(e) {
      if (!autoScroll) return;
      if (!isSwipeFeed()) return;
      if (autoScrollCooldown) return;

      const video = e.target;
      if (!video || video.duration <= 0) return;
      if (video.currentTime < video.duration * 0.85 && video.currentTime > 0.5) return;

      const commentsOpen = document.querySelector(
        'aside[class*="CommentList"], [data-e2e="comment-list"], [class*="-DivCommentListContainer"]'
      );
      if (commentsOpen) return;

      autoScrollCooldown = true;
      setTimeout(() => { autoScrollCooldown = false; }, 800);
      dispatchArrowDown();
    }

    function attachEndedListener(video) {
      if (watchedVideos.has(video)) return;
      watchedVideos.add(video);
      video.addEventListener('ended', onVideoEnded);
    }

    function startAutoScrollWatcher() {
      if (autoScrollObserver || !document.body) return;
      document.querySelectorAll('video').forEach(attachEndedListener);

      autoScrollObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.tagName === 'VIDEO') {
              attachEndedListener(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('video').forEach(attachEndedListener);
            }
          }
        }
      });

      autoScrollObserver.observe(document.body, { childList: true, subtree: true });
    }

    function stopAutoScrollWatcher() {
      if (autoScrollObserver) {
        autoScrollObserver.disconnect();
        autoScrollObserver = null;
      }
    }

    function applyAutoScroll() {
      if (autoScroll) startAutoScrollWatcher();
      else stopAutoScrollWatcher();
    }

    /* ============================================================
       BACKGROUND PLAY
       ============================================================ */
    const origHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const origVisDesc    = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');

    function getRealHidden() {
      if (origHiddenDesc && typeof origHiddenDesc.get === 'function') {
        try { return !!origHiddenDesc.get.call(document); } catch (_) {}
      }
      return false;
    }

    function getRealVisState() {
      if (origVisDesc && typeof origVisDesc.get === 'function') {
        try { return origVisDesc.get.call(document); } catch (_) {}
      }
      return 'visible';
    }

    function patchVisibilityAPI() {
      if (document.__ttpVisibilityPatched) return;
      document.__ttpVisibilityPatched = true;

      try {
        Object.defineProperty(Document.prototype, 'hidden', {
          get() { return bgPlay ? false : getRealHidden(); },
          configurable: true
        });
      } catch (_) {}

      try {
        Object.defineProperty(Document.prototype, 'visibilityState', {
          get() { return bgPlay ? 'visible' : getRealVisState(); },
          configurable: true
        });
      } catch (_) {}
    }

    // Patch early so hidden/visibilityState seamlessly follows bgPlay
    patchVisibilityAPI();

    let bgPlayPauseObserver = null;
    let bgPlayListenerAttached = false;

    function onVideoPausedInBackground(e) {
      if (!bgPlay) return;
      if (!getRealHidden()) return;
      const video = e.target;
      if (!(video instanceof HTMLVideoElement)) return;
      if (video.ended) return;

      setTimeout(() => {
        if (bgPlay && getRealHidden() && video.paused && !video.ended) {
          video.play().catch(() => {});
        }
      }, 50);
    }

    function startBgPlayWatcher() {
      if (!document.body) return;
      if (!bgPlayListenerAttached) {
        bgPlayListenerAttached = true;
        document.addEventListener('pause', onVideoPausedInBackground, true);
      }
      if (!bgPlayPauseObserver) {
        bgPlayPauseObserver = new MutationObserver((mutations) => {
          if (!bgPlay || !getRealHidden()) return;
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType !== 1) continue;
              const vids = node.tagName === 'VIDEO'
                ? [node]
                : (node.querySelectorAll ? Array.from(node.querySelectorAll('video')) : []);
              for (const v of vids) {
                if (v.paused && !v.ended && v.readyState >= 2 && v.src) {
                  v.play().catch(() => {});
                }
              }
            }
          }
        });
        bgPlayPauseObserver.observe(document.body, { childList: true, subtree: true });
      }
    }

    function stopBgPlayWatcher() {
      if (bgPlayPauseObserver) {
        bgPlayPauseObserver.disconnect();
        bgPlayPauseObserver = null;
      }
      if (bgPlayListenerAttached) {
        bgPlayListenerAttached = false;
        document.removeEventListener('pause', onVideoPausedInBackground, true);
      }
    }

    function applyBgPlay() {
      if (bgPlay) startBgPlayWatcher();
      else stopBgPlayWatcher();
    }

    /* ====================
       Safe DOM UI Helpers
       ==================== */
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

    function addSection(parent, title) {
      parent.appendChild(el('div', { className: 'ttp-section-title', textContent: title }));
    }

    function addSlider(parent, labelText, baseId, min, max, initialVal, key, onChange) {
      const valSpan = el('span', { className: 'val', id: `val_${baseId}`, textContent: `${initialVal}px` });
      const input = el('input', {
        id: `inp_${baseId}`,
        type: 'range',
        className: 'ttp-range',
        min,
        max,
        value: initialVal
      });
      input.value = String(initialVal);

      input.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        save(key, val);
        valSpan.textContent = `${val}px`;
        onChange(val);
      });

      const label = el('label', { className: 'ttp-label' }, [
        document.createTextNode(`${labelText} `),
        valSpan,
        input
      ]);
      parent.appendChild(label);
    }

    function addCheckbox(parent, labelText, baseId, initialChecked, key, onChange) {
      const input = el('input', { id: `inp_${baseId}`, type: 'checkbox' });
      input.checked = Boolean(initialChecked);

      input.addEventListener('change', (e) => {
        const val = Boolean(e.target.checked);
        save(key, val);
        onChange(val);
      });

      const label = el('label', { className: 'ttp-checkbox-label' }, [
        input,
        document.createTextNode(labelText)
      ]);
      parent.appendChild(label);
    }

    /* ====================
       UI Creation & Drag
       ==================== */
    let toggleBtn = null;
    let settingsPanel = null;

    function syncUIFromSettings() {
      if (!settingsPanel || !toggleBtn) return;

      toggleBtn.style.width  = `${btnSize}px`;
      toggleBtn.style.height = `${btnSize}px`;
      toggleBtn.style.left   = btnX;
      toggleBtn.style.top    = btnY;

      const setSelect = (id, val) => {
        const node = settingsPanel.querySelector(`#${id}`);
        if (node) node.value = val;
      };
      const setRange = (baseId, val) => {
        const inp = settingsPanel.querySelector(`#inp_${baseId}`);
        const span = settingsPanel.querySelector(`#val_${baseId}`);
        if (inp) inp.value = String(val);
        if (span) span.textContent = `${val}px`;
      };
      const setCheck = (baseId, val) => {
        const inp = settingsPanel.querySelector(`#inp_${baseId}`);
        if (inp) inp.checked = Boolean(val);
      };

      setSelect('inp_fontFamily', fontFamily);
      setRange('descSize', descSize);
      setRange('commentSize', commentSize);
      setRange('nameSize', nameSize);
      setRange('btnSize', btnSize);
      setCheck('hideHeaderIcons', hideHeaderIcons);
      setCheck('hideAvatars', hideAvatars);
      setCheck('hideLive', hideLive);
      setCheck('hideSidebar', hideSidebar);
      setCheck('hideTooltips', hideTooltips);
      setCheck('hideBackgrounds', hideBackgrounds);
      setCheck('autoScroll', autoScroll);
      setCheck('bgPlay', bgPlay);
      setCheck('edgeFix', edgeFix);
      setCheck('commentExpander', commentExpander);
    }

    function initUI() {
      if (!document.body || document.getElementById('ttp-toggle-btn')) return;

      toggleBtn = el('button', { id: 'ttp-toggle-btn', textContent: 'Pro' });
      Object.assign(toggleBtn.style, {
        position: 'fixed', top: btnY, left: btnX, bottom: 'auto', right: 'auto',
        width: `${btnSize}px`, height: `${btnSize}px`, borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(22, 24, 35, 0.8)',
        backdropFilter: 'blur(8px)', color: '#fff', fontSize: '13px', fontWeight: 'bold',
        cursor: 'grab', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '2147483647',
        userSelect: 'none', transition: 'transform 0.2s ease, background 0.2s ease'
      });

      settingsPanel = el('div', { className: 'ttp-panel-container' });
      settingsPanel.appendChild(el('div', { className: 'ttp-panel-header', textContent: 'TikTok Pro' }));

      // Typography Section
      addSection(settingsPanel, 'Typography');

      const fontSelect = el('select', { id: 'inp_fontFamily', className: 'ttp-select' });
      fontSelect.appendChild(el('option', { value: 'inherit', textContent: 'Default (TikTok)' }));

      const newGroup = el('optgroup', { label: 'New Request Fonts' }, [
        el('option', { value: "'Bodoni MT', Bodoni, serif", textContent: 'Bodoni' }),
        el('option', { value: "'Didot', serif", textContent: 'Didot' }),
        el('option', { value: "'Great Vibes', cursive", textContent: 'Great Vibes' }),
        el('option', { value: "'Chopin Script', cursive", textContent: 'Chopin Script' }),
        el('option', { value: "'Inter', sans-serif", textContent: 'Inter' }),
        el('option', { value: "'Josefin Sans', sans-serif", textContent: 'Josefin Sans' }),
        el('option', { value: "'Coco Gothic', sans-serif", textContent: 'Coco Gothic' }),
        el('option', { value: "'Adequate', sans-serif", textContent: 'Adequate' }),
        el('option', { value: "'Dense', sans-serif", textContent: 'Dense' })
      ]);
      const stdGroup = el('optgroup', { label: 'Standard Fonts' }, [
        el('option', { value: '"TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', textContent: 'TwitterChirp' }),
        el('option', { value: 'Arial, Helvetica, sans-serif', textContent: 'Arial' }),
        el('option', { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', textContent: 'Helvetica Neue' }),
        el('option', { value: '"Roboto", sans-serif', textContent: 'Roboto' }),
        el('option', { value: '"Open Sans", sans-serif', textContent: 'Open Sans' }),
        el('option', { value: 'Georgia, serif', textContent: 'Georgia' }),
        el('option', { value: '"Courier New", Courier, monospace', textContent: 'Courier New' }),
        el('option', { value: '"Comic Sans MS", cursive', textContent: 'Comic Sans MS' })
      ]);
      fontSelect.appendChild(newGroup);
      fontSelect.appendChild(stdGroup);
      fontSelect.value = fontFamily;
      fontSelect.addEventListener('change', (e) => {
        fontFamily = e.target.value;
        save(KEYS.fontFamily, fontFamily);
        updateSiteStyles();
      });

      settingsPanel.appendChild(el('label', { className: 'ttp-label' }, [
        document.createTextNode('Font Family:'),
        fontSelect
      ]));

      addSlider(settingsPanel, 'Desc Size:', 'descSize', 10, 30, descSize, KEYS.descSize, (v) => { descSize = v; updateSiteStyles(); });
      addSlider(settingsPanel, 'Comment Size:', 'commentSize', 10, 30, commentSize, KEYS.commentSize, (v) => { commentSize = v; updateSiteStyles(); });
      addSlider(settingsPanel, 'Username Size:', 'nameSize', 10, 24, nameSize, KEYS.nameSize, (v) => { nameSize = v; updateSiteStyles(); });

      // Anti-Bloat Section
      addSection(settingsPanel, 'Anti-Bloat / Performance');
      addCheckbox(settingsPanel, 'Hide Top-Right Icons (Keeps Profile)', 'hideHeaderIcons', hideHeaderIcons, KEYS.hideHeaderIcons, (v) => { hideHeaderIcons = v; updateSiteStyles(); });
      addCheckbox(settingsPanel, 'Hide All Profile Pictures', 'hideAvatars', hideAvatars, KEYS.hideAvatars, (v) => { hideAvatars = v; updateSiteStyles(); });
      addCheckbox(settingsPanel, 'Hide LIVE Stream Links', 'hideLive', hideLive, KEYS.hideLive, (v) => { hideLive = v; updateSiteStyles(); });
      addCheckbox(settingsPanel, 'Hide Left Sidebar', 'hideSidebar', hideSidebar, KEYS.hideSidebar, (v) => { hideSidebar = v; updateSiteStyles(); });
      addCheckbox(settingsPanel, 'Hide Popups & Tooltips', 'hideTooltips', hideTooltips, KEYS.hideTooltips, (v) => { hideTooltips = v; updateSiteStyles(); });
      addCheckbox(settingsPanel, 'Remove Video Blur Backgrounds', 'hideBackgrounds', hideBackgrounds, KEYS.hideBackgrounds, (v) => { hideBackgrounds = v; updateSiteStyles(); });

      // Playback Section
      addSection(settingsPanel, 'Playback');
      addCheckbox(settingsPanel, 'Auto-Scroll to Next Video When Finished', 'autoScroll', autoScroll, KEYS.autoScroll, (v) => { autoScroll = v; applyAutoScroll(); });
      addCheckbox(settingsPanel, 'Continue Playing in Background Tab', 'bgPlay', bgPlay, KEYS.bgPlay, (v) => { bgPlay = v; applyBgPlay(); });
      settingsPanel.appendChild(el('p', {
        className: 'ttp-hint',
        textContent: 'Reload the tab after toggling Background Play if a video stream already paused.'
      }));

      // Edge Browser Fixes Section
      addSection(settingsPanel, 'Edge Browser Fixes');
      addCheckbox(settingsPanel, 'Fix Mouse Wheel Scroll (Translates wheel to Key presses)', 'edgeFix', edgeFix, KEYS.edgeFix, (v) => { edgeFix = v; });

      // UI Settings Section
      addSection(settingsPanel, 'UI Settings');
      addCheckbox(settingsPanel, 'TikTok Adjustable Comments Expander', 'commentExpander', commentExpander, KEYS.commentExpander, (v) => {
        commentExpander = v;
        window.dispatchEvent(new CustomEvent('ttp:commentExpanderChange', { detail: { enabled: v } }));
      });
      settingsPanel.appendChild(el('p', {
        className: 'ttp-hint',
        textContent: 'Adds a draggable left border on the comments sidebar to resize its width.'
      }));

      addSlider(settingsPanel, 'Pro Button Size:', 'btnSize', 20, 60, btnSize, KEYS.btnSize, (v) => {
        btnSize = v;
        toggleBtn.style.width = `${v}px`;
        toggleBtn.style.height = `${v}px`;
      });

      const closeBtn = el('button', { id: 'ttp_close', className: 'ttp-btn', textContent: 'Done' });
      closeBtn.addEventListener('click', () => {
        settingsPanel.style.display = 'none';
        toggleBtn.style.display = 'flex';
      });
      settingsPanel.appendChild(closeBtn);

      document.body.appendChild(toggleBtn);
      document.body.appendChild(settingsPanel);

      setupDraggableButton();
      applyAutoScroll();
      applyBgPlay();
    }

    function setupDraggableButton() {
      let isDragging = false;
      let hasMoved = false;
      let startX, startY, initialX, initialY;

      toggleBtn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        initialX = toggleBtn.offsetLeft;
        initialY = toggleBtn.offsetTop;
        toggleBtn.style.transition = 'none';
        toggleBtn.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) hasMoved = true;
        if (hasMoved) {
          const newX = Math.max(0, Math.min(window.innerWidth  - toggleBtn.offsetWidth,  initialX + (e.clientX - startX)));
          const newY = Math.max(0, Math.min(window.innerHeight - toggleBtn.offsetHeight, initialY + (e.clientY - startY)));
          btnX = `${newX}px`;
          btnY = `${newY}px`;
          toggleBtn.style.left   = btnX;
          toggleBtn.style.top    = btnY;
          toggleBtn.style.bottom = 'auto';
          toggleBtn.style.right  = 'auto';
        }
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          toggleBtn.style.transition = 'transform 0.2s ease, background 0.2s ease';
          toggleBtn.style.cursor = 'grab';
          if (hasMoved) {
            save(KEYS.btnX, toggleBtn.style.left);
            save(KEYS.btnY, toggleBtn.style.top);
          } else {
            settingsPanel.style.display = 'block';
            toggleBtn.style.display = 'none';
          }
        }
      });
    }

    /* ====================
       Edge Scroll Fix Logic
       ==================== */
    let wheelAcc = 0;
    let wheelTimer;
    window.addEventListener('wheel', (e) => {
      if (!edgeFix) return;

      const path = window.location.pathname;
      const isFeed = path === '/' || path === '/foryou' || path === '/following' || path.includes('/video/');
      if (!isFeed) return;

      const target = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (!target) return;

      if (target.closest('aside, [class*="Comment"], .ttp-panel-container, [data-e2e="search-user-container"]')) return;

      e.preventDefault();
      wheelAcc += e.deltaY;

      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAcc = 0; }, 150);

      if (wheelAcc > 80 && document.body) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true }));
        wheelAcc = 0;
      } else if (wheelAcc < -80 && document.body) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true }));
        wheelAcc = 0;
      }
    }, { passive: false });

    // Re-sync when async disk storage completes
    window.addEventListener('ttp:kvHydrated', () => {
      loadSettings();
      updateSiteStyles();
      syncUIFromSettings();
      applyAutoScroll();
      applyBgPlay();
      window.dispatchEvent(new CustomEvent('ttp:commentExpanderChange', { detail: { enabled: commentExpander } }));
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initUI, { once: true });
    } else {
      initUI();
    }
  })();

  /* =========================================================================
     6. SCRIPT 3: TIKTOK ADJUSTABLE COMMENTS EXPANDER (v2.0)
     Controlled via Pro Panel checkbox ("ttp_commentExpander")
     ========================================================================= */
  (function () {
    'use strict';

    const ENABLED_KEY = 'ttp_commentExpander';
    const WIDTH_KEY   = 'tiktok-comment-width';
    const STYLE_ID    = 'ttp-comment-expander-styles';

    const EXPANDER_CSS = `
      /* Let the video container fill the available space naturally */
      div[class*="-DivColumnListContainer"] {
        flex-grow: 1 !important;
        width: auto !important;
        max-width: calc(100% - var(--custom-comment-width)) !important;
      }

      /* Set the comments sidebar to our custom variable width */
      aside[class*="-AsideOneColumnSidebar"] {
        position: relative !important;
        flex: 0 0 var(--custom-comment-width) !important;
        width: var(--custom-comment-width) !important;
        max-width: none !important;
      }

      /* Force internal comment elements to stretch to the new boundary */
      div[class*="-DivCommentSidebarTransitionWrapper"],
      section[class*="-SectionCommentSidebarContainer"] {
        width: 100% !important;
        max-width: none !important;
      }

      /* --- Drag Handle UI --- */
      .custom-tiktok-resizer {
        position: absolute;
        left: -6px;
        top: 0;
        bottom: 0;
        width: 12px;
        cursor: col-resize;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .custom-tiktok-resizer::after {
        content: '';
        width: 2px;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.1);
        transition: background-color 0.2s ease, width 0.2s ease;
      }

      .custom-tiktok-resizer:hover::after,
      .custom-tiktok-resizer.is-dragging::after {
        background-color: rgba(255, 255, 255, 0.6);
        width: 4px;
      }
    `;

    let enabled = Boolean(GM_getValue(ENABLED_KEY, true));
    let expanderStyleEl = null;
    let observer = null;
    let rafScheduled = false;

    let activeResizer = null;
    let activeSidebar = null;
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    function applySavedWidth() {
      const savedWidth = String(GM_getValue(WIDTH_KEY, '450px') || '450px');
      document.documentElement.style.setProperty('--custom-comment-width', savedWidth);
    }

    function updateStyleState() {
      const existing = document.getElementById(STYLE_ID);
      if (existing) expanderStyleEl = existing;

      if (enabled) {
        applySavedWidth();
        if (!expanderStyleEl) {
          expanderStyleEl = GM_addStyle(EXPANDER_CSS);
          expanderStyleEl.id = STYLE_ID;
        } else {
          expanderStyleEl.textContent = EXPANDER_CSS;
          expanderStyleEl.disabled = false;
        }
      } else {
        document.documentElement.style.removeProperty('--custom-comment-width');
        if (expanderStyleEl) {
          expanderStyleEl.textContent = '';
          expanderStyleEl.disabled = true;
        }
      }
    }

    function attachResizer() {
      if (!enabled) return;
      const sidebar = document.querySelector('aside[class*="-AsideOneColumnSidebar"]');
      if (!sidebar || sidebar.querySelector('.custom-tiktok-resizer')) return;

      const resizer = document.createElement('div');
      resizer.className = 'custom-tiktok-resizer';
      sidebar.appendChild(resizer);

      resizer.addEventListener('mousedown', (e) => {
        if (!enabled || e.button !== 0) return;
        isResizing = true;
        activeResizer = resizer;
        activeSidebar = sidebar;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;

        resizer.classList.add('is-dragging');
        if (document.body) {
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'col-resize';
        }
      });
    }

    function removeAllResizers() {
      document.querySelectorAll('.custom-tiktok-resizer').forEach((el) => el.remove());
      if (isResizing) {
        isResizing = false;
        activeResizer = null;
        activeSidebar = null;
        if (document.body) {
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        }
      }
    }

    document.addEventListener('mousemove', (e) => {
      if (!isResizing || !enabled || !activeSidebar) return;

      const deltaX = startX - e.clientX;
      let newWidth = startWidth + deltaX;

      const minWidth = 350;
      const maxWidth = window.innerWidth * 0.7;

      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;

      document.documentElement.style.setProperty('--custom-comment-width', `${Math.round(newWidth)}px`);
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      if (activeResizer) activeResizer.classList.remove('is-dragging');
      activeResizer = null;
      activeSidebar = null;

      if (document.body) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      const finalWidth = document.documentElement.style.getPropertyValue('--custom-comment-width');
      if (finalWidth) {
        GM_setValue(WIDTH_KEY, finalWidth);
      }
    });

    function scheduleAttach() {
      if (!enabled || rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        attachResizer();
      });
    }

    function startObserver() {
      if (observer || !document.body) return;
      attachResizer();
      observer = new MutationObserver((mutations) => {
        if (!enabled) return;
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length > 0) {
            scheduleAttach();
            break;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserver() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    function setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      updateStyleState();
      if (enabled) {
        if (document.body) startObserver();
      } else {
        stopObserver();
        removeAllResizers();
      }
    }

    window.addEventListener('ttp:commentExpanderChange', (e) => {
      setEnabled(Boolean(e?.detail?.enabled));
    });

    window.addEventListener('ttp:kvHydrated', () => {
      setEnabled(Boolean(GM_getValue(ENABLED_KEY, true)));
    });

    updateStyleState();

    const init = () => {
      if (enabled) startObserver();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  })();
})();