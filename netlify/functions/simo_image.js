const OpenAI = require("openai");
const { Redis } = require("@upstash/redis");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { id, prompt } = body;

    if (!id || !prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing id or prompt" })
      };
    }

    // Mark job as running
    await redis.set(`img:${id}`, { status: "running" }, { ex: 600 });

    const imagePrompt = `
Create a professional book cover concept for a story about a factory worker with big dreams.
Mood: gritty but hopeful. Cinematic lighting. Strong composition with clean title space.
No readable text inside the image (leave space for title and author).
User request: ${prompt}
`.trim();

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt,
      size: "1024x1536"
    });

    const first = result?.data?.[0];

    let imageSrc = null;

    if (first?.b64_json) {
      imageSrc = `data:image/png;base64,${first.b64_json}`;
    } else if (first?.url) {
      imageSrc = first.url;
    }

    if (!imageSrc) {
      throw new Error("No image data returned from OpenAI");
    }

    await redis.set(
      `img:${id}`,
      { status: "done", image: imageSrc },
      { ex: 600 }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    const msg = String(err?.message || err);

    try {
      const body = JSON.parse(event.body || "{}");
      if (body.id) {
        await redis.set(
          `img:${body.id}`,
          { status: "error", error: msg },
          { ex: 600 }
        );
      }
    } catch {}

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Image worker failed", detail: msg })
    };
  }
};
