import {requireSession,send} from "../../_lib/auth.js";
export async function onRequestGet({request,env}){
  try{
    const session=await requireSession(request,env);
    if(!session)return send({ok:false,authorized:false},401);
    return send({ok:true,authorized:true,device:{device_id:session.device_id,label:session.label},expires_at:session.expires_at});
  }catch(error){
    console.error("auth me failed",error);
    return send({ok:false,authorized:false},503);
  }
}
