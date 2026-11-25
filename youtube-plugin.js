// ==UserScript==
// @name         YouTube Lucky Pro + BelayTube Hub & Right Sidebar
// @namespace    http://tampermonkey.net/
// @version      8.2
// @description  Full-featured YouTube desktop right-sidebar layout, BelayTube logo, lyrics, AI, and playlist tools.
// @author       You
// @match        *://*.youtube.com/*
// @grant        none
// ==/UserScript==

(() => {
'use strict';

// ── Embed / ad-tracker guard ──
try {
  if (window.self !== window.top) {
    const isEmbed = window.location.pathname.startsWith('/embed/') ||
                    window.name.includes('ad') ||
                    window.location.host.includes('doubleclick');
    if (isEmbed) return;
  }
  if (window.location.pathname.startsWith('/v/')) return;
} catch (_) {}
if (window._ytLuckyInitialized) return;
window._ytLuckyInitialized = true;

// ── GM_* polyfills ──
if (typeof GM_addStyle === 'undefined') {
  window.GM_addStyle = css => {
    const s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
    return s;
  };
}

if (typeof GM_getValue === 'undefined') {
  window.GM_getValue = (k, d) => {
    try {
      const r = localStorage.getItem(k);
      if (r === null) return d;
      try { return JSON.parse(r); } catch(_) { return r; }
    } catch(_) { return d; }
  };
}

if (typeof GM_setValue === 'undefined') {
  window.GM_setValue = (k, v) => {
    try {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    } catch(_) {}
  };
}

if (typeof GM_xmlhttpRequest === 'undefined') {
  window.GM_xmlhttpRequest = opts => {
    const ctrl = new AbortController();
    const to = opts.timeout ? setTimeout(() => ctrl.abort(), opts.timeout) : null;
    const init = { method: opts.method || 'GET', headers: opts.headers || {}, signal: ctrl.signal };
    if (opts.data) init.body = opts.data;

    fetch(opts.url, init)
      .then(res => {
        if (to) clearTimeout(to);
        return res.text().then(text => {
          let payload = text;
          if (opts.responseType === 'json') {
            try { payload = JSON.parse(text); } catch(_) { payload = null; }
          }
          if (opts.onload) {
            opts.onload({ status: res.status, statusText: res.statusText, responseText: text, response: payload, finalUrl: res.url, readyState: 4 });
          }
        });
      })
      .catch(err => {
        if (to) clearTimeout(to);
        if (err.name === 'AbortError') {
          if (opts.ontimeout) opts.ontimeout();
        } else {
          if (opts.onerror) opts.onerror(err);
        }
      });
    return { abort: () => ctrl.abort() };
  };
}

// ── Visibility spoofing ──
try {
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
} catch(e) {}

const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

/* ================= CONSTANTS ================= */
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
function saveAiSettings() {
  GM_setValue('yt_lucky_ai_settings', aiSettings);
}

/* ================= STYLES ================= */
GM_addStyle(`
  :root {
    --yt-plugin-sidebar-w: ${localStorage.getItem('ytLucky_sidebarWidth') || '420'}px;
  }

/* --- ANCHOR STYLES --- */
  ytd-watch-flexy[flexy] #player { margin-left: 0 !important; }
  ytd-watch-flexy #primary.ytd-watch-flexy { margin-left: 0 !important; padding-left: 5px !important; }
  ytd-watch-flexy #columns.ytd-watch-flexy { margin-left: 0 !important; padding-left: 0 !important; }
  #yt-anchor-scroll-top { position: fixed; bottom: 44px; right: 16px; z-index: 2000; background: rgba(0,0,0,0.65); color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font: 600 10px/1.4 "YouTube Sans", Arial, sans-serif; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.4); transition: background .15s; display: none; }
  #yt-anchor-scroll-top:hover { background: rgba(0,0,0,0.85); }
  #yt-anchor-spacer { display: none; width: 100%; flex-shrink: 0; }

  /* Push YouTube content left when sidebar is open */
  body.yt-sidebar-open {
    margin-right: var(--yt-plugin-sidebar-w) !important;
    box-sizing: border-box;
  }

  /* Right Sidebar Styles */
  #yt-lucky-playlist-sidebar-v3 {
    position: fixed !important;
    top: var(--yt-plugin-bar-h, 40px) !important;
    right: 0 !important;
    bottom: 0 !important;
    left: auto !important;
    width: var(--yt-plugin-sidebar-w) !important;
    height: auto !important;
    display: flex;
    flex-direction: column;
    background: rgba(18,18,18,0.98);
    color: #fff;
    padding: 6px 8px;
    border-radius: 0 !important;
    border-left: 1px solid #222;
    z-index: 2147483645;
    box-shadow: -4px 0 24px rgba(0,0,0,0.7);
    font-size: 14px;
    box-sizing: border-box;
    overflow: hidden;
  }
  
  /* Slim dark scrollbars & tight column divider for Parallel Mode */
  #yt-lucky-playlist-sidebar-v3 *,
  .yt-lucky-pdisplay-col,
  #yt-lucky-listcontainer-v3 {
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.16) transparent;
  }
  #yt-lucky-playlist-sidebar-v3 *::-webkit-scrollbar,
  .yt-lucky-pdisplay-col::-webkit-scrollbar,
  #yt-lucky-listcontainer-v3::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  #yt-lucky-playlist-sidebar-v3 *::-webkit-scrollbar-track,
  .yt-lucky-pdisplay-col::-webkit-scrollbar-track,
  #yt-lucky-listcontainer-v3::-webkit-scrollbar-track {
    background: transparent;
  }
  #yt-lucky-playlist-sidebar-v3 *::-webkit-scrollbar-thumb,
  .yt-lucky-pdisplay-col::-webkit-scrollbar-thumb,
  #yt-lucky-listcontainer-v3::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.16);
    border-radius: 2px;
  }
  #yt-lucky-playlist-sidebar-v3 *::-webkit-scrollbar-thumb:hover,
  .yt-lucky-pdisplay-col::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.3);
  }
  .yt-lucky-pdisplay-col:last-child {
    border-right: none !important;
  }

  /* Left Edge Width Resize Handle */
  .resize-handle-pl {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    bottom: 0 !important;
    width: 6px !important;
    height: auto !important;
    transform: none !important;
    cursor: ew-resize !important;
    background: rgba(255,255,255,0.06);
    border-radius: 0 !important;
    z-index: 20;
  }
  .resize-handle-pl:hover {
    background: rgba(255,0,0,0.5);
  }

  /* Top controls */
  #yt-lucky-controls-v3-wrapper {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 2147483646;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    background: #0f0f0f;
    border-bottom: 1px solid #222;
    align-items: center;
    width: 100vw !important;
    max-width: 100vw !important;
    box-sizing: border-box;
    min-height: 40px;
  }
  #yt-lucky-controls-v3-wrapper .yt-lucky-ctrl-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    width: 100%;
    justify-content: flex-start;
  }
  #yt-lucky-controls-v3-wrapper button {
    padding: 4px 9px !important;
    font-size: 11px !important;
    border-radius: 6px !important;
    border: 1px solid #333 !important;
    background: #1f1f1f !important;
    color: #eee !important;
    cursor: pointer;
    min-height: 26px;
    line-height: 1;
    flex-shrink: 0;
  }
  #yt-lucky-controls-v3-wrapper button:hover {
    background: #2a2a2a !important;
  }
  #yt-lucky-controls-v3-wrapper input[type="text"] {
    flex: 1;
    min-width: 80px;
    padding: 4px 8px !important;
    border: 1px solid #333 !important;
    border-radius: 6px !important;
    font-size: 11px !important;
    background: #1a1a1a !important;
    color: #eee !important;
    outline: none;
  }
  #yt-lucky-controls-v3-wrapper input[type="text"]::placeholder {
    color: #777;
  }

  /* Push YouTube's masthead down */
  ytd-masthead, #masthead-container, ytm-mobile-topbar-renderer {
    top: var(--yt-plugin-bar-h, 0px) !important;
  }
  ytd-app, ytm-app {
    padding-top: var(--yt-plugin-bar-h, 0px) !important;
  }

  /* PotPlayer */
  #ptb-panel {
    position: relative;
    width: 100%;
    flex: 1;
    background: transparent;
    border: none;
    font-family: 'Roboto', sans-serif;
    color: #f1f1f1;
    overflow-y: auto;
    display: none;
    flex-direction: column;
    padding-top: 10px;
  }
  #ptb-header {
    background: #ff0000;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 8px;
    flex-shrink: 0;
  }
  #ptb-header svg { width: 18px; height: 18px; fill: #fff; flex-shrink: 0; }
  #ptb-header-text h3 { margin: 0; font-size: 13px; font-weight: 700; }
  #ptb-header-text p { margin: 2px 0 0; font-size: 10px; opacity: .85; }
  #ptb-body { padding: 14px 0; display: flex; flex-direction: column; gap: 10px; }
  #ptb-textarea { width: 100%; height: 100px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #f1f1f1; font-size: 12px; padding: 10px; resize: vertical; box-sizing: border-box; }
  #ptb-name-row { display: flex; gap: 8px; align-items: flex-end; }
  #ptb-name { flex: 1; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #f1f1f1; font-size: 12px; padding: 8px 10px; box-sizing: border-box; }
  #ptb-run { padding: 9px 16px; background: #ff0000; color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
  #ptb-progress-wrap { display: none; flex-direction: column; gap: 6px; }
  #ptb-progress-wrap.visible { display: flex; }
  #ptb-progress-bar-bg { width: 100%; height: 4px; background: #272727; border-radius: 2px; overflow: hidden; }
  #ptb-progress-bar { height: 100%; background: #ff0000; width: 0%; transition: width .3s ease; }
  #ptb-progress-label { font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
  #ptb-result { display: none; flex-direction: column; gap: 8px; }
  #ptb-result.visible { display: flex; }
  .ptb-url-box { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 10px; font-size: 11px; color: #4fc3f7; word-break: break-all; cursor: pointer; }
  #ptb-result-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .ptb-action-btn { flex: 1; padding: 8px 10px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; }
  #ptb-toast { position: fixed; bottom: 84px; right: 24px; background: #272727; color: #f1f1f1; padding: 8px 16px; border-radius: 8px; font-size: 12px; z-index: 100000; opacity: 0; transition: opacity .2s; pointer-events: none; }
  #ptb-toast.show { opacity: 1; }

  /* Lyrics */
  #yt-lucky-lyrics-panel { position: relative; width: 100%; flex: 1; background: transparent; display: none; flex-direction: column; overflow: hidden; padding-top: 10px; --lyrics-active-size: 20px; --lyrics-base-size: 14px; --lyrics-align: center; }
  #lyrics-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; position: relative; }
  #lyrics-header-title { font-weight: 700; font-size: 14px; color: #fff; }
  .lyrics-controls-row { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .lyrics-mini-btn { background: rgba(255,255,255,0.1); border: none; color: white; min-width: 44px; height: 36px; padding: 0 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; transition: background .2s; white-space: nowrap; }
  .lyrics-mini-btn:hover { background: rgba(255,255,255,0.25); }
  .lyrics-mini-btn.active { background: #e91e63; color: #fff; }
  #lyrics-content { flex: 1; overflow-y: auto; padding: 10px 10px 60px 10px; scrollbar-width: none; scroll-behavior: smooth; position: relative; }
  #lyrics-content::-webkit-scrollbar { display: none; }
  .lyrics-loading { padding: 40px 20px; text-align: center; color: #aaa; font-style: italic; font-size: 12px; line-height: 1.6; }
  #lyrics-internal-toast { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 6px 12px; border-radius: 12px; font-size: 11px; font-weight: bold; pointer-events: none; opacity: 0; transition: opacity .2s; z-index: 20; white-space: nowrap; }
  #lyrics-internal-toast.show { opacity: 1; }
  #yt-lucky-lyrics-panel.focused-mode #lyrics-content { display: flex; flex-direction: column; align-items: center; justify-content: center; }
  #yt-lucky-lyrics-panel.focused-mode .lyrics-line { display: none !important; }
  #yt-lucky-lyrics-panel.focused-mode .lyrics-line.karaoke-active { display: block !important; text-align: var(--lyrics-align); }
  .lyrics-line { opacity: .4; color: #fff !important; font-size: var(--lyrics-base-size) !important; font-weight: 600 !important; padding: 8px 0 !important; margin: 4px 0 !important; cursor: pointer !important; transition: all .3s cubic-bezier(.25,.8,.25,1); transform-origin: center center; line-height: 1.4; text-align: var(--lyrics-align); white-space: normal !important; word-break: break-word; }
  .lyrics-line:hover { opacity: .7; }
  .lyrics-line.karaoke-active { opacity: 1 !important; font-size: var(--lyrics-active-size) !important; font-weight: 800 !important; transform: scale(1.02); color: #fff !important; text-shadow: 0 2px 12px rgba(255,255,255,0.2); }

  /* AIEx & Settings */
  #yt-aiex-panel, #yt-aisettings-panel { display: none; flex-direction: column; flex: 1; overflow-y: auto; gap: 8px; padding-top: 10px; color: #f1f1f1; }
  #aiex-content { flex: 1; overflow-y: auto; padding: 10px 4px 60px 4px; line-height: 1.6; font-size: 13px; color: #ddd; word-break: break-word; scrollbar-width: thin; }
  #aiex-content strong { color: #0288d1; font-weight: 700; }
  #aiex-content em { color: #ba68c8; }
  #aiex-content code { background: #242424; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 11px; }
  .yt-loading-pulse { display: inline-block; width: 10px; height: 10px; background-color: #0288d1; border-radius: 50%; animation: yt-pulse 1.2s infinite cubic-bezier(.66,0,1); margin-right: 6px; }
  @keyframes yt-pulse { 0% { transform: scale(.8); opacity: .5; } 50% { transform: scale(1.4); opacity: 1; } 100% { transform: scale(.8); opacity: .5; } }
  .yt-ai-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
  .yt-ai-group label { font-size: 11px; color: #aaa; font-weight: 600; }
  .yt-ai-group input, .yt-ai-group select { background: #181818; border: 1px solid #333; color: #fff; padding: 6px 8px; border-radius: 6px; font-size: 11px; box-sizing: border-box; outline: none; }
  .yt-ai-group input:focus, .yt-ai-group select:focus { border-color: #0288d1; }
  
  #yt-lucky-banner-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 48%;
    pointer-events: none;
    user-select: none;
    display: block;
  }

  /* Show only in portrait mode */
  @media (orientation: portrait) {
    #yt-lucky-banner-wrap {
      display: flex !important;
    }
  }

  /* Hide in landscape mode */
  @media (orientation: landscape) {
    #yt-lucky-banner-wrap {
      display: none !important;
    }
  }

  /* BelayTube Logo Styles */
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
      font-weight: 500 !important;
      font-size: 20px !important;
      letter-spacing: -0.4px !important;
      color: var(--yt-spec-text-primary);
      line-height: 1;
  }
  a#logo {
      display: flex !important;
      align-items: center !important;
  }

  /* Hide YouTube UI */
  .ytp-unmute, .ytp-unmute-button, .ytp-unmute-overlay, .ytp-tap-to-unmute, .ytp-unmute-animation, button[aria-label*="Unmute" i], button[title*="Unmute" i] { display: none !important; }
  ytm-app-prompt-renderer, .open-in-app-button, ytm-mobile-topbar-renderer ytm-button-renderer[aria-label*="Open App"], ytm-mobile-topbar-renderer ytm-button-renderer:has(ytm-app-prompt), .mobile-topbar-header-end ytm-button-renderer:has(span:contains("Open App")), ytm-slim-video-metadata-renderer .open-in-app-button { display: none !important; }

  @keyframes audio-glow {
    from { text-shadow: 0 0 20px #ff0000, 0 0 40px #ff0000; color: #fff; }
    to { text-shadow: 0 0 30px #ff0000, 0 0 60px #ff0000, 0 0 80px #ff0000; color: #fff; }
  }

  @media (max-width: 900px), (pointer: coarse) {
    .lyrics-mini-btn { min-width: 44px !important; height: 40px !important; }
  }
`);

/* ================= UTILITIES ================= */
function setSafeDOM(container, htmlString) {
  if (!container) return;
  try {
    if (typeof window.trustedTypes !== 'undefined') {
      if (window.trustedTypes.defaultPolicy && typeof window.trustedTypes.defaultPolicy.createHTML === 'function') {
        container.innerHTML = window.trustedTypes.defaultPolicy.createHTML(htmlString);
        return;
      }
      for (const n of ['default', 'youtube', 'yt-pro']) {
        try {
          const p = window.trustedTypes.createPolicy(n, { createHTML: s => s });
          container.innerHTML = p.createHTML(htmlString);
          return;
        } catch(_) {}
      }
    }
  } catch(_) {}
  try {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    while (container.firstChild) container.removeChild(container.firstChild);
    while (doc.body.firstChild) container.appendChild(doc.body.firstChild);
  } catch(e) {
    console.warn('[YT Pro] safeDOM fallback:', e);
  }
}

function updateSidebarVisibilityState(visible) {
  if (visible) {
    document.body.classList.add('yt-sidebar-open');
  } else {
    document.body.classList.remove('yt-sidebar-open');
  }
}

function createSvgIcon(type) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  if (type === 'logo') {
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', '#ff0000');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z');
    svg.appendChild(p);
  } else if (type === 'list') {
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    [['8','6','21','6'],['8','12','21','12'],['8','18','21','18'],['3','6','3.01','6'],['3','12','3.01','12'],['3','18','3.01','18']].forEach(c => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', c[0]); l.setAttribute('y1', c[1]);
      l.setAttribute('x2', c[2]); l.setAttribute('y2', c[3]);
      svg.appendChild(l);
    });
  }
  return svg;
}

const Store = {
  get(key, def) {
    try {
      if (typeof hcj !== 'undefined' && hcj.config && typeof hcj.config.get === 'function') {
        const v = hcj.config.get(key, undefined);
        if (v !== undefined) return v;
      }
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(key, undefined);
        if (v !== undefined) return v;
      }
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : def;
    } catch(_) { return def; }
  },
  set(key, val) {
    try {
      if (typeof hcj !== 'undefined' && hcj.config && typeof hcj.config.set === 'function') hcj.config.set(key, val);
      if (typeof GM_setValue === 'function') GM_setValue(key, val);
      localStorage.setItem(key, JSON.stringify(val));
    } catch(_) {}
  },
  remove(key) {
    try {
      if (typeof hcj !== 'undefined' && hcj.config && typeof hcj.config.remove === 'function') hcj.config.remove(key);
      if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
      localStorage.removeItem(key);
    } catch(_) {}
  }
};

async function requestNetwork(url) {
  if (typeof hcj !== 'undefined' && typeof hcj.fetch === 'function') {
    try {
      const res = await hcj.fetch(url, { headers: { Accept: 'text/html' } });
      if (typeof res === 'string') return res;
      if (res) {
        if (typeof res.text === 'function') return await res.text();
        if (typeof res.data === 'string') return res.data;
        if (typeof res.body === 'string') return res.body;
      }
    } catch(_) {}
  }
  if (typeof GM_xmlhttpRequest === 'function') {
    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method: 'GET', url, headers: { Accept: 'text/html' }, timeout: 8000,
        onload: r => resolve(typeof r.responseText === 'string' ? r.responseText : ''),
        onerror: () => resolve(''), ontimeout: () => resolve('')
      });
    });
  }
  try {
    const res = await window.fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
    if (res && res.ok) return await res.text();
  } catch(_) {}
  return '';
}

function getPageZoom() {
  const p = document.createElement('div');
  p.style.cssText = 'position:absolute;top:0;left:0;width:100px;height:1px;visibility:hidden;pointer-events:none;';
  (document.body || document.documentElement).appendChild(p);
  const w = p.getBoundingClientRect().width;
  p.remove();
  return w > 0 ? w / 100 : 1;
}

function fixFullWidth() {
  const z = getPageZoom();
  if (Math.abs(z - 1) < 0.02) {
    const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
    if (sb) { sb.style.width = '100vw'; sb.style.left = '0'; sb.style.right = 'auto'; }
    const tb = document.getElementById('yt-lucky-controls-v3-wrapper');
    if (tb) { tb.style.width = '100vw'; tb.style.marginRight = '0'; tb.style.marginLeft = '0'; }
    return;
  }
  const targetCssWidth = window.innerWidth / z;
  const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
  if (sb) {
    const userScale = sb._luckyScale || 1;
    sb.style.left = '0';
    sb.style.right = 'auto';
    sb.style.width = (targetCssWidth / userScale) + 'px';
  }
  const tb = document.getElementById('yt-lucky-controls-v3-wrapper');
  if (tb) {
    tb.style.boxSizing = 'border-box';
    tb.style.width = targetCssWidth + 'px';
    const parentW = tb.parentElement ? tb.parentElement.clientWidth : document.documentElement.clientWidth;
    tb.style.marginRight = `-${Math.max(0, targetCssWidth - parentW)}px`;
    tb.style.marginLeft = '0';
  }
}

function buildBelayLogoElement() {
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

    svg.appendChild(redPath);
    svg.appendChild(whitePath);

    const text = document.createElement('span');
    text.className = 'belaytube-text';
    text.textContent = 'BelayTube';

    container.appendChild(svg);
    container.appendChild(text);
    return container;
}

function replaceLogo() {
    document.querySelectorAll('a#logo').forEach(link => {
        if (!link.querySelector('#belaytube-container')) {
            link.appendChild(buildBelayLogoElement());
        }
    });
}

/* ================= PRO Settings ================= */
const PRO_STORE_KEY = 'yt_pro_settings_v7';

function buildDefaultProSettings() {
  return {
    typo: {
      videoTitle: { font: '"Roboto","YouTube Sans",sans-serif', size: 16 },
      channelName: { font: '"Roboto","YouTube Sans",sans-serif', size: 14 },
      comments: { font: '"Roboto","YouTube Sans",sans-serif', size: 14 },
      uiLabels: { font: '"Roboto","YouTube Sans",sans-serif', size: 13 },
      extra: { lineHeight: 1.4, letterSpacing: 0 }
    },
    ui: {
      thumbRadius: 10, mobileFeedColumns: 1, watchDetailsScale: 75,
      playlistWidth: 380, playlistScale: 100, mainBtnSize: 44,
      luckyScale: 100, luckyHeightVh: 45
    },
    layout: { feedOffset: 0, hideSidebar: false, feedDisabled: false, anchorMode: false },
    toggles: {
      hideHomeFeed: false, hideVideoSidebar: true, hideRecommended: true,
      hideLiveChat: true, hideWatchPlaylist: true, hideFundraiser: true,
      hideEndScreenFeed: true, hideEndScreenCards: true, hideShorts: true,
      hideComments: true, hideMixes: true, hideMerchOffers: true,
      hideVideoInfo: false, hideTopHeader: false, hideNotifications: false,
      hideInaptSearch: true, hideExploreTrending: true, hideMoreFromYouTube: true,
      hideSubscriptions: true, disableAutoplay: false, disableAnnotations: true
    },
    opt: { force30fps: false, twoRowHeader: false, autoRedirectVideos: true, optimizeScrolling: true }
  };
}

let cfg = buildDefaultProSettings();
try {
  const saved = Store.get(PRO_STORE_KEY, null);
  if (saved) {
    cfg = {
      ...cfg, ...saved,
      typo: { ...cfg.typo, ...(saved.typo || {}), extra: { ...cfg.typo.extra, ...(saved.typo?.extra || {}) } },
      ui: { ...cfg.ui, ...(saved.ui || {}) },
      layout: { ...cfg.layout, ...(saved.layout || {}) },
      toggles: { ...cfg.toggles, ...(saved.toggles || {}) },
      opt: { ...cfg.opt, ...(saved.opt || {}) }
    };
  }
} catch(_) {}

// Enforce safe scale and height limits
if (cfg.ui.luckyScale > 125) cfg.ui.luckyScale = 125;
if (cfg.ui.luckyScale < 70) cfg.ui.luckyScale = 70;
if (cfg.ui.luckyHeightVh > 80) cfg.ui.luckyHeightVh = 80;
if (cfg.ui.luckyHeightVh < 25) cfg.ui.luckyHeightVh = 25;

function saveProSettings() {
  Store.set(PRO_STORE_KEY, cfg);
}

/* Force 30fps */
(() => {
  try {
    if (window.MediaSource && window.MediaSource.isTypeSupported) {
      const orig = window.MediaSource.isTypeSupported.bind(window.MediaSource);
      window.MediaSource.isTypeSupported = t => {
        if (!t || !cfg.opt.force30fps) return orig(t);
        const m = t.match(/(?:framerate|fps)=(\d+)/);
        if (m && parseInt(m[1], 10) > 30) return false;
        return orig(t);
      };
    }
  } catch(_) {}
})();

/* Channel auto-redirect */
(() => {
  function check() {
    if (!cfg.opt.autoRedirectVideos) return;
    const p = window.location.pathname;
    if (/^\/(@[^/]+|c\/[^/]+|channel\/[^/]+|user\/[^/]+)\/?$/i.test(p)) {
      const clean = p.replace(/\/$/, '');
      window.location.replace(clean + '/videos' + window.location.search);
    }
  }
  try {
    check();
    window.addEventListener('yt-navigate-finish', check);
    const _push = history.pushState.bind(history);
    history.pushState = function(...args) {
      _push(...args);
      check();
    };
    window.addEventListener('popstate', check);
  } catch(_) {}
})();

const PRO_STYLE_ID = 'yt-pro-dynamic-styles';

function buildMasterCSS() {
  let css = '';
  const t = cfg.toggles, o = cfg.opt, u = cfg.ui, tp = cfg.typo;
  
  css += `
    #video-title, h1.ytd-watch-metadata, ytd-rich-grid-media #video-title, .media-item-headline {
      font-family: ${tp.videoTitle.font} !important;
      font-size: ${tp.videoTitle.size}px !important;
      line-height: ${tp.extra.lineHeight} !important;
      letter-spacing: ${tp.extra.letterSpacing}px !important;
    }
    #channel-name, ytd-channel-name, #owner-name, .media-item-byline {
      font-family: ${tp.channelName.font} !important;
      font-size: ${tp.channelName.size}px !important;
    }
    #content-text, ytd-comment-view-model #content-text {
      font-family: ${tp.comments.font} !important;
      font-size: ${tp.comments.size}px !important;
    }
    #guide-renderer yt-formatted-string, ytd-masthead yt-formatted-string {
      font-family: ${tp.uiLabels.font} !important;
      font-size: ${tp.uiLabels.size}px !important;
    }
    ytd-thumbnail #thumbnail, ytd-thumbnail img, .ytp-videowall-still-image {
      border-radius: ${u.thumbRadius}px !important;
    }
  `;

  const feedCols = Math.max(1, Math.min(4, u.mobileFeedColumns || 1));
  css += `
    ytm-browse[page-subtype="home"] ytm-rich-grid-renderer,
    ytm-browse[page-subtype="home"] .rich-grid-renderer-contents,
    ytm-browse[page-subtype="home"] lazy-list,
    ytm-single-column-browse-results-renderer .tab-content {
      display: grid !important;
      grid-template-columns: repeat(${feedCols}, minmax(0, 1fr)) !important;
      gap: 8px 6px !important;
      width: 100% !important;
      padding: 4px 6px !important;
      box-sizing: border-box !important;
    }
    ytm-media-item, ytm-rich-item-renderer {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      box-sizing: border-box !important;
    }
    ytm-media-item .media-item-headline {
      font-size: 12px !important;
      line-height: 1.25 !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }
  `;

  const watchZoom = (u.watchDetailsScale || 75) / 100;
  css += `
    ytm-slim-video-metadata-renderer, ytm-slim-owner-renderer,
    ytm-slim-video-action-bar-renderer, #below.ytd-watch-flexy {
      zoom: ${watchZoom} !important;
    }
  `;

  if (t.hideHomeFeed) {
    css += `
        ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
        ytd-browse[page-subtype="home"] ytd-two-column-browse-results-renderer,
        ytd-browse[page-subtype="home"] #contents,
        ytd-browse[page-subtype="home"] ytd-rich-section-renderer,
        ytd-browse[page-subtype="home"] ytd-rich-item-renderer,
        ytd-browse[page-subtype="home"] ytd-shelf-renderer,
        ytd-browse[page-subtype="home"] ytd-feed-filter-chip-bar-renderer ~ *,
        ytm-browse[page-subtype="home"] ytm-rich-item-renderer,
        ytm-browse[page-subtype="home"] ytm-media-item,
        ytm-browse[page-subtype="home"] ytm-video-with-context-renderer,
        ytm-browse[page-subtype="home"] ytm-compact-video-renderer,
        ytm-browse[page-subtype="home"] ytm-video-card-renderer,
        ytm-browse[page-subtype="home"] ytm-rich-section-renderer,
        ytm-browse[page-subtype="home"] ytm-rich-grid-renderer,
        ytm-browse[page-subtype="home"] ytm-item-section-renderer:not(:has(yt-chip-cloud-chip-renderer)),
        ytm-browse[page-subtype="home"] lazy-list:not(:has(yt-chip-cloud-chip-renderer)) {
            display: none !important;
        }
    `;
}
  if (t.hideVideoSidebar) css += `#secondary.ytd-watch-flexy, #related, ytm-item-section-renderer[section-identifier="related-items"] { display: none !important; }`;
  if (t.hideRecommended) css += `ytd-watch-next-secondary-results-renderer #items, #related #items { display: none !important; }`;
  if (t.hideLiveChat) css += `ytd-live-chat-frame, #chat, ytm-live-chat-renderer { display: none !important; }`;
  if (t.hideWatchPlaylist) css += `ytd-playlist-panel-renderer, #playlist.ytd-watch-flexy { display: none !important; }`;
  if (t.hideFundraiser) css += `ytd-donation-shelf-renderer, ytm-donation-shelf-renderer { display: none !important; }`;
  if (t.hideEndScreenFeed) css += `.ytp-endscreen-content, .ytp-endscreen-paginate { display: none !important; }`;
  if (t.hideEndScreenCards) css += `.ytp-ce-element, .ytp-cards-teaser, .ytp-cards-button { display: none !important; }`;
  if (t.hideShorts) css += `ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], a[href^="/shorts"], ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model { display: none !important; }`;

  if (t.hideComments) {
    css += `
      #comments, ytd-comments, #comment-teaser,
      ytm-comments-entry-point-header-renderer,
      ytm-comments-entry-point-teaser-renderer,
      ytm-comment-section-renderer,
      ytm-item-section-renderer[section-identifier="comment-item-section"],
      ytm-item-section-renderer:has(yt-video-metadata-carousel-view-model[aria-label="Comments"]),
      ytm-item-section-renderer:has(comments-entry-point-teaser-view-model),
      ytm-item-section-renderer:has(ytm-comments-entry-point-header-renderer),
      yt-video-metadata-carousel-view-model[aria-label="Comments"],
      comments-entry-point-teaser-view-model,
      yt-comment-teaser-carousel-item-view-model,
      .comments-entry-point-teaser,
      .comments-entry-point,
      [class*="comments-entry-point"] {
        display: none !important;
      }
    `;
  }

  if (t.hideVideoInfo) {
    css += `
      #above-the-fold, ytd-watch-metadata, #top-row.ytd-watch-metadata,
      ytm-slim-video-metadata-section-renderer, ytm-slim-video-metadata-renderer,
      ytm-slim-owner-renderer, ytm-slim-video-action-bar-renderer,
      ytm-standalone-collection-badge-renderer, .slim-video-information-holder,
      .slim-video-metadata-header {
        display: none !important;
      }
    `;
  }

  if (t.hideMixes) css += `ytd-radio-renderer, ytd-compact-radio-renderer, ytm-radio-renderer { display: none !important; }`;
  if (t.hideMerchOffers) css += `ytd-merch-shelf-renderer, ytd-ticket-shelf-renderer, #offer-module { display: none !important; }`;
  if (t.hideTopHeader) css += `#masthead-container, ytd-masthead, #masthead, ytm-header-bar { display: none !important; }`;
  if (t.hideNotifications) css += `ytd-notification-topbar-button-renderer, #notification-button { display: none !important; }`;
  if (t.hideInaptSearch) css += `ytd-shelf-renderer:has(#title:not(:empty)), ytd-search ytd-shelf-renderer, ytm-shelf-renderer { display: none !important; }`;
  if (t.hideExploreTrending) css += `a[href*="/feed/trending"], a[href*="/feed/explore"] { display: none !important; }`;
  if (t.hideMoreFromYouTube) css += `#sections > ytd-guide-section-renderer:nth-of-type(3) { display: none !important; }`;
  if (t.hideSubscriptions) css += `ytd-guide-entry-renderer:has(a[href="/feed/subscriptions"]) { display: none !important; }`;
  if (t.disableAnnotations) css += `.ytp-iv-player-content, .iv-module { display: none !important; }`;
  if (cfg.layout.hideSidebar) css += `ytd-mini-guide-renderer, app-drawer#guide { display: none !important; }`;
  
  return css;
}

function applyProStyles() {
  let el = document.getElementById(PRO_STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = PRO_STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = buildMasterCSS();
}

function getFeedTarget() {
  return document.querySelector('ytd-browse[page-subtype="home"] #primary, ytd-watch-flexy #primary, ytd-search #primary, ytm-browse, ytm-watch');
}

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
  cfg.layout.feedOffset = Math.max(-600, Math.min(600, Math.round(px)));
  if (!cfg.layout.feedDisabled) applyFeedOffset(cfg.layout.feedOffset);
  else clearFeedOffset();
  saveProSettings();
}

/* ================= MODULE: Lyrics ================= */
const YtLyrics = {
  panelElement: null,
  currentLyrics: [],
  lineElements: [],
  currentVideoId: null,
  apiOrder: ['LRCLIB', 'Genius', 'Lyrics.ovh', 'Textyl.co', 'Some Random API'],
  preferredApi: '',
  useOtherApis: false,
  karaokeMode: true,
  catcherMode: false,
  focusedMode: false,
  isFetching: false,
  lastActiveIndex: -1,
  karaokeRaf: null,
  toastTimeout: null,
  syncOffset: parseFloat(localStorage.getItem('ytLyrics_offset')) || 0.15,
  activeFontSize: parseInt(localStorage.getItem('ytLyrics_fontSize')) || (IS_MOBILE ? 22 : 20),
  baseFontSize: parseInt(localStorage.getItem('ytLyrics_baseSize')) || (IS_MOBILE ? 15 : 14),
  lyricsAlign: localStorage.getItem('ytLyrics_align') || 'center',
  geniusCredentials: { accessToken: 'ic8x2s4DuKQMZeUO-tbEJj7mImVhEg0nzWfXX0Bzt8VUdE8y586DnZ-HUbolc3o2' },

  init() {
    this.preferredApi = GM_getValue('preferredApi', this.apiOrder[0]);
    this.useOtherApis = localStorage.getItem('ytLyrics_useOther') === '1';
    this.karaokeMode = localStorage.getItem('ytLyrics_karaoke') !== '0';
    this.focusedMode = localStorage.getItem('ytLyrics_focused') === '1';
    this.buildUI();
    this.startKaraokeLoop();
  },

  buildUI() {
    if (this.panelElement) return;
    const panel = document.createElement('div');
    panel.id = 'yt-lucky-lyrics-panel';
    panel.style.setProperty('--lyrics-active-size', this.activeFontSize + 'px');
    panel.style.setProperty('--lyrics-base-size', this.baseFontSize + 'px');
    panel.style.setProperty('--lyrics-align', this.lyricsAlign);
    if (this.focusedMode) panel.classList.add('focused-mode');

    panel.innerHTML = `
      <div id="lyrics-header">
        <span id="lyrics-header-title">🎵 Lyrics</span>
        <div class="lyrics-controls-row">
          <button id="lyrics-btn-font" class="lyrics-mini-btn" title="Font">Aa</button>
          <button id="lyrics-btn-align" class="lyrics-mini-btn" title="Align">≡</button>
          <button id="lyrics-btn-focused" class="lyrics-mini-btn" title="Focused">👁</button>
          <button id="lyrics-btn-minus" class="lyrics-mini-btn" title="Delay">−</button>
          <button id="lyrics-btn-plus" class="lyrics-mini-btn" title="Advance">+</button>
          <button id="lyrics-btn-catcher" class="lyrics-mini-btn" title="Catcher">🎵C</button>
          <button id="lyrics-btn-sync" class="lyrics-mini-btn" title="Karaoke">K</button>
          <button id="lyrics-btn-other" class="lyrics-mini-btn" title="Other providers">🌐 Other: OFF</button>
          <button id="lyrics-btn-cycle" class="lyrics-mini-btn" style="display:none;">🔄</button>
        </div>
        <div id="lyrics-font-panel" style="display:none; position:absolute; right:0px; top:46px; background:#222; border:1px solid #444; border-radius:8px; padding:12px; z-index:10; flex-direction:column; gap:10px; width:180px; box-shadow:0 4px 12px rgba(0,0,0,0.5);">
          <div>
            <label style="font-size:10px; color:#aaa; display:flex; justify-content:space-between; margin-bottom:4px;">Active: <span id="lyrics-font-val">${this.activeFontSize}px</span></label>
            <input type="range" id="lyrics-font-slider" min="14" max="96" step="1" value="${this.activeFontSize}" style="width:100%;">
          </div>
          <div>
            <label style="font-size:10px; color:#aaa; display:flex; justify-content:space-between; margin-bottom:4px;">Base: <span id="lyrics-base-font-val">${this.baseFontSize}px</span></label>
            <input type="range" id="lyrics-base-font-slider" min="10" max="32" step="1" value="${this.baseFontSize}" style="width:100%;">
          </div>
          <button id="lyrics-font-reset" style="background:#d32f2f; color:#fff; border:none; border-radius:4px; padding:5px; cursor:pointer; font-size:10px;">Reset</button>
        </div>
      </div>
      <div id="lyrics-content"><div class="lyrics-loading">Waiting for track...</div></div>
      <div id="lyrics-internal-toast"></div>
    `;
    
    this.panelElement = panel;
    setTimeout(() => {
      this.updateControlsUI();
      this.wireUp();
    }, 80);
  },

  wireUp() {
    const panel = this.panelElement;
    if (!panel) return;
    const add = (id, ev, fn) => {
      const el = panel.querySelector(id);
      if (el) el.addEventListener(ev, fn);
    };

    add('#lyrics-btn-sync', 'click', () => {
      this.karaokeMode = !this.karaokeMode;
      if (this.karaokeMode) this.catcherMode = false;
      localStorage.setItem('ytLyrics_karaoke', this.karaokeMode ? '1' : '0');
      this.updateControlsUI();
      if (this.karaokeMode) {
        this.startKaraokeLoop();
        if (this.lastActiveIndex >= 0 && this.lineElements[this.lastActiveIndex]) {
          this.highlightLine(this.lastActiveIndex, true);
        }
      } else {
        this.lineElements.forEach(el => el.classList.remove('karaoke-active'));
        this.lastActiveIndex = -1;
      }
    });

    add('#lyrics-btn-other', 'click', () => {
      this.useOtherApis = !this.useOtherApis;
      localStorage.setItem('ytLyrics_useOther', this.useOtherApis ? '1' : '0');
      this.updateControlsUI();
      this.showToast(this.useOtherApis ? 'Other ON' : 'LRCLIB Only');
      this.fetchLyrics(true);
    });

    add('#lyrics-btn-focused', 'click', () => {
      this.focusedMode = !this.focusedMode;
      localStorage.setItem('ytLyrics_focused', this.focusedMode ? '1' : '0');
      panel.classList.toggle('focused-mode', this.focusedMode);
      if (!this.focusedMode && this.lastActiveIndex >= 0) this.highlightLine(this.lastActiveIndex, true);
      this.updateControlsUI();
    });

    add('#lyrics-btn-align', 'click', () => {
      const aligns = ['left', 'center', 'right'];
      this.lyricsAlign = aligns[(aligns.indexOf(this.lyricsAlign) + 1) % aligns.length];
      localStorage.setItem('ytLyrics_align', this.lyricsAlign);
      panel.style.setProperty('--lyrics-align', this.lyricsAlign);
      const icons = { left: '≡L', center: '≡', right: '≡R' };
      const b = panel.querySelector('#lyrics-btn-align');
      if (b) b.textContent = icons[this.lyricsAlign];
      this.showToast(`Align: ${this.lyricsAlign}`);
    });

    add('#lyrics-btn-catcher', 'click', () => {
      this.catcherMode = !this.catcherMode;
      if (this.catcherMode) {
        this.karaokeMode = false;
        localStorage.setItem('ytLyrics_karaoke', '0');
        this.lineElements.forEach(el => el.classList.remove('karaoke-active'));
        this.lastActiveIndex = -1;
        this.showToast('Catcher ON');
      }
      this.updateControlsUI();
    });

    add('#lyrics-btn-plus', 'click', () => {
      this.syncOffset += 0.1;
      localStorage.setItem('ytLyrics_offset', this.syncOffset);
      this.showToast(`Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
    });

    add('#lyrics-btn-minus', 'click', () => {
      this.syncOffset -= 0.1;
      localStorage.setItem('ytLyrics_offset', this.syncOffset);
      this.showToast(`Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
    });

    add('#lyrics-btn-font', 'click', () => {
      const fp = panel.querySelector('#lyrics-font-panel');
      fp.style.display = fp.style.display === 'none' ? 'flex' : 'none';
    });

    add('#lyrics-font-slider', 'input', e => {
      this.activeFontSize = +e.target.value;
      panel.style.setProperty('--lyrics-active-size', this.activeFontSize + 'px');
      panel.querySelector('#lyrics-font-val').textContent = this.activeFontSize + 'px';
      localStorage.setItem('ytLyrics_fontSize', this.activeFontSize);
    });

    add('#lyrics-base-font-slider', 'input', e => {
      this.baseFontSize = +e.target.value;
      panel.style.setProperty('--lyrics-base-size', this.baseFontSize + 'px');
      panel.querySelector('#lyrics-base-font-val').textContent = this.baseFontSize + 'px';
      localStorage.setItem('ytLyrics_baseSize', this.baseFontSize);
    });

    add('#lyrics-font-reset', 'click', () => {
      this.activeFontSize = IS_MOBILE ? 22 : 20;
      this.baseFontSize = IS_MOBILE ? 15 : 14;
      panel.querySelector('#lyrics-font-slider').value = this.activeFontSize;
      panel.querySelector('#lyrics-base-font-slider').value = this.baseFontSize;
      panel.style.setProperty('--lyrics-active-size', this.activeFontSize + 'px');
      panel.style.setProperty('--lyrics-base-size', this.baseFontSize + 'px');
      panel.querySelector('#lyrics-font-val').textContent = this.activeFontSize + 'px';
      panel.querySelector('#lyrics-base-font-val').textContent = this.baseFontSize + 'px';
    });

    add('#lyrics-btn-cycle', 'click', () => {
      const i = this.apiOrder.indexOf(this.preferredApi);
      this.preferredApi = this.apiOrder[(i + 1) % this.apiOrder.length];
      GM_setValue('preferredApi', this.preferredApi);
      this.updateControlsUI();
      this.fetchLyrics(true);
    });

    const ab = panel.querySelector('#lyrics-btn-align');
    if (ab) {
      const icons = { left: '≡L', center: '≡', right: '≡R' };
      ab.textContent = icons[this.lyricsAlign] || '≡';
    }
  },

  updateControlsUI() {
    const g = id => this.panelElement.querySelector(id);
    if (g('#lyrics-btn-sync')) g('#lyrics-btn-sync').classList.toggle('active', this.karaokeMode);
    if (g('#lyrics-btn-catcher')) g('#lyrics-btn-catcher').classList.toggle('active', this.catcherMode);
    if (g('#lyrics-btn-focused')) g('#lyrics-btn-focused').classList.toggle('active', this.focusedMode);
    const ob = g('#lyrics-btn-other');
    if (ob) {
      ob.classList.toggle('active', this.useOtherApis);
      ob.textContent = this.useOtherApis ? '🌐 Other: ON' : '🌐 Other: OFF';
    }
    const cb = g('#lyrics-btn-cycle');
    if (cb) {
      cb.style.display = this.useOtherApis ? 'inline-flex' : 'none';
      cb.title = `Cycle API (${this.preferredApi})`;
    }
  },

  showToast(msg) {
    const t = this.panelElement.querySelector('#lyrics-internal-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
  },

  onVideoChange(vid, force = false) {
    this.currentLyrics = [];
    this.lineElements = [];
    this.lastActiveIndex = -1;
    this.isFetching = false;

    const c = this.panelElement?.querySelector('#lyrics-content');
    if (c) c.innerHTML = '<div class="lyrics-loading">Loading track lyrics...</div>';

    if (vid !== this.currentVideoId || force) {
      this.currentVideoId = vid;
      this.fetchLyrics();
    }
  },

  onShow() {
    const vid = new URLSearchParams(window.location.search).get('v');
    if (vid && (vid !== this.currentVideoId || this.currentLyrics.length === 0)) {
      this.currentVideoId = vid;
      if (!this.isFetching) this.fetchLyrics();
    } else if (this.lineElements.length > 0 && this.lastActiveIndex >= 0) {
      const c = this.panelElement.querySelector('#lyrics-content');
      const target = this.lineElements[this.lastActiveIndex];
      if (c && target) {
        const off = target.offsetTop - (c.clientHeight / 2) + (target.clientHeight / 2);
        c.scrollTo({ top: off, behavior: 'auto' });
      }
    }
  },

  async fetchLyrics(force = false) {
    if (this.isFetching) return;
    this.isFetching = true;
    const fetchVid = this.currentVideoId;

    const content = this.panelElement?.querySelector('#lyrics-content');
    if (content) content.innerHTML = '<div class="lyrics-loading">Searching lyrics...</div>';

    try {
      let videoTitle = '';
      const selectors = [
        'h1.ytd-watch-metadata yt-formatted-string',
        'h1.ytd-watch-metadata',
        'h2.slim-video-metadata-title',
        '.slim-video-metadata-title',
        'ytm-slim-video-information-renderer .slim-video-information-title',
        '.slim-video-information-title .yt-core-attributed-string',
        'h1.title yt-formatted-string',
        'h1.title'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          videoTitle = el.textContent.trim();
          break;
        }
      }
      if (!videoTitle) {
        const dt = document.title.replace(/\s*-\s*YouTube$/i, '').trim();
        if (dt && dt.toLowerCase() !== 'youtube') videoTitle = dt;
      }

      const isBadTitle =
        !videoTitle ||
        videoTitle.trim() === '' ||
        videoTitle.toLowerCase() === 'youtube' ||
        videoTitle.toLowerCase() === 'youtube studio';

      if (isBadTitle) {
        this.isFetching = false;
        setTimeout(() => {
          if (
            this.currentVideoId === fetchVid &&
            (!this.currentLyrics || this.currentLyrics.length === 0)
          ) {
            this.fetchLyrics();
          }
        }, 800);
        return;
      }

      const songInfo = this.extractSongInfo(videoTitle);
      let lyrics = null, source = null;

      if (!this.useOtherApis) {
        lyrics = await this.tryLRCLIB(songInfo);
        if (lyrics && lyrics.length > 0) source = 'LRCLIB';
      } else {
        const pIdx = this.apiOrder.indexOf(this.preferredApi);
        const ordered = [
          this.apiOrder[pIdx],
          ...this.apiOrder.slice(0, pIdx),
          ...this.apiOrder.slice(pIdx + 1)
        ];
        const fns = {
          'LRCLIB': this.tryLRCLIB.bind(this),
          'Genius': this.tryGeniusAPI.bind(this),
          'Lyrics.ovh': this.tryLyricsOVH.bind(this),
          'Textyl.co': this.tryTextylAPI.bind(this),
          'Some Random API': this.trySomeRandomAPI.bind(this)
        };
        for (const n of ordered) {
          lyrics = await fns[n](songInfo);
          if (lyrics && lyrics.length > 0) { source = n; break; }
        }
      }

      if (this.currentVideoId !== fetchVid) {
        this.isFetching = false;
        return;
      }

      if (lyrics && lyrics.length > 0) {
        this.currentLyrics = this.cleanLyrics(lyrics);
        if (this.panelElement) {
          this.renderLyricsDOM();
          const h = this.panelElement.querySelector('#lyrics-header-title');
          if (h) h.textContent = `🎵 Lyrics (${source})`;
        }
      } else {
        const msg = !this.useOtherApis
          ? 'No lyrics found on LRCLIB.<br><span style="font-size:11px;opacity:0.75;">Click "🌐 Other: OFF" to enable more.</span>'
          : 'No lyrics found.';
        if (content) content.innerHTML = `<div class="lyrics-loading" style="color:#ff5252;">${msg}</div>`;
      }
    } catch (e) {
      if (this.currentVideoId === fetchVid && content) {
        content.innerHTML = '<div class="lyrics-loading" style="color:#ff5252;">Failed to load.</div>';
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
            const v = document.querySelector('video');
            if (v) {
              this.syncOffset = line.time - v.currentTime;
              localStorage.setItem('ytLyrics_offset', this.syncOffset);
              this.catcherMode = false;
              this.karaokeMode = true;
              localStorage.setItem('ytLyrics_karaoke', '1');
              this.updateControlsUI();
              this.startKaraokeLoop();
              this.showToast(`Synced! ${this.syncOffset.toFixed(1)}s`);
            }
          }
        } else if (!this.karaokeMode) {
          this.highlightLine(index, true);
        } else if (line.time !== undefined) {
          const v = document.querySelector('video');
          if (v) v.currentTime = line.time - this.syncOffset;
        }
      });
      this.lineElements.push(el);
      content.appendChild(el);
    });
    
    const sp = document.createElement('div');
    sp.style.height = '60%';
    content.appendChild(sp);
  },

  highlightLine(index, scroll = true) {
    if (this.lastActiveIndex >= 0 && this.lineElements[this.lastActiveIndex]) {
        this.lineElements[this.lastActiveIndex].classList.remove('karaoke-active');
    }
    this.lastActiveIndex = index;
    const target = this.lineElements[index];
    if (target) {
        target.classList.add('karaoke-active');
        if (scroll && !this.focusedMode) {
            const c = this.panelElement?.querySelector('#lyrics-content');
            if (c) {
                const off = target.offsetTop - (c.clientHeight / 2) + (target.clientHeight / 2);
                c.scrollTo({ top: off, behavior: 'smooth' });
            }
        }
    }
  },

  syncKaraoke() {
    if (!this.karaokeMode || this.currentLyrics.length === 0) return;
    const v = document.querySelector('video');
    if (!v || v.paused) return;

    const time = v.currentTime + this.syncOffset;
    let activeIdx = -1;

    for (let i = 0; i < this.currentLyrics.length; i++) {
        const lineTime = this.currentLyrics[i].time;
        if (lineTime !== undefined) {
            if (time >= lineTime) {
                activeIdx = i;
            } else {
                break;
            }
        }
    }

    if (activeIdx !== -1 && activeIdx !== this.lastActiveIndex) {
        this.highlightLine(activeIdx, true);
    }
  },

  startKaraokeLoop() {
    if (this.karaokeRaf) cancelAnimationFrame(this.karaokeRaf);
    const loop = () => {
        try { this.syncKaraoke(); } catch (_) {}
        this.karaokeRaf = requestAnimationFrame(loop);
    };
    this.karaokeRaf = requestAnimationFrame(loop);
  },

  cleanLyrics(arr) {
    if (arr.length > 0 && arr[0].text && arr[0].text.includes('Contributors')) arr.shift();
    return arr.filter(l => {
      const t = l.text.trim();
      if (t.startsWith('[') && t.endsWith(']')) return false;
      return t.length > 0;
    });
  },

  extractSongInfo(title) {
    let clean = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/(official video|official music video|lyrics|lyric video|audio|video|hd|4k|1080p|720p)/gi, '').replace(/[^\w\s\-&]/g, '').replace(/\s+/g, ' ').trim();
    const seps = [' - ', ' – ', ' — ', ' | ', ' • ', ' ~ ', ' by '];
    let artist = '', song = clean;
    
    for (const s of seps) {
      if (clean.includes(s)) {
        const p = clean.split(s);
        if (p.length >= 2) {
          artist = p[0].trim();
          song = p.slice(1).join(s).trim();
          break;
        }
      }
    }
    if (!artist) {
      const m = clean.match(/(.+?)\s+(?:ft|feat|featuring)\s+(.+)/i);
      if (m) {
        artist = m[1].trim();
        song = m[2].trim();
      }
    }
    return { artist: artist || 'Unknown Artist', song: song || clean, cleanTitle: clean };
  },

  tryLRCLIB(si) {
    return new Promise(res => {
      const q = encodeURIComponent(`${si.artist} ${si.song}`);
      GM_xmlhttpRequest({
        method: 'GET', url: `https://lrclib.net/api/search?q=${q}`, timeout: 10000,
        onload: r => {
          if (r.status === 200) {
            try {
              const d = JSON.parse(r.responseText);
              if (d && d.length > 0) {
                const b = d.find(x => x.syncedLyrics);
                if (b) { res(this.parseLRCLyrics(b.syncedLyrics)); return; }
                if (d[0].plainLyrics) { res(this.parseSimpleLyrics(d[0].plainLyrics)); return; }
              }
            } catch(_) {}
          }
          res(null);
        },
        onerror: () => res(null), ontimeout: () => res(null)
      });
    });
  },

  parseLRCLyrics(txt) {
    const lines = txt.split('\n');
    const out = [];
    const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    
    lines.forEach(l => {
      const m = re.exec(l);
      if (m) {
        const min = +m[1], sec = +m[2], ms = m[3].length === 2 ? +m[3] * 10 : +m[3];
        const time = min * 60 + sec + ms / 1000;
        const text = l.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
        if (text) out.push({ time, text });
      }
    });
    return out;
  },

  tryGeniusAPI(si) {
    return new Promise(res => {
      const q = encodeURIComponent(`${si.artist} ${si.song}`);
      GM_xmlhttpRequest({
        method: 'GET', url: `https://api.genius.com/search?q=${q}`,
        headers: { Authorization: `Bearer ${this.geniusCredentials.accessToken}` },
        timeout: 10000,
        onload: r => {
          if (r.status === 200) {
            try {
              const d = JSON.parse(r.responseText);
              if (d.response.hits && d.response.hits.length > 0) {
                this.fetchGeniusLyrics(d.response.hits[0].result.url).then(l => res(l || null));
              } else res(null);
            } catch(_) { res(null); }
          } else res(null);
        },
        onerror: () => res(null), ontimeout: () => res(null)
      });
    });
  },

  async fetchGeniusLyrics(url) {
    return new Promise(res => {
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 15000,
        onload: r => {
          if (r.status === 200) {
            try {
              const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
              const cs = doc.querySelectorAll('[data-lyrics-container="true"]');
              let txt = '';
              cs.forEach(c => {
                const cl = c.cloneNode(true);
                cl.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                cl.querySelectorAll('*').forEach(el => {
                  if (el.tagName.toLowerCase() === 'a') el.replaceWith(el.textContent);
                });
                txt += cl.textContent + '\n\n';
              });
              if (txt.trim()) res(this.parseSimpleLyrics(txt));
              else res(null);
            } catch(_) { res(null); }
          } else res(null);
        },
        onerror: () => res(null), ontimeout: () => res(null)
      });
    });
  },

  tryLyricsOVH(si) {
    return new Promise(res => {
      const a = encodeURIComponent(si.artist), t = encodeURIComponent(si.song);
      GM_xmlhttpRequest({
        method: 'GET', url: `https://api.lyrics.ovh/v1/${a}/${t}`, timeout: 10000,
        onload: r => {
          if (r.status === 200) {
            try {
              const d = JSON.parse(r.responseText);
              if (d.lyrics) res(this.parseSimpleLyrics(d.lyrics));
              else res(null);
            } catch(_) { res(null); }
          } else res(null);
        },
        onerror: () => res(null), ontimeout: () => res(null)
      });
    });
  },

  tryTextylAPI(si) {
    return new Promise(res => {
      const q = encodeURIComponent(`${si.artist} ${si.song}`);
      GM_xmlhttpRequest({
        method: 'GET', url: `https://api.textyl.co/api/lyrics?q=${q}`, timeout: 10000,
        onload: r => {
          if (r.status === 200) {
            try {
              const d = JSON.parse(r.responseText);
              if (d.lyrics) res(this.parseSimpleLyrics(d.lyrics));
              else res(null);
            } catch(_) { res(null); }
          } else res(null);
        },
        onerror: () => res(null), ontimeout: () => res(null)
      });
    });
  },

  trySomeRandomAPI(si) {
    return new Promise(res => {
      const a = encodeURIComponent(si.artist), t = encodeURIComponent(si.song);
      GM_xmlhttpRequest({
        method: 'GET', url: `https://some-random-api.com/lyrics?title=${t}&artist=${a}`, timeout: 10000,
        onload: r => {
          if (r.status === 200) {
            try {
              const d = JSON.parse(r.responseText);
              if (d.lyrics) res(this.parseSimpleLyrics(d.lyrics));
              else res(null);
            } catch(_) { res(null); }
          } else res(null);
        },
        onerror: () => res(null), ontimeout: () => res(null)
      });
    });
  },

  parseSimpleLyrics(txt) {
    return txt.split('\n')
      .map(l => l.replace(/\[\d+:\d+\.\d+\]\s*/, '').trim())
      .filter(l => l.length > 0)
      .map(text => ({ text }));
  }
};

/* ================= MODULE: AIExplainer ================= */
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

async function typeWriteHTML(el, html, speed) {
  currentTypingId++;
  const id = currentTypingId;
  el.innerHTML = '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  async function walk(node, parent) {
    if (id !== currentTypingId) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const tn = document.createTextNode('');
      parent.appendChild(tn);
      const t = node.textContent;
      for (let i = 0; i < t.length; i++) {
        if (id !== currentTypingId) break;
        tn.textContent += t[i];
        await new Promise(r => setTimeout(r, speed + (Math.random() * 4 - 2)));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const ne = document.createElement(node.tagName);
      Array.from(node.attributes).forEach(a => ne.setAttribute(a.name, a.value));
      parent.appendChild(ne);
      for (const c of node.childNodes) await walk(c, ne);
    }
  }
  await walk(tmp, el);
}

function buildEnhancedSongPrompt(s, a) {
  return `You are an elite musicologist, cultural critic, and lyrical analyst acting as an expert song explainer.\n\nAnalyze the song: "${s}" by "${a}".\n\nProvide a comprehensive, fluid, and engaging breakdown covering:\n1. Core Narrative & Meaning.\n2. Musical Composition & Production.\n3. Cultural & Historical Impact.\n4. Artist Discography & Career Arc.\n5. Comparisons & Echoes.\n\nFormat with clean Markdown. Maintain an engaging and articulate tone.`;
}

const YtAIExplainer = {
  panelElement: null,
  lastExplainedKey: '',

  init() {
    if (this.panelElement) return;
    const p = document.createElement('div');
    p.id = 'yt-aiex-panel';
    p.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
        <span style="font-weight:bold; color:#0288d1; font-size:13px;">💡 Song Explainer (AIEx)</span>
        <button id="aiex-reload-btn" style="background:#0288d1; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:bold;">🔄 Explain</button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px; padding-bottom:2px;">
        <div id="aiex-song-header" style="font-size:11px; color:#aaa; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; margin-right:8px;">No song active</div>
        <button id="aiex-copy-btn" style="background:#333; color:#fff; border:none; border-radius:4px; padding:2px 7px; font-size:10px; cursor:pointer; flex-shrink:0;">📋 Copy</button>
      </div>
      <div id="aiex-content">Switch to the AIEx tab to view a breakdown of the current song.</div>
    `;
    this.panelElement = p;
    p.querySelector('#aiex-reload-btn').onclick = () => this.explainCurrentSong(true);
    
    const cp = p.querySelector('#aiex-copy-btn');
    cp.onclick = () => {
      const c = p.querySelector('#aiex-content');
      if (!c || !c.innerText.trim()) return;
      navigator.clipboard.writeText(c.innerText.trim()).then(() => {
        cp.textContent = '✓';
        setTimeout(() => cp.textContent = '📋 Copy', 2000);
      }).catch(() => {});
    };
  },

  getCurrentSong() {
    const el = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, ytm-slim-video-information-renderer .slim-video-information-title, h2.slim-video-metadata-title');
    let t = el ? el.textContent : document.title.replace(' - YouTube', '');
    t = t.replace(/^\(\d+\)\s*/, '').trim();
    return YtLyrics.extractSongInfo(t);
  },

  explainCurrentSong(force = false) {
    const info = this.getCurrentSong();
    if (!info || !info.song) {
      this.panelElement.querySelector('#aiex-content').innerHTML = '<span style="color:#888;">No active track title.</span>';
      return;
    }
    
    const key = `${info.artist} - ${info.song}`;
    if (key === this.lastExplainedKey && !force) return;
    
    this.lastExplainedKey = key;
    this.panelElement.querySelector('#aiex-song-header').textContent = `Analyzing: "${info.song}" by ${info.artist}`;
    const c = this.panelElement.querySelector('#aiex-content');
    c.innerHTML = `<div><span class="yt-loading-pulse"></span> Analyzing…</div>`;
    
    const prompt = buildEnhancedSongPrompt(info.song, info.artist);
    const provider = aiSettings.provider;

    const out = text => {
      const f = formatMarkdown(text);
      if (aiSettings.typewriterEnabled) typeWriteHTML(c, f, aiSettings.typewriterSpeed || 10);
      else c.innerHTML = f;
    };
    
    const err = m => {
      c.innerHTML = `<span style="color:#ff5252;"><b>AI Error:</b> ${m}</span><br><span style="color:#aaa;">Check API Key in AI Settings (⚙️).</span>`;
    };

    if (provider === 'gemini') {
      if (!aiSettings.geminiApiKey) return err('Gemini key missing.');
      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${aiSettings.geminiModel || 'gemini-2.5-flash-lite'}:generateContent`,
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': aiSettings.geminiApiKey },
        data: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        responseType: 'json',
        timeout: 30000,
        onload: r => {
          const t = r.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (t) out(t.trim());
          else err(r.response?.error?.message || `HTTP ${r.status}`);
        },
        onerror: () => err('Network error.'),
        ontimeout: () => err('Timed out.')
      });
      return;
    }

    const cfgs = {
      openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: aiSettings.openrouterApiKey, model: aiSettings.openrouterModel },
      groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: aiSettings.groqApiKey, model: aiSettings.groqModel },
      cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', key: aiSettings.cerebrasApiKey, model: aiSettings.cerebrasModel }
    };
    const cc = cfgs[provider];
    if (!cc || !cc.key) return err(`${provider} key missing.`);
    
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cc.key}` };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'YouTubeLucky';
    }
    
    GM_xmlhttpRequest({
      method: 'POST', url: cc.url, headers,
      data: JSON.stringify({ model: cc.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 2800 }),
      responseType: 'json', timeout: 30000,
      onload: r => {
        const t = r.response?.choices?.[0]?.message?.content;
        if (t) out(t.trim());
        else err(r.response?.error?.message || `API ${r.status}`);
      },
      onerror: () => err('Network error.'),
      ontimeout: () => err('Timed out.')
    });
  }
};

/* ================= MODULE: AI Settings ================= */
const YtAISettings = {
  panelElement: null,

  init() {
    if (this.panelElement) return;
    const p = document.createElement('div');
    p.id = 'yt-aisettings-panel';
    p.innerHTML = `
      <div style="font-weight:bold; color:#0288d1; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:13px;">⚙️ AI Configuration</span>
        <button id="yt-ai-save-btn" style="background:#0288d1; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:bold;">Save</button>
      </div>
      <div style="overflow-y:auto; flex:1; padding-right:4px;">
        <div class="yt-ai-group">
          <label>Provider</label>
          <select id="yt-ai-cfg-provider">
            <option value="gemini" ${aiSettings.provider === 'gemini' ? 'selected' : ''}>Gemini</option>
            <option value="openrouter" ${aiSettings.provider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
            <option value="groq" ${aiSettings.provider === 'groq' ? 'selected' : ''}>Groq</option>
            <option value="cerebras" ${aiSettings.provider === 'cerebras' ? 'selected' : ''}>Cerebras</option>
          </select>
        </div>
        
        <div id="yt-ai-group-gemini" style="display:${aiSettings.provider === 'gemini' ? 'block' : 'none'};">
          <div class="yt-ai-group"><label>Gemini API Key</label><input type="password" id="yt-ai-cfg-gemini-key" value="${aiSettings.geminiApiKey || ''}"></div>
          <div class="yt-ai-group">
            <label>Model</label>
            <select id="yt-ai-cfg-gemini-model-sel">
              ${AI_MODEL_OPTIONS.gemini.map(m => `<option value="${m}" ${aiSettings.geminiModel === m ? 'selected' : ''}>${m}</option>`).join('')}
              <option value="custom">Custom...</option>
            </select>
            <input type="text" id="yt-ai-cfg-gemini-model" value="${aiSettings.geminiModel}" style="margin-top:4px;">
          </div>
        </div>
        
        <div id="yt-ai-group-openrouter" style="display:${aiSettings.provider === 'openrouter' ? 'block' : 'none'};">
          <div class="yt-ai-group"><label>OpenRouter Key</label><input type="password" id="yt-ai-cfg-openrouter-key" value="${aiSettings.openrouterApiKey || ''}"></div>
          <div class="yt-ai-group">
            <label>Model</label>
            <select id="yt-ai-cfg-openrouter-model-sel">
              ${AI_MODEL_OPTIONS.openrouter.map(m => `<option value="${m}" ${aiSettings.openrouterModel === m ? 'selected' : ''}>${m}</option>`).join('')}
              <option value="custom">Custom...</option>
            </select>
            <input type="text" id="yt-ai-cfg-openrouter-model" value="${aiSettings.openrouterModel}" style="margin-top:4px;">
          </div>
        </div>
        
        <div id="yt-ai-group-groq" style="display:${aiSettings.provider === 'groq' ? 'block' : 'none'};">
          <div class="yt-ai-group"><label>Groq Key</label><input type="password" id="yt-ai-cfg-groq-key" value="${aiSettings.groqApiKey || ''}"></div>
          <div class="yt-ai-group">
            <label>Model</label>
            <select id="yt-ai-cfg-groq-model-sel">
              ${AI_MODEL_OPTIONS.groq.map(m => `<option value="${m}" ${aiSettings.groqModel === m ? 'selected' : ''}>${m}</option>`).join('')}
              <option value="custom">Custom...</option>
            </select>
            <input type="text" id="yt-ai-cfg-groq-model" value="${aiSettings.groqModel}" style="margin-top:4px;">
          </div>
        </div>
        
        <div id="yt-ai-group-cerebras" style="display:${aiSettings.provider === 'cerebras' ? 'block' : 'none'};">
          <div class="yt-ai-group"><label>Cerebras Key</label><input type="password" id="yt-ai-cfg-cerebras-key" value="${aiSettings.cerebrasApiKey || ''}"></div>
          <div class="yt-ai-group">
            <label>Model</label>
            <select id="yt-ai-cfg-cerebras-model-sel">
              ${AI_MODEL_OPTIONS.cerebras.map(m => `<option value="${m}" ${aiSettings.cerebrasModel === m ? 'selected' : ''}>${m}</option>`).join('')}
              <option value="custom">Custom...</option>
            </select>
            <input type="text" id="yt-ai-cfg-cerebras-model" value="${aiSettings.cerebrasModel}" style="margin-top:4px;">
          </div>
        </div>
        
        <div style="border-top:1px solid #333; margin-top:8px; padding-top:8px;">
          <div class="yt-ai-group" style="flex-direction:row; align-items:center; justify-content:space-between;">
            <label for="yt-ai-cfg-typewriter" style="cursor:pointer;">Typewriter Effect</label>
            <input type="checkbox" id="yt-ai-cfg-typewriter" ${aiSettings.typewriterEnabled ? 'checked' : ''} style="width:auto;">
          </div>
          <div class="yt-ai-group">
            <label>Speed (ms)</label>
            <input type="number" id="yt-ai-cfg-typespeed" value="${aiSettings.typewriterSpeed || 10}" min="1" max="50">
          </div>
        </div>
      </div>
      <div id="yt-ai-save-msg" style="font-size:11px; color:#0288d1; display:none;">✓ Saved</div>
    `;
    this.panelElement = p;

    const pSel = p.querySelector('#yt-ai-cfg-provider');
    pSel.onchange = () => {
      ['gemini', 'openrouter', 'groq', 'cerebras'].forEach(x => {
        p.querySelector(`#yt-ai-group-${x}`).style.display = pSel.value === x ? 'block' : 'none';
      });
    };

    const link = (sid, iid) => {
      const s = p.querySelector('#' + sid), i = p.querySelector('#' + iid);
      if (s && i) {
        s.onchange = () => {
          if (s.value !== 'custom') i.value = s.value;
          else i.focus();
        };
      }
    };
    
    link('yt-ai-cfg-gemini-model-sel', 'yt-ai-cfg-gemini-model');
    link('yt-ai-cfg-openrouter-model-sel', 'yt-ai-cfg-openrouter-model');
    link('yt-ai-cfg-groq-model-sel', 'yt-ai-cfg-groq-model');
    link('yt-ai-cfg-cerebras-model-sel', 'yt-ai-cfg-cerebras-model');

    p.querySelector('#yt-ai-save-btn').onclick = () => {
      aiSettings.provider = pSel.value;
      aiSettings.geminiApiKey = p.querySelector('#yt-ai-cfg-gemini-key').value.trim();
      aiSettings.geminiModel = p.querySelector('#yt-ai-cfg-gemini-model').value.trim();
      aiSettings.openrouterApiKey = p.querySelector('#yt-ai-cfg-openrouter-key').value.trim();
      aiSettings.openrouterModel = p.querySelector('#yt-ai-cfg-openrouter-model').value.trim();
      aiSettings.groqApiKey = p.querySelector('#yt-ai-cfg-groq-key').value.trim();
      aiSettings.groqModel = p.querySelector('#yt-ai-cfg-groq-model').value.trim();
      aiSettings.cerebrasApiKey = p.querySelector('#yt-ai-cfg-cerebras-key').value.trim();
      aiSettings.cerebrasModel = p.querySelector('#yt-ai-cfg-cerebras-model').value.trim();
      aiSettings.typewriterEnabled = p.querySelector('#yt-ai-cfg-typewriter').checked;
      aiSettings.typewriterSpeed = parseInt(p.querySelector('#yt-ai-cfg-typespeed').value, 10) || 10;
      saveAiSettings();
      const m = p.querySelector('#yt-ai-save-msg');
      m.style.display = 'block';
      setTimeout(() => m.style.display = 'none', 2000);
    };
  }
};

/* ================= MODULE: PotPlayer ================= */
const YtPotPlayer = {
  state: { running: false, stopped: false, videoIds: [], failed: [], total: 0, current: 0, resolvedUrl: '' },
  panelElement: null,

  init() { this.buildUI(); },

  buildUI() {
    if (this.panelElement) return;
    const p = document.createElement('div');
    p.id = 'ptb-panel';
    p.innerHTML = `
      <div id="ptb-header">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <div id="ptb-header-text"><h3>PotPlayer Playlist Builder</h3><p>Paste tracks → search → stream or save</p></div>
      </div>
      <div id="ptb-body">
        <div id="ptb-input-section">
          <label>Track list</label>
          <textarea id="ptb-textarea" placeholder="Artist - Song"></textarea>
          <div id="ptb-name-row">
            <div style="flex:1"><label>Playlist name</label><input id="ptb-name" type="text" placeholder="PotPlayer Mix" /></div>
            <button id="ptb-run">▶ Build</button>
          </div>
        </div>
        <div id="ptb-progress-wrap">
          <div id="ptb-progress-bar-bg"><div id="ptb-progress-bar"></div></div>
          <div id="ptb-progress-label"><span id="ptb-progress-count">0 / 0</span><span id="ptb-progress-pct">0%</span></div>
          <div id="ptb-current-track">Searching…</div>
          <button id="ptb-stop">■ Stop</button>
        </div>
        <div id="ptb-result">
          <div id="ptb-result-title"></div>
          <div class="ptb-url-label">🎵 PotPlayer URL</div>
          <div id="ptb-url-box" class="ptb-url-box">⏳ Resolving…</div>
          <div id="ptb-result-actions">
            <button class="ptb-action-btn" id="ptb-copy-btn" disabled>📋 Copy</button>
            <button class="ptb-action-btn" id="ptb-open-btn" disabled>▶ Open</button>
            <button class="ptb-action-btn" id="ptb-new-btn">↺ New</button>
          </div>
          <details id="ptb-failed" style="display:none;"><summary style="cursor:pointer; font-size:11px;">⚠ Failed (<span id="ptb-fail-count">0</span>)</summary><ul id="ptb-fail-list"></ul></details>
        </div>
      </div>
    `;
    const toast = document.createElement('div');
    toast.id = 'ptb-toast';
    this.panelElement = p;
    document.body.append(toast);
    
    setTimeout(() => {
      const add = (id, ev, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
      };
      add('ptb-run', 'click', () => this.onRun());
      add('ptb-stop', 'click', () => this.onStop());
      add('ptb-copy-btn', 'click', () => this.onCopy());
      add('ptb-url-box', 'click', () => this.onCopy());
      add('ptb-open-btn', 'click', () => this.openResolved());
      add('ptb-new-btn', 'click', () => this.onReset());
      const s = GM_getValue('ptb_tracks', '');
      if (s) {
        const ta = document.getElementById('ptb-textarea');
        if (ta) ta.value = s;
      }
    }, 300);
  },

  async searchVideo(q) {
    const key = window.ytcfg?.get?.('INNERTUBE_API_KEY') || PTB_CFG.INNERTUBE_KEY;
    const resp = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: PTB_CFG.INNERTUBE_CLIENT }, query: q, params: 'EgIQAQ%3D%3D' })
    });
    if (!resp.ok) throw new Error(resp.status);
    const d = await resp.json();
    const cont = d?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
    const vs = [];
    for (const sec of cont) {
      for (const it of (sec?.itemSectionRenderer?.contents ?? [])) {
        const v = it?.videoRenderer;
        if (!v?.videoId) continue;
        vs.push({ id: v.videoId, title: v.title?.runs?.[0]?.text ?? '' });
        if (vs.length >= PTB_CFG.MAX_RESULTS) break;
      }
      if (vs.length >= PTB_CFG.MAX_RESULTS) break;
    }
    return vs;
  },

  bestMatch(vs, q) {
    if (!vs.length) return null;
    const w = q.toLowerCase().split(/\s+/);
    let b = vs[0], bs = -1;
    for (const v of vs) {
      const s = w.reduce((acc, ww) => acc + (v.title.toLowerCase().includes(ww) ? 1 : 0), 0);
      if (s > bs) { bs = s; b = v; }
    }
    return b;
  },

  resolveWatchVideosUrl(url) {
    return new Promise(res => {
      const ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:fixed;width:0;height:0;opacity:0;';
      ifr.src = url;
      const done = r => {
        clearTimeout(tm);
        ifr.remove();
        res(r);
      };
      const tm = setTimeout(() => done(url), 8000);
      ifr.addEventListener('load', () => {
        try {
          const l = ifr.contentWindow.location.href;
          done(l && l !== 'about:blank' ? l : url);
        } catch(_) { done(url); }
      });
      document.body.appendChild(ifr);
    });
  },

  parseLines(txt) {
    const R = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;
    return txt.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => {
        const m = R.exec(l);
        return m ? { query: l, videoId: m[1] } : { query: l, videoId: null };
      });
  },

  setProgress(done, total, label) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('ptb-progress-bar').style.width = pct + '%';
    document.getElementById('ptb-progress-count').textContent = `${done} / ${total}`;
    document.getElementById('ptb-progress-pct').textContent = pct + '%';
    document.getElementById('ptb-current-track').textContent = label;
  },

  showToast(msg, ms = 1800) {
    const t = document.getElementById('ptb-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), ms);
  },

  showSection(w) {
    document.getElementById('ptb-input-section').style.display = w === 'input' ? '' : 'none';
    document.getElementById('ptb-progress-wrap').classList.toggle('visible', w === 'progress');
    document.getElementById('ptb-result').classList.toggle('visible', w === 'result');
  },

  unlockResultButtons(url) {
    ['ptb-copy-btn', 'ptb-open-btn'].forEach(id => document.getElementById(id).disabled = false);
    const b = document.getElementById('ptb-url-box');
    b.className = 'ptb-url-box';
    b.textContent = url;
    b.dataset.url = url;
  },

  openResolved() {
    const u = document.getElementById('ptb-url-box').dataset.url;
    if (u) window.open(u, '_blank');
  },

  async onRun() {
    const txt = document.getElementById('ptb-textarea').value;
    const name = document.getElementById('ptb-name').value.trim() || 'PotPlayer Mix';
    const tracks = this.parseLines(txt);
    if (!tracks.length) { this.showToast('No tracks'); return; }
    GM_setValue('ptb_tracks', txt);
    this.state = { running: true, stopped: false, videoIds: [], failed: this.state.failed || [], total: tracks.length, current: 0, resolvedUrl: '' };
    ['ptb-run', 'ptb-copy-btn', 'ptb-open-btn'].forEach(id => document.getElementById(id).disabled = true);
    this.showSection('progress');
    this.setProgress(0, tracks.length, 'Starting…');
    
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    for (let i = 0; i < tracks.length; i++) {
      if (this.state.stopped) break;
      const t = tracks[i];
      this.setProgress(i, tracks.length, `🔍 ${t.query}`);
      
      try {
        let vid = t.videoId;
        if (!vid) {
          const r = await this.searchVideo(t.query);
          vid = this.bestMatch(r, t.query)?.id ?? null;
        }
        if (vid) this.state.videoIds.push(vid);
        else this.state.failed.push(t.query);
      } catch(e) {
        this.state.failed.push(t.query + ' (err)');
      }
      
      this.setProgress(i + 1, tracks.length, i + 1 < tracks.length ? `✓ ${t.query}` : 'Done!');
      if (i < tracks.length - 1 && !this.state.stopped) await sleep(PTB_CFG.DELAY_MS);
    }
    
    this.state.running = false;
    document.getElementById('ptb-run').disabled = false;
    
    if (!this.state.videoIds.length) {
      this.showToast('No matches', 3000);
      this.showSection('input');
      return;
    }
    
    const added = this.state.videoIds.length, skipped = this.state.failed.length;
    document.getElementById('ptb-result-title').textContent = `✅ ${added} matched${skipped ? ' · ' + skipped + ' skipped' : ''}`;
    
    const fd = document.getElementById('ptb-failed');
    if (skipped) {
      fd.style.display = '';
      document.getElementById('ptb-fail-count').textContent = skipped;
      const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      document.getElementById('ptb-fail-list').innerHTML = this.state.failed.map(f => `<li>${esc(f)}</li>`).join('');
    } else {
      fd.style.display = 'none';
    }
    
    const ub = document.getElementById('ptb-url-box');
    ub.className = 'ptb-url-box';
    ub.textContent = '⏳ Resolving…';
    ub.dataset.url = '';
    this.showSection('result');
    
    const tu = `https://www.youtube.com/watch_videos?video_ids=${this.state.videoIds.join(',')}&title=${encodeURIComponent(name)}`;
    this.resolveWatchVideosUrl(tu).then(r => {
      this.state.resolvedUrl = r;
      this.unlockResultButtons(r);
      this.showToast('✓ URL ready!');
    });
  },

  onStop() { this.state.stopped = true; this.showToast('Stopping…'); },

  onCopy() {
    const u = document.getElementById('ptb-url-box').dataset.url;
    if (!u) { this.showToast('Not ready'); return; }
    navigator.clipboard.writeText(u).then(
      () => this.showToast('✓ Copied!'),
      () => prompt('Copy:', u)
    );
  },

  onReset() {
    this.showSection('input');
    ['ptb-result', 'ptb-progress-wrap'].forEach(id => document.getElementById(id).classList.remove('visible'));
  }
};

/* ================= YouTubeHub ================= */
const YouTubeHub = (() => {
  const SK_DATA = 'yt_hub_data', SK_SCROLL = 'yt_hub_scroll', SK_IDX = 'yt_hub_idx', SK_VIS = 'yt_hub_vis',
        SK_COLS = 'yt_hub_cols', SK_GEOM = 'yt_hub_geom_pro', SK_FSIZE = 'yt_hub_fsize', SK_FFAM = 'yt_hub_ffam',
        SK_TAB_MODE = 'yt_hub_tab_mode', SK_ACTIVE_TAB = 'yt_hub_active_tab', SK_AVATARS = 'yt_hub_avatars',
        SK_AVATAR_ONLY = 'yt_hub_avatar_only';
  
  const YT_RED = '#ff0000', CARD_BG = '#212121', CARD_ACTIVE = '#2b2b2b', BORDER_COLOR = 'rgba(255,255,255,0.12)', TEXT_PRI = '#f1f1f1', TEXT_SEC = '#aaaaaa';
  
  let channelGroups = [], currentIndex = -1, filterQuery = '', collapsedGroups = new Set(), isSyncing = false, syncAborted = false;
  let avatarCache = Store.get(SK_AVATARS, {}); if (typeof avatarCache !== 'object' || avatarCache === null) avatarCache = {};
  let avatarSaveTimer = null;
  
  const loadData = () => Store.get(SK_DATA, []);
  const saveData = d => Store.set(SK_DATA, d || []);
  const loadVis = () => Store.get(SK_VIS, false);
  const saveVis = v => Store.set(SK_VIS, !!v);
  const loadCols = () => +Store.get(SK_COLS, 1);
  const saveCols = v => Store.set(SK_COLS, v);
  const loadFSize = () => +Store.get(SK_FSIZE, 13);
  const saveFSize = v => Store.set(SK_FSIZE, v);
  const loadFFam = () => Store.get(SK_FFAM, '"Roboto","YouTube Sans",sans-serif');
  const saveFFam = v => Store.set(SK_FFAM, v);
  const loadTabMode = () => Store.get(SK_TAB_MODE, true);
  const saveTabMode = v => Store.set(SK_TAB_MODE, !!v);
  const loadActiveTab = () => Store.get(SK_ACTIVE_TAB, 'ALL');
  const saveActiveTab = v => Store.set(SK_ACTIVE_TAB, v);
  const loadAvatarOnly = () => Store.get(SK_AVATAR_ONLY, false);
  const saveAvatarOnly = v => Store.set(SK_AVATAR_ONLY, !!v);
  const saveIdx = i => { Store.set(SK_IDX, i); currentIndex = i; };
  const loadIdx = () => +Store.get(SK_IDX, -1);
  const defaultGeom = { scale: 1.0 };
  const loadGeom = () => Store.get(SK_GEOM, defaultGeom);
  const saveGeom = g => Store.set(SK_GEOM, g);

  function cacheAvatar(slug, url) {
    if (!slug) return;
    if (avatarCache[slug] === url) return;
    avatarCache[slug] = url || 'NONE';
    clearTimeout(avatarSaveTimer);
    avatarSaveTimer = setTimeout(() => {
      Store.set(SK_AVATARS, avatarCache);
      updateSyncLabel();
    }, 400);
  }
  
  function getAllItems() { return channelGroups.flatMap(g => g.items); }

  function parseChannelsFile(content) {
    const groups = [];
    let curGroup = null, curSub = '';
    
    function getGroup(title) {
      let g = groups.find(x => x.title.toLowerCase() === title.toLowerCase());
      if (!g) {
        g = { id: 'grp_' + Math.random().toString(36).substring(2, 9), title, items: [] };
        groups.push(g);
      }
      return g;
    }
    
    for (let rawLine of content.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line === '---' || line.startsWith('--- START') || line.startsWith('--- END')) continue;
      
      if (line.startsWith('## ')) {
        curGroup = getGroup(line.replace(/^##\s+/, '').trim());
        curSub = '';
      } else if (line.startsWith('### ')) {
        curSub = line.replace(/^###\s+/, '').trim();
      } else if (line.startsWith('# ')) {
        curGroup = getGroup(line.replace(/^#\s+/, '').trim());
        curSub = '';
      } else {
        if (!curGroup) curGroup = getGroup('General');
        const it = parseChannelEntry(line, curSub);
        if (it) curGroup.items.push(it);
      }
    }
    return groups.filter(g => g.items.length > 0);
  }
  
  function parseChannelEntry(line, sub) {
    let str = line.trim().replace(/^[-*+]\s+/, '');
    if (!str) return null;
    let url = '', name = '', slug = '';
    
    if (/^https?:\/\//i.test(str)) {
      let u;
      try { u = new URL(str); } catch(_) { return null; }
      const cp = u.pathname.replace(/\/videos\/?$/, '').replace(/\/featured\/?$/, '').replace(/\/+$/, '');
      url = `${window.location.origin}${cp}/videos`;
      slug = cp.replace(/^\/@?/, '').replace(/^\/channel\//, '');
      try { name = decodeURIComponent(slug); } catch(_) { name = slug; }
    } else if (/^channel(UC[\w-]{21,23})/i.test(str)) {
      const m = str.match(/^channel(UC[\w-]{21,23})/i);
      const cid = m[1];
      url = `${window.location.origin}/channel/${cid}/videos`;
      slug = cid;
      name = cid;
    } else if (str.startsWith('@')) {
      const h = str.slice(1).trim().replace(/\s+/g, '');
      url = `${window.location.origin}/@${h}/videos`;
      slug = h.toLowerCase();
      try { name = decodeURIComponent(h); } catch(_) { name = h; }
    } else {
      const c = str.replace(/^@/, '').replace(/\s+/g, '');
      url = `${window.location.origin}/@${c}/videos`;
      slug = c.toLowerCase();
      name = str;
    }
    return { raw: line, name, slug: slug.toLowerCase(), url, subgroup: sub || '' };
  }
  
  function getCurrentChannelSlug() {
    const p = window.location.pathname;
    const m = p.match(/^\/@([^/?#]+)/i) || p.match(/^\/channel\/([^/?#]+)/i) || p.match(/^\/c\/([^/?#]+)/i) || p.match(/^\/user\/([^/?#]+)/i);
    return m ? m[1].toLowerCase() : null;
  }
  
  function navigateTo(url) { if (url) window.location.href = url; }

  async function fetchChannelAvatar(channelUrl) {
    let pageUrl = channelUrl.replace(/\/videos\/?$/, '').replace(/^https?:\/\/(www\.|m\.)?youtube\.com/i, window.location.origin);
    try {
      const raw = await requestNetwork(pageUrl);
      const html = typeof raw === 'string' ? raw : '';
      if (html) {
        const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
        if (m && m[1] && !m[1].includes('youtube_logo')) return m[1].replace(/&amp;/g, '&');
      }
    } catch(_) {}
    return 'NONE';
  }
  
  async function startAvatarSync(force = false) {
    if (isSyncing) { syncAborted = true; isSyncing = false; updateSyncLabel(); return; }
    const all = getAllItems();
    if (!all.length) return;
    if (force) all.forEach(i => { delete avatarCache[i.slug]; });
    const q = all.filter(i => avatarCache[i.slug] === undefined);
    if (!q.length) { updateSyncLabel(); return; }
    
    isSyncing = true;
    syncAborted = false;
    const total = all.length;
    let done = total - q.length;
    updateSyncLabel(done, total);
    
    for (const item of q) {
      if (syncAborted) break;
      const u = await fetchChannelAvatar(item.url);
      cacheAvatar(item.slug, u);
      done++;
      updateSyncLabel(done, total);
      await new Promise(r => setTimeout(r, 160));
    }
    isSyncing = false;
    syncAborted = false;
    updateSyncLabel();
    renderHub();
  }
  
  function getStats() {
    const all = getAllItems();
    if (!all.length) return { cached: 0, failed: 0, pending: 0, total: 0 };
    const cached = all.filter(x => avatarCache[x.slug] && avatarCache[x.slug] !== 'NONE').length;
    const failed = all.filter(x => avatarCache[x.slug] === 'NONE').length;
    const pending = all.filter(x => avatarCache[x.slug] === undefined).length;
    return { cached, failed, pending, total: all.length };
  }
  
  function updateSyncLabel(cur, tot) {
    const b = document.getElementById('yt-hub-sync-btn');
    if (!b) return;
    const s = getStats();
    if (isSyncing) {
      const c = cur !== undefined ? cur : (s.total - s.pending);
      b.textContent = `⏳ ${c}/${tot !== undefined ? tot : s.total}`;
      b.style.background = 'rgba(255,0,0,0.35)';
      b.style.borderColor = '#ff0000';
    } else if (s.pending > 0) {
      b.textContent = `⚡ Sync (${s.cached}/${s.total})`;
      b.style.background = CARD_BG;
      b.style.borderColor = BORDER_COLOR;
    } else {
      b.textContent = `✓ Synced (${s.cached})`;
      b.style.background = 'rgba(255,0,0,0.2)';
      b.style.borderColor = '#ff0000';
    }
  }
  
  function scrapeAvatarsFromDOM() {
    document.querySelectorAll('ytd-channel-name, #owner, ytd-video-owner-renderer, ytm-media-item, ytm-c4-tabbed-header-renderer').forEach(box => {
      const link = box.querySelector('a[href*="/@"], a[href*="/channel/"]');
      const img = box.querySelector('img[src*="ggpht.com"], img[src*="googleusercontent.com"]');
      if (link && img && img.src && !img.src.includes('default_avatar')) {
        const path = link.getAttribute('href') || '';
        const m = path.match(/\/@([^/?#]+)/) || path.match(/\/channel\/([^/?#]+)/);
        if (m && m[1]) {
          const s = m[1].toLowerCase();
          if (!avatarCache[s] || avatarCache[s] === 'NONE') cacheAvatar(s, img.src);
        }
      }
    });
  }
  
  let observer = null;
  function getObserver() {
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(async e => {
          if (e.isIntersecting) {
            const box = e.target;
            observer.unobserve(box);
            const slug = box.dataset.slug, url = box.dataset.url;
            const img = box.querySelector('.yt-hub-avatar-img'), ph = box.querySelector('.yt-hub-avatar-placeholder');
            if (avatarCache[slug] && avatarCache[slug] !== 'NONE') {
              img.src = avatarCache[slug]; img.style.display = 'block'; ph.style.display = 'none';
            } else if (avatarCache[slug] === undefined) {
              const u = await fetchChannelAvatar(url);
              cacheAvatar(slug, u);
              if (u && u !== 'NONE') { img.src = u; img.style.display = 'block'; ph.style.display = 'none'; }
            }
          }
        });
      }, { root: document.getElementById('yt-hub-list-viewport'), rootMargin: '120px' });
    }
    return observer;
  }

  function ensureSidebar() {
    if (document.getElementById('yt-hub-sidebar')) return;
    const sb = document.createElement('div');
    sb.id = 'yt-hub-sidebar';
    Object.assign(sb.style, { position: 'relative', width: '100%', flex: '1', background: 'transparent', color: TEXT_PRI, display: 'none', flexDirection: 'column', fontSize: '13px', lineHeight: '1.5', overflow: 'hidden', fontFamily: loadFFam(), boxSizing: 'border-box' });
    
    const hdr = document.createElement('div');
    hdr.style.cssText = `display:flex; align-items:center; padding-bottom:6px; margin-bottom:6px; border-bottom:1px solid ${BORDER_COLOR}; gap:4px; flex-shrink:0; flex-wrap:wrap;`;
    const title = document.createElement('span');
    title.textContent = 'Channels Hub';
    title.style.cssText = 'flex:1; font-weight:700; color:#f1f1f1; font-size:13px; letter-spacing:.3px;';
    
    const uploadLabel = document.createElement('label');
    uploadLabel.title = 'Upload channels file'; uploadLabel.textContent = '📂'; uploadLabel.htmlFor = 'yt-hub-file-input';
    Object.assign(uploadLabel.style, { padding: '3px 7px', borderRadius: '14px', border: `1px solid ${BORDER_COLOR}`, cursor: 'pointer', background: CARD_BG, color: TEXT_PRI, fontSize: '11px', lineHeight: '1.2', display: 'inline-flex', alignItems: 'center' });
    
    const fileInput = document.createElement('input');
    fileInput.id = 'yt-hub-file-input'; fileInput.type = 'file'; fileInput.accept = '.txt,.md,text/plain';
    fileInput.style.cssText = 'position:absolute;left:-9999px;opacity:0;';
    uploadLabel.appendChild(fileInput);
    
    fileInput.onchange = ev => {
      const f = ev.target.files?.[0];
      if (f) {
        const r = new FileReader();
        r.onload = ({ target }) => {
          const p = parseChannelsFile(target.result || '');
          if (p.length) {
            channelGroups = p; currentIndex = -1;
            saveData(channelGroups); saveIdx(-1); saveVis(true); renderHub();
          }
        };
        r.readAsText(f);
      }
    };
    
    const pasteBtn = mkBtn('📋');
    pasteBtn.title = 'Paste channel list';
    pasteBtn.onclick = () => {
      const inp = prompt('Paste channel list:');
      if (inp && inp.trim()) {
        const p = parseChannelsFile(inp);
        if (p.length) {
          channelGroups = p; currentIndex = -1;
          saveData(channelGroups); saveIdx(-1); saveVis(true); renderHub();
        }
      }
    };
    
    const syncBtn = mkBtn('⚡ Sync');
    syncBtn.id = 'yt-hub-sync-btn';
    syncBtn.onclick = () => {
      const s = getStats();
      if (isSyncing) startAvatarSync();
      else if (s.pending === 0 && s.failed > 0) {
        if (confirm(`Re-check ${s.failed} avatars?`)) startAvatarSync(true);
      } else startAvatarSync();
    };
    
    const avatarOnlyBtn = mkBtn(loadAvatarOnly() ? '👤 Only' : '👤 + 📝');
    avatarOnlyBtn.onclick = () => {
      const n = !loadAvatarOnly();
      saveAvatarOnly(n);
      avatarOnlyBtn.textContent = n ? '👤 Only' : '👤 + 📝';
      avatarOnlyBtn.style.background = n ? 'rgba(255,0,0,0.25)' : CARD_BG;
      renderHub();
    };
    
    const tabBtn = mkBtn(loadTabMode() ? '📑 ON' : '☰ OFF', loadTabMode() ? 'rgba(255,0,0,0.25)' : CARD_BG);
    tabBtn.onclick = () => {
      const n = !loadTabMode();
      saveTabMode(n);
      tabBtn.textContent = n ? '📑 ON' : '☰ OFF';
      tabBtn.style.background = n ? 'rgba(255,0,0,0.25)' : CARD_BG;
      renderHub();
    };
    
    const colBtn = mkBtn(loadCols() + ' Col' + (loadCols() > 1 ? 's' : ''));
    colBtn.onclick = () => {
      const c = (loadCols() % 5) + 1;
      saveCols(c);
      colBtn.textContent = c + ' Col' + (c > 1 ? 's' : '');
      renderHub();
    };
    
    const clearBtn = mkBtn('Reset', '#251012');
    clearBtn.style.color = '#ff3b4b'; clearBtn.style.borderColor = '#3d161a';
    clearBtn.title = 'Clear loaded channels';
    clearBtn.onclick = () => {
      if (!confirm('Clear all channels?')) return;
      Store.remove(SK_DATA); Store.remove(SK_SCROLL); Store.remove(SK_IDX);
      channelGroups = []; currentIndex = -1;
      renderHub();
    };
    
    hdr.append(title, uploadLabel, pasteBtn, syncBtn, avatarOnlyBtn, tabBtn, colBtn, clearBtn);
    sb.appendChild(hdr);

    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = `display:flex; align-items:center; gap:5px; padding-bottom:6px; margin-bottom:6px; border-bottom:1px solid ${BORDER_COLOR}; flex-shrink:0;`;
    
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = `display:flex; align-items:center; flex:1; min-width:0; background:${CARD_BG}; border:1px solid ${BORDER_COLOR}; border-radius:14px; padding:0 6px;`;
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text'; searchInput.placeholder = '🔍 Search...';
    Object.assign(searchInput.style, { flex: '1', minWidth: '0', background: 'transparent', border: 'none', outline: 'none', color: TEXT_PRI, fontSize: '11px', padding: '3px 2px' });
    searchInput.oninput = e => { filterQuery = e.target.value.toLowerCase().trim(); renderHub(); };
    
    const clearSearch = document.createElement('span');
    clearSearch.textContent = '✕';
    clearSearch.style.cssText = 'cursor:pointer;color:#888;font-size:10px;padding:0 2px;';
    clearSearch.onclick = () => { searchInput.value = ''; filterQuery = ''; renderHub(); };
    
    searchWrap.append(searchInput, clearSearch);
    
    const sizeSelect = document.createElement('select');
    Object.assign(sizeSelect.style, { background: CARD_BG, color: TEXT_PRI, border: `1px solid ${BORDER_COLOR}`, borderRadius: '6px', padding: '2px 4px', fontSize: '11px', cursor: 'pointer', outline: 'none', width: '50px' });
    [10, 11, 12, 13, 14, 15, 16].forEach(sz => {
      const o = document.createElement('option');
      o.value = sz; o.textContent = sz + 'px';
      if (sz === loadFSize()) o.selected = true;
      sizeSelect.appendChild(o);
    });
    sizeSelect.onchange = () => { saveFSize(+sizeSelect.value); renderHub(); };
    
    controlsRow.append(searchWrap, sizeSelect);
    sb.appendChild(controlsRow);

    const tabBar = document.createElement('div');
    tabBar.id = 'yt-hub-tab-bar';
    tabBar.style.cssText = `display:none; overflow-x:auto; white-space:nowrap; gap:5px; padding:4px 0 6px 0; border-bottom:1px solid ${BORDER_COLOR}; scrollbar-width:none; flex-shrink:0;`;
    sb.appendChild(tabBar);
    
    const lc = document.createElement('div');
    lc.id = 'yt-hub-list-viewport';
    lc.style.cssText = 'flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding-right:2px;';
    sb.appendChild(lc);
    
    document.body.appendChild(sb);
    updateSyncLabel();
  }
  
  function mkBtn(label, bg) {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, { padding: '3px 7px', borderRadius: '14px', border: `1px solid ${BORDER_COLOR}`, cursor: 'pointer', background: bg || CARD_BG, color: TEXT_PRI, fontSize: '11px', lineHeight: '1.2', whiteSpace: 'nowrap', flexShrink: '0' });
    return b;
  }
  
  function mkPill(label, sel, fn) {
    const p = document.createElement('div');
    p.textContent = label;
    Object.assign(p.style, { padding: '3px 8px', borderRadius: '14px', fontSize: '11px', cursor: 'pointer', fontWeight: sel ? '600' : '400', background: sel ? YT_RED : CARD_BG, color: sel ? '#fff' : TEXT_SEC, border: `1px solid ${sel ? YT_RED : BORDER_COLOR}`, transition: 'all .15s ease' });
    p.onclick = fn;
    return p;
  }

  function renderHub() {
    ensureSidebar();
    const sb = document.getElementById('yt-hub-sidebar');
    const tabBar = document.getElementById('yt-hub-tab-bar');
    const vp = document.getElementById('yt-hub-list-viewport');
    if (!sb || !vp) return;
    
    while (vp.firstChild) vp.removeChild(vp.firstChild);
    while (tabBar.firstChild) tabBar.removeChild(tabBar.firstChild);
    
    if (!channelGroups.length) {
      const ew = document.createElement('div');
      ew.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:35px 10px;text-align:center;';
      ew.innerHTML = `<div style="font-size:32px;margin-bottom:8px;">📂</div><div style="font-weight:700;font-size:13px;color:#f1f1f1;margin-bottom:4px;">No Channels Loaded</div><div style="font-size:11px;color:#888;line-height:1.4;">Tap 📂 to select a file, or tap 📋 to paste channel URLs.</div>`;
      vp.appendChild(ew);
      tabBar.style.display = 'none';
      return;
    }
    
    const isTab = loadTabMode(), cols = loadCols(), fSize = loadFSize(), curTab = loadActiveTab(), curSlug = getCurrentChannelSlug(), isAvOnly = loadAvatarOnly();
    
    if (isTab) {
      tabBar.style.display = 'flex';
      const total = channelGroups.flatMap(g => g.items).length;
      tabBar.appendChild(mkPill(`All (${total})`, curTab === 'ALL', () => { saveActiveTab('ALL'); renderHub(); }));
      
      channelGroups.forEach((g, i) => {
        tabBar.appendChild(mkPill(`${g.title} (${g.items.length})`, curTab === String(i), () => { saveActiveTab(String(i)); renderHub(); }));
      });
      
      const ag = curTab === 'ALL' ? channelGroups : (channelGroups[+curTab] ? [channelGroups[+curTab]] : channelGroups);
      ag.forEach(g => renderGroupSection(g, vp, cols, fSize, curSlug, isAvOnly, false));
    } else {
      tabBar.style.display = 'none';
      channelGroups.forEach(g => renderGroupSection(g, vp, cols, fSize, curSlug, isAvOnly, true));
    }
    
    const savedScroll = Store.get(SK_SCROLL, 0);
    if (savedScroll) vp.scrollTop = +savedScroll;
    vp.onscroll = () => Store.set(SK_SCROLL, vp.scrollTop || 0);
    
    scrapeAvatarsFromDOM();
    updateSyncLabel();
  }
  
  function renderGroupSection(grp, container, cols, fSize, curSlug, isAvOnly, collapsible) {
    let items = grp.items;
    if (filterQuery) {
      items = items.filter(it => it.name.toLowerCase().includes(filterQuery) || it.slug.toLowerCase().includes(filterQuery) || it.subgroup.toLowerCase().includes(filterQuery));
    }
    if (!items.length) return;
    
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '10px';
    const isCollapsed = collapsedGroups.has(grp.title);
    
    const banner = document.createElement('div');
    banner.style.cssText = `font-size:${Math.round(fSize * 1.15)}px;font-weight:700;color:#f1f1f1;padding:6px 4px 4px 4px;border-bottom:1px solid ${BORDER_COLOR};margin-top:4px;display:flex;justify-content:space-between;align-items:center;${collapsible ? 'cursor:pointer;user-select:none;' : ''}`;
    
    const ts = document.createElement('span');
    ts.textContent = (collapsible ? (isCollapsed ? '▶ ' : '▼ ') : '') + grp.title;
    const cs = document.createElement('span');
    cs.style.cssText = 'font-size:10px;color:#888;';
    cs.textContent = items.length;
    
    banner.append(ts, cs);
    if (collapsible) {
      banner.onclick = () => {
        if (collapsedGroups.has(grp.title)) collapsedGroups.delete(grp.title);
        else collapsedGroups.add(grp.title);
        renderHub();
      };
    }
    wrap.appendChild(banner);
    
    if (isCollapsed && collapsible) {
      container.appendChild(wrap);
      return;
    }
    
    const grid = document.createElement('div');
    if (isAvOnly) {
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols === 1 ? 4 : cols},minmax(0,1fr));gap:6px;width:100%;align-content:start;justify-items:center;padding:4px 0;`;
    } else if (cols > 1) {
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:3px;width:100%;align-content:start;padding:3px 0;`;
    } else {
      grid.style.cssText = 'display:flex;flex-direction:column;gap:2px;width:100%;padding:2px 0;';
    }
    
    const obs = getObserver();
    
    items.forEach((item, itemIdx) => {
      const active = curSlug && (curSlug === item.slug);
      const card = document.createElement('a');
      card.href = item.url;
      card.title = `${item.name}${item.subgroup ? ' • ' + item.subgroup : ''}\nClick to view /videos`;
      
      if (isAvOnly) {
        Object.assign(card.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px', borderRadius: '50%', cursor: 'pointer', background: 'transparent', textDecoration: 'none', boxSizing: 'border-box' });
      } else {
        Object.assign(card.style, { display: 'flex', alignItems: 'center', gap: '0.5em', minWidth: '0', padding: '4px 6px', borderBottom: cols === 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', cursor: 'pointer', background: active ? CARD_ACTIVE : 'transparent', color: active ? '#fff' : TEXT_PRI, fontWeight: active ? '700' : 'normal', borderRadius: '8px', textDecoration: 'none', fontSize: fSize + 'px', lineHeight: '1.35', boxSizing: 'border-box', borderLeft: active ? `2.5px solid ${YT_RED}` : '2.5px solid transparent' });
      }
      
      card.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        saveIdx(itemIdx);
        renderHub();
        navigateTo(item.url);
      };
      
      const av = document.createElement('div');
      av.dataset.slug = item.slug;
      av.dataset.url = item.url;
      Object.assign(av.style, { width: '2.2em', height: '2.2em', minWidth: '2.2em', minHeight: '2.2em', borderRadius: '50%', background: '#2a2a2a', flexShrink: '0', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: active && isAvOnly ? `0 0 0 2.5px ${YT_RED},0 0 10px rgba(255,0,0,0.6)` : '0 1px 3px rgba(0,0,0,0.5)' });
      
      const ph = document.createElement('span');
      ph.className = 'yt-hub-avatar-placeholder';
      ph.textContent = (item.name.replace(/^@/, '')[0] || 'Y').toUpperCase();
      ph.style.cssText = 'font-size:0.9em;font-weight:700;color:#888;user-select:none;';
      
      const img = document.createElement('img');
      img.className = 'yt-hub-avatar-img';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:none;';
      img.onerror = () => { img.style.display = 'none'; ph.style.display = 'block'; };
      
      av.append(ph, img);
      
      const cached = avatarCache[item.slug];
      if (cached && cached !== 'NONE') {
        img.src = cached; img.style.display = 'block'; ph.style.display = 'none';
      } else if (cached === 'NONE') {
        ph.style.display = 'block'; img.style.display = 'none';
      } else {
        obs.observe(av);
      }
      
      card.append(av);
      
      if (!isAvOnly) {
        const info = document.createElement('div');
        info.style.cssText = 'min-width:0;flex:1;overflow:hidden;';
        const tl = document.createElement('div');
        tl.textContent = `${active ? '▶ ' : ''}${item.name}`;
        tl.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        info.appendChild(tl);
        
        if (item.subgroup && cols <= 2) {
          const sl = document.createElement('div');
          sl.textContent = item.subgroup;
          sl.style.cssText = 'font-size:9.5px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          info.appendChild(sl);
        }
        card.appendChild(info);
      }
      grid.appendChild(card);
    });
    
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  return {
    ensureSidebar,
    renderHub,
    loadInitial: () => {
      channelGroups = loadData();
      currentIndex = loadIdx();
      renderHub();
    }
  };
})();

const YtAnchor = {
  anchored: false, spacerEl: null, debounceTimer: null,
  q: sel => document.querySelector(sel),
  isWatch: () => location.pathname === '/watch',
  ensureSpacer() {
    if (this.spacerEl && this.spacerEl.isConnected) return this.spacerEl;
    this.spacerEl = document.getElementById('yt-anchor-spacer');
    if (!this.spacerEl) { this.spacerEl = document.createElement('div'); this.spacerEl.id = 'yt-anchor-spacer'; }
    const below = this.q('#below'); if (below && below.parentNode) below.parentNode.insertBefore(this.spacerEl, below);
    return this.spacerEl;
  },
  anchor() {
    if (!this.isWatch() || !cfg.layout.anchorMode) return;
    const player = this.q('#movie_player'); if (!player) return;
    if (player.style.position === 'fixed') return;

    const rect = player.getBoundingClientRect();
    const w = Math.round(rect.width || player.offsetWidth);
    const h = Math.round(rect.height || player.offsetHeight);

    player.style.position = 'fixed';
    player.style.left = '5px';
    player.style.top = '56px';
    player.style.width = w + 'px';
    player.style.height = h + 'px';
    player.style.zIndex = '1000';

    const spacer = this.ensureSpacer();
    spacer.style.height = (56 + h + 16) + 'px';
    spacer.style.display = 'block';

    const primary = this.q('#primary');
    if (primary) primary.style.paddingLeft = (5 + w + 16) + 'px';

    this.anchored = true;
    this.updateScrollBtn();
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
    const primary = this.q('#primary'); if (primary) primary.style.paddingLeft = '';
    if (this.spacerEl) { this.spacerEl.style.display = 'none'; this.spacerEl.style.height = '0'; }

    this.anchored = false;
    this.updateScrollBtn();
  },
  updateScrollBtn() {
    let scrollBtn = document.getElementById('yt-anchor-scroll-top');
    if (!scrollBtn && this.anchored) {
      scrollBtn = document.createElement('button'); scrollBtn.id = 'yt-anchor-scroll-top';
      scrollBtn.textContent = '▲ Player'; scrollBtn.title = 'Scroll back to the top to see the player';
      scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      document.body.appendChild(scrollBtn);
    }
    if (scrollBtn) scrollBtn.style.display = this.anchored ? 'block' : 'none';
  },
  init() {
    window.addEventListener('resize', () => { if (this.anchored) { this.unanchor(); this.anchor(); } });
    window.addEventListener('yt-navigate-finish', () => {
      if (!this.isWatch()) { if (this.anchored) this.unanchor(); return; }
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        if (cfg.layout.anchorMode) {
          if (this.anchored) this.unanchor();
          this.anchor();
        } else {
          this.unanchor();
        }
      }, 300);
    });
    if (cfg.layout.anchorMode) {
      setTimeout(() => this.anchor(), 2000);
    }
  }
};

/* ================= YouTubePro ================= */
const YouTubePro = (() => {
  const FONTS = [
    { label: 'YouTube Sans / Roboto', value: '"Roboto","YouTube Sans",system-ui,sans-serif' },
    { label: 'Inter', value: '"Inter",sans-serif' },
    { label: 'Josefin Sans', value: '"Josefin Sans",sans-serif' },
    { label: 'Bodoni Moda', value: "'Bodoni Moda',serif" },
    { label: 'Playfair Display', value: "'Playfair Display',serif" },
    { label: 'Great Vibes', value: "'Great Vibes',cursive" },
    { label: 'Courier Prime', value: "'Courier Prime',monospace" },
    { label: 'Lora', value: "'Lora',serif" },
    { label: 'Georgia', value: 'Georgia,serif' },
    { label: 'Arial', value: 'Arial,sans-serif' },
    { label: 'Helvetica Neue', value: '"Helvetica Neue",Helvetica,Arial,sans-serif' },
    { label: 'Open Sans', value: '"Open Sans",sans-serif' }
  ];
  
  function fontOptions(sel) {
    return FONTS.map(f => `<option value="${f.value.replace(/"/g, '&quot;')}"${f.value === sel ? ' selected' : ''}>${f.label}</option>`).join('');
  }

  function buildPanel() {
    if (document.getElementById('yt-pro-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'yt-pro-panel';
    Object.assign(panel.style, { position: 'relative', width: '100%', flex: '1', display: 'none', flexDirection: 'column', background: 'transparent', color: '#f1f1f1', fontFamily: '"Roboto","Segoe UI",sans-serif', fontSize: '12px', overflow: 'hidden', boxSizing: 'border-box' });
    
    const isMobileNow = window.location.hostname === 'm.youtube.com';
    const tp = cfg.typo;
    const typoSlots = [
      { id: 'videoTitle', label: 'Video Titles', min: 10, max: 28 },
      { id: 'channelName', label: 'Channel Names', min: 9, max: 22 },
      { id: 'comments', label: 'Comment Text', min: 9, max: 22 },
      { id: 'uiLabels', label: 'UI / Nav Labels', min: 9, max: 20 }
    ];
    
    let typoHTML = '';
    typoSlots.forEach(s => {
      const c = tp[s.id];
      typoHTML += `
        <div style="padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px;">${s.label}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="color:#888;">Font</span>
            <select data-typo="${s.id}" data-prop="font" style="font-size:11px;padding:3px 5px;border-radius:5px;border:1px solid #333;background:#222;color:#eee;max-width:170px;outline:none;">${fontOptions(c.font)}</select>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:#888;width:35px;">Size</span>
            <input type="range" data-typo="${s.id}" data-prop="size" min="${s.min}" max="${s.max}" step="1" value="${c.size}" style="flex:1;accent-color:#f00;height:3px;">
            <span data-out="${s.id}-size" style="color:#888;font-size:10px;width:30px;text-align:right;">${c.size}px</span>
          </div>
        </div>
      `;
    });
    
    typoHTML += `
      <div style="padding:8px 12px;">
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px;">Title Extras</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <span style="color:#888;width:70px;">Line Height</span>
          <input type="range" data-extra="lineHeight" min="10" max="22" step="1" value="${Math.round(tp.extra.lineHeight * 10)}" style="flex:1;accent-color:#f00;height:3px;">
          <span data-out="extra-lineHeight" style="color:#888;font-size:10px;width:30px;text-align:right;">${tp.extra.lineHeight.toFixed(1)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:#888;width:70px;">Tracking</span>
          <input type="range" data-extra="letterSpacing" min="-3" max="8" step="1" value="${tp.extra.letterSpacing}" style="flex:1;accent-color:#f00;height:3px;">
          <span data-out="extra-letterSpacing" style="color:#888;font-size:10px;width:30px;text-align:right;">${tp.extra.letterSpacing}px</span>
        </div>
      </div>
    `;
    
    const u = cfg.ui;
    const uiHTML = `
      <div style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Layout & Appearance</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="color:#888;width:95px;">Feed Cols</span>
          <input type="range" id="ytp-feed-cols" min="1" max="4" step="1" value="${u.mobileFeedColumns || 1}" style="flex:1;accent-color:#f00;height:3px;">
          <span id="ytp-feed-cols-val" style="color:#888;font-size:10px;width:30px;text-align:right;">${u.mobileFeedColumns || 1} Col</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="color:#888;width:95px;">Watch Scale</span>
          <input type="range" id="ytp-watch-scale" min="40" max="100" step="5" value="${u.watchDetailsScale || 75}" style="flex:1;accent-color:#f00;height:3px;">
          <span id="ytp-watch-scale-val" style="color:#888;font-size:10px;width:30px;text-align:right;">${u.watchDetailsScale || 75}%</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="color:#888;width:95px;">Thumb Radius</span>
          <input type="range" id="ytp-thumb-radius" min="0" max="24" step="1" value="${u.thumbRadius}" style="flex:1;accent-color:#f00;height:3px;">
          <span id="ytp-thumb-radius-val" style="color:#888;font-size:10px;width:30px;text-align:right;">${u.thumbRadius}px</span>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06); margin:8px 0;"></div>
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Lucky Panel Scaling</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="color:#888;width:95px;">Scale</span>
          <input type="range" id="ytp-lucky-scale" min="70" max="125" step="5" value="${u.luckyScale || 100}" style="flex:1;accent-color:#f00;height:3px;">
          <span id="ytp-lucky-scale-val" style="color:#888;font-size:10px;width:35px;text-align:right;">${u.luckyScale || 100}%</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="color:#888;width:95px;">Height</span>
          <input type="range" id="ytp-lucky-height" min="25" max="80" step="5" value="${u.luckyHeightVh || 45}" style="flex:1;accent-color:#f00;height:3px;">
          <span id="ytp-lucky-height-val" style="color:#888;font-size:10px;width:35px;text-align:right;">${u.luckyHeightVh || 45}vh</span>
        </div>
      </div>
    `;
    
    const lo = cfg.layout;
    const layoutHTML = `
      <div style="padding:10px 12px;">
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Feed Position</div>
        <div id="ytp-feed-display" style="text-align:center;font-size:20px;font-weight:300;color:#f1f1f1;padding:2px 0 6px;">${lo.feedOffset > 0 ? '+' : ''}${lo.feedOffset} px</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <input type="range" id="ytp-feed-slider" min="-600" max="600" step="1" value="${lo.feedOffset}" style="flex:1;accent-color:#f00;height:3px;">
          <span id="ytp-feed-val" style="color:#888;font-size:10px;width:34px;text-align:right;">${lo.feedOffset}px</span>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button id="ytp-feed-left" style="flex:1;padding:5px;border-radius:5px;border:1px solid #333;background:#222;color:#ccc;font-size:11px;cursor:pointer;">◀</button>
          <button id="ytp-feed-reset" style="flex:1;padding:5px;border-radius:5px;border:1px solid #333;background:#222;color:#ccc;font-size:11px;cursor:pointer;">↺</button>
          <button id="ytp-feed-right" style="flex:1;padding:5px;border-radius:5px;border:1px solid #333;background:#222;color:#ccc;font-size:11px;cursor:pointer;">▶</button>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;">
          <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;cursor:pointer;">
            <span style="color:#aaa;">Disable Repositioner</span>
            <input type="checkbox" id="ytp-feed-disabled" ${lo.feedDisabled ? 'checked' : ''}>
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
            <span style="color:#aaa;">Hide Left Guide</span>
            <input type="checkbox" id="ytp-hide-sidebar" ${lo.hideSidebar ? 'checked' : ''}>
          </label>
		  <!-- ADD THIS CHECKBOX -->
  <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
    <span style="color:#aaa;">Anchor Edge Player</span>
    <input type="checkbox" id="ytp-anchor-mode" ${lo.anchorMode ? 'checked' : ''}>
  </label>
</div>
        </div>
      </div>
    `;
    
    const t = cfg.toggles;
    function tog(id, label, isSub = false) {
      return `
        <label style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;margin-left:${isSub ? '18px' : '0'};cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.03);">
          <span style="color:${isSub ? '#999' : '#ccc'};font-size:${isSub ? '11px' : '12px'};">${label}</span>
          <input type="checkbox" data-tog="${id}" ${t[id] ? 'checked' : ''} style="accent-color:#f00;cursor:pointer;">
        </label>
      `;
    }
    
    const togglesHTML = `
      <div style="padding:10px 12px;">
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Feeds & Shelves</div>
        ${tog('hideHomeFeed', 'Hide Home Feed')}
        ${tog('hideShorts', 'Hide Shorts')}
        ${tog('hideInaptSearch', 'Hide Inapt Search')}
        ${tog('hideExploreTrending', 'Hide Explore/Trending')}
        ${tog('hideMoreFromYouTube', 'Hide More from YouTube')}
        ${tog('hideSubscriptions', 'Hide Subscriptions')}
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin:10px 0 6px;">Watch Page & Details</div>
        ${tog('hideVideoInfo', 'Hide Video Info')}
        ${tog('hideComments', 'Hide Comments')}
        ${tog('hideVideoSidebar', 'Hide Sidebar / Related')}
        ${tog('hideRecommended', 'Hide Recommended', true)}
        ${tog('hideLiveChat', 'Hide Live Chat', true)}
        ${tog('hideWatchPlaylist', 'Hide Playlist Panel', true)}
        ${tog('hideFundraiser', 'Hide Fundraiser', true)}
        ${tog('hideMixes', 'Hide YouTube Mixes')}
        ${tog('hideMerchOffers', 'Hide Merch/Tickets')}
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin:10px 0 6px;">Header, Player & Cards</div>
        ${tog('hideTopHeader', 'Hide Top Header')}
        ${tog('hideNotifications', 'Hide Notifications', true)}
        ${tog('hideEndScreenFeed', 'Hide End Screen Feed')}
        ${tog('hideEndScreenCards', 'Hide End Screen Cards')}
        ${tog('disableAutoplay', 'Disable Autoplay')}
        ${tog('disableAnnotations', 'Disable Annotations')}
      </div>
    `;
    
    const o = cfg.opt;
    function optItem(id, label, desc) {
      return `
        <label style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);">
          <div>
            <div style="color:#eee;font-size:12px;">${label}</div>
            ${desc ? `<div style="color:#777;font-size:10px;line-height:1.3;margin-top:1px;">${desc}</div>` : ''}
          </div>
          <input type="checkbox" data-opt="${id}" ${o[id] ? 'checked' : ''} style="accent-color:#f00;margin-top:2px;cursor:pointer;">
        </label>
      `;
    }
    
    const optHTML = `
      <div style="padding:10px 12px;">
        <div style="font-size:9.5px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Performance & Features</div>
        ${optItem('force30fps', '⚡ Force 30 FPS', 'Caps framerate to reduce CPU/battery.')}
        ${optItem('twoRowHeader', '🔍 Two-Row Header', 'Search bar on second row.')}
        ${optItem('autoRedirectVideos', '▶ Auto-Redirect to /videos', 'Open Videos tab on channel pages.')}
        ${optItem('optimizeScrolling', '🚀 HW-Accelerated Rendering', 'GPU layers on thumbnails.')}
      </div>
    `;
    
    const content = `
      <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;background:#1b1b1b;">
        <div style="display:flex;align-items:center;gap:6px;">
          <svg height="14" viewBox="0 0 24 24" width="14" style="fill:#ff0000;"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          <strong style="font-size:13px;color:#f1f1f1;">YouTube Pro</strong>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button id="ytp-mode-toggle" style="background:#222;border:1px solid #444;color:#fff;border-radius:12px;font-size:10px;padding:2px 7px;cursor:pointer;">${isMobileNow ? '🖥️ Desktop' : '📱 Mobile'}</button>
        </div>
      </div>
      <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.08);background:#181818;">
        <button class="ytp-tab" data-tab="feed" style="flex:1;padding:7px 0;background:none;border:none;color:#f1f1f1;font-size:10px;font-weight:700;text-transform:uppercase;cursor:pointer;border-bottom:2px solid #ff0000;">Feed</button>
        <button class="ytp-tab" data-tab="type" style="flex:1;padding:7px 0;background:none;border:none;color:#777;font-size:10px;font-weight:700;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;">Type</button>
        <button class="ytp-tab" data-tab="ui" style="flex:1;padding:7px 0;background:none;border:none;color:#777;font-size:10px;font-weight:700;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;">UI</button>
        <button class="ytp-tab" data-tab="toggles" style="flex:1;padding:7px 0;background:none;border:none;color:#777;font-size:10px;font-weight:700;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;">Toggles</button>
        <button class="ytp-tab" data-tab="opt" style="flex:1;padding:7px 0;background:none;border:none;color:#777;font-size:10px;font-weight:700;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;">Opt</button>
      </div>
      <div class="ytp-view" id="ytp-view-feed" style="display:block; overflow-y:auto; flex:1;">${layoutHTML}</div>
      <div class="ytp-view" id="ytp-view-type" style="display:none; overflow-y:auto; flex:1;">${typoHTML}</div>
      <div class="ytp-view" id="ytp-view-ui" style="display:none; overflow-y:auto; flex:1;">${uiHTML}</div>
      <div class="ytp-view" id="ytp-view-toggles" style="display:none; overflow-y:auto; flex:1;">${togglesHTML}</div>
      <div class="ytp-view" id="ytp-view-opt" style="display:none; overflow-y:auto; flex:1;">${optHTML}</div>
      <div style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;background:#181818;">
        <button id="ytp-reset-btn" style="flex:1;padding:6px;border-radius:5px;border:1px solid #3d1519;background:#200d10;color:#ff3040;font-size:11px;cursor:pointer;">Reset Defaults</button>
      </div>
    `;
    
    setSafeDOM(panel, content);
    document.body.appendChild(panel);
    
    panel.querySelector('#ytp-anchor-mode').onchange = e => {
  cfg.layout.anchorMode = e.target.checked;
  saveProSettings();
  if (e.target.checked) YtAnchor.anchor();
  else YtAnchor.unanchor();
};
    
    panel.querySelectorAll('.ytp-tab').forEach(tab => {
      tab.onclick = () => {
        panel.querySelectorAll('.ytp-tab').forEach(t => { t.style.color = '#777'; t.style.borderBottomColor = 'transparent'; });
        panel.querySelectorAll('.ytp-view').forEach(v => v.style.display = 'none');
        tab.style.color = '#f1f1f1';
        tab.style.borderBottomColor = '#ff0000';
        panel.querySelector(`#ytp-view-${tab.dataset.tab}`).style.display = 'block';
      };
    });
    
    panel.querySelectorAll('select[data-typo]').forEach(s => {
      s.onchange = e => {
        cfg.typo[e.target.dataset.typo].font = e.target.value;
        saveProSettings(); applyProStyles();
      };
    });
    
    panel.querySelectorAll('input[type=range][data-typo]').forEach(r => {
      r.oninput = e => {
        const v = +e.target.value;
        cfg.typo[e.target.dataset.typo].size = v;
        panel.querySelector(`[data-out="${e.target.dataset.typo}-size"]`).textContent = v + 'px';
        saveProSettings(); applyProStyles();
      };
    });
    
    panel.querySelectorAll('input[type=range][data-extra]').forEach(r => {
      r.oninput = e => {
        const k = e.target.dataset.extra;
        const raw = +e.target.value;
        const v = k === 'lineHeight' ? raw / 10 : raw;
        cfg.typo.extra[k] = v;
        panel.querySelector(`[data-out="extra-${k}"]`).textContent = k === 'lineHeight' ? v.toFixed(1) : v + 'px';
        saveProSettings(); applyProStyles();
      };
    });
    
    const feedColSlider = panel.querySelector('#ytp-feed-cols');
    if (feedColSlider) {
      feedColSlider.oninput = e => {
        const v = +e.target.value;
        cfg.ui.mobileFeedColumns = v;
        panel.querySelector('#ytp-feed-cols-val').textContent = v + ' Col';
        saveProSettings(); applyProStyles();
      };
    }
    
    const watchScaleSlider = panel.querySelector('#ytp-watch-scale');
    if (watchScaleSlider) {
      watchScaleSlider.oninput = e => {
        const v = +e.target.value;
        cfg.ui.watchDetailsScale = v;
        panel.querySelector('#ytp-watch-scale-val').textContent = v + '%';
        saveProSettings(); applyProStyles();
      };
    }
    
    const thumbSlider = panel.querySelector('#ytp-thumb-radius');
    if (thumbSlider) {
      thumbSlider.oninput = e => {
        const v = +e.target.value;
        cfg.ui.thumbRadius = v;
        panel.querySelector('#ytp-thumb-radius-val').textContent = v + 'px';
        saveProSettings(); applyProStyles();
      };
    }
    
    const luckyScaleSlider = panel.querySelector('#ytp-lucky-scale');
    if (luckyScaleSlider) {
      luckyScaleSlider.oninput = e => {
        const v = +e.target.value;
        cfg.ui.luckyScale = v;
        panel.querySelector('#ytp-lucky-scale-val').textContent = v + '%';
        saveProSettings();
        if (window._ytLuckyApplyScale) window._ytLuckyApplyScale(v / 100);
      };
    }
    
    const luckyHeightSlider = panel.querySelector('#ytp-lucky-height');
    if (luckyHeightSlider) {
      luckyHeightSlider.oninput = e => {
        const v = +e.target.value;
        cfg.ui.luckyHeightVh = v;
        panel.querySelector('#ytp-lucky-height-val').textContent = v + 'vh';
        saveProSettings();
        if (window._ytLuckyApplyHeight) window._ytLuckyApplyHeight(v);
      };
    }
    
    const sldr = panel.querySelector('#ytp-feed-slider');
    if (sldr) {
      sldr.oninput = e => {
        setFeedOffset(+e.target.value);
        panel.querySelector('#ytp-feed-display').textContent = `${cfg.layout.feedOffset > 0 ? '+' : ''}${cfg.layout.feedOffset} px`;
        panel.querySelector('#ytp-feed-val').textContent = cfg.layout.feedOffset + 'px';
      };
    }
    
    panel.querySelector('#ytp-feed-left').onclick = () => {
      setFeedOffset(cfg.layout.feedOffset - 20);
      if (sldr) sldr.value = cfg.layout.feedOffset;
      panel.querySelector('#ytp-feed-display').textContent = `${cfg.layout.feedOffset > 0 ? '+' : ''}${cfg.layout.feedOffset} px`;
      panel.querySelector('#ytp-feed-val').textContent = cfg.layout.feedOffset + 'px';
    };
    
    panel.querySelector('#ytp-feed-right').onclick = () => {
      setFeedOffset(cfg.layout.feedOffset + 20);
      if (sldr) sldr.value = cfg.layout.feedOffset;
      panel.querySelector('#ytp-feed-display').textContent = `${cfg.layout.feedOffset > 0 ? '+' : ''}${cfg.layout.feedOffset} px`;
      panel.querySelector('#ytp-feed-val').textContent = cfg.layout.feedOffset + 'px';
    };
    
    panel.querySelector('#ytp-feed-reset').onclick = () => {
      setFeedOffset(0);
      if (sldr) sldr.value = 0;
      panel.querySelector('#ytp-feed-display').textContent = '0 px';
      panel.querySelector('#ytp-feed-val').textContent = '0px';
    };
    
    panel.querySelector('#ytp-feed-disabled').onchange = e => {
      cfg.layout.feedDisabled = e.target.checked;
      if (e.target.checked) clearFeedOffset();
      else applyFeedOffset(cfg.layout.feedOffset);
      saveProSettings();
    };
    
    panel.querySelector('#ytp-hide-sidebar').onchange = e => {
      cfg.layout.hideSidebar = e.target.checked;
      saveProSettings(); applyProStyles();
    };
    
    panel.querySelectorAll('input[type=checkbox][data-tog]').forEach(c => {
      c.onchange = e => {
        cfg.toggles[e.target.dataset.tog] = e.target.checked;
        saveProSettings(); applyProStyles();
      };
    });
    
    panel.querySelectorAll('input[type=checkbox][data-opt]').forEach(c => {
      c.onchange = e => {
        cfg.opt[e.target.dataset.opt] = e.target.checked;
        saveProSettings(); applyProStyles();
      };
    });
    
    panel.querySelector('#ytp-reset-btn').onclick = () => {
      if (!confirm('Reset all Pro settings?')) return;
      cfg = buildDefaultProSettings();
      saveProSettings(); clearFeedOffset();
      panel.remove(); buildPanel(); applyProStyles();
    };
  }
  return { buildPanel };
})();

/* ================= Lucky Playlist state ================= */
const STORAGE_PLAYLISTS = 'yt_lucky_playlists_v4';
const STORAGE_ACTIVE_TAB = 'yt_lucky_active_tab_v4';
const STORAGE_LOCK_MODE = 'yt_lucky_lock_mode_v4';
const STORAGE_SCROLL = 'yt_lucky_playlist_scroll_v4';
const STORAGE_LAST_INDEX = 'yt_lucky_playlist_last_index_v4';
const STORAGE_AUTOPLAY_ENABLED = 'yt_lucky_playlist_autoplay_enabled_v4';
const STORAGE_PLAYLIST_VISIBLE = 'yt_lucky_playlist_visible_v4';
const STORAGE_PDISPLAY_MODE = 'yt_lucky_pdisplay_mode_v4';
const CURRENT_SONG_HIGHLIGHT_COLOR = '#e0f7fa';

if (window.trustedTypes && !window.trustedTypes.defaultPolicy) {
  try { window.trustedTypes.createPolicy('default', { createHTML: s => s }); } catch(e) {}
}

let _audioCtx = null, _silentNode = null, _wakeLock = null, playEnforcementInterval = null;
let playlists = {}, activeTab = null, currentIndex = -1, progressInterval = null, isTransitioning = false;
let prefetchedNextUrl = null, prefetchedNextQuery = null;
let playlistSearchQuery = '', isSearchLocked = false, transientArtistData = null;
let artistModeEnabled = localStorage.getItem('yt_lucky_artist_mode') === '1';
let isArtistFirst = localStorage.getItem('yt_lucky_artist_format_left') !== '0';
let lastCenteredIndex = -1, lastCenteredTab = null;
let shuffleModeEnabled = localStorage.getItem('yt_lucky_shuffle') === '1';
let shuffledIndices = [], playHistory = [];
let isAudioMode = false;

function initBackgroundBypass() {
  registerMediaSession();
  startSilentAudioContext();
  requestWakeLock();
}

function registerMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: getCurrentVideoTitle() || 'Playing',
    artist: 'YouTube Lucky Playlist',
    album: activeTab ? (playlists[activeTab]?.name || 'Sidebar') : 'Sidebar'
  });
  navigator.mediaSession.setActionHandler('play', () => { const v = document.querySelector('video'); if (v) v.play().catch(() => {}); });
  navigator.mediaSession.setActionHandler('pause', () => { const v = document.querySelector('video'); if (v) v.pause(); });
  navigator.mediaSession.setActionHandler('nexttrack', () => triggerNextSong());
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    const v = document.querySelector('video');
    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
  });
  const v = document.querySelector('video');
  if (v) {
    v.addEventListener('play', () => { navigator.mediaSession.playbackState = 'playing'; });
    v.addEventListener('pause', () => { navigator.mediaSession.playbackState = 'paused'; });
  }
}

function startSilentAudioContext() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    gain.gain.setValueAtTime(0, _audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.start();
    _silentNode = osc;
    document.addEventListener('click', () => {
      if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
    }, { passive: true });
  } catch(e) {}
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    if (_wakeLock) _wakeLock.release();
    _wakeLock = await navigator.wakeLock.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && _wakeLock?.released) {
        _wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
      }
    });
  } catch(e) {}
}

function enforcePlayback() {
  if (playEnforcementInterval) clearInterval(playEnforcementInterval);
  let attempts = 0;
  playEnforcementInterval = setInterval(async () => {
    attempts++;
    const v = document.querySelector('video');
    if (v) {
      if (v.muted) v.muted = false;
      if (v.volume < 1) v.volume = 1;
      if (v.paused) {
        try { await v.play(); } catch (_) {
          const b = document.querySelector('.ytp-play-button, .ytp-large-play-button, button[aria-label*="Play" i]');
          if (b) try { b.click(); } catch (_) {}
        }
      }
      document.querySelectorAll('.ytp-unmute, .ytp-unmute-button, .ytp-tap-to-unmute, button[aria-label*="Unmute" i]').forEach(b => {
        try { b.click(); } catch (_) {}
        b.style.display = 'none';
      });
      if (!v.paused && v.currentTime > 0.5) clearInterval(playEnforcementInterval);
    }
    if (attempts > 30) clearInterval(playEnforcementInterval);
  }, 400);
}

function schedulePlayAfterNavigation() {
  const attempt = async () => {
    const v = document.querySelector('video');
    if (!v) return;
    if (v.muted) v.muted = false;
    if (v.paused) await v.play().catch(() => {});
  };
  attempt();
  if (_audioCtx) {
    [0.2, 0.6, 1.2, 2.5].forEach(d => {
      _audioCtx.resume().then(() => setTimeout(attempt, d * 1000));
    });
  }
}

function updateAudioOverlay(index) {
  if (!isAudioMode) return;
  const overlay = document.getElementById('yt-lucky-audio-overlay');
  if (!overlay) return;
  const content = overlay.querySelector('#yt-lucky-audio-lyrics-content');
  if (!content) return;

  if (!YtLyrics.currentLyrics || YtLyrics.currentLyrics.length === 0) {
    content.innerHTML = `
      <div style="font-size:13px; color:#aaa; margin-bottom:8px; font-weight:500;">Searching lyrics...</div>
      <div style="font-size:36px; animation:audio-glow 2s infinite alternate; color:#fff;">♫</div>
    `;
    if (!YtLyrics.isFetching) {
      YtLyrics.fetchLyrics();
    }
    return;
  }

  let html = '';
  if (index >= 0 && index < YtLyrics.currentLyrics.length) {
    const start = Math.max(0, index - 1);
    const end = Math.min(YtLyrics.currentLyrics.length - 1, index + 1);
    for (let i = start; i <= end; i++) {
      const isActive = (i === index);
      const text = YtLyrics.currentLyrics[i].text;
      html += `
        <div style="
          font-size: ${isActive ? 'clamp(14px, 4.2vw, 20px)' : 'clamp(11px, 2.8vw, 13px)'};
          color: ${isActive ? '#ffffff' : 'rgba(255,255,255,0.45)'};
          font-weight: ${isActive ? '800' : '500'};
          margin: ${isActive ? '4px 0' : '2px 0'};
          line-height: 1.3;
          transition: all 0.25s ease;
          text-shadow: ${isActive ? '0 2px 8px rgba(0,0,0,0.9)' : 'none'};
          max-width: 96%;
          word-break: break-word;
          overflow: hidden;
        ">${text}</div>
      `;
    }
  } else {
    html = '<div style="font-size:36px; animation:audio-glow 2s infinite alternate; color:#fff;">♫</div>';
  }
  content.innerHTML = html;
}

window._ytAudioOverlayUpdate = updateAudioOverlay;

function toggleAudioMode() {
    isAudioMode = !isAudioMode;
    const audioBtn = document.getElementById('yt-lucky-audio-btn');
    if (audioBtn) {
        audioBtn.style.background = isAudioMode ? '#e91e63' : '#1f1f1f';
        audioBtn.title = isAudioMode ? 'Disable Audio Mode' : 'Audio Mode';
    }

    const video = document.querySelector('video');
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    const playerContainer = document.querySelector('#player-container-id, .player-container, #movie_player, ytm-player, #player') || 
                            video?.parentElement || 
                            document.body;

    let overlay = document.getElementById('yt-lucky-audio-overlay');

    if (isAudioMode) {
        if (player && typeof player.getAvailableQualityLevels === 'function') {
            const levels = player.getAvailableQualityLevels();
            if (levels && levels.length) {
                const lowest = levels[levels.length - 1];
                if (typeof player.setPlaybackQualityRange === 'function') player.setPlaybackQualityRange(lowest, lowest);
                else if (typeof player.setPlaybackQuality === 'function') player.setPlaybackQuality(lowest);
            }
        }

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'yt-lucky-audio-overlay';
            overlay.innerHTML = '<div style="font-size: 64px; animation: audio-glow 2s infinite alternate; color: #fff; user-select: none;">♫</div>';
        }

        if (playerContainer !== document.body) {
            const pos = window.getComputedStyle(playerContainer).position;
            if (pos === 'static') playerContainer.style.position = 'relative';
        }

        overlay.style.cssText = `
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: radial-gradient(circle at center, #1a1a1a 0%, #000 100%) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 1000 !important;
            pointer-events: none !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            opacity: 1 !important;
            transition: opacity 0.3s ease !important;
        `;

        if (overlay.parentElement !== playerContainer) {
            playerContainer.appendChild(overlay);
        }
        overlay.style.display = 'flex';

        if (video && video.paused) video.play().catch(() => {});
    } else {
        if (player && typeof player.setPlaybackQualityRange === 'function') {
            player.setPlaybackQualityRange('default', 'default');
        } else if (player && typeof player.setPlaybackQuality === 'function') {
            player.setPlaybackQuality('default');
        }

        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => { if (!isAudioMode) overlay.style.display = 'none'; }, 250);
        }

        if (video) {
            if (video.style.opacity === '0' || video.style.display === 'none') {
                video.style.opacity = '1';
                video.style.display = '';
            }
            video.play().catch(() => {});
        }
    }
}

function extractArtistInfo(title) {
  let c = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/(official|music|video|lyrics|lyric|audio|hd|4k|1080p|720p)/gi, '').trim();
  const seps = [' - ', ' – ', '—', ' | ', ' • ', ' ~ '];
  for (const s of seps) {
    if (c.includes(s)) {
      const p = c.split(s);
      return isArtistFirst ? p[0].trim() : p[p.length - 1].trim();
    }
  }
  return c;
}

function saveAllPlaylists() {
  try {
    const toSave = { ...playlists };
    delete toSave['__TRANSIENT_ARTIST__'];
    localStorage.setItem(STORAGE_PLAYLISTS, JSON.stringify(toSave));
  } catch(e) {}
}

function loadAllPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_PLAYLISTS);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveActiveTab(k) { if (!k) localStorage.removeItem(STORAGE_ACTIVE_TAB); else localStorage.setItem(STORAGE_ACTIVE_TAB, k); }
function loadActiveTab() { return localStorage.getItem(STORAGE_ACTIVE_TAB); }
function saveLockMode(v) { localStorage.setItem(STORAGE_LOCK_MODE, v ? '1' : '0'); }
function loadLockMode() { return localStorage.getItem(STORAGE_LOCK_MODE) === '1'; }
function saveLastIndex(i) { localStorage.setItem(STORAGE_LAST_INDEX, String(i)); }
function loadLastIndex() { const v = localStorage.getItem(STORAGE_LAST_INDEX); return v === null ? -1 : parseInt(v, 10); }
function loadAutoplayEnabled() { return localStorage.getItem(STORAGE_AUTOPLAY_ENABLED) === '1'; }
function saveAutoplayEnabled(v) { localStorage.setItem(STORAGE_AUTOPLAY_ENABLED, v ? '1' : '0'); }
function loadPlaylistVisible() { return localStorage.getItem(STORAGE_PLAYLIST_VISIBLE) !== '0'; }
function savePlaylistVisible(v) { localStorage.setItem(STORAGE_PLAYLIST_VISIBLE, v ? '1' : '0'); }
function loadPDisplayMode() { return localStorage.getItem(STORAGE_PDISPLAY_MODE) === '1'; }
function savePDisplayMode(v) { localStorage.setItem(STORAGE_PDISPLAY_MODE, v ? '1' : '0'); }
function makeTabKey(name) { return `${Date.now()}_${(name || 'playlist').replace(/[^\w.-]/g, '_').slice(0, 30)}`; }
function shortName(fn, max = 12) { return !fn ? 'untitled' : (fn.length <= max ? fn : fn.slice(0, max - 3) + '...'); }
function getCurrentVideoTitle() {
  const el = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, ytm-slim-video-information-renderer .slim-video-information-title, .slim-video-information-title .yt-core-attributed-string');
  if (el) return el.textContent.trim();
  return document.title.replace(' - YouTube', '').trim();
}
function extractVideoId(url) { const m = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/); return m ? m[1] : null; }

function navigateTo(url) {
  if (!url) return;
  enforcePlayback();
  schedulePlayAfterNavigation();
  const a = document.createElement('a');
  a.href = url;
  document.body.appendChild(a);
  try { a.click(); } catch (_) { window.location.assign(url); return; }
  const cp = location.pathname + location.search;
  setTimeout(() => { if (location.pathname + location.search === cp) location.assign(url); }, 250);
  setTimeout(() => { if (a.parentNode) a.remove(); }, 60);
}

function prefetchNextSong() {
  if (!loadAutoplayEnabled() || !activeTab) return;
  let list = playlists[activeTab]?.lines || [];
  if (activeTab === '__TRANSIENT_ARTIST__' && transientArtistData) list = transientArtistData.lines;
  let ni = currentIndex + 1;
  if (shuffleModeEnabled && list.length > 0) ni = getNextShuffleIndex(list.length, currentIndex);
  if (ni >= list.length) { prefetchedNextUrl = null; prefetchedNextQuery = null; return; }
  const nq = list[ni];
  if (!nq || nq === prefetchedNextQuery) return;
  prefetchedNextQuery = nq;
  if (nq.includes('http')) {
    const vid = extractVideoId(nq);
    if (vid) prefetchedNextUrl = `/watch?v=${vid}`;
    return;
  }
  GM_xmlhttpRequest({
    method: 'GET', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(nq)}`,
    onload: r => {
      try {
        const m = r.responseText.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (m && m[1]) { prefetchedNextUrl = `/watch?v=${m[1]}`; return; }
      } catch(e) {}
      prefetchedNextUrl = null;
    },
    onerror: () => { prefetchedNextUrl = null; }
  });
}

function getNextShuffleIndex(len, cur) {
  if (shuffledIndices.length !== len) shuffledIndices = Array.from({ length: len }, (_, i) => i).sort(() => Math.random() - 0.5);
  const p = shuffledIndices.indexOf(cur);
  if (p === -1 || p >= len - 1) {
    shuffledIndices = Array.from({ length: len }, (_, i) => i).sort(() => Math.random() - 0.5);
    return shuffledIndices[0];
  }
  return shuffledIndices[p + 1];
}

function triggerNextSong() {
  if (isTransitioning || !loadAutoplayEnabled() || !activeTab) return;
  let list = playlists[activeTab]?.lines || [];
  if (activeTab === '__TRANSIENT_ARTIST__' && transientArtistData) list = transientArtistData.lines;
  let ni = currentIndex + 1;
  if (shuffleModeEnabled && list.length > 0) ni = getNextShuffleIndex(list.length, currentIndex);
  if (ni >= list.length) return;
  if (currentIndex !== -1) playHistory.push(currentIndex);
  isTransitioning = true;
  saveLastIndex(ni);
  currentIndex = ni;
  const nq = list[ni];
  setTimeout(() => scrollToActiveTrack(true), 200);
  if (prefetchedNextUrl && prefetchedNextQuery === nq) navigateTo(prefetchedNextUrl);
  else playOrNavigate(nq);
  setTimeout(() => { isTransitioning = false; }, 4000);
}

async function searchFirstVideoId(query) {
  try {
    const key = window.ytcfg?.get?.('INNERTUBE_API_KEY') || PTB_CFG.INNERTUBE_KEY;
    const resp = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: PTB_CFG.INNERTUBE_CLIENT },
        query,
        params: 'EgIQAQ%3D%3D'
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
    for (const section of contents) {
      for (const item of (section?.itemSectionRenderer?.contents ?? [])) {
        const vid = item?.videoRenderer?.videoId;
        if (vid) return vid;
      }
    }
  } catch (_) {}
  return null;
}

async function loadLucky(q) {
  if (!q) return;
  if (q.includes('http')) {
    const vid = extractVideoId(q);
    if (vid) { navigateTo(`/watch?v=${vid}`); return; }
  }
  const vid = await searchFirstVideoId(q);
  if (vid) navigateTo(`/watch?v=${vid}`);
  else window.location.assign('https://www.google.com/search?q=site:youtube.com%20' + encodeURIComponent(q) + '&btnI=I');
}

function playOrNavigate(line) {
  if (!line) return;
  loadLucky(line);
}

function scrollToActiveTrack(smooth = true) {
  const lc = document.getElementById('yt-lucky-listcontainer-v3');
  if (!lc || lc.style.display === 'none') return;

  const el = lc.querySelector('.yt-lucky-active-item');
  if (!el) return;

  const col = el.closest('.yt-lucky-pdisplay-col');
  const container = col || lc;

  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const currentRelativeTop = elRect.top - containerRect.top;
  const targetRelativeTop = (container.clientHeight / 2) - (el.clientHeight / 2);
  const deltaY = currentRelativeTop - targetRelativeTop;

  container.scrollTo({
    top: container.scrollTop + deltaY,
    behavior: smooth ? 'smooth' : 'auto'
  });

  if (col && lc) {
    const colRect = col.getBoundingClientRect();
    const lcRect = lc.getBoundingClientRect();
    if (colRect.left < lcRect.left || colRect.right > lcRect.right) {
      const deltaX = colRect.left - lcRect.left - (lc.clientWidth / 2) + (col.clientWidth / 2);
      lc.scrollTo({
        left: lc.scrollLeft + deltaX,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }

  lastCenteredIndex = currentIndex;
  lastCenteredTab = activeTab;
}

function createProgressBar() {
  const e = document.getElementById('yt-lucky-progress-bar');
  if (e) return e;
  
  const c = document.createElement('div');
  c.id = 'yt-lucky-progress-bar';
  Object.assign(c.style, {
    width: '100%',
    height: '6px',
    background: '#0f0f0f',
    margin: '4px 0',
    overflow: 'hidden',
    position: 'relative',
    boxSizing: 'border-box',
    flexShrink: '0',
    cursor: 'pointer'
  });
  c.title = 'Click to re-center playing song';
  c.addEventListener('click', () => scrollToActiveTrack(true));

  const p = document.createElement('div');
  p.id = 'yt-lucky-progress-fill';
  Object.assign(p.style, { width: '0%', height: '100%', background: 'linear-gradient(90deg,#ff0000,#ff6b6b)', transition: 'width .3s linear' });
  
  const td = document.createElement('div');
  td.id = 'yt-lucky-time-display';
  Object.assign(td.style, { position: 'absolute', top: '-18px', right: '0', fontSize: '11px', color: '#ccc', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '2px' });
  
  c.append(p, td);
  const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
  if (sb) {
    const lc = document.getElementById('yt-lucky-listcontainer-v3');
    sb.insertBefore(c, lc);
  }
  startProgressTracking();
  return c;
}

function startProgressTracking() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(updateProgressBar, 1000);
}

function updateProgressBar() {
  const v = document.querySelector('video');
  const f = document.getElementById('yt-lucky-progress-fill');
  const t = document.getElementById('yt-lucky-time-display');
  if (!v || !f || !t || v.duration <= 0) return;
  const p = (v.currentTime / v.duration) * 100;
  f.style.width = `${p}%`;
  const fmt = s => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  t.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
}

window._ytLuckyApplyScale = function(scale) {
  const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
  if (!sb) return;
  scale = Math.max(0.7, Math.min(1.25, scale));
  sb.style.zoom = scale;
  sb._luckyScale = scale;
  fixFullWidth();
};

window._ytLuckyApplyHeight = function(vh) {
  // Not used in right-sidebar layout but kept for compatibility
};

function switchSidebarView(view) {
  const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
  if (!sb) return;
  if (sb.style.display === 'none') {
    sb.style.display = 'flex';
    savePlaylistVisible(true);
    updateSidebarVisibilityState(true);
    const b = Array.from(document.querySelectorAll('#yt-lucky-controls-v3-wrapper button')).find(x => x.textContent.includes('List:'));
    if (b) b.textContent = 'List: Hide';
  }
  const lc = document.getElementById('yt-lucky-listcontainer-v3');
  const tabs = document.getElementById('yt-lucky-tabs-holder-v3');
  const panels = ['yt-hub-sidebar', 'yt-pro-panel', 'ptb-panel', 'yt-lucky-lyrics-panel', 'yt-aiex-panel', 'yt-aisettings-panel'];
  
  if (lc) lc.style.display = 'none';
  if (tabs) tabs.style.display = 'none';
  panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

  if (view === 'LIST') {
    if (lc) lc.style.display = loadPDisplayMode() ? 'flex' : 'block';
    if (tabs) tabs.style.display = 'flex';
    setTimeout(() => scrollToActiveTrack(true), 150);
  } else if (view === 'POTPLAYER') {
    if (YtPotPlayer.panelElement) YtPotPlayer.panelElement.style.display = 'flex';
  } else if (view === 'LYRICS') {
    if (YtLyrics.panelElement) YtLyrics.panelElement.style.display = 'flex';
    YtLyrics.onShow();
  } else if (view === 'AIEX') {
    if (YtAIExplainer.panelElement) YtAIExplainer.panelElement.style.display = 'flex';
    YtAIExplainer.explainCurrentSong();
  } else if (view === 'AISETTINGS') {
    if (YtAISettings.panelElement) YtAISettings.panelElement.style.display = 'flex';
  } else if (view === 'HUB') {
    YouTubeHub.ensureSidebar();
    const h = document.getElementById('yt-hub-sidebar');
    if (h) {
      if (h.parentElement !== sb) sb.appendChild(h);
      h.style.display = 'flex';
      YouTubeHub.renderHub();
    }
  } else if (view === 'PRO') {
    if (!document.getElementById('yt-pro-panel')) YouTubePro.buildPanel();
    const p = document.getElementById('yt-pro-panel');
    if (p) {
      if (p.parentElement !== sb) sb.appendChild(p);
      p.style.display = 'flex';
    }
  }
}

function createPlaylistSidebar() {
  if (document.getElementById('yt-lucky-playlist-sidebar-v3')) return;
  const sb = document.createElement('div');
  sb.id = 'yt-lucky-playlist-sidebar-v3';
  
  const isVisible = loadPlaylistVisible();
  sb.style.display = isVisible ? 'flex' : 'none';
  updateSidebarVisibilityState(isVisible);

  // Left Edge Width Resize Handle
  const rh = document.createElement('div');
  rh.className = 'resize-handle-pl';
  const startResize = e => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const startW = sb.getBoundingClientRect().width;
    const startX = clientX;
    
    const onMove = me => {
      const cx = me.touches ? me.touches[0].clientX : me.clientX;
      const deltaX = startX - cx;
      const newW = Math.max(300, Math.min(900, startW + deltaX));
      sb.style.width = newW + 'px';
      document.documentElement.style.setProperty('--yt-plugin-sidebar-w', newW + 'px');
      localStorage.setItem('ytLucky_sidebarWidth', newW);
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  };
  rh.addEventListener('mousedown', startResize);
  rh.addEventListener('touchstart', startResize, { passive: false });
  sb.appendChild(rh);
  document.documentElement.appendChild(sb);

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:3px;margin-bottom:4px;padding-right:4px;flex-shrink:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;position:relative;z-index:10;';
  
  const hTitle = document.createElement('div');
  hTitle.textContent = '🎵';
  hTitle.title = 'Re-center active song';
  hTitle.style.cssText = 'font-size:16px;cursor:pointer;flex-shrink:0;padding:0 2px;';
  hTitle.addEventListener('click', () => {
    switchSidebarView('LIST');
    scrollToActiveTrack(true);
  });

  const internalSearch = document.createElement('input');
  internalSearch.type = 'text';
  internalSearch.placeholder = 'Search...';
  internalSearch.value = playlistSearchQuery;
  Object.assign(internalSearch.style, { flex: '2', minWidth: '70px', padding: '5px 10px', borderRadius: '14px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: '11px', outline: 'none', boxSizing: 'border-box' });
  internalSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      playlistSearchQuery = e.target.value.trim();
      isSearchLocked = false;
      if (playlists['__SEARCH_RESULTS__']) { delete playlists['__SEARCH_RESULTS__']; saveAllPlaylists(); }
      if (activeTab === '__SEARCH_RESULTS__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); }
      switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
    }
  });

  function mkIconBtn(icon, title, onClick, bg) {
    const b = document.createElement('button');
    b.textContent = icon;
    b.title = title;
    Object.assign(b.style, { padding: '0', borderRadius: '14px', border: '1px solid transparent', background: bg || '#1f1f1f', color: '#fff', fontSize: '12px', cursor: 'pointer', flexShrink: '0', minWidth: '26px', height: '26px', lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', zIndex: '10', WebkitTapHighlightColor: 'transparent' });
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  const hubBtn = mkIconBtn('☰', 'Channels Hub', () => {
    const h = document.getElementById('yt-hub-sidebar');
    switchSidebarView(h && h.style.display === 'flex' ? 'LIST' : 'HUB');
  });

  const prevBtn = mkIconBtn('◀', 'Previous', () => {
    let list = playlists[activeTab]?.lines;
    if (activeTab === '__TRANSIENT_ARTIST__' && transientArtistData) list = transientArtistData.lines;
    if (shuffleModeEnabled) {
      if (playHistory.length > 0) {
        const pi = playHistory.pop();
        isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
        currentIndex = pi; saveLastIndex(currentIndex); renderTabsBar(); renderPlaylistUI();
        setTimeout(() => scrollToActiveTrack(true), 80);
        playOrNavigate(list[currentIndex]);
      }
    } else if (list && currentIndex > 0) {
      isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
      currentIndex--; saveLastIndex(currentIndex); renderTabsBar(); renderPlaylistUI();
      setTimeout(() => scrollToActiveTrack(true), 80);
      playOrNavigate(list[currentIndex]);
    }
  }, '#cc7700');

  const nextBtn = mkIconBtn('▶', 'Next', triggerNextSong, '#0077cc');

  const clearBtn = mkIconBtn('✕', 'Clear', () => {
    playlists = {}; activeTab = null; currentIndex = -1; playlistSearchQuery = '';
    isSearchLocked = false; transientArtistData = null; internalSearch.value = '';
    prefetchedNextUrl = null; prefetchedNextQuery = null; shuffledIndices = []; playHistory = [];
    saveAllPlaylists(); saveActiveTab(null); saveLastIndex(-1);
    renderTabsBar(); renderPlaylistUI(); switchSidebarView('LIST');
  }, '#8a1414');

  const pDisplayBtn = mkIconBtn('II', 'P-Display', () => {
    const a = !loadPDisplayMode();
    savePDisplayMode(a);
    pDisplayBtn.style.background = a ? '#00c853' : '#1f1f1f';
    switchSidebarView('LIST'); renderPlaylistUI();
  }, loadPDisplayMode() ? '#00c853' : '#1f1f1f');

  const bPlistBtn = mkIconBtn('BP', 'B-Plist', () => {
    const isOpen = YtPotPlayer.panelElement && YtPotPlayer.panelElement.style.display === 'flex';
    switchSidebarView(isOpen ? 'LIST' : 'POTPLAYER');
  }, '#e64a19');

  const aiexBtn = mkIconBtn('AIEx', 'AI Song Explainer', () => {
    const isOpen = YtAIExplainer.panelElement && YtAIExplainer.panelElement.style.display === 'flex';
    switchSidebarView(isOpen ? 'LIST' : 'AIEX');
  }, '#0288d1');
  aiexBtn.id = 'yt-lucky-aiex-btn';
  aiexBtn.style.padding = '0 6px';

  const aiSettingsBtn = mkIconBtn('⚙️', 'AI Settings', () => {
    const isOpen = YtAISettings.panelElement && YtAISettings.panelElement.style.display === 'flex';
    switchSidebarView(isOpen ? 'LIST' : 'AISETTINGS');
  }, '#455a64');
  aiSettingsBtn.id = 'yt-lucky-aisettings-btn';

  const shuffleBtn = mkIconBtn('🔀', 'Shuffle: ' + (shuffleModeEnabled ? 'ON' : 'OFF'), () => {
    shuffleModeEnabled = !shuffleModeEnabled;
    localStorage.setItem('yt_lucky_shuffle', shuffleModeEnabled ? '1' : '0');
    shuffleBtn.style.background = shuffleModeEnabled ? '#00c853' : '#1f1f1f';
    shuffleBtn.title = 'Shuffle: ' + (shuffleModeEnabled ? 'ON' : 'OFF');
    if (!shuffleModeEnabled) { shuffledIndices = []; playHistory = []; }
  }, shuffleModeEnabled ? '#00c853' : '#1f1f1f');

  const proBtn = mkIconBtn('', 'YouTube Pro', () => {
    const p = document.getElementById('yt-pro-panel');
    switchSidebarView(p && p.style.display === 'flex' ? 'LIST' : 'PRO');
  }, '#8e24aa');
  const proIcon = createSvgIcon('logo');
  proIcon.setAttribute('width', '14'); proIcon.setAttribute('height', '14');
  proBtn.appendChild(proIcon);

  const audioBtn = mkIconBtn('🎵', 'Audio Mode', () => {
    toggleAudioMode();
  }, '#1f1f1f');
  audioBtn.id = 'yt-lucky-audio-btn';

  const lockBtn = mkIconBtn(loadLockMode() ? '🔒' : '🔓', 'Lock', () => {
    const locked = !loadLockMode();
    if (locked && activeTab) { const keep = {}; keep[activeTab] = playlists[activeTab]; playlists = keep; saveAllPlaylists(); }
    saveLockMode(locked);
    lockBtn.textContent = locked ? '🔒' : '🔓';
    lockBtn.style.background = locked ? '#333' : '#1f1f1f';
    renderTabsBar(); renderPlaylistUI();
  }, loadLockMode() ? '#333' : '#1f1f1f');

  header.append(hTitle, internalSearch, hubBtn, prevBtn, nextBtn, clearBtn, pDisplayBtn, bPlistBtn, aiexBtn, aiSettingsBtn, shuffleBtn, proBtn, audioBtn, lockBtn);
  sb.appendChild(header);

  if (YtPotPlayer.panelElement) sb.appendChild(YtPotPlayer.panelElement);
  if (YtLyrics.panelElement) sb.appendChild(YtLyrics.panelElement);
  if (YtAIExplainer.panelElement) sb.appendChild(YtAIExplainer.panelElement);
  if (YtAISettings.panelElement) sb.appendChild(YtAISettings.panelElement);
  const hubEl = document.getElementById('yt-hub-sidebar'); if (hubEl) sb.appendChild(hubEl);
  const proEl = document.getElementById('yt-pro-panel'); if (proEl) sb.appendChild(proEl);

  const tabs = document.createElement('div');
  tabs.id = 'yt-lucky-tabs-holder-v3';
  Object.assign(tabs.style, { width: '100%', boxSizing: 'border-box', marginTop: '4px', flexShrink: '0', display: 'flex', overflowX: 'auto', background: '#0d0d0d', borderBottom: '1px solid #222', position: 'relative', zIndex: '5' });
  sb.appendChild(tabs);

  const lc = document.createElement('div');
  lc.id = 'yt-lucky-listcontainer-v3';
  Object.assign(lc.style, { marginTop: '6px', flex: '1', minHeight: '0', overflowY: 'auto', paddingRight: '5px' });
  lc.addEventListener('touchstart', e => { if (e.touches.length === 2) { e.preventDefault(); scrollToActiveTrack(false); } }, { passive: false });
  sb.appendChild(lc);

  fixFullWidth();
  setTimeout(fixFullWidth, 500);
}

function renderTabsBar() {
  const holder = document.getElementById('yt-lucky-tabs-holder-v3');
  if (!holder) return;
  holder.innerHTML = '';
  createProgressBar();
  
  const bar = document.createElement('div');
  bar.id = 'yt-lucky-tabs-bar-v3';
  Object.assign(bar.style, { display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap', padding: '6px 2px', background: '#0d0d0d', borderRadius: '6px', scrollbarWidth: 'none' });
  
  Object.keys(playlists).forEach(key => {
    if (key === '__TRANSIENT_ARTIST__') return;
    const meta = playlists[key];
    const tab = document.createElement('div');
    tab.className = 'yt-lucky-tab-v3';
    tab.dataset.key = key;
    Object.assign(tab.style, {
      display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 8px',
      cursor: 'pointer', fontSize: '12px',
      borderBottom: key === activeTab ? '3px solid #ff0000' : '3px solid transparent',
      color: (key === '__SEARCH_RESULTS__' || key.startsWith('__ARTIST_')) ? '#00ccff' : '#e6e6e6',
      minWidth: '44px', maxWidth: '120px', boxSizing: 'border-box'
    });
    
    const ns = document.createElement('span');
    ns.textContent = shortName(meta.name || ('tab_' + key), 12);
    ns.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    
    const cx = document.createElement('span');
    cx.textContent = '✕';
    cx.style.cssText = 'margin-left:6px;cursor:pointer;font-size:12px;opacity:0.7;';
    
    cx.addEventListener('click', e => {
      e.stopPropagation();
      if (loadLockMode() && Object.keys(playlists).length <= 1) return;
      if (key === '__SEARCH_RESULTS__') {
        isSearchLocked = false; playlistSearchQuery = '';
        const si = document.querySelector('#yt-lucky-playlist-sidebar-v3 input[type="text"]');
        if (si) si.value = '';
      }
      delete playlists[key];
      if (key === activeTab) { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); }
      saveAllPlaylists(); renderTabsBar(); renderPlaylistUI();
    });
    
    tab.addEventListener('click', () => {
      activeTab = key;
      saveActiveTab(activeTab);
      currentIndex = -1;
      saveLastIndex(-1);
      prefetchedNextUrl = null;
      prefetchedNextQuery = null;
      switchSidebarView('LIST');
      renderTabsBar(); renderPlaylistUI();
    });
    
    tab.appendChild(ns);
    tab.appendChild(cx);
    bar.appendChild(tab);
  });
  
  const add = document.createElement('label');
  add.title = 'Add .txt';
  add.textContent = '+';
  Object.assign(add.style, { flex: '0 0 auto', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#1f1f1f', color: '#fff', fontSize: '14px', marginLeft: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });
  
  let ai = document.getElementById('yt-lucky-add-input-v3');
  if (!ai) {
    ai = document.createElement('input');
    ai.type = 'file'; ai.accept = '.txt'; ai.id = 'yt-lucky-add-input-v3'; ai.style.display = 'none';
    ai.addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0];
      if (f && f.name.toLowerCase().endsWith('.txt')) readFileAsPlaylistTab(f);
      ai.value = '';
    });
    document.body.appendChild(ai);
  }
  add.appendChild(ai);
  bar.appendChild(add);
  holder.appendChild(bar);
}

function readFileAsPlaylistTab(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const t = e.target.result || '';
    const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const key = makeTabKey(file.name);
    playlists[key] = { name: file.name, lines };
    if (loadLockMode()) { const keep = {}; keep[key] = playlists[key]; playlists = keep; }
    activeTab = key;
    saveAllPlaylists(); saveActiveTab(activeTab);
    currentIndex = -1; saveLastIndex(-1);
    prefetchedNextUrl = null; prefetchedNextQuery = null;
    renderTabsBar(); renderPlaylistUI(); switchSidebarView('LIST');
  };
  r.readAsText(file);
}

function renderPlaylistUI() {
  const lc = document.getElementById('yt-lucky-listcontainer-v3');
  const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
  if (!lc || !sb) return;
  
  let pScrolls = [];
  if (loadPDisplayMode()) {
    lc.querySelectorAll('.yt-lucky-pdisplay-col').forEach(c => pScrolls.push(c.scrollTop));
  }
  lc.innerHTML = '';
  
  const isAlt = ['yt-hub-sidebar', 'yt-pro-panel', 'ptb-panel', 'yt-lucky-lyrics-panel', 'yt-aiex-panel', 'yt-aisettings-panel'].some(id => {
    const el = document.getElementById(id);
    return el && el.style.display === 'flex';
  });
  
  if (isAlt) sb.style.display = 'flex';
  else sb.style.display = loadPlaylistVisible() ? 'flex' : 'none';
  
  const keys = Object.keys(playlists).filter(k => k !== '__TRANSIENT_ARTIST__');
  const pDisp = loadPDisplayMode();
  const searchActive = playlistSearchQuery.trim().length > 0;
  let searchResults = [];
  
  if (searchActive && !isSearchLocked) {
    const terms = playlistSearchQuery.toLowerCase().trim().split(/\s+/);
    keys.forEach(key => {
      if (key === '__SEARCH_RESULTS__') return;
      playlists[key].lines.forEach((line, idx) => {
        if (terms.every(t => line.toLowerCase().includes(t))) {
          searchResults.push({ key, idx, line, pName: playlists[key].name });
        }
      });
    });
  }
  
  if (pDisp) {
    if (!isAlt) lc.style.display = 'flex';
    lc.style.flexDirection = 'row';
    lc.style.overflowX = 'auto';
    lc.style.overflowY = 'hidden';
    lc.style.gap = '2px';
    lc.onscroll = null;
    
    let cols = keys.length;
    if (searchActive && !isSearchLocked) cols += 1;
    if (transientArtistData) cols += 1;
    
    if (cols === 0) { lc.innerHTML = '<div style="opacity:0.7;padding:6px 4px;">(no playlists)</div>'; return; }
    
    const toShow = Math.min(cols, 4);
    const cw = `calc(${100 / toShow}% - ${(2 * (toShow - 1)) / toShow}px)`;
    
    const renderCol = (title, items, isTrans = false, color = '#ff6b6b', specKey = null) => {
      const col = document.createElement('div');
      col.className = 'yt-lucky-pdisplay-col';
      Object.assign(col.style, { flex: `0 0 ${cw}`, height: '100%', overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '2px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' });
      
      const hd = document.createElement('div');
      Object.assign(hd.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', marginBottom: '6px', color, flexShrink: '0', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px', position: 'sticky', top: '0', background: '#121212', zIndex: '2' });
      
      const ts = document.createElement('span');
      ts.textContent = title;
      ts.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      hd.appendChild(ts);
      
      if (isTrans || specKey === '__SEARCH_RESULTS__') {
        const lb = document.createElement('span');
        lb.textContent = isSearchLocked ? '🔒' : '🔓';
        lb.style.cssText = 'cursor:pointer;margin-left:4px;font-size:12px;';
        lb.onclick = () => {
          if (isSearchLocked) {
            isSearchLocked = false; delete playlists['__SEARCH_RESULTS__']; saveAllPlaylists(); playlistSearchQuery = '';
            const si = document.querySelector('#yt-lucky-playlist-sidebar-v3 input[type="text"]');
            if (si) si.value = '';
            if (activeTab === '__SEARCH_RESULTS__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); }
          } else {
            isSearchLocked = true;
            playlists['__SEARCH_RESULTS__'] = { name: `Search: ${playlistSearchQuery}`, lines: items.map(i => i.line), query: playlistSearchQuery };
            saveAllPlaylists(); activeTab = '__SEARCH_RESULTS__'; saveActiveTab(activeTab);
          }
          renderTabsBar(); renderPlaylistUI();
        };
        hd.appendChild(lb);
      }
      col.appendChild(hd);
      
      if (items.length === 0 && isTrans) {
        const e = document.createElement('div');
        e.textContent = 'No matches.';
        e.style.cssText = 'opacity:0.5;font-size:12px;text-align:center;';
        col.appendChild(e);
      }
      
      items.forEach(item => {
        const el = document.createElement('div');
        const cur = (!isTrans && item.key === activeTab && item.idx === loadLastIndex());
        
        if (isTrans) {
          el.innerHTML = `<span>${item.line}</span> <span style="opacity:0.5;font-size:10px;">[${shortName(item.pName, 8)}]</span>`;
        } else {
          el.textContent = cur ? `▶ ${(item.idx + 1)}. ${item.line}` : `${(item.idx + 1)}. ${item.line}`;
        }
        
        Object.assign(el.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: cur ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: cur ? '#000' : '#fff', fontWeight: cur ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', flexShrink: '0' });
        if (cur) el.classList.add('yt-lucky-active-item');
        
        if (isTrans) {
          el.onmouseenter = () => el.style.backgroundColor = 'rgba(255,255,255,0.1)';
          el.onmouseleave = () => el.style.backgroundColor = 'transparent';
        }
        
        el.addEventListener('click', () => {
          let ext = artistModeEnabled ? extractArtistInfo(item.line) : null;
          if (artistModeEnabled && ext) { fetchArtistSongs(ext); return; }
          isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
          activeTab = isTrans ? item.key : specKey;
          saveActiveTab(activeTab); currentIndex = item.idx; saveLastIndex(currentIndex);
          switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
          setTimeout(() => scrollToActiveTrack(true), 80);
          playOrNavigate(item.line);
        });
        col.appendChild(el);
      });
      lc.appendChild(col);
    };
    
    if (searchActive && !isSearchLocked) renderCol(`🔍 Results (${searchResults.length})`, searchResults, true, '#00ccff');
    
    if (transientArtistData) {
      const mapped = transientArtistData.lines.map((l, i) => ({ key: '__TRANSIENT_ARTIST__', idx: i, line: l, pName: transientArtistData.name }));
      const col = document.createElement('div');
      col.className = 'yt-lucky-pdisplay-col';
      Object.assign(col.style, { flex: `0 0 ${cw}`, height: '100%', overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '2px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' });
      
      const hd = document.createElement('div');
      Object.assign(hd.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', marginBottom: '6px', color: '#ffaa00', flexShrink: '0', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px', position: 'sticky', top: '0', background: '#121212', zIndex: '2' });
      
      const ts = document.createElement('span');
      ts.textContent = `🎵 ${transientArtistData.name}`;
      hd.appendChild(ts);
      
      const bc = document.createElement('div');
      const lb = document.createElement('span');
      lb.textContent = '🔓';
      lb.style.cssText = 'cursor:pointer;margin-left:4px;';
      lb.onclick = () => {
        const nk = `__ARTIST_${Date.now()}`;
        playlists[nk] = transientArtistData;
        activeTab = nk;
        saveActiveTab(activeTab); saveAllPlaylists();
        transientArtistData = null;
        switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
      };
      bc.appendChild(lb);
      
      const cb = document.createElement('span');
      cb.textContent = '✕';
      cb.style.cssText = 'cursor:pointer;margin-left:6px;';
      cb.onclick = () => {
        transientArtistData = null;
        if (activeTab === '__TRANSIENT_ARTIST__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); }
        switchSidebarView('LIST'); renderPlaylistUI();
      };
      bc.appendChild(cb);
      
      hd.appendChild(bc);
      col.appendChild(hd);
      
      mapped.forEach(item => {
        const el = document.createElement('div');
        const cur = (activeTab === '__TRANSIENT_ARTIST__' && item.idx === loadLastIndex());
        el.textContent = cur ? `▶ ${(item.idx + 1)}. ${item.line}` : `${(item.idx + 1)}. ${item.line}`;
        Object.assign(el.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: cur ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: cur ? '#000' : '#fff', fontWeight: cur ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', flexShrink: '0' });
        if (cur) el.classList.add('yt-lucky-active-item');
        
        el.addEventListener('click', () => {
          let ext = artistModeEnabled ? extractArtistInfo(item.line) : null;
          if (artistModeEnabled && ext) { fetchArtistSongs(ext); return; }
          isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
          playlists['__TRANSIENT_ARTIST__'] = transientArtistData;
          activeTab = '__TRANSIENT_ARTIST__';
          saveActiveTab(activeTab); currentIndex = item.idx; saveLastIndex(currentIndex);
          switchSidebarView('LIST'); renderPlaylistUI();
          setTimeout(() => scrollToActiveTrack(true), 80);
          playOrNavigate(item.line);
        });
        col.appendChild(el);
      });
      lc.appendChild(col);
    }
    
    keys.forEach(key => {
      const mapped = playlists[key].lines.map((l, i) => ({ key, idx: i, line: l, pName: playlists[key].name }));
      const isLocked = key === '__SEARCH_RESULTS__' || key.startsWith('__ARTIST_');
      renderCol(
        isLocked ? `🔍 ${shortName(playlists[key].name, 15)}` : shortName(playlists[key].name || 'playlist', 20),
        mapped, false, isLocked ? '#00ccff' : '#ff6b6b', key
      );
    });
  } else {
    if (!isAlt) lc.style.display = 'block';
    lc.style.overflowY = 'auto';
    lc.style.overflowX = 'hidden';
    lc.style.gap = '0';
    
    if (transientArtistData) {
      const ah = document.createElement('div');
      Object.assign(ah.style, { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px', position: 'sticky', top: '0', background: '#121212', zIndex: '2' });
      const ts = document.createElement('span');
      ts.textContent = `🎵 ${transientArtistData.name}`;
      ah.appendChild(ts);
      
      const bc = document.createElement('div');
      const lb = document.createElement('span');
      lb.textContent = '🔓';
      lb.style.cssText = 'cursor:pointer;';
      lb.onclick = () => {
        const nk = `__ARTIST_${Date.now()}`;
        playlists[nk] = transientArtistData;
        activeTab = nk;
        saveActiveTab(activeTab); saveAllPlaylists();
        transientArtistData = null;
        switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
      };
      bc.appendChild(lb);
      
      const cb = document.createElement('span');
      cb.textContent = '✕';
      cb.style.cssText = 'cursor:pointer;margin-left:8px;';
      cb.onclick = () => {
        transientArtistData = null;
        if (activeTab === '__TRANSIENT_ARTIST__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); }
        switchSidebarView('LIST'); renderPlaylistUI();
      };
      bc.appendChild(cb);
      
      ah.appendChild(bc);
      lc.appendChild(ah);
      
      transientArtistData.lines.forEach((line, idx) => {
        const el = document.createElement('div');
        const cur = (activeTab === '__TRANSIENT_ARTIST__' && idx === loadLastIndex());
        el.textContent = cur ? `▶ ${(idx + 1)}. ${line}` : `${(idx + 1)}. ${line}`;
        Object.assign(el.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: cur ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: cur ? '#000' : '#fff', fontWeight: cur ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' });
        if (cur) el.classList.add('yt-lucky-active-item');
        
        el.addEventListener('click', () => {
          let ext = artistModeEnabled ? extractArtistInfo(line) : null;
          if (artistModeEnabled && ext) { fetchArtistSongs(ext); return; }
          isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
          playlists['__TRANSIENT_ARTIST__'] = transientArtistData;
          activeTab = '__TRANSIENT_ARTIST__';
          saveActiveTab(activeTab); currentIndex = idx; saveLastIndex(currentIndex);
          switchSidebarView('LIST'); renderPlaylistUI();
          setTimeout(() => scrollToActiveTrack(true), 80);
          playOrNavigate(line);
        });
        lc.appendChild(el);
      });
    } else if (searchActive && !isSearchLocked) {
      const sh = document.createElement('div');
      Object.assign(sh.style, { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', color: '#00ccff', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px', position: 'sticky', top: '0', background: '#121212', zIndex: '2' });
      const ts = document.createElement('span');
      ts.textContent = `🔍 Results (${searchResults.length})`;
      sh.appendChild(ts);
      
      const lb = document.createElement('span');
      lb.textContent = '🔓';
      lb.style.cssText = 'cursor:pointer;';
      lb.onclick = () => {
        isSearchLocked = true;
        playlists['__SEARCH_RESULTS__'] = { name: `Search: ${playlistSearchQuery}`, lines: searchResults.map(r => r.line), query: playlistSearchQuery };
        saveAllPlaylists(); activeTab = '__SEARCH_RESULTS__'; saveActiveTab(activeTab);
        switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
      };
      sh.appendChild(lb);
      lc.appendChild(sh);
      
      if (searchResults.length === 0) {
        const e = document.createElement('div');
        e.textContent = 'No matches.';
        e.style.cssText = 'opacity:0.7;padding:6px 4px;';
        lc.appendChild(e);
        return;
      }
      
      searchResults.forEach(res => {
        const el = document.createElement('div');
        el.innerHTML = `<span>${res.line}</span> <span style="opacity:0.5;font-size:10px;">[${shortName(res.pName, 12)}]</span>`;
        Object.assign(el.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'background-color .2s ease', fontSize: '12px' });
        el.onmouseenter = () => el.style.backgroundColor = 'rgba(255,255,255,0.1)';
        el.onmouseleave = () => el.style.backgroundColor = 'transparent';
        
        el.addEventListener('click', () => {
          let ext = artistModeEnabled ? extractArtistInfo(res.line) : null;
          if (artistModeEnabled && ext) { fetchArtistSongs(ext); return; }
          isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
          activeTab = res.key;
          saveActiveTab(activeTab); currentIndex = res.idx; saveLastIndex(currentIndex);
          switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
          setTimeout(() => scrollToActiveTrack(true), 80);
          playOrNavigate(res.line);
        });
        lc.appendChild(el);
      });
    } else {
      if (!activeTab || !playlists[activeTab] || playlists[activeTab].lines.length === 0) {
        lc.innerHTML = '<div style="opacity:0.7;padding:6px 4px;">(empty)</div>';
        return;
      }
      
      if (activeTab === '__SEARCH_RESULTS__') {
        const lh = document.createElement('div');
        Object.assign(lh.style, { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', color: '#00ccff', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px', position: 'sticky', top: '0', background: '#121212', zIndex: '2' });
        const ts = document.createElement('span');
        ts.textContent = `🔍 ${playlists['__SEARCH_RESULTS__'].name}`;
        lh.appendChild(ts);
        
        const ub = document.createElement('span');
        ub.textContent = '🔒';
        ub.style.cursor = 'pointer';
        ub.onclick = () => {
          isSearchLocked = false; delete playlists['__SEARCH_RESULTS__']; saveAllPlaylists(); playlistSearchQuery = '';
          const si = document.querySelector('#yt-lucky-playlist-sidebar-v3 input[type="text"]');
          if (si) si.value = '';
          activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab);
          switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
        };
        lh.appendChild(ub);
        lc.appendChild(lh);
      }
      
      const list = playlists[activeTab].lines;
      const li = loadLastIndex();
      
      list.forEach((line, idx) => {
        const el = document.createElement('div');
        const cur = (idx === li);
        el.textContent = cur ? `▶ Playing: ${(idx + 1)}. ${line}` : `${(idx + 1)}. ${line}`;
        Object.assign(el.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: cur ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: cur ? '#000' : '#fff', fontWeight: cur ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'background-color .2s ease', fontSize: '12px' });
        if (cur) el.classList.add('yt-lucky-active-item');
        
        el.addEventListener('click', () => {
          let ext = artistModeEnabled ? extractArtistInfo(line) : null;
          if (artistModeEnabled && ext) { fetchArtistSongs(ext); return; }
          isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
          currentIndex = idx; saveLastIndex(currentIndex);
          switchSidebarView('LIST'); renderPlaylistUI();
          setTimeout(() => scrollToActiveTrack(true), 80);
          playOrNavigate(line);
        });
        lc.appendChild(el);
      });
      
      lc.onscroll = () => { localStorage.setItem(STORAGE_SCROLL, lc.scrollTop || 0); };
    }
  }
  
  // Always center active track when playing or on render
  if (currentIndex >= 0 || loadLastIndex() >= 0) {
    setTimeout(() => scrollToActiveTrack(true), 80);
  } else if (pDisp) {
    const cols = lc.querySelectorAll('.yt-lucky-pdisplay-col');
    cols.forEach((c, i) => { if (pScrolls[i] !== undefined) c.scrollTop = pScrolls[i]; });
  } else {
    const s = localStorage.getItem(STORAGE_SCROLL);
    if (s) lc.scrollTop = parseInt(s, 10);
  }
}

function disableArtistMode() {
  if (!artistModeEnabled) return;
  artistModeEnabled = false;
  localStorage.setItem('yt_lucky_artist_mode', '0');
  const artistBtn = document.querySelector('.yt-lucky-artist-btn');
  const artistSubWrap = document.querySelector('.yt-lucky-artist-sub-wrap');
  if (artistBtn) {
    artistBtn.style.background = '#1f1f1f';
    artistBtn.style.color = '#eee';
  }
  if (artistSubWrap) artistSubWrap.style.display = 'none';
}

function fetchArtistSongs(artistName) {
  disableArtistMode();
  const si = document.querySelector('#yt-lucky-controls-v3-wrapper input[type="text"]');
  const ot = si ? si.value : '';
  if (si) si.value = 'Fetching...';
  
  GM_xmlhttpRequest({
    method: 'GET', url: `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200`,
    onload: r => {
      if (si) si.value = ot;
      try {
        const d = JSON.parse(r.responseText);
        if (d.results && d.results.length > 0) {
          const seen = new Set(); const songs = [];
          d.results.forEach(t => {
            const n = t.trackName.replace(/\s+/g, ' ').trim().toLowerCase();
            if (!seen.has(n)) { seen.add(n); songs.push(`${t.artistName} - ${t.trackName}`); }
          });
          if (songs.length > 0) {
            transientArtistData = { name: `Artist: ${artistName}`, lines: songs };
            activeTab = '__TRANSIENT_ARTIST__';
            saveActiveTab(activeTab);
            switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
            return;
          }
        }
        fallbackYTArtist(artistName, si, ot);
      } catch(e) { fallbackYTArtist(artistName, si, ot); }
    },
    onerror: () => fallbackYTArtist(artistName, si, ot)
  });
}

function fallbackYTArtist(artistName, si, ot) {
  if (si) si.value = 'YT Fetching...';
  GM_xmlhttpRequest({
    method: 'GET', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(artistName + ' songs')}`,
    onload: r => {
      if (si) si.value = ot;
      try {
        const m = r.responseText.match(/var ytInitialData = (\{.*?\});/);
        if (m) {
          const d = JSON.parse(m[1]);
          const cs = d.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
          let songs = [];
          for (const s of cs) {
            if (s.itemSectionRenderer?.contents) {
              for (const it of s.itemSectionRenderer.contents) {
                if (it.videoRenderer && it.videoRenderer.title) songs.push(it.videoRenderer.title.runs[0].text);
              }
            }
          }
          if (songs.length > 0) {
            transientArtistData = { name: `Artist: ${artistName} (YT)`, lines: songs };
            activeTab = '__TRANSIENT_ARTIST__';
            saveActiveTab(activeTab);
            switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
          } else alert('No songs found.');
        }
      } catch(e) { alert('Error parsing YT.'); }
    },
    onerror: () => { if (si) si.value = ot; alert('Network error.'); }
  });
}

function initUI() {
  if (document.getElementById('yt-lucky-controls-v3-wrapper')) return;
  document.querySelectorAll('#yt-lucky-controls-v3-wrapper').forEach(e => e.remove());
  
  const w = document.createElement('div');
  w.id = 'yt-lucky-controls-v3-wrapper';
  const row = document.createElement('div');
  row.className = 'yt-lucky-ctrl-row';
  
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'Search...';
  
  const go = document.createElement('button');
  go.textContent = 'Go';
  go.onclick = () => {
    const q = inp.value.trim();
    if (q) { if (artistModeEnabled) fetchArtistSongs(q); else playOrNavigate(q); }
    inp.blur();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
  
  const artistBtn = document.createElement('button');
  artistBtn.textContent = 'Artist';
  artistBtn.className = 'yt-lucky-artist-btn';
  if (artistModeEnabled) { artistBtn.style.background = '#ffaa00'; artistBtn.style.color = '#000'; }
  
  // Vertically stacked container for A-T and Search buttons
  const artistSubWrap = document.createElement('div');
  artistSubWrap.className = 'yt-lucky-artist-sub-wrap';
  artistSubWrap.style.cssText = `display: ${artistModeEnabled ? 'inline-flex' : 'none'}; flex-direction: column; gap: 2px; justify-content: center; vertical-align: middle;`;

  // 1. A-T / T-A format toggle
  const artistFmt = document.createElement('button');
  artistFmt.textContent = isArtistFirst ? 'A-T' : 'T-A';
  artistFmt.title = isArtistFirst ? 'Artist - Title' : 'Title - Artist';
  artistFmt.className = 'yt-lucky-artist-fmt';
  artistFmt.style.cssText = 'padding: 1px 5px !important; font-size: 9px !important; min-height: 13px !important; height: 13px !important; line-height: 1 !important; border-radius: 3px !important;';
  
  artistFmt.onclick = e => {
    e.preventDefault();
    isArtistFirst = !isArtistFirst;
    localStorage.setItem('yt_lucky_artist_format_left', isArtistFirst ? '1' : '0');
    artistFmt.textContent = isArtistFirst ? 'A-T' : 'T-A';
  };

  // 2. Artist search button (generates playlist)
  const artistSearch = document.createElement('button');
  artistSearch.textContent = '🔍 Search';
  artistSearch.title = 'Type artist name to generate playlist';
  artistSearch.className = 'yt-lucky-artist-search';
  artistSearch.style.cssText = 'padding: 1px 5px !important; font-size: 9px !important; min-height: 13px !important; height: 13px !important; line-height: 1 !important; border-radius: 3px !important; background: #263238 !important;';

  artistSearch.onclick = e => {
    e.preventDefault();
    const query = prompt('Enter artist name:', inp.value.trim());
    if (query && query.trim()) {
      fetchArtistSongs(query.trim());
    }
  };

  artistSubWrap.append(artistFmt, artistSearch);
  
  artistBtn.onclick = e => {
    e.preventDefault();
    artistModeEnabled = !artistModeEnabled;
    localStorage.setItem('yt_lucky_artist_mode', artistModeEnabled ? '1' : '0');
    artistBtn.style.background = artistModeEnabled ? '#ffaa00' : '#1f1f1f';
    artistBtn.style.color = artistModeEnabled ? '#000' : '#eee';
    artistSubWrap.style.display = artistModeEnabled ? 'inline-flex' : 'none';
  };
  
  const lyricsBtn = document.createElement('button');
  lyricsBtn.textContent = '🎵 Lyrics';
  lyricsBtn.onclick = e => {
    e.preventDefault();
    const isOpen = YtLyrics.panelElement && YtLyrics.panelElement.style.display === 'flex';
    switchSidebarView(isOpen ? 'LIST' : 'LYRICS');
  };
  
  const autoBtn = document.createElement('button');
  autoBtn.textContent = loadAutoplayEnabled() ? 'Auto: ON' : 'Auto: OFF';
  if (loadAutoplayEnabled()) autoBtn.style.background = '#00c853';
  autoBtn.onclick = () => {
    const n = !loadAutoplayEnabled();
    saveAutoplayEnabled(n);
    autoBtn.textContent = n ? 'Auto: ON' : 'Auto: OFF';
    autoBtn.style.background = n ? '#00c853' : '#1f1f1f';
  };
  
  const listBtn = document.createElement('button');
  listBtn.textContent = loadPlaylistVisible() ? 'List: Hide' : 'List: Show';
  listBtn.onclick = () => {
    const sb = document.getElementById('yt-lucky-playlist-sidebar-v3');
    if (!sb) return;
    const n = sb.style.display === 'none';
    sb.style.display = n ? 'flex' : 'none';
    listBtn.textContent = n ? 'List: Hide' : 'List: Show';
    savePlaylistVisible(n);
	updateSidebarVisibilityState(n); // <--- Add this line
  };
  
  row.append(inp, go, artistBtn, artistSubWrap, lyricsBtn, autoBtn, listBtn);
  w.append(row);

  if (document.body) document.body.prepend(w);
  else document.documentElement.prepend(w);

  const applyBarHeight = () => {
    const h = w.getBoundingClientRect().height || 40;
    document.documentElement.style.setProperty('--yt-plugin-bar-h', h + 'px');
  };
  applyBarHeight();
  requestAnimationFrame(applyBarHeight);
  setTimeout(applyBarHeight, 300);
  window.addEventListener('resize', applyBarHeight);

  createPlaylistSidebar();
  renderTabsBar();
  renderPlaylistUI();
}

playlists = loadAllPlaylists();
if (playlists['__SEARCH_RESULTS__']) {
  isSearchLocked = true;
  playlistSearchQuery = playlists['__SEARCH_RESULTS__'].query || '';
}
activeTab = loadActiveTab();
if (activeTab === '__TRANSIENT_ARTIST__' || !playlists[activeTab]) {
  activeTab = Object.keys(playlists)[0] || null;
}
currentIndex = loadLastIndex();

let lastKnownTitle = '', lastKnownIndex = -1;

function runStateObserver() {
  const ct = getCurrentVideoTitle(), ci = loadLastIndex();
  let rr = false;
  
  if (ct && ct !== lastKnownTitle) {
    rr = true;
    lastKnownTitle = ct;
    const vid = extractVideoId(window.location.href);
    if (vid) YtLyrics.onVideoChange(vid, true);
    if (YtAIExplainer.panelElement && YtAIExplainer.panelElement.style.display === 'flex') YtAIExplainer.explainCurrentSong();
  }
  
  if (ci !== lastKnownIndex) { rr = true; lastKnownIndex = ci; }
  
  const v = document.querySelector('video');
  if (v && !v._ytLuckyAttached) {
    v._ytLuckyAttached = true;
    v.addEventListener('ended', triggerNextSong);
    v.addEventListener('timeupdate', () => { if (!v.paused && v.duration > 0 && (v.duration - v.currentTime) <= 1.5) triggerNextSong(); });
    v.addEventListener('playing', () => { prefetchNextSong(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
    v.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
    if (_audioCtx && !v._ytLuckyAudioConnected) {
      try {
        const s = _audioCtx.createMediaElementSource(v);
        s.connect(_audioCtx.destination);
        v._ytLuckyAudioConnected = true;
      } catch(e) {}
    }
    rr = true;
  }
  
  if (rr) {
    setTimeout(() => {
      renderTabsBar(); renderPlaylistUI(); startProgressTracking();
    }, 300);
  }
}

let _mutationT = null;

const mainObs = new MutationObserver(() => {
  if (!document.body) return;
  replaceLogo(); // <--- Ensure this is invoked here
  if (!window._ytLuckyBootstrapped) {
    const tb = document.querySelector('ytd-masthead #end, ytd-masthead #end-container, #end, ytm-mobile-topbar-renderer');
    if (tb || IS_MOBILE) {
      window._ytLuckyBootstrapped = true;
      YtPotPlayer.init();
      YtLyrics.init();
      YtAIExplainer.init();
      YtAISettings.init();
      YouTubeHub.ensureSidebar();
      YouTubeHub.loadInitial();
      YouTubePro.buildPanel();
	  YtAnchor.init();
      applyProStyles();
      initBackgroundBypass();
      initUI();
      startProgressTracking();
      if (loadAutoplayEnabled()) enforcePlayback();
      if (cfg.ui.luckyScale && cfg.ui.luckyScale !== 100) {
        setTimeout(() => window._ytLuckyApplyScale(cfg.ui.luckyScale / 100), 500);
      }
    }
    return;
  }
  if (_mutationT) return;
  _mutationT = setTimeout(() => {
    _mutationT = null;
    if (!document.getElementById('yt-lucky-controls-v3-wrapper')) initUI();
    runStateObserver();
  }, 350);
});
mainObs.observe(document.documentElement, { childList: true, subtree: true });

setInterval(() => { if (document.querySelector('video')) updateProgressBar(); }, 1000);

setInterval(() => {
  const v = document.querySelector('video');
  if (v && v.muted) { v.muted = false; if (v.volume < 1) v.volume = 1; }
  document.querySelectorAll('.ytp-unmute, .ytp-unmute-button, .ytp-unmute-overlay, .ytp-tap-to-unmute, .ytp-unmute-animation, button[aria-label*="Unmute" i], button[title*="Unmute" i]').forEach(b => {
    if (b.style.display !== 'none') { b.style.display = 'none'; try { b.click(); } catch(_) {} }
  });
}, 400);

setInterval(() => {
  const err = document.querySelector('.ytp-error');
  const v = document.querySelector('video');
  const isErr = (err && err.style.display !== 'none') || (v && v.error);
  if (isErr) {
    const t = getCurrentVideoTitle() || 'Unknown';
    if (!YtPotPlayer.state.failed.includes(t)) YtPotPlayer.state.failed.push(t + ' (Playback Error)');
    const cb = document.querySelector('.ytp-error-button');
    if (cb) cb.click(); else if (err) err.style.display = 'none';
    triggerNextSong();
  }
}, 3000);

window.addEventListener('resize', () => {
  if (typeof fixFullWidth === 'function') fixFullWidth();
});

document.addEventListener('fullscreenchange', () => {
  const topBar = document.getElementById('yt-lucky-controls-v3-wrapper');
  if (document.fullscreenElement) {
    document.documentElement.style.setProperty('zoom', '1', 'important');
    document.body.style.setProperty('zoom', '1', 'important');
    if (topBar) topBar.style.setProperty('display', 'none', 'important');
  } else {
    document.documentElement.style.removeProperty('zoom');
    document.body.style.removeProperty('zoom');
    if (topBar) topBar.style.setProperty('display', 'flex', 'important');
  }
});

document.addEventListener('pointerdown', (e) => {
  const searchForm = document.querySelector('ytm-searchbox, ytd-searchbox, form.ytd-searchbox');
  if (searchForm && searchForm.contains(document.activeElement) && !searchForm.contains(e.target)) {
    document.activeElement.blur();
    const dropdown = document.querySelector('ytm-searchbox .searchbox-dropdown, ytd-searchbox #search-suggestions');
    if (dropdown) dropdown.style.display = 'none';
  }
}, true);

})();
