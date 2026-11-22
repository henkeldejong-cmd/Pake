(async function() {
    'use strict';

    console.log("Inline AI Summaries Script (v7.1.0 - Social Media & Mobile Enhanced): Initializing...");

    // --- STATE & CONFIGURATION ---
    let conversationHistory = [];
    let pageContentForContext = "";
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
        width: '450px',
        height: '450px',
        iconSize: '40px',
        iconPosition: 'bottom',
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

    let summaryPanel = null;
    let summaryOverlay = null;
    let currentUrl = null;
    let summaryRequestActive = false;
    let isSpeaking = false;
    let currentUtterance = null;
    let availableVoices = [];
    let elevenLabsAudio = null;
    const isTouchDevice = true; 
    const ttsSupported = 'speechSynthesis' in window;

    // --- URL UNWRAPPING FOR SOCIAL MEDIA ---
    function unwrapSocialUrl(rawUrl) {
        if (!rawUrl) return rawUrl;
        try {
            const u = new URL(rawUrl, window.location.href);
            // Facebook wrapper
            if ((u.hostname.includes('facebook.com') || u.hostname.includes('fb.com')) && u.searchParams.has('u')) {
                return decodeURIComponent(u.searchParams.get('u'));
            }
            // Instagram wrapper
            if (u.hostname.includes('instagram.com') && u.searchParams.has('u')) {
                return decodeURIComponent(u.searchParams.get('u'));
            }
            // Threads wrapper
            if (u.hostname.includes('threads.net') && u.searchParams.has('u')) {
                return decodeURIComponent(u.searchParams.get('u'));
            }
            // Reddit out wrapper
            if (u.hostname.includes('reddit.com') && u.searchParams.has('url')) {
                return decodeURIComponent(u.searchParams.get('url'));
            }
            // Google / YouTube redirects
            if (u.hostname.includes('google.') && (u.searchParams.has('url') || u.searchParams.has('q'))) {
                return decodeURIComponent(u.searchParams.get('url') || u.searchParams.get('q'));
            }
            if (u.hostname.includes('youtube.com') && u.searchParams.has('q')) {
                return decodeURIComponent(u.searchParams.get('q'));
            }
        } catch (_) {}
        return rawUrl;
    }

    function checkHtmlRedirect(html) {
        if (!html || html.length > 5000) return null;
        // Check meta refresh
        const metaMatch = html.match(/<meta[^>]*?http-equiv=["']?refresh["']?[^>]*?content=["']?[^"'>]*?url=([^"'>\s]+)/i) ||
                          html.match(/<meta[^>]*?content=["']?[^"'>]*?url=([^"'>\s]+)[^>]*?http-equiv=["']?refresh["']?/i);
        if (metaMatch && metaMatch[1]) {
            return metaMatch[1].trim().replace(/\\/g, '');
        }
        // Check JS location redirect
        const jsMatch = html.match(/location\.(?:replace|href)\s*(?:\(\s*["']|\s*=\s*["'])([^"'\)]+)["']/i);
        if (jsMatch && jsMatch[1]) {
            return jsMatch[1].trim().replace(/\\/g, '');
        }
        return null;
    }

    // --- FETCH SPECIFIC SOCIAL POSTS ---
    function fetchXPost(xUrl) {
        const m = xUrl.match(/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/i);
        if (!m) return Promise.resolve(null);
        const author = m[1];
        const statusId = m[2];
        const apiUrl = `https://api.fxtwitter.com/${author}/status/${statusId}`;
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET', url: apiUrl, responseType: 'json', timeout: 12000,
                onload: (res) => {
                    if (res.status === 200 && res.response?.tweet) {
                        const tw = res.response.tweet;
                        let text = `Post by @${tw.author?.screen_name || author} (${tw.author?.name || ''}):\n"${tw.text}"`;
                        if (tw.quote) {
                            text += `\n\nQuoted @${tw.quote.author?.screen_name || ''}:\n"${tw.quote.text}"`;
                        }
                        resolve(text);
                    } else {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    function fetchRedditPost(redditUrl) {
        const clean = redditUrl.split('?')[0].replace(/\/+$/, '') + '.json';
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET', url: clean, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                responseType: 'json', timeout: 12000,
                onload: (res) => {
                    try {
                        if (res.status === 200 && Array.isArray(res.response)) {
                            const post = res.response[0]?.data?.children?.[0]?.data;
                            if (post) {
                                let text = `Reddit Post in r/${post.subreddit} by u/${post.author}:\nTitle: ${post.title}\n`;
                                if (post.selftext) text += `Content:\n${post.selftext}\n`;
                                if (post.url && !post.url.includes('reddit.com')) text += `Linked Article: ${post.url}\n`;
                                const comments = res.response[1]?.data?.children || [];
                                const topComments = comments.slice(0, 3).map(c => c.data?.body).filter(Boolean);
                                if (topComments.length > 0) {
                                    text += `\nTop Comments:\n` + topComments.map(c => `• ${c}`).join('\n');
                                }
                                resolve(text);
                                return;
                            }
                        }
                    } catch (_) {}
                    resolve(null);
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    // --- SETTINGS MANAGEMENT ---
    async function loadSettings() {
        const loaded = await GM_getValue('inlineAiSummaries_settings_v6_mobile');
        settings = { ...DEFAULTS, ...(loaded || {}) };
        applySettingsStyles();
    }
    async function saveSettings() {
        await GM_setValue('inlineAiSummaries_settings_v6_mobile', settings);
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

            <div class="summary-setting-row">
                <div class="summary-setting"><label>Popup Width</label><input type="text" id="setting-width" value="${settings.width}"></div>
                <div class="summary-setting"><label>Popup Height</label><input type="text" id="setting-height" value="${settings.height}"></div>
            </div>

            <div class="summary-setting-row" style="margin-top: 5px;">
                <div class="summary-setting" style="flex-direction: row; align-items: center; justify-content: space-between;">
                    <label>Typewriter Effect</label>
                    <label class="summary-switch"><input type="checkbox" id="setting-typewriter-toggle" ${settings.typewriterEnabled !== false ? 'checked' : ''}><span class="summary-slider"></span></label>
                </div>
                <div class="summary-setting">
                    <label>Speed (ms/char)</label>
                    <input type="number" id="setting-typewriter-speed" value="${settings.typewriterSpeed}" min="1" max="100">
                </div>
            </div>

            <div class="summary-setting-row" style="margin-top: 5px;">
                <div class="summary-setting"><label>Icon Size</label><input type="text" id="setting-icon-size" value="${settings.iconSize}"></div>
                <div class="summary-setting"><label>Icon Position</label><select id="setting-icon-position"><option value="bottom" ${settings.iconPosition === 'bottom' ? 'selected' : ''}>Bottom of Link</option><option value="top" ${settings.iconPosition === 'top' ? 'selected' : ''}>Top of Link</option></select></div>
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
                height: document.getElementById('setting-height').value.trim(),
                iconSize: document.getElementById('setting-icon-size').value.trim(),
                iconPosition: document.getElementById('setting-icon-position').value
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

    function hideSettingsPanel() { document.getElementById('summary-settings-view').style.display = 'none'; document.getElementById('summary-main-view').style.display = 'flex'; }
    function openSettingsPanel() { if (!summaryPanel || summaryPanel.style.display === 'none' || summaryOverlay.style.opacity === '0') showSummaryPanel(); showSettingsPanel(); }

    // --- TYPEWRITER ENGINE ---
    async function typeWriteHTML(element, htmlString, speed, onComplete) {
        currentTypingId++;
        const myTypingId = currentTypingId;
        const isEnabled = settings.typewriterEnabled !== false;

        element.innerHTML = '';

        if (!isEnabled) {
            setSafeInnerHTML(element, htmlString);
            const container = document.getElementById('summary-content-wrapper');
            if (container) container.scrollTop = container.scrollHeight;
            if (onComplete) onComplete();
            return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

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
                if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return;

                const newElem = document.createElement(node.tagName);
                Array.from(node.attributes).forEach(attr => newElem.setAttribute(attr.name, attr.value));
                parent.appendChild(newElem);

                for (let child of node.childNodes) {
                    await processNode(child, newElem);
                }
            }
        }

        for (let child of doc.body.childNodes) {
            await processNode(child, element);
        }

        if (myTypingId === currentTypingId && onComplete) {
            onComplete();
        }
    }

    function createSummaryPanel() {
        if (document.getElementById('summary-panel-container')) return;
        summaryOverlay = document.createElement('div');
        summaryOverlay.id = 'summary-overlay';
        document.body.appendChild(summaryOverlay);
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
        summaryOverlay.addEventListener('click', hideSummaryPanel);
        summaryPanel.querySelector('#summary-close-btn').onclick = hideSummaryPanel;
        summaryPanel.querySelector('#summary-settings-btn').onclick = showSettingsPanel;
        if (ttsSupported) summaryPanel.querySelector('#summary-speak-btn').onclick = handleSpeakButtonClick;

        const chatInput = summaryPanel.querySelector('#summary-chat-input');
        const chatSubmit = summaryPanel.querySelector('#summary-chat-submit');
        chatSubmit.onclick = () => handleFollowUp(chatInput.value.trim());
        chatInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSubmit.click(); } };
        makeDraggable(summaryPanel, summaryPanel.querySelector('#summary-header'));
    }

    function showSummaryPanel(url = null) {
        if (!summaryPanel) createSummaryPanel();
        hideSettingsPanel();
        stopAllTTS();
        summaryOverlay.style.display = 'block'; summaryPanel.style.display = 'flex';
        void summaryOverlay.offsetWidth;
        summaryOverlay.style.opacity = '1'; summaryPanel.style.opacity = '1'; summaryPanel.style.transform = '';
    }

    function hideSummaryPanel() {
        if (!summaryPanel || summaryPanel.style.opacity === '0') return;
        currentTypingId++;
        stopAllTTS();
        summaryOverlay.style.opacity = '0'; summaryPanel.style.opacity = '0';
        setTimeout(() => { if (summaryOverlay && summaryOverlay.style.opacity === '0') { summaryOverlay.style.display = 'none'; summaryPanel.style.display = 'none'; } }, 200);
        currentUrl = null; summaryRequestActive = false;
    }

    // --- TTS (TEXT-TO-SPEECH) ---
    async function loadAndPopulateVoices() { if (!ttsSupported) return; const populate = () => { availableVoices = window.speechSynthesis.getVoices(); if (!availableVoices.length) return; if (!settings.selectedVoiceURI) settings.selectedVoiceURI = availableVoices[0].voiceURI; }; window.speechSynthesis.onvoiceschanged = populate; populate(); }
    function setSpeakButtonState(speaking) { const btn = summaryPanel?.querySelector('#summary-speak-btn'); if (btn) { btn.innerHTML = speaking ? STOP_ICON : SPEAK_ICON; btn.title = speaking ? "Stop Reading" : "Read Aloud"; } isSpeaking = speaking; if (!speaking) currentUtterance = null; }

    function stopAllTTS() {
        if (ttsSupported && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
        if (elevenLabsAudio) { elevenLabsAudio.pause(); if (elevenLabsAudio.src && elevenLabsAudio.src.startsWith('blob:')) URL.revokeObjectURL(elevenLabsAudio.src); elevenLabsAudio = null; }
        setSpeakButtonState(false);
    }

    function playWithSystemTTS(text) {
        window.speechSynthesis.cancel();
        currentUtterance = new SpeechSynthesisUtterance(text);
        if (settings.selectedVoiceURI) { const voice = availableVoices.find(v => v.voiceURI === settings.selectedVoiceURI); if (voice) currentUtterance.voice = voice; }
        currentUtterance.onstart = () => setSpeakButtonState(true); currentUtterance.onend = () => setSpeakButtonState(false); currentUtterance.onerror = () => setSpeakButtonState(false);
        window.speechSynthesis.speak(currentUtterance);
    }

    function playWithElevenLabs(text) {
        if (!settings.elevenlabsApiKey || !settings.elevenlabsVoiceId) { alert("ElevenLabs API Key and Voice ID must be set."); openSettingsPanel(); return; }
        setSpeakButtonState(true);
        GM_xmlhttpRequest({
            method: 'POST', url: `https://api.elevenlabs.io/v1/text-to-speech/${settings.elevenlabsVoiceId}`,
            headers: { 'Content-Type': 'application/json', 'xi-api-key': settings.elevenlabsApiKey },
            data: JSON.stringify({ text: text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
            responseType: 'blob',
            onload: function(response) {
                if (response.status === 200) {
                    elevenLabsAudio = new Audio(URL.createObjectURL(response.response));
                    elevenLabsAudio.play(); elevenLabsAudio.onended = () => stopAllTTS(); elevenLabsAudio.onerror = () => { alert('Error playing audio from ElevenLabs.'); stopAllTTS(); };
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
                if (response.status === 200 && response.response?.voices) { select.innerHTML = response.response.voices.map(v => `<option value="${v.voice_id}" ${settings.elevenlabsVoiceId === v.voice_id ? 'selected' : ''}>${v.name}</option>`).join('');
                } else { select.innerHTML = '<option>Failed to load voices. Check API key.</option>'; }
            }, onerror: function() { select.innerHTML = '<option>Network error fetching voices.</option>'; }
        });
    }

    function handleSpeakButtonClick() {
        if (!ttsSupported || !summaryPanel) return;
        if (isSpeaking) { stopAllTTS(); } else {
            const responseElements = summaryPanel.querySelectorAll('.summary-response-content');
            if (responseElements.length === 0) return;
            const textToSpeak = Array.from(responseElements).map(el => el.innerText).join('\n');
            if (!textToSpeak) return;
            settings.ttsProvider === 'elevenlabs' ? playWithElevenLabs(textToSpeak) : playWithSystemTTS(textToSpeak);
        }
    }

    // --- CORE LOGIC ---
    function isValidUrl(url) { try { if (!url || ['javascript:', 'mailto:', 'data:', '#'].some(p => url.startsWith(p))) return false; const parsed = new URL(url, window.location.href); return ['http:', 'https:'].includes(parsed.protocol); } catch (_) { return false; } }
    
    function extractMainContent(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            doc.querySelectorAll('script, style, head, header, footer, nav, aside, form, noscript, [aria-hidden="true"]').forEach(el => el.remove());
            let body = doc.querySelector('article, [role="main"], main') || doc.body;
            if (!body) return '';
            return (body.textContent || "").replace(/\s{2,}/g, ' ').trim().substring(0, MAX_CONTENT_LENGTH);
        } catch (e) {
            return "Could not extract content.";
        }
    }

    function setSafeInnerHTML(element, htmlString) {
        if (!element) return;
        element.innerHTML = '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        Array.from(doc.body.childNodes).forEach(child => element.appendChild(child.cloneNode(true)));
    }

    function getSummaryFromApi() {
        return new Promise((resolve) => {
            const handleApiKeyError = (provider) => { resolve(`<b>❌ Error: Invalid ${provider} API Key.</b><br>Please check settings.`); openSettingsPanel(); };
            if (settings.apiProvider === 'gemini') {
                const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModelName || 'gemini-2.5-flash-lite'}:generateContent`;
                GM_xmlhttpRequest({
                    method: 'POST', url: geminiEndpoint, headers: { 'Content-Type': 'application/json', 'X-goog-api-key': settings.geminiApiKey },
                    data: JSON.stringify({ contents: conversationHistory }), responseType: 'json', timeout: 25000,
                    onload: function(response) {
                        try {
                            if (response.status === 200 && response.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                                let summary = response.response.candidates[0].content.parts[0].text;
                                summary = summary.replace(/\*\*/g, '').replace(/^\s*[\*•-]\s*/gm, '• ').replace(/\n/g, '<br>');
                                conversationHistory.push({ role: "model", parts: [{ text: summary }] }); resolve(summary.trim());
                            } else if (response.response?.promptFeedback) { resolve(`❌ Summary blocked (Reason: ${response.response.promptFeedback.blockReason || 'Unknown'}).`);
                            } else if (response.status === 400 && response.response?.error?.message.includes("API key not valid")) { handleApiKeyError('Gemini');
                            } else { resolve(`❌ Error: API request failed (Status: ${response.status}).`.trim()); }
                        } catch (e) { resolve("❌ Error: Failed to process Gemini response."); }
                    }, onerror: () => resolve("❌ Error: Could not connect to Gemini API."), ontimeout: () => resolve("❌ Error: API request timed out.")
                });
            } else if (settings.apiProvider === 'openrouter') {
                GM_xmlhttpRequest({
                     method: 'POST', url: OPENROUTER_API_ENDPOINT,
                     headers: {
                         'Content-Type': 'application/json',
                         'Authorization': `Bearer ${settings.openrouterApiKey}`,
                         'HTTP-Referer': window.location.origin || 'https://github.com',
                         'X-Title': 'Inline AI Summaries Mobile'
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
                GM_xmlhttpRequest({
                     method: 'POST', url: CEREBRAS_API_ENDPOINT,
                     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.cerebrasApiKey}` },
                     data: JSON.stringify({ model: settings.cerebrasModelName || 'gpt-oss-120b', messages: conversationHistory.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.parts[0].text })), temperature: 0.6, max_tokens: 500 }), responseType: 'json',
                     onload: function(response) {
                        if (response.status === 401 || response.status === 403) { handleApiKeyError('Cerebras'); return; }
                        if (response.status === 200 && response.response?.choices?.[0]?.message?.content) {
                            let summary = response.response.choices[0].message.content;
                            conversationHistory.push({ role: "model", parts: [{ text: summary }] });
                            resolve(summary.replace(/\n/g, '<br>'));
                        } else { resolve(`<b>Error:</b> API request failed (Status: ${response.status}).`); }
                     },
                     onerror: function() { resolve("<b>Error:</b> Could not connect to the Cerebras API."); }
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

    async function sendToAiAndDisplay(content, contentWrapper, title = "Summary") {
        pageContentForContext = content;
        contentWrapper.innerHTML = '';
        let prompt = `Generate a concise summary in ${settings.language} of the following web page content. Provide 3 to 5 bullet points that directly present the main topic and conclusions. Do not include any introductory sentences or phrases before the bullet points. Content:\n\n"${pageContentForContext}"`;
        conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
        await processRequest(title);
    }

    async function handleInitialSummarize(rawUrl, fallbackText = "") {
        if (summaryRequestActive && rawUrl === currentUrl) return;
        currentUrl = rawUrl; 
        summaryRequestActive = true; 
        conversationHistory = []; 
        pageContentForContext = "";
        showSummaryPanel(rawUrl);
        const contentWrapper = document.getElementById('summary-content-wrapper'); 
        contentWrapper.innerHTML = '';

        if ((settings.apiProvider === 'gemini' && !settings.geminiApiKey) || (settings.apiProvider === 'openrouter' && !settings.openrouterApiKey) || (settings.apiProvider === 'groq' && !settings.groqApiKey) || (settings.apiProvider === 'cerebras' && !settings.cerebrasApiKey)) {
            setSafeInnerHTML(contentWrapper, `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ API Key for ${settings.apiProvider} is missing. Please add it in settings.</div></div>`);
            showSettingsPanel(); 
            summaryRequestActive = false; 
            return;
        }

        setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">⏳ Resolving link & fetching content...</div>`);

        let initialUrl = unwrapSocialUrl(rawUrl);

        // 1. Check if the link itself is an X / Twitter post
        if (/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+/i.test(initialUrl)) {
            setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">🐦 Extracting X post...</div>`);
            const xText = await fetchXPost(initialUrl);
            if (xText && xText.length > 30) {
                await sendToAiAndDisplay(xText, contentWrapper, "Post Summary");
                summaryRequestActive = false;
                return;
            }
        }

        // 2. Check if the link is a Reddit post
        if (/https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/comments\//i.test(initialUrl)) {
            setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">👽 Extracting Reddit discussion...</div>`);
            const redditText = await fetchRedditPost(initialUrl);
            if (redditText && redditText.length > 30) {
                await sendToAiAndDisplay(redditText, contentWrapper, "Reddit Summary");
                summaryRequestActive = false;
                return;
            }
        }

        // 3. General article fetching with redirect resolution and Jina fallback
        let resolvedDestinationUrl = initialUrl;

        const doFetch = (targetUrl, attempt = 1) => {
            GM_xmlhttpRequest({
                method: 'GET', url: targetUrl, responseType: 'text', timeout: 15000, anonymous: true,
                headers: { 
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", 
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,*/*;q=0.8" 
                },
                onload: async function(response) {
                    try {
                        if (response.finalUrl && response.finalUrl !== targetUrl && !response.finalUrl.includes('t.co')) {
                            resolvedDestinationUrl = response.finalUrl;
                        }

                        // Check if t.co or shortener sent an HTML meta-refresh / JS redirect
                        const redirectUrl = checkHtmlRedirect(response.responseText);
                        if (redirectUrl && attempt === 1 && !targetUrl.includes('jina.ai')) {
                            let nextUrl = redirectUrl;
                            try { nextUrl = new URL(redirectUrl, targetUrl).href; } catch(_) {}
                            resolvedDestinationUrl = nextUrl;
                            setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">🔗 Unwrapped to: <b>${new URL(nextUrl).hostname}</b>...</div>`);
                            doFetch(nextUrl, 2); // <--- FIXED: Changed 1 to 2
                            return;
                        }

                        let extracted = "";
                        if (response.status >= 200 && response.status < 300) {
                            if (targetUrl.includes('jina.ai')) {
                                extracted = response.responseText.replace(/\s{2,}/g, ' ').trim().substring(0, MAX_CONTENT_LENGTH);
                            } else {
                                extracted = extractMainContent(response.responseText);
                            }
                        }

                        // If blocked or insufficient content, retry using the RESOLVED target URL on Jina AI
                        if (attempt === 1 && !targetUrl.includes('jina.ai') && (response.status === 401 || response.status === 403 || response.status === 404 || extracted.length < 300)) {
                            setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">🧱 Blocked or JS-wall detected. Extracting via Jina AI...</div>`);
                            doFetch(`https://r.jina.ai/${resolvedDestinationUrl}`, 2);
                            return;
                        }

                        if (extracted && extracted.length >= 100) {
                            await sendToAiAndDisplay(extracted, contentWrapper, "Summary");
                            summaryRequestActive = false;
                        } else {
                            // If network failed, fall back to the visible text on the card/post
                            if (fallbackText && fallbackText.length > 50) {
                                setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">⚠️ Full article protected. Summarizing post preview...</div>`);
                                await sendToAiAndDisplay(fallbackText, contentWrapper, "Preview Summary");
                            } else {
                                const errorMsg = targetUrl.includes('jina.ai')
                                    ? `❌ Article is heavily restricted by the publisher.`
                                    : `❌ Error fetching page (Status: ${response.status}).`;
                                setSafeInnerHTML(contentWrapper, `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">${errorMsg}</div></div>`);
                            }
                            summaryRequestActive = false;
                        }
                    } catch (err) {
                        setSafeInnerHTML(contentWrapper, `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ A script error occurred while processing the page.</div></div>`);
                        summaryRequestActive = false;
                    }
                },
                onerror: () => { 
                    if (attempt === 1 && !targetUrl.includes('jina.ai')) {
                        setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">🧱 Direct network error. Retrying via Jina AI...</div>`);
                        doFetch(`https://r.jina.ai/${resolvedDestinationUrl}`, 2);
                    } else if (fallbackText && fallbackText.length > 50) {
                        sendToAiAndDisplay(fallbackText, contentWrapper, "Preview Summary");
                        summaryRequestActive = false;
                    } else {
                        setSafeInnerHTML(contentWrapper, `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ Network error fetching page.</div></div>`); 
                        summaryRequestActive = false; 
                    }
                },
                ontimeout: () => { 
                    if (attempt === 1 && !targetUrl.includes('jina.ai')) {
                        setSafeInnerHTML(contentWrapper, `<div class="summary-status-message">⏱️ Request timed out. Retrying via Jina AI...</div>`);
                        doFetch(`https://r.jina.ai/${resolvedDestinationUrl}`, 2);
                    } else if (fallbackText && fallbackText.length > 50) {
                        sendToAiAndDisplay(fallbackText, contentWrapper, "Preview Summary");
                        summaryRequestActive = false;
                    } else {
                        setSafeInnerHTML(contentWrapper, `<div class="summary-response-block"><div class="summary-response-title">Error</div><div class="summary-response-content">❌ Timeout fetching page.</div></div>`); 
                        summaryRequestActive = false; 
                    }
                }
            });
        };

        doFetch(resolvedDestinationUrl, 1);
    }

    async function handleFollowUp(text) {
        if (!text) return; document.getElementById('summary-chat-input').value = '';
        let prompt = conversationHistory.length <= 2 ? `Based on the previous web page content, please answer the following question: "${text}". Web page content for context: \n\n"${pageContentForContext}"` : text;
        conversationHistory.push({ role: "user", parts: [{ text: prompt }] });
        await processRequest(text);
    }

    // --- ENHANCED LINK & CARD EXTRACTION ---
    function isIgnorableTarget(target, url) {
        if (!target || !target.closest) return true;
        if (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.closest('button, [role="button"], input, textarea, select')) {
            return true;
        }
        if (url && /facebook\.com\/(?:photo|photos|reel|watch)|fbid=|instagram\.com\/(?:p|reel)\//i.test(url)) {
            return true;
        }
        return false;
    }

    function findLinkFromTarget(target, path) {
        const nodes = path && path.length ? path : [];
        for (let node of nodes) {
            if (!node || node === document.body || node === document.documentElement) break;
            if (node.tagName === 'A' && node.href) return node.href;
            if (node.getAttribute && node.getAttribute('role') === 'link') {
                const h = node.getAttribute('href') || node.getAttribute('data-url');
                if (h) return h;
            }
        }
        let node = target;
        while (node && node !== document.body && node !== document.documentElement) {
            if (node.tagName === 'A' && node.href) return node.href;
            if (node.getAttribute && node.getAttribute('role') === 'link') {
                const h = node.getAttribute('href') || node.getAttribute('data-url');
                if (h) return h;
            }
            node = node.parentNode;
        }
        return null;
    }

    function extractCardOrTweetText(target, path) {
        const nodes = path && path.length ? path : [];
        for (let node of nodes) {
            if (!node || !node.querySelector) continue;
            // X / Twitter
            if (node.getAttribute?.('data-testid') === 'tweet' || node.closest?.('article[data-testid="tweet"]')) {
                const tweetArticle = node.getAttribute?.('data-testid') === 'tweet' ? node : node.closest('article[data-testid="tweet"]');
                return tweetArticle ? tweetArticle.innerText.trim() : "";
            }
            // Reddit
            if (node.tagName === 'SHREDDIT-POST' || node.classList?.contains('Post')) {
                return node.innerText.trim();
            }
            // Facebook / Instagram / Threads
            if (node.getAttribute?.('role') === 'article' || node.getAttribute?.('data-pressable-container') === 'true') {
                return node.innerText.trim();
            }
        }
        return "";
    }

    // --- MOBILE EVENT LISTENERS ---
    if (isTouchDevice) {
        let mobileTriggerIcon = null;
        let longPressTimeout = null;
        let actionFired = false;
        let preventNextClick = false;
        let startX = 0;
        let startY = 0;
        let lastTriggeredAt = 0;

        function cancelLongPress() {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
        }

        function showMobileTrigger(touchEvent, url, fallbackText = "") {
            hideMobileTrigger();
            const touch = touchEvent.touches ? touchEvent.touches[0] : touchEvent;
            mobileTriggerIcon = document.createElement('button');
            mobileTriggerIcon.className = 'summary-float-btn';
            mobileTriggerIcon.textContent = 'S';
            document.body.appendChild(mobileTriggerIcon);
            const iconSizeNum = parseInt(settings.iconSize, 10) || 40;

            const posY = Math.max(10, touch.clientY - 60);
            const posX = Math.max(10, touch.clientX - (iconSizeNum / 2));

            Object.assign(mobileTriggerIcon.style, {
                width: `${iconSizeNum}px`,
                height: `${iconSizeNum}px`,
                fontSize: `calc(${iconSizeNum}px * 0.45)`,
                left: `${posX}px`,
                top: `${posY}px`
            });

            const triggerFn = (e) => {
                e.stopPropagation();
                e.preventDefault();
                handleInitialSummarize(url, fallbackText);
                hideMobileTrigger();
            };

            mobileTriggerIcon.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();
            }, { passive: false });

            mobileTriggerIcon.addEventListener('touchend', triggerFn, { passive: false });
            mobileTriggerIcon.addEventListener('click', triggerFn, { passive: false });

            setTimeout(() => mobileTriggerIcon.classList.add('summary-show'), 10);
        }

        function hideMobileTrigger() {
            if (mobileTriggerIcon) {
                const btn = mobileTriggerIcon;
                btn.classList.remove('summary-show');
                setTimeout(() => btn.remove(), 200);
                mobileTriggerIcon = null;
            }
        }

        document.addEventListener('touchstart', (e) => {
            cancelLongPress();
            if (e.touches && e.touches.length > 1) return;

            const path = e.composedPath ? e.composedPath() : [];
            if (mobileTriggerIcon && path.includes(mobileTriggerIcon)) return;

            if (mobileTriggerIcon) hideMobileTrigger();

            const targetUrl = findLinkFromTarget(e.target, path);
            if (!targetUrl || !isValidUrl(targetUrl) || isIgnorableTarget(e.target, targetUrl)) {
                return;
            }

            const cardText = extractCardOrTweetText(e.target, path);
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            actionFired = false;

            longPressTimeout = setTimeout(() => {
                if (actionFired) return;
                actionFired = true;
                preventNextClick = true;
                lastTriggeredAt = Date.now();
                showMobileTrigger(e, targetUrl, cardText);
            }, 550);
        }, { capture: true, passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!longPressTimeout || !e.touches || !e.touches[0]) return;
            const dx = Math.abs(e.touches[0].clientX - startX);
            const dy = Math.abs(e.touches[0].clientY - startY);
            if (dx > 8 || dy > 8) {
                cancelLongPress();
            }
        }, { capture: true, passive: true });

        document.addEventListener('touchend', (e) => {
            cancelLongPress();
            if (preventNextClick) {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => { preventNextClick = false; }, 300);
            }
        }, { capture: true, passive: false });

        document.addEventListener('touchcancel', cancelLongPress, { capture: true, passive: true });
        window.addEventListener('scroll', cancelLongPress, { capture: true, passive: true });

        document.addEventListener('click', (e) => {
            if (preventNextClick) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                preventNextClick = false;
            }
        }, { capture: true });

        document.addEventListener('contextmenu', (e) => {
            const path = e.composedPath ? e.composedPath() : [];
            if (mobileTriggerIcon && path.includes(mobileTriggerIcon)) return;
            const targetUrl = findLinkFromTarget(e.target, path);
            if (targetUrl && isValidUrl(targetUrl) && !isIgnorableTarget(e.target, targetUrl)) {
                e.preventDefault();
                cancelLongPress();
                if (Date.now() - lastTriggeredAt > 400) {
                    const cardText = extractCardOrTweetText(e.target, path);
                    showMobileTrigger(e, targetUrl, cardText);
                }
            }
        }, { capture: true });
    }

    // --- INITIALIZATION & HELPERS ---
    const makeDraggable = (el, handle) => { let p1=0,p2=0,p3=0,p4=0; const s=(e)=>{e.preventDefault();p3=e.clientX;p4=e.clientY;document.onmouseup=n;document.onmousemove=m;}; const m=(e)=>{e.preventDefault();p1=p3-e.clientX;p2=p4-e.clientY;p3=e.clientX;p4=e.clientY;el.style.top=`${el.offsetTop-p2}px`;el.style.left=`${el.offsetLeft-p1}px`;}; const n=()=>{document.onmouseup=null;document.onmousemove=null;}; if(handle&&!isTouchDevice){handle.onmousedown=s;}else if(handle&&isTouchDevice){let touch;handle.ontouchstart=(e)=>{touch=e.touches[0];p3=touch.clientX;p4=touch.clientY;};handle.ontouchmove=(e)=>{e.preventDefault();touch=e.touches[0];p1=p3-touch.clientX;p2=p4-touch.clientY;p3=touch.clientX;p4=touch.clientY;el.style.top=`${el.offsetTop-p2}px`;el.style.left=`${el.offsetLeft-p1}px`;};}};
    function initialize() { loadSettings().then(() => { if (ttsSupported) loadAndPopulateVoices(); createSummaryPanel(); hideSummaryPanel(); GM_registerMenuCommand("AI Summaries Settings", openSettingsPanel); }); document.addEventListener('mousedown', (e) => { if (!e.target.closest('#summary-panel-container, .summary-float-btn, #summary-overlay')) hideSummaryPanel(); }); }

    GM_addStyle(`:root{--bg-primary:#1e1e1e;--bg-secondary:#252526;--bg-tertiary:#333;--text-primary:#d4d4d4;--text-secondary:#9cdcfe;--accent-color:#4a90e2} #summary-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,.6);z-index:2147483645;display:none;opacity:0;transition:opacity .2s ease-in-out} #summary-panel-container{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;width:var(--popup-width) !important;max-height:var(--popup-max-height) !important;background-color:var(--bg-primary);color:var(--text-primary);border:1px solid var(--bg-tertiary);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.5);display:none;flex-direction:column;font-family:var(--font-family);resize:both;overflow:hidden;opacity:0;transition:opacity .2s ease,transform .2s ease} #summary-panel-container:not(.dark-mode){--bg-primary:#fff;--bg-secondary:#f3f3f3;--bg-tertiary:#ddd;--text-primary:#222;--text-secondary:#005a9e} #summary-header{display:flex;justify-content:flex-end;align-items:center;padding:4px 8px;cursor:move;background-color:var(--bg-secondary);border-bottom:1px solid var(--bg-tertiary);flex-shrink:0} .summary-header-btn{background:0 0;border:none;color:var(--text-primary);cursor:pointer;font-size:18px;opacity:.7;padding:4px;display:flex;align-items:center;justify-content:center} .summary-header-btn:hover{opacity:1} .summary-header-btn svg{width:20px;height:20px} #summary-main-view{display:flex;flex-direction:column;overflow:hidden;flex-grow:1} #summary-content-wrapper{padding:15px;overflow-y:auto;flex-grow:1;font-size:var(--font-size) !important} .summary-response-block{margin-top:15px;border-top:1px dashed var(--bg-tertiary);padding-top:12px} .summary-response-block:first-child{margin-top:0;border-top:none;padding-top:0} .summary-response-header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px} .summary-response-title{font-weight:700;color:var(--text-secondary);flex-grow:1} .summary-response-content{font-size:var(--font-size) !important;line-height:1.6} .summary-status-message{font-style:italic;opacity:.8;padding:15px;text-align:center} #summary-footer{display:block;padding:10px;background-color:var(--bg-secondary);border-top:1px solid var(--bg-tertiary);flex-shrink:0} #summary-chat-input-wrapper{display:flex;gap:8px} #summary-chat-input{flex-grow:1;background-color:var(--bg-tertiary);border:1px solid #444;color:var(--text-primary);border-radius:20px;padding:8px 15px;font-size:14px} #summary-chat-input:focus{outline:0;border-color:var(--accent-color)} #summary-chat-submit{background:var(--accent-color);border:none;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0} #summary-chat-submit svg{fill:#fff;width:15px;height:15px} #summary-settings-view{display:none;flex-direction:column;padding:20px;gap:15px;overflow-y:auto} #summary-settings-view h2{text-align:center;margin:0 0 10px 0;color:var(--text-secondary)} .summary-setting{display:flex;flex-direction:column;gap:5px} .summary-setting-row{display:grid;grid-template-columns:1fr 1fr;gap:15px;align-items:end} .api-settings-group{flex-direction:column;gap:12px;border:1px solid var(--bg-tertiary);padding:10px;border-radius:6px} #summary-settings-view input,#summary-settings-view select{width:100%;box-sizing:border-box;padding:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--bg-tertiary);border-radius:4px} #setting-save-btn{padding:10px;background:var(--accent-color);color:white;border:none;border-radius:4px;cursor:pointer;font-weight:700;margin-top:10px} .summary-switch{position:relative;display:inline-block;width:50px;height:24px} .summary-switch input{opacity:0;width:0;height:0} .summary-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#ccc;transition:.4s;border-radius:34px} .summary-slider:before{position:absolute;content:"";height:16px;width:16px;left:4px;bottom:4px;background-color:white;transition:.4s;border-radius:50%} input:checked + .summary-slider{background-color:var(--accent-color)} input:checked + .summary-slider:before{transform:translateX(26px)} .loading-dots span{animation:blink 1.4s infinite both} .loading-dots span:nth-of-type(2){animation-delay:.2s} .loading-dots span:nth-of-type(3){animation-delay:.4s} @keyframes blink{0%,100%{opacity:.2}20%{opacity:1}} .summary-float-btn{position:fixed;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6c5ce7,#8e7eff);color:#fff;border-radius:9999px;box-shadow:0 8px 20px rgba(108,92,231,.6);cursor:pointer;user-select:none;border:none;opacity:0;transform:translate(-50%,-50%) scale(.8);transition:opacity .2s ease,transform .2s ease;font-weight:700;font-family:Arial,sans-serif;pointer-events:none} .summary-float-btn.summary-show{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto} .summary-float-btn:hover{filter:brightness(1.2)} .summary-float-btn:active{transform:translate(-50%,-50%) scale(.95)} .summary-copy-btn{background:0 0;border:none;color:var(--text-primary);cursor:pointer;opacity:.4;display:flex;align-items:center;justify-content:center;padding:3px;transition:opacity .2s;flex-shrink:0} .summary-response-block:hover .summary-copy-btn{opacity:1} @media(max-width:600px){#summary-panel-container{width:95vw!important;max-width:95vw!important;left:2.5vw!important;top:5vh!important;max-height:85vh!important;resize:none!important;transform:none!important} .summary-setting-row{grid-template-columns:1fr}}`);
    if (document.readyState === 'complete' || document.readyState === 'interactive') { initialize(); } else { window.addEventListener('DOMContentLoaded', initialize); }
})();
