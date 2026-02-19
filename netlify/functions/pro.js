// netlify/functions/pro.js
// Minimal Pro verification (server-verified).
// Later you can swap the check to Stripe, Supabase, Firebase, etc.

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

// Set this in Netlify env vars:
// PRO_LICENSE_KEYS = "KEY1,KEY2,KEY3"
function parseKeys() {
  const raw = process.env.PRO_LICENSE_KEYS || "";
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

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

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(204, { ok: true });

    if (event.httpMethod === "GET") {
      return json(200, { ok: true, service: "pro", expects: "POST { key }" });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const body = (() => { try { return JSON.parse(event.body || "{}"); } catch { return {}; } })();
    const key = String(body.key || "").trim();

    if (!key) return json(200, { ok: true, pro: false, reason: "missing_key" });

    const keys = parseKeys();
    const isValid = keys.includes(key);

    return json(200, {
      ok: true,
      pro: isValid,
      reason: isValid ? "valid" : "invalid",
    });

  } catch (e) {
    return json(500, { ok: false, error: "server_error", details: String(e?.message || e) });
  }
};
