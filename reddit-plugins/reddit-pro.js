// ==UserScript==
// @name         Reddit Pro — Full UI & Button Control (Custom Fonts)
// @namespace    https://reddit.com/
// @version      2.4.1
// @description  Upgraded ad filtering for modern Reddit interfaces, shadow DOM support, and UI controls.
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
    padding: 8
  };

  const DEFAULTS = {
    fontSize: 13,
    voteBtnSize: 28,
    userNameFontSize: 14,
    fontFamily: `"Segoe UI", Tahoma, Geneva, Verdana, sans-serif`,
    toggleBtnWidth: 88,
    toggleBtnHeight: 32,
    toggleBtnFontSize: 14,
    toggleBtnHidden: false,
    hideVideoPosts: false,
    hidePromotedPosts: false
  };

  /* ====================
     Live settings state
     ==================== */
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
  }

  function measureTextWidth(text, fontSizePx, fontFamilyStr, fontWeight = '600') {
    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'nowrap';
    span.style.fontSize = fontSizePx + 'px';
    span.style.fontFamily = fontFamilyStr;
    span.style.fontWeight = fontWeight;
    document.body.appendChild(span);
    span.textContent = text;
    const w = span.offsetWidth;
    span.remove();
    return w;
  }

  /* ====================
     Fonts & Styles (Light DOM + Shadow DOM)
     ==================== */
  const FONT_LINK_ID = 'tm-reddit-pro-fonts';
  const STYLE_ID = 'tm-reddit-pro-styles';
  const SHADOW_STYLE_ATTR = 'data-rp-shadow-style';

  const VOTE_BUTTON_SELECTOR = [
    'button[upvote]',
    'button[downvote]',
    'button[data-testid="upvote-button"]',
    'button[data-testid="downvote-button"]',
    'button[aria-label^="Upvote"]',
    'button[aria-label^="Downvote"]',
    'button[id^="upvote-button"]',
    'button[id^="downvote-button"]',
    'shreddit-async-button[upvote] button',
    'shreddit-async-button[downvote] button'
  ].join(', ');

  const VOTE_SVG_SELECTOR = [
    'button[upvote] svg',
    'button[downvote] svg',
    'button[data-testid="upvote-button"] svg',
    'button[data-testid="downvote-button"] svg',
    'button[aria-label^="Upvote"] svg',
    'button[aria-label^="Downvote"] svg'
  ].join(', ');

  const USERNAME_SELECTOR = [
    'shreddit-post [slot="authorName"]',
    'shreddit-post [slot="authorName"] a',
    'shreddit-post [slot="authorName"] span',
    'shreddit-comment [slot="commentMeta"] a[href^="/user/"]',
    '[data-testid="post-author-name"]',
    '[data-testid="comment-author-name"]'
  ].join(', ');

  const SHADOW_USERNAME_SELECTOR = [
    '[slot="authorName"]',
    '[slot="authorName"] a',
    '[slot="commentMeta"] a[href^="/user/"]',
    '[data-testid="post_author_link"]',
    '[data-testid="comment_author_link"]'
  ].join(', ');

  function ensureGoogleFonts() {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Fira+Sans:wght@400;600;700&family=Great+Vibes&family=Inter:wght@400;600;700&family=Josefin+Sans:wght@400;600;700&family=Lato:wght@400;700&family=Noto+Sans:wght@400;600;700&family=Open+Sans:wght@400;600;700&family=Roboto:wght@400;500;700&family=Source+Sans+3:wght@400;600;700&family=Ubuntu:wght@400;500;700&display=swap';
    (document.head || document.documentElement).appendChild(link);
  }

  function buildSiteCss() {
    const iconSize = Math.max(Math.round(settings.voteBtnSize * 0.57), 8);
    const voteFontSize = Math.max(settings.voteBtnSize - 14, 6);

    // Enhanced robust ad hiding selectors for modern Reddit interfaces
    const adHideCss = settings.hidePromotedPosts
      ? `
      shreddit-ad-post,
      shreddit-comments-page-ad,
      shreddit-comment-tree-ad,
      shreddit-dynamic-ad-link,
      shreddit-async-loader[bundlename="sidebar_ad"],
      shreddit-async-loader[bundlename="feed_ad"],
      div[data-before-content="advertisement"],
      faceplate-tracker[noun="ad"],
      article:has(shreddit-ad-post),
      div:has(> shreddit-ad-post),
      [data-testid="ad-post"],
      [data-testid="promoted-badge"] {
        display: none !important;
      }`
      : '';

    return `
      * { font-family: ${settings.fontFamily} !important; }

      html, body, 
      h1:not(#tm-reddit-pro-settings *),
      h2:not(#tm-reddit-pro-settings *),
      h3:not(#tm-reddit-pro-settings *),
      h4:not(#tm-reddit-pro-settings *),
      h5:not(#tm-reddit-pro-settings *),
      h6:not(#tm-reddit-pro-settings *),
      p:not(#tm-reddit-pro-settings *),
      span:not(#tm-reddit-pro-settings *),
      a:not(#tm-reddit-pro-settings *),
      input:not(#tm-reddit-pro-settings *),
      select:not(#tm-reddit-pro-settings *),
      textarea:not(#tm-reddit-pro-settings *) {
        font-size: ${settings.fontSize}px !important;
        line-height: 1.3 !important;
      }

      ${VOTE_BUTTON_SELECTOR} {
        width: ${settings.voteBtnSize}px !important;
        height: ${settings.voteBtnSize}px !important;
        min-width: ${settings.voteBtnSize}px !important;
        min-height: ${settings.voteBtnSize}px !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: ${voteFontSize}px !important;
        line-height: 1 !important;
      }
      ${VOTE_SVG_SELECTOR} {
        width: ${iconSize}px !important;
        height: ${iconSize}px !important;
      }

      ${USERNAME_SELECTOR} {
        font-size: ${settings.userNameFontSize}px !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
      }

      ${adHideCss}

      #reddit-pro-toggle-btn,
      #reddit-pro-mini-btn {
        z-index: 2147483647 !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        line-height: 1 !important;
        font-weight: 600 !important;
        box-sizing: border-box !important;
        margin: 0 !important;
      }
      #reddit-pro-toggle-btn {
        padding: 0 ${MIN.padding}px !important;
      }
      #reddit-pro-mini-btn {
        padding: 6px 10px !important;
        font-size: 13px !important;
      }
      #tm-reddit-pro-settings {
        z-index: 2147483647 !important;
      }
    `;
  }

  function buildShadowCss() {
    const iconSize = Math.max(Math.round(settings.voteBtnSize * 0.57), 8);
    const voteFontSize = Math.max(settings.voteBtnSize - 14, 6);

    return `
      * { font-family: ${settings.fontFamily} !important; }

      ${VOTE_BUTTON_SELECTOR} {
        width: ${settings.voteBtnSize}px !important;
        height: ${settings.voteBtnSize}px !important;
        min-width: ${settings.voteBtnSize}px !important;
        min-height: ${settings.voteBtnSize}px !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: ${voteFontSize}px !important;
        line-height: 1 !important;
      }
      ${VOTE_SVG_SELECTOR} {
        width: ${iconSize}px !important;
        height: ${iconSize}px !important;
      }
      ${SHADOW_USERNAME_SELECTOR} {
        font-size: ${settings.userNameFontSize}px !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
      }
    `;
  }

  const SHADOW_HOST_SELECTOR = [
    'shreddit-post',
    'shreddit-ad-post',
    'shreddit-comment',
    'shreddit-comment-action-row',
    'shreddit-async-button'
  ].join(', ');

  function applyStylesToShadowRoot(host) {
    if (!host || !host.shadowRoot) return;
    const css = buildShadowCss();
    let style = host.shadowRoot.querySelector(`style[${SHADOW_STYLE_ATTR}]`);
    if (!style) {
      style = document.createElement('style');
      style.setAttribute(SHADOW_STYLE_ATTR, '1');
      host.shadowRoot.appendChild(style);
    }
    if (style.textContent !== css) {
      style.textContent = css;
    }
    host.shadowRoot.querySelectorAll(SHADOW_HOST_SELECTOR).forEach(applyStylesToShadowRoot);
  }

  function updateAllShadowStyles() {
    document.querySelectorAll(SHADOW_HOST_SELECTOR).forEach(applyStylesToShadowRoot);
  }

  function updateSiteStyles() {
    ensureGoogleFonts();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    } else if (!style.isConnected) {
      (document.head || document.documentElement).appendChild(style);
    }

    const css = buildSiteCss();
    if (style.textContent !== css) {
      style.textContent = css;
    }
    updateAllShadowStyles();
  }

  /* ====================
     Feed filters (hide video / promoted & ad posts)
     ==================== */
  const HIDE_MARK_ATTR = 'data-rp-hidden-by-filter';
  const VIDEO_HOSTS = [
    'v.redd.it',
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'gfycat.com',
    'redgifs.com',
    'streamable.com',
    'clips.twitch.tv'
  ];

  const FEED_TARGET_SELECTOR = [
    'shreddit-post',
    'shreddit-ad-post',
    'shreddit-comments-page-ad',
    'shreddit-comment-tree-ad',
    'shreddit-dynamic-ad-link',
    'shreddit-async-loader[bundlename="sidebar_ad"]',
    'shreddit-async-loader[bundlename="feed_ad"]',
    'div[data-before-content="advertisement"]',
    'faceplate-tracker[noun="ad"]'
  ].join(', ');

  function isVideoPost(post) {
    if (!post || post.tagName !== 'SHREDDIT-POST') return false;
    const postType = (post.getAttribute('post-type') || '').toLowerCase();
    if (postType === 'video') return true;
    const domain = (post.getAttribute('domain') || '').toLowerCase();
    const contentHref = (post.getAttribute('content-href') || '').toLowerCase();
    if (VIDEO_HOSTS.some((host) => domain.includes(host) || contentHref.includes(host))) return true;
    if (post.querySelector('video, shreddit-player, shreddit-player-2')) return true;
    return false;
  }

  function hasPromotedLabel(root) {
    if (!root) return false;
    const creditArea = root.querySelector('[slot="credit-bar"], [slot="promoted-label"], .promoted-tag');
    if (!creditArea) return false;
    const candidates = creditArea.querySelectorAll('span, div, a, faceplate-tracker');
    for (const node of candidates) {
      if (node.children.length > 0) continue;
      const txt = (node.textContent || '').trim().toLowerCase();
      if (txt === 'promoted' || txt === 'sponsored' || txt === 'ad') return true;
    }
    return false;
  }

  function isPromotedPost(el) {
    if (!el) return false;
    if (
      el.matches(
        'shreddit-ad-post, shreddit-comments-page-ad, shreddit-comment-tree-ad, shreddit-dynamic-ad-link, shreddit-async-loader[bundlename="sidebar_ad"], shreddit-async-loader[bundlename="feed_ad"], div[data-before-content="advertisement"], faceplate-tracker[noun="ad"]'
      )
    ) {
      return true;
    }
    if (
      el.hasAttribute('promoted') ||
      el.hasAttribute('is-promoted') ||
      el.hasAttribute('data-is-promoted') ||
      el.hasAttribute('ad-events') ||
      el.hasAttribute('data-adclicklocation')
    ) {
      return true;
    }
    // Deep inspection for hidden ad footprints in attributes or text
    const outerHTML = el.outerHTML || '';
    if (outerHTML.includes('promoted-link') || outerHTML.includes('ad-post') || outerHTML.includes('advertisement')) {
      return true;
    }
    if (hasPromotedLabel(el) || hasPromotedLabel(el.shadowRoot)) {
      return true;
    }
    return false;
  }

  function getPostContainer(el) {
    const article = el.closest('article[data-post-id]') || el.closest('article') || el.closest('div[id^="t3_"]');
    if (article) return article;

    let current = el;
    let hops = 0;
    while (
      current.parentElement &&
      current.parentElement !== document.body &&
      !current.parentElement.matches('shreddit-feed, main, section, [role="main"]') &&
      current.parentElement.children.length === 1 &&
      hops < 8
    ) {
      current = current.parentElement;
      hops++;
    }
    return current;
  }

  function isLikelyDivider(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches('shreddit-post, shreddit-ad-post, article')) return false;
    if (
      el.querySelector(
        'shreddit-post, shreddit-ad-post, article, a, button, img, video, iframe, svg, input, select, textarea'
      )
    ) {
      return false;
    }
    return (el.textContent || '').trim().length === 0;
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
    const targets = document.querySelectorAll(FEED_TARGET_SELECTOR);
    const toHide = new Set();

    targets.forEach((el) => {
      const shouldHide =
        (settings.hideVideoPosts && isVideoPost(el)) ||
        (settings.hidePromotedPosts && isPromotedPost(el));
      if (!shouldHide) return;
      const container = getPostContainer(el);
      toHide.add(container);
      getDividerSiblings(container).forEach((sib) => toHide.add(sib));
    });

    document.querySelectorAll(`[${HIDE_MARK_ATTR}]`).forEach((el) => {
      if (!toHide.has(el)) {
        el.style.display = '';
        el.removeAttribute(HIDE_MARK_ATTR);
      }
    });

    toHide.forEach((el) => {
      if (el.style.display !== 'none') el.style.display = 'none';
      el.setAttribute(HIDE_MARK_ATTR, '1');
    });
  }

  let domPassScheduled = false;
  function scheduleDomPass() {
    if (domPassScheduled) return;
    domPassScheduled = true;
    requestAnimationFrame(() => {
      domPassScheduled = false;
      updateAllShadowStyles();
      applyFeedFilters();
    });
  }

  const feedObserver = new MutationObserver(scheduleDomPass);
  function startFeedObserver() {
    if (document.body) {
      feedObserver.observe(document.body, { childList: true, subtree: true });
      window.__redditProFeedObserver = feedObserver;
    }
  }

  /* ====================
     Create UI Elements
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
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      minWidth: `${MIN.toggleBtnWidth}px`,
      minHeight: `${MIN.toggleBtnHeight}px`,
      fontWeight: '600',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      backgroundColor: '#ff4500',
      color: '#fff',
      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: `0 ${MIN.padding}px`,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: '1',
      boxSizing: 'border-box'
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
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      minWidth: '36px',
      minHeight: '28px',
      padding: '6px 10px',
      fontSize: '13px',
      fontWeight: '600',
      borderRadius: '8px',
      border: 'none',
      backgroundColor: '#ff4500',
      color: '#fff',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      lineHeight: '1',
      boxSizing: 'border-box'
    });
    miniBtn.addEventListener('click', () => toggleSettingsPanel(true));
    return miniBtn;
  }

  function createSettingsPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '56px',
      right: '10px',
      width: '320px',
      maxWidth: 'calc(100% - 20px)',
      maxHeight: '80vh',
      overflowY: 'auto',
      background: '#1a1a1b',
      borderRadius: '10px',
      border: '1px solid #343536',
      padding: '14px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      color: '#d7dadc',
      display: 'none',
      boxSizing: 'border-box',
      userSelect: 'none'
    });
    panel.innerHTML = `
      <div style="font-weight:700; font-size:15px; margin-bottom:10px; color:#fff; display:flex; align-items:baseline; justify-content:space-between;">
        <span>⚙ Reddit Pro Settings</span>
        <span style="font-size:11px; color:#818384; font-weight:400;">v2.4</span>
      </div>

      <label style="display:block; margin-bottom:10px; font-size:13px;">Font size: <span id="rp_fontSize_val" style="color:#ff4500; font-weight:600;">${settings.fontSize}px</span><input id="rp_fontSize" type="range" min="${MIN.fontSize}" max="22" value="${settings.fontSize}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Vote button size: <span id="rp_voteBtnSize_val" style="color:#ff4500; font-weight:600;">${settings.voteBtnSize}px</span><input id="rp_voteBtnSize" type="range" min="${MIN.voteBtnSize}" max="48" value="${settings.voteBtnSize}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Username font size: <span id="rp_userNameFontSize_val" style="color:#ff4500; font-weight:600;">${settings.userNameFontSize}px</span><input id="rp_userNameFontSize" type="range" min="${MIN.userNameFontSize}" max="24" value="${settings.userNameFontSize}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Button width: <span id="rp_toggleBtnWidth_val" style="color:#ff4500; font-weight:600;">${settings.toggleBtnWidth}px</span><input id="rp_toggleBtnWidth" type="range" min="${MIN.toggleBtnWidth}" max="300" value="${settings.toggleBtnWidth}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Button height: <span id="rp_toggleBtnHeight_val" style="color:#ff4500; font-weight:600;">${settings.toggleBtnHeight}px</span><input id="rp_toggleBtnHeight" type="range" min="${MIN.toggleBtnHeight}" max="120" value="${settings.toggleBtnHeight}" style="width:100%; accent-color:#ff4500;"></label>
      <label style="display:block; margin-bottom:10px; font-size:13px;">Button text size: <span id="rp_toggleBtnFontSize_val" style="color:#ff4500; font-weight:600;">${settings.toggleBtnFontSize}px</span><input id="rp_toggleBtnFontSize" type="range" min="${MIN.toggleBtnFontSize}" max="30" value="${settings.toggleBtnFontSize}" style="width:100%; accent-color:#ff4500;"></label>

      <label style="display:block; margin-bottom:10px; font-size:13px;">
        Font family:
        <select id="rp_fontFamily" style="width:100%; margin-top:6px; padding:6px; font-size:13px; background:#272729; color:#d7dadc; border:1px solid #343536; border-radius:6px;">
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
          <option value='"Source Sans 3", "Source Sans Pro", sans-serif'>Source Sans Pro</option>
          <option value='"Ubuntu", sans-serif'>Ubuntu</option>
          <option value='"Noto Sans", sans-serif'>Noto Sans</option>
          <option value='"Lato", sans-serif'>Lato</option>
          <option value='"Perplexity", sans-serif'>Perplexity (approx)</option>
        </select>
      </label>

      <div style="border-top:1px solid #343536; margin:12px 0;"></div>

      <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#fff;">Feed Filters</div>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:13px;"><input id="rp_hideVideoPosts" type="checkbox" style="accent-color:#ff4500;" ${settings.hideVideoPosts ? 'checked' : ''}><span>Hide posts with videos</span></label>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:13px;"><input id="rp_hidePromotedPosts" type="checkbox" style="accent-color:#ff4500;" ${settings.hidePromotedPosts ? 'checked' : ''}><span>Hide ads and sponsored posts</span></label>

      <div style="border-top:1px solid #343536; margin:12px 0;"></div>

      <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input id="rp_hideToggleBtn" type="checkbox" style="accent-color:#ff4500;" ${settings.toggleBtnHidden ? 'checked' : ''}><span>Hide the Reddit Pro button</span></label>

      <div style="display:flex; gap:8px; margin-top:14px;">
        <button id="rp_close" type="button" style="flex:1; padding:8px; font-weight:600; background:#ff4500; color:#fff; border:none; border-radius:6px; cursor:pointer;">Close</button>
        <button id="rp_reset" type="button" style="flex:1; padding:8px; background:#272729; color:#d7dadc; border:1px solid #343536; border-radius:6px; cursor:pointer;">Reset</button>
      </div>
    `;
    return panel;
  }

  function syncSettingsUI() {
    if (!settingsPanel) return;
    const sliders = [
      ['fontSize', 'px'],
      ['voteBtnSize', 'px'],
      ['userNameFontSize', 'px'],
      ['toggleBtnWidth', 'px'],
      ['toggleBtnHeight', 'px'],
      ['toggleBtnFontSize', 'px']
    ];
    sliders.forEach(([key, suffix]) => {
      const input = settingsPanel.querySelector(`#rp_${key}`);
      const val = settingsPanel.querySelector(`#rp_${key}_val`);
      if (input) input.value = settings[key];
      if (val) val.textContent = `${settings[key]}${suffix}`;
    });

    const fontFamilySelect = settingsPanel.querySelector('#rp_fontFamily');
    if (fontFamilySelect) {
      fontFamilySelect.value = settings.fontFamily;
      if (!fontFamilySelect.value) {
        fontFamilySelect.value = DEFAULTS.fontFamily;
      }
    }

    const hideVideoCb = settingsPanel.querySelector('#rp_hideVideoPosts');
    const hidePromotedCb = settingsPanel.querySelector('#rp_hidePromotedPosts');
    const hideBtnCb = settingsPanel.querySelector('#rp_hideToggleBtn');
    if (hideVideoCb) hideVideoCb.checked = settings.hideVideoPosts;
    if (hidePromotedCb) hidePromotedCb.checked = settings.hidePromotedPosts;
    if (hideBtnCb) hideBtnCb.checked = settings.toggleBtnHidden;
  }

  function updateButtonVisibility() {
    if (!toggleBtn || !miniBtn) return;
    const panelOpen = settingsPanel && settingsPanel.style.display !== 'none';
    toggleBtn.style.display = settings.toggleBtnHidden ? 'none' : 'inline-flex';
    miniBtn.style.display = settings.toggleBtnHidden && !panelOpen ? 'inline-flex' : 'none';
  }

  function updateToggleButtonDimensions() {
    if (!toggleBtn || !miniBtn) return;
    const text = toggleBtn.textContent || 'Reddit Pro';
    const measuredTextWidth = measureTextWidth(text, settings.toggleBtnFontSize, settings.fontFamily, '600');
    const minRequiredWidth = Math.ceil(measuredTextWidth + MIN.padding * 2);

    if (settings.toggleBtnWidth < minRequiredWidth) {
      save('toggleBtnWidth', minRequiredWidth);
      const wVal = document.getElementById('rp_toggleBtnWidth_val');
      const wSlider = document.getElementById('rp_toggleBtnWidth');
      if (wVal) wVal.textContent = `${settings.toggleBtnWidth}px`;
      if (wSlider) wSlider.value = settings.toggleBtnWidth;
    }

    toggleBtn.style.width = `${settings.toggleBtnWidth}px`;
    toggleBtn.style.height = `${settings.toggleBtnHeight}px`;
    toggleBtn.style.fontSize = `${settings.toggleBtnFontSize}px`;
    toggleBtn.style.fontFamily = settings.fontFamily;
    miniBtn.style.fontFamily = settings.fontFamily;
  }

  function toggleSettingsPanel(show) {
    if (!settingsPanel) return;
    if (show) syncSettingsUI();
    settingsPanel.style.display = show ? 'block' : 'none';
    updateButtonVisibility();
  }

  function wireSettingsEvents() {
    if (!settingsPanel) return;

    const controls = {
      fontSize: { slider: '#rp_fontSize', val: '#rp_fontSize_val', key: 'fontSize', min: MIN.fontSize, suffix: 'px', callback: updateSiteStyles },
      voteBtnSize: { slider: '#rp_voteBtnSize', val: '#rp_voteBtnSize_val', key: 'voteBtnSize', min: MIN.voteBtnSize, suffix: 'px', callback: updateSiteStyles },
      userNameFontSize: { slider: '#rp_userNameFontSize', val: '#rp_userNameFontSize_val', key: 'userNameFontSize', min: MIN.userNameFontSize, suffix: 'px', callback: updateSiteStyles },
      toggleBtnWidth: { slider: '#rp_toggleBtnWidth', val: '#rp_toggleBtnWidth_val', key: 'toggleBtnWidth', min: MIN.toggleBtnWidth, suffix: 'px', callback: updateToggleButtonDimensions },
      toggleBtnHeight: { slider: '#rp_toggleBtnHeight', val: '#rp_toggleBtnHeight_val', key: 'toggleBtnHeight', min: MIN.toggleBtnHeight, suffix: 'px', callback: updateToggleButtonDimensions },
      toggleBtnFontSize: { slider: '#rp_toggleBtnFontSize', val: '#rp_toggleBtnFontSize_val', key: 'toggleBtnFontSize', min: MIN.toggleBtnFontSize, suffix: 'px', callback: updateToggleButtonDimensions }
    };

    Object.values(controls).forEach((c) => {
      const slider = settingsPanel.querySelector(c.slider);
      const valEl = settingsPanel.querySelector(c.val);
      slider &&
        slider.addEventListener('input', (e) => {
          const value = Math.max(c.min, parseInt(e.target.value, 10));
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

    syncSettingsUI();

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
      updateSiteStyles();
      applyFeedFilters();
    });

    closeBtn.addEventListener('click', () => toggleSettingsPanel(false));
    resetBtn.addEventListener('click', () => {
      if (!confirm('Are you sure you want to reset all settings to default?')) return;
      Object.keys(DEFAULTS).forEach((key) => save(key, DEFAULTS[key]));
      syncSettingsUI();
      updateSiteStyles();
      updateToggleButtonDimensions();
      updateButtonVisibility();
      applyFeedFilters();
    });
  }

  function registerMenuCommands() {
    try {
      GM_registerMenuCommand('Show/Hide Reddit Pro Button', () => {
        save('toggleBtnHidden', !settings.toggleBtnHidden);
        syncSettingsUI();
        updateButtonVisibility();
        if (settingsPanel && settingsPanel.style.display !== 'none') {
          toggleSettingsPanel(false);
        }
      });
      GM_registerMenuCommand('Open Reddit Pro Settings', () => {
        toggleSettingsPanel(true);
      });
      GM_registerMenuCommand('Toggle Hide Video Posts', () => {
        save('hideVideoPosts', !settings.hideVideoPosts);
        syncSettingsUI();
        applyFeedFilters();
      });
      GM_registerMenuCommand('Toggle Hide Ads & Sponsored Posts', () => {
        save('hidePromotedPosts', !settings.hidePromotedPosts);
        syncSettingsUI();
        updateSiteStyles();
        applyFeedFilters();
      });
    } catch (err) {
      console.warn('GM_registerMenuCommand not available:', err);
    }
  }

  onBodyReady(() => {
    document.getElementById(BUTTON_ID)?.remove();
    document.getElementById(MINI_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();

    if (window.__redditProFeedObserver) window.__redditProFeedObserver.disconnect();
    if (window.__redditProSafetyInterval) clearInterval(window.__redditProSafetyInterval);
    if (window.__redditProSlowInterval) clearInterval(window.__redditProSlowInterval);

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

    let safetyChecks = 0;
    window.__redditProSafetyInterval = setInterval(() => {
      updateSiteStyles();
      updateButtonVisibility();
      applyFeedFilters();
      safetyChecks++;
      if (safetyChecks > 30) {
        clearInterval(window.__redditProSafetyInterval);
        window.__redditProSlowInterval = setInterval(() => {
          updateSiteStyles();
          updateButtonVisibility();
          applyFeedFilters();
        }, 2000);
      }
    }, 500);
  });
})();
