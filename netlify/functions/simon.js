// netlify/functions/simon.js

const OPENAI_URL = "https://api.openai.com/v1/responses";

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function detectPreviewKind(text = "") {
  const t = text.toLowerCase();
  if (t.includes("resume") || t.includes("cv")) return "resume";
  if (t.includes("space renting") || t.includes("driveway") || t.includes("garage") || t.includes("rent out space"))
    return "space_renting_app";
  if (t.includes("home") && (t.includes("layout") || t.includes("floor plan"))) return "home_layout";
  if (t.includes("landing page")) return "landing_page";
  return "generic_app";
}

function buildPreviewHtml(kind, userText) {
  const titleMap = {
    space_renting_app: "Space Renting App",
    resume: "Resume Layout",
    home_layout: "2-Story Home Layout",
    landing_page: "Landing Page",
    generic_app: "App Preview",
  };

  const title = titleMap[kind] || "Preview";
  const subtitle = escapeHtml(userText).slice(0, 140);

  const shell = (inner) => `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#0b1020;color:#eaf0ff;height:100%;padding:18px;box-sizing:border-box;">
    <div style="max-width:920px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;">
        <div>
          <div style="font-size:22px;font-weight:900;letter-spacing:.3px;">${escapeHtml(title)}</div>
          <div style="font-size:12px;color:rgba(234,240,255,.65);margin-top:4px;">${subtitle}</div>
        </div>
        <div style="font-size:12px;color:rgba(234,240,255,.65);">Preview • static mockup</div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0 16px;"></div>
      ${inner}
    </div>
  </div>`;

  if (kind === "space_renting_app") {
    return shell(`
      <div style="display:grid;grid-template-columns: 1.4fr .9fr;gap:14px;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;">
            <div style="font-size:12px;color:rgba(234,240,255,.7);margin-bottom:8px;">Search</div>
            <div style="display:flex;gap:10px;">
              <div style="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">
                🔎 City / Zip / Address
              </div>
              <div style="background:#2a66ff;border-radius:10px;padding:10px 14px;font-weight:800;">Search</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
              ${["Driveway", "Garage", "Lot", "EV-Ready", "Covered", "24/7"].map(chip => `
                <div style="border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:999px;padding:6px 10px;font-size:12px;color:rgba(234,240,255,.8);">${chip}</div>
              `).join("")}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${[
              { price:"$12/day", name:"Wide Driveway • Quiet Street", meta:"0.6 mi • Available tonight" },
              { price:"$18/day", name:"Covered Spot • Security Cam", meta:"1.1 mi • 7am–7pm" },
              { price:"$9/day",  name:"Side Lot • Easy Access", meta:"0.9 mi • Weekends" },
              { price:"$22/day", name:"Garage Space • EV Outlet", meta:"2.3 mi • 24/7" },
            ].map(card => `
              <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                  <div style="font-weight:900;">${escapeHtml(card.name)}</div>
                  <div style="font-weight:900;color:#39d98a;">${escapeHtml(card.price)}</div>
                </div>
                <div style="margin-top:6px;color:rgba(234,240,255,.70);font-size:12px;">${escapeHtml(card.meta)}</div>
                <div style="margin-top:10px;display:flex;gap:8px;">
                  <div style="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:8px 10px;font-size:12px;color:rgba(234,240,255,.75);">Map preview</div>
                  <div style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px;font-size:12px;">Details</div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
            <div style="font-weight:900;margin-bottom:10px;">Map</div>
            <div style="height:180px;border-radius:12px;background:linear-gradient(135deg, rgba(42,102,255,.35), rgba(0,0,0,.35));border:1px solid rgba(255,255,255,.10);display:flex;align-items:center;justify-content:center;color:rgba(234,240,255,.75);">
              Map placeholder
            </div>
          </div>

          <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
            <div style="font-weight:900;margin-bottom:10px;">Booking</div>
            <div style="display:grid;gap:8px;">
              <div style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">Dates: Select</div>
              <div style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">Vehicle: Select</div>
              <div style="display:flex;gap:10px;">
                <div style="flex:1;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;text-align:center;">Message host</div>
                <div style="flex:1;background:#2a66ff;border-radius:10px;padding:10px;text-align:center;font-weight:900;">Book</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  // simple resume fallback
  if (kind === "resume") {
    return shell(`
      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:16px;">
        <div style="font-size:28px;font-weight:900;">Your Name</div>
        <div style="margin-top:6px;color:rgba(234,240,255,.75);font-size:13px;">
          Email • Phone • City, State • LinkedIn
        </div>
        <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0;"></div>
        <div style="font-weight:900;margin-bottom:8px;">Experience</div>
        <div style="background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;color:rgba(234,240,255,.78);font-size:13px;">
          Job Title • Company • Dates
          <ul style="margin:8px 0 0 18px;line-height:1.45;">
            <li>Impact bullet</li><li>Leadership / projects</li><li>Tools / systems</li>
          </ul>
        </div>
      </div>
    `);
  }

  return shell(`<div style="color:rgba(234,240,255,.75);">Preview ready. Tell me what you want shown.</div>`);
}

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
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY env var" }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const userText = (body.message || "").toString();
    const history = Array.isArray(body.history) ? body.history : [];
    if (!userText.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing message" }) };
    }

    const lower = userText.toLowerCase();
    const wantsPreview =
      /\bshow me\b.*\b(preview|mockup|ui|layout)\b/.test(lower) ||
      /\b(show|make|build|generate|create)\b.*\b(preview|mockup|ui|layout)\b/.test(lower);

    const switchTopic =
      /\bswitch topics?\b/.test(lower) || /\bswitch topis?\b/.test(lower) || /\bswutch topics?\b/.test(lower);

    const builderTrigger =
      wantsPreview ||
      /\b(design|build|create|make)\b.*\b(app|website|site|ui|dashboard|landing|product|feature|resume)\b/.test(lower) ||
      /\b(space renting app|rent(ing)? space|driveway rental|garage rental)\b/.test(lower);

    // If they asked for a preview, DO IT locally, no excuses, no waiting on the model.
    if (wantsPreview) {
      const kind = detectPreviewKind(userText);
      const preview_html = buildPreviewHtml(kind, userText);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "builder",
          reply: "Preview’s on the right. Want it more simple or more Airbnb-style?",
          preview_html,
        }),
      };
    }

    // Keep "switch topics" tight
    if (switchTopic) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "bestfriend",
          reply: "Bet. What do you wanna talk about now — venting, solving, or building?",
          preview_html: "",
        }),
      };
    }

    const SYSTEM_PROMPT = `
You are Simo — a private best-friend AI.

Rules:
- Sound like a real friend, not a therapist.
- If user is venting: validate + ask ONE direct question. No lectures.
- If user asks for advice: give 1–2 options, short and real.
- If user says "wife", refer to her as wife (never “friendship”).

Builder:
- If user asks to design/build/create an app/site/etc: be quick. Offer to show a preview (but do NOT generate it unless they ask).
Return ONLY valid JSON with EXACT keys:
{"mode":"bestfriend"|"builder","reply":"...","preview_html":""}
No extra keys. No markdown.
`.trim();

    const cleanedHistory = history
      .slice(-16)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    const input = [
      { role: "system", content: SYSTEM_PROMPT },
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
        input,
        temperature: 0.6,
        max_output_tokens: 600,
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

    const outText = (data.output || [])
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    let parsed;
    try { parsed = JSON.parse(outText); }
    catch {
      parsed = { mode: builderTrigger ? "builder" : "bestfriend", reply: outText || "Reset. I’m here.", preview_html: "" };
    }

    const mode = parsed.mode === "builder" ? "builder" : "bestfriend";
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Reset. I’m here.";

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, mode, reply, preview_html: "" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "Server crash", details: String(err?.message || err) }) };
  }
};
