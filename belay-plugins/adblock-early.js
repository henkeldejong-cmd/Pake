// --- Early Adblock + Cookie Auto-Accept + Sign-in Nag Hider + Anti-Hijack ---
(function () {
  if (window.__pakeEarlyAdblockLoaded) return;
  window.__pakeEarlyAdblockLoaded = true;

  const AD_HOSTS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
    "adservice.google.", "taboola.com", "outbrain.com", "mgid.com",
    "revcontent.com", "criteo.com", "adnxs.com", "amazon-adsystem.com",
    "pubmatic.com", "rubiconproject.com", "adsterra", "monetag",
    "propellerads", "popads.net", "popcash.net", "onclickalgo",
    "melbet", "1xbet", "exoclick", "juicyads", "trafficjunky"
  ];
  const isAdUrl = (u) => {
    if (!u || typeof u !== "string") return false;
    const low = u.toLowerCase();
    return AD_HOSTS.some((h) => low.includes(h));
  };

  // Return a dummy window on blocked popunders so anti-adblock scripts (e.g. pahe.ink) don't redirect to Google
  const dummyPopup = (u) => ({
    closed: false,
    focus() {},
    blur() {},
    close() {},
    postMessage() {},
    location: { href: String(u || "") },
    document: { write() {}, close() {}, open() {} },
  });

  const origOpen = window.open;
  window.open = function (url, target, features) {
    if (!url || isAdUrl(String(url))) return dummyPopup(url);
    return origOpen ? origOpen.call(window, url, target, features) : dummyPopup(url);
  };

  try {
    if (window.Notification) Notification.requestPermission = async () => "denied";
  } catch (e) {}

  document.addEventListener(
    "click",
    function (e) {
      const target = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!target) return;
      const href = target.getAttribute("href") || "";
      if (href.startsWith("intent://") || href.startsWith("market://") || href.includes("t.me/") || isAdUrl(href)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (target.target === "_blank") target.target = "_self";
    },
    true
  );

  // Strict ad/paywall-nag CSS (NO broad *banner* / *sponsor* wildcards that hide real page content)
  const AD_CSS = `
    [id^="ad-"], [class^="ad-"], [id*="google_ads"], ins.adsbygoogle,
    iframe[src*="doubleclick"], iframe[src*="googleads"], iframe[src*="adservice"],
    [data-ad-slot], [data-ad-unit], [data-ad-name],
    [data-testid*="ad-slot"], [data-component*="ad-slot"],
    [id*="bbccom"], [class*="bbccom"], [class*="dotcom-ad"],
    fbs-ad, [class*="fbs-ad"], [class*="ad-rail"],
    [aria-label="Advertisement"], [id^="div-gpt-ad"],
    .ad-container, .ad-wrapper, .ad-slot, .ad-banner, .ad-unit,
    [id*="mgid"], [class*="mgid"], [id*="taboola"], [class*="taboola"],
    [id*="outbrain"], [class*="outbrain"],
    /* Bottom sign-in / subscribe nags & Google One-Tap */
    #credential_picker_container, iframe[src*="accounts.google.com/gsi/iframe"],
    .tp-modal, .tp-backdrop, [class*="piano-offer"], [id*="piano-bottom"],
    [class*="subscribe-banner"], [class*="signin-banner"], [data-testid*="bottom-banner"] {
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      overflow: hidden !important;
    }
  `;

  function injectAdCSS() {
    if (document.getElementById("custom-adblock-css")) return;
    const parent = document.head || document.documentElement;
    if (!parent) return;
    const style = document.createElement("style");
    style.id = "custom-adblock-css";
    style.textContent = AD_CSS;
    parent.appendChild(style);
  }

  const AD_SELECTORS =
    'ins.adsbygoogle, iframe[src*="doubleclick"], iframe[src*="googleads"], ' +
    '[id^="div-gpt-ad"], [class*="ad-container"], [class*="ad-wrapper"], ' +
    '[class*="ad-slot"], [class*="adsbygoogle"], [data-ad-slot], [data-ad-unit], ' +
    '[data-testid*="ad-slot"], [data-component*="ad-slot"], [id*="bbccom"], ' +
    '[class*="dotcom-ad"], fbs-ad, [class*="fbs-ad"], [aria-label="Advertisement"]';

  const SAFE_TAGS = new Set(["BODY", "HTML", "MAIN", "ARTICLE", "HEADER", "FOOTER", "NAV"]);
  const isEmptyOrAdLabel = (el) => {
    const txt = (el.textContent || "").trim().toLowerCase();
    return txt === "" || txt === "advertisement" || txt === "sponsored" || txt === "ad";
  };

  function collapseNode(el) {
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("height", "0", "important");
    el.style.setProperty("min-height", "0", "important");
    el.style.setProperty("margin", "0", "important");
    el.style.setProperty("padding", "0", "important");
  }

  function sweepAds() {
    document.querySelectorAll("script[src], iframe[src]").forEach((el) => {
      if (isAdUrl(el.src)) el.remove();
    });

    document.querySelectorAll(AD_SELECTORS).forEach((ad) => {
      collapseNode(ad);
      let cur = ad;
      for (let i = 0; i < 5; i++) {
        const p = cur.parentElement;
        if (!p || SAFE_TAGS.has(p.tagName)) break;
        if (isEmptyOrAdLabel(p)) {
          collapseNode(p);
          cur = p;
        } else break;
      }
    });

    // Collapse Forbes-style standalone "ADVERTISEMENT" wrapper blocks
    document.querySelectorAll("div, span, p").forEach((el) => {
      if (el.children.length === 0 && (el.textContent || "").trim().toUpperCase() === "ADVERTISEMENT") {
        let cur = el;
        for (let i = 0; i < 4; i++) {
          const p = cur.parentElement;
          if (!p || SAFE_TAGS.has(p.tagName)) break;
          if (isEmptyOrAdLabel(p)) {
            collapseNode(p);
            cur = p;
          } else break;
        }
      }
    });

    // Hide fixed bottom sign-in / subscribe banners (like Vox yellow footer)
    document.querySelectorAll("div, aside, section").forEach((el) => {
      if (el.id === "__pake-nav-menu" || el.id === "__pake-nav-fab") return;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom >= window.innerHeight - 20 && rect.width > window.innerWidth * 0.6 && rect.height > 70 && rect.height < 360) {
        const txt = (el.textContent || "").toLowerCase();
        if (/subscribe|claim your offer|unlimited access|sign in|create an account|log in to continue/.test(txt)) {
          collapseNode(el);
        }
      }
    });
  }

  // Auto-accept standard cookie consent banners
  const COOKIE_ACCEPT_SELECTORS = [
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#accept-recommended-btn-handler",
    ".qc-cmp2-summary-buttons button[mode='primary']",
    "[id^='sp_message'] button.sp_choice_type_11",
    "button[data-testid='accept-all']",
    "button[aria-label*='Accept all' i]",
    "button[aria-label*='Accept cookies' i]",
  ];
  let cookieChecks = 0;
  function tryAcceptCookies() {
    for (const sel of COOKIE_ACCEPT_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return;
      }
    }
    if (++cookieChecks < 6) setTimeout(tryAcceptCookies, 1200);
  }

  function startObserver() {
    injectAdCSS();
    if (!document.body || window.__adGapObserver) return;
    sweepAds();
    tryAcceptCookies();
    window.__adGapObserver = new MutationObserver(sweepAds);
    window.__adGapObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.head || document.documentElement) injectAdCSS();
  if (document.body) startObserver();
  else window.addEventListener("DOMContentLoaded", startObserver, { once: true });
})();
