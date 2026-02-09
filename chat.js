const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function addMessage(role, text, imageUrl) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;

  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role === "user" ? "You" : "Simo";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = escapeHtml(text || "");

  msg.appendChild(who);
  msg.appendChild(bubble);

  if (imageUrl) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "rowimg";

    const img = document.createElement("img");
    img.className = "generated";
    img.alt = "Generated image";
    img.src = imageUrl;

    imgWrap.appendChild(img);
    msg.appendChild(imgWrap);
  }

  chatEl.appendChild(msg);
  chatEl.scrollTop = chatEl.scrollHeight;
  return msg;
}

async function callSimo(userText) {
  const res = await fetch("/.netlify/functions/simo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userText })
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Bad JSON response from server.");
  }

  if (!res.ok) {
    throw new Error(data?.error || `Server error (${res.status})`);
  }
  return data;
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;

  addMessage("user", text);
  inputEl.value = "";

  sendBtn.disabled = true;
  const thinking = addMessage("simo", "…");

  try {
    const data = await callSimo(text);
    thinking.remove();
    addMessage("simo", data.text || "", data.image || null);
  } catch (err) {
    thinking.remove();
    addMessage("simo", `I hit an error: ${String(err.message || err)}`);
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", send);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
