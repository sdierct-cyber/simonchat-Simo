// netlify/functions/pro.js
exports.handler = async (event) => {
  const headers = {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"Content-Type",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true }) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok:false, error:"Use POST" }) };
  }

  try{
    const body = JSON.parse(event.body || "{}");
    const key = String(body.key || "").trim();

    const raw = String(process.env.PRO_LICENSE_KEYS || "");
    const keys = raw.split(",").map(s => s.trim()).filter(Boolean);

    const pro = !!key && keys.includes(key);
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, pro }) };
  }catch(e){
    return { statusCode: 200, headers, body: JSON.stringify({ ok:false, error:"Server error" }) };
  }
};
