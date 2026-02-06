/**
 * Netlify Function: simo
 * - GET returns healthcheck JSON (proves what's live)
 * - POST handles math/time/weather/loop + OpenAI chat
 * - Guards "recent news" questions so Simo won't guess on fresh events
 * - Uses Simo-toned guard messaging (no corporate / generic assistant tone)
 * - ASCII-only (prevents weird character syntax crashes)
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const VERSION = "simo-v1.4-recent-news-tone-locked";

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

function isProbablyZip(s) {
  return /^[0-9]{5}(-[0-9]{4})?$/.test(String(s || "").trim());
}

function looksLikeMath(s) {
  const t = String(s || "").toLowerCase();
  const hasNums = /(\d+(\.\d+)?)/.test(t);
  const hasOp = /(\+|\-|\*|\/|x|×|times|multiplied by|divided by|minus|plus)/.test(t);
  const notTooLong = t.length <= 60;
  return hasNums && hasOp && notTooLong;
}

function wantsSteps(s) {
  const t = String(s || "").toLowerCase();
  return /show work|show the work|steps|explain|how do you|get that|solve it/.test(t);
}

function evalBasicMath(exprRaw) {
  let expr = String(exprRaw || "").toLowerCase();
  expr = expr
    .replace(/multiplied by/g, "*")
    .replace(/times/g, "*")
    .replace(/[x×]/g, "*")
    .replace(/divided by/g, "/")
    .replace(/plus/g, "+")
    .replace(/minus/g, "-");

  // Only allow safe characters
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  if (/[*\/]{2,}/.test(expr)) return null;

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('"use strict"; return (' + expr + ");");
    const result = fn();
    if (typeof result !== "number" || !Number.isFinite(result)) return null;
    return result;
  } catch (e) {
    return null;
  }
}

function formatNumber(n) {
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return Number(n.toFixed(6)).toString();
}

// ZIP -> lat/lon using Zippopotam.us (US)
async function zipToLatLonUS(zip) {
  const url = "https://api.zippopotam.us/us/" + encodeURIComponent(zip);
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const place = data && data.places && data.places[0];
  if (!place) return null;

  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const label =
    String(place["place name"] || "") +
    ", " +
    String(place["state abbreviation"] || "") +
    " " +
    String(data["post code"] || "");

  return { lat, lon, label };
}

// Current weather via Open-Meteo
async function openMeteoCurrent(lat, lon) {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + encodeURIComponent(lat) +
    "&longitude=" + encodeURIComponent(lon) +
    "&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" +
    "&timezone=auto";

  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const c = data && data.current;
  if (!c) return null;

  return {
    tempF: c.temperature_2m,
    feelsF: c.apparent_temperature,
    windMph: c.wind_speed_10m,
    precipIn: c.precipitation,
    code: c.weather_code,
    tz: data.timezone,
  };
}

function codeToSummary(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "weather";
  if (c === 0) return "clear";
  if (c === 1 || c === 2) return "mostly clear";
  if (c === 3) return "cloudy";
  if (c === 45 || c === 48) return "foggy";
  if (c >= 51 && c <= 57) return "drizzle";
  if (c >= 61 && c <= 67) return "rain";
  if (c >= 71 && c <= 77) return "snow";
  if (c >= 80 && c <= 82) return "rain showers";
  if (c >= 85 && c <= 86) return "snow showers";
  if (c === 95) return "thunderstorms";
  if (c === 96 || c === 99) return "thunderstorms with hail";
  return "mixed conditions";
}

function detectIntent(message) {
  const t = String(message || "").toLowerCase();

  if (looksLikeMath(message)) return "math";
  if (/\bwhat time is it\b|\btime\b/.test(t)) return "time";
  if (/\bweather\b|\bforecast\b|\btemperature\b|\brain\b|\bsnow\b/.test(t)) return "weather";
  if (/\buse my location\b|\buse location\b|\blocation\b/.test(t)) return "location_request";
  if (/tired of (this )?(argument|loop)|keep going in circles|same fight|same argument|this again/i.test(message))
    return "loop_fatigue";

  // Guard: don't guess on fresh events / breaking news / recent deaths
  const recentNewsPattern =
    /\b(did|has)\b.*\b(die|died|dead|passed away|pass away)\b|(\bdie\b.*\brecently\b)|(\brecent(ly)?\b.*\bnews\b)|(\bbreaking\b.*\bnews\b)|(\bwhat happened\b.*\b(today|recently)\b)/i;

  if (recentNewsPattern.test(message)) return "recent_news";

  return "chat";
}

async function callOpenAI(messages) {
  if (!OPENAI_API_KEY) {
    return { ok: false, error: "Missing OPENAI_API_KEY in Netlify environment variables." };
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.8,
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, error: "OpenAI API error (" + r.status + "): " + text };
  }

  const data = await r.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { ok: true, content: content || "" };
}

function systemPrompt(contextLines) {
  return (
    "You are Simo: the user's private best friend. Handle anything on a moment's notice.\n\n" +
    "Style:\n" +
    "- Human, warm, confident, calm. Match the user's tone.\n" +
    "- No therapy-speak by default. No generic lectures unless asked.\n" +
    "- Keep answers efficient; don't over-explain.\n\n" +
    "Rules:\n" +
    "- Math: give ONLY the answer unless they ask for steps.\n" +
    "- Time/weather/location: do NOT refuse or loop. If info exists, answer. If missing, ask once.\n" +
    "- If user is tired of a repeating argument loop: one empathic line + 2-3 options. No lectures.\n" +
    "- For recent-news claims (e.g., deaths, breaking news): do NOT guess. Ask for a link/headline.\n\n" +
    "Context:\n" +
    contextLines.join("\n")
  );
}

exports.handler = async (event) => {
  // GET healthcheck
  if (event.httpMethod === "GET") {
    return respond(200, {
      ok: true,
      version: VERSION,
      model: OPENAI_MODEL,
      hasKey: Boolean(OPENAI_API_KEY),
      note: "POST JSON to this endpoint with {message, history, clientTime, location, zip}.",
    });
  }

  if (event.httpMethod === "OPTIONS") return respond(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return respond(405, { ok: false, error: "Use POST", version: VERSION });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    body = {};
  }

  const message = safeTrim(body.message);
  const history = Array.isArray(body.history) ? body.history : [];
  const clientTime = body.clientTime || null;
  const location = body.location || null;
  const zip = safeTrim(body.zip || "");

  if (!message) return respond(400, { ok: false, error: "Missing message", version: VERSION });

  const intent = detectIntent(message);

  // ✅ Recent news guard (tone locked to Simo)
  if (intent === "recent_news") {
    return respond(200, {
      ok: true,
      reply:
        "Yeah — I don’t want to guess on something that recent.\n\n" +
        "Paste a link or headline and I’ll tell you what it says in plain English.\n" +
        "No link? Tell me where you saw it (site/app) and I’ll tell you what’s worth trusting.",
      meta: { intent, version: VERSION },
    });
  }

  // MATH: direct answer
  if (intent === "math") {
    const result = evalBasicMath(message);
    if (result === null) {
      return respond(200, { ok: true, reply: "Send the exact expression like `217 x 22`.", meta: { intent, version: VERSION } });
    }
    if (!wantsSteps(message)) {
      return respond(200, { ok: true, reply: formatNumber(result), meta: { intent, version: VERSION } });
    }
    // If steps requested, fall through to OpenAI below.
  }

  // TIME
  if (intent === "time") {
    if (clientTime && clientTime.iso && clientTime.tz) {
      const dt = new Date(clientTime.iso);
      const readable = dt.toLocaleString("en-US", {
        timeZone: clientTime.tz,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return respond(200, { ok: true, reply: "It's " + readable + " (" + clientTime.tz + ").", meta: { intent, version: VERSION } });
    }
    return respond(200, {
      ok: true,
      reply: "Tell me your city/timezone (or refresh the page) and I'll tell you the time.",
      meta: { intent, needsClientTime: true, version: VERSION },
    });
  }

  // LOCATION REQUEST
  if (intent === "location_request") {
    return respond(200, {
      ok: true,
      reply: "Yep. Tap Use my location or type your ZIP/city and I'll pull the weather.",
      meta: { intent, needsGeolocation: true, version: VERSION },
    });
  }

  // WEATHER
  if (intent === "weather") {
    let lat = null;
    let lon = null;
    let label = "";

    if (zip && isProbablyZip(zip)) {
      const geo = await zipToLatLonUS(zip);
      if (!geo) {
        return respond(200, { ok: true, reply: "That ZIP didn't resolve. Try 5 digits or give city/state.", meta: { intent, version: VERSION } });
      }
      lat = geo.lat;
      lon = geo.lon;
      label = geo.label;
    } else if (location && location.lat != null && location.lon != null) {
      lat = Number(location.lat);
      lon = Number(location.lon);
      label = "your area";
    } else {
      const zipInMsg = message.match(/\b\d{5}(?:-\d{4})?\b/);
      if (zipInMsg && isProbablyZip(zipInMsg[0])) {
        const geo = await zipToLatLonUS(zipInMsg[0]);
        if (geo) {
          lat = geo.lat;
          lon = geo.lon;
          label = geo.label;
        }
      }
    }

    if (lat == null || lon == null) {
      return respond(200, {
        ok: true,
        reply: "Send your ZIP or tap Use my location and I'll give the current weather.",
        meta: { intent, needsGeolocation: true, needsZip: true, version: VERSION },
      });
    }

    const wx = await openMeteoCurrent(lat, lon);
    if (!wx) {
      return respond(200, { ok: true, reply: "Weather is glitching on my end. Try again in a moment.", meta: { intent, version: VERSION } });
    }

    const summary = codeToSummary(wx.code);
    const temp = Math.round(wx.tempF);
    const feels = Math.round(wx.feelsF);
    const wind = Math.round(wx.windMph);
    const precip = Number(wx.precipIn || 0);
    const rainNote = precip > 0 ? " Precip: " + precip.toFixed(2) + " in." : "";

    return respond(200, {
      ok: true,
      reply: "Right now in " + label + ": " + temp + "F (feels like " + feels + "F), " + summary + ". Wind ~" + wind + " mph." + rainNote,
      meta: { intent, source: "open-meteo", tz: wx.tz, version: VERSION },
    });
  }

  // LOOP FATIGUE
  if (intent === "loop_fatigue") {
    return respond(200, {
      ok: true,
      reply:
        "Yeah, that loop is exhausting. No more circles.\n\nPick one:\n1) One sentence: what do you want from them?\n2) Paste what they said that set you off.\n3) Just vent. I'm here, no lectures.",
      meta: { intent, version: VERSION },
    });
  }

  // OpenAI for everything else
  const contextLines = [];
  if (clientTime && clientTime.iso && clientTime.tz) contextLines.push("Client time: " + clientTime.iso + " (" + clientTime.tz + ")");
  else contextLines.push("Client time: not provided");
  if (location && location.lat != null && location.lon != null) contextLines.push("Client location: lat " + location.lat + ", lon " + location.lon);
  else contextLines.push("Client location: not provided");
  contextLines.push(zip ? "ZIP: " + zip : "ZIP: not provided");

  const sys = systemPrompt(contextLines);

  const trimmedHistory = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12);

  const userContent =
    intent === "math" && wantsSteps(message)
      ? "Explain step-by-step: " + message
      : message;

  const messages = [{ role: "system", content: sys }].concat(trimmedHistory).concat([{ role: "user", content: userContent }]);

  const oa = await callOpenAI(messages);
  if (!oa.ok) {
    return respond(200, {
      ok: true,
      reply: "I'm here, but I'm having a connection hiccup. Say it again in one line.",
      meta: { intent, version: VERSION, error: oa.error },
    });
  }

  return respond(200, { ok: true, reply: oa.content, meta: { intent, version: VERSION } });
};
