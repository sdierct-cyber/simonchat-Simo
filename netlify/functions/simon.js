// netlify/functions/simon.js (Netlify-safe CommonJS baseline)

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") return j(405, { error: "Use POST" });

    const body = JSON.parse(event.body || "{}");
    const text = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const tz = String(body.tz || "America/Detroit");
    const zip = String(body.zip || "");

    if (!text) return j(400, { error: "Missing message" });

    const intent = detectIntent(text);

    // Image loop stopper
    if (intent === "image") {
      return j(200, {
        reply:
          "I can’t generate images in this chat right now. Tell me what you want and I’ll write a strong prompt — but I won’t spin in an image loop."
      });
    }

    // Math: answer only (no model)
    if (intent === "math") {
      const ans = safeMath(text);
      if (ans.ok) return j(200, { reply: String(ans.value) });
      // if it doesn't parse clean, fall back to model
      const reply = await callOpenAI({ tz, zip, history, userText: text, mode: "math" });
      return j(200, { reply: cleanup(reply) });
    }

    // Time: local (no model)
    if (intent === "time") {
      const now = new Date();
      const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
      const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
      return j(200, { reply: `It’s ${timeFmt.format(now)} — ${dateFmt.format(now)} (${tz}).` });
    }

    // Weather: ZIP → coords → current weather (no model)
    if (intent === "weather") {
      const z = extractZip(text) || zip.trim();
      if (!z) return j(200, { reply: "Tell me your ZIP (like 48044) and I’ll pull the weather." });

      const w = await getWeatherByZip(z);
      if (!w.ok) return j(200, { reply: `I couldn’t pull weather for ${z}. Try again or confirm the ZIP.` });
      return j(200, { reply: w.reply });
    }

    // Builder gate: ALWAYS returns locally (no model)
    if (intent === "build") {
      const t = text.toLowerCase();
      let thing = "that";
      if (/\bwebsite\b|\bsite\b|\blanding page\b/.test(t)) thing = "a website";
      else if (/\bapp\b|\bapplication\b/.test(t)) thing = "an app";
      else if (/\bcode\b|\bscript\b|\bprogram\b/.test(t)) thing = "some code";
      else if (/\bui\b|\bmockup\b|\bwireframe\b|\bdesign\b/.test(t)) thing = "a design";

      return j(200, {
        reply:
          `Yeah — I can help you with ${thing}. That’s a Builder thing (paid).\n\n` +
          `One sentence: what are we making + who’s it for?`
      });
    }

    // Normal chat: OpenAI
    const reply = await callOpenAI({ tz, zip, history, userText: text, mode: "chat" });
    return j(200, { reply: cleanup(reply) });

  } catch (e) {
    return j(500, { error: e?.message || String(e) });
  }
};

function j(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj)
  };
}

function detectIntent(text) {
  const t = text.toLowerCase().trim();

  // image
  if (/\b(generate|make|create|draw|render)\b.*\b(image|picture|photo|cover|logo|art)\b/.test(t)) return "image";

  // time
  if (
    /\bwhat\s*(is|’s|'s)\s*(my\s*)?time\b/.test(t) ||
    /\bmy\s*time\b/.test(t) ||
    /\btime\s*now\b/.test(t) ||
    /\bwhat\s*time\b/.test(t) ||
    /\btime\s+is\s+it\b/.test(t) ||
    /\bcurrent\s+time\b/.test(t)
  ) return "time";

  // weather
  if (/\bweather\b|\bforecast\b|\btemperature\b|\brain\b|\bsnow\b/.test(t)) return "weather";

  // build
  if (/\b(build|code|program|website|app|ui mockup|wireframe|html|css|javascript|react|backend|design)\b/.test(t)) return "build";

  // math
  if (looksLikeMath(t)) return "math";

  return "chat";
}

function looksLikeMath(t) {
  if (/^\s*[-+()0-9.\s]+([x*\/^+-]\s*[-+()0-9.\s]+)+\s*$/.test(t)) return true;
  if (/\b(multiplied by|times|divided by|plus|minus)\b/.test(t) && /[0-9]/.test(t)) return true;
  return false;
}

function safeMath(input) {
  try {
    let t = input.toLowerCase().trim();
    t = t.replace(/\bx\b/g, "*")
      .replace(/\bmultiplied by\b/g, "*")
      .replace(/\btimes\b/g, "*")
      .replace(/\bdivided by\b/g, "/")
      .replace(/\bplus\b/g, "+")
      .replace(/\bminus\b/g, "-")
      .replace(/[^0-9+\-*/(). ^]/g, "")
      .replace(/\^/g, "**");

    if (t.length > 80) return { ok: false };

    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${t});`)();
    if (typeof val !== "number" || !Number.isFinite(val)) return { ok: false };

    return { ok: true, value: Math.abs(val) < 1e15 ? Number(val.toPrecision(15)) : val };
  } catch {
    return { ok: false };
  }
}

function extractZip(text) {
  const m = String(text).match(/\b(\d{5})(-\d{4})?\b/);
  return m ? m[1] : "";
}

async function getWeatherByZip(zip) {
  try {
    const z = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!z.ok) return { ok: false };
    const j = await z.json();
    const place = j?.places?.[0];
    const lat = Number(place?.latitude);
    const lon = Number(place?.longitude);
    const name = `${place["place name"]}, ${place["state abbreviation"]}`;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false };

    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`
    );
    if (!w.ok) return { ok: false };
    const data = await w.json();
    const c = data?.current;
    if (!c) return { ok: false };

    const temp = Math.round(c.temperature_2m);
    const feels = Math.round(c.apparent_temperature);
    const wind = Math.round(c.wind_speed_10m);
    const precip = c.precipitation ?? 0;

    return { ok: true, reply: `Right now in ${name} (${zip}): ${temp}°F (feels like ${feels}°F). Wind ${wind} mph. Precip ${precip} in.` };
  } catch {
    return { ok: false };
  }
}

function cleanup(s) {
  let out = String(s || "").replace(/^\s*(simo:|assistant:)\s*/i, "").trim();
  out = out.replace(/^(sure|absolutely|of course|certainly|great|no problem)[.!]?\s+/i, "");
  out = out.replace(/^here(’|')?s\b\s*/i, "");
  if (out.length > 900) out = out.slice(0, 900).trim();
  return out;
}

async function callOpenAI({ tz, zip, history, userText, mode }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in Netlify env vars");

  const msgs = [{ role: "system", content: buildSystemPrompt({ tz, zip, mode }) }];

  for (const m of history.slice(-18)) {
    if (!m || typeof m !== "object") continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    msgs.push({ role: m.role, content: String(m.content || "").slice(0, 1800) });
  }
  msgs.push({ role: "user", content: userText });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: msgs,
      temperature: mode === "math" ? 0 : 0.7,
      max_tokens: mode === "math" ? 40 : 400
    })
  });

  if (!res.ok) {
    const errText = aw
