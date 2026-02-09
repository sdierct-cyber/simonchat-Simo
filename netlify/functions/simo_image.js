const OpenAI = require("openai");
const { Redis } = require("@upstash/redis");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const id = body.id;
    const prompt = body.prompt;

    if (!id || !prompt) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id or prompt" }) };
    }

    await redis.set(`img:${id}`, { status: "running" }, { ex: 600 });

    const imagePrompt = `
Create a professional book cover concept for a story about a factory worker with big dreams.
Mood: gritty but hopeful. Cinematic lighting. Strong composition with clean title space.
No readable text required inside the image (leave space for title/author).
User request: ${prompt}
`.trim();

    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt,
      size: "1024x1536"
    });

    const url = img && img.data && img.data[0] && img.data[0].url;
    if (!url) throw new Error("Image URL missing from response.");

    await redis.set(`img:${id}`, { status: "done", image: url }, { ex: 600 });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);

    try {
      const body = JSON.parse(event.body || "{}");
      if (body.id) {
        await redis.set(`img:${body.id}`, { status: "error", error: msg }, { ex: 600 });
      }
    } catch {}

    return { statusCode: 500, headers, body: JSON.stringify({ error: "Image worker failed", detail: msg }) };
  }
};
