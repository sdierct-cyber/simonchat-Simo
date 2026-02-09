const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");

function escapeHtml(str) {
  return String(str || "")
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

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const raw = await res.text();
    throw new Error(`Server returned ${res.status} ${res.statusText} (not JSON):\n${raw.slice(0, 800)}`);
  }

  const data = await res.json();

  if (!res.ok) {
    const msg =
      (data?.error ? data.error : `Server error (${res.status})`) +
      (data?.detail ? `\n${data.detail}` : "");
    throw new Error(msg);
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
    addMessage("simo", `I hit an error:\n${String(err.message || err)}`);
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
