// ==========================================
// EXECUTION GUARD & VISIBILITY SPOOFING
// ==========================================
if (window._ytLuckyInitialized) return;
window._ytLuckyInitialized = true;

try {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
} catch (e) {
    console.warn("YT Lucky: Could not spoof visibility state", e);
}

(function () {
    'use strict';

    // --- START OF EMBED CHECK ---
    const pathname = window.location.pathname;
    if (pathname.startsWith('/embed/') || pathname.startsWith('/v/')) { return; }
    // --- END OF EMBED CHECK ---

    // ==========================================
    // MODULE 1: GLOBAL STYLES & CONFIG
    // ==========================================
    const ANCHOR_CFG = { leftOffset: 5, topOffset: 56, debounceMs: 300, zIndex: 1000 };
    const PTB_CFG = { DELAY_MS: 900, MAX_RESULTS: 5, INNERTUBE_KEY: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', INNERTUBE_CLIENT: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } };

    // --- AI CONFIGURATION ---
    const AI_MODEL_OPTIONS = {
        gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        openrouter: ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat', 'anthropic/claude-3.5-haiku'],
        groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant'],
        cerebras: ['gpt-oss-120b', 'llama3.1-8b', 'llama-3.3-70b']
    };

    const AI_DEFAULTS = {
        provider: 'gemini',
        geminiApiKey: '',
        geminiModel: 'gemini-2.5-flash-lite',
        openrouterApiKey: '',
        openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
        groqApiKey: '',
        groqModel: 'llama-3.3-70b-versatile',
        cerebrasApiKey: '',
        cerebrasModel: 'gpt-oss-120b',
        typewriterEnabled: true,
        typewriterSpeed: 10
    };

    let aiSettings = { ...AI_DEFAULTS, ...(GM_getValue('yt_lucky_ai_settings') || {}) };
    function saveAiSettings() { GM_setValue('yt_lucky_ai_settings', aiSettings); }

    GM_addStyle(`
        /* --- ANCHOR STYLES --- */
        ytd-watch-flexy[flexy] #player { margin-left: 0 !important; }
        ytd-watch-flexy #primary.ytd-watch-flexy { margin-left: 0 !important; padding-left: ${ANCHOR_CFG.leftOffset}px !important; }
        ytd-watch-flexy #columns.ytd-watch-flexy { margin-left: 0 !important; padding-left: 0 !important; }
        #yt-anchor-scroll-top { position: fixed; bottom: 44px; right: 16px; z-index: ${ANCHOR_CFG.zIndex + 10}; background: rgba(0,0,0,0.65); color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font: 600 10px/1.4 "YouTube Sans", Arial, sans-serif; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.4); transition: background .15s; display: none; }
        #yt-anchor-scroll-top:hover { background: rgba(0,0,0,0.85); }
        #yt-anchor-spacer { display: none; width: 100%; flex-shrink: 0; }

        /* --- POTPLAYER BUILDER STYLES --- */
        #ptb-panel { position: relative; width: 100%; flex: 1; background: transparent; border: none; font-family: 'Roboto', sans-serif; color: #f1f1f1; overflow-y: auto; display: none; flex-direction: column; padding-top: 10px; }
        #ptb-header { background:#ff0000; padding:10px 14px; display:flex; align-items:center; gap:10px; border-radius: 8px; flex-shrink:0; }
        #ptb-header svg { width:18px; height:18px; fill:#fff; flex-shrink:0; }
        #ptb-header-text h3 { margin:0; font-size:13px; font-weight:700; }
        #ptb-header-text p  { margin:2px 0 0; font-size:10px; opacity:.85; }
        #ptb-body { padding:14px 0px; display:flex; flex-direction:column; gap:10px; }
        #ptb-textarea { width:100%; height:100px; background:#1a1a1a; border:1px solid #333; border-radius:8px; color:#f1f1f1; font-size:12px; padding:10px; resize:vertical; box-sizing:border-box; }
        #ptb-name-row { display:flex; gap:8px; align-items:flex-end; }
        #ptb-name { flex:1; background:#1a1a1a; border:1px solid #333; border-radius:8px; color:#f1f1f1; font-size:12px; padding:8px 10px; box-sizing:border-box; }
        #ptb-run { padding:9px 16px; background:#ff0000; color:#fff; border:none; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
        #ptb-run:hover { background:#cc0000; }
        #ptb-progress-wrap { display:none; flex-direction:column; gap:6px; }
        #ptb-progress-wrap.visible { display:flex; }
        #ptb-progress-bar-bg { width:100%; height:4px; background:#272727; border-radius:2px; overflow:hidden; }
        #ptb-progress-bar { height:100%; background:#ff0000; width:0%; transition:width .3s ease; }
        #ptb-progress-label { font-size:11px; color:#aaa; display:flex; justify-content:space-between; }
        #ptb-result { display:none; flex-direction:column; gap:8px; }
        #ptb-result.visible { display:flex; }
        .ptb-url-box { background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:10px; font-size:11px; color:#4fc3f7; word-break:break-all; cursor:pointer; }
        #ptb-result-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .ptb-action-btn { flex:1; padding:8px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; border:none; }
        #ptb-toast { position:fixed; bottom:84px; right:24px; background:#272727; color:#f1f1f1; padding:8px 16px; border-radius:8px; font-size:12px; z-index:100000; opacity:0; transition:opacity .2s; pointer-events:none; }
        #ptb-toast.show { opacity:1; }

        /* --- LYRICS PANEL STYLES --- */
        #yt-lucky-lyrics-panel { position: relative; width: 100%; flex: 1; background: transparent; display: none; flex-direction: column; overflow: hidden; padding-top: 10px; --lyrics-active-size: 20px; }
        #lyrics-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink:0; position:relative; }
        #lyrics-header-title { font-weight: 700; font-size: 14px; color: #fff; }
        .lyrics-controls-row { display: flex; gap: 4px; }
        .lyrics-mini-btn { background: rgba(255,255,255,0.1); border: none; color: white; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; transition: background 0.2s; }
        .lyrics-mini-btn:hover { background: rgba(255,255,255,0.25); }
        .lyrics-mini-btn.active { background: #e91e63; color: #fff; }
        #lyrics-content { flex: 1; overflow-y: auto; padding: 10px 10px 60px 10px; scrollbar-width: none; scroll-behavior: smooth; position: relative; }
        #lyrics-content::-webkit-scrollbar { display: none; }
        .lyrics-loading { padding: 40px 20px; text-align: center; color: #aaa; font-style: italic; font-size: 12px; }

        #lyrics-internal-toast { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 6px 12px; border-radius: 12px; font-size: 11px; font-weight: bold; pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 20; }
        #lyrics-internal-toast.show { opacity: 1; }

        .lyrics-line {
            opacity: 0.4; color: #fff !important; font-size: 16px !important; font-weight: 600 !important;
            padding: 8px 0 !important; margin: 4px 0 !important; cursor: pointer !important;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); transform-origin: left center; line-height: 1.4;
        }
        .lyrics-line:hover { opacity: 0.7; }
        .lyrics-line.karaoke-active {
            opacity: 1 !important; font-size: var(--lyrics-active-size) !important; font-weight: 800 !important;
            transform: scale(1.02); color: #fff !important; text-shadow: 0 2px 12px rgba(255,255,255,0.2);
        }

        /* --- AIEx & AI SETTINGS STYLES --- */
        #yt-aiex-panel, #yt-aisettings-panel {
            display: none; flex-direction: column; flex: 1; overflow-y: auto; gap: 8px; padding-top: 10px; color: #f1f1f1;
        }
        #aiex-content {
            flex: 1; overflow-y: auto; padding: 10px 4px 60px 4px; line-height: 1.6; font-size: 13px;
            color: #ddd; word-break: break-word; scrollbar-width: thin;
        }
        #aiex-content strong { color: #0288d1; font-weight: 700; }
        #aiex-content em { color: #ba68c8; }
        #aiex-content code { background: #242424; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 11px; }
        .yt-loading-pulse {
            display: inline-block; width: 10px; height: 10px; background-color: #0288d1;
            border-radius: 50%; animation: yt-pulse 1.2s infinite cubic-bezier(0.66, 0, 0, 1); margin-right: 6px;
        }
        @keyframes yt-pulse { 0% { transform: scale(0.8); opacity: 0.5; } 50% { transform: scale(1.4); opacity: 1; } 100% { transform: scale(0.8); opacity: 0.5; } }

        .yt-ai-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
        .yt-ai-group label { font-size: 11px; color: #aaa; font-weight: 600; }
        .yt-ai-group input, .yt-ai-group select {
            background: #181818; border: 1px solid #333; color: #fff; padding: 6px 8px;
            border-radius: 6px; font-size: 11px; box-sizing: border-box; outline: none;
        }
        .yt-ai-group input:focus, .yt-ai-group select:focus { border-color: #0288d1; }
    `);

    // ==========================================
    // MODULE 2: LYRICS SYSTEM (Integrated Singleton)
    // ==========================================
    const YtLyrics = {
        panelElement: null, currentLyrics: [], lineElements: [], currentVideoId: null,
        apiOrder: ['LRCLIB', 'Genius', 'Lyrics.ovh', 'Textyl.co', 'Some Random API'],
        preferredApi: '', karaokeMode: true, catcherMode: false, isFetching: false,
        lastActiveIndex: -1, karaokeRaf: null, toastTimeout: null,
        syncOffset: parseFloat(localStorage.getItem('ytLyrics_offset')) || 0.15,
        activeFontSize: parseInt(localStorage.getItem('ytLyrics_fontSize')) || 20,
        geniusCredentials: { accessToken: 'ic8x2s4DuKQMZeUO-tbEJj7mImVhEg0nzWfXX0Bzt8VUdE8y586DnZ-HUbolc3o2' },

        init() {
            this.preferredApi = GM_getValue('preferredApi', this.apiOrder[0]);
            this.karaokeMode = localStorage.getItem('ytLyrics_karaoke') !== '0';
            this.buildUI();
            this.startKaraokeLoop();
        },
        buildUI() {
            if (this.panelElement) return;
            const panel = document.createElement('div');
            panel.id = 'yt-lucky-lyrics-panel';
            panel.style.setProperty('--lyrics-active-size', this.activeFontSize + 'px');
            panel.innerHTML = `
                <div id="lyrics-header">
                    <span id="lyrics-header-title">🎵 Lyrics</span>
                    <div class="lyrics-controls-row">
                        <button id="lyrics-btn-font" class="lyrics-mini-btn" title="Adjust Font Size">Aa</button>
                        <button id="lyrics-btn-minus" class="lyrics-mini-btn" title="Delay Lyrics (-100ms)">-</button>
                        <button id="lyrics-btn-plus" class="lyrics-mini-btn" title="Advance Lyrics (+100ms)">+</button>
                        <button id="lyrics-btn-catcher" class="lyrics-mini-btn" title="Lyrics Catcher (Click line to Sync)">🎵C</button>
                        <button id="lyrics-btn-sync" class="lyrics-mini-btn" title="Toggle Real-Time Sync (Karaoke Mode)">K</button>
                        <button id="lyrics-btn-cycle" class="lyrics-mini-btn" title="Cycle Lyrics API">🔄</button>
                    </div>

                    <div id="lyrics-font-panel" style="display:none; position:absolute; right:0px; top:36px; background:#222; border:1px solid #444; border-radius:8px; padding:10px; z-index:10; flex-direction:column; gap:8px; width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                        <label style="font-size:10px; color:#aaa; display:flex; justify-content:space-between;">Size: <span id="lyrics-font-val">${this.activeFontSize}px</span></label>
                        <input type="range" id="lyrics-font-slider" min="14" max="48" step="1" value="${this.activeFontSize}" style="width:100%;">
                        <button id="lyrics-font-reset" style="background:#d32f2f; color:#fff; border:none; border-radius:4px; padding:4px; cursor:pointer; font-size:10px;">Reset Default</button>
                    </div>
                </div>
                <div id="lyrics-content">
                    <div class="lyrics-loading">Waiting for track...</div>
                </div>
                <div id="lyrics-internal-toast"></div>
            `;
            this.panelElement = panel;

            setTimeout(() => {
                this.updateControlsUI();
                const addEvt = (id, evt, fn) => { const el = panel.querySelector(id); if(el) el.addEventListener(evt, fn); };

                addEvt('#lyrics-btn-sync', 'click', () => {
                    this.karaokeMode = !this.karaokeMode;
                    if (this.karaokeMode) this.catcherMode = false;
                    localStorage.setItem('ytLyrics_karaoke', this.karaokeMode ? '1' : '0');
                    this.updateControlsUI();
                    if (this.karaokeMode) {
                        this.startKaraokeLoop();
                        if(this.lastActiveIndex >= 0 && this.lineElements[this.lastActiveIndex]) this.highlightLine(this.lastActiveIndex, true);
                    } else {
                        this.lineElements.forEach(el => el.classList.remove('karaoke-active'));
                        this.lastActiveIndex = -1;
                    }
                });

                addEvt('#lyrics-btn-catcher', 'click', () => {
                    this.catcherMode = !this.catcherMode;
                    if (this.catcherMode) {
                        this.karaokeMode = false;
                        localStorage.setItem('ytLyrics_karaoke', '0');
                        this.lineElements.forEach(el => el.classList.remove('karaoke-active'));
                        this.lastActiveIndex = -1;
                        this.showToast("Catcher ON: Click any line to sync");
                    }
                    this.updateControlsUI();
                });

                addEvt('#lyrics-btn-plus', 'click', () => {
                    this.syncOffset += 0.1;
                    localStorage.setItem('ytLyrics_offset', this.syncOffset);
                    this.showToast(`Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
                });

                addEvt('#lyrics-btn-minus', 'click', () => {
                    this.syncOffset -= 0.1;
                    localStorage.setItem('ytLyrics_offset', this.syncOffset);
                    this.showToast(`Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
                });

                addEvt('#lyrics-btn-font', 'click', () => {
                    const fp = this.panelElement.querySelector('#lyrics-font-panel');
                    fp.style.display = fp.style.display === 'none' ? 'flex' : 'none';
                });

                addEvt('#lyrics-font-slider', 'input', (e) => {
                    this.activeFontSize = e.target.value;
                    this.panelElement.style.setProperty('--lyrics-active-size', this.activeFontSize + 'px');
                    this.panelElement.querySelector('#lyrics-font-val').textContent = this.activeFontSize + 'px';
                    localStorage.setItem('ytLyrics_fontSize', this.activeFontSize);
                });

                addEvt('#lyrics-font-reset', 'click', () => {
                    this.activeFontSize = 20;
                    this.panelElement.querySelector('#lyrics-font-slider').value = 20;
                    this.panelElement.style.setProperty('--lyrics-active-size', '20px');
                    this.panelElement.querySelector('#lyrics-font-val').textContent = '20px';
                    localStorage.setItem('ytLyrics_fontSize', '20');
                });

                addEvt('#lyrics-btn-cycle', 'click', () => {
                    let idx = this.apiOrder.indexOf(this.preferredApi);
                    this.preferredApi = this.apiOrder[(idx + 1) % this.apiOrder.length];
                    GM_setValue('preferredApi', this.preferredApi);
                    this.updateControlsUI();
                    this.fetchLyrics(true);
                });
            }, 100);
        },
        updateControlsUI() {
            const get = id => this.panelElement.querySelector(id);
            if (get('#lyrics-btn-sync')) get('#lyrics-btn-sync').classList.toggle('active', this.karaokeMode);
            if (get('#lyrics-btn-catcher')) get('#lyrics-btn-catcher').classList.toggle('active', this.catcherMode);
            if (get('#lyrics-btn-cycle')) get('#lyrics-btn-cycle').title = `Cycle Lyrics API (Current: ${this.preferredApi})`;
        },
        showToast(msg) {
            let t = this.panelElement.querySelector('#lyrics-internal-toast');
            if(!t) return;
            t.textContent = msg;
            t.classList.add('show');
            clearTimeout(this.toastTimeout);
            this.toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
        },
        onVideoChange(videoId, forceFetch = false) {
            this.currentLyrics = [];
            this.lineElements = [];
            this.lastActiveIndex = -1;
            const content = this.panelElement?.querySelector('#lyrics-content');
            if (content) content.innerHTML = '<div class="lyrics-loading">Loading new track...</div>';

            if (videoId !== this.currentVideoId || forceFetch) {
                this.currentVideoId = videoId;
                if (this.panelElement && this.panelElement.style.display === 'flex') {
                    clearTimeout(this.fetchTimeout);
                    this.fetchTimeout = setTimeout(() => this.fetchLyrics(), 1500);
                }
            }
        },
        onShow() {
            const videoId = new URLSearchParams(window.location.search).get('v');
            if (videoId && (videoId !== this.currentVideoId || this.currentLyrics.length === 0)) {
                this.currentVideoId = videoId;
                clearTimeout(this.fetchTimeout);
                this.fetchTimeout = setTimeout(() => this.fetchLyrics(), 500);
            }
        },
        async fetchLyrics(force = false) {
            if (this.isFetching && !force) return;
            this.isFetching = true;

            const fetchId = this.currentVideoId;
            const content = this.panelElement.querySelector('#lyrics-content');
            content.innerHTML = '<div class="lyrics-loading">Searching for lyrics...</div>';

            try {
                const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, h2.slim-video-metadata-title');
                let videoTitle = titleEl ? titleEl.textContent : document.title.replace(' - YouTube', '');
                videoTitle = videoTitle.replace(/^\(\d+\)\s*/, '').trim();

                const songInfo = this.extractSongInfo(videoTitle);

                const pIdx = this.apiOrder.indexOf(this.preferredApi);
                const orderedApis = [ this.apiOrder[pIdx], ...this.apiOrder.slice(0, pIdx), ...this.apiOrder.slice(pIdx + 1) ];
                const apiFns = { 'LRCLIB': this.tryLRCLIB.bind(this), 'Genius': this.tryGeniusAPI.bind(this), 'Lyrics.ovh': this.tryLyricsOVH.bind(this), 'Textyl.co': this.tryTextylAPI.bind(this), 'Some Random API': this.trySomeRandomAPI.bind(this) };

                let lyrics = null; let source = null;
                for (const apiName of orderedApis) {
                    if (this.currentVideoId !== fetchId) { this.isFetching = false; return; }
                    lyrics = await apiFns[apiName](songInfo);
                    if (lyrics && lyrics.length > 0) { source = apiName; break; }
                }

                if (this.currentVideoId !== fetchId) { this.isFetching = false; return; }

                if (lyrics && lyrics.length > 0) {
                    this.currentLyrics = this.cleanLyrics(lyrics);
                    this.renderLyricsDOM();
                    const header = this.panelElement.querySelector('#lyrics-header-title');
                    if(header) header.textContent = `🎵 Lyrics (${source})`;
                } else {
                    content.innerHTML = '<div class="lyrics-loading" style="color:#ff4444;">No lyrics found.</div>';
                }
            } catch (e) {
                console.error('YTLucky Lyrics Error:', e);
                if (this.currentVideoId === fetchId) {
                    content.innerHTML = '<div class="lyrics-loading" style="color:#ff4444;">Failed to load lyrics.</div>';
                }
            }
            this.isFetching = false;
        },
        renderLyricsDOM() {
            const content = this.panelElement.querySelector('#lyrics-content');
            content.innerHTML = '';
            this.lineElements = [];
            this.lastActiveIndex = -1;

            this.currentLyrics.forEach((line, index) => {
                const el = document.createElement('div');
                el.className = 'lyrics-line';
                el.textContent = line.text;
                el.addEventListener('click', () => {
                    if (this.catcherMode) {
                        if (line.time !== undefined) {
                            const video = document.querySelector('video');
                            if (video) {
                                this.syncOffset = line.time - video.currentTime;
                                localStorage.setItem('ytLyrics_offset', this.syncOffset);

                                this.catcherMode = false;
                                this.karaokeMode = true;
                                localStorage.setItem('ytLyrics_karaoke', '1');
                                this.updateControlsUI();
                                this.startKaraokeLoop();

                                this.showToast(`Synced! Offset: ${this.syncOffset > 0 ? '+' : ''}${this.syncOffset.toFixed(1)}s`);
                            }
                        } else {
                            this.showToast("Line has no timestamp data!");
                        }
                    } else if (!this.karaokeMode) {
                        this.highlightLine(index, true);
                    } else {
                        if (line.time !== undefined) {
                            const video = document.querySelector('video');
                            if (video) video.currentTime = line.time - this.syncOffset;
                        }
                    }
                });
                this.lineElements.push(el);
                content.appendChild(el);
            });
            const spacer = document.createElement('div');
            spacer.style.height = '60%';
            content.appendChild(spacer);
        },
        highlightLine(index, scrollIntoView = true) {
            if (this.lastActiveIndex >= 0 && this.lineElements[this.lastActiveIndex]) {
                this.lineElements[this.lastActiveIndex].classList.remove('karaoke-active');
            }
            this.lastActiveIndex = index;
            const targetEl = this.lineElements[index];
            if (targetEl) {
                targetEl.classList.add('karaoke-active');
                if (scrollIntoView) {
                    const content = this.panelElement.querySelector('#lyrics-content');
                    const offset = targetEl.offsetTop - (content.clientHeight / 2) + (targetEl.clientHeight / 2);
                    content.scrollTo({ top: offset, behavior: 'smooth' });
                }
            }
        },
        startKaraokeLoop() {
            if (this.karaokeRaf) cancelAnimationFrame(this.karaokeRaf);

            const loop = () => {
                if (!this.karaokeMode || !this.panelElement || this.panelElement.style.display === 'none' || this.currentLyrics.length === 0) {
                    this.karaokeRaf = requestAnimationFrame(loop);
                    return;
                }
                const video = document.querySelector('video');
                if (!video || video.paused) {
                    this.karaokeRaf = requestAnimationFrame(loop);
                    return;
                }

                const time = video.currentTime + this.syncOffset;

                let activeIndex = -1;
                for(let i = 0; i < this.currentLyrics.length; i++) {
                    const line = this.currentLyrics[i];
                    const nextLine = this.currentLyrics[i+1];
                    if (line.time !== undefined) {
                        if (time >= line.time && (!nextLine || nextLine.time === undefined || time < nextLine.time)) {
                            activeIndex = i;
                            break;
                        }
                    }
                }

                if (activeIndex !== -1 && activeIndex !== this.lastActiveIndex) {
                    this.highlightLine(activeIndex, true);
                }
                this.karaokeRaf = requestAnimationFrame(loop);
            };
            this.karaokeRaf = requestAnimationFrame(loop);
        },
        cleanLyrics(lyricsArray) {
            if (lyricsArray.length > 0 && lyricsArray[0].text && lyricsArray[0].text.includes('Contributors')) lyricsArray.shift();
            return lyricsArray.filter(line => { const text = line.text.trim(); if (text.startsWith('[') && text.endsWith(']')) return false; if (text.length === 0) return false; return true; });
        },
        extractSongInfo(title) {
            let cleanTitle = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/(official video|official music video|lyrics|lyric video|audio|video|hd|4k|1080p|720p)/gi, '').replace(/[^\w\s\-&]/g, '').replace(/\s+/g, ' ').trim();
            const separators = [' - ', ' – ', ' — ', ' | ', ' • ', ' ~ ', ' by ']; let artist = ''; let song = cleanTitle;
            for (const sep of separators) { if (cleanTitle.includes(sep)) { const parts = cleanTitle.split(sep); if (parts.length >= 2) { artist = parts[0].trim(); song = parts.slice(1).join(sep).trim(); break; } } }
            if (!artist) { const featMatch = cleanTitle.match(/(.+?)\s+(?:ft|feat|featuring)\s+(.+)/i); if (featMatch) { artist = featMatch[1].trim(); song = featMatch[2].trim(); } }
            return { artist: artist || 'Unknown Artist', song: song || cleanTitle, cleanTitle: cleanTitle };
        },
        tryLRCLIB(songInfo) {
            return new Promise((resolve) => {
                const query = encodeURIComponent(`${songInfo.artist} ${songInfo.song}`);
                GM_xmlhttpRequest({
                    method: 'GET', url: `https://lrclib.net/api/search?q=${query}`, timeout: 10000,
                    onload: (res) => {
                        if(res.status === 200) {
                            try {
                                const data = JSON.parse(res.responseText);
                                if (data && data.length > 0) {
                                    const best = data.find(d => d.syncedLyrics);
                                    if (best) resolve(this.parseLRCLyrics(best.syncedLyrics));
                                    else if(data[0].plainLyrics) resolve(this.parseSimpleLyrics(data[0].plainLyrics));
                                    else resolve(null);
                                    return;
                                }
                            } catch(e) {}
                        } resolve(null);
                    },
                    onerror: () => resolve(null), ontimeout: () => resolve(null)
                });
            });
        },
        parseLRCLyrics(lrcText) {
            const lines = lrcText.split('\n'); const result = [];
            const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
            lines.forEach(line => {
                const match = timeRegex.exec(line);
                if (match) {
                    const min = parseInt(match[1], 10); const sec = parseInt(match[2], 10); const ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
                    const time = min * 60 + sec + ms / 1000;
                    const text = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
                    if (text) result.push({ time, text });
                }
            });
            return result;
        },
        tryGeniusAPI(songInfo) {
            return new Promise((resolve) => {
                const query = encodeURIComponent(`${songInfo.artist} ${songInfo.song}`);
                GM_xmlhttpRequest({ method: 'GET', url: `https://api.genius.com/search?q=${query}`, headers: { 'Authorization': `Bearer ${this.geniusCredentials.accessToken}` }, timeout: 10000,
                    onload: (response) => { if (response.status === 200) { try { const data = JSON.parse(response.responseText); if (data.response.hits && data.response.hits.length > 0) { const song = data.response.hits[0].result; this.fetchGeniusLyrics(song.url).then(lyrics => resolve(lyrics || null)); } else { resolve(null); } } catch (e) { resolve(null); } } else { resolve(null); } },
                    onerror: () => resolve(null), ontimeout: () => resolve(null)
                });
            });
        },
        async fetchGeniusLyrics(songUrl) {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({ method: 'GET', url: songUrl, timeout: 15000,
                    onload: (response) => { if (response.status === 200) { try { const parser = new DOMParser(); const doc = parser.parseFromString(response.responseText, 'text/html'); const lyricsContainers = doc.querySelectorAll('[data-lyrics-container="true"]'); let lyricsText = ''; lyricsContainers.forEach(container => { const clone = container.cloneNode(true); clone.querySelectorAll('br').forEach(br => br.replaceWith('\n')); clone.querySelectorAll('*').forEach(el => { if (el.tagName.toLowerCase() === 'a') el.replaceWith(el.textContent); }); lyricsText += clone.textContent + '\n\n'; }); if (lyricsText.trim()) { resolve(this.parseSimpleLyrics(lyricsText)); } else { resolve(null); } } catch (e) { resolve(null); } } else { resolve(null); } },
                    onerror: () => resolve(null), ontimeout: () => resolve(null)
                });
            });
        },
        tryLyricsOVH(songInfo) {
            return new Promise((resolve) => {
                const artist = encodeURIComponent(songInfo.artist); const title = encodeURIComponent(songInfo.song);
                GM_xmlhttpRequest({ method: 'GET', url: `https://api.lyrics.ovh/v1/${artist}/${title}`, timeout: 10000,
                    onload: (response) => { if (response.status === 200) { try { const data = JSON.parse(response.responseText); if (data.lyrics) resolve(this.parseSimpleLyrics(data.lyrics)); else resolve(null); } catch (e) { resolve(null); } } else { resolve(null); } },
                    onerror: () => resolve(null), ontimeout: () => resolve(null)
                });
            });
        },
        tryTextylAPI(songInfo) {
            return new Promise((resolve) => {
                const query = encodeURIComponent(`${songInfo.artist} ${songInfo.song}`);
                GM_xmlhttpRequest({ method: 'GET', url: `https://api.textyl.co/api/lyrics?q=${query}`, timeout: 10000,
                    onload: (response) => { if (response.status === 200) { try { const data = JSON.parse(response.responseText); if (data.lyrics) resolve(this.parseSimpleLyrics(data.lyrics)); else resolve(null); } catch (e) { resolve(null); } } else { resolve(null); } },
                    onerror: () => resolve(null), ontimeout: () => resolve(null)
                });
            });
        },
        trySomeRandomAPI(songInfo) {
            return new Promise((resolve) => {
                const artist = encodeURIComponent(songInfo.artist); const title = encodeURIComponent(songInfo.song);
                GM_xmlhttpRequest({ method: 'GET', url: `https://some-random-api.com/lyrics?title=${title}&artist=${artist}`, timeout: 10000,
                    onload: (response) => { if (response.status === 200) { try { const data = JSON.parse(response.responseText); if (data.lyrics) resolve(this.parseSimpleLyrics(data.lyrics)); else resolve(null); } catch (e) { resolve(null); } } else { resolve(null); } },
                    onerror: () => resolve(null), ontimeout: () => resolve(null)
                });
            });
        },
        parseSimpleLyrics(lyricsText) { const lines = lyricsText.split('\n').map(line => line.replace(/\[\d+:\d+\.\d+\]\s*/, '').trim()).filter(line => line.length > 0); return lines.map(line => ({ text: line })); }
    };

    // ==========================================
    // MODULE 3: AI SONG EXPLAINER (AIEx) & TYPEWRITER
    // ==========================================
    let currentTypingId = 0;

    function formatMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/^### (.*$)/gim, '<h4 style="color:#0288d1;margin:10px 0 4px 0;">$1</h4>')
            .replace(/^## (.*$)/gim, '<h3 style="color:#0288d1;margin:12px 0 6px 0;">$1</h3>')
            .replace(/^# (.*$)/gim, '<h2 style="color:#0288d1;margin:14px 0 8px 0;">$1</h2>')
            .replace(/\n/g, '<br>');
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
                    const delay = speed + (Math.random() * 4 - 2);
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
    }

    function buildEnhancedSongPrompt(songTitle, artist) {
        return `You are an elite musicologist, cultural critic, and lyrical analyst acting as an expert song explainer.

Analyze the song: "${songTitle}" by "${artist}".

Provide a comprehensive, fluid, and engaging breakdown covering:
1. Core Narrative & Meaning: Explore the central message, emotional arc, subtext, and hidden or symbolic metaphors within the lyrics.
2. Musical Composition & Production: Detail how the instrumentation, chord structure, tempo, production nuances, and vocal delivery reinforce the lyrical theme.
3. Cultural & Historical Impact: The context in which it was released, audience reception, critical response, and lasting cultural significance.
4. Artist Discography & Career Arc: How this song fits into ${artist}'s career evolution, artistic growth, and overall discography.
5. Comparisons & Echoes: Relate the track to similar thematic or stylistic works by other artists.

Guidelines:
- Keep the analysis deeply insightful, sophisticated, and fluid without rigid or repetitive section headings.
- Format with clean Markdown (bolding key concepts and italicizing quotes or musical phrases).
- Maintain an engaging and articulate tone.`;
    }

    const YtAIExplainer = {
        panelElement: null,
        lastExplainedKey: '',

        init() {
            if (this.panelElement) return;
            const panel = document.createElement('div');
            panel.id = 'yt-aiex-panel';
            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
                    <span style="font-weight:bold; color:#0288d1; font-size:13px;">💡 Song Explainer (AIEx)</span>
                    <button id="aiex-reload-btn" style="background:#0288d1; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:bold;">🔄 Explain</button>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px; padding-bottom:2px;">
                    <div id="aiex-song-header" style="font-size:11px; color:#aaa; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; margin-right:8px;">No song active</div>
                    <button id="aiex-copy-btn" title="Copy explanation to clipboard" style="background:#333; color:#fff; border:none; border-radius:4px; padding:2px 7px; font-size:10px; cursor:pointer; flex-shrink:0;">📋 Copy</button>
                </div>
                <div id="aiex-content">Switch to the AIEx tab to view an insightful breakdown of the currently playing video/song.</div>
            `;
            this.panelElement = panel;

            panel.querySelector('#aiex-reload-btn').onclick = () => {
                this.explainCurrentSong(true);
            };

            const copyBtn = panel.querySelector('#aiex-copy-btn');
            copyBtn.onclick = () => {
                const content = panel.querySelector('#aiex-content');
                if (!content || !content.innerText.trim()) return;

                navigator.clipboard.writeText(content.innerText.trim()).then(() => {
                    copyBtn.textContent = '✓ Copied!';
                    copyBtn.style.color = '#0288d1';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy';
                        copyBtn.style.color = '#fff';
                    }, 2000);
                }).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = content.innerText.trim();
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    copyBtn.textContent = '✓ Copied!';
                    copyBtn.style.color = '#0288d1';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy';
                        copyBtn.style.color = '#fff';
                    }, 2000);
                });
            };
        },

        getCurrentSong() {
            const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, h2.slim-video-metadata-title');
            let videoTitle = titleEl ? titleEl.textContent : document.title.replace(' - YouTube', '');
            videoTitle = videoTitle.replace(/^\(\d+\)\s*/, '').trim();
            return YtLyrics.extractSongInfo(videoTitle);
        },

        explainCurrentSong(force = false) {
            const info = this.getCurrentSong();
            if (!info || !info.song) {
                this.panelElement.querySelector('#aiex-content').innerHTML = '<span style="color:#888;">No active track title found on this page.</span>';
                return;
            }

            const trackKey = `${info.artist} - ${info.song}`;
            if (trackKey === this.lastExplainedKey && !force) return;

            this.lastExplainedKey = trackKey;
            this.panelElement.querySelector('#aiex-song-header').textContent = `Analyzing: "${info.song}" by ${info.artist}`;
            const content = this.panelElement.querySelector('#aiex-content');
            content.innerHTML = `<div><span class="yt-loading-pulse"></span> Analyzing meaning, composition & cultural context…</div>`;

            const prompt = buildEnhancedSongPrompt(info.song, info.artist);
            const provider = aiSettings.provider;

            const handleOutput = (text) => {
                const formatted = formatMarkdown(text);
                if (aiSettings.typewriterEnabled) {
                    typeWriteHTML(content, formatted, aiSettings.typewriterSpeed || 10);
                } else {
                    content.innerHTML = formatted;
                }
            };

            const handleError = (errMsg) => {
                content.innerHTML = `<span style="color:#ff5252;"><b>AI Error:</b> ${errMsg}</span><br><br><span style="color:#aaa;">Check your API Key & Model in AI Settings (⚙️).</span>`;
            };

            if (provider === 'gemini') {
                if (!aiSettings.geminiApiKey) return handleError("Gemini API key is missing. Click ⚙️ to configure.");
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `https://generativelanguage.googleapis.com/v1beta/models/${aiSettings.geminiModel || 'gemini-2.5-flash-lite'}:generateContent`,
                    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': aiSettings.geminiApiKey },
                    data: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
                    responseType: 'json',
                    timeout: 30000,
                    onload: (res) => {
                        const candidate = res.response?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (candidate) handleOutput(candidate.trim());
                        else handleError(res.response?.error?.message || `HTTP ${res.status}`);
                    },
                    onerror: () => handleError("Network connection failure with Gemini."),
                    ontimeout: () => handleError("Gemini request timed out.")
                });
                return;
            }

            const oaiConfigs = {
                openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: aiSettings.openrouterApiKey, model: aiSettings.openrouterModel },
                groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: aiSettings.groqApiKey, model: aiSettings.groqModel },
                cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', key: aiSettings.cerebrasApiKey, model: aiSettings.cerebrasModel }
            };

            const cfg = oaiConfigs[provider];
            if (!cfg || !cfg.key) return handleError(`${provider.toUpperCase()} API key is missing. Click ⚙️ to configure.`);

            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` };
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = window.location.origin || 'https://github.com';
                headers['X-Title'] = 'YouTubeLuckyPlaylist';
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: cfg.url,
                headers: headers,
                data: JSON.stringify({
                    model: cfg.model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 2800
                }),
                responseType: 'json',
                timeout: 30000,
                onload: (res) => {
                    const text = res.response?.choices?.[0]?.message?.content;
                    if (text) handleOutput(text.trim());
                    else handleError(res.response?.error?.message || `API Error: ${res.status}`);
                },
                onerror: () => handleError(`Network error contacting ${provider}.`),
                ontimeout: () => handleError(`${provider} request timed out.`)
            });
        }
    };

    // ==========================================
    // MODULE 4: AI SETTINGS PANEL
    // ==========================================
    const YtAISettings = {
        panelElement: null,

        init() {
            if (this.panelElement) return;
            const panel = document.createElement('div');
            panel.id = 'yt-aisettings-panel';
            panel.innerHTML = `
                <div style="font-weight:bold; color:#0288d1; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:13px;">⚙️ AI Configuration</span>
                    <button id="yt-ai-save-btn" style="background:#0288d1; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:bold;">Save Settings</button>
                </div>
                <div style="overflow-y:auto; flex:1; padding-right:4px;">
                    <div class="yt-ai-group">
                        <label>Active Provider</label>
                        <select id="yt-ai-cfg-provider">
                            <option value="gemini" ${aiSettings.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                            <option value="openrouter" ${aiSettings.provider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                            <option value="groq" ${aiSettings.provider === 'groq' ? 'selected' : ''}>Groq</option>
                            <option value="cerebras" ${aiSettings.provider === 'cerebras' ? 'selected' : ''}>Cerebras</option>
                        </select>
                    </div>

                    <!-- Gemini -->
                    <div id="yt-ai-group-gemini" class="yt-ai-provider-sub" style="display: ${aiSettings.provider === 'gemini' ? 'block' : 'none'};">
                        <div class="yt-ai-group"><label>Gemini API Key</label><input type="password" id="yt-ai-cfg-gemini-key" value="${aiSettings.geminiApiKey || ''}"></div>
                        <div class="yt-ai-group"><label>Gemini Model</label>
                            <select id="yt-ai-cfg-gemini-model-sel">${AI_MODEL_OPTIONS.gemini.map(m => `<option value="${m}" ${aiSettings.geminiModel === m ? 'selected' : ''}>${m}</option>`).join('')}<option value="custom" ${!AI_MODEL_OPTIONS.gemini.includes(aiSettings.geminiModel) ? 'selected' : ''}>Custom...</option></select>
                            <input type="text" id="yt-ai-cfg-gemini-model" value="${aiSettings.geminiModel}" style="margin-top:4px;">
                        </div>
                    </div>

                    <!-- OpenRouter -->
                    <div id="yt-ai-group-openrouter" class="yt-ai-provider-sub" style="display: ${aiSettings.provider === 'openrouter' ? 'block' : 'none'};">
                        <div class="yt-ai-group"><label>OpenRouter API Key</label><input type="password" id="yt-ai-cfg-openrouter-key" value="${aiSettings.openrouterApiKey || ''}"></div>
                        <div class="yt-ai-group"><label>OpenRouter Model</label>
                            <select id="yt-ai-cfg-openrouter-model-sel">${AI_MODEL_OPTIONS.openrouter.map(m => `<option value="${m}" ${aiSettings.openrouterModel === m ? 'selected' : ''}>${m}</option>`).join('')}<option value="custom" ${!AI_MODEL_OPTIONS.openrouter.includes(aiSettings.openrouterModel) ? 'selected' : ''}>Custom...</option></select>
                            <input type="text" id="yt-ai-cfg-openrouter-model" value="${aiSettings.openrouterModel}" style="margin-top:4px;">
                        </div>
                    </div>

                    <!-- Groq -->
                    <div id="yt-ai-group-groq" class="yt-ai-provider-sub" style="display: ${aiSettings.provider === 'groq' ? 'block' : 'none'};">
                        <div class="yt-ai-group"><label>Groq API Key</label><input type="password" id="yt-ai-cfg-groq-key" value="${aiSettings.groqApiKey || ''}"></div>
                        <div class="yt-ai-group"><label>Groq Model</label>
                            <select id="yt-ai-cfg-groq-model-sel">${AI_MODEL_OPTIONS.groq.map(m => `<option value="${m}" ${aiSettings.groqModel === m ? 'selected' : ''}>${m}</option>`).join('')}<option value="custom" ${!AI_MODEL_OPTIONS.groq.includes(aiSettings.groqModel) ? 'selected' : ''}>Custom...</option></select>
                            <input type="text" id="yt-ai-cfg-groq-model" value="${aiSettings.groqModel}" style="margin-top:4px;">
                        </div>
                    </div>

                    <!-- Cerebras -->
                    <div id="yt-ai-group-cerebras" class="yt-ai-provider-sub" style="display: ${aiSettings.provider === 'cerebras' ? 'block' : 'none'};">
                        <div class="yt-ai-group"><label>Cerebras API Key</label><input type="password" id="yt-ai-cfg-cerebras-key" value="${aiSettings.cerebrasApiKey || ''}"></div>
                        <div class="yt-ai-group"><label>Cerebras Model</label>
                            <select id="yt-ai-cfg-cerebras-model-sel">${AI_MODEL_OPTIONS.cerebras.map(m => `<option value="${m}" ${aiSettings.cerebrasModel === m ? 'selected' : ''}>${m}</option>`).join('')}<option value="custom" ${!AI_MODEL_OPTIONS.cerebras.includes(aiSettings.cerebrasModel) ? 'selected' : ''}>Custom...</option></select>
                            <input type="text" id="yt-ai-cfg-cerebras-model" value="${aiSettings.cerebrasModel}" style="margin-top:4px;">
                        </div>
                    </div>

                    <!-- Typewriter Settings -->
                    <div style="border-top:1px solid #333; margin-top:8px; padding-top:8px;">
                        <div class="yt-ai-group" style="flex-direction:row; align-items:center; justify-content:space-between;">
                            <label for="yt-ai-cfg-typewriter" style="cursor:pointer;">Enable Typewriter Effect</label>
                            <input type="checkbox" id="yt-ai-cfg-typewriter" ${aiSettings.typewriterEnabled ? 'checked' : ''} style="width:auto; cursor:pointer;">
                        </div>
                        <div class="yt-ai-group">
                            <label>Typewriter Speed (ms per char)</label>
                            <input type="number" id="yt-ai-cfg-typespeed" value="${aiSettings.typewriterSpeed || 10}" min="1" max="50">
                        </div>
                    </div>
                </div>
                <div id="yt-ai-save-msg" style="font-size:11px; color:#0288d1; display:none;">✓ Settings Saved Successfully!</div>
            `;
            this.panelElement = panel;

            const pSel = panel.querySelector('#yt-ai-cfg-provider');
            pSel.onchange = () => {
                ['gemini', 'openrouter', 'groq', 'cerebras'].forEach(p => {
                    panel.querySelector(`#yt-ai-group-${p}`).style.display = (pSel.value === p) ? 'block' : 'none';
                });
            };

            const linkSel = (selId, inpId) => {
                const s = panel.querySelector('#' + selId);
                const i = panel.querySelector('#' + inpId);
                if (s && i) {
                    s.onchange = () => {
                        if (s.value !== 'custom') i.value = s.value;
                        else i.focus();
                    };
                }
            };
            linkSel('yt-ai-cfg-gemini-model-sel', 'yt-ai-cfg-gemini-model');
            linkSel('yt-ai-cfg-openrouter-model-sel', 'yt-ai-cfg-openrouter-model');
            linkSel('yt-ai-cfg-groq-model-sel', 'yt-ai-cfg-groq-model');
            linkSel('yt-ai-cfg-cerebras-model-sel', 'yt-ai-cfg-cerebras-model');

            panel.querySelector('#yt-ai-save-btn').onclick = () => {
                aiSettings.provider = pSel.value;
                aiSettings.geminiApiKey = panel.querySelector('#yt-ai-cfg-gemini-key').value.trim();
                aiSettings.geminiModel = panel.querySelector('#yt-ai-cfg-gemini-model').value.trim();
                aiSettings.openrouterApiKey = panel.querySelector('#yt-ai-cfg-openrouter-key').value.trim();
                aiSettings.openrouterModel = panel.querySelector('#yt-ai-cfg-openrouter-model').value.trim();
                aiSettings.groqApiKey = panel.querySelector('#yt-ai-cfg-groq-key').value.trim();
                aiSettings.groqModel = panel.querySelector('#yt-ai-cfg-groq-model').value.trim();
                aiSettings.cerebrasApiKey = panel.querySelector('#yt-ai-cfg-cerebras-key').value.trim();
                aiSettings.cerebrasModel = panel.querySelector('#yt-ai-cfg-cerebras-model').value.trim();
                aiSettings.typewriterEnabled = panel.querySelector('#yt-ai-cfg-typewriter').checked;
                aiSettings.typewriterSpeed = parseInt(panel.querySelector('#yt-ai-cfg-typespeed').value, 10) || 10;
                saveAiSettings();

                const msg = panel.querySelector('#yt-ai-save-msg');
                msg.style.display = 'block';
                setTimeout(() => { msg.style.display = 'none'; }, 2200);
            };
        }
    };

    // ==========================================
    // MODULE 5: ANCHOR EDGE PLAYER LOGIC
    // ==========================================
    const YtAnchor = {
        anchored: false, spacerEl: null, debounceTimer: null,
        q: sel => document.querySelector(sel),
        isWatch: () => location.pathname === '/watch',
        ensureSpacer() {
            if (this.spacerEl && this.spacerEl.isConnected) return this.spacerEl;
            this.spacerEl = document.getElementById('yt-anchor-spacer');
            if (!this.spacerEl) { this.spacerEl = document.createElement('div'); this.spacerEl.id = 'yt-anchor-spacer'; }
            const below = this.q('#below'); if (below && below.parentNode) below.parentNode.insertBefore(this.spacerEl, below);
            return this.spacerEl;
        },
        anchor() {
            if (!this.isWatch()) return;
            const player = this.q('#movie_player'); if (!player) return;
            if (player.style.position === 'fixed') return;

            const rect = player.getBoundingClientRect();
            const w = Math.round(rect.width || player.offsetWidth);
            const h = Math.round(rect.height || player.offsetHeight);

            player.style.position = 'fixed';
            player.style.left = ANCHOR_CFG.leftOffset + 'px';
            player.style.top = ANCHOR_CFG.topOffset + 'px';
            player.style.width = w + 'px';
            player.style.height = h + 'px';
            player.style.zIndex = String(ANCHOR_CFG.zIndex);

            const spacer = this.ensureSpacer();
            const spacerHeight = ANCHOR_CFG.topOffset + h + 16;
            spacer.style.height = spacerHeight + 'px'; spacer.style.display = 'block';

            const primary = this.q('#primary');
            if (primary) primary.style.paddingLeft = (ANCHOR_CFG.leftOffset + w + 16) + 'px';

            this.anchored = true;
            localStorage.setItem('yt_lucky_anchor_persisted', '1');
            this.updateUI();
        },
        unanchor() {
            const player = this.q('#movie_player');
            if (player) {
                player.style.position = '';
                player.style.left = '';
                player.style.top = '';
                player.style.width = '';
                player.style.height = '';
                player.style.zIndex = '';
            }
            const primary = this.q('#primary'); if (primary) primary.style.paddingLeft = '';
            if (this.spacerEl) { this.spacerEl.style.display = 'none'; this.spacerEl.style.height = '0'; }

            this.anchored = false;
            localStorage.setItem('yt_lucky_anchor_persisted', '0');
            this.updateUI();
        },
        toggle() { this.anchored ? this.unanchor() : this.anchor(); },
        updateUI() {
            const btn = document.getElementById('yt-lucky-anchor-btn');
            if (btn) btn.textContent = this.anchored ? 'Anchor: ON' : 'Anchor: OFF';
            const scrollBtn = document.getElementById('yt-anchor-scroll-top');
            if (scrollBtn) scrollBtn.style.display = this.anchored ? 'block' : 'none';
        },
        init() {
            window.addEventListener('resize', () => { if (this.anchored) { this.unanchor(); this.anchor(); } });
            window.addEventListener('yt-navigate-finish', () => {
                if (!this.isWatch()) { if (this.anchored) this.unanchor(); return; }
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    if (localStorage.getItem('yt_lucky_anchor_persisted') === '1') {
                        if (this.anchored) this.unanchor();
                        this.anchor();
                    } else {
                        this.unanchor();
                    }
                }, ANCHOR_CFG.debounceMs);
            });
            if (!document.getElementById('yt-anchor-scroll-top')) {
                const st = document.createElement('button'); st.id = 'yt-anchor-scroll-top';
                st.textContent = '▲ Player'; st.title = 'Scroll back to the top to see the player';
                st.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
                document.body.appendChild(st);
            }
            if (localStorage.getItem('yt_lucky_anchor_persisted') === '1') {
                setTimeout(() => this.anchor(), 2000);
            }
        }
    };

    // ==========================================
    // MODULE 6: POTPLAYER BUILDER LOGIC
    // ==========================================
    const YtPotPlayer = {
        state: { running: false, stopped: false, videoIds: [], matched: [], failed: [], total: 0, current: 0, resolvedUrl: '', playlistName: '' },
        panelElement: null,
        init() { this.buildUI(); },
        buildUI() {
            if (this.panelElement) return;

            const panel = document.createElement('div');
            panel.id = 'ptb-panel';
            panel.innerHTML = `
              <div id="ptb-header">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <div id="ptb-header-text"><h3>PotPlayer Playlist Builder</h3><p>Paste tracks → search → stream or save</p></div>
              </div>
              <div id="ptb-body">
                <div id="ptb-input-section">
                  <label>Track list (one per line)</label>
                  <textarea id="ptb-textarea" placeholder="Artist - Song Title&#10;Song Title only&#10;https://youtu.be/VIDEO_ID&#10;# comments are ignored"></textarea>
                  <div id="ptb-name-row">
                    <div style="flex:1"><label>Playlist name</label><input id="ptb-name" type="text" placeholder="PotPlayer Mix" /></div>
                    <button id="ptb-run">▶ Build</button>
                  </div>
                </div>
                <div id="ptb-progress-wrap">
                  <div id="ptb-progress-bar-bg"><div id="ptb-progress-bar"></div></div>
                  <div id="ptb-progress-label"><span id="ptb-progress-count">0 / 0</span><span id="ptb-progress-pct">0%</span></div>
                  <div id="ptb-current-track">Searching…</div><button id="ptb-stop">■ Stop</button>
                </div>
                <div id="ptb-result">
                  <div id="ptb-result-title"></div>
                  <div class="ptb-url-label">🎵 PotPlayer URL <span id="ptb-url-warning" style="color:#ffcc00; font-size:10px; display:none;">(YT limits URLs to 50 tracks)</span></div>
                  <div id="ptb-url-box" class="ptb-url-box resolving" title="Click to copy">⏳ Resolving permanent URL…</div>

                  <div id="ptb-result-actions" style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; gap:8px; width:100%;">
                        <button class="ptb-action-btn" id="ptb-copy-btn" disabled title="Copy 1st part URL">📋 Copy 1st Part</button>
                        <button class="ptb-action-btn" id="ptb-copy-parts-btn" disabled title="Copy all shortened chunk URLs">📋 Copy ALL Parts</button>
                    </div>
                    <div id="ptb-open-btn-container" style="display:flex; gap:8px; flex-wrap:wrap; width:100%;"></div>
                    <div style="display:flex; gap:8px; width:100%;">
                        <button class="ptb-action-btn" id="ptb-m3u8-btn" disabled style="background:#009688; color:#fff;">💾 Download .m3u8</button>
                        <button class="ptb-action-btn" id="ptb-new-btn">↺ New</button>
                    </div>
                  </div>

                  <button id="ptb-save-toggle" disabled>💾 How to save to my account →</button>
                  <div id="ptb-save-hint">
                    <div id="ptb-save-hint-title">Save this playlist to your YouTube account</div>
                    <ol id="ptb-save-steps"><li>Click <span>Open playlist in YouTube</span> below</li><li>In the new tab, click the <span>⋮ More</span> menu under the playlist title</li><li>Click <span>Save to playlist</span> → <span>Create new playlist</span></li><li>Done — it appears permanently in your <span>Library</span></li></ol>
                    <button id="ptb-save-open-btn" disabled>▶ Open playlist in YouTube</button>
                  </div>
                  <details id="ptb-failed" style="display:none"><summary>⚠ Unmatched/Failed tracks (<span id="ptb-fail-count">0</span>)</summary><ul id="ptb-fail-list"></ul></details>
                </div>
              </div>
            `;
            const toast = document.createElement('div'); toast.id = 'ptb-toast';
            this.panelElement = panel;
            document.body.append(toast);

            setTimeout(() => {
                const addEvent = (id, evt, fn) => { const el = document.getElementById(id); if(el) el.addEventListener(evt, fn); };
                addEvent('ptb-run', 'click', () => this.onRun());
                addEvent('ptb-stop', 'click', () => this.onStop());
                addEvent('ptb-copy-btn', 'click', () => this.onCopy());
                addEvent('ptb-copy-parts-btn', 'click', () => this.onCopyAllParts());
                addEvent('ptb-url-box', 'click', () => this.onCopy());
                addEvent('ptb-m3u8-btn', 'click', () => this.onDownloadM3u8());
                addEvent('ptb-new-btn', 'click', () => this.onReset());
                addEvent('ptb-save-toggle', 'click', () => {
                    const hint = document.getElementById('ptb-save-hint'); hint.classList.toggle('visible');
                    document.getElementById('ptb-save-toggle').textContent = hint.classList.contains('visible') ? '💾 How to save to my account ↑' : '💾 How to save to my account →';
                });
                addEvent('ptb-save-open-btn', 'click', () => this.openResolved());

                const saved = GM_getValue('ptb_tracks', '');
                if (saved) {
                    const ta = document.getElementById('ptb-textarea');
                    if (ta) ta.value = saved;
                }
            }, 500);
        },
        async searchVideo(query) {
            const key = window.ytcfg?.get?.('INNERTUBE_API_KEY') || PTB_CFG.INNERTUBE_KEY;
            const resp = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${key}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: { client: PTB_CFG.INNERTUBE_CLIENT }, query, params: 'EgIQAQ%3D%3D' }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
            const videos = [];
            for (const section of contents) {
                for (const item of (section?.itemSectionRenderer?.contents ?? [])) {
                    const vr = item?.videoRenderer; if (!vr?.videoId) continue;
                    videos.push({ id: vr.videoId, title: vr.title?.runs?.[0]?.text ?? '' });
                    if (videos.length >= PTB_CFG.MAX_RESULTS) break;
                }
                if (videos.length >= PTB_CFG.MAX_RESULTS) break;
            }
            return videos;
        },
        bestMatch(videos, query) {
            if (!videos.length) return null;
            const words = query.toLowerCase().split(/\s+/);
            let best = videos[0], bestScore = -1;
            for (const v of videos) { const score = words.reduce((s, w) => s + (v.title.toLowerCase().includes(w) ? 1 : 0), 0); if (score > bestScore) { bestScore = score; best = v; } }
            return best;
        },
        resolveWatchVideosUrl(watchVideosUrl) {
            return new Promise(resolve => {
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none;'; iframe.src = watchVideosUrl;
                const done = result => { clearTimeout(timer); iframe.remove(); resolve(result); };
                const timer = setTimeout(() => done(watchVideosUrl), 8000);
                iframe.addEventListener('load', () => { try { const landed = iframe.contentWindow.location.href; done(landed && landed !== 'about:blank' ? landed : watchVideosUrl); } catch { done(watchVideosUrl); } });
                document.body.appendChild(iframe);
            });
        },
        parseLines(text) {
            const YT_URL_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;
            return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
                const m = YT_URL_RE.exec(l); return m ? { query: l, videoId: m[1] } : { query: l, videoId: null };
            });
        },
        setProgress(done, total, label) {
            const pct = total ? Math.round((done / total) * 100) : 0;
            document.getElementById('ptb-progress-bar').style.width = pct + '%';
            document.getElementById('ptb-progress-count').textContent = `${done} / ${total}`;
            document.getElementById('ptb-progress-pct').textContent = pct + '%';
            document.getElementById('ptb-current-track').textContent = label;
        },
        showToast(msg, ms = 1800) { const t = document.getElementById('ptb-toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), ms); },
        showSection(which) {
            document.getElementById('ptb-input-section').style.display = which === 'input' ? '' : 'none';
            document.getElementById('ptb-progress-wrap').classList.toggle('visible', which === 'progress');
            document.getElementById('ptb-result').classList.toggle('visible', which === 'result');
        },
        unlockResultButtons(url) {
            ['ptb-copy-btn','ptb-m3u8-btn','ptb-save-toggle','ptb-save-open-btn'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = false; });
            const box = document.getElementById('ptb-url-box'); box.className = 'ptb-url-box'; box.textContent = url; box.dataset.url = url;
        },
        openResolved() { const url = document.getElementById('ptb-url-box').dataset.url; if (url) window.open(url, '_blank'); },
        async onRun() {
            const text = document.getElementById('ptb-textarea').value; const name = document.getElementById('ptb-name').value.trim() || 'PotPlayer Mix';
            const tracks = this.parseLines(text);
            if (!tracks.length) { this.showToast('⚠ No tracks found!'); return; }
            GM_setValue('ptb_tracks', text);
            this.state = { running:true, stopped:false, videoIds:[], matched:[], failed:this.state.failed || [], total:tracks.length, current:0, resolvedUrl:'', playlistName: name };
            ['ptb-run','ptb-copy-btn','ptb-copy-parts-btn','ptb-m3u8-btn','ptb-save-toggle','ptb-save-open-btn'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = true; });
            document.getElementById('ptb-save-hint').classList.remove('visible'); document.getElementById('ptb-save-toggle').textContent = '💾 How to save to my account →';
            this.showSection('progress'); this.setProgress(0, tracks.length, 'Starting…');

            const sleep = ms => new Promise(r => setTimeout(r, ms));
            for (let i = 0; i < tracks.length; i++) {
                if (this.state.stopped) break;
                const track = tracks[i]; this.setProgress(i, tracks.length, `🔍 ${track.query}`);
                try {
                    let vid = track.videoId;
                    let vTitle = track.query;
                    if (!vid) {
                        const results = await this.searchVideo(track.query);
                        const best = this.bestMatch(results, track.query);
                        if (best) { vid = best.id; vTitle = best.title; }
                    }
                    if (vid) {
                        this.state.videoIds.push(vid);
                        this.state.matched.push({ id: vid, title: vTitle });
                    } else this.state.failed.push(track.query);
                } catch (err) { console.warn('[PTB] search error:', err); this.state.failed.push(track.query + ' (error)'); }
                this.setProgress(i + 1, tracks.length, i + 1 < tracks.length ? `✓ ${track.query}` : 'Done!');
                if (i < tracks.length - 1 && !this.state.stopped) await sleep(PTB_CFG.DELAY_MS);
            }
            this.state.running = false; document.getElementById('ptb-run').disabled = false;
            if (!this.state.videoIds.length) { this.showToast('✗ No videos matched.', 3000); this.showSection('input'); return; }

            const added = this.state.videoIds.length, skipped = this.state.failed.length;
            document.getElementById('ptb-result-title').textContent = `✅ ${added} track${added !== 1 ? 's' : ''} matched` + (skipped ? ` · ${skipped} skipped` : '');

            const warnEl = document.getElementById('ptb-url-warning');
            if (added > 50) { warnEl.style.display = 'inline'; this.showToast('⚠ Over 50 tracks! Resolving multi-part URLs...', 4000); }
            else { warnEl.style.display = 'none'; }

            const failDetails = document.getElementById('ptb-failed');
            if (skipped) {
                failDetails.style.display = ''; document.getElementById('ptb-fail-count').textContent = skipped;
                const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                document.getElementById('ptb-fail-list').innerHTML = this.state.failed.map(f => `<li>${escHtml(f)}</li>`).join('');
            } else failDetails.style.display = 'none';

            const urlBox = document.getElementById('ptb-url-box'); urlBox.className = 'ptb-url-box resolving'; urlBox.textContent = '⏳ Resolving permanent URL…'; urlBox.dataset.url = '';
            this.showSection('result');

            const openContainer = document.getElementById('ptb-open-btn-container');
            if (openContainer) openContainer.innerHTML = '';

            const chunkUrls = [];
            const chunkBtns = [];
            const chunkSize = 50;

            for (let k = 0; k < this.state.videoIds.length; k += chunkSize) {
                const chunk = this.state.videoIds.slice(k, k + chunkSize);
                const chunkUrl = `https://www.youtube.com/watch_videos?video_ids=${chunk.join(',')}&title=${encodeURIComponent(name + (this.state.videoIds.length > 50 ? ' (Part ' + (Math.floor(k/chunkSize)+1) + ')' : ''))}`;
                chunkUrls.push(chunkUrl);

                const btn = document.createElement('button');
                btn.className = 'ptb-action-btn ptb-open-chunk-btn';
                btn.textContent = this.state.videoIds.length > 50 ? `▶ Open (${k+1}-${k+chunk.length})` : `▶ Open in YouTube`;
                btn.disabled = true;
                btn.dataset.tempUrl = chunkUrl;
                btn.onclick = () => window.open(btn.dataset.resolvedUrl || btn.dataset.tempUrl, '_blank');
                if (openContainer) openContainer.appendChild(btn);
                chunkBtns.push(btn);
            }

            this.resolveWatchVideosUrl(chunkUrls[0]).then(firstResolved => {
                this.state.resolvedUrl = firstResolved;
                this.unlockResultButtons(firstResolved);

                chunkBtns[0].dataset.resolvedUrl = firstResolved;
                chunkBtns[0].disabled = false;

                if (added <= 50) {
                    const copyPartsBtn = document.getElementById('ptb-copy-parts-btn');
                    if (copyPartsBtn) copyPartsBtn.disabled = false;
                    this.showToast('✓ URL ready — paste into PotPlayer (Ctrl+U)!', 2800);
                } else {
                    this.showToast('✓ 1st URL ready! Shortening remaining parts...', 3500);

                    let p = Promise.resolve();
                    for (let i = 1; i < chunkUrls.length; i++) {
                        p = p.then(() => this.resolveWatchVideosUrl(chunkUrls[i])).then(resolved => {
                            chunkBtns[i].dataset.resolvedUrl = resolved;
                            chunkBtns[i].disabled = false;
                        });
                    }

                    p.then(() => {
                        const copyPartsBtn = document.getElementById('ptb-copy-parts-btn');
                        if (copyPartsBtn) copyPartsBtn.disabled = false;
                        this.showToast('✓ All parts shortened & ready to copy!', 4000);
                    });
                }
            });
        },
        onDownloadM3u8() {
            if (!this.state.matched || !this.state.matched.length) return;
            let m3u8Content = "#EXTM3U\n";
            this.state.matched.forEach(track => {
                m3u8Content += `#EXTINF:-1,${track.title}\nhttps://www.youtube.com/watch?v=${track.id}\n`;
            });
            const blob = new Blob([m3u8Content], { type: 'application/vnd.apple.mpegurl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = (this.state.playlistName || 'PotPlayer Mix').replace(/[<>:"/\\|?*]+/g, '_');
            a.download = `${safeName}.m3u8`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
            this.showToast('✓ .m3u8 downloaded!');
        },
        onCopyAllParts() {
            const buttons = document.querySelectorAll('.ptb-open-chunk-btn');
            if (!buttons.length) return;
            const urls = Array.from(buttons).map(b => b.dataset.resolvedUrl || b.dataset.tempUrl).join('\n');
            navigator.clipboard.writeText(urls).then(() => this.showToast('✓ Copied all shortened links!'), () => { prompt('Copy these URLs:', urls); });
        },
        onStop() { this.state.stopped = true; this.showToast('Stopping after current track…'); },
        onCopy() { const url = document.getElementById('ptb-url-box').dataset.url; if (!url) { this.showToast('URL not ready yet…'); return; } navigator.clipboard.writeText(url).then(() => this.showToast('✓ Copied!'), () => { prompt('Copy this URL:', url); }); },
        onReset() { this.showSection('input'); ['ptb-result','ptb-progress-wrap'].forEach(id => document.getElementById(id).classList.remove('visible')); document.getElementById('ptb-save-hint').classList.remove('visible'); document.getElementById('ptb-save-toggle').textContent = '💾 How to save to my account →'; }
    };

    // ==========================================
    // MODULE 7: LUCKY PLAYLIST LOGIC
    // ==========================================
    const STORAGE_PLAYLISTS = 'yt_lucky_playlists_v4';
    const STORAGE_ACTIVE_TAB = 'yt_lucky_active_tab_v4';
    const STORAGE_LOCK_MODE = 'yt_lucky_lock_mode_v4';
    const STORAGE_SCROLL = 'yt_lucky_playlist_scroll_v4';
    const STORAGE_LAST_INDEX = 'yt_lucky_playlist_last_index_v4';
    const STORAGE_AUTOPLAY_ENABLED = 'yt_lucky_playlist_autoplay_enabled_v4';
    const STORAGE_PLAYLIST_VISIBLE = 'yt_lucky_playlist_visible_v4';
    const STORAGE_AUTOPLAY_PIP_FLAG = 'yt_lucky_autoplay_pip_flag_v4';
    const STORAGE_AUDIO_ONLY_MODE = 'yt_lucky_audio_only_v4';
    const STORAGE_PDISPLAY_MODE = 'yt_lucky_pdisplay_mode_v4';
    const STORAGE_PAGE_MODE = 'yt_lucky_page_mode_v4';
    const CURRENT_SONG_HIGHLIGHT_COLOR = '#e0f7fa';

    if (window.trustedTypes && !window.trustedTypes.defaultPolicy) {
        try { window.trustedTypes.createPolicy('default', { createHTML: (s) => s }); } catch (e) { }
    }

    let _audioCtx = null; let _silentNode = null; let _wakeLock = null; let playEnforcementInterval = null;
    let _bassNode = null; let _trebleNode = null; let _volNode = null; let _audioSource = null;
    let eqSettings = { bass: parseFloat(localStorage.getItem('yt_lucky_eq_bass') || '0'), treble: parseFloat(localStorage.getItem('yt_lucky_eq_treble') || '0'), vol: parseFloat(localStorage.getItem('yt_lucky_eq_vol') || '1') };

    let playlists = {}; let activeTab = null; let currentIndex = -1; let progressInterval = null; let isTransitioning = false;
    let prefetchedNextUrl = null; let prefetchedNextQuery = null;
    let playlistSearchQuery = ''; let isSearchLocked = false; let transientArtistData = null;
    let artistModeEnabled = localStorage.getItem('yt_lucky_artist_mode') === '1'; let isArtistFirst = localStorage.getItem('yt_lucky_artist_format_left') !== '0';
    let lastCenteredIndex = -1; let lastCenteredTab = null;

    let shuffleModeEnabled = localStorage.getItem('yt_lucky_shuffle') === '1';
    let shuffledIndices = [];
    let playHistory = [];
    let qualityInterval = null;

    function initBackgroundBypass() { registerMediaSession(); startSilentAudioContext(); requestWakeLock(); }
    function registerMediaSession() {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.metadata = new MediaMetadata({ title: getCurrentVideoTitle() || 'Playing Background Audio', artist: 'YouTube Lucky Playlist', album: activeTab ? (playlists[activeTab]?.name || 'Sidebar') : 'Sidebar' });
        navigator.mediaSession.setActionHandler('play', () => { const v = document.querySelector('video'); if (v) v.play().catch(() => {}); });
        navigator.mediaSession.setActionHandler('pause', () => { const v = document.querySelector('video'); if (v) v.pause(); });
        navigator.mediaSession.setActionHandler('nexttrack', () => { triggerNextSong(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => { const v = document.querySelector('video'); if (v) { v.currentTime = 0; v.play().catch(() => {}); } });
        const video = document.querySelector('video');
        if (video) { video.addEventListener('play', () => { navigator.mediaSession.playbackState = 'playing'; }); video.addEventListener('pause', () => { navigator.mediaSession.playbackState = 'paused'; }); }
    }
    function startSilentAudioContext() {
        if (_audioCtx) return;
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = _audioCtx.createOscillator(); const gainNode = _audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, _audioCtx.currentTime); oscillator.connect(gainNode); gainNode.connect(_audioCtx.destination); oscillator.start(); _silentNode = oscillator;
            document.addEventListener('click', () => { if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume(); }, { once: false, passive: true });
        } catch (e) { console.warn('YTLucky: AudioContext keepalive failed:', e); }
    }
    async function requestWakeLock() {
        if (!('wakeLock' in navigator)) return;
        try { if (_wakeLock) _wakeLock.release(); _wakeLock = await navigator.wakeLock.request('screen'); document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && _wakeLock?.released) _wakeLock = await navigator.wakeLock.request('screen').catch(() => null); }); } catch (e) {}
    }
    function enforcePlayback() {
        if (playEnforcementInterval) clearInterval(playEnforcementInterval);
        let attempts = 0;
        playEnforcementInterval = setInterval(() => {
            const video = document.querySelector('video'); attempts++;
            if (video) { if (video.paused || video.readyState < 3) video.play().catch(() => {}); else if (!video.paused && video.currentTime > 0) clearInterval(playEnforcementInterval); }
            if (attempts > 20) clearInterval(playEnforcementInterval);
        }, 500);
    }

    function setupAudioNodes(video) {
        if (!_audioCtx) startSilentAudioContext();
        if (!video._ytLuckyAudioConnected && _audioCtx) {
            try {
                _audioSource = _audioCtx.createMediaElementSource(video);

                _bassNode = _audioCtx.createBiquadFilter();
                _bassNode.type = 'lowshelf';
                _bassNode.frequency.value = 150;

                _trebleNode = _audioCtx.createBiquadFilter();
                _trebleNode.type = 'highshelf';
                _trebleNode.frequency.value = 4000;

                _volNode = _audioCtx.createGain();

                _audioSource.connect(_bassNode);
                _bassNode.connect(_trebleNode);
                _trebleNode.connect(_volNode);
                _volNode.connect(_audioCtx.destination);

                video._ytLuckyAudioConnected = true;
                applyEQ();
            } catch (e) { console.warn('YTLucky: Audio connection failed:', e); }
        }
    }
    function applyEQ() {
        if (_bassNode) _bassNode.gain.value = eqSettings.bass;
        if (_trebleNode) _trebleNode.gain.value = eqSettings.treble;
        if (_volNode) _volNode.gain.value = eqSettings.vol;
    }
    function saveEQ() {
        localStorage.setItem('yt_lucky_eq_bass', eqSettings.bass);
        localStorage.setItem('yt_lucky_eq_treble', eqSettings.treble);
        localStorage.setItem('yt_lucky_eq_vol', eqSettings.vol);
        applyEQ();
    }

    function toggleEQPanel() {
        let eqPanel = document.getElementById('yt-lucky-eq-panel');
        if (!eqPanel) {
            eqPanel = document.createElement('div');
            eqPanel.id = 'yt-lucky-eq-panel';
            Object.assign(eqPanel.style, {
                position: 'absolute', top: '90px', right: '10px', background: 'rgba(20,20,20,0.95)',
                border: '1px solid #444', borderRadius: '8px', padding: '12px', zIndex: 99999,
                display: 'flex', flexDirection: 'column', gap: '10px', width: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            });

            const title = document.createElement('div');
            title.innerHTML = '<strong>Audio Equalizer</strong>';
            title.style.color = '#fff'; title.style.fontSize = '12px'; title.style.textAlign = 'center';

            const createSlider = (label, min, max, step, key, displaySuffix = '') => {
                const row = document.createElement('div');
                const lbl = document.createElement('div');
                lbl.style.fontSize = '10px'; lbl.style.color = '#aaa';
                lbl.textContent = `${label}: ${eqSettings[key]}${displaySuffix}`;

                const input = document.createElement('input');
                input.type = 'range'; input.min = min; input.max = max; input.step = step;
                input.value = eqSettings[key]; input.style.width = '100%';

                input.addEventListener('input', () => {
                    eqSettings[key] = parseFloat(input.value);
                    lbl.textContent = `${label}: ${eqSettings[key]}${displaySuffix}`;
                    saveEQ();
                });

                row.append(lbl, input); return { row, input, lbl };
            };

            const bassCtrl = createSlider('Bass', -10, 24, 1, 'bass', ' dB');
            const trebleCtrl = createSlider('Treble', -10, 24, 1, 'treble', ' dB');
            const volCtrl = createSlider('Vol Boost', 0.1, 3.0, 0.1, 'vol', 'x');

            const resetBtn = document.createElement('button');
            resetBtn.textContent = 'Reset';
            Object.assign(resetBtn.style, { padding: '4px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginTop: '4px' });
            resetBtn.onclick = () => {
                eqSettings = { bass: 0, treble: 0, vol: 1 };
                bassCtrl.input.value = 0; bassCtrl.lbl.textContent = 'Bass: 0 dB';
                trebleCtrl.input.value = 0; trebleCtrl.lbl.textContent = 'Treble: 0 dB';
                volCtrl.input.value = 1; volCtrl.lbl.textContent = 'Vol Boost: 1x';
                saveEQ();
            };

            eqPanel.append(title, bassCtrl.row, trebleCtrl.row, volCtrl.row, resetBtn);
            const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3');
            if (sidebar) sidebar.appendChild(eqPanel); else document.body.appendChild(eqPanel);
        } else {
            eqPanel.style.display = eqPanel.style.display === 'none' ? 'flex' : 'none';
        }
    }

    function schedulePlayAfterNavigation() {
        const attemptPlay = async () => {
            const video = document.querySelector('video'); if (!video) return;
            setupAudioNodes(video);
            if (video.paused) await video.play().catch(() => {});
        };
        attemptPlay();
        if (_audioCtx) [0.3, 0.8, 1.5, 3.0].forEach(delay => { _audioCtx.resume().then(() => { setTimeout(attemptPlay, delay * 1000); }); });
    }

    (function injectLayoutStyles() {
        const style = document.createElement('style');
        style.textContent = `#yt-lucky-controls-v3-wrapper { display: flex; flex-wrap: wrap; gap: 6px; margin-right: 8px; z-index: 9999; align-items: center; } .yt-lucky-ctrl-row { display: flex; align-items: center; gap: 6px; } @media (max-width: 720px) { .yt-lucky-ctrl-row { flex: 1 1 100%; } }`;
        document.head.appendChild(style);
    })();

    function extractArtistInfo(title) {
        let clean = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/(official|music|video|lyrics|lyric|audio|hd|4k|1080p|720p)/gi, '').trim();
        const separators = [' - ', ' – ', ' — ', ' | ', ' • ', ' ~ '];
        for (const sep of separators) { if (clean.includes(sep)) { const parts = clean.split(sep); return isArtistFirst ? parts[0].trim() : parts[parts.length - 1].trim(); } }
        return clean;
    }

    function saveAllPlaylists() { try { const toSave = { ...playlists }; delete toSave['__TRANSIENT_ARTIST__']; localStorage.setItem(STORAGE_PLAYLISTS, JSON.stringify(toSave)); } catch (e) {} }
    function loadAllPlaylists() { try { const raw = localStorage.getItem(STORAGE_PLAYLISTS); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; } }
    function saveActiveTab(key) { if (!key) localStorage.removeItem(STORAGE_ACTIVE_TAB); else localStorage.setItem(STORAGE_ACTIVE_TAB, key); }
    function loadActiveTab() { return localStorage.getItem(STORAGE_ACTIVE_TAB); }
    function saveLockMode(v) { localStorage.setItem(STORAGE_LOCK_MODE, v ? '1' : '0'); }
    function loadLockMode() { return localStorage.getItem(STORAGE_LOCK_MODE) === '1'; }
    function saveLastIndex(i) { localStorage.setItem(STORAGE_LAST_INDEX, String(i)); }
    function loadLastIndex() { const v = localStorage.getItem(STORAGE_LAST_INDEX); return v === null ? -1 : parseInt(v, 10); }
    function loadAutoplayEnabled() { return localStorage.getItem(STORAGE_AUTOPLAY_ENABLED) === '1'; }
    function saveAutoplayEnabled(v) { localStorage.setItem(STORAGE_AUTOPLAY_ENABLED, v ? '1' : '0'); }
    function loadPlaylistVisible() { return localStorage.getItem(STORAGE_PLAYLIST_VISIBLE) !== '0'; }
    function savePlaylistVisible(v) { localStorage.setItem(STORAGE_PLAYLIST_VISIBLE, v ? '1' : '0'); }
    function loadPDisplayMode() { return localStorage.getItem(STORAGE_PDISPLAY_MODE) === '1'; }
    function savePDisplayMode(v) { localStorage.setItem(STORAGE_PDISPLAY_MODE, v ? '1' : '0'); }
    function loadAudioOnlyMode() { return localStorage.getItem(STORAGE_AUDIO_ONLY_MODE) === '1'; }
    function saveAudioOnlyMode(v) { localStorage.setItem(STORAGE_AUDIO_ONLY_MODE, v ? '1' : '0'); }
    function loadPageMode() { return localStorage.getItem(STORAGE_PAGE_MODE) === '1'; }
    function savePageMode(v) { localStorage.setItem(STORAGE_PAGE_MODE, v ? '1' : '0'); }

    function makeTabKey(name) { return `${Date.now()}_${(name || 'playlist').replace(/[^\w.-]/g, '_').slice(0, 30)}`; }
    function shortName(filename, max = 12) { return (!filename) ? 'untitled' : (filename.length <= max ? filename : filename.slice(0, max - 3) + '...'); }

    function getCurrentVideoTitle() {
        let titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') || document.querySelector('h1.title yt-formatted-string');
        if (titleElement) return titleElement.textContent.trim();
        return document.title.replace(" - YouTube", "").trim();
    }
    function extractVideoId(url) { const match = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/); return match ? match[1] : null; }

    function updateDockMode(mode) {
        const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3'); if (!sidebar) return;
        sidebar.style.top = ''; sidebar.style.right = ''; sidebar.style.bottom = ''; sidebar.style.left = '';
        if (mode === 'side') {
            const savedWidth = localStorage.getItem('ytLucky_sidebarWidthSide') || '360px';
            Object.assign(sidebar.style, { top: '60px', right: '12px', height: '80vh', width: savedWidth });
            const resizeHandle = sidebar.querySelector('.resize-handle-pl');
            if (resizeHandle) Object.assign(resizeHandle.style, { position: 'absolute', top: '0', bottom: '0', left: '0', right: 'auto', width: '8px', height: '100%', cursor: 'ew-resize', background: 'transparent', borderRadius: '0' });
        } else {
            const savedWidth = localStorage.getItem('ytLucky_sidebarWidthBottom') || '420px'; const savedHeight = localStorage.getItem('ytLucky_sidebarHeightBottom') || '44vh';
            Object.assign(sidebar.style, { bottom: '10px', left: '10px', height: savedHeight, width: savedWidth });
            const resizeHandle = sidebar.querySelector('.resize-handle-pl');
            if (resizeHandle) Object.assign(resizeHandle.style, { position: 'absolute', top: '0', right: '0', bottom: 'auto', left: 'auto', width: '35px', height: '35px', cursor: 'nesw-resize', background: 'linear-gradient(225deg, rgba(255,255,255,0.4) 10%, transparent 50%)', borderTopRightRadius: '10px', borderRadius: '0 10px 0 0' });
        }
        localStorage.setItem('yt_lucky_dock_mode', mode); updateVideoShift();
    }

    function updateVideoShift() {
        const flexy = document.querySelector('ytd-watch-flexy'); if (!flexy) return;
        const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3'); const pDisplayActive = loadPDisplayMode(); const isVisible = loadPlaylistVisible(); const mode = localStorage.getItem('yt_lucky_dock_mode') || 'bottom';
        if (sidebar && isVisible && !pDisplayActive && mode === 'side') { const sidebarWidth = sidebar.offsetWidth; flexy.style.paddingRight = `${sidebarWidth + 24}px`; flexy.style.transition = 'padding-right 0.1s ease-out'; }
        else { flexy.style.paddingRight = '0px'; }
    }

    function navigateTo(url) {
        if (document.visibilityState === 'hidden') { window.location.assign(url); return; }
        const a = document.createElement('a'); a.href = url; document.body.appendChild(a);
        try { a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) { a.click(); }
        setTimeout(() => { if (a.parentNode) a.remove(); }, 100);
        const currentPath = window.location.pathname + window.location.search;
        setTimeout(() => { if (window.location.pathname + window.location.search === currentPath) window.location.assign(url); }, 500);
        enforcePlayback(); setTimeout(schedulePlayAfterNavigation, 800);
    }

    function prefetchNextSong() {
        if (!loadAutoplayEnabled() || !activeTab || loadPageMode()) return;
        let list = playlists[activeTab]?.lines || []; if (activeTab === '__TRANSIENT_ARTIST__' && transientArtistData) list = transientArtistData.lines;
        let nextIndex = currentIndex + 1;
        if (shuffleModeEnabled && list.length > 0) nextIndex = getNextShuffleIndex(list.length, currentIndex);

        if (nextIndex >= list.length) { prefetchedNextUrl = null; prefetchedNextQuery = null; return; }
        const nextQuery = list[nextIndex]; if (!nextQuery || nextQuery === prefetchedNextQuery) return;
        prefetchedNextQuery = nextQuery;
        if (nextQuery.includes('http')) { const vid = extractVideoId(nextQuery); if (vid) prefetchedNextUrl = `/watch?v=${vid}`; return; }
        GM_xmlhttpRequest({
            method: 'GET', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(nextQuery)}`,
            onload: (response) => { try { const match = response.responseText.match(/"videoId":"([a-zA-Z0-9_-]{11})"/); if (match && match[1]) { prefetchedNextUrl = `/watch?v=${match[1]}`; return; } } catch(e) {} prefetchedNextUrl = `/results?search_query=${encodeURIComponent(nextQuery)}`; }
        });
    }

    function getNextShuffleIndex(listLength, currentIdx) {
        if (shuffledIndices.length !== listLength) shuffledIndices = Array.from({length: listLength}, (_, i) => i).sort(() => Math.random() - 0.5);
        const pos = shuffledIndices.indexOf(currentIdx);
        if (pos === -1 || pos >= listLength - 1) {
            shuffledIndices = Array.from({length: listLength}, (_, i) => i).sort(() => Math.random() - 0.5);
            return shuffledIndices[0];
        }
        return shuffledIndices[pos + 1];
    }

    function triggerNextSong() {
        if (isTransitioning || !loadAutoplayEnabled() || !activeTab) return;
        let list = playlists[activeTab]?.lines || []; if (activeTab === '__TRANSIENT_ARTIST__' && transientArtistData) list = transientArtistData.lines;
        let nextIndex = currentIndex + 1;

        if (shuffleModeEnabled && list.length > 0) nextIndex = getNextShuffleIndex(list.length, currentIndex);
        if (nextIndex >= list.length) return;

        if (currentIndex !== -1) playHistory.push(currentIndex);

        isTransitioning = true; saveLastIndex(nextIndex); currentIndex = nextIndex;
        const nextQuery = list[nextIndex];

        setTimeout(() => scrollToActiveTrack(true), 200);

        if (prefetchedNextUrl && prefetchedNextQuery === nextQuery && !loadPageMode()) navigateTo(prefetchedNextUrl); else playOrNavigate(nextQuery);
        setTimeout(() => { isTransitioning = false; }, 4000);
    }

    function loadLucky(query) {
        if (!query) return;
        if (query.includes('http')) { const vid = extractVideoId(query); if (vid) { navigateTo(`/watch?v=${vid}`); return; } }
        const internalSearch = document.querySelector('#yt-lucky-controls-v3-wrapper input[type="text"]'); const oldText = internalSearch ? internalSearch.value : ''; if (internalSearch) internalSearch.value = 'Loading...';
        GM_xmlhttpRequest({
            method: 'GET', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            onload: (response) => {
                if (internalSearch) internalSearch.value = oldText;
                const match = response.responseText.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
                if (match && match[1]) navigateTo(`/watch?v=${match[1]}`); else window.location.assign('https://www.google.com/search?q=site:youtube.com%20' + encodeURIComponent(query) + '&btnI=I');
            },
            onerror: () => { if (internalSearch) internalSearch.value = oldText; window.location.assign('https://www.google.com/search?q=site:youtube.com%20' + encodeURIComponent(query) + '&btnI=I'); }
        });
    }

    function loadChannel(query) {
        if (!query) return; let pageUrl = query.trim();
        if (pageUrl.startsWith('http')) return navigateTo(pageUrl);
        if (pageUrl.startsWith('@') || pageUrl.startsWith('c/') || pageUrl.startsWith('channel/') || pageUrl.startsWith('user/')) return navigateTo(`/${pageUrl}`);
        const internalSearch = document.querySelector('#yt-lucky-controls-v3-wrapper input[type="text"]'); const oldText = internalSearch ? internalSearch.value : ''; if (internalSearch) internalSearch.value = 'Finding channel...';
        GM_xmlhttpRequest({
            method: 'GET', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(pageUrl)}&sp=EgIQAg%253D%253D`,
            onload: (response) => {
                if (internalSearch) internalSearch.value = oldText;
                try { const match = response.responseText.match(/"url":"(\/@[^"]+)"/) || response.responseText.match(/"url":"(\/channel\/UC[^"]+)"/); if (match && match[1]) { navigateTo(match[1]); return; } } catch(e) {}
                navigateTo(`/results?search_query=${encodeURIComponent(pageUrl)}&sp=EgIQAg%253D%253D`);
            },
            onerror: () => { if (internalSearch) internalSearch.value = oldText; navigateTo(`/@${pageUrl.replace(/\s+/g, '')}`); }
        });
    }

    function playOrNavigate(targetLine) { if (!targetLine) return; if (loadPageMode()) setTimeout(() => loadChannel(targetLine), 50); else setTimeout(() => loadLucky(targetLine), 50); }

    function scrollToActiveTrack(smooth = true) {
        const listContainer = document.getElementById('yt-lucky-listcontainer-v3');
        if (!listContainer || listContainer.style.display === 'none') return;
        const activeEl = listContainer.querySelector('.yt-lucky-active-item');
        if (activeEl) {
            const topPos = activeEl.offsetTop - (listContainer.clientHeight / 2) + (activeEl.clientHeight / 2);
            listContainer.scrollTo({ top: topPos, behavior: smooth ? 'smooth' : 'auto' });
            lastCenteredIndex = currentIndex; lastCenteredTab = activeTab;
        }
    }

    function createProgressBar() {
        const existingBar = document.getElementById('yt-lucky-progress-bar'); if (existingBar) return existingBar;
        const container = document.createElement('div'); container.id = 'yt-lucky-progress-bar';
        Object.assign(container.style, { width: '100%', height: '6px', background: '#0f0f0f', borderRadius: '0px', margin: '6px 0', overflow: 'hidden', position: 'relative', boxSizing: 'border-box', flexShrink: '0' });
        const progress = document.createElement('div'); progress.id = 'yt-lucky-progress-fill';
        Object.assign(progress.style, { width: '0%', height: '100%', background: 'linear-gradient(90deg, #ff0000, #ff6b6b)', transition: 'width 0.3s linear' });
        const timeDisplay = document.createElement('div'); timeDisplay.id = 'yt-lucky-time-display';
        Object.assign(timeDisplay.style, { position: 'absolute', top: '-18px', right: '0', fontSize: '11px', color: '#ccc', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '2px' });
        container.append(progress, timeDisplay);
        const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3'); if (sidebar) { const listContainer = document.getElementById('yt-lucky-listcontainer-v3'); sidebar.insertBefore(container, listContainer); }
        startProgressTracking(); return container;
    }

    function startProgressTracking() { if (progressInterval) clearInterval(progressInterval); progressInterval = setInterval(updateProgressBar, 1000); }

    function updateProgressBar() {
        const video = document.querySelector('video'); const progressFill = document.getElementById('yt-lucky-progress-fill'); const timeDisplay = document.getElementById('yt-lucky-time-display');
        if (!video || !progressFill || !timeDisplay || video.duration <= 0) return;
        const progress = (video.currentTime / video.duration) * 100; progressFill.style.width = `${progress}%`;
        const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
        timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }

    // --- TAB SWITCHER LOGIC ---
    function switchSidebarView(view) {
        const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3');
        if (!sidebar) return;

        if (sidebar.style.display === 'none') {
            sidebar.style.display = 'flex';
            savePlaylistVisible(true);
            updateVideoShift();
            const listToggleBtn = Array.from(document.querySelectorAll('#yt-lucky-controls-v3-wrapper button')).find(b => b.textContent.includes('List:'));
            if (listToggleBtn) listToggleBtn.textContent = 'List: Hide';
        }

        const lc = document.getElementById('yt-lucky-listcontainer-v3');
        const tabs = document.getElementById('yt-lucky-tabs-holder-v3');
        const ptb = YtPotPlayer.panelElement;
        const lp = YtLyrics.panelElement;
        const aiex = YtAIExplainer.panelElement;
        const aiset = YtAISettings.panelElement;

        if (lc) lc.style.display = 'none';
        if (tabs) tabs.style.display = 'none';
        if (ptb) ptb.style.display = 'none';
        if (lp) lp.style.display = 'none';
        if (aiex) aiex.style.display = 'none';
        if (aiset) aiset.style.display = 'none';

        if (view === 'LIST') {
            if (lc) lc.style.display = loadPDisplayMode() ? 'flex' : 'block';
            if (tabs) tabs.style.display = 'block';
            setTimeout(() => scrollToActiveTrack(true), 150);
        } else if (view === 'POTPLAYER') {
            if (ptb) ptb.style.display = 'flex';
        } else if (view === 'LYRICS') {
            if (lp) lp.style.display = 'flex';
            YtLyrics.onShow();
        } else if (view === 'AIEX') {
            if (aiex) aiex.style.display = 'flex';
            YtAIExplainer.explainCurrentSong();
        } else if (view === 'AISETTINGS') {
            if (aiset) aiset.style.display = 'flex';
        }

        const bPlistBtn = document.getElementById('yt-lucky-bplist-btn');
        const lyricsBtn = Array.from(document.querySelectorAll('#yt-lucky-controls-v3-wrapper button')).find(b => b.textContent === '🎵 Lyrics');
        const aiexBtn = document.getElementById('yt-lucky-aiex-btn');
        const aiSettingsBtn = document.getElementById('yt-lucky-aisettings-btn');

        if (bPlistBtn) bPlistBtn.style.background = (view === 'POTPLAYER') ? '#8e24aa' : '#e64a19';
        if (aiexBtn) aiexBtn.style.background = (view === 'AIEX') ? '#8e24aa' : '#0288d1';
        if (aiSettingsBtn) aiSettingsBtn.style.background = (view === 'AISETTINGS') ? '#8e24aa' : '#455a64';
        if (lyricsBtn) lyricsBtn.style.background = (view === 'LYRICS') ? '#8e24aa' : '#f1f8e9';
        if (lyricsBtn) lyricsBtn.style.color = (view === 'LYRICS') ? '#fff' : '#000';
    }

    function createPlaylistSidebar() {
        if (document.getElementById('yt-lucky-playlist-sidebar-v3')) return;

        const sidebar = document.createElement('div'); sidebar.id = 'yt-lucky-playlist-sidebar-v3';
        Object.assign(sidebar.style, { position: 'fixed', display: loadPlaylistVisible() ? 'flex' : 'none', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', background: 'rgba(18,18,18,0.96)', color: '#fff', padding: '10px', borderRadius: '10px', zIndex: 2147483645, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', fontSize: '14px', boxSizing: 'border-box' });

        const resizeHandle = document.createElement('div'); resizeHandle.className = 'resize-handle-pl';
        const startResize = (e) => {
            e.preventDefault(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const startWidth = sidebar.offsetWidth; const startHeight = sidebar.offsetHeight; const startX = clientX; const startY = clientY;
            const mode = localStorage.getItem('yt_lucky_dock_mode') || 'bottom';
            const onMove = (moveEvent) => {
                const cx = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX; const cy = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
                if (mode === 'side') { const newWidth = startWidth + (startX - cx); if (newWidth > 180 && newWidth <= window.innerWidth) sidebar.style.width = newWidth + 'px'; }
                else { const newWidth = startWidth + (cx - startX); const newHeight = startHeight - (cy - startY); if (newWidth > 200 && newWidth <= window.innerWidth) sidebar.style.width = newWidth + 'px'; if (newHeight > 150 && newHeight <= window.innerHeight) sidebar.style.height = newHeight + 'px'; }
            };
            const onEnd = () => {
                const mode = localStorage.getItem('yt_lucky_dock_mode') || 'bottom';
                if (mode === 'side') localStorage.setItem('ytLucky_sidebarWidthSide', sidebar.style.width); else { localStorage.setItem('ytLucky_sidebarWidthBottom', sidebar.style.width); localStorage.setItem('ytLucky_sidebarHeightBottom', sidebar.style.height); }
                document.removeEventListener('mousemove', onMove); document.removeEventListener('touchmove', onMove); document.removeEventListener('mouseup', onEnd); document.removeEventListener('touchend', onEnd); updateVideoShift();
            };
            document.addEventListener('mousemove', onMove); document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('mouseup', onEnd); document.addEventListener('touchend', onEnd);
        };
        resizeHandle.addEventListener('mousedown', startResize); resizeHandle.addEventListener('touchstart', startResize, { passive: false });
        sidebar.appendChild(resizeHandle); document.documentElement.appendChild(sidebar);

        const header = document.createElement('div'); header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-right:30px; flex-shrink: 0; flex-wrap: wrap;';
        const hTitle = document.createElement('div'); hTitle.textContent = '🎵 Lucky'; hTitle.style.fontWeight = '700'; hTitle.style.whiteSpace = 'nowrap'; hTitle.style.fontSize = '14px';
        hTitle.style.cursor = 'pointer';
        hTitle.addEventListener('click', () => switchSidebarView('LIST'));

        const internalSearch = document.createElement('input'); internalSearch.type = 'text'; internalSearch.placeholder = 'Search list...'; internalSearch.value = playlistSearchQuery;
        Object.assign(internalSearch.style, { flex: '1', minWidth: '40px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #333', background: '#1f1f1f', color: '#fff', fontSize: '12px', outline: 'none' });
        internalSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                playlistSearchQuery = e.target.value.trim(); isSearchLocked = false;
                if (playlists['__SEARCH_RESULTS__']) { delete playlists['__SEARCH_RESULTS__']; saveAllPlaylists(); }
                if (activeTab === '__SEARCH_RESULTS__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); }
                switchSidebarView('LIST');
                renderTabsBar(); renderPlaylistUI();
            }
        });

        const prevBtn = document.createElement('button'); prevBtn.textContent = 'Prev';
        Object.assign(prevBtn.style, { padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#cc7700', color: 'white', fontSize: '12px', flexShrink: '0' });
        prevBtn.addEventListener('click', () => {
            let activeList = playlists[activeTab]?.lines; if (activeTab === '__TRANSIENT_ARTIST__' && transientArtistData) activeList = transientArtistData.lines;
            if (shuffleModeEnabled) {
                if (playHistory.length > 0) {
                    const prevIdx = playHistory.pop();
                    isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null;
                    currentIndex = prevIdx; saveLastIndex(currentIndex);
                    renderTabsBar(); renderPlaylistUI();
                    setTimeout(() => scrollToActiveTrack(true), 200);
                    playOrNavigate(activeList[currentIndex]);
                }
            } else {
                if (activeList && currentIndex > 0) {
                    isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null; currentIndex--; saveLastIndex(currentIndex); renderTabsBar(); renderPlaylistUI();
                    setTimeout(() => scrollToActiveTrack(true), 200); playOrNavigate(activeList[currentIndex]);
                }
            }
        });

        const nextBtn = document.createElement('button'); nextBtn.textContent = 'Next';
        Object.assign(nextBtn.style, { padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#0077cc', color: 'white', fontSize: '12px', flexShrink: '0' });
        nextBtn.addEventListener('click', triggerNextSong);

        const clearBtn = document.createElement('button'); clearBtn.textContent = 'Clear';
        Object.assign(clearBtn.style, { padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#6b0000', color: 'white', fontSize: '12px', flexShrink: '0' });
        clearBtn.addEventListener('click', () => {
            playlists = {}; activeTab = null; currentIndex = -1; playlistSearchQuery = ''; isSearchLocked = false; transientArtistData = null; internalSearch.value = ''; prefetchedNextUrl = null; prefetchedNextQuery = null;
            shuffledIndices = []; playHistory = [];
            saveAllPlaylists(); saveActiveTab(null); saveLastIndex(-1); renderTabsBar(); renderPlaylistUI();
            switchSidebarView('LIST');
        });

        const pDisplayBtn = document.createElement('button'); pDisplayBtn.textContent = 'P-Display';
        Object.assign(pDisplayBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: loadPDisplayMode() ? '#00cc55' : '#0055cc', color: 'white', fontSize: '12px' });
        pDisplayBtn.addEventListener('click', () => {
            const isActive = !loadPDisplayMode(); savePDisplayMode(isActive);
            pDisplayBtn.style.background = isActive ? '#00cc55' : '#0055cc';
            updateDockMode(localStorage.getItem('yt_lucky_dock_mode') || 'bottom');
            switchSidebarView('LIST');
            renderPlaylistUI();
        });

        let currentDock = localStorage.getItem('yt_lucky_dock_mode') || 'bottom';
        const dockBtn = document.createElement('button'); dockBtn.textContent = currentDock === 'side' ? 'Dock: Side' : 'Dock: Bottom';
        Object.assign(dockBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: '#009688', color: '#fff', fontSize: '12px' });
        dockBtn.onclick = () => { currentDock = currentDock === 'side' ? 'bottom' : 'side'; dockBtn.textContent = currentDock === 'side' ? 'Dock: Side' : 'Dock: Bottom'; updateDockMode(currentDock); };

        const pageBtn = document.createElement('button'); const isPageMode = loadPageMode();
        pageBtn.textContent = isPageMode ? 'Page: ON' : 'Page: OFF';
        Object.assign(pageBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: isPageMode ? '#9c27b0' : '#607d8b', color: 'white', fontSize: '12px' });
        pageBtn.addEventListener('click', () => { const isActive = !loadPageMode(); savePageMode(isActive); pageBtn.textContent = isActive ? 'Page: ON' : 'Page: OFF'; pageBtn.style.background = isActive ? '#9c27b0' : '#607d8b'; });

        const anchorBtn = document.createElement('button');
        anchorBtn.id = 'yt-lucky-anchor-btn';
        anchorBtn.textContent = YtAnchor.anchored ? 'Anchor: ON' : 'Anchor: OFF';
        Object.assign(anchorBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: '#673ab7', color: 'white', fontSize: '12px' });
        anchorBtn.addEventListener('click', () => { YtAnchor.toggle(); });

        const bPlistBtn = document.createElement('button');
        bPlistBtn.id = 'yt-lucky-bplist-btn';
        bPlistBtn.textContent = 'B-Plist';
        Object.assign(bPlistBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: '#e64a19', color: 'white', fontSize: '12px' });
        bPlistBtn.addEventListener('click', () => {
            const isPtbOpen = YtPotPlayer.panelElement && YtPotPlayer.panelElement.style.display === 'flex';
            switchSidebarView(isPtbOpen ? 'LIST' : 'POTPLAYER');
        });

        // AIEx Button
        const aiexBtn = document.createElement('button');
        aiexBtn.id = 'yt-lucky-aiex-btn';
        aiexBtn.textContent = 'AIEx';
        aiexBtn.title = 'AI Song Explainer';
        Object.assign(aiexBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: '#0288d1', color: 'white', fontSize: '12px', fontWeight: 'bold' });
        aiexBtn.onclick = () => {
            const isAiexOpen = YtAIExplainer.panelElement && YtAIExplainer.panelElement.style.display === 'flex';
            switchSidebarView(isAiexOpen ? 'LIST' : 'AIEX');
        };

        // AI Settings Button
        const aiSettingsBtn = document.createElement('button');
        aiSettingsBtn.id = 'yt-lucky-aisettings-btn';
        aiSettingsBtn.textContent = '⚙️';
        aiSettingsBtn.title = 'AI Configuration';
        Object.assign(aiSettingsBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: '#455a64', color: 'white', fontSize: '12px' });
        aiSettingsBtn.onclick = () => {
            const isSetOpen = YtAISettings.panelElement && YtAISettings.panelElement.style.display === 'flex';
            switchSidebarView(isSetOpen ? 'LIST' : 'AISETTINGS');
        };

        const eqBtn = document.createElement('button');
        eqBtn.textContent = 'EQ';
        Object.assign(eqBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: '#3f51b5', color: 'white', fontSize: '12px' });
        eqBtn.addEventListener('click', toggleEQPanel);

        const shuffleBtn = document.createElement('button');
        shuffleBtn.title = 'Shuffle Mode';
        shuffleBtn.innerHTML = shuffleModeEnabled ? '🔀 ON' : '🔀 OFF';
        Object.assign(shuffleBtn.style, { padding: '4px 6px', borderRadius: '6px', flexShrink: '0', border: 'none', cursor: 'pointer', background: shuffleModeEnabled ? '#00c853' : '#757575', color: 'white', fontSize: '12px' });
        shuffleBtn.addEventListener('click', () => {
            shuffleModeEnabled = !shuffleModeEnabled;
            localStorage.setItem('yt_lucky_shuffle', shuffleModeEnabled ? '1' : '0');
            shuffleBtn.innerHTML = shuffleModeEnabled ? '🔀 ON' : '🔀 OFF';
            shuffleBtn.style.background = shuffleModeEnabled ? '#00c853' : '#757575';
            if (!shuffleModeEnabled) { shuffledIndices = []; playHistory = []; }
        });

        const lockBtn = document.createElement('button'); lockBtn.title = 'Lock to single tab';
        Object.assign(lockBtn.style, { padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', flexShrink: '0', background: loadLockMode() ? '#d32f2f' : '#f1f1f1', color: loadLockMode() ? '#fff' : '#000', fontSize: '12px' });
        lockBtn.textContent = loadLockMode() ? '🔒' : '🔓';
        lockBtn.addEventListener('click', () => {
            const locked = !loadLockMode();
            if (locked && activeTab) { const keep = {}; keep[activeTab] = playlists[activeTab]; playlists = keep; saveAllPlaylists(); }
            saveLockMode(locked); lockBtn.textContent = locked ? '🔒' : '🔓'; lockBtn.style.background = locked ? '#d32f2f' : '#f1f1f1'; lockBtn.style.color = locked ? '#fff' : '#000';
            renderTabsBar(); renderPlaylistUI();
        });

        header.append(hTitle, internalSearch, prevBtn, nextBtn, clearBtn, pDisplayBtn, dockBtn, pageBtn, anchorBtn, bPlistBtn, aiexBtn, aiSettingsBtn, eqBtn, shuffleBtn, lockBtn);
        sidebar.appendChild(header);

        if (YtPotPlayer.panelElement) sidebar.appendChild(YtPotPlayer.panelElement);
        if (YtLyrics.panelElement) sidebar.appendChild(YtLyrics.panelElement);
        if (YtAIExplainer.panelElement) sidebar.appendChild(YtAIExplainer.panelElement);
        if (YtAISettings.panelElement) sidebar.appendChild(YtAISettings.panelElement);

        const tabsHolder = document.createElement('div'); tabsHolder.id = 'yt-lucky-tabs-holder-v3';
        Object.assign(tabsHolder.style, { width: '100%', boxSizing: 'border-box', marginTop: '6px', flexShrink: '0' }); sidebar.appendChild(tabsHolder);

        const listContainer = document.createElement('div'); listContainer.id = 'yt-lucky-listcontainer-v3';
        Object.assign(listContainer.style, { marginTop: '10px', flex: '1', overflowY: 'auto', paddingRight: '5px' });
        listContainer.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { e.preventDefault(); scrollToActiveTrack(false); } }, { passive: false });
        sidebar.appendChild(listContainer);

        updateDockMode(localStorage.getItem('yt_lucky_dock_mode') || 'bottom');
    }

    function renderTabsBar() {
        const holder = document.getElementById('yt-lucky-tabs-holder-v3'); if (!holder) return;
        holder.innerHTML = ''; createProgressBar();
        const tabsBar = document.createElement('div'); tabsBar.id = 'yt-lucky-tabs-bar-v3';
        Object.assign(tabsBar.style, { display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap', padding: '6px 2px', background: '#0d0d0d', borderRadius: '6px' });
        Object.keys(playlists).forEach((key) => {
            if (key === '__TRANSIENT_ARTIST__') return;
            const meta = playlists[key]; const tab = document.createElement('div'); tab.className = 'yt-lucky-tab-v3'; tab.dataset.key = key;
            Object.assign(tab.style, { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 8px', cursor: 'pointer', fontSize: '12px', borderBottom: key === activeTab ? '3px solid #ff0000' : '3px solid transparent', color: (key === '__SEARCH_RESULTS__' || key.startsWith('__ARTIST_')) ? '#00ccff' : '#e6e6e6', minWidth: '44px', maxWidth: '120px', boxSizing: 'border-box' });
            const nameSpan = document.createElement('span'); nameSpan.textContent = shortName(meta.name || ('tab_' + key), 12);
            nameSpan.style.flex = '1'; nameSpan.style.overflow = 'hidden'; nameSpan.style.textOverflow = 'ellipsis'; nameSpan.style.whiteSpace = 'nowrap';
            const closeX = document.createElement('span'); closeX.textContent = '✕';
            Object.assign(closeX.style, { marginLeft: '6px', cursor: 'pointer', fontSize: '12px', opacity: '0.7' });
            closeX.addEventListener('click', (e) => {
                e.stopPropagation(); if (loadLockMode() && Object.keys(playlists).length <= 1) return;
                if (key === '__SEARCH_RESULTS__') { isSearchLocked = false; playlistSearchQuery = ''; const searchInput = document.querySelector('#yt-lucky-playlist-sidebar-v3 input[type="text"]'); if (searchInput) searchInput.value = ''; }
                delete playlists[key]; if (key === activeTab) { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); }
                saveAllPlaylists(); renderTabsBar(); renderPlaylistUI();
            });
            tab.addEventListener('click', () => {
                activeTab = key; saveActiveTab(activeTab); currentIndex = -1; saveLastIndex(-1); prefetchedNextUrl = null; prefetchedNextQuery = null;
                switchSidebarView('LIST');
                renderTabsBar(); renderPlaylistUI();
            });
            tab.appendChild(nameSpan); tab.appendChild(closeX); tabsBar.appendChild(tab);
        });
        const addLabelWrapper = document.createElement('label'); addLabelWrapper.title = 'Add .txt file as new tab'; addLabelWrapper.textContent = '+';
        Object.assign(addLabelWrapper.style, { flex: '0 0 auto', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#1f1f1f', color: '#fff', fontSize: '14px', marginLeft: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });
        let addInput = document.getElementById('yt-lucky-add-input-v3');
        if (!addInput) {
            addInput = document.createElement('input'); addInput.type = 'file'; addInput.accept = '.txt'; addInput.id = 'yt-lucky-add-input-v3'; addInput.style.display = 'none';
            addInput.addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; if (f && f.name.toLowerCase().endsWith('.txt')) readFileAsPlaylistTab(f); addInput.value = ''; });
            document.body.appendChild(addInput);
        }
        addLabelWrapper.appendChild(addInput); tabsBar.appendChild(addLabelWrapper); holder.appendChild(tabsBar);
    }

    function readFileAsPlaylistTab(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result || ''; const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            const key = makeTabKey(file.name); playlists[key] = { name: file.name, lines: lines };
            if (loadLockMode()) { const keep = {}; keep[key] = playlists[key]; playlists = keep; }
            activeTab = key; saveAllPlaylists(); saveActiveTab(activeTab); currentIndex = -1; saveLastIndex(-1); prefetchedNextUrl = null; prefetchedNextQuery = null;
            renderTabsBar(); renderPlaylistUI(); switchSidebarView('LIST');
        };
        reader.readAsText(file);
    }

    function renderPlaylistUI() {
        const listContainer = document.getElementById('yt-lucky-listcontainer-v3'); const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3');
        if (!listContainer || !sidebar) return;

        let pDisplayScrolls = [];
        if (loadPDisplayMode()) { const existingCols = listContainer.querySelectorAll('.yt-lucky-pdisplay-col'); existingCols.forEach(c => pDisplayScrolls.push(c.scrollTop)); }
        listContainer.innerHTML = '';

        const isAlternateView = (YtPotPlayer.panelElement && YtPotPlayer.panelElement.style.display === 'flex') ||
                                (YtLyrics.panelElement && YtLyrics.panelElement.style.display === 'flex') ||
                                (YtAIExplainer.panelElement && YtAIExplainer.panelElement.style.display === 'flex') ||
                                (YtAISettings.panelElement && YtAISettings.panelElement.style.display === 'flex');

        if (isAlternateView) {
            sidebar.style.display = 'flex';
        } else {
            sidebar.style.display = loadPlaylistVisible() ? 'flex' : 'none';
        }

        const keys = Object.keys(playlists).filter(k => k !== '__TRANSIENT_ARTIST__'); const pDisplay = loadPDisplayMode(); const searchActive = playlistSearchQuery.trim().length > 0;
        let searchResults = [];
        if (searchActive && !isSearchLocked) {
            const terms = playlistSearchQuery.toLowerCase().trim().split(/\s+/);
            keys.forEach(key => { if (key === '__SEARCH_RESULTS__') return; playlists[key].lines.forEach((line, idx) => { if (terms.every(t => line.toLowerCase().includes(t))) searchResults.push({ key, idx, line, pName: playlists[key].name }); }); });
        }
        if (pDisplay) {
            if(!isAlternateView) { listContainer.style.display = 'flex'; }
            listContainer.style.flexDirection = 'row'; listContainer.style.overflowX = 'auto'; listContainer.style.overflowY = 'hidden'; listContainer.style.gap = '10px'; listContainer.onscroll = null;
            let columnsCount = keys.length; if (searchActive && !isSearchLocked) columnsCount += 1; if (transientArtistData) columnsCount += 1;
            if (columnsCount === 0) { listContainer.innerHTML = '<div style="opacity:0.7;padding: 6px 4px;">(no playlists)</div>'; return; }
            const columnsToShow = Math.min(columnsCount, 4); const columnWidth = `calc(${100 / columnsToShow}% - ${(10 * (columnsToShow - 1)) / columnsToShow}px)`;
            const renderCol = (title, items, isTransientSearchCol = false, titleColor = '#ff6b6b', specificKey = null) => {
                const col = document.createElement('div'); col.className = 'yt-lucky-pdisplay-col';
                Object.assign(col.style, { flex: `0 0 ${columnWidth}`, height: '100%', overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '5px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' });
                const colHeader = document.createElement('div'); Object.assign(colHeader.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', marginBottom: '6px', color: titleColor, flexShrink: '0', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px' });
                const titleSpan = document.createElement('span'); titleSpan.textContent = title; titleSpan.style.overflow = 'hidden'; titleSpan.style.textOverflow = 'ellipsis'; titleSpan.style.whiteSpace = 'nowrap'; colHeader.appendChild(titleSpan);
                if (isTransientSearchCol || specificKey === '__SEARCH_RESULTS__') {
                    const lockBtn = document.createElement('span'); lockBtn.textContent = isSearchLocked ? '🔒' : '🔓'; lockBtn.title = isSearchLocked ? "Unlock & Close Search" : "Lock Search as Playlist"; lockBtn.style.cursor = 'pointer'; lockBtn.style.marginLeft = '4px'; lockBtn.style.fontSize = '12px';
                    lockBtn.onclick = () => {
                        if (isSearchLocked) { isSearchLocked = false; delete playlists['__SEARCH_RESULTS__']; saveAllPlaylists(); playlistSearchQuery = ''; const searchInput = document.querySelector('#yt-lucky-playlist-sidebar-v3 input[type="text"]'); if (searchInput) searchInput.value = ''; if (activeTab === '__SEARCH_RESULTS__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); } }
                        else { isSearchLocked = true; playlists['__SEARCH_RESULTS__'] = { name: `Search: ${playlistSearchQuery}`, lines: items.map(i => i.line), query: playlistSearchQuery }; saveAllPlaylists(); activeTab = '__SEARCH_RESULTS__'; saveActiveTab(activeTab); }
                        renderTabsBar(); renderPlaylistUI();
                    }; colHeader.appendChild(lockBtn);
                }
                col.appendChild(colHeader);
                if (items.length === 0 && isTransientSearchCol) { const empty = document.createElement('div'); empty.textContent = 'No matches found.'; empty.style.opacity = '0.5'; empty.style.fontSize = '12px'; empty.style.textAlign = 'center'; col.appendChild(empty); }
                items.forEach((itemObj) => {
                    const item = document.createElement('div'); const isCurrent = (!isTransientSearchCol && itemObj.key === activeTab && itemObj.idx === loadLastIndex());
                    if (isTransientSearchCol) item.innerHTML = `<span>${itemObj.line}</span> <span style="opacity:0.5; font-size:10px;">[${shortName(itemObj.pName, 8)}]</span>`;
                    else item.textContent = isCurrent ? `▶ ${(itemObj.idx + 1)}. ${itemObj.line}` : `${(itemObj.idx + 1)}. ${itemObj.line}`;
                    Object.assign(item.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isCurrent ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: isCurrent ? '#000' : '#fff', fontWeight: isCurrent ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', flexShrink: '0' });
                    if (isCurrent) item.classList.add('yt-lucky-active-item');
                    if (isTransientSearchCol) { item.onmouseenter = () => item.style.backgroundColor = 'rgba(255,255,255,0.1)'; item.onmouseleave = () => item.style.backgroundColor = 'transparent'; }
                    item.addEventListener('click', () => {
                        let extracted = artistModeEnabled ? extractArtistInfo(itemObj.line) : null;
                        if (artistModeEnabled && extracted && !loadPageMode()) { fetchArtistSongs(extracted); return; }
                        isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null; activeTab = isTransientSearchCol ? itemObj.key : specificKey; saveActiveTab(activeTab); currentIndex = itemObj.idx; saveLastIndex(currentIndex); localStorage.removeItem(STORAGE_AUTOPLAY_PIP_FLAG); switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI(); playOrNavigate(itemObj.line);
                    }); col.appendChild(item);
                }); listContainer.appendChild(col);
            };
            if (searchActive && !isSearchLocked) renderCol(`🔍 Results (${searchResults.length})`, searchResults, true, '#00ccff');
            if (transientArtistData) {
                const mappedItems = transientArtistData.lines.map((line, idx) => ({ key: '__TRANSIENT_ARTIST__', idx, line, pName: transientArtistData.name }));
                const col = document.createElement('div'); col.className = 'yt-lucky-pdisplay-col';
                Object.assign(col.style, { flex: `0 0 ${columnWidth}`, height: '100%', overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '5px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' });
                const colHeader = document.createElement('div'); Object.assign(colHeader.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', marginBottom: '6px', color: '#ffaa00', flexShrink: '0', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px' });
                const titleSpan = document.createElement('span'); titleSpan.textContent = `🎵 ${transientArtistData.name}`; colHeader.appendChild(titleSpan);
                const btnContainer = document.createElement('div'); const lockBtn = document.createElement('span'); lockBtn.textContent = '🔓'; lockBtn.title = "Lock Artist Search as Playlist"; lockBtn.style.cursor = 'pointer'; lockBtn.style.marginLeft = '4px';
                lockBtn.onclick = () => { const newKey = `__ARTIST_${Date.now()}`; playlists[newKey] = transientArtistData; activeTab = newKey; saveActiveTab(activeTab); saveAllPlaylists(); transientArtistData = null; switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI(); }; btnContainer.appendChild(lockBtn);
                const closeBtn = document.createElement('span'); closeBtn.textContent = '✕'; closeBtn.style.cursor = 'pointer'; closeBtn.style.marginLeft = '6px';
                closeBtn.onclick = () => { transientArtistData = null; if (activeTab === '__TRANSIENT_ARTIST__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); } switchSidebarView('LIST'); renderPlaylistUI(); }; btnContainer.appendChild(closeBtn); colHeader.appendChild(btnContainer); col.appendChild(colHeader);
                mappedItems.forEach((itemObj) => {
                    const item = document.createElement('div'); const isCurrent = (activeTab === '__TRANSIENT_ARTIST__' && itemObj.idx === loadLastIndex()); item.textContent = isCurrent ? `▶ ${(itemObj.idx + 1)}. ${itemObj.line}` : `${(itemObj.idx + 1)}. ${itemObj.line}`;
                    Object.assign(item.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isCurrent ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: isCurrent ? '#000' : '#fff', fontWeight: isCurrent ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', flexShrink: '0' }); if (isCurrent) item.classList.add('yt-lucky-active-item');
                    item.addEventListener('click', () => {
                        let extracted = artistModeEnabled ? extractArtistInfo(itemObj.line) : null; if (artistModeEnabled && extracted && !loadPageMode()) { fetchArtistSongs(extracted); return; }
                        isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null; playlists['__TRANSIENT_ARTIST__'] = transientArtistData; activeTab = '__TRANSIENT_ARTIST__'; saveActiveTab(activeTab); currentIndex = itemObj.idx; saveLastIndex(currentIndex); switchSidebarView('LIST'); renderPlaylistUI(); playOrNavigate(itemObj.line);
                    }); col.appendChild(item);
                }); listContainer.appendChild(col);
            }
            keys.forEach(key => {
                const mappedItems = playlists[key].lines.map((line, idx) => ({ key, idx, line, pName: playlists[key].name })); const isLockedSearch = (key === '__SEARCH_RESULTS__' || key.startsWith('__ARTIST_'));
                renderCol(isLockedSearch ? `🔍 ${shortName(playlists[key].name, 15)}` : shortName(playlists[key].name || 'playlist', 20), mappedItems, false, isLockedSearch ? '#00ccff' : '#ff6b6b', key);
            });
        } else {
            if(!isAlternateView) { listContainer.style.display = 'block'; }
            listContainer.style.overflowY = 'auto'; listContainer.style.overflowX = 'hidden'; listContainer.style.gap = '0';
            if (transientArtistData) {
                const artistHeader = document.createElement('div'); Object.assign(artistHeader.style, { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px' }); const titleSpan = document.createElement('span'); titleSpan.textContent = `🎵 ${transientArtistData.name}`; artistHeader.appendChild(titleSpan);
                const btnContainer = document.createElement('div'); const lockBtn = document.createElement('span'); lockBtn.textContent = '🔓'; lockBtn.title = "Lock as Playlist"; lockBtn.style.cursor = 'pointer'; lockBtn.onclick = () => { const newKey = `__ARTIST_${Date.now()}`; playlists[newKey] = transientArtistData; activeTab = newKey; saveActiveTab(activeTab); saveAllPlaylists(); transientArtistData = null; switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI(); }; btnContainer.appendChild(lockBtn);
                const closeBtn = document.createElement('span'); closeBtn.textContent = '✕'; closeBtn.style.cursor = 'pointer'; closeBtn.style.marginLeft = '8px'; closeBtn.onclick = () => { transientArtistData = null; if (activeTab === '__TRANSIENT_ARTIST__') { activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); } switchSidebarView('LIST'); renderPlaylistUI(); }; btnContainer.appendChild(closeBtn); artistHeader.appendChild(btnContainer); listContainer.appendChild(artistHeader);
                transientArtistData.lines.forEach((line, idx) => {
                    const item = document.createElement('div'); const isCurrent = (activeTab === '__TRANSIENT_ARTIST__' && idx === loadLastIndex()); item.textContent = isCurrent ? `▶ ${(idx + 1)}. ${line}` : `${(idx + 1)}. ${line}`;
                    Object.assign(item.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isCurrent ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: isCurrent ? '#000' : '#fff', fontWeight: isCurrent ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' }); if (isCurrent) item.classList.add('yt-lucky-active-item');
                    item.addEventListener('click', () => {
                        let extracted = artistModeEnabled ? extractArtistInfo(line) : null; if (artistModeEnabled && extracted && !loadPageMode()) { fetchArtistSongs(extracted); return; }
                        isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null; playlists['__TRANSIENT_ARTIST__'] = transientArtistData; activeTab = '__TRANSIENT_ARTIST__'; saveActiveTab(activeTab); currentIndex = idx; saveLastIndex(currentIndex); switchSidebarView('LIST'); renderPlaylistUI(); playOrNavigate(line);
                    }); listContainer.appendChild(item);
                });
            } else if (searchActive && !isSearchLocked) {
                const searchHeader = document.createElement('div'); Object.assign(searchHeader.style, { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', color: '#00ccff', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px' }); const titleSpan = document.createElement('span'); titleSpan.textContent = `🔍 Results (${searchResults.length})`; searchHeader.appendChild(titleSpan);
                const lockBtn = document.createElement('span'); lockBtn.textContent = '🔓'; lockBtn.title = "Lock Search as Playlist"; lockBtn.style.cursor = 'pointer'; lockBtn.onclick = () => { isSearchLocked = true; playlists['__SEARCH_RESULTS__'] = { name: `Search: ${playlistSearchQuery}`, lines: searchResults.map(r => r.line), query: playlistSearchQuery }; saveAllPlaylists(); activeTab = '__SEARCH_RESULTS__'; saveActiveTab(activeTab); switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI(); }; searchHeader.appendChild(lockBtn); listContainer.appendChild(searchHeader);
                if (searchResults.length === 0) { const empty = document.createElement('div'); empty.textContent = 'No matches found.'; empty.style.opacity = '0.7'; empty.style.padding = '6px 4px'; listContainer.appendChild(empty); return; }
                searchResults.forEach((res) => {
                    const item = document.createElement('div'); item.innerHTML = `<span>${res.line}</span> <span style="opacity:0.5; font-size:10px;">[${shortName(res.pName, 12)}]</span>`;
                    Object.assign(item.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'background-color 0.2s ease', fontSize: '12px' }); item.onmouseenter = () => item.style.backgroundColor = 'rgba(255,255,255,0.1)'; item.onmouseleave = () => item.style.backgroundColor = 'transparent';
                    item.addEventListener('click', () => {
                        let extracted = artistModeEnabled ? extractArtistInfo(res.line) : null; if (artistModeEnabled && extracted && !loadPageMode()) { fetchArtistSongs(extracted); return; }
                        isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null; activeTab = res.key; saveActiveTab(activeTab); currentIndex = res.idx; saveLastIndex(currentIndex); localStorage.removeItem(STORAGE_AUTOPLAY_PIP_FLAG); switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI(); playOrNavigate(res.line);
                    }); listContainer.appendChild(item);
                });
            } else {
                if (!activeTab || !playlists[activeTab] || playlists[activeTab].lines.length === 0) { listContainer.innerHTML = '<div style="opacity:0.7;padding: 6px 4px;">(empty)</div>'; return; }
                if (activeTab === '__SEARCH_RESULTS__') {
                    const lockedHeader = document.createElement('div'); Object.assign(lockedHeader.style, { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', color: '#00ccff', borderBottom: '1px solid #333', paddingBottom: '4px', fontSize: '13px' }); const titleSpan = document.createElement('span'); titleSpan.textContent = `🔍 ${playlists['__SEARCH_RESULTS__'].name}`; lockedHeader.appendChild(titleSpan);
                    const unlockBtn = document.createElement('span'); unlockBtn.textContent = '🔒'; unlockBtn.title = "Unlock & Close Search"; unlockBtn.style.cursor = 'pointer'; unlockBtn.onclick = () => { isSearchLocked = false; delete playlists['__SEARCH_RESULTS__']; saveAllPlaylists(); playlistSearchQuery = ''; const internalSearch = document.querySelector('#yt-lucky-playlist-sidebar-v3 input[type="text"]'); if (internalSearch) internalSearch.value = ''; activeTab = Object.keys(playlists)[0] || null; saveActiveTab(activeTab); switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI(); }; lockedHeader.appendChild(unlockBtn); listContainer.appendChild(lockedHeader);
                }
                const list = playlists[activeTab].lines; const lastIndex = loadLastIndex();
                list.forEach((line, idx) => {
                    const item = document.createElement('div'); const isCurrentByIndex = (idx === lastIndex); item.textContent = isCurrentByIndex ? `▶ Playing: ${(idx + 1)}. ${line}` : `${(idx + 1)}. ${line}`;
                    Object.assign(item.style, { padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isCurrentByIndex ? CURRENT_SONG_HIGHLIGHT_COLOR : 'transparent', color: isCurrentByIndex ? '#000' : '#fff', fontWeight: isCurrentByIndex ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'background-color 0.2s ease', fontSize: '12px' }); if (isCurrentByIndex) item.classList.add('yt-lucky-active-item');
                    item.addEventListener('click', () => {
                        let extracted = artistModeEnabled ? extractArtistInfo(line) : null; if (artistModeEnabled && extracted && !loadPageMode()) { fetchArtistSongs(extracted); return; }
                        isTransitioning = false; prefetchedNextUrl = null; prefetchedNextQuery = null; currentIndex = idx; saveLastIndex(currentIndex); localStorage.removeItem(STORAGE_AUTOPLAY_PIP_FLAG); switchSidebarView('LIST'); renderPlaylistUI(); playOrNavigate(line);
                    }); listContainer.appendChild(item);
                }); listContainer.onscroll = () => { localStorage.setItem(STORAGE_SCROLL, listContainer.scrollTop || 0); };
            }
        }
        if (currentIndex !== lastCenteredIndex || activeTab !== lastCenteredTab) { setTimeout(() => scrollToActiveTrack(true), 150); }
        else if (pDisplay) { const newCols = listContainer.querySelectorAll('.yt-lucky-pdisplay-col'); newCols.forEach((col, idx) => { if (pDisplayScrolls[idx] !== undefined) col.scrollTop = pDisplayScrolls[idx]; }); }
        else { const savedScroll = localStorage.getItem(STORAGE_SCROLL); if (savedScroll) listContainer.scrollTop = parseInt(savedScroll, 10); }
    }

    function fetchArtistSongs(artistName) {
        const inputSearch = document.querySelector('#yt-lucky-controls-v3-wrapper input[type="text"]'); const oldText = inputSearch ? inputSearch.value : ''; if (inputSearch) inputSearch.value = 'Fetching...';
        GM_xmlhttpRequest({
            method: 'GET', url: `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200`,
            onload: (response) => {
                if (inputSearch) inputSearch.value = oldText;
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.results && data.results.length > 0) {
                        const seen = new Set(); const songs = [];
                        data.results.forEach(track => { const tName = track.trackName.replace(/\s+/g, ' ').trim().toLowerCase(); if (!seen.has(tName)) { seen.add(tName); songs.push(`${track.artistName} - ${track.trackName}`); } });
                        if (songs.length > 0) {
                            transientArtistData = { name: `Artist: ${artistName}`, lines: songs }; activeTab = '__TRANSIENT_ARTIST__'; saveActiveTab(activeTab);
                            switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
                        } else fallbackYoutubeArtistSearch(artistName, inputSearch, oldText);
                    } else fallbackYoutubeArtistSearch(artistName, inputSearch, oldText);
                } catch(e) { fallbackYoutubeArtistSearch(artistName, inputSearch, oldText); }
            }, onerror: () => fallbackYoutubeArtistSearch(artistName, inputSearch, oldText)
        });
    }

    function fallbackYoutubeArtistSearch(artistName, inputSearch, oldText) {
        if (inputSearch) inputSearch.value = 'YT Fetching...';
        GM_xmlhttpRequest({
            method: 'GET', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(artistName + " songs")}`,
            onload: (response) => {
                if (inputSearch) inputSearch.value = oldText;
                try {
                    const match = response.responseText.match(/var ytInitialData = (\{.*?\});/);
                    if (match) {
                        const data = JSON.parse(match[1]); const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []; let songs = [];
                        for (const section of contents) { if (section.itemSectionRenderer?.contents) { for (const item of section.itemSectionRenderer.contents) { if (item.videoRenderer && item.videoRenderer.title) songs.push(item.videoRenderer.title.runs[0].text); } } }
                        if (songs.length > 0) {
                            transientArtistData = { name: `Artist: ${artistName} (YT)`, lines: songs }; activeTab = '__TRANSIENT_ARTIST__'; saveActiveTab(activeTab);
                            switchSidebarView('LIST'); renderTabsBar(); renderPlaylistUI();
                        } else alert("No songs found for this artist.");
                    }
                } catch(e) { alert("Error parsing YouTube data."); }
            }, onerror: () => { if (inputSearch) inputSearch.value = oldText; alert("Network error fetching artist songs."); }
        });
    }

    function initUI() {
        if (document.getElementById('yt-lucky-controls-v3-wrapper')) return;
        document.querySelectorAll('#yt-lucky-controls-v3-wrapper').forEach(e => e.remove());
        const wrapper = document.createElement('div'); wrapper.id = 'yt-lucky-controls-v3-wrapper';
        const row1 = document.createElement('div'); row1.className = 'yt-lucky-ctrl-row'; const row2 = document.createElement('div'); row2.className = 'yt-lucky-ctrl-row';
        const inputSearch = document.createElement('input'); inputSearch.type = 'text'; inputSearch.placeholder = 'Search...'; Object.assign(inputSearch.style, { padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', background: '#fff', color: '#000', width: '90px' });
        const btnSearch = document.createElement('button'); btnSearch.textContent = 'Go'; Object.assign(btnSearch.style, { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: '#f1f1f1' }); btnSearch.onclick = () => { const q = inputSearch.value.trim(); if (q) { if (artistModeEnabled && !loadPageMode()) fetchArtistSongs(q); else playOrNavigate(q); } }; inputSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnSearch.click(); });
        const artistBtn = document.createElement('button'); artistBtn.textContent = 'Artist'; Object.assign(artistBtn.style, { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: artistModeEnabled ? '#ffaa00' : '#f1f1f1' });
        const artistFormatBtn = document.createElement('button'); artistFormatBtn.textContent = isArtistFirst ? 'A-T' : 'T-A'; artistFormatBtn.title = isArtistFirst ? 'Format: Artist - Title' : 'Format: Title - Artist'; Object.assign(artistFormatBtn.style, { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: '#e0e0e0', display: artistModeEnabled ? 'inline-block' : 'none' });
        artistFormatBtn.onclick = (e) => { e.preventDefault(); isArtistFirst = !isArtistFirst; localStorage.setItem('yt_lucky_artist_format_left', isArtistFirst ? '1' : '0'); artistFormatBtn.textContent = isArtistFirst ? 'A-T' : 'T-A'; artistFormatBtn.title = isArtistFirst ? 'Format: Artist - Title' : 'Format: Title - Artist'; };
        artistBtn.onclick = (e) => { e.preventDefault(); artistModeEnabled = !artistModeEnabled; localStorage.setItem('yt_lucky_artist_mode', artistModeEnabled ? '1' : '0'); artistBtn.style.background = artistModeEnabled ? '#ffaa00' : '#f1f1f1'; artistFormatBtn.style.display = artistModeEnabled ? 'inline-block' : 'none'; };

        const lyricsButton = document.createElement('button'); lyricsButton.textContent = '🎵 Lyrics';
        Object.assign(lyricsButton.style, { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: '#f1f8e9' });
        lyricsButton.onclick = (e) => {
            e.preventDefault();
            const isLyricsOpen = YtLyrics.panelElement && YtLyrics.panelElement.style.display === 'flex';
            switchSidebarView(isLyricsOpen ? 'LIST' : 'LYRICS');
        };

        const audioButton = document.createElement('button'); audioButton.textContent = '🎵 Audio'; audioButton.id = 'yt-lucky-audio-btn'; Object.assign(audioButton.style, { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: '#f1f1f1' }); audioButton.addEventListener('click', () => { toggleAudioOnlyMode(); });
        row1.append(inputSearch, btnSearch, artistBtn, artistFormatBtn, lyricsButton, audioButton);
        const autoplayOn = loadAutoplayEnabled(); const autoplayToggleBtn = document.createElement('button'); autoplayToggleBtn.textContent = autoplayOn ? 'Auto: ON' : 'Auto: OFF'; Object.assign(autoplayToggleBtn.style, { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: autoplayOn ? '#aaffaa' : '#f1f1f1' }); autoplayToggleBtn.addEventListener('click', () => { const newVal = !loadAutoplayEnabled(); saveAutoplayEnabled(newVal); autoplayToggleBtn.textContent = newVal ? 'Auto: ON' : 'Auto: OFF'; autoplayToggleBtn.style.background = newVal ? '#aaffaa' : '#f1f1f1'; });
        const isVisible = loadPlaylistVisible(); const togglePlaylistBtn = document.createElement('button'); togglePlaylistBtn.textContent = isVisible ? 'List: Hide' : 'List: Show'; Object.assign(togglePlaylistBtn.style, { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: '#f1f1f1' }); togglePlaylistBtn.addEventListener('click', () => { const sidebar = document.getElementById('yt-lucky-playlist-sidebar-v3'); const newState = sidebar.style.display === 'none'; sidebar.style.display = newState ? 'flex' : 'none'; togglePlaylistBtn.textContent = newState ? 'List: Hide' : 'List: Show'; savePlaylistVisible(newState); updateVideoShift(); });
        row2.append(autoplayToggleBtn, togglePlaylistBtn); wrapper.append(row1, row2);

        const desktopTop = document.querySelector('ytd-masthead #end, ytd-masthead #end-container, #end');
        if (desktopTop) desktopTop.prepend(wrapper);
        else { const app = document.querySelector('ytm-app') || document.querySelector('ytd-app') || document.body; if (app) app.prepend(wrapper); }

        createPlaylistSidebar(); renderTabsBar(); renderPlaylistUI();
    }

    function initAudioOnlyMode() { if (loadAudioOnlyMode()) enableAudioOnlyMode(); }
    function enableAudioOnlyMode() {
        const video = document.querySelector('video'); const videoContainer = document.querySelector('#movie_player, .html5-video-player');
        if (video && videoContainer) {
            video.style.opacity = '0'; video.style.visibility = 'hidden';
            let overlay = document.getElementById('yt-lucky-audio-overlay');
            if (!overlay) {
                overlay = document.createElement('div'); overlay.id = 'yt-lucky-audio-overlay';
                Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', background: '#000', zIndex: '9998' });
                videoContainer.style.position = 'relative'; videoContainer.appendChild(overlay);
            }
            if (video.paused) video.play().catch(console.error);
        }
        if (qualityInterval) clearInterval(qualityInterval);
        qualityInterval = setInterval(() => {
            const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
            if (player && typeof player.setPlaybackQualityRange === 'function') {
                try { player.setPlaybackQualityRange('tiny', 'tiny'); player.setPlaybackQuality('tiny'); } catch(e) {}
            }
        }, 1500);
    }
    function disableAudioOnlyMode() {
        const video = document.querySelector('video'); const overlay = document.getElementById('yt-lucky-audio-overlay');
        if (video) { video.style.opacity = '1'; video.style.visibility = 'visible'; }
        if (overlay) overlay.remove();
        if (qualityInterval) clearInterval(qualityInterval);
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (player && typeof player.setPlaybackQualityRange === 'function') {
            try { player.setPlaybackQualityRange('highres', 'highres'); player.setPlaybackQuality('auto'); } catch(e) {}
        }
    }
    function toggleAudioOnlyMode() { const newState = !loadAudioOnlyMode(); saveAudioOnlyMode(newState); if (newState) enableAudioOnlyMode(); else disableAudioOnlyMode(); updateAudioButtonState(newState); return newState; }
    function updateAudioButtonState(isEnabled) { const audioBtn = document.getElementById('yt-lucky-audio-btn'); if (audioBtn) { audioBtn.textContent = isEnabled ? '🎵 Audio ON' : '🎵 Audio'; audioBtn.style.background = isEnabled ? '#4a4a4a' : '#f1f1f1'; } }

    playlists = loadAllPlaylists(); if (playlists['__SEARCH_RESULTS__']) { isSearchLocked = true; playlistSearchQuery = playlists['__SEARCH_RESULTS__'].query || ''; }
    activeTab = loadActiveTab(); if (activeTab === '__TRANSIENT_ARTIST__' || !playlists[activeTab]) { if (Object.keys(playlists).length) activeTab = Object.keys(playlists)[0]; else activeTab = null; }
    currentIndex = loadLastIndex();

    // ==========================================
    // INITIALIZATION & OBSERVERS
    // ==========================================
    let lastKnownTitle = ''; let lastKnownIndex = -1;

    function runStateObserver() {
        const currentTitle = getCurrentVideoTitle(); const currentIdx = loadLastIndex(); let requiresReRender = false;
        if (currentTitle && currentTitle !== lastKnownTitle) {
            requiresReRender = true; lastKnownTitle = currentTitle;

            const videoId = extractVideoId(window.location.href);
            if (videoId) YtLyrics.onVideoChange(videoId, true);

            // Auto-explain newly navigated track if user is on AIEx tab
            if (YtAIExplainer.panelElement && YtAIExplainer.panelElement.style.display === 'flex') {
                YtAIExplainer.explainCurrentSong();
            }
        }
        if (currentIdx !== lastKnownIndex) { requiresReRender = true; lastKnownIndex = currentIdx; }
        const video = document.querySelector('video');
        if (video && !video._ytLuckyAttached) {
            video._ytLuckyAttached = true;
            video.addEventListener('ended', triggerNextSong);
            video.addEventListener('timeupdate', () => { if (!video.paused && video.duration > 0 && (video.duration - video.currentTime) <= 1.5) triggerNextSong(); });
            video.addEventListener('playing', () => { prefetchNextSong(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
            video.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
            if (_audioCtx && !video._ytLuckyAudioConnected) setupAudioNodes(video);
            requiresReRender = true;
        }
        if (requiresReRender) setTimeout(() => { renderTabsBar(); renderPlaylistUI(); startProgressTracking(); }, 300);
        if (document.querySelector('ytd-watch-flexy') && document.querySelector('ytd-watch-flexy').style.paddingRight === '') updateVideoShift();
    }

    const mainObserver = new MutationObserver(() => {
        if (!document.body) return;

        if (!window._ytLuckyBootstrapped) {
            const topBar = document.querySelector('ytd-masthead #end, ytd-masthead #end-container, #end');
            if (topBar) {
                window._ytLuckyBootstrapped = true;
                YtPotPlayer.init();
                YtLyrics.init();
                YtAIExplainer.init();
                YtAISettings.init();
                initBackgroundBypass();
                YtAnchor.init();
                initUI();
                startProgressTracking();
                if (loadAutoplayEnabled()) enforcePlayback();
                initAudioOnlyMode();
            }
            return;
        }

        if (!document.getElementById('yt-lucky-controls-v3-wrapper')) {
            setTimeout(() => { if (!document.getElementById('yt-lucky-controls-v3-wrapper')) initUI(); }, 150);
        }

        runStateObserver();
    });

    mainObserver.observe(document.documentElement, { childList: true, subtree: true });

    setInterval(() => { if (document.querySelector('video')) updateProgressBar(); }, 1000);

    // Auto-retry on Playback Error
    setInterval(() => {
        const errorEl = document.querySelector('.ytp-error');
        const video = document.querySelector('video');
        const isErrorUI = errorEl && errorEl.style.display !== 'none';
        const isVideoError = video && video.error;

        if (isErrorUI || isVideoError) {
            const title = getCurrentVideoTitle() || 'Unknown Track';
            if (!YtPotPlayer.state.failed.includes(title)) {
                YtPotPlayer.state.failed.push(title + ' (Playback Error)');
                console.warn('YTLucky: Playback error detected. Skipping track.');
            }
            const closeBtn = document.querySelector('.ytp-error-button');
            if (closeBtn) closeBtn.click();
            else if (errorEl) errorEl.style.display = 'none';
            triggerNextSong();
        }
    }, 3000);

})();
