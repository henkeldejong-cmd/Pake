// ==UserScript Combined for Pake==
// @name         X (Twitter) Pake Desktop Toolkit (Pro Control + Playlist + Ad/Video Filter)
// @version      5.0.0-pake
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        *://*.x.com/*
// @match        *://*.twitter.com/*
// ==/UserScript Combined for Pake==

(() => {
  'use strict';

  /* =========================================================================
     1. IFRAME CRASH GUARD, HOSTNAME CHECK & DOUBLE-EXECUTION GUARD
     ========================================================================= */
  if (window.self !== window.top) return;

  const __HOST__ = (window.location && window.location.hostname) || '';
  if (!/(^|\.)(x|twitter)\.com$/i.test(__HOST__)) return;
  if (/^(abs|pbs|ton|api|ads|analytics|cards|o|captcha|verify)\./i.test(__HOST__)) return;

  if (window.__xTwitterPakeInit) return;
  window.__xTwitterPakeInit = true;

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

  const __KV_PREFIX__ = '__pake_xtt_kv__:';
  const __KV_CACHE__ = Object.create(null);
  const __PAKE_MENU_COMMANDS__ = (window.__PAKE_MENU_COMMANDS__ =
    window.__PAKE_MENU_COMMANDS__ || []);
  const __ACTIVE_XHR_SET__ = new Set();

  const __LEGACY_KEYS__ = [
    'xpro_v4',
    'x_ctrl_btnpos',
    'x_pp_data',
    'x_pp_scroll',
    'x_pp_idx',
    'x_pp_vis',
    'x_pp_cols',
    'x_pp_geom',
    'x_pp_fsize',
    'x_pp_ffam',
    'x_pp_tab_mode',
    'x_pp_active_tab',
    'x_pp_avatar_only',
    'x_pp_list_ver_v5'
  ];

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
      if (__LEGACY_KEYS__.includes(key)) {
        const legacy = window.localStorage.getItem(key);
        if (legacy !== null) {
          return __safeJsonParse(legacy, legacy);
        }
      }
    } catch (_) {}
    return undefined;
  }

  function __lsWrite(key, value) {
    try {
      if (value === null || value === undefined) {
        window.localStorage.removeItem(__KV_PREFIX__ + key);
        if (__LEGACY_KEYS__.includes(key)) {
          window.localStorage.removeItem(key);
        }
      } else {
        window.localStorage.setItem(__KV_PREFIX__ + key, JSON.stringify({ __v: value }));
        if (__LEGACY_KEYS__.includes(key)) {
          window.localStorage.setItem(key, JSON.stringify(value));
        }
      }
    } catch (_) {}
  }

  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(__KV_PREFIX__)) {
        const realKey = k.slice(__KV_PREFIX__.length);
        const val = __lsRead(realKey);
        if (val !== undefined) __KV_CACHE__[realKey] = val;
      }
    }
    for (const legacyKey of __LEGACY_KEYS__) {
      if (!(legacyKey in __KV_CACHE__)) {
        const val = __lsRead(legacyKey);
        if (val !== undefined) __KV_CACHE__[legacyKey] = val;
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
        window.dispatchEvent(new CustomEvent('xtt:kvHydrated'));
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
     4. SHARED STORAGE & NETWORK BRIDGE + SAFE DOM HELPERS (TRUSTED TYPES SAFE)
     ========================================================================= */
  const Store = {
    get(key, def) {
      try {
        const val = GM_getValue(key, undefined);
        if (val !== undefined) return val;
        return def;
      } catch (_) {
        return def;
      }
    },
    set(key, val) {
      try {
        GM_setValue(key, val);
      } catch (_) {}
    },
    remove(key) {
      try {
        GM_deleteValue(key);
      } catch (_) {}
    }
  };

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

  function createSvgIcon(paths, size, viewBox = '0 0 24 24', isStroke = false) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', viewBox);
    if (isStroke) {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
    } else {
      svg.setAttribute('fill', 'currentColor');
    }
    for (const spec of paths) {
      const node = document.createElementNS(ns, spec.tag || 'path');
      for (const [k, v] of Object.entries(spec)) {
        if (k !== 'tag') node.setAttribute(k, String(v));
      }
      svg.appendChild(node);
    }
    return svg;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function requestNetworkJson(url, timeoutMs = 8000) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: {
          Accept: 'application/json',
          'User-Agent':
            navigator.userAgent ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
        },
        responseType: 'json',
        timeout: timeoutMs,
        onload(r) {
          if (r.response && typeof r.response === 'object') {
            resolve({ status: r.status, data: r.response });
          } else {
            resolve({ status: r.status, data: __safeJsonParse(r.responseText, null) });
          }
        },
        onerror() { resolve({ status: 0, data: null }); },
        ontimeout() { resolve({ status: 0, data: null }); },
        onabort() { resolve({ status: 0, data: null }); }
      });
    });
  }

  /* =========================================================================
     MODULE 1: Hardware Back Key Support (Desktop-safe: no Escape / history hijack)
     ========================================================================= */
  (() => {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'GoBack' || e.keyCode === 4) {
        if (/\/[^/]+\/status\/\d+/.test(window.location.pathname)) {
          e.preventDefault();
          e.stopPropagation();
          const nativeBack =
            document.querySelector('[data-testid="app-bar-back"]') ||
            document.querySelector('button[aria-label="Back"]');
          if (nativeBack) nativeBack.click();
          else window.history.back();
        }
      }
    }, true);
  })();

  /* =========================================================================
     MODULE 2: X Compact Bottom Bar (Narrow/Mobile Viewport Only — Safe on Desktop)
     ========================================================================= */
  (() => {
    const NAV_HEIGHT = 48;
    GM_addStyle(`
      [data-xcb-bar] {
        height: ${NAV_HEIGHT}px !important; min-height: 0 !important; max-height: ${NAV_HEIGHT}px !important;
        padding-top: 0 !important; padding-bottom: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important;
        box-sizing: border-box !important;
      }
      [data-xcb-fixed] {
        top: auto !important; bottom: 0px !important; height: ${NAV_HEIGHT}px !important; max-height: ${NAV_HEIGHT}px !important;
        min-height: 0 !important; transform: none !important; -webkit-transform: none !important; box-sizing: border-box !important;
      }
      [data-xcb-link], [data-xcb-fixed] a {
        height: ${NAV_HEIGHT}px !important; min-height: 0 !important; max-height: ${NAV_HEIGHT}px !important;
        align-self: center !important; box-sizing: border-box !important;
      }
    `);

    let lockScheduled = false;

    function lockBar() {
      // Only run on narrow mobile-sized viewports where X switches to a horizontal bottom tab bar
      if (window.innerWidth >= 520) return;

      const links = document.querySelectorAll('[data-testid^="AppTabBar_"], a[href="/home"], a[href="/explore"]');
      for (const link of links) {
        const r = link.getBoundingClientRect();
        if (r.height > 0 && (r.top + r.height / 2) > (window.innerHeight * 0.75)) {
          let fixed = null;
          for (let n = link.parentElement; n && n !== document.body; n = n.parentElement) {
            const pos = getComputedStyle(n).position;
            if (pos === 'fixed' || pos === 'sticky') {
              const fr = n.getBoundingClientRect();
              if (fr.width > fr.height * 2 && fr.height < 90) {
                fixed = n;
              }
              break;
            }
          }
          if (!fixed) continue;
          for (let n = link.parentElement; n; n = n.parentElement) {
            n.setAttribute('data-xcb-bar', '');
            if (n === fixed) break;
          }
          fixed.setAttribute('data-xcb-fixed', '');
          fixed.querySelectorAll('a').forEach((a) => a.setAttribute('data-xcb-link', ''));
          if (fixed.style.transform && fixed.style.transform !== 'none') fixed.style.transform = 'none';
          if (fixed.style.bottom && fixed.style.bottom !== '0px') fixed.style.bottom = '0px';
          return;
        }
      }
    }

    function scheduleLock() {
      if (window.innerWidth >= 520 || lockScheduled) return;
      lockScheduled = true;
      requestAnimationFrame(() => {
        lockScheduled = false;
        lockBar();
      });
    }

    const startObserver = () => {
      if (!document.body) return;
      new MutationObserver(scheduleLock).observe(document.body, { childList: true, subtree: true });
      lockBar();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
  })();

  /* =========================================================================
     MODULE 3: Hide Boosted Posts & Videos Engine (Throttled & Reversible)
     ========================================================================= */
  (() => {
    GM_addStyle(`
      [data-xbh-hidden] { display: none !important; }
      [data-xbh-video] { display: none !important; }
    `);

    const labels = new Set(['boosted', 'promoted', 'ad']);
    let scanScheduled = false;

    function scanTimeline() {
      const hideAdsEnabled = Store.get('xpro_v4', null)?.opt?.hideAds ?? true;
      const hideVideosEnabled = Store.get('xpro_v4', null)?.opt?.hideVideos || false;

      if (!hideVideosEnabled) {
        document.querySelectorAll('[data-xbh-video]').forEach((elNode) => {
          elNode.removeAttribute('data-xbh-video');
        });
      }
      if (!hideAdsEnabled) {
        document.querySelectorAll('[data-xbh-hidden]').forEach((elNode) => {
          elNode.removeAttribute('data-xbh-hidden');
        });
      }

      document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
        if (hideAdsEnabled && !article.closest('[data-xbh-hidden]')) {
          let isAd = false;
          const ctx = article.querySelector('[data-testid="socialContext"]');
          if (ctx && labels.has((ctx.textContent || '').trim().toLowerCase())) isAd = true;
          if (!isAd) {
            const spans = article.querySelectorAll('span');
            for (let i = 0; i < spans.length; i++) {
              const sp = spans[i];
              if (!sp.children.length && labels.has((sp.textContent || '').trim().toLowerCase())) {
                if (!sp.closest('[data-testid="tweetText"]')) {
                  isAd = true;
                  break;
                }
              }
            }
          }
          if (isAd) {
            const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
            cell.setAttribute('data-xbh-hidden', '');
          }
        }

        if (hideVideosEnabled && !article.closest('[data-xbh-video]')) {
          const hasVideo = article.querySelector(
            'video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [aria-label*="video" i]'
          );
          if (hasVideo) {
            const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
            cell.setAttribute('data-xbh-video', '');
          }
        }
      });
    }

    function scheduleScan() {
      if (scanScheduled) return;
      scanScheduled = true;
      requestAnimationFrame(() => {
        scanScheduled = false;
        scanTimeline();
      });
    }

    window.addEventListener('xpro:settingsChanged', scheduleScan);

    const startObserver = () => {
      if (!document.body) return;
      const obs = new MutationObserver((mutations) => {
        const sb = document.getElementById('x-pp-sidebar');
        const xp = document.getElementById('xpro-panel');
        const cw = document.getElementById('x-controls-wrap');
        for (const m of mutations) {
          if (!m.addedNodes || m.addedNodes.length === 0) continue;
          if ((sb && sb.contains(m.target)) || (xp && xp.contains(m.target)) || (cw && cw.contains(m.target))) {
            continue;
          }
          scheduleScan();
          break;
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      scanTimeline();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
  })();

  /* =========================================================================
     MODULE 4: 𝕏 Pro — Full Desktop UI Control v4.1 (Pure DOM, Trusted Types Safe)
     ========================================================================= */
  const XPro = (() => {
    const FONTS = [
      { label: 'TwitterChirp (default)', value: '"TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
      { label: 'Bodoni Moda',            value: "'Bodoni Moda', serif" },
      { label: 'Didot (Playfair)',       value: "'Playfair Display', serif" },
      { label: 'Great Vibes',            value: "'Great Vibes', cursive" },
      { label: 'Inter',                  value: "'Inter', sans-serif" },
      { label: 'Josefin Sans',           value: "'Josefin Sans', sans-serif" },
      { label: 'Courier Prime',          value: "'Courier Prime', monospace" },
      { label: 'Georgia',                value: 'Georgia, serif' },
      { label: 'Arial',                  value: 'Arial, sans-serif' },
      { label: 'Helvetica Neue',         value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
      { label: 'Roboto',                 value: '"Roboto", sans-serif' },
      { label: 'Open Sans',              value: '"Open Sans", sans-serif' },
      { label: 'Lato',                   value: '"Lato", sans-serif' },
      { label: 'Ubuntu',                 value: '"Ubuntu", sans-serif' },
      { label: 'Noto Sans',              value: '"Noto Sans", sans-serif' }
    ];

    const SLOTS = {
      body: {
        label:       'Tweet body text',
        selectors:   ['[data-testid="tweetText"]', '[data-testid="tweetText"] span', '[data-testid="tweetText"] a'],
        defaultFont: FONTS[0].value, defaultSize: 15, minSize: 8, maxSize: 24
      },
      name: {
        label:       'Display name',
        selectors:   ['[data-testid="User-Name"] a[role="link"] span span', '[data-testid="User-Name"] a[role="link"] > span', '[data-testid="UserName"] span span', '[data-testid="UserName"] > div > span', '[data-testid="tweet"] [data-testid="User-Name"] a span'],
        defaultFont: FONTS[0].value, defaultSize: 15, minSize: 8, maxSize: 22
      },
      handle: {
        label:       'Handle & timestamp',
        selectors:   ['[data-testid="User-Name"] a[href*="/"]', '[data-testid="User-Name"] time', 'time[datetime]', '[data-testid="tweet"] a[href*="/status/"] time'],
        defaultFont: FONTS[4].value, defaultSize: 13, minSize: 8, maxSize: 18
      },
      ui: {
        label:       'Nav & UI labels',
        selectors:   ['[data-testid="AppTabBar_Home_Link"] span', '[data-testid="AppTabBar_Explore_Link"] span', '[data-testid="AppTabBar_Notifications_Link"] span', '[data-testid="AppTabBar_DirectMessage_Link"] span', 'nav[role="navigation"] span', '[data-testid="primaryColumn"] h2 span'],
        defaultFont: FONTS[4].value, defaultSize: 15, minSize: 8, maxSize: 20
      }
    };

    const STORE_KEY = 'xpro_v4';
    function buildDefault() {
      return {
        body:   { font: SLOTS.body.defaultFont, size: SLOTS.body.defaultSize },
        name:   { font: SLOTS.name.defaultFont, size: SLOTS.name.defaultSize },
        handle: { font: SLOTS.handle.defaultFont, size: SLOTS.handle.defaultSize },
        ui:     { font: SLOTS.ui.defaultFont, size: SLOTS.ui.defaultSize },
        extra:  { lineHeight: 1.4, letterSpacing: 0, italic: false },
        uiSizes: { actionBarSize: 20, actionBtnSize: 20, playBtnSize: 60, mainBtnSize: 34, toggleBtnHidden: false },
        opt:    { hideAds: true, hideWhoToFollow: true, hideTrending: true, compactLayout: false, autoExpand: true, optimizeScrolling: true, hideVideos: false },
        layout: { feedOffset: 0, hideSidebar: false, feedDisabled: false }
      };
    }

    let cfg = buildDefault();
    function reloadCfg() {
      cfg = buildDefault();
      try {
        const saved = Store.get(STORE_KEY, null);
        if (saved && typeof saved === 'object') {
          cfg = {
            ...cfg, ...saved,
            extra:   { ...cfg.extra, ...(saved.extra || {}) },
            uiSizes: { ...cfg.uiSizes, ...(saved.uiSizes || saved.ui || {}) },
            opt:     { ...cfg.opt, ...(saved.opt || {}) },
            layout:  { ...cfg.layout, ...(saved.layout || {}) }
          };
        }
      } catch (_) {}
    }
    reloadCfg();

    function saveSettings() {
      Store.set(STORE_KEY, cfg);
      window.dispatchEvent(new CustomEvent('xpro:settingsChanged'));
    }

    function injectFonts() {
      if (document.getElementById('xpro-fonts')) return;
      const target = document.head || document.documentElement;
      if (!target) return;
      const link = document.createElement('link');
      link.id = 'xpro-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Great+Vibes&family=Inter:wght@400;500;600&family=Josefin+Sans:wght@400;600;700&family=Courier+Prime:ital@0;1&display=swap';
      target.appendChild(link);
    }

    function buildCSS() {
      let css = '';
      for (const [key, slot] of Object.entries(SLOTS)) {
        const { font, size } = cfg[key] || slot;
        css += `\n${slot.selectors.join(',\n')} { font-family: ${font} !important; font-size: ${size}px !important; }`;
      }
      const ex = cfg.extra;
      css += `
        [data-testid="tweetText"], [data-testid="tweetText"] span, [data-testid="tweetText"] a {
          line-height: ${ex.lineHeight} !important;
          letter-spacing: ${ex.letterSpacing}px !important;
          ${ex.italic ? 'font-style: italic !important;' : ''}
        }
      `;
      const { actionBarSize: abs, actionBtnSize: abtn, playBtnSize: pbs } = cfg.uiSizes;
      css += `
        [data-testid="toolBar"] > div, [data-testid="like"], [data-testid="retweet"], [data-testid="reply"], [data-testid="bookmark"], [data-testid="share"] {
          width: ${abs}px !important; height: ${abs}px !important; min-width: ${abs}px !important; min-height: ${abs}px !important;
          font-size: ${Math.max(abs - 10, 6)}px !important;
        }
        [data-testid="toolBar"] svg, [data-testid="like"] svg, [data-testid="retweet"] svg, [data-testid="reply"] svg, [data-testid="bookmark"] svg, [data-testid="share"] svg {
          width: ${Math.max(abtn, 6)}px !important; height: ${Math.max(abtn, 6)}px !important;
        }
        [data-testid="playButton"] {
          width: ${pbs}px !important; height: ${pbs}px !important; min-width: ${pbs}px !important; min-height: ${pbs}px !important;
          position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
        }
        [data-testid="playButton"] svg {
          width: ${Math.max(Math.floor(pbs * 0.45), 6)}px !important; height: ${Math.max(Math.floor(pbs * 0.45), 6)}px !important;
        }
      `;
      if (cfg.opt.optimizeScrolling) {
        css += `\narticle[data-testid="tweet"] img, article[data-testid="tweet"] video { transform: translateZ(0); }`;
      }
      if (cfg.opt.hideAds) {
        css += `\n[data-testid="cellInnerDiv"]:has([data-testid="placementTracking"]) { display: none !important; }`;
      }
      if (cfg.opt.hideWhoToFollow) {
        css += `\n[data-testid="sidebarColumn"] [data-testid="UserCell"], aside[aria-label="Who to follow"] { display: none !important; }`;
      }
      if (cfg.opt.hideTrending) {
        css += `\n[data-testid="trend"], [data-testid="sidebarColumn"] [data-testid="trendItem"], [data-testid="sidebarColumn"] section { display: none !important; }`;
      }
      if (cfg.opt.compactLayout) {
        css += `\narticle[data-testid="tweet"] { padding-top: 4px !important; padding-bottom: 4px !important; }`;
      }
      if (cfg.opt.hideVideos) {
        css += `
          [data-testid="cellInnerDiv"]:has(article[data-testid="tweet"] video),
          [data-testid="cellInnerDiv"]:has([data-testid="videoPlayer"]),
          [data-testid="cellInnerDiv"]:has([data-testid="videoComponent"]),
          article[data-testid="tweet"]:has(video),
          article[data-testid="tweet"]:has([data-testid="videoPlayer"]),
          article[data-testid="tweet"]:has([data-testid="videoComponent"]) {
            display: none !important;
          }
        `;
      }
      if (cfg.layout.hideSidebar) {
        css += `\nnav[aria-label="Primary"], [data-testid="AppTabBar"], header[role="banner"], [data-testid="sideNav"] { display: none !important; }\n[data-testid="primaryColumn"] { margin-left: 0 !important; max-width: 100% !important; }`;
      }
      return css;
    }

    let styleEl = null;
    function applyStyles() {
      const existing = document.getElementById('xpro-v4-styles');
      if (existing) styleEl = existing;
      if (!styleEl) {
        styleEl = GM_addStyle(buildCSS());
        styleEl.id = 'xpro-v4-styles';
      } else {
        styleEl.textContent = buildCSS();
      }
    }

    const FEED_STEP = 20, FEED_MAX = 700;
    function getFeedTarget() { return document.querySelector('[data-testid="primaryColumn"]'); }

    function applyFeedOffset(px) {
      if (cfg.layout.feedDisabled) return;
      const t = getFeedTarget();
      if (!t) return;
      t.style.setProperty('transform', `translateX(${px}px)`, 'important');
      t.style.setProperty('transition', 'transform 200ms cubic-bezier(.25,.8,.25,1)', 'important');
    }

    function clearFeedOffset() {
      const t = getFeedTarget();
      if (t) {
        t.style.removeProperty('transform');
        t.style.removeProperty('transition');
      }
    }

    function setFeedOffset(px) {
      cfg.layout.feedOffset = Math.max(-FEED_MAX, Math.min(FEED_MAX, Math.round(px)));
      if (!cfg.layout.feedDisabled) applyFeedOffset(cfg.layout.feedOffset);
      else clearFeedOffset();
      saveSettings();
      syncLayoutTab();
    }

    function autoCenter() {
      const t = getFeedTarget();
      if (!t) return;
      const prev = t.style.transform;
      t.style.transform = 'none';
      const rect = t.getBoundingClientRect();
      t.style.transform = prev;
      setFeedOffset((window.innerWidth / 2) - (rect.left + rect.width / 2));
    }

    function syncLayoutTab() {
      const disp = document.getElementById('xp-feed-display');
      const val  = document.getElementById('xp-feed-val');
      const sldr = document.getElementById('xp-feed-slider');
      if (!disp) return;
      const v = cfg.layout.feedOffset;
      disp.textContent = `${v > 0 ? '+' : ''}${v} px`;
      if (val) val.textContent = `${v}px`;
      if (sldr) sldr.value = String(v);
    }

    function buildRangeRow(labelText, min, max, value, outText, onInput) {
      const outSpan = el('span', {
        textContent: outText,
        style: { color: '#536471', fontSize: '10px', width: '34px', textAlign: 'right' }
      });
      const slider = el('input', {
        type: 'range',
        min,
        max,
        step: 1,
        value,
        style: { flex: '1', accentColor: '#e7e9ea', height: '3px', cursor: 'pointer' }
      });
      slider.value = String(value);
      slider.addEventListener('input', (e) => {
        const val = +e.target.value;
        outSpan.textContent = onInput(val);
      });
      return {
        row: el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' } }, [
          el('span', { textContent: labelText, style: { color: '#8b98a5', width: '78px', flexShrink: '0' } }),
          slider,
          outSpan
        ]),
        slider,
        outSpan
      };
    }

    function buildCheckboxRow(labelText, checked, onChange) {
      const cb = el('input', { type: 'checkbox', style: { cursor: 'pointer', accentColor: '#1d9bf0' } });
      cb.checked = Boolean(checked);
      cb.addEventListener('change', (e) => onChange(Boolean(e.target.checked)));
      return el('label', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px', cursor: 'pointer' }
      }, [
        el('span', { textContent: labelText, style: { color: '#8b98a5' } }),
        cb
      ]);
    }

    function buildPanel() {
      const rootTarget = document.body || document.documentElement;
      if (!rootTarget || document.getElementById('xpro-panel')) return;
      injectFonts();

      const panel = el('div', {
        id: 'xpro-panel',
        style: {
          position: 'fixed', bottom: '20px', right: '62px', width: '315px',
          maxWidth: 'calc(100vw - 80px)', maxHeight: 'calc(100vh - 40px)',
          background: '#0a1520', border: '1px solid #1e2d3d', borderRadius: '10px',
          padding: '0', boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 0 0.5px rgba(255,255,255,0.06)',
          display: 'none', flexDirection: 'column', overflow: 'hidden', zIndex: '2147483646',
          color: '#e7e9ea', fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: '12px'
        }
      });

      const hide = () => { panel.style.display = 'none'; };

      // Header (Draggable on desktop)
      const closeX = el('span', {
        id: 'xp-close-btn',
        textContent: '✕',
        title: 'Close',
        style: { cursor: 'pointer', color: '#6e7c87', fontSize: '15px', padding: '0 4px' }
      });
      closeX.addEventListener('click', hide);

      const headerBar = el('div', {
        title: 'Drag to move panel',
        style: {
          padding: '9px 12px', borderBottom: '1px solid #1e2d3d', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', background: '#0d1b26',
          cursor: 'move', userSelect: 'none'
        }
      }, [
        el('strong', { textContent: '𝕏 Pro Control', style: { fontSize: '13px', letterSpacing: '.3px', color: '#e7e9ea' } }),
        closeX
      ]);

      // Tabs Bar
      const tabBar = el('div', {
        style: { display: 'flex', borderBottom: '1px solid #1e2d3d', background: '#0d1b26', flexShrink: '0' }
      });

      const views = {};
      const tabButtons = {};
      const tabDefs = [
        { id: 'typo', label: 'Type' },
        { id: 'ui', label: 'UI' },
        { id: 'layout', label: 'Layout' },
        { id: 'opt', label: 'Opt' }
      ];

      function activateTab(tabId) {
        for (const def of tabDefs) {
          const active = def.id === tabId;
          tabButtons[def.id].style.color = active ? '#e7e9ea' : '#536471';
          tabButtons[def.id].style.borderBottomColor = active ? '#e7e9ea' : 'transparent';
          views[def.id].style.display = active ? 'block' : 'none';
        }
      }

      for (const def of tabDefs) {
        const b = el('button', {
          textContent: def.label,
          style: {
            flex: '1', padding: '7px 0', background: 'none', border: 'none',
            color: def.id === 'typo' ? '#e7e9ea' : '#536471',
            fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
            cursor: 'pointer', borderBottom: `2px solid ${def.id === 'typo' ? '#e7e9ea' : 'transparent'}`
          }
        });
        b.addEventListener('click', () => activateTab(def.id));
        tabButtons[def.id] = b;
        tabBar.appendChild(b);

        const view = el('div', {
          id: `xp-view-${def.id}`,
          style: { display: def.id === 'typo' ? 'block' : 'none', overflowY: 'auto', maxHeight: '380px' }
        });
        views[def.id] = view;
      }

      // 1. Typography View
      for (const [key, slot] of Object.entries(SLOTS)) {
        const s = cfg[key];
        const sec = el('div', { style: { padding: '8px 12px', borderBottom: '1px solid #1a2535' } });
        sec.appendChild(el('div', {
          textContent: slot.label,
          style: { fontSize: '9px', fontWeight: '700', color: '#3d5060', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }
        }));

        const sel = el('select', {
          style: {
            fontSize: '11px', padding: '3px 5px', borderRadius: '5px', border: '1px solid #1e2d3d',
            background: '#0d1b26', color: '#c8d3da', maxWidth: '165px', outline: 'none', cursor: 'pointer'
          }
        });
        for (const f of FONTS) {
          const opt = el('option', { value: f.value, textContent: f.label });
          if (f.value === s.font) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', (e) => {
          cfg[key].font = e.target.value;
          saveSettings();
          applyStyles();
        });

        sec.appendChild(el('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }
        }, [el('span', { textContent: 'Font', style: { color: '#8b98a5' } }), sel]));

        const sizeRow = buildRangeRow('Size', slot.minSize, slot.maxSize, s.size, `${s.size}px`, (v) => {
          cfg[key].size = v;
          saveSettings();
          applyStyles();
          return `${v}px`;
        });
        sec.appendChild(sizeRow.row);
        views.typo.appendChild(sec);
      }

      const ex = cfg.extra;
      const exSec = el('div', { style: { padding: '8px 12px' } });
      exSec.appendChild(el('div', {
        textContent: 'Body Extras',
        style: { fontSize: '9px', fontWeight: '700', color: '#3d5060', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }
      }));
      exSec.appendChild(buildRangeRow('Line Height', 10, 22, Math.round(ex.lineHeight * 10), ex.lineHeight.toFixed(1), (raw) => {
        const v = raw / 10;
        cfg.extra.lineHeight = v;
        saveSettings();
        applyStyles();
        return v.toFixed(1);
      }).row);
      exSec.appendChild(buildRangeRow('Tracking', -5, 10, ex.letterSpacing, `${ex.letterSpacing}px`, (v) => {
        cfg.extra.letterSpacing = v;
        saveSettings();
        applyStyles();
        return `${v}px`;
      }).row);
      exSec.appendChild(buildCheckboxRow('Italic Body', ex.italic, (v) => {
        cfg.extra.italic = v;
        saveSettings();
        applyStyles();
      }));
      views.typo.appendChild(exSec);

      // 2. UI View
      const u = cfg.uiSizes;
      const uiSec = el('div', { style: { padding: '10px 12px' } });
      uiSec.appendChild(el('div', {
        textContent: 'Action Bar & Media',
        style: { fontSize: '9px', fontWeight: '700', color: '#3d5060', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }
      }));
      uiSec.appendChild(buildRangeRow('Bar Size', 8, 48, u.actionBarSize, `${u.actionBarSize}px`, (v) => {
        cfg.uiSizes.actionBarSize = v; saveSettings(); applyStyles(); return `${v}px`;
      }).row);
      uiSec.appendChild(buildRangeRow('Icon Size', 8, 48, u.actionBtnSize, `${u.actionBtnSize}px`, (v) => {
        cfg.uiSizes.actionBtnSize = v; saveSettings(); applyStyles(); return `${v}px`;
      }).row);
      uiSec.appendChild(buildRangeRow('Play Btn', 10, 120, u.playBtnSize, `${u.playBtnSize}px`, (v) => {
        cfg.uiSizes.playBtnSize = v; saveSettings(); applyStyles(); return `${v}px`;
      }).row);

      uiSec.appendChild(el('div', { style: { borderTop: '1px solid #1a2535', margin: '8px 0' } }));
      uiSec.appendChild(el('div', {
        textContent: 'Floating Buttons Scale',
        style: { fontSize: '9px', fontWeight: '700', color: '#3d5060', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }
      }));
      uiSec.appendChild(buildRangeRow('Buttons Size', 24, 56, u.mainBtnSize || 34, `${u.mainBtnSize || 34}px`, (v) => {
        cfg.uiSizes.mainBtnSize = v; saveSettings(); applyFloatingBtnScale(v); return `${v}px`;
      }).row);
      views.ui.appendChild(uiSec);

      // 3. Layout View
      const lo = cfg.layout;
      const loSec = el('div', { style: { padding: '10px 12px' } });
      loSec.appendChild(el('div', {
        textContent: 'Feed Position',
        style: { fontSize: '9px', fontWeight: '700', color: '#3d5060', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '6px' }
      }));
      const feedDisp = el('div', {
        id: 'xp-feed-display',
        textContent: `${lo.feedOffset > 0 ? '+' : ''}${lo.feedOffset} px`,
        style: { textAlign: 'center', fontSize: '20px', fontWeight: '300', color: '#e7e9ea', padding: '2px 0 6px' }
      });
      loSec.appendChild(feedDisp);

      const feedValSpan = el('span', {
        id: 'xp-feed-val',
        textContent: `${lo.feedOffset}px`,
        style: { color: '#536471', fontSize: '10px', width: '38px', textAlign: 'right' }
      });
      const feedSlider = el('input', {
        id: 'xp-feed-slider', type: 'range', min: -FEED_MAX, max: FEED_MAX, step: 1, value: lo.feedOffset,
        style: { flex: '1', accentColor: '#e7e9ea', height: '3px', cursor: 'pointer' }
      });
      feedSlider.value = String(lo.feedOffset);
      feedSlider.addEventListener('input', (e) => setFeedOffset(+e.target.value));
      loSec.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } }, [
        feedSlider,
        feedValSpan
      ]));

      const mkLayoutBtn = (txt, onClick) => {
        const b = el('button', {
          textContent: txt,
          style: {
            flex: '1', padding: '5px 4px', borderRadius: '5px', border: '1px solid #1e2d3d',
            background: '#0d1b26', color: '#8b98a5', fontSize: '10px', cursor: 'pointer'
          }
        });
        b.addEventListener('click', onClick);
        return b;
      };

      loSec.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } }, [
        mkLayoutBtn('◀ Left', () => setFeedOffset(cfg.layout.feedOffset - FEED_STEP)),
        mkLayoutBtn('↺ Reset', () => setFeedOffset(0)),
        mkLayoutBtn('Right ▶', () => setFeedOffset(cfg.layout.feedOffset + FEED_STEP))
      ]));

      loSec.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '10px' } }, [
        mkLayoutBtn('⊙ Auto Center', autoCenter),
        mkLayoutBtn('◁ Left Edge', () => setFeedOffset(-FEED_MAX)),
        mkLayoutBtn('○ Default', () => setFeedOffset(0)),
        mkLayoutBtn('▷ Right Edge', () => setFeedOffset(FEED_MAX))
      ]));

      const loChecks = el('div', { style: { borderTop: '1px solid #1a2535', paddingTop: '8px' } });
      loChecks.appendChild(buildCheckboxRow('Disable Repositioner', lo.feedDisabled, (v) => {
        cfg.layout.feedDisabled = v;
        if (v) clearFeedOffset(); else applyFeedOffset(cfg.layout.feedOffset);
        saveSettings();
      }));
      loChecks.appendChild(buildCheckboxRow('Hide Left Sidebar', lo.hideSidebar, (v) => {
        cfg.layout.hideSidebar = v;
        saveSettings();
        applyStyles();
      }));
      loSec.appendChild(loChecks);
      views.layout.appendChild(loSec);

      // 4. Opt View
      const o = cfg.opt;
      const optSec = el('div', { style: { padding: '10px 12px' } });
      const optDefs = [
        ['hideAds',           'Block ads & promoted'],
        ['hideVideos',        'Hide posts with videos'],
        ['hideWhoToFollow',   'Hide "Who to follow"'],
        ['hideTrending',      'Hide trending section'],
        ['compactLayout',     'Compact tweet layout'],
        ['autoExpand',        'Auto-expand "Show more"'],
        ['optimizeScrolling', 'Hardware-accelerated scroll']
      ];
      for (const [k, label] of optDefs) {
        optSec.appendChild(buildCheckboxRow(label, o[k], (v) => {
          cfg.opt[k] = v;
          saveSettings();
          applyStyles();
        }));
      }
      views.opt.appendChild(optSec);

      // Footer
      const resetBtn = el('button', {
        textContent: 'Reset All',
        style: {
          flex: '1', padding: '6px', borderRadius: '5px', border: '1px solid #2d1217',
          background: '#1a0c0f', color: '#f4212e', fontSize: '11px', cursor: 'pointer'
        }
      });
      resetBtn.addEventListener('click', () => {
        cfg = buildDefault();
        saveSettings();
        clearFeedOffset();
        panel.remove();
        buildPanel();
        applyStyles();
        applyFloatingBtnScale(34);
        const newPanel = document.getElementById('xpro-panel');
        if (newPanel) newPanel.style.display = 'flex';
      });

      const closeBtn2 = el('button', {
        textContent: 'Close',
        style: {
          flex: '1', padding: '6px', borderRadius: '5px', border: '1px solid #1e2d3d',
          background: '#16222f', color: '#e7e9ea', fontSize: '11px', cursor: 'pointer'
        }
      });
      closeBtn2.addEventListener('click', hide);

      const footer = el('div', {
        style: { padding: '8px 12px', borderTop: '1px solid #1e2d3d', display: 'flex', gap: '8px', background: '#0d1b26', flexShrink: '0' }
      }, [resetBtn, closeBtn2]);

      panel.append(headerBar, tabBar, views.typo, views.ui, views.layout, views.opt, footer);
      rootTarget.appendChild(panel);

      // Drag panel by header on desktop
      let pDragging = false, pStartX = 0, pStartY = 0, pOrigL = 0, pOrigT = 0;
      headerBar.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target === closeX) return;
        pDragging = true;
        pStartX = e.clientX;
        pStartY = e.clientY;
        const rect = panel.getBoundingClientRect();
        pOrigL = rect.left;
        pOrigT = rect.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = `${pOrigL}px`;
        panel.style.top = `${pOrigT}px`;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!pDragging) return;
        const maxL = Math.max(0, window.innerWidth - panel.offsetWidth);
        const maxT = Math.max(0, window.innerHeight - 60);
        panel.style.left = `${Math.max(0, Math.min(pOrigL + (e.clientX - pStartX), maxL))}px`;
        panel.style.top = `${Math.max(0, Math.min(pOrigT + (e.clientY - pStartY), maxT))}px`;
      });
      window.addEventListener('mouseup', () => { pDragging = false; });
    }

    function togglePanel() {
      buildPanel();
      const p = document.getElementById('xpro-panel');
      if (p) p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    }

    function onHydrate() {
      reloadCfg();
      applyStyles();
      if (cfg.layout.feedOffset && !cfg.layout.feedDisabled) {
        applyFeedOffset(cfg.layout.feedOffset);
      } else {
        clearFeedOffset();
      }
      applyFloatingBtnScale(cfg.uiSizes.mainBtnSize || 34);
      const oldPanel = document.getElementById('xpro-panel');
      if (oldPanel) {
        const wasOpen = oldPanel.style.display !== 'none';
        oldPanel.remove();
        buildPanel();
        if (wasOpen) {
          const np = document.getElementById('xpro-panel');
          if (np) np.style.display = 'flex';
        }
      }
    }

    applyStyles();
    return { buildPanel, togglePanel, applyFeedOffset, onHydrate, getCfg: () => cfg };
  })();

  /* =========================================================================
     MODULE 5: 𝕏 Playlist v5.0 (Low-CPU Batch Engine, IndexedDB, Pure DOM)
     ========================================================================= */
  const RAW_FOLLOWING_LIST = `
## 1. News, Journalism & Geopolitics
### Global News & Financial Press
@Reuters
@BBCWorld
@BBCBreaking
@AP
@nytimes
@WSJ
@FT
@FinancialTimes
@TheEconomist
@CNN
@cnnbrk
@Bloomberg
@latimes
@AJEnglish
@Newsweek
@TIME
@Forbes

### Deep Dives, Analysis & Commentary
@TheAtlantic
@NewYorker
@washingtonpost
@ForeignAffairs
@ForeignPolicy
@voxdotcom
@politico
@newrepublic
@Slate
@NYMag
@NPR
@nytopinion
@ezraklein

### Politics & Independent Media
@BernieSanders
@SenSanders
@KamalaHarris
@JulianAssange
@AnaKasparian
@mehdirhasan
@jacksonhinkle
@SprinterPress

### Ethiopian & Regional African Media
@addisstandard
@EthioReporter
@TheReporterET
@addis_fortune
@EliasMeseret
@BBCAfrica
@ReutersAfrica
@TheAfricaReport

---

## 2. Cinema, Film & Television
### Studios, Streamers & Distributors
@A24
@Criterion
@criterionchannl
@janusfilms
@mubi
@neonrated
@KinoLorber
@ArrowFilmsVideo
@MagnoliaPics
@sonyclassics
@FocusFeatures
@searchlightpics
@AppleTV
@netflix
@DisneyStudios
@UniversalPics
@ParamountPics
@warnerbros
@MarvelStudios
@DCOfficial

### Film Criticism, Industry & Publications
@SightSoundmag
@FilmComment
@cahierscinema
@TheFilmStage
@IndieWire
@Variety
@THR
@DEADLINE
@empiremagazine
@totalfilm
@FilmLinc
@letterboxd
@ebertchicago
@ebertvoices
@worldofreel
@PeterBradshaw1
@tnyfrontrow
@nofilmschool

### Film Curation, Stills & Culture
@OnePerfectShot
@TheCinesthetic
@TheCinegogue
@LostInFilm
@davidcinema
@DiscussingFilm
@FilmUpdates
@WorldCinemania
@coenesqued2
@RealEOC
@DannyDrinksWine
@screenrant
@clockwork_wb
@getFANDOM
@etnow

### Film Archives, Festivals & Academies
@TheAcademy
@BAFTA
@AmericanCine
@AmericanFilm
@BFI
@MoMAFilm
@Tribeca
@filmindependent
@am_cinematheque
@AnthologyFilm
@MovingImageNYC
@TheOldHollywood
@oldhollywoodx
@TinseltownTwins
@RealGDT
@MarkRuffalo

---

## 3. Sports & Football (Soccer)
### Clubs & Major Competitions
@ChampionsLeague
@EuropaLeague
@FIFAWorldCup
@FIFAcom
@premierleague
@LaLiga
@LaLigaEN
@SerieA_EN
@Bundesliga_EN
@FCBarcelona
@ManUtd
@realmadrid
@realmadriden
@ChelseaFC
@ManCity
@LFC
@FCBayernEN
@Arsenal
@BlackYellow
@PSG_inside
@juventusfc
@juventusfcen
@atletienglish
@en_sscnapoli
@OfficialSSLazio

### Transfer News, Insiders & Top Journalists
@FabrizioRomano
@David_Ornstein
@TheAthleticFC
@SkySportsNews
@SkySportsPL
@BBCSport
@guardian_sport
@MailSport
@TeleFootball
@lequipe
@ESPNFC
@OneFootball
@ReshadRahman
@JacobsBen
@SamiMokbel_BBC
@JacobSteinberg
@barneyronay
@JamesHorncastle
@henrywinter
@markgoldbridge

### Fan Media, Analysis & Tactical Commentary
@UnitedStandMUFC
@StretfordPaddck
@ManagingBarca
@BarcaUniversal
@ContextfreeFCB_
@TouchlineX
@PanenkaPower
@mreflow
@BouafifNour
@AnabellaMarvy

### Football Culture, Memes & Highlights
@433
@goal
@FootyHumour
@hardfootypix
@TrollFootball
@TrollFootball2
@appiecule
@vickervics9
@BlasterAlex
@CrewsMat10

---

## 4. Science, Space & Nature
### Space Exploration & Observatories
@NASA
@SpaceX
@esa
@Space_Station
@NASAHubble
@latestinspace
@MAstronomers

### Scientific Journals & News
@Nature
@ScienceMagazine
@ScienceNews
@sciam
@newscientist
@PopSci
@NewsfromScience

### Popular Science & Visual Curations
@Kurz_Gesagt
@veritasium
@SciShow
@NatGeo
@wonderofscience
@PhysInHistory
@stem_feed
@engineers_feed
@TheGlobal_Index
@theepicmap

### Scientists & Science Communicators
@neiltyson
@ProfBrianCox
@michiokaku
@bgreene
@RichardDawkins

---

## 5. Technology, AI & Digital Culture
### AI Labs & Visionary Leaders
@OpenAI
@sama
@gdb
@DarioAmodei
@GoogleAI
@Google
@satyanadella
@BillGates
@jimmy_wales

### Tech Journalism & Hardware
@WIRED
@verge
@TechCrunch
@fttechnews
@ReutersTech
@WSJTech
@techreview
@engadget
@Gizmodo
@mashable
@FastCompany
@DigitalTrends
@AndroidAuth
@lifehacker
@wikiHow

---

## 6. Philosophy, History & Intellectual Ideas
### Philosophy & Cultural Discussion
@TheSchoolOfLife
@PhilosophyNow
@dailystoic
@IAI_TV
@bigthink
@CosmicSkeptic
@themarginalian
@brainpickings
@openculture
@TED_ED
@TEDTalks
@TEDx
@HarvardBiz
@Pontifex

### History & Visual Archives
@TodayinHistory
@HistoryExtra
@BritishPathe
@ridethepastlane
@thatdayin1992

### Long-Form Discussion & Human Biology
@hubermanlab
@lexfridman

---

## 7. Art, Photography, Architecture & Museums
### World Museums & Galleries
@MuseeLouvre
@UffiziGalleries
@V_and_A
@NationalGallery
@ngadc
@Guggenheim

### Photography & Visual Arts
@MagnumPhotos
@GettyImages
@artnet
@artsy
@Artforum
@artdaily
@ArtReview_
@AestheticaMag

### Architecture & Spatial Design
@ArchDigest
@architectmag

---

## 8. Literature, Poetry & Publishing
### Literary Magazines & Reviews
@parisreview
@lithub
@nybooks
@goodreads

### Poetry & Authors
@POETSorg
@PoetryArchive
@Poetry_Daily
@StephenKing

---

## 9. Pop Culture, Music, Fashion & Entertainment
### Music Publications & Charts
@RollingStone
@billboard
@pitchfork
@NME

### Style, Fashion & Entertainment
@GQMagazine
@ELLEmagazine
@harpersbazaarus
@marieclaire
@MensFitnessX
@TheDailyShow
@Jeopardy
@readersdigest

---

## 10. Public Knowledge & Digital Archives
### Digital Preservation Libraries
@internetarchive
@librarycongress
`;

  const XPlaylist = (() => {
    const SK_DATA        = 'x_pp_data';
    const SK_SCROLL      = 'x_pp_scroll';
    const SK_IDX         = 'x_pp_idx';
    const SK_VIS         = 'x_pp_vis';
    const SK_COLS        = 'x_pp_cols';
    const SK_GEOM        = 'x_pp_geom';
    const SK_FSIZE       = 'x_pp_fsize';
    const SK_FFAM        = 'x_pp_ffam';
    const SK_AVATARS_V1  = 'x_pp_avatars';
    const SK_TAB_MODE    = 'x_pp_tab_mode';
    const SK_ACTIVE_TAB  = 'x_pp_active_tab';
    const SK_AVATAR_ONLY = 'x_pp_avatar_only';
    const SK_LIST_VER    = 'x_pp_list_ver_v5';

    const DB_NAME              = 'X_Playlist_Avatars_DB';
    const DB_VERSION           = 2;
    const DB_STORE             = 'avatars_store_v2';

    const SYNC_BATCH_SIZE      = 5;
    const SYNC_CONCURRENCY     = 2;
    const SYNC_BATCH_PAUSE_MS  = 1200;
    const SYNC_ITEM_STAGGER_MS = 350;
    const MAX_CONCURRENT_IMGS  = 5;
    const IMG_TIMEOUT_MS       = 6000;
    const USER_WATCHDOG_MS     = 20000;
    const MAX_NET_FAILURES     = 10;
    const CHUNK_SIZE           = 100;
    const THUMB_MAX_PX         = 72;

    const X_BLUE     = '#1d9bf0';
    const SIDE_BG    = 'rgba(0, 0, 0, 0.96)';
    const CARD_BG    = '#16181c';
    const INPUT_BG   = '#202327';
    const BORDER_CLR = '#2f3336';
    const BTN_BORDER = '#2f3336';

    const FONT_OPTIONS = [
      { label: 'Default (X)',    value: '"TwitterChirp", "Helvetica Neue", sans-serif' },
      { label: 'Inter',          value: '"Inter", sans-serif' },
      { label: 'Roboto',         value: '"Roboto", sans-serif' },
      { label: 'Open Sans',      value: '"Open Sans", sans-serif' },
      { label: 'Josefin Sans',   value: '"Josefin Sans", sans-serif' },
      { label: 'Arial',          value: 'Arial, sans-serif' },
      { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, sans-serif' },
      { label: 'Georgia',        value: 'Georgia, serif' },
      { label: 'Courier New',    value: '"Courier New", monospace' },
      { label: 'Comic Sans MS',  value: '"Comic Sans MS", cursive' },
      { label: 'Great Vibes',    value: '"Great Vibes", cursive' },
      { label: 'Bodoni',         value: '"Bodoni MT", "Bodoni 72", serif' }
    ];
    const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20];

    GM_addStyle(`
      #x-pp-sidebar {
        --xpp-fsize: 13px;
        --xpp-ffam: "TwitterChirp", "Helvetica Neue", sans-serif;
        font-family: var(--xpp-ffam);
      }
      #x-pp-list::-webkit-scrollbar { width: 6px; }
      #x-pp-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }
      .x-pp-banner {
        font-size: calc(var(--xpp-fsize) * 1.1);
        font-weight: 700;
        color: ${X_BLUE};
        padding: 8px 4px 4px 4px;
        border-bottom: 1px solid ${BORDER_CLR};
        margin-top: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .x-pp-banner-count {
        font-size: 10px;
        color: #71767b;
      }
      .x-pp-subheader {
        font-size: calc(var(--xpp-fsize) * 0.85);
        font-weight: 700;
        color: #71767b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 6px 4px 2px;
        grid-column: 1 / -1;
        width: 100%;
      }
      .x-pp-row {
        display: flex;
        align-items: center;
        gap: 0.5em;
        min-width: 0;
        padding: 4px 6px;
        cursor: pointer;
        background: transparent;
        color: #8b98a5;
        font-weight: normal;
        border-radius: 6px;
        text-decoration: none;
        font-size: var(--xpp-fsize);
        font-family: var(--xpp-ffam);
        line-height: 1.35;
        box-sizing: border-box;
        border-left: 2.5px solid transparent;
      }
      .x-pp-row.x-pp-cols-1 {
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      }
      .x-pp-row:not(.x-pp-active):not(.x-pp-av-only):hover {
        background: rgba(231, 233, 234, 0.08);
        color: #e7e9ea;
      }
      .x-pp-row.x-pp-active:not(.x-pp-av-only) {
        background: rgba(231, 233, 234, 0.12);
        color: #e7e9ea;
        font-weight: 700;
        border-left-color: ${X_BLUE};
      }
      .x-pp-row.x-pp-av-only {
        justify-content: center;
        padding: 3px;
        border-radius: 50%;
        border-left: none;
        gap: 0;
      }
      .x-pp-avatar-box {
        width: 2.35em;
        height: 2.35em;
        min-width: 2.35em;
        min-height: 2.35em;
        border-radius: 50%;
        background: ${INPUT_BG};
        flex-shrink: 0;
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      }
      .x-pp-row.x-pp-av-only.x-pp-active .x-pp-avatar-box {
        box-shadow: 0 0 0 2.5px ${X_BLUE}, 0 0 10px rgba(29, 155, 240, 0.6);
      }
      .x-pp-avatar-placeholder {
        font-size: 0.9em;
        font-weight: 700;
        color: #71767b;
        user-select: none;
        line-height: 1;
      }
      .x-pp-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
        display: none;
      }
      .x-pp-label {
        min-width: 0;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #x-pp-load-more {
        text-align: center;
        padding: 7px;
        margin: 6px 0;
        border-radius: 6px;
        background: ${CARD_BG};
        border: 1px solid ${BORDER_CLR};
        color: #e7e9ea;
        font-size: 11px;
        cursor: pointer;
        user-select: none;
      }
      #x-pp-load-more:hover {
        border-color: ${X_BLUE};
      }
    `);

    let parsedGroups      = [];
    let currentIndex      = -1;
    let searchQuery       = '';
    let isSyncing         = false;
    let syncAborted       = false;
    let syncCircuitBroken = false;
    let isShuttingDown    = false;

    const sessionFailedSet = new Set();
    const activeImagesSet  = new Set();

    const loadData       = ()  => Store.get(SK_DATA, null);
    const saveData       = (d) => Store.set(SK_DATA, d || []);
    const saveIdx        = (i) => { Store.set(SK_IDX, i); currentIndex = i; };
    const loadIdx        = ()  => +Store.get(SK_IDX, -1);
    const loadVis        = ()  => Boolean(Store.get(SK_VIS, false));
    const saveVis        = (v) => Store.set(SK_VIS, !!v);
    const loadCols       = ()  => Math.max(1, Math.min(5, parseInt(Store.get(SK_COLS, 1), 10) || 1));
    const saveCols       = (v) => Store.set(SK_COLS, v);
    const loadFSize      = ()  => parseInt(Store.get(SK_FSIZE, 13), 10) || 13;
    const saveFSize      = (v) => Store.set(SK_FSIZE, v);
    const loadFFam       = ()  => String(Store.get(SK_FFAM, FONT_OPTIONS[0].value) || FONT_OPTIONS[0].value);
    const saveFFam       = (v) => Store.set(SK_FFAM, v);
    const loadTabMode    = ()  => Boolean(Store.get(SK_TAB_MODE, false));
    const saveTabMode    = (v) => Store.set(SK_TAB_MODE, !!v);
    const loadActiveTab  = ()  => String(Store.get(SK_ACTIVE_TAB, 'ALL') || 'ALL');
    const saveActiveTab  = (v) => Store.set(SK_ACTIVE_TAB, v);
    const loadAvatarOnly = ()  => Boolean(Store.get(SK_AVATAR_ONLY, false));
    const saveAvatarOnly = (v) => Store.set(SK_AVATAR_ONLY, !!v);

    const defaultGeom = { left: '', top: '16px', right: '16px', width: '310px', height: '82vh' };
    const loadGeom  = () => {
      const g = Store.get(SK_GEOM, null);
      return g && typeof g === 'object' ? { ...defaultGeom, ...g } : { ...defaultGeom };
    };
    const saveGeom  = (g) => Store.set(SK_GEOM, g);

    function isValidAvatarVal(val) {
      return (
        typeof val === 'string' &&
        val.length > 0 &&
        val !== 'NONE' &&
        (val.startsWith('data:image') || val.startsWith('http'))
      );
    }

    /***************************************************************************
     * IndexedDB Primary Avatar Store (never serializes Base64 into KV/localStorage)
     ***************************************************************************/
    let avatarCache = {};
    let idbInstance = null;
    let pendingLSMigration = null;

    try {
      const rawV1 = window.localStorage.getItem(SK_AVATARS_V1);
      if (rawV1) {
        const parsed = __safeJsonParse(rawV1, null);
        if (parsed && typeof parsed === 'object') {
          pendingLSMigration = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (isValidAvatarVal(v)) {
              avatarCache[k] = v;
              pendingLSMigration[k] = v;
            }
          }
        }
        window.localStorage.removeItem(SK_AVATARS_V1);
      }
      // Clean legacy kv copy if old version stored avatars in KV
      if (Store.get(SK_AVATARS_V1, null) !== null) {
        const oldKv = Store.get(SK_AVATARS_V1, null);
        if (oldKv && typeof oldKv === 'object') {
          pendingLSMigration = pendingLSMigration || {};
          for (const [k, v] of Object.entries(oldKv)) {
            if (isValidAvatarVal(v)) {
              avatarCache[k] = v;
              pendingLSMigration[k] = v;
            }
          }
        }
        Store.remove(SK_AVATARS_V1);
      }
    } catch (_) {}

    function getIDB() {
      if (idbInstance) return Promise.resolve(idbInstance);
      if (typeof indexedDB === 'undefined') return Promise.resolve(null);
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
              db.createObjectStore(DB_STORE);
            }
          };
          req.onsuccess = () => {
            idbInstance = req.result;
            resolve(idbInstance);
          };
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    }

    function idbPut(key, val) {
      if (!isValidAvatarVal(val)) return;
      getIDB().then((db) => {
        if (!db) return;
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(val, key);
        } catch (_) {}
      });
    }

    function idbDelete(key) {
      getIDB().then((db) => {
        if (!db) return;
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).delete(key);
        } catch (_) {}
      });
    }

    function idbClearAll() {
      getIDB().then((db) => {
        if (!db) return;
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).clear();
        } catch (_) {}
      });
    }

    getIDB().then((db) => {
      if (!db) return;
      try {
        if (pendingLSMigration) {
          const migTx = db.transaction(DB_STORE, 'readwrite');
          const migStore = migTx.objectStore(DB_STORE);
          for (const [k, v] of Object.entries(pendingLSMigration)) {
            if (isValidAvatarVal(v)) migStore.put(v, k);
          }
          pendingLSMigration = null;
        }

        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        const cursorReq = store.openCursor();
        let updated = false;

        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (isValidAvatarVal(cursor.value)) {
              if (!avatarCache[cursor.key]) {
                avatarCache[cursor.key] = cursor.value;
                updated = true;
              }
            } else {
              try { cursor.delete(); } catch (_) {}
            }
            cursor.continue();
          } else {
            if (updated) syncRenderedRowAvatars();
            updateSyncButtonLabel();
          }
        };
      } catch (_) {}
    });

    let syncLabelTimer = null;
    function scheduleSyncLabelUpdate() {
      if (syncLabelTimer) return;
      syncLabelTimer = setTimeout(() => {
        syncLabelTimer = null;
        updateSyncButtonLabel();
      }, 250);
    }

    function cacheAvatar(username, url) {
      if (!username || !isValidAvatarVal(url)) return;
      const u = username.toLowerCase();
      if (avatarCache[u] === url) return;
      avatarCache[u] = url;
      sessionFailedSet.delete(u);
      idbPut(u, url);
      broadcastAvatarUpdate(u, url);
      scheduleSyncLabelUpdate();
    }

    function purgeAvatarEntry(username) {
      const u = username.toLowerCase();
      delete avatarCache[u];
      idbDelete(u);
      scheduleSyncLabelUpdate();
    }

    function wipeAllAvatarCache() {
      if (isSyncing) syncAborted = true;
      syncCircuitBroken = false;
      imgLoadQueue.length = 0;
      imgQueuedSet.clear();
      sessionFailedSet.clear();
      avatarCache = {};
      try { window.localStorage.removeItem(SK_AVATARS_V1); } catch (_) {}
      Store.remove(SK_AVATARS_V1);
      idbClearAll();
      renderList();
      updateSyncButtonLabel();
    }

    /***************************************************************************
     * Verification & 72x72 Thumbnail Downscaler + Bounded Viewport Image Pool
     ***************************************************************************/
    function verifyImageLoads(url) {
      if (isShuttingDown || !url || typeof url !== 'string') return Promise.resolve(false);
      if (url.startsWith('data:image')) return Promise.resolve(true);

      return new Promise((resolve) => {
        const testImg = new Image();
        testImg.referrerPolicy = 'no-referrer';
        activeImagesSet.add(testImg);
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          activeImagesSet.delete(testImg);
          testImg.onload = null;
          testImg.onerror = null;
          if (!ok) {
            try { testImg.src = ''; } catch (_) {}
          }
          resolve(ok);
        };
        const timer = setTimeout(() => done(false), IMG_TIMEOUT_MS);
        testImg.onload = () => done(testImg.naturalWidth > 0);
        testImg.onerror = () => done(false);
        testImg.src = url;
      });
    }

    async function convertUrlToBase64(url) {
      if (isShuttingDown || !url || url.startsWith('data:image')) return url;
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        activeImagesSet.add(img);
        let settled = false;
        const finish = (out) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          activeImagesSet.delete(img);
          img.onload = null;
          img.onerror = null;
          resolve(out);
        };
        const timer = setTimeout(() => finish(url), IMG_TIMEOUT_MS);
        img.onload = () => {
          try {
            const w = img.naturalWidth || img.width || THUMB_MAX_PX;
            const h = img.naturalHeight || img.height || THUMB_MAX_PX;
            const scale = Math.min(1, THUMB_MAX_PX / Math.max(w, h));
            const outW = Math.max(1, Math.round(w * scale));
            const outH = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, outW, outH);
            finish(canvas.toDataURL('image/jpeg', 0.72));
          } catch (_) {
            finish(url);
          }
        };
        img.onerror = () => finish(url);
        img.src = url;
      });
    }

    const imgLoadQueue = [];
    const imgQueuedSet = new Set();
    let activeImgLoads = 0;

    function pumpImgLoadQueue() {
      if (isShuttingDown) return;
      while (activeImgLoads < MAX_CONCURRENT_IMGS && imgLoadQueue.length > 0) {
        const task = imgLoadQueue.shift();
        imgQueuedSet.delete(task.username);

        if (!task.img.isConnected || !isValidAvatarVal(task.url)) continue;

        if (task.url.startsWith('data:image')) {
          task.img.onload = () => {
            if (task.img.naturalWidth > 0) {
              task.img.style.display = 'block';
              task.placeholder.style.display = 'none';
            }
          };
          task.img.src = task.url;
          continue;
        }

        activeImgLoads++;
        let finished = false;
        const complete = (ok) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeoutId);
          activeImgLoads = Math.max(0, activeImgLoads - 1);
          if (!ok && task.img.isConnected) {
            task.img.removeAttribute('src');
            task.img.style.display = 'none';
            task.placeholder.style.display = 'flex';
            if (avatarCache[task.username] && !avatarCache[task.username].startsWith('data:')) {
              purgeAvatarEntry(task.username);
            }
          }
          pumpImgLoadQueue();
        };

        const timeoutId = setTimeout(() => complete(false), IMG_TIMEOUT_MS);
        task.img.onload = () => {
          if (task.img.naturalWidth > 0) {
            task.img.style.display = 'block';
            task.placeholder.style.display = 'none';
            complete(true);
          } else {
            complete(false);
          }
        };
        task.img.onerror = () => complete(false);
        task.img.src = task.url;
      }
    }

    function queueVisibleImgLoad(username, url, imgEl, placeholderEl) {
      if (!imgEl || !placeholderEl || !isValidAvatarVal(url)) return;
      if (url.startsWith('data:image')) {
        imgEl.onload = () => {
          if (imgEl.naturalWidth > 0) {
            imgEl.style.display = 'block';
            placeholderEl.style.display = 'none';
          }
        };
        imgEl.src = url;
        return;
      }
      if (imgQueuedSet.has(username)) return;
      imgQueuedSet.add(username);
      imgLoadQueue.push({ username, url, img: imgEl, placeholder: placeholderEl });
      pumpImgLoadQueue();
    }

    function extractUsername(entry) {
      if (!entry) return null;
      const str = entry.trim();
      if (/^https?:\/\/(www\.)?(x|twitter)\.com/i.test(str)) {
        try {
          const u = new URL(str);
          const parts = u.pathname.split('/').filter(Boolean);
          const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose']);
          if (parts[0] && !reserved.has(parts[0].toLowerCase())) return parts[0].replace(/^@/, '');
        } catch (_) {}
      }
      if (str.startsWith('@')) return str.replace(/^@/, '').split(/[/?# ]/)[0];
      if (/^[a-zA-Z0-9_]{1,15}$/.test(str)) return str;
      return null;
    }

    function getCurrentUsername() {
      const path = window.location.pathname.replace(/^\//, '').split('/')[0];
      const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose']);
      if (path && !reserved.has(path.toLowerCase())) return path.toLowerCase();
      return null;
    }

    function getRouteFromEntry(entry) {
      const str = entry.trim();
      if (/^https?:\/\/(www\.)?(x|twitter)\.com/i.test(str)) {
        try { const u = new URL(str); return u.pathname + u.search; } catch (_) {}
      }
      if (str.startsWith('@')) return `/${str.replace(/^@/, '').split(/[/?# ]/)[0]}`;
      const cleanHandle = extractUsername(str);
      if (cleanHandle) return `/${cleanHandle}`;
      return `/search?q=${encodeURIComponent(str)}&f=user`;
    }

    function navigateTo(entry) {
      if (!entry) return;
      const path = getRouteFromEntry(entry);
      try {
        history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      } catch (_) { window.location.pathname = path; }
      setTimeout(scrapeAvatarsFromDOM, 500);
    }

    function scrapeAvatarsFromDOM() {
      if (isShuttingDown || document.hidden || !document.body) return;

      const cur = getCurrentUsername();
      if (cur) {
        const img = document.querySelector('a[href$="/photo"] img[src*="profile_images"], [data-testid="primaryColumn"] img[src*="profile_images"]');
        if (img && img.src && !img.src.includes('default_profile')) {
          const url = img.src.replace('_normal.', '_bigger.');
          if (!avatarCache[cur] || !avatarCache[cur].startsWith('data:image')) {
            cacheAvatar(cur, url);
            convertUrlToBase64(url).then((b64) => {
              if (!isShuttingDown && b64 && b64.startsWith('data:image')) cacheAvatar(cur, b64);
            });
          }
        }
      }

      const tweets = document.querySelectorAll('article[data-testid="tweet"]');
      const limit = Math.min(tweets.length, 25);
      for (let i = 0; i < limit; i++) {
        const article = tweets[i];
        const userLink = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
        const img = article.querySelector('img[src*="profile_images"]');
        if (userLink && img && img.src && !img.src.includes('default_profile')) {
          const u = extractUsername(userLink.getAttribute('href'));
          if (u && !isValidAvatarVal(avatarCache[u.toLowerCase()])) {
            cacheAvatar(u, img.src.replace('_normal.', '_bigger.'));
          }
        }
      }
    }

    function getAllItems() { return parsedGroups.flatMap((g) => g.items); }

    function parsePlaylistText(text) {
      const lines = text.split(/\r?\n/);
      const groups = [];
      let curGroup = null, curSubheader = '';
      function getGroup(title) {
        let g = groups.find((x) => x.title.toLowerCase() === title.toLowerCase());
        if (!g) {
          g = { id: 'grp_' + Math.random().toString(36).slice(2, 11), title, items: [] };
          groups.push(g);
        }
        return g;
      }
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line === '---' || line.startsWith('--- START') || line.startsWith('--- END')) continue;
        if (line.startsWith('## ')) { curGroup = getGroup(line.replace(/^##\s+/, '').trim()); curSubheader = ''; }
        else if (line.startsWith('### ')) { curSubheader = line.replace(/^###\s+/, '').trim(); }
        else if (line.startsWith('# ')) { curGroup = getGroup(line.replace(/^#\s+/, '').trim()); curSubheader = ''; }
        else {
          if (!curGroup) curGroup = getGroup('General');
          const u = extractUsername(line);
          curGroup.items.push({
            raw: line,
            handle: line.replace(/^[-*+]\s+/, '').trim(),
            username: u ? u.toLowerCase() : '',
            subheader: curSubheader
          });
        }
      }
      return groups.filter((g) => g.items.length > 0);
    }

    async function fetchAvatarForUserCore(username) {
      const u = username.toLowerCase();
      let sawRateLimit = false;
      let sawNetworkFail = false;
      let gotValidHttp = false;

      // Tier 1: FixTweet Profile API via proxy_http
      const fx = await requestNetworkJson(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(u)}`);
      if (fx.status === 429) sawRateLimit = true;
      else if (fx.status === 0) sawNetworkFail = true;
      else if (fx.status >= 200 && fx.status < 500) gotValidHttp = true;

      const fxUrl = fx?.data?.user?.avatar_url || fx?.data?.avatar_url;
      if (fxUrl && typeof fxUrl === 'string' && fxUrl.startsWith('http')) {
        const bigger = fxUrl.replace('_normal.', '_bigger.');
        if (await verifyImageLoads(bigger)) return { url: bigger };
      }

      if (isShuttingDown) return null;

      // Tier 2: Unavatar JSON API via proxy_http
      const un = await requestNetworkJson(`https://unavatar.io/x/${encodeURIComponent(u)}?json&fallback=false`);
      if (un.status === 429) sawRateLimit = true;
      else if (un.status === 0) sawNetworkFail = true;
      else if (un.status >= 200 && un.status < 500) gotValidHttp = true;

      const unUrl = un?.data?.url;
      if (unUrl && typeof unUrl === 'string' && unUrl.startsWith('http')) {
        const bigger = unUrl.replace('_normal.', '_bigger.');
        if (await verifyImageLoads(bigger)) return { url: bigger };
      }

      if (sawRateLimit) return { rateLimited: true };
      if (!gotValidHttp && sawNetworkFail) return { netError: true };
      return { notFound: true };
    }

    function fetchAvatarForUser(username) {
      return Promise.race([
        fetchAvatarForUserCore(username),
        sleep(USER_WATCHDOG_MS).then(() => ({ netError: true }))
      ]);
    }

    function broadcastAvatarUpdate(username, url) {
      const u = username.toLowerCase();
      const lc = document.getElementById('x-pp-list');
      if (!lc || !isValidAvatarVal(url)) return;
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(u) : u;
      lc.querySelectorAll(`.x-pp-avatar-box[data-username="${escaped}"]`).forEach((box) => {
        const img = box.querySelector('.x-pp-avatar-img');
        const ph = box.querySelector('.x-pp-avatar-placeholder');
        if (img && ph) queueVisibleImgLoad(u, url, img, ph);
      });
    }

    function syncRenderedRowAvatars() {
      const lc = document.getElementById('x-pp-list');
      if (!lc) return;
      lc.querySelectorAll('.x-pp-avatar-box').forEach((box) => {
        const u = box.dataset.username;
        const cached = avatarCache[u];
        if (!isValidAvatarVal(cached)) return;
        const img = box.querySelector('.x-pp-avatar-img');
        const ph = box.querySelector('.x-pp-avatar-placeholder');
        if (img && ph && !img.getAttribute('src')) {
          queueVisibleImgLoad(u, cached, img, ph);
        }
      });
    }

    async function startAvatarBatchSync(isManualClick = true) {
      if (isShuttingDown) return;
      if (isSyncing) {
        if (isManualClick) syncAborted = true;
        return;
      }

      if (isManualClick) {
        sessionFailedSet.clear();
        syncCircuitBroken = false;
      }

      const items = getAllItems().map((it) => it.username).filter(Boolean);
      if (!items.length) return;
      const uniqueAll = Array.from(new Set(items));
      const missing = uniqueAll.filter((u) => !isValidAvatarVal(avatarCache[u]) && !sessionFailedSet.has(u));
      if (!missing.length) {
        if (isManualClick) {
          const btn = document.getElementById('x-pp-sync-btn');
          if (btn) {
            btn.textContent = '✅ All Cached';
            setTimeout(() => updateSyncButtonLabel(), 1800);
          }
        }
        return;
      }

      isSyncing = true;
      syncAborted = false;
      syncCircuitBroken = false;

      let completedCount = uniqueAll.length - missing.length;
      const totalCount = uniqueAll.length;
      let consecNetErrors = 0;

      updateSyncButtonLabel(completedCount, totalCount);

      for (let i = 0; i < missing.length && !syncAborted && !isShuttingDown; i += SYNC_BATCH_SIZE) {
        const batch = missing.slice(i, i + SYNC_BATCH_SIZE);
        let batchIdx = 0;

        const runWorker = async () => {
          while (!syncAborted && !isShuttingDown) {
            const myIdx = batchIdx++;
            if (myIdx >= batch.length) break;
            const u = batch[myIdx];
            if (!u || isValidAvatarVal(avatarCache[u])) continue;

            if (myIdx > 0) await sleep(SYNC_ITEM_STAGGER_MS);
            if (syncAborted || isShuttingDown) break;

            const res = await fetchAvatarForUser(u);
            if (res?.url) {
              consecNetErrors = 0;
              cacheAvatar(u, res.url);
              completedCount++;
              convertUrlToBase64(res.url).then((b64) => {
                if (!isShuttingDown && b64 && b64.startsWith('data:image')) cacheAvatar(u, b64);
              });
            } else if (res?.notFound) {
              consecNetErrors = 0;
              sessionFailedSet.add(u);
            } else {
              consecNetErrors++;
              if (consecNetErrors >= MAX_NET_FAILURES) {
                syncCircuitBroken = true;
                syncAborted = true;
                break;
              }
            }
            updateSyncButtonLabel(completedCount, totalCount);
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(SYNC_CONCURRENCY, batch.length) }, () => runWorker())
        );

        if (syncAborted || isShuttingDown) break;
        if (i + SYNC_BATCH_SIZE < missing.length) {
          await sleep(SYNC_BATCH_PAUSE_MS);
        }
      }

      isSyncing = false;
      syncAborted = false;
      updateSyncButtonLabel(completedCount, totalCount);
    }

    function getAvatarStats() {
      const items = Array.from(new Set(getAllItems().map((it) => it.username).filter(Boolean)));
      if (!items.length) return { cached: 0, total: 0 };
      const cached = items.filter((u) => isValidAvatarVal(avatarCache[u])).length;
      return { cached, total: items.length };
    }

    function updateSyncButtonLabel(cur, tot) {
      const btn = document.getElementById('x-pp-sync-btn');
      if (!btn) return;
      const stats = getAvatarStats();
      const c = cur !== undefined ? cur : stats.cached;
      const t = tot !== undefined ? tot : stats.total;

      if (isSyncing) {
        btn.textContent = `⏳ ${c}/${t}`;
        btn.title = `Batch syncing (${SYNC_BATCH_SIZE}/batch, ${SYNC_CONCURRENCY} concurrent). Click to pause.`;
        btn.style.background = 'rgba(29, 155, 240, 0.35)';
        btn.style.borderColor = X_BLUE;
      } else if (syncCircuitBroken && c < t) {
        btn.textContent = `⚠ Retry (${c}/${t})`;
        btn.title = 'Paused after consecutive network/rate-limit errors. Click to resume.';
        btn.style.background = 'rgba(255, 165, 0, 0.25)';
        btn.style.borderColor = '#ffa500';
      } else {
        btn.textContent = `⚡ Sync (${c}/${t})`;
        btn.title = `Sync missing avatars (${c} of ${t} cached). Click to start.`;
        btn.style.background = c === t && t > 0 ? 'rgba(29, 155, 240, 0.2)' : CARD_BG;
        btn.style.borderColor = c === t && t > 0 ? X_BLUE : BTN_BORDER;
      }
    }

    function mkBtn(label, bg) {
      return el('button', {
        textContent: label,
        style: {
          padding: '3px 7px', borderRadius: '6px', border: `1px solid ${BORDER_CLR}`,
          cursor: 'pointer', background: bg || CARD_BG, color: '#e7e9ea',
          fontSize: '11px', fontFamily: 'system-ui, sans-serif', lineHeight: '1.2',
          whiteSpace: 'nowrap', flexShrink: '0'
        }
      });
    }

    function mkPill(label, isSelected, onClick) {
      const p = el('div', {
        textContent: label,
        style: {
          padding: '3px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
          fontWeight: isSelected ? '600' : '400',
          background: isSelected ? X_BLUE : CARD_BG,
          color: isSelected ? '#ffffff' : '#8b98a5',
          border: `1px solid ${isSelected ? X_BLUE : BORDER_CLR}`,
          whiteSpace: 'nowrap'
        }
      });
      p.addEventListener('click', onClick);
      return p;
    }

    function styleDropdown(node) {
      Object.assign(node.style, {
        background: INPUT_BG, color: '#e7e9ea', border: `1px solid ${BORDER_CLR}`,
        borderRadius: '6px', padding: '2px 4px', fontSize: '11px', cursor: 'pointer', outline: 'none'
      });
    }

    function applyTypographyVars(sidebar) {
      if (!sidebar) return;
      sidebar.style.setProperty('--xpp-fsize', `${loadFSize()}px`);
      sidebar.style.setProperty('--xpp-ffam', loadFFam());
    }

    let rowObserver = null;
    function getRowObserver(rootContainer) {
      if (!rowObserver) {
        rowObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const target = entry.target;
            if (target.id === 'x-pp-load-more') {
              renderNextChunk();
              return;
            }
            rowObserver.unobserve(target);
            const u = target.dataset.username;
            if (!u) return;
            const cached = avatarCache[u];
            if (isValidAvatarVal(cached)) {
              const img = target.querySelector('.x-pp-avatar-img');
              const ph = target.querySelector('.x-pp-avatar-placeholder');
              if (img && ph && !img.getAttribute('src')) {
                queueVisibleImgLoad(u, cached, img, ph);
              }
            }
          });
        }, { root: rootContainer, rootMargin: '80px' });
      }
      return rowObserver;
    }

    function ensureSidebar() {
      const rootTarget = document.body || document.documentElement;
      if (!rootTarget || document.getElementById('x-pp-sidebar')) return;
      const geom = loadGeom();

      const sidebar = el('div', {
        id: 'x-pp-sidebar',
        style: {
          position: 'fixed', top: geom.top, left: geom.left || 'auto', right: geom.right,
          width: geom.width, height: geom.height, minWidth: '260px', minHeight: '220px',
          background: SIDE_BG, color: '#e7e9ea', padding: '8px 10px', borderRadius: '12px',
          zIndex: '2147483645', display: loadVis() ? 'flex' : 'none', flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)',
          border: `1px solid ${BORDER_CLR}`, fontSize: '13px', lineHeight: '1.5',
          resize: 'both', overflow: 'hidden', boxSizing: 'border-box'
        }
      });
      applyTypographyVars(sidebar);

      ['wheel', 'DOMMouseScroll', 'mousewheel'].forEach((evt) => {
        sidebar.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
      });

      let resizeTimer;
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
          if (sidebar.style.display === 'none') return;
          const rect = sidebar.getBoundingClientRect();
          if (rect.width < 50 || rect.height < 50) return;
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            const g = loadGeom();
            g.width = sidebar.style.width;
            g.height = sidebar.style.height;
            saveGeom(g);
          }, 300);
        }).observe(sidebar);
      }

      const hdr = el('div', {
        style: {
          display: 'flex', alignItems: 'center', paddingBottom: '6px', marginBottom: '6px',
          borderBottom: `1px solid ${BORDER_CLR}`, gap: '4px', cursor: 'move', flexShrink: '0', flexWrap: 'wrap'
        }
      });

      const title = el('span', {
        textContent: '𝕏 Playlist',
        title: 'Drag to move. Double-click to reset position/size.',
        style: { flex: '1', fontWeight: '700', color: '#e7e9ea', fontSize: '13px', letterSpacing: '.3px', userSelect: 'none' }
      });
      title.addEventListener('dblclick', () => {
        saveGeom(defaultGeom);
        sidebar.style.top = defaultGeom.top;
        sidebar.style.left = 'auto';
        sidebar.style.right = defaultGeom.right;
        sidebar.style.width = defaultGeom.width;
        sidebar.style.height = defaultGeom.height;
      });

      const fileInput = el('input', { type: 'file', accept: '.txt,.md,.tsv', style: { display: 'none' } });
      fileInput.addEventListener('change', (ev) => {
        const f = ev.target.files?.[0];
        if (f) {
          const reader = new FileReader();
          reader.onload = ({ target }) => {
            const parsed = parsePlaylistText(target.result || '');
            if (parsed.length) {
              parsedGroups = parsed;
              currentIndex = -1;
              saveData(parsedGroups);
              saveIdx(-1);
              saveVis(true);
              renderList();
            }
          };
          reader.readAsText(f);
        }
        fileInput.value = '';
      });
      sidebar.appendChild(fileInput);

      const uploadBtn = mkBtn('📂');
      uploadBtn.title = 'Upload categorized .txt/.md list';
      uploadBtn.addEventListener('click', () => fileInput.click());

      const syncBtn = mkBtn('⚡ Sync');
      syncBtn.id = 'x-pp-sync-btn';
      syncBtn.addEventListener('click', () => startAvatarBatchSync(true));

      const avatarOnlyBtn = mkBtn(loadAvatarOnly() ? '👤 Only' : '👤 + 📝');
      avatarOnlyBtn.id = 'x-pp-avonly-btn';
      avatarOnlyBtn.title = 'Toggle Avatars-Only vs Handles + Avatars';
      if (loadAvatarOnly()) {
        avatarOnlyBtn.style.background = 'rgba(29, 155, 240, 0.25)';
        avatarOnlyBtn.style.borderColor = X_BLUE;
      }
      avatarOnlyBtn.addEventListener('click', () => {
        const next = !loadAvatarOnly();
        saveAvatarOnly(next);
        avatarOnlyBtn.textContent = next ? '👤 Only' : '👤 + 📝';
        avatarOnlyBtn.style.background = next ? 'rgba(29, 155, 240, 0.25)' : CARD_BG;
        avatarOnlyBtn.style.borderColor = next ? X_BLUE : BTN_BORDER;
        renderList();
      });

      const isTab = loadTabMode();
      const tabBtn = mkBtn(isTab ? '📑 Tabs: ON' : '☰ Tabs: OFF', isTab ? 'rgba(29, 155, 240, 0.25)' : CARD_BG);
      tabBtn.id = 'x-pp-tabbtn';
      tabBtn.title = 'Toggle category pill tabs';
      tabBtn.addEventListener('click', () => {
        const next = !loadTabMode();
        saveTabMode(next);
        tabBtn.textContent = next ? '📑 Tabs: ON' : '☰ Tabs: OFF';
        tabBtn.style.background = next ? 'rgba(29, 155, 240, 0.25)' : CARD_BG;
        renderList();
      });

      const colBtn = mkBtn(loadCols() + ' Col' + (loadCols() > 1 ? 's' : ''));
      colBtn.id = 'x-pp-colbtn';
      colBtn.title = 'Cycle columns (1-5)';
      colBtn.addEventListener('click', () => {
        const c = (loadCols() % 5) + 1;
        saveCols(c);
        colBtn.textContent = c + ' Col' + (c > 1 ? 's' : '');
        renderList();
      });

      const clearBtn = mkBtn('Reset', '#1a0c0f');
      clearBtn.style.color = '#f4212e';
      clearBtn.style.borderColor = '#2d1217';
      clearBtn.title = 'Reset to default list (Ctrl+Click to also wipe cached avatars)';
      clearBtn.addEventListener('click', (e) => {
        if (isSyncing) syncAborted = true;
        Store.remove(SK_DATA);
        Store.remove(SK_SCROLL);
        Store.remove(SK_IDX);
        parsedGroups = parsePlaylistText(RAW_FOLLOWING_LIST);
        saveData(parsedGroups);
        currentIndex = -1;
        if (e.ctrlKey || e.shiftKey) wipeAllAvatarCache();
        else renderList();
      });

      hdr.append(title, uploadBtn, syncBtn, avatarOnlyBtn, tabBtn, colBtn, clearBtn);
      sidebar.appendChild(hdr);

      // Sub-Row: Size, Search, Wipe Cache, Font
      const controlsRow = el('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '4px', paddingBottom: '6px',
          marginBottom: '6px', borderBottom: `1px solid ${BORDER_CLR}`, flexShrink: '0'
        }
      });

      const sizeSelect = el('select', { id: 'x-pp-size-sel', title: 'Font Size' });
      styleDropdown(sizeSelect);
      sizeSelect.style.width = '50px';
      sizeSelect.style.flexShrink = '0';
      const curSize = loadFSize();
      FONT_SIZE_OPTIONS.forEach((sz) => {
        const opt = el('option', { value: sz, textContent: `${sz}px` });
        if (sz === curSize) opt.selected = true;
        sizeSelect.appendChild(opt);
      });
      sizeSelect.addEventListener('change', () => {
        saveFSize(+sizeSelect.value);
        applyTypographyVars(sidebar);
      });

      const searchInput = el('input', {
        type: 'text', placeholder: '🔍 Search...',
        style: {
          flex: '1', minWidth: '0', background: 'transparent', border: 'none',
          outline: 'none', color: '#e7e9ea', fontSize: '11px', padding: '3px 2px'
        }
      });
      let searchDebounce = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          searchQuery = e.target.value.toLowerCase().trim();
          renderList();
        }, 120);
      });

      const clearSearchBtn = el('span', {
        textContent: '✕', title: 'Clear search',
        style: { cursor: 'pointer', color: '#71767b', fontSize: '10px', padding: '0 2px' }
      });
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        renderList();
      });

      const searchWrap = el('div', {
        style: {
          display: 'flex', alignItems: 'center', flex: '1', minWidth: '0',
          background: INPUT_BG, border: `1px solid ${BORDER_CLR}`, borderRadius: '6px', padding: '0 6px'
        }
      }, [searchInput, clearSearchBtn]);

      const wipeCacheBtn = mkBtn('🧹', CARD_BG);
      wipeCacheBtn.style.padding = '3px 6px';
      wipeCacheBtn.title = 'Wipe all cached avatars (resets Sync to 0)';
      wipeCacheBtn.addEventListener('click', wipeAllAvatarCache);

      const famSelect = el('select', { id: 'x-pp-fam-sel', title: 'Font Family' });
      styleDropdown(famSelect);
      famSelect.style.maxWidth = '82px';
      famSelect.style.flexShrink = '1';
      famSelect.style.minWidth = '0';
      const curFam = loadFFam();
      FONT_OPTIONS.forEach((fo) => {
        const opt = el('option', { value: fo.value, textContent: fo.label });
        if (fo.value === curFam) opt.selected = true;
        famSelect.appendChild(opt);
      });
      famSelect.addEventListener('change', () => {
        saveFFam(famSelect.value);
        applyTypographyVars(sidebar);
      });

      controlsRow.append(sizeSelect, searchWrap, wipeCacheBtn, famSelect);
      sidebar.appendChild(controlsRow);

      const tabBar = el('div', {
        id: 'x-pp-tab-bar',
        style: {
          display: 'none', overflowX: 'auto', whiteSpace: 'nowrap', gap: '5px',
          padding: '4px 0 6px 0', borderBottom: `1px solid ${BORDER_CLR}`,
          scrollbarWidth: 'none', flexShrink: '0'
        }
      });
      sidebar.appendChild(tabBar);

      const lc = el('div', {
        id: 'x-pp-list',
        style: { flex: '1', overflowY: 'auto', overflowX: 'hidden', paddingRight: '2px' }
      });
      lc.addEventListener('click', onListClick);
      sidebar.appendChild(lc);

      rootTarget.appendChild(sidebar);

      // Drag Sidebar
      let isDragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
      hdr.addEventListener('mousedown', (e) => {
        if (['button', 'select', 'input'].includes(e.target.tagName.toLowerCase())) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = sidebar.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        sidebar.style.right = 'auto';
        sidebar.style.left = `${startLeft}px`;
        sidebar.style.top = `${startTop}px`;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        sidebar.style.left = `${Math.max(0, Math.min(startLeft + (e.clientX - startX), window.innerWidth - 100))}px`;
        sidebar.style.top = `${Math.max(0, Math.min(startTop + (e.clientY - startY), window.innerHeight - 50))}px`;
      });
      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          saveGeom({
            left: sidebar.style.left,
            top: sidebar.style.top,
            right: sidebar.style.right,
            width: sidebar.style.width,
            height: sidebar.style.height
          });
        }
      });

      updateSyncButtonLabel();
    }

    function onListClick(e) {
      if (e.target.id === 'x-pp-load-more') {
        renderNextChunk();
        return;
      }
      const row = e.target.closest('.x-pp-row');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();

      const globalIdx = parseInt(row.dataset.index, 10);
      const handle = row.dataset.handle;
      if (!handle) return;

      saveIdx(globalIdx);
      const lc = document.getElementById('x-pp-list');
      if (lc) {
        lc.querySelectorAll('.x-pp-row.x-pp-active').forEach((r) => {
          r.classList.remove('x-pp-active');
          const sp = r.querySelector('.x-pp-label');
          if (sp && sp.dataset.rawText) sp.textContent = sp.dataset.rawText;
        });
      }
      row.classList.add('x-pp-active');
      const sp = row.querySelector('.x-pp-label');
      if (sp && sp.dataset.rawText) sp.textContent = `▶ ${sp.dataset.rawText}`;

      navigateTo(handle);
    }

    // Chunked Incremental Renderer
    let renderEntries = [];
    let renderedCount = 0;
    let lastRenderGroup = null;
    let lastGroupGrid = null;
    let lastSubheader = '';

    function createGroupGrid(cols, isAvOnly) {
      const grid = document.createElement('div');
      if (isAvOnly) {
        Object.assign(grid.style, {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols === 1 ? 4 : cols}, minmax(0, 1fr))`,
          gap: '6px', width: '100%', alignContent: 'start', justifyItems: 'center', padding: '4px 0'
        });
      } else if (cols > 1) {
        Object.assign(grid.style, {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: '3px', width: '100%', alignContent: 'start', padding: '3px 0'
        });
      } else {
        Object.assign(grid.style, {
          display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '2px 0'
        });
      }
      return grid;
    }

    function renderNextChunk() {
      const lc = document.getElementById('x-pp-list');
      if (!lc || renderedCount >= renderEntries.length) return;

      const oldSent = document.getElementById('x-pp-load-more');
      if (oldSent) {
        if (rowObserver) rowObserver.unobserve(oldSent);
        oldSent.remove();
      }

      const cols = loadCols();
      const isAvOnly = loadAvatarOnly();
      const curUser = getCurrentUsername();
      const observer = getRowObserver(lc);

      const end = Math.min(renderedCount + CHUNK_SIZE, renderEntries.length);
      const frag = document.createDocumentFragment();
      const observeTargets = [];

      for (let i = renderedCount; i < end; i++) {
        const entry = renderEntries[i];
        if (entry.grpTitle !== lastRenderGroup || !lastGroupGrid) {
          lastRenderGroup = entry.grpTitle;
          lastSubheader = '';
          if (entry.showHeader) {
            frag.appendChild(el('div', { className: 'x-pp-banner' }, [
              el('span', { textContent: entry.grpTitle }),
              el('span', { className: 'x-pp-banner-count', textContent: String(entry.grpCount) })
            ]));
          }
          lastGroupGrid = createGroupGrid(cols, isAvOnly);
          frag.appendChild(lastGroupGrid);
        }

        const item = entry.item;
        if (item.subheader && item.subheader !== lastSubheader && !isAvOnly) {
          lastSubheader = item.subheader;
          lastGroupGrid.appendChild(el('div', { className: 'x-pp-subheader', textContent: item.subheader }));
        }

        const isMatch = curUser && item.username && curUser === item.username;
        const active = entry.globalIdx === currentIndex || isMatch;

        const row = document.createElement('a');
        row.href = `https://x.com${getRouteFromEntry(item.handle)}`;
        row.title = `${item.handle}${item.subheader ? ' • ' + item.subheader : ''}`;
        row.className =
          'x-pp-row' +
          (active ? ' x-pp-active' : '') +
          (isAvOnly ? ' x-pp-av-only' : '') +
          (!isAvOnly && cols === 1 ? ' x-pp-cols-1' : '');
        row.dataset.index = String(entry.globalIdx);
        row.dataset.handle = item.handle;

        const avatarBox = el('div', { className: 'x-pp-avatar-box' });
        avatarBox.dataset.username = item.username || '';

        const placeholder = el('span', {
          className: 'x-pp-avatar-placeholder',
          textContent: (item.handle.replace(/^[@https?://]+/, '')[0] || '𝕏').toUpperCase()
        });
        const img = el('img', { className: 'x-pp-avatar-img' });
        img.referrerPolicy = 'no-referrer';
        avatarBox.append(placeholder, img);
        row.appendChild(avatarBox);

        if (!isAvOnly) {
          const rawText = `${entry.itemIdx + 1}. ${item.handle}`;
          const sp = el('span', {
            className: 'x-pp-label',
            textContent: active ? `▶ ${rawText}` : rawText
          });
          sp.dataset.rawText = rawText;
          row.appendChild(sp);
        }

        lastGroupGrid.appendChild(row);
        observeTargets.push(avatarBox);
      }

      renderedCount = end;

      if (renderedCount < renderEntries.length) {
        const rem = renderEntries.length - renderedCount;
        const sentinel = el('div', {
          id: 'x-pp-load-more',
          textContent: `Load next ${Math.min(CHUNK_SIZE, rem)} (${rem} remaining)`
        });
        frag.appendChild(sentinel);
        observeTargets.push(sentinel);
      }

      lc.appendChild(frag);
      for (let i = 0; i < observeTargets.length; i++) {
        observer.observe(observeTargets[i]);
      }
    }

    function renderList() {
      ensureSidebar();
      const sidebar = document.getElementById('x-pp-sidebar');
      const tabBar  = document.getElementById('x-pp-tab-bar');
      const lc      = document.getElementById('x-pp-list');
      if (!sidebar || !lc) return;

      applyTypographyVars(sidebar);
      sidebar.style.display = loadVis() ? 'flex' : 'none';

      if (rowObserver) rowObserver.disconnect();
      imgLoadQueue.length = 0;
      imgQueuedSet.clear();
      lc.replaceChildren();
      tabBar.replaceChildren();

      renderEntries = [];
      renderedCount = 0;
      lastRenderGroup = null;
      lastGroupGrid = null;
      lastSubheader = '';

      if (!parsedGroups.length) {
        lc.appendChild(el('div', {
          textContent: '(empty — upload a .txt file)',
          style: { opacity: '0.45', padding: '15px 4px', fontSize: '11px', color: '#71767b', textAlign: 'center' }
        }));
        tabBar.style.display = 'none';
        updateSyncButtonLabel();
        return;
      }

      const isTab = loadTabMode();
      const curTab = loadActiveTab();
      const allList = getAllItems();

      let activeGroups = parsedGroups;
      let showHeader = true;
      if (isTab) {
        tabBar.style.display = 'flex';
        tabBar.appendChild(mkPill(`All (${allList.length})`, curTab === 'ALL', () => { saveActiveTab('ALL'); renderList(); }));
        parsedGroups.forEach((grp, idx) => {
          tabBar.appendChild(mkPill(`${grp.title} (${grp.items.length})`, curTab === String(idx), () => { saveActiveTab(String(idx)); renderList(); }));
        });
        activeGroups = curTab === 'ALL' ? parsedGroups : (parsedGroups[+curTab] ? [parsedGroups[+curTab]] : parsedGroups);
        showHeader = false;
      } else {
        tabBar.style.display = 'none';
      }

      for (const grp of activeGroups) {
        let items = grp.items;
        if (searchQuery) {
          items = items.filter((it) =>
            it.handle.toLowerCase().includes(searchQuery) ||
            it.username.toLowerCase().includes(searchQuery) ||
            it.subheader.toLowerCase().includes(searchQuery)
          );
        }
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          renderEntries.push({
            item,
            itemIdx: idx,
            globalIdx: allList.indexOf(item),
            grpTitle: grp.title,
            grpCount: items.length,
            showHeader
          });
        }
      }

      if (renderEntries.length === 0) {
        lc.appendChild(el('div', {
          textContent: '(no matching accounts)',
          style: { opacity: '0.5', padding: '15px 4px', fontSize: '11px', color: '#71767b', textAlign: 'center' }
        }));
        return;
      }

      renderNextChunk();

      const savedScroll = +Store.get(SK_SCROLL, 0);
      if (Number.isFinite(savedScroll) && savedScroll > 0 && savedScroll < lc.scrollHeight) {
        lc.scrollTop = savedScroll;
      }

      let scrollTimer = null;
      lc.onscroll = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => Store.set(SK_SCROLL, lc.scrollTop || 0), 250);
      };

      updateSyncButtonLabel();
    }

    function toggleSidebar() {
      ensureSidebar();
      const sb = document.getElementById('x-pp-sidebar');
      if (sb) {
        const show = sb.style.display === 'none';
        sb.style.display = show ? 'flex' : 'none';
        saveVis(show);
        if (show) renderList();
      }
    }

    function stepPlaylist(delta) {
      const all = getAllItems();
      if (!all.length) return;
      const isTab = loadTabMode();
      const curTab = loadActiveTab();
      const activeGroups = (isTab && curTab !== 'ALL' && parsedGroups[+curTab]) ? [parsedGroups[+curTab]] : parsedGroups;
      let pool = activeGroups.flatMap((g) => g.items);
      if (searchQuery) {
        pool = pool.filter((it) =>
          it.handle.toLowerCase().includes(searchQuery) ||
          it.username.toLowerCase().includes(searchQuery) ||
          it.subheader.toLowerCase().includes(searchQuery)
        );
      }
      if (!pool.length) pool = all;
      const curItem = all[currentIndex];
      const pos = curItem ? pool.indexOf(curItem) : -1;
      const nextIdx = (pos + delta + pool.length) % pool.length;
      const target = pool[nextIdx];
      saveIdx(all.indexOf(target));
      renderList();
      navigateTo(target.handle);
    }

    function syncControlsUI() {
      const sb = document.getElementById('x-pp-sidebar');
      if (!sb) return;
      const g = loadGeom();
      sb.style.top = g.top;
      sb.style.left = g.left || 'auto';
      sb.style.right = g.right;
      sb.style.width = g.width;
      sb.style.height = g.height;
      applyTypographyVars(sb);

      const avBtn = document.getElementById('x-pp-avonly-btn');
      if (avBtn) avBtn.textContent = loadAvatarOnly() ? '👤 Only' : '👤 + 📝';
      const tabBtn = document.getElementById('x-pp-tabbtn');
      if (tabBtn) tabBtn.textContent = loadTabMode() ? '📑 Tabs: ON' : '☰ Tabs: OFF';
      const colBtn = document.getElementById('x-pp-colbtn');
      if (colBtn) {
        const c = loadCols();
        colBtn.textContent = c + ' Col' + (c > 1 ? 's' : '');
      }
      const szSel = document.getElementById('x-pp-size-sel');
      if (szSel) szSel.value = String(loadFSize());
      const famSel = document.getElementById('x-pp-fam-sel');
      if (famSel) famSel.value = loadFFam();
    }

    function loadInitial() {
      const ver = Store.get(SK_LIST_VER, '');
      const stored = loadData();
      if (!stored || !Array.isArray(stored) || !stored.length || ver !== 'v5.0_following_encoded') {
        parsedGroups = parsePlaylistText(RAW_FOLLOWING_LIST);
        saveData(parsedGroups);
        Store.set(SK_LIST_VER, 'v5.0_following_encoded');
      } else {
        parsedGroups = stored;
      }
      currentIndex = loadIdx();
      renderList();
    }

    function cleanup() {
      isShuttingDown = true;
      syncAborted = true;
      isSyncing = false;
      imgLoadQueue.length = 0;
      imgQueuedSet.clear();
      if (rowObserver) {
        try { rowObserver.disconnect(); } catch (_) {}
      }
      activeImagesSet.forEach((img) => {
        try {
          img.onload = null;
          img.onerror = null;
          img.src = '';
        } catch (_) {}
      });
      activeImagesSet.clear();
    }

    return {
      ensureSidebar,
      renderList,
      toggleSidebar,
      scrapeAvatarsFromDOM,
      startAvatarBatchSync,
      stepPlaylist,
      syncControlsUI,
      loadInitial,
      cleanup
    };
  })();

  /* =========================================================================
     MODULE 6: Desktop Floating Widget (Compact Pill, Grip + Ctrl+Drag, Pure SVG)
     ========================================================================= */
  function applyFloatingBtnScale(sizePx) {
    const wrap = document.getElementById('x-controls-wrap');
    if (!wrap) return;
    const sz = sizePx || Store.get('xpro_v4', null)?.uiSizes?.mainBtnSize || 34;
    const btnHeight = Math.max(22, Math.round(sz * 0.82));
    const iconSize = Math.max(12, Math.round(sz * 0.42));

    wrap.style.width = `${sz}px`;
    const grip = wrap.querySelector('#x-ctrl-grip');
    if (grip) grip.style.width = `${sz}px`;

    wrap.querySelectorAll('button').forEach((btn) => {
      btn.style.width = `${sz}px`;
      btn.style.height = `${btnHeight}px`;
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', String(iconSize));
        svg.setAttribute('height', String(iconSize));
      }
    });
  }

  function applyWidgetPos(wrap) {
    if (!wrap) return;
    const savedPos = Store.get('x_ctrl_btnpos', null);
    if (savedPos && savedPos.top && (savedPos.left || savedPos.right)) {
      const maxT = Math.max(8, window.innerHeight - (wrap.offsetHeight || 76) - 8);
      const t = Math.max(8, Math.min(parseFloat(savedPos.top) || 20, maxT));
      wrap.style.top = `${t}px`;
      wrap.style.bottom = 'auto';
      if (savedPos.left) {
        const maxL = Math.max(8, window.innerWidth - (wrap.offsetWidth || 34) - 8);
        wrap.style.left = `${Math.max(8, Math.min(parseFloat(savedPos.left) || 18, maxL))}px`;
        wrap.style.right = 'auto';
      } else {
        const maxR = Math.max(8, window.innerWidth - (wrap.offsetWidth || 34) - 8);
        wrap.style.right = `${Math.max(8, Math.min(parseFloat(savedPos.right) || 18, maxR))}px`;
        wrap.style.left = 'auto';
      }
    } else {
      wrap.style.top = 'auto';
      wrap.style.left = 'auto';
      wrap.style.bottom = '20px';
      wrap.style.right = '18px';
    }
  }

  function mountFloatingWidget() {
    const rootTarget = document.body || document.documentElement;
    if (!rootTarget || document.getElementById('x-controls-wrap')) return;

    const wrap = el('div', {
      id: 'x-controls-wrap',
      style: {
        position: 'fixed', bottom: '20px', right: '18px', zIndex: '2147483647',
        display: 'flex', flexDirection: 'column', gap: '2px', width: '34px',
        userSelect: 'none'
      }
    });

    // Dedicated Desktop Drag Grip (plus Ctrl/Shift+Drag on any button)
    const grip = el('div', {
      id: 'x-ctrl-grip',
      textContent: '⠿',
      title: 'Drag to move controls (or Ctrl+Drag any button). Double-click to reset.',
      style: {
        width: '34px', height: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 20, 30, 0.94)', border: '1px solid #2f3336', borderRadius: '5px 5px 2px 2px',
        color: '#71767b', fontSize: '10px', lineHeight: '1', cursor: 'grab', boxSizing: 'border-box'
      }
    });

    function makeBtn(svgEl, title) {
      const b = el('button', {
        title,
        style: {
          width: '34px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 20, 30, 0.94)', border: '1px solid #2f3336', color: '#e7e9ea',
          cursor: 'pointer', outline: 'none', padding: '0', boxSizing: 'border-box'
        }
      }, [svgEl]);
      b.addEventListener('mouseenter', () => {
        b.style.background = '#1c2733';
        b.style.borderColor = '#3d5060';
      });
      b.addEventListener('mouseleave', () => {
        b.style.background = 'rgba(15, 20, 30, 0.94)';
        b.style.borderColor = '#2f3336';
      });
      return b;
    }

    const xSvg = createSvgIcon([
      { d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.258 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z' }
    ], 14);

    const listSvg = createSvgIcon([
      { tag: 'line', x1: '8', y1: '6', x2: '21', y2: '6' },
      { tag: 'line', x1: '8', y1: '12', x2: '21', y2: '12' },
      { tag: 'line', x1: '8', y1: '18', x2: '21', y2: '18' },
      { tag: 'line', x1: '3', y1: '6', x2: '3.01', y2: '6' },
      { tag: 'line', x1: '3', y1: '12', x2: '3.01', y2: '12' },
      { tag: 'line', x1: '3', y1: '18', x2: '3.01', y2: '18' }
    ], 14, '0 0 24 24', true);

    const proBtn = makeBtn(xSvg, '𝕏 Pro Control (Ctrl+Drag to move)');
    proBtn.style.borderRadius = '2px';
    proBtn.addEventListener('click', () => XPro.togglePanel());

    const plBtn = makeBtn(listSvg, '𝕏 Playlist (Alt+Left/Right to step, Ctrl+Drag to move)');
    plBtn.style.borderRadius = '2px 2px 6px 6px';
    plBtn.addEventListener('click', () => XPlaylist.toggleSidebar());

    wrap.append(grip, proBtn, plBtn);
    rootTarget.appendChild(wrap);

    const sz = Store.get('xpro_v4', null)?.uiSizes?.mainBtnSize || 34;
    applyFloatingBtnScale(sz);
    applyWidgetPos(wrap);

    // Clean Desktop Mouse Drag (Grip OR Ctrl/Shift+Click)
    let isDrag = false, didMove = false, sx = 0, sy = 0, origL = 0, origT = 0;

    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const onGrip = e.target === grip;
      if (!onGrip && !e.ctrlKey && !e.shiftKey) return;

      isDrag = true;
      didMove = false;
      sx = e.clientX;
      sy = e.clientY;
      const rect = wrap.getBoundingClientRect();
      origL = rect.left;
      origT = rect.top;
      grip.style.cursor = 'grabbing';
      wrap.style.bottom = 'auto';
      wrap.style.right = 'auto';
      wrap.style.left = `${origL}px`;
      wrap.style.top = `${origT}px`;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDrag) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove = true;
      const maxL = Math.max(8, window.innerWidth - wrap.offsetWidth - 8);
      const maxT = Math.max(8, window.innerHeight - wrap.offsetHeight - 8);
      wrap.style.left = `${Math.max(8, Math.min(origL + dx, maxL))}px`;
      wrap.style.top  = `${Math.max(8, Math.min(origT + dy, maxT))}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!isDrag) return;
      isDrag = false;
      grip.style.cursor = 'grab';
      if (didMove) {
        Store.set('x_ctrl_btnpos', { left: wrap.style.left, top: wrap.style.top });
        setTimeout(() => { didMove = false; }, 60);
      }
    });

    wrap.addEventListener('click', (e) => {
      if (didMove || e.ctrlKey || e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    grip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      Store.remove('x_ctrl_btnpos');
      applyWidgetPos(wrap);
    });

    window.addEventListener('resize', () => applyWidgetPos(wrap));
  }

  /* =========================================================================
     KEYBOARD SHORTCUTS & CLEAN SHUTDOWN HOOKS
     ========================================================================= */
  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowRight') {
      XPlaylist.stepPlaylist(1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      XPlaylist.stepPlaylist(-1);
      e.preventDefault();
    }
  });

  function emergencyShutdown() {
    XPlaylist.cleanup();
    __ACTIVE_XHR_SET__.forEach((xhr) => {
      try { xhr.abort(); } catch (_) {}
    });
    __ACTIVE_XHR_SET__.clear();
  }

  window.addEventListener('pagehide', emergencyShutdown);
  window.addEventListener('beforeunload', emergencyShutdown);

  /* =========================================================================
     BOOTSTRAP GUARDIAN
     ========================================================================= */
  let scrapeIntervalId = null;

  function boot() {
    if (!document.body) return;
    mountFloatingWidget();
    XPlaylist.ensureSidebar();
    XPlaylist.loadInitial();
    XPro.buildPanel();
    const cfg = XPro.getCfg();
    if (cfg.layout.feedOffset && !cfg.layout.feedDisabled) {
      XPro.applyFeedOffset(cfg.layout.feedOffset);
    }

    if (!scrapeIntervalId) {
      scrapeIntervalId = setInterval(() => {
        if (!document.getElementById('x-controls-wrap')) mountFloatingWidget();
        if (!document.hidden) XPlaylist.scrapeAvatarsFromDOM();
      }, 3000);
    }
  }

  window.addEventListener('xtt:kvHydrated', () => {
    XPro.onHydrate();
    if (document.body) {
      mountFloatingWidget();
      XPlaylist.loadInitial();
      XPlaylist.syncControlsUI();
      applyWidgetPos(document.getElementById('x-controls-wrap'));
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
