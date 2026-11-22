// ==UserScript==
// @name         Reddit Hover Post & Comment Downloader (Desktop App Edition)
// @namespace    http://tampermonkey.net/
// @version      5.4.1
// @description  View, download, or copy Reddit posts and comments. Adapted for desktop app wrappers.
// @author       You (modified)
// @match        https://www.reddit.com/*
// @match        https://www.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      reddit.com
// @connect      redd.it
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    /* ====================
       Desktop App GM_* Polyfills
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

    if (typeof GM_registerMenuCommand === 'undefined') {
        window.GM_registerMenuCommand = () => {};
    }

    if (typeof GM_xmlhttpRequest === 'undefined') {
        window.GM_xmlhttpRequest = undefined;
    }

    // --- Configuration ---
    const MAX_TOP_LEVEL_COMMENTS = 15;
    const MAX_REPLY_DEPTH = 5;
    const HOVER_DELAY = 500;
    const CACHE_MAX_ITEMS = 50;

    // --- State Management ---
    let useCtrlHover = GM_getValue('rpp_use_ctrl_hover', true); // Default to true so Ctrl+Hover is active

    // --- Cache ---
    const cache = {
        get(key) { const i = sessionStorage.getItem(key); return i ? JSON.parse(i) : null; },
        set(key, value) {
            let keys = JSON.parse(sessionStorage.getItem('__cache_keys__') || '[]');
            if (!keys.includes(key)) {
                keys.push(key);
                if (keys.length > CACHE_MAX_ITEMS) { sessionStorage.removeItem(keys.shift()); }
                sessionStorage.setItem('__cache_keys__', JSON.stringify(keys));
            }
            sessionStorage.setItem(key, JSON.stringify(value));
        }
    };

    // --- CORS-Safe Fetch using GM_xmlhttpRequest with standard fetch fallback ---
    function fetchRedditJson(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: { 'Accept': 'application/json' },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            try {
                                resolve(JSON.parse(res.responseText));
                            } catch (e) {
                                reject(new Error('Failed to parse JSON response'));
                            }
                        } else if (res.status === 429) {
                            reject(new Error('Rate limited by Reddit (HTTP 429)'));
                        } else {
                            reject(new Error(`Reddit responded with status ${res.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Network error fetching Reddit post')),
                    ontimeout: () => reject(new Error('Request timed out'))
                });
            } else {
                fetch(url, { headers: { 'Accept': 'application/json' } })
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP status: ${res.status}`);
                        return res.json();
                    })
                    .then(resolve)
                    .catch(reject);
            }
        });
    }

    // --- Helper Functions ---
    function downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async function copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => { button.textContent = originalText; }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            const originalText = button.textContent;
            button.textContent = 'Error!';
            setTimeout(() => { button.textContent = originalText; }, 2000);
        }
    }

    // --- On-Screen Message (Toast) ---
    function showToast(message) {
        let toast = document.getElementById('rpp-toast-msg');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'rpp-toast-msg';
            Object.assign(toast.style, {
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#333',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '5px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                zIndex: '2147483647',
                fontSize: '14px',
                fontFamily: 'sans-serif',
                transition: 'opacity 0.3s ease',
                opacity: '0',
                pointerEvents: 'none'
            });
            (document.body || document.documentElement).appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';

        if (toast.dataset.timeoutId) clearTimeout(parseInt(toast.dataset.timeoutId));
        toast.dataset.timeoutId = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    }

    // --- Toggle Logic ---
    function toggleTriggerMode() {
    useCtrlHover = !useCtrlHover;
    GM_setValue('rpp_use_ctrl_hover', useCtrlHover);
    const status = useCtrlHover ? "ON (Ctrl + Hover)" : "OFF (Disabled)";
    showToast(`Trigger Mode: ${status}`);
}

GM_registerMenuCommand("Toggle Ctrl+Hover Mode", toggleTriggerMode);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
        toggleTriggerMode();
    }
});

    // --- CSS for UI ---
    const style = document.createElement('style');
    style.textContent = `
        .hover-comment-popup {
            position: fixed !important;
            right: 20px !important;
            width: 500px !important;
            max-width: 90vw !important;
            background-color: #1a1a1b !important;
            color: #d7dadc !important;
            border: 1px solid #343536 !important;
            border-radius: 8px !important;
            box-shadow: 0 5px 20px rgba(0,0,0,0.4) !important;
            z-index: 2147483647 !important;
            max-height: 85vh !important;
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            outline: none !important;
        }
        .hover-comment-popup .popup-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #343536; background-color: #2a2a2c; flex-shrink: 0; }
        .hover-comment-popup .popup-header-main { flex-grow: 1; min-width: 0; }
        .hover-comment-popup h3 { margin: 0; font-size: 16px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .popup-controls { display: flex; align-items: center; gap: 10px; padding-left: 10px; }
        .rpp-main-btn {
            background-color: #0079d3;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
            min-width: 60px;
        }
        .rpp-main-btn:hover { background-color: #148be0; }
        .close-button { font-size: 24px; line-height: 1; font-weight: bold; cursor: pointer; color: #818384; padding: 0 5px; }
        .popup-content-area { overflow-y: auto; }
        .post-content-container { padding: 12px 16px; border-bottom: 2px solid #343536; background-color: #222224; }
        .post-content-container img, .post-content-container video { max-width: 100%; border-radius: 8px; margin-top: 10px; }
        .comments-container { padding: 0 16px; }
        .rpp-comment-wrapper { padding: 10px 0; border-bottom: 1px solid #2a2a2c; }
        .rpp-comment-body { font-size: 14px; line-height: 1.5; color: #d7dadc; word-wrap: break-word; }
        .rpp-comment-body a { color: #4fbcff; text-decoration: none; }
        .rpp-comment-meta { font-size: 12px; color: #818384; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .rpp-op-badge { background-color: #0079d3; color: white; font-weight: bold; padding: 2px 5px; border-radius: 3px; font-size: 10px; }
        .rpp-action-btn { background: none; border: 1px solid #343536; color: #818384; cursor: pointer; border-radius: 3px; font-size: 10px; padding: 2px 5px; }
        .rpp-action-btn:hover { background: #343536; color: #d7dadc; }
        .rpp-meta-controls { margin-left: auto; display: flex; gap: 5px; }
        .rpp-comment-wrapper[data-depth='1'] { margin-left: 20px; }
        .rpp-toggle-replies { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: bold; color: #818384; cursor: pointer; }
        .rpp-replies-container { display: none; margin-top: 10px; border-left: 2px solid #343536; padding-left: 10px; }
    `;
    (document.head || document.documentElement).appendChild(style);

    // --- Panel & Viewport-Probe Creation ---
    const popup = document.createElement('div');
    popup.className = 'hover-comment-popup';
    popup.style.display = 'none';

    // Invisible probe to measure true viewport offset
    const probe = document.createElement('div');
    probe.id = 'rpp-viewport-probe';
    probe.style.cssText = 'position:fixed!important;top:0px!important;left:0px!important;width:1px!important;height:1px!important;visibility:hidden!important;pointer-events:none!important;margin:0!important;padding:0!important;border:none!important;';

    function ensureElementsAttached() {
        const root = document.body || document.documentElement;
        if (!probe.parentElement) root.appendChild(probe);
        if (!popup.parentElement) root.appendChild(popup);
    }

    function updatePopupPosition() {
        if (popup.style.display === 'none') return;
        ensureElementsAttached();
        const probeRect = probe.getBoundingClientRect();
        const targetTop = 20 - probeRect.top;
        popup.style.setProperty('top', targetTop + 'px', 'important');
    }

    window.addEventListener('scroll', updatePopupPosition, { passive: true, capture: true });
    window.addEventListener('resize', updatePopupPosition, { passive: true });

    function showPopupElement() {
        ensureElementsAttached();
        popup.style.display = 'flex';
        updatePopupPosition();
    }

    function hidePopup() {
        popup.style.display = 'none';
        delete popup.dataset.currentUrl;
    }

    let activationTimeout;

    function decodeHtmlEntities(text) {
        const ta = document.createElement('textarea');
        ta.innerHTML = text;
        return ta.value;
    }

    function renderCommentTree(commentData, postData, parentElement, depth) {
        if (!commentData || !commentData.author || depth > MAX_REPLY_DEPTH) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'rpp-comment-wrapper';
        wrapper.dataset.depth = depth;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'rpp-comment-meta';
        let metaHTML = `<span><b>${commentData.author}</b></span> <span>⬆️ ${commentData.score}</span>`;
        if (commentData.author === postData.author) { metaHTML += `<span class="rpp-op-badge">OP</span>`; }
        metaDiv.innerHTML = metaHTML;

        const metaControls = document.createElement('div');
        metaControls.className = 'rpp-meta-controls';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'rpp-action-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
            const fileContent = `Author: ${commentData.author}\nScore: ${commentData.score}\n\n${commentData.body}`;
            copyToClipboard(fileContent, copyBtn);
        };

        const saveBtn = document.createElement('button');
        saveBtn.className = 'rpp-action-btn';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => {
            const fileContent = `Author: ${commentData.author}\nScore: ${commentData.score}\n\n${commentData.body}`;
            downloadTextFile(`reddit_${postData.id}_comment_${commentData.id}.txt`, fileContent);
        };
        metaControls.appendChild(copyBtn);
        metaControls.appendChild(saveBtn);
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
                    const isHidden = repliesContainer.style.display === 'none';
                    repliesContainer.style.display = isHidden ? 'block' : 'none';
                    toggleBtn.textContent = isHidden ? `▼ Hide replies` : `▶ Show ${validReplies.length} replies`;
                });
                validReplies.forEach(reply => { renderCommentTree(reply.data, postData, repliesContainer, depth + 1); });
                wrapper.appendChild(toggleBtn);
                wrapper.appendChild(repliesContainer);
            }
        }
        parentElement.appendChild(wrapper);
    }

    function formatCommentsToString(comments, postAuthor, depth = 0) {
        let text = '';
        const indent = '    '.repeat(depth);
        comments.forEach(comment => {
            if (comment.kind !== 't1' || !comment.data.author) return;
            const c = comment.data;
            const isOp = c.author === postAuthor ? ' (OP)' : '';
            text += `${indent}--- \n${indent}Author: ${c.author}${isOp}\n${indent}Score: ${c.score}\n\n${indent}${c.body.replace(/\n/g, `\n${indent}`)}\n\n`;
            if (c.replies?.data?.children.length > 0) { text += formatCommentsToString(c.replies.data.children, postAuthor, depth + 1); }
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
        const comments = data[1].data.children.filter(c => c.kind === 't1' && c.data.author && !c.data.stickied).slice(0, MAX_TOP_LEVEL_COMMENTS);

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
            </div>`;
        popup.querySelector('.close-button').addEventListener('click', hidePopup);

        const postContainer = popup.querySelector('.post-content-container');
        const postMetaDiv = document.createElement('div');
        postMetaDiv.className = 'rpp-comment-meta';
        postMetaDiv.innerHTML = `<span><b>${postData.author}</b> (Post)</span> <span>⬆️ ${postData.score}</span>`;

        const postControls = document.createElement('div');
        postControls.className = 'rpp-meta-controls';
        const postCopyBtn = document.createElement('button');
        postCopyBtn.className = 'rpp-action-btn';
        postCopyBtn.textContent = 'Copy Post';
        const postContentText = `Title: ${postData.title}\nAuthor: ${postData.author}\nScore: ${postData.score}\nURL: ${postData.url}\n\n${postData.selftext}`;
        postCopyBtn.onclick = () => copyToClipboard(postContentText, postCopyBtn);

        const postSaveBtn = document.createElement('button');
        postSaveBtn.className = 'rpp-action-btn';
        postSaveBtn.textContent = 'Save Post';
        postSaveBtn.onclick = () => downloadTextFile(`reddit_post_${postData.id}.txt`, postContentText);

        postControls.appendChild(postCopyBtn);
        postControls.appendChild(postSaveBtn);
        postMetaDiv.appendChild(postControls);
        postContainer.appendChild(postMetaDiv);

        const postBodyDiv = document.createElement('div');
        postBodyDiv.className = 'rpp-comment-body';
        if (postData.selftext_html) { postBodyDiv.innerHTML = decodeHtmlEntities(postData.selftext_html); }
        else if (postData.post_hint === 'image') { postBodyDiv.innerHTML = `<a href="${postData.url}" target="_blank"><img src="${postData.url}" alt="Post Image"></a>`; }
        else if (postData.post_hint === 'hosted:video') { postBodyDiv.innerHTML = `<video src="${postData.media.reddit_video.fallback_url}" controls muted loop preload="auto"></video>`; }
        else if (postData.url) { postBodyDiv.innerHTML = `<p>Link: <a href="${postData.url}" target="_blank">${postData.url}</a></p>`; }
        postContainer.appendChild(postBodyDiv);

        const commentsContainer = popup.querySelector('.comments-container');
        if (comments.length === 0) { commentsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #818384;">No comments found.</div>'; }
        else { comments.forEach(comment => renderCommentTree(comment.data, postData, commentsContainer, 0)); }

        const fullContentText = getFullContentAsText(postData, comments);
        const copyAllBtn = popup.querySelector('#rpp-copy-all');
        copyAllBtn.addEventListener('click', () => copyToClipboard(fullContentText, copyAllBtn));
        popup.querySelector('#rpp-download-all').addEventListener('click', () => downloadTextFile(`reddit_${postData.id}_full.txt`, fullContentText));

        showPopupElement();
    }

    async function showPopup(jsonUrl) {
        if (popup.style.display === 'flex' && popup.dataset.currentUrl === jsonUrl) return;

        const cachedData = cache.get(jsonUrl);
        if (cachedData) { renderPopupFromData(cachedData, jsonUrl); return; }

        showPopupElement();
        popup.innerHTML = `<div class="popup-header"><h3>Loading...</h3><span class="close-button">×</span></div>`;
        popup.querySelector('.close-button').addEventListener('click', hidePopup);

        try {
            const data = await fetchRedditJson(jsonUrl);
            cache.set(jsonUrl, data);
            renderPopupFromData(data, jsonUrl);
        } catch (err) {
            console.error("Reddit Preview Error:", err);
            popup.querySelector('h3').textContent = err.message || 'Error loading post';
        }
    }

    function getClosestRedditLink(target) {
        if (!target) return null;
        const el = target instanceof Element ? target : target.parentElement;
        if (!el || typeof el.closest !== 'function') return null;
        const link = el.closest('a[href*="/comments/"]');
        if (!link || link.href.includes('/search')) return null;
        return link;
    }

    document.addEventListener('mouseenter', (e) => {
    const link = getClosestRedditLink(e.target);
    if (!link) return;

    // Require Ctrl key to be held down
    if (useCtrlHover && !e.ctrlKey) return;

    const jsonUrl = link.href.split('?')[0].replace(/\/$/, '') + '.json';
    activationTimeout = setTimeout(() => showPopup(jsonUrl), HOVER_DELAY);
}, true);

})();
