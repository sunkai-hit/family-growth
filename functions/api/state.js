import {requireSession,send,sha256Hex} from "../_lib/auth.js";
import {readJson} from "../_lib/github-data.js";

const definitions = [
  {
    key:"conversations",table:"conversation_messages",
    fields:["id","session_id","occurred_on","role","content","source_kind"],
    create:"CREATE TABLE IF NOT EXISTS conversation_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, occurred_on TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, source_kind TEXT NOT NULL)"
  },
  {
    key:"observations",table:"observations",
    fields:["id","occurred_on","kind","category","content","source"],
    create:"CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL)"
  },
  {
    key:"metrics",table:"metrics",
    fields:["id","occurred_on","name","value","unit","note"],
    create:"CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, note TEXT NOT NULL)"
  },
  {
    key:"plans",table:"plans",
    fields:["id","title","start_date","end_date","status","details"],
    create:"CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, title TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL, details TEXT NOT NULL)"
  },
  {
    key:"reports",table:"reports",
    fields:["id","occurred_on","title","content"],
    create:"CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL)"
  }
];
const userRecordsCreate="CREATE TABLE IF NOT EXISTS user_records (id TEXT PRIMARY KEY, record_date TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'pending', commit_sha TEXT)";
const userRecordsIndex="CREATE INDEX IF NOT EXISTS idx_user_records_date_type ON user_records(record_date DESC,type)";

function validate(data){
  if(!data||data.version!==1)throw Error("Unsupported data version");
  let total=0;
  for(const d of definitions){
    const rows=data[d.key];
    if(!Array.isArray(rows)||rows.length>5000)throw Error("Invalid section: "+d.key);
    total+=rows.length;
    const seen=new Set();
    for(const row of rows){
      if(!row||typeof row.id!=="string"||!row.id||seen.has(row.id))throw Error("Invalid/duplicate record ID");
      seen.add(row.id);
      for(const field of d.fields){
        const value=row[field];
        if(value==null||typeof value==="object"||String(value).length>60000)throw Error("Invalid field "+field);
      }
      if(d.key==="metrics"&&(typeof row.value!=="number"||!Number.isFinite(row.value)))throw Error("Invalid metric");
      if(d.key==="conversations"&&(!["user","assistant"].includes(row.role)||!["summary","verbatim"].includes(row.source_kind)))throw Error("Invalid conversation");
      if(d.key==="observations"&&!["fact","hypothesis"].includes(row.kind))throw Error("Invalid observation");
    }
  }
  if(total>10000)throw Error("Too many records");
}
function decodeRecords(rows){
  return rows.map(row=>{
    let payload={};try{payload=JSON.parse(row.payload_json)}catch(_){}
    return {
      id:row.id,record_date:row.record_date,type:row.type,payload,
      created_at:row.created_at,updated_at:row.updated_at,
      sync_status:row.sync_status,commit_sha:row.commit_sha||null
    };
  });
}

export async function onRequestGet({request,env}){
  if(!env.DB)return send({ok:false,error:"D1 not configured"},503);
  const session=await requireSession(request,env);
  if(!session)return send({ok:false,authorized:false,error:"Device authorization required"},401);

  try{
    const source=await readJson(env,"workbench/workbench.json");
    const data=source.data,raw=source.raw||JSON.stringify(data);
    validate(data);
    const hash=await sha256Hex(raw),db=env.DB;

    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS sync_state (k TEXT PRIMARY KEY,value TEXT NOT NULL)"),
      ...definitions.map(d=>db.prepare(d.create)),
      db.prepare(userRecordsCreate),
      db.prepare(userRecordsIndex)
    ]);

    const recorded=await db.prepare("SELECT value FROM sync_state WHERE k='private_workbench_hash'").first();
    if(!recorded||recorded.value!==hash){
      const queries=[];
      for(const d of definitions)queries.push(db.prepare("DELETE FROM "+d.table));
      for(const d of definitions){
        const sql="INSERT INTO "+d.table+" ("+d.fields.join(",")+") VALUES ("+d.fields.map(()=>"?").join(",")+")";
        for(const row of data[d.key])queries.push(db.prepare(sql).bind(...d.fields.map(f=>row[f])));
      }
      queries.push(db.prepare("INSERT INTO sync_state(k,value) VALUES('private_workbench_hash',?) ON CONFLICT(k) DO UPDATE SET value=excluded.value").bind(hash));
      queries.push(db.prepare("INSERT INTO sync_state(k,value) VALUES('updated_at',?) ON CONFLICT(k) DO UPDATE SET value=excluded.value").bind(data.updated_at||""));
      await db.batch(queries);
    }

    const rows=await Promise.all(definitions.map(d=>db.prepare("SELECT * FROM "+d.table).all()));
    const userRows=await db.prepare("SELECT id,record_date,type,payload_json,created_at,updated_at,sync_status,commit_sha FROM user_records ORDER BY record_date DESC,created_at DESC LIMIT 1000").all();
    const output={
      ok:true,authorized:true,version:1,updated_at:data.updated_at,
      synced_hash:hash,sync_source:"private-github",
      device:{device_id:session.device_id,label:session.label}
    };
    definitions.forEach((d,i)=>output[d.key]=rows[i].results);
    output.records=decodeRecords(userRows.results||[]);
    output.conversations.sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.id.localeCompare(b.id));
    output.observations.sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on));
    output.reports.sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on));
    return send(output);
  }catch(error){
    console.error("private workbench state failure",error);
    return send({ok:false,error:"Unable to read private workbench data. Check data repository access."},503);
  }
}
