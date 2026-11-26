// --- Safe Pake Shim for X (Iframe + Login-Page Guard + proxy_http + GM_* Persistence) ---
if (
  window.self !== window.top ||
  /^\/(i\/flow|login|logout|account|signup)/i.test(location.pathname)
) {
  throw new Error("[Pake] Skipping X plugins on iframe or login page");
}

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

const __KV_CACHE__ = {};

if (__PAKE_INVOKE__) {
  __PAKE_INVOKE__("kv_load")
    .then((map) => {
      if (!map || typeof map !== "object") return;
      for (const [k, v] of Object.entries(map)) {
        __KV_CACHE__[k] = v;
      }
    })
    .catch(() => {});
}

function syncToDisk(key, val) {
  __KV_CACHE__[key] = val;
  if (__PAKE_INVOKE__) {
    __PAKE_INVOKE__("kv_set", { key, value: val === undefined ? null : val }).catch(() => {});
  }
}

function GM_setValue(key, val) {
  try {
    localStorage.setItem("x_toolkit_" + key, JSON.stringify(val));
  } catch (e) {}
  syncToDisk("gm_" + key, val);
}

function GM_getValue(key, defaultVal) {
  if (Object.prototype.hasOwnProperty.call(__KV_CACHE__, "gm_" + key)) {
    const cached = __KV_CACHE__["gm_" + key];
    return cached !== null && cached !== undefined ? cached : defaultVal;
  }
  try {
    const raw = localStorage.getItem("x_toolkit_" + key);
    return raw !== null ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function GM_deleteValue(key) {
  try {
    localStorage.removeItem("x_toolkit_" + key);
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

function GM_openInTab(url) {
  if (__PAKE_SHELL_OPEN__) {
    Promise.resolve(__PAKE_SHELL_OPEN__(url)).catch(() => {});
  } else {
    window.open(url, "_blank");
  }
}

function GM_setClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(String(text)).catch(() => {});
  }
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
      details.onload({
        status,
        statusText,
        finalUrl,
        responseText,
        response,
        responseHeaders,
        readyState: 4,
      });
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
  openInTab: GM_openInTab,
  setClipboard: GM_setClipboard,
};
