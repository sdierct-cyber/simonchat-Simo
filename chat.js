let messages = []; // conversation history
let isPro = false;

const chatBox = document.getElementById("chat-box");
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-button");
const proToggle = document.getElementById("pro-toggle");
const previewArea = document.getElementById("preview-area");

// Normal size text box + glow when Pro
function updateProUI() {
  if (proToggle) {
    proToggle.style.boxShadow = isPro ? "0 0 20px #22c55e" : "none";
    proToggle.textContent = isPro ? "Pro Active ✅" : "Free Mode";
  }
  document.querySelectorAll(".pro-btn").forEach(btn => {
    btn.disabled = !isPro;
    btn.style.opacity = isPro ? "1" : "0.5";
  });
}

// Beautiful preview that matches user intent
function showBeautifulPreview(html) {
  previewArea.innerHTML = `
    <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
      ${html}
    </div>
  `;
}

// Add message (keeps history)
function addMessage(sender, text, type = "normal") {
  messages.push({ sender, text, type });
  const div = document.createElement("div");
  div.className = sender === "Simo" ? "simo-message" : "user-message";
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Main send function
sendBtn.addEventListener("click", async () => {
  const userText = input.value.trim();
  if (!userText) return;

  addMessage("You", userText);
  input.value = "";

  // Check Pro key
  if (userText.toUpperCase().includes("SIMO-PRO-2026") || userText.toUpperCase().includes("KEY")) {
    const response = await fetch("/.netlify/functions/pro", {
      method: "POST",
      body: JSON.stringify({ key: userText.toUpperCase().replace(/[^A-Z0-9-]/g, "") })
    });
    const data = await res.json();
    if (data.valid) {
      isPro = true;
      updateProUI();
      addMessage("Simo", "🎉 Pro mode activated! Everything is unlocked. What would you like to build today?");
      return;
    }
  }

  // Normal chat with Simo (Grok-style)
  addMessage("Simo", "Thinking…");
  const simoResponse = await getSimoResponse(userText);
  chatBox.lastChild.remove(); // remove "Thinking…"
  addMessage("Simo", simoResponse);

  // If user asked to build something, create beautiful preview
  if (userText.toLowerCase().includes("build") || userText.toLowerCase().includes("landing") || userText.toLowerCase().includes("page")) {
    const previewHTML = generateBeautifulPreview(userText);
    showBeautifulPreview(previewHTML);
  }
});

// Grok-style Simo response (smart, helpful, truthful)
async function getSimoResponse(userText) {
  // You can replace this with your real LLM API call (OpenAI, Grok, Claude, etc.)
  // For now a smart placeholder that feels like Grok
  if (userText.toLowerCase().includes("hello") || userText.toLowerCase().includes("hi")) {
    return "Hey! I'm Simo, your friendly AI builder. What are we creating today? 😊";
  }
  if (userText.toLowerCase().includes("how are you")) {
    return "I'm doing great, thanks for asking! Ready to build something awesome with you.";
  }
  return `Got it! You want a ${userText}. Here's a clean version I built for you. Anything to change?`;
}

// Beautiful Tailwind preview based on user intent
function generateBeautifulPreview(userIntent) {
  return `
    <div style="font-family:system-ui;padding:40px;background:linear-gradient(135deg,#f3e7e9,#e6f0fa);min-height:600px;">
      <h1 style="font-size:3rem;color:#1e40af;text-align:center;margin-bottom:20px;">${userIntent}</h1>
      <p style="text-align:center;font-size:1.3rem;color:#334155;">Beautiful, fast, and exactly what you asked for.</p>
      <div style="max-width:800px;margin:40px auto;background:white;border-radius:16px;padding:30px;box-shadow:0 20px 40px rgba(0,0,0,0.1);">
        <button style="background:#22c55e;color:white;padding:14px 32px;border:none;border-radius:999px;font-size:1.1rem;cursor:pointer;">Try it free</button>
      </div>
    </div>
  `;
}

// Pro toggle click (glows green when on)
if (proToggle) proToggle.addEventListener("click", () => {
  if (!isPro) {
    input.value = "SIMO-PRO-2026";
    sendBtn.click();
  }
});

// Load saved history on start
window.onload = () => {
  updateProUI();
  addMessage("Simo", "Hi! I'm Simo — your trustworthy AI builder. What are we making today? Type anything.");
};
