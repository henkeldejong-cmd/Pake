(function () {
    'use strict';

    // --- Configuration ---
    const MAX_TOP_LEVEL_COMMENTS = 15;
    const MAX_REPLY_DEPTH = 5;
    const CACHE_MAX_ITEMS = 100;
    const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 hours
    const HOVER_DELAY_MS = 450; // Hover time before opening preview

    // --- Global State ---
    let isPopupClosing = false;
    let savedScrollY = 0;
    let popupOpenedTimestamp = 0;
    let hoverTimer = null;
    let activeHoverLink = null;
    let backdrop = null;
    let popup = null;

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
            const item = { data: value, timestamp: Date.now() };
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
                try { timestamp = (JSON.parse(localStorage.getItem(key)) || {}).timestamp || 0; } catch (e) {}
                return { key, timestamp };
            });

            items.sort((a, b) => a.timestamp - b.timestamp);
            const toRemove = items.slice(0, items.length - CACHE_MAX_ITEMS + (force ? 10 : 0));
            toRemove.forEach(item => localStorage.removeItem(item.key));
        }
    };

    // --- Helper Functions ---
    function downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
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
            setTimeout(() => { button.textContent = 'Copy'; }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            button.textContent = 'Error!';
            setTimeout(() => { button.textContent = 'Copy'; }, 2000);
        }
    }

    function decodeHtmlEntities(text) {
        if (!text) return '';
        const ta = document.createElement('textarea');
        ta.innerHTML = text;
        return ta.value;
    }

    // Find Reddit post/comment link even inside Shadow DOM (shreddit-post)
    function findCommentLink(event) {
        const path = event.composedPath ? event.composedPath() : [event.target];
        for (const el of path) {
            if (el === popup) return null; // Ignore links inside the preview popup itself
            if (
                el &&
                el.tagName === 'A' &&
                el.href &&
                el.href.includes('/comments/') &&
                !el.href.includes('/comment/')
            ) {
                return el;
            }
        }
        return null;
    }

    // --- Popup Logic ---
    function handleBackButton() {
        if (Date.now() - popupOpenedTimestamp < 500) return;
        if (popup && popup.classList.contains('visible')) {
            hidePopup(true);
        }
    }

    function hidePopup(isFromPopState = false) {
        if (!popup || isPopupClosing || !popup.classList.contains('visible')) return;
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

            if (!isFromPopState && window.history.state?.rpp_popup) {
                history.back();
            }
            isPopupClosing = false;
        }, 300);
    }

    async function processPost(linkElement) {
        const jsonUrl = linkElement.href.split('?')[0].replace(/\/$/, '') + '.json';
        const cacheKey = `rpp_cache_${jsonUrl}`;

        if (popup.classList.contains('visible') && popup.dataset.currentUrl === jsonUrl) {
            return;
        }

        document.body.style.cursor = 'progress';

        try {
            let data = persistentCache.get(cacheKey);
            if (!data) {
                const res = await fetch(jsonUrl);
                if (!res.ok) throw new Error(`Fetch failed with status: ${res.status}`);
                data = await res.json();
                persistentCache.set(cacheKey, data);
            }
            renderPopupFromData(data, jsonUrl);
        } catch (err) {
            console.error("Reddit Preview Error:", err);
            renderErrorPopup('Could not load comments. Reddit may be rate-limiting requests.');
        } finally {
            document.body.style.cursor = '';
        }
    }

    function showPopup() {
        if (popup.classList.contains('visible')) return;
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
            history.pushState({ rpp_popup: true }, '', window.location.href);
        }
    }

    function renderErrorPopup(message = 'Could not load comments.') {
        popup.innerHTML = `
            <div class="popup-header">
                <h3>Error</h3>
                <span class="close-button">×</span>
            </div>
            <div style="padding:20px; text-align:center;">${message}</div>
        `;
        popup.querySelector('.close-button').addEventListener('click', () => hidePopup());
        showPopup();
    }

    function formatCommentsToString(comments, postAuthor, depth = 0) {
        let text = '';
        const indent = '    '.repeat(depth);

        comments.forEach(comment => {
            if (comment.kind !== 't1' || !comment.data.author) return;
            const c = comment.data;
            const isOp = c.author === postAuthor ? ' (OP)' : '';
            text += `${indent}--- \n${indent}Author: ${c.author}${isOp}\n${indent}Score: ${c.score}\n\n${indent}${c.body.replace(/\n/g, `\n${indent}`)}\n\n`;
            if (c.replies?.data?.children.length > 0) {
                text += formatCommentsToString(c.replies.data.children, postAuthor, depth + 1);
            }
        });
        return text;
    }

    function getFullContentAsText(postData, comments) {
        let fullText = `========================================\nPOST\n========================================\n`;
        fullText += `Title: ${postData.title}\nAuthor: ${postData.author}\nScore: ${postData.score}\nURL: https://www.reddit.com${postData.permalink}\n\n`;
        fullText += postData.selftext ? `${postData.selftext}\n\n` : `[Link or Media Content: ${postData.url}]\n\n`;
        fullText += `========================================\nCOMMENTS\n========================================\n\n`;
        fullText += formatCommentsToString(comments, postData.author);
        return fullText;
    }

    function renderPopupFromData(data, url) {
        const postData = data[0].data.children[0].data;
        const comments = data[1].data.children
            .filter(c => c.kind === 't1' && c.data.author && !c.data.stickied)
            .slice(0, MAX_TOP_LEVEL_COMMENTS);

        popup.dataset.currentUrl = url;
        popup.innerHTML = `
            <div class="popup-header">
                <div class="popup-header-main"><h3>${postData.title}</h3></div>
                <div class="popup-controls">
                    <button class="rpp-main-btn" id="rpp-copy-all">Copy</button>
                    <button class="rpp-main-btn" id="rpp-download-all">Download</button>
                    <span class="close-button">×</span>
                </div>
            </div>
            <div class="popup-content-area">
                <div class="post-content-container"></div>
                <div class="comments-container"></div>
            </div>
        `;

        popup.querySelector('.close-button').addEventListener('click', () => hidePopup());

        const postContainer = popup.querySelector('.post-content-container');
        const postMetaDiv = document.createElement('div');
        postMetaDiv.className = 'rpp-comment-meta';
        postMetaDiv.innerHTML = `<span><b>${postData.author}</b> (Post)</span> <span>⬆️ ${postData.score}</span>`;

        const postControls = document.createElement('div');
        postControls.className = 'rpp-meta-controls';

        const postCopyBtn = document.createElement('button');
        postCopyBtn.className = 'rpp-action-btn';
        postCopyBtn.textContent = 'Copy Post';
        const postContentText = `Title: ${postData.title}\nAuthor: ${postData.author}\n\n${postData.selftext}`;
        postCopyBtn.onclick = () => copyToClipboard(postContentText, postCopyBtn);

        postControls.appendChild(postCopyBtn);
        postMetaDiv.appendChild(postControls);
        postContainer.appendChild(postMetaDiv);

        const postBodyDiv = document.createElement('div');
        postBodyDiv.className = 'rpp-comment-body';

        if (postData.selftext_html) {
            postBodyDiv.innerHTML = decodeHtmlEntities(postData.selftext_html);
        } else if (postData.post_hint === 'image') {
            postBodyDiv.innerHTML = `<a href="${postData.url}" target="_blank"><img src="${postData.url}" alt="Post Image"></a>`;
        } else if (postData.post_hint === 'hosted:video') {
            postBodyDiv.innerHTML = `<video src="${postData.media.reddit_video.fallback_url}" controls muted loop preload="auto"></video>`;
        } else if (postData.url) {
            postBodyDiv.innerHTML = `<p><a href="${postData.url}" target="_blank">${postData.url}</a></p>`;
        }
        postContainer.appendChild(postBodyDiv);

        const commentsContainer = popup.querySelector('.comments-container');
        if (comments.length === 0) {
            commentsContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#818384;">No comments found.</div>';
        } else {
            comments.forEach(comment => renderCommentTree(comment.data, postData.author, commentsContainer, 0));
        }

        const fullContentText = getFullContentAsText(postData, comments);
        const copyAllBtn = popup.querySelector('#rpp-copy-all');
        copyAllBtn.addEventListener('click', () => copyToClipboard(fullContentText, copyAllBtn));
        popup.querySelector('#rpp-download-all').addEventListener('click', () => downloadTextFile(`reddit_${postData.id}.txt`, fullContentText));

        showPopup();
    }

    function renderCommentTree(commentData, postAuthor, parentElement, depth) {
        if (!commentData || !commentData.author || depth > MAX_REPLY_DEPTH) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'rpp-comment-wrapper';
        wrapper.dataset.depth = depth;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'rpp-comment-meta';
        let metaHTML = `<span><b>${commentData.author}</b></span><span>•</span><span>⬆️ ${commentData.score}</span>`;
        if (commentData.author === postAuthor) metaHTML += `<span class="rpp-op-badge">OP</span>`;
        metaDiv.innerHTML = metaHTML;

        const metaControls = document.createElement('div');
        metaControls.className = 'rpp-meta-controls';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'rpp-action-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => copyToClipboard(commentData.body, copyBtn);

        metaControls.appendChild(copyBtn);
        metaDiv.appendChild(metaControls);
        wrapper.appendChild(metaDiv);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'rpp-comment-body';
        bodyDiv.innerHTML = decodeHtmlEntities(commentData.body_html) || '[comment deleted]';
        wrapper.appendChild(bodyDiv);

        const replies = commentData.replies?.data?.children;
        if (replies?.length > 0) {
            const validReplies = replies.filter(reply => reply.kind === 't1' && reply.data.author);
            if (validReplies.length > 0) {
                const toggleBtn = document.createElement('div');
                toggleBtn.className = 'rpp-toggle-replies';
                toggleBtn.textContent = `▶ Show ${validReplies.length} replies`;

                const repliesContainer = document.createElement('div');
                repliesContainer.className = 'rpp-replies-container';

                toggleBtn.addEventListener('click', () => {
                    const isHidden = repliesContainer.style.display === 'none' || !repliesContainer.style.display;
                    repliesContainer.style.display = isHidden ? 'block' : 'none';
                    toggleBtn.textContent = isHidden ? `▼ Hide replies` : `▶ Show ${validReplies.length} replies`;
                });

                validReplies.forEach(reply => renderCommentTree(reply.data, postAuthor, repliesContainer, depth + 1));
                wrapper.appendChild(toggleBtn);
                wrapper.appendChild(repliesContainer);
            }
        }
        parentElement.appendChild(wrapper);
    }

    // --- Initialization (Desktop Hover) ---
    function init() {
        GM_addStyle(GM_STYLES);

        backdrop = document.createElement('div');
        backdrop.className = 'rpp-backdrop';
        backdrop.addEventListener('click', () => hidePopup());
        document.body.appendChild(backdrop);

        popup = document.createElement('div');
        popup.className = 'hover-comment-popup';
        document.body.appendChild(popup);

        // Hover listener across light + Shadow DOM
        document.addEventListener('mouseover', (event) => {
            if (popup.classList.contains('visible')) return;
            const link = findCommentLink(event);
            if (!link) return;
            if (activeHoverLink === link) return;

            clearTimeout(hoverTimer);
            activeHoverLink = link;

            hoverTimer = setTimeout(() => {
                if (activeHoverLink === link) {
                    processPost(link);
                }
            }, HOVER_DELAY_MS);
        }, true);

        document.addEventListener('mouseout', (event) => {
            if (!activeHoverLink) return;
            const path = event.composedPath ? event.composedPath() : [event.target];
            if (!path.includes(activeHoverLink)) return;
            if (event.relatedTarget && activeHoverLink.contains(event.relatedTarget)) return;

            clearTimeout(hoverTimer);
            activeHoverLink = null;
        }, true);

        // Close on Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') hidePopup();
        });

        window.addEventListener('popstate', handleBackButton);
    }

    // --- Injected CSS (Centered Desktop Modal) ---
    const GM_STYLES = `
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
            bottom: 20px;
            left: 50%;
            width: 92%;
            max-width: 780px;
            max-height: 85vh;
            background-color: #1a1a1b;
            color: #d7dadc;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            z-index: 9999;
            display: none;
            flex-direction: column;
            transform: translate(-50%, 110%);
            transition: transform 0.25s ease-out;
        }
        .hover-comment-popup.visible {
            transform: translate(-50%, 0);
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
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .close-button {
            font-size: 24px;
            line-height: 1;
            font-weight: bold;
            cursor: pointer;
            color: #818384;
            padding: 0 4px;
        }
        .close-button:hover { color: #fff; }
        .popup-content-area { overflow-y: auto; }
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
        .comments-container { padding: 0 16px 16px; }
        .rpp-comment-wrapper {
            padding: 10px 0;
            border-bottom: 1px solid #2a2a2c;
        }
        .rpp-comment-body {
            font-size: 14px;
            line-height: 1.5;
            color: #d7dadc;
            word-wrap: break-word;
        }
        .rpp-comment-body a { color: #4fbcff; }
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
            font-size: 10px;
            padding: 2px 6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .rpp-meta-controls { margin-left: auto; display: flex; gap: 5px; }
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
            border-left: 2px solid #343536;
            padding-left: 10px;
        }
    `;

    if (document.body) init();
    else window.addEventListener('DOMContentLoaded', init, { once: true });
})();
