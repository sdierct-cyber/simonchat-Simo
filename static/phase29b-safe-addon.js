// ==============================
// Simo Phase 2.9B/P2 — Context-Aware Hint + Smooth Polish (SAFE ADD-ON)
// ==============================

(() => {
  function initPhase29BHint() {
    const hintText = document.getElementById("simoHintText");
    const hintCard = document.getElementById("simoHintCard");
    if (!hintText || !hintCard) return;

    const hintMap = {
      build:
        "Describe your business, style, colors, or sections before sending for a stronger website result.",
      business:
        "Add your budget, niche, timeline, or target customer to get a sharper startup idea.",
      design:
        "Try adding mood, style, inspiration, color direction, or audience before you send it.",
      image:
        "You can upload an image first or after sending, then ask Simo to analyze or build from it.",
      chat:
        "Ask anything naturally — Simo can help you think, plan, create, or just talk things through."
    };

    const defaultHtml =
      'New here? Start with <strong>Build a website</strong> or <strong>Create a business idea</strong>. You can send the starter as-is or edit it first before pressing send.';

    let resetTimer = null;

    hintCard.style.transition =
      "box-shadow .22s ease, border-color .22s ease, transform .22s ease, background .22s ease";
    hintText.style.transition =
      "opacity .16s ease, transform .16s ease";

    function pulseCard() {
      hintCard.style.borderColor = "rgba(110,168,255,.22)";
      hintCard.style.boxShadow =
        "inset 0 1px 0 rgba(255,255,255,.05), 0 0 0 1px rgba(110,168,255,.08), 0 10px 28px rgba(0,0,0,.10), 0 0 24px rgba(110,168,255,.10)";
      hintCard.style.transform = "translateY(-1px)";

      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        hintCard.style.borderColor = "rgba(255,255,255,.10)";
        hintCard.style.boxShadow =
          "inset 0 1px 0 rgba(255,255,255,.05), 0 10px 28px rgba(0,0,0,.10)";
        hintCard.style.transform = "translateY(0)";
      }, 260);
    }

    function swapHint(updateFn) {
      hintText.style.opacity = "0.35";
      hintText.style.transform = "translateY(2px)";

      window.setTimeout(() => {
        updateFn();
        hintText.style.opacity = "1";
        hintText.style.transform = "translateY(0)";
        pulseCard();
      }, 120);
    }

    function setHint(key) {
      const next = hintMap[key];
      if (!next) {
        swapHint(() => {
          hintText.innerHTML = defaultHtml;
        });
        return;
      }

      swapHint(() => {
        hintText.textContent = next;
      });
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-simo-starter]");
      if (!btn) return;

      const key = btn.getAttribute("data-simo-starter") || "";
      setHint(key);
    });

    const newChatBtn = document.getElementById("newChatBtn");
    if (newChatBtn) {
      newChatBtn.addEventListener("click", () => {
        setHint("");
      });
    }

    const clearHistoryBtn = document.getElementById("clearHistoryBtn");
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener("click", () => {
        setHint("");
      });
    }

    hintCard.dataset.phase29b = "ready";
    console.log("💡 Phase 2.9B/P2 context-aware hint polish ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPhase29BHint);
  } else {
    initPhase29BHint();
  }
})();