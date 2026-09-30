/* "同频" read-only front end: public records come from /api/state (D1)
   and fall back to the versioned static GitHub data when the binding is unavailable. */
const $ = id => document.getElementById(id);
const state = {data:null, page:"home"};
const sectionText = {
  home:["和成长，保持同频。","对话驱动的成长档案，让讨论形成长期积累。"],
  conversations:["每一次讨论，都值得保留。","对话和总结各自标注，长期积累家庭教育思考。"],
  timeline:["让变化，有迹可循。","记录观察与尚待验证的想法，方便事后复盘。"],
  trends:["用数据，减少猜测。","只呈现真实记录，不把相关性直接解释成因果。"],
  plans:["讨论之后，形成行动。","保存计划建议及报告，跟踪后续反馈。"]
};
function elem(tag, className, value) {
  const e=document.createElement(tag);
  if(className)e.className=className;
  if(value!==undefined)e.textContent=String(value);
  return e;
}
function replace(id,children) {
  const host=$(id); host.replaceChildren(...children);
  if(!children.length)host.append(elem("div","empty","暂时没有已同步的记录。"));
}
function humanDate(s) {
  if(!s)return "日期未记录";
  const a=String(s).slice(0,10).split("-");
  return a.length===3 ? a[0]+"年"+Number(a[1])+"月"+Number(a[2])+"日" : s;
}
function section(name) {
  if(!sectionText[name])return;
  state.page=name;
  for(const e of document.querySelectorAll(".page"))e.classList.toggle("active",e.id==="page-"+name);
  for(const e of document.querySelectorAll(".nav"))e.classList.toggle("active",e.dataset.page===name);
  $("section-title").textContent=sectionText[name][0];
  $("section-subtitle").textContent=sectionText[name][1];
  history.replaceState(null,"","#"+name);
  window.scrollTo({top:0,behavior:"smooth"});
}
for(const e of document.querySelectorAll("[data-page]"))e.addEventListener("click",()=>section(e.dataset.page));
for(const e of document.querySelectorAll("[data-goto]"))e.addEventListener("click",()=>section(e.dataset.goto));

function conversationPreview(data) {
  const list=[...data].slice(-3);
  return list.map(m=>{
    const user=m.role==="user";
    const row=elem("div","chat-snippet"+(user?" user":""));
    const meta=elem("div","snippet-meta",user?"家庭反馈":"AI 建议");
    meta.append(elem("small","",humanDate(m.occurred_on)));
    if(m.source_kind==="summary")meta.append(elem("span","tag","摘要"));
    row.append(meta,elem("p","",m.content));
    return row;
  });
}
function conversationFull(data,filter) {
  const matching=data.filter(m=>(m.content+" "+m.occurred_on).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  $("chat-total").textContent=matching.length+" 条记录";
  return matching.map(m=>{
    const user=m.role==="user";
    const row=elem("div","message"+(user?" user":""));
    const meta=elem("div","message-meta",user?"家庭反馈":"AI 回复");
    meta.append(elem("small","",humanDate(m.occurred_on)));
    if(m.source_kind==="summary")meta.append(elem("span","tag","摘要（非逐字原文）"));
    const bubble=elem("div","bubble");
    bubble.append(meta,elem("div","",m.content));
    row.append(elem("div","avatar",user?"家":"AI"),bubble);
    return row;
  });
}
function observationItem(o) {
  const row=elem("div","observation");
  const symbol=elem("div","obs-symbol"+(o.kind==="hypothesis"?" hypothesis":""),o.kind==="hypothesis"?"?":"✓");
  const body=elem("div");
  body.append(elem("h4","",o.content),elem("p","",(o.kind==="hypothesis"?"待验证假设":"家庭观察")+" · "+o.category+" · "+o.source));
  row.append(symbol,body); return row;
}
function timelineItem(o) {
  const box=elem("article","timeline-entry"+(o.kind==="hypothesis"?" hypothesis":""));
  box.append(elem("small","",humanDate(o.occurred_on)+" · "+(o.kind==="hypothesis"?"待验证假设":"观察记录")),elem("h3","",o.category),elem("p","",o.content));
  return box;
}
function planItem(p){
  const row=elem("article","record");
  row.append(elem("small","",(p.start_date||"")+" 至 "+(p.end_date||"")+" · "+(p.status==="suggested"?"建议稿":p.status)),elem("h3","",p.title),elem("p","",p.details));
  return row;
}
function reportItem(p){
  const row=elem("article","record");
  row.append(elem("small","",humanDate(p.occurred_on)),elem("h3","",p.title),elem("p","",p.content));
  return row;
}
function svgElement(name,attributes,txt) {
  const e=document.createElementNS("http://www.w3.org/2000/svg",name);
  for(const [k,v] of Object.entries(attributes||{}))e.setAttribute(k,v);
  if(txt!==undefined)e.textContent=String(txt);
  return e;
}
function chart() {
  const host=$("chart"); host.replaceChildren();
  if(!state.data.metrics.length){
    host.append(elem("div","empty","还没有实际量化数据。首次月考后可逐步记录；不会根据推测生成成绩或趋势。"));return;
  }
  const name=$("metric-select").value;
  const points=state.data.metrics.filter(m=>m.name===name).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on));
  if(points.length<2) {
    const m=points[0];
    host.append(elem("div","empty",m ? humanDate(m.occurred_on)+"："+m.value+m.unit+"。只有一条数据，暂不能判断趋势。" : "尚无该指标记录。"));return;
  }
  const values=points.map(p=>p.value);
  let low=Math.min(...values),high=Math.max(...values);
  if(low===high){low-=1;high+=1}
  const px=i=>48+i*554/(points.length-1);
  const py=v=>192-(v-low)/(high-low)*145;
  const svg=svgElement("svg",{viewBox:"0 0 650 248",class:"trend-chart",role:"img","aria-label":name+"随时间变化的记录"});
  for(let i=0;i<4;i++){
    const y=192-i*48;
    svg.append(svgElement("line",{x1:"39",x2:"620",y1:y,y2:y,stroke:"#edf1eb"}));
  }
  svg.append(svgElement("polyline",{points:points.map((p,i)=>px(i)+","+py(p.value)).join(" "),fill:"none",stroke:"#348a71","stroke-width":"3","stroke-linecap":"round","stroke-linejoin":"round"}));
  points.forEach((p,i)=>{
    const x=px(i),y=py(p.value);
    svg.append(svgElement("circle",{cx:x,cy:y,r:"4.5",fill:"#348a71"}));
    svg.append(svgElement("text",{x,y:y-12,"text-anchor":"middle"},p.value+(p.unit||"")));
    svg.append(svgElement("text",{x,y:"223","text-anchor":"middle"},p.occurred_on.slice(5)));
  });
  host.append(svg,elem("p","message-meta","以上仅呈现已录入数据，不表示变化的原因已得到证实。"));
}
function render() {
  const d=state.data;
  if(!d)return;
  $("count-conversations").textContent=d.conversations.length;
  $("count-observations").textContent=d.observations.length;
  $("count-metrics").textContent=d.metrics.length;
  $("count-plans").textContent=d.plans.filter(p=>p.status!=="completed").length;
  const messages=[...d.conversations].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.id.localeCompare(b.id));
  replace("home-conversations",conversationPreview(messages));
  replace("conversation-list",conversationFull(messages,$("chat-search").value.trim()));
  const observations=[...d.observations].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on));
  replace("home-observations",observations.slice(0,4).map(observationItem));
  replace("timeline-list",observations.map(timelineItem));
  replace("plans-list",d.plans.map(planItem));
  replace("reports-list",d.reports.map(reportItem));
  const select=$("metric-select");
  const existing=select.value;
  const metrics=[...new Set(d.metrics.map(m=>m.name))];
  select.replaceChildren(...(metrics.length?metrics.map(m=>new Option(m,m)):[new Option("暂无指标","")]));
  if(metrics.includes(existing))select.value=existing;
  chart();
}
function background() {
  const d=state.data;
  const convo=[...d.conversations].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)).slice(-12);
  return "以下是「同频」工作台已同步的背景资料。标记为摘要的内容不是逐字原话。\n\n"+
    convo.map(m=>"["+humanDate(m.occurred_on)+" "+(m.role==="user"?"家庭反馈":"AI 建议")+(m.source_kind==="summary"?"／摘要":"")+"] "+m.content).join("\n\n")+
    "\n\n当前计划：\n"+d.plans.map(p=>p.title+"（"+p.status+"）："+p.details).join("\n");
}
async function copyBackground() {
  if(!state.data)return;
  const copy=background();
  try {
    await navigator.clipboard.writeText(copy);
    $("notice").textContent="已复制讨论背景。返回 ChatGPT 并粘贴，即可继续在现有对话中讨论。";
  }catch{
    const box=elem("textarea");box.value=copy;box.style.cssText="position:fixed;left:8px;top:8px";
    document.body.append(box);box.select();document.execCommand("copy");box.remove();
    $("notice").textContent="已尝试复制讨论背景。请返回 ChatGPT 后粘贴。";
  }
  $("notice").hidden=false;
}
async function load() {
  const status=$("sync-status");
  status.textContent="● 正在读取云端";status.classList.remove("warning");
  let data,staticFallback=false;
  try{
    const response=await fetch("/api/state",{cache:"no-store"});
    data=await response.json();
    if(!response.ok||!data.ok)throw Error(data.error||"API unavailable");
  }catch(error){
    try{
      const response=await fetch("/data/workbench.json",{cache:"no-store"});
      if(!response.ok)throw Error("Static fallback unavailable");
      data=await response.json();staticFallback=true;
    }catch{
      status.textContent="● 数据读取失败";status.classList.add("warning");
      $("notice").hidden=false;$("notice").textContent="无法加载 GitHub 数据。请稍后刷新。";return;
    }
  }
  state.data=data;render();
  status.textContent=staticFallback?"● 展示静态备份":"● D1 已同步";
  status.classList.toggle("warning",staticFallback);
  $("notice").hidden=!staticFallback;
  if(staticFallback)$("notice").textContent="D1 暂不可用，目前展示 GitHub 版本化静态数据。可检查 Cloudflare 数据库绑定与函数日志。";
}
$("chat-search").addEventListener("input",()=>state.data&&render());
$("metric-select").addEventListener("change",chart);
$("copy-context").addEventListener("click",copyBackground);
$("refresh").addEventListener("click",load);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
setInterval(()=>{if(!document.hidden)load()},300000);
section((location.hash||"#home").slice(1));
load();
