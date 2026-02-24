llet isPro = false;

const chatBox = document.getElementById("chat-box");
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-button");
const proToggle = document.getElementById("pro-toggle");
const previewArea = document.getElementById("preview-area");

// Make Pro work immediately (no error)
function unlockPro() {
  isPro = true;
  proToggle.style.boxShadow = "0 0 25px #22c55e";
  proToggle.textContent = "Pro Active ✅";
  document.querySelectorAll(".pro-btn").forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = "1";
  });
  addMessage("Simo", "🎉 Pro unlocked! Save, Download and Library are now working. Let's build something awesome.");
}

// Normal message function
function addMessage(sender, text) {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Send button
sendBtn.addEventListener("click", () => {
  const text = input.value.trim();
  if (!text) return;

  addMessage("You", text);
  input.value = "";

  if (text.includes("SIMO-PRO-2026") || text.includes("pro")) {
    unlockPro();
    return;
  }

  // Normal Simo reply (Grok-style)
  addMessage("Simo", "Got it! What do you want me to build for you? (try 'build a yoga landing page')");
});

// Pro toggle button
if (proToggle) {
  proToggle.addEventListener("click", unlockPro);
}

// Make text box normal size + start chat
window.onload = () => {
  addMessage("Simo", "Hi! I'm Simo. Type SIMO-PRO-2026 to unlock Pro, or tell me what to build.");
};
