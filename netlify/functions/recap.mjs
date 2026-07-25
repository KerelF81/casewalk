import { getStore } from "@netlify/blobs";

function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function lastWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeek(d);
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (!process.env.RECAP_SECRET || key !== process.env.RECAP_SECRET) {
    return new Response("Not authorized", { status: 401 });
  }

  let week = url.searchParams.get("week") || "current";
  if (week === "current") week = isoWeek();
  else if (week === "last") week = lastWeek();

  const store = getStore("casewalk-visits");

  // Tally arrivals for the week by listing keys under the week prefix.
  const tally = {};
  const { blobs } = await store.list({ prefix: `${week}/` });
  for (const b of blobs) {
    const parts = b.key.split("/"); // week / locationId / verifiedBy / ...
    const loc = parts[1];
    const via = parts[2];
    if (!loc) continue;
    tally[loc] ||= { gps: 0, codeword: 0, total: 0 };
    if (via === "codeword") tally[loc].codeword++;
    else tally[loc].gps++;
    tally[loc].total++;
  }

  // Business names, saved by the ping function under meta/<locationId>.
  const labels = {};
  try {
    const meta = await store.list({ prefix: "meta/" });
    for (const m of meta.blobs) {
      const loc = m.key.slice("meta/".length);
      labels[loc] = (await store.get(m.key)) || loc;
    }
  } catch (_) {}

  const rows = Object.keys(tally).sort((a, b) => tally[b].total - tally[a].total);

  const tableRows = rows.length
    ? rows.map((loc) => {
        const t = tally[loc];
        const name = labels[loc] || loc;
        return `<tr><td>${esc(name)}</td><td class="n">${t.total}</td><td class="n">${t.gps}</td><td class="n">${t.codeword}</td></tr>`;
      }).join("")
    : `<tr><td colspan="4" class="empty">No arrivals recorded for ${esc(week)} yet.</td></tr>`;

  const blurbs = rows.map((loc) => {
    const t = tally[loc];
    const name = labels[loc] || loc;
    const blurb =
      `Hi there, quick Casewalk update for ${name}. This week, ${t.total} ` +
      `${t.total === 1 ? "detective" : "detectives"} reached your door as part of a case ` +
      `(${t.gps} confirmed by location, ${t.codeword} by code word at your counter). ` +
      `Thanks for being a stop on the trail.`;
    return `<div class="blurb"><div class="who">${esc(name)}</div><textarea readonly rows="3">${esc(blurb)}</textarea></div>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Casewalk weekly recap — ${esc(week)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#ece2cd;color:#211c16;margin:0;padding:32px 18px;}
  .wrap{max-width:720px;margin:0 auto;}
  h1{font-size:1.5rem;margin:0 0 4px;}
  .sub{color:#6b5d46;margin:0 0 24px;font-size:.95rem;}
  table{width:100%;border-collapse:collapse;background:#e4d7bd;border:1px solid rgba(107,93,70,.5);}
  th,td{text-align:left;padding:11px 14px;border-bottom:1px solid rgba(107,93,70,.35);}
  th{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#6b5d46;}
  td.n{text-align:right;font-variant-numeric:tabular-nums;}
  .empty{color:#6b5d46;font-style:italic;text-align:center;}
  h2{font-size:1rem;margin:30px 0 10px;}
  .blurb{margin:0 0 14px;}
  .who{font-weight:600;font-size:.9rem;margin-bottom:5px;}
  textarea{width:100%;box-sizing:border-box;font:inherit;font-size:.9rem;padding:10px;border:1px solid rgba(107,93,70,.5);background:#f2ead8;color:#211c16;resize:vertical;}
  .nav{margin:22px 0 0;font-size:.85rem;}
  .nav a{color:#8a2534;}
</style></head><body><div class="wrap">
  <h1>Casewalk weekly recap</h1>
  <p class="sub">Week ${esc(week)} · confirmed player arrivals by location</p>
  <table>
    <thead><tr><th>Business</th><th style="text-align:right">Arrivals</th><th style="text-align:right">By location</th><th style="text-align:right">By code word</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <h2>Ready-to-send notes</h2>
  ${blurbs || '<p class="sub">Notes will appear here once there are arrivals.</p>'}
  <p class="nav"><a href="?key=${esc(key)}&week=current">This week</a> · <a href="?key=${esc(key)}&week=last">Last week</a></p>
</div></body></html>`;

  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};

export const config = { path: "/recap" };
