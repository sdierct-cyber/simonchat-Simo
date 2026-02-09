const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&lt;")
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
  return { msg, bubble };
}

async function postSimo(userText) {
  const res = await fetch("/.netlify/functions/simo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userText })
  });

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const raw = await res.text();
    throw new Error(`Server returned ${res.status} ${res.statusText} (not JSON):\n${raw.slice(0, 800)}`);
  }
  const data = await res.json();
  if (!res.ok && res.status !== 202) {
    throw new Error((data?.error || `Server error (${res.status})`) + (data?.detail ? `\n${data.detail}` : ""));
  }
  return { status: res.status, data };
}

async function getJob(id) {
  const res = await fetch(`/.netlify/functions/simo?id=${encodeURIComponent(id)}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return res.json();
}

async function pollJob(id, bubbleEl) {
  const start = Date.now();
  const timeoutMs = 90_000; // 90 seconds
  const intervalMs = 1500;

  while (Date.now() - start < timeoutMs) {
    const job = await getJob(id);
    if (job?.status === "done") {
      bubbleEl.textContent = "Done. Here you go:";
      // Append image under bubble
      const wrap = document.createElement("div");
      wrap.className = "rowimg";
      const img = document.createElement("img");
      img.className = "generated";
      img.src = job.image;
      img.alt = "Generated image";
      wrap.appendChild(img);
      bubbleEl.parentElement.appendChild(wrap);
      return;
    }
    if (job?.status === "error") {
      bubbleEl.textContent = `I hit an error making the image:\n${job.error}`;
      return;
    }
    bubbleEl.textContent = "Still cooking…";
    await new Promise(r => setTimeout(r, intervalMs));
  }

  bubbleEl.textContent = "That’s taking too long. Try again in a moment.";
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;

  addMessage("user", text);
  inputEl.value = "";

  sendBtn.disabled = true;
  const { bubble } = addMessage("simo", "…");

  try {
    const { status, data } = await postSimo(text);
    bubble.textContent = data.text || "";

    if (status === 202 && data.jobId) {
      await pollJob(data.jobId, bubble);
    }
  } catch (err) {
    bubble.textContent = `I hit an error:\n${String(err.message || err)}`;
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
