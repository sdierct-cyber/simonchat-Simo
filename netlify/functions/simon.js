export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Use POST" });
    }

    const {
      message = "",
      history = [],
      tz = "America/Detroit",
      zip = "",
      builderCount = 0
    } = JSON.parse(event.body || "{}");

    const text = String(message || "").trim();
    if (!text) return json(400, { error: "Missing message" });

    const intent = detectIntent(text);

    // Stop image-generation loops HARD.
    if (intent === "image") {
      return json(200, {
        reply:
          "I can’t generate images in this chat right now. If you tell me what you’re trying to make, I’ll help you write a killer prompt — but I won’t spin in an image loop."
      });
    }

    // Math: answer only
    if (intent === "math") {
      const ans = safeMath(text);
      if (ans.ok) return json(200, { reply: String(ans.value) });

      const reply = await callOpenAI({
        tz,
        zip,
        history,
        userText: text,
        mode: "math"
      });
      return json(200, { reply: cleanup(reply) });
    }

    // Time: local time (no model)
    if (intent === "time") {
      const now = new Date();
      const timeFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit"
      });
      const dateFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "long",
        day: "numeric"
      });

      return json(200, { reply: `It’s ${timeFmt.format(now)} — ${dateFmt.format(now)} (${tz}).` });
    }

    // Weather: real weather via ZIP
    if (intent === "weather") {
      const z = extractZip(text) || String(zip || "").trim();
      if (!z) {
        return json(200, { reply: "Tell me your ZIP (like 48044) and I’ll pull the weather." });
      }
      const w = await getWeatherByZip(z);
      if (!w.ok) {
        return json(200, { reply: `I couldn’t pull weather for ${z}. Try again or confirm the ZIP.` });
      }
      return json(200, { reply: w.reply });
    }

    // Build/design/code: paid gate, but human + varied + matched to request
    if (intent === "build") {
      const t = text.toLowerCase();

      let thing = "that";
      if (/\bwebsite\b|\bsite\b|\blanding page\b/.test(t)) thing = "a website";
      else if (/\bapp\b|\bapplication\b/.test(t)) thing = "an app";
      else if (/\bcode\b|\bscript\b|\bprogram\b/.test(t)) thing = "some code";
      else if (/\bui\b|\bmockup\b|\bwireframe\b|\bdesign\b/.test(t)) thing = "a design";

      const openers = [
        `Yeah — I can help you with ${thing}.`,
        `Alright. I can do ${thing} with you.`,
        `Got you. I can help build ${thing}.`
      ];

      const teases = [
        `I’ll start with a quick plan: pages + features + what to build first.`,
        `I’ll map the steps and keep it simple so you can actually ship it.`,
        `I’ll sketch the blueprint (fast) and what we’d build in phase 1.`
      ];

      // rotate even if the same message repeats (uses builderCount from the browser)
      const pick = (arr) => arr[(Math.abs(hash(text)) + Number(builderCount || 0)) % arr.length];

      const opener = pick(openers);
      const tease = pick(teases);

      return json(200, {
        reply:
          `${opener} That’s a Builder thing (paid).\n\n` +
          `${tease}\n\n` +
          `One sentence: what are we making + who’s it for?`
      });
    }

    // Everything else: best-friend human tone via model
    const reply = await callOpenAI({
      tz,
      zip,
      history,
      userText: text,
      mode: "chat"
    });

    return json(200, { reply: cleanup(reply) });
  } catch (err) {
    return json(500, { error: err?.message || String(err) });
  }
}

// -----------------------------
// Helpers
// -----------------------------
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(obj)
  };
}

function detectIntent(text) {
  const t = text.toLowerCase().trim();

  // image requests / loops
  if (/\b(generate|make|create|draw|render)\b.*\b(image|picture|photo|cover|logo|art)\b/.test(t)) return "image";
  if (/\bimage\b/.test(t) && /\b(loop|stuck)\b/.test(t)) return "image";

  // time (covers natural phrasing like "what is my time")
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

  // build/design/code requests
  if (/\b(build|code|program|make an app|design an app|website|ui mockup|wireframe|html|css|javascript|react|backend)\b/.test(t))
    return "build";

  // math-ish: quick heuristic
  if (looksLikeMath(t)) return "math";

  return "chat";
}

function looksLikeMath(t) {
  // 217*22, 217 x 22, (2+3)*5, 10/2, etc.
  if (/^\s*[-+()0-9.\s]+([x*\/^+-]\s*[-+()0-9.\s]+)+\s*$/.test(t)) return true;
  if (/\b(multiplied by|times|divided by|plus|minus)\b/.test(t) && /[0-9]/.test(t)) return true;
  return false;
}

function safeMath(input) {
  try {
    let t = input.toLowerCase().trim();
    t = t.replace(/\bx\b/g, "*");
    t = t.replace(/\bmultiplied by\b/g, "*");
    t = t.replace(/\btimes\b/g, "*");
    t = t.replace(/\bdivided by\b/g, "/");
    t = t.replace(/\bplus\b/g, "+");
    t = t.replace(/\bminus\b/g, "-");
    t = t.replace(/[^0-9+\-*/(). ^]/g, "");
    t = t.replace(/\^/g, "**");

    if (t.length > 80) return { ok: false };

    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${t});`)();
    if (typeof val !== "number" || !Number.isFinite(val)) return { ok: false };

    const out = Math.abs(val) < 1e15 ? Number(val.toPrecision(15)) : val;
    return { ok: true, value: out };
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
      `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
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

    return {
      ok: true,
      reply: `Right now in ${name} (${zip}): ${temp}°F (feels like ${feels}°F). Wind ${wind} mph. Precip ${precip} in.`
    };
  } catch {
    return { ok: false };
  }
}

function cleanup(s) {
  let out = String(s || "")
    .replace(/^\s*(simo:|assistant:)\s*/i, "")
    .trim();

  // remove robotic filler openings
  out = out.replace(/^(sure|absolutely|of course|certainly|great|no problem)[.!]?\s+
