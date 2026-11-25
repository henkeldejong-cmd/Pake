// ==UserScript Adapted for Pake==
// @name         Final Tiktok Playlist (TSV Avatar Import Edition) — Pake Edition
// @namespace    belay m.
// @version      2.7.1-pake
// @description  TikTok playlist with category grouping, category filter dropdown, robust avatar extraction, live sync engine, persistent KV + IndexedDB storage, wheel-scroll isolation, avatars-only mode, font controls, and TSV avatar import support.
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

  const __LEGACY_KEYS__ = [
    'tt_playlist_list',
    'tt_playlist_scroll',
    'tt_playlist_last_index',
    'tt_playlist_visible',
    'tt_playlist_cols',
    'tt_playlist_fsize',
    'tt_playlist_ffam',
    'tt_playlist_geom',
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
          if (key === 'tt_playlist_list' || key === 'tt_playlist_geom') {
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
     4. TIKTOK PLAYLIST (TSV AVATAR IMPORT EDITION) v2.7.1
     ========================================================================= */
  (function () {
    'use strict';

    /***************************************************************************
     * Storage Keys & Constants
     ***************************************************************************/
    const STORAGE_LIST         = 'tt_playlist_list';
    const STORAGE_SCROLL       = 'tt_playlist_scroll';
    const STORAGE_LAST_INDEX   = 'tt_playlist_last_index';
    const STORAGE_VISIBLE      = 'tt_playlist_visible';
    const STORAGE_COLS         = 'tt_playlist_cols';
    const STORAGE_FSIZE        = 'tt_playlist_fsize';
    const STORAGE_FFAM         = 'tt_playlist_ffam';
    const STORAGE_AVATARS      = 'tt_playlist_avatars';
    const STORAGE_GEOM         = 'tt_playlist_geom';
    const STORAGE_AVATAR_ONLY  = 'tt_playlist_avatar_only';
    const STORAGE_SELECTED_CAT = 'tt_playlist_selected_cat';

    const DB_NAME              = 'TT_Playlist_Avatars_DB';
    const DB_STORE             = 'avatars_store';

    const VIBRANT_PINK   = '#fe2c55';
    const TIKTOK_CYAN    = '#25f4ee';
    const DARK_BG        = 'rgba(18, 18, 24, 0.97)';
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
     * State & Storage Helpers (Backed by Pake KV + Safe JSON Parsing)
     ***************************************************************************/
    let playlist         = [];
    let currentIndex     = -1;
    let searchQuery      = '';
    let selectedCategory = String(GM_getValue(STORAGE_SELECTED_CAT, '') || '');
    let isSyncing        = false;
    let syncAborted      = false;

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

    /* Safe DOM creation helper (avoids innerHTML / Trusted Types issues) */
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

        // Detect TSV format (username \t avatar_url \t profile_url)
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
     * Dual Storage: In-Memory + IndexedDB + LocalStorage (keeps large Base64 blobs out of KV JSON)
     ***************************************************************************/
    let avatarCache = (() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_AVATARS);
        if (!raw) return {};
        const parsed = parseMaybeJson(raw, {});
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) {
        return {};
      }
    })();

    let idbInstance = null;
    function getIDB() {
      if (idbInstance) return Promise.resolve(idbInstance);
      if (typeof indexedDB === 'undefined') return Promise.resolve(null);
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(DB_STORE)) {
              req.result.createObjectStore(DB_STORE);
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
      getIDB().then((db) => {
        if (!db) return;
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(val, key);
        } catch (_) {}
      });
    }

    getIDB().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (!avatarCache[cursor.key] && cursor.value) {
              avatarCache[cursor.key] = cursor.value;
            }
            cursor.continue();
          } else {
            updateSyncButtonLabel();
          }
        };
      } catch (_) {}
    });

    let avatarSaveTimer = null;
    function cacheAvatar(username, url) {
      if (!username || !url) return;
      const u = username.toLowerCase();
      if (avatarCache[u] === url) return;
      avatarCache[u] = url;

      idbPut(u, url);

      clearTimeout(avatarSaveTimer);
      avatarSaveTimer = setTimeout(() => {
        try {
          window.localStorage.setItem(STORAGE_AVATARS, JSON.stringify(avatarCache));
        } catch (_) {
          // LocalStorage quota reached; IndexedDB remains active
        }
        updateSyncButtonLabel();
      }, 300);
    }

    /***************************************************************************
     * Long-Term Storage: Base64 Conversion Engine
     ***************************************************************************/
    async function convertUrlToBase64(url) {
      if (!url || url.startsWith('data:image')) return url;
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } catch (_) {
            resolve(url);
          }
        };
        img.onerror = () => resolve(url);
        img.src = url;
      });
    }

    /***************************************************************************
     * Navigation & DOM Avatar Harvesting
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
      const targetUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
      window.location.assign(targetUrl);
    }

    function harvestAvatarsFromDOM() {
      if (!document.body) return;

      const cur = getCurrentUsername();
      if (cur) {
        const avatarImg = document.querySelector(
          '[data-e2e="user-avatar"] img, img[class*="ImgAvatar"], .e1iqrkv71, header img[src*="tiktokcdn"]'
        );
        if (avatarImg && avatarImg.src && !avatarImg.src.startsWith('data:') && !avatarImg.src.includes('default-avatar')) {
          const currentCached = avatarCache[cur];
          if (!currentCached || !currentCached.startsWith('data:image')) {
            avatarCache[cur] = avatarImg.src;
            broadcastAvatarUpdate(cur, avatarImg.src);

            convertUrlToBase64(avatarImg.src).then((base64) => {
              if (base64 && base64.startsWith('data:image')) {
                cacheAvatar(cur, base64);
                broadcastAvatarUpdate(cur, base64);
              }
            });
          }
        }
      }

      const links = document.querySelectorAll('a[href*="/@"]');
      for (let i = 0; i < links.length; i++) {
        const a = links[i];
        try {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/@([a-zA-Z0-9._]+)/);
          if (match) {
            const u = cleanUsername(match[1]);
            const currentCached = avatarCache[u];
            if (u && (!currentCached || currentCached === 'NONE')) {
              const img = a.querySelector('img[src*="tiktokcdn"]');
              if (img && img.src && !img.src.startsWith('data:') && !img.src.includes('default-avatar')) {
                avatarCache[u] = img.src;
                convertUrlToBase64(img.src).then((base64) => {
                  if (base64 && base64.startsWith('data:image')) {
                    cacheAvatar(u, base64);
                    broadcastAvatarUpdate(u, base64);
                  }
                });
              }
            }
          }
        } catch (_) {}
      }
    }

    /***************************************************************************
     * Multi-Stage Avatar Extraction Engine (Fetch + proxy_http Fallback)
     ***************************************************************************/
    function proxyGetText(url) {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          url,
          method: 'GET',
          timeout: 12000,
          onload(res) {
            resolve({ status: res.status, text: res.responseText || '' });
          },
          onerror() {
            resolve({ status: 0, text: '' });
          },
          ontimeout() {
            resolve({ status: 0, text: '' });
          }
        });
      });
    }

    function extractAvatarFromHtml(html) {
      if (!html) return null;
      try {
        const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i);
        if (jsonMatch && jsonMatch[1]) {
          const rehydrationData = JSON.parse(jsonMatch[1]);
          const user = rehydrationData?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo?.user;
          const targetUrl = user?.avatarLarger || user?.avatarMedium || user?.avatarThumb;
          if (targetUrl) return targetUrl.replace(/\\u002F/g, '/');
        }
      } catch (_) {}

      const htmlMatch = html.match(/"avatarLarger":\s*"([^"]+)"/i)
                     || html.match(/"avatarMedium":\s*"([^"]+)"/i)
                     || html.match(/"avatarThumb":\s*"([^"]+)"/i)
                     || html.match(/<meta\s+[^>]*?(?:property|name)=["']og:image["'][^>]*?content=["']([^"']+)["']/i);

      if (htmlMatch && htmlMatch[1]) {
        return htmlMatch[1].replace(/\\u002F/g, '/').replace(/\\/g, '').replace(/&amp;/g, '&');
      }
      return null;
    }

    async function fetchAvatarForUsername(username) {
      const u = cleanUsername(username);
      if (!u) return null;

      try {
        const res = await fetch(`/api/user/detail/?uniqueId=${encodeURIComponent(u)}&aid=1988`);
        if (res.status === 429) return { rateLimited: true };
        if (res.ok) {
          const data = await res.json();
          const user = data?.userInfo?.user;
          const avatarUrl = user?.avatarLarger || user?.avatarMedium || user?.avatarThumb;
          if (avatarUrl) return { url: avatarUrl.replace(/\\u002F/g, '/') };
        }
      } catch (_) {}

      const profileUrl = `https://www.tiktok.com/@${encodeURIComponent(u)}`;
      try {
        const pageRes = await fetch(profileUrl);
        if (pageRes.status === 429) return { rateLimited: true };
        if (pageRes.ok) {
          const html = await pageRes.text();
          const extracted = extractAvatarFromHtml(html);
          if (extracted) return { url: extracted };
        }
      } catch (_) {}

      // Pake CORS/CSP-free proxy_http fallback
      if (__PAKE_INVOKE__) {
        const proxied = await proxyGetText(profileUrl);
        if (proxied.status === 429) return { rateLimited: true };
        const extracted = extractAvatarFromHtml(proxied.text);
        if (extracted) return { url: extracted };
      }

      return new Promise((resolve) => {
        const unavatarUrl = `https://unavatar.io/tiktok/${encodeURIComponent(u)}`;
        const testImg = new Image();
        testImg.onload = () => resolve({ url: unavatarUrl });
        testImg.onerror = () => resolve({ notFound: true });
        testImg.src = unavatarUrl;
      });
    }

    function applyAvatarToDOM(url, imgEl, placeholderEl) {
      if (!imgEl || !placeholderEl) return;
      if (url && url !== 'NONE') {
        imgEl.src = url;
        imgEl.style.display = 'block';
        placeholderEl.style.display = 'none';
      } else {
        imgEl.style.display = 'none';
        placeholderEl.style.display = 'flex';
      }
    }

    function broadcastAvatarUpdate(username, url) {
      const u = cleanUsername(username);
      document.querySelectorAll(`.tt-playlist-row[data-username="${CSS.escape ? CSS.escape(u) : u}"]`).forEach((row) => {
        const img = row.querySelector('.tt-playlist-avatar-img');
        const placeholder = row.querySelector('.tt-playlist-avatar-placeholder');
        applyAvatarToDOM(url, img, placeholder);
      });
    }

    /***************************************************************************
     * Batch Sync Process
     ***************************************************************************/
    async function startAvatarBatchSync() {
      if (isSyncing) {
        syncAborted = true;
        return;
      }

      const usernames = playlist.map(cleanUsername).filter(Boolean);
      if (!usernames.length) return;

      const missing = usernames.filter((u) => !avatarCache[u] || avatarCache[u] === 'NONE');
      if (!missing.length) {
        const btn = document.getElementById('tt-playlist-sync-btn');
        if (btn) {
          btn.textContent = '✅ All Cached';
          setTimeout(() => updateSyncButtonLabel(), 1800);
        }
        return;
      }

      isSyncing = true;
      syncAborted = false;
      updateSyncButtonLabel();

      const queue = [...missing];
      const CONCURRENCY = 1;
      let completedCount = usernames.length - missing.length;
      const totalCount = usernames.length;

      async function worker() {
        while (queue.length > 0 && !syncAborted) {
          const u = queue.shift();
          if (!u) break;

          const res = await fetchAvatarForUsername(u);

          if (res?.rateLimited) {
            queue.unshift(u);
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }

          if (res?.url) {
            const base64Url = await convertUrlToBase64(res.url);
            cacheAvatar(u, base64Url);
            broadcastAvatarUpdate(u, base64Url);
            completedCount++;
          } else if (res?.notFound) {
            cacheAvatar(u, 'NONE');
            completedCount++;
          }

          updateSyncButtonLabel(completedCount, totalCount);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      const workers = Array.from({ length: CONCURRENCY }, () => worker());
      await Promise.all(workers);

      isSyncing = false;
      syncAborted = false;
      updateSyncButtonLabel();
    }

    function getAvatarStats() {
      const list = playlist.map(cleanUsername).filter(Boolean);
      if (!list.length) return { cached: 0, total: 0 };
      const cached = list.filter((u) => avatarCache[u] && avatarCache[u] !== 'NONE').length;
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
        btn.title = 'Fetching missing avatars... Click to pause.';
        btn.style.background = 'rgba(254, 44, 85, 0.35)';
        btn.style.borderColor = VIBRANT_PINK;
      } else {
        btn.textContent = `⚡ Sync (${cur}/${tot})`;
        btn.title = `Sync missing avatars (${cur} of ${tot} cached). Click to start.`;
        btn.style.background = cur === tot && tot > 0 ? 'rgba(37, 244, 238, 0.2)' : CARD_BG;
        btn.style.borderColor = cur === tot && tot > 0 ? TIKTOK_CYAN : BTN_BORDER;
      }
    }

    /***************************************************************************
     * IntersectionObserver (Lazy-Loader for API Fallback)
     ***************************************************************************/
    let avatarObserver = null;
    function getAvatarObserver(rootContainer) {
      if (!avatarObserver) {
        avatarObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const box = entry.target;
              avatarObserver.unobserve(box);
              const u = box.dataset.username;
              const imgEl = box.querySelector('.tt-playlist-avatar-img');
              const placeholderEl = box.querySelector('.tt-playlist-avatar-placeholder');

              if (u && !avatarCache[u]) {
                fetchAvatarForUsername(u).then(async (res) => {
                  if (res?.url) {
                    const base64Url = await convertUrlToBase64(res.url);
                    cacheAvatar(u, base64Url);
                    applyAvatarToDOM(base64Url, imgEl, placeholderEl);
                  }
                });
              }
            }
          });
        }, { root: rootContainer, rootMargin: '120px' });
      }
      return avatarObserver;
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
        transition:     'background 0.15s, border-color 0.15s',
        touchAction:    'manipulation'
      });
      return btn;
    }

    function createSidebar() {
      if (document.getElementById('tt-playlist-sidebar')) return;
      const rootTarget = document.body || document.documentElement;
      if (!rootTarget) return;

      const geom = loadGeom();

      const sidebar = document.createElement('div');
      sidebar.id = 'tt-playlist-sidebar';
      Object.assign(sidebar.style, {
        position:       'fixed',
        top:            geom.top,
        left:           geom.left || 'auto',
        right:          geom.right,
        width:          geom.width,
        height:         geom.height,
        minWidth:       '200px',
        minHeight:      '200px',
        background:     DARK_BG,
        color:          TEXT_PRI,
        padding:        '8px 10px',
        borderRadius:   '10px',
        zIndex:         '2147483645',
        display:        loadVis() ? 'flex' : 'none',
        flexDirection:  'column',
        boxShadow:      '0 10px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
        fontSize:       '14px',
        lineHeight:     '1.45',
        resize:         'both',
        overflow:       'hidden',
        fontFamily:     loadFFam(),
        boxSizing:      'border-box'
      });

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
      syncBtn.addEventListener('click', startAvatarBatchSync);

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

      // Clear
      const clearBtn = mkBtn('Clear', '#7e0a0a');
      clearBtn.title = 'Clear playlist';
      clearBtn.addEventListener('click', () => {
        GM_deleteValue(STORAGE_LIST);
        GM_deleteValue(STORAGE_SCROLL);
        GM_deleteValue(STORAGE_LAST_INDEX);
        GM_deleteValue(STORAGE_SELECTED_CAT);
        playlist         = [];
        currentIndex     = -1;
        selectedCategory = '';
        renderList();
        updateSyncButtonLabel();
      });

      btnGroup.append(uploadBtn, syncBtn, avatarOnlyBtn, colBtn, clearBtn);
      header.append(titleArea, btnGroup);
      sidebar.appendChild(header);

      // --- Search & Category Controls ---
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
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderList();
      });

      const clearSearchBtn = mkBtn('✕', 'transparent');
      clearSearchBtn.style.padding = '3px 6px';
      clearSearchBtn.title = 'Clear search';
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        renderList();
      });

      searchRow.append(searchInput, clearSearchBtn);
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
        renderList();
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
        sidebar.style.fontFamily = famSelect.value;
        renderList();
      });

      fontRow.append(lblSz, sizeSelect, lblFont, famSelect);
      sidebar.appendChild(fontRow);

      // --- List Viewport ---
      const listContainer = el('div', {
        id: 'tt-playlist-listcontainer',
        style: { flex: '1', overflowY: 'auto', overflowX: 'hidden', paddingRight: '2px' }
      });
      listContainer.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
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

    /***************************************************************************
     * Render List
     ***************************************************************************/
    function renderList() {
      createSidebar();
      const sidebar       = document.getElementById('tt-playlist-sidebar');
      const listContainer = document.getElementById('tt-playlist-listcontainer');
      if (!listContainer || !sidebar) return;

      refreshCategoryDropdown();

      sidebar.style.display = loadVis() ? 'flex' : 'none';
      sidebar.style.fontFamily = loadFFam();
      listContainer.replaceChildren();

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

      const cols         = loadCols();
      const fSize        = loadFSize();
      const fFam         = loadFFam();
      const isAvatarOnly = loadAvatarOnly();
      const currentUser  = getCurrentUsername();
      const observer     = getAvatarObserver(listContainer);

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
      displayItems.forEach((item) => {
        const cat = item.category || 'General';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat).push(item);
      });

      grouped.forEach((itemsInCat, categoryName) => {
        if (!selectedCategory && (grouped.size > 1 || categoryName !== 'General')) {
          const catHeader = el('div', {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 6px 4px 6px', marginTop: '8px', marginBottom: '4px',
              borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '11px',
              fontWeight: '700', color: TIKTOK_CYAN, textTransform: 'uppercase',
              letterSpacing: '0.4px', userSelect: 'none'
            }
          }, [
            el('span', { textContent: `📁 ${categoryName}` }),
            el('span', {
              textContent: String(itemsInCat.length),
              style: {
                fontSize: '10px', fontWeight: 'normal', opacity: '0.7',
                background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '10px'
              }
            })
          ]);
          listContainer.appendChild(catHeader);
        }

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
        listContainer.appendChild(container);

        itemsInCat.forEach(({ username: u, originalIdx }) => {
          try {
            const isMatch = currentUser && (currentUser === u);
            const isLast  = originalIdx === currentIndex;
            const active  = isMatch || isLast;

            const row = document.createElement('a');
            row.href = `https://www.tiktok.com/@${encodeURIComponent(u)}`;
            row.title = `@${u} (${originalIdx + 1})`;
            row.className = 'tt-playlist-row' + (active ? ' tt-active' : '');
            row.dataset.index = String(originalIdx);
            row.dataset.username = u;

            if (isAvatarOnly) {
              Object.assign(row.style, {
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                padding:        '3px',
                borderRadius:   '50%',
                cursor:         'pointer',
                background:     'transparent',
                textDecoration: 'none',
                fontSize:       `${fSize}px`,
                fontFamily:     fFam,
                boxSizing:      'border-box'
              });
            } else {
              Object.assign(row.style, {
                display:        'flex',
                alignItems:     'center',
                gap:            '0.55em',
                minWidth:       '0',
                padding:        '0.3em 0.45em',
                borderBottom:   cols === 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                cursor:         'pointer',
                background:     active ? VIBRANT_PINK : 'transparent',
                color:          active ? '#ffffff' : '#ccc',
                fontWeight:     active ? '700' : 'normal',
                borderRadius:   '6px',
                textDecoration: 'none',
                transition:     'background 0.12s',
                fontSize:       `${fSize}px`,
                fontFamily:     fFam,
                lineHeight:     '1.3',
                boxSizing:      'border-box',
                borderLeft:     active ? `3px solid ${TIKTOK_CYAN}` : '3px solid transparent'
              });
            }

            row.onmouseenter = () => {
              if (originalIdx !== currentIndex && !isAvatarOnly) {
                row.style.background = '#2c2e3e';
                row.style.color = '#fff';
              }
            };
            row.onmouseleave = () => {
              if (originalIdx !== currentIndex && !isAvatarOnly) {
                row.style.background = 'transparent';
                row.style.color = '#ccc';
              }
            };

            row.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();

              saveIdx(originalIdx);

              document.querySelectorAll('.tt-playlist-row').forEach((r) => {
                r.classList.remove('tt-active');
                if (isAvatarOnly) {
                  const b = r.querySelector('.tt-playlist-avatar-box');
                  if (b) b.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
                } else {
                  r.style.background = 'transparent';
                  r.style.color = '#ccc';
                  r.style.fontWeight = 'normal';
                  r.style.borderLeft = '3px solid transparent';
                  const span = r.querySelector('.tt-playlist-label');
                  if (span && span.dataset.rawText) {
                    span.textContent = span.dataset.rawText;
                  }
                }
              });

              row.classList.add('tt-active');
              const box = row.querySelector('.tt-playlist-avatar-box');

              if (isAvatarOnly) {
                if (box) box.style.boxShadow = `0 0 0 3px ${VIBRANT_PINK}, 0 0 10px rgba(254, 44, 85, 0.7)`;
              } else {
                row.style.background = VIBRANT_PINK;
                row.style.color = '#ffffff';
                row.style.fontWeight = '700';
                row.style.borderLeft = `3px solid ${TIKTOK_CYAN}`;
                const activeSpan = row.querySelector('.tt-playlist-label');
                if (activeSpan && activeSpan.dataset.rawText) {
                  activeSpan.textContent = `▶ ${activeSpan.dataset.rawText}`;
                }
              }

              navigateTo(u);
            });

            // Avatar Box
            const avatarBox = document.createElement('div');
            avatarBox.className = 'tt-playlist-avatar-box';
            avatarBox.dataset.username = u;
            Object.assign(avatarBox.style, {
              width:          '2.35em',
              height:         '2.35em',
              minWidth:       '2.35em',
              minHeight:      '2.35em',
              borderRadius:   '50%',
              background:     '#2a2a38',
              flexShrink:     '0',
              overflow:       'hidden',
              position:       'relative',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              boxShadow:      active && isAvatarOnly
                ? `0 0 0 3px ${VIBRANT_PINK}, 0 0 10px rgba(254, 44, 85, 0.7)`
                : '0 1px 3px rgba(0,0,0,0.4)',
              transition:     'box-shadow 0.15s ease'
            });

            const placeholder = el('span', {
              className: 'tt-playlist-avatar-placeholder',
              textContent: (u[0] || 'T').toUpperCase(),
              style: {
                fontSize: '0.9em', fontWeight: '700', color: '#aaa',
                userSelect: 'none', lineHeight: '1'
              }
            });

            const img = document.createElement('img');
            img.className = 'tt-playlist-avatar-img';
            img.referrerPolicy = 'no-referrer';
            img.loading = 'lazy';
            Object.assign(img.style, {
              width:        '100%',
              height:       '100%',
              objectFit:    'cover',
              borderRadius: '50%',
              display:      'none'
            });

            img.onerror = () => {
              img.style.display = 'none';
              placeholder.style.display = 'flex';
            };

            avatarBox.append(placeholder, img);

            const cached = avatarCache[u];
            if (cached && cached !== 'NONE') {
              img.src = cached;
              img.style.display = 'block';
              placeholder.style.display = 'none';
            } else if (cached === 'NONE') {
              placeholder.style.display = 'flex';
              img.style.display = 'none';
            } else {
              observer.observe(avatarBox);
            }

            row.appendChild(avatarBox);

            if (!isAvatarOnly) {
              const rawText = `${originalIdx + 1}. @${u}`;
              const textSpan = el('span', {
                className: 'tt-playlist-label',
                textContent: active ? `▶ ${rawText}` : rawText,
                style: {
                  minWidth: '0', flex: '1', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis'
                }
              });
              textSpan.dataset.rawText = rawText;
              row.appendChild(textSpan);
            }

            container.appendChild(row);
          } catch (err) {
            console.warn('[TikTok Playlist] Skipping row error', err);
          }
        });
      });

      const savedScroll = parseInt(GM_getValue(STORAGE_SCROLL, 0), 10);
      if (Number.isFinite(savedScroll) && savedScroll > 0) {
        listContainer.scrollTop = savedScroll;
      }

      listContainer.onscroll = () => {
        GM_setValue(STORAGE_SCROLL, listContainer.scrollTop || 0);
      };

      harvestAvatarsFromDOM();
      updateSyncButtonLabel();
    }

    /***************************************************************************
     * Floating Controls & Upload
     ***************************************************************************/
    async function processBase64Queue(items) {
      for (const item of items) {
        if (avatarCache[item.username] && avatarCache[item.username].startsWith('data:image')) {
          continue;
        }
        if (item.avatarUrl) {
          const base64 = await convertUrlToBase64(item.avatarUrl);
          if (base64 && base64.startsWith('data:image')) {
            cacheAvatar(item.username, base64);
            broadcastAvatarUpdate(item.username, base64);
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    }

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

        parsedData.forEach((item) => {
          if (item.avatarUrl && !avatarCache[item.username]) {
            avatarCache[item.username] = item.avatarUrl;
            idbPut(item.username, item.avatarUrl);
          }
        });

        try {
          window.localStorage.setItem(STORAGE_AVATARS, JSON.stringify(avatarCache));
        } catch (_) {}

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

        processBase64Queue(parsedData);
      };
      reader.readAsText(file);
    }

    function updateToggleBtn() {
      const toggleBtn = document.getElementById('tt-playlist-toggle-btn');
      if (!toggleBtn) return;
      const vis = loadVis();
      toggleBtn.textContent = vis ? '◀' : '▶';
      toggleBtn.title       = vis ? 'Hide Playlist' : 'Show Playlist';
    }

    function initControls() {
      if (document.getElementById('tt-playlist-controls')) return;
      const rootTarget = document.body || document.documentElement;
      if (!rootTarget) return;

      const controls = el('div', {
        id: 'tt-playlist-controls',
        style: {
          position: 'fixed', top: '14px', right: '260px', zIndex: '2147483646',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px'
        }
      });

      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((evt) => {
        controls.addEventListener(evt, (e) => e.stopPropagation());
      });

      const fileInput = el('input', { type: 'file', accept: '.txt,.md,.tsv', style: { display: 'none' } });
      const uploadLabel = el('label', {
        title: 'Upload grouped or TSV playlist (.txt, .md, .tsv)',
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
        title: loadVis() ? 'Hide Playlist' : 'Show Playlist',
        style: {
          minWidth: '32px', minHeight: '28px', fontSize: '12px',
          border: `1px solid ${BTN_BORDER}`, borderRadius: '4px',
          cursor: 'pointer', background: BTN_BG, color: TEXT_PRI,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: '1', touchAction: 'manipulation', boxSizing: 'border-box'
        }
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

      controls.append(uploadLabel, toggleBtn);
      rootTarget.appendChild(controls);

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
        sidebar.style.fontFamily = loadFFam();
      }
      updateToggleBtn();
    }

    function hydrateStateFromKV() {
      const stored = loadList();
      playlist = stored && stored.length ? normalizePlaylist(stored) : [];
      currentIndex = loadIdx();
      selectedCategory = String(GM_getValue(STORAGE_SELECTED_CAT, '') || '');
    }

    let lastPath = window.location.pathname;
    let harvestTimer = null;

    function scheduleDomWork() {
      if (!document.getElementById('tt-playlist-controls')) initControls();
      if (!document.getElementById('tt-playlist-sidebar')) {
        createSidebar();
        renderList();
      }

      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        setTimeout(() => {
          harvestAvatarsFromDOM();
          renderList();
        }, 400);
      }

      if (!harvestTimer) {
        harvestTimer = setTimeout(() => {
          harvestTimer = null;
          harvestAvatarsFromDOM();
        }, 1000);
      }
    }

    // Hook SPA history navigation cleanly
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
      if (!document.body) return;

      hydrateStateFromKV();
      createSidebar();
      renderList();
      initControls();

      const domObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length > 0) {
            scheduleDomWork();
            break;
          }
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('ttpl:kvHydrated', () => {
      hydrateStateFromKV();
      if (document.body) {
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
        initControls();
        renderList();
      }, 1000);
    });
  })();
})();