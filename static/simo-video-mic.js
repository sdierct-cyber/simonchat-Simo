/* Simo Video Mic v6 - matching 10px top and scrollbar clearance; speech handling unchanged */
(() => {
  "use strict";
  const STYLE_ID = "simoVideoMicStyles";
  const WRAP_CLASS = "simo-video-mic-wrap";
  const BTN_CLASS = "simo-video-mic-btn";

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${WRAP_CLASS}{position:relative;width:100%;}
      .${WRAP_CLASS} textarea{width:100%;padding-right:104px!important;}
      .${WRAP_CLASS} input{width:100%;padding-right:78px!important;}
      .${WRAP_CLASS} input + .${BTN_CLASS}{top:calc(50% - 19px);width:38px;height:38px;}
      .${BTN_CLASS}{
        position:absolute;top:10px;right:26px;width:38px;height:38px;
        border-radius:12px;border:1px solid rgba(125,211,252,.42);
        background:rgba(8,24,43,.94);color:#dff7ff;
        display:flex;align-items:center;justify-content:center;
        padding:0;line-height:0;cursor:pointer;z-index:5;
        box-shadow:0 8px 24px rgba(0,0,0,.24);
        transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease;
      }
      .${BTN_CLASS}:hover{transform:translateY(-1px);border-color:rgba(56,189,248,.85);background:rgba(12,40,68,.98);}
      .${BTN_CLASS}[data-listening="true"]{
        border-color:#22c55e;background:#16a34a;color:#fff;
        box-shadow:0 0 0 3px rgba(34,197,94,.20),0 0 18px rgba(34,197,94,.42),0 8px 24px rgba(0,0,0,.28);
      }
      .${BTN_CLASS}:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;}
      .${BTN_CLASS} svg{display:block;width:19px;height:19px;margin:0;flex:0 0 auto;pointer-events:none;}
      @media (max-width:640px){
        .${BTN_CLASS}{top:10px;right:26px;width:36px;height:36px;border-radius:11px;}
        .${WRAP_CLASS} textarea{padding-right:96px!important;}
        .${WRAP_CLASS} input{padding-right:76px!important;}
        .${WRAP_CLASS} input + .${BTN_CLASS}{top:calc(50% - 18px);width:36px;height:36px;}
      }
      /* Long Video: give the microphone extra room clear of the scrollbar. */
      .slv-page .${BTN_CLASS}{right:26px;}
      .slv-page .${WRAP_CLASS} textarea{padding-right:124px!important;}
      @media (max-width:640px){
        .slv-page .${BTN_CLASS}{right:26px;}
        .slv-page .${WRAP_CLASS} textarea{padding-right:116px!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function cleanVideoLabels() {
    document.querySelectorAll("option").forEach((opt) => {
      const t = (opt.textContent || "").trim();
      if (/^1080p\b/i.test(t) && /default/i.test(t)) opt.textContent = "1080p - Default";
      else if (/^4k\b/i.test(t) && /premium/i.test(t)) opt.textContent = "4K - Premium";
    });
  }

  // Only named creative-text fields; never add mics to numeric, price or control fields.
  const FIELD_IDS = [
    "svPrompt", "svVoiceoverText", "svMusicStyle", "svNegative",
    "lvPrompt", "lvVoiceText", "lvMusicStyle", "lvAvoid"
  ];

  function micIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V5a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-1.8-9.5a1.8 1.8 0 1 1 3.6 0v6a1.8 1.8 0 1 1-3.6 0V5Zm8.05 6a.85.85 0 0 1 1.7 0A7.95 7.95 0 0 1 12.85 18.9v2.25h3.05a.85.85 0 1 1 0 1.7H8.1a.85.85 0 1 1 0-1.7h3.05V18.9A7.95 7.95 0 0 1 4.05 11a.85.85 0 0 1 1.7 0 6.25 6.25 0 0 0 12.5 0Z"/></svg>`;
  }

  function installMic(textarea) {
    if (!textarea || textarea.dataset.simoVideoMicReady === "1") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    textarea.dataset.simoVideoMicReady = "1";

    let wrap = textarea.parentElement;
    if (!wrap || !wrap.classList.contains(WRAP_CLASS)) {
      wrap = document.createElement("div");
      wrap.className = WRAP_CLASS;
      textarea.parentNode.insertBefore(wrap, textarea);
      wrap.appendChild(textarea);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    const label = {
      svPrompt:"video description",lvPrompt:"video description",
      svVoiceoverText:"voiceover text",lvVoiceText:"voiceover text",
      svMusicStyle:"music style",lvMusicStyle:"music style",
      svNegative:"avoid instructions",lvAvoid:"avoid instructions"
    }[textarea.id] || "text";
    btn.setAttribute("aria-label", "Dictate " + label);
    btn.setAttribute("title", "Dictate " + label);
    btn.innerHTML = micIcon();
    wrap.appendChild(btn);

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = document.documentElement.lang || navigator.language || "en-US";

    let listening = false;
    let baseText = "";

    function setListening(on) {
      listening = on;
      btn.dataset.listening = on ? "true" : "false";
      btn.setAttribute("aria-label", on ? "Stop dictation" : "Dictate " + label);
      btn.setAttribute("title", on ? "Listening - click to stop" : "Speak your video description");
    }

    recognition.onstart = () => { baseText = textarea.value.trim(); setListening(true); };
    recognition.onresult = (event) => {
      // Rebuild from this session's complete recognition results to avoid repeated
      // or missing phrases as interim results become final.
      let finalText = "", interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += transcript + " ";
        else interimText += transcript;
      }
      textarea.value = [baseText, finalText.trim(), interimText.trim()].filter(Boolean).join(" ");
      textarea.dispatchEvent(new Event("input", {bubbles:true}));
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error !== "aborted" && event.error !== "no-speech") console.warn("[Simo Video Mic] Speech recognition error:", event.error);
    };
    recognition.onend = () => setListening(false);
    btn.addEventListener("click", () => {
      if (listening) { recognition.stop(); return; }
      try { recognition.start(); } catch (_) {}
    });
  }

  function boot() { addStyles(); cleanVideoLabels(); FIELD_IDS.forEach(id => installMic(document.getElementById(id))); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
  setTimeout(boot, 800);
})();
