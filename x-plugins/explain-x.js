// ==UserScript==
// @name         ExplainX (Desktop App Edition)
// @namespace    http://tampermonkey.net/
// @version      6.2.1
// @description  Modern, contextual text explanations and dictionary definitions. Adapted for Tauri/Pake desktop apps.
// @author       Gemini & You
// @match        *://*/*
// @match        file:///*
// @exclude      *://j-archive.com/*
// @exclude      *://tv247us.vip/*
// @exclude      *://*.cloudflare.com/*
// @connect      generativelanguage.googleapis.com
// @connect      openrouter.ai
// @connect      api.groq.com
// @connect      api.cerebras.ai
// @connect      api.dictionaryapi.dev
// @connect      en.wiktionary.org
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    /* ====================
       Desktop App GM_* Polyfills (YouTube Plugin Method + Pake Proxy Fallback)
       ==================== */
    const __PAKE_INVOKE__ =
        (typeof __TAURI__ !== 'undefined' && __TAURI__?.core?.invoke) ||
        window.__TAURI__?.core?.invoke ||
        window.__TAURI_INTERNALS__?.invoke ||
        null;

    if (typeof GM_addStyle === 'undefined') {
        window.GM_addStyle = css => {
            const s = document.createElement('style');
            s.textContent = css;
            (document.head || document.documentElement).appendChild(s);
            return s;
        };
    }

    if (typeof GM_getValue === 'undefined') {
        window.GM_getValue = (k, d) => {
            try {
                const r = localStorage.getItem(k);
                if (r === null) return d;
                try { return JSON.parse(r); } catch (_) { return r; }
            } catch (_) { return d; }
        };
    }

    if (typeof GM_setValue === 'undefined') {
        window.GM_setValue = (k, v) => {
            try {
                localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            } catch (_) {}
        };
    }

    if (typeof GM_deleteValue === 'undefined') {
        window.GM_deleteValue = (k) => {
            try { localStorage.removeItem(k); } catch (_) {}
        };
    }

    if (typeof GM_registerMenuCommand === 'undefined') {
        window.GM_registerMenuCommand = () => {};
    }

    // Override with YouTube Plugin fetch() method + Rust proxy_http fallback for strict-CSP sites
    window.GM_xmlhttpRequest = opts => {
        const ctrl = new AbortController();
        const to = opts.timeout ? setTimeout(() => ctrl.abort(), opts.timeout) : null;
        const init = { method: opts.method || 'GET', headers: opts.headers || {}, signal: ctrl.signal };
        if (opts.data) init.body = opts.data;

        const deliver = (status, statusText, text, finalUrl) => {
            let payload = text;
            if (opts.responseType === 'json') {
                try { payload = JSON.parse(text); } catch (_) { payload = null; }
            }
            if (opts.onload) {
                opts.onload({
                    status,
                    statusText,
                    responseText: text,
                    response: payload,
                    finalUrl: finalUrl || opts.url,
                    readyState: 4
                });
            }
        };

        fetch(opts.url, init)
            .then(res => {
                if (to) clearTimeout(to);
                return res.text().then(text => deliver(res.status, res.statusText, text, res.url));
            })
            .catch(err => {
                if (to) clearTimeout(to);
                if (err.name === 'AbortError') {
                    if (opts.ontimeout) opts.ontimeout();
                    return;
                }
                // Fallback to Rust proxy_http when a site's CSP/CORS blocks browser fetch()
                if (__PAKE_INVOKE__) {
                    __PAKE_INVOKE__('proxy_http', {
                        req: {
                            url: opts.url,
                            method: opts.method || 'GET',
                            headers: opts.headers || {},
                            body: typeof opts.data === 'string' ? opts.data : (opts.data != null ? String(opts.data) : null)
                        }
                    })
                    .then(r => deliver(r.status, r.statusText, r.responseText, r.finalUrl))
                    .catch(proxyErr => {
                        console.error('[ExplainX proxy_http error]', proxyErr);
                        if (opts.onerror) opts.onerror(proxyErr);
                    });
                } else {
                    if (opts.onerror) opts.onerror(err);
                }
            });

        return { abort: () => ctrl.abort() };
    };

    // --- STATE & CONFIGURATION ---
    let conversationHistory = [];
    let lastSelectionRects = null;
    let currentTypingId = 0;

    const MODEL_OPTIONS = {
        gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        openrouter: ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat', 'anthropic/claude-3.5-haiku'],
        groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant'],
        cerebras: ['gpt-oss-120b', 'llama3.1-8b', 'llama-3.3-70b']
    };

    const DEFAULTS = {
        apiProvider: 'gemini',
        geminiApiKey: '',
        geminiModel: 'gemini-2.5-flash-lite',
        openrouterApiKey: '',
        openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
        groqApiKey: '',
        groqModel: 'llama-3.3-70b-versatile',
        cerebrasApiKey: '',
        cerebrasModel: 'gpt-oss-120b',
        showExplainBtn: true,
        showDefineBtn: true,
        useWiktionary: true,
        useDictionaryApi: true,
        useAiFallback: true,
        typewriterExplain: true,
        typewriterDefine: false,
        fontSize: '15px',
        fontFamily: "system-ui, -apple-system, sans-serif",
        darkMode: true,
        compactMode: false,
        language: 'English',
        width: '450px',
        height: '500px',
        iconSize: 36,
        iconVertical: 'bottom',
        iconHorizontal: 'end',
        iconOffsetX: 0,
        iconOffsetY: 0,
        globalScale: 1.0,
        typewriterSpeed: 12,
        customX: null,
        customY: null
    };
    let settings = { ...DEFAULTS };

    // --- HTML & ASSETS ---
    const EX_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="purpleGradE" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#a855f7" /><stop offset="100%" stop-color="#6b21a8" /></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#purpleGradE)" /><text x="50" y="68" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="bold" font-size="65" fill="#ffffff" text-anchor="middle">e</text></svg>`;
    const EX_ICON_BASE64 = 'data:image/svg+xml;base64,' + btoa(EX_ICON_SVG);

    const DEF_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="purpleGradD" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#a855f7" /><stop offset="100%" stop-color="#6b21a8" /></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#purpleGradD)" /><text x="50" y="68" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="bold" font-size="65" fill="#ffffff" text-anchor="middle">d</text></svg>`;
    const DEF_ICON_BASE64 = 'data:image/svg+xml;base64,' + btoa(DEF_ICON_SVG);

    const SETTINGS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    const SUBMIT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    const CLOSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    const BACK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

    const POPUP_HTML = `
        <div id="ex-header">
            <div id="ex-header-title">
                <img id="ex-header-img" src="${EX_ICON_BASE64}"> <span id="ex-header-label">ExplainX</span>
                <span id="ex-header-settings-text" style="display: none; margin-left: 6px; font-weight: 500; color: var(--ex-text-muted);">&bull; Settings</span>
            </div>
            <div class="ex-header-controls">
                <button id="ex-settings-back-btn" class="ex-header-btn" title="Back" style="display: none;">${BACK_ICON_SVG}</button>
                <button id="ex-settings-btn" class="ex-header-btn" title="Settings">${SETTINGS_ICON_SVG}</button>
                <button id="ex-close-btn" class="ex-header-btn" title="Close">${CLOSE_ICON_SVG}</button>
            </div>
        </div>
        <div id="ex-main-view">
            <div id="ex-content-wrapper"></div>
            <div id="ex-footer">
                <div id="ex-followup-buttons">
                    <button class="ex-footer-btn" id="ex-simplify-btn">Say Less</button>
                    <button class="ex-footer-btn" id="ex-elaborate-btn">Say More</button>
                </div>
                <div id="ex-chat-input-wrapper">
                    <input type="text" id="ex-chat-input" name="ex-chat-${Math.random()}" placeholder="Ask a question..." autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" spellcheck="true">
                    <button id="ex-chat-submit">${SUBMIT_ICON_SVG}</button>
                </div>
            </div>
        </div>
        <div id="ex-settings-view" style="display: none;"></div>
    `;

    // --- SETTINGS MANAGEMENT ---
    async function loadSettings() {
        const raw = await GM_getValue('explainX_settings_json');
        let loaded = {};

        if (raw) {
            try { loaded = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { console.warn('ExplainX: Could not parse JSON settings'); }
        } else {
            loaded = await GM_getValue('explainX_settings') || {};
        }

        settings = { ...DEFAULTS, ...loaded };

        if (typeof settings.iconSize === 'string') settings.iconSize = parseInt(settings.iconSize, 10) || 36;
        if (typeof settings.globalScale === 'string') settings.globalScale = parseFloat(settings.globalScale) || 1.0;
        if (typeof settings.showExplainBtn === 'undefined') settings.showExplainBtn = true;
        if (typeof settings.showDefineBtn === 'undefined') settings.showDefineBtn = true;
        if (typeof settings.useWiktionary === 'undefined') settings.useWiktionary = true;
        if (typeof settings.useDictionaryApi === 'undefined') settings.useDictionaryApi = true;
        if (typeof settings.useAiFallback === 'undefined') settings.useAiFallback = true;
        if (typeof settings.typewriterExplain === 'undefined') settings.typewriterExplain = true;
        if (typeof settings.typewriterDefine === 'undefined') settings.typewriterDefine = false;

        if (settings.iconPosition) {
            settings.iconVertical = settings.iconPosition;
            delete settings.iconPosition;
            persistSettings();
        }

        if (settings.geminiModel === 'gemini-2.0-flash' || settings.geminiModel === '--') {
            settings.geminiModel = 'gemini-2.5-flash-lite';
            persistSettings();
        }
        applySettingsStyles();
    }

    async function persistSettings() {
        await GM_setValue('explainX_settings_json', JSON.stringify(settings));
    }

    async function saveSettings() {
        await persistSettings();
        applySettingsStyles();

        const toast = document.createElement('div');
        toast.className = 'ex-toast'; toast.textContent = 'Settings saved successfully!';
        document.getElementById('ex-popup-container').appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    function applySettingsStyles() {
        const container = document.getElementById('ex-popup-container');
        if (!container) return;
        container.classList.toggle('dark-mode', settings.darkMode);
        container.classList.toggle('ex-compact', settings.compactMode);
        container.style.setProperty('--font-family', settings.fontFamily);
        container.style.setProperty('--font-size', settings.fontSize);
        container.style.setProperty('--popup-width', settings.width);
        container.style.setProperty('--popup-max-height', settings.height);
        container.style.setProperty('--ex-scale', settings.globalScale);
    }

    function showSettingsPanel() {
        const popup = document.getElementById('ex-popup-container');
        const scale = parseFloat(settings.globalScale) || 1;

        popup.dataset.prevX = popup.style.left;
        popup.dataset.prevY = popup.style.top;
        popup.style.left = `${(window.innerWidth - (popup.offsetWidth * scale)) / 2}px`;
        popup.style.top = `${(window.innerHeight - (popup.offsetHeight * scale)) / 2}px`;

        document.getElementById('ex-main-view').style.display = 'none';
        const settingsView = document.getElementById('ex-settings-view');
        settingsView.style.display = 'flex';

        document.getElementById('ex-settings-btn').style.display = 'none';
        document.getElementById('ex-settings-back-btn').style.display = 'flex';
        document.getElementById('ex-header-settings-text').style.display = 'inline';

        const languages = ["English", "Spanish", "French", "German", "Chinese (Simplified)", "Japanese", "Russian", "Arabic", "Portuguese", "Hindi", "Amharic"];
        const fontFamilies = [
            "system-ui, -apple-system, sans-serif",
            "'Georgia', serif",
            "'Helvetica', sans-serif",
            "'Courier New', monospace",
            "'Arial', sans-serif",
            "'Times New Roman', serif",
            "'Bodoni MT', 'Bodoni 72', serif",
            "'Didot', serif",
            "'Inter', sans-serif",
            "'American Typewriter', 'Courier', monospace"
        ];
        const fontSizes = ["14px", "15px", "16px", "17px", "18px"];

        settingsView.innerHTML = `
            <div class="ex-settings-scroll-area">
                <div class="ex-settings-section-title">Button Visibility</div>
                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Show Explain ("e")</label><label class="ex-switch"><input type="checkbox" id="setting-show-explain" ${settings.showExplainBtn ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                    <div class="ex-setting"><label>Show Define ("d")</label><label class="ex-switch"><input type="checkbox" id="setting-show-define" ${settings.showDefineBtn ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                </div>

                <div class="ex-settings-section-title">Definition Sources Priority & Toggles</div>
                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Use Wiktionary (1st)</label><label class="ex-switch"><input type="checkbox" id="setting-use-wiktionary" ${settings.useWiktionary ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                    <div class="ex-setting"><label>Use Dictionary API (2nd)</label><label class="ex-switch"><input type="checkbox" id="setting-use-dictionary" ${settings.useDictionaryApi ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                </div>
                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Use AI Fallback (3rd)</label><label class="ex-switch"><input type="checkbox" id="setting-use-ai-fallback" ${settings.useAiFallback ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                    <div class="ex-setting"></div>
                </div>

                <div class="ex-settings-section-title">Typewriter Effect Controls</div>
                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Typewriter (Explain)</label><label class="ex-switch"><input type="checkbox" id="setting-typewriter-explain" ${settings.typewriterExplain ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                    <div class="ex-setting"><label>Typewriter (Define)</label><label class="ex-switch"><input type="checkbox" id="setting-typewriter-define" ${settings.typewriterDefine ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                </div>

                <div class="ex-settings-section-title">AI Settings</div>
                <div class="ex-setting"><label>AI Provider (Explain & Fallbacks)</label>
                    <select id="setting-provider">
                        <option value="gemini" ${settings.apiProvider === 'gemini' ? 'selected' : ''}>Gemini</option>
                        <option value="openrouter" ${settings.apiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                        <option value="groq" ${settings.apiProvider === 'groq' ? 'selected' : ''}>Groq</option>
                        <option value="cerebras" ${settings.apiProvider === 'cerebras' ? 'selected' : ''}>Cerebras</option>
                    </select>
                </div>

                <div id="gemini-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'gemini' ? 'flex' : 'none'};">
                    <div class="ex-setting"><label>Gemini API Key</label><div class="ex-api-key-wrapper"><input type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" id="setting-gemini-api-key" value="${settings.geminiApiKey}"><button class="setting-delete-key" data-target="setting-gemini-api-key">✕</button></div></div>
                    <div class="ex-setting"><label>Gemini Model</label>
                        <select id="setting-gemini-model-select">
                            ${MODEL_OPTIONS.gemini.map(m => `<option value="${m}" ${settings.geminiModel === m ? 'selected' : ''}>${m}</option>`).join('')}
                            <option value="custom" ${!MODEL_OPTIONS.gemini.includes(settings.geminiModel) ? 'selected' : ''}>Custom...</option>
                        </select>
                        <input type="text" id="setting-gemini-model" value="${settings.geminiModel}" style="margin-top: 4px;">
                    </div>
                </div>

                <div id="openrouter-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'openrouter' ? 'flex' : 'none'};">
                    <div class="ex-setting"><label>OpenRouter API Key</label><div class="ex-api-key-wrapper"><input type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" id="setting-openrouter-api-key" value="${settings.openrouterApiKey}"><button class="setting-delete-key" data-target="setting-openrouter-api-key">✕</button></div></div>
                    <div class="ex-setting"><label>OpenRouter Model</label>
                        <select id="setting-openrouter-model-select">
                            ${MODEL_OPTIONS.openrouter.map(m => `<option value="${m}" ${settings.openrouterModel === m ? 'selected' : ''}>${m}</option>`).join('')}
                            <option value="custom" ${!MODEL_OPTIONS.openrouter.includes(settings.openrouterModel) ? 'selected' : ''}>Custom...</option>
                        </select>
                        <input type="text" id="setting-openrouter-model" value="${settings.openrouterModel}" style="margin-top: 4px;">
                    </div>
                </div>

                <div id="groq-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'groq' ? 'flex' : 'none'};">
                    <div class="ex-setting"><label>Groq API Key</label><div class="ex-api-key-wrapper"><input type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" id="setting-groq-api-key" value="${settings.groqApiKey}"><button class="setting-delete-key" data-target="setting-groq-api-key">✕</button></div></div>
                    <div class="ex-setting"><label>Groq Model</label>
                        <select id="setting-groq-model-select">
                            ${MODEL_OPTIONS.groq.map(m => `<option value="${m}" ${settings.groqModel === m ? 'selected' : ''}>${m}</option>`).join('')}
                            <option value="custom" ${!MODEL_OPTIONS.groq.includes(settings.groqModel) ? 'selected' : ''}>Custom...</option>
                        </select>
                        <input type="text" id="setting-groq-model" value="${settings.groqModel}" style="margin-top: 4px;">
                    </div>
                </div>

                <div id="cerebras-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'cerebras' ? 'flex' : 'none'};">
                    <div class="ex-setting"><label>Cerebras API Key</label><div class="ex-api-key-wrapper"><input type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" id="setting-cerebras-api-key" value="${settings.cerebrasApiKey}"><button class="setting-delete-key" data-target="setting-cerebras-api-key">✕</button></div></div>
                    <div class="ex-setting"><label>Cerebras Model</label>
                        <select id="setting-cerebras-model-select">
                            ${MODEL_OPTIONS.cerebras.map(m => `<option value="${m}" ${settings.cerebrasModel === m ? 'selected' : ''}>${m}</option>`).join('')}
                            <option value="custom" ${!MODEL_OPTIONS.cerebras.includes(settings.cerebrasModel) ? 'selected' : ''}>Custom...</option>
                        </select>
                        <input type="text" id="setting-cerebras-model" value="${settings.cerebrasModel}" style="margin-top: 4px;">
                    </div>
                </div>

                <div class="ex-settings-section-title">Appearance & Behavior</div>
                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Icon Vert Placement</label><select id="setting-icon-vertical"><option value="bottom" ${settings.iconVertical === 'bottom' ? 'selected' : ''}>Below word</option><option value="top" ${settings.iconVertical === 'top' ? 'selected' : ''}>Above word</option></select></div>
                    <div class="ex-setting"><label>Icon Horiz Placement</label><select id="setting-icon-horizontal"><option value="end" ${settings.iconHorizontal === 'end' ? 'selected' : ''}>End of selection</option><option value="start" ${settings.iconHorizontal === 'start' ? 'selected' : ''}>Start of selection</option></select></div>
                </div>

                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Icon X Offset (px)</label><input type="number" id="setting-icon-offset-x" value="${settings.iconOffsetX}"></div>
                    <div class="ex-setting"><label>Icon Y Offset (px)</label><input type="number" id="setting-icon-offset-y" value="${settings.iconOffsetY}"></div>
                </div>

                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Icon Size (px)</label><input type="number" id="setting-icon-size" value="${settings.iconSize}"></div>
                    <div class="ex-setting">
                        <label>Global Scale (<span id="scale-display">${parseFloat(settings.globalScale).toFixed(2)}x</span>)</label>
                        <input type="range" id="setting-global-scale" min="0.5" max="2" step="0.05" value="${settings.globalScale}">
                    </div>
                </div>

                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Language</label><select id="setting-language">${languages.map(lang => `<option value="${lang}" ${settings.language === lang ? 'selected' : ''}>${lang}</option>`).join('')}</select></div>
                    <div class="ex-setting"><label>Type Speed (ms)</label><input type="number" id="setting-type-speed" value="${settings.typewriterSpeed}" min="1" max="50"></div>
                </div>

                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Font Type</label><select id="setting-font-family">${fontFamilies.map(font => `<option value="${font}" ${settings.fontFamily === font ? 'selected' : ''}>${font.split(',')[0].replace(/'/g, '')}</option>`).join('')}</select></div>
                    <div class="ex-setting"><label>Font Size</label><select id="setting-font-size">${fontSizes.map(size => `<option value="${size}" ${settings.fontSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select></div>
                </div>

                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Width</label><input type="text" id="setting-width" value="${settings.width}"></div>
                    <div class="ex-setting"><label>Height</label><input type="text" id="setting-height" value="${settings.height}"></div>
                </div>

                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Dark Mode</label><label class="ex-switch"><input type="checkbox" id="setting-dark-mode" ${settings.darkMode ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                    <div class="ex-setting"><label>Compact Mode</label><label class="ex-switch"><input type="checkbox" id="setting-compact-mode" ${settings.compactMode ? 'checked' : ''}><span class="ex-slider"></span></label></div>
                </div>
            </div>
            <button id="setting-save-btn">Save Preferences</button>`;

        const scaleSlider = settingsView.querySelector('#setting-global-scale');
        const scaleDisplay = settingsView.querySelector('#scale-display');
        scaleSlider.addEventListener('input', (e) => {
            scaleDisplay.textContent = parseFloat(e.target.value).toFixed(2) + 'x';
        });

        const providerSelect = settingsView.querySelector('#setting-provider');
        providerSelect.onchange = () => {
            const groups = ['gemini', 'openrouter', 'groq', 'cerebras'];
            groups.forEach(g => settingsView.querySelector(`#${g}-settings`).style.display = providerSelect.value === g ? 'flex' : 'none');
        };

        const bindModelSelect = (selectId, inputId) => {
            const sel = settingsView.querySelector('#' + selectId);
            const inp = settingsView.querySelector('#' + inputId);
            if (sel && inp) {
                sel.onchange = () => {
                    if (sel.value !== 'custom') inp.value = sel.value;
                    else inp.focus();
                };
            }
        };
        bindModelSelect('setting-gemini-model-select', 'setting-gemini-model');
        bindModelSelect('setting-openrouter-model-select', 'setting-openrouter-model');
        bindModelSelect('setting-groq-model-select', 'setting-groq-model');
        bindModelSelect('setting-cerebras-model-select', 'setting-cerebras-model');

        settingsView.querySelectorAll('.setting-delete-key').forEach(btn => {
            btn.onclick = (e) => { document.getElementById(e.target.dataset.target).value = ''; };
        });

        document.getElementById('setting-save-btn').onclick = () => {
             Object.assign(settings, {
                 showExplainBtn: document.getElementById('setting-show-explain').checked,
                 showDefineBtn: document.getElementById('setting-show-define').checked,
                 useWiktionary: document.getElementById('setting-use-wiktionary').checked,
                 useDictionaryApi: document.getElementById('setting-use-dictionary').checked,
                 useAiFallback: document.getElementById('setting-use-ai-fallback').checked,
                 typewriterExplain: document.getElementById('setting-typewriter-explain').checked,
                 typewriterDefine: document.getElementById('setting-typewriter-define').checked,
                 apiProvider: document.getElementById('setting-provider').value,
                 geminiApiKey: document.getElementById('setting-gemini-api-key').value.trim(),
                 geminiModel: document.getElementById('setting-gemini-model').value.trim(),
                 openrouterApiKey: document.getElementById('setting-openrouter-api-key').value.trim(),
                 openrouterModel: document.getElementById('setting-openrouter-model').value.trim(),
                 groqApiKey: document.getElementById('setting-groq-api-key').value.trim(),
                 groqModel: document.getElementById('setting-groq-model').value.trim(),
                 cerebrasApiKey: document.getElementById('setting-cerebras-api-key').value.trim(),
                 cerebrasModel: document.getElementById('setting-cerebras-model').value.trim(),
                 language: document.getElementById('setting-language').value,
                 fontFamily: document.getElementById('setting-font-family').value,
                 fontSize: document.getElementById('setting-font-size').value,
                 darkMode: document.getElementById('setting-dark-mode').checked,
                 compactMode: document.getElementById('setting-compact-mode').checked,
                 width: document.getElementById('setting-width').value.trim(),
                 height: document.getElementById('setting-height').value.trim(),
                 iconVertical: document.getElementById('setting-icon-vertical').value,
                 iconHorizontal: document.getElementById('setting-icon-horizontal').value,
                 iconOffsetX: parseInt(document.getElementById('setting-icon-offset-x').value, 10) || 0,
                 iconOffsetY: parseInt(document.getElementById('setting-icon-offset-y').value, 10) || 0,
                 iconSize: parseInt(document.getElementById('setting-icon-size').value, 10) || 36,
                 globalScale: parseFloat(document.getElementById('setting-global-scale').value) || 1.0,
                 typewriterSpeed: parseInt(document.getElementById('setting-type-speed').value) || 12
             });
             saveSettings();
             hideSettingsPanel();
        };
    }

    function hideSettingsPanel() {
        document.getElementById('ex-settings-view').style.display = 'none';
        document.getElementById('ex-main-view').style.display = 'flex';

        document.getElementById('ex-settings-btn').style.display = 'flex';
        document.getElementById('ex-settings-back-btn').style.display = 'none';
        document.getElementById('ex-header-settings-text').style.display = 'none';

        const popup = document.getElementById('ex-popup-container');
        const scale = parseFloat(settings.globalScale) || 1;
        const visualWidth = popup.offsetWidth * scale;
        const visualHeight = popup.offsetHeight * scale;

        if (window.innerWidth > 768 && popup.dataset.prevX && popup.dataset.prevY) {
            popup.style.left = popup.dataset.prevX;
            popup.style.top = popup.dataset.prevY;
        } else if (window.innerWidth <= 768) {
            popup.style.left = `${(window.innerWidth - visualWidth) / 2}px`;
            popup.style.top = `${(window.innerHeight - visualHeight) / 2}px`;
        }
    }

    // --- RENDER HELPERS (Typewriter & Instant) ---
    function formatMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    function renderOutput(element, markdownText, useTypewriter) {
        const htmlString = formatMarkdown(markdownText);
        if (useTypewriter) {
            typeWriteHTML(element, htmlString, settings.typewriterSpeed);
        } else {
            element.innerHTML = htmlString;
            document.getElementById('ex-footer').classList.add('ex-active');
        }
    }

    async function typeWriteHTML(element, htmlString, speed) {
        currentTypingId++;
        const myTypingId = currentTypingId;

        element.innerHTML = '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        async function processNode(node, parent) {
            if (myTypingId !== currentTypingId) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                let textNode = document.createTextNode('');
                parent.appendChild(textNode);

                for (let i = 0; i < text.length; i++) {
                    if (myTypingId !== currentTypingId) break;
                    textNode.textContent += text[i];
                    const delay = speed + (Math.random() * 8 - 4);
                    await new Promise(r => setTimeout(r, delay));
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const newElem = document.createElement(node.tagName);
                Array.from(node.attributes).forEach(attr => newElem.setAttribute(attr.name, attr.value));
                parent.appendChild(newElem);

                for (let child of node.childNodes) {
                    await processNode(child, newElem);
                }
            }
        }

        await processNode(tempDiv, element);
        if (myTypingId === currentTypingId) {
            document.getElementById('ex-footer').classList.add('ex-active');
        }
    }

    // --- API LOGIC (AI EXPLANATIONS) ---
    async function callApi(isDefinition = false) {
        const contentWrapper = document.getElementById('ex-content-wrapper');
        const responseDiv = document.createElement('div');
        responseDiv.className = 'ex-response-content';
        responseDiv.innerHTML = `<span class="ex-loading-pulse"></span>`;
        contentWrapper.appendChild(responseDiv);
        contentWrapper.scrollTop = contentWrapper.scrollHeight;

        const useTw = isDefinition ? settings.typewriterDefine : settings.typewriterExplain;

        const finalize = (success, data) => {
            if (success) {
                conversationHistory.push({ role: "model", parts: [{ text: data }] });
                renderOutput(responseDiv, data, useTw);
            } else {
                responseDiv.innerHTML = `<b style="color:#ef4444;">Error:</b> ${data}`;
                document.getElementById('ex-footer').classList.add('ex-active');
                contentWrapper.scrollTop = contentWrapper.scrollHeight;
            }
        };

        const handleApiKeyError = (provider) => { finalize(false, `API Key for ${provider} is missing or invalid.`); showSettingsPanel(); };

        const p = settings.apiProvider;

        if (p === 'gemini') {
            if (!settings.geminiApiKey) return handleApiKeyError('Gemini');
            GM_xmlhttpRequest({
                method: 'POST',
                url: `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel || 'gemini-2.5-flash-lite'}:generateContent`,
                headers: { 'Content-Type': 'application/json', 'X-goog-api-key': settings.geminiApiKey },
                data: JSON.stringify({ contents: conversationHistory }),
                responseType: 'json', timeout: 25000,
                onload: (res) => {
                    try {
                        if (res.status === 200 && res.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                            finalize(true, res.response.candidates[0].content.parts[0].text);
                        } else if (res.response?.error?.message) {
                            finalize(false, res.response.error.message);
                        } else finalize(false, `Status: ${res.status}`);
                    } catch (e) { finalize(false, "Gemini parsing error."); }
                },
                onerror: () => finalize(false, "Network connection error."),
                ontimeout: () => finalize(false, "Request timed out.")
            });
            return;
        }

        const oaiConfigs = {
            openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: settings.openrouterApiKey, model: settings.openrouterModel || 'meta-llama/llama-3.3-70b-instruct' },
            groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: settings.groqApiKey, model: settings.groqModel || 'llama-3.3-70b-versatile' },
            cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', key: settings.cerebrasApiKey, model: settings.cerebrasModel || 'gpt-oss-120b' }
        };

        const config = oaiConfigs[p];
        if (!config || !config.key) return handleApiKeyError(p.charAt(0).toUpperCase() + p.slice(1));

        const messages = conversationHistory.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.parts[0].text
        }));

        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` };
        if (p === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin || 'https://github.com';
            headers['X-Title'] = 'ExplainX';
        }

        GM_xmlhttpRequest({
            method: 'POST', url: config.url,
            headers: headers,
            data: JSON.stringify({ model: config.model, messages: messages, temperature: 0.7, max_tokens: 2000 }),
            responseType: 'json', timeout: 25000,
            onload: (res) => {
                try {
                    if (res.status >= 200 && res.status < 300 && res.response?.choices?.[0]?.message?.content) {
                        finalize(true, res.response.choices[0].message.content.trim());
                    } else if (res.status === 401 || res.status === 403) handleApiKeyError(p);
                    else if (res.status === 402) finalize(false, `HTTP 402 Payment Required: Out of credits or model requires paid tier on ${p}.`);
                    else finalize(false, res.response?.error?.message || `API Error: ${res.status}`);
                } catch (e) { finalize(false, "Response parsing error."); }
            },
            onerror: () => finalize(false, "Network connection error."),
            ontimeout: () => finalize(false, "Request timed out.")
        });
    }

    // --- PARSERS & CONFIGURABLE DICTIONARY PIPELINE ---
    function formatDictionaryData(data) {
        const entry = data[0];
        let parts = [];

        const phoneticText = entry.phonetic || entry.phonetics?.find(p => p.text)?.text;
        if (phoneticText) {
            parts.push(`*${phoneticText}*\n`);
        }

        if (entry.meanings && Array.isArray(entry.meanings)) {
            entry.meanings.forEach((m) => {
                if (m.partOfSpeech) {
                    parts.push(`**[${m.partOfSpeech}]**`);
                }
                if (m.definitions && Array.isArray(m.definitions)) {
                    m.definitions.slice(0, 3).forEach((d, i) => {
                        let defLine = `${i + 1}. ${d.definition}`;
                        if (d.example) {
                            defLine += `\n   *"${d.example}"*`;
                        }
                        parts.push(defLine);
                    });
                }
                if (m.synonyms && m.synonyms.length > 0) {
                    parts.push(`*Synonyms:* ${m.synonyms.slice(0, 5).join(', ')}`);
                }
                parts.push('');
            });
        }
        return parts.join('\n').trim();
    }

    function formatWiktionaryData(enArray) {
        let parts = [];
        enArray.forEach(item => {
            if (item.partOfSpeech) {
                parts.push(`**[${item.partOfSpeech.toLowerCase()}]**`);
            }
            if (item.definitions && Array.isArray(item.definitions)) {
                item.definitions.slice(0, 3).forEach((d, i) => {
                    let cleanDef = (d.definition || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
                    if (cleanDef) {
                        let defLine = `${i + 1}. ${cleanDef}`;
                        if (d.examples && d.examples.length > 0) {
                            let cleanEx = (d.examples[0] || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
                            if (cleanEx) defLine += `\n   *"${cleanEx}"*`;
                        }
                        parts.push(defLine);
                    }
                });
            }
            parts.push('');
        });
        return parts.join('\n').trim();
    }

    // --- USER ACTIONS ---
    async function handleActionTrigger() {
        hideTooltip();
        const selectionData = getSelectionAndContext();
        if (!selectionData || !selectionData.text) return;
        conversationHistory = [];
        createPopup(EX_ICON_BASE64, 'ExplainX');
        document.getElementById('ex-footer').classList.remove('ex-active');

        const contentWrapper = document.getElementById('ex-content-wrapper');
        contentWrapper.innerHTML = `<div class="ex-query-title"><span>${selectionData.text}</span></div>`;

        const prompt = `In ${settings.language}, clearly explain the following term: "${selectionData.text}". Context: "${selectionData.context}". Be concise and format with bolding or bullet points if helpful.`;
        conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
        callApi(false);
    }

    async function handleDictionaryTrigger() {
        hideTooltip();
        const selectionData = getSelectionAndContext();
        if (!selectionData || !selectionData.text) return;

        const cleanWord = selectionData.text.replace(/^[^\w\s'-]+|[^\w\s'-]+$/g, '').trim();
        if (!cleanWord) return;

        conversationHistory = [];
        createPopup(DEF_ICON_BASE64, 'Definition');
        document.getElementById('ex-footer').classList.remove('ex-active');

        const contentWrapper = document.getElementById('ex-content-wrapper');
        contentWrapper.innerHTML = `
            <div class="ex-query-title">
                <span>${cleanWord}</span>
                <span id="ex-source-badge" class="ex-source-badge ex-badge-dict">Searching...</span>
            </div>
        `;

        const responseDiv = document.createElement('div');
        responseDiv.className = 'ex-response-content';
        responseDiv.innerHTML = `<span class="ex-loading-pulse"></span>`;
        contentWrapper.appendChild(responseDiv);
        contentWrapper.scrollTop = contentWrapper.scrollHeight;

        const wordToLookup = cleanWord.toLowerCase();

        const tryAiFallback = () => {
            if (!settings.useAiFallback) {
                responseDiv.innerHTML = `<b style="color:#ef4444;">No definition found for "${cleanWord}".</b><br><span style="color:var(--ex-text-muted); font-size: 0.9em; display: inline-block; margin-top: 6px;">All enabled definition sources were exhausted and AI Fallback is disabled in settings.</span>`;
                document.getElementById('ex-footer').classList.add('ex-active');
                return;
            }
            const badge = document.getElementById('ex-source-badge');
            if (badge) {
                badge.className = 'ex-source-badge ex-badge-ai';
                badge.textContent = 'AI Fallback';
                badge.title = 'Dictionary lookup was unavailable; defined using AI';
            }

            const hasAiKey = (settings.apiProvider === 'gemini' && settings.geminiApiKey) ||
                             (settings.apiProvider === 'openrouter' && settings.openrouterApiKey) ||
                             (settings.apiProvider === 'groq' && settings.groqApiKey) ||
                             (settings.apiProvider === 'cerebras' && settings.cerebrasApiKey);

            if (hasAiKey) {
                const prompt = `Provide the concise dictionary definition for "${cleanWord}" in ${settings.language}. Include phonetic/pronunciation in slashes if known (e.g. /.../), part(s) of speech, clear definitions, and an example sentence.`;
                conversationHistory = [{ role: "user", parts: [{ text: prompt }] }];
                responseDiv.remove();
                callApi(true);
            } else {
                responseDiv.innerHTML = `<b style="color:#ef4444;">No definition found for "${cleanWord}".</b><br><span style="color:var(--ex-text-muted); font-size: 0.9em; display: inline-block; margin-top: 6px;">Dictionary sources returned no results. Configure an AI API key in Settings for AI fallback.</span>`;
                document.getElementById('ex-footer').classList.add('ex-active');
            }
        };

        const tryDictionaryApi = () => {
            if (!settings.useDictionaryApi) {
                tryAiFallback();
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(wordToLookup)}`,
                responseType: 'json',
                timeout: 2500,
                onload: (res) => {
                    let data = res.response;
                    if (typeof data === 'string') {
                        try { data = JSON.parse(data); } catch(e) { data = null; }
                    }

                    if (res.status === 200 && Array.isArray(data) && data.length > 0) {
                        const formatted = formatDictionaryData(data);
                        const badge = document.getElementById('ex-source-badge');
                        if (badge) {
                            badge.className = 'ex-source-badge ex-badge-dict';
                            badge.textContent = 'Dictionary';
                        }
                        conversationHistory.push(
                            { role: "user", parts: [{ text: `Define "${cleanWord}".` }] },
                            { role: "model", parts: [{ text: formatted }] }
                        );
                        renderOutput(responseDiv, formatted, settings.typewriterDefine);
                    } else {
                        tryAiFallback();
                    }
                },
                onerror: () => tryAiFallback(),
                ontimeout: () => tryAiFallback()
            });
        };

        const tryWiktionary = () => {
            if (!settings.useWiktionary) {
                tryDictionaryApi();
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(wordToLookup)}`,
                responseType: 'json',
                timeout: 2500,
                onload: (wRes) => {
                    let wData = wRes.response;
                    if (typeof wData === 'string') {
                        try { wData = JSON.parse(wData); } catch(e) { wData = null; }
                    }
                    if (wRes.status === 200 && wData && Array.isArray(wData.en) && wData.en.length > 0) {
                        const formatted = formatWiktionaryData(wData.en);
                        const badge = document.getElementById('ex-source-badge');
                        if (badge) {
                            badge.className = 'ex-source-badge ex-badge-dict';
                            badge.textContent = 'Wiktionary';
                        }
                        conversationHistory.push(
                            { role: "user", parts: [{ text: `Define "${cleanWord}".` }] },
                            { role: "model", parts: [{ text: formatted }] }
                        );
                        renderOutput(responseDiv, formatted, settings.typewriterDefine);
                    } else {
                        tryDictionaryApi();
                    }
                },
                onerror: () => tryDictionaryApi(),
                ontimeout: () => tryDictionaryApi()
            });
        };

        tryWiktionary();
    }

    function handleFollowUp(type, customText = '') {
        const prompts = {
            'simplify': `In ${settings.language}, simplify the explanation further like I am a beginner.`,
            'elaborate': `In ${settings.language}, elaborate on this with more deep details and an example.`,
            'chat': customText
        };
        const prompt = prompts[type];
        if (!prompt) return;

        conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
        const contentWrapper = document.getElementById('ex-content-wrapper');
        const followupDiv = document.createElement('div');
        followupDiv.className = 'ex-followup-query';
        followupDiv.textContent = type === 'chat' ? customText : (type === 'simplify' ? 'Say Less...' : 'Say More...');

        contentWrapper.appendChild(followupDiv);
        contentWrapper.scrollTop = contentWrapper.scrollHeight;
        document.getElementById('ex-footer').classList.remove('ex-active');
        callApi(false);
    }

    // --- DOM & EVENT MANAGEMENT ---
    function createPopup(headerIcon = EX_ICON_BASE64, headerLabel = 'ExplainX') {
        removePopup();
        const popup = document.createElement('div');
        popup.id = 'ex-popup-container';
        popup.innerHTML = POPUP_HTML;
        document.body.appendChild(popup);
        applySettingsStyles();

        popup.querySelector('#ex-header-img').src = headerIcon;
        popup.querySelector('#ex-header-label').textContent = headerLabel;

        popup.style.visibility = 'hidden';
        popup.style.display = 'flex';

        requestAnimationFrame(() => {
            const width = popup.offsetWidth;
            const height = popup.offsetHeight;
            const scale = parseFloat(settings.globalScale) || 1;
            const visualWidth = width * scale;
            const visualHeight = height * scale;
            const isMobile = window.innerWidth <= 768;
            let popupX, popupY;

            if (isMobile) {
                popupX = (window.innerWidth - visualWidth) / 2;
                popupY = (window.innerHeight - visualHeight) / 2;
            } else if (settings.customX !== null && settings.customY !== null) {
                popupX = Math.min(parseFloat(settings.customX), window.innerWidth - visualWidth - 10);
                popupY = Math.min(parseFloat(settings.customY), window.innerHeight - visualHeight - 10);
                popupX = Math.max(10, popupX);
                popupY = Math.max(10, popupY);
            } else {
                popupX = window.innerWidth - visualWidth - 20;
                popupY = window.innerHeight - visualHeight - 20;
            }

            popup.style.left = `${popupX}px`;
            popup.style.top = `${popupY}px`;
            popup.style.visibility = 'visible';

            popup.querySelector('#ex-close-btn').onclick = removePopup;
            popup.querySelector('#ex-settings-btn').onclick = showSettingsPanel;
            popup.querySelector('#ex-settings-back-btn').onclick = hideSettingsPanel;
            popup.querySelector('#ex-simplify-btn').onclick = () => handleFollowUp('simplify');
            popup.querySelector('#ex-elaborate-btn').onclick = () => handleFollowUp('elaborate');

            const chatInput = popup.querySelector('#ex-chat-input'), chatSubmit = popup.querySelector('#ex-chat-submit');
            chatSubmit.onclick = () => { if (chatInput.value.trim()) { handleFollowUp('chat', chatInput.value.trim()); chatInput.value = ''; } };
            chatInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); chatSubmit.click(); } };

            makeDraggable(popup);
            requestAnimationFrame(() => popup.classList.add('ex-visible'));
        });
    }

    function showTooltip() {
        if (!lastSelectionRects || lastSelectionRects.length === 0) return;

        const showExplain = settings.showExplainBtn !== false;
        const showDefine = settings.showDefineBtn !== false;
        if (!showExplain && !showDefine) {
            hideTooltip();
            return;
        }

        const tooltip = document.getElementById('ex-tooltip-wrapper');
        const explainBtn = document.getElementById('ex-tooltip-explain-btn');
        const defineBtn = document.getElementById('ex-tooltip-define-btn');

        explainBtn.style.display = showExplain ? 'block' : 'none';
        defineBtn.style.display = showDefine ? 'block' : 'none';

        const iconSize = parseInt(settings.iconSize, 10) || 36;
        explainBtn.style.width = explainBtn.style.height = `${iconSize}px`;
        defineBtn.style.width = defineBtn.style.height = `${iconSize}px`;

        const visibleCount = (showExplain ? 1 : 0) + (showDefine ? 1 : 0);
        const totalWidth = (visibleCount * iconSize) + (visibleCount > 1 ? 5 : 0);
        const totalHeight = iconSize;

        const firstRect = lastSelectionRects[0];
        const lastRect = lastSelectionRects[lastSelectionRects.length - 1];

        let yPos, xPos;

        if (settings.iconVertical === 'top') yPos = firstRect.top - totalHeight - 8;
        else yPos = lastRect.bottom + 8;

        if (settings.iconHorizontal === 'start') xPos = firstRect.left - 5;
        else xPos = lastRect.right + 5;

        xPos += (parseInt(settings.iconOffsetX, 10) || 0);
        yPos += (parseInt(settings.iconOffsetY, 10) || 0);

        yPos = Math.max(8, Math.min(yPos, window.innerHeight - totalHeight - 8));
        xPos = Math.max(8, Math.min(xPos, window.innerWidth - totalWidth - 8));

        tooltip.style.left = `${xPos}px`;
        tooltip.style.top = `${yPos}px`;
        tooltip.classList.add('ex-show-tooltip');
    }

    const getSelectionAndContext = () => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (!text) return null;
        let context = '';
        if (selection.rangeCount > 0) {
            let node = selection.getRangeAt(0).commonAncestorContainer;
            const blocks = ['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'BLOCKQUOTE', 'TD', 'H1', 'H2', 'H3'];
            while (node && node !== document.body) {
                if (node.nodeType === Node.ELEMENT_NODE && blocks.includes(node.nodeName)) { context = node.textContent; break; }
                node = node.parentNode;
            }
        }
        return { text, context: (context || document.body.innerText).substring(0, 4000) };
    };

    const removePopup = () => {
        currentTypingId++;
        const p = document.getElementById('ex-popup-container');
        if(p) { p.classList.remove('ex-visible'); setTimeout(() => p.remove(), 250); }
    };

    const hideTooltip = () => {
        const t = document.getElementById('ex-tooltip-wrapper');
        if(t) t.classList.remove('ex-show-tooltip');
    };

    const makeDraggable = (el) => {
        let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
        const h = el.querySelector("#ex-header");

        const dragStart = (e) => {
            if (e.target.closest('.ex-header-btn')) return;
            e.preventDefault();
            const isTouch = e.type.includes('touch');
            p3 = isTouch ? e.touches[0].clientX : e.clientX;
            p4 = isTouch ? e.touches[0].clientY : e.clientY;

            if (isTouch) {
                document.ontouchend = dragEnd;
                document.ontouchmove = dragAction;
            } else {
                document.onmouseup = dragEnd;
                document.onmousemove = dragAction;
            }
        };

        const dragAction = (e) => {
            e.preventDefault();
            const isTouch = e.type.includes('touch');
            const clientX = isTouch ? e.touches[0].clientX : e.clientX;
            const clientY = isTouch ? e.touches[0].clientY : e.clientY;
            p1 = p3 - clientX;
            p2 = p4 - clientY;
            p3 = clientX;
            p4 = clientY;
            el.style.top = `${el.offsetTop - p2}px`;
            el.style.left = `${el.offsetLeft - p1}px`;
        };

        const dragEnd = () => {
            document.onmouseup = null; document.onmousemove = null;
            document.ontouchend = null; document.ontouchmove = null;
            if (window.innerWidth > 768) {
                settings.customX = el.style.left;
                settings.customY = el.style.top;
                persistSettings();
            }
        };

        if(h) {
            h.onmousedown = dragStart;
            h.ontouchstart = dragStart;
        }
    };

    // --- STYLES & INITIALIZATION ---
    async function main() {
        await loadSettings();

        GM_addStyle(`
            :root {
                --ex-bg: #ffffff; --ex-bg-alt: #f8fafc; --ex-border: #e2e8f0;
                --ex-text: #1e293b; --ex-text-muted: #64748b;
                --ex-accent: #a855f7; --ex-accent-hover: #9333ea;
                --ex-shadow: 0 10px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
            }
            .dark-mode {
                --ex-bg: #0f172a; --ex-bg-alt: #1e293b; --ex-border: #334155;
                --ex-text: #f8fafc; --ex-text-muted: #94a3b8;
                --ex-accent: #c084fc; --ex-accent-hover: #a855f7;
                --ex-shadow: 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
            }

            #ex-popup-container {
                position: fixed; z-index: 2147483647;
                --ex-scale: 1.0;
                width: var(--popup-width);
                max-width: calc(94vw / var(--ex-scale));
                max-height: var(--popup-max-height);
                background: var(--ex-bg); color: var(--ex-text);
                border-radius: 16px; box-shadow: var(--ex-shadow);
                font-family: var(--font-family); font-size: var(--font-size);
                display: flex; flex-direction: column; overflow: hidden;

                transform-origin: top left;
                opacity: 0; transform: translateY(10px) scale(calc(var(--ex-scale) * 0.98));
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            }
            #ex-popup-container.ex-visible { opacity: 1; transform: translateY(0) scale(var(--ex-scale)); }

            #ex-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 16px; background: var(--ex-bg-alt); border-bottom: 1px solid var(--ex-border);
                cursor: grab; user-select: none; transition: padding 0.2s ease;
            }
            #ex-header:active { cursor: grabbing; }
            #ex-header-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; letter-spacing: -0.01em; color: var(--ex-text); transition: font-size 0.2s; }
            #ex-header-title img { width: 18px; height: 18px; border-radius: 4px; transition: width 0.2s, height 0.2s; }

            .ex-header-controls { display: flex; gap: 6px; }
            .ex-header-btn {
                background: transparent; border: none; color: var(--ex-text-muted);
                width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.2s;
            }
            .ex-header-btn:hover { background: var(--ex-border); color: var(--ex-text); }
            .ex-header-btn svg { width: 16px; height: 16px; transition: width 0.2s, height 0.2s; }

            #ex-main-view, #ex-settings-view { display: flex; flex-direction: column; flex-grow: 1; overflow: hidden; }

            #ex-content-wrapper { padding: 18px; overflow-y: auto; flex-grow: 1; scroll-behavior: smooth; }
            #ex-content-wrapper::-webkit-scrollbar { width: 6px; }
            #ex-content-wrapper::-webkit-scrollbar-track { background: transparent; }
            #ex-content-wrapper::-webkit-scrollbar-thumb { background: var(--ex-border); border-radius: 10px; }

            .ex-query-title {
                display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
                font-weight: 700; font-size: 1.15em; margin-bottom: 14px; padding-bottom: 10px;
                border-bottom: 1px solid var(--ex-border); color: var(--ex-text);
            }
            .ex-source-badge {
                font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px;
                text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.4; user-select: none;
            }
            .ex-badge-dict {
                background: rgba(168, 85, 247, 0.12);
                color: var(--ex-accent);
                border: 1px solid rgba(168, 85, 247, 0.25);
            }
            .ex-badge-ai {
                background: rgba(148, 163, 184, 0.15);
                color: var(--ex-text-muted);
                border: 1px solid rgba(148, 163, 184, 0.3);
            }

            .ex-response-content { line-height: 1.6; }
            .ex-response-content strong { font-weight: 600; color: var(--ex-accent); }
            .ex-response-content code { font-family: monospace; background: var(--ex-bg-alt); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }

            .ex-followup-query { margin-top: 16px; padding: 12px; background: var(--ex-bg-alt); border-radius: 8px; font-style: italic; color: var(--ex-text-muted); border-left: 3px solid var(--ex-accent); }

            #ex-footer { padding: 14px 18px; background: var(--ex-bg-alt); border-top: 1px solid var(--ex-border); display: none; transition: padding 0.2s; }
            #ex-footer.ex-active { display: block; }
            #ex-followup-buttons { display: flex; justify-content: center; gap: 10px; margin-bottom: 12px; }
            .ex-footer-btn {
                background: var(--ex-bg); border: 1px solid var(--ex-border); color: var(--ex-text);
                padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
                cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            .ex-footer-btn:hover { border-color: var(--ex-accent); color: var(--ex-accent); transform: translateY(-1px); }

            #ex-chat-input-wrapper {
                display: flex; gap: 8px; position: relative;
                background: var(--ex-bg);
                border: 2px solid var(--ex-border);
                border-radius: 24px;
                padding: 4px;
                transition: border-color 0.2s, box-shadow 0.2s, padding 0.2s;
            }
            #ex-chat-input-wrapper:focus-within {
                border-color: var(--ex-accent);
                box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
            }
            #ex-chat-input {
                flex-grow: 1; background: transparent; border: none;
                color: var(--ex-text); padding: 6px 40px 6px 12px; font-size: 14px;
                transition: padding 0.2s, font-size 0.2s;
            }
            #ex-chat-input:focus { outline: none; box-shadow: none; border-color: transparent; }
            #ex-chat-submit {
                position: absolute; right: 4px; top: 4px; bottom: 4px;
                background: var(--ex-accent); color: white; border: none; border-radius: 20px;
                width: 32px; display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: background 0.2s, width 0.2s, border-radius 0.2s;
            }
            #ex-chat-submit:hover { background: var(--ex-accent-hover); }
            #ex-chat-submit svg { width: 14px; height: 14px; transition: width 0.2s, height 0.2s; }

            .ex-compact #ex-header { padding: 6px 16px; }
            .ex-compact #ex-header-title { font-size: 13px; }
            .ex-compact #ex-header-title img { width: 15px; height: 15px; }
            .ex-compact .ex-header-btn { width: 24px; height: 24px; }
            .ex-compact .ex-header-btn svg { width: 14px; height: 14px; }

            .ex-compact #ex-footer.ex-active {
                display: flex; flex-direction: row; align-items: center;
                gap: 10px; padding: 10px 14px;
            }
            .ex-compact #ex-followup-buttons { margin-bottom: 0; display: flex; gap: 6px; flex-shrink: 0; }
            .ex-compact .ex-footer-btn { padding: 5px 12px; font-size: 12px; }
            .ex-compact #ex-chat-input-wrapper { flex-grow: 1; padding: 2px; }
            .ex-compact #ex-chat-input { padding: 5px 32px 5px 10px; font-size: 13px; }
            .ex-compact #ex-chat-submit { width: 28px; top: 2px; bottom: 2px; right: 2px; border-radius: 14px; }

            #ex-tooltip-wrapper {
                position: fixed; z-index: 2147483646;
                display: flex; gap: 5px; align-items: center;
                opacity: 0; transform: scale(0.8) translateY(10px); pointer-events: none;
                transition: opacity 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2));
            }
            #ex-tooltip-wrapper.ex-show-tooltip { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; }
            .ex-tooltip-btn {
                border-radius: 25%; cursor: pointer;
                transition: transform 0.15s ease; user-select: none; display: block;
            }
            .ex-tooltip-btn:hover { transform: scale(1.14); }

            #ex-settings-view { padding: 0; }
            .ex-settings-scroll-area { padding: 16px; padding-top: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
            .ex-settings-scroll-area::-webkit-scrollbar { width: 6px; }
            .ex-settings-scroll-area::-webkit-scrollbar-thumb { background: var(--ex-border); border-radius: 10px; }

            .ex-settings-section-title {
                font-size: 12px; font-weight: 700; color: var(--ex-accent);
                margin-top: 6px; margin-bottom: -4px; text-transform: uppercase; letter-spacing: 0.05em;
            }
            .ex-setting { display: flex; flex-direction: column; gap: 6px; }
            .ex-setting label { font-size: 13px; font-weight: 500; color: var(--ex-text-muted); }
            .ex-setting-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .api-settings-group { display: flex; flex-direction: column; gap: 12px; background: var(--ex-bg-alt); padding: 12px; border-radius: 8px; border: 1px solid var(--ex-border); }

            .ex-api-key-wrapper { display: flex; }
            .ex-api-key-wrapper input { border-radius: 6px 0 0 6px; flex-grow: 1; border-right: none; }
            .ex-api-key-wrapper button { background: var(--ex-border); color: var(--ex-text-muted); border: 1px solid var(--ex-border); padding: 0 12px; border-radius: 0 6px 6px 0; cursor: pointer; transition: 0.2s; }
            .ex-api-key-wrapper button:hover { background: #ef4444; color: white; border-color: #ef4444; }

            #ex-settings-view input, #ex-settings-view select {
                width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 14px;
                background: var(--ex-bg); color: var(--ex-text); border: 1px solid var(--ex-border);
                border-radius: 6px; transition: border-color 0.2s;
            }
            #ex-settings-view input:focus, #ex-settings-view select:focus { outline: none; border-color: var(--ex-accent); }
            #ex-settings-view input[type="range"] { padding: 0; background: transparent; border: none; }

            #setting-save-btn { margin: 16px; padding: 12px; background: var(--ex-accent); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
            #setting-save-btn:hover { background: var(--ex-accent-hover); }

            .ex-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .ex-switch input { opacity: 0; width: 0; height: 0; }
            .ex-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--ex-border); transition: .3s; border-radius: 24px; }
            .ex-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
            input:checked + .ex-slider { background-color: var(--ex-accent); }
            input:checked + .ex-slider:before { transform: translateX(20px); }

            .ex-loading-pulse { display: inline-block; width: 10px; height: 10px; background-color: var(--ex-accent); border-radius: 50%; animation: ex-pulse 1.2s infinite cubic-bezier(0.66, 0, 0, 1); }
            @keyframes ex-pulse { 0% { transform: scale(0.8); opacity: 0.5; } 50% { transform: scale(1.4); opacity: 1; } 100% { transform: scale(0.8); opacity: 0.5; } }

            .ex-toast { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: ex-fade-in-out 2.5s forwards; z-index: 100; pointer-events: none;}
            @keyframes ex-fade-in-out { 0% { opacity: 0; transform: translate(-50%, 10px); } 10% { opacity: 1; transform: translate(-50%, 0); } 90% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -10px); } }

            @media (max-width: 768px) {
                .ex-setting-row { grid-template-columns: 1fr; gap: 8px; }
                #ex-chat-input { font-size: 16px; }
                .ex-footer-btn { padding: 8px 16px; font-size: 14px; }
                #ex-content-wrapper { padding-bottom: 24px; }
            }
        `);

        const tooltipWrapper = document.createElement('div');
        tooltipWrapper.id = 'ex-tooltip-wrapper';
        tooltipWrapper.innerHTML = `
            <img id="ex-tooltip-explain-btn" class="ex-tooltip-btn" title="Explain (AI)" src="${EX_ICON_BASE64}">
            <img id="ex-tooltip-define-btn" class="ex-tooltip-btn" title="Define (Dictionary)" src="${DEF_ICON_BASE64}">
        `;
        document.body.appendChild(tooltipWrapper);

        tooltipWrapper.querySelector('#ex-tooltip-explain-btn').onclick = (e) => {
            e.stopPropagation();
            handleActionTrigger();
        };

        tooltipWrapper.querySelector('#ex-tooltip-define-btn').onclick = (e) => {
            e.stopPropagation();
            handleDictionaryTrigger();
        };

        const handleOutsideClick = (e) => {
            if (e.target && typeof e.target.closest === 'function') {
                if (!e.target.closest('#ex-popup-container') && !e.target.closest('#ex-tooltip-wrapper')) {
                    removePopup();
                    hideTooltip();
                }
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('touchstart', handleOutsideClick, { passive: true });

        const evaluateSelection = () => {
            if (!settings.showExplainBtn && !settings.showDefineBtn) {
                hideTooltip();
                return;
            }

            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
                let node = selection.anchorNode;
                while (node && node !== document.body && node !== document) {
                    if (node.nodeType === Node.ELEMENT_NODE && (node.id === 'ex-popup-container' || node.id === 'ex-tooltip-wrapper')) return;
                    node = node.parentNode;
                }

                lastSelectionRects = selection.getRangeAt(0).getClientRects();
                if (lastSelectionRects.length > 0) showTooltip();
            } else {
                hideTooltip();
            }
        };

        let selectionDebounce;
        const handleSelectionEvent = (e) => {
            if (e && e.target && typeof e.target.closest === 'function') {
                if (e.target.closest('#ex-popup-container') || e.target.closest('#ex-tooltip-wrapper')) return;
            }

            clearTimeout(selectionDebounce);
            selectionDebounce = setTimeout(evaluateSelection, 200);
        };

        document.addEventListener('mouseup', handleSelectionEvent);
        document.addEventListener('touchend', handleSelectionEvent);
        document.addEventListener('selectionchange', handleSelectionEvent);

        GM_registerMenuCommand("ExplainX Settings", () => { createPopup(); showSettingsPanel(); });
    }

    if (document.readyState === 'complete') { main(); } else { window.addEventListener('load', main); }


})();