// netlify/functions/simon.js

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let currentPreviewHTML = null;

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const message = body.message || "";

    // ---------- EDIT DETECTION ----------
    const isEdit =
      message.toLowerCase().includes("edit") ||
      message.toLowerCase().includes("change") ||
      message.toLowerCase().includes("update");

    // ---------- IF EDIT MODE ----------
    if (isEdit && currentPreviewHTML) {
      if (message.toLowerCase().includes("pro") &&
          message.toLowerCase().includes("$19")) {

        currentPreviewHTML = currentPreviewHTML.replace("$29/mo", "$19/mo");
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply: "Updated existing preview.",
          preview: currentPreviewHTML,
        }),
      };
    }

    // ---------- INITIAL BUILD ----------
    if (message.toLowerCase().includes("landing page")) {

      currentPreviewHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>FlowPro</title>
<style>
body{
  margin:0;
  font-family:Arial, sans-serif;
  background:linear-gradient(135deg,#0b1437,#1a2c5b);
  color:white;
}
.container{
  max-width:1100px;
  margin:80px auto;
  padding:20px;
}
h1{
  font-size:48px;
  margin-bottom:10px;
}
.sub{
  opacity:.8;
  margin-bottom:40px;
}
.cards{
  display:flex;
  gap:20px;
}
.card{
  background:#16224a;
  padding:30px;
  border-radius:12px;
  flex:1;
  text-align:center;
}
.price{
  font-size:32px;
  margin:15px 0;
}
button{
  margin-top:15px;
  padding:10px 18px;
  background:#2d6cff;
  border:none;
  border-radius:6px;
  color:white;
}
</style>
</head>
<body>
<div class="container">
  <h1>FlowPro helps you automate your workflow.</h1>
  <div class="sub">Save time. Reduce manual work. Scale smarter.</div>

  <div class="cards">
    <div class="card">
      <h2>Starter</h2>
      <div class="price">$9/mo</div>
      <div>Basic support</div>
      <button>Choose Plan</button>
    </div>

    <div class="card">
      <h2>Pro</h2>
      <div class="price">$29/mo</div>
      <div>Priority support</div>
      <button>Choose Plan</button>
    </div>

    <div class="card">
      <h2>Enterprise</h2>
      <div class="price">$99/mo</div>
      <div>Dedicated support</div>
      <button>Contact Sales</button>
    </div>
  </div>
</div>
</body>
</html>
`;

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply: "Preview rendered.",
          preview: currentPreviewHTML,
        }),
      };
    }

    // ---------- DEFAULT CHAT ----------
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: "I’m here. Want to build something or just talk?",
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
