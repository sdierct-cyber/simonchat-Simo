const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  }

  const { message, mode } = JSON.parse(event.body || "{}");

  if (!OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ reply:"Missing API key." }) };
  }

  const system = `
You are Simo.
Vibe: best friend + builder.
Short. Calm. Real.
No hype. No therapy speak.

If building UI:
- Reply in bullet points
- Include preview_html (full HTML document)
`;

  const wantsPreview = /show me|preview|mockup|ui|app/i.test(message);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{
      "Authorization":`Bearer ${OPENAI_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model: MODEL,
      messages:[
        { role:"system", content: system },
        { role:"user", content: message }
      ]
    })
  });

  const json = await res.json();
  const content = json.choices[0].message.content;

  let out;
  try { out = JSON.parse(content); } catch {
    out = { reply: content };
  }

  if (wantsPreview && !out.preview_html) {
    out.preview_html = `
<!doctype html>
<html>
<body style="font-family:sans-serif;padding:40px">
<h2>Space Renting App</h2>
<p>Listings • Map • Booking panel</p>
</body>
</html>`;
  }

  return {
    statusCode:200,
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify(out)
  };
};
