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

    // IMAGE PATH
    if (wantsImage(userText)) {
      const prompt = `
Create a professional book cover concept for a story about a factory worker with big dreams.
Mood: gritty but hopeful. Cinematic lighting. Strong composition with clean title space.
No readable text required inside the image (leave space for title/author).
User request: ${userText}
`.trim();

      try {
        // Safer settings: no response_format (avoids unsupported param crashes)
        const img = await openai.images.generate({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024"
        });

        const imageUrl = img?.data?.[0]?.url;

        if (!imageUrl) {
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: "I tried to generate the cover, but the image URL came back empty.",
              image: null
            })
          };
        }

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "Alright — here’s a cover concept.",
            image: imageUrl
          })
        };
      } catch (imgErr) {
        // IMPORTANT: return the real OpenAI error details to the UI
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Image generation failed",
            detail: String(imgErr?.message || imgErr)
          })
        };
      }
    }

    // CHAT PATH
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

