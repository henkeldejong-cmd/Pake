(function() {
    'use strict';

    // -------------------------------------------------------------------
    // [0] SAFETY & STRICT FILE TYPE FILTER FOR file:/// URLs
    // -------------------------------------------------------------------
    try {
        if (window.self !== window.top) {
            try {
                if (window.top.location.hostname.includes('fmovies-tv.tv')) return;
            } catch (e) {}
        }
    } catch (e) {}

    // Only allow Olympus TTS on local files if they are TEXT or HTML documents
    if (window.location.protocol === 'file:') {
        const path = window.location.pathname.toLowerCase();
        const validTextExtensions = ['.txt', '.text', '.md', '.markdown', '.log', '.html', '.htm', '.xhtml'];
        const isTextFile = validTextExtensions.some(ext => path.endsWith(ext));

        // Detect if browser opened a standalone video/audio/image viewer
        const isMediaDocument = document.querySelector('video, audio, img') &&
                                document.body &&
                                document.body.children.length <= 3 &&
                                !document.getElementById('gm-editor-container');

        if (!isTextFile || isMediaDocument) {
            // Exit immediately on video files (e.g. .mkv, .mp4), audio, or image files
            return;
        }
    }

    // -------------------------------------------------------------------
    // [1] STATE, CACHES & MUTEX
    // -------------------------------------------------------------------
    const audioMemoryCache = new Map();
    const prefetchPromises = new Map();

    let globalSessionId = 0;
    let lastToggleTimestamp = 0;

    const state = {
        activeSessionId: 0,
        activeNetworkRequest: null,
        lastActiveBlob: null,
        activeEditorContainer: null,
        isReading: false,
        isPaused: false,
        currentAudio: null,
        audioUrlObject: null,
        settings: {},
        drag: { active: false, currentX: 0, currentY: 0, initialX: 0, initialY: 0, xOffset: 0, yOffset: 0, isDragging: false },
        selectionCheckTimeout: null,
        // Scan & Flow Mode
        scanModeActive: false,
        scannedBlocks: [],
        currentBlockIndex: 0,
        currentActiveWordIdx: -1,
        // Gestures
        longPressTimer: null,
        isLongPressTriggered: false,
        hasMoved: false
    };

    const GEMINI_VOICES = [
        { id: 'Puck', name: 'Puck (Engaging, Clear)' },
        { id: 'Charon', name: 'Charon (Deep, Authoritative)' },
        { id: 'Kore', name: 'Kore (Warm, Melodic)' },
        { id: 'Fenrir', name: 'Fenrir (Dynamic, Strong)' },
        { id: 'Aoede', name: 'Aoede (Expressive, Elegant)' }
    ];

    const DEFAULTS = {
        ttsMode: 'gemini',
        geminiApiKey: '',
        geminiModel: 'gemini-3.8-flash-tts',
        geminiVoiceId: 'Puck',
        elevenApiKey: '',
        elevenVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
        googleApiKey: '',
        googleVoiceId: 'en-US-Neural2-F',
        voiceRssApiKey: '',
        systemVoiceName: '',
        edgeVoiceId: 'en-US-AriaNeural',
        rate: 1.0,
        highlightColor: '#ffe0b2',
        wordHighlightColor: '#2563eb', // Default Blue Cursor
        enableWordHighlight: true,
        buttonSizePx: 30,              // Changed from 46 to 30
        popupWidth: 360,
        popupHeight: 540,
        autoScroll: true,
        posX: 0,                       // Changed from 16 to 0 (No gap on edge)
        posY: 140,
        hideButton: false,
        enableDoubleClick: true,
        highlightInsidePanel: true
    };

    // -------------------------------------------------------------------
    // [2] INITIALIZATION
    // -------------------------------------------------------------------
    async function init() {
        await loadSettings();
        injectStyles();
        createFloatingButton();
        createSidebarPanel();
        createBottomPillBar();
        createToastContainer();
        initEventListeners();
        initUnifiedPointerGestures();
        applyButtonSizing();
        updateButtonVisibility();

        if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => {
                if (state.settings.ttsMode === 'system') updateVoiceOptions('system');
            };
        }
        await updateVoiceOptions(state.settings.ttsMode);

        window.addEventListener('resize', () => {
            const maxY = Math.max(10, window.innerHeight - 80);
            if (state.drag.yOffset > maxY) {
                state.drag.yOffset = maxY;
                state.settings.posY = maxY;
                const c = document.getElementById('olympus-button-container');
                if (c) c.style.transform = `translate3d(0px, ${maxY}px, 0)`;
            }
        });

        GM_registerMenuCommand('⚙️ Olympus TTS Settings', () => {
            const panel = document.getElementById('olympus-panel');
            if (panel) {
                panel.classList.add('visible');
                showSettingsView();
            }
        });

        document.addEventListener('selectionchange', handleSelectionChange);
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    function toBool(val, fallback) {
        if (typeof val === 'boolean') return val;
        if (val === 'true') return true;
        if (val === 'false') return false;
        return fallback;
    }

    async function loadSettings() {
        for (const k in DEFAULTS) {
            state.settings[k] = await GM_getValue(k, DEFAULTS[k]);
        }

        // Normalize booleans & numbers in case AndroidBridge/shim returns Strings
        state.settings.hideButton = toBool(state.settings.hideButton, DEFAULTS.hideButton);
        state.settings.autoScroll = toBool(state.settings.autoScroll, DEFAULTS.autoScroll);
        state.settings.enableDoubleClick = toBool(state.settings.enableDoubleClick, DEFAULTS.enableDoubleClick);
        state.settings.enableWordHighlight = toBool(state.settings.enableWordHighlight, DEFAULTS.enableWordHighlight);
        state.settings.highlightInsidePanel = toBool(state.settings.highlightInsidePanel, DEFAULTS.highlightInsidePanel);

        state.settings.rate = parseFloat(state.settings.rate) || DEFAULTS.rate;
        state.settings.buttonSizePx = Math.max(30, Math.min(80, parseInt(state.settings.buttonSizePx, 10) || DEFAULTS.buttonSizePx));

        // Force flush to right edge and clamp posY inside the current viewport
        const rawY = parseFloat(state.settings.posY);
        const maxY = Math.max(10, (window.innerHeight || 600) - 80);
        state.settings.posX = 0;
        state.settings.posY = Number.isFinite(rawY) ? Math.max(10, Math.min(maxY, rawY)) : DEFAULTS.posY;

        state.drag.yOffset = state.settings.posY;
        state.drag.xOffset = 0;
    }

    async function saveSetting(k, v) {
        state.settings[k] = v;
        await GM_setValue(k, v);
    }

    // -------------------------------------------------------------------
    // [3] STYLES
    // -------------------------------------------------------------------
    function injectStyles() {
        GM_addStyle(`
            :root {
                --ol-orange: #f97316;
                --ol-orange-dark: #ea580c;
                --ol-orange-hover: #fb923c;
                --ol-bg-dark: #121316;
                --ol-card-dark: #1e2025;
                --ol-border-dark: rgba(255, 255, 255, 0.12);
                --ol-text-main: #f3f4f6;
                --ol-text-muted: #9ca3af;
                --ol-word-color: ${state.settings.wordHighlightColor || '#2563eb'};
            }

            #olympus-button-container {
                position: fixed;
                right: 0;
                top: 0;
                z-index: 2147483647;
                user-select: none;
                touch-action: none;
                will-change: transform;
                display: flex;
            }

            #olympus-mini-controls {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 1px;
                filter: drop-shadow(0 4px 14px rgba(0,0,0,0.55));
            }

            #olympus-o-button {
                background: #181a20;
                border: 1px solid var(--ol-border-dark);
                cursor: pointer;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box;
                position: relative;
                touch-action: none;
                transition: background 0.2s ease;
            }
            #olympus-o-button:hover { background: #222630; }
            #olympus-o-button.loading { animation: olympus-pulse 1.4s infinite ease-in-out; }

            .olympus-solid-dot {
                width: 14px;
                height: 14px;
                background-color: var(--ol-orange);
                border-radius: 50%;
                box-shadow: 0 0 8px rgba(249, 115, 22, 0.7);
                pointer-events: none;
                flex-shrink: 0;
            }

            #olympus-mini-play-pause, #olympus-mini-stop, #olympus-mini-s {
                border: 1px solid rgba(255,255,255,0.15);
                background: var(--ol-orange);
                color: #fff;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease;
                box-sizing: border-box;
                font-weight: bold;
                padding: 0;
                margin: 0;
            }
            #olympus-mini-play-pause:hover, #olympus-mini-stop:hover, #olympus-mini-s:hover {
                background: var(--ol-orange-hover);
            }
            #olympus-mini-play-pause { border-radius: 4px 0 0 0; font-size: 10px; }
            #olympus-mini-s { background: var(--ol-orange-dark); font-size: 11px; }
            #olympus-mini-stop { border-radius: 0 0 0 4px; font-size: 10px; background: #c2410c; }

            #olympus-button-container.pill-active #olympus-mini-play-pause,
            #olympus-button-container.pill-active #olympus-mini-s,
            #olympus-button-container.pill-active #olympus-mini-stop {
                display: none !important;
            }

            /* Bottom Pill */
            #olympus-pill-wrapper {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(140px);
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
                opacity: 0;
                pointer-events: none;
                transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            #olympus-pill-wrapper.visible {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
                pointer-events: auto;
            }

            .olympus-pill-tooltip {
                background: rgba(18, 19, 22, 0.94);
                color: var(--ol-text-muted);
                backdrop-filter: blur(8px);
                border: 1px solid var(--ol-border-dark);
                font-size: 11px;
                padding: 3px 10px;
                border-radius: 16px;
                display: flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                white-space: nowrap;
            }
            .olympus-pill-tooltip span { color: var(--ol-orange); font-weight: 600; }
            .olympus-pill-tooltip .close-tip { cursor: pointer; color: #888; margin-left: 4px; }
            .olympus-pill-tooltip .close-tip:hover { color: #fff; }

            /* Hide Desktop Tooltip on Mobile Devices & Touchscreens */
            @media (max-width: 768px), (pointer: coarse) {
                .olympus-pill-tooltip {
                    display: none !important;
                }
            }

            .olympus-pill-bar {
                background: rgba(22, 24, 29, 0.96);
                backdrop-filter: blur(16px);
                border: 1px solid var(--ol-border-dark);
                border-radius: 28px;
                height: 38px;
                padding: 0 10px;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 8px 26px rgba(0,0,0,0.5);
                color: var(--ol-text-main);
                box-sizing: border-box;
                position: relative;
                overflow: hidden;
            }

            #olympus-pill-progress-track {
                position: absolute;
                bottom: 0;
                left: 12px;
                right: 12px;
                height: 2.5px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                overflow: hidden;
            }
            #olympus-pill-progress-bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, var(--ol-orange), var(--ol-orange-hover));
                border-radius: 2px;
                transition: width 0.25s linear;
            }

            .olympus-pill-btn-play {
                width: 28px !important;
                height: 28px !important;
                min-width: 28px !important;
                min-height: 28px !important;
                max-width: 28px !important;
                max-height: 28px !important;
                border-radius: 50% !important;
                aspect-ratio: 1 / 1 !important;
                background: linear-gradient(135deg, var(--ol-orange), var(--ol-orange-dark)) !important;
                border: none !important;
                color: white !important;
                font-size: 12px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer;
                transition: transform 0.15s;
                flex-shrink: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box !important;
            }
            .olympus-pill-btn-play:hover { transform: scale(1.08); }
            .olympus-pill-btn-play:active { transform: scale(0.95); }

            .olympus-pill-item {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                padding: 3px 6px;
                border-radius: 6px;
                transition: background 0.15s;
                user-select: none;
            }
            .olympus-pill-item:hover { background: rgba(255,255,255,0.08); }

            .olympus-pill-icon-btn {
                background: none;
                border: none;
                color: var(--ol-text-muted);
                cursor: pointer;
                font-size: 13.5px;
                padding: 5px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.15s, background 0.15s;
            }
            .olympus-pill-icon-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }

            /* Sidebar */
            #olympus-panel {
                position: fixed;
                right: 0;
                top: 50%;
                transform: translateY(-50%) translateX(105%);
                background: rgba(18, 19, 22, 0.96);
                backdrop-filter: blur(20px);
                color: var(--ol-text-main);
                z-index: 2147483646;
                border-radius: 16px 0 0 16px;
                border: 1px solid var(--ol-border-dark);
                border-right: none;
                box-shadow: -10px 0 35px rgba(0, 0, 0, 0.6);
                display: flex;
                flex-direction: column;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                overflow: hidden;
                width: 360px;
                box-sizing: border-box;
                font-size: 13.5px;
                transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #olympus-panel.visible { transform: translateY(-50%) translateX(0); }

            #olympus-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid var(--ol-border-dark);
                background: rgba(255, 255, 255, 0.02);
            }
            #olympus-header h3 { margin: 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
            #olympus-badge { font-size: 10px; padding: 2px 7px; background: rgba(249, 115, 22, 0.2); color: var(--ol-orange); border-radius: 12px; font-weight: 600; }

            #olympus-panel-progress-track {
                width: 100%;
                height: 2.5px;
                background: rgba(255, 255, 255, 0.08);
                overflow: hidden;
                flex-shrink: 0;
            }
            #olympus-panel-progress-bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, var(--ol-orange), var(--ol-orange-hover));
                transition: width 0.25s linear;
            }

            .header-buttons button {
                background: none;
                border: none;
                color: var(--ol-text-muted);
                cursor: pointer;
                font-size: 16px;
                padding: 6px;
                border-radius: 6px;
            }
            .header-buttons button:hover { background: rgba(255,255,255,0.08); color: #fff; }

            #olympus-main-view, #olympus-settings-view {
                padding: 16px;
                overflow-y: auto;
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            #olympus-textbox {
                flex-grow: 1;
                min-height: 120px;
                max-height: 220px;
                width: 100%;
                border: 1px solid var(--ol-border-dark);
                padding: 10px;
                border-radius: 8px;
                overflow-y: auto;
                background: var(--ol-card-dark);
                color: #fff;
                line-height: 1.5;
                outline: none;
            }
            #olympus-textbox:focus { border-color: var(--ol-orange); }
            #olympus-textbox:empty:before { content: attr(data-placeholder); color: var(--ol-text-muted); font-style: italic; }

            .control-group { display: flex; flex-direction: column; gap: 6px; }
            .control-group label { font-size: 12px; font-weight: 500; color: var(--ol-text-muted); }

            #olympus-panel input[type="text"],
            #olympus-panel input[type="password"],
            #olympus-panel input[type="number"],
            #olympus-panel select {
                width: 100%;
                padding: 9px 12px;
                border-radius: 8px;
                border: 1px solid var(--ol-border-dark);
                background-color: var(--ol-card-dark);
                color: #fff;
                font-size: 13.5px;
                outline: none;
                box-sizing: border-box;
            }
            #olympus-panel input:focus, #olympus-panel select:focus { border-color: var(--ol-orange); }

            .btn-action {
                width: 100%;
                padding: 11px;
                border: none;
                border-radius: 8px;
                background-color: var(--ol-orange);
                color: white;
                cursor: pointer;
                font-weight: 600;
                font-size: 13.5px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: background-color 0.2s, transform 0.1s;
            }
            .btn-action:hover { background-color: var(--ol-orange-dark); }
            .btn-action:active { transform: scale(0.98); }

            .btn-secondary { background-color: rgba(255, 255, 255, 0.08); color: var(--ol-text-main); }
            .btn-secondary:hover { background-color: rgba(255, 255, 255, 0.14); }

            .info-banner {
                padding: 9px 12px;
                border-radius: 8px;
                font-size: 12px;
                line-height: 1.4;
                margin-bottom: 4px;
            }
            .info-banner.gemini { background: rgba(249, 115, 22, 0.12); border-left: 3px solid var(--ol-orange); }

            /* Dual Highlights */
            .olympus-hover-block {
                background-color: rgba(249, 115, 22, 0.12) !important;
                outline: 1.5px dashed var(--ol-orange) !important;
                border-radius: 4px;
                cursor: pointer !important;
            }
            .olympus-active-reading {
                background-color: ${state.settings.highlightColor || '#ffe0b2'} !important;
                color: #111 !important;
                border-radius: 4px;
                padding: 2px 4px;
                box-shadow: 0 1px 6px rgba(0,0,0,0.15);
                transition: background-color 0.2s ease;
            }

            .ol-word-active {
                background-color: var(--ol-word-color) !important;
                color: #ffffff !important;
                border-radius: 3px;
                padding: 1px 3px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.35);
                transition: background-color 0.08s ease;
            }

            .olympus-tb-segment { transition: background-color 0.2s ease; }
            .olympus-tb-active {
                background-color: rgba(249, 115, 22, 0.35) !important;
                border-radius: 3px;
                padding: 1px 2px;
            }

            /* Toast */
            #olympus-toast {
                position: fixed;
                top: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(-100px);
                background: rgba(24, 26, 32, 0.96);
                border: 1px solid var(--ol-orange);
                color: #fff;
                padding: 9px 16px;
                border-radius: 20px;
                font-size: 12.5px;
                font-family: system-ui, sans-serif;
                z-index: 2147483647;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                opacity: 0;
                pointer-events: none;
                transition: transform 0.25s ease, opacity 0.25s ease;
            }
            #olympus-toast.visible {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }

            @media (max-width: 600px) {
                #olympus-panel {
                    top: auto !important;
                    bottom: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    width: 100% !important;
                    height: 80vh !important;
                    border-radius: 18px 18px 0 0 !important;
                    transform: translateY(105%) !important;
                }
                #olympus-panel.visible { transform: translateY(0) !important; }
            }

            @keyframes olympus-pulse {
                0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
                100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
            }
        `);
    }

    // -------------------------------------------------------------------
    // [4] DOM CREATION
    // -------------------------------------------------------------------
    function createFloatingButton() {
        const oButtonContainer = document.createElement('div');
        oButtonContainer.id = 'olympus-button-container';
        oButtonContainer.style.transform = `translate3d(-${state.settings.posX}px, ${state.settings.posY}px, 0)`;

        oButtonContainer.innerHTML = `
            <div id="olympus-mini-controls">
                <button id="olympus-mini-play-pause" title="Play/Pause" style="display:none;">▶</button>
                <div id="olympus-o-button" role="button" title="Tap: Drawer | Long-press / Ctrl+Click: Scan Page">
                    <div class="olympus-solid-dot"></div>
                </div>
                <button id="olympus-mini-s" title="Read Selection" style="display:none;">▶</button>
                <button id="olympus-mini-stop" title="Stop" style="display:none;">■</button>
            </div>
        `;
        document.body.appendChild(oButtonContainer);
    }

    function createBottomPillBar() {
        const wrapper = document.createElement('div');
        wrapper.id = 'olympus-pill-wrapper';
        wrapper.innerHTML = `
            <div class="olympus-pill-tooltip">
                <span>Space</span> pause • <span>→ / ←</span> next/prev • <span>Esc</span> close
                <span class="close-tip" id="olympus-tip-close">✕</span>
            </div>
            <div class="olympus-pill-bar">
                <button class="olympus-pill-btn-play" id="olympus-pill-play-btn" title="Play/Pause">▶</button>
                <div class="olympus-pill-item" id="olympus-pill-speed-btn" title="Cycle Speed">
                    <span id="olympus-pill-speed-val">${parseFloat(state.settings.rate).toFixed(1)}x</span>
                </div>
                <div class="olympus-pill-item" title="Estimated Reading Time">
                    <span id="olympus-pill-est-time">--m</span>
                </div>
                <button class="olympus-pill-icon-btn" id="olympus-pill-download-btn" title="Download Current Audio">⬇️</button>
                <button class="olympus-pill-icon-btn" id="olympus-pill-doc-btn" title="Open Text Box">📄</button>
                <button class="olympus-pill-icon-btn" id="olympus-pill-settings-btn" title="Settings">⚙️</button>
                <button class="olympus-pill-icon-btn" id="olympus-pill-close-btn" title="Exit Reader">✕</button>
                <div id="olympus-pill-progress-track">
                    <div id="olympus-pill-progress-bar"></div>
                </div>
            </div>
        `;
        document.body.appendChild(wrapper);
    }

    function createSidebarPanel() {
        const panel = document.createElement('div');
        panel.id = 'olympus-panel';
        panel.style.width = `${state.settings.popupWidth}px`;
        panel.style.height = `${state.settings.popupHeight}px`;

        panel.innerHTML = `
            <div id="olympus-header">
                <h3>Olympus TTS <span id="olympus-badge">v5.6</span></h3>
                <div class="header-buttons">
                    <button id="olympus-settings-btn" title="Settings">⚙️</button>
                    <button id="olympus-close-btn" title="Close Panel">✕</button>
                </div>
            </div>
            <div id="olympus-panel-progress-track">
                <div id="olympus-panel-progress-bar"></div>
            </div>

            <!-- Main Text View -->
            <div id="olympus-main-view">
                <div id="olympus-textbox" contenteditable="true" spellcheck="false" data-placeholder="Paste text or highlight words on page..."></div>
                <button id="olympus-paste-selection-btn" class="btn-action btn-secondary">📋 Grab Selected Text</button>

                <div class="control-group">
                    <label for="olympus-voice-select">Voice Preset:</label>
                    <select id="olympus-voice-select"></select>
                </div>

                <div class="control-group">
                    <div style="display:flex; justify-content:space-between;">
                        <label for="olympus-speed-slider">Speed</label>
                        <span id="olympus-speed-value" style="font-size:12px; color:var(--ol-orange);">${parseFloat(state.settings.rate).toFixed(1)}x</span>
                    </div>
                    <input type="range" id="olympus-speed-slider" min="0.5" max="2.5" step="0.1" value="${state.settings.rate}">
                </div>

                <div id="olympus-playback-controls" style="margin-top:auto;">
                    <button id="olympus-play-btn" class="btn-action">▶ Read Content</button>
                    <button id="olympus-panel-download-btn" class="btn-action btn-secondary" style="margin-top:4px;">⬇ Save as Audio File</button>
                </div>
            </div>

            <!-- Settings View -->
            <div id="olympus-settings-view" style="display:none;">
                <div class="control-group">
                    <label>Active Speech Engine:</label>
                    <select id="olympus-tts-mode-select">
                        <option value="gemini">Google Gemini Flash TTS (Default & Free)</option>
                        <option value="edge">Microsoft Edge (Free Neural - Unlimited)</option>
                        <option value="google_free">Google Translate (Simple HTTP)</option>
                        <option value="system">System (Browser Built-in)</option>
                        <option value="google">Google Cloud (Paid API)</option>
                        <option value="eleven">ElevenLabs (High Quality API)</option>
                        <option value="voicerss">VoiceRSS (Legacy Free API)</option>
                    </select>
                </div>

                <!-- Gemini Config -->
                <div id="olympus-gemini-settings" class="control-group">
                    <div class="info-banner gemini">
                        ⚡ <strong>Gemini Flash TTS:</strong> Automatically batches paragraphs to preserve your daily quota.
                    </div>
                    <label for="olympus-gemini-api-key">Gemini API Key:</label>
                    <input type="password" id="olympus-gemini-api-key" placeholder="AIzaSy...">
                    <label for="olympus-gemini-model" style="margin-top:6px;">Model Variant:</label>
                    <select id="olympus-gemini-model">
                        <option value="gemini-3.8-flash-tts">Gemini 3.8 Flash TTS (Highest Quality)</option>
                        <option value="gemini-3.8-flash-lite-tts">Gemini 3.8 Flash Lite TTS (Fastest)</option>
                        <option value="gemini-2.5-flash-preview-tts">Gemini 2.5 Flash Preview TTS</option>
                    </select>
                </div>

                <div id="olympus-edge-settings" style="display:none;" class="control-group">
                    <div class="info-banner" style="background:rgba(255,255,255,0.05);">Edge TTS provides high-speed neural speech with no daily quota limits.</div>
                </div>

                <div id="olympus-google-free-settings" style="display:none;" class="control-group">
                    <div class="info-banner" style="background:rgba(255,255,255,0.05);">100% free HTTP endpoint fallback.</div>
                </div>

                <div id="olympus-google-settings" style="display:none;" class="control-group">
                    <label for="olympus-google-api-key">Google Cloud Platform Key:</label>
                    <input type="password" id="olympus-google-api-key">
                </div>

                <div id="olympus-eleven-settings" style="display:none;" class="control-group">
                    <label for="olympus-eleven-api-key">ElevenLabs API Key:</label>
                    <input type="password" id="olympus-eleven-api-key">
                    <button id="olympus-refresh-eleven-voices" class="btn-action btn-secondary" style="margin-top:6px;">Fetch My Voices</button>
                </div>

                <div id="olympus-voicerss-settings" style="display:none;" class="control-group">
                    <label for="olympus-voicerss-api-key">VoiceRSS Key:</label>
                    <input type="password" id="olympus-voicerss-api-key">
                </div>

                <hr style="border:none; border-top:1px solid var(--ol-border-dark); margin:6px 0;">

                <div class="control-group">
                    <label for="olympus-button-size-input">Button Size (px):</label>
                    <input type="number" id="olympus-button-size-input" min="30" max="80" value="${state.settings.buttonSizePx}">
                </div>
                <div class="control-group">
                    <label for="olympus-highlight-color-input">Paragraph Highlight Color (Context):</label>
                    <input type="color" id="olympus-highlight-color-input" value="${state.settings.highlightColor}">
                </div>
                <div class="control-group">
                    <label for="olympus-word-highlight-color-input">Live Word Highlight Color (Real-Time):</label>
                    <input type="color" id="olympus-word-highlight-color-input" value="${state.settings.wordHighlightColor}">
                </div>
                <div class="control-group">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="olympus-word-highlight-toggle"> Enable synchronized word tracking
                    </label>
                </div>
                <div class="control-group">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="olympus-autoscroll-toggle"> Auto-scroll page during reading
                    </label>
                </div>
                <div class="control-group">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="olympus-double-click-toggle"> Double-click word to read to end of page
                    </label>
                </div>
                <div class="control-group">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="olympus-highlight-panel-toggle"> Highlight words inside textbox while reading
                    </label>
                </div>
                <div class="control-group">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="olympus-hide-button-toggle"> Hide Floating Action Button
                    </label>
                </div>

                <button id="olympus-save-settings-btn" class="btn-action" style="margin-top:10px;">💾 Save Settings</button>
                <button id="olympus-back-to-main-btn" class="btn-action btn-secondary" style="margin-top:6px;">← Back to Reader</button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('olympus-tts-mode-select').value = state.settings.ttsMode;
        document.getElementById('olympus-gemini-api-key').value = state.settings.geminiApiKey;
        document.getElementById('olympus-gemini-model').value = state.settings.geminiModel;
        document.getElementById('olympus-eleven-api-key').value = state.settings.elevenApiKey;
        document.getElementById('olympus-google-api-key').value = state.settings.googleApiKey;
        document.getElementById('olympus-voicerss-api-key').value = state.settings.voiceRssApiKey;
        document.getElementById('olympus-autoscroll-toggle').checked = !!state.settings.autoScroll;
        document.getElementById('olympus-double-click-toggle').checked = !!state.settings.enableDoubleClick;
        document.getElementById('olympus-word-highlight-toggle').checked = !!state.settings.enableWordHighlight;
        document.getElementById('olympus-highlight-panel-toggle').checked = !!state.settings.highlightInsidePanel;
        document.getElementById('olympus-hide-button-toggle').checked = !!state.settings.hideButton;

        updateSettingsVisibility(state.settings.ttsMode);
    }

    function createToastContainer() {
        const toast = document.createElement('div');
        toast.id = 'olympus-toast';
        document.body.appendChild(toast);
    }

    function showToast(text, duration = 3000) {
        const toast = document.getElementById('olympus-toast');
        if (!toast) return;
        toast.textContent = text;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), duration);
    }

    // -------------------------------------------------------------------
    // [5] EVENT LISTENERS
    // -------------------------------------------------------------------
    function initEventListeners() {
        document.addEventListener('dblclick', handleDoubleClick);

        document.getElementById('olympus-close-btn').addEventListener('click', () => {
            document.getElementById('olympus-panel').classList.remove('visible');
        });
        document.getElementById('olympus-settings-btn').addEventListener('click', showSettingsView);
        document.getElementById('olympus-back-to-main-btn').addEventListener('click', showMainView);
        document.getElementById('olympus-save-settings-btn').addEventListener('click', saveAllSettings);
        document.getElementById('olympus-paste-selection-btn').addEventListener('click', pasteSelection);
        document.getElementById('olympus-play-btn').addEventListener('click', handlePlayFromTextbox);
        document.getElementById('olympus-panel-download-btn').addEventListener('click', handleDownloadFromTextbox);

        document.getElementById('olympus-mini-play-pause').addEventListener('click', handlePauseToggle);
        document.getElementById('olympus-mini-stop').addEventListener('click', handleStop);
        document.getElementById('olympus-mini-s').addEventListener('click', handleSelectionWingPlay);

        document.getElementById('olympus-pill-play-btn').addEventListener('click', handlePauseToggle);
        document.getElementById('olympus-pill-close-btn').addEventListener('click', closeScanMode);
        document.getElementById('olympus-pill-download-btn').addEventListener('click', handleDownloadActiveChunk);
        document.getElementById('olympus-tip-close').addEventListener('click', () => {
            document.querySelector('.olympus-pill-tooltip').style.display = 'none';
        });
        document.getElementById('olympus-pill-settings-btn').addEventListener('click', () => {
            document.getElementById('olympus-panel').classList.add('visible');
            showSettingsView();
        });
        document.getElementById('olympus-pill-doc-btn').addEventListener('click', () => {
            document.getElementById('olympus-panel').classList.add('visible');
            showMainView();
        });
        document.getElementById('olympus-pill-speed-btn').addEventListener('click', cycleSpeedRate);

        document.getElementById('olympus-tts-mode-select').addEventListener('change', handleTtsModeChange);
        document.getElementById('olympus-gemini-api-key').addEventListener('change', e => saveSetting('geminiApiKey', e.target.value.trim()));
        document.getElementById('olympus-gemini-model').addEventListener('change', e => saveSetting('geminiModel', e.target.value));
        document.getElementById('olympus-eleven-api-key').addEventListener('change', e => saveSetting('elevenApiKey', e.target.value.trim()));
        document.getElementById('olympus-google-api-key').addEventListener('change', e => saveSetting('googleApiKey', e.target.value.trim()));
        document.getElementById('olympus-voicerss-api-key').addEventListener('change', e => saveSetting('voiceRssApiKey', e.target.value.trim()));
        document.getElementById('olympus-refresh-eleven-voices').addEventListener('click', () => updateVoiceOptions('eleven'));

        document.getElementById('olympus-button-size-input').addEventListener('change', e => {
            const sz = Math.max(30, Math.min(80, parseInt(e.target.value, 10) || 30));
            saveSetting('buttonSizePx', sz);
            applyButtonSizing();
        });
        document.getElementById('olympus-highlight-color-input').addEventListener('change', e => {
            saveSetting('highlightColor', e.target.value);
            GM_addStyle(`.olympus-active-reading { background-color: ${e.target.value} !important; }`);
        });
        document.getElementById('olympus-word-highlight-color-input').addEventListener('change', e => {
            saveSetting('wordHighlightColor', e.target.value);
            document.documentElement.style.setProperty('--ol-word-color', e.target.value);
        });

        document.getElementById('olympus-word-highlight-toggle').addEventListener('change', e => {
            saveSetting('enableWordHighlight', e.target.checked);
        });

        document.getElementById('olympus-voice-select').addEventListener('change', e => {
            const mode = state.settings.ttsMode;
            if (mode === 'gemini') saveSetting('geminiVoiceId', e.target.value);
            else if (mode === 'system') saveSetting('systemVoiceName', e.target.value);
            else if (mode === 'eleven') saveSetting('elevenVoiceId', e.target.value);
            else if (mode === 'google') saveSetting('googleVoiceId', e.target.value);
            else if (mode === 'edge') saveSetting('edgeVoiceId', e.target.value);
        });

        const speedSlider = document.getElementById('olympus-speed-slider');
        speedSlider.addEventListener('input', e => setPlaybackSpeed(parseFloat(e.target.value)));
        speedSlider.addEventListener('change', e => saveSetting('rate', parseFloat(e.target.value)));

        document.getElementById('olympus-autoscroll-toggle').addEventListener('change', e => saveSetting('autoScroll', e.target.checked));
        document.getElementById('olympus-double-click-toggle').addEventListener('change', e => saveSetting('enableDoubleClick', e.target.checked));
        document.getElementById('olympus-highlight-panel-toggle').addEventListener('change', e => saveSetting('highlightInsidePanel', e.target.checked));
        document.getElementById('olympus-hide-button-toggle').addEventListener('change', e => {
            saveSetting('hideButton', e.target.checked);
            updateButtonVisibility();
        });
    }

    // -------------------------------------------------------------------
    // [5b] SAVE ALL SETTINGS
    // -------------------------------------------------------------------
    async function saveAllSettings() {
        try {
            await saveSetting('geminiApiKey',    document.getElementById('olympus-gemini-api-key').value.trim());
            await saveSetting('geminiModel',     document.getElementById('olympus-gemini-model').value);
            await saveSetting('elevenApiKey',    document.getElementById('olympus-eleven-api-key').value.trim());
            await saveSetting('googleApiKey',    document.getElementById('olympus-google-api-key').value.trim());
            await saveSetting('voiceRssApiKey',  document.getElementById('olympus-voicerss-api-key').value.trim());

            const sz = Math.max(30, Math.min(80,
                parseInt(document.getElementById('olympus-button-size-input').value, 10) || 30));
            await saveSetting('buttonSizePx', sz);
            applyButtonSizing();

            await saveSetting('highlightColor',     document.getElementById('olympus-highlight-color-input').value);
            await saveSetting('wordHighlightColor', document.getElementById('olympus-word-highlight-color-input').value);
            document.documentElement.style.setProperty('--ol-word-color', state.settings.wordHighlightColor);

            await saveSetting('enableWordHighlight',   document.getElementById('olympus-word-highlight-toggle').checked);
            await saveSetting('autoScroll',            document.getElementById('olympus-autoscroll-toggle').checked);
            await saveSetting('enableDoubleClick',     document.getElementById('olympus-double-click-toggle').checked);
            await saveSetting('highlightInsidePanel',  document.getElementById('olympus-highlight-panel-toggle').checked);
            await saveSetting('hideButton',            document.getElementById('olympus-hide-button-toggle').checked);
            updateButtonVisibility();

            showToast('✅ Settings saved successfully.');
        } catch (err) {
            showToast('❌ Failed to save settings: ' + err.message);
        }
    }

    function handleKeyboardShortcuts(e) {
        if (e.target.matches('input, textarea, [contenteditable]')) return;

        if (state.scanModeActive) {
            if (e.code === 'Space') {
                e.preventDefault();
                handlePauseToggle();
                return;
            }
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                jumpToBlockIndex(state.currentBlockIndex + 1);
                return;
            }
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                jumpToBlockIndex(Math.max(0, state.currentBlockIndex - 1));
                return;
            }
            if (e.code === 'Escape') {
                e.preventDefault();
                closeScanMode();
                return;
            }
        }

        const isClean = !e.ctrlKey && !e.altKey && !e.metaKey;
        if (e.shiftKey && e.code === 'KeyR' && isClean) {
            e.preventDefault();
            triggerScanMode();
            return;
        }
        if (e.shiftKey && e.code === 'KeyT' && isClean) {
            e.preventDefault();
            document.getElementById('olympus-panel').classList.toggle('visible');
            return;
        }
    }

    // -------------------------------------------------------------------
    // [6] GESTURES & DRAGGABLE
    // -------------------------------------------------------------------
    function initUnifiedPointerGestures() {
        const container = document.getElementById('olympus-button-container');
        const dragItem = document.getElementById('olympus-o-button');

        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            state.drag.active = true;
            state.drag.isDragging = false;
            state.hasMoved = false;
            state.isLongPressTriggered = false;

            const clientX = e.clientX;
            const clientY = e.clientY;
            state.drag.initialX = clientX;
            state.drag.initialY = clientY;

            if (state.longPressTimer) clearTimeout(state.longPressTimer);
            state.longPressTimer = setTimeout(() => {
                if (!state.hasMoved) {
                    state.isLongPressTriggered = true;
                    if (navigator.vibrate) navigator.vibrate(50);
                    showToast("Full Page Scan (Long-Press)");
                    triggerScanMode();
                }
            }, 500);
        };

        const onPointerMove = (e) => {
            if (!state.drag.active) return;
            const clientX = e.clientX;
            const clientY = e.clientY;
            const dx = clientX - state.drag.initialX;
            const dy = clientY - state.drag.initialY;

            if (Math.hypot(dx, dy) > 8) {
                state.hasMoved = true;
                state.drag.isDragging = true;
                if (state.longPressTimer) {
                    clearTimeout(state.longPressTimer);
                    state.longPressTimer = null;
                }
                state.drag.xOffset = Math.max(0, Math.min(window.innerWidth - 55, state.drag.xOffset - dx));
                state.drag.yOffset = Math.max(10, Math.min(window.innerHeight - 80, state.drag.yOffset + dy));
                container.style.transform = `translate3d(-${state.drag.xOffset}px, ${state.drag.yOffset}px, 0)`;
                state.drag.initialX = clientX;
                state.drag.initialY = clientY;
            }
        };

        const onPointerUp = (e) => {
            if (!state.drag.active) return;
            state.drag.active = false;

            if (state.longPressTimer) {
                clearTimeout(state.longPressTimer);
                state.longPressTimer = null;
            }

            if (state.drag.isDragging) {
                state.settings.posX = state.drag.xOffset;
                state.settings.posY = state.drag.yOffset;
                saveSetting('posX', state.settings.posX);
                saveSetting('posY', state.settings.posY);
            } else if (!state.isLongPressTriggered) {
                handleOButtonCleanClick(e);
            }

            state.drag.isDragging = false;
            state.hasMoved = false;
            setTimeout(() => { state.isLongPressTriggered = false; }, 350);
        };

        if (window.PointerEvent) {
            dragItem.addEventListener('pointerdown', onPointerDown);
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        } else {
            dragItem.addEventListener('touchstart', (e) => { onPointerDown(e.touches[0]); }, { passive: true });
            document.addEventListener('touchmove', (e) => { onPointerMove(e.touches[0]); }, { passive: true });
            document.addEventListener('touchend', onPointerUp);
            dragItem.addEventListener('mousedown', onPointerDown);
            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', onPointerUp);
        }
    }

    function handleOButtonCleanClick(e) {
        const now = Date.now();
        if (now - lastToggleTimestamp < 450) return;
        lastToggleTimestamp = now;

        if (e && (e.ctrlKey || e.metaKey)) {
            triggerScanMode();
            return;
        }

        const sel = window.getSelection();
        const selectedText = (sel && !sel.isCollapsed) ? sel.toString().trim() : '';

        if (selectedText.length > 0) {
            document.getElementById('olympus-textbox').innerText = selectedText;
            document.getElementById('olympus-panel').classList.add('visible');
            showMainView();
            return;
        }

        document.getElementById('olympus-panel').classList.toggle('visible');
    }

    function handleSelectionWingPlay(e) {
        e.stopPropagation();
        const sel = window.getSelection();
        const selectedText = (sel && !sel.isCollapsed) ? sel.toString().trim() : '';
        if (selectedText.length > 0) {
            dispatchSpeech(selectedText);
        }
    }

    function handleSelectionChange() {
        if (state.selectionCheckTimeout) clearTimeout(state.selectionCheckTimeout);
        state.selectionCheckTimeout = setTimeout(() => {
            const selection = window.getSelection();
            const sBtn = document.getElementById('olympus-mini-s');
            if (state.isReading || state.scanModeActive) return;
            if (selection && selection.toString().trim().length > 0) {
                sBtn.style.display = 'flex';
            } else {
                sBtn.style.display = 'none';
            }
        }, 200);
    }

    function applyButtonSizing() {
        const oButton = document.getElementById('olympus-o-button');
        if (!oButton) return;
        const size = state.settings.buttonSizePx || 30;

        oButton.style.width = `${size}px`;
        oButton.style.height = `${size}px`;
        oButton.style.borderRadius = `${size / 2}px 0 0 ${size / 2}px`;

        const wingW = Math.round(size * 0.48);
        const wingH = Math.round(size * 0.46);

        const playBtn = document.getElementById('olympus-mini-play-pause');
        const stopBtn = document.getElementById('olympus-mini-stop');
        const sBtn = document.getElementById('olympus-mini-s');

        [playBtn, stopBtn, sBtn].forEach(btn => {
            if (btn) {
                btn.style.width = `${wingW}px`;
                btn.style.height = `${wingH}px`;
            }
        });
    }

    function updateButtonVisibility() {
        const container = document.getElementById('olympus-button-container');
        if (!container) return;
        container.style.display = (state.settings.hideButton && !state.isReading) ? 'none' : 'flex';
    }

    // -------------------------------------------------------------------
    // [7] SCAN MODE, TXT EDITOR FALLBACK & DUAL HIGHLIGHT
    // -------------------------------------------------------------------
    function handleDoubleClick(e) {
        if (!state.settings.enableDoubleClick || isOlympusUI(e.target)) return;
        const clickedBlock = e.target.closest('p, h1, h2, h3, h4, blockquote, li, article, .ol-scan-para');
        triggerScanMode(clickedBlock || e.target);
    }

    function triggerScanMode(targetElementStart = null) {
        startNewSession();
        state.scanModeActive = true;
        cleanupPageHighlights();

        let candidates = Array.from(document.querySelectorAll('article p, main p, .article__body p, p, h1, h2, h3, blockquote'));
        let rawElements = candidates.filter(el => {
            if (isOlympusUI(el)) return false;
            const text = el.innerText.trim();
            const rect = el.getBoundingClientRect();
            return text.length > 10 && rect.height > 5;
        });

        if (rawElements.length === 0) {
            const editorContainer = document.getElementById('gm-editor-container') ||
                                  document.querySelector('[contenteditable="true"]:not(#olympus-textbox)') ||
                                  document.querySelector('pre') ||
                                  (document.body && document.body.innerText.trim().length > 10 ? document.body : null);

            if (editorContainer && !isOlympusUI(editorContainer)) {
                let blocks = Array.from(editorContainer.querySelectorAll('div, p, pre, blockquote, li')).filter(el => {
                    return !isOlympusUI(el) && el.innerText.trim().length > 3;
                });

                if (blocks.length > 0) {
                    rawElements = blocks;
                } else {
                    if (!editorContainer.dataset.olPreScanHtml) {
                        editorContainer.dataset.olPreScanHtml = editorContainer.innerHTML;
                    }
                    state.activeEditorContainer = editorContainer;

                    const rawText = editorContainer.innerText || '';
                    const paragraphs = rawText.split(/(?:\r?\n){2,}/).map(p => p.trim()).filter(p => p.length > 0);

                    if (paragraphs.length > 0) {
                        editorContainer.innerHTML = '';
                        paragraphs.forEach(pText => {
                            const pEl = document.createElement('p');
                            pEl.className = 'ol-scan-para';
                            pEl.style.margin = '0 0 1.2em 0';
                            pEl.style.whiteSpace = 'pre-wrap';
                            pEl.textContent = pText;
                            editorContainer.appendChild(pEl);
                        });
                        rawElements = Array.from(editorContainer.querySelectorAll('.ol-scan-para'));
                    }
                }
            }
        }

        if (rawElements.length === 0) {
            showToast("No readable content detected.");
            state.scanModeActive = false;
            return;
        }

        state.scannedBlocks = groupElementsIntoBatches(rawElements, 950);

        const totalWords = state.scannedBlocks.reduce((acc, b) => acc + b.text.split(/\s+/).length, 0);
        const estMins = Math.max(1, Math.round(totalWords / (150 * state.settings.rate)));
        document.getElementById('olympus-pill-est-time').textContent = `${estMins}m`;

        state.scannedBlocks.forEach((block, bIdx) => {
            block.elements.forEach(el => {
                el.dataset.olBlockIdx = bIdx;
                el.addEventListener('mouseenter', handleBatchMouseEnter);
                el.addEventListener('mouseleave', handleBatchMouseLeave);
                el.addEventListener('click', handleBatchClick);
            });
        });

        document.getElementById('olympus-button-container').classList.add('pill-active');
        document.getElementById('olympus-pill-wrapper').classList.add('visible');

        let startIdx = 0;
        if (targetElementStart) {
            const foundIdx = state.scannedBlocks.findIndex(b => b.elements.some(el => el === targetElementStart || el.contains(targetElementStart) || targetElementStart.contains(el)));
            if (foundIdx !== -1) {
                startIdx = foundIdx;
            } else if (targetElementStart.textContent) {
                const snippet = targetElementStart.textContent.trim().substring(0, 30);
                if (snippet) {
                    const textIdx = state.scannedBlocks.findIndex(b => b.text.includes(snippet));
                    if (textIdx !== -1) startIdx = textIdx;
                }
            }
        }

        jumpToBlockIndex(startIdx);
    }

    function groupElementsIntoBatches(elements, targetCharLimit = 950) {
        const blocks = [];
        let curElements = [];
        let curText = '';

        elements.forEach(el => {
            const t = el.innerText.trim();
            if (!t) return;

            curElements.push(el);
            curText += (curText ? ' ' : '') + t;

            if (curText.length >= targetCharLimit) {
                blocks.push({ elements: curElements, text: curText });
                curElements = [];
                curText = '';
            }
        });

        if (curElements.length > 0) {
            blocks.push({ elements: curElements, text: curText });
        }
        return blocks;
    }

    function handleBatchMouseEnter(e) {
        if (!state.scanModeActive) return;
        const bIdx = e.currentTarget.dataset.olBlockIdx;
        const block = state.scannedBlocks[bIdx];
        if (block) {
            block.elements.forEach(el => {
                if (!el.classList.contains('olympus-active-reading')) el.classList.add('olympus-hover-block');
            });
        }
    }

    function handleBatchMouseLeave(e) {
        const bIdx = e.currentTarget.dataset.olBlockIdx;
        const block = state.scannedBlocks[bIdx];
        if (block) block.elements.forEach(el => el.classList.remove('olympus-hover-block'));
    }

    function handleBatchClick(e) {
        if (!state.scanModeActive) return;
        e.preventDefault();
        e.stopPropagation();
        const bIdx = parseInt(e.currentTarget.dataset.olBlockIdx, 10);
        if (!isNaN(bIdx)) jumpToBlockIndex(bIdx);
    }

    function jumpToBlockIndex(index) {
        if (!state.scanModeActive || index >= state.scannedBlocks.length) {
            if (index >= state.scannedBlocks.length) closeScanMode();
            return;
        }

        if (state.scannedBlocks[state.currentBlockIndex]) {
            restoreBlockOriginalHtml(state.scannedBlocks[state.currentBlockIndex]);
        }

        state.currentBlockIndex = index;
        const block = state.scannedBlocks[index];

        state.scannedBlocks.forEach(b => b.elements.forEach(el => el.classList.remove('olympus-active-reading', 'olympus-hover-block')));
        block.elements.forEach(el => el.classList.add('olympus-active-reading'));

        if (state.settings.autoScroll && block.elements[0]) {
            block.elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        setupBlockWordSpans(block);

        if (index + 1 < state.scannedBlocks.length) {
            prefetchBlockAudio(state.scannedBlocks[index + 1].text);
        }

        dispatchSpeech(block.text, () => {
            if (state.scanModeActive) jumpToBlockIndex(index + 1);
        });
    }

    function closeScanMode() {
        stopAllSpeech();
        state.scanModeActive = false;
        cleanupPageHighlights();
        document.getElementById('olympus-button-container').classList.remove('pill-active');
        document.getElementById('olympus-pill-wrapper').classList.remove('visible');
        updateProgressDisplay(0);
    }

    function cleanupPageHighlights() {
        if (state.activeEditorContainer && state.activeEditorContainer.dataset.olPreScanHtml) {
            state.activeEditorContainer.innerHTML = state.activeEditorContainer.dataset.olPreScanHtml;
            delete state.activeEditorContainer.dataset.olPreScanHtml;
            state.activeEditorContainer = null;
        }

        state.scannedBlocks.forEach(b => {
            restoreBlockOriginalHtml(b);
            b.elements.forEach(el => {
                el.classList.remove('olympus-active-reading', 'olympus-hover-block');
                el.removeEventListener('mouseenter', handleBatchMouseEnter);
                el.removeEventListener('mouseleave', handleBatchMouseLeave);
                el.removeEventListener('click', handleBatchClick);
            });
        });
    }

    function setupBlockWordSpans(block) {
        if (!state.settings.enableWordHighlight) return;
        let wordCounter = 0;
        block.elements.forEach(el => {
            if (!el.dataset.olOriginalHtml) {
                el.dataset.olOriginalHtml = el.innerHTML;
            }
            wordCounter = wrapWordsInElement(el, wordCounter);
        });
        block.totalWords = wordCounter;
        state.currentActiveWordIdx = -1;
    }

    function wrapWordsInElement(container, startingIdx) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let n;
        while ((n = walker.nextNode())) {
            if (n.textContent.trim().length > 0) textNodes.push(n);
        }

        let currentIdx = startingIdx;
        textNodes.forEach(tNode => {
            const parts = tNode.textContent.split(/(\s+)/);
            const frag = document.createDocumentFragment();
            parts.forEach(part => {
                if (/\S/.test(part)) {
                    const span = document.createElement('span');
                    span.className = 'ol-live-word';
                    span.dataset.wordIdx = currentIdx++;
                    span.textContent = part;
                    frag.appendChild(span);
                } else if (part.length > 0) {
                    frag.appendChild(document.createTextNode(part));
                }
            });
            if (tNode.parentNode) {
                tNode.parentNode.replaceChild(frag, tNode);
            }
        });
        return currentIdx;
    }

    function restoreBlockOriginalHtml(block) {
        if (!block || !block.elements) return;
        block.elements.forEach(el => {
            if (el.dataset.olOriginalHtml) {
                el.innerHTML = el.dataset.olOriginalHtml;
                delete el.dataset.olOriginalHtml;
            }
        });
    }

    function updateLiveWordTracking(fraction) {
        if (!state.scanModeActive || !state.settings.enableWordHighlight) return;
        const block = state.scannedBlocks[state.currentBlockIndex];
        if (!block || !block.totalWords) return;

        const targetIdx = Math.min(block.totalWords - 1, Math.floor(fraction * block.totalWords));
        if (targetIdx === state.currentActiveWordIdx) return;
        state.currentActiveWordIdx = targetIdx;

        block.elements.forEach(el => {
            const activeWords = el.querySelectorAll('.ol-word-active');
            activeWords.forEach(w => w.classList.remove('ol-word-active'));

            const targetSpan = el.querySelector(`.ol-live-word[data-word-idx="${targetIdx}"]`);
            if (targetSpan) {
                targetSpan.classList.add('ol-word-active');
            }
        });
    }

    // -------------------------------------------------------------------
    // [8] REAL-TIME PROGRESS & AUDIO DOWNLOADS
    // -------------------------------------------------------------------
    function updateProgressDisplay(percent) {
        const clamped = Math.max(0, Math.min(100, percent));
        const pillBar = document.getElementById('olympus-pill-progress-bar');
        const panelBar = document.getElementById('olympus-panel-progress-bar');
        if (pillBar) pillBar.style.width = `${clamped}%`;
        if (panelBar) panelBar.style.width = `${clamped}%`;
    }

    function triggerBlobDownload(blob, defaultFilename = 'olympus_speech') {
        if (!blob) {
            showToast("No audio data available to download.");
            return;
        }
        const mime = blob.type || '';
        let ext = '.wav';
        if (mime.includes('mp3') || mime.includes('mpeg')) ext = '.mp3';
        else if (mime.includes('wav')) ext = '.wav';

        const filename = `${defaultFilename.replace(/\.[^/.]+$/, "")}${ext}`;
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1500);
        showToast(`Saved: ${filename}`);
    }

    function handleDownloadActiveChunk() {
        if (state.lastActiveBlob) {
            triggerBlobDownload(state.lastActiveBlob, `scan_chunk_${state.currentBlockIndex + 1}`);
        } else {
            showToast("No active speech buffer loaded.");
        }
    }

    function handleDownloadFromTextbox() {
        const raw = document.getElementById('olympus-textbox').innerText || '';
        if (!raw.trim()) {
            showToast("Textbox is empty. Nothing to download.");
            return;
        }

        const mode = state.settings.ttsMode;
        showToast("Synthesizing audio for download...");

        const model = state.settings.geminiModel || 'gemini-3.8-flash-tts';
        const voiceName = state.settings.geminiVoiceId || 'Puck';
        const cacheKey = `${mode}_${model}_${voiceName}_${raw.trim()}`;

        if (audioMemoryCache.has(cacheKey)) {
            triggerBlobDownload(audioMemoryCache.get(cacheKey), 'olympus_textbox_audio');
            return;
        }

        if (mode === 'gemini') {
            const apiKey = state.settings.geminiApiKey;
            if (!apiKey) { showToast("Gemini Key Missing."); return; }
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: raw.trim() }] }],
                generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } } }
            };
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
                onload: (r) => {
                    if (r.status === 200) {
                        try {
                            const res = JSON.parse(r.responseText);
                            const part = res.candidates?.[0]?.content?.parts?.[0];
                            if (part?.inlineData?.data) {
                                const blob = convertGeminiAudioToBlob(part.inlineData.data, part.inlineData.mimeType);
                                audioMemoryCache.set(cacheKey, blob);
                                triggerBlobDownload(blob, 'olympus_textbox_audio');
                                return;
                            }
                        } catch (e) {}
                    }
                    showToast("Synthesis download failed.");
                },
                onerror: () => showToast("Network error.")
            });
        } else {
            dispatchSpeech(raw.trim(), () => {
                if (state.lastActiveBlob) triggerBlobDownload(state.lastActiveBlob, 'olympus_textbox_audio');
            });
        }
    }

    // -------------------------------------------------------------------
    // [9] AUDIO ENGINES & MUTEX PIPELINE
    // -------------------------------------------------------------------
    function startNewSession() {
        stopAllSpeech();
        globalSessionId++;
        state.activeSessionId = globalSessionId;
        return globalSessionId;
    }

    function prefetchBlockAudio(text) {
        if (!text || state.settings.ttsMode !== 'gemini') return;
        const apiKey = state.settings.geminiApiKey;
        if (!apiKey) return;

        const model = state.settings.geminiModel || 'gemini-3.8-flash-tts';
        const voiceName = state.settings.geminiVoiceId || 'Puck';
        const cacheKey = `gemini_${model}_${voiceName}_${text}`;

        if (audioMemoryCache.has(cacheKey) || prefetchPromises.has(cacheKey)) return;

        const p = new Promise((resolve) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: text }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } }
                }
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
                onload: (r) => {
                    if (r.status === 200) {
                        try {
                            const res = JSON.parse(r.responseText);
                            const part = res.candidates?.[0]?.content?.parts?.[0];
                            if (part?.inlineData?.data) {
                                const mime = part.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000';
                                const blob = convertGeminiAudioToBlob(part.inlineData.data, mime);
                                audioMemoryCache.set(cacheKey, blob);
                                resolve(blob);
                                return;
                            }
                        } catch (e) {}
                    }
                    resolve(null);
                },
                onerror: () => resolve(null)
            });
        });

        prefetchPromises.set(cacheKey, p);
    }

    function playGeminiTTS(text, onEnded, session) {
        const apiKey = state.settings.geminiApiKey;
        if (!apiKey) {
            showToast("Gemini API Key missing.");
            document.getElementById('olympus-panel').classList.add('visible');
            showSettingsView();
            return;
        }

        const model = state.settings.geminiModel || 'gemini-3.8-flash-tts';
        const voiceName = state.settings.geminiVoiceId || 'Puck';
        const cacheKey = `gemini_${model}_${voiceName}_${text}`;

        if (session !== state.activeSessionId) return;

        if (audioMemoryCache.has(cacheKey)) {
            playAudioBlob(audioMemoryCache.get(cacheKey), onEnded, session);
            return;
        }

        setLoadingState(true);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } }
            }
        };

        state.activeNetworkRequest = GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(payload),
            onload: function(r) {
                state.activeNetworkRequest = null;
                setLoadingState(false);

                if (session !== state.activeSessionId) return;

                if (r.status === 200) {
                    try {
                        const res = JSON.parse(r.responseText);
                        const part = res.candidates?.[0]?.content?.parts?.[0];
                        if (part?.inlineData?.data) {
                            const mime = part.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000';
                            const blob = convertGeminiAudioToBlob(part.inlineData.data, mime);
                            audioMemoryCache.set(cacheKey, blob);
                            playAudioBlob(blob, onEnded, session);
                        } else {
                            handleStop();
                        }
                    } catch (err) {
                        handleStop();
                    }
                } else if (r.status === 429) {
                    showToast("Gemini 429: Daily quota reached. Auto-switching to Edge Neural...");
                    saveSetting('ttsMode', 'edge');
                    document.getElementById('olympus-tts-mode-select').value = 'edge';
                    updateSettingsVisibility('edge');
                    playEdgeTTS(text, onEnded, session);
                } else {
                    let msg = `HTTP ${r.status}`;
                    try { msg = JSON.parse(r.responseText).error?.message || msg; } catch(e){}
                    showToast(`Gemini Error (${r.status}): ${msg}`);
                    handleStop();
                }
            },
            onerror: function() {
                state.activeNetworkRequest = null;
                setLoadingState(false);
                if (session !== state.activeSessionId) return;
                showToast("Network error contacting Gemini.");
                handleStop();
            }
        });
    }

    function dispatchSpeech(text, onEnded) {
        const session = startNewSession();
        state.isReading = true;
        updatePlaybackUI(true);

        const safeOnEnded = () => {
            if (session !== state.activeSessionId) return;
            if (onEnded) onEnded();
            else handleStop();
        };

        const mode = state.settings.ttsMode;
        if (mode === 'gemini') playGeminiTTS(text, safeOnEnded, session);
        else if (mode === 'edge') playEdgeTTS(text, safeOnEnded, session);
        else if (mode === 'google_free') playGoogleTranslateFree(text, safeOnEnded, session);
        else if (mode === 'system') playSystem(text, safeOnEnded, session);
        else if (mode === 'eleven') playElevenLabs(text, safeOnEnded, session);
        else if (mode === 'google') playGoogleCloud(text, safeOnEnded, session);
        else if (mode === 'voicerss') playVoiceRSS(text, safeOnEnded, session);
    }

    function playAudioBlob(blob, onEndCallback, session) {
        if (session && session !== state.activeSessionId) return;

        state.lastActiveBlob = blob;

        if (state.audioUrlObject) URL.revokeObjectURL(state.audioUrlObject);
        state.audioUrlObject = URL.createObjectURL(blob);

        const audio = new Audio(state.audioUrlObject);
        state.currentAudio = audio;
        audio.playbackRate = state.settings.rate || 1.0;

        audio.ontimeupdate = () => {
            if (session && session !== state.activeSessionId) return;
            if (!state.currentAudio) return;
            const cur = audio.currentTime;
            const dur = audio.duration || 1;
            const fraction = cur / dur;

            if (state.scanModeActive && state.scannedBlocks.length > 0) {
                const total = state.scannedBlocks.length;
                const progress = ((state.currentBlockIndex + fraction) / total) * 100;
                updateProgressDisplay(progress);
                updateLiveWordTracking(fraction);
            } else {
                updateProgressDisplay(fraction * 100);
            }

            if (state.settings.highlightInsidePanel && !state.scanModeActive) {
                updateTextboxSegmentHighlight(fraction);
            }
        };

        audio.onended = () => {
            if (session && session !== state.activeSessionId) return;
            if (onEndCallback) onEndCallback();
            else handleStop();
        };

        audio.onerror = () => {
            if (session && session !== state.activeSessionId) return;
            handleStop();
        };

        audio.play().catch(e => {
            if (session && session !== state.activeSessionId) return;
            console.warn("Autoplay:", e);
        });
    }

    function stopAllSpeech() {
        globalSessionId++;
        state.activeSessionId = globalSessionId;

        state.isReading = false;
        state.isPaused = false;
        try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (e) {}

        if (state.activeNetworkRequest && typeof state.activeNetworkRequest.abort === 'function') {
            try { state.activeNetworkRequest.abort(); } catch (e) {}
            state.activeNetworkRequest = null;
        }

        if (state.currentAudio) {
            try {
                state.currentAudio.onended = null;
                state.currentAudio.ontimeupdate = null;
                state.currentAudio.onerror = null;
                state.currentAudio.pause();
                state.currentAudio.removeAttribute('src');
                state.currentAudio.load();
            } catch (e) {}
            state.currentAudio = null;
        }

        if (state.audioUrlObject) {
            URL.revokeObjectURL(state.audioUrlObject);
            state.audioUrlObject = null;
        }

        updateProgressDisplay(0);
        updatePlaybackUI(false);
        setLoadingState(false);
    }

    function handleStop() {
        stopAllSpeech();
        if (state.scanModeActive) closeScanMode();
        updateButtonVisibility();
    }

    function handlePauseToggle() {
        if (!state.isReading) return;
        state.isPaused = !state.isPaused;

        if (state.isPaused) {
            if (state.settings.ttsMode === 'system') speechSynthesis.pause();
            else if (state.currentAudio) state.currentAudio.pause();
        } else {
            if (state.settings.ttsMode === 'system') speechSynthesis.resume();
            else if (state.currentAudio) state.currentAudio.play();
        }
        updatePlaybackUI(true);
    }

    function setPlaybackSpeed(rate) {
        state.settings.rate = rate;
        document.getElementById('olympus-speed-value').textContent = `${rate.toFixed(1)}x`;
        document.getElementById('olympus-pill-speed-val').textContent = `${rate.toFixed(1)}x`;
        if (state.currentAudio) state.currentAudio.playbackRate = rate;
    }

    function cycleSpeedRate() {
        const rates = [0.8, 1.0, 1.2, 1.5, 2.0];
        let next = rates[(rates.indexOf(state.settings.rate) + 1) % rates.length] || 1.0;
        setPlaybackSpeed(next);
        saveSetting('rate', next);
    }

    function updatePlaybackUI(isPlaying) {
        const playPauseBtn = document.getElementById('olympus-mini-play-pause');
        const stopBtn = document.getElementById('olympus-mini-stop');
        const sBtn = document.getElementById('olympus-mini-s');
        const pillPlayBtn = document.getElementById('olympus-pill-play-btn');

        if (!state.scanModeActive) {
            if (playPauseBtn) playPauseBtn.style.display = isPlaying ? 'flex' : 'none';
            if (stopBtn) stopBtn.style.display = isPlaying ? 'flex' : 'none';
            if (isPlaying && sBtn) sBtn.style.display = 'none';
        }

        const icon = state.isPaused ? '▶' : '❚❚';
        if (playPauseBtn) playPauseBtn.innerHTML = icon;
        if (pillPlayBtn) pillPlayBtn.innerHTML = icon;
    }

    function setLoadingState(isLoading) {
        const btn = document.getElementById('olympus-o-button');
        if (!btn) return;
        document.body.style.cursor = isLoading ? 'wait' : 'default';
        if (isLoading) btn.classList.add('loading');
        else btn.classList.remove('loading');
    }

    // -------------------------------------------------------------------
    // [10] TEXTBOX SEGMENT HIGHLIGHTING
    // -------------------------------------------------------------------
    function handlePlayFromTextbox() {
        const box = document.getElementById('olympus-textbox');
        const raw = box.innerText || '';
        if (!raw.trim()) return;

        if (state.settings.highlightInsidePanel) {
            const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
            box.innerHTML = '';
            sentences.forEach((s, idx) => {
                const sp = document.createElement('span');
                sp.className = 'olympus-tb-segment';
                sp.dataset.tbIdx = idx;
                sp.textContent = s;
                box.appendChild(sp);
            });
        }
        dispatchSpeech(raw.trim());
    }

    function updateTextboxSegmentHighlight(progressFraction) {
        const segments = document.querySelectorAll('#olympus-textbox .olympus-tb-segment');
        if (!segments || segments.length === 0) return;
        const activeIdx = Math.min(segments.length - 1, Math.floor(progressFraction * segments.length));
        segments.forEach((seg, i) => {
            if (i === activeIdx) seg.classList.add('olympus-tb-active');
            else seg.classList.remove('olympus-tb-active');
        });
    }

    // -------------------------------------------------------------------
    // [11] PCM TO WAV CONVERTER
    // -------------------------------------------------------------------
    function pcmToWav(pcmData, sampleRate = 24000, numChannels = 1) {
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmData.length;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        function writeString(v, offset, str) {
            for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i));
        }

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        const wavBytes = new Uint8Array(buffer);
        wavBytes.set(pcmData, 44);
        return new Blob([wavBytes], { type: 'audio/wav' });
    }

    function convertGeminiAudioToBlob(base64Data, mimeType) {
        const rawBytes = base64ToUint8Array(base64Data);
        if (rawBytes.length > 4 && rawBytes[0] === 0x52 && rawBytes[1] === 0x49 && rawBytes[2] === 0x46 && rawBytes[3] === 0x46) {
            return new Blob([rawBytes], { type: 'audio/wav' });
        }
        if (mimeType && (mimeType.includes('mp3') || mimeType.includes('mpeg'))) {
            return new Blob([rawBytes], { type: 'audio/mpeg' });
        }
        let rate = 24000;
        if (mimeType && mimeType.includes('rate=')) {
            const m = mimeType.match(/rate=(\d+)/);
            if (m) rate = parseInt(m[1], 10);
        }
        return pcmToWav(rawBytes, rate, 1);
    }

    function base64ToUint8Array(base64) {
        const byteChars = window.atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        return byteArray;
    }

    // -------------------------------------------------------------------
    // [12] OTHER TTS ENGINES
    // -------------------------------------------------------------------
    function playSystem(text, onEnded, session) {
        if (session !== state.activeSessionId) return;
        const utter = new SpeechSynthesisUtterance(text);
        const v = speechSynthesis.getVoices().find(v => v.name === state.settings.systemVoiceName);
        if (v) utter.voice = v;
        utter.rate = state.settings.rate || 1.0;
        utter.onend = () => { if (session === state.activeSessionId) { if (onEnded) onEnded(); else handleStop(); } };
        utter.onerror = () => { if (session === state.activeSessionId) handleStop(); };
        speechSynthesis.speak(utter);
    }

    function playEdgeTTS(text, onEnded, session) {
        if (session !== state.activeSessionId) return;
        const token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${token}`;
        let ws;
        try {
            ws = (typeof GM_webSocket !== 'undefined') ? GM_webSocket(url) : new WebSocket(url);
        } catch (e) {
            showToast("Edge TTS Blocked by CSP.");
            return;
        }
        ws.binaryType = "arraybuffer";
        const reqId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)).replace(/-/g, '');
        let audioChunks = [];

        ws.onopen = () => {
            if (session !== state.activeSessionId) { ws.close(); return; }
            const config = { context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } };
            ws.send(`X-Timestamp:${Date.now()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}`);
            const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const voice = state.settings.edgeVoiceId || 'en-US-AriaNeural';
            const ratePercent = Math.round((state.settings.rate - 1.0) * 100);
            const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
            ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${voice}"><prosody rate="${rateStr}">${escaped}</prosody></voice></speak>`);
        };
        ws.onmessage = (event) => {
            if (session !== state.activeSessionId) { ws.close(); return; }
            if (typeof event.data === 'string' && event.data.includes('Path:turn.end')) {
                ws.close();
                if (audioChunks.length > 0) playAudioBlob(new Blob(audioChunks, { type: 'audio/mpeg' }), onEnded, session);
            } else if (event.data instanceof ArrayBuffer) {
                const dv = new Uint8Array(event.data);
                let hEnd = -1;
                for (let i = 0; i < dv.length - 3; i++) {
                    if (dv[i] === 13 && dv[i+1] === 10 && dv[i+2] === 13 && dv[i+3] === 10) { hEnd = i + 4; break; }
                }
                if (hEnd !== -1) audioChunks.push(event.data.slice(hEnd));
            }
        };
        ws.onerror = () => showToast("Edge TTS Connection Failed.");
    }

    function playGoogleTranslateFree(text, onEnded, session) {
        if (session !== state.activeSessionId) return;
        const q = encodeURIComponent(text.substring(0, 200));
        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${q}`,
            responseType: 'blob',
            onload: (r) => { if (session === state.activeSessionId && r.status === 200) playAudioBlob(r.response, onEnded, session); else if (session === state.activeSessionId) handleStop(); },
            onerror: () => { if (session === state.activeSessionId) handleStop(); }
        });
    }

    function playElevenLabs(text, onEnded, session) {
        if (session !== state.activeSessionId) return;
        const apiKey = state.settings.elevenApiKey;
        const voiceId = state.settings.elevenVoiceId || 'JBFqnCBsd6RMkjVDRZzb';
        if (!apiKey) { showToast('ElevenLabs API Key Missing.'); return; }
        GM_xmlhttpRequest({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
            data: JSON.stringify({ text }),
            responseType: 'blob',
            onload: (r) => { if (session === state.activeSessionId && r.status === 200) playAudioBlob(r.response, onEnded, session); else if (session === state.activeSessionId) handleStop(); },
            onerror: () => { if (session === state.activeSessionId) handleStop(); }
        });
    }

    function playGoogleCloud(text, onEnded, session) {
        if (session !== state.activeSessionId) return;
        const apiKey = state.settings.googleApiKey;
        const voiceId = state.settings.googleVoiceId || 'en-US-Neural2-F';
        if (!apiKey) { showToast('Google Cloud Key Missing.'); return; }
        GM_xmlhttpRequest({
            method: 'POST',
            url: `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ input: { text }, voice: { languageCode: 'en-US', name: voiceId }, audioConfig: { audioEncoding: 'MP3' } }),
            onload: (r) => {
                if (session === state.activeSessionId && r.status === 200) {
                    const res = JSON.parse(r.responseText);
                    const b = base64ToUint8Array(res.audioContent);
                    playAudioBlob(new Blob([b], { type: 'audio/mpeg' }), onEnded, session);
                } else if (session === state.activeSessionId) handleStop();
            },
            onerror: () => { if (session === state.activeSessionId) handleStop(); }
        });
    }

    function playVoiceRSS(text, onEnded, session) {
        if (session !== state.activeSessionId) return;
        const apiKey = state.settings.voiceRssApiKey;
        if (!apiKey) { showToast('VoiceRSS Key Missing.'); return; }
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.voicerss.org/',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: `key=${apiKey}&src=${encodeURIComponent(text)}&hl=en-us&c=MP3`,
            responseType: 'blob',
            onload: (r) => { if (session === state.activeSessionId && r.status === 200) playAudioBlob(r.response, onEnded, session); else if (session === state.activeSessionId) handleStop(); },
            onerror: () => { if (session === state.activeSessionId) handleStop(); }
        });
    }

    // -------------------------------------------------------------------
    // [13] VOICE OPTIONS & HELPERS
    // -------------------------------------------------------------------
    async function updateVoiceOptions(mode) {
        const select = document.getElementById('olympus-voice-select');
        select.innerHTML = '<option>Loading voices...</option>';
        select.disabled = true;

        if (mode === 'gemini') {
            select.innerHTML = '';
            GEMINI_VOICES.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.name;
                select.appendChild(opt);
            });
            if (state.settings.geminiVoiceId) select.value = state.settings.geminiVoiceId;
        } else if (mode === 'system') {
            select.innerHTML = '';
            if (typeof speechSynthesis !== 'undefined') {
                speechSynthesis.getVoices().forEach(v => {
                    const o = document.createElement('option');
                    o.value = v.name;
                    o.textContent = `${v.name} (${v.lang})`;
                    select.appendChild(o);
                });
            }
            if (state.settings.systemVoiceName) select.value = state.settings.systemVoiceName;
        } else if (mode === 'edge') {
            fetchEdgeVoices();
        } else if (mode === 'eleven') {
            fetchElevenLabsVoices();
        } else if (mode === 'google') {
            select.innerHTML = '<option value="en-US-Neural2-F">en-US-Neural2-F</option><option value="en-US-Journey-F">en-US-Journey-F</option>';
        } else if (mode === 'voicerss') {
            select.innerHTML = '<option value="en-us">English (US)</option><option value="en-gb">English (UK)</option>';
        } else if (mode === 'google_free') {
            select.innerHTML = '<option value="en">English (Google Translate)</option>';
        }

        select.disabled = false;
    }

    function fetchEdgeVoices() {
        const token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${token}`,
            onload: function(r) {
                const sel = document.getElementById('olympus-voice-select');
                if (r.status === 200) {
                    try {
                        const voices = JSON.parse(r.responseText);
                        sel.innerHTML = '';
                        voices.forEach(v => {
                            const o = document.createElement('option');
                            o.textContent = `${v.FriendlyName || v.ShortName} (${v.Gender})`;
                            o.value = v.ShortName;
                            sel.appendChild(o);
                        });
                        if (state.settings.edgeVoiceId) sel.value = state.settings.edgeVoiceId;
                    } catch (e) {}
                }
            }
        });
    }

    function fetchElevenLabsVoices() {
        const sel = document.getElementById('olympus-voice-select');
        if (!state.settings.elevenApiKey) return;
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.elevenlabs.io/v1/voices',
            headers: { 'xi-api-key': state.settings.elevenApiKey },
            onload: r => {
                if (r.status === 200) {
                    sel.innerHTML = '';
                    JSON.parse(r.responseText).voices.forEach(v => {
                        const o = document.createElement('option');
                        o.value = v.voice_id;
                        o.textContent = v.name;
                        sel.appendChild(o);
                    });
                }
            }
        });
    }

    async function handleTtsModeChange(e) {
        const newMode = e.target.value;
        await saveSetting('ttsMode', newMode);
        updateSettingsVisibility(newMode);
        await updateVoiceOptions(newMode);
    }

    function updateSettingsVisibility(mode) {
        document.getElementById('olympus-gemini-settings').style.display = mode === 'gemini' ? 'flex' : 'none';
        document.getElementById('olympus-eleven-settings').style.display = mode === 'eleven' ? 'flex' : 'none';
        document.getElementById('olympus-google-settings').style.display = mode === 'google' ? 'flex' : 'none';
        document.getElementById('olympus-voicerss-settings').style.display = mode === 'voicerss' ? 'flex' : 'none';
        document.getElementById('olympus-edge-settings').style.display = mode === 'edge' ? 'block' : 'none';
        document.getElementById('olympus-google-free-settings').style.display = mode === 'google_free' ? 'block' : 'none';
    }

    function pasteSelection() {
        const sel = window.getSelection().toString();
        if (sel.trim()) document.getElementById('olympus-textbox').innerText = sel.trim();
    }

    function showSettingsView() {
        document.getElementById('olympus-main-view').style.display = 'none';
        document.getElementById('olympus-settings-view').style.display = 'flex';
    }

    function showMainView() {
        document.getElementById('olympus-settings-view').style.display = 'none';
        document.getElementById('olympus-main-view').style.display = 'flex';
    }

    function isOlympusUI(target) {
        return document.getElementById('olympus-panel')?.contains(target) ||
               document.getElementById('olympus-pill-wrapper')?.contains(target) ||
               document.getElementById('olympus-button-container')?.contains(target);
    }

    init();

})();
