/* SIMO R10.62 — isolated user-handle WebRTC AUDIO + VIDEO beta. No PSTN/voicemail. */
(() => {
  'use strict';
  if (window.__SIMO_CALLING_BETA__) return;
  window.__SIMO_CALLING_BETA__ = true;
  const $ = id => document.getElementById(id);
  let last = 0, current = '', pc = null, local = null, incoming = null, pendingIce = [];
  let myHandle = '', calling = false, busy = false, poller = null, lastMissedIds = new Set(), missedBoot = false;
  let callMode = 'audio', remoteStream = null;
  const api = async (path, body) => {
    const res = await fetch('/api/simo-calling/' + path, {credentials:'same-origin',
      ...(body !== undefined ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
    const obj = await res.json(); if (!res.ok || !obj.ok) throw new Error(obj.error || 'Calling service unavailable'); return obj;
  };
  const say = s => {if ($('simoCallStatus')) $('simoCallStatus').textContent = s;};
  const notice = (message, duration=9000) => {
    const wrap=$('simoCallNotice'); if(!wrap)return;
    wrap.textContent=message;wrap.hidden=false;
    clearTimeout(notice.timer);notice.timer=setTimeout(()=>{wrap.hidden=true;},duration);
  };
  async function missedCheck() {
    if(!myHandle)return;
    try {
      const result=await api('missed');const list=result.missed||[];
      $('simoCallMissedCount').textContent=list.length?' · '+list.length+' missed':'';
      const ids=new Set(list.map(x=>x.call_id));
      if(missedBoot)for(const m of list)if(!lastMissedIds.has(m.call_id))notice('☎ Missed call from @'+m.caller_handle);
      lastMissedIds=ids;missedBoot=true;
      const box=$('simoCallMissedList');box.replaceChildren();
      for(const m of list){const row=document.createElement('div');row.style.margin='6px 0';
        const label=document.createElement('span');label.textContent='Missed @'+m.caller_handle+' · '+new Date(m.created_at*1000).toLocaleString()+' ';
        const ack=document.createElement('button');ack.textContent='Dismiss';ack.type='button';ack.onclick=async()=>{
          try{await api('missed',{call_id:m.call_id});await missedCheck();}catch(e){say(e.message);}};
        row.append(label,ack);box.append(row);
      }
    }catch(e){}
  };
  function beginMonitoring(){if(poller)return;poll();missedCheck();poller=setInterval(()=>{
    if(!document.hidden || current || incoming){poll();missedCheck();}
  },7000);}

  function cleanup() {
    if (pc) {pc.onicecandidate=null;pc.ontrack=null;pc.close();pc=null;}
    if (local) {local.getTracks().forEach(t=>t.stop());local=null;}
    if ($('simoCallAudio')) $('simoCallAudio').srcObject=null;
    if ($('simoCallRemoteVideo')) {$('simoCallRemoteVideo').srcObject=null;$('simoCallRemoteVideo').hidden=true;}
    if ($('simoCallLocalVideo')) {$('simoCallLocalVideo').srcObject=null;$('simoCallLocalVideo').hidden=true;}
    remoteStream=null;callMode='audio';
    if($('simoCallVideoControls'))$('simoCallVideoControls').hidden=true;
    if($('simoCallMicToggle'))$('simoCallMicToggle').textContent='Mute microphone';
    if($('simoCallCameraToggle'))$('simoCallCameraToggle').textContent='Turn camera off';
    current=''; incoming=null; pendingIce=[]; calling=false;window.__simoCallOffer=null;
    $('simoCallAnswer').hidden=true;
    $('simoCallHangup').hidden=true;
    $('simoCallStart').disabled=false;
    $('simoCallStartVideo').disabled=false;
  }
  async function send(kind, data={}) {if (current) await api('signal', {call_id:current, kind, data});}
  function showLocalPreview() {
    const video=$('simoCallLocalVideo');
    if(!video)return;
    const tracks=local?.getVideoTracks()||[];
    video.hidden=tracks.length===0;
    video.srcObject=tracks.length?local:null;
    if(tracks.length) video.play().catch(()=>{});
  }
  function renderRemoteTrack(event) {
    if(!remoteStream)remoteStream=new MediaStream();
    if(!remoteStream.getTracks().some(t=>t.id===event.track.id))remoteStream.addTrack(event.track);
    const video=$('simoCallRemoteVideo');
    const audio=$('simoCallAudio');
    if(callMode==='video' && video){
      video.hidden=false;video.srcObject=remoteStream;video.play().catch(()=>{});
      // Remote video plays its own audio. Never double-play the same stream.
      if(audio)audio.srcObject=null;
    }else if(audio){audio.srcObject=remoteStream;audio.play().catch(()=>{});}
  }
  async function mediaConnection() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Use HTTPS or localhost with a WebRTC-compatible browser.');
    if (!local) local = await navigator.mediaDevices.getUserMedia({audio:true, video:callMode==='video'?{facingMode:'user'}:false});
    showLocalPreview();
    if($('simoCallVideoControls')) $('simoCallVideoControls').hidden=false;
    if($('simoCallCameraToggle')) $('simoCallCameraToggle').hidden=callMode!=='video';
    if (!pc) {
      pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
      local.getTracks().forEach(track => pc.addTrack(track,local));
      pc.onicecandidate = event => {if(event.candidate) send('ice',{candidate:event.candidate.toJSON()}).catch(()=>{});};
      pc.ontrack = renderRemoteTrack;
      pc.onconnectionstatechange = () => {if(pc && pc.connectionState==='connected') say('Connected — '+callMode+' call active');
        if(pc && pc.connectionState==='failed') say('Connection failed. A TURN relay may be required.');};
    }
    return pc;
  }
  async function flushIce() {if(!pc?.remoteDescription)return;while(pendingIce.length) await pc.addIceCandidate(pendingIce.shift()).catch(()=>{});}
  async function begin(mode='audio') {
    if(calling)return;
    try {
      const handle = String($('simoCallTarget').value||'').trim().replace(/^@/,'');
      if(!handle){say('Enter the recipient handle.');return;}
      calling=true;callMode=mode;
      await mediaConnection(); // ask permission before initiating a call
      const result=await api('start',{handle,mode:callMode}); current=result.call_id;
      $('simoCallHangup').hidden=false; $('simoCallStart').disabled=true;$('simoCallStartVideo').disabled=true;
      const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
      await send('offer',{sdp:pc.localDescription.toJSON()});
      say('Calling @'+handle+' ('+callMode+')…');
    } catch(e){say(e.message);cleanup();}
  }
  async function answer() {
    if(!incoming)return;
    try {
      current=incoming;
      await mediaConnection();
      await send('accept');
      $('simoCallAnswer').hidden=true; $('simoCallHangup').hidden=false;
      say('Connecting…');
    } catch(e){say(e.message);await send('decline').catch(()=>{});cleanup();}
  }
  async function end() {await send('hangup').catch(()=>{});cleanup();say('Call ended — returned to standby.');notice('Call ended');await missedCheck();}
  async function eventHandler(ev) {
    if(ev.kind==='incoming') {
      if(current || incoming) {const old=current;current=ev.call_id;await send('decline').catch(()=>{});current=old;return;}
      incoming=ev.call_id; current=ev.call_id;callMode=ev.data.mode==='video'?'video':'audio';
      notice((callMode==='video'?'📹 Incoming video call':'☎ Incoming audio call')+' from @'+String(ev.data.from||'unknown')+' — open Simo Calling to answer.',15000);
      $('simoCallAnswer').hidden=false;$('simoCallHangup').hidden=false;
      $('simoCallStart').disabled=true;$('simoCallStartVideo').disabled=true; say('Incoming '+callMode+' call from @'+String(ev.data.from||'unknown'));
      return;
    }
    if(ev.call_id!==current)return;
    try {
      if(ev.kind==='offer') { window.__simoCallOffer=ev.data.sdp; if(pc && local && pc.signalingState==='stable' && incoming) {
        await pc.setRemoteDescription(ev.data.sdp); await flushIce();
        const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await send('answer',{sdp:pc.localDescription.toJSON()});
      }}
      if(ev.kind==='accept' && pc && !incoming) say('Answered — connecting '+callMode+'…');
      if(ev.kind==='answer' && pc) {await pc.setRemoteDescription(ev.data.sdp);await flushIce();}
      if(ev.kind==='ice' && ev.data.candidate) {if(pc?.remoteDescription) await pc.addIceCandidate(ev.data.candidate);else pendingIce.push(ev.data.candidate);}
      if(ev.kind==='decline'||ev.kind==='hangup') {cleanup();notice(ev.kind==='decline'?'Call declined':'Call ended');say(ev.kind==='decline'?'Call declined — returned to standby.':'Call ended by other participant — returned to standby.');}
    } catch(e){say('Call signaling error: '+e.message);}
  }
  async function poll() {
    if(busy)return;busy=true;
    try {const d=await api('poll?after='+last);for(const e of d.events){last=Math.max(last,e.id);await eventHandler(e);}}
    catch(e){say(e.message);} finally{busy=false;}
  }
  const css=`#simoCallingBtn{position:fixed;right:20px;bottom:140px;z-index:9000;background:#075b78;color:white;border:1px solid #73d9fa;border-radius:99px;padding:11px 17px;font-weight:750;cursor:pointer;box-shadow:0 6px 30px #0008}#simoCallingPanel{position:fixed;right:14px;bottom:196px;z-index:9001;width:min(365px,calc(100vw - 28px));padding:18px;background:#081a2e;border:1px solid #4789ad;border-radius:16px;box-shadow:0 14px 50px #000b;color:#edf7ff;font-family:system-ui,sans-serif}#simoCallingPanel[hidden],#simoCallingPanel [hidden]{display:none!important}#simoCallingPanel input{box-sizing:border-box;width:100%;margin:5px 0 9px;padding:10px;color:#fff;background:#102f4b;border:1px solid #426b8a;border-radius:9px}#simoCallingPanel button{cursor:pointer;background:#174f74;color:#fff;border:1px solid #5e91b6;border-radius:9px;padding:9px;margin:3px}#simoCallStatus{font-size:12px;line-height:1.4;min-height:20px;color:#c6dfeb}#simoCallingPanel small{color:#b5ccd9}#simoCallClose{float:right}#simoCallVideoGrid{display:grid;gap:8px;max-height:50vh;overflow:auto}#simoCallVideoGrid video{display:block;max-width:100%;width:100%;max-height:230px;object-fit:contain;background:#01070b;border-radius:10px}#simoCallVideoGrid video[hidden]{display:none!important}#simoCallingPanel{max-height:min(80vh,700px);overflow-y:auto}`;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const btn=document.createElement('button');btn.id='simoCallingBtn';btn.type='button';btn.textContent='☎ Simo Audio / Video (Beta)';
  const panel=document.createElement('section');panel.id='simoCallingPanel';panel.hidden=true;
  panel.innerHTML=`<button id="simoCallClose" type="button" aria-label="Close calling panel">×</button><h3 style="margin:0 0 10px">☎ Simo Calling<span id="simoCallMissedCount"></span></h3><small>Local beta: one-to-one browser voice/video between signed-in Simo users. No telephone numbers or voicemail yet.</small><p id="simoCallStatus" role="status">Sign in to use calling.</p><label>Your unique handle<input id="simoCallHandle" maxlength="24" placeholder="e.g. simo_friend" autocomplete="off"></label><button type="button" id="simoCallSave">Save handle</button><hr style="border:0;border-top:1px solid #35536a;margin:12px 0"><label>Call another handle<input id="simoCallTarget" maxlength="25" placeholder="@friend_handle" autocomplete="off"></label><button type="button" id="simoCallStart">Audio call</button><button type="button" id="simoCallStartVideo">📹 Start video call</button><button type="button" id="simoCallAnswer" hidden>Answer</button><button type="button" id="simoCallHangup" hidden>Decline / Hang up</button><div id="simoCallVideoControls" hidden><button type="button" id="simoCallMicToggle">Mute microphone</button><button type="button" id="simoCallCameraToggle" hidden>Turn camera off</button></div><div id="simoCallVideoGrid"><video id="simoCallRemoteVideo" autoplay playsinline hidden aria-label="Other participant video"></video><video id="simoCallLocalVideo" autoplay muted playsinline hidden aria-label="Your camera preview"></video></div><div id="simoCallMissedList" aria-label="Missed calls"></div><audio id="simoCallAudio" autoplay playsinline></audio>`;
  const banner=document.createElement('div');banner.id='simoCallNotice';banner.hidden=true;banner.setAttribute('role','status');
  banner.style.cssText='position:fixed;right:14px;top:80px;z-index:9500;max-width:min(390px,calc(100vw - 28px));border:1px solid #71c9ed;border-radius:12px;padding:12px 15px;background:#103b55;color:#fff;font:600 13px system-ui;box-shadow:0 8px 32px #0008';
  document.body.append(btn,panel,banner);
  btn.onclick=()=>{const opening=panel.hidden;if(opening)window.dispatchEvent(new CustomEvent('simo-connect:panel-open',{detail:{panel:'calling'}}));panel.hidden=!panel.hidden;if(!panel.hidden)refresh();};
  // R10.69: switch visible Connect panels; don't terminate an active call.
  window.addEventListener('simo-connect:panel-open', event=>{if(event.detail?.panel==='messages')panel.hidden=true;});
  $('simoCallClose').onclick=()=>{panel.hidden=true;};
  $('simoCallSave').onclick=async()=>{try{const d=await api('profile',{handle:$('simoCallHandle').value});myHandle=d.handle;say('Your handle is @'+myHandle);beginMonitoring();}catch(e){say(e.message);}};
  $('simoCallStart').onclick=()=>begin('audio');
  $('simoCallStartVideo').onclick=()=>begin('video');
  $('simoCallMicToggle').onclick=()=>{const track=local?.getAudioTracks()[0];if(!track)return;track.enabled=!track.enabled;$('simoCallMicToggle').textContent=track.enabled?'Mute microphone':'Unmute microphone';};
  $('simoCallCameraToggle').onclick=()=>{const track=local?.getVideoTracks()[0];if(!track)return;track.enabled=!track.enabled;$('simoCallCameraToggle').textContent=track.enabled?'Turn camera off':'Turn camera on';};
  $('simoCallAnswer').onclick=async()=>{await answer();if(pc && window.__simoCallOffer){try{await pc.setRemoteDescription(window.__simoCallOffer);await flushIce();const a=await pc.createAnswer();await pc.setLocalDescription(a);await send('answer',{sdp:pc.localDescription.toJSON()});window.__simoCallOffer=null;}catch(e){say(e.message);}}};
  $('simoCallHangup').onclick=end;
  async function refresh() {try{const d=await api('profile');myHandle=d.handle;$('simoCallHandle').value=myHandle||'';say(myHandle?'Signed in as @'+myHandle:'Choose a unique Simo handle to start.');if(myHandle)beginMonitoring();}catch(e){say(e.message);}}
  // Begin checking incoming calls when an authenticated Simo handle is loaded.
  refresh();
  window.addEventListener('pagehide',()=>{if(current)send('hangup').catch(()=>{});cleanup();});
})();
