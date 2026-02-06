function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(bodyObj),
  };
}

async function geocodeZip(zip, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", zip);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", apiKey);

  const r = await fetch(url.toString());
  const data = await r.json();

  if (data.status !== "OK" || !data.results?.[0]) {
    throw new Error(`Geocoding failed: ${data.status}`);
  }

  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng, formatted: data.results[0].formatted_address };
}

async function nearbySearch({ lat, lng, radiusMeters, apiKey }) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusMeters));
  url.searchParams.set("keyword", "financial planner retirement planning");
  url.searchParams.set("type", "finance");
  url.searchParams.set("key", apiKey);

  const r = await fetch(url.toString());
  const data = await r.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Nearby search failed: ${data.status}`);
  }
  return data.results || [];
}

async function placeDetails(placeId, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    [
      "name",
      "formatted_address",
      "formatted_phone_number",
      "website",
      "url",
      "rating",
      "user_ratings_total",
      "business_status",
    ].join(",")
  );
  url.searchParams.set("key", apiKey);

  const r = await fetch(url.toString());
  const data = await r.json();

  if (data.status !== "OK" || !data.result) {
    throw new Error(`Details failed: ${data.status}`);
  }
  return data.result;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return json(500, { ok: false, error: "Missing GOOGLE_PLACES_API_KEY env var." });

    const params = event.queryStringParameters || {};
    const zip = (params.zip || "").trim();
    const limit = Math.min(Math.max(parseInt(params.limit || "10", 10) || 10, 1), 15);
    const radiusMiles = Math.min(Math.max(parseFloat(params.radiusMiles || "12") || 12, 2), 25);
    const radiusMeters = Math.round(radiusMiles * 1609.34);

    if (!zip) return json(400, { ok: false, error: "Missing zip parameter. Example: ?zip=48044" });

    const geo = await geocodeZip(zip, apiKey);
    const nearby = await nearbySearch({ lat: geo.lat, lng: geo.lng, radiusMeters, apiKey });

    // Sort by rating * log10(reviews)
    nearby.sort((a, b) => {
      const ar = (a.rating || 0) * Math.log10((a.user_ratings_total || 1));
      const br = (b.rating || 0) * Math.log10((b.user_ratings_total || 1));
      return br - ar;
    });

    const top = nearby.slice(0, limit);

    const details = [];
    for (const p of top) {
      try {
        const d = await placeDetails(p.place_id, apiKey);
        details.push({
          place_id: p.place_id,
          name: d.name,
          formatted_address: d.formatted_address || null,
          formatted_phone_number: d.formatted_phone_number || null,
          website: d.website || null,
          url: d.url || null,
          rating: d.rating || null,
          user_ratings_total: d.user_ratings_total || null,
          business_status: d.business_status || null,
        });
      } catch (e) {
        details.push({
          place_id: p.place_id,
          name: p.name,
          formatted_address: p.vicinity || null,
          formatted_phone_number: null,
          website: null,
          url: null,
          rating: p.rating || null,
          user_ratings_total: p.user_ratings_total || null,
          business_status: p.business_status || null,
        });
      }
    }

    return json(200, {
      ok: true,
      zip,
      center: geo,
      radiusMiles,
      count: details.length,
      results: details,
    });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
};

