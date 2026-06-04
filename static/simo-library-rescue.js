/* SIMO PHASE 14M-R10.46 — Library Rescue Loader
   Purpose: restore Open Library when the legacy library opener is missing/not exposed.
   Scope: frontend-only. Does not touch Stripe, login, image generation, app.py, or workspace rendering.
*/
(function () {
  "use strict";

  if (window.__SIMO_LIBRARY_RESCUE_R1046__) return;
  window.__SIMO_LIBRARY_RESCUE_R1046__ = true;

  var PHASE = "SIMO Library Rescue R10.46";
  var LIB_KEY = "simo_builder_library_v5_1_builder_first";
  var LAST_PREVIEW_KEY = "simo_last_preview_v2";

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(LIB_KEY) || "[]";
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocal(items) {
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) {}
    updateCount(items);
  }

  function updateCount(items) {
    var list = Array.isArray(items) ? items : readLocal();
    var count = list.filter(function (x) { return x && !x.archived; }).length;
    var el = $("libraryCountValue");
    if (el) el.textContent = String(count);
    var card = $("builderLibraryCount");
    if (card) card.textContent = String(count);
  }

  function normalizeItem(item) {
    item = item || {};
    var id = String(item.id || item.build_id || item.slug || ("local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7)));
    var title = String(item.title || item.name || "Untitled Build");
    var html = String(item.html || item.content || "");
    var sourceText = String(item.sourceText || item.source_text || item.source || "");
    var notes = String(item.notes || "");
    var tags = item.tags;
    if (!Array.isArray(tags)) {
      try { tags = JSON.parse(item.tags_json || "[]"); } catch (e) { tags = []; }
    }
    tags = Array.isArray(tags) ? tags.filter(Boolean) : [];
    return {
      id: id,
      title: title,
      html: html,
      sourceText: sourceText,
      notes: notes,
      tags: tags,
      pinned: !!item.pinned,
      archived: !!item.archived,
      createdAt: item.createdAt || item.created_at || item.savedAt || item.saved_at || item.updatedAt || item.updated_at || "",
      updatedAt: item.updatedAt || item.updated_at || item.createdAt || item.created_at || ""
    };
  }

  function mergeItems(localItems, serverItems) {
    var out = [];
    var seen = Object.create(null);

    function add(item) {
      var n = normalizeItem(item);
      if (!n || !n.id) return;
      if (seen[n.id]) return;
      seen[n.id] = true;
      out.push(n);
    }

    (serverItems || []).forEach(add);
    (localItems || []).forEach(add);

    out.sort(function (a, b) {
      var ap = a.pinned ? 1 : 0;
      var bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });

    return out;
  }

  async function fetchServerLibrary() {
    try {
      var res = await fetch("/api/library", { credentials: "same-origin", cache: "no-store" });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok || !data || data.ok === false) return [];
      return Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      return [];
    }
  }

  function extractVisualProject(item) {
    var source = String((item && (item.sourceText || item.source_text)) || "");
    var idx = source.indexOf("{");
    if (idx >= 0) {
      try {
        var obj = JSON.parse(source.slice(idx));
        if (obj && obj.type === "simo_visual_project") return obj;
      } catch (e) {}
    }

    var html = String((item && item.html) || "");
    var img = "";
    var m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m && m[1]) img = m[1];

    var title = String((item && item.title) || "Saved Design");
    return {
      type: "simo_visual_project",
      title: title,
      item: title,
      prompt: title,
      latestPrompt: title,
      imageUrl: img,
      controls: [],
      category: "object"
    };
  }

  function css() {
    if ($("simoLibraryRescueStyles")) return;
    var s = document.createElement("style");
    s.id = "simoLibraryRescueStyles";
    s.textContent = `
      .simo-lib-backdrop{position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,Arial,sans-serif;color:#eef4ff}
      .simo-lib-modal{width:min(1120px,96vw);max-height:90vh;overflow:hidden;border:1px solid rgba(255,255,255,.16);background:#07111f;border-radius:24px;box-shadow:0 30px 110px rgba(0,0,0,.62);display:grid;grid-template-rows:auto auto 1fr}
      .simo-lib-head{padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.10);display:flex;gap:14px;align-items:center;justify-content:space-between}
      .simo-lib-head h3{margin:0;font-size:22px}.simo-lib-head p{margin:4px 0 0;color:#b7c6e4;font-size:13px}
      .simo-lib-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .simo-lib-btn{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#eef4ff;border-radius:999px;padding:10px 12px;font-weight:900;cursor:pointer;font-size:12px}
      .simo-lib-btn.primary{border-color:rgba(110,168,255,.35);background:rgba(110,168,255,.16)}
      .simo-lib-btn.danger{border-color:rgba(255,115,115,.32);background:rgba(255,115,115,.12)}
      .simo-lib-toolbar{padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.10);display:flex;gap:10px;align-items:center}
      .simo-lib-search{flex:1;min-width:220px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:11px 14px;outline:none}
      .simo-lib-list{overflow:auto;padding:18px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
      .simo-lib-card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);border-radius:18px;padding:14px;display:grid;gap:10px}
      .simo-lib-title{font-size:15px;font-weight:950;line-height:1.25}.simo-lib-meta{color:#b7c6e4;font-size:12px;line-height:1.35}.simo-lib-tags{display:flex;gap:6px;flex-wrap:wrap}
      .simo-lib-tag{font-size:10px;font-weight:900;color:#cfe0ff;border:1px solid rgba(110,168,255,.20);background:rgba(110,168,255,.10);border-radius:999px;padding:4px 7px}
      .simo-lib-card-actions{display:flex;gap:8px;flex-wrap:wrap}.simo-lib-empty{grid-column:1/-1;border:1px dashed rgba(255,255,255,.16);border-radius:20px;padding:28px;color:#c7d3ea;text-align:center}
      .simo-preview-frame{width:min(1120px,96vw);height:min(820px,90vh);border:1px solid rgba(255,255,255,.16);background:#fff;border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.65)}
    `;
    document.head.appendChild(s);
  }

  function closeExisting() {
    var old = $("simoLibraryRescueBackdrop");
    if (old) old.remove();
    var prev = $("simoLibraryPreviewBackdrop");
    if (prev) prev.remove();
  }

  function previewItem(item) {
    css();
    var html = String(item.html || "").trim();
    if (!html) {
      var visual = extractVisualProject(item);
      if (visual.imageUrl) {
        html = '<!doctype html><html><body style="margin:0;background:#07111f;color:#eef4ff;font-family:Arial;padding:24px"><h2>' + esc(item.title) + '</h2><img src="' + esc(visual.imageUrl) + '" style="max-width:100%;border-radius:18px"/></body></html>';
      } else {
        html = '<!doctype html><html><body style="margin:0;background:#07111f;color:#eef4ff;font-family:Arial;padding:24px"><h2>' + esc(item.title) + '</h2><pre style="white-space:pre-wrap">' + esc(item.sourceText || item.notes || "No preview content saved.") + '</pre></body></html>';
      }
    }

    try { localStorage.setItem(LAST_PREVIEW_KEY, JSON.stringify({ title: item.title, html: html, savedAt: new Date().toISOString() })); } catch (e) {}

    var back = document.createElement("div");
    back.id = "simoLibraryPreviewBackdrop";
    back.className = "simo-lib-backdrop";
    back.innerHTML = '<div style="display:grid;gap:10px"><div style="display:flex;justify-content:flex-end"><button class="simo-lib-btn" type="button" data-close-preview>Close Preview</button></div><iframe class="simo-preview-frame" sandbox="allow-scripts allow-same-origin"></iframe></div>';
    document.body.appendChild(back);
    back.querySelector("[data-close-preview]").onclick = function () { back.remove(); };
    var iframe = back.querySelector("iframe");
    try {
      iframe.srcdoc = html;
    } catch (e2) {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
    }
  }

  async function deleteItem(item, card) {
    if (!confirm("Delete this saved item from your Library?")) return;
    var items = readLocal().filter(function (x) { return x && String(x.id) !== String(item.id); });
    writeLocal(items);
    if (card) card.remove();

    try {
      await fetch("/api/library/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id })
      });
    } catch (e) {}

    try {
      window.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { reason: "delete", id: item.id } }));
    } catch (e2) {}
  }

  function continueItem(item) {
    var visual = extractVisualProject(item);
    closeExisting();

    if (window.SimoLiveWorkspaceIsolated && typeof window.SimoLiveWorkspaceIsolated.openSavedItem === "function") {
      try {
        window.SimoLiveWorkspaceIsolated.openSavedItem({
          id: item.id,
          title: item.title,
          html: item.html,
          sourceText: item.sourceText,
          imageUrl: visual.imageUrl || "",
          visualProject: visual
        });
        return;
      } catch (e) {
        console.warn("Simo library rescue workspace open failed:", e);
      }
    }

    if (window.SimoLiveWorkspaceIsolated && typeof window.SimoLiveWorkspaceIsolated.openTab === "function" && visual.imageUrl) {
      try {
        window.SimoLiveWorkspaceIsolated.openTab(visual.imageUrl, item.title, visual);
        return;
      } catch (e2) {}
    }

    previewItem(item);
  }

  function renderModal(items) {
    css();
    closeExisting();

    var back = document.createElement("div");
    back.id = "simoLibraryRescueBackdrop";
    back.className = "simo-lib-backdrop";
    back.innerHTML = `
      <div class="simo-lib-modal" role="dialog" aria-modal="true" aria-label="Simo Builder Library">
        <div class="simo-lib-head">
          <div>
            <h3>Builder Library</h3>
            <p>Saved builds and visual concepts from this browser and your signed-in account.</p>
          </div>
          <div class="simo-lib-actions">
            <button class="simo-lib-btn primary" type="button" data-refresh>Refresh</button>
            <button class="simo-lib-btn" type="button" data-close>Close</button>
          </div>
        </div>
        <div class="simo-lib-toolbar">
          <input class="simo-lib-search" placeholder="Search saved items..." />
          <span class="simo-lib-meta" data-count></span>
        </div>
        <div class="simo-lib-list"></div>
      </div>
    `;
    document.body.appendChild(back);

    var listEl = back.querySelector(".simo-lib-list");
    var searchEl = back.querySelector(".simo-lib-search");
    var countEl = back.querySelector("[data-count]");

    function draw() {
      var q = String(searchEl.value || "").toLowerCase().trim();
      var filtered = items.filter(function (item) {
        if (!item || item.archived) return false;
        var hay = [item.title, item.notes, item.sourceText, (item.tags || []).join(" ")].join(" ").toLowerCase();
        return !q || hay.indexOf(q) >= 0;
      });

      countEl.textContent = filtered.length + " item" + (filtered.length === 1 ? "" : "s");

      if (!filtered.length) {
        listEl.innerHTML = '<div class="simo-lib-empty">No saved items found yet. Save a design or build, then reopen Library.</div>';
        return;
      }

      listEl.innerHTML = "";
      filtered.forEach(function (item) {
        var card = document.createElement("div");
        card.className = "simo-lib-card";
        var tags = (item.tags || []).slice(0, 5).map(function (t) { return '<span class="simo-lib-tag">' + esc(t) + '</span>'; }).join("");
        var when = item.updatedAt || item.createdAt || "";
        card.innerHTML = `
          <div class="simo-lib-title">${esc(item.title)}</div>
          <div class="simo-lib-meta">${esc(when ? new Date(when).toLocaleString() : "Saved item")}</div>
          ${item.notes ? '<div class="simo-lib-meta">' + esc(item.notes).slice(0, 140) + '</div>' : ''}
          <div class="simo-lib-tags">${tags}</div>
          <div class="simo-lib-card-actions">
            <button class="simo-lib-btn primary" type="button" data-continue>Continue</button>
            <button class="simo-lib-btn" type="button" data-preview>Preview</button>
            <button class="simo-lib-btn danger" type="button" data-delete>Delete</button>
          </div>
        `;
        card.querySelector("[data-continue]").onclick = function () { continueItem(item); };
        card.querySelector("[data-preview]").onclick = function () { previewItem(item); };
        card.querySelector("[data-delete]").onclick = function () { deleteItem(item, card); };
        listEl.appendChild(card);
      });
    }

    back.querySelector("[data-close]").onclick = closeExisting;
    back.querySelector("[data-refresh]").onclick = function () { openLibrary(); };
    searchEl.addEventListener("input", draw);
    back.addEventListener("click", function (e) { if (e.target === back) closeExisting(); });
    draw();
  }

  async function openLibrary() {
    css();
    var local = readLocal();
    updateCount(local);

    var loading = document.createElement("div");
    loading.id = "simoLibraryRescueBackdrop";
    loading.className = "simo-lib-backdrop";
    loading.innerHTML = '<div class="simo-lib-modal" style="display:block;padding:24px"><h3 style="margin:0 0 8px">Builder Library</h3><p style="color:#c7d3ea;margin:0">Loading saved items...</p></div>';
    closeExisting();
    document.body.appendChild(loading);

    var server = await fetchServerLibrary();
    var merged = mergeItems(local, server);
    writeLocal(merged);
    renderModal(merged);
  }

  function bindButtons() {
    var openBtn = $("openLibraryBtn");
    var card = $("builderLibraryCard");

    [openBtn, card].forEach(function (node) {
      if (!node || node.dataset.simoLibraryRescueBound === "1") return;
      node.dataset.simoLibraryRescueBound = "1";
      node.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        openLibrary();
      }, true);
    });

    updateCount(readLocal());
  }

  window.SimoLibrary = window.SimoLibrary || {};
  window.SimoLibrary.open = openLibrary;
  window.SimoLibrary.openLibrary = openLibrary;
  window.openLibrary = openLibrary;
  window.simoOpenLibrary = openLibrary;
  window.SimoOpenLibrary = openLibrary;

  document.addEventListener("DOMContentLoaded", function () {
    bindButtons();
    setTimeout(bindButtons, 250);
    setTimeout(bindButtons, 1000);
  });

  if (document.readyState !== "loading") {
    bindButtons();
    setTimeout(bindButtons, 250);
    setTimeout(bindButtons, 1000);
  }

  window.addEventListener("simo:library-updated", function () {
    setTimeout(function () { updateCount(readLocal()); }, 80);
  });

  console.log("Simo Library Rescue loaded:", PHASE);
})();
