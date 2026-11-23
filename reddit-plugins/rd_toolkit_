// --- Pake / WebView Compatibility Shim ---
const __PAKE_INVOKE__ =
  (typeof __TAURI__ !== "undefined" && __TAURI__?.core?.invoke) ||
  window.__TAURI__?.core?.invoke ||
  window.__TAURI_INTERNALS__?.invoke ||
  null;

window.unsafeWindow = window;

function GM_setValue(key, val) {
  try {
    localStorage.setItem("belay_toolkit_" + key, JSON.stringify(val));
  } catch (e) {}
}

function GM_getValue(key, defaultVal) {
  try {
    const raw = localStorage.getItem("belay_toolkit_" + key);
    return raw !== null ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function GM_deleteValue(key) {
  try {
    localStorage.removeItem("belay_toolkit_" + key);
  } catch (e) {}
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
        console.error("[Pake proxy_http error]", details.url, err);
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

  return {
    abort: () => {
      aborted = true;
      controller.abort();
    },
  };
}

window.GM = {
  xmlHttpRequest: GM_xmlhttpRequest,
  getValue: async (k, d) => GM_getValue(k, d),
  setValue: async (k, v) => GM_setValue(k, v),
  deleteValue: async (k) => GM_deleteValue(k),
  addStyle: GM_addStyle,
  registerMenuCommand: GM_registerMenuCommand,
};
