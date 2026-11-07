// Stash Ledger sync — Cloudflare Worker + D1
// Stores one small save per sync code: ticks, goal, Have counts and settings. Nothing personal.
// No accounts. The sync code is the key: the client sends it in a header, the server only ever
// stores a SHA-256 hash of it, so the database never holds the codes themselves.
// No secrets live in this file. License: GPL-3.0 (see ../LICENSE).

const MAX_BYTES = 32 * 1024;          // a full save is a few KB; this is plenty
const MIN_WRITE_GAP_MS = 1500;        // one save can't be written more than ~once per 1.5 s
const DELETE_AFTER_DAYS = 180;        // saves nobody has opened for 6 months are removed
const SEEN_EVERY_MS = 864e5;          // a read refreshes "last opened" at most once a day, so reads rarely cost a write
const CODE_RE = /^[A-Z2-7]{4}(-[A-Z2-7]{4}){4}$/; // 20 random base32 chars = 100 bits

const enc = new TextEncoder();
async function idOf(code) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode("stash-ledger-sync:v1:" + code));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function cors(env, req) {
  const allowed = (env.ALLOWED_ORIGINS || "https://winter-scav-tools.github.io").split(",").map(s => s.trim());
  const origin = req.headers.get("Origin") || "";
  const h = {
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Sync-Code";
    h["Access-Control-Max-Age"] = "86400";
  }
  return { ok: allowed.includes(origin), h };
}
// a limiter that errors lets the request through: the write gap and size cap still apply
async function limited(lim, key) {
  if (!lim) return false;
  try { return !(await lim.limit({ key })).success; } catch { return false; }
}
// 409 with the save as it is now, so the page can ask which progress to keep (404 if it was deleted meanwhile)
async function conflict(env, id, h) {
  const cur = await env.DB.prepare("SELECT data, rev, updated FROM saves WHERE id = ?").bind(id).first();
  if (!cur) return json(404, { error: "no save for this code" }, h);
  return json(409, { error: "changed on another device", data: JSON.parse(cur.data), rev: cur.rev, updated: cur.updated }, h);
}
const json = (status, body, h) => new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { ok, h } = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: h });
    if (url.pathname !== "/v1/save") return json(404, { error: "not found" }, h);
    if (!ok) return json(403, { error: "origin not allowed" }, h);

    // anything that throws (D1 down, a race) still answers with CORS headers, so the page can read it
    try {
      // per-IP rate limits (Workers Rate Limiting bindings in wrangler.toml): LIMITER for every request,
      // CREATE_LIMITER (stricter) only when a request would make a new save
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      if (await limited(env.LIMITER, ip)) return json(429, { error: "slow down" }, h);

      const code = (req.headers.get("X-Sync-Code") || "").toUpperCase();
      if (!CODE_RE.test(code)) return json(400, { error: "bad sync code" }, h);
      const id = await idOf(code);
      const now = Date.now();

      if (req.method === "GET") {
        const row = await env.DB.prepare("SELECT data, rev, updated, seen FROM saves WHERE id = ?").bind(id).first();
        if (!row) return json(404, { error: "no save for this code" }, h);
        // reading counts as use, so an opened save isn't deleted for being idle
        if (!(now - row.seen < SEEN_EVERY_MS)) await env.DB.prepare("UPDATE saves SET seen = ? WHERE id = ?").bind(now, id).run();
        return json(200, { data: JSON.parse(row.data), rev: row.rev, updated: row.updated }, h);
      }

      if (req.method === "PUT") {
        if (Number(req.headers.get("Content-Length")) > MAX_BYTES) return json(413, { error: "save too big" }, h);
        const text = await req.text();
        if (enc.encode(text).length > MAX_BYTES) return json(413, { error: "save too big" }, h);
        let body;
        try { body = JSON.parse(text); } catch { return json(400, { error: "not JSON" }, h); }
        if (!body || typeof body !== "object" || !body.data || typeof body.data !== "object" || Array.isArray(body.data))
          return json(400, { error: "bad save" }, h);
        const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : 0;
        const data = JSON.stringify(body.data);
        const row = await env.DB.prepare("SELECT rev, updated FROM saves WHERE id = ?").bind(id).first();
        if (row) {
          if (row.rev !== baseRev) return await conflict(env, id, h);
          if (now - row.updated < MIN_WRITE_GAP_MS) return json(429, { error: "slow down" }, h);
          const res = await env.DB.prepare("UPDATE saves SET data = ?, rev = rev + 1, updated = ?, seen = ? WHERE id = ? AND rev = ?")
            .bind(data, now, now, id, baseRev).run();
          if (!res.meta || res.meta.changes !== 1) return await conflict(env, id, h);  // another device won the race
          return json(200, { rev: baseRev + 1, updated: now }, h);
        }
        if (baseRev !== 0) return json(404, { error: "no save for this code" }, h);
        if (await limited(env.CREATE_LIMITER, ip)) return json(429, { error: "slow down" }, h);
        // two devices creating the same code at once: the second gets a 409, not a crash
        const res = await env.DB.prepare("INSERT INTO saves (id, data, rev, updated, seen) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING")
          .bind(id, data, now, now).run();
        if (!res.meta || res.meta.changes !== 1) return await conflict(env, id, h);
        return json(201, { rev: 1, updated: now }, h);
      }

      if (req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM saves WHERE id = ?").bind(id).run();
        return json(200, { deleted: true }, h);
      }

      return json(405, { error: "method not allowed" }, h);
    } catch {
      return json(503, { error: "server problem" }, h);
    }
  },

  // daily clean-up: remove saves nobody has opened or changed for DELETE_AFTER_DAYS
  async scheduled(_event, env) {
    const cutoff = Date.now() - DELETE_AFTER_DAYS * 864e5;
    await env.DB.prepare("DELETE FROM saves WHERE seen < ?").bind(cutoff).run();
  },
};
