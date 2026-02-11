/* preview.js (single preview system)
   - No iframe
   - No extra HTML files
   - Uses your existing "App Preview" tab + view
*/
(function () {
  "use strict";

  function show(kind) {
    // Tell app.js what to render (if app.js supports it)
    if (typeof window.SimoSetPreviewKind === "function") {
      window.SimoSetPreviewKind(kind);
    }

    // Switch to App Preview tab (in-page)
    const tabPreview = document.getElementById("tabPreview");
    if (tabPreview) tabPreview.click();
  }

  function maybeHandle(userText) {
    const t = String(userText || "").toLowerCase();
    const wants =
      t.includes("show me a preview") ||
      t.includes("show a preview") ||
      t.includes("preview") ||
      t.includes("mockup") ||
      t.includes("wireframe") ||
      t.includes("what would it look like");

    if (!wants) return { handled: false };

    // Decide which preview type
    const isBakery = /bakery|bread|pastry|cake|croissant|sourdough|donut|coffee/i.test(t);
    show(isBakery ? "bakery" : "space");
    return { handled: true };
  }

  window.SimoPreview = {
    maybeHandle,
    show
  };
})();
