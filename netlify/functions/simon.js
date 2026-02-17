// netlify/functions/simon.js
export default async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("", { status: 204 });

    if (req.method !== "POST") {
      return json({ ok:false, error:"Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();
    const mode = String(body.mode || "building");
    const pro = !!body.pro;
    const currentHtml = String(body.current_html || "");
    const currentName = String(body.current_name || "");

    if (!message) return json({ ok:false, error:"Missing message" }, 400);

    // 1) Deterministic EDIT path (this is the fix)
    // If user says change/edit/update and we have current HTML, we edit instead of rebuilding.
    if (mode === "building" && currentHtml && isEditRequest(message)) {
      const edit = tryEditPricing(currentHtml, message);
      if (edit.ok) {
        return json({
          ok: true,
          text: edit.reply,
          updated_html: edit.html,
          updated_name: currentName || "Updated preview",
          toast: edit.toast
        });
      }
      // If we couldn't deterministically edit, fall through to LLM (optional) or return guidance.
      return json({
        ok: true,
        text:
          "I couldn’t find that element to edit in the current preview. " +
          "Try: “change Pro price to $19/mo” or paste the HTML you want edited.",
      });
    }

    // 2) Preview generation (simple + stable)
    if (mode === "building" && wantsLandingPreview(message)) {
      const html = flowProTemplate();
      return json({
        ok:true,
        text: pro
          ? "Pro auto-preview is on. I rendered a preview on the right. Want it simpler or more detailed?"
          : "Rendered a preview. Want it simpler or more detailed?",
        preview_name: "landing_page",
        preview_html: html
      });
    }

    // 3) Best-friend chat (LLM)
    const text = await bestFriendReply({ message, mode });

    return json({ ok:true, text });

  } catch (e) {
    return json({ ok:false, error:"Server error", details: String(e?.message || e) }, 500);
  }
};

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type":"application/json; charset=utf-8",
      "access-control-allow-origin":"*",
      "access-control-allow-headers":"content-type",
      "access-control-allow-methods":"POST,OPTIONS"
    }
  });
}

function isEditRequest(text){
  return /\b(change|edit|update|replace|modify)\b/i.test(text);
}

function wantsLandingPreview(text){
  return /\b(landing page|lp|preview|build)\b/i.test(text);
}

/**
 * Deterministic pricing edit:
 * - Detect target plan (Pro/Starter/Enterprise)
 * - Detect new price like $19 or $19/mo
 * - Replace price inside the matching card
 */
function tryEditPricing(html, prompt){
  // Extract plan
  const planMatch =
    /\b(pro|starter|enterprise)\b/i.exec(prompt);

  // Extract price ($19, 19/mo, $19/mo)
  const priceMatch =
    /\$?\s*(\d{1,4})\s*(?:\/\s*(mo|month))?/i.exec(prompt);

  if(!planMatch || !priceMatch){
    return { ok:false };
  }

  const plan = planMatch[1].toLowerCase();
  const n = priceMatch[1];
  const price = `$${n}/mo`;

  // Regex: find the card with <h3>Plan</h3> then replace the first <div class="price">...</div>
  const planTitle = plan.charAt(0).toUpperCase() + plan.slice(1);
  const cardRe = new RegExp(
    `(<div\\s+class="card"[^>]*>[\\s\\S]*?<h3>\\s*${escapeRe(planTitle)}\\s*<\\/h3>[\\s\\S]*?<div\\s+class="price">)([\\s\\S]*?)(<\\/div>)`,
    "i"
  );

  if(!cardRe.test(html)){
    return { ok:false };
  }

  const updated = html.replace(cardRe, `$1${price}$3`);

  return {
    ok:true,
    html: updated,
    toast: `${planTitle} price updated`,
    reply: `Done — I updated the ${planTitle} price to **${price}** (edited existing preview, no rebuild).`
  };
}

function escapeRe(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flowProTemplate(){
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>FlowPro</title>
<style>
  body{margin:0;font-family:system-ui;background:linear-gradient(135deg,#0b1020,#162a66);color:#eaf0ff}
  .wrap{max-width:1100px;margin:0 auto;padding:60px 20px}
  h1{font-size:56px;margin:0 0 14px 0}
  p{color:rgba(234,240,255,.8);margin:0 0 22px 0;font-size:18px}
  .row{display:flex;gap:12px;margin-bottom:40px}
  .btn{padding:14px 22px;border-radius:10px;border:0;font-weight:800;cursor:pointer}
  .primary{background:#2a66ff;color:#fff}
  .ghost{background:#2a2a2a;color:#ddd}
  .feature{background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:18px;margin:14px 0}
  .pricing{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:30px}
  .card{background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:26px;text-align:center}
  .price{font-size:34px;font-weight:900;margin:16px 0}
  ul{list-style:none;padding:0;margin:0 0 18px 0;color:rgba(234,240,255,.8)}
  li{margin:8px 0}
</style>
</head>
<body>
  <div class="wrap">
    <h1>FlowPro helps you automate your workflow.</h1>
    <p>Save time. Reduce manual work. Scale smarter.</p>
    <div class="row">
      <button class="btn primary">Get Started</button>
      <button class="btn ghost">See Demo</button>
    </div>

    <div class="feature">Automated task pipelines</div>
    <div class="feature">Smart scheduling</div>
    <div class="feature">Real-time analytics dashboard</div>

    <div class="pricing">
      <div class="card">
        <h3>Starter</h3>
        <div class="price">$9/mo</div>
        <ul><li>Basic support</li><li>Core features</li><li>1 user</li></ul>
      </div>
      <div class="card">
        <h3>Pro</h3>
        <div class="price">$29/mo</div>
        <ul><li>Priority support</li><li>All features</li><li>5 users</li></ul>
      </div>
      <div class="card">
        <h3>Enterprise</h3>
        <div class="price">$99/mo</div>
        <ul><li>Dedicated support</li><li>Custom integrations</li><li>Unlimited users</li></ul>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function bestFriendReply({ message, mode }){
  const key = process.env.OPENAI_API_KEY;
  if(!key){
    // Fallback if key missing so UI still works
    if(mode === "venting") return "I’m here — tell me what happened.";
    if(mode === "solving") return "Okay. What’s the exact problem and what have you tried so far?";
    return "Tell me what you want to build — landing page, app layout, or something else.";
  }

  const system =
`You are Simo: best-friend + builder.
- If mode is venting: be supportive, natural, not therapy-bot.
- If mode is solving: ask sharp questions, give steps.
- If mode is building: propose a plan; if user asks for a preview, the UI will render separately.
Keep it concise and human.`;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: [{ type:"text", text: system }] },
        { role: "user", content: [{ type:"text", text: `mode=${mode}\n\n${message}` }] }
      ]
    })
  });

  const data = await resp.json();
  const text =
    data?.output?.flatMap(o => o?.content || [])
      ?.filter(c => c?.type === "output_text")
      ?.map(c => c?.text)
      ?.join("\n")
    || "Okay.";

  return text;
}
