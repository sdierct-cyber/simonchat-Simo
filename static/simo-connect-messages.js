/* SIMO CONNECT R10.65 — independent, signed-in direct and small-group messaging beta. */
(() => {
  'use strict';
  if (window.__SIMO_CONNECT_MESSAGES__) return;
  window.__SIMO_CONNECT_MESSAGES__ = true;
  const el = id => document.getElementById(id);
  const mobile = window.matchMedia('(max-width: 700px), (max-height: 500px) and (pointer: coarse)');
  const state = {thread:'', threads:[], cursor:0, editCursor:0, viewVersion:0, open:false, pending:false, timer:null, handle:'', unread:0, unreadIds:new Map(), notificationReady:false, notificationTimer:null, recognition:null, savingHandle:false, contacts:new Map()};
  const api = async (path, data, base = '/api/simo-connect/') => {
    const r = await fetch(base + path, {credentials:'same-origin',
      ...(data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
    const d = await r.json();if (!r.ok || !d.ok) throw new Error(d.error || 'Simo Connect unavailable');return d;
  };
  const recipientHint = 'Enter the recipient’s handle to start a message.';
  const info = message => {
    const status = el('simoConnectStatus');
    status.textContent = message;
    status.hidden = !message;
  };
  const css = document.createElement('style');
  css.textContent = `
    #simoMessagesBtn{position:fixed;right:214px;bottom:140px;z-index:8999;border:1px solid #79c6ef;border-radius:50px;background:#073c59;color:#fff;padding:11px 15px;font:700 13px system-ui;cursor:pointer}
    #simoMessagesPanel{position:fixed;right:14px;bottom:196px;z-index:9002;width:min(410px,calc(100vw - 28px));max-height:min(74vh,680px);overflow:auto;box-sizing:border-box;padding:15px;border:1px solid #4d9abf;border-radius:16px;background:#081a2e;color:#f1f8ff;box-shadow:0 18px 55px #000b;font:13px system-ui}
    #simoMessagesPanel[hidden],#simoMessagesPanel [hidden]{display:none!important}#simoMessagesPanel *{box-sizing:border-box}
    #simoMessagesPanel input,#simoMessagesPanel textarea,#simoMessagesPanel select{width:100%;padding:9px 10px;margin:5px 0 8px;background:#112c47;color:#fff;border:1px solid #4c799c;border-radius:8px;font:inherit}
    #simoMessagesPanel button{cursor:pointer;background:#174e73;border:1px solid #619fc1;border-radius:8px;color:white;padding:8px;margin:3px 4px 3px 0;font:inherit}
    #simoMessagesPanel label{display:block;font-size:12px;color:#d0e6f5}
    #simoMessagesPanel .sc-threads{display:flex;gap:5px;overflow:auto;max-height:100px;flex-direction:column}
    #simoMessagesPanel .sc-threads button{text-align:left;margin:0}
    #simoMessagesPanel .sc-threads button[aria-current="true"]{border-color:#73e1bd;background:#185e60}
    #simoMessagesPanel .sc-chat{height:175px;overflow-y:auto;padding:8px;border-radius:9px;background:#04111f;border:1px solid #34536c;margin:8px 0;overflow-wrap:anywhere}
    #simoMessagesPanel .sc-edit-button{margin-inline-start:8px}
    #simoMessagesPanel .sc-edit-form textarea{font-size:16px}
    #simoMessagesPanel .sc-entry{padding:6px 8px;margin:5px 0;background:#12304b;border-radius:7px;white-space:pre-wrap}
    #simoMessagesPanel .sc-attachment{display:inline-block;margin:5px 0;padding:7px 9px;color:#aee4ff;border:1px solid #4c799c;border-radius:7px;overflow-wrap:anywhere}#simoMessagesPanel .sc-attachment:focus-visible{outline:2px solid #9df}#simoMessagesPanel .sc-entry small{display:block;color:#9ed7ee;margin-bottom:3px}
    #simoMessagesPanel .sc-entry .sc-edit-label{display:inline;color:#a8d5e8}
    #simoMessagesPanel .sc-entry .sc-edit-label[hidden]{display:none}
    #simoMessagesPanel .sc-edit-form{margin-top:6px}
    #simoConnectContactForm{margin-block:8px;padding:10px;border:1px solid #4c799c;border-radius:8px}
    #simoConnectContactForm input{font-size:16px}
    #simoConnectContactStatus{display:block;color:#a8d5e8}
    #simoConnectMic[aria-pressed="true"]{background:#186454;border-color:#70e4af}#simoConnectStatus{min-height:16px;color:#a8d5e8;margin:6px 0}
    @media(max-width:600px){#simoMessagesBtn{right:14px;bottom:198px}#simoMessagesPanel{bottom:252px;max-height:calc(100vh - 270px)}}`;
  document.head.appendChild(css);
  const button = document.createElement('button'); button.type='button';button.id='simoMessagesBtn';button.textContent='✉ Simo Messages';
  const panel=document.createElement('section');panel.id='simoMessagesPanel';panel.hidden=true;panel.setAttribute('aria-label','Simo messages');
  panel.innerHTML=`<button type="button" id="simoMessagesClose" style="float:right" aria-label="Close messages">×</button>
    <h3 style="margin:3px 0 6px">✉ Simo Messages</h3><small class="sc-description">Private Simo-to-Simo messages. Not SMS; no end-to-end encryption claim.</small>
    <p id="simoConnectStatus" role="status">Open to load your conversations.</p>
    <form id="simoConnectHandleSetup" class="simo-handle-setup" data-needs-handle="true" aria-labelledby="simoConnectHandleTitle" hidden>
      <strong id="simoConnectHandleTitle">Set up your Simo handle</strong>
      <p>Tap Your Simo handle, choose a name, then tap Save my handle. Share it with friends so they can text or call you.</p>
      <label>Your Simo handle<input id="simoConnectOwnHandle" type="text" minlength="3" maxlength="24" required placeholder="e.g. jordan_24" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
      <button id="simoConnectSaveHandle" type="submit">Save my handle</button>
      <span id="simoConnectHandleStatus" role="status"></span>
    </form>
    <div id="simoConnectDirectTo"><label>To (recipient’s Simo handle)<input id="simoConnectDirectRecipient" maxlength="25" placeholder="@friend_handle" autocomplete="off" autocapitalize="none" spellcheck="false"></label></div>
    <div class="sc-conversations">
    <button type="button" id="simoConnectNewMessage" hidden>New message</button>
    <details id="simoConnectGroupOptions"><summary>New group conversation</summary>
    <label>Recipient handles, separated by commas<input id="simoConnectRecipients" maxlength="300" placeholder="simo_test2, friend2"></label>
    <label>Group name<input id="simoConnectTitle" maxlength="64" placeholder="Friends and family"></label>
    <button type="button" id="simoConnectCreate">Create group</button></details>
    <h4 style="margin:12px 0 5px">Conversations</h4><div id="simoConnectThreads" class="sc-threads"></div></div>
    <div id="simoConnectConversationTitle" style="margin-top:9px;font-weight:700">New message</div>
    <div id="simoConnectThreadActions" hidden><button id="simoConnectContact" type="button" hidden>Save contact</button><button type="button" id="simoConnectVoice">Voice call</button><details class="sc-thread-tools" open><summary>Conversation options</summary>
      <button type="button" id="simoConnectClear" title="Clear only your view of older messages">Clear my messages</button>
      <button type="button" id="simoConnectHide" title="Remove from only your conversation list">Remove from my list</button>
      <button type="button" id="simoConnectVideo" title="Open Simo Calling to start a video call">📹 Video call</button>
      <small>These controls affect only your own conversation view. Others keep their messages. Files and messages remain stored on the server.</small>
    </details></div>
    <form id="simoConnectContactForm" hidden>
      <div id="simoConnectContactHandle"></div>
      <label>Contact name<input id="simoConnectContactName" maxlength="48" required placeholder="e.g. John"></label>
      <button type="submit" id="simoConnectContactSave">Save contact</button>
      <button type="button" id="simoConnectContactCancel">Cancel</button>
      <span id="simoConnectContactStatus" role="status"></span>
    </form>
    <div id="simoConnectHistory" class="sc-chat" role="log" aria-live="polite" hidden></div>
    <div class="sc-composer"><label class="sc-message-label"><span>Message</span><textarea id="simoConnectBody" rows="2" maxlength="2000" aria-label="Message" placeholder="Type a message..."></textarea></label>
    <details class="sc-file-tools" open><summary>Attach file</summary><label style="margin-top:7px">Attach file (PNG, JPG, WEBP, PDF, TXT or CSV, max 5 MB)
      <input type="file" id="simoConnectFile" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv" /></label>
    <button type="button" id="simoConnectUpload">Share file</button></details>
    <div class="sc-compose-actions"><button type="button" id="simoConnectMic" aria-pressed="false" aria-label="Dictate a message">🎙 Dictate</button><button type="button" id="simoConnectSend">Send message</button></div><small id="simoConnectMicHelp">Dictation fills the message box; review before sending. Never sends automatically.</small></div>`;
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
  const toolbar = el('simoConnectToolbarR1068');
  const callingPanel = el('simoCallingPanel');
  const shell = document.querySelector('.app-shell');
  if (toolbar && callingPanel && shell) {
    const modes = document.createElement('div');
    modes.className = 'simo-connect-mobile-modes';
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Simo Connect');
    const textMode = document.createElement('button');
    textMode.type = 'button';
    textMode.setAttribute('aria-controls', panel.id);
    textMode.onclick = () => button.click();
    modes.append(textMode);
    for (const [mode, label] of [['audio', 'Voice call'], ['video', 'Video call']]) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.textContent = label;
      entry.setAttribute('aria-controls', callingPanel.id);
      entry.onclick = () => window.dispatchEvent(new CustomEvent('simo-connect:open-call', {detail:{mode}}));
      modes.append(entry);
    }
    toolbar.prepend(modes);
    el('simoConnectThreadActions').prepend(el('simoConnectVideo'));
    function updateUnreadLabel() {
      textMode.textContent = 'Text' + (state.unread ? ' · ' + state.unread : '');
    }
    new MutationObserver(updateUnreadLabel).observe(button, {childList:true});
    updateUnreadLabel();

    let openPanel = false;
    let previousFocus = null;
    function syncViewport() {
      const viewport = window.visualViewport;
      if (!mobile.matches || !viewport || Math.abs(viewport.scale - 1) > 0.05) return;
      for (const surface of [panel, callingPanel]) {
        surface.style.setProperty('--simo-connect-height', viewport.height + 'px');
        surface.style.setProperty('--simo-connect-top', viewport.offsetTop + 'px');
      }
    }
    function syncPanels() {
      const active = mobile.matches && [panel, callingPanel].find(surface => !surface.hidden);
      shell.inert = Boolean(active);
      if (active === openPanel) return;
      if (active) {
        if (!openPanel) previousFocus = document.activeElement;
        active.querySelector('button').focus({preventScroll:true});
      } else if (openPanel) {
        const restore = previousFocus?.isConnected && previousFocus.getClientRects().length
          ? previousFocus : mobile.matches ? textMode : button;
        restore.focus({preventScroll:true});
        previousFocus = null;
      }
      openPanel = active;
      syncViewport();
    }
    function adaptMode() {
      const isMobile = mobile.matches;
      el('simoMessagesClose').textContent = isMobile ? '‹ Simo' : '×';
      el('simoMessagesClose').setAttribute('aria-label', isMobile ? 'Return to Simo' : 'Close messages');
      for (const details of panel.querySelectorAll('.sc-thread-tools, .sc-file-tools')) details.open = !isMobile;
      for (const surface of [panel, callingPanel]) {
        if (isMobile) surface.setAttribute('role', 'dialog');
        else {
          surface.removeAttribute('role');
          surface.style.removeProperty('--simo-connect-height');
          surface.style.removeProperty('--simo-connect-top');
        }
      }
      syncViewport();
      syncPanels();
    }
    callingPanel.setAttribute('aria-labelledby', 'simoCallHeading');
    const observer = new MutationObserver(syncPanels);
    for (const surface of [panel, callingPanel]) observer.observe(surface, {attributes:true,attributeFilter:['hidden']});
    mobile.addEventListener?.('change', adaptMode);
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openPanel && !event.defaultPrevented && el('simoIncomingRing')?.hidden) {
        openPanel.querySelector('button').click();
      }
    });
    adaptMode();
  }
  function notify(message){messageNotice.textContent=message;messageNotice.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>{messageNotice.hidden=true;},6500);}
  async function markRead(){if(!state.thread||!state.open)return;try{await api('read',{thread:state.thread});}catch(e){}}
  async function notificationPoll(){
    try{const data=await api('notifications');const list=data.threads||[];state.unread=data.unread_total||0;
      button.textContent='✉ Simo Messages'+(state.unread?' · '+state.unread:'');
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

  function otherHandle(thread) {
    return thread?.kind === 'direct' ? thread.members.find(handle => handle && handle !== state.handle) : '';
  }

  function shortName(thread) {
    if (thread.kind === 'group') return '👥 ' + thread.title;
    const handle = otherHandle(thread);
    if (!handle) return 'Former user';
    const contact = state.contacts.get(handle);
    return contact ? contact.nickname + ' (@' + handle + ')' : '💬 @' + handle;
  }

  function syncContactDisplay() {
    const thread = state.threads.find(entry => entry.id === state.thread);
    const handle = otherHandle(thread);
    if (thread) el('simoConnectConversationTitle').textContent = shortName(thread);
    const button = el('simoConnectContact');
    button.hidden = !handle;
    button.textContent = state.contacts.has(handle) ? 'Edit contact name' : 'Save contact';
    renderThreads();
  }

  async function loadContacts() {
    const result = await api('contacts');
    state.contacts = new Map(result.contacts.map(contact => [contact.handle, contact]));
    syncContactDisplay();
  }
  function renderThreads(){
    const list=el('simoConnectThreads');
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.threadId : '';
    const scrollLeft = list.scrollLeft;
    list.replaceChildren();
    if (!state.threads.length) {list.textContent='No conversations yet.';return;}
    for(const t of state.threads){const b=document.createElement('button');b.type='button';b.textContent=shortName(t);b.setAttribute('aria-current',String(t.id===state.thread));b.dataset.threadId=t.id;b.onclick=()=>select(t.id);list.append(b);if(t.id===focused)b.focus({preventScroll:true});}
    list.scrollLeft=scrollLeft;
  }
  async function loadThreads(){
    const data = await api('threads');
    state.handle = data.handle || '';
    state.threads = data.threads || [];
    renderThreads();
    el('simoConnectHandleSetup').hidden = Boolean(state.handle);
    if (el('simoConnectStatus').textContent === 'Open to load your conversations.') {
      if (state.handle) info(recipientHint);
      else info('Set up your handle to send your first message.');
    }
    if(state.thread && !state.threads.some(t=>t.id===state.thread)) composeNewMessage();
  }
  function activateThread(thread) {
    state.thread = thread ? thread.id : '';
    panel.dataset.threadOpen = String(Boolean(thread));
    if (thread && el('simoConnectStatus').textContent === recipientHint) info('');
    resetHistory();
    el('simoConnectDirectTo').hidden = Boolean(thread);
    el('simoConnectHistory').hidden = !thread;
    el('simoConnectNewMessage').hidden = !thread;
    el('simoConnectConversationTitle').textContent = thread ? shortName(thread) : 'New message';
    el('simoConnectContactForm').hidden = true;
    el('simoConnectThreadActions').hidden = !thread;
    el('simoConnectVideo').hidden = !thread || thread.kind !== 'direct';
    el('simoConnectVoice').hidden = el('simoConnectVideo').hidden;
    if (thread) el('simoConnectGroupOptions').open = false;
    syncContactDisplay();
  }

  function composeNewMessage() {
    activateThread(null);
    if (state.handle) info(recipientHint);
  }

  async function select(id) {
    const thread = state.threads.find(entry => entry.id === id);
    if (!thread) return;
    activateThread(thread);
    await loadMessages();
    await markRead();
  }

  function resetHistory() {
    state.cursor = 0;
    state.editCursor = 0;
    state.viewVersion++;
    el('simoConnectHistory').replaceChildren();
  }

  function updateText(item, message) {
    if (Number(item.dataset.revision) > message.revision) return;
    item.dataset.revision = message.revision;
    item.querySelector('.sc-message-text').textContent = message.body;
    item.querySelector('.sc-edit-label').hidden = !message.edited_at;
  }

  function renderMessage(message, thread) {
    const item = document.createElement('div');
    item.className = 'sc-entry';
    item.dataset.messageId = message.id;
    item.dataset.revision = message.revision ?? 0;
    const sender = document.createElement('small');
    sender.textContent = '@' + (message.sender || 'former user') + ' · ' + new Date(message.created_at * 1000).toLocaleTimeString();
    item.append(sender);
    if (message.body) {
      const body = document.createElement('span');
      body.className = 'sc-message-text';
      const label = document.createElement('small');
      label.className = 'sc-edit-label';
      label.textContent = ' · Edited';
      item.append(body, label);
      updateText(item, {...message, revision: message.revision ?? 0});
    }
    if (message.attachment_id) {
      const link = document.createElement('a');
      link.className = 'sc-attachment';
      link.textContent = '📎 ' + message.attachment_name + ' (' + Math.ceil((message.attachment_size || 0) / 1024) + ' KB)';
      link.href = '/api/simo-connect/files/' + encodeURIComponent(message.attachment_id);
      link.setAttribute('download', message.attachment_name);
      item.append(link);
    }
    if (message.editable_until * 1000 > Date.now()) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'sc-edit-button';
      edit.textContent = 'Edit';
      edit.dataset.expires = message.editable_until;
      edit.onclick = () => openEditor(item, edit, thread, message.id);
      item.append(edit);
    }
    return item;
  }

  function openEditor(item, edit, thread, id) {
    if (Number(edit.dataset.expires) * 1000 <= Date.now()) {
      edit.remove();
      info('Messages can be edited for 15 minutes after sending.');
      return;
    }
    const revision = Number(item.dataset.revision);
    const form = document.createElement('form');
    form.className = 'sc-edit-form';
    const input = document.createElement('textarea');
    input.rows = 2;
    input.maxLength = 2000;
    input.required = true;
    input.setAttribute('aria-label', 'Edit message');
    input.value = item.querySelector('.sc-message-text').textContent;
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save edit';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    function finish() {
      form.remove();
      if (Number(edit.dataset.expires) * 1000 <= Date.now()) {
        edit.remove();
        return;
      }
      edit.hidden = false;
      if (state.open && edit.isConnected) edit.focus({preventScroll:true});
    }
    cancel.onclick = finish;
    form.onsubmit = async event => {
      event.preventDefault();
      if (save.disabled) return;
      const body = input.value.trim();
      if (!body) {
        status.textContent = 'Enter a message.';
        return;
      }
      input.readOnly = true;
      save.disabled = cancel.disabled = true;
      try {
        const result = await api('messages/edit', {thread,id,revision,body});
        updateText(item, result.message);
        finish();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        input.readOnly = false;
        save.disabled = cancel.disabled = false;
      }
    };
    form.append(input, save, cancel, status);
    edit.hidden = true;
    item.append(form);
    input.focus();
  }

  async function loadMessages() {
    if (!state.open || !state.thread || state.pending) return;
    const {thread, viewVersion} = state;
    state.pending = true;
    try {
      const query = new URLSearchParams({thread, after:state.cursor, after_edit:state.editCursor});
      const data = await api('messages?' + query);
      if (state.viewVersion !== viewVersion || !state.open) return;
      const box = el('simoConnectHistory');
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 32;
      for (const message of data.messages) {
        box.append(renderMessage(message, thread));
        state.cursor = Math.max(state.cursor, message.id);
      }
      for (const edit of data.edits ?? []) {
        const item = box.querySelector(`[data-message-id="${edit.id}"]`);
        if (item) updateText(item, edit);
        state.editCursor = Math.max(state.editCursor, edit.revision);
      }
      for (const button of box.querySelectorAll('.sc-edit-button:not([hidden])')) {
        if (Number(button.dataset.expires) * 1000 <= Date.now()) button.remove();
      }
      if (data.messages.length) {
        if (atBottom && !box.querySelector('.sc-edit-form')) box.scrollTop = box.scrollHeight;
        await markRead();
      }
    } catch (error) {
      if (state.viewVersion === viewVersion && state.open) info(error.message);
    } finally {
      state.pending = false;
      if (state.open && state.viewVersion !== viewVersion) loadMessages();
    }
  }
  async function open(){state.open=true;panel.hidden=false;try{await loadThreads();await loadMessages();await markRead();loadContacts().catch(()=>{});}catch(e){info(e.message);}if(state.open)startPolling();}
  function close(){state.open=false;panel.hidden=true;if(state.recognition){try{state.recognition.stop();}catch(e){}}if(state.timer){clearTimeout(state.timer);state.timer=null;}}
  async function tick(){
    if(!state.open)return;
    if(!document.hidden){await loadMessages();}
    if(state.open)state.timer=setTimeout(tick,document.hidden?15000:5000);
  }
  function startPolling(){if(state.timer)clearTimeout(state.timer);state.timer=setTimeout(tick,5000);}
  button.onclick=()=>{if(state.open)close();else{window.dispatchEvent(new CustomEvent('simo-connect:panel-open',{detail:{panel:'messages'}}));open();}};
  // R10.69: Switching to Calling closes Messages (and stops message-pane polling).
  window.addEventListener('simo-connect:panel-open', event=>{if(event.detail?.panel==='calling'&&state.open)close();});
  el('simoMessagesClose').onclick=close;
  function highlightHandleSetup() {
    const setup = el('simoConnectHandleSetup');
    if (!setup.hidden) {
      el('simoConnectHandleStatus').textContent = 'Save your handle before sending.';
      el('simoConnectOwnHandle').focus();
    }
    return !setup.hidden;
  }

  el('simoConnectHandleSetup').onsubmit = async event => {
    event.preventDefault();
    if (state.savingHandle) return;
    const input = el('simoConnectOwnHandle');
    const save = el('simoConnectSaveHandle');
    const status = el('simoConnectHandleStatus');
    const handle = input.value.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) {
      status.textContent = 'Use 3–24 letters, numbers, or underscores and start with a letter.';
      input.focus();
      return;
    }
    state.savingHandle = true;
    save.disabled = true;
    input.readOnly = true;
    status.textContent = 'Saving…';
    try {
      const result = await api('profile', {handle}, '/api/simo-calling/');
      state.handle = result.handle;
      el('simoConnectHandleSetup').hidden = true;
      window.dispatchEvent(new CustomEvent('simo-connect:handle-saved', {detail:{handle:result.handle}}));
      info('Your handle is @' + result.handle + '. You can now send your message.');
      if (state.open) {
        const recipient = el('simoConnectDirectRecipient');
        (recipient.value.trim() ? el('simoConnectBody') : recipient).focus();
      }
    } catch (error) {
      status.textContent = error.message;
    } finally {
      state.savingHandle = false;
      save.disabled = false;
      input.readOnly = false;
    }
  };

  window.addEventListener('simo-connect:handle-saved', event => {
    if (state.handle === event.detail.handle) return;
    state.handle = event.detail.handle;
    el('simoConnectHandleSetup').hidden = true;
    if (!state.thread) info(recipientHint);
  });

  el('simoConnectNewMessage').onclick = () => {
    composeNewMessage();
    el('simoConnectDirectRecipient').focus();
  };
  el('simoConnectCreate').onclick = async () => {
    if (highlightHandleSetup()) return;
    const handles = el('simoConnectRecipients').value.split(',').map(h => h.trim().replace(/^@/, '')).filter(Boolean);
    try {
      const result = await api('threads', {kind:'group', handles, title:el('simoConnectTitle').value});
      await loadThreads();
      await select(result.thread.id);
      info('Group conversation ready.');
    } catch (error) {
      info(error.message);
    }
  };
  async function manageView(action){
    if(!state.thread)return;
    const prompt=action==='clear'
      ?'Clear older messages from YOUR view? The other people will still see their copies. Messages and attachments remain on the server.'
      :'Remove this conversation from YOUR list? Other participants keep theirs. New incoming messages may reopen it.';
    if(!window.confirm(prompt))return;
    try{
      await api('conversation-view',{thread:state.thread,action});
      resetHistory();
      if(action==='hide'){
        composeNewMessage();
      }
      await loadThreads();if(action==='clear'&&state.thread)await loadMessages();
      info(action==='clear'?'Your view was cleared. Other users keep their messages.':'Removed from your list. Other users are unaffected.');
    }catch(e){info(e.message);}
  }
  el('simoConnectClear').onclick=()=>manageView('clear');
  el('simoConnectHide').onclick=()=>manageView('hide');
  function openConversationCall(mode) {
    const t=state.threads.find(t=>t.id===state.thread);
    if(!t||t.kind!=='direct'){info('Calling is available for one-to-one conversations only.');return;}
    const other=otherHandle(t);if(!other){info('Recipient not found.');return;}
    const callButton=el('simoCallingBtn');if(!callButton){info('Simo Calling is not available.');return;}
    window.dispatchEvent(new CustomEvent('simo-connect:open-call', {detail:{mode,handle:other}}));
  }
  const contactForm = el('simoConnectContactForm');
  const contactName = el('simoConnectContactName');
  const contactStatus = el('simoConnectContactStatus');
  const contactSave = el('simoConnectContactSave');
  el('simoConnectContact').onclick = () => {
    if (contactSave.disabled) return;
    const handle = otherHandle(state.threads.find(entry => entry.id === state.thread));
    if (!handle) return;
    contactName.value = state.contacts.get(handle)?.nickname || '';
    el('simoConnectContactHandle').textContent = '@' + handle;
    contactStatus.textContent = '';
    contactForm.hidden = false;
    contactName.focus();
  };
  el('simoConnectContactCancel').onclick = () => {
    contactForm.hidden = true;
    el('simoConnectContact').focus();
  };
  contactForm.onsubmit = async event => {
    event.preventDefault();
    if (contactSave.disabled || contactForm.hidden) return;
    const thread = state.thread;
    const handle = otherHandle(state.threads.find(entry => entry.id === thread));
    const nickname = contactName.value.trim();
    if (!handle || !nickname) {
      contactStatus.textContent = 'Enter a contact name.';
      return;
    }
    contactSave.disabled = true;
    contactStatus.textContent = '';
    try {
      await api('contacts', {thread, nickname});
      state.contacts.set(handle, {handle, nickname});
      syncContactDisplay();
      window.dispatchEvent(new Event('simo-connect:contacts-changed'));
      if (state.thread === thread && !contactForm.hidden) {
        contactForm.hidden = true;
        el('simoConnectContact').focus();
        info('Contact saved.');
      }
      loadContacts().catch(()=>{});
    } catch (error) {
      if (state.thread === thread) contactStatus.textContent = error.message;
    } finally {
      contactSave.disabled = false;
    }
  };

  el('simoConnectVideo').onclick = () => openConversationCall('video');
  el('simoConnectVoice').onclick = () => openConversationCall('audio');
  el('simoConnectSend').onclick = async () => {
    const send = el('simoConnectSend');
    const field = el('simoConnectBody');
    const recipient = el('simoConnectDirectRecipient');
    const draft = field.value;
    const body = draft.trim();
    if (send.disabled || highlightHandleSetup() || !body) return;
    send.disabled = true;
    const view = state.viewVersion;
    let thread = state.thread;
    try {
      let direct;
      if (!thread) {
        const handle = recipient.value.trim().replace(/^@/, '');
        if (!handle) {
          info('Enter the recipient’s Simo handle in To.');
          recipient.focus();
          return;
        }
        const result = await api('threads', {kind:'direct', handles:[handle]});
        direct = result.thread;
        thread = direct.id;
      }
      await api('messages', {thread, body});
      if (state.viewVersion !== view) return;
      if (field.value === draft) field.value = '';
      if (direct) {
        if (!state.threads.some(entry => entry.id === direct.id)) state.threads.unshift(direct);
        recipient.value = '';
        activateThread(direct);
      }
      info('Message sent.');
      await loadMessages();
      await notificationPoll();
    } catch (error) {
      if (state.viewVersion === view) info(error.message);
    } finally {
      send.disabled = false;
    }
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
        if(state.open)field.focus();info('Dictation ready. Review and press Send message.');};
      sr.onerror=event=>info('Dictation unavailable: '+event.error+'. You can type instead.');
      sr.onend=()=>{state.recognition=null;mic.setAttribute('aria-pressed','false');};
      try{sr.start();}catch(e){state.recognition=null;mic.setAttribute('aria-pressed','false');info('Dictation could not start.');}
    };
  }else {el('simoConnectMic').disabled=true;el('simoConnectMicHelp').textContent='Speech recognition is not supported by this browser; typing remains available.';}
  // Notifications are initialized without showing a stale-message popup on page load.
  notificationPoll();scheduleNotifications();
  window.addEventListener('pagehide',()=>{close();if(state.notificationTimer)clearInterval(state.notificationTimer);});
})();
