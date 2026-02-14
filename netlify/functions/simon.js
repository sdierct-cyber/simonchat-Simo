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

// Very simple “what preview do they want?” detector
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

  const baseShell = (inner) => `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#0b1020;color:#eaf0ff;height:100%;padding:18px;box-sizing:border-box;">
    <div style="max-width:920px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;">
        <div>
          <div style="font-size:22px;font-weight:800;letter-spacing:.3px;">${escapeHtml(title)}</div>
          <div style="font-size:12px;color:rgba(234,240,255,.65);margin-top:4px;">${subtitle}</div>
        </div>
        <div style="font-size:12px;color:rgba(234,240,255,.65);">Preview • static mockup</div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0 16px;"></div>
      ${inner}
    </div>
  </div>`;

  if (kind === "space_renting_app") {
    return baseShell(`
      <div style="display:grid;grid-template-columns: 1.4fr .9fr;gap:14px;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;gap:10px;">
            <div style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;">
              <div style="font-size:12px;color:rgba(234,240,255,.7);margin-bottom:8px;">Search</div>
              <div style="display:flex;gap:10px;">
                <div style="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">
                  🔎 City / Zip / Address
                </div>
                <div style="background:#2a66ff;border-radius:10px;padding:10px 14px;font-weight:700;">Search</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                ${["Driveway", "Garage", "Lot", "EV-Ready", "Covered", "24/7"].map(chip => `
                  <div style="border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:999px;padding:6px 10px;font-size:12px;color:rgba(234,240,255,.8);">${chip}</div>
                `).join("")}
              </div>
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
                  <div style="font-weight:800;">${escapeHtml(card.name)}</div>
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

          <div style="background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.18);border-radius:14px;padding:14px;color:rgba(234,240,255,.7);font-size:12px;">
            Tip: This is just a UI mockup. Next step would be wiring search → listings → booking.
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
              <div style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">Dates: Feb 20 → Feb 21</div>
              <div style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">Vehicle: Sedan</div>
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

  if (kind === "resume") {
    return baseShell(`
      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:16px;">
        <div style="font-size:28px;font-weight:900;">Your Name</div>
        <div style="margin-top:6px;color:rgba(234,240,255,.75);font-size:13px;">
          Email • Phone • City, State • LinkedIn
        </div>
        <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0;"></div>

        <div style="font-weight:900;margin-bottom:8px;">Summary</div>
        <div style="color:rgba(234,240,255,.75);font-size:13px;line-height:1.4;">
          2–3 lines on experience, strengths, and what role you want.
        </div>

        <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0;"></div>

        <div style="font-weight:900;margin-bottom:8px;">Experience</div>
        <div style="display:grid;gap:10px;">
          <div style="background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;">
            <div style="display:flex;justify-content:space-between;gap:10px;">
              <div style="font-weight:800;">Job Title • Company</div>
              <div style="color:rgba(234,240,255,.65);font-size:12px;">Dates</div>
            </div>
            <ul style="margin:8px 0 0 18px;color:rgba(234,240,255,.75);font-size:13px;line-height:1.45;">
              <li>Impact bullet (numbers if possible)</li>
              <li>Leadership / projects</li>
              <li>Tools / systems</li>
            </ul>
          </div>
        </div>

        <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0;"></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <div style="font-weight:900;margin-bottom:8px;">Skills</div>
            <div style="color:rgba(234,240,255,.75);font-size:13px;line-height:1.5;">
              • Manufacturing • Leadership • Computer Skills • Problem Solving
            </div>
          </div>
          <div>
            <div style="font-weight:900;margin-bottom:8px;">Education</div>
            <div style="color:rgba(234,240,255,.75);font-size:13px;line-height:1.5;">
              Associate’s Degree • School • Year
            </div>
          </div>
        </div>
      </div>
    `);
  }

  // generic app fallback
  return baseShell(`
    <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:14px;">
      <div style="font-weight:900;">Generic App Mockup</div>
      <div style="margin-top:8px;color:rgba(234,240,255,.75);font-size:13px;">
        Ask: “show me a preview for <em>your idea</em>” and I’ll render a tailored UI here.
      </div>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <div style="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">Search / Input</div>
        <div style="background:#2a66ff;border-radius:10px;padding:10px 14px;font-weight:800;">Action</div>
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${[1,2,3,4].map(i => `
          <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;">
            <div style="font-weight:800;">Card ${i}</div>
            <div style="margin-top:6px;color:rgba(234,240,255,.70);font-size:12px;">Short description</div>
          </div>
        `).join("")}
      </div>
    </div>
  `);
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
      /\b(preview|mockup|ui|layout)\b/.test(lower) && /\bshow|make|build|generate|create\b/.test(lower);

    const switchTopic =
      /\bswitch topics?\b/.test(lower) || /\bswutch topics?\b/.test(lower) || /\bswitch topic\b/.test(lower);

    const builderTrigger =
      wantsPreview ||
      /\b(design|build|create|make)\b.*\b(app|website|site|ui|dashboard|landing|product|feature|resume)\b/.test(lower) ||
      /\b(space renting app|rent(ing)? space|driveway rental|garage rental)\b/.test(lower);

    // IMPORTANT: reduce therapy-speak, keep it like a real friend
    const SYSTEM_PROMPT = `
You are Simo — a private best-friend AI.

Style rules:
- Sound like a real friend, not a therapist. No “set aside time,” “calmer moment,” “learn to communicate,” etc unless the user asks for advice.
- Ask short, direct questions. Mirror the user’s tone. Keep it natural.

Modes:
- bestfriend (default): supportive + real + brief.
- builder: when user asks to design/build/create something tangible.

Preview:
- If user asks for a preview/mockup/layout, you MUST return preview_html as a complete HTML snippet.

Topic switching:
- If the user says “switch topics”, ask what they want next in ONE line.

Return ONLY valid JSON (no markdown) with EXACT keys:
{"mode":"bestfriend"|"builder","reply":"...","preview_html":"..."}
No extra keys.
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
        max_output_tokens: 900,
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
    try {
      parsed = JSON.parse(outText);
    } catch {
      parsed = { mode: builderTrigger ? "builder" : "bestfriend", reply: outText || "Reset. I’m here.", preview_html: "" };
    }

    let mode = parsed.mode === "builder" ? "builder" : "bestfriend";
    let reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Reset. I’m here.";
    let preview_html = typeof parsed.preview_html === "string" ? parsed.preview_html : "";

    // HARD GUARANTEE:
    // If user asked for a preview and the model forgot preview_html, we generate it locally.
    if (wantsPreview && !preview_html.trim()) {
      const kind = detectPreviewKind(userText);
      preview_html = buildPreviewHtml(kind, userText);
      mode = "builder";
      // Also make the reply actually acknowledge the preview
      reply = reply && reply.length > 3 ? reply : "Got you — preview is on the right. Want it more Airbnb-style or more Uber-simple?";
    }

    // If user explicitly says switch topics, keep it tight and don't generate previews
    if (switchTopic) {
      mode = "bestfriend";
      preview_html = ""; // (optional) clears panel if your UI uses this
      reply = "Bet. What do you wanna talk about now — venting, solving, or building?";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, mode, reply, preview_html }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: "Server crash", details: String(err?.message || err) }),
    };
  }
};
