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
    const d = await r.json();
    if (!r.ok || !d.ok) {
      const error = new Error(d.error || 'Simo Connect unavailable');
      error.status = r.status;
      throw error;
    }
    return d;
  };
  const recipientHint = 'Enter the recipient’s handle to start a message.';
  const maxAttachmentBytes = 5 * 1024 * 1024;
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
    #simoMessagesPanel .sc-contact-actions{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
    #simoMessagesPanel .sc-contact-actions > button:not([hidden]){display:inline-flex;align-items:center;justify-content:center;margin:0}
    #simoConnectContactForm{margin-block:8px;padding:10px;border:1px solid #4c799c;border-radius:8px}
    #simoConnectContactForm input{font-size:16px}
    #simoConnectContactStatus{display:block;color:#a8d5e8}
    #simoMessagesPanel .sc-composer {
      --action-gap: 8px;
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 var(--action-gap);
    }
    #simoMessagesPanel .sc-composer > * { grid-column: 1 / -1; }
    #simoMessagesPanel .sc-composer > .sc-message-label { grid-row: 1; }
    #simoMessagesPanel .sc-composer > .sc-tool-row {
      grid-area: 2 / 1 / 3 / 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--action-gap); align-content: start; margin-top: 8px;
    }
    #simoMessagesPanel .sc-composer > .sc-compose-actions {
      grid-area: 2 / 3; align-self: start; margin-top: 8px;
    }
    #simoMessagesPanel .sc-composer > :is(.sc-tool-row, .sc-compose-actions) button {
      display: grid; place-items: center; width: 100%; min-width: 0; height: 40px; min-height: 40px;
      margin: 0; padding: 4px; font-size: 13px; line-height: 1.2; text-align: center;
    }
    @media (max-width: 700px), (max-height: 500px) and (pointer: coarse) {
      #simoMessagesPanel .sc-composer > :is(.sc-tool-row, .sc-compose-actions) button { min-height: 44px; }
    }
    @media (max-width: 305px) {
      #simoMessagesPanel .sc-composer > :is(.sc-tool-row, .sc-compose-actions) button { font-size: 12px; }
    }
    #simoMessagesPanel #simoConnectShortcuts{display:contents}
    #simoMessagesPanel .sc-minimize-shortcuts{display:flex;align-items:center;gap:8px;margin:6px 0}
    #simoMessagesPanel .sc-minimize-shortcuts input{width:auto;margin:0;padding:0}
    #simoMessagesPanel .sc-tool-list button{margin:0;min-height:36px}
    #simoMessagesPanel .sc-tool-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
    #simoMessagesPanel #simoConnectToolMenu{border:1px solid #4c799c;border-radius:8px;padding:0 8px;margin:6px 0}
    #simoMessagesPanel #simoConnectToolMenu summary{color:#b9e1f6;cursor:pointer;padding:7px 0}
    #simoMessagesPanel #simoConnectToolOptions{border:0;margin:0;padding:0 0 6px}
    #simoMessagesPanel #simoConnectToolOptions label{display:flex;align-items:center;gap:8px;min-height:29px}
    #simoMessagesPanel #simoConnectToolOptions input{width:auto;margin:0;accent-color:#b99bfa}
    #simoMessagesPanel #simoConnectToolOptions legend{padding:0;margin-bottom:2px}
    #simoMessagesPanel #simoConnectAttachment,#simoMessagesPanel #simoConnectGroupOptions{border:1px solid #4c799c;border-radius:8px;padding:8px;margin:6px 0}
    #simoMessagesPanel[data-thread-open="true"] #simoConnectGroupOptions:not([hidden]){display:block}
    #simoMessagesPanel .sc-compose-actions{display:flex;justify-content:flex-end}
    #simoConnectIdPanel{margin:6px 0;padding:8px;border:1px solid #4c799c;border-radius:8px}
    #simoConnectIdQr{display:block;width:min(100%,204px);height:auto;margin:6px auto;background:white}
    #simoConnectIdVideo{display:block;width:100%;max-height:min(28vh,210px);object-fit:contain;background:#04111f}
    #simoConnectIdLink{display:block;overflow-wrap:anywhere;color:#b8ddff}
    #simoConnectPhotoPanel{margin:6px 0;padding:8px;border:1px solid #4c799c;border-radius:8px}
    #simoConnectPhotoPanel :is(video,img){display:block;width:100%;max-height:min(30vh,220px);object-fit:contain;background:#04111f;border-radius:6px}
    #simoConnectPhotoStatus{margin:6px 0;color:#d0e6f5}
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
    <div id="simoConnectDirectTo">
      <label id="simoConnectSavedContactLabel" hidden>Saved contacts
        <select id="simoConnectSavedContact"><option value="">Choose a saved contact…</option></select>
      </label>
      <label>To (recipient’s Simo handle)<input id="simoConnectDirectRecipient" maxlength="25" placeholder="@friend_handle" autocomplete="off" autocapitalize="none" spellcheck="false"></label></div>
    <div class="sc-conversations">
    <button type="button" id="simoConnectNewMessage" hidden>New message</button>
    <h4 style="margin:12px 0 5px">Conversations</h4><div id="simoConnectThreads" class="sc-threads"></div></div>
    <div id="simoConnectConversationTitle" style="margin-top:9px;font-weight:700">New message</div>
    <div id="simoConnectThreadActions" hidden>
      <div class="sc-contact-actions">
        <button type="button" id="simoConnectVoice">Voice call</button>
        <button type="button" id="simoConnectVideo">Video call</button>
        <button type="button" id="simoConnectContact" hidden>Save contact</button>
      </div>
      <details class="sc-thread-tools" open><summary>Conversation options</summary>
        <button type="button" id="simoConnectClear" title="Clear only your view of older messages">Clear my messages</button>
        <button type="button" id="simoConnectHide" title="Remove from only your conversation list">Remove from my list</button>
        <small>These controls affect only your own conversation view. Others keep their messages. Files and messages remain stored on the server.</small>
      </details>
    </div>
    <form id="simoConnectContactForm" hidden>
      <div id="simoConnectContactHandle"></div>
      <label>Contact name<input id="simoConnectContactName" maxlength="48" required placeholder="e.g. John"></label>
      <button type="submit" id="simoConnectContactSave">Save name</button>
      <button type="button" id="simoConnectContactCancel">Cancel</button>
      <span id="simoConnectContactStatus" role="status"></span>
    </form>
    <div id="simoConnectHistory" class="sc-chat" role="log" aria-live="polite" hidden></div>
    <div class="sc-composer"><label class="sc-message-label"><span>Message</span><textarea id="simoConnectBody" rows="2" maxlength="2000" aria-label="Message" placeholder="Type a message..."></textarea></label>
    <div class="sc-tool-row">
      <button type="button" id="simoConnectTools" aria-expanded="false" aria-controls="simoConnectToolMenu">Tools ▾</button>
      <div id="simoConnectShortcuts" role="group" aria-label="Pinned tools"></div>
    </div>
    <div id="simoConnectToolMenu" hidden>
      <div id="simoConnectMenuActions" class="sc-tool-list" aria-label="More tools">
        <button type="button" id="simoConnectAttach" aria-expanded="false" aria-controls="simoConnectAttachment">Attach file</button>
        <button type="button" id="simoConnectCamera" aria-expanded="false" aria-controls="simoConnectPhotoPanel">Take Photo</button>
        <button type="button" id="simoConnectMic" aria-pressed="false" aria-label="Dictate a message">Dictate</button>
        <button type="button" id="simoConnectInvite">Invite a friend</button>
        <button type="button" id="simoConnectMyId">Share my Simo ID</button>
        <button type="button" id="simoConnectScanId">Scan a Simo ID</button>
        <button type="button" id="simoConnectGroupTool" aria-expanded="false" aria-controls="simoConnectGroupOptions">New group conversation</button>
      </div>
      <details id="simoConnectCustomize">
        <summary>Customize shortcuts</summary>
        <fieldset id="simoConnectToolOptions">
          <legend>Show beside Tools</legend>
        </fieldset>
      </details>
    </div>
    <section id="simoConnectAttachment" aria-label="Attach file" hidden>
      <label>Choose a file (PNG, JPG, WEBP, PDF, TXT or CSV, max 5 MB)
        <input type="file" id="simoConnectFile" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv" />
      </label>
      <button type="button" id="simoConnectUpload">Share file</button>
    </section>
    <section id="simoConnectGroupOptions" aria-label="New group conversation" hidden>
      <label id="simoConnectGroupContactLabel" hidden>Add a saved contact
        <select id="simoConnectGroupContact"><option value="">Choose a saved contact…</option></select>
      </label>
      <label>Recipient handles, separated by commas<input id="simoConnectRecipients" maxlength="300" placeholder="simo_test2, friend2"></label>
      <label>Group name<input id="simoConnectTitle" maxlength="64" placeholder="Friends and family"></label>
      <button type="button" id="simoConnectCreate">Create group</button>
    </section>
    <section id="simoConnectIdPanel" aria-label="Simo contact card" hidden>
      <strong id="simoConnectIdHandle" hidden></strong>
      <p id="simoConnectIdStatus" role="status"></p>
      <video id="simoConnectIdVideo" aria-label="QR camera preview" playsinline muted hidden></video>
      <canvas id="simoConnectIdQr" aria-label="QR code for your Simo ID" role="img" hidden></canvas>
      <a id="simoConnectIdLink" hidden></a>
      <button type="button" id="simoConnectIdCopy" hidden>Copy link</button>
      <a id="simoConnectInviteEmail" hidden>Email invite</a>
      <button type="button" id="simoConnectIdShare" hidden>Share in conversation</button>
      <button type="button" id="simoConnectIdSave" hidden>Save contact</button>
      <button type="button" id="simoConnectIdMessage" hidden>Message</button>
      <button type="button" id="simoConnectIdCall" hidden>Call</button>
      <button type="button" id="simoConnectIdClose">Close</button>
    </section>
    <section id="simoConnectPhotoPanel" aria-label="Take a photo" hidden>
      <video id="simoConnectPhotoVideo" playsinline muted hidden></video>
      <img id="simoConnectPhotoPreview" alt="Photo preview" hidden />
      <p id="simoConnectPhotoStatus" role="status"></p>
      <button type="button" id="simoConnectPhotoCapture" hidden>Capture</button>
      <button type="button" id="simoConnectPhotoRetake" hidden>Retake</button>
      <button type="button" id="simoConnectPhotoShare" hidden>Share photo</button>
      <button type="button" id="simoConnectPhotoCancel">Cancel</button>
    </section>
    <div class="sc-compose-actions"><button type="button" id="simoConnectSend">Send message</button></div></div>`;
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
    const callEntries = new Map();
    for (const [mode, label] of [['audio', 'Voice call'], ['video', 'Video call']]) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.textContent = label;
      entry.setAttribute('aria-controls', callingPanel.id);
      entry.onclick = () => window.dispatchEvent(new CustomEvent('simo-connect:open-call', {detail:{mode}}));
      modes.append(entry);
      callEntries.set(mode, {entry, label});
    }
    window.addEventListener('simo-connect:call-status', ({detail}) => {
      for (const [mode, {entry, label}] of callEntries) {
        const state = detail.mode === mode ? detail.state : 'idle';
        entry.dataset.callState = state;
        entry.textContent = state === 'idle' ? label : state === 'incoming' ? 'Incoming ' + label.toLowerCase() : label + ' ' + state;
      }
    });
    toolbar.prepend(modes);
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
      for (const details of panel.querySelectorAll('.sc-thread-tools')) details.open = !isMobile;
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
    const contactsUnavailable = state.contacts.size === 0;
    for (const id of ['simoConnectSavedContact', 'simoConnectGroupContact']) {
      const select = el(id);
      select.replaceChildren(new Option('Choose a saved contact…', ''));
      for (const contact of state.contacts.values()) {
        const favorite = contact.favorite ? '★ ' : '';
        select.add(new Option(favorite + contact.nickname + ' (@' + contact.handle + ')', contact.handle));
      }
      el(id + 'Label').hidden = contactsUnavailable;
    }
    syncSavedContactChoice();
    syncContactDisplay();
  }

  const savedContact = el('simoConnectSavedContact');
  const directRecipient = el('simoConnectDirectRecipient');
  savedContact.addEventListener('change', () => {
    if (!savedContact.value) return;
    directRecipient.value = '@' + savedContact.value;
    el('simoConnectBody').focus();
  });
  function syncSavedContactChoice() {
    const handle = directRecipient.value.trim().replace(/^@/, '').toLowerCase();
    savedContact.value = state.contacts.has(handle) ? handle : '';
  }
  directRecipient.addEventListener('input', syncSavedContactChoice);
  const groupContact = el('simoConnectGroupContact');
  groupContact.addEventListener('change', () => {
    const handle = groupContact.value;
    groupContact.value = '';
    if (!handle) return;
    const recipients = el('simoConnectRecipients');
    const handles = recipients.value.split(',').map(value => value.trim().replace(/^@/, '')).filter(Boolean);
    if (handles.some(value => value.toLowerCase() === handle)) return;
    const next = [...handles, handle].join(', ');
    if (handles.length >= 11 || next.length > recipients.maxLength) {
      info('A group can include up to 11 other people.');
      return;
    }
    recipients.value = next;
  });
  function refreshSavedContacts() {
    if (state.open) void loadContacts().catch(() => {});
  }
  window.addEventListener('simo-connect:calling-contacts-changed', refreshSavedContacts);
  window.addEventListener('focus', refreshSavedContacts);

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
    if (state.thread !== (thread?.id || '')) {
      closePhoto();
      closeContactCard();
    }
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
    el('simoConnectVideo').hidden = !otherHandle(thread);
    el('simoConnectVoice').hidden = el('simoConnectVideo').hidden;
    closeToolForms();
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
    const body = item.querySelector('.sc-message-text');
    const contactId = parseContactLink(message.body);
    if (contactId) {
      const link = document.createElement('a');
      link.className = 'sc-attachment';
      link.href = contactLink(contactId);
      link.textContent = 'Open Simo contact card';
      link.onclick = event => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        showContactCard(contactId);
      };
      body.replaceChildren(link);
    } else {
      body.textContent = message.body;
    }
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
  function close(){state.open=false;closeToolsMenu();closeToolForms();closePhoto();closeContactCard();panel.hidden=true;if(state.recognition){try{state.recognition.stop();}catch(e){}}if(state.timer){clearTimeout(state.timer);state.timer=null;}}
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
      closeToolForms();
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
  const contactButton = el('simoConnectContact');
  contactButton.onclick = () => {
    if (contactSave.disabled) return;
    const thread = state.thread;
    const handle = otherHandle(state.threads.find(entry => entry.id === thread));
    if (!handle) return;
    const contact = state.contacts.get(handle);
    if (!contact) {
      void saveConversationContact(thread, handle);
      return;
    }
    contactName.value = contact.nickname;
    el('simoConnectContactHandle').textContent = '@' + handle;
    contactStatus.textContent = '';
    contactForm.hidden = false;
    contactName.focus();
  };
  el('simoConnectContactCancel').onclick = () => {
    contactForm.hidden = true;
    contactButton.focus();
  };
  contactForm.onsubmit = event => {
    event.preventDefault();
    if (contactSave.disabled || contactForm.hidden) return;
    const thread = state.thread;
    const handle = otherHandle(state.threads.find(entry => entry.id === thread));
    const nickname = contactName.value.trim();
    if (!handle || !nickname) {
      contactStatus.textContent = 'Enter a contact name.';
      return;
    }
    void saveConversationContact(thread, handle, nickname);
  };

  async function saveConversationContact(thread, handle, nickname) {
    const editing = !contactForm.hidden;
    contactButton.disabled = contactSave.disabled = true;
    contactStatus.textContent = '';
    try {
      if (!nickname) {
        await loadContacts();
        if (state.contacts.has(handle)) {
          if (state.thread === thread) info('This contact is already saved for text, voice, and video.');
          return;
        }
        nickname = handle;
      }
      await api('contacts', {thread, nickname});
      state.contacts.set(handle, {...state.contacts.get(handle), handle, nickname});
      syncContactDisplay();
      window.dispatchEvent(new Event('simo-connect:contacts-changed'));
      if (state.thread === thread) {
        contactForm.hidden = true;
        if (editing) contactButton.focus();
        info('Contact saved for text, voice, and video.');
      }
      void loadContacts().catch(() => {});
    } catch (error) {
      if (state.thread === thread) {
        if (editing) contactStatus.textContent = error.message;
        else info(error.message);
      }
    } finally {
      contactButton.disabled = contactSave.disabled = false;
    }
  }

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
        syncSavedContactChoice();
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
  async function uploadAttachment(thread, file) {
    if (file.size > maxAttachmentBytes) throw new Error('File exceeds 5 MB.');
    const form = new FormData();
    form.append('thread', thread);
    form.append('file', file);
    const response = await fetch('/api/simo-connect/files', {
      method: 'POST', credentials: 'same-origin',
      headers: {'X-Simo-Connect-Upload': '1'}, body: form
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Upload failed.');
  }

  el('simoConnectUpload').onclick = async () => {
    if (!state.thread) { info('Choose a conversation first.'); return; }
    const picker = el('simoConnectFile');
    const file = picker.files[0];
    if (!file) { info('Choose a file first.'); return; }
    const button = el('simoConnectUpload');
    const view = state.viewVersion;
    button.disabled = true;
    try {
      await uploadAttachment(state.thread, file);
      if (picker.files[0] === file) {
        picker.value = '';
        if (state.open && state.viewVersion === view) closeToolForms();
      }
      if (!state.open || state.viewVersion !== view) return;
      await loadMessages();
      await loadThreads();
      if (state.open && state.viewVersion === view) info('File shared.');
    } catch (error) {
      if (state.open && state.viewVersion === view) info(error.message);
    } finally {
      button.disabled = false;
    }
  };

  const cameraButton = el('simoConnectCamera');
  const photoPanel = el('simoConnectPhotoPanel');
  const photoVideo = el('simoConnectPhotoVideo');
  const photoPreview = el('simoConnectPhotoPreview');
  const photoStatus = el('simoConnectPhotoStatus');
  const captureButton = el('simoConnectPhotoCapture');
  const retakeButton = el('simoConnectPhotoRetake');
  const sharePhotoButton = el('simoConnectPhotoShare');
  let photoSession = null;

  function stopPhotoCamera() {
    photoVideo.srcObject?.getTracks().forEach(track => track.stop());
    photoVideo.srcObject = null;
    photoVideo.hidden = true;
  }

  function closePhoto() {
    if (!photoSession) return;
    stopPhotoCamera();
    if (photoSession.previewUrl) URL.revokeObjectURL(photoSession.previewUrl);
    photoSession = null;
    photoPreview.removeAttribute('src');
    photoPreview.hidden = true;
    captureButton.hidden = retakeButton.hidden = sharePhotoButton.hidden = true;
    retakeButton.disabled = sharePhotoButton.disabled = false;
    cameraButton.setAttribute('aria-expanded', 'false');
    photoPanel.hidden = true;
  }

  async function openPhoto() {
    if (!state.open || highlightHandleSetup()) return;
    if (!state.handle || !state.thread) {
      info('Open a signed-in conversation before taking a photo.');
      return;
    }
    closeToolForms();
    closePhoto();
    closeContactCard();
    const shot = {thread: state.thread, file: null, previewUrl: ''};
    photoSession = shot;
    photoPanel.hidden = false;
    cameraButton.setAttribute('aria-expanded', 'true');
    photoStatus.textContent = 'Opening camera…';
    if (!navigator.mediaDevices?.getUserMedia) {
      photoStatus.textContent = 'Camera unavailable here. Use Attach file to share a photo.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: {facingMode: {ideal: 'environment'}}
      });
      if (photoSession !== shot) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      photoVideo.srcObject = stream;
      photoVideo.hidden = false;
      await photoVideo.play();
      if (photoSession !== shot) return;
      captureButton.hidden = false;
      photoStatus.textContent = 'Frame your photo, then press Capture.';
      captureButton.focus();
    } catch (error) {
      if (photoSession !== shot) return;
      stopPhotoCamera();
      photoStatus.textContent = error.name === 'NotAllowedError'
        ? 'Allow camera access in your browser or use Attach file.'
        : 'Could not open the camera. If it is busy, close the other camera session or use Attach file.';
    }
  }

  captureButton.onclick = () => {
    const shot = photoSession;
    if (!shot || captureButton.hidden) return;
    const width = photoVideo.videoWidth;
    const height = photoVideo.videoHeight;
    if (!width || !height) {
      photoStatus.textContent = 'The camera is still starting. Try Capture again.';
      return;
    }
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      photoStatus.textContent = 'Could not capture this photo. Use Attach file instead.';
      return;
    }
    context.drawImage(photoVideo, 0, 0, canvas.width, canvas.height);
    captureButton.hidden = true;
    stopPhotoCamera();
    canvas.toBlob(blob => {
      if (photoSession !== shot) return;
      retakeButton.hidden = false;
      if (!blob || blob.type !== 'image/jpeg' || !blob.size || blob.size > maxAttachmentBytes) {
        photoStatus.textContent = 'Could not prepare this photo. Try Retake or use Attach file.';
        return;
      }
      shot.file = new File([blob], 'simo-photo.jpg', {type: blob.type});
      shot.previewUrl = URL.createObjectURL(blob);
      photoPreview.src = shot.previewUrl;
      photoPreview.hidden = false;
      sharePhotoButton.hidden = false;
      photoStatus.textContent = 'Review your photo before sharing.';
      sharePhotoButton.focus();
    }, 'image/jpeg', 0.86);
  };

  sharePhotoButton.onclick = async () => {
    const shot = photoSession;
    if (!shot?.file || shot.thread !== state.thread || !state.open || sharePhotoButton.disabled) return;
    sharePhotoButton.disabled = retakeButton.disabled = true;
    photoStatus.textContent = 'Sharing photo…';
    try {
      await uploadAttachment(shot.thread, shot.file);
      if (photoSession !== shot) return;
      const view = state.viewVersion;
      closePhoto();
      focusTool(cameraButton);
      await loadMessages();
      await loadThreads();
      if (state.open && state.viewVersion === view) info('Photo shared.');
    } catch (error) {
      if (photoSession === shot) photoStatus.textContent = error.message;
    } finally {
      if (photoSession === shot) sharePhotoButton.disabled = retakeButton.disabled = false;
    }
  };

  cameraButton.onclick = () => photoSession ? closePhoto() : openPhoto();
  retakeButton.onclick = openPhoto;
  el('simoConnectPhotoCancel').onclick = () => {
    closePhoto();
    focusTool(cameraButton);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && photoSession && !photoSession.file) closePhoto();
  });

  const idPanel = el('simoConnectIdPanel');
  const idStatus = el('simoConnectIdStatus');
  const idHandle = el('simoConnectIdHandle');
  const idVideo = el('simoConnectIdVideo');
  const idQr = el('simoConnectIdQr');
  const idLink = el('simoConnectIdLink');
  const idCopy = el('simoConnectIdCopy');
  const inviteEmail = el('simoConnectInviteEmail');
  const idShare = el('simoConnectIdShare');
  const idSave = el('simoConnectIdSave');
  const idMessage = el('simoConnectIdMessage');
  const idCall = el('simoConnectIdCall');
  const idActions = [idCopy, idShare, idSave, idMessage, idCall];
  const cardIdPattern = /^[a-f0-9]{32}$/;
  const pendingContactKey = 'simo_connect_pending_card';
  const qrLibraries = new Map();
  let contactSession = null;

  function contactLink(id) {
    return new URL('/#simo-id=' + id, window.location.origin).href;
  }

  function parseContactLink(value) {
    if (typeof value !== 'string' || value.length > 300) return null;
    try {
      const link = new URL(value.trim());
      const sameSimo = link.origin === window.location.origin ||
        link.origin === 'https://simonchat.ai' || link.origin === 'https://www.simonchat.ai';
      if (!sameSimo || link.username || link.password || link.pathname !== '/' || link.search) return null;
      return link.hash.match(/^#simo-id=([a-f0-9]{32})$/)?.[1] || null;
    } catch {
      return null;
    }
  }

  function loadQrLibrary(name, asset) {
    if (typeof window[name] === 'function') return Promise.resolve(window[name]);
    if (!qrLibraries.has(name)) {
      const script = document.createElement('script');
      script.src = '/static/vendor/' + asset;
      const ready = new Promise((resolve, reject) => {
        script.onload = () => typeof window[name] === 'function'
          ? resolve(window[name]) : reject(new Error('QR tools could not start. Try again.'));
        script.onerror = () => reject(new Error('QR tools could not load. Try again.'));
      }).catch(error => {
        script.remove();
        qrLibraries.delete(name);
        throw error;
      });
      qrLibraries.set(name, ready);
      document.head.append(script);
    }
    return qrLibraries.get(name);
  }

  function closeContactCard() {
    if (!contactSession) return;
    clearTimeout(contactSession.scanTimer);
    idVideo.srcObject?.getTracks().forEach(track => track.stop());
    idVideo.srcObject = null;
    contactSession = null;
    idPanel.hidden = true;
    for (const item of [idHandle, idVideo, idQr, idLink, inviteEmail, ...idActions]) item.hidden = true;
    for (const button of idActions) button.disabled = false;
  }

  function openContactPanel(message) {
    closeToolForms();
    closePhoto();
    closeContactCard();
    contactSession = {card: null, thread: state.thread, scanTimer: null};
    idPanel.hidden = false;
    idStatus.textContent = message;
    return contactSession;
  }

  function drawContactQr(makeQr, link) {
    const qr = makeQr(0, 'M');
    qr.addData(link);
    qr.make();
    const count = qr.getModuleCount();
    const moduleSize = 5;
    idQr.width = idQr.height = (count + 8) * moduleSize;
    const context = idQr.getContext('2d');
    if (!context) throw new Error('Use the contact link to share your Simo ID.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, idQr.width, idQr.height);
    context.fillStyle = '#111';
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        if (qr.isDark(row, column)) context.fillRect((column + 4) * moduleSize, (row + 4) * moduleSize, moduleSize, moduleSize);
      }
    }
    idQr.hidden = false;
  }

  async function showMyContactCard() {
    if (!state.open || highlightHandleSetup()) return;
    const current = openContactPanel('Getting your Simo ID…');
    el('simoConnectIdClose').focus();
    try {
      const {card} = await api('contact-card', {});
      if (contactSession !== current) return;
      current.card = card;
      idHandle.textContent = '@' + card.handle;
      idHandle.hidden = false;
      idLink.href = contactLink(card.id);
      idLink.removeAttribute('target');
      idLink.textContent = 'Open my Simo ID';
      idLink.hidden = idCopy.hidden = false;
      idShare.hidden = !current.thread;
      idStatus.textContent = current.thread ? 'Share this card in the current conversation.' : 'Show the QR code or copy your contact link.';
      const makeQr = await loadQrLibrary('qrcode', 'qrcode-generator-1.4.4.js');
      if (contactSession === current) drawContactQr(makeQr, idLink.href);
    } catch (error) {
      if (contactSession === current) idStatus.textContent = error.message;
    }
  }

  async function showContactCard(id) {
    const current = openContactPanel('Looking up this Simo ID…');
    el('simoConnectIdClose').focus();
    try {
      const {card} = await api('contact-card?id=' + encodeURIComponent(id));
      if (contactSession !== current) return;
      current.card = card;
      idHandle.textContent = '@' + card.handle;
      idHandle.hidden = false;
      idStatus.textContent = card.own ? 'This is your Simo ID.' : 'Choose what you want to do with this contact.';
      idSave.hidden = idMessage.hidden = idCall.hidden = card.own;
      return true;
    } catch (error) {
      if (contactSession !== current) return false;
      idStatus.textContent = error.message;
      return error.status === 404;
    }
  }

  async function scanContactCard() {
    if (!state.open || highlightHandleSetup()) return;
    if (!state.handle) {
      info('Sign in and save your Simo handle before scanning.');
      return;
    }
    const current = openContactPanel('Opening QR scanner…');
    el('simoConnectIdClose').focus();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable. Ask for the Simo ID link instead.');
      const decode = await loadQrLibrary('jsQR', 'jsqr-1.4.0.js');
      if (contactSession !== current) return;
      const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false});
      if (contactSession !== current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      idVideo.srcObject = stream;
      idVideo.hidden = false;
      await idVideo.play();
      if (contactSession !== current) return;
      idStatus.textContent = 'Point your camera at a Simo ID QR code.';
      const frame = document.createElement('canvas');
      const context = frame.getContext('2d', {willReadFrequently: true});
      if (!context) throw new Error('QR scanning is unavailable. Ask for the Simo ID link.');
      function scanFrame() {
        if (contactSession !== current) return;
        try {
          if (idVideo.videoWidth && idVideo.videoHeight) {
            const scale = Math.min(1, 640 / Math.max(idVideo.videoWidth, idVideo.videoHeight));
            frame.width = Math.max(1, Math.round(idVideo.videoWidth * scale));
            frame.height = Math.max(1, Math.round(idVideo.videoHeight * scale));
            context.drawImage(idVideo, 0, 0, frame.width, frame.height);
            const pixels = context.getImageData(0, 0, frame.width, frame.height);
            const read = decode(pixels.data, frame.width, frame.height, {inversionAttempts: 'attemptBoth'});
            if (read) {
              const id = parseContactLink(read.data);
              if (id) {
                showContactCard(id);
                return;
              }
              idStatus.textContent = 'That QR code is not a Simo ID. Try a Simo contact card.';
            }
          }
          current.scanTimer = setTimeout(scanFrame, 150);
        } catch {
          closeContactCard();
          info('The QR scanner stopped. Try reopening it or use the Simo ID link.');
        }
      }
      scanFrame();
    } catch (error) {
      if (contactSession !== current) return;
      idVideo.srcObject?.getTracks().forEach(track => track.stop());
      idVideo.srcObject = null;
      idVideo.hidden = true;
      idStatus.textContent = error.name === 'NotAllowedError' ? 'Allow camera access, or open the Simo ID link.' : error.message;
    }
  }

  async function runContactAction(button, action) {
    const current = contactSession;
    if (!current?.card || button.disabled || button.hidden) return;
    const available = idActions.filter(control => !control.hidden);
    for (const control of available) control.disabled = true;
    try {
      await action(current);
    } catch (error) {
      if (contactSession === current) idStatus.textContent = error.message;
    } finally {
      if (contactSession === current) for (const control of available) control.disabled = false;
    }
  }

  el('simoConnectInvite').onclick = async () => {
    if (highlightHandleSetup()) return;
    const current = openContactPanel('Getting your invite link…');
    el('simoConnectIdClose').focus();
    try {
      const {card} = await api('contact-card', {});
      if (contactSession !== current) return;
      current.card = card;
      idLink.href = new URL('/invite/' + card.id, location.origin).href;
      idLink.target = '_blank';
      idLink.rel = 'noopener';
      idLink.textContent = 'Preview invite';
      idLink.hidden = idCopy.hidden = inviteEmail.hidden = false;
      idStatus.textContent = 'Copy your invite link to share by text, or open it in an email draft.';
      inviteEmail.href = 'mailto:?subject=' + encodeURIComponent('Connect with me on Simo')
        + '&body=' + encodeURIComponent('Join me on Simo Connect: ' + idLink.href);
    } catch (error) {
      if (contactSession === current) idStatus.textContent = error.message;
    }
  };

  el('simoConnectMyId').onclick = showMyContactCard;
  el('simoConnectScanId').onclick = scanContactCard;
  el('simoConnectIdClose').onclick = () => {
    closeContactCard();
    el('simoConnectTools').focus({preventScroll: true});
  };
  idCopy.onclick = () => runContactAction(idCopy, async current => {
    try {
      await navigator.clipboard.writeText(idLink.href);
      if (contactSession === current) idStatus.textContent = 'Contact link copied.';
    } catch {
      if (contactSession === current) idStatus.textContent = 'Use your browser’s Copy link address option on the link.';
    }
  });
  idShare.onclick = () => runContactAction(idShare, async current => {
    if (!current.card.own || !current.thread || current.thread !== state.thread) return;
    await api('messages', {thread: current.thread, body: contactLink(current.card.id)});
    if (contactSession !== current) return;
    idStatus.textContent = 'Simo ID shared in this conversation.';
    await loadMessages();
    await notificationPoll();
  });
  idSave.onclick = () => runContactAction(idSave, async current => {
    await api('contacts', {contact_id: current.card.id});
    if (contactSession !== current) return;
    idStatus.textContent = 'Contact saved.';
    window.dispatchEvent(new CustomEvent('simo-connect:contacts-changed'));
    await loadContacts();
  });
  idMessage.textContent = 'Send a message';
  idMessage.onclick = () => runContactAction(idMessage, async current => {
    if (highlightHandleSetup()) return;
    const {thread} = await api('threads', {kind: 'direct', contact_id: current.card.id});
    if (contactSession !== current) return;
    if (!state.threads.some(entry => entry.id === thread.id)) state.threads.unshift(thread);
    closeContactCard();
    await select(thread.id);
    el('simoConnectBody').focus();
  });
  idCall.onclick = () => runContactAction(idCall, current => {
    window.dispatchEvent(new CustomEvent('simo-connect:open-call', {
      detail: {handle: current.card.handle, contactId: current.card.id}
    }));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && contactSession && !contactSession.card) closeContactCard();
  });

  let openingPendingCard = false;
  const openPendingContactCard = () => {
    if (location.pathname !== '/' || openingPendingCard) return;
    const page = new URL(location.href);
    const action = page.searchParams.get('simo_invite_action');
    if (action === 'signup' || action === 'login') page.searchParams.delete('simo_invite_action');
    const incomingId = parseContactLink(page.href);
    const signedIn = Boolean((window.__SIMO_ACCOUNT_CONTEXT__ || window.SIMO_BOOT)?.loggedIn);
    let pendingId = incomingId;
    try {
      if (incomingId) sessionStorage.setItem(pendingContactKey, incomingId);
      else pendingId = sessionStorage.getItem(pendingContactKey);
    } catch {}
    if (!signedIn && incomingId && (action === 'signup' || action === 'login')) {
      if (!window.__SIMO_ACCOUNT_CONTEXT__) return;
      history.replaceState(history.state, '', page.pathname + page.search + page.hash);
      document.getElementById(action === 'signup' ? 'signupBtn' : 'loginBtn')?.click();
      return;
    }
    if (signedIn && cardIdPattern.test(pendingId || '')) {
      openingPendingCard = true;
      window.dispatchEvent(new CustomEvent('simo-connect:panel-open', {detail: {panel: 'messages'}}));
      open().then(() => showContactCard(pendingId)).then(resolved => {
        if (!resolved) return;
        try { sessionStorage.removeItem(pendingContactKey); } catch {}
        if (incomingId) history.replaceState(history.state, '', page.pathname + page.search);
      }).finally(() => { openingPendingCard = false; });
    }

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
  } else {
    const mic = el('simoConnectMic');
    mic.disabled = true;
    mic.title = 'Dictation is unavailable in this browser.';
  }
  const toolsToggle = el('simoConnectTools');
  const toolsMenu = el('simoConnectToolMenu');
  const pinnedTools = el('simoConnectShortcuts');
  const menuTools = el('simoConnectMenuActions');
  const toolOptions = el('simoConnectToolOptions');
  const attachTool = el('simoConnectAttach');
  const groupTool = el('simoConnectGroupTool');
  const attachmentForm = el('simoConnectAttachment');
  const groupForm = el('simoConnectGroupOptions');
  const shortcuts = [
    ['attach', attachTool],
    ['photo', cameraButton],
    ['dictate', el('simoConnectMic')],
    ['invite', el('simoConnectInvite')],
    ['my-id', el('simoConnectMyId')],
    ['scan-id', el('simoConnectScanId')],
    ['group', groupTool]
  ];
  const account = String(window.SIMO_BOOT?.email || '').trim().toLowerCase();
  const extensionView = document.body.hasAttribute('data-connect-view');
  const shortcutKey = extensionView ? 'simo_connect_extension_shortcuts_v1' : 'simo_connect_shortcuts_v1:' + (account || 'guest');
  let selectedTools = new Set(extensionView ? [] : ['attach']);
  let minimizeShortcuts = false;
  if (extensionView) {
    try { minimizeShortcuts = localStorage.getItem(shortcutKey + ':minimized') === 'true'; } catch {}
    const row = document.createElement('label');
    row.className = 'sc-minimize-shortcuts';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = minimizeShortcuts;
    toggle.addEventListener('change', () => {
      minimizeShortcuts = toggle.checked;
      renderShortcuts();
      try { localStorage.setItem(shortcutKey + ':minimized', String(minimizeShortcuts)); } catch {}
    });
    row.append(toggle, ' Minimize pinned shortcuts');
    el('simoConnectCustomize').before(row);
  }
  try {
    const saved = JSON.parse(localStorage.getItem(shortcutKey));
    if (Array.isArray(saved)) selectedTools = new Set(saved);
  } catch {}

  function renderShortcuts() {
    for (const [key, control] of shortcuts) {
      const destination = !minimizeShortcuts && selectedTools.has(key) ? pinnedTools : menuTools;
      destination.append(control);
    }
    menuTools.hidden = !menuTools.childElementCount;
    if (extensionView) pinnedTools.hidden = !pinnedTools.childElementCount;
  }

  for (const [key, control] of shortcuts) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedTools.has(key);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedTools.add(key);
      else selectedTools.delete(key);
      renderShortcuts();
      try {
        localStorage.setItem(shortcutKey, JSON.stringify([...selectedTools]));
      } catch {}
    });
    label.append(checkbox, control.textContent);
    toolOptions.append(label);
  }
  renderShortcuts();

  function closeToolsMenu() {
    toolsMenu.hidden = true;
    toolsToggle.setAttribute('aria-expanded', 'false');
    el('simoConnectCustomize').open = false;
  }

  function focusTool(control) {
    (toolsMenu.hidden && toolsMenu.contains(control) ? toolsToggle : control).focus({preventScroll: true});
  }

  function closeToolForms() {
    attachmentForm.hidden = groupForm.hidden = true;
    attachTool.setAttribute('aria-expanded', 'false');
    groupTool.setAttribute('aria-expanded', 'false');
  }

  function toggleToolForm(control, form, input) {
    const open = form.hidden;
    closeToolForms();
    if (!open) return;
    closePhoto();
    closeContactCard();
    form.hidden = false;
    control.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  toolsToggle.onclick = () => {
    if (!toolsMenu.hidden) return closeToolsMenu();
    toolsMenu.hidden = false;
    toolsToggle.setAttribute('aria-expanded', 'true');
  };
  attachTool.onclick = () => {
    if (!state.thread) {
      info('Choose a conversation first.');
      return;
    }
    toggleToolForm(attachTool, attachmentForm, el('simoConnectFile'));
  };
  groupTool.onclick = () => {
    if (highlightHandleSetup()) return;
    toggleToolForm(groupTool, groupForm, el('simoConnectRecipients'));
  };
  for (const [, control] of shortcuts) {
    control.addEventListener('click', () => {
      if (toolsMenu.hidden || !toolsMenu.contains(control)) return;
      closeToolsMenu();
      if (toolsMenu.contains(document.activeElement) || document.activeElement === document.body) toolsToggle.focus({preventScroll: true});
    }, true);
  }
  toolsMenu.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeToolsMenu();
    toolsToggle.focus({preventScroll: true});
  });
  window.addEventListener('simo:account-context', () => queueMicrotask(openPendingContactCard));
  openPendingContactCard();

  // Notifications are initialized without showing a stale-message popup on page load.
  notificationPoll();scheduleNotifications();
  window.addEventListener('pagehide',()=>{close();if(state.notificationTimer)clearInterval(state.notificationTimer);});
})();
