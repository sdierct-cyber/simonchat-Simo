import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

function wantsImage(text = "") {
  return /\b(show|image|picture|cover|book cover|logo|mockup|design|illustration)\b/i.test(text);
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    // POLL STATUS
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id" }) };

      const job = await redis.get(`img:${id}`);
      if (!job) return { statusCode: 404, headers, body: JSON.stringify({ error: "Job not found" }) };

      return { statusCode: 200, headers, body: JSON.stringify(job) };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { message } = JSON.parse(event.body || "{}");
    const userText = (message || "").trim();
    if (!userText) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing message" }) };

    // IMAGE REQUEST → CREATE JOB + TRIGGER BACKGROUND WORK
    if (wantsImage(userText)) {
      const id = makeId();

      await redis.set(`img:${id}`, { status: "pending" }, { ex: 600 }); // expires in 10 min

      // Trigger the background function (non-blocking)
      // NOTE: Uses an internal fetch call; Netlify will route it.
      fetch(`${process.env.URL}/.netlify/functions/simo_image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, prompt: userText })
      }).catch(() => {});

      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({
          text: "Alright — I’m making it. Hang tight.",
          jobId: id
        })
      };
    }

    // NORMAL CHAT (keep your current chat behavior here if you want)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: "For now, chat is working — images are handled as jobs. Ask me to generate a cover and I’ll produce it."
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Function crashed", detail: String(err?.message || err) })
    };
  }
};
