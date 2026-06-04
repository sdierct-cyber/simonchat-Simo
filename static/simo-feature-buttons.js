// SIMO PHASE 14M-R9 — Full Library Restore
// Isolated frontend add-on. Does not touch app.py, subject-lock prompts, image generation, or Send logic.
// Replaces the plain R8 fallback library with a full working Library dashboard:
// search, filters, rename, tags, notes, pin, archive, delete, export/import, open, continue editing.
(function () {
  "use strict";

  const PHASE = "PHASE 14M-R10 — Library Thumbnail Restore";
  window.__SIMO_FEATURE_BUTTONS_PHASE__ = PHASE;

  const LIB_KEYS = [
    "simo_builder_library_v5_1_builder_first",
    "simo_builder_library_v5",
    "simo_builder_library_v4",
    "simo_builder_library_v3",
    "simo_visual_concepts_library_v1",
    "simo_saved_visual_concepts_v1",
    "simo_library_v1"
  ];

  const R9_KEY = "simo_r9_library_state_v1";

  let libraryItems = [];
  let libraryFilter = "active";
  let librarySearch = "";

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid() {
    return "simo_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function itemTitle(item) {
    return item.title || item.name || item.projectTitle || item.label || item.prompt || item.latestPrompt || item.item || "Saved Simo item";
  }

  function itemDate(item) {
    return item.updatedAt || item.createdAt || item.savedAt || item.date || item.timestamp || "";
  }

  function firstImageFromText(text) {
    const s = String(text || "");
    if (!s) return "";

    const patterns = [
      /<img[^>]+src=["']([^"']+)["']/i,
      /(?:imageUrl|image_url|generated_visual_url|previewUrl|thumbnail|src)\s*[:=]\s*["']([^"']+)["']/i,
      /(\/generated-images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(\/generated_images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(\/static\/generated-images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(data:image\/(?:png|jpg|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)/i,
      /(https?:\/\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i
    ];

    for (const pattern of patterns) {
      const m = s.match(pattern);
      if (m && m[1]) return m[1];
    }
    return "";
  }

  function deepFindImage(value, depth = 0) {
    if (!value || depth > 4) return "";
    if (typeof value === "string") return firstImageFromText(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = deepFindImage(entry, depth + 1);
        if (found) return found;
      }
      return "";
    }
    if (typeof value === "object") {
      const priorityKeys = [
        "imageUrl", "image_url", "generated_visual_url", "generatedImageUrl",
        "previewUrl", "preview_url", "thumbnail", "thumbnailUrl", "image",
        "img", "src", "url", "visualUrl", "visual_url", "coverImage",
        "cover_image", "screenshot", "screenshotUrl", "mediaUrl"
      ];
      for (const key of priorityKeys) {
        const found = deepFindImage(value[key], depth + 1);
        if (found) return found;
      }
      for (const key of Object.keys(value)) {
        const found = deepFindImage(value[key], depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  function itemImage(item) {
    if (!item || typeof item !== "object") return "";
    return deepFindImage(item) || "";
  }


  function itemHtml(item) {
    return item.html || item.generated_html || item.code || "";
  }

  function itemTags(item) {
    if (Array.isArray(item.tags)) return item.tags;
    if (typeof item.tags === "string") return item.tags.split(",").map(t => t.trim()).filter(Boolean);
    return [];
  }

  function normalizeItem(item, sourceKey, index) {
    const copy = { ...(item || {}) };
    copy.__id = copy.__id || copy.id || copy.uuid || `${sourceKey || "unknown"}_${index}_${itemTitle(copy)}`.replace(/\s+/g, "_");
    copy.__sourceKey = sourceKey || copy.__sourceKey || R9_KEY;
    copy.__index = Number.isFinite(index) ? index : copy.__index ?? -1;
    copy.title = itemTitle(copy);
    copy.tags = itemTags(copy);
    copy.notes = copy.notes || copy.description || "";
    copy.pinned = !!copy.pinned;
    copy.archived = !!copy.archived;
    copy.updatedAt = copy.updatedAt || copy.savedAt || copy.createdAt || new Date().toISOString();
    return copy;
  }

  function getStoredArray(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = safeJsonParse(raw, null);
    if (!parsed) return [];
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.items)) return parsed.items;
    if (Array.isArray(parsed.builds)) return parsed.builds;
    if (Array.isArray(parsed.library)) return parsed.library;
    return [];
  }

  function setStoredArray(key, arr) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = safeJsonParse(raw, null);
      if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
        if (Array.isArray(parsed.items)) parsed.items = arr;
        else if (Array.isArray(parsed.builds)) parsed.builds = arr;
        else if (Array.isArray(parsed.library)) parsed.library = arr;
        else parsed.items = arr;
        localStorage.setItem(key, JSON.stringify(parsed));
      } else {
        localStorage.setItem(key, JSON.stringify(arr));
      }
    } catch {
      localStorage.setItem(key, JSON.stringify(arr));
    }
  }

  function loadLocalItems() {
    const items = [];
    LIB_KEYS.forEach(key => {
      const arr = getStoredArray(key);
      arr.forEach((item, index) => {
        if (item && typeof item === "object") items.push(normalizeItem(item, key, index));
      });
    });

    const r9 = getStoredArray(R9_KEY);
    r9.forEach((item, index) => {
      if (item && typeof item === "object") items.push(normalizeItem(item, R9_KEY, index));
    });

    const seen = new Set();
    return items.filter(item => {
      const fingerprint = `${item.__id}|${item.title}|${itemImage(item)}|${itemDate(item)}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
  }

  async function loadServerItems() {
    try {
      const r = await fetch("/api/library", { credentials: "same-origin" });
      if (!r.ok) return [];
      const data = await r.json();
      const arr = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Array.isArray(data.builds) ? data.builds : [];
      return arr.map((item, index) => normalizeItem(item, "server:/api/library", index));
    } catch {
      return [];
    }
  }

  async function loadLibrary() {
    const server = await loadServerItems();
    const local = loadLocalItems();
    const all = [...server, ...local];
    const seen = new Set();
    libraryItems = all.filter(item => {
      const fingerprint = `${item.title}|${itemImage(item)}|${itemHtml(item)}|${itemDate(item)}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
    libraryItems.sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return Number(b.pinned) - Number(a.pinned);
      return String(itemDate(b)).localeCompare(String(itemDate(a)));
    });
    return libraryItems;
  }

  function persistItem(item) {
    if (!item) return;
    let source = item.__sourceKey || R9_KEY;
    if (source.startsWith("server:")) source = R9_KEY;

    let arr = getStoredArray(source);
    const index = arr.findIndex(x => {
      const n = normalizeItem(x, source, -1);
      return n.__id === item.__id || (itemImage(n) && itemImage(n) === itemImage(item)) || (itemTitle(n) === item.title && itemDate(n) === itemDate(item));
    });

    const clean = { ...item };
    delete clean.__sourceKey;
    delete clean.__index;

    if (index >= 0) arr[index] = clean;
    else arr.unshift(clean);

    setStoredArray(source, arr);
  }

  function deleteItem(item) {
    const source = item.__sourceKey || R9_KEY;
    if (source.startsWith("server:")) {
      // Server delete may be handled elsewhere. Keep this safe by removing from R9 mirror only.
      libraryItems = libraryItems.filter(x => x.__id !== item.__id);
      return;
    }
    const arr = getStoredArray(source);
    const next = arr.filter((x, i) => {
      const n = normalizeItem(x, source, i);
      return !(n.__id === item.__id || (itemImage(n) && itemImage(n) === itemImage(item)) || (itemTitle(n) === item.title && itemDate(n) === itemDate(item)));
    });
    setStoredArray(source, next);
  }

  function addStyles() {
    if ($("simoR9Styles")) return;
    const style = document.createElement("style");
    style.id = "simoR9Styles";
    style.textContent = `
      .simo-r9-modal{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:20px;}
      .simo-r9-backdrop{position:absolute;inset:0;background:rgba(2,6,18,.72);backdrop-filter:blur(10px);}
      .simo-r9-panel{position:relative;width:min(1240px,97vw);max-height:90vh;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg,rgba(22,32,48,.99),rgba(10,15,26,.99));border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.48);color:#fff;display:grid;grid-template-rows:auto auto 1fr;}
      .simo-r9-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.1);}
      .simo-r9-kicker{font-size:11px;font-weight:900;letter-spacing:.14em;color:#a9c8ff;margin-bottom:7px;}
      .simo-r9-head h2{margin:0;font-size:24px;line-height:1.15;}
      .simo-r9-close{width:42px;height:42px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font-size:24px;cursor:pointer;}
      .simo-r9-toolbar{padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.1);display:grid;gap:12px;}
      .simo-r9-searchrow{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
      .simo-r9-input{min-width:260px;flex:1;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:#fff;border-radius:14px;padding:12px 14px;outline:none;}
      .simo-r9-chip,.simo-r9-btn{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:10px 13px;font-weight:850;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;}
      .simo-r9-chip.active,.simo-r9-btn.primary{background:linear-gradient(135deg,rgba(65,105,225,.95),rgba(40,80,170,.95));border-color:rgba(120,155,255,.45);}
      .simo-r9-body{overflow:auto;padding:18px;}
      .simo-r9-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;}
      .simo-r9-card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);border-radius:18px;padding:14px;display:grid;gap:10px;min-height:220px;}
      .simo-r9-card.pinned{border-color:rgba(250,204,21,.5);box-shadow:0 0 0 1px rgba(250,204,21,.12) inset;}
      .simo-r9-card.archived{opacity:.62;}
      .simo-r9-img{width:100%;height:150px;object-fit:cover;border-radius:14px;background:#020617;border:1px solid rgba(255,255,255,.08);}
      .simo-r9-title{font-size:15px;font-weight:950;line-height:1.25;}
      .simo-r9-meta{color:#b7c2d8;font-size:12px;line-height:1.4;word-break:break-word;}
      .simo-r9-tags{display:flex;gap:6px;flex-wrap:wrap;}
      .simo-r9-tag{font-size:11px;padding:5px 8px;border-radius:999px;background:rgba(148,163,184,.16);border:1px solid rgba(148,163,184,.18);color:#dbeafe;}
      .simo-r9-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;}
      .simo-r9-actions .simo-r9-btn{font-size:12px;padding:8px 10px;}
      .simo-r9-empty{padding:24px;border:1px dashed rgba(255,255,255,.18);border-radius:18px;color:#cbd5e1;}
      .simo-r9-note{width:100%;box-sizing:border-box;min-height:92px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:#fff;border-radius:14px;padding:12px;resize:vertical;}
      .simo-r9-modal-mini{display:grid;gap:12px;}
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.querySelectorAll("[data-simo-r9-modal]").forEach(el => {
      try { el.remove(); } catch {}
    });
  }

  function modal(title, toolbarHtml, bodyHtml) {
    closeModal();
    addStyles();
    const wrap = document.createElement("div");
    wrap.className = "simo-r9-modal";
    wrap.setAttribute("data-simo-r9-modal", "true");
    wrap.innerHTML = `
      <div class="simo-r9-backdrop" data-close-r9></div>
      <section class="simo-r9-panel" role="dialog" aria-modal="true">
        <header class="simo-r9-head">
          <div>
            <div class="simo-r9-kicker">SIMO BUILDER LIBRARY</div>
            <h2>${esc(title)}</h2>
          </div>
          <button class="simo-r9-close" type="button" data-close-r9>×</button>
        </header>
        <div class="simo-r9-toolbar">${toolbarHtml || ""}</div>
        <div class="simo-r9-body">${bodyHtml || ""}</div>
      </section>
    `;
    document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-close-r9]").forEach(btn => btn.addEventListener("click", closeModal));
    return wrap;
  }

  function filteredItems() {
    const q = librarySearch.trim().toLowerCase();
    return libraryItems.filter(item => {
      if (libraryFilter === "active" && item.archived) return false;
      if (libraryFilter === "archived" && !item.archived) return false;
      if (libraryFilter === "pinned" && !item.pinned) return false;
      if (libraryFilter === "tagged" && !itemTags(item).length) return false;
      if (q) {
        const hay = [
          item.title,
          item.notes,
          item.prompt,
          item.latestPrompt,
          item.item,
          item.category,
          item.__sourceKey,
          itemTags(item).join(" ")
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function counts() {
    return {
      total: libraryItems.length,
      active: libraryItems.filter(x => !x.archived).length,
      archived: libraryItems.filter(x => x.archived).length,
      pinned: libraryItems.filter(x => x.pinned).length,
      tagged: libraryItems.filter(x => itemTags(x).length).length,
    };
  }

  function toolbar() {
    const c = counts();
    const chip = (id, label, n) => `<button class="simo-r9-chip ${libraryFilter === id ? "active" : ""}" data-r9-filter="${id}" type="button">${label}${n !== undefined ? ` (${n})` : ""}</button>`;
    return `
      <div class="simo-r9-searchrow">
        <input class="simo-r9-input" id="simoR9Search" placeholder="Search library by title, tag, note, type…" value="${esc(librarySearch)}">
        <button class="simo-r9-btn primary" id="simoR9Export" type="button">Export Backup</button>
        <label class="simo-r9-btn" for="simoR9Import">Import Backup</label>
        <input id="simoR9Import" type="file" accept="application/json" hidden>
        <button class="simo-r9-btn" id="simoR9Refresh" type="button">Refresh</button>
      </div>
      <div class="simo-r9-searchrow">
        ${chip("active", "Active", c.active)}
        ${chip("pinned", "Pinned", c.pinned)}
        ${chip("tagged", "Tagged", c.tagged)}
        ${chip("archived", "Archived", c.archived)}
        ${chip("all", "All", c.total)}
      </div>
    `;
  }

  function card(item, i) {
    const img = itemImage(item);
    const html = itemHtml(item);
    const tags = itemTags(item);
    return `
      <article class="simo-r9-card ${item.pinned ? "pinned" : ""} ${item.archived ? "archived" : ""}" data-r9-index="${i}">
        ${img ? `<img class="simo-r9-img" src="${esc(img)}" alt="">` : html ? `<div class="simo-r9-img" style="display:grid;place-items:center;">HTML Build</div>` : `<div class="simo-r9-img" style="display:grid;place-items:center;">Saved Item</div>`}
        <div class="simo-r9-title">${item.pinned ? "⭐ " : ""}${esc(item.title)}</div>
        <div class="simo-r9-meta">${esc(item.category || item.kind || "Simo build")}<br>${esc(itemDate(item) || "Saved")}<br>${esc(item.__sourceKey || "")}</div>
        ${tags.length ? `<div class="simo-r9-tags">${tags.map(t => `<span class="simo-r9-tag">${esc(t)}</span>`).join("")}</div>` : ""}
        ${item.notes ? `<div class="simo-r9-meta"><b>Notes:</b> ${esc(String(item.notes).slice(0, 120))}</div>` : ""}
        <div class="simo-r9-actions">
          ${img ? `<a class="simo-r9-btn primary" href="${esc(img)}" target="_blank" rel="noopener">Open</a>` : ""}
          ${html ? `<button class="simo-r9-btn primary" data-r9-action="preview" type="button">Preview</button>` : ""}
          <button class="simo-r9-btn" data-r9-action="continue" type="button">Continue</button>
          <button class="simo-r9-btn" data-r9-action="rename" type="button">Rename</button>
          <button class="simo-r9-btn" data-r9-action="tags" type="button">Tags</button>
          <button class="simo-r9-btn" data-r9-action="notes" type="button">Notes</button>
          <button class="simo-r9-btn" data-r9-action="pin" type="button">${item.pinned ? "Unpin" : "Pin"}</button>
          <button class="simo-r9-btn" data-r9-action="archive" type="button">${item.archived ? "Unarchive" : "Archive"}</button>
          <button class="simo-r9-btn" data-r9-action="delete" type="button">Delete</button>
        </div>
      </article>
    `;
  }

  function renderLibrary() {
    const items = filteredItems();
    const body = document.querySelector(".simo-r9-body");
    const tool = document.querySelector(".simo-r9-toolbar");
    if (tool) tool.innerHTML = toolbar();
    if (!body) return;

    if (!items.length) {
      body.innerHTML = `<div class="simo-r9-empty"><b>No matching saved items.</b><br>Try All, Active, or clear the search.</div>`;
    } else {
      body.innerHTML = `<div class="simo-r9-grid">${items.map((item, i) => card(item, libraryItems.indexOf(item))).join("")}</div>`;
    }

    bindLibraryControls();
  }

  function miniPrompt(title, label, current, onSave, multiline=false) {
    const html = `
      <div class="simo-r9-modal-mini">
        <label>${esc(label)}</label>
        ${multiline ? `<textarea class="simo-r9-note" id="simoR9MiniInput">${esc(current || "")}</textarea>` : `<input class="simo-r9-input" id="simoR9MiniInput" value="${esc(current || "")}">`}
        <div class="simo-r9-actions">
          <button class="simo-r9-btn primary" id="simoR9MiniSave" type="button">Save</button>
          <button class="simo-r9-btn" data-close-r9 type="button">Cancel</button>
        </div>
      </div>
    `;
    modal(title, "", html);
    $("simoR9MiniSave")?.addEventListener("click", () => {
      const val = $("simoR9MiniInput")?.value || "";
      onSave(val);
      openLibrary();
    });
  }

  function continueItem(item) {
    closeModal();
    const prompt = item.latestPrompt || item.prompt || item.title || item.item || "continue editing this saved Simo design";
    const input = $("chatInput");
    if (input) {
      input.value = `Continue editing: ${prompt}`;
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    try {
      window.__SIMO_PHASE105D_ACTIVE_VISUAL_PROJECT__ = item;
      localStorage.setItem("simo_phase105d_active_visual_project_v1", JSON.stringify(item));
      localStorage.setItem("simo_phase12_active_visual_project_v1", JSON.stringify(item));
    } catch {}
  }

  function previewItem(item) {
    const html = itemHtml(item);
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function bindLibraryControls() {
    $("simoR9Search")?.addEventListener("input", (e) => {
      librarySearch = e.target.value || "";
      renderLibrary();
    });

    document.querySelectorAll("[data-r9-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        libraryFilter = btn.getAttribute("data-r9-filter") || "active";
        renderLibrary();
      });
    });

    $("simoR9Refresh")?.addEventListener("click", openLibrary);

    $("simoR9Export")?.addEventListener("click", () => {
      const payload = {
        phase: PHASE,
        exportedAt: new Date().toISOString(),
        items: libraryItems
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `simo-library-backup-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    });

    $("simoR9Import")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const data = safeJsonParse(text, null);
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      if (!arr.length) return alert("No items found in backup.");
      const existing = getStoredArray(R9_KEY);
      const next = [...arr.map((x, i) => normalizeItem(x, R9_KEY, i)), ...existing];
      setStoredArray(R9_KEY, next);
      await openLibrary();
    });

    document.querySelectorAll("[data-r9-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cardEl = btn.closest("[data-r9-index]");
        const index = Number(cardEl?.getAttribute("data-r9-index"));
        const item = libraryItems[index];
        if (!item) return;
        const action = btn.getAttribute("data-r9-action");

        if (action === "continue") return continueItem(item);
        if (action === "preview") return previewItem(item);

        if (action === "rename") {
          return miniPrompt("Rename Build", "New title", item.title, (val) => {
            item.title = val.trim() || item.title;
            item.updatedAt = new Date().toISOString();
            persistItem(item);
          });
        }

        if (action === "tags") {
          return miniPrompt("Edit Tags", "Comma-separated tags", itemTags(item).join(", "), (val) => {
            item.tags = val.split(",").map(t => t.trim()).filter(Boolean);
            item.updatedAt = new Date().toISOString();
            persistItem(item);
          });
        }

        if (action === "notes") {
          return miniPrompt("Edit Notes", "Notes / description", item.notes || "", (val) => {
            item.notes = val;
            item.updatedAt = new Date().toISOString();
            persistItem(item);
          }, true);
        }

        if (action === "pin") {
          item.pinned = !item.pinned;
          item.updatedAt = new Date().toISOString();
          persistItem(item);
          renderLibrary();
          return;
        }

        if (action === "archive") {
          item.archived = !item.archived;
          item.updatedAt = new Date().toISOString();
          persistItem(item);
          renderLibrary();
          return;
        }

        if (action === "delete") {
          if (!confirm(`Delete "${item.title}" from this library view?`)) return;
          deleteItem(item);
          libraryItems = libraryItems.filter((_, i) => i !== index);
          renderLibrary();
        }
      });
    });
  }

  async function openLibrary() {
    addStyles();
    modal("Builder Library", toolbar(), `<div class="simo-r9-empty">Loading library…</div>`);
    await loadLibrary();
    renderLibrary();
  }

  async function openEasySignup() {
    addStyles();
    let me = null;
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      me = await r.json();
    } catch {}
    const loggedIn = !!(me && me.loggedIn);
    modal("Easy Signup", "", `
      <div class="simo-r9-grid">
        <div class="simo-r9-card">
          <div class="simo-r9-title">${loggedIn ? "You are signed in" : "Create or sign into your Simo account"}</div>
          <div class="simo-r9-meta">
            ${loggedIn ? `Current account: <b>${esc(me.email || me.name || "Signed in")}</b><br>Plan: <b>${me.pro ? "Pro" : "Free"}</b>` : "Use Google sign-in or email/password signup from the main app."}
          </div>
          <div class="simo-r9-actions">
            ${loggedIn ? `<button class="simo-r9-btn" id="simoR9Logout" type="button">Logout</button>` : `<a class="simo-r9-btn primary" href="/login">Sign in with Google</a>`}
          </div>
        </div>
        <div class="simo-r9-card">
          <div class="simo-r9-title">Email signup</div>
          <input class="simo-r9-input" id="simoR9Email" placeholder="Email">
          <input class="simo-r9-input" id="simoR9Password" placeholder="Password" type="password">
          <div class="simo-r9-actions">
            <button class="simo-r9-btn primary" id="simoR9Signup" type="button">Create Account</button>
          </div>
        </div>
      </div>
    `);

    $("simoR9Logout")?.addEventListener("click", () => {
      fetch("/api/logout", { method: "POST", credentials: "same-origin" }).finally(() => location.href = "/");
    });

    $("simoR9Signup")?.addEventListener("click", async () => {
      const email = $("simoR9Email")?.value.trim();
      const password = $("simoR9Password")?.value;
      if (!email || !password) return alert("Enter email and password.");
      const r = await fetch("/api/signup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: email.split("@")[0] })
      });
      const data = await r.json().catch(() => ({}));
      alert(data.ok ? "Signup complete." : (data.error || "Signup failed."));
      if (data.ok) location.reload();
    });
  }

  function openSettings() {
    addStyles();
    modal("Settings & Voice", "", `
      <div class="simo-r9-grid">
        <div class="simo-r9-card">
          <div class="simo-r9-title">Voice settings</div>
          <div class="simo-r9-meta">Voice is planned for Simo. This panel is a safe placeholder until the real voice settings are wired.</div>
        </div>
        <div class="simo-r9-card">
          <div class="simo-r9-title">Current build</div>
          <div class="simo-r9-meta">
            Feature restore: <b>${esc(PHASE)}</b><br>
            Account sync: <b>${esc(window.__SIMO_ACCOUNT_SYNC_PHASE__ || "loading")}</b><br>
            Visual core: <b>${esc(window.SimoVisualCore?.phase || window.__SIMO_PHASE_MARKER__ || "loaded")}</b>
          </div>
        </div>
      </div>
    `);
  }

  function addHelperCard() {
    addStyles();
    const chat = $("chatMessages");
    if (!chat) return;
    const old = document.querySelector(".simo-r9-helper-card");
    if (old) old.remove();
    const card = document.createElement("div");
    card.className = "simo-r9-helper-card";
    card.innerHTML = `
      <div class="simo-r9-card" style="margin:14px 0;">
        <div class="simo-r9-title">Simo helper</div>
        <div class="simo-r9-meta">Choose a safe next test or continue designing from the current concept.</div>
        <div class="simo-r9-actions">
          <button class="simo-r9-btn" data-r9-prompt="show me a custom water bottle to design">Water bottle test</button>
          <button class="simo-r9-btn" data-r9-prompt="show me a modern chair to design">Chair test</button>
          <button class="simo-r9-btn" data-r9-prompt="show me a tire rim to design">Rim test</button>
        </div>
      </div>
    `;
    chat.appendChild(card);
    card.querySelectorAll("[data-r9-prompt]").forEach(btn => {
      btn.addEventListener("click", () => {
        const input = $("chatInput");
        if (input) {
          input.value = btn.getAttribute("data-r9-prompt") || "";
          input.focus();
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    });
    try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch {}
  }

  function bind() {
    const bindings = [
      ["openLibraryBtn", openLibrary],
      ["builderLibraryCard", openLibrary],
      ["signupBtn", openEasySignup],
      ["settingsBtn", openSettings],
      ["simoHintCard", addHelperCard]
    ];

    bindings.forEach(([id, handler]) => {
      const el = $(id);
      if (!el || el.dataset.simoR9Bound) return;
      el.dataset.simoR9Bound = "true";
      el.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        handler();
      }, true);
    });
  }

  function boot() {
    addStyles();
    bind();
    setTimeout(bind, 500);
    setTimeout(bind, 1500);
    console.log("[SIMO] " + PHASE + " loaded");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.SimoFeatureButtons = { phase: PHASE, openLibrary, openEasySignup, openSettings, addHelperCard };
})();
