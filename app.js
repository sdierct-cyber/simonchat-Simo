(() => {
  const chat = document.getElementById("chat");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const resetBtn = document.getElementById("reset");
  const frame = document.getElementById("frame");
  const placeholder = document.getElementById("placeholder");

  const proBtn = document.getElementById("proBtn");
  const proLabel = document.getElementById("proLabel");

  let lastHTML = null;
  let proMode = false;

  function addMsg(text, who) {
    const div = document.createElement("div");
    div.className = "msg " + who;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function showPreview(html) {
    if (!html) return;
    lastHTML = html;

    // Hide placeholder, show HTML
    placeholder.style.display = "none";
    frame.srcdoc = html;
  }

  function clearPreview() {
    lastHTML = null;

    // Show placeholder, clear iframe (no white panel)
    frame.srcdoc = "";
    placeholder.style.display = "flex";
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;

    addMsg(text, "you");
    input.value = "";

    try {
      const res = await fetch("/.netlify/functions/simon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text })
      });

      const data = await res.json();

      if (data.reply) addMsg(data.reply, "simo");
      if (data.html) showPreview(data.html);

    } catch (e) {
      addMsg("Connection error. Check Netlify function deployment.", "simo");
    }
  }

  sendBtn.onclick = send;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  resetBtn.onclick = () => {
    chat.innerHTML = "";
    clearPreview();
    addMsg("Reset. I’m here.", "simo");
  };

  proBtn.onclick = async () => {
    const key = prompt("Enter Pro Key:");
    if (!key) return;

    try {
      const res = await fetch("/.netlify/functions/pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });

      const data = await res.json();

      if (data.ok) {
        proMode = true;
        proBtn.classList.add("on");
        proLabel.textContent = "Pro ON";
      } else {
        alert("Invalid key");
      }
    } catch (e) {
      alert("Pro check failed (function not reachable).");
    }
  };

  // boot
  clearPreview();                 // placeholder shown by default
  addMsg("Reset. I’m here.", "simo");
})();
