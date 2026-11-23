// --- Early Adblock + Popunder Blocker + Gap Collapser ---
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

  // Block ad popunders from hijacking the main window
  const origOpen = window.open;
  window.open = function (url, target, features) {
    if (!url || isAdUrl(String(url))) return null;
    return origOpen ? origOpen.call(window, url, target, features) : null;
  };

  // Block fake notification permission prompts
  try {
    if (window.Notification) {
      Notification.requestPermission = async () => "denied";
    }
  } catch (e) {}

  // Force _blank -> _self and block ad/hijack links
  document.addEventListener(
    "click",
    function (e) {
      const target = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!target) return;

      const href = target.getAttribute("href") || "";
      if (
        href.startsWith("intent://") ||
        href.startsWith("market://") ||
        href.includes("t.me/") ||
        isAdUrl(href)
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (target.target === "_blank") target.target = "_self";
    },
    true
  );

  // Early CSS ad-container hiding (including BBC / news sites)
  const AD_CSS = `
    [id^="ad-"], [class^="ad-"], [id*="google_ads"], ins.adsbygoogle,
    [class*="sponsor"], [id*="banner"], [class*="banner"],
    iframe[src*="doubleclick"], iframe[src*="googleads"],
    iframe[src*="adservice"], [data-ad-slot], [data-ad-unit],
    [data-testid*="ad-slot"], [data-component*="ad-slot"],
    [id*="bbccom"], [class*="bbccom"], [class*="dotcom-ad"],
    [aria-label="Advertisement"], [id^="div-gpt-ad"],
    .ad-container, .ad-wrapper, .ad-slot, .ad-banner, .ad-unit,
    [class*="-ad-"], [class*="-ads"], [class*="ads-"],
    [id*="mgid"], [class*="mgid"], [id*="taboola"], [class*="taboola"],
    [id*="outbrain"], [class*="outbrain"] {
      display: none !important;
      height: 0 !important;
      width: 0 !important;
      min-height: 0 !important;
      min-width: 0 !important;
      max-height: 0 !important;
      max-width: 0 !important;
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
    '[class*="dotcom-ad"], [aria-label="Advertisement"], [id*="mgid"], [id*="taboola"]';

  const SAFE_TAGS = new Set(["BODY", "HTML", "MAIN", "ARTICLE", "HEADER", "FOOTER", "NAV", "SECTION"]);
  const isEmptyOrAdLabel = (el) => {
    const txt = (el.textContent || "").trim().toLowerCase();
    return txt === "" || txt === "advertisement" || txt === "sponsored" || txt === "ad";
  };

  function sweepAds() {
    // Strip injected ad scripts/iframes added dynamically
    document.querySelectorAll("script[src], iframe[src]").forEach((el) => {
      if (isAdUrl(el.src)) el.remove();
    });

    document.querySelectorAll(AD_SELECTORS).forEach((ad) => {
      ad.style.setProperty("display", "none", "important");
      let cur = ad;
      // Walk up to 4 ancestor wrappers so black gap containers collapse completely
      for (let i = 0; i < 4; i++) {
        const p = cur.parentElement;
        if (!p || SAFE_TAGS.has(p.tagName)) break;
        if (isEmptyOrAdLabel(p)) {
          p.style.setProperty("display", "none", "important");
          p.style.setProperty("height", "0", "important");
          p.style.setProperty("min-height", "0", "important");
          p.style.setProperty("margin", "0", "important");
          p.style.setProperty("padding", "0", "important");
          cur = p;
        } else {
          break;
        }
      }
    });
  }

  function startObserver() {
    injectAdCSS();
    if (!document.body || window.__adGapObserver) return;
    sweepAds();
    window.__adGapObserver = new MutationObserver(sweepAds);
    window.__adGapObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.head || document.documentElement) injectAdCSS();
  if (document.body) startObserver();
  else window.addEventListener("DOMContentLoaded", startObserver, { once: true });
})();
