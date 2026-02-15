// netlify/functions/simon.js
// Simo backend: calm+professional best-friend core + intent router + previews + (optional) Serper web+image search.
// Uses OpenAI Responses API: https://api.openai.com/v1/responses
//
// ENV VARS in Netlify:
// - OPENAI_API_KEY   (required)
// - OPENAI_MODEL     (optional, default: gpt-4.1-mini)
// - SERPER_API_KEY   (optional, enables web + image lookup)

const OPENAI_URL = "https://api.openai.com/v1/responses";

// Open-Meteo (no API key required)
const OM_GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OM_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

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

/* --------------------------- Intent routing -------------------------- */

function detectIntent(text = "") {
  const t = normalize(text);

  if (/\bswitch topics?\b/.test(t)) return "switch";
  if (/\b(show me|preview|mockup|ui|layout|wireframe)\b/.test(t)) return "building";
  if (/\b(stressed|anxious|tired|overwhelmed|upset|mad|angry|sad|fight|argu(ment|ing))\b/.test(t)) return "venting";
  if (/\b(help me|how do i|fix|debug|error|issue|broken)\b/.test(t)) return "solving";
  if (/\b(build|design|make|create|generate)\b/.test(t)) return "building";

  return "auto";
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

async function serperImageSearch(query, apiKey) {
  const res = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || `Serper HTTP ${res.status}` };

  const imgs = Array.isArray(data?.images) ? data.images.slice(0, 10) : [];
  const top = imgs.map((r) => ({
    title: r.title || "",
    link: r.link || "",
    imageUrl: r.imageUrl || r.image || "",
    source: r.source || "",
  })).filter(x => x.link || x.imageUrl);

  return { ok: true, top };
}

function wantsImages(text = "") {
  const t = normalize(text);
  return (
    /\b(images?|photos?|pictures?|wallpapers?)\b/.test(t) ||
    /\b(high\s*res|4k|8k|hd)\b/.test(t)
  );
}

function seemsLikeLookup(text = "") {
  const t = normalize(text);
  return /\b(look up|lookup|search|find|near me|addresses|phone number|website|hours)\b/.test(t);
}

/* ---------------------------- Weather tools -------------------------- */

function wantsWeather(text = "") {
  const t = normalize(text);
  return /\b(weather|forecast|temperature|temp|snow|rain|wind|humidity)\b/.test(t);
}

function extractUSZip(text = "") {
  const m = String(text).match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : "";
}

function extractLocationPhrase(text = "") {
  const t = String(text || "");
  const m =
    t.match(/\b(?:weather|forecast|temperature)\s+(?:in|for|at)\s+([a-zA-Z0-9 .,'-]{2,60})\b/) ||
    t.match(/\b(?:in|for|at)\s+([a-zA-Z0-9 .,'-]{2,60})\s+(?:weather|forecast)\b/);
  return m ? String(m[1]).trim() : "";
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.reason || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function weatherCodeToText(code) {
  const map = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Violent rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm w/ hail",
    99: "Thunderstorm w/ heavy hail",
  };
  return map[code] || `Weather code ${code}`;
}

function cToF(c) { return (c * 9) / 5 + 32; }

async function geocodePlace(place) {
  const url = new URL(OM_GEO_URL);
  url.searchParams.set("name", place);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("country", "US");
  const data = await fetchJson(url.toString());
  const r = Array.isArray(data?.results) ? data.results[0] : null;
  if (!r) return null;
  return {
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone || "auto",
  };
}

async function getWeatherByCoords({ lat, lon, timezone = "auto" }) {
  const url = new URL(OM_FORECAST_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", timezone);

  const data = await fetchJson(url.toString());
  const cw = data?.current_weather;
  const daily = data?.daily;
  if (!cw) return null;

  const tempF = cToF(Number(cw.temperature));
  const windMph = Number(cw.windspeed) * 0.621371;
  const desc = weatherCodeToText(Number(cw.weathercode));

  const hiC = daily?.temperature_2m_max?.[0];
  const loC = daily?.temperature_2m_min?.[0];
  const pop = daily?.precipitation_probability_max?.[0];

  const hiF = typeof hiC === "number" ? cToF(hiC) : null;
  const loF = typeof loC === "number" ? cToF(loC) : null;

  return { desc, tempF, windMph, hiF, loF, pop: typeof pop === "number" ? pop : null };
}

function formatWeatherReply(placeLabel, w) {
  const parts = [];
  parts.push(`Right now${placeLabel ? ` in ${placeLabel}` : ""}: ${Math.round(w.tempF)}°F • ${w.desc}.`);
  parts.push(`Wind: ${Math.round(w.windMph)} mph.`);
  if (typeof w.hiF === "number" && typeof w.loF === "number") {
    parts.push(`Today: high ${Math.round(w.hiF)}°F / low ${Math.round(w.loF)}°F.`);
  }
  if (typeof w.pop === "number") {
    parts.push(`Precip chance: ${Math.round(w.pop)}%.`);
  }
  return parts.join(" ");
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

    const userText = (body.message || "").toString();
    const history = Array.isArray(body.history) ? body.history : [];
    const clientMode = (body.mode || "auto").toString();
    const clientTopic = (body.topic || "").toString();

    // Optional browser coords
    const coords = body && typeof body.coords === "object" ? body.coords : null;
    const lat = coords && typeof coords.lat === "number" ? coords.lat : null;
    const lon = coords && typeof coords.lon === "number" ? coords.lon : null;

    if (!userText.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing message" }) };
    }

    const intent = detectIntent(userText);

    // 0) Weather fast-path (real fetch, no OpenAI tokens)
    if (wantsWeather(userText)) {
      try {
        if (typeof lat === "number" && typeof lon === "number") {
          const w = await getWeatherByCoords({ lat, lon, timezone: "auto" });
          if (w) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                ok: true,
                mode: "bestfriend",
                reply: formatWeatherReply("your area", w),
                preview_kind: "",
                preview_html: "",
              }),
            };
          }
        }

        const zip = extractUSZip(userText);
        const placePhrase = zip ? zip : extractLocationPhrase(userText);

        if (placePhrase) {
          const g = await geocodePlace(placePhrase);
          if (g) {
            const w = await getWeatherByCoords({ lat: g.lat, lon: g.lon, timezone: g.timezone || "auto" });
            if (w) {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  ok: true,
                  mode: "bestfriend",
                  reply: formatWeatherReply(g.name, w),
                  preview_kind: "",
                  preview_html: "",
                }),
              };
            }
          }
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            mode: "bestfriend",
            reply: "I can do weather two ways: (1) allow location in the browser, or (2) tell me your ZIP/city (example: “weather 48044”).",
            preview_kind: "",
            preview_html: "",
          }),
        };
      } catch {
        // fall through to normal flow
      }
    }

    // 1) Switch topics fast path
    if (intent === "switch") {
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

    // 2) Preview request fast path
    if (wantsPreview(userText)) {
      const kind = detectPreviewKind(userText, clientTopic);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "builder",
          reply: "Preview is on the right. Do you want it simpler or more detailed?",
          preview_kind: kind,
          preview_html: buildPreviewHtml(kind, userText),
        }),
      };
    }

    // 3) Image request using Serper Images
    if (SERPER_API_KEY && wantsImages(userText)) {
      const img = await serperImageSearch(userText, SERPER_API_KEY);
      if (img.ok && img.top?.length) {
        const top6 = img.top.slice(0, 6);
        const lines = top6.map((r, i) => {
          const title = r.title ? r.title : "Image";
          const src = r.source ? ` — ${r.source}` : "";
          const url = r.link || r.imageUrl || "";
          return `${i + 1}) ${title}${src}\n${url}`;
        }).join("\n\n");

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            mode: "builder",
            reply:
              `Here are high-resolution results:\n\n${lines}\n\nDo you want close-ups, rings, Cassini shots, or wallpaper-style?`,
            preview_kind: "",
            preview_html: "",
          }),
        };
      }
    }

    // 4) Web lookup using Serper
    let toolContext = "";
    if (SERPER_API_KEY && seemsLikeLookup(userText)) {
      const s = await serperWebSearch(userText, SERPER_API_KEY);
      if (s.ok && s.top?.length) {
        toolContext =
          "Live web results (use as facts; include direct links in reply):\n" +
          s.top.map((r, i) => `${i + 1}. ${r.title}\n${r.link}\n${r.snippet}`.trim()).join("\n\n");
      }
    }

    // Clean history
    const cleanedHistory = history
      .slice(-18)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    const inferredMode =
      intent === "venting" ? "bestfriend" :
      intent === "building" ? "builder" :
      intent === "solving" ? "builder" :
      (clientMode === "builder" || clientMode === "bestfriend") ? clientMode :
      "bestfriend";

    // ChatGPT-like guardrails live here (this is the “voice + behavior setting”)
    const SYSTEM_PROMPT = `
You are Simo — a private best-friend + creator hybrid.

Language:
- Respond in the same language as the user.
- If the user mixes languages, follow their lead.

Voice (non-negotiable):
- Calm, steady, and clear. Professional, but warm.
- No hype. No slang-heavy talk. No therapy-speak.
- Short sentences. Clean formatting.
- When you don't have enough info, ask ONE question, not five.

Core capability:
- Handle ANY topic. The user can ask anything.
- If you cannot fetch something live, say so plainly, then offer the best practical alternative.
- When the user wants something built, provide structure and next actions.

Intent handling:
1) Venting:
   - Validate briefly (1–2 sentences max).
   - Name the dynamic (loop, escalation, avoidance, imbalance).
   - Avoid generic therapy phrases (“communicate better”, “set boundaries”, “consider setting aside time”).
   - Ask ONE sharp, grounded question.
   - Sound like a steady private best friend, not a counselor.
2) Solving:
   - Give a short diagnosis + a clear step-by-step fix.
   - Prefer checklists.
3) Building:
   - Provide a clean plan (sections/bullets).
   - Offer: “Say ‘show me a preview’ and I’ll render it in the Workspace.”

Relationship rule:
- If user says "wife", refer to her as wife (never “friendship”).

Output requirements:
Return ONLY valid JSON (no markdown) with EXACT keys:
{"mode":"bestfriend"|"builder","reply":"...","preview_kind":"","preview_html":""}

Preview rules:
- preview_html must be "" unless the user explicitly asks for preview/mockup/ui/layout.
- If user asks for preview, keep the reply short and let the UI render preview_html.

If system provides “Live web results”, use them and include direct links.
`.trim();

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...cleanedHistory,
      ...(toolContext ? [{ role: "system", content: toolContext }] : []),
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

    const reply =
      typeof parsed?.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : (outText || "Reset. I’m here.");

    const previewAllowed = wantsPreview(userText);
    const preview_html =
      previewAllowed && typeof parsed?.preview_html === "string" ? parsed.preview_html : "";

    const preview_kind =
      previewAllowed && typeof parsed?.preview_kind === "string" ? parsed.preview_kind : "";

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
