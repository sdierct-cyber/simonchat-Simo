const chat = document.getElementById("chat");
const input = document.getElementById("input");

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = content;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function send() {
  const text = input.value.trim();
  if (!text) return;

  addMessage("user", text);
  input.value = "";

  addMessage("simo", "…");

  const res = await fetch("/.netlify/functions/simo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text })
  });

  const data = await res.json();

  chat.lastChild.remove();

  if (data.image) {
    addMessage(
      "simo",
      `${data.text || ""}<br><img class="generated" src="${data.image}" />`
    );
  } else {
    addMessage("simo", data.text);
  }
}
