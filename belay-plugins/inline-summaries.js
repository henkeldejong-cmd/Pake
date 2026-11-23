// ==UserScript==
// @name         Inline AI Summaries (Desktop App Edition)
// @namespace    http://tampermonkey.net/
// @version      7.1.1
// @description  Hold Ctrl & Hover for AI summaries. Adapted for Tauri/Pake desktop apps with native IPC fetch routing.
// @author       Your Name / AI Assistant
// @match        *://*/*
// @match        file:///*
// @exclude      https://letterboxd.com/*
// @exclude      *://*.cloudflare.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      openrouter.ai
// @connect      generativelanguage.googleapis.com
// @connect      api.groq.com
// @connect      api.cerebras.ai
// @connect      archive.today
// @connect      archive.ph
// @connect      archive.is
// @connect      archive.md
// @connect      archive.vn
// @connect      api.elevenlabs.io
// @license      MIT
// ==/UserScript==

(async function() {
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
    let pageContentForContext = "";
    let currentTypingId = 0;

    const MODEL_OPTIONS = {
        gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        openrouter: ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat', 'anthropic/claude-3.5-haiku'],
        groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant'],
        cerebras: ['gpt-oss-120b', 'qwen-3.8-27b']
    };

    const DEFAULTS = {
        apiProvider: 'gemini',
        geminiApiKey: '',
        geminiModelName: 'gemini-2.5-flash-lite',
        openrouterApiKey: '',
        openrouterModelName: 'meta-llama/llama-3.3-70b-instruct',
        groqApiKey: '',
        groqModelName: 'llama-3.3-70b-versatile',
        cerebrasApiKey: '',
        cerebrasModelName: 'gpt-oss-120b',
        selectedVoiceURI: null,
        fontSize: '16px',
        fontFamily: "'Georgia', serif",
        darkMode: true,
        language: 'English',
        width: '420px',
        height: '450px',
        ttsProvider: 'system',
        elevenlabsApiKey: '',
        elevenlabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
        typewriterEnabled: true,
        typewriterSpeed: 12
    };
    let settings = { ...DEFAULTS };

    // --- ICONS & ASSETS ---
    const SPEAK_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>`;
    const STOP_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><path d="M6 6h12v12H6z"></path></svg>`;
    const SETTINGS_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.82,12.64a1,1,0,0,0-.15-.29l-1.83-3.18a1,1,0,0,0-1.39-.39l-2.2,1.1a9,9,0,0,0-2.52,0l-2.2-1.1a1,1,0,0,0-1.39.39L6.33,9.17a1,1,0,0,0-.15,.29,7.53,7.53,0,0,0,0,5.54,1,1,0,0,0,.15,.29l1.83,3.18a1,1,0,0,0,1.39,.39l2.2-1.1a9,9,0,0,0,2.52,0l2.2,1.1a1,1,0,0,0,1.39-.39l1.83-3.18a1,1,0,0,0,.15-.29,7.53,7.53,0,0,0,0-5.54ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>`;
    const SUBMIT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4,20.3,20.1,13a1.1,1.1,0,0,0,0-2L3.4,3.7A1,1,0,0,0,2,4.6V9.9a.9.9,0,0,0,.8,.9L10,12,2.8,13.2a.9.9,0,0,0-.8,.9v5.3A1,1,0,0,0,3.4,20.3Z"/></svg>`;
    const COPY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>`;

    const OPENROUTER_API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
    const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
    const CEREBRAS_API_ENDPOINT = 'https://api.cerebras.ai/v1/chat/completions';
    const ELEVENLABS_API_VOICES_ENDPOINT = 'https://api.elevenlabs.io/v1/voices';
    const MAX_CONTENT_LENGTH = 15000;
    const HOVER_DELAY_MS = 400;

    let summaryPanel = null;
    let currentUrl = null;
    let summaryRequestActive = false;
    let hoverTimeout = null;
    let isSpeaking = false;
    let currentUtterance = null;
    let availableVoices = [];
    let elevenLabsAudio = null;
    const ttsSupported = 'speechSynthesis' in window;

    // --- SETTINGS MANAGEMENT ---
    async function loadSettings() {
        const loaded = await GM_getValue('inlineAiSummaries_settings_v6_desktop');
        settings = { ...DEFAULTS, ...(loaded || {}) };

        if (['llama3.1-8b', 'llama-3.3-70b', 'llama-3.1-70b'].includes(settings.cerebrasModelName)) {
            settings.cerebrasModelName = 'gpt-oss-120b';
        }

        applySettingsStyles();
    }
    async function saveSettings() {
        await GM_setValue('inlineAiSummaries_settings_v6_desktop', settings);
        alert('Settings saved!');
        applySettingsStyles();
    }
    function applySettingsStyles() {
        const container = document.getElementById('summary-panel-container');
        if (!container) return;
        container.style.setProperty('--font-family', settings.fontFamily);
        container.style.setProperty('--font-size', settings.fontSize);
        container.style.setProperty('--popup-width', settings.width);
        container.style.setProperty('--popup-max-height', settings.height);
        container.classList.toggle('dark-mode', settings.darkMode);
    }

    function showSettingsPanel() {
        if (!summaryPanel) createSummaryPanel();
        if (summaryPanel.style.display === 'none' || summaryPanel.style.opacity === '0') showSummaryPanel();
        document.getElementById('summary-main-view').style.display = 'none';
        const settingsView = document.getElementById('summary-settings-view');
        settingsView.style.display = 'flex';

        const languages = ["English", "Spanish", "French", "German", "Chinese (Simplified)", "Japanese", "Russian", "Arabic", "Portuguese", "Hindi", "Amharic"];
        const fontFamilies = ["'Georgia', serif", "'Helvetica', sans-serif", "'Arial', sans-serif", "'Times New Roman', serif", "'Courier New', monospace"];
        const fontSizes = ["9px", "10px", "11px", "12px", "13px", "14px", "15px", "16px", "17px"];

        settingsView.innerHTML = `
            <h2>Settings</h2>
            <div class="summary-setting"><label>API Provider</label>
                <select id="setting-provider">
                    <option value="gemini" ${settings.apiProvider === 'gemini' ? 'selected' : ''}>Gemini</option>
                    <option value="openrouter" ${settings.apiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                    <option value="groq" ${settings.apiProvider === 'groq' ? 'selected' : ''}>Groq</option>
                    <option value="cerebras" ${settings.apiProvider === 'cerebras' ? 'selected' : ''}>Cerebras</option>
                </select>
            </div>

            <!-- Gemini Settings -->
            <div id="gemini-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'gemini' ? 'flex' : 'none'};">
                <div class="summary-setting"><label>Google Gemini API Key</label><input type="password" id="setting-gemini-key" value="${settings.geminiApiKey}"></div>
                <div class="summary-setting"><label>Gemini Model</label>
                    <select id="setting-gemini-model-select">
                        ${MODEL_OPTIONS.gemini.map(m => `<option value="${m}" ${settings.geminiModelName === m ? 'selected' : ''}>${m}</option>`).join('')}
                        <option value="custom" ${!MODEL_OPTIONS.gemini.includes(settings.geminiModelName) ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input type="text" id="setting-gemini-model" value="${settings.geminiModelName}" placeholder="Enter model name">
                </div>
            </div>

            <!-- OpenRouter Settings -->
            <div id="openrouter-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'openrouter' ? 'flex' : 'none'};">
                <div class="summary-setting"><label>OpenRouter API Key</label><input type="password" id="setting-openrouter-key" value="${settings.openrouterApiKey}"></div>
                <div class="summary-setting"><label>OpenRouter Model</label>
                    <select id="setting-openrouter-model-select">
                        ${MODEL_OPTIONS.openrouter.map(m => `<option value="${m}" ${settings.openrouterModelName === m ? 'selected' : ''}>${m}</option>`).join('')}
                        <option value="custom" ${!MODEL_OPTIONS.openrouter.includes(settings.openrouterModelName) ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input type="text" id="setting-openrouter-model" value="${settings.openrouterModelName}" placeholder="Enter model name">
                </div>
            </div>

            <!-- Groq Settings -->
            <div id="groq-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'groq' ? 'flex' : 'none'};">
                <div class="summary-setting"><label>Groq API Key</label><input type="password" id="setting-groq-key" value="${settings.groqApiKey}"></div>
                <div class="summary-setting"><label>Groq Model</label>
                    <select id="setting-groq-model-select">
                        ${MODEL_OPTIONS.groq.map(m => `<option value="${m}" ${settings.groqModelName === m ? 'selected' : ''}>${m}</option>`).join('')}
                        <option value="custom" ${!MODEL_OPTIONS.groq.includes(settings.groqModelName) ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input type="text" id="setting-groq-model" value="${settings.groqModelName}" placeholder="Enter model name">
                </div>
            </div>

            <!-- Cerebras Settings -->
            <div id="cerebras-settings" class="api-settings-group" style="display: ${settings.apiProvider === 'cerebras' ? 'flex' : 'none'};">
                <div class="summary-setting"><label>Cerebras API Key</label><input type="password" id="setting-cerebras-key" value="${settings.cerebrasApiKey}"></div>
                <div class="summary-setting"><label>Cerebras Model</label>
                    <select id="setting-cerebras-model-select">
                        ${MODEL_OPTIONS.cerebras.map(m => `<option value="${m}" ${settings.cerebrasModelName === m ? 'selected' : ''}>${m}</option>`).join('')}
                        <option value="custom" ${!MODEL_OPTIONS.cerebras.includes(settings.cerebrasModelName) ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input type="text" id="setting-cerebras-model" value="${settings.cerebrasModelName}" placeholder="Enter model name">
                </div>
            </div>

            <div class="summary-setting-row" style="margin-top: 5px;">
                <div class="summary-setting"><label>Popup Width</label><input type="text" id="setting-width" value="${settings.width}"></div>
                <div class="summary-setting"><label>Popup Height</label><input type="text" id="setting-height" value="${settings.height}"></div>
            </div>

            <div class="summary-setting-row">
                <div class="summary-setting" style="flex-direction: row; align-items: center; justify-content: space-between;">
                    <label>Typewriter Effect</label>
                    <label class="summary-switch"><input type="checkbox" id="setting-typewriter-toggle" ${settings.typewriterEnabled !== false ? 'checked' : ''}><span class="summary-slider"></span></label>
                </div>
                <div class="summary-setting">
                    <label>Speed (ms/char)</label>
                    <input type="number" id="setting-typewriter-speed" value="${settings.typewriterSpeed}" min="1" max="100">
                </div>
            </div>

            <div class="summary-setting"><label>Language</label><select id="setting-language">${languages.map(lang => `<option value="${lang}" ${settings.language === lang ? 'selected' : ''}>${lang}</option>`).join('')}</select></div>
            <div class="summary-setting"><label>Font Type</label><select id="setting-font-family">${fontFamilies.map(font => `<option value="${font}" ${settings.fontFamily === font ? 'selected' : ''}>${font.split(',')[0].replace(/'/g, '')}</option>`).join('')}</select></div>
            <div class="summary-setting"><label>Font Size</label><select id="setting-font-size">${fontSizes.map(size => `<option value="${size}" ${settings.fontSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select></div>
            ${ttsSupported ? `
            <div class="summary-setting"><label>TTS Provider</label>
                <select id="setting-tts-provider">
                    <option value="system" ${settings.ttsProvider === 'system' ? 'selected' : ''}>System Voices</option>
                    <option value="elevenlabs" ${settings.ttsProvider === 'elevenlabs' ? 'selected' : ''}>ElevenLabs</option>
                </select>
            </div>
            <div id="system-tts-settings" style="display: ${settings.ttsProvider === 'system' ? 'block' : 'none'};">
                <div class="summary-setting"><label>System Voice</label><select id="setting-voice-select">${availableVoices.map(voice => `<option value="${voice.voiceURI}" ${settings.selectedVoiceURI === voice.voiceURI ? 'selected' : ''}>${voice.name} (${voice.lang})</option>`).join('')}</select></div>
            </div>
            <div id="elevenlabs-tts-settings" class="api-settings-group" style="display: ${settings.ttsProvider === 'elevenlabs' ? 'flex' : 'none'};">
                 <div class="summary-setting"><label>ElevenLabs API Key</label><input type="password" id="setting-eleven-key" value="${settings.elevenlabsApiKey}"></div>
                 <div class="summary-setting"><label>ElevenLabs Voice</label><select id="setting-eleven-voice-select"><option>Enter API key to load voices...</option></select></div>
            </div>
            ` : ''}
            <div class="summary-setting"><label>Dark Mode</label><label class="summary-switch"><input type="checkbox" id="setting-dark-mode" ${settings.darkMode ? 'checked' : ''}><span class="summary-slider"></span></label></div>
            <button id="setting-save-btn">Save Settings</button>
        `;

        const providerSelect = settingsView.querySelector('#setting-provider');
        providerSelect.addEventListener('change', () => {
            const val = providerSelect.value;
            settingsView.querySelector('#gemini-settings').style.display = val === 'gemini' ? 'flex' : 'none';
            settingsView.querySelector('#openrouter-settings').style.display = val === 'openrouter' ? 'flex' : 'none';
            settingsView.querySelector('#groq-settings').style.display = val === 'groq' ? 'flex' : 'none';
            settingsView.querySelector('#cerebras-settings').style.display = val === 'cerebras' ? 'flex' : 'none';
        });

        const bindModelSelect = (selectId, inputId) => {
            const sel = settingsView.querySelector('#' + selectId);
            const inp = settingsView.querySelector('#' + inputId);
            if (sel && inp) {
                sel.addEventListener('change', () => {
                    if (sel.value !== 'custom') inp.value = sel.value;
                    else inp.focus();
                });
            }
        };
        bindModelSelect('setting-gemini-model-select', 'setting-gemini-model');
        bindModelSelect('setting-openrouter-model-select', 'setting-openrouter-model');
        bindModelSelect('setting-groq-model-select', 'setting-groq-model');
        bindModelSelect('setting-cerebras-model-select', 'setting-cerebras-model');

        if (ttsSupported) {
            const ttsProviderSelect = settingsView.querySelector('#setting-tts-provider');
            const elevenKeyInput = settingsView.querySelector('#setting-eleven-key');
            const toggleTtsSettings = () => {
                const isEleven = ttsProviderSelect.value === 'elevenlabs';
                settingsView.querySelector('#system-tts-settings').style.display = isEleven ? 'none' : 'block';
                settingsView.querySelector('#elevenlabs-tts-settings').style.display = isEleven ? 'flex' : 'none';
                if (isEleven) fetchAndPopulateElevenLabsVoices();
            };
            ttsProviderSelect.addEventListener('change', toggleTtsSettings);
            elevenKeyInput.addEventListener('change', fetchAndPopulateElevenLabsVoices);
            toggleTtsSettings();
        }

        settingsView.querySelector('#setting-save-btn').addEventListener('click', () => {
            Object.assign(settings, {
                apiProvider: document.getElementById('setting-provider').value,
                geminiApiKey: document.getElementById('setting-gemini-key').value.trim(),
                geminiModelName: document.getElementById('setting-gemini-model').value.trim(),
                openrouterApiKey: document.getElementById('setting-openrouter-key').value.trim(),
                openrouterModelName: document.getElementById('setting-openrouter-model').value.trim(),
                groqApiKey: document.getElementById('setting-groq-key').value.trim(),
                groqModelName: document.getElementById('setting-groq-model').value.trim(),
                cerebrasApiKey: document.getElementById('setting-cerebras-key').value.trim(),
                cerebrasModelName: document.getElementById('setting-cerebras-model').value.trim(),
                typewriterEnabled: document.getElementById('setting-typewriter-toggle').checked,
                typewriterSpeed: parseInt(document.getElementById('setting-typewriter-speed').value, 10) || 12,
                language: document.getElementById('setting-language').value,
                fontFamily: document.getElementById('setting-font-family').value,
                fontSize: document.getElementById('setting-font-size').value,
                darkMode: document.getElementById('setting-dark-mode').checked,
                width: document.getElementById('setting-width').value.trim(),
                height: document.getElementById('setting-height').value.trim()
            });
            if (ttsSupported) {
                 settings.ttsProvider = document.getElementById('setting-tts-provider').value;
                 settings.selectedVoiceURI = document.getElementById('setting-voice-select').value;
                 settings.elevenlabsApiKey = document.getElementById('setting-eleven-key').value.trim();
                 settings.elevenlabsVoiceId = document.getElementById('setting-eleven-voice-select').value;
            }
            saveSettings();
            hideSettingsPanel();
        });
    }

    function hideSettingsPanel() {
        document.getElementById('summary-settings-view').style.display = 'none';
        document.getElementById('summary-main-view').style.display = 'flex';
    }

    // --- TYPEWRITER ENGINE ---
    async function typeWriteHTML(element, htmlString, speed, onComplete) {
        currentTypingId++;
        const myTypingId = currentTypingId;
        const isEnabled = settings.typewriterEnabled !== false;

        element.innerHTML = '';

        if (!isEnabled) {
            element.innerHTML = htmlString;
            const container = document.getElementById('summary-content-wrapper');
            if (container) container.scrollTop = container.scrollHeight;
            if (onComplete) onComplete();
            return;
        }

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

                    const container = document.getElementById('summary-content-wrapper');
                    if (container) container.scrollTop = container.scrollHeight;

                    const delay = speed + (Math.random() * 8 - 4);
                    await new Promise(r => setTimeout(r, Math.max(1, delay)));
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

        if (myTypingId === currentTypingId && onComplete) {
            onComplete();
        }
    }

    // --- UI CREATION ---
    function createSummaryPanel() {
        if (document.getElementById('summary-panel-container')) return;

        summaryPanel = document.createElement('div');
        summaryPanel.id = 'summary-panel-container';
        const speakButtonHTML = ttsSupported ? `<button id="summary-speak-btn" class="summary-header-btn" title="Read Aloud">${SPEAK_ICON}</button>` : '';

        summaryPanel.innerHTML = `
            <div id="summary-header">
                ${speakButtonHTML}
                <button id="summary-settings-btn" class="summary-header-btn" title="Settings">${SETTINGS_ICON_SVG}</button>
                <button id="summary-close-btn" class="summary-header-btn" title="Close">✕</button>
            </div>
            <div id="summary-main-view">
                <div id="summary-content-wrapper"></div>
                <div id="summary-footer">
                    <div id="summary-chat-input-wrapper">
                        <input type="text" id="summary-chat-input" placeholder="Ask a follow-up question...">
                        <button id="summary-chat-submit">${SUBMIT_ICON_SVG}</button>
                    </div>
                </div>
            </div>
            <div id="summary-settings-view" style="display: none;"></div>
        `;
        document.body.appendChild(summaryPanel);
        applySettingsStyles();

        summaryPanel.querySelector('#summary-close-btn').onclick = hideSummaryPanel;
        summaryPanel.querySelector('#summary-settings-btn').onclick = showSettingsPanel;
        if (ttsSupported) summaryPanel.querySelector('#summary-speak-btn').onclick = handleSpeakButtonClick;

        const chatInput = summaryPanel.querySelector('#summary-chat-input');
        const chatSubmit = summaryPanel.querySelector('#summary-chat-submit');
        chatSubmit.onclick = () => handleFollowUp(chatInput.value.trim());
        chatInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSubmit.click(); }
        };
    }

    function showSummaryPanel(url = null) {
        if (!summaryPanel) createSummaryPanel();
        hideSettingsPanel();
        stopAllTTS();
        summaryPanel.style.display = 'flex';
        void summaryPanel.offsetWidth;
        summaryPanel.style.opacity = '1';
        summaryPanel.style.transform = 'translateY(0)';
    }

    function hideSummaryPanel() {
        if (!summaryPanel || summaryPanel.style.opacity === '0') return;
        currentTypingId++;
        stopAllTTS();
        summaryPanel.style.opacity = '0';
        summaryPanel.style.transform = 'translateY(10px)';
        setTimeout(() => { if (summaryPanel && summaryPanel.style.opacity === '0') summaryPanel.style.display = 'none'; }, 200);
        currentUrl = null;
        summaryRequestActive = false;
        clearTimeout(hoverTimeout);
    }

    // --- TTS ---
    async function loadAndPopulateVoices() { if (!ttsSupported) return; const populate = () => { availableVoices = window.speechSynthesis.getVoices(); if (!availableVoices.length) return; if (!settings.selectedVoiceURI) settings.selectedVoiceURI = availableVoices[0].voiceURI; }; window.speechSynthesis.onvoiceschanged = populate; populate(); }
    function setSpeakButtonState(speaking) { const btn = summaryPanel?.querySelector('#summary-speak-btn'); if (btn) { btn.innerHTML = speaking ? STOP_ICON : SPEAK_ICON; btn.title = speaking ? "Stop Reading" : "Read Aloud"; } isSpeaking = speaking; if (!speaking) currentUtterance = null; }

    function stopAllTTS() {
        if (ttsSupported && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
        if (elevenLabsAudio) {
            elevenLabsAudio.pause();
            if (elevenLabsAudio.src && elevenLabsAudio.src.startsWith('blob:')) URL.revokeObjectURL(elevenLabsAudio.src);
            elevenLabsAudio = null;
        }
        setSpeakButtonState(false);
    }

    function playWithSystemTTS(text) {
        window.speechSynthesis.cancel();
        currentUtterance = new SpeechSynthesisUtterance(text);
        if (settings.selectedVoiceURI) {
            const voice = availableVoices.find(v => v.voiceURI === settings.selectedVoiceURI);
            if (voice) currentUtterance.voice = voice;
        }
        currentUtterance.onstart = () => setSpeakButtonState(true);
        currentUtterance.onend = () => setSpeakButtonState(false);
        currentUtterance.onerror = () => setSpeakButtonState(false);
        window.speechSynthesis.speak(currentUtterance);
    }

    function playWithElevenLabs(text) {
        if (!settings.elevenlabsApiKey || !settings.elevenlabsVoiceId) { alert("ElevenLabs API Key and Voice ID must be set."); showSettingsPanel(); return; }
        setSpeakButtonState(true);
        GM_xmlhttpRequest({
            method: 'POST', url: `https://api.elevenlabs.io/v1/text-to-speech/${settings.elevenlabsVoiceId}`,
            headers: { 'Content-Type': 'application/json', 'xi-api-key': settings.elevenlabsApiKey },
            data: JSON.stringify({ text: text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
            responseType: 'blob',
            onload: function(response) {
                if (response.status === 200) {
                    elevenLabsAudio = new Audio(URL.createObjectURL(response.response));
                    elevenLabsAudio.play();
                    elevenLabsAudio.onended = () => stopAllTTS();
                    elevenLabsAudio.onerror = () => { alert('Error playing audio from ElevenLabs.'); stopAllTTS(); };
                } else { alert(`ElevenLabs API Error (Status: ${response.status}). Check API key.`); stopAllTTS(); }
            },
            onerror: function() { alert('Network error connecting to ElevenLabs.'); stopAllTTS(); }
        });
    }

    async function fetchAndPopulateElevenLabsVoices() {
        const apiKey = document.getElementById('setting-eleven-key').value.trim();
        const select = document.getElementById('setting-eleven-voice-select');
        if (!apiKey) { select.innerHTML = '<option>API key is required.</option>'; return; }
        select.innerHTML = '<option>Loading voices...</option>';
        GM_xmlhttpRequest({
            method: 'GET', url: ELEVENLABS_API_VOICES_ENDPOINT, headers: { 'xi-api-key': apiKey }, responseType: 'json',
            onload: function(response) {
                if (response.status === 200 && response.response?.voices) {
                    select.innerHTML = response.response.voices.map(voice => `<option value="${voice.voice_id}" ${settings.elevenlabsVoiceId === voice.voice_id ? 'selected' : ''}>${voice.name}</option>`).join('');
                } else { select.innerHTML = '<option>Failed to load voices. Check API key.</option>'; }
            },
            onerror: function() { select.innerHTML = '<option>Network error fetching voices.</option>'; }
        });
    }

    function handleSpeakButtonClick() {
        if (!ttsSupported || !summaryPanel) return;
        if (isSpeaking) { stopAllTTS(); } else {
            const responseElements = summaryPanel.querySelectorAll('.summary-response-content');
            if (responseElements.length === 0) return;
            const textToSpeak = Array.from(responseElements).map(el => el.innerText).join('\n');
            if (!textToSpeak) return;
            if (settings.ttsProvider === 'elevenlabs') playWithElevenLabs(textToSpeak); else playWithSystemTTS(textToSpeak);
        }
    }

    // --- CORE LOGIC & API CALLS ---
    function isValidUrl(url) { try { if (!url || ['javascript:', 'mailto:', 'data:', '#'].some(p => url.startsWith(p))) return false; const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol); } catch (_) { return false; } }

    function extractMainContent(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            doc.querySelectorAll('script, style, head, header, footer, nav, aside, form, noscript, iframe, svg, [aria-hidden="true"]').forEach(el => el.remove());

            let body = doc.querySelector('.TEXT-BLOCK') || doc.querySelector('.page-body') || doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('[role="main"]') || doc.body;
            if (!body) return '';

            let paragraphs = body.querySelectorAll('p, h1, h2, h3, h4, li');
            let combinedText = "";
            if (paragraphs.length > 2) {
                paragraphs.forEach(p => { combinedText += p.textContent + " "; });
            } else {
                combinedText = body.textContent || "";
            }
            return combinedText.replace(/\s{2,}/g, ' ').trim().substring(0, MAX_CONTENT_LENGTH);
        } catch (e) { return "Could not extract content."; }
    }

    function getSummaryFromApi() {
        return new Promise((resolve) => {
            const handleApiKeyError = (provider) => { resolve(`<b>❌ Error: Invalid ${provider} API Key.</b><br>Please check your key in settings.`); showSettingsPanel(); };

            if (settings.apiProvider === 'gemini') {
                const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModelName || 'gemini-2.5-flash-lite'}:generateContent`;
                GM_xmlhttpRequest({
                    method: 'POST', url: geminiEndpoint,
                    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': settings.geminiApiKey },
                    data: JSON.stringify({ contents: conversationHistory }), responseType: 'json', timeout: 25000,
                    onload: function(response) {
                        try {
                            if (response.status === 200 && response.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                                let summary = response.response.candidates[0].content.parts[0].text;
                                summary = summary.replace(/\*\*/g, '').replace(/^\s*[\*•-]\s*/gm, '• ').replace(/\n/g, '<br>');
                                conversationHistory.push({ role: "model", parts: [{ text: summary }] });
                                resolve(summary.trim());
                            } else if (response.response?.error) {
                                const err = response.response.error;
                                resolve(`<b>❌ Gemini API Error (${response.status} ${err.status || ''}):</b><br>${err.message || 'Unknown error'}`);
                            } else if (response.response?.promptFeedback) {
                                resolve(`❌ Summary blocked (Reason: ${response.response.promptFeedback.blockReason || 'Unknown'}).`);
                            } else {
                                resolve(`❌ Error: API request failed with HTTP Status ${response.status}.`);
                            }
                        } catch (e) { resolve("❌ Error: Failed to process Gemini response."); }
                    },
                    onerror: function() { resolve("❌ Error: Could not connect to Gemini API."); },
                    ontimeout: function() { resolve("❌ Error: API request timed out."); }
                });
            } else if (settings.apiProvider === 'openrouter') {
                GM_xmlhttpRequest({
                     method: 'POST', url: OPENROUTER_API_ENDPOINT,
                     headers: {
                         'Content-Type': 'application/json',
                         'Authorization': `Bearer ${settings.openrouterApiKey}`,
                         'HTTP-Referer': window.location.origin || 'https://github.com',
                         'X-Title': 'Inline AI Summaries'
                     },
                     data: JSON.stringify({
                         model: settings.openrouterModelName || 'meta-llama/llama-3.3-70b-instruct',
                         messages: conversationHistory.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.parts[0].text })),
                         temperature: 0.6,
                         max_tokens: 500
                     }), responseType: 'json',
                     onload: function(response) {
                        if (response.status === 401 || response.status === 403) { handleApiKeyError('OpenRouter'); return; }
                        if (response.status === 200 && response.response?.choices?.[0]?.message?.content) {
                            let summary = response.response.choices[0].message.content;
                            conversationHistory.push({ role: "model", parts: [{ text: summary }] });
                            resolve(summary.replace(/\n/g, '<br>'));
                        } else { resolve(`<b>Error:</b> API request failed (Status: ${response.status}).`); }
                     },
                     onerror: function() { resolve("<b>Error:</b> Could not connect to the OpenRouter API."); }
                });
            } else if (settings.apiProvider === 'groq') {
                GM_xmlhttpRequest({
                     method: 'POST', url: GROQ_API_ENDPOINT,
                     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.groqApiKey}` },
                     data: JSON.stringify({ model: settings.groqModelName || 'llama-3.3-70b-versatile', messages: conversationHistory.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.parts[0].text })), temperature: 0.6, max_tokens: 500 }), responseType: 'json',
                     onload: function(response) {
                        if (response.status === 401 || response.status === 403) { handleApiKeyError('Groq'); return; }
                        if (response.status === 200 && response.response?.choices?.[0]?.message?.content) {
                            let summary = response.response.choices[0].message.content;
                            conversationHistory.push({ role: "model", parts: [{ text: summary }] });
                            resolve(summary.replace(/\n/g, '<br>'));
                        } else { resolve(`<b>Error:</b> API request failed (Status: ${response.status}).`); }
                     },
                     onerror: function() { resolve("<b>Error:</b> Could not connect to the Groq API."); }
                });
            } else if (settings.apiProvider === 'cerebras') {
                const model = settings.cerebrasModelName || 'gpt-oss-120b';
                const payload = {
                    model: model,
                    messages: conversationHistory.map(h => ({
                        role: h.role === 'model' ? 'assistant' : h.role,
                        content: h.parts[0].text
                    })),
                    temperature: 0.6,
                    max_completion_tokens: 2048
                };

                if (model.includes('qwen')) {
                    payload.reasoning_effort = 'none';
                } else if (model.includes('gpt-oss')) {
                    payload.reasoning_effort = 'low';
                }

                GM_xmlhttpRequest({
                     method: 'POST',
                     url: CEREBRAS_API_ENDPOINT,
                     headers: {
                         'Content-Type': 'application/json',
                         'Authorization': `Bearer ${settings.cerebrasApiKey}`
                     },
                     data: JSON.stringify(payload),
                     responseType: 'json',
                     onload: function(response) {
                        if (response.status === 401 || response.status === 403) {
                            handleApiKeyError('Cerebras');
                            return;
                        }

                        const data = response.response;
                        const content = data?.choices?.[0]?.message?.content;

                        if (response.status === 200 && content) {
                            let summary = content;
                            conversationHistory.push({ role: "model", parts: [{ text: summary }] });
                            resolve(summary.replace(/\n/g, '<br>'));
                        } else if (data?.error?.message) {
                            resolve(`<b>❌ Cerebras Error (${response.status}):</b><br>${data.error.message}`);
                        } else {
                            resolve(`<b>Error:</b> API request failed (Status: ${response.status}).`);
                        }
                     },
                     onerror: function() {
                         resolve("<b>Error:</b> Could not connect to the Cerebras API.");
                     }
                });
            }
        });
    }

    async function processRequest(titleText) {
        const contentWrapper = document.getElementById('summary-content-wrapper');
        const block = document.createElement('div'); block.className = 'summary-response-block';
        const header = document.createElement('div'); header.className = 'summary-response-header';
        const title = document.createElement('div'); title.className = 'summary-response-title'; title.textContent = titleText;
        const copyButton = document.createElement('button'); copyButton.className = 'summary-copy-btn'; copyButton.title = 'Copy'; copyButton.innerHTML = COPY_ICON_SVG; copyButton.style.display = 'none';
        header.append(title, copyButton);
        const responseDiv = document.createElement('div'); responseDiv.className = 'summary-response-content'; responseDiv.innerHTML = `<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>`;
        block.append(header, responseDiv); contentWrapper.appendChild(block); contentWrapper.scrollTop = contentWrapper.scrollHeight;

        const result = await getSummaryFromApi();

        typeWriteHTML(responseDiv, result, settings.typewriterSpeed, () => {
            copyButton.style.display = 'flex';
            contentWrapper.scrollTop = contentWrapper.scrollHeight;
        });

        copyButton.onclick = function() { navigator.clipboard.writeText(responseDiv.innerText).then(() => { copyButton.textContent = 'Copied!'; setTimeout(() => { copyButton.innerHTML = COPY_ICON_SVG; }, 1500); }); };
    }

    async function handleInitialSummarize(url) {
        if (summaryRequestActive && url === currentUrl) return;
        currentUrl = url; summaryRequestActive = true; conversationHistory = []; pageContentForContext = "";
        showSummaryPanel(url);

        const contentWrapper = document.getElementById('summary-content-wrapper');
        contentWrapper.innerHTML = '';

        if ((settings.apiProvider === 'gemini' && !settings.geminiApiKey) ||
            (settings.apiProvider === 'openrouter' && !settings.openrouterApiKey) ||
            (settings.apiProvider === 'groq' && !settings.groqApiKey) ||
            (settings.apiProvider === 'cerebras' && !settings.cerebrasApiKey)) {
             contentWrapper.innerHTML = `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ API Key for ${settings.apiProvider} is missing. Please add it in settings.</div></div>`;
             showSettingsPanel(); summaryRequestActive = false; return;
        }

        contentWrapper.innerHTML = `<div class="summary-status-message">⏳ Fetching page content...</div>`;
        let fetchUrl = url;
        try {
            const urlObj = new URL(url);
            const paywallDomains = ['nytimes.com', 'reuters.com', 'bloomberg.com', 'latimes.com', 'wsj.com', 'ft.com', 'washingtonpost.com'];
            if (paywallDomains.some(d => urlObj.hostname.includes(d))) fetchUrl = `https://archive.is/newest/${url}`;
        } catch(e) { }

        const doFetch = (targetUrl, attempt = 1) => {
            GM_xmlhttpRequest({
                method: 'GET', url: targetUrl, responseType: 'text', timeout: 15000, anonymous: true,
                headers: { "User-Agent": navigator.userAgent, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
                onload: async function(response) {
                    let textLength = 0;
                    if (response.status >= 200 && response.status < 300) {
                        pageContentForContext = extractMainContent(response.responseText);
                        textLength = pageContentForContext.length;
                    }

                    if (attempt === 1 && targetUrl.includes('archive.') && (response.status === 404 || textLength < 100)) {
                        contentWrapper.innerHTML = `<div class="summary-status-message">⚠️ Not in archive yet. Trying direct URL fallback...</div>`;
                        doFetch(url, 2);
                        return;
                    }

                    if (attempt === 1 && !targetUrl.includes('archive.') && (response.status === 401 || response.status === 403 || textLength < 300)) {
                        contentWrapper.innerHTML = `<div class="summary-status-message">🧱 Blocked or JS-wall detected. Routing via Archive.is...</div>`;
                        doFetch(`https://archive.is/newest/${url}`, 2);
                        return;
                    }

                    if (response.status >= 200 && response.status < 300) {
                        contentWrapper.innerHTML = `<div class="summary-status-message">⌛ Extracting main content...</div>`;

                        if (textLength < 100) {
                             contentWrapper.innerHTML = `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ Could not extract sufficient content. The page might be restricted or require CAPTCHA.</div></div>`;
                             summaryRequestActive = false; return;
                        }

                        contentWrapper.innerHTML = '';
                        let prompt = (settings.apiProvider === 'openrouter' || settings.apiProvider === 'groq' || settings.apiProvider === 'cerebras')
                            ? `Generate a concise summary in ${settings.language} of the following web page content. Provide 3 to 5 bullet points that directly present the main topic and conclusions. Do not include any introductory sentences or phrases before the bullet points. Content:\n\n"${pageContentForContext}"`
                            : `Generate a concise summary in ${settings.language} of the following web page content. Provide 3-5 bullet points. Do not use markdown formatting like asterisks for bolding. Directly start with the bullet points without any introductory phrases. Content:\n\n"${pageContentForContext}"`;

                        conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
                        await processRequest("Summary");
                    } else {
                        if (targetUrl.includes('archive.') && response.status === 404) {
                            contentWrapper.innerHTML = `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ Article is heavily restricted and no snapshot exists on archive.is yet.</div></div>`;
                        } else {
                            contentWrapper.innerHTML = `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ Error fetching page (Status: ${response.status}).</div></div>`;
                        }
                    }
                    summaryRequestActive = false;
                },
                onerror: function() { contentWrapper.innerHTML = `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ Network error fetching page.</div></div>`; summaryRequestActive = false; },
                ontimeout: function() { contentWrapper.innerHTML = `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ Timeout fetching page.</div></div>`; summaryRequestActive = false; }
            });
        };
        doFetch(fetchUrl, 1);
    }

    async function handleFollowUp(text) {
        if (!text) return;
        document.getElementById('summary-chat-input').value = '';
        let prompt = text;
        if (conversationHistory.length <= 2) prompt = `Based on the previous web page content, please answer the following question: "${text}". Web page content for context: \n\n"${pageContentForContext}"`;
        conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
        await processRequest(text);
    }

    // --- DESKTOP EVENT LISTENERS ---
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && summaryPanel && summaryPanel.style.display !== 'none') hideSummaryPanel();
    }, true);

    document.addEventListener('keyup', (event) => {
        if (event.key === 'Control') { clearTimeout(hoverTimeout); }
    }, true);

    document.body.addEventListener('mouseover', (event) => {
        if (!event.ctrlKey) { clearTimeout(hoverTimeout); return; }

        const path = event.composedPath ? event.composedPath() : [event.target];
        let targetLink = null;
        for (let node of path) {
            if (node.tagName === 'A' && node.href) { targetLink = node; break; }
        }

        if (targetLink && isValidUrl(targetLink.href)) {
            clearTimeout(hoverTimeout);
            const url = targetLink.href;
            if (url === currentUrl && summaryPanel && summaryPanel.style.display !== 'none') return;
            hoverTimeout = setTimeout(() => { handleInitialSummarize(url); }, HOVER_DELAY_MS);
        }
    });

    document.body.addEventListener('mouseout', (event) => {
        const path = event.composedPath ? event.composedPath() : [event.target];
        if (path.some(node => node.tagName === 'A')) clearTimeout(hoverTimeout);
    });

    document.addEventListener('click', (event) => {
        if (event.button === 0 && summaryPanel && summaryPanel.style.display !== 'none' && !summaryPanel.contains(event.target)) hideSummaryPanel();
    }, true);

    // --- INITIALIZATION ---
    function initialize() {
        loadSettings().then(() => {
            if (ttsSupported) loadAndPopulateVoices();
            createSummaryPanel(); hideSummaryPanel();
            GM_registerMenuCommand("AI Summaries Settings", showSettingsPanel);
        });
    }

    GM_addStyle(`
        :root{--bg-primary:#1e1e1e;--bg-secondary:#252526;--bg-tertiary:#333;--text-primary:#d4d4d4;--text-secondary:#9cdcfe;--accent-color:#4a90e2}
        #summary-panel-container { position:fixed; bottom: 20px; right: 20px; z-index:2147483647; width:var(--popup-width) !important; max-height:var(--popup-max-height) !important; background-color:var(--bg-primary); color:var(--text-primary); border:1px solid var(--bg-tertiary); border-radius:8px; box-shadow:0 8px 30px rgba(0,0,0,.5); display:none; flex-direction:column; font-family:var(--font-family); resize:both; overflow:hidden; opacity:0; transition: opacity .2s ease, transform .2s ease; transform: translateY(10px); overscroll-behavior: contain; }
        #summary-panel-container:not(.dark-mode){--bg-primary:#fff;--bg-secondary:#f3f3f3;--bg-tertiary:#ddd;--text-primary:#222;--text-secondary:#005a9e}
        #summary-header { display:flex; justify-content:flex-end; align-items:center; padding:4px 8px; cursor:default; background-color:var(--bg-secondary); border-bottom:1px solid var(--bg-tertiary); flex-shrink:0; }
        .summary-header-btn{ background:0 0; border:none; color:var(--text-primary); cursor:pointer; font-size:18px; opacity:.7; padding:4px; display:flex; align-items:center; justify-content:center; }
        .summary-header-btn:hover{ opacity:1; } .summary-header-btn svg{ width:20px; height:20px; }
        #summary-main-view { display:flex; flex-direction:column; overflow:hidden; flex-grow:1; }
        #summary-content-wrapper { padding:15px; overflow-y:auto; flex-grow:1; font-size: var(--font-size) !important; overscroll-behavior: contain; }
        .summary-response-block { margin-top: 15px; border-top: 1px dashed var(--bg-tertiary); padding-top: 12px; }
        .summary-response-block:first-child { margin-top: 0; border-top: none; padding-top: 0; }
        .summary-response-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px;}
        .summary-response-title { font-weight:700; color:var(--text-secondary); flex-grow: 1; }
        .summary-response-content{ font-size: var(--font-size) !important; line-height:1.6; }
        .summary-status-message { font-style: italic; opacity: 0.8; padding: 15px; text-align: center; }
        #summary-footer { display:block; padding:10px; background-color:var(--bg-secondary); border-top:1px solid var(--bg-tertiary); flex-shrink:0; }
        #summary-chat-input-wrapper { display:flex; gap:8px; }
        #summary-chat-input { flex-grow:1; background-color:var(--bg-tertiary); border:1px solid #444; color:var(--text-primary); border-radius:20px; padding:8px 15px; font-size:14px; }
        #summary-chat-input:focus { outline:0; border-color:var(--accent-color); }
        #summary-chat-submit { background:var(--accent-color); border:none; border-radius:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
        #summary-chat-submit svg { fill:#fff; width:15px; height:15px; }
        #summary-settings-view { display:none; flex-direction:column; padding:20px; gap:15px; overflow-y:auto; overscroll-behavior: contain; }
        #summary-settings-view h2 { text-align:center; margin:0 0 10px 0; color:var(--text-secondary); }
        .summary-setting { display:flex; flex-direction:column; gap:5px; }
        .summary-setting-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: end; }
        .api-settings-group { flex-direction: column; gap: 12px; border: 1px solid var(--bg-tertiary); padding: 10px; border-radius: 6px; }
        #summary-settings-view input, #summary-settings-view select { width:100%; box-sizing: border-box; padding:8px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--bg-tertiary); border-radius:4px; }
        #setting-save-btn { padding:10px; background:var(--accent-color); color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700; margin-top:10px;}
        .summary-switch { position:relative; display:inline-block; width:50px; height:24px; } .summary-switch input { opacity:0; width:0; height:0; }
        .summary-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:34px; } .summary-slider:before { position:absolute; content:""; height:16px; width:16px; left:4px; bottom:4px; background-color:white; transition:.4s; border-radius:50%; }
        input:checked + .summary-slider { background-color:var(--accent-color); } input:checked + .summary-slider:before { transform:translateX(26px); }
        .loading-dots span{ animation:blink 1.4s infinite both; } .loading-dots span:nth-of-type(2){animation-delay:.2s;} .loading-dots span:nth-of-type(3){animation-delay:.4s;} @keyframes blink{0%,100%{opacity:.2}20%{opacity:1}}
        .summary-copy-btn { background:0 0; border: none; color: var(--text-primary); cursor: pointer; opacity: 0.4; display: flex; align-items: center; justify-content: center; padding: 3px; transition: opacity 0.2s; flex-shrink: 0; }
        .summary-response-block:hover .summary-copy-btn { opacity: 1; }
    `);

    if (document.readyState === 'complete' || document.readyState === 'interactive') initialize();
    else window.addEventListener('DOMContentLoaded', initialize);
})();

