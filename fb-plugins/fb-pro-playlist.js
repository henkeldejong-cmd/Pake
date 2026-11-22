(() => {
  'use strict';

  /* =========================================================================
   * GOOGLE AUTO-REDIRECTOR (If landing on Google Search or Redirect Notice)
   * ========================================================================= */
  if (window.location.hostname.includes('google.') && window.location.search.includes('site:facebook.com')) {
    const noticeA = document.querySelector('a[href^="https://www.facebook.com"], a[href^="http://www.facebook.com"]');
    if (noticeA) {
      window.location.replace(noticeA.href);
      return;
    }
    const firstA = document.querySelector('#search a[href*="facebook.com"], div[data-async-context] a[href*="facebook.com"], a[href*="facebook.com"]');
    if (firstA) {
      const rawHref = firstA.getAttribute('href');
      const m = rawHref && rawHref.match(/url\?q=(https?:\/\/[^&]+)/i);
      const target = m ? decodeURIComponent(m[1]) : firstA.href;
      if (target && target.includes('facebook.com')) {
        window.location.replace(target);
        return;
      }
    }
  }

  if (window !== window.top) return;

  /* =========================================================================
   * UNIVERSAL STORAGE & RESILIENT NETWORK BRIDGE
   * ========================================================================= */
  const Store = {
    _parse(v) {
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (_) { return v; }
      }
      return v;
    },
    _usable(v) { return v !== undefined && v !== null && v !== ''; },
    _backends() {
      const list = [];
      try {
        if (typeof hcj !== 'undefined' && hcj && hcj.config && typeof hcj.config.get === 'function' && typeof hcj.config.set === 'function') {
          list.push({
            name: 'hcj',
            get: (k) => hcj.config.get(k, undefined),
            set: (k, v) => hcj.config.set(k, v),
            del: (k) => { if (typeof hcj.config.remove === 'function') hcj.config.remove(k); }
          });
        }
      } catch (_) {}
      try {
        if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
          list.push({
            name: 'GM',
            get: (k) => GM_getValue(k, undefined),
            set: (k, v) => GM_setValue(k, v),
            del: (k) => { if (typeof GM_deleteValue === 'function') GM_deleteValue(k); }
          });
        }
      } catch (_) {}
      try {
        if (window.localStorage) {
          list.push({
            name: 'localStorage',
            get: (k) => localStorage.getItem(k),
            set: (k, v) => localStorage.setItem(k, v),
            del: (k) => localStorage.removeItem(k)
          });
        }
      } catch (_) {}
      return list;
    },
    get(key, def) {
      for (const b of this._backends()) {
        try {
          const v = b.get(key);
          if (v && typeof v.then === 'function') continue;
          if (this._usable(v)) return this._parse(v);
        } catch (_) {}
      }
      return def;
    },
    async getAsync(key, def) {
      for (const b of this._backends()) {
        try {
          let v = b.get(key);
          if (v && typeof v.then === 'function') v = await v;
          if (this._usable(v)) return this._parse(v);
        } catch (_) {}
      }
      return def;
    },
    set(key, val) {
      let json;
      try { json = JSON.stringify(val); } catch (_) { return; }
      for (const b of this._backends()) {
        try { const r = b.set(key, json); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (_) {}
      }
    },
    remove(key) {
      for (const b of this._backends()) {
        try { const r = b.del(key); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (_) {}
      }
    }
  };

  /* ---------- IndexedDB (large, durable store) ---------- */
  const AvatarDB = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise(resolve => {
      try {
        const req = indexedDB.open('fb_pp_avatar_db', 1);
        req.onupgradeneeded = () => { try { req.result.createObjectStore('a'); } catch (_) {} };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (_) { resolve(null); }
    }));
    return {
      async loadAll() {
        const db = await open();
        if (!db) return {};
        return new Promise(resolve => {
          const out = {};
          try {
            const req = db.transaction('a', 'readonly').objectStore('a').openCursor();
            req.onsuccess = () => {
              const c = req.result;
              if (c) { if (!String(c.key).startsWith('__')) out[c.key] = c.value; c.continue(); } else resolve(out);
            };
            req.onerror = () => resolve(out);
          } catch (_) { resolve(out); }
        });
      },
      async get(k) {
        const db = await open();
        if (!db) return null;
        return new Promise(resolve => {
          try {
            const req = db.transaction('a', 'readonly').objectStore('a').get(k);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          } catch (_) { resolve(null); }
        });
      },
      async put(k, rec) {
        const db = await open();
        if (!db) return;
        try { db.transaction('a', 'readwrite').objectStore('a').put(rec, k); } catch (_) {}
      },
      async del(k) {
        const db = await open();
        if (!db) return;
        try { db.transaction('a', 'readwrite').objectStore('a').delete(k); } catch (_) {}
      }
    };
  })();

  /* ---------- Scale Helpers ---------- */
  const AUTO_H_VH = 58;
  const clampScale = (s) => { s = +s; if (!isFinite(s) || s <= 0) s = 0.85; return Math.min(1.6, Math.max(0.5, s)); };
  const clampContentScale = (s) => { s = +s; if (!isFinite(s) || s <= 0) s = 1.0; return Math.min(1.4, Math.max(0.5, s)); };

  function applyUIScale(s) {
    let sc = s;
    if (sc === undefined) { try { sc = FBPro.getUIScale(); } catch (_) { sc = 0.85; } }
    sc = clampScale(sc);
    const panel = document.getElementById('fbp-pro-panel');
    if (panel) {
      panel.style.zoom = String(sc);
      panel.style.maxHeight = `calc(70vh / ${sc})`;
      panel.style.maxWidth = `calc((100vw - 24px) / ${sc})`;
    }
    const sb = document.getElementById('fb-pp-sidebar');
    if (sb) {
      sb.style.zoom = String(sc);
      sb.style.maxWidth = `calc((100vw - 16px) / ${sc})`;
      sb.style.maxHeight = `calc((100vh - 24px) / ${sc})`;
      if (sb.dataset.autoH === '1') sb.style.height = `calc(${AUTO_H_VH}vh / ${sc})`;
    }
  }

  /* =========================================================================
   * MODULE 1: Android Hardware / Gesture Back Navigation Fix
   * ========================================================================= */
  (() => {
    function isOverlayOpen() {
      return !!(
        document.querySelector('[data-pagelet="MediaViewer"], [role="dialog"], [aria-label="Close"], [data-sigil="MBackNavBarClick"]') ||
        window.location.pathname.includes('/photo/') ||
        window.location.pathname.includes('/videos/') ||
        window.location.pathname.includes('/permalink.php')
      );
    }

    function returnToFeed() {
      const closeBtn = document.querySelector('[aria-label="Close"], [data-sigil="MBackNavBarClick"], div[role="dialog"] button, [data-testid="app-bar-back"]');
      if (closeBtn) {
        closeBtn.click();
        return;
      }
      const homeBtn = document.querySelector('a[href="/"], a[href^="/home"], a[aria-label="Home"]');
      if (homeBtn) {
        homeBtn.click();
        return;
      }
      history.back();
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'GoBack' || e.keyCode === 4 || e.key === 'Escape') {
        if (isOverlayOpen()) {
          e.preventDefault();
          e.stopPropagation();
          returnToFeed();
        }
      }
    }, true);

    window.addEventListener('popstate', () => {
      if (isOverlayOpen()) returnToFeed();
    });
  })();

  /* =========================================================================
   * MODULE 3: Auto-Expand & Custom Dark "See More" Truncation
   * ========================================================================= */
  const FBAutoExpand = (() => {
    let charLimit = +Store.get('fb_charLimit', 400) || 400;

    const style = document.createElement('style');
    style.id = 'fb-autoexpand-styles';
    style.textContent = `
      .custom-see-more-btn {
        font-family: inherit; font-size: 0.95em; font-weight: 600; color: #000000;
        cursor: pointer; user-select: none; position: relative; z-index: 2;
        box-sizing: border-box; transition: opacity 0.2s ease;
      }
      .custom-see-more-btn.collapsed {
        display: flex; align-items: flex-end; width: 100%; height: 3.6em; margin-top: -3.6em; padding-bottom: 4px;
        background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.65) 45%, rgba(0, 0, 0, 0.95) 85%, #000000 100%);
      }
      .custom-see-more-btn .custom-see-more-pill {
        display: inline-block;
        background: none !important;
        color: #000000 !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 4px !important;
        font-size: 11px;
        font-weight: 600;
      }
      .custom-see-more-btn:hover .custom-see-more-pill {
        background: none !important;
        color: #000000 !important;
        border: none !important;
      }
      .custom-see-more-btn.expanded {
        display: inline-block;
        margin-top: 4px;
        background: none !important;
        color: #000000 !important;
        height: auto;
      }
      .custom-truncate-active { overflow: hidden !important; display: block !important; }
    `;
    (document.head || document.documentElement).appendChild(style);

    function processTextBlocks() {
      const blocks = document.querySelectorAll('[data-ad-comet-preview="message"], .x1iorvi4, [role="article"] div[dir="auto"]');
      blocks.forEach(block => {
        const textLen = block.innerText ? block.innerText.length : 0;
        if (textLen < 50) return;

        const currentHash = textLen + ":" + block.innerText.substring(0, 30);
        if (block.dataset.customProcessed === "true") {
          if (block.dataset.cachedHash !== currentHash) {
            block.dataset.customProcessed = "false";
            block.classList.remove('custom-truncate-active');
            block.style.maxHeight = "none";
            const existingBtn = block.parentNode?.querySelector('.custom-see-more-btn');
            if (existingBtn) existingBtn.remove();
          } else {
            return;
          }
        }

        const hasNativeBtn = Array.from(block.querySelectorAll('div[role="button"]'))
          .some(el => el.textContent && el.textContent.trim().toLowerCase() === "see more" && !el.classList.contains('custom-see-more-btn'));
        if (hasNativeBtn) return;

        if (textLen > charLimit) {
          block.dataset.customProcessed = "true";
          block.dataset.cachedHash = currentHash;

          const style = window.getComputedStyle(block);
          let lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 15) * 1.5;
          const ratio = charLimit / textLen;
          const targetHeight = Math.max(block.scrollHeight * ratio, lineHeight * 4);

          block.classList.add('custom-truncate-active');
          block.style.setProperty('max-height', `${targetHeight}px`, 'important');

          const btn = document.createElement('div');
          btn.className = "custom-see-more-btn collapsed";
          const pill = document.createElement('span');
          pill.className = "custom-see-more-pill";
          pill.innerText = "See More";
          btn.appendChild(pill);

          btn.onclick = function(e) {
            e.stopPropagation();
            if (block.classList.contains('custom-truncate-active')) {
              block.classList.remove('custom-truncate-active');
              block.style.setProperty('max-height', 'none', 'important');
              btn.classList.remove('collapsed');
              btn.classList.add('expanded');
              pill.innerText = "See Less";
            } else {
              block.classList.add('custom-truncate-active');
              block.style.setProperty('max-height', `${targetHeight}px`, 'important');
              btn.classList.remove('expanded');
              btn.classList.add('collapsed');
              pill.innerText = "See More";
              block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          };

          if (block.nextSibling) block.parentNode.insertBefore(btn, block.nextSibling);
          else block.parentNode.appendChild(btn);
        } else {
          block.dataset.customProcessed = "true";
          block.dataset.cachedHash = currentHash;
        }
      });
    }

    setInterval(() => {
      document.querySelectorAll('div[role="button"], span[dir="auto"]').forEach(el => {
        if (el.textContent && el.textContent.trim().toLowerCase() === "see more") {
          if (!el.classList.contains('custom-see-more-btn') && !el.dataset.sfxClicked) {
            el.dataset.sfxClicked = "true";
            el.click();
          }
        }
      });
    }, 600);

    let expandTimeout = null;
    new MutationObserver(() => {
      if (expandTimeout) return;
      expandTimeout = setTimeout(() => {
        processTextBlocks();
        expandTimeout = null;
      }, 250);
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    return {
      setLimit(v) {
        charLimit = v;
        Store.set('fb_charLimit', v);
        document.querySelectorAll('[data-custom-processed="true"]').forEach(b => {
          b.dataset.customProcessed = "false";
          b.classList.remove('custom-truncate-active');
          b.style.maxHeight = "none";
          b.parentNode?.querySelector('.custom-see-more-btn')?.remove();
        });
        processTextBlocks();
      },
      getLimit() { return charLimit; }
    };
  })();

  /* =========================================================================
   * MODULE 4: FB Pro — Dynamic Content Scale (Feed Locked) & Styling
   * ========================================================================= */
  const FBPro = (() => {
    const STORE_KEY = 'fbp_settings_v2';
    const VER_KEY = 'fbp_settings_ver';
    const SETTINGS_VER = 5;

    const DEFAULTS = {
      postTextSize: 14,
      postFontFamily: "'Bodoni MT', Bodoni, serif",
      profileBtnSize: 40,
      profileNameSize: 15,
      contentScale: 1.0,
      hideAllVideos: false,
      hideVideoPosts: true,
      hideReels: true,
      hideStories: true,
      mainBtnSize: 42,
      uiScale: 0.85
    };

    function loadCfg() {
      let stored = Store.get(STORE_KEY, null);
      if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch (_) { stored = null; } }
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};

      if (+Store.get(VER_KEY, 0) < SETTINGS_VER) {
        stored.hideReels = true;
        stored.hideStories = true;
        stored.hideVideoPosts = true;
        if (typeof stored.contentScale !== 'number') stored.contentScale = 1.0;
        if (typeof stored.hideAllVideos !== 'boolean') stored.hideAllVideos = false;
        Store.set(STORE_KEY, { ...DEFAULTS, ...stored });
        Store.set(VER_KEY, SETTINGS_VER);
      }
      return { ...DEFAULTS, ...stored };
    }

    let cfg = loadCfg();
    const save = () => { Store.set(STORE_KEY, cfg); Store.set(VER_KEY, SETTINGS_VER); };

    function applyContentScale(s) {
      const sc = clampContentScale(s !== undefined ? s : cfg.contentScale);
      let el = document.getElementById('fbp-content-scale-styles');
      if (!el) {
        el = document.createElement('style');
        el.id = 'fbp-content-scale-styles';
        (document.head || document.documentElement).appendChild(el);
      }

      if (sc === 1.0) {
        el.textContent = '';
        return;
      }

      el.textContent = `
        /* Scale center feed stream while locking frame width & position */
        div[role="feed"],
        div[data-pagelet="ProfileTimeline"],
        div[data-pagelet="ProfileTilesFeed_0"],
        #m_newsfeed_stream,
        div[data-sigil="m-feed"] {
          zoom: ${sc} !important;
          width: calc(100% / ${sc}) !important;
          max-width: calc(100% / ${sc}) !important;
          transform-origin: top center !important;
          box-sizing: border-box !important;
        }

        /* Fallback for standalone posts if outer feed container is not matched */
        div[role="main"] div[role="article"]:not([role="dialog"] *),
        div[data-pagelet^="FeedUnit_"]:not([role="dialog"] *),
        div[data-sigil="story-div"]:not([role="dialog"] *),
        .story_body_container:not([role="dialog"] *) {
          zoom: ${sc} !important;
          width: calc(100% / ${sc}) !important;
          max-width: calc(100% / ${sc}) !important;
          box-sizing: border-box !important;
        }

        /* Prevent double-compounding zoom */
        div[role="feed"] div[role="article"],
        div[data-pagelet="ProfileTimeline"] div[role="article"],
        #m_newsfeed_stream div[data-sigil="story-div"] {
          zoom: 1 !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        div[role="main"] {
          overflow-x: clip !important;
        }

        /* Keep dialogs, media viewers, and floating sidebars unscaled */
        div[role="dialog"],
        div[role="dialog"] *,
        #fb-controls-wrap,
        #fbp-pro-panel,
        #fb-pp-sidebar {
          zoom: 1 !important;
        }
      `;
    }

    function applyStyles() {
      let el = document.getElementById('tm-fb-pro-styles');
      if (!el) {
        el = document.createElement('style');
        el.id = 'tm-fb-pro-styles';
        (document.head || document.documentElement).appendChild(el);
      }
      const font = cfg.postFontFamily !== 'inherit' ? cfg.postFontFamily : 'inherit';

      el.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Great+Vibes&family=Inter:wght@400;600;700&family=Josefin+Sans:wght@400;600;700&display=swap');

        div[data-ad-comet-preview="message"], div[data-ad-comet-preview="message"] *,
        div[data-sigil="story-message"], div[data-sigil="story-message"] *,
        .story_body_container > div > span, .story_body_container > div > span * {
          font-size: ${cfg.postTextSize}px !important;
          font-family: ${font} !important;
          line-height: 1.4 !important;
        }

        div[role="article"] svg[role="img"], div[role="article"] svg[role="img"] image,
        div[data-pagelet^="FeedUnit_"] svg[role="img"], div[data-pagelet^="FeedUnit_"] svg[role="img"] image,
        i.profpic, img.profpic, .story_body_container header img {
          width: ${cfg.profileBtnSize}px !important;
          height: ${cfg.profileBtnSize}px !important;
        }

        div[role="article"] h3 span, div[role="article"] h4 span, div[role="article"] h3 a, div[role="article"] h4 a,
        div[data-pagelet^="FeedUnit_"] h3 span, div[data-pagelet^="FeedUnit_"] h4 span, header h3 a, header h3 strong,
        div[data-sigil="m-feed-voice-name"] a {
          font-size: ${cfg.profileNameSize}px !important;
        }

        [data-fbp-hid] {
          max-height: 0 !important; min-height: 0 !important; overflow: hidden !important;
          visibility: hidden !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
        }

        ${cfg.hideAllVideos ? `video, [data-video-id], div[data-sigil="inlineVideo"] { display: none !important; }` : ''}

        ${cfg.hideStories ? `
        [data-pagelet="Stories"], [data-pagelet="StoriesTray"], [data-pagelet="story_tray"],
        div[role="region"][aria-label="Stories" i], #MStoriesTray, [data-sigil~="m-stories-tray"] {
          display: none !important;
        }` : ''}
      `;
      applyContentScale(cfg.contentScale);
    }

    /* ---------- Reels / Stories / Video-post hiding ---------- */
    const FEED_SEL = 'div[aria-posinset], [data-pagelet^="FeedUnit"], [role="article"], div[data-sigil="story-div"], article';
    const COMMENT_SEL = '[role="article"][aria-label^="Comment"], [role="article"][aria-label^="Reply"], [aria-label^="Comment by" i], [aria-label^="Reply by" i]';
    const REEL_HEADING = /^(reels|reels and short videos|short videos)$/i;
    const SKIP_PATH = /^\/(reel|reels|watch|stories|photo|videos)(\/|$|\?)/i;

    function isReelPost(post) {
      if (post.querySelector('[aria-label="Reels" i], [aria-label="Reels and short videos" i]')) return true;
      const heads = post.querySelectorAll('h2, h3, h4, [role="heading"]');
      for (let i = 0; i < heads.length && i < 3; i++) {
        const t = (heads[i].textContent || '').replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u034F]/g, '').trim();
        if (REEL_HEADING.test(t)) return true;
      }
      for (const a of post.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]')) {
        if (a.closest(COMMENT_SEL)) continue;
        return true;
      }
      return false;
    }

    function isVideoPost(post) {
      const vids = post.querySelectorAll('video, [data-video-id], [data-sigil~="inlineVideo"], [aria-label="Play video" i], [aria-label="Watch video" i]');
      for (const v of vids) {
        if (v.closest(COMMENT_SEL)) continue;
        return true;
      }
      return false;
    }

    function hideStoriesTrayFallback() {
      const links = [...document.querySelectorAll('a[href*="/stories/"]')]
        .filter(a => !a.closest(FEED_SEL) && !a.closest('[role="dialog"]') && !/\/stories\/create/.test(a.getAttribute('href') || ''));
      if (links.length < 2) return;
      let node = links[0];
      const last = links[links.length - 1];
      while (node && !node.contains(last)) node = node.parentElement;
      if (!node || node === document.body || node === document.documentElement) return;
      if (node.querySelector(FEED_SEL)) return;
      if (node.getAttribute('data-fbp-hid')) return;
      if (node.getBoundingClientRect().height > 420) return;
      node.setAttribute('data-fbp-hid', 'stories');
    }

    function applyFeedFilters() {
      if (!cfg.hideStories) {
        document.querySelectorAll('[data-fbp-hid="stories"]').forEach(n => n.removeAttribute('data-fbp-hid'));
      }
      if (SKIP_PATH.test(location.pathname)) return;

      document.querySelectorAll(FEED_SEL).forEach(post => {
        if (post.parentElement && post.parentElement.closest(FEED_SEL)) return;
        if (post.closest('[role="dialog"]')) return;

        let why = '';
        if (cfg.hideReels && isReelPost(post)) why = 'reel';
        else if (cfg.hideVideoPosts && isVideoPost(post)) why = 'video';

        if (why) {
          if (post.getAttribute('data-fbp-hid') !== why) post.setAttribute('data-fbp-hid', why);
        } else if (post.hasAttribute('data-fbp-hid')) {
          post.removeAttribute('data-fbp-hid');
        }
      });

      if (cfg.hideStories) hideStoriesTrayFallback();
    }

    function buildPanel() {
      if (document.getElementById('fbp-pro-panel')) return;
      const p = document.createElement('div');
      p.id = 'fbp-pro-panel';
      Object.assign(p.style, {
        position: 'fixed', bottom: '80px', left: '16px', width: '250px', maxWidth: 'calc(100vw - 32px)',
        maxHeight: '70vh', overflowY: 'auto', background: 'rgba(24, 25, 26, 0.98)', border: '1px solid #3a3b3c',
        borderRadius: '12px', padding: '10px', boxShadow: '0 12px 36px rgba(0,0,0,0.85)',
        color: '#e4e6eb', fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: '12px',
        display: 'none', boxSizing: 'border-box', zIndex: '2147483646'
      });

      p.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #3a3b3c; padding-bottom:8px; margin-bottom:12px;">
          <strong style="font-size:14px; color:#1877f2;">FB Pro Settings</strong>
          <span id="fbp-close" style="cursor:pointer; font-size:16px; color:#aaa; padding:0 4px;">✕</span>
        </div>

        <label style="display:block; margin-bottom:10px;"><b>Window Scale</b> (Pro + Playlist): <span id="fbp-ui-val">${Math.round(clampScale(cfg.uiScale) * 100)}%</span>
          <input type="range" id="fbp-ui-slider" min="50" max="160" step="5" value="${Math.round(clampScale(cfg.uiScale) * 100)}" style="width:100%; accent-color:#1877f2; height:3px; margin-top:4px;">
        </label>

        <label style="display:block; margin-bottom:10px;"><b>Feed Content Scale</b> (Frame Locked): <span id="fbp-cscale-val">${Math.round(clampContentScale(cfg.contentScale) * 100)}%</span>
          <input type="range" id="fbp-cscale-slider" min="50" max="130" step="5" value="${Math.round(clampContentScale(cfg.contentScale) * 100)}" style="width:100%; accent-color:#1877f2; height:3px; margin-top:4px;">
        </label>

        <div style="border-top:1px solid #3a3b3c; margin:8px 0;"></div>

        <label style="display:block; margin-bottom:10px;">Post Text Size: <span id="fbp-tx-val">${cfg.postTextSize}px</span>
          <input type="range" id="fbp-tx-slider" min="10" max="32" value="${cfg.postTextSize}" style="width:100%; accent-color:#1877f2; height:3px; margin-top:4px;">
        </label>

        <label style="display:block; margin-bottom:10px;">Font Family:
          <select id="fbp-font-sel" style="width:100%; margin-top:4px; padding:4px; background:#242526; color:#e4e6eb; border:1px solid #3a3b3c; border-radius:5px; outline:none;">
            <option value="inherit">Default (Facebook)</option>
            <option value="'Bodoni MT', Bodoni, serif">Bodoni</option>
            <option value="'Playfair Display', serif">Didot</option>
            <option value="'Great Vibes', cursive">Great Vibes</option>
            <option value="'Inter', sans-serif">Inter</option>
            <option value="'Josefin Sans', sans-serif">Josefin Sans</option>
            <option value='"TwitterChirp", -apple-system, sans-serif'>TwitterChirp</option>
            <option value='Georgia, serif'>Georgia</option>
            <option value='Arial, sans-serif'>Arial</option>
            <option value='"Courier New", monospace'>Courier New</option>
          </select>
        </label>

        <label style="display:block; margin-bottom:10px;">Profile Picture Size: <span id="fbp-pic-val">${cfg.profileBtnSize}px</span>
          <input type="range" id="fbp-pic-slider" min="20" max="70" value="${cfg.profileBtnSize}" style="width:100%; accent-color:#1877f2; height:3px; margin-top:4px;">
        </label>

        <label style="display:block; margin-bottom:10px;">Profile Name Size: <span id="fbp-name-val">${cfg.profileNameSize}px</span>
          <input type="range" id="fbp-name-slider" min="10" max="24" value="${cfg.profileNameSize}" style="width:100%; accent-color:#1877f2; height:3px; margin-top:4px;">
        </label>

        <div style="border-top:1px solid #3a3b3c; margin:10px 0;"></div>

        <label style="display:block; margin-bottom:10px;">Floating Buttons Scale: <span id="fbp-btn-val">${cfg.mainBtnSize || 42}px</span>
          <input type="range" id="fbp-btn-slider" min="30" max="64" value="${cfg.mainBtnSize || 42}" style="width:100%; accent-color:#1877f2; height:3px; margin-top:4px;">
        </label>

        <label style="display:block; margin-bottom:10px;">Auto-Expand "See More" Length: <span id="fbp-char-val">${FBAutoExpand.getLimit()} chars</span>
          <input type="range" id="fbp-char-slider" min="100" max="800" step="25" value="${FBAutoExpand.getLimit()}" style="width:100%; accent-color:#1877f2; height:3px; margin-top:4px;">
        </label>

        <div style="border-top:1px solid #3a3b3c; margin:10px 0;"></div>

        <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; cursor:pointer;">
          <span>Hide Reels</span>
          <input type="checkbox" id="fbp-h-reels" ${cfg.hideReels ? 'checked' : ''}>
        </label>

        <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; cursor:pointer;">
          <span>Hide Stories</span>
          <input type="checkbox" id="fbp-h-stories" ${cfg.hideStories ? 'checked' : ''}>
        </label>

        <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; cursor:pointer;">
          <span>Hide Posts with Videos</span>
          <input type="checkbox" id="fbp-h-post-v" ${cfg.hideVideoPosts ? 'checked' : ''}>
        </label>

        <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:pointer;">
          <span>Hide All Videos (keep posts)</span>
          <input type="checkbox" id="fbp-h-all-v" ${cfg.hideAllVideos ? 'checked' : ''}>
        </label>

        <div style="border-top:1px solid #3a3b3c; margin:8px 0;"></div>
        <button id="fbp-diag-btn" style="width:100%; padding:5px; margin-bottom:6px; border:1px solid #3a3b3c; background:#242526; color:#e4e6eb; border-radius:5px; cursor:pointer;">Check storage</button>
        <div id="fbp-diag-out" style="font-size:10px; line-height:1.4; color:#9a9ea5; white-space:pre-wrap; margin-bottom:10px;"></div>

        <div style="display:flex; gap:8px;">
          <button id="fbp-reset" style="flex:1; padding:6px; border:1px solid #7e0a0a; background:#1a0c0f; color:#ff4d4d; border-radius:5px; cursor:pointer;">Reset</button>
          <button id="fbp-close-btn" style="flex:1; padding:6px; border:1px solid #3a3b3c; background:#242526; color:#e4e6eb; border-radius:5px; cursor:pointer;">Close</button>
        </div>
      `;

      document.documentElement.appendChild(p);
      applyUIScale(cfg.uiScale);

      const close = () => { p.style.display = 'none'; };
      p.querySelector('#fbp-close').onclick = close;
      p.querySelector('#fbp-close-btn').onclick = close;

      const fSel = p.querySelector('#fbp-font-sel');
      fSel.value = cfg.postFontFamily;
      fSel.onchange = (e) => { cfg.postFontFamily = e.target.value; save(); applyStyles(); };

      const uiS = p.querySelector('#fbp-ui-slider');
      uiS.oninput = (e) => { p.querySelector('#fbp-ui-val').textContent = e.target.value + '%'; };
      uiS.onchange = (e) => { cfg.uiScale = clampScale(+e.target.value / 100); save(); applyUIScale(cfg.uiScale); };

      const csS = p.querySelector('#fbp-cscale-slider');
      const updateCScale = (val) => {
        const sc = clampContentScale(+val / 100);
        cfg.contentScale = sc;
        p.querySelector('#fbp-cscale-val').textContent = Math.round(sc * 100) + '%';
        save();
        applyContentScale(sc);
      };
      csS.oninput = (e) => updateCScale(e.target.value);
      csS.onchange = (e) => updateCScale(e.target.value);

      p.querySelector('#fbp-tx-slider').oninput = (e) => {
        cfg.postTextSize = +e.target.value;
        p.querySelector('#fbp-tx-val').textContent = cfg.postTextSize + 'px';
        save(); applyStyles();
      };

      p.querySelector('#fbp-pic-slider').oninput = (e) => {
        cfg.profileBtnSize = +e.target.value;
        p.querySelector('#fbp-pic-val').textContent = cfg.profileBtnSize + 'px';
        save(); applyStyles();
      };

      p.querySelector('#fbp-name-slider').oninput = (e) => {
        cfg.profileNameSize = +e.target.value;
        p.querySelector('#fbp-name-val').textContent = cfg.profileNameSize + 'px';
        save(); applyStyles();
      };

      p.querySelector('#fbp-btn-slider').oninput = (e) => {
        const sz = +e.target.value;
        cfg.mainBtnSize = sz;
        p.querySelector('#fbp-btn-val').textContent = sz + 'px';
        save(); applyLauncherScale(sz);
      };

      p.querySelector('#fbp-char-slider').oninput = (e) => {
        const v = +e.target.value;
        FBAutoExpand.setLimit(v);
        p.querySelector('#fbp-char-val').textContent = v + ' chars';
      };

      p.querySelector('#fbp-h-reels').onchange = (e) => {
        cfg.hideReels = e.target.checked; save(); applyFeedFilters();
      };

      p.querySelector('#fbp-h-stories').onchange = (e) => {
        cfg.hideStories = e.target.checked; save(); applyStyles(); applyFeedFilters();
      };

      p.querySelector('#fbp-h-post-v').onchange = (e) => {
        cfg.hideVideoPosts = e.target.checked; save(); applyFeedFilters();
      };

      p.querySelector('#fbp-h-all-v').onchange = (e) => {
        cfg.hideAllVideos = e.target.checked; save(); applyStyles();
      };

      p.querySelector('#fbp-diag-btn').onclick = async () => {
        const out = p.querySelector('#fbp-diag-out');
        out.textContent = 'Checking...';
        try { out.textContent = await FBPlaylist.diagnose(); } catch (err) { out.textContent = 'Check failed: ' + err; }
      };

      p.querySelector('#fbp-reset').onclick = () => {
        if (!confirm('Reset all FB Pro settings to defaults?')) return;
        cfg = { ...DEFAULTS }; save();
        p.remove(); buildPanel(); applyStyles(); applyFeedFilters(); applyLauncherScale(42);
      };
    }

    function togglePanel() {
      buildPanel();
      const p = document.getElementById('fbp-pro-panel');
      if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    }

    applyStyles();

    let filterTimer = null;
    const scheduleFilters = () => {
      if (filterTimer) return;
      filterTimer = setTimeout(() => { filterTimer = null; applyFeedFilters(); }, 400);
    };
    const startFilters = () => {
      new MutationObserver(scheduleFilters).observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener('scroll', scheduleFilters, { passive: true });
      setInterval(applyFeedFilters, 2000);
      applyFeedFilters();
    };
    if (document.body) startFilters();
    else document.addEventListener('DOMContentLoaded', startFilters, { once: true });

    Store.getAsync(STORE_KEY, null).then((s) => {
      try {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return;
        const merged = { ...DEFAULTS, ...s };
        if (JSON.stringify(merged) === JSON.stringify(cfg)) return;
        cfg = merged;
        applyStyles(); applyFeedFilters();
        const old = document.getElementById('fbp-pro-panel');
        if (old) {
          const vis = old.style.display;
          old.remove(); buildPanel();
          const np = document.getElementById('fbp-pro-panel');
          if (np) np.style.display = vis;
        }
        applyUIScale(cfg.uiScale); applyLauncherScale(cfg.mainBtnSize);
      } catch (_) {}
    }).catch(() => {});

    return { buildPanel, togglePanel, cfg, getUIScale: () => clampScale(cfg.uiScale) };
  })();

  /* =========================================================================
   * MODULE 5: Facebook Pages Playlist & Automatic Google Resolver
   * ========================================================================= */
  const RAW_FB_PLAYLIST = `
### Favourites
Cinema, mon amour
Fabrizio Romano
The New York Times
A Shot.
The Atlantic
IndieWire
Certified Kino Bot - 8k Restoration
Art, mon amour
The Film Stage
Guardian Films
BBC Sport
National Geographic
BBC Science News
Sight and Sound
The Hollywood Reporter
Neil deGrasse Tyson
Philosophy Quotes
Bloomberg
The Wall Street Journal
WIRED
Other Perspectives
Letterboxd
The Criterion Collection
A Shot II.
New Scientist
Le Cinéma World
Film Times

---

## 1. News, Journalism & Current Affairs
### Global & General News
BBC News
The New York Times
The Guardian
The Atlantic
Bloomberg
The Wall Street Journal
CBS News
PBS NewsHour
60 Minutes
CNN
Guardian US
Washington Post
Firstpost
The Reporter
The Times and the Sunday Times
Vox
Fortune
Reuters
Reuters UK
BBC Radio 4
The Independent
CNN International
TIME
Financial Times
Forbes
ABC News
FRONTLINE | PBS
CBS Mornings
NBC News
CNBC International
New York Magazine
VICE

### Ethiopian & Regional Media
Ethio 360 Media
Ethiopian Reporter
Addis Fortune
BBC News Amharic
Taye Dendea Aredo
Addis Standard
Ethiopian Business Review
Untold Ethiopia

---

## 2. Cinema, Film & Television
### Industry Publications & Media
Film Times
IndieWire
The Film Stage
Guardian Films
Sight and Sound
The Hollywood Reporter
Letterboxd
Le Cinéma World
The Academy
High On Films
Screenplay
Far Out Cinema
Cahiers Du Cinéma (officiel)
BAFTA
Hulu
Paste Magazine
Cinema Now
Film Directors
Warner Bros.
IFC Center
Universal Pictures
IMAX
Entertainment View
TheWrap
Cineblog
mk2 films
All About Cinema
Passion For Movies
Fotogramas
The Match Factory
NEON
Variety
Cinema Feels
Cinë Watch
Film Total
Filmit
BFI
IFC Films
Tribeca
Sony Pictures Classics
Entertainment Weekly
Haters of Letterboxd
Hollywood News
Vulture
The Playlist
The A.V. Club
Short movies, mon amour
Screenise
Studio Liberikini
A Shot.
A Shot II.

### Cinephile & Fan Communities
Certified Kino Bot - 8k Restoration
Cinema, mon amour
I only understand films
35 mm
Greatest Films of All Time
Sublime Cinema
Archive of Cinema and Psyche
Ghibli Community
The Best of TV
History of Cinema
Cinema, My Nostalgia
The Best Movie Lines
Movie Quotes
Welcome to Twin Peaks
Cinema in the Mist 2
Cinephiles
Shitter Movie Details
Cinematic
Certified Kino Bot - Cinephile Bot
Cinesthetic
Cinephile Cinemas
Good Films Make Your Life Better
A Movie Quote Almost Every Day

---

## 3. Art, Photography & Museums
### Museums & Institutions
National Gallery of Art
MoMA The Museum of Modern Art
The Museum Without Walls/Le Museé Imaginaire
Van Gogh Museum
Victoria and Albert Museum
The Metropolitan Museum of Art, New York
Royal Academy of Arts
Musée du Louvre
Museum of Motherhood

### Art Media & Communities
Art, mon amour
Art... Part of my Soul
Art is a way of survival
ARTnews
Colossal
Art Passion Gallery
Arts, Artists, Artwork
Virtual Art Museum
The Art Blog
State Of The Art
Art Guide
Art of Dystopia
Art is where I belong
Book, coffee and art.
Art of the Initiate
Creators
Ravenous Butterflies
Vincent van Gogh
Edvard Munch
Francis Bacon (artist)
Bauhaus Movement
Surrealism
MAGNUM Magnum Photos
Photographers
Canvas tube
Artsy
Art Into Heart
The Artidote

---

## 4. Science, Space & Nature
### Science & Space Exploration
BBC Science News
National Geographic
New Scientist
CERN
Nature Reviews
From Quarks to Quasars
The Galactic Void
Astrotubi
ScienceAlert
Futurism
WIRED Science
American Museum of Natural History
Scientific American
Science Channel
Space Time
Astronomy Magazine
Be Smart
Insider Science
Dr. Michio Kaku
The Scientist
Popular Science
Science
Hashem Al-Ghaili

### Nature & Environment
The Secrets of the Universe
Amazing reefs & more
Give A Shift About Nature
Wild Battles
The Nature
All That's Interesting

---

## 5. Philosophy, Literature & Intellectual Discussion
### Philosophy & Critical Thinking
Philosophy Quotes
Other Perspectives
The thinkers
Philosophy Matters
Philosophy Now
Philosopher Games
Philosophy Teaches
Thinkandexist
The Institute of Art and Ideas
The Philosopher
Philosophical Thoughts
The Thoughts_Library
philosophyin21
Mini Philosophy
Daily Philosopher
Philo Thoughts
The Philosophy of Soren Kierkegaard
TPS The Philosopher's Shirt

### Philosophers & Intellectuals
Søren Kierkegaard
Sam Harris
Yuval Noah Harari
Bertrand Russell
Lex Fridman
Nietzsche
The Daily Nietzsche
Daily Stoic
Dr Jordan B Peterson
Seneca the Younger
Georg Wilhelm Friedrich Hegel
Jean-Paul Sartre, Existentialism and Philosophy
Dr. Cornel West

### Literature & Poetry
Classic Literature
History of Literature
Dark Classics
Sylvia Plath
Everyman's Library
Bibliophile.
Literary Pearls
Leo Tolstoy
Fyodor Dostoevsky
English Literature
Literature is My Utopia
Poetry, Tea and Me
Poetic Outlaws
Classic Books
High on Books
The Marginalian

### General Knowledge & Ideas
Knowledge is Power
The Mind Unleashed
Know More
Big Think
TED
TED-Ed
MasterClass
Curiosity
HighExistence

---

## 6. Technology & Digital Culture
WIRED
Tom's Guide
MUO
TechCrunch
Tech It
Ars Technica
Technology and Innovation Institute, Abu Dhabi
Windows Central
Phandroid
The Verge
How-To Geek
Lifehacker

---

## 7. Architecture & Design
### International Architecture
Architecture Library
Archscene
ArchDaily
a as architecture
The Modernist Collection
Architecture Lab
Architizer
Architecture Lab Magazine
Architecture & Design
Architecture News
The Architect's Newspaper

### Ethiopian Architecture & Construction
Ethiopian Construction Industry
Association of Ethiopian Architects - AEA

---

## 8. Sports
Fabrizio Romano
BBC Sport
Premier League
Guardian Football
Onefootball
Match of the Day
Sky Sports
Guardian sport
ESPN UK
Mensur Abdulkeni
Sabbian የሰዉነት ብቃት ማዕከል

---

## 9. Entertainment, Pop Culture & Lifestyle
### Comedy & Internet Culture
Cozy Hacks & Snacks
Sarcasm
Sarkasm
The Daily Show
Philomena Cunk Fans
Bored Panda
The Oatmeal
Viral UAS
Iconic Cool
Dazed

### Celebrities, Authors & Musicians
Red Mitchell
James Grisson, Writer
Author Jason X Pargin
The Graham Norton Show
Joe Rogan
Billboard
Woody Allen
Kevin Pineda
Elle Cordova

### Curiosities & Archives
BBC Culture
Telegraph Entertainment
Guinness World Records
Mashable
BBC Archive
Rolling Stone
Jeopardy!
The Library of Congress
Industrial Light & Magic
The Vintage News
Historical Pictures

---

## 10. Wellbeing, Mindset & Miscellaneous
### Mindset, Health & Spirituality
Keep the plug in the jug
God's Love
Mindful.org
Ancient Nutrition
Humanity & Peace
Humanity & love
iPeople
Meditation Techniques
Transcendental Meditation
Mind Therapy
Jay Shetty
MindShift
PickTheBrain
Our World in Data
Truth Theory

### Uncategorized & Personal Interest
36thames
The Lunatics
Tambaran2
I like noticing details that no one else ever sees
Frames That Matter
Anonymous
A guy who lives in a town that doesn't exist
Ether Dreams
Word World
Weird World
`;

  const FBPlaylist = (() => {
    const SK_DATA         = 'fb_pp_data';
    const SK_SCROLL       = 'fb_pp_scroll';
    const SK_IDX          = 'fb_pp_idx';
    const SK_VIS          = 'fb_pp_vis';
    const SK_COLS         = 'fb_pp_cols';
    const SK_GEOM         = 'fb_pp_geom';
    const SK_FSIZE        = 'fb_pp_fsize';
    const SK_FFAM         = 'fb_pp_ffam';
    const SK_CMODE        = 'fb_pp_cmode';
    const SK_TAB_MODE     = 'fb_pp_tab_mode';
    const SK_ACTIVE_TAB   = 'fb_pp_active_tab';
    const SK_AVATAR_ONLY  = 'fb_pp_avatar_only';
    const SK_AV_FAIL      = 'fb_pp_avatar_fail';
    const SK_SLUG_VER     = 'fb_pp_ver_v7_google_lucky';
    const SK_GCACHE       = 'fb_pp_google_cache';

    const FAIL_RETRY_MS   = 12 * 60 * 60 * 1000;
    const AV_MAX_PX       = 64;

    const FB_BLUE    = '#1877f2';
    const SIDE_BG    = 'rgba(24, 25, 26, 0.98)';
    const CARD_BG    = '#242526';
    const INPUT_BG   = '#242526';
    const BORDER_CLR = '#3a3b3c';
    const BTN_BORDER = '#3a3b3c';

    const CATEGORY_COLORS = {
      'favourites': '#f57c00',
      '1. news, journalism & current affairs': '#ec407a',
      '2. cinema, film & television': '#00897b',
      '3. art, photography & museums': '#8e24aa',
      '4. science, space & nature': '#43a047',
      '5. philosophy, literature & intellectual discussion': '#3949ab',
      '6. technology & digital culture': '#00acc1',
      '7. architecture & design': '#a1887f',
      '8. sports': '#039be5',
      '9. entertainment, pop culture & lifestyle': '#9e9d24',
      '10. wellbeing, mindset & miscellaneous': '#78909c'
    };

    /* Canonical handles confirmed via Google top results */
    const SLUG_ALIASES = new Map([
      ["a shot.", "JustAshotttt"],
      ["a shot ii.", "justashotttII"],
      ["film times", "FilmTimesOfficial"],
      ["cinema, mon amour", "cinemamonamourpage"],
      ["the new york times", "nytimes"],
      ["the guardian", "theguardian"],
      ["the atlantic", "TheAtlantic"],
      ["bloomberg", "bloombergbusiness"],
      ["the wall street journal", "wsj"],
      ["cbs news", "CBSNews"],
      ["pbs newshour", "newshour"],
      ["60 minutes", "60minutes"],
      ["cnn", "cnn"],
      ["guardian us", "GuardianUS"],
      ["washington post", "washingtonpost"],
      ["firstpost", "firstpost"],
      ["the reporter", "ethiopianreporter"],
      ["the times and the sunday times", "thetimes"],
      ["vox", "Vox"],
      ["fortune", "FortuneMagazine"],
      ["reuters", "Reuters"],
      ["reuters uk", "ReutersUK"],
      ["bbc news", "bbcnews"],
      ["bbc radio 4", "radio4"],
      ["the independent", "TheIndependentOnline"],
      ["cnn international", "cnninternational"],
      ["time", "time"],
      ["financial times", "financialtimes"],
      ["forbes", "forbes"],
      ["abc news", "ABCNews"],
      ["frontline | pbs", "frontline"],
      ["cbs mornings", "CBSMornings"],
      ["nbc news", "NBCNews"],
      ["cnbc international", "cnbcinternational"],
      ["new york magazine", "newyorkmag"],
      ["vice", "VICE"],
      ["ethio 360 media", "Ethio360Media"],
      ["ethiopian reporter", "ethiopianreporter"],
      ["addis fortune", "addisfortune.news"],
      ["bbc news amharic", "bbcnewsamharic"],
      ["taye dendea aredo", "taye.dendea"],
      ["addis standard", "addisstandard"],
      ["ethiopian business review", "ethiopianbusinessreview"],
      ["untold ethiopia", "untoldethiopia"],
      ["fabrizio romano", "fabrizioromanoherewego"],
      ["indiewire", "indiewire"],
      ["the film stage", "thefilmstage"],
      ["guardian films", "profile.php?id=61551212879555"],
      ["sight and sound", "SightSoundmag"],
      ["the hollywood reporter", "HollywoodReporter"],
      ["letterboxd", "letterboxd"],
      ["le cinéma world", "lecinemaworld"],
      ["the academy", "TheAcademy"],
      ["high on films", "highonfilms"],
      ["screenplay", "screenplaymag"],
      ["far out cinema", "FarOutCinema"],
      ["cahiers du cinéma (officiel)", "cahiersducinema.officiel"],
      ["bafta", "bafta"],
      ["hulu", "hulu"],
      ["paste magazine", "PasteMagazine"],
      ["cinema now", "cinemanow"],
      ["film directors", "filmdirectors"],
      ["warner bros.", "warnerbrosent"],
      ["ifc center", "IFCCenter"],
      ["universal pictures", "universalpictures"],
      ["imax", "IMAX"],
      ["entertainment view", "entertainmentview"],
      ["thewrap", "thewrap"],
      ["the criterion collection", "criterioncollection"],
      ["cineblog", "cineblog"],
      ["mk2 films", "mk2films"],
      ["all about cinema", "allaboutcinemapage"],
      ["passion for movies", "PassionForMovies"],
      ["fotogramas", "fotogramas"],
      ["the match factory", "thematchfactory"],
      ["neon", "neonrated"],
      ["variety", "Variety"],
      ["cinema feels", "cinemfeels"],
      ["cinë watch", "cinewatch"],
      ["film total", "filmtotal"],
      ["filmit", "filmit"],
      ["bfi", "BritishFilmInstitute"],
      ["ifc films", "IFCFilms"],
      ["tribeca", "Tribeca"],
      ["sony pictures classics", "sonyclassics"],
      ["entertainment weekly", "entertainmentweekly"],
      ["haters of letterboxd", "hatersofletterboxd"],
      ["hollywood news", "hollywoodnews"],
      ["vulture", "vulture"],
      ["the playlist", "theplaylist"],
      ["the a.v. club", "TheAVClub"],
      ["short movies, mon amour", "shortmoviesmonamour"],
      ["screenise", "screenise"],
      ["studio liberikini", "studioliberikini"],
      ["certified kino bot - 8k restoration", "certifiedkinobot"],
      ["certified kino bot - cinephile bot", "certifiedkinobotcinephile"],
      ["national gallery of art", "nationalgalleryofart"],
      ["moma the museum of modern art", "moma"],
      ["van gogh museum", "VanGoghMuseum"],
      ["victoria and albert museum", "victoriaandalbertmuseum"],
      ["the metropolitan museum of art, new york", "metmuseum"],
      ["royal academy of arts", "royalacademy"],
      ["musée du louvre", "museedulouvre"],
      ["artnews", "artnews"],
      ["colossal", "colossal"],
      ["magnum magnum photos", "MagnumPhotos"],
      ["bbc science news", "BBCScienceNews"],
      ["national geographic", "natgeo"],
      ["new scientist", "newscientist"],
      ["cern", "cern"],
      ["nature reviews", "naturereviews"],
      ["from quarks to quasars", "FromQuarksToQuasars"],
      ["the galactic void", "TheGalacticVoid"],
      ["astrotubi", "astrotubi"],
      ["sciencealert", "ScienceAlert"],
      ["futurism", "futurism"],
      ["wired science", "wiredscience"],
      ["american museum of natural history", "naturalhistory"],
      ["scientific american", "scientificamerican"],
      ["science channel", "ScienceChannel"],
      ["dr. michio kaku", "michiokaku"],
      ["the scientist", "thescientist"],
      ["popular science", "popsci"],
      ["science", "ScienceMagazine"],
      ["hashem al-ghaili", "hashem.ghaili"],
      ["philosophy quotes", "61553754057274"],
      ["other perspectives", "otherperspectives"],
      ["the thinkers", "thethinkers"],
      ["philosophy matters", "philosophymatters"],
      ["philosophy now", "philosophynow"],
      ["sam harris", "samharrisorg"],
      ["yuval noah harari", "Prof.Yuval.Noah.Harari"],
      ["lex fridman", "lexfridman"],
      ["daily stoic", "dailystoic"],
      ["dr jordan b peterson", "drjordanpeterson"],
      ["neil degrasse tyson", "neildegrassetyson"],
      ["big think", "bigthink"],
      ["ted", "TED"],
      ["masterclass", "masterclassofficial"],
      ["wired", "wired"],
      ["tom's guide", "tomsguide"],
      ["muo", "makeuseof"],
      ["techcrunch", "techcrunch"],
      ["ars technica", "arstechnica"],
      ["the verge", "verge"],
      ["how-to geek", "howtogeek"],
      ["lifehacker", "lifehacker"],
      ["bbc sport", "bbcsport"],
      ["premier league", "premierleague"],
      ["sky sports", "skysports"],
      ["espn uk", "ESPNUK"],
      ["the daily show", "thedailyshow"],
      ["bored panda", "boredpanda"],
      ["the oatmeal", "theoatmeal"]
    ]);

    const FONT_OPTIONS = [
      { label: 'Default (Facebook)', value: 'system-ui, -apple-system, sans-serif' },
      { label: 'Bodoni',        value: '"Bodoni MT", "Bodoni 72", serif' },
      { label: 'Didot',         value: 'Didot, "GFS Didot", serif' },
      { label: 'Great Vibes',   value: '"Great Vibes", cursive' },
      { label: 'Inter',         value: '"Inter", sans-serif' },
      { label: 'Josefin Sans',  value: '"Josefin Sans", sans-serif' },
      { label: 'TwitterChirp',  value: '"TwitterChirp", sans-serif' },
      { label: 'Arial',         value: 'Arial, sans-serif' },
      { label: 'Helvetica Neue',value: '"Helvetica Neue", Helvetica, sans-serif' },
      { label: 'Roboto',        value: '"Roboto", sans-serif' },
      { label: 'Open Sans',     value: '"Open Sans", sans-serif' },
      { label: 'Georgia',       value: 'Georgia, serif' },
      { label: 'Courier New',   value: '"Courier New", monospace' }
    ];
    const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20];

    let parsedGroups = [];
    let currentIndex = -1;
    let searchQuery  = '';
    let isSyncing    = false;
    let syncAborted  = false;
    let syncNote     = '';

    const normObj = (v) => {
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = {}; } }
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    };
    const isDataUrl = (s) => typeof s === 'string' && s.startsWith('data:image/');

    const loadData       = () => Store.get(SK_DATA, null);
    const saveData       = (d) => Store.set(SK_DATA, d || []);
    const saveIdx        = (i) => { Store.set(SK_IDX, i); currentIndex = i; };
    const loadIdx        = () => +Store.get(SK_IDX, -1);
    const loadVis        = () => Store.get(SK_VIS, false);
    const saveVis        = (v) => Store.set(SK_VIS, !!v);
    const loadCols       = () => +Store.get(SK_COLS, 1);
    const saveCols       = (v) => Store.set(SK_COLS, v);
    const loadFSize      = () => +Store.get(SK_FSIZE, 12);
    const saveFSize      = (v) => Store.set(SK_FSIZE, v);
    const loadFFam       = () => Store.get(SK_FFAM, FONT_OPTIONS[0].value);
    const saveFFam       = (v) => Store.set(SK_FFAM, v);
    const loadCMode      = () => Store.get(SK_CMODE, true);
    const saveCMode      = (v) => Store.set(SK_CMODE, !!v);
    const loadTabMode    = () => Store.get(SK_TAB_MODE, false);
    const saveTabMode    = (v) => Store.set(SK_TAB_MODE, !!v);
    const loadActiveTab  = () => Store.get(SK_ACTIVE_TAB, 'ALL');
    const saveActiveTab  = (v) => Store.set(SK_ACTIVE_TAB, v);
    const loadAvatarOnly = () => Store.get(SK_AVATAR_ONLY, false);
    const saveAvatarOnly = (v) => Store.set(SK_AVATAR_ONLY, !!v);

    const defaultGeom = { left: '', top: '75px', right: '14px', width: '235px', height: 'auto' };
    const loadGeom  = () => {
      const g = Store.get(SK_GEOM, defaultGeom);
      if (!g || typeof g !== 'object') return defaultGeom;
      if (g.width === '310px' && g.height === '80vh') return { ...g, width: defaultGeom.width, height: defaultGeom.height };
      return g;
    };
    const saveGeom  = (g) => Store.set(SK_GEOM, g);

    /* ---------- Avatar Cache ---------- */
    const AV_IDX_KEY = 'fb_pp_av_index';
    const avStoreKey = (k) => 'fb_pp_av_' + String(k).replace(/[^a-z0-9.]/gi, (c) => '_' + c.charCodeAt(0).toString(16) + '_');
    let avatarCache = {};
    let avatarIds   = {};
    let avatarFail  = normObj(Store.get(SK_AV_FAIL, {}));
    const dirtyAv = new Set();
    const deletedAv = new Set();

    function getPhotoIdFromUrl(url) {
      if (!url || typeof url !== 'string' || isDataUrl(url)) return '';
      const m = url.match(/\/(\d+_\d+_\d+_n\.(?:jpg|png|webp))/i) || url.match(/\/([^\/?#]+\.(?:jpg|png|webp))/i);
      return m ? m[1] : url.split(/[?#]/)[0];
    }

    function isValidPageAvatar(url) {
      if (!url || typeof url !== 'string' || url === 'NONE' || isDataUrl(url)) return false;
      if (!/(scontent|fbcdn\.net)/i.test(url)) return false;
      if (/rsrc\.php|fb_icon|facebook\.com\/images|safe_image\.php|static\.xx\./i.test(url)) return false;
      return true;
    }

    function isUsableCached(key, val) {
      if (!val || typeof val !== 'string') return false;
      if (isDataUrl(val)) return true;
      return isValidPageAvatar(val);
    }

    function lookupCachedEntry(it) {
      const keys = [avatarKey(it), entryToSlug(it.name), it.name.toLowerCase()];
      for (const k of keys) { if (k && avatarCache[k]) return [k, avatarCache[k]]; }
      return null;
    }

    let flushTimer = null;
    function scheduleFlush(ms) {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flushAvatars, ms === undefined ? 400 : ms);
    }
    function setAvatar(k, v, id) {
      avatarCache[k] = v; avatarIds[k] = id || '';
      dirtyAv.add(k); deletedAv.delete(k);
      if (isDataUrl(v)) AvatarDB.put(k, { v, id: id || '' });
      scheduleFlush();
    }
    function dropAvatar(k) {
      if (!(k in avatarCache)) return;
      delete avatarCache[k]; delete avatarIds[k];
      dirtyAv.delete(k); deletedAv.add(k);
      AvatarDB.del(k);
      scheduleFlush();
    }
    function flushAvatars() {
      clearTimeout(flushTimer); flushTimer = null;
      try {
        dirtyAv.forEach(k => { const v = avatarCache[k]; if (v) Store.set(avStoreKey(k), { k, v, id: avatarIds[k] || '' }); });
        deletedAv.forEach(k => Store.remove(avStoreKey(k)));
      } catch (_) {}
      dirtyAv.clear(); deletedAv.clear();
      Store.set(SK_AV_FAIL, avatarFail);
      if (!isSyncing) updateSyncButtonLabel();
    }

    window.addEventListener('pagehide', flushAvatars);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAvatars(); });

    function drawToDataUrl(img) {
      try {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) return null;
        const s = Math.min(w, h);
        const out = Math.min(AV_MAX_PX, s);
        const c = document.createElement('canvas');
        c.width = out; c.height = out;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out, out);
        ctx.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, out, out);
        return c.toDataURL('image/jpeg', 0.78);
      } catch (_) { return null; }
    }

    function blobToShrunkDataUrl(blob) {
      return new Promise(resolve => {
        let objUrl = '';
        try { objUrl = URL.createObjectURL(blob); } catch (_) { resolve(null); return; }
        const img = new Image();
        img.onload = () => { const d = drawToDataUrl(img); try { URL.revokeObjectURL(objUrl); } catch (_) {} resolve(d); };
        img.onerror = () => { try { URL.revokeObjectURL(objUrl); } catch (_) {} resolve(null); };
        img.src = objUrl;
      });
    }

    async function urlToDataUrl(url) {
      try {
        const res = await fetch(url, { credentials: 'omit', mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          const shrunk = await blobToShrunkDataUrl(blob);
          if (shrunk) return shrunk;
        }
      } catch (_) {}
      return null;
    }

    let convChain = Promise.resolve();
    const convSeen = new Set();
    function queueConversion(url) {
      if (!url || isDataUrl(url) || convSeen.has(url)) return;
      convSeen.add(url);
      convChain = convChain
        .then(async () => {
          const data = await urlToDataUrl(url);
          if (!isDataUrl(data)) return;
          const id = getPhotoIdFromUrl(url);
          Object.keys(avatarCache).forEach(k => {
            if (avatarCache[k] === url) setAvatar(k, data, id);
          });
        })
        .catch(() => {})
        .then(() => new Promise(r => setTimeout(r, 120)));
    }

    function cacheAvatar(k, url) {
      if (!k || !url || !isValidPageAvatar(url)) return;
      const key = k.toLowerCase();
      const id = getPhotoIdFromUrl(url);
      const cur = avatarCache[key];
      if (cur === url) return;
      if (isDataUrl(cur) && avatarIds[key] === id) return;
      delete avatarFail[key];
      setAvatar(key, url, id);
      broadcastAvatar(key, url);
      queueConversion(url);
    }

    async function restoreAvatars() {
      let changed = false;
      const adopt = (k, v, id) => {
        if (!k || typeof v !== 'string' || !v) return;
        const cur = avatarCache[k];
        if (cur === v) return;
        if (cur && isDataUrl(cur)) return;
        avatarCache[k] = v; avatarIds[k] = id || avatarIds[k] || '';
        changed = true;
      };

      try {
        const idbMap = await AvatarDB.loadAll();
        Object.keys(idbMap).forEach(k => { const r = idbMap[k]; if (r && isDataUrl(r.v)) adopt(k, r.v, r.id); });
      } catch (_) {}

      try {
        const idx = await Store.getAsync(AV_IDX_KEY, []);
        if (Array.isArray(idx)) {
          for (const sk of idx) {
            const r = await Store.getAsync(sk, null);
            if (r && typeof r === 'object' && r.k && typeof r.v === 'string') adopt(r.k, r.v, r.id);
          }
        }
      } catch (_) {}

      if (changed) renderList();
      updateSyncButtonLabel();
    }

    /* ---------- Google Search URL Extractor ---------- */
    function extractFirstFbUrlFromGoogle(html) {
      if (!html) return null;
      const regex = /(?:href=["'](?:\/url\?q=)?|url\?q=)(https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^"'>&\s]+)/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        let candidate = decodeURIComponent(match[1]);
        try {
          const u = new URL(candidate);
          const p = u.pathname;
          if (p && p !== '/' && !/^\/(login|recover|help|policies|directory|search|share|dialog|hashtag)($|\/|\?)/i.test(p)) {
            if (p.includes('profile.php')) {
              const id = u.searchParams.get('id');
              return id ? `${u.origin}/profile.php?id=${id}` : u.href;
            }
            return `${u.origin}${u.pathname}`;
          }
        } catch (_) {}
      }
      return null;
    }

    function fetchGoogleFirstResultUrl(name) {
      return new Promise((resolve) => {
        const q = `site:facebook.com ${name}`;
        const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;

        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) { resolved = true; resolve(null); }
        }, 1200);

        const onHtml = (html) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          const fbUrl = extractFirstFbUrlFromGoogle(html);
          resolve(fbUrl);
        };

        // A. WebToApp native fetch
        try {
          if (typeof hcj !== 'undefined' && hcj && typeof hcj.fetch === 'function') {
            hcj.fetch(url, { method: 'GET' })
              .then(res => res.text ? res.text() : (typeof res === 'string' ? res : ''))
              .then(html => onHtml(html))
              .catch(() => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); } });
            return;
          }
        } catch (_) {}

        // B. Tampermonkey / Violentmonkey cross-domain request
        try {
          const gmx = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest :
                      (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') ? GM.xmlHttpRequest : null;
          if (gmx) {
            gmx({
              method: 'GET',
              url: url,
              headers: { 'Accept': 'text/html' },
              onload: (res) => onHtml(res.responseText || ''),
              onerror: () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); } }
            });
            return;
          }
        } catch (_) {}

        // C. Standard fetch fallback
        try {
          fetch(url)
            .then(res => res.text())
            .then(html => onHtml(html))
            .catch(() => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); } });
          return;
        } catch (_) {}

        resolve(null);
      });
    }

    function entryToSlug(entry) {
      if (!entry) return '';
      const raw = entry.trim();
      const rawLower = raw.toLowerCase();
      if (SLUG_ALIASES.has(rawLower)) return SLUG_ALIASES.get(rawLower);

      return raw
        .replace(/^https?:\/\/(www\.|web\.|m\.)?facebook\.com\//i, '')
        .replace(/^@/, '')
        .split(/[/?#]/)[0]
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '');
    }

    function getCurrentSlug() {
      const p = window.location.pathname;
      const m = p.match(/^\/pages\/([^/?#]+)/i);
      const s = (m ? m[1] : p.replace(/^\//, '').split('/')[0]).toLowerCase().replace(/[^a-z0-9.]/g, '');
      return s && !['home', 'groups', 'watch', 'marketplace', 'messages', 'search'].includes(s) ? s : null;
    }

    async function navigateToGoogleTopResult(item) {
      const name = item.name;
      const key = name.toLowerCase().trim();

      // 1. Check local Google cache
      const gCache = normObj(Store.get(SK_GCACHE, {}));
      if (gCache[key]) {
        flushAvatars();
        window.location.href = gCache[key];
        return;
      }

      // 2. Direct URL check
      if (/^https?:\/\//i.test(item.raw)) {
        flushAvatars();
        window.location.href = item.raw;
        return;
      }

      // 3. Known Google alias check
      if (SLUG_ALIASES.has(key)) {
        const slug = SLUG_ALIASES.get(key);
        const target = slug.startsWith('profile.php') ? `${window.location.origin}/${slug}` : `${window.location.origin}/${slug}`;
        gCache[key] = target;
        Store.set(SK_GCACHE, gCache);
        flushAvatars();
        window.location.href = target;
        return;
      }

      // 4. Background Google Query
      const resolved = await fetchGoogleFirstResultUrl(name);
      if (resolved) {
        gCache[key] = resolved;
        Store.set(SK_GCACHE, gCache);
        flushAvatars();
        window.location.href = resolved;
        return;
      }

      // 5. Direct Google "I'm Feeling Lucky" redirect
      flushAvatars();
      const luckyUrl = `https://www.google.com/search?q=site:facebook.com+${encodeURIComponent(name)}&btnI=1`;
      window.location.href = luckyUrl;
    }

    function decodeFbUrl(s) {
      if (!s) return '';
      let out = s;
      try { out = JSON.parse('"' + s.replace(/"/g, '\\"') + '"'); }
      catch (_) { out = s.replace(/\\\//g, '/').replace(/\\u0025/g, '%').replace(/\\u0026/g, '&'); }
      return out.replace(/&amp;/g, '&');
    }

    function extractAvatarUrl(html) {
      const patterns = [
        /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
        /"profilePicLarge":\s*\{"uri":"([^"]+)"/,
        /"profile_picture":\s*\{"uri":"([^"]+)"/,
        /"profilePicMedium":\s*\{"uri":"([^"]+)"/
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m) {
          const u = decodeFbUrl(m[1]);
          if (isValidPageAvatar(u)) return u;
        }
      }
      return null;
    }

    function findItemFor(slug, name) {
      const s = (slug || '').toLowerCase();
      const n = (name || '').toLowerCase();
      return getAllItems().find(it =>
        (s && ((it.slug || '').toLowerCase() === s || entryToSlug(it.name) === s)) ||
        (n && it.name.toLowerCase() === n)
      ) || null;
    }

    function harvestAvatarsFromDOM() {
      let avatarSrc = null;
      const candidateSvgs = document.querySelectorAll('div[role="main"] svg, [data-pagelet="ProfileTilesFeed_0"] svg, .x1dus1kp svg, [data-pagelet="ProfileHeader"] svg');
      for (const svg of candidateSvgs) {
        const rect = svg.getBoundingClientRect();
        if (rect.width >= 60 || svg.getAttribute('width') >= 60) {
          const img = svg.querySelector('image');
          if (img) {
            const src = img.getAttribute('xlink:href') || img.getAttribute('href');
            if (isValidPageAvatar(src)) {
              avatarSrc = src; break;
            }
          }
        }
      }

      if (!avatarSrc) {
        const mobileImgs = document.querySelectorAll('[data-mcomponent="ServerHeader"] img, div[role="heading"] img, header img, div[data-sigil="profile-header"] img');
        for (const img of mobileImgs) {
          if (isValidPageAvatar(img.src)) {
            avatarSrc = img.src; break;
          }
        }
      }

      if (!avatarSrc) {
        const og = document.querySelector('meta[property="og:image"]');
        const u = og && og.getAttribute('content');
        if (isValidPageAvatar(u)) avatarSrc = u.replace(/&amp;/g, '&');
      }

      const h1El = document.querySelector('div[role="main"] h1, h1');
      const h1Name = h1El ? h1El.textContent.trim() : '';
      const curSlug = getCurrentSlug();
      const item = findItemFor(curSlug, h1Name);

      if (item && curSlug && !curSlug.startsWith('search')) {
        const gCache = normObj(Store.get(SK_GCACHE, {}));
        const key = item.name.toLowerCase();
        if (!gCache[key]) {
          gCache[key] = `${window.location.origin}/${curSlug}`;
          Store.set(SK_GCACHE, gCache);
        }
      }

      if (!avatarSrc || !item) return;
      cacheAvatar((item.slug || entryToSlug(item.name) || item.name).toLowerCase(), avatarSrc);
    }

    function getAllItems() { return parsedGroups.flatMap(g => g.items); }

    function parsePlaylistText(text) {
      const lines = text.split(/\r?\n/);
      const groups = [];
      let curGroup = null;
      let curSubheader = '';

      function getGroup(title) {
        let g = groups.find(x => x.title.toLowerCase() === title.toLowerCase());
        if (!g) {
          const color = CATEGORY_COLORS[title.toLowerCase()] || '#1877f2';
          g = { id: 'grp_' + Math.random().toString(36).substr(2, 9), title, color, items: [] };
          groups.push(g);
        }
        return g;
      }

      for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line || line === '---' || line.startsWith('--- START') || line.startsWith('--- END')) continue;

        if (line.startsWith('## ')) {
          curGroup = getGroup(line.replace(/^##\s+/, '').trim());
          curSubheader = '';
        } else if (line.startsWith('### ')) {
          if (!curGroup) {
            curGroup = getGroup(line.replace(/^###\s+/, '').trim());
            curSubheader = '';
          } else {
            curSubheader = line.replace(/^###\s+/, '').trim();
          }
        } else if (line.startsWith('# ')) {
          curGroup = getGroup(line.replace(/^#\s+/, '').trim());
          curSubheader = '';
        } else {
          if (!curGroup) curGroup = getGroup('General');
          const name = line.replace(/^[-*+]\s+/, '').replace(/^https?:\/\/(www\.|web\.|m\.)?facebook\.com\//i, '').replace(/^@/, '');
          const slug = entryToSlug(name);
          curGroup.items.push({
            raw: line,
            name: name,
            slug: slug,
            subheader: curSubheader,
            color: curGroup.color
          });
        }
      }
      return groups.filter(g => g.items.length > 0);
    }

    function broadcastAvatar(k, url) {
      const key = k.toLowerCase();
      document.querySelectorAll(`.fb-pp-avatar-box`).forEach(box => {
        if (box.dataset.key === key || box.dataset.altKey === key) {
          const img = box.querySelector('.fb-pp-avatar-img');
          const ph = box.querySelector('.fb-pp-avatar-placeholder');
          if (img && ph) {
            img.src = url; img.style.display = 'block'; ph.style.display = 'none';
          }
        }
      });
    }

    async function fetchFacebookAvatar(slugPath) {
      if (!slugPath) return { notFound: true };
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 20000);
      try {
        const res = await fetch(`${location.origin}/${slugPath}`, {
          credentials: 'omit', redirect: 'follow', signal: ctrl.signal,
          headers: { 'Accept': 'text/html,application/xhtml+xml' }
        });
        if (!res.ok) return { notFound: true };

        let html = '';
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let total = 0;
          while (total < 900000) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            html += dec.decode(value, { stream: true });
            const found = extractAvatarUrl(html);
            if (found) { try { reader.cancel(); } catch (_) {} return { url: found }; }
          }
          try { reader.cancel(); } catch (_) {}
        } else {
          html = await res.text();
          const found = extractAvatarUrl(html);
          if (found) return { url: found };
        }
        return { notFound: true };
      } catch (_) {
        return { error: true };
      } finally {
        clearTimeout(timeout);
      }
    }

    function avatarKey(it) { return (it.slug || entryToSlug(it.name) || it.name).toLowerCase(); }
    function hasAvatar(it) {
      const e = lookupCachedEntry(it);
      return !!e && isUsableCached(e[0], e[1]);
    }
    function recentlyFailed(it) {
      const t = avatarFail[avatarKey(it)];
      return !!t && Date.now() - t < FAIL_RETRY_MS;
    }

    async function startAvatarBatchSync() {
      if (isSyncing) { syncAborted = true; return; }
      const items = getAllItems();
      if (!items.length) return;

      let missing = items.filter(it => !hasAvatar(it) && !recentlyFailed(it));
      if (!missing.length) {
        avatarFail = {}; Store.set(SK_AV_FAIL, {});
        missing = items.filter(it => !hasAvatar(it));
      }
      if (!missing.length) return;

      isSyncing = true; syncAborted = false; syncNote = '';
      const queue = [...missing];
      let completedCount = items.length - missing.length;
      const totalCount = items.length;

      updateSyncButtonLabel(completedCount, totalCount);

      async function worker() {
        while (queue.length > 0 && !syncAborted) {
          const it = queue.shift();
          if (!it) break;
          const key = avatarKey(it);
          const res = await fetchFacebookAvatar(it.slug || entryToSlug(it.name));

          if (res.url) {
            cacheAvatar(key, res.url);
          } else {
            avatarFail[key] = Date.now();
          }
          completedCount++;
          updateSyncButtonLabel(completedCount, totalCount);
          await new Promise(r => setTimeout(r, 350));
        }
      }

      await Promise.all([worker(), worker()]);
      isSyncing = false; syncAborted = false;
      flushAvatars();
      updateSyncButtonLabel();
    }

    function getAvatarStats() {
      const items = getAllItems();
      if (!items.length) return { cached: 0, total: 0 };
      return { cached: items.filter(hasAvatar).length, total: items.length };
    }

    function updateSyncButtonLabel(cur, tot) {
      const btn = document.getElementById('fb-pp-sync-btn');
      if (!btn) return;
      const stats = getAvatarStats();
      if (isSyncing) {
        const c = cur !== undefined ? cur : stats.cached;
        const t = tot !== undefined ? tot : stats.total;
        btn.textContent = `⏳ ${c}/${t}`;
        btn.style.background = 'rgba(24, 119, 242, 0.35)'; btn.style.borderColor = FB_BLUE;
      } else {
        btn.textContent = `⚡ Sync (${stats.cached}/${stats.total})`;
        btn.style.background = stats.cached === stats.total && stats.total > 0 ? 'rgba(24, 119, 242, 0.2)' : CARD_BG;
        btn.style.borderColor = stats.cached === stats.total && stats.total > 0 ? FB_BLUE : BTN_BORDER;
      }
    }

    function mkBtn(label, bg) {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        padding: '3px 7px', borderRadius: '16px', border: `1px solid ${BORDER_CLR}`,
        cursor: 'pointer', background: bg || CARD_BG, color: '#e4e6eb',
        fontSize: '11px', fontFamily: 'system-ui, sans-serif', lineHeight: '1.2',
        whiteSpace: 'nowrap', flexShrink: '0', transition: 'background .15s, border-color .15s'
      });
      return b;
    }

    function mkPill(label, isSelected, color, onClick) {
      const p = document.createElement('div');
      p.textContent = label;
      Object.assign(p.style, {
        padding: '3px 8px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer',
        fontWeight: isSelected ? '600' : '400', background: isSelected ? (color || FB_BLUE) : CARD_BG,
        color: isSelected ? '#ffffff' : '#71767b', border: `1px solid ${isSelected ? (color || FB_BLUE) : BORDER_CLR}`,
        transition: 'all 0.15s ease'
      });
      p.onclick = onClick;
      return p;
    }

    function styleDropdown(el) {
      Object.assign(el.style, {
        background: INPUT_BG, color: '#e4e6eb', border: `1px solid ${BORDER_CLR}`,
        borderRadius: '8px', padding: '2px 4px', fontSize: '11px', cursor: 'pointer', outline: 'none'
      });
    }

    function ensureSidebar() {
      if (document.getElementById('fb-pp-sidebar')) return;
      const geom = loadGeom();

      const sidebar = document.createElement('div');
      sidebar.id = 'fb-pp-sidebar';
      Object.assign(sidebar.style, {
        position: 'fixed', top: geom.top, left: geom.left || 'auto', right: geom.right,
        width: geom.width, height: (geom.height === 'auto' ? AUTO_H_VH + 'vh' : geom.height), minWidth: '170px', minHeight: '140px',
        background: SIDE_BG, color: '#e4e6eb', padding: '8px 10px', borderRadius: '16px',
        zIndex: '2147483645', display: loadVis() ? 'flex' : 'none', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)',
        border: `1px solid ${BORDER_CLR}`, fontSize: '13px', lineHeight: '1.5',
        resize: 'both', overflow: 'hidden', fontFamily: loadFFam(), isolation: 'isolate', boxSizing: 'border-box'
      });

      const hdr = document.createElement('div');
      hdr.style.cssText = `display:flex; align-items:center; padding-bottom:6px; margin-bottom:6px; border-bottom:1px solid ${BORDER_CLR}; gap:4px; cursor:move; flex-shrink:0; flex-wrap:wrap;`;

      const title = document.createElement('span');
      title.textContent = 'Playlist';
      title.style.cssText = 'flex:1; font-weight:700; color:#e4e6eb; font-size:13px; letter-spacing:.3px;';
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
      syncBtn.id = 'fb-pp-sync-btn';
      syncBtn.title = 'Fetch missing avatars';
      syncBtn.onclick = () => { syncNote = ''; startAvatarBatchSync(); };

      const avatarOnlyBtn = mkBtn(loadAvatarOnly() ? '👤 Only' : '👤 + 📝');
      if (loadAvatarOnly()) { avatarOnlyBtn.style.background = 'rgba(24, 119, 242, 0.25)'; avatarOnlyBtn.style.borderColor = FB_BLUE; }
      avatarOnlyBtn.onclick = () => {
        const next = !loadAvatarOnly();
        saveAvatarOnly(next);
        avatarOnlyBtn.textContent = next ? '👤 Only' : '👤 + 📝';
        avatarOnlyBtn.style.background = next ? 'rgba(24, 119, 242, 0.25)' : CARD_BG;
        avatarOnlyBtn.style.borderColor = next ? FB_BLUE : BTN_BORDER;
        renderList();
      };

      const cardModeBtn = mkBtn(loadCMode() ? '🎨 Cards: On' : '🎨 Cards: Off');
      cardModeBtn.onclick = () => {
        const next = !loadCMode();
        saveCMode(next);
        cardModeBtn.textContent = next ? '🎨 Cards: On' : '🎨 Cards: Off';
        renderList();
      };

      const isTab = loadTabMode();
      const tabBtn = mkBtn(isTab ? '📑 Tabs: ON' : '☰ Tabs: OFF', isTab ? 'rgba(24, 119, 242, 0.25)' : CARD_BG);
      tabBtn.onclick = () => {
        const next = !loadTabMode();
        saveTabMode(next);
        tabBtn.textContent = next ? '📑 Tabs: ON' : '☰ Tabs: OFF';
        tabBtn.style.background = next ? 'rgba(24, 119, 242, 0.25)' : CARD_BG;
        renderList();
      };

      const colBtn = mkBtn(loadCols() + ' Col' + (loadCols() > 1 ? 's' : ''));
      colBtn.onclick = () => {
        const c = (loadCols() % 5) + 1;
        saveCols(c); colBtn.textContent = c + ' Col' + (c > 1 ? 's' : '');
        renderList();
      };

      const clearBtn = mkBtn('Reset', '#7e0a0a');
      clearBtn.title = 'Reset to default list';
      clearBtn.onclick = () => {
        Store.remove(SK_DATA); Store.remove(SK_SCROLL); Store.remove(SK_IDX);
        parsedGroups = parsePlaylistText(RAW_FB_PLAYLIST);
        saveData(parsedGroups); currentIndex = -1; renderList();
      };

      hdr.append(title, uploadBtn, syncBtn, avatarOnlyBtn, cardModeBtn, tabBtn, colBtn, clearBtn);
      sidebar.appendChild(hdr);

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
      searchInput.type = 'text'; searchInput.placeholder = '🔍 Search pages...';
      Object.assign(searchInput.style, { flex: '1', minWidth: '0', background: 'transparent', border: 'none', outline: 'none', color: '#e4e6eb', fontSize: '11px', padding: '3px 2px' });
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
      tabBar.id = 'fb-pp-tab-bar';
      tabBar.style.cssText = `display:none; overflow-x:auto; white-space:nowrap; gap:5px; padding:4px 0 6px 0; border-bottom:1px solid ${BORDER_CLR}; scrollbar-width:none; flex-shrink:0;`;
      sidebar.appendChild(tabBar);

      const lc = document.createElement('div');
      lc.id = 'fb-pp-list';
      lc.style.cssText = 'flex:1; overflow-y:auto; overflow-x:hidden; padding-right:2px;';
      sidebar.appendChild(lc);

      document.documentElement.appendChild(sidebar);
      if (geom.height === 'auto') sidebar.dataset.autoH = '1';
      applyUIScale();

      const persistGeom = () => saveGeom({
        left: sidebar.style.left, top: sidebar.style.top, right: sidebar.style.right,
        width: sidebar.style.width, height: sidebar.dataset.autoH === '1' ? 'auto' : sidebar.style.height
      });

      sidebar.addEventListener('pointerup', () => setTimeout(() => {
        if (!/^calc/.test(sidebar.style.height)) sidebar.dataset.autoH = '0';
        persistGeom();
      }, 60));

      let isDragging = false, startX, startY, startLeft, startTop;
      const zoomOf = () => parseFloat(sidebar.style.zoom) || 1;
      hdr.onmousedown = (e) => {
        if (['button', 'select', 'input'].includes(e.target.tagName.toLowerCase())) return;
        isDragging = true; startX = e.clientX; startY = e.clientY;
        const z = zoomOf();
        const rect = sidebar.getBoundingClientRect();
        startLeft = rect.left / z; startTop = rect.top / z;
        sidebar.style.right = 'auto'; sidebar.style.left = startLeft + 'px'; sidebar.style.top = startTop + 'px';
        e.preventDefault();
      };
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const z = zoomOf();
        sidebar.style.left = Math.max(0, Math.min(startLeft + (e.clientX - startX) / z, window.innerWidth / z - 100)) + 'px';
        sidebar.style.top  = Math.max(0, Math.min(startTop + (e.clientY - startY) / z, window.innerHeight / z - 50)) + 'px';
      });
      document.addEventListener('mouseup', () => {
        if (isDragging) { isDragging = false; persistGeom(); }
      });

      updateSyncButtonLabel();
    }

    function renderList() {
      ensureSidebar();
      const sidebar = document.getElementById('fb-pp-sidebar');
      const tabBar  = document.getElementById('fb-pp-tab-bar');
      const lc      = document.getElementById('fb-pp-list');
      if (!sidebar || !lc) return;

      sidebar.style.display = loadVis() ? 'flex' : 'none';
      lc.innerHTML = ''; tabBar.innerHTML = '';

      if (!parsedGroups.length) {
        lc.innerHTML = '<div style="opacity:.45; padding:15px 4px; font-size:11px; color:#71767b; text-align:center;">(empty)</div>';
        tabBar.style.display = 'none'; updateSyncButtonLabel(); return;
      }

      const isTab = loadTabMode(), isAvOnly = loadAvatarOnly(), cardsOn = loadCMode(), cols = loadCols(), fSize = loadFSize(), curTab = loadActiveTab(), curSlug = getCurrentSlug();

      if (isTab) {
        tabBar.style.display = 'flex';
        const totalCount = getAllItems().length;
        tabBar.appendChild(mkPill(`All (${totalCount})`, curTab === 'ALL', FB_BLUE, () => { saveActiveTab('ALL'); renderList(); }));
        parsedGroups.forEach((grp, idx) => {
          tabBar.appendChild(mkPill(`${grp.title} (${grp.items.length})`, curTab === String(idx), grp.color, () => { saveActiveTab(String(idx)); renderList(); }));
        });
        const activeGroups = curTab === 'ALL' ? parsedGroups : (parsedGroups[+curTab] ? [parsedGroups[+curTab]] : parsedGroups);
        activeGroups.forEach(grp => renderGroupSection(grp, lc, cols, fSize, curSlug, isAvOnly, cardsOn, false));
      } else {
        tabBar.style.display = 'none';
        parsedGroups.forEach(grp => renderGroupSection(grp, lc, cols, fSize, curSlug, isAvOnly, cardsOn, true));
      }

      const savedScroll = Store.get(SK_SCROLL, 0);
      if (savedScroll) lc.scrollTop = +savedScroll;
      lc.onscroll = () => Store.set(SK_SCROLL, lc.scrollTop || 0);

      harvestAvatarsFromDOM();
      updateSyncButtonLabel();
    }

    function renderGroupSection(grp, container, cols, fSize, curSlug, isAvOnly, cardsOn, showHeader) {
      let items = grp.items;
      if (searchQuery) {
        items = items.filter(it => it.name.toLowerCase().includes(searchQuery) || it.slug.toLowerCase().includes(searchQuery) || it.subheader.toLowerCase().includes(searchQuery));
      }
      if (!items.length) return;

      const grpWrap = document.createElement('div');
      grpWrap.style.marginBottom = '10px';

      const categoryColor = grp.color || FB_BLUE;

      if (showHeader) {
        const banner = document.createElement('div');
        banner.style.cssText = `font-size:${Math.round(fSize * 1.15)}px; font-weight:700; color:${categoryColor}; padding:8px 4px 4px 4px; border-bottom:1px solid ${BORDER_CLR}; margin-top:6px; display:flex; justify-content:space-between; align-items:center;`;
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
        const resolved = entryToSlug(item.name);
        const isMatch = curSlug && (curSlug === item.slug || curSlug === resolved);
        const active = globalIdx === currentIndex || isMatch;

        const row = document.createElement('div');
        row.title = item.name;

        const assignedColor = item.color || categoryColor;
        let bg, fg, borderStyle;
        if (active) {
          bg = assignedColor; fg = '#ffffff'; borderStyle = `1px solid ${assignedColor}`;
        } else if (cardsOn) {
          bg = assignedColor + '1e'; fg = '#e4e6eb'; borderStyle = `1px solid ${assignedColor}40`;
        } else {
          bg = 'transparent'; fg = '#ccc'; borderStyle = cols === 1 ? '1px solid rgba(255,255,255,0.04)' : '1px solid transparent';
        }

        if (isAvOnly) {
          Object.assign(row.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px', borderRadius: '50%', cursor: 'pointer', background: 'transparent', boxSizing: 'border-box' });
        } else {
          Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '0.5em', minWidth: '0', padding: '4px 6px',
            cursor: 'pointer', background: bg, color: fg, fontWeight: active ? '700' : 'normal',
            borderRadius: '6px', fontSize: fSize + 'px', lineHeight: '1.35', boxSizing: 'border-box',
            border: borderStyle, marginBottom: '2px', transition: 'background .1s, border .1s'
          });
          row.onmouseenter = () => { if (!active) { row.style.background = assignedColor; row.style.color = '#fff'; } };
          row.onmouseleave = () => { if (!active) { row.style.background = bg; row.style.color = fg; } };
        }

        // Automatic Google Top Result Navigation
        row.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          saveIdx(globalIdx); renderList();
          navigateToGoogleTopResult(item);
        };

        const avatarBox = document.createElement('div');
        avatarBox.className = 'fb-pp-avatar-box';
        avatarBox.dataset.key = (item.slug || entryToSlug(item.name) || item.name).toLowerCase();
        avatarBox.dataset.altKey = item.name.toLowerCase();
        Object.assign(avatarBox.style, {
          width: '2.35em', height: '2.35em', minWidth: '2.35em', minHeight: '2.35em', borderRadius: '50%',
          background: '#3a3b3c', flexShrink: '0', overflow: 'hidden', position: 'relative', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: active && isAvOnly ? `0 0 0 2.5px ${assignedColor}, 0 0 10px ${assignedColor}` : '0 1px 3px rgba(0,0,0,0.5)'
        });

        const placeholder = document.createElement('span');
        placeholder.className = 'fb-pp-avatar-placeholder';
        placeholder.textContent = (item.name.replace(/^[@https?://]+/, '')[0] || 'F').toUpperCase();
        placeholder.style.cssText = 'font-size:0.9em; font-weight:700; color:#aaa; user-select:none; line-height:1;';

        const img = document.createElement('img');
        img.className = 'fb-pp-avatar-img';
        img.style.cssText = 'width:100%; height:100%; object-fit:cover; border-radius:50%; display:none;';

        const cacheKey = (item.slug || entryToSlug(item.name) || item.name).toLowerCase();
        img.onerror = () => {
          img.style.display = 'none';
          placeholder.style.display = '';
          const cur = img.getAttribute('src') || '';
          if (isDataUrl(cur)) return;
          [cacheKey, item.name.toLowerCase(), entryToSlug(item.name)].forEach(kk => {
            if (kk && avatarCache[kk] === cur) dropAvatar(kk);
          });
          delete avatarFail[cacheKey];
        };

        avatarBox.append(placeholder, img);

        const entry = lookupCachedEntry(item);
        if (entry && isUsableCached(entry[0], entry[1])) {
          img.src = entry[1]; img.style.display = 'block'; placeholder.style.display = 'none';
        }

        row.appendChild(avatarBox);

        if (!isAvOnly) {
          const textSpan = document.createElement('span');
          textSpan.textContent = `${active ? '▶ ' : ''}${itemIdx + 1}. ${item.name}`;
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
      const sb = document.getElementById('fb-pp-sidebar');
      if (sb) {
        const show = sb.style.display === 'none';
        sb.style.display = show ? 'flex' : 'none';
        saveVis(show);
        if (show) renderList();
      }
    }

    return {
      ensureSidebar, renderList, toggleSidebar, startAvatarBatchSync, harvestAvatarsFromDOM,
      diagnose: async () => `Google cache: ${Object.keys(Store.get(SK_GCACHE, {})).length} resolved URLs.`,
      loadInitial: () => {
        const ver = Store.get(SK_SLUG_VER, '');
        const stored = loadData();
        if (!Array.isArray(stored) || !stored.length || ver !== 'v7_google_lucky') {
          parsedGroups = parsePlaylistText(RAW_FB_PLAYLIST);
          saveData(parsedGroups);
          Store.set(SK_SLUG_VER, 'v7_google_lucky');
        } else {
          parsedGroups = stored;
        }
        currentIndex = loadIdx();
        renderList();
        restoreAvatars();
      }
    };
  })();

  /* =========================================================================
   * MODULE 6: Unified Floating Launcher (FB Pro Over FB Playlist)
   * ========================================================================= */
  function applyLauncherScale(sz) {
    const wrap = document.getElementById('fb-controls-wrap');
    if (!wrap) return;
    const size = sz || Store.get('fbp_settings_v2', null)?.mainBtnSize || 42;
    const btnHeight = Math.round(size * 0.77);
    const iconSize = Math.round(size * 0.38);

    wrap.style.width = size + 'px';
    wrap.querySelectorAll('button').forEach(btn => {
      btn.style.width = size + 'px';
      btn.style.height = btnHeight + 'px';
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', iconSize);
        svg.setAttribute('height', iconSize);
      }
    });
  }

  function mountFloatingWidget() {
    if (document.getElementById('fb-controls-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'fb-controls-wrap';
    Object.assign(wrap.style, {
      position: 'fixed', bottom: '85px', right: '14px', zIndex: '2147483647',
      display: 'flex', flexDirection: 'column', gap: '2px', width: '42px',
      userSelect: 'none', touchAction: 'none'
    });

    const savedPos = Store.get('fb_ctrl_btnpos', null);
    if (savedPos && savedPos.top && savedPos.right) {
      wrap.style.top = savedPos.top; wrap.style.right = savedPos.right; wrap.style.bottom = 'auto';
    }

    function makeBtn(svg, title) {
      const b = document.createElement('button');
      b.title = title; b.innerHTML = svg;
      Object.assign(b.style, {
        width: '42px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(24, 25, 26, 0.94)', border: '1px solid #3a3b3c', color: '#e4e6eb',
        cursor: 'pointer', outline: 'none', padding: '0', boxSizing: 'border-box'
      });
      return b;
    }

    const FB_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
    const LIST_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1877f2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.5" fill="#1877f2"/><circle cx="3.5" cy="12" r="1.5" fill="#1877f2"/><circle cx="3.5" cy="18" r="1.5" fill="#1877f2"/></svg>`;

    const proBtn = makeBtn(FB_ICON_SVG, 'FB Pro Settings');
    proBtn.style.borderRadius = '8px 8px 3px 3px';
    proBtn.onclick = () => FBPro.togglePanel();

    const plBtn = makeBtn(LIST_SVG, 'FB Playlist');
    plBtn.style.borderRadius = '3px 3px 8px 8px';
    plBtn.onclick = () => FBPlaylist.toggleSidebar();

    wrap.append(proBtn, plBtn);
    document.documentElement.appendChild(wrap);

    const sz = Store.get('fbp_settings_v2', null)?.mainBtnSize || 42;
    applyLauncherScale(sz);

    let isDrag = false, didMove = false, sx, sy, origT, origR, ptrId = null;
    wrap.addEventListener('pointerdown', (e) => {
      isDrag = false; didMove = false; ptrId = e.pointerId;
      sx = e.clientX; sy = e.clientY;
      const rect = wrap.getBoundingClientRect();
      origT = rect.top; origR = window.innerWidth - rect.right;
      wrap.setPointerCapture(e.pointerId);
    });

    wrap.addEventListener('pointermove', (e) => {
      if (e.pointerId !== ptrId) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!isDrag && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) { isDrag = true; didMove = true; }
      if (isDrag) {
        wrap.style.top = Math.max(0, Math.min(window.innerHeight - 70, origT + dy)) + 'px';
        wrap.style.right = Math.max(0, Math.min(window.innerWidth - 45, origR - dx)) + 'px';
        wrap.style.bottom = 'auto';
      }
    });

    wrap.addEventListener('pointerup', (e) => {
      if (e.pointerId !== ptrId) return;
      try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
      if (didMove) {
        Store.set('fb_ctrl_btnpos', { top: wrap.style.top, right: wrap.style.right });
      }
      isDrag = false; didMove = false; ptrId = null;
    });

    wrap.addEventListener('click', (e) => {
      if (didMove) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  /* =========================================================================
   * INITIALIZATION
   * ========================================================================= */
  const init = () => {
    FBPlaylist.loadInitial();
    mountFloatingWidget();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
