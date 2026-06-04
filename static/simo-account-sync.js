// SIMO PHASE 14M-R6 — Account UI Sync Fix
// Backend login is already working. This only syncs the visible Account/Plan UI.
// It does not change image generation, subject lock, Send/Enter, or app.py.
(function () {
  "use strict";

  const PHASE = "PHASE 14M-R6 — Account UI Sync Fix";
  window.__SIMO_ACCOUNT_SYNC_PHASE__ = PHASE;

  function textOf(el) {
    return String((el && el.textContent) || "").trim();
  }

  function setTextById(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) {
      el.textContent = String(value);
      return true;
    }
    return false;
  }

  function findExactText(text) {
    const wanted = String(text || "").trim();
    if (!wanted) return null;
    const all = Array.from(document.querySelectorAll("body *"));
    return all.find((el) => {
      const t = textOf(el);
      if (t !== wanted) return false;
      const childrenText = Array.from(el.children || []).map(textOf).join(" ").trim();
      return !childrenText || childrenText !== t;
    }) || null;
  }

  function replaceFirstExact(oldText, newText) {
    const el = findExactText(oldText);
    if (el) {
      el.textContent = String(newText);
      return true;
    }
    return false;
  }

  function setButtonState(me) {
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const proBadge = document.getElementById("proBadge");

    if (loginBtn) {
      loginBtn.style.display = me.loggedIn ? "none" : "";
      loginBtn.disabled = false;
      loginBtn.style.pointerEvents = "";
    }

    if (logoutBtn) {
      logoutBtn.style.display = me.loggedIn ? "" : "none";
      logoutBtn.disabled = false;
      logoutBtn.style.pointerEvents = "";
    }

    if (proBadge) {
      proBadge.dataset.pro = me.pro ? "true" : "false";
      proBadge.textContent = me.pro ? "Pro" : "Free";
      proBadge.style.display = "";
    }
  }

  function syncAccountUI(me) {
    if (!me || typeof me !== "object") return;

    const email = me.email || "";
    const displayName = email || me.name || (me.loggedIn ? "Signed in" : "Guest");
    const plan = me.pro ? "Pro" : "Free";
    const usage = String(me.usage_today ?? 0);
    const limit = String(me.free_daily_limit ?? 500);

    setTextById("accountValue", displayName) || replaceFirstExact("Guest", displayName);
    setTextById("userEmail", email || "Guest");
    setTextById("planValue", plan) || replaceFirstExact("Free", plan);
    setTextById("usageTodayValue", `${usage} / ${limit}`);

    // Handle older UI cards without IDs.
    if (me.loggedIn && email) {
      replaceFirstExact("Guest", email);
      replaceFirstExact("Logged-in workspace status", me.pro ? "Signed in • Pro active" : "Signed in");
    }

    if (me.pro) {
      replaceFirstExact("Free", "Pro");
      replaceFirstExact("Free / Pro / Team", me.stripe_subscription_status ? `Pro • ${me.stripe_subscription_status}` : "Pro active");
    }

    setButtonState(me);

    window.__SIMO_ACCOUNT_STATE__ = me;
    console.log("[SIMO]", PHASE, me);
  }

  async function loadAccount() {
    try {
      const res = await fetch("/api/me", {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
      const me = await res.json();
      syncAccountUI(me);
      return me;
    } catch (err) {
      console.warn("[SIMO] Account UI sync failed:", err);
      return null;
    }
  }

  function bindLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn || logoutBtn.dataset.simoR6LogoutBound) return;
    logoutBtn.dataset.simoR6LogoutBound = "true";
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      fetch("/api/logout", { method: "POST", credentials: "same-origin" })
        .finally(() => {
          window.location.href = "/";
        });
    }, true);
  }

  function bindLogin() {
    const loginBtn = document.getElementById("loginBtn");
    if (!loginBtn || loginBtn.dataset.simoR6LoginBound) return;
    loginBtn.dataset.simoR6LoginBound = "true";
    loginBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      window.location.href = "/login";
    }, true);
  }

  function boot() {
    bindLogin();
    bindLogout();
    loadAccount();
    setTimeout(loadAccount, 500);
    setTimeout(loadAccount, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.SimoAccountSync = { phase: PHASE, load: loadAccount, sync: syncAccountUI };
})();
