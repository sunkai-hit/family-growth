const RECORD_TYPES = new Set(["daily_homework","extra_work","exam_scores","teacher_feedback"]);
const CREATE = "CREATE TABLE IF NOT EXISTS user_records (id TEXT PRIMARY KEY, record_date TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'pending', commit_sha TEXT)";
const INDEX = "CREATE INDEX IF NOT EXISTS idx_user_records_date_type ON user_records(record_date DESC, type)";

const send=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});

function cleanString(v,max=4000){
  if(v==null)return "";
  const s=String(v).trim();
  if(s.length>max)throw Error("Field too long");
  return s;
}
function numberOrNull(v,min=0,max=100000){
  if(v===""||v==null)return null;
  const n=Number(v);
  if(!Number.isFinite(n)||n<min||n>max)throw Error("Invalid number");
  return n;
}
function dateOK(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v||""); }

function validatePayload(type,payload){
  if(!payload||typeof payload!=="object"||Array.isArray(payload))throw Error("Invalid payload");
  if(type==="daily_homework"){
    if(!Array.isArray(payload.subjects)||!payload.subjects.length||payload.subjects.length>20)throw Error("Add at least one subject");
    const subjects=payload.subjects.map(x=>({
      subject:cleanString(x.subject,40),
      status:["done","partial","not_done","no_homework"].includes(x.status)?x.status:"done",
      assigned_count:numberOrNull(x.assigned_count,0,10000),
      completed_count:numberOrNull(x.completed_count,0,10000),
      wrong_count:numberOrNull(x.wrong_count,0,10000),
      error_types:cleanString(x.error_types,1000),
      correction:["done","partial","not_done","not_needed"].includes(x.correction)?x.correction:"not_needed",
      duration_minutes:numberOrNull(x.duration_minutes,0,1440),
      note:cleanString(x.note,1000)
    }));
    if(subjects.some(x=>!x.subject))throw Error("Subject is required");
    return {subjects,note:cleanString(payload.note,2000)};
  }
  if(type==="extra_work"){
    const out={
      subject:cleanString(payload.subject,40),content:cleanString(payload.content,2000),
      planned_count:numberOrNull(payload.planned_count,0,10000),
      completed_count:numberOrNull(payload.completed_count,0,10000),
      wrong_count:numberOrNull(payload.wrong_count,0,10000),
      error_types:cleanString(payload.error_types,1200),
      duration_minutes:numberOrNull(payload.duration_minutes,0,1440),
      independence:["independent","with_help","reference"].includes(payload.independence)?payload.independence:"independent",
      note:cleanString(payload.note,2000)
    };
    if(!out.subject||!out.content)throw Error("Subject and content are required");
    return out;
  }
  if(type==="exam_scores"){
    const exam_name=cleanString(payload.exam_name,100);
    if(!exam_name)throw Error("Exam name is required");
    if(!Array.isArray(payload.subjects)||!payload.subjects.length||payload.subjects.length>20)throw Error("Add at least one score");
    const subjects=payload.subjects.map(x=>({
      subject:cleanString(x.subject,40),
      score:numberOrNull(x.score,0,1000),
      full_score:numberOrNull(x.full_score,1,1000),
      wrong_count:numberOrNull(x.wrong_count,0,10000),
      error_types:cleanString(x.error_types,1200),
      class_rank:numberOrNull(x.class_rank,1,100000),
      grade_rank:numberOrNull(x.grade_rank,1,100000),
      note:cleanString(x.note,1000)
    }));
    if(subjects.some(x=>!x.subject||x.score==null||x.full_score==null||x.score>x.full_score))throw Error("Invalid exam score");
    return {exam_name,subjects,note:cleanString(payload.note,2000)};
  }
  if(type==="teacher_feedback"){
    const out={
      subject:cleanString(payload.subject,40),
      source:cleanString(payload.source,80),
      category:["positive","reminder","problem","neutral"].includes(payload.category)?payload.category:"neutral",
      content:cleanString(payload.content,4000),
      follow_up:cleanString(payload.follow_up,2000)
    };
    if(!out.content)throw Error("Feedback content is required");
    return out;
  }
  throw Error("Unsupported record type");
}

function safeEqual(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
  let diff=0; for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
}
function toBase64Utf8(str){
  const bytes=new TextEncoder().encode(str); let bin="";
  for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(bin);
}
function fromBase64Utf8(str){
  const bin=atob(str.replace(/\n/g,"")); const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function ghHeaders(token){
  return {
    "Accept":"application/vnd.github+json",
    "Authorization":"Bearer "+token,
    "X-GitHub-Api-Version":"2026-03-10",
    "User-Agent":"family-growth-workbench"
  };
}

async function syncPending(env,db){
  if(!env.GITHUB_TOKEN)return {synced:false,reason:"github_not_configured",count:0};
  const pending=await db.prepare("SELECT id,record_date,type,payload_json,created_at,updated_at FROM user_records WHERE sync_status!='synced' ORDER BY created_at ASC LIMIT 100").all();
  const items=pending.results||[];
  if(!items.length)return {synced:true,count:0};

  const api="https://api.github.com/repos/sunkai-hit/family-growth/contents/data/records.json";
  let current={version:1,updated_at:new Date().toISOString(),records:[]},sha=null;
  const get=await fetch(api+"?ref=main",{headers:ghHeaders(env.GITHUB_TOKEN)});
  if(get.ok){
    const body=await get.json(); sha=body.sha;
    try{current=JSON.parse(fromBase64Utf8(body.content||""));}catch(_){}
  }else if(get.status!==404){
    throw Error("GitHub read failed: "+get.status);
  }
  if(!Array.isArray(current.records))current.records=[];
  const known=new Set(current.records.map(r=>r.id));
  for(const row of items){
    if(known.has(row.id))continue;
    current.records.push({
      id:row.id,record_date:row.record_date,type:row.type,
      payload:JSON.parse(row.payload_json),created_at:row.created_at,updated_at:row.updated_at
    });
    known.add(row.id);
  }
  current.version=1; current.updated_at=new Date().toISOString();
  const body={
    message:"[CF-Pages-Skip] data: sync "+items.length+" workbench record(s)",
    content:toBase64Utf8(JSON.stringify(current,null,2)+"\n"),
    branch:"main"
  };
  if(sha)body.sha=sha;
  const put=await fetch(api,{method:"PUT",headers:{...ghHeaders(env.GITHUB_TOKEN),"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!put.ok)throw Error("GitHub write failed: "+put.status+" "+(await put.text()).slice(0,300));
  const written=await put.json();
  const commitSha=written.commit?.sha||"";
  const marks=items.map(x=>db.prepare("UPDATE user_records SET sync_status='synced', commit_sha=?, updated_at=? WHERE id=?").bind(commitSha,new Date().toISOString(),x.id));
  if(marks.length)await db.batch(marks);
  return {synced:true,count:items.length,commit_sha:commitSha};
}

export async function onRequestGet({env}){
  if(!env.DB)return send({ok:false,error:"D1 not configured"},503);
  await env.DB.batch([env.DB.prepare(CREATE),env.DB.prepare(INDEX)]);
  const rows=await env.DB.prepare("SELECT id,record_date,type,payload_json,created_at,updated_at,sync_status,commit_sha FROM user_records ORDER BY record_date DESC,created_at DESC LIMIT 1000").all();
  return send({ok:true,records:(rows.results||[]).map(r=>({...r,payload:JSON.parse(r.payload_json)}))});
}

export async function onRequestPost({request,env}){
  if(!env.DB)return send({ok:false,error:"D1 not configured"},503);
  if(!env.WORKBENCH_WRITE_KEY)return send({ok:false,error:"Write access has not been configured yet"},503);
  const key=request.headers.get("X-Workbench-Key")||"";
  if(!safeEqual(key,env.WORKBENCH_WRITE_KEY))return send({ok:false,error:"Invalid edit code"},401);

  try{
    const size=Number(request.headers.get("content-length")||"0");
    if(size>100000)return send({ok:false,error:"Request too large"},413);
    const body=await request.json();
    const id=cleanString(body.id,100);
    const type=cleanString(body.type,40);
    const record_date=cleanString(body.record_date,20);
    if(!/^[A-Za-z0-9_-]{10,100}$/.test(id)||!RECORD_TYPES.has(type)||!dateOK(record_date))throw Error("Invalid record metadata");
    const payload=validatePayload(type,body.payload);
    const now=new Date().toISOString();
    await env.DB.batch([env.DB.prepare(CREATE),env.DB.prepare(INDEX)]);
    const result=await env.DB.prepare(
      "INSERT INTO user_records(id,record_date,type,payload_json,created_at,updated_at,sync_status) VALUES(?,?,?,?,?,?,'pending') ON CONFLICT(id) DO NOTHING"
    ).bind(id,record_date,type,JSON.stringify(payload),now,now).run();

    let gh={synced:false,reason:"not_attempted",count:0};
    try{gh=await syncPending(env,env.DB);}catch(error){console.error("GitHub sync failed",error);gh={synced:false,reason:"github_sync_failed",count:0};}
    const saved=await env.DB.prepare("SELECT id,record_date,type,payload_json,created_at,updated_at,sync_status,commit_sha FROM user_records WHERE id=?").bind(id).first();
    return send({ok:true,created:!!result.meta?.changes,github:gh,record:{...saved,payload:JSON.parse(saved.payload_json)}});
  }catch(error){
    console.error("record validation/write failed",error);
    return send({ok:false,error:error.message||"Unable to save record"},400);
  }
}