import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function wantsImage(text = "") {
  return /\b(show|image|picture|cover|book cover|logo|mockup|design|illustration)\b/i.test(text);
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const { message } = JSON.parse(event.body || "{}");
    const userText = (message || "").trim();

    if (!userText) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing message" })
      };
    }

    const system = `
You are Simo — the user's private best friend + insanely capable helper.
You can generate images when the user asks to see something visual.
Never say you can't create images.
Be direct and helpful.
`.trim();

    if (wantsImage(userText)) {
      const prompt = `
Create a professional book cover concept for a story about a factory worker with big dreams.
Mood: gritty but hopeful. Cinematic lighting. Strong composition with clean title space.
No readable text required inside the image (leave space for title/author).
User request: ${userText}
`.trim();

      // IMPORTANT: use base64 so we can show it instantly in the browser.
      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "512x512",
        response_format: "b64_json"
      });

      const b64 = img?.data?.[0]?.b64_json;
      if (!b64) {
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Image generation returned no data." })
        };
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Alright — here’s a cover concept.",
          image: `data:image/png;base64,${b64}`
        })
      };
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText }
      ]
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: completion.choices?.[0]?.message?.content?.trim() || ""
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Function crashed",
        detail: String(err?.message || err)
      })
    };
  }
};
