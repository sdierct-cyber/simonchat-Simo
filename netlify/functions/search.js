export async function handler(event) {
  try {
    const q = (event.queryStringParameters?.q || "").trim();
    if (!q) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing q" }),
      };
    }

    // Uses Serper (Google-like results). Requires SERPER_API_KEY.
    // Create it at https://serper.dev (cheap + simple).
    const key = process.env.SERPER_API_KEY;
    if (!key) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "SERPER_API_KEY not set",
          results: [],
        }),
      };
    }

    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ q, num: 5 }),
    });

    if (!r.ok) throw new Error(`Search failed (${r.status})`);
    const data = await r.json();

    const results = (data?.organic || []).slice(0, 5).map((x) => ({
      title: x.title,
      url: x.link,
      snippet: x.snippet,
    }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, q, results }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: err?.message || "Unknown error" }),
    };
  }
}
