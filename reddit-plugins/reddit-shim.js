// --- Pake / WebView Compatibility Shim for Reddit ---
window.unsafeWindow = window;

function GM_setValue(key, val) {
  try {
    localStorage.setItem("rd_toolkit_" + key, JSON.stringify(val));
  } catch (e) {}
}

function GM_getValue(key, defaultVal) {
  try {
    const raw = localStorage.getItem("rd_toolkit_" + key);
    return raw !== null ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function GM_deleteValue(key) {
  try {
    localStorage.removeItem("rd_toolkit_" + key);
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
  const controller = new AbortController();
  fetch(details.url, {
    method: details.method || "GET",
    headers: details.headers || {},
    body: details.data || undefined,
    signal: controller.signal,
  })
    .then(async (res) => {
      const responseText = await res.text();
      let response = responseText;
      if (details.responseType === "json") {
        try { response = JSON.parse(responseText); } catch (e) { response = null; }
      }
      if (details.onload) {
        details.onload({
          status: res.status,
          statusText: res.statusText,
          finalUrl: res.url,
          responseText,
          response,
          responseHeaders: [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\r\n"),
        });
      }
    })
    .catch((err) => {
      if (details.onerror) details.onerror(err);
    });
  return { abort: () => controller.abort() };
}
