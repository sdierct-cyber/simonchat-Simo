// netlify/functions/pro.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Use POST" });
    }

    const keysRaw = process.env.PRO_LICENSE_KEYS || "";
    const allowed = keysRaw.split(",").map(s => s.trim()).filter(Boolean);

    const body = safeJson(event.body);
    const key = (body && body.key ? String(body.key) : "").trim();

    const isPro = key && allowed.includes(key);

    return json(200, { ok: true, pro: !!isPro });
  } catch (e) {
    return json(500, { ok: false, error: "Server error", details: String(e && e.message ? e.message : e) });
  }
};

function json(statusCode, obj){
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(obj)
  };
}

function safeJson(s){
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
