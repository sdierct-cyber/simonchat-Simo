(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const fields = {
    prompt: $("svPrompt"), duration: $("svDuration"), quality: $("svQuality"), aspect: $("svAspect"),
    outputResolution: $("svOutputResolution"),
    camera: $("svCamera"), motion: $("svMotion"), musicStyle: $("svMusicStyle"), voiceoverText: $("svVoiceoverText"),
    audio: $("svAudio"), music: $("svMusic"), voiceover: $("svVoiceover"), negative: $("svNegative")
  };
  const credits = $("svCredits"), generateBtn=$("svGenerate"), progress=$("svProgress"), progressText=$("svProgressText"), message=$("svMessage"), library=$("svLibrary"), understood=$("svUnderstood");

  const optionTouched={audio:false,music:false,voiceover:false};
  fields.audio.addEventListener("change",()=>{optionTouched.audio=true});
  fields.music.addEventListener("change",()=>{optionTouched.music=true});
  fields.voiceover.addEventListener("change",()=>{optionTouched.voiceover=true});

  const payload = () => ({
    prompt: fields.prompt.value.trim(), duration_seconds:Number(fields.duration.value), quality:fields.quality.value,
    output_resolution:fields.outputResolution.value, aspect_ratio:fields.aspect.value, camera:fields.camera.value.trim(), motion:fields.motion.value.trim(), infer_from_prompt:true,
    music_style:fields.musicStyle.value.trim(), voiceover_text:fields.voiceoverText.value.trim(),
    audio:fields.audio.checked, music:fields.music.checked, voiceover:fields.voiceover.checked,
    negative_prompt:fields.negative.value.trim()
  });
  const post = async (url, body) => {
    const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({ok:false,error:"Invalid server response."}));
    if(!r.ok||!d.ok) throw new Error(d.error||"Request failed."); return d;
  };
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const say=(t,e=false)=>{message.textContent=t||"";message.classList.toggle("error",!!e)};
  let timer=null;
  const stages=["Understanding your idea and creative intent…","Planning scenes, camera movement, timing, and sound…","Simo is generating the visual sequence…","Simo is polishing motion, detail, color, and audio…"];
  const busy=on=>{generateBtn.disabled=on;progress.hidden=!on;clearInterval(timer);if(on){let i=0;progressText.textContent=stages[0];timer=setInterval(()=>{i=Math.min(i+1,stages.length-1);progressText.textContent=stages[i];if(i===stages.length-1)clearInterval(timer)},2300)}};

  function interpretationText(i){
    if(!i) return "Describe the finished video normally. Simo will figure out the production settings.";
    if(!optionTouched.audio) fields.audio.checked=!!i.audio;
    if(!optionTouched.music) fields.music.checked=!!i.music;
    if(!optionTouched.voiceover) fields.voiceover.checked=!!i.voiceover;
    if(i.voiceover_text && !fields.voiceoverText.value.trim()){
      fields.voiceoverText.value=i.voiceover_text;
    }

    const parts=[`${i.duration_seconds}s`, String(i.output_resolution||"1080p").toUpperCase(), String(i.quality||"hd").replace("_"," "), i.aspect_ratio];
    if(i.camera) parts.push(`camera: ${i.camera}`);
    if(i.motion) parts.push(`motion: ${i.motion}`);
    const delivery=[];
    if(i.audio) delivery.push("natural sound");
    if(i.music) delivery.push(i.music_style?`${i.music_style} music`:"music");
    if(i.voiceover){
      const vo=i.voiceover_text?`voiceover: "${i.voiceover_text}"`:"voiceover";
      delivery.push(vo);
    }
    if(!delivery.length) delivery.push("silent video");
    return "Simo will deliver: " + parts.join(" · ") + " · " + delivery.join(" + ");
  }
  let lastVerifiedSignature = "";
  function requestSignature(){
    const p=payload();
    return JSON.stringify({
      prompt:p.prompt||"",
      duration_seconds:p.duration_seconds||0,
      quality:p.quality||"",
      output_resolution:p.output_resolution||"1080p",
      aspect_ratio:p.aspect_ratio||"",
      camera:p.camera||"",
      motion:p.motion||"",
      audio:!!p.audio,
      music:!!p.music,
      voiceover:!!p.voiceover,
      voiceover_text:p.voiceover_text||"",
      music_style:p.music_style||"",
      negative_prompt:p.negative_prompt||""
    });
  }
  function clearProtectedPrice(){
    lastVerifiedSignature="";
    if(credits) credits.textContent="Verify";
    const label=$("svCreditsLabel");
    if(label) label.textContent="Protected Simo Credits for this request";
  }
  async function quote(){
    if(!fields.prompt.value.trim()){
      clearProtectedPrice();
      if(understood) understood.textContent="Simo will interpret your request here.";
      return;
    }
    if(requestedLongSeconds()) {
      if(understood) understood.textContent="This request needs Long Video. Click Create with Simo to transfer your description and settings, without paying.";
      clearProtectedPrice();
      return;
    }
    try{
      const d=await post("/api/video/quote",payload());
      if(understood) understood.textContent=interpretationText(d.interpretation);
      if(lastVerifiedSignature!==requestSignature()) clearProtectedPrice();
      say("");
    }catch(e){
      clearProtectedPrice();
      say(e.message,true);
    }
  }
  async function pollJob(jobId){
    const maxPolls=120; // 10+ minutes at >=5s intervals
    for(let n=0;n<maxPolls;n+=1){
      await new Promise(r=>setTimeout(r,5200+Math.floor(Math.random()*1400)));
      const res=await fetch(`/api/video/status/${encodeURIComponent(jobId)}`,{credentials:"same-origin"});
      const d=await res.json().catch(()=>({}));
      if(!res.ok||!d.ok) throw new Error(d.error||"Could not check video status.");
      const j=d.job||{};
      if(j.status==="succeeded"){
        progressText.textContent="Video complete — Simo secured your result.";
        return j;
      }
      if(j.status==="failed"||j.status==="canceled"){
        throw new Error(j.error||"Video generation did not complete. Reserved Simo Credits were released.");
      }
      if(j.status==="storage_pending"){
        progressText.textContent="Video finished — Simo is securing the file…";
      }else{
        progressText.textContent="Simo is creating your video…";
      }
    }
    throw new Error("The video is still processing. It remains in your Simo Video Library; refresh shortly.");
  }

  // Preserve a requested long production rather than silently generating 30 seconds.
  // The destination reads this draft once, in the user's same-origin session.
  function requestedLongSeconds(){
    const text=fields.prompt.value||"";
    const mins=text.match(/\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i);
    const secs=text.match(/\b(\d+)\s*(?:seconds?|secs?)\b/i);
    const hours=text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
    const total=(hours?Number(hours[1])*3600:0)+(mins?Number(mins[1])*60:0)+(secs?Number(secs[1]):0);
    return total>30?Math.round(total):0;
  }
  function moveToLongVideo(){
    const desired=requestedLongSeconds();
    if(!desired) return false;
    const data=payload();
    const draft={
      version:1,created:Date.now(),prompt:data.prompt,total_seconds:desired,
      output_resolution:data.output_resolution,aspect_ratio:data.aspect_ratio,
      music_style:data.music_style,voiceover_text:data.voiceover_text,
      negative_prompt:data.negative_prompt,audio:data.audio,music:data.music,voiceover:data.voiceover,
      camera:data.camera,motion:data.motion
    };
    try { sessionStorage.setItem("simo_long_video_handoff_v1",JSON.stringify(draft)); }
    catch(e){ say("Could not transfer the request. Open Long Video and copy your description there.",true);return true; }
    window.location.assign("/video/long");
    return true;
  }
  async function generate(){
    if(!fields.prompt.value.trim()){
      say("Tell Simo what video you want to create.",true);
      fields.prompt.focus();
      return;
    }
    if(moveToLongVideo()) return;
    busy(true);
    say("Simo is checking the full request, price, and delivery requirements…");
    try{
      if(!lastVerifiedSignature || lastVerifiedSignature!==requestSignature()){
        const verified=await verifyProtectedProvider({quiet:true});
        if(!verified){
          busy(false);
          return;
        }
      }
      say("Protected plan approved. Simo is starting your video…");
      const d=await post("/api/video/generate",payload());
      const j=d.job||{};
      if(d.mock_mode){
        say(`Simo Video protected test completed. ${j.required_credits||"?"} Simo Credits were only estimated; no paid provider was called.`);
        await loadLibrary();
        return;
      }
      if(credits) credits.textContent=String(j.required_credits||credits.textContent||"—");
      say(`Simo started your protected video. ${j.required_credits||"?"} Simo Credits are reserved while generation runs.`);
      progress.hidden=false;
      progressText.textContent="Simo is creating your video…";
      const finished=await pollJob(j.id);
      say(`Created with Simo — video complete. ${finished.required_credits||j.required_credits||"?"} Simo Credits used.`);
      await loadLibrary();
    }catch(e){
      say(e.message||"Video generation failed.",true);
      await loadLibrary().catch(()=>{});
    }finally{
      busy(false);
    }
  }
  async function loadLibrary(){try{const r=await fetch("/api/video/library",{credentials:"same-origin"});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Could not load Video Library.");if(!d.jobs.length){library.innerHTML='<div class="sv-card"><small>No Simo videos yet.</small></div>';return}library.innerHTML=d.jobs.map(j=>`<article class="sv-card"><small>${esc(j.status)} · ${esc(j.spec?.duration_seconds)}s · ${esc(j.required_credits)} credits</small><h3>${esc(j.title)}</h3><p>${esc(j.prompt)}</p><div class="sv-created-by">${esc(j.attribution||"Created with Simo")}</div>${j.output_url?`<video class="sv-video-result" controls playsinline preload="metadata" src="${esc(j.output_url)}"></video><a href="${esc(j.output_url)}" target="_blank" rel="noopener">Open Simo video</a>`:(j.status==="failed"||j.status==="canceled"?`<span class='sv-muted'>${esc(j.error||"Generation did not complete.")}</span>`:`<span class='sv-muted'>${j.status==="succeeded"?"Mock/test record — no paid provider output.":"Simo is still creating this video."}</span>`)}<div class="sv-actions"><button class="sv-secondary" data-delete="${esc(j.id)}">Delete</button></div></article>`).join("");library.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this Simo Video project?"))return;await post("/api/video/delete",{id:b.dataset.delete});loadLibrary()})}catch(e){library.innerHTML=`<div class="sv-card"><small>${esc(e.message)}</small></div>`}}
  [fields.duration,fields.quality,fields.aspect,fields.audio,fields.music,fields.voiceover].forEach(x=>x.addEventListener("change",()=>{clearProtectedPrice();quote()}));
  [fields.camera,fields.motion,fields.musicStyle,fields.voiceoverText,fields.negative].forEach(x=>{
    x.addEventListener("input",()=>{clearProtectedPrice()});
  });
  let quoteTimer=null;
  fields.prompt.addEventListener("input",()=>{clearProtectedPrice();clearTimeout(quoteTimer);quoteTimer=setTimeout(quote,450)});

  const helpPopover = $("svHelpPopover");
  document.querySelectorAll(".sv-help").forEach(btn=>{
    btn.addEventListener("click",(ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      if(!helpPopover) return;
      const text=btn.getAttribute("data-help")||"";
      const same=!helpPopover.hidden && helpPopover.dataset.owner===text;
      if(same){helpPopover.hidden=true;helpPopover.dataset.owner="";return}
      helpPopover.textContent=text;
      helpPopover.dataset.owner=text;
      helpPopover.hidden=false;
      const r=btn.getBoundingClientRect();
      helpPopover.style.left=Math.max(12,Math.min(window.innerWidth-332,r.left-120))+"px";
      helpPopover.style.top=(r.bottom+8+window.scrollY)+"px";
    });
  });
  document.addEventListener("click",()=>{if(helpPopover)helpPopover.hidden=true});


  async function verifyProtectedProvider(options={}){
    const btn=$("svVerifyProvider");
    const quiet=!!options.quiet;
    if(!fields.prompt.value.trim()){say("Tell Simo what video you want to create.",true);return null}
    try{
      if(btn){btn.disabled=true;btn.textContent="Checking protected price…"}
      if(!quiet) say("Simo is checking the full production plan and protected price. No generation is billed for this check.");
      const d=await post("/api/video/provider-dry-run",payload());
      const r=d.result||{};
      const details=[
        `${r.duration_seconds||"?"}s`,
        r.aspect_ratio||"",
        r.resolution||"",
        `provider estimate ${r.estimated_provider_credits||"?"} credits`,
        `protected Simo estimate ${r.estimated_simo_credits||"?"} credits`
      ].filter(Boolean).join(" · ");
      lastVerifiedSignature=requestSignature();
      if(credits) credits.textContent=String(r.estimated_simo_credits||"—");
      const priceLabel=$("svCreditsLabel");
      if(priceLabel) priceLabel.textContent="Protected Simo Credits for this request";
      const delivery=r.delivery||{};
      const audioBits=[];
      if(delivery.natural_sound) audioBits.push("natural sound");
      if(delivery.music) audioBits.push("music");
      if(delivery.voiceover) audioBits.push("voiceover");
      const deliveryText=audioBits.length?` Delivery requires ${audioBits.join(" + ")}.`:" Delivery is silent video.";
      if(!quiet) say(`Protected connection verified — ${details}.${deliveryText} This is the protected Simo price for the current request. No provider generation was billed.`);
      return d;
    }catch(e){
      say(e.message||"Simo could not approve this production plan. No provider generation was billed.",true);
      return null;
    }finally{
      if(btn){btn.disabled=false;btn.textContent="Check Price — No Charge"}
    }
  }
  const verifyBtn=$("svVerifyProvider");
  if(verifyBtn) verifyBtn.addEventListener("click",()=>verifyProtectedProvider({quiet:false}));

  generateBtn.addEventListener("click",generate);
  $("svRefresh").addEventListener("click",loadLibrary);
  quote();loadLibrary();
})();
