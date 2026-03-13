/**
 * Ollama AI Chat — Frontend JavaScript
 * =====================================
 * Handles:
 *   - Sending user messages to the /ai backend endpoint
 *   - Displaying chat messages (user & bot bubbles)
 *   - Typing indicator animation
 *   - Auto-resize textarea
 *   - Keyboard shortcuts (Enter to send, Shift+Enter for newline)
 */

(function () {
    "use strict";

    // ---- DOM Elements ----
    const chatForm = document.getElementById("chat-form");
    const userInput = document.getElementById("user-input");
    const messagesContainer = document.getElementById("messages");
    const chatContainer = document.getElementById("chat-container");
    const sendBtn = document.getElementById("send-btn");

    // ---- API Endpoint (same origin) ----
    const API_URL = "/ai";

    // ---- State ----
    let isLoading = false;

    // ========================================================================
    // Message Rendering
    // ========================================================================

    /**
     * Append a user message bubble to the chat.
     * @param {string} text - The user's message text
     */
    function addUserMessage(text) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message user-message";
        messageDiv.innerHTML = `
            <div class="avatar user-avatar">👤</div>
            <div class="bubble user-bubble">
                <p>${escapeHTML(text)}</p>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    }

    /**
     * Append a bot message bubble to the chat.
     * @param {string} text - The bot's response text
     * @param {boolean} isError - Whether this is an error message
     */
    function addBotMessage(text, isError = false) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message bot-message";

        const bubbleClass = isError ? "bubble bot-bubble error-bubble" : "bubble bot-bubble";

        // Convert markdown-like formatting to HTML
        const formattedText = isError ? escapeHTML(text) : formatResponse(text);

        messageDiv.innerHTML = `
            <div class="avatar bot-avatar">${isError ? "⚠️" : "🤖"}</div>
            <div class="${bubbleClass}">
                ${formattedText}
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    }

    /**
     * Show/hide typing indicator.
     * @param {boolean} show
     */
    function showTypingIndicator(show) {
        // Remove existing indicator if any
        const existing = document.getElementById("typing-msg");
        if (existing) existing.remove();

        if (show) {
            const typingDiv = document.createElement("div");
            typingDiv.className = "message bot-message";
            typingDiv.id = "typing-msg";
            typingDiv.innerHTML = `
                <div class="avatar bot-avatar">🤖</div>
                <div class="bubble bot-bubble typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            `;
            messagesContainer.appendChild(typingDiv);
            scrollToBottom();
        }
    }

    // ========================================================================
    // API Communication
    // ========================================================================

    /**
     * Send user prompt to the backend /ai endpoint.
     * @param {string} text - User's message
     */
    async function sendMessage(text) {
        if (isLoading) return;

        isLoading = true;
        sendBtn.disabled = true;

        // Show user message
        addUserMessage(text);

        // Show typing indicator
        showTypingIndicator(true);

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ text: text }),
            });

            // Remove typing indicator
            showTypingIndicator(false);

            const data = await response.json();

            if (response.ok && data.response) {
                addBotMessage(data.response);
            } else {
                // Error from server
                const errorMsg = data.error || data.detail || "অজানা ত্রুটি হয়েছে।";
                addBotMessage(errorMsg, true);
            }
        } catch (error) {
            // Network or other error
            showTypingIndicator(false);
            addBotMessage("সার্ভারের সাথে সংযোগ করা যাচ্ছে না। ইন্টারনেট কানেকশন চেক করুন।", true);
            console.error("Fetch error:", error);
        } finally {
            isLoading = false;
            sendBtn.disabled = false;
            userInput.focus();
        }
    }

    // ========================================================================
    // Utility Functions
    // ========================================================================

    /**
     * Escape HTML special characters to prevent XSS.
     */
    function escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Basic Markdown-like formatting for bot responses.
     * Handles: code blocks, inline code, bold, italic, line breaks
     */
    function formatResponse(text) {
        let html = escapeHTML(text);

        // Code blocks: ```...```
        html = html.replace(/```([\s\S]*?)```/g, function (match, code) {
            return '<pre><code>' + code.trim() + '</code></pre>';
        });

        // Inline code: `...`
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold: **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic: *text*
        html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

        // Line breaks
        html = html.replace(/\n/g, '<br>');

        // Wrap in paragraphs (split by double line breaks)
        // Since we already replaced \n with <br>, look for <br><br>
        const paragraphs = html.split(/<br>\s*<br>/);
        if (paragraphs.length > 1) {
            html = paragraphs.map(p => '<p>' + p.trim() + '</p>').join('');
        } else {
            html = '<p>' + html + '</p>';
        }

        return html;
    }

    /**
     * Scroll chat to the bottom.
     */
    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });
    }

    /**
     * Auto-resize textarea based on content.
     */
    function autoResizeTextarea() {
        userInput.style.height = "auto";
        const maxHeight = 120;
        userInput.style.height = Math.min(userInput.scrollHeight, maxHeight) + "px";
    }

    // ========================================================================
    // Event Listeners
    // ========================================================================

    // Form submission
    chatForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const text = userInput.value.trim();
        if (!text || isLoading) return;
        userInput.value = "";
        userInput.style.height = "auto";
        sendMessage(text);
    });

    // Enter to send, Shift+Enter for new line
    userInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event("submit"));
        }
    });

    // Auto-resize textarea on input
    userInput.addEventListener("input", autoResizeTextarea);

    // Focus input on page load
    userInput.focus();

})();
