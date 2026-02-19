// netlify/functions/pro.js
// Verifies Pro license keys stored in env var PRO_LICENSE_KEYS
// Supports comma OR newline separated keys. Trims whitespace.

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ALLOW_ORIGIN,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function parseKeys(raw) {
  return String(raw || "")
    .split(/[,\n]/g)
    .map(s => s.trim())
    .filter(Boolean);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, { ok: true });

    if (event.httpMethod === "GET") {
      return json(200, { ok: true, service: "pro", expects: "POST { key }" });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const body = safeParseJSON(event.body || "{}") || {};
    const key = String(body.key || "").trim();

    const raw = process.env.PRO_LICENSE_KEYS || "";
    const keys = parseKeys(raw);

    // If no keys configured, always invalid (safe default)
    if (!keys.length) {
      return json(200, { ok: true, pro: false, reason: "no_keys_configured" });
    }

    const valid = !!key && keys.includes(key);

    return json(200, {
      ok: true,
      pro: valid,
      reason: valid ? "valid" : "invalid",
    });
  } catch (err) {
    return json(500, { ok: false, error: "Server error", details: String(err?.message || err) });
  }
};
