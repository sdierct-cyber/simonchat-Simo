/* SIMO LOCAL SIDEBAR TOGGLE 003 — POSITION FIX 004
   Only controls appearance of .app-shell/.sidebar at desktop widths.
   Does not replace DOM nodes, intercept chat events, or touch feature scripts.
   Remove this script tag from index.html to uninstall. */
(function () {
  'use strict';
  if (window.__SIMO_SIDEBAR_LOCAL_003__) return;
  window.__SIMO_SIDEBAR_LOCAL_003__ = true;

  function start() {
    const shell = document.querySelector('.app-shell');
    const sidebar = shell && shell.querySelector(':scope > .sidebar');
    if (!shell || !sidebar || document.getElementById('simoSidebarToggle003')) return;

    const css = document.createElement('style');
    css.id = 'simoSidebarToggleStyle003';
    css.textContent = `
      #simoSidebarToggle003 {
        position: fixed; top: 11px; left: 10px;
        width: 34px; height: 34px; z-index: 21000;
        display: grid; place-items: center;
        border: 1px solid rgba(84,168,226,.4);
        border-radius: 10px; color: #d9f3ff;
        background: rgba(4,25,44,.93);
        box-shadow: 0 5px 16px rgba(0,0,0,.24);
        cursor: pointer; padding: 0;
        font-family: sans-serif; font-size: 19px; line-height: 1;
      }
      #simoSidebarToggle003:focus-visible { outline: 2px solid #6edfff; outline-offset: 2px; }
      #simoSidebarToggle003:hover { border-color: #55c6ff; background: #0a3755; }
      @media (min-width: 981px) {
        body.simo-sidebar-collapsed-003 .app-shell { grid-template-columns: 0 minmax(0,1fr) !important; }
        body.simo-sidebar-collapsed-003 .app-shell > .sidebar {
          visibility: hidden !important; pointer-events:none !important;
          overflow:hidden !important; padding:0 !important; border:0 !important;
        }
        /* Reserve a small, fixed slot for the reopen button so it cannot cover the greeting. */
        body.simo-sidebar-collapsed-003 .simo-premium-topbar .simo-topbar-greeting {
          margin-left: 46px !important;
        }
      }
      @media (max-width: 980px) {
        #simoSidebarToggle003 { display:none !important; }
      }
    `;
    document.head.appendChild(css);
    const toggle = document.createElement('button');
    toggle.id = 'simoSidebarToggle003';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', 'simo-sidebar-panel-003');
    sidebar.id = sidebar.id || 'simo-sidebar-panel-003';
    toggle.setAttribute('aria-controls', sidebar.id);

    let closed = false;
    try { closed = localStorage.getItem('simo_sidebar_collapsed_local_003') === '1'; }
    catch (_) {}

    function render() {
      document.body.classList.toggle('simo-sidebar-collapsed-003', closed);
      toggle.textContent = closed ? '☰' : '❮';
      toggle.title = closed ? 'Show Simo sidebar' : 'Hide Simo sidebar';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.setAttribute('aria-expanded', closed ? 'false' : 'true');
      sidebar.setAttribute('aria-hidden', closed ? 'true' : 'false');
      // Disallow focus on hidden navigation while collapsed.
      if ('inert' in sidebar) sidebar.inert = closed;
    }
    toggle.addEventListener('click', function () {
      closed = !closed;
      try { localStorage.setItem('simo_sidebar_collapsed_local_003', closed ? '1' : '0'); }
      catch (_) {}
      render();
    });
    document.body.appendChild(toggle);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
