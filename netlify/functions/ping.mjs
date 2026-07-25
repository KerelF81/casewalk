import { getStore } from "@netlify/blobs";

// ISO-8601 week string, e.g. "2026-W30"
function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400, headers: cors });
  }

  const locationId = String(body.locationId || "").trim().slice(0, 120);
  const verifiedBy = body.verifiedBy === "codeword" ? "codeword" : "gps";
  const label = body.label ? String(body.label).slice(0, 120) : "";

  // location ids are slugs; reject anything that would break a blob key
  if (!locationId || /[/:\s]/.test(locationId)) {
    return new Response("Bad locationId", { status: 400, headers: cors });
  }

  try {
    const store = getStore("casewalk-visits");
    const week = isoWeek();
    const rand = Math.random().toString(36).slice(2, 8);
    // key: week / locationId / verifiedBy / timestamp_rand  (never starts with "/")
    await store.set(`${week}/${locationId}/${verifiedBy}/${Date.now()}_${rand}`, "1");
    if (label) await store.set(`meta/${locationId}`, label);
  } catch (err) {
    console.error("ping store error:", err);
    // Still return success: the game must never break on a logging failure.
  }

  return new Response(null, { status: 204, headers: cors });
};
