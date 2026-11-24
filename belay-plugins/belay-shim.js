// --- Pake Shim + Disk Key Persistence + Bottom-Right Navigator ---
const __PAKE_INVOKE__ =
  (typeof __TAURI__ !== "undefined" && __TAURI__?.core?.invoke) ||
  window.__TAURI__?.core?.invoke ||
  window.__TAURI_INTERNALS__?.invoke ||
  null;

const __PAKE_SHELL_OPEN__ =
  (typeof __TAURI__ !== "undefined" && __TAURI__?.shell?.open) ||
  window.__TAURI__?.shell?.open ||
  null;

window.unsafeWindow = window;

const __origSetItem = Storage.prototype.setItem;
const __origRemoveItem = Storage.prototype.removeItem;
const __KV_CACHE__ = {};

const isPluginKey = (k) =>
  /api|key|token|secret|model|voice|tts|explain|olympus|summary|summaries|toolkit|belay|refined_dark|bypp|bypass/i.test(
    String(k)
  );

function syncToDisk(key, val) {
  __KV_CACHE__[key] = val;
  if (__PAKE_INVOKE__) {
    __PAKE_INVOKE__("kv_set", { key, value: val === undefined ? null : val }).catch(() => {});
  }
}

Storage.prototype.setItem = function (k, v) {
  __origSetItem.call(this, k, v);
  if (this === window.localStorage && isPluginKey(k)) {
    syncToDisk("ls_" + k, String(v));
  }
};
Storage.prototype.removeItem = function (k) {
  __origRemoveItem.call(this, k);
  if (this === window.localStorage && isPluginKey(k)) {
    syncToDisk("ls_" + k, null);
  }
};

if (__PAKE_INVOKE__) {
  __PAKE_INVOKE__("kv_load")
    .then((map) => {
      if (!map || typeof map !== "object") return;
      for (const [k, v] of Object.entries(map)) {
        __KV_CACHE__[k] = v;
        if (k.startsWith("ls_") && typeof v === "string") {
          try {
            __origSetItem.call(window.localStorage, k.slice(3), v);
          } catch (e) {}
        }
      }
      if (location.hostname === "tauri.localhost" || location.pathname.includes("Belay_Homepage")) {
        syncToDisk("__belay_home_url", location.href);
      }
    })
    .catch(() => {});
}

function GM_setValue(key, val) {
  try {
    __origSetItem.call(window.localStorage, "belay_toolkit_" + key, JSON.stringify(val));
  } catch (e) {}
  syncToDisk("gm_" + key, val);
}

function GM_getValue(key, defaultVal) {
  if (Object.prototype.hasOwnProperty.call(__KV_CACHE__, "gm_" + key)) {
    const cached = __KV_CACHE__["gm_" + key];
    return cached !== null && cached !== undefined ? cached : defaultVal;
  }
  try {
    const raw = window.localStorage.getItem("belay_toolkit_" + key);
    return raw !== null ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function GM_deleteValue(key) {
  try {
    __origRemoveItem.call(window.localStorage, "belay_toolkit_" + key);
  } catch (e) {}
  delete __KV_CACHE__["gm_" + key];
  syncToDisk("gm_" + key, null);
}

function GM_addStyle(css) {
  const inject = () => {
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.head || document.documentElement) inject();
  else window.addEventListener("DOMContentLoaded", inject, { once: true });
}

window.__pakeMenuCommands = [];
function GM_registerMenuCommand(name, fn) {
  window.__pakeMenuCommands.push({ name, fn });
}

function GM_xmlhttpRequest(details) {
  let aborted = false;
  const controller = new AbortController();

  const handleSuccess = (status, statusText, finalUrl, responseText, responseHeaders) => {
    if (aborted) return;
    let response = responseText;
    if (details.responseType === "json") {
      try { response = JSON.parse(responseText); } catch (e) { response = null; }
    }
    if (details.onload) {
      details.onload({ status, statusText, finalUrl, responseText, response, responseHeaders });
    }
  };

  if (__PAKE_INVOKE__) {
    __PAKE_INVOKE__("proxy_http", {
      req: {
        url: details.url,
        method: details.method || "GET",
        headers: details.headers || {},
        body:
          typeof details.data === "string"
            ? details.data
            : details.data != null
              ? String(details.data)
              : null,
      },
    })
      .then((res) =>
        handleSuccess(res.status, res.statusText, res.finalUrl, res.responseText, res.responseHeaders)
      )
      .catch((err) => {
        if (!aborted && details.onerror) {
          details.onerror({ status: 0, statusText: String(err), error: String(err) });
        }
      });
  } else {
    fetch(details.url, {
      method: details.method || "GET",
      headers: details.headers || {},
      body: details.data || undefined,
      signal: controller.signal,
    })
      .then(async (res) => {
        const text = await res.text();
        const hdrs = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\r\n");
        handleSuccess(res.status, res.statusText, res.url, text, hdrs);
      })
      .catch((err) => {
        if (!aborted && details.onerror) details.onerror(err);
      });
  }

  return { abort: () => { aborted = true; controller.abort(); } };
}

window.GM = {
  xmlHttpRequest: GM_xmlhttpRequest,
  getValue: async (k, d) => GM_getValue(k, d),
  setValue: async (k, v) => GM_setValue(k, v),
  deleteValue: async (k) => GM_deleteValue(k),
  addStyle: GM_addStyle,
  registerMenuCommand: GM_registerMenuCommand,
};

// Bottom-Right Hamburger Navigator (Click = Back | Hold = Home | Right-click = Menu)
(function initNavHamburger() {
  if (window !== window.top) return;

  const goHome = () => {
    const saved = __KV_CACHE__["__belay_home_url"] || "http://tauri.localhost/Belay_Homepage.html";
    window.location.href = saved;
  };

  const openInBrowser = () => {
    if (location.hostname === "tauri.localhost") return;
    const url = location.href;
    if (__PAKE_SHELL_OPEN__) {
      Promise.resolve(__PAKE_SHELL_OPEN__(url)).catch(() => {});
    } else if (__PAKE_INVOKE__) {
      __PAKE_INVOKE__("plugin:shell|open", { path: url }).catch(() => {});
    }
  };

  const mount = () => {
    if (document.getElementById("__pake-nav-fab")) return;

    const fab = document.createElement("button");
    fab.id = "__pake-nav-fab";
    fab.title = "Click: Back | Hold: Home | Right-click: Menu";
    fab.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
    fab.style.cssText =
      "position:fixed;right:18px;bottom:18px;width:40px;height:40px;border-radius:10px;" +
      "background:rgba(24,24,28,0.88);color:#fff;border:1px solid rgba(255,255,255,0.18);" +
      "display:flex;align-items:center;justify-content:center;cursor:pointer;" +
      "box-shadow:0 4px 14px rgba(0,0,0,0.45);z-index:2147483646;backdrop-filter:blur(6px);";

    const menu = document.createElement("div");
    menu.id = "__pake-nav-menu";
    menu.style.cssText =
      "position:fixed;right:18px;bottom:66px;min-width:195px;background:#1c1c22;color:#f1f1f4;" +
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
      item.onclick = () => {
        menu.style.display = "none";
        fn();
      };
      menu.appendChild(item);
    };

    addItem("🌙 Toggle Dark Theme", () => window.__refinedDarkToggle && window.__refinedDarkToggle());
    addItem("🌐 Open with Browser", openInBrowser);
    addItem("🏠 Belay Homepage", goHome);
    addItem("⬅️ Back", () => history.back());
    addItem("➡️ Forward", () => history.forward());
    addItem("🔄 Reload", () => location.reload());

    let holdTimer = null;
    let didHold = false;

    fab.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      didHold = false;
      holdTimer = setTimeout(() => {
        didHold = true;
        goHome();
      }, 500);
    });
    fab.addEventListener("mouseup", () => clearTimeout(holdTimer));
    fab.addEventListener("mouseleave", () => clearTimeout(holdTimer));

    fab.addEventListener("click", () => {
      menu.style.display = "none";
      if (!didHold) history.back();
    });

    fab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(holdTimer);
      menu.style.display = menu.style.display === "flex" ? "none" : "flex";
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
        menu.style.display = "none";
      }
    });

    document.body.appendChild(fab);
    document.body.appendChild(menu);
  };

  if (document.body) mount();
  else window.addEventListener("DOMContentLoaded", mount, { once: true });
})();
