/* SIMO CONNECT R10.65 — independent, signed-in direct and small-group messaging beta. */
(() => {
  'use strict';
  if (window.__SIMO_CONNECT_MESSAGES__) return;
  window.__SIMO_CONNECT_MESSAGES__ = true;
  const el = id => document.getElementById(id);
  const state = {thread:'', threads:[], cursor:0, open:false, pending:false, timer:null, handle:'', unread:0, unreadIds:new Map(), notificationReady:false, notificationTimer:null, recognition:null};
  const api = async (path, data) => {
    const r = await fetch('/api/simo-connect/'+path, {credentials:'same-origin',
      ...(data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
    const d = await r.json();if (!r.ok || !d.ok) throw new Error(d.error || 'Simo Connect unavailable');return d;
  };
  const info = message => { el('simoConnectStatus').textContent = message; };
  const css = document.createElement('style');
  css.textContent = `
    #simoMessagesBtn{position:fixed;right:214px;bottom:140px;z-index:8999;border:1px solid #79c6ef;border-radius:50px;background:#073c59;color:#fff;padding:11px 15px;font:700 13px system-ui;cursor:pointer}
    #simoMessagesPanel{position:fixed;right:14px;bottom:196px;z-index:9002;width:min(410px,calc(100vw - 28px));max-height:min(74vh,680px);overflow:auto;box-sizing:border-box;padding:15px;border:1px solid #4d9abf;border-radius:16px;background:#081a2e;color:#f1f8ff;box-shadow:0 18px 55px #000b;font:13px system-ui}
    #simoMessagesPanel[hidden]{display:none!important}#simoMessagesPanel *{box-sizing:border-box}
    #simoMessagesPanel input,#simoMessagesPanel textarea,#simoMessagesPanel select{width:100%;padding:9px 10px;margin:5px 0 8px;background:#112c47;color:#fff;border:1px solid #4c799c;border-radius:8px;font:inherit}
    #simoMessagesPanel button{cursor:pointer;background:#174e73;border:1px solid #619fc1;border-radius:8px;color:white;padding:8px;margin:3px 4px 3px 0;font:inherit}
    #simoMessagesPanel label{display:block;font-size:12px;color:#d0e6f5}
    #simoMessagesPanel .sc-threads{display:flex;gap:5px;overflow:auto;max-height:100px;flex-direction:column}
    #simoMessagesPanel .sc-threads button{text-align:left;margin:0}
    #simoMessagesPanel .sc-threads button[aria-current="true"]{border-color:#73e1bd;background:#185e60}
    #simoMessagesPanel .sc-chat{height:175px;overflow-y:auto;padding:8px;border-radius:9px;background:#04111f;border:1px solid #34536c;margin:8px 0;overflow-wrap:anywhere}
    #simoMessagesPanel .sc-entry{padding:6px 8px;margin:5px 0;background:#12304b;border-radius:7px;white-space:pre-wrap}
    #simoMessagesPanel .sc-attachment{display:inline-block;margin:5px 0;padding:7px 9px;color:#aee4ff;border:1px solid #4c799c;border-radius:7px;overflow-wrap:anywhere}#simoMessagesPanel .sc-attachment:focus-visible{outline:2px solid #9df}#simoMessagesPanel .sc-entry small{display:block;color:#9ed7ee;margin-bottom:3px}
    #simoConnectMic[aria-pressed="true"]{background:#186454;border-color:#70e4af}#simoConnectStatus{min-height:16px;color:#a8d5e8;margin:6px 0}
    @media(max-width:600px){#simoMessagesBtn{right:14px;bottom:198px}#simoMessagesPanel{bottom:252px;max-height:calc(100vh - 270px)}}`;
  document.head.appendChild(css);
  const button = document.createElement('button'); button.type='button';button.id='simoMessagesBtn';button.textContent='✉ Simo Messages (Beta)';
  const panel=document.createElement('section');panel.id='simoMessagesPanel';panel.hidden=true;panel.setAttribute('aria-label','Simo messages');
  panel.innerHTML=`<button type="button" id="simoMessagesClose" style="float:right" aria-label="Close messages">×</button>
    <h3 style="margin:3px 0 6px">✉ Simo Messages</h3><small>Private Simo-to-Simo messages. Not SMS; no end-to-end encryption claim.</small>
    <p id="simoConnectStatus" role="status">Open to load your conversations.</p>
    <details><summary>New private or group conversation</summary>
    <label>Conversation type<select id="simoConnectKind"><option value="direct">One-to-one</option><option value="group">Group</option></select></label>
    <label>Recipient handles, separated by commas<input id="simoConnectRecipients" maxlength="300" placeholder="simo_test2, friend2"></label>
    <label>Group name (only for groups)<input id="simoConnectTitle" maxlength="64" placeholder="Friends and family"></label>
    <button type="button" id="simoConnectCreate">Create conversation</button></details>
    <h4 style="margin:12px 0 5px">Conversations</h4><div id="simoConnectThreads" class="sc-threads"></div>
    <div id="simoConnectConversationTitle" style="margin-top:9px;font-weight:700">Select a conversation</div>
    <div id="simoConnectThreadActions" hidden>
      <button type="button" id="simoConnectClear" title="Clear only your view of older messages">Clear my messages</button>
      <button type="button" id="simoConnectHide" title="Remove from only your conversation list">Remove from my list</button>
      <button type="button" id="simoConnectVideo" title="Open Simo Calling to start a video call">📹 Video call</button>
      <small>These controls affect only your own conversation view. Others keep their messages. Files and messages remain stored on the server.</small>
    </div>
    <div id="simoConnectHistory" class="sc-chat" role="log" aria-live="polite"></div>
    <label>Message<textarea id="simoConnectBody" rows="2" maxlength="2000" placeholder="Type a message..."></textarea></label>
    <label style="margin-top:7px">Attach file (PNG, JPG, WEBP, PDF, TXT or CSV, max 5 MB)
      <input type="file" id="simoConnectFile" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv" /></label>
    <button type="button" id="simoConnectUpload">Share file</button>
    <button type="button" id="simoConnectMic" aria-pressed="false" aria-label="Dictate a message">🎙 Dictate</button><button type="button" id="simoConnectSend">Send message</button><small id="simoConnectMicHelp">Dictation fills the message box; review before sending. Never sends automatically.</small>`;
  const messageNotice=document.createElement('div');messageNotice.id='simoConnectNotice';messageNotice.hidden=true;
  messageNotice.setAttribute('role','status');messageNotice.style.cssText='position:fixed;right:14px;top:140px;z-index:9490;max-width:min(390px,calc(100vw - 28px));border:1px solid #5daeda;border-radius:12px;padding:12px 15px;background:#113852;color:white;font:600 13px system-ui;box-shadow:0 8px 24px #0008';
  document.body.append(button,panel,messageNotice);
  // R10.69: ONE shared dock owns both pills, so language and width can't overlap.
  // Calling script loads first, but the dock is constructed after both buttons exist.
  const callPill=el('simoCallingBtn');
  if(callPill){
    const dock=document.createElement('nav');dock.id='simoConnectPillDock';
    dock.setAttribute('aria-label','Simo Connect tools');
    dock.append(button,callPill);document.body.append(dock);
    const dockStyle=document.createElement('style');
    dockStyle.textContent=`
      #simoConnectPillDock{position:fixed;right:20px;bottom:140px;z-index:9003;display:flex;align-items:center;justify-content:flex-end;gap:14px;max-width:calc(100vw - 28px);pointer-events:none}
      #simoConnectPillDock #simoMessagesBtn,#simoConnectPillDock #simoCallingBtn{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;transform:none!important;flex:0 1 auto;white-space:nowrap;pointer-events:auto;margin:0!important;box-sizing:border-box}
      @media(max-width:540px){#simoConnectPillDock{right:12px;bottom:110px;gap:8px;flex-direction:column;align-items:flex-end}#simoConnectPillDock #simoMessagesBtn,#simoConnectPillDock #simoCallingBtn{max-width:calc(100vw - 24px);font-size:12px;padding:8px 11px}}
    `;
    document.head.append(dockStyle);
  }
  function notify(message){messageNotice.textContent=message;messageNotice.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>{messageNotice.hidden=true;},6500);}
  async function markRead(){if(!state.thread||!state.open)return;try{await api('read',{thread:state.thread});}catch(e){}}
  async function notificationPoll(){
    try{const data=await api('notifications');const list=data.threads||[];state.unread=data.unread_total||0;
      button.textContent='✉ Simo Messages (Beta)'+(state.unread?' · '+state.unread:'');
      const next=new Map(list.map(t=>[t.thread_id,t.latest_id]));
      if(state.notificationReady){for(const t of list){if(t.thread_id===state.thread&&state.open)continue;
        if(t.latest_id!==state.unreadIds.get(t.thread_id)){
          const thread=state.threads.find(x=>x.id===t.thread_id);notify('✉ New Simo message'+(thread?' in '+shortName(thread):'')+' · '+t.count+' unread');break;
        }
      }}state.unreadIds=next;state.notificationReady=true;
      if(state.open){await loadThreads();if(state.thread)await loadMessages();}
    }catch(e){}
  }
  function scheduleNotifications(){if(state.notificationTimer)clearInterval(state.notificationTimer);
    state.notificationTimer=setInterval(()=>{if(!document.hidden)notificationPoll();},8000);}

  function shortName(t) {return t.kind==='group' ? '👥 '+t.title : '💬 @'+t.members.filter(h=>h!==state.handle).join(', @');}
  function renderThreads(){
    const list=el('simoConnectThreads');list.replaceChildren();
    if (!state.threads.length) {list.textContent='No conversations yet. Create one above.';return;}
    for(const t of state.threads){const b=document.createElement('button');b.type='button';b.textContent=shortName(t);b.setAttribute('aria-current',String(t.id===state.thread));b.onclick=()=>select(t.id);list.append(b);}
  }
  async function loadThreads(){
    const data=await api('threads');state.handle=data.handle||'';state.threads=data.threads||[];renderThreads();
    if(!state.handle)info('Save your calling handle first in Simo Calling.');
    else if(!state.thread)info('Signed in as @'+state.handle+'. Choose a conversation.');
    if(state.thread && !state.threads.some(t=>t.id===state.thread)) {state.thread='';state.cursor=0;el('simoConnectHistory').replaceChildren();el('simoConnectThreadActions').hidden=true;el('simoConnectConversationTitle').textContent='Select a conversation';}
  }
  async function select(id){
    state.thread=id;state.cursor=0;el('simoConnectHistory').replaceChildren();
    const t=state.threads.find(t=>t.id===id);el('simoConnectConversationTitle').textContent=t?shortName(t):'Conversation';el('simoConnectThreadActions').hidden=!t;el('simoConnectVideo').hidden=!t||t.kind!=='direct';renderThreads();
    await loadMessages();await markRead();
  }
  async function loadMessages(){
    if(!state.open || !state.thread || state.pending)return;
    state.pending=true;
    try{
      const d=await api('messages?thread='+encodeURIComponent(state.thread)+'&after='+state.cursor);
      const box=el('simoConnectHistory');
      for(const m of d.messages){
        const item=document.createElement('div');item.className='sc-entry';
        const sender=document.createElement('small');sender.textContent='@'+(m.sender || 'former user')+' · '+new Date(m.created_at*1000).toLocaleTimeString();
        item.append(sender);
        if(m.body){const body=document.createElement('span');body.textContent=m.body;item.append(body);}
        if(m.attachment_id){const link=document.createElement('a');link.className='sc-attachment';
          link.textContent='📎 '+m.attachment_name+' ('+Math.ceil((m.attachment_size||0)/1024)+' KB)';
          link.href='/api/simo-connect/files/'+encodeURIComponent(m.attachment_id);
          link.setAttribute('download',m.attachment_name);item.append(link);}box.append(item);state.cursor=Math.max(state.cursor,m.id);
      }
      if(d.messages.length){box.scrollTop=box.scrollHeight;await markRead();}
    }catch(e){info(e.message);}finally{state.pending=false;}
  }
  async function open(){state.open=true;panel.hidden=false;try{await loadThreads();await loadMessages();await markRead();}catch(e){info(e.message);}startPolling();}
  function close(){state.open=false;panel.hidden=true;if(state.recognition){try{state.recognition.stop();}catch(e){}}if(state.timer){clearTimeout(state.timer);state.timer=null;}}
  async function tick(){
    if(!state.open)return;
    if(!document.hidden){await loadMessages();}
    state.timer=setTimeout(tick,document.hidden?15000:5000);
  }
  function startPolling(){if(state.timer)clearTimeout(state.timer);state.timer=setTimeout(tick,5000);}
  button.onclick=()=>{if(state.open)close();else{window.dispatchEvent(new CustomEvent('simo-connect:panel-open',{detail:{panel:'messages'}}));open();}};
  // R10.69: Switching to Calling closes Messages (and stops message-pane polling).
  window.addEventListener('simo-connect:panel-open', event=>{if(event.detail?.panel==='calling'&&state.open)close();});
  el('simoMessagesClose').onclick=close;
  el('simoConnectCreate').onclick=async()=>{
    const kind=el('simoConnectKind').value;
    const handles=el('simoConnectRecipients').value.split(',').map(h=>h.trim().replace(/^@/,'')).filter(Boolean);
    try{const d=await api('threads',{kind,handles,title:el('simoConnectTitle').value});await loadThreads();await select(d.thread.id);info('Conversation ready.');}catch(e){info(e.message);}
  };
  async function manageView(action){
    if(!state.thread)return;
    const prompt=action==='clear'
      ?'Clear older messages from YOUR view? The other people will still see their copies. Messages and attachments remain on the server.'
      :'Remove this conversation from YOUR list? Other participants keep theirs. New incoming messages may reopen it.';
    if(!window.confirm(prompt))return;
    try{
      await api('conversation-view',{thread:state.thread,action});
      state.cursor=0;el('simoConnectHistory').replaceChildren();
      if(action==='hide'){
        state.thread='';el('simoConnectThreadActions').hidden=true;
        el('simoConnectConversationTitle').textContent='Select a conversation';
      }
      await loadThreads();if(action==='clear'&&state.thread)await loadMessages();
      info(action==='clear'?'Your view was cleared. Other users keep their messages.':'Removed from your list. Other users are unaffected.');
    }catch(e){info(e.message);}
  }
  el('simoConnectClear').onclick=()=>manageView('clear');
  el('simoConnectHide').onclick=()=>manageView('hide');
  el('simoConnectVideo').onclick=()=>{
    const t=state.threads.find(t=>t.id===state.thread);
    if(!t||t.kind!=='direct'){info('Video calling is available for one-to-one conversations only.');return;}
    const other=t.members.find(h=>h!==state.handle);if(!other){info('Recipient not found.');return;}
    const callButton=el('simoCallingBtn');if(!callButton){info('Simo Calling is not available.');return;}
    if(el('simoCallingPanel')?.hidden)callButton.click();
    el('simoCallTarget').value=other;
    info('Opened Simo Calling for @'+other+'. Select Video call there.');
  };
  el('simoConnectSend').onclick=async()=>{
    if(!state.thread){info('Choose a conversation first.');return;}
    const body=el('simoConnectBody').value.trim();if(!body)return;
    try{await api('messages',{thread:state.thread,body});el('simoConnectBody').value='';await loadMessages();await loadThreads();await notificationPoll();info('Message sent.');}catch(e){info(e.message);}
  };
  el('simoConnectUpload').onclick=async()=>{
    if(!state.thread){info('Choose a conversation first.');return;}
    const file=el('simoConnectFile').files[0];if(!file){info('Choose a file first.');return;}
    if(file.size>5*1024*1024){info('File exceeds 5 MB.');return;}
    const button=el('simoConnectUpload');button.disabled=true;
    try{
      const form=new FormData();form.append('thread',state.thread);form.append('file',file);
      const response=await fetch('/api/simo-connect/files',{
        method:'POST',credentials:'same-origin',headers:{'X-Simo-Connect-Upload':'1'},body:form});
      const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Upload failed');
      el('simoConnectFile').value='';await loadMessages();await loadThreads();info('File shared.');
    }catch(e){info(e.message);}finally{button.disabled=false;}
  };
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SpeechRecognition){
    const mic=el('simoConnectMic');
    mic.onclick=()=>{
      if(state.recognition){try{state.recognition.stop();}catch(e){}return;}
      const sr=new SpeechRecognition();state.recognition=sr;sr.lang=document.documentElement.lang||'en-US';sr.interimResults=false;sr.continuous=false;
      mic.setAttribute('aria-pressed','true');info('Listening… speak your message.');
      sr.onresult=event=>{const words=Array.from(event.results).map(r=>r[0]?.transcript||'').join(' ').trim();
        const field=el('simoConnectBody');field.value=(field.value.trim()?field.value.trim()+' ':'')+words;
        field.focus();info('Dictation ready. Review and press Send message.');};
      sr.onerror=event=>info('Dictation unavailable: '+event.error+'. You can type instead.');
      sr.onend=()=>{state.recognition=null;mic.setAttribute('aria-pressed','false');};
      try{sr.start();}catch(e){state.recognition=null;mic.setAttribute('aria-pressed','false');info('Dictation could not start.');}
    };
  }else {el('simoConnectMic').disabled=true;el('simoConnectMicHelp').textContent='Speech recognition is not supported by this browser; typing remains available.';}
  // Notifications are initialized without showing a stale-message popup on page load.
  notificationPoll();scheduleNotifications();
  window.addEventListener('pagehide',()=>{close();if(state.notificationTimer)clearInterval(state.notificationTimer);});
})();
