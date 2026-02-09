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

    // Ask explicitly for base64 so we always get something displayable.
    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt,
      size: "1024x1536",
      response_format: "b64_json"
    });

    const first = img && img.data && img.data[0] ? img.data[0] : null;

    // Some responses include url, some include b64_json. Support both.
    let imageSrc = first && first.url ? first.url : null;

    if (!imageSrc && first && first.b64_json) {
      imageSrc = `data:image/png;base64,${first.b64_json}`;
    }

    if (!imageSrc) {
      // Store a helpful error so polling stops with a real reason
      await redis.set(
        `img:${id}`,
        {
          status: "error",
          error: "Image generated but no url or b64_json was returned."
        },
        { ex: 600 }
      );

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Image URL missing from response." })
      };
    }

    await redis.set(`img:${id}`, { status: "done", image: imageSrc }, { ex: 600 });

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
