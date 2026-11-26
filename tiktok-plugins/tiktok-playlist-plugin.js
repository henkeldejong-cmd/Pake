// ==UserScript Adapted for Pake==
// @name         Final Tiktok Playlist (TSV Avatar Import Edition) — Pake Edition
// @namespace    belay m.
// @version      3.1.0-pake
// @description  TikTok playlist with full multi-tier avatar resolution, 5-per-batch low-CPU sync, per-request timeouts, viewport-lazy image pool, chunked DOM rendering, IndexedDB-only Base64 storage, draggable controls, and TSV import support.
// @match        https://www.tiktok.com/*
// @match        *://*.tiktok.com/*
// ==/UserScript Adapted for Pake==

(() => {
  'use strict';

  /* =========================================================================
     1. IFRAME CRASH GUARD, HOSTNAME CHECK & DOUBLE-EXECUTION GUARD
     ========================================================================= */
  if (window.self !== window.top) return;

  const __HOST__ = (window.location && window.location.hostname) || '';
  if (!/(^|\.)tiktok\.com$/i.test(__HOST__)) return;
  if (/^(captcha|verify|mcs|mon|log|slardar)\./i.test(__HOST__)) return;

  if (window.__tiktokPlaylistPakeInit) return;
  window.__tiktokPlaylistPakeInit = true;

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

  const __KV_PREFIX__ = '__pake_ttpl_kv__:';
  const __KV_CACHE__ = Object.create(null);
  const __PAKE_MENU_COMMANDS__ = (window.__PAKE_MENU_COMMANDS__ =
    window.__PAKE_MENU_COMMANDS__ || []);
  const __ACTIVE_XHR_SET__ = new Set();

  const __LEGACY_KEYS__ = [
    'tt_playlist_list',
    'tt_playlist_scroll',
    'tt_playlist_last_index',
    'tt_playlist_visible',
    'tt_playlist_cols',
    'tt_playlist_fsize',
    'tt_playlist_ffam',
    'tt_playlist_geom',
    'tt_playlist_ctrl_geom',
    'tt_playlist_avatar_only',
    'tt_playlist_selected_cat'
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
          if (key === 'tt_playlist_list' || key === 'tt_playlist_geom' || key === 'tt_playlist_ctrl_geom') {
            return __safeJsonParse(legacy, legacy);
          }
          return legacy;
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
          window.localStorage.setItem(
            key,
            typeof value === 'string' ? value : JSON.stringify(value)
          );
        }
      }
    } catch (_) {}
  }

  // Synchronously pre-seed in-memory cache from localStorage fallback
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
        window.dispatchEvent(new CustomEvent('ttpl:kvHydrated'));
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
     4. TIKTOK PLAYLIST (TSV AVATAR IMPORT EDITION) v3.1.0 — LOW-CPU & FULL TIERS
     ========================================================================= */
  (function () {
    'use strict';

    /***************************************************************************
     * Storage Keys, Throttling & Hardware-Safe Constants
     ***************************************************************************/
    const STORAGE_LIST         = 'tt_playlist_list';
    const STORAGE_SCROLL       = 'tt_playlist_scroll';
    const STORAGE_LAST_INDEX   = 'tt_playlist_last_index';
    const STORAGE_VISIBLE      = 'tt_playlist_visible';
    const STORAGE_COLS         = 'tt_playlist_cols';
    const STORAGE_FSIZE        = 'tt_playlist_fsize';
    const STORAGE_FFAM         = 'tt_playlist_ffam';
    const STORAGE_AVATARS_V1   = 'tt_playlist_avatars';
    const STORAGE_AVATARS      = 'tt_playlist_avatars_v2';
    const STORAGE_GEOM         = 'tt_playlist_geom';
    const STORAGE_CTRL_GEOM    = 'tt_playlist_ctrl_geom';
    const STORAGE_AVATAR_ONLY  = 'tt_playlist_avatar_only';
    const STORAGE_SELECTED_CAT = 'tt_playlist_selected_cat';

    const DB_NAME              = 'TT_Playlist_Avatars_DB';
    const DB_VERSION           = 2;
    const DB_STORE             = 'avatars_store_v2';

    // Throttling & batch limits for low-end CPUs / Windows network stack
    const SYNC_BATCH_SIZE      = 5;     // 5 avatars per batch
    const SYNC_CONCURRENCY     = 2;     // Max 2 concurrent fetches per batch
    const SYNC_BATCH_PAUSE_MS  = 1200;  // Cool-down pause between batches
    const SYNC_ITEM_STAGGER_MS = 350;   // Stagger inside each batch
    const MAX_CONCURRENT_IMGS  = 5;     // Max 5 visible <img> network loads at once
    const REQ_TIMEOUT_MS       = 8000;  // Strict API/HTML timeout
    const IMG_TIMEOUT_MS       = 6000;  // Strict Image load timeout
    const USER_WATCHDOG_MS     = 20000; // Hard cap per user so loop can never hang
    const MAX_NET_FAILURES     = 10;    // Trip circuit breaker only on true network/429 failures
    const CHUNK_SIZE           = 100;   // Incremental DOM render chunk size
    const THUMB_MAX_PX         = 72;    // Downscale Base64 thumbnails to 72x72 (~1.5KB)

    const VIBRANT_PINK   = '#fe2c55';
    const TIKTOK_CYAN    = '#25f4ee';
    const DARK_BG        = 'rgba(18, 18, 24, 0.96)';
    const CARD_BG        = '#1e202e';
    const BTN_BG         = '#161823';
    const BTN_BORDER     = '#3a3b4a';
    const TEXT_PRI       = '#ffffff';
    const TEXT_SEC       = '#8a8b91';

    const FONT_OPTIONS = [
      { label: 'Default (TikTok)', value: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
      { label: 'Inter',          value: '"Inter", sans-serif' },
      { label: 'Roboto',         value: '"Roboto", sans-serif' },
      { label: 'Open Sans',      value: '"Open Sans", sans-serif' },
      { label: 'Josefin Sans',   value: '"Josefin Sans", sans-serif' },
      { label: 'Arial',          value: 'Arial, sans-serif' },
      { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, sans-serif' },
      { label: 'Bodoni',         value: '"Bodoni MT", "Bodoni 72", serif' },
      { label: 'Georgia',        value: 'Georgia, serif' },
      { label: 'Courier New',    value: '"Courier New", monospace' },
      { label: 'Comic Sans MS',  value: '"Comic Sans MS", cursive' },
      { label: 'Great Vibes',    value: '"Great Vibes", cursive' }
    ];

    const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20];

    /***************************************************************************
     * Inject Lightweight Stylesheet (replaces 3,000+ inline style/hover objects)
     ***************************************************************************/
    GM_addStyle(`
      #tt-playlist-sidebar {
        --ttpl-fsize: 14px;
        --ttpl-ffam: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-family: var(--ttpl-ffam);
      }
      #tt-playlist-listcontainer::-webkit-scrollbar { width: 6px; }
      #tt-playlist-listcontainer::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }
      .tt-playlist-cat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 6px 4px 6px;
        margin-top: 8px;
        margin-bottom: 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11px;
        font-weight: 700;
        color: ${TIKTOK_CYAN};
        text-transform: uppercase;
        letter-spacing: 0.4px;
        user-select: none;
      }
      .tt-playlist-cat-count {
        font-size: 10px;
        font-weight: normal;
        opacity: 0.7;
        background: rgba(255, 255, 255, 0.08);
        padding: 1px 5px;
        border-radius: 10px;
      }
      .tt-playlist-row {
        display: flex;
        align-items: center;
        gap: 0.55em;
        min-width: 0;
        padding: 0.3em 0.45em;
        cursor: pointer;
        background: transparent;
        color: #ccc;
        font-weight: normal;
        border-radius: 6px;
        text-decoration: none;
        font-size: var(--ttpl-fsize);
        font-family: var(--ttpl-ffam);
        line-height: 1.3;
        box-sizing: border-box;
        border-left: 3px solid transparent;
      }
      .tt-playlist-row.tt-cols-1 {
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      }
      .tt-playlist-row:not(.tt-active):not(.tt-avatar-only):hover {
        background: #2c2e3e;
        color: #fff;
      }
      .tt-playlist-row.tt-active:not(.tt-avatar-only) {
        background: ${VIBRANT_PINK};
        color: #ffffff;
        font-weight: 700;
        border-left-color: ${TIKTOK_CYAN};
      }
      .tt-playlist-row.tt-avatar-only {
        justify-content: center;
        padding: 3px;
        border-radius: 50%;
        border-left: none;
        gap: 0;
      }
      .tt-playlist-avatar-box {
        width: 2.35em;
        height: 2.35em;
        min-width: 2.35em;
        min-height: 2.35em;
        border-radius: 50%;
        background: #2a2a38;
        flex-shrink: 0;
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      }
      .tt-playlist-row.tt-avatar-only.tt-active .tt-playlist-avatar-box {
        box-shadow: 0 0 0 3px ${VIBRANT_PINK}, 0 0 8px rgba(254, 44, 85, 0.65);
      }
      .tt-playlist-avatar-placeholder {
        font-size: 0.9em;
        font-weight: 700;
        color: #aaa;
        user-select: none;
        line-height: 1;
      }
      .tt-playlist-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
        display: none;
      }
      .tt-playlist-label {
        min-width: 0;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #tt-playlist-load-more {
        text-align: center;
        padding: 8px;
        margin: 6px 0;
        border-radius: 6px;
        background: ${CARD_BG};
        border: 1px solid ${BTN_BORDER};
        color: ${TEXT_PRI};
        font-size: 11px;
        cursor: pointer;
        user-select: none;
      }
      #tt-playlist-load-more:hover {
        border-color: ${TIKTOK_CYAN};
      }
    `);

    /***************************************************************************
     * State & Storage Helpers
     ***************************************************************************/
    let playlist           = [];
    let currentIndex       = -1;
    let searchQuery        = '';
    let selectedCategory   = String(GM_getValue(STORAGE_SELECTED_CAT, '') || '');
    let isSyncing          = false;
    let syncAborted        = false;
    let syncCircuitBroken  = false;
    let tikwmCooldownUntil = 0;
    let isShuttingDown     = false;

    const sessionFailedSet = new Set();
    const activeImagesSet  = new Set();

    const parseMaybeJson = (raw, fallback) => {
      if (raw === null || raw === undefined) return fallback;
      if (typeof raw !== 'string') return raw;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    };

    const saveList       = (l) => GM_setValue(STORAGE_LIST, Array.isArray(l) ? l : []);
    const loadList       = ()  => {
      const parsed = parseMaybeJson(GM_getValue(STORAGE_LIST, null), null);
      return Array.isArray(parsed) ? parsed : null;
    };
    const saveIdx        = (i) => { GM_setValue(STORAGE_LAST_INDEX, i); currentIndex = i; };
    const loadIdx        = ()  => {
      const v = GM_getValue(STORAGE_LAST_INDEX, -1);
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : -1;
    };
    const loadVis        = ()  => {
      const v = GM_getValue(STORAGE_VISIBLE, '1');
      return v !== '0' && v !== 0 && v !== false;
    };
    const saveVis        = (v) => GM_setValue(STORAGE_VISIBLE, v ? '1' : '0');
    const loadCols       = ()  => {
      const n = parseInt(GM_getValue(STORAGE_COLS, 1), 10);
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
    };
    const saveCols       = (v) => GM_setValue(STORAGE_COLS, v);
    const loadFSize      = ()  => {
      const n = parseInt(GM_getValue(STORAGE_FSIZE, 14), 10);
      return Number.isFinite(n) ? n : 14;
    };
    const saveFSize      = (v) => GM_setValue(STORAGE_FSIZE, v);
    const loadFFam       = ()  => String(GM_getValue(STORAGE_FFAM, FONT_OPTIONS[0].value) || FONT_OPTIONS[0].value);
    const saveFFam       = (v) => GM_setValue(STORAGE_FFAM, v);
    const loadAvatarOnly = ()  => {
      const v = GM_getValue(STORAGE_AVATAR_ONLY, '0');
      return v === '1' || v === 1 || v === true;
    };
    const saveAvatarOnly = (v) => GM_setValue(STORAGE_AVATAR_ONLY, v ? '1' : '0');

    const defaultGeom = { left: '', top: '65px', right: '14px', width: '310px', height: '82vh' };
    const loadGeom  = () => {
      const parsed = parseMaybeJson(GM_getValue(STORAGE_GEOM, null), null);
      return parsed && typeof parsed === 'object' ? { ...defaultGeom, ...parsed } : { ...defaultGeom };
    };
    const saveGeom  = (g) => GM_setValue(STORAGE_GEOM, g);

    const defaultCtrlGeom = { left: '', top: '14px', right: '260px' };
    const loadCtrlGeom = () => {
      const parsed = parseMaybeJson(GM_getValue(STORAGE_CTRL_GEOM, null), null);
      return parsed && typeof parsed === 'object' ? { ...defaultCtrlGeom, ...parsed } : { ...defaultCtrlGeom };
    };
    const saveCtrlGeom = (g) => GM_setValue(STORAGE_CTRL_GEOM, g);

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

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function isUrlExpired(url) {
      if (!url || typeof url !== 'string') return true;
      if (url.startsWith('data:image')) return false;
      if (!url.startsWith('http')) return true;
      const m = url.match(/[?&]x-expires=(\d+)/i);
      if (m && m[1]) {
        const expSec = parseInt(m[1], 10);
        const nowSec = Math.floor(Date.now() / 1000);
        if (Number.isFinite(expSec) && expSec > 1000000000 && expSec <= nowSec + 60) {
          return true;
        }
      }
      return false;
    }

    function isValidAvatarVal(val) {
      return (
        typeof val === 'string' &&
        val.length > 0 &&
        val !== 'NONE' &&
        (val.startsWith('data:image') || (val.startsWith('http') && !isUrlExpired(val)))
      );
    }

    /***************************************************************************
     * Grouping Parser Engine
     ***************************************************************************/
    function cleanUsername(entry) {
      if (!entry) return '';
      if (typeof entry === 'object' && entry.username) return cleanUsername(entry.username);
      if (typeof entry !== 'string') return '';
      return entry.trim().replace(/^@/, '').split(/[/?# ]/)[0].toLowerCase();
    }

    function parsePlaylistText(rawText) {
      const lines = rawText.split(/\r?\n/);
      const items = [];
      let currentMain = '';
      let currentSub  = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/^[-*_]{3,}$/.test(line)) continue;

        if (line.includes('\t')) {
          const parts = line.split('\t');
          const rawUsername = parts[0] ? parts[0].trim() : '';
          const rawAvatarUrl = parts[1] ? parts[1].trim() : '';

          if (rawUsername.toLowerCase() === 'username') continue;

          const u = cleanUsername(rawUsername);
          if (u) {
            items.push({
              username: u,
              category: 'General',
              mainCategory: 'General',
              avatarUrl: rawAvatarUrl
            });
          }
          continue;
        }

        if (line.startsWith('# ') || line.startsWith('## ')) {
          currentMain = line.replace(/^#+\s*/, '').trim();
          currentSub  = '';
          continue;
        }
        if (line.startsWith('### ')) {
          currentSub = line.replace(/^#+\s*/, '').trim();
          continue;
        }
        if (line.startsWith('//') || line.startsWith('/*')) continue;

        const u = cleanUsername(line);
        if (!u) continue;

        const cat = currentSub || currentMain || 'General';
        items.push({
          username: u,
          category: cat,
          mainCategory: currentMain || cat
        });
      }

      return items;
    }

    function normalizePlaylist(rawList) {
      if (!Array.isArray(rawList)) return [];
      return rawList.map((item) => {
        if (typeof item === 'string') {
          const u = cleanUsername(item);
          return u ? { username: u, category: 'General', mainCategory: 'General' } : null;
        }
        if (item && item.username) {
          const u = cleanUsername(item.username);
          return u
            ? {
                username: u,
                category: item.category || 'General',
                mainCategory: item.mainCategory || item.category || 'General'
              }
            : null;
        }
        return null;
      }).filter(Boolean);
    }

    /***************************************************************************
     * Dual Storage v2: IndexedDB Primary (Preserves all cached avatars, zero LS thrashing)
     ***************************************************************************/
    let avatarCache = {};
    let idbInstance = null;

    // Migrate any leftover localStorage entries into IndexedDB without wiping IndexedDB
    let pendingLSMigration = null;
    try {
      for (const lsKey of [STORAGE_AVATARS_V1, STORAGE_AVATARS]) {
        const raw = window.localStorage.getItem(lsKey);
        if (raw) {
          const parsed = parseMaybeJson(raw, null);
          if (parsed && typeof parsed === 'object') {
            pendingLSMigration = pendingLSMigration || {};
            for (const [k, v] of Object.entries(parsed)) {
              const ok = lsKey === STORAGE_AVATARS_V1
                ? (typeof v === 'string' && v.startsWith('data:image'))
                : isValidAvatarVal(v);
              if (ok) {
                avatarCache[k] = v;
                pendingLSMigration[k] = v;
              }
            }
          }
          window.localStorage.removeItem(lsKey);
        }
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
        let updatedVisible = false;

        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (isValidAvatarVal(cursor.value)) {
              if (!avatarCache[cursor.key]) {
                avatarCache[cursor.key] = cursor.value;
                updatedVisible = true;
              }
            } else {
              try { cursor.delete(); } catch (_) {}
            }
            cursor.continue();
          } else {
            if (updatedVisible) syncRenderedRowAvatars();
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
      const u = cleanUsername(username);
      if (!u || avatarCache[u] === url) return;
      avatarCache[u] = url;
      sessionFailedSet.delete(u);
      idbPut(u, url);
      scheduleSyncLabelUpdate();
    }

    function purgeAvatarEntry(username) {
      const u = cleanUsername(username);
      if (!u) return;
      delete avatarCache[u];
      idbDelete(u);
      scheduleSyncLabelUpdate();
    }

    function wipeAllAvatarCache() {
      if (isSyncing) syncAborted = true;
      syncCircuitBroken = false;
      lazyFetchQueue.length = 0;
      lazyFetchQueuedSet.clear();
      imgLoadQueue.length = 0;
      imgQueuedSet.clear();
      sessionFailedSet.clear();
      avatarCache = {};
      try {
        window.localStorage.removeItem(STORAGE_AVATARS_V1);
        window.localStorage.removeItem(STORAGE_AVATARS);
      } catch (_) {}
      idbClearAll();
      renderList();
      updateSyncButtonLabel();
    }

    /***************************************************************************
     * Bounded Image Verification & 72x72 Thumbnail Downscaler
     ***************************************************************************/
    function verifyImageLoads(url) {
      if (isShuttingDown || !url || typeof url !== 'string') return Promise.resolve(false);
      if (url.startsWith('data:image')) return Promise.resolve(true);
      if (isUrlExpired(url)) return Promise.resolve(false);

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

    /***************************************************************************
     * Bounded Concurrent Viewport Image Loader (Max 5 concurrent <img> requests)
     ***************************************************************************/
    const imgLoadQueue = [];
    const imgQueuedSet = new Set();
    let activeImgLoads = 0;

    function pumpImgLoadQueue() {
      if (isShuttingDown) return;
      while (activeImgLoads < MAX_CONCURRENT_IMGS && imgLoadQueue.length > 0) {
        const task = imgLoadQueue.shift();
        imgQueuedSet.delete(task.username);

        if (!task.img.isConnected) continue;
        if (!isValidAvatarVal(task.url)) {
          enqueueAvatarFetch(task.username);
          continue;
        }

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
              if (task.img.dataset.healed !== '1') {
                task.img.dataset.healed = '1';
                enqueueAvatarFetch(task.username);
              }
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
      if (!imgEl || !placeholderEl) return;
      if (!isValidAvatarVal(url)) return;

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

    /***************************************************************************
     * Navigation & Throttled DOM Avatar Harvesting (Excludes our own sidebar!)
     ***************************************************************************/
    function getCurrentUsername() {
      const match = window.location.pathname.match(/^\/@([^/?#]+)/);
      if (match) return match[1].toLowerCase();

      const h2 = document.querySelector('h2[data-e2e="user-subtitle"]');
      if (h2) return h2.textContent.replace('@', '').trim().toLowerCase();

      return null;
    }

    function navigateTo(entry) {
      if (!entry) return;
      const username = cleanUsername(entry);
      if (!username) return;
      window.location.assign(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
    }

    function isGoodAvatarUrl(url) {
      if (!url || typeof url !== 'string') return false;
      if (url.startsWith('data:image')) return true;
      if (!url.startsWith('http')) return false;
      if (/default[-_]avatar|tiktok[-_]logo|tt[-_]logo|webapp-desktop/i.test(url)) return false;
      return !isUrlExpired(url);
    }

    function harvestAvatarsFromDOM() {
      if (isShuttingDown || document.hidden || !document.body) return;

      const cur = getCurrentUsername();
      if (cur) {
        const avatarImg = document.querySelector(
          '[data-e2e="user-avatar"] img, header img[src*="tiktokcdn"], img[class*="ImgAvatar"]'
        );
        if (avatarImg && !avatarImg.closest('#tt-playlist-sidebar') && isGoodAvatarUrl(avatarImg.src) && !avatarImg.src.startsWith('data:')) {
          const currentCached = avatarCache[cur];
          if (!currentCached || !currentCached.startsWith('data:image')) {
            const srcUrl = avatarImg.src;
            cacheAvatar(cur, srcUrl);
            broadcastAvatarUpdate(cur, srcUrl);
            convertUrlToBase64(srcUrl).then((base64) => {
              if (!isShuttingDown && base64 && base64.startsWith('data:image')) {
                cacheAvatar(cur, base64);
                broadcastAvatarUpdate(cur, base64);
              }
            });
          }
        }
      }

      const mainRoot = document.querySelector('main, [id="app"], [class*="DivBodyContainer"]') || document.body;
      const links = mainRoot.querySelectorAll('a[href*="/@"]');
      const limit = Math.min(links.length, 40);
      for (let i = 0; i < limit; i++) {
        const a = links[i];
        if (a.closest('#tt-playlist-sidebar')) continue;
        try {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/@([a-zA-Z0-9._]+)/);
          if (match) {
            const u = cleanUsername(match[1]);
            if (u && !isValidAvatarVal(avatarCache[u])) {
              const img = a.querySelector('img[src*="tiktokcdn"]');
              if (img && isGoodAvatarUrl(img.src) && !img.src.startsWith('data:')) {
                cacheAvatar(u, img.src);
                broadcastAvatarUpdate(u, img.src);
              }
            }
          }
        } catch (_) {}
      }
    }

    /***************************************************************************
     * Multi-Tier Pake Avatar Resolution Engine (Full Tiers + Strict Timeouts)
     *   Tier 1: TikWM User Info API via Rust proxy_http
     *   Tier 2: TikTok Profile (/@u) & Embed (/embed/@u) HTML via fetchWithTimeout
     *   Tier 3: TikTok Profile & Embed HTML via proxy_http with Desktop headers
     *   Tier 4: Unavatar JSON API via proxy_http
     ***************************************************************************/
    function proxyGetText(url, headers = {}) {
      return new Promise((resolve) => {
        if (isShuttingDown) return resolve({ status: 0, text: '', finalUrl: url });
        GM_xmlhttpRequest({
          url,
          method: 'GET',
          headers,
          timeout: REQ_TIMEOUT_MS,
          onload(res) {
            resolve({ status: res.status, text: res.responseText || '', finalUrl: res.finalUrl || url });
          },
          onerror() {
            resolve({ status: 0, text: '', finalUrl: url });
          },
          ontimeout() {
            resolve({ status: 0, text: '', finalUrl: url });
          },
          onabort() {
            resolve({ status: 0, text: '', finalUrl: url });
          }
        });
      });
    }

    function proxyGetJson(url, headers = {}) {
      return new Promise((resolve) => {
        if (isShuttingDown) return resolve({ status: 0, data: null });
        GM_xmlhttpRequest({
          url,
          method: 'GET',
          headers: { Accept: 'application/json', ...headers },
          responseType: 'json',
          timeout: REQ_TIMEOUT_MS,
          onload(res) {
            if (res.response && typeof res.response === 'object') {
              resolve({ status: res.status, data: res.response });
            } else {
              resolve({ status: res.status, data: parseMaybeJson(res.responseText, null) });
            }
          },
          onerror() {
            resolve({ status: 0, data: null });
          },
          ontimeout() {
            resolve({ status: 0, data: null });
          },
          onabort() {
            resolve({ status: 0, data: null });
          }
        });
      });
    }

    function decodeEscapedUrl(raw) {
      if (!raw || typeof raw !== 'string') return '';
      return raw
        .replace(/\\u002F/gi, '/')
        .replace(/\\\//g, '/')
        .replace(/\\u0026/gi, '&')
        .replace(/&amp;/g, '&')
        .trim();
    }

    // Fast indexOf-based <script id="..."> extractor (zero regex backtracking CPU spike)
    function extractScriptJsonById(html, scriptId) {
      const marker = `id="${scriptId}"`;
      const idx = html.indexOf(marker);
      if (idx === -1) return null;
      const openEnd = html.indexOf('>', idx);
      if (openEnd === -1) return null;
      const closeStart = html.indexOf('</script>', openEnd);
      if (closeStart === -1) return null;
      try {
        return JSON.parse(html.slice(openEnd + 1, closeStart));
      } catch (_) {
        return null;
      }
    }

    function extractAvatarCandidatesFromHtml(html, username) {
      const candidates = [];
      const push = (raw) => {
        const u = decodeEscapedUrl(raw);
        if (isGoodAvatarUrl(u) && !candidates.includes(u)) candidates.push(u);
      };

      if (!html || typeof html !== 'string') return candidates;

      const rehydration = extractScriptJsonById(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydration) {
        const scope = rehydration['__DEFAULT_SCOPE__'];
        const user =
          scope?.['webapp.user-detail']?.userInfo?.user ||
          scope?.['webapp.user-profile']?.userInfo?.user ||
          null;
        push(user?.avatarThumb);
        push(user?.avatarMedium);
        push(user?.avatarLarger);
      }

      const sigi = extractScriptJsonById(html, 'SIGI_STATE');
      if (sigi) {
        const usersMap = sigi?.UserModule?.users || {};
        const user = usersMap[username] || Object.values(usersMap)[0];
        push(user?.avatarThumb);
        push(user?.avatarMedium);
        push(user?.avatarLarger);
      }

      if (candidates.length === 0) {
        for (const key of ['"avatarThumb":"', '"avatarThumb": "', '"avatarMedium":"', '"avatarMedium": "', '"avatarLarger":"']) {
          const kIdx = html.indexOf(key);
          if (kIdx !== -1) {
            const valStart = kIdx + key.length;
            const valEnd = html.indexOf('"', valStart);
            if (valEnd !== -1 && valEnd - valStart < 1024) {
              push(html.slice(valStart, valEnd));
            }
          }
        }
      }

      return candidates;
    }

    async function pickFirstLoadable(urls) {
      for (const candidate of urls) {
        if (isShuttingDown) return null;
        if (!isGoodAvatarUrl(candidate)) continue;
        if (await verifyImageLoads(candidate)) return candidate;
      }
      return null;
    }

    async function fetchWithTimeout(url, opts = {}) {
      if (isShuttingDown) return null;
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => {
        if (ctrl) try { ctrl.abort(); } catch (_) {}
      }, REQ_TIMEOUT_MS);
      try {
        return await fetch(url, { ...opts, signal: ctrl ? ctrl.signal : undefined });
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    async function fetchAvatarForUsernameCore(username) {
      const u = cleanUsername(username);
      if (!u || isShuttingDown) return null;

      let sawRateLimit = false;
      let sawNetworkFail = false;
      let gotAnyValidHttp = false;

      const ua =
        navigator.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

      // Tier 1: TikWM Public User Info API via proxy_http
      if (__PAKE_INVOKE__ && Date.now() >= tikwmCooldownUntil) {
        const tikwm = await proxyGetJson(
          `https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent('@' + u)}`,
          { 'User-Agent': ua, Referer: 'https://www.tikwm.com/' }
        );
        const payload = tikwm?.data;
        if (tikwm?.status === 200) gotAnyValidHttp = true;
        if (payload && payload.code === 0 && payload.data && payload.data.user) {
          const usr = payload.data.user;
          const rawList = [usr.avatarThumb, usr.avatarMedium, usr.avatarLarger, usr.avatar]
            .map((x) => {
              const s = decodeEscapedUrl(x || '');
              return s.startsWith('/') ? `https://www.tikwm.com${s}` : s;
            });
          const okUrl = await pickFirstLoadable(rawList);
          if (okUrl) return { url: okUrl, source: 'tikwm' };
        } else if (
          tikwm?.status === 429 ||
          (payload && payload.code === -1 && /limit|frequent|too many/i.test(payload.msg || ''))
        ) {
          sawRateLimit = true;
          tikwmCooldownUntil = Date.now() + 30000;
        } else if (tikwm?.status === 0) {
          sawNetworkFail = true;
        }
      }

      if (isShuttingDown) return null;

      // Tier 2: TikTok Profile (/@u) & Embed (/embed/@u) via browser fetch() with strict 8s timeout
      const profileUrl = `https://www.tiktok.com/@${encodeURIComponent(u)}`;
      const embedUrl   = `https://www.tiktok.com/embed/@${encodeURIComponent(u)}`;

      for (const targetUrl of [profileUrl, embedUrl]) {
        if (isShuttingDown) return null;
        const pageRes = await fetchWithTimeout(targetUrl, { credentials: 'include' });
        if (!pageRes) {
          sawNetworkFail = true;
          continue;
        }
        if (pageRes.status === 429) {
          sawRateLimit = true;
          continue;
        }
        if (pageRes.ok || pageRes.status === 404) gotAnyValidHttp = true;
        if (pageRes.ok) {
          try {
            const html = await pageRes.text();
            const okUrl = await pickFirstLoadable(extractAvatarCandidatesFromHtml(html, u));
            if (okUrl) return { url: okUrl, source: 'tiktok-fetch' };
          } catch (_) {}
        }
      }

      if (isShuttingDown) return null;

      // Tier 3: TikTok Profile & Embed via proxy_http with Desktop headers
      if (__PAKE_INVOKE__) {
        const browserHeaders = {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        };
        for (const targetUrl of [embedUrl, profileUrl]) {
          if (isShuttingDown) return null;
          const proxied = await proxyGetText(targetUrl, browserHeaders);
          if (proxied.status === 429) {
            sawRateLimit = true;
            continue;
          }
          if (proxied.status === 0) {
            sawNetworkFail = true;
            continue;
          }
          if (proxied.status >= 200 && proxied.status < 500) gotAnyValidHttp = true;
          if (proxied.text) {
            const okUrl = await pickFirstLoadable(extractAvatarCandidatesFromHtml(proxied.text, u));
            if (okUrl) return { url: okUrl, source: 'tiktok-proxy' };
          }
        }

        if (isShuttingDown) return null;

        // Tier 4: Unavatar JSON API via proxy_http
        const unavatar = await proxyGetJson(
          `https://unavatar.io/tiktok/${encodeURIComponent(u)}?json&fallback=false`,
          { 'User-Agent': ua }
        );
        if (unavatar?.status === 200) gotAnyValidHttp = true;
        const uUrl = decodeEscapedUrl(unavatar?.data?.url || '');
        if (isGoodAvatarUrl(uUrl) && (await verifyImageLoads(uUrl))) {
          return { url: uUrl, source: 'unavatar' };
        }
      }

      if (sawRateLimit) return { rateLimited: true };
      if (!gotAnyValidHttp && sawNetworkFail) return { netError: true };
      return { notFound: true };
    }

    function fetchAvatarForUsername(username) {
      return Promise.race([
        fetchAvatarForUsernameCore(username),
        sleep(USER_WATCHDOG_MS).then(() => ({ netError: true }))
      ]);
    }

    function broadcastAvatarUpdate(username, url) {
      const u = cleanUsername(username);
      const listContainer = document.getElementById('tt-playlist-listcontainer');
      if (!listContainer || !isValidAvatarVal(url)) return;
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(u) : u;
      listContainer.querySelectorAll(`.tt-playlist-row[data-username="${escaped}"]`).forEach((row) => {
        const img = row.querySelector('.tt-playlist-avatar-img');
        const placeholder = row.querySelector('.tt-playlist-avatar-placeholder');
        if (!img || !placeholder) return;
        queueVisibleImgLoad(u, url, img, placeholder);
      });
    }

    function syncRenderedRowAvatars() {
      const listContainer = document.getElementById('tt-playlist-listcontainer');
      if (!listContainer) return;
      listContainer.querySelectorAll('.tt-playlist-row').forEach((row) => {
        const u = row.dataset.username;
        const cached = avatarCache[u];
        if (!isValidAvatarVal(cached)) return;
        const img = row.querySelector('.tt-playlist-avatar-img');
        const placeholder = row.querySelector('.tt-playlist-avatar-placeholder');
        if (img && placeholder && !img.getAttribute('src')) {
          queueVisibleImgLoad(u, cached, img, placeholder);
        }
      });
    }

    /***************************************************************************
     * Throttled Batch Sync Engine (5 per batch, max 2 concurrent, smart breaker)
     ***************************************************************************/
    const lazyFetchQueue = [];
    const lazyFetchQueuedSet = new Set();
    let lazyWorkerRunning = false;

    async function resolveAndStoreAvatar(u) {
      const res = await fetchAvatarForUsername(u);
      if (isShuttingDown) return 'ABORT';
      if (res?.rateLimited) return 'RATE_LIMITED';
      if (res?.netError) return 'NET_ERROR';

      if (res?.url && isGoodAvatarUrl(res.url)) {
        cacheAvatar(u, res.url);
        broadcastAvatarUpdate(u, res.url);

        // Downscale to 72x72 Base64 asynchronously in IndexedDB when CORS allows
        convertUrlToBase64(res.url).then((base64Url) => {
          if (!isShuttingDown && base64Url && base64Url.startsWith('data:image')) {
            cacheAvatar(u, base64Url);
            broadcastAvatarUpdate(u, base64Url);
          }
        });
        return 'OK';
      }

      sessionFailedSet.add(u);
      return 'NOT_FOUND';
    }

    async function runLazyQueue() {
      if (lazyWorkerRunning || isShuttingDown) return;
      lazyWorkerRunning = true;

      let consecNetErrors = 0;
      while (lazyFetchQueue.length > 0 && !isShuttingDown) {
        if (isSyncing) {
          lazyFetchQueue.length = 0;
          lazyFetchQueuedSet.clear();
          break;
        }
        const u = lazyFetchQueue.shift();
        lazyFetchQueuedSet.delete(u);
        if (!u || isValidAvatarVal(avatarCache[u]) || sessionFailedSet.has(u)) continue;

        const status = await resolveAndStoreAvatar(u);
        if (status === 'ABORT') break;
        if (status === 'RATE_LIMITED' || status === 'NET_ERROR') {
          consecNetErrors++;
          if (consecNetErrors >= MAX_NET_FAILURES) break;
          if (status === 'RATE_LIMITED') {
            lazyFetchQueue.unshift(u);
            lazyFetchQueuedSet.add(u);
            await sleep(3500);
          } else {
            await sleep(1200);
          }
        } else {
          consecNetErrors = 0;
          await sleep(900);
        }
      }

      lazyWorkerRunning = false;
    }

    function enqueueAvatarFetch(username) {
      const u = cleanUsername(username);
      if (!u || isSyncing || isShuttingDown) return;
      if (isValidAvatarVal(avatarCache[u]) || sessionFailedSet.has(u) || lazyFetchQueuedSet.has(u)) return;
      if (lazyFetchQueue.length >= 25) return;
      lazyFetchQueuedSet.add(u);
      lazyFetchQueue.push(u);
      runLazyQueue();
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

      const usernames = Array.from(new Set(playlist.map(cleanUsername).filter(Boolean)));
      if (!usernames.length) return;

      const missing = usernames.filter((u) => !isValidAvatarVal(avatarCache[u]));
      if (!missing.length) {
        if (isManualClick) {
          const btn = document.getElementById('tt-playlist-sync-btn');
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
      lazyFetchQueue.length = 0;
      lazyFetchQueuedSet.clear();
      updateSyncButtonLabel();

      let completedCount = usernames.length - missing.length;
      const totalCount = usernames.length;
      let consecNetErrors = 0;

      for (let i = 0; i < missing.length && !syncAborted && !isShuttingDown; i += SYNC_BATCH_SIZE) {
        const batch = missing.slice(i, i + SYNC_BATCH_SIZE);
        let batchIdx = 0;

        const runBatchWorker = async () => {
          while (!syncAborted && !isShuttingDown) {
            const myIdx = batchIdx++;
            if (myIdx >= batch.length) break;
            const u = batch[myIdx];
            if (!u || isValidAvatarVal(avatarCache[u])) continue;

            if (myIdx > 0) await sleep(SYNC_ITEM_STAGGER_MS);
            if (syncAborted || isShuttingDown) break;

            const status = await resolveAndStoreAvatar(u);
            if (status === 'OK') {
              consecNetErrors = 0;
              completedCount++;
            } else if (status === 'NOT_FOUND') {
              // Account missing/private — skip cleanly without tripping network circuit breaker
              consecNetErrors = 0;
            } else if (status === 'RATE_LIMITED' || status === 'NET_ERROR') {
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

        const workers = Array.from(
          { length: Math.min(SYNC_CONCURRENCY, batch.length) },
          () => runBatchWorker()
        );
        await Promise.all(workers);

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
      const list = Array.from(new Set(playlist.map(cleanUsername).filter(Boolean)));
      if (!list.length) return { cached: 0, total: 0 };
      const cached = list.filter((u) => isValidAvatarVal(avatarCache[u])).length;
      return { cached, total: list.length };
    }

    function updateSyncButtonLabel(current, total) {
      const btn = document.getElementById('tt-playlist-sync-btn');
      if (!btn) return;

      const stats = getAvatarStats();
      const cur = current !== undefined ? current : stats.cached;
      const tot = total !== undefined ? total : stats.total;

      if (isSyncing) {
        btn.textContent = `⏳ ${cur}/${tot}`;
        btn.title = `Batch syncing (${SYNC_BATCH_SIZE}/batch, ${SYNC_CONCURRENCY} concurrent). Click to pause.`;
        btn.style.background = 'rgba(254, 44, 85, 0.35)';
        btn.style.borderColor = VIBRANT_PINK;
      } else if (syncCircuitBroken && cur < tot) {
        btn.textContent = `⚠ Retry (${cur}/${tot})`;
        btn.title = 'Paused after consecutive network/rate-limit errors. Click to resume.';
        btn.style.background = 'rgba(255, 165, 0, 0.25)';
        btn.style.borderColor = '#ffa500';
      } else {
        btn.textContent = `⚡ Sync (${cur}/${tot})`;
        btn.title = `Batch-sync missing avatars (${cur} of ${tot} cached). Click to start.`;
        btn.style.background = cur === tot && tot > 0 ? 'rgba(37, 244, 238, 0.2)' : CARD_BG;
        btn.style.borderColor = cur === tot && tot > 0 ? TIKTOK_CYAN : BTN_BORDER;
      }
    }

    /***************************************************************************
     * IntersectionObserver (Viewport Lazy Loader for Both Cached & Missing Rows)
     ***************************************************************************/
    let rowObserver = null;
    function getRowObserver(rootContainer) {
      if (!rowObserver) {
        rowObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const target = entry.target;

            if (target.id === 'tt-playlist-load-more') {
              renderNextChunk();
              return;
            }

            rowObserver.unobserve(target);
            const u = target.dataset.username;
            if (!u) return;

            const cached = avatarCache[u];
            if (isValidAvatarVal(cached)) {
              const row = target.closest('.tt-playlist-row');
              const img = row?.querySelector('.tt-playlist-avatar-img');
              const placeholder = row?.querySelector('.tt-playlist-avatar-placeholder');
              if (img && placeholder && !img.getAttribute('src')) {
                queueVisibleImgLoad(u, cached, img, placeholder);
              }
            } else {
              enqueueAvatarFetch(u);
            }
          });
        }, { root: rootContainer, rootMargin: '80px' });
      }
      return rowObserver;
    }

    /***************************************************************************
     * Category Filter Synchronization
     ***************************************************************************/
    function refreshCategoryDropdown() {
      const select = document.getElementById('tt-playlist-cat-select');
      if (!select) return;

      const categories = Array.from(new Set(playlist.map((item) => item.category || 'General')));
      select.replaceChildren();

      const allOpt = el('option', {
        value: '',
        textContent: `📁 All Categories (${playlist.length})`
      });
      select.appendChild(allOpt);

      categories.forEach((cat) => {
        const count = playlist.filter((item) => (item.category || 'General') === cat).length;
        const opt = el('option', {
          value: cat,
          textContent: `${cat} (${count})`
        });
        if (cat === selectedCategory) opt.selected = true;
        select.appendChild(opt);
      });

      select.style.display = categories.length > 1 ? 'block' : 'none';
    }

    /***************************************************************************
     * Sidebar Construction
     ***************************************************************************/
    function styleDropdown(node) {
      Object.assign(node.style, {
        background:   CARD_BG,
        color:        TEXT_PRI,
        border:       `1px solid ${BTN_BORDER}`,
        borderRadius: '4px',
        padding:      '3px 5px',
        fontSize:     '11px',
        outline:      'none',
        cursor:       'pointer'
      });
    }

    function mkBtn(text, bg) {
      const btn = document.createElement('button');
      btn.textContent = text;
      Object.assign(btn.style, {
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '3px 6px',
        borderRadius:   '4px',
        border:         `1px solid ${BTN_BORDER}`,
        background:     bg || CARD_BG,
        color:          TEXT_PRI,
        fontSize:       '11px',
        cursor:         'pointer',
        whiteSpace:     'nowrap',
        lineHeight:     '1.2',
        fontWeight:     '500',
        touchAction:    'manipulation'
      });
      return btn;
    }

    function applyTypographyVars(sidebar) {
      if (!sidebar) return;
      sidebar.style.setProperty('--ttpl-fsize', `${loadFSize()}px`);
      sidebar.style.setProperty('--ttpl-ffam', loadFFam());
    }

    function createSidebar() {
      if (document.getElementById('tt-playlist-sidebar')) return;
      const rootTarget = document.body || document.documentElement;
      if (!rootTarget) return;

      const geom = loadGeom();

      const sidebar = document.createElement('div');
      sidebar.id = 'tt-playlist-sidebar';
      Object.assign(sidebar.style, {
        position:      'fixed',
        top:           geom.top,
        left:          geom.left || 'auto',
        right:         geom.right,
        width:         geom.width,
        height:        geom.height,
        minWidth:      '200px',
        minHeight:     '200px',
        background:    DARK_BG,
        color:         TEXT_PRI,
        padding:       '8px 10px',
        borderRadius:  '10px',
        zIndex:        '2147483645',
        display:       loadVis() ? 'flex' : 'none',
        flexDirection: 'column',
        boxShadow:     '0 10px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)',
        fontSize:      '14px',
        lineHeight:    '1.45',
        resize:        'both',
        overflow:      'hidden',
        boxSizing:     'border-box'
      });
      applyTypographyVars(sidebar);

      ['wheel', 'DOMMouseScroll', 'mousewheel', 'touchmove'].forEach((evt) => {
        sidebar.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
      });
      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((evt) => {
        sidebar.addEventListener(evt, (e) => e.stopPropagation());
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
            g.width  = sidebar.style.width;
            g.height = sidebar.style.height;
            saveGeom(g);
          }, 300);
        }).observe(sidebar);
      }

      rootTarget.appendChild(sidebar);

      // --- Header ---
      const header = document.createElement('div');
      header.title = 'Drag to move. Double-click title to reset size/position.';
      Object.assign(header.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '4px', marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: '6px', cursor: 'move', flexShrink: '0', flexWrap: 'wrap'
      });

      const titleArea = el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '5px', flex: '1', minWidth: '0', userSelect: 'none' }
      }, [
        el('span', { textContent: '🎵', style: { color: VIBRANT_PINK, fontSize: '14px', fontWeight: '900' } }),
        el('span', {
          textContent: 'Playlist',
          style: { fontWeight: '700', fontSize: '13px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
        })
      ]);

      titleArea.addEventListener('dblclick', () => {
        saveGeom(defaultGeom);
        sidebar.style.top = defaultGeom.top;
        sidebar.style.left = 'auto';
        sidebar.style.right = defaultGeom.right;
        sidebar.style.width = defaultGeom.width;
        sidebar.style.height = defaultGeom.height;
      });

      const btnGroup = el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } });

      // Upload
      const fileInput = el('input', { type: 'file', accept: '.txt,.md,.tsv', style: { display: 'none' } });
      const uploadBtn = el('label', {
        title: 'Upload grouped or TSV playlist (.txt, .md, .tsv)',
        textContent: '📂',
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '3px 6px', borderRadius: '4px', border: `1px solid ${BTN_BORDER}`,
          background: CARD_BG, color: '#fff', cursor: 'pointer', fontSize: '11px',
          lineHeight: '1', touchAction: 'manipulation', userSelect: 'none'
        }
      }, [fileInput]);

      fileInput.addEventListener('change', (ev) => {
        const f = ev.target.files?.[0];
        if (f) handleFile(f);
        fileInput.value = '';
      });

      // Sync Button
      const syncBtn = mkBtn('⚡ Sync');
      syncBtn.id = 'tt-playlist-sync-btn';
      syncBtn.addEventListener('click', () => startAvatarBatchSync(true));

      // Avatars-Only Toggle
      const avatarOnlyBtn = mkBtn(loadAvatarOnly() ? '👤 Only' : '👤 + 📝');
      avatarOnlyBtn.id = 'tt-playlist-avataronly-btn';
      avatarOnlyBtn.title = 'Toggle between avatars-only grid or names + avatars';
      if (loadAvatarOnly()) {
        avatarOnlyBtn.style.background = 'rgba(254, 44, 85, 0.25)';
        avatarOnlyBtn.style.borderColor = VIBRANT_PINK;
      }
      avatarOnlyBtn.addEventListener('click', () => {
        const next = !loadAvatarOnly();
        saveAvatarOnly(next);
        avatarOnlyBtn.textContent = next ? '👤 Only' : '👤 + 📝';
        avatarOnlyBtn.style.background = next ? 'rgba(254, 44, 85, 0.25)' : CARD_BG;
        avatarOnlyBtn.style.borderColor = next ? VIBRANT_PINK : BTN_BORDER;
        renderList();
      });

      // Column Switcher
      const colBtn = mkBtn(loadCols() + ' Col' + (loadCols() > 1 ? 's' : ''));
      colBtn.id = 'tt-playlist-col-btn';
      colBtn.title = 'Cycle layout columns: 1 → 2 → 3 → 4 → 5 → 1';
      colBtn.addEventListener('click', () => {
        const c = (loadCols() % 5) + 1;
        saveCols(c);
        colBtn.textContent = c + ' Col' + (c > 1 ? 's' : '');
        renderList();
      });

      // Clear Playlist
      const clearBtn = mkBtn('Clear', '#7e0a0a');
      clearBtn.title = 'Clear playlist (hold Ctrl to also wipe cached avatars)';
      clearBtn.addEventListener('click', (e) => {
        if (isSyncing) syncAborted = true;
        lazyFetchQueue.length = 0;
        lazyFetchQueuedSet.clear();
        imgLoadQueue.length = 0;
        imgQueuedSet.clear();
        GM_deleteValue(STORAGE_LIST);
        GM_deleteValue(STORAGE_SCROLL);
        GM_deleteValue(STORAGE_LAST_INDEX);
        GM_deleteValue(STORAGE_SELECTED_CAT);
        playlist         = [];
        currentIndex     = -1;
        selectedCategory = '';
        if (e.ctrlKey || e.shiftKey) {
          wipeAllAvatarCache();
        } else {
          renderList();
          updateSyncButtonLabel();
        }
      });

      btnGroup.append(uploadBtn, syncBtn, avatarOnlyBtn, colBtn, clearBtn);
      header.append(titleArea, btnGroup);
      sidebar.appendChild(header);

      // --- Search, Wipe Cache & Category Controls ---
      const searchRow = el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '5px', flexShrink: '0' }
      });

      const searchInput = el('input', {
        type: 'text',
        placeholder: '🔍 Search handles or categories...',
        style: {
          flex: '1', minWidth: '0', background: '#101118', color: TEXT_PRI,
          border: `1px solid ${BTN_BORDER}`, borderRadius: '5px',
          padding: '4px 6px', fontSize: '11px', outline: 'none'
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

      const clearSearchBtn = mkBtn('✕', 'transparent');
      clearSearchBtn.style.padding = '3px 6px';
      clearSearchBtn.title = 'Clear search';
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        renderList();
      });

      const wipeCacheBtn = mkBtn('🧹', CARD_BG);
      wipeCacheBtn.style.padding = '3px 6px';
      wipeCacheBtn.title = 'Wipe all cached avatars (resets Sync to 0)';
      wipeCacheBtn.addEventListener('click', wipeAllAvatarCache);

      searchRow.append(searchInput, clearSearchBtn, wipeCacheBtn);
      sidebar.appendChild(searchRow);

      // Category Selector
      const catSelect = el('select', { id: 'tt-playlist-cat-select', title: 'Filter by Category' });
      styleDropdown(catSelect);
      Object.assign(catSelect.style, { marginBottom: '6px', width: '100%', fontSize: '11px', fontWeight: '600' });
      catSelect.addEventListener('change', () => {
        selectedCategory = catSelect.value;
        GM_setValue(STORAGE_SELECTED_CAT, selectedCategory);
        renderList();
      });
      sidebar.appendChild(catSelect);

      // --- Font Controls Row ---
      const fontRow = el('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px',
          borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', flexShrink: '0'
        }
      });

      const lblSz = el('span', { textContent: 'Sz:', style: { color: TEXT_SEC, fontSize: '10px', whiteSpace: 'nowrap' } });
      const sizeSelect = el('select', { id: 'tt-playlist-size-select', title: 'Font Size' });
      styleDropdown(sizeSelect);
      sizeSelect.style.width = '55px';
      sizeSelect.style.flexShrink = '0';
      const curSize = loadFSize();
      FONT_SIZE_OPTIONS.forEach((sz) => {
        const opt = el('option', { value: sz, textContent: `${sz}px` });
        if (sz === curSize) opt.selected = true;
        sizeSelect.appendChild(opt);
      });
      sizeSelect.addEventListener('change', () => {
        saveFSize(parseInt(sizeSelect.value, 10));
        applyTypographyVars(sidebar);
      });

      const lblFont = el('span', { textContent: 'Font:', style: { color: TEXT_SEC, fontSize: '10px', whiteSpace: 'nowrap' } });
      const famSelect = el('select', { id: 'tt-playlist-fam-select', title: 'Font Family' });
      styleDropdown(famSelect);
      famSelect.style.flex = '1';
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

      fontRow.append(lblSz, sizeSelect, lblFont, famSelect);
      sidebar.appendChild(fontRow);

      // --- List Viewport (Single Delegated Click Listener) ---
      const listContainer = el('div', {
        id: 'tt-playlist-listcontainer',
        style: { flex: '1', overflowY: 'auto', overflowX: 'hidden', paddingRight: '2px' }
      });
      listContainer.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
      listContainer.addEventListener('click', onListClick);
      sidebar.appendChild(listContainer);

      // Header drag logic
      let isDragging = false, startX, startY, startLeft, startTop;
      header.addEventListener('mousedown', (e) => {
        if (['button', 'select', 'input', 'label'].includes(e.target.tagName.toLowerCase())) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = sidebar.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        sidebar.style.right = 'auto';
        sidebar.style.left  = `${startLeft}px`;
        sidebar.style.top   = `${startTop}px`;
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const newL = Math.max(0, Math.min(startLeft + (e.clientX - startX), window.innerWidth - 100));
        const newT = Math.max(0, Math.min(startTop + (e.clientY - startY), window.innerHeight - 50));
        sidebar.style.left = `${newL}px`;
        sidebar.style.top  = `${newT}px`;
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          const g = loadGeom();
          g.left = sidebar.style.left;
          g.top  = sidebar.style.top;
          g.right = sidebar.style.right;
          saveGeom(g);
        }
      });

      refreshCategoryDropdown();
      updateSyncButtonLabel();
    }

    function onListClick(e) {
      if (e.target.id === 'tt-playlist-load-more') {
        renderNextChunk();
        return;
      }

      const row = e.target.closest('.tt-playlist-row');
      if (!row) return;

      e.preventDefault();
      e.stopPropagation();

      const originalIdx = parseInt(row.dataset.index, 10);
      const u = row.dataset.username;
      if (!u) return;

      saveIdx(originalIdx);

      const listContainer = document.getElementById('tt-playlist-listcontainer');
      if (listContainer) {
        listContainer.querySelectorAll('.tt-playlist-row.tt-active').forEach((r) => {
          r.classList.remove('tt-active');
          const span = r.querySelector('.tt-playlist-label');
          if (span && span.dataset.rawText) {
            span.textContent = span.dataset.rawText;
          }
        });
      }

      row.classList.add('tt-active');
      const activeSpan = row.querySelector('.tt-playlist-label');
      if (activeSpan && activeSpan.dataset.rawText) {
        activeSpan.textContent = `▶ ${activeSpan.dataset.rawText}`;
      }

      navigateTo(u);
    }

    /***************************************************************************
     * Chunked Incremental List Renderer (Handles 1,000+ entries smoothly)
     ***************************************************************************/
    let renderFlatItems = [];
    let renderedCount = 0;
    let lastRenderedCategory = null;
    let lastCategoryGrid = null;
    let categoryCountsMap = new Map();

    function createCategoryGrid(cols, isAvatarOnly) {
      const container = document.createElement('div');
      if (isAvatarOnly) {
        const effectiveCols = cols === 1 ? 4 : cols;
        Object.assign(container.style, {
          display: 'grid',
          gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
          gap: '8px 4px', width: '100%', alignContent: 'start',
          justifyItems: 'center', marginBottom: '6px'
        });
      } else if (cols > 1) {
        Object.assign(container.style, {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: '4px', width: '100%', alignContent: 'start', marginBottom: '6px'
        });
      } else {
        Object.assign(container.style, {
          display: 'flex', flexDirection: 'column', gap: '3px',
          width: '100%', marginBottom: '6px'
        });
      }
      return container;
    }

    function renderNextChunk() {
      const listContainer = document.getElementById('tt-playlist-listcontainer');
      if (!listContainer || renderedCount >= renderFlatItems.length) return;

      const oldSentinel = document.getElementById('tt-playlist-load-more');
      if (oldSentinel) {
        if (rowObserver) rowObserver.unobserve(oldSentinel);
        oldSentinel.remove();
      }

      const cols         = loadCols();
      const isAvatarOnly = loadAvatarOnly();
      const currentUser  = getCurrentUsername();
      const observer     = getRowObserver(listContainer);

      const end = Math.min(renderedCount + CHUNK_SIZE, renderFlatItems.length);
      const frag = document.createDocumentFragment();
      const observeTargets = [];

      for (let i = renderedCount; i < end; i++) {
        const { username: u, category: cat, originalIdx } = renderFlatItems[i];

        if (cat !== lastRenderedCategory || !lastCategoryGrid) {
          lastRenderedCategory = cat;
          if (!selectedCategory && (categoryCountsMap.size > 1 || cat !== 'General')) {
            const catHeader = el('div', { className: 'tt-playlist-cat-header' }, [
              el('span', { textContent: `📁 ${cat}` }),
              el('span', { className: 'tt-playlist-cat-count', textContent: String(categoryCountsMap.get(cat) || 0) })
            ]);
            frag.appendChild(catHeader);
          }
          lastCategoryGrid = createCategoryGrid(cols, isAvatarOnly);
          frag.appendChild(lastCategoryGrid);
        }

        const isMatch = currentUser && (currentUser === u);
        const isLast  = originalIdx === currentIndex;
        const active  = isMatch || isLast;

        const row = document.createElement('a');
        row.href = `https://www.tiktok.com/@${encodeURIComponent(u)}`;
        row.title = `@${u} (${originalIdx + 1})`;
        row.className =
          'tt-playlist-row' +
          (active ? ' tt-active' : '') +
          (isAvatarOnly ? ' tt-avatar-only' : '') +
          (!isAvatarOnly && cols === 1 ? ' tt-cols-1' : '');
        row.dataset.index = String(originalIdx);
        row.dataset.username = u;

        const avatarBox = document.createElement('div');
        avatarBox.className = 'tt-playlist-avatar-box';
        avatarBox.dataset.username = u;

        const placeholder = el('span', {
          className: 'tt-playlist-avatar-placeholder',
          textContent: (u[0] || 'T').toUpperCase()
        });

        const img = document.createElement('img');
        img.className = 'tt-playlist-avatar-img';
        img.referrerPolicy = 'no-referrer';

        avatarBox.append(placeholder, img);
        row.appendChild(avatarBox);

        if (!isAvatarOnly) {
          const rawText = `${originalIdx + 1}. @${u}`;
          const textSpan = el('span', {
            className: 'tt-playlist-label',
            textContent: active ? `▶ ${rawText}` : rawText
          });
          textSpan.dataset.rawText = rawText;
          row.appendChild(textSpan);
        }

        lastCategoryGrid.appendChild(row);
        observeTargets.push(avatarBox);
      }

      renderedCount = end;

      if (renderedCount < renderFlatItems.length) {
        const remaining = renderFlatItems.length - renderedCount;
        const sentinel = el('div', {
          id: 'tt-playlist-load-more',
          textContent: `Load next ${Math.min(CHUNK_SIZE, remaining)} (${remaining} remaining)`
        });
        frag.appendChild(sentinel);
        observeTargets.push(sentinel);
      }

      listContainer.appendChild(frag);
      for (let i = 0; i < observeTargets.length; i++) {
        observer.observe(observeTargets[i]);
      }
    }

    function renderList() {
      createSidebar();
      const sidebar       = document.getElementById('tt-playlist-sidebar');
      const listContainer = document.getElementById('tt-playlist-listcontainer');
      if (!listContainer || !sidebar) return;

      refreshCategoryDropdown();
      applyTypographyVars(sidebar);
      sidebar.style.display = loadVis() ? 'flex' : 'none';

      if (rowObserver) rowObserver.disconnect();
      imgLoadQueue.length = 0;
      imgQueuedSet.clear();
      listContainer.replaceChildren();

      renderFlatItems = [];
      renderedCount = 0;
      lastRenderedCategory = null;
      lastCategoryGrid = null;
      categoryCountsMap = new Map();

      if (!playlist || playlist.length === 0) {
        const emptyBox = el('div', {
          style: { textAlign: 'center', padding: '30px 10px', color: TEXT_SEC, fontSize: '12px' }
        }, [
          el('div', { textContent: '📂', style: { fontSize: '24px', marginBottom: '6px' } }),
          el('div', { textContent: 'Playlist is Empty', style: { fontWeight: '700', color: '#fff', marginBottom: '2px' } }),
          el('div', { textContent: 'Upload a grouped or TSV .txt/.md/.tsv list above.' })
        ]);
        listContainer.appendChild(emptyBox);
        updateSyncButtonLabel();
        return;
      }

      let displayItems = playlist.map((item, idx) => ({
        username: cleanUsername(item),
        category: item.category || 'General',
        originalIdx: idx
      }));

      if (selectedCategory) {
        displayItems = displayItems.filter((item) => item.category === selectedCategory);
      }
      if (searchQuery) {
        displayItems = displayItems.filter((item) =>
          item.username.includes(searchQuery) || item.category.toLowerCase().includes(searchQuery)
        );
      }

      if (displayItems.length === 0) {
        listContainer.appendChild(el('div', {
          textContent: '(no matching accounts)',
          style: { opacity: '0.6', padding: '12px 4px', fontSize: '12px', textAlign: 'center' }
        }));
        return;
      }

      const grouped = new Map();
      for (let i = 0; i < displayItems.length; i++) {
        const it = displayItems[i];
        const cat = it.category || 'General';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat).push(it);
      }
      grouped.forEach((arr, cat) => {
        categoryCountsMap.set(cat, arr.length);
        for (let i = 0; i < arr.length; i++) renderFlatItems.push(arr[i]);
      });

      renderNextChunk();

      const savedScroll = parseInt(GM_getValue(STORAGE_SCROLL, 0), 10);
      if (Number.isFinite(savedScroll) && savedScroll > 0 && savedScroll < listContainer.scrollHeight) {
        listContainer.scrollTop = savedScroll;
      }

      let scrollSaveTimer = null;
      listContainer.onscroll = () => {
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(() => {
          GM_setValue(STORAGE_SCROLL, listContainer.scrollTop || 0);
        }, 250);
      };

      updateSyncButtonLabel();
    }

    /***************************************************************************
     * Floating Draggable Controls & File Upload (Throttled TSV Processing)
     ***************************************************************************/
    function handleFile(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawText = e.target?.result || '';
        const parsedData = parsePlaylistText(rawText);

        playlist = parsedData.map((item) => ({
          username: item.username,
          category: item.category || 'General',
          mainCategory: item.mainCategory || 'General'
        }));

        getIDB().then((db) => {
          const validEntries = parsedData.filter(
            (item) => item.avatarUrl && isGoodAvatarUrl(item.avatarUrl) && !isValidAvatarVal(avatarCache[item.username])
          );
          if (!validEntries.length) return;

          if (db) {
            try {
              const tx = db.transaction(DB_STORE, 'readwrite');
              const store = tx.objectStore(DB_STORE);
              for (const item of validEntries) {
                avatarCache[item.username] = item.avatarUrl;
                store.put(item.avatarUrl, item.username);
              }
            } catch (_) {}
          } else {
            for (const item of validEntries) {
              avatarCache[item.username] = item.avatarUrl;
            }
          }
          syncRenderedRowAvatars();
          updateSyncButtonLabel();
        });

        sessionFailedSet.clear();
        syncCircuitBroken = false;
        currentIndex = -1;
        selectedCategory = '';
        GM_deleteValue(STORAGE_SELECTED_CAT);

        saveList(playlist);
        saveIdx(-1);
        saveVis(true);

        const sidebar = document.getElementById('tt-playlist-sidebar');
        if (sidebar) sidebar.style.display = 'flex';
        updateToggleBtn();
        renderList();
        updateSyncButtonLabel();
      };
      reader.readAsText(file);
    }

    function updateToggleBtn() {
      const toggleBtn = document.getElementById('tt-playlist-toggle-btn');
      if (!toggleBtn) return;
      const vis = loadVis();
      toggleBtn.textContent = vis ? '◀' : '▶';
      toggleBtn.title       = vis ? 'Hide Playlist (Ctrl+Drag to move)' : 'Show Playlist (Ctrl+Drag to move)';
    }

    function applyCtrlGeom(controls) {
      if (!controls) return;
      const g = loadCtrlGeom();
      if (g.left) {
        const maxL = Math.max(0, window.innerWidth - (controls.offsetWidth || 36));
        const maxT = Math.max(0, window.innerHeight - (controls.offsetHeight || 80));
        const clampedL = Math.max(0, Math.min(parseFloat(g.left) || 0, maxL));
        const clampedT = Math.max(0, Math.min(parseFloat(g.top) || 14, maxT));
        controls.style.left = `${clampedL}px`;
        controls.style.top  = `${clampedT}px`;
        controls.style.right = 'auto';
      } else {
        controls.style.left  = '';
        controls.style.top   = g.top || defaultCtrlGeom.top;
        controls.style.right = g.right || defaultCtrlGeom.right;
      }
    }

    function initControls() {
      if (document.getElementById('tt-playlist-controls')) return;
      const rootTarget = document.body || document.documentElement;
      if (!rootTarget) return;

      const controls = el('div', {
        id: 'tt-playlist-controls',
        style: {
          position: 'fixed', top: '14px', right: '260px', zIndex: '2147483646',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
          userSelect: 'none'
        }
      });

      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((evt) => {
        controls.addEventListener(evt, (e) => e.stopPropagation());
      });

      const dragHandle = el('div', {
        id: 'tt-playlist-controls-drag',
        textContent: '⠿',
        title: 'Drag to move controls anywhere (or Ctrl+Click & Hold any button). Double-click to reset.',
        style: {
          width: '32px', height: '14px', borderRadius: '4px',
          background: BTN_BG, color: TEXT_SEC, border: `1px solid ${BTN_BORDER}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', lineHeight: '1', cursor: 'grab',
          userSelect: 'none', touchAction: 'none', boxSizing: 'border-box'
        }
      });

      const fileInput = el('input', { type: 'file', accept: '.txt,.md,.tsv', style: { display: 'none' } });
      const uploadLabel = el('label', {
        title: 'Upload grouped or TSV playlist (.txt, .md, .tsv) — Ctrl+Drag to move',
        textContent: '📂',
        style: {
          minWidth: '32px', minHeight: '28px', borderRadius: '4px',
          background: BTN_BG, color: TEXT_PRI, cursor: 'pointer', fontSize: '12px',
          border: `1px solid ${BTN_BORDER}`, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', lineHeight: '1',
          userSelect: 'none', touchAction: 'manipulation', boxSizing: 'border-box'
        }
      }, [fileInput]);

      const toggleBtn = el('button', {
        id: 'tt-playlist-toggle-btn',
        textContent: loadVis() ? '◀' : '▶',
        title: loadVis() ? 'Hide Playlist (Ctrl+Drag to move)' : 'Show Playlist (Ctrl+Drag to move)',
        style: {
          minWidth: '32px', minHeight: '28px', fontSize: '12px',
          border: `1px solid ${BTN_BORDER}`, borderRadius: '4px',
          cursor: 'pointer', background: BTN_BG, color: TEXT_PRI,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: '1', touchAction: 'manipulation', boxSizing: 'border-box'
        }
      });

      let ctrlDragging = false;
      let ctrlMoved = false;
      let ctrlStartX = 0, ctrlStartY = 0, ctrlInitLeft = 0, ctrlInitTop = 0;

      controls.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const onHandle = e.target === dragHandle;
        const modifierHeld = e.ctrlKey || e.shiftKey;
        if (!onHandle && !modifierHeld) return;

        ctrlDragging = true;
        ctrlMoved = false;
        ctrlStartX = e.clientX;
        ctrlStartY = e.clientY;
        const rect = controls.getBoundingClientRect();
        ctrlInitLeft = rect.left;
        ctrlInitTop = rect.top;

        dragHandle.style.cursor = 'grabbing';
        controls.style.right = 'auto';
        controls.style.left  = `${ctrlInitLeft}px`;
        controls.style.top   = `${ctrlInitTop}px`;
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!ctrlDragging) return;
        const dx = e.clientX - ctrlStartX;
        const dy = e.clientY - ctrlStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) ctrlMoved = true;

        const maxL = Math.max(0, window.innerWidth - controls.offsetWidth);
        const maxT = Math.max(0, window.innerHeight - controls.offsetHeight);
        const newL = Math.max(0, Math.min(ctrlInitLeft + dx, maxL));
        const newT = Math.max(0, Math.min(ctrlInitTop + dy, maxT));
        controls.style.left = `${newL}px`;
        controls.style.top  = `${newT}px`;
      });

      window.addEventListener('mouseup', () => {
        if (!ctrlDragging) return;
        ctrlDragging = false;
        dragHandle.style.cursor = 'grab';
        if (ctrlMoved) {
          saveCtrlGeom({
            left: controls.style.left,
            top: controls.style.top,
            right: 'auto'
          });
          setTimeout(() => { ctrlMoved = false; }, 60);
        }
      });

      controls.addEventListener('click', (e) => {
        if (ctrlMoved || e.ctrlKey || e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);

      dragHandle.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        saveCtrlGeom(defaultCtrlGeom);
        applyCtrlGeom(controls);
      });

      toggleBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('tt-playlist-sidebar');
        if (!sidebar) return;
        const newState = sidebar.style.display === 'none';
        sidebar.style.display = newState ? 'flex' : 'none';
        saveVis(newState);
        updateToggleBtn();
        if (newState) renderList();
      });

      controls.append(dragHandle, uploadLabel, toggleBtn);
      rootTarget.appendChild(controls);
      applyCtrlGeom(controls);

      window.addEventListener('resize', () => applyCtrlGeom(controls));

      uploadLabel.addEventListener('dragover',  (e) => { e.preventDefault(); uploadLabel.style.opacity = '0.6'; });
      uploadLabel.addEventListener('dragleave', ()  => { uploadLabel.style.opacity = '1'; });
      uploadLabel.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadLabel.style.opacity = '1';
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFile(f);
      });

      fileInput.addEventListener('change', (ev) => {
        const f = ev.target.files?.[0];
        if (f) handleFile(f);
        fileInput.value = '';
      });
    }

    /***************************************************************************
     * Keyboard Shortcuts (Alt + Left/Right Arrow)
     ***************************************************************************/
    document.addEventListener('keydown', (e) => {
      if (!e.altKey || playlist.length === 0) return;

      let activeSet = playlist.map((item, idx) => ({ ...item, originalIdx: idx }));
      if (selectedCategory) {
        activeSet = activeSet.filter((item) => item.category === selectedCategory);
      }
      if (searchQuery) {
        activeSet = activeSet.filter((item) =>
          item.username.includes(searchQuery) || item.category.toLowerCase().includes(searchQuery)
        );
      }
      if (activeSet.length === 0) activeSet = playlist.map((item, idx) => ({ ...item, originalIdx: idx }));

      const currentPos = activeSet.findIndex((item) => item.originalIdx === currentIndex);

      if (e.key === 'ArrowRight') {
        const nextPos = (currentPos + 1) % activeSet.length;
        const target = activeSet[nextPos];
        saveIdx(target.originalIdx);
        renderList();
        setTimeout(() => navigateTo(target.username), 40);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        const prevPos = (currentPos - 1 + activeSet.length) % activeSet.length;
        const target = activeSet[prevPos];
        saveIdx(target.originalIdx);
        renderList();
        setTimeout(() => navigateTo(target.username), 40);
        e.preventDefault();
      }
    });

    /***************************************************************************
     * Clean Shutdown / Unload Abort (Prevents Stuck OS Network Queues)
     ***************************************************************************/
    let domObserver = null;
    let harvestTimer = null;

    function emergencyCleanup() {
      isShuttingDown = true;
      syncAborted = true;
      isSyncing = false;
      lazyFetchQueue.length = 0;
      lazyFetchQueuedSet.clear();
      imgLoadQueue.length = 0;
      imgQueuedSet.clear();

      if (harvestTimer) {
        clearTimeout(harvestTimer);
        harvestTimer = null;
      }
      if (domObserver) {
        try { domObserver.disconnect(); } catch (_) {}
      }
      if (rowObserver) {
        try { rowObserver.disconnect(); } catch (_) {}
      }

      __ACTIVE_XHR_SET__.forEach((xhr) => {
        try { xhr.abort(); } catch (_) {}
      });
      __ACTIVE_XHR_SET__.clear();

      activeImagesSet.forEach((img) => {
        try {
          img.onload = null;
          img.onerror = null;
          img.src = '';
        } catch (_) {}
      });
      activeImagesSet.clear();
    }

    window.addEventListener('pagehide', emergencyCleanup);
    window.addEventListener('beforeunload', emergencyCleanup);

    /***************************************************************************
     * Initialization, Hydrate Sync & Throttled SPA Harvester
     ***************************************************************************/
    function syncControlsState() {
      const colBtn = document.getElementById('tt-playlist-col-btn');
      if (colBtn) {
        const c = loadCols();
        colBtn.textContent = c + ' Col' + (c > 1 ? 's' : '');
      }
      const avatarOnlyBtn = document.getElementById('tt-playlist-avataronly-btn');
      if (avatarOnlyBtn) {
        const ao = loadAvatarOnly();
        avatarOnlyBtn.textContent = ao ? '👤 Only' : '👤 + 📝';
        avatarOnlyBtn.style.background = ao ? 'rgba(254, 44, 85, 0.25)' : CARD_BG;
        avatarOnlyBtn.style.borderColor = ao ? VIBRANT_PINK : BTN_BORDER;
      }
      const sizeSel = document.getElementById('tt-playlist-size-select');
      if (sizeSel) sizeSel.value = String(loadFSize());
      const famSel = document.getElementById('tt-playlist-fam-select');
      if (famSel) famSel.value = loadFFam();

      const sidebar = document.getElementById('tt-playlist-sidebar');
      if (sidebar) {
        const g = loadGeom();
        sidebar.style.top = g.top;
        sidebar.style.left = g.left || 'auto';
        sidebar.style.right = g.right;
        sidebar.style.width = g.width;
        sidebar.style.height = g.height;
        applyTypographyVars(sidebar);
      }
      applyCtrlGeom(document.getElementById('tt-playlist-controls'));
      updateToggleBtn();
    }

    function hydrateStateFromKV() {
      const stored = loadList();
      playlist = stored && stored.length ? normalizePlaylist(stored) : [];
      currentIndex = loadIdx();
      selectedCategory = String(GM_getValue(STORAGE_SELECTED_CAT, '') || '');
    }

    let lastPath = window.location.pathname;

    function scheduleDomWork() {
      if (isShuttingDown) return;
      if (!document.getElementById('tt-playlist-controls')) initControls();
      if (!document.getElementById('tt-playlist-sidebar')) {
        createSidebar();
        renderList();
      }

      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        setTimeout(() => {
          if (!isShuttingDown) {
            harvestAvatarsFromDOM();
            renderList();
          }
        }, 400);
      }

      if (!harvestTimer && !document.hidden) {
        harvestTimer = setTimeout(() => {
          harvestTimer = null;
          harvestAvatarsFromDOM();
        }, 3000);
      }
    }

    const origPushState = window.history.pushState;
    if (typeof origPushState === 'function') {
      window.history.pushState = function (...args) {
        const ret = origPushState.apply(this, args);
        scheduleDomWork();
        return ret;
      };
    }
    const origReplaceState = window.history.replaceState;
    if (typeof origReplaceState === 'function') {
      window.history.replaceState = function (...args) {
        const ret = origReplaceState.apply(this, args);
        scheduleDomWork();
        return ret;
      };
    }
    window.addEventListener('popstate', scheduleDomWork);

    function bootstrapUI() {
      if (!document.body || isShuttingDown) return;

      hydrateStateFromKV();
      createSidebar();
      renderList();
      initControls();

      domObserver = new MutationObserver((mutations) => {
        if (isShuttingDown) return;
        const sidebarEl = document.getElementById('tt-playlist-sidebar');
        const ctrlEl = document.getElementById('tt-playlist-controls');

        for (const m of mutations) {
          if (!m.addedNodes || m.addedNodes.length === 0) continue;
          if (sidebarEl && sidebarEl.contains(m.target)) continue;
          if (ctrlEl && ctrlEl.contains(m.target)) continue;
          scheduleDomWork();
          break;
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('ttpl:kvHydrated', () => {
      hydrateStateFromKV();
      if (document.body && !isShuttingDown) {
        createSidebar();
        initControls();
        syncControlsState();
        renderList();
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrapUI, { once: true });
    } else {
      bootstrapUI();
    }

    window.addEventListener('load', () => {
      setTimeout(() => {
        if (!isShuttingDown) {
          initControls();
          renderList();
        }
      }, 1000);
    });
  })();
})();
