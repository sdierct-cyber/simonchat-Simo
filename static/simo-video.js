(()=>{
"use strict";
const $=id=>document.getElementById(id);
const p=$("lvPrompt"),lengthValue=$("lvLengthValue"),lengthUnit=$("lvLengthUnit"),outputResolution=$("lvOutputResolution"),aspect=$("lvAspect"),audio=$("lvAudio"),music=$("lvMusic"),voice=$("lvVoice"),
musicStyle=$("lvMusicStyle"),voiceText=$("lvVoiceText"),avoid=$("lvAvoid"),
planBtn=$("lvPlan"),createBtn=$("lvCreate"),summary=$("lvSummary"),scenes=$("lvScenes"),msg=$("lvMessage"),library=$("lvLibrary"),
progressPanel=$("lvProgressPanel"),progressBar=$("lvProgressBar"),progressTitle=$("lvProgressTitle"),progressDetail=$("lvProgressDetail"),
sceneProgress=$("lvSceneProgress"),elapsed=$("lvElapsed");

let currentPlan=null;
let timerHandle=null;
let startedAt=0;

const touched={audio:false,music:false,voice:false,musicStyle:false,voiceText:false};
audio.addEventListener("change",()=>{touched.audio=true});
music.addEventListener("change",()=>{touched.music=true});
voice.addEventListener("change",()=>{touched.voice=true});
musicStyle.addEventListener("input",()=>{touched.musicStyle=true});
voiceText.addEventListener("input",()=>{touched.voiceText=true});

function inferFromPromptLive(){
  const text=String(p.value||"");
  const lower=text.toLowerCase();

  const wantsAudio=/\b(sound|audio|ambience|ambient sound|road ambience|ocean ambience|sound effects|sfx)\b/i.test(text);
  const wantsMusic=/\b(music|score|soundtrack|orchestral|piano|ambient music|electronic|acoustic)\b/i.test(text);
  const wantsVoice=/\b(voiceover|voice over|narrat(?:e|ion|or))\b/i.test(text);

  if(!touched.audio) audio.checked=wantsAudio || audio.checked;
  if(!touched.music) music.checked=wantsMusic;
  if(!touched.voice) voice.checked=wantsVoice;

  if(wantsMusic && !touched.musicStyle && !musicStyle.value.trim()){
    const styles=["gentle cinematic orchestral","cinematic orchestral","ambient piano","upbeat electronic","orchestral","ambient","piano","electronic","acoustic","dramatic"];
    const found=styles.find(x=>lower.includes(x));
    if(found) musicStyle.value=found;
  }

  if(wantsVoice && !touched.voiceText && !voiceText.value.trim()){
    const patterns=[
      /\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s*:?\s*["“]([^"”]{1,800})["”]/i,
      /\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s*:?\s*['‘]([^'’]{1,800})['’]/i
    ];
    for(const pattern of patterns){
      const m=text.match(pattern);
      if(m){voiceText.value=m[1].trim();break}
    }
  }
}
p.addEventListener("input",inferFromPromptLive);

function requestedSeconds(){
  const raw=Math.max(0,Number(lengthValue.value||0));
  const mult=lengthUnit.value==="hours"?3600:(lengthUnit.value==="minutes"?60:1);
  return Math.max(10,Math.round(raw*mult));
}

const body=()=>({
  prompt:p.value.trim(),
  total_seconds:requestedSeconds(),
  output_resolution:outputResolution.value,
  aspect_ratio:aspect.value,
  audio:audio.checked,
  music:music.checked,
  voiceover:voice.checked,
  music_style:musicStyle.value.trim(),
  voiceover_text:voiceText.value.trim(),
  negative_prompt:avoid.value.trim(),
  quality:"cinematic",
  infer_from_prompt:true
});

async function post(url,data){
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(data)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw new Error(d.error||"Request failed.");
  return d;
}

function fmt(s){
  s=Math.max(0,Number(s||0));
  const m=Math.floor(s/60),r=Math.floor(s%60);
  return m?`${m}m ${r}s`:`${r}s`;
}

function setMessage(text,error=false){
  msg.textContent=text||"";
  msg.className=error?"error":"";
}

function startElapsed(){
  clearInterval(timerHandle);
  startedAt=Date.now();
  const tick=()=>{
    const sec=Math.floor((Date.now()-startedAt)/1000);
    const m=Math.floor(sec/60),s=String(sec%60).padStart(2,"0");
    elapsed.textContent=`${m}:${s} elapsed`;
  };
  tick();
  timerHandle=setInterval(tick,1000);
}

function stopElapsed(){
  clearInterval(timerHandle);
  timerHandle=null;
}

function showProgress(project){
  progressPanel.hidden=false;
  const list=project.scenes||[];
  const done=list.filter(s=>s.status==="succeeded").length;
  const total=Math.max(1,Number(project.scene_count||list.length||1));
  let pct=Math.round((done/total)*88);
  if(project.status==="assembly_pending") pct=94;
  if(project.status==="succeeded") pct=100;
  progressBar.style.width=`${Math.min(100,pct)}%`;

  if(project.status==="assembly_pending"){
    progressTitle.textContent="Simo is assembling and polishing the final video…";
    progressDetail.textContent=`${done}/${total} scenes complete · final assembly and audio normalization`;
  }else if(project.status==="succeeded"){
    progressTitle.textContent="Your Simo video is complete.";
    progressDetail.textContent=`${total}/${total} scenes complete · final video ready`;
  }else{
    progressTitle.textContent="Simo is producing your video…";
    progressDetail.textContent=`${done}/${total} scenes complete · ${String(project.status||"creating").replaceAll("_"," ")}`;
  }

  sceneProgress.innerHTML=list.map(s=>{
    const st=String(s.status||"waiting").replaceAll("_"," ");
    const mark=s.status==="succeeded"?"✓":(s.status==="failed"?"!":"•");
    return `<div class="scene-progress-row"><span>${mark} Scene ${Number(s.scene_index)+1}</span><span>${st}</span></div>`;
  }).join("");
}

function syncDelivery(plan){
  const d=plan.delivery||{};
  if(!touched.audio) audio.checked=!!d.audio;
  if(!touched.music) music.checked=!!d.music;
  if(!touched.voice) voice.checked=!!d.voiceover;
  if(d.music_style && !touched.musicStyle && !musicStyle.value.trim()) musicStyle.value=d.music_style;
  if(d.voiceover_text && !touched.voiceText && !voiceText.value.trim()) voiceText.value=d.voiceover_text;
  if(d.negative_prompt && !avoid.value.trim()) avoid.value=d.negative_prompt;
}

async function plan(){
  try{
    setMessage("Simo is reading your request, inferring sound, music, voiceover, and production settings, then pricing the complete production…");
    const d=await post("/api/long-video/plan",body());
    currentPlan=d.plan;
    syncDelivery(currentPlan);
    const q=String(currentPlan.output_resolution||"1080p").toUpperCase();
    summary.textContent=`${fmt(currentPlan.total_seconds)} · ${q} · ${currentPlan.scene_count} scenes · ${currentPlan.required_credits} protected Simo Credits total (${currentPlan.scene_credits} scene credits + ${currentPlan.orchestration_credits} orchestration/assembly).`;
    scenes.innerHTML=currentPlan.scenes.map(s=>`<div class="scene"><strong>${s.summary}</strong><br><small>${s.description||""}</small><br><small>${s.duration_seconds}s · ${s.required_credits} credits</small></div>`).join("");
    createBtn.disabled=false;
    setMessage("No provider generation was billed. Review the production plan and protected total, then create when ready.");
  }catch(e){
    currentPlan=null;
    createBtn.disabled=true;
    setMessage(e.message,true);
  }
}

async function create(){
  if(!currentPlan){
    await plan();
    if(!currentPlan)return;
  }
  try{
    createBtn.disabled=true;
    progressPanel.hidden=false;
    startElapsed();
    progressBar.style.width="2%";
    progressTitle.textContent="Simo is securing your production budget…";
    progressDetail.textContent="No provider generation starts until the full protected production passes preflight.";
    sceneProgress.innerHTML="";
    setMessage("Simo is reserving the protected production budget…");
    const d=await post("/api/long-video/start",body());
    showProgress(d.project);
    await watch(d.project.id);
  }catch(e){
    stopElapsed();
    setMessage(e.message,true);
    createBtn.disabled=false;
  }
}

async function watch(id){
  for(let i=0;i<720;i++){
    await new Promise(r=>setTimeout(r,6000));
    const r=await fetch(`/api/long-video/status/${encodeURIComponent(id)}`,{credentials:"same-origin"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok){
      stopElapsed();
      setMessage(d.error||"Could not check production.",true);
      createBtn.disabled=false;
      return;
    }
    const x=d.project;
    showProgress(x);
    if(x.status==="succeeded"){
      stopElapsed();
      setMessage("Long video complete — Created with Simo.");
      await load();
      createBtn.disabled=false;
      return;
    }
    if(x.status==="failed"||x.status==="canceled"){
      stopElapsed();
      setMessage(x.error||"Production stopped.",true);
      await load();
      createBtn.disabled=false;
      return;
    }
  }
  stopElapsed();
  setMessage("Production is still running. It remains safely in your Simo Long Video Library.");
}

async function load(){
  const r=await fetch("/api/long-video/library",{credentials:"same-origin"});
  const d=await r.json().catch(()=>({}));
  if(!d.ok)return;
  library.innerHTML=(d.projects||[]).map(x=>{
    const terminal=x.status==="succeeded";
    const pct=terminal?100:(x.status==="assembly_pending"?94:12);
    return `<div class="project"><strong>${x.title||"Long video"}</strong><div>${fmt(x.total_seconds)} · ${x.scene_count} scenes · ${x.required_credits} credits · ${String(x.status||"").replaceAll("_"," ")}</div>${x.output_url?`<video controls playsinline preload="metadata" src="${x.output_url}" style="width:100%;margin-top:10px;border-radius:12px"></video>`:""}<div class="progress"><div style="width:${pct}%"></div></div></div>`;
  }).join("")||"<p>No long-form projects yet.</p>";
}

planBtn.addEventListener("click",plan);
createBtn.addEventListener("click",create);
$("lvRefresh").addEventListener("click",load);
load();
})();
