// ==UserScript==
// @name         All-in-One AI Toolkit (Desktop App Edition)
// @namespace    http://tampermonkey.net/
// @version      7.2.1
// @description  Combines Reply, Rephraser, Summarizer, Explainer, and Grammar tools. Adapted for Tauri/Pake desktop apps.
// @author       You & Gemini
// @match        *://*/*
// @match        file:///*
// @exclude      *://j-archive.com/*
// @exclude      *://tv247us.vip/*
// @exclude      *://*.cloudflare.com/*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZmZmZiI+PHBhdGggZD0iTTEyIDJBNEM3LjU4OSAyIDQgNS41ODkgNCAxMHMzLjU4OSA4IDggOCA4LTMuNTg5IDgtOFMxNi44MTEgMiAxMiAyem0wIDJjMi4yMTEgMCA0IDEuNzkgNCA0cy0xLjc5IDQtNCA0LTQtMS43OS00LTQgMS43OS00IDQtNHptMCAxwmgtNGMtMi4yMDYgMC00LTIuMjA2LTQtNC40MDZWOS4yMDJjMS4yMS41NzYgMi41NTguODg4IDQgLjk5OvhvMS4yMDFjMCAxLjEwMy44OTcgMiAyIDIgMmg0YzEuMTAzIDAgMi0uODk3IDItMlY5YzEuNDQyLS4xMSAyLjc5LS40MjMgNC0uOTk4djIuMzk4QzIwIDEzLjc5NCAxNy43OTQgMTYgMTYgMTZoLTR6Ii8+PC9zdmc+
// @connect      generativelanguage.googleapis.com
// @connect      openrouter.ai
// @connect      api.groq.com
// @connect      api.cerebras.ai
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    /* ====================
       Desktop App GM_* Polyfills (Tauri IPC + Storage + Styles)
       ==================== */
    if (typeof GM_getValue === 'undefined') {
        window.GM_getValue = (k, d) => {
            try {
                const r = localStorage.getItem(k);
                if (r === null) return d;
                try { return JSON.parse(r); } catch(_) { return r; }
            } catch(_) { return d; }
        };
    }

    if (typeof GM_setValue === 'undefined') {
        window.GM_setValue = (k, v) => {
            try {
                localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            } catch(_) {}
        };
    }

    if (typeof GM_deleteValue === 'undefined') {
        window.GM_deleteValue = (k) => {
            try { localStorage.removeItem(k); } catch(_) {}
        };
    }

    if (typeof GM_registerMenuCommand === 'undefined') {
        window.GM_registerMenuCommand = () => {};
    }

    if (typeof GM_unregisterMenuCommand === 'undefined') {
        window.GM_unregisterMenuCommand = () => {};
    }

    if (typeof GM_addStyle === 'undefined') {
        window.GM_addStyle = (css) => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
            return style;
        };
    }

    // Tauri IPC-backed GM_xmlhttpRequest to bypass CORS & strict CSP across all websites
    if (typeof GM_xmlhttpRequest === 'undefined') {
        window.GM_xmlhttpRequest = (details) => {
            if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
                let headersObj = {};
                if (details.headers) {
                    if (details.headers instanceof Headers) {
                        details.headers.forEach((v, k) => { headersObj[k] = v; });
                    } else {
                        headersObj = details.headers;
                    }
                }

                window.__TAURI__.core.invoke('tauri_ai_proxy', {
                    url: details.url,
                    method: details.method || "GET",
                    headers: headersObj,
                    body: details.data || null
                })
                .then(rawRes => {
                    const res = JSON.parse(rawRes);
                    let response = res.responseText;
                    if (details.responseType === "json") {
                        try { response = JSON.parse(res.responseText); } catch (e) { response = null; }
                    }
                    if (details.onload) {
                        details.onload({
                            status: res.status,
                            statusText: res.status === 200 ? "OK" : "Error",
                            finalUrl: details.url,
                            responseText: res.responseText,
                            response: response,
                            responseHeaders: ""
                        });
                    }
                })
                .catch(err => {
                    if (details.onerror) details.onerror(err);
                });

                return { abort: () => {} };
            }

            // Standard Fetch Fallback if Tauri IPC isn't active
            const controller = new AbortController();
            const to = details.timeout ? setTimeout(() => controller.abort(), details.timeout) : null;
            fetch(details.url, {
                method: details.method || "GET",
                headers: details.headers || {},
                body: details.data || undefined,
                signal: controller.signal,
            })
                .then(async (res) => {
                    if (to) clearTimeout(to);
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
                    if (to) clearTimeout(to);
                    if (details.onerror) details.onerror(err);
                });
            return { abort: () => controller.abort() };
        };
    }

    /*****************************************************************
     * 🔧 UNIFIED CONFIGURATION
     *****************************************************************/
    const MODEL_OPTIONS = {
        gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        openrouter: ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat', 'anthropic/claude-3.5-haiku'],
        groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant'],
        cerebras: ['gpt-oss-120b', 'llama3.1-8b', 'llama-3.3-70b']
    };

    const DEFAULTS = {
        enableReply: GM_getValue('daa_enableReply', true),
        enableRephrase: GM_getValue('daa_enableRephrase', true),
        enableSummarize: GM_getValue('daa_enableSummarize', true),
        enableExplain: GM_getValue('daa_enableExplain', true),
        enableGrammar: GM_getValue('daa_enableGrammar', true),
        enableHumanizer: GM_getValue('daa_enableHumanizer', true),
        activeApi: GM_getValue('daa_activeApi', 'gemini'),
        geminiApiKey: GM_getValue('daa_geminiApiKey', ''),
        geminiModel: GM_getValue('daa_geminiModel', 'gemini-2.5-flash-lite'),
        openrouterApiKey: GM_getValue('daa_openrouterApiKey', ''),
        openrouterModel: GM_getValue('daa_openrouterModel', 'meta-llama/llama-3.3-70b-instruct'),
        groqApiKey: GM_getValue('daa_groqApiKey', ''),
        groqModel: GM_getValue('daa_groqModel', 'llama-3.3-70b-versatile'),
        cerebrasApiKey: GM_getValue('daa_cerebrasApiKey', ''),
        cerebrasModel: GM_getValue('daa_cerebrasModel', 'gpt-oss-120b'),
        maxTones: GM_getValue('daa_maxTones', 3),
        popupWidth: GM_getValue('daa_popupWidth', 560),
        popupHeight: GM_getValue('daa_popupHeight', 520),
        iconSize: GM_getValue('daa_iconSize', 34),
        language: GM_getValue('daa_language', 'English'),
        fontFamily: GM_getValue('daa_fontFamily', 'Helvetica, Arial, sans-serif'),
        fontSize: GM_getValue('daa_fontSize', '15px'),
        toneButtonFontSize: GM_getValue('daa_toneButtonFontSize', '13px'),
        darkMode: GM_getValue('daa_darkMode', true),
    };

    const TONES = {
        'Neutral & Informational': ['Professional', 'Formal', 'Factual', 'Informative', 'Academic', 'Analytical', 'Objective', 'Measured', 'Precise', 'Serious', 'Technical', 'Explanatory', 'Instructional', 'Didactic'],
        'Conversational & Social': ['Casual', 'Friendly', 'Warm', 'Approachable', 'Playful', 'Witty', 'Humorous', 'Bantering', 'Quirky', 'Charming', 'Relatable', 'Lighthearted', 'Easygoing', 'Conversational'],
        'Positive Emotional': ['Happy', 'Joyful', 'Cheerful', 'Optimistic', 'Encouraging', 'Hopeful', 'Grateful', 'Appreciative', 'Proud', 'Excited', 'Content', 'Inspired', 'Motivational', 'Uplifting'],
        'Affection & Romantic': ['Affectionate', 'Loving', 'Romantic', 'Flirty', 'Tender', 'Adoring', 'Admiring', 'Devoted', 'Heartwarming', 'Passionate', 'Gentle', 'Caring', 'Intimate'],
        'Reflective & Thoughtful': ['Thoughtful', 'Reflective', 'Contemplative', 'Philosophical', 'Introspective', 'Nostalgic', 'Poignant', 'Sentimental', 'Meditative', 'Pensive', 'Soulful', 'Self-aware'],
        'Negative Emotional': ['Angry', 'Irritated', 'Frustrated', 'Resentful', 'Bitter', 'Cynical', 'Melancholic', 'Sad', 'Grieving', 'Miserable', 'Disappointed', 'Regretful', 'Hurt'],
        'Fear & Anxiety': ['Anxious', 'Nervous', 'Worried', 'Uneasy', 'Tense', 'Suspenseful', 'Alarmed', 'Horrified', 'Panicked', 'Apprehensive', 'Paranoid', 'Dreadful'],
        'Cold / Detached': ['Cold', 'Detached', 'Indifferent', 'Distant', 'Curt', 'Blunt', 'Stoic', 'Matter-of-fact', 'Unemotional', 'Apathetic', 'Clinical', 'Dry'],
        'Critical & Confrontational': ['Critical', 'Skeptical', 'Questioning', 'Doubtful', 'Sarcastic', 'Ironic', 'Satirical', 'Mocking', 'Scornful', 'Disrespectful', 'Dismissive', 'Condescending', 'Patronizing'],
        'Bold & Assertive': ['Bold', 'Assertive', 'Confident', 'Audacious', 'Defiant', 'Rebellious', 'Provocative', 'Edgy', 'Challenging', 'Boastful', 'Arrogant', 'Commanding', 'Dominant'],
        'Dramatic & Literary': ['Dramatic', 'Poetic', 'Elegant', 'Allusive', 'Mysterious', 'Ominous', 'Grim', 'Tragic', 'Fanciful', 'Whimsical', 'Theatrical', 'Lyrical', 'Symbolic'],
        'Dialogue Intent': ['Agreement', 'Disagreement', 'Accepting', 'Supportive', 'Empathetic', 'Apologetic', 'Puzzled', 'Curious', 'Incredulous', 'Persuasive', 'Reassuring', 'Clarifying'],
        'Modern / Internet': ['Snarky', 'Savage', 'Sassy', 'Deadpan', 'Dry humor', 'Self-deprecating', 'Overdramatic', 'Understated', 'Chaotic', 'Unhinged', 'Cringe', 'Wholesome', 'Based', 'Edgy-ironic', 'Hyperbolic', 'Clickbait-style', 'Hot take', 'Ranting', 'Venting', 'Canceling', 'Defensive', 'Gaslighting'],
        'Nuanced Human States': ['Passive-aggressive', 'Vulnerable', 'Bored', 'Conflicted', 'Resigned', 'Hesitant', 'Reluctant', 'Awkward', 'Insecure', 'Guarded', 'Suspicious', 'Disillusioned', 'Overwhelmed', 'Burned-out'],
        'Persuasion & Influence': ['Convincing', 'Influential', 'Assertive-polite', 'Diplomatic', 'Tactful', 'Negotiative', 'Strategic', 'Framing', 'Sales-driven', 'Urgent', 'Authoritative', 'Inspirational'],
        'Moral / Value-Oriented': ['Righteous', 'Judgmental', 'Moralizing', 'Principled', 'Respectful', 'Reverent', 'Critical-ethical']
    };

    const LANGS = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Russian', 'Arabic', 'Portuguese', 'Hindi', 'Amharic'];

    /*****************************************************************
     * 🤖 AI PROMPTS
     *****************************************************************/
    const SYSTEM_PROMPTS_HUMANIZED = {
        reply: `ROLE: You are a world-class AI assistant specializing in generating human-like replies. Your goal is to craft responses that are natural, nuanced, and emotionally resonant, making them indistinguishable from authentic human communication.
OBJECTIVE: Generate a human-like reply to the provided text, bypassing AI detectors and reflecting the variability of natural writing.
OUTPUT REQUIREMENTS: Use a conversational, spontaneous tone. Integrates idioms and colloquial phrasing where appropriate. Vary sentence length and structure. AVOID clichés like "dive into", "unlock", or overly enthusiastic corporate marketing phrasing. Output ONLY the response without any preambles.`,
        rephrase: `ROLE: Act as a world-class text humanizer. Convert machine-generated content into natural, nuanced, and emotionally resonant writing.
OBJECTIVE: Transform the provided text into a human-like version that bypasses AI detectors and resonates with real readers.
OUTPUT REQUIREMENTS: Use a conversational, spontaneous tone. Vary sentence structure. Output ONLY the rewritten text without preambles or labels.`,
    };

    const SYSTEM_PROMPTS_STANDARD = {
        reply: `ROLE: You are an expert AI writing assistant specializing in drafting thoughtful, articulate replies.\nOBJECTIVE: Generate a high-quality reply to the provided text based strictly on the requested tones and context.\nOUTPUT REQUIREMENTS: Output ONLY the generated reply, without preambles or meta-commentary.`,
        rephrase: `ROLE: You are an expert writing assistant and copyeditor.\nOBJECTIVE: Rephrase and improve the provided text clearly while preserving its core meaning.\nOUTPUT REQUIREMENTS: Output ONLY the rephrased text, without any preambles.`,
    };

    const SYSTEM_PROMPTS_SHARED = {
        summarize: `You are an expert text summarizer specializing in creating audio-ready summaries. Condense the text to ~30% length, preserving key ideas, in a smooth, engaging flow. Output ONLY the summary.`,
        explain: `You are an expert explanatory AI. Provide a concise, clear explanation of the provided text in the requested language. Output ONLY the explanation.`,
        grammar: `ROLE: You are an expert copyeditor. Fix grammatical errors, typos, punctuation mistakes, and improve flow while strictly preserving the author's original voice. Output ONLY the corrected text.`,
    };

    /*****************************************************************
     * 🧩 STATE & UTILITIES
     *****************************************************************/
    let state = {
        selectionText: '',
        selectionRange: null,
        activeInput: null,
        chosenTones: [],
        customInstruction: '',
        chosenLength: null,
        isOpen: false,
        currentMode: null,
        phase: 'tones',
        messages: [],
        followUpText: '',
        updateToneConfirm: null
    };

    const $ = (sel, root = document) => root.querySelector(sel);
    const el = (tag, props = {}, ...children) => {
        const e = document.createElement(tag);
        Object.assign(e, props);
        children.flat().filter(Boolean).forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return e;
    };
    const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

    function getSelectionContext(range) {
        if (state.activeInput) {
            return (state.activeInput.value || '').substring(0, 4000).trim();
        }
        if (!range) return '';
        let context = '';
        let node = range.commonAncestorContainer;
        const blockElements = ['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'BLOCKQUOTE', 'TD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

        while (node && node !== document.body) {
            if (node.nodeType === Node.ELEMENT_NODE && blockElements.includes(node.nodeName)) {
                context = node.textContent;
                break;
            }
            node = node.parentNode;
        }

        if (!context) {
            context = document.body.innerText || '';
        }
        return context.substring(0, 4000).trim();
    }

    function getSelectionData() {
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'TEXTAREA' || (activeEl.tagName === 'INPUT' && /^(text|search|url|tel|password)$/i.test(activeEl.type)));

        if (isInput && typeof activeEl.selectionStart === 'number' && typeof activeEl.selectionEnd === 'number') {
            const start = Math.min(activeEl.selectionStart, activeEl.selectionEnd);
            const end = Math.max(activeEl.selectionStart, activeEl.selectionEnd);
            if (end - start > 1) {
                return {
                    text: activeEl.value.substring(start, end).trim(),
                    input: activeEl,
                    range: null
                };
            }
        }

        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount > 0 && sel.toString().trim().length > 1) {
            return {
                text: sel.toString().trim(),
                input: null,
                range: sel.getRangeAt(0)
            };
        }
        return null;
    }

    /*****************************************************************
     * 🔊 TTS UTILITIES
     *****************************************************************/
    let speechSynth = window.speechSynthesis;
    let currentUtterance = null;
    const SPEAKER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"></path><path d="M17 10s.5 2 2 2 2-2 2-2"></path></svg>`;
    const PAUSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    const PLAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

    function speakText(text, lang, pausePlayButton) {
        stopSpeaking();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        currentUtterance = utterance;
        utterance.onstart = () => { if (pausePlayButton) pausePlayButton.innerHTML = PAUSE_ICON_SVG; };
        utterance.onend = () => { currentUtterance = null; if (pausePlayButton) pausePlayButton.innerHTML = PLAY_ICON_SVG; };
        speechSynth.speak(utterance);
    }

    function togglePausePlay(button) {
        if (!currentUtterance) return;
        if (speechSynth.paused) {
            speechSynth.resume();
            button.innerHTML = PAUSE_ICON_SVG;
        } else {
            speechSynth.pause();
            button.innerHTML = PLAY_ICON_SVG;
        }
    }

    function stopSpeaking() {
        if (currentUtterance) {
            speechSynth.cancel();
            currentUtterance = null;
        }
        document.querySelectorAll('.daa-tts-pause-play').forEach(btn => btn.innerHTML = PLAY_ICON_SVG);
    }

    /*****************************************************************
     * ⚙️ SETTINGS HELPERS & LIVE STYLE INJECTION
     *****************************************************************/
    const getSettings = () => ({
        enableReply: GM_getValue('daa_enableReply', DEFAULTS.enableReply),
        enableRephrase: GM_getValue('daa_enableRephrase', DEFAULTS.enableRephrase),
        enableSummarize: GM_getValue('daa_enableSummarize', DEFAULTS.enableSummarize),
        enableExplain: GM_getValue('daa_enableExplain', DEFAULTS.enableExplain),
        enableGrammar: GM_getValue('daa_enableGrammar', DEFAULTS.enableGrammar),
        enableHumanizer: GM_getValue('daa_enableHumanizer', DEFAULTS.enableHumanizer),
        activeApi: GM_getValue('daa_activeApi', DEFAULTS.activeApi),
        geminiApiKey: GM_getValue('daa_geminiApiKey', DEFAULTS.geminiApiKey),
        geminiModel: GM_getValue('daa_geminiModel', DEFAULTS.geminiModel),
        openrouterApiKey: GM_getValue('daa_openrouterApiKey', DEFAULTS.openrouterApiKey),
        openrouterModel: GM_getValue('daa_openrouterModel', DEFAULTS.openrouterModel),
        groqApiKey: GM_getValue('daa_groqApiKey', DEFAULTS.groqApiKey),
        groqModel: GM_getValue('daa_groqModel', DEFAULTS.groqModel),
        cerebrasApiKey: GM_getValue('daa_cerebrasApiKey', DEFAULTS.cerebrasApiKey),
        cerebrasModel: GM_getValue('daa_cerebrasModel', DEFAULTS.cerebrasModel),
        maxTones: GM_getValue('daa_maxTones', DEFAULTS.maxTones),
        popupWidth: GM_getValue('daa_popupWidth', DEFAULTS.popupWidth),
        popupHeight: GM_getValue('daa_popupHeight', DEFAULTS.popupHeight),
        iconSize: GM_getValue('daa_iconSize', DEFAULTS.iconSize),
        language: GM_getValue('daa_language', DEFAULTS.language),
        fontFamily: GM_getValue('daa_fontFamily', DEFAULTS.fontFamily),
        fontSize: GM_getValue('daa_fontSize', DEFAULTS.fontSize),
        toneButtonFontSize: GM_getValue('daa_toneButtonFontSize', DEFAULTS.toneButtonFontSize),
        darkMode: GM_getValue('daa_darkMode', DEFAULTS.darkMode),
    });

    let daaStyleEl = null;

    function applyStyles() {
        const s = getSettings();
        const bg      = s.darkMode ? '#111' : '#ffffff';
        const bg2     = s.darkMode ? '#161616' : '#f6f6f8';
        const text    = s.darkMode ? '#e7e7e7' : '#171717';
        const subtle  = s.darkMode ? '#9aa1a6' : '#555';
        const border  = s.darkMode ? '#2a2a2a' : '#e5e7eb';

        if (!daaStyleEl || !daaStyleEl.isConnected) {
            daaStyleEl = document.createElement('style');
            daaStyleEl.id = 'daa-styles';
            document.head.appendChild(daaStyleEl);
        }

        daaStyleEl.textContent = `
:root {
    --daa-z: 2147483646;
    --daa-radius: 14px;
    --daa-accent: #6C5CE7;
    --daa-danger: #E03131;
    --daa-bg: ${bg};
    --daa-bg-2: ${bg2};
    --daa-text: ${text};
    --daa-subtle: ${subtle};
    --daa-border: ${border};
    --daa-font-family: ${s.fontFamily};
    --daa-font-size: ${s.fontSize};
    --daa-tone-font-size: ${s.toneButtonFontSize};
    --daa-icon-size: ${s.iconSize}px;
}
.daa-hidden { display: none !important; }
.daa-float-btn { position: fixed; z-index: var(--daa-z); display: flex; align-items: center; justify-content: center; width: var(--daa-icon-size); height: var(--daa-icon-size); background: linear-gradient(135deg, #6C5CE7, #8E7EFF); color: #fff; border-radius: 9999px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); cursor: pointer; user-select: none; border: none; opacity: 0; transform: scale(.8) translateY(5px); transition: opacity .2s ease, transform .2s ease; font-weight: 700; font-family: Arial, sans-serif; font-size: calc(var(--daa-icon-size) * 0.45); pointer-events: none; touch-action: manipulation; }
.daa-float-btn.daa-show { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; }
.daa-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: saturate(1.2) blur(2px); z-index: var(--daa-z); opacity: 0; transition: opacity .2s ease; }
.daa-overlay.daa-show { opacity: 1; }
.daa-modal { position: fixed; background: var(--daa-bg); color: var(--daa-text); border: 1px solid var(--daa-border); border-radius: var(--daa-radius); box-shadow: 0 10px 30px rgba(0,0,0,.3); z-index: calc(var(--daa-z) + 1); max-width: calc(100vw - 20px); max-height: calc(100vh - 20px); display: flex; flex-direction: column; overflow: hidden; font-family: var(--daa-font-family); font-size: var(--daa-font-size); opacity: 0; transform: scale(.98); transition: opacity .2s ease, transform .2s ease; }
.daa-modal.daa-show { opacity: 1; transform: scale(1); }
.daa-header { display: flex; align-items: center; gap: 6px; padding: 10px 12px; background: var(--daa-bg-2); border-bottom: 1px solid var(--daa-border); cursor: move; user-select: none; }
.daa-title { font-weight: 700; letter-spacing: .2px; flex-shrink: 0; font-size: 14px; }
.daa-spacer { flex: 1; }
.daa-btn { border: 1px solid var(--daa-border); background: var(--daa-bg); color: var(--daa-text); padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: all .15s ease; font-weight: 600; font-size: 13px; }
.daa-btn:hover { background: var(--daa-bg-2); }
.daa-btn-primary { background: var(--daa-accent); border-color: #0000; color: #fff; }
.daa-btn-danger { background: var(--daa-danger); color: #fff; border-color: #0000; }
.daa-body { flex: 1; display: flex; min-height: 0; }
.daa-phase { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.daa-tones-wrapper { overflow: auto; flex: 1; padding: 10px 12px; display: flex; flex-direction: column; gap: 12px; height: 100%; }
.daa-tones-group { display: flex; flex-direction: column; gap: 5px; }
.daa-tones-group-title { font-size: 11px; font-weight: 700; color: var(--daa-subtle); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--daa-border); padding-bottom: 2px; }
.daa-tones { display: flex; flex-wrap: wrap; gap: 5px; }
.daa-tone { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--daa-border); padding: 5px 9px; border-radius: 6px; cursor: pointer; background: var(--daa-bg); transition: all .12s ease; font-weight: 500; white-space: nowrap; color: var(--daa-text) !important; font-size: var(--daa-tone-font-size); line-height: 1.2; }
.daa-tone.daa-selected { background: var(--daa-accent); color: #fff !important; border-color: #0000; }
.daa-footer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--daa-border); background: var(--daa-bg); }
.daa-reply-wrap { display: flex; flex-direction: column; height: 100%; }
.daa-chat { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.daa-msg { position: relative; max-width: 88%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--daa-border); line-height: 1.5; word-wrap: break-word; }
.daa-msg-user { margin-left: auto; background: var(--daa-accent); color: #fff; border-color: #0000; }
.daa-msg-assistant { background: var(--daa-bg); padding-bottom: 30px; }
.daa-msg-assistant.daa-msg-wide { max-width: 100%; }
.daa-msg-error { background: #ffefef; color: #b00020; border-color: #ffd0d0; max-width: 100%; }
.daa-copy-btn { position: absolute; top: 6px; right: 6px; background: var(--daa-bg-2); border: 1px solid var(--daa-border); border-radius: 6px; cursor: pointer; padding: 4px; }
.daa-copy-btn svg { width: 15px; height: 15px; stroke: var(--daa-subtle); display: block; }
.daa-input-row { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--daa-border); align-items: center; }
.daa-textarea { flex: 1; border: 1px solid var(--daa-border); border-radius: 10px; padding: 8px 10px; outline: none; background: var(--daa-bg); color: var(--daa-text); font-family: inherit; font-size: inherit; resize: vertical; }
.daa-resize { position: absolute; width: 14px; height: 14px; right: 4px; bottom: 4px; cursor: nwse-resize; opacity: .6; border-right: 2px solid var(--daa-border); border-bottom: 2px solid var(--daa-border); border-radius: 0 0 2px 0; }
.daa-spinner { width: 16px; height: 16px; border: 2.5px solid #0000; border-top-color: #fff; border-right-color: #fff; border-radius: 50%; animation: daa-spin .8s linear infinite; }
.daa-badge { display: inline-flex; align-items: center; gap: 8px; padding: 5px 9px; background: var(--daa-accent); color: #fff; border-radius: 999px; font-weight: 700; font-size: 12px; }
@keyframes daa-spin { to { transform: rotate(360deg); } }
.daa-settings { position: fixed; z-index: calc(var(--daa-z) + 2); top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(680px, 92vw); max-height: 85vh; overflow: auto; background: var(--daa-bg); color: var(--daa-text); border: 1px solid var(--daa-border); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.2); padding: 16px; font-family: var(--daa-font-family); font-size: var(--daa-font-size); }
.daa-settings h2, .daa-settings h3 { margin: 0 0 10px; font-size: 17px; color: var(--daa-accent); }
.daa-settings h3 { font-size: 15px; margin-top: 12px; border-top: 1px solid var(--daa-border); padding-top: 10px; }
.daa-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.daa-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.daa-field { display: flex; flex-direction: column; gap: 5px; }
.daa-field-row { display: flex; align-items: center; gap: 6px; }
.daa-input, .daa-select { width: 100%; box-sizing: border-box; background: var(--daa-bg-2); border: 1px solid var(--daa-border); border-radius: 8px; padding: 7px; color: var(--daa-text); font-size: 13px; }
.daa-settings-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.daa-followup-input { flex: 1; resize: none; background: var(--daa-bg); color: var(--daa-text); font-family: inherit; padding: 8px; border: 1px solid var(--daa-border); border-radius: 8px; font-size: 14px; }
.daa-followup-send { background: var(--daa-accent); color: #fff; border: none; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; }
.daa-followup-send:disabled { background: #555; cursor: not-allowed; }
.daa-tts-controls { display: flex; gap: 4px; align-items: center; position: absolute; bottom: 6px; left: 12px; background: var(--daa-bg-2); border: 1px solid var(--daa-border); border-radius: 6px; padding: 2px 4px; opacity: 0.9; }
.daa-tts-btn { background: none; border: none; cursor: pointer; padding: 2px; color: var(--daa-subtle); display: flex; }
.daa-tts-btn svg { width: 15px; height: 15px; stroke: currentColor; fill: currentColor; }
.daa-tts-pause-play { margin-left: -2px; border-left: 1px solid var(--daa-border); padding-left: 4px; }
`;
    }

    function showToast(text) {
        const existing = document.getElementById('daa-toast');
        if (existing) existing.remove();
        const toast = el('div', {
            id: 'daa-toast',
            style: 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #6C5CE7; color: #fff; padding: 10px 18px; border-radius: 8px; z-index: 2147483647; font-family: Helvetica, Arial, sans-serif; font-size: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.3); transition: opacity .3s ease; opacity: 0; pointer-events: none; max-width: 90vw; text-align: center;',
            textContent: text
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; });
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2400);
    }

    applyStyles();

    function refreshUI() {
        applyStyles();
        createButtons();
        if (state.selectionText) updateButtonPositions();
    }

    const saveSettings = (obj) => {
        Object.entries(obj).forEach(([k, v]) => GM_setValue(`daa_${k}`, v));
        refreshUI();
        registerToggleCommands();
        const panel = document.getElementById('daa-settings');
        if (panel) panel.remove();
        showToast('Settings saved.');
    };

    /*****************************************************************
     * 🪄 FLOATING BUTTON CONTROLLER
     *****************************************************************/
    let buttons = {};

    function createButtons() {
        const s = getSettings();
        const modules = [
            { mode: 'reply', text: 'R', enabled: s.enableReply, title: 'Generate Reply' },
            { mode: 'rephrase', text: 'Rp', enabled: s.enableRephrase, title: 'Rephrase Text' },
            { mode: 'summarize', text: 'S', enabled: s.enableSummarize, title: 'Summarize Text' },
            { mode: 'explain', text: 'E', enabled: s.enableExplain, title: 'Explain Text' },
            { mode: 'grammar', text: 'G', enabled: s.enableGrammar, title: 'Fix Grammar' },
        ];

        modules.forEach(m => {
            if (!buttons[m.mode]) {
                const btn = el('div', { className: 'daa-float-btn', textContent: m.text, title: m.title });

                const handleAction = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onButtonClick(e, m.mode);
                };

                btn.addEventListener('touchstart', handleAction, { passive: false });
                btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
                btn.addEventListener('click', handleAction);

                document.body.appendChild(btn);
                buttons[m.mode] = btn;
            }
        });
    }

    function hideAllButtons() {
        Object.values(buttons).forEach(btn => btn.classList.remove('daa-show'));
    }

    function updateButtonPositions() {
        if (!state.selectionText) {
            hideAllButtons();
            return;
        }

        let anchorRect = null;
        if (state.selectionRange) {
            const rects = state.selectionRange.getClientRects();
            anchorRect = rects.length > 0 ? rects[rects.length - 1] : state.selectionRange.getBoundingClientRect();
        } else if (state.activeInput) {
            anchorRect = state.activeInput.getBoundingClientRect();
        }

        if (!anchorRect || (anchorRect.width === 0 && anchorRect.height === 0)) {
            hideAllButtons();
            return;
        }

        const s = getSettings();
        const enabledModes = [
            s.enableReply && 'reply',
            s.enableRephrase && 'rephrase',
            s.enableSummarize && 'summarize',
            s.enableExplain && 'explain',
            s.enableGrammar && 'grammar'
        ].filter(Boolean);

        Object.entries(buttons).forEach(([mode, btn]) => {
            if (!enabledModes.includes(mode)) btn.classList.remove('daa-show');
        });

        if (enabledModes.length === 0) return;

        const iconSize = s.iconSize;
        const spacing = 6;
        const buttonCount = enabledModes.length;
        const totalWidth = (iconSize * buttonCount) + (spacing * (buttonCount - 1));

        const vv = window.visualViewport;
        const vpWidth = vv ? vv.width : window.innerWidth;
        const vpHeight = vv ? vv.height : window.innerHeight;
        const vpOffsetTop = vv ? vv.offsetTop : 0;
        const vpOffsetLeft = vv ? vv.offsetLeft : 0;

        let startX = anchorRect.left;
        const clampedStartX = clamp(startX, vpOffsetLeft + spacing, vpOffsetLeft + vpWidth - totalWidth - spacing);

        let top = anchorRect.bottom + spacing;
        if (top + iconSize > vpOffsetTop + vpHeight) {
            top = anchorRect.top - iconSize - spacing;
        }
        const clampedTop = clamp(top, vpOffsetTop + spacing, vpOffsetTop + vpHeight - iconSize - spacing);

        let currentLeft = clampedStartX;
        enabledModes.forEach((mode) => {
            const btn = buttons[mode];
            if (btn) {
                btn.style.width = `${iconSize}px`;
                btn.style.height = `${iconSize}px`;
                btn.style.top = `${clampedTop}px`;
                btn.style.left = `${currentLeft}px`;
                btn.classList.add('daa-show');
                currentLeft += iconSize + spacing;
            }
        });
    }

    function onSelectionChange() {
        if (state.isOpen) return;
        createButtons();
        const selData = getSelectionData();

        if (selData && selData.text.length > 1) {
            state.selectionText = selData.text;
            state.selectionRange = selData.range;
            state.activeInput = selData.input;
            clearTimeout(window.daa_updateTimer);
            window.daa_updateTimer = setTimeout(updateButtonPositions, 60);
        } else {
            state.selectionText = '';
            state.selectionRange = null;
            state.activeInput = null;
            hideAllButtons();
        }
    }

    function onButtonClick(e, mode) {
        if (state.selectionText && state.selectionText.trim().length > 1) {
            openModal(mode);
            hideAllButtons();
        }
    }

    document.addEventListener('mouseup', onSelectionChange, true);
    document.addEventListener('touchend', onSelectionChange, true);
    document.addEventListener('selectionchange', onSelectionChange, true);
    document.addEventListener('select', onSelectionChange, true);
    window.addEventListener('scroll', onSelectionChange, true);
    window.addEventListener('resize', updateButtonPositions, true);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateButtonPositions);
        window.visualViewport.addEventListener('scroll', updateButtonPositions);
    }
    document.addEventListener('keyup', (e) => { if (e.key === 'Escape') closeModal(); });

    /*****************************************************************
     * 🖼️ MODAL & UI RENDERING
     *****************************************************************/
    let overlay, modal, phaseTonesEl, phaseReplyEl;

    function renderApiToggle() {
        const settings = getSettings();
        const wrapper = el('div', { id: 'daa-api-toggle-wrap', style: 'display:flex; align-items:center; margin-right: 4px; flex-shrink:0;' });
        const select = el('select', {
            className: 'daa-select',
            style: 'padding: 4px 6px; font-size: 11px; font-weight: bold; border-radius: 6px; cursor: pointer; border: 1px solid var(--daa-border); background: var(--daa-bg); color: var(--daa-text); min-width: 80px; outline: none;',
        });

        const apis = [
            { val: 'gemini', label: 'Gemini' },
            { val: 'openrouter', label: 'OpenRouter' },
            { val: 'groq', label: 'Groq' },
            { val: 'cerebras', label: 'Cerebras' }
        ];

        apis.forEach(api => {
            select.appendChild(el('option', { value: api.val, selected: settings.activeApi === api.val }, api.label));
        });

        select.addEventListener('change', (e) => {
            stopSpeaking();
            GM_setValue('daa_activeApi', e.target.value);
        });

        wrapper.appendChild(select);
        return wrapper;
    }

    function openModal(mode) {
        if (state.isOpen) return;
        state.isOpen = true;
        state.currentMode = mode;
        state.phase = (mode === 'summarize' || mode === 'explain' || mode === 'grammar') ? 'reply' : 'tones';
        state.chosenTones = [];
        state.messages = [];
        state.customInstruction = '';
        state.chosenLength = null;
        state.updateToneConfirm = null;
        const settings = getSettings();

        overlay = el('div', { className: 'daa-overlay' });
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeModal(); });
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('daa-show'));

        modal = el('div', { className: 'daa-modal' });

        const vv = window.visualViewport;
        const vpWidth = vv ? vv.width : window.innerWidth;
        const vpHeight = vv ? vv.height : window.innerHeight;
        const modalWidth = Math.min(settings.popupWidth, vpWidth - 20);
        const modalHeight = Math.min(settings.popupHeight, vpHeight - 20);

        modal.style.width = `${modalWidth}px`;
        modal.style.height = `${modalHeight}px`;
        modal.style.top = `${Math.max(10, (vpHeight - modalHeight) / 2)}px`;
        modal.style.left = `${Math.max(10, (vpWidth - modalWidth) / 2)}px`;

        const modeTitles = { reply: 'Reply Generator', rephrase: 'Rephraser', summarize: 'Summarizer', explain: 'Explainer', grammar: 'Grammar' };

        let isHumanizerActive = GM_getValue('daa_enableHumanizer', DEFAULTS.enableHumanizer);
        const humanizerBtn = el('button', {
            className: `daa-btn ${isHumanizerActive ? 'daa-btn-primary' : ''}`,
            title: 'Toggle Humanizer Prompt',
            style: 'font-size: 11px; padding: 4px 7px;'
        }, isHumanizerActive ? 'Human: ON' : 'Human: OFF');

        humanizerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isHumanizerActive = !isHumanizerActive;
            GM_setValue('daa_enableHumanizer', isHumanizerActive);
            humanizerBtn.textContent = isHumanizerActive ? 'Human: ON' : 'Human: OFF';
            humanizerBtn.classList.toggle('daa-btn-primary', isHumanizerActive);
        });

        const settingsBtn = el('button', { className: 'daa-btn', title: 'Settings', style: 'padding: 4px 8px; font-size: 11px;' }, '⚙️');
        settingsBtn.addEventListener('click', showSettingsPanel);

        const closeBtn = el('button', { className: 'daa-btn daa-btn-danger', title: 'Close (Esc)', style: 'padding: 4px 8px; font-size: 11px;' }, '✕');
        closeBtn.addEventListener('click', closeModal);

        const header = el('div', { className: 'daa-header' },
            renderApiToggle(),
            el('span', { className: 'daa-title' }, modeTitles[mode]),
            el('span', { className: 'daa-spacer' }),
            humanizerBtn,
            settingsBtn,
            closeBtn
        );

        const body = el('div', { className: 'daa-body' });
        phaseTonesEl = el('div', { className: `daa-phase ${state.phase !== 'tones' ? 'daa-hidden' : ''}` }, renderToneSelection());
        phaseReplyEl = el('div', { className: `daa-phase ${state.phase !== 'reply' ? 'daa-hidden' : ''}` }, renderReplyView());
        body.append(phaseTonesEl, phaseReplyEl);

        const resizer = el('div', { className: 'daa-resize', title: 'Resize' });
        modal.append(header, body, resizer);
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('daa-show'));

        enableDrag(modal, header);
        enableResize(modal, resizer);
        document.addEventListener('keydown', onKeyDownReply, true);

        if (state.currentMode === 'summarize' || state.currentMode === 'explain' || state.currentMode === 'grammar') {
            goReplyPhase();
        }
    }

    function closeModal() {
        if (!state.isOpen) return;
        state.isOpen = false;
        document.removeEventListener('keydown', onKeyDownReply, true);
        stopSpeaking();
        overlay?.remove();
        overlay = null;
        modal?.remove();
        modal = null;
    }

    function onKeyDownReply(e) {
        if (e.key === 'Escape') {
            closeModal();
            return;
        }
        const input = $('.daa-followup-input');
        if (state.phase === 'reply' && input && document.activeElement === input && !input.disabled && (e.key === 'Enter' && !e.shiftKey)) {
            e.preventDefault();
            sendFollowUp();
        }
    }

    function enableDrag(target, handle) {
        let dx = 0, dy = 0;
        const move = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            target.style.left = `${clamp(clientX - dx, 6, window.innerWidth - 50)}px`;
            target.style.top = `${clamp(clientY - dy, 6, window.innerHeight - 50)}px`;
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', up);
        };
        const down = (e) => {
            if (e.target.closest('button, select, input, textarea')) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const rect = target.getBoundingClientRect();
            dx = clientX - rect.left;
            dy = clientY - rect.top;
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
            document.addEventListener('touchmove', move, { passive: true });
            document.addEventListener('touchend', up);
        };
        handle.addEventListener('mousedown', down);
        handle.addEventListener('touchstart', down, { passive: true });
    }

    function enableResize(target, handle) {
        let startX = 0, startY = 0, startW = 0, startH = 0;
        const move = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const w = clamp(startW + (clientX - startX), 260, window.innerWidth - 20);
            const h = clamp(startH + (clientY - startY), 300, window.innerHeight - 20);
            target.style.width = `${w}px`;
            target.style.height = `${h}px`;
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', up);
            const rect = target.getBoundingClientRect();
            GM_setValue('daa_popupWidth', Math.round(rect.width));
            GM_setValue('daa_popupHeight', Math.round(rect.height));
        };
        const down = (e) => {
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const rect = target.getBoundingClientRect();
            startX = clientX;
            startY = clientY;
            startW = rect.width;
            startH = rect.height;
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', up);
        };
        handle.addEventListener('mousedown', down);
        handle.addEventListener('touchstart', down, { passive: false });
    }

    function renderToneSelection() {
        const topBar = el('div', { style: 'display: flex; flex-direction: column; gap: 8px; padding: 10px; border-bottom: 1px solid var(--daa-border); background: var(--daa-bg-2);' });
        const customInput = el('textarea', {
            className: 'daa-textarea',
            placeholder: 'Add custom instructions or context (optional)...',
            rows: 2,
            style: 'width: 100%; box-sizing: border-box;'
        });
        customInput.addEventListener('input', () => {
            state.customInstruction = customInput.value;
            if (state.updateToneConfirm) state.updateToneConfirm();
        });

        const lengthWrapper = el('div', { style: 'display: flex; gap: 6px;' });
        ['Short', 'Medium', 'Long'].forEach(l => {
            const btn = el('button', { className: 'daa-btn daa-length-btn', textContent: l, style: 'flex: 1;' });
            btn.addEventListener('click', () => {
                if (state.chosenLength === l) {
                    state.chosenLength = null;
                    btn.classList.remove('daa-btn-primary');
                } else {
                    state.chosenLength = l;
                    lengthWrapper.querySelectorAll('.daa-length-btn').forEach(b => b.classList.remove('daa-btn-primary'));
                    btn.classList.add('daa-btn-primary');
                }
                if (state.updateToneConfirm) state.updateToneConfirm();
            });
            lengthWrapper.appendChild(btn);
        });

        const badgeRow = el('div', { style: 'display: flex; align-items: center;' },
            el('span', { className: 'daa-badge' }, `Select up to ${getSettings().maxTones} tone(s)`)
        );

        topBar.append(customInput, lengthWrapper, badgeRow);

        const wrapper = el('div', { className: 'daa-tones-wrapper' });
        Object.entries(TONES).forEach(([groupName, tones]) => {
            const groupEl = el('div', { className: 'daa-tones-group' });
            const titleEl = el('div', { className: 'daa-tones-group-title', textContent: groupName });
            const grid = el('div', { className: 'daa-tones' });

            tones.forEach(name => {
                const btn = el('div', { className: 'daa-tone', textContent: name, tabIndex: 0 });
                btn.addEventListener('click', () => toggleTone(name, btn));
                grid.appendChild(btn);
            });

            groupEl.append(titleEl, grid);
            wrapper.appendChild(groupEl);
        });

        const footer = el('div', { className: 'daa-footer' },
            el('button', { className: 'daa-btn', id: 'daa-cancel-tones' }, 'Cancel'),
            el('span', { className: 'daa-spacer' }),
            el('button', { className: 'daa-btn daa-btn-primary', id: 'daa-confirm-tones', disabled: true }, 'Confirm')
        );

        footer.querySelector('#daa-cancel-tones').addEventListener('click', closeModal);
        footer.querySelector('#daa-confirm-tones').addEventListener('click', () => goReplyPhase());

        state.updateToneConfirm = () => {
            const hasTones = state.chosenTones.length > 0;
            const hasCustom = state.customInstruction && state.customInstruction.trim().length > 0;
            const hasLength = state.chosenLength !== null;
            footer.querySelector('#daa-confirm-tones').disabled = !(hasTones || hasCustom || hasLength);
        };

        return el('div', { style: 'display:flex; flex-direction:column; height:100%;' }, topBar, wrapper, footer);
    }

    function toggleTone(name, node) {
        const max = getSettings().maxTones;
        const i = state.chosenTones.indexOf(name);
        if (i >= 0) {
            state.chosenTones.splice(i, 1);
            node.classList.remove('daa-selected');
        } else {
            if (state.chosenTones.length >= max) return;
            state.chosenTones.push(name);
            node.classList.add('daa-selected');
        }
        if (state.updateToneConfirm) state.updateToneConfirm();
    }

    function goReplyPhase() {
        state.phase = 'reply';
        phaseTonesEl.classList.add('daa-hidden');
        phaseReplyEl.classList.remove('daa-hidden');
        executeInitialTask();
    }

    function renderReplyView() {
        const chat = el('div', { className: 'daa-chat', id: 'daa-chat' });
        const followUpInput = el('textarea', { className: 'daa-followup-input', placeholder: 'Type a follow-up...', rows: 2 });
        followUpInput.addEventListener('input', () => { state.followUpText = followUpInput.value; });
        const followUpSend = el('button', { className: 'daa-followup-send' }, 'Send');
        followUpSend.addEventListener('click', sendFollowUp);
        const inputRow = el('div', { className: 'daa-input-row' }, followUpInput, followUpSend);
        return el('div', { className: 'daa-reply-wrap' }, chat, inputRow);
    }

    function renderMessage(msg) {
        const settings = getSettings();
        const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const CHECK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        if (msg.role === 'user' && state.messages.indexOf(msg) === 0) return null;

        const isFirstAssistant = msg.role === 'assistant' && state.messages.indexOf(msg) === 1;
        let cls = 'daa-msg';
        if (msg.role === 'user') cls += ' daa-msg-user';
        else if (msg.role === 'error') cls += ' daa-msg-error';
        else {
            cls += ' daa-msg-assistant';
            if ((state.currentMode === 'summarize' || state.currentMode === 'explain' || state.currentMode === 'grammar') && isFirstAssistant) {
                cls += ' daa-msg-wide';
            }
        }

        const pre = el('pre', { style: 'white-space:pre-wrap; margin:0; font-family: inherit; font-size: inherit;', textContent: msg.content });
        const copyBtn = el('button', { className: 'daa-copy-btn', title: 'Copy response', innerHTML: COPY_ICON_SVG });
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(msg.content).then(() => {
                copyBtn.innerHTML = CHECK_ICON_SVG;
                setTimeout(() => { copyBtn.innerHTML = COPY_ICON_SVG; }, 1500);
            });
        });

        let ttsControls = null;
        if (msg.role === 'assistant') {
            const speakerBtn = el('button', { className: 'daa-tts-btn daa-tts-speaker', title: 'Read aloud', innerHTML: SPEAKER_ICON_SVG });
            const pausePlayBtn = el('button', { className: 'daa-tts-btn daa-tts-pause-play', title: 'Pause/Play', innerHTML: PLAY_ICON_SVG });

            speakerBtn.addEventListener('click', () => {
                stopSpeaking();
                speakText(msg.content, settings.language, pausePlayBtn);
            });
            pausePlayBtn.addEventListener('click', () => togglePausePlay(pausePlayBtn));
            ttsControls = el('div', { className: 'daa-tts-controls' }, speakerBtn, pausePlayBtn);
        }

        return el('div', { className: cls }, pre, msg.role === 'assistant' ? copyBtn : null, ttsControls);
    }

    function scrollChatToEnd() {
        const chat = $('#daa-chat');
        if (chat) chat.scrollTop = chat.scrollHeight;
    }

    /*****************************************************************
     * 🚀 API CALLS
     *****************************************************************/
    function buildPrompt(mode, text, tones) {
        if (!text || text.trim().length === 0) return "Error: No text selected.";
        const isHumanizer = GM_getValue('daa_enableHumanizer', DEFAULTS.enableHumanizer);
        const systemPrompt = isHumanizer ? (SYSTEM_PROMPTS_HUMANIZED[mode] || SYSTEM_PROMPTS_SHARED[mode]) : (SYSTEM_PROMPTS_STANDARD[mode] || SYSTEM_PROMPTS_SHARED[mode]);
        const { language } = getSettings();
        let task;

        const customInst = (state.customInstruction && state.customInstruction.trim().length > 0) ? `\nUSER INSTRUCTIONS: ${state.customInstruction}` : '';
        const lengthInst = state.chosenLength ? `\nLENGTH REQUIREMENT: Make the output ${state.chosenLength.toLowerCase()}.` : '';

        if (mode === 'reply' || mode === 'rephrase') {
            const toneString = tones.length > 0 ? `, using the following tone(s): **${tones.join(', ')}**` : (!customInst ? ', in a neutral tone' : '');
            const action = mode === 'reply' ? 'Generate a reply to' : 'Rephrase';
            task = `TASK: ${action} the following text in natural-sounding ${language}${toneString}.${lengthInst}${customInst}\n\n"""\n${text}\n"""`;
        } else if (mode === 'summarize') {
            task = `INPUT TEXT:\n"""\n${text}\n"""`;
        } else if (mode === 'explain') {
            const context = getSelectionContext(state.selectionRange);
            task = (context && context.length > text.length)
                ? `TASK: Explain the following term: "${text}" in natural-sounding ${language}. Context: "${context}". Keep it direct.`
                : `TASK: Explain the following text in natural-sounding ${language}:\n"""\n${text}\n"""`;
        } else if (mode === 'grammar') {
            task = `TASK: Fix grammar, spelling, and flow in ${language}:\n"""\n${text}\n"""`;
        }
        return `${systemPrompt}\n\n${task}`;
    }

    async function executeInitialTask() {
        const prompt = buildPrompt(state.currentMode, state.selectionText, state.chosenTones);
        if (prompt.startsWith("Error:")) {
            const chat = $('#daa-chat');
            chat.appendChild(renderMessage({ role: 'error', content: prompt }));
            return;
        }
        state.messages.push({ role: 'user', content: prompt });
        await processApiCall();
    }

    async function sendFollowUp() {
        const input = $('.daa-followup-input');
        if (!input || !input.value.trim()) return;
        const userMsg = { role: 'user', content: input.value.trim() };
        state.messages.push(userMsg);
        $('#daa-chat').appendChild(renderMessage(userMsg));
        input.value = '';
        state.followUpText = '';
        scrollChatToEnd();
        await processApiCall();
    }

    async function processApiCall() {
        const chat = $('#daa-chat');
        const input = $('.daa-followup-input');
        const sendBtn = $('.daa-followup-send');
        if (input) input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        stopSpeaking();

        const loading = el('div', { className: 'daa-msg daa-msg-assistant' }, el('div', { className: 'daa-badge' }, el('div', { className: 'daa-spinner' }), 'Thinking…'));
        chat.appendChild(loading);
        scrollChatToEnd();

        try {
            const reply = await callApi(state.messages);
            loading.remove();
            const assistantMsg = { role: 'assistant', content: reply };
            state.messages.push(assistantMsg);
            chat.appendChild(renderMessage(assistantMsg));
        } catch (err) {
            loading.remove();
            chat.appendChild(renderMessage({ role: 'error', content: `API error: ${err?.message || err}` }));
        } finally {
            if (input) {
                input.disabled = false;
                input.focus();
            }
            if (sendBtn) sendBtn.disabled = false;
            scrollChatToEnd();
        }
    }

    function callApi(messages) {
        return new Promise((resolve, reject) => {
            const settings = getSettings();
            let apiKey, requestDetails;
            const activeAPI = GM_getValue('daa_activeApi', DEFAULTS.activeApi);

            if (activeAPI === 'gemini') {
                apiKey = settings.geminiApiKey;
                const model = settings.geminiModel || 'gemini-2.5-flash-lite';
                const historyForGemini = messages.map(msg => ({ role: msg.role === 'assistant' ? 'model' : msg.role, parts: [{ text: msg.content }] }));
                requestDetails = {
                    method: 'POST',
                    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
                    data: JSON.stringify({ contents: historyForGemini })
                };
            } else {
                let url, model, headers = {};
                if (activeAPI === 'openrouter') {
                    apiKey = settings.openrouterApiKey;
                    model = settings.openrouterModel || 'meta-llama/llama-3.3-70b-instruct';
                    url = 'https://openrouter.ai/api/v1/chat/completions';
                    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.origin || 'https://github.com', 'X-Title': 'AI Toolkit' };
                } else if (activeAPI === 'groq') {
                    apiKey = settings.groqApiKey;
                    model = settings.groqModel || 'llama-3.3-70b-versatile';
                    url = 'https://api.groq.com/openai/v1/chat/completions';
                    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
                } else if (activeAPI === 'cerebras') {
                    apiKey = settings.cerebrasApiKey;
                    model = settings.cerebrasModel || 'gpt-oss-120b';
                    url = 'https://api.cerebras.ai/v1/chat/completions';
                    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
                }

                const historyForOpenAI = messages.map(msg => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content }));
                requestDetails = {
                    method: 'POST',
                    url: url,
                    headers: headers,
                    data: JSON.stringify({ model, messages: historyForOpenAI, temperature: 0.7, max_tokens: 4096 })
                };
            }

            if (!apiKey) return reject(new Error(`API Key for ${activeAPI.charAt(0).toUpperCase() + activeAPI.slice(1)} is not set. Please add it in Settings.`));

            GM_xmlhttpRequest({
                ...requestDetails,
                responseType: 'json',
                timeout: 90000,
                onload: function (response) {
                    try {
                        let aiResponse = '';
                        if (response.status >= 200 && response.status < 300) {
                            aiResponse = (activeAPI === 'gemini') ? response.response?.candidates?.[0]?.content?.parts?.[0]?.text : response.response?.choices?.[0]?.message?.content;
                            if (aiResponse) resolve(aiResponse.trim());
                            else reject(new Error('Received an empty or malformed response from the API.'));
                        } else {
                            const errMsg = response.response?.error?.message || response.statusText;
                            reject(new Error(`API request failed (Status: ${response.status}). ${errMsg}`));
                        }
                    } catch (e) {
                        reject(new Error('Failed to process API response. ' + e.message));
                    }
                },
                onerror: () => reject(new Error('Network error. Check console for details.')),
                ontimeout: () => reject(new Error('API request timed out.'))
            });
        });
    }

    /*****************************************************************
     * ⚙️ SETTINGS PANEL
     *****************************************************************/
    function createModelField(providerLabel, currentVal, options) {
        const isCustom = !options.includes(currentVal);
        const select = el('select', { className: 'daa-select' });
        options.forEach(m => select.appendChild(el('option', { value: m, selected: currentVal === m }, m)));
        select.appendChild(el('option', { value: 'custom', selected: isCustom }, 'Custom...'));

        const input = el('input', { className: 'daa-input', type: 'text', value: currentVal, placeholder: 'Enter model name', style: 'margin-top: 4px;' });
        select.addEventListener('change', () => {
            if (select.value !== 'custom') input.value = select.value;
            else input.focus();
        });

        const container = el('div', { className: 'daa-field' }, el('span', { style: 'font-weight:600;' }, `${providerLabel} Model`), select, input);
        return { container, input };
    }

    function showSettingsPanel() {
        if ($('#daa-settings')) return;
        const s = getSettings();
        const panel = el('div', { className: 'daa-settings', id: 'daa-settings' });
        const titleRow = el('div', { style: 'display:flex; align-items:center; gap:8px; margin-bottom:6px;' },
            el('h2', {}, 'AI Toolkit — Settings'),
            el('span', { className: 'daa-spacer' }),
            el('button', { className: 'daa-btn' }, 'Close')
        );
        titleRow.lastChild.addEventListener('click', () => panel.remove());

        const field = (label, input) => el('label', { className: 'daa-field' }, el('span', { style: 'font-weight:600;' }, label), input);
        const fieldRow = (label, input) => el('label', { className: 'daa-field-row' }, input, el('span', {}, label));

        const enableReply = el('input', { type: 'checkbox', checked: s.enableReply });
        const enableRephrase = el('input', { type: 'checkbox', checked: s.enableRephrase });
        const enableSummarize = el('input', { type: 'checkbox', checked: s.enableSummarize });
        const enableExplain = el('input', { type: 'checkbox', checked: s.enableExplain });
        const enableGrammar = el('input', { type: 'checkbox', checked: s.enableGrammar });
        const enableHumanizer = el('input', { type: 'checkbox', checked: s.enableHumanizer });

        const modulesSection = el('div', {},
            el('h3', {}, 'Modules & Prompts'),
            el('div', { className: 'daa-grid-3' },
                fieldRow('Enable Reply', enableReply),
                fieldRow('Enable Rephrase', enableRephrase),
                fieldRow('Enable Summarize', enableSummarize),
                fieldRow('Enable Explain', enableExplain),
                fieldRow('Enable Grammar', enableGrammar),
                fieldRow('Enable Humanizer Prompt', enableHumanizer)
            )
        );

        const activeApi = el('select', { className: 'daa-select' }, ...['gemini', 'openrouter', 'groq', 'cerebras'].map(v => el('option', { value: v, selected: s.activeApi === v }, v === 'openrouter' ? 'OpenRouter' : v.charAt(0).toUpperCase() + v.slice(1))));

        const geminiKey = el('input', { className: 'daa-input', type: 'password', value: s.geminiApiKey, placeholder: 'Gemini API key' });
        const geminiModelField = createModelField('Gemini', s.geminiModel, MODEL_OPTIONS.gemini);

        const openrouterKey = el('input', { className: 'daa-input', type: 'password', value: s.openrouterApiKey, placeholder: 'OpenRouter API Key' });
        const openrouterModelField = createModelField('OpenRouter', s.openrouterModel, MODEL_OPTIONS.openrouter);

        const groqKey = el('input', { className: 'daa-input', type: 'password', value: s.groqApiKey, placeholder: 'Groq API Key' });
        const groqModelField = createModelField('Groq', s.groqModel, MODEL_OPTIONS.groq);

        const cerebrasKey = el('input', { className: 'daa-input', type: 'password', value: s.cerebrasApiKey, placeholder: 'Cerebras API Key' });
        const cerebrasModelField = createModelField('Cerebras', s.cerebrasModel, MODEL_OPTIONS.cerebras);

        const geminiGroup = el('div', { style: s.activeApi === 'gemini' ? 'display:flex; flex-direction:column; gap:10px;' : 'display:none;' }, field('Gemini API Key', geminiKey), geminiModelField.container);
        const openrouterGroup = el('div', { style: s.activeApi === 'openrouter' ? 'display:flex; flex-direction:column; gap:10px;' : 'display:none;' }, field('OpenRouter API Key', openrouterKey), openrouterModelField.container);
        const groqGroup = el('div', { style: s.activeApi === 'groq' ? 'display:flex; flex-direction:column; gap:10px;' : 'display:none;' }, field('Groq API Key', groqKey), groqModelField.container);
        const cerebrasGroup = el('div', { style: s.activeApi === 'cerebras' ? 'display:flex; flex-direction:column; gap:10px;' : 'display:none;' }, field('Cerebras API Key', cerebrasKey), cerebrasModelField.container);

        activeApi.addEventListener('change', (e) => {
            const val = e.target.value;
            geminiGroup.style.display = val === 'gemini' ? 'flex' : 'none';
            openrouterGroup.style.display = val === 'openrouter' ? 'flex' : 'none';
            groqGroup.style.display = val === 'groq' ? 'flex' : 'none';
            cerebrasGroup.style.display = val === 'cerebras' ? 'flex' : 'none';
        });

        const apiSection = el('div', {},
            el('h3', {}, 'API Configuration'),
            field('Active API Provider', activeApi),
            el('div', { style: 'margin-top:10px; padding-top:10px; border-top: 1px dashed var(--daa-border);' },
                geminiGroup, openrouterGroup, groqGroup, cerebrasGroup
            )
        );

        const maxTones = el('input', { className: 'daa-input', type: 'number', min: 1, max: 6, value: s.maxTones });
        const popupW = el('input', { className: 'daa-input', type: 'number', min: 260, value: s.popupWidth });
        const popupH = el('input', { className: 'daa-input', type: 'number', min: 300, value: s.popupHeight });
        const iconSize = el('input', { className: 'daa-input', type: 'number', min: 18, max: 64, value: s.iconSize });
        const language = el('select', { className: 'daa-select' }, ...LANGS.map(v => el('option', { value: v, selected: s.language === v }, v)));
        const fontFamily = el('select', { className: 'daa-select' }, ...[['Georgia', 'Georgia, serif'], ['Helvetica', 'Helvetica, Arial, sans-serif'], ['Times New Roman', '"Times New Roman", Times, serif'], ['Courier New', '"Courier New", monospace']].map(([label, val]) => el('option', { value: val, selected: s.fontFamily === val }, label)));
        const fontSize = el('select', { className: 'daa-select' }, ...['14px', '15px', '16px', '17px', '18px'].map(v => el('option', { value: v, selected: s.fontSize === v }, v)));
        const toneButtonFontSize = el('select', { className: 'daa-select' }, ...['11px', '12px', '13px', '14px', '15px'].map(v => el('option', { value: v, selected: s.toneButtonFontSize === v }, v)));
        const darkMode = el('input', { type: 'checkbox', checked: s.darkMode });

        const uiSection = el('div', {},
            el('h3', {}, 'User Interface'),
            el('div', { className: 'daa-grid' },
                field('Max Tones (1–6)', maxTones),
                field('Icon Size (px)', iconSize),
                field('Popup Width (px)', popupW),
                field('Popup Height (px)', popupH),
                field('Language', language),
                field('Font Family', fontFamily),
                field('Font Size', fontSize),
                field('Tone Font Size', toneButtonFontSize),
                field('Dark Mode', darkMode)
            )
        );

        const actions = el('div', { className: 'daa-settings-actions' },
            el('button', { className: 'daa-btn daa-btn-danger' }, 'Delete All Keys'),
            el('span', { className: 'daa-spacer' }),
            el('button', { className: 'daa-btn' }, 'Cancel'),
            el('button', { className: 'daa-btn daa-btn-primary' }, 'Save')
        );

        actions.children[0].addEventListener('click', () => {
            if (confirm('Delete ALL saved API keys?')) {
                GM_deleteValue('daa_geminiApiKey');
                GM_deleteValue('daa_openrouterApiKey');
                GM_deleteValue('daa_groqApiKey');
                GM_deleteValue('daa_cerebrasApiKey');
                geminiKey.value = '';
                openrouterKey.value = '';
                groqKey.value = '';
                cerebrasKey.value = '';
                showToast('All API keys deleted.');
            }
        });
        actions.children[2].addEventListener('click', () => panel.remove());
        actions.children[3].addEventListener('click', () => {
            saveSettings({
                enableReply: !!enableReply.checked,
                enableRephrase: !!enableRephrase.checked,
                enableSummarize: !!enableSummarize.checked,
                enableExplain: !!enableExplain.checked,
                enableGrammar: !!enableGrammar.checked,
                enableHumanizer: !!enableHumanizer.checked,
                activeApi: activeApi.value,
                geminiApiKey: geminiKey.value.trim(),
                geminiModel: geminiModelField.input.value.trim(),
                openrouterApiKey: openrouterKey.value.trim(),
                openrouterModel: openrouterModelField.input.value.trim(),
                groqApiKey: groqKey.value.trim(),
                groqModel: groqModelField.input.value.trim(),
                cerebrasApiKey: cerebrasKey.value.trim(),
                cerebrasModel: cerebrasModelField.input.value.trim(),
                maxTones: clamp(parseInt(maxTones.value || '3', 10), 1, 6),
                popupWidth: clamp(parseInt(popupW.value || '560', 10), 260, 2000),
                popupHeight: clamp(parseInt(popupH.value || '520', 10), 300, 2000),
                iconSize: clamp(parseInt(iconSize.value || '34', 10), 18, 80),
                language: language.value,
                fontFamily: fontFamily.value,
                fontSize: fontSize.value,
                toneButtonFontSize: toneButtonFontSize.value,
                darkMode: !!darkMode.checked,
            });
        });

        panel.append(titleRow, modulesSection, apiSection, uiSection, actions);
        document.body.appendChild(panel);
    }

    /*****************************************************************
     * 🚀 INITIALIZATION
     *****************************************************************/
    const menuCommandIds = {};

    function registerToggleCommand(moduleName, settingKey, defaultValue) {
        if (menuCommandIds[settingKey] !== undefined) {
            try {
                if (typeof GM_unregisterMenuCommand === 'function') {
                    GM_unregisterMenuCommand(menuCommandIds[settingKey]);
                }
            } catch (e) { /* ignore */ }
        }
        const currentStatus = GM_getValue(settingKey, defaultValue);
        const id = GM_registerMenuCommand(`${currentStatus ? '✅' : '❌'} Toggle ${moduleName}`, () => {
            const now = GM_getValue(settingKey, defaultValue);
            const next = !now;
            GM_setValue(settingKey, next);
            refreshUI();
            registerToggleCommand(moduleName, settingKey, defaultValue);
            showToast(`${moduleName} is now ${next ? 'ENABLED' : 'DISABLED'}.`);
        });
        menuCommandIds[settingKey] = id;
    }

    function registerToggleCommands() {
        registerToggleCommand('Humanizer Prompt', 'daa_enableHumanizer', DEFAULTS.enableHumanizer);
        registerToggleCommand('Reply Generator', 'daa_enableReply', DEFAULTS.enableReply);
        registerToggleCommand('Rephraser', 'daa_enableRephrase', DEFAULTS.enableRephrase);
        registerToggleCommand('Summarizer', 'daa_enableSummarize', DEFAULTS.enableSummarize);
        registerToggleCommand('Explainer', 'daa_enableExplain', DEFAULTS.enableExplain);
        registerToggleCommand('Grammar Checker', 'daa_enableGrammar', DEFAULTS.enableGrammar);
    }

    GM_registerMenuCommand('AI Toolkit: Settings', showSettingsPanel);
    registerToggleCommands();

    createButtons();

})();