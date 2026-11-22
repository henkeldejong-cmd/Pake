(function() {
    'use strict';

    // --- STATE & CONFIGURATION ---
    let conversationHistory = [];
    let lastSelectionRects = null;
    let currentTypingId = 0;
    let windowResizeHandler = null;

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
        fontSize: '15px',
        fontFamily: "system-ui, -apple-system, sans-serif",
        darkMode: true,
        compactMode: false,
        language: 'English',
        width: '450px',
        height: '520px',
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
    const EX_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#a855f7" /><stop offset="100%" stop-color="#6b21a8" /></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#purpleGrad)" /><text x="50" y="68" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="bold" font-size="65" fill="#ffffff" text-anchor="middle">e</text></svg>`;
    let EX_ICON_BASE64;
    try {
        EX_ICON_BASE64 = 'data:image/svg+xml;base64,' + btoa(EX_ICON_SVG);
    } catch (e) {
        EX_ICON_BASE64 = 'data:image/svg+xml;utf8,' + encodeURIComponent(EX_ICON_SVG);
    }
    const SETTINGS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    const SUBMIT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    const CLOSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    const BACK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

    const POPUP_HTML = `
        <div id="ex-header">
            <div id="ex-header-title">
                <img src="${EX_ICON_BASE64}"> ExplainX
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

    // --- STORAGE LAYER ---------------------------------------------------
    // Keys go to four places so one cleared/failing backend can't wipe them:
    //   main (GM + LS), backup (GM + LS), vault (GM + LS), legacy read-only.
    // Every async GM call is raced against a timeout so the UI never blocks.
    const API_KEY_FIELDS = ['geminiApiKey', 'openrouterApiKey', 'groqApiKey', 'cerebrasApiKey'];
    const STORE_MAIN = 'explainX_settings_json';
    const STORE_BACKUP = 'explainX_settings_json_bak';
    const STORE_VAULT = 'explainX_api_keys_vault';
    const STORE_LEGACY = 'explainX_settings';
    const READ_TIMEOUT_MS = 2500;

    const hasGMAsync = (typeof GM !== 'undefined') && GM &&
                       typeof GM.getValue === 'function' && typeof GM.setValue === 'function';
    const hasGMSync = (typeof GM_getValue === 'function') && (typeof GM_setValue === 'function');

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, rej) => setTimeout(() => rej(new Error('storage-timeout')), ms))
        ]);
    }

    async function storageRead(key) {
        let val = null;
        try {
            if (hasGMAsync) {
                val = await withTimeout(GM.getValue(key, null), READ_TIMEOUT_MS);
            } else if (hasGMSync) {
                val = GM_getValue(key, null);
            }
        } catch (e) {
            console.warn('ExplainX: GM read failed for', key, e && e.message);
        }
        if (val === null || val === undefined || val === '') {
            try { val = localStorage.getItem(key); } catch (e) { /* storage disabled */ }
        }
        return (val === null || val === undefined || val === '') ? null : val;
    }

    async function storageWrite(key, value) {
        let ok = false;
        try {
            if (hasGMAsync) {
                await withTimeout(GM.setValue(key, value), READ_TIMEOUT_MS);
                ok = true;
            } else if (hasGMSync) {
                GM_setValue(key, value);
                ok = true;
            }
        } catch (e) {
            console.warn('ExplainX: GM write failed for', key, e && e.message);
        }
        try { localStorage.setItem(key, value); ok = true; } catch (e) { /* quota / disabled */ }
        return ok;
    }

    function safeParse(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        // Shim's GM_getValue already JSON-parses valid JSON strings and returns
        // an object, so accept objects directly instead of rejecting them.
        if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
        if (typeof raw !== 'string') return null;
        try {
            const obj = JSON.parse(raw);
            return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
        } catch (e) { return null; }
    }

    function scoreSettings(obj) {
        if (!obj) return -1;
        let score = 0;
        for (const k of API_KEY_FIELDS) {
            if (obj[k] && String(obj[k]).trim()) score += 10;
        }
        score += Object.keys(obj).length > 0 ? 1 : 0;
        return score;
    }

    // --- SETTINGS MANAGEMENT ---
    async function loadSettings() {
        let loaded = null;
        try {
            const candidates = [];
            for (const key of [STORE_MAIN, STORE_BACKUP]) {
                const parsed = safeParse(await storageRead(key));
                if (parsed) candidates.push(parsed);
            }
            const legacyRaw = await storageRead(STORE_LEGACY);
            const legacy = safeParse(legacyRaw);
            if (legacy) candidates.push(legacy);

            for (const c of candidates) {
                if (!loaded) { loaded = c; continue; }
                const a = scoreSettings(c), b = scoreSettings(loaded);
                const ta = Number(c._ts) || 0, tb = Number(loaded._ts) || 0;
                if (a > b || (a === b && ta > tb)) loaded = c;
            }
        } catch (e) {
            console.error('ExplainX: settings load error', e);
        }

        settings = { ...DEFAULTS, ...(loaded || {}) };

        // Restore keys from the vault if the main blob came back blank
        let restoredFromVault = false;
        try {
            const vault = safeParse(await storageRead(STORE_VAULT)) || {};
            for (const k of API_KEY_FIELDS) {
                if ((!settings[k] || !String(settings[k]).trim()) && vault[k]) {
                    settings[k] = vault[k];
                    restoredFromVault = true;
                }
            }
        } catch (e) {
            console.warn('ExplainX: vault read failed', e);
        }

        let dirty = false;
        if (typeof settings.iconSize === 'string') { settings.iconSize = parseInt(settings.iconSize, 10) || 36; dirty = true; }
        if (typeof settings.globalScale === 'string') { settings.globalScale = parseFloat(settings.globalScale) || 1.0; dirty = true; }

        if (settings.iconPosition) {
            settings.iconVertical = settings.iconPosition;
            delete settings.iconPosition;
            dirty = true;
        }

        if (settings.geminiModel === 'gemini-2.0-flash' || settings.geminiModel === '--') {
            settings.geminiModel = 'gemini-2.5-flash-lite';
            dirty = true;
        }

        applySettingsStyles();

        if (loaded && (dirty || restoredFromVault)) {
            try { await persistSettings(); } catch (e) { console.warn('ExplainX: persist after load failed', e); }
        }
    }

    async function persistSettings(deletedKeys = []) {
        settings._ts = Date.now();

        const prevRaw = await storageRead(STORE_MAIN);
        if (safeParse(prevRaw)) await storageWrite(STORE_BACKUP, prevRaw);

        const vault = safeParse(await storageRead(STORE_VAULT)) || {};
        for (const k of API_KEY_FIELDS) {
            if (deletedKeys.includes(k)) delete vault[k];
            else if (settings[k] && String(settings[k]).trim()) vault[k] = settings[k];
        }
        await storageWrite(STORE_VAULT, JSON.stringify(vault));
        await storageWrite(STORE_MAIN, JSON.stringify(settings));
    }

    async function saveSettings(deletedKeys = []) {
        await persistSettings(deletedKeys);
        applySettingsStyles();
        showToast('Settings saved successfully!');
    }

    function showToast(message, isError = false) {
        const popup = document.getElementById('ex-popup-container');
        if (!popup) return;
        const toast = document.createElement('div');
        toast.className = 'ex-toast' + (isError ? ' ex-toast-error' : '');
        toast.textContent = message;
        popup.appendChild(toast);
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
        if (!popup) return;

        popup.dataset.prevCenterX = popup.dataset.centerX;
        popup.dataset.prevCenterY = popup.dataset.centerY;
        popup.dataset.centerX = (window.innerWidth / 2).toString();
        popup.dataset.centerY = (window.innerHeight / 2).toString();

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
                <div class="ex-setting"><label>API Provider</label>
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
                    <div class="ex-setting"><label>Type Speed</label><input type="number" id="setting-type-speed" value="${settings.typewriterSpeed}" min="1" max="50"></div>
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

                <div class="ex-setting-row">
                    <div class="ex-setting"><label>Backup Settings</label><button type="button" id="setting-export-btn" class="ex-secondary-btn">Export</button></div>
                    <div class="ex-setting"><label>Restore Settings</label><button type="button" id="setting-import-btn" class="ex-secondary-btn">Import</button></div>
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
            btn.onclick = (e) => {
                const input = document.getElementById(e.target.dataset.target);
                if (input) { input.value = ''; input.dataset.cleared = 'true'; }
            };
        });
        settingsView.querySelectorAll('input[type="password"]').forEach(inp => {
            inp.addEventListener('input', () => { inp.dataset.cleared = 'false'; });
        });

        const readApiKey = (inputId, currentValue) => {
            const el = document.getElementById(inputId);
            if (!el) return currentValue || '';
            const v = el.value.trim();
            if (v) return v;
            if (el.dataset.cleared === 'true') return '';
            return currentValue || '';
        };

        document.getElementById('setting-export-btn').onclick = async () => {
            const json = JSON.stringify({ ...settings, _exportedAt: new Date().toISOString() });
            let copied = false;
            try { await navigator.clipboard.writeText(json); copied = true; } catch (e) { /* clipboard blocked */ }
            if (!copied) window.prompt('Copy your ExplainX settings backup:', json);
            showToast(copied ? 'Backup copied to clipboard' : 'Backup ready to copy');
        };

        document.getElementById('setting-import-btn').onclick = async () => {
            const raw = window.prompt('Paste your ExplainX settings backup (JSON):');
            if (!raw) return;
            const parsed = safeParse(raw.trim());
            if (!parsed) { showToast('Invalid backup JSON', true); return; }
            settings = { ...DEFAULTS, ...parsed };
            await persistSettings();
            applySettingsStyles();
            showSettingsPanel();
            showToast('Settings restored');
        };

        document.getElementById('setting-save-btn').onclick = async () => {
            const deletedKeys = [];
            ['gemini', 'openrouter', 'groq', 'cerebras'].forEach(p => {
                const el = document.getElementById(`setting-${p}-api-key`);
                if (el && el.dataset.cleared === 'true' && !el.value.trim()) deletedKeys.push(`${p}ApiKey`);
            });

            Object.assign(settings, {
                apiProvider: document.getElementById('setting-provider').value,
                geminiApiKey: readApiKey('setting-gemini-api-key', settings.geminiApiKey),
                geminiModel: document.getElementById('setting-gemini-model').value.trim(),
                openrouterApiKey: readApiKey('setting-openrouter-api-key', settings.openrouterApiKey),
                openrouterModel: document.getElementById('setting-openrouter-model').value.trim(),
                groqApiKey: readApiKey('setting-groq-api-key', settings.groqApiKey),
                groqModel: document.getElementById('setting-groq-model').value.trim(),
                cerebrasApiKey: readApiKey('setting-cerebras-api-key', settings.cerebrasApiKey),
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
            await saveSettings(deletedKeys);
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
        if (popup) {
            if (popup.dataset.prevCenterX && popup.dataset.prevCenterY) {
                popup.dataset.centerX = popup.dataset.prevCenterX;
                popup.dataset.centerY = popup.dataset.prevCenterY;
            }
            adjustPopupPosition();
        }
    }

    // --- TYPEWRITER & PARSER ---
    function formatMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    async function typeWriteHTML(element, htmlString, speed) {
        currentTypingId++;
        const myTypingId = currentTypingId;

        element.innerHTML = '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        const contentWrapper = document.getElementById('ex-content-wrapper');

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

                    if (contentWrapper && i % 4 === 0) {
                        const isNearBottom = contentWrapper.scrollHeight - contentWrapper.scrollTop - contentWrapper.clientHeight < 80;
                        if (isNearBottom) {
                            contentWrapper.scrollTop = contentWrapper.scrollHeight;
                        }
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const newElem = document.createElement(node.tagName);
                Array.from(node.attributes).forEach(attr => newElem.setAttribute(attr.name, attr.value));
                parent.appendChild(newElem);

                for (let child of node.childNodes) {
                    await processNode(child, newElem);
                }

                if (contentWrapper) {
                    const isNearBottom = contentWrapper.scrollHeight - contentWrapper.scrollTop - contentWrapper.clientHeight < 80;
                    if (isNearBottom) {
                        contentWrapper.scrollTop = contentWrapper.scrollHeight;
                    }
                }
            }
        }

        await processNode(tempDiv, element);
        if (myTypingId === currentTypingId) {
            const footer = document.getElementById('ex-footer');
            if (footer) footer.classList.add('ex-active');
            if (contentWrapper) {
                contentWrapper.scrollTop = contentWrapper.scrollHeight;
            }
        }
    }

    // --- API LOGIC ---
    async function callApi() {
        const contentWrapper = document.getElementById('ex-content-wrapper');
        const responseDiv = document.createElement('div');
        responseDiv.className = 'ex-response-content';
        responseDiv.innerHTML = `<span class="ex-loading-pulse"></span>`;
        contentWrapper.appendChild(responseDiv);
        contentWrapper.scrollTop = contentWrapper.scrollHeight;

        const finalize = (success, data) => {
            if (success) {
                conversationHistory.push({ role: "model", parts: [{ text: data }] });
                typeWriteHTML(responseDiv, formatMarkdown(data), settings.typewriterSpeed);
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
                    else if (res.status === 402) finalize(false, `HTTP 402 Payment Required: Out of credits or model requires paid tier on ${p}. Try 'llama3.1-8b'.`);
                    else finalize(false, res.response?.error?.message || `API Error: ${res.status}`);
                } catch (e) { finalize(false, "Response parsing error."); }
            },
            onerror: () => finalize(false, "Network connection error."),
            ontimeout: () => finalize(false, "Request timed out.")
        });
    }

    // --- USER ACTIONS ---
    async function handleActionTrigger() {
        hideTooltip();
        const selectionData = getSelectionAndContext();
        if (!selectionData || !selectionData.text) return;
        conversationHistory = [];
        createPopup();
        document.getElementById('ex-footer').classList.remove('ex-active');

        const contentWrapper = document.getElementById('ex-content-wrapper');
        contentWrapper.innerHTML = `<div class="ex-query-title">${selectionData.text}</div>`;

        const prompt = `In ${settings.language}, clearly explain the following term: "${selectionData.text}". Context: "${selectionData.context}". Be concise and format with bolding or bullet points if helpful.`;
        conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
        callApi();
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
        callApi();
    }

    // --- POPUP POSITIONING ENGINE ---
    function adjustPopupPosition() {
        const popup = document.getElementById('ex-popup-container');
        if (!popup) return;

        const scale = parseFloat(settings.globalScale) || 1;
        const visualWidth = popup.offsetWidth * scale;
        const visualHeight = popup.offsetHeight * scale;

        const vWidth = window.innerWidth;
        const vHeight = window.innerHeight;
        const margin = 16;

        let centerX = parseFloat(popup.dataset.centerX) || (vWidth / 2);
        let centerY = parseFloat(popup.dataset.centerY) || (vHeight / 2);

        let popupX = centerX - (visualWidth / 2);
        let popupY = centerY - (visualHeight / 2);

        if (popupY < margin) {
            popupY = margin;
        } else if (popupY + visualHeight > vHeight - margin) {
            popupY = Math.max(margin, vHeight - visualHeight - margin);
        }

        if (popupX < margin) {
            popupX = margin;
        } else if (popupX + visualWidth > vWidth - margin) {
            popupX = Math.max(margin, vWidth - visualWidth - margin);
        }

        popup.style.left = `${popupX}px`;
        popup.style.top = `${popupY}px`;
    }

    // --- DOM & EVENT MANAGEMENT ---
    function createPopup() {
        removePopup();
        const popup = document.createElement('div');
        popup.id = 'ex-popup-container';
        popup.innerHTML = POPUP_HTML;
        document.body.appendChild(popup);
        applySettingsStyles();

        popup.style.visibility = 'hidden';
        popup.style.display = 'flex';

        const isMobile = window.innerWidth <= 768;
        const vWidth = window.innerWidth;
        const vHeight = window.innerHeight;

        if (isMobile || settings.customX === null || settings.customY === null) {
            popup.dataset.centerX = (vWidth / 2).toString();
            popup.dataset.centerY = (vHeight / 2).toString();
        } else {
            const scale = parseFloat(settings.globalScale) || 1;
            popup.dataset.centerX = (parseFloat(settings.customX) + (popup.offsetWidth * scale) / 2).toString();
            popup.dataset.centerY = (parseFloat(settings.customY) + (popup.offsetHeight * scale) / 2).toString();
        }

        adjustPopupPosition();

        const resizeObserver = new ResizeObserver(() => {
            adjustPopupPosition();
        });
        resizeObserver.observe(popup);
        popup._resizeObserver = resizeObserver;

        windowResizeHandler = () => {
            if (window.innerWidth <= 768 || popup.dataset.isDragged !== 'true') {
                popup.dataset.centerX = (window.innerWidth / 2).toString();
                popup.dataset.centerY = (window.innerHeight / 2).toString();
            }
            adjustPopupPosition();
        };
        window.addEventListener('resize', windowResizeHandler);

        requestAnimationFrame(() => {
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
        const firstRect = lastSelectionRects[0];
        const lastRect = lastSelectionRects[lastSelectionRects.length - 1];

        const tooltip = document.getElementById('ex-tooltip-wrapper');
        if (!tooltip) return;
        const iconSize = parseInt(settings.iconSize, 10) || 36;
        tooltip.style.width = tooltip.style.height = `${iconSize}px`;

        let yPos, xPos;

        if (settings.iconVertical === 'top') yPos = firstRect.top - iconSize - 8;
        else yPos = lastRect.bottom + 8;

        if (settings.iconHorizontal === 'start') xPos = firstRect.left - 5;
        else xPos = lastRect.right + 5;

        xPos += (parseInt(settings.iconOffsetX, 10) || 0);
        yPos += (parseInt(settings.iconOffsetY, 10) || 0);

        yPos = Math.max(8, Math.min(yPos, window.innerHeight - iconSize - 8));
        xPos = Math.max(8, Math.min(xPos, window.innerWidth - iconSize - 8));

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
        if (windowResizeHandler) {
            window.removeEventListener('resize', windowResizeHandler);
            windowResizeHandler = null;
        }
        const p = document.getElementById('ex-popup-container');
        if(p) {
            if (p._resizeObserver) {
                p._resizeObserver.disconnect();
                p._resizeObserver = null;
            }
            p.classList.remove('ex-visible');
            setTimeout(() => p.remove(), 250);
        }
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
            if (e.cancelable) e.preventDefault();
            const isTouch = e.type.includes('touch');
            p3 = isTouch ? e.touches[0].clientX : e.clientX;
            p4 = isTouch ? e.touches[0].clientY : e.clientY;

            el.dataset.isDragged = 'true';

            if (isTouch) {
                document.ontouchend = dragEnd;
                document.ontouchmove = dragAction;
            } else {
                document.onmouseup = dragEnd;
                document.onmousemove = dragAction;
            }
        };

        const dragAction = (e) => {
            if (e.cancelable) e.preventDefault();
            const isTouch = e.type.includes('touch');
            const clientX = isTouch ? e.touches[0].clientX : e.clientX;
            const clientY = isTouch ? e.touches[0].clientY : e.clientY;
            p1 = p3 - clientX;
            p2 = p4 - clientY;
            p3 = clientX;
            p4 = clientY;

            const scale = parseFloat(settings.globalScale) || 1;
            const visualWidth = el.offsetWidth * scale;
            const visualHeight = el.offsetHeight * scale;
            const margin = 12;

            let newTop = el.offsetTop - p2;
            let newLeft = el.offsetLeft - p1;

            newTop = Math.max(margin, Math.min(newTop, window.innerHeight - visualHeight - margin));
            newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - visualWidth - margin));

            el.style.top = `${newTop}px`;
            el.style.left = `${newLeft}px`;

            el.dataset.centerX = (newLeft + visualWidth / 2).toString();
            el.dataset.centerY = (newTop + visualHeight / 2).toString();
        };

        const dragEnd = () => {
            document.onmouseup = null; document.onmousemove = null;
            document.ontouchend = null; document.ontouchmove = null;
            if (window.innerWidth > 768) {
                settings.customX = el.style.left;
                settings.customY = el.style.top;
                persistSettings().catch(e => console.warn('ExplainX: drag persist failed', e));
            }
        };

        if(h) {
            h.onmousedown = dragStart;
            h.ontouchstart = dragStart;
        }
    };

    // --- STYLES ---
    const STYLE_CSS = `
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
            max-width: min(calc(96vw / var(--ex-scale)), calc((100vw - 24px) / var(--ex-scale)));
            max-height: min(var(--popup-max-height), calc((100vh - 32px) / var(--ex-scale)));
            max-height: min(var(--popup-max-height), calc((100dvh - 32px) / var(--ex-scale)));
            background: var(--ex-bg); color: var(--ex-text);
            border-radius: 16px; box-shadow: var(--ex-shadow);
            font-family: var(--font-family); font-size: var(--font-size);
            display: flex; flex-direction: column; overflow: hidden;
            box-sizing: border-box;

            transform-origin: top left;
            opacity: 0; transform: translateY(8px) scale(calc(var(--ex-scale) * 0.98));
            transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        #ex-popup-container.ex-visible { opacity: 1; transform: translateY(0) scale(var(--ex-scale)); }

        #ex-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px; background: var(--ex-bg-alt); border-bottom: 1px solid var(--ex-border);
            cursor: grab; user-select: none; transition: padding 0.2s ease;
            flex-shrink: 0;
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

        #ex-main-view, #ex-settings-view { display: flex; flex-direction: column; flex-grow: 1; overflow: hidden; min-height: 0; }

        #ex-content-wrapper {
            padding: 18px; overflow-y: auto; flex-grow: 1; min-height: 0;
            scroll-behavior: smooth; overscroll-behavior: contain;
        }
        #ex-content-wrapper::-webkit-scrollbar { width: 6px; }
        #ex-content-wrapper::-webkit-scrollbar-track { background: transparent; }
        #ex-content-wrapper::-webkit-scrollbar-thumb { background: var(--ex-border); border-radius: 10px; }

        .ex-query-title { font-weight: 700; font-size: 1.15em; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--ex-border); color: var(--ex-text); }
        .ex-response-content { line-height: 1.6; }
        .ex-response-content strong { font-weight: 600; color: var(--ex-accent); }
        .ex-response-content code { font-family: monospace; background: var(--ex-bg-alt); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }

        .ex-followup-query { margin-top: 16px; padding: 12px; background: var(--ex-bg-alt); border-radius: 8px; font-style: italic; color: var(--ex-text-muted); border-left: 3px solid var(--ex-accent); }

        #ex-footer {
            padding: 14px 18px; background: var(--ex-bg-alt); border-top: 1px solid var(--ex-border);
            display: none; transition: padding 0.2s; flex-shrink: 0;
        }
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
            gap: 10px; padding: 10px 14px; flex-shrink: 0;
        }
        .ex-compact #ex-followup-buttons { margin-bottom: 0; display: flex; gap: 6px; flex-shrink: 0; }
        .ex-compact .ex-footer-btn { padding: 5px 12px; font-size: 12px; }
        .ex-compact #ex-chat-input-wrapper { flex-grow: 1; padding: 2px; }
        .ex-compact #ex-chat-input { padding: 5px 32px 5px 10px; font-size: 13px; }
        .ex-compact #ex-chat-submit { width: 28px; top: 2px; bottom: 2px; right: 2px; border-radius: 14px; }

        #ex-tooltip-wrapper {
            position: fixed; z-index: 2147483646; cursor: pointer;
            opacity: 0; transform: scale(0.8) translateY(10px); pointer-events: none;
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2));
        }
        #ex-tooltip-wrapper.ex-show-tooltip { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; }
        #ex-tooltip-wrapper:hover { transform: scale(1.1) translateY(0); }
        #ex-tooltip-icon { width: 100%; height: 100%; border-radius: 25%; }

        #ex-settings-view { padding: 0; }
        .ex-settings-scroll-area { padding: 16px; padding-top: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
        .ex-settings-scroll-area::-webkit-scrollbar { width: 6px; }
        .ex-settings-scroll-area::-webkit-scrollbar-thumb { background: var(--ex-border); border-radius: 10px; }

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

        .ex-secondary-btn { padding: 8px 10px; font-size: 13px; font-weight: 500; background: var(--ex-bg); color: var(--ex-text); border: 1px solid var(--ex-border); border-radius: 6px; cursor: pointer; transition: 0.2s; }
        .ex-secondary-btn:hover { border-color: var(--ex-accent); color: var(--ex-accent); }

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
        .ex-toast.ex-toast-error { background: #ef4444; }
        @keyframes ex-fade-in-out { 0% { opacity: 0; transform: translate(-50%, 10px); } 10% { opacity: 1; transform: translate(-50%, 0); } 90% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -10px); } }

        @media (max-width: 768px) {
            #ex-popup-container {
                width: 92vw;
                max-width: 92vw;
            }
            .ex-setting-row { grid-template-columns: 1fr; gap: 8px; }
            #ex-chat-input { font-size: 16px; }
            .ex-footer-btn { padding: 8px 16px; font-size: 14px; }
            #ex-content-wrapper { padding-bottom: 16px; }
        }
    `;

    function addStyle(css) {
        if (typeof GM_addStyle === 'function') {
            try { GM_addStyle(css); return; } catch (e) { /* fall through */ }
        }
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // --- INITIALIZATION ---
    // Order matters: set up UI + listeners synchronously FIRST so selection
    // detection always works, even if storage is slow or broken.
    function boot() {
        addStyle(STYLE_CSS);

        // Tooltip (the "button") that appears on text selection
        let tooltipWrapper = document.getElementById('ex-tooltip-wrapper');
        if (!tooltipWrapper) {
            tooltipWrapper = document.createElement('div');
            tooltipWrapper.id = 'ex-tooltip-wrapper';
            tooltipWrapper.innerHTML = `<img id="ex-tooltip-icon" src="${EX_ICON_BASE64}">`;
            document.body.appendChild(tooltipWrapper);
            tooltipWrapper.querySelector('#ex-tooltip-icon').onclick = handleActionTrigger;
        }

        // Outside-click: close popup when clicking elsewhere
        const handleOutsideClick = (e) => {
            if (e.target && typeof e.target.closest === 'function') {
                if (!e.target.closest('#ex-popup-container') && !e.target.closest('#ex-tooltip-wrapper')) {
                    removePopup();
                    hideTooltip();
                }
            }
        };
        document.addEventListener('mousedown', handleOutsideClick, true);
        document.addEventListener('touchstart', handleOutsideClick, { capture: true, passive: true });

        // Selection detection
        const evaluateSelection = () => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
                let node = selection.anchorNode;
                while (node && node !== document.body && node !== document) {
                    if (node.nodeType === Node.ELEMENT_NODE && (node.id === 'ex-popup-container' || node.id === 'ex-tooltip-wrapper')) return;
                    node = node.parentNode;
                }

                lastSelectionRects = selection.getRangeAt(0).getClientRects();
                if (lastSelectionRects.length === 0) {
                    const rect = selection.getRangeAt(0).getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        lastSelectionRects = [rect];
                    }
                }
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
            selectionDebounce = setTimeout(evaluateSelection, 300);
        };

        document.addEventListener('mouseup', handleSelectionEvent, true);
        document.addEventListener('touchend', handleSelectionEvent, { capture: true, passive: false });
        document.addEventListener('selectionchange', handleSelectionEvent, true);

        try {
            GM_registerMenuCommand("ExplainX Settings", () => { createPopup(); showSettingsPanel(); });
        } catch (e) { /* menu not supported */ }

        // NOW load settings (async, non-blocking). Any failure/timeout is
        // contained and never prevents the tooltip from working.
        loadSettings().catch(e => console.error('ExplainX: initial settings load failed', e));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
