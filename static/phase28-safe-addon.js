// Simo — Phase 2.8 SAFE add-on (UI FIXED FINAL)
(() => {
  if (window.__SIMO_PHASE28_ADDON__) return;
  window.__SIMO_PHASE28_ADDON__ = true;

  const MODE_KEY = "simo_builder_mode_v2";
  const PRESET_KEY = "simo_builder_preset_v2";

  const MODES = ["Design", "Business", "Startup", "Creative"];
  const PRESETS = ["Luxury", "Minimal", "Bold", "Corporate", "Futuristic", "Playful"];

  function findInput() {
    return document.getElementById("chatInput");
  }

  function findComposer() {
    return (
      document.getElementById("composer") ||
      document.querySelector('[data-role="composer"]') ||
      document.querySelector(".composer") ||
      document.querySelector("form")
    );
  }

  function createBar() {
    if (document.getElementById("simoPhase28Bar")) return;

    const composer = findComposer();
    if (!composer) return;

    const bar = document.createElement("div");
    bar.id = "simoPhase28Bar";

    bar.style.marginBottom = "10px";
    bar.style.padding = "10px";
    bar.style.borderRadius = "12px";
    bar.style.background = "rgba(255,255,255,0.05)";
    bar.style.border = "1px solid rgba(255,255,255,0.1)";

    bar.innerHTML = `
      <div style="font-size:12px;margin-bottom:6px;">Builder Mode</div>
      <div id="modeRow" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;"></div>
      <div style="font-size:12px;margin-bottom:6px;">Style Preset</div>
      <div id="presetRow" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
    `;

    composer.prepend(bar);

    const modeRow = bar.querySelector("#modeRow");
    const presetRow = bar.querySelector("#presetRow");

    MODES.forEach((m) => {
      const b = document.createElement("button");
      b.innerText = m;
      styleBtn(b);
      b.onclick = () => localStorage.setItem(MODE_KEY, m);
      modeRow.appendChild(b);
    });

    PRESETS.forEach((p) => {
      const b = document.createElement("button");
      b.innerText = p;
      styleBtn(b);
      b.onclick = () => localStorage.setItem(PRESET_KEY, p);
      presetRow.appendChild(b);
    });
  }

  function styleBtn(b) {
    b.style.padding = "6px 10px";
    b.style.borderRadius = "999px";
    b.style.border = "1px solid rgba(255,255,255,0.1)";
    b.style.background = "rgba(255,255,255,0.05)";
    b.style.color = "#fff";
    b.style.cursor = "pointer";
  }

  function injectEnhancement() {
    const input = findInput();
    if (!input) return;

    const text = input.value || "";
    if (!text.toLowerCase().includes("build")) return;

    const mode = localStorage.getItem(MODE_KEY) || "Design";
    const preset = localStorage.getItem(PRESET_KEY) || "Luxury";

    input.value = `Mode: ${mode}\nStyle: ${preset}\n\n${text}`;
  }

  function hookSend() {
    const input = findInput();
    const sendBtn =
      document.getElementById("sendBtn") ||
      document.querySelector('[data-role="send"]') ||
      document.querySelector("button");

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) injectEnhancement();
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", injectEnhancement);
    }
  }

  function boot() {
    createBar();
    hookSend();
  }

  window.addEventListener("load", () => {
    setTimeout(boot, 500); // wait for your UI to fully mount
  });
})();