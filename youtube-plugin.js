// ==UserScript==
// @name         YouTube Ultimate Desktop Suite (Pake All-In-One)
// @version      12.0.0
// @description  Combined BelayTube, 30FPS Force, Auto-Videos, Player Stabilizer, Categorized Channels Hub, Lucky Playlist (Lyrics/Karaoke/EQ/PotPlayer/AIEx), and Unhook Suite.
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// ============================================================================
// MODULE 0: WEBVIEW2 / PAKE COMPATIBILITY SHIM & GLOBAL DEFAULTS
// ============================================================================
(function () {
  'use strict';

  if (!window.location.hostname.endsWith("youtube.com")) return;

  // --- 90% Global Zoom ---
  const zoomStyle = document.createElement('style');
  zoomStyle.id = 'yt-desktop-global-zoom';
  zoomStyle.textContent = `
    html {
      zoom: 0.9 !important;
    }
  `;
  (document.head || document.documentElement).appendChild(zoomStyle);

  // --- GM_* Polyfill ---
  window.unsafeWindow = window;

  window.GM_setValue = function (key, val) {
    try {
      localStorage.setItem('yt_suite_' + key, JSON.stringify(val));
    } catch (e) {}
  };

  window.GM_getValue = function (key, defaultVal) {
    try {
      const raw = localStorage.getItem('yt_suite_' + key);
      return raw !== null ? JSON.parse(raw) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  };

  window.GM_deleteValue = function (key) {
    try {
      localStorage.removeItem('yt_suite_' + key);
    } catch (e) {}
  };

  window.GM_addStyle = function (css) {
    const style = document.createElement('style');
    style.textContent = css;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    } else {
      window.addEventListener('DOMContentLoaded', () => document.head.appendChild(style), { once: true });
    }
    return style;
  };

  window.GM_xmlhttpRequest = function (details) {
    const controller = new AbortController();
    fetch(details.url, {
      method: details.method || 'GET',
      headers: details.headers || {},
      body: details.data || undefined,
      signal: controller.signal,
    })
      .then(async (res) => {
        const responseText = await res.text();
        let response = responseText;
        if (details.responseType === 'json') {
          try { response = JSON.parse(responseText); } catch (e) { response = null; }
        }
        if (details.onload) {
          details.onload({
            status: res.status,
            statusText: res.statusText,
            finalUrl: res.url,
            responseText,
            response,
            responseHeaders: [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\r\n'),
          });
        }
      })
      .catch((err) => {
        if (details.onerror) details.onerror(err);
      });
    return { abort: () => controller.abort() };
  };
})();

// ============================================================================
// MODULE 1: DISABLE 60 FPS (FORCE 30 FPS)
// ============================================================================
(function () {
  'use strict';
  const filterMimeType = (originalFn, type) => {
    if (!type) return originalFn(type);
    const match = type.match(/(?:framerate|fps)=(\d+)/);
    if (match && parseInt(match[1], 10) > 30) {
      return false;
    }
    return originalFn(type);
  };

  const patchMediaSource = (source) => {
    if (source && source.isTypeSupported) {
      const orig = source.isTypeSupported.bind(source);
      Object.defineProperty(source, 'isTypeSupported', {
        value: (type) => filterMimeType(orig, type),
        configurable: true,
        enumerable: true,
        writable: true
      });
    }
  };

  if (window.MediaSource) patchMediaSource(window.MediaSource);
  if (window.ManagedMediaSource) patchMediaSource(window.ManagedMediaSource);

  if (HTMLMediaElement.prototype.canPlayType) {
    const origCanPlay = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
      return filterMimeType(origCanPlay.bind(this), type);
    };
  }
})();

// ============================================================================
// MODULE 2: AUTO-REDIRECT CHANNELS TO /VIDEOS
// ============================================================================
(function () {
  'use strict';
  function checkAndRedirect() {
    const path = window.location.pathname;
    const channelRootRegex = /^\/(@[^/]+|c\/[^/]+|channel\/[^/]+|user\/[^/]+)\/?$/i;
    if (channelRootRegex.test(path)) {
      const cleanPath = path.replace(/\/$/, '');
      const targetUrl = cleanPath + '/videos' + window.location.search;
      window.location.replace(targetUrl);
    }
  }

  checkAndRedirect();
  window.addEventListener('yt-navigate-start', checkAndRedirect);
  window.addEventListener('yt-navigate-finish', checkAndRedirect);

  const origPush = history.pushState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    checkAndRedirect();
  };
  const origRepl = history.replaceState;
  history.replaceState = function () {
    origRepl.apply(this, arguments);
    checkAndRedirect();
  };
  window.addEventListener('popstate', checkAndRedirect);
})();

// ============================================================================
// MODULE 3: PLAYER STABILIZER & POPUP CINEMA MODE
// ============================================================================
(function () {
  'use strict';
  const CONFIG = {
    MIN_PLAYER_WIDTH: 854,
    TRAILER_WINDOW_NAME: 'trailer_viewer',
    EXTRA_HIDDEN_SELECTORS: [
      '.ytp-ce-element',
      '.ytp-pause-overlay',
      '.ytp-endscreen-content',
    ],
  };

  const isTrailerViewer = window.name === CONFIG.TRAILER_WINDOW_NAME;

  const globalFixCSS = `
    .player-container-background,
    .player-container-background-image {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
    ytd-watch-flexy,
    ytd-watch-flexy #player-container-outer,
    ytd-watch-flexy #player-container-inner,
    ytd-watch-flexy #player,
    ytd-watch-flexy #primary {
      transition: none !important;
      animation: none !important;
    }
    ytd-watch-flexy:not([theater]):not([fullscreen]) {
      --ytd-watch-flexy-min-player-width: ${CONFIG.MIN_PLAYER_WIDTH}px;
    }
  `;

  const popupCinemaCSS = `
    html[trailer-cinema] body {
      overflow: hidden !important;
      background: #000 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    html[trailer-cinema] #masthead-container,
    html[trailer-cinema] ytd-masthead,
    html[trailer-cinema] #secondary,
    html[trailer-cinema] #below,
    html[trailer-cinema] #comments,
    html[trailer-cinema] #chat,
    html[trailer-cinema] ytd-miniplayer,
    html[trailer-cinema] #cinematics,
    html[trailer-cinema] ytd-cinematics,
    html[trailer-cinema] #guide,
    html[trailer-cinema] #guide-wrapper,
    html[trailer-cinema] ${CONFIG.EXTRA_HIDDEN_SELECTORS.join(',\n    html[trailer-cinema] ')} {
      display: none !important;
    }
    html[trailer-cinema] #page-manager {
      margin-top: 0 !important;
    }
    html[trailer-cinema] ytd-watch-flexy,
    html[trailer-cinema] #columns,
    html[trailer-cinema] #primary,
    html[trailer-cinema] #primary-inner {
      padding: 0 !important;
      margin: 0 !important;
      max-width: 100vw !important;
      width: 100vw !important;
      height: 100vh !important;
    }
    html[trailer-cinema] #player {
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    html[trailer-cinema] #player-container-outer,
    html[trailer-cinema] #player-container-inner,
    html[trailer-cinema] #player-container,
    html[trailer-cinema] #ytd-player,
    html[trailer-cinema] #movie_player {
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
    }
    html[trailer-cinema] video.html5-main-video {
      object-fit: contain !important;
    }
  `;

  GM_addStyle(globalFixCSS);
  if (isTrailerViewer) GM_addStyle(popupCinemaCSS);

  function updateCinemaState() {
    if (!isTrailerViewer) return;
    if (location.pathname.startsWith('/watch')) {
      document.documentElement.setAttribute('trailer-cinema', 'true');
    } else {
      document.documentElement.removeAttribute('trailer-cinema');
    }
  }

  if (isTrailerViewer) {
    updateCinemaState();
    window.addEventListener('yt-navigate-finish', updateCinemaState);
    window.addEventListener('popstate', updateCinemaState);
  }
})();

// ============================================================================
// MODULE 4: BELAYTUBE LOGO REPLACER
// ============================================================================
(function () {
  'use strict';
  GM_addStyle(`
    a#logo yt-icon,
    a#logo ytd-logo,
    a#logo > *:not(#belaytube-container) {
      display: none !important;
    }
    #belaytube-container {
      display: flex;
      align-items: center;
      height: 100%;
    }
    #belaytube-icon {
      width: 28px;
      height: 20px;
      margin-right: 6px;
      flex-shrink: 0;
      transform: translateY(1px);
    }
    .belaytube-text {
      font-family: "YouTube Sans", "Roboto", "Arial", sans-serif !important;
      font-weight: 700 !important;
      font-size: 19px !important;
      letter-spacing: -0.4px !important;
      color: var(--yt-spec-text-primary, #fff);
      line-height: 1;
    }
    a#logo {
      display: flex !important;
      align-items: center !important;
    }
  `);

  function buildLogoElement() {
    const NS = 'http://www.w3.org/2000/svg';
    const container = document.createElement('div');
    container.id = 'belaytube-container';

    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'belaytube-icon';
    svg.setAttribute('viewBox', '0 0 29 20');

    const redPath = document.createElementNS(NS, 'path');
    redPath.setAttribute('d', 'M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z');
    redPath.setAttribute('fill', '#FF0000');

    const whitePath = document.createElementNS(NS, 'path');
    whitePath.setAttribute('d', 'M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z');
    whitePath.setAttribute('fill', '#FFFFFF');

    svg.append(redPath, whitePath);

    const text = document.createElement('span');
    text.className = 'belaytube-text';
    text.textContent = 'BelayTube';

    container.append(svg, text);
    return container;
  }

  function replaceLogo() {
    document.querySelectorAll('a#logo').forEach((link) => {
      if (!link.querySelector('#belaytube-container')) {
        link.appendChild(buildLogoElement());
      }
    });
  }

  window.addEventListener('DOMContentLoaded', replaceLogo);
  window.addEventListener('yt-navigate-finish', replaceLogo);
  setInterval(replaceLogo, 1500);
})();

// ============================================================================
// MODULE 5: UNHOOK ENGINE & TOGGLES (Integrated into Sidebar)
// ============================================================================
const YtUnhook = {
  panelElement: null,
  styleElement: null,

  defaultSettings: {
    enabled: true,
    hideHomeFeed: false,
    hideVideoSidebar: true,
    hideRecommended: true,
    hideLiveChat: true,
    hidePlaylist: true,
    hideFundraiser: true,
    hideEndScreenFeed: true,
    hideEndScreenCards: true,
    hideShorts: true,
    hideComments: false,
    hideMixes: true,
    hideMerch: true,
    hideVideoInfo: false,
    hideTopHeader: false,
    hideNotifications: false,
    hideInaptSearch: true,
    hideExplore: true,
    hideMoreFromYt: true,
    hideSubscriptions: true,
    disableAutoplay: true,
    disableAnnotations: true
  },

  settings: {},

  init() {
    this.settings = { ...this.defaultSettings, ...(GM_getValue('unhook_settings') || {}) };
    this.applyCSS();
    this.buildUI();
    this.startWatchers();
  },

  save() {
    GM_setValue('unhook_settings', this.settings);
    this.applyCSS();
  },

  applyCSS() {
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'yt-unhook-dynamic-style';
      (document.head || document.documentElement).appendChild(this.styleElement);
    }

    if (!this.settings.enabled) {
      this.styleElement.textContent = '';
      return;
    }

    const cssRules = [];
    const s = this.settings;

    if (s.hideHomeFeed) {
      cssRules.push(`
        ytd-browse[page-subtype="home"] #contents,
        ytd-browse[page-subtype="home"] #primary { display: none !important; }
      `);
    }

    if (s.hideVideoSidebar) {
      cssRules.push(`
        #secondary.ytd-watch-flexy,
        ytd-watch-flexy #secondary { display: none !important; }
      `);
    } else {
      if (s.hideRecommended) {
        cssRules.push(`
          #secondary.ytd-watch-flexy #items,
          #related #items { display: none !important; }
        `);
      }
      if (s.hideLiveChat) {
        cssRules.push(`
          #chat, #chat-container, ytd-live-chat-frame { display: none !important; }
        `);
      }
      if (s.hidePlaylist) {
        cssRules.push(`
          ytd-playlist-panel-renderer, #playlist.ytd-watch-flexy { display: none !important; }
        `);
      }
      if (s.hideFundraiser) {
        cssRules.push(`
          #donation-shelf, ytd-donation-shelf-renderer { display: none !important; }
        `);
      }
    }

    if (s.hideEndScreenFeed) {
      cssRules.push(`
        .ytp-endscreen-content,
        .ytp-ce-videowall,
        .html5-endscreen { display: none !important; }
      `);
    }

    if (s.hideEndScreenCards) {
      cssRules.push(`
        .ytp-ce-element,
        .ytp-ce-covering-overlay { display: none !important; }
      `);
    }

    if (s.hideShorts) {
      cssRules.push(`
        ytd-rich-section-renderer:has(a[href*="/shorts"]),
        ytd-reel-shelf-renderer,
        ytd-guide-entry-renderer:has(a[href*="/shorts"]),
        ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]),
        a[title="Shorts"] { display: none !important; }
      `);
    }

    if (s.hideComments) {
      cssRules.push(`
        #comments, ytd-comments { display: none !important; }
      `);
    }

    if (s.hideMixes) {
      cssRules.push(`
        ytd-compact-radio-renderer,
        ytd-radio-renderer,
        ytd-rich-item-renderer:has(a[href*="start_radio=1"]) { display: none !important; }
      `);
    }

    if (s.hideMerch) {
      cssRules.push(`
        ytd-merch-shelf-renderer,
        #ticket-shelf,
        ytd-ticket-shelf-renderer { display: none !important; }
      `);
    }

    if (s.hideVideoInfo) {
      cssRules.push(`
        #above-the-fold #top-row,
        #description,
        ytd-video-primary-info-renderer,
        ytd-video-secondary-info-renderer { display: none !important; }
      `);
    }

    if (s.hideTopHeader) {
      cssRules.push(`
        #masthead-container,
        ytd-masthead { display: none !important; }
        #page-manager { margin-top: 0 !important; }
      `);
    } else if (s.hideNotifications) {
      cssRules.push(`
        ytd-notification-topbar-button-renderer,
        #notification-button { display: none !important; }
      `);
    }

    if (s.hideInaptSearch) {
      cssRules.push(`
        ytd-search ytd-shelf-renderer,
        ytd-search ytd-horizontal-card-list-renderer { display: none !important; }
      `);
    }

    if (s.hideExplore) {
      cssRules.push(`
        ytd-guide-section-renderer:has(a[href*="/feed/trending"]),
        a[href*="/feed/trending"] { display: none !important; }
      `);
    }

    if (s.hideMoreFromYt) {
      cssRules.push(`
        ytd-guide-section-renderer:nth-of-type(4) { display: none !important; }
      `);
    }

    if (s.hideSubscriptions) {
      cssRules.push(`
        ytd-guide-entry-renderer:has(a[href*="/feed/subscriptions"]),
        ytd-mini-guide-entry-renderer:has(a[href*="/feed/subscriptions"]) { display: none !important; }
      `);
    }

    if (s.disableAnnotations) {
      cssRules.push(`
        .ytp-iv-video-content,
        .iv-module { display: none !important; }
      `);
    }

    this.styleElement.textContent = cssRules.join('\n');
  },

  startWatchers() {
    setInterval(() => {
      if (this.settings.enabled && this.settings.disableAutoplay) {
        const autoNavBtn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
        if (autoNavBtn) autoNavBtn.click();
      }
    }, 2000);
  },

  buildUI() {
    if (this.panelElement) return;

    const panel = document.createElement('div');
    panel.id = 'yt-unhook-panel';
    Object.assign(panel.style, {
      display: 'none',
      flexDirection: 'column',
      flex: '1',
      overflowY: 'auto',
      gap: '6px',
      padding: '8px 4px 60px 4px',
      color: '#f1f1f1',
      fontSize: '12px',
      scrollbarWidth: 'thin'
    });

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:6px;margin-bottom:6px;';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:#ff3366;">
        <span>Unhook</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button id="unhook-master-toggle" style="background:${this.settings.enabled ? '#00c853' : '#616161'};color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;font-weight:700;">
          ${this.settings.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
    `;
    panel.appendChild(header);

    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'display:flex;flex-direction:column;gap:5px;';

    const items = [
      { key: 'hideHomeFeed', label: 'Hide Home Feed' },
      { key: 'hideVideoSidebar', label: 'Hide Video Sidebar', children: [
        { key: 'hideRecommended', label: 'Hide Recommended' },
        { key: 'hideLiveChat', label: 'Hide Live Chat' },
        { key: 'hidePlaylist', label: 'Hide Playlist' },
        { key: 'hideFundraiser', label: 'Hide Fundraiser' },
      ]},
      { key: 'hideEndScreenFeed', label: 'Hide End Screen Feed' },
      { key: 'hideEndScreenCards', label: 'Hide End Screen Cards' },
      { key: 'hideShorts', label: 'Hide Shorts' },
      { key: 'hideComments', label: 'Hide Comments' },
      { key: 'hideMixes', label: 'Hide Mixes' },
      { key: 'hideMerch', label: 'Hide Merch, Tickets, Offers' },
      { key: 'hideVideoInfo', label: 'Hide Video Info' },
      { key: 'hideTopHeader', label: 'Hide Top Header', children: [
        { key: 'hideNotifications', label: 'Hide Notifications' }
      ]},
      { key: 'hideInaptSearch', label: 'Hide Inapt Search Results' },
      { key: 'hideExplore', label: 'Hide Explore, Trending' },
      { key: 'hideMoreFromYt', label: 'Hide More from YouTube' },
      { key: 'hideSubscriptions', label: 'Hide Subscriptions' },
      { key: 'disableAutoplay', label: 'Disable Autoplay' },
      { key: 'disableAnnotations', label: 'Disable Annotations' },
    ];

    const makeRow = (key, label, isChild = false) => {
      const row = document.createElement('label');
      row.style.cssText = `
        display:flex;align-items:center;justify-content:space-between;
        padding:4px 6px;border-radius:6px;background:rgba(255,255,255,0.03);
        cursor:pointer;margin-left:${isChild ? '16px' : '0px'};
        border-left:${isChild ? '2px solid rgba(255,255,255,0.15)' : 'none'};
      `;
      row.onmouseenter = () => row.style.background = 'rgba(255,255,255,0.08)';
      row.onmouseleave = () => row.style.background = 'rgba(255,255,255,0.03)';

      const span = document.createElement('span');
      span.textContent = label;
      span.style.color = isChild ? '#bbb' : '#eee';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!this.settings[key];
      chk.style.cursor = 'pointer';

      chk.addEventListener('change', () => {
        this.settings[key] = chk.checked;
        this.save();
      });

      row.append(span, chk);
      return row;
    };

    items.forEach((it) => {
      listContainer.appendChild(makeRow(it.key, it.label, false));
      if (it.children) {
        it.children.forEach((c) => listContainer.appendChild(makeRow(c.key, c.label, true)));
      }
    });

    panel.appendChild(listContainer);

    header.querySelector('#unhook-master-toggle').addEventListener('click', (e) => {
      this.settings.enabled = !this.settings.enabled;
      e.target.textContent = this.settings.enabled ? 'ON' : 'OFF';
      e.target.style.background = this.settings.enabled ? '#00c853' : '#616161';
      this.save();
    });

    this.panelElement = panel;
  }
};

// ============================================================================
// MODULE 6: LUCKY PLAYLIST + LYRICS + POTPLAYER + AIEX + AUDIO EQ
// ============================================================================
(function () {
  'use strict';

  if (window._ytLuckyInitialized) return;
  window._ytLuckyInitialized = true;

  try {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  } catch (e) {}

  const ANCHOR_CFG = { leftOffset: 5, topOffset: 56, debounceMs: 300, zIndex: 1000 };
  const PTB_CFG = {
    DELAY_MS: 900,
    MAX_RESULTS: 5,
    INNERTUBE_KEY: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    INNERTUBE_CLIENT: { clientName: 'WEB', clientVersion: '2.20240101.00.00' }
  };

  const AI_MODEL_OPTIONS = {
    gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    openrouter: ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat', 'anthropic/claude-3.5-haiku'],
    groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant'],
    cerebras: ['gpt-oss-120b', 'llama3.1-8b', 'llama-3.3-70b']
  };

  const AI_DEFAULTS = {
    provider: 'gemini',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash-lite',
    openrouterApiKey: '',
    openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
    groqApiKey: '',
    groqModel: 'llama-3.3-70b-versatile',
    cerebrasApiKey: '',
    cerebrasModel: 'gpt-oss-120b',
    typewriterEnabled: true,
    typewriterSpeed: 10
  };

  let aiSettings = { ...AI_DEFAULTS, ...(GM_getValue('yt_lucky_ai_settings') || {}) };
  function saveAiSettings() { GM_setValue('yt_lucky_ai_settings', aiSettings); }

  GM_addStyle(`
    ytd-watch-flexy[flexy] #player { margin-left: 0 !important; }
    ytd-watch-flexy #primary.ytd-watch-flexy { margin-left: 0 !important; padding-left: ${ANCHOR_CFG.leftOffset}px !important; }
    ytd-watch-flexy #columns.ytd-watch-flexy { margin-left: 0 !important; padding-left: 0 !important; }
    #yt-anchor-scroll-top { position: fixed; bottom: 44px; right: 16px; z-index: ${ANCHOR_CFG.zIndex + 10}; background: rgba(0,0,0,0.65); color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font: 600 10px/1.4 "YouTube Sans", Arial, sans-serif; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.4); transition: background .15s; display: none; }
    #yt-anchor-scroll-top:hover { background: rgba(0,0,0,0.85); }
    #yt-anchor-spacer { display: none; width: 100%; flex-shrink: 0; }

    #ptb-panel { position: relative; width: 100%; flex: 1; background: transparent; border: none; font-family: 'Roboto', sans-serif; color: #f1f1f1; overflow-y: auto; display: none; flex-direction: column; padding-top: 10px; }
    #ptb-header { background:#ff0000; padding:10px 14px; display:flex; align-items:center; gap:10px; border-radius: 8px; flex-shrink:0; }
    #ptb-header svg { width:18px; height:18px; fill:#fff; flex-shrink:0; }
    #ptb-header-text h3 { margin:0; font-size:13px; font-weight:700; }
    #ptb-header-text p  { margin:2px 0 0; font-size:10px; opacity:.85; }
    #ptb-body { padding:14px 0px; display:flex; flex-direction:column; gap:10px; }
    #ptb-textarea { width:100%; height:100px; background:#1a1a1a; border:1px solid #333; border-radius:8px; color:#f1f1f1; font-size:12px; padding:10px; resize:vertical; box-sizing:border-box; }
    #ptb-name-row { display:flex; gap:8px; align-items:flex-end; }
    #ptb-name { flex:1; background:#1a1a1a; border:1px solid #333; border-radius:8px; color:#f1f1f1; font-size:12px; padding:8px 10px; box-sizing:border-box; }
    #ptb-run { padding:9px 16px; background:#ff0000; color:#fff; border:none; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
    #ptb-run:hover { background:#cc0000; }
    #ptb-progress-wrap { display:none; flex-direction:column; gap:6px; }
    #ptb-progress-wrap.visible { display:flex; }
    #ptb-progress-bar-bg { width:100%; height:4px; background:#272727; border-radius:2px; overflow:hidden; }
    #ptb-progress-bar { height:100%; background:#ff0000; width:0%; transition:width .3s ease; }
    #ptb-progress-label { font-size:11px; color:#aaa; display:flex; justify-content:space-between; }
    #ptb-result { display:none; flex-direction:column; gap:8px; }
    #ptb-result.visible { display:flex; }
    .ptb-url-box { background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:10px; font-size:11px; color:#4fc3f7; word-break:break-all; cursor:pointer; }
    #ptb-result-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .ptb-action-btn { flex:1; padding:8px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; border:none; }
    #ptb-toast { position:fixed; bottom:84px; right:24px; background:#272727; color:#f1f1f1; padding:8px 16px; border-radius:8px; font-size:12px; z-index:100000; opacity:0; transition:opacity .2s; pointer-events:none; }
    #ptb-toast.show { opacity:1; }

    #yt-lucky-lyrics-panel { position: relative; width: 100%; flex: 1; background: transparent; display: none; flex-direction: column; overflow: hidden; padding-top: 10px; --lyrics-active-size: 20px; }
    #lyrics-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink:0; position:relative; }
    #lyrics-header-title { font-weight: 700; font-size: 14px; color: #fff; }
    .lyrics-controls-row { display: flex; gap: 4px; }
    .lyrics-mini-btn { background: rgba(255,255,255,0.1); border: none; color: white; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; transition: background 0.2s; }
    .lyrics-mini-btn:hover { background: rgba(255,255,255,0.25); }
    .lyrics-mini-btn.active { background: #e91e63; color: #fff; }
    #lyrics-content { flex: 1; overflow-y: auto; padding: 10px 10px 60px 10px; scrollbar-width: none; scroll-behavior: smooth; position: relative; }
    #lyrics-content::-webkit-scrollbar { display: none; }
    .lyrics-loading { padding: 40px 20px; text-align: center; color: #aaa; font-style: italic; font-size: 12px; }

    #lyrics-internal-toast { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 6px 12px; border-radius: 12px; font-size: 11px; font-weight: bold; pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 20; }
    #lyrics-internal-toast.show { opacity: 1; }

    .lyrics-line {
      opacity: 0.4; color: #fff !important; font-size: 16px !important; font-weight: 600 !important;
      padding: 8px 0 !important; margin: 4px 0 !important; cursor: pointer !important;
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); transform-origin: left center; line-height: 1.4;
    }
    .lyrics-line:hover { opacity: 0.7; }
    .lyrics-line.karaoke-active {
      opacity: 1 !important; font-size: var(--lyrics-active-size) !important; font-weight: 800 !important;
      transform: scale(1.02); color: #fff !important; text-shadow: 0 2px 12px rgba(255,255,255,0.2);
    }

    #yt-aiex-panel, #yt-aisettings-panel {
      display: none; flex-direction: column; flex: 1; overflow-y: auto; gap: 8px; padding-top: 10px; color: #f1f1f1;
    }
    #aiex-content {
      flex: 1; overflow-y: auto; padding: 10px 4px 60px 4px; line-height: 1.6; font-size: 13px;
      color: #ddd; word-break: break-word; scrollbar-width: thin;
    }
    #aiex-content strong { color: #0288d1; font-weight: 700; }
    #aiex-content em { color: #ba68c8; }
    #aiex-content code { background: #242424; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 11px; }
    .yt-loading-pulse {
      display: inline-block; width: 10px; height: 10px; background-color: #0288d1;
      border-radius: 50%; animation: yt-pulse 1.2s infinite cubic-bezier(0.66, 0, 1, 1); margin-right: 6px;
    }
    @keyframes yt-pulse { 0% { transform: scale(0.8); opacity: 0.5; } 50% { transform: scale(1.4); opacity: 1; } 100% { transform: scale(0.8); opacity: 0.5; } }

    .yt-ai-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .yt-ai-group label { font-size: 11px; color: #aaa; font-weight: 600; }
    .yt-ai-group input, .yt-ai-group select {
      background: #181818; border: 1px solid #333; color: #fff; padding: 6px 8px;
      border-radius: 6px; font-size: 11px; box-sizing: border-box; outline: none;
    }
    .yt-ai-group input:focus, .yt-ai-group select:focus { border-color: #0288d1; }
  `);

  // --- Lyrics Subsystem ---
  const YtLyrics = {
    panelElement: null, currentLyrics: [], lineElements: [], currentVideoId: null,
    apiOrder: ['LRCLIB', 'Genius', 'Lyrics.ovh', 'Textyl.co', 'Some Random API'],
    preferredApi: '', karaokeMode: true, catcherMode: false, isFetching: false,
    lastActiveIndex: -1, karaokeRaf: null, toastTimeout: null,
    syncOffset: parseFloat(localStorage.getItem('ytLyrics_offset')) || 0.15,
    activeFontSize: parseInt(localStorage.getItem('ytLyrics_fontSize')) || 20,
    geniusCredentials: { accessToken: 'ic8x2s4DuKQMZeUO-tbEJj7mImVhEg0nzWfXX0Bzt8VUdE8y586DnZ-HUbolc3o2' },

    init() {
      this.preferredApi = GM_getValue('preferredApi', this.apiOrder[0]);
      this.karaokeMode = localStorage.getItem('ytLyrics_karaoke') !== '0';
      this.buildUI();
      this.startKaraokeLoop();
    },
    buildUI() {
      if (this.panelElement) return;
      const panel = document.createElement('div');
      panel.id = 'yt-lucky-lyrics-panel';
      panel.style.setProperty('--lyrics-active-size', this.activeFontSize + 'px');
      panel.innerHTML = `
        <div id="lyrics-header">
          <span id="lyrics-header-title">🎵 Lyrics</span>
          <div class="lyrics-controls-row">
            <button id="lyrics-btn-font" class="lyrics-mini-btn" title="Adjust Font Size">Aa</button>
            <button id="lyrics-btn-minus" class="lyrics-mini-btn" title="Delay Lyrics (-100ms)">-</button>
            <button id="lyrics-btn-plus" class="lyrics-mini-btn" title="Advance Lyrics (+100ms)">+</button>
            <button id="lyrics-btn-catcher" class="lyrics-mini-btn" title="Lyrics Catcher (Click line to Sync)">🎵C</button>
            <button id="lyrics-btn-sync" class="lyrics-mini-btn" title="Toggle Real-Time Sync (Karaoke Mode)">K</button>
            <button id="lyrics-btn-cycle" class="lyrics-mini-btn" title="Cycle Lyrics API">🔄</button>
          </div>
          <div id="lyrics-font-panel" style="display:none; position:absolute; right:0px; top:36px; background:#222; border:1px solid #444; border-radius:8px; padding:10px; z-index:10; flex-direction:column; gap:8px; width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <label style="font-size:10px; color:#aaa; display:flex; justify-content:space-between;">Size: <span id="lyrics-font-val">${this.activeFontSize}px</span></label>
            <input type="range" id="lyrics-font-slider" min="14" max="48" step="1" value="${this.activeFontSize}" style="width:100%;">
            <button id="lyrics-font-reset" style="background:#d32f2f; color:#fff; border:none; border-radius:4px; padding:4px; cursor:pointer; font-size:10px;">Reset Default</button>
          </div>
        </div>
        <div id="lyrics-content"><div class="lyrics-loading">Waiting for track...</div></div>
        <div id="lyrics-internal-toast"></div>
      `;
      this.panelElement = panel;

      setTimeout(() => {
        this.updateControlsUI();
        const addEvt = (id, evt, fn) => { const el = panel.querySelector(id); if (el) el.addEventListener(evt, fn); };

        addEvt('#lyrics-btn-sync', 'click', () => {
          this.karaokeMode = !this.karaokeMode;
          if (this.karaokeMode) this.catcherMode = false;
          localStorage.setItem('ytLyrics_karaoke', this.karaokeMode ? '1' : '0');
          this.updateControlsUI();
          if (this.karaokeMode) {
            this.startKaraokeLoop();
            if (this.lastActiveIndex >= 0 && this.lineElements[this.lastActiveIndex]) this.highlightLine(this.lastActiveIndex, true);
          } else {
            this.lineElements.forEach((el) => el.classList.remove('karaoke-active'));
            this.lastActiveIndex = -1;
          }
        });

        addEvt('#lyrics-btn-catcher', 'click', () => {
          this.catcherMode = !this.catcherMode;
          if (this.catcherMode) {
            this.karaokeMode = false;
            localStorage.setItem('ytLyrics_karaoke', '0');
            this.lineElements.forEach((el) => el.classList.remove('karaoke-active'));
            this.lastActiveIndex = -1;
            this.showToast('Catcher ON: Click any line to sync');
          }
          this.updateControlsUI();
        });

        addEvt('#lyrics-btn-plus', 'click', () => {
          this.syncOffset += 0.1;
          localStorage.setItem('ytLyrics_offset', this.syncOffset);
          this.showToast(`Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
        });

        addEvt('#lyrics-btn-minus', 'click', () => {
          this.syncOffset -= 0.1;
          localStorage.setItem('ytLyrics_offset', this.syncOffset);
          this.showToast(`Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
        });

        addEvt('#lyrics-btn-font', 'click', () => {
          const fp = this.panelElement.querySelector('#lyrics-font-panel');
          fp.style.display = fp.style.display === 'none' ? 'flex' : 'none';
        });

        addEvt('#lyrics-font-slider', 'input', (e) => {
          this.activeFontSize = e.target.value;
          this.panelElement.style.setProperty('--lyrics-active-size', this.activeFontSize + 'px');
          this.panelElement.querySelector('#lyrics-font-val').textContent = this.activeFontSize + 'px';
          localStorage.setItem('ytLyrics_fontSize', this.activeFontSize);
        });

        addEvt('#lyrics-font-reset', 'click', () => {
          this.activeFontSize = 20;
          this.panelElement.querySelector('#lyrics-font-slider').value = 20;
          this.panelElement.style.setProperty('--lyrics-active-size', '20px');
          this.panelElement.querySelector('#lyrics-font-val').textContent = '20px';
          localStorage.setItem('ytLyrics_fontSize', '20');
        });

        addEvt('#lyrics-btn-cycle', 'click', () => {
          let idx = this.apiOrder.indexOf(this.preferredApi);
          this.preferredApi = this.apiOrder[(idx + 1) % this.apiOrder.length];
          GM_setValue('preferredApi', this.preferredApi);
          this.updateControlsUI();
          this.fetchLyrics(true);
        });
      }, 100);
    },
    updateControlsUI() {
      const get = (id) => this.panelElement.querySelector(id);
      if (get('#lyrics-btn-sync')) get('#lyrics-btn-sync').classList.toggle('active', this.karaokeMode);
      if (get('#lyrics-btn-catcher')) get('#lyrics-btn-catcher').classList.toggle('active', this.catcherMode);
      if (get('#lyrics-btn-cycle')) get('#lyrics-btn-cycle').title = `Cycle Lyrics API (Current: ${this.preferredApi})`;
    },
    showToast(msg) {
      let t = this.panelElement.querySelector('#lyrics-internal-toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
    },
    onVideoChange(videoId, forceFetch = false) {
      this.currentLyrics = [];
      this.lineElements = [];
      this.lastActiveIndex = -1;
      const content = this.panelElement?.querySelector('#lyrics-content');
      if (content) content.innerHTML = '<div class="lyrics-loading">Loading new track...</div>';

      if (videoId !== this.currentVideoId || forceFetch) {
        this.currentVideoId = videoId;
        if (this.panelElement && this.panelElement.style.display === 'flex') {
          clearTimeout(this.fetchTimeout);
          this.fetchTimeout = setTimeout(() => this.fetchLyrics(), 1500);
        }
      }
    },
    onShow() {
      const videoId = new URLSearchParams(window.location.search).get('v');
      if (videoId && (videoId !== this.currentVideoId || this.currentLyrics.length === 0)) {
        this.currentVideoId = videoId;
        clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(() => this.fetchLyrics(), 500);
      }
    },
    async fetchLyrics(force = false) {
      if (this.isFetching && !force) return;
      this.isFetching = true;

      const fetchId = this.currentVideoId;
      const content = this.panelElement.querySelector('#lyrics-content');
      content.innerHTML = '<div class="lyrics-loading">Searching for lyrics...</div>';

      try {
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, h2.slim-video-metadata-title');
        let videoTitle = titleEl ? titleEl.textContent : document.title.replace(' - YouTube', '');
        videoTitle = videoTitle.replace(/^\(\d+\)\s*/, '').trim();

        const songInfo = this.extractSongInfo(videoTitle);
        const pIdx = this.apiOrder.indexOf(this.preferredApi);
        const orderedApis = [this.apiOrder[pIdx], ...this.apiOrder.slice(0, pIdx), ...this.apiOrder.slice(pIdx + 1)];
        const apiFns = {
          'LRCLIB': this.tryLRCLIB.bind(this),
          'Genius': this.tryGeniusAPI.bind(this),
          'Lyrics.ovh': this.tryLyricsOVH.bind(this),
          'Textyl.co': this.tryTextylAPI.bind(this),
          'Some Random API': this.trySomeRandomAPI.bind(this)
        };

        let lyrics = null;
        let source = null;
        for (const apiName of orderedApis) {
          if (this.currentVideoId !== fetchId) { this.isFetching = false; return; }
          lyrics = await apiFns[apiName](songInfo);
          if (lyrics && lyrics.length > 0) { source = apiName; break; }
        }

        if (this.currentVideoId !== fetchId) { this.isFetching = false; return; }

        if (lyrics && lyrics.length > 0) {
          this.currentLyrics = this.cleanLyrics(lyrics);
          this.renderLyricsDOM();
          const header = this.panelElement.querySelector('#lyrics-header-title');
          if (header) header.textContent = `🎵 Lyrics (${source})`;
        } else {
          content.innerHTML = '<div class="lyrics-loading" style="color:#ff4444;">No lyrics found.</div>';
        }
      } catch (e) {
        if (this.currentVideoId === fetchId) {
          content.innerHTML = '<div class="lyrics-loading" style="color:#ff4444;">Failed to load lyrics.</div>';
        }
      }
      this.isFetching = false;
    },
    renderLyricsDOM() {
      const content = this.panelElement.querySelector('#lyrics-content');
      content.innerHTML = '';
      this.lineElements = [];
      this.lastActiveIndex = -1;

      this.currentLyrics.forEach((line, index) => {
        const el = document.createElement('div');
        el.className = 'lyrics-line';
        el.textContent = line.text;
        el.addEventListener('click', () => {
          if (this.catcherMode) {
            if (line.time !== undefined) {
              const video = document.querySelector('video');
              if (video) {
                this.syncOffset = line.time - video.currentTime;
                localStorage.setItem('ytLyrics_offset', this.syncOffset);
                this.catcherMode = false;
                this.karaokeMode = true;
                localStorage.setItem('ytLyrics_karaoke', '1');
                this.updateControlsUI();
                this.startKaraokeLoop();
                this.showToast(`Synced! Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
              }
            } else {
              this.showToast('Line has no timestamp data!');
            }
          } else if (!this.karaokeMode) {
            this.highlightLine(index, true);
          } else {
            if (line.time !== undefined) {
              const video = document.querySelector('video');
              if (video) video.currentTime = line.time - this.syncOffset;
            }
          }
        });
        this.lineElements.push(el);
        content.appendChild(el);
      });
      const spacer = document.createElement('div');
      spacer.style.height = '60%';
      content.appendChild(spacer);
    },
    highlightLine(index, scrollIntoView = true) {
      if (this.lastActiveIndex >= 0 && this.lineElements[this.lastActiveIndex]) {
        this.lineElements[this.lastActiveIndex].classList.remove('karaoke-active');
      }
      this.lastActiveIndex = index;
      const targetEl = this.lineElements[index];
      if (targetEl) {
        targetEl.classList.add('karaoke-active');
        if (scrollIntoView) {
          const content = this.panelElement.querySelector('#lyrics-content');
          const offset = targetEl.offsetTop - (content.clientHeight / 2) + (targetEl.clientHeight / 2);
          content.scrollTo({ top: offset, behavior: 'smooth' });
        }
      }
    },
    startKaraokeLoop() {
      if (this.karaokeRaf) cancelAnimationFrame(this.karaokeRaf);

      const loop = () => {
        if (!this.karaokeMode || !this.panelElement || this.panelElement.style.display === 'none' || this.currentLyrics.length === 0) {
          this.karaokeRaf = requestAnimationFrame(loop);
          return;
        }
        const video = document.querySelector('video');
        if (!video || video.paused) {
          this.karaokeRaf = requestAnimationFrame(loop);
          return;
        }

        const time = video.currentTime + this.syncOffset;
        let activeIndex = -1;
        for (let i = 0; i < this.currentLyrics.length; i++) {
          const line = this.currentLyrics[i];
          const nextLine = this.currentLyrics[i + 1];
          if (line.time !== undefined) {
            if (time >= line.time && (!nextLine || nextLine.time === undefined || time < nextLine.time)) {
              activeIndex = i;
              break;
            }
          }
        }

        if (activeIndex !== -1 && activeIndex !== this.lastActiveIndex) {
          this.highlightLine(activeIndex, true);
        }
        this.karaokeRaf = requestAnimationFrame(loop);
      };
      this.karaokeRaf = requestAnimationFrame(loop);
    },
    cleanLyrics(lyricsArray) {
      if (lyricsArray.length > 0 && lyricsArray[0].text && lyricsArray[0].text.includes('Contributors')) lyricsArray.shift();
      return lyricsArray.filter((line) => {
        const text = line.text.trim();
        if (text.startsWith('[') && text.endsWith(']')) return false;
        if (text.length === 0) return false;
        return true;
      });
    },
    extractSongInfo(title) {
      let cleanTitle = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/(official video|official music video|lyrics|lyric video|audio|video|hd|4k|1080p|720p)/gi, '').replace(/[^\w\s\-&]/g, '').replace(/\s+/g, ' ').trim();
      const separators = [' - ', ' – ', ' — ', ' | ', ' • ', ' ~ ', ' by '];
      let artist = '';
      let song = cleanTitle;
      for (const sep of separators) {
        if (cleanTitle.includes(sep)) {
          const parts = cleanTitle.split(sep);
          if (parts.length >= 2) {
            artist = parts[0].trim();
            song = parts.slice(1).join(sep).trim();
            break;
          }
        }
      }
      if (!artist) {
        const featMatch = cleanTitle.match(/(.+?)\s+(?:ft|feat|featuring)\s+(.+)/i);
        if (featMatch) {
          artist = featMatch[1].trim();
          song = featMatch[2].trim();
        }
      }
      return { artist: artist || 'Unknown Artist', song: song || cleanTitle, cleanTitle: cleanTitle };
    },
    tryLRCLIB(songInfo) {
      return new Promise((resolve) => {
        const query = encodeURIComponent(`${songInfo.artist} ${songInfo.song}`);
        GM_xmlhttpRequest({
          method: 'GET', url: `https://lrclib.net/api/search?q=${query}`, timeout: 10000,
          onload: (res) => {
            if (res.status === 200) {
              try {
                const data = JSON.parse(res.responseText);
                if (data && data.length > 0) {
                  const best = data.find((d) => d.syncedLyrics);
                  if (best) resolve(this.parseLRCLyrics(best.syncedLyrics));
                  else if (data[0].plainLyrics) resolve(this.parseSimpleLyrics(data[0].plainLyrics));
                  else resolve(null);
                  return;
                }
              } catch (e) {}
            }
            resolve(null);
          },
          onerror: () => resolve(null), ontimeout: () => resolve(null)
        });
      });
    },
    parseLRCLyrics(lrcText) {
      const lines = lrcText.split('\n');
      const result = [];
      const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
      lines.forEach((line) => {
        const match = timeRegex.exec(line);
        if (match) {
          const min = parseInt(match[1], 10);
          const sec = parseInt(match[2], 10);
          const ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
          const time = min * 60 + sec + ms / 1000;
          const text = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
          if (text) result.push({ time, text });
        }
      });
      return result;
    },
    tryGeniusAPI(songInfo) {
      return new Promise((resolve) => {
        const query = encodeURIComponent(`${songInfo.artist} ${songInfo.song}`);
        GM_xmlhttpRequest({
          method: 'GET', url: `https://api.genius.com/search?q=${query}`, headers: { 'Authorization': `Bearer ${this.geniusCredentials.accessToken}` }, timeout: 10000,
          onload: (response) => {
            if (response.status === 200) {
              try {
                const data = JSON.parse(response.responseText);
                if (data.response.hits && data.response.hits.length > 0) {
                  const song = data.response.hits[0].result;
                  this.fetchGeniusLyrics(song.url).then((lyrics) => resolve(lyrics || null));
                } else resolve(null);
              } catch (e) { resolve(null); }
            } else resolve(null);
          },
          onerror: () => resolve(null), ontimeout: () => resolve(null)
        });
      });
    },
    async fetchGeniusLyrics(songUrl) {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'GET', url: songUrl, timeout: 15000,
          onload: (response) => {
            if (response.status === 200) {
              try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.responseText, 'text/html');
                const lyricsContainers = doc.querySelectorAll('[data-lyrics-container="true"]');
                let lyricsText = '';
                lyricsContainers.forEach((container) => {
                  const clone = container.cloneNode(true);
                  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
                  clone.querySelectorAll('*').forEach((el) => { if (el.tagName.toLowerCase() === 'a') el.replaceWith(el.textContent); });
                  lyricsText += clone.textContent + '\n\n';
                });
                if (lyricsText.trim()) resolve(this.parseSimpleLyrics(lyricsText));
                else resolve(null);
              } catch (e) { resolve(null); }
            } else resolve(null);
          },
          onerror: () => resolve(null), ontimeout: () => resolve(null)
        });
      });
    },
    tryLyricsOVH(songInfo) {
      return new Promise((resolve) => {
        const artist = encodeURIComponent(songInfo.artist);
        const title = encodeURIComponent(songInfo.song);
        GM_xmlhttpRequest({
          method: 'GET', url: `https://api.lyrics.ovh/v1/${artist}/${title}`, timeout: 10000,
          onload: (response) => {
            if (response.status === 200) {
              try {
                const data = JSON.parse(response.responseText);
                if (data.lyrics) resolve(this.parseSimpleLyrics(data.lyrics));
                else resolve(null);
              } catch (e) { resolve(null); }
            } else resolve(null);
          },
          onerror: () => resolve(null), ontimeout: () => resolve(null)
        });
      });
    },
    tryTextylAPI(songInfo) {
      return new Promise((resolve) => {
        const query = encodeURIComponent(`${songInfo.artist} ${songInfo.song}`);
        GM_xmlhttpRequest({
          method: 'GET', url: `https://api.textyl.co/api/lyrics?q=${query}`, timeout: 10000,
          onload: (response) => {
            if (response.status === 200) {
              try {
                const data = JSON.parse(response.responseText);
                if (data.lyrics) resolve(this.parseSimpleLyrics(data.lyrics));
                else resolve(null);
              } catch (e) { resolve(null); }
            } else resolve(null);
          },
          onerror: () => resolve(null), ontimeout: () => resolve(null)
        });
      });
    },
    trySomeRandomAPI(songInfo) {
      return new Promise((resolve) => {
        const artist = encodeURIComponent(songInfo.artist);
        const title = encodeURIComponent(songInfo.song);
        GM_xmlhttpRequest({
          method: 'GET', url: `https://some-random-api.com/lyrics?title=${title}&artist=${artist}`, timeout: 10000,
          onload: (response) => {
            if (response.status === 200) {
              try {
                const data = JSON.parse(response.responseText);
                if (data.lyrics) resolve(this.parseSimpleLyrics(data.lyrics));
                else resolve(null);
              } catch (e) { resolve(null); }
            } else resolve(null);
          },
          onerror: () => resolve(null), ontimeout: () => resolve(null)
        });
      });
    },
    parseSimpleLyrics(lyricsText) {
      const lines = lyricsText.split('\n').map((l) => l.replace(/\[\d+:\d+\.\d+\]\s*/, '').trim()).filter((l) => l.length > 0);
      return lines.map((l) => ({ text: l }));
    }
  };

  // --- AI Song Explainer (AIEx) ---
  let currentTypingId = 0;
  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^### (.*$)/gim, '<h4 style="color:#0288d1;margin:10px 0 4px 0;">$1</h4>')
      .replace(/^## (.*$)/gim, '<h3 style="color:#0288d1;margin:12px 0 6px 0;">$1</h3>')
      .replace(/^# (.*$)/gim, '<h2 style="color:#0288d1;margin:14px 0 8px 0;">$1</h2>')
      .replace(/\n/g, '<br>');
  }

  async function typeWriteHTML(element, htmlString, speed) {
    currentTypingId++;
    const myTypingId = currentTypingId;
    element.innerHTML = '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;

    async function processNode(node, parent) {
      if (myTypingId !== currentTypingId) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        let textNode = document.createTextNode('');
        parent.appendChild(textNode);
        for (let i = 0; i < text.length; i++) {
          if (myTypingId !== currentTypingId) break;
          textNode.textContent += text[i];
          const delay = speed + (Math.random() * 4 - 2);
          await new Promise((r) => setTimeout(r, delay));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const newElem = document.createElement(node.tagName);
        Array.from(node.attributes).forEach((attr) => newElem.setAttribute(attr.name, attr.value));
        parent.appendChild(newElem);
        for (let child of node.childNodes) {
          await processNode(child, newElem);
        }
      }
    }
    await processNode(tempDiv, element);
  }

  const YtAIExplainer = {
    panelElement: null,
    lastExplainedKey: '',

    init() {
      if (this.panelElement) return;
      const panel = document.createElement('div');
      panel.id = 'yt-aiex-panel';
      panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <span style="font-weight:bold; color:#0288d1; font-size:13px;">💡 Song Explainer (AIEx)</span>
          <button id="aiex-reload-btn" style="background:#0288d1; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:bold;">🔄 Explain</button>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px; padding-bottom:2px;">
          <div id="aiex-song-header" style="font-size:11px; color:#aaa; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; margin-right:8px;">No song active</div>
          <button id="aiex-copy-btn" title="Copy explanation" style="background:#333; color:#fff; border:none; border-radius:4px; padding:2px 7px; font-size:10px; cursor:pointer; flex-shrink:0;">📋 Copy</button>
        </div>
        <div id="aiex-content">Switch to the AIEx tab to view an insightful breakdown of the currently playing video/song.</div>
      `;
      this.panelElement = panel;

      panel.querySelector('#aiex-reload-btn').onclick = () => this.explainCurrentSong(true);
      const copyBtn = panel.querySelector('#aiex-copy-btn');
      copyBtn.onclick = () => {
        const content = panel.querySelector('#aiex-content');
        if (!content || !content.innerText.trim()) return;
        navigator.clipboard.writeText(content.innerText.trim()).then(() => {
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
        });
      };
    },

    getCurrentSong() {
      const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, h2.slim-video-metadata-title');
      let videoTitle = titleEl ? titleEl.textContent : document.title.replace(' - YouTube', '');
      videoTitle = videoTitle.replace(/^\(\d+\)\s*/, '').trim();
      return YtLyrics.extractSongInfo(videoTitle);
    },

    explainCurrentSong(force = false) {
      const info = this.getCurrentSong();
      if (!info || !info.song) {
        this.panelElement.querySelector('#aiex-content').innerHTML = '<span style="color:#888;">No active track title found on this page.</span>';
        return;
      }
      const trackKey = `${info.artist} - ${info.song}`;
      if (trackKey === this.lastExplainedKey && !force) return;

      this.lastExplainedKey = trackKey;
      this.panelElement.querySelector('#aiex-song-header').textContent = `Analyzing: "${info.song}" by ${info.artist}`;
      const content = this.panelElement.querySelector('#aiex-content');
      content.innerHTML = `<div><span class="yt-loading-pulse"></span> Analyzing meaning, composition & cultural context…</div>`;

      const prompt = `You are an elite musicologist and cultural critic. Analyze the song: "${info.song}" by "${info.artist}". Break down: 1. Core Meaning & Subtext, 2. Musical Composition & Nuances, 3. Cultural Impact & Relevance. Use clean Markdown.`;
      const provider = aiSettings.provider;

      const handleOutput = (text) => {
        const formatted = formatMarkdown(text);
        if (aiSettings.typewriterEnabled) {
          typeWriteHTML(content, formatted, aiSettings.typewriterSpeed || 10);
        } else {
          content.innerHTML = formatted;
        }
      };

      const handleError = (errMsg) => {
        content.innerHTML = `<span style="color:#ff5252;"><b>AI Error:</b> ${errMsg}</span><br><br><span style="color:#aaa;">Check API Key & Model in AI Settings (⚙️).</span>`;
      };

      if (provider === 'gemini') {
        if (!aiSettings.geminiApiKey) return handleError("Gemini API key is missing. Click ⚙️ to configure.");
        GM_xmlhttpRequest({
          method: 'POST',
          url: `https://generativelanguage.googleapis.com/v1beta/models/${aiSettings.geminiModel || 'gemini-2.5-flash-lite'}:generateContent`,
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': aiSettings.geminiApiKey },
          data: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
          responseType: 'json',
          timeout: 30000,
          onload: (res) => {
            const candidate = res.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (candidate) handleOutput(candidate.trim());
            else handleError(res.response?.error?.message || `HTTP ${res.status}`);
          },
          onerror: () => handleError("Network connection failure with Gemini."),
          ontimeout: () => handleError("Gemini request timed out.")
        });
        return;
      }

      const oaiConfigs = {
        openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: aiSettings.openrouterApiKey, model: aiSettings.openrouterModel },
        groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: aiSettings.groqApiKey, model: aiSettings.groqModel },
        cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', key: aiSettings.cerebrasApiKey, model: aiSettings.cerebrasModel }
      };

      const cfg = oaiConfigs[provider];
      if (!cfg || !cfg.key) return handleError(`${provider.toUpperCase()} API key missing.`);

      GM_xmlhttpRequest({
        method: 'POST',
        url: cfg.url,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
        data: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 2800
        }),
        responseType: 'json',
        timeout: 30000,
        onload: (res) => {
          const text = res.response?.choices?.[0]?.message?.content;
          if (text) handleOutput(text.trim());
          else handleError(res.response?.error?.message || `API Error: ${res.status}`);
        },
        onerror: () => handleError(`Network error contacting ${provider}.`),
        ontimeout: () => handleError(`${provider} request timed out.`)
      });
    }
  };

  // --- AI Settings Panel ---
  const YtAISettings = {
    panelElement: null,
    init() {
      if (this.panelElement) return;
      const panel = document.createElement('div');
      panel.id = 'yt-aisettings-panel';
      panel.innerHTML = `
        <div style="font-weight:bold; color:#0288d1; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px;">⚙️ AI Configuration</span>
          <button id="yt-ai-save-btn" style="background:#0288d1; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:bold;">Save</button>
        </div>
        <div style="overflow-y:auto; flex:1; padding-right:4px;">
          <div class="yt-ai-group">
            <label>Active Provider</label>
            <select id="yt-ai-cfg-provider">
              <option value="gemini" ${aiSettings.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
              <option value="openrouter" ${aiSettings.provider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
              <option value="groq" ${aiSettings.provider === 'groq' ? 'selected' : ''}>Groq</option>
              <option value="cerebras" ${aiSettings.provider === 'cerebras' ? 'selected' : ''}>Cerebras</option>
            </select>
          </div>
          <div id="yt-ai-group-gemini" class="yt-ai-provider-sub" style="display:${aiSettings.provider === 'gemini' ? 'block' : 'none'};">
            <div class="yt-ai-group"><label>Gemini API Key</label><input type="password" id="yt-ai-cfg-gemini-key" value="${aiSettings.geminiApiKey || ''}"></div>
            <div class="yt-ai-group"><label>Gemini Model</label><input type="text" id="yt-ai-cfg-gemini-model" value="${aiSettings.geminiModel}"></div>
          </div>
          <div id="yt-ai-group-openrouter" class="yt-ai-provider-sub" style="display:${aiSettings.provider === 'openrouter' ? 'block' : 'none'};">
            <div class="yt-ai-group"><label>OpenRouter API Key</label><input type="password" id="yt-ai-cfg-openrouter-key" value="${aiSettings.openrouterApiKey || ''}"></div>
            <div class="yt-ai-group"><label>OpenRouter Model</label><input type="text" id="yt-ai-cfg-openrouter-model" value="${aiSettings.openrouterModel}"></div>
          </div>
          <div id="yt-ai-group-groq" class="yt-ai-provider-sub" style="display:${aiSettings.provider === 'groq' ? 'block' : 'none'};">
            <div class="yt-ai-group"><label>Groq API Key</label><input type="password" id="yt-ai-cfg-groq-key" value="${aiSettings.groqApiKey || ''}"></div>
            <div class="yt-ai-group"><label>Groq Model</label><input type="text" id="yt-ai-cfg-groq-model" value="${aiSettings.groqModel}"></div>
          </div>
          <div id="yt-ai-group-cerebras" class="yt-ai-provider-sub" style="display:${aiSettings.provider === 'cerebras' ? 'block' : 'none'};">
            <div class="yt-ai-group"><label>Cerebras API Key</label><input type="password" id="yt-ai-cfg-cerebras-key" value="${aiSettings.cerebrasApiKey || ''}"></div>
            <div class="yt-ai-group"><label>Cerebras Model</label><input type="text" id="yt-ai-cfg-cerebras-model" value="${aiSettings.cerebrasModel}"></div>
          </div>
        </div>
      `;
      this.panelElement = panel;

      const pSel = panel.querySelector('#yt-ai-cfg-provider');
      pSel.onchange = () => {
        ['gemini', 'openrouter', 'groq', 'cerebras'].forEach((p) => {
          panel.querySelector(`#yt-ai-group-${p}`).style.display = pSel.value === p ? 'block' : 'none';
        });
      };

      panel.querySelector('#yt-ai-save-btn').onclick = () => {
        aiSettings.provider = pSel.value;
        aiSettings.geminiApiKey = panel.querySelector('#yt-ai-cfg-gemini-key').value.trim();
        aiSettings.geminiModel = panel.querySelector('#yt-ai-cfg-gemini-model').value.trim();
        aiSettings.openrouterApiKey = panel.querySelector('#yt-ai-cfg-openrouter-key').value.trim();
        aiSettings.openrouterModel = panel.querySelector('#yt-ai-cfg-openrouter-model').value.trim();
        aiSettings.groqApiKey = panel.querySelector('#yt-ai-cfg-groq-key').value.trim();
        aiSettings.groqModel = panel.querySelector('#yt-ai-cfg-groq-model').value.trim();
        aiSettings.cerebrasApiKey = panel.querySelector('#yt-ai-cfg-cerebras-key').value.trim();
        aiSettings.cerebrasModel = panel.querySelector('#yt-ai-cfg-cerebras-model').value.trim();
        saveAiSettings();
        alert('Settings Saved!');
      };
    }
  };

  // --- Anchor Edge Player ---
  const YtAnchor = {
    anchored: false, spacerEl: null, debounceTimer: null,
    q: (sel) => document.querySelector(sel),
    isWatch: () => location.pathname === '/watch',
    ensureSpacer() {
      if (this.spacerEl && this.spacerEl.isConnected) return this.spacerEl;
      this.spacerEl = document.getElementById('yt-anchor-spacer') || document.createElement('div');
      this.spacerEl.id = 'yt-anchor-spacer';
      const below = this.q('#below');
      if (below && below.parentNode) below.parentNode.insertBefore(this.spacerEl, below);
      return this.spacerEl;
    },
    anchor() {
      if (!this.isWatch()) return;
      const player = this.q('#movie_player');
      if (!player || player.style.position === 'fixed') return;

      const rect = player.getBoundingClientRect();
      const w = Math.round(rect.width || player.offsetWidth);
      const h = Math.round(rect.height || player.offsetHeight);

      player.style.position = 'fixed';
      player.style.left = ANCHOR_CFG.leftOffset + 'px';
      player.style.top = ANCHOR_CFG.topOffset + 'px';
      player.style.width = w + 'px';
      player.style.height = h + 'px';
      player.style.zIndex = String(ANCHOR_CFG.zIndex);

      const spacer = this.ensureSpacer();
      spacer.style.height = (ANCHOR_CFG.topOffset + h + 16) + 'px';
      spacer.style.display = 'block';

      const primary = this.q('#primary');
      if (primary) primary.style.paddingLeft = (ANCHOR_CFG.leftOffset + w + 16) + 'px';

      this.anchored = true;
      localStorage.setItem('yt_lucky_anchor_persisted', '1');
      this.updateUI();
    },
    unanchor() {
      const player = this.q('#movie_player');
      if (player) {
        player.style.position = '';
        player.style.left = '';
        player.style.top = '';
        player.style.width = '';
        player.style.height = '';
        player.style.zIndex = '';
      }
      const primary = this.q('#primary');
      if (primary) primary.style.paddingLeft = '';
      if (this.spacerEl) {
        this.spacerEl.style.display = 'none';
        this.spacerEl.style.height = '0';
      }
      this.anchored = false;
      localStorage.setItem('yt_lucky_anchor_persisted', '0');
      this.updateUI();
    },
    toggle() { this.anchored ? this.unanchor() : this.anchor(); },
    updateUI() {
      const btn = document.getElementById('yt-lucky-anchor-btn');
      if (btn) btn.textContent = this.anchored ? 'Anchor: ON' : 'Anchor: OFF';
      const scrollBtn = document.getElementById('yt-anchor-scroll-top');
      if (scrollBtn) scrollBtn.style.display = this.anchored ? 'block' : 'none';
    },
    init() {
      window.addEventListener('resize', () => { if (this.anchored) { this.unanchor(); this.anchor(); } });
      window.addEventListener('yt-navigate-finish', () => {
        if (!this.isWatch()) { if (this.anchored) this.unanchor(); return; }
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          if (localStorage.getItem('yt_lucky_anchor_persisted') === '1') {
            if (this.anchored) this.unanchor();
            this.anchor();
          } else {
            this.unanchor();
          }
        }, ANCHOR_CFG.debounceMs);
      });
      if (!document.getElementById('yt-anchor-scroll-top')) {
        const st = document.createElement('button');
        st.id = 'yt-anchor-scroll-top';
        st.textContent = '▲ Player';
        st.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        document.body.appendChild(st);
      }
    }
  };

  // --- PotPlayer Playlist Builder ---
  const YtPotPlayer = {
    state: { running: false, stopped: false, videoIds: [], matched: [], failed: [], total: 0, current: 0, resolvedUrl: '', playlistName: '' },
    panelElement: null,
    init() { this.buildUI(); },
    buildUI() {
      if (this.panelElement) return;
      const panel = document.createElement('div');
      panel.id = 'ptb-panel';
      panel.innerHTML = `
        <div id="ptb-header">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <div id="ptb-header-text"><h3>PotPlayer Playlist Builder</h3><p>Paste tracks → search → stream or save</p></div>
        </div>
        <div id="ptb-body">
          <textarea id="ptb-textarea" placeholder="Artist - Song Title&#10;One per line"></textarea>
          <div id="ptb-name-row">
            <input id="ptb-name" type="text" placeholder="PotPlayer Mix" />
            <button id="ptb-run">▶ Build</button>
          </div>
          <div id="ptb-result">
            <div id="ptb-result-title"></div>
            <div id="ptb-url-box" class="ptb-url-box">⏳ Ready...</div>
            <div id="ptb-result-actions">
              <button class="ptb-action-btn" id="ptb-copy-btn">📋 Copy URL</button>
              <button class="ptb-action-btn" id="ptb-m3u8-btn" style="background:#009688; color:#fff;">💾 Download .m3u8</button>
            </div>
          </div>
        </div>
      `;
      this.panelElement = panel;

      setTimeout(() => {
        const runBtn = panel.querySelector('#ptb-run');
        if (runBtn) runBtn.onclick = () => this.onRun();
        const copyBtn = panel.querySelector('#ptb-copy-btn');
        if (copyBtn) copyBtn.onclick = () => this.onCopy();
        const m3u8Btn = panel.querySelector('#ptb-m3u8-btn');
        if (m3u8Btn) m3u8Btn.onclick = () => this.onDownloadM3u8();
      }, 200);
    },
    async searchVideo(query) {
      const key = window.ytcfg?.get?.('INNERTUBE_API_KEY') || PTB_CFG.INNERTUBE_KEY;
      const resp = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { client: PTB_CFG.INNERTUBE_CLIENT }, query, params: 'EgIQAQ%3D%3D' }),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
      const videos = [];
      for (const section of contents) {
        for (const item of (section?.itemSectionRenderer?.contents ?? [])) {
          const vr = item?.videoRenderer;
          if (vr?.videoId) videos.push({ id: vr.videoId, title: vr.title?.runs?.[0]?.text ?? '' });
        }
      }
      return videos;
    },
    async onRun() {
      const text = this.panelElement.querySelector('#ptb-textarea').value;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;

      this.state.matched = [];
      this.state.videoIds = [];
      const box = this.panelElement.querySelector('#ptb-url-box');
      box.textContent = 'Searching videos...';

      for (let q of lines) {
        const vids = await this.searchVideo(q);
        if (vids.length) {
          this.state.videoIds.push(vids[0].id);
          this.state.matched.push(vids[0]);
        }
      }

      if (this.state.videoIds.length) {
        const url = `https://www.youtube.com/watch_videos?video_ids=${this.state.videoIds.slice(0, 50).join(',')}`;
        this.state.resolvedUrl = url;
        box.textContent = url;
        this.panelElement.querySelector('#ptb-result').style.display = 'flex';
      } else {
        box.textContent = 'No videos matched.';
      }
    },
    onCopy() {
      if (this.state.resolvedUrl) navigator.clipboard.writeText(this.state.resolvedUrl);
    },
    onDownloadM3u8() {
      if (!this.state.matched.length) return;
      let m3u8 = "#EXTM3U\n";
      this.state.matched.forEach((t) => {
        m3u8 += `#EXTINF:-1,${t.title}\nhttps://www.youtube.com/watch?v=${t.id}\n`;
      });
      const blob = new Blob([m3u8], { type: 'application/vnd.apple.mpegurl' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'playlist.m3u8';
      a.click();
    }
  };

  // --- Lucky Playlist Core System ---
  let _audioCtx = null;
  let eqSettings = {
    bass: parseFloat(localStorage.getItem('yt_lucky_eq_bass') || '0'),
    treble: parseFloat(localStorage.getItem('yt_lucky_eq_treble') || '0'),
    vol: parseFloat(localStorage.getItem('yt_lucky_eq_vol') || '1')
  };
  let _bassNode = null, _trebleNode = null, _volNode = null;

  function setupAudioNodes(video) {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (!video._ytLuckyAudioConnected && _audioCtx) {
      try {
        const source = _audioCtx.createMediaElementSource(video);
        _bassNode = _audioCtx.createBiquadFilter();
        _bassNode.type = 'lowshelf';
        _bassNode.frequency.value = 150;
        _bassNode.gain.value = eqSettings.bass;

        _trebleNode = _audioCtx.createBiquadFilter();
        _trebleNode.type = 'highshelf';
        _trebleNode.frequency.value = 4000;
        _trebleNode.gain.value = eqSettings.treble;

        _volNode = _audioCtx.createGain();
        _volNode.gain.value = eqSettings.vol;

        source.connect(_bassNode);
        _bassNode.connect(_trebleNode);
        _trebleNode.connect(_volNode);
        _volNode.connect(_audioCtx.destination);
        video._ytLuckyAudioConnected = true;
      } catch (e) {}
    }
  }

  let playlists = GM_getValue('yt_lucky_playlists', {});
  let activeTab = GM_getValue('yt_lucky_active_tab', null);
  let currentIndex = parseInt(GM_getValue('yt_lucky_last_index', '-1'), 10);
  let shuffleMode = localStorage.getItem('yt_lucky_shuffle') === '1';

  function savePlaylists() { GM_setValue('yt_lucky_playlists', playlists); }
  function saveActiveTab(tab) { GM_setValue('yt_lucky_active_tab', tab); activeTab = tab; }

  function switchSidebarView(view) {
    const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3');
    if (!sidebar) return;

    if (sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }

    const lc = document.getElementById('yt-lucky-listcontainer-v3');
    const tabs = document.getElementById('yt-lucky-tabs-holder-v3');
    const ptb = YtPotPlayer.panelElement;
    const lp = YtLyrics.panelElement;
    const aiex = YtAIExplainer.panelElement;
    const aiset = YtAISettings.panelElement;
    const unhook = YtUnhook.panelElement;

    if (lc) lc.style.display = 'none';
    if (tabs) tabs.style.display = 'none';
    if (ptb) ptb.style.display = 'none';
    if (lp) lp.style.display = 'none';
    if (aiex) aiex.style.display = 'none';
    if (aiset) aiset.style.display = 'none';
    if (unhook) unhook.style.display = 'none';

    if (view === 'LIST') {
      if (lc) lc.style.display = 'block';
      if (tabs) tabs.style.display = 'block';
    } else if (view === 'POTPLAYER') {
      if (ptb) ptb.style.display = 'flex';
    } else if (view === 'LYRICS') {
      if (lp) lp.style.display = 'flex';
      YtLyrics.onShow();
    } else if (view === 'AIEX') {
      if (aiex) aiex.style.display = 'flex';
      YtAIExplainer.explainCurrentSong();
    } else if (view === 'AISETTINGS') {
      if (aiset) aiset.style.display = 'flex';
    } else if (view === 'UNHOOK') {
      if (unhook) unhook.style.display = 'flex';
    }

    const unhookBtn = document.getElementById('yt-lucky-unhook-btn');
    if (unhookBtn) unhookBtn.style.background = view === 'UNHOOK' ? '#e91e63' : '#37474f';
  }

  function createSidebar() {
    if (document.getElementById('yt-lucky-playlist-sidebar-v3')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'yt-lucky-playlist-sidebar-v3';
    Object.assign(sidebar.style, {
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      height: '46vh',
      width: '420px',
      display: 'none',
      flexDirection: 'column',
      background: 'rgba(18,18,18,0.96)',
      color: '#fff',
      padding: '10px',
      borderRadius: '10px',
      zIndex: 999998,
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      fontSize: '13px',
      boxSizing: 'border-box'
    });

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;flex-shrink:0;margin-bottom:6px;';

    const title = document.createElement('span');
    title.textContent = '🎵 Lucky';
    title.style.cssText = 'font-weight:700;cursor:pointer;margin-right:4px;';
    title.onclick = () => switchSidebarView('LIST');

    const mkHBtn = (txt, bg, cb) => {
      const b = document.createElement('button');
      b.textContent = txt;
      Object.assign(b.style, { padding: '4px 7px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: bg, color: '#fff', fontSize: '11px', fontWeight: 'bold' });
      b.onclick = cb;
      return b;
    };

    const prevBtn = mkHBtn('Prev', '#cc7700', () => playOffset(-1));
    const nextBtn = mkHBtn('Next', '#0077cc', () => playOffset(1));
    const lyricsBtn = mkHBtn('Lyrics', '#689f38', () => switchSidebarView('LYRICS'));
    const ptbBtn = mkHBtn('B-Plist', '#e64a19', () => switchSidebarView('POTPLAYER'));
    const aiexBtn = mkHBtn('AIEx', '#0288d1', () => switchSidebarView('AIEX'));
    const aiSetBtn = mkHBtn('⚙️', '#455a64', () => switchSidebarView('AISETTINGS'));

    // --- REPLACED "PAGE: ON/OFF" WITH UNHOOK ---
    const unhookBtn = mkHBtn('Unhook', '#37474f', () => {
      const isOpen = YtUnhook.panelElement && YtUnhook.panelElement.style.display === 'flex';
      switchSidebarView(isOpen ? 'LIST' : 'UNHOOK');
    });
    unhookBtn.id = 'yt-lucky-unhook-btn';

    const anchorBtn = mkHBtn('Anchor: OFF', '#673ab7', () => YtAnchor.toggle());
    anchorBtn.id = 'yt-lucky-anchor-btn';

    header.append(title, prevBtn, nextBtn, lyricsBtn, ptbBtn, aiexBtn, aiSetBtn, unhookBtn, anchorBtn);
    sidebar.appendChild(header);

    if (YtPotPlayer.panelElement) sidebar.appendChild(YtPotPlayer.panelElement);
    if (YtLyrics.panelElement) sidebar.appendChild(YtLyrics.panelElement);
    if (YtAIExplainer.panelElement) sidebar.appendChild(YtAIExplainer.panelElement);
    if (YtAISettings.panelElement) sidebar.appendChild(YtAISettings.panelElement);
    if (YtUnhook.panelElement) sidebar.appendChild(YtUnhook.panelElement);

    const tabsHolder = document.createElement('div');
    tabsHolder.id = 'yt-lucky-tabs-holder-v3';
    sidebar.appendChild(tabsHolder);

    const listContainer = document.createElement('div');
    listContainer.id = 'yt-lucky-listcontainer-v3';
    listContainer.style.cssText = 'flex:1;overflow-y:auto;padding-right:4px;margin-top:6px;';
    sidebar.appendChild(listContainer);

    document.documentElement.appendChild(sidebar);
    renderPlaylists();
  }

  function playOffset(offset) {
    if (!activeTab || !playlists[activeTab]) return;
    const list = playlists[activeTab].lines || [];
    if (!list.length) return;

    currentIndex += offset;
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= list.length) currentIndex = 0;

    GM_setValue('yt_lucky_last_index', currentIndex);
    renderPlaylists();
    const query = list[currentIndex];
    if (query) {
      if (query.includes('http')) {
        const vid = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/);
        if (vid) window.location.href = `/watch?v=${vid[1]}`;
      } else {
        window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      }
    }
  }

  function renderPlaylists() {
    const holder = document.getElementById('yt-lucky-tabs-holder-v3');
    const container = document.getElementById('yt-lucky-listcontainer-v3');
    if (!holder || !container) return;

    holder.innerHTML = '';
    const keys = Object.keys(playlists);
    if (!keys.length) {
      container.innerHTML = '<div style="color:#888;padding:10px;">No playlists loaded. Click "+" to upload a .txt file.</div>';
    }

    const tabsBar = document.createElement('div');
    tabsBar.style.cssText = 'display:flex;gap:4px;overflow-x:auto;padding:4px 0;border-bottom:1px solid #333;';

    keys.forEach((k) => {
      const tab = document.createElement('span');
      tab.textContent = playlists[k].name;
      tab.style.cssText = `padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;background:${k === activeTab ? '#d32f2f' : '#222'};color:#fff;`;
      tab.onclick = () => { saveActiveTab(k); renderPlaylists(); switchSidebarView('LIST'); };
      tabsBar.appendChild(tab);
    });

    const addLabel = document.createElement('label');
    addLabel.textContent = '+';
    addLabel.title = 'Add .txt Playlist';
    addLabel.style.cssText = 'padding:2px 8px;border-radius:4px;background:#333;color:#fff;cursor:pointer;font-weight:bold;';
    const fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.accept = '.txt';
    fileInp.style.display = 'none';
    fileInp.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const r = new FileReader();
        r.onload = (ev) => {
          const lines = (ev.target.result || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const key = 'pl_' + Date.now();
          playlists[key] = { name: file.name.replace(/\.txt$/i, ''), lines };
          savePlaylists();
          saveActiveTab(key);
          renderPlaylists();
        };
        r.readAsText(file);
      }
    };
    addLabel.appendChild(fileInp);
    tabsBar.appendChild(addLabel);
    holder.appendChild(tabsBar);

    container.innerHTML = '';
    if (activeTab && playlists[activeTab]) {
      playlists[activeTab].lines.forEach((line, idx) => {
        const row = document.createElement('div');
        const isCur = idx === currentIndex;
        row.textContent = `${isCur ? '▶ ' : ''}${idx + 1}. ${line}`;
        row.style.cssText = `padding:5px 6px;border-bottom:1px solid #222;cursor:pointer;font-size:11px;background:${isCur ? '#e0f7fa' : 'transparent'};color:${isCur ? '#000' : '#fff'};font-weight:${isCur ? 'bold' : 'normal'};`;
        row.onclick = () => {
          currentIndex = idx;
          GM_setValue('yt_lucky_last_index', currentIndex);
          renderPlaylists();
          playOffset(0);
        };
        container.appendChild(row);
      });
    }
  }

  function initControls() {
    if (document.getElementById('yt-lucky-btn-launch')) return;
    const end = document.querySelector('ytd-masthead #end, #masthead #end');
    if (!end) return;

    const btn = document.createElement('button');
    btn.id = 'yt-lucky-btn-launch';
    btn.textContent = '🎵 Lucky';
    Object.assign(btn.style, {
      background: '#e91e63',
      color: '#fff',
      border: 'none',
      borderRadius: '14px',
      padding: '4px 10px',
      marginRight: '8px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 'bold'
    });

    btn.onclick = () => {
      createSidebar();
      const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
      sb.style.display = sb.style.display === 'none' ? 'flex' : 'none';
    };

    end.prepend(btn);
  }

  // --- Attach Watchers & Bootstrap ---
  window.addEventListener('DOMContentLoaded', () => {
    YtUnhook.init();
    YtLyrics.init();
    YtAIExplainer.init();
    YtAISettings.init();
    YtPotPlayer.init();
    YtAnchor.init();
    initControls();
    createSidebar();
  });

  const domObs = new MutationObserver(() => {
    initControls();
    const video = document.querySelector('video');
    if (video && !video._ytLuckyAttached) {
      video._ytLuckyAttached = true;
      video.addEventListener('playing', () => setupAudioNodes(video));
      video.addEventListener('ended', () => playOffset(1));
    }
  });

  domObs.observe(document.documentElement, { childList: true, subtree: true });
})();

// ============================================================================
// MODULE 7: CATEGORIZED CHANNELS HUB & PLAYLIST
// ============================================================================
(function () {
  'use strict';

  const SK_DATA = 'yt_hub_data';
  const SK_VIS = 'yt_hub_vis';
  const SK_COLS = 'yt_hub_cols';
  const SK_TAB_MODE = 'yt_hub_tab_mode';
  const SK_ACTIVE_TAB = 'yt_hub_active_tab';
  const SK_AVATARS = 'yt_hub_avatars';

  let channelGroups = [];
  let collapsedGroups = new Set();
  let avatarCache = GM_getValue(SK_AVATARS, {});

  const loadData = () => GM_getValue(SK_DATA, []);
  const saveData = (d) => GM_setValue(SK_DATA, d || []);
  const loadVis = () => GM_getValue(SK_VIS, false);
  const saveVis = (v) => GM_setValue(SK_VIS, !!v);

  function parseChannelsFile(content) {
    const lines = content.split(/\r?\n/);
    const groups = [];
    let curGroup = null;

    function getGroup(title) {
      let g = groups.find((x) => x.title.toLowerCase() === title.toLowerCase());
      if (!g) {
        g = { title: title, items: [] };
        groups.push(g);
      }
      return g;
    }

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('---')) continue;
      if (line.startsWith('# ') || line.startsWith('## ')) {
        const title = line.replace(/^#+\s+/, '').trim();
        curGroup = getGroup(title);
      } else {
        if (!curGroup) curGroup = getGroup('General');
        const str = line.replace(/^[-*+]\s+/, '').trim();
        if (str) {
          const handle = str.replace(/^@/, '').replace(/\s+/g, '');
          curGroup.items.push({
            name: str,
            slug: handle.toLowerCase(),
            url: `https://www.youtube.com/@${handle}/videos`
          });
        }
      }
    }
    return groups.filter((g) => g.items.length > 0);
  }

  function ensureSidebar() {
    if (document.getElementById('yt-hub-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'yt-hub-sidebar';
    Object.assign(sidebar.style, {
      position: 'fixed',
      top: '70px',
      right: '20px',
      width: '380px',
      height: '80vh',
      background: 'rgba(15,15,15,0.96)',
      color: '#f1f1f1',
      borderRadius: '12px',
      zIndex: 999997,
      display: loadVis() ? 'flex' : 'none',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.75)',
      backdropFilter: 'blur(10px)',
      overflow: 'hidden'
    });

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #333;';
    hdr.innerHTML = `
      <div style="font-weight:700;font-size:13px;color:#ff0000;display:flex;align-items:center;gap:6px;">
        <span>Channels Hub</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <label title="Upload .txt channels list" style="cursor:pointer;background:#222;padding:3px 8px;border-radius:6px;font-size:11px;">
          📂 <input type="file" accept=".txt,.md" style="display:none;" id="yt-hub-file-inp">
        </label>
        <button id="yt-hub-close" style="background:transparent;color:#fff;border:none;cursor:pointer;font-size:14px;">✕</button>
      </div>
    `;
    sidebar.appendChild(hdr);

    const vp = document.createElement('div');
    vp.id = 'yt-hub-list-viewport';
    vp.style.cssText = 'flex:1;overflow-y:auto;padding:8px 10px;';
    sidebar.appendChild(vp);

    document.documentElement.appendChild(sidebar);

    hdr.querySelector('#yt-hub-close').onclick = () => {
      sidebar.style.display = 'none';
      saveVis(false);
    };

    hdr.querySelector('#yt-hub-file-inp').onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const r = new FileReader();
        r.onload = (ev) => {
          channelGroups = parseChannelsFile(ev.target.result || '');
          saveData(channelGroups);
          renderHub();
        };
        r.readAsText(file);
      }
    };
  }

  function renderHub() {
    ensureSidebar();
    const vp = document.getElementById('yt-hub-list-viewport');
    if (!vp) return;
    vp.innerHTML = '';

    if (!channelGroups.length) {
      vp.innerHTML = '<div style="color:#777;padding:20px;text-align:center;">Click 📂 above to load your categorized channels file (.txt / .md).</div>';
      return;
    }

    channelGroups.forEach((grp) => {
      const gWrap = document.createElement('div');
      gWrap.style.marginBottom = '12px';

      const gHdr = document.createElement('div');
      gHdr.textContent = `${grp.title} (${grp.items.length})`;
      gHdr.style.cssText = 'font-weight:bold;font-size:12px;color:#aaa;padding:4px 0;border-bottom:1px solid #222;cursor:pointer;';
      gHdr.onclick = () => {
        if (collapsedGroups.has(grp.title)) collapsedGroups.delete(grp.title);
        else collapsedGroups.add(grp.title);
        renderHub();
      };
      gWrap.appendChild(gHdr);

      if (!collapsedGroups.has(grp.title)) {
        grp.items.forEach((item) => {
          const a = document.createElement('a');
          a.href = item.url;
          a.textContent = item.name;
          a.style.cssText = 'display:block;padding:4px 8px;color:#eee;text-decoration:none;font-size:12px;border-radius:4px;';
          a.onmouseenter = () => a.style.background = '#222';
          a.onmouseleave = () => a.style.background = 'transparent';
          gWrap.appendChild(a);
        });
      }

      vp.appendChild(gWrap);
    });
  }

  function initHubNav() {
    if (document.getElementById('yt-hub-toggle-btn')) return;
    const end = document.querySelector('ytd-masthead #end, #masthead #end');
    if (!end) return;

    const btn = document.createElement('button');
    btn.id = 'yt-hub-toggle-btn';
    btn.textContent = '◀ Hub';
    Object.assign(btn.style, {
      background: '#212121',
      color: '#f1f1f1',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '14px',
      padding: '4px 10px',
      marginRight: '8px',
      cursor: 'pointer',
      fontSize: '12px'
    });

    btn.onclick = () => {
      ensureSidebar();
      const sb = document.getElementById('yt-hub-sidebar');
      const isShow = sb.style.display === 'none';
      sb.style.display = isShow ? 'flex' : 'none';
      saveVis(isShow);
      if (isShow) renderHub();
    };

    end.prepend(btn);
  }

  // Keyboard Shortcut: Alt + Y to toggle Hub
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'y') {
      ensureSidebar();
      const sb = document.getElementById('yt-hub-sidebar');
      const isShow = sb.style.display === 'none';
      sb.style.display = isShow ? 'flex' : 'none';
      saveVis(isShow);
      if (isShow) renderHub();
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    channelGroups = loadData();
    initHubNav();
    ensureSidebar();
    renderHub();
  });

  const obs = new MutationObserver(() => initHubNav());
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
