(function () {
    'use strict';

    // ==========================================
    // 1. PLATFORM DETECTION
    // ==========================================
    const PLATFORM = (() => {
        const h = location.hostname;
        if (h.includes('twitter.com') || h.includes('x.com')) return 'twitter';
        if (h.includes('reddit.com')) return 'reddit';
        if (h.includes('facebook.com')) return 'facebook';
        return 'unknown';
    })();

    // ==========================================
    // 2. PLATFORM ADAPTERS
    // ==========================================
    const ADAPTERS = {
        twitter: {
            anchorSelector: `[role="group"], article`,
            alreadyTagged: 'data-ai-tools',
            getWrapper(el) {
                return el.closest('[role="group"]') || el.closest('article');
            },
            getText(wrapper) {
                const article = wrapper.closest('article') || wrapper;
                const textNode = article.querySelector('[data-testid="tweetText"]');
                return textNode ? textNode.innerText.trim() : article.innerText.trim();
            },
            injectBtn(wrapper, btn) {
                if (wrapper.getAttribute('role') === 'group') {
                    wrapper.appendChild(btn);
                } else {
                    const group = wrapper.querySelector('[role="group"]');
                    if (group) group.appendChild(btn);
                    else wrapper.appendChild(btn);
                }
            }
        },

        reddit: {
            anchorSelector: 'shreddit-post',
            alreadyTagged: 'data-ai-tools',
            getWrapper(el) {
                // Only attach inside a slotted element ([slot="credit-bar"]) so Shadow DOM
                // always renders the buttons. Never append unslotted children to <shreddit-post>.
                return el.querySelector('[slot="credit-bar"]');
            },
            getText(wrapper) {
                const shPost = wrapper.closest('shreddit-post');
                if (shPost) {
                    const title =
                        shPost.getAttribute('post-title') ||
                        shPost.getAttribute('title') ||
                        shPost.querySelector('[slot="title"], h1, h2')?.innerText ||
                        '';
                    const slot = shPost.querySelector('[slot="text-body"], [data-post-click-location="text-body"]');
                    const bodyText = slot ? slot.innerText.trim() : '';
                    return [title, bodyText].filter(Boolean).join('\n\n').trim();
                }
                return '';
            },
            injectBtn(wrapper, btn) {
                const overflowMenu =
                    wrapper.querySelector('shreddit-post-overflow-menu')?.closest('shreddit-async-loader') ||
                    wrapper.querySelector('shreddit-post-overflow-menu, shreddit-async-loader[bundlename*="overflow"]');

                const trailingContainer =
                    overflowMenu?.parentElement && overflowMenu.parentElement !== wrapper
                        ? overflowMenu.parentElement
                        : wrapper.children.length >= 2 && !wrapper.hasAttribute('data-rgb-feed-credit-bar')
                            ? wrapper.lastElementChild
                            : null;

                // Classic / Desktop credit-bar with a trailing container for Join + Overflow menu
                if (trailingContainer) {
                    trailingContainer.style.display = 'inline-flex';
                    trailingContainer.style.alignItems = 'center';
                    trailingContainer.style.gap = '6px';
                    trailingContainer.style.position = 'relative';
                    trailingContainer.style.zIndex = '5';
                    trailingContainer.style.pointerEvents = 'auto';

                    const joinBtn = trailingContainer.querySelector('shreddit-join-button');
                    const anchor = joinBtn || overflowMenu;
                    if (anchor) {
                        trailingContainer.insertBefore(btn, anchor);
                    } else {
                        trailingContainer.prepend(btn);
                    }
                    return;
                }

                // Mobile data-rgb-feed-credit-bar / single-child flex-col layout:
                // Pin buttons cleanly at the top-right inside [slot="credit-bar"].
                wrapper.style.position = 'relative';
                wrapper.style.width = '100%';
                wrapper.style.boxSizing = 'border-box';

                const hasOverflowInside = !!wrapper.querySelector(
                    'shreddit-post-overflow-menu, button[aria-label*="more" i], faceplate-dropdown-menu'
                );
                wrapper.style.paddingRight = hasOverflowInside ? '144px' : '112px';

                Object.assign(btn.style, {
                    position: 'absolute',
                    top: '0px',
                    right: hasOverflowInside ? '36px' : '4px',
                    zIndex: '10',
                    marginRight: '0'
                });
                wrapper.appendChild(btn);
            }
        },

        facebook: {
            anchorSelector: [
                '[role="article"] [aria-label^="Actions for this post"][role="button"]',
                '[role="article"] [aria-label*="Actions for this post"]',
                '[data-pagelet^="FeedUnit"] [aria-label*="Actions for this post"]',
                '[aria-label^="Actions for this post"][role="button"]'
            ].join(', '),
            alreadyTagged: 'data-ai-tools',
            getWrapper(el) {
                const nativeRow = el.closest('.xqcrz7y') || el.closest('[role="toolbar"]') || el.parentElement;
                if (nativeRow && nativeRow.parentElement) return nativeRow.parentElement;
                return el.parentElement?.parentElement?.parentElement || el.parentElement;
            },
            getText(wrapper) {
                const post = wrapper.closest('[role="article"], [data-pagelet^="FeedUnit"], [data-tracking-duration-id], article, .userContentWrapper')
                    || (() => {
                        let curr = wrapper;
                        for (let i = 0; i < 8; i++) {
                            if (!curr || !curr.parentElement || curr.parentElement === document.body) break;
                            curr = curr.parentElement;
                            if (curr.getAttribute('role') === 'article' || curr.getAttribute('data-pagelet')?.startsWith('FeedUnit')) return curr;
                            if (curr.getAttribute('role') === 'feed' || curr.getAttribute('role') === 'main') break;
                        }
                        return curr || wrapper;
                    })();

                if (!post) return '';

                const messageSelectors = [
                    '[data-ad-rendering-role="story_message"]',
                    '[data-ad-comet-preview="message"]',
                    '[data-ad-preview="message"]',
                    '[data-testid="post_message"]',
                    '.userContent',
                    'div[style*="text-align: start"][dir="auto"]'
                ];

                for (const sel of messageSelectors) {
                    const msgEl = post.querySelector(sel);
                    if (msgEl) {
                        const txt = msgEl.innerText.trim();
                        if (txt.length > 5 && txt.toLowerCase() !== 'facebook') {
                            return txt;
                        }
                    }
                }

                const candidates = [];
                const dirNodes = post.querySelectorAll('[dir="auto"]');
                for (const node of dirNodes) {
                    if (node.closest('h2, h3, h4, header, [data-ad-rendering-role="profile_name"], [role="toolbar"], [role="button"], .ai-tools-action-btn-wrap, form, ul')) {
                        continue;
                    }
                    const txt = node.innerText.trim();
                    if (txt.length > 5 && txt.toLowerCase() !== 'facebook' && !txt.startsWith('http')) {
                        candidates.push(txt);
                    }
                }

                if (candidates.length > 0) {
                    candidates.sort((a, b) => b.length - a.length);
                    return candidates[0];
                }

                return '';
            },
            injectBtn(wrapper, btn) {
                const nativeRow = wrapper.querySelector('.xqcrz7y');
                if (nativeRow) {
                    wrapper.insertBefore(btn, nativeRow);
                } else {
                    const anchor = wrapper.querySelector('[aria-label*="Actions for this post"]') || wrapper.firstElementChild;
                    if (anchor) wrapper.insertBefore(btn, anchor);
                    else wrapper.appendChild(btn);
                }
            }
        }
    };

    const ADAPTER = ADAPTERS[PLATFORM];

    // ==========================================
    // 3. CONSTANTS & DATA
    // ==========================================
    const MODEL_OPTIONS = {
        gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        openrouter: ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat', 'anthropic/claude-3.5-haiku'],
        groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.1-8b-instant'],
        cerebras: ['gpt-oss-120b', 'llama3.1-8b', 'llama-3.3-70b']
    };

    const FONT_OPTIONS = [
        { label: 'System Default', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
        { label: 'TwitterChirp', value: '"TwitterChirp", -apple-system, sans-serif' },
        { label: 'Bodoni Moda', value: "'Bodoni Moda', serif" },
        { label: 'Playfair Display', value: "'Playfair Display', serif" },
        { label: 'Inter', value: "'Inter', sans-serif" },
        { label: 'Josefin Sans', value: "'Josefin Sans', sans-serif" },
        { label: 'Georgia', value: 'Georgia, serif' },
        { label: 'Courier Prime', value: "'Courier Prime', monospace" }
    ];

    const DEFAULT_SETTINGS = {
        apiMode: 'Hybrid',
        geminiKey: '',
        geminiModel: 'gemini-2.5-flash-lite',
        openrouterKey: '',
        openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
        groqKey: '',
        groqModel: 'llama-3.3-70b-versatile',
        cerebrasKey: '',
        cerebrasModel: 'gpt-oss-120b',
        enableCopy: true,
        enableTruth: true,
        enableExplain: true,
        enableReply: true,
        enableTwitter: true,
        enableReddit: true,
        enableFacebook: true,
        explainDepth: 'Detailed',
        maxQuestions: 3,
        uiFont: FONT_OPTIONS[0].value,
        uiFontSize: 13,
        uiWidth: 450,
        uiHeight: 550,
        uiButtonSize: 'M',
        themeMode: 'Auto'
    };

    const TONE_LIBRARY = [
        { group: "Neutral & Informational", tones: ["Professional", "Formal", "Factual", "Informative", "Academic", "Analytical", "Objective", "Measured", "Precise", "Serious"] },
        { group: "Conversational & Social", tones: ["Casual", "Friendly", "Warm", "Approachable", "Playful", "Witty", "Humorous", "Bantering", "Quirky", "Charming"] },
        { group: "Positive Emotional", tones: ["Happy", "Joyful", "Cheerful", "Optimistic", "Encouraging", "Hopeful", "Grateful", "Appreciative", "Proud", "Excited"] },
        { group: "Affection & Romantic", tones: ["Affectionate", "Loving", "Romantic", "Flirty", "Tender", "Adoring", "Admiring", "Devoted", "Heartwarming", "Passionate"] },
        { group: "Reflective & Thoughtful", tones: ["Thoughtful", "Reflective", "Contemplative", "Philosophical", "Introspective", "Nostalgic", "Poignant", "Sentimental", "Meditative", "Pensive"] },
        { group: "Negative Emotional", tones: ["Angry", "Irritated", "Frustrated", "Resentful", "Bitter", "Cynical", "Melancholic", "Sad", "Grieving", "Miserable"] },
        { group: "Fear & Anxiety", tones: ["Anxious", "Nervous", "Worried", "Uneasy", "Tense", "Suspenseful", "Alarmed", "Horrified", "Panicked", "Apprehensive"] },
        { group: "Cold or Detached", tones: ["Cold", "Detached", "Indifferent", "Distant", "Curt", "Blunt", "Stoic", "Matter-of-fact", "Unemotional", "Apathetic"] },
        { group: "Critical & Confrontational", tones: ["Critical", "Skeptical", "Questioning", "Doubtful", "Sarcastic", "Ironic", "Satirical", "Mocking", "Scornful", "Disrespectful"] },
        { group: "Bold or Aggressive", tones: ["Bold", "Assertive", "Audacious", "Defiant", "Rebellious", "Provocative", "Edgy", "Challenging", "Boastful", "Arrogant"] },
        { group: "Dramatic & Literary", tones: ["Dramatic", "Poetic", "Elegant", "Allusive", "Mysterious", "Ominous", "Grim", "Tragic", "Fanciful", "Whimsical"] },
        { group: "Response / Dialogue", tones: ["Agreement", "Disagreement", "Accepting", "Supportive", "Empathetic", "Apologetic", "Puzzled", "Curious", "Incredulous", "Persuasive"] },
        { group: "Specialized", tones: ["Condescending", "Patronizing", "Reverent", "Respectful", "Inspirational", "Motivational", "Resigned", "Awestruck", "Shocked", "Confessional"] }
    ];

    const REPLY_LABELS = {
        twitter: { name: 'Tweet', charLimit: 280, limitNote: 'Must be under 280 characters (Twitter limit).' },
        reddit:  { name: 'Comment', charLimit: 10000, limitNote: 'Reddit comments can be long — aim for quality over brevity.' },
        facebook:{ name: 'Comment', charLimit: 8000, limitNote: 'Facebook comments can be conversational and a few sentences long.' }
    };
    const REPLY_LABEL = REPLY_LABELS[PLATFORM] || { name: 'Reply', charLimit: 1000, limitNote: '' };

    const HUMANIZER_PROMPT = `
Act as a world-class text humanizer. Your expertise lies in converting machine-generated content into natural, nuanced, and emotionally resonant writing that is indistinguishable from authentic human prose. Your goal is to maintain the core meaning while ensuring the output flows spontaneously and feels written in-the-moment—always with logical structure, emotional subtlety, and cultural context.

OUTPUT REQUIREMENTS:
- Use a conversational, spontaneous tone. Include contractions, idioms, and colloquial expressions.
- Mix formal and casual phrasing naturally. Include mild contradictions that are later explained for realism.
- Mimic human imperfections like slightly informal phrasing, redundancy, or unexpected transitions.
- Vary sentence length and structure (short bursts + long meandering ones). Aim for high perplexity and burstiness.
- Ensure the result passes as something written spontaneously by a thoughtful human — not a machine.
- Avoid marketing clichés, excessive adverbs, buzzwords. Embrace clear, direct sentences.
`;

    // ==========================================
    // 4. SETTINGS MANAGER (native-first storage)
    // ==========================================
    const Settings = {
        _cache: {},

        get(key) {
            if (key in this._cache) return this._cache[key];

            const storageKey = `x_adv_${key}`;
            let value;

            try {
                if (typeof GM_getValue === 'function') {
                    const v = GM_getValue(storageKey, undefined);
                    if (v !== undefined && v !== null) value = v;
                }
            } catch (e) {
                console.warn('Settings.get: GM_getValue failed', e);
            }

            if (value === undefined) {
                try {
                    if (typeof hcj !== 'undefined' && hcj.config) {
                        const v = hcj.config.get(storageKey, undefined);
                        if (v !== undefined) value = v;
                    }
                } catch (e) {}
            }

            if (value === undefined) {
                try {
                    const raw = localStorage.getItem(storageKey);
                    if (raw !== null) {
                        value = JSON.parse(raw);
                        if (typeof GM_setValue === 'function') {
                            try { GM_setValue(storageKey, value); } catch (e) {}
                        }
                    }
                } catch (e) {}
            }

            if (value === undefined) value = DEFAULT_SETTINGS[key];
            this._cache[key] = value;
            return value;
        },

        set(key, val) {
            const storageKey = `x_adv_${key}`;
            this._cache[key] = val;

            try {
                if (typeof GM_setValue === 'function') {
                    GM_setValue(storageKey, val);
                }
            } catch (e) {
                console.warn('Settings.set: GM_setValue failed', e);
            }

            try {
                if (typeof hcj !== 'undefined' && hcj.config) {
                    hcj.config.set(storageKey, val);
                }
            } catch (e) {}

            try {
                localStorage.setItem(storageKey, JSON.stringify(val));
            } catch (e) {}
        },

        getAll() {
            const cfg = {};
            for (let k in DEFAULT_SETTINGS) cfg[k] = this.get(k);
            return cfg;
        }
    };

    // ==========================================
    // 5. CSS INJECTION (Matched to Toolkit Theme)
    // ==========================================
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&family=Josefin+Sans:wght@400;600;700&family=Courier+Prime:ital@0;1&display=swap');

        .ai-tools-panel {
            position: fixed; z-index: 2147483647; border-radius: 12px;
            display: flex; flex-direction: column; overflow: hidden;
            box-shadow: 0 16px 48px rgba(0,0,0,0.85), 0 0 0 0.5px rgba(255,255,255,0.06);
            transition: opacity 0.2s ease;
            background: #0a1520 !important;
            color: #e7e9ea !important;
            border: 1px solid #1e2d3d !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .ai-tools-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 14px; border-bottom: 1px solid #1e2d3d;
            font-weight: bold; font-size: 13px;
            background: #0d1b26;
            color: #e7e9ea;
        }
        .ai-tools-body {
            flex: 1; overflow-y: auto; padding: 16px;
            display: flex; flex-direction: column; gap: 12px;
            background: #0a1520;
        }
        .ai-tools-footer {
            padding: 12px 16px; border-top: 1px solid #1e2d3d;
            display: flex; gap: 8px; align-items: center;
            background: #0d1b26;
        }
        .ai-tools-btn-chrome {
            background: none; border: none; cursor: pointer; padding: 4px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            transition: background 0.2s; color: #8b98a5;
        }
        .ai-tools-btn-chrome:hover { background: rgba(255,255,255,0.1); color: #e7e9ea; }
        .ai-tools-chat-msg {
            padding: 8px 12px; border-radius: 12px; max-width: 90%;
            line-height: 1.5; font-size: 14px; margin-bottom: 4px;
        }
        .ai-tools-chat-user { align-self: flex-end; background: #1d9bf0; color: #fff; }
        .ai-tools-chat-bot  { align-self: flex-start; background: #16222f; color: #e7e9ea; }
        .ai-tools-input {
            flex: 1; border: 1px solid #1e2d3d; border-radius: 20px;
            padding: 8px 14px; background: #0d1b26; outline: none;
            font-size: 14px; color: #e7e9ea;
        }
        .ai-tools-input::placeholder { color: #536471; }
        .ai-tools-chip {
            display: inline-block; padding: 4px 10px; border-radius: 16px;
            font-size: 12px; cursor: pointer; border: 1px solid #1e2d3d;
            margin: 3px 2px; user-select: none; transition: all 0.2s;
            color: #8b98a5; background: #16222f;
        }
        .ai-tools-chip:hover { border-color: #1d9bf0; color: #1d9bf0; }
        .ai-tools-chip.active { background: #1d9bf0; color: #fff; border-color: #1d9bf0; }
        .ai-tools-group summary { font-size: 12px; font-weight: bold; cursor: pointer; margin-bottom: 6px; padding-top: 8px; color: #8b98a5; }
        .ai-tools-qa summary { cursor: pointer; color: #1d9bf0; font-weight: bold; font-size: 13px; margin-top: 6px; }
        .ai-tools-qa p { margin: 6px 0 0 12px; padding-left: 10px; border-left: 2px solid #1d9bf0; font-size: 13px; color: #8b98a5; }
        .ai-tools-settings {
            display: none; padding: 16px; border-bottom: 1px solid #1e2d3d;
            font-size: 12px; flex-direction: column; gap: 12px;
            max-height: 55vh; overflow-y: auto;
            background: #0d1b26; color: #e7e9ea;
        }
        .ai-tools-settings.active { display: flex; }
        .ai-tools-settings label { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: #8b98a5; }
        .ai-tools-settings input[type="text"], .ai-tools-settings input[type="password"], .ai-tools-settings input[type="number"], .ai-tools-settings select {
            padding: 6px; border-radius: 5px;
            background: #0a1520; border: 1px solid #1e2d3d;
            color: #e7e9ea; flex: 1; max-width: 60%; outline: none;
        }
        .ai-tools-settings input[type="range"] { accent-color: #1d9bf0; flex: 1; height: 3px; }
        .ai-tools-api-wrap { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px dashed #1e2d3d; border-radius: 6px; }
        .ai-tools-error { color: #f4212e; padding: 10px; background: rgba(244,33,46,0.1); border-radius: 8px; font-size: 13px; border: 1px solid #f4212e; }

        /* ─── INJECTED ACTION BUTTONS ─── */
        .ai-tools-action-btn-wrap {
            display: inline-flex;
            align-items: center;
            flex-shrink: 0;
            gap: 2px;
        }
        .ai-tools-action-btn {
            display: inline-flex; align-items: center; justify-content: center;
            background: transparent; border: 1px solid rgba(128,128,128,0.4);
            border-radius: 5px; cursor: pointer; font-size: 11px;
            font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #71767b; line-height: 1; transition: all 0.15s;
            user-select: none; padding: 0; width: 22px; height: 22px;
            box-sizing: border-box; vertical-align: middle;
        }
        .ai-tools-action-btn:hover { background: rgba(29,155,240,0.12); color: #1d9bf0; border-color: #1d9bf0; }

        /* REDDIT */
        shreddit-post [slot="credit-bar"]:has(.ai-tools-action-btn-wrap) {
            position: relative !important;
            z-index: 3 !important;
        }
        shreddit-post .ai-tools-action-btn-wrap {
            position: relative;
            z-index: 5 !important;
            pointer-events: auto !important;
            touch-action: manipulation !important;
            align-self: center;
            margin-right: 4px;
            gap: 6px;
        }
        shreddit-post .ai-tools-action-btn {
            position: relative !important;
            z-index: 5 !important;
            pointer-events: auto !important;
            touch-action: manipulation !important;
            width: 22px;
            height: 22px;
            min-width: 22px;
            min-height: 22px;
            font-size: 11px;
            border-radius: 5px;
            color: var(--color-neutral-content-weak, #818384);
            border: 1px solid rgba(128, 128, 128, 0.35);
            background: rgba(15, 26, 28, 0.75);
        }
        shreddit-post .ai-tools-action-btn:hover {
            background: rgba(255, 69, 0, 0.15);
            color: #ff4500;
            border-color: #ff4500;
        }

        /* FACEBOOK */
        .xqcrz7y { overflow: visible !important; }
        .xqcrz7y ~ .ai-tools-action-btn-wrap, [data-ai-tools] > .ai-tools-action-btn-wrap { align-self: center; margin-right: 4px; }
    `;
    (document.head || document.documentElement).appendChild(styleEl);

    // ==========================================
    // 6. API SERVICE
    // ==========================================
    const CACHE = new Map();

    const API = {
        async chat(history, config, expectJson = false) {
            const cacheKey = JSON.stringify({ history, mode: config.apiMode, expectJson, gModel: config.groqModel, cModel: config.cerebrasModel, oModel: config.openrouterModel, geModel: config.geminiModel });
            if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

            const mode = config.apiMode;
            let response;
            try {
                if (mode === 'OpenRouter') response = await this.callOpenAIFormat(history, config.openrouterKey, config.openrouterModel || 'meta-llama/llama-3.3-70b-instruct', 'https://openrouter.ai/api/v1/chat/completions', 'OpenRouter', expectJson);
                else if (mode === 'Groq') response = await this.callOpenAIFormat(history, config.groqKey, config.groqModel || 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1/chat/completions', 'Groq', expectJson);
                else if (mode === 'Cerebras') response = await this.callOpenAIFormat(history, config.cerebrasKey, config.cerebrasModel || 'gpt-oss-120b', 'https://api.cerebras.ai/v1/chat/completions', 'Cerebras', expectJson);
                else if (mode === 'Gemini') response = await this.callGemini(history, config.geminiKey, config.geminiModel || 'gemini-2.5-flash-lite', expectJson);
                else {
                    try { response = await this.callGemini(history, config.geminiKey, config.geminiModel || 'gemini-2.5-flash-lite', expectJson); }
                    catch (e1) {
                        try { response = await this.callOpenAIFormat(history, config.openrouterKey, config.openrouterModel || 'meta-llama/llama-3.3-70b-instruct', 'https://openrouter.ai/api/v1/chat/completions', 'OpenRouter', expectJson); }
                        catch (e2) {
                            try { response = await this.callOpenAIFormat(history, config.groqKey, config.groqModel || 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1/chat/completions', 'Groq', expectJson); }
                            catch (e3) {
                                response = await this.callOpenAIFormat(history, config.cerebrasKey, config.cerebrasModel || 'gpt-oss-120b', 'https://api.cerebras.ai/v1/chat/completions', 'Cerebras', expectJson);
                            }
                        }
                    }
                }

                CACHE.set(cacheKey, response);
                return response;
            } catch (error) { throw new Error(this.formatErrorMessage(error.message)); }
        },
        async callGemini(history, key, model, expectJson) {
            if (!key) throw new Error('Gemini API Key is missing. Please click ⚙️ to set it.');
            const contents = history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ contents }),
                    responseType: 'json',
                    onload: (res) => {
                        if (res.status !== 200) return reject(new Error(res.response?.error?.message || `Gemini API Error (${res.status})`));
                        let text = res.response?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!text) return reject(new Error('Empty content returned from Gemini.'));
                        resolve(expectJson ? this.extractJson(text) : this.cleanThinking(text));
                    },
                    onerror: () => reject(new Error('Network Error contacting Gemini.'))
                });
            });
        },
        async callOpenAIFormat(history, key, model, endpoint, providerName, expectJson) {
            if (!key) throw new Error(`${providerName} API Key is missing. Please click ⚙️ to set it.`);
            const payload = { model, messages: history };
            if (expectJson) payload.response_format = { type: 'json_object' };

            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
            if (endpoint.includes('openrouter.ai')) {
                headers['HTTP-Referer'] = window.location.origin || 'https://github.com';
                headers['X-Title'] = 'Post Tools';
            }

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: endpoint,
                    headers: headers,
                    data: JSON.stringify(payload),
                    responseType: 'json',
                    onload: (res) => {
                        if (res.status === 402) return reject(new Error(`HTTP 402 Payment Required: Out of credits or model requires paid tier on ${providerName}.`));
                        if (res.status !== 200) return reject(new Error(res.response?.error?.message || `${providerName} API Error (${res.status})`));
                        let text = res.response?.choices?.[0]?.message?.content;
                        if (!text) return reject(new Error(`Empty content returned from ${providerName}.`));
                        resolve(expectJson ? this.extractJson(text) : this.cleanThinking(text));
                    },
                    onerror: () => reject(new Error(`Network Error contacting ${providerName}.`))
                });
            });
        },
        extractJson(text) {
            let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
            clean = clean.replace(/<think>[\s\S]*?<\/think>\n?/gi, '').trim();
            return JSON.parse(clean);
        },
        cleanThinking(text) { return text.replace(/<think>[\s\S]*?<\/think>\n?/gi, '').trim(); },
        formatErrorMessage(msg) {
            if (msg.includes('429') || msg.toLowerCase().includes('quota')) return 'API Rate Limit Exceeded. Switch to Hybrid mode in ⚙️ Settings for auto failover.';
            return msg;
        }
    };

    // ==========================================
    // 7. UI RENDERER
    // ==========================================
    const UI = {
        getTheme() {
            const accent = { twitter: '#1d9bf0', reddit: '#ff4500', facebook: '#1877f2' }[PLATFORM] || '#1d9bf0';
            return { bg: '#0a1520', text: '#e7e9ea', border: '#1e2d3d', header: '#0d1b26', accent };
        },

        createActionButton(label, icon) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-tools-action-btn';
            btn.title = label;
            btn.textContent = icon;
            return btn;
        },

        buildPanel(title, anchorEl, isGlobal = false) {
            document.querySelectorAll('.ai-tools-panel').forEach(p => p.remove());
            const th = this.getTheme();
            const cfg = Settings.getAll();
            const panel = document.createElement('div');
            panel.className = 'ai-tools-panel';

            panel.style.fontFamily = cfg.uiFont;
            panel.style.fontSize = cfg.uiFontSize + 'px';

            const pW = Math.min(cfg.uiWidth, window.innerWidth * 0.95);
            const pH = Math.min(cfg.uiHeight, window.innerHeight * 0.90);

            let top = 0, left = 0;
            if (isGlobal || !anchorEl || anchorEl === document.body) {
                left = (window.innerWidth - pW) / 2;
                top = (window.innerHeight - pH) / 2;
            } else {
                const rect = anchorEl.getBoundingClientRect();
                top = rect.bottom + 10;
                left = rect.right - pW;
                if (window.innerWidth < 600) {
                    left = (window.innerWidth - pW) / 2; top = (window.innerHeight - pH) / 2;
                } else {
                    if (left < 10) left = 10;
                    if (top + pH > window.innerHeight - 10) { top = rect.top - pH - 10; if (top < 10) top = 10; }
                }
            }

            Object.assign(panel.style, {
                top: `${top}px`, left: `${left}px`,
                width: `${pW}px`, height: `${pH}px`,
                maxWidth: '95vw', maxHeight: '90vh'
            });

            const platformBadge = { twitter: '𝕏', reddit: '🔴 Reddit', facebook: '📘 Facebook' }[PLATFORM] || '';

            const createModelSelect = (providerKey, currentVal, selectId, inputId) => {
                const options = MODEL_OPTIONS[providerKey] || [];
                const isCustom = !options.includes(currentVal);
                return `
                    <select id="${selectId}">
                        ${options.map(m => `<option value="${m}" ${currentVal === m ? 'selected' : ''}>${m}</option>`).join('')}
                        <option value="custom" ${isCustom ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input type="text" id="${inputId}" value="${currentVal}" style="margin-top:4px;">
                `;
            };

            panel.innerHTML = `
                <div class="ai-tools-header">
                    <span style="display:flex; align-items:center; gap:8px;">
                        <span style="width:8px; height:8px; border-radius:50%; background:${th.accent}; display:inline-block;"></span>
                        ${platformBadge} ${title}
                    </span>
                    <div style="display:flex; gap:8px;">
                        <button class="ai-tools-btn-chrome ai-btn-settings" title="Settings">⚙️</button>
                        <button class="ai-tools-btn-chrome ai-btn-close" title="Close">✕</button>
                    </div>
                </div>
                <div class="ai-tools-settings">
                    <strong style="margin-bottom:4px; font-size:14px; color:${th.accent};">API Settings</strong>
                    <label>Mode:
                        <select id="ai-cfg-mode">
                            <option ${cfg.apiMode==='Gemini'?'selected':''}>Gemini</option>
                            <option ${cfg.apiMode==='OpenRouter'?'selected':''}>OpenRouter</option>
                            <option ${cfg.apiMode==='Groq'?'selected':''}>Groq</option>
                            <option ${cfg.apiMode==='Cerebras'?'selected':''}>Cerebras</option>
                            <option ${cfg.apiMode==='Hybrid'?'selected':''}>Hybrid (Auto-Failover)</option>
                        </select>
                    </label>
                    <div id="ai-wrap-gemini" class="ai-tools-api-wrap">
                        <label>Gemini Key: <input type="password" id="ai-cfg-gem" value="${cfg.geminiKey}" autocomplete="new-password" placeholder="AIzaSy..."></label>
                        <label>Model:</label>
                        ${createModelSelect('gemini', cfg.geminiModel, 'ai-cfg-gemm-sel', 'ai-cfg-gemm')}
                    </div>
                    <div id="ai-wrap-openrouter" class="ai-tools-api-wrap">
                        <label>OpenRouter Key: <input type="password" id="ai-cfg-open" value="${cfg.openrouterKey}" autocomplete="new-password" placeholder="sk-or-v1-..."></label>
                        <label>Model:</label>
                        ${createModelSelect('openrouter', cfg.openrouterModel, 'ai-cfg-openm-sel', 'ai-cfg-openm')}
                    </div>
                    <div id="ai-wrap-groq" class="ai-tools-api-wrap">
                        <label>Groq Key: <input type="password" id="ai-cfg-grq" value="${cfg.groqKey}" autocomplete="new-password" placeholder="gsk_..."></label>
                        <label>Model:</label>
                        ${createModelSelect('groq', cfg.groqModel, 'ai-cfg-grqm-sel', 'ai-cfg-grqm')}
                    </div>
                    <div id="ai-wrap-cerebras" class="ai-tools-api-wrap">
                        <label>Cerebras Key: <input type="password" id="ai-cfg-cer" value="${cfg.cerebrasKey}" autocomplete="new-password" placeholder="csk_..."></label>
                        <label>Model:</label>
                        ${createModelSelect('cerebras', cfg.cerebrasModel, 'ai-cfg-cerm-sel', 'ai-cfg-cerm')}
                    </div>

                    <strong style="margin-top:8px; margin-bottom:4px; font-size:14px; color:${th.accent};">Platforms</strong>
                    <label>Enable on X (Twitter): <input type="checkbox" id="ai-cfg-en-twitter" ${cfg.enableTwitter ? 'checked' : ''}></label>
                    <label>Enable on Reddit: <input type="checkbox" id="ai-cfg-en-reddit" ${cfg.enableReddit ? 'checked' : ''}></label>
                    <label>Enable on Facebook: <input type="checkbox" id="ai-cfg-en-facebook" ${cfg.enableFacebook ? 'checked' : ''}></label>

                    <strong style="margin-top:8px; margin-bottom:4px; font-size:14px; color:${th.accent};">Appearance</strong>
                    <label>Font Family:
                        <select id="ai-cfg-font">
                            ${FONT_OPTIONS.map(f => `<option value="${f.value.replace(/"/g, '&quot;')}" ${cfg.uiFont === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
                        </select>
                    </label>
                    <label>Font Size:
                        <div style="display:flex; align-items:center; gap:8px; flex:1; max-width:60%;">
                            <input type="range" id="ai-cfg-fsize" min="10" max="20" step="1" value="${cfg.uiFontSize}">
                            <span id="ai-cfg-fsize-val" style="width:30px; text-align:right;">${cfg.uiFontSize}px</span>
                        </div>
                    </label>
                    <label>Width (px): <input type="number" id="ai-cfg-w" value="${cfg.uiWidth}"></label>
                    <label>Height (px): <input type="number" id="ai-cfg-h" value="${cfg.uiHeight}"></label>

                    <button id="ai-cfg-save" style="margin-top:8px; padding:10px 8px; border-radius:8px; background:${th.accent}; color:#fff; border:none; cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center; line-height:1;">Save Settings</button>
                </div>
                <div class="ai-tools-body"></div>
                <div class="ai-tools-footer">
                    <input type="text" class="ai-tools-input" autocomplete="off" spellcheck="true" placeholder="Ask a follow-up…">
                    <button class="ai-tools-btn-chrome ai-btn-send" style="color:${th.accent}; font-weight:bold; font-size:16px;">➤</button>
                </div>
            `;
            document.body.appendChild(panel);

            panel.querySelector('.ai-btn-close').onclick = (e) => { e.stopPropagation(); panel.remove(); };
            const settingsDiv = panel.querySelector('.ai-tools-settings');
            const bodyDiv     = panel.querySelector('.ai-tools-body');
            const footerDiv   = panel.querySelector('.ai-tools-footer');
            const modeSelect = panel.querySelector('#ai-cfg-mode');

            const refreshModeUI = () => {
                const v = modeSelect.value;
                panel.querySelector('#ai-wrap-gemini').style.display = (v==='Gemini'||v==='Hybrid') ? 'flex' : 'none';
                panel.querySelector('#ai-wrap-openrouter').style.display = (v==='OpenRouter'||v==='Hybrid') ? 'flex' : 'none';
                panel.querySelector('#ai-wrap-groq').style.display = (v==='Groq') ? 'flex' : 'none';
                panel.querySelector('#ai-wrap-cerebras').style.display = (v==='Cerebras') ? 'flex' : 'none';
            };
            modeSelect.addEventListener('change', refreshModeUI);
            refreshModeUI();

            const fsizeSlider = panel.querySelector('#ai-cfg-fsize');
            const fsizeVal = panel.querySelector('#ai-cfg-fsize-val');
            fsizeSlider.oninput = (e) => fsizeVal.textContent = e.target.value + 'px';

            const bindModelSync = (selId, inputId) => {
                const sel = panel.querySelector('#' + selId);
                const inp = panel.querySelector('#' + inputId);
                if (sel && inp) {
                    sel.onchange = () => {
                        if (sel.value !== 'custom') inp.value = sel.value;
                        else inp.focus();
                    };
                }
            };
            bindModelSync('ai-cfg-gemm-sel', 'ai-cfg-gemm');
            bindModelSync('ai-cfg-openm-sel', 'ai-cfg-openm');
            bindModelSync('ai-cfg-grqm-sel', 'ai-cfg-grqm');
            bindModelSync('ai-cfg-cerm-sel', 'ai-cfg-cerm');

            panel.querySelector('.ai-btn-settings').onclick = () => {
                const open = settingsDiv.classList.toggle('active');
                bodyDiv.style.display = open ? 'none' : 'flex';
                if (panel.dataset.mode !== 'reply') footerDiv.style.display = open ? 'none' : 'flex';
            };

            panel.querySelector('#ai-cfg-save').onclick = () => {
                Settings.set('apiMode', modeSelect.value);
                Settings.set('geminiKey', panel.querySelector('#ai-cfg-gem').value.trim());
                Settings.set('geminiModel', panel.querySelector('#ai-cfg-gemm').value.trim());
                Settings.set('openrouterKey', panel.querySelector('#ai-cfg-open').value.trim());
                Settings.set('openrouterModel', panel.querySelector('#ai-cfg-openm').value.trim());
                Settings.set('groqKey', panel.querySelector('#ai-cfg-grq').value.trim());
                Settings.set('groqModel', panel.querySelector('#ai-cfg-grqm').value.trim());
                Settings.set('cerebrasKey', panel.querySelector('#ai-cfg-cer').value.trim());
                Settings.set('cerebrasModel', panel.querySelector('#ai-cfg-cerm').value.trim());

                Settings.set('enableTwitter', panel.querySelector('#ai-cfg-en-twitter').checked);
                Settings.set('enableReddit', panel.querySelector('#ai-cfg-en-reddit').checked);
                Settings.set('enableFacebook', panel.querySelector('#ai-cfg-en-facebook').checked);

                Settings.set('uiFont', panel.querySelector('#ai-cfg-font').value);
                Settings.set('uiFontSize', parseInt(panel.querySelector('#ai-cfg-fsize').value));
                Settings.set('uiWidth', parseInt(panel.querySelector('#ai-cfg-w').value));
                Settings.set('uiHeight', parseInt(panel.querySelector('#ai-cfg-h').value));

                alert('Settings saved! Reopen the panel to apply changes.');
                settingsDiv.classList.remove('active');
                bodyDiv.style.display = 'flex';
                if (panel.dataset.mode !== 'reply') footerDiv.style.display = 'flex';
            };
            return panel;
        },

        addMessage(body, role, text, isHtml = false) {
            const msg = document.createElement('div');
            msg.className = `ai-tools-chat-msg ai-tools-chat-${role}`;
            if (isHtml) msg.innerHTML = text; else msg.textContent = text;
            body.appendChild(msg);
            body.scrollTop = body.scrollHeight;
            return msg;
        },

        bindChat(panel, chatHistory) {
            const input = panel.querySelector('.ai-tools-input');
            const btn   = panel.querySelector('.ai-btn-send');
            const body  = panel.querySelector('.ai-tools-body');

            const send = async (overrideText = null) => {
                const text = overrideText || input.value.trim();
                if (!text) return;
                input.value = '';
                this.addMessage(body, 'user', text);
                chatHistory.push({ role: 'user', content: text + '\n\n(Note: Reply in natural plain text only. Do NOT output JSON. Do NOT show internal reasoning.)' });
                const loadMsg = this.addMessage(body, 'bot', '<span style="opacity:0.6;">Thinking…</span>', true);

                try {
                    const response = await API.chat(chatHistory, Settings.getAll(), false);
                    chatHistory.push({ role: 'assistant', content: response });
                    loadMsg.remove();
                    this.addMessage(body, 'bot', response.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'), true);
                } catch (e) {
                    loadMsg.innerHTML = `<span class="ai-tools-error"><b>Error:</b> ${e.message}</span>`;
                    chatHistory.pop();
                }
            };

            btn.onclick = () => send();
            input.onkeypress = (e) => { if (e.key === 'Enter') send(); };
            panel._sendChat = send;
        }
    };

    // ==========================================
    // 8. FEATURES
    // ==========================================
    const Features = {
        async runAnalysis(type, postText, anchorEl) {
            const config = Settings.getAll();
            const panel  = UI.buildPanel(type === 'truth' ? 'Truth Analysis' : 'Deep Explanation', anchorEl);
            const body   = panel.querySelector('.ai-tools-body');
            const contentLabel = { twitter: 'tweet', reddit: 'post', facebook: 'post' }[PLATFORM] || 'post';

            const initialPrompt = type === 'truth'
                ? `Analyze the truthfulness of this ${contentLabel} objectively. Return JSON ONLY: {"score":<number 0-100>,"verdict":"<short verdict>","context":"<why>"}.\n${contentLabel}: "${postText}"`
                : `Act as an expert critical analyst and semantic interpreter. Analyze the following ${contentLabel} with deep nuance, focusing on subtext, underlying assumptions, rhetorical devices, and broader context. 
Depth level requested: ${config.explainDepth}.
Return JSON ONLY: 
{
    "summary": "<nuanced summary capturing the core message and its tone>",
    "key_points": ["<point 1 with deeper insight>", "<point 2>", "<point 3>"],
    "context": "<historical, cultural, or situational background that gives this post meaning>",
    "nuance": "<explain any subtext, bias, irony, or potential misinterpretations>",
    "qa": [{"q": "<thought-provoking question>", "a": "<expert answer>"}]
}
Generate exactly ${config.maxQuestions} QA pairs.
${contentLabel}: "${postText}"`;

            let chatHistory = [{ role: 'user', content: initialPrompt }];
            const loading = UI.addMessage(body, 'bot', '<span style="opacity:0.6;">Analyzing…</span>', true);

            try {
                const data = await API.chat(chatHistory, config, true);
                chatHistory.push({ role: 'assistant', content: JSON.stringify(data) });
                chatHistory.push({ role: 'user', content: 'Thank you. For all subsequent questions, respond in natural plain text only. Do NOT output JSON or internal reasoning.' });
                chatHistory.push({ role: 'assistant', content: 'Understood.' });
                loading.remove();

                if (type === 'truth') {
                    const color = data.score > 70 ? '#00ba7c' : data.score > 40 ? '#ffd400' : '#f4212e';
                    UI.addMessage(body, 'bot', `
                        <div style="font-size:20px; font-weight:800; color:${color};">Score: ${data.score}% — ${data.verdict}</div>
                        <p style="margin-top:8px;">${data.context}</p>
                        <p style="margin-top:10px; font-size:11px; opacity:0.6;">AI models can have biases. Ask follow-up questions to challenge this score.</p>
                    `, true);
                } else {
                    let html = `<b>Summary:</b> ${data.summary}<br><br>`;
                    html += `<b>Key Points:</b><ul style="margin-top:4px; padding-left:20px;">${(data.key_points || []).map(k => `<li>${k}</li>`).join('')}</ul>`;
                    html += `<br><b>Context:</b> ${data.context}`;

                    if (data.nuance) {
                        html += `<br><br><b>Nuance & Subtext:</b><div style="padding:8px; background:rgba(29,155,240,0.1); border-left:2px solid #1d9bf0; margin-top:4px; border-radius:4px;">${data.nuance}</div>`;
                    }

                    if (data.qa && data.qa.length) {
                        html += `<br><br><b>Follow-up Q&A:</b>`;
                        data.qa.forEach(item => { html += `<details class="ai-tools-qa"><summary>${item.q}</summary><p>${item.a}</p></details>`; });
                    }
                    UI.addMessage(body, 'bot', html, true);
                    setTimeout(() => {
                        body.querySelectorAll('.ai-tools-qa summary').forEach(q => {
                            q.addEventListener('click', (e) => { e.preventDefault(); panel._sendChat && panel._sendChat(e.target.innerText); });
                        });
                    }, 100);
                }
                UI.bindChat(panel, chatHistory);
            } catch (err) { loading.innerHTML = `<span class="ai-tools-error"><b>Analysis failed:</b><br>${err.message}</span>`; }
        },

        openReplyGenerator(postText, anchorEl) {
            const panel = UI.buildPanel(`Generate ${REPLY_LABEL.name}`, anchorEl);
            panel.dataset.mode = 'reply';
            const body = panel.querySelector('.ai-tools-body');
            const th   = UI.getTheme();

            let toneHtml = `<div style="font-size:13px; margin-bottom:8px; font-weight:bold;">Select up to 3 tones:</div><div style="flex:1; overflow-y:auto; border:1px solid ${th.border}; padding:8px; border-radius:8px; margin-bottom:10px;">`;
            TONE_LIBRARY.forEach(cat => {
                toneHtml += `<details class="ai-tools-group" open><summary>${cat.group}</summary><div>`;
                cat.tones.forEach(t => { toneHtml += `<span class="ai-tools-chip" data-tone="${t}" style="border-color:${th.border}">${t}</span>`; });
                toneHtml += `</div></details>`;
            });
            toneHtml += `</div>`;

            const replyUI = document.createElement('div');
            Object.assign(replyUI.style, { display: 'flex', flexDirection: 'column', height: '100%' });
            replyUI.innerHTML = `
                ${toneHtml}
                <div style="display:flex; gap:10px; font-size:13px; align-items:center; margin-bottom:10px;">
                    <b>Length:</b>
                    <label><input type="radio" name="ai-r-len" value="short"> Short</label>
                    <label><input type="radio" name="ai-r-len" value="medium" checked> Medium</label>
                    <label><input type="radio" name="ai-r-len" value="long"> Long</label>
                </div>
                <textarea id="ai-r-context" placeholder="Optional context or stance (e.g. 'I agree but...')" style="width:100%; height:60px; border-radius:8px; padding:8px; background:transparent; color:${th.text}; border:1px solid ${th.border}; resize:none;"></textarea>
                <button id="ai-r-generate" style="margin-top:12px; width:100%; padding:10px; border-radius:20px; background:${th.accent}; color:#fff; border:none; font-weight:bold; cursor:pointer;">Generate ${REPLY_LABEL.name}</button>
                <div id="ai-r-output" style="margin-top:12px; display:none;">
                    <div style="padding:10px; border-radius:8px; background:rgba(128,128,128,0.1); font-size:14px; margin-bottom:8px; user-select:text;" id="ai-r-result"></div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button id="ai-r-copy" style="padding:6px 16px; border-radius:16px; background:transparent; border:1px solid ${th.border}; color:${th.text}; cursor:pointer; font-weight:bold;">Copy</button>
                        <button id="ai-r-regen" style="padding:6px 16px; border-radius:16px; background:transparent; border:1px solid ${th.border}; color:${th.text}; cursor:pointer;">Regenerate</button>
                    </div>
                </div>
            `;
            body.appendChild(replyUI);
            panel.querySelector('.ai-tools-footer').style.display = 'none';

            let selectedTones = [];
            body.querySelectorAll('.ai-tools-chip').forEach(chip => {
                chip.onclick = () => {
                    const t = chip.dataset.tone;
                    if (selectedTones.includes(t)) { selectedTones = selectedTones.filter(x => x !== t); chip.classList.remove('active'); }
                    else { if (selectedTones.length >= 3) return alert('Max 3 tones allowed.'); selectedTones.push(t); chip.classList.add('active'); }
                };
            });

            const generate = async () => {
                if (selectedTones.length === 0) return alert('Please select at least 1 tone.');
                const len = body.querySelector('input[name="ai-r-len"]:checked').value;
                const lenConstraint = len === 'short' ? 'under 120 chars' : len === 'medium' ? 'around 200–300 chars' : `long and detailed — ${REPLY_LABEL.limitNote}`;
                const ctx = body.querySelector('#ai-r-context').value.trim();

                const prompt = `Write a ${REPLY_LABEL.name.toLowerCase()} to the following ${PLATFORM} post.\nOriginal: "${postText}"\nGuidelines: Tone: ${selectedTones.join(', ')}. Length: ${lenConstraint}. Context: ${ctx ? `"${ctx}"` : 'None.'}\nHUMANIZER DIRECTIVE:\n${HUMANIZER_PROMPT}\nReturn ONLY the plain ${REPLY_LABEL.name.toLowerCase()} text.`;

                const btnGen = body.querySelector('#ai-r-generate');
                const output = body.querySelector('#ai-r-output');
                const resultDiv = body.querySelector('#ai-r-result');

                btnGen.textContent = 'Generating…'; btnGen.disabled = true; output.style.display = 'none';

                try {
                    const result = await API.chat([{ role: 'user', content: prompt }], Settings.getAll(), false);
                    output.style.display = 'block'; resultDiv.innerHTML = result.replace(/\n/g, '<br>');
                    body.querySelector('#ai-r-copy').onclick = () => { navigator.clipboard.writeText(result); body.querySelector('#ai-r-copy').textContent = 'Copied!'; setTimeout(() => { body.querySelector('#ai-r-copy').textContent = 'Copy'; }, 2000); };
                    body.scrollTop = body.scrollHeight;
                } catch (err) { output.style.display = 'block'; resultDiv.innerHTML = `<span class="ai-tools-error"><b>Failed:</b> ${err.message}</span>`; }
                finally { btnGen.textContent = `Generate ${REPLY_LABEL.name}`; btnGen.disabled = false; }
            };

            body.querySelector('#ai-r-generate').onclick = generate;
            body.querySelector('#ai-r-regen').onclick = generate;
        }
    };

    // ==========================================
    // 9. BUTTON GROUP BUILDER (ANTI-DUPLICATION)
    // ==========================================
    if (!window.__aiToolsClickGuard) {
        window.__aiToolsClickGuard = true;
        document.addEventListener('click', (e) => {
            const path = e.composedPath ? e.composedPath() : [];
            const wrap =
                (e.target && e.target.closest?.('.ai-tools-action-btn-wrap')) ||
                path.find((el) => el?.classList?.contains('ai-tools-action-btn-wrap'));
            if (!wrap) return;

            const btn =
                (e.target && e.target.closest?.('.ai-tools-action-btn')) ||
                path.find((el) => el?.classList?.contains('ai-tools-action-btn'));

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (btn && typeof btn._aiTrigger === 'function') {
                btn._aiTrigger(e);
            }
        }, true);
    }

    function buildButtonGroup(wrapper, getText) {
        if (!wrapper) return;

        const postContainer = wrapper.closest('article, shreddit-post, [data-testid="post-container"], .Post, .thing, [role="article"], [data-pagelet^="FeedUnit"]') || wrapper;
        if (postContainer.querySelector('.ai-tools-action-btn-wrap') || wrapper.querySelector('.ai-tools-action-btn-wrap')) return;

        if (wrapper.hasAttribute(ADAPTER.alreadyTagged)) return;
        wrapper.setAttribute(ADAPTER.alreadyTagged, 'true');

        const config = Settings.getAll();
        const group = document.createElement('span');
        group.className = 'ai-tools-action-btn-wrap';

        const blockEvent = (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach((evt) => {
            group.addEventListener(evt, blockEvent, { passive: true });
        });

        const getTruncatedText = () => {
            let t = getText() || '';
            if (t.length > 4000) t = t.substring(0, 4000) + '\n...[TRUNCATED FOR TOKEN EFFICIENCY]';
            return t;
        };

        if (config.enableCopy) {
            const btn = UI.createActionButton('Copy post text', 'C');
            btn._aiTrigger = () => {
                const t = getText();
                if (!t) return;
                navigator.clipboard.writeText(t).then(() => {
                    btn.textContent = '✓';
                    setTimeout(() => { btn.textContent = 'C'; }, 1200);
                });
            };
            group.appendChild(btn);
        }
        if (config.enableTruth) {
            const btn = UI.createActionButton('Truth Meter', '✔');
            btn._aiTrigger = () => Features.runAnalysis('truth', getTruncatedText(), btn);
            group.appendChild(btn);
        }
        if (config.enableExplain) {
            const btn = UI.createActionButton('Explain Post', 'e');
            btn._aiTrigger = () => Features.runAnalysis('explain', getTruncatedText(), btn);
            group.appendChild(btn);
        }
        if (config.enableReply) {
            const btn = UI.createActionButton(`Generate ${REPLY_LABEL.name}`, 'R');
            btn._aiTrigger = () => Features.openReplyGenerator(getTruncatedText(), btn);
            group.appendChild(btn);
        }

        if (group.children.length) ADAPTER.injectBtn(wrapper, group);
    }

    // ==========================================
    // 10. DOM INJECTION OBSERVER & COMMANDS
    // ==========================================
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('⚙️ Post Tools Settings', () => {
            let panel = document.querySelector('.ai-tools-panel');
            if (!panel) panel = UI.buildPanel('Settings', document.body, true);
            const settingsDiv = panel.querySelector('.ai-tools-settings');
            const bodyDiv     = panel.querySelector('.ai-tools-body');
            const footerDiv   = panel.querySelector('.ai-tools-footer');

            settingsDiv.classList.add('active');
            bodyDiv.style.display = 'none';
            if (panel.dataset.mode !== 'reply') footerDiv.style.display = 'none';
        });
    }

    const DOMObserver = {
        _injecting: false,
        init() {
            if (PLATFORM !== 'unknown') {
                const platformKey = 'enable' + PLATFORM.charAt(0).toUpperCase() + PLATFORM.slice(1);
                if (Settings.get(platformKey) === false) return;
            } else {
                return;
            }

            const observer = new MutationObserver(() => {
                if (this._injecting) return;
                this._injecting = true;
                requestAnimationFrame(() => { this.injectButtons(); this._injecting = false; });
            });

            observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

            let checks = 0;
            const fastInterval = setInterval(() => {
                this.injectButtons();
                checks++;
                if (checks > 30) clearInterval(fastInterval);
            }, 500);
        },
        injectButtons() {
            if (!ADAPTER) return;
            document.querySelectorAll(ADAPTER.anchorSelector).forEach(anchor => {
                const wrapper = ADAPTER.getWrapper(anchor);
                if (wrapper) buildButtonGroup(wrapper, () => ADAPTER.getText(wrapper));
            });
        }
    };

    DOMObserver.init();
})();
