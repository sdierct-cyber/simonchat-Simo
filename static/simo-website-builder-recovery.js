// SIMO OCT 4 RC11 — standalone context resolution + subject-locked imagery
// SIMO OCT 4 FINAL FOUNDATION RC10 — website ownership/context/free UX
/* SIMO WEBSITE BUILDER 6.7 — RELEASE-CANDIDATE BACKEND-AI PROJECT PIPELINE
   One frontend owner for prompt routing, editor, save, library, preview, download, and publish.
   Normal generation and natural-language editing are backend-owned. Legacy local rendering
   remains migration-only and is not exposed as a public generation path.
*/
(function(){
  'use strict';
  if (window.__SIMO_WEBSITE_BUILDER_50_CLEAN_OWNER__) return;
  window.__SIMO_WEBSITE_BUILDER_50_CLEAN_OWNER__ = true;
  window.__SIMO_DISABLE_LEGACY_WEBSITE_GENERATOR__ = true;
  window.__SIMO_R1060Z89_WEBSITE_ROUTER_GUARD__ = true;

  var VERSION = 'Simo Website Builder 10.34 RC Account + Mode Coordination';
  var LIB_KEY = 'simo_website_builder_library_v6_exact';
  var ACTIVE_KEY = 'simo_website_builder_active_v6_exact';
  var DRAFT_KEY = 'simo_website_builder_draft_v6_exact';
  var MIGRATION_KEY = 'simo_website_builder_migration_v63';
  var SCHEMA_VERSION = 3;
  var LEGACY_LIBRARY_KEYS = ['simo_builder_library_v5_1_builder_first','simo_builder_library_v4_clean_architecture','simo_builder_library_v4','simo_builder_library_v3','simo_builder_library_v2','simo_builder_library_v1'];

  function accountContext(){
    var c=window.__SIMO_ACCOUNT_CONTEXT__||{};
    var boot=window.SIMO_BOOT||{};
    var logged=(typeof c.loggedIn==='boolean')?c.loggedIn:!!boot.loggedIn;
    var pro=(typeof c.pro==='boolean')?c.pro:!!boot.pro;
    return {loggedIn:logged,pro:pro,accountOwned:!!(logged&&pro),scope:clean(c.scope||((logged&&pro)?'pro_account':'guest_free'))};
  }
  function scopedStorageKey(base){ var c=accountContext(); return base+'__'+(c.accountOwned?(c.scope||'pro_account'):'guest_free'); }
  function libKey(){ return scopedStorageKey(LIB_KEY); }
  function activeKey(){ return scopedStorageKey(ACTIVE_KEY); }
  function draftKey(){ return scopedStorageKey(DRAFT_KEY); }
  function migrationKey(){ return scopedStorageKey(MIGRATION_KEY); }

  function $(id){ return document.getElementById(id); }
  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function low(v){ return clean(v).toLowerCase(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];}); }
  function uid(prefix){ return (prefix||'simo_web5')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
  function parse(raw,fallback){ try { return JSON.parse(raw); } catch(e){ return fallback; } }
  function arr(raw){ var v=parse(raw,[]); return Array.isArray(v) ? v : []; }
  function setJSON(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)); return true; }catch(e){ console.error('SIMO storage write failed:', key, e); return false; } }
  function getJSON(key,fallback){ try{return parse(localStorage.getItem(key),fallback);}catch(e){return fallback;} }
  function cloneProject(project){
    if (!project || typeof project !== 'object') return null;
    try { return JSON.parse(JSON.stringify(project)); } catch(e) { return project; }
  }
  function postJSON(url,payload,timeoutMs){
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    timeoutMs=Math.max(30000,Number(timeoutMs||180000));
    var timer = window.setTimeout(function(){ try{ if(controller) controller.abort(); }catch(_){} }, timeoutMs);
    return fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{}),signal:controller?controller.signal:undefined})
      .then(function(r){
        return r.json().catch(function(){return {};}).then(function(data){
          if(!r.ok || !data || data.ok===false){ var detail=data&&data.detail?(' — '+data.detail):''; throw new Error(((data&&data.error)||('Request failed: '+r.status))+detail); }
          return data;
        });
      })
      .catch(function(err){
        if(err && err.name==='AbortError') throw new Error('Simo is taking longer than the allowed processing window. The current website was kept unchanged; please retry once.');
        throw err;
      })
      .finally(function(){ window.clearTimeout(timer); });
  }
  function fetchJSON(url){
    return fetch(url,{method:'GET',credentials:'same-origin'}).then(function(r){
      return r.json().catch(function(){return {};}).then(function(data){
        if(!r.ok || !data || data.ok===false) throw new Error((data&&data.error)||('Request failed: '+r.status));
        return data;
      });
    });
  }
  function copyText(value){
    value=String(value||'');
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    var ta=document.createElement('textarea'); ta.value=value; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return Promise.resolve();
  }
  function chat(){ return $('chatMessages') || $('chat') || document.querySelector('.chat-wrap') || document.body; }
  function input(){ return $('chatInput') || document.querySelector('textarea,input[type="text"]'); }
  function clearComposer(){ var fields=[]; var primary=$('chatInput'); if(primary) fields.push(primary); Array.prototype.forEach.call(document.querySelectorAll('.composer-wrap textarea,.composer-wrap input[type="text"]'),function(el){if(fields.indexOf(el)<0)fields.push(el);}); fields.forEach(function(el){try{el.value='';el.textContent='';el.removeAttribute('value');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){}}); }
  function clearSubmittedPrompt(submitted){
    submitted=clean(submitted); if(!submitted)return;
    window.__SIMO_LAST_SUBMITTED_WEBSITE_PROMPT__=submitted;
    window.__SIMO_LAST_SUBMITTED_WEBSITE_PROMPT_AT__=Date.now();
    function sweep(){
      var fields=[]; var primary=$('chatInput'); if(primary)fields.push(primary);
      Array.prototype.forEach.call(document.querySelectorAll('.composer-wrap textarea,.composer-wrap input[type="text"]'),function(el){if(fields.indexOf(el)<0)fields.push(el);});
      fields.forEach(function(el){
        try{
          var current=clean(el.value||el.textContent||'');
          if(!current || current===submitted){
            el.value=''; el.textContent=''; el.removeAttribute('value');
            el.dispatchEvent(new Event('input',{bubbles:true}));
            el.dispatchEvent(new Event('change',{bubbles:true}));
          }
        }catch(_){ }
      });
    }
    sweep();
    [0,40,120,250,500,900,1500,2500,4000,7000,12000].forEach(function(ms){window.setTimeout(sweep,ms);});
    try{window.requestAnimationFrame(sweep);}catch(_){ }
  }
  function status(msg){ var el=$('loadingHint') || document.querySelector('[data-simo-status],.status,.loading-hint'); if(el) el.textContent=msg||'Ready.'; }
  function scrollChat(){ try{ var c=document.querySelector('.chat-wrap') || $('chat') || document.scrollingElement; c.scrollTop=c.scrollHeight||999999; }catch(e){} }
  function purgeBuilderDesignSuggestions(root){
    root=root||document;
    try{Array.prototype.forEach.call(root.querySelectorAll('button,a'),function(el){var txt=clean(el.textContent);if(/^design suggestions$/i.test(txt)&&el.closest('.simo-builder-card,.web5-card')){el.style.display='none';el.setAttribute('aria-hidden','true');}});}catch(_){}
  }
  function hash(str){ var h=2166136261; str=String(str||''); for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);} return Math.abs(h>>>0); }
  function pick(a,seed,off){ return a[(Math.abs(seed)+(off||0))%a.length]; }
  function titleCase(v){ return clean(v).replace(/\b\w/g,function(m){return m.toUpperCase();}); }
  function slug(v){ return low(v).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'simo-website'; }

  function stripPromptWords(t){
    return clean(t).replace(/^(please\s+)?(can you\s+|could you\s+|would you\s+|i need\s+|i want\s+)?/i,'')
      .replace(/^(make me|make|build me|build|create me|create|design me|design|generate|show me|give me|draft|put together)\s+/i,'')
      .replace(/\b(a|an|the|for me|please)\b/gi,' ')
      .replace(/\b(beautiful|premium|modern|professional|ready\s*to\s*publish|publish\s*ready|editable|website|web\s*site|webpage|web\s*page|landing\s*page|homepage|home\s*page|business\s*site|site|page)\b/gi,' ')
      .replace(/\s+/g,' ').trim(' .,-');
  }
  function fixTypos(s){ return clean(s).replace(/\blandscapind\b/ig,'landscaping').replace(/\blanscaping\b/ig,'landscaping').replace(/\bbrik\b/ig,'brick').replace(/\bpavng\b/ig,'paving').replace(/\bresturant\b/ig,'restaurant').replace(/\bplumming\b/ig,'plumbing').replace(/\bphyscial\b/ig,'physical'); }
  function subjectFromPrompt(prompt){ var s=fixTypos(stripPromptWords(prompt)); return s ? s.slice(0,90) : 'local business'; }
  function isWebsiteIntent(text){
    var t=low(text); if(!t)return false;
    var asset=/\b(website|web\s*site|webpage|web\s*page|landing\s*page|homepage|home\s*page|business\s*site|storefront|online\s*store|ecommerce|e-commerce|web\s*app|app\s*screen|portal|marketplace|booking\s*site|dashboard|tool)\b/.test(t);
    var action=/\b(make|build|create|design|generate|show|give|need|want|draft|put together)\b/.test(t);
    var edit=/\b(change|edit|update|replace|try another|another version|different version|make it|more premium|more luxury|colors|theme|image|headline|section|pricing|faq|reviews|contact|publish|preview|save|download)\b/.test(t);
    if(asset&&(action||edit)) return true;
    return !!window.__SIMO_WEBSITE_BUILDER_MODE_ACTIVE__ && !!t;
  }

  function websitePromptNeedsContext(prompt){
    var t=low(prompt);
    return /\b(that|this|the)\s+(business|idea|company|brand|service|product)\b/.test(t) ||
      /\b(for it|for that|for this|based on that|based on this)\b/.test(t);
  }

  function recentConversationContext(){
    try{
      var root=$('chatMessages') || $('chat');
      if(!root) return '';
      var rows=Array.prototype.slice.call(root.querySelectorAll('.msg-row'));
      var parts=[];
      for(var i=Math.max(0,rows.length-8);i<rows.length;i++){
        var row=rows[i];
        if(!row) continue;
        if(row.querySelector && row.querySelector('.web5-card,.simo-builder-card,.simo-vc-card')) continue;
        var txt=clean(row.textContent||'');
        if(!txt || txt.length<2) continue;
        if(/Simo Website Builder|Website generation stopped safely|SIMO REAL IMAGE REQUIRED/i.test(txt)) continue;
        if(txt.length>900) txt=txt.slice(0,900);
        var role=row.classList && row.classList.contains('msg-user') ? 'User' : 'Simo';
        parts.push(role+': '+txt);
      }
      return parts.slice(-6).join('\n');
    }catch(_){ return ''; }
  }

  function lastSimoContextLine(ctx){
    var lines=String(ctx||'').split(/\n+/).filter(function(line){return /^Simo:\s*/i.test(line);});
    return clean(lines.length ? lines[lines.length-1].replace(/^Simo:\s*/i,'') : '');
  }

  function inferBusinessSubjectFromContext(ctx){
    var text=lastSimoContextLine(ctx);
    if(!text) return '';

    var patterns=[
      /\b(?:consider\s+)?(?:starting|start|try)\s+(?:an?\s+)?([a-z0-9][a-z0-9&'\/\-\s]{1,70}?\b(?:business|agency|service|store|shop|studio|company|brand))\b/i,
      /\bhow\s+about\s+(?:starting\s+)?(?:an?\s+)?([a-z0-9][a-z0-9&'\/\-\s]{1,70}?\b(?:business|agency|service|store|shop|studio|company|brand))\b/i,
      /\b(?:an?\s+)([a-z0-9][a-z0-9&'\/\-\s]{1,60}?\b(?:business|agency|service|store|shop|studio|company|brand))\b/i
    ];

    for(var i=0;i<patterns.length;i++){
      var m=text.match(patterns[i]);
      if(m && clean(m[1])){
        return clean(m[1]).replace(/^(a|an)\s+/i,'').replace(/\s+/g,' ').slice(0,90);
      }
    }
    return '';
  }

  function subjectImageDirection(subject,ctx){
    var s=low(subject+' '+ctx);
    if(/print[\s-]*on[\s-]*demand|custom\s+merch|merchandise/.test(s)){
      return 'Use only print-on-demand merchandise imagery: custom t-shirts, hoodies, mugs, phone cases, product mockups, printing/heat-press production, packaging, and branded ecommerce products. Do not use kitchens, plumbing, faucets, home-repair, or unrelated service imagery.';
    }
    if(/dropship|ecommerce|e-commerce|online store/.test(s)){
      return 'Use ecommerce and dropshipping imagery: curated products, branded packages, fulfillment/shipping, online storefront product displays, and customer orders. Avoid unrelated home-service imagery.';
    }
    if(/virtual assistant|remote assistant|administrative assistant/.test(s)){
      return 'Use virtual-assistant imagery: professional remote workspace, laptop, scheduling/calendar, inbox management, client calls, and organized digital workflows. Avoid unrelated trades or home-service imagery.';
    }
    return 'Every hero, card, gallery, and background image must visibly match the exact business subject. Do not use a generic service, kitchen, plumbing, construction, or unrelated stock image unless that is actually the subject.';
  }

  function resolveWebsitePrompt(prompt){
    prompt=clean(prompt);
    if(!websitePromptNeedsContext(prompt)) return prompt;

    var ctx=recentConversationContext();
    if(!ctx) return prompt;

    var subject=inferBusinessSubjectFromContext(ctx);
    var simoContext=lastSimoContextLine(ctx);

    if(subject){
      return 'Build a premium, publish-ready website for a '+subject+'.\n'+
        'This is the resolved subject from the immediately preceding Simo conversation. Do not title the site "For That Business", "That Business", or any other placeholder reference.\n'+
        'Business context: '+simoContext+'\n'+
        subjectImageDirection(subject,simoContext)+'\n'+
        'Keep the entire page—headline, offers, pricing/services, testimonials, FAQ, CTA, and imagery—specific to '+subject+'.';
    }

    return 'Build a premium, publish-ready website for the exact business described in the recent conversation below.\n'+
      'Do not treat the words "that business" or "this idea" as the subject. Resolve them from the conversation first.\n'+
      '[SIMO RECENT CONVERSATION CONTEXT]\n'+ctx+'\n'+
      subjectImageDirection('',ctx);
  }

  function freeWebsiteGateCard(){
    var c=accountContext();
    var action=c.loggedIn ? 'Upgrade to Pro' : 'Sign in or upgrade';
    return '<div class="web5-card"><style>'+appCss()+'</style>'+
      '<div style="padding:18px;border:1px solid rgba(56,189,248,.38);border-radius:16px;background:rgba(8,47,73,.22)">'+
      '<b>I understand the website you want.</b>'+
      '<p style="line-height:1.55">Full Website Builder generation is a Pro creation feature, so Simo did not make a paid provider call on this Free/Guest request. '+esc(action)+' when you want me to generate the complete site.</p>'+
      '<p style="line-height:1.55">You can still plan it with me in Free Chat now — Home, About, Services, Pricing, Testimonials, FAQ, Contact, and the copy/offer for the business we were discussing.</p>'+
      '</div></div>';
  }

  // Local template generation was removed from the release candidate.
  // Legacy projects can still be reopened because their exact saved HTML is preserved.

  function isFullHtml(html){ return /<(?:!doctype\s+html|html\b)/i.test(String(html||'')) && /<\/html>/i.test(String(html||'')); }
  function isDesignWorkspaceItem(item){
    item=item&&typeof item==='object'?item:{};
    var sourceText=String(item.sourceText||item.source_text||'');
    var html=String(item.html||item.canonicalHtml||item.previewHtml||'');
    var tags=Array.isArray(item.tags)?item.tags.map(low):[];
    var marker=low([
      item.kind,item.type,item.owner,item.source,item.mode,item.projectType,item.builderType,
      item.notes,item.title,item.projectTitle,item.workspaceSubject,sourceText,tags.join(' ')
    ].join(' '));

    // Strong Design Workspace ownership markers always win, even if an older
    // cache accidentally relabeled the item as "website".
    var hasWorkspaceData = !!(
      item.workspaceData &&
      typeof item.workspaceData === 'object' &&
      Object.keys(item.workspaceData).length
    );
    if(hasWorkspaceData || item.isDesignWorkspace===true) return true;
    if(/\[simo_clean_workspace_saved\]|\[simo_visual_concept\]|\[simo_visual_project\]/i.test(sourceText)) return true;
    if(/saved simo workspace design|saved visual concept|visual design workspace/i.test(html)) return true;
    if(/\bdesign_workspace\b|\bdesign workspace\b|\bworkspace design\b|\bsimo_visual_project\b|\bvisual concept\b|\bproduct design\b|\bgenerated image\b|\bimage concept\b/.test(marker)) return true;

    var designTagHits=0;
    ['visual','design','workspace','concept'].forEach(function(tag){
      if(tags.indexOf(tag)>=0) designTagHits++;
    });
    if(designTagHits>=2 && !/\[simo_website_builder_saved\]/i.test(sourceText)) return true;

    return false;
  }
  function projectFromAI(prompt,data,existing){
    if(!data || !isFullHtml(data.html)) throw new Error('Simo did not return a complete website document.');
    var now=new Date().toISOString();
    var aiSubject=clean(data.subject)||clean(data.title)||subjectFromPrompt(prompt);
    var project=normalizeExactProject({
      id:(existing&&existing.id)||uid('simo_web6'),kind:'website',type:'website',owner:'simo_webbuilder_6_exact',
      schemaVersion:SCHEMA_VERSION,origin:'ai_html',generationSource:clean(data.source||data.phase||'simo-premium-website'),
      title:clean(data.title)||titleCase(aiSubject),subject:aiSubject,prompt:prompt,
      html:String(data.html),imageUrls:data.image_urls||data.imageUrls||[],variant:(existing&&existing.variant)||0,
      createdAt:(existing&&existing.createdAt)||now,updatedAt:now,saved:false
    });
    if(!project) throw new Error('Simo could not normalize the generated website project.');
    sealCanonical(project, project.html, data&&data.canonical_hash);
    return project;
  }
  function persistDraft(project){ register(project); setJSON(draftKey(),project); setJSON(activeKey(),project); return project; }
  function loadingCard(message){ return '<div class="web5-card simo-generation-card"><style>'+appCss()+'</style><div style="padding:18px"><div class="simo-edit-progress-row"><span class="simo-spinner"></span><b>Simo is building your website…</b></div><p data-simo-generation-text style="margin:10px 0 0;color:#c7d4e7">'+esc(message||'Understanding your request and planning the website…')+'</p><div class="simo-progress-track" style="display:block!important"><div class="simo-progress-bar"></div></div><div class="simo-progress-meta">Working now • <b data-simo-generation-elapsed>0:00</b> elapsed. You can keep this page open — Simo has not frozen.</div></div></div>'; }
  function startGenerationProgress(row){
    if(!row)return function(){};
    var text=row.querySelector('[data-simo-generation-text]');
    var elapsed=row.querySelector('[data-simo-generation-elapsed]');
    var started=Date.now(), clock=null, timers=[];
    function fmt(ms){var sec=Math.max(0,Math.floor(ms/1000)),min=Math.floor(sec/60);sec=sec%60;return min+':'+String(sec).padStart(2,'0');}
    clock=window.setInterval(function(){if(elapsed)elapsed.textContent=fmt(Date.now()-started);},1000);
    [[7000,'Planning the page structure, tone, and visitor journey…'],[18000,'Creating subject-matched imagery and visual direction…'],[36000,'Building the sections, content, and useful interactions…'],[60000,'Checking the whole page against the Razor benchmark…'],[90000,'Still working — finishing images and the full preview…'],[130000,'Simo is still working on your request. No need to click Send again…']].forEach(function(item){timers.push(window.setTimeout(function(){if(text)text.textContent=item[1];},item[0]));});
    return function(){try{if(clock)window.clearInterval(clock);}catch(_){} timers.forEach(function(id){try{window.clearTimeout(id);}catch(_){}});};
  }
  function errorCard(message){ return '<div class="web5-card"><style>'+appCss()+'</style><div style="padding:18px;border:1px solid rgba(248,113,113,.45);border-radius:16px;background:rgba(127,29,29,.2)"><b>Website generation stopped safely.</b><p>'+esc(message)+'</p><p>No generic fallback website replaced your request.</p></div></div>'; }

  function normalizeExactProject(item){
    if (!item || typeof item !== 'object' || isDesignWorkspaceItem(item)) return null;
    var html = String(item.canonicalHtml || item.html || item.websiteHtml || item.previewHtml || item.builderHtml || '');
    if (!isFullHtml(html)) return null;
    var project = cloneProject(item) || {};
    project.id = clean(project.id) || uid('simo_web6');
    project.kind = 'website';
    project.type = 'website';
    project.owner = 'simo_webbuilder_6_exact';
    project.schemaVersion = SCHEMA_VERSION;
    project.origin = clean(project.origin) || (project.blueprint ? 'legacy_blueprint' : 'ai_html');
    project.generationSource = clean(project.generationSource || project.source || (project.origin==='ai_html'?'simo-premium-website':'legacy-local-renderer'));
    project.title = clean(project.title || (project.blueprint && project.blueprint.brand) || project.subject || 'Saved Website');
    project.subject = clean(project.subject || (project.blueprint && project.blueprint.subject) || subjectFromPrompt(project.prompt || project.title));
    project.prompt = clean(project.prompt || project.sourceText || project.subject || project.title);
    project.html = html;
    if(!isFullHtml(project.canonicalHtml||'')) project.canonicalHtml=html;
    project.previewHtml=project.canonicalHtml; project.builderHtml=project.canonicalHtml;
    project.canonicalHash=clean(project.canonicalHash)||hash(project.canonicalHtml);
    project.imageUrls = Array.isArray(project.imageUrls) ? project.imageUrls : (Array.isArray(project.image_urls) ? project.image_urls : []);
    project.createdAt = project.createdAt || new Date().toISOString();
    project.updatedAt = project.updatedAt || project.createdAt;
    project.saved = project.saved !== false;
    return project;
  }
  function fingerprint(project){ return hash(clean(project.title)+'|'+clean(project.prompt)+'|'+String(canonicalHtml(project)||'').replace(/\s+/g,' ').slice(0,1200)); }
  function migrateLegacyProjectsOnce(){
    if(accountContext().accountOwned) return;
    if(getJSON(migrationKey(),null)) return;
    var current=getJSON(libKey(),[]); if(!Array.isArray(current)) current=[];
    var merged=[], seenId={}, seenPrint={};
    function accept(item){
      var p=normalizeExactProject(item); if(!p)return;
      var fp=String(fingerprint(p));
      if(seenId[p.id]||seenPrint[fp])return;
      seenId[p.id]=true; seenPrint[fp]=true; merged.push(p);
    }
    current.forEach(accept);
    LEGACY_LIBRARY_KEYS.forEach(function(key){ var list=getJSON(key,[]); if(Array.isArray(list))list.forEach(accept); });
    setJSON(libKey(),merged);
    setJSON(migrationKey(),{version:SCHEMA_VERSION,at:new Date().toISOString(),count:merged.length});
  }
  function savedProjects(){
    migrateLegacyProjectsOnce();
    var raw = getJSON(libKey(), []);
    if (!Array.isArray(raw)) raw = [];
    var seen = {};
    return raw.map(normalizeExactProject).filter(function(project){
      if (!project || !project.id || seen[project.id]) return false;
      seen[project.id] = true;
      register(project);
      return true;
    });
  }
  function serverWebsiteProjects(items){
    return (Array.isArray(items)?items:[]).map(function(item){
      if(!item || typeof item!=='object') return null;
      if(isDesignWorkspaceItem(item)) return null;
      var kind=low(item.kind||'');
      var type=low(item.type||'');
      var owner=low(item.owner||'');
      var source=low(item.source||'');
      var sourceText=String(item.sourceText||item.source_text||'');
      var tags=Array.isArray(item.tags)?item.tags.map(low):[];
      var explicitWebsite = item.website_builder===true || item.isWebsiteBuilder===true || item.websiteBuilder===true ||
        kind==='website' || kind==='website_builder' || type==='website' || type==='website_builder' || type==='website_builder_html' ||
        owner.indexOf('webbuilder')>=0 || owner.indexOf('website')>=0 || source.indexOf('website')>=0 ||
        /\[SIMO_WEBSITE_BUILDER_SAVED\]/i.test(sourceText) || tags.indexOf('website')>=0 ||
        isFullHtml(item.html||'');
      if(!explicitWebsite) return null;
      return normalizeExactProject(item);
    }).filter(Boolean);
  }
  function publishLibraryCounts(websiteCount,designCount){
    try{
      websiteCount=Math.max(0,Number(websiteCount)||0);
      designCount=Math.max(0,Number(designCount)||0);
      window.__SIMO_ACCOUNT_LIBRARY_COUNTS__={website:websiteCount,design:designCount};
      window.__SIMO_WEBSITE_LIBRARY_COUNT__=function(){return websiteCount;};
      var side=$('builderLibrarySidebarCount'); if(side) side.textContent=String(websiteCount);
      var design=$('designLibrarySidebarCount'); if(design) design.textContent=String(designCount);
      var dash=$('libraryCountValue'); if(dash) dash.textContent=String(websiteCount);
      window.dispatchEvent(new CustomEvent('simo:website-library-count',{detail:{count:websiteCount,designCount:designCount,scope:accountContext().scope}}));
    }catch(_){}
  }
  function syncServerLibrary(){
    if(!accountContext().accountOwned){
      var local=savedProjects();
      publishLibraryCounts(local.length,0);
      return Promise.resolve(local);
    }
    return fetchJSON('/api/library').then(function(data){
      var all=Array.isArray(data&&data.items)?data.items:[];
      var remote=serverWebsiteProjects(all);
      var designCount=all.filter(function(item){return isDesignWorkspaceItem(item);}).length;
      var saved=saveList(remote)||remote;
      publishLibraryCounts(saved.length,designCount);
      return saved;
    });
  }
  function saveList(list){
    var exact = (Array.isArray(list) ? list : []).map(normalizeExactProject).filter(Boolean);
    if (!setJSON(libKey(), exact)) return null;
    var verified = getJSON(libKey(), []);
    if (!Array.isArray(verified) || verified.length !== exact.length) return null;
    try { window.dispatchEvent(new CustomEvent('simo:website-library-updated',{detail:{reason:'web63-canonical-save'}})); } catch(e) {}
    updateCount();
    return exact;
  }
  function showSavedConfirmation(sourceButton, exact){
    status('Saved “'+(exact.title||'website')+'” to Website Builder Library.');
    try {
      if (sourceButton) {
        var original=sourceButton.textContent;
        sourceButton.textContent='Saved ✓';
        sourceButton.disabled=true;
        setTimeout(function(){ sourceButton.textContent=original; sourceButton.disabled=false; },1400);
      }
      var toast=document.createElement('div');
      toast.textContent='Saved to Website Builder Library ✓';
      toast.style.cssText='position:fixed;right:24px;bottom:24px;z-index:2147483647;background:#0f766e;color:white;border:1px solid rgba(255,255,255,.25);border-radius:14px;padding:14px 18px;font-weight:900;box-shadow:0 18px 60px rgba(0,0,0,.45)';
      document.body.appendChild(toast);
      setTimeout(function(){toast.remove();},1800);
    } catch(e) {}
  }
  function saveProject(project, sourceButton){
    var exact = normalizeExactProject(project);
    if (!exact) {
      status('Save failed: no exact website HTML was available.');
      alert('Save failed: the current website HTML was not available.');
      return null;
    }

    // If this exact project ID already exists in the Website Builder Library but
    // the HTML has changed, this is an edited version of a saved site. Fork it
    // to a NEW identity so Save never destroys/replaces the previously saved site.
    var previousId = exact.id;
    var previousSaved = null;
    try {
      var currentSaved = savedProjects();
      for (var si=0; si<currentSaved.length; si++) {
        if (currentSaved[si] && currentSaved[si].id === previousId) {
          previousSaved = currentSaved[si];
          break;
        }
      }
    } catch(e) {}
    var changedFromSaved = !!(
      previousSaved &&
      canonicalHtml(previousSaved) &&
      canonicalHtml(exact) &&
      canonicalHtml(previousSaved) !== canonicalHtml(exact)
    );
    if (changedFromSaved) {
      exact.id = uid('simo_web6');
      exact.versionParentId = previousId;
      exact.createdAt = new Date().toISOString();
      exact.updatedAt = exact.createdAt;
      exact.saved = false;

      // Keep the live editor/project object on the new identity so any later
      // edits/saves continue from the new version rather than falling back to
      // the old saved item's ID.
      if (project && typeof project === 'object') {
        project.id = exact.id;
        project.versionParentId = previousId;
        project.createdAt = exact.createdAt;
        project.updatedAt = exact.updatedAt;
        project.saved = false;
      }

      // If the main dashboard is showing the edited site, move that exact card
      // onto the new project identity too.
      try {
        var dashboardCard = document.querySelector('.web5-card[data-web5-card="'+previousId+'"]');
        if (dashboardCard) replaceCardWithProject(dashboardCard, exact);
      } catch(e) {}
    }

    exact.saved = true;
    exact.updatedAt = new Date().toISOString();
    if (!exact.createdAt) exact.createdAt = exact.updatedAt;
    if (project && typeof project === 'object') {
      project.id = exact.id;
      project.saved = true;
      project.updatedAt = exact.updatedAt;
    }
    register(exact);

    // Active/draft browser cache is convenient, but it must never block a paid
    // user's account-owned save. Large premium websites can exceed localStorage.
    try { setJSON(activeKey(), exact); } catch(e) {}
    try { setJSON(draftKey(), exact); } catch(e) {}

    if(accountContext().accountOwned){
      var originalText = sourceButton ? sourceButton.textContent : '';
      if(sourceButton){
        sourceButton.disabled = true;
        sourceButton.textContent = 'Saving…';
      }
      status('Saving this website to your Pro Account Library…');

      postJSON('/api/library/save', {
        id: exact.id,
        title: exact.title,
        html: exact.html,
        prompt: exact.prompt,
        type: 'website_builder_html',
        kind: 'website',
        owner: 'simo_webbuilder_6_exact',
        website_builder: true,
        sourceText: '[SIMO_WEBSITE_BUILDER_6_7_CANONICAL_AI]',
        tags: ['website','builder','html','publish']
      }, 180000).then(function(){
        // Browser storage is only a best-effort cache for paid users.
        // Do not fail the save if the browser is full.
        try {
          var list = savedProjects().filter(function(item){ return item.id !== exact.id; });
          list.unshift(exact);
          saveList(list);
        } catch(e) {
          console.warn('SIMO Pro local Website Library cache skipped:', e);
        }

        if(sourceButton){
          sourceButton.disabled = false;
          sourceButton.textContent = originalText || 'Save to Library';
        }
        showSavedConfirmation(sourceButton, exact);
        status('Saved to your Pro Account Website Builder Library.');
        try {
          window.dispatchEvent(new CustomEvent('simo:website-library-updated',{
            detail:{reason:'pro-account-cloud-save',id:exact.id}
          }));
        } catch(e) {}
      }).catch(function(err){
        if(sourceButton){
          sourceButton.disabled = false;
          sourceButton.textContent = originalText || 'Save to Library';
        }
        console.warn('SIMO Pro account Website Library save failed:', err);
        status('Website save failed. Your current website is still open and unchanged.');
        alert('Simo could not save this website to your Pro Account Library. The website is still open; please retry once.');
      });

      return exact;
    }

    // Guest / Free remains browser-local, so browser storage is required there.
    var list = savedProjects().filter(function(item){ return item.id !== exact.id; });
    list.unshift(exact);
    if (!saveList(list)) {
      status('Save failed: browser storage did not accept the website.');
      alert('Simo could not save this website in browser storage.');
      return null;
    }
    showSavedConfirmation(sourceButton, exact);
    status('Saved to Guest / Free Local Library in this browser.');
    return exact;
  }
  function register(p){ if(p&&p.id) window.__SIMO_WEB5_PROJECTS__[p.id]=p; }
  function canonicalHtml(project){
    if(!project) return '';
    var html=String(project.canonicalHtml||project.html||'');
    if(isFullHtml(html)) return html;
    return String(project.html||'');
  }
  function sealCanonical(project, html, canonicalHash){
    if(!project) return project;
    html=String(html||project.html||'');
    if(!isFullHtml(html)) return project;
    project.html=html;
    project.canonicalHtml=html;
    project.canonicalHash=clean(canonicalHash)||hash(html);
    project.previewHtml=html;
    project.builderHtml=html;
    project.exactHtml=true;
    return project;
  }
  function previewDocument(html){
    html=String(html||'');
    var base='<base href="'+String(location.origin||'')+'/">';
    if(/<base\b/i.test(html)) return html;
    if(/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i,function(m){return m+base;});
    return html;
  }
  window.__SIMO_WEB5_PROJECTS__ = window.__SIMO_WEB5_PROJECTS__ || {};
  function safeOpenLibrary(){ try { openLibrary(); } catch(err) { console.error('SIMO 6.0 Library open failed:', err); alert('Simo Library could not open: '+(err && err.message ? err.message : err)); } return false; }
  window.SimoWeb5OpenLibrary = safeOpenLibrary;
  function getProject(id){ var live=window.__SIMO_WEB5_PROJECTS__[id]; if(live) return live; var list=savedProjects(); for(var i=0;i<list.length;i++){ if(list[i].id===id) return list[i]; } var active=getJSON(activeKey(),null); return active && (!id || active.id===id) ? normalizeExactProject(active) : null; }


  function writeWebsiteFrame(frame, html){
    if(!frame) return;
    try{
      var old=frame.__simoBlobUrl;
      var url=URL.createObjectURL(new Blob([previewDocument(String(html||''))],{type:'text/html'}));
      frame.__simoBlobUrl=url;
      frame.onload=function(){
        if(old){ try{URL.revokeObjectURL(old);}catch(e){} }
      };
      frame.src=url;
    }catch(err){
      try{ frame.srcdoc=previewDocument(String(html||'')); }catch(e){}
    }
  }


  function miniPreview(p){ return '<iframe title="'+esc((p&&p.title)||'Website preview')+'" sandbox="allow-scripts allow-forms" data-web5-srcdoc="1"></iframe>';
  }
  function hydrateProjectFrame(root, project){
    if(!root||!project)return;
    var frame=root.querySelector('iframe[data-web5-srcdoc="1"]');
    if(frame) writeWebsiteFrame(frame, canonicalHtml(project));
  }
  function appCss(){ return '.web5-card{border:1px solid rgba(56,189,248,.38);background:#0c1424;border-radius:22px;padding:14px;box-shadow:0 24px 80px rgba(0,0,0,.28);max-width:1180px}.web5-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.web5-head small{color:#67e8f9;font-weight:1000;letter-spacing:.12em}.web5-head h2{margin:4px 0;font-size:24px}.web5-head p{margin:0;color:#bdd0e8}.web5-controls{display:flex!important;flex-wrap:wrap;gap:8px;margin:12px 0!important;position:relative;z-index:5}.web5-controls button,.web5-editor button,.web5-lib button{border:1px solid rgba(255,255,255,.24);border-radius:999px;background:linear-gradient(135deg,#38bdf8,#8b5cf6);color:#061018;font-weight:1000;padding:11px 14px;cursor:pointer;box-shadow:0 8px 22px rgba(56,189,248,.14);transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease,filter .14s ease}.web5-controls button:hover,.web5-editor button:hover,.web5-lib button:hover{transform:translateY(-1px);filter:brightness(1.08);box-shadow:0 10px 28px rgba(56,189,248,.24);border-color:rgba(255,255,255,.42)}.web5-controls button:active,.web5-editor button:active,.web5-lib button:active{transform:translateY(0) scale(.985);filter:brightness(.98)}.web5-controls button:first-child{font-size:15px;padding:13px 18px}.web5-controls button:nth-child(n+2),.web5-lib button:nth-child(n+2){background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.08));color:#f8fafc;border-color:rgba(125,211,252,.32);box-shadow:0 6px 18px rgba(0,0,0,.14)}.web5-frame{height:620px;min-height:620px;overflow:hidden;border:1px solid rgba(56,189,248,.5);border-radius:18px;background:#07101f}.web5-frame iframe{width:100%;height:100%;border:0;background:white;display:block}.web5-mini{height:520px;overflow:hidden;border-radius:18px;background:radial-gradient(circle at 78% 24%,var(--a),transparent 22%),linear-gradient(135deg,#07101f,#0f172a 52%,#111827);color:#f8fafc;padding:22px;font-family:Inter,Arial,sans-serif}.mini-nav{height:58px;display:flex;gap:18px;align-items:center;border-bottom:1px solid rgba(255,255,255,.12)}.mini-nav b{font-size:22px;margin-right:auto}.mini-nav span{color:#cbd5e1;font-weight:800}.mini-nav em{font-style:normal;background:linear-gradient(135deg,var(--a),var(--b));color:#061018;border-radius:999px;padding:10px 14px;font-weight:1000}.mini-hero{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:24px;align-items:center;padding:38px 6px}.mini-hero small{color:var(--a);text-transform:uppercase;letter-spacing:.16em;font-weight:1000}.mini-hero h1{font-size:clamp(38px,5vw,64px);line-height:.95;margin:12px 0}.mini-hero p{font-size:17px;color:#dbeafe;max-width:620px}.mini-visual{min-height:260px;border:1px solid rgba(255,255,255,.18);border-radius:30px;background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.04));display:grid;place-content:center;text-align:center;padding:26px;box-shadow:0 24px 70px rgba(0,0,0,.35)}.mini-visual strong{font-size:52px}.mini-visual b{font-size:27px}.mini-visual p{font-size:15px}.mini-strip{display:flex;gap:12px;flex-wrap:wrap}.mini-strip span{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.10);border-radius:999px;padding:10px 13px;font-weight:900}@media(max-width:900px){.mini-hero{grid-template-columns:1fr}.mini-visual{min-height:160px}}.web5-modal{position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(2,6,23,.82);backdrop-filter:blur(14px);display:grid;place-items:center;padding:18px}.web5-editor,.web5-lib{width:min(1450px,98vw);height:min(920px,96vh);background:#0b1220;color:#f8fafc;border:1px solid rgba(255,255,255,.16);border-radius:22px;box-shadow:0 40px 120px rgba(0,0,0,.55);overflow:hidden;display:grid;grid-template-rows:auto 1fr}.web5-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12)}.web5-editor-body{display:grid;grid-template-columns:minmax(0,1fr) 360px;min-height:0}.web5-editor iframe{width:100%;height:100%;border:0;background:white}.web5-panel{border-left:1px solid rgba(255,255,255,.12);padding:14px;overflow:auto;background:#111a2c}.web5-panel textarea,.web5-panel input{width:100%;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:#07101e;color:white;padding:12px;margin:7px 0;font:inherit}.web5-panel textarea{min-height:92px}.web5-panel .stack{display:grid;gap:9px}.web5-lib-body{overflow:auto;padding:16px}.web5-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.web5-lib-card{border:1px solid rgba(255,255,255,.13);background:#131e31;border-radius:18px;padding:12px}.web5-thumb{height:155px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}.web5-thumb iframe{width:720px;height:440px;border:0;transform:scale(.33);transform-origin:top left;pointer-events:none}.web5-close{background:rgba(255,255,255,.08)!important;color:white!important}.web5-empty{border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:24px;color:#bdd0e8}.simo-edit-progress{display:none;margin:10px 0 12px;border:1px solid rgba(56,189,248,.35);border-radius:14px;padding:11px 12px;background:rgba(2,6,23,.62)}.simo-edit-progress.on{display:block!important;visibility:visible!important;opacity:1!important;max-height:none!important}.simo-edit-progress-row{display:flex;align-items:center;gap:9px;font-weight:900;color:#e6f7ff}.simo-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:#38bdf8;border-radius:50%;animation:simoSpin .8s linear infinite}.simo-progress-track{height:7px;margin-top:9px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden}.simo-progress-bar{height:100%;width:38%;border-radius:999px;background:linear-gradient(90deg,#38bdf8,#8b5cf6,#38bdf8);animation:simoWork 1.4s ease-in-out infinite}.simo-progress-meta{margin-top:7px;color:#a9bad3;font-size:11px}.simo-progress-meta b{color:#fff}.simo-panel-progress{position:sticky;top:0;z-index:20;box-shadow:0 12px 30px rgba(0,0,0,.28)}@keyframes simoSpin{to{transform:rotate(360deg)}}@keyframes simoWork{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}@media(max-width:900px){.web5-editor-body{grid-template-columns:1fr}.web5-panel{border-left:0;border-top:1px solid rgba(255,255,255,.12)}}'; }
  function controls(p){ return '<div class="web5-controls" data-web5-project="'+esc(p.id)+'"><button data-web5="edit" data-id="'+esc(p.id)+'" title="Open this exact website in the editor">Open Website Builder</button><button data-web5="variant" data-id="'+esc(p.id)+'" title="Create a genuinely different premium design for the same request">Try Another Premium Version</button><button data-web5="save" data-id="'+esc(p.id)+'" title="Save this exact website so you can reopen it later">Save to Library</button><button type="button" title="View your saved websites" onclick="event.preventDefault();event.stopPropagation();if(event.stopImmediatePropagation)event.stopImmediatePropagation();return window.SimoWeb5OpenLibrary&&window.SimoWeb5OpenLibrary();" data-web5="library" data-id="'+esc(p.id)+'">Open Library</button><button data-web5="preview" data-id="'+esc(p.id)+'" title="Open the exact website full-size in a new tab">Open Full Preview</button><button data-web5="copy" data-id="'+esc(p.id)+'" title="Copy the complete website HTML">Copy Website HTML</button><button data-web5="download" data-id="'+esc(p.id)+'" title="Download the complete website as an HTML file">Download Website HTML</button><button data-web5="publish" data-id="'+esc(p.id)+'" title="Publish this exact website">Publish Website</button></div>'; }
  function renderCard(p){ return '<div class="web5-card simo-builder-card" data-web5-card="'+esc(p.id)+'" data-simo-builder-id="'+esc(p.id)+'" data-simo-pub-builder-id="'+esc(p.id)+'"><style>'+appCss()+'</style><div class="web5-head"><div><small>Simo Website Builder 10.34</small><h2>'+esc(p.title)+'</h2><p>Simo AI design owner • Not saved until you press Save • Editor controls remain outside the website.</p></div></div>'+controls(p)+'<div class="web5-frame">'+miniPreview(p)+'</div>'+controls(p)+'</div>'; }
  function addUser(t){ var d=document.createElement('div'); d.className='msg-row msg-user'; d.innerHTML='<div class="msg-bubble msg-bubble-user">'+esc(t)+'</div>'; chat().appendChild(d); scrollChat(); }
  function addAssistant(html){ var d=document.createElement('div'); d.className='msg-row msg-assistant simo-web5-row'; d.innerHTML='<div class="msg-bubble msg-bubble-assistant" style="max-width:min(1220px,98%);width:100%">'+html+'</div>'; chat().appendChild(d); scrollChat(); return d; }
  function progressSequence(messages){
    var timers=[];
    (messages||[]).forEach(function(item){
      timers.push(window.setTimeout(function(){status(item[1]);},item[0]));
    });
    return function(){timers.forEach(function(id){try{window.clearTimeout(id);}catch(_){}});};
  }

  // 10.14: every Website Builder action that can make the user wait gets visible, local progress
  // surface so the user never has to guess whether Simo is frozen. Immediate actions
  // such as Copy/Download/Open Preview are intentionally not delayed by this UI.
  function startCardActionProgress(card, label, phases){
    if(!card)return function(){};
    var old=card.querySelector('[data-simo-card-action-progress]'); if(old)try{old.remove();}catch(_){}
    var box=document.createElement('div');
    box.setAttribute('data-simo-card-action-progress','1');
    box.className='simo-edit-progress on';box.style.setProperty('display','block','important');box.style.setProperty('visibility','visible','important');
    box.innerHTML='<div class="simo-edit-progress-row"><span class="simo-spinner"></span><span data-simo-card-action-text>'+esc(label||'Simo is working…')+'</span></div><div class="simo-progress-track"><div class="simo-progress-bar"></div></div><div class="simo-progress-meta">Working now • <b data-simo-card-action-elapsed>0:00</b> elapsed. Keep this page open — Simo has not frozen.</div>';
    var controls=card.querySelector('.web5-controls');
    if(controls&&controls.parentNode)controls.parentNode.insertBefore(box,controls.nextSibling); else card.insertBefore(box,card.firstChild);
    var txt=box.querySelector('[data-simo-card-action-text]'), elapsed=box.querySelector('[data-simo-card-action-elapsed]');
    var started=Date.now(), clock=window.setInterval(function(){var sec=Math.max(0,Math.floor((Date.now()-started)/1000)),min=Math.floor(sec/60);sec=sec%60;if(elapsed)elapsed.textContent=min+':'+String(sec).padStart(2,'0');},1000);
    var timers=[];
    (phases||[]).forEach(function(item){timers.push(window.setTimeout(function(){if(txt)txt.textContent=item[1];status(item[1]);},item[0]));});
    try{box.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(_){}
    return function(){try{window.clearInterval(clock);}catch(_){} timers.forEach(function(id){try{window.clearTimeout(id);}catch(_){}});try{box.remove();}catch(_){}};
  }

  function quickCardActionProgress(card,label,duration){
    var stop=startCardActionProgress(card,label||'Simo is working…',[]);
    window.setTimeout(function(){try{stop();}catch(_){ }},Math.max(450,Number(duration||900)));
    return stop;
  }

  function build(prompt, opts){
    prompt=clean(prompt); if(!prompt) return Promise.resolve(null);
    var requestPrompt=resolveWebsitePrompt(prompt);
    clearSubmittedPrompt(prompt);
    var composerLock=window.setInterval(function(){
      var field=input();
      if(field && clean(field.value||'')===prompt){
        try{field.value='';field.textContent='';field.removeAttribute('value');field.dispatchEvent(new Event('input',{bubbles:true}));}catch(_){ }
      }
    },100);
    function releaseComposerLock(){
      try{window.clearInterval(composerLock);}catch(_){ }
      clearSubmittedPrompt(prompt);
    }
    if(!opts || !opts.noUser) addUser(prompt);

    if(!accountContext().accountOwned){
      releaseComposerLock();
      addAssistant(freeWebsiteGateCard());
      status('Website Builder is a Pro creation feature. Free planning is still available in chat.');
      return Promise.resolve(null);
    }

    status('Simo is designing a premium subject-specific website…');
    var stopProgress=progressSequence([[12000,'Simo is shaping the subject-specific layout and art direction…'],[32000,'Simo is authoring subject-matched imagery and page details…'],[58000,'Simo is running the Razor-benchmark quality checks…'],[90000,'Simo is finishing the full-page preview and image readiness…']]);
    var loading=addAssistant(loadingCard('Understanding your request and planning the website.'));
    var stopGenerationUI=startGenerationProgress(loading);
    return postJSON('/api/simo-website-v3/generate',{prompt:requestPrompt}).then(function(data){
      stopProgress();
      stopGenerationUI();
      releaseComposerLock();
      try{loading.remove();}catch(e){}
      var p=projectFromAI(requestPrompt,data,opts&&opts.existing);
      p.userPrompt=prompt;
      p.contextResolved=(requestPrompt!==prompt);
      p.variant=(opts&&opts.variant)||((opts&&opts.existing&&opts.existing.variant)||0);
      persistDraft(p);
      var row=addAssistant(renderCard(p)); hydrateProjectFrame(row,p); purgeBuilderDesignSuggestions(row);
      status('Website ready. Open Website Builder, Save, Preview, or Download.');
      return p;
    }).catch(function(err){
      stopProgress();
      stopGenerationUI();
      releaseComposerLock();
      try{loading.remove();}catch(e){}
      addAssistant(errorCard(err&&err.message?err.message:String(err||'Unknown generation error')));
      status('Website generation stopped safely.');
      return null;
    });
  }

  function openEditor(project){
    project=normalizeExactProject(project||getJSON(activeKey(),null)||getJSON(draftKey(),null));
    if(!project) return alert('No website project is available yet. Generate a website first.');
    sealCanonical(project, canonicalHtml(project), project.canonicalHash); persistDraft(project);
    var m=document.createElement('div'); m.className='web5-modal';
    m.innerHTML='<style>'+appCss()+'</style><div class="web5-editor"><div class="web5-modal-head"><div><b>Website Builder — '+esc(project.title)+'</b><div data-web5-editor-status style="color:#b7c2d6;font-size:12px">Edit with Simo intelligence. Save when you want it in Library.</div><div class="simo-edit-progress" data-web5-edit-progress><div class="simo-edit-progress-row"><span class="simo-spinner"></span><span data-web5-edit-progress-text>Simo is working on your edit…</span></div><div class="simo-progress-track"><div class="simo-progress-bar"></div></div><div class="simo-progress-meta">Still working • <b data-web5-edit-elapsed>0:00</b> elapsed. Keep this window open.</div></div></div><button class="web5-close" data-web5-modal-close>Close</button></div><div class="web5-editor-body"><iframe sandbox="allow-scripts allow-forms allow-popups" data-web5-editor-frame="1"></iframe><aside class="web5-panel"><h2>Edit your website</h2><div class="simo-edit-progress simo-panel-progress" data-web5-panel-progress><div class="simo-edit-progress-row"><span class="simo-spinner"></span><span data-web5-panel-progress-text>Simo is working…</span></div><div class="simo-progress-track"><div class="simo-progress-bar"></div></div><div class="simo-progress-meta">Working now • <b data-web5-panel-elapsed>0:00</b> elapsed. Keep this window open.</div></div><label>Tell Simo what you want changed — use normal words</label><div style="color:#a9bad3;font-size:12px;line-height:1.45;margin:4px 0 8px">You can change anything on this website: text, images, colors, layout, sections, prices, buttons, contact details, order, spacing, or the overall style. Simo will show a working bar while it makes the change.</div><textarea data-web5-edit-prompt placeholder="Example: make this feel more luxurious, show bigger project photos, add starting prices, move reviews higher, or replace the hero image"></textarea><div class="stack"><button data-web5-apply title="Apply the change you described to this website">Apply My Change</button><button data-web5-variant-editor title="Create a different premium design while keeping the same business request">Try Another Premium Version</button><button data-web5-luxury title="Redesign the whole website with a more luxurious art direction">Redesign More Luxurious</button><button data-web5-bright title="Make the visual design brighter and more inviting">Make Design Brighter</button><button data-web5-save-editor title="Save the exact version you are viewing">Save Website to Library</button><button data-web5-preview-editor title="Open this exact website full-size in a new tab">Open Full Preview</button><button data-web5-download-editor title="Download this exact website as an HTML file">Download Website HTML</button><button data-web5-copy-editor title="Copy this exact website HTML">Copy Website HTML</button><button data-web5-publish-editor title="Publish this exact website">Publish Website</button></div><hr style="border-color:rgba(255,255,255,.12)"><label>Headline</label><input data-web5-headline-input value=""><button data-web5-headline>Apply Headline</button></aside></div></div>';
    document.body.appendChild(m);
    var frame=m.querySelector('[data-web5-editor-frame]'), st=m.querySelector('[data-web5-editor-status]');
    var prog=m.querySelector('[data-web5-edit-progress]'), progText=m.querySelector('[data-web5-edit-progress-text]'), elapsed=m.querySelector('[data-web5-edit-elapsed]'), panelProg=m.querySelector('[data-web5-panel-progress]'), panelProgText=m.querySelector('[data-web5-panel-progress-text]'), panelElapsed=m.querySelector('[data-web5-panel-elapsed]');
    var editClock=null, editStartedAt=0;
    writeWebsiteFrame(frame,canonicalHtml(project));
    function fmtElapsed(ms){var sec=Math.max(0,Math.floor(ms/1000)),min=Math.floor(sec/60);sec=sec%60;return min+':'+String(sec).padStart(2,'0');}
    function showWork(on,msg){
      [prog,panelProg].forEach(function(box){if(!box)return;box.classList.toggle('on',!!on);if(on){box.style.setProperty('display','block','important');box.style.setProperty('visibility','visible','important');box.removeAttribute('hidden');}else{box.style.removeProperty('display');box.style.removeProperty('visibility');}});
      if(progText&&msg)progText.textContent=msg; if(panelProgText&&msg)panelProgText.textContent=msg;
      if(on){
        editStartedAt=Date.now(); if(elapsed)elapsed.textContent='0:00'; if(panelElapsed)panelElapsed.textContent='0:00';
        try{if(editClock)window.clearInterval(editClock);}catch(_){}
        editClock=window.setInterval(function(){var v=fmtElapsed(Date.now()-editStartedAt);if(elapsed)elapsed.textContent=v;if(panelElapsed)panelElapsed.textContent=v;},1000);
        try{if(panelProg)panelProg.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(_){}
      }else{try{if(editClock)window.clearInterval(editClock);}catch(_){} editClock=null;}
    }
    function setBusy(on,msg){
      Array.prototype.forEach.call(m.querySelectorAll('button'),function(b){
        var aiAction=b.matches('[data-web5-apply],[data-web5-variant-editor],[data-web5-luxury],[data-web5-bright],[data-web5-headline]');
        if(aiAction)b.disabled=!!on;
      });
      if(st)st.textContent=msg||'Ready.';
      if(!on)showWork(false);
    }
    function isWholeSiteRedesignInstruction(instruction){
      var t=clean(instruction).toLowerCase();
      if(!t)return false;
      if(/\b(whole|entire|complete|full)[ -]?(website|web site|site|page|design|look|layout|theme)\b/.test(t))return true;
      if(/\b(redesign|rebrand|re-theme|retheme|new theme|new look|different look|different design|new art direction|new visual direction)\b/.test(t))return true;
      if(/\b(make|turn|transform)\b[\s\S]{0,50}\b(website|web site|site|design|layout|theme)\b[\s\S]{0,50}\b(luxur|premium|upscale|elegant|modern|editorial|cinematic|brighter|bolder|minimal|sophisticated)\b/.test(t))return true;
      if(/\b(make|turn|transform)\b[\s\S]{0,50}\b(luxur|premium|upscale|elegant|modern|editorial|cinematic|brighter|bolder|minimal|sophisticated)\b[\s\S]{0,50}\b(website|web site|site|design|layout|theme)\b/.test(t))return true;
      return false;
    }

    function applyWholeSiteRedesign(instruction){
      instruction=clean(instruction);
      if(!instruction)return;
      setBusy(true,'Creating a full premium redesign…');
      showWork(true,'Rebuilding the whole website around your request…');

      var timers=[];
      [[9000,'Choosing a new premium art direction…'],[24000,'Recomposing the hero, typography, sections, and CTA system…'],[46000,'Building a fresh Razor-level visual composition…'],[76000,'Checking that the redesign is clearly different and publish-ready…'],[115000,'Still working on the full redesign — no need to click again…']].forEach(function(item){
        timers.push(window.setTimeout(function(){
          if(progText)progText.textContent=item[1];
          if(panelProgText)panelProgText.textContent=item[1];
          if(st)st.textContent=item[1];
        },item[0]));
      });

      function stopRedesign(){
        timers.forEach(function(id){try{window.clearTimeout(id);}catch(_){}});
        showWork(false);
      }

      var previousId=project.id;
      postJSON('/api/simo-website-v3/generate',{
        prompt:project.prompt,
        variant:(project.variant||0)+1,
        previous_html:canonicalHtml(project),
        redesign_from_editor:true,
        editor_instruction:instruction,
        preserve_identity:true
      },300000).then(function(data){
        stopRedesign();
        if(!isFullHtml(data&&data.html)){
          setBusy(false,'Redesign failed: Simo did not return a complete website. Your current site was preserved.');
          return;
        }

        var next=projectFromAI(project.prompt,data,project);
        next.id=uid('simo_web6');
        next.createdAt=new Date().toISOString();
        next.updatedAt=next.createdAt;
        next.saved=false;
        next.variantParentId=previousId;
        next.redesignInstruction=instruction;
        next.variant=(data&&typeof data.variant==='number')?data.variant:((project.variant||0)+1);
        project=next;

        persistDraft(project);
        writeWebsiteFrame(frame,canonicalHtml(project));

        var dashboardCard=null;
        try{
          Array.prototype.some.call(document.querySelectorAll('.web5-card[data-web5-card]'),function(card){
            if(card.getAttribute('data-web5-card')===previousId){dashboardCard=card;return true;}
            return false;
          });
        }catch(_){}
        replaceCardWithProject(dashboardCard,project);

        try{
          var modalTitle=m.querySelector('.web5-modal-head b');
          if(modalTitle)modalTitle.textContent='Website Builder — '+(project.title||'Website');
        }catch(_){}

        var editBox=m.querySelector('[data-web5-edit-prompt]');
        if(editBox){editBox.value='';editBox.dispatchEvent(new Event('input',{bubbles:true}));}

        setBusy(false,'Full premium redesign applied. Save when ready.');
      }).catch(function(err){
        stopRedesign();
        setBusy(false,'Redesign failed: '+(err&&err.message?err.message:String(err)));
      });
    }

    function applyAIEdit(instruction){
      instruction=clean(instruction); if(!instruction){alert('Type what you want to change first.');return;}
      if(isWholeSiteRedesignInstruction(instruction)){applyWholeSiteRedesign(instruction);return;}
      setBusy(true,'Applying Simo edit…');
      showWork(true,'Understanding your requested change…');
      var phaseTimers=[];
      [[7000,'Updating the requested website content and imagery…'],[22000,'Simo is still working — preserving the subject and lifelike image quality…'],[48000,'Finishing the visual changes and rebuilding the exact preview…'],[80000,'Running the Razor-benchmark quality check before showing the result…'],[120000,'Still working on the requested edit — no need to click again…']].forEach(function(item){phaseTimers.push(window.setTimeout(function(){if(progText)progText.textContent=item[1];if(panelProgText)panelProgText.textContent=item[1];if(st)st.textContent=item[1];},item[0]));});
      function stopEditProgress(){phaseTimers.forEach(function(id){try{window.clearTimeout(id);}catch(_){}});showWork(false);}
      // 10.33: let the browser paint the progress UI before starting the request,
      // and keep it visible briefly for very-fast success/failure responses so users
      // never have to wonder whether Apply My Change actually registered.
      var editUiStarted=Date.now();
      function finishEditUi(callback){
        var wait=Math.max(0,900-(Date.now()-editUiStarted));
        window.setTimeout(function(){stopEditProgress();callback();},wait);
      }
      window.setTimeout(function(){
        postJSON('/api/simo-website-v3/edit',{title:project.title,prompt:project.prompt,html:canonicalHtml(project),instruction:instruction},300000)
          .then(function(data){
            finishEditUi(function(){
              if(!isFullHtml(data.html)){setBusy(false,'Edit failed: The edit route did not return a complete website.');return;}
              if(data.visible_image_edit && Number(data.images_edited||0) < Number(data.images_selected||0)){setBusy(false,'Edit failed: Simo did not finish every requested image change. The current website was kept unchanged.');return;}
              if(data.visible_change_verified===false){setBusy(false,'Edit failed: Simo could not verify a visible change, so the current website was kept unchanged.');return;}
              sealCanonical(project,String(data.html),data.canonical_hash);
              project.title=clean(data.title)||project.title; project.origin='ai_html'; project.generationSource=clean(data.phase||'simo-premium-website-edit'); project.updatedAt=new Date().toISOString(); project.saved=false;
              persistDraft(project); writeWebsiteFrame(frame,canonicalHtml(project));
              try{
                var dashboardCard=document.querySelector('.web5-card[data-web5-card="'+project.id+'"]');
                if(dashboardCard)replaceCardWithProject(dashboardCard,project);
              }catch(_){}
              try{
                var modalTitle=m.querySelector('.web5-modal-head b');
                if(modalTitle)modalTitle.textContent='Website Builder — '+(project.title||'Website');
              }catch(_){}
              var editBox=m.querySelector('[data-web5-edit-prompt]'); if(editBox){editBox.value='';editBox.dispatchEvent(new Event('input',{bubbles:true}));}
              setBusy(false,clean(data.edit_summary)||'Edit applied. Save when ready.');
            });
          })
          .catch(function(err){finishEditUi(function(){setBusy(false,'Edit failed: '+(err&&err.message?err.message:String(err)));});});
      },80);
    }
    function anotherVersion(){
      setBusy(true,'Creating another premium version…');
      showWork(true,'Creating another premium version…');
      var variantPhaseTimers=[];
      [[10000,'Choosing a genuinely different premium creative direction…'],[26000,'Rebuilding the composition, typography, and image rhythm…'],[48000,'Authoring a fresh, non-repeating image set for this version…'],[76000,'Checking that this version is meaningfully different and Razor-ready…'],[115000,'Still working on the premium version — no need to click again…']].forEach(function(item){variantPhaseTimers.push(window.setTimeout(function(){if(progText)progText.textContent=item[1];if(panelProgText)panelProgText.textContent=item[1];if(st)st.textContent=item[1];status(item[1]);},item[0]));});
      function stopVariantProgress(){variantPhaseTimers.forEach(function(id){try{window.clearTimeout(id);}catch(_){}});showWork(false);}
      postJSON('/api/simo-website-v3/generate',{prompt:project.prompt,variant:(project.variant||0)+1,previous_html:canonicalHtml(project)},300000).then(function(data){
        stopVariantProgress();
        var previousId=project.id;
        var next=projectFromAI(project.prompt,data,project);
        next.id=uid('simo_web6');
        next.createdAt=new Date().toISOString();
        next.updatedAt=next.createdAt;
        next.saved=false;
        next.variantParentId=previousId;
        next.variant=(data&&typeof data.variant==='number')?data.variant:((project.variant||0)+1);
        project=next;
        persistDraft(project);
        writeWebsiteFrame(frame,canonicalHtml(project));

        // Keep the main dashboard result card synchronized with the exact
        // premium version currently open in Website Builder.
        var dashboardCard=null;
        try{
          Array.prototype.some.call(document.querySelectorAll('.web5-card[data-web5-card]'),function(card){
            if(card.getAttribute('data-web5-card')===previousId){dashboardCard=card;return true;}
            return false;
          });
        }catch(_){}
        replaceCardWithProject(dashboardCard,project);

        // Keep the Website Builder modal heading synchronized too.
        try{
          var modalTitle=m.querySelector('.web5-modal-head b');
          if(modalTitle) modalTitle.textContent='Website Builder — '+(project.title||'Website');
        }catch(_){}

        setBusy(false,'Another premium version is ready.');
      }).catch(function(err){stopVariantProgress();setBusy(false,'Version failed: '+(err&&err.message?err.message:String(err)));});
    }
    m.addEventListener('click',function(e){
      var t=e.target; if(!t||!t.closest)return;
      if(t.closest('[data-web5-modal-close]')){m.remove();return;}
      if(t.matches('[data-web5-save-editor]')){showWork(true,'Saving this exact website to your Library…');saveProject(project,t);window.setTimeout(function(){showWork(false);if(st)st.textContent='Saved to Library.';},850);return;}
      if(t.matches('[data-web5-preview-editor]')){showWork(true,'Opening the full preview…');openPreview(project);window.setTimeout(function(){showWork(false);if(st)st.textContent='Full preview opened.';},650);return;}
      if(t.matches('[data-web5-download-editor]')){showWork(true,'Preparing your website download…');download(project);window.setTimeout(function(){showWork(false);if(st)st.textContent='Website download prepared.';},750);return;}
      if(t.matches('[data-web5-copy-editor]')){showWork(true,'Copying the complete website HTML…');copyText(canonicalHtml(project)).then(function(){status('HTML copied.');if(st)st.textContent='Website HTML copied.';}).catch(function(err){if(st)st.textContent='Copy failed: '+(err&&err.message?err.message:String(err));}).finally(function(){window.setTimeout(function(){showWork(false);},350);});return;}
      if(t.matches('[data-web5-publish-editor]')){showWork(true,'Publishing this exact website…');var pub=publish(project);if(pub&&pub.finally)pub.finally(function(){showWork(false);});else window.setTimeout(function(){showWork(false);},1200);return;}
      if(t.matches('[data-web5-variant-editor]')){anotherVersion();return;}
      if(t.matches('[data-web5-luxury]')){applyWholeSiteRedesign('Transform the entire website into a genuinely high-end luxury art direction. Treat this as a whole-site re-composition, not a preset and not a color change. Change hero geometry, typography pairing and scale, section rhythm/order, image treatment/crops, grid/card language, navigation, CTA presentation, premium surfaces, service/pricing presentation, testimonials, booking/contact experience and footer. Prevent all headline/subheadline/CTA collisions and remove giant unused desktop space. Preserve the exact business identity, subject, useful business content, working links, forms, editability, and responsive behavior.');return;}
      if(t.matches('[data-web5-bright]')){applyWholeSiteRedesign('Make the entire website brighter, clearer, and more inviting with a visibly new premium art direction while preserving the exact business identity, subject, useful content, working links, forms, and responsive behavior.');return;}
      if(t.matches('[data-web5-headline]')){var val=clean(m.querySelector('[data-web5-headline-input]').value);if(val)applyAIEdit('Change the main hero headline to exactly: '+val);return;}
      if(t.matches('[data-web5-apply]')){applyAIEdit(m.querySelector('[data-web5-edit-prompt]').value);return;}
    });
  }
  function openPreview(project){
    project=normalizeExactProject(project||getJSON(activeKey(),null)||getJSON(draftKey(),null)); if(!project)return;
    var win=null;
    try{ win=window.open('about:blank','_blank'); }catch(_){ win=null; }
    if(!win){ status('Preview was blocked by the browser. Allow pop-ups for Simo and try again.'); return; }
    try{
      win.document.open();
      win.document.write(previewDocument(canonicalHtml(project)));
      win.document.close();
      try{win.focus();}catch(_){}
      status('Full preview opened in a new tab.');
    }catch(err){
      try{win.close();}catch(_){}
      status('Preview could not open: '+(err&&err.message?err.message:String(err)));
    }
  }
  function download(project){
    project=normalizeExactProject(project||getJSON(activeKey(),null)||getJSON(draftKey(),null)); if(!project)return;
    var url=URL.createObjectURL(new Blob([canonicalHtml(project)],{type:'text/html'})); var a=document.createElement('a');
    a.href=url; a.download=slug(project.title||project.subject)+'.html'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){try{URL.revokeObjectURL(url);}catch(e){}},1000);
  }
  function publish(project){
    project=normalizeExactProject(project||getJSON(activeKey(),null)||getJSON(draftKey(),null)); if(!project)return;
    status('Publishing website…');
    return postJSON('/api/publish',{title:project.title,html:canonicalHtml(project),sourceText:project.prompt,slug:slug(project.title||project.subject)}).then(function(res){
      var url=res.url||res.published_url; status(url?('Published: '+url):'Website published.');
      if(url){ var win=window.open(url,'_blank','noopener,noreferrer'); if(!win) status('Published successfully. Your browser blocked the new tab: '+url); }
    }).catch(function(err){ console.error('SIMO publish failed:',err); status('Publish failed safely: '+(err&&err.message?err.message:String(err))); });
  }
  function buildLibraryCard(project){
    var card=document.createElement('article');
    card.className='web5-lib-card';
    card.setAttribute('data-simo-library-item',project.id||'');
    var thumb=document.createElement('div'); thumb.className='web5-thumb';
    var frame=document.createElement('iframe'); frame.setAttribute('sandbox','allow-scripts allow-forms'); frame.title=(project.title||'Saved website')+' preview';
    thumb.appendChild(frame);
    var h=document.createElement('h3'); h.textContent=project.title||'Saved Website';
    var p=document.createElement('p'); p.textContent='Website Builder • exact saved HTML';
    var edit=document.createElement('button'); edit.setAttribute('data-lib-edit',project.id||''); edit.textContent='Open Website Builder';
    var preview=document.createElement('button'); preview.setAttribute('data-lib-preview',project.id||''); preview.textContent='Preview';
    var del=document.createElement('button'); del.setAttribute('data-lib-delete',project.id||''); del.textContent='Delete';
    card.appendChild(thumb); card.appendChild(h); card.appendChild(p); card.appendChild(edit); card.appendChild(document.createTextNode(' ')); card.appendChild(preview); card.appendChild(document.createTextNode(' ')); card.appendChild(del);
    setTimeout(function(){ writeWebsiteFrame(frame, project.html||''); },0);
    return card;
  }
  function fillLibraryBody(body, projects){
    body.replaceChildren();
    if(!projects.length){
      var empty=document.createElement('div'); empty.className='empty';
      empty.innerHTML='<b>No Website Builder cards are saved yet.</b><br>Generate a website and press Save. Design Workspace items are intentionally kept out of this Website Builder Library.';
      body.appendChild(empty); return;
    }
    var grid=document.createElement('div'); grid.className='grid';
    projects.forEach(function(project){
      // Reopen contract: register the exact server-synced project rendered on this card.
      register(project);
      var card=document.createElement('article'); card.className='card';
      var thumb=document.createElement('div'); thumb.className='thumb';
      var frame=document.createElement('iframe'); frame.title=(project.title||'Saved website')+' preview'; frame.setAttribute('tabindex','-1');
      thumb.appendChild(frame);
      var h=document.createElement('h3'); h.textContent=project.title||'Saved Website';
      var p=document.createElement('p'); p.textContent='Website Builder • exact saved HTML';
      var edit=document.createElement('button'); edit.dataset.action='edit'; edit.dataset.id=project.id||''; edit.textContent='Open Website Builder';
      var preview=document.createElement('button'); preview.dataset.action='preview'; preview.dataset.id=project.id||''; preview.textContent='Preview';
      var del=document.createElement('button'); del.dataset.action='delete'; del.dataset.id=project.id||''; del.textContent='Delete';
      card.appendChild(thumb); card.appendChild(h); card.appendChild(p); card.appendChild(edit); card.appendChild(document.createTextNode(' ')); card.appendChild(preview); card.appendChild(document.createTextNode(' ')); card.appendChild(del);
      grid.appendChild(card);
      setTimeout(function(){ writeWebsiteFrame(frame, project.html||''); },0);
    });
    body.appendChild(grid);
  }
  function openLibrary(){
    status('Opening Website Builder Library…');
    var old=document.querySelector('[data-simo-web62-library-host="1"]');
    if(old) old.remove();
    var projects=savedProjects();

    var host=document.createElement('div');
    host.setAttribute('data-simo-web62-library-host','1');
    host.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,.86);backdrop-filter:blur(14px);display:grid;place-items:center;padding:18px';
    document.body.appendChild(host);

    var root=host.attachShadow ? host.attachShadow({mode:'open'}) : host;
    var shell=document.createElement('div');
    shell.innerHTML='<style>:host{all:initial}.lib{width:min(1240px,calc(100vw - 48px));height:min(820px,calc(100vh - 48px));background:#0b1220;color:#f8fafc;border:1px solid rgba(255,255,255,.16);border-radius:22px;box-shadow:0 40px 120px rgba(0,0,0,.55);overflow:hidden;display:grid;grid-template-rows:auto 1fr;font-family:Inter,Arial,sans-serif}.head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12)}.count{color:#b7c2d6;font-size:12px;margin-top:3px}.close,.card button{border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.08);color:#f8fafc;font-weight:900;padding:10px 13px;cursor:pointer}.card button[data-action="edit"]{background:linear-gradient(135deg,#4db8ff,#6f7cff);color:#061018;border-color:rgba(125,211,252,.72);box-shadow:0 8px 22px rgba(56,189,248,.22);font-weight:1000}.card button[data-action="edit"]:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 10px 28px rgba(56,189,248,.32)}.body{overflow:auto;padding:16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.card{border:1px solid rgba(255,255,255,.13);background:#131e31;border-radius:18px;padding:12px}.thumb{height:155px;background:white;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}.thumb iframe{width:720px;height:440px;border:0;transform:scale(.33);transform-origin:top left;pointer-events:none}.card h3{margin:10px 0 4px;font-size:18px}.card p{margin:0 0 10px;color:#b7c2d6}.empty{border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:24px;color:#bdd0e8}</style><div class="lib"><div class="head"><div><b>Website Builder Library</b><div class="count"></div></div><button class="close">Close</button></div><div class="body"></div></div>';
    root.appendChild(shell);
    var count=shell.querySelector('.count');
    var body=shell.querySelector('.body');
    count.textContent=projects.length?('Saved websites: '+projects.length):'No saved websites yet.';

    if(!projects.length){
      var empty=document.createElement('div');
      empty.className='empty';
      empty.innerHTML='<b>No Website Builder cards are saved yet.</b><br>Generate a website and press Save. Design Workspace items are intentionally kept out of this Website Builder Library.';
      body.appendChild(empty);
    } else {
      var grid=document.createElement('div'); grid.className='grid';
      projects.forEach(function(project){
        var card=document.createElement('article'); card.className='card';
        var thumb=document.createElement('div'); thumb.className='thumb';
        var frame=document.createElement('iframe'); frame.title=(project.title||'Saved website')+' preview';
        thumb.appendChild(frame);
        var h=document.createElement('h3'); h.textContent=project.title||'Saved Website';
        var p=document.createElement('p'); p.textContent='Website Builder • exact saved HTML';
        var edit=document.createElement('button'); edit.dataset.action='edit'; edit.dataset.id=project.id||''; edit.textContent='Open Website Builder';
        var preview=document.createElement('button'); preview.dataset.action='preview'; preview.dataset.id=project.id||''; preview.textContent='Preview';
        var del=document.createElement('button'); del.dataset.action='delete'; del.dataset.id=project.id||''; del.textContent='Delete';
        card.appendChild(thumb); card.appendChild(h); card.appendChild(p); card.appendChild(edit); card.appendChild(document.createTextNode(' ')); card.appendChild(preview); card.appendChild(document.createTextNode(' ')); card.appendChild(del);
        grid.appendChild(card);
        setTimeout(function(){ writeWebsiteFrame(frame, project.html||''); },0);
      });
      body.appendChild(grid);
    }

    shell.querySelector('.close').addEventListener('click',function(e){e.preventDefault();e.stopPropagation();host.remove();});
    body.addEventListener('click',function(e){
      var btn=e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      e.preventDefault();e.stopPropagation();
      var id=btn.dataset.id||'';
      var project=getProject(id);
      if(!project){ alert('This saved website could not be found.'); return; }
      if(btn.dataset.action==='delete'){
        saveList(savedProjects().filter(function(item){return item.id!==id;}));
        if(accountContext().accountOwned) postJSON('/api/library/delete',{id:id}).catch(function(err){ console.warn('SIMO Pro account Library delete failed:',err); });
        host.remove(); openLibrary(); return;
      }
      if(btn.dataset.action==='edit'){ host.remove(); openEditor(project); return; }
      if(btn.dataset.action==='preview'){ openPreview(project); return; }
    });
    syncServerLibrary().then(function(all){
      var fresh=(Array.isArray(all)?all:savedProjects());
      count.textContent=(accountContext().accountOwned?'Pro Account Library':'Guest / Free Local Library')+' • '+(fresh.length?('Saved websites: '+fresh.length):'No saved websites yet.');
      fillLibraryBody(body,fresh);
    }).catch(function(err){
      if(String(err&&err.message||err).indexOf('not_logged_in')<0) console.warn('SIMO account Library sync skipped:',err);
    });
    status('Website Builder Library opened.');
    return false;
  }

  function bindLibraryButtons(){
    try{
      var candidates=[];
      ['builderLibraryCard','libraryBtn'].forEach(function(id){ var el=$(id); if(el)candidates.push(el); });
      Array.prototype.forEach.call(document.querySelectorAll('button,.pill,.side-card'),function(el){
        var txt=low(el.textContent||'');
        if(txt==='website library'||txt.indexOf('website library')>=0) candidates.push(el);
      });
      candidates.forEach(function(el){
        if(el.__simoWeb5LibraryBound)return;
        el.__simoWeb5LibraryBound=true;
        try{ el.setAttribute('onclick', "event.preventDefault();event.stopPropagation();if(event.stopImmediatePropagation)event.stopImmediatePropagation();return window.SimoWeb5OpenLibrary&&window.SimoWeb5OpenLibrary();"); }catch(_){}
        el.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation)e.stopImmediatePropagation(); openLibrary(); return false; },true);
      });
    }catch(e){}
  }
  function updateCount(){
    var count=savedProjects().length;
    var el=$('libraryCountValue'); if(el) el.textContent=String(count);
    var side=$('builderLibrarySidebarCount'); if(side) side.textContent=String(count);
    if(!accountContext().accountOwned) publishLibraryCounts(count,0);
    return count;
  }

  function replaceCardWithProject(card,project){
    if(card){ var holder=document.createElement('div'); holder.innerHTML=renderCard(project); var fresh=holder.firstElementChild; card.replaceWith(fresh); hydrateProjectFrame(fresh,project); }
    else { var row=addAssistant(renderCard(project)); hydrateProjectFrame(row,project); }
  }
  function handleClick(e){
    var t=e.target; if(!t||!t.closest)return;
    var b=t.closest('[data-web5]');
    if(b){
      e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
      var act=b.getAttribute('data-web5'); if(act==='library'){quickCardActionProgress(b.closest('.web5-card'),'Opening your Website Builder Library…',650);openLibrary();return false;}
      var p=getProject(b.getAttribute('data-id')); if(!p)return false;
      if(act==='variant'){
        status('Creating another premium version…');
        var card=b.closest('.web5-card');
        var stopCardVariantProgress=startCardActionProgress(card,'Creating another premium version…',[[10000,'Choosing a genuinely different premium creative direction…'],[26000,'Rebuilding the composition, typography, and image rhythm…'],[48000,'Authoring a fresh, non-repeating image set for this version…'],[76000,'Checking that this version is meaningfully different and Razor-ready…'],[115000,'Still working on the premium version — no need to click again…']]);
        Array.prototype.forEach.call(card?card.querySelectorAll('[data-web5="variant"]'):[],function(x){x.disabled=true;});
        postJSON('/api/simo-website-v3/generate',{prompt:p.prompt,variant:(p.variant||0)+1,previous_html:p.html},300000).then(function(data){stopCardVariantProgress();var previousId=p.id;var np=projectFromAI(p.prompt,data,p);np.id=uid('simo_web6');np.createdAt=new Date().toISOString();np.updatedAt=np.createdAt;np.saved=false;np.variantParentId=previousId;np.variant=(data&&typeof data.variant==='number')?data.variant:((p.variant||0)+1);persistDraft(np);replaceCardWithProject(card,np);status('Another premium version replaced the same result card.');}).catch(function(err){stopCardVariantProgress();Array.prototype.forEach.call(card?card.querySelectorAll('[data-web5="variant"]'):[],function(x){x.disabled=false;});status('Version failed: '+(err&&err.message?err.message:String(err)));});
      }
      var actionCard=b.closest('.web5-card');
      if(act==='edit'){quickCardActionProgress(actionCard,'Opening Website Builder…',650);openEditor(p);return false;}
      if(act==='save'){quickCardActionProgress(actionCard,'Saving this exact website to your Library…',900);saveProject(p,b);return false;}
      if(act==='preview'){quickCardActionProgress(actionCard,'Opening the full website preview…',700);openPreview(p);return false;}
      if(act==='download'){quickCardActionProgress(actionCard,'Preparing your website download…',800);download(p);return false;}
      if(act==='copy'){var stopCopy=startCardActionProgress(actionCard,'Copying the complete website HTML…',[]);copyText(p.html||'').then(function(){status('HTML copied.');}).catch(function(err){status('Copy failed: '+(err&&err.message?err.message:String(err)));}).finally(function(){stopCopy();});return false;}
      if(act==='publish'){var stopPublish=startCardActionProgress(actionCard,'Publishing this exact website…',[[9000,'Finishing the publish request…'],[22000,'Simo is still publishing — keep this page open…']]);var publishPromise=publish(p);if(publishPromise&&publishPromise.finally)publishPromise.finally(function(){stopPublish();});else window.setTimeout(function(){stopPublish();},1500);return false;}
      return false;
    }
    var lib=t.closest('#builderLibraryCard,[data-simo-open-website-library]');
    if(lib){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();openLibrary();return false;}
    var starter=t.closest('[data-simo-starter="build"]');
    if(starter){
      e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
      window.__SIMO_WEBSITE_BUILDER_MODE_ACTIVE__=true;
      window.__SIMO_ACTIVE_MODE__='website';
      try{ if(typeof window.__SIMO_SET_ACTIVE_MODE__==='function') window.__SIMO_SET_ACTIVE_MODE__('website',starter); }catch(_){}
      var i=input();
      if(i){
        var starterPrompt='Build me a premium website for my business, product, service, or idea. I’ll describe what it is and Simo should create the complete site.';
        i.placeholder='Website Builder active — describe the website you want';
        i.value=starterPrompt;
        try{i.dispatchEvent(new Event('input',{bubbles:true}));}catch(_){}
        try{i.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){}
        i.focus();
        try{if(i.setSelectionRange)i.setSelectionRange(i.value.length,i.value.length);}catch(_){}
      }
      status('Website Builder active. Edit the starter prompt or describe the website you want, then send it.');
      return false;
    }
  }
  function isComposerForm(form){ var i=input(); return !!(form && i && (form===i.form || form.contains(i))); }
  function handleSend(e){
    var i=input(), target=e.target;
    var enter=e.type==='keydown'&&i&&target===i&&e.key==='Enter'&&!e.shiftKey;
    var click=e.type==='click'&&target&&target.closest&&target.closest('#sendBtn');
    var submit=e.type==='submit'&&isComposerForm(target);
    if(!enter&&!click&&!submit)return;
    var text=clean(i&&i.value); if(!isWebsiteIntent(text))return;
    e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
    clearSubmittedPrompt(text);
    build(text); return false;
  }
  document.addEventListener('input',function(e){
    var el=e&&e.target, submitted=clean(window.__SIMO_LAST_SUBMITTED_WEBSITE_PROMPT__||'');
    var at=Number(window.__SIMO_LAST_SUBMITTED_WEBSITE_PROMPT_AT__||0);
    if(!submitted||!el||Date.now()-at>12500)return;
    if(el===input()||el.closest&&el.closest('.composer-wrap')){
      if(clean(el.value||'')===submitted){try{el.value='';el.removeAttribute('value');}catch(_){}}
    }
  },true);

  function boot(){
    updateCount(); bindLibraryButtons();
    if(accountContext().accountOwned){
      syncServerLibrary().catch(function(err){console.warn('Website Library sync failed:',err);updateCount();});
    }
    window.addEventListener('simo:account-context',function(){
      try{
        window.__SIMO_WEB5_PROJECTS__={};
        if(accountContext().accountOwned) syncServerLibrary().catch(function(){updateCount();});
        else updateCount();
      }catch(_){}
    });
    api.ownsWebsiteClicks=true;
    api.generate=build;
    window.SimoWebsiteBuilder=api;
    window.SimoWebsiteBuilder55=api;
    window.SimoWebsiteBuilder50=api;
    window.SimoWebsiteBuilder40=api;
    window.SimoWebsiteV2=api;
    window.SimoWebsiteBuilderRecoveryZ49=api;
    window.SimoWebsiteBuilderRecoveryZ82=api;
    window.SimoWebsiteBuilderRecoveryZ83=api;
    window.SimoWebsiteBuilderRecoveryZ88=api;
    window.SimoWebsiteBuilderRecoveryZ89=api;
    window.SimoWebsiteZ82=api;
    window.SimoWebsiteZ83=api;
    window.SimoWebsiteZ89=api;
  }
  // Website ownership must begin at WINDOW capture. Older visual/design routers also
  // listen on window capture, which runs before document capture. Because this owner
  // loads first in index.html, registering here first guarantees explicit website/app
  // requests are stopped before Design Workspace or concept-card handlers can claim them.
  window.addEventListener('click',handleClick,true);
  window.addEventListener('keydown',handleSend,true);
  window.addEventListener('click',handleSend,true);
  window.addEventListener('submit',handleSend,true);
  // Keep document listeners as a defensive fallback for synthetic/non-bubbling paths.
  document.addEventListener('click',handleClick,true);
  document.addEventListener('keydown',handleSend,true);
  document.addEventListener('click',handleSend,true);
  document.addEventListener('submit',handleSend,true);
  var api={version:VERSION,build:build,buildFromPrompt:build,openLibrary:openLibrary,openEditor:openEditor,readAllProjects:savedProjects,syncServerLibrary:syncServerLibrary,saveProject:saveProject,isWebsiteIntent:isWebsiteIntent};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();

  purgeBuilderDesignSuggestions(document);
  try{
    var simoBuilderObserver=new MutationObserver(function(muts){muts.forEach(function(mu){Array.prototype.forEach.call(mu.addedNodes||[],function(n){if(n&&n.nodeType===1)purgeBuilderDesignSuggestions(n);});});});
    simoBuilderObserver.observe(document.documentElement||document.body,{childList:true,subtree:true});
  }catch(_){}
})();
