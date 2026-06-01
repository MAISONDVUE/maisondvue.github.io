/* ═══════════════════════════════════════════════════════════════════════════
   MAISON D'VUE — Live Chat widget
   Floating launcher → intake form (name + email) → AI conversation.
   Self-contained: injects its own styles + DOM. Include on any page with:
     <script src="assets/chat.js" defer></script>
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // ── Configuration ───────────────────────────────────────────────────────────
  // Set this to your deployed Cloudflare Worker URL (see chat-worker/README.md).
  // Until it is set, the widget shows a graceful "not yet connected" message.
  var CHAT_ENDPOINT = "https://maisondvue-chat.YOUR-SUBDOMAIN.workers.dev";

  if (window.__mdvChatLoaded) return;
  window.__mdvChatLoaded = true;

  var conversation = []; // [{ role: 'user'|'assistant', content }]
  var profile = {};
  var sending = false;

  // ── Styles ──────────────────────────────────────────────────────────────────
  var css = `
  .mdv-chat, .mdv-chat * { box-sizing: border-box; }
  .mdv-chat {
    --mdv-navy: #0B1F3A; --mdv-gold: #B8996A; --mdv-warm: #FDFBF8; --mdv-mid: #62584E;
    font-family: 'Jost', Helvetica, Arial, sans-serif;
  }
  /* Launcher bubble */
  .mdv-chat-launcher {
    position: fixed; bottom: 22px; right: 22px; z-index: 2147483000;
    width: 60px; height: 60px; border: 0; cursor: pointer;
    background: var(--mdv-navy); color: #fff;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 8px 30px rgba(11,31,58,0.32);
    transition: transform 240ms ease, opacity 240ms ease;
  }
  .mdv-chat-launcher:hover { transform: translateY(-2px); }
  .mdv-chat-launcher svg { width: 26px; height: 26px; }
  .mdv-chat.open .mdv-chat-launcher { opacity: 0; pointer-events: none; }

  /* Panel */
  .mdv-chat-panel {
    position: fixed; bottom: 22px; right: 22px; z-index: 2147483000;
    width: 380px; max-width: calc(100vw - 32px);
    height: 560px; max-height: calc(100vh - 44px);
    background: var(--mdv-warm); border: 1px solid rgba(11,31,58,0.12);
    box-shadow: 0 18px 60px rgba(11,31,58,0.30);
    display: flex; flex-direction: column;
    opacity: 0; transform: translateY(16px) scale(0.98); pointer-events: none;
    transition: opacity 320ms cubic-bezier(0.22,0.61,0.36,1), transform 320ms cubic-bezier(0.22,0.61,0.36,1);
  }
  .mdv-chat.open .mdv-chat-panel { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

  .mdv-chat-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px; border-bottom: 1px solid rgba(11,31,58,0.10);
    flex-shrink: 0;
  }
  .mdv-chat-title {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500;
    font-size: 16px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--mdv-navy);
  }
  .mdv-chat-close {
    background: transparent; border: 0; cursor: pointer; color: var(--mdv-navy);
    font-size: 24px; line-height: 1; padding: 0 4px; transition: color 200ms ease;
  }
  .mdv-chat-close:hover { color: var(--mdv-gold); }

  .mdv-chat-body { flex: 1; overflow-y: auto; padding: 22px 20px; }

  /* Intake form */
  .mdv-chat-intro {
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; line-height: 1.5;
    color: var(--mdv-navy); margin: 0 0 4px;
  }
  .mdv-chat-sub { font-size: 12px; color: var(--mdv-mid); margin: 0 0 22px; letter-spacing: 0.02em; }
  .mdv-chat-field { margin-bottom: 18px; }
  .mdv-chat-field label {
    display: block; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--mdv-mid); margin-bottom: 6px;
  }
  .mdv-chat-field input, .mdv-chat-compose textarea {
    width: 100%; background: transparent; border: 0; border-bottom: 1px solid rgba(11,31,58,0.30);
    color: var(--mdv-navy); font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px;
    padding: 6px 0; outline: none;
  }
  .mdv-chat-field input:focus { border-bottom-color: var(--mdv-navy); }
  .mdv-chat-row { display: flex; gap: 14px; }
  .mdv-chat-row .mdv-chat-field { flex: 1; }
  .mdv-chat-consent { font-size: 11px; line-height: 1.5; color: var(--mdv-mid); margin: 6px 0 16px; }
  .mdv-chat-consent a { color: var(--mdv-navy); text-decoration: underline; }
  .mdv-chat-start {
    width: 100%; background: var(--mdv-navy); color: #fff; border: 0; cursor: pointer;
    padding: 15px; font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    font-weight: 500; transition: background 240ms ease;
  }
  .mdv-chat-start:hover { background: #122749; }
  .mdv-chat-start:disabled { opacity: 0.55; cursor: not-allowed; }
  .mdv-chat-error { color: #B26A6A; font-size: 12px; min-height: 16px; margin-top: 10px; font-style: italic; }

  /* Conversation log */
  .mdv-chat-msg { margin-bottom: 16px; display: flex; }
  .mdv-chat-msg.user { justify-content: flex-end; }
  .mdv-chat-bubble {
    max-width: 82%; padding: 11px 15px; font-size: 14.5px; line-height: 1.5;
    font-family: 'Cormorant Garamond', Georgia, serif;
  }
  .mdv-chat-msg.bot .mdv-chat-bubble { background: #F1ECE2; color: var(--mdv-navy); }
  .mdv-chat-msg.user .mdv-chat-bubble { background: var(--mdv-navy); color: #fff; }
  .mdv-chat-typing { display: inline-flex; gap: 4px; align-items: center; }
  .mdv-chat-typing span {
    width: 6px; height: 6px; border-radius: 50%; background: var(--mdv-gold);
    animation: mdvBlink 1.2s infinite ease-in-out both;
  }
  .mdv-chat-typing span:nth-child(2) { animation-delay: 0.2s; }
  .mdv-chat-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes mdvBlink { 0%,80%,100% { opacity: 0.25; } 40% { opacity: 1; } }

  /* Composer */
  .mdv-chat-compose {
    display: none; flex-shrink: 0; border-top: 1px solid rgba(11,31,58,0.10);
    padding: 12px 16px; align-items: flex-end; gap: 10px;
  }
  .mdv-chat.chatting .mdv-chat-compose { display: flex; }
  .mdv-chat-compose textarea {
    border-bottom: 0; resize: none; max-height: 96px; font-size: 15px; line-height: 1.4;
  }
  .mdv-chat-send {
    background: transparent; border: 0; cursor: pointer; color: var(--mdv-navy);
    font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 500;
    padding: 8px 4px; white-space: nowrap; transition: color 200ms ease;
  }
  .mdv-chat-send:hover { color: var(--mdv-gold); }
  .mdv-chat-send:disabled { opacity: 0.45; cursor: not-allowed; }

  @media (max-width: 480px) {
    .mdv-chat-panel { bottom: 0; right: 0; width: 100vw; height: 100vh; max-height: 100vh; border: 0; }
    .mdv-chat-launcher { bottom: 18px; right: 18px; }
  }`;

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── DOM ───────────────────────────────────────────────────────────────────
  var root = document.createElement("div");
  root.className = "mdv-chat";
  root.innerHTML = `
    <button class="mdv-chat-launcher" type="button" aria-label="Open live chat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/>
      </svg>
    </button>
    <div class="mdv-chat-panel" role="dialog" aria-label="Live chat" aria-modal="false">
      <div class="mdv-chat-header">
        <span class="mdv-chat-title">Live Chat</span>
        <button class="mdv-chat-close" type="button" aria-label="Close chat">&times;</button>
      </div>
      <div class="mdv-chat-body">
        <form class="mdv-chat-intake" novalidate>
          <p class="mdv-chat-intro">To begin, may we have your name and email?</p>
          <p class="mdv-chat-sub">A member of the house will assist you.</p>
          <div class="mdv-chat-row">
            <div class="mdv-chat-field">
              <label for="mdvFirst">First name</label>
              <input type="text" id="mdvFirst" autocomplete="given-name" required>
            </div>
            <div class="mdv-chat-field">
              <label for="mdvLast">Last name</label>
              <input type="text" id="mdvLast" autocomplete="family-name">
            </div>
          </div>
          <div class="mdv-chat-field">
            <label for="mdvEmail">Email</label>
            <input type="email" id="mdvEmail" autocomplete="email" required>
          </div>
          <p class="mdv-chat-consent">By starting a chat, you agree to MAISON D&rsquo;VUE&rsquo;s <a href="mailto:hello@maisondvue.com">Privacy Policy</a>.</p>
          <button type="submit" class="mdv-chat-start">Start Chat</button>
          <p class="mdv-chat-error" aria-live="polite"></p>
        </form>
      </div>
      <form class="mdv-chat-compose" novalidate>
        <textarea rows="1" placeholder="Write a message&hellip;" aria-label="Message"></textarea>
        <button type="submit" class="mdv-chat-send">Send</button>
      </form>
    </div>`;
  document.body.appendChild(root);

  // ── References ──────────────────────────────────────────────────────────────
  var launcher = root.querySelector(".mdv-chat-launcher");
  var closeBtn = root.querySelector(".mdv-chat-close");
  var body = root.querySelector(".mdv-chat-body");
  var intake = root.querySelector(".mdv-chat-intake");
  var errorEl = root.querySelector(".mdv-chat-error");
  var compose = root.querySelector(".mdv-chat-compose");
  var textarea = compose.querySelector("textarea");
  var sendBtn = compose.querySelector(".mdv-chat-send");

  // ── Open / close ────────────────────────────────────────────────────────────
  function open() {
    root.classList.add("open");
    var firstInput = root.querySelector(".mdv-chat-intake input");
    if (firstInput && !root.classList.contains("chatting")) setTimeout(function () { firstInput.focus(); }, 320);
  }
  function close() { root.classList.remove("open"); }
  launcher.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && root.classList.contains("open")) close();
  });

  // ── Intake → conversation ─────────────────────────────────────────────────
  intake.addEventListener("submit", function (e) {
    e.preventDefault();
    errorEl.textContent = "";
    var first = root.querySelector("#mdvFirst").value.trim();
    var last = root.querySelector("#mdvLast").value.trim();
    var email = root.querySelector("#mdvEmail").value.trim();

    if (!first) { errorEl.textContent = "Your first name, please."; return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = "A valid email, please."; return;
    }

    profile = { firstName: first, lastName: last, email: email };
    intake.style.display = "none";
    root.classList.add("chatting");

    addBubble("bot", "Welcome, " + first + ". I am the maison’s advisor. How may I help you today?");
    textarea.focus();
  });

  // ── Composer ────────────────────────────────────────────────────────────────
  textarea.addEventListener("input", function () {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 96) + "px";
  });
  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); compose.requestSubmit(); }
  });
  compose.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = textarea.value.trim();
    if (!text || sending) return;
    textarea.value = "";
    textarea.style.height = "auto";
    addBubble("user", text);
    conversation.push({ role: "user", content: text });
    sendToAdvisor();
  });

  // ── Networking ────────────────────────────────────────────────────────────
  function sendToAdvisor() {
    if (CHAT_ENDPOINT.indexOf("YOUR-SUBDOMAIN") !== -1) {
      addBubble("bot", "Our live advisor is not yet connected. Please write to hello@maisondvue.com and the house will reply personally.");
      return;
    }
    sending = true;
    sendBtn.disabled = true;
    var typing = addTyping();

    fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: profile, messages: conversation }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        typing.remove();
        var reply = data && data.reply ? data.reply : "Forgive us — something faltered. Please try again, or write to hello@maisondvue.com.";
        conversation.push({ role: "assistant", content: reply });
        addBubble("bot", reply);
      })
      .catch(function () {
        typing.remove();
        addBubble("bot", "Forgive us — the line faltered. Please try again, or write to hello@maisondvue.com.");
      })
      .finally(function () {
        sending = false;
        sendBtn.disabled = false;
        textarea.focus();
      });
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function addBubble(who, text) {
    var msg = document.createElement("div");
    msg.className = "mdv-chat-msg " + who;
    var bubble = document.createElement("div");
    bubble.className = "mdv-chat-bubble";
    bubble.textContent = text;
    msg.appendChild(bubble);
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
    return msg;
  }
  function addTyping() {
    var msg = document.createElement("div");
    msg.className = "mdv-chat-msg bot";
    msg.innerHTML = '<div class="mdv-chat-bubble"><span class="mdv-chat-typing"><span></span><span></span><span></span></span></div>';
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
    return msg;
  }
})();
