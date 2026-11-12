/* SIMO R10.75 — clear stale incoming-call notification after answer/connection; preserves R10.74 labels. */
/* SIMO R10.62 — isolated user-handle WebRTC AUDIO + VIDEO beta. No PSTN/voicemail. */
(() => {
  'use strict';
  if (window.__SIMO_CALLING_BETA__) return;
  window.__SIMO_CALLING_BETA__ = true;
  const $ = id => document.getElementById(id);
  let last = 0, current = '', pc = null, local = null, incoming = null, pendingIce = [];
  let myHandle = '', calling = false, busy = false, poller = null, lastMissedIds = new Set(), missedBoot = false;
  let callMode = 'audio', remoteStream = null;
  let guestMode = false;
  let ringNotice = null;
  const originalTitle=document.title; let incomingTitle=false;
  const api = async (path, body) => {
    const res = await fetch('/api/simo-calling/' + path, {credentials:'same-origin',
      ...(body !== undefined ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
    const obj = await res.json(); if (!res.ok || !obj.ok) throw new Error(obj.error || 'Calling service unavailable'); return obj;
  };
  const contactsApi = async (method='GET', data) => {
    const res=await fetch('/api/simo-connect/contacts', {method, credentials:'same-origin',
      ...(data!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
    const result=await res.json();if(!res.ok||!result.ok)throw Error(result.error||'Contacts unavailable');return result;
  };
  let savedContacts=[];
  // R10.74: display labels only; identity and permissions always use the real account handle.
  let remoteHandle='';
  const cleanHandle = raw => String(raw||'').trim().replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,24);
  function updateVideoIdentity(){
    const localName=$('simoLocalVideoLabel');
    const remoteName=$('simoRemoteVideoLabel');
    if(localName)localName.textContent=myHandle?'You · @'+myHandle:'You';
    if(remoteName){
      const contact=savedContacts.find(c=>cleanHandle(c.handle)===cleanHandle(remoteHandle));
      const nickname=String(contact?.nickname||'').trim();
      remoteName.textContent=nickname?(nickname+' · @'+remoteHandle):(remoteHandle?'@'+remoteHandle:'Other participant');
    }
  }
  function syncVideoTiles(){
    const remoteVideo=$('simoCallRemoteVideo'), localVideo=$('simoCallLocalVideo');
    const remoteTile=$('simoRemoteVideoTile'),localTile=$('simoLocalVideoTile');
    if(remoteTile)remoteTile.hidden=!(remoteVideo&&!remoteVideo.hidden);
    if(localTile)localTile.hidden=!(localVideo&&!localVideo.hidden);
    updateVideoIdentity();
  }
  const say = s => {if ($('simoCallStatus')) $('simoCallStatus').textContent = s;};
  const notice = (message, duration=9000) => {
    const wrap=$('simoCallNotice'); if(!wrap)return;
    wrap.textContent=message;wrap.hidden=false;
    clearTimeout(notice.timer);notice.timer=setTimeout(()=>{wrap.hidden=true;},duration);
  };
  // R10.75: The small incoming-call toast is only relevant while a call rings.
  // Clearing it does not touch missed-call notifications, video, or signaling.
  function hideIncomingToast(){
    const wrap=$('simoCallNotice');
    if(!wrap || wrap.hidden || !/incoming (?:video|audio) call/i.test(wrap.textContent||'')) return;
    clearTimeout(notice.timer);
    wrap.hidden=true;
  }
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
  // R10.70: monitor inbound calls even if this tab is in the background.
  // Previously document.hidden prevented the recipient from seeing a call.
  function beginMonitoring(){if(poller)return;poll();missedCheck();poller=setInterval(()=>{
    if(myHandle){poll();if(!document.hidden)missedCheck();}
  },5000);}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && myHandle){poll();missedCheck();}});

  function cleanup() {
    if (pc) {pc.onicecandidate=null;pc.ontrack=null;pc.close();pc=null;}
    if (local) {local.getTracks().forEach(t=>t.stop());local=null;}
    if ($('simoCallAudio')) $('simoCallAudio').srcObject=null;
    if ($('simoCallRemoteVideo')) {$('simoCallRemoteVideo').srcObject=null;$('simoCallRemoteVideo').hidden=true;}
    if ($('simoCallLocalVideo')) {$('simoCallLocalVideo').srcObject=null;$('simoCallLocalVideo').hidden=true;}
    remoteStream=null;callMode='audio';remoteHandle='';syncVideoTiles();
    if($('simoCallVideoControls'))$('simoCallVideoControls').hidden=true;
    if($('simoCallMicToggle'))$('simoCallMicToggle').textContent='Mute microphone';
    if($('simoCallCameraToggle'))$('simoCallCameraToggle').textContent='Turn camera off';
    current=''; incoming=null; pendingIce=[]; calling=false;window.__simoCallOffer=null;
    hideOutgoing();
    if($('simoCallMini'))$('simoCallMini').hidden=true;
    if(incomingTitle){document.title=originalTitle;incomingTitle=false;}
    hideRing();
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
    syncVideoTiles();
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
      syncVideoTiles();
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
      pc.onconnectionstatechange = () => {if(pc && pc.connectionState==='connected'){say('Connected — '+callMode+' call active');hideIncomingToast();hideRing();hideOutgoing();if(panel.hidden)mini.hidden=false;}
        if(pc && pc.connectionState==='failed') say('Connection failed. A TURN relay may be required.');};
    }
    return pc;
  }
  async function flushIce() {if(!pc?.remoteDescription)return;while(pendingIce.length) await pc.addIceCandidate(pendingIce.shift()).catch(()=>{});}
  async function begin(mode='audio') {
    if(guestMode){say('Sign in or create a Simo account to place calls.');showGuestGate();return;}
    if(calling)return;
    try {
      const handle = String($('simoCallTarget').value||'').trim().replace(/^@/,'');
      if(!handle){say('Enter the recipient handle.');return;}
      calling=true;callMode=mode;remoteHandle=cleanHandle(handle);updateVideoIdentity();
      await mediaConnection(); // ask permission before initiating a call
      const result=await api('start',{handle,mode:callMode}); current=result.call_id;
      $('simoCallHangup').hidden=false; $('simoCallStart').disabled=true;$('simoCallStartVideo').disabled=true;
      const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
      await send('offer',{sdp:pc.localDescription.toJSON()});
      say('Calling @'+handle+' ('+callMode+')…');
      showOutgoing(handle,callMode);
      panel.hidden=true;
    } catch(e){say(e.message);cleanup();}
  }
  async function answer() {
    if(!incoming)return;
    try {
      current=incoming;
      if(incomingTitle){document.title=originalTitle;incomingTitle=false;}
      hideRing();
      hideIncomingToast();
      panel.hidden=false;
      await mediaConnection();
      await send('accept');
      $('simoCallAnswer').hidden=true; $('simoCallHangup').hidden=false;
      say('Connecting…');
    } catch(e){say(e.message);await send('decline').catch(()=>{});cleanup();}
  }
  async function end() {hideRing();await send(incoming?'decline':'hangup').catch(()=>{});cleanup();say('Call ended — returned to standby.');notice('Call ended');await missedCheck();}
  async function eventHandler(ev) {
    if(ev.kind==='incoming') {
      if(current || incoming) {const old=current;current=ev.call_id;await send('decline').catch(()=>{});current=old;return;}
      incoming=ev.call_id; current=ev.call_id;callMode=ev.data.mode==='video'?'video':'audio';remoteHandle=cleanHandle(ev.data.from);updateVideoIdentity();
      // Incoming calls have a separate, compact, accessible alert. Preserve the workspace.
      panel.hidden=true; // Incoming alert stays compact; never cover the work area.
      showRing(ev.data.from, callMode);
      document.title=(callMode==='video'?'📹 Incoming video call':'☎ Incoming audio call')+' — Simo';incomingTitle=true;
      if(document.hidden && 'Notification' in window && Notification.permission==='granted'){
        try{const n=new Notification('Simo '+(callMode==='video'?'video':'audio')+' call',{body:'Incoming from @'+String(ev.data.from||'unknown')+'. Open Simo to answer.',tag:'simo-incoming-call'});n.onclick=()=>{window.focus();panel.hidden=false;n.close();};}catch(_){ }
      }
      notice((callMode==='video'?'📹 Incoming video call':'☎ Incoming audio call')+' from @'+String(ev.data.from||'unknown')+' — open Simo Calling to answer.',15000);
      $('simoCallAnswer').textContent=callMode==='video'?'📹 Answer video call':'Answer audio call';
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
      if(ev.kind==='accept' && pc && !incoming){say('Answered — connecting '+callMode+'…');hideIncomingToast();hideOutgoing();if(panel.hidden)mini.hidden=false;}
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
  const css=`#simoCallingBtn{position:fixed;right:20px;bottom:140px;z-index:9000;background:#075b78;color:white;border:1px solid #73d9fa;border-radius:99px;padding:11px 17px;font-weight:750;cursor:pointer;box-shadow:0 6px 30px #0008}#simoCallingPanel{position:fixed;right:14px;bottom:196px;z-index:9001;width:min(365px,calc(100vw - 28px));padding:18px;background:#081a2e;border:1px solid #4789ad;border-radius:16px;box-shadow:0 14px 50px #000b;color:#edf7ff;font-family:system-ui,sans-serif}#simoCallingPanel[hidden],#simoCallingPanel [hidden]{display:none!important}#simoCallingPanel input{box-sizing:border-box;width:100%;margin:5px 0 9px;padding:10px;color:#fff;background:#102f4b;border:1px solid #426b8a;border-radius:9px}#simoCallingPanel button{cursor:pointer;background:#174f74;color:#fff;border:1px solid #5e91b6;border-radius:9px;padding:9px;margin:3px}#simoCallStatus{font-size:12px;line-height:1.4;min-height:20px;color:#c6dfeb}#simoCallingPanel small{color:#b5ccd9}#simoCallClose{float:right}#simoCallVideoGrid{display:grid;gap:8px;max-height:50vh;overflow:auto}#simoCallVideoGrid video{display:block;max-width:100%;width:100%;max-height:230px;object-fit:contain;background:#01070b;border-radius:10px}#simoCallVideoGrid video[hidden]{display:none!important}#simoCallVideoGrid .simo-video-tile{position:relative;min-width:0}#simoCallVideoGrid .simo-video-tile[hidden]{display:none!important}#simoCallVideoGrid .simo-video-id{position:absolute;left:8px;bottom:8px;z-index:1;max-width:calc(100% - 16px);box-sizing:border-box;padding:4px 7px;border-radius:7px;background:rgba(1,12,24,.76);border:1px solid rgba(196,226,248,.27);color:#fff;font:600 11px/1.3 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;box-shadow:0 2px 8px #0005}#simoCallingPanel{max-height:min(80vh,700px);overflow-y:auto}`;
  const extraCss=`
    #simoIncomingRing{position:fixed;top:clamp(76px,12vh,130px);right:18px;bottom:auto;z-index:11000;
      width:min(365px,calc(100vw - 36px));box-sizing:border-box;padding:16px;border-radius:16px;
      border:3px solid #5dff9b;background:#063e2b;color:#fff;box-shadow:0 0 0 5px rgba(50,250,130,.18),0 16px 45px #000b;
      font:600 15px/1.5 system-ui,sans-serif;animation:simoRingPulse 1.45s ease-in-out infinite;}
    #simoIncomingRing[hidden]{display:none!important}
    #simoIncomingRing strong{display:block;font-size:19px;line-height:1.2;margin:3px 0}
    #simoIncomingRing .simo-ring-actions{display:flex;gap:10px;margin-top:12px}
    #simoIncomingRing button{flex:1;border:1px solid #bdfadb;border-radius:11px;padding:12px 8px;
      font-weight:800;cursor:pointer;background:#19a35d;color:#fff}
    #simoIncomingRing button.simo-decline{background:#7b2536;border-color:#e6a2ae}
    #simoCallingBtn.simo-call-ringing{background:#075e33;border:2px solid #73ffc0;animation:simoRingPulse 1.45s infinite}
    #simoOutgoingRing{position:fixed;top:clamp(76px,12vh,130px);right:18px;z-index:11000;
      width:min(365px,calc(100vw - 36px));box-sizing:border-box;padding:16px;
      background:#082f62;border:3px solid #65caff;border-radius:16px;color:white;
      font:600 15px/1.5 system-ui,sans-serif;animation:simoOutgoingPulse 1.5s infinite;
      box-shadow:0 16px 40px #000a}
    #simoOutgoingRing[hidden],#simoCallMini[hidden]{display:none!important}
    #simoOutgoingRing strong{font-size:19px;display:block}
    #simoOutgoingRing button{background:#853243;color:white;border:1px solid #efafb9;border-radius:10px;padding:10px 16px;font-weight:800;cursor:pointer;margin-top:10px}
    #simoCallMini{position:fixed;right:18px;bottom:195px;z-index:10500;background:#103f5a;
      border:2px solid #6ac8ed;color:white;border-radius:12px;padding:9px;font:700 13px system-ui}
    #simoCallMini button{border-radius:7px;padding:6px;border:1px solid #7eb4d8;background:#194f70;color:#fff;cursor:pointer}
    #simoCallingPanel{max-height:min(65vh,600px)!important;bottom:185px!important}
    #simoCallContacts{margin:10px 0;padding:10px;border:1px solid #426b8a;border-radius:10px}
    #simoCallContacts select{width:100%;padding:8px;background:#102f4b;color:#fff;border:1px solid #5e91b6;border-radius:8px}
    #simoCallContacts .contact-row{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:5px}
    #simoCallContacts .contact-row input{min-width:0;flex:1 1 100px;width:auto!important;margin:0!important}
    #simoCallContacts button{margin:0!important}
    @keyframes simoOutgoingPulse{0%,100%{border-color:#66caff;box-shadow:0 0 0 3px #51a7fc1a,0 14px 45px #0008}50%{border-color:#c5edff;box-shadow:0 0 0 10px #51a7fc43,0 14px 45px #0008}}
    #simoCallingBtn.simo-call-outgoing{background:#0b4c91;border:2px solid #84daff;animation:simoOutgoingPulse 1.5s infinite}
    @media(prefers-reduced-motion:reduce){#simoOutgoingRing,#simoCallingBtn.simo-call-outgoing{animation:none!important}}
    #simoCallGuestGate{border:1px solid #7bc2f2;border-radius:10px;background:#12324a;padding:12px;margin:10px 0;color:#fff}
    #simoCallGuestGate[hidden]{display:none!important}
    #simoCallGuestGate a{color:#adf0ff;font-weight:700;text-decoration:underline}
    @keyframes simoRingPulse{0%,100%{box-shadow:0 0 0 4px rgba(68,240,142,.12),0 12px 40px #0009}50%{box-shadow:0 0 0 10px rgba(68,240,142,.36),0 12px 40px #0009}}
    @media(prefers-reduced-motion:reduce){#simoIncomingRing,#simoCallingBtn.simo-call-ringing{animation:none!important}}
    @media(max-width:600px){#simoIncomingRing{top:72px;right:10px;width:calc(100vw - 20px);padding:12px}}
  `;
  const style=document.createElement('style');style.textContent=css+extraCss;document.head.appendChild(style);
  const btn=document.createElement('button');btn.id='simoCallingBtn';btn.type='button';btn.textContent='☎ Simo Audio / Video';
  const panel=document.createElement('section');panel.id='simoCallingPanel';panel.hidden=true;
  panel.innerHTML=`<button id="simoCallClose" type="button" aria-label="Minimize calling panel">— Minimize</button><h3 style="margin:0 0 10px">☎ Simo Calling<span id="simoCallMissedCount"></span></h3><small>One-to-one browser voice/video between signed-in Simo users. No telephone numbers or voicemail yet.</small><p id="simoCallStatus" role="status">Sign in to use calling.</p><label>Your unique handle<input id="simoCallHandle" maxlength="24" placeholder="e.g. simo_friend" autocomplete="off"></label><button type="button" id="simoCallSave">Save handle</button><hr style="border:0;border-top:1px solid #35536a;margin:12px 0"><label>Call another handle<input id="simoCallTarget" maxlength="25" placeholder="@friend_handle" autocomplete="off"></label><button type="button" id="simoCallStart">Audio call</button><button type="button" id="simoCallStartVideo">📹 Start video call</button><button type="button" id="simoCallAnswer" hidden>Answer</button><button type="button" id="simoCallHangup" hidden>Decline / Hang up</button><div id="simoCallVideoControls" hidden><button type="button" id="simoCallMicToggle">Mute microphone</button><button type="button" id="simoCallCameraToggle" hidden>Turn camera off</button></div><div id="simoCallVideoGrid"><div class="simo-video-tile" id="simoRemoteVideoTile" hidden><video id="simoCallRemoteVideo" autoplay playsinline hidden aria-label="Other participant video"></video><span class="simo-video-id" id="simoRemoteVideoLabel">Other participant</span></div><div class="simo-video-tile" id="simoLocalVideoTile" hidden><video id="simoCallLocalVideo" autoplay muted playsinline hidden aria-label="Your camera preview"></video><span class="simo-video-id" id="simoLocalVideoLabel">You</span></div></div><div id="simoCallMissedList" aria-label="Missed calls"></div><audio id="simoCallAudio" autoplay playsinline></audio>`;
  const contactsBox=document.createElement('div');contactsBox.id='simoCallContacts';contactsBox.hidden=true;
  contactsBox.innerHTML='<label>Saved contacts<select id="simoContactsSelect"><option value="">Choose a contact…</option></select></label><div class="contact-row"><input id="simoContactNickname" maxlength="48" placeholder="Nickname (e.g. Mom)"><button id="simoContactSave" type="button">Save contact</button><button id="simoContactRemove" type="button">Remove</button></div><label style="display:block;margin-top:6px"><input id="simoContactFavorite" type="checkbox" style="width:auto"> Favorite</label>';
  panel.insertBefore(contactsBox, panel.querySelector('#simoCallTarget').closest('label'));
  const outgoing=document.createElement('aside');outgoing.id='simoOutgoingRing';outgoing.hidden=true;
  outgoing.setAttribute('role','status');outgoing.setAttribute('aria-live','polite');
  outgoing.innerHTML='<strong id="simoOutgoingTitle">Calling…</strong><div id="simoOutgoingTo"></div><div>Ringing — waiting for an answer</div><button id="simoOutgoingCancel" type="button">Cancel call</button>';
  const mini=document.createElement('div');mini.id='simoCallMini';mini.hidden=true;
  mini.innerHTML='<span>☎ Simo call active</span> <button type="button" id="simoMiniOpen">Open call</button> <button type="button" id="simoMiniHangup">Hang up</button>';
  const banner=document.createElement('div');banner.id='simoCallNotice';banner.hidden=true;banner.setAttribute('role','status');
  banner.style.cssText='position:fixed;right:14px;top:80px;z-index:9500;max-width:min(390px,calc(100vw - 28px));border:1px solid #71c9ed;border-radius:12px;padding:12px 15px;background:#103b55;color:#fff;font:600 13px system-ui;box-shadow:0 8px 32px #0008';
  ringNotice=document.createElement('aside');ringNotice.id='simoIncomingRing';ringNotice.hidden=true;
  ringNotice.setAttribute('role','alertdialog');ringNotice.setAttribute('aria-label','Incoming Simo call');
  ringNotice.innerHTML='<div>🟢 SIMO CONNECT</div><strong id="simoRingTitle">Incoming call</strong><div id="simoRingFrom"></div><div class="simo-ring-actions"><button type="button" id="simoRingAnswer">Answer</button><button type="button" id="simoRingDecline" class="simo-decline">Decline</button></div>';
  document.body.append(btn,panel,banner,ringNotice,outgoing,mini);
  $('simoRingAnswer').onclick=()=>{$('simoCallAnswer').click();};
  $('simoRingDecline').onclick=()=>{$('simoCallHangup').click();};
  function showRing(from, mode){
    const who=String(from||'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,24);
    $('simoRingTitle').textContent=mode==='video'?'📹 Incoming video call':'☎ Incoming audio call';
    $('simoRingFrom').textContent='@'+who+' is calling you';
    $('simoRingAnswer').textContent=mode==='video'?'Answer video':'Answer call';
    ringNotice.hidden=false;btn.classList.add('simo-call-ringing');
  }
  function hideRing(){if(ringNotice)ringNotice.hidden=true;if(btn)btn.classList.remove('simo-call-ringing');}
  function showOutgoing(handle,mode){
    $('simoOutgoingTitle').textContent=mode==='video'?'📹 Outgoing video call':'☎ Outgoing audio call';
    $('simoOutgoingTo').textContent='Calling @'+handle+'…';outgoing.hidden=false;
    btn.classList.add('simo-call-outgoing');
  }
  function hideOutgoing(){outgoing.hidden=true;btn.classList.remove('simo-call-outgoing');}
  $('simoOutgoingCancel').onclick=()=>end();
  $('simoMiniOpen').onclick=()=>{panel.hidden=false;mini.hidden=true;};
  $('simoMiniHangup').onclick=()=>end();
  async function loadContacts(){
    try {const data=await contactsApi();savedContacts=data.contacts||[];
      const select=$('simoContactsSelect');select.replaceChildren(new Option('Choose a contact…',''));
      for(const c of savedContacts)select.add(new Option((c.favorite?'★ ':'')+c.nickname+' (@'+c.handle+')',c.handle));
      updateVideoIdentity();
    }catch(e){say(e.message);}
  }
  $('simoContactsSelect').onchange=()=>{
    const c=savedContacts.find(x=>x.handle===$('simoContactsSelect').value);if(!c)return;
    $('simoCallTarget').value=c.handle;$('simoContactNickname').value=c.nickname;
    $('simoContactFavorite').checked=!!c.favorite;updateVideoIdentity();
  };
  $('simoContactSave').onclick=async()=>{
    const handle=$('simoCallTarget').value.trim().replace(/^@/,'');
    if(!handle){say('Enter a handle to save as a contact.');return;}
    try{await contactsApi('POST',{handle,nickname:$('simoContactNickname').value.trim(),favorite:$('simoContactFavorite').checked});
      await loadContacts();$('simoContactsSelect').value=handle;say('Contact saved for your account.');}catch(e){say(e.message);}
  };
  $('simoContactRemove').onclick=async()=>{
    const handle=$('simoContactsSelect').value;if(!handle)return;
    if(!confirm('Remove this contact from your Simo address book?'))return;
    try{await contactsApi('DELETE',{handle});await loadContacts();$('simoContactNickname').value='';say('Contact removed.');}catch(e){say(e.message);}
  };
  const guestGate=document.createElement('div');guestGate.id='simoCallGuestGate';guestGate.hidden=true;
  guestGate.innerHTML='<strong>Sign in to use Simo Connect</strong><p>Voice and video calls require a registered Simo account.</p><p>Use the Sign in or Easy Signup option in Simo.</p>';
  panel.insertBefore(guestGate,panel.querySelector('label'));
  function showGuestGate(){guestMode=true;guestGate.hidden=false;
    ['simoCallSave','simoCallStart','simoCallStartVideo'].forEach(id=>{$(id).disabled=true;});
    contactsBox.hidden=true;
    say('Sign in or create a free Simo account to use Simo Connect.');
  }
  function clearGuestGate(){guestMode=false;guestGate.hidden=true;contactsBox.hidden=false;
    ['simoCallSave','simoCallStart','simoCallStartVideo'].forEach(id=>{$(id).disabled=false;});
  }
  btn.onclick=()=>{const opening=panel.hidden;if(opening)window.dispatchEvent(new CustomEvent('simo-connect:panel-open',{detail:{panel:'calling'}}));panel.hidden=!panel.hidden;if(!panel.hidden){mini.hidden=true;refresh();}};
  // R10.69: switch visible Connect panels; don't terminate an active call.
  window.addEventListener('simo-connect:panel-open', event=>{if(event.detail?.panel==='messages'){panel.hidden=true;if(current&&!incoming&&outgoing.hidden)mini.hidden=false;}});
  $('simoCallClose').onclick=()=>{panel.hidden=true;if(current&&!incoming&&outgoing.hidden)mini.hidden=false;};
  $('simoCallSave').onclick=async()=>{if(guestMode){showGuestGate();return;}try{const d=await api('profile',{handle:$('simoCallHandle').value});myHandle=d.handle;updateVideoIdentity();say('Your handle is @'+myHandle);beginMonitoring();}catch(e){say(e.message);}};
  $('simoCallStart').onclick=()=>begin('audio');
  $('simoCallStartVideo').onclick=()=>begin('video');
  $('simoCallMicToggle').onclick=()=>{const track=local?.getAudioTracks()[0];if(!track)return;track.enabled=!track.enabled;$('simoCallMicToggle').textContent=track.enabled?'Mute microphone':'Unmute microphone';};
  $('simoCallCameraToggle').onclick=()=>{const track=local?.getVideoTracks()[0];if(!track)return;track.enabled=!track.enabled;$('simoCallCameraToggle').textContent=track.enabled?'Turn camera off':'Turn camera on';};
  $('simoCallAnswer').onclick=async()=>{await answer();if(pc && window.__simoCallOffer){try{await pc.setRemoteDescription(window.__simoCallOffer);await flushIce();const a=await pc.createAnswer();await pc.setLocalDescription(a);await send('answer',{sdp:pc.localDescription.toJSON()});window.__simoCallOffer=null;}catch(e){say(e.message);}}};
  $('simoCallHangup').onclick=end;
  async function refresh() {try{const d=await api('profile');clearGuestGate();myHandle=d.handle;updateVideoIdentity();$('simoCallHandle').value=myHandle||'';say(myHandle?'Signed in as @'+myHandle:'Choose a unique Simo handle to start.');if(myHandle){beginMonitoring();loadContacts();}}catch(e){if(/sign in|account|unauthoriz/i.test(e.message))showGuestGate();else say(e.message);}}
  // Begin checking incoming calls when an authenticated Simo handle is loaded.
  refresh();
  window.addEventListener('pagehide',()=>{if(current)send('hangup').catch(()=>{});cleanup();});
})();
