// --- Pake Shim + Rust proxy_http + Disk Key Persistence for Reddit ---
const __PAKE_INVOKE__ =
  (typeof __TAURI__ !== "undefined" && __TAURI__?.core?.invoke) ||
  window.__TAURI__?.core?.invoke ||
  window.__TAURI_INTERNALS__?.invoke ||
  null;

window.unsafeWindow = window;

const __origSetItem = Storage.prototype.setItem;
const __origRemoveItem = Storage.prototype.removeItem;
const __KV_CACHE__ = {};

const isPluginKey = (k) =>
  /api|key|token|secret|model|voice|tts|explain|olympus|summary|summaries|toolkit|reddit|rpp|rd_toolkit/i.test(
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
    })
    .catch(() => {});
}

function GM_setValue(key, val) {
  try {
    __origSetItem.call(window.localStorage, "rd_toolkit_" + key, JSON.stringify(val));
  } catch (e) {}
  syncToDisk("gm_" + key, val);
}

function GM_getValue(key, defaultVal) {
  if (Object.prototype.hasOwnProperty.call(__KV_CACHE__, "gm_" + key)) {
    const cached = __KV_CACHE__["gm_" + key];
    return cached !== null && cached !== undefined ? cached : defaultVal;
  }
  try {
    const raw = window.localStorage.getItem("rd_toolkit_" + key);
    return raw !== null ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function GM_deleteValue(key) {
  try {
    __origRemoveItem.call(window.localStorage, "rd_toolkit_" + key);
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
};
