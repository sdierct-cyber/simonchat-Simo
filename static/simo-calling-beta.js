/* SIMO R10.75 — clear stale incoming-call notification after answer/connection; preserves R10.74 labels. */
/* SIMO R10.62 — isolated user-handle WebRTC AUDIO + VIDEO beta. No PSTN/voicemail. */
(() => {
  'use strict';
  if (window.__SIMO_CALLING_BETA__) return;
  window.__SIMO_CALLING_BETA__ = true;
  const $ = id => document.getElementById(id);
  const embeddedConnect = document.body.hasAttribute('data-connect-view');
  const mobile = window.matchMedia('(max-width: 700px), (max-height: 500px) and (pointer: coarse)');
  let last = 0, current = '', pc = null, local = null, incoming = null, pendingIce = [];
  let myHandle = '', calling = false, busy = false, poller = null, lastMissedIds = new Set(), missedBoot = false;
  let callMode = 'audio', preferredMode = 'audio', answering = false, callAccepted = false, remoteStream = null;
  let guestMode = false;
  let callAttempt = 0;
  let outgoingAccepted = false;
  let pendingOffer = null;
  let callPresentation = '';
  let ringNotice = null;
  let browserRingNotice = null;
  let ringAudio = null;
  let ringTimer = null;
  let ringGain = null;

  function enableRingAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      ringAudio ||= new Audio();
      if (ringAudio.state === 'suspended') void ringAudio.resume().catch(() => {});
    } catch {}
  }
  if (!embeddedConnect) {
    document.addEventListener('pointerdown', enableRingAudio, {passive: true, once: true});
    document.addEventListener('keydown', enableRingAudio, {once: true});
  }

  function playRing() {
    if (ringAudio?.state !== 'running') return;
    ringGain = ringAudio.createGain();
    ringGain.gain.value = 0.12;
    ringGain.connect(ringAudio.destination);
    function chime() {
      const start = ringAudio.currentTime;
      for (const [frequency, offset] of [[660, 0], [880, 0.22]]) {
        const tone = ringAudio.createOscillator();
        const envelope = ringAudio.createGain();
        const time = start + offset;
        tone.frequency.value = frequency;
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(0.8, time + 0.025);
        envelope.gain.linearRampToValueAtTime(0, time + 0.18);
        tone.connect(envelope);
        envelope.connect(ringGain);
        tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
        tone.start(time);
        tone.stop(time + 0.18);
      }
    }
    chime();
    ringTimer = setInterval(chime, 2400);
  }

  function stopRingAudio() {
    clearInterval(ringTimer);
    ringTimer = null;
    ringGain?.disconnect();
    ringGain = null;
  }

  function mediaAccessMessage(error) {
    const devices = callMode === 'video' ? 'microphone and camera' : 'microphone';
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Chrome blocked the ' + devices + '. Open the Simo website in a tab, allow access in site settings, then retry.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'Chrome could not find the ' + devices + '. Check the selected devices, then retry.';
      case 'NotReadableError':
      case 'AbortError':
        return 'Chrome could not open the ' + devices + '. Close any app using them, then retry.';
      default:
        return '';
    }
  }
  const originalTitle=document.title; let incomingTitle=false;
  const api = async (path, body, keepalive = false) => {
    const res = await fetch('/api/simo-calling/' + path, {credentials:'same-origin', keepalive,
      ...(body !== undefined ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
    const obj = await res.json();
    if (!res.ok || !obj.ok) {
      const error = new Error(obj.error || 'Calling service unavailable');
      error.status = res.status;
      throw error;
    }
    return obj;
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
    callAttempt++;
    if (pc) {pc.onicecandidate=null;pc.ontrack=null;pc.onconnectionstatechange=null;pc.close();pc=null;}
    if (local) {local.getTracks().forEach(t=>t.stop());local=null;}
    if ($('simoCallAudio')) $('simoCallAudio').srcObject=null;
    if ($('simoCallRemoteVideo')) {$('simoCallRemoteVideo').srcObject=null;$('simoCallRemoteVideo').hidden=true;}
    if ($('simoCallLocalVideo')) {$('simoCallLocalVideo').srcObject=null;$('simoCallLocalVideo').hidden=true;}
    remoteStream=null;callMode='audio';remoteHandle='';syncVideoTiles();
    if($('simoCallVideoControls'))$('simoCallVideoControls').hidden=true;
    if($('simoCallMicToggle'))$('simoCallMicToggle').textContent='Mute microphone';
    if($('simoCallCameraToggle'))$('simoCallCameraToggle').textContent='Turn camera off';
    current=''; incoming=null; pendingIce=[]; calling=false; answering=false;callAccepted=false;outgoingAccepted=false;pendingOffer=null;
    hideOutgoing();
    updateCallView();
    if($('simoCallMini'))$('simoCallMini').hidden=true;
    if(incomingTitle){document.title=originalTitle;incomingTitle=false;}
    hideRing();
    $('simoCallAnswer').hidden=true;
    $('simoCallHangup').hidden=true;
    $('simoCallHangup').textContent='Decline / Hang up';
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
  async function mediaConnection(attempt) {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Use HTTPS or localhost with a WebRTC-compatible browser.');
    if (!local) {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true, video:callMode==='video'?{facingMode:'user'}:false});
      if (attempt !== callAttempt) {
        stream.getTracks().forEach(track => track.stop());
        return null;
      }
      local = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', syncCallStatus);
    }
    showLocalPreview();
    if($('simoCallVideoControls')) $('simoCallVideoControls').hidden=false;
    if($('simoCallCameraToggle')) $('simoCallCameraToggle').hidden=callMode!=='video';
    if (!pc) {
      pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
      local.getTracks().forEach(track => pc.addTrack(track,local));
      pc.onicecandidate = event => {if(event.candidate) send('ice',{candidate:event.candidate.toJSON()}).catch(()=>{});};
      pc.ontrack = renderRemoteTrack;
      const peer = pc;
      peer.onconnectionstatechange = () => {
        if (pc !== peer) return;
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
          const id = current;
          cleanup();
          if (id) void api('signal', {call_id:id, kind:'hangup', data:{}}).catch(()=>{});
          say('Call connection lost — returned to standby.');
          notice('Call connection lost');
          return;
        }
        if (peer.connectionState === 'connected') {
          say('Connected — '+callMode+' call active');
          hideRing();
          hideOutgoing();
        }
        syncCallStatus();
      };
    }
    $('simoCallHangup').hidden=false;
    $('simoCallHangup').textContent=answering ? 'Hang up' : 'Cancel call';
    syncCallStatus();
    return pc;
  }
  async function flushIce() {if(!pc?.remoteDescription)return;while(pendingIce.length) await pc.addIceCandidate(pendingIce.shift()).catch(()=>{});}
  let targetContactId = '';
  async function begin(mode='audio') {
    if(guestMode){say('Sign in or create a Simo account to place calls.');showGuestGate();return;}
    if (!myHandle) {
      say('Save your Simo handle before calling.');
      $('simoCallHandle').focus();
      return;
    }
    if(calling || current)return;
    const attempt = ++callAttempt;
    try {
      let handle = String($('simoCallTarget').value||'').trim().replace(/^@/,'');
      const contactId = targetContactId;
      if(!handle){say('Enter the recipient handle.');return;}
      calling=true;callMode=mode;preferredMode=mode;remoteHandle=cleanHandle(handle);updateVideoIdentity();
      updateCallView();
      if(mobile.matches)say('Requesting '+(mode==='video'?'camera and microphone':'microphone')+' access…');
      const peer = await mediaConnection(attempt);
      if (!peer || attempt !== callAttempt) return;
      const result=await api('start', {handle, mode:callMode, ...(contactId ? {contact_id:contactId} : {})});
      if (attempt !== callAttempt) {
        await api('signal', {call_id:result.call_id, kind:'hangup', data:{}}).catch(()=>{});
        return;
      }
      handle = result.to || handle;
      remoteHandle = cleanHandle(handle);
      updateVideoIdentity();
      current=result.call_id;
      $('simoCallHangup').textContent=mobile.matches?'Cancel call':'Decline / Hang up';
      $('simoCallStart').disabled=true;$('simoCallStartVideo').disabled=true;
      const offer=await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (attempt !== callAttempt) return;
      await send('offer',{sdp:peer.localDescription.toJSON()});
      if (attempt !== callAttempt || peer.connectionState === 'connected' || outgoingAccepted) return;
      $('simoCallHangup').hidden=false;
      say('Calling @'+handle+' ('+callMode+')…');
      showOutgoing(handle,callMode);
      if(!mobile.matches)hideCallPanel();
    } catch(e){if (attempt === callAttempt) {const message = mediaAccessMessage(e) || e.message;
      say(message);notice(message, 18000);cleanup();}}
  }
  async function answer() {
    if (embeddedConnect || !incoming || answering || callAccepted) return;
    const attempt = ++callAttempt;
    answering=true;
    syncCallStatus();
    stopRingAudio();
    const ringAnswer = $('simoRingAnswer');
    const answerLabel = ringAnswer.textContent;
    ringAnswer.disabled = true;
    ringAnswer.textContent = 'Answering…';
    $('simoRingError').textContent = '';
    try {
      current=incoming;
      if(mobile.matches)showCallPanel(callMode);
      else panel.hidden=false;
      panel.scrollTop = 0;
      $('simoCallAnswer').hidden=true;
      $('simoCallHangup').hidden=false;
      $('simoCallHangup').textContent='Hang up';
      const peer = await mediaConnection(attempt);
      if (!peer || attempt !== callAttempt) return;
      await send('accept');
      if (attempt !== callAttempt) return;
      callAccepted=true;
      if(incomingTitle){document.title=originalTitle;incomingTitle=false;}
      hideRing();
      updateCallView();
      await answerOffer();
      if (attempt !== callAttempt) return;
      $('simoCallAnswer').hidden=true; $('simoCallHangup').hidden=false;
      if(mobile.matches)$('simoCallHangup').textContent='Hang up';
      if (peer.connectionState !== 'connected') say('Connecting…');
    } catch(e){
      if (attempt === callAttempt) {
        const mediaMessage = !callAccepted && !local ? mediaAccessMessage(e) : '';
        if (mediaMessage) {
          $('simoRingError').textContent = mediaMessage;
          $('simoCallAnswer').hidden = false;
          say(mediaMessage);
          return;
        }
        const id = current;
        const kind = callAccepted ? 'hangup' : 'decline';
        cleanup();
        const message = 'Could not answer the call. ' + e.message;
        say(message);
        notice(message, 18000);
        if (id && (kind === 'hangup' || e.status !== 409)) {
          await api('signal', {call_id:id, kind, data:{}}).catch(()=>{});
        }
      }
    } finally {
      if (attempt === callAttempt) {
        ringAnswer.disabled = false;
        ringAnswer.textContent = answerLabel;
        answering=false;
        updateCallView();
      }
    }
  }
  async function answerOffer() {
    if (!callAccepted || !pc || !pendingOffer) return;
    const peer = pc;
    const offer = pendingOffer;
    pendingOffer = null;
    await peer.setRemoteDescription(offer);
    if (peer !== pc) return;
    await flushIce();
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    if (peer === pc) await send('answer', {sdp:peer.localDescription.toJSON()});
  }
  async function end() {
    if ((embeddedConnect && incoming && !callAccepted) || (!current && !calling && !answering)) return;
    const id = current;
    const kind = incoming && !callAccepted ? 'decline' : 'hangup';
    cleanup();
    say('Call ended — returned to standby.');
    if (id) await api('signal', {call_id:id, kind, data:{}}).catch(()=>{});
    await missedCheck();
  }
  async function eventHandler(ev) {
    if(ev.kind==='incoming') {
      if (current || incoming || calling) {
        if (!embeddedConnect && ev.call_id !== current) {
          await api('signal', {call_id:ev.call_id, kind:'decline', data:{}}).catch(()=>{});
        }
        return;
      }
      incoming=ev.call_id; current=ev.call_id;callMode=ev.data.mode==='video'?'video':'audio';remoteHandle=cleanHandle(ev.data.from);updateVideoIdentity();
      // Incoming calls have a separate, compact, accessible alert. Preserve the workspace.
      if(!mobile.matches)panel.hidden=true;
      updateCallView();
      $('simoCallStart').disabled = true;
      $('simoCallStartVideo').disabled = true;
      if (embeddedConnect) return;
      showRing(ev.data.from, callMode);
      document.title=(callMode==='video'?'📹 Incoming video call':'☎ Incoming audio call')+' — Simo';incomingTitle=true;
      if(document.hidden && 'Notification' in window && Notification.permission==='granted'){
        try {
          browserRingNotice = new Notification('Simo ' + (callMode === 'video' ? 'video' : 'voice') + ' call', {
            body:'Incoming from @' + remoteHandle + '. Open Simo to answer.',
            tag:'simo-incoming-call'
          });
          browserRingNotice.onclick = () => { window.focus(); showCallPanel(callMode); };
        } catch {}
      }
      stopRingAudio();
      playRing();
      $('simoCallAnswer').textContent=callMode==='video'?'📹 Answer video call':'Answer audio call';
      $('simoCallAnswer').hidden=false;$('simoCallHangup').hidden=false;
      say('Incoming ' + callMode + ' call from @' + remoteHandle);
      return;
    }
    if(ev.call_id!==current)return;
    try {
      if (ev.kind === 'offer' && incoming) {
        pendingOffer = ev.data.sdp;
        await answerOffer();
      }
      if(ev.kind==='accept' && pc && !incoming){
        outgoingAccepted=true;
        $('simoCallHangup').textContent='Hang up';
        if (pc.connectionState !== 'connected') say('Answered — connecting '+callMode+'…');
        hideOutgoing();
        syncCallStatus();
      }
      if(ev.kind==='answer' && pc) {await pc.setRemoteDescription(ev.data.sdp);await flushIce();}
      if(ev.kind==='ice' && ev.data.candidate) {if(pc?.remoteDescription) await pc.addIceCandidate(ev.data.candidate);else pendingIce.push(ev.data.candidate);}
      if (ev.kind === 'decline' || ev.kind === 'hangup') {
        cleanup();
        say(ev.kind === 'decline'
          ? 'Call declined — returned to standby.'
          : 'Call ended by other participant — returned to standby.');
      }
    } catch(e){say('Call signaling error: '+e.message);}
  }
  async function poll() {
    if(busy)return;busy=true;
    const watch = incoming && !answering && !callAccepted ? incoming : '';
    try {
      const result = await api('poll?after=' + last + (watch ? '&watch=' + encodeURIComponent(watch) : ''));
      if (watch && watch === incoming && !answering && !callAccepted && result.watch_state && result.watch_state !== 'ringing') {
        cleanup();
        if (!embeddedConnect) {
          say(result.watch_state === 'active' ? 'Call answered in another Simo window.' : 'Call ended.');
        }
      }
      for (const event of result.events) {
        last = Math.max(last, event.id);
        await eventHandler(event);
      }
      last = Math.max(last, result.cursor || 0);
    } catch (error) {
      if (error.status === 401 && current) cleanup();
      say(error.message);
    } finally { busy = false; }
  }
  const css=`#simoCallingBtn{position:fixed;right:20px;bottom:140px;z-index:9000;background:#075b78;color:white;border:1px solid #73d9fa;border-radius:99px;padding:11px 17px;font-weight:750;cursor:pointer;box-shadow:0 6px 30px #0008}#simoCallingPanel{position:fixed;right:14px;bottom:196px;z-index:9001;width:min(365px,calc(100vw - 28px));padding:18px;background:#081a2e;border:1px solid #4789ad;border-radius:16px;box-shadow:0 14px 50px #000b;color:#edf7ff;font-family:system-ui,sans-serif}#simoCallingPanel[hidden],#simoCallingPanel [hidden]{display:none!important}#simoCallingPanel input{box-sizing:border-box;width:100%;margin:5px 0 9px;padding:10px;color:#fff;background:#102f4b;border:1px solid #426b8a;border-radius:9px}#simoCallingPanel button{cursor:pointer;background:#174f74;color:#fff;border:1px solid #5e91b6;border-radius:9px;padding:9px;margin:3px}#simoCallStatus{font-size:12px;line-height:1.4;min-height:20px;color:#c6dfeb}#simoCallingPanel small{color:#b5ccd9}#simoCallClose{float:right}#simoCallVideoGrid{display:grid;gap:8px;max-height:50vh;overflow:auto}#simoCallVideoGrid video{display:block;max-width:100%;width:100%;max-height:230px;object-fit:contain;background:#01070b;border-radius:10px}#simoCallVideoGrid video[hidden]{display:none!important}#simoCallVideoGrid .simo-video-tile{position:relative;min-width:0}#simoCallVideoGrid .simo-video-tile[hidden]{display:none!important}#simoCallVideoGrid .simo-video-id{position:absolute;left:8px;bottom:8px;z-index:1;max-width:calc(100% - 16px);box-sizing:border-box;padding:4px 7px;border-radius:7px;background:rgba(1,12,24,.76);border:1px solid rgba(196,226,248,.27);color:#fff;font:600 11px/1.3 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;box-shadow:0 2px 8px #0005}#simoCallingPanel{max-height:min(80vh,700px);overflow-y:auto}`;
  const extraCss=`
    #simoIncomingRing{position:fixed;top:clamp(76px,12vh,130px);right:18px;bottom:auto;z-index:11000;
      width:min(365px,calc(100vw - 36px));box-sizing:border-box;padding:16px;border-radius:16px;
      border:3px solid #5dff9b;background:#063e2b;color:#fff;box-shadow:0 0 0 5px rgba(50,250,130,.18),0 16px 45px #000b;
      font:600 15px/1.5 system-ui,sans-serif;animation:simoRingPulse 1.45s ease-in-out infinite;}
    #simoIncomingRing[hidden]{display:none!important}
    body:has(#simoIncomingRing:not([hidden]), #simoOutgoingRing:not([hidden])) #simoCallNotice{display:none}
    #simoIncomingRing strong{display:block;font-size:19px;line-height:1.2;margin:3px 0}
    #simoRingError:not(:empty){margin-top:8px;color:#fff0be}
    #simoIncomingRing button:disabled{opacity:.7;cursor:wait}
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
    #simoCallMini{max-width:calc(100vw - 36px);box-sizing:border-box}
    #simoConnectToolbarR1068 > #simoCallMini {
      position: static; display: flex; flex: 0 1 auto; flex-wrap: wrap;
      align-items: center; gap: 5px 8px; max-width: 100%; padding: 5px 8px;
      border-width: 1px; box-shadow: none; animation: none;
    }
    #simoConnectToolbarR1068 > #simoCallMini[data-call-state="active"] {
      animation: simoToolbarCallPulse 1.6s ease-in-out infinite;
    }
    @keyframes simoToolbarCallPulse {
      0%,100% { border-color: #82ffc0; }
      50% { border-color: #398f68; }
    }
    @media (prefers-reduced-motion:reduce) {
      #simoConnectToolbarR1068 > #simoCallMini[data-call-state="active"] {animation:none}
    }
    body #simoConnectToolbarR1068.simo-show-call-strip > #simoCallingBtn {display:none}
    #simoCallingPanel[data-active="true"] .simo-call-description,
    #simoCallingPanel[data-active="true"] #simoCallMissedList {display:none}
    body.simo-extension-call-banner #simoCallLiveStatus {display:none}
    #simoCallingPanel .simo-call-actions,
    #simoCallVideoControls {display:flex;flex-wrap:wrap;gap:6px}
    #simoCallingPanel .simo-call-actions button {margin:0}
    #simoCallingPanel .simo-call-start-buttons {display:flex;flex-wrap:wrap;gap:6px}
    #simoCallingPanel .simo-call-start-buttons button {flex:1 1 110px;margin:0}
    #simoCallMiniStatus,#simoCallLiveStatus{display:block}
    #simoCallLiveStatus[data-call-state="active"]{animation:simoRingPulse 1.6s ease-in-out infinite}
    @media(prefers-reduced-motion:reduce){#simoCallLiveStatus[data-call-state="active"]{animation:none}}
    #simoCallLiveStatus{margin:8px 0;padding:6px 9px;border:1px solid #76e0a6;border-radius:8px;background:#103d2b;color:#edfff4;font-weight:700;font-size:13px}
    #simoCallingBtn[data-call-state="active"],#simoCallMini[data-call-state="active"]{background:#075332;border-color:#82ffc0;animation:simoRingPulse 1.6s ease-in-out infinite}
    @media(prefers-reduced-motion:reduce){#simoCallingBtn[data-call-state="active"],#simoCallMini[data-call-state="active"]{animation:none}}
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
  panel.innerHTML=`<button id="simoCallClose" type="button" aria-label="Minimize calling panel">— Minimize</button><h3 style="margin:0 0 10px"><span id="simoCallHeading">☎ Simo Calling</span><span id="simoCallMissedCount"></span></h3><small class="simo-call-description">One-to-one browser voice/video between signed-in Simo users. No telephone numbers or voicemail yet.</small><p id="simoCallStatus" role="status">Sign in to use calling.</p><div class="simo-call-setup"><form id="simoCallHandleSetup" class="simo-handle-setup" aria-labelledby="simoCallHandleTitle"><div id="simoCallHandleGuide" hidden><strong id="simoCallHandleTitle">Set up your Simo handle</strong><p>Tap Your Simo handle, choose a name, then tap Save my handle. Use it for texts, voice calls, and video calls.</p></div><label>Your Simo handle<input id="simoCallHandle" maxlength="24" placeholder="e.g. simo_friend" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><button type="submit" id="simoCallSave">Save my handle</button></form><hr style="border:0;border-top:1px solid #35536a;margin:12px 0"><label>Call another handle<input id="simoCallTarget" maxlength="25" placeholder="@friend_handle" autocomplete="off"></label><div class="simo-call-start-buttons"><button type="button" id="simoCallStart">Voice call</button><button type="button" id="simoCallStartVideo">Video call</button></div></div><p id="simoCallLiveStatus" role="status" hidden></p><div class="simo-call-actions"><button type="button" id="simoCallAnswer" hidden>Answer</button><button type="button" id="simoCallHangup" hidden>Decline / Hang up</button><div id="simoCallVideoControls" hidden><button type="button" id="simoCallMicToggle">Mute microphone</button><button type="button" id="simoCallCameraToggle" hidden>Turn camera off</button></div></div><div id="simoCallVideoGrid"><div class="simo-video-tile" id="simoRemoteVideoTile" hidden><video id="simoCallRemoteVideo" autoplay playsinline hidden aria-label="Other participant video"></video><span class="simo-video-id" id="simoRemoteVideoLabel">Other participant</span></div><div class="simo-video-tile" id="simoLocalVideoTile" hidden><video id="simoCallLocalVideo" autoplay muted playsinline hidden aria-label="Your camera preview"></video><span class="simo-video-id" id="simoLocalVideoLabel">You</span></div></div><div id="simoCallMissedList" aria-label="Missed calls"></div><audio id="simoCallAudio" autoplay playsinline></audio>`;
  const contactsBox=document.createElement('div');contactsBox.id='simoCallContacts';contactsBox.hidden=true;
  contactsBox.innerHTML='<label>Saved contacts<select id="simoContactsSelect"><option value="">Choose a contact…</option></select></label><div class="contact-row"><input id="simoContactNickname" maxlength="48" placeholder="Nickname (e.g. Mom)"><button id="simoContactSave" type="button">Save contact</button><button id="simoContactRemove" type="button">Remove</button></div><label style="display:block;margin-top:6px"><input id="simoContactFavorite" type="checkbox" style="width:auto"> Favorite</label>';
  const callSetup = panel.querySelector('.simo-call-setup');
  callSetup.insertBefore(contactsBox, panel.querySelector('#simoCallTarget').closest('label'));
  const outgoing=document.createElement('aside');outgoing.id='simoOutgoingRing';outgoing.hidden=true;
  outgoing.setAttribute('role','status');outgoing.setAttribute('aria-live','polite');
  outgoing.innerHTML='<strong id="simoOutgoingTitle">Calling…</strong><div id="simoOutgoingTo"></div><div>Ringing — waiting for an answer</div><button id="simoOutgoingCancel" type="button">Cancel call</button>';
  const mini=document.createElement('div');mini.id='simoCallMini';mini.hidden=true;
  mini.innerHTML='<span id="simoCallMiniStatus" role="status"></span> <button type="button" id="simoMiniOpen">Open call</button> <button type="button" id="simoMiniHangup">Hang up</button>';
  const banner=document.createElement('div');banner.id='simoCallNotice';banner.hidden=true;banner.setAttribute('role','status');
  banner.style.cssText='position:fixed;right:14px;top:80px;z-index:9500;max-width:min(390px,calc(100vw - 28px));border:1px solid #71c9ed;border-radius:12px;padding:12px 15px;background:#103b55;color:#fff;font:600 13px system-ui;box-shadow:0 8px 32px #0008';
  ringNotice=document.createElement('aside');ringNotice.id='simoIncomingRing';ringNotice.hidden=true;
  ringNotice.setAttribute('role','alertdialog');ringNotice.setAttribute('aria-label','Incoming Simo call');
  ringNotice.innerHTML='<div>🟢 SIMO CONNECT</div><strong id="simoRingTitle">Incoming call</strong><div id="simoRingFrom"></div><div id="simoRingError" role="alert"></div><div class="simo-ring-actions"><button type="button" id="simoRingAnswer">Answer</button><button type="button" id="simoRingDecline" class="simo-decline">Decline</button></div>';
  document.body.append(btn,panel,banner,ringNotice,outgoing,mini);
  const dashboardToolbar = document.querySelector('#simoConnectToolbarR1068.simo-connect-toolbar-r1068');
  if (dashboardToolbar) dashboardToolbar.append(mini);
  $('simoRingAnswer').onclick=()=>{$('simoCallAnswer').click();};
  $('simoRingDecline').onclick=()=>{$('simoCallHangup').click();};
  function showRing(from, mode){
    const who=String(from||'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,24);
    $('simoRingError').textContent = '';
    $('simoRingAnswer').disabled = false;
    $('simoRingTitle').textContent=mode==='video'?'📹 Incoming video call':'☎ Incoming audio call';
    $('simoRingFrom').textContent='@'+who+' is calling you';
    $('simoRingAnswer').textContent=mode==='video'?'Answer video':'Answer call';
    ringNotice.hidden=false;btn.classList.add('simo-call-ringing');
  }
  function hideRing() {
    stopRingAudio();
    if (ringNotice) ringNotice.hidden = true;
    btn.classList.remove('simo-call-ringing');
    browserRingNotice?.close();
    browserRingNotice = null;
  }
  function showOutgoing(handle,mode){
    $('simoOutgoingTitle').textContent=mode==='video'?'📹 Outgoing video call':'☎ Outgoing audio call';
    $('simoOutgoingTo').textContent='Calling @'+handle+'…';outgoing.hidden=false;
    btn.classList.add('simo-call-outgoing');
    syncCallStatus();
  }
  function hideOutgoing(){outgoing.hidden=true;btn.classList.remove('simo-call-outgoing');}
  $('simoOutgoingCancel').onclick=()=>end();
  $('simoMiniOpen').onclick=()=>showCallPanel();
  $('simoMiniHangup').onclick=()=>end();
  async function loadContacts(){
    try {const data=await contactsApi();savedContacts=data.contacts||[];
      const select=$('simoContactsSelect');
      const selectedHandle = select.value;
      select.replaceChildren(new Option('Choose a contact…',''));
      for(const c of savedContacts)select.add(new Option((c.favorite?'★ ':'')+c.nickname+' (@'+c.handle+')',c.handle));
      if (savedContacts.some(contact => contact.handle === selectedHandle)) select.value = selectedHandle;
      updateVideoIdentity();
    }catch(e){say(e.message);}
  }
  $('simoContactsSelect').onchange=()=>{
    const c=savedContacts.find(x=>x.handle===$('simoContactsSelect').value);if(!c)return;
    targetContactId = '';
    $('simoCallTarget').value=c.handle;$('simoContactNickname').value=c.nickname;
    $('simoContactFavorite').checked=!!c.favorite;updateVideoIdentity();
  };
  $('simoContactSave').onclick=async()=>{
    const handle=$('simoCallTarget').value.trim().replace(/^@/,'');
    if(!handle){say('Enter a handle to save as a contact.');return;}
    try{await contactsApi('POST',{handle,nickname:$('simoContactNickname').value.trim(),favorite:$('simoContactFavorite').checked});
      await loadContacts();$('simoContactsSelect').value=handle;
      window.dispatchEvent(new Event('simo-connect:calling-contacts-changed'));
      say('Contact saved for your account.');}catch(e){say(e.message);}
  };
  $('simoContactRemove').onclick=async()=>{
    const handle=$('simoContactsSelect').value;if(!handle)return;
    if(!confirm('Remove this contact from your Simo address book?'))return;
    try{await contactsApi('DELETE',{handle});await loadContacts();$('simoContactNickname').value='';
      window.dispatchEvent(new Event('simo-connect:calling-contacts-changed'));
      say('Contact removed.');}catch(e){say(e.message);}
  };
  const guestGate=document.createElement('div');guestGate.id='simoCallGuestGate';guestGate.hidden=true;
  guestGate.innerHTML='<strong>Sign in to use Simo Connect</strong><p>Voice and video calls require a registered Simo account.</p><p>Use the Sign in or Easy Signup option in Simo.</p>';
  panel.querySelector('.simo-call-setup').prepend(guestGate);
  function showGuestGate(){guestMode=true;guestGate.hidden=false;
    $('simoCallHandleSetup').hidden=true;
    ['simoCallSave','simoCallStart','simoCallStartVideo'].forEach(id=>{$(id).disabled=true;});
    contactsBox.hidden=true;
    say('Sign in or create a free Simo account to use Simo Connect.');
  }
  function clearGuestGate(){guestMode=false;guestGate.hidden=true;contactsBox.hidden=false;
    $('simoCallHandleSetup').hidden=false;
    ['simoCallSave','simoCallStart','simoCallStartVideo'].forEach(id=>{$(id).disabled=false;});
  }
  function syncCallStatus() {
    const audio = local?.getAudioTracks().some(track => track.readyState === 'live' && track.enabled);
    const video = local?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled);
    const connection = pc?.connectionState;
    const active = connection === 'connected';
    const inProgress = Boolean(calling || answering || local || outgoingAccepted || callAccepted);
    const incomingRing = Boolean(incoming && !answering && !callAccepted);
    const outgoingRing = Boolean(calling && !outgoing.hidden && !outgoingAccepted);
    const mode = callMode === 'video' ? 'Video' : 'Voice';
    let state = 'idle';
    let label = '';
    if (active) { state = 'active'; label = mode + ' call active'; }
    else if (connection === 'disconnected') { state = 'reconnecting'; label = mode + ' call reconnecting'; }
    else if (incomingRing) { state = 'incoming'; label = 'Incoming ' + mode.toLowerCase() + ' call'; }
    else if (outgoingRing) { state = 'ringing'; label = mode + ' call ringing'; }
    else if (inProgress) { state = 'connecting'; label = mode + ' call connecting'; }
    const detail = state === 'incoming' ? ' · @' + remoteHandle :
      ' · Mic ' + (audio ? 'on' : 'off') + (callMode === 'video' ? ' · Camera ' + (video ? 'on' : 'off') : '');
    const status = label ? label + detail : '';
    const live = $('simoCallLiveStatus');
    live.hidden = !status;
    mini.hidden = !panel.hidden || !status || incomingRing || outgoingRing;
    dashboardToolbar?.classList.toggle('simo-show-call-strip', !mini.hidden);
    callSetup.hidden = inProgress;
    panel.dataset.active = String(inProgress);
    live.dataset.callState = state;
    if (callPresentation === status) return;
    callPresentation = status;
    btn.dataset.callState = mini.dataset.callState = state;
    btn.textContent = label || '☎ Simo Audio / Video';
    live.textContent = $('simoCallMiniStatus').textContent = status;
    // The website handles incoming calls. The extension still reports calls it places.
    const statusEvent = embeddedConnect && incoming && !callAccepted
      ? {state:'idle', mode:callMode, text:''}
      : {state, mode:callMode, text:status};
    window.dispatchEvent(new CustomEvent('simo-connect:call-status', {detail:statusEvent}));
  }
  function updateCallView() {
    const mode = current || calling ? callMode : preferredMode;
    panel.dataset.mode = mode;
    $('simoCallHeading').textContent = mobile.matches
      ? (mode === 'video' ? 'Video call' : 'Voice call')
      : '☎ Simo Calling';
    $('simoCallClose').textContent = mobile.matches ? '‹ Simo' : '— Minimize';
    $('simoCallClose').setAttribute('aria-label', mobile.matches ? 'Return to Simo' : 'Minimize calling panel');
    syncCallStatus();
  }
  function showCallPanel(mode) {
    if (mode && !current && !calling) preferredMode = mode;
    updateCallView();
    window.dispatchEvent(new CustomEvent('simo-connect:panel-open', {detail:{panel:'calling'}}));
    panel.hidden = false;
    syncCallStatus();
    if (!current && !calling) refresh();
    if (current || calling) panel.scrollTop = 0;
  }
  function hideCallPanel() {
    panel.hidden = true;
    syncCallStatus();
  }
  mobile.addEventListener?.('change', updateCallView);
  updateCallView();
  btn.onclick = () => panel.hidden ? showCallPanel() : hideCallPanel();
  window.addEventListener('simo-connect:open-call', event => {
    if (event.detail?.handle && !current && !calling) {
      $('simoCallTarget').value = event.detail.handle;
      targetContactId = event.detail.contactId || '';
    }
    showCallPanel(event.detail?.mode);
  });
  window.addEventListener('simo-connect:panel-open', event => {
    if (event.detail?.panel === 'messages') hideCallPanel();
  });
  $('simoCallTarget').addEventListener('input', () => { targetContactId = ''; });
  $('simoCallClose').onclick = hideCallPanel;
  $('simoCallHandleSetup').onsubmit = async event => {
    event.preventDefault();
    const save = $('simoCallSave');
    if (guestMode || save.disabled) return;
    save.disabled = true;
    try {
      const result = await api('profile', {handle:$('simoCallHandle').value});
      window.dispatchEvent(new CustomEvent('simo-connect:handle-saved', {detail:{handle:result.handle}}));
      if (!panel.hidden) $('simoCallTarget').focus();
    } catch (error) {
      say(error.message);
    } finally {
      save.disabled = guestMode;
    }
  };
  $('simoCallStart').onclick=()=>begin('audio');
  $('simoCallStartVideo').onclick=()=>begin('video');
  $('simoCallMicToggle').onclick=()=>{const track=local?.getAudioTracks()[0];if(!track)return;track.enabled=!track.enabled;$('simoCallMicToggle').textContent=track.enabled?'Mute microphone':'Unmute microphone';syncCallStatus();};
  $('simoCallCameraToggle').onclick=()=>{const track=local?.getVideoTracks()[0];if(!track)return;track.enabled=!track.enabled;$('simoCallCameraToggle').textContent=track.enabled?'Turn camera off':'Turn camera on';syncCallStatus();};
  $('simoCallAnswer').onclick=answer;
  $('simoCallHangup').onclick=end;
  function syncHandleGuide() {
    $('simoCallHandleSetup').dataset.needsHandle = String(!myHandle);
    $('simoCallHandleGuide').hidden = Boolean(myHandle);
  }

  async function refresh() {
    try {
      const result = await api('profile');
      clearGuestGate();
      myHandle = result.handle || '';
      const input = $('simoCallHandle');
      if (myHandle || !input.value) input.value = myHandle;
      syncHandleGuide();
      updateVideoIdentity();
      say(myHandle ? 'Signed in as @' + myHandle : '');
      if (myHandle) {
        beginMonitoring();
        loadContacts();
      }
    } catch (error) {
      if (/sign in|account|unauthoriz/i.test(error.message)) showGuestGate();
      else say(error.message);
    }
  }

  window.addEventListener('simo-connect:handle-saved', event => {
    myHandle = event.detail.handle;
    $('simoCallHandle').value = myHandle;
    syncHandleGuide();
    updateVideoIdentity();
    say('Your handle is @' + myHandle);
    beginMonitoring();
    loadContacts();
  });
  window.addEventListener('simo-connect:contacts-changed', loadContacts);
  window.addEventListener('focus', () => {
    if (myHandle && !panel.hidden && !callSetup.hidden) void loadContacts();
  });
  // Begin checking incoming calls when an authenticated Simo handle is loaded.
  refresh();
  window.addEventListener('simo-connect:end-call', end);
  window.addEventListener('pagehide', () => {
    if (current && (!incoming || callAccepted)) {
      void api('signal', {call_id:current, kind:'hangup', data:{}}, true).catch(()=>{});
    }
    cleanup();
  });
})();
