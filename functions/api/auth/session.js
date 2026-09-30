import {ensureAuthSchema,randomBase64Url,send,sha256Hex,verifyDeviceSignature} from "../../_lib/auth.js";

export async function onRequestPost({request,env}){
  try{
    await ensureAuthSchema(env);
    const body=await request.json();
    const deviceId=String(body.device_id||""),challengeId=String(body.challenge_id||""),signature=String(body.signature||"");
    if(!deviceId||!challengeId||!signature)return send({ok:false,error:"Invalid request"},400);
    const now=new Date().toISOString();
    const challenge=await env.DB.prepare(
      "SELECT * FROM auth_challenges WHERE challenge_id=? AND device_id=?"
    ).bind(challengeId,deviceId).first();
    if(!challenge||challenge.used||challenge.expires_at<=now)return send({ok:false,error:"验证挑战已过期，请重试"},401);
    const device=await env.DB.prepare("SELECT * FROM authorized_devices WHERE device_id=?").bind(deviceId).first();
    if(!device||device.status!=="approved")return send({ok:false,error:"设备尚未授权"},403);
    const ok=await verifyDeviceSignature(JSON.parse(device.public_jwk),challenge.challenge_text,signature);
    await env.DB.prepare("UPDATE auth_challenges SET used=1 WHERE challenge_id=?").bind(challengeId).run();
    if(!ok)return send({ok:false,error:"设备签名验证失败"},401);

    const token=randomBase64Url(32),hash=await sha256Hex(token);
    const expires=new Date(Date.now()+60*60*1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO auth_sessions(token_hash,device_id,created_at,expires_at) VALUES(?,?,?,?)"
    ).bind(hash,deviceId,now,expires).run();
    await env.DB.prepare("UPDATE authorized_devices SET last_seen_at=? WHERE device_id=?").bind(now,deviceId).run();
    await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at<?").bind(now).run();
    return send({ok:true,token,expires_at:expires,device:{device_id:deviceId,label:device.label}});
  }catch(error){
    console.error("session creation failed",error);
    return send({ok:false,error:"设备验证失败"},401);
  }
}
