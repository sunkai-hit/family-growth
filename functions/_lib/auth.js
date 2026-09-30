export const AUTH_TABLES = [
  "CREATE TABLE IF NOT EXISTS authorized_devices (device_id TEXT PRIMARY KEY, label TEXT NOT NULL, public_jwk TEXT NOT NULL, status TEXT NOT NULL, approved_at TEXT NOT NULL, last_seen_at TEXT)",
  "CREATE TABLE IF NOT EXISTS auth_requests (request_code TEXT PRIMARY KEY, device_id TEXT NOT NULL, label TEXT NOT NULL, public_jwk TEXT NOT NULL, requested_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS auth_challenges (challenge_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, challenge_text TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)"
];

export async function ensureAuthSchema(env){
  if(!env.DB)throw Error("D1 not configured");
  await env.DB.batch(AUTH_TABLES.map(sql=>env.DB.prepare(sql)));
}
export function send(data,status=200){
  return Response.json(data,{status,headers:{
    "Cache-Control":"no-store",
    "Pragma":"no-cache",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer"
  }});
}
export function safeEqual(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
export function randomBase64Url(bytes=32){
  const a=new Uint8Array(bytes);crypto.getRandomValues(a);
  let bin="";for(const b of a)bin+=String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function requestCode(){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a=new Uint8Array(8);crypto.getRandomValues(a);
  let s="";for(const b of a)s+=alphabet[b%alphabet.length];
  return "FG-"+s.slice(0,4)+"-"+s.slice(4);
}
export async function sha256Hex(text){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function decodeBase64Url(str){
  const pad="=".repeat((4-str.length%4)%4);
  const bin=atob(str.replace(/-/g,"+").replace(/_/g,"/")+pad);
  const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
export async function verifyDeviceSignature(publicJwk,message,signature){
  const key=await crypto.subtle.importKey(
    "jwk",publicJwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]
  );
  return crypto.subtle.verify(
    {name:"ECDSA",hash:"SHA-256"},key,decodeBase64Url(signature),new TextEncoder().encode(message)
  );
}
export async function requireSession(request,env){
  await ensureAuthSchema(env);
  const auth=request.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const raw=auth.slice(7).trim();
  if(!raw)return null;
  const hash=await sha256Hex(raw);
  const now=new Date().toISOString();
  const row=await env.DB.prepare(
    "SELECT s.device_id,s.expires_at,d.label,d.status FROM auth_sessions s JOIN authorized_devices d ON d.device_id=s.device_id WHERE s.token_hash=?"
  ).bind(hash).first();
  if(!row||row.status!=="approved"||row.expires_at<=now)return null;
  await env.DB.prepare("UPDATE authorized_devices SET last_seen_at=? WHERE device_id=?").bind(now,row.device_id).run();
  return row;
}
