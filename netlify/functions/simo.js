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

// Build an absolute origin like https://simonchat.ai from the incoming request
function getOrigin(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["host"];
  return `${proto}://${host}`;
}

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    // GET = poll job status
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id" }) };

      const job = await redis.get(`img:${id}`);
      if (!job) return { statusCode: 404, headers, body: JSON.stringify({ error: "Job not found" }) };

      return { statusCode: 200, headers, body: JSON.stringify(job) };
    }

    // POST = chat or start image job
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { message } = JSON.parse(event.body || "{}");
    const userText = (message || "").trim();
    if (!userText) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing message" }) };

    // Image request: create job + trigger worker
    if (wantsImage(userText)) {
      const id = makeId();
      await redis.set(`img:${id}`, { status: "pending" }, { ex: 600 });

      const origin = getOrigin(event);
      const workerUrl = `${origin}/.netlify/functions/simo_image`;

      // Fire-and-forget trigger (absolute URL so Node fetch doesn’t crash)
      fetch(workerUrl, {
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

    // Normal chat placeholder (keep this simple for now)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: "I’m here. Ask me anything — or ask me to generate a book cover image."
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
