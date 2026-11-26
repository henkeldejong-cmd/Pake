// --- Cloudflare-Safe Adblock + Lightweight Navigator for Sofascore ---
(() => {
  "use strict";
  if (window.self !== window.top) return;
  if (window.__sofascorePluginLoaded) return;
  window.__sofascorePluginLoaded = true;

  const __PAKE_INVOKE__ =
    (typeof __TAURI__ !== "undefined" && __TAURI__?.core?.invoke) ||
    window.__TAURI__?.core?.invoke ||
    window.__TAURI_INTERNALS__?.invoke ||
    null;

  const __PAKE_SHELL_OPEN__ =
    (typeof __TAURI__ !== "undefined" && __TAURI__?.shell?.open) ||
    window.__TAURI__?.shell?.open ||
    null;

  const isCloudflareChallenge = () =>
    location.hostname.includes("cloudflare") ||
    document.title.includes("Just a moment") ||
    !!document.getElementById("challenge-running") ||
    !!document.getElementById("cf-wrapper");

  const AD_CSS = `
    [id^="ad-"], [class^="ad-"], [id*="google_ads"], ins.adsbygoogle,
    iframe[src*="doubleclick"], iframe[src*="googleads"], iframe[src*="adservice"],
    [data-ad-slot], [data-ad-unit], [data-ad-name],
    [data-testid*="ad-slot"], [aria-label="Advertisement"], [id^="div-gpt-ad"],
    .ad-container, .ad-wrapper, .ad-slot, .ad-banner, .ad-unit {
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

  const AD_SELECTORS =
    'ins.adsbygoogle, iframe[src*="doubleclick"], iframe[src*="googleads"], ' +
    '[id^="div-gpt-ad"], [class*="ad-container"], [class*="ad-wrapper"], ' +
    '[class*="ad-slot"], [class*="adsbygoogle"], [data-ad-slot], [data-ad-unit], ' +
    '[data-testid*="ad-slot"], [aria-label="Advertisement"]';

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
    if (isCloudflareChallenge()) return;

    document.querySelectorAll(AD_SELECTORS).forEach((ad) => {
      collapseNode(ad);
      let cur = ad;
      for (let i = 0; i < 4; i++) {
        const p = cur.parentElement;
        if (!p || SAFE_TAGS.has(p.tagName)) break;
        if (isEmptyOrAdLabel(p)) {
          collapseNode(p);
          cur = p;
        } else break;
      }
    });

    // Collapse Sofascore's standalone "Advertisement" text blocks
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
  }

  function mountNavButton() {
    if (document.getElementById("__pake-nav-fab")) return;

    const fab = document.createElement("button");
    fab.id = "__pake-nav-fab";
    fab.title = "Click: Back | Right-click: Menu";
    fab.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
    fab.style.cssText =
      "position:fixed;right:18px;bottom:68px;width:38px;height:38px;border-radius:10px;" +
      "background:rgba(24,24,28,0.88);color:#fff;border:1px solid rgba(255,255,255,0.18);" +
      "display:flex;align-items:center;justify-content:center;cursor:pointer;" +
      "box-shadow:0 4px 14px rgba(0,0,0,0.45);z-index:2147483646;backdrop-filter:blur(6px);";

    const menu = document.createElement("div");
    menu.id = "__pake-nav-menu";
    menu.style.cssText =
      "position:fixed;right:18px;bottom:112px;min-width:185px;background:#1c1c22;color:#f1f1f4;" +
      "border:1px solid #35353f;border-radius:10px;padding:6px;display:none;flex-direction:column;" +
      "gap:4px;box-shadow:0 8px 24px rgba(0,0,0,0.55);z-index:2147483647;font:13px sans-serif;";

    const addItem = (label, fn) => {
      const item = document.createElement("button");
      item.textContent = label;
      item.style.cssText =
        "background:transparent;color:#f1f1f4;border:none;text-align:left;padding:8px 10px;" +
        "border-radius:6px;cursor:pointer;font:13px sans-serif;";
      item.onmouseenter = () => (item.style.background = "#2d2d37");
      item.onmouseleave = () => (item.style.background = "transparent");
      item.onclick = () => { menu.style.display = "none"; fn(); };
      menu.appendChild(item);
    };

    addItem("🌐 Open with Browser", () => {
      const url = location.href;
      if (__PAKE_SHELL_OPEN__) Promise.resolve(__PAKE_SHELL_OPEN__(url)).catch(() => {});
      else if (__PAKE_INVOKE__) __PAKE_INVOKE__("plugin:shell|open", { path: url }).catch(() => {});
    });
    addItem("🏠 Sofascore Home", () => (location.href = "https://www.sofascore.com"));
    addItem("⬅️ Back", () => history.back());
    addItem("➡️ Forward", () => history.forward());
    addItem("🔄 Reload", () => location.reload());

    fab.addEventListener("click", () => {
      menu.style.display = "none";
      history.back();
    });
    fab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.style.display = menu.style.display === "flex" ? "none" : "flex";
    });
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
        menu.style.display = "none";
      }
    });

    document.body.appendChild(fab);
    document.body.appendChild(menu);
  }

  let sweepTimer = null;
  function init() {
    if (isCloudflareChallenge()) {
      setTimeout(init, 1000);
      return;
    }

    if (!document.getElementById("custom-adblock-css")) {
      const style = document.createElement("style");
      style.id = "custom-adblock-css";
      style.textContent = AD_CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    if (!document.body) return;
    sweepAds();
    mountNavButton();

    if (!window.__sofascoreAdObserver) {
      window.__sofascoreAdObserver = new MutationObserver(() => {
        clearTimeout(sweepTimer);
        sweepTimer = setTimeout(sweepAds, 150);
      });
      window.__sofascoreAdObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
