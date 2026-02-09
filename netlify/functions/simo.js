import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simple intent: image request detector
function wantsImage(text = "") {
  return /\b(show|image|picture|cover|book cover|logo|mockup|design|generate an image|draw|illustration)\b/i.test(text);
}

// Netlify function handler
export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { message } = JSON.parse(event.body || "{}");
    const userText = (message || "").trim();

    if (!userText) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing message" }) };
    }

    const system = `
You are Simo — the user's private best friend + insanely capable helper.
Tone: natural, grounded, not therapy-speak unless asked. Match the user's vibe.
Behavior:
- If the user asks for something to be created (any field), be proactive and produce it.
- If the user asks to SEE something visual (book cover, mockup, concept art, logo), you CAN generate an image.
- Never say you can't create images. If you need details, ask ONE tight question, otherwise make a strong assumption and go.
Output:
- Keep replies clear and not overly long unless user requests detail.
`;

    // IMAGE PATH
    if (wantsImage(userText)) {
      // Create a strong prompt without asking 10 questions
      const imagePrompt = `
Create a high-quality book cover concept based on the user's request.
Style: cinematic, readable title space, professional typography zones, strong mood lighting.
Return an image only (no text in the image unless it's clearly a title area).
User request: ${userText}
`.trim();

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: imagePrompt,
        size: "1024x1024"
      });

      const imageUrl = img?.data?.[0]?.url;

      // Also give a short caption
      const caption = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Write a 1-2 sentence caption for the image you generated. Keep it Simo-style. Context: ${userText}` }
        ]
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          text: caption.choices?.[0]?.message?.content?.trim() || "Here you go.",
          image: imageUrl || null
        })
      };
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
      body: JSON.stringify({
        text: completion.choices?.[0]?.message?.content?.trim() || ""
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Function crashed",
        detail: String(err?.message || err)
      })
    };
  }
};
