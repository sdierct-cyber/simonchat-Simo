// netlify/functions/simon.js
// Simo backend: best-friend core + intent router + previews + (optional) Serper web+image search.
// + Server memory (forever until Forget) using Netlify Blobs (@netlify/blobs)
//
// ENV VARS in Netlify:
// - OPENAI_API_KEY   (required)
// - OPENAI_MODEL     (optional, default: gpt-4.1-mini)
// - SERPER_API_KEY   (optional, enables web lookup)
// Notes:
// - This function supports client "action":"forget" with "user_id" to clear server memory.

const OPENAI_URL = "https://api.openai.com/v1/responses";

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(s = "") {
  return String(s).toLowerCase().trim();
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/* --------------------------- Preview logic --------------------------- */

function wantsPreview(text = "") {
  const t = normalize(text);
  return (
    /\bshow me\b.*\b(preview|mockup|ui|layout|wireframe)\b/.test(t) ||
    /\b(show|make|build|generate|create)\b.*\b(preview|mockup|ui|layout|wireframe)\b/.test(t)
  );
}

function detectPreviewKind(text = "", fallbackTopic = "") {
  const t = normalize(text);
  const topic = normalize(fallbackTopic);
  const any = `${t} ${topic}`.trim();

  if (/\b(resume|cv)\b/.test(any)) return "resume";
  if (/\b(landing page|homepage|hero section|portfolio)\b/.test(any)) return "landing_page";
  if (/\b(dashboard|admin|analytics)\b/.test(any)) return "dashboard";
  if (/\b(space renting|driveway|garage|rent out space|parking spot)\b/.test(any)) return "space_renting_app";
  if (/\b(home|house)\b/.test(any) && /\b(layout|floor plan|2 story|two story)\b/.test(any)) return "home_layout";
  if (/\b(app|mobile app)\b/.test(any)) return "generic_app";

  return "wireframe";
}

function buildPreviewHtml(kind, userText = "") {
  const titleMap = {
    space_renting_app: "Space Rentals",
    resume: "Resume Layout",
    home_layout: "2-Story Home Layout",
    landing_page: "Landing Page",
    dashboard: "Dashboard UI",
    generic_app: "App UI",
    wireframe: "Wireframe Preview",
  };

  const title = titleMap[kind] || "Preview";
  const subtitle = escapeHtml(userText).slice(0, 140);

  const shell = (inner) => `
  <html><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root{
        --bg:#0b1020; --text:#eaf0ff; --muted:#a9b6d3;
        --line:rgba(255,255,255,.12);
        --btn:#2a66ff; --good:#39d98a;
      }
      *{box-sizing:border-box}
      body{
        margin:0;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        background:radial-gradient(900px 520px at 20% 0%, #162a66 0%, var(--bg) 60%);
        color:var(--text);
        padding:16px;
      }
      .shell{max-width:980px;margin:0 auto}
      .top{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:12px}
      .title{font-size:18px;font-weight:900;margin:0}
      .sub{color:rgba(234,240,255,.68);font-size:12px;margin-top:4px}
      .tag{color:rgba(234,240,255,.68);font-size:12px}
      .bar{
        display:flex; gap:10px; flex-wrap:wrap;
        padding:12px; border:1px solid var(--line); border-radius:14px;
        background:rgba(0,0,0,.22);
      }
      .input{
        flex:1; min-width:240px;
        padding:10px 12px; border-radius:12px; border:1px solid var(--line);
        background:rgba(0,0,0,.28); color:var(--text);
      }
      .chip{
        padding:8px 10px; border-radius:999px;
        border:1px solid var(--line); background:rgba(255,255,255,.05);
        color:rgba(234,240,255,.78); font-size:12px;
      }
      .grid{
        display:grid; grid-template-columns: 1.2fr .8fr; gap:12px;
        margin-top:12px;
      }
      .card{
        border:1px solid var(--line);
        background:rgba(0,0,0,.22);
        border-radius:14px;
        overflow:hidden;
      }
      .card h3{margin:0;padding:12px;border-bottom:1px solid var(--line);font-size:14px}
      .list{padding:12px; display:grid; gap:10px}
      .item{
        border:1px solid var(--line);
        background:rgba(255,255,255,.04);
        border-radius:12px;
        padding:10px;
        display:flex; justify-content:space-between; gap:10px;
      }
      .meta{color:rgba(234,240,255,.65); font-size:12px; margin-top:4px}
      .price{font-weight:900}
      .btn{
        display:inline-flex; justify-content:center; align-items:center;
        padding:10px 12px;
        border-radius:12px;
        background:linear-gradient(180deg, var(--btn), #1f4dd6);
        color:white; font-weight:800; border:0;
      }
      .map{
        height:240px;
        display:flex;align-items:center;justify-content:center;
        color:rgba(234,240,255,.65);
        background:repeating-linear-gradient(45deg, rgba(255,255,255,.04), rgba(255,255,255,.04) 10px, rgba(255,255,255,.02) 10px, rgba(255,255,255,.02) 20px);
      }
      @media (max-width: 860px){ .grid{grid-template-columns:1fr} }
    </style>
  </head><body>
    <div class="shell">
      <div class="top">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">${subtitle}</div>
        </div>
        <div class="tag">Preview • rendered mockup</div>
      </div>
      ${inner}
    </div>
  </body></html>`;

  if (kind === "space_renting_app") {
    return shell(`
      <div class="bar">
        <input class="input" placeholder="Search city, zip, address (e.g., 48044)" />
        <span class="chip">Under $20/day</span>
        <span class="chip">24/7 access</span>
        <span class="chip">Covered</span>
        <span class="chip">EV friendly</span>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Listings</h3>
          <div class="list">
            <div class="item">
              <div>
                <div><strong>Driveway • 2 spots</strong></div>
                <div class="meta">0.8 mi • Available today • Camera on-site</div>
              </div>
              <div style="text-align:right">
                <div class="price">$14/day</div>
                <div class="meta">Instant book</div>
              </div>
            </div>

            <div class="item">
              <div>
                <div><strong>Garage Bay • Secure</strong></div>
                <div class="meta">2.1 mi • Available weekends • Locked gate</div>
              </div>
              <div style="text-align:right">
                <div class="price">$28/day</div>
                <div class="meta">Request</div>
              </div>
            </div>

            <div class="item">
              <div>
                <div><strong>Side Lot • Large</strong></div>
                <div class="meta">4.4 mi • Available nightly • Easy access</div>
              </div>
              <div style="text-align:right">
                <div class="price">$10/day</div>
                <div class="meta">Instant book</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Map + Booking</h3>
          <div class="map">Map placeholder</div>
          <div class="list">
            <div class="item">
              <div>
                <div><strong>Selected:</strong> Driveway • 2 spots</div>
                <div class="meta">Pick dates + vehicle</div>
              </div>
              <div style="text-align:right">
                <div class="price">$14</div>
                <div class="meta">+ fees</div>
              </div>
            </div>
            <button class="btn">Book now</button>
          </div>
        </div>
      </div>
    `);
  }

  if (kind === "resume") {
    return shell(`
      <div class="card">
        <h3>Resume</h3>
        <div class="list">
          <div>
            <div style="font-size:26px;font-weight:900;">Your Name</div>
            <div class="meta">Email • Phone • City, State • LinkedIn</div>
            <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0;"></div>
            <div style="font-weight:900;margin-bottom:8px;">Experience</div>
            <div class="item" style="display:block">
              <div><strong>Job Title • Company</strong></div>
              <div class="meta">Dates • Location</div>
              <ul class="meta" style="margin:8px 0 0 18px;line-height:1.45;">
                <li>Impact bullet</li>
                <li>Project / leadership</li>
                <li>Tools / systems</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  if (kind === "landing_page") {
    return shell(`
      <div class="grid">
        <div class="card">
          <h3>Hero</h3>
          <div class="list">
            <div style="font-size:28px;font-weight:900;line-height:1.05;">Clear headline that says what this is.</div>
            <div class="meta" style="font-size:13px;">Short subheadline. One sentence. Concrete benefit.</div>
            <div style="display:flex;gap:10px;margin-top:12px;">
              <button class="btn">Get started</button>
              <button class="btn" style="background:rgba(255,255,255,.10);color:var(--text);border:1px solid rgba(255,255,255,.12);">See demo</button>
            </div>
            <div style="margin-top:12px;display:grid;gap:10px;">
              <div class="item"><div><strong>Feature</strong><div class="meta">Benefit in one line</div></div></div>
              <div class="item"><div><strong>Feature</strong><div class="meta">Benefit in one line</div></div></div>
              <div class="item"><div><strong>Feature</strong><div class="meta">Benefit in one line</div></div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Hero Image</h3>
          <div class="map">Screenshot / graphic</div>
        </div>
      </div>
    `);
  }

  if (kind === "dashboard") {
    return shell(`
      <div class="grid" style="grid-template-columns:1fr;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="card"><h3>Revenue</h3><div class="list"><div style="font-size:22px;font-weight:900;">—</div><div class="meta">This month</div></div></div>
          <div class="card"><h3>Active Users</h3><div class="list"><div style="font-size:22px;font-weight:900;">—</div><div class="meta">Today</div></div></div>
          <div class="card"><h3>Bookings</h3><div class="list"><div style="font-size:22px;font-weight:900;">—</div><div class="meta">This week</div></div></div>
        </div>
        <div class="card">
          <h3>Recent Activity</h3>
          <div class="list">
            <div class="item"><div><strong>New signup</strong><div class="meta">2 min ago</div></div></div>
            <div class="item"><div><strong>Payment completed</strong><div class="meta">17 min ago</div></div></div>
            <div class="item"><div><strong>New message</strong><div class="meta">1 hr ago</div></div></div>
          </div>
        </div>
      </div>
    `);
  }

  return shell(`
    <div class="grid">
      <div class="card">
        <h3>Left Panel</h3>
        <div class="list"><div class="map" style="height:180px;">Content</div></div>
      </div>
      <div class="card">
        <h3>Right Panel</h3>
        <div class="list"><div class="map" style="height:180px;">Content</div></div>
      </div>
    </div>
  `);
}

/* ----------------------- Pro structured injection -------------------- */

function isContinue(text = "") {
  const t = normalize(text);
  return /^(continue|resume|keep going)\b/.test(t) || /\bcontinue that\b/.test(t) || /\bkeep going\b/.test(t);
}

function detectIntent(text = "") {
  const t = normalize(text);

  if (/\bswitch topics?\b/.test(t)) return "switch";
  if (isContinue(t)) return "continue";
  if (/\b(show me|preview|mockup|ui|layout|wireframe)\b/.test(t)) return "building";
  if (/\b(stressed|anxious|tired|overwhelmed|upset|mad|angry|sad|fight|argu(ment|ing))\b/.test(t)) return "venting";
  if (/\b(help me|how do i|fix|debug|error|issue|broken)\b/.test(t)) return "solving";
  if (/\b(build|design|make|create|generate)\b/.test(t)) return "building";

  return "auto";
}

function looksLikeModify(text = "") {
  const t = normalize(text);
  if (isContinue(t)) return true;
  return /\b(add|include|insert|append|update|edit|change|modify|tweak|improve|enhance|make it|make the|remove|delete|swap|replace)\b/.test(t);
}

function extractModRequests(text = "") {
  const t = normalize(text);

  const req = {
    addPricing: /\b(pricing|plans|subscription|tiers)\b/.test(t),
    addTestimonials: /\b(testimonials|reviews|social proof)\b/.test(t),
    addFaq: /\b(faq|questions)\b/.test(t),
    addAuth: /\b(login|log in|signup|sign up|register|authentication)\b/.test(t),
    addPayments: /\b(payments?|checkout|stripe|billing)\b/.test(t),
    addDashboard: /\b(host dashboard|admin|analytics|charts)\b/.test(t),
    addMessaging: /\b(message|chat|inbox|dm)\b/.test(t),
    makeDarker: /\b(darker|more dark|night mode)\b/.test(t),
    makeNeon: /\b(neon|cyber|glow|brighter)\b/.test(t),
  };

  // If they said "continue" with no keywords, do a sensible default add-on
  const anyExplicit =
    req.addPricing || req.addTestimonials || req.addFaq || req.addAuth ||
    req.addPayments || req.addDashboard || req.addMessaging || req.makeDarker || req.makeNeon;

  if (!anyExplicit && isContinue(t)) {
    req.addPricing = true;
    req.addTestimonials = true;
  }

  return req;
}

function injectBeforeBodyClose(html, injection) {
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx === -1) return html + injection;
  return html.slice(0, idx) + injection + html.slice(idx);
}

function tweakTheme(html, { makeDarker, makeNeon }) {
  let out = html;

  // Darker: deepen bg + gradients slightly (safe string replaces)
  if (makeDarker) {
    out = out.replace(/--bg:#0b1020/g, "--bg:#070a14");
    out = out.replace(/#162a66/g, "#0e1d52");
  }

  // Neon: add subtle glow effect to cards/items (safe: append CSS near end of <style>)
  if (makeNeon) {
    const styleClose = out.toLowerCase().lastIndexOf("</style>");
    if (styleClose !== -1) {
      const glowCss = `
      /* PRO: neon polish */
      .card{box-shadow: 0 0 0 1px rgba(42,102,255,.18), 0 18px 60px rgba(0,0,0,.35);}
      .item{box-shadow: 0 0 0 1px rgba(57,217,138,.10);}
      .btn{box-shadow: 0 0 24px rgba(42,102,255,.18);}
      `.trim();
      out = out.slice(0, styleClose) + "\n" + glowCss + "\n" + out.slice(styleClose);
    }
  }

  return out;
}

function buildSection({ title, bodyHtml }) {
  return `
  <div style="margin-top:12px;">
    <div class="card">
      <h3>${escapeHtml(title)}</h3>
      <div class="list">
        ${bodyHtml}
      </div>
    </div>
  </div>
  `.trim();
}

function applyStructuredEdits(currentHtml, userText) {
  const req = extractModRequests(userText);
  let out = currentHtml;

  out = tweakTheme(out, req);

  const sections = [];

  if (req.addPricing) {
    sections.push(buildSection({
      title: "Pricing",
      bodyHtml: `
        <div class="item"><div><strong>Starter</strong><div class="meta">Good for trying it</div></div><div style="text-align:right"><div class="price">$9/mo</div><div class="meta">Core features</div></div></div>
        <div class="item"><div><strong>Pro</strong><div class="meta">Auto-preview + editing</div></div><div style="text-align:right"><div class="price">$29/mo</div><div class="meta">Best value</div></div></div>
        <div class="item"><div><strong>Team</strong><div class="meta">Collaboration</div></div><div style="text-align:right"><div class="price">$79/mo</div><div class="meta">Seats + roles</div></div></div>
      `.trim()
    }));
  }

  if (req.addTestimonials) {
    sections.push(buildSection({
      title: "Testimonials",
      bodyHtml: `
        <div class="item"><div><strong>“Fastest way I’ve built a UI.”</strong><div class="meta">Saved me hours.</div></div><div class="meta">— Customer</div></div>
        <div class="item"><div><strong>“Pro edits are the killer feature.”</strong><div class="meta">Feels like a real builder.</div></div><div class="meta">— Builder</div></div>
      `.trim()
    }));
  }

  if (req.addFaq) {
    sections.push(buildSection({
      title: "FAQ",
      bodyHtml: `
        <div class="item" style="display:block">
          <div><strong>Does Pro change the preview automatically?</strong></div>
          <div class="meta">Yes. Pro can add sections and update the current preview.</div>
        </div>
        <div class="item" style="display:block">
          <div><strong>Do saved builds sync across devices?</strong></div>
          <div class="meta">Right now it’s local to this device. Sync can be added next.</div>
        </div>
      `.trim()
    }));
  }

  if (req.addAuth) {
    sections.push(buildSection({
      title: "Auth",
      bodyHtml: `
        <div class="item"><div><strong>Login</strong><div class="meta">Email + password</div></div><div class="meta">Reset link</div></div>
        <div class="item"><div><strong>Sign up</strong><div class="meta">Create account</div></div><div class="meta">Verify email</div></div>
      `.trim()
    }));
  }

  if (req.addPayments) {
    sections.push(buildSection({
      title: "Payments",
      bodyHtml: `
        <div class="item"><div><strong>Checkout</strong><div class="meta">Card + Apple Pay</div></div><div class="meta">Stripe-ready</div></div>
        <div class="item"><div><strong>Billing</strong><div class="meta">Invoices + plan changes</div></div><div class="meta">Customer portal</div></div>
      `.trim()
    }));
  }

  if (req.addDashboard) {
    sections.push(buildSection({
      title: "Dashboard",
      bodyHtml: `
        <div class="item"><div><strong>Key metrics</strong><div class="meta">Revenue, users, conversion</div></div><div class="meta">Weekly view</div></div>
        <div class="item"><div><strong>Activity</strong><div class="meta">New builds + saves</div></div><div class="meta">Live feed</div></div>
      `.trim()
    }));
  }

  if (req.addMessaging) {
    sections.push(buildSection({
      title: "Messaging",
      bodyHtml: `
        <div class="item"><div><strong>Inbox</strong><div class="meta">Conversations list</div></div><div class="meta">Unread badges</div></div>
        <div class="item"><div><strong>Thread</strong><div class="meta">Quick replies + attachments</div></div><div class="meta">Search</div></div>
      `.trim()
    }));
  }

  if (!sections.length) {
    // If modify intent but no recognized section, add a safe “Next” section
    sections.push(buildSection({
      title: "Next",
      bodyHtml: `
        <div class="item" style="display:block">
          <div><strong>Pro builder updated.</strong></div>
          <div class="meta">Tell me what to add: pricing, testimonials, FAQ, auth, payments, dashboard, messaging.</div>
        </div>
      `.trim()
    }));
  }

  const injection = `
  <!-- PRO_EDIT: injected by Simo -->
  ${sections.join("\n")}
  `.trim();

  out = injectBeforeBodyClose(out, injection);
  return out;
}

/* ---------------------------- Serper tools --------------------------- */

async function serperWebSearch(query, apiKey) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 6 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || `Serper HTTP ${res.status}` };

  const organic = Array.isArray(data?.organic) ? data.organic.slice(0, 6) : [];
  const top = organic.map((r) => ({
    title: r.title || "",
    link: r.link || "",
    snippet: r.snippet || "",
  })).filter(x => x.title || x.link || x.snippet);

  return { ok: true, top };
}

// lookup includes weather/forecast/temp
function seemsLikeLookup(text = "") {
  const t = normalize(text);
  return /\b(look up|lookup|search|find|near me|addresses|phone number|website|hours|weather|forecast|temperature|temp)\b/.test(t);
}

/* ---------------------------- OpenAI helpers -------------------------- */

function extractOutputText(respJson) {
  const out = respJson?.output || [];
  return out
    .flatMap((o) => o?.content || [])
    .filter((c) => c?.type === "output_text")
    .map((c) => c?.text || "")
    .join("\n")
    .trim();
}

/* ------------------------- Server memory (Blobs) ---------------------- */

async function getMemoryStore() {
  const mod = await import("@netlify/blobs");
  return mod.getStore("simo-memory");
}

function looksLikeJunkTopic(topic) {
  const t = normalize(topic);
  return !t || t === "none" || t === "continue that app" || t === "continue" || t === "resume" || t === "keep going";
}

/* ------------------------------ Handler ------------------------------ */

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY env var" }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const action = (body.action || "").toString();
    const userId = (body.user_id || "").toString();
    const pro = !!body.pro;

    if (action === "forget" && userId) {
      try {
        const store = await getMemoryStore();
        await store.delete(userId);
      } catch {}
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, mode: "bestfriend", reply: "Forgot.", preview_kind: "", preview_html: "" }),
      };
    }

    const userText = (body.message || "").toString();
    const history = Array.isArray(body.history) ? body.history : [];
    const clientMode = (body.mode || "auto").toString();
    const clientTopic = (body.topic || "").toString();
    const currentPreviewHtml = (body.current_preview_html || "").toString();

    if (!userText.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing message" }) };
    }

    // Load server memory
    let mem = null;
    if (userId) {
      try {
        const store = await getMemoryStore();
        mem = await store.get(userId, { type: "json" });
      } catch { mem = null; }
    }

    const intent = detectIntent(userText);

    // Choose effective topic
    const savedTopic = (mem?.last_topic || "").toString();
    const effectiveTopic = looksLikeJunkTopic(clientTopic) ? savedTopic : (clientTopic || savedTopic);

    // 1) Switch topics
    if (intent === "switch") {
      if (userId) {
        try {
          const store = await getMemoryStore();
          await store.setJSON(userId, {
            preferred_mode: "bestfriend",
            last_topic: effectiveTopic || "",
            project_brief: mem?.project_brief || "",
            updated_at: new Date().toISOString()
          });
        } catch {}
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "bestfriend",
          reply: "Understood. What do you want to do next — venting, solving, or building?",
          preview_kind: "",
          preview_html: "",
        }),
      };
    }

    // ✅ PRO CONTINUE/EDIT CURRENT PREVIEW (structured injection)
    // Pro-only, Building-only, requires existing preview HTML from client.
    const proCanEdit =
      pro &&
      intent === "building" &&
      !!currentPreviewHtml.trim() &&
      looksLikeModify(userText);

    if (proCanEdit) {
      const updated = applyStructuredEdits(currentPreviewHtml, userText);
      const kind = detectPreviewKind(userText, effectiveTopic || (mem?.last_topic || ""));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "builder",
          reply: "Pro edit applied. Preview updated on the right.",
          preview_kind: kind,
          preview_html: updated,
        }),
      };
    }

    // ✅ Pro auto-preview (if Pro is ON and building intent but user didn’t ask for preview)
    const proAutoPreview =
      pro &&
      intent === "building" &&
      !wantsPreview(userText);

    // 2) Preview fast path (explicit OR Pro auto-preview)
    if (wantsPreview(userText) || proAutoPreview) {
      const kind = detectPreviewKind(userText, effectiveTopic);
      const brief =
        kind === "space_renting_app"
          ? "Space renting app (driveway/garage/parking/extra space): search + filters + listing cards with price/availability + map placeholder + booking panel + messaging + host dashboard."
          : (mem?.project_brief || "");

      if (userId) {
        try {
          const store = await getMemoryStore();
          await store.setJSON(userId, {
            preferred_mode: "builder",
            last_topic: effectiveTopic || kind || "",
            project_brief: brief,
            updated_at: new Date().toISOString()
          });
        } catch {}
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "builder",
          reply: proAutoPreview
            ? "Pro auto-preview is on. I rendered a preview on the right. Want it simpler or more detailed?"
            : "Preview is on the right. Do you want it simpler or more detailed?",
          preview_kind: kind,
          preview_html: buildPreviewHtml(kind, userText),
        }),
      };
    }

    // 3) Web lookup context
    let toolContext = "";
    if (SERPER_API_KEY && seemsLikeLookup(userText)) {
      const s = await serperWebSearch(userText, SERPER_API_KEY);
      if (s.ok && s.top?.length) {
        toolContext =
          "Live web results (use as facts; include direct links in reply):\n" +
          s.top.map((r, i) => `${i + 1}. ${r.title}\n${r.link}\n${r.snippet}`.trim()).join("\n\n");
      }
    }

    const cleanedHistory = history
      .slice(-18)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    const inferredMode =
      intent === "venting" ? "bestfriend" :
      intent === "building" ? "builder" :
      intent === "solving" ? "builder" :
      intent === "continue" ? "builder" :
      (clientMode === "builder" || clientMode === "bestfriend") ? clientMode :
      "bestfriend";

    const memoryBlock = (userId && mem)
      ? `Saved user memory:
- preferred_mode: ${mem?.preferred_mode || "auto"}
- last_topic: ${mem?.last_topic || ""}
- project_brief: ${mem?.project_brief || ""}`.trim()
      : "";

    const SYSTEM_PROMPT = `
You are Simo — a private best-friend + creator hybrid.

Voice (non-negotiable):
- Calm, steady, and clear. Professional, but warm.
- No hype. No slang-heavy talk. No therapy-speak.
- Short sentences. Clean formatting.
- Do NOT use markdown headings (no ###, ####) or long outlines.
- Use short numbered steps only when needed. Otherwise write plain paragraphs.
- Ask at most ONE question when the user is venting.

Core capability:
- Handle ANY topic.
- If you cannot fetch something live, do not hand-wave. Offer the best practical alternative (steps, templates, sources, options).

Special rule for "continue/resume":
- If the user says "continue", assume they mean the last active project from memory (last_topic / project_brief).
- Do NOT ask "what app?" unless there is truly no saved project_brief.
- Continue from the last project_brief and move it forward one milestone.
- Be concrete: next screens, data model, API endpoints, or build steps.
- Do NOT restart with generic "define features / choose tech stack".

Intent handling:
1) Venting: validate (1–2 sentences) + ask ONE question.
2) Solving: diagnosis + step-by-step checklist.
3) Building: provide a clean plan with next actions.

Relationship rule:
- If user says "wife", refer to her as wife (never “friendship”).

Output requirements:
Return ONLY valid JSON (no markdown) with EXACT keys:
{"mode":"bestfriend"|"builder","reply":"...","preview_kind":"","preview_html":""}

Preview rules:
- preview_html must be "" unless user explicitly asks for preview/mockup/ui/layout.
`.trim();

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(memoryBlock ? [{ role: "system", content: memoryBlock }] : []),
      ...(toolContext ? [{ role: "system", content: toolContext }] : []),
      ...cleanedHistory,
      { role: "user", content: userText },
    ];

    const openaiResp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: messages,
        temperature: 0.5,
        max_output_tokens: 750,
      }),
    });

    const data = await openaiResp.json().catch(() => ({}));
    if (!openaiResp.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "OpenAI error",
          status: openaiResp.status,
          details: data?.error || data,
        }),
      };
    }

    const outText = extractOutputText(data);
    const parsed = safeJsonParse(outText);

    const mode =
      parsed?.mode === "builder" ? "builder" :
      parsed?.mode === "bestfriend" ? "bestfriend" :
      inferredMode === "builder" ? "builder" : "bestfriend";

    let reply =
      typeof parsed?.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : (outText || "Reset. I’m here.");

    reply = reply.replace(/^\s*#{1,6}\s+/gm, "").trim();

    const previewAllowed = wantsPreview(userText);
    const preview_html =
      previewAllowed && typeof parsed?.preview_html === "string" ? parsed.preview_html : "";

    const preview_kind =
      previewAllowed && typeof parsed?.preview_kind === "string" ? parsed.preview_kind : "";

    // Save memory
    if (userId) {
      try {
        const store = await getMemoryStore();
        const nextTopic = effectiveTopic || mem?.last_topic || "";
        const nextBrief = mem?.project_brief || "";
        await store.setJSON(userId, {
          preferred_mode: mode,
          last_topic: nextTopic,
          project_brief: nextBrief,
          updated_at: new Date().toISOString()
        });
      } catch {}
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        mode,
        reply,
        preview_kind,
        preview_html,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "Server crash",
        details: String(err?.message || err),
      }),
    };
  }
};
