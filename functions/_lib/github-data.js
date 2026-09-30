export const DATA_REPO = "sunkai-hit/family-growth-data";
const API_VERSION = "2022-11-28";

function headers(token){
  return {
    "Accept":"application/vnd.github+json",
    "Authorization":"Bearer "+token,
    "X-GitHub-Api-Version":API_VERSION,
    "User-Agent":"family-growth-workbench"
  };
}
function fileUrl(path){
  const safe=path.split("/").map(encodeURIComponent).join("/");
  return "https://api.github.com/repos/"+DATA_REPO+"/contents/"+safe;
}
function decodeBase64Utf8(str){
  const bin=atob(String(str||"").replace(/\n/g,""));
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function encodeBase64Utf8(str){
  const bytes=new TextEncoder().encode(str);
  let bin="";
  for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(bin);
}

export async function readJson(env,path,{allow404=false,fallback=null}={}){
  if(!env.GITHUB_TOKEN)throw Error("GITHUB_TOKEN is not configured");
  const res=await fetch(fileUrl(path)+"?ref=main",{headers:headers(env.GITHUB_TOKEN)});
  if(res.status===404&&allow404)return {data:fallback,sha:null,exists:false};
  if(!res.ok)throw Error("Private data repository read failed ("+res.status+")");
  const body=await res.json();
  const raw=decodeBase64Utf8(body.content||"");
  return {data:JSON.parse(raw),raw,sha:body.sha||null,exists:true};
}

export async function writeJson(env,path,data,{sha=null,message="data: update private workbench"}={}){
  if(!env.GITHUB_TOKEN)throw Error("GITHUB_TOKEN is not configured");
  const body={
    message,
    content:encodeBase64Utf8(JSON.stringify(data,null,2)+"\n"),
    branch:"main"
  };
  if(sha)body.sha=sha;
  const res=await fetch(fileUrl(path),{
    method:"PUT",
    headers:{...headers(env.GITHUB_TOKEN),"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if(!res.ok)throw Error("Private data repository write failed ("+res.status+"): "+(await res.text()).slice(0,240));
  const out=await res.json();
  return {commit_sha:out.commit?.sha||"",content_sha:out.content?.sha||""};
}
