/* SIMO PHASE 14M-R10.60Z28 WEBSITE LIBRARY LANE CHECKED — WEBSITE ITEMS STAY WEBSITE ITEMS */
/* SIMO PHASE 14M-R10.59J VERIFIED FINAL LOCAL-LIVE SYNC */
// SIMO PHASE 14M-R10.59J VERIFIED LIVE READY
/*
  SIMO PHASE 14M-R10.60Z22 WEBSITE-AWARE LIBRARY BRIDGE
  File: static/simo-library-rescue.js

  Frontend-only scope:
  - Open Library rescue
  - Workspace Save to Library proof-before-success
  - Saved card display
  - Saved card reopens the exact saved design/workspace image
  - No localhost / 127.0.0.1 fallback
  - No image generation / credit usage
*/
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__SIMO_PHASE14M_R1047_LIVE_LIBRARY_BUTTON_BRIDGE__) return;
  window.__SIMO_PHASE14M_R1047_LIVE_LIBRARY_BUTTON_BRIDGE__ = true;
  window.__SIMO_LIBRARY_RESCUE_R1046__ = true;
  window.__SIMO_LIBRARY_RESCUE_R1047__ = true;
  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1046__ = true;
  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1047__ = true;

  var PHASE = "PHASE 14M-R10.60Z29 ISOLATED DESIGN LIBRARY OWNER";
  var LIB_KEYS = [
    "simo_builder_library_v5_1_builder_first",
    "simo_builder_library_v5",
    "simo_visual_concepts_library_v1",
    "simo_builder_library_v4",
    "simo_builder_library",
    "simo_library_items"
  ];
  var DESIGN_KEY = "simo_design_library_v1";
  var WEBSITE_KEYS = ["simo_builder_library_v5_1_builder_first", "simo_builder_library_v5", "simo_builder_library_v4", "simo_builder_library", "simo_library_items"];
  var LAST_KEY = "simo_workspace_last_saved_item_v2";
  var FORCE_KEY = "simo_workspace_force_library_item_v1";
  var DELETED_KEY = "simo_library_deleted_ids_v1";
  var MODAL_ID = "simoLiveLibraryFixModal";
  var SERVER_ITEMS_CACHE = [];

  function $(id) { return document.getElementById(id); }
  function nowIso() { return new Date().toISOString(); }
  function uid(prefix) {
    return (prefix || "simo_saved") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
  function low(v) { return clean(v).toLowerCase(); }
  function parseJson(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function deletedMap() {
    var obj = parseJson(localStorage.getItem(DELETED_KEY) || "{}", {});
    return obj && typeof obj === "object" ? obj : {};
  }

  function isDeleted(id) {
    id = String(id || "");
    if (!id) return false;
    return !!deletedMap()[id];
  }

  function markDeleted(id) {
    id = String(id || "");
    if (!id) return false;
    var obj = deletedMap();
    obj[id] = nowIso();
    try { localStorage.setItem(DELETED_KEY, JSON.stringify(obj)); } catch (e) {}
    return true;
  }

  function looksLikeWebsiteHtml(html) {
    var raw = String(html || "").trim();
    if (!raw) return false;
    if (/SIMO Clean Design Workspace|SIMO DYNAMIC DESIGN BOARD|simo_visual_project|Preview only\. No workspace edit/i.test(raw)) return false;
    return /<!doctype html|<html[\s>]/i.test(raw) &&
      (/\b(hero|menu|pricing|contact|faq|testimonials|reviews|gallery|nav)\b/i.test(raw) ||
       /\b(landing page|website|bakery|business|service|quote)\b/i.test(raw));
  }

  function isWebsiteItemRaw(item) {
    item = item && typeof item === "object" ? item : {};
    var tags = Array.isArray(item.tags) ? item.tags.join(" ") : String(item.tags || "");
    var blob = [
      item.type, item.kind, item.projectType, item.builderType, item.source, item.notes,
      item.title, item.name, tags, item.sourceText, item.html, item.previewHtml
    ].join(" ").toLowerCase();
    if (item.isWebsiteBuilder || item.website_builder || item.websiteBuilder) return true;
    if (/\bwebsite_builder\b|\bwebsite builder\b|\bweb builder\b|\blanding-page\b|\blanding page\b|\bpublish-ready\b|\bhtml\b/.test(blob) && looksLikeWebsiteHtml(item.html || item.previewHtml || "")) return true;
    return looksLikeWebsiteHtml(item.html || item.previewHtml || "");
  }

  function websiteHtmlFromItem(item) {
    item = item && typeof item === "object" ? item : {};
    var candidates = [item.html, item.previewHtml, item.websiteHtml, item.pageHtml];
    for (var i = 0; i < candidates.length; i += 1) {
      if (looksLikeWebsiteHtml(candidates[i])) return String(candidates[i]);
    }
    return "";
  }

  function websiteThumb(title) {
    title = clean(title || "Website Builder");
    var safe = esc(title).replace(/"/g, "&quot;");
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#f4a261"/></linearGradient></defs>' +
      '<rect width="640" height="420" rx="34" fill="#07111f"/><rect x="34" y="34" width="572" height="332" rx="28" fill="#fff8f0"/>' +
      '<rect x="34" y="34" width="572" height="118" rx="28" fill="url(#g)"/>' +
      '<text x="64" y="86" font-family="Arial" font-size="24" font-weight="900" fill="#ffffff">Website Builder</text>' +
      '<text x="64" y="123" font-family="Arial" font-size="17" font-weight="700" fill="#ffffff">' + safe.slice(0, 44) + '</text>' +
      '<rect x="64" y="182" width="230" height="22" rx="11" fill="#3b2618" opacity=".86"/>' +
      '<rect x="64" y="225" width="500" height="16" rx="8" fill="#cbd5e1"/>' +
      '<rect x="64" y="260" width="440" height="16" rx="8" fill="#e2e8f0"/>' +
      '<rect x="64" y="310" width="150" height="38" rx="19" fill="#f4a261"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function openHtmlInNewTab(html, title) {
    html = String(html || "");
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var win = window.open(url, "_blank", "noopener=false");
    try { setTimeout(function(){ URL.revokeObjectURL(url); }, 120000); } catch (e) {}
    return !!win;
  }

  function downloadHtml(html, title) {
    var blob = new Blob([String(html || "")], { type: "text/html" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = clean(title || "simo-website").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + ".html";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ try { URL.revokeObjectURL(a.href); a.remove(); } catch(e){} }, 1000);
  }

  function guardedWebsiteHtml(html) {
    html = String(html || "");
    var guard = '<script>(function(){document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a"):null;if(!a)return;var href=a.getAttribute("href")||"";if(href.charAt(0)==="#"){e.preventDefault();var el=document.querySelector(href);if(el)el.scrollIntoView({behavior:"smooth",block:"start"});return;}if(!/^https?:|^mailto:|^tel:/i.test(href)){e.preventDefault();}},true);})();<\/script>';
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, guard + "</body>");
    return html + guard;
  }

  function simpleImproveHtml(html, action, values) {
    html = String(html || "");
    action = clean(action || "").toLowerCase();
    values = values || {};
    if (values.headline) {
      html = html.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, "$1" + esc(values.headline) + "$3");
    }
    if (values.description) {
      html = html.replace(/(<section[^>]*class=["'][^"']*hero[^"']*["'][\s\S]*?<p[^>]*>)([\s\S]*?)(<\/p>)/i, "$1" + esc(values.description) + "$3");
    }
    function addBeforeClose(sectionId, block) {
      if (html.indexOf('id="' + sectionId + '"') >= 0 || html.indexOf("id='" + sectionId + "'") >= 0) return;
      html = html.replace(/<\/body>/i, block + "</body>");
    }
    if (action.indexOf("pricing") >= 0) addBeforeClose("pricing", '<section id="pricing" style="padding:70px 8%;background:#fff8f0;color:#3b2618;"><h2 style="font-size:2.2rem;margin-bottom:16px;">Popular Bakery Packages</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;"><div style="background:white;padding:24px;border-radius:20px;box-shadow:0 12px 30px rgba(0,0,0,.08);"><h3>Breakfast Box</h3><p>Assorted pastries for small gatherings.</p><strong>$35</strong></div><div style="background:white;padding:24px;border-radius:20px;box-shadow:0 12px 30px rgba(0,0,0,.08);"><h3>Party Dessert Tray</h3><p>Cookies, bars, and mini pastries.</p><strong>$65</strong></div><div style="background:white;padding:24px;border-radius:20px;box-shadow:0 12px 30px rgba(0,0,0,.08);"><h3>Custom Cake</h3><p>Celebration cakes made to order.</p><strong>From $45</strong></div></div></section>');
    if (action.indexOf("faq") >= 0) addBeforeClose("faq", '<section id="faq" style="padding:70px 8%;background:#fff1df;color:#3b2618;"><h2 style="font-size:2.2rem;margin-bottom:18px;">Frequently Asked Questions</h2><p><strong>Do you take custom orders?</strong><br>Yes, custom cakes and trays can be ordered in advance.</p><p><strong>Do you bake fresh daily?</strong><br>Yes, breads and pastries are baked fresh every morning.</p></section>');
    if (action.indexOf("review") >= 0 || action.indexOf("testimonial") >= 0) addBeforeClose("testimonials", '<section id="testimonials" style="padding:70px 8%;background:white;color:#3b2618;"><h2 style="font-size:2.2rem;margin-bottom:18px;">Loved by Local Customers</h2><blockquote style="font-size:1.2rem;line-height:1.6;">“The croissants are incredible and the custom cakes always look beautiful.”</blockquote><p>— Happy Customer</p></section>');
    if (action.indexOf("contact") >= 0) addBeforeClose("contact", '<section id="contact" style="padding:70px 8%;background:#3b2618;color:white;"><h2 style="font-size:2.2rem;margin-bottom:18px;">Order or Ask a Question</h2><p>Email orders@sweetcrumbbakery.com or call (555) 123-4567 to place an order.</p></section>');
    if (action.indexOf("premium") >= 0) {
      html = html.replace(/#f4a261/g, "#d79b55").replace(/#fff8f0/g, "#fff5e8").replace(/box-shadow:\s*0 10px 25px rgba\(0,0,0,0\.2\);/g, "box-shadow:0 18px 45px rgba(59,38,24,.28);");
    }
    return html;
  }

  function openWebsiteEditor(item) {
    item = normalizeItem(item);
    var id = String(item.id || uid("website_item"));
    var title = titleFromItem(item);
    var pageHtml = websiteHtmlFromItem(item) || visualHtml(item);
    var payload = {
      id: id,
      title: title,
      html: pageHtml,
      libKeys: WEBSITE_KEYS
    };
    var editor = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + ' — Website Builder</title>' +
      '<style>body{margin:0;background:#07111f;color:#eef4ff;font-family:Arial,sans-serif;}header{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:#050b14;border-bottom:1px solid rgba(255,255,255,.12);}h1{font-size:18px;margin:0}.wrap{display:grid;grid-template-columns:minmax(0,1fr) 320px;min-height:calc(100vh - 65px);}iframe{width:100%;height:calc(100vh - 65px);border:0;background:white}.side{border-left:1px solid rgba(255,255,255,.12);padding:16px;background:#0f172a;overflow:auto}button,input,textarea{font:inherit}button{width:100%;border:0;border-radius:14px;padding:13px;margin:6px 0;background:#38bdf8;color:#061225;font-weight:900;cursor:pointer}.dark{background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.14)}textarea,input{width:100%;box-sizing:border-box;background:#050914;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:10px;margin:6px 0}label{font-size:12px;color:#c7d3ea;font-weight:800}pre{white-space:pre-wrap;max-height:220px;overflow:auto;background:#050914;border-radius:12px;padding:10px;color:#dbeafe;font-size:12px}</style></head><body>' +
      '<header><h1>Simo Website Builder — ' + esc(title) + '</h1><button id="preview" style="width:auto;padding:10px 14px;">Open Full Preview</button></header>' +
      '<main class="wrap"><iframe id="frame"></iframe><aside class="side"><h2>Website edits</h2><label>Hero headline</label><input id="headline" placeholder="New headline"><label>Hero description</label><textarea id="description" rows="4" placeholder="New description"></textarea><button id="apply">Apply Text</button><button id="pricing" class="dark">Add Pricing</button><button id="faq" class="dark">Add FAQ</button><button id="reviews" class="dark">Add Reviews</button><button id="contact" class="dark">Add Contact</button><button id="premium" class="dark">Make More Premium</button><button id="copy" class="dark">Copy HTML</button><button id="download" class="dark">Download HTML</button><button id="save">Save Back to Library</button><pre id="code"></pre></aside></main>' +
      '<script>var DATA=' + JSON.stringify(payload) + ';' +
      'var guardedWebsiteHtml=' + guardedWebsiteHtml.toString() + ';' +
      'var simpleImproveHtml=' + simpleImproveHtml.toString() + ';' +
      'var esc=' + esc.toString() + ';' +
      'var clean=' + clean.toString() + ';' +
      'var html=DATA.html;var frame=document.getElementById("frame");var code=document.getElementById("code");function render(){frame.srcdoc=guardedWebsiteHtml(html);code.textContent=html.slice(0,2500);}function openHtml(){var u=URL.createObjectURL(new Blob([html],{type:"text/html"}));window.open(u,"_blank","noopener=false");setTimeout(function(){URL.revokeObjectURL(u)},120000)}function download(){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([html],{type:"text/html"}));a.download=(DATA.title||"simo-website").toLowerCase().replace(/[^a-z0-9]+/g,"-")+".html";a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1000)}function read(k){try{return JSON.parse(localStorage.getItem(k)||"[]")}catch(e){return []}}function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}function save(){var now=new Date().toISOString();var base={id:DATA.id,title:DATA.title,html:html,previewHtml:html,websiteHtml:html,type:"website_builder",kind:"website_builder",projectType:"website_builder",builderType:"website",isWebsiteBuilder:true,tags:["builder","website","landing-page","html","publish-ready"],updatedAt:now,createdAt:now};DATA.libKeys.forEach(function(k){var v=read(k);var isArray=Array.isArray(v);var arr=isArray?v:(v&&Array.isArray(v.items)?v.items:[]);var found=false;arr=arr.map(function(it){if(String(it&&it.id)===String(DATA.id)){found=true;return Object.assign({},it,base,{createdAt:it.createdAt||now});}return it});if(!found)arr.unshift(base);if(isArray)write(k,arr);else{v=v&&typeof v==="object"?v:{};v.items=arr;write(k,v)}});try{localStorage.setItem("simo_last_preview_v2",JSON.stringify({html:html,title:DATA.title,savedAt:now}));}catch(e){}try{if(window.opener){window.opener.dispatchEvent(new CustomEvent("simo:library-updated",{detail:{reason:"website-editor-save",id:DATA.id}}));}}catch(e){}alert("Saved back to Library.");}document.getElementById("preview").onclick=openHtml;document.getElementById("apply").onclick=function(){html=simpleImproveHtml(html,"text",{headline:document.getElementById("headline").value,description:document.getElementById("description").value});render()};["pricing","faq","reviews","contact","premium"].forEach(function(id){document.getElementById(id).onclick=function(){html=simpleImproveHtml(html,id,{});render()}});document.getElementById("copy").onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(html)};document.getElementById("download").onclick=download;document.getElementById("save").onclick=save;render();<\/script></body></html>';
    openHtmlInNewTab(editor, title + " Website Builder");
    return true;
  }

  function firstImageFromText(text) {
    var s = String(text || "");
    if (!s) return "";
    var patterns = [
      /<img[^>]+src=["']([^"']+)["']/i,
      /(?:imageUrl|image_url|generated_visual_url|previewUrl|thumbnail|currentImage|image)\s*[=:]\s*["']([^"']+)["']/i,
      /(\/generated-images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(\/generated_images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(data:image\/(?:png|jpg|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)/i,
      /(https?:\/\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      var m = s.match(patterns[i]);
      if (m && m[1]) return m[1];
    }
    return "";
  }


  function fixUrl(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (src.indexOf("data:image/") === 0 || src.indexOf("blob:") === 0) return src;
    // Hard block stale local dev paths on live. They cannot be readable to users.
    src = src.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i, window.location.origin);
    if (/^https?:\/\//i.test(src)) return src;
    try { return new URL(src, window.location.origin).href; } catch (e) { return src; }
  }

  function isUsefulImage(src) {
    src = fixUrl(src);
    if (!src) return false;

    // R10.59: local recovery fix.
    // Allow same-origin localhost/127.0.0.1 images while still preventing stale
    // localhost URLs from another origin. This was causing valid local Library
    // thumbnails to render as broken even when direct /generated-images URLs opened.
    try {
      if (/^https?:\/\//i.test(src)) {
        var u = new URL(src, window.location.origin);
        if ((/^(127\.0\.0\.1|localhost)$/i).test(u.hostname) && u.origin !== window.location.origin) {
          return false;
        }
      }
    } catch (e) {}

    return !!(
      src &&
      (
        src.indexOf("data:image/") === 0 ||
        src.indexOf("blob:") === 0 ||
        src.indexOf("/generated-images/") >= 0 ||
        src.indexOf("/generated_images/") >= 0 ||
        /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(src)
      )
    );
  }

  function readStore(key) {
    var parsed = parseJson(localStorage.getItem(key) || "[]", []);
    if (Array.isArray(parsed)) return { mode: "array", obj: parsed, arr: parsed };
    if (parsed && Array.isArray(parsed.items)) return { mode: "items", obj: parsed, arr: parsed.items };
    if (parsed && Array.isArray(parsed.builds)) return { mode: "builds", obj: parsed, arr: parsed.builds };
    if (parsed && Array.isArray(parsed.library)) return { mode: "library", obj: parsed, arr: parsed.library };
    return { mode: "array", obj: [], arr: [] };
  }

  function writeStore(key, store, arr) {
    try {
      if (store.mode === "array") {
        localStorage.setItem(key, JSON.stringify(arr));
        return true;
      }
      var obj = store.obj && typeof store.obj === "object" ? store.obj : {};
      obj[store.mode] = arr;
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  function allItems() {
    var out = [];
    var seen = {};
    // Canonical Design Library lane. Legacy visual-concepts is read only for migration/recovery.
    [DESIGN_KEY, "simo_visual_concepts_library_v1"].forEach(function (key) {
      try {
        var store = readStore(key);
        (store.arr || []).forEach(function (item) {
          if (!item || typeof item !== "object" || isWebsiteItemRaw(item)) return;
          var normalized = normalizeItem(item);
          var id = String(normalized.id || "");
          if (!id || isDeleted(id) || seen[id]) return;
          if (!bestItemImage(normalized)) return;
          seen[id] = true;
          out.push(normalized);
        });
      } catch (e) {}
    });
    out.sort(function (a, b) { return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0); });
    return out;
  }

  function bestItemImage(item) {
    item = item || {};
    var candidates = [
      item.imageUrl,
      item.image_url,
      item.generated_visual_url,
      item.generatedImageUrl,
      item.previewUrl,
      item.thumbnail,
      item.visualUrl,
      item.displayImageUrl,
      item.currentImage,
      item.image,
      item.sourceImageUrl,
      item.originalImageUrl
    ];
    if (item.workspaceData) {
      candidates.unshift(
        item.workspaceData.currentImage,
        item.workspaceData.image,
        item.workspaceData.displayImageUrl,
        item.workspaceData.sourceImage,
        item.workspaceData.originalImage
      );
    }
    candidates.push(firstImageFromText(item.html));
    candidates.push(firstImageFromText(item.sourceText || item.source_text));
    for (var i = 0; i < candidates.length; i += 1) {
      var src = fixUrl(candidates[i]);
      if (isUsefulImage(src)) return src;
    }
    return "";
  }

  function titleFromItem(item) {
    return clean(item && (item.title || item.name || item.projectTitle || item.workspaceSubject || item.prompt)) || "Simo Saved Design";
  }

  function normalizeItem(item) {
    item = item && typeof item === "object" ? item : {};
    var img = fixUrl(bestItemImage(item));
    var id = String(item.id || uid("simo_saved"));
    var title = titleFromItem(item);
    var original = fixUrl(item.originalImageUrl || item.originalImage || (item.workspaceData && item.workspaceData.originalImage) || img);
    var source = fixUrl(item.sourceImageUrl || item.sourceImage || (item.workspaceData && item.workspaceData.sourceImage) || img);
    var edits = Array.isArray(item.workspaceEdits) ? item.workspaceEdits.slice() :
      (item.workspaceData && Array.isArray(item.workspaceData.edits) ? item.workspaceData.edits.slice() : []);
    var normalized = Object.assign({}, item, {
      id: id,
      title: title,
      name: title,
      projectTitle: item.projectTitle || title,
      type: item.type || "visual",
      kind: item.kind || "visual",
      source: item.source || "simo_phase14m_live_library_fix",
      tags: Array.isArray(item.tags) ? item.tags : ["visual", "design", "workspace"],
      notes: item.notes || "Saved from Simo workspace after frontend proof check.",
      imageUrl: img,
      image_url: img,
      generated_visual_url: img,
      generatedImageUrl: img,
      previewUrl: img,
      thumbnail: img,
      visualUrl: img,
      displayImageUrl: img,
      currentImage: img,
      image: img,
      sourceImageUrl: source,
      originalImageUrl: original,
      workspaceOpen: true,
      workspaceSubject: item.workspaceSubject || title,
      workspaceEdits: edits,
      simoWorkspaceVersion: "phase14m-live-library-fix",
      updatedAt: item.updatedAt || nowIso(),
      createdAt: item.createdAt || nowIso()
    });
    normalized.workspaceData = Object.assign({}, item.workspaceData || {}, {
      id: id,
      title: title,
      projectTitle: normalized.projectTitle,
      workspaceSubject: normalized.workspaceSubject,
      image: img,
      currentImage: img,
      displayImageUrl: img,
      sourceImage: source,
      currentSourceImage: source,
      originalImage: original,
      edits: edits
    });
    if (!normalized.html) normalized.html = visualHtml(normalized);
    return normalized;
  }

  function visualHtml(item) {
    var img = fixUrl(bestItemImage(item));
    var title = titleFromItem(item);
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title></head><body style="margin:0;background:#0b1020;color:#fff;font-family:Arial,sans-serif;"><main style="max-width:960px;margin:0 auto;padding:24px;"><h1>' + esc(title) + '</h1><img src="' + esc(img) + '" alt="' + esc(title) + '" style="max-width:100%;border-radius:18px;display:block;box-shadow:0 24px 80px rgba(0,0,0,.45);"><p>Saved Simo workspace design.</p></main></body></html>';
  }

  function writeItemEverywhere(item) {
    var normalized = normalizeItem(item);
    if (isWebsiteItemRaw(normalized)) return null;
    try {
      var store = readStore(DESIGN_KEY);
      var arr = (store.arr || []).filter(function (existing) { return String(existing && existing.id || "") !== normalized.id; });
      arr.unshift(normalized);
      if (arr.length > 160) arr.length = 160;
      if (!writeStore(DESIGN_KEY, store, arr)) return null;
      localStorage.setItem(LAST_KEY, JSON.stringify(normalized));
      localStorage.setItem(FORCE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (e) { return null; }
  }

  function saveWebsiteItemEverywhere(item) {
    item = item && typeof item === "object" ? item : {};
    if (!looksLikeWebsiteHtml(item.html || item.previewHtml || item.websiteHtml || "")) return null;
    var now = nowIso();
    var html = websiteHtmlFromItem(item) || item.html || item.previewHtml || item.websiteHtml;
    var title = titleFromItem(item) || "Simo Website";
    var normalizedWebsite = Object.assign({}, item, {
      id: String(item.id || uid("website")),
      title: title, name: title, projectTitle: title,
      html: html, previewHtml: html, websiteHtml: html,
      type: "website_builder", kind: "website_builder", projectType: "website_builder", builderType: "website", isWebsiteBuilder: true,
      tags: Array.from(new Set([].concat(Array.isArray(item.tags) ? item.tags : [], ["builder", "website", "landing-page", "html", "publish-ready"]))),
      imageUrl: item.imageUrl || item.thumbnail || websiteThumb(title),
      thumbnail: item.thumbnail || item.imageUrl || websiteThumb(title),
      thumbnailUrl: item.thumbnailUrl || item.thumbnail || item.imageUrl || websiteThumb(title),
      previewImage: item.previewImage || item.thumbnail || item.imageUrl || websiteThumb(title),
      notes: item.notes || "Saved from Simo Website Builder. Preview opens the finished website. Open Website Builder opens the editor.",
      updatedAt: now, createdAt: item.createdAt || now
    });
    var saved = null;
    WEBSITE_KEYS.forEach(function (key) {
      try {
        var store = readStore(key);
        var arr = (store.arr || []).filter(function (existing) { return String(existing && existing.id || "") !== normalizedWebsite.id; });
        arr.unshift(normalizedWebsite);
        if (arr.length > 160) arr.length = 160;
        if (writeStore(key, store, arr)) saved = normalizedWebsite;
      } catch (e) {}
    });
    try { localStorage.setItem("simo_last_preview_v2", JSON.stringify({ html: html, title: title, savedAt: now })); } catch (e) {}
    fireUpdated(saved || normalizedWebsite);
    return saved || normalizedWebsite;
  }

  function findById(id) {
    id = String(id || "");
    if (!id) return null;
    var items = mergeItems(allItems(), SERVER_ITEMS_CACHE);
    for (var i = 0; i < items.length; i += 1) {
      if (String(items[i].id || "") === id) return normalizeItem(items[i]);
    }
    return null;
  }

  function verifyReadable(item) {
    item = normalizeItem(item);
    var found = findById(item.id);
    if (!found) return { ok: false, error: "Saved item was not found after write." };
    if (isWebsiteItemRaw(found) && websiteHtmlFromItem(found)) return { ok: true, item: found };
    if (!isUsefulImage(bestItemImage(found))) return { ok: false, error: "Saved item has no readable image." };
    return { ok: true, item: found };
  }

  function compressIfPossible(src) {
    src = fixUrl(src);
    if (!src || src.indexOf("data:image/") !== 0) return Promise.resolve(src);
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var maxSide = 900;
            var w = img.naturalWidth || img.width || 900;
            var h = img.naturalHeight || img.height || 900;
            var scale = Math.min(1, maxSide / Math.max(w, h));
            var canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var out = canvas.toDataURL("image/jpeg", 0.78);
            resolve(out && out.indexOf("data:image/") === 0 ? out : src);
          } catch (e) { resolve(src); }
        };
        img.onerror = function () { resolve(src); };
        img.src = src;
      } catch (e) { resolve(src); }
    });
  }

  function itemFromWorkspaceData(data) {
    data = data || {};
    var img = fixUrl(data.currentImage || data.image || data.displayImageUrl || data.previewUrl || data.sourceImage || data.originalImage || "");
    var title = clean(data.workspaceSubject || data.projectTitle || data.title || data.name) || "Simo Workspace Design";
    var edits = Array.isArray(data.edits) ? data.edits.slice() : [];
    var now = nowIso();
    return normalizeItem({
      id: clean(data.id || data.workspaceId || data.projectId || "") || uid("simo_workspace_saved"),
      title: title,
      projectTitle: title,
      prompt: data.prompt || data.latestPrompt || title,
      latestPrompt: edits.length ? String(edits[edits.length - 1]) : (data.latestPrompt || title),
      type: "visual",
      kind: "visual",
      source: "simo_phase14m_live_workspace_verified_save",
      tags: ["visual", "design", "workspace", "saved-workspace"],
      notes: "Saved only after Simo verified this item was readable in Library storage.",
      imageUrl: img,
      originalImageUrl: fixUrl(data.originalImage || img),
      sourceImageUrl: fixUrl(data.currentSourceImage || data.sourceImage || img),
      workspaceSubject: title,
      workspaceEdits: edits,
      createdAt: now,
      updatedAt: now
    });
  }

  function saveWorkspace(data) {
    var base = itemFromWorkspaceData(data || {});
    var img = bestItemImage(base);
    if (!isUsefulImage(img)) {
      return Promise.resolve({ ok: false, error: "No readable workspace image found. Nothing was saved." });
    }
    return compressIfPossible(img).then(function (safeImg) {
      base.imageUrl = safeImg || img;
      base = normalizeItem(base);
      return fetch("/api/library/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(base)
      }).then(function (res) {
        if (!res.ok) throw new Error("Design Library server save failed (" + res.status + ").");
        return res.json().catch(function () { return { ok: true }; });
      }).then(function (serverResult) {
        if (serverResult && serverResult.ok === false) throw new Error(serverResult.error || "Design Library server rejected the save.");
        var written = writeItemEverywhere(base);
        if (!written) throw new Error("Design Library local mirror write failed after server save.");
        SERVER_ITEMS_CACHE = mergeItems([base], SERVER_ITEMS_CACHE);
        var proof = verifyReadable(written);
        if (!proof.ok) throw new Error(proof.error || "Saved item was not readable after write.");
        fireUpdated(proof.item);
        return { ok: true, item: proof.item, id: proof.item.id, server: true };
      }).catch(function (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      });
    });
  }

  function fireUpdated(item) {
    try { window.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { phase: PHASE, item: item } })); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { phase: PHASE, item: item } })); } catch (e) {}
    updateCount();
    if ($(MODAL_ID)) renderModal();
  }

  function updateCount() {
    var el = $("designLibraryCountValue");
    if (el) el.textContent = String(allItems().length);
  }

  function status(message) {
    var el = $("loadingHint") || $("statusText") || document.querySelector("[data-simo-status], .status, .loading-hint");
    if (el) el.textContent = message;
  }

  function openItemWorkspace(item) {
    item = normalizeItem(item);
    if (isWebsiteItemRaw(item)) return false;
    var data = Object.assign({}, item.workspaceData || {}, {
      id: uid("workspace_reopen"),
      title: titleFromItem(item),
      projectTitle: item.projectTitle || titleFromItem(item),
      workspaceSubject: item.workspaceSubject || titleFromItem(item),
      image: bestItemImage(item),
      currentImage: bestItemImage(item),
      displayImageUrl: bestItemImage(item),
      sourceImage: item.sourceImageUrl || bestItemImage(item),
      currentSourceImage: item.sourceImageUrl || bestItemImage(item),
      originalImage: item.originalImageUrl || bestItemImage(item),
      edits: Array.isArray(item.workspaceEdits) ? item.workspaceEdits : []
    });
    if (window.SimoWorkspaceBridge && typeof window.SimoWorkspaceBridge.openTab === "function") {
      window.SimoWorkspaceBridge.openTab(data);
      return true;
    }
    if (window.SimoLiveWorkspace && typeof window.SimoLiveWorkspace.open === "function") {
      window.SimoLiveWorkspace.open(data);
      return true;
    }
    // Safe fallback: view-only card, no localhost, no generation.
    var html = visualHtml(Object.assign({}, item, { workspaceData: data }));
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener=false");
    return true;
  }


  function removeItemEverywhere(id) {
    id = String(id || "");
    if (!id) return false;
    markDeleted(id);
    try { SERVER_ITEMS_CACHE = (SERVER_ITEMS_CACHE || []).filter(function (item) { return String(item && item.id || "") !== id; }); } catch (e) {}
    var changed = false;
    [DESIGN_KEY, "simo_visual_concepts_library_v1"].forEach(function (key) {
      try {
        var store = readStore(key);
        var before = (store.arr || []).length;
        var arr = (store.arr || []).filter(function (item) {
          return String(item && item.id || "") !== id;
        });
        if (arr.length !== before) {
          writeStore(key, store, arr);
          changed = true;
        }
      } catch (e) {}
    });
    try {
      var last = parseJson(localStorage.getItem(LAST_KEY) || "null", null);
      if (last && String(last.id || "") === id) localStorage.removeItem(LAST_KEY);
    } catch (e) {}
    try {
      var force = parseJson(localStorage.getItem(FORCE_KEY) || "null", null);
      if (force && String(force.id || "") === id) localStorage.removeItem(FORCE_KEY);
    } catch (e) {}
    if (changed) fireUpdated(null);
    return changed;
  }

  function updateItemEverywhere(id, updater) {
    id = String(id || "");
    if (!id || typeof updater !== "function") return null;
    var updated = null;
    [DESIGN_KEY, "simo_visual_concepts_library_v1"].forEach(function (key) {
      try {
        var store = readStore(key);
        var arr = (store.arr || []).map(function (item) {
          if (String(item && item.id || "") !== id) return item;
          var next = normalizeItem(updater(Object.assign({}, item)));
          updated = next;
          return next;
        });
        writeStore(key, store, arr);
      } catch (e) {}
    });
    if (updated) fireUpdated(updated);
    return updated;
  }

  function openPreview(item) {
    item = normalizeItem(item);
    if (isWebsiteItemRaw(item) && websiteHtmlFromItem(item)) return openHtmlInNewTab(guardedWebsiteHtml(websiteHtmlFromItem(item)), titleFromItem(item));
    var img = bestItemImage(item);
    var title = titleFromItem(item);
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + ' — Preview</title>' +
      '<style>body{margin:0;background:#070b16;color:#fff;font-family:Arial,sans-serif;}main{max-width:1100px;margin:0 auto;padding:24px;}h1{font-size:24px;margin:0 0 16px;}img{display:block;max-width:100%;max-height:82vh;object-fit:contain;border-radius:18px;background:#050914;box-shadow:0 24px 90px rgba(0,0,0,.45);}p{color:#b9c6e8;}</style>' +
      '</head><body><main><h1>' + esc(title) + '</h1><img src="' + esc(img) + '" alt="' + esc(title) + '"><p>Preview only. No workspace edit is running.</p></main></body></html>';
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener=false");
    return true;
  }

  function editTags(item) {
    item = normalizeItem(item);
    var current = Array.isArray(item.tags) ? item.tags.join(", ") : "";
    var next = window.prompt("Tags for this saved design:", current);
    if (next === null) return false;
    var tags = String(next || "")
      .split(",")
      .map(function (x) { return clean(x); })
      .filter(Boolean);
    updateItemEverywhere(item.id, function (old) {
      old.tags = tags.length ? tags : ["visual", "design", "workspace"];
      old.updatedAt = nowIso();
      return old;
    });
    return true;
  }

  function renameItem(item) {
    item = normalizeItem(item);
    var next = window.prompt("Rename this saved design:", titleFromItem(item));
    if (next === null) return false;
    next = clean(next);
    if (!next) return false;
    updateItemEverywhere(item.id, function (old) {
      old.title = next;
      old.name = next;
      old.projectTitle = next;
      if (old.workspaceData) {
        old.workspaceData.title = next;
        old.workspaceData.projectTitle = next;
      }
      old.updatedAt = nowIso();
      return old;
    });
    return true;
  }

  function modalHtml(items) {
    var cards = items.map(function (item) {
      item = normalizeItem(item);
      var isWebsite = false;
      var img = isWebsite ? (bestItemImage(item) || websiteThumb(titleFromItem(item))) : bestItemImage(item);
      var title = titleFromItem(item);
      var tags = Array.isArray(item.tags) ? item.tags.slice(0, 4).map(esc).join(", ") : "";
      return '<article class="simo-live-library-card" data-simo-live-library-id="' + esc(item.id) + '" data-simo-kind="' + 'design-workspace' + '" style="background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.11);border-radius:18px;padding:14px;display:grid;gap:10px;">' +
        '<img src="' + esc(img) + '" alt="' + esc(title) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;background:#050914;">' +
        '<div style="font-weight:900;color:#fff;line-height:1.25;">' + esc(title) + '</div>' +
        '<div style="font-size:12px;color:#b9c6e8;">' + esc(item.updatedAt || item.createdAt || '') + '</div>' +
        (tags ? '<div style="font-size:11px;color:#9fb0da;">Tags: ' + tags + '</div>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" data-simo-live-open="' + esc(item.id) + '" style="border:0;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer;background:#6ea8ff;color:#061225;">' + 'Open Workspace' + '</button>' +
          '<button type="button" data-simo-live-preview="' + esc(item.id) + '" style="border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 12px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;">Preview</button>' +
          '<button type="button" data-simo-live-rename="' + esc(item.id) + '" style="border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 12px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;">Rename</button>' +
          '<button type="button" data-simo-live-tags="' + esc(item.id) + '" style="border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 12px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;">Tags</button>' +
          '<button type="button" data-simo-live-delete="' + esc(item.id) + '" style="border:1px solid rgba(255,120,120,.38);border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer;background:rgba(255,80,80,.12);color:#ffd7d7;">Delete</button>' +
        '</div>' +
      '</article>';
    }).join("");
    if (!cards) cards = '<div style="padding:18px;border-radius:18px;background:rgba(255,255,255,.055);color:#dbe6ff;">No saved designs found yet.</div>';
    return '<div id="' + MODAL_ID + '" style="position:fixed;inset:0;z-index:2147482600;background:rgba(2,6,18,.82);backdrop-filter:blur(12px);display:flex;align-items:flex-start;justify-content:center;padding:28px;overflow:auto;">' +
      '<section style="width:min(1120px,96vw);border:1px solid rgba(255,255,255,.14);border-radius:24px;background:#10172a;box-shadow:0 28px 90px rgba(0,0,0,.55);padding:18px;">' +
        '<header style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;">' +
          '<div><div style="font-size:21px;font-weight:900;color:#fff;">Design Library</div><div style="font-size:13px;color:#aebce4;margin-top:4px;">Saved Design Workspace projects only. Open Workspace returns to the Design Workspace.</div></div>' +
          '<button type="button" data-simo-live-close style="border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:10px 14px;background:rgba(255,255,255,.08);color:#fff;font-weight:800;cursor:pointer;">Close</button>' +
        '</header>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;">' + cards + '</div>' +
      '</section>' +
    '</div>';
  }


  function forcePreviewLabels() {
    try {
      var modal = $(MODAL_ID);
      if (!modal || !modal.querySelectorAll) return;

      var buttons = Array.prototype.slice.call(modal.querySelectorAll("button"));
      buttons.forEach(function (btn) {
        var txt = low(btn.textContent || "");
        var isOpen = btn.hasAttribute("data-simo-live-open") || txt.indexOf("open workspace") >= 0;
        var isPreview = btn.hasAttribute("data-simo-live-preview");

        // R10.59: Some older bridge/UI code rewrites the gray Preview button text to
        // "Workspace". The blue button is the only true editor opener.
        if (isPreview && !isOpen) {
          btn.textContent = "Preview";
          btn.setAttribute("aria-label", "Preview");
          btn.title = "Preview saved design";
          return;
        }

        // Defensive fallback: if a gray card button says Workspace but it is not
        // the blue Open Workspace button, convert it into a Preview button.
        if (!isOpen && txt === "workspace") {
          var card = btn.closest && btn.closest("[data-simo-live-library-id]");
          var id = card && card.getAttribute("data-simo-live-library-id");
          if (id) {
            btn.setAttribute("data-simo-live-preview", id);
            btn.textContent = "Preview";
            btn.setAttribute("aria-label", "Preview");
            btn.title = "Preview saved design";
          }
        }
      });
    } catch (e) {}
  }

  function mergeItems(localItems, serverItems) {
    var out = [];
    var seenIds = {};
    // Design Library is mirrored locally after the server confirms a save. The server can
    // normalize a data-image URL differently from the local mirror, so the same saved ID
    // may arrive with two different image strings. Treat ID as the canonical identity and
    // prefer the verified local mirror. This prevents one Save click from rendering a
    // second blank/broken card for the same Design Workspace project.
    (localItems || []).concat(serverItems || []).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      var normalized = normalizeItem(item);
      var id = String(normalized.id || "");
      if (!id || isDeleted(id) || seenIds[id]) return;
      var img = bestItemImage(normalized);
      var isWebsite = isWebsiteItemRaw(normalized) && websiteHtmlFromItem(normalized);
      if (!img && !isWebsite) return;
      seenIds[id] = true;
      out.push(normalized);
    });
    out.sort(function (a, b) {
      return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
    });
    return out;
  }

  function fetchServerItems() {
    return fetch("/api/library", { credentials: "same-origin" })
      .then(function (res) { if (!res.ok) return []; return res.json(); })
      .then(function (data) {
        var arr = Array.isArray(data) ? data : (Array.isArray(data && data.items) ? data.items : []);
        SERVER_ITEMS_CACHE = arr.map(function (item) { return normalizeItem(item); }).filter(function (item) { return !isWebsiteItemRaw(item) && !!bestItemImage(item); });
        return SERVER_ITEMS_CACHE;
      })
      .catch(function () { SERVER_ITEMS_CACHE = SERVER_ITEMS_CACHE || []; return SERVER_ITEMS_CACHE; });
  }

  function renderModal() {
    var old = $(MODAL_ID);
    if (old) old.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml(mergeItems(allItems(), SERVER_ITEMS_CACHE)));
    forcePreviewLabels();
    setTimeout(forcePreviewLabels, 50);
    setTimeout(forcePreviewLabels, 250);
  }

  function openLibrary() {
    renderModal();
    updateCount();
    status("Library opened.");
    fetchServerItems().then(function () {
      if ($(MODAL_ID)) {
        renderModal();
        updateCount();
        status("Library opened with local + server saved designs.");
      }
    });
    return true;
  }

  function closeLibrary() {
    var modal = $(MODAL_ID);
    if (modal) modal.remove();
  }

  function buttonText(btn) {
    return low(btn && (btn.textContent || btn.value || btn.getAttribute("aria-label") || btn.title || ""));
  }

  function closestCard(el) {
    return el && el.closest ? el.closest("[data-simo-live-library-id], [data-simo-workspace-saved-id], [data-simo-library-card], [data-library-card], .builder-library-card, .simo-library-card, .library-card, .build-card, .builder-card, article, .card") : null;
  }

  function bestImageInCard(card) {
    if (!card || !card.querySelectorAll) return "";
    var imgs = Array.prototype.slice.call(card.querySelectorAll("img"));
    for (var i = 0; i < imgs.length; i += 1) {
      var src = fixUrl(imgs[i].getAttribute("src") || imgs[i].src || "");
      if (isUsefulImage(src)) return src;
    }
    return "";
  }

  function itemFromDomCard(card) {
    var id = card && (card.getAttribute("data-simo-live-library-id") || card.getAttribute("data-simo-workspace-saved-id") || card.getAttribute("data-id") || "");
    var found = findById(id);
    if (found) return found;
    var img = bestImageInCard(card);
    var title = clean(card && (card.querySelector("h1,h2,h3,h4,.title,.card-title,strong,b") || {}).textContent) || clean(card && card.textContent).split("Open")[0] || "Simo Saved Design";
    return normalizeItem({ id: id || uid("simo_card"), title: title, imageUrl: img, originalImageUrl: img, sourceImageUrl: img });
  }

  function handleClick(e) {
    var target = e.target;
    if (!target || !target.closest) return;

    // R10.47: stop the old visible sidebar/card Library buttons before they can fire
    // the stale "Library script is not loaded yet" alert. This uses the visible text
    // because the live DOM does not always keep the older IDs/data attributes.
    var libraryHit = target.closest("button, a, .nav-card, .sidebar-card, .side-card, [role='button'], [data-simo-open-library], #openLibraryBtn, #builderLibraryCard");
    var libraryText = buttonText(libraryHit);
    if (libraryHit && (
      libraryText.indexOf("open design library") >= 0 ||
      libraryText === "design library"
    )) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openLibrary();
      return false;
    }

    if (target.closest("[data-simo-live-close]")) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      closeLibrary(); return false;
    }

    var actionBtn = target.closest("[data-simo-live-open], [data-simo-live-preview], [data-simo-live-delete], [data-simo-live-tags], [data-simo-live-rename]");
    if (actionBtn) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      var id = actionBtn.getAttribute("data-simo-live-open") ||
        actionBtn.getAttribute("data-simo-live-preview") ||
        actionBtn.getAttribute("data-simo-live-delete") ||
        actionBtn.getAttribute("data-simo-live-tags") ||
        actionBtn.getAttribute("data-simo-live-rename");
      var item = findById(id);
      if (!item) return false;

      if (actionBtn.hasAttribute("data-simo-live-open")) openItemWorkspace(item);
      else if (actionBtn.hasAttribute("data-simo-live-preview")) openPreview(item);
      else if (actionBtn.hasAttribute("data-simo-live-tags")) editTags(item);
      else if (actionBtn.hasAttribute("data-simo-live-rename")) renameItem(item);
      else if (actionBtn.hasAttribute("data-simo-live-delete")) {
        if (window.confirm(isWebsiteItemRaw(item) ? "Delete this saved website from the Library?" : "Delete this saved design from this browser Library?")) {
          removeItemEverywhere(id);
          renderModal();
        }
      }
      return false;
    }

    var openLibraryBtn = target.closest("#openLibraryBtn, #builderLibraryCard, [data-simo-open-library]");
    if (openLibraryBtn) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openLibrary(); return false;
    }

    var btn = target.closest("button, a, input[type='button'], input[type='submit'], [role='button']");
    if (!btn) return;
    var label = buttonText(btn);
    // R10.59: Never let generic fallback open Preview in the editor.
    // Only explicit "Open Workspace" may open the editor.
    if (label !== "open workspace" && label.indexOf("open workspace") < 0) return;

    var card = closestCard(btn);
    if (!card) return;
    var img = bestImageInCard(card);
    var text = low(card.textContent || "");
    var looksSavedDesign = isUsefulImage(img) && (text.indexOf("workspace") >= 0 || text.indexOf("visual") >= 0 || text.indexOf("design") >= 0 || card.hasAttribute("data-simo-library-card") || card.hasAttribute("data-library-card"));
    if (!looksSavedDesign) return;

    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openItemWorkspace(itemFromDomCard(card));
    return false;
  }

  function installWorkspaceBridgeOverride() {
    var old = window.SimoWorkspaceBridge || {};
    window.SimoWorkspaceBridge = Object.assign({}, old, {
      phase: PHASE,
      save: function (data) {
        status("Saving to Library…");
        return saveWorkspace(data).then(function (result) {
          if (result && result.ok) {
            status("Saved and verified in Library.");
            return true;
          }
          status("Save failed verification — not shown as saved.");
          return Promise.reject(new Error((result && result.error) || "Save failed verification."));
        });
      },
      openLibrary: openLibrary,
      openSavedItem: openItemWorkspace
    });
  }

  function installPublicApi() {
    window.SimoLibrary = Object.assign({}, window.SimoLibrary || {}, {
      phase: PHASE,
      open: openLibrary,
      close: closeLibrary,
      saveWorkspace: saveWorkspace,
      getItems: allItems,
      openItem: openItemWorkspace,
      verifyReadable: verifyReadable,
      normalizeItem: normalizeItem
    });
    window.openLibrary = openLibrary;
    // Website Library is owned by script.js. Design Library does not override it.
    window.SimoOpenDesignLibrary = openLibrary;
  }

  function boot() {
    installPublicApi();
    installWorkspaceBridgeOverride();
  
  // R10.59: absolute first-line guard for Preview.
  // Older/open-workspace rescue handlers can still exist in the page and steal preview clicks.
  // This handler runs in capture phase and stops Preview from ever reaching those handlers.
  document.addEventListener("click", function (e) {
    try {
      var target = e.target;
      if (!target || !target.closest) return;
      var btn = target.closest("[data-simo-live-preview], button, a, [role='button']");
      if (!btn) return;
      var label = low(btn.textContent || btn.value || btn.getAttribute("aria-label") || btn.title || "");
      var isPreview = btn.hasAttribute("data-simo-live-preview") || label === "preview";
      if (!isPreview) return;

      var card = closestCard(btn);
      if (!card || !card.hasAttribute("data-simo-live-library-id")) return;
      var id = btn.getAttribute("data-simo-live-preview") || card.getAttribute("data-simo-live-library-id");
      var item = findById(id);
      if (!item) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openPreview(item);
      return false;
    } catch (err) {
      try { console.warn("SIMO R10.59 preview hard stop skipped:", err); } catch (e2) {}
    }
  }, true);

  document.addEventListener("click", handleClick, true);
    window.addEventListener("click", handleClick, true);
    if (document.documentElement) document.documentElement.addEventListener("click", handleClick, true);
    window.SimoLibraryButtonBridgeR1047 = { openLibrary: openLibrary, handleClick: handleClick, phase: PHASE };
    window.addEventListener("simo:library-updated", updateCount);
    document.addEventListener("simo:library-updated", updateCount);
    updateCount();
    setTimeout(function () { installWorkspaceBridgeOverride(); installPublicApi(); updateCount(); forcePreviewLabels(); }, 500);
    setTimeout(function () { installWorkspaceBridgeOverride(); installPublicApi(); updateCount(); forcePreviewLabels(); }, 1500);
    setTimeout(forcePreviewLabels, 3000);
    console.log(PHASE + " loaded.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
