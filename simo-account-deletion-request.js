/* R10.66: separate account-deletion REQUEST UI, never auto-deletes. */
(()=>{ 'use strict';
  const entry=document.getElementById('simoAccountDeletionOpenR1066'); if(!entry)return;
  const dialog=document.createElement('dialog');dialog.id='simoDeletionRequestDialogR1066';
  dialog.style.cssText='border:1px solid #6584a1;border-radius:15px;max-width:min(94vw,460px);background:#071b2b;color:#f0f7ff;padding:22px;box-shadow:0 16px 60px #0009';
  dialog.innerHTML=`<div style="font:inherit"><h3 style="margin-top:0">Request deletion of your Simo account</h3>
    <p>This submits an account-deletion request for review. <strong>It does not immediately delete your account, stop Stripe billing, or remove data.</strong></p>
    <p>Before deletion, saved projects, published sites, credits, paid plans, messages and calling handles must be reviewed. To manage an active subscription, use your existing billing controls.</p>
    <p id="simoDeleteAccountEmailR1066" style="overflow-wrap:anywhere"></p>
    <label for="simoDeleteAccountConfirmR1066">Type <strong>DELETE MY SIMO ACCOUNT</strong> to confirm:</label>
    <input id="simoDeleteAccountConfirmR1066" autocomplete="off" spellcheck="false" style="display:block;width:100%;box-sizing:border-box;padding:12px;margin:10px 0;background:#102e47;border:1px solid #7ba1c0;border-radius:8px;color:white">
    <p id="simoDeleteAccountStatusR1066" aria-live="polite"></p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" id="simoDeleteAccountSubmitR1066">Submit deletion request</button>
    <button type="button" id="simoDeleteAccountCloseR1066">Cancel</button></div>
    <p><a style="color:#9dd6ff" href="/privacy" target="_blank" rel="noopener">Privacy Policy and contact form</a></p></div>`;
  dialog.querySelectorAll('button').forEach(b=>b.style.cssText='padding:10px;border:1px solid #6b9fc4;background:#174568;border-radius:8px;color:white;cursor:pointer');
  document.body.appendChild(dialog);
  const status=dialog.querySelector('#simoDeleteAccountStatusR1066');
  const input=dialog.querySelector('#simoDeleteAccountConfirmR1066');
  const submit=dialog.querySelector('#simoDeleteAccountSubmitR1066');
  let token='';
  entry.addEventListener('click',async()=>{
    token='';status.textContent='';input.value='';
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    try{const r=await fetch('/api/simo-account/deletion-request',{credentials:'same-origin'});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to verify account');
      token=d.csrf;dialog.querySelector('#simoDeleteAccountEmailR1066').textContent='Signed in as: '+d.email;
    }catch(e){status.textContent=e.message;}
  });
  dialog.querySelector('#simoDeleteAccountCloseR1066').addEventListener('click',()=>dialog.close());
  submit.addEventListener('click',async()=>{
    if(!token){status.textContent='Account confirmation is not available. Sign in again.';return;}
    if(input.value.trim()!=='DELETE MY SIMO ACCOUNT'){status.textContent='Enter the exact confirmation phrase.';return;}
    submit.disabled=true;status.textContent='Submitting request…';
    try{const r=await fetch('/api/simo-account/deletion-request',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:token,confirmation:input.value.trim()})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');
      token='';status.textContent=d.already_requested?'Your deletion request is already pending review.':'Your account-deletion request was saved for review. Your account is still active.';
    }catch(e){status.textContent=e.message;}finally{submit.disabled=false;}
  });
})();
