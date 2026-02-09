const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

function wantsImage(text = "") {
  return /\b(show|image|picture|cover|book cover|generate.*image|illustration|make.*image)\b/i.test(text);
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrigin(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["host"];
  return `${proto}://${host}`;
}

async function redisSelfTest() {
  const key = `health:${Date.now()}`;
  await redis.set(key, "ok", { ex: 30 });
  const val = await redis.get(key);
  return val === "ok";
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    // GET: healthcheck or job status
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters && event.queryStringParameters.id;

      if (!id) {
        let redisOk = false;
        let redisError = null;
        try {
          redisOk = await redisSelfTest();
        } catch (e) {
          redisOk = false;
          redisError = String(e && e.message ? e.message : e);
        }
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, redisOk, redisError }) };
      }

      const job = await redis.get(`img:${id}`);
      if (!job) return { statusCode: 404, headers, body: JSON.stringify({ error: "Job not found" }) };
      return { statusCode: 200, headers, body: JSON.stringify(job) };
    }

    // POST: start image job OR reply text
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const userText = (body.message || "").trim();
    if (!userText) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing message" }) };

    // Ensure Redis is good
    try {
      const ok = await redisSelfTest();
      if (!ok) return { statusCode: 500, headers, body: JSON.stringify({ error: "Redis self-test failed" }) };
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Redis connection failed", detail: String(e && e.message ? e.message : e) })
      };
    }

    if (wantsImage(userText)) {
      const id = makeId();
      await redis.set(`img:${id}`, { status: "pending" }, { ex: 600 });

      const origin = getOrigin(event);
      const workerUrl = `${origin}/.netlify/functions/simo_image`;

      fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, prompt: userText })
      }).catch(() => {});

      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({ text: "Alright — I’m making it. Hang tight.", jobId: id })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: "I’m here. Tell me what you need — or ask me to generate a book cover image." })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Function crashed", detail: String(err && err.message ? err.message : err) })
    };
  }
};
