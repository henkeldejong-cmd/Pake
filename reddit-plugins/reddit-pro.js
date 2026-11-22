// ==UserScript==
// @name         Reddit Pro — Desktop App Edition
// @namespace    https://reddit.com/
// @version      2.3.4
// @description  Adapted for desktop app wrappers and direct webview injection.
// @author       You
// @match        https://www.reddit.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /* ====================
     Desktop App GM_* Polyfills
     ==================== */
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

  if (typeof GM_registerMenuCommand === 'undefined') {
    window.GM_registerMenuCommand = () => {};
  }

  /* ====================
     Configuration & Defaults
     ==================== */
  const STORAGE_KEYS = {
    fontSize: 'rp_fontSize',
    voteBtnSize: 'rp_voteBtnSize',
    userNameFontSize: 'rp_userNameFontSize',
    fontFamily: 'rp_fontFamily',
    toggleBtnWidth: 'rp_toggleBtnWidth',
    toggleBtnHeight: 'rp_toggleBtnHeight',
    toggleBtnFontSize: 'rp_toggleBtnFontSize',
    toggleBtnHidden: 'rp_toggleBtnHidden',
    hideVideoPosts: 'rp_hideVideoPosts',
    hidePromotedPosts: 'rp_hidePromotedPosts'
  };

  const MIN = {
    fontSize: 8,
    voteBtnSize: 12,
    userNameFontSize: 10,
    toggleBtnWidth: 30,
    toggleBtnHeight: 20,
    toggleBtnFontSize: 10,
    padding: 6
  };

  const DEFAULTS = {
    fontSize: 13,
    voteBtnSize: 28,
    userNameFontSize: 14,
    fontFamily: `"Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
    toggleBtnWidth: 70,
    toggleBtnHeight: 32,
    toggleBtnFontSize: 14,
    toggleBtnHidden: false,
    hideVideoPosts: false,
    hidePromotedPosts: false
  };

  const settings = {};
  Object.keys(DEFAULTS).forEach((key) => {
    const raw = GM_getValue(STORAGE_KEYS[key], DEFAULTS[key]);
    if (typeof DEFAULTS[key] === 'number') {
      const min = MIN[key] !== undefined ? MIN[key] : -Infinity;
      const parsed = parseInt(raw, 10);
      settings[key] = Math.max(min, isNaN(parsed) ? DEFAULTS[key] : parsed);
    } else if (typeof DEFAULTS[key] === 'boolean') {
      settings[key] = raw === true || raw === 'true';
    } else {
      settings[key] = raw;
    }
  });

  function save(key, value) {
    settings[key] = value;
    GM_setValue(STORAGE_KEYS[key], value);
  }

  /* ====================
     Helpers
     ==================== */
  function onBodyReady(fn) {
    if (document.body) return fn();
    window.addEventListener('DOMContentLoaded', fn, { once: true });
    // Fallback if DOMContentLoaded already fired before script injection
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      fn();
    }
  }

  function measureTextWidth(text, fontSizePx, fontFamilyStr) {
    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'nowrap';
    span.style.fontSize = fontSizePx + 'px';
    span.style.fontFamily = fontFamilyStr;
    span.textContent = text;
    (document.body || document.documentElement).appendChild(span);
    const w = span.offsetWidth;
    span.remove();
    return w;
  }

  /* ====================
     Site styles (typography, vote button sizing, feed filters)
     ==================== */
  const STYLE_ID = 'tm-reddit-pro-styles';
  function updateSiteStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Great+Vibes&family=Inter:wght@400;600;700&family=Josefin+Sans:wght@400;600;700&display=swap');

      * { font-family: ${settings.fontFamily} !important; }
      html, body, ._1qeIAgB0cPwnLhDF9XSiJM, ._292iotee39Lmt0MkQZ2hPV,
      h1,h2,h3,h4,h5,h6,p,span,a,input,select,textarea { font-size: ${settings.fontSize}px !important; line-height: 1.3 !important; }
      button._1sA-1fD-4WnzFtu4J83FFQ, div._23jJK9LyK0hFerd1vP8gFri { width: ${settings.voteBtnSize}px !important; height: ${settings.voteBtnSize}px !important; min-width: ${settings.voteBtnSize}px !important; min-height: ${settings.voteBtnSize}px !important; font-size: ${Math.max(settings.voteBtnSize - 14, 6)}px !important; line-height: ${settings.voteBtnSize}px !important; }
      a._2tbHP6ZydRpjI44J3syuqC, span._2tbHP6ZydRpjI44J3syuqC { font-size: ${settings.userNameFontSize}px !important; font-weight: 600 !important; }
      #reddit-pro-toggle-btn, #reddit-pro-mini-btn, #tm-reddit-pro-settings { z-index: 2147483647 !important; }
    `;
  }

  /* ====================
     Feed filters
     ==================== */
  const HIDE_MARK_ATTR = 'data-rp-hidden-by-filter';
  const VIDEO_HOSTS = ['v.redd.it', 'youtube.com', 'youtu.be', 'vimeo.com', 'gfycat.com', 'redgifs.com', 'streamable.com', 'clips.twitch.tv'];

  function isVideoPost(post) {
    if (!post) return false;
    const postType = (post.getAttribute('post-type') || '').toLowerCase();
    if (postType === 'video') return true;
    const domain = (post.getAttribute('domain') || '').toLowerCase();
    const contentHref = (post.getAttribute('content-href') || '').toLowerCase();
    if (VIDEO_HOSTS.some(host => domain.includes(host) || contentHref.includes(host))) return true;
    if (post.querySelector('video, shreddit-player, shreddit-player-2')) return true;
    return false;
  }

  function isPromotedPost(post) {
    if (!post) return false;
    return post.hasAttribute('promoted') || post.hasAttribute('is-promoted');
  }

  function getPostContainer(post) {
    const article = post.closest('article[data-post-id]') || post.closest('article');
    if (article) return article;

    let el = post;
    let hops = 0;
    while (
      el.parentElement &&
      el.parentElement !== document.body &&
      el.parentElement.children.length === 1 &&
      hops < 8
    ) {
      el = el.parentElement;
      hops++;
    }
    return el;
  }

  function isLikelyDivider(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'SHREDDIT-POST') return false;
    if (el.querySelector('shreddit-post, a, button, img, video, iframe, svg, input, select, textarea')) return false;
    const text = (el.textContent || '').trim();
    return text.length === 0;
  }

  function getDividerSiblings(container) {
    const siblings = [];
    const prev = container.previousElementSibling;
    const next = container.nextElementSibling;
    if (isLikelyDivider(prev)) siblings.push(prev);
    if (isLikelyDivider(next)) siblings.push(next);
    return siblings;
  }

  function applyFeedFilters() {
    const posts = document.querySelectorAll('shreddit-post');
    const toHide = new Set();

    posts.forEach(post => {
      const shouldHide =
        (settings.hideVideoPosts && isVideoPost(post)) ||
        (settings.hidePromotedPosts && isPromotedPost(post));
      if (!shouldHide) return;
      const container = getPostContainer(post);
      toHide.add(container);
      getDividerSiblings(container).forEach(sib => toHide.add(sib));
    });

    document.querySelectorAll(`[${HIDE_MARK_ATTR}]`).forEach(el => {
      if (!toHide.has(el)) {
        el.style.display = '';
        el.removeAttribute(HIDE_MARK_ATTR);
      }
    });

    toHide.forEach(el => {
      if (el.style.display !== 'none') el.style.display = 'none';
      el.setAttribute(HIDE_MARK_ATTR, '1');
    });
  }

  let filterPassScheduled = false;
  function scheduleApplyFeedFilters() {
    if (filterPassScheduled) return;
    filterPassScheduled = true;
    requestAnimationFrame(() => {
      filterPassScheduled = false;
      applyFeedFilters();
    });
  }

  const feedObserver = new MutationObserver(scheduleApplyFeedFilters);
  function startFeedObserver() {
    if (document.body) {
      feedObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ====================
     UI Elements Creation
     ==================== */
  const BUTTON_ID = 'reddit-pro-toggle-btn';
  const MINI_ID = 'reddit-pro-mini-btn';
  const PANEL_ID = 'tm-reddit-pro-settings';
  let toggleBtn, miniBtn, settingsPanel;

  function createToggleButton() {
    toggleBtn = document.createElement('button');
    toggleBtn.id = BUTTON_ID;
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'Reddit Pro';
    Object.assign(toggleBtn.style, {
      position: 'fixed', bottom: '10px', right: '10px',
      minWidth: `${MIN.toggleBtnWidth}px`, minHeight: `${MIN.toggleBtnHeight}px`,
      fontWeight: '600', borderRadius: '8px', border: 'none', cursor: 'pointer',
      backgroundColor: '#ff4500', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      alignItems: 'center', justifyContent: 'center', paddingLeft: '12px', paddingRight: '12px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      lineHeight: 'normal', boxSizing: 'border-box'
    });
    toggleBtn.addEventListener('click', () => toggleSettingsPanel(true));
    return toggleBtn;
  }

  function createMiniButton() {
    miniBtn = document.createElement('button');
    miniBtn.id = MINI_ID;
    miniBtn.type = 'button';
    miniBtn.textContent = 'RP';
    Object.assign(miniBtn.style, {
        position: 'fixed', bottom: '10px', right: '10px',
        padding: '6px 10px', fontSize: '13px', borderRadius: '8px',
        border: 'none', backgroundColor: '#ff4500', color: '#fff',
        cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        boxSizing: 'border-box', display: 'none'
    });
    miniBtn.addEventListener('click', () => {
        toggleSettingsPanel(true);
        miniBtn.style.display = 'none';
    });
    return miniBtn;
  }

  function createSettingsPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed', bottom: '56px', right: '10px',
      width: '320px', maxWidth: 'calc(100% - 20px)', maxHeight: '80vh', overflowY: 'auto',
      background: '#1a1a1b', borderRadius: '10px', border: '1px solid #343536',
      padding: '14px', boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', color: '#d7dadc',
      display: 'none', boxSizing: 'border-box', userSelect: 'none'
    });
    panel.innerHTML = `
      <div style="font-weight:700; font-size:15px; margin-bottom:10px; color:#fff; display:flex; align-items:baseline; justify-content:space-between;">
        <span>⚙ Reddit Pro Settings</span>
        <span style="font-size:11px; color:#818384; font-weight:400;">v2.3.4</span>
      </div>

      <label style="display:block; margin-bottom:10px; font-size:13px;">Font size: <span id="rp_fontSize_val" style="color:#ff4500; font-weight:600;">${settings.fontSize}px</span><input id="rp_fontSize" type="range" min="${MIN.fontSize}" max="22" value="${settings.fontSize}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Vote button size: <span id="rp_voteBtnSize_val" style="color:#ff4500; font-weight:600;">${settings.voteBtnSize}px</span><input id="rp_voteBtnSize" type="range" min="${MIN.voteBtnSize}" max="48" value="${settings.voteBtnSize}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Username font size: <span id="rp_userNameFontSize_val" style="color:#ff4500; font-weight:600;">${settings.userNameFontSize}px</span><input id="rp_userNameFontSize" type="range" min="${MIN.userNameFontSize}" max="24" value="${settings.userNameFontSize}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Button width: <span id="rp_toggleBtnWidth_val" style="color:#ff4500; font-weight:600;">${settings.toggleBtnWidth}px</span><input id="rp_toggleBtnWidth" type="range" min="${MIN.toggleBtnWidth}" max="300" value="${settings.toggleBtnWidth}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Button height: <span id="rp_toggleBtnHeight_val" style="color:#ff4500; font-weight:600;">${settings.toggleBtnHeight}px</span><input id="rp_toggleBtnHeight" type="range" min="${MIN.toggleBtnHeight}" max="120" value="${settings.toggleBtnHeight}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Button text size: <span id="rp_toggleBtnFontSize_val" style="color:#ff4500; font-weight:600;">${settings.toggleBtnFontSize}px</span><input id="rp_toggleBtnFontSize" type="range" min="${MIN.toggleBtnFontSize}" max="30" value="${settings.toggleBtnFontSize}" style="width:100%; accent-color:#ff4500;"></label>

      <label style="display:block; margin-bottom:10px; font-size:13px;">
        Font family:
        <select id="rp_fontFamily" style="width:100%; margin-top:6px; padding:6px; background:#272729; color:#d7dadc; border:1px solid #343536; border-radius:6px;">
          <option value='"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'>Segoe UI (default)</option>
          <option value='"Bodoni MT", Bodoni, "Bodoni Moda", serif'>Bodoni</option>
          <option value='Didot, "Didot LT STD", "Hoefler Text", Garamond, serif'>Didot</option>
          <option value='"Great Vibes", cursive'>Great Vibes</option>
          <option value='"Chopin Script", cursive'>Chopin Script</option>
          <option value='"Inter", sans-serif'>Inter</option>
          <option value='"Josefin Sans", sans-serif'>Josefin Sans</option>
          <option value='"Coco Gothic", sans-serif'>Coco Gothic</option>
          <option value='Adequate, sans-serif'>Adequate</option>
          <option value='Dense, sans-serif'>Dense</option>
          <option value='Arial, Helvetica, sans-serif'>Arial</option>
          <option value='"Helvetica Neue", Helvetica, Arial, sans-serif'>Helvetica Neue</option>
          <option value='"Roboto", sans-serif'>Roboto</option>
          <option value='"Open Sans", sans-serif'>Open Sans</option>
          <option value='"Fira Sans", sans-serif'>Fira Sans</option>
          <option value='"Source Sans Pro", sans-serif'>Source Sans Pro</option>
          <option value='"Ubuntu", sans-serif'>Ubuntu</option>
          <option value='"Noto Sans", sans-serif'>Noto Sans</option>
          <option value='"Lato", sans-serif'>Lato</option>
          <option value='"Perplexity", sans-serif'>Perplexity (approx)</option>
        </select>
      </label>

      <div style="border-top:1px solid #343536; margin:12px 0;"></div>

      <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#fff;">Feed Filters</div>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:13px;"><input id="rp_hideVideoPosts" type="checkbox" style="accent-color:#ff4500;" ${settings.hideVideoPosts ? 'checked' : ''}><span>Hide posts with videos</span></label>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:13px;"><input id="rp_hidePromotedPosts" type="checkbox" style="accent-color:#ff4500;" ${settings.hidePromotedPosts ? 'checked' : ''}><span>Hide promoted / ad posts</span></label>

      <div style="border-top:1px solid #343536; margin:12px 0;"></div>

      <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input id="rp_hideToggleBtn" type="checkbox" style="accent-color:#ff4500;" ${settings.toggleBtnHidden ? 'checked' : ''}><span>Hide the Reddit Pro button</span></label>

      <div style="display:flex; gap:8px; margin-top:14px;">
        <button id="rp_close" style="flex:1; padding:8px; font-weight:600; background:#ff4500; color:#fff; border:none; border-radius:6px; cursor:pointer;">Close</button>
        <button id="rp_reset" style="flex:1; padding:8px; background:#272729; color:#d7dadc; border:1px solid #343536; border-radius:6px; cursor:pointer;">Reset</button>
      </div>
    `;
    return panel;
  }

  /* ====================
     UI Update Logic
     ==================== */
  function updateButtonVisibility() {
      if (!toggleBtn || !miniBtn) return;
      toggleBtn.style.display = settings.toggleBtnHidden ? 'none' : 'inline-flex';
      miniBtn.style.display = settings.toggleBtnHidden ? 'inline-block' : 'none';
  }

  function updateToggleButtonDimensions() {
    if (!toggleBtn) return;
    const text = toggleBtn.textContent || 'Reddit Pro';
    const measuredTextWidth = measureTextWidth(text, settings.toggleBtnFontSize, settings.fontFamily);
    const minRequiredWidth = measuredTextWidth + MIN.padding * 2;

    if (settings.toggleBtnWidth < minRequiredWidth) {
        save('toggleBtnWidth', Math.ceil(minRequiredWidth));
        const wVal = document.getElementById('rp_toggleBtnWidth_val');
        const wSlider = document.getElementById('rp_toggleBtnWidth');
        if (wVal) wVal.textContent = `${settings.toggleBtnWidth}px`;
        if (wSlider) wSlider.value = settings.toggleBtnWidth;
    }

    const paddingH = Math.max(MIN.padding, Math.floor((settings.toggleBtnWidth - measuredTextWidth) / 2));
    toggleBtn.style.width = `${settings.toggleBtnWidth}px`;
    toggleBtn.style.height = `${settings.toggleBtnHeight}px`;
    toggleBtn.style.fontSize = `${settings.toggleBtnFontSize}px`;
    toggleBtn.style.fontFamily = settings.fontFamily;
    toggleBtn.style.paddingLeft = `${paddingH}px`;
    toggleBtn.style.paddingRight = `${paddingH}px`;
    miniBtn.style.fontFamily = settings.fontFamily;
  }

  function toggleSettingsPanel(show) {
    if (!settingsPanel) return;
    settingsPanel.style.display = show ? 'block' : 'none';
    if (show) {
      miniBtn && (miniBtn.style.display = 'none');
    } else {
      updateButtonVisibility();
    }
  }

  function wireSettingsEvents() {
    if (!settingsPanel) return;

    const controls = {
        fontSize: { slider: '#rp_fontSize', val: '#rp_fontSize_val', key: 'fontSize', min: MIN.fontSize, suffix: 'px', callback: updateSiteStyles },
        voteBtnSize: { slider: '#rp_voteBtnSize', val: '#rp_voteBtnSize_val', key: 'voteBtnSize', min: MIN.voteBtnSize, suffix: 'px', callback: updateSiteStyles },
        userNameFontSize: { slider: '#rp_userNameFontSize', val: '#rp_userNameFontSize_val', key: 'userNameFontSize', min: MIN.userNameFontSize, suffix: 'px', callback: updateSiteStyles },
        toggleBtnWidth: { slider: '#rp_toggleBtnWidth', val: '#rp_toggleBtnWidth_val', key: 'toggleBtnWidth', min: MIN.toggleBtnWidth, suffix: 'px', callback: updateToggleButtonDimensions },
        toggleBtnHeight: { slider: '#rp_toggleBtnHeight', val: '#rp_toggleBtnHeight_val', key: 'toggleBtnHeight', min: MIN.toggleBtnHeight, suffix: 'px', callback: updateToggleButtonDimensions },
        toggleBtnFontSize: { slider: '#rp_toggleBtnFontSize', val: '#rp_toggleBtnFontSize_val', key: 'toggleBtnFontSize', min: MIN.toggleBtnFontSize, suffix: 'px', callback: updateToggleButtonDimensions },
    };

    Object.values(controls).forEach(c => {
        const slider = settingsPanel.querySelector(c.slider);
        const valEl = settingsPanel.querySelector(c.val);
        slider && slider.addEventListener('input', (e) => {
            let value = Math.max(c.min, parseInt(e.target.value, 10));
            save(c.key, value);
            valEl.textContent = value + (c.suffix || '');
            c.callback && c.callback();
        });
    });

    const fontFamilySelect = settingsPanel.querySelector('#rp_fontFamily');
    const hideCheckbox = settingsPanel.querySelector('#rp_hideToggleBtn');
    const hideVideoCheckbox = settingsPanel.querySelector('#rp_hideVideoPosts');
    const hidePromotedCheckbox = settingsPanel.querySelector('#rp_hidePromotedPosts');
    const closeBtn = settingsPanel.querySelector('#rp_close');
    const resetBtn = settingsPanel.querySelector('#rp_reset');

    fontFamilySelect.value = settings.fontFamily;
    fontFamilySelect.addEventListener('change', (e) => {
      save('fontFamily', e.target.value);
      updateSiteStyles();
      updateToggleButtonDimensions();
    });

    hideCheckbox.addEventListener('change', (e) => {
      save('toggleBtnHidden', !!e.target.checked);
      updateButtonVisibility();
    });

    hideVideoCheckbox.addEventListener('change', (e) => {
      save('hideVideoPosts', !!e.target.checked);
      applyFeedFilters();
    });

    hidePromotedCheckbox.addEventListener('change', (e) => {
      save('hidePromotedPosts', !!e.target.checked);
      applyFeedFilters();
    });

    closeBtn.addEventListener('click', () => toggleSettingsPanel(false));
    resetBtn.addEventListener('click', () => {
      if (!confirm("Are you sure you want to reset all settings to default?")) return;
      Object.keys(DEFAULTS).forEach(key => save(key, DEFAULTS[key]));
      location.reload();
    });
  }

  function registerMenuCommands() {
    try {
      GM_registerMenuCommand("Show/Hide Reddit Pro Button", () => {
        save('toggleBtnHidden', !settings.toggleBtnHidden);
        updateButtonVisibility();
        if (settingsPanel && settingsPanel.style.display !== 'none') {
            toggleSettingsPanel(false);
        }
      });
      GM_registerMenuCommand("Open Reddit Pro Settings", () => toggleSettingsPanel(true));
      GM_registerMenuCommand("Toggle Hide Video Posts", () => {
        save('hideVideoPosts', !settings.hideVideoPosts);
        applyFeedFilters();
        const cb = document.getElementById('rp_hideVideoPosts');
        if (cb) cb.checked = settings.hideVideoPosts;
      });
    } catch (err) {
      console.warn('GM_registerMenuCommand not available:', err);
    }
  }

  /* ====================
     Initialize
     ==================== */
  onBodyReady(() => {
    updateSiteStyles();

    document.body.appendChild(createToggleButton());
    document.body.appendChild(createMiniButton());
    document.body.appendChild(createSettingsPanel());

    toggleBtn = document.getElementById(BUTTON_ID);
    miniBtn = document.getElementById(MINI_ID);
    settingsPanel = document.getElementById(PANEL_ID);

    updateToggleButtonDimensions();
    updateButtonVisibility();
    wireSettingsEvents();
    registerMenuCommands();
    applyFeedFilters();
    startFeedObserver();

    setInterval(() => {
      updateSiteStyles();
      updateButtonVisibility();
      applyFeedFilters();
    }, 1500);
  });
})();
