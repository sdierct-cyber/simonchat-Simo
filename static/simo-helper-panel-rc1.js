/* Simo Helper RC1 — isolated dashboard guidance, no network calls or account gates. */
(function () {
  'use strict';
  if (window.__SIMO_HELPER_PANEL_RC1__) return;
  window.__SIMO_HELPER_PANEL_RC1__ = true;
  function init() {
    const composer = document.querySelector('.composer-wrap');
    const mic = document.getElementById('simoMicBtn') || document.getElementById('micBtn');
    const input = document.getElementById('chatInput');
    if (!composer || !mic || !input || document.getElementById('simoHelpfulStarRC1')) return;
    const styles = document.createElement('style');
    styles.id = 'simoHelpfulStarStylesRC1';
    styles.textContent = `
      #simoHelpfulStarRC1 {order:3!important;position:static!important;flex:0 0 42px!important;width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;display:inline-flex!important;align-items:center;justify-content:center;padding:0!important;margin:0!important;border:1px solid rgba(94,225,190,.55);border-radius:14px;background:rgba(5,52,49,.85);color:#ffe69b;cursor:pointer;font-size:23px;}
      #simoHelpfulStarRC1:focus-visible,#simoHelpfulPanelRC1 button:focus-visible{outline:2px solid #7cdbff;outline-offset:3px;}
      #simoHelpfulPanelRC1{position:fixed;z-index:21050;right:16px;bottom:91px;width:min(370px,calc(100vw - 32px));max-height:min(510px,calc(100dvh - 118px));overflow:auto;box-sizing:border-box;border:1px solid rgba(112,194,244,.42);border-radius:18px;background:#0a1b2d;box-shadow:0 16px 60px rgba(0,0,0,.6);padding:18px;color:#eaf5ff;font:14px/1.5 system-ui,sans-serif;}
      #simoHelpfulPanelRC1[hidden]{display:none!important;}
      #simoHelpfulPanelRC1 h2{font-size:19px;margin:0;color:#fff;}
      #simoHelpfulPanelRC1 p{margin:7px 0 12px;color:#c5d9ec;}
      #simoHelpfulPanelRC1 .simo-helper-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
      #simoHelpfulPanelRC1 button{cursor:pointer;color:#edf7ff;background:#12304a;border:1px solid rgba(120,200,245,.35);border-radius:10px;padding:9px 11px;text-align:left;font:inherit;}
      #simoHelpfulPanelRC1 .simo-helper-close{padding:5px 11px;font-size:20px;}
      #simoHelpfulPanelRC1 .simo-helper-prompts{display:grid;gap:8px;}
      #simoHelpfulPanelRC1 .simo-helper-prompts button:hover{background:#1a4262;}
      @media(max-width:520px){#simoHelpfulPanelRC1{right:8px;bottom:86px;width:calc(100vw - 16px);}}
    `;
    document.head.appendChild(styles);
    // Hide only the retired composer star, not the existing builder suggestion controls.
    const oldStar = document.getElementById('simoProHelperToggleBtn');
    if (oldStar) {oldStar.hidden = true; oldStar.style.setProperty('display','none','important');}
    const btn = document.createElement('button');
    btn.id = 'simoHelpfulStarRC1';
    btn.type = 'button';
    btn.textContent = '✦';
    btn.title = 'Open Simo Helper';
    btn.setAttribute('aria-label','Open Simo Helper');
    btn.setAttribute('aria-expanded','false');
    btn.setAttribute('aria-controls','simoHelpfulPanelRC1');
    mic.insertAdjacentElement('beforebegin',btn);
    const panel = document.createElement('section');
    panel.id='simoHelpfulPanelRC1';
    panel.hidden=true;
    panel.setAttribute('aria-label','Simo Helper');
    panel.innerHTML = '<div class="simo-helper-head"><h2>✦ Simo Helper</h2><button type="button" class="simo-helper-close" aria-label="Close Simo Helper">×</button></div><p>Choose an idea to place it in your message box, then press Send when ready.</p><div class="simo-helper-prompts"></div>';
    const suggestions = [
      ['Build a website','Build a polished website for my business. Ask me what you need to begin.'],
      ['Create a business idea','Help me develop a business idea, customers, pricing, and first steps.'],
      ['Design an image','Help me plan a premium visual design and explain how to create it in Simo.'],
      ['Write a story or book','Help me outline an original story or book, starting with its audience and genre.'],
      ['Make a video','Help me plan a cinematic Simo video with scenes, voiceover, and music.'],
      ['How do I use Simo?','Explain Simo’s available features and guide me through my first project.']
    ];
    const promptWrap = panel.querySelector('.simo-helper-prompts');
    suggestions.forEach(function (entry) {
      const choice = document.createElement('button');
      choice.type='button';
      choice.textContent=entry[0];
      choice.addEventListener('click',function(){
        input.value=entry[1];
        input.dispatchEvent(new Event('input',{bubbles:true}));
        setOpen(false);
        input.focus();
      });
      promptWrap.appendChild(choice);
    });
    document.body.appendChild(panel);
    function setOpen(open){
      panel.hidden=!open;
      btn.setAttribute('aria-expanded',open?'true':'false');
      btn.setAttribute('aria-label',open?'Close Simo Helper':'Open Simo Helper');
      btn.title=open?'Close Simo Helper':'Open Simo Helper';
    }
    btn.addEventListener('click',function(){setOpen(panel.hidden);});
    panel.querySelector('.simo-helper-close').addEventListener('click',function(){setOpen(false);btn.focus();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden){setOpen(false);btn.focus();}});
    document.addEventListener('pointerdown',function(e){if(!panel.hidden&&!panel.contains(e.target)&&!btn.contains(e.target))setOpen(false);});
    // Older script may create the Pro-only star after an account-status request.
    const observer = new MutationObserver(function(){
      const legacy=document.getElementById('simoProHelperToggleBtn');
      if(legacy && legacy.style.display !== 'none') {legacy.hidden=true;legacy.style.setProperty('display','none','important');}
    });
    observer.observe(composer,{childList:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
