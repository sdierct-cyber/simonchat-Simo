// netlify/functions/pro.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok:false, error:"Use POST" }) };
  }
  let data = {};
  try { data = JSON.parse(event.body || "{}"); } catch {}
  const key = String(data.key || "").trim();

  const allowed = String(process.env.PRO_LICENSE_KEYS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const isPro = allowed.includes(key);

  return {
    statusCode: 200,
    headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" },
    body: JSON.stringify({ ok:true, pro:isPro })
  };
};
