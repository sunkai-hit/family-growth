const $=id=>document.getElementById(id);
const state={data:null,page:"home",recordTab:"daily"};
const DEFAULT_SUBJECTS=["语文","数学","英语","道法","历史","地理","生物","物理"];
const sectionText={
  home:["和成长，保持同频。","对话驱动的成长档案，让讨论和真实记录形成长期积累。"],
  records:["记录今天，理解长期。","学校作业、额外学习、考试和老师反馈，统一进入同一条成长数据线。"],
  conversations:["每一次讨论，都值得保留。","对话和总结各自标注，长期积累家庭教育思考。"],
  timeline:["让变化，有迹可循。","记录观察与尚待验证的想法，方便事后复盘。"],
  trends:["用数据，减少猜测。","只呈现真实记录，不把相关性直接解释成因果。"],
  plans:["讨论之后，形成行动。","保存计划建议及报告，跟踪后续反馈。"]
};
const typeNames={daily_homework:"学校作业",extra_work:"额外作业",exam_scores:"考试成绩",teacher_feedback:"老师反馈"};
const statusNames={done:"已完成",partial:"部分完成",not_done:"未完成",no_homework:"无作业"};
const correctionNames={done:"已订正",partial:"部分订正",not_done:"未订正",not_needed:"无需订正"};

function elem(tag,className,value){const e=document.createElement(tag);if(className)e.className=className;if(value!==undefined)e.textContent=String(value);return e}
function replace(id,children){const h=$(id);h.replaceChildren(...children);if(!children.length)h.append(elem("div","empty","暂时没有已同步的记录。"))}
function localDate(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function humanDate(s){if(!s)return"日期未记录";const a=String(s).slice(0,10).split("-");return a.length===3?a[0]+"年"+Number(a[1])+"月"+Number(a[2])+"日":s}
function value(id){return $(id).value.trim()}
function nullableNumber(id){const v=value(id);return v===""?null:Number(v)}
function uid(){return"rec-"+Date.now().toString(36)+"-"+(crypto.randomUUID?crypto.randomUUID().slice(0,8):Math.random().toString(36).slice(2,10))}
function flash(text,kind="ok"){const n=$("notice");n.textContent=text;n.hidden=false;n.className="notice "+(kind==="ok"?"flash-ok":kind==="warn"?"flash-warn":"flash-error");window.scrollTo({top:0,behavior:"smooth"})}
function clearFlash(){$("notice").hidden=true;$("notice").className="notice"}

function section(name){
  if(!sectionText[name])return;state.page=name;
  document.querySelectorAll(".page").forEach(e=>e.classList.toggle("active",e.id==="page-"+name));
  document.querySelectorAll(".nav").forEach(e=>e.classList.toggle("active",e.dataset.page===name));
  $("section-title").textContent=sectionText[name][0];$("section-subtitle").textContent=sectionText[name][1];
  history.replaceState(null,"","#"+name);window.scrollTo({top:0,behavior:"smooth"})
}
document.querySelectorAll("[data-page]").forEach(e=>e.addEventListener("click",()=>section(e.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(e=>e.addEventListener("click",()=>section(e.dataset.goto)));

function conversationPreview(data){
  return [...data].slice(-3).map(m=>{const user=m.role==="user",row=elem("div","chat-snippet"+(user?" user":"")),meta=elem("div","snippet-meta",user?"家庭反馈":"AI 建议");meta.append(elem("small","",humanDate(m.occurred_on)));if(m.source_kind==="summary")meta.append(elem("span","tag","摘要"));row.append(meta,elem("p","",m.content));return row})
}
function conversationFull(data,filter){
  const matching=data.filter(m=>(m.content+" "+m.occurred_on).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));$("chat-total").textContent=matching.length+" 条记录";
  return matching.map(m=>{const user=m.role==="user",row=elem("div","message"+(user?" user":"")),meta=elem("div","message-meta",user?"家庭反馈":"AI 回复");meta.append(elem("small","",humanDate(m.occurred_on)));if(m.source_kind==="summary")meta.append(elem("span","tag","摘要（非逐字原文）"));const bubble=elem("div","bubble");bubble.append(meta,elem("div","",m.content));row.append(elem("div","avatar",user?"家":"AI"),bubble);return row})
}
function observationItem(o){const row=elem("div","observation"),symbol=elem("div","obs-symbol"+(o.kind==="hypothesis"?" hypothesis":""),o.kind==="hypothesis"?"?":"✓"),body=elem("div");body.append(elem("h4","",o.content),elem("p","",(o.kind==="hypothesis"?"待验证假设":"家庭观察")+" · "+o.category+" · "+o.source));row.append(symbol,body);return row}
function timelineItem(o){const box=elem("article","timeline-entry"+(o.kind==="hypothesis"?" hypothesis":""));box.append(elem("small","",humanDate(o.occurred_on)+" · "+(o.kind==="hypothesis"?"待验证假设":"观察记录")),elem("h3","",o.category),elem("p","",o.content));return box}
function planItem(p){const row=elem("article","record");row.append(elem("small","",(p.start_date||"")+" 至 "+(p.end_date||"")+" · "+(p.status==="suggested"?"建议稿":p.status)),elem("h3","",p.title),elem("p","",p.details));return row}
function reportItem(p){const row=elem("article","record");row.append(elem("small","",humanDate(p.occurred_on)),elem("h3","",p.title),elem("p","",p.content));return row}

function recordSummary(r){
  const p=r.payload||{};
  if(r.type==="daily_homework"){
    const rows=p.subjects||[], wrong=rows.reduce((n,x)=>n+(Number(x.wrong_count)||0),0);
    const done=rows.filter(x=>x.status==="done"||x.status==="no_homework").length;
    const detail=rows.map(x=>x.subject+"："+(statusNames[x.status]||x.status)+(x.wrong_count!=null?"，错 "+x.wrong_count+" 道":"")+(x.error_types?"（"+x.error_types+"）":"")).join("；");
    return {title:"学校作业 · "+done+"/"+rows.length+" 科完成",text:(wrong?"共记录错题 "+wrong+" 道。":"未记录错题。")+" "+detail}
  }
  if(r.type==="extra_work")return{title:"额外作业 · "+(p.subject||"未标科目"),text:(p.content||"")+(p.completed_count!=null?"；完成 "+p.completed_count+(p.planned_count!=null?"/"+p.planned_count:"")+" 题":"")+(p.wrong_count!=null?"；错 "+p.wrong_count+" 题":"")+(p.duration_minutes!=null?"；"+p.duration_minutes+" 分钟":"")+(p.error_types?"；"+p.error_types:"")};
  if(r.type==="exam_scores"){const rows=p.subjects||[];return{title:"考试 · "+(p.exam_name||"未命名"),text:rows.map(x=>x.subject+" "+x.score+"/"+x.full_score+(x.error_types?"（"+x.error_types+"）":"")).join("；")}}
  if(r.type==="teacher_feedback")return{title:"老师反馈 · "+(p.subject||p.source||"综合"),text:(p.content||"")+(p.follow_up?"；后续："+p.follow_up:"")};
  return{title:typeNames[r.type]||r.type,text:""}
}
function miniRecord(r){const s=recordSummary(r),row=elem("div","mini-record");row.append(elem("h4","",s.title),elem("p","",humanDate(r.record_date)+" · "+s.text));return row}
function ledger(){
  if(!state.data)return;
  const type=$("record-filter-type").value,date=$("record-filter-date").value;
  const rows=(state.data.records||[]).filter(r=>(!type||r.type===type)&&(!date||r.record_date===date));
  const host=$("record-ledger");host.replaceChildren();
  if(!rows.length){host.append(elem("div","empty","没有符合条件的记录。"));return}
  const wrap=elem("div","subject-table-wrap"),table=elem("table","ledger"),thead=elem("thead"),trh=elem("tr");
  ["日期","类型","内容摘要","GitHub"].forEach(x=>trh.append(elem("th","",x)));thead.append(trh);table.append(thead);const tbody=elem("tbody");
  rows.forEach(r=>{const tr=elem("tr"),s=recordSummary(r),summary=elem("div","record-summary");summary.append(elem("strong","",s.title),elem("span","",s.text));const details=elem("details","record-detail"),sum=elem("summary","","查看完整结构"),pre=elem("pre","",JSON.stringify(r.payload,null,2));details.append(sum,pre);summary.append(details);const chip=elem("span","sync-chip"+(r.sync_status==="synced"?"":" pending"),r.sync_status==="synced"?"已归档":"待归档");tr.append(elem("td","",r.record_date),(()=>{const td=elem("td");td.append(elem("span","record-type",typeNames[r.type]||r.type));return td})(),(()=>{const td=elem("td");td.append(summary);return td})(),(()=>{const td=elem("td");td.append(chip);return td})());tbody.append(tr)});table.append(tbody);wrap.append(table);host.append(wrap)
}

function inputCell(type,cls,placeholder){
  const td=elem("td"),input=elem(type==="select"?"select":"input",cls||"");
  if(type!=="select"){input.type=type||"text";if(placeholder)input.placeholder=placeholder}
  td.append(input);return{td,input}
}
function option(select,val,label){select.append(new Option(label,val))}
function addDailyRow(subject=""){
  const tr=elem("tr");
  const subj=inputCell("text","subject-name");subj.input.value=subject;
  const status=inputCell("select");[["done","已完成"],["partial","部分完成"],["not_done","未完成"],["no_homework","无作业"]].forEach(x=>option(status.input,...x));
  const assigned=inputCell("number","tiny"),completed=inputCell("number","tiny"),wrong=inputCell("number","tiny"),errors=inputCell("text","wide","题型 / 知识点");
  [assigned,completed,wrong].forEach(x=>{x.input.min="0"});
  const correction=inputCell("select");[["not_needed","无需订正"],["done","已订正"],["partial","部分订正"],["not_done","未订正"]].forEach(x=>option(correction.input,...x));
  const duration=inputCell("number","tiny");duration.input.min="0";duration.input.placeholder="分钟";
  const remove=elem("td"),btn=elem("button","icon-button","×");btn.type="button";btn.title="删除此科目";btn.addEventListener("click",()=>tr.remove());remove.append(btn);
  tr.append(subj.td,status.td,assigned.td,completed.td,wrong.td,errors.td,correction.td,duration.td,remove);
  tr._fields={subject:subj.input,status:status.input,assigned_count:assigned.input,completed_count:completed.input,wrong_count:wrong.input,error_types:errors.input,correction:correction.input,duration_minutes:duration.input};
  $("daily-subjects").append(tr)
}
function addExamRow(subject=""){
  const tr=elem("tr");
  const subj=inputCell("text","subject-name");subj.input.value=subject;
  const score=inputCell("number","tiny"),full=inputCell("number","tiny"),wrong=inputCell("number","tiny"),errors=inputCell("text","wide","错因 / 题型"),classRank=inputCell("number","tiny"),gradeRank=inputCell("number","tiny");
  [score,full,wrong,classRank,gradeRank].forEach(x=>x.input.min="0");
  const remove=elem("td"),btn=elem("button","icon-button","×");btn.type="button";btn.addEventListener("click",()=>tr.remove());remove.append(btn);
  tr.append(subj.td,score.td,full.td,wrong.td,errors.td,classRank.td,gradeRank.td,remove);
  tr._fields={subject:subj.input,score:score.input,full_score:full.input,wrong_count:wrong.input,error_types:errors.input,class_rank:classRank.input,grade_rank:gradeRank.input};
  $("exam-subjects").append(tr)
}
function rowPayload(tbodyId){
  return [...$(tbodyId).querySelectorAll("tr")].map(tr=>Object.fromEntries(Object.entries(tr._fields).map(([k,input])=>[k,input.type==="number"?(input.value===""?null:Number(input.value)):input.value.trim()])))
}
function setRecordTab(name){state.recordTab=name;document.querySelectorAll(".record-tab").forEach(x=>x.classList.toggle("active",x.dataset.recordTab===name));document.querySelectorAll(".record-form").forEach(x=>x.classList.toggle("active",x.id==="record-form-"+name))}
document.querySelectorAll(".record-tab").forEach(x=>x.addEventListener("click",()=>setRecordTab(x.dataset.recordTab)));

function buildSubmission(which){
  if(which==="daily")return{type:"daily_homework",record_date:value("daily-date"),payload:{subjects:rowPayload("daily-subjects").filter(x=>x.subject),note:value("daily-note")}};
  if(which==="extra")return{type:"extra_work",record_date:value("extra-date"),payload:{subject:value("extra-subject"),content:value("extra-content"),planned_count:nullableNumber("extra-planned"),completed_count:nullableNumber("extra-completed"),wrong_count:nullableNumber("extra-wrong"),error_types:value("extra-errors"),duration_minutes:nullableNumber("extra-duration"),independence:$("extra-independence").value,note:value("extra-note")}};
  if(which==="exam")return{type:"exam_scores",record_date:value("exam-date"),payload:{exam_name:value("exam-name"),subjects:rowPayload("exam-subjects").filter(x=>x.subject),note:value("exam-note")}};
  if(which==="feedback")return{type:"teacher_feedback",record_date:value("feedback-date"),payload:{subject:value("feedback-subject"),source:value("feedback-source"),category:$("feedback-category").value,content:value("feedback-content"),follow_up:value("feedback-follow")}};
  throw Error("未知记录类型")
}
async function submitRecord(which,button){
  const key=localStorage.getItem("family-growth-edit-key")||value("edit-key");
  if(!key){flash("请先输入编辑码并保存到本机。","warn");return}
  let body;
  try{body={id:uid(),...buildSubmission(which)}}catch(error){flash(error.message,"error");return}
  button.disabled=true;const old=button.textContent;button.textContent="提交中…";clearFlash();
  try{
    const res=await fetch("/api/records",{method:"POST",headers:{"Content-Type":"application/json","X-Workbench-Key":key},body:JSON.stringify(body)});
    const out=await res.json();
    if(!res.ok||!out.ok)throw Error(out.error||"提交失败");
    if(out.record?.sync_status==="synced")flash("记录已保存到 D1，并自动归档到 GitHub。","ok");
    else if(out.github?.reason==="github_not_configured")flash("记录已保存到 D1；GitHub 写入凭证尚未配置，因此当前显示“待归档”。","warn");
    else flash("记录已保存到 D1，但本次 GitHub 自动归档失败；下一次提交会自动重试待归档记录。","warn");
    await load();
  }catch(error){flash("提交失败："+error.message,"error")}
  finally{button.disabled=false;button.textContent=old}
}
document.querySelectorAll(".submit-record").forEach(b=>b.addEventListener("click",()=>submitRecord(b.dataset.submit,b)));
$("add-daily-subject").addEventListener("click",()=>addDailyRow(""));
$("add-exam-subject").addEventListener("click",()=>addExamRow(""));
$("save-edit-key").addEventListener("click",()=>{const k=value("edit-key");if(!k){flash("请输入编辑码。","warn");return}localStorage.setItem("family-growth-edit-key",k);flash("编辑码已保存到当前浏览器。","ok")});
$("clear-edit-key").addEventListener("click",()=>{localStorage.removeItem("family-growth-edit-key");$("edit-key").value="";flash("当前设备保存的编辑码已清除。","ok")});
$("record-filter-type").addEventListener("change",ledger);$("record-filter-date").addEventListener("change",ledger);
$("clear-record-filter").addEventListener("click",()=>{$("record-filter-type").value="";$("record-filter-date").value="";ledger()});

function derivedMetrics(){
  const out=(state.data?.metrics||[]).map(x=>({...x}));
  for(const r of state.data?.records||[]){
    const p=r.payload||{};
    if(r.type==="exam_scores")for(const x of p.subjects||[])if(Number(x.full_score)>0)out.push({occurred_on:r.record_date,name:"考试·"+x.subject+" 得分率",value:Math.round(Number(x.score)/Number(x.full_score)*1000)/10,unit:"%",note:p.exam_name||""});
    if(r.type==="extra_work"){
      if(p.completed_count!=null)out.push({occurred_on:r.record_date,name:"额外作业·"+p.subject+" 完成题量",value:Number(p.completed_count),unit:"题",note:p.content||""});
      if(p.duration_minutes!=null)out.push({occurred_on:r.record_date,name:"额外作业·"+p.subject+" 用时",value:Number(p.duration_minutes),unit:"分钟",note:p.content||""});
      if(Number(p.completed_count)>0&&p.wrong_count!=null)out.push({occurred_on:r.record_date,name:"额外作业·"+p.subject+" 错题率",value:Math.round(Number(p.wrong_count)/Number(p.completed_count)*1000)/10,unit:"%",note:p.content||""})
    }
    if(r.type==="daily_homework")for(const x of p.subjects||[]){
      if(x.wrong_count!=null)out.push({occurred_on:r.record_date,name:"学校作业·"+x.subject+" 错题数",value:Number(x.wrong_count),unit:"题",note:x.error_types||""});
      if(x.duration_minutes!=null)out.push({occurred_on:r.record_date,name:"学校作业·"+x.subject+" 用时",value:Number(x.duration_minutes),unit:"分钟",note:""})
    }
  }
  return out
}
function svgElement(name,attrs,txt){const e=document.createElementNS("http://www.w3.org/2000/svg",name);for(const[k,v]of Object.entries(attrs||{}))e.setAttribute(k,v);if(txt!==undefined)e.textContent=String(txt);return e}
function chart(){
  const host=$("chart");host.replaceChildren();const metrics=derivedMetrics(),name=$("metric-select").value,points=metrics.filter(m=>m.name===name).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on));
  if(!metrics.length){host.append(elem("div","empty","还没有可绘制的真实量化数据。录入考试成绩、作业错题数或额外作业后，这里会自动形成趋势。"));return}
  if(points.length<2){const m=points[0];host.append(elem("div","empty",m?humanDate(m.occurred_on)+"："+m.value+m.unit+"。只有一条数据，暂不能判断趋势。":"请选择指标。"));return}
  const values=points.map(p=>Number(p.value));let low=Math.min(...values),high=Math.max(...values);if(low===high){low-=1;high+=1}
  const px=i=>48+i*554/(points.length-1),py=v=>192-(v-low)/(high-low)*145,svg=svgElement("svg",{viewBox:"0 0 650 248",class:"trend-chart",role:"img","aria-label":name+"随时间变化"});
  for(let i=0;i<4;i++){const y=192-i*48;svg.append(svgElement("line",{x1:"39",x2:"620",y1:y,y2:y,stroke:"#edf1eb"}))}
  svg.append(svgElement("polyline",{points:points.map((p,i)=>px(i)+","+py(Number(p.value))).join(" "),fill:"none",stroke:"#348a71","stroke-width":"3","stroke-linecap":"round","stroke-linejoin":"round"}));
  points.forEach((p,i)=>{const x=px(i),y=py(Number(p.value));svg.append(svgElement("circle",{cx:x,cy:y,r:"4.5",fill:"#348a71"}),svgElement("text",{x,y:y-12,"text-anchor":"middle"},p.value+(p.unit||"")),svgElement("text",{x,y:"223","text-anchor":"middle"},p.occurred_on.slice(5)))});
  host.append(svg,elem("p","message-meta","以上只呈现已录入数据；趋势本身不证明造成变化的原因。"))
}

function render(){
  const d=state.data;if(!d)return;
  $("count-conversations").textContent=d.conversations.length;$("count-records").textContent=(d.records||[]).length;$("count-observations").textContent=d.observations.length;$("count-plans").textContent=d.plans.filter(p=>p.status!=="completed").length;
  const messages=[...d.conversations].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.id.localeCompare(b.id));
  replace("home-conversations",conversationPreview(messages));replace("conversation-list",conversationFull(messages,$("chat-search").value.trim()));
  replace("home-records",(d.records||[]).slice(0,5).map(miniRecord));
  const observations=[...d.observations].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on));replace("timeline-list",observations.map(timelineItem));replace("plans-list",d.plans.map(planItem));replace("reports-list",d.reports.map(reportItem));ledger();
  const select=$("metric-select"),existing=select.value,names=[...new Set(derivedMetrics().map(m=>m.name))].sort((a,b)=>a.localeCompare(b,"zh-CN"));select.replaceChildren(...(names.length?names.map(m=>new Option(m,m)):[new Option("暂无指标","")]));if(names.includes(existing))select.value=existing;chart()
}
function background(){
  const d=state.data,convo=[...d.conversations].sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)).slice(-10),records=(d.records||[]).slice(0,20);
  return "以下是「同频」工作台的最新背景。标记为摘要的内容不是逐字原话。\n\n"+
    convo.map(m=>"["+humanDate(m.occurred_on)+" "+(m.role==="user"?"家庭反馈":"AI 建议")+(m.source_kind==="summary"?"／摘要":"")+"] "+m.content).join("\n\n")+
    "\n\n最近结构化记录：\n"+records.map(r=>"["+r.record_date+" "+(typeNames[r.type]||r.type)+"] "+recordSummary(r).text).join("\n")+
    "\n\n当前计划：\n"+d.plans.map(p=>p.title+"（"+p.status+"）："+p.details).join("\n")
}
async function copyBackground(){
  if(!state.data)return;const copy=background();
  try{await navigator.clipboard.writeText(copy)}catch{const box=elem("textarea");box.value=copy;box.style.cssText="position:fixed;left:8px;top:8px";document.body.append(box);box.select();document.execCommand("copy");box.remove()}
  flash("已复制最新讨论背景和结构化记录，可粘贴到 ChatGPT 继续分析。","ok")
}
async function load(){
  const status=$("sync-status");status.textContent="● 正在读取云端";status.classList.remove("warning");
  let data,staticFallback=false;
  try{const res=await fetch("/api/state",{cache:"no-store"});data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||"API unavailable")}
  catch(error){try{const res=await fetch("/data/workbench.json",{cache:"no-store"});if(!res.ok)throw Error();data=await res.json();data.records=[];staticFallback=true}catch{status.textContent="● 数据读取失败";status.classList.add("warning");flash("无法读取云端数据，请稍后刷新。","error");return}}
  state.data=data;render();status.textContent=staticFallback?"● 展示静态备份":"● D1 已同步";status.classList.toggle("warning",staticFallback);
  if(staticFallback)flash("D1 暂不可用，目前只展示部署时的静态对话数据。","warn")
}
$("chat-search").addEventListener("input",()=>state.data&&render());$("metric-select").addEventListener("change",chart);$("copy-context").addEventListener("click",copyBackground);$("refresh").addEventListener("click",load);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});setInterval(()=>{if(!document.hidden)load()},300000);

["daily-date","extra-date","exam-date","feedback-date"].forEach(id=>$(id).value=localDate());
DEFAULT_SUBJECTS.forEach(addDailyRow);["语文","数学","英语"].forEach(addExamRow);
$("edit-key").value=localStorage.getItem("family-growth-edit-key")||"";
section((location.hash||"#home").slice(1));load();