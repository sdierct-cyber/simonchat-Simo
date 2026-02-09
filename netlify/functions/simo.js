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

function getOrigin(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["host"];
  return `${proto}://${host}`;
}

async function redisSelfTest() {
  // quick canary write/read to confirm Redis env/token is valid
  const key = `health:${Date.now()}`;
  await redis.set(key, "ok", { ex: 30 });
  const val = await redis.get(key);
  return val === "ok";
}

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    // ✅ HEALTHCHECK + JOB POLLING
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;

      // If no id, just confirm function is alive (so browser visit doesn’t look “broken”)
      if (!id) {
        let redisOk = false;
        try {
          redisOk = await redisSelfTest();
        } catch {
          redisOk = false;
        }
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, redisOk })
        };
      }

      const job = await redis.get(`img:${id}`);
      if (!job) return { statusCode: 404, headers, body: JSON.stringify({ error: "Job not found" }) };

      return { statusCode: 200, headers, body: JSON.stringify(job) };
    }

    // ✅ CHAT / START IMAGE JOB
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { message } = JSON.parse(event.body || "{}");
    const userText = (message || "").trim();
    if (!userText) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing message" }) };

    // Before doing anything job-related, confirm Redis works (so failures are explicit)
    try {
      const ok = await redisSelfTest();
      if (!ok) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Redis self-test failed", detail: "Redis did not echo back value." })
        };
      }
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Redis connection failed", detail: String(e?.message || e) })
      };
    }

    // IMAGE JOB
    if (wantsImage(userText)) {
      const id = makeId();
      await redis.set(`img:${id}`, { status: "pending" }, { ex: 600 });

      const origin = getOrigin(event);
      const workerUrl = `${origin}/.netlify/functions/simo_image`;

      // Fire worker
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

    // NORMAL CHAT (simple placeholder for now)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: "I’m here. Ask me anything — or ask me to generate a book cover image." })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Function crashed", detail: String(err?.message || err) })
    };
  }
};
