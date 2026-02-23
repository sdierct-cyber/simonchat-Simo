// netlify/functions/pro.js
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
  const key = String(body.key || "").trim();
  if (!key) return json(200, { ok: true, pro: false });

  // Hardcoded test key for development – replace with real logic later
  const isPro = (key === "testpro"); // Type 'testpro' to unlock

  // For production, use: const keys = (process.env.PRO_LICENSE_KEYS || "").split(",").map(s => s.trim()).filter(Boolean);
  // const isPro = keys.includes(key);

  return json(200, { ok: true, pro: isPro });
};
