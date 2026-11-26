(() => {
  'use strict';

  if (window !== window.top) return;

  /* =========================================================================
   * UNIVERSAL STORAGE & NETWORK BRIDGE
   * ========================================================================= */
  const Store = {
    get(key, def) {
      try {
        if (typeof hcj !== 'undefined' && hcj.config && typeof hcj.config.get === 'function') {
          const val = hcj.config.get(key, undefined);
          if (val !== undefined) return val;
        }
        if (typeof GM_getValue === 'function') {
          const val = GM_getValue(key, undefined);
          if (val !== undefined) return val;
        }
        const raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : def;
      } catch (_) { return def; }
    },
    set(key, val) {
      try {
        if (typeof hcj !== 'undefined' && hcj.config && typeof hcj.config.set === 'function') hcj.config.set(key, val);
        if (typeof GM_setValue === 'function') GM_setValue(key, val);
        localStorage.setItem(key, JSON.stringify(val));
      } catch (_) {}
    },
    remove(key) {
      try {
        if (typeof hcj !== 'undefined' && hcj.config && typeof hcj.config.remove === 'function') hcj.config.remove(key);
        if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
        localStorage.removeItem(key);
      } catch (_) {}
    }
  };

  async function requestNetwork(url) {
    if (typeof hcj !== 'undefined' && typeof hcj.fetch === 'function') {
      try {
        const res = await hcj.fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res && typeof res.json === 'function') return await res.json();
        if (res && res.data) return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        return res;
      } catch (_) {}
    }
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'GET', url: url, headers: { 'Accept': 'application/json' }, timeout: 7000,
          onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch (_) { resolve(null); } },
          onerror: () => resolve(null), ontimeout: () => resolve(null)
        });
      });
    }
    try {
      const res = await window.fetch(url);
      if (res.ok) return await res.json();
    } catch (_) {}
    return null;
  }

  /* =========================================================================
   * MODULE 1: Android Hardware & Gesture Back Navigation Fix
   * ========================================================================= */
  (() => {
    let inPostView = false;
    let lastTimelineUrl = '/home';

    function isPostUrl(url) {
      return /\/[^/]+\/status\/\d+/.test(url || window.location.pathname);
    }

    function syncRoute() {
      const p = window.location.pathname;
      if (isPostUrl(p)) {
        if (!inPostView) {
          inPostView = true;
          try { history.pushState({ xAppPostThread: true }, '', window.location.href); } catch (_) {}
        }
      } else {
        inPostView = false;
        lastTimelineUrl = p;
      }
    }

    const _push = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState = function (...args) { _push(...args); syncRoute(); };
    history.replaceState = function (...args) { _replace(...args); syncRoute(); };

    function goBackToFeed() {
      const nativeBack = document.querySelector('[data-testid="app-bar-back"]') ||
                         document.querySelector('button[aria-label="Back"]') ||
                         document.querySelector('[data-testid="TopNavBar"] button[role="button"]');
      if (nativeBack) {
        nativeBack.click();
        return;
      }
      const homeTab = document.querySelector('[data-testid="AppTabBar_Home_Link"]') ||
                      document.querySelector('a[href="/home"]');
      if (homeTab) {
        homeTab.click();
        return;
      }
      window.location.pathname = lastTimelineUrl || '/home';
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'GoBack' || e.keyCode === 4 || e.key === 'Escape') {
        if (isPostUrl()) {
          e.preventDefault();
          e.stopPropagation();
          goBackToFeed();
        }
      }
    }, true);

    window.addEventListener('popstate', () => {
      if (inPostView || isPostUrl()) {
        inPostView = false;
        goBackToFeed();
      }
    });

    syncRoute();
  })();

  /* =========================================================================
   * MODULE 2: X Compact Bottom Bar
   * ========================================================================= */
  (() => {
    const NAV_HEIGHT = 48;
    const style = document.createElement('style');
    style.id = 'x-compact-bar-style';
    style.textContent = `
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
    `;
    (document.head || document.documentElement).appendChild(style);

    function lockBar() {
      const links = document.querySelectorAll('[data-testid^="AppTabBar_"], a[href="/home"], a[href="/explore"]');
      for (const link of links) {
        const r = link.getBoundingClientRect();
        if (r.height > 0 && (r.top + r.height / 2) > (window.innerHeight * 0.5)) {
          let fixed = null;
          for (let n = link.parentElement; n && n !== document.body; n = n.parentElement) {
            const pos = getComputedStyle(n).position;
            if (pos === 'fixed' || pos === 'sticky') { fixed = n; break; }
          }
          if (!fixed) continue;
          for (let n = link.parentElement; n; n = n.parentElement) {
            n.setAttribute('data-xcb-bar', '');
            if (n === fixed) break;
          }
          fixed.setAttribute('data-xcb-fixed', '');
          fixed.querySelectorAll('a').forEach(a => a.setAttribute('data-xcb-link', ''));
          if (fixed.style.transform && fixed.style.transform !== 'none') fixed.style.transform = 'none';
          if (fixed.style.bottom && fixed.style.bottom !== '0px') fixed.style.bottom = '0px';
          return;
        }
      }
    }
    new MutationObserver(lockBar).observe(document.documentElement, { childList: true, subtree: true });
    lockBar();
  })();

  /* =========================================================================
   * MODULE 3: Hide Boosted Posts & Videos Engine
   * ========================================================================= */
  (() => {
    const style = document.createElement('style');
    style.id = 'x-hide-boosted-style';
    style.textContent = `
      [data-xbh-hidden] { display: none !important; }
      [data-xbh-video] { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);

    const labels = new Set(['boosted', 'promoted', 'ad']);

    function scanTimeline() {
      const hideVideosEnabled = Store.get('xpro_v4', null)?.opt?.hideVideos || false;

      document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
        // Boosted & ads check
        if (!article.closest('[data-xbh-hidden]')) {
          let isAd = false;
          const ctx = article.querySelector('[data-testid="socialContext"]');
          if (ctx && labels.has((ctx.textContent || '').trim().toLowerCase())) isAd = true;
          if (!isAd) {
            for (const sp of article.querySelectorAll('span')) {
              if (!sp.children.length && labels.has((sp.textContent || '').trim().toLowerCase())) {
                if (!sp.closest('[data-testid="tweetText"]')) { isAd = true; break; }
              }
            }
          }
          if (isAd) {
            const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
            cell.setAttribute('data-xbh-hidden', '');
          }
        }

        // Hide videos check
        if (hideVideosEnabled && !article.closest('[data-xbh-video]')) {
          const hasVideo = article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [aria-label*="video" i]');
          if (hasVideo) {
            const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
            cell.setAttribute('data-xbh-video', '');
          }
        }
      });
    }

    new MutationObserver(scanTimeline).observe(document.documentElement, { childList: true, subtree: true });
    scanTimeline();
  })();

  /* =========================================================================
   * MODULE 4: 𝕏 Pro — Full UI Control v4.0 (with Resizing & Hide Videos)
   * ========================================================================= */
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
      { label: 'Noto Sans',              value: '"Noto Sans", sans-serif' },
    ];

    const SLOTS = {
      body: {
        label:       'Tweet body text',
        selectors:   ['[data-testid="tweetText"]', '[data-testid="tweetText"] span', '[data-testid="tweetText"] a'],
        defaultFont: FONTS[0].value, defaultSize: 15, minSize: 8, maxSize: 24,
      },
      name: {
        label:       'Display name',
        selectors:   ['[data-testid="User-Name"] a[role="link"] span span', '[data-testid="User-Name"] a[role="link"] > span', '[data-testid="UserName"] span span', '[data-testid="UserName"] > div > span', '[data-testid="tweet"] [data-testid="User-Name"] a span'],
        defaultFont: FONTS[0].value, defaultSize: 15, minSize: 8, maxSize: 22,
      },
      handle: {
        label:       'Handle & timestamp',
        selectors:   ['[data-testid="User-Name"] a[href*="/"]', '[data-testid="User-Name"] time', 'time[datetime]', '[data-testid="tweet"] a[href*="/status/"] time'],
        defaultFont: FONTS[4].value, defaultSize: 13, minSize: 8, maxSize: 18,
      },
      ui: {
        label:       'Nav & UI labels',
        selectors:   ['[data-testid="AppTabBar_Home_Link"] span', '[data-testid="AppTabBar_Explore_Link"] span', '[data-testid="AppTabBar_Notifications_Link"] span', '[data-testid="AppTabBar_DirectMessage_Link"] span', 'nav[role="navigation"] span', '[data-testid="primaryColumn"] h2 span'],
        defaultFont: FONTS[4].value, defaultSize: 15, minSize: 8, maxSize: 20,
      },
    };

    const STORE_KEY = 'xpro_v4';
    function buildDefault() {
      return {
        body:   { font: SLOTS.body.defaultFont, size: SLOTS.body.defaultSize },
        name:   { font: SLOTS.name.defaultFont, size: SLOTS.name.defaultSize },
        handle: { font: SLOTS.handle.defaultFont, size: SLOTS.handle.defaultSize },
        ui:     { font: SLOTS.ui.defaultFont, size: SLOTS.ui.defaultSize },
        extra:  { lineHeight: 1.4, letterSpacing: 0, italic: false },
        uiSizes: { actionBarSize: 20, actionBtnSize: 20, playBtnSize: 60, mainBtnSize: 44, toggleBtnHidden: false },
        opt:    { hideAds: true, hideWhoToFollow: true, hideTrending: true, compactLayout: false, autoExpand: true, optimizeScrolling: true, hideVideos: false },
        layout: { feedOffset: 0, hideSidebar: false, feedDisabled: false }
      };
    }

    let cfg = buildDefault();
    try {
      const saved = Store.get(STORE_KEY, null);
      if (saved) {
        cfg = {
          ...cfg, ...saved,
          extra:   { ...cfg.extra, ...(saved.extra || {}) },
          uiSizes: { ...cfg.uiSizes, ...(saved.uiSizes || saved.ui || {}) },
          opt:     { ...cfg.opt, ...(saved.opt || {}) },
          layout:  { ...cfg.layout, ...(saved.layout || {}) }
        };
      }
    } catch (_) {}

    function saveSettings() { Store.set(STORE_KEY, cfg); }

    function injectFonts() {
      if (document.getElementById('xpro-fonts')) return;
      const link = document.createElement('link');
      link.id = 'xpro-fonts'; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Great+Vibes&family=Inter:wght@400;500;600&family=Josefin+Sans:wght@400;600;700&family=Courier+Prime:ital@0;1&display=swap';
      (document.head || document.documentElement).appendChild(link);
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

    function applyStyles() {
      let el = document.getElementById('xpro-v4-styles');
      if (!el) { el = document.createElement('style'); el.id = 'xpro-v4-styles'; (document.head || document.documentElement).appendChild(el); }
      el.textContent = buildCSS();
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
      if (t) { t.style.removeProperty('transform'); t.style.removeProperty('transition'); }
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
      if (val) val.textContent = v + 'px';
      if (sldr) sldr.value = v;
    }

    function fontOptions(selected) {
      return FONTS.map(f => `<option value="${f.value.replace(/"/g, '&quot;')}"${f.value === selected ? ' selected' : ''}>${f.label}</option>`).join('');
    }

    function buildPanel() {
      if (document.getElementById('xpro-panel')) return;
      injectFonts();

      const panel = document.createElement('div');
      panel.id = 'xpro-panel';
      Object.assign(panel.style, {
        position: 'fixed', bottom: '72px', right: '14px', width: '315px', maxWidth: 'calc(100vw - 24px)',
        background: '#0a1520', border: '1px solid #1e2d3d', borderRadius: '12px', padding: '0',
        boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 0 0.5px rgba(255,255,255,0.06)',
        display: 'none', overflow: 'hidden', zIndex: '2147483646', color: '#e7e9ea',
        fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: '12px'
      });

      let typoHTML = '';
      for (const [key, slot] of Object.entries(SLOTS)) {
        const s = cfg[key];
        typoHTML += `
          <div style="padding:8px 12px; border-bottom:1px solid #1a2535;">
            <div style="font-size:9px; font-weight:700; color:#3d5060; text-transform:uppercase; letter-spacing:.1em; margin-bottom:6px;">${slot.label}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="color:#8b98a5;">Font</span>
              <select data-slot="${key}" data-prop="font" style="font-size:11px; padding:3px 5px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#c8d3da; max-width:160px; outline:none;">${fontOptions(s.font)}</select>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:#8b98a5; width:35px;">Size</span>
              <input type="range" data-slot="${key}" data-prop="size" min="${slot.minSize}" max="${slot.maxSize}" step="1" value="${s.size}" style="flex:1; accent-color:#e7e9ea; height:3px;">
              <span data-out="${key}-size" style="color:#536471; font-size:10px; width:30px; text-align:right;">${s.size}px</span>
            </div>
          </div>`;
      }
      const ex = cfg.extra;
      typoHTML += `
        <div style="padding:8px 12px;">
          <div style="font-size:9px; font-weight:700; color:#3d5060; text-transform:uppercase; letter-spacing:.1em; margin-bottom:6px;">Body Extras</div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="color:#8b98a5; width:70px;">Line Height</span>
            <input type="range" data-extra="lineHeight" min="10" max="22" step="1" value="${Math.round(ex.lineHeight * 10)}" style="flex:1; accent-color:#e7e9ea; height:3px;">
            <span data-out="extra-lineHeight" style="color:#536471; font-size:10px; width:30px; text-align:right;">${ex.lineHeight.toFixed(1)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="color:#8b98a5; width:70px;">Tracking</span>
            <input type="range" data-extra="letterSpacing" min="-5" max="10" step="1" value="${ex.letterSpacing}" style="flex:1; accent-color:#e7e9ea; height:3px;">
            <span data-out="extra-letterSpacing" style="color:#536471; font-size:10px; width:30px; text-align:right;">${ex.letterSpacing}px</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#8b98a5;">Italic Body</span>
            <input type="checkbox" data-extra="italic" ${ex.italic ? 'checked' : ''}>
          </div>
        </div>`;

      const u = cfg.uiSizes;
      const uiHTML = `
        <div style="padding:10px 12px; border-bottom:1px solid #1a2535;">
          <div style="font-size:9px; font-weight:700; color:#3d5060; text-transform:uppercase; letter-spacing:.1em; margin-bottom:8px;">Action Bar & Media</div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="color:#8b98a5; width:80px;">Bar Size</span>
            <input type="range" data-ui="actionBarSize" min="8" max="48" step="1" value="${u.actionBarSize}" style="flex:1; accent-color:#e7e9ea; height:3px;">
            <span data-out="ui-actionBarSize" style="color:#536471; font-size:10px; width:30px; text-align:right;">${u.actionBarSize}px</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="color:#8b98a5; width:80px;">Icon Size</span>
            <input type="range" data-ui="actionBtnSize" min="8" max="48" step="1" value="${u.actionBtnSize}" style="flex:1; accent-color:#e7e9ea; height:3px;">
            <span data-out="ui-actionBtnSize" style="color:#536471; font-size:10px; width:30px; text-align:right;">${u.actionBtnSize}px</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="color:#8b98a5; width:80px;">Play Btn</span>
            <input type="range" data-ui="playBtnSize" min="10" max="120" step="1" value="${u.playBtnSize}" style="flex:1; accent-color:#e7e9ea; height:3px;">
            <span data-out="ui-playBtnSize" style="color:#536471; font-size:10px; width:30px; text-align:right;">${u.playBtnSize}px</span>
          </div>
          <div style="border-top:1px solid #1a2535; margin:8px 0;"></div>
          <div style="font-size:9px; font-weight:700; color:#3d5060; text-transform:uppercase; letter-spacing:.1em; margin-bottom:8px;">Floating Buttons Scale</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:#8b98a5; width:80px;">Buttons Size</span>
            <input type="range" id="xp-main-btn-size" min="30" max="64" step="1" value="${u.mainBtnSize || 44}" style="flex:1; accent-color:#e7e9ea; height:3px;">
            <span id="xp-main-btn-val" style="color:#536471; font-size:10px; width:30px; text-align:right;">${u.mainBtnSize || 44}px</span>
          </div>
        </div>`;

      const lo = cfg.layout;
      const layoutHTML = `
        <div style="padding:10px 12px;">
          <div style="font-size:9px; font-weight:700; color:#3d5060; text-transform:uppercase; letter-spacing:.1em; margin-bottom:6px;">Feed Position</div>
          <div id="xp-feed-display" style="text-align:center; font-size:20px; font-weight:300; color:#e7e9ea; padding:2px 0 6px;">${lo.feedOffset > 0 ? '+' : ''}${lo.feedOffset} px</div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <input type="range" id="xp-feed-slider" min="-${FEED_MAX}" max="${FEED_MAX}" step="1" value="${lo.feedOffset}" style="flex:1; accent-color:#e7e9ea; height:3px;">
            <span id="xp-feed-val" style="color:#536471; font-size:10px; width:34px; text-align:right;">${lo.feedOffset}px</span>
          </div>
          <div style="display:gap; gap:6px; margin-bottom:8px;">
            <div style="display:flex; gap:6px; width:100%;">
              <button id="xp-feed-left" style="flex:1; padding:5px 2px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#8b98a5; font-size:11px; cursor:pointer;">◀ Left</button>
              <button id="xp-feed-reset" style="flex:1; padding:5px 2px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#8b98a5; font-size:11px; cursor:pointer;">↺ Reset</button>
              <button id="xp-feed-right" style="flex:1; padding:5px 2px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#8b98a5; font-size:11px; cursor:pointer;">Right ▶</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:10px;">
            <button id="xp-feed-center" style="padding:5px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#8b98a5; font-size:10px; cursor:pointer;">⊙ Auto Center</button>
            <button id="xp-feed-pleft" style="padding:5px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#8b98a5; font-size:10px; cursor:pointer;">◁ Left Edge</button>
            <button id="xp-feed-pdefault" style="padding:5px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#8b98a5; font-size:10px; cursor:pointer;">○ Default</button>
            <button id="xp-feed-pright" style="padding:5px; border-radius:5px; border:1px solid #1e2d3d; background:#0d1b26; color:#8b98a5; font-size:10px; cursor:pointer;">▷ Right Edge</button>
          </div>
          <div style="border-top:1px solid #1a2535; padding-top:8px;">
            <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; cursor:pointer;">
              <span style="color:#8b98a5;">Disable Repositioner</span>
              <input type="checkbox" id="xp-feed-disabled" ${lo.feedDisabled ? 'checked' : ''}>
            </label>
            <label style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
              <span style="color:#8b98a5;">Hide Left Sidebar</span>
              <input type="checkbox" id="xp-hide-sidebar" ${lo.hideSidebar ? 'checked' : ''}>
            </label>
          </div>
        </div>`;

      const o = cfg.opt;
      function optItem(id, label, checked) {
        return `<label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7px; cursor:pointer;"><span style="color:#8b98a5;">${label}</span><input type="checkbox" data-opt="${id}" ${checked ? 'checked' : ''}></label>`;
      }
      const optHTML = `
        <div style="padding:10px 12px;">
          ${optItem('hideAds',           'Block ads & promoted',           o.hideAds)}
          ${optItem('hideVideos',        'Hide posts with videos',         o.hideVideos)}
          ${optItem('hideWhoToFollow',   'Hide "Who to follow"',           o.hideWhoToFollow)}
          ${optItem('hideTrending',      'Hide trending section',          o.hideTrending)}
          ${optItem('compactLayout',     'Compact tweet layout',           o.compactLayout)}
          ${optItem('autoExpand',        'Auto-expand "Show more"',        o.autoExpand)}
          ${optItem('optimizeScrolling', 'Hardware-accelerated scroll',     o.optimizeScrolling)}
        </div>`;

      panel.innerHTML = `
        <div style="padding:10px 14px; border-bottom:1px solid #1e2d3d; display:flex; justify-content:space-between; align-items:center; background:#0d1b26;">
          <strong style="font-size:13px; letter-spacing:.3px; color:#e7e9ea;">𝕏 Pro Control</strong>
          <span id="xp-close-btn" style="cursor:pointer; color:#6e7c87; font-size:16px; padding:0 4px;">✕</span>
        </div>
        <div style="display:flex; border-bottom:1px solid #1e2d3d; background:#0d1b26;">
          <button class="xp-tab" data-tab="typo" style="flex:1; padding:7px 0; background:none; border:none; color:#e7e9ea; font-size:10px; font-weight:700; text-transform:uppercase; cursor:pointer; border-bottom:2px solid #e7e9ea;">Type</button>
          <button class="xp-tab" data-tab="ui" style="flex:1; padding:7px 0; background:none; border:none; color:#536471; font-size:10px; font-weight:700; text-transform:uppercase; cursor:pointer; border-bottom:2px solid transparent;">UI</button>
          <button class="xp-tab" data-tab="layout" style="flex:1; padding:7px 0; background:none; border:none; color:#536471; font-size:10px; font-weight:700; text-transform:uppercase; cursor:pointer; border-bottom:2px solid transparent;">Layout</button>
          <button class="xp-tab" data-tab="opt" style="flex:1; padding:7px 0; background:none; border:none; color:#536471; font-size:10px; font-weight:700; text-transform:uppercase; cursor:pointer; border-bottom:2px solid transparent;">Opt</button>
        </div>
        <div class="xp-view" id="xp-view-typo" style="display:block; overflow-y:auto; max-height:400px;">${typoHTML}</div>
        <div class="xp-view" id="xp-view-ui" style="display:none; overflow-y:auto; max-height:400px;">${uiHTML}</div>
        <div class="xp-view" id="xp-view-layout" style="display:none; overflow-y:auto; max-height:400px;">${layoutHTML}</div>
        <div class="xp-view" id="xp-view-opt" style="display:none; overflow-y:auto; max-height:400px;">${optHTML}</div>
        <div style="padding:8px 12px; border-top:1px solid #1e2d3d; display:flex; gap:8px; background:#0d1b26;">
          <button id="xp-reset-btn" style="flex:1; padding:6px; border-radius:5px; border:1px solid #2d1217; background:#1a0c0f; color:#f4212e; font-size:11px; cursor:pointer;">Reset All</button>
          <button id="xp-close-btn2" style="flex:1; padding:6px; border-radius:5px; border:1px solid #1e2d3d; background:#16222f; color:#e7e9ea; font-size:11px; cursor:pointer;">Close</button>
        </div>`;

      document.documentElement.appendChild(panel);

      const hide = () => { panel.style.display = 'none'; };
      panel.querySelector('#xp-close-btn').onclick = hide;
      panel.querySelector('#xp-close-btn2').onclick = hide;

      panel.querySelectorAll('.xp-tab').forEach(tab => {
        tab.onclick = () => {
          panel.querySelectorAll('.xp-tab').forEach(t => { t.style.color = '#536471'; t.style.borderBottomColor = 'transparent'; });
          panel.querySelectorAll('.xp-view').forEach(v => { v.style.display = 'none'; });
          tab.style.color = '#e7e9ea'; tab.style.borderBottomColor = '#e7e9ea';
          panel.querySelector(`#xp-view-${tab.dataset.tab}`).style.display = 'block';
        };
      });

      panel.querySelectorAll('select[data-slot]').forEach(sel => {
        sel.onchange = (e) => {
          cfg[e.target.dataset.slot].font = e.target.value;
          saveSettings(); applyStyles();
        };
      });

      panel.querySelectorAll('input[type=range][data-slot]').forEach(r => {
        r.oninput = (e) => {
          const v = +e.target.value;
          cfg[e.target.dataset.slot].size = v;
          panel.querySelector(`[data-out="${e.target.dataset.slot}-size"]`).textContent = v + 'px';
          saveSettings(); applyStyles();
        };
      });

      panel.querySelectorAll('input[type=range][data-extra]').forEach(r => {
        r.oninput = (e) => {
          const k = e.target.dataset.extra;
          const raw = +e.target.value;
          const v = k === 'lineHeight' ? raw / 10 : raw;
          cfg.extra[k] = v;
          panel.querySelector(`[data-out="extra-${k}"]`).textContent = k === 'lineHeight' ? v.toFixed(1) : v + 'px';
          saveSettings(); applyStyles();
        };
      });

      panel.querySelectorAll('input[type=checkbox][data-extra]').forEach(c => {
        c.onchange = (e) => { cfg.extra[e.target.dataset.extra] = e.target.checked; saveSettings(); applyStyles(); };
      });

      panel.querySelectorAll('input[type=range][data-ui]').forEach(r => {
        r.oninput = (e) => {
          const v = +e.target.value;
          cfg.uiSizes[e.target.dataset.ui] = v;
          panel.querySelector(`[data-out="ui-${e.target.dataset.ui}"]`).textContent = v + 'px';
          saveSettings(); applyStyles();
        };
      });

      const btnSzSlider = panel.querySelector('#xp-main-btn-size');
      if (btnSzSlider) {
        btnSzSlider.oninput = (e) => {
          const sz = +e.target.value;
          cfg.uiSizes.mainBtnSize = sz;
          panel.querySelector('#xp-main-btn-val').textContent = sz + 'px';
          saveSettings();
          applyFloatingBtnScale(sz);
        };
      }

      panel.querySelectorAll('input[type=checkbox][data-opt]').forEach(c => {
        c.onchange = (e) => { cfg.opt[e.target.dataset.opt] = e.target.checked; saveSettings(); applyStyles(); };
      });

      const sldr = panel.querySelector('#xp-feed-slider');
      if (sldr) sldr.oninput = (e) => setFeedOffset(+e.target.value);
      panel.querySelector('#xp-feed-left').onclick = () => setFeedOffset(cfg.layout.feedOffset - FEED_STEP);
      panel.querySelector('#xp-feed-right').onclick = () => setFeedOffset(cfg.layout.feedOffset + FEED_STEP);
      panel.querySelector('#xp-feed-reset').onclick = () => setFeedOffset(0);
      panel.querySelector('#xp-feed-center').onclick = autoCenter;
      panel.querySelector('#xp-feed-pleft').onclick = () => setFeedOffset(-FEED_MAX);
      panel.querySelector('#xp-feed-pdefault').onclick = () => setFeedOffset(0);
      panel.querySelector('#xp-feed-pright').onclick = () => setFeedOffset(FEED_MAX);

      panel.querySelector('#xp-feed-disabled').onchange = (e) => {
        cfg.layout.feedDisabled = e.target.checked;
        if (e.target.checked) clearFeedOffset(); else applyFeedOffset(cfg.layout.feedOffset);
        saveSettings();
      };

      panel.querySelector('#xp-hide-sidebar').onchange = (e) => {
        cfg.layout.hideSidebar = e.target.checked; saveSettings(); applyStyles();
      };

      panel.querySelector('#xp-reset-btn').onclick = () => {
        if (!confirm('Reset all 𝕏 Pro settings to defaults?')) return;
        cfg = buildDefault(); saveSettings(); clearFeedOffset();
        panel.remove(); buildPanel(); applyStyles();
        applyFloatingBtnScale(44);
      };
    }

    function togglePanel() {
      buildPanel();
      const p = document.getElementById('xpro-panel');
      if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    }

    applyStyles();
    return { buildPanel, togglePanel, applyFeedOffset, cfg };
  })();

  /* =========================================================================
   * MODULE 5: 𝕏 Playlist v4.1.1 (Encoded with Your Following List)
   * ========================================================================= */
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
    const SK_AVATARS     = 'x_pp_avatars';
    const SK_TAB_MODE    = 'x_pp_tab_mode';
    const SK_ACTIVE_TAB  = 'x_pp_active_tab';
    const SK_AVATAR_ONLY = 'x_pp_avatar_only';
    const SK_LIST_VER    = 'x_pp_list_ver_v5';

    const X_BLUE     = '#1d9bf0';
    const SIDE_BG    = 'rgba(0, 0, 0, 0.95)';
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
      { label: 'Bodoni',         value: '"Bodoni MT", "Bodoni 72", serif' },
    ];
    const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20];

    let parsedGroups = [];
    let currentIndex = -1;
    let searchQuery  = '';
    let isSyncing    = false;
    let syncAborted  = false;

    const loadData       = ()  => Store.get(SK_DATA, null);
    const saveData       = (d) => Store.set(SK_DATA, d || []);
    const saveIdx        = (i) => { Store.set(SK_IDX, i); currentIndex = i; };
    const loadIdx        = ()  => +Store.get(SK_IDX, -1);
    const loadVis        = ()  => Store.get(SK_VIS, false);
    const saveVis        = (v) => Store.set(SK_VIS, !!v);
    const loadCols       = ()  => +Store.get(SK_COLS, 1);
    const saveCols       = (v) => Store.set(SK_COLS, v);
    const loadFSize      = ()  => +Store.get(SK_FSIZE, 13);
    const saveFSize      = (v) => Store.set(SK_FSIZE, v);
    const loadFFam       = ()  => Store.get(SK_FFAM, FONT_OPTIONS[0].value);
    const saveFFam       = (v) => Store.set(SK_FFAM, v);
    const loadTabMode    = ()  => Store.get(SK_TAB_MODE, false);
    const saveTabMode    = (v) => Store.set(SK_TAB_MODE, !!v);
    const loadActiveTab  = ()  => Store.get(SK_ACTIVE_TAB, 'ALL');
    const saveActiveTab  = (v) => Store.set(SK_ACTIVE_TAB, v);
    const loadAvatarOnly = ()  => Store.get(SK_AVATAR_ONLY, false);
    const saveAvatarOnly = (v) => Store.set(SK_AVATAR_ONLY, !!v);

    const defaultGeom = { left: '', top: '75px', right: '16px', width: '310px', height: '82vh' };
    const loadGeom  = ()  => Store.get(SK_GEOM, defaultGeom);
    const saveGeom  = (g) => Store.set(SK_GEOM, g);

    let avatarCache = Store.get(SK_AVATARS, {});
    if (typeof avatarCache !== 'object' || avatarCache === null) avatarCache = {};

    let avatarSaveTimer = null;
    function cacheAvatar(username, url) {
      if (!username || !url) return;
      const u = username.toLowerCase();
      if (avatarCache[u] === url) return;
      avatarCache[u] = url;
      broadcastAvatarUpdate(u, url);

      clearTimeout(avatarSaveTimer);
      avatarSaveTimer = setTimeout(() => {
        Store.set(SK_AVATARS, avatarCache);
        if (!isSyncing) updateSyncButtonLabel();
      }, 300);
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
      setTimeout(scrapeAvatarsFromDOM, 1500);
    }

    function scrapeAvatarsFromDOM() {
      const cur = getCurrentUsername();
      if (cur) {
        const img = document.querySelector('a[href$="/photo"] img[src*="profile_images"], [data-testid="primaryColumn"] img[src*="profile_images"]');
        if (img && img.src && !img.src.includes('default_profile')) {
          cacheAvatar(cur, img.src.replace('_normal.', '_bigger.'));
        }
      }
      document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
        const userLink = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
        const img = article.querySelector('img[src*="profile_images"]');
        if (userLink && img && img.src && !img.src.includes('default_profile')) {
          const u = extractUsername(userLink.getAttribute('href'));
          if (u) cacheAvatar(u, img.src.replace('_normal.', '_bigger.'));
        }
      });
    }

    function getAllItems() { return parsedGroups.flatMap(g => g.items); }

    function parsePlaylistText(text) {
      const lines = text.split(/\r?\n/);
      const groups = [];
      let curGroup = null, curSubheader = '';
      function getGroup(title) {
        let g = groups.find(x => x.title.toLowerCase() === title.toLowerCase());
        if (!g) { g = { id: 'grp_' + Math.random().toString(36).substr(2, 9), title: title, items: [] }; groups.push(g); }
        return g;
      }
      for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line || line === '---' || line.startsWith('--- START') || line.startsWith('--- END')) continue;
        if (line.startsWith('## ')) { curGroup = getGroup(line.replace(/^##\s+/, '').trim()); curSubheader = ''; }
        else if (line.startsWith('### ')) { curSubheader = line.replace(/^###\s+/, '').trim(); }
        else if (line.startsWith('# ')) { curGroup = getGroup(line.replace(/^#\s+/, '').trim()); curSubheader = ''; }
        else {
          if (!curGroup) curGroup = getGroup('General');
          const u = extractUsername(line);
          curGroup.items.push({ raw: line, handle: line.replace(/^[-*+]\s+/, '').trim(), username: u ? u.toLowerCase() : '', subheader: curSubheader });
        }
      }
      return groups.filter(g => g.items.length > 0);
    }

    async function fetchAvatarForUser(username) {
      const u = username.toLowerCase();
      // 1. Unavatar JSON resolution
      try {
        const res = await requestNetwork(`https://unavatar.io/x/${encodeURIComponent(u)}?json`);
        if (res && res.url && res.url.includes('pbs.twimg.com')) {
          return { url: res.url.replace('_normal.', '_bigger.') };
        }
      } catch (_) {}

      // 2. FixTweet API v2 profile endpoint
      try {
        const data = await requestNetwork(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(u)}`);
        const avatarUrl = data?.user?.avatar_url || data?.avatar_url;
        if (avatarUrl && avatarUrl.includes('pbs.twimg.com')) {
          return { url: avatarUrl.replace('_normal.', '_bigger.') };
        }
      } catch (_) {}

      // 3. Fallback direct unavatar
      return new Promise((resolve) => {
        const unavatar = `https://unavatar.io/x/${encodeURIComponent(u)}`;
        const testImg = new Image();
        testImg.onload = () => resolve({ url: unavatar });
        testImg.onerror = () => resolve({ notFound: true });
        testImg.src = unavatar;
      });
    }

    function broadcastAvatarUpdate(username, url) {
      const u = username.toLowerCase();
      document.querySelectorAll(`.x-pp-avatar-box[data-username="${u}"]`).forEach(box => {
        const img = box.querySelector('.x-pp-avatar-img');
        const ph = box.querySelector('.x-pp-avatar-placeholder');
        if (img && ph) {
          if (url && url !== 'NONE') {
            img.src = url; img.style.display = 'block'; ph.style.display = 'none';
          } else {
            img.style.display = 'none'; ph.style.display = 'flex';
          }
        }
      });
    }

    async function startAvatarBatchSync() {
      if (isSyncing) { syncAborted = true; return; }
      const items = getAllItems().map(it => it.username).filter(Boolean);
      if (!items.length) return;
      const missing = Array.from(new Set(items.filter(u => !avatarCache[u] || avatarCache[u] === 'NONE')));
      if (!missing.length) return;

      isSyncing = true; syncAborted = false;
      const queue = [...missing];
      const CONCURRENCY = 2; // Gentle throttle
      let completedCount = items.length - missing.length;
      const totalCount = items.length;

      updateSyncButtonLabel(completedCount, totalCount);

      async function worker() {
        while (queue.length > 0 && !syncAborted) {
          const u = queue.shift();
          if (!u) break;
          const res = await fetchAvatarForUser(u);
          if (res?.url) { cacheAvatar(u, res.url); }
          else { cacheAvatar(u, 'NONE'); }
          completedCount++;
          updateSyncButtonLabel(completedCount, totalCount);
          await new Promise(r => setTimeout(r, 120));
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      isSyncing = false; syncAborted = false; updateSyncButtonLabel();
    }

    function getAvatarStats() {
      const items = getAllItems().map(it => it.username).filter(Boolean);
      if (!items.length) return { cached: 0, total: 0 };
      const cached = items.filter(u => avatarCache[u] && avatarCache[u] !== 'NONE').length;
      return { cached, total: items.length };
    }

    function updateSyncButtonLabel(cur, tot) {
      const btn = document.getElementById('x-pp-sync-btn');
      if (!btn) return;
      const stats = getAvatarStats();
      if (isSyncing) {
        const c = cur !== undefined ? cur : stats.cached;
        const t = tot !== undefined ? tot : stats.total;
        btn.textContent = `⏳ ${c}/${t}`;
        btn.style.background = 'rgba(29, 155, 240, 0.35)'; btn.style.borderColor = X_BLUE;
      } else {
        btn.textContent = `⚡ Sync (${stats.cached}/${stats.total})`;
        btn.style.background = stats.cached === stats.total && stats.total > 0 ? 'rgba(29, 155, 240, 0.2)' : CARD_BG;
        btn.style.borderColor = stats.cached === stats.total && stats.total > 0 ? X_BLUE : BTN_BORDER;
      }
    }

    function mkBtn(label, bg) {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        padding: '3px 7px', borderRadius: '16px', border: `1px solid ${BORDER_CLR}`,
        cursor: 'pointer', background: bg || CARD_BG, color: '#e7e9ea',
        fontSize: '11px', fontFamily: 'system-ui, sans-serif', lineHeight: '1.2',
        whiteSpace: 'nowrap', flexShrink: '0', transition: 'background .15s, border-color .15s'
      });
      return b;
    }

    function mkPill(label, isSelected, onClick) {
      const p = document.createElement('div');
      p.textContent = label;
      Object.assign(p.style, {
        padding: '3px 8px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer',
        fontWeight: isSelected ? '600' : '400', background: isSelected ? X_BLUE : CARD_BG,
        color: isSelected ? '#ffffff' : '#71767b', border: `1px solid ${isSelected ? X_BLUE : BORDER_CLR}`,
        transition: 'all 0.15s ease'
      });
      p.onclick = onClick;
      return p;
    }

    function styleDropdown(el) {
      Object.assign(el.style, {
        background: INPUT_BG, color: '#e7e9ea', border: `1px solid ${BORDER_CLR}`,
        borderRadius: '8px', padding: '2px 4px', fontSize: '11px', cursor: 'pointer', outline: 'none'
      });
    }

    function ensureSidebar() {
      if (document.getElementById('x-pp-sidebar')) return;
      const geom = loadGeom();

      const sidebar = document.createElement('div');
      sidebar.id = 'x-pp-sidebar';
      Object.assign(sidebar.style, {
        position: 'fixed', top: geom.top, left: geom.left || 'auto', right: geom.right,
        width: geom.width, height: geom.height, minWidth: '220px', minHeight: '200px',
        background: SIDE_BG, color: '#e7e9ea', padding: '8px 10px', borderRadius: '16px',
        zIndex: '2147483645', display: loadVis() ? 'flex' : 'none', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)',
        border: `1px solid ${BORDER_CLR}`, fontSize: '13px', lineHeight: '1.5',
        resize: 'both', overflow: 'hidden', fontFamily: loadFFam(), isolation: 'isolate', boxSizing: 'border-box'
      });

      const hdr = document.createElement('div');
      hdr.style.cssText = `display:flex; align-items:center; padding-bottom:6px; margin-bottom:6px; border-bottom:1px solid ${BORDER_CLR}; gap:4px; cursor:move; flex-shrink:0; flex-wrap:wrap;`;

      const title = document.createElement('span');
      title.textContent = '𝕏 Playlist';
      title.style.cssText = 'flex:1; font-weight:700; color:#e7e9ea; font-size:13px; letter-spacing:.3px;';
      title.ondblclick = () => { saveGeom(defaultGeom); window.location.reload(); };

      const fileInput = document.createElement('input');
      fileInput.type = 'file'; fileInput.accept = '.txt'; fileInput.style.display = 'none';
      sidebar.appendChild(fileInput);

      fileInput.onchange = (ev) => {
        const f = ev.target.files?.[0];
        if (f) {
          const reader = new FileReader();
          reader.onload = ({ target }) => {
            const parsed = parsePlaylistText(target.result || '');
            if (parsed.length) {
              parsedGroups = parsed; currentIndex = -1;
              saveData(parsedGroups); saveIdx(-1); saveVis(true);
              renderList(); startAvatarBatchSync();
            }
          };
          reader.readAsText(f);
        }
      };

      const uploadBtn = mkBtn('📂');
      uploadBtn.title = 'Upload categorized .txt list';
      uploadBtn.onclick = () => fileInput.click();

      const syncBtn = mkBtn('⚡ Sync');
      syncBtn.id = 'x-pp-sync-btn';
      syncBtn.onclick = startAvatarBatchSync;

      const avatarOnlyBtn = mkBtn(loadAvatarOnly() ? '👤 Only' : '👤 + 📝');
      if (loadAvatarOnly()) { avatarOnlyBtn.style.background = 'rgba(29, 155, 240, 0.25)'; avatarOnlyBtn.style.borderColor = X_BLUE; }
      avatarOnlyBtn.onclick = () => {
        const next = !loadAvatarOnly();
        saveAvatarOnly(next);
        avatarOnlyBtn.textContent = next ? '👤 Only' : '👤 + 📝';
        avatarOnlyBtn.style.background = next ? 'rgba(29, 155, 240, 0.25)' : CARD_BG;
        avatarOnlyBtn.style.borderColor = next ? X_BLUE : BTN_BORDER;
        renderList();
      };

      const isTab = loadTabMode();
      const tabBtn = mkBtn(isTab ? '📑 Tabs: ON' : '☰ Tabs: OFF', isTab ? 'rgba(29, 155, 240, 0.25)' : CARD_BG);
      tabBtn.onclick = () => {
        const next = !loadTabMode();
        saveTabMode(next);
        tabBtn.textContent = next ? '📑 Tabs: ON' : '☰ Tabs: OFF';
        tabBtn.style.background = next ? 'rgba(29, 155, 240, 0.25)' : CARD_BG;
        renderList();
      };

      const colBtn = mkBtn(loadCols() + ' Col' + (loadCols() > 1 ? 's' : ''));
      colBtn.onclick = () => {
        const c = (loadCols() % 5) + 1;
        saveCols(c); colBtn.textContent = c + ' Col' + (c > 1 ? 's' : '');
        renderList();
      };

      const clearBtn = mkBtn('Reset', '#1a0c0f');
      clearBtn.style.color = '#f4212e'; clearBtn.style.borderColor = '#2d1217';
      clearBtn.title = 'Reset to default followed list';
      clearBtn.onclick = () => {
        Store.remove(SK_DATA); Store.remove(SK_SCROLL); Store.remove(SK_IDX);
        parsedGroups = parsePlaylistText(RAW_FOLLOWING_LIST);
        saveData(parsedGroups); currentIndex = -1; renderList();
      };

      hdr.append(title, uploadBtn, syncBtn, avatarOnlyBtn, tabBtn, colBtn, clearBtn);
      sidebar.appendChild(hdr);

      // Sub-Row: Font Size, Search Input, Font Family
      const controlsRow = document.createElement('div');
      controlsRow.style.cssText = `display:flex; align-items:center; gap:5px; padding-bottom:6px; margin-bottom:6px; border-bottom:1px solid ${BORDER_CLR}; flex-shrink:0;`;

      const lblSz = document.createElement('span');
      lblSz.textContent = 'Sz:'; lblSz.style.cssText = 'color:#71767b; font-size:10px; white-space:nowrap;';

      const sizeSelect = document.createElement('select');
      styleDropdown(sizeSelect);
      sizeSelect.style.width = '48px'; sizeSelect.style.flexShrink = '0';
      const curSize = loadFSize();
      FONT_SIZE_OPTIONS.forEach(sz => {
        const opt = document.createElement('option');
        opt.value = sz; opt.textContent = sz + 'px';
        if (sz === curSize) opt.selected = true;
        sizeSelect.appendChild(opt);
      });
      sizeSelect.onchange = () => { saveFSize(+sizeSelect.value); renderList(); };

      const searchWrap = document.createElement('div');
      searchWrap.style.cssText = `display:flex; align-items:center; flex:1; min-width:0; background:${INPUT_BG}; border:1px solid ${BORDER_CLR}; border-radius:16px; padding:0 6px;`;

      const searchInput = document.createElement('input');
      searchInput.type = 'text'; searchInput.placeholder = '🔍 Search...';
      Object.assign(searchInput.style, { flex: '1', minWidth: '0', background: 'transparent', border: 'none', outline: 'none', color: '#e7e9ea', fontSize: '11px', padding: '3px 2px' });
      searchInput.oninput = (e) => { searchQuery = e.target.value.toLowerCase().trim(); renderList(); };

      const clearSearchBtn = document.createElement('span');
      clearSearchBtn.textContent = '✕';
      clearSearchBtn.style.cssText = 'cursor:pointer; color:#71767b; font-size:10px; padding:0 2px;';
      clearSearchBtn.onclick = () => { searchInput.value = ''; searchQuery = ''; renderList(); };
      searchWrap.append(searchInput, clearSearchBtn);

      const lblFont = document.createElement('span');
      lblFont.textContent = 'Font:'; lblFont.style.cssText = 'color:#71767b; font-size:10px; white-space:nowrap;';

      const famSelect = document.createElement('select');
      styleDropdown(famSelect);
      famSelect.style.maxWidth = '85px'; famSelect.style.flexShrink = '1'; famSelect.style.minWidth = '0';
      const curFam = loadFFam();
      FONT_OPTIONS.forEach(fo => {
        const opt = document.createElement('option');
        opt.value = fo.value; opt.textContent = fo.label;
        if (fo.value === curFam) opt.selected = true;
        famSelect.appendChild(opt);
      });
      famSelect.onchange = () => { saveFFam(famSelect.value); sidebar.style.fontFamily = famSelect.value; renderList(); };

      controlsRow.append(lblSz, sizeSelect, searchWrap, lblFont, famSelect);
      sidebar.appendChild(controlsRow);

      const tabBar = document.createElement('div');
      tabBar.id = 'x-pp-tab-bar';
      tabBar.style.cssText = `display:none; overflow-x:auto; white-space:nowrap; gap:5px; padding:4px 0 6px 0; border-bottom:1px solid ${BORDER_CLR}; scrollbar-width:none; flex-shrink:0;`;
      sidebar.appendChild(tabBar);

      const lc = document.createElement('div');
      lc.id = 'x-pp-list';
      lc.style.cssText = 'flex:1; overflow-y:auto; overflow-x:hidden; padding-right:2px;';
      sidebar.appendChild(lc);

      document.documentElement.appendChild(sidebar);

      // Drag Engine for Sidebar
      let isDragging = false, startX, startY, startLeft, startTop;
      hdr.onmousedown = (e) => {
        if (['button', 'select', 'input'].includes(e.target.tagName.toLowerCase())) return;
        isDragging = true; startX = e.clientX; startY = e.clientY;
        const rect = sidebar.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        sidebar.style.right = 'auto'; sidebar.style.left = startLeft + 'px'; sidebar.style.top = startTop + 'px';
        e.preventDefault();
      };
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        sidebar.style.left = Math.max(0, Math.min(startLeft + (e.clientX - startX), window.innerWidth - 100)) + 'px';
        sidebar.style.top  = Math.max(0, Math.min(startTop + (e.clientY - startY), window.innerHeight - 50)) + 'px';
      });
      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          saveGeom({ left: sidebar.style.left, top: sidebar.style.top, right: sidebar.style.right, width: sidebar.style.width, height: sidebar.style.height });
        }
      });

      updateSyncButtonLabel();
    }

    function renderList() {
      ensureSidebar();
      const sidebar = document.getElementById('x-pp-sidebar');
      const tabBar  = document.getElementById('x-pp-tab-bar');
      const lc      = document.getElementById('x-pp-list');
      if (!sidebar || !lc) return;

      sidebar.style.display = loadVis() ? 'flex' : 'none';
      lc.innerHTML = ''; tabBar.innerHTML = '';

      if (!parsedGroups.length) {
        lc.innerHTML = '<div style="opacity:.45; padding:15px 4px; font-size:11px; color:#71767b; text-align:center;">(empty — upload a .txt file)</div>';
        tabBar.style.display = 'none'; updateSyncButtonLabel(); return;
      }

      const isTab = loadTabMode(), isAvOnly = loadAvatarOnly(), cols = loadCols(), fSize = loadFSize(), curTab = loadActiveTab(), curUser = getCurrentUsername();

      if (isTab) {
        tabBar.style.display = 'flex';
        const totalCount = getAllItems().length;
        tabBar.appendChild(mkPill(`All (${totalCount})`, curTab === 'ALL', () => { saveActiveTab('ALL'); renderList(); }));
        parsedGroups.forEach((grp, idx) => {
          tabBar.appendChild(mkPill(`${grp.title} (${grp.items.length})`, curTab === String(idx), () => { saveActiveTab(String(idx)); renderList(); }));
        });
        const activeGroups = curTab === 'ALL' ? parsedGroups : (parsedGroups[+curTab] ? [parsedGroups[+curTab]] : parsedGroups);
        activeGroups.forEach(grp => renderGroupSection(grp, lc, cols, fSize, curUser, isAvOnly, false));
      } else {
        tabBar.style.display = 'none';
        parsedGroups.forEach(grp => renderGroupSection(grp, lc, cols, fSize, curUser, isAvOnly, true));
      }

      const savedScroll = Store.get(SK_SCROLL, 0);
      if (savedScroll) lc.scrollTop = +savedScroll;
      lc.onscroll = () => Store.set(SK_SCROLL, lc.scrollTop || 0);

      scrapeAvatarsFromDOM();
      updateSyncButtonLabel();
    }

    function renderGroupSection(grp, container, cols, fSize, curUser, isAvOnly, showHeader) {
      let items = grp.items;
      if (searchQuery) {
        items = items.filter(it => it.handle.toLowerCase().includes(searchQuery) || it.username.toLowerCase().includes(searchQuery) || it.subheader.toLowerCase().includes(searchQuery));
      }
      if (!items.length) return;

      const grpWrap = document.createElement('div');
      grpWrap.style.marginBottom = '10px';

      if (showHeader) {
        const banner = document.createElement('div');
        banner.style.cssText = `font-size:${Math.round(fSize * 1.15)}px; font-weight:700; color:#1d9bf0; padding:8px 4px 4px 4px; border-bottom:1px solid ${BORDER_CLR}; margin-top:6px; display:flex; justify-content:space-between; align-items:center;`;
        banner.innerHTML = `<span>${grp.title}</span><span style="font-size:10px; color:#71767b;">${items.length}</span>`;
        grpWrap.appendChild(banner);
      }

      const grid = document.createElement('div');
      if (isAvOnly) {
        grid.style.cssText = `display:grid; grid-template-columns:repeat(${cols === 1 ? 4 : cols}, minmax(0, 1fr)); gap:6px; width:100%; align-content:start; justify-items:center; padding:4px 0;`;
      } else if (cols > 1) {
        grid.style.cssText = `display:grid; grid-template-columns:repeat(${cols}, minmax(0, 1fr)); gap:3px; width:100%; align-content:start; padding:3px 0;`;
      } else {
        grid.style.cssText = 'display:flex; flex-direction:column; gap:2px; width:100%; padding:2px 0;';
      }

      let lastSubheader = '';
      items.forEach((item, itemIdx) => {
        if (item.subheader && item.subheader !== lastSubheader && !isAvOnly) {
          lastSubheader = item.subheader;
          const subh = document.createElement('div');
          subh.style.cssText = `font-size:${Math.round(fSize * 0.85)}px; font-weight:700; color:#71767b; text-transform:uppercase; letter-spacing:0.5px; padding:6px 4px 2px; grid-column:1 / -1; width:100%;`;
          subh.textContent = item.subheader;
          grid.appendChild(subh);
        }

        const allList = getAllItems();
        const globalIdx = allList.indexOf(item);
        const isMatch = curUser && item.username && curUser === item.username;
        const active = globalIdx === currentIndex || isMatch;

        const row = document.createElement('a');
        row.href = `https://x.com${getRouteFromEntry(item.handle)}`;
        row.title = `${item.handle}${item.subheader ? ' • ' + item.subheader : ''}`;

        if (isAvOnly) {
          Object.assign(row.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px', borderRadius: '50%', cursor: 'pointer', background: 'transparent', textDecoration: 'none', boxSizing: 'border-box' });
        } else {
          Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '0.5em', minWidth: '0', padding: '4px 6px',
            borderBottom: cols === 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', cursor: 'pointer',
            background: active ? 'rgba(231,233,234,0.12)' : 'transparent', color: active ? '#e7e9ea' : '#71767b',
            fontWeight: active ? '700' : 'normal', borderRadius: '8px', textDecoration: 'none', fontSize: fSize + 'px',
            lineHeight: '1.35', boxSizing: 'border-box', borderLeft: active ? `2.5px solid ${X_BLUE}` : '2.5px solid transparent'
          });
        }

        row.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          saveIdx(globalIdx); renderList(); navigateTo(item.handle);
        };

        const avatarBox = document.createElement('div');
        avatarBox.className = 'x-pp-avatar-box';
        avatarBox.dataset.username = item.username;
        Object.assign(avatarBox.style, {
          width: '2.35em', height: '2.35em', minWidth: '2.35em', minHeight: '2.35em', borderRadius: '50%',
          background: INPUT_BG, flexShrink: '0', overflow: 'hidden', position: 'relative', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: active && isAvOnly ? `0 0 0 2.5px ${X_BLUE}, 0 0 10px rgba(29,155,240,0.6)` : '0 1px 3px rgba(0,0,0,0.5)'
        });

        const placeholder = document.createElement('span');
        placeholder.className = 'x-pp-avatar-placeholder';
        placeholder.textContent = (item.handle.replace(/^[@https?://]+/, '')[0] || '𝕏').toUpperCase();
        placeholder.style.cssText = 'font-size:0.9em; font-weight:700; color:#71767b; user-select:none; lineHeight:1;';

        const img = document.createElement('img');
        img.className = 'x-pp-avatar-img';
        img.style.cssText = 'width:100%; height:100%; object-fit:cover; border-radius:50%; display:none;';

        avatarBox.append(placeholder, img);

        if (item.username) {
          const cached = avatarCache[item.username];
          if (cached && cached !== 'NONE') {
            img.src = cached; img.style.display = 'block'; placeholder.style.display = 'none';
          } else if (cached === 'NONE') {
            placeholder.style.display = 'flex'; img.style.display = 'none';
          }
        }

        row.appendChild(avatarBox);

        if (!isAvOnly) {
          const textSpan = document.createElement('span');
          textSpan.textContent = `${active ? '▶ ' : ''}${itemIdx + 1}. ${item.handle}`;
          textSpan.style.cssText = 'min-width:0; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
          row.appendChild(textSpan);
        }

        grid.appendChild(row);
      });

      grpWrap.appendChild(grid);
      container.appendChild(grpWrap);
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

    return { ensureSidebar, renderList, toggleSidebar, scrapeAvatarsFromDOM, startAvatarBatchSync, loadInitial: () => {
      const ver = Store.get(SK_LIST_VER, '');
      const stored = loadData();
      if (!stored || !stored.length || ver !== 'v5.0_following_encoded') {
        parsedGroups = parsePlaylistText(RAW_FOLLOWING_LIST);
        saveData(parsedGroups);
        Store.set(SK_LIST_VER, 'v5.0_following_encoded');
      } else {
        parsedGroups = stored;
      }
      currentIndex = loadIdx();
      renderList();
    }};
  })();

  /* =========================================================================
   * MODULE 6: Unified Floating Widget with Resizing Capability
   * ========================================================================= */
  function applyFloatingBtnScale(sizePx) {
    const wrap = document.getElementById('x-controls-wrap');
    if (!wrap) return;
    const sz = sizePx || Store.get('xpro_v4', null)?.uiSizes?.mainBtnSize || 44;
    const btnHeight = Math.round(sz * 0.77);
    const iconSize = Math.round(sz * 0.38);

    wrap.style.width = sz + 'px';
    wrap.querySelectorAll('button').forEach(btn => {
      btn.style.width = sz + 'px';
      btn.style.height = btnHeight + 'px';
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', iconSize);
        svg.setAttribute('height', iconSize);
      }
    });
  }

  function mountFloatingWidget() {
    if (document.getElementById('x-controls-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'x-controls-wrap';
    Object.assign(wrap.style, {
      position: 'fixed', bottom: '75px', right: '14px', zIndex: '2147483647',
      display: 'flex', flexDirection: 'column', gap: '2px', width: '44px',
      userSelect: 'none', touchAction: 'none'
    });

    const savedPos = Store.get('x_ctrl_btnpos', null);
    if (savedPos && savedPos.top && savedPos.right) {
      wrap.style.top = savedPos.top; wrap.style.right = savedPos.right; wrap.style.bottom = 'auto';
    }

    function makeBtn(svg, title) {
      const b = document.createElement('button');
      b.title = title; b.innerHTML = svg;
      Object.assign(b.style, {
        width: '44px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 20, 30, 0.94)', border: '1px solid #2f3336', color: '#e7e9ea',
        cursor: 'pointer', outline: 'none', padding: '0', boxSizing: 'border-box'
      });
      return b;
    }

    const X_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.258 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
    const LIST_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

    // 1. Top: 𝕏 Pro Button
    const proBtn = makeBtn(X_SVG, '𝕏 Pro Control');
    proBtn.style.borderRadius = '8px 8px 3px 3px';
    proBtn.onclick = () => XPro.togglePanel();

    // 2. Bottom: 𝕏 Playlist Button
    const plBtn = makeBtn(LIST_SVG, '𝕏 Playlist');
    plBtn.style.borderRadius = '3px 3px 8px 8px';
    plBtn.onclick = () => XPlaylist.toggleSidebar();

    wrap.append(proBtn, plBtn);
    document.documentElement.appendChild(wrap);

    // Apply persisted size
    const sz = Store.get('xpro_v4', null)?.uiSizes?.mainBtnSize || 44;
    applyFloatingBtnScale(sz);

    // Touch & pointer dragging
    let isDrag = false, didMove = false, sx, sy, origT, origR, ptrId = null;
    wrap.addEventListener('pointerdown', (e) => {
      isDrag = false; didMove = false; ptrId = e.pointerId;
      sx = e.clientX; sy = e.clientY;
      const rect = wrap.getBoundingClientRect();
      origT = rect.top; origR = window.innerWidth - rect.right;
    });

    wrap.addEventListener('pointermove', (e) => {
      if (e.pointerId !== ptrId) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        if (!didMove) {
          didMove = true; isDrag = true;
          try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
          wrap.style.bottom = 'auto';
        }
        wrap.style.top = Math.max(10, Math.min(window.innerHeight - 75, origT + dy)) + 'px';
        wrap.style.right = Math.max(10, Math.min(window.innerWidth - 50, origR - dx)) + 'px';
      }
    });

    const onPointerUp = (e) => {
      if (e.pointerId !== ptrId) return;
      if (didMove) {
        try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
        Store.set('x_ctrl_btnpos', { top: wrap.style.top, right: wrap.style.right });
      }
      isDrag = false; didMove = false;
    };
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', onPointerUp);
  }

  /* =========================================================================
   * BOOTSTRAP GUARDIAN
   * ========================================================================= */
  function boot() {
    mountFloatingWidget();
    XPlaylist.ensureSidebar();
    XPlaylist.loadInitial();
    XPro.buildPanel();
    if (XPro.cfg.layout.feedOffset) XPro.applyFeedOffset(XPro.cfg.layout.feedOffset);
  }

  boot();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  }

  setInterval(() => {
    if (!document.getElementById('x-controls-wrap')) mountFloatingWidget();
    XPlaylist.scrapeAvatarsFromDOM();
  }, 1500);

  // Gentle auto-sync after launch
  setTimeout(() => {
    XPlaylist.startAvatarBatchSync();
  }, 2500);

  // WebToApp Native Action trigger
  if (typeof hcj !== 'undefined' && hcj.on) {
    hcj.on('action', () => {
      XPlaylist.toggleSidebar();
    });
  }
})();