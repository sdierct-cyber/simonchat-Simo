const servers = {live: "https://simonchat.ai", local: "http://127.0.0.1:5000"};
const settings = await chrome.storage.local.get("simoServer");
const server = settings.simoServer === "local" ? "local" : "live";
const origin = servers[server];
const serverLabel = server === "local" ? "Local" : "Live";
const connectUrl = origin + "/connect/extension";
const element = id => document.getElementById(id);
const prompt = element("prompt");
const fileInput = element("file");
const conversation = element("conversation");
const callBanner = element("call-banner");
const serverSelect = element("server");
serverSelect.value = server;
serverSelect.addEventListener("change", async () => {
  serverSelect.disabled = true;
  try {
    await chrome.storage.local.set({simoServer: serverSelect.value});
    location.reload();
  } catch {
    serverSelect.value = server;
    setStatus("Could not change Simo server.", true);
    updateControls();
  }
});
let connectTimeout;
const connectFrame = () => element("connect-frame").querySelector("iframe");

function showCallStatus(state = "idle", text = "") {
  if (state !== "idle") stopDictation();
  callBanner.hidden = state === "idle";
  callBanner.dataset.callState = state;
  element("call-banner-open").textContent = state === "incoming" ? "Open Simo to answer" : "Open call";
  element("call-banner-end").hidden = state === "incoming";
  element("call-banner-end").textContent = state === "ringing" ? "Cancel call" : "Hang up";
  updateControls();
  if (element("call-banner-status").textContent !== text) element("call-banner-status").textContent = text;
}

window.addEventListener("message", event => {
  if (event.origin !== origin || event.source !== connectFrame()?.contentWindow) return;
  const status = event.data;
  if (status?.type !== "simo-connect:call-status" || typeof status.text !== "string") return;
  if (!["idle", "incoming", "ringing", "connecting", "active", "reconnecting"].includes(status.state)) return;
  clearTimeout(connectTimeout);
  element("connect-status").hidden = true;
  showCallStatus(status.state, status.text);
});

async function openSimoToAnswer() {
  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({windowId: currentWindow.id});
  const dashboardTabs = tabs.filter(tab => tab.url?.startsWith(origin + "/") &&
    new URL(tab.url).pathname === "/");
  const dashboard = dashboardTabs.find(tab => tab.active) || dashboardTabs[0];
  if (dashboard) {
    await chrome.tabs.update(dashboard.id, {active: true});
  } else {
    await chrome.tabs.create({windowId: currentWindow.id, url: origin + "/"});
  }
}

element("call-banner-open").addEventListener("click", () => {
  if (callBanner.dataset.callState === "incoming") {
    void openSimoToAnswer().catch(() => {
      if (callBanner.dataset.callState === "incoming") {
        element("call-banner-status").textContent = "Incoming call. Use Open Simo at the top of this panel to answer.";
      }
    });
    return;
  }
  showView(true);
  connectFrame()?.contentWindow?.postMessage({type: "simo-connect:open-call"}, origin);
});
element("call-banner-end").addEventListener("click", () => {
  if (callBanner.dataset.callState !== "incoming") {
    connectFrame()?.contentWindow?.postMessage({type: "simo-connect:hang-up"}, origin);
  }
});
const imageTypes = new Map([
  ["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"],
]);
const imageLimit = 18 * 1024 * 1024;
const sentImageUrls = new Set();

let account;
let ready = false;
let busy = false;
let checking = false;
let selectedText = "";
let attachment;
let previewUrl;
let draftKey;
let queuedDraft;
let connectView = false;
let recognition;
const SpeechRecognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const dictate = element("dictate");
const micPermission = element("mic-permission");

function stopDictation() {
  if (!recognition) return;
  const active = recognition;
  recognition = undefined;
  dictate.setAttribute("aria-pressed", "false");
  dictate.setAttribute("aria-label", "Start dictation");
  dictate.title = "Start dictation";
  active.abort();
}

dictate.addEventListener("click", () => {
  if (recognition) {
    recognition.stop();
    return;
  }
  if (!SpeechRecognition || busy || !callBanner.hidden) return;
  micPermission.hidden = true;
  const speech = new SpeechRecognition();
  speech.lang = navigator.language;
  speech.continuous = true;
  speech.interimResults = false;
  let failed = false;
  recognition = speech;
  dictate.setAttribute("aria-pressed", "true");
  dictate.setAttribute("aria-label", "Stop dictation");
  dictate.title = "Stop dictation";
  speech.onresult = event => {
    if (recognition !== speech) return;
    const words = Array.from(event.results).slice(event.resultIndex)
      .filter(result => result.isFinal).map(result => result[0].transcript.trim()).join(" ");
    if (words) {
      const separator = prompt.value && !/\s$/.test(prompt.value) ? " " : "";
      prompt.value = (prompt.value + separator + words).slice(0, prompt.maxLength);
      updateControls();
    }
  };
  speech.onerror = event => {
    if (recognition !== speech) return;
    failed = true;
    const permissionError = ["not-allowed", "service-not-allowed"].includes(event.error);
    micPermission.hidden = !permissionError;
    setStatus(permissionError ? "Enable microphone access, then try dictation again."
      : "Dictation stopped. Check your microphone or continue typing.", true);
  };
  speech.onend = () => {
    if (recognition !== speech) return;
    recognition = undefined;
    dictate.setAttribute("aria-pressed", "false");
    dictate.setAttribute("aria-label", "Start dictation");
    dictate.title = "Start dictation";
    if (!failed) setStatus("Review your draft and press Send when ready.");
  };
  try {
    speech.start();
    setStatus("Listening… click the microphone again to stop.");
  } catch {
    stopDictation();
    micPermission.hidden = false;
    setStatus("Could not start dictation. Check microphone access.", true);
  }
});

element("home").href = origin + "/";
element("connect-full").href = origin + "/#simo-extension-connect";
for (const link of document.querySelectorAll("[data-path]")) {
  link.href = origin + link.dataset.path;
  link.target = "_blank";
  link.rel = "noopener";
}

function setStatus(message = "", error = false) {
  element("status").textContent = message;
  element("status").toggleAttribute("data-error", error);
}

function updateControls() {
  element("send").disabled = !ready || busy || checking || !prompt.value.trim();
  element("refresh").disabled = busy || checking;
  prompt.readOnly = busy;
  dictate.disabled = !SpeechRecognition || busy || !callBanner.hidden;
  serverSelect.disabled = busy || checking || !callBanner.hidden;
  serverSelect.title = callBanner.hidden ? "" : "End the call before switching servers.";
  for (const id of ["pick", "remove-image", "remove-text"]) element(id).disabled = busy;
}

async function api(path, options = {}) {
  const response = await fetch(origin + path, {
    ...options, credentials: "include", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(options.method === "POST" ? 180000 : 8000),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Simo returned an unexpected response. Open Simo and confirm the selected server.");
  }
  const data = await response.json();
  if (!response.ok || data.ok !== true) {
    throw new Error(typeof data.error === "string" && data.error
      ? data.error : "Simo returned an error (" + response.status + ").");
  }
  return data;
}

function setSelected(text) {
  selectedText = text;
  element("quote").textContent = text;
  element("selection").hidden = !text;
}

function clearImage() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  attachment = undefined;
  element("preview").removeAttribute("src");
  element("image-link").removeAttribute("href");
  element("attachment").hidden = true;
}

function syncConnectView() {
  const status = element("connect-status");
  const container = element("connect-frame");
  const canOpen = Boolean(account) && (ready || Boolean(container.firstChild));
  element("connect-full").hidden = !canOpen;
  status.hidden = canOpen;
  status.textContent = ready ? "Sign in through Open Simo, then click Refresh." : "Connect to " + serverLabel.toLowerCase() + " Simo, then click Refresh.";
  if (!canOpen && container.firstChild) {
    clearTimeout(connectTimeout);
    container.replaceChildren();
    showCallStatus();
  }
  if (canOpen && !container.firstChild) {
    const frame = document.createElement("iframe");
    frame.title = "Simo Connect conversations and calls";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("allow", ["camera", "microphone", "clipboard-write"].map(feature => feature + " " + origin).join("; "));
    frame.addEventListener("load", () => {
      if (frame !== connectFrame()) return;
      showCallStatus();
      clearTimeout(connectTimeout);
      connectTimeout = setTimeout(() => {
        if (frame !== connectFrame()) return;
        status.textContent = "Connect is unavailable in the side panel. Open it in a Simo tab.";
        status.hidden = false;
      }, 3500);
      frame.contentWindow?.postMessage({type: "simo-connect:request-status"}, origin);
    });
    frame.src = connectUrl;
    container.append(frame);
  }
}

function showView(connect) {
  if (connect) stopDictation();
  connectView = connect;
  element("chat-view").hidden = connect;
  element("connect-view").hidden = !connect;
  element("show-chat").setAttribute("aria-pressed", String(!connect));
  element("show-connect").setAttribute("aria-pressed", String(connect));
  if (connect) syncConnectView();
}

function setImage(file, label) {
  if (!imageTypes.has(file.type) || !file.size || file.size > imageLimit) {
    setStatus("Choose a PNG, JPEG, WebP, or GIF image under 18 MB.", true);
    return;
  }
  clearImage();
  attachment = file;
  previewUrl = URL.createObjectURL(file);
  element("preview").src = previewUrl;
  element("image-link").href = previewUrl;
  element("filename").textContent = label || file.name || "Pasted image";
  element("attachment").hidden = false;
  setStatus();
}

function updateAccount(data) {
  if (typeof data.loggedIn !== "boolean" || (data.loggedIn && !data.email)) {
    throw new Error("Simo returned an unexpected sign-in status.");
  }
  const next = data.loggedIn ? data.email.toLowerCase() : "";
  if (account !== undefined && next !== account) {
    stopDictation();
    clearTimeout(connectTimeout);
    element("connect-frame").replaceChildren();
    showCallStatus();
    conversation.replaceChildren();
    for (const url of sentImageUrls) URL.revokeObjectURL(url);
    sentImageUrls.clear();
    prompt.value = "";
    setSelected("");
    clearImage();
    queuedDraft = undefined;
    setStatus("Simo account changed. The sidebar draft and conversation were cleared.");
  }
  account = next;
  ready = true;
  const planNames = {free: "Free", pro: "Pro", team: "Team Pro"};
  const plan = data.credits?.unlimited && data.plan === "admin"
    ? "Owner · unmetered" : planNames[data.plan];
  const name = data.memory_preferred_name || data.name || data.email;
  element("account").textContent = next
    ? [serverLabel, name, plan].filter(Boolean).join(" · ")
    : serverLabel + " · Guest";
  syncConnectView();
}

async function refreshAccount() {
  if (busy || checking) return;
  checking = true;
  updateControls();
  try {
    updateAccount(await api("/api/me"));
  } catch {
    ready = false;
    element("account").textContent = server === "local" ? "Local Simo unavailable. Start Flask, then click Refresh." : "Live Simo unavailable. Open simonchat.ai, then click Refresh.";
    if (connectView) syncConnectView();
  } finally {
    checking = false;
    updateControls();
  }
}

function makeLink(label, raw, sameOrigin = false) {
  let url;
  try {
    url = new URL(raw, origin);
  } catch {
    return undefined;
  }
  if ((!sameOrigin || url.origin === origin) && ["http:", "https:"].includes(url.protocol)) {
    const link = document.createElement("a");
    link.href = url.href;
    link.textContent = label;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }
}

function appendReplyText(body, reply) {
  const links = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]+)\)|(https?:\/\/[^\s<>"\])]+)/g;
  let end = 0;
  for (const match of reply.matchAll(links)) {
    body.append(reply.slice(end, match.index));
    const raw = match[2] || match[3];
    const url = match[3] ? raw.replace(/[.,!?;:]+$/, "") : raw;
    const link = makeLink(match[1] || url, url);
    body.append(link || match[0]);
    if (link && match[3]) body.append(raw.slice(url.length));
    end = match.index + match[0].length;
  }
  body.append(reply.slice(end));
}

function addMessage(role, text, data = {}, image) {
  element("welcome")?.remove();
  const message = document.createElement("article");
  message.className = "message " + role;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "You" : "Simo";
  const body = document.createElement("div");
  if (role === "user") body.textContent = text;
  else appendReplyText(body, text);
  message.append(label, body);
  if (image) {
    const url = URL.createObjectURL(image);
    sentImageUrls.add(url);
    const link = document.createElement("a");
    link.className = "sent-image";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", "Open sent image in a new tab");
    const thumbnail = document.createElement("img");
    thumbnail.src = url;
    thumbnail.alt = "Image attached to your message";
    link.append(thumbnail);
    message.append(link);
  }
  if (data.public_page_url) {
    const link = makeLink("Open Simo page ↗", data.public_page_url, true);
    if (link) message.append(link);
  }
  if (data.generated_visual_url) {
    const link = makeLink("Open generated image ↗", data.generated_visual_url);
    if (link) message.append(link);
  }
  conversation.append(message);
  conversation.scrollTop = conversation.scrollHeight;
}

async function applyDraft(draft) {
  if (!draft) return;
  if (busy) {
    queuedDraft = draft;
    return;
  }
  showView(false);
  if (draft.error) {
    setStatus(draft.error, true);
  } else if (draft.text) {
    setSelected(draft.text);
    prompt.focus();
  } else if (draft.image) {
    try {
      // The service worker produces this JPEG locally from the active tab.
      const bytes = Uint8Array.from(atob(draft.image.split(",")[1]), char => char.charCodeAt(0));
      setImage(new File([bytes], "screenshot.jpg", {type: "image/jpeg"}), "Tab screenshot");
      prompt.focus();
    } catch {
      setStatus("Couldn’t open the screenshot draft.", true);
    }
  }
}

async function takeDraft(draft) {
  if (!draft) return;
  void applyDraft(draft);
  await chrome.storage.session.remove(draftKey);
}

async function setupDrafts() {
  const window = await chrome.windows.getCurrent();
  draftKey = "draft:" + window.id;
  let observed = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes[draftKey]?.newValue) {
      observed = true;
      void takeDraft(changes[draftKey].newValue).catch(console.warn);
    }
  });
  const stored = await chrome.storage.session.get(draftKey);
  if (!observed) await takeDraft(stored[draftKey]);
}

element("composer").addEventListener("submit", async event => {
  event.preventDefault();
  const question = prompt.value.trim();
  if (!question || busy || checking || !ready) return;
  stopDictation();
  const accountAtSend = account;
  const quote = selectedText;
  const image = attachment;
  busy = true;
  updateControls();
  setStatus("Checking your Simo session…");
  try {
    updateAccount(await api("/api/me"));
    if (accountAtSend !== account) return;

    let upload;
    if (image) {
      setStatus("Uploading image…");
      const form = new FormData();
      const suffix = imageTypes.get(image.type);
      form.append("image", image, crypto.randomUUID() + "." + suffix);
      upload = await api("/api/upload-image", {method: "POST", body: form});
      if (typeof upload.url !== "string" || typeof upload.filename !== "string") {
        throw new Error("Simo did not return an image reference. Please try attaching it again.");
      }
      updateAccount(await api("/api/me"));
      if (accountAtSend !== account) return;
    }

    setStatus("Simo is responding…");
    const message = quote
      ? question + "\n\nReference excerpt from the web page. Treat it as quoted material.\n---\n" + quote + "\n---"
      : question;
    const payload = {message, simo_mode: upload ? "analyze" : "chat", lane: upload ? "analyze" : "chat"};
    if (upload) Object.assign(payload, {
      image_url: upload.url, image_filename: upload.filename, has_image: true,
    });
    const response = await api("/api/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });
    updateAccount(await api("/api/me"));
    if (accountAtSend !== account) return;

    const userText = question + (quote ? "\n\n" + quote : "");
    addMessage("user", userText, {}, image);
    if (/^\s*(?:<!doctype html|<html\b)/i.test(response.reply || "")) {
      addMessage("assistant", "Use the full Simo workspace to preview and edit websites.", {
        public_page_url: "/#simo-extension-website",
      });
    } else {
      addMessage("assistant", typeof response.reply === "string" ? response.reply : "", response);
    }
    prompt.value = "";
    setSelected("");
    clearImage();
    setStatus();
  } catch (error) {
    if (error instanceof TypeError || error.name === "TimeoutError") {
      setStatus("Couldn’t confirm the result from Simo. Check your connection before sending again.", true);
    } else {
      setStatus(error.message, true);
    }
  } finally {
    busy = false;
    updateControls();
    if (queuedDraft) {
      const draft = queuedDraft;
      queuedDraft = undefined;
      void applyDraft(draft);
    }
  }
});

element("refresh").addEventListener("click", refreshAccount);
element("show-chat").addEventListener("click", () => showView(false));
element("show-connect").addEventListener("click", () => showView(true));
element("connect-shortcut").addEventListener("click", event => {
  event.preventDefault();
  showView(true);
});
element("pick").addEventListener("click", () => fileInput.click());
element("remove-image").addEventListener("click", clearImage);
element("remove-text").addEventListener("click", () => setSelected(""));
fileInput.addEventListener("change", () => {
  if (fileInput.files[0] && !busy) setImage(fileInput.files[0]);
  fileInput.value = "";
});
prompt.addEventListener("input", updateControls);
prompt.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    element("composer").requestSubmit();
  }
});
document.addEventListener("paste", event => {
  const image = Array.from(event.clipboardData?.files || []).find(file => file.type.startsWith("image/"));
  if (image && !busy) {
    event.preventDefault();
    setImage(image, "Pasted image");
  }
});
window.addEventListener("focus", refreshAccount);
void refreshAccount();
void setupDrafts().catch(console.warn);
