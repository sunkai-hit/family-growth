import {ensureAuthSchema,send} from "../../_lib/auth.js";
import {readJson,writeJson} from "../../_lib/github-data.js";

function validCode(v){return /^FG-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(v||"")}
export async function onRequestGet({request,env}){
  try{
    await ensureAuthSchema(env);
    const url=new URL(request.url);
    const code=(url.searchParams.get("code")||"").toUpperCase();
    const deviceId=url.searchParams.get("device_id")||"";
    if(!validCode(code)||!/^[A-Za-z0-9_-]{16,100}$/.test(deviceId))return send({ok:false,error:"Invalid request"},400);
    const local=await env.DB.prepare("SELECT * FROM auth_requests WHERE request_code=? AND device_id=?").bind(code,deviceId).first();
    if(!local)return send({ok:true,status:"unknown"},200);

    const remote=await readJson(env,"auth/requests/"+code+".json",{allow404:true,fallback:null});
    if(!remote.exists||!remote.data)return send({ok:true,status:"pending",expires_at:local.expires_at});

    const item=remote.data;
    if(item.device_id!==deviceId)return send({ok:false,error:"Device mismatch"},403);
    if(item.status==="rejected"){
      await env.DB.prepare("UPDATE auth_requests SET status='rejected' WHERE request_code=?").bind(code).run();
      return send({ok:true,status:"rejected"});
    }
    const now=new Date().toISOString();
    if(item.status!=="approved"){
      if(local.expires_at<=now)return send({ok:true,status:"expired"});
      return send({ok:true,status:"pending",expires_at:local.expires_at});
    }

    const approvedAt=item.approved_at||now;
    const publicJwk=JSON.stringify(item.public_jwk);
    const existing=await readJson(env,"auth/devices/"+deviceId+".json",{allow404:true,fallback:null});
    if(existing.exists&&existing.data?.status==="revoked"){
      await env.DB.prepare(
        "INSERT INTO authorized_devices(device_id,label,public_jwk,status,approved_at,last_seen_at) VALUES(?,?,?,?,?,NULL) ON CONFLICT(device_id) DO UPDATE SET status='revoked'"
      ).bind(deviceId,item.label||local.label,publicJwk,"revoked",approvedAt).run();
      return send({ok:true,status:"revoked"});
    }
    if(!existing.exists){
      await writeJson(env,"auth/devices/"+deviceId+".json",{
        version:1,device_id:deviceId,label:item.label||local.label,public_jwk:item.public_jwk,
        status:"approved",approved_at:approvedAt,request_code:code
      },{message:"auth: approve device "+deviceId});
    }
    await env.DB.prepare(
      "INSERT INTO authorized_devices(device_id,label,public_jwk,status,approved_at,last_seen_at) VALUES(?,?,?,?,?,NULL) ON CONFLICT(device_id) DO UPDATE SET label=excluded.label,public_jwk=excluded.public_jwk,status='approved',approved_at=excluded.approved_at"
    ).bind(deviceId,item.label||local.label,publicJwk,"approved",approvedAt).run();
    await env.DB.prepare("UPDATE auth_requests SET status='approved' WHERE request_code=?").bind(code).run();
    return send({ok:true,status:"approved",label:item.label||local.label,approved_at:approvedAt});
  }catch(error){
    console.error("auth status failed",error);
    return send({ok:false,error:"授权状态读取失败，请检查私有仓库凭证。"},503);
  }
}
