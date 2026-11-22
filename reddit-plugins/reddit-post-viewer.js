(function () {
    'use strict';

    // --- Configuration ---
    const MAX_TOP_LEVEL_COMMENTS = 15;
    const MAX_REPLY_DEPTH = 5;
    const CACHE_MAX_ITEMS = 100;
    const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 hours
    const SWIPE_CLOSE_THRESHOLD = 100;
    const LONG_PRESS_DURATION = 500;

    // --- Default Settings ---
    const DEFAULT_SETTINGS = {
        buttonSize: 35,
        buttonTop: null // null = vertically centered initially
    };

    // --- Global State ---
    let currentSettings = { ...DEFAULT_SETTINGS };
    let savedSettings = { ...DEFAULT_SETTINGS };
    let isPopupClosing = false;
    let savedScrollY = 0;
    let popupOpenedTimestamp = 0;

    let longPressTimer = null;
    let isLongPress = false;

    // Drag state
    let isDragging = false;
    let dragStarted = false;
    let dragStartY = 0;
    let dragStartTop = 0;
    let dragCurrentY = 0;
    let dragMoved = false;

    // --- Persistent, Time-Aware Cache ---
    const persistentCache = {
        get(key) {
            const itemStr = localStorage.getItem(key);
            if (!itemStr) return null;

            try {
                const item = JSON.parse(itemStr);

                if ((Date.now() - item.timestamp) > CACHE_EXPIRATION_MS) {
                    localStorage.removeItem(key);
                    return null;
                }

                return item.data;
            } catch (e) {
                localStorage.removeItem(key);
                return null;
            }
        },

        set(key, value) {
            const item = {
                data: value,
                timestamp: Date.now()
            };

            try {
                localStorage.setItem(key, JSON.stringify(item));
                this.cleanup();
            } catch (e) {
                console.error("Cache Error: Failed to set item.", e);
                this.cleanup(true);
            }
        },

        cleanup(force = false) {
            const keys = Object.keys(localStorage);
            const cacheKeys = keys.filter(k => k.startsWith('rpp_cache_'));

            if (!force && cacheKeys.length < CACHE_MAX_ITEMS) return;

            const items = cacheKeys.map(key => {
                let timestamp = 0;

                try {
                    timestamp =
                        (JSON.parse(localStorage.getItem(key)) || {}).timestamp || 0;
                } catch (e) {}

                return { key, timestamp };
            });

            items.sort((a, b) => a.timestamp - b.timestamp);

            const toRemove = items.slice(
                0,
                items.length - CACHE_MAX_ITEMS + (force ? 10 : 0)
            );

            toRemove.forEach(item => localStorage.removeItem(item.key));
        }
    };

    // --- Helper Functions ---
    function downloadTextFile(filename, content) {
        const blob = new Blob([content], {
            type: 'text/plain;charset=utf-8;'
        });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();

        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    async function copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            button.textContent = 'Copied!';

            setTimeout(() => {
                button.textContent = 'Copy';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            button.textContent = 'Error!';

            setTimeout(() => {
                button.textContent = 'Copy';
            }, 2000);
        }
    }

    function decodeHtmlEntities(text) {
        if (!text) return '';

        const ta = document.createElement('textarea');
        ta.innerHTML = text;
        return ta.value;
    }

    function giveFailureFeedback() {
        fab.classList.add('rpp-fail-jiggle');

        setTimeout(() => {
            fab.classList.remove('rpp-fail-jiggle');
        }, 200);
    }

    // --- Button Position ---
    function getMaxButtonTop() {
        const size = currentSettings.buttonSize || DEFAULT_SETTINGS.buttonSize;
        return Math.max(0, window.innerHeight - size);
    }

    function clampButtonTop(top) {
        const maxTop = getMaxButtonTop();

        if (!Number.isFinite(top)) {
            return Math.max(0, (window.innerHeight - currentSettings.buttonSize) / 2);
        }

        return Math.min(Math.max(0, top), maxTop);
    }

    function applyButtonPosition() {
        const size = currentSettings.buttonSize || DEFAULT_SETTINGS.buttonSize;

        let top = currentSettings.buttonTop;

        // First launch: vertically center the button.
        if (top === null || top === undefined || !Number.isFinite(Number(top))) {
            top = (window.innerHeight - size) / 2;
        }

        top = clampButtonTop(Number(top));

        fab.style.top = `${top}px`;
        fab.style.transform = 'none';
    }

    function saveButtonPosition() {
        currentSettings.buttonTop = clampButtonTop(
            parseFloat(fab.style.top)
        );

        savedSettings.buttonTop = currentSettings.buttonTop;

        GM_setValue('rpp_settings', savedSettings);
    }

    function applySettings(settings) {
        const size = settings.buttonSize;

        fab.style.height = `${size}px`;
        fab.style.width = `${size}px`;

        const slash = fab.querySelector('.rpp-slash');

        if (slash) {
            slash.style.width = `${size * 0.7}px`;
            slash.style.height = `${size * 0.7}px`;
        }

        // Keep the saved position valid after a size change.
        currentSettings.buttonTop = clampButtonTop(
            settings.buttonTop
        );

        applyButtonPosition();
    }

    // Keep button inside the viewport after orientation/viewport changes.
    function handleViewportResize() {
        const oldTop = parseFloat(fab.style.top);

        if (Number.isFinite(oldTop)) {
            const newTop = clampButtonTop(oldTop);

            if (newTop !== oldTop) {
                fab.style.top = `${newTop}px`;
                currentSettings.buttonTop = newTop;
                savedSettings.buttonTop = newTop;
                GM_setValue('rpp_settings', savedSettings);
            }
        }
    }

    // --- Settings Menu ---
    function createSettingsPanel() {
        const panel = document.createElement('div');

        panel.id = 'rpp-settings-panel';
        panel.style.display = 'none';

        panel.innerHTML = `
            <div class="rpp-settings-backdrop"></div>
            <div class="rpp-settings-content">
                <h2>Button Settings</h2>

                <div class="rpp-slider-group">
                    <label>
                        Button Size:
                        <span id="rpp-button-size-label"></span>px
                    </label>

                    <input
                        type="range"
                        id="rpp-button-size-slider"
                        min="20"
                        max="100"
                        step="1"
                    >
                </div>

                <div class="rpp-settings-buttons">
                    <button id="rpp-settings-cancel">Cancel</button>
                    <button id="rpp-settings-save">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        const buttonSlider =
            panel.querySelector('#rpp-button-size-slider');

        const buttonSizeLabel =
            panel.querySelector('#rpp-button-size-label');

        const updateLive = () => {
            currentSettings.buttonSize =
                parseInt(buttonSlider.value, 10);

            buttonSizeLabel.textContent =
                currentSettings.buttonSize;

            applySettings(currentSettings);
        };

        buttonSlider.addEventListener('input', updateLive);

        panel.querySelector('#rpp-settings-save')
            .addEventListener('click', () => {

                savedSettings = {
                    ...currentSettings
                };

                GM_setValue('rpp_settings', savedSettings);

                closeSettingsPanel();
            });

        panel.querySelector('#rpp-settings-cancel')
            .addEventListener('click', () => {

                currentSettings = {
                    ...savedSettings
                };

                applySettings(savedSettings);

                closeSettingsPanel();
            });

        panel.querySelector('.rpp-settings-backdrop')
            .addEventListener('click', () => {

                currentSettings = {
                    ...savedSettings
                };

                applySettings(savedSettings);

                closeSettingsPanel();
            });
    }

    function openSettingsPanel() {
        const panel =
            document.getElementById('rpp-settings-panel');

        if (!panel) return;

        const buttonSlider =
            panel.querySelector('#rpp-button-size-slider');

        const buttonSizeLabel =
            panel.querySelector('#rpp-button-size-label');

        buttonSlider.value = savedSettings.buttonSize;
        buttonSizeLabel.textContent = savedSettings.buttonSize;

        panel.style.display = 'block';
    }

    function closeSettingsPanel() {
        const panel =
            document.getElementById('rpp-settings-panel');

        if (panel) {
            panel.style.display = 'none';
        }
    }

    // --- UI Elements ---
    const fab = document.createElement('div');

    fab.className = 'rpp-fab';

    fab.innerHTML = `
        <svg
            class="rpp-slash"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
        >
            <line
                x1="90"
                y1="10"
                x2="10"
                y2="90"
                stroke="white"
                stroke-width="12"
                stroke-linecap="round"
            />
        </svg>
    `;

    document.body.appendChild(fab);

    const backdrop = document.createElement('div');
    backdrop.className = 'rpp-backdrop';
    document.body.appendChild(backdrop);

    const popup = document.createElement('div');
    popup.className = 'hover-comment-popup';
    document.body.appendChild(popup);

    // =========================================================
    // MOBILE VERTICAL DRAG
    // =========================================================

    function startButtonDrag(clientY) {
        if (fab.classList.contains('rpp-loading')) return;

        const rect = fab.getBoundingClientRect();

        dragStarted = true;
        isDragging = false;
        dragMoved = false;

        dragStartY = clientY;
        dragCurrentY = clientY;
        dragStartTop = rect.top;

        isLongPress = false;

        clearTimeout(longPressTimer);

        longPressTimer = setTimeout(() => {
            // Only trigger long press if the user has not moved.
            if (!dragMoved) {
                isLongPress = true;
                openSettingsPanel();
            }
        }, LONG_PRESS_DURATION);
    }

    function moveButtonDrag(clientY, event) {
        if (!dragStarted) return;

        dragCurrentY = clientY;

        const distance = clientY - dragStartY;

        // Small movement threshold prevents tiny finger movement
        // from being interpreted as dragging.
        if (Math.abs(distance) > 6) {
            dragMoved = true;
            isDragging = true;

            clearTimeout(longPressTimer);

            if (event) {
                event.preventDefault();
            }

            const newTop = clampButtonTop(
                dragStartTop + distance
            );

            fab.style.top = `${newTop}px`;
            fab.style.transform = 'none';
        }
    }

    function endButtonDrag() {
        if (!dragStarted) return;

        clearTimeout(longPressTimer);

        if (isDragging) {
            // Save position permanently.
            currentSettings.buttonTop =
                clampButtonTop(parseFloat(fab.style.top));

            savedSettings.buttonTop =
                currentSettings.buttonTop;

            GM_setValue(
                'rpp_settings',
                savedSettings
            );
        }

        dragStarted = false;
        isDragging = false;
        dragCurrentY = 0;
        dragStartY = 0;
        dragStartTop = 0;
    }

    // Touch events — primary mobile drag mechanism.
    fab.addEventListener('touchstart', (event) => {
        if (!event.touches.length) return;

        startButtonDrag(
            event.touches[0].clientY
        );
    }, { passive: true });

    fab.addEventListener('touchmove', (event) => {
        if (!event.touches.length) return;

        moveButtonDrag(
            event.touches[0].clientY,
            event
        );
    }, { passive: false });

    fab.addEventListener('touchend', () => {
        endButtonDrag();
    }, { passive: true });

    fab.addEventListener('touchcancel', () => {
        endButtonDrag();
    }, { passive: true });

    // Prevent normal mouse dragging from causing unwanted behavior,
    // while retaining desktop click functionality.
    fab.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;

        isLongPress = false;

        longPressTimer = setTimeout(() => {
            isLongPress = true;
            openSettingsPanel();
        }, LONG_PRESS_DURATION);
    });

    fab.addEventListener('mouseup', () => {
        clearTimeout(longPressTimer);
    });

    // Click after touch/drag.
    fab.addEventListener('click', (event) => {
        if (isLongPress || dragMoved || isDragging) {
            event.preventDefault();
            event.stopPropagation();

            // Reset after the click event.
            dragMoved = false;

            return;
        }

        onFabClick(event);
    });

    // =========================================================
    // FAB CLICK
    // =========================================================

    function onFabClick(event) {
        if (fab.classList.contains('rpp-loading')) return;

        const rect = fab.getBoundingClientRect();

        const x =
            rect.left +
            rect.width / 2;

        const y =
            rect.top +
            rect.height / 2;

        fab.style.pointerEvents = 'none';

        const elementUnderneath =
            document.elementFromPoint(x, y);

        fab.style.pointerEvents = 'auto';

        if (!elementUnderneath) {
            giveFailureFeedback();
            return;
        }

        const postContainer =
            elementUnderneath.closest(
                'shreddit-post, div[data-testid="post-container"], search-telemetry-tracker'
            );

        if (postContainer) {
            const commentLink =
                postContainer.querySelector(
                    'a[href*="/comments/"]'
                );

            if (commentLink) {
                setTimeout(() => {
                    processPost(commentLink);
                }, 0);
            } else {
                giveFailureFeedback();
            }
        } else {
            giveFailureFeedback();
        }
    }

    // --- Popup Logic ---
    function handleBackButton() {
        if (Date.now() - popupOpenedTimestamp < 500) return;

        if (popup.classList.contains('visible')) {
            hidePopup(true);
        }
    }

    function hidePopup(isFromPopState = false) {
        if (
            isPopupClosing ||
            !popup.classList.contains('visible')
        ) {
            return;
        }

        isPopupClosing = true;

        popup.classList.remove('visible');
        backdrop.style.opacity = '0';

        setTimeout(() => {
            document.body.style.overflow = '';

            popup.style.display = 'none';
            backdrop.style.display = 'none';
            backdrop.style.opacity = '';

            delete popup.dataset.currentUrl;

            window.scrollTo(0, savedScrollY);

            if (
                !isFromPopState &&
                window.history.state?.rpp_popup
            ) {
                history.back();
            }

            isPopupClosing = false;
        }, 300);
    }

    async function processPost(linkElement) {
        const jsonUrl =
            linkElement.href
                .split('?')[0]
                .replace(/\/$/, '') +
            '.json';

        const cacheKey =
            `rpp_cache_${jsonUrl}`;

        if (
            popup.classList.contains('visible') &&
            popup.dataset.currentUrl === jsonUrl
        ) {
            hidePopup();
            return;
        }

        fab.classList.add('rpp-loading');

        try {
            let data =
                persistentCache.get(cacheKey);

            if (!data) {
                const res =
                    await fetch(jsonUrl);

                if (!res.ok) {
                    throw new Error(
                        `Fetch failed with status: ${res.status}`
                    );
                }

                data = await res.json();

                persistentCache.set(
                    cacheKey,
                    data
                );
            }

            renderPopupFromData(
                data,
                jsonUrl
            );

        } catch (err) {
            console.error(
                "Reddit Preview Error:",
                err
            );

            renderErrorPopup(
                'Could not load comments. Reddit may be rate-limiting requests.'
            );

        } finally {
            fab.classList.remove('rpp-loading');
        }
    }

    function showPopup() {
        if (popup.classList.contains('visible')) {
            return;
        }

        savedScrollY = window.scrollY;
        popupOpenedTimestamp = Date.now();

        popup.style.display = 'flex';
        backdrop.style.display = 'block';

        document.body.style.overflow = 'hidden';

        setTimeout(() => {
            popup.classList.add('visible');
        }, 10);

        window.scrollTo(0, savedScrollY);

        if (!window.history.state?.rpp_popup) {
            history.pushState(
                { rpp_popup: true },
                '',
                window.location.href
            );
        }
    }

    function renderErrorPopup(
        message = 'Could not load comments.'
    ) {
        popup.innerHTML = `
            <div class="popup-header">
                <h3>Error</h3>
                <span class="close-button">×</span>
            </div>

            <div style="padding:20px; text-align:center;">
                ${message}
            </div>
        `;

        popup
            .querySelector('.close-button')
            .addEventListener(
                'click',
                () => hidePopup()
            );

        setupSwipeToClose(
            popup.querySelector('.popup-header')
        );

        showPopup();
    }

    function formatCommentsToString(
        comments,
        postAuthor,
        depth = 0
    ) {
        let text = '';

        const indent =
            '    '.repeat(depth);

        comments.forEach(comment => {
            if (
                comment.kind !== 't1' ||
                !comment.data.author
            ) {
                return;
            }

            const c = comment.data;

            const isOp =
                c.author === postAuthor
                    ? ' (OP)'
                    : '';

            text +=
                `${indent}--- \n` +
                `${indent}Author: ${c.author}${isOp}\n` +
                `${indent}Score: ${c.score}\n\n` +
                `${indent}${c.body.replace(
                    /\n/g,
                    `\n${indent}`
                )}\n\n`;

            if (
                c.replies?.data?.children.length > 0
            ) {
                text += formatCommentsToString(
                    c.replies.data.children,
                    postAuthor,
                    depth + 1
                );
            }
        });

        return text;
    }

    function getFullContentAsText(
        postData,
        comments
    ) {
        let fullText =
            `========================================\n` +
            `POST\n` +
            `========================================\n`;

        fullText +=
            `Title: ${postData.title}\n` +
            `Author: ${postData.author}\n` +
            `Score: ${postData.score}\n` +
            `URL: https://www.reddit.com${postData.permalink}\n\n`;

        fullText +=
            postData.selftext
                ? `${postData.selftext}\n\n`
                : `[Link or Media Content: ${postData.url}]\n\n`;

        fullText +=
            `========================================\n` +
            `COMMENTS\n` +
            `========================================\n\n`;

        fullText += formatCommentsToString(
            comments,
            postData.author
        );

        return fullText;
    }

    function setupSwipeToClose(element) {
        let touchStartY = 0;
        let touchMoveY = 0;

        element.addEventListener(
            'touchstart',
            (e) => {
                touchStartY =
                    e.touches[0].clientY;

                popup.style.transition = 'none';
            },
            { passive: true }
        );

        element.addEventListener(
            'touchmove',
            (e) => {
                touchMoveY =
                    e.touches[0].clientY;

                const dragDistance =
                    touchMoveY - touchStartY;

                if (dragDistance > 0) {
                    popup.style.transform =
                        `translateY(${dragDistance}px)`;
                }
            },
            { passive: true }
        );

        element.addEventListener(
            'touchend',
            () => {
                const dragDistance =
                    touchMoveY - touchStartY;

                popup.style.transition =
                    'transform 0.3s ease-out';

                if (
                    dragDistance >
                    SWIPE_CLOSE_THRESHOLD
                ) {
                    hidePopup();
                } else {
                    popup.style.transform = '';
                }

                touchStartY = 0;
                touchMoveY = 0;
            }
        );
    }

    function renderPopupFromData(
        data,
        url
    ) {
        const postData =
            data[0].data.children[0].data;

        const comments =
            data[1].data.children
                .filter(
                    c =>
                        c.kind === 't1' &&
                        c.data.author &&
                        !c.data.stickied
                )
                .slice(
                    0,
                    MAX_TOP_LEVEL_COMMENTS
                );

        popup.dataset.currentUrl = url;

        popup.innerHTML = `
            <div class="popup-header">
                <div class="popup-header-main">
                    <h3>${postData.title}</h3>
                </div>

                <div class="popup-controls">
                    <button
                        class="rpp-main-btn"
                        id="rpp-copy-all"
                    >
                        Copy
                    </button>

                    <button
                        class="rpp-main-btn"
                        id="rpp-download-all"
                    >
                        Download
                    </button>

                    <span class="close-button">×</span>
                </div>
            </div>

            <div class="popup-content-area">
                <div class="post-content-container"></div>
                <div class="comments-container"></div>
            </div>
        `;

        popup
            .querySelector('.close-button')
            .addEventListener(
                'click',
                () => hidePopup()
            );

        setupSwipeToClose(
            popup.querySelector('.popup-header')
        );

        const postContainer =
            popup.querySelector(
                '.post-content-container'
            );

        const postMetaDiv =
            document.createElement('div');

        postMetaDiv.className =
            'rpp-comment-meta';

        postMetaDiv.innerHTML =
            `<span><b>${postData.author}</b> (Post)</span> ` +
            `<span>⬆️ ${postData.score}</span>`;

        const postControls =
            document.createElement('div');

        postControls.className =
            'rpp-meta-controls';

        const postCopyBtn =
            document.createElement('button');

        postCopyBtn.className =
            'rpp-action-btn';

        postCopyBtn.textContent =
            'Copy Post';

        const postContentText =
            `Title: ${postData.title}\n` +
            `Author: ${postData.author}\n\n` +
            `${postData.selftext}`;

        postCopyBtn.onclick = () =>
            copyToClipboard(
                postContentText,
                postCopyBtn
            );

        postControls.appendChild(
            postCopyBtn
        );

        postMetaDiv.appendChild(
            postControls
        );

        postContainer.appendChild(
            postMetaDiv
        );

        const postBodyDiv =
            document.createElement('div');

        postBodyDiv.className =
            'rpp-comment-body';

        if (postData.selftext_html) {
            postBodyDiv.innerHTML =
                decodeHtmlEntities(
                    postData.selftext_html
                );

        } else if (
            postData.post_hint === 'image'
        ) {
            postBodyDiv.innerHTML =
                `<a href="${postData.url}" target="_blank">` +
                `<img src="${postData.url}" alt="Post Image">` +
                `</a>`;

        } else if (
            postData.post_hint ===
            'hosted:video'
        ) {
            postBodyDiv.innerHTML =
                `<video src="${postData.media.reddit_video.fallback_url}" ` +
                `controls muted loop preload="auto"></video>`;

        } else if (postData.url) {
            postBodyDiv.innerHTML =
                `<p><a href="${postData.url}" target="_blank">` +
                `${postData.url}</a></p>`;
        }

        postContainer.appendChild(
            postBodyDiv
        );

        const commentsContainer =
            popup.querySelector(
                '.comments-container'
            );

        if (comments.length === 0) {
            commentsContainer.innerHTML =
                '<div style="padding:20px; text-align:center; color:#818384;">' +
                'No comments found.' +
                '</div>';

        } else {
            comments.forEach(comment => {
                renderCommentTree(
                    comment.data,
                    postData.author,
                    commentsContainer,
                    0
                );
            });
        }

        const fullContentText =
            getFullContentAsText(
                postData,
                comments
            );

        const copyAllBtn =
            popup.querySelector(
                '#rpp-copy-all'
            );

        copyAllBtn.addEventListener(
            'click',
            () =>
                copyToClipboard(
                    fullContentText,
                    copyAllBtn
                )
        );

        popup
            .querySelector('#rpp-download-all')
            .addEventListener(
                'click',
                () =>
                    downloadTextFile(
                        `reddit_${postData.id}.txt`,
                        fullContentText
                    )
            );

        showPopup();
    }

    function renderCommentTree(
        commentData,
        postAuthor,
        parentElement,
        depth
    ) {
        if (
            !commentData ||
            !commentData.author ||
            depth > MAX_REPLY_DEPTH
        ) {
            return;
        }

        const wrapper =
            document.createElement('div');

        wrapper.className =
            'rpp-comment-wrapper';

        wrapper.dataset.depth = depth;

        const metaDiv =
            document.createElement('div');

        metaDiv.className =
            'rpp-comment-meta';

        let metaHTML =
            `<span><b>${commentData.author}</b></span>` +
            `<span>•</span>` +
            `<span>⬆️ ${commentData.score}</span>`;

        if (
            commentData.author ===
            postAuthor
        ) {
            metaHTML +=
                `<span class="rpp-op-badge">OP</span>`;
        }

        metaDiv.innerHTML =
            metaHTML;

        const metaControls =
            document.createElement('div');

        metaControls.className =
            'rpp-meta-controls';

        const copyBtn =
            document.createElement('button');

        copyBtn.className =
            'rpp-action-btn';

        copyBtn.textContent =
            'Copy';

        copyBtn.onclick = () =>
            copyToClipboard(
                commentData.body,
                copyBtn
            );

        metaControls.appendChild(
            copyBtn
        );

        metaDiv.appendChild(
            metaControls
        );

        wrapper.appendChild(
            metaDiv
        );

        const bodyDiv =
            document.createElement('div');

        bodyDiv.className =
            'rpp-comment-body';

        bodyDiv.innerHTML =
            decodeHtmlEntities(
                commentData.body_html
            ) ||
            '[comment deleted]';

        wrapper.appendChild(
            bodyDiv
        );

        const replies =
            commentData.replies?.data?.children;

        if (replies?.length > 0) {
            const validReplies =
                replies.filter(
                    reply =>
                        reply.kind === 't1' &&
                        reply.data.author
                );

            if (validReplies.length > 0) {
                const toggleBtn =
                    document.createElement('div');

                toggleBtn.className =
                    'rpp-toggle-replies';

                toggleBtn.textContent =
                    `▶ Show ${validReplies.length} replies`;

                const repliesContainer =
                    document.createElement('div');

                repliesContainer.className =
                    'rpp-replies-container';

                toggleBtn.addEventListener(
                    'click',
                    () => {
                        const isHidden =
                            repliesContainer.style.display === 'none';

                        repliesContainer.style.display =
                            isHidden
                                ? 'block'
                                : 'none';

                        toggleBtn.textContent =
                            isHidden
                                ? `▼ Hide replies`
                                : `▶ Show ${validReplies.length} replies`;
                    }
                );

                validReplies.forEach(
                    reply => {
                        renderCommentTree(
                            reply.data,
                            postAuthor,
                            repliesContainer,
                            depth + 1
                        );
                    }
                );

                wrapper.appendChild(
                    toggleBtn
                );

                wrapper.appendChild(
                    repliesContainer
                );
            }
        }

        parentElement.appendChild(
            wrapper
        );
    }

    // --- Initialization ---
    async function init() {
        savedSettings =
            await GM_getValue(
                'rpp_settings',
                DEFAULT_SETTINGS
            );

        // Compatibility with older saved settings.
        savedSettings = {
            ...DEFAULT_SETTINGS,
            ...savedSettings
        };

        currentSettings = {
            ...savedSettings
        };

        GM_addStyle(GM_STYLES);

        createSettingsPanel();

        applySettings(
            savedSettings
        );

        GM_registerMenuCommand(
            'Button Settings',
            openSettingsPanel
        );

        window.addEventListener(
            'resize',
            handleViewportResize
        );

        window.addEventListener(
            'popstate',
            handleBackButton
        );
    }

    // --- Injected CSS ---
    const GM_STYLES = `
        /* Main Button */
        .rpp-fab {
            position: fixed;
            top: 50%;
            left: 0;

            background-color: #1c1c1e;

            display: flex;
            align-items: center;
            justify-content: center;

            box-shadow: 0 4px 12px rgba(0,0,0,0.3);

            cursor: pointer;

            z-index: 9997;

            user-select: none;
            -webkit-user-select: none;

            border-radius: 0;

            /* Important for vertical touch dragging */
            touch-action: none;

            /* Only animate visual feedback, not position */
            transition:
                background-color 0.2s,
                opacity 0.2s;
        }

        .rpp-fab:active {
            background-color: #333;
        }

        .rpp-slash {
            width: 70%;
            height: 70%;

            pointer-events: none;
        }

        .rpp-fab.rpp-loading {
            opacity: 0.5;
            pointer-events: none;
            cursor: wait;
        }

        .rpp-fab.rpp-fail-jiggle {
            animation: rpp-jiggle 0.2s linear;
        }

        @keyframes rpp-jiggle {
            0%, 100% {
                transform: translateX(0);
            }

            25% {
                transform: translateX(-3px);
            }

            75% {
                transform: translateX(3px);
            }
        }

        /* Settings Panel */
        #rpp-settings-panel {
            display: none;
        }

        .rpp-settings-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;

            background-color: rgba(0,0,0,0.6);

            z-index: 10000;
        }

        .rpp-settings-content {
            position: fixed;

            top: 50%;
            left: 50%;

            transform: translate(-50%, -50%);

            width: 90%;
            max-width: 320px;

            background-color: #2a2a2c;
            color: #d7dadc;

            border-radius: 12px;

            box-shadow:
                0 5px 20px rgba(0,0,0,0.4);

            z-index: 10001;

            padding: 20px;

            font-family:
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                Roboto,
                sans-serif;
        }

        .rpp-settings-content h2 {
            margin: 0 0 20px 0;
            text-align: center;
            color: #fff;
        }

        .rpp-slider-group {
            margin-bottom: 20px;
        }

        .rpp-slider-group label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
        }

        .rpp-slider-group input[type="range"] {
            width: 100%;
        }

        .rpp-settings-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 10px;
        }

        .rpp-settings-buttons button {
            border: none;
            border-radius: 5px;
            padding: 6px 12px; /* Reduced from 8px 16px */
            font-size: 11px; /* Reduced from 14px */
            cursor: pointer;
            font-weight: bold;
            display: inline-flex; /* Centers text */
            align-items: center;
            justify-content: center;
        }

        #rpp-settings-cancel {
            background-color: #4f4f52;
            color: white;
        }

        #rpp-settings-save {
            background-color: #0079d3;
            color: white;
        }

        /* Popup */
        .rpp-backdrop {
            position: fixed;

            top: 0;
            left: 0;

            width: 100%;
            height: 100%;

            background-color: rgba(0,0,0,0.6);

            z-index: 9998;

            display: none;

            transition: opacity 0.3s;
        }

        .hover-comment-popup {
            position: fixed;

            bottom: 0;
            left: 0;

            width: 100%;
            max-height: 90vh;

            background-color: #1a1a1b;
            color: #d7dadc;

            border-top-left-radius: 16px;
            border-top-right-radius: 16px;

            box-shadow:
                0 -5px 20px rgba(0,0,0,0.4);

            z-index: 9999;

            display: none;
            flex-direction: column;

            transform: translateY(100%);

            transition:
                transform 0.3s ease-out;
        }

        .hover-comment-popup.visible {
            transform: translateY(0);
        }

        .hover-comment-popup .popup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;

            padding: 12px 16px;

            border-bottom: 1px solid #343536;

            background-color: #2a2a2c;

            flex-shrink: 0;

            border-top-left-radius: 16px;
            border-top-right-radius: 16px;

            touch-action: none;
        }

        .hover-comment-popup .popup-header-main {
            flex-grow: 1;
            min-width: 0;
        }

        .hover-comment-popup h3 {
            margin: 0;

            font-size: 16px;
            color: #fff;

            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .popup-controls {
            display: flex;
            align-items: center;

            gap: 10px;
            padding-left: 10px;
        }

        .rpp-main-btn {
            background-color: #0079d3;
            color: white;
            border: none;
            padding: 3px 7px; /* Reduced from 5px 10px */
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px; /* Reduced from 12px */
            font-weight: bold;
            display: inline-flex; /* Centers text */
            align-items: center;
            justify-content: center;
        }

        .close-button {
            font-size: 24px;
            line-height: 1;

            font-weight: bold;
            cursor: pointer;

            color: #818384;
        }

        .popup-content-area {
            overflow-y: auto;
        }

        .post-content-container {
            padding: 12px 16px;

            border-bottom: 2px solid #343536;

            background-color: #222224;
        }

        .post-content-container img,
        .post-content-container video {
            max-width: 100%;

            border-radius: 4px;
            margin-top: 8px;
        }

        .comments-container {
            padding: 0 16px;
        }

        .rpp-comment-wrapper {
            padding: 10px 0;

            border-bottom:
                1px solid #2a2a2c;
        }

        .rpp-comment-body {
            font-size: 14px;
            line-height: 1.5;

            color: #d7dadc;

            word-wrap: break-word;
        }

        .rpp-comment-body a {
            color: #4fbcff;
        }

        .rpp-comment-meta {
            font-size: 12px;

            color: #818384;

            margin-bottom: 6px;

            display: flex;
            align-items: center;

            gap: 8px;
            flex-wrap: wrap;
        }

        .rpp-op-badge {
            background-color: #0079d3;

            color: white;

            font-weight: bold;

            padding: 2px 5px;

            border-radius: 3px;

            font-size: 10px;
        }

        .rpp-action-btn {
            background: none;
            border: 1px solid #343536;
            color: #818384;
            cursor: pointer;
            border-radius: 3px;
            font-size: 8px; /* Reduced from 10px */
            padding: 1px 4px; /* Reduced from 2px 5px */
            display: inline-flex; /* Centers text */
            align-items: center;
            justify-content: center;
        }

        .rpp-meta-controls {
            margin-left: auto;

            display: flex;
            gap: 5px;
        }

        .rpp-toggle-replies {
            display: inline-block;

            margin-top: 8px;

            font-size: 12px;
            font-weight: bold;

            color: #818384;

            cursor: pointer;
        }

        .rpp-replies-container {
            display: none;

            margin-top: 10px;

            border-left:
                2px solid #343536;

            padding-left: 10px;
        }
    `;

    // Start the script
    init();

})();
