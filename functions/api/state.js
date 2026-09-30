/**
 * Pages Function: the versioned public/data/workbench.json file is authoritative.
 * D1 mirrors its structured records for browsing and future analysis.
 * No public write endpoint is exposed.
 */
const definitions = [
  {
    key: "conversations", table: "conversation_messages",
    fields: ["id","session_id","occurred_on","role","content","source_kind"],
    create: "CREATE TABLE IF NOT EXISTS conversation_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, occurred_on TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, source_kind TEXT NOT NULL)"
  },
  {
    key: "observations", table: "observations",
    fields: ["id","occurred_on","kind","category","content","source"],
    create: "CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL)"
  },
  {
    key: "metrics", table: "metrics",
    fields: ["id","occurred_on","name","value","unit","note"],
    create: "CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, note TEXT NOT NULL)"
  },
  {
    key: "plans", table: "plans",
    fields: ["id","title","start_date","end_date","status","details"],
    create: "CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, title TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL, details TEXT NOT NULL)"
  },
  {
    key: "reports", table: "reports",
    fields: ["id","occurred_on","title","content"],
    create: "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL)"
  }
];
const send = (data, status = 200) => Response.json(data, {
  status, headers: {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
function validate(data) {
  if (!data || data.version !== 1) throw Error("Unsupported data version");
  let total = 0;
  for (const d of definitions) {
    const rows = data[d.key];
    if (!Array.isArray(rows) || rows.length > 2000) throw Error("Invalid section: " + d.key);
    total += rows.length;
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row.id !== "string" || !row.id || seen.has(row.id)) throw Error("Invalid/duplicate record ID");
      seen.add(row.id);
      for (const field of d.fields) {
        const value = row[field];
        if (value == null || typeof value === "object" || String(value).length > 60000) throw Error("Invalid field " + field);
      }
      if (d.key === "metrics" && (typeof row.value !== "number" || !Number.isFinite(row.value))) throw Error("Invalid metric");
      if (d.key === "conversations" && (!["user","assistant"].includes(row.role) || !["summary","verbatim"].includes(row.source_kind))) throw Error("Invalid conversation");
      if (d.key === "observations" && !["fact","hypothesis"].includes(row.kind)) throw Error("Invalid observation");
    }
  }
  if (total > 4000) throw Error("Too many records for one sync");
}
async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function onRequestGet({request,env}) {
  if (!env.DB) return send({ok:false,error:"Cloudflare D1 binding 'DB' is not configured"},503);
  try {
    const url = new URL("/data/workbench.json", request.url);
    const asset = await env.ASSETS.fetch(new Request(url,{headers:{"Cache-Control":"no-cache"}}));
    if (!asset.ok) throw Error("Source asset unavailable");
    const raw = await asset.text();
    const data = JSON.parse(raw);
    validate(data);
    const hash = await sha256(raw);
    const db = env.DB;
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS sync_state (k TEXT PRIMARY KEY,value TEXT NOT NULL)"),
      ...definitions.map(d=>db.prepare(d.create))
    ]);
    const recorded = await db.prepare("SELECT value FROM sync_state WHERE k='hash'").first();
    if (!recorded || recorded.value !== hash) {
      const queries=[];
      for (const d of definitions) queries.push(db.prepare("DELETE FROM "+d.table));
      for (const d of definitions) {
        const sql = "INSERT INTO "+d.table+" ("+d.fields.join(",")+") VALUES ("+d.fields.map(()=>"?").join(",")+")";
        for (const row of data[d.key]) queries.push(db.prepare(sql).bind(...d.fields.map(f=>row[f])));
      }
      queries.push(db.prepare("INSERT INTO sync_state(k,value) VALUES('hash',?) ON CONFLICT(k) DO UPDATE SET value=excluded.value").bind(hash));
      queries.push(db.prepare("INSERT INTO sync_state(k,value) VALUES('updated_at',?) ON CONFLICT(k) DO UPDATE SET value=excluded.value").bind(data.updated_at||""));
      // The batch commits atomically; incomplete mirrors are never shown.
      await db.batch(queries);
    }
    const rows = await Promise.all(definitions.map(d => db.prepare("SELECT * FROM "+d.table).all()));
    const output={ok:true,version:1,updated_at:data.updated_at,synced_hash:hash};
    definitions.forEach((d,i)=>output[d.key]=rows[i].results);
    output.conversations.sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.id.localeCompare(b.id));
    output.observations.sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on));
    output.reports.sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on));
    return send(output);
  } catch(error) {
    console.error("family-growth sync failure",error);
    return send({ok:false,error:"Unable to sync or read D1. Inspect Pages Function logs."},503);
  }
}