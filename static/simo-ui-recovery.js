// SIMO OCT 4 FINAL FOUNDATION RC10 — business text-first guard
// SIMO UI RECOVERY — live safety bindings
// Purpose: restore base buttons, login/logout, starter chips, and non-design chat send.
// This does not replace the design workspace or credit-pack logic.

(function () {
  "use strict";

  if (window.__SIMO_UI_RECOVERY_LOADED__) return;
  window.__SIMO_UI_RECOVERY_LOADED__ = true;

  var PHASE = "SIMO UI Recovery — R10.60Z35 non-stealing send guard";
  console.log("[SIMO]", PHASE);

  function $(id) {
    return document.getElementById(id);
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isDesignLikePrompt(text) {
    var t = clean(text).toLowerCase();
    if (!t) return false;

    var activeMode = String(window.__SIMO_ACTIVE_MODE__ || "chat").toLowerCase();
    if (activeMode === "business") return false;

    var explicitTextAdvice =
      /\b(business idea|business ideas|business plan|startup idea|startup ideas|side hustle|work from home|work at home|make money|revenue model|pricing strategy|marketing plan|target customer|first steps|advice|recommend|recommendation|explain|tell me|help me understand)\b/.test(t);

    var explicitVisual =
      /\b(logo|book cover|image|picture|photo|mockup|render|visualize|visualise|illustration|poster|flyer|brochure|product design|3d|3-d|website|web site|landing page|app screen|dashboard)\b/.test(t);

    if (explicitTextAdvice && !explicitVisual) return false;

    return /\b(design|generate|render|visualize|visualise|mockup|prototype|logo|book cover|image|picture|photo|illustration|poster|flyer|brochure|product design|3d|3-d|website|web site|landing page|app screen|dashboard)\b/.test(t);
  }



  function isWebsiteBuilderPrompt(text) {
    var t = clean(text).toLowerCase();
    if (!t) return false;
    var digital = /\b(website|web site|landing page|webpage|web page|homepage|home page|business site|ecommerce site|e-commerce site|online store|shop page|storefront|app screen|dashboard|web app|mobile app|saas|portal|booking page|checkout page|pricing page|contact page|web tool)\b/.test(t);
    var verb = /\b(build|create|make|generate|design|show me|i need|i want|put together|draft|start|make me|build me)\b/.test(t);
    var edit = /\b(hero|cta|button|buttons|services|products|pricing|contact form|testimonials|gallery|media|colors|theme|mobile|seo|domain|publish|download html|copy html|launch)\b/.test(t);
    return !!(digital && (verb || edit));
  }

  function getChat() {
    return $("chatMessages") || $("chat") || document.querySelector(".chat-wrap");
  }

  function getInput() {
    return $("chatInput") || document.querySelector("textarea, input[type='text']");
  }

  function setStatus(text) {
    var el = $("loadingHint") || document.querySelector("[data-simo-status]");
    if (el) el.textContent = text || "Ready.";
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function addMessage(role, html) {
    var chat = getChat();
    if (!chat) return null;
    var row = document.createElement("div");
    row.className = "msg-row msg-" + role;
    row.innerHTML = '<div class="msg-bubble msg-bubble-' + role + '">' + html + "</div>";
    chat.appendChild(row);
    try { row.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {}
    return row;
  }

  function clearChat() {
    var chat = getChat();
    if (chat) chat.innerHTML = "";
    setStatus("Ready.");
  }

  async function sendNormalChat() {
    var input = getInput();
    var text = clean(input && input.value);
    if (!text) return;

    // Let the Website Builder / visual-design script handle builder/design prompts.
    if (isWebsiteBuilderPrompt(text) || (isDesignLikePrompt(text) && window.SimoVisualCore)) return;

    if (input) input.value = "";
    addMessage("user", esc(text));
    setStatus("Simo is thinking…");

    var working = addMessage("assistant", "Thinking…");

    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          simo_mode: String(window.__SIMO_ACTIVE_MODE__ || "chat").toLowerCase() === "business" ? "chat" : String(window.__SIMO_ACTIVE_MODE__ || "chat"),
          lane: String(window.__SIMO_ACTIVE_MODE__ || "chat").toLowerCase() === "business" ? "chat" : String(window.__SIMO_ACTIVE_MODE__ || "chat"),
          intent_hint: String(window.__SIMO_ACTIVE_MODE__ || "chat").toLowerCase() === "business" ? "business_advice" : ""
        })
      });

      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Chat request failed.");

      if (working) working.remove();
      addMessage("assistant", esc(data.reply || "Done.").replace(/\n/g, "<br>"));
      setStatus("Ready.");
    } catch (err) {
      if (working) working.remove();
      addMessage("assistant", "Chat failed: " + esc(err.message || err));
      setStatus("Ready.");
    }
  }

  function bindClick(id, fn) {
    var el = $(id);
    if (!el || el.dataset.simoUiRecoveryBound) return;
    el.dataset.simoUiRecoveryBound = "true";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      fn(e);
    }, true);
  }

  function bindButtons() {
    bindClick("loginBtn", function () {
      window.location.href = "/login";
    });

    bindClick("logoutBtn", async function () {
      try {
        await fetch("/api/logout", {
          method: "POST",
          credentials: "same-origin"
        });
      } catch (e) {}
      window.location.href = "/";
    });

    bindClick("newChatBtn", function () {
      clearChat();
      var input = getInput();
      if (input) input.value = "";
    });

    bindClick("clearHistoryBtn", function () {
      clearChat();
      try { localStorage.removeItem("simo_history_v3"); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
    });

    bindClick("upgradeBtn", async function () {
      try {
        var res = await fetch("/api/create-checkout-session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        var data = await res.json();
        if (data.url) window.location.href = data.url;
        else alert(data.error || "Upgrade checkout did not return a URL.");
      } catch (e) {
        alert("Upgrade checkout failed: " + (e.message || e));
      }
    });

    // Open Design Library is exclusively owned by simo-library-rescue.js.
    // No capture-phase Library binding belongs in this recovery file.

    bindClick("settingsBtn", function () {
      if (typeof window.SimoOpenSettings === "function") {
        window.SimoOpenSettings();
        return;
      }
    });

    // signupBtn / Easy Signup is owned by main script.js.
    // Do not capture or redirect it here; the main owner opens the signup modal
    // even when an existing Pro session is active.

    bindClick("profileBtn", function () {
      window.location.href = "/api/me";
    });

    var send = $("sendBtn");
    if (send && !send.dataset.simoUiRecoverySendGuardBound) {
      send.dataset.simoUiRecoverySendGuardBound = "true";
      send.addEventListener("click", function (e) {
        var input = getInput();
        var text = clean(input && input.value);
        if (!text) return;
        // Website/App Builder and visual/product prompts must be owned by script.js/SimoVisualCore.
        // Do not preventDefault/stopPropagation for those lanes; that was causing website results to be swallowed.
        if (isWebsiteBuilderPrompt(text) || (isDesignLikePrompt(text) && window.SimoVisualCore)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        sendNormalChat();
      }, true);
    }
  }

  function bindStarterChips() {
    var starters = {
      build: "Build a modern landing page for a business.",
      business: "Create a business idea with a simple plan, target customer, pricing, and first steps.",
      design: "Show me a product I can design.",
      image: "I want to analyze an image.",
      chat: "Let’s just chat."
    };

    document.querySelectorAll("[data-simo-starter]").forEach(function (btn) {
      if (btn.dataset.simoUiRecoveryStarterBound) return;
      btn.dataset.simoUiRecoveryStarterBound = "true";
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-simo-starter") || "";
        var input = getInput();
        if (input) {
          input.value = starters[key] || "";
          input.focus();
        }
      });
    });
  }

  function bindEnter() {
    var input = getInput();
    if (!input || input.dataset.simoUiRecoveryEnterBound) return;
    input.dataset.simoUiRecoveryEnterBound = "true";

    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey) return;

      var text = clean(input.value);
      if (!text) return;

      // Let the Website Builder / visual core capture builder and design prompts first.
      if (isWebsiteBuilderPrompt(text) || (isDesignLikePrompt(text) && window.SimoVisualCore)) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      sendNormalChat();
    }, true);
  }

  function boot() {
    bindButtons();
    bindStarterChips();
    bindEnter();
    setStatus("Ready.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  setTimeout(boot, 500);
  setTimeout(boot, 1500);

  window.SimoUIRecovery = {
    phase: PHASE,
    boot: boot,
    sendNormalChat: sendNormalChat
  };
})();
