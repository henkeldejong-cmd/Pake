// --- Translated from Android Reference Sections 7 & 8 ---
(function () {
  if (window.__pakeEarlyAdblockLoaded) return;
  window.__pakeEarlyAdblockLoaded = true;

  // Section 8 (i) & Section 7: Force _blank -> _self and block hijack schemes
  document.addEventListener(
    "click",
    function (e) {
      const target = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!target) return;

      const href = target.getAttribute("href") || "";
      if (
        href.startsWith("intent://") ||
        href.startsWith("market://") ||
        href.includes("t.me/")
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (target.target === "_blank") {
        target.target = "_self";
      }
    },
    true
  );

  // Section 8 (ii): Early CSS ad-container hiding
  const AD_CSS = `
    [id^="ad-"], [class^="ad-"], [id*="google_ads"], ins.adsbygoogle,
    [class*="sponsor"], [id*="banner"], [class*="banner"],
    iframe[src*="doubleclick"], iframe[src*="googleads"],
    iframe[src*="adservice"], [data-ad-slot], [data-ad-unit],
    [id^="div-gpt-ad"], .ad-container, .ad-wrapper, .ad-slot,
    .ad-banner, .ad-unit, [class*="-ad-"], [class*="-ads"],
    [class*="ads-"], [data-testid*="ad-"], [data-component*="ad-"],
    [id*="bbccom"], [class*="bbccom"], [class*="dotcom-ad"],
    [aria-label="Advertisement"] {
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

  // Section 8 (iii): Collapse empty ad parent containers
  const AD_SELECTORS =
    'ins.adsbygoogle, iframe[src*="doubleclick"], iframe[src*="googleads"], ' +
    '[id^="div-gpt-ad"], [class*="ad-container"], [class*="ad-wrapper"], ' +
    '[class*="ad-slot"], [class*="adsbygoogle"], [data-ad-slot], [data-ad-unit], ' +
    '[data-testid*="ad-"], [data-component*="ad-"], [id*="bbccom"], ' +
    '[class*="bbccom"], [class*="dotcom-ad"], [aria-label="Advertisement"]';

  function collapseAdGaps() {
    document.querySelectorAll(AD_SELECTORS).forEach(function (ad) {
      ad.style.display = "none";
      const p = ad.parentElement;
      if (
        p &&
        p.children.length === 1 &&
        p.textContent.trim() === "" &&
        !["BODY", "HTML", "MAIN", "ARTICLE", "HEADER", "FOOTER", "NAV"].includes(p.tagName)
      ) {
        p.style.margin = "0";
        p.style.padding = "0";
        p.style.minHeight = "0";
        p.style.display = "none";
      }
    });
  }

  function startObserver() {
    injectAdCSS();
    if (!document.body || window.__adGapObserver) return;
    collapseAdGaps();
    window.__adGapObserver = new MutationObserver(collapseAdGaps);
    window.__adGapObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.head || document.documentElement) injectAdCSS();
  if (document.body) startObserver();
  else window.addEventListener("DOMContentLoaded", startObserver, { once: true });
})();
