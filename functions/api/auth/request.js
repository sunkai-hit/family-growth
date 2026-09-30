import {ensureAuthSchema,requestCode,safeEqual,send} from "../../_lib/auth.js";
import {writeJson} from "../../_lib/github-data.js";

function clean(v,max){const s=String(v||"").trim();if(!s||s.length>max)throw Error("Invalid field");return s}
function validJwk(jwk){
  return jwk&&jwk.kty==="EC"&&jwk.crv==="P-256"&&typeof jwk.x==="string"&&typeof jwk.y==="string"&&jwk.x.length<100&&jwk.y.length<100;
}
export async function onRequestPost({request,env}){
  if(!env.WORKBENCH_WRITE_KEY)return send({ok:false,error:"Edit code is not configured"},503);
  if(!env.GITHUB_TOKEN)return send({ok:false,error:"Private data repository credential is not configured"},503);
  try{
    const body=await request.json();
    const editCode=String(body.edit_code||"");
    if(!safeEqual(editCode,env.WORKBENCH_WRITE_KEY))return send({ok:false,error:"编辑码不正确"},401);
    const deviceId=clean(body.device_id,100);
    const label=clean(body.label,80);
    if(!/^[A-Za-z0-9_-]{16,100}$/.test(deviceId)||!validJwk(body.public_jwk))throw Error("Invalid device identity");
    await ensureAuthSchema(env);
    let code="";
    for(let i=0;i<5;i++){
      const candidate=requestCode();
      const exists=await env.DB.prepare("SELECT request_code FROM auth_requests WHERE request_code=?").bind(candidate).first();
      if(!exists){code=candidate;break}
    }
    if(!code)throw Error("Unable to allocate request code");
    const now=new Date(),expires=new Date(now.getTime()+30*60*1000);
    const payload={
      version:1,
      request_code:code,
      device_id:deviceId,
      label,
      public_jwk:body.public_jwk,
      status:"pending",
      requested_at:now.toISOString(),
      expires_at:expires.toISOString()
    };
    await env.DB.prepare(
      "INSERT INTO auth_requests(request_code,device_id,label,public_jwk,requested_at,expires_at,status) VALUES(?,?,?,?,?,?,?)"
    ).bind(code,deviceId,label,JSON.stringify(body.public_jwk),payload.requested_at,payload.expires_at,"pending").run();
    try{
      await writeJson(env,"auth/requests/"+code+".json",payload,{message:"auth: request device "+code});
    }catch(error){
      await env.DB.prepare("DELETE FROM auth_requests WHERE request_code=?").bind(code).run();
      console.error("device auth request archive failed",error);
      return send({ok:false,error:"无法写入私有数据仓库。请确认 GITHUB_TOKEN 已授权 family-growth-data。"},503);
    }
    return send({ok:true,request_code:code,expires_at:payload.expires_at,label});
  }catch(error){
    console.error("device auth request failed",error);
    return send({ok:false,error:error.message||"Unable to request authorization"},400);
  }
}
