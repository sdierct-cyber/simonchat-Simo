// netlify/functions/search.js
export async function handler(event) {
  try {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return json(500, { ok: false, error: "Missing SERPER_API_KEY" });
    }

    const params = event.queryStringParameters || {};
    const q = (params.q || "").trim();
    const type = (params.type || "web").toLowerCase(); // "web" | "images"
    const num = clampInt(params.num, 1, 20, type === "images" ? 12 : 10);

    if (!q) return json(400, { ok: false, error: "Missing q" });

    const endpoint =
      type === "images"
        ? "https://google.serper.dev/images"
        : "https://google.serper.dev/search";

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, num }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return json(500, { ok: false, error: "Serper error", details: text });
    }

    const data = await resp.json();

    // Normalize output so simon.js and index.html can rely on consistent shapes
    if (type === "images") {
      const images = Array.isArray(data.images) ? data.images : [];
      const results = images.slice(0, num).map((img) => ({
        title: img.title || img.source || "Image",
        imageUrl: img.imageUrl || img.thumbnailUrl || img.url || "",
        thumbnailUrl: img.thumbnailUrl || img.imageUrl || "",
        source: img.source || "",
        link: img.link || img.url || "",
      })).filter(r => r.imageUrl || r.thumbnailUrl);

      return json(200, { ok: true, type: "images", q, results });
    }

    // web
    const organic = Array.isArray(data.organic) ? data.organic : [];
    const results = organic.slice(0, num).map((r) => ({
      title: r.title || "",
      link: r.link || "",
      snippet: r.snippet || "",
    })).filter(r => r.title || r.link);

    return json(200, { ok: true, type: "web", q, results });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(body),
  };
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return fallback;
}
