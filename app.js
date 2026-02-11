/* app.js
   - Tabs: Chat / App Preview / Builder Preview
   - App Preview can render "space" or "bakery" in the SAME view
   - Keeps everything in ONE preview system (no extra html files)
*/
(() => {
  "use strict";

  // ---- DOM ----
  const tabChat = document.getElementById("tabChat");
  const tabPreview = document.getElementById("tabPreview");
  const tabBuilder = document.getElementById("tabBuilder");

  const viewChat = document.getElementById("viewChat");
  const viewPreview = document.getElementById("viewPreview");
  const viewBuilder = document.getElementById("viewBuilder");

  const planPill = document.getElementById("planPill");
  const statusText = document.getElementById("statusText");
  const debugLog = document.getElementById("debugLog");

  const btnUnlock = document.getElementById("btnUnlock");
  const btnReset = document.getElementById("btnReset");
  const btnShowUnlock = document.getElementById("btnShowUnlock");

  const overlay = document.getElementById("overlay");
  const btnClose = document.getElementById("btnClose");
  const btnApply = document.getElementById("btnApply");
  const unlockCode = document.getElementById("unlockCode");
  const unlockStatus = document.getElementById("unlockStatus");

  const unlockTitle = document.getElementById("unlockTitle");
  const unlockText = document.getElementById("unlockText");

  // ---- State ----
  let previewKind = "space"; // "space" | "bakery"
  let plan = "Free";
  let unlocked = false;

  function setStatus(t) {
    if (statusText) statusText.textContent = t;
  }
  function log(line) {
    if (!debugLog) return;
    const ts = new Date().toLocaleTimeString();
    debugLog.textContent += `[${ts}] ${line}\n`;
    debugLog.scrollTop = debugLog.scrollHeight;
  }

  function setActive(which) {
    if (viewChat) viewChat.style.display = which === "chat" ? "" : "none";
    if (viewPreview) viewPreview.style.display = which === "preview" ? "" : "none";
    if (viewBuilder) viewBuilder.style.display = which === "builder" ? "" : "none";

    if (tabChat) tabChat.classList.toggle("active", which === "chat");
    if (tabPreview) tabPreview.classList.toggle("active", which === "preview");
    if (tabBuilder) tabBuilder.classList.toggle("active", which === "builder");
  }

  function setPlan(newPlan) {
    plan = newPlan;
    unlocked = plan !== "Free";
    if (planPill) planPill.textContent = `Plan: ${plan}`;
  }

  // ---- Preview rendering (same view, two templates) ----
  function renderPreview() {
    if (!viewPreview) return;

    // We only replace the inside of the Preview section, not the whole app.
    const head = viewPreview.querySelector(".head");
    const body = viewPreview.querySelector(".body");
    if (!head || !body) return;

    if (previewKind === "bakery") {
      head.innerHTML = `
        <h2>Bakery App Preview</h2>
        <p>Concrete UI mockup (search + categories + menu cards + checkout panel).</p>
      `;

      body.innerHTML = `
        <div class="spacesTop">
          <div class="search">🔎 <input id="bakeryQuery" placeholder="Search croissant, sourdough, cake…"></div>
          <div class="chips" id="bakeryChips">
            <button class="chip on" data-chip="pastries">Pastries</button>
            <button class="chip" data-chip="bread">Bread</button>
            <button class="chip" data-chip="cakes">Cakes</button>
            <button class="chip" data-chip="vegan">Vegan</button>
            <button class="chip" data-chip="glutenfree">Gluten-free</button>
          </div>
        </div>

        <div style="height:12px;"></div>

        <div class="grid" style="grid-template-columns:1fr .95fr;">
          <div class="card" style="box-shadow:none;">
            <div class="body">
              <div class="listings" id="bakeryList"></div>
            </div>
          </div>

          <div class="card" style="box-shadow:none;">
            <div class="body">
              <div class="pill">Checkout panel (preview)</div>
              <div style="height:10px;"></div>

              <div class="panel">
                <div class="field">
                  <label>Pickup or delivery</label>
                  <select id="fulfillment">
                    <option>Pickup</option>
                    <option>Delivery</option>
                  </select>
                </div>

                <div class="field">
                  <label>Pickup time</label>
                  <input id="pickupTime" placeholder="Today • 3:30 PM"/>
                </div>

                <div class="field">
                  <label>Payment</label>
                  <select id="payment">
                    <option>Card</option>
                    <option>Apple Pay</option>
                    <option>Cash (pickup)</option>
                  </select>
                </div>

                <button class="btn primary" id="btnPlaceOrder">Place order</button>
                <div class="tiny" id="orderMsg"></div>
              </div>
            </div>
          </div>
        </div>
      `;

      const items = [
        { name: "Butter Croissant", desc: "Flaky • baked this morning • 4.8★", price: "$4.50" },
        { name: "Sourdough Loaf", desc: "48h ferment • crusty • best-seller", price: "$8.00" },
        { name: "Chocolate Cake Slice", desc: "Rich • ganache • limited today", price: "$6.25" },
      ];

      const list = document.getElementById("bakeryList");
      if (list) {
        list.innerHTML = items.map(i => `
          <div class="listing">
            <div class="thumb"></div>
            <div class="meta">
              <h3>${i.name}</h3>
              <div class="sub2">${i.desc}</div>
              <div class="price">${i.price}</div>
            </div>
            <button class="btn" type="button">Add</button>
          </div>
        `).join("");
      }

      // chip toggle (pure UI)
      const chips = document.getElementById("bakeryChips");
      if (chips) {
        chips.querySelectorAll(".chip").forEach(btn => {
          btn.addEventListener("click", () => btn.classList.toggle("on"));
        });
      }

      const btn = document.getElementById("btnPlaceOrder");
      const msg = document.getElementById("orderMsg");
      if (btn && msg) {
        btn.addEventListener("click", () => {
          msg.textContent = "Preview only — ordering isn’t wired yet.";
        });
      }

      log("Rendered preview: bakery");
      return;
    }

    // Default: SPACE preview (re-render your original layout)
    head.innerHTML = `
      <h2>Space Renting App Preview</h2>
      <p>This is a concrete UI preview (search + filters + listings + map + booking panel).</p>
    `;

    body.innerHTML = `
      <div class="spacesTop">
        <div class="search">🔎 <input id="spaceQuery" placeholder="Search city / ZIP / “driveway”, “garage”…"></div>
        <div class="chips" id="chips">
          <button class="chip on" data-chip="driveway">Driveway</button>
          <button class="chip" data-chip="garage">Garage</button>
          <button class="chip" data-chip="rv">RV/Boat</button>
          <button class="chip" data-chip="covered">Covered</button>
          <button class="chip" data-chip="24_7">24/7</button>
        </div>
      </div>

      <div style="height:12px;"></div>

      <div class="grid" style="grid-template-columns:1fr .95fr;">
        <div class="card" style="box-shadow:none;">
          <div class="body">
            <div class="listings" id="listingList"></div>
          </div>
        </div>

        <div class="card" style="box-shadow:none;">
          <div class="body">
            <div class="map" id="mapBox">Map placeholder</div>
            <div style="height:12px;"></div>

            <div class="panel">
              <div class="pill">Booking panel (preview)</div>

              <div class="field">
                <label>Selected listing</label>
                <select id="selectedListing"></select>
              </div>

              <div class="field">
                <label>Start date</label>
                <input id="startDate" type="date"/>
              </div>

              <div class="field">
                <label>End date</label>
                <input id="endDate" type="date"/>
              </div>

              <button class="btn primary" id="btnBook">Request booking</button>
              <div class="tiny" id="bookMsg"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const listings = [
      { name: "Driveway spot • Quiet street", info: "Fits sedan/SUV • Available today • Well-lit", price: "$12/day" },
      { name: "Covered garage bay", info: "Covered • Winter-friendly • 24/7 access", price: "$20/day" },
      { name: "RV/Boat side pad", info: "Wide access • Camera on site • Weekly discount", price: "$18/day" },
    ];

    const listEl = document.getElementById("listingList");
    const selectEl = document.getElementById("selectedListing");

    if (listEl) {
      listEl.innerHTML = listings.map((l, idx) => `
        <div class="listing">
          <div class="thumb"></div>
          <div class="meta">
            <h3>${l.name}</h3>
            <div class="sub2">${l.info}</div>
            <div class="price">${l.price}</div>
          </div>
          <button class="btn" type="button" data-pick="${idx}">Pick</button>
        </div>
      `).join("");
    }

    if (selectEl) {
      selectEl.innerHTML = listings.map((l, idx) =>
        `<option value="${idx}">${l.name} (${l.price})</option>`
      ).join("");
    }

    // Pick buttons
    if (listEl && selectEl) {
      listEl.querySelectorAll("[data-pick]").forEach(btn => {
        btn.addEventListener("click", () => {
          selectEl.value = btn.getAttribute("data-pick");
        });
      });
    }

    // chips toggle
    const chips = document.getElementById("chips");
    if (chips) {
      chips.querySelectorAll(".chip").forEach(btn => {
        btn.addEventListener("click", () => btn.classList.toggle("on"));
      });
    }

    // booking message
    const btnBook = document.getElementById("btnBook");
    const bookMsg = document.getElementById("bookMsg");
    if (btnBook && bookMsg) {
      btnBook.addEventListener("click", () => {
        bookMsg.textContent = "Preview only — booking isn’t wired yet.";
      });
    }

    log("Rendered preview: space");
  }

  // Expose setter for preview kind (used by preview.js and chat.js intercept)
  window.SimoSetPreviewKind = function (kind) {
    previewKind = (kind === "bakery") ? "bakery" : "space";
    // If you are currently on preview view, rerender immediately
    renderPreview();
  };

  // ---- Unlock modal (keeps your existing UI working) ----
  function openUnlock(reason) {
    if (!overlay) return;
    overlay.style.display = "flex";
    if (unlockStatus) unlockStatus.textContent = "";
    if (unlockCode) unlockCode.value = "";
    if (unlockTitle) unlockTitle.textContent = "Unlock Builder";
    if (unlockText) unlockText.textContent = reason || "Unlock to enable Builder features.";
  }
  function closeUnlock() {
    if (!overlay) return;
    overlay.style.display = "none";
  }

  function applyUnlock() {
    const code = String(unlockCode?.value || "").trim();
    if (code === "SIMO-UNLOCK") {
      setPlan("Pro");
      if (unlockStatus) {
        unlockStatus.textContent = "Unlocked. Plan is now Pro.";
        unlockStatus.className = "status good";
      }
      setStatus("Unlocked.");
      log("Unlock applied: Pro");
      setTimeout(closeUnlock, 500);
    } else {
      if (unlockStatus) {
        unlockStatus.textContent = "Invalid code. Try SIMO-UNLOCK.";
        unlockStatus.className = "status bad";
      }
      setStatus("Unlock failed.");
      log("Unlock failed (bad code).");
    }
  }

  // ---- Wire buttons ----
  if (tabChat) tabChat.addEventListener("click", () => { setActive("chat"); setStatus("Ready."); });
  if (tabPreview) tabPreview.addEventListener("click", () => { setActive("preview"); renderPreview(); setStatus("Ready."); });
  if (tabBuilder) tabBuilder.addEventListener("click", () => { setActive("builder"); setStatus("Ready."); });

  if (btnUnlock) btnUnlock.addEventListener("click", () => openUnlock("Builder features are locked on Free. Unlock to enable."));
  if (btnShowUnlock) btnShowUnlock.addEventListener("click", () => openUnlock("Unlock to access paid Builder features."));
  if (btnClose) btnClose.addEventListener("click", closeUnlock);
  if (btnApply) btnApply.addEventListener("click", applyUnlock);
  if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeUnlock(); });

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      // chat.js owns the actual chat history; we just refresh the page for a clean state
      location.reload();
    });
  }

  // ---- Boot ----
  setPlan("Free");
  setActive("chat");
  setStatus("Ready.");
  log("app.js loaded. Single preview system active.");
})();
