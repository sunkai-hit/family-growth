import {ensureAuthSchema,randomBase64Url,send} from "../../_lib/auth.js";
import {readJson} from "../../_lib/github-data.js";

export async function onRequestPost({request,env}){
  try{
    await ensureAuthSchema(env);
    const body=await request.json();
    const deviceId=String(body.device_id||"");
    if(!/^[A-Za-z0-9_-]{16,100}$/.test(deviceId))return send({ok:false,error:"Invalid device"},400);

    const remote=await readJson(env,"auth/devices/"+deviceId+".json",{allow404:true,fallback:null});
    if(!remote.exists||remote.data?.status!=="approved"){
      await env.DB.prepare("UPDATE authorized_devices SET status='revoked' WHERE device_id=?").bind(deviceId).run();
      return send({ok:false,error:"设备尚未授权或授权已撤销"},403);
    }

    const rd=remote.data;
    await env.DB.prepare(
      "INSERT INTO authorized_devices(device_id,label,public_jwk,status,approved_at,last_seen_at) VALUES(?,?,?,?,?,NULL) ON CONFLICT(device_id) DO UPDATE SET label=excluded.label,public_jwk=excluded.public_jwk,status=excluded.status,approved_at=excluded.approved_at"
    ).bind(deviceId,String(rd.label||"已授权设备"),JSON.stringify(rd.public_jwk),"approved",String(rd.approved_at||new Date().toISOString())).run();

    const now=new Date(),expires=new Date(now.getTime()+5*60*1000);
    const challengeId=randomBase64Url(18),challenge="FG-AUTH:"+deviceId+":"+randomBase64Url(32);
    await env.DB.prepare(
      "INSERT INTO auth_challenges(challenge_id,device_id,challenge_text,created_at,expires_at,used) VALUES(?,?,?,?,?,0)"
    ).bind(challengeId,deviceId,challenge,now.toISOString(),expires.toISOString()).run();
    await env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at<? OR used=1").bind(new Date(now.getTime()-86400000).toISOString()).run();
    return send({ok:true,challenge_id:challengeId,challenge,expires_at:expires.toISOString()});
  }catch(error){
    console.error("challenge failed",error);
    return send({ok:false,error:"无法建立设备验证挑战，请检查私有数据仓库访问。"},503);
  }
}
