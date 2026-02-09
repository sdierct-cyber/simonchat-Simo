import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory job store (good for MVP/testing; for production we'd use KV/DB)
const JOBS = globalThis.__SIMO_JOBS__ || (globalThis.__SIMO_JOBS__ = new Map());

function wantsImage(text = "") {
  return /\b(show|image|picture|cover|book cover|logo|mockup|design|illustration)\b/i.test(text);
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function startImageJob(userText) {
  const id = makeId();
  JOBS.set(id, { status: "pending", createdAt: Date.now() });

  // Fire-and-forget async (do not await in request)
  (async () => {
    try {
      const prompt = `
Create a professional book cover concept for a story about a factory worker with big dreams.
Mood: gritty but hopeful. Cinematic lighting. Strong composition with clean title space.
No readable text required inside the image (leave space for title/author).
User request: ${userText}
`.trim();

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1536" // portrait is better for book covers
      });

      const url = img?.data?.[0]?.url;
      if (!url) throw new Error("Image URL missing from response.");

      JOBS.set(id, { status: "done", image: url, createdAt: Date.now() });
    } catch (e) {
      JOBS.set(id, { status: "error", error: String(e?.message || e), createdAt: Date.now() });
    }
  })();

  return id;
}

export const handler = async (event) => {
  try {
    const headers = { "Content-Type": "application/json" };

    // Status endpoint
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id" }) };

      const job = JOBS.get(id);
      if (!job) return { statusCode: 404, headers, body: JSON.stringify({ error: "Job not found" }) };

      return { statusCode: 200, headers, body: JSON.stringify(job) };
    }

    // Start job or normal chat
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { message } = JSON.parse(event.body || "{}");
    const userText = (message || "").trim();
    if (!userText) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing message" }) };

    const system = `
You are Simo — the user's private best friend + insanely capable helper.
You can generate images when asked to show something visual.
Never say you can't create images.
Be direct and helpful.
`.trim();

    if (wantsImage(userText)) {
      const id = await startImageJob(userText);
      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({
          text: "Alright — give me a sec. I’m making the cover…",
          jobId: id
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
      headers,
      body: JSON.stringify({ text: completion.choices?.[0]?.message?.content?.trim() || "" })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Function crashed", detail: String(err?.message || err) })
    };
  }
};
