const $=id=>document.getElementById(id);
const state={
  data:null,
  page:"home",
  recordTab:"daily",
  detailReturn:"home",
  authToken:null,
  device:null,
  pages:{records:1,conversations:1,timeline:1,plans:1,reports:1}
};
const PAGE_SIZE={records:10,conversations:6,timeline:8,plans:5,reports:5};
const DEFAULT_SUBJECTS=["语文","数学","英语","道法","历史","地理","生物","物理"];
const sectionText={
  home:["和成长，保持同频。","对话驱动的成长档案，让讨论和真实记录形成长期积累。"],
  records:["记录今天，理解长期。","学校作业、额外学习、考试和老师反馈，统一进入同一条成长数据线。"],
  conversations:["每一次讨论，都值得保留。","一次“家长反馈 + AI 建议”视为一条完整讨论记录。"],
  timeline:["让变化，有迹可循。","记录观察与尚待验证的想法，方便事后复盘。"],
  trends:["用数据，减少猜测。","使用固定指标长期观察变化，不让指标随录入内容无限增长。"],
  plans:["讨论之后，形成行动。","计划可持续记录执行进度；分析报告保留完整详情。"],
  detail:["查看详情。","完整内容与执行记录。"]
};
const typeNames={
  daily_homework:"学校作业",
  extra_work:"额外作业",
  exam_scores:"考试成绩",
  teacher_feedback:"老师反馈",
  plan_progress:"计划进度"
};
const statusNames={done:"已完成",partial:"部分完成",not_done:"未完成",no_homework:"无作业"};
const planStatusNames={suggested:"建议稿",not_started:"未开始",in_progress:"进行中",completed:"已完成",paused:"暂停"};
const FIXED_METRICS=[
  {id:"homework_completion",label:"学校作业完成率",unit:"%",help:"已完成科目 ÷ 当天实际有作业的已记录科目"},
  {id:"homework_wrong",label:"学校作业错题数",unit:"题",help:"已填写错题数的科目合计"},
  {id:"homework_correction",label:"有错科目订正率",unit:"%",help:"已完成订正的有错科目 ÷ 有错科目"},
  {id:"extra_completion",label:"额外作业完成率",unit:"%",help:"实际完成题量 ÷ 计划题量"},
  {id:"extra_wrong_rate",label:"额外作业错题率",unit:"%",help:"错题数 ÷ 实际完成题量"},
  {id:"extra_duration",label:"额外学习用时",unit:"分钟",help:"当日额外学习用时合计"},
  {id:"exam_score_rate",label:"考试得分率",unit:"%",help:"得分 ÷ 满分"}
];
const AUTH_DB_NAME="family-growth-device-v1";
const AUTH_DB_STORE="device";
const AUTH_PENDING_KEY="family-growth-pending-auth-v1";
let authPollTimer=null;

function openDeviceDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(AUTH_DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(AUTH_DB_STORE))req.result.createObjectStore(AUTH_DB_STORE,{keyPath:"id"})};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function readIdentity(){
  const db=await openDeviceDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(AUTH_DB_STORE,"readonly");
    const req=tx.objectStore(AUTH_DB_STORE).get("identity");
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}
async function saveIdentity(identity){
  const db=await openDeviceDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(AUTH_DB_STORE,"readwrite");
    tx.objectStore(AUTH_DB_STORE).put(identity);
    tx.oncomplete=()=>resolve(identity);
    tx.onerror=()=>reject(tx.error);
  });
}
async function ensureIdentity(){
  const existing=await readIdentity();
  if(existing?.device_id&&existing?.private_key&&existing?.public_key)return existing;
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
  const identity={
    id:"identity",
    device_id:"dev_"+crypto.randomUUID().replace(/-/g,""),
    private_key:pair.privateKey,
    public_key:pair.publicKey,
    created_at:new Date().toISOString()
  };
  return saveIdentity(identity);
}
function arrayBufferToBase64Url(buf){
  const bytes=new Uint8Array(buf);let bin="";
  for(const b of bytes)bin+=String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function pendingAuth(){
  try{return JSON.parse(localStorage.getItem(AUTH_PENDING_KEY)||"null")}catch{return null}
}
function setPendingAuth(v){
  if(v)localStorage.setItem(AUTH_PENDING_KEY,JSON.stringify(v));
  else localStorage.removeItem(AUTH_PENDING_KEY);
}
function showAuthView(name){
  for(const id of ["auth-checking","auth-request","auth-pending"])$(id).hidden=id!=="auth-"+name;
}
function authMessage(text,kind=""){
  const el=$("auth-message");
  if(!text){el.hidden=true;el.textContent="";el.className="auth-message";return}
  el.hidden=false;el.textContent=text;el.className="auth-message "+kind;
}
function defaultDeviceLabel(){
  const ua=navigator.userAgent;
  const browser=/Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Safari\//.test(ua)?"Safari":/Firefox\//.test(ua)?"Firefox":"浏览器";
  const os=/Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"Mac":/Android/.test(ua)?"Android":/iPhone|iPad/.test(ua)?"iPhone/iPad":"设备";
  return os+" · "+browser;
}
async function protectedFetch(url,options={}){
  if(!state.authToken)throw Error("设备会话未建立");
  const headers=new Headers(options.headers||{});
  headers.set("Authorization","Bearer "+state.authToken);
  return fetch(url,{...options,headers});
}
async function verifyExistingSession(){
  const token=sessionStorage.getItem("family-growth-session");
  if(!token)return false;
  try{
    const res=await fetch("/api/auth/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const out=await res.json();
    if(!res.ok||!out.ok)return false;
    state.authToken=token;state.device=out.device;return true;
  }catch{return false}
}
async function establishDeviceSession(identity){
  const challengeRes=await fetch("/api/auth/challenge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({device_id:identity.device_id})});
  const challenge=await challengeRes.json();
  if(!challengeRes.ok||!challenge.ok)throw Error(challenge.error||"设备尚未授权");
  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},identity.private_key,new TextEncoder().encode(challenge.challenge));
  const sessionRes=await fetch("/api/auth/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    device_id:identity.device_id,
    challenge_id:challenge.challenge_id,
    signature:arrayBufferToBase64Url(signature)
  })});
  const session=await sessionRes.json();
  if(!sessionRes.ok||!session.ok)throw Error(session.error||"设备验证失败");
  state.authToken=session.token;state.device=session.device;
  sessionStorage.setItem("family-growth-session",session.token);
  return true;
}
async function unlockWorkbench(){
  if(authPollTimer){clearInterval(authPollTimer);authPollTimer=null}
  $("auth-gate").hidden=true;
  $("app-shell").hidden=false;
  $("device-status").textContent="✓ "+(state.device?.label||"已授权设备");
  await load();
}
function showPending(p){
  $("auth-request-code").textContent=p.request_code;
  $("auth-pending-meta").textContent=(p.label||"当前设备")+" · 有效至 "+new Date(p.expires_at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});
  showAuthView("pending");
  authMessage("");
  if(authPollTimer)clearInterval(authPollTimer);
  authPollTimer=setInterval(()=>checkAuthorization(false),8000);
}
async function checkAuthorization(manual=true){
  const p=pendingAuth();
  if(!p){showAuthView("request");return}
  try{
    const res=await fetch("/api/auth/status?code="+encodeURIComponent(p.request_code)+"&device_id="+encodeURIComponent(p.device_id),{cache:"no-store"});
    const out=await res.json();
    if(!res.ok||!out.ok)throw Error(out.error||"授权状态读取失败");
    if(out.status==="approved"){
      if(authPollTimer){clearInterval(authPollTimer);authPollTimer=null}
      const identity=await readIdentity();
      if(!identity||identity.device_id!==p.device_id)throw Error("本机设备身份已变化，需要重新申请");
      await establishDeviceSession(identity);
      setPendingAuth(null);
      await unlockWorkbench();
      return;
    }
    if(out.status==="expired"||out.status==="rejected"||out.status==="revoked"){
      setPendingAuth(null);
      showAuthView("request");
      authMessage(out.status==="expired"?"授权申请已过期，请重新申请。":out.status==="rejected"?"本次设备申请未获批准。":"此设备授权已撤销。","error");
      return;
    }
    if(manual)authMessage("尚未检测到 GPT 批准，请先在 ChatGPT 中发送上面的授权命令。","info");
  }catch(error){
    if(manual)authMessage(error.message,"error");
  }
}
async function requestDeviceAuthorization(){
  const button=$("request-device-auth"),edit=$("auth-edit-code").value,label=$("device-label").value.trim()||defaultDeviceLabel();
  if(!edit){authMessage("请输入编辑码后再申请。","error");return}
  button.disabled=true;button.textContent="正在申请…";authMessage("");
  try{
    const identity=await ensureIdentity();
    const publicJwk=await crypto.subtle.exportKey("jwk",identity.public_key);
    const res=await fetch("/api/auth/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      edit_code:edit,device_id:identity.device_id,label,public_jwk:publicJwk
    })});
    const out=await res.json();
    $("auth-edit-code").value="";
    if(!res.ok||!out.ok)throw Error(out.error||"无法申请设备授权");
    const pending={request_code:out.request_code,expires_at:out.expires_at,device_id:identity.device_id,label};
    setPendingAuth(pending);showPending(pending);
  }catch(error){authMessage(error.message,"error")}
  finally{button.disabled=false;button.textContent="申请设备授权"}
}
async function bootstrapAuthorization(){
  localStorage.removeItem("family-growth-edit-key");
  $("app-shell").hidden=true;$("auth-gate").hidden=false;showAuthView("checking");authMessage("");
  $("device-label").value=defaultDeviceLabel();
  if(await verifyExistingSession()){await unlockWorkbench();return}
  sessionStorage.removeItem("family-growth-session");state.authToken=null;state.device=null;
  let identity=null;
  try{identity=await readIdentity()}catch(_){}
  if(identity){
    try{
      await establishDeviceSession(identity);
      await unlockWorkbench();return;
    }catch(_){}
  }
  const pending=pendingAuth();
  if(pending&&pending.device_id===identity?.device_id&&new Date(pending.expires_at)>new Date()){
    showPending(pending);await checkAuthorization(false);return;
  }
  if(pending)setPendingAuth(null);
  showAuthView("request");
}
$("request-device-auth").addEventListener("click",requestDeviceAuthorization);
$("check-auth-status").addEventListener("click",()=>checkAuthorization(true));
$("cancel-auth-request").addEventListener("click",()=>{setPendingAuth(null);if(authPollTimer){clearInterval(authPollTimer);authPollTimer=null}showAuthView("request");authMessage("")});


function elem(tag,className,value){
  const e=document.createElement(tag);
  if(className)e.className=className;
  if(value!==undefined)e.textContent=String(value);
  return e;
}
function replace(id,children){
  const h=$(id);h.replaceChildren(...children);
  if(!children.length)h.append(elem("div","empty","暂时没有记录。"));
}
function localDate(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function humanDate(s){
  if(!s)return"日期未记录";
  const a=String(s).slice(0,10).split("-");
  return a.length===3?a[0]+"年"+Number(a[1])+"月"+Number(a[2])+"日":s;
}
function value(id){return $(id).value.trim()}
function nullableNumber(id){const v=value(id);return v===""?null:Number(v)}
function uid(){return"rec-"+Date.now().toString(36)+"-"+(crypto.randomUUID?crypto.randomUUID().slice(0,8):Math.random().toString(36).slice(2,10))}
function cleanText(s){return String(s||"").replace(/\s+/g," ").trim()}
function truncate(s,n=54){const t=cleanText(s);return t.length>n?t.slice(0,n)+"…":t}
function flash(text,kind="ok"){
  const n=$("notice");n.textContent=text;n.hidden=false;
  n.className="notice "+(kind==="ok"?"flash-ok":kind==="warn"?"flash-warn":"flash-error");
  window.scrollTo({top:0,behavior:"smooth"});
}
function clearFlash(){$("notice").hidden=true;$("notice").className="notice"}

function section(name){
  if(!sectionText[name])name="home";
  state.page=name;
  document.querySelectorAll(".page").forEach(e=>e.classList.toggle("active",e.id==="page-"+name));
  document.querySelectorAll(".nav").forEach(e=>e.classList.toggle("active",e.dataset.page===name));
  $("section-title").textContent=sectionText[name][0];
  $("section-subtitle").textContent=sectionText[name][1];
  history.replaceState(null,"","#"+name);
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-page]").forEach(e=>e.addEventListener("click",()=>section(e.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(e=>e.addEventListener("click",()=>section(e.dataset.goto)));
$("detail-back").addEventListener("click",()=>section(state.detailReturn||"home"));

function renderPager(id,page,total,pageSize,onPage){
  const host=$(id);host.replaceChildren();
  const pages=Math.max(1,Math.ceil(total/pageSize));
  const current=Math.min(Math.max(1,page),pages);
  const prev=elem("button","page-button","‹ 上一页");prev.type="button";prev.disabled=current<=1;
  const next=elem("button","page-button","下一页 ›");next.type="button";next.disabled=current>=pages;
  const info=elem("span","page-info","第 "+current+" / "+pages+" 页 · 共 "+total+" 条");
  prev.addEventListener("click",()=>onPage(current-1));
  next.addEventListener("click",()=>onPage(current+1));
  host.append(prev,info,next);
  return current;
}

function discussionGroups(){
  if(!state.data)return[];
  const messages=[...state.data.conversations].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.id.localeCompare(b.id));
  const out=[];let current=null;
  for(const m of messages){
    if(m.role==="user"){
      current={id:"discussion-"+m.id,occurred_on:m.occurred_on,user:m,assistants:[]};
      out.push(current);
    }else if(current){
      current.assistants.push(m);
    }else{
      current={id:"discussion-"+m.id,occurred_on:m.occurred_on,user:null,assistants:[m]};
      out.push(current);
    }
  }
  return out;
}
function discussionTitle(d){
  return d.user?truncate(d.user.content,58):"AI 建议";
}
function discussionCard(d,mode="archive"){
  const btn=elem("button","discussion-card "+mode);btn.type="button";
  const top=elem("div","discussion-card-head");
  top.append(elem("small","",humanDate(d.occurred_on)),elem("span","detail-link","查看详情 →"));
  btn.append(top,elem("h3","",discussionTitle(d)));
  if(mode==="home"){
    const ai=d.assistants[0]?.content||"";
    btn.append(elem("p","clamp-2",truncate(ai,150)));
  }else{
    const u=elem("div","discussion-preview");
    u.append(elem("strong","","家长反馈"),elem("p","clamp-5",d.user?.content||""));
    const a=elem("div","discussion-preview ai");
    a.append(elem("strong","","AI 建议"),elem("p","clamp-5",d.assistants.map(x=>x.content).join("\n\n")));
    btn.append(u,a);
  }
  btn.addEventListener("click",()=>openDiscussion(d));
  return btn;
}
function renderDiscussions(){
  const q=value("chat-search").toLocaleLowerCase();
  const all=discussionGroups().slice().reverse();
  const filtered=all.filter(d=>{
    const text=[d.user?.content||"",...d.assistants.map(x=>x.content),d.occurred_on].join(" ").toLocaleLowerCase();
    return text.includes(q);
  });
  $("chat-total").textContent=filtered.length+" 次讨论";
  const page=renderPager("conversation-pagination",state.pages.conversations,filtered.length,PAGE_SIZE.conversations,p=>{
    state.pages.conversations=p;renderDiscussions();window.scrollTo({top:180,behavior:"smooth"});
  });
  state.pages.conversations=page;
  const start=(page-1)*PAGE_SIZE.conversations;
  replace("conversation-list",filtered.slice(start,start+PAGE_SIZE.conversations).map(d=>discussionCard(d,"archive")));
}
function openDiscussion(d){
  state.detailReturn="conversations";
  $("detail-type").textContent="DISCUSSION";
  $("detail-title").textContent=discussionTitle(d);
  $("detail-meta").textContent=humanDate(d.occurred_on)+" · 家长反馈 + AI 建议";
  const host=$("detail-content");host.replaceChildren();
  if(d.user)host.append(detailBlock("家长反馈",d.user.content,d.user.source_kind==="summary"?"摘要":"原文"));
  d.assistants.forEach((a,i)=>host.append(detailBlock(d.assistants.length>1?"AI 建议 "+(i+1):"AI 建议",a.content,a.source_kind==="summary"?"摘要":"原文")));
  section("detail");
}

function detailBlock(title,text,tag){
  const box=elem("section","detail-block");
  const head=elem("div","detail-block-title");head.append(elem("h3","",title));
  if(tag)head.append(elem("span","tag",tag));
  box.append(head,renderLongText(text));
  return box;
}
function renderLongText(text){
  const host=elem("div","long-text");
  const lines=String(text||"").split("\n");
  let para=[];
  const flush=()=>{
    if(!para.length)return;
    host.append(elem("p","",para.join("\n")));
    para=[];
  };
  for(const raw of lines){
    const line=raw.trimEnd();
    if(!line.trim()){flush();continue}
    if(/^【.+】$/.test(line.trim())||/^#{1,3}\s+/.test(line.trim())){
      flush();host.append(elem("h4","",line.replace(/^#{1,3}\s+/,"")));
    }else{
      para.push(line);
    }
  }
  flush();
  return host;
}

function observationItem(o){
  const box=elem("article","timeline-entry"+(o.kind==="hypothesis"?" hypothesis":""));
  box.append(elem("small","",humanDate(o.occurred_on)+" · "+(o.kind==="hypothesis"?"待验证假设":"观察记录")),elem("h3","",o.category),elem("p","",o.content));
  return box;
}
function renderTimeline(){
  const data=[...state.data.observations].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)||b.id.localeCompare(a.id));
  const page=renderPager("timeline-pagination",state.pages.timeline,data.length,PAGE_SIZE.timeline,p=>{state.pages.timeline=p;renderTimeline()});
  state.pages.timeline=page;
  const start=(page-1)*PAGE_SIZE.timeline;
  replace("timeline-list",data.slice(start,start+PAGE_SIZE.timeline).map(observationItem));
}

function latestPlanProgress(planId){
  return (state.data.records||[]).filter(r=>r.type==="plan_progress"&&r.payload?.plan_id===planId)
    .sort((a,b)=>(b.record_date||"").localeCompare(a.record_date||"")||(b.created_at||"").localeCompare(a.created_at||""))[0]||null;
}
function allPlanProgress(planId){
  return (state.data.records||[]).filter(r=>r.type==="plan_progress"&&r.payload?.plan_id===planId)
    .sort((a,b)=>(b.record_date||"").localeCompare(a.record_date||"")||(b.created_at||"").localeCompare(a.created_at||""));
}
function planDisplayStatus(plan){
  const latest=latestPlanProgress(plan.id);
  return latest?.payload?.status||plan.status;
}
function planListItem(p){
  const btn=elem("button","record-card");btn.type="button";
  const latest=latestPlanProgress(p.id);
  const status=planDisplayStatus(p);
  btn.append(elem("small","",(p.start_date||"")+" 至 "+(p.end_date||"")+" · "+(planStatusNames[status]||status)));
  btn.append(elem("h3","",p.title),elem("p","clamp-4",p.details));
  if(latest)btn.append(elem("span","progress-inline","最近进度 "+latest.payload.completion_percent+"% · "+humanDate(latest.record_date)));
  btn.addEventListener("click",()=>openPlan(p));
  return btn;
}
function reportListItem(r){
  const btn=elem("button","record-card");btn.type="button";
  btn.append(elem("small","",humanDate(r.occurred_on)),elem("h3","",r.title),elem("p","clamp-4",r.content),elem("span","detail-link","查看完整报告 →"));
  btn.addEventListener("click",()=>openReport(r));
  return btn;
}
function renderPlansReports(){
  const plans=state.data.plans||[], reports=[...(state.data.reports||[])].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on));
  let pp=renderPager("plans-pagination",state.pages.plans,plans.length,PAGE_SIZE.plans,p=>{state.pages.plans=p;renderPlansReports()});
  state.pages.plans=pp;
  let start=(pp-1)*PAGE_SIZE.plans;
  replace("plans-list",plans.slice(start,start+PAGE_SIZE.plans).map(planListItem));
  let rp=renderPager("reports-pagination",state.pages.reports,reports.length,PAGE_SIZE.reports,p=>{state.pages.reports=p;renderPlansReports()});
  state.pages.reports=rp;
  start=(rp-1)*PAGE_SIZE.reports;
  replace("reports-list",reports.slice(start,start+PAGE_SIZE.reports).map(reportListItem));
}
function openReport(r){
  state.detailReturn="plans";
  $("detail-type").textContent="ANALYSIS REPORT";
  $("detail-title").textContent=r.title;
  $("detail-meta").textContent=humanDate(r.occurred_on);
  const host=$("detail-content");host.replaceChildren(detailBlock("完整报告",r.content));
  section("detail");
}
function openPlan(p){
  state.detailReturn="plans";
  $("detail-type").textContent="PLAN";
  $("detail-title").textContent=p.title;
  const latest=latestPlanProgress(p.id),status=latest?.payload?.status||p.status;
  $("detail-meta").textContent=(p.start_date||"")+" 至 "+(p.end_date||"")+" · "+(planStatusNames[status]||status);
  const host=$("detail-content");host.replaceChildren();
  host.append(detailBlock("计划详情",p.details));
  const history=allPlanProgress(p.id);
  const progress=elem("section","detail-block");
  progress.append(elem("h3","","完成情况记录"));
  if(history.length){
    const list=elem("div","progress-history");
    history.forEach(r=>{
      const item=elem("div","progress-entry");
      const top=elem("div","progress-entry-head");
      top.append(elem("strong","",humanDate(r.record_date)+" · "+(planStatusNames[r.payload.status]||r.payload.status)),elem("span","progress-pill",r.payload.completion_percent+"%"));
      item.append(top);
      if(r.payload.note)item.append(elem("p","",r.payload.note));
      list.append(item);
    });
    progress.append(list);
  }else{
    progress.append(elem("div","empty","还没有完成情况记录。"));
  }
  progress.append(buildPlanProgressForm(p,latest));
  host.append(progress);
  section("detail");
}
function buildPlanProgressForm(plan,latest){
  const form=elem("div","progress-form");
  form.append(elem("h4","","记录本次进展"));
  const grid=elem("div","form-grid");
  const dateLabel=elem("label","","日期"),date=elem("input");date.type="date";date.value=localDate();date.id="progress-date";dateLabel.append(date);
  const statusLabel=elem("label","","状态"),status=elem("select");status.id="progress-status";
  [["not_started","未开始"],["in_progress","进行中"],["completed","已完成"],["paused","暂停"]].forEach(x=>status.append(new Option(x[1],x[0])));
  status.value=latest?.payload?.status||"in_progress";statusLabel.append(status);
  const pctLabel=elem("label","","完成度（%）"),pct=elem("input");pct.type="number";pct.min="0";pct.max="100";pct.id="progress-percent";pct.value=latest?.payload?.completion_percent??0;pctLabel.append(pct);
  const noteLabel=elem("label","span3","本次记录"),note=elem("textarea");note.rows=3;note.id="progress-note";note.placeholder="例如：完成了假期计划中的第一次数学专项练习；执行顺利，没有临时追加题目。";noteLabel.append(note);
  grid.append(dateLabel,statusLabel,pctLabel,noteLabel);form.append(grid);
  const actions=elem("div","form-actions"),submit=elem("button","button dark","提交完成情况");submit.type="button";
  submit.addEventListener("click",async()=>{
    if(!state.authToken){flash("当前设备授权会话已失效，请刷新页面重新验证。","warn");return}
    const percent=Number(pct.value);
    if(!Number.isFinite(percent)||percent<0||percent>100){flash("完成度请输入 0—100。","warn");return}
    submit.disabled=true;submit.textContent="提交中…";
    try{
      await postRecord({
        id:uid(),type:"plan_progress",record_date:date.value,
        payload:{plan_id:plan.id,status:status.value,completion_percent:percent,note:note.value.trim()}
      });
      flash("计划完成情况已保存，并自动归档到 GitHub。","ok");
      await load();
      const fresh=state.data.plans.find(x=>x.id===plan.id);
      if(fresh)openPlan(fresh);
    }catch(error){flash("提交失败："+error.message,"error")}
    finally{submit.disabled=false;submit.textContent="提交完成情况"}
  });
  actions.append(submit);form.append(actions);
  return form;
}

function recordSummary(r){
  const p=r.payload||{};
  if(r.type==="daily_homework"){
    const rows=p.subjects||[], wrong=rows.reduce((n,x)=>n+(Number(x.wrong_count)||0),0);
    const actual=rows.filter(x=>x.status!=="no_homework");
    const done=actual.filter(x=>x.status==="done").length;
    const detail=rows.map(x=>x.subject+"："+(statusNames[x.status]||x.status)+(x.wrong_count!=null?"，错 "+x.wrong_count+" 道":"")+(x.error_types?"（"+x.error_types+"）":"")).join("；");
    return {title:"学校作业 · "+done+"/"+actual.length+" 科完成",text:(wrong?"共记录错题 "+wrong+" 道。":"未记录错题。")+" "+detail};
  }
  if(r.type==="extra_work")return{title:"额外作业 · "+(p.subject||"未标科目"),text:(p.content||"")+(p.completed_count!=null?"；完成 "+p.completed_count+(p.planned_count!=null?"/"+p.planned_count:"")+" 题":"")+(p.wrong_count!=null?"；错 "+p.wrong_count+" 题":"")+(p.duration_minutes!=null?"；"+p.duration_minutes+" 分钟":"")+(p.error_types?"；"+p.error_types:"")};
  if(r.type==="exam_scores"){const rows=p.subjects||[];return{title:"考试 · "+(p.exam_name||"未命名"),text:rows.map(x=>x.subject+" "+x.score+"/"+x.full_score+(x.error_types?"（"+x.error_types+"）":"")).join("；")}}
  if(r.type==="teacher_feedback")return{title:"老师反馈 · "+(p.subject||p.source||"综合"),text:(p.content||"")+(p.follow_up?"；后续："+p.follow_up:"")};
  if(r.type==="plan_progress"){
    const plan=state.data?.plans?.find(x=>x.id===p.plan_id);
    return{title:"计划进度 · "+(plan?.title||p.plan_id||""),text:(planStatusNames[p.status]||p.status)+" · "+p.completion_percent+"%"+(p.note?"；"+p.note:"")};
  }
  return{title:typeNames[r.type]||r.type,text:""};
}
function miniRecord(r){
  const s=recordSummary(r),row=elem("div","mini-record");
  row.append(elem("h4","",s.title),elem("p","",humanDate(r.record_date)+" · "+s.text));
  return row;
}
function ledger(){
  if(!state.data)return;
  const type=$("record-filter-type").value,date=$("record-filter-date").value;
  const rows=(state.data.records||[]).filter(r=>(!type||r.type===type)&&(!date||r.record_date===date));
  const page=renderPager("record-pagination",state.pages.records,rows.length,PAGE_SIZE.records,p=>{state.pages.records=p;ledger()});
  state.pages.records=page;
  const slice=rows.slice((page-1)*PAGE_SIZE.records,page*PAGE_SIZE.records);
  const host=$("record-ledger");host.replaceChildren();
  if(!slice.length){host.append(elem("div","empty","没有符合条件的记录。"));return}
  const wrap=elem("div","subject-table-wrap"),table=elem("table","ledger"),thead=elem("thead"),trh=elem("tr");
  ["日期","类型","内容摘要","GitHub"].forEach(x=>trh.append(elem("th","",x)));thead.append(trh);table.append(thead);
  const tbody=elem("tbody");
  slice.forEach(r=>{
    const tr=elem("tr"),s=recordSummary(r),summary=elem("div","record-summary");
    summary.append(elem("strong","",s.title),elem("span","",s.text));
    const details=elem("details","record-detail"),sum=elem("summary","","查看完整结构"),pre=elem("pre","",JSON.stringify(r.payload,null,2));details.append(sum,pre);summary.append(details);
    const chip=elem("span","sync-chip"+(r.sync_status==="synced"?"":" pending"),r.sync_status==="synced"?"已归档":"待归档");
    const t1=elem("td","",r.record_date),t2=elem("td"),t3=elem("td"),t4=elem("td");
    t2.append(elem("span","record-type",typeNames[r.type]||r.type));t3.append(summary);t4.append(chip);
    tr.append(t1,t2,t3,t4);tbody.append(tr);
  });
  table.append(tbody);wrap.append(table);host.append(wrap);
}

function inputCell(type,cls,placeholder){
  const td=elem("td"),input=elem(type==="select"?"select":"input",cls||"");
  if(type!=="select"){input.type=type||"text";if(placeholder)input.placeholder=placeholder}
  td.append(input);return{td,input};
}
function option(select,val,label){select.append(new Option(label,val))}
function addDailyRow(subject=""){
  const tr=elem("tr");
  const subj=inputCell("text","subject-name");subj.input.value=subject;
  const status=inputCell("select");[["done","已完成"],["partial","部分完成"],["not_done","未完成"],["no_homework","无作业"]].forEach(x=>option(status.input,...x));
  const assigned=inputCell("number","tiny"),completed=inputCell("number","tiny"),wrong=inputCell("number","tiny"),errors=inputCell("text","wide","题型 / 知识点");
  [assigned,completed,wrong].forEach(x=>x.input.min="0");
  const correction=inputCell("select");[["not_needed","无需订正"],["done","已订正"],["partial","部分订正"],["not_done","未订正"]].forEach(x=>option(correction.input,...x));
  wrong.input.addEventListener("input",()=>{if(Number(wrong.input.value)>0&&correction.input.value==="not_needed")correction.input.value="not_done"});
  const duration=inputCell("number","tiny");duration.input.min="0";duration.input.placeholder="分钟";
  const remove=elem("td"),btn=elem("button","icon-button","×");btn.type="button";btn.title="删除此科目";btn.addEventListener("click",()=>tr.remove());remove.append(btn);
  tr.append(subj.td,status.td,assigned.td,completed.td,wrong.td,errors.td,correction.td,duration.td,remove);
  tr._fields={subject:subj.input,status:status.input,assigned_count:assigned.input,completed_count:completed.input,wrong_count:wrong.input,error_types:errors.input,correction:correction.input,duration_minutes:duration.input};
  $("daily-subjects").append(tr);
}
function addExamRow(subject=""){
  const tr=elem("tr");
  const subj=inputCell("text","subject-name");subj.input.value=subject;
  const score=inputCell("number","tiny"),full=inputCell("number","tiny"),wrong=inputCell("number","tiny"),errors=inputCell("text","wide","错因 / 题型"),classRank=inputCell("number","tiny"),gradeRank=inputCell("number","tiny");
  [score,full,wrong,classRank,gradeRank].forEach(x=>x.input.min="0");
  const remove=elem("td"),btn=elem("button","icon-button","×");btn.type="button";btn.addEventListener("click",()=>tr.remove());remove.append(btn);
  tr.append(subj.td,score.td,full.td,wrong.td,errors.td,classRank.td,gradeRank.td,remove);
  tr._fields={subject:subj.input,score:score.input,full_score:full.input,wrong_count:wrong.input,error_types:errors.input,class_rank:classRank.input,grade_rank:gradeRank.input};
  $("exam-subjects").append(tr);
}
function rowPayload(tbodyId){
  return [...$(tbodyId).querySelectorAll("tr")].map(tr=>Object.fromEntries(Object.entries(tr._fields).map(([k,input])=>[k,input.type==="number"?(input.value===""?null:Number(input.value)):input.value.trim()])));
}
function setRecordTab(name){
  state.recordTab=name;
  document.querySelectorAll(".record-tab").forEach(x=>x.classList.toggle("active",x.dataset.recordTab===name));
  document.querySelectorAll(".record-form").forEach(x=>x.classList.toggle("active",x.id==="record-form-"+name));
}
document.querySelectorAll(".record-tab").forEach(x=>x.addEventListener("click",()=>setRecordTab(x.dataset.recordTab)));

function buildSubmission(which){
  if(which==="daily")return{type:"daily_homework",record_date:value("daily-date"),payload:{subjects:rowPayload("daily-subjects").filter(x=>x.subject),note:value("daily-note")}};
  if(which==="extra")return{type:"extra_work",record_date:value("extra-date"),payload:{subject:value("extra-subject"),content:value("extra-content"),planned_count:nullableNumber("extra-planned"),completed_count:nullableNumber("extra-completed"),wrong_count:nullableNumber("extra-wrong"),error_types:value("extra-errors"),duration_minutes:nullableNumber("extra-duration"),independence:$("extra-independence").value,note:value("extra-note")}};
  if(which==="exam")return{type:"exam_scores",record_date:value("exam-date"),payload:{exam_name:value("exam-name"),subjects:rowPayload("exam-subjects").filter(x=>x.subject),note:value("exam-note")}};
  if(which==="feedback")return{type:"teacher_feedback",record_date:value("feedback-date"),payload:{subject:value("feedback-subject"),source:value("feedback-source"),category:$("feedback-category").value,content:value("feedback-content"),follow_up:value("feedback-follow")}};
  throw Error("未知记录类型");
}
async function postRecord(body){
  const res=await protectedFetch("/api/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const out=await res.json();
  if(res.status===401){state.authToken=null;sessionStorage.removeItem("family-growth-session");throw Error("设备授权会话已失效，请刷新页面")}
  if(!res.ok||!out.ok)throw Error(out.error||"提交失败");
  return out;
}
async function submitRecord(which,button){
  if(!state.authToken){flash("当前设备授权会话已失效，请刷新页面重新验证。","warn");return}
  let body;
  try{body={id:uid(),...buildSubmission(which)}}catch(error){flash(error.message,"error");return}
  button.disabled=true;const old=button.textContent;button.textContent="提交中…";clearFlash();
  try{
    const out=await postRecord(body);
    if(out.record?.sync_status==="synced")flash("记录已保存到 D1，并自动归档到私有 GitHub 数据仓库。","ok");
    else if(out.github?.reason==="github_not_configured")flash("记录已保存到 D1；私有 GitHub 数据仓库凭证尚未配置。","warn");
    else flash("记录已保存到 D1，但本次私有 GitHub 归档失败；下一次提交会自动重试。","warn");
    await load();
  }catch(error){flash("提交失败："+error.message,"error")}
  finally{button.disabled=false;button.textContent=old}
}
document.querySelectorAll(".submit-record").forEach(b=>b.addEventListener("click",()=>submitRecord(b.dataset.submit,b)));
$("add-daily-subject").addEventListener("click",()=>addDailyRow(""));
$("add-exam-subject").addEventListener("click",()=>addExamRow(""));
$("record-filter-type").addEventListener("change",()=>{state.pages.records=1;ledger()});
$("record-filter-date").addEventListener("change",()=>{state.pages.records=1;ledger()});
$("clear-record-filter").addEventListener("click",()=>{$("record-filter-type").value="";$("record-filter-date").value="";state.pages.records=1;ledger()});

function subjectMatches(name,selected){return !selected||name===selected}
function metricPoints(metricId,subject){
  const records=state.data?.records||[], days=new Map();
  const bucket=date=>{if(!days.has(date))days.set(date,{date,a:0,b:0,has:false});return days.get(date)};
  for(const r of records){
    const p=r.payload||{},date=r.record_date;
    if(!date)continue;
    if(r.type==="daily_homework"){
      const rows=(p.subjects||[]).filter(x=>subjectMatches(x.subject,subject));
      if(metricId==="homework_completion"){
        for(const x of rows){if(x.status==="no_homework")continue;const b=bucket(date);b.b++;if(x.status==="done")b.a++;b.has=true}
      }
      if(metricId==="homework_wrong"){
        for(const x of rows)if(x.wrong_count!=null){const b=bucket(date);b.a+=Number(x.wrong_count)||0;b.has=true}
      }
      if(metricId==="homework_correction"){
        for(const x of rows)if(Number(x.wrong_count)>0){const b=bucket(date);b.b++;if(x.correction==="done")b.a++;b.has=true}
      }
    }
    if(r.type==="extra_work"&&subjectMatches(p.subject,subject)){
      if(metricId==="extra_completion"&&Number(p.planned_count)>0&&p.completed_count!=null){const b=bucket(date);b.a+=Number(p.completed_count)||0;b.b+=Number(p.planned_count)||0;b.has=true}
      if(metricId==="extra_wrong_rate"&&Number(p.completed_count)>0&&p.wrong_count!=null){const b=bucket(date);b.a+=Number(p.wrong_count)||0;b.b+=Number(p.completed_count)||0;b.has=true}
      if(metricId==="extra_duration"&&p.duration_minutes!=null){const b=bucket(date);b.a+=Number(p.duration_minutes)||0;b.has=true}
    }
    if(r.type==="exam_scores"&&metricId==="exam_score_rate"){
      for(const x of p.subjects||[])if(subjectMatches(x.subject,subject)&&Number(x.full_score)>0){const b=bucket(date);b.a+=Number(x.score)||0;b.b+=Number(x.full_score)||0;b.has=true}
    }
  }
  const metric=FIXED_METRICS.find(x=>x.id===metricId);
  return [...days.values()].filter(x=>x.has).sort((a,b)=>a.date.localeCompare(b.date)).map(x=>{
    let val;
    if(["homework_completion","homework_correction","extra_completion","extra_wrong_rate","exam_score_rate"].includes(metricId)){
      if(!x.b)return null;val=Math.round(x.a/x.b*1000)/10;
    }else val=Math.round(x.a*10)/10;
    return{date:x.date,value:val,unit:metric?.unit||""};
  }).filter(Boolean);
}
function updateSubjectOptions(){
  const subjects=new Set();
  for(const r of state.data?.records||[]){
    if(r.type==="daily_homework"||r.type==="exam_scores")for(const x of r.payload?.subjects||[])if(x.subject)subjects.add(x.subject);
    if(r.type==="extra_work"&&r.payload?.subject)subjects.add(r.payload.subject);
  }
  const sel=$("subject-select"),old=sel.value;
  sel.replaceChildren(new Option("全部科目",""),...[...subjects].sort((a,b)=>a.localeCompare(b,"zh-CN")).map(x=>new Option(x,x)));
  if([...subjects].includes(old))sel.value=old;
}
function renderTrendCards(){
  const host=$("trend-summary");host.replaceChildren();
  const subject=$("subject-select").value;
  for(const m of FIXED_METRICS){
    const points=metricPoints(m.id,subject),latest=points.at(-1);
    const card=elem("div","metric-card");
    card.append(elem("small","",m.label),elem("strong","",latest?latest.value+m.unit:"—"),elem("span","",latest?humanDate(latest.date):"暂无数据"));
    card.title=m.help;host.append(card);
  }
}
function svgElement(name,attrs,txt){
  const e=document.createElementNS("http://www.w3.org/2000/svg",name);
  for(const[k,v]of Object.entries(attrs||{}))e.setAttribute(k,v);
  if(txt!==undefined)e.textContent=String(txt);return e;
}
function chart(){
  const host=$("chart");host.replaceChildren();
  const metric=FIXED_METRICS.find(x=>x.id===$("metric-select").value)||FIXED_METRICS[0];
  const subject=$("subject-select").value,points=metricPoints(metric.id,subject);
  renderTrendCards();
  if(!points.length){host.append(elem("div","empty","这个固定指标还没有真实数据。继续正常记录即可，不需要为了图表补填无意义字段。"));return}
  if(points.length<2){const p=points[0];host.append(elem("div","empty",humanDate(p.date)+"："+p.value+p.unit+"。目前只有一个数据点，暂不能判断趋势。"));return}
  const values=points.map(p=>Number(p.value));let low=Math.min(...values),high=Math.max(...values);
  if(low===high){low-=1;high+=1}
  if(metric.unit==="%"&&low>=0&&high<=100){low=Math.max(0,Math.floor(low-5));high=Math.min(100,Math.ceil(high+5));if(low===high){low=0;high=100}}
  const px=i=>48+i*554/(points.length-1),py=v=>192-(v-low)/(high-low)*145;
  const svg=svgElement("svg",{viewBox:"0 0 650 248",class:"trend-chart",role:"img","aria-label":metric.label+"随时间变化"});
  for(let i=0;i<4;i++){const y=192-i*48;svg.append(svgElement("line",{x1:"39",x2:"620",y1:y,y2:y,stroke:"#edf1eb"}))}
  svg.append(svgElement("polyline",{points:points.map((p,i)=>px(i)+","+py(Number(p.value))).join(" "),fill:"none",stroke:"#348a71","stroke-width":"3","stroke-linecap":"round","stroke-linejoin":"round"}));
  points.forEach((p,i)=>{
    const x=px(i),y=py(Number(p.value));
    svg.append(svgElement("circle",{cx:x,cy:y,r:"4.5",fill:"#348a71"}),svgElement("text",{x,y:y-12,"text-anchor":"middle"},p.value+p.unit),svgElement("text",{x,y:"223","text-anchor":"middle"},p.date.slice(5)));
  });
  const note=elem("p","message-meta",(subject?subject+" · ":"")+metric.help+"。趋势仅表示记录变化，不直接证明因果关系。");
  host.append(svg,note);
}

function renderHome(){
  const d=state.data,discussions=discussionGroups();
  $("count-conversations").textContent=discussions.length;
  $("count-records").textContent=(d.records||[]).length;
  $("count-observations").textContent=d.observations.length;
  $("count-plans").textContent=d.plans.filter(p=>planDisplayStatus(p)!=="completed").length;
  replace("home-records",(d.records||[]).slice(0,5).map(miniRecord));
  replace("home-conversations",discussions.slice(-3).reverse().map(x=>discussionCard(x,"home")));
}
function render(){
  if(!state.data)return;
  renderHome();renderDiscussions();renderTimeline();renderPlansReports();ledger();updateSubjectOptions();chart();
}
function background(){
  const d=state.data,groups=discussionGroups().slice(-6),records=(d.records||[]).slice(0,20);
  return "以下是「同频」工作台的最新背景。标记为摘要的内容不是逐字原话。\n\n"+
    groups.map(g=>"["+humanDate(g.occurred_on)+" 家长反馈] "+(g.user?.content||"")+"\n[AI 建议] "+g.assistants.map(a=>a.content).join("\n")).join("\n\n")+
    "\n\n最近结构化记录：\n"+records.map(r=>"["+r.record_date+" "+(typeNames[r.type]||r.type)+"] "+recordSummary(r).text).join("\n")+
    "\n\n当前计划：\n"+d.plans.map(p=>p.title+"（"+(planStatusNames[planDisplayStatus(p)]||planDisplayStatus(p))+"）："+truncate(p.details,180)).join("\n");
}
async function copyBackground(){
  if(!state.data)return;const copy=background();
  try{await navigator.clipboard.writeText(copy)}
  catch{const box=elem("textarea");box.value=copy;box.style.cssText="position:fixed;left:8px;top:8px";document.body.append(box);box.select();document.execCommand("copy");box.remove()}
  flash("已复制最新讨论背景和结构化记录，可粘贴到 ChatGPT 继续分析。","ok");
}
async function load(){
  if(!state.authToken)return;
  const status=$("sync-status");status.textContent="● 正在读取私有数据";status.classList.remove("warning");
  try{
    const res=await protectedFetch("/api/state",{cache:"no-store"});
    const data=await res.json();
    if(res.status===401){
      state.authToken=null;sessionStorage.removeItem("family-growth-session");
      $("app-shell").hidden=true;$("auth-gate").hidden=false;
      await bootstrapAuthorization();return;
    }
    if(!res.ok||!data.ok)throw Error(data.error||"API unavailable");
    state.data=data;state.device=data.device||state.device;render();
    $("device-status").textContent="✓ "+(state.device?.label||"已授权设备");
    status.textContent="● 私有数据已同步";
  }catch(error){
    status.textContent="● 数据读取失败";status.classList.add("warning");
    flash("无法读取私有云端数据："+error.message,"error");
  }
}

$("chat-search").addEventListener("input",()=>{state.pages.conversations=1;renderDiscussions()});
$("metric-select").replaceChildren(...FIXED_METRICS.map(m=>new Option(m.label,m.id)));
$("metric-select").value="homework_wrong";
$("metric-select").addEventListener("change",chart);
$("subject-select").addEventListener("change",chart);
$("copy-context").addEventListener("click",copyBackground);
$("refresh").addEventListener("click",load);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.authToken)load()});
setInterval(()=>{if(!document.hidden&&state.authToken)load()},300000);

["daily-date","extra-date","exam-date","feedback-date"].forEach(id=>$(id).value=localDate());
DEFAULT_SUBJECTS.forEach(addDailyRow);
["语文","数学","英语"].forEach(addExamRow);
const initial=(location.hash||"#home").slice(1);
section(sectionText[initial]?initial:"home");
bootstrapAuthorization();